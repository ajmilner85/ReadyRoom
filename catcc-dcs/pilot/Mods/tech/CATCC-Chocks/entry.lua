-- CATCC wheel chocks: a static object (yellow block with a collision shell) that PriFly puts at a
-- jet's wheels, linked to the carrier, so the jet can't taxi until the taxi instruction.
-- Every PC in the session needs it (the server and each pilot): the CATCC pilot installer copies it.
-- The model is built by catcc-dcs/chock-model/build_chock.py (Blender + ED's EDM exporter).
declare_plugin('CATCC-Chocks', {
  installed = true,
  dirName   = current_mod_path,
  version   = '0.1',
  state     = 'installed',
  info      = _('CATCC wheel chocks (PriFly)'),
})

mount_vfs_model_path(current_mod_path .. '/Shapes')
dofile(current_mod_path .. '/Database/db_catcc_chocks.lua')

plugin_done()
