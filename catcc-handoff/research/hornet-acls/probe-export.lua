-- CATCC research probe: the F/A-18C's own ICLS / ACLS indications (NOT shipped, not part of the mod).
--
-- Logs, for the Hornet you are flying, every candidate source of the cockpit's landing-aid
-- indications to dcs.log (lines tagged CATCC-ACLS-PROBE), so we can see which of them carry the
-- needles and cues and in what range. It only reads; it sends nothing and changes nothing.
--
-- It runs in either of two Lua environments (it tells which in its first line):
--   A) the export environment: one line added at the END of Saved Games\DCS\Scripts\Export.lua
--        local catccProbeLfs = require('lfs'); dofile(catccProbeLfs.writedir() .. 'Scripts/catcc-acls-probe.lua')
--      (the file itself copied to Saved Games\DCS\Scripts\catcc-acls-probe.lua)
--   B) the GameGUI hook environment (where the CATCC pilot mod lives): the file copied to
--        Saved Games\DCS\Scripts\Hooks\catcc-acls-probe.lua
--   Both at once is fine: each line says "env=export" or "env=hook".
-- See ../hornet-acls.md, "Probe", for the test flight.
--
-- Every 0.5 s:  SAI pointers (args 211 / 212), SAI OFF flag (209), ILS channel / UFC-MAN (352 / 353),
--               LoGetGlideDeviation / LoGetSideDeviation, HUD windows 5 / 6 text, ILS needle and
--               ACL tadpole element presence on the HUD, the DDI ACL page windows.
-- Every 5 s:    the cockpit params whose names look landing-aid related (only when they changed),
--               every cockpit argument 0..999 that moved by more than 0.02 since the last scan.
-- Once (20 s after the cockpit appears) and once more the first time the SAI pointers leave their
-- rest value: a full dump of list_cockpit_params() and list_indication(0..6) to
-- Saved Games\DCS\Logs\catcc-acls-probe-dump.txt.

local TAG = 'CATCC-ACLS-PROBE'
local isHook = type(DCS) == 'table' and type(DCS.setUserCallbacks) == 'function'
local ENV = isHook and 'hook' or 'export'

local function logi(m)
  if log and log.write then pcall(log.write, TAG, log.INFO, m) else pcall(print, TAG .. ': ' .. m) end
end

-- a function by name: the GUI's Export table first (hook), then the globals (export environment)
local function fn(name)
  if isHook and type(Export) == 'table' and type(Export[name]) == 'function' then return Export[name] end
  local g = _G[name]
  if type(g) == 'function' then return g end
  return nil
end

local function call(name, ...)
  local f = fn(name)
  if not f then return nil, 'absent' end
  local ok, a, b, c = pcall(f, ...)
  if not ok then return nil, 'error: ' .. tostring(a) end
  return a, b, c
end

local function num(v)
  if type(v) ~= 'number' then return tostring(v) end
  return string.format('%.3f', v)
end

local function now()
  if isHook and DCS.getModelTime then
    local ok, t = pcall(DCS.getModelTime)
    if ok and t then return t end
  end
  local t = call('LoGetModelTime')
  return tonumber(t) or os.clock()
end

local function writedir()
  return (lfs and lfs.writedir and lfs.writedir()) or ''
end

-- ---- the cockpit
local function mainPanel()
  local d = call('GetDevice', 0)
  if type(d) == 'table' or type(d) == 'userdata' then return d end
  return nil
end

local function arg(dev, n)
  local ok, v = pcall(function() return dev:get_argument_value(n) end)
  if ok then return v end
  return nil
end

-- list_indication(n) -> { name = text } (names of every element it lists, text may be '')
local function indication(n)
  local s = call('list_indication', n)
  if type(s) ~= 'string' then return nil end
  local out, name, buf = {}, nil, {}
  local function flush()
    if name then out[name] = table.concat(buf, ' ') end
    name, buf = nil, {}
  end
  local afterSep = false
  for line in s:gmatch('[^\r\n]+') do
    if line:match('^%-%-%-%-%-%-%-%-') then
      flush()
      afterSep = true
    elseif afterSep then
      name, afterSep = line, false
    elseif name and line ~= '}' and not line:match('^children are') then
      buf[#buf + 1] = line
    end
  end
  flush()
  return out, s
end

local INTERESTING = { 'ILS', 'ACL', 'Window5', 'Window6', 'Director', 'Tadpole', 'NWS_cue', 'Steering' }
local function interesting(name)
  for _, p in ipairs(INTERESTING) do if name:find(p, 1, true) then return true end end
  return false
end

local function indSummary(n)
  local t = indication(n)
  if not t then return 'n/a' end
  local parts = {}
  for k, v in pairs(t) do
    if interesting(k) then parts[#parts + 1] = k .. (v ~= '' and ('="' .. v .. '"') or '') end
  end
  table.sort(parts)
  return #parts > 0 and table.concat(parts, ' ') or '-'
end

local PARAM_PATTERNS = { 'ils', 'icls', 'acl', 'link4', 'link_4', 'glide', 'locali', 'sai', 'tadpole', 'cpl' }
local function paramsFiltered()
  local s = call('list_cockpit_params')
  if type(s) ~= 'string' then return nil end
  local keep = {}
  for line in s:gmatch('[^\r\n]+') do
    local l = line:lower()
    for _, p in ipairs(PARAM_PATTERNS) do
      if l:find(p, 1, true) then keep[#keep + 1] = line; break end
    end
  end
  return table.concat(keep, ' | ')
end

local function dump(why)
  local path = writedir() .. 'Logs/catcc-acls-probe-dump.txt'
  local f = io.open(path, 'a')
  if not f then logi('cannot write ' .. path); return end
  f:write(string.format('==== %s env=%s t=%.1f\n', why, ENV, now()))
  local p = call('list_cockpit_params')
  f:write('---- list_cockpit_params\n' .. tostring(p) .. '\n')
  for i = 0, 6 do
    local _, raw = indication(i)
    f:write('---- list_indication(' .. i .. ')\n' .. tostring(raw) .. '\n')
  end
  f:close()
  logi('dump written (' .. why .. ') to ' .. path)
end

-- ---- the probe
local P = { nextFast = 0, nextSlow = 0, seenAt = nil, dumped = false, movedDump = false,
            lastParams = nil, scan = nil, rest211 = nil, rest212 = nil, saidNoPanel = false }

local function startLine()
  local parts = { 'probe loaded env=' .. ENV }
  for _, n in ipairs({ 'GetDevice', 'list_indication', 'list_cockpit_params', 'GetIndicator',
                       'LoGetGlideDeviation', 'LoGetSideDeviation', 'LoGetSelfData',
                       'LoIsOwnshipExportAllowed', 'LoIsObjectExportAllowed', 'LoIsSensorExportAllowed' }) do
    parts[#parts + 1] = n .. '=' .. (fn(n) and 'yes' or 'no')
  end
  logi(table.concat(parts, ' '))
end

local function fast(t, dev)
  local a211, a212, a209 = arg(dev, 211), arg(dev, 212), arg(dev, 209)
  if P.rest211 == nil then P.rest211, P.rest212 = a211, a212 end
  local gd, gdErr = call('LoGetGlideDeviation')
  local sd, sdErr = call('LoGetSideDeviation')
  logi(string.format('env=%s t=%.1f sai211=%s sai212=%s saiOff209=%s ch352=%s ufcman353=%s glideDev=%s sideDev=%s | HUD: %s | LDDI: %s | RDDI: %s',
    ENV, t, num(a211), num(a212), num(a209), num(arg(dev, 352)), num(arg(dev, 353)),
    gd ~= nil and num(gd) or tostring(gdErr), sd ~= nil and num(sd) or tostring(sdErr),
    indSummary(1), indSummary(2), indSummary(3)))
  if not P.movedDump and type(a211) == 'number' and type(P.rest211) == 'number'
     and (math.abs(a211 - P.rest211) > 0.05 or math.abs((a212 or 0) - (P.rest212 or 0)) > 0.05) then
    P.movedDump = true
    dump('SAI pointers left rest')
  end
end

local function slow(dev)
  local p = paramsFiltered()
  if p ~= nil and p ~= P.lastParams then
    P.lastParams = p
    logi('env=' .. ENV .. ' params: ' .. (p ~= '' and p:sub(1, 3000) or '(none matched)'))
  elseif p == nil and P.lastParams == nil then
    P.lastParams = false
    logi('env=' .. ENV .. ' list_cockpit_params not available here')
  end
  local cur, moved = {}, {}
  for n = 0, 999 do
    local v = arg(dev, n)
    if type(v) == 'number' then
      cur[n] = v
      if P.scan and P.scan[n] and math.abs(v - P.scan[n]) > 0.02 then
        moved[#moved + 1] = n .. ':' .. num(P.scan[n]) .. '>' .. num(v)
      end
    end
  end
  if P.scan and #moved > 0 then
    logi('env=' .. ENV .. ' args moved: ' .. table.concat(moved, ' ', 1, math.min(#moved, 60)))
  end
  P.scan = cur
  local self = call('LoGetSelfData')
  if type(self) == 'table' then logi('env=' .. ENV .. ' self=' .. tostring(self.Name)) end
  if not P.selfAllowed then
    P.selfAllowed = true
    logi(string.format('env=%s export allowed: ownship=%s object=%s sensor=%s', ENV,
      tostring((call('LoIsOwnshipExportAllowed'))), tostring((call('LoIsObjectExportAllowed'))),
      tostring((call('LoIsSensorExportAllowed')))))
    local gi = call('GetIndicator', 1)
    if gi ~= nil then
      local mt = getmetatable(gi)
      local keys = {}
      if type(mt) == 'table' and type(mt.__index) == 'table' then
        for k in pairs(mt.__index) do keys[#keys + 1] = tostring(k) end
      end
      table.sort(keys)
      logi('env=' .. ENV .. ' GetIndicator(1)=' .. type(gi) .. ' methods: ' .. table.concat(keys, ','))
    end
  end
end

local function frame()
  local t = now()
  if t < P.nextFast then return end
  P.nextFast = t + 0.5
  local dev = mainPanel()
  if not dev then
    if not P.saidNoPanel then P.saidNoPanel = true; logi('env=' .. ENV .. ' no cockpit (GetDevice(0) nil)') end
    P.seenAt = nil
    return
  end
  P.saidNoPanel = false
  if not P.seenAt then P.seenAt = t; P.dumped = false; P.movedDump = false; P.rest211 = nil; P.scan = nil end
  fast(t, dev)
  if t >= P.nextSlow then
    P.nextSlow = t + 5
    slow(dev)
  end
  if not P.dumped and t - P.seenAt > 20 then
    P.dumped = true
    dump('20 s in the cockpit')
  end
end

if isHook then
  DCS.setUserCallbacks({
    onSimulationStart = function()
      P.nextFast, P.nextSlow, P.seenAt, P.selfAllowed = 0, 0, nil, nil
      pcall(startLine) -- again: the GUI's Export table is filled in by the time a mission starts
    end,
    onSimulationFrame = function()
      local ok, err = pcall(frame)
      if not ok and not P.errSaid then P.errSaid = true; logi('error: ' .. tostring(err)) end
    end,
  })
  startLine()
else
  -- chain whatever Export.lua already set up (Tacview, SRS, DCS-BIOS ...)
  local prevStart, prevAfter = LuaExportStart, LuaExportAfterNextFrame
  LuaExportStart = function()
    if prevStart then pcall(prevStart) end
    P.nextFast, P.nextSlow, P.seenAt, P.selfAllowed = 0, 0, nil, nil
    startLine()
  end
  LuaExportAfterNextFrame = function()
    if prevAfter then pcall(prevAfter) end
    local ok, err = pcall(frame)
    if not ok and not P.errSaid then P.errSaid = true; logi('error: ' .. tostring(err)) end
  end
end
