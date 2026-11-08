-- Loader for the CATCC export hook. The real code lives in Scripts/CATCC/ so it can be updated
-- without touching Hooks. Errors are logged and contained.
local ok, err = pcall(function()
  dofile(lfs.writedir() .. 'Scripts/CATCC/catcc.lua')
end)
if not ok then
  log.write('CATCC', log.ERROR, 'failed to load: ' .. tostring(err))
end
