// The tractor drivers' head (catcc-dcs/deck-test/crew-test/DRIVER-HEAD.md):
//   * Scripts/CATCC/crewtest_head.lua under fengari: where a driver looks while his tractor backs, drives and stands,
//     how often that is said to the native module, and the calls it makes of a stand-in for it;
//   * deck-test/crew-test/model/driver_head.py against this PC's DCS (skipped where DCS is not installed): the poses
//     made from the pilot figure's look-round clip, read back, and read by DCS's own Assimp; the blend space file.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const here = (p: string) => path.resolve(__dirname, p);
const HEAD_SRC = fs.readFileSync(here('../Scripts/CATCC/crewtest_head.lua'), 'utf8');

const PRELUDE = `
local out = {}
local function rec(s) out[#out + 1] = s end
local H = assert(load(HEAD_SRC, 'crewtest_head'))()
local DT = 1 / 60
-- a tractor: where it is, the way it faces (degrees, 0 = forward along x, + turning right), driven a frame at a time
local function tractor(name)
  local T = { x = 0, z = 0, hdg = 0, t = 0, st = H.new(name), sent = {}, last = nil }
  function T:face() local a = math.rad(self.hdg) return math.cos(a), math.sin(a) end
  -- v m/s along its heading (negative: backing), w degrees a second, for secs; aim(T) -> ax, az or nil
  function T:go(v, w, secs, aim)
    for _ = 1, math.floor(secs / DT + 0.5) do
      self.hdg = self.hdg + w * DT
      local hx, hz = self:face()
      self.x, self.z = self.x + hx * v * DT, self.z + hz * v * DT
      self.t = self.t + DT
      local ax, az
      if aim then ax, az = aim(self) end
      local y = H.step(self.st, self.t, self.x, self.z, hx, hz, ax, az)
      if y then self.sent[#self.sent + 1] = { t = self.t, y = y } self.last = y end
    end
  end
  function T:since(t0)
    local lo, hi, n = math.huge, -math.huge, 0
    for _, s in ipairs(self.sent) do if s.t > t0 then n = n + 1 lo = math.min(lo, s.y) hi = math.max(hi, s.y) end end
    return n, lo, hi
  end
  return T
end
-- the point d metres ahead of the tractor, b degrees to the right of its heading
local function ahead(d, b) return function(T) local a = math.rad(T.hdg + b) return T.x + d * math.cos(a), T.z + d * math.sin(a) end end
`;

function run(script: string): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(HEAD_SRC));
  lua.lua_setglobal(L, to_luastring('HEAD_SRC'));
  if (lauxlib.luaL_dostring(L, to_luastring(`${PRELUDE}\n${script}\nOUT = table.concat(out, '\\n')`)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1).split('\n');
}
const nums = (line: string) => line.split(' ').map(Number);

describe("the tractor drivers' head: where a driver looks (crewtest_head.lua)", () => {
  it('backing: over the right shoulder, 100 degrees, within half a second of the tractor moving; kept through a short stop; ahead again once it stands', () => {
    const r = run(`
local T = tractor('catcc-t0')
T:go(0, 0, 1)
rec(string.format('%g', T.last))
local t0 = T.t
T:go(-0.8, 0, 0.5)
rec(string.format('%g %d', T.last, T:since(t0)))
T:go(-0.8, 0, 30)
local n, lo, hi = T:since(t0)
rec(string.format('%d %g %g', n, lo, hi))
local t1 = T.t
T:go(0, 0, 0.4)           -- a short stop
T:go(-0.8, 0, 2)
local n2, lo2 = T:since(t1)
rec(string.format('%g', lo2 == math.huge and 100 or lo2))
local t2 = T.t
T:go(0, 0, 1.5)           -- it stands
rec(string.format('%g %s', T.last, T.st.mode))
`);
    expect(r[0]).toBe('0');
    // (said once: 100)
    expect(r[1]).toBe('100 1');
    // 30 s of backing: he eases off a few degrees now and then (92 .. 100), a handful of calls
    const [n, lo, hi] = nums(r[2]);
    expect(hi).toBe(100);
    expect(lo).toBeGreaterThanOrEqual(92);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(12);
    // the short stop: never below 92
    expect(Number(r[3])).toBeGreaterThanOrEqual(92);
    expect(r[4]).toBe('0 still');
  });

  it('pushing an aircraft back: he looks at where the aircraft is going, steadily, whatever his own way; no looks round; as before once the point is no longer given', () => {
    // (the user, 2026-11-23: "a driver that is pushing an aircraft back should be looking toward where the aircraft is
    // going, not randomly looking side to side or looking to where the tug is going")
    const r = run(`
local T = tractor('catcc-t1')
-- driving forward at 1 m/s for 40 s with his own way bending LEFT (aim 30 degrees left), the aircraft's goal 60 degrees to his RIGHT
local hx, hz = T:face()
for _ = 1, 40 * 60 do
  T.x, T.z, T.t = T.x + hx * DT, T.z + hz * DT, T.t + DT
  local px, pz = T.x + 20 * math.cos(math.rad(60)), T.z + 20 * math.sin(math.rad(60))
  local y = H.step(T.st, T.t, T.x, T.z, hx, hz, T.x + 9 * math.cos(math.rad(-30)), T.z + 9 * math.sin(math.rad(-30)), px, pz)
  if y then T.sent[#T.sent + 1] = { t = T.t, y = y } end
end
local n, lo, hi = T:since(1)
rec(string.format('%d %d %d', n, lo == math.huge and 0 or lo, hi == -math.huge and 0 or hi))
rec(tostring(T.sent[1] and T.sent[1].y))
-- a goal straight behind him: as far round as the poses go, to the side it is on
local B = tractor('catcc-t2')
local y1 = H.step(B.st, 1, 0, 0, 1, 0, nil, nil, -20, 1)
local C2 = tractor('catcc-t3')
local y2 = H.step(C2.st, 1, 0, 0, 1, 0, nil, nil, -20, -1)
rec(tostring(y1) .. ' ' .. tostring(y2))
-- the point no longer given: driving on, he looks into his own turn again
T:go(1, 0, 3, ahead(9, -30))
rec(tostring(T.last))`);
    // (60 degrees right all the while: said once, never anything else in 40 s)
    expect(r[1]).toBe('60');
    expect(nums(r[0]).slice(1)).toEqual([0, 0]);
    expect(r[2]).toBe('100 -100');
    expect(Number(r[3])).toBe(-27);
  });

  it('backing while the tractor turns, and a tractor that backs fast or slowly: the same look', () => {
    const r = run(`
for _, c in ipairs({ { -0.3, 0 }, { -1.4, 0 }, { -0.8, 25 }, { -0.8, -25 } }) do
  local T = tractor('catcc-t3')
  T:go(0, 0, 1)
  T:go(c[1], c[2], 1)
  rec(string.format('%g %s', T.last, T.st.mode))
end
`);
    expect(r).toEqual(['100 rev', '100 rev', '100 rev', '100 rev']);
  });

  it('driving: he looks towards the point of his way ahead, into a turn before the tractor has begun it; no further than 70 degrees', () => {
    const r = run(`
local T = tractor('catcc-t1')
T:go(0, 0, 1)
T:go(1.4, 0, 1, ahead(9, 0))
rec(string.format('%g %s', T.last, T.st.mode))
local hdg = T.hdg
T:go(1.4, 0, 1, ahead(9, 40))      -- the way bends 40 degrees to the right ahead; the tractor still goes straight
rec(string.format('%g %g', T.last, T.hdg - hdg))
T:go(1.4, 0, 1, ahead(9, -30))
rec(string.format('%g', T.last))
T:go(1.4, 0, 1, ahead(9, 120))
rec(string.format('%g', T.last))
T:go(1.4, 0, 1, ahead(9, 5))       -- nearly straight: ahead
rec(string.format('%g', T.last))
`);
    expect(r[0]).toBe('0 fwd');
    expect(r[1]).toBe('36 0');
    expect(r[2]).toBe('-27');
    expect(r[3]).toBe('70');
    expect(r[4]).toBe('0');
  });

  it('driving with no point given: into the turn the tractor is making (its turn rate, 1.5 s ahead)', () => {
    const r = run(`
local T = tractor('catcc-t1')
T:go(1.4, 0, 2)
T:go(1.4, 20, 2)
rec(string.format('%.0f', T.last))
T:go(1.4, -20, 2)
rec(string.format('%.0f', T.last))
`);
    expect(Number(r[0])).toBeGreaterThanOrEqual(26);
    expect(Number(r[0])).toBeLessThanOrEqual(31);
    expect(Number(r[1])).toBeLessThanOrEqual(-26);
    expect(Number(r[1])).toBeGreaterThanOrEqual(-31);
  });

  it('on a straight and standing: ahead, with a look to one side now and then (35 to 75 degrees), and back; never while he looks into a turn', () => {
    const r = run(`
local function looks(T, t0)
  local n, most, least, zero = 0, 0, math.huge, 0
  for _, s in ipairs(T.sent) do
    if s.t > t0 then
      if s.y == 0 then zero = zero + 1 else n = n + 1 most = math.max(most, math.abs(s.y)) least = math.min(least, math.abs(s.y)) end
    end
  end
  return n, least, most, zero
end
local T = tractor('catcc-t2')
T:go(1.4, 0, 120, ahead(9, 0))
rec(string.format('%d %.1f %.1f %d', looks(T, 2)))
local S = tractor('catcc-t2')
S:go(0, 0, 120)
rec(string.format('%d %.1f %.1f %d', looks(S, 2)))
-- both sides are looked to
local l, rr = 0, 0
for _, s in ipairs(S.sent) do if s.y < 0 then l = l + 1 elseif s.y > 0 then rr = rr + 1 end end
rec(string.format('%s %s', tostring(l > 0), tostring(rr > 0)))
-- into a turn for a minute: nothing but the turn
local U = tractor('catcc-t2')
U:go(1.4, 0, 1, ahead(9, 45))
local t0 = U.t
U:go(1.4, 0, 60, ahead(9, 45))
rec(string.format('%d', (U:since(t0))))
`);
    // driving 2 minutes: a look every 6 to 12 s (and about a second long): 9 to 20 of them, each followed by "ahead"
    const [n, least, most, zero] = nums(r[0]);
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(20);
    expect(least).toBeGreaterThanOrEqual(35);
    expect(most).toBeLessThanOrEqual(75);
    expect(zero).toBeGreaterThanOrEqual(n - 1); // (the last one may not be over when the two minutes are)
    expect(zero).toBeLessThanOrEqual(n);
    // standing 2 minutes: every 4 to 9 s, a second or two long, sometimes straight on to the other side
    const [n2, least2, most2, zero2] = nums(r[1]);
    expect(n2).toBeGreaterThanOrEqual(10);
    expect(n2).toBeLessThanOrEqual(34);
    expect(least2).toBeGreaterThanOrEqual(35);
    expect(most2).toBeLessThanOrEqual(75);
    expect(zero2).toBeLessThanOrEqual(n2);
    expect(zero2).toBeGreaterThanOrEqual(n2 / 2);
    expect(r[2]).toBe('true true');
    expect(r[3]).toBe('0');
  });

  it("a run plays the same way every time (what is random comes from the driver's name); two drivers do not look round together", () => {
    const r = run(`
local function row(name)
  local T = tractor(name)
  T:go(0, 0, 60)
  local s = {}
  for _, e in ipairs(T.sent) do s[#s + 1] = string.format('%.2f:%.1f', e.t, e.y) end
  return table.concat(s, ' ')
end
rec(row('catcc-t0'))
rec(row('catcc-t0'))
rec(row('catcc-t1'))
`);
    expect(r[0]).toBe(r[1]);
    expect(r[0]).not.toBe(r[2]);
    expect(r[0].split(' ').length).toBeGreaterThan(5);
  });

  it('a pause moves nothing; a tractor put somewhere else is not taken to have backed there; the frame rate does not matter', () => {
    const r = run(`
local T = tractor('catcc-t0')
T:go(0, 0, 1)
local n0 = #T.sent
for _ = 1, 600 do local y = H.step(T.st, T.t, T.x, T.z, 1, 0) if y then T.sent[#T.sent + 1] = { t = T.t, y = y } end end
rec(string.format('%d', #T.sent - n0))
-- 40 m back along its heading in one frame (the demo puts a tractor away), then it stands
T.x = T.x - 40
T:go(0, 0, 0.5)
rec(string.format('%s %g', T.st.mode, T.last))
-- 20 frames a second
DT = 1 / 20
local U = tractor('catcc-t0')
U:go(0, 0, 1)
U:go(-0.8, 0, 1)
rec(string.format('%g %s', U.last, U.st.mode))
`);
    expect(r).toEqual(['0', 'still 0', '100 rev']);
  });
});

describe("the tractor drivers' head: with the native module (crewtest_head.lua)", () => {
  const NATIVE = `
local calls = {}
local has = true
local native = {
  play = function(h, name, mode) calls[#calls + 1] = string.format('play %s %s %s', h, name, mode) if has then return true end return nil, 'DCS has no animation called "' .. name .. '"' end,
  head = function(h, y, w) calls[#calls + 1] = 'head ' .. h .. (y and string.format(' %g', y) or '') .. (w and string.format(' w%g', w) or '') return true end,
  headtick = function() return 0, 0 end,
  anim = function(h) return { name = 'idle' } end,
  prop = function(h, name) return 12.5 end,
}
local function flush() local s = table.concat(calls, ' | ') calls = {} return s end
`;
  it('seated in the blend space when it is there, his head ahead; in the plain seated pose (nil, why) when it is not, with an older module, or switched off', () => {
    const r = run(`${NATIVE}
local d = { h = 'A', name = 'catcc-t0' }
rec(tostring(H.seat(native, d)) .. ' ' .. type(d.head) .. ' ' .. flush())
has = false
local ok, why = H.seat(native, d)
rec(tostring(ok) .. ' ' .. tostring(why) .. ' ' .. tostring(d.head) .. ' ' .. flush())
has = true
local old = { play = native.play, place = function() end }
ok, why = H.seat(old, d)
rec(tostring(ok) .. ' ' .. tostring(why) .. ' ' .. flush())
CATCC_HEAD_OFF = true
ok, why = H.seat(native, d)
rec(tostring(ok) .. ' ' .. tostring(why) .. ' ' .. flush())
`);
    expect(r[0]).toBe('true table play A catcc_bs_drv_look 2 | head A 0 w6');
    expect(r[1]).toBe('nil DCS has no animation called "catcc_bs_drv_look" nil play A catcc_bs_drv_look 2');
    expect(r[2]).toBe('nil the native module has no head / headtick ');
    expect(r[3]).toBe('nil switched off (CATCC_HEAD_OFF) ');
  });

  it('driven: the module is told only when his look changes (a tow of a minute and a half: a few dozen calls); a driver whose head does not turn costs nothing', () => {
    const r = run(`${NATIVE}
local d = { h = 'A', name = 'catcc-t0' }
H.seat(native, d)
flush()
local x, z, n = 0, 0, 0
local function drive(v, secs, ax, az)
  for _ = 1, math.floor(secs / DT + 0.5) do
    x = x + v * DT
    H.drive(native, d, DT, x, z, 1, 0, ax and x + ax or nil, ax and z + az or nil)
    n = n + 1
  end
end
drive(0, 2)
drive(-0.8, 10)                 -- backs out
local back = flush()
drive(0, 1.5)
drive(1.4, 20, 9, 0)            -- drives off, straight
drive(1.4, 6, 6.9, 5.8)         -- a bend to the right ahead (40 degrees)
drive(1.4, 20, 9, 0)
drive(0, 30)                    -- stands, hooked on
local rest = flush()
local nb, nr = select(2, back:gsub('head', '')), select(2, rest:gsub('head', ''))
rec(string.format('%d %d %d', n, nb, nr))
rec(back:match('head A 100') and 'right' or 'no')
rec(rest:match('head A 36') and 'into the turn' or 'no')
-- frames with nothing to say: no call at all
H.drive(native, d, DT, x, z, 1, 0)
rec('[' .. flush() .. ']')
-- a pause (no time passes), and a driver without a head
H.drive(native, d, 0, x, z, 1, 0)
H.drive(native, { h = 'B', name = 'catcc-t1' }, DT, 0, 0, 1, 0)
rec('[' .. flush() .. ']')
`);
    const [frames, nb, nr] = nums(r[0]);
    expect(frames).toBe(5370);
    expect(nb).toBeGreaterThanOrEqual(2); // ahead, then right (and a look or an easing off)
    expect(nb).toBeLessThanOrEqual(8);
    expect(nr).toBeGreaterThanOrEqual(6);
    expect(nr).toBeLessThanOrEqual(40);
    expect(r[1]).toBe('right');
    expect(r[2]).toBe('into the turn');
    expect(r[3]).toBe('[]');
    expect(r[4]).toBe('[]');
  });

  it("standing tractors' drivers are looked at four times a second, and only those nobody drives; unseated: the module forgets his head", () => {
    const r = run(`${NATIVE}
local tugs = { { driver = { h = 'A', name = 'catcc-t0' } }, { driver = { h = 'B', name = 'catcc-t1' } }, { driver = { h = 'C', name = 'catcc-t2' } }, {} }
H.seat(native, tugs[1].driver)
H.seat(native, tugs[2].driver)   -- (C's head does not turn: never seated in the blend space)
flush()
local steps = 0
local real = H.step
H.step = function(...) steps = steps + 1 return real(...) end
local x = 0
for i = 1, 3600 do              -- a minute: A is driven (backing), B and C stand
  local t = i * DT
  x = x - 0.8 * DT
  H.drive(native, tugs[1].driver, DT, x, 0, 1, 0)
  H.idle(native, tugs, t)
end
local s = flush()
rec(string.format('%d', steps))
local a, b, c = select(2, s:gsub('head A', '')), select(2, s:gsub('head B', '')), select(2, s:gsub('head C', ''))
rec(string.format('%s %s %d', tostring(a >= 1 and a <= 20), tostring(b >= 4 and b <= 40), c))
rec(s:match('head A 100') and 'A right' or 'no')
rec(s:match('head B 100') and 'B right' or 'B looks round')
H.unseat(native, tugs[2].driver)
H.unseat(native, tugs[3].driver)
rec(flush() .. ' ' .. tostring(tugs[2].driver.head))
`);
    // A: 3600 frames; B: four times a second for a minute (239 or 240)
    const steps = Number(r[0]);
    expect(steps).toBeGreaterThanOrEqual(3600 + 236);
    expect(steps).toBeLessThanOrEqual(3600 + 241);
    expect(r[1]).toBe('true true 0');
    expect(r[2]).toBe('A right');
    expect(r[3]).toBe('B looks round');
    expect(r[4]).toBe('head B nil');
  });

  it('the probe (F10 > Tow > Driver seat > Head ...): every driver seated in the blend space and sent there; what the user is told', () => {
    const r = run(`${NATIVE}
local drivers = { { h = 'A', name = 'catcc-t0' }, { h = 'B', name = 'catcc-t1' } }
local text, log = H.probe(native, drivers, 'right')
rec(text)
rec(flush())
rec(log[1])
rec((H.probe(native, drivers, 'left')))
rec((H.probe(native, drivers, 'ahead')))
flush()
rec((H.probe(native, drivers, 'report')))
rec('[' .. flush() .. ']')
has = false
rec((H.probe(native, drivers, 'right')))
rec((H.probe(native, {}, 'right')))
rec((H.probe({ play = native.play }, drivers, 'right')))
`);
    expect(r[0]).toBe('driver head: 2 of 2 driver(s) now turn their heads to their RIGHT, 100 degrees: over his right shoulder, as when backing. It should take about a second, smoothly.');
    expect(r[1]).toBe('play A catcc_bs_drv_look 2 | head A 100 w6 | play B catcc_bs_drv_look 2 | head B 100 w6');
    expect(r[2]).toBe('driver head: catcc-t0 plays "catcc_bs_drv_look"; "catcc_head_yaw" reads 12.5');
    expect(r[3]).toContain('to their LEFT, 100 degrees');
    expect(r[4]).toContain('to their AHEAD');
    expect(r[5]).toBe('driver head: 2 driver(s); what each plays and where his head is: in the log.');
    expect(r[6]).toBe('[]');
    expect(r[7]).toBe('driver head: NOT TURNED: the blend space "catcc_bs_drv_look" could not be played (DCS has no animation called "catcc_bs_drv_look"). Installed with install.ps1 -DriverHead?');
    expect(r[8]).toBe('driver head: no drivers on this ship (catcc-t0 ..: the crew data patch).');
    expect(r[9]).toBe('driver head: the native module has no head / headtick (an older catcc_crew.dll).');
  });
});

// ---------------------------------------------------------------- the poses and the blend space (driver_head.py)
const DCS = 'C:\\Program Files\\Eagle Dynamics\\DCS World';
const SOURCE = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\animations\\animations\\typeV\\F18_39_Look_LR.fbx');
const TOOL = here('../deck-test/crew-test/model/driver_head.py');
const canMake = fs.existsSync(SOURCE) && spawnSync('python', ['--version']).status === 0;
const py = (args: string[]) => execFileSync('python', ['-I', TOOL, ...args], { encoding: 'utf8' });

describe.skipIf(!canMake)("the tractor drivers' head: the poses and the blend space (driver_head.py, from this PC's DCS)", () => {
  it("the pilot figure's look-round clip: read and written back byte for byte; its last frame is the turn to the RIGHT; the poses' angles", () => {
    const said = py(['--report']).trim().split(/\r?\n/);
    expect(said[0]).toBe('source: 74 bones, 666 curves, 201 frames (6.67 s); written back unchanged: IDENTICAL');
    expect(said[1]).toMatch(/^source: frame 200 is the full turn to the RIGHT: head 112\.0 degrees \(of that the torso, at the top spine bone, 18\.5\); frame 0 to the left: head -111\.5 \(torso -18\.3\)$/);
    // at 100 degrees the torso is turned as far as the clip turns it (18.5), the neck and head do the rest (81.5)
    expect(said[2]).toMatch(/^pose catcc_drv_look_l100: axis -100: head -99\.8 degrees = torso -18\.3 \+ neck and head -81\.4 /);
    expect(said[3]).toMatch(/^pose catcc_drv_look_l050: axis -50: head -50\.0 degrees = torso -3\.\d \+ neck and head -4\d\.\d /);
    expect(said[4]).toMatch(/^pose catcc_drv_look_c000: axis \+0: head [+-]0\.0 degrees = torso [+-]0\.0 \+ neck and head [+-]0\.0 \(torso from frame 100\.0, neck from frame 100\.0\)$/);
    expect(said[5]).toMatch(/^pose catcc_drv_look_r050: axis \+50: head \+50\.0 degrees = torso \+3\.\d \+ neck and head \+4\d\.\d /);
    expect(said[6]).toMatch(/^pose catcc_drv_look_r100: axis \+100: head \+100\.0 degrees = torso \+18\.5 \+ neck and head \+81\.5 \(torso from frame 200\.0, neck from frame 182\.4\)$/);
  });

  it("five still poses and the blend space file are made; DCS's own Assimp reads each as one animation of 11 frames on 74 bones, the middle one's head as in F18_0_Init", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-driver-head-'));
    try {
      const said = py([out]).trim().split(/\r?\n/);
      expect(said[0]).toMatch(/^driver head: made catcc_drv_look_l100\.fbx \(\d+ bytes\), catcc_drv_look_l050\.fbx \(\d+ bytes\), catcc_drv_look_c000\.fbx \(\d+ bytes\), catcc_drv_look_r050\.fbx \(\d+ bytes\), catcc_drv_look_r100\.fbx \(\d+ bytes\), blend_space\/catcc_bs_drv_look\.lua$/);
      const names = ['catcc_drv_look_l100', 'catcc_drv_look_l050', 'catcc_drv_look_c000', 'catcc_drv_look_r050', 'catcc_drv_look_r100'];
      expect(fs.readdirSync(out).sort()).toEqual(['blend_space', ...names.map((n) => `${n}.fbx`)].sort());
      const seat = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\animations\\animations\\typeV\\F18_0_Init.fbx');
      const read = py(['--assimp', ...names.map((n) => path.join(out, `${n}.fbx`)), seat]).trim().split(/\r?\n/);
      const heads: string[] = [];
      read.forEach((line, i) => {
        const m = line.match(/^(\S+)\.fbx: Assimp: 1 animation, 10 frames at 30 a second, 74 bones, keys \[\(11, 11, 11\)\], a still pose; the head bone (.+)$/);
        expect(m, line).not.toBeNull();
        heads[i] = m![2];
      });
      // the middle pose's head is the seated pose's own (the driver does not twitch when the blend space takes over)
      expect(heads[2]).toBe(heads[5]);
      // the poses differ, and left mirrors right about the bone's own long axis (the quaternion's x)
      expect(new Set(heads.slice(0, 5)).size).toBe(5);
      const x = heads.map((h) => Number(h.split(' ')[1]));
      expect(x[0]).toBeGreaterThan(0.3);
      expect(x[4]).toBeLessThan(-0.3);
      expect(Math.abs(x[2])).toBeLessThan(0.001);

      // the blend space file: what animator.dll's Animation::load reads: a returned table, x_axis = { name, default_value },
      // then { x, animation } entries; named after the file; every pose it names was made, in lower case
      const file = fs.readFileSync(path.join(out, 'blend_space', 'catcc_bs_drv_look.lua'));
      expect(file.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      const L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      lua.lua_pushstring(L, to_luastring(file.toString('utf8')));
      lua.lua_setglobal(L, to_luastring('SRC'));
      const code = `local t = assert(load(SRC))()
local s = { t.type, t.x_axis.name, tostring(t.x_axis.default_value), tostring(t.y_axis), tostring(#t) }
for _, e in ipairs(t) do s[#s + 1] = e.x .. '=' .. e.animation .. (e.y and '!' or '') end
OUT = table.concat(s, ' ')`;
      if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
      lua.lua_getglobal(L, to_luastring('OUT'));
      expect(lua.lua_tojsstring(L, -1)).toBe('1D catcc_head_yaw 0 nil 5 -100=catcc_drv_look_l100 -50=catcc_drv_look_l050 0=catcc_drv_look_c000 50=catcc_drv_look_r050 100=catcc_drv_look_r100');
      // the names the hook plays and writes are the file's own
      expect(HEAD_SRC).toContain("ANIM = 'catcc_bs_drv_look', PARAM = 'catcc_head_yaw'");
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
