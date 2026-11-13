-- CATCC_Chock: deck equipment static, defined like the stock carrier deck vehicles
-- (CoreMods/tech/USS_Nimitz/Database/db_ground_objects.lua, support_unit), which sit on carrier decks.
-- No Countries list: any country can place it (the carrier's own country spawns it).
local u = {}
u.shape_table_data =
{
  {
    file        = 'CATCC_Chock',
    life        = 100,
    username    = 'CATCC_Chock',
    desrt       = 'self',
    classname   = 'lLandVehicle',
    positioning = 'BYNORMAL',
  },
}
u.Name         = 'CATCC_Chock'
u.DisplayName  = _('CATCC Wheel Chock')
u.Life         = 100
u.Rate         = 1
u.category     = 'ADEquipment'
u.isPutToWater = false
u.mapclasskey  = 'P0091000076'
u.attribute    = { wsType_Static, wsType_Standing }
add_surface_unit(u)
GT = nil
