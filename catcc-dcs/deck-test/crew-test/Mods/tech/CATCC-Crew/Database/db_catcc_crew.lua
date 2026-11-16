-- CATCC crew test: deck-equipment statics of our own, declared exactly as the CATCC chock and the CATCC route
-- lines are (pilot/Mods/tech/CATCC-Chocks, deck-test/route-lines/Mods/tech/CATCC-RouteLines), which DCS made:
-- a type's name is its model's file name, no spaces, declared here in a Database file run from entry.lua.
-- (2026-11-15: the first three tries declared types named "CATCC axle marker", ... in entry.lua itself, with
-- models named differently, and DCS answered "unknown static" for every one of them.)
--   CATCC_AxleMarker_H15 ... _H40   the axle finder's marker, one for every centimetre of height (a static linked
--                                   to a ship stands on its deck: the height is in the model). Blender-made:
--                                   crew-test/model/build_axle_marker.py
--   CATCC_Towbar                    the tow bar (crew-test/model/towbar.py, our own .edm writer)
--   CATCC_AxleProbe                 a rod written by our own .edm writer: the axle finder makes it once, out of
--                                   sight, to say in the log whether DCS takes such a model as a static
local function deck_static(name, displayName, shape)
  local u = {}
  u.shape_table_data =
  {
    {
      file        = shape,
      life        = 100,
      username    = name,
      desrt       = 'self',
      classname   = 'lLandVehicle',
      positioning = 'BYNORMAL',
    },
  }
  u.Name         = name
  u.DisplayName  = displayName
  u.Life         = 100
  u.Rate         = 1
  u.category     = 'ADEquipment'
  u.isPutToWater = false
  u.mapclasskey  = 'P0091000076'
  u.attribute    = { wsType_Static, wsType_Standing }
  add_surface_unit(u)
  GT = nil
end

-- (no loop variable called _: that would hide DCS's _() for display names)
for cm = 15, 40 do
  local name = string.format('CATCC_AxleMarker_H%02d', cm)
  deck_static(name, _(string.format('CATCC axle marker, %d cm (test)', cm)), name)
end
deck_static('CATCC_Towbar', _('CATCC tow bar (test)'), 'CATCC_Towbar')
deck_static('CATCC_AxleProbe', _('CATCC axle probe (test)'), 'CATCC_AxleProbe')
