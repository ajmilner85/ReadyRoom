-- TEST ONLY. CATCC deck route lines: the Supercarrier's spawn-spot -> catapult routes (GT.TaxiForTORoutes)
-- painted on the deck as static objects linked to the carrier, white as DCS ships them, red with the
-- director test's bend. Placed from F10 > CATCC route lines (Scripts/CATCC/routelines.lua).
-- Models built by catcc-dcs/deck-test/route-lines/build_route_lines.py; installed by install.ps1 there.
declare_plugin('CATCC-RouteLines', {
  installed = true,
  dirName   = current_mod_path,
  version   = '0.1',
  state     = 'installed',
  info      = _('CATCC deck route lines (test)'),
})

mount_vfs_model_path(current_mod_path .. '/Shapes')
dofile(current_mod_path .. '/Database/db_catcc_route_lines.lua')

plugin_done()
