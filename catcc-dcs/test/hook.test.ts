// Runs the real CATCC hook + sampler under fengari (Lua 5.3 in JS) with mocked DCS APIs.
// DCS itself is Lua 5.1: the hook avoids 5.2+ features; the harness shims math.atan2.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const dir = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(dir, p), 'utf8');

function runHarness(): { label: string; payload: string }[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [name, file] of [['HOOK_SRC', 'Scripts/CATCC/catcc.lua'], ['SAMPLER_SRC', 'Scripts/CATCC/sampler.lua']]) {
    lua.lua_pushstring(L, to_luastring(read(file)));
    lua.lua_setglobal(L, to_luastring(name));
  }
  const status = lauxlib.luaL_dostring(L, to_luastring(read('test/harness.lua')));
  const out = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(out);
  return out.split('\n').map((l) => {
    const i = l.indexOf('\t');
    return { label: l.slice(0, i), payload: l.slice(i + 1) };
  });
}

const t = runHarness();
const msgs = (label: string) => t.filter((x) => x.label === label).map((x) => JSON.parse(x.payload));
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('CATCC DCS hook', () => {
  it('refuses a bad token and closes the connection', () => {
    expect(msgs('bad').map((m) => m.type)).toEqual(['hello', 'error']);
    expect(t.find((x) => x.label === 'badClosed')?.payload).toBe('true');
  });

  it('authenticates and sends nothing but status before the mission runs', () => {
    expect(msgs('pre')).toEqual([
      { type: 'hello', proto: 1, version: '0.1.0', server: 'Test' },
      { type: 'auth', ok: true },
      { type: 'mission', state: 'stopped', name: 'Cruise Wk6' },
    ]);
  });

  it('streams frames at the configured rate once the mission runs', () => {
    const run = msgs('run');
    expect(run[0]).toMatchObject({ type: 'mission', state: 'running' });
    const frames = run.filter((m) => m.type === 'frame');
    expect(frames.map((f) => f.seq)).toEqual([1, 2]);
    const f = frames[0];
    expect(f).toMatchObject({ mt: 123.5, abs: 43200, date: '2026-11-08', theatre: 'PersianGulf', unitErrors: 0 });
    expect(f.units).toHaveLength(3);
  });

  it('reports true-north heading/course, groundspeed, fuel and identity', () => {
    const f = msgs('run').find((m) => m.type === 'frame');
    const hornet = f.units.find((u: { t: string }) => u.t === 'FA-18C_hornet');
    expect(hornet).toMatchObject({ id: 2001, g: 'Volt 3', s: 2, c: 'A', p: 'Volt 3-1 | 401 "Ace"', f: 0.62, air: true });
    expect(angleDiff(hornet.hdg, 345)).toBeLessThan(0.2);
    expect(angleDiff(hornet.crs, 343.5)).toBeLessThan(0.2);
    expect(hornet.gs / (1852 / 3600)).toBeCloseTo(420, 0);
    expect(hornet.vs).toBe(-15);
    expect(hornet.lat).toBeGreaterThan(26);

    const cv = f.units.find((u: { t: string }) => u.t === 'CVN_72');
    expect(cv.c).toBe('S');
    expect(cv.f).toBeUndefined();
    expect(angleDiff(cv.hdg, 70)).toBeLessThan(0.2);
    // wind blowing TOWARD 250 true is FROM 070
    expect(cv.wx).toMatchObject({ d0: 70, s0: 10, d2: 70, s2: 20, qnh: 101325 });
    expect(cv.wx.tK).toBeCloseTo(288.15, 0);

    const helo = f.units.find((u: { t: string }) => u.t === 'SH-60B');
    expect(helo.crs).toBeNull(); // stationary: no course
  });

  it('reinstalls the sampler after the mission environment resets', () => {
    expect(msgs('reset').filter((m) => m.type === 'frame').length).toBeGreaterThanOrEqual(1);
  });

  it('drops clients that never authenticate', () => {
    expect(t.find((x) => x.label === 'idleClosed')?.payload).toBe('true');
  });

  it('announces mission stop', () => {
    expect(msgs('stop').at(-1)).toMatchObject({ type: 'mission', state: 'stopped' });
  });
});
