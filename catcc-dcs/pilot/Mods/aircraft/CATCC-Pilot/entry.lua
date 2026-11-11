-- CATCC pilot mod: lets PriFly (the CATCC app) hold your catapult shot until it clears you.
-- Adds one small Lua cockpit device to every aircraft type; it sets a spare model draw argument
-- that the deck crew's launch sequence (CoreMods/tech/USS_Nimitz/scripts/common.xml, patched by
-- install.ps1) waits on after your salute. Nothing here ever holds you unless PriFly says so.
local selfId = 'CATCC-Pilot'

declare_plugin(selfId, {
  installed        = true,
  dirName          = current_mod_path,
  displayName      = 'CATCC Pilot',
  shortName        = 'CATCC-Pilot',
  fileMenuName     = 'CATCC Pilot',
  version          = '0.1.0',
  state            = 'installed',
  developerName    = 'ReadyRoom',
  info             = 'PriFly launch clearance: the shooter holds your catapult shot until PriFly clears it.',
  load_immediately = true,
})

-- every aircraft type ('*') gets the device in Cockpit/Scripts/device_init.lua
add_plugin_systems(selfId, '*', current_mod_path .. '/Cockpit/Scripts/', {})

plugin_done()
