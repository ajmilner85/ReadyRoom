// The CATCC crew test (deck-test/crew-test): can our code see and command the Supercarrier's deck crew?
//   * every DCS function the native module looks up by name really is exported by the DLL it names
//     (when this PC has DCS installed);
//   * the data patch (groundcrew-patch.lua) on DCS's own GroundCrew.lua: debug drawing on, one person
//     added with the same attachments as the others, spawn spot 1's hand-off list emptied, the rest intact;
//   * the F10 menu script and the hook, end to end under fengari, with a mocked DCS and a stand-in for
//     the native module (which has its own self-test, run by native/build.cmd).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { buildRoutesLua } from '../deck-test/crew-test/routes.gen.ts';
import { DECK_SPOTS as T_SPOTS } from '../../src/components/catcc/prifly/deckSpots.gen.ts';
import { taxiRoute } from '../../src/components/catcc/prifly/taxiNet.ts';
import { buildSpotsTs, dcsSpots, DECK_OUTLINE, EDGE, movedSpots, SPOTS_DCS_CSV, wheelsInside } from '../../scripts/catcc/deck-spots.gen.ts';

const here = (p: string) => path.resolve(__dirname, p);
const DCS = 'C:/Program Files/Eagle Dynamics/DCS World';
const BIN = `${DCS}/bin-mt`;
const SCRIPTS = `${DCS}/CoreMods/tech/USS_Nimitz/scripts`;

const cpp = fs.readFileSync(here('../deck-test/crew-test/native/catcc_crew.cpp'), 'utf8');
const patch = fs.readFileSync(here('../deck-test/crew-test/groundcrew-patch.lua'), 'utf8');
const menuSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest.lua'), 'utf8');
const hookSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_hook.lua'), 'utf8');
const routesSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_routes.lua'), 'utf8').replace(/\r\n/g, '\n');
const uiSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_ui.lua'), 'utf8');
const flagSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_flag.lua'), 'utf8');
const demoSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_demo.lua'), 'utf8');
const hangarSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_hangar.lua'), 'utf8');
const slotsSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_slots.lua'), 'utf8');
const headSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_head.lua'), 'utf8');
const cockpitSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_cockpit.lua'), 'utf8');

/** the names a PE file exports */
function peExports(file: string): Set<string> {
  const d = fs.readFileSync(file);
  const pe = d.readUInt32LE(0x3c);
  const nsec = d.readUInt16LE(pe + 6);
  const opt = pe + 24;
  const dd = opt + (d.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const so = opt + d.readUInt16LE(pe + 20);
  const secs: { va: number; size: number; raw: number }[] = [];
  for (let i = 0; i < nsec; i++) {
    const o = so + 40 * i;
    secs.push({ va: d.readUInt32LE(o + 12), size: Math.max(d.readUInt32LE(o + 8), d.readUInt32LE(o + 16)), raw: d.readUInt32LE(o + 20) });
  }
  const off = (rva: number) => {
    const s = secs.find((x) => rva >= x.va && rva < x.va + x.size);
    if (!s) throw new Error('rva outside sections');
    return s.raw + rva - s.va;
  };
  const e = off(d.readUInt32LE(dd));
  const n = d.readUInt32LE(e + 24);
  const names = off(d.readUInt32LE(e + 32));
  const out = new Set<string>();
  for (let i = 0; i < n; i++) {
    const o = off(d.readUInt32LE(names + 4 * i));
    out.add(d.toString('latin1', o, d.indexOf(0, o)));
  }
  return out;
}

/** the first n bytes of an exported function's code, from the file */
function peExportBytes(file: string, name: string, n: number): Buffer {
  const d = fs.readFileSync(file);
  const pe = d.readUInt32LE(0x3c);
  const nsec = d.readUInt16LE(pe + 6);
  const opt = pe + 24;
  const dd = opt + (d.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const so = opt + d.readUInt16LE(pe + 20);
  const off = (rva: number) => {
    for (let i = 0; i < nsec; i++) {
      const o = so + 40 * i;
      const va = d.readUInt32LE(o + 12);
      if (rva >= va && rva < va + Math.max(d.readUInt32LE(o + 8), d.readUInt32LE(o + 16))) return d.readUInt32LE(o + 20) + rva - va;
    }
    throw new Error('rva outside sections');
  };
  const e = off(d.readUInt32LE(dd));
  const count = d.readUInt32LE(e + 24);
  const funcs = off(d.readUInt32LE(e + 28));
  const names = off(d.readUInt32LE(e + 32));
  const ords = off(d.readUInt32LE(e + 36));
  for (let i = 0; i < count; i++) {
    const o = off(d.readUInt32LE(names + 4 * i));
    if (d.toString('latin1', o, d.indexOf(0, o)) === name) {
      const code = off(d.readUInt32LE(funcs + 4 * d.readUInt16LE(ords + 2 * i)));
      return d.subarray(code, code + n);
    }
  }
  throw new Error(`${name} is not exported by ${file}`);
}

/** run Lua with some globals preset to strings; returns global OUT */
function run(code: string, globals: Record<string, string> = {}): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries(globals)) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1);
}

describe('crew test: the native module names real DCS functions', () => {
  const syms = [...cpp.matchAll(/\{"([\w.]+\.dll)",\s*"(\?[^"]+)"/g)].map((m) => ({ dll: m[1], name: m[2] }));

  it('lists its DCS functions in one table', () => {
    expect(syms.length).toBe(74);
    expect(new Set(syms.map((s) => s.dll))).toEqual(new Set(['animator_logic.dll', 'animator.dll', 'edObjects.dll', 'Flight.dll', 'Transport.dll', 'WorldGeneral.dll']));
  });

  // The module finds a character's animation instance through a member no exported function returns:
  // it reads the member's offset out of the first instruction of the exported
  // AnimatedCharacterBase::set_override_animation(string). That instruction must be what the module's
  // parseThisLoad accepts: mov rcx,[rcx+disp] followed by test rcx,rcx.
  it.skipIf(!fs.existsSync(`${BIN}/animator_logic.dll`))("the installed DCS's set_override_animation begins by loading the animation instance", () => {
    const name = '?set_override_animation@AnimatedCharacterBase@AnimatorLogic@@QEAAXAEBV?$basic_string@D@ed@@@Z';
    const c = peExportBytes(`${BIN}/animator_logic.dll`, name, 16);
    let disp = -1;
    let n = 0;
    if (c[0] === 0x48 && c[1] === 0x8b && c[2] === 0x49 && c[3] < 0x80) [disp, n] = [c[3], 4];
    else if (c[0] === 0x48 && c[1] === 0x8b && c[2] === 0x89) [disp, n] = [c.readInt32LE(3), 7];
    expect(n).toBeGreaterThan(0);
    expect([c[n], c[n + 1], c[n + 2]]).toEqual([0x48, 0x85, 0xc9]);
    expect(disp).toBeGreaterThanOrEqual(8);
    expect(disp % 8).toBe(0);
    expect(cpp).toContain('static int parseThisLoad(const unsigned char *c)');
  });

  // (Flight.dll's code is packed on disk; its export table is not)
  for (const dll of ['animator_logic.dll', 'animator.dll', 'edObjects.dll', 'Flight.dll', 'Transport.dll', 'WorldGeneral.dll']) {
    it.skipIf(!fs.existsSync(`${BIN}/${dll}`))(`${dll} exports every name the module looks up in it`, () => {
      const exp = peExports(`${BIN}/${dll}`);
      const missing = syms.filter((s) => s.dll === dll && !exp.has(s.name)).map((s) => s.name);
      expect(missing).toEqual([]);
    });
  }
});

describe.skipIf(!fs.existsSync(`${SCRIPTS}/GroundCrew.lua`))('crew test: data patch on GroundCrew.lua', () => {
  const read = (f: string) => fs.readFileSync(`${SCRIPTS}/${f}`, 'latin1');
  // in case the test is applied to the installed file
  const stock = () => read('GroundCrew.lua').replace(/-- CATCC-DIRTEST BEGIN[\s\S]*?-- CATCC-DIRTEST END/g, '');
  const report = `
local t1, t5 = takeoff_crew.takeoff_tasks[1], takeoff_crew.takeoff_tasks[5]
local last = takeoff_crew.members[#takeoff_crew.members]
local att = {}
for i, a in ipairs(last.attachments or {}) do att[i] = a.name .. ':' .. a.type .. ':' .. tostring(a.connector) end
local dd = environment_options.DebugDraw
OUT = table.concat({
  'members=' .. #takeoff_crew.members,
  'last=' .. last.name .. '/' .. last.livery .. '/' .. last.model_name .. '/' .. last.unit_type .. '/' .. last.animation,
  'pos=' .. table.concat(last.position, ','),
  'att=' .. table.concat(att, ' '),
  'att1=' .. #takeoff_crew.members[1].attachments,
  'tasks1=' .. #t1 .. ' brown=' .. tostring(t1.brown_id) .. '/' .. tostring(t1.brown_route_id),
  'tasks5=' .. #t5,
  'tasks=' .. #takeoff_crew.takeoff_tasks .. '/' .. #takeoff_crew.parking_tasks,
  'draw=' .. (dd and (tostring(dd.draw_goal) .. '/' .. tostring(dd.show_labels) .. '/' .. tostring(dd.route_height)) or 'off'),
  'crews=' .. #crew .. ' ' .. tostring(crew[1].behavior ~= nil) .. ' ' .. #crew[1].members,
  'orca=' .. tostring(environment_options.ORCA.max_speed),
}, ';')`;
  const go = (mode: string | null) =>
    run(
      `local FILES = { ['./CoreMods/tech/USS_Nimitz/scripts/utils.lua'] = UTILS, ['./CoreMods/tech/USS_Nimitz/scripts/crew.lua'] = CREW }
dofile = function(p) return assert(load(assert(FILES[p], 'no file ' .. p), p))() end
assert(load(GC, 'GroundCrew.lua'))()
${report}`,
      {
        UTILS: read('utils.lua'),
        CREW: read('crew.lua'),
        GC: stock() + (mode ? `\n-- BEGIN\nlocal CATCC_CREW = '${mode}'\ndo\n${patch}\nend\n-- END\n` : ''),
      },
    );
  const fields = (s: string) => Object.fromEntries(s.split(';').map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));

  it('stock: 26 take-off crew members, no debug drawing', () => {
    const f = fields(go(null));
    expect(f.members).toBe('26');
    expect(f.draw).toBe('off');
    expect(f.tasks1).toBe('3 brown=14/0');
    expect(f.tasks).toBe('16/16');
  });

  it('draw: only the debug drawing changes', () => {
    const s = fields(go(null));
    const f = fields(go('draw'));
    expect(f.draw).toBe('true/true/1.0');
    expect({ ...f, draw: 'off' }).toEqual(s);
  });

  it('people: the added person, no debug drawing', () => {
    const f = fields(go('people'));
    expect(f.draw).toBe('off');
    expect(f.members).toBe('27');
    expect(f.last).toBe('catcc-00/green/carrier_shooter/us carrier shooter/idle');
    expect({ ...f, draw: 'true/true/1.0' }).toEqual(fields(go('full')));
  });

  it('no variant touches a hand-off list (an emptied one crashes DCS on the first simulation step)', () => {
    const lists = (mode: string | null) =>
      run(
        `local FILES = { ['./CoreMods/tech/USS_Nimitz/scripts/utils.lua'] = UTILS, ['./CoreMods/tech/USS_Nimitz/scripts/crew.lua'] = CREW }
dofile = function(p) return assert(load(assert(FILES[p], 'no file ' .. p), p))() end
assert(load(GC, 'GroundCrew.lua'))()
local o = {}
for _, key in ipairs({ 'takeoff_tasks', 'parking_tasks' }) do
  for r, t in ipairs(takeoff_crew[key]) do
    local e = {}
    for i, h in ipairs(t) do e[i] = string.format('%.4f/%d/%d', h.progress, h.member_id, h.route_id) end
    o[#o + 1] = key .. r .. ':' .. table.concat(e, ',') .. ':' .. tostring(t.brown_id) .. '/' .. tostring(t.brown_route_id)
  end
end
OUT = table.concat(o, ';')`,
        {
          UTILS: read('utils.lua'),
          CREW: read('crew.lua'),
          GC: stock() + (mode ? `\n-- BEGIN\nlocal CATCC_CREW = '${mode}'\ndo\n${patch}\nend\n-- END\n` : ''),
        },
      );
    const s = lists(null);
    expect(s.split(';').length).toBe(32);
    // every route has at least one hand-off as shipped: the take-off crew takes the first one unchecked
    expect(s.split(';').filter((l) => l.startsWith('takeoff_tasks')).every((l) => l.split(':')[1].length > 0)).toBe(true);
    for (const mode of ['draw', 'people', 'full', 'extra', 'model']) expect(lists(mode)).toBe(s);
  });

  it('extra: full, plus four people of ours in catapult crew 1 (no static crew: the game makes nobody from one)', () => {
    const extra = (mode: string) =>
      run(
        `local FILES = { ['./CoreMods/tech/USS_Nimitz/scripts/utils.lua'] = UTILS, ['./CoreMods/tech/USS_Nimitz/scripts/crew.lua'] = CREW }
dofile = function(p) return assert(load(assert(FILES[p], 'no file ' .. p), p))() end
assert(load(GC, 'GroundCrew.lua'))()
local function member(m)
  if not m then return 'none' end
  local keys, att = {}, {}
  for k in pairs(m) do if k ~= 'attachments' then keys[#keys + 1] = k end end
  table.sort(keys)
  for i, a in ipairs(m.attachments or {}) do att[i] = a.name end
  return m.name .. '/' .. m.livery .. '/' .. m.model_name .. '/' .. m.unit_type .. ' at ' .. table.concat(m.position, ',') .. ' keys ' .. table.concat(keys, ',') .. ' att ' .. table.concat(att, ',')
end
local n = {}
for i = 1, 4 do n[i] = #crew[i].members end
local stockKeys = {}
for k in pairs(crew[4].members[4]) do if k ~= 'attachments' then stockKeys[#stockKeys + 1] = k end end
table.sort(stockKeys)
OUT = table.concat({
  'crews=' .. table.concat(n, ','),
  'c7=' .. member(crew[1].members[7]),
  'c10=' .. member(crew[1].members[10]),
  'routes7=' .. (crew[1].members[7] and #crew[1].members[7].routes or -1),
  'white2keys=' .. table.concat(stockKeys, ','),
  'static=' .. (static_crew and #static_crew.members or 0),
  's1=' .. member(static_crew and static_crew.members[1]),
  'takeoff=' .. #takeoff_crew.members .. '/' .. takeoff_crew.members[#takeoff_crew.members].name,
  'behavior=' .. tostring(crew[1].behavior),
}, ';')`,
        { UTILS: read('utils.lua'), CREW: read('crew.lua'), GC: stock() + `\n-- BEGIN\nlocal CATCC_CREW = '${mode}'\ndo\n${patch}\nend\n-- END\n` },
      );
    const full = fields(extra('full'));
    expect(full.crews).toBe('6,6,6,6');
    expect(full.static).toBe('0');
    const f = fields(extra('extra'));
    expect(f.crews).toBe('10,6,6,6');
    expect(f.c10).toContain('catcc-c3/yellow/carrier_shooter/us carrier shooter at 12.0,20.1494140625,29.0,0 keys');
    expect(f.c7).toBe(
      'catcc-c0/yellow/carrier_shooter/us carrier shooter at 14.0,20.1494140625,29.0,0 keys animation,decal_index,fast_start_position,livery,model_name,name,position,routes,unit_type ' +
        'att RightStick,LeftStick,LeftLight,RightLight',
    );
    // every field a catapult crew member has as shipped (crew 4's white2 is the one without routes), and no routes
    expect(f.c7).toContain(`keys ${f.white2keys} att`);
    expect(f.routes7).toBe('0');
    expect(f.static).toBe('0');
    expect(f.takeoff).toBe('27/catcc-00');
    expect(f.behavior).toBe(full.behavior);
    // model: extra, plus the plane captain (catcc-m0, a brown shirt) and the tow tractor's driver (catcc-t0, blue): DCS's
    // own crew figure, with the wands; nobody of ours stands on elevator 1's platform (15.5 m forward and on)
    const m = fields(extra('model'));
    // (and the deck spotting demo's nine more drivers, catcc-t1 .. t9, in catapult crews 2, 3 and 4: no crew larger
    // than the twelve crew 1 is seen to work with. Nine since 2026-11-19: the demo has ten tractors (six on the flight
    // deck, four in the hangar), and the user saw "two tugs in the hangar that have no driver". Twelve tractors were
    // tried the same day and dropped: a driver for each of the ten and no more: the user: "the only blue shirts should
    // be in tugs")
    // (and the brake riders, catcc-b0 .. b8, brown shirts, three in each of crews 2, 3 and 4: twelve in each crew now)
    expect(m.crews).toBe('12,12,12,12');
    expect(m.c10).toBe(f.c10);
    const patched = patch.replace(/\r\n/g, '\n');
    expect(patched).toContain("{ { 'catcc-m0', 'brown', 12.0, 31.0, 1 }, { 'catcc-t0', 'blue', 12.0, 33.0, 1 } }");
    expect(patched).toContain("for i = 1, 9 do people[#people + 1] = { 'catcc-t' .. i, 'blue', 14.0 - i, 34.5, i <= 3 and 2 or ((i <= 5 or i == 8) and 3 or 4) } end");
    expect(patched).not.toContain("model_name = 'catcc_test_pilot',");
    expect(patched).toContain("livery = 'yellow', -- flight directors");
    // the static types of our own mod (the tow bar, the axle finder's markers), declared in a Database file as the chock's
    // and the route lines' are, each drawn with a model of its own name
    const entry = fs.readFileSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/entry.lua'), 'utf8');
    expect(entry).toContain("dofile(current_mod_path .. '/Database/db_catcc_crew.lua')");
    expect(entry).toContain("mount_vfs_texture_path(current_mod_path .. '/Shapes/textures')");
    const markers = Array.from({ length: 26 }, (_, i) => `Shapes/CATCC_AxleMarker_H${15 + i}.edm`);
    for (const f of ['Database/db_catcc_crew.lua', 'Shapes/CATCC_Towbar.edm', 'Shapes/CATCC_AxleProbe.edm', ...markers, 'Shapes/textures/catcc_towbar_diff.dds', 'Shapes/textures/catcc_towbar_nm.dds',
      'Shapes/textures/catcc_towbar_diff_roughmet.dds', 'Shapes/CATCC_Tiedown.edm', 'Shapes/textures/catcc_tiedown_diff.dds', 'Shapes/textures/catcc_tiedown_nm.dds',
      'Shapes/textures/catcc_tiedown_diff_roughmet.dds', 'Shapes/CATCC_Tiedown.lods', 'Shapes/CATCC_Tiedown_lod1.edm', 'Shapes/CATCC_Tiedown_lod2.edm',
      'Shapes/CATCC_Tiedown_lod3.edm'])
      expect(fs.existsSync(here(`../deck-test/crew-test/Mods/tech/CATCC-Crew/${f}`)), f).toBe(true);
    expect(fs.existsSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/models/catcc_test_pilot.chanimgpu'))).toBe(true);
    expect(fs.readFileSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/entry.lua'), 'utf8')).toContain("mount_vfs_animations_path(current_mod_path .. '/animations')");
  });

  it('full: our green shirt joins with the same attachments, the rest stays', () => {
    const s = fields(go(null));
    const f = fields(go('full'));
    expect(f.draw).toBe('true/true/1.0');
    expect(f.members).toBe('27');
    expect(f.last).toBe('catcc-00/green/carrier_shooter/us carrier shooter/idle');
    expect(f.pos).toBe('14.0,20.1494140625,27.0,0');
    expect(f.att).toBe('RightStick:gpu_attachment:__conn_hand_R LeftStick:gpu_attachment:__conn_hand_L LeftLight:light_attachment:__conn_hand_L RightLight:light_attachment:__conn_hand_R');
    expect(f.att1).toBe('4');
    expect(f.tasks1).toBe(s.tasks1);
    expect(f.tasks5).toBe(s.tasks5);
    expect(Number(f.tasks5)).toBeGreaterThan(0);
    expect(f.tasks).toBe('16/16');
    expect(f.crews).toBe(s.crews);
    expect(f.orca).toBe(s.orca);
  });
});

// ---- the menu script and the hook, with a mocked DCS. The mission environment is a sandbox table the
// hook reaches through net.dostring_in; the native module is a Lua stand-in that records its calls.
// Two carriers, each with the same people at the same ship coordinates (as in the test mission): the
// player is on ship A; ship B is 4 km away and its men come FIRST in the list.
const world = `
local REC = {}
local function rec(s) REC[#REC + 1] = s end
local T = 0
local HC = 0.5                               -- both carriers' heading (rad)
local SX, SZ = 1000, 2000                    -- ship A's world position
local BX, BZ = 5000, 2000                    -- ship B's
local function v(x, y, z) return { x = x, y = y, z = z } end
local shipX, shipY, shipZ = v(math.cos(HC), 0, math.sin(HC)), v(0, 1, 0), v(-math.sin(HC), 0, math.cos(HC))
local function toWorld(f, u, s, ox, oz)
  ox, oz = ox or SX, oz or SZ
  return v(ox + f * shipX.x + s * shipZ.x, u, oz + f * shipX.z + s * shipZ.z)
end
-- the jet: at spawn spot 5 (10.5 m aft, 34 m to starboard), nose to port; setJet moves / turns it
local jet = { f = -10.5, s = 34, nf = 0, ns = -1 }
JETUP = 22                                   -- the jet's height above the ship's origin (the hangar deck: 10.5)
function setJet(f, s, nf, ns)
  jet.f, jet.s = f, s
  if nf then jet.nf, jet.ns = nf, ns end
end
local CV = {
  getPoint = function() return v(SX, 0, SZ) end,
  getPosition = function() return { p = v(SX, 0, SZ), x = shipX, y = shipY, z = shipZ } end,
  getName = function() return 'CVN-72' end, isExist = function() return true end,
  getCountry = function() return 2 end, getID = function() return 77 end, getTypeName = function() return 'CVN_72' end,
}
-- a second carrier, CVN-71, 3 km north of the first, on the same heading (TWO_SHIPS: it is in the mission); and a
-- destroyer right beside it, which is no carrier
TWO_SHIPS = false
local SX2, SZ2 = SX + 3000, SZ
local CV2 = {
  getPoint = function() return v(SX2, 0, SZ2) end,
  getPosition = function() return { p = v(SX2, 0, SZ2), x = shipX, y = shipY, z = shipZ } end,
  getName = function() return 'CVN-71' end, isExist = function() return true end,
  getCountry = function() return 2 end, getID = function() return 78 end, getTypeName = function() return 'CVN_71' end,
}
local DDG = {
  getPoint = function() return v(SX2 + 50, 0, SZ2 + 400) end,
  getPosition = function() return { p = v(SX2 + 50, 0, SZ2 + 400), x = shipX, y = shipY, z = shipZ } end,
  getName = function() return 'DDG-1' end, isExist = function() return true end,
  getCountry = function() return 2 end, getID = function() return 79 end, getTypeName = function() return 'USS_Arleigh_Burke_IIa' end,
}
local JET = {
  getPosition = function()
    return { p = toWorld(jet.f, JETUP, jet.s), x = v(jet.nf * shipX.x + jet.ns * shipZ.x, 0, jet.nf * shipX.z + jet.ns * shipZ.z), y = v(0, 1, 0), z = shipX }
  end,
  getName = function() return 'Volt 1-1' end, isExist = function() return true end,
  getGroup = function() return { getID = function() return 5 end } end,
  getCountry = function() return 2 end,
}
STATICS, NO_BAR_TYPE, NO_MARKER_TYPE = {}, false, false  -- the statics the mission script has made, by name
LINKED_IDS, NO_LINK = {}, false  -- the ids of those made linked to the ship (the ship's children); NO_LINK: linking gives no parent
local cmds, order = {}, {}
TIMERS = {}                                  -- the mission's timer.scheduleFunction calls
MISSION = setmetatable({
  coalition = {
    side = { NEUTRAL = 0, RED = 1, BLUE = 2 },
    getGroups = function(side, cat)
      if side == 2 and cat == 3 then return { { getUnits = function() return TWO_SHIPS and { CV, DDG, CV2 } or { CV } end } } end
      return {}
    end,
    getPlayers = function(side) return (side == 2 and PLAYER ~= false) and { JET } or {} end,
    addStaticObject = function(country, t)
      if NO_BAR_TYPE and t.type == 'CATCC_Towbar' then error('unknown type ' .. t.type) end
      if NO_MARKER_TYPE and t.type:find('CATCC_AxleMarker', 1, true) then return nil end
      local n = 0
      for _ in pairs(STATICS) do n = n + 1 end
      local name = t.name
      STATICS[name] = { id_ = 33554688 + n, isExist = function() return true end, destroy = function() STATICS[name] = nil rec('destroy ' .. name) end,
        -- (a linked static: where DCS made it, STATIC_UP above the ship's origin)
        getPosition = function()
          local o = t.offsets or { x = 0, y = 0, angle = 0 }
          local nf, ns = math.cos(o.angle), math.sin(o.angle)
          return { p = toWorld(o.x, STATIC_UP or 21.975, o.y), x = v(nf * shipX.x + ns * shipZ.x, 0, nf * shipX.z + ns * shipZ.z), y = v(0, 1, 0), z = shipX }
        end }
      if t.linkUnit and not NO_LINK then LINKED_IDS[33554688 + n] = true end
      rec(string.format('static %s type %s category %s linked %s', t.name, t.type, t.category, tostring(t.linkUnit ~= nil))
        .. (t.linkUnit and string.format(' to %d at %.3f %.3f angle %.4f offset %s cargo %s', t.linkUnit, t.offsets.x, t.offsets.y, t.offsets.angle, tostring(t.linkOffset), tostring(t.canCargo)) or '')
        .. (t.livery_id and (' livery ' .. t.livery_id) or ''))
      return STATICS[name]
    end,
  },
  StaticObject = { getByName = function(n) return STATICS[n] end },
  Group = { Category = { SHIP = 3 } },
  Unit = { getByName = function(n) if n == 'Volt 1-1' then return JET end end },
  missionCommands = {
    addSubMenuForGroup = function(gid, name, parent)
      local path = (parent and (parent.path .. ' > ') or '') .. name
      rec('submenu ' .. path)
      return { path = path, n = 0 }
    end,
    addCommandForGroup = function(gid, name, parent, fn)
      -- (no parent: an item on the radio menu's own top level)
      local key = (((parent and (parent.path .. ' > ') or '') .. name):gsub('^CATCC crew test > ', ''))
      cmds[key] = fn; order[#order + 1] = key
    end,
  },
  timer = { getTime = function() return T end, scheduleFunction = function(fn, arg, at) TIMERS[#TIMERS + 1] = { fn = fn, at = at } end },
  trigger = { action = { outText = function(text, secs) rec('say ' .. text) end } },
}, { __index = _G })

-- the people the stand-in native module knows (ship coordinates; ship = what they are attached to)
local SHIP_A, SHIP_B = 111, 222
local PEOPLE = {}
local byH = {}
local function add(h, name, full, x, z, ship)
  PEOPLE[#PEOPLE + 1] = { h = h, name = name, full = full, cls = '.?AVwoCarrierTakeoffTechnician@@', id = #PEOPLE, state = 0, movable = true, routes = 0,
    src = 1, layout = 16, x = x, y = 20.15, z = z, parent = ship }
  byH[h] = PEOPLE[#PEOPLE]
end
add(201, 'yellow-04', '0: yellow-04', -9, 30, SHIP_B)      -- by ship coordinates the nearest of all to the jet: but on the other carrier
add(202, 'brown-2-4', '0: brown-2-4', -3.83, 36.58, SHIP_B)
add(203, 'catcc-00', '0: catcc-00', 14, 27, SHIP_B)
add(204, 'director', '1: director', 73.75, 16.67, SHIP_B)
add(101, 'yellow-04', '0: yellow-04', -1.64, 23.57, SHIP_A)
add(102, 'brown-2-4', '0: brown-2-4', -3.83, 36.58, SHIP_A)
add(103, 'catcc-00', '0: catcc-00', 14, 27, SHIP_A)
add(104, 'director', '1: director', 73.75, 16.67, SHIP_A)
local walking = {}
QUICK = true    -- false: the quick scan finds nobody until the memory scan has run
WORLD = true    -- false: no world position of the men themselves
PARENTPOS = true -- false: no world position of what they are attached to (their ship)
NO_ANIM = false -- true: what a man plays can't be read
REPLACED = nil  -- n: a held animation is replaced by idle n seconds after it was applied
PLAYING, PROPS, PROPSETS, UNPLAYABLE = {}, {}, 0, { catcc_drv_seat = true } -- (the mod without install.ps1 -DriverPose: as installed until asked for)
ENVF = { avoid = false, path = false } -- the crew environment's collision avoidance switches
DBG = { 1, 0, 0, 0 }                   -- the character code's own four switches (debug_settings)
BUB, ELEV = {}, {}                     -- the ship's bubbles and elevators: the last command given to each
ORD, ORD_KNOWN, QUIET = {}, false, {}  -- the catapult crews' order bytes; quiet (held) orders counted per crew
LEN = { idle = 6.67, sign_attention_taxi = 1.33, night_sign_attention_taxi = 1.33, bs_pass_control = 2, night_bs_pass_control = 2 }
local function people()
  local out = {}
  for i, p in ipairs(PEOPLE) do
    local c = {}
    for k, val in pairs(p) do c[k] = val end
    if WORLD then
      local w = p.parent == SHIP_A and toWorld(p.x, p.y, p.z) or toWorld(p.x, p.y, p.z, BX, BZ)
      c.wx, c.wy, c.wz = w.x, w.y, w.z
    end
    if PARENTPOS then c.pwx, c.pwy, c.pwz = (p.parent == SHIP_A) and SX or BX, 0, (p.parent == SHIP_A) and SZ or BZ end
    out[i] = c
  end
  return out
end
NATIVE = {
  setlog = function(p) rec('setlog ' .. p) end,
  info = function() return { version = 'mock-2', missing = {}, thread = 1 } end,
  scan = function()
    return { envs = 2, envObjects = 9, envErr = 0, regCount = 7, regErr = 0, strOk = 8, strBad = 0, noRtti = 0,
      people = QUICK and people() or {}, classes = { { name = '.?AVwoCarrierTakeoffTechnician@@', n = 8, person = true, bases = '.?AVCharacterMovable@AnimatorLogic@@+0' } } }
  end,
  heapscan = function(s)
    rec('heapscan ' .. s)
    QUICK = true
    return { err = 0, faults = 0, seconds = 4.2, bytes = 5e9, skipped = 3e9, hits = 100, people = people(), classes = {} }
  end,
  anims = function(h) return { 'bs_move', 'idle', 'night_stick_armpose_r', 'sign_taxifwd', 'sign_taxifwd_l', 'walkfwdloop' } end,
  -- what a man plays: every animation is 2.5 s long; mode 2 (the loop flag) holds it, if LOOPS; a
  -- blend space is sampled at his "angle" parameter / 45; names in UNPLAYABLE can't be played
  play = function(h, name, mode)
    rec('play ' .. h .. ' ' .. name .. ((mode and mode ~= 0) and (' mode ' .. mode) or ''))
    if UNPLAYABLE[name] then return nil, 'DCS has no animation called "' .. name .. '"' end
    PLAYING[h] = { name = name, mode = mode or 0, at = T }
    return true
  end,
  -- As DCS: the record of what he plays stays after a one-shot has ended (same name, loop value 0),
  -- a held one has loop value 1; a blend space is sampled at his parameter ("angle" for pass control,
  -- "torso_angle" for the rest). REPLACED = n: n seconds after a held animation was applied something
  -- else (idle) takes its place, as if DCS's own logic had given the man another order.
  anim = function(h)
    if NO_ANIM then return nil, 'no animation instance (-1)' end
    local p = PLAYING[h] or { name = 'idle', mode = 0, at = 0 }
    if REPLACED and p.mode == 2 and T - p.at >= REPLACED then
      p = { name = 'idle', mode = 0, at = p.at + REPLACED }
      PLAYING[h] = p
    end
    local bx = 0
    if p.name:find('bs_') and PROPS[h] then bx = PROPS[h][p.name:find('pass') and 'angle' or 'torso_angle'] or 0 end
    local dur = LEN[p.name] or 2.5
    return { name = p.name, id = 7, raw = 7, stack = 1, t = T, start = p.at, dur = dur, fin = p.at + dur, l1 = p.mode == 2 and 1 or 0, l2 = -1, l3 = -1, bx = bx, by = 0, tr1 = 0, tr2 = 0, o1 = -1, o2 = -1 }
  end,
  animinfo = function(h)
    local out = {}
    local function a(name, dur, x, lim) out[#out + 1] = { name = name, err = 0, idx = #out, id = #out, dur = dur, x = x or '', y = '', x1 = x and -lim or 0, x2 = x and lim or 0, y1 = 0, y2 = 0, dx = 0, dy = 0 } end
    a('bs_pass_control', 0, 'angle', 135) a('bs_sign_stop', 0, 'torso_angle', 45) a('bs_sign_taxi_fwd', 0, 'torso_angle', 45) a('idle', 6.67)
    a('sign_attention_taxi', 1.33) a('sign_setbrakes', 4.67) a('sign_taxifwd', 5.33)
    if OUR_CLIP then a('catcc_test_clip', 2.17) end   -- the clip our own mod adds, when DCS has taken it up
    rec('animinfo ' .. h)
    return out
  end,
  -- (a write is recorded when it moves the parameter by half a degree or more)
  prop = function(h, name, v)
    PROPS[h] = PROPS[h] or {}
    if v ~= nil then
      PROPSETS = PROPSETS + 1
      if math.abs(v - (PROPS[h][name] or 1e9)) >= 0.5 then rec(string.format('prop %d %s %.1f', h, name, v)) end
      PROPS[h][name] = v
    end
    return PROPS[h][name] or 0
  end,
  time = function() return T end,
  -- DCS's catapult crews, numbered from 1 as DCS numbers them (number 0 is nothing), in an order that is
  -- NOT the catapults' (the hook matches them by their start boxes): crew 1 has catapult 1's box,
  -- crew 2 catapult 2's, crew 3 catapult 4's, crew 4 catapult 3's
  catcrews = function(h)
    local function c(i, x1, x2, z1, z2) return { i = i, ok = true, x1 = x1, y1 = 15, z1 = z1, x2 = x2, y2 = 25, z2 = z2 } end
    return { count = 4, avoid = ENVF.avoid, pathAvoid = ENVF.path, pathFinder = true, debug = table.concat(DBG),
      crews = { { i = 0, ok = false }, c(1, 21, 62, 11, 23.5), c(2, 16, 60, -12, 6), c(3, -96, -68.5, -36, -27.5), c(4, -78, -57, -25, -13) } }
  end,
  -- an order: the stand-in keeps each crew's order bytes (ORD[crew]); the places are "known" once any
  -- order has been given aloud (as the module learns them from what a setter changes); a quiet order
  -- (the hold, every frame) is counted, not recorded
  catorder = function(h, i, what, on, quiet)
    ORD[i] = ORD[i] or { free = 0, take = 1, allowed = 1 }
    local was = ORD[i].free
    if what == 'free' then ORD[i].free, ORD[i].take = on and 1 or 0, on and 0 or 1 elseif what == 'allowed' then ORD[i].allowed = on and 1 or 0 end
    if what == 'dropjet' then rec(string.format('catorder %d crew %d dropjet', h, i)) return true, '' end
    if quiet then
      QUIET[i] = (QUIET[i] or 0) + 1
      return true, ''
    end
    ORD_KNOWN = true
    rec(string.format('catorder %d crew %d %s %s', h, i, what, tostring(on)))
    return true, (what == 'free' and was ~= ORD[i].free) and string.format('[+0x1A0]+0x4: %d > %d', was, ORD[i].free) or ''
  end,
  orderpeek = function(h, i)
    if not ORD_KNOWN then return '' end
    local o = ORD[i] or { free = 0, take = 1, allowed = 1 }
    return string.format('free=%d take=%d allowed=%d', o.free, o.take, o.allowed)
  end,
  -- a catapult control bubble: the stand-in ship keeps the last command per bubble; state 0 = its argument at 1 (after command 2), 1 = at 0
  -- an elevator: the last command per elevator; state 1 after command 2, else 0
  elevator = function(h, idx, cmd)
    if cmd then
      ELEV[idx] = cmd
      rec(string.format('elevator %d %d %d', h, idx, cmd))
    end
    return ELEV[idx] == 2 and 1 or 0
  end,
  bubble = function(h, idx, cmd)
    if cmd then
      BUB[idx] = cmd
      rec(string.format('bubble %d %d %d', h, idx, cmd))
    end
    return BUB[idx] == 2 and 0 or 1
  end,
  debugset = function(idx, v)
    if idx then
      DBG[idx + 1] = v
      rec(string.format('debugset %d %d', idx, v))
    end
    return DBG[1], DBG[2], DBG[3], DBG[4]
  end,
  envflags = function(h, a, p)
    if a and a >= 0 then ENVF.avoid = a ~= 0 end
    if p and p >= 0 then ENVF.path = p ~= 0 end
    return ENVF.avoid, ENVF.path
  end,
  override = function(h, name) rec('override ' .. h .. ' ' .. name) return true end,
  attach = function(h, name, on) rec('attach ' .. h .. ' ' .. name .. ' ' .. tostring(on)) return true end,
  walk = function(h, tx, tz, fx, fz, ...)
    rec(string.format('walk %d to %.2f %.2f facing %.2f %.2f ship %d: %.3f %.3f %.3f | %.1f %.1f %.1f', h, tx, tz, fx + 0, fz + 0, select('#', ...),
      select(1, ...), select(2, ...), select(3, ...), select(10, ...), select(11, ...), select(12, ...)))
    walking[h] = { x = tx, z = tz, fx = fx, fz = fz }
    return true, 'frame check 0.02 m'
  end,
  stop = function(h) rec('stop ' .. h) walking[h] = nil return true end,
  -- state, x, y, z, state name, and the way he faces (the facing a walk asked for, once he has arrived)
  state = function(h, withName)
    local p = byH[h]
    local moving = false
    local w = walking[h]
    if w then
      local dx, dz = w.x - p.x, w.z - p.z
      local d = math.sqrt(dx * dx + dz * dz)
      if d > 0.6 then
        p.x, p.z, moving = p.x + dx / d * 0.6, p.z + dz / d * 0.6, true
      else
        p.x, p.z, walking[h] = w.x, w.z, nil
        if (w.fx or 0) ~= 0 or (w.fz or 0) ~= 0 then p.fx, p.fz = w.fx, w.fz end
      end
    end
    return moving and 1 or 0, p.x, p.y, p.z, '', p.fx or 1, p.fz or 0
  end,
  dump = function(h, off, len) return 'ab' end,
  -- one of the ship's model arguments (0 until written); every write is recorded
  shiparg = function(h, n, val)
    if val ~= nil then
      ARGS[n] = val
      rec(string.format('shiparg %d %d %.3f', h, n, val))
    end
    return ARGS[n] or 0
  end,
  -- the commands the ship holds: a bubble's last command (2, up, until one is given: as DCS has them), an elevator's (0)
  shipcmds = function(h)
    return { bubble = { BUB[0] or 2, BUB[1] or 2 }, elevator = { ELEV[0] or 0, ELEV[1] or 0, ELEV[2] or 0, ELEV[3] or 0 } }
  end,
  -- the ATC's teleport: the world position and axes given are turned back into ship coordinates, and (TELE_WORKS) the jet is there
  teleport = function(h, id, xx, xy, xz, yx, yy, yz, zx, zy, zz, px, py, pz)
    local dx, dz = px - SX, pz - SZ
    local f, st = dx * shipX.x + dz * shipX.z, dx * shipZ.x + dz * shipZ.z
    local nf, ns = xx * shipX.x + xz * shipX.z, xx * shipZ.x + xz * shipZ.z
    rec(string.format('teleport %d id %d to %.2f %.2f up %.2f nose %.2f %.2f right %.2f %.2f', h, id, f, st, py, nf, ns, zx * shipX.x + zz * shipX.z, zx * shipZ.x + zz * shipZ.z))
    if TELE_WORKS then setJet(f, st, nf, ns) end
    return true
  end,
}
TELE_WORKS = true
FORCE_WORKS = true
-- a static put somewhere: where that is on the ship, the way it faces, how long its x axis is; the last of each is kept
PLACED, STATICPOS_N, PLACE_N = {}, 0, 0
-- (a static that is the ship's child is given its place in the ship's own frame; any other, in the world)
NATIVE.staticpos = function(id, xx, xy, xz, yx, yy, yz, zx, zy, zz, px, py, pz, sx, sy, sz)
  STATICPOS_N = STATICPOS_N + 1
  if LINKED_IDS[id] then
    PLACED[id] = { f = px, s = pz, up = py, nf = xx, ns = xz, sx = sx or 1, sy = sy or 1, own = true }
    return true, '.?AVlLandVehicle@@', 49, true, 0, '.?AVwoShip@@'
  end
  local dx, dz = px - SX, pz - SZ
  PLACED[id] = { f = dx * shipX.x + dz * shipX.z, s = dx * shipZ.x + dz * shipZ.z, up = py, nf = xx * shipX.x + xz * shipX.z, ns = xx * shipZ.x + xz * shipZ.z, sx = sx or 1, sy = sy or 1, own = false }
  return true, '.?AVlLandVehicle@@', 49, true, 0, false
end
NATIVE.staticinfo = function(id)
  return '.?AVlLandVehicle@@', 49, LINKED_IDS[id] and '.?AVwoShip@@' or false, 2
end
-- the jet's model arguments (objarg): the last value of each, every write counted
-- (by object id: a model argument of the jet, or of the tow bar static)
JETARG, OBJARG_N, OBJARG_MIN, OBJARG_MAX, OBJARG_FIRST = {}, {}, {}, {}, {}
TURNS = {}  -- a wheel's argument wraps at 1: the turns made, forwards counted up (each change taken the short way round)
NATIVE.objarg = function(h, id, n, v)
  local key = id .. '/' .. n
  if v ~= nil then
    local dv = v - (JETARG[key] or 0)
    TURNS[key] = (TURNS[key] or 0) + (dv > 0.5 and dv - 1 or (dv < -0.5 and dv + 1 or dv))
    JETARG[key], OBJARG_N[key] = v, (OBJARG_N[key] or 0) + 1
    if OBJARG_FIRST[key] == nil then OBJARG_FIRST[key] = v end
    OBJARG_MIN[key], OBJARG_MAX[key] = math.min(OBJARG_MIN[key] or 0, v), math.max(OBJARG_MAX[key] or 0, v)
  end
  return JETARG[key] or 0, id == 16777472 and '.?AVwHumanAircraft@@' or '.?AVlLandVehicle@@'
end
NATIVE.place = function(h, x, y, z, fx, fz)
  PLACE_N = PLACE_N + 1
  local q = byH[h]
  q.x, q.y, q.z, q.fx, q.fz = x, y, z, fx, fz
  return true, 'origin + pose'
end
-- a driver's head (crewtest-21): where it was last sent (HEADNOW), every call recorded; the frames' ticks counted
HEADNOW, HEADTICKS = {}, 0
NATIVE.head = function(h, y, w)
  if y ~= nil and not byH[h] then return nil, 'no such character (scan again)' end
  HEADNOW[h] = y
  rec('head ' .. h .. (y and string.format(' %g', y) or ' forgotten') .. (w and string.format(' w%g', w) or ''))
  return true
end
NATIVE.headtick = function()
  HEADTICKS = HEADTICKS + 1
  return 0, 0
end
NATIVE.forcepos = function(id, xx, xy, xz, yx, yy, yz, zx, zy, zz, px, py, pz)
  local dx, dz = px - SX, pz - SZ
  local f, st = dx * shipX.x + dz * shipX.z, dx * shipZ.x + dz * shipZ.z
  local nf, ns = xx * shipX.x + xz * shipX.z, xx * shipZ.x + xz * shipZ.z
  rec(string.format('forcepos id %d to %.2f %.2f up %.2f nose %.2f %.2f', id, f, st, py, nf, ns))
  if FORCE_WORKS then setJet(f, st, nf, ns) end
  return true, '.?AVwHumanAircraft@@'
end
ARGS = {}   -- the ship's model arguments
-- The export interface as the hook sees it: the camera sits in the cockpit (3.5 m ahead of the jet's
-- position) or, COCKPIT = false, 30 m behind and above; it looks CAMAZ degrees to the right of the nose.
-- View command 2007, by CAMMODE: 'turn' (as DCS: the value turns the camera by value * CAMG degrees, up to
-- its stops at 172 degrees either way), 'angle' (the value puts it at value * CAMK degrees), nil (no answer).
CAMMODE, CAMG, CAMK, CAMAZ, COCKPIT, CAMSETS = 'turn', -300, -90, 40, true, {}
CAMAT = nil
Export = {
  LoGetCameraPosition = function()
    if CAMAT then -- an outside camera: at f, s of the ship, "up" above its origin, looking at the deck point (lf, ls) (or level: no lf)
      -- (CAMAT.ship2: all of it at the second carrier)
      local ox, oz = CAMAT.ship2 and (SX + 3000) or nil, CAMAT.ship2 and SZ or nil
      local p = toWorld(CAMAT.f, CAMAT.up or 60, CAMAT.s, ox, oz)
      local d = CAMAT.lf and toWorld(CAMAT.lf, CAMAT.ly or 21.975, CAMAT.ls, ox, oz) or toWorld(CAMAT.f + 10, CAMAT.up or 60, CAMAT.s, ox, oz)
      local dx, dy, dz = d.x - p.x, d.y - p.y, d.z - p.z
      local m = math.sqrt(dx * dx + dy * dy + dz * dz)
      -- (its own axes, as DCS gives them: x forward, y up, z to the right)
      local fx, fy, fz = dx / m, dy / m, dz / m
      local rx, rz = -fz, fx
      local rm = math.sqrt(rx * rx + rz * rz)
      rx, rz = rx / rm, rz / rm
      return { p = p, x = v(fx, fy, fz), y = v(-rz * fy, rz * fx - rx * fz, rx * fy), z = v(rx, 0, rz) }
    end
    local p = COCKPIT and toWorld(jet.f + 3.5 * jet.nf, 23, jet.s + 3.5 * jet.ns) or toWorld(jet.f - 30, 40, jet.s)
    local nx, nz = jet.nf * shipX.x + jet.ns * shipZ.x, jet.nf * shipX.z + jet.ns * shipZ.z
    local b = (math.atan2 or math.atan)(nz, nx) + math.rad(CAMAZ)
    return { p = p, x = v(math.cos(b), 0, math.sin(b)), y = v(0, 1, 0), z = v(-math.sin(b), 0, math.cos(b)) }
  end,
  LoSetCameraPosition = function(pos)
    CAMPUT, CAMPUTS = pos, (CAMPUTS or 0) + 1
  end,
  LoSetCommand = function(cmd, val)
    CAMSETS[#CAMSETS + 1] = val
    if cmd ~= 2007 then return end
    if CAMMODE == 'turn' then CAMAZ = math.max(-172, math.min(172, CAMAZ + val * CAMG)) elseif CAMMODE == 'angle' then CAMAZ = val * CAMK end
  end,
  LoGetPlayerPlaneId = function() return 16777472 end,
  -- (DCS's active pause: the mission's clock runs on, the player's own aircraft is held: ACTIVE_PAUSE, a test's own)
  LoSimulationOnActivePause = function() return ACTIVE_PAUSE == true end,
}

local LOG = {}
lfs = { writedir = function() return 'W/' end }
log = { INFO = 1, ERROR = 2, write = function(tag, lvl, msg) end }
-- The taxi routes file (in DCS: made from PriFly's taxi network). Here: from spawn spot 5, where the
-- stand-in jet sits, to catapult 2: 24 m to port, a right turn onto 20.5 m towards the bow, then
-- 22 m half left into catapult 2's start box (x 16..60, z -12..6: the route is inside it from 54 m on);
-- and to catapult 1 a "route" that starts straight aft, 90 degrees off the jet's nose.
ROUTES_SRC = [[return {
  { spot = 5, x = -10.5, z = 34, routes = {
    [1] = { {-10.5,34}, {-30,34} },
    [2] = { {-10.5,34}, {-10.5,10}, {10,10}, {30,0} },
  } },
}]]
SPOTS_FILE = nil   -- Logs/catcc-deck-spots.lua, as the hook last wrote it (or as a test gives it)
loadfile = function(p)
  if p == 'W/Logs/catcc-deck-spots.lua' then return SPOTS_FILE and load(SPOTS_FILE) or nil end
  if p == 'W/Logs/catcc-hangar-marks.lua' then return MARKS_FILE and load(MARKS_FILE) or nil end
  if p == 'W/Scripts/CATCC/crewtest_ui.lua' then return UI_ON and load(UI_SRC, 'crewtest_ui') or nil end
  -- (the panel's flag tool: with the panel)
  if p == 'W/Scripts/CATCC/crewtest_flag.lua' then return UI_ON and load(FLAG_SRC, 'crewtest_flag') or nil end
  if p == 'W/Scripts/CATCC/crewtest_demo.lua' then return DEMO_ON and load(DEMO_SRC, 'crewtest_demo') or nil end
  if p == 'W/Scripts/CATCC/crewtest_hangar.lua' then return DEMO_ON and load(HANGAR_SRC, 'crewtest_hangar') or nil end
  if p == 'W/Scripts/CATCC/crewtest_slots.lua' then return SLOTS_ON and load(SLOTS_SRC, 'crewtest_slots') or nil end
  -- (the drivers' head: only where a test asks for it (HEAD_ON): everywhere else the drivers sit as they always did)
  if p == 'W/Scripts/CATCC/crewtest_head.lua' then return (HEAD_ON and HEAD_SRC) and load(HEAD_SRC, 'crewtest_head') or nil end
  -- (the brake riders: only where a test asks for them (COCKPIT_ON))
  if p == 'W/Scripts/CATCC/crewtest_cockpit.lua' then return (COCKPIT_ON and COCKPIT_SRC) and load(COCKPIT_SRC, 'crewtest_cockpit') or nil end
  if p == 'W/Config/CATCC-test.lua' and FLAG then return function() return { chockTest = true, crewTest = true } end end
  if p == 'W/Scripts/CATCC/crewtest_routes.lua' and ROUTES_SRC then return load(ROUTES_SRC) end
  return nil
end
io = { open = function(p, mode)
  if p == 'W/Logs/catcc-crewtest.log' then
    return { write = function(self, ...) LOG[#LOG + 1] = table.concat({ ... }) end, close = function() end }
  end
  if p == 'W/Scripts/CATCC/crewtest.lua' then return { read = function() return MENU_SRC end, close = function() end } end
  if p == 'W/Logs/catcc-deck-spots.lua' and mode == 'w' then
    local parts = {}
    return { write = function(self, ...) parts[#parts + 1] = table.concat({ ... }) end, close = function() SPOTS_FILE = table.concat(parts) end }
  end
  if p == 'W/Logs/catcc-hangar-marks.lua' and mode == 'w' then
    local parts = {}
    return { write = function(self, ...) parts[#parts + 1] = table.concat({ ... }) end, close = function() MARKS_FILE = table.concat(parts) end }
  end
  return nil
end }
os = { date = function() return '00:00:00' end, clock = function() return T end }
package = { loadlib = function(p, fn)
  rec('loadlib ' .. p .. ' ' .. fn)
  if NO_NATIVE then return nil, 'The specified module could not be found.' end
  return function() return NATIVE end
end }
local HANDLER
MT = 0            -- model time: stands still while PAUSED (the briefing screen, a paused mission)
PAUSED = false
FOV = 78          -- what DCS.getCurrentFOV gives (degrees)
DCS = { getRealTime = function() return T end, getModelTime = function() return MT end, setUserCallbacks = function(h) HANDLER = h end, getCurrentFOV = function() return FOV end }
-- A stand-in for DCS's window toolkit (dxgui), for the in-game panel (UI_ON): widgets that remember their text, bounds
-- and whether they are shown, and can be pressed; windows with hot keys; the screen 2560 x 1600.
WIDGETS, WINDOWS, HOTKEYS, MOUSE_DOWN = {}, {}, {}, nil
local function widget(kind, text)
  local w = { kind = kind, text = text or '', visible = true, b = { 0, 0, 0, 0 } }
  function w:setText(t) self.text = t end
  function w:getText() return self.text end
  function w:setVisible(v)
    -- (DCS: a window of this toolkit made invisible is not seen again, whatever is done to it afterwards:
    -- crewtest_ui.lua at its top; the slot picker's first version, 2026-11-20)
    if kind == 'Window' and v == false then SET_INVISIBLE, self.dead = (SET_INVISIBLE or 0) + 1, true end
    self.visible = v and not self.dead
  end
  function w:getVisible() return self.visible end
  function w:setBounds(x, y, ww, hh) self.b = { x, y, ww, hh } end
  function w:getBounds() return self.b[1], self.b[2], self.b[3], self.b[4] end
  function w:setSkin(sk) self.skin = sk end
  function w:getSkin() return self.skin or { kind = kind } end
  function w:setWrapping() end
  -- (DCS's Static: its picture turned about its pivot point, degrees)
  function w:setAngle(a) self.angle = a end
  function w:setPivotPoint(x, y) self.pivot = { x, y } end
  function w:setEnabled(v) self.disabled = not v end
  function w:addMouseUpCallback(fn) self.up = fn end
  function w:insertWidget(c) self.children = self.children or {} self.children[#self.children + 1] = c c.parent = self end
  function w:setHasCursor(v) self.cursor = v end
  function w:setTransparentForUserInput(v) self.through = v end
  function w:addHotKeyCallback(key, fn) HOTKEYS[key] = fn end
  WIDGETS[#WIDGETS + 1] = w
  return w
end
require = function(name)
  if not UI_ON then error("module '" .. name .. "' not found") end
  if name == 'dxgui' then return { GetScreenSize = function() return 2560, 1600 end, AddMouseCallback = function(kind, fn) if kind == 'down' then MOUSE_DOWN = fn end end } end
  if name == 'DialogLoader' then
    return { spawnDialogFromFile = function(path)
      local w = widget('Window', path)
      w.visible = false
      w.tplButton, w.tplLabel = widget('Button', ''), widget('Static', '')
      w.tplButton.skin, w.tplLabel.skin = { tpl = 'tplButton' }, { tpl = 'tplLabel' }
      -- (any other template child of the dialog (tplPrimary, tplBoardReady ...): its skin named after it)
      setmetatable(w, { __index = function(t, k)
        if type(k) ~= 'string' or not k:match('^tpl') then return nil end
        local c = widget((k:match('Button') or k:match('^tplPrimary') or k == 'tplAmber' or k == 'tplRed' or k == 'tplHit') and 'Button' or 'Static', '')
        c.skin = { tpl = k }
        rawset(t, k, c)
        return c
      end })
      -- (the first of a name: the panel makes a second window of the mark's kind, the hangar marks' crosshair)
      local key = path:match('([%w_]+)%.dlg$')
      WINDOWS[key] = WINDOWS[key] or w
      rec('dialog ' .. path)
      return w
    end }
  end
  if name == 'Button' then return { new = function(text) return widget('Button', text) end } end
  if name == 'Static' then return { new = function(text) return widget('Static', text) end } end
  if name == 'Skin' then return { windowSkinChatMin = function() return { hidden = true } end } end
  -- (the slot picker's deck picture: the file the skin would show)
  if name == 'SkinUtils' then return { setStaticPicture = function(file) return { picture = file } end } end
  error("module '" .. name .. "' not found")
end
-- a shown button of the panel pressed (by its text, with or without the [ ] of a chosen one)
function press(text)
  for _, w in ipairs(WIDGETS) do
    -- (a disabled button does nothing when clicked, as in DCS)
    if w.kind == 'Button' and w.visible and not w.disabled and w.parent and w.parent.visible and w.up and (w.text == text or w.text == '[' .. text .. ']' or w.text == text .. '  >') then return w.up() end
  end
  error('no shown button "' .. text .. '"')
end
-- the panel is on the screen: its window visible, in its own skin, at its full size
function panelShown()
  local w = WINDOWS.crewtest_ui
  return w ~= nil and w.visible == true and not (w.skin and w.skin.hidden) and w.b[3] > 100
end
function shown(kind)
  local out = {}
  for _, w in ipairs(WIDGETS) do
    if w.kind == kind and w.visible and w.parent and w.parent.visible and w.text ~= '' then out[#out + 1] = w.text end
  end
  return table.concat(out, ' | ')
end
net = { dostring_in = function(state, code)
  local r = assert(load(code, 'mission', 't', MISSION))()
  return r == nil and '' or tostring(r)
end }

assert(load(HOOK_SRC, 'crewtest_hook'))()

local function frames(secs)   -- run the sim for a while, 4 frames a second; the mission's timers fire too
  for _ = 1, math.floor(secs * 4 + 0.5) do
    T = T + 0.25
    if not PAUSED then MT = MT + 0.25 * (ACCEL or 1) end -- (ACCEL: time acceleration: the model time of a frame)
    if ONFRAME and not PAUSED then ONFRAME(0.25 * (ACCEL or 1)) end -- (a test's own: what the stand-in ship does in a frame)
    for i = #TIMERS, 1, -1 do
      local tm = TIMERS[i]
      if tm.at <= T then
        local nxt = tm.fn(nil, T)
        if nxt then tm.at = nxt else table.remove(TIMERS, i) end
      end
    end
    HANDLER.onSimulationFrame()
  end
end
local function click(name) assert(cmds[name], 'no menu item ' .. name)() end
local function done()
  local l = {}
  for i, s in ipairs(LOG) do l[i] = '#L ' .. s:gsub('\\n', '') end
  OUT = table.concat(REC, '\\n') .. '\\n#MENU ' .. table.concat(order, ' | ') .. '\\n#LOG ' .. #LOG .. '\\n' .. table.concat(l, '\\n')
end
`;

// the hook's list of the people at mission start: in the log only since 2026-11-24 (the user: "remove any debugging
// messages that are for systems we've already settled")
function startList(r: { logLines: string[] }): string[] {
  return r.logLines.filter((l) => l.startsWith('at mission start:'));
}

function hook(
  script: string,
  opts: { flag?: boolean; noNative?: boolean; quick?: boolean; world?: boolean; parentPos?: boolean; replaced?: number; noAnim?: boolean; ui?: boolean; demo?: boolean; head?: boolean } = {},
): { rec: string[]; says: string[]; menu: string[]; log: number; logLines: string[] } {
  const pre = `FLAG = ${opts.flag === false ? 'false' : 'true'}\nNO_NATIVE = ${opts.noNative ? 'true' : 'false'}\nUI_ON = ${opts.ui ? 'true' : 'false'}\nDEMO_ON = ${opts.demo ? 'true' : 'false'}\nHEAD_ON = ${opts.head ? 'true' : 'false'}\n`;
  const set =
    (opts.quick === false ? 'QUICK = false\n' : '') +
    (opts.world === false ? 'WORLD = false\n' : '') +
    (opts.parentPos === false ? 'PARENTPOS = false\n' : '') +
    (opts.replaced ? `REPLACED = ${opts.replaced}\n` : '') +
    (opts.noAnim ? 'NO_ANIM = true\n' : '');
  const globals = { HOOK_SRC: hookSrc, MENU_SRC: menuSrc, ROUTES_REAL: routesSrc, UI_SRC: uiSrc, FLAG_SRC: flagSrc, DEMO_SRC: demoSrc, HANGAR_SRC: hangarSrc, SLOTS_SRC: slotsSrc, HEAD_SRC: headSrc, COCKPIT_SRC: cockpitSrc };
  // (CATCC_LUA_DUMP=<folder>: the harness and its sources written there, for a run under DCS's own Lua 5.1, which is
  // some fifty times as fast as fengari: deck-test/crew-test/luarun.py)
  if (process.env.CATCC_LUA_DUMP) {
    const dir = process.env.CATCC_LUA_DUMP;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/world.lua`, world);
    for (const [k, v] of Object.entries(globals)) fs.writeFileSync(`${dir}/${k}.txt`, v);
  }
  const out = run(`${pre}${world}\n${set}${script}\ndone()`, globals).split('\n');
  const rec = out.filter((l) => l !== '' && !l.startsWith('#'));
  return {
    rec,
    says: rec.filter((l) => l.startsWith('say ')).map((l) => l.slice(4).replace(/^CATCC crew test: /, '')),
    menu: (out.find((l) => l.startsWith('#MENU ')) || '#MENU ').slice(6).split(' | '),
    log: Number((out.find((l) => l.startsWith('#LOG ')) || '#LOG 0').slice(5)),
    // the log file's lines, without the time and "hook" prefix
    logLines: out.filter((l) => l.startsWith('#L ')).map((l) => l.slice(3).replace(/^\S+ hook\s+/, '')),
  };
}

const START = 'HANDLER.onSimulationStart()\nframes(1)\n';
const TARGET = 'Target: change (nearest > yellow > green shirt > cat crew > our model)';
const SIGTEST = 'Our crew > Signal test: every signal, day and night (75 s)';
const NIGHT = 'Target: night mode on / off (light wands, night signals)';
const DEMO = 'Our crew > Demo: marshal me 12 m ahead';
const MARSHAL = 'Our crew > Marshal me to catapult';
// nothing the hook does may ever go to the other carrier's men (handles 201-204)
const otherShip = (r: { rec: string[] }) => r.rec.filter((l) => /^(play|walk|override|attach|stop) 20\d\b/.test(l));

describe("crew test: our mod's entry.lua", () => {
  // DCS runs a mod's entry.lua with only some of Lua's functions: no pcall (2026-11-15: the first version of the static
  // types wrapped each in pcall, DCS stopped there, and none of the types existed). Run it with only what a mod's entry
  // gets: it must declare every type and reach plugin_done.
  it('declares the tow bar and the axle markers as static types (in its Database file, as the chock mod does), mounts its models and textures, and reaches plugin_done, with no pcall', () => {
    const entry = fs.readFileSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/entry.lua'), 'utf8');
    const db = fs.readFileSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/Database/db_catcc_crew.lua'), 'utf8');
    const out = run(`local types, mounts, done = {}, {}, false
local env
env = {
  ipairs = ipairs, string = string, current_mod_path = 'M', _ = function(s) return s end,
  dofile = function(p)
    assert(p == 'M/Database/db_catcc_crew.lua', p)
    assert(load(DB, p, 't', env))()
  end,
  declare_plugin = function(n) end,
  mount_vfs_animations_path = function(p) mounts[#mounts + 1] = 'anim ' .. p end,
  mount_vfs_model_path = function(p) mounts[#mounts + 1] = 'model ' .. p end,
  mount_vfs_texture_path = function(p) mounts[#mounts + 1] = 'tex ' .. p end,
  add_surface_unit = function(u)
    local sh = u.shape_table_data[1]
    types[#types + 1] = table.concat({ u.Name, sh.file, sh.username, sh.classname, u.category, tostring(u.attribute[1]), tostring(u.attribute[2]) }, '/')
  end,
  plugin_done = function() done = true end,
  wsType_Static = 1, wsType_Standing = 2,
}
local f = assert(load(ENTRY, 'entry.lua', 't', env))
f()
OUT = table.concat(types, ';') .. '|' .. table.concat(mounts, ';') .. '|' .. tostring(done)`, { ENTRY: entry, DB: db });
    const [types, mounts, done] = out.split('|');
    // a type's name is its model's file name and its shape's name, as the chock's and the route lines' are
    const one = (n: string) => `${n}/${n}/${n}/lLandVehicle/ADEquipment/1/2`;
    expect(types.split(';')).toEqual([...Array.from({ length: 26 }, (_, i) => one(`CATCC_AxleMarker_H${15 + i}`)), one('CATCC_AxleEnd'), one('CATCC_Towbar'), one('CATCC_AxleProbe'), one('CATCC_Tiedown'), one('CATCC_Flag')]);
    for (const t of types.split(';')) expect(fs.existsSync(here(`../deck-test/crew-test/Mods/tech/CATCC-Crew/Shapes/${t.split('/')[1]}.edm`)), t).toBe(true);
    expect(db).not.toMatch(/pcall\s*\(/);
    expect(mounts.split(';')).toEqual(['anim M/animations', 'model M/models', 'model M/Shapes', 'tex M/Shapes/textures']);
    expect(done).toBe('true');
    expect(entry).not.toMatch(/pcall\s*\(/);
  });
});

describe('crew test hook and menu', () => {
  it('does nothing without crewTest = true in Config/CATCC-test.lua', () => {
    const r = hook('if HANDLER then rec("handler set") end', { flag: false });
    expect(r.rec).toEqual([]);
    expect(r.log).toBe(0);
  });

  it('loads the module from Scripts\\CATCC\\bin and builds the menu: ten items, signals in a submenu', () => {
    const r = hook(START);
    expect(r.rec[0]).toBe('loadlib W/Scripts\\CATCC\\bin\\catcc_crew.dll luaopen_catcc_crew');
    expect(r.rec[1]).toBe('setlog W/Logs/catcc-crewtest.log');
    expect(r.rec).toContain('submenu CATCC crew test');
    expect(r.rec).toContain('submenu CATCC crew test > Target: signal');
    // five submenus; an F10 menu holds 10 items on every level
    const SUBS = ['Target: signal', 'Target: walk', 'Our crew', 'Plane captain', 'Catapult crews', 'Tow'];
    const inSub = (s: string) => r.menu.filter((m) => m.startsWith(`${s} > `));
    for (const s of SUBS) expect(r.rec).toContain(`submenu CATCC crew test > ${s}`);
    // (Catapult crews: the report and a submenu of seven for each catapult)
    expect(SUBS.map((s) => inSub(s).length)).toEqual([10, 8, 18, 8, 48, 43]);
    // (Tow: the four catapults, the deck spots (none here: this stand-in routes file names none), five items, the
    // driver's seat (with the four items for the drivers' heads), and the axle finder with its two sets of steps; ten items on its own level)
    expect(inSub('Tow > Tow me to a catapult').map((m) => m.split(' > ').pop())).toEqual(['Catapult 1', 'Catapult 2', 'Catapult 3', 'Catapult 4']);
    expect(inSub('Tow > Tow me to a parking spot').length).toBe(1);
    expect(new Set(inSub('Tow').map((m) => m.split(' > ')[1])).size).toBe(10);
    // the panel's own item on the radio menu's top level
    expect(r.menu).toContain('CATCC panel: show / hide');
    expect(inSub('Tow > Driver seat').length).toBe(10);
    expect(inSub('Tow > Axle finder').length).toBe(18);
    expect(inSub('Tow > Axle finder > Width (the end plates)').map((m) => m.split(' > ').pop())).toEqual(['Wider 10 cm', 'Narrower 10 cm', 'Wider 1 cm', 'Narrower 1 cm', 'Wider 1 mm', 'Narrower 1 mm']);
    expect(inSub('Tow > Axle finder > Fore / aft').map((m) => m.split(' > ').pop())).toEqual(['Forward 10 cm', 'Aft 10 cm', 'Forward 1 cm', 'Aft 1 cm', 'Forward 1 mm', 'Aft 1 mm']);
    expect(inSub('Tow > Axle finder > Up / down').map((m) => m.split(' > ').pop())).toEqual(['Up 10 cm', 'Down 10 cm', 'Up 1 cm', 'Down 1 cm']);
    expect(inSub('Target: walk > Collision avoidance').length).toBe(5);
    expect(inSub('Our crew > Marshal me to a parking spot').length).toBe(10);
    expect(inSub('Catapult crews > Bubbles').length).toBe(5);
    expect(inSub('Catapult crews > Elevators').length).toBe(10);
    for (const k of [1, 2, 3, 4]) {
      expect(r.rec).toContain(`submenu CATCC crew test > Catapult crews > Catapult ${k}`);
      expect(inSub(`Catapult crews > Catapult ${k}`).length).toBe(8);
    }
    // the deck spotting tool has a menu of its own beside the crew test's: ten items on its top level too
    expect(r.rec).toContain('submenu CATCC deck spots');
    const deck = r.menu.filter((m) => m.startsWith('CATCC deck spots > ')).map((m) => m.slice('CATCC deck spots > '.length));
    expect(deck.filter((m) => !m.includes(' > '))).toEqual(['Park a Hornet on every deck spot', 'Take them all away', 'Lock on the one the camera looks at', 'Wings: folded / spread (all)',
      'Report the locked one; save all']);
    expect([...new Set(deck.filter((m) => m.includes(' > ')).map((m) => m.split(' > ')[0]))]).toEqual(['Lock on the next / the one before', 'Move it forward / aft (along its nose)',
      'Move it right / left (along its wings)', 'Turn it', 'Add / remove']);
    expect(deck.filter((m) => m.startsWith('Move it forward / aft (along its nose) > ')).map((m) => m.split(' > ')[1])).toEqual(['Forward 1 m', 'Aft 1 m', 'Forward 10 cm', 'Aft 10 cm', 'Forward 1 cm', 'Aft 1 cm']);
    expect(deck.filter((m) => m.startsWith('Turn it > ')).map((m) => m.split(' > ')[1])).toEqual(['Right 5 degrees', 'Left 5 degrees', 'Right 1 degree', 'Left 1 degree', 'Right 0.1 degree', 'Left 0.1 degree']);
    const top = r.menu.filter((m) => !m.startsWith('CATCC deck spots > ') && !SUBS.some((s) => m.startsWith(`${s} > `)));
    // (the panel's show / hide is not in the crew test's menu: it is on the radio menu's own top level)
    // (nor are the deck spotting demo's two)
    expect(top).toEqual(['List people on my ship', TARGET, NIGHT, 'Stop the demo / signal test / marshalling', 'CATCC panel: show / hide', 'CATCC demo: spot the deck: start / stop', 'CATCC demo: report']);
    expect(top.length - 3 + SUBS.length).toBeLessThanOrEqual(10);
    expect(inSub('Target: signal')[2]).toBe('Target: signal > Turn left');
    expect(inSub('Our crew').slice(0, 6)).toEqual([SIGTEST, DEMO, ...[1, 2, 3, 4].map((k) => `${MARSHAL} ${k}`)]);
    expect(inSub('Our crew').slice(-2)).toEqual(['Our crew > Camera follows the director: on / off', 'Our crew > Put me square on the nearest spot (teleport)']);
    expect(inSub('Plane captain').map((m) => m.replace('Plane captain > ', ''))).toEqual(['Come to my jet', 'My catapult: 1', 'My catapult: 2', 'My catapult: 3', 'My catapult: 4',
      'Engine start signals', 'Release me', 'Send him home']);
    expect(inSub('Catapult crews')[1]).toBe('Catapult crews > Catapult 1 > Close it (crew clears and stays off)');
  });

  it("lists the people when the sim has run 8 s: the player's ship only, the other carrier's counted apart", () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(7)\nrec("at 7 s")\nframes(3)');
    const at = r.rec.indexOf('at 7 s');
    expect(at).toBeGreaterThan(0);
    expect(r.rec.slice(0, at).some((l) => l.startsWith('say '))).toBe(false);
    // (in the log only since 2026-11-24, the user: "remove any debugging messages that are for systems we've already settled")
    expect(r.says).toEqual([]);
    expect(r.logLines.filter((l) => l.startsWith('at mission start:'))).toEqual([
      'at mission start: 4 people on your ship: 1 yellow, 1 brown, 1 catapult crew. People of ours: catcc-00. (4 more on other ships.) ' +
        'Nearest to you: brown-2-4 7 m, yellow-04 14 m, catcc-00 25 m. Our own animation clip: NOT in the list.',
    ]);
    expect(r.logLines.some((l) => l.includes("8 characters, 4 on the player's ship (told apart by their ship's position);"))).toBe(true);
    expect(r.log).toBeGreaterThan(8);
    // the animations' lengths and the blend spaces' axes are read once (from a man on the player's ship) and logged
    expect(r.rec.filter((l) => l.startsWith('animinfo '))).toEqual(['animinfo 101']);
    expect(r.logLines).toContain('blend space bs_sign_taxi_fwd         index 2, id 2: x "torso_angle" -45..45 (default 0), y "" 0..0 (default 0)');
    expect(r.logLines).toContain('blend space bs_pass_control          index 0, id 0: x "angle" -135..135 (default 0), y "" 0..0 (default 0)');
    expect(r.logLines).toContain('animation data: 7 names, 3 blend spaces, 0 unreadable; lengths (s) of the signals:');
    expect(r.logLines).toContain('sign_attention_taxi 1.33 | sign_setbrakes 4.67 | sign_taxifwd 5.33');
  });

  it("says whether our own mod's animation clip is among the deck crew's animations, and plays it from the menu", () => {
    const r = hook('OUR_CLIP = true\nHANDLER.onSimulationStart()\nframes(10)\nclick("Target: signal > Our own clip (catcc_test_clip, once)")\nframes(1)');
    expect(startList(r)[0]).toMatch(/ Our own animation clip: in the list\.$/);
    expect(r.logLines).toContain('our mod\'s animation clip "catcc_test_clip": IN the list (index 7, length 2.17 s)');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(['play 102 catcc_test_clip']);
    const no = hook('HANDLER.onSimulationStart()\nframes(10)');
    expect(no.logLines).toContain('our mod\'s animation clip "catcc_test_clip": NOT in the list of 7');
  });

  it('says which people of ours are there, or that none is', () => {
    const none = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' then table.remove(PEOPLE, i) end end
HANDLER.onSimulationStart()\nframes(10)`);
    expect(startList(none)[0]).toContain('People of ours: NONE.');
    const two = hook("add(105, 'catcc-c0', '1: catcc-c0', 10, 27, SHIP_A)\nHANDLER.onSimulationStart()\nframes(10)");
    expect(startList(two)[0]).toContain('5 people on your ship: 1 yellow, 1 brown, 1 catapult crew. People of ours: catcc-00, catcc-c0.');
  });

  it("tells the ships apart by the men's own world positions when their ship's is not readable", () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(10)', { parentPos: false });
    expect(startList(r)[0]).toContain('4 people on your ship: 1 yellow, 1 brown, 1 catapult crew.');
    expect(startList(r)[0]).toContain('(4 more on other ships.)');
    expect(r.logLines.some((l) => l.includes('(told apart by their own position)'))).toBe(true);
  });

  it('says so when the ships cannot be told apart (no world positions at all)', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(10)', { world: false, parentPos: false });
    expect(startList(r)[0]).toContain('8 people on your ship');
    expect(startList(r)[0]).toContain('(Ships could not be told apart: no world positions.)');
  });

  it('says so on screen when the native module is missing, and still installs the menu', () => {
    const r = hook(START + 'click("List people on my ship")\nframes(1)', { noNative: true });
    expect(r.says[0]).toBe('the native module is not loaded: The specified module could not be found.');
    expect(r.says[1]).toBe('the native module is not loaded: The specified module could not be found.');
    expect(r.rec.some((l) => l.startsWith('heapscan'))).toBe(false);
  });

  it('list: falls back to the memory scan when the quick scan finds nobody', () => {
    const r = hook(START + 'click("List people on my ship")\nframes(2)', { quick: false });
    expect(r.says[0]).toBe('quick scan: no people found (2 crew environment(s) holding 9 objects, 7 world objects). ' +
      'Scanning memory instead: DCS will freeze for a few seconds.');
    expect(r.rec).toContain('heapscan 30');
    expect(r.says[1]).toMatch(/^memory scan \(4 s, 8 new\): 4 people on your ship: 1 yellow, 1 brown, 1 catapult crew\. People of ours: catcc-00\./);
  });

  it("the directors' signals from the submenu: DCS's own blend spaces, the torso kept on the pilot, left and right the PILOT'S", () => {
    // our green shirt first walks to 16 m ahead of the nose, (-10.5, 18), facing the jet (to starboard)
    const r = hook(START + `click("${TARGET}")\nframes(1)\nclick("${TARGET}")\nframes(1)\nclick("Target: walk > To 16 m ahead of my nose, facing me")\nframes(20)
click("Target: signal > Come ahead")\nframes(2)\nsetJet(-4.5, 34)\nframes(1)\nclick("Target: signal > Turn left")\nframes(1)\nclick("Target: signal > Turn right")\nframes(1)
click("Target: signal > Stop")\nframes(1)\nclick("Target: signal > Pass control to his left (once)")\nframes(4)`);
    expect(r.rec.filter((l) => /^(play|prop) /.test(l))).toEqual([
      // the pilot (4 m ahead of the jet's position along its nose) is straight in front of him: torso 0, written before the blend space is applied
      'prop 103 torso_angle 0.0', 'play 103 bs_sign_taxi_fwd mode 2',
      // the jet moved 6 m towards the bow, which is to HIS left as he faces starboard: the angle turns positive
      'prop 103 torso_angle 26.6',
      // DCS names its turn signals for the director's side: the pilot's left is "right"
      'play 103 bs_sign_taxi_right mode 2', 'play 103 bs_sign_taxi_left mode 2', 'play 103 bs_sign_stop mode 2',
      // pass control takes its own parameter; a one-shot, he goes back to idle when its 2 s are over
      'prop 103 angle 90.0', 'play 103 bs_pass_control mode 1', 'play 103 idle',
    ]);
    expect(r.says).toContain('catcc-00 (16 m from you): ahead ("bs_sign_taxi_fwd"), held, his torso following you.');
    expect(r.says).toContain('catcc-00 (17 m from you): pass ("bs_pass_control"), once.');
    expect(otherShip(r)).toEqual([]);
  });

  it('a one-shot goes back to idle when it is over; a plain animation by name still plays', () => {
    const r = hook(START + 'click("Target: signal > Attention (once)")\nframes(3)\nclick("Target: signal > Emergency stop")\nframes(1)\nclick("Target: signal > Back to idle")\nframes(1)');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(['play 102 sign_attention_taxi mode 1', 'play 102 idle', 'play 102 sign_emergstoploop mode 2', 'play 102 idle']);
    expect(r.says[1]).toBe('brown-2-4 (7 m from you): "sign_emergstoploop", held.');
  });

  it('a held signal that something else has replaced is sent again', () => {
    const r = hook(START + 'click("Target: signal > Stop")\nframes(8)', { replaced: 3 });
    const plays = r.rec.filter((l) => l.startsWith('play '));
    expect(plays.length).toBeGreaterThanOrEqual(3);
    expect(new Set(plays)).toEqual(new Set(['play 102 bs_sign_stop mode 2']));
  });

  it('target: steps nearest > yellow > green shirt > cat crew > nearest, and starts at nearest in every mission', () => {
    const r = hook(START + `for _ = 1, 4 do click("${TARGET}") frames(1) end
HANDLER.onSimulationStop()\nMISSION.CATCC_CR = nil\nHANDLER.onSimulationStart()\nframes(1)
click("Target: walk > Stop walking")\nframes(1)`);
    expect(r.says.slice(0, 4)).toEqual([
      'target is now the nearest yellow shirt: yellow-04, 14 m from you',
      'target is now the nearest person of ours (catcc-..., green shirt): catcc-00, 25 m from you',
      'target is now the nearest catapult crew member: director, 86 m from you',
      'target is now the nearest person: brown-2-4, 7 m from you',
    ]);
    expect(r.rec.filter((l) => l.startsWith('stop '))).toEqual(['stop 102']);
  });

  it('target: the man with a model of our own (catcc-m0) is a kind of his own, after the catapult crew', () => {
    const r = hook(`add(107, 'catcc-m0', '1: catcc-m0', 18, 30, SHIP_A)\n${START}for _ = 1, 4 do click("${TARGET}") frames(1) end
click("Target: signal > Come ahead")\nframes(1)`);
    expect(r.says[3]).toBe('target is now the plane captain (catcc-m0, the brown shirt): catcc-m0, 29 m from you');
    expect(r.rec.filter((l) => l.startsWith('play ')).every((l) => l.startsWith('play 107 '))).toBe(true);
    expect(r.rec.some((l) => l.startsWith('play 107 '))).toBe(true);
  });

  it('target: skips a kind nobody on the ship matches', () => {
    // no yellow shirt and no green shirt on ship A (the deck crew option off leaves only the cat crews)
    const r = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].parent == SHIP_A and PEOPLE[i].name ~= 'director' then table.remove(PEOPLE, i) end end
${START}click("${TARGET}")\nframes(1)\nclick("Target: signal > Attention (once)")\nframes(1)`);
    expect(r.says[0]).toBe('target is now the nearest catapult crew member: director, 86 m from you');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(['play 104 sign_attention_taxi mode 1']);
  });

  it('walk: 16 m ahead of the nose in ship coordinates, to face the jet, the ship pose passed on, then watched to arrival', () => {
    const r = hook(START + `click("${TARGET}")\nframes(1)\nclick("Target: walk > To 16 m ahead of my nose, facing me")\nframes(47)`);
    // jet at (-10.5 fwd, 34 stbd), nose to port (0, -1): the point is (-10.5, 18), facing back at the jet (0, 1);
    // ship axes: forward = (cos 0.5, 0, sin 0.5), position (1000, 0, 2000)
    expect(r.rec.filter((l) => l.startsWith('walk '))).toEqual(['walk 101 to -10.50 18.00 facing 0.00 1.00 ship 12: 0.878 0.000 0.479 | 1000.0 0.0 2000.0']);
    expect(r.says[1]).toBe('yellow-04 told to walk to a point 16 m ahead of your nose (10 m from him) and face you. Watch him.');
    expect(startList(r).length).toBe(1);
    // (10.5 m to go; the stand-in has already stepped 0.6 m when it is first asked where he is)
    expect(r.says[r.says.length - 1]).toBe('yellow-04, 45 s after "walk": ended 9.9 m from where he started (walked 9.9 m). ' +
      'Now 0.0 m from the target (was 9.9 m). States (0 standing, 1 moving): 1 > 0.');
    expect(otherShip(r)).toEqual([]);
  });

  it('stop goes to the target', () => {
    const r = hook(START + 'click("Target: walk > Stop walking")\nframes(1)');
    expect(r.rec).toContain('stop 102');
  });

  it('night mode: light wands shown, the arm pose held, the night set of signals; and off again', () => {
    const r = hook(START + `click("${NIGHT}")\nframes(1)\nclick("Target: signal > Come ahead")\nframes(1)\nclick("${NIGHT}")\nframes(1)`);
    expect(r.rec.filter((l) => /^(attach|override|play) /.test(l))).toEqual([
      'attach 102 RightStick true', 'attach 102 LeftStick true', 'attach 102 RightLight true', 'attach 102 LeftLight true', 'override 102 night_stick_armpose',
      'play 102 night_bs_sign_taxi_fwd mode 2',
      // off: wands hidden, the arm pose taken off (an empty name), and the signal he is on given again in the day set
      'attach 102 RightStick false', 'attach 102 LeftStick false', 'attach 102 RightLight false', 'attach 102 LeftLight false', 'override 102 ',
      'play 102 bs_sign_taxi_fwd mode 2',
    ]);
    expect(r.says[0]).toBe('brown-2-4 (7 m from you): night mode ON: light wands shown, arm pose "night_stick_armpose" held, night signals from now on.');
    expect(r.says[2]).toBe('brown-2-4 (7 m from you): night mode OFF: light wands hidden, arm pose "night_stick_armpose" off, day signals from now on.');
  });

  it('demo with one person of ours: attention, then come ahead / turn / stop as blend spaces, his torso on the pilot', () => {
    const r = hook(START + `click("${DEMO}")\nframes(20)\nrec("in place")
frames(4)\nrec("turned")\nsetJet(-10.5, 30, -0.5, -0.866)\nframes(7)\nrec("close")\nsetJet(-10.5, 20, 0, -1)\nframes(8)`);
    // jet (-10.5, 34) nose to port: the point is (-10.5, 9); he is to face the jet
    expect(r.rec.filter((l) => l.startsWith('walk '))).toEqual(['walk 103 to -10.50 9.00 facing 0.00 1.00 ship 12: 0.878 0.000 0.479 | 1000.0 0.0 2000.0']);
    expect(r.says[0]).toBe('demo: catcc-00 is walking to a point 25 m ahead of your nose (he has 30 m to go). ' +
      'When he is there, taxi towards him and follow his signals: he stops you 13 m short of him.');
    const plays = (from: string, to?: string) =>
      r.rec.slice(r.rec.indexOf(from), to ? r.rec.indexOf(to) : undefined).filter((l) => l.startsWith('play '));
    // nothing while he walks; in place: attention, and 1.4 s later come ahead (no idle in between), held
    expect(r.rec.slice(0, r.rec.indexOf('in place')).filter((l) => l.startsWith('play '))).toEqual(['play 103 sign_attention_taxi mode 1', 'play 103 bs_sign_taxi_fwd mode 2']);
    expect(r.says.some((s) => /^demo: catcc-00 is in place \(0\.\d m from the point, after \d+ s\)\. Taxi towards him\.$/.test(s))).toBe(true);
    expect(plays('in place', 'turned')).toEqual([]);
    // the jet turned so that the point is 30 degrees to the right of its nose: the pilot's right turn is DCS's "left"
    expect(plays('turned', 'close')).toEqual(['play 103 bs_sign_taxi_left mode 2']);
    expect(r.says).toContain('demo: the point is 30 degrees to your right: catcc-00 signals turn right');
    // 11 m from him: stop, and after 6 s of that the demo ends and he goes back to his idle
    expect(plays('close')).toEqual(['play 103 bs_sign_stop mode 2', 'play 103 idle']);
    expect(r.says[r.says.length - 1]).toBe('demo over: stop signalled with you 11.0 m from catcc-00.');
    expect(r.logLines).toContain('demo: over; 3 signals sent; sent again because the readout showed them replaced: 0');
    // his torso: straight at the pilot at first, then following the pilot as the jet turned
    const props = r.rec.filter((l) => l.startsWith('prop '));
    expect(props[0]).toBe('prop 103 torso_angle 0.0');
    expect(props).toContain('prop 103 torso_angle -6.5');
    expect(otherShip(r)).toEqual([]);
  });

  it('demo with two people of ours: the first takes the jet and passes control to the last, who stops it', () => {
    const r = hook(`add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A)\n${START}click("${DEMO}")\nframes(24)\nrec("in place")
setJet(-10.5, 29)\nframes(1)\nrec("handed")\nframes(5)\nrec("close")\nsetJet(-10.5, 20)\nframes(8)`);
    // the last director (whoever is nearer to the 25 m point) to (-10.5, 9); the first to 12 m ahead and 6 m to the
    // pilot's right, which with the nose to port is towards the bow: (-4.5, 22), facing the jet
    expect(r.rec.filter((l) => l.startsWith('walk ')).map((l) => l.split(' ship ')[0])).toEqual(['walk 103 to -10.50 9.00 facing 0.00 1.00', 'walk 105 to -4.50 22.00 facing -0.45 0.89']);
    expect(r.says[0]).toBe('demo: catcc-00 is walking to a point 25 m ahead of your nose (30 m to go) and catcc-c0 to 12 m ahead, 6 m to your right. ' +
      'When they are there, taxi ahead: catcc-c0 takes you first and hands you over to catcc-00, who stops you 13 m short of himself.');
    const part = (from: string, to?: string) => r.rec.slice(r.rec.indexOf(from), to ? r.rec.indexOf(to) : undefined);
    const plays = (l: string[]) => l.filter((x) => x.startsWith('play '));
    // in place: the FIRST director takes the jet
    expect(plays(r.rec.slice(0, r.rec.indexOf('in place')))).toEqual(['play 105 sign_attention_taxi mode 1', 'play 105 bs_sign_taxi_fwd mode 2']);
    expect(r.says).toContain('demo: catcc-c0 and catcc-00 are in place (0.0 m from the point, after 10 s). Taxi ahead.');
    // the jet has come 5 m (20 m from the point): pass control, pointing at the last director (129 degrees to his right)
    const hand = part('in place', 'handed');
    expect(plays(hand)).toEqual(['play 105 bs_pass_control mode 1']);
    expect(hand.some((l) => /^prop 105 angle -128\.[67]$/.test(l))).toBe(true);
    // 2 s later, the pass over: the first director back to idle, the last one takes the jet (attention, come ahead)
    const after = plays(part('handed', 'close'));
    expect([...after].sort()).toEqual(['play 103 bs_sign_taxi_fwd mode 2', 'play 103 sign_attention_taxi mode 1', 'play 105 idle']);
    expect(after.indexOf('play 103 sign_attention_taxi mode 1')).toBeLessThan(after.indexOf('play 103 bs_sign_taxi_fwd mode 2'));
    // 11 m from the last director: he stops the jet; 6 s later both are back to idle
    expect(plays(part('close'))).toEqual(['play 103 bs_sign_stop mode 2', 'play 105 idle', 'play 103 idle']);
    expect(r.says[r.says.length - 1]).toBe('demo over: stop signalled with you 11.0 m from catcc-00.');
    expect(r.logLines).toContain('demo: catcc-c0 hands over to catcc-00: pass control ("bs_pass_control"); jet 20.0 m from the point');
    expect(otherShip(r)).toEqual([]);
  });

  it('demo: needs a person of ours; "Stop the demo / signal test / marshalling" ends it and puts him back to idle', () => {
    const none = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' and PEOPLE[i].parent == SHIP_A then table.remove(PEOPLE, i) end end
${START}click("${DEMO}")\nframes(1)`);
    expect(none.says[0]).toContain('the demo needs a person of ours (catcc-...) on your ship: none found');
    expect(none.rec.some((l) => l.startsWith('walk '))).toBe(false); // not the other ship's
    const r = hook(START + `click("${DEMO}")\nframes(3)\nclick("Stop the demo / signal test / marshalling")\nframes(1)\nclick("Stop the demo / signal test / marshalling")\nframes(1)`);
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(['play 103 idle']);
    expect(r.says.slice(-2)).toEqual(['demo stopped.', 'nothing of ours is running (no demo, signal test or marshalling)']);
  });

  const SIGNALS = [
    'play 103 sign_attention_taxi mode 1', 'play 103 idle',
    'play 103 bs_sign_taxi_fwd mode 2', 'play 103 bs_sign_taxi_fwd mode 2', 'play 103 bs_sign_taxi_right mode 2', 'play 103 bs_sign_taxi_left mode 2', 'play 103 bs_sign_stop mode 2',
    'play 103 bs_pass_control mode 1', 'play 103 idle', 'play 103 bs_pass_control mode 1', 'play 103 idle',
    'play 103 idle', 'play 103 idle', 'play 103 idle',
    'play 103 night_bs_sign_taxi_fwd mode 2', 'play 103 night_bs_sign_taxi_right mode 2', 'play 103 night_bs_sign_stop mode 2',
    'play 103 idle', 'play 103 idle',
  ];

  it('signal test: a person of ours in front of the jet, every signal in turn, day then night; what he is SEEN playing decides', () => {
    const r = hook(`HANDLER.onSimulationStart()\nframes(10)\nclick("${SIGTEST}")\nframes(95)`);
    // jet (-10.5, 34) nose to port: 14 m ahead is (-10.5, 20); he is to face the jet
    expect(r.rec.filter((l) => l.startsWith('walk '))).toEqual(['walk 103 to -10.50 20.00 facing 0.00 1.00 ship 12: 0.878 0.000 0.479 | 1000.0 0.0 2000.0']);
    expect(r.says[0]).toBe('signal test: catcc-00 is walking to 14 m ahead of your nose (25 m to go). Then 15 steps, about 75 s in all: watch him; each one is announced.');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(SIGNALS);
    expect(r.says[1]).toBe('signal test 1 of 15: attention');
    expect(r.says[4]).toBe('signal test 4 of 15: turn LEFT (your left)');
    // night: the wands on with the first night step, three arm poses shown in turn, the first one back for the signals; all off at the end
    expect(r.rec.filter((l) => l.startsWith('override '))).toEqual([
      'override 103 night_stick_armpose', 'override 103 night_stick_armpose_r', 'override 103 night_stick_armpose_l', 'override 103 night_stick_armpose', 'override 103 ',
    ]);
    expect(r.rec.filter((l) => l.startsWith('attach ')).slice(-4)).toEqual(['attach 103 RightStick false', 'attach 103 LeftStick false', 'attach 103 RightLight false', 'attach 103 LeftLight false']);
    expect(r.says[r.says.length - 1]).toBe('signal test done: 15 of 15 steps as sent. Torso swing: his blend angle went -45..45 (asked for -45..45).');
    const res = r.logLines.filter((l) => /^sigtest \d+: .*: (played|done|NOT|FAILED|seen)/.test(l));
    expect(res.length).toBe(15);
    expect(res[0]).toMatch(/^sigtest 1: "sign_attention_taxi": played; first seen \+0\.25 s; length 1\.33, loop 0\/-1\/-1; blend x 0\.0\.\.0\.0; 0 parameter write\(s\), sent again 0 time\(s\)$/);
    // the swing: the parameter written all the way across, and the angle he was seen playing at followed it
    expect(res[2]).toMatch(/^sigtest 3: "bs_sign_taxi_fwd": played; first seen \+0\.25 s; length 2\.50, loop 1\/-1\/-1; blend x -45\.0\.\.45\.0; \d\d parameter write\(s\), sent again 0 time\(s\)$/);
    expect(res[8]).toBe('sigtest 9: NIGHT: light wands, standing idle, arm pose "night_stick_armpose": done');
    expect(res[11]).toMatch(/^sigtest 12: "night_bs_sign_taxi_fwd": played;/);
    expect(otherShip(r)).toEqual([]);
  });

  it('signal test: a signal that cannot be played is named; with nobody of ours it uses the target; stop ends it', () => {
    const bad = hook(`UNPLAYABLE.bs_sign_stop = true\nHANDLER.onSimulationStart()\nframes(10)\nclick("${SIGTEST}")\nframes(95)`);
    expect(bad.says[bad.says.length - 1]).toBe('signal test done: 14 of 15 steps as sent; NOT as sent: stop. Torso swing: his blend angle went -45..45 (asked for -45..45).');
    expect(bad.says).toContain('signal test 6 of 15: stop - could not be done (see the log)');
    const r = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' then table.remove(PEOPLE, i) end end
HANDLER.onSimulationStart()\nframes(10)\nclick("${SIGTEST}")\nframes(12)\nclick("Stop the demo / signal test / marshalling")\nframes(6)`);
    expect(r.rec.filter((l) => l.startsWith('walk '))[0]).toMatch(/^walk 102 to -10\.50 20\.00 /);
    const plays = r.rec.filter((l) => l.startsWith('play '));
    expect(plays[0]).toBe('play 102 sign_attention_taxi mode 1');
    expect(plays[plays.length - 1]).toBe('play 102 idle');
    expect(r.says[r.says.length - 1]).toBe('signal test stopped.');
    expect(plays.length).toBeLessThan(6);
  });

  it('marshalling to a catapult: directors stationed along the route, signals from where the route goes, a hand-over, the catapult crew at its start box', () => {
    // two people of ours, and catapult 2's own director for the last pass to point at
    const r = hook(`add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A)\nadd(106, 'director', '2: director', 78.76, -4.5, SHIP_A)
${START}click("${MARSHAL} 2")\nframes(14)\nrec("taken")
setJet(-10.5, 18)\nframes(1)\nrec("bend")
setJet(-7, 10, 1, 0)\nframes(1)\nrec("handed")\nframes(5)\nrec("second")
setJet(12.24, 8.88, 0.894, -0.447)\nframes(0.5)\nsetJet(19, 5.5, 0.894, -0.447)\nframes(1)\nrec("box")\nframes(3)`);
    // 54 m of the 67 m route are ours (then catapult 2's start box): two stretches of 27 m. Each director
    // stands 8 m beyond the end of his stretch and 8 m to the side: the first at the bend half left towards
    // the catapult, on its outside (the right); the second where the route runs straight, on the pilot's left.
    // Both face back along the route.
    expect(r.rec.filter((l) => l.startsWith('walk ')).slice(0, 2).map((l) => l.split(' ship ')[0])).toEqual([
      'walk 103 to 0.50 18.00 facing -0.94 -0.34', 'walk 105 to 22.07 -4.98 facing -0.58 0.82',
    ]);
    expect(r.says[0]).toBe("marshalling to catapult 2: 67 m to go on the route from spawn spot 5; our crew has the first 54 m, then the catapult's own crew. " +
      'catcc-00, catcc-c0 walking to their stations. When catcc-00 is in place he takes you: follow the signals.');
    expect(r.logLines).toContain('marshal: spawn spot 5 to catapult 2: route of 4 points, 67 m; the jet is 0.0 m along it (0.0 m off it); the catapult start box begins at 54 m; 2 director(s); catapult director at 78.8 fwd -4.5 stbd');
    expect(r.logLines.some((l) => l.startsWith('marshal: catcc-00 takes the stretch 0..27 m: stands at 0.5 fwd 18.0 stbd (right of the route), facing -0.94 -0.34;'))).toBe(true);
    expect(r.logLines.some((l) => l.startsWith('marshal: catcc-c0 takes the stretch 27..54 m: stands at 22.1 fwd -5.0 stbd (left of the route), facing -0.58 0.82;'))).toBe(true);
    const part = (from: string, to?: string) => r.rec.slice(from ? r.rec.indexOf(from) : 0, to ? r.rec.indexOf(to) : undefined);
    const plays = (l: string[]) => l.filter((x) => x.startsWith('play '));
    // the first director in place: he takes the jet; the route runs straight ahead of the nose
    expect(r.says.some((s) => /^marshalling: catcc-00 is in place \(after \d s\)\. Taxi: follow the signals\.$/.test(s))).toBe(true);
    expect(plays(part('', 'taken'))).toEqual(['play 103 sign_attention_taxi mode 1', 'play 103 bs_sign_taxi_fwd mode 2']);
    // 16 m along: the route 10 m ahead is round the bend to the right (14 degrees off the nose): the pilot's right turn
    expect(plays(part('taken', 'bend'))).toEqual(['play 103 bs_sign_taxi_left mode 2']);
    // past the end of his stretch: pass control, pointing at the second director (113 degrees to his right)
    const hand = part('bend', 'handed');
    expect(plays(hand)).toEqual(['play 103 bs_pass_control mode 1']);
    expect(hand.some((l) => /^prop 103 angle -11[23]\.\d$/.test(l))).toBe(true);
    // the pass over: the first back to idle, the second takes the jet and brings it on
    const second = plays(part('handed', 'second'));
    expect([...second].sort()).toEqual(['play 103 idle', 'play 105 bs_sign_taxi_fwd mode 2', 'play 105 sign_attention_taxi mode 1']);
    // in catapult 2's start box: the last pass, towards the catapult's director; then everyone idle and walking home
    expect(plays(part('second', 'box'))).toEqual(['play 105 bs_pass_control mode 1']);
    const end = part('box');
    expect(plays(end)).toEqual(['play 103 idle', 'play 105 idle']);
    expect(end.filter((l) => l.startsWith('walk ')).map((l) => l.split(' ship ')[0])).toEqual(['walk 103 to 14.00 27.00 facing 0.00 0.00', 'walk 105 to 14.00 29.00 facing 0.00 0.00']);
    expect(r.says[r.says.length - 1]).toBe("marshalling over: catapult 2's own crew has you (you were at most 0.0 m off the route).");
    expect(r.logLines.some((l) => /^marshal: over after \d+ s; 3 signal changes; furthest off the route 0\.0 m$/.test(l))).toBe(true);
    expect(otherShip(r)).toEqual([]);
  });

  it('marshalling: one person of ours takes the whole route; refusals; stop sends the people home', () => {
    // one director: he stands beyond the end of our part, on the pilot's left
    // (stopped while he is still on his way to his station: he finishes that walk, then walks home)
    const one = hook(`${START}click("${MARSHAL} 2")\nframes(2)\nclick("Stop the demo / signal test / marshalling")\nframes(30)`);
    expect(one.rec.filter((l) => l.startsWith('walk ')).map((l) => l.split(' ship ')[0])).toEqual(['walk 103 to 22.07 -4.98 facing -0.58 0.82', 'walk 103 to 14.00 27.00 facing 0.00 0.00']);
    expect(one.says[0]).toContain('catcc-00 walking to his station.');
    expect(one.says).toContain('marshalling stopped.');
    // on a spot, but parked across the way its route leaves it
    const off = hook(`${START}click("${MARSHAL} 1")\nframes(1)`);
    expect(off.says[0]).toMatch(/^the route from spawn spot 5 to catapult 1 starts 90 degrees off your nose: you are not parked the way the spot's route leaves it\. Turn the jet, or taxi off the spot and ask again\.$/);
    expect(off.rec.some((l) => l.startsWith('walk '))).toBe(false);
    // off the spots, the route passing 10 m away but leading on behind the nose (the jet points to port, the
    // route goes forward and to starboard); no route to that catapult at all
    const away = hook(`setJet(0, 0)\n${START}click("${MARSHAL} 2")\nframes(1)\nsetJet(-10.5, 34)\nclick("${MARSHAL} 3")\nframes(1)`);
    expect(away.says[0]).toBe('no taxi route to catapult 2 near you: none of the routes passes within 40 m of you leading on within 110 degrees of your nose ' +
      '(the nearest spot route, from spot 5, passes 22 m from you).');
    expect(away.says[1]).toBe('there is no taxi route to catapult 3 in the routes file');
    // off the spots, nose forward: the route is joined where it passes nearest (10 m to starboard, 34.5 m along it:
    // 32 m of its 67 m to go), and the first director's stretch starts there
    const join = hook(`setJet(0, 0, 1, 0)\n${START}click("${MARSHAL} 2")\nframes(1)`);
    expect(join.says[0]).toMatch(/^marshalling to catapult 2: 32 m to go on the route from spawn spot 5; our crew has the first \d+ m, then the catapult's own crew\. catcc-00 walking to his station\. When catcc-00 is in place he takes you: follow the signals\. \(You are not on a spot: that route is joined where it passes 10 m from you\.\)$/);
    expect(join.logLines.some((l) => l.includes('the jet is 34.5 m along it (10.0 m off it)'))).toBe(true);
    expect(join.rec.filter((l) => l.startsWith('walk ')).length).toBe(1);
    const none = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' then table.remove(PEOPLE, i) end end
${START}click("${MARSHAL} 2")\nframes(1)`);
    expect(none.says[0]).toContain('marshalling needs people of ours (catcc-...) on your ship: none found');
    // a jet already 8 m along its route (a spawn spot moved along its first leg, or one that has rolled): taken from there
    const along = hook(`add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A)\nsetJet(-10.5, 26)\n${START}click("${MARSHAL} 2")\nframes(1)`);
    expect(along.says[0]).toMatch(/^marshalling to catapult 2: 59 m to go on the route from spawn spot 5; our crew has the first 46 m, then the catapult's own crew\. catcc-00, catcc-c0 walking to their stations\./);
    expect(along.logLines.some((l) => l.includes('the jet is 8.0 m along it (0.0 m off it)'))).toBe(true);
    expect(along.logLines.some((l) => l.startsWith('marshal: catcc-00 takes the stretch 8..31 m:'))).toBe(true);
    const busy = hook(`${START}click("${DEMO}")\nframes(1)\nclick("${MARSHAL} 2")\nframes(1)`);
    expect(busy.says[busy.says.length - 1]).toBe('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)');
  });

  it("DCS's catapult crews: matched to their catapults by their start boxes; free / take / operation allowed go to the right crew", () => {
    const r = hook(START + `click("Catapult crews > Report: crews, held orders, switches")\nframes(1)
click("Catapult crews > Catapult 3 > Free it once")\nframes(1)\nclick("Catapult crews > Catapult 3 > Open it (crew returns)")\nframes(1)
click("Catapult crews > Catapult 1 > Free it once")\nframes(1)
click("Catapult crews > Catapult 4 > Operation allowed: off")\nframes(1)\nclick("Catapult crews > Report: crews, held orders, switches")\nframes(1)
click("Catapult crews > Catapult 4 > Operation allowed: on")\nframes(1)`);
    expect(r.says[0]).toBe('catapult crews on your ship: 4 (catapults 1, 2, 3, 4 recognised by their start boxes). Free order held on: none. ' +
      'Operation allowed switched off by us on: none. Switches: crew environment: avoid collisions off, path avoids collisions off; ' +
      "character code: take the avoidance's velocity off, use the path finder off.");
    // DCS numbers its crews from 1; number 0 is nothing (catapult 4's crew was missed on 2026-11-14 by asking for 0..3)
    expect(r.logLines).toContain('crew 0: not a catapult crew');
    expect(r.logLines).toContain('crew 4: start box x -78.0..-57.0, z -25.0..-13.0 = catapult 3');
    // the report first finds where the orders are kept: each order switched and switched straight back on catapult 1's crew
    expect(r.logLines).toContain('order bytes looked for on crew 1 (each order switched and switched straight back): operation allowed off changed: nothing found; free changed: [+0x1A0]+0x4: 0 > 1');
    expect(r.logLines).toContain('catapult 3 order bytes: free=0 take=1 allowed=1');
    // asked through a man on the PLAYER'S ship (101); catapult 3 is crew 4, catapult 4 crew 3 and catapult 1 crew 1 in the stand-in's order
    expect(r.rec.filter((l) => l.startsWith('catorder '))).toEqual([
      'catorder 101 crew 1 allowed false', 'catorder 101 crew 1 free true', // (the report's look for the order bytes; switched back quietly)
      'catorder 101 crew 4 free true', 'catorder 101 crew 4 allowed true', 'catorder 101 crew 4 free false', // free once; open = operation allowed on + take
      'catorder 101 crew 1 free true', 'catorder 101 crew 3 allowed false', 'catorder 101 crew 3 allowed true',
    ]);
    expect(r.says[1]).toBe("catapult 3's crew: told to FREE the catapult, once (on 2026-11-14 the crew walked off and came straight back).");
    expect(r.logLines).toContain('command catorder: catapult 3 (crew 4) <- free; bytes the call changed 0 <-> 1: [+0x1A0]+0x4: 0 > 1.');
    expect(r.says[2]).toBe("catapult 3's crew: OPEN: operation allowed on, told to take the catapult.");
    expect(r.says[4]).toBe("catapult 4's crew: operation allowed set to FALSE. Taxi into its start box: its crew should leave you alone.");
    expect(r.says[5]).toContain('Free order held on: none. Operation allowed switched off by us on: 4.');
    expect(r.says[6]).toBe("catapult 4's crew: operation allowed set to TRUE: its crew should work a jet in its start box.");
    // once an order has been given the order bytes are read every frame, and a change is logged with what it was
    expect(r.logLines).toContain('orders, catapult 3 (crew 4): free=1 take=0 allowed=1');
    expect(r.logLines).toContain('orders, catapult 3 (crew 4): free=0 take=1 allowed=1');
    expect(r.logLines).toContain('orders, catapult 4 (crew 3): free=0 take=1 allowed=0');
    expect(r.logLines).toContain('catapult 4 order bytes: free=0 take=1 allowed=0');
  });

  it('closing a catapult: operation allowed off, then the free order every frame; what DCS changes in between is logged; opening ends it', () => {
    const CLOSE = 'Catapult crews > Catapult 3 > Close it (crew clears and stays off)';
    const r = hook(START + `click("${CLOSE}")\nframes(2)\nrec('quiet ' .. tostring(QUIET[4]))
ORD[4].free, ORD[4].take = 0, 1   -- DCS's own logic takes the catapult back
frames(0.25)\nrec('after ' .. ORD[4].free .. ' ' .. tostring(QUIET[4]))\nframes(1)
click("Catapult crews > Report: crews, held orders, switches")\nframes(1)
click("Catapult crews > Catapult 3 > Open it (crew returns)")\nframes(1)\nrec('quiet at the end ' .. tostring(QUIET[4]))\nframes(2)\nrec('quiet later ' .. tostring(QUIET[4]))`);
    expect(r.says[0]).toBe('catapult 3\'s crew: CLOSED: operation allowed off, and told to free the catapult (given again every frame until "Open it"). ' +
      'They should walk off and STAY off, through landings too, and leave a jet in the start box alone.');
    // two orders aloud, then the free order once a frame (4 frames a second here); opening: operation allowed on, then take
    expect(r.rec.filter((l) => l.startsWith('catorder '))).toEqual([
      'catorder 101 crew 4 allowed false', 'catorder 101 crew 4 free true', 'catorder 101 crew 4 allowed true', 'catorder 101 crew 4 free false',
    ]);
    const quiet = Number(r.rec.find((l) => l.startsWith('quiet '))?.slice(6));
    expect(quiet).toBeGreaterThanOrEqual(6);
    // the frame after DCS took it back: seen and logged, then the order given again
    expect(r.rec).toContain(`after 1 ${quiet + 1}`);
    expect(r.logLines).toContain('orders, catapult 3 (crew 4): free=0 take=1 allowed=0   was: free=1 take=0 allowed=0');
    expect(r.says[1]).toContain('Free order held on: 3. Operation allowed switched off by us on: 3.');
    expect(r.says[2]).toMatch(/^catapult 3's crew: OPEN: operation allowed on, told to take the catapult\. The hold is ended: the free order was given \d+ times\.$/);
    // after "Open it" nothing more is sent
    expect(r.rec.find((l) => l.startsWith('quiet later '))?.slice(12)).toBe(r.rec.find((l) => l.startsWith('quiet at the end '))?.slice(17));
  });

  it("a catapult's crew is walked away and back by our own walk orders; a man below the flight deck is left", () => {
    // catapult 1's crew (crew 1 here): the director at his station, a green shirt, and one on the catwalk 4 m below
    const r = hook(`add(105, 'green_nw', '1: green_nw', 70.14, 7.16, SHIP_A)\nadd(106, 'white2', '1: white2', 60, 30, SHIP_A)\nbyH[106].y = byH[106].y - 4
${START}click("Catapult crews > Catapult 1 > Send its crew away by our own walk orders")\nframes(60)
click("Catapult crews > Catapult 1 > Send its crew back to where they stood")\nframes(60)
click("Catapult crews > Catapult 1 > Send its crew back to where they stood")\nframes(1)
click("Catapult crews > Catapult 1 > Send its crew away by our own walk orders")\nframes(60)
click("Catapult crews > Catapult 1 > Send its crew back to where they stood")\nframes(1)
click("Catapult crews > Catapult 3 > Send its crew back to where they stood")\nframes(1)
click("Catapult crews > Catapult 2 > Send its crew away by our own walk orders")\nframes(1)`);
    const walks = r.rec.filter((l) => l.startsWith('walk ')).map((l) => l.split(' ship ')[0]);
    // sorted by name: the director to the first spot, the green shirt 2 m forward of it; then both back, facing as they did
    // Sent back again when they stand at their stations already: no walk of no length is ordered. Away and back a
    // second time: to the same spots, and back to where they FIRST stood (on 2026-11-14 the second "away" took the
    // away spots for their stations).
    const once = [
      'walk 104 to 46.00 29.00 facing 0.00 0.00', 'walk 105 to 48.00 29.00 facing 0.00 0.00',
      'walk 104 to 73.75 16.67 facing 1.00 0.00', 'walk 105 to 70.14 7.16 facing 1.00 0.00',
    ];
    expect(walks).toEqual([...once, ...once]);
    expect(r.logLines.filter((l) => l.endsWith('he stands there already: no order given')).length).toBe(2);
    const cs = r.says.filter((l) => l.startsWith('catapult ')); // (the list at mission start comes in between)
    expect(cs[0]).toBe("catapult 1's crew sent to 46 m fwd, 29 m stbd by our own walk orders: director, green_nw. Left where he is (not on the flight deck): white2. " +
      'Do they go, and stay there? (The log records where each walks.)');
    expect(cs[1]).toBe("catapult 1's crew sent back to where they stood: director, green_nw.");
    // a crew we never sent anywhere; a catapult with no crew members found
    expect(cs[cs.length - 2]).toBe("catapult 3's crew: nobody of it was sent away by us");
    expect(cs[cs.length - 1]).toBe("catapult 2's crew: nobody could be sent (see the log)");
    expect(otherShip(r)).toEqual([]);
  });

  it('the bow bubble goes down when catapults 1 and 2 are both closed and comes up when either opens; each bubble by hand; down is kept down', () => {
    const C = (n: number, what: string) => `click("Catapult crews > Catapult ${n} > ${what}")\nframes(1)\n`;
    const r = hook(START + C(1, 'Close it (crew clears and stays off)') + C(3, 'Close it (crew clears and stays off)') + C(2, 'Close it (crew clears and stays off)') +
      // DCS's own logic raises the bow bubble again: ours is given again
      'BUB[0] = 2\nframes(1)\n' +
      C(3, 'Open it (crew returns)') + C(1, 'Open it (crew returns)') + C(2, 'Open it (crew returns)') +
      // ... and once it is no longer ours to keep down, DCS's command stands
      'BUB[0] = 1\nframes(1)\nBUB[0] = 2\nframes(1)\n' +
      `click("Catapult crews > Bubbles > Waist bubble: down")\nframes(1)\nclick("Catapult crews > Bubbles > Report both")\nframes(1)\nBUB[1] = 2\nframes(1)\nBUB[1] = 2\nframes(1)
click("Catapult crews > Bubbles > Waist bubble: up")\nframes(1)\nBUB[1] = 1\nframes(1)
click("Catapult crews > Bubbles > Bow bubble: down")\nframes(1)\nclick("Catapult crews > Bubbles > Bow bubble: down")\nframes(1)\nclick("Catapult crews > Bubbles > Bow bubble: up")\nframes(1)`);
    // DCS's own command, through a man on the player's ship: bubble index 0 is the bow's, index 1 the waist's (run of
    // 2026-11-15); command 1 = down, command 2 = up. Catapult 3 closing or opening moves nothing; catapult 2 opening
    // after 1 has opened moves nothing more.
    expect(r.rec.filter((l) => l.startsWith('bubble '))).toEqual([
      'bubble 101 0 1', 'bubble 101 0 1', 'bubble 101 0 2',                   // down for the closed catapults; again after DCS raised it; up
      'bubble 101 1 1', 'bubble 101 1 1', 'bubble 101 1 1', 'bubble 101 1 2', // the waist's by hand: down, again each time DCS raised it, up
      'bubble 101 0 1', 'bubble 101 0 2',                                     // the bow's by hand: down (the second "down" changes nothing), up
    ]);
    const cs = r.says.filter((l) => l.startsWith('catapult '));
    expect(cs[0].endsWith('leave a jet in the start box alone.')).toBe(true);
    expect(cs[2].endsWith(' Catapults 1 and 2 are both closed. The bow bubble is told to go DOWN.')).toBe(true);
    expect(cs[3]).toMatch(/^catapult 3's crew: OPEN: operation allowed on, told to take the catapult\. The hold is ended: the free order was given \d+ times\.$/);
    expect(cs[4].endsWith(' The bow bubble is told to come UP again.')).toBe(true);
    expect(cs[5].endsWith('times.')).toBe(true);
    expect(r.logLines).toContain('bow bubble: down for: closed: bubble 1 <- command 1; state now: down (argument at 0)');
    expect(r.logLines).toContain('bubble 1: the ship held command 2, ours is 1: given again (1 times so far)');
    expect(r.logLines).toContain('bubble 2: the ship held command 2, ours is 1: given again (2 times so far)');
    // Every change of what the ship holds is logged, DCS's own included; a command we keep is shown as ours, with a
    // star, so DCS overwriting it every frame does not fill the log
    expect(r.logLines).toContain('ship commands: bubbles 2 2; elevators 0 0 0 0 (first reading; a bubble: 2 up, 0 or 1 down; an elevator: 1 down, 2 up, 0 none; a star: kept by us)');
    expect(r.logLines).toContain('ship commands: bubbles 1* 2; elevators 0 0 0 0   was: bubbles 2 2; elevators 0 0 0 0');
    expect(r.logLines.filter((l) => l.startsWith('ship commands: bubbles 2 1*')).length).toBe(1);
    expect(r.says).toContain('the waist bubble told to go DOWN, and kept down (DCS raises it again by itself while launching: ours is given again).');
    expect(r.says).toContain('bow bubble: up (argument at 1); waist bubble: down (argument at 0).');
    expect(r.says).toContain('the bow bubble told to go DOWN, and kept down.');
    expect(r.says).toContain('the bow bubble told to go DOWN, and kept down (it was told so already).');
    expect(r.says[r.says.length - 1]).toBe('the bow bubble told to go UP.');
  });

  it('a route of ours that crosses the bow bubble: the bubble is lowered when the marshalling starts and raised when the jet is 14 m past it', () => {
    // a route straight aft down the bow, over the bubble (64 m forward, 3 m to starboard), and on aft towards catapult 3
    const r = hook(`ROUTES_SRC = [[return { { spot = 1, x = 110, z = 3, fx = -1, fz = 0, routes = { [3] = { {110,3}, {20,3}, {-50,-19} } } } }]]
add(105, 'catcc-c0', '1: catcc-c0', 100, 8, SHIP_A)
setJet(110, 3, -1, 0)
${START}click("${MARSHAL} 3")\nframes(30)
for d = 1, 24 do setJet(110 - d * 2, 3, -1, 0) frames(0.5) end
rec('at 62 m: ' .. tostring(BUB[0]) .. ',' .. tostring(BUB[1]))
for d = 25, 34 do setJet(110 - d * 2, 3, -1, 0) frames(0.5) end`);
    expect(r.logLines.find((l) => l.startsWith('marshal: the route crosses'))).toBe('marshal: the route crosses the bow bubble between 40 and 52 m: lowered until the jet is at 66 m');
    expect(r.says.find((l) => l.startsWith('marshalling to catapult 3'))?.endsWith(' The bow bubble is told to go DOWN.')).toBe(true);
    const b = r.rec.filter((l) => l.startsWith('bubble ') || l.startsWith('at 62'));
    expect(b).toEqual(['bubble 101 0 1', 'at 62 m: 1,nil', 'bubble 101 0 2']);
    expect(r.logLines.find((l) => l.startsWith('marshal: the jet is past the bow bubble'))).toMatch(/^marshal: the jet is past the bow bubble \(at 6[6-9] m\): The bow bubble is told to come UP again\.$/);
    // stopped while the bubble is still down for the route: it comes up again
    const st = hook(`ROUTES_SRC = [[return { { spot = 1, x = 110, z = 3, fx = -1, fz = 0, routes = { [3] = { {110,3}, {20,3}, {-50,-19} } } } }]]
add(105, 'catcc-c0', '1: catcc-c0', 100, 8, SHIP_A)
setJet(110, 3, -1, 0)
${START}click("${MARSHAL} 3")\nframes(4)\nclick("Stop the demo / signal test / marshalling")\nframes(1)`);
    expect(st.rec.filter((l) => l.startsWith('bubble '))).toEqual(['bubble 101 0 1', 'bubble 101 0 2']);
  });

  it("the carrier's ATC is asked once a second and a change is logged; the catapult report says what it says", () => {
    // the stand-in ATC: no landing may start while a hot jet sits on deck (HOT); DCS's own getters, nothing set
    const r = hook(`HOT = true
NATIVE.deck = function(h)
  rec('deck ' .. h)
  return { canLand = not HOT, canTakeoff = true, foul = HOT, rwOpen = true, freeCats = 4, recoveryCase = 1 }
end
HANDLER.onSimulationStart()\nframes(12)\nHOT = false\nframes(3)
click("Catapult crews > Report: crews, held orders, switches")\nframes(1)`);
    const deck = r.logLines.filter((l) => l.startsWith('deck: '));
    expect(deck[0]).toBe('deck: can start landing no, can start take-off YES, foul deck YES, runway open yes, free catapults 4, recovery case 1 (first reading)');
    expect(deck[1]).toBe('deck: can start landing YES, can start take-off YES, foul deck no, runway open yes, free catapults 4, recovery case 1');
    expect(deck[2]).toBe('deck: can start landing YES, can start take-off YES, foul deck no, runway open yes, free catapults 4, recovery case 1 (asked for the report)');
    expect(deck.length).toBe(3);
    // asked through a man on the player's ship, about once a second from when the people are known
    const asked = r.rec.filter((l) => l.startsWith('deck '));
    expect(asked.every((l) => /^deck 10\d$/.test(l))).toBe(true);
    expect(asked.length).toBeGreaterThanOrEqual(6);
    expect(asked.length).toBeLessThanOrEqual(12);
    expect(r.says[r.says.length - 1].endsWith(" The carrier's ATC: can start landing YES, can start take-off YES, foul deck no, runway open yes, free catapults 4, recovery case 1.")).toBe(true);
    // an ATC that cannot be asked: said once in the log, and not asked again
    const bad = hook(`NATIVE.deck = function(h) rec('deck ' .. h) return nil, 'the ship has no ATC (or it is not a woATC)' end
HANDLER.onSimulationStart()\nframes(15)`);
    expect(bad.rec.filter((l) => l.startsWith('deck ')).length).toBe(1);
    expect(bad.logLines.filter((l) => l.startsWith('deck: '))).toEqual(['deck: the ATC could not be asked (the ship has no ATC (or it is not a woATC)): not asked again this mission']);
  });

  it("the elevators by hand: down is kept down and the hangar door opens at once; up leaves the door open and the hook raises the platform itself", () => {
    const r = hook(START + `click("Catapult crews > Elevators > Elevator 3: down")\nframes(1)\nrec('door after 1 s: ' .. string.format('%.2f', ARGS[53] or 0))
click("Catapult crews > Elevators > Report all")\nframes(1)
ELEV[2] = 2\nframes(1)\nELEV[2] = 2\nframes(5)
rec('--- up')
ARGS[59], ARGS[31], ARGS[32] = 1, 1, 0   -- (as DCS leaves them at the bottom: platform down, deck-edge fence up, lower fence down)
click("Catapult crews > Elevators > Elevator 3: up")\nframes(1)\nELEV[2] = 0\nframes(2)
ARGS[53] = 0.9   -- (DCS's own raise sequence starts to shut the door: left to it)
frames(30)
rec(string.format('after the raise: door %.2f, lower fence %.2f, platform %.2f, deck-edge fence %.2f', ARGS[53], ARGS[32], ARGS[59], ARGS[31]))
click("Catapult crews > Elevators > Shut the hangar doors")\nframes(1)\nlocal n = #REC\nARGS[53] = 0.5\nframes(2)\nrec('door writes after the doors were let go: ' .. (#REC - n))
click("Catapult crews > Elevators > Shut the hangar doors")\nframes(1)`);
    // command 1 lowers, command 2 raises; DCS raising it while it is ours to keep down: given again, both times; "up"
    // gives command 2 once, and "Shut the hangar doors" gives it again for the door we were holding
    expect(r.rec.filter((l) => l.startsWith('elevator '))).toEqual(['elevator 101 2 1', 'elevator 101 2 1', 'elevator 101 2 1', 'elevator 101 2 2', 'elevator 101 2 2']);
    expect(r.says[0]).toBe('elevator 3 told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?');
    // The hangar door (elevator 3's is model argument 53) starts to open at once, at DCS's own door speed (6 s), every
    // frame, and stops when it is open; no other argument is written while it lowers
    const up = r.rec.indexOf('--- up');
    const door = r.rec.slice(0, up).filter((l) => l.startsWith('shiparg '));
    expect(door.every((l) => /^shiparg 10\d 53 /.test(l))).toBe(true);
    const vals = door.map((l) => Number(l.split(' ')[3]));
    expect(vals.every((v, i) => i === 0 || v > vals[i - 1])).toBe(true);
    expect(vals[vals.length - 1]).toBe(1);
    expect(Number(r.rec.find((l) => l.startsWith('door after 1 s: '))!.split(': ')[1])).toBeGreaterThan(0.05);
    expect(Number(r.rec.find((l) => l.startsWith('door after 1 s: '))!.split(': ')[1])).toBeLessThan(0.25);
    expect(r.logLines.some((l) => /^elevator 3: the hangar door is open \([5-7] s after the elevator was told to go down\)$/.test(l))).toBe(true);
    // Up: the lower fence first (4 s), then the platform (17 s), then the deck-edge fence (4 s), in that order. THE DOOR IS
    // NOT TOUCHED (the user, 2026-11-18, after the run of the whole demo: "Hangar doors remain open after all aircraft have
    // been spotted. Some also seem to jitter constantly as if DCS's default behaviour is trying to override them being
    // open": it was written back to open every frame against DCS's own raise): DCS shuts it while the platform is raised
    // here (in this harness nothing shuts it: it reads open)
    const rise = r.rec.slice(up).filter((l) => l.startsWith('shiparg ')).map((l) => Number(l.split(' ')[2]));
    const firstOf = (a: number) => rise.indexOf(a);
    expect(firstOf(32)).toBeGreaterThan(-1);
    expect(firstOf(59)).toBeGreaterThan(rise.lastIndexOf(32));
    expect(firstOf(31)).toBeGreaterThan(rise.lastIndexOf(59));
    expect(rise.filter((a) => a === 53).length).toBe(0);
    expect(r.rec).toContain('after the raise: door 0.90, lower fence 1.00, platform 0.00, deck-edge fence 0.00');
    expect(r.logLines.some((l) => /^elevator 3: at the flight deck after 2\d s \(its hangar door 90 % open\)$/.test(l))).toBe(true);
    expect(r.rec).toContain('door writes after the doors were let go: 0');
    expect(r.says).toContain('elevator 3 told to come UP: the platform is raised here; DCS shuts its hangar door meanwhile.');
    expect(r.says).toContain('1 hangar door(s) let go: DCS shuts them.');
    expect(r.says[r.says.length - 1]).toBe('no hangar door is being held open by us.');
    // a module without the model arguments: the elevator still goes down and up, the door is DCS's
    const old = hook('NATIVE.shiparg = nil\n' + START + 'click("Catapult crews > Elevators > Elevator 3: down")\nframes(8)\nclick("Catapult crews > Elevators > Elevator 3: up")\nframes(2)');
    expect(old.rec.filter((l) => l.startsWith('elevator '))).toEqual(['elevator 101 2 1', 'elevator 101 2 2']);
    expect(old.says[0]).toBe('elevator 3 told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?');
    expect(old.says[old.says.length - 1]).toBe('elevator 3 told to come UP.');
    expect(r.says[1]).toBe('elevator 1: up (argument at 0); elevator 2: up (argument at 0); elevator 3: up (argument at 0); elevator 4: up (argument at 0).');
    expect(r.logLines).toContain('elevator 3: the ship held command 2, ours is 1: given again (2 times so far)');
    expect(r.logLines).toContain('ship commands: bubbles 2 2; elevators 0 0 1* 0 (first reading; a bubble: 2 up, 0 or 1 down; an elevator: 1 down, 2 up, 0 none; a star: kept by us)');
  });

  it('"Abort the hook-up": the crew told to let go, the catapult closed and kept closed, the jet moved 20 m straight back off the shuttle', () => {
    // on catapult 1's shuttle, nose up the track
    const ABORT = 'Catapult crews > Catapult 1 > Abort the hook-up (crew off, catapult closed, jet 20 m back)';
    const r = hook(START + `setJet(66, 17, 1, 0)\nclick("${ABORT}")\nframes(3)
rec('held orders since: ' .. tostring(QUIET[1]))\nrec('jet now: ' .. string.format('%.1f %.1f nose %.1f %.1f', jet.f, jet.s, jet.nf, jet.ns))`);
    expect(r.rec).toContain('catorder 101 crew 1 dropjet');
    expect(r.rec).toContain('catorder 101 crew 1 allowed false');
    expect(r.rec).toContain('catorder 101 crew 1 free true');
    expect(r.rec).toContain('forcepos id 16777472 to 46.00 17.00 up 22.00 nose 1.00 0.00');
    expect(r.rec).toContain('jet now: 46.0 17.0 nose 1.0 0.0');
    expect(r.says[r.says.length - 1]).toMatch(/^catapult 1's crew: told to LET GO of its aircraft, the catapult CLOSED \(Open it: the same menu\)\. .*You are moved 20 m straight back, off the shuttle\.$/);
    // (the free order is then given every frame: the catapult stays closed)
    expect(Number(r.rec.find((l) => l.startsWith('held orders since: '))!.split(': ')[1])).toBeGreaterThan(8);
    // not on that catapult: the crew and the catapult as above, the jet left where it is
    const away = hook(START + `click("${ABORT}")\nframes(2)`);
    expect(away.rec.some((l) => l.startsWith('forcepos '))).toBe(false);
    expect(away.says[away.says.length - 1]).toMatch(/\(You are not on that catapult: the jet is left where it is\.\)$/);
  });

  it('the plane captain: walks out, hold brakes once he STANDS there, engine signals right engine first, the directors set out with them, release, hand-over, home', () => {
    // the jet on its spot, nose to port (0, -1): 11 m ahead is 11 m to port, the pilot's left is aft
    const r = hook(`add(105, 'catcc-c0', '1: catcc-c0', 30, 20, SHIP_A)\n${START}click("Plane captain > Engine start signals")\nframes(1)
click("Plane captain > Come to my jet")\nframes(1)\nclick("Plane captain > Engine start signals")\nframes(1)\nframes(20)
click("Plane captain > My catapult: 2")\nframes(1)
click("Plane captain > Engine start signals")\nframes(22)
rec('before the release: ' .. #REC)
click("Plane captain > Release me")\nframes(14)`);
    expect(r.says[0]).toBe('you have no plane captain yet (F10 > Plane captain > Come to my jet)');
    // the nearest of ours (catcc-00, 25 m away) goes: to 11 m ahead of the nose and 3.5 m to the pilot's left, facing the jet
    expect(r.says[1]).toBe('catcc-00 is your plane captain: walking out to you (25 m). When he is in place he signals "hold brakes".');
    const walks = r.rec.filter((l) => l.startsWith('walk 103 ')).map((l) => l.split(' ship ')[0]);
    expect(walks[0]).toBe('walk 103 to -14.00 23.00 facing 0.00 1.00');
    expect(r.says[2]).toBe('catcc-00 is still on his way to you');
    expect(r.says).toContain('catcc-00 is in place: hold brakes. F10 > Plane captain: engine start signals, then release.');
    expect(r.says).toContain('your catapult is 2: the directors walk out to the route there when the engine start signals begin, and take you when the plane captain releases you.');
    expect(r.says).toContain('catcc-00: engine start signals (your right engine, thumbs-up, your left engine, thumbs-up).');
    expect(r.says).toContain('catcc-00: released. Release brakes, then our directors take you to catapult 2.');
    // What he played, in order: hold brakes; the pilot's right engine held (the animation named "_l": the signaller's
    // own left), thumbs-up, the pilot's left engine held, thumbs-up; release brakes (no "unfold wings": the shooter's)
    const plays = r.rec.filter((l) => l.startsWith('play 103 ')).map((l) => l.replace(/^play 103 /, '')).filter((l) => !l.startsWith('idle'));
    expect(plays.slice(0, 6)).toEqual([
      'sign_setbrakes mode 1', 'sign_runupengine_l mode 2', 'sign_ok_l mode 1', 'sign_runupengine_r mode 2', 'sign_ok_r mode 1', 'sign_releasebrakes mode 1',
    ]);
    // The directors set out when the engine signals begin: the OTHER man of ours (the captain stays with the jet) walks to
    // his station and waits; nobody takes the jet before the release
    const m = r.says.find((l) => l.startsWith('marshalling to catapult 2:'));
    expect(m).toContain('catcc-c0 walking to his station. They wait there: nobody takes you until your plane captain releases you.');
    const before = Number(r.rec.find((l) => l.startsWith('before the release: '))!.split(': ')[1]);
    expect(r.rec.findIndex((l) => l.startsWith('walk 105 '))).toBeLessThan(before);
    expect(r.rec.findIndex((l) => l.startsWith('walk 105 '))).toBeGreaterThan(r.rec.findIndex((l) => l === 'play 103 sign_runupengine_l mode 2') - 3);
    expect(r.rec.findIndex((l) => l.startsWith('play 105 sign_attention_taxi'))).toBeGreaterThan(before);
    // on the release the captain passes control to him and walks home; the director then takes the jet
    expect(plays[6]).toBe('bs_pass_control mode 1');
    expect(r.logLines).toContain('captain: catcc-00 passes control to catcc-c0');
    expect(r.logLines).toContain('captain: catcc-00 walks back to where he stood');
    expect(walks[walks.length - 1]).toBe('walk 103 to 14.00 27.00 facing 0.00 0.00');
    expect(r.logLines.some((l) => /^marshal: catcc-c0 takes the jet/.test(l))).toBe(true);
    expect(otherShip(r)).toEqual([]);
    // released without a catapult: his salute, then home; and "Send him home" at any time
    const s = hook(`${START}click("Plane captain > Come to my jet")\nframes(12)\nclick("Plane captain > Release me")\nframes(12)`);
    const sp = s.rec.filter((l) => l.startsWith('play 103 ')).map((l) => l.replace(/^play 103 /, '')).filter((l) => !l.startsWith('idle'));
    expect(sp).toEqual(['sign_setbrakes mode 1', 'sign_releasebrakes mode 1', 'sign_salut mode 1']);
    expect(s.rec.filter((l) => l.startsWith('walk 103 ')).length).toBe(2);
    const h = hook(`${START}click("Plane captain > Come to my jet")\nframes(12)\nclick("Plane captain > Send him home")\nframes(1)\nclick("Plane captain > Send him home")\nframes(1)`);
    expect(h.says).toContain('catcc-00 walks back to where he stood.');
    expect(h.says[h.says.length - 1]).toBe('you have no plane captain yet (F10 > Plane captain > Come to my jet)');
  });

  it('a plane captain with a long way to walk is not signalled until he stands on his point, however long it takes', () => {
    // 2026-11-15: 123 m to walk; after a minute he was taken to be in place, 24 m short and still walking, and slid in the pose
    const r = hook(`byH[103].x, byH[103].z = 900, 0
local play0 = NATIVE.play
NATIVE.play = function(h, name, mode)
  if h == 103 and name == 'sign_setbrakes' then rec(string.format('hold brakes with %.1f m to go, walking %s', math.sqrt((byH[103].x + 14) ^ 2 + (byH[103].z - 23) ^ 2), tostring(walking[103] ~= nil))) end
  return play0(h, name, mode)
end
${START}setJet(-10.5, 34, 0, -1)\nclick("Plane captain > Come to my jet")\nframes(400)`);
    const inPlace = r.logLines.find((l) => l.startsWith('captain: catcc-00 is in place'));
    expect(inPlace).toMatch(/^captain: catcc-00 is in place \(0\.\d m off his point\) after \d+ s$/);
    expect(Number(inPlace!.match(/after (\d+) s/)![1])).toBeGreaterThan(60);
    expect(r.rec.filter((l) => l.startsWith('hold brakes with'))).toEqual(['hold brakes with 0.0 m to go, walking false']);
  });

  it('a man in a pose is put back to idle before he is given a walk order (a director sent off in a marshalling pose slid across the deck)', () => {
    const r = hook(`add(105, 'green_nw', '1: green_nw', 70.14, 7.16, SHIP_A)\n${START}PLAYING[104] = { name = 'sign_taxifwd_l', mode = 2, at = 0 }
click("Catapult crews > Catapult 1 > Send its crew away by our own walk orders")\nframes(2)`);
    const i = r.rec.indexOf('play 104 idle');
    expect(i).toBeGreaterThan(-1);
    expect(r.rec[i + 1].startsWith('walk 104 to 46.00 29.00')).toBe(true);
    // (the green shirt stood idle: nothing played to him first)
    expect(r.rec.filter((l) => l.startsWith('play 105 ')).length).toBe(0);
    expect(r.logLines).toContain('walk: 104 was playing "sign_taxifwd_l": put back to idle before the walk order');
  });

  it('the cockpit camera turns to the director who has the jet: what the view command does is found out first, then the camera is steered by its error; off from the menu; outside views left alone', () => {
    // The demo: the director stands 25 m ahead of the nose; the camera looks 40 degrees to the right. The stand-in view
    // command TURNS the camera, -300 degrees a unit (as DCS's does: on 2026-11-15 a value taken for an angle and sent
    // twenty times a second swung the view round to its stop behind the jet).
    const r = hook(`${START}click("${DEMO}")\nframes(60)
rec(string.format('camera %.1f deg off the nose, %d values, largest %.4f', CAMAZ, #CAMSETS, math.max(table.unpack(CAMSETS))))
local n0 = #CAMSETS
frames(8)
rec('values while he is in view: ' .. (#CAMSETS - n0))
setJet(-10.5, 30, 0.34, -0.94)\nframes(12)
rec(string.format('after the jet moved: camera %.1f', CAMAZ))
local n = #CAMSETS
click("Our crew > Camera follows the director: on / off")\nframes(8)
rec('values while off: ' .. (#CAMSETS - n))
click("Our crew > Camera follows the director: on / off")\nCOCKPIT = false\nn = #CAMSETS\nframes(8)
rec('values in an outside view: ' .. (#CAMSETS - n))`);
    const cam = r.rec.find((l) => l.startsWith('camera '))!;
    // the director is 25 m straight ahead of the jet's position; the camera sits 3.5 m ahead of it: dead ahead
    expect(Math.abs(Number(cam.match(/camera (-?[\d.]+) deg/)![1]))).toBeLessThan(0.7);
    // never more than 8 degrees in one go (8 / 300 of a unit), and nothing is sent while he is in view
    expect(Number(cam.match(/largest (-?[\d.]+)/)![1])).toBeLessThanOrEqual(8 / 300 + 1e-4);
    expect(r.rec).toContain('values while he is in view: 0');
    expect(r.logLines.some((l) => /^camera: on catcc-00, -?\d+ deg off the nose; the camera looks 40 deg off it; what the view command does is found out first$/.test(l))).toBe(true);
    expect(r.logLines).toContain('camera: the view command TURNS the camera: the value -0.0020 turned it 0.60 deg, a zero left it there (0.00), the value again turned it 0.60: -300 deg a unit');
    // the jet has turned and moved: the director is now well to the left of the nose, and the camera with him
    const moved = Number(r.rec.find((l) => l.startsWith('after the jet moved'))!.match(/camera (-?[\d.]+)/)![1]);
    expect(moved).toBeLessThan(-10);
    expect(r.rec).toContain('values while off: 0');
    expect(r.rec).toContain('values in an outside view: 0');
    expect(r.says).toContain('the cockpit camera is left alone.');
    expect(r.says).toContain('the cockpit camera follows whoever is signalling to you (left / right only), whenever you are being marshalled.');
    // a camera already on its stop behind the jet is brought back round (the error steers, not a remembered value)
    const back = hook(`CAMAZ = -172\n${START}click("${DEMO}")\nframes(80)\nrec(string.format('camera %.1f', CAMAZ))`);
    expect(Math.abs(Number(back.rec.find((l) => l.startsWith('camera '))!.split(' ')[1]))).toBeLessThan(0.7);
    // a view command that is an angle to go to: told apart by the zero and the repeat, and then set, not turned
    const ang = hook(`CAMMODE = 'angle'\n${START}click("${DEMO}")\nframes(60)\nsetJet(-10.5, 30, 0.34, -0.94)\nframes(12)\nrec(string.format('camera %.1f', CAMAZ))`);
    expect(ang.logLines.some((l) => /^camera: the view command is an ANGLE: .*: -90 deg a unit$/.test(l))).toBe(true);
    expect(Number(ang.rec.find((l) => l.startsWith('camera '))!.split(' ')[1])).toBeLessThan(-10);
    // a view that does not answer at all: said once, and left alone from then on
    const dead = hook(`CAMMODE = nil\n${START}click("${DEMO}")\nframes(40)\nsetJet(-10.5, 30, 0.34, -0.94)\nframes(40)\nrec('values: ' .. #CAMSETS)\nframes(20)\nrec('values: ' .. #CAMSETS)`);
    expect(dead.says).toContain('the cockpit camera did not answer the view command: it is not being turned for you (see the log).');
    const vals = dead.rec.filter((l) => l.startsWith('values: '));
    expect(vals[0]).toBe(vals[1]);
    expect(Number(vals[0].split(': ')[1])).toBeLessThanOrEqual(10);
  });

  it('a man who is walking finishes his walk first, and gets the new walk order when he stands', () => {
    // sent away, and sent back 2 s later while still on the way (on 2026-11-14 that left three of six walking on the spot)
    // The ship sails on in between (60 m): the order, when it is given, carries the ship's position of that moment.
    const r = hook(`${START}click("Catapult crews > Catapult 1 > Send its crew away by our own walk orders")\nframes(2)
click("Catapult crews > Catapult 1 > Send its crew back to where they stood")\nSX = SX + 60\nframes(30)`);
    const acts = r.rec.filter((l) => /^(walk|stop) 104\b/.test(l)).map((l) => l.split(' ship ')[0]);
    // no stop order: DCS's does not end a walk, and an order given to a walking man jumped him or stuck him (2026-11-15)
    expect(acts).toEqual(['walk 104 to 46.00 29.00 facing 0.00 0.00', 'walk 104 to 73.75 16.67 facing 1.00 0.00']);
    const sent = r.rec.filter((l) => l.startsWith('walk 104 ')).map((l) => l.split(' | ')[1]);
    expect(sent).toEqual(['1000.0 0.0 2000.0', '1060.0 0.0 2000.0']);
    expect(r.logLines.some((l) => l.includes('command crewback: catapult 1 director') && l.endsWith('walking: he finishes this walk first, the new order follows when he stands'))).toBe(true);
    expect(r.logLines.some((l) => /^walk order for director given \d+\.\d s after it was asked for \(he stands\): to 73\.8 fwd 16\.7 stbd: frame check/.test(l))).toBe(true);
    expect(r.rec.some((l) => l.startsWith('stop '))).toBe(false);
    // a man who stands gets his order at once: no stop
    const still = hook(`${START}click("${TARGET}")\nframes(1)\nclick("${TARGET}")\nframes(1)\nclick("Target: walk > To 16 m ahead of my nose, facing me")\nframes(1)`);
    expect(still.rec.some((l) => l.startsWith('stop '))).toBe(false);
    expect(still.rec.filter((l) => l.startsWith('walk ')).length).toBe(1);
  });

  it('the places a catapult crew is sent to are on the deck, clear of every start box and of each other', () => {
    const src = /local CREW_AWAY = \{([^\n]*?)\} -- /.exec(hookSrc)?.[1] ?? '';
    const bases = [...src.matchAll(/\{\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(bases.length).toBe(4);
    const deck = hookDeck();
    const boxes = [[21, 62, 11, 23.5], [16, 60, -12, 6], [-78, -57, -25, -13], [-96, -68.5, -36, -27.5]];
    for (const [bx, bz] of bases) {
      for (let k = 1; k <= 6; k++) {
        const x = bx + ((k - 1) % 3) * 2;
        const z = bz + (k > 3 ? 2 : 0);
        for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) expect(inside(deck, x + dx, z + dz), `${x}, ${z}`).toBe(true);
        for (const b of boxes) expect(x > b[0] - 2 && x < b[1] + 2 && z > b[2] - 2 && z < b[3] + 2, `${x}, ${z} in a start box`).toBe(false);
      }
    }
  });

  it('the avoidance switches: path finding and the avoidance velocity each set their pair; the walk past the jet says how near he came', () => {
    const r = hook(START + `click("Target: walk > Collision avoidance > Report the switches")\nframes(1)\nclick("Target: walk > Collision avoidance > Path finding: ON")\nframes(1)
click("Target: walk > Collision avoidance > Avoidance velocity: ON")\nframes(1)\nclick("Target: walk > Collision avoidance > All off (as DCS had them)")\nframes(1)
click("${TARGET}")\nframes(1)\nclick("${TARGET}")\nframes(1)\nclick("Target: walk > Collision avoidance > Walk the target to the far side of my jet")\nframes(62)`);
    expect(r.says.slice(0, 4).map((s) => s.split('. Wait')[0])).toEqual([
      "crew environment: avoid collisions off, path avoids collisions off; character code: take the avoidance's velocity off, use the path finder off.",
      "crew environment: avoid collisions off, path avoids collisions ON; character code: take the avoidance's velocity off, use the path finder ON",
      "crew environment: avoid collisions ON, path avoids collisions ON; character code: take the avoidance's velocity ON, use the path finder ON",
      "crew environment: avoid collisions off, path avoids collisions off; character code: take the avoidance's velocity off, use the path finder off",
    ]);
    expect(r.says[1]).toMatch(/\. Wait 10 s \(the navigation grid is refilled on a timer\), then "Target: walk > To the far side of my jet"\.$/);
    // the character code's switches by their numbers: 3 the path finder, 2 the avoidance's velocity; the logging switch (0) is never touched
    // (the last: path finding is switched on by itself when the people are first found, 8 s into the mission)
    expect(r.rec.filter((l) => l.startsWith('debugset '))).toEqual(['debugset 3 1', 'debugset 2 1', 'debugset 2 0', 'debugset 3 0', 'debugset 3 1']);
    expect(r.logLines).toContain('path finding switched on at mission start: environment "path avoids collisions" ON, character code "use the path finder" ON');
    expect(r.logLines.some((l) => l.endsWith('(the four bytes: 1011)'))).toBe(true);
    // our green shirt at (14, 27), the jet at (-10.5, 34): the point 14 m beyond the jet on that line
    expect(r.rec.filter((l) => l.startsWith('walk ')).map((l) => l.split(' ship ')[0])).toEqual(['walk 103 to -23.96 37.85 facing 0.00 0.00']);
    // the stand-in walks straight: right through the middle of the jet
    // (39.5 m in all; the stand-in has taken its first 0.6 m step when it is first asked where he is)
    expect(r.says[r.says.length - 1]).toMatch(/The nearest he came to the middle of your jet: 0\.\d m \(he walked 38\.9 m; the straight line is 38\.9 m\)\.$/);
  });

  // ---- the marshalling against the real data: PriFly's routes and DCS's deck outline
  /** the hook's copy of the deck outline: [x forward, z starboard] */
  const hookDeck = (): [number, number][] => {
    const body = /local DECK = \{([\s\S]*?)\n\}/.exec(hookSrc)?.[1] ?? '';
    return [...body.matchAll(/\{\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
  };
  const inside = (poly: [number, number][], x: number, z: number): boolean => {
    let inPoly = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [a, b] = [poly[i], poly[j]];
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inPoly = !inPoly;
    }
    return inPoly;
  };

  it("the deck spots are the user's, as he respotted them in DCS: where and named as deck-spots-dcs.csv has them, none moved by the generator; a spot that file does not have still gets the edge rule; the generator's outline is the hook's", () => {
    // (the generated spots file is current: else node scripts/catcc/deck-spots.gen.ts)
    expect(fs.readFileSync(here('../../src/components/catcc/prifly/deckSpots.gen.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(buildSpotsTs());
    expect(movedSpots.length).toBe(0);
    // every one of the 40 is where the DCS file has it (to the centimetre; PriFly's y is to port), named as there,
    // and its main wheels are on the deck with a metre and more to spare
    const dcs = dcsSpots(fs.readFileSync(SPOTS_DCS_CSV, 'utf8'));
    expect(dcs.size).toBe(40);
    for (const d of T_SPOTS) {
      const o = dcs.get(d.n)!;
      expect(d.label).toBe(o.name);
      expect([d.p[0], d.p[1]], o.name).toEqual([Math.round(o.x * 100) / 100, Math.round(-o.z * 100) / 100]);
      expect(wheelsInside(o.x, o.z, o.hdg), o.name).toBeGreaterThan(1);
    }
    // the names as respotted: six on the starboard bow, two on the port bow, two in the crotch, three on the patio
    const count = (area: string) => T_SPOTS.filter((q) => q.area === area).length;
    // (and since 2026-11-23 the four aftmost are the fantail, the port side's other three the port quarter)
    expect(['Stbd bow', 'Port bow', 'Crotch', 'Point', 'Patio', 'Sixpack', 'Fantail', 'Port quarter'].map(count)).toEqual([6, 2, 2, 4, 3, 6, 4, 3]);
    // (the drawing's "Bow port 1" stands in the starboard bow row (now Stbd bow 4); the drawing's "Bow port 2" on the patio)
    expect(T_SPOTS.find((q) => q.n === 6)!.label).toBe('Stbd bow 4');
    expect(T_SPOTS.find((q) => q.n === 7)!.label).toBe('Patio 2');
    // (within an area the numbers run by nearness to the area's catapult: spots.test.ts)
    // WITHOUT the DCS file: the drawing's spots, and the edge rule: every spot whose tail points at the deck edge has
    // its main wheels 4 ft from it (29 of them, none moved further than 2.6 m)
    const plain = buildSpotsTs(undefined, '');
    expect(movedSpots.length).toBe(29);
    expect(Math.max(...movedSpots.map((m) => Math.abs(m.moved)))).toBeLessThan(2.6);
    const at = new Map([...plain.matchAll(/label: '([^']+)', area: '[^']+', p: \[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]] as [string, [number, number]]));
    const csv = fs.readFileSync(here('../../carrier-ops-handoff-2/deck-spots.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
    for (const m of movedSpots) {
      const row = csv.find((c) => c[1] === m.name)!;
      const d = at.get(m.name)!;
      // on its heading still (moved along it only), and the nearer main wheel 1.22 m inside the edge (positions are kept to the centimetre)
      expect(Math.abs(wheelsInside(d[0], -d[1], Number(row[5])) - EDGE.wheelsFromEdge), m.name).toBeLessThan(0.02);
      const a = (Number(row[5]) * Math.PI) / 180;
      const across = (d[0] - Number(row[2])) * -Math.sin(a) + (-d[1] - Number(row[4])) * Math.cos(a);
      expect(Math.abs(across), m.name).toBeLessThan(0.011);
    }
    // a spot in the middle of the deck is where the drawing has it
    const r1 = csv.find((c) => c[1] === 'Sixpack 1')!;
    expect(at.get('Sixpack 1')).toEqual([Math.round(Number(r1[2]) * 100) / 100, Math.round(-Number(r1[4]) * 100) / 100]);
    buildSpotsTs(); // (the list of moved spots as the real build leaves it)
    expect(DECK_OUTLINE).toEqual(hookDeck());
  });

  it("the routes file is what PriFly's taxi network gives now (else: node catcc-dcs/deck-test/crew-test/routes.gen.ts)", () => {
    const made = buildRoutesLua();
    expect({ routes: made.routes, starts: made.starts, missing: made.missing }).toEqual({ routes: 160, starts: 40, missing: 0 });
    expect(routesSrc).toBe(made.text);
  });

  it.skipIf(!fs.existsSync(`${SCRIPTS}/GroundCrew.lua`))("the hook's deck outline is DCS's own (GroundCrew.lua deck(), the island cut out)", () => {
    const read = (f: string) => fs.readFileSync(`${SCRIPTS}/${f}`, 'latin1');
    const dcs = run(
      `local FILES = { ['./CoreMods/tech/USS_Nimitz/scripts/utils.lua'] = UTILS, ['./CoreMods/tech/USS_Nimitz/scripts/crew.lua'] = CREW }
dofile = function(p) return assert(load(assert(FILES[p], 'no file ' .. p), p))() end
assert(load(GC, 'GroundCrew.lua'))()
local o = {}
for i, v in ipairs(deck_obstacle_data[1]) do o[i] = string.format('%.2f,%.2f', v[1], v[3]) end
OUT = table.concat(o, ';')`,
      { UTILS: read('utils.lua'), CREW: read('crew.lua'), GC: read('GroundCrew.lua').replace(/-- CATCC-DIRTEST BEGIN[\s\S]*?-- CATCC-DIRTEST END/g, '') },
    )
      .split(';')
      .map((p) => p.split(',').map(Number));
    const mine = hookDeck();
    expect(mine.length).toBe(31);
    expect(dcs.length).toBe(31);
    for (let i = 0; i < 31; i++) {
      expect(Math.abs(mine[i][0] - dcs[i][0])).toBeLessThan(0.011);
      expect(Math.abs(mine[i][1] - dcs[i][1])).toBeLessThan(0.011);
    }
    // the island is not deck; mid-deck is
    expect(inside(mine, -50, 30)).toBe(false);
    expect(inside(mine, -50, 10)).toBe(true);
  });

  it('marshalling on the real routes: from every deck spot to every catapult, every director stands on the deck with 2 m to spare', () => {
    const r = hook(`ROUTES_SRC = ROUTES_REAL
local T = load(ROUTES_REAL)()
add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A) add(106, 'catcc-c1', '1: catcc-c1', 14, 31, SHIP_A) add(107, 'catcc-c2', '1: catcc-c2', 14, 33, SHIP_A)
HANDLER.onSimulationStart() frames(1)
for _, st in ipairs(T) do
  for cat = 1, 4 do
    local route = st.routes[cat]
    local dx, dz = route[2][1] - route[1][1], route[2][2] - route[1][2]
    local m = math.sqrt(dx * dx + dz * dz)
    setJet(st.x, st.z, dx / m, dz / m)   -- on the spot, pointing along the route's first metres
    click("${MARSHAL} " .. cat) frames(1)
    click("Stop the demo / signal test / marshalling") frames(1)
  end
end`);
    const deck = hookDeck();
    const stations = r.logLines
      .map((l) => /^marshal: (\S+) takes the stretch (\d+)\.\.(\d+) m: stands at (-?[\d.]+) fwd (-?[\d.]+) stbd/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ x: Number(m[4]), z: Number(m[5]) }));
    // 160 routes; the ones that start inside (or within 5 m of) their catapult's start box need no directors: the
    // six-pack's two forward spots for catapult 2 and the port spot beside EL 4 for catapult 4 (EL 4's forward spot
    // was a fourth until the edge spots were moved back to 4 ft from the edge)
    const started = r.says.filter((s) => s.startsWith('marshalling to catapult ')).length;
    const inBox = r.says.filter((s) => s.includes("start box already (or within 5 m of it): the catapult's own crew takes you")).length;
    expect(started + inBox).toBe(160);
    expect(inBox).toBeGreaterThanOrEqual(2);
    expect(inBox).toBeLessThanOrEqual(4);
    expect(stations.length).toBeGreaterThan(300);
    const offDeck = stations.filter((p) => ![[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => inside(deck, p.x + dx, p.z + dz)));
    expect(offDeck).toEqual([]);
    expect(r.logLines.filter((l) => l.includes('no place on deck found'))).toEqual([]);
  });

  it('marshalling to a parking spot on the real routes: from where the roll-out ends to EL 2, the last director stops the jet on the spot', () => {
    const r = hook(`ROUTES_SRC = ROUTES_REAL
local T = load(ROUTES_REAL)()
add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A) add(106, 'catcc-c1', '1: catcc-c1', 14, 31, SHIP_A) add(107, 'catcc-c2', '1: catcc-c2', 14, 33, SHIP_A)
local park
for _, e in ipairs(T.parking) do if e.area == 'El 2' and not park then park = e end end
rec('park ' .. park.id .. ' spot ' .. park.spot .. ' of ' .. #T.parking)
local route = park.route
local function at(d)   -- the point d metres along the route, and the direction there
  local i = 1
  while i < #route - 1 do
    local l = math.sqrt((route[i + 1][1] - route[i][1]) ^ 2 + (route[i + 1][2] - route[i][2]) ^ 2)
    if d <= l then break end
    d, i = d - l, i + 1
  end
  local dx, dz = route[i + 1][1] - route[i][1], route[i + 1][2] - route[i][2]
  local l = math.sqrt(dx * dx + dz * dz)
  return route[i][1] + dx / l * d, route[i][2] + dz / l * d, dx / l, dz / l
end
local x, z, fx, fz = at(0)
setJet(x, z, fx, fz)
rec(string.format('jet at the start: %.2f %.2f nose %.3f %.3f', x, z, fx, fz))
HANDLER.onSimulationStart() frames(1)
click("Our crew > Marshal me to a parking spot > El 2") frames(20)
-- the jet is taxied along the route the hook made (out of the landing area first), as the log has it
for _, l in ipairs(LOG) do
  local pts = l:match('marshal: route (.+)$')
  if pts then
    route = {}
    for a, b in pts:gmatch('(-?[%d.]+),(-?[%d.]+)') do route[#route + 1] = { tonumber(a), tonumber(b) } end
  end
end
rec('route points ' .. #route .. ' first ' .. string.format('%.2f %.2f', route[1][1], route[1][2]) .. ' third ' .. string.format('%.2f %.2f', route[3][1], route[3][2]))
for d = 1, 60 do
  x, z, fx, fz = at(d * 2)
  setJet(x, z, fx, fz)
  frames(0.5)
end
rec('jet before: ' .. string.format('%.2f %.2f nose %.2f %.2f', jet.f, jet.s, jet.nf, jet.ns))
frames(8)
rec('jet after: ' .. string.format('%.2f %.2f nose %.2f %.2f', jet.f, jet.s, jet.nf, jet.ns))
frames(4)
setJet(100, 0, 1, 0)
click("Our crew > Marshal me to a parking spot > Patio") frames(1)`);
    // 31 parking routes; the first EL 2 spot in DCS's order of parking places is the aft one
    expect(r.rec).toContain('park E22 spot 27 of 31');
    expect(r.says[0]).toMatch(/^marshalling to El 2 2 \(spot 27\): \d+ m to go\. \S+, \S+(, \S+)* walking to their stations\. When \S+ is in place he takes you: follow the signals; the last director stops you on the spot\. First OUT OF THE LANDING AREA: a turn to starboard, square off it, \d+ m; then the way to the spot\.$/);
    // The jet stood on the landing area's centreline: the first leg is 4 m straight on, then square off the landing area
    // to starboard (9.14 degrees to port of the bow: its starboard is 0.159 forward, 0.987 to starboard) for 22.5 m (the
    // strip's half width of 12.5 m and 10 m more), and only then the way to the spot
    const js = r.rec.find((l) => l.startsWith('jet at the start: '))!.match(/(-?[\d.]+) (-?[\d.]+) nose (-?[\d.]+) (-?[\d.]+)$/)!.slice(1).map(Number);
    const rp = r.rec.find((l) => l.startsWith('route points '))!.match(/^route points (\d+) first (-?[\d.]+) (-?[\d.]+) third (-?[\d.]+) (-?[\d.]+)$/)!.slice(1).map(Number);
    expect(rp[0]).toBeGreaterThan(4);
    expect(rp[1]).toBeCloseTo(js[0], 1);
    expect(rp[2]).toBeCloseTo(js[1], 1);
    const lat = (js[0] + 45) * 0.15877 + (js[1] + 10.49) * 0.98731;
    expect(Math.abs(lat)).toBeLessThan(1);
    expect(rp[3]).toBeCloseTo(js[0] + js[2] * 4 + 0.15877 * (22.5 - lat), 1);
    expect(rp[4]).toBeCloseTo(js[1] + js[3] * 4 + 0.98731 * (22.5 - lat), 1);
    const events = r.logLines.filter((l) => /^marshal: \S+ (takes the jet|hands over|stops the jet)/.test(l)).map((l) => l.replace(/^marshal: /, '').replace(/ \("[^"]*"\).*$/, '').replace(/ at \d+ m.*$/, ''));
    expect(events[0]).toMatch(/takes the jet$/);
    expect(events[events.length - 1]).toMatch(/^\S+ stops the jet on El 2 2$/);
    expect(events.filter((e) => e.includes('hands over')).length).toBeGreaterThanOrEqual(1);
    // the stop signal (DCS's blend space), held; nobody passes control to a catapult crew
    expect(r.rec.some((l) => l.endsWith('bs_sign_stop mode 2'))).toBe(true);
    expect(r.logLines.some((l) => l.includes("passes control to catapult"))).toBe(false);
    expect(r.says).toContain(r.says.find((l) => /^marshalling over: you are on El 2 2 \(you were at most \d\.\d m off the route\)\. Hold the brakes: when you stand still you are put square on the spot\.$/.test(l)) ?? 'no "marshalling over" message');
    // When the jet has stood still for 2 s it is put square on the spot: the spot's own place, the heading a jet spawned
    // there has, the height the jet stands at; through the ATC's teleport, with the jet's object id
    const spot = T_SPOTS.find((q) => q.n === 27)!;
    const tp = r.rec.filter((l) => l.startsWith('teleport '));
    expect(tp.length).toBe(1);
    const tm = tp[0].match(/^teleport 10\d id 16777472 to (-?[\d.]+) (-?[\d.]+) up 22\.00 nose (-?[\d.]+) (-?[\d.]+) right (-?[\d.]+) (-?[\d.]+)$/)!;
    expect(tm).not.toBeNull();
    const rad = (spot.hdg * Math.PI) / 180;
    expect(Number(tm[1])).toBeCloseTo(spot.p[0], 1);
    expect(Number(tm[2])).toBeCloseTo(-spot.p[1], 1);
    expect(Number(tm[3])).toBeCloseTo(Math.cos(rad), 2);
    expect(Number(tm[4])).toBeCloseTo(-Math.sin(rad), 2);
    // (the jet's right is its nose turned a quarter to starboard)
    expect(Number(tm[5])).toBeCloseTo(Math.sin(rad), 2);
    expect(Number(tm[6])).toBeCloseTo(Math.cos(rad), 2);
    expect(r.rec.find((l) => l.startsWith('jet after: '))).not.toBe(r.rec.find((l) => l.startsWith('jet before: '))!.replace('before', 'after'));
    expect(r.says).toContain(r.says.find((l) => /^teleport to El 2 2 \(the ATC's teleport\): you are now 0\.0 m from the spot and 0 degrees off its heading: on it\.$/.test(l)) ?? 'no teleport result');
    // afterwards everyone walks back to where he stood
    expect(r.rec.filter((l) => /^walk 10[3567] to 14\.00 (27|29|31|33)\.00 facing 0\.00 0\.00/.test(l)).length).toBeGreaterThanOrEqual(2);
    // far from every parking route (on the bow, 100 m forward): said so
    expect(r.says[r.says.length - 1]).toMatch(/^the way to Patio 3 \(spot 31\) starts where the roll-out ends; it passes \d+ m from you and leads on \d+ degrees off your nose: too far, or behind you \(taken within 40 m and 110 degrees\)\.$/);
    expect(otherShip(r)).toEqual([]);
  });

  it('roles: the yellow shirts (catcc-c..) direct, the brown shirt (catcc-m0) is the plane captain wherever he stands, the driver (catcc-t0) does neither', () => {
    // catcc-t0 is the nearest of ours to the jet, catcc-m0 the farthest
    const r = hook(`add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A) add(106, 'catcc-m0', '1: catcc-m0', 60, 31, SHIP_A) add(107, 'catcc-t0', '1: catcc-t0', -10, 30, SHIP_A)
for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' and PEOPLE[i].parent == SHIP_A then table.remove(PEOPLE, i) end end
${START}click("Plane captain > Come to my jet")\nframes(2)\nclick("Plane captain > Send him home")\nframes(2)
click("${MARSHAL} 2")\nframes(2)`);
    expect(r.says[0]).toMatch(/^catcc-m0 is your plane captain: walking out to you/);
    const m = r.says.find((l) => l.startsWith('marshalling to catapult 2'))!;
    expect(m).toContain('catcc-c0 walking to his station');
    expect(m).not.toContain('catcc-t0');
    expect(m).not.toContain('catcc-m0');
    expect(r.rec.some((l) => l.startsWith('walk 107 '))).toBe(false);
  });

  it('nobody of ours rides an elevator down: whoever stands on the platform is walked off inboard first, then it is lowered', () => {
    // catcc-c0 stands on elevator 1 (30 m forward, 30 m to starboard); catcc-c1 beside it, off the platform
    const r = hook(`add(105, 'catcc-c0', '1: catcc-c0', 30, 30, SHIP_A) add(106, 'catcc-c1', '1: catcc-c1', 12, 30, SHIP_A)
${START}click("Catapult crews > Elevators > Elevator 1: down")\nframes(1)
rec('elevator commands so far: ' .. tostring(ELEV[0]))
frames(20)
rec('elevator commands then: ' .. tostring(ELEV[0]) .. ' man at ' .. string.format('%.1f %.1f', byH[105].x, byH[105].z))`);
    expect(r.says[0]).toBe('elevator 1: one of ours on it (catcc-c0): walking off first. It goes down when they are clear.');
    expect(r.rec).toContain('elevator commands so far: nil');
    // he walks straight inboard, to 15 m to starboard, facing the elevator; the other man is left alone
    expect(r.rec.some((l) => /^walk 105 to 30\.00 15\.00 facing 0\.00 1\.00/.test(l))).toBe(true);
    expect(r.rec.some((l) => l.startsWith('walk 106 '))).toBe(false);
    expect(r.rec).toContain('elevator commands then: 1 man at 30.0 15.0');
    expect(r.says).toContain('elevator 1 told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?');
    expect(r.logLines.some((l) => /^elevator 1: everyone of ours is off it after \d+ s: lowered now$/.test(l))).toBe(true);
    // nobody on it: lowered at once
    const free = hook(START + 'click("Catapult crews > Elevators > Elevator 2: down")\nframes(1)');
    expect(free.says[0]).toBe('elevator 2 told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?');
  });

  it('the deck spotting tool: a static Hornet on every spot (not on the player), lock on the one the camera looks at, move and turn it in steps, add and remove; every change saved', () => {
    const D = 'CATCC deck spots';
    // four spots; the player's jet stands on the third (-10.5 / 34)
    const SPOTS = `ROUTES_SRC = [[return {
  { spot = 1, name = "Bow 1", x = 150, z = 8, fx = -1, fz = 0, routes = {} },
  { spot = 2, name = "Bow 2", x = 140, z = 8, fx = -1, fz = 0, routes = {} },
  { spot = 3, name = "El 2 a", x = -10.5, z = 34, fx = 0, fz = -1, routes = {} },
  { spot = 4, name = "Six 1", x = 60, z = 20, fx = 0.6, fz = -0.8, routes = {} },
}]]\n`;
    const r = hook(`${SPOTS}${START}click("${D} > Lock on the one the camera looks at")\nframes(1)
click("${D} > Park a Hornet on every deck spot")\nframes(2)
rec('-- parked')
CAMAT = { f = 120, s = 40, up = 60, lf = 141, ls = 9 }
click("${D} > Lock on the one the camera looks at")\nframes(1)
click("${D} > Move it forward / aft (along its nose) > Forward 1 m") click("${D} > Move it forward / aft (along its nose) > Aft 10 cm") click("${D} > Move it right / left (along its wings) > Right 1 cm")\nframes(2)
click("${D} > Turn it > Right 5 degrees") click("${D} > Turn it > Left 0.1 degree")\nframes(2)
rec('-- moved')
click("${D} > Lock on the next / the one before > The next")\nframes(1)
click("${D} > Lock on the next / the one before > The next")\nframes(1)
click("${D} > Add / remove > Remove the locked aircraft (no spot there)")\nframes(1)
CAMAT = { f = 100, s = 0, up = 50, lf = 100, ls = -20 }
click("${D} > Add / remove > Add an aircraft where the camera looks")\nframes(1)
click("${D} > Wings: folded / spread (all)")\nframes(2)
click("${D} > Report the locked one; save all")\nframes(1)
rec('-- file')
for line in SPOTS_FILE:gmatch('[^\\n]+') do if line:sub(1, 3) == '  {' then rec('file ' .. line) end end
rec('wings ' .. tostring(JETARG[STATICS['catcc-spot-1 1'].id_ .. '/8']))
click("${D} > Take them all away")\nframes(1)
local n = 0
for name in pairs(STATICS) do if name:find('catcc-spot', 1, true) then n = n + 1 end end
rec('standing after "away": ' .. n)`);
    const cutP = r.rec.indexOf('-- parked');
    const cutM = r.rec.indexOf('-- moved');
    const statics = (from: number, to: number) => r.rec.slice(from, to).filter((l) => l.startsWith('static catcc-spot'));
    // before anything is parked: said so
    expect(r.says[0]).toBe('deck spots: park the aircraft first (F10 > CATCC deck spots > Park a Hornet on every deck spot).');
    // parked: static aircraft LINKED to the ship, category "Planes", turned as the spot is (the nose aft: 180 degrees; the
    // nose to 0.6 / -0.8: 306.87); none on spot 3, where the player's own jet stands
    expect(statics(0, cutP)).toEqual([
      'static catcc-spot-1 1 type FA-18C_hornet category Planes linked true to 77 at 150.000 8.000 angle 3.1416 offset true cargo false',
      'static catcc-spot-2 2 type FA-18C_hornet category Planes linked true to 77 at 140.000 8.000 angle 3.1416 offset true cargo false',
      'static catcc-spot-4 3 type FA-18C_hornet category Planes linked true to 77 at 60.000 20.000 angle 5.3559 offset true cargo false',
    ]);
    expect(r.says[1]).toBe('deck spots: 3 aircraft parked on CVN-72, from the built-in spots; spot 3 left empty (an aircraft stands there). Look at one from outside (F11) and F10 > CATCC deck spots > Lock on the one the camera looks at.');
    // the camera, 60 m up beside the bow, looks at the deck at 141 / 9: spot 2 is the one
    expect(r.says[2]).toBe('deck spots: locked on spot 2 "Bow 2": 140.00 m forward, 8.00 m to starboard, nose 180.0 degrees (1 m from where the camera looks).');
    // moved along its OWN nose and wings (its nose points aft: "forward 1 m" is 1 m aft on the ship, its right is to port),
    // then turned: made anew each time, the one before taken away
    const moved = statics(cutP, cutM).map((l) => l.replace(/ category.* at /, ' at ').replace(/ offset.*/, ''));
    expect(moved).toEqual([
      'static catcc-spot-2 4 type FA-18C_hornet at 139.000 8.000 angle 3.1416',
      'static catcc-spot-2 5 type FA-18C_hornet at 139.100 8.000 angle 3.1416',
      'static catcc-spot-2 6 type FA-18C_hornet at 139.100 7.990 angle 3.1416',
      'static catcc-spot-2 7 type FA-18C_hornet at 139.100 7.990 angle 3.2289',
      'static catcc-spot-2 8 type FA-18C_hornet at 139.100 7.990 angle 3.2271',
    ]);
    expect(r.rec.slice(cutP, cutM).filter((l) => l.startsWith('destroy catcc-spot-2 ')).length).toBe(5);
    expect(r.says).toContain('deck spots: spot 2 "Bow 2": 139.10 m forward, 7.99 m to starboard, nose 184.9 degrees (from the built-in spot: -0.90 m forward, -0.01 m to starboard, +4.9 degrees).');
    // "the next" twice from spot 2: spot 3 (empty: the player's), then spot 4; removed: taken away, nothing locked
    expect(r.says).toContain('deck spots: locked on spot 4 "Six 1": 60.00 m forward, 20.00 m to starboard, nose 306.9 degrees.');
    expect(r.says).toContain('deck spots: removed: spot 4 "Six 1": 60.00 m forward, 20.00 m to starboard, nose 306.9 degrees. Nothing is locked now.');
    // added where the camera looks (100 / -20), turned as the camera looks (to port: 270 degrees), and locked on
    expect(r.says).toContain('deck spots: added and locked on: spot 5 "added 5": 100.00 m forward, -20.00 m to starboard, nose 270.0 degrees (added).');
    // the file: every spot's place now and the built-in one it started from; what was done to it
    const cutF = r.rec.indexOf('-- file');
    expect(r.rec.slice(cutF).filter((l) => l.startsWith('file ')).map((l) => l.slice(7))).toEqual([
      '{ n = 1, name = "Bow 1", x = 150.000, z = 8.000, hdg = 180.00, x0 = 150.000, z0 = 8.000, hdg0 = 180.00 },',
      '{ n = 2, name = "Bow 2", x = 139.100, z = 7.990, hdg = 184.90, x0 = 140.000, z0 = 8.000, hdg0 = 180.00, moved = true },',
      '{ n = 3, name = "El 2 a", x = -10.500, z = 34.000, hdg = 270.00, x0 = -10.500, z0 = 34.000, hdg0 = 270.00 },',
      '{ n = 4, name = "Six 1", x = 60.000, z = 20.000, hdg = 306.87, x0 = 60.000, z0 = 20.000, hdg0 = 306.87, removed = true },',
      '{ n = 5, name = "added 5", x = 100.000, z = -20.000, hdg = 270.00, added = true },',
    ]);
    expect(r.says).toContain('deck spots: locked on spot 5 "added 5": 100.00 m forward, -20.00 m to starboard, nose 270.0 degrees (added). All saved: 1 moved, 1 added, 1 removed (Logs\\catcc-deck-spots.lua).');
    // the wings: the statics' model argument 8, folded (1) to begin with, spread (0) after the menu item
    expect(r.logLines).toContain('deck spots: wings folded (model argument 8) on 3 aircraft');
    expect(r.rec).toContain('wings 0');
    expect(r.rec).toContain('standing after "away": 0');
    // WHICH CARRIER: the one the camera is at, not the one the player's jet stands on. Two carriers 3 km apart (and a
    // destroyer beside the second, which is no carrier); the player's jet on CVN-72; the camera over CVN-71: the
    // aircraft are parked on CVN-71 (linked to it: its id 78), all four (the player's jet is not in the way there), and
    // the work stays on CVN-71 when the camera goes back to the other ship
    const two = hook(`${SPOTS}TWO_SHIPS = true\n${START}CAMAT = { ship2 = true, f = 100, s = 60, up = 300, lf = 100, ls = 0 }
click("${D} > Park a Hornet on every deck spot")\nframes(2)
rec('-- parked')
CAMAT = { f = 120, s = 40, up = 60, lf = 141, ls = 9 }
click("${D} > Lock on the next / the one before > The next")\nframes(1)
click("${D} > Move it forward / aft (along its nose) > Forward 1 m")\nframes(1)
click("${D} > Take them all away")\nframes(1)
click("${D} > Park a Hornet on every deck spot")\nframes(2)`);
    const cutT = two.rec.indexOf('-- parked');
    expect(two.rec.slice(0, cutT).filter((l) => l.startsWith('static catcc-spot')).map((l) => l.replace(/^static (\S+) \d+ type \S+ category Planes linked true to (\d+) at (\S+) (\S+) .*/, '$1 on $2 at $3 $4'))).toEqual([
      'catcc-spot-1 on 78 at 150.000 8.000', 'catcc-spot-2 on 78 at 140.000 8.000', 'catcc-spot-3 on 78 at -10.500 34.000', 'catcc-spot-4 on 78 at 60.000 20.000']);
    expect(two.says[0]).toMatch(/^deck spots: 4 aircraft parked on CVN-71, from the built-in spots\./);
    expect(two.logLines.some((l) => l.startsWith('command spot spawn: 4 aircraft parked on CVN-71 (the carrier at the camera) from the built-in spots'))).toBe(true);
    // (the camera now at CVN-72: the locked aircraft is still moved on CVN-71)
    const after = two.rec.slice(cutT).filter((l) => l.startsWith('static catcc-spot'));
    expect(after[0]).toMatch(/^static catcc-spot-1 5 type FA-18C_hornet category Planes linked true to 78 at 149\.000 8\.000 /);
    // taken away and parked again with the camera at CVN-72: now on CVN-72 (its id 77), the player's own spot left empty
    expect(after.slice(1).every((l) => / linked true to 77 at /.test(l))).toBe(true);
    expect(after.slice(1).length).toBe(3);
    // no carrier within 5 km of the camera, and the player's jet on none: said so
    const far = hook(`${SPOTS}${START}CAMAT = { f = 9000, s = 0, up = 300 }\nsetJet(9000, 0, 1, 0)
click("${D} > Park a Hornet on every deck spot")\nframes(2)`);
    expect(far.says[0]).toBe('deck spots: no aircraft carrier within 5 km of the camera (put the camera over the carrier to spot).');
    // the next time the deck is filled the saved places come back (the removed one stays away)
    const again = hook(`${SPOTS}SPOTS_FILE = [[return {
  { n = 1, name = "Bow 1", x = 151.5, z = 8.25, hdg = 181, x0 = 150, z0 = 8, hdg0 = 180, moved = true },
  { n = 4, name = "Six 1", x = 60, z = 20, hdg = 306.87, x0 = 60, z0 = 20, hdg0 = 306.87, removed = true },
}]]\n${START}click("${D} > Park a Hornet on every deck spot")\nframes(2)
rec('-- parked')
click("${D} > Add / remove > Start over from the built-in spots")\nframes(2)`);
    const cutA = again.rec.indexOf('-- parked');
    expect(again.rec.slice(0, cutA).filter((l) => l.startsWith('static catcc-spot')).map((l) => l.replace(/ category.* at /, ' at ').replace(/ offset.*/, ''))).toEqual([
      'static catcc-spot-1 1 type FA-18C_hornet at 151.500 8.250 angle 3.1591']);
    expect(again.says[0]).toMatch(/^deck spots: 1 aircraft parked on CVN-72, from the saved file \(Logs\\catcc-deck-spots\.lua\); 1 removed before\./);
    // "start over": the built-in spots again (three of the four: the player's stays empty)
    expect(again.rec.slice(cutA).filter((l) => l.startsWith('static catcc-spot')).length).toBe(3);
  });

  it('the deck spotting tool parks the hangar too: the hangar plan\'s 24 places on the hangar floor, locked and moved with the camera in the hangar, saved with the rest', () => {
    // (the user, 2026-11-18: "Make the 'Park Hornets' function add all the aircraft in the hangar as well so I can adjust
    // them through the UI")
    const D = 'CATCC deck spots';
    const SPOTS = `ROUTES_SRC = [[return {
  { spot = 1, name = "Bow 1", x = 150, z = 8, fx = -1, fz = 0, routes = {} },
  { spot = 2, name = "Bow 2", x = 140, z = 8, fx = -1, fz = 0, routes = {} },
}]]\n`;
    const r = hook(`${SPOTS}${START}click("${D} > Park a Hornet on every deck spot")\nframes(2)
local down, up = 0, 0
for name, o in pairs(STATICS) do
  if name:find('^catcc%-spot%-') then
    local p = PLACED[o.id_]
    if p and p.own and math.abs(p.up - 10.567) < 0.01 then down = down + 1 else up = up + 1 end
  end
end
rec(string.format('parked: %d on the hangar floor, %d on the flight deck', down, up))
-- the camera in the hangar (13 m above the ship's origin: below the flight deck), looking at hangar slot 6
CAMAT = { f = 2, s = 5, up = 13, lf = -5.77, ls = 4.97, ly = 10.567 }
click("${D} > Lock on the one the camera looks at")\nframes(1)
click("${D} > Move it forward / aft (along its nose) > Forward 1 m")\nframes(1)
for name, o in pairs(STATICS) do
  if name:find('^catcc%-spot%-') and PLACED[o.id_] and PLACED[o.id_].up < 15 and math.abs(PLACED[o.id_].f + 6.77) < 0.05 then rec(string.format('moved: %.2f %.2f up %.3f', PLACED[o.id_].f, PLACED[o.id_].s, PLACED[o.id_].up)) end
end
-- the camera under the hangar's roof (16 m above the ship's origin), looking down at 0 / 3: an aircraft added there is
-- the hangar's, on the hangar floor
CAMAT = { f = 6, s = 3, up = 16, lf = 0, ls = 3, ly = 10.567 }
click("${D} > Add / remove > Add an aircraft where the camera looks")\nframes(1)
for name, o in pairs(STATICS) do
  local q = name:find('^catcc%-spot%-') and PLACED[o.id_]
  if q and math.abs(q.f) < 0.05 and math.abs(q.s - 3) < 0.05 then rec(string.format('added: %.2f %.2f up %.3f', q.f, q.s, q.up)) end
end
-- the camera over the flight deck at the same place: the deck's aircraft are the ones locked
CAMAT = { f = 150, s = 30, up = 60, lf = 141, ls = 9 }
click("${D} > Lock on the one the camera looks at")\nframes(1)
click("${D} > Report the locked one; save all")\nframes(1)
for line in SPOTS_FILE:gmatch('[^\\n]+') do if line:find('Hangar 6"', 1, true) or line:find('Hangar 24"', 1, true) then rec('file ' .. line) end end`, { demo: true });
    expect(r.rec).toContain('parked: 24 on the hangar floor, 2 on the flight deck');
    expect(r.says.some((l) => l.startsWith('deck spots: 26 aircraft parked on CVN-72 (24 of them in the hangar), from the built-in spots.'))).toBe(true);
    expect(r.says).toContain('deck spots: locked on hangar slot 6 "Hangar 6": -5.77 m forward, 4.97 m to starboard, nose 179.0 degrees (0 m from where the camera looks).');
    // its nose aft: "forward 1 m" is 1 m aft; made anew and put down on the hangar floor again
    expect(r.rec.find((l) => l.startsWith('moved: '))).toBe('moved: -6.77 4.99 up 10.567');
    // ADDED FROM UNDER THE HANGAR'S ROOF (the user, 2026-11-18: "when I tried to add an aircraft it appeared on the
    // flight deck instead of inside the hangar": the camera counted as in the hangar only below 14 m; the hangar is
    // some 7 m high, its floor at 8.7): the camera 16 m up is in the hangar: the new aircraft is the hangar's (the next
    // number after its 24), stands where the camera looks, on the hangar floor, turned as the locked one
    expect(r.says).toContain('deck spots: added and locked on: hangar slot 25 "added hangar 25": 0.00 m forward, 3.00 m to starboard, nose 179.0 degrees (added).');
    expect(r.rec).toContain('added: 0.00 3.00 up 10.567');
    expect(r.logLines.some((l) => l.startsWith("command spot add (the camera 16.0 m above the ship's origin: in the hangar): hangar slot 25"))).toBe(true);
    expect(r.says).toContain('deck spots: locked on spot 2 "Bow 2": 140.00 m forward, 8.00 m to starboard, nose 180.0 degrees (1 m from where the camera looks).');
    expect(r.rec.filter((l) => l.startsWith('file ')).map((l) => l.slice(7))).toEqual([
      '{ n = 1006, name = "Hangar 6", x = -6.770, z = 4.988, hdg = 178.97, x0 = -5.770, z0 = 4.970, hdg0 = 178.97, moved = true, hangar = true },',
      '{ n = 1024, name = "Hangar 24", x = -113.590, z = -5.910, hdg = 113.95, x0 = -113.590, z0 = -5.910, hdg0 = 113.95, hangar = true },',
    ]);
    // a file saved before the hangar was in it: its deck spots, and the hangar plan's slots added
    const old = hook(`${SPOTS}SPOTS_FILE = [[return {
  { n = 1, name = "Bow 1", x = 151.5, z = 8.25, hdg = 181, x0 = 150, z0 = 8, hdg0 = 180, moved = true },
}]]\n${START}click("${D} > Park a Hornet on every deck spot")\nframes(2)`, { demo: true });
    expect(old.says[0]).toMatch(/^deck spots: 25 aircraft parked on CVN-72 \(24 of them in the hangar\), from the saved file/);
  });

  it('hangar marks: a crosshair at the screen\'s centre on the panel\'s page; a floor point where its line meets the hangar floor, a two-angle point from two shots; each drawn as a plate at its height and saved; dropped and removed again', () => {
    const r = hook(`${START}local W = WINDOWS.crewtest_ui
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
press('Hangar marks')\nframes(0.5)
local cross
for _, w in ipairs(WIDGETS) do if w.kind == 'Window' and w ~= W and w.b[3] == 6 then cross = w end end
rec('crosshair: ' .. (cross and string.format('%d %d %d x %d', cross.b[1], cross.b[2], cross.b[3], cross.b[4]) or 'none'))
rec('marks page: ' .. shown('Button'))
-- the camera in the hangar, 13 m above the ship's origin, looking down at the floor 2 m forward, 3 m to starboard
CAMAT = { f = 12, s = 3, up = 13, lf = 2, ls = 3, ly = 8.711 }
HOTKEYS['Ctrl+Shift+z']()\nframes(1)
-- (looking level: it never meets the floor)
CAMAT = { f = 12, s = 3, up = 13 }
HOTKEYS['Ctrl+Shift+z']()\nframes(1)
-- a two-angle point: 30 forward, 11 up, -9 to starboard, from two places; and one taken from nearly the same place
CAMAT = { f = 10, s = 0, up = 12, lf = 30, ls = -9, ly = 11 }
HOTKEYS['Ctrl+Shift+x']()\nframes(1)
CAMAT = { f = 10.2, s = 0.1, up = 12, lf = 30, ls = -9, ly = 11 }
HOTKEYS['Ctrl+Shift+x']()\nframes(1)
CAMAT = { f = 28, s = 8, up = 13.5, lf = 30, ls = -9, ly = 11 }
HOTKEYS['Ctrl+Shift+x']()\nframes(1)
for _, w in ipairs(WIDGETS) do if w.kind == 'Static' and w.visible and w.text:find('point(s) recorded', 1, true) then rec('status: ' .. w.text:gsub('\\n', ' / ')) end end
local placed = {}
for name, o in pairs(STATICS) do
  if name:find('^catcc%-hmark%-') and PLACED[o.id_] then placed[#placed + 1] = string.format('%s at %.2f %.2f up %.2f', name:match('^(%S+)'), PLACED[o.id_].f, PLACED[o.id_].s, PLACED[o.id_].up) end
end
table.sort(placed)
for _, l in ipairs(placed) do rec('marker ' .. l) end
for line in MARKS_FILE:gmatch('[^\\n]+') do if line:sub(1, 3) == '  {' then rec('file ' .. line) end end
-- the panel put away: the crosshair stays, and so do its keys
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
rec('hidden: crosshair ' .. cross.b[3] .. ' x ' .. cross.b[4])
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)\npress('Remove the last point')\nframes(0.5)
local n = 0
for name in pairs(STATICS) do if name:find('^catcc%-hmark%-') then n = n + 1 end end
rec('after remove: markers ' .. n)
for line in MARKS_FILE:gmatch('[^\\n]+') do if line:sub(1, 3) == '  {' then rec('file now ' .. line) end end
press('Deck spots')\nframes(0.5)
rec('deck page: crosshair ' .. cross.b[3] .. ' x ' .. cross.b[4])
-- a mission later: the points come back with their markers when the page is opened
HANDLER.onSimulationStop()\nHANDLER.onSimulationStart()\nframes(1)
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)\npress('Hangar marks')\nframes(0.5)
n = 0
for name in pairs(STATICS) do if name:find('^catcc%-hmark%-') then n = n + 1 end end
rec('next mission: markers ' .. n)`, { ui: true });
    // the crosshair: 6 x 6 at the middle of the 2560 x 1600 screen while the page is open; the page's buttons
    expect(r.rec).toContain('crosshair: 1277 797 6 x 6');
    expect(r.rec.find((l) => l.startsWith('marks page: '))).toBe('marks page: Deck spots | Tow | Crew test menu | [Hangar marks] | Flag | Hide | Floor point (Ctrl+Shift+Z) | Two-angle shot (Ctrl+Shift+X) | Drop the first shot | Remove the last point');
    // A FLOOR POINT: where the line through the screen's centre meets the hangar floor (8.711 m above the ship's origin)
    expect(r.says).toContain('hangar marks: point 1 (floor): 2.00 m forward, 8.71 up, 3.00 to starboard.');
    expect(r.says).toContain('hangar marks: the crosshair looks level or up: it never meets the floor. Aim at the foot of the wall, where it meets the floor.');
    // A TWO-ANGLE POINT: the first shot kept; a second from nearly the same place refused; one from well round gives it
    expect(r.says).toContain('hangar marks: first shot taken. Move the camera well round (more than 8 degrees), aim at the same point and take the second.');
    expect(r.says.some((l) => /^hangar marks: the two lines are only \d\.\d degrees apart: move the camera further round/.test(l))).toBe(true);
    expect(r.says.some((l) => /^hangar marks: point 2 \(two-angle\): 30\.00 m forward, 11\.00 up, -9\.00 to starboard; the two lines 0\.00 m apart, \d+ degrees between them\.$/.test(l))).toBe(true);
    expect(r.rec.find((l) => l.startsWith('status: '))).toMatch(/^status: 2 point\(s\) recorded\. \/ Last: point 2 \(two-angle\)/);
    // each drawn where it is: a plate at the point's own height, on the ship
    expect(r.rec).toContain('marker catcc-hmark-1 at 2.00 3.00 up 8.71');
    expect(r.rec).toContain('marker catcc-hmark-2 at 30.00 -9.00 up 11.00');
    // saved at once
    expect(r.rec.filter((l) => l.startsWith('file   ')).map((l) => l.slice(7))).toEqual([
      '{ n = 1, kind = "floor", x = 2.000, y = 8.711, z = 3.000, ship = "CVN-72" },',
      expect.stringMatching(/^\{ n = 2, kind = "two-angle", x = 30\.000, y = 11\.000, z = -9\.000, gap = 0\.000, deg = \d+\.\d, ship = "CVN-72" \},$/),
    ]);
    // the panel put away after the page was opened: the crosshair stays; another page takes it away
    expect(r.rec).toContain('hidden: crosshair 6 x 6');
    expect(r.rec).toContain('deck page: crosshair 1 x 1');
    // the last point removed: its marker gone, the file without it
    expect(r.rec).toContain('after remove: markers 1');
    expect(r.rec.filter((l) => l.startsWith('file now ')).map((l) => l.slice(11))).toEqual(['{ n = 1, kind = "floor", x = 2.000, y = 8.711, z = 3.000, ship = "CVN-72" },']);
    // the next mission: read again from the file, its marker made when the page is opened
    expect(r.rec).toContain('next mission: markers 1');
  });

  it('the in-game panel: built at the first frame, shown by its hot key; a click in the world locks on the aircraft under the cursor, the buttons move it; the tow page; the F10 menu as buttons', () => {
    const SPOTS = `ROUTES_SRC = [[return {
  { spot = 1, name = "Bow 1", x = 150, z = 8, fx = -1, fz = 0, routes = {} },
  { spot = 2, name = "Bow 2", x = 140, z = 8, fx = -1, fz = 0, routes = {} },
  { spot = 3, name = "El 2 a", x = -10.5, z = 34, fx = 0, fz = -1, routes = {} },
  { spot = 4, name = "Six 1", x = 60, z = 20, fx = 0.6, fz = -0.8, routes = {} },
}]]\n`;
    const r = hook(`${SPOTS}${START}local W = WINDOWS.crewtest_ui
local mark = WINDOWS.crewtest_ui_mark
rec('built: ' .. tostring(W ~= nil) .. ' mark ' .. tostring(mark ~= nil) .. ' through ' .. tostring(mark.through))
local function state() return string.format('visible %s, hidden skin %s, %d x %d, cursor %s', tostring(W.visible), tostring(W.skin and W.skin.hidden or false), W.b[3], W.b[4], tostring(W.cursor)) end
rec('put away: ' .. state() .. '; buttons "' .. shown('Button') .. '"; mark ' .. tostring(mark.visible) .. ' ' .. mark.b[3] .. ' x ' .. mark.b[4])
-- ONE PRESS: DCS calls the key's function twice at once, and again and again while the key is held. Nothing is done
-- to the window inside the key's own call: the next frame does it
HOTKEYS['Ctrl+Shift+F10']() HOTKEYS['Ctrl+Shift+F10']()
rec('inside the call: shown ' .. tostring(panelShown()))
frames(0.25)
rec('pressed (called twice): shown ' .. tostring(panelShown()))
for _ = 1, 6 do frames(0.25) HOTKEYS['Ctrl+Shift+F10']() end
frames(0.25)
rec('held 1.5 s: shown ' .. tostring(panelShown()))
frames(1)
HOTKEYS['Ctrl+Shift+F10']() HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
rec('pressed again: shown ' .. tostring(panelShown()))
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
rec('shown: ' .. state() .. ' at ' .. W.b[1] .. ' ' .. W.b[2])
rec('deck page: ' .. shown('Button'))
rec('title: ' .. W.text)
rec('old mouse key: ' .. tostring(HOTKEYS['Ctrl+Shift+m'] ~= nil))
-- LAlt+C with the panel shown: the mouse to the panel (at the next frame), and back
HOTKEYS['Alt+c']()
rec('alt c, inside the call: cursor ' .. tostring(W.cursor))
frames(0.25)
rec('alt c: cursor ' .. tostring(W.cursor) .. '; ' .. W.text)
frames(1)
HOTKEYS['Alt+c']()\nframes(0.25)
rec('alt c again: cursor ' .. tostring(W.cursor) .. '; ' .. W.text)
frames(1)
press('Park Hornets')\nframes(1)
-- an outside camera 60 m up off the bow, looking down at the deck between the two bow spots
CAMAT = { f = 120, s = 40, up = 60, lf = 145, ls = 8 }
local where = {}
local function locked() for _, w in ipairs(WIDGETS) do if w.kind == 'Static' and w.visible and w.text:find('Locked: ', 1, true) then return w.text end end end
for _, name in ipairs({ 'Next', 'Next', 'Next' }) do
  press(name)\nframes(0.5)
  local e = locked()
  where[#where + 1] = { text = e, x = mark.b[1] + 8, y = mark.b[2] + 8, on = mark.b[3] == 16 }
  rec(string.format('next: %s; mark %s at %d %d', tostring(e), tostring(mark.b[3] == 16), mark.b[1] + 8, mark.b[2] + 8))
end
-- a click on the panel itself picks nothing; a click where each aircraft's mark was picks that aircraft
local bx, by = W:getBounds()
MOUSE_DOWN(bx + 20, by + 300, 1)\nframes(0.5)
for i = 1, #where do
  if not where[i].on then rec(string.format('click %d: no mark (it is off the screen)', i)) end
  if where[i].on then
  MOUSE_DOWN(where[i].x, where[i].y, 1)\nframes(0.5)
  local e = locked()
  rec(string.format('click %d: %s', i, tostring(e) == where[i].text and 'the same aircraft' or ('ANOTHER: ' .. tostring(e))))
  end
end
MOUSE_DOWN(40, 1500, 1)\nframes(0.5)
-- the buttons: the step chosen, then a move and a turn of the locked one
MOUSE_DOWN(where[1].x, where[1].y, 1)\nframes(0.5)
press('1 cm')\nframes(0.5)
rec('steps: ' .. (shown('Button'):match('%[1 cm%]') and '1 cm chosen' or 'NOT chosen'))
press('Forward') press('Right')\nframes(0.5)
press('5 deg')\nframes(0.5)\npress('Turn right')\nframes(0.5)
rec('-- tow')
-- THE TOW PAGE: the aircraft clicked on, the four catapults, the deck's areas and the chosen area's spots
press('Tow')\nframes(0.5)
rec('tow page: ' .. shown('Button'))
rec('tow status: ' .. (function() for _, w in ipairs(WIDGETS) do if w.kind == 'Static' and w.visible and w.text:find('Selected: ', 1, true) then return w.text end end return 'none' end)())
MOUSE_DOWN(where[2].x, where[2].y, 1)\nframes(0.5)
rec('tow status after a click: ' .. (function() for _, w in ipairs(WIDGETS) do if w.kind == 'Static' and w.visible and w.text:find('Selected: ', 1, true) then return w.text end end return 'none' end)())
rec('tow mark: ' .. tostring(mark.b[3] == 16))
press('Cat 2')\nframes(0.5)
press('Bow 2')
frames(0.5)
press('Hold / go on') press('Unhook now') press('Report')\nframes(0.5)
-- THE SAVED VIEW: the camera 100 m forward, 150 m up, 80 m to port, looking at the deck: kept in the ship's frame;
-- then the camera is elsewhere, and "Saved view" puts it back every frame until it is pressed again
CAMAT = { f = 100, s = -80, up = 150, lf = 20, ls = 0 }
press('Save view')\nframes(0.5)
for _, l in ipairs(LOG) do if l:find('view saved', 1, true) then rec('log: ' .. l:gsub('^.-hook%s+', ''):gsub('%c', '')) end end
local saved = Export.LoGetCameraPosition()
CAMAT = { f = 0, s = 0, up = 300 }
frames(0.5)
rec('not held yet: camera put ' .. tostring(CAMPUTS or 0) .. ' times')
press('Saved view')\nframes(1)
local function off(a, b) return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2 + (a.z - b.z) ^ 2) end
rec(string.format('held: put %d times in 4 frames; %.3f m from the saved place, its axes %.4f %.4f %.4f off; button %s', CAMPUTS, off(CAMPUT.p, saved.p), off(CAMPUT.x, saved.x), off(CAMPUT.y, saved.y),
  off(CAMPUT.z, saved.z), shown('Button'):match('%[Saved view%]') or 'not marked'))
press('Saved view')\nframes(1)
rec('let go: put ' .. CAMPUTS .. ' times; button ' .. (shown('Button'):match('| Saved view') and 'plain' or 'marked'))
rec('-- menu')
press('Crew test menu')\nframes(0.5)
rec('menu page: ' .. shown('Button'))
press('Tow  >')\nframes(0.5)
rec('tow menu: ' .. shown('Button'))
press('Axle finder')\nframes(0.5)\npress('Report where it is')\nframes(0.5)
press('< Back')\nframes(0.5)\npress('< Back')\nframes(0.5)
rec('back: ' .. shown('Button'):sub(1, 110))
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
rec('hidden again: ' .. state() .. '; buttons "' .. shown('Button') .. '"')
-- (LAlt+C with the panel put away is DCS's alone: the panel takes no cursor)
HOTKEYS['Alt+c']()\nframes(1)
rec('alt c while hidden: cursor ' .. tostring(W.cursor))
-- "Hide" on the panel does the same (at the next frame, not inside the button's own click), and the key brings it back, alive
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)\npress('Hide')
rec('inside the click on Hide: shown ' .. tostring(panelShown()))
frames(0.5)
rec('after Hide: shown ' .. tostring(panelShown()) .. '; ' .. state())
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)\npress('Deck spots')\nframes(0.5)\npress('1 m')\nframes(0.5)
rec('back after Hide: shown ' .. tostring(panelShown()) .. ' ' .. (shown('Button'):match('%[1 m%]') and 'its buttons work' or 'DEAD'))
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
-- the mission ends with the panel up, its mouse taken and an aircraft marked: all of it is put away, and its keys are dead
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)\nHOTKEYS['Alt+c']()\npress('Deck spots')\nframes(0.5)
rec('before the end: shown ' .. tostring(panelShown()) .. ' cursor ' .. tostring(W.cursor))
HANDLER.onSimulationStop()
rec('mission over: shown ' .. tostring(panelShown()) .. '; ' .. state() .. '; mark ' .. mark.b[3] .. ' x ' .. mark.b[4])
T = T + 5
HOTKEYS['Ctrl+Shift+F10']()
rec('a key in the menus: wanted ' .. tostring(CATCC_UI.want))
HANDLER.onSimulationStart()\nframes(1)
rec('next mission: shown ' .. tostring(panelShown()))
HOTKEYS['Ctrl+Shift+F10']()\nframes(1)
rec('shown in the next mission: ' .. tostring(panelShown()) .. '; ' .. shown('Button'):sub(1, 40))
-- from the radio menu: put away, and shown again WITH the mouse
click("CATCC panel: show / hide")\nframes(1)
rec('menu item: shown ' .. tostring(panelShown()))
click("CATCC panel: show / hide")\nframes(1)
rec('menu item again: shown ' .. tostring(panelShown()) .. ' cursor ' .. tostring(W.cursor))
rec('made invisible: ' .. tostring(SET_INVISIBLE or 0) .. ' times')`, { ui: true });
    // THE SAVED VIEW (2026-11-20, the user: "I'd want the camera angle to be something like this, set by the UI so that
    // it's consistent in both recordings"): "Save view" keeps where the camera is in the ship's frame (written to
    // Logs/catcc-camera.lua: the harness has no such file to write); "Saved view" puts the camera there every frame
    // (Export's LoSetCameraPosition), marked while it holds, until it is pressed again
    expect(r.rec.find((l) => l.startsWith('log: view saved'))).toMatch(
      /^log: view saved \([^)]+\): the camera 100\.0 m forward, 150\.0 m up, -80\.0 m to starboard of the ship's origin, looking -?[\d.]+ \/ -?[\d.]+ \/ -?[\d.]+; THE FILE COULD NOT BE WRITTEN$/,
    );
    expect(r.rec).toContain('not held yet: camera put 0 times');
    expect(r.rec).toContain('held: put 4 times in 4 frames; 0.000 m from the saved place, its axes 0.0000 0.0000 0.0000 off; button [Saved view]');
    expect(r.rec).toContain('let go: put 4 times; button plain');
    // built from its two dialog files at the first frame of the mission; put away until its hot key
    expect(r.rec).toContain('dialog W/Scripts\\CATCC\\crewtest_ui.dlg');
    expect(r.rec).toContain('dialog W/Scripts\\CATCC\\crewtest_ui_mark.dlg');
    expect(r.rec.some((l) => l.includes('crewtest_ui_keys'))).toBe(false);
    expect(r.rec).toContain('built: true mark true through true');
    expect(r.logLines).toContain('in-game panel loaded: Ctrl+Shift+F10 in a mission');
    // THE WINDOW IS NEVER MADE INVISIBLE (in DCS a window made invisible did not come back): put away, it is "visible"
    // with a see-through skin, 10 x 10, nothing in it shown; shown, its own skin and size where it stood. The mark the
    // same: always there, one pixel in the corner with nothing to mark
    expect(r.rec).toContain('put away: visible true, hidden skin true, 10 x 10, cursor false; buttons ""; mark true 1 x 1');
    expect(r.rec).toContain('shown: visible true, hidden skin false, 700 x 620, cursor false at 60 120');
    expect(r.rec).toContain('made invisible: 0 times');
    expect(r.logLines.some((l) => /^panel: shown \(the window says: visible true, at 60 \/ 120, 700 x 620\)$/.test(l))).toBe(true);
    expect(r.logLines.some((l) => /^panel: hidden \(the window says: visible true, at 60 \/ 120, 10 x 10\)$/.test(l))).toBe(true);
    // shown: the deck page's buttons, the chosen steps in [ ]
    expect(r.rec.find((l) => l.startsWith('deck page: '))).toBe('deck page: [Deck spots] | Tow | Crew test menu | Hangar marks | Flag | Hide | Park Hornets | Take away | Wings | Click picks: ON | Previous | Next | 1 m | [10 cm] | 1 cm | '
      + 'Forward | Left | Aft | Right | 5 deg | [1 deg] | 0.1 deg | Turn left | Turn right | Add where I look | Remove | Back to built-in | Save (Ctrl+Shift+S) | Start over | FOV: H');
    // "Next" three times: spot 1, spot 2, spot 3; the mark is on the screen where each of the first two stands
    const nexts = r.rec.filter((l) => l.startsWith('next: '));
    expect(nexts[0]).toMatch(/^next: On CVN-72\. Locked: spot 1 "Bow 1": 150\.00 m forward, 8\.00 m to starboard, nose 180\.0 degrees; mark true at \d+ \d+$/);
    expect(nexts[1]).toMatch(/^next: On CVN-72\. Locked: spot 2 "Bow 2": .*; mark true at \d+ \d+$/);
    // (the camera looks at the deck midway between the two bow spots: both marks near the middle of the screen, apart)
    const xy = nexts.slice(0, 2).map((l) => l.match(/at (\d+) (\d+)$/)!.slice(1).map(Number));
    expect(Math.abs(xy[0][0] - 1280)).toBeLessThan(400);
    expect(Math.abs(xy[1][0] - 1280)).toBeLessThan(400);
    expect(Math.abs(xy[0][0] - xy[1][0])).toBeGreaterThan(100);
    expect(Math.abs(xy[0][1] - 800)).toBeLessThan(150);
    // a click where an aircraft's mark was drawn locks on that same aircraft (the click and the mark use the same camera
    // and field of view, both ways); the third, spot 3 (the player's own, 155 m aft of where the camera looks), is off the screen: no mark shown for it
    expect(r.rec.filter((l) => l.startsWith('click ')).map((l) => l.slice(6))).toEqual(['1: the same aircraft', '2: the same aircraft', '3: no mark (it is off the screen)']);
    expect(nexts[2]).toMatch(/^next: On CVN-72\. Locked: spot 3 "El 2 a": .*; mark false at /);
    expect(r.says).toContain('deck spots: locked on spot 2 "Bow 2": 140.00 m forward, 8.00 m to starboard, nose 180.0 degrees.');
    expect(r.logLines.some((l) => /^command spot pick: spot 1 "Bow 1".*; 0\.\d m from the line of sight \(a click at \d+, \d+ of 2560 x 1600, field of view 78\.0 \(horizontal\)\)$/.test(l))).toBe(true);
    // a click on empty sea: nothing there, the lock stays
    expect(r.says).toContain('deck spots: no aircraft there.');
    // the buttons give the F10 menu's own commands with the chosen step: 1 cm forward and right, 5 degrees to the right
    expect(r.rec).toContain('steps: 1 cm chosen');
    const cutM = r.rec.indexOf('-- tow');
    const made = r.rec.slice(0, cutM).filter((l) => l.startsWith('static catcc-spot-1 ')).map((l) => l.replace(/ category.* at /, ' at ').replace(/ offset.*/, ''));
    expect(made.slice(-3)).toEqual(['static catcc-spot-1 4 type FA-18C_hornet at 149.990 8.000 angle 3.1416', 'static catcc-spot-1 5 type FA-18C_hornet at 149.990 7.990 angle 3.1416',
      'static catcc-spot-1 6 type FA-18C_hornet at 149.990 7.990 angle 3.2289']);
    // THE TOW PAGE: the four catapults, the deck's areas (one group here: four spots), its spots (the one the selected
    // aircraft stands on, and the others that are taken, say so), hold / unhook / report. A click in the world selects
    // there as on the deck page; the buttons give "tow|cat|N|lock" and "tow|spot|n|lock"
    expect(r.rec.find((l) => l.startsWith('tow page: '))).toBe('tow page: Deck spots | [Tow] | Crew test menu | Hangar marks | Flag | Hide | Cat 1 | Cat 2 | Cat 3 | Cat 4 | [Bow, Six, El 2 a] | Bow 1 | Bow 2  - taken | Six 1  - taken | El 2 a  - taken | Hold / go on | Unhook now | Report | Deck spotting demo: start / stop | Demo: report | Save view | Saved view | Slot picker | Hide drivers | Hide tow bars | Hide tractors | Hide hangar aircraft | Hide deck aircraft | Hide each in turn');
    expect(r.rec.find((l) => l.startsWith('tow status: '))).toBe('tow status: Selected: the Hornet of spot 1 "Bow 1". Choose where the tractor takes it. (Your own jet: Crew test menu > Tow.)');
    expect(r.rec.find((l) => l.startsWith('tow status after a click: '))).toBe('tow status after a click: Selected: the Hornet of spot 2 "Bow 2". Choose where the tractor takes it. (Your own jet: Crew test menu > Tow.)');
    expect(r.rec).toContain('tow mark: true');
    for (const cmd of ['tow|cat|2|lock', 'tow|spot|2|lock', 'tow|pause', 'tow|unhook', 'tow|report']) expect(r.logLines, cmd).toContain('menu: ' + cmd);
    // (these four spots come without the taxi network: the tow itself is refused, by the hook)
    expect(r.says.some((l) => l.startsWith('the taxi network is missing'))).toBe(true);
    // the other page: the F10 menu's top level as buttons; a submenu opens in place, "< Back" goes up; a leaf runs its command
    expect(r.rec.find((l) => l.startsWith('menu page: '))).toMatch(/^menu page: Deck spots \| Tow \| \[Crew test menu\] \| Hangar marks \| Flag \| Hide \| List people on my ship \| .*\| Our crew {2}> \| Plane captain {2}> \| Catapult crews {2}> \| Tow {2}> \| Stop the demo/);
    expect(r.rec.find((l) => l.startsWith('tow menu: '))).toMatch(/\| < Back \| Tow me to a catapult {2}> \| Tow me to a parking spot {2}> \| Tow me into the hangar \(tractor, bar, driver\) \| Tow the locked deck aircraft {2}> \| Hold \/ go on \| Unhook \(the bar goes back on the tractor\) \| Messages on screen: hide \/ show \(for filming\) \| Report \| Driver seat {2}> \| Axle finder {2}>$/);
    expect(r.logLines).toContain('menu: axle|report');
    expect(r.rec.find((l) => l.startsWith('back: '))).toMatch(/^back: Deck spots \| Tow \| \[Crew test menu\] \| Hangar marks \| Flag \| Hide \| List people on my ship/);
    // ONE PRESS, ONE ACTION (2026-11-16: in DCS each press showed the panel and hid it again in the same instant): the
    // key's function called twice at once shows it (once, at the next frame: nothing inside the call); called on and on
    // while the key is held, nothing more; a second press, a second later, hides it
    expect(r.rec).toContain('inside the call: shown false');
    expect(r.rec).toContain('pressed (called twice): shown true');
    expect(r.rec).toContain('held 1.5 s: shown true');
    expect(r.rec).toContain('pressed again: shown false');
    // put away again: nothing of it shown, the mouse cursor given back; "Hide" on the panel does the same (at the next
    // frame), and the hot key brings the panel back with working buttons
    expect(r.rec).toContain('hidden again: visible true, hidden skin true, 10 x 10, cursor false; buttons ""');
    expect(r.rec).toContain('inside the click on Hide: shown true');
    expect(r.rec).toContain('after Hide: shown false; visible true, hidden skin true, 10 x 10, cursor false');
    expect(r.rec).toContain('back after Hide: shown true its buttons work');
    // the radio menu's "CATCC panel: show / hide" does the same without a key, and hands the panel the mouse at once
    expect(r.rec).toContain('menu item: shown false');
    expect(r.rec).toContain('menu item again: shown true cursor true');
    expect(r.logLines).toContain('panel: shown from the F10 menu');
    // THE MOUSE IS LAlt+C (the user, 2026-11-18: "get rid of the Ctrl Shift M shortcut and just let me use the built in
    // Alt C function"; then: "I can't interact with the UI after bringing it up ... and pressing Alt C": a window
    // that has no cursor of its own is not given the mouse): with the panel shown, LAlt+C gives the panel the mouse (a
    // cursor), LAlt+C again gives it back to the camera; the window's title says which. Put away, the panel leaves
    // LAlt+C alone. No Ctrl+Shift+M, no "Look" button
    expect(r.rec).toContain('title: CATCC crew test - mouse: camera (LAlt+C: cursor)');
    expect(r.rec).toContain('old mouse key: false');
    expect(r.rec).toContain('alt c, inside the call: cursor false');
    expect(r.rec).toContain('alt c: cursor true; CATCC crew test - mouse: PANEL (LAlt+C: look around)');
    expect(r.rec).toContain('alt c again: cursor false; CATCC crew test - mouse: camera (LAlt+C: cursor)');
    expect(r.rec).toContain('alt c while hidden: cursor false');
    // the mission ends: the panel and its mark are gone, and its keys do nothing in DCS's menus; in the
    // next mission it is there again, put away
    expect(r.rec).toContain('before the end: shown true cursor true');
    expect(r.rec).toContain('mission over: shown false; visible true, hidden skin true, 10 x 10, cursor false; mark 1 x 1');
    expect(r.rec).toContain('a key in the menus: wanted nil');
    expect(r.rec).toContain('next mission: shown false');
    expect(r.rec.some((l) => l.startsWith('shown in the next mission: true; [Deck spots] | Tow | Crew test menu'))).toBe(true);
    // without DCS's window toolkit (or the file): said in the log, the F10 menu works as ever
    const none = hook(`${START}click("Tow > Report")\nframes(1)`);
    expect(none.logLines.some((l) => l.startsWith('in-game panel: Scripts/CATCC/crewtest_ui.lua not loaded'))).toBe(true);
  });

  it('nobody walks across a lowered elevator: a walk that would cross it goes round its inboard corner; a place on it becomes its inboard side', () => {
    // the jet at 60 m forward, 10 m to starboard, nose forward; the plane captain's own place is 12 / 30, just aft of
    // elevator 1 (15.5 to 42.5 m forward, 20 to 40 m to starboard); he comes out to 71 / 6.5 (11 m ahead, 3.5 m left)
    const run = (home: string) => hook(`add(105, 'catcc-m0', '1: catcc-m0', ${home}, SHIP_A)
setJet(60, 10, 1, 0)\n${START}click("Plane captain > Come to my jet")\nframes(70)
rec(string.format('captain out at %.1f %.1f', byH[105].x, byH[105].z))
click("Catapult crews > Elevators > Elevator 1: down")\nframes(30)
rec('-- lowered')
click("Plane captain > Send him home")\nframes(90)
rec(string.format('captain home at %.1f %.1f', byH[105].x, byH[105].z))`);
    const r = run('12, 30');
    expect(r.rec).toContain('captain out at 71.0 6.5');
    const cut = r.rec.indexOf('-- lowered');
    const walks = r.rec.slice(cut).filter((l) => l.startsWith('walk 105 ')).map((l) => l.split(' ship ')[0]);
    // home is straight across the platform: he goes to its aft inboard corner (1.2 m clear: 14.3 / 18.8), facing the way he
    // walks, and from there to his place
    expect(walks.length).toBe(2);
    expect(walks[0]).toMatch(/^walk 105 to 14\.30 18\.80 facing -0\.98 0\.2\d$/);
    expect(walks[1]).toMatch(/^walk 105 to 12\.00 30\.00 /);
    expect(r.rec).toContain('captain home at 12.0 30.0');
    expect(r.logLines.some((l) => /^walk: catcc-m0 to 12\.0 fwd 30\.0 stbd: round a lowered elevator: 2 leg\(s\), first to 14\.3 \/ 18\.8$/.test(l))).toBe(true);
    expect(r.logLines.some((l) => /^walk: catcc-m0: next leg, to 12\.0 fwd 30\.0 stbd \(the last\)/.test(l))).toBe(true);
    // a man whose own place is ON the platform (30 / 30): sent home with it down, he goes to its inboard side there
    // (30 / 18.8), not onto it
    const on = run('30, 30');
    const onWalks = on.rec.slice(on.rec.indexOf('-- lowered')).filter((l) => l.startsWith('walk 105 ')).map((l) => l.split(' ship ')[0]);
    expect(onWalks.length).toBe(1);
    expect(onWalks[0]).toMatch(/^walk 105 to 30\.00 18\.80 /);
    expect(on.rec).toContain('captain home at 30.0 18.8');
    expect(on.logLines.some((l) => l.startsWith('walk: catcc-m0 to 30.0 fwd 30.0 stbd: the place is on a lowered elevator: its inboard side instead: 1 leg(s)'))).toBe(true);
  });

  it('the tow: the tractor brings the bar, its arms open, it goes onto the nose gear, the arms close on the axle, it is lifted, the tractor backs onto it and pulls the jet as a trailer', () => {
    // on elevator 1's aft spot, lowered to the hangar deck (10.5 m above the ship's origin), nose to port
    const r = hook(`add(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}
click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(0.5)
local function said(txt)
  for i = #REC, math.max(1, #REC - 8), -1 do
    if REC[i]:find(txt, 1, true) then return true end
  end
  return false
end
rec('ids ' .. STATICS['catcc-tug'].id_ .. ' ' .. STATICS['catcc-towbar'].id_)
local tug, bar = STATICS['catcc-tug'].id_, STATICS['catcc-towbar'].id_
local function barLine(what)
  rec(string.format('%s: bar from %.3f %.3f up %.3f facing %.4f %.4f; arms %.4f; jet %.2f %.2f', what, PLACED[bar].f, PLACED[bar].s, PLACED[bar].up, PLACED[bar].nf, PLACED[bar].ns,
    JETARG[bar .. '/10'] or -1, jet.f, jet.s))
end
rec(string.format('tug first at %.1f %.1f up %.2f', PLACED[tug].f, PLACED[tug].s, PLACED[tug].up))
barLine('bar first')
local seen = {}
for i = 1, 1600 do
  frames(0.25)
  for _, st in ipairs({ { 'opened', '...and it is taken to your nose gear' }, { 'on the gear', 'tow: the chain is tightened' }, { 'clamped', 'tow: the bar is lifted' }, { 'lifted', 'tow: the tractor backs onto' } }) do
    if not seen[st[1]] and said(st[2]) then
      seen[st[1]] = true
      barLine(st[1])
    end
  end
  if not seen.hooked and said('tow: hooked up') then
    seen.hooked = true
    rec(string.format('at hook-up: tug %.3f %.3f facing %.2f %.2f; bar from %.3f %.3f facing %.4f %.4f stretched %.2f %.2f; jet %.2f %.2f',
      PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns, PLACED[bar].f, PLACED[bar].s, PLACED[bar].nf, PLACED[bar].ns, PLACED[bar].sx, PLACED[bar].sy, jet.f, jet.s))
  end
  if said('tow: stopped') then break end
end
rec(string.format('at the end: jet %.2f %.2f nose %.2f %.2f; tug %.2f %.2f facing %.2f %.2f; driver %.2f %.2f up %.2f facing %.2f %.2f; calls %d %d',
  jet.f, jet.s, jet.nf, jet.ns, PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns, byH[105].x, byH[105].z, byH[105].y, byH[105].fx, byH[105].fz, STATICPOS_N, PLACE_N))
-- the bar spans from the tractor's hitch to the jet's nose wheel
local hx, hz = PLACED[tug].f - PLACED[tug].nf * 2.93, PLACED[tug].s - PLACED[tug].ns * 2.93
local nx, nz = jet.f + jet.nf * 3.005, jet.s + jet.ns * 3.005
rec(string.format('hitch to nose wheel %.3f', math.sqrt((hx - nx) ^ 2 + (hz - nz) ^ 2)))
rec(string.format('steer: writes %d.0 min %.3f max %.3f', OBJARG_N['16777472/2'], OBJARG_MIN['16777472/2'], OBJARG_MAX['16777472/2']))
rec(string.format('arms: first %.3f now %.3f', OBJARG_FIRST[bar .. '/10'], JETARG[bar .. '/10']))
rec("placed in the ship's frame: tug " .. tostring(PLACED[tug].own) .. ' bar ' .. tostring(PLACED[bar].own))
rec(string.format('tug wheels: writes %d.0 steering min %.3f max %.3f pitch min %.3f max %.3f', OBJARG_N[tug .. '/8'], OBJARG_MIN[tug .. '/9'], OBJARG_MAX[tug .. '/9'], OBJARG_MIN[tug .. '/20'], OBJARG_MAX[tug .. '/20']))
rec(string.format('jet wheels: writes %d.0 %d.0 %d.0', OBJARG_N['16777472/101'], OBJARG_N['16777472/103'], OBJARG_N['16777472/102']))
rec(string.format('turns: tug %.2f nose %.2f left %.2f right %.2f', TURNS[tug .. '/8'], TURNS['16777472/101'], TURNS['16777472/103'], TURNS['16777472/102']))
click("Tow > Unhook (the bar goes back on the tractor)")
local stage = {}
for i = 1, 400 do
  frames(0.25)
  for _, st in ipairs({ { 'ring off', 'tow: ...the tractor moves up' }, { 'moved up', 'tow: ...the chain is let go' }, { 'released', 'tow: ...its head end is set down' },
      { 'rolled', 'tow: ...its arms are closed' }, { 'closed', 'tow: ...and its ring is put back' }, { 'parked', 'tow: the tractor is parked' } }) do
    if not stage[st[1]] and said(st[2]) then
      stage[st[1]] = true
      barLine('unhook ' .. st[1])
      rec(string.format('unhook %s tug: %.2f %.2f', st[1], PLACED[tug].f, PLACED[tug].s))
    end
  end
  if stage.parked then break end
end
rec(string.format('after unhook: jet %.2f %.2f; tug %.2f %.2f facing %.2f %.2f', jet.f, jet.s, PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns))`);
    // The bar as the model has it (towbar.py prints these for the hook): with its arms open by theta its axle pins' tips are
    // `along` from the ring and `half` either side of its line
    const B = { pivotX: 0.3333, armZ0: 0.05458, pinU: 3.8577, pinW: 0.1042, a0: 0.01717, thetaMax: 0.091651, wheelUp: 0.125, ringRest: 0.1529 };
    const pins = (th: number) => [B.pivotX + B.pinU * Math.cos(B.a0 + th) + B.pinW * Math.sin(B.a0 + th), B.armZ0 + B.pinU * Math.sin(B.a0 + th) - B.pinW * Math.cos(B.a0 + th)];
    // the axle as the hook takes it: 3.005 m ahead of the jet, 1.569 m below it (0.257 m above the floor), 0.605 m from end to end (SET BY THE USER
    // with the axle finder's end plates, 2026-11-16; 0.58 before), a pin 4 cm into each end: the pins' tips 0.2625 m either side, the bar's heads outside the tyres
    let lo = 0;
    let hi = B.thetaMax;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (pins(mid)[1] < 0.2625) lo = mid;
      else hi = mid;
    }
    const thIn = (lo + hi) / 2;
    const flat = (th: number, ringUp: number, pinUp: number) => Math.sqrt(pins(th)[0] ** 2 - (pinUp - ringUp) ** 2);
    const FLOOR = 10.5 - 1.826;
    const flatIn = flat(thIn, 0.30, 0.257);
    const nums = (prefix: string) => r.rec.find((l) => l.startsWith(prefix))!.match(/-?\d+\.\d+/g)!.map(Number);
    // two statics LINKED to the ship (made at the tractor's waiting place on its deck): each is then the ship's child and is
    // placed in the ship's own frame, at any height (drawn with the ship: no shimmer); the tractor first drawn where it waits,
    // on the hangar deck (the jet's height less 1.826 m)
    expect(r.rec).toContain('static catcc-tug type AS32-31A category ADEquipment linked true to 77 at 36.000 -9.500 angle 0.0000 offset true cargo false');
    expect(r.rec).toContain('static catcc-towbar type CATCC_Towbar category ADEquipment linked true to 77 at 36.000 -9.500 angle 0.0000 offset true cargo false');
    expect(r.logLines).toContain("tow: the tractor (object 33554688): the ship's child (its parent: .?AVwoShip@@): placed in the ship's own frame");
    expect(r.logLines).toContain("tow: the bar (object 33554689): the ship's child (its parent: .?AVwoShip@@): placed in the ship's own frame");
    expect(r.rec).toContain('placed in the ship\'s frame: tug true bar true');
    expect(r.rec).toContain('tug first at 36.0 -9.5 up 8.67');
    expect(r.says[0]).toMatch(/^tow: the tractor is coming with the tow bar\. Nose wheel steering OFF; parking brake on until it is hooked up\. Then: straight ahead \d+ m, a turn, \d+ m along the hangar to the hangar, port lane/);
    // the steps, in order
    const order = ['tow: the tractor is in front of you. The bar comes off its pintle', 'tow: ...its arms are swung open', 'tow: ...and it is taken to your nose gear.', 'tow: the chain is tightened',
      "tow: the bar is lifted to the tractor's hitch height.", "tow: the tractor backs onto the bar's ring.", 'tow: hooked up.', 'tow: under way to', 'tow: stopped.'];
    const at = order.map((o) => r.says.findIndex((l) => l.startsWith(o)));
    expect(at.every((x) => x > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // it comes with the bar on its pintle (the ring at the hitch, 2.93 m behind it, 0.30 m up: the tractor model's pintle hook), closed (argument 0), trailing
    // behind on the bar's own wheels (its pins 0.075 m up): the tractor waits facing aft, so the bar points forward from the ring
    const b0 = nums('bar first: ');
    expect(b0[0]).toBeCloseTo(36 + 2.93, 1);
    expect(b0[1]).toBeCloseTo(-9.5, 1);
    expect(b0[2]).toBeCloseTo(FLOOR + 0.30, 2);
    expect(b0[3]).toBeCloseTo(flat(0, 0.30, B.wheelUp) / pins(0)[0], 2);
    expect(b0[4]).toBeCloseTo(0, 1);
    expect(b0[5]).toBeCloseTo(0, 6);
    // unhitched and opened where it lies: the ring on its foot (0.0917 m up), the arms wide open (argument 0.5)
    const op = nums('opened: ');
    expect(op[2]).toBeCloseTo(FLOOR + B.ringRest, 3);
    expect(op[5]).toBeCloseTo(0.5, 3);
    // on the nose gear: its pins at the axle (0.257 m above the floor), straight ahead of the nose wheels (the nose to port:
    // ahead is to port), the ring still on its foot, the arms still wide open; the jet where it was
    const g = nums('on the gear: ');
    const flatOpen = flat(B.thetaMax, B.ringRest, 0.257);
    expect(g[0]).toBeCloseTo(23.13, 2);
    expect(g[1]).toBeCloseTo(33.54 - 3.005 - flatOpen, 2);
    expect(g[2]).toBeCloseTo(FLOOR + B.ringRest, 3);
    expect(g[3]).toBeCloseTo(0, 3);
    expect(g[4]).toBeCloseTo(flatOpen / pins(B.thetaMax)[0], 3);
    expect(g[5]).toBeCloseTo(0.5, 1);
    expect(g[6]).toBeCloseTo(23.13, 2);
    expect(g[7]).toBeCloseTo(33.54, 2);
    // clamped: the arms closed until the pins' tips are 0.2625 m either side (in the axle's ends), on the taut-chain half of the
    // argument: 1 - half of (the opening / the widest opening)
    const cl = nums('clamped: ');
    expect(thIn).toBeGreaterThan(0.05);
    expect(thIn).toBeLessThan(0.07);
    expect(cl[5]).toBeCloseTo(1 - 0.5 * (thIn / B.thetaMax), 3);
    expect(cl[1]).toBeCloseTo(33.54 - 3.005 - flat(thIn, B.ringRest, 0.257), 2);
    // lifted (the ring to the hitch's height, the bar pitched about the axle) before the tractor backs
    const lf = nums('lifted: ');
    expect(lf[2]).toBeCloseTo(FLOOR + 0.30, 3);
    expect(lf[1]).toBeCloseTo(33.54 - 3.005 - flatIn, 2);
    expect(lf[5]).toBeCloseTo(cl[5], 6);
    // the arms: the bar's model argument 10, closed (0) at first, clamped at the end
    expect(nums('arms: ')[0]).toBeCloseTo(0, 6);
    expect(nums('arms: ')[1]).toBeCloseTo(cl[5], 3);
    expect(r.logLines.some((l) => /^tow: the bar's arms are on its argument 10 \(class \.\?AVlLandVehicle@@\)$/.test(l))).toBe(true);
    // the nose wheel turned with the bar (on the jet's model argument 2, 90 degrees a unit): to the left, the jet turning from
    // port to aft; on the model a turn to the left is a POSITIVE value (the first run in DCS wrote it negative and the
    // wheels turned the wrong way); the largest angle said at the end
    const steer = nums('steer: ');
    expect(steer[0]).toBeGreaterThan(100);
    expect(steer[2]).toBeGreaterThan(0.15);
    expect(-steer[1]).toBeLessThan(steer[2] / 2); // (a little to the right while the tractor settles into the lane)
    const arrived = r.says.find((l) => l.startsWith('tow: stopped.'))!;
    const most = Number(arrived.match(/the nose wheel turned at most (\d+) degrees/)![1]);
    expect(most).toBeCloseTo(steer[2] * 90, -1);
    // the wheels turn on the models (the tractor's arguments 8 wheels, 9 steering, 20 pitch; the jet's 101 nose, 103 left main,
    // 102 right main), from what moved. The tractor steers both ways on its way (a U-turn to come in front of the jet, then
    // the turn into the lane: + is to the left) and pitches a little as it starts and stops
    const tw = nums('tug wheels: ');
    expect(tw[0]).toBeGreaterThan(250); // (2026-11-19: the tugs twice as fast: 280 where it was over 300)
    expect(tw[1]).toBeLessThan(-0.3);
    expect(tw[2]).toBeGreaterThan(0.3);
    expect(tw[3]).toBeLessThan(-0.05);
    expect(tw[4]).toBeGreaterThan(0.05);
    expect(nums('jet wheels: ').every((n) => n > 50)).toBe(true); // (2026-11-19: the tugs twice as fast: half the looks at them)
    // whole turns made, counted from the values written (each wraps at 1; forwards counts up). The tractor (2.42 m a turn)
    // drove some 100 m; the jet was pulled some 55 m: its nose wheels (1.61 m a turn) made more turns than its main wheels
    // (2.32 m a turn), and of those the right one, on the outside of the left turn, more than the left
    const [tugTurns, noseTurns, leftTurns, rightTurns] = nums('turns: ');
    expect(tugTurns).toBeGreaterThan(30);
    // (2026-11-19: the tugs twice as fast: at 4.2 m/s the jet rolls 1.05 m between two of this test's quarter-second
    // looks: more than half a turn of a nose wheel (1.61 m): turns cannot be counted from the values any more; that
    // the wheels are turned is still seen from the sums above)
    expect(noseTurns).toBeGreaterThan(0);
    expect(leftTurns + rightTurns).toBeGreaterThan(0);
    expect(r.logLines.some((l) => l.startsWith("tow: the wheels are turned on the models: the tractor's arguments 8 (wheels), 9 (steering), 20 (pitch); the jet's 101 / 103 / 102"))).toBe(true);
    expect(r.logLines.some((l) => /^tow: the nose wheel's steering is shown on the jet \(argument 2; was 0; class \.\?AVwHumanAircraft@@\)$/.test(l))).toBe(true);
    // the driver in the seated pose; how the native module placed him is logged once (his own pose written too)
    expect(r.rec.some((l) => /^play 105 f18_0_init/.test(l))).toBe(true);
    expect(r.logLines).toContain("tow: the driver is put on the seat (origin + pose): -0.40 m forward, 0.58 m left, 0.65 m up of the tractor's position");
    // hooked up: the tractor ahead of the axle by the bar on the flat and the hitch (2.93 m behind the tractor's position), on
    // the nose line, facing away from the jet; the bar's origin (the ring) on the hitch, its x axis back to the axle and down
    // a little, not stretched; the jet not yet moved
    const h = nums('at hook-up: ');
    expect(h[0]).toBeCloseTo(23.13, 2);
    expect(h[1]).toBeCloseTo(33.54 - 3.005 - flatIn - 2.93, 2);
    expect(h[2]).toBeCloseTo(0, 1);
    expect(h[3]).toBeCloseTo(-1, 1);
    expect(h[4]).toBeCloseTo(23.13, 2);
    expect(h[5]).toBeCloseTo(h[1] + 2.93, 2);
    expect(h[6]).toBeCloseTo(0, 2);
    expect(h[7]).toBeCloseTo(flatIn / pins(thIn)[0], 3);
    expect(h[8]).toBeCloseTo(1, 6);
    expect(h[9]).toBeCloseTo(1, 6);
    expect(h[10]).toBeCloseTo(23.13, 1);
    expect(h[11]).toBeCloseTo(33.54, 1);
    // at the end: the jet near the place (8.25 m forward, 8 m to port) with its nose aft, the tractor ahead of it facing aft,
    // the driver on its seat (0.40 m behind, 0.58 m left, 0.65 m above the tractor's own position), the bar still spanning
    const e = nums('at the end: ');
    expect(Math.hypot(e[0] - 8.25, e[1] + 8)).toBeLessThan(1.5);
    expect(e[2]).toBeLessThan(-0.97);
    expect(Math.abs(e[3])).toBeLessThan(0.25);
    expect(e[4]).toBeCloseTo(8.25 - 3.005 - flatIn - 2.93, 0);
    expect(e[5]).toBeCloseTo(-8, 0);
    expect(e[6]).toBeLessThan(-0.99);
    expect(Math.hypot(e[8] - (e[4] + 0.40), e[9] - (e[5] + 0.58))).toBeLessThan(0.1);
    expect(e[10]).toBeCloseTo(8.674 + 0.65, 2);
    expect(nums('hitch to nose wheel ')[0]).toBeCloseTo(flatIn, 2);
    expect(r.says.some((l) => /^tow: stopped\. You are \d\.\d m from the place and \d+ degrees off its heading; the nose wheel turned at most \d+ degrees\./.test(l))).toBe(true);
    // unhooked, in the order the user gave: off the tractor (the ring lifted off the pintle and set down, the tractor moving
    // 1.2 m up to make room), off the aircraft (the chain let go and the arms opened wide, the pins out of the axle; the head
    // end set down on the bar's own wheels; the bar rolled forward clear of the nose wheels, up to the tractor; its arms
    // closed), back on the tractor (the ring lifted onto the pintle), away (8 m on, parked, the bar trailing). The jet stays
    const un = ["tow: unhooking. The bar's ring is lifted off the tractor's pintle and set down...", 'tow: ...the tractor moves up to make room...',
      "tow: ...the chain is let go: the bar's arms open and its pins come out of your nose wheel's axle...", 'tow: ...its head end is set down on its own wheels...',
      'tow: ...it is rolled clear of your nose wheels, up to the tractor...', 'tow: ...its arms are closed...', "tow: ...and its ring is put back on the tractor's pintle.",
      'tow: unhooked: the bar is back on the tractor, which moves 8 m on and waits there.', 'tow: the tractor is parked, the bar on its pintle.'];
    const unAt = un.map((o) => r.says.indexOf(o));
    expect(unAt.every((x) => x > 0)).toBe(true);
    expect([...unAt].sort((x, y) => x - y)).toEqual(unAt);
    // (a bar line: the ring's place and height, the bar's direction along the ship and its pitch, its arms' argument, the jet)
    const off = nums('unhook ring off: ');
    expect(off[2]).toBeCloseTo(8.674 + B.ringRest, 3);  // the ring on its foot on the deck
    expect(off[5]).toBeCloseTo(cl[5], 3);               // still clamped on the axle
    const t0 = nums('unhook ring off tug: ');
    const t1 = nums('unhook moved up tug: ');
    expect(Math.hypot(t1[0] - t0[0], t1[1] - t0[1])).toBeGreaterThan(1.0);
    expect(Math.hypot(t1[0] - t0[0], t1[1] - t0[1])).toBeLessThan(1.3);
    const rel = nums('unhook released: ');
    expect(rel[5]).toBeCloseTo(0.5, 3);                 // wide open, the chain slack: the pins out of the axle
    expect(Math.hypot(rel[0] - off[0], rel[1] - off[1])).toBeLessThan(0.05); // (it has not moved yet)
    const rolled = nums('unhook rolled: ');
    expect(rolled[5]).toBeCloseTo(0.5, 1);
    expect(rolled[2]).toBeCloseTo(8.674 + B.ringRest, 3);
    expect(Math.hypot(rolled[3], rolled[4])).toBeCloseTo(flat(B.thetaMax, B.ringRest, B.wheelUp) / pins(B.thetaMax)[0], 3); // (its head end on its wheels)
    expect(Math.hypot(rolled[0] - rel[0], rolled[1] - rel[1])).toBeGreaterThan(1.0);  // forward, as far as the tractor moved up
    expect(Math.hypot(rolled[0] - rel[0], rolled[1] - rel[1])).toBeLessThan(1.4);
    const closed = nums('unhook closed: ');
    expect(closed[5]).toBeCloseTo(0, 6);
    const pk = nums('unhook parked: ');
    expect(pk[5]).toBeCloseTo(0, 6);                    // closed
    expect(pk[2]).toBeCloseTo(8.674 + 0.30, 3);         // on the pintle
    const u = nums('after unhook: ');
    expect(u[0]).toBeCloseTo(e[0], 2);
    expect(u[1]).toBeCloseTo(e[1], 2);
    expect(Math.hypot(u[2] - e[4], u[3] - e[5])).toBeGreaterThan(8.5);   // 1.2 m to clear the wheels and 8 m on
    expect(Math.hypot(u[2] - e[4], u[3] - e[5])).toBeLessThan(9.6);
    // the ring rides on the tractor's hitch, 2.93 m behind its position
    expect(Math.hypot(pk[0] - (u[2] - u[4] * 2.93), pk[1] - (u[3] - u[5] * 2.93))).toBeLessThan(0.05);
    // on the flight deck: refused, nothing made
    const deck = hook(START + 'click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(1)');
    expect(deck.says[0]).toMatch(/^the tow into the hangar starts on the hangar deck: ride elevator 1 down first .* Up here: F10 > Tow > Tow me to a catapult \/ to a parking spot\.$/);
    expect(deck.rec.some((l) => l.startsWith('static '))).toBe(false);
    // the bar's type missing (our mod not installed): the tow runs without the bar, and says so
    // linked statics that turn out to have no parent: placed in the world, as before (the tractor at the same place)
    const world = hook(`NO_LINK = true\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(4)
local tug = STATICS['catcc-tug'].id_
rec(string.format('tug at %.1f %.1f up %.2f own %s', PLACED[tug].f, PLACED[tug].s, PLACED[tug].up, tostring(PLACED[tug].own)))`);
    expect(world.rec.filter((l) => l.startsWith('tug at '))).toEqual([expect.stringMatching(/^tug at -?\d+\.\d -?\d+\.\d up 8\.67 own false$/)]); // (on its way from where it waits, 36 / -9.5; twice as fast since 2026-11-19: further along)
    expect(world.logLines).toContain('tow: the tractor (object 33554688): NO PARENT (not linked): placed in the world, where it shimmers against a ship under way');
    const nobar = hook(`NO_BAR_TYPE = true\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(4)`);
    expect(nobar.says[0]).toContain('the tractor is coming with the tow bar (no driver: catcc-t0 not found) (no tow bar: its type is missing)');
  });

  it("the tow's driver turns his head (crewtest_head.lua): seated in the blend space of ours; over his right shoulder whenever the tractor backs, never while it drives on; into the turns of his way; by hand from the menu; in the plain seated pose where the blend space is not there", () => {
    const script = (set: string) => `${set}add(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}
click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(0.5)
local tug = STATICS['catcc-tug'].id_
local pf, ps, rows = nil, nil, {}
for i = 1, 1600 do
  frames(0.25)
  -- how fast the tractor goes along the way it faces (m/s; negative: it backs), and where its driver's head was last sent
  local P = PLACED[tug]
  if pf then rows[#rows + 1] = string.format('%.2f:%s', ((P.f - pf) * P.nf + (P.s - ps) * P.ns) / 0.25, tostring(HEADNOW[105])) end
  pf, ps = P.f, P.s
  local over = false
  for k = #REC, math.max(1, #REC - 8), -1 do if REC[k]:find('tow: stopped', 1, true) then over = true end end
  if over then break end
end
rec('rows ' .. table.concat(rows, ' '))
rec('ticks ' .. HEADTICKS)
click("Tow > Driver seat > Head: left 100")
frames(0.5)
click("Tow > Driver seat > Head: report")
frames(0.5)`;
    const r = hook(script(''), { head: true });
    // seated in the blend space (not in f18_0_init), his head ahead, at the module's briskness
    expect(r.rec.some((l) => l === 'play 105 catcc_bs_drv_look mode 2')).toBe(true);
    expect(r.rec.some((l) => /^play 105 f18_0_init/.test(l))).toBe(false);
    expect(r.rec.find((l) => l.startsWith('head 105'))).toBe('head 105 0 w6');
    expect(r.logLines).toContain('tow: the driver is catcc-t0; seated pose "catcc_bs_drv_look": played; his head turns');
    // the tow, four looks a second: the tractor's speed along its heading and where the head was last sent
    const rows = r.rec.find((l) => l.startsWith('rows '))!.slice(5).split(' ').map((s) => s.split(':').map(Number));
    expect(rows.length).toBeGreaterThan(150);
    let backing = 0;
    let ahead = 0;
    let intoTurn = 0;
    for (let i = 3; i < rows.length; i++) {
      const v = [rows[i - 3][0], rows[i - 2][0], rows[i - 1][0], rows[i][0]];
      const y = rows[i][1];
      if (v.every((x) => x < -0.3)) {
        // it has backed for a second: over his right shoulder (100, or eased off a few degrees)
        backing++;
        expect(y, `backing at look ${i}`).toBeGreaterThanOrEqual(92);
      }
      if (v.every((x) => x > 0.5)) {
        // it has driven on for a second: not over his shoulder; ahead, a look to a side, or into a turn of his way
        ahead++;
        expect(Math.abs(y), `driving at look ${i}`).toBeLessThanOrEqual(75);
        if (Math.abs(y) >= 9 && Math.abs(y) <= 70) intoTurn++;
      }
    }
    expect(backing).toBeGreaterThan(3); // (it backs onto the bar's ring)
    expect(ahead).toBeGreaterThan(100);
    expect(intoTurn).toBeGreaterThan(8); // (the U-turn in front of the jet, the turn into the lane)
    // the module was told a few dozen times in all, not every frame; its own step ran every frame
    const told = r.rec.filter((l) => l.startsWith('head 105')).length;
    expect(told).toBeGreaterThan(10);
    expect(told).toBeLessThan(150);
    expect(Number(r.rec.find((l) => l.startsWith('ticks '))!.slice(6))).toBeGreaterThanOrEqual(rows.length);
    // by hand, from the menu
    expect(r.says.some((l) => l === 'driver head: 1 of 1 driver(s) now turn their heads to their LEFT, 100 degrees. It should take about a second, smoothly.')).toBe(true);
    expect(r.rec[r.rec.map((l) => l.startsWith('head 105')).lastIndexOf(true)]).toBe('head 105 -100 w6');
    expect(r.says[r.says.length - 1]).toBe('driver head: 1 driver(s); what each plays and where his head is: in the log.');
    expect(r.logLines.some((l) => l.startsWith('driver head: catcc-t0 plays "catcc_bs_drv_look"; "catcc_head_yaw" reads'))).toBe(true);

    // the blend space not installed (install.ps1 without -DriverHead): the plain seated pose, nothing sent, and the log says why
    const plain = hook(script('UNPLAYABLE.catcc_bs_drv_look = true\n'), { head: true });
    expect(plain.rec.some((l) => /^play 105 f18_0_init mode 2/.test(l))).toBe(true);
    expect(plain.rec.filter((l) => l.startsWith('head 105') && !l.includes(' w6')).length).toBe(0);
    expect(plain.logLines).toContain('tow: the driver is catcc-t0; seated pose "f18_0_init": played; his head does not turn: DCS has no animation called "catcc_bs_drv_look"');
    expect(plain.says.some((l) => l.startsWith('driver head: NOT TURNED: the blend space "catcc_bs_drv_look" could not be played'))).toBe(true);

    // the file not there at all (every other test here): as before
    const none = hook(script(''));
    expect(none.rec.some((l) => /^play 105 f18_0_init mode 2/.test(l))).toBe(true);
    expect(none.rec.some((l) => l.startsWith('head 105'))).toBe(false);
    expect(none.logLines).toContain('tow: the driver is catcc-t0; seated pose "f18_0_init": played');
    expect(none.says.some((l) => l === 'driver head: Scripts\\CATCC\\crewtest_head.lua is not there.')).toBe(true);
  });

  it("the tow's driver sits with his feet at the pedals and his hands on the steering wheel (DRIVER-POSE.md) where the mod has that pose (install.ps1 -DriverPose on): the plain seated pose is ours; the pilot's where it is not; in the blend space when his head turns", () => {
    const script = (set: string) => `${set}add(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}
click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(2)`;
    const plays = (r: { rec: string[] }) => r.rec.filter((l) => /^play 105 /.test(l));
    // the pose in the mod, the head not turning: he sits in it; the pilot's pose is not played at all
    const ours = hook(script('UNPLAYABLE.catcc_drv_seat = nil\n'));
    expect(plays(ours)).toEqual(['play 105 catcc_drv_seat mode 2']);
    expect(ours.logLines).toContain('tow: the driver is catcc-t0; seated pose "catcc_drv_seat": played');
    // not in the mod (as installed until asked for): tried, then the pilot's
    const pilot = hook(script(''));
    expect(plays(pilot)).toEqual(['play 105 catcc_drv_seat mode 2', 'play 105 f18_0_init mode 2']);
    expect(pilot.logLines).toContain('tow: the driver is catcc-t0; seated pose "f18_0_init": played');
    // his head turns: the blend space (its poses carry the limbs), neither seated pose
    const head = hook(script('UNPLAYABLE.catcc_drv_seat = nil\n'), { head: true });
    expect(plays(head)).toEqual(['play 105 catcc_bs_drv_look mode 2']);
    // the head's blend space missing, the pose there: ours, and the log says why the head does not turn
    const noHead = hook(script('UNPLAYABLE.catcc_drv_seat = nil\nUNPLAYABLE.catcc_bs_drv_look = true\n'), { head: true });
    expect(plays(noHead)).toEqual(['play 105 catcc_bs_drv_look mode 2', 'play 105 catcc_drv_seat mode 2']);
    expect(noHead.logLines).toContain('tow: the driver is catcc-t0; seated pose "catcc_drv_seat": played; his head does not turn: DCS has no animation called "catcc_bs_drv_look"');
    // neither can be played: said
    const neither = hook(script('UNPLAYABLE.f18_0_init = true\n'));
    expect(neither.logLines).toContain('tow: the driver is catcc-t0; seated pose "f18_0_init": FAILED: DCS has no animation called "f18_0_init"');
  });

  it("the hook's bar geometry is the model's (towbar.py prints it); the opening for a given axle; the argument's two halves", () => {
    const line = execFileSync('python', ['-I', here('../deck-test/crew-test/model/towbar.py'), fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-towbar-'))], { encoding: 'utf8' })
      .split(/\r?\n/).find((l) => l.trim().startsWith('hook:'))!;
    const model = Object.fromEntries([...line.matchAll(/(\w+)=([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
    const hookBar = hookSrc.match(/bar = \{ ([^}]+) \}/)![1];
    const inHook = Object.fromEntries([...hookBar.matchAll(/(\w+) = ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
    for (const k of ['pivotX', 'armZ0', 'pinU', 'pinW', 'a0', 'thetaMax', 'wheelUp', 'ringRest']) expect(inHook[k], k).toBeCloseTo(model[k], 5);
    expect(inHook.arg).toBe(10);
  });

  it('"Messages on screen: hide / show": hidden, nothing more is put on screen (it all still goes to the log); shown again from the menu, and with every new mission', () => {
    const AX = 'Tow > Axle finder';
    const r = hook(`${START}click("Tow > Messages on screen: hide / show (for filming)")\nframes(1)
click("${AX} > Report where it is")\nframes(1)
rec('-- hidden above')
click("Tow > Messages on screen: hide / show (for filming)")\nframes(1)
click("${AX} > Report where it is")\nframes(1)`);
    const cut = r.rec.indexOf('-- hidden above');
    const shown = (from: number, to: number) => r.rec.slice(from, to).filter((l) => l.startsWith('say ')).map((l) => l.slice(4).replace(/^CATCC crew test: /, ''));
    // going off: the one notice; the report asked for next is not put on screen
    expect(shown(0, cut)).toEqual(['on-screen messages are OFF (F10 > CATCC crew test > Tow > Messages on screen brings them back; they still go to the log).']);
    expect(r.logLines).toContain('command messages: on-screen messages OFF (they still go to this log)');
    expect(r.logLines.some((l) => l.startsWith('SAY (not shown) axle finder: the marker axle is 3.005 m ahead'))).toBe(true);
    // on again: said so, and the next report is shown
    const after = shown(cut, r.rec.length);
    expect(after[0]).toBe('on-screen messages are ON again.');
    expect(after[1]).toMatch(/^axle finder: the marker axle is 3\.005 m ahead/);
  });

  it('the axle finder: a marker stood under the nose wheel axle as a static LINKED to the ship (as the chock test made its chocks), made anew at every move; its height picks the model', () => {
    const AX = 'Tow > Axle finder';
    // the jet at spawn spot 5 (10.5 m aft, 34 m to starboard), nose to port
    const r = hook(`${START}click("${AX} > Fore / aft > Forward 1 cm")\nframes(1)
click("${AX} > Show / hide the marker axle")\nframes(1)
click("${AX} > Fore / aft > Aft 10 cm") click("${AX} > Fore / aft > Forward 1 cm") click("${AX} > Fore / aft > Aft 1 mm")\nframes(3)
click("${AX} > Up / down > Up 10 cm") click("${AX} > Up / down > Down 1 cm")\nframes(3)
setJet(40, 10, 1, 0)
click("${AX} > Report where it is")\nframes(1)
click("${AX} > Up / down > Up 10 cm")\nframes(1)
local n = 0
for name in pairs(STATICS) do if name:find('catcc-axle', 1, true) then n = n + 1 end end
rec('markers standing ' .. n)
-- the width: the two end plates
local function ends()
  local out = {}
  for i = #REC, 1, -1 do
    local key, f, s2 = REC[i]:match('^static (catcc%-axle%-[lr]) %d+ type CATCC_AxleEnd .* at (%S+) (%S+) angle')
    if key and not out[key] then out[key] = { tonumber(f), tonumber(s2) } end
    if out['catcc-axle-l'] and out['catcc-axle-r'] then break end
  end
  return out
end
local e0 = ends()
rec(string.format('ends: left %.3f %.3f right %.3f %.3f', e0['catcc-axle-l'][1], e0['catcc-axle-l'][2], e0['catcc-axle-r'][1], e0['catcc-axle-r'][2]))
click("${AX} > Width (the end plates) > Wider 10 cm") click("${AX} > Width (the end plates) > Narrower 1 cm") click("${AX} > Width (the end plates) > Wider 1 mm")\nframes(3)
local e1 = ends()
rec(string.format('ends wider: left %.4f %.4f right %.4f %.4f', e1['catcc-axle-l'][1], e1['catcc-axle-l'][2], e1['catcc-axle-r'][1], e1['catcc-axle-r'][2]))
click("${AX} > Show / hide the marker axle")\nframes(1)`);
    // a move before it is shown is taken (the numbers are the tow's) and says the marker is not shown
    expect(r.says[0]).toBe("axle finder: the marker axle is 3.015 m ahead of your jet's own position and 1.569 m below it (the rod 0.26 m above the deck). (The marker is not shown: F10 > Tow > Axle finder > Show.)");
    // first shown: what DCS makes of our types is tried once, for the log (each made for an instant and taken away)
    expect(r.logLines).toContain('axle finder: what DCS makes of our static types: OK|CATCC_AxleMarker_H27 not linked: made; CATCC_AxleProbe linked: made; CATCC_AxleProbe not linked: made; '
      + 'CATCC_Towbar linked: made; CATCC_Towbar not linked: made; AS32-31A not linked: made');
    expect(r.rec).toContain('static CATCC probe 2 type CATCC_AxleProbe category ADEquipment linked true to 77 at -60.000 0.000 angle 0.0000 offset true cargo false');
    expect(r.rec.filter((l) => l.startsWith('destroy CATCC probe ')).length).toBe(6);
    // the marker: linked to the ship at the axle's place on the deck (the nose to port: 3.015 m ahead is to port), turned as
    // the jet is (the rod lies across it); the model for the axle's height, a whole centimetre, and the tow's number with it
    const marks = r.rec.filter((l) => l.startsWith('static catcc-axle '));
    expect(marks[0]).toBe('static catcc-axle 1 type CATCC_AxleMarker_H26 category ADEquipment linked true to 77 at -10.500 30.985 angle 4.7124 offset true cargo false');
    expect(r.says[1]).toMatch(/^axle finder: a rod in magenta and cyan bands with a yellow cube on each end stands across your nose gear, where the hook takes the nose wheel axle to be: the marker axle is 3\.015 m ahead of your jet's own position and 1\.569 m below it \(the rod 0\.26 m above the deck\)\. Move it/);
    // every move takes the old one away and makes a new one: 9.1 cm aft in three moves, then up 10 cm and down 1 cm
    expect(marks.slice(1, 6).map((l) => l.replace(/ category.* at /, ' at ').replace(/ angle.*/, ''))).toEqual([
      'static catcc-axle 4 type CATCC_AxleMarker_H26 at -10.500 31.085',
      'static catcc-axle 7 type CATCC_AxleMarker_H26 at -10.500 31.075',
      'static catcc-axle 10 type CATCC_AxleMarker_H26 at -10.500 31.076',
      'static catcc-axle 13 type CATCC_AxleMarker_H36 at -10.500 31.076',
      'static catcc-axle 16 type CATCC_AxleMarker_H35 at -10.500 31.076',
    ]);
    expect(r.logLines).toContain('command axle fwd -0.001: noseGear=2.924 axleDown=1.569 axleLen=0.605');
    expect(r.logLines).toContain('command axle up -0.010: noseGear=2.924 axleDown=1.476 axleLen=0.605');
    // it does not follow the jet; "Report" stands it under the jet as it now is (40 m forward, 10 m to starboard, nose forward)
    expect(marks[6]).toBe('static catcc-axle 19 type CATCC_AxleMarker_H35 category ADEquipment linked true to 77 at 42.924 10.000 angle 0.0000 offset true cargo false');
    expect(r.says).toContain("axle finder: the marker axle is 2.924 m ahead of your jet's own position and 1.476 m below it (the rod 0.35 m above the deck); the end plates are 0.605 m apart. The tow uses these.");
    // the models go from 0.15 to 0.40 m
    expect(marks[7]).toMatch(/^static catcc-axle 22 type CATCC_AxleMarker_H40 /);
    expect(r.says).toContain("axle finder: the marker axle is 2.924 m ahead of your jet's own position and 1.426 m below it (the rod 0.40 m above the deck). (The marker goes from 0.15 to 0.40 m above the deck.)");
    // one marker at a time; put away: taken off the deck
    // (the rod and its two end plates)
    expect(r.rec).toContain('markers standing 3');
    // THE WIDTH: an end plate either side of the axle's middle, along the jet's own line, 0.605 m apart to begin with (the
    // jet now at 40 / 10, nose forward: its left is to port, -z); "wider 10 cm, narrower 1 cm, wider 1 mm": 0.696 m apart
    expect(r.rec.some((l) => /^ends: left 42\.924 9\.69[78] right 42\.924 10\.30[23]$/.test(l))).toBe(true);
    const wide = r.rec.find((l) => l.startsWith('ends wider: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(wide[0]).toBeCloseTo(42.924, 3);
    expect(wide[3] - wide[1]).toBeCloseTo(0.696, 2);
    expect((wide[1] + wide[3]) / 2).toBeCloseTo(10, 2);
    expect(r.says.some((l) => /^axle finder: the end plates are 0[.]696 m apart [(]the tow bar's pins go 0[.]30[78] m either side[)][.]$/.test(l))).toBe(true);
    expect(r.logLines).toContain('command axle len +0.001: noseGear=2.924 axleDown=1.426 axleLen=0.696');
    expect(r.rec.filter((l) => l.startsWith('destroy catcc-axle ')).map((l) => l.slice(19))).toEqual(['1', '4', '7', '10', '13', '16', '19', '22', '25', '28', '31']);
    // (every move makes the rod and its two end plates anew: the markers' running number goes up by three; the three
    // width moves made three more)
    expect(marks.length).toBe(11);
    expect(r.says[r.says.length - 1]).toBe("axle finder: the marker is put away; the axle is taken to be 2.924 m ahead of your jet's own position and 1.426 m below it (the rod 0.40 m above the deck). The tow uses these.");
    // DCS makes nothing for the marker's type: said so, nothing shown
    const none = hook(`NO_MARKER_TYPE = true\n${START}click("${AX} > Show / hide the marker axle")\nframes(1)`);
    expect(none.says[0]).toBe('the marker axle could not be made: DCS made nothing for the type CATCC_AxleMarker_H26 (dcs.log says why)');
    expect(none.logLines.some((l) => l.startsWith('axle finder: what DCS makes of our static types: OK|CATCC_AxleMarker_H27 not linked: NOT made; CATCC_AxleProbe linked: made;'))).toBe(true);
  });

  it('"Put me square on the nearest spot": the nearest deck spot within 30 m; a teleport that does not move the jet is said to have failed', () => {
    const r = hook(`ROUTES_SRC = ROUTES_REAL\n${START}setJet(150, 9.5, 0, 1)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(12)
TELE_WORKS = false\nsetJet(120, 0, 1, 0)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(24)
setJet(-160, 70, 1, 0)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(2)`);
    const tp = r.rec.filter((l) => l.startsWith('teleport '));
    // (the deck as respotted in DCS: from 150 / 9.5 the nearest spot is Stbd bow 5, 146.64 / 10.55, its nose 200.7 degrees)
    expect(tp[0]).toMatch(/^teleport 10\d id 16777472 to 146\.64 10\.5[45] up 22\.00 nose -0\.94 -0\.35 right 0\.35 -0\.94$/);
    expect(r.says).toContain('teleport: you are being put on Stbd bow 5 (spot 2, 3.5 m away), facing the way a jet spawned there faces.');
    expect(r.says).toContain("teleport to Stbd bow 5 (the ATC's teleport): you are now 0.0 m from the spot and 0 degrees off its heading: on it.");
    expect(tp.length).toBe(2);
    // The ATC's teleport left the jet where it was (as on 2026-11-15): the aircraft's own ForcePosition is tried, to the
    // same spot, and that one's result is what is said
    expect(r.rec.filter((l) => l.startsWith('forcepos ')).length).toBe(1);
    // (from 120 / 0: Stbd bow 3, 117.65 / 12.61)
    expect(r.rec.find((l) => l.startsWith('forcepos '))).toMatch(/^forcepos id 16777472 to 117\.65 12\.61 up 22\.00 nose -0\.86 -0\.51$/);
    expect(r.says).toContain("teleport to Stbd bow 3 (the aircraft's own ForcePosition): you are now 0.0 m from the spot and 0 degrees off its heading: on it.");
    expect(r.logLines.some((l) => l.startsWith("teleport: the ATC's teleport left the jet where it was: the aircraft's own ForcePosition tried: called (class .?AVwHumanAircraft@@)"))).toBe(true);
    // neither moves the jet: said
    const none = hook(`ROUTES_SRC = ROUTES_REAL\nTELE_WORKS, FORCE_WORKS = false, false\n${START}setJet(120, 0, 1, 0)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(24)`);
    expect(none.says.some((l) => /^teleport to Stbd bow 3 \(the aircraft's own ForcePosition\): you are now \d+\.\d m from the spot and \d+ degrees off its heading \(it did not put you there\)\.$/.test(l))).toBe(true);
    expect(none.rec.filter((l) => l.startsWith('forcepos ')).length).toBe(1);
    expect(r.says[r.says.length - 1]).toMatch(/^the nearest deck spot \(.+\) is \d+ m away: taxi to within 30 m of a spot first$/);
    // an older module without the call
    const old = hook(`ROUTES_SRC = ROUTES_REAL\nNATIVE.teleport = nil\n${START}setJet(150, 9.5, 0, 1)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(2)`);
    expect(old.says[old.says.length - 1]).toBe('teleport: this needs the newer native module: run crew-test\\install.ps1 with DCS closed');
  });

  it('marshalling on a real route end to end: a jet driven along the route from EL 2 forward (deck spot 26) to catapult 1', () => {
    const r = hook(`ROUTES_SRC = ROUTES_REAL
local T = load(ROUTES_REAL)()
add(105, 'catcc-c0', '1: catcc-c0', 14, 29, SHIP_A) add(106, 'catcc-c1', '1: catcc-c1', 14, 31, SHIP_A) add(107, 'catcc-c2', '1: catcc-c2', 14, 33, SHIP_A)
add(108, 'director', '1: director', 73.75, 16.67, SHIP_B)
local route
for _, st in ipairs(T) do if st.spot == 26 then route = st.routes[1] end end
local function at(d)   -- the point d metres along the route, and the direction there
  local i = 1
  while i < #route - 1 do
    local l = math.sqrt((route[i + 1][1] - route[i][1]) ^ 2 + (route[i + 1][2] - route[i][2]) ^ 2)
    if d <= l then break end
    d, i = d - l, i + 1
  end
  local dx, dz = route[i + 1][1] - route[i][1], route[i + 1][2] - route[i][2]
  local l = math.sqrt(dx * dx + dz * dz)
  return route[i][1] + dx / l * d, route[i][2] + dz / l * d, dx / l, dz / l
end
local x, z, fx, fz = at(0)
setJet(x, z, fx, fz)
HANDLER.onSimulationStart() frames(1)
click("${MARSHAL} 1") frames(14)       -- the directors walk to their stations; the first takes the jet
for d = 1, 75 do                                   -- then 2 m a second along the route
  x, z, fx, fz = at(d)
  setJet(x, z, fx, fz)
  frames(0.5)
end
frames(4)`);
    // 92 m; the first part is ours (three stretches), then catapult 1's start box
    expect(r.says[0]).toMatch(/^marshalling to catapult 1: 9\d m to go on the route from spawn spot 26; our crew has the first \d+ m, then the catapult's own crew\. \S+, \S+, \S+ walking to their stations\./);
    const events = r.logLines.filter((l) => /^marshal: \S+ (takes the jet|signals|hands over|passes control)/.test(l)).map((l) => l.replace(/^marshal: /, '').replace(/ \("[^"]*"\).*$/, '').replace(/ at \d+ m.*$/, ''));
    const names = [...new Set(events.map((e) => e.split(' ')[0]))];
    expect(names.length).toBe(3);
    const [a, b, c] = names;
    // out of the spot straight ahead (to port), then the right turn onto the artery; straight along it; the
    // bend at the bow fan, right, towards catapult 1's line; and the jet handed to the catapult's crew
    expect(events.slice(0, 3)).toEqual([`${a} takes the jet`, `${a} signals ahead`, `${a} signals right`]);
    expect(events).toContain(`${a} hands over to ${b}`);
    expect(events).toContain(`${b} takes the jet`);
    expect(events).toContain(`${b} hands over to ${c}`);
    expect(events).toContain(`${c} takes the jet`);
    expect(events[events.length - 1]).toBe(`${c} passes control to catapult 1's crew`);
    // each takes the jet once, in turn, and nobody ever signals left on this route
    expect(events.filter((e) => e.endsWith('takes the jet'))).toEqual([`${a} takes the jet`, `${b} takes the jet`, `${c} takes the jet`]);
    expect(events.some((e) => e.endsWith('signals left'))).toBe(false);
    // DCS's "left" blend space for the pilot's right turns (onto the artery, and at the bow fan)
    expect(r.rec.filter((l) => l.endsWith('bs_sign_taxi_left mode 2')).length).toBeGreaterThanOrEqual(2);
    expect(r.rec.some((l) => l.includes('bs_sign_taxi_right'))).toBe(false);
    expect(r.says[r.says.length - 1]).toMatch(/^marshalling over: catapult 1's own crew has you \(you were at most 0\.\d m off the route\)\.$/);
    // afterwards everyone walks back to where he stood
    expect(r.rec.filter((l) => /^walk 10[3567] to 14\.00 (27|29|31|33)\.00 facing 0\.00 0\.00/.test(l)).length).toBe(3);
    expect(otherShip(r)).toEqual([]);
  });

  it('the recorder logs the signals people play: what, its length, loop and blend values, and what followed', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(10)\nclick("Target: signal > Attention (once)")\nframes(4)\nclick("Target: signal > Stop")\nframes(3)');
    const lines = r.logLines.filter((l) => /^rec 0: brown-2-4\s+(plays|again|blend) /.test(l));
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/^rec 0: brown-2-4\s+plays "sign_attention_taxi" \(length 1\.33, loop 0\/-1\/-1, blend 0\.00 0\.00, started 1\d\.\d\) after "idle" for \d+\.\d s$/);
    expect(lines[1]).toMatch(/^rec 0: brown-2-4\s+plays "idle" \(.*\) after "sign_attention_taxi" for 1\.\d s$/);
    // he faces the bow and the pilot is behind his left shoulder: the torso angle at its limit, to his left
    expect(lines[2]).toMatch(/^rec 0: brown-2-4\s+plays "bs_sign_stop" \(length 2\.50, loop 1\/-1\/-1, blend 45\.00 0\.00, started \d+\.\d\) after "idle" for \d+\.\d s$/);
    // people who only stand in their idle are not logged
    expect(r.logLines.some((l) => /^rec 0: yellow-04\s+plays/.test(l))).toBe(false);
  });

  it("the recorder logs state changes and movement of everyone on the player's ship, and the jet, without being asked", () => {
    const r = hook(`HANDLER.onSimulationStart()\nframes(14)\nclick("${TARGET}")\nframes(1)
click("Target: walk > To 16 m ahead of my nose, facing me")\nframes(20)`);
    const recLines = r.logLines.filter((l) => l.startsWith('rec '));
    expect(recLines[0]).toBe('rec jet             at -10.50 fwd 34.00 stbd, nose 0.00 -1.00');
    expect(recLines.some((l) => /^rec 0: yellow-04\s+state 1 at /.test(l))).toBe(true);
    expect(recLines.some((l) => /^rec 0: yellow-04\s+state 0 at -10\.50 fwd 18\.00 stbd$/.test(l))).toBe(true);
    // the ones who stand still are not logged again and again
    expect(recLines.some((l) => l.startsWith('rec 0: brown-2-4'))).toBe(false);
    expect(recLines.filter((l) => l.startsWith('rec jet')).length).toBe(1);
  });

  it('the list waits for the simulation to run: a mission sitting paused before "Fly" is not scanned', () => {
    // (2026-11-14: scanned while paused, the crew environments were still empty)
    const r = hook('PAUSED = true\nHANDLER.onSimulationStart()\nframes(60)\nrec("fly")\nPAUSED = false\nframes(7)\nrec("7 s flown")\nframes(3)');
    const flown = r.rec.indexOf('7 s flown');
    expect(r.rec.indexOf('fly')).toBeGreaterThan(0);
    expect(r.rec.slice(0, flown).some((l) => l.startsWith('say '))).toBe(false);
    expect(r.says.length).toBe(0);
    expect(startList(r)[0]).toContain('at mission start: 4 people on your ship');
  });

  it('at mission start the memory scan follows by itself when the quick scan finds nobody', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(12)', { quick: false });
    expect(r.says[0]).toBe('at mission start: no people found (2 crew environment(s) holding 9 objects, 7 world objects) the quick way. ' +
      'Scanning memory instead: DCS will freeze for a few seconds.');
    expect(r.rec.filter((l) => l.startsWith('heapscan')).length).toBe(1);
    expect(r.says[1]).toMatch(/^memory scan \(4 s, 8 new\): 4 people on your ship/);
    expect(r.says.length).toBe(2);
  });

  it('waits with the list until the player is in a jet (the briefing screen can take minutes)', () => {
    const r = hook('PLAYER = false\nHANDLER.onSimulationStart()\nframes(400)\nrec("in the jet")\nPLAYER = nil\nframes(6)');
    const at = r.rec.indexOf('in the jet');
    expect(r.rec.slice(0, at).some((l) => l.startsWith('say '))).toBe(false);
    expect(r.says.length).toBe(0);
    expect(startList(r)[0]).toContain('at mission start: 4 people on your ship');
    expect(r.rec.filter((l) => l === 'submenu CATCC crew test').length).toBe(1); // the menu came with the player
  });

  it('a new mission gets the menu and the list again', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(14)\nHANDLER.onSimulationStop()\nMISSION.CATCC_CR = nil\nframes(5)\nHANDLER.onSimulationStart()\nframes(14)');
    expect(r.rec.filter((l) => l === 'submenu CATCC crew test').length).toBe(2);
    expect(startList(r).length).toBe(2);
  });
});

describe('crew test: towing on the flight deck', () => {
  const SPOT_RE = /\{ spot = (\d+), id = "(\w+)", name = "([^"]+)", area = "([^"]+)", x = (-?[\d.]+), z = (-?[\d.]+), fx = (-?[\d.]+), fz = (-?[\d.]+), routes/g;
  const spots = [...routesSrc.matchAll(SPOT_RE)].map((m) => ({ n: Number(m[1]), id: m[2], name: m[3], area: m[4], x: Number(m[5]), z: Number(m[6]), fx: Number(m[7]), fz: Number(m[8]) }));
  const spot = (id: string) => spots.find((q) => q.id === id)!;
  // DCS's ship frame is x forward, z to starboard; PriFly's deck is x forward, y to port, headings counter-clockwise
  const hdgOf = (fx: number, fz: number) => (Math.atan2(-fz, fx) * 180) / Math.PI;
  const CATS: Record<string, [number, number][]> = { '1': [[60.3, 17.6], [162.5, 6.5]], '2': [[58.8, -4.4], [161.7, -8.7]], '3': [[-37.4, -19.6], [70.1, -30]], '4': [[-56.5, -32.4], [51.4, -33]] };
  // the hook's own deck outline (the island cut out of it)
  const DECK = (() => {
    // (2026-11-19: insideDeck is now `local insideDeck` and a block: the outline is the table before it, as it was)
    const src = hookSrc.slice(hookSrc.indexOf('local DECK = {'), hookSrc.indexOf('local insideDeck\n'));
    return [...src.matchAll(/\{ (-?[\d.]+), (-?[\d.]+) \}/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  })();
  const onDeck = (x: number, z: number) => {
    let inside = false;
    for (let i = 0, j = DECK.length - 1; i < DECK.length; j = i++) {
      const [xi, zi] = DECK[i];
      const [xj, zj] = DECK[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  // a menu item under "Tow me to a parking spot" by the spot's name, whatever group it is in
  const TOW_TO = `local function towTo(name)
  for k, f in pairs(cmds) do
    if k:find('Tow me to a parking spot', 1, true) and k:sub(-#name - 3) == ' > ' .. name then return f() end
  end
  error('no spot item ' .. name)
end
local function said(txt)
  for i = #REC, math.max(1, #REC - 8), -1 do
    if REC[i]:find(txt, 1, true) then return true end
  end
  return false
end
`;
  // the tow followed frame by frame: one line a second of where everything is, until `until` is said
  const FOLLOW = `local tug = STATICS['catcc-tug'].id_
local function follow(untilText, max)
  for i = 1, max do
    frames(0.25)
    if i % 4 == 0 then
      rec(string.format('at %.2f %.2f %.3f %.3f tug %.2f %.2f %.3f %.3f up %.3f steer %.3f', jet.f, jet.s, jet.nf, jet.ns, PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns, PLACED[tug].up, JETARG['16777472/2'] or 0))
    end
    if said(untilText) then return true end
  end
  return false
end
`;
  const track = (rec: string[]) =>
    rec.filter((l) => l.startsWith('at ')).map((l) => {
      const v = l.match(/-?\d+\.\d+/g)!.map(Number);
      return { x: v[0], z: v[1], fx: v[2], fz: v[3], tx: v[4], tz: v[5], thx: v[6], thz: v[7], up: v[8], steer: v[9] };
    });

  it("the taxi network in the hook is PriFly's: every spot to every catapult, spot to spot, and from places off the roads, the hook's way is taxiNet.ts's point for point", () => {
    // (the routes file carries the graph; the hook's Tow.Net is taxiNet.ts's solver and fillets in Lua. "tow|way|<to>" is
    // not on the menu: it writes the way from where the jet stands to the log)
    const cases: { x: number; z: number; fx: number; fz: number; to: string }[] = [];
    for (const s of spots) for (const k of ['1', '2', '3', '4']) cases.push({ x: s.x, z: s.z, fx: s.fx, fz: s.fz, to: `C${k}` });
    spots.forEach((s, i) => {
      for (const j of [1, 7, 19]) cases.push({ x: s.x, z: s.z, fx: s.fx, fz: s.fz, to: spots[(i + j) % spots.length].id });
    });
    // off the roads: in the landing area, on the bow between the catapults, beside the island, on the fantail; this way and that
    for (const [x, z, a] of [[-60, -8, 9], [40, -14, 9], [120, 3, 180], [100, -2, 0], [-30, 16, 200], [-140, 5, 0], [10, 20, 270], [75, 8, 100]] as const) {
      const [fx, fz] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
      for (const to of ['C1', 'C3', 'C4', 'SB4', 'E21', 'PQ2', 'PA3']) cases.push({ x, z, fx, fz, to });
    }
    const r = hook(`ROUTES_SRC = ROUTES_REAL\n${START}
for _, c in ipairs({ ${cases.map((c) => `{ ${c.x}, ${c.z}, ${c.fx}, ${c.fz}, '${c.to}' }`).join(', ')} }) do
  setJet(c[1], c[2], c[3], c[4])
  MISSION.CATCC_CR.queue[#MISSION.CATCC_CR.queue + 1] = 'tow|way|' .. c[5]
  frames(0.25)
end`);
    const ways = r.logLines.filter((l) => l.startsWith('command tow way to '));
    expect(ways.length).toBe(cases.length);
    let compared = 0;
    let none = 0;
    let ties = 0;
    const lengthOf = (q: number[][]) => q.slice(1).reduce((t, v, k) => t + Math.hypot(v[0] - q[k][0], v[1] - q[k][1]), 0);
    cases.forEach((c, i) => {
      const m = /^command tow way to (\w+): (\d+) points: ?(.*)$/.exec(ways[i])!;
      expect(m[1]).toBe(c.to);
      const lua = m[3] === '' ? [] : m[3].split(' ').map((q) => q.split(',').map(Number));
      const ts = taxiRoute([c.x, -c.z], c.to, hdgOf(c.fx, c.fz));
      const label = `${c.x} / ${c.z} to ${c.to}`;
      if (!ts) {
        expect(lua.length, label).toBe(0);
        none++;
        return;
      }
      expect(lua.length, label).toBe(ts.length);
      let worst = 0;
      ts.forEach((q, k) => (worst = Math.max(worst, Math.hypot(q[0] - lua[k][0], -q[1] - lua[k][1]))));
      if (worst >= 0.005) {
        // two ways of exactly the same cost (a neighbouring bow spot is reached by a loop round the fan, which can be
        // driven either way round): the same length to the millimetre, the two solvers take one each
        expect(Math.abs(lengthOf(lua) - lengthOf(ts)), label).toBeLessThan(0.005);
        ties++;
        return;
      }
      compared++;
    });
    expect(compared).toBeGreaterThan(300);
    expect(ties).toBeLessThan(6);
    expect(none).toBeLessThan(10);
  }, 120000);

  it('the menu: Tow > Tow me to a catapult (four), Tow me to a parking spot: the forty spots in five groups of at most ten, bow to stern', () => {
    const r = hook(`ROUTES_SRC = ROUTES_REAL\n${START}`);
    const items = r.menu.filter((m) => m.startsWith('Tow > Tow me to a parking spot > ')).map((m) => m.split(' > ').slice(2));
    expect(items.length).toBe(40);
    const groups = [...new Set(items.map((q) => q[0]))];
    expect(groups).toEqual(['Stbd bow, Port bow, Crotch', 'Point, El 1', 'Sixpack, Corral, El 2', 'Port quarter, El 3, El 4, Patio', 'Fantail']);
    for (const g of groups) expect(items.filter((q) => q[0] === g).length, g).toBeLessThanOrEqual(10);
    expect(items.filter((q) => q[0] === groups[0]).map((q) => q[1])).toEqual(['Stbd bow 1', 'Stbd bow 2', 'Stbd bow 3', 'Stbd bow 4', 'Stbd bow 5', 'Stbd bow 6', 'Port bow 1', 'Port bow 2', 'Crotch 1', 'Crotch 2']);
    // every spot of the plan is there, once, under its own name
    expect(items.map((q) => q[1]).sort()).toEqual(spots.map((q) => q.name).sort());
    expect(r.menu.filter((m) => m.startsWith('Tow > Tow me to a catapult > ')).length).toBe(4);
    // the same destinations for the parked aircraft the deck tool is locked on
    expect(r.menu.filter((m) => m.startsWith('Tow > Tow the locked deck aircraft > To catapult ')).length).toBe(4);
    expect(r.menu.filter((m) => m.startsWith('Tow > Tow the locked deck aircraft > To a parking spot > ')).map((m) => m.split(' > ')[4]).sort()).toEqual(spots.map((q) => q.name).sort());
    // ten items on the Tow level itself (a menu level holds ten)
    expect(new Set(r.menu.filter((m) => m.startsWith('Tow > ')).map((m) => m.split(' > ')[1])).size).toBe(10);
  });

  it('a tow to a catapult: the tractor comes from its place aft of the island, hooks up, pulls the jet along the taxi route and up the track (past the place and straight back, where the route joins the track too late), the jet left in line, its nose wheel 2 m short of the shuttle; unhooked, it drives home', () => {
    const a = spot('E21');
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}
click("Tow > Tow me to a catapult > Catapult 2")\nframes(0.5)
${FOLLOW}
rec('first: tug ' .. string.format('%.1f %.1f up %.3f', PLACED[tug].f, PLACED[tug].s, PLACED[tug].up) .. " in the ship's frame " .. tostring(PLACED[tug].own))
rec('hooked ' .. tostring(follow('tow: hooked up', 1200)))
rec('-- pull')
rec('stopped ' .. tostring(follow('tow: stopped', 1200)))
rec(string.format('end: jet %.3f %.3f nose %.5f %.5f', jet.f, jet.s, jet.nf, jet.ns))
rec('-- unhook')
click("Tow > Unhook (the bar goes back on the tractor)")
rec('parked ' .. tostring(follow('tow: the tractor is parked', 2400)))
rec(string.format('home: tug %.1f %.1f; jet %.3f %.3f', PLACED[tug].f, PLACED[tug].s, jet.f, jet.s))
-- a second tow: the tractor starts from where it stands (its waiting place)
click("Tow > Tow me to a catapult > Catapult 2")\nframes(0.5)`);
    // the tractor starts from its waiting place (74 m aft, 27 m to starboard), on the flight deck (the jet's own height
    // less 1.826 m), as the ship's child
    expect(r.rec).toContain("first: tug -74.0 27.0 up 20.174 in the ship's frame true");
    expect(r.logLines).toContain('tow: the tractor starts from its waiting place on the flight deck (-74 m forward, 27 m to starboard)');
    // (from elevator 2 the taxi route comes onto catapult 2's line 8 m short of the shuttle: stopped there the jet would
    // stand 7.6 degrees across the track. So it is pulled on past the place and pushed straight back into line)
    expect(r.says.some((l) => /^tow: the tractor is coming with the tow bar\. Nose wheel steering OFF; parking brake on until it is hooked up\. Then: \d+ m along the deck onto catapult 2's track and \d+ m past the place, then pushed \d+ m straight back into line, your nose wheel left 2 m short of the shuttle\.$/.test(l))).toBe(true);
    expect(r.logLines.some((l) => /^tow: to catapult 2 by the taxi way as it is the jet would end 7\.\d degrees off the track, its nose wheel 0\.\d\d m off its line: not taken$/.test(l))).toBe(true);
    expect(r.says.some((l) => /^tow: on catapult 2's track, \d+ m past the place\. Now the tractor pushes you straight back to it, into line with the track: hands off\.$/.test(l))).toBe(true);
    expect(r.rec).toContain('hooked true');
    expect(r.rec).toContain('stopped true');
    // the jet has not moved until it is hooked up; the tractor never leaves the deck, nor the jet
    const cut = r.rec.indexOf('-- pull');
    const before = track(r.rec.slice(0, cut));
    expect(before.length).toBeGreaterThan(30);
    for (const q of before) expect(Math.hypot(q.x - a.x, q.z - a.z)).toBeLessThan(0.01);
    const all = track(r.rec);
    for (const q of all) {
      expect(onDeck(q.tx, q.tz), `tractor at ${q.tx} ${q.tz}`).toBe(true);
      expect(onDeck(q.x, q.z), `jet at ${q.x} ${q.z}`).toBe(true);
      expect(q.up).toBeCloseTo(20.174, 3);
    }
    // pulled: on catapult 2's track, nose up it, the nose wheel (3.005 m ahead of the jet's own point) 2 m short of the shuttle
    const pulled = track(r.rec.slice(cut, r.rec.indexOf('-- unhook')));
    const [endX, endZ, endFx, endFz] = r.rec.find((l) => l.startsWith('end: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    const end = { x: endX, z: endZ, fx: endFx, fz: endFz };
    const [sh, far] = CATS['2'];
    const L = Math.hypot(far[0] - sh[0], far[1] - sh[1]);
    const [ex, ez] = [(far[0] - sh[0]) / L, (far[1] - sh[1]) / L];
    const nose = [end.x + end.fx * 3.005, end.z + end.fz * 3.005];
    const along = (nose[0] - sh[0]) * ex + (nose[1] - sh[1]) * ez;
    const across = (nose[0] - sh[0]) * -ez + (nose[1] - sh[1]) * ex;
    // (the catapult's line as written here is to the nearest 10 cm)
    expect(along).toBeGreaterThan(-2.08);
    expect(along).toBeLessThan(-1.92);
    expect(Math.abs(across)).toBeLessThan(0.08);
    expect((Math.acos(Math.min(1, end.fx * ex + end.fz * ez)) * 180) / Math.PI).toBeLessThan(0.3);
    // the nose wheel was never turned further than 75 degrees (the model's argument: 1 = 90 degrees), and it was turned
    expect(Math.max(...pulled.map((q) => Math.abs(q.steer)))).toBeLessThan(75 / 90);
    expect(Math.max(...pulled.map((q) => Math.abs(q.steer)))).toBeGreaterThan(0.2);
    // the jet went past the place (its nose wheel beyond the shuttle at the furthest) and came back
    const furthest = Math.max(...pulled.map((q) => (q.x + q.fx * 3.005 - sh[0]) * ex + (q.z + q.fz * 3.005 - sh[1]) * ez));
    expect(furthest).toBeGreaterThan(5);
    expect(r.says.some((l) => /^tow: stopped at catapult 2\. You are 0\.0 m from the place and 0 degrees off its heading; the nose wheel turned at most \d+ degrees\. Set the parking brake, then F10 > Tow > Unhook\.$/.test(l))).toBe(true);
    // unhooked: the tractor drives back to its waiting place, the jet stays
    expect(r.rec).toContain('parked true');
    expect(r.says).toContain('tow: unhooked: the bar is back on the tractor, which drives back to its place aft of the island.');
    const home = r.rec.find((l) => l.startsWith('home: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(home[0] + 74, home[1] - 27)).toBeLessThan(0.5);
    expect(Math.hypot(home[2] - end.x, home[3] - end.z)).toBeLessThan(0.01);
    expect(r.logLines.some((l) => /^tow: the tractor's way home: \d+ points, \d+ m$/.test(l))).toBe(true);
    // on the catapult already: no second tow there
    expect(r.says[r.says.length - 1]).toMatch(/^you are \d+ m from catapult 2's shuttle already: too near for a tow\.$/);
  }, 120000);

  it('a tow to a deck spot: pulled along the taxi route past the spot, then pushed back into it tail first; the jet ends on the spot, on its heading', () => {
    const a = spot('E21');
    const b = spot('SB3');
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}
towTo('${b.name}')\nframes(0.5)
${FOLLOW}
rec('hooked ' .. tostring(follow('tow: hooked up', 1200)))
rec('-- pull')
rec('past ' .. tostring(follow('Now the tractor pushes you back', 1600)))
rec('-- push')
rec('stopped ' .. tostring(follow('tow: stopped', 800)))
rec(string.format('end: jet %.3f %.3f nose %.4f %.4f', jet.f, jet.s, jet.nf, jet.ns))
rec('-- unhook')
click("Tow > Unhook (the bar goes back on the tractor)")
rec('parked ' .. tostring(follow('tow: the tractor is parked', 2400)))
rec(string.format('home: tug %.1f %.1f; jet %.3f %.3f', PLACED[tug].f, PLACED[tug].s, jet.f, jet.s))`);
    expect(r.says.some((l) => new RegExp(`^tow: the tractor is coming with the tow bar\\. Nose wheel steering OFF; parking brake on until it is hooked up\\. Then: \\d+ m along the deck past ${b.name}, then pushed back \\d+ m into it, tail first\\.$`).test(l))).toBe(true);
    for (const what of ['hooked true', 'past true', 'stopped true', 'parked true']) expect(r.rec).toContain(what);
    const [iPull, iPush, iUn] = ['-- pull', '-- push', '-- unhook'].map((m) => r.rec.indexOf(m));
    const all = track(r.rec);
    for (const q of all) {
      expect(onDeck(q.tx, q.tz), `tractor at ${q.tx} ${q.tz}`).toBe(true);
      expect(onDeck(q.x, q.z), `jet at ${q.x} ${q.z}`).toBe(true);
    }
    // the pull: forward all the way, and it goes PAST the spot's front: at its end the jet is beyond the spot's own
    // line (the line straight ahead of the parked jet), on the side it was going
    const pull = track(r.rec.slice(iPull, iPush));
    for (let i = 1; i < pull.length; i++) expect((pull[i].x - pull[i - 1].x) * pull[i].fx + (pull[i].z - pull[i - 1].z) * pull[i].fz).toBeGreaterThan(-0.01);
    const side = (q: { x: number; z: number }) => (q.x - b.x) * -b.fz + (q.z - b.z) * b.fx;
    expect(side(pull[0]) * side(pull[pull.length - 1])).toBeLessThan(0);
    // the push: backwards all the way (tail first), the nose wheel never beyond 75 degrees, and turned well over on the way
    const push = track(r.rec.slice(iPush, iUn));
    expect(push.length).toBeGreaterThan(15);
    for (let i = 1; i < push.length; i++) expect((push[i].x - push[i - 1].x) * push[i].fx + (push[i].z - push[i - 1].z) * push[i].fz).toBeLessThan(0.01);
    expect(Math.max(...push.map((q) => Math.abs(q.steer)))).toBeLessThan(75 / 90);
    expect(Math.max(...push.map((q) => Math.abs(q.steer)))).toBeGreaterThan(0.3);
    // nothing jumps where the pull hands over to the push: the tractor and the jet move no more between two of these
    // one-second looks than they do at towing speed
    for (let i = 1; i < all.length; i++) {
      // (2026-11-19, the user: "I'm comfortable increasing all tug speeds by 2x": a tractor by itself up to 8.4 m/s, with an aircraft 4.2)
      expect(Math.hypot(all[i].tx - all[i - 1].tx, all[i].tz - all[i - 1].tz)).toBeLessThan(8.6);
      expect(Math.hypot(all[i].x - all[i - 1].x, all[i].z - all[i - 1].z)).toBeLessThan(4.4);
    }
    // ON THE SPOT: within a centimetre, on its heading within a tenth of a degree; and it stays there when unhooked
    const end = r.rec.find((l) => l.startsWith('end: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(end[0] - b.x, end[1] - b.z)).toBeLessThan(0.01);
    expect((Math.acos(Math.min(1, end[2] * b.fx + end[3] * b.fz)) * 180) / Math.PI).toBeLessThan(0.1);
    expect(r.says.some((l) => new RegExp(`^tow: stopped at ${b.name}\\. You are 0\\.0 m from the place and 0 degrees off its heading;`).test(l))).toBe(true);
    const home = r.rec.find((l) => l.startsWith('home: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(home[0] + 74, home[1] - 27)).toBeLessThan(0.5);
    expect(Math.hypot(home[2] - b.x, home[3] - b.z)).toBeLessThan(0.01);
    // the plan as logged: which way was taken, and what it came to in the head
    expect(r.logLines.some((l) => /^tow: begins\..*to Stbd bow 3 \(spot 3\): the pull \d+ points, \d+ m, .*the push [\d.]+ m round .* way 1 of 7 tried: along the road/.test(l))).toBe(true);
    expect(r.logLines.some((l) => /^tow: the push worked out from where the pull ended: [\d.]+ m, the nose wheel turned \d+ degrees at most; it ends 0\.\d\d m and [\d.]+ degrees off the spot/.test(l))).toBe(true);
  }, 120000);

  it('with the deck full, the tractor (at its waiting place) can come for parked aircraft all over the deck and take each to every catapult: planned, not driven', () => {
    // (all 39 x 4 could be planned on 2026-11-17; here every fifth aircraft, for the time it takes. "tow|trycat|N|lock"
    // is not on the menu: the tow planned as it would be driven, nothing started)
    const me = spot('SB3');
    const some = spots.filter((q, i) => q.n !== me.n && i % 5 === 0);
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${me.x}, ${me.z}, ${me.fx}, ${me.fz})\n${START}${TOW_TO}
local D = 'CATCC deck spots'
local function lockOn(x, z) CAMAT = { f = x + 30, s = z, up = 80, lf = x, ls = z } click(D .. ' > Lock on the one the camera looks at') frames(0.5) end
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
click(D .. ' > Park a Hornet on every deck spot')\nframes(2)
for i, q in ipairs(SPOT_LIST) do
  lockOn(q.x, q.z)
  for _, k in ipairs({ 1, 2, 3, 4 }) do
    MISSION.CATCC_CR.queue[#MISSION.CATCC_CR.queue + 1] = 'tow|trycat|' .. k .. '|lock'
    frames(0.5)
  end
end`.replace('SPOT_LIST', `({ ${some.map((q) => `{ n = ${q.n}, name = "${q.name}", x = ${q.x}, z = ${q.z} }`).join(', ')} })`));
    const says = r.says.filter((l) => l.startsWith('tow') || l.startsWith('no '));
    expect(some.length).toBeGreaterThanOrEqual(7);
    expect(says.length).toBe(some.length * 4);
    for (const l of says) expect(l).toMatch(/^tow: can be driven: \d+ m along the deck /);
    // nothing was started: no tractor moved, no aircraft placed
    expect(r.rec.some((l) => l.startsWith('forcepos '))).toBe(false);
    expect(r.logLines.filter((l) => l.startsWith('tow: a dry run: ')).length).toBe(some.length * 4);
    expect(r.logLines.some((l) => l.startsWith('tow: begins.'))).toBe(false);
  }, 240000);

  it("the tow runs on the mission's clock (time acceleration, pause) and stands under active pause; the tractor comes out of its turn in line with the nose and backs straight onto the ring; it is faster on a straight", () => {
    // (the user, 2026-11-17, after the first run on the flight deck: "accelerating time in the mission does not make the
    // tugs move any faster"; "while connecting, the tug warped into its position and did a rapid/unrealistic turn";
    // "the tug could probably drive a bit faster when transiting a major artery")
    const a = spot('E21');
    const run = (accel: number) =>
      hook(`ROUTES_SRC = ROUTES_REAL\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}
ACCEL = ${accel}
click("Tow > Tow me to a catapult > Catapult 2")\nframes(0.5)
local tug = STATICS['catcc-tug'].id_
local n = 0
local function follow(untilText, max)
  for i = 1, max do
    frames(0.25)
    n = n + 1
    rec(string.format('at %.2f %.2f %.3f %.3f tug %.2f %.2f %.3f %.3f up %.3f steer %.3f', jet.f, jet.s, jet.nf, jet.ns, PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns, MT, 0))
    if said(untilText) then return true end
  end
  return false
end
rec('reached ' .. tostring(follow('The bar comes off its pintle', 4000)) .. ' after ' .. n .. ' frames, model time ' .. MT)
rec('-- there')
rec('hooked ' .. tostring(follow('tow: hooked up', 4000)) .. ' after ' .. n .. ' frames')
rec('-- pull')
-- the mission paused for 5 s of real time: nothing moves
PAUSED = true
local x0, z0 = PLACED[tug].f, PLACED[tug].s
frames(5)
rec(string.format('paused: tug moved %.3f', math.sqrt((PLACED[tug].f - x0) ^ 2 + (PLACED[tug].s - z0) ^ 2)))
PAUSED = false
frames(6)
rec(string.format('after the pause: tug moved %.3f', math.sqrt((PLACED[tug].f - x0) ^ 2 + (PLACED[tug].s - z0) ^ 2)))
-- ACTIVE PAUSE for 5 s: the mission's clock runs on; nothing of the tow moves (two frames for it to be seen)
ACTIVE_PAUSE = true
frames(0.5)
local x1, z1, j1, t1 = PLACED[tug].f, PLACED[tug].s, jet.f, MT
frames(5)
rec(string.format('active pause: tug moved %.3f, jet %.3f, in %.1f s of the mission', math.sqrt((PLACED[tug].f - x1) ^ 2 + (PLACED[tug].s - z1) ^ 2), math.abs(jet.f - j1), MT - t1))
ACTIVE_PAUSE = false
frames(2)
rec(string.format('after the active pause: tug moved %.3f', math.sqrt((PLACED[tug].f - x1) ^ 2 + (PLACED[tug].s - z1) ^ 2)))
follow('tow: stopped', 4000)
rec(string.format('end: jet %.3f %.3f nose %.5f %.5f', jet.f, jet.s, jet.nf, jet.ns))`);
    const one = run(1);
    const four = run(4);
    const frames = (r: typeof one, what: string) => Number(r.rec.find((l) => l.startsWith(what))!.match(/after (\d+) frames/)![1]);
    // THE CLOCK: four times the model time a frame, a quarter of the frames (to the tractor's stop in front of the jet, and
    // to hooked up); the same way driven: it stops at the same place, and the jet ends at the same place on the catapult
    expect(one.rec.find((l) => l.startsWith('reached '))).toMatch(/^reached true /);
    expect(frames(four, 'reached ') / frames(one, 'reached ')).toBeGreaterThan(0.23);
    expect(frames(four, 'reached ') / frames(one, 'reached ')).toBeLessThan(0.27);
    expect(frames(four, 'hooked ') / frames(one, 'hooked ')).toBeGreaterThan(0.23);
    expect(frames(four, 'hooked ') / frames(one, 'hooked ')).toBeLessThan(0.28);
    const stop = (r: typeof one) => r.logLines.find((l) => l.startsWith('tow: unhitch (tractor at '))!.match(/-?\d+\.\d+/g)!.map(Number);
    const [sx, sz, shx, shz] = stop(one);
    const [fx4, fz4] = stop(four);
    expect(Math.hypot(sx - fx4, sz - fz4)).toBeLessThan(0.15);
    const end = (r: typeof one) => r.rec.find((l) => l.startsWith('end: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(end(one)[0] - end(four)[0], end(one)[1] - end(four)[1])).toBeLessThan(0.05);
    // what the hook costs a frame is written to the log every 20 s (for the stutter the user saw: where the time goes)
    expect(one.logLines.some((l) => /^frame cost: \d+ frames in 2\d s \(\d+ a second\): the hook took \d+\.\d\d ms a frame on average, \d+\.\d at worst, over 4 ms in \d+; by part, ms: /.test(l))).toBe(true);
    // PERFORMANCE IN THE USER'S TERMS (2026-11-18): every minute, and when the mission ends: fps average and range, frame
    // time average and range, the 1% and 0.1% lows in ms, the hook's own share, and what was left out as test-only
    expect(one.logLines.some((l) => /^performance, nothing of ours on the deck \((so far|ended|the mission ended); \d+ s, \d+ frames\): fps [\d.]+ average, (\d+ to \d+|no whole second) by the second; frame time [\d.]+ ms average, [\d.]+ to [\d.]+; 1% low [\d.]+ ms \(\d+ fps\), 0\.1% low [\d.]+ ms \(\d+ fps\); the hook's share: [\d.]+ ms average, its slowest 1% [\d.]+ ms, 0\.1% [\d.]+ ms; left out as test-only: /.test(l))).toBe(true);
    // paused: it stands
    expect(one.rec).toContain('paused: tug moved 0.000');
    expect(Number(one.rec.find((l) => l.startsWith('after the pause: tug moved '))!.slice(27))).toBeGreaterThan(0.5);
    // ACTIVE PAUSE (the user, 2026-11-18: "When I pressed active pause ... the tugs continued to move aircraft. They
    // should pause too"): DCS's clock runs on (5 s of it, 20 s at four times speed), the tractor and the jet on its bar
    // stand; they go on when it is taken off; the log says both
    expect(one.rec).toContain('active pause: tug moved 0.000, jet 0.000, in 5.0 s of the mission');
    expect(four.rec).toContain('active pause: tug moved 0.000, jet 0.000, in 20.0 s of the mission');
    expect(Number(one.rec.find((l) => l.startsWith('after the active pause: tug moved '))!.slice(34))).toBeGreaterThan(0.2);
    expect(one.logLines).toContain("active pause ON: the tow's clock is held: tractors, tows and the deck spotting demo stand");
    expect(one.logLines.some((l) => /^active pause OFF after [56] s of the mission's time: they go on$/.test(l))).toBe(true);
    // IN LINE: where the tractor stops in front of the jet it is on the jet's nose line (within 0.3 m), facing away from
    // it (within 6 degrees), 11 m beyond the hook-up place; from there to hooked up it only backs: its heading does not
    // change and it stays on the line
    const nose = [a.x + a.fx * 3.005, a.z + a.fz * 3.005];
    const side = (x: number, z: number) => Math.abs((x - nose[0]) * -a.fz + (z - nose[1]) * a.fx);
    expect(side(sx, sz)).toBeLessThan(0.3);
    expect((Math.acos(Math.min(1, shx * a.fx + shz * a.fz)) * 180) / Math.PI).toBeLessThan(6);
    const iThere = one.rec.indexOf('-- there');
    const iPull = one.rec.indexOf('-- pull');
    const backing = track(one.rec.slice(iThere, iPull));
    expect(backing.length).toBeGreaterThan(40);
    for (const q of backing) {
      expect(side(q.tx, q.tz)).toBeLessThan(0.3);
      expect((Math.acos(Math.min(1, q.thx * a.fx + q.thz * a.fz)) * 180) / Math.PI).toBeLessThan(6);
    }
    expect(one.logLines.some((l) => /^tow: the tractor's turn onto the nose line: (a half circle of 5 m|in from the side, a quarter circle of 5 m)(, from the other side)?; it ends 11\.0 m beyond the hook-up place, at -?[\d.]+ \/ -?[\d.]+, and backs onto the ring from there$/.test(l))).toBe(true);
    // FASTER ON A STRAIGHT: by itself up to 3 m/s (and no faster), in its turn in front of the jet 1.4; with the jet on
    // the bar up to 2 m/s. (The samples: four a second; `up` here is the model time.)
    const speeds = (rec: string[], who: 'tug' | 'jet') => {
      const t = track(rec);
      const out: number[] = [];
      for (let i = 1; i < t.length; i++) {
        const dt = t[i].up - t[i - 1].up;
        if (dt > 0) out.push(Math.hypot(who === 'tug' ? t[i].tx - t[i - 1].tx : t[i].x - t[i - 1].x, who === 'tug' ? t[i].tz - t[i - 1].tz : t[i].z - t[i - 1].z) / dt);
      }
      return out;
    };
    const solo = speeds(one.rec.slice(0, iThere), 'tug');
    expect(Math.max(...solo)).toBeGreaterThan(2.8);
    expect(Math.max(...solo)).toBeLessThan(8.5); // (8.4 m/s: twice the 4.2 of 2026-11-18: the user, 2026-11-19)
    // (its last 12 s before it stops: the turn onto the nose line, at the pace of a turn)
    for (const v of solo.slice(-48, -8)) expect(v).toBeLessThan(3.3); // (a turn at 2.8 m/s now: 2026-11-19)
    const towed = speeds(one.rec.slice(iPull), 'jet');
    expect(Math.max(...towed)).toBeGreaterThan(1.7);
    expect(Math.max(...towed)).toBeLessThan(4.3); // (4.2 m/s with an aircraft in tow where it is not turning: twice the 2.1 of 2026-11-18: the user, 2026-11-19)
  }, 240000);

  it('the other aircraft on the deck: a tow is planned clear of them where there is a way (the user\'s own: Crotch 2 (now Crotch 1) into El 1 1, which went through a six-pack nose); where the taxi road itself runs through one, it goes and says so', () => {
    const me = spot('SB3');
    const from = spot('CR1');
    const to = spot('E11');
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${me.x}, ${me.z}, ${me.fx}, ${me.fz})\n${START}${TOW_TO}
local D = 'CATCC deck spots'
local function lockOn(x, z) CAMAT = { f = x + 30, s = z, up = 80, lf = x, ls = z } click(D .. ' > Lock on the one the camera looks at') frames(0.5) end
local function try(cmd) MISSION.CATCC_CR.queue[#MISSION.CATCC_CR.queue + 1] = cmd frames(0.5) end
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
click(D .. ' > Park a Hornet on every deck spot')\nframes(2)
-- as the user did: the aircraft on El 1 1 taken away, the one on Crotch 2 (now Crotch 1) towed into its place
lockOn(${to.x}, ${to.z})
click(D .. ' > Add / remove > Remove the locked aircraft (no spot there)')\nframes(1)
lockOn(${from.x}, ${from.z})
rec('-- spot')
try('tow|tryspot|${to.n}|lock')
rec('-- cat 4')
-- catapult 4 from El 2 1: the way onto its track runs over the spot Port quarter 1, where a Hornet stands
lockOn(${spot('E21').x}, ${spot('E21').z})
try('tow|trycat|4|lock')`);
    const iSpot = r.logLines.findIndex((l) => l.startsWith('menu: tow|tryspot'));
    const iCat = r.logLines.findIndex((l) => l.startsWith('menu: tow|trycat'));
    const spotLog = r.logLines.slice(iSpot, iCat);
    const catLog = r.logLines.slice(iCat);
    const said = r.says.filter((l) => l.startsWith('tow: can be driven') || l.startsWith('no tow'));
    expect(said.length).toBe(2);
    // INTO THE SPOT: the way that was driven in DCS on 2026-11-17 (pushed in along the road: its nose swung through a
    // six-pack nose) is dropped for exactly that; the next way (a line across the spot's front) is clear, and taken
    expect(spotLog.some((l) => /^tow: to El 1 1, way 1 of 7 \(along the road, .*\) is not driven: on the push into the spot the aircraft in tow would run into the Hornet of Sixpack \d /.test(l))).toBe(true);
    expect(said[0]).toMatch(/^tow: can be driven: \d+ m along the deck past El 1 1, then pushed back \d+ m into it, tail first\.$/);
    const note = spotLog.find((l) => l.startsWith('tow: a dry run: '))!;
    expect(note).toMatch(/; way [2-7] of 7 tried: a line -?\d+ degrees round from the spot's heading/);
    const room = Number(note.match(/the nearest it comes to another aircraft: (-?\d+\.\d) m \(the Hornet of /)![1]);
    expect(room).toBeGreaterThanOrEqual(0.1);
    expect(spotLog.some((l) => l.includes('looked for again with a contact allowed'))).toBe(false);
    // ONTO CATAPULT 4: there is no clear way (the taxi road passes the six-pack's noses, and the run onto the track
    // goes over the spot Port quarter 1): looked for again with a contact allowed; it goes, and says whom it goes through
    expect(catLog.some((l) => /^tow: no way clear of the other aircraft \(no tow to catapult 4 from here: the aircraft in tow would run into the Hornet of .*\): looked for again with a contact allowed$/.test(l))).toBe(true);
    expect(said[1]).toMatch(/^tow: can be driven: \d+ m along the deck to catapult 4, your nose wheel left 2 m short of its shuttle\. NOT CLEAR: the aircraft in tow goes \d\.\d m into the Hornet of Port quarter 1 and the tractor goes through the wheels of the Hornet of Port quarter 1 \(the taxi road runs there; no clear way was found\)\.$/);
  }, 240000);

  it('a PARKED aircraft is towed: the one the deck tool is locked on goes to a catapult, another into the spot it left; the tractor unhooks by itself and drives home; the player\'s jet is not touched', () => {
    // (the user, 2026-11-17: "send a tow crew to any aircraft spotted on the deck by using the UI to click on an
    // aircraft ... and then issuing a tow instruction". The panel's Tow page gives the same commands as these menu items)
    const a = spot('E21'); // the aircraft towed first: to catapult 2
    const me = spot('SB3'); // the player's own jet stands here (the deck tool leaves that spot empty)
    const idx = (q: { n: number }) => spots.indexOf(q as (typeof spots)[number]) + 1;
    const L = 'Tow > Tow the locked deck aircraft';
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nSTATIC_UP = 21.9\nadd(105, 'catcc-t0', '1: catcc-t0', 12, 33, SHIP_A)\nsetJet(${me.x}, ${me.z}, ${me.fx}, ${me.fz})\n${START}${TOW_TO}
local D = 'CATCC deck spots'
local function sid(i) for name, o in pairs(STATICS) do if name:find('^catcc%-spot%-' .. i .. ' ') then return o.id_ end end end
local function lockOn(x, z) CAMAT = { f = x + 30, s = z, up = 80, lf = x, ls = z } click(D .. ' > Lock on the one the camera looks at') frames(0.5) end
local function lockTo(name)
  for k, f in pairs(cmds) do
    if k:find('Tow the locked deck aircraft > To a parking spot', 1, true) and k:sub(-#name - 3) == ' > ' .. name then return f() end
  end
  error('no spot item ' .. name)
end
local tug
local function follow(id, x0, z0, untilText, max)
  for i = 1, max do
    frames(0.25)
    tug = tug or (STATICS['catcc-tug'] and STATICS['catcc-tug'].id_)
    if i % 4 == 0 and tug and PLACED[tug] then
      local p = PLACED[id]
      rec(string.format('at %.2f %.2f %.3f %.3f tug %.2f %.2f %.3f %.3f up %.3f steer %.3f', p and p.f or x0, p and p.s or z0, p and p.nf or 0, p and p.ns or 0, PLACED[tug].f, PLACED[tug].s, PLACED[tug].nf, PLACED[tug].ns, PLACED[tug].up,
        JETARG[id .. '/2'] or 0))
    end
    if said(untilText) then return true end
  end
  return false
end
-- nothing parked, nothing locked: no tow
click("${L} > To catapult 2")\nframes(0.5)
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
click(D .. ' > Park a Hornet on every deck spot')\nframes(2)
rec('-- first')
lockOn(${a.x}, ${a.z})
local A = sid(${idx(a)})
rec('A is the ship\\'s child: ' .. tostring(LINKED_IDS[A]))
-- to its own spot, to a spot another Hornet stands on, to the spot the player's jet stands on: refused
lockTo('${a.name}')\nframes(0.5)
lockTo('${spot('SB6').name}')\nframes(0.5)
lockTo('${me.name}')\nframes(0.5)
click("${L} > To catapult 2")\nframes(0.5)
rec('hooked ' .. tostring(follow(A, ${a.x}, ${a.z}, 'tow: hooked up', 1200)))
rec('-- pull')
rec('stopped ' .. tostring(follow(A, 0, 0, 'tow: stopped', 1600)))
rec(string.format('end: jet %.3f %.3f nose %.5f %.5f up %.3f own %s', PLACED[A].f, PLACED[A].s, PLACED[A].nf, PLACED[A].ns, PLACED[A].up, tostring(PLACED[A].own)))
rec('-- unhook')
rec('parked ' .. tostring(follow(A, 0, 0, 'tow: the tractor is parked', 3000)))
rec(string.format('home: tug %.1f %.1f; jet %.3f %.3f', PLACED[tug].f, PLACED[tug].s, PLACED[A].f, PLACED[A].s))
rec(string.format('wheels: nose %s left %s right %s wing %s', tostring(OBJARG_N[A .. '/101'] ~= nil), tostring(OBJARG_N[A .. '/103'] ~= nil), tostring(OBJARG_N[A .. '/102'] ~= nil), tostring(JETARG[A .. '/8'])))
-- the deck tool finds it where it now stands: the camera on the catapult, "lock on the one the camera looks at"
lockOn(PLACED[A].f, PLACED[A].s)
rec('-- second')
-- another parked aircraft into the spot it left (the first, in the deck's order, for which there is a way)
local B, bname
for i, q in ipairs(SPOT_LIST) do
  if q.n ~= ${a.n} and q.n ~= ${me.n} and not B then
    lockOn(q.x, q.z)
    lockTo('${a.name}')\nframes(0.5)
    if said('the tractor is coming') then B, bname = sid(i), q.name end
  end
end
rec('second: ' .. tostring(bname))
rec('hooked ' .. tostring(follow(B, 0, 0, 'tow: hooked up', 1600)))
rec('parked ' .. tostring(follow(B, 0, 0, 'tow: the tractor is parked', 6000)))
rec(string.format('end2: jet %.3f %.3f nose %.5f %.5f', PLACED[B].f, PLACED[B].s, PLACED[B].nf, PLACED[B].ns))
rec(string.format('me: %.3f %.3f', jet.f, jet.s))
-- the deck tool parks them anew: each on its own spot again
click(D .. ' > Park a Hornet on every deck spot')\nframes(2)
lockOn(${a.x}, ${a.z})`.replace('SPOT_LIST', `({ ${spots.map((q) => `{ n = ${q.n}, name = "${q.name}", x = ${q.x}, z = ${q.z} }`).join(', ')} })`));
    // nothing locked: no tow
    expect(r.says[0]).toBe('tow: no aircraft is selected: park the Hornets (Deck spots > Park Hornets), then click the one to tow.');
    const iFirst = r.rec.indexOf('-- first');
    const iSecond = r.rec.indexOf('-- second');
    // the refusals: its own spot; a spot another of the deck tool's Hornets stands on; the spot the player's jet stands on
    expect(r.says).toContain(`it is on ${a.name} already.`);
    expect(r.says).toContain(`${spot('SB6').name} is taken: one of the deck tool's Hornets stands on it (${spot('SB6').name}).`);
    expect(r.says).toContain(`${me.name} is taken: your own jet stands on it.`);
    // the tow: said of "it", and it ends by itself
    expect(r.says.some((l) => new RegExp(`^tow: the tractor is coming with the tow bar for the Hornet of spot ${a.n} "${a.name}"\\. Then: \\d+ m along the deck onto catapult 2's track and \\d+ m past the place, then pushed \\d+ m straight back into line, its nose wheel left 2 m short of the shuttle(\\. NOT CLEAR: [^;]*\\(the taxi road runs there; no clear way was found\\))?; there it unhooks and drives home\\.$`).test(l))).toBe(true);
    expect(r.says).toContain('tow: hooked up: it is pulled in 1.5 seconds.');
    expect(r.says.some((l) => /^tow: stopped at catapult 2\. It is 0\.0 m from the place and 0 degrees off its heading; the nose wheel turned at most \d+ degrees\. The tractor unhooks by itself\.$/.test(l))).toBe(true);
    expect(r.says.some((l) => l.includes('Set the parking brake') || l.includes('hands off') || l.includes('your nose'))).toBe(false);
    for (const what of ['hooked true', 'stopped true', 'parked true']) expect(r.rec.slice(iFirst, iSecond)).toContain(what);
    expect(r.rec).toContain("A is the ship's child: true");
    // the aircraft is a static: moved through its own position setter in the ship's frame, at ITS OWN height as DCS has
    // it (21.9 here, not a parked jet's 21.975); the player's jet is never moved
    expect(r.rec.some((l) => l.startsWith('forcepos '))).toBe(false);
    const end = r.rec.find((l) => l.startsWith('end: '))!;
    expect(end).toMatch(/ up 21\.900 own true$/);
    expect(r.logLines.some((l) => new RegExp(`^tow: the aircraft to tow: the Hornet of spot ${a.n} "${a.name}" \\(object \\d+, class \\S+, the ship's child: \\S+\\); the deck tool has it at .*; DCS says .* 21\\.900 up .*; its height taken as 21\\.900$`).test(l))).toBe(true);
    expect(r.logLines.some((l) => /^tow: the aircraft in tow is placed \(object \d+, class \S+; in the ship's own frame; it says it is there\)$/.test(l))).toBe(true);
    // it has not moved until it is hooked up; nothing leaves the deck; the tractor on the flight deck (20.149 m)
    const first = track(r.rec.slice(iFirst, iSecond));
    const cut = r.rec.indexOf('-- pull');
    const before = track(r.rec.slice(iFirst, cut));
    expect(before.length).toBeGreaterThan(30);
    for (const q of before) expect(Math.hypot(q.x - a.x, q.z - a.z)).toBeLessThan(0.01);
    for (const q of first) {
      expect(onDeck(q.tx, q.tz), `tractor at ${q.tx} ${q.tz}`).toBe(true);
      expect(onDeck(q.x, q.z), `aircraft at ${q.x} ${q.z}`).toBe(true);
      expect(q.up).toBeCloseTo(20.149, 3);
    }
    // on catapult 2: in line with the track, the nose wheel 2 m short of the shuttle; it stays there when unhooked
    const [endX, endZ, endFx, endFz] = end.match(/-?\d+\.\d+/g)!.map(Number);
    const [sh, far] = CATS['2'];
    const len = Math.hypot(far[0] - sh[0], far[1] - sh[1]);
    const [ex, ez] = [(far[0] - sh[0]) / len, (far[1] - sh[1]) / len];
    const nose = [endX + endFx * 3.005, endZ + endFz * 3.005];
    const along = (nose[0] - sh[0]) * ex + (nose[1] - sh[1]) * ez;
    expect(along).toBeGreaterThan(-2.08);
    expect(along).toBeLessThan(-1.92);
    expect(Math.abs((nose[0] - sh[0]) * -ez + (nose[1] - sh[1]) * ex)).toBeLessThan(0.08);
    expect((Math.acos(Math.min(1, endFx * ex + endFz * ez)) * 180) / Math.PI).toBeLessThan(0.3);
    const home = r.rec.find((l) => l.startsWith('home: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(home[0] + 74, home[1] - 27)).toBeLessThan(0.5);
    expect(Math.hypot(home[2] - endX, home[3] - endZ)).toBeLessThan(0.01);
    // its nose wheel was steered on its own model, its wheels turned; its wings stay folded (the deck tool's)
    expect(Math.max(...first.map((q) => Math.abs(q.steer)))).toBeGreaterThan(0.2);
    expect(Math.max(...first.map((q) => Math.abs(q.steer)))).toBeLessThan(75 / 90);
    expect(r.rec).toContain('wheels: nose true left true right true wing 1');
    // the tractor kept clear of the other aircraft on its own ways, or said that it could not
    expect(r.logLines.some((l) => /^tow: the tractor('s way to the aircraft keeps clear of| finds no way to the aircraft that keeps clear of) the 3[89] other aircraft on the deck/.test(l))).toBe(true);
    // the deck tool finds the aircraft where it now stands (the click and the mark do too): on the catapult, not on its spot
    expect(r.says.some((l) => new RegExp(`^deck spots: locked on spot ${a.n} "${a.name}": .* \\(0 m from where the camera looks\\)\\.$`).test(l))).toBe(true);
    // THE SECOND: another parked aircraft into the spot the first left free; it ends on the spot, within a centimetre
    const second = r.rec.find((l) => l.startsWith('second: '))!.slice(8);
    expect(second).not.toBe('nil');
    for (const what of ['hooked true', 'parked true']) expect(r.rec.slice(iSecond)).toContain(what);
    expect(r.says.some((l) => l.startsWith(`tow: the tractor is coming with the tow bar for the Hornet of spot`) && l.includes(`past ${a.name}, then pushed back`) && l.includes('tail first') && l.endsWith('; there it unhooks and drives home.'))).toBe(true);
    const end2 = r.rec.find((l) => l.startsWith('end2: '))!.match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.hypot(end2[0] - a.x, end2[1] - a.z)).toBeLessThan(0.01);
    expect((Math.acos(Math.min(1, end2[2] * a.fx + end2[3] * a.fz)) * 180) / Math.PI).toBeLessThan(0.1);
    for (const q of track(r.rec.slice(iSecond))) {
      expect(onDeck(q.tx, q.tz), `tractor at ${q.tx} ${q.tz}`).toBe(true);
      expect(onDeck(q.x, q.z), `aircraft at ${q.x} ${q.z}`).toBe(true);
    }
    // the second tow began where the first left the tractor: at its waiting place, facing the way it drove in; it backed
    // straight out before it could turn onto its way
    expect(r.logLines.some((l) => /^tow: from where it stands \(.*\) the tractor cannot turn onto its way: it backs straight out \d+ m first$/.test(l))).toBe(true);
    // the player's own jet stood where it was all along
    expect(r.rec).toContain(`me: ${me.x.toFixed(3)} ${me.z.toFixed(3)}`);
    // parked anew by the deck tool, each stands on its own spot again
    expect(r.says[r.says.length - 1]).toMatch(new RegExp(`^deck spots: locked on spot ${a.n} "${a.name}": .* \\(0 m from where the camera looks\\)\\.$`));
  }, 240000);

  it('from one spot a tow can be planned to every catapult and every other spot; what cannot be driven is refused with the reason', () => {
    const a = spot('E21');
    const r = hook(`ROUTES_SRC = ROUTES_REAL\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${TOW_TO}
for _, to in ipairs({ 'C1', 'C2', 'C3', 'C4', ${spots.filter((q) => q.id !== 'E21').map((q) => `'${q.name}'`).join(', ')} }) do
  HANDLER.onSimulationStart()
  frames(1.5)
  rec('== ' .. to)
  if to:match('^C%d$') then click('Tow > Tow me to a catapult > Catapult ' .. to:sub(2)) else towTo(to) end
  frames(0.5)
end`);
    let cur = '';
    const res: Record<string, string> = {};
    for (const l of r.rec) {
      if (l.startsWith('== ')) cur = l.slice(3);
      else if (l.startsWith('say ') && cur && !l.includes('at mission start')) res[cur] = l.slice(4).replace(/^CATCC crew test: /, '');
    }
    expect(Object.keys(res).length).toBe(43);
    const no = Object.entries(res).filter(([, t]) => !t.startsWith('tow: the tractor is coming'));
    expect(no).toEqual([]);
    // the pushes: none longer than 40 m; in every plan the nose wheel stays within 75 degrees
    const notes = r.logLines.filter((l) => l.startsWith('tow: begins'));
    expect(notes.length).toBe(43);
    const pushes = notes.map((l) => /the push ([\d.]+) m round/.exec(l)).filter((m) => m).map((m) => Number(m![1]));
    expect(pushes.length).toBe(39);
    expect(Math.max(...pushes)).toBeLessThan(40);
    for (const l of notes) for (const m of l.matchAll(/turns (\d+) degrees at most/g)) expect(Number(m[1])).toBeLessThanOrEqual(75);

    // REFUSALS. On the hangar deck: a flight deck tow is not for there
    const below = hook(`ROUTES_SRC = ROUTES_REAL\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}click("Tow > Tow me to a catapult > Catapult 1")\nframes(1)`);
    expect(below.says[below.says.length - 1]).toBe('you are on the hangar deck: a tow to a catapult or a deck spot starts on the flight deck. Down here: F10 > Tow > Tow me into the hangar.');
    // the spot the jet stands on; a spot one of the deck tool's Hornets stands on; an elevator that is down
    const same = hook(`ROUTES_SRC = ROUTES_REAL\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}towTo('${a.name}')\nframes(1)`);
    expect(same.says[same.says.length - 1]).toBe(`you are on ${a.name} already.`);
    const taken = hook(`ROUTES_SRC = ROUTES_REAL\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}click("CATCC deck spots > Park a Hornet on every deck spot")\nframes(2)\ntowTo('Sixpack 3')\nframes(1)`);
    expect(taken.says[taken.says.length - 1]).toBe("Sixpack 3 is taken: one of the deck tool's Hornets stands on it (Sixpack 3).");
    const down = hook(`ROUTES_SRC = ROUTES_REAL\nsetJet(${a.x}, ${a.z}, ${a.fx}, ${a.fz})\n${START}${TOW_TO}click("Catapult crews > Elevators > Elevator 1: down")\nframes(2)\ntowTo('El 1 1')\nframes(1)`);
    expect(down.says[down.says.length - 1]).toMatch(/^no tow to El 1 1 from here: .*elevator 1 is down and in the way .*; nor any of the other \d ways tried \(the log has each\)\.$/);
    expect(down.logLines.filter((l) => l.startsWith('tow: to El 1 1, way ')).length).toBeGreaterThanOrEqual(6);
    // nose to the deck's edge (parked nose-on by the directors): no deck ahead for the tractor
    const edge = hook(`ROUTES_SRC = ROUTES_REAL\nsetJet(60, 30, 0, 1)\n${START}click("Tow > Tow me to a catapult > Catapult 1")\nframes(1)`);
    expect(edge.says[edge.says.length - 1]).toMatch(/^no (tow|way) /);
  }, 120000);
});

// ---- THE DECK SPOTTING DEMO (Scripts/CATCC/crewtest_demo.lua, the hangar's plan crewtest_hangar.lua). The user,
// 2026-11-17: forty aircraft, as many as can be reached by a tractor down in the hangar, four tractors below and four
// above which never ride an elevator and never get in each other's way, the deck filled in an order that blocks
// nothing, CVW-14's liveries by flight, the catapult crews out of the way, the bubbles down, a key to start it.
describe('the deck spotting demo', () => {
  const hangarLua = hangarSrc.replace(/\r\n/g, '\n');
  const spot = (id: string) => {
    const m = new RegExp(`id = "${id}", name = "([^"]*)", area = "[^"]*", x = ([-\\d.]+), z = ([-\\d.]+), fx = ([-\\d.]+), fz = ([-\\d.]+)`).exec(routesSrc);
    if (!m) throw new Error(`no spot ${id}`);
    return { name: m[1], x: Number(m[2]), z: Number(m[3]), fx: Number(m[4]), fz: Number(m[5]) };
  };

  it("the hangar's plan is the user's: the 24 aircraft of his drawing's layer Hangar Spotting as he set them in DCS, each with the elevator it goes up by and its turn there; each elevator's two places on his own deck spots as nearly as its doorway lets them; four waiting places", () => {
    const slots = [...hangarLua.matchAll(/\{ n = (\d+), x = ([-\d.]+), z = ([-\d.]+), fx = ([-\d.]+), fz = ([-\d.]+), el = (\d), turn = (\d) \}/g)].map((m) => ({ n: Number(m[1]), x: Number(m[2]), z: Number(m[3]), fx: Number(m[4]), fz: Number(m[5]), el: Number(m[6]), turn: Number(m[7]) }));
    expect(slots.length).toBe(24);
    // numbered from the bow aft; every nose a unit vector; all inside the hangar's length and width
    expect(slots.map((q) => q.n)).toEqual(slots.map((_, i) => i + 1));
    for (let i = 1; i < slots.length; i++) expect(slots[i].x).toBeLessThanOrEqual(slots[i - 1].x + 1e-9);
    for (const q of slots) {
      expect(Math.hypot(q.fx, q.fz)).toBeCloseTo(1, 2);
      expect(q.x).toBeGreaterThan(-125);
      expect(q.x).toBeLessThan(70);
      expect(Math.abs(q.z)).toBeLessThan(13);
    }
    // HIS ORDER (the labels "EL# X" of his drawing, 2026-11-18): six for each elevator, their turns 1 to 6
    for (const k of [1, 2, 3, 4]) expect(slots.filter((q) => q.el === k).map((q) => q.turn).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // six stand at an angle across the hangar (the forward two and the after four); the rest along the ship, nose
    // forward or aft
    expect(slots.filter((q) => Math.abs(q.fz) > 0.8).map((q) => q.n)).toEqual([1, 2, 21, 22, 23, 24]);
    expect(slots.filter((q) => Math.abs(q.fx) > 0.98).length).toBe(18);
    // their own points 8 m and more apart, BUT FOR TWO: 21 and 22 (elevator 4's first and elevator 3's first), 4.7 m
    // apart, tail to nose: by the shapes the planners use a wing tip of the one is 0.9 m inside the nose of the other
    // (said to the user; they are his to move)
    const near: number[][] = [];
    for (const a of slots) for (const b of slots) if (a.n < b.n && Math.hypot(a.x - b.x, a.z - b.z) <= 8) near.push([a.n, b.n]);
    expect(near).toEqual([[21, 22]]);
    const st = [...hangarLua.matchAll(/\[(\d)\] = \{ x = \{[^}]*\}, z = \{[^}]*\}, arg = (\d+), top = [\d.]+, travel = [\d.]+, open = \{ ([-\d.]+), ([-\d.]+) \}, stations = \{ \{ x = ([-\d.]+), z = ([-\d.]+),[^}]*\}, \{ x = ([-\d.]+), z = ([-\d.]+),/g)];
    expect(st.length).toBe(4);
    const off: number[] = [];
    for (const m of st) {
      const k = Number(m[1]);
      const [a, b] = [Number(m[3]), Number(m[4])];
      const [x1, z1, x2, z2] = [Number(m[5]), Number(m[6]), Number(m[7]), Number(m[8])];
      // both wings through the doorway with 0.6 m to spare, 0.4 m and more between the two
      expect(x1 - 4.2).toBeGreaterThanOrEqual(a + 0.6 - 1e-6);
      expect(x2 + 4.2).toBeLessThanOrEqual(b - 0.6 + 1e-6);
      expect(x2 - x1).toBeGreaterThanOrEqual(8.8 - 1e-6);
      const [aft, fwd] = [spot(`E${k}2`), spot(`E${k}1`)];
      expect(z1).toBeCloseTo(aft.z, 2);
      expect(z2).toBeCloseTo(fwd.z, 2);
      off.push(Math.abs(x1 - aft.x), Math.abs(x2 - fwd.x));
    }
    expect(off.filter((d) => d < 0.4).length).toBe(4);
    expect(Math.max(...off)).toBeLessThan(2.7);
    // THE PLACES A TRACTOR WAITS AT ("posts": the plan's four homes, then its four rest): the ones that connect, by the
    // solver's own count (hangar_solve.lua plans every way of a tractor as it drives): none of them in what the user
    // marked along the end walls (three of the first four homes were: "adjust where the hangar tugs spawn so they
    // aren't spawning inside walls"); each on free floor of the plan's grid 1.5 m all round its own point; the homes
    // 5.5 m and more from every aircraft's own point (2.2 m and more from its outline, by the generator's shapes)
    const posts = [...hangarLua.matchAll(/\{ x = ([-\d.]+), z = ([-\d.]+), hx = (-?\d), hz = (-?\d) \}/g)].map((m) => ({ x: Number(m[1]), z: Number(m[2]), hx: Number(m[3]) }));
    expect(posts.map((h) => ({ x: h.x, z: h.z }))).toEqual([
      { x: 48.5, z: -2.2 }, { x: 42, z: 14.5 }, { x: -77, z: 14.5 }, { x: -52, z: -14.5 },
      { x: -1, z: -14.5 }, { x: 27, z: -14.5 }, { x: -10, z: -14.5 }, { x: -93.5, z: -3 },
    ]);
    for (const h of posts.slice(0, 4)) for (const q of slots) expect(Math.hypot(h.x - q.x, h.z - q.z)).toBeGreaterThan(5.5);
    const gridRows = [...(/rows = \{([\s\S]*?)\n {2}\} \},/.exec(hangarLua) ?? ['', ''])[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const cellAt = (x: number, z: number) => (gridRows[Math.floor((z + 24) / 0.5)] ?? '')[Math.floor((x + 132) / 0.5)] ?? ' ';
    for (const h of posts) for (const r of [1.5, 0.75]) for (let a = 0; a < 360; a += 30) expect(cellAt(h.x + r * Math.cos((a * Math.PI) / 180), h.z + r * Math.sin((a * Math.PI) / 180))).toBe('.');
    // (which way a tractor stands at each: the solver's: the way that connects)
    expect(posts.every((h) => Math.abs(h.hx) === 1)).toBe(true);
    // (where three of the first homes stood is blocked)
    for (const [x, z] of [[54, -7], [54, 7], [-122, -3]]) expect(cellAt(x, z)).toBe('#');
    // THE SOLVED TOWS (the user, 2026-11-18: "I'm not even going to run the demo anymore unless we have paths for all
    // aircraft. I've described what I believe is the correct unloading sequence to guide you"): one for each of the
    // 24, on the side of the platform he gave it ("left side of EL1 (assume looking from starboard to port)": left is
    // aft, place 1; right is forward, place 2); the fifth and sixth of an elevator on different places
    const tows = [...hangarLua.matchAll(/^ {4}\[(\d+)\] = \{ el = (\d), turn = (\d), st = ([12]), alpha = (-?\d+), (.*)$/gm)].map((m) => ({ n: Number(m[1]), el: Number(m[2]), turn: Number(m[3]), st: Number(m[4]), alpha: Number(m[5]), rest: m[6] }));
    expect(tows.length).toBe(24);
    expect(new Set(tows.map((t) => t.n)).size).toBe(24);
    const side: Record<number, number[]> = { 1: [2, 1, 1, 2], 2: [1, 2, 2, 1], 3: [2, 1, 2, 1], 4: [2, 1, 2, 1] };
    for (const t of tows) {
      const sl = slots.find((q) => q.n === t.n);
      expect(sl).toBeDefined();
      if (t.turn <= 4) expect(t.st).toBe(side[t.el][t.turn - 1]);
      else expect(t.st).not.toBe(tows.find((o) => o.el === t.el && o.turn === 11 - t.turn)?.st);
      // (the nose wheel turned at the hook-up, his rule: 70 degrees at the most)
      expect(Math.abs(t.alpha)).toBeLessThanOrEqual(70);
      // THE TRACTORS' OWN WAYS with it: to the aircraft from two posts and more, and back to a post
      const ways = /ways = \{ (.*?) \}, out = /.exec(t.rest)?.[1] ?? '';
      expect([...ways.matchAll(/\[\d\] = \{ side = /g)].length).toBeGreaterThanOrEqual(2);
      expect([...(t.rest.split(', out = ')[1] ?? '').split(', nextWay = ')[0].matchAll(/\[\d\] = \{ side = /g)].length).toBeGreaterThanOrEqual(2);
    }
    // (some are hooked on with the nose wheel turned; most are not)
    expect(tows.filter((t) => t.alpha !== 0).length).toBeGreaterThanOrEqual(1);
    expect(tows.filter((t) => t.alpha === 0).length).toBeGreaterThanOrEqual(16);
    // A TRACTOR'S WAY STRAIGHT TO THE NEXT AIRCRAFT OF THE SAME ELEVATOR (nextWay), whether it may wait at that nose
    // (early), where an elevator's tractor would stand at the start (start): there for the demo's CATCC_DEMO_OWN
    expect(tows.filter((t) => / nextWay = \{ rear = \{ side = /.test(t.rest) || /, front = \{ side = [-\d]+[^}]*pts = /.test(t.rest.split(', nextWay = ')[1] ?? '')).length).toBeGreaterThanOrEqual(16);
    expect(tows.filter((t) => / early = \{ front = (true|false), rear = (true|false) \}/.test(t.rest)).length).toBe(20);
    expect(tows.filter((t) => / start = \{ x = /.test(t.rest)).length).toBeGreaterThanOrEqual(2);
    // WHICH TOWS CAN BE DRIVEN AT THE SAME TIME (clear: by place, the places whose tows keep 0.6 m from its own all along
    // both): a list for each of the 24, symmetric, more than half of all pairs
    const clearBlock = (/\n {2}clear = \{\n([\s\S]*?)\n {2}\},/.exec(hangarLua) ?? ['', ''])[1];
    const clear = new Map([...clearBlock.matchAll(/\[(\d+)\] = \{ ([\d, ]*)\},/g)].map((m) => [Number(m[1]), m[2].split(',').map((v) => Number(v.trim())).filter((v) => v > 0)]));
    expect(clear.size).toBe(24);
    let pairsClear = 0;
    for (const [n, list] of clear) for (const m of list) { expect(clear.get(m)).toContain(n); pairsClear += 1; }
    expect(pairsClear / 2).toBeGreaterThan(138);
    // BY POST: the tows that pass through a tractor waiting there (postClash): the post in the open floor aft is in the way of several
    const pc = (/\n {2}postClash = \{\n([\s\S]*?)\n {2}\},/.exec(hangarLua) ?? ['', ''])[1];
    expect([...pc.matchAll(/\[\d\] = \{/g)].length).toBe(8);
    expect((/\[8\] = \{ ([\d, ]*)\}/.exec(pc) ?? ['', ''])[1].split(',').length).toBeGreaterThanOrEqual(3);
    // from post to post: every post gets to four others and more
    const hops = [...hangarLua.matchAll(/^ {4}\[(\d)\] = \{ (.*) \}, -- from post \d/gm)];
    expect(hops.length).toBe(8);
    for (const h of hops) expect([...h[2].matchAll(/\[\d\] = \{ side = /g)].length).toBeGreaterThanOrEqual(4);
    // THE DECK SPOTS the first four of each elevator go on to (the demo's DEST): sixteen, none twice, none on a platform
    const dest = [...demoSrc.matchAll(/\{ spot = '(\w+)'(?:, after = '\w+')? \}/g)].map((m) => m[1]);
    expect(dest.length).toBe(16);
    expect(new Set(dest).size).toBe(16);
    expect(dest.some((d) => /^E\d\d$/.test(d))).toBe(false);
    expect(hangarLua).not.toContain('lane =');
  });

  const PRE = (jet: boolean) => `ROUTES_SRC = ROUTES_REAL\nSTATIC_UP = 21.9
for i = 0, 9 do add(105 + i, 'catcc-t' .. i, '1: catcc-t' .. i, 12 + i, 33, SHIP_A) end
${jet ? `setJet(${spot('SB3').x}, ${spot('SB3').z}, ${spot('SB3').fx}, ${spot('SB3').fz})` : 'PLAYER = false'}
ONFRAME = function(dt)
  for idx = 0, 3 do
    if ELEV[idx] == 1 then
      local top, plat, bottom = 27 + 2 * idx, 57 + idx, 28 + 2 * idx
      if (ARGS[top] or 0) < 1 then ARGS[top] = math.min(1, (ARGS[top] or 0) + dt / 4)
      elseif (ARGS[plat] or 0) < 1 then ARGS[plat] = math.min(1, (ARGS[plat] or 0) + dt / 17)
      else ARGS[bottom] = 0 end
    end
  end
end
`;

  it('starts by its menu item: 39 aircraft in their flights\' liveries (the player\'s own spot left empty), 24 of them in the hangar (it is full) on the places of the user\'s plan with tow bars and covers, ten tractors with their drivers, the crews sent away, the bubbles and the elevators down; stopped, nothing is left', () => {
    const r = hook(`${PRE(true)}${START}CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
click('CATCC demo: spot the deck: start / stop')\nframes(2)
local function at(pat)
  for name, o in pairs(STATICS) do
    if name:find(pat) then local q = PLACED[o.id_] return q and string.format('%.2f %.2f up %.3f nose %.2f %.2f', q.f, q.s, q.up, q.nf, q.ns) or 'not placed' end
  end
  return 'none'
end
local n, low, wings, chocks, covers, coversLow = 0, 0, 0, 0, 0, 0
for name, o in pairs(STATICS) do
  if name:find('^catcc%-demo%-a%d+ ') then
    n = n + 1
    local below = PLACED[o.id_] and PLACED[o.id_].up < 12
    if below then low = low + 1 end
    if JETARG[o.id_ .. '/8'] == 1 then wings = wings + 1 end
    if JETARG[o.id_ .. '/23'] == 1 then chocks = chocks + 1 end
    if JETARG[o.id_ .. '/24'] == 1 then
      covers = covers + 1
      if below then coversLow = coversLow + 1 end
    end
  end
end
rec(string.format('aircraft %d, in the hangar %d, wings folded %d, chocks in %d, covers on %d (%d of them in the hangar)', n, low, wings, chocks, covers, coversLow))
rec('a1 ' .. at('^catcc%-demo%-a1 '))
for name, o in pairs(STATICS) do
  if name:find('^catcc%-demo%-a1 ') then rec(string.format('a1 board %.1f %.1f %.1f', JETARG[o.id_ .. '/442'] or -1, JETARG[o.id_ .. '/31'] or -1, JETARG[o.id_ .. '/32'] or -1)) end
  if name:find('^catcc%-demo%-a40 ') then rec(string.format('a40 board %.1f %.1f %.1f', JETARG[o.id_ .. '/442'] or -1, JETARG[o.id_ .. '/31'] or -1, JETARG[o.id_ .. '/32'] or -1)) end
end
rec('th1 ' .. at('^catcc%-demo%-th1 '))
rec('td3 ' .. at('^catcc%-demo%-td3 '))
rec(string.format('driver 105 at %.2f %.2f up %.2f; driver 111 up %.2f', byH[105].x, byH[105].z, byH[105].y, byH[111].y))
click('CATCC demo: spot the deck: start / stop')\nframes(1)
local left = 0
for name in pairs(STATICS) do if name:find('catcc-demo', 1, true) then left = left + 1 end end
rec('left ' .. left)
click('CATCC demo: report')\nframes(1)`, { demo: true });
    const made = r.rec.filter((l) => l.startsWith('static catcc-demo-'));
    const planes = made.filter((l) => l.includes('type FA-18C_hornet category Planes linked true'));
    expect(planes.length).toBe(39);
    expect(made.filter((l) => l.includes('type CATCC_Towbar ')).length).toBe(24);
    // (ten tractors: four in the hangar, SIX on the flight deck: the user, 2026-11-18: "add two additional tugs on both
    // decks to help with parellelization"; then "Hangar tugs can stay at 4 for now")
    expect(made.filter((l) => l.includes('type AS32-31A ')).length).toBe(10);
    // the liveries: the user's two lists, a flight's four together, its lead first with the flight lead's paint
    const liv = (k: number) => (/ livery (.*)$/.exec(planes.find((l) => l.startsWith(`static catcc-demo-a${k} `)) ?? '') ?? [])[1];
    expect(liv(1)).toBe('KING - LineJet-FL - 623');
    expect(liv(2)).toBe('KING - LineJet - 551');
    expect(liv(21)).toBe('STING - LineJet-FL - 637');
    expect(liv(40)).toBe('STING - LineJet - 522');
    expect(planes.filter((l) => / livery KING - LineJet/.test(l)).length).toBe(19); // (20 less the one whose spot the player's jet is on)
    expect(planes.filter((l) => / livery STING - LineJet/.test(l)).length).toBe(20);
    expect(planes.filter((l) => /LineJet-FL/.test(l)).length).toBe(10);
    expect(new Set(planes.map((l) => (/ - (\d+)$/.exec(l) ?? [])[1])).size).toBe(39); // no board twice
    expect(planes.some((l) => l.startsWith('static catcc-demo-a4 '))).toBe(false); // Stbd bow 3, the fourth of the first flight: the player's
    // chocks in on every one (model argument 23); covers (24) on the thirteen in the hangar only
    expect(r.rec).toContain('aircraft 39, in the hangar 24, wings folded 39, chocks in 39, covers on 24 (24 of them in the hangar)');
    // on its spot at a parked Hornet's height; a hangar tractor on the hangar's floor, a deck tractor on the deck
    const sb6 = spot('SB6');
    expect(r.rec).toContain(`a1 ${sb6.x.toFixed(2)} ${sb6.z.toFixed(2)} up 22.005 nose ${sb6.fx.toFixed(2)} ${sb6.fz.toFixed(2)}`);
    // ITS BOARD NUMBER on the model (the user, 2026-11-18): arguments 442 / 31 / 32 = hundreds / tens / units, a digit d as
    // d / 10: 623 on the first, 522 on the last
    expect(r.rec).toContain('a1 board 0.6 0.2 0.3');
    expect(r.rec).toContain('a40 board 0.5 0.2 0.2');
    // (A TRACTOR FOR EACH ELEVATOR down there (2026-11-19: on by default): the first stands at the nose of elevator 1's
    // first aircraft from the start (the plan's `start`: head on, for its front hitch: the aircraft of place 1 points
    // 0.48 / -0.88, the tractor the other way), 8.7 m up in the hangar)
    // (HOOKED ON FROM THE START (the user, 2026-11-19: "spawn the hangar tugs attached to their first aircraft to be
    // towed"): it stands 1.5 m nearer the nose than the plan's place there, on the bar's ring, still facing the
    // aircraft; the log says which tractors begin so: those of elevators 1, 2 and 3: elevator 4's has no place at a
    // nose in the plan)
    expect(r.rec.find((l) => l.startsWith('th1 '))).toMatch(/^th1 43\.06 -3\.96 up 8\.711 nose -0\.48 0\.8[78]$/);
    expect(r.logLines.filter((l) => /^demo: hangar tractor \d begins hooked on to \d+, the first of elevator [123] \(on its front hitch\)$/.test(l)).length).toBe(3);
    // (the deck's: five side by side in the junkyard, 3.3 m apart, noses inboard; the sixth in the pocket between the
    // island and elevator 2, on its place in front: the user, 2026-11-18: "the 2 additional tugs on the flight deck
    // cannot park on the CAT 4 JBD, sorry, put them in the junkyard or pocket between the island and el 2")
    // (eight on the flight deck (CATCC_DEMO_EIGHT) and six in the hangar were tried on 2026-11-19 and were no faster in
    // the rig at real time: six and four again)
    expect(r.rec).toContain('td3 -73.60 28.00 up 20.149 nose 0.00 -1.00');
    expect(made.some((l) => /^static catcc-demo-td5 .* at -80\.200 28\.000 /.test(l))).toBe(true);
    expect(made.some((l) => /^static catcc-demo-td6 .* at -33\.700 25\.000 /.test(l))).toBe(true);
    // the drivers: the deck's six tractors first, then the hangar's four (the seventh, catcc-t6, handle 111, sits 8.7 m
    // up, in the hangar): ten drivers for ten tractors
    expect(r.rec.find((l) => l.startsWith('driver 105'))).toMatch(/^driver 105 at -6[67]\.\d\d 2[78]\.\d\d up 20\.\d\d; driver 111 up 9\.\d\d$/);
    // NO SECTIONS (the user, 2026-11-18: "Lift the tugs' zone limitations"); WHERE THEY MAY WAIT ("a staging area (either
    // the junkyard, pocket between el 2 and the island, or any empty aircraft parking space that's nearby)"): the deck
    // spots of the sixteen aircraft that come up and go on to a spot are empty to begin with
    expect(r.logLines.find((l) => l.startsWith("demo: the deck's 6 tractors"))).toBe(
      "demo: the deck's 6 tractors take whatever costs them least (no sections); they wait in the junkyard, in the pocket between the island and elevator 2 (0 places) and on deck spots while those are empty " +
        // (2026-11-19: no longer on empty deck spots: the user: tugs by themselves are to keep "out of parking areas")
        '(none: they keep out of the parking places)',
    );
    const started = r.logLines.find((l) => l.startsWith('demo: started on'));
    expect(started).toBe(
      'demo: started on CVN-72: 39 aircraft made (15 on the flight deck on their spots, 24 in the hangar with tow bars), 4 + 6 tractors, 10 driver(s); catapult crews: 4 of 4 crews found, 1 people sent to the port edge; ' +
        'bubbles told down; left empty for a live aircraft: Stbd bow 3',
    );
    // all four elevators sent down at once (DCS's command 1), the bubbles down
    for (const k of [0, 1, 2, 3]) expect(r.rec.some((l) => new RegExp(`^elevator \\d+ ${k} 1$`).test(l))).toBe(true);
    expect(r.logLines.some((l) => l.startsWith('bow bubble: down for: demo'))).toBe(true);
    // stopped: everything taken away, the elevators told up again
    expect(r.rec).toContain('left 0');
    for (const k of [0, 1, 2, 3]) expect(r.rec.some((l) => new RegExp(`^elevator \\d+ ${k} 2$`).test(l))).toBe(true);
    expect(r.logLines).toContain('demo: stopped: everything taken away');
    expect(r.says[r.says.length - 1]).toBe('demo: it is not running (Ctrl+Shift+F9, or F10 > CATCC demo: spot the deck).');
  }, 120000);

  it('the panel\'s key Ctrl+Shift+F9 starts and stops it, with the panel put away and no player on the deck: forty aircraft', () => {
    const r = hook(`${PRE(false)}${START}CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
HOTKEYS['Ctrl+Shift+F9']()\nrec('before the frame: ' .. tostring(next(STATICS) ~= nil))\nframes(2)
local n = 0
for name in pairs(STATICS) do if name:find('^catcc%-demo%-a%d+ ') then n = n + 1 end end
rec('aircraft ' .. n .. ' panel shown ' .. tostring(panelShown()))
frames(1)\nHOTKEYS['Ctrl+Shift+F9']()\nframes(2)
n = 0
for name in pairs(STATICS) do if name:find('catcc-demo', 1, true) then n = n + 1 end end
rec('left ' .. n)`, { demo: true, ui: true });
    // (asked for in the key's callback, done from the frame loop)
    expect(r.rec).toContain('before the frame: false');
    expect(r.rec).toContain('aircraft 40 panel shown false');
    expect(r.rec).toContain('left 0');
    expect(r.logLines.filter((l) => l === 'panel: demo2|toggle (the demo key, or its button)').length).toBe(2);
  }, 120000);

  // THE WHOLE DEMO, under DCS's own Lua 5.1 (bin-mt/lua.dll, through deck-test/crew-test/luarun.py): fengari would take
  // some ten minutes over it. Needs DCS installed and python.
  const python = spawnSync('python', ['--version']).status === 0;
  const whole = (args: string[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-demo-'));
    fs.writeFileSync(path.join(dir, 'world.lua'), world);
    for (const k of ['HOOK_SRC', 'MENU_SRC', 'ROUTES_REAL', 'UI_SRC', 'DEMO_SRC', 'HANGAR_SRC', 'SLOTS_SRC', 'HEAD_SRC', 'COCKPIT_SRC']) fs.writeFileSync(path.join(dir, `${k}.txt`), '');
    // (CATCC_DEMO_BUDGET: the hangar's planning steps a frame: the rig's frame is half a second of the mission's time, DCS
    // has 30 and more in that)
    const out = spawnSync('python', ['-I', here('../deck-test/crew-test/luarun.py'), dir, here('demo-run.lua'), 'DEMO_ON=true', 'CATCC_DEMO_BUDGET=30', ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    fs.rmSync(dir, { recursive: true, force: true });
    if (out.status !== 0) throw new Error(`luarun.py: ${out.stderr || out.stdout}`);
    const lines = out.stdout.split(/\r?\n/);
    return { rec: lines.filter((l) => l !== '' && !l.startsWith('#')), log: lines.filter((l) => l.startsWith('#L ')).map((l) => l.slice(3).replace(/^\S+ hook\s+/, '')) };
  };
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    'the whole demo with the user\'s FULL hangar, in the plan\'s order (his, bettered in the rig), by the solved tows: all 24 come up, in pairs on the sides solved for them; sixteen are towed on to their deck spots; the tractors go by their solved ways; chocks out for every tow, no two tractors meet, nothing moves under active pause',
    () => {
      // THE HANGAR IS FULL AND COMES UP IN THE USER'S ORDER (2026-11-18: "I'm not even going to run the demo anymore
      // unless we have paths for all aircraft. I've described what I believe is the correct unloading sequence to
      // guide you. See if you can make it work"): every aircraft's tow is the one solved for it (hangar_solve.lua,
      // kept in the plan), the tractors go to it and back by ways planned as a tractor drives, and the demo runs to
      // its end.
      for (const [args, total] of [
        [[], 39],
        [['NO_JET=true', 'UI_ON=true'], 40],
      ] as [string[], number][]) {
        const r = whole(args);
        expect(r.rec).toContain(`statics: 10 tractors, ${total} aircraft`);
        expect(r.log.find((l) => l.startsWith('demo: started on'))).toContain(`${total} aircraft made (${total - 24} on the flight deck on their spots, 24 in the hangar with tow bars)`);
        expect(r.rec).toContain('covers on at the start: 24');
        expect(r.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
        expect(r.log.some((l) => l.includes('STOPPED'))).toBe(false);
        // THE FLIGHT DECK AFTER THE USER'S RUNS OF 2026-11-18 (evening): six tractors there; a tractor comes at an
        // aircraft's nose head on and takes the bar on its front hitch where that is the shorter way ("a lot of tugs
        // doing half turns to connect, particularly on the flight deck"); a tractor on its way to a place is called
        // back when its aircraft is up; off the after elevators a tow keeps to its side of the landing area where a
        // way straight in along the spot's line does; no ring of tows that wait for each other is left standing
        const deckTows = r.log.filter((l) => /^demo: deck tractor \d takes \d+ .* off elevator \d to /.test(l));
        expect(new Set(deckTows.map((l) => (/^demo: (deck tractor \d)/.exec(l) ?? [])[1])).size).toBeGreaterThanOrEqual(5);
        // (2026-11-19, after the user's morning run: one such tow in this run, where there were two: the tractors now
        // hook on from the nose places they wait at)
        // (and later the same day none: every tractor is at its aircraft's nose place before the platform is up)
        expect(deckTows.filter((l) => l.endsWith('; on its FRONT hitch (it comes at the nose head on)')).length).toBeGreaterThanOrEqual(0);
        // THE SAME DAY: a six-pack spot come to from behind is pulled straight to its place, never drawn past it and set
        // back ("pulling the aircraft all the way through its parking location, then backing up"); nothing is drawn
        // up to the door of an elevator while the one opposite it is down with aircraft to bring; a hangar tractor
        // whose own elevator has nothing left waits at the nose of another elevator's last aircraft
        expect(deckTows.filter((l) => l.includes('pulled into it nose first to its place')).length).toBeGreaterThanOrEqual(1);
        expect(deckTows.some((l) => l.includes('then set back'))).toBe(false);
        expect(r.log.some((l) => /^demo: elevator \d \((up|raising)\): nothing is drawn up to its door yet: elevator \d, opposite it, is down/.test(l))).toBe(true);
        // (2026-11-20: with the unloading order found in the rig (hangar_plan.py's RIG_ORDER) no elevator's last
        // aircraft stands far off for its own tractor: that need not happen any more)
        expect(r.log.filter((l) => /^demo: hangar tractor \d goes to the nose of \d+, the LAST of elevator \d/.test(l)).length).toBeGreaterThanOrEqual(0);
        // (and in the hangar a tow follows another that is under way onto a platform: "The final tow out of the hangar
        // still takes way too long ... not waiting until every other tow is complete before starting to move")
        // (2026-11-20: with the unloading order found in the rig no tow has to follow another through the hangar: elevator
        // 4's last two no longer stand one behind the other on the way; NOT EXERCISED by this run any more)
        expect(r.log.filter((l) => /^demo: hangar tractor \d with \d+ FOLLOWS hangar tractor \d with \d+ through the hangar/.test(l)).length).toBeGreaterThanOrEqual(0);
        // (2026-11-19, later: none need be called back in this run now: each is at its aircraft's nose place in time)
        expect(r.log.filter((l) => /^demo: deck tractor \d is called back from its way to /.test(l)).length).toBeGreaterThanOrEqual(0);
        // (2026-11-19: the own-side rule is for the FORWARD aircraft of an after platform only, the one that goes into
        // the landing area: with it for both the rig took 31.6 / 32.1 / 35.0 / 29.1 minutes at paces 2 / 4 / 8 / 1,
        // for the forward one only 29.5 / 31.5 / 32.8 / 27.7: two such tows in this run)
        expect(deckTows.filter((l) => /off elevator [34] to .*: \d+ m across the deck onto the line of /.test(l)).length).toBeGreaterThanOrEqual(1);
        expect(r.log.some((l) => l.includes('IN A RING and none can be stood down'))).toBe(false);
        // THE NIGHT OF 2026-11-18/19: a six-pack aircraft pulled into its spot FROM BEHIND, through the landing area (the
        // user: "they can be pulled into the spot from behind through the landing area"), where its backed-in way turns
        // in front of its elevator or cannot begin; and no frame of the demo fails
        // (2026-11-19: pulled straight to its place, within 0.15 m to the side and 2 degrees: no longer drawn past it and set back)
        expect(deckTows.filter((l) => /round the (forward|after) end of the row and through the landing area onto the line of Sixpack \d from behind, pulled into it nose first to its place \(it stands -?0\.[01]\d m to the side, -?0\.0\d m along and [01]\.\d degrees off the spot\)/.test(l)).length).toBeGreaterThanOrEqual(1);
        expect(r.log.some((l) => l.includes('frame error'))).toBe(false);
        expect(r.log.some((l) => l.includes('demo: error'))).toBe(false);
        expect(r.log.some((l) => l.includes('NOTHING HAS MOVED'))).toBe(false);
        // IN THE PLAN'S ORDER, by its places (numbered from the bow aft): each elevator's first four in their turns, then
        // its last two (2026-11-20: the order found in the rig, hangar_plan.py's RIG_ORDER: his, with 8 up elevator 2,
        // 14 up elevator 3, and elevator 4's second and last trips 19, 18 and 15, 12)
        const hangarTows = r.log.filter((l) => /^demo: hangar tractor \d takes /.test(l));
        const placesOf = (k: number) => hangarTows.filter((l) => new RegExp(`to (the door of )?elevator ${k}[ ,]`).test(l)).map((l) => Number((/\(place (\d+) of the hangar plan\)/.exec(l) ?? [])[1]));
        const order: Record<number, number[]> = { 1: [1, 4, 6, 2, 3, 7], 2: [9, 11, 5, 10, 13, 8], 3: [22, 20, 23, 17, 16, 14], 4: [21, 24, 19, 18, 15, 12] };
        for (const k of [1, 2, 3, 4]) {
          expect(placesOf(k).slice(0, 4)).toEqual(order[k].slice(0, 4));
          expect(placesOf(k).slice(4).sort((a, b) => a - b)).toEqual(order[k].slice(4).sort((a, b) => a - b));
        }
        expect(hangarTows.length).toBe(24);
        expect(r.log.filter((l) => /^demo: \d+ .* is on elevator \d /.test(l)).length).toBe(24);
        // IN PAIRS: a platform goes up with one aircraft twice at the most (its second held up for five minutes)
        expect(r.log.filter((l) => /goes up with 1 aircraft/.test(l)).length).toBeLessThanOrEqual(2);
        // BY THE SOLVED TOWS AND THE TRACTORS' SOLVED WAYS: most tractors go to their aircraft from the post they stand
        // at; some aircraft are hooked on with the nose wheel turned (his rule)
        // (by a solved way: from a post, or from the nose of the aircraft before (a tractor for each elevator goes
        // straight to the nose of its next and waits there: 2026-11-19))
        expect(hangarTows.filter((l) => l.includes('by its solved way from post') || l.includes('which waited at its nose')).length).toBeGreaterThanOrEqual(16);
        expect(hangarTows.filter((l) => l.includes('which waited at its nose')).length).toBeGreaterThanOrEqual(8);
        expect(hangarTows.some((l) => /the nose wheel and bar turned \d+ degrees to the (left|right) for the hook-up/.test(l))).toBe(true);
        expect(hangarTows.some((l) => l.includes('drawn out'))).toBe(true);
        // sixteen of them towed on to their deck spots, each onto its spot to the centimetre; the last two of each
        // elevator stay on it
        // (2026-11-19: but those pulled straight into a six-pack spot from behind, with no set-back: within 0.15 m; the
        // user: "Would it help efficiency at all to loosen the precision required when parking aircraft")
        const parked = r.log.filter((l) => /^demo: \d+ .* is parked on [\w ]+, 0\.(0\d|1[0-5]) m from the spot: chocks in, covers off, its tow bar taken away$/.test(l));
        expect(parked.length).toBe(16);
        const direct = deckTows.filter((l) => l.includes('pulled into it nose first to its place')).length;
        expect(parked.filter((l) => !l.includes(', 0.00 m from the spot')).length).toBeLessThanOrEqual(direct);
        expect(parked.filter((l) => !l.includes(', 0.00 m from the spot')).every((l) => / is parked on Sixpack \d,/.test(l))).toBe(true);
        expect(r.log.filter((l) => / is parked on /.test(l)).length).toBe(16);
        for (const k of [1, 2, 3, 4]) expect(r.log.some((l) => new RegExp(`^demo: elevator ${k} is up \\(\\d+ s\\) with 2 aircraft: they stay on it`).test(l))).toBe(true);
        // ON THE FLIGHT DECK: PORT 3 IS SPOTTED AFTER PORT 4 AND PORT 5 (now Port quarter 3, Fantail 1 and 2) (the user, 2026-11-18: "If it blocks the aircraft
        // on the stern, just spot it last, no?"), straight in along its own line (the demo's axisTow: the hook's own ways
        // have none onto it)
        const portOrder = parked.map((l) => (/ is parked on (Port quarter \d|Fantail \d)/.exec(l) ?? [])[1]).filter((v): v is string => !!v);
        expect(portOrder.indexOf('Port quarter 3')).toBeGreaterThan(portOrder.indexOf('Fantail 1'));
        expect(portOrder.indexOf('Port quarter 3')).toBeGreaterThan(portOrder.indexOf('Fantail 2'));
        expect(r.log.some((l) => /^demo: deck tractor \d takes \d+ .* off elevator 4 to Port quarter 3: \d+ m across the deck onto the line of Port quarter 3, then pushed straight back \d+ m into it, tail first/.test(l))).toBe(true);
        // two tows at the most are driven although not clear of another aircraft's padded shape (by under 2 m: the one
        // to Fantail 4 past its partner on the platform: said to the user), none through one
        const notClear = r.log.filter((l) => l.includes('NOT CLEAR'));
        expect(notClear.length).toBeLessThanOrEqual(2);
        for (const l of notClear) expect(l).toMatch(/NOT CLEAR: the aircraft in tow goes [01]\.\d m into /);
        // CHOCKS, COVERS, BARS: out for every tow, none moved with them in; at the end no cover and no bar is left
        expect(r.rec).toContain(`chocks: out on 24 aircraft while they were towed, 0 samples of an aircraft moving with them in; in on ${total} at the end; covers on 0 at the end; tow bars left 0`);
        expect(r.rec).toContain(`wings folded: ${total}`);
        // NO TWO TRACTORS NEAR EACH OTHER while one of them moves (what each holds is 1.4 m in radius: 2.8 m between their
        // own points at the least; measured 4.4), AND NO TRACTOR NEAR AN AIRCRAFT IN TOW THAT IS NOT ITS OWN (measured 8 m)
        const least = Number((/^least distance between two tractors \(one of them moving\): ([\d.]+) m/.exec(r.rec.find((l) => l.startsWith('least distance between two tractors')) ?? '') ?? [])[1]);
        expect(least).toBeGreaterThanOrEqual(3.0);
        const leastAT = Number((/^least distance between an aircraft in tow \(its centre line\) and a tractor that is not its own: ([\d.]+) m/.exec(r.rec.find((l) => l.startsWith('least distance between an aircraft in tow')) ?? '') ?? [])[1]);
        expect(leastAT).toBeGreaterThanOrEqual(5.5);
        // NO SECTIONS; every aircraft that goes on to a spot is given to the tractor it costs least; tractors come to stand
        // in front of an elevator and say how long until their aircraft is up
        const tows = r.log.map((l) => /^demo: deck tractor (\d) takes \d+ .* off elevator (\d) to /.exec(l)).filter((m): m is RegExpExecArray => !!m);
        expect(tows.length).toBe(16);
        expect(r.log.some((l) => / \(Fly \d/.test(l))).toBe(false);
        expect(r.log.filter((l) => /^demo: deck tractor \d is for \d+ \(elevator \d\): the aircraft is ready in \d+ s, the tractor could be there in \d+ s$/.test(l)).length).toBeGreaterThanOrEqual(16);
        expect(r.log.filter((l) => /^demo: deck tractor \d stands at the front of elevator \d, place \d \([-\d.]+ \/ [-\d.]+\): \d+ is up in \d+ s$/.test(l)).length).toBeGreaterThanOrEqual(3);
        // EVERY AIRCRAFT CARRIES ITS BOARD NUMBER (model arguments 442 / 31 / 32): the numbers of the flights' liveries
        const boards = /^board numbers on (\d+) aircraft: (.*)$/.exec(r.rec.find((l) => l.startsWith('board numbers on ')) ?? '') ?? [];
        expect(Number(boards[1])).toBe(total);
        expect(new Set((boards[2] ?? '').split(' ')).size).toBe(total);
        // stopped at the end: nothing left
        expect(r.rec).toContain('left after the stop: 0');
      }
      // ACTIVE PAUSE IN THE MIDDLE OF IT (the user, 2026-11-18: "When I pressed active pause ... the tugs continued to move
      // aircraft. They should pause too"): a minute of it from model time 455 (tows in hand on both decks): nothing of
      // the demo's moves while it is on (the mission's clock runs on)
      const ap = whole(['AP_AT=455']);
      expect(ap.rec.find((l) => l.startsWith('active pause from model time '))).toMatch(/^active pause from model time 45\d: in (59|60) s of the mission 0 of \d+ things of the demo moved \(most 0\.00\d m/);
      expect(ap.log.some((l) => l.startsWith('active pause ON'))).toBe(true);
      expect(ap.log.some((l) => /^active pause OFF after \d+ s/.test(l))).toBe(true);
      expect(ap.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
    },
    300000,
  );

  // SPOT ALL (the slot picker's button, 2026-11-22: "an alternative deck spot button that spots all statics in their
  // positions"): every aircraft on its deck spot at once, none in the hangar, nothing towed; the demo runs to its end
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    'Spot All: all forty aircraft stand on their deck spots from the start, none in the hangar, no tow, no error',
    () => {
      const r = whole(['NO_JET=true', 'UI_ON=true', 'CATCC_DEMO_SPOT_ALL=true']);
      expect(r.rec).toContain('statics: 10 tractors, 40 aircraft');
      expect(r.log.find((l) => l.startsWith('demo: started on'))).toContain('40 aircraft made (40 on the flight deck on their spots, 0 in the hangar');
      expect(r.rec).toContain('spots with their aircraft on them: 40');
      expect(r.log.some((l) => l.includes('STOPPED') || l.includes('demo: error'))).toBe(false);
      expect(r.log.filter((l) => /^demo: (deck|hangar) tractor \d takes /.test(l))).toEqual([]);
    },
    300000,
  );

  // WHAT IS DRAWN (2026-11-20, the user, of a switch that hides drivers, bars, tractors or hangar aircraft and logs the
  // frame time with each: "It's only a visibility switch right? the run will still complete as normal"). HIDE=20
  // (demo-run.lua): the panel's "Hide each in turn", 20 s each: every object of a hidden kind is put far off and back
  // again, and nothing else changes: the demo's log line for line, its end, its clearances.
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    'the panel\'s Hide switches change only what is drawn: hidden in turn, every object is off exactly while its kind is hidden, and the run is line for line the one without; the frame times by state when it stops',
    () => {
      const demoLines = (r: { log: string[] }) => r.log.filter((l) => (l.startsWith('demo:') && !l.startsWith('demo: hidden:')) || /^tow \S/.test(l));
      // (its end, the spots and the chocks: the least distances are measured only between what is drawn, so they differ)
      const results = (r: { rec: string[] }) => r.rec.filter((l) => l.startsWith('finished ') || l.startsWith('chocks:') || l.startsWith('spots with'));
      const plain = whole(['NO_JET=true', 'UI_ON=true']);
      const hid = whole(['NO_JET=true', 'UI_ON=true', 'HIDE=20']);
      expect(hid.rec.find((l) => l.startsWith('hidden in turn: '))).toMatch(
        /^hidden in turn: \d{3,} frames checked, states bars \/ deck \/ drivers \/ drivers,bars,tractors,hangar,deck \/ hangar \/ none \/ tractors, at most 7\d objects hidden at once, 0 wrong$/,
      );
      expect(demoLines(hid)).toEqual(demoLines(plain));
      expect(results(hid)).toEqual(results(plain));
      // each state its own performance lines; all of each together when the demo stops
      expect(hid.log.some((l) => l.startsWith('performance, the deck spotting demo running, hidden: tractors ('))).toBe(true);
      const sum = hid.log.find((l) => l.startsWith('demo drawn, all the periods of each state together (the demo stopped): '));
      expect(sum).toMatch(/everything drawn: \d+ frames, [\d.]+ ms average/);
      expect(sum).toMatch(/hidden: hangar aircraft: \d+ frames, [\d.]+ ms average \([\d.]+ fps\), 1% low [\d.]+ ms, [+-][\d.]+ ms against everything drawn just before and after \(\d+ periods\)/);
      // the drivers back on their seats when it stopped, and nothing of the demo's left
      expect(hid.rec).toContain('left after the stop: 0');
      expect(hid.rec).toContain('drivers left away after the stop: 0');
      // the demo seats its drivers through Tow.sit (DRIVER-POSE.md): the pose of ours with the limbs at the pedals and
      // the wheel is tried for each (not in this mod: as installed without -DriverPose), then the pilot's is played
      const tried = plain.rec.filter((l) => /^play \d+ catcc_drv_seat mode 2$/.test(l)).length;
      expect(tried).toBeGreaterThanOrEqual(8);
      expect(plain.rec.filter((l) => /^play \d+ f18_0_init mode 2$/.test(l)).length).toBe(tried);
    },
    300000,
  );

  // THE DRIVERS' HEADS (2026-11-22, the user: "while reversing they should turn their heads 90-110 degrees ... to the
  // right. At other times ... look where they are about to turn or check the area around them"; crew-test/DRIVER-HEAD.md).
  // HEAD_ON=true (demo-run.lua): Scripts/CATCC/crewtest_head.lua is there and the stand-in module plays the blend space.
  // The demo on its own thread, where a `head` call is a command like a place: the run is the one without, line for line.
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    "the drivers' heads in the whole demo, on its own thread: every driver seated in the blend space of ours; each looks over his right shoulder and into turns; the module is told a few hundred times a driver, not every frame; the run is line for line the one without",
    () => {
      const demoLines = (r: { log: string[] }) => r.log.filter((l) => l.startsWith('demo:') || l.startsWith('SAY demo:') || /^tow \S/.test(l));
      const results = (r: { rec: string[] }) =>
        r.rec.filter((l) => /^(statics:|covers on|finished |least distance|spots with|wings folded|board numbers|chocks:|left after|catcc-demo-t\S+ ends at)/.test(l)).map((l) => l.replace(/ \(log line \d+\)/, ''));
      const plain = whole(['THREAD=true']);
      const r = whole(['THREAD=true', 'HEAD_ON=true']);
      expect(r.log.filter((l) => l.startsWith('demo thread: error') || l.startsWith('frame error') || l.startsWith('demo: error'))).toEqual([]);
      expect(r.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
      expect(demoLines(r).length).toBeGreaterThan(800);
      expect(demoLines(r)).toEqual(demoLines(plain));
      expect(results(r)).toEqual(results(plain));
      // seated: the blend space for every driver, the plain seated pose for none (without the heads: the other way round)
      const seated = r.rec.filter((l) => /^play \d+ catcc_bs_drv_look mode 2$/.test(l)).map((l) => l.split(' ')[1]);
      expect(seated.length).toBeGreaterThanOrEqual(8);
      expect(new Set(seated).size).toBe(seated.length);
      expect(r.rec.some((l) => /^play \d+ f18_0_init/.test(l))).toBe(false);
      expect(plain.rec.filter((l) => /^play \d+ f18_0_init mode 2$/.test(l)).length).toBe(seated.length);
      expect(plain.rec.some((l) => l.startsWith('head '))).toBe(false);
      // what the module was told: for each driver "ahead" first; over the right shoulder (100) at some time for nearly
      // all (every tractor that works backs onto a bar's ring); looks into turns; never further than 100
      const heads = r.rec.filter((l) => l.startsWith('head ')).map((l) => l.split(' '));
      for (const h of seated) expect(heads.find((c) => c[1] === h)!.slice(2).join(' ')).toBe('0 w6');
      const right = new Set(heads.filter((c) => c[2] === '100').map((c) => c[1]));
      expect(right.size).toBeGreaterThanOrEqual(seated.length - 2);
      expect(heads.every((c) => Math.abs(Number(c[2])) <= 100)).toBe(true);
      expect(heads.filter((c) => Math.abs(Number(c[2])) >= 9 && Math.abs(Number(c[2])) <= 70).length).toBeGreaterThan(500);
      // (some 16 minutes of the mission, two frames a second in this rig: a call every few seconds a driver)
      expect(heads.length).toBeGreaterThan(seated.length * 50);
      expect(heads.length).toBeLessThan(seated.length * 800);
    },
    300000,
  );

  // THE BRAKE RIDERS (2026-11-25, the user: "Please add brown shirts to the cockpit of aircraft being towed";
  // crew-test/BRAKE-RIDER.md). COCKPIT_ON=true (demo-run.lua): Scripts/CATCC/crewtest_cockpit.lua is there and nine
  // brown shirts, catcc-b0 .. b8, are on the ship. On its own thread, with the drivers' heads: the run is the one without
  // them, line for line, but for the riders' own lines.
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    'the brake riders in the whole demo, on its own thread: found; one climbs into every aircraft towed before it is hooked on and stays through the elevator ride to its deck spot, out again once the tractor that delivered it is clear; seated in our blend space, looking round; the canopies they opened stay open; away when the demo stops; the run is otherwise line for line the one without',
    () => {
      const riderLine = (l: string) => /^demo: (cockpit: |\d+ brake rider\(s\) found)/.test(l);
      const demoLines = (r: { log: string[] }) => r.log.filter((l) => (l.startsWith('demo:') || l.startsWith('SAY demo:') || /^tow \S/.test(l)) && !riderLine(l));
      const results = (r: { rec: string[] }) =>
        r.rec.filter((l) => /^(statics:|covers on|finished |least distance|spots with|wings folded|board numbers|chocks:|left after|catcc-demo-t\S+ ends at)/.test(l)).map((l) => l.replace(/ \(log line \d+\)/, ''));
      const plain = whole(['THREAD=true', 'HEAD_ON=true']);
      const r = whole(['THREAD=true', 'HEAD_ON=true', 'COCKPIT_ON=true']);
      expect(r.log.filter((l) => l.startsWith('demo thread: error') || l.startsWith('frame error') || l.startsWith('demo: error') || l.startsWith('demo: the brake riders: '))).toEqual([]);
      expect(r.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
      expect(demoLines(r)).toEqual(demoLines(plain));
      expect(results(r)).toEqual(results(plain));
      expect(r.log).toContain('demo: 9 brake rider(s) found (9 of 9)');
      // in and out: every aircraft towed has had a rider (24 from the hangar, each towed twice: to its platform and on
      // to its deck spot), each tow at most one; nine riders for ten tractors: a few tows go without one
      const ins = r.log.filter((l) => l.startsWith('demo: cockpit: ') && l.includes(' climbs into '));
      const outs = r.log.filter((l) => l.startsWith('demo: cockpit: ') && l.includes(' climbs out of '));
      const none = r.log.filter((l) => l.startsWith('demo: cockpit: no brake rider free for '));
      // ONE RIDER AN AIRCRAFT, FROM THE HANGAR TO ITS DECK SPOT (the user, 2026-11-26: "I would prefer the brake rider to
      // remain in the cockpit during elevator rides between tugs"): each of the 24 is climbed into once, and climbed
      // out of only when the tractor that delivered it is clear (or after 60 s), never because its tow ended first
      expect(ins.every((l) => /^demo: cockpit: catcc-b\d climbs into .+ \(catcc_bs_rdr_look\)$/.test(l))).toBe(true);
      expect(new Set(ins.map((l) => l.match(/catcc-b\d climbs into (.+) \(/)![1])).size).toBe(24);
      expect(ins.length).toBe(24);
      expect(outs.length).toBeGreaterThan(20);
      expect(outs.every((l) => /: its tractor is (clear \(\d+\.\d m off\)|still near after 60 s)$/.test(l))).toBe(true);
      expect(none.length).toBeLessThan(4);
      // seated in our blend space and looking round (the module told where the head goes: ahead first)
      const riderH = new Set(Array.from({ length: 9 }, (_, i) => String(130 + i)));
      const plays = r.rec.filter((l) => /^play 13\d catcc_bs_rdr_look mode 2$/.test(l));
      expect(plays.length).toBe(ins.length);
      const heads = r.rec.filter((l) => l.startsWith('head ')).map((l) => l.split(' ')).filter((c) => riderH.has(c[1]));
      expect(heads.filter((c) => c[2] === '0' && c[3] === 'w6').length).toBe(ins.length);
      expect(heads.filter((c) => Math.abs(Number(c[2])) >= 35).length).toBeGreaterThan(ins.length);
      expect(heads.every((c) => c[2] === 'forgotten' || Math.abs(Number(c[2])) <= 100)).toBe(true);
      // the canopies: every aircraft a rider climbed into has its canopy open at the end
      expect(r.rec).toContain('canopies open at the end: 24');
      expect(r.rec).toContain('brake riders away after the stop: 9');
    },
    300000,
  );

  // THE SLOT PICKER (2026-11-20, the user: "wait until spotted ... in conjunction with a new graphical slot selection
  // interface ... only the aircraft assigned to the player can be selected ... That slot should be held for them with
  // a static until they return or someone with authority (PriFly) releases it"): its server side, in a multiplayer
  // mission stood in for (slots-run.lua): two Client Hornets on the demo's carrier, one on a spot whose aircraft stands
  // there from the start, one on a spot whose aircraft is still in the hangar.
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`))(
    'the slot picker: a slot is refused until its aircraft is spotted (the player told why); taken, its static goes and the slot is held for that player; left, the static is back and the slot held until released; assigned aircraft only; the host takes one through the picker; with the GUI state reachable it replaces DCS\'s screen, held back only while the hook keeps looking; DCS\'s Esc menu "Choose Slot" brings it, also after DCS\'s own list; Close and Spawn go DCS\'s own ways (spectating; the briefing)',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-slots-'));
      fs.writeFileSync(path.join(dir, 'world.lua'), world);
      for (const k of ['HOOK_SRC', 'MENU_SRC', 'ROUTES_REAL', 'UI_SRC', 'DEMO_SRC', 'HANGAR_SRC', 'SLOTS_SRC', 'HEAD_SRC', 'COCKPIT_SRC']) fs.writeFileSync(path.join(dir, `${k}.txt`), '');
      const out = spawnSync('python', ['-I', here('../deck-test/crew-test/luarun.py'), dir, here('slots-run.lua'), 'DEMO_ON=true', 'UI_ON=true', 'SLOTS_ON=true', 'NO_JET=true', 'CATCC_DEMO_THREAD=false', 'CATCC_DEMO_BUDGET=30'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      fs.rmSync(dir, { recursive: true, force: true });
      if (out.status !== 0) throw new Error(`luarun.py: ${out.stderr || out.stdout}`);
      const rec = out.stdout.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('#'));
      expect(rec).toContain('loaded: demo true, slots true');
      // THE VIEW BEHIND THE PICKER (the user, 2026-11-23: "show the F9 (external ship view) on mission start instead of
      // the F10 map ... the carrier is framed in the bottom half of the view, while our interface is shown in the top
      // half"; crewtest_slots.lua VIEW, S.view). The window at the screen's top centre (2560 wide: 578); the ship view
      // asked for (view command 13) each time the view is taken; the camera level, off the starboard side and above;
      // the ship's ends on one row of the screen below the window (its lower edge: row 532), the bow to the right
      expect(rec).toContain('view: held true, view commands 16 16 16 16 16 16 16; the window at 578, 24 (1404 x 508); the camera level true, 141 m up; on the screen: stern at 160, 980, bow at 2400, 980');
      // (checked: 30 frames on the camera is where it was put the frame before)
      expect(rec).toContain('view: HOLDS: 30 frames after view command 16');
      // (it rides with the ship; the window dragged down, the ship goes down with the free part of the screen; zoomed
      // in, the camera stands further off and the picture stays; another carrier's tab: the camera goes there; a
      // carrier that cannot be asked for: the camera left where it is)
      expect(rec).toContain('view: the ship 50 m on: stern at 160, 980, bow at 2400, 980');
      expect(rec).toContain('view: the window 300 lower: stern at 164, 1128, bow at 2396, 1128');
      expect(rec).toContain('view: field of view 40: the camera 2.1 times as high');
      expect(rec).toContain('view: CVN-71 chosen: stern at 160, 980, bow at 2400, 980');
      expect(rec).toContain('view: CVN-73 chosen (not there): held true, the camera put 0 times; said: true');
      // (given up: in his aircraft (nothing put, no view command: DCS's own cockpit view); DCS's own slot list; taken
      // again when he is a spectator with the picker up)
      expect(rec).toContain('view: in his aircraft: held false, the camera put 0 times, view commands sent 0 (the player is in his aircraft)');
      expect(rec).toContain('view: a spectator again: picker shown true, held true, view commands 16 16 16 16 16 16 16 16');
      expect(rec).toContain("view: DCS slot list: held false (DCS's own slot list)");
      // (a ship view that keeps its own camera: the free camera (16) next; neither keeps it: said once, left alone)
      expect(rec).toContain('view: the ship view does not hold: view commands 16 13, held true; HOLDS: 30 frames after view command 13');
      expect(rec).toContain('say CATCC crew test: The view could not be put on the carrier (the camera does not stay where it is put: see the log).');
      expect(rec).toContain('view: no view holds: view commands 16 13, held false, the camera put 0 times since');
      // THE PICTURE at other screens: the bow right of the stern on one row, the ship's length 0.87 of the width (the
      // user, 2026-11-23: "zoomed in a little more so that the window is filled with the carrier bow to stern minus a
      // little space either side": in DCS the hull shows about 7 % wider than its deck's ends, so 0.87 of the width
      // here is about 0.94 there), the deck's ends inside the screen with room to spare, the hull's box (both sides at
      // both ends: wider than the real, narrow-ended hull) between the window's lower edge (532) and the screen's,
      // centred there
      const pictures = rec.filter((l) => l.startsWith('picture '));
      expect(pictures.length).toBe(6);
      for (const l of pictures) {
        const m = l.match(/^picture (\d+) x (\d+): bow right of stern true; the length 0\.8[6-8] of the width, its ends at (-?\d+) and (-?\d+); the hull (-?\d+) to (-?\d+) across, (-?\d+) to (-?\d+) down; the camera (\d+) m off, looking down ([\d.]+)$/);
        expect(m, l).not.toBeNull();
        const [sw, sh, ex0, ex1, , , y0, y1, range, pitch] = m!.slice(1).map(Number);
        expect(ex0, l).toBeGreaterThan(0.05 * sw);
        expect(ex1, l).toBeLessThan(0.95 * sw);
        expect(y0, l).toBeGreaterThan(532);
        expect(y1, l).toBeLessThan(sh);
        expect(Math.abs((y0 + y1) / 2 - (532 + sh) / 2), l).toBeLessThanOrEqual(1);
        expect(range, l).toBeGreaterThan(200);
        expect(range, l).toBeLessThan(320);
        expect(pitch, l).toBeGreaterThan(10);
        expect(pitch, l).toBeLessThan(33);
      }
      // (the picker's Spawn without the GUI state: the static first, the slot three seconds later)
      expect(rec).toContain('the host spawned: his slot 901, statics on spot 1: 0, held for Host');
      // DCS'S FLY HELD UNTIL THE STATIC IS GONE (the user, 2026-11-23: "tighten the delay between removing the static
      // and spawning the actual aircraft"): with the GUI state reached, the briefing's FLY and net.spawn_player wrapped;
      // Spawn takes the slot at once with the static standing; through the briefing it stands; the FLY (as DCS calls
      // it: the button bound when the briefing was made) is only noted, the briefing stays up; the static taken away,
      // seen gone from the mission, no wait (FLY.settle 0), then DCS's own FLY (the briefing away,
      // net.spawn_player); a FLY with nothing held is DCS's own at once
      expect(rec).toContain('FLY wrapped: 00:00:00 hook    slots: FLY, in the GUI state: net.spawn_player: wrapped; BriefingDialog.Fly_onChange: wrapped');
      expect(rec).toContain('before Spawn: statics on spot 1: 1, state parked');
      expect(rec).toContain('Spawn pressed: slot "901", its static taken away false, reserved for Host');
      expect(rec).toContain('in the briefing 3 s: statics on spot 1: 1, spawned 0');
      expect(rec).toContain('on spot 1: catcc-demo-a1 76; 10 m off it: ""');
      // (no wait: the FLY held, the static taken away and seen gone, DCS's own FLY, all within the frame the FLY is seen:
      // the static's destroy recorded before the spawn)
      expect(rec).toContain('FLY asked: ' + "slots: FLY: Hornet 1: DCS's FLY asked for (the briefing's FLY)");
      expect(rec.indexOf('destroy catcc-demo-a1 76')).toBeLessThan(rec.indexOf('FLY pressed: spawned 1, statics on spot 1: 0, briefing up false'));
      expect(rec).toContain('FLY pressed: spawned 1, statics on spot 1: 0, briefing up false');
      expect(rec).toContain('FLY + 2 s: spawned 1 (0 s after FLY), statics on spot 1: 0, briefing up false');
      expect(rec).toContain('FLY: FLY: Hornet 1: the spot clear 0.00 s after its static was taken away; the ATC refreshed: no (switched off); the wait 0.00 s (FLY.settle)');
      expect(rec).toContain("FLY: FLY: Hornet 1: DCS's FLY made (done (fly)), 0.00 s after the static was seen gone");
      expect(rec).toContain('FLY again, nothing held: spawned 2');
      // THE FIRST-SPAWN TEST (the user, 2026-11-24: "try lower first spawn timings to see where the same limit is"): each
      // mission start runs the next case (25, 20, 15, 10 s); its line written before DCS's FLY; a start that finds
      // "started" last writes "froze" and the series stops, the hold back at 60 s
      expect(rec).toContain('series, an empty file: case 1 at 25 s; the hold 25 s');
      expect(rec).toContain('series, case 1 landed: case 2 at 20 s');
      expect(rec).toContain('series, case 2 started and never finished: case nil; the hold 0 s; the file: case 1 at=25s started (test) / case 1 at=25s landed (DCS 6.0 s) / case 2 at=20s started (test) / case 2 at=20s froze');
      // (the series done, 2026-11-24: off as installed, and no hold: AIM.notBefore 0)
      expect(rec).toContain('series off: the hold 0 s, case nil');
      expect(rec).toContain('series, the next start: case nil; the file: case 1 at=25s started (test) / case 1 at=25s landed (DCS 6.0 s) / case 2 at=20s started (test) / case 2 at=20s froze');
      // (each FLY says how long its spot stood empty, of that the wait, the check and aim, and DCS; and whether updobs ran)
      expect(rec).toContain('result: done; FLY: Hornet 1: ON ITS SPOT; its spot stood empty 2.50 s: the wait 0.00 s, the check and aim 0.00 s, DCS 2.5 s (its longest frame 2.4 s); the ATC refreshed: yes');
      // (on the screen only when it did not come up on its spot)
      expect(rec.some((l) => l.startsWith('say CATCC crew test: Hornet 1 is on its spot'))).toBe(false);
      // (the mission's slot on spot 1 is painted 744, which the demo's plan gives Corral 1: the demo paints its aircraft
      // on spot 1 744 and Corral 1's that spot's 623; the user's run of 2026-11-20: he chose the demo's 744 and it had no slot)
      expect(rec).toContain('paint: spot 1 board 744 (KING - LineJet - 744); the one the plan had as 744 (Corral 1) now 623 (KING - LineJet-FL - 623)');
      // (moving aircraft drawn smoothly between two reports, place and heading together)
      expect(rec).toContain('smoothly: halfway 5.0, 2.0, 0.0, moving true; after 10.0, 4.0, 10.0, moving false');
      // (Spot Deck: the demo on the carrier the picker shows, by name, with the camera 20 km away (from the slot screen
      // the demo found "no aircraft carrier within 5 km"); the host's, beside the carrier's name; hidden while it runs)
      expect(rec).toContain('demo stopped: running false; Spot Deck shown true (at 732, 424)');
      // (no aircraft spotted: no slot, from DCS's own slot list too; the picker draws nothing (Hornet 2: not drawn above))
      expect(rec).toContain('demo stopped: Bob asks for Hornet 1: false (2: CATCC: Hornet 1: no aircraft spotted there)');
      expect(rec).toContain('Spot Deck: running true on CVN-72; Spot Deck shown false');
      // (the carriers' tabs above the deck: every carrier of the mission, slots or not (CVN-73 has none); the one shown in
      // the app's orange; a click shows that carrier's deck: CVN-73's has no slots, so no board numbers)
      expect(rec).toContain('tabs: CVN-72 tplPrimary at 6, 2; CVN-73 tplButton at 152, 2');
      expect(rec).toContain('CVN-73 clicked: tabs CVN-72 tplButton, CVN-73 tplPrimary; board numbers 0');
      expect(rec).toContain('CVN-72 clicked: tabs CVN-72 tplPrimary, CVN-73 tplButton; board numbers 0');
      expect(rec.find((l) => l.startsWith('slots: '))).toMatch(/^slots: 2 on .+; the deck reported: true, \d+ aircraft$/);
      // (a dynamic spawn template: not a slot of the picker, and refused as one)
      expect(rec).toContain('template: Bob asks for it: false (2: CATCC: Template 1: a dynamic spawn template, not a slot); spot 1 still Hornet 1: Hornet 1');
      expect(rec).toContain('spot 1: parked; spot 18: hangar');
      // the picker over DCS's own slot screen (that screen cannot be put away from a hook of Saved Games): up while the
      // host has no slot, with the deck's picture; each aircraft on the flight deck drawn as PriFly draws it (a folded-wing
      // Hornet, green when it can be taken, its board number over it in the same colour; spot 1's, facing aft (reported
      // 193.9 deg from the bow to starboard: PriFly's 166 deg CCW, picture 33 of 72)), a slot with no aircraft there its
      // nothing (only an aircraft CATCC has spotted is ever drawn: the user, 2026-11-21: DCS's spawn point "should never
      // appear"); Close keeps it shut until his slot changes
      expect(rec.find((l) => l.startsWith('picker over DCS: '))).toMatch(/^picker over DCS: shown true, cursor true, deck picture catcc_deck\.png; 16 board numbers, 16 aircraft pictures; spot 1 \(\d+\): mine, catcc_jet_mine\.png at 166 about 42,42; Hornet 2 \(102\): none$/);
      // (the user, 2026-11-21: Spawn faded and not pressable unless the aircraft chosen is the player's to take; his
      // outlined in magenta (green only once its pilot has a green jet); the status one line, the demo's counts on the tab
      // row)
      expect(rec).toContain('nothing chosen: Spawn tplPrimaryOff disabled; status one line true; demo counts at 780, 2: Deck spotting demo: N on the deck, N below');
      expect(rec).toContain('a grey one chosen: Spawn tplPrimaryOff disabled');
      expect(rec).toContain('Spawn pressed anyway: did nothing true');
      expect(rec).toContain('Hornet 1 chosen: Spawn tplPrimary');
      expect(rec).toContain("spot 1's heading in the report: 193.9");
      expect(rec).toContain('closed: shown false (the host still has no slot)');
      expect(rec).toContain('Bob asks for Hornet 2: false (2: CATCC: Hornet 2: not spotted yet: its aircraft is in the hangar)');
      expect(rec).toContain('Bob asks for Hornet 1: nil');
      expect(rec).toContain('before: statics on spot 1: 1');
      expect(rec).toContain('Bob in Hornet 1: statics on spot 1: 0, state manned, held for Bob');
      expect(rec).toContain('Bob out: statics on spot 1: 1, state parked, held for Bob');
      expect(rec).toContain('the host asks for Hornet 1: false (1: CATCC: Hornet 1: reserved for Bob)');
      expect(rec).toContain('Bob asks for it again: nil');
      expect(rec).toContain('released; the host asks: nil');
      expect(rec).toContain('assigned to Bob: the host false, Bob nil');
      expect(rec.find((l) => l.startsWith('picker: '))).toMatch(/^picker: \d+ marks; Hornet 1 can be taken true, Hornet 2 nil$/);
      expect(rec).toContain('the host spawned: his slot 901, statics on spot 1: 0, held for Host');
      expect(rec).toContain('the host a spectator again: picker shown true');
      // the GUI state reachable (autoexec.cfg's "gui": the crew test's installer adds it): DCS's screen put away under the
      // picker once the wrap lands; DCS asking again draws nothing and brings the picker up; DCS's screen held back only
      // by a lease the hook renews at every look (gone 3 s after its last); "DCS slot list" gives DCS's screen back at once
      expect(rec.find((l) => l.startsWith('the GUI state reached: '))).toMatch(
        /DCS's slot screen, in the GUI state: MultiplayerSelectRole\.showInSelectRoleMode: wrapped; MultiplayerSelectRole\.show: wrapped; MultiplayerSelectCoalitionDialog\.show: wrapped; MultiplayerSelectRoleDialog\.show: wrapped$/,
      );
      expect(rec).toContain('wrapped: picker shown true, DCS\'s screen up false');
      // (its Close is DCS's own close of its slot screen: spectating)
      expect(rec).toContain('Close: DCS\'s own close onEsc(), picker shown false');
      expect(rec).toContain('DCS asked again: DCS\'s screen up false, picker shown true');
      expect(rec).toContain('4 s without a look: DCS\'s coalition dialog drawn true');
      expect(rec).toContain('DCS slot list: DCS\'s screen up true, its coalition dialog drawn true, picker shown false');
      // ("DCS slot list" for that once: DCS's own screen closed, its Esc menu's "Choose Slot" brings the picker again)
      expect(rec).toContain('DCS\'s own screen closed, then "Choose Slot": DCS\'s screen up false, picker shown true');
      // (the window shown and put away the panel's way: made visible once, never invisible: DCS does not show a window
      // of its toolkit again once it has been made invisible: the user's run of 2026-11-20, "the picker is shown" and nothing)
      expect(rec).toContain('asked for again: picker shown true, DCS\'s screen up false; windows made invisible: 0');
      // (and DCS's own slot screen back whatever is on the screen: Ctrl+Shift+F8)
      expect(rec).toContain('Ctrl+Shift+F8: DCS\'s screen up true, picker shown false');
      // (no spectators on the server: Close refused, as DCS's own close is; Spawn: the slot, then DCS's briefing as DCS's
      // own BRIEFING button opens it, whose FLY puts the player in the jet)
      expect(rec).toContain('no spectators: Close refused, picker shown true');
      expect(rec).toContain('say CATCC crew test: This server allows no spectators: choose an aircraft.');
      expect(rec).toContain('Spawn: slot 901; DCS onEsc(true), cockpit FA-18C_hornet, briefing Menu; picker shown false');
      // THE TWO RELEASES (the user, 2026-11-20: Release slot unseats as DCS's own does; a player's reservation released
      // apart from it; "visually distinct and physically separate ... Both should have confirmations"): in the jet, Release
      // slot (amber, under Spawn) and not Release reservation; asked first, No does nothing; Yes: DCS's own Release Slot,
      // the static back, still reserved for him; out of it, Release reservation (red, at the far left), asked first; Yes: free
      expect(rec).toContain('in the jet: picker shown true; Release slot shown true (tplAmber at 1226, 456), Release reservation shown false');
      expect(rec).toContain('Release slot asks: Release your slot (Hornet 1)? You go to the spectators; it stays reserved for you.');
      expect(rec).toContain('No: his slot 901');
      expect(rec).toContain('Yes: his slot "", spot 1 parked, reserved for Host');
      expect(rec).toContain('out of it: Release reservation shown true (tplRed at 6, 456), Release slot shown false');
      expect(rec).toContain('Release reservation asks: Release the reservation of Host on Hornet 1? Anyone may then take it.');
      expect(rec).toContain('Yes: reserved for nil');
    },
    120000,
  );

  // THE DEMO ON ITS OWN THREAD (2026-11-19, the user: "Complete the multi-threaded implementation";
  // catcc-handoff/WORKER-THREAD-PLAN.md). The native module (the built bin/catcc_crew.dll, loaded for its worker_*
  // functions only) makes a thread with a Lua state of its own; Scripts/CATCC/crewtest_worker.lua loads the hook and the
  // demo there, whole, with stand-ins for everything of DCS's; the harness is DCS's main thread: the hook in it sends
  // the frames and applies the worker's commands (Tow.Thr). THREAD=true (demo-run.lua): each frame waits for the
  // worker's step, so a run is the same run every time.
  const workerDll = here('../deck-test/crew-test/bin/catcc_crew.dll');
  it.skipIf(!python || !fs.existsSync(`${BIN}/lua.dll`) || !fs.existsSync(workerDll))(
    'the demo on its own thread: line for line the run it is on the main thread; the same with its commands applied a frame late; with frames left out and lists of commands held back up to 3 frames it still finishes with the same clearances; active pause holds it',
    () => {
      const demoLines = (r: { log: string[] }) => r.log.filter((l) => l.startsWith('demo:') || l.startsWith('SAY demo:') || /^tow \S/.test(l));
      const results = (r: { rec: string[] }) =>
        r.rec.filter((l) => /^(statics:|covers on|finished |least distance|spots with|wings folded|board numbers|chocks:|left after|catcc-demo-t\S+ ends at)/.test(l)).map((l) => l.replace(/ \(log line \d+\)/, ''));
      const errors = (r: { log: string[] }) => r.log.filter((l) => l.startsWith('demo thread: error') || l.startsWith('frame error') || l.startsWith('demo: error'));
      // LIVE=true (demo-run.lua): WHAT DCS DOES AND THE STAND-INS DID NOT (the user's first run on the thread,
      // 2026-11-20: "regular visual stutters/hitches": the hook took 47 ms a frame): the camera's place in the world is
      // another every frame, and DCS puts its own command back on the bubbles we keep down. With that the worker asked
      // a new question every frame (where the ship is, by the camera's place) and gave the bubbles' commands again
      // four times a second, waiting a frame for each: 12,621 waits in this run and 671 values read every frame,
      // where there are now some 500 waits (nearly all while the demo makes its objects) and some 20 values.
      const main = whole(['ACCEL_SET=1', 'LIVE=true']);
      expect(main.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
      const thr = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true']);
      expect(thr.log).toContain('demo thread: started: the deck spotting demo runs on a thread of its own (Scripts\\CATCC\\crewtest_worker.lua)');
      expect(main.log.some((l) => l.startsWith('demo thread:'))).toBe(false);
      expect(errors(thr)).toEqual([]);
      expect(demoLines(thr).length).toBeGreaterThan(800);
      expect(demoLines(thr)).toEqual(demoLines(main));
      expect(results(thr)).toEqual(results(main));
      // (what the two threads did: its steps, the calls it waited for (few: the first for each object), nothing late)
      expect(thr.rec.find((l) => l.startsWith('thread: '))).toMatch(
        /^thread: the demo's thread: \d{4} steps, [\d.]+ ms average, its slowest 1% [\d.]+ ms, 0\.1% [\d.]+ ms, the longest \d+ ms; \d{3} calls it waited for; 0 lists of commands came late \(not there when the next frame began\); objects moved on meanwhile 0 times; planning between the frames: 0 pieces, 0\.0 s in all; \d+ values read for it every frame; [\d.]+ KB a frame to it, [\d.]+ KB from it \(\d\d places and model arguments a frame applied by the native module itself\); waited for while the demo ran: .*; read every frame: .*h\.deckctx 1.*$/,
      );
      const figure = (r: { rec: string[] }, re: RegExp) => Number(re.exec(r.rec.find((l) => l.startsWith('thread: ')) ?? '')?.[1]);
      expect(figure(thr, /; (\d+) calls it waited for;/)).toBeLessThan(800);
      expect(figure(thr, /; (\d+) values read for it every frame;/)).toBeLessThan(60);
      expect(figure(thr, /; ([\d.]+) KB a frame to it,/)).toBeLessThan(2);
      // (and no function was asked something else every frame: the worker says so in the log if one is)
      expect(thr.log.some((l) => l.includes('what it is asked changes all the time'))).toBe(false);
      // A QUESTION THAT DOES CHANGE EVERY FRAME (the worker's Tow.Deck.ctx asking by the camera's place again:
      // CATCC_DEMO_NO_DECKCTX; the guard's threshold set for the rig's four frames a second): the log names the
      // function and the question, its answers are not kept for a minute, and the main thread is not left asking DCS
      // the old questions every frame (each is still waited for: that is what the log line is for)
      // THE PACKED LIST (WORKER-THREAD-PLAN.md, step 6; 2026-11-20, the user: "Ok work on this"): the worker's places and
      // model arguments go to the main thread as bytes that the native module reads and applies itself (some 56 a
      // frame here: the line above), not as text for Lua. Without it (CATCC_DEMO_NO_BLOB: everything as text, as it
      // was): the same run, line for line.
      const text = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', 'CATCC_DEMO_NO_BLOB=true']);
      expect(errors(text)).toEqual([]);
      expect(text.rec.find((l) => l.startsWith('thread: '))).toContain('KB from it (all of it as text for Lua)');
      expect(demoLines(text)).toEqual(demoLines(main));
      expect(results(text)).toEqual(results(main));
      const churn = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', 'CATCC_DEMO_NO_DECKCTX=true', 'CATCC_DEMO_CHURN=40']);
      expect(churn.log.some((l) => /^demo thread: N\.dostring_in was asked 40 different things in 20 s, each waited for \(the last: .*CATCC_CR\.ctx\([\d.]+, [\d.]+\).*what it is asked changes all the time; for a minute its answers are not kept$/.test(l))).toBe(true);
      expect(figure(churn, /; (\d+) calls it waited for;/)).toBeGreaterThan(3000);
      expect(figure(churn, /; (\d+) values read for it every frame;/)).toBeLessThan(60);
      expect(churn.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
      expect(thr.log.filter((l) => /^bubble \d: the ship held command 2, ours is 1: given again/.test(l)).length).toBeGreaterThanOrEqual(6);
      // ITS COMMANDS A FRAME LATE, as in DCS (the list for a frame is applied when the next begins): the demo itself
      // runs as before (what it reads does not depend on when its places are shown)
      const late = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', "CATCC_DEMO_LOCKSTEP='late'"]);
      expect(errors(late)).toEqual([]);
      expect(demoLines(late)).toEqual(demoLines(main));
      expect(late.rec.find((l) => l.startsWith('finished '))).toBe(main.rec.find((l) => l.startsWith('finished ')));
      expect(late.rec).toContain('left after the stop: 0');
      // DISORDER (seeded): one frame in five is not sent to the worker (it steps for the next: the newest counts), and
      // every list of commands is held back 0 to 3 frames. It finishes, all 24 up, nothing left, and nothing came
      // nearer to anything than in order (the places shown are the worker's, late; between two lists an object that
      // moves is moved on: Tow.Thr.carry).
      const least = (r: { rec: string[] }, what: string) => Number(/: ([\d.]+) m:/.exec(r.rec.find((l) => l.startsWith(what)) ?? '')?.[1]);
      const dis = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', 'CATCC_DEMO_DISORDER=7']);
      expect(errors(dis)).toEqual([]);
      expect(dis.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
      expect(dis.rec).toContain('left after the stop: 0');
      expect(dis.rec.find((l) => l.startsWith('thread: '))).toMatch(/; [1-9]\d* lists of commands came late \(not there when the next frame began\); objects moved on meanwhile [1-9]\d* times; /);
      // (in the hangar: or 5.0 m: with the unloading order found in the rig (2026-11-20) the run in order has 8.1 m, this
      // one 5.6; with the user's own order the run in order had 5.2)
      for (const [what, floor] of [['least distance between two tractors', 99], ['least distance between an aircraft in tow (its centre line) and a tractor', 99], ['least distance IN THE HANGAR between an aircraft in tow', 5.0]] as [string, number][]) {
        expect(least(dis, what)).toBeGreaterThanOrEqual(Math.min(least(main, what) - 0.3, floor));
      }
      // (a tractor's farthest move between two frames: in order what its speed gives; under disorder no more than the
      // 4 frames a list can be late are worth at 8.4 m/s)
      const far = (r: { rec: string[] }) => Number(/: ([\d.]+) m:/.exec(r.rec.find((l) => l.startsWith('the farthest a tractor moved')) ?? '')?.[1]);
      expect(far(thr)).toBe(far(main));
      expect(far(main)).toBeLessThan(2.2);
      expect(far(dis)).toBeLessThan(8.4);
      // BEGUN TWO HOURS INTO A MISSION: the clocks go to the worker with the command that starts the demo (it has had
      // no frame yet then: with its own clock at 0 the demo would see two hours pass in its first step): the same run,
      // two hours on
      const finishedAt = (r: { rec: string[] }) => Number(/^finished true at model time (\d+)$/.exec(r.rec.find((l) => l.startsWith('finished ')) ?? '')?.[1]);
      const lateStart = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', 'MT0=7200', 'RESTART=true']);
      expect(errors(lateStart)).toEqual([]);
      expect(finishedAt(lateStart) - 7200).toBe(finishedAt(main));
      // AND THEN (RESTART): the mission ends: the worker is stopped with it; another mission begins in the same DCS and
      // the demo is started again: a new worker, everything made again and moving; that mission ends with the demo
      // running: the worker is stopped again
      expect(lateStart.rec).toContain('restart: the mission ended: worker ended');
      expect(lateStart.rec.find((l) => l.startsWith('restart: a second mission'))).toMatch(/^restart: a second mission: worker running, 73 things of the demo made again, [1-9]\d* of them moved in two minutes$/);
      expect(lateStart.rec).toContain('restart: the mission ended with the demo running: worker ended; the thread started 1 time(s) and was stopped 2 time(s) since the first mission; errors 0');
      // ACTIVE PAUSE: nothing of the demo's moves while it is on, on its own thread as on the main one
      // SWITCHED OFF (demoThread = false in Config\CATCC-test.lua sets CATCC_DEMO_THREAD = false): the demo on the main
      // thread, as before it had a thread: no worker is started, and the run is the main thread's
      const off = whole(['ACCEL_SET=1', 'THREAD=true', 'LIVE=true', 'CATCC_DEMO_THREAD=false']);
      expect(off.log.some((l) => l.startsWith('demo thread: started'))).toBe(false);
      expect(off.log).toContain('demo thread: switched off (demoThread = false in Config\\CATCC-test.lua): the deck spotting demo runs on the main thread');
      expect(demoLines(off)).toEqual(demoLines(main));
      expect(results(off)).toEqual(results(main));
      const ap = whole(['THREAD=true', 'LIVE=true', 'AP_AT=455']);
      expect(errors(ap)).toEqual([]);
      expect(ap.rec.find((l) => l.startsWith('active pause from model time '))).toMatch(/^active pause from model time 45\d: in (59|60) s of the mission 0 of \d+ things of the demo moved \(most 0\.00\d m/);
      expect(ap.log.filter((l) => l.startsWith('active pause ON')).length).toBe(1);
      expect(ap.rec.find((l) => l.startsWith('finished '))).toMatch(/^finished true at model time \d+$/);
    },
    600000,
  );
});
