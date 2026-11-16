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
import { buildRoutesLua } from '../deck-test/crew-test/routes.gen.ts';
import { DECK_SPOTS as T_SPOTS } from '../../src/components/catcc/prifly/deckSpots.gen.ts';
import { buildSpotsTs, DECK_OUTLINE, EDGE, movedSpots, wheelsInside } from '../../scripts/catcc/deck-spots.gen.ts';

const here = (p: string) => path.resolve(__dirname, p);
const DCS = 'C:/Program Files/Eagle Dynamics/DCS World';
const BIN = `${DCS}/bin-mt`;
const SCRIPTS = `${DCS}/CoreMods/tech/USS_Nimitz/scripts`;

const cpp = fs.readFileSync(here('../deck-test/crew-test/native/catcc_crew.cpp'), 'utf8');
const patch = fs.readFileSync(here('../deck-test/crew-test/groundcrew-patch.lua'), 'utf8');
const menuSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest.lua'), 'utf8');
const hookSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_hook.lua'), 'utf8');
const routesSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_routes.lua'), 'utf8').replace(/\r\n/g, '\n');

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
    // model: extra, plus the plane captain (catcc-m0, a brown shirt) and the tow tractor's driver (catcc-t0, green): DCS's
    // own crew figure, with the wands; nobody of ours stands on elevator 1's platform (15.5 m forward and on)
    const m = fields(extra('model'));
    expect(m.crews).toBe('12,6,6,6');
    expect(m.c10).toBe(f.c10);
    const patched = patch.replace(/\r\n/g, '\n');
    expect(patched).toContain("{ { 'catcc-m0', 'brown', 12.0, 31.0 }, { 'catcc-t0', 'green', 12.0, 33.0 } }");
    expect(patched).not.toContain("model_name = 'catcc_test_pilot',");
    expect(patched).toContain("livery = 'yellow', -- flight directors");
    // the static types of our own mod (the tow bar, the axle finder's markers), declared in a Database file as the chock's
    // and the route lines' are, each drawn with a model of its own name
    const entry = fs.readFileSync(here('../deck-test/crew-test/Mods/tech/CATCC-Crew/entry.lua'), 'utf8');
    expect(entry).toContain("dofile(current_mod_path .. '/Database/db_catcc_crew.lua')");
    expect(entry).toContain("mount_vfs_texture_path(current_mod_path .. '/Shapes/textures')");
    const markers = Array.from({ length: 26 }, (_, i) => `Shapes/CATCC_AxleMarker_H${15 + i}.edm`);
    for (const f of ['Database/db_catcc_crew.lua', 'Shapes/CATCC_Towbar.edm', 'Shapes/CATCC_AxleProbe.edm', ...markers, 'Shapes/textures/catcc_towbar_diff.dds', 'Shapes/textures/catcc_towbar_nm.dds',
      'Shapes/textures/catcc_towbar_diff_roughmet.dds'])
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
  getCountry = function() return 2 end, getID = function() return 77 end,
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
    getGroups = function(side, cat) if side == 2 and cat == 3 then return { { getUnits = function() return { CV } end } } end return {} end,
    getPlayers = function(side) return (side == 2 and PLAYER ~= false) and { JET } or {} end,
    addStaticObject = function(country, t)
      if NO_BAR_TYPE and t.type == 'CATCC_Towbar' then error('unknown type ' .. t.type) end
      if NO_MARKER_TYPE and t.type:find('CATCC_AxleMarker', 1, true) then return nil end
      local n = 0
      for _ in pairs(STATICS) do n = n + 1 end
      local name = t.name
      STATICS[name] = { id_ = 33554688 + n, isExist = function() return true end, destroy = function() STATICS[name] = nil rec('destroy ' .. name) end }
      if t.linkUnit and not NO_LINK then LINKED_IDS[33554688 + n] = true end
      rec(string.format('static %s type %s category %s linked %s', t.name, t.type, t.category, tostring(t.linkUnit ~= nil))
        .. (t.linkUnit and string.format(' to %d at %.3f %.3f angle %.4f offset %s cargo %s', t.linkUnit, t.offsets.x, t.offsets.y, t.offsets.angle, tostring(t.linkOffset), tostring(t.canCargo)) or ''))
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
      local key = ((parent.path .. ' > ' .. name):gsub('^CATCC crew test > ', ''))
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
PLAYING, PROPS, PROPSETS, UNPLAYABLE = {}, {}, 0, {}
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
      local p = toWorld(CAMAT.f, CAMAT.up or 60, CAMAT.s)
      local d = CAMAT.lf and toWorld(CAMAT.lf, 22, CAMAT.ls) or toWorld(CAMAT.f + 10, CAMAT.up or 60, CAMAT.s)
      local dx, dy, dz = d.x - p.x, d.y - p.y, d.z - p.z
      local m = math.sqrt(dx * dx + dy * dy + dz * dz)
      return { p = p, x = v(dx / m, dy / m, dz / m), y = v(0, 1, 0), z = v(0, 0, 1) }
    end
    local p = COCKPIT and toWorld(jet.f + 3.5 * jet.nf, 23, jet.s + 3.5 * jet.ns) or toWorld(jet.f - 30, 40, jet.s)
    local nx, nz = jet.nf * shipX.x + jet.ns * shipZ.x, jet.nf * shipX.z + jet.ns * shipZ.z
    local b = (math.atan2 or math.atan)(nz, nx) + math.rad(CAMAZ)
    return { p = p, x = v(math.cos(b), 0, math.sin(b)), y = v(0, 1, 0), z = v(-math.sin(b), 0, math.cos(b)) }
  end,
  LoSetCommand = function(cmd, val)
    CAMSETS[#CAMSETS + 1] = val
    if cmd ~= 2007 then return end
    if CAMMODE == 'turn' then CAMAZ = math.max(-172, math.min(172, CAMAZ + val * CAMG)) elseif CAMMODE == 'angle' then CAMAZ = val * CAMK end
  end,
  LoGetPlayerPlaneId = function() return 16777472 end,
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
DCS = { getRealTime = function() return T end, getModelTime = function() return MT end, setUserCallbacks = function(h) HANDLER = h end }
net = { dostring_in = function(state, code)
  local r = assert(load(code, 'mission', 't', MISSION))()
  return r == nil and '' or tostring(r)
end }

assert(load(HOOK_SRC, 'crewtest_hook'))()

local function frames(secs)   -- run the sim for a while, 4 frames a second; the mission's timers fire too
  for _ = 1, math.floor(secs * 4 + 0.5) do
    T = T + 0.25
    if not PAUSED then MT = MT + 0.25 end
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

function hook(
  script: string,
  opts: { flag?: boolean; noNative?: boolean; quick?: boolean; world?: boolean; parentPos?: boolean; replaced?: number; noAnim?: boolean } = {},
): { rec: string[]; says: string[]; menu: string[]; log: number; logLines: string[] } {
  const pre = `FLAG = ${opts.flag === false ? 'false' : 'true'}\nNO_NATIVE = ${opts.noNative ? 'true' : 'false'}\n`;
  const set =
    (opts.quick === false ? 'QUICK = false\n' : '') +
    (opts.world === false ? 'WORLD = false\n' : '') +
    (opts.parentPos === false ? 'PARENTPOS = false\n' : '') +
    (opts.replaced ? `REPLACED = ${opts.replaced}\n` : '') +
    (opts.noAnim ? 'NO_ANIM = true\n' : '');
  const out = run(`${pre}${world}\n${set}${script}\ndone()`, { HOOK_SRC: hookSrc, MENU_SRC: menuSrc, ROUTES_REAL: routesSrc }).split('\n');
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
    expect(types.split(';')).toEqual([...Array.from({ length: 26 }, (_, i) => one(`CATCC_AxleMarker_H${15 + i}`)), one('CATCC_Towbar'), one('CATCC_AxleProbe')]);
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
    expect(SUBS.map((s) => inSub(s).length)).toEqual([10, 8, 18, 8, 48, 23]);
    // (Tow: five items, the driver's seat, and the axle finder with its two sets of steps)
    expect(inSub('Tow > Driver seat').length).toBe(6);
    expect(inSub('Tow > Axle finder').length).toBe(12);
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
    expect(top).toEqual(['List people on my ship', TARGET, NIGHT, 'Stop the demo / signal test / marshalling']);
    expect(top.length + SUBS.length).toBeLessThanOrEqual(10);
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
    expect(r.says).toEqual([
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
    expect(r.says[0]).toMatch(/ Our own animation clip: in the list\.$/);
    expect(r.logLines).toContain('our mod\'s animation clip "catcc_test_clip": IN the list (index 7, length 2.17 s)');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(['play 102 catcc_test_clip']);
    const no = hook('HANDLER.onSimulationStart()\nframes(10)');
    expect(no.logLines).toContain('our mod\'s animation clip "catcc_test_clip": NOT in the list of 7');
  });

  it('says which people of ours are there, or that none is', () => {
    const none = hook(`for i = #PEOPLE, 1, -1 do if PEOPLE[i].name == 'catcc-00' then table.remove(PEOPLE, i) end end
HANDLER.onSimulationStart()\nframes(10)`);
    expect(none.says[0]).toContain('People of ours: NONE.');
    const two = hook("add(105, 'catcc-c0', '1: catcc-c0', 10, 27, SHIP_A)\nHANDLER.onSimulationStart()\nframes(10)");
    expect(two.says[0]).toContain('5 people on your ship: 1 yellow, 1 brown, 1 catapult crew. People of ours: catcc-00, catcc-c0.');
  });

  it("tells the ships apart by the men's own world positions when their ship's is not readable", () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(10)', { parentPos: false });
    expect(r.says[0]).toContain('4 people on your ship: 1 yellow, 1 brown, 1 catapult crew.');
    expect(r.says[0]).toContain('(4 more on other ships.)');
    expect(r.logLines.some((l) => l.includes('(told apart by their own position)'))).toBe(true);
  });

  it('says so when the ships cannot be told apart (no world positions at all)', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(10)', { world: false, parentPos: false });
    expect(r.says[0]).toContain('8 people on your ship');
    expect(r.says[0]).toContain('(Ships could not be told apart: no world positions.)');
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
    expect(r.says.filter((s) => s.includes('at mission start')).length).toBe(1);
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
    expect(r.says[1]).toBe('signal test: catcc-00 is walking to 14 m ahead of your nose (25 m to go). Then 15 steps, about 75 s in all: watch him; each one is announced.');
    expect(r.rec.filter((l) => l.startsWith('play '))).toEqual(SIGNALS);
    expect(r.says[2]).toBe('signal test 1 of 15: attention');
    expect(r.says[5]).toBe('signal test 4 of 15: turn LEFT (your left)');
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
ARGS[53] = 0.9   -- (DCS's own raise sequence starts to shut the door: written back to open)
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
    // Up: the lower fence first (4 s), then the platform (17 s), then the deck-edge fence (4 s), in that order, the door
    // written back to open whenever it is found less than open; then the door stays open until it is let go
    const rise = r.rec.slice(up).filter((l) => l.startsWith('shiparg ')).map((l) => Number(l.split(' ')[2]));
    const firstOf = (a: number) => rise.indexOf(a);
    expect(firstOf(32)).toBeGreaterThan(-1);
    expect(firstOf(59)).toBeGreaterThan(rise.lastIndexOf(32));
    expect(firstOf(31)).toBeGreaterThan(rise.lastIndexOf(59));
    expect(rise.filter((a) => a === 53).length).toBe(1);
    expect(r.rec).toContain('after the raise: door 1.00, lower fence 1.00, platform 0.00, deck-edge fence 0.00');
    expect(r.logLines.some((l) => /^elevator 3: at the flight deck after 2\d s, its hangar door still open$/.test(l))).toBe(true);
    expect(r.rec).toContain('door writes after the doors were let go: 0');
    expect(r.says).toContain('elevator 3 told to come UP, its hangar door left open (Elevators > Shut the hangar doors).');
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

  it("the edge spots: every spot whose tail points at the deck edge has its main wheels 4 ft from it; the generator's outline is the hook's", () => {
    // (the generated spots file is current: else node scripts/catcc/deck-spots.gen.ts)
    expect(fs.readFileSync(here('../../src/components/catcc/prifly/deckSpots.gen.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(buildSpotsTs());
    expect(movedSpots.length).toBe(29);
    expect(Math.max(...movedSpots.map((m) => Math.abs(m.moved)))).toBeLessThan(2.6);
    const csv = fs.readFileSync(here('../../carrier-ops-handoff-2/deck-spots.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
    for (const m of movedSpots) {
      const row = csv.find((c) => c[1] === m.name)!;
      const d = T_SPOTS.find((q) => q.label === m.name)!;
      // on its heading still (moved along it only), and the nearer main wheel 1.22 m inside the edge (positions are kept to the centimetre)
      expect(Math.abs(wheelsInside(d.p[0], -d.p[1], Number(row[5])) - EDGE.wheelsFromEdge), m.name).toBeLessThan(0.02);
      const a = (Number(row[5]) * Math.PI) / 180;
      const across = (d.p[0] - Number(row[2])) * -Math.sin(a) + (-d.p[1] - Number(row[4])) * Math.cos(a);
      expect(Math.abs(across), m.name).toBeLessThan(0.011);
    }
    // a spot in the middle of the deck is where the plan has it
    const sp1 = T_SPOTS.find((q) => q.label === 'Sixpack 1')!;
    const r1 = csv.find((c) => c[1] === 'Sixpack 1')!;
    expect([sp1.p[0], sp1.p[1]]).toEqual([Math.round(Number(r1[2]) * 100) / 100, Math.round(-Number(r1[4]) * 100) / 100]);
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
    expect(r.says[r.says.length - 1]).toMatch(/^the way to Patio 2 \(spot 31\) starts where the roll-out ends; it passes \d+ m from you and leads on \d+ degrees off your nose: too far, or behind you \(taken within 40 m and 110 degrees\)\.$/);
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
    expect(r.says[1]).toBe('deck spots: 3 aircraft parked, from the built-in spots; spot 3 left empty (an aircraft stands there). Look at one from outside (F11) and F10 > CATCC deck spots > Lock on the one the camera looks at.');
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
    expect(again.says[0]).toMatch(/^deck spots: 1 aircraft parked, from the saved file \(Logs\\catcc-deck-spots\.lua\); 1 removed before\./);
    // "start over": the built-in spots again (three of the four: the player's stays empty)
    expect(again.rec.slice(cutA).filter((l) => l.startsWith('static catcc-spot')).length).toBe(3);
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
    // the axle as the hook takes it: 3.005 m ahead of the jet, 1.569 m below it (0.257 m above the floor), 0.58 m from end to end (the nose tyres' outer
    // faces), a pin 4 cm into each end: the pins' tips 0.25 m either side, the bar's heads outside the tyres
    let lo = 0;
    let hi = B.thetaMax;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (pins(mid)[1] < 0.25) lo = mid;
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
    expect(g[5]).toBeCloseTo(0.5, 3);
    expect(g[6]).toBeCloseTo(23.13, 2);
    expect(g[7]).toBeCloseTo(33.54, 2);
    // clamped: the arms closed until the pins' tips are 0.25 m either side (in the axle's ends), on the taut-chain half of the
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
    expect(tw[0]).toBeGreaterThan(300);
    expect(tw[1]).toBeLessThan(-0.3);
    expect(tw[2]).toBeGreaterThan(0.3);
    expect(tw[3]).toBeLessThan(-0.05);
    expect(tw[4]).toBeGreaterThan(0.05);
    expect(nums('jet wheels: ').every((n) => n > 100)).toBe(true);
    // whole turns made, counted from the values written (each wraps at 1; forwards counts up). The tractor (2.42 m a turn)
    // drove some 100 m; the jet was pulled some 55 m: its nose wheels (1.61 m a turn) made more turns than its main wheels
    // (2.32 m a turn), and of those the right one, on the outside of the left turn, more than the left
    const [tugTurns, noseTurns, leftTurns, rightTurns] = nums('turns: ');
    expect(tugTurns).toBeGreaterThan(30);
    expect(noseTurns).toBeGreaterThan(25);
    expect(noseTurns).toBeLessThan(45);
    expect(rightTurns).toBeGreaterThan(leftTurns + 0.5);
    expect(noseTurns).toBeGreaterThan(rightTurns);
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
    expect(rolled[5]).toBeCloseTo(0.5, 3);
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
    expect(deck.says[0]).toMatch(/^this first tow test starts on the hangar deck: ride elevator 1 down first/);
    expect(deck.rec.some((l) => l.startsWith('static '))).toBe(false);
    // the bar's type missing (our mod not installed): the tow runs without the bar, and says so
    // linked statics that turn out to have no parent: placed in the world, as before (the tractor at the same place)
    const world = hook(`NO_LINK = true\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(4)
local tug = STATICS['catcc-tug'].id_
rec(string.format('tug at %.1f %.1f up %.2f own %s', PLACED[tug].f, PLACED[tug].s, PLACED[tug].up, tostring(PLACED[tug].own)))`);
    expect(world.rec.filter((l) => l.startsWith('tug at '))).toEqual([expect.stringMatching(/^tug at 3\d\.\d -[89]\.\d up 8\.67 own false$/)]); // (on its way from where it waits, 36 / -9.5)
    expect(world.logLines).toContain('tow: the tractor (object 33554688): NO PARENT (not linked): placed in the world, where it shimmers against a ship under way');
    const nobar = hook(`NO_BAR_TYPE = true\nJETUP = 10.5\nsetJet(23.13, 33.54, 0, -1)\n${START}click("Tow > Tow me into the hangar (tractor, bar, driver)")\nframes(4)`);
    expect(nobar.says[0]).toContain('the tractor is coming with the tow bar (no driver: catcc-t0 not found) (no tow bar: its type is missing)');
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
      'static catcc-axle 2 type CATCC_AxleMarker_H26 at -10.500 31.085',
      'static catcc-axle 3 type CATCC_AxleMarker_H26 at -10.500 31.075',
      'static catcc-axle 4 type CATCC_AxleMarker_H26 at -10.500 31.076',
      'static catcc-axle 5 type CATCC_AxleMarker_H36 at -10.500 31.076',
      'static catcc-axle 6 type CATCC_AxleMarker_H35 at -10.500 31.076',
    ]);
    expect(r.logLines).toContain('command axle fwd -0.001: noseGear=2.924 axleDown=1.569 axleLen=0.580');
    expect(r.logLines).toContain('command axle up -0.010: noseGear=2.924 axleDown=1.476 axleLen=0.580');
    // it does not follow the jet; "Report" stands it under the jet as it now is (40 m forward, 10 m to starboard, nose forward)
    expect(marks[6]).toBe('static catcc-axle 7 type CATCC_AxleMarker_H35 category ADEquipment linked true to 77 at 42.924 10.000 angle 0.0000 offset true cargo false');
    expect(r.says).toContain("axle finder: the marker axle is 2.924 m ahead of your jet's own position and 1.476 m below it (the rod 0.35 m above the deck). The tow uses these.");
    // the models go from 0.15 to 0.40 m
    expect(marks[7]).toMatch(/^static catcc-axle 8 type CATCC_AxleMarker_H40 /);
    expect(r.says).toContain("axle finder: the marker axle is 2.924 m ahead of your jet's own position and 1.426 m below it (the rod 0.40 m above the deck). (The marker goes from 0.15 to 0.40 m above the deck.)");
    // one marker at a time; put away: taken off the deck
    expect(r.rec).toContain('markers standing 1');
    expect(r.rec.filter((l) => l.startsWith('destroy catcc-axle ')).map((l) => l.slice(19))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(marks.length).toBe(8);
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
    expect(tp[0]).toMatch(/^teleport 10\d id 16777472 to 151\.21 8\.86 up 22\.00 nose -0\.99 -0\.14 right 0\.14 -0\.99$/);
    expect(r.says).toContain('teleport: you are being put on Bow stbd 1 (spot 1, 1.4 m away), facing the way a jet spawned there faces.');
    expect(r.says).toContain("teleport to Bow stbd 1 (the ATC's teleport): you are now 0.0 m from the spot and 0 degrees off its heading: on it.");
    expect(tp.length).toBe(2);
    // The ATC's teleport left the jet where it was (as on 2026-11-15): the aircraft's own ForcePosition is tried, to the
    // same spot, and that one's result is what is said
    expect(r.rec.filter((l) => l.startsWith('forcepos ')).length).toBe(1);
    expect(r.rec.find((l) => l.startsWith('forcepos '))).toMatch(/^forcepos id 16777472 to 117\.92 11\.37 up 22\.00 nose -0\.86 -0\.51$/);
    expect(r.says).toContain("teleport to Bow stbd 3 (the aircraft's own ForcePosition): you are now 0.0 m from the spot and 0 degrees off its heading: on it.");
    expect(r.logLines.some((l) => l.startsWith("teleport: the ATC's teleport left the jet where it was: the aircraft's own ForcePosition tried: called (class .?AVwHumanAircraft@@)"))).toBe(true);
    // neither moves the jet: said
    const none = hook(`ROUTES_SRC = ROUTES_REAL\nTELE_WORKS, FORCE_WORKS = false, false\n${START}setJet(120, 0, 1, 0)\nclick("Our crew > Put me square on the nearest spot (teleport)")\nframes(24)`);
    expect(none.says.some((l) => /^teleport to Bow stbd 3 \(the aircraft's own ForcePosition\): you are now \d+\.\d m from the spot and \d+ degrees off its heading \(it did not put you there\)\.$/.test(l))).toBe(true);
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
    expect(r.says.length).toBe(1);
    expect(r.says[0]).toContain('at mission start: 4 people on your ship');
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
    expect(r.says.length).toBe(1);
    expect(r.says[0]).toContain('at mission start: 4 people on your ship');
    expect(r.rec.filter((l) => l === 'submenu CATCC crew test').length).toBe(1); // the menu came with the player
  });

  it('a new mission gets the menu and the list again', () => {
    const r = hook('HANDLER.onSimulationStart()\nframes(14)\nHANDLER.onSimulationStop()\nMISSION.CATCC_CR = nil\nframes(5)\nHANDLER.onSimulationStart()\nframes(14)');
    expect(r.rec.filter((l) => l === 'submenu CATCC crew test').length).toBe(2);
    expect(r.says.filter((s) => s.includes('at mission start')).length).toBe(2);
  });
});
