-- Loader for the CATCC crew test hook (TEST ONLY; it does nothing unless Config\CATCC-test.lua has
-- crewTest = true). The code lives in Scripts/CATCC/crewtest_hook.lua. Errors are logged and contained.
local ok, err = pcall(function()
  dofile(lfs.writedir() .. 'Scripts/CATCC/crewtest_hook.lua')
end)
if not ok then
  log.write('CATCC-CREW', log.ERROR, 'failed to load: ' .. tostring(err))
end
