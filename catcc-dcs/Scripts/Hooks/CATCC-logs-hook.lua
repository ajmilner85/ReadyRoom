-- Loader for CATCC's live logs (Scripts/CATCC/catcc_logs.lua): this PC's DCS and CATCC logs sent to SDOBot as they
-- are written. Does nothing unless Config\CATCC-logs.lua is there. Errors are logged and contained.
local ok, err = pcall(function()
  dofile(lfs.writedir() .. 'Scripts/CATCC/catcc_logs.lua')
end)
if not ok then
  log.write('CATCC-LOGS', log.ERROR, 'failed to load: ' .. tostring(err))
end
