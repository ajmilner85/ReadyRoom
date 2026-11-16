-- CATCC deck route lines: one deck-equipment static per route and look, declared like the CATCC chock
-- (pilot/Mods/tech/CATCC-Chocks): deck equipment never collides with a jet, so these can be taxied over.
-- CATCC_RouteNN_Stock (white) / _Bent (red) / _Moved (blue, yellow X on the stock spawn spot),
-- NN = the route's place in GT.TaxiForTORoutes. The models have no collision shell and no collision lines.
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
for n = 1, 16 do
  for li, look in ipairs({ 'Stock', 'Bent', 'Moved' }) do
    local name = string.format('CATCC_Route%02d_%s', n, look)
    local what = ({ Stock = 'stock', Bent = 'test bend', Moved = 'moved spawn' })[look]
    deck_static(name, _(string.format('CATCC route %d line (%s)', n, what)), name)
  end
end
