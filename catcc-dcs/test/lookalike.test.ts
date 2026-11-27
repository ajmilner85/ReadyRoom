// The CATCC lookalike Hornet's mod (pilot/Mods/tech/CATCC-Lookalike): its entry.lua run under fengari with only what
// DCS gives a mod's entry (no pcall), its declarations, and its models (.lods files naming the Hornet's own models).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const MOD = path.resolve(__dirname, '../pilot/Mods/tech/CATCC-Lookalike');

function run(): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const files = {
    entry: fs.readFileSync(path.join(MOD, 'entry.lua'), 'utf8'),
    db: fs.readFileSync(path.join(MOD, 'Database/db_catcc_lookalike.lua'), 'utf8'),
  };
  lua.lua_pushstring(L, to_luastring(files.entry));
  lua.lua_setglobal(L, to_luastring('ENTRY'));
  lua.lua_pushstring(L, to_luastring(files.db));
  lua.lua_setglobal(L, to_luastring('DB'));
  const harness = `
local out = {}
local function rec(s) out[#out + 1] = s end
-- (what a mod's entry.lua gets: no pcall)
pcall = nil
current_mod_path = 'M'
wsType_Static, wsType_Standing = 1, 2
function _(s) return s end
function declare_plugin(name, t) rec('plugin ' .. name .. ' ' .. tostring(t.dirName)) end
function mount_vfs_model_path(p) rec('model ' .. p) end
function plugin_done() rec('done') end
function dofile(p)
  if p ~= 'M/Database/db_catcc_lookalike.lua' then error('dofile ' .. p) end
  return assert(load(DB, 'db'))()
end
function add_surface_unit(u)
  local s = u.shape_table_data[1]
  rec(string.format('type %s file %s class %s category %s livery_entry %s', u.Name, s.file, s.classname, u.category, tostring(u.livery_entry)))
end
assert(load(ENTRY, 'entry'))()
return table.concat(out, '\\n')
`;
  const status = lauxlib.luaL_dostring(L, to_luastring(harness));
  const text = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(text);
  return text.split('\n');
}

describe('CATCC lookalike Hornet mod', () => {
  const out = run();
  it('declares its two types as deck equipment, each named as its model file, and reaches plugin_done', () => {
    expect(out).toEqual([
      'plugin CATCC-Lookalike M',
      'model M/Shapes',
      'type CATCC_HornetLook file CATCC_HornetLook class lLandVehicle category ADEquipment livery_entry FA-18C_hornet',
      'type CATCC_HornetLookF file CATCC_HornetLookF class lLandVehicle category ADEquipment livery_entry nil',
      'done',
    ]);
  });
  it("each model is the Hornet's own six levels of detail, with no collision shell, in a file of the type's name", () => {
    for (const name of ['CATCC_HornetLook', 'CATCC_HornetLookF']) {
      const lods = fs.readFileSync(path.join(MOD, `Shapes/${name}.lods`), 'utf8');
      expect(lods).not.toMatch(/--/); // (DCS's own .lods files carry no comments)
      expect([...lods.matchAll(/\{"([^"]+)",\s*([\d.]+)\}/g)].map((m) => `${m[1]} ${Number(m[2])}`)).toEqual([
        'fa-18c.edm 30', 'fa-18c_lod1.edm 150', 'fa-18c_lod2.edm 350', 'fa-18c_lod3.edm 700', 'fa-18c_lod4.edm 2000', 'fa-18c_lod5.edm 50000',
      ]);
      expect(lods).not.toContain('collision_shell');
    }
  });
});
