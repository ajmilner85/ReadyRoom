-- PARKED EXPERIMENT (2026-11-13): only installed with install.ps1 -Experiments.
-- CATCC wheel chocks: static objects (a yellow chock, a wall, a block; as deck equipment and as
-- Cargo) put at a jet's wheels, linked to the carrier, to stop it taxiing by collision. It did not
-- work: deck-equipment statics never collide with the jet, and Cargo statics damage what touches
-- them (collapsed main gear) instead of stopping it. Results in Database/db_catcc_chocks.lua and
-- Scripts/CATCC/chocktest.lua. What holds a jet now: its own chocks, kept in by the pilot hook.
-- Every PC in a session would need this mod (the server and each pilot).
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
