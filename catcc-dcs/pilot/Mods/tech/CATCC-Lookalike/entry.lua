-- CATCC lookalike: a static that looks like a parked Hornet and does not count as an aircraft. It stands on a deck
-- spot from the moment a player takes the slot there until his jet is on the spot, so that nobody on the deck sees
-- the parked aircraft vanish and his jet appear seconds later (Scripts/CATCC/crewtest_demo.lua, LOOK).
-- Every PC in a session needs this mod (the server and each pilot): pilot/install.ps1 installs it.
declare_plugin('CATCC-Lookalike', {
  installed = true,
  dirName   = current_mod_path,
  version   = '0.1',
  state     = 'installed',
  info      = _('CATCC lookalike Hornet (deck spots)'),
})

mount_vfs_model_path(current_mod_path .. '/Shapes')
dofile(current_mod_path .. '/Database/db_catcc_lookalike.lua')

plugin_done()
