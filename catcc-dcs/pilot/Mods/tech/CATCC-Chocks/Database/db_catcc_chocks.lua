-- CATCC deck statics. No Countries list: any country can place them (the carrier's own country does).
--
-- CATCC_Chock        the wheel chock (yellow block 0.36 x 0.30 x 0.18, sloped both faces), deck equipment,
--                    declared like the stock carrier deck vehicles (CoreMods/tech/USS_Nimitz/Database/
--                    db_ground_objects.lua, support_unit).
-- CATCC_Wall         TEST: a wall 0.10 thick x 0.50 wide x 0.80 high, same declaration. The Hornet's only
--                    collision lines near the wheels start about 0.4 m above the deck (FA-18C_Collision.edm:
--                    the gear leg and the wheel line), so a chock-height shell never touches them.
-- CATCC_Wall_Cargo   TEST: the same wall as a Cargo, declared the way ED's modules add cargos (C-130-Assets
--                    db_C130_Cargos.lua add_cargo). The stock statics that pushed the jet (logs, barrels)
--                    are Cargos. A Cargo needs <DCS>\Data\<shape>.csv (sling-load aerodynamics; DCS logs
--                    "The file with cargo parameters doesn't exist" without it): the installer copies
--                    pilot\Data\CATCC_Wall.csv there.
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

local function cargo_static(name, displayName, shape, mass)
  local u = {}
  u.Name           = name
  u.DisplayName    = displayName
  u.ShapeName      = shape
  u.ShapeNameDstr  = shape
  u.Life           = 100
  u.Rate           = 1
  u.mass           = mass
  u.minMass        = mass
  u.maxMass        = mass
  u.canExplode     = false
  u.couldCargo     = false
  u.mapclasskey    = 'P0091000352'
  u.attribute      = { 'Cargos' }
  u.category       = 'Cargo'
  u.shape_table_data =
  {
    {
      file     = shape,
      life     = 100,
      username = name,
      desrt    = 'self',
    },
  }
  add_surface_unit(u)
  GT = nil
end

deck_static('CATCC_Chock', _('CATCC Wheel Chock'), 'CATCC_Chock')
deck_static('CATCC_Wall', _('CATCC Test Wall'), 'CATCC_Wall')
cargo_static('CATCC_Wall_Cargo', _('CATCC Test Wall (cargo)'), 'CATCC_Wall', 500)
