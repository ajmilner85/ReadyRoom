dofile(LockOn_Options.script_path .. "devices.lua")

creators = {
  [devices.CATCC_GATE] = { "avLuaDevice", LockOn_Options.script_path .. "catcc_gate.lua" },
}
