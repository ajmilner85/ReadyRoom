-- CATCC_Chock: a Cargo static, declared the way ED's own modules add cargos (C-130-Assets
-- db_C130_Cargos.lua add_cargo). Cargos are the statics seen to physically push the jet (stock logs,
-- barrels); declared as airfield equipment (ADEquipment, v1) the jet drove straight through it.
-- couldCargo false: not a sling-load / C-130 cargo. No Countries list: any country can place it.
local u = {}
u.Name           = 'CATCC_Chock'
u.DisplayName    = _('CATCC Wheel Chock')
u.ShapeName      = 'CATCC_Chock'
u.Life           = 100
u.Rate           = 1
u.mass           = 500
u.minMass        = 500
u.maxMass        = 500
u.canExplode     = false
u.couldCargo     = false
u.mapclasskey    = 'P0091000352'
u.attribute      = { 'Cargos' }
u.category       = 'Cargo'
u.isPutToWater   = false
u.shape_table_data =
{
  {
    file        = 'CATCC_Chock',
    life        = 100,
    username    = 'CATCC_Chock',
    desrt       = 'self',
  },
}
add_surface_unit(u)
GT = nil
