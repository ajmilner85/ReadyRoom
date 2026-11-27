-- TEST ONLY. CATCC crew test: can a mod of ours give DCS's deck crew animation clips and character
-- models of our own? (crew-test/install.ps1 copies this folder to Saved Games\DCS\Mods\tech.)
--
-- How DCS's own modules do it (their entry.lua files): each mounts an animations path, a models path,
-- textures and liveries. An animations path holds one folder per skeleton ("typeV" for the F/A-18C
-- pilot figure, CoreMods/aircraft/FA-18C/animations/animations/typeV/*.fbx, one FBX per clip, plus
-- graph/*.lua for states, loop ranges and blend spaces). The deck crew's animation list contains the
-- pilot figure's clips (f18_0_init, f18_520_salut_l, ...), which exist only in the F/A-18C module's
-- folder: so the deck crew uses skeleton typeV too, and clips mounted by ANOTHER module reach it.
--
-- The test:
--   animations/typeV/catcc_test_clip.fbx   a clip under a name of our own (install.ps1 puts a copy of the
--                                          pilot's F18_520_Salut_L.fbx there, from this PC's DCS).
--                                          The crew test hook says at mission start whether
--                                          "catcc_test_clip" is in the deck crew's animation list, and
--                                          F10 > Target: signal > Our own clip plays it.
--   models/catcc_test_pilot.chanimgpu      a character model under a name of our own (the pilot figure's
--                                          mesh, same skeleton). director-test.ps1 -Crew Model gives one
--                                          added crew member this model.
declare_plugin('CATCC-Crew', {
  installed = true,
  dirName   = current_mod_path,
  version   = '0.1',
  state     = 'installed',
  info      = _('CATCC crew test: an animation clip and a character model of our own'),
})

mount_vfs_animations_path(current_mod_path .. '/animations')
mount_vfs_model_path(current_mod_path .. '/models')
-- the tow bar's and the wheel chock's models and textures (crew-test/model/towbar.py, wheel_chock.py write them)
mount_vfs_model_path(current_mod_path .. '/Shapes')
mount_vfs_texture_path(current_mod_path .. '/Shapes/textures')

-- Static object types of our own (the axle finder's markers, the tow bar, the wheel chock), each drawn with a model of our own
-- in Shapes/: declared in Database/db_catcc_crew.lua, the way the CATCC chock and route line mods do it.
-- (DCS runs a mod's entry.lua without pcall and the other protected calls, and with _ as its translation
-- function: a test runs this file with only what a mod's entry gets.)
dofile(current_mod_path .. '/Database/db_catcc_crew.lua')

plugin_done()
