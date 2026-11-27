-- The CATCC lookalike Hornet: deck equipment (as the CATCC chock and the crew test's tow bar are declared, which DCS
-- made) drawn with the Hornet's own model. Each type's model is a file of its own name, Shapes/<type>.lods, which
-- lists the Hornet's own fa-18c.edm and its lower-detail models (CoreMods/aircraft/FA-18C/Shapes, mounted for every
-- mission; none copied), with no collision shell: DCS makes a static type of ours only when it is named as its model
-- file is (the first run, 2026-11-24, "unknown static" with the shape "fa-18c" itself; the axle finder's types,
-- 2026-11-15). Deck equipment, not an aircraft: the chock tests of 2026-11-13 found that deck-equipment statics never
-- collide with a jet, so the player's jet can appear inside it; and whether DCS keeps a jet off a spot such a static
-- stands on is what the first runs are to show.
-- Its paint, two ways (which one DCS honours for deck equipment is not known yet: the first run shows):
--   CATCC_HornetLook    livery_entry = the Hornet's: the Hornet's own liveries (DCS's own aircraft declare
--                       livery_entry so, to share another type's liveries; no ground type does)
--   CATCC_HornetLookF   no livery_entry: a type's liveries are looked for in Liveries/<type>, as for the ground
--                       units the squadron paints; pilot/lookalike-liveries.ps1 makes one there for each Hornet
--                       livery in Saved Games, pointing at that livery's own textures
-- The board number, the wings folded, the chocks and each livery's own custom_args (which places show the number)
-- are model arguments: the demo writes them, as it does on its static Hornets.
local function lookalike(name, displayName, liveryEntry)
  local u = {}
  u.shape_table_data =
  {
    {
      file        = name,
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
  u.livery_entry = liveryEntry
  add_surface_unit(u)
  GT = nil
end

lookalike('CATCC_HornetLook', _('CATCC lookalike Hornet'), 'FA-18C_hornet')
lookalike('CATCC_HornetLookF', _('CATCC lookalike Hornet (own liveries)'), nil)
