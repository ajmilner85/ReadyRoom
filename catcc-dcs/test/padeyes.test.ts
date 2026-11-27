// The flight deck's padeyes (the crew test panel's "Padeyes" page):
//   * the padeyes the panel starts from (Scripts/CATCC/crewtest_padeyes.lua) are what the deck drawing's Padeyes layer
//     gives now (deck-test/padeyes/padeyes.py), and land on DCS's own elevator platforms where the drawing has them;
//   * the tool (Scripts/CATCC/crewtest_padeye_tool.lua) under fengari: the dots on the screen, a click selecting one,
//     moves along the ship's axes for one / a group / all, add, remove, confirm, undo, the user's file and starting over.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const here = (p: string) => path.join(__dirname, p);
const toolSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_padeye_tool.lua'), 'utf8');
const dataSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_padeyes.lua'), 'utf8');
const map = JSON.parse(fs.readFileSync(here('../deck-test/hangar/hangar-map.json'), 'utf8'));

type Row = { n: number; g: number; x: number; z: number; k: number };
const rows: Row[] = [...dataSrc.matchAll(/\{ (\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (\d) \}/g)].map((m) => ({ n: +m[1], g: +m[2], x: +m[3], z: +m[4], k: +m[5] }));

const python = spawnSync('python', ['--version']).status === 0;

describe('the padeyes the panel starts from', () => {
  it.skipIf(!python)('are what the Padeyes layer of Nimitz.svg gives now (else: python -I catcc-dcs/deck-test/padeyes/padeyes.py)', () => {
    const r = spawnSync('python', ['-I', here('../deck-test/padeyes/padeyes.py'), '--check'], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toMatch(/is current: \d+ padeyes/);
    expect(r.status).toBe(0);
  });

  it('every one in a group (the flight deck, elevators 1 to 4), numbered in turn; some to confirm', () => {
    expect(rows.length).toBeGreaterThan(4000);
    expect(rows.map((r) => r.n)).toEqual(rows.map((_, i) => i + 1));
    for (const r of rows) expect([1, 2, 3, 4, 5]).toContain(r.g);
    expect(rows.filter((r) => r.k === 1).length).toBeGreaterThan(50);
    // (on the deck: within the ship's length and beam)
    for (const r of rows) {
      expect(r.x).toBeGreaterThan(-166);
      expect(r.x).toBeLessThan(169);
      expect(Math.abs(r.z)).toBeLessThan(42);
    }
  });

  it("each elevator's padeyes lie on that elevator's platform as DCS's models have it (hangar-map.json), to within 0.6 m", () => {
    for (const e of map.elevators as { elevator: number; x: [number, number]; z: [number, number] }[]) {
      const on = rows.filter((r) => r.g === e.elevator + 1 && r.k === 0);
      expect(on.length, `elevator ${e.elevator}`).toBeGreaterThan(60);
      for (const r of on) {
        expect(r.x, `padeye ${r.n} on elevator ${e.elevator}`).toBeGreaterThan(e.x[0] - 0.6);
        expect(r.x, `padeye ${r.n} on elevator ${e.elevator}`).toBeLessThan(e.x[1] + 0.6);
        expect(r.z, `padeye ${r.n} on elevator ${e.elevator}`).toBeGreaterThan(e.z[0] - 0.6);
        expect(r.z, `padeye ${r.n} on elevator ${e.elevator}`).toBeLessThan(e.z[1] + 0.6);
      }
    }
  });

  it("the deck's grid: next to each padeye of the flight deck, more than one more within 3 m (a grid some 2.4 m along, 1.5 m across)", () => {
    const deck = rows.filter((r) => r.g === 1 && r.k === 0);
    let lonely = 0;
    for (const r of deck) {
      const near = deck.filter((q) => q !== r && Math.hypot(q.x - r.x, q.z - r.z) < 3).length;
      if (near < 2) lonely++;
    }
    expect(lonely / deck.length).toBeLessThan(0.02);
  });
});

/** the tool under fengari: a little world of files, a clock and a camera; returns the lines rec() wrote */
function tool(script: string, data = dataSrc): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries({ TOOL_SRC: toolSrc, DATA_SRC: data, MODEL_SRC: MODEL_SMALL })) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  const pre = `
REC = {}
function rec(s) REC[#REC + 1] = tostring(s) end
FILES = { ['W/Scripts/CATCC/crewtest_padeyes.lua'] = DATA_SRC }
WRITES = 0
loadfile = function(p) local s = FILES[p] if s then return load(s, p) end return nil, 'no file ' .. p end
io = { open = function(p, mode)
  if mode ~= 'w' then return nil end
  local parts = {}
  return { write = function(self, s) parts[#parts + 1] = s end, close = function() FILES[p] = table.concat(parts) WRITES = WRITES + 1 end }
end }
os.date = function() return 'D' end
NOW = 0
LOGS = {}
API = { writedir = 'W/', log = function(s) LOGS[#LOGS + 1] = s end, now = function() return NOW end }
function newTool() return assert(load(TOOL_SRC, 'crewtest_padeye_tool'))(API) end
-- the camera 20 m above a deck at 20 m, looking straight down: the screen's right is starboard, its top forward;
-- 2000 x 1000, 90 degrees across (tanH 1, tanV 0.5): a point x forward, z to starboard is at 1000 + 50 z, 500 - 50 x
CAM = { o = { 0, 40, 0 }, f = { 0, -1, 0 }, r = { 0, 0, 1 }, u = { 1, 0, 0 }, sw = 2000, sh = 1000, tanH = 1, tanV = 0.5 }
DECK = 20
`;
  if (lauxlib.luaL_dostring(L, to_luastring(`${pre}\n${script}\nOUT = table.concat(REC, '\\n')`)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1).split('\n').filter((l: string) => l !== '');
}

// the model's padeyes for the tool's tests: two in view
const MODEL_SMALL = `return { groups = { 'Flight Deck' }, styles = { 'dark' }, list = { { 1, 1, 6.000, 0.500, 1 }, { 2, 1, 1.000, -4.000, 1 } } }`;

// a small deck: four on the flight deck (one to confirm), two on elevator 1
const SMALL = `return { groups = { 'Flight Deck', 'El 1', 'El 2', 'El 3', 'El 4' }, list = {
  { 1, 1, 2.000, 3.000, 0 },
  { 2, 1, 4.400, 3.000, 0 },
  { 3, 1, 2.000, -1.500, 1 },
  { 4, 1, 100.000, 0.000, 0 },
  { 5, 2, -2.000, 6.000, 0 },
  { 6, 2, -4.400, 6.000, 0 },
} }`;

describe('the padeye tool', () => {
  it('starts from the drawing\'s padeyes; draws those in front of the camera within reach, where they are on the screen', () => {
    const r = tool(`local P = newTool()
local d = P.project(CAM, DECK)
rec('loaded ' .. #P.load() .. ' from ' .. P.source)
local n, conf = P.counts()
rec('counts ' .. n .. ' ' .. conf)
table.sort(d, function(a, b) return a.e.n < b.e.n end)
for _, q in ipairs(d) do rec(string.format('dot %d at %.0f, %.0f %s', q.e.n, q.sx, q.sy, q.e.state)) end
-- (the camera turned away: nothing in front of it)
rec('looking up: ' .. #P.project({ o = CAM.o, f = { 0, 1, 0 }, r = CAM.r, u = { -1, 0, 0 }, sw = 2000, sh = 1000, tanH = 1, tanV = 0.5 }, DECK))`, SMALL);
    expect(r).toEqual([
      'loaded 6 from drawing',
      'counts 6 1',
      'dot 1 at 1150, 400 seen',
      'dot 2 at 1150, 280 seen',
      'dot 3 at 925, 400 confirm',
      'dot 5 at 1300, 600 seen',
      'dot 6 at 1300, 720 seen',
      'looking up: 0',
    ]);
  });

  it('only the nearest MAX_DOTS are drawn', () => {
    const r = tool(`local P = newTool()
P.MAX_DOTS = 2
local d = P.project(CAM, DECK)
table.sort(d, function(a, b) return a.e.n < b.e.n end)
for _, q in ipairs(d) do rec('dot ' .. q.e.n) end`, SMALL);
    expect(r).toEqual(['dot 1', 'dot 3']);
  });

  it('a click selects the dot nearest it, within 16 px; elsewhere nothing', () => {
    const r = tool(`local P = newTool()
P.project(CAM, DECK)
rec(P.pick(1158, 405))
rec(select(2, P.pick(1500, 100)))
rec(P.sel and P.sel.n)`, SMALL);
    expect(r).toEqual([
      'padeyes: selected padeye 1 (Flight Deck): 2.00 m forward, 3.00 to starboard.',
      'padeyes: no padeye there (click on a dot)',
      '1',
    ]);
  });

  it("moves along the ship's axes: the selected one, its group, or all; undone in turn", () => {
    const r = tool(`local P = newTool()
P.project(CAM, DECK)
rec(select(2, P.move(0.1, 0, 'one')))
P.pick(1300, 600)
rec(P.move(0.1, 0, 'one'))
rec(P.move(0, -0.01, 'one'))
rec(P.move(-1, 0, 'group'))
rec(P.move(0, 0.5, 'all'))
local function at() local t = {} for _, e in ipairs(P.list) do t[#t + 1] = string.format('%d:%.2f/%.2f', e.n, e.x, e.z) end return table.concat(t, ' ') end
rec(at())
rec(P.undo()) rec(at())
rec(P.undo()) rec(at())
rec(P.undo()) rec(P.undo()) rec(at())
rec(select(2, P.undo()))`, SMALL);
    expect(r).toEqual([
      'padeyes: nothing selected: click a dot first.',
      'padeyes: padeye 5 (El 1): -1.90 m forward, 6.00 to starboard; moved 0.10 m forward, 0.00 to starboard.',
      'padeyes: padeye 5 (El 1): -1.90 m forward, 5.99 to starboard; moved 0.10 m forward, -0.01 to starboard.',
      'padeyes: the 2 padeyes of El 1 moved -1.00 m forward, 0.00 to starboard.',
      'padeyes: all 6 padeyes moved 0.00 m forward, 0.50 to starboard.',
      '1:2.00/3.50 2:4.40/3.50 3:2.00/-1.00 4:100.00/0.50 5:-2.90/6.49 6:-5.40/6.50',
      'padeyes: undone (move).',
      '1:2.00/3.00 2:4.40/3.00 3:2.00/-1.50 4:100.00/0.00 5:-2.90/5.99 6:-5.40/6.00',
      'padeyes: undone (move).',
      '1:2.00/3.00 2:4.40/3.00 3:2.00/-1.50 4:100.00/0.00 5:-1.90/5.99 6:-4.40/6.00',
      'padeyes: undone (move).',
      'padeyes: undone (move).',
      '1:2.00/3.00 2:4.40/3.00 3:2.00/-1.50 4:100.00/0.00 5:-2.00/6.00 6:-4.40/6.00',
      'padeyes: nothing to undo.',
    ]);
  });

  it('confirms any padeye, once (one to confirm, or one seen: the confirmed are what padeyes.py --fit fits to); removes the selected one, which is then neither drawn nor counted; undo brings it back', () => {
    const r = tool(`local P = newTool()
P.project(CAM, DECK)
P.pick(1150, 400)
rec(P.sel.state)
rec(P.confirm())
rec(table.concat({ P.counts() }, ' '))
P.undo()
P.pick(925, 400)
rec(P.confirm())
rec(select(2, P.confirm()))
rec(P.remove())
rec(select(2, P.remove()))
rec(#P.project(CAM, DECK) .. ' drawn, ' .. P.counts() .. ' counted')
rec(P.undo())
rec(#P.project(CAM, DECK) .. ' drawn; selected ' .. tostring(P.sel and P.sel.n) .. ' ' .. P.sel.state)
rec(P.undo())
rec(P.sel.state)`, SMALL);
    expect(r).toEqual([
      'seen',
      'padeyes: confirmed padeye 1 (Flight Deck, confirmed): 2.00 m forward, 3.00 to starboard.',
      '6 1 1',
      'padeyes: confirmed padeye 3 (Flight Deck, confirmed): 2.00 m forward, -1.50 to starboard.',
      'padeyes: padeye 3 (Flight Deck, confirmed): 2.00 m forward, -1.50 to starboard: already.',
      'padeyes: removed padeye 3 (Flight Deck, confirmed): 2.00 m forward, -1.50 to starboard.',
      'padeyes: nothing selected: click a dot first.',
      '4 drawn, 5 counted',
      'padeyes: undone (remove).',
      '5 drawn; selected 3 confirmed',
      'padeyes: undone (confirm).',
      'confirm',
    ]);
  });

  it('adds one where a line of sight meets the deck, in the group of the padeye nearest it, selected; not where the line never meets the deck', () => {
    const r = tool(`local P = newTool()
rec(P.addAt(CAM.o, { 0.1, -1, 0.3 }, DECK))
rec(P.sel.n .. ' ' .. P.sel.state)
rec(P.addAt(CAM.o, { -0.2, -1, 0.3 }, DECK))
rec(select(2, P.addAt(CAM.o, { 1, 0, 0 }, DECK)))
rec(P.undo())
rec(P.counts())`, SMALL);
    expect(r).toEqual([
      'padeyes: added padeye 7 (Flight Deck, added): 2.00 m forward, 6.00 to starboard.',
      '7 added',
      'padeyes: added padeye 8 (Flight Deck, added): -4.00 m forward, 6.00 to starboard.',
      'padeyes: that click looks level or up: it never meets the deck.',
      'padeyes: undone (add).',
      '7',
    ]);
  });

  it("clear all: none left, the file written at once (empty), the next tool starts with none; adding by clicks: on a platform its elevator's group, a click on one there selects it; undo brings all back", () => {
    const r = tool(`local P = newTool()
rec(P.clearAll())
rec(P.counts())
rec(select(2, P.clearAll()))
local Q = newTool()
rec(#Q.load() .. ' from ' .. Q.source)
rec(Q.addAt({ 30, 40, 30 }, { 0, -1, 0 }, DECK))
rec(Q.addAt({ 5, 40, 0 }, { 0, -1, 0 }, DECK))
rec(Q.addAt({ 5.2, 40, 0.1 }, { 0, -1, 0 }, DECK))
rec(Q.counts())
rec(P.undo())
rec(P.counts())`, SMALL);
    expect(r).toEqual([
      'padeyes: all 6 cleared ("Click adds": click the deck where each one is).',
      '0',
      'padeyes: there are none.',
      '0 from yours',
      'padeyes: added padeye 1 (El 1, added): 30.00 m forward, 30.00 to starboard.',
      'padeyes: added padeye 2 (Flight Deck, added): 5.00 m forward, 0.00 to starboard.',
      'padeyes: one there already: selected padeye 2 (Flight Deck, added): 5.00 m forward, 0.00 to starboard.',
      '2',
      'padeyes: undone (clear all).',
      '6',
    ]);
  });

  it("writes the user's file half a second after the last change, and the next tool starts from it: places, where they started, states; removed ones left out", () => {
    const r = tool(`local P = newTool()
P.project(CAM, DECK)
P.pick(1150, 400)
NOW = 1
P.move(0.25, 0, 'one')
P.tick(1.2)
rec('after 0.2 s: ' .. WRITES .. ' written')
P.tick(1.6)
rec('after 0.6 s: ' .. WRITES .. ' written')
P.pick(925, 400) P.confirm()
P.pick(1300, 720) P.remove()
P.flush()
rec('flushed: ' .. WRITES .. ' written')
local Q = newTool()
rec(#Q.load() .. ' from ' .. Q.source)
for _, e in ipairs(Q.list) do rec(string.format('%d %d %.2f %.2f %.2f %.2f %s', e.n, e.g, e.x, e.z, e.x0, e.z0, e.state)) end
-- (back to the drawing: the file written over at once)
rec(Q.startOver())
local R = newTool()
rec(#R.load() .. ' from ' .. R.source .. '; padeye 1 at ' .. R.list[1].x)`, SMALL);
    expect(r).toEqual([
      'after 0.2 s: 0 written',
      'after 0.6 s: 1 written',
      'flushed: 2 written',
      '5 from yours',
      '1 1 2.25 3.00 2.00 3.00 seen',
      '2 1 4.40 3.00 4.40 3.00 seen',
      '3 1 2.00 -1.50 2.00 -1.50 confirmed',
      '4 1 100.00 0.00 100.00 0.00 seen',
      '5 2 -2.00 6.00 -2.00 6.00 seen',
      "padeyes: back to the drawing's 6 padeyes.",
      '6 from yours; padeye 1 at 2.0',
    ]);
  });

  it("the user's file is the one padeyes.py --from reads (n, g, x, z ... state on each line)", () => {
    const r = tool(`local P = newTool()
P.load() P.save()
rec(FILES['W/Logs/catcc-padeyes.lua'])`, SMALL);
    const lines = r.join('\n').split('\n').filter((l) => l.includes('state = '));
    expect(lines.length).toBe(6);
    for (const l of lines) expect(l).toMatch(/n = (\d+), g = (\d+), x = (-?[\d.]+), z = (-?[\d.]+).*state = "(\w+)"/);
    expect(r.join('\n')).toContain('padeyes.py --from');
  });

  it.skipIf(!python)("padeyes.py --from takes the user's file back into the drawing (the rest of it byte for byte) and the panel's file again from that", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-padeyes-'));
    const svgPath = path.join(tmp, 'Nimitz.svg');
    const outPath = path.join(tmp, 'crewtest_padeyes.lua');
    const user = path.join(tmp, 'catcc-padeyes.lua');
    const svg = fs.readFileSync(here('../../carrier-ops-handoff-2/Nimitz.svg'), 'utf8');
    fs.writeFileSync(svgPath, svg);
    // the user, in DCS: the first padeye 1 m forward, the second removed, the first to confirm confirmed, one added
    const first = rows[0];
    const second = rows[1];
    const conf = rows.find((q, i) => i > 1 && q.k === 1)!;
    const r = tool(`local P = newTool()
P.load()
P.sel = P.list[1] P.move(1, 0, 'one')
P.sel = P.list[2] P.remove()
for i, e in ipairs(P.list) do if i > 2 and e.state == 'confirm' and not e.removed then P.sel = e P.confirm() break end end
P.addAt({ 0, 40, 0 }, { 0, -1, 0 }, DECK)
P.flush()
rec(FILES['W/Logs/catcc-padeyes.lua'])`);
    fs.writeFileSync(user, r.join('\n'));
    const py = spawnSync('python', ['-I', here('../deck-test/padeyes/padeyes.py'), '--svg', svgPath, '--out', outPath, '--from', user], { encoding: 'utf8' });
    expect(py.status, py.stderr).toBe(0);
    const got: Row[] = [...fs.readFileSync(outPath, 'utf8').matchAll(/\{ (\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (\d) \}/g)].map((m) => ({ n: +m[1], g: +m[2], x: +m[3], z: +m[4], k: +m[5] }));
    expect(got.length).toBe(rows.length);
    const near = (x: number, z: number) => got.filter((q) => Math.hypot(q.x - x, q.z - z) < 0.002);
    expect(near(first.x + 1, first.z).length).toBe(1);
    expect(near(first.x, first.z).length).toBe(0);
    expect(near(second.x, second.z).length).toBe(0);
    expect(near(conf.x, conf.z)[0].k).toBe(0);
    expect(near(0, 0).length).toBe(1);
    expect(got.filter((q) => q.k === 1).length).toBe(rows.filter((q) => q.k === 1).length - 1 - second.k);
    // (everything but the layer as it was)
    const strip = (t: string) => t.replace(/<g inkscape:label="Padeyes".*?<\/g><\/g>/s, '');
    expect(strip(fs.readFileSync(svgPath, 'utf8'))).toBe(strip(svg));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('the texture\'s fix (padeyes-fix.json) is what its evidence gives, every mark within 0.12 m of it (the user\'s padeyes at the port bow, the elevators\' edges)', () => {
    const fix = JSON.parse(fs.readFileSync(here('../deck-test/padeyes/padeyes-fix.json'), 'utf8'));
    expect(fix.evidence.filter((e: { kind: string }) => e.kind === 'point').length).toBeGreaterThanOrEqual(8);
    // (small angle, as padeyes.py solves it)
    const { theta: th, tx, tz } = fix;
    for (const e of fix.evidence) {
      if (e.kind === 'point') {
        expect(Math.abs(e.x - th * e.z + tx - e.to[0]), JSON.stringify(e)).toBeLessThan(0.12);
        expect(Math.abs(e.z + th * e.x + tz - e.to[1]), JSON.stringify(e)).toBeLessThan(0.12);
      } else if (e.kind === 'z') {
        expect(Math.abs(th * e.x + tz - e.corr), JSON.stringify(e)).toBeLessThan(0.12);
      } else {
        expect(Math.abs(-th * e.dz - e.corr), JSON.stringify(e)).toBeLessThan(0.12);
      }
    }
    // (about half a degree: the bow to starboard)
    expect(th).toBeGreaterThan(0.006);
    expect(th).toBeLessThan(0.011);
  });

  it.skipIf(!python)("padeyes.py --fit: the fix fitted again with the padeyes the user set one by one; the panel's file again; the user's file rebased (theirs kept, confirmed; moves of all dropped; added kept; the old file kept)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-padeyes-fit-'));
    const svgPath = path.join(tmp, 'Nimitz.svg');
    const outPath = path.join(tmp, 'crewtest_padeyes.lua');
    const fixPath = path.join(tmp, 'padeyes-fix.json');
    const user = path.join(tmp, 'catcc-padeyes.lua');
    fs.copyFileSync(here('../../carrier-ops-handoff-2/Nimitz.svg'), svgPath);
    fs.copyFileSync(here('../deck-test/padeyes/padeyes-fix.json'), fixPath);
    const before = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
    // the user: all of them moved 0.1 forward, 0.2 to starboard (no evidence); three across the deck set one by one
    // (0.3 forward, 0.2 to port of where they were); one added
    const deck = rows.filter((q) => q.g === 1 && q.k === 0);
    const own = [deck[Math.floor(deck.length * 0.1)], deck[Math.floor(deck.length * 0.5)], deck[Math.floor(deck.length * 0.9)]];
    const f = (v: number) => v.toFixed(3);
    const lines = rows.map((q) => {
      const mine = own.includes(q);
      const x = mine ? q.x + 0.3 : q.x + 0.1;
      const z = mine ? q.z - 0.2 : q.z + 0.2;
      return `  { n = ${q.n}, g = ${q.g}, x = ${f(x)}, z = ${f(z)}, x0 = ${f(q.x)}, z0 = ${f(q.z)}, state = "${q.k ? 'confirm' : 'seen'}" },`;
    });
    lines.push(`  { n = ${rows.length + 1}, g = 1, x = 1.000, z = 2.000, x0 = 1.000, z0 = 2.000, state = "added" },`);
    fs.writeFileSync(user, `return { groups = { "Flight Deck", "El 1", "El 2", "El 3", "El 4" }, list = {\n${lines.join('\n')}\n} }\n`);
    const py = spawnSync('python', ['-I', here('../deck-test/padeyes/padeyes.py'), '--svg', svgPath, '--out', outPath, '--fix', fixPath, '--fit', user], { encoding: 'utf8' });
    expect(py.status, py.stderr).toBe(0);
    expect(py.stdout).toMatch(/the fix from 3 padeyes of yours \(0 skipped/);
    const after = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
    expect(after.evidence.length).toBe(before.evidence.length + 3);
    expect(after.theta).not.toBe(before.theta);
    // the panel's file is what the drawing and the new fix give
    const chk = spawnSync('python', ['-I', here('../deck-test/padeyes/padeyes.py'), '--svg', svgPath, '--out', outPath, '--fix', fixPath, '--check'], { encoding: 'utf8' });
    expect(chk.status, chk.stdout).toBe(0);
    const got: Row[] = [...fs.readFileSync(outPath, 'utf8').matchAll(/\{ (\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (\d) \}/g)].map((m) => ({ n: +m[1], g: +m[2], x: +m[3], z: +m[4], k: +m[5] }));
    expect(got.length).toBe(rows.length);
    // the user's file rebased
    expect(fs.existsSync(user + '.before-fit')).toBe(true);
    const reb = [...fs.readFileSync(user, 'utf8').matchAll(/n = (\d+), g = (\d+), x = (-?[\d.]+), z = (-?[\d.]+), x0 = (-?[\d.]+), z0 = (-?[\d.]+), state = "(\w+)"/g)].map((m) => ({
      n: +m[1], g: +m[2], x: +m[3], z: +m[4], x0: +m[5], z0: +m[6], state: m[7],
    }));
    expect(reb.length).toBe(rows.length + 1);
    const confirmed = reb.filter((e) => e.state === 'confirmed');
    expect(confirmed.length).toBe(3);
    for (const q of own) expect(confirmed.some((e) => Math.abs(e.x - (q.x + 0.3)) < 0.0015 && Math.abs(e.z - (q.z - 0.2)) < 0.0015)).toBe(true);
    const rest = reb.filter((e) => e.state === 'seen' || e.state === 'confirm');
    expect(rest.length).toBe(rows.length - 3);
    for (const e of rest) {
      expect(e.x).toBe(e.x0);
      expect(e.z).toBe(e.z0);
      const g = got[e.n - 1];
      expect(Math.abs(g.x - e.x0) + Math.abs(g.z - e.z0), `padeye ${e.n}`).toBeLessThan(0.002);
    }
    expect(reb.filter((e) => e.state === 'added').map((e) => [e.n, e.x, e.z])).toEqual([[rows.length + 1, 1, 2]]);
    fs.rmSync(tmp, { recursive: true, force: true });
  }, 30000);

  it("the model's padeyes (DCS's Vodostoki mesh: crewtest_padeyes_model.lua) are drawn on their own, never picked by a click; the user's untouched", () => {
    const r = tool(`FILES['W/Scripts/CATCC/crewtest_padeyes_model.lua'] = MODEL_SRC
local P = newTool()
local m = P.projectModel(CAM, DECK)
rec('model: ' .. #P.loadModel() .. ', drawn ' .. #m .. ', first ' .. m[1].e.state)
P.project(CAM, DECK)
rec('mine drawn: ' .. #P.drawn)
rec(select(2, P.pick(1000 + 50 * 0.5, 500 - 50 * 6)) or P.sel and P.sel.n)`, SMALL);
    expect(r).toEqual(['model: 2, drawn 2, first model', 'mine drawn: 5', 'padeyes: no padeye there (click on a dot)']);
  });

  it("combined: the model's padeyes and the user's own, those within 0.3 m of a model one left out (they are the model's)", () => {
    const r = tool(`FILES['W/Scripts/CATCC/crewtest_padeyes_model.lua'] = MODEL_SRC
local P = newTool()
local c = P.combined()
rec(#P.loadModel() .. ' + ' .. #P.load() .. ' -> ' .. #c .. ', yours added ' .. P.combinedAdded)
P.addAt({ 6.1, 40, 0.6 }, { 0, -1, 0 }, DECK)
P.addAt({ 50, 40, 0 }, { 0, -1, 0 }, DECK)
c = P.combined()
rec('then ' .. #c .. ', yours added ' .. P.combinedAdded .. ', ' .. c[#c].from .. ' ' .. c[#c].state)`, SMALL);
    expect(r).toEqual(['2 + 6 -> 8, yours added 6', 'then 9, yours added 7, yours combined']);
  });

  it('finds the holes of the grid: a place the grid steps point to from 3 or more padeyes with none there; gone once one is added there', () => {
    // a patch of the deck's grid (rows 1.526 m apart, 2.409 m along, every other row shifted half a step), the model's,
    // with the one at 4.818 / 3.052 left out
    const pts: string[] = [];
    let n = 0;
    for (let r = -2; r <= 6; r++) {
      for (let c = -2; c <= 6; c++) {
        const x = c * 2.409 + (r % 2 !== 0 ? 1.2045 : 0);
        const z = r * 1.526;
        if (Math.abs(x - 4.818) < 0.01 && Math.abs(z - 3.052) < 0.01) continue;
        pts.push(`{ ${++n}, 1, ${x.toFixed(3)}, ${z.toFixed(3)}, 1 }`);
      }
    }
    const model = `return { groups = { 'Flight Deck' }, styles = { 'dark' }, list = { ${pts.join(', ')} } }`;
    const r = tool(`FILES['W/Scripts/CATCC/crewtest_padeyes_model.lua'] = GRID
local P = newTool()
P.load()
for _, e in ipairs(P.list) do e.removed = true end
local inside = {}
for _, h in ipairs(P.holes()) do if h.x > 0 and h.x < 10 and h.z > 0 and h.z < 7 then inside[#inside + 1] = h end end
rec('holes inside: ' .. #inside)
rec(string.format('at %.2f %.2f, from %d', inside[1].x, inside[1].z, inside[1].votes))
P.addAt({ 4.8, 40, 3.0 }, { 0, -1, 0 }, DECK)
local left = 0
for _, h in ipairs(P.holes()) do if h.x > 0 and h.x < 10 and h.z > 0 and h.z < 7 then left = left + 1 end end
rec('after adding one there: ' .. left)`.replace('GRID', JSON.stringify(model)), SMALL);
    expect(r).toEqual(['holes inside: 1', 'at 4.82 3.05, from 6', 'after adding one there: 0']);
  });

  it.skipIf(!python)("the model's padeyes file is what DCS's carrier model gives now (else: python -I catcc-dcs/deck-test/padeyes/vodostoki.py; not checked without DCS)", () => {
    const r = spawnSync('python', ['-I', here('../deck-test/padeyes/vodostoki.py'), '--check'], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toMatch(/is current: 4775 padeyes \(and 1172 on the hangar deck\)|not on this machine/);
    expect(r.status).toBe(0);
    const model = [...fs.readFileSync(here('../Scripts/CATCC/crewtest_padeyes_model.lua'), 'utf8').matchAll(/\{ (\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (\d), (\d+) \}/g)];
    expect(model.length).toBe(4775);
    // (the elevators' platforms: 89, 89, 88, 88, each on its platform as DCS's models have it)
    for (const e of map.elevators as { elevator: number; x: [number, number]; z: [number, number] }[]) {
      const on = model.filter((m) => +m[2] === e.elevator + 1);
      expect(on.length, `elevator ${e.elevator}`).toBeGreaterThan(85);
      for (const m of on) {
        expect(+m[3]).toBeGreaterThan(e.x[0]);
        expect(+m[3]).toBeLessThan(e.x[1]);
        expect(+m[4]).toBeGreaterThan(e.z[0]);
        expect(+m[4]).toBeLessThan(e.z[1]);
      }
    }
    for (const m of model) {
      expect(Math.abs(+m[3])).toBeLessThan(170);
      expect(Math.abs(+m[4])).toBeLessThan(42);
    }
  }, 60000);

  it("loads the real drawing's padeyes, and draws a few hundred of them from 20 m over the deck", () => {
    const r = tool(`local P = newTool()
rec(#P.load())
rec(#P.project(CAM, DECK))`);
    expect(Number(r[0])).toBe(rows.length);
    expect(Number(r[1])).toBeGreaterThan(100);
    expect(Number(r[1])).toBeLessThanOrEqual(800);
  });
});
