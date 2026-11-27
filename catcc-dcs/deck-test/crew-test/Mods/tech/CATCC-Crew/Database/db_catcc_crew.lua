-- CATCC crew test: deck-equipment statics of our own, declared exactly as the CATCC chock and the CATCC route
-- lines are (pilot/Mods/tech/CATCC-Chocks, deck-test/route-lines/Mods/tech/CATCC-RouteLines), which DCS made:
-- a type's name is its model's file name, no spaces, declared here in a Database file run from entry.lua.
-- (2026-11-15: the first three tries declared types named "CATCC axle marker", ... in entry.lua itself, with
-- models named differently, and DCS answered "unknown static" for every one of them.)
--   CATCC_AxleMarker_H15 ... _H40   the axle finder's marker, one for every centimetre of height (a static linked
--                                   to a ship stands on its deck: the height is in the model). Blender-made:
--                                   crew-test/model/build_axle_marker.py
--   CATCC_AxleEnd                   the axle finder's end plate: one either side of the nose gear, for the axle's width
--                                   (Blender-made, the same script)
--   CATCC_Towbar                    the tow bar (crew-test/model/towbar.py, our own .edm writer)
--   CATCC_AxleProbe                 a rod written by our own .edm writer: the axle finder makes it once, out of
--                                   sight, to say in the log whether DCS takes such a model as a static
--   CATCC_WheelChock                the Navy's universal wheel chock (crew-test/model/wheel_chock.py, our own .edm
--                                   writer): placed with its origin on the deck under a wheel's axle, its model
--                                   argument 10 = each block's distance from there in metres (0.012 to 0.36)
--   CATCC_Tiedown                   the Navy's TD-1A aircraft tiedown (crew-test/model/tiedown.py, our own .edm writer):
--                                   placed with its origin on a padeye (the chain's hook), headed level towards the
--                                   aircraft's tiedown fitting (the tensioner's hook); argument 10 = the length to the
--                                   fitting / 4 m (0.512 to 3.240 m), 11 = the chain's rise from the deck / 90 degrees,
--                                   12 = the tensioner's finish (0 yellow, 0.1 red, 0.2 bare metal). Four levels of
--                                   detail in Shapes/CATCC_Tiedown.lods (DCS takes the .lods for the shape's name)
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
deck_static('CATCC_AxleEnd', _('CATCC axle end plate (test)'), 'CATCC_AxleEnd')
deck_static('CATCC_Towbar', _('CATCC tow bar (test)'), 'CATCC_Towbar')
deck_static('CATCC_AxleProbe', _('CATCC axle probe (test)'), 'CATCC_AxleProbe')
deck_static('CATCC_WheelChock', _('CATCC wheel chock'), 'CATCC_WheelChock')
deck_static('CATCC_Tiedown', _('CATCC tiedown'), 'CATCC_Tiedown')
-- CATCC_Flag: a folded US flag for a jet's glareshield (crew-test/model/flag.py, our own .edm writer): its origin under
-- the middle of its long edge, x along that edge; at arguments 0 the user's pose on a Hornet (2.68 m over the deck, pitch
-- 7, lean -45); argument 10 = its height over the deck / 2.68 m - 1, 11 and 12 = pitch and lean from those / 90 degrees.
-- Four levels of detail in Shapes/CATCC_Flag.lods (crewtest_flag.lua puts it on the panel's "Flag" page)
deck_static('CATCC_Flag', _('CATCC folded flag'), 'CATCC_Flag')
