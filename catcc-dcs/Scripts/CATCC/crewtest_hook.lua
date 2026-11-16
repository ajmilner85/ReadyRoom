-- CATCC crew test hook (DCS GameGUI hook environment, Lua 5.1). TEST ONLY.
--
-- Loaded by Scripts/Hooks/CATCC-crewtest-hook.lua; does nothing unless Saved Games\DCS\Config\CATCC-test.lua
-- has crewTest = true (deck-test/crew-test/install.ps1 sets it). The question: can code of ours see and
-- command the Supercarrier's deck crew characters? The work is done by the native module
-- (Scripts\CATCC\bin\catcc_crew.dll, source deck-test/crew-test/native/catcc_crew.cpp); this file
--   * installs the F10 menu into the mission (Scripts/CATCC/crewtest.lua) and takes its commands,
--   * lists the people on deck once, when the simulation of each mission has run for 8 s (so flying a
--     mission with the deck crew option off already answers "who is there without it"); if the quick
--     scan finds nobody it goes on to the memory scan by itself,
--   * keeps to the people of the PLAYER'S ship: every carrier in a mission has its own full crew at the
--     same ship coordinates (2026-11-14: two carriers, and "the nearest yellow shirt" was the other
--     ship's, who then walked off his deck towards ours),
--   * runs each command on a target person and then watches him for a while (where he goes, which
--     states he passes through), so the result can be read afterwards,
--   * records, once a second, every state change and movement of everyone on the player's ship, and the
--     jet's position: the native choreography while the jet taxies ends up in the log without anyone asking,
--   * records, twice a second, which signal animation each of them plays (name, length, loop values,
--     blend-space coordinates): follow DCS's own directors once and the log holds their whole vocabulary,
--   * gives the directors' signals as DCS's own directors play them (recorded with the above): blend
--     spaces whose torso angle follows the pilot, attention on taking the jet, pass control on handing
--     it over; and a night mode (light wands, arm pose, the "night_" set),
--   * has an automatic signal test on a person of ours: every signal in turn, day and night, watched
--     through the same readout, so the log says what played as sent,
--   * has a small demo of directors of our own: one or two people of ours bring the jet 12 m ahead
--     with attention / come ahead / left / right / pass control / stop worked out here,
--   * marshals the jet to a catapult picked from the menu: people of ours stationed along a taxi route
--     from PriFly's taxi network (Scripts/CATCC/crewtest_routes.lua), handing the jet from one to the
--     next up to the catapult's start box, where the catapult's own crew takes over,
--   * says what happened on screen and writes everything to Saved Games\DCS\Logs\catcc-crewtest.log
--     (appended, flushed line by line: it survives a crash, and the native module writes its own
--     lines to the same file before and after every call into DCS).
-- Everything runs inside pcall: an error here must never affect DCS.

local writedir = (lfs and lfs.writedir and lfs.writedir()) or ''
local unpack = unpack or table.unpack
local atan2 = math.atan2 or math.atan

do
  local on = false
  local f = loadfile(writedir .. 'Config/CATCC-test.lua')
  if f then
    local ok, t = pcall(f)
    on = ok and type(t) == 'table' and t.crewTest == true
  end
  if not on then return end
end

local LOG = writedir .. 'Logs/catcc-crewtest.log'
local STATE = 'server' -- net.dostring_in state that reaches the mission scripting environment

local function logLine(s)
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S'), ' hook    ', s, '\n')
    f:close()
  end
end
local function info(s)
  logLine(s)
  if log and log.write then log.write('CATCC-CREW', log.INFO, s) end
end
local function now() return (DCS and DCS.getRealTime and DCS.getRealTime()) or os.clock() end
local function dostring(code) return net.dostring_in(STATE, code) end

-- on screen (20 s) and in the log
-- On-screen messages can be switched off (F10 > Tow > Messages on screen: hide / show): for filming. Hidden, every
-- message still goes to the log ("SAY (not shown) ..."). Back on with every new mission.
local quiet = false
local function say(text, secs)
  if quiet then return info('SAY (not shown) ' .. text) end
  info('SAY ' .. text)
  pcall(dostring, string.format('trigger.action.outText(%q, %d)', 'CATCC crew test: ' .. text, secs or 20))
end

-- ---------------------------------------------------------------- the native module
local native, nativeWhy
do
  local path = writedir .. 'Scripts\\CATCC\\bin\\catcc_crew.dll'
  local ok, loader, err = pcall(package.loadlib, path, 'luaopen_catcc_crew')
  if ok and loader then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' then native = m else nativeWhy = 'it did not start: ' .. tostring(m) end
  else
    nativeWhy = tostring(ok and err or loader)
  end
  logLine('================ DCS started; crew test hook loaded ================')
  if native then
    pcall(native.setlog, LOG)
    local ok3, inf = pcall(native.info)
    if ok3 and type(inf) == 'table' then
      info('native module ' .. tostring(inf.version) .. ' loaded')
    end
  else
    info('native module not loaded: ' .. tostring(nativeWhy))
  end
end

-- ---------------------------------------------------------------- state
local missionRunning = false
local installed, lastInstallAt, installWarned, nativeSaid = false, -1e9, false, false
local lastPollAt = 0
local startT, lastAutoTry, autoListed = nil, -1e9, false
local target = 'nearest'
local watch, pending, demo, sigtest, marsh = nil, nil, nil, nil, nil -- marsh: the marshalling along a route, if one runs
local captain -- the plane captain of ours, if one has been called out (commands.captain)
local launchCat -- the catapult this jet is to launch from (the menu's "My catapult": stands in for PriFly's launch plan)
local holding, nightOn = {}, {} -- by handle: the signal he is on (and what he looks at); night set in use
local dumped, symbolsLogged = false, false
local DUR, BS, animInfoDone = {}, {}, false -- animation lengths (s) and blend spaces, by name (loadAnimInfo)
local CUSTOM_CLIP = 'catcc_test_clip' -- the animation clip our own mod adds (crew-test/Mods/tech/CATCC-Crew)
local customClip -- nil: not looked for yet; false: not in the list; else its entry
local frameErrLogged = false

local TARGETS = { 'nearest', 'yellow', 'ours', 'cat', 'model' }
local TARGET_TEXT = {
  nearest = 'the nearest person',
  yellow = 'the nearest yellow shirt',
  ours = 'the nearest person of ours (catcc-..., green shirt)',
  cat = 'the nearest catapult crew member',
  model = 'the plane captain (catcc-m0, the brown shirt)',
}

local function split(s)
  local t = {}
  for part in (s .. '|'):gmatch('(.-)|') do t[#t + 1] = part end
  return t
end

-- where the player's jet and the carrier are this instant (Scripts/CATCC/crewtest.lua, CATCC_CR.ctx)
local function getCtx()
  local ok, s = pcall(dostring, 'return (CATCC_CR and CATCC_CR.ctx) and CATCC_CR.ctx() or "ERR|menu script not installed"')
  if not ok or type(s) ~= 'string' then return nil, tostring(s) end
  local p = split(s)
  if p[1] ~= 'OK' then return nil, p[2] or s end
  local c = { unit = p[2], ship = p[3], s = {} }
  for i = 1, 12 do
    c.s[i] = tonumber(p[3 + i])
    if not c.s[i] then return nil, 'bad context' end
  end
  c.jx, c.jy, c.jz, c.fx, c.fz = tonumber(p[16]), tonumber(p[17]), tonumber(p[18]), tonumber(p[19]), tonumber(p[20])
  if not (c.jx and c.jy and c.jz and c.fx and c.fz) then return nil, 'bad context' end
  return c
end

-- ---------------------------------------------------------------- people
local function kind(p)
  local n = p.name or ''
  if n:find('^yellow') then return 'yellow' end
  if n:find('^brown') then return 'brown' end
  if n:find('^catcc') then return 'ours' end
  return 'cat' -- the catapult crews: shooter, director, white1, white2, green_hbb, green_nw
end

-- What a person of ours is for (2026-11-15): catcc-m0 is the plane captain (a brown shirt), catcc-t0 the
-- tow tractor's driver, everyone else (catcc-c0..: yellow shirts) a flight director.
local function role(p)
  local n = tostring(p.name or '')
  if n == 'catcc-m0' then return 'captain' end
  if n == 'catcc-t0' then return 'driver' end
  return 'director'
end

local function distTo(p, x, z)
  if not (p.x and p.z) then return nil end
  return math.sqrt((p.x - x) ^ 2 + (p.z - z) ^ 2)
end

-- Which of the people are on the player's ship?
--   1. Each man is attached to something (his ship): where that is in the world against where the
--      player's ship is (the same object: within 30 m).
--   2. Failing that, a man's own world position against the ship's (deck crew stand within 180 m of
--      their ship's origin); then, among those, everyone attached to the same thing as most of them,
--      which also leaves out a man from another ship who has walked close.
-- Sets r.mine, r.elsewhere, r.byShip (false if no world position could be read: then everyone counts).
local SHIP_M = 250
local function sortShips(r, ctx)
  r.mine, r.elsewhere, r.byShip = {}, 0, false
  if not ctx then
    r.mine = r.people
    return
  end
  for _, p in ipairs(r.people) do
    if p.wx then p.wd = math.sqrt((p.wx - ctx.s[10]) ^ 2 + (p.wz - ctx.s[12]) ^ 2) end
    if p.pwx and math.sqrt((p.pwx - ctx.s[10]) ^ 2 + (p.pwz - ctx.s[12]) ^ 2) <= 30 then r.mine[#r.mine + 1] = p end
  end
  if #r.mine > 0 then
    r.byShip = 'ship'
    r.elsewhere = #r.people - #r.mine
    return
  end
  local near, parents = {}, {}
  for _, p in ipairs(r.people) do
    if p.wx then
      r.byShip = 'position'
      if p.wd <= SHIP_M then
        near[#near + 1] = p
        local k = p.parent or 0
        parents[k] = (parents[k] or 0) + 1
      end
    end
  end
  if not r.byShip then
    r.mine = r.people
    return
  end
  local best, bn = nil, 0
  for k, n in pairs(parents) do
    if n > bn then best, bn = k, n end
  end
  for _, p in ipairs(near) do
    if (p.parent or 0) == best then r.mine[#r.mine + 1] = p end
  end
  r.elsewhere = #r.people - #r.mine
end

local SRC = { 'crew environment', 'object registry', 'memory scan' }

local function personLine(p, ctx)
  local pos = p.x and string.format('on ship %.2f fwd, %.2f up, %.2f stbd', p.x, p.y, p.z) or ('position unreadable, raw: ' .. tostring(p.rawloc))
  local wld = p.wx and string.format('; world %.1f, %.1f, %.1f (%.0f m from the ship)', p.wx, p.wy, p.wz, p.wd or -1) or '; world position n/a'
  if p.pwx then wld = wld .. string.format('; his ship at %.1f, %.1f, %.1f', p.pwx, p.pwy, p.pwz) end
  local d = ctx and distTo(p, ctx.jx, ctx.jz)
  local routes = p.routes == 1 and 'has routes' or (p.routes == 0 and 'no routes' or 'routes ?')
  return string.format('  %-12s full "%s" class %s id %s state %s, %s, %s, found by %s, layout %s, parent %s; %s%s%s', tostring(p.name), tostring(p.full),
    tostring(p.cls), tostring(p.id), tostring(p.state), p.movable and 'can walk' or 'cannot walk', routes, SRC[p.src] or tostring(p.src),
    tostring(p.layout), string.format('%.0f', p.parent or 0), pos, wld, d and string.format('; %.1f m from the jet in ship coordinates', d) or '')
end

local function logClasses(classes, top)
  table.sort(classes, function(a, b) return a.n > b.n end)
  for i, c in ipairs(classes) do
    if top and i > top then
      logLine(string.format('    ... %d more classes', #classes - top))
      break
    end
    logLine(string.format('    x%-5d %s%s  bases: %s', c.n, c.name, c.person and ' (CHARACTER)' or '', c.bases))
  end
end

-- ---------------------------------------------------------------- the recorder
-- Once a second, everyone on the player's ship is asked for his state and position; a line is logged
-- only when the state changes or he has moved half a metre. With the jet's position every 2 s (when it
-- has moved a metre) the log then holds the native choreography: who walks where, and when, as the jet
-- taxies, and what happens to someone after one of our commands. Reads only.
local recPeople, recNextT, recJetT, recJet = {}, 0, 0, nil

local function recorderSet(r)
  local old = recPeople
  recPeople = {}
  for _, p in ipairs(r.mine) do
    recPeople[p.h] = old[p.h] or { name = tostring(p.full ~= '' and p.full or p.name), st = p.state, x = p.x, z = p.z }
  end
end

local function tickRecorder(t)
  if not native or t < recNextT then return end
  recNextT = t + 1
  for h, q in pairs(recPeople) do
    local ok, st, x, _, z = pcall(native.state, h, false)
    if not ok or st == nil then
      recPeople[h] = nil
      logLine(string.format('  rec %-15s gone', q.name))
    else
      local moved = (x and q.x) and math.sqrt((x - q.x) ^ 2 + (z - q.z) ^ 2) or 0
      if st ~= q.st or moved >= 0.5 then
        logLine(string.format('  rec %-15s state %s at %s', q.name, tostring(st), x and string.format('%.2f fwd %.2f stbd', x, z) or '?'))
        q.st = st
        if x then q.x, q.z = x, z end
      end
    end
  end
  if t >= recJetT then
    recJetT = t + 2
    local ctx = getCtx()
    if ctx and (not recJet or math.sqrt((ctx.jx - recJet.x) ^ 2 + (ctx.jz - recJet.z) ^ 2) >= 1) then
      recJet = { x = ctx.jx, z = ctx.jz }
      logLine(string.format('  rec jet             at %.2f fwd %.2f stbd, nose %.2f %.2f', ctx.jx, ctx.jz, ctx.fx, ctx.fz))
    end
  end
end

-- ---------------------------------------------------------------- what the carrier's ATC says
-- Once a second the ship's own air traffic control is asked (native.deck: woATC's exported getters):
-- can a landing start, can a take-off start, is the deck foul, is the runway open, how many catapults
-- are free, which recovery case. A line is logged when any of it changes. This is how to see what holds
-- a recovery back: on 2026-11-15 the AI flight orbited for as long as the player sat in a hot-start jet
-- on deck, and DCS cleared the waist catapults for it 58 s after he left that slot.
local deckSeen, deckOff, deckT = nil, false, 0

local function deckText(d)
  return string.format('can start landing %s, can start take-off %s, foul deck %s, runway open %s, free catapults %s, recovery case %s', d.canLand and 'YES' or 'no',
    d.canTakeoff and 'YES' or 'no', d.foul and 'YES' or 'no', d.rwOpen and 'yes' or 'NO', tostring(d.freeCats), tostring(d.recoveryCase))
end

local function deckNow()
  if deckOff or not native or not native.deck then return nil end
  local h = next(recPeople)
  if not h then return nil end
  local ok, d, e = pcall(native.deck, h)
  if not ok or type(d) ~= 'table' then
    deckOff = true
    logLine('  deck: the ATC could not be asked (' .. tostring(ok and e or d) .. '): not asked again this mission')
    return nil
  end
  return deckText(d)
end

local function tickDeck(t)
  if t < deckT then return end
  deckT = t + 1
  local s = deckNow()
  if s and s ~= deckSeen then
    logLine('  deck: ' .. s .. (deckSeen and '' or ' (first reading)'))
    deckSeen = s
  end
end

-- Twice a second, what everyone on the player's ship is playing (native.anim: the readout DCS's own
-- debug inspector uses). Logged: a signal starting or ending (an animation with "sign" or "pass" in its
-- name: the idles, walks and turns in between are not), the same signal started again, and a blend
-- space's coordinates moving (at most one line a second per person). Follow DCS's directors to the
-- catapult once with this running and the log holds what they play, when, and with which blend values.
local recAnimT = 0
local function interesting(n) return n:find('sign', 1, true) ~= nil or n:find('pass', 1, true) ~= nil end
local function animText(a)
  return string.format('"%s" (length %.2f, loop %.3g/%.3g/%.3g, blend %.2f %.2f, started %.1f)', tostring(a.name), a.dur or 0, a.l1 or 0, a.l2 or 0, a.l3 or 0,
    a.bx or 0, a.by or 0, a.start or 0)
end

local function tickAnimRec(t)
  if not (native and native.anim) or t < recAnimT then return end
  recAnimT = t + 0.5
  for h, q in pairs(recPeople) do
    if not q.animOff or t >= q.animOff then
      local ok, a = pcall(native.anim, h)
      if not ok or type(a) ~= 'table' then
        q.animOff = t + 10 -- not readable just now: asked again in 10 s
      else
        local was = q.an
        local sig = interesting(a.name)
        if a.name ~= was then
          if sig or (was and interesting(was)) then
            logLine(string.format('  rec %-15s plays %s%s', q.name, animText(a), was and string.format(' after "%s" for %.1f s', was, t - (q.anT or t)) or ''))
          end
          q.an, q.anT, q.anStart, q.bx, q.by, q.anLog = a.name, t, a.start, a.bx or 0, a.by or 0, t
        elseif sig and t - (q.anLog or 0) >= 1 then
          if a.start ~= q.anStart then
            logLine(string.format('  rec %-15s again %s', q.name, animText(a)))
            q.anStart, q.anLog = a.start, t
          elseif math.abs((a.bx or 0) - q.bx) >= 0.1 or math.abs((a.by or 0) - q.by) >= 0.1 then
            logLine(string.format('  rec %-15s blend %.2f %.2f ("%s")', q.name, a.bx or 0, a.by or 0, a.name))
            q.bx, q.by, q.anLog = a.bx or 0, a.by or 0, t
          end
        end
      end
    end
  end
end

-- Every animation's length and every blend space's axes, once a mission, into the log and into DUR / BS.
local function loadAnimInfo(p)
  if animInfoDone or not (native and native.animinfo and p) then return end
  animInfoDone = true
  local ok, list, err = pcall(native.animinfo, p.h)
  if not ok or type(list) ~= 'table' then return logLine('animation data not readable: ' .. tostring(ok and err or list)) end
  local signs, nbs, bad = {}, 0, 0
  customClip = false
  for _, a in ipairs(list) do
    local n = tostring(a.name)
    if n == CUSTOM_CLIP then customClip = a end
    if a.err ~= 0 then
      bad = bad + 1
    elseif (a.x and a.x ~= '') or n:find('^bs_') or n:find('^night_bs_') then
      BS[n] = a
      nbs = nbs + 1
      logLine(string.format('  blend space %-24s index %d, id %d: x "%s" %.4g..%.4g (default %.4g), y "%s" %.4g..%.4g (default %.4g)', n, a.idx, a.id, a.x or '',
        a.x1 or 0, a.x2 or 0, a.dx or 0, a.y or '', a.y1 or 0, a.y2 or 0, a.dy or 0))
    elseif a.dur and a.dur > 0 then
      DUR[n] = a.dur
      if n:find('^sign') then signs[#signs + 1] = string.format('%s %.2f', n, a.dur) end
    end
  end
  logLine(string.format('animation data: %d names, %d blend spaces, %d unreadable; lengths (s) of the signals:', #list, nbs, bad))
  for i = 1, #signs, 6 do logLine('    ' .. table.concat(signs, ' | ', i, math.min(i + 5, #signs))) end
  -- a clip of our own, put into DCS by a mod (Saved Games\Mods\tech\CATCC-Crew: its animations path mounted, the
  -- clip in the folder of the deck crew's skeleton): is it among the animations these people can play?
  logLine(customClip and string.format('our mod\'s animation clip "%s": IN the list (index %d, length %.2f s)', CUSTOM_CLIP, customClip.idx or -1, customClip.dur or 0)
    or string.format('our mod\'s animation clip "%s": NOT in the list of %d', CUSTOM_CLIP, #list))
end

local function logSymbols()
  if symbolsLogged or not native then return end
  symbolsLogged = true
  local ok, inf = pcall(native.info)
  if not (ok and type(inf) == 'table') then return end
  if #inf.missing == 0 then
    logLine('DCS functions: all found')
  else
    info('DCS functions NOT found (' .. #inf.missing .. '): ' .. table.concat(inf.missing, '; '))
  end
end

-- the quick scan (crew environments, then the object registry's kind 0x20), sorted by ship
local function doScan(ctx, why, verbose)
  logSymbols()
  local ok, r = pcall(native.scan)
  if not ok or type(r) ~= 'table' then
    info('scan failed: ' .. tostring(r))
    return nil
  end
  sortShips(r, ctx)
  logLine(string.format('scan (%s): %d crew environment(s) holding %d objects (err %d); object registry kind 0x20: %d objects (err %d); %d characters, %d on the player\'s ship%s; names read %d, unreadable %d; objects without type info %d',
    why, r.envs, r.envObjects, r.envErr, r.regCount, r.regErr, #r.people, #r.mine,
    r.byShip and (' (told apart by ' .. (r.byShip == 'ship' and "their ship's position" or 'their own position') .. ')') or ' (NO world positions: ships not told apart)',
    r.strOk, r.strBad, r.noRtti))
  if verbose then
    logClasses(r.classes)
    loadAnimInfo(r.mine[1])
    for _, p in ipairs(r.mine) do logLine(personLine(p, ctx)) end
    if r.elsewhere > 0 then
      logLine(string.format('  (and %d on other ships)', r.elsewhere))
      for _, p in ipairs(r.people) do
        if (p.wd or 0) > SHIP_M and p.wx and (p.x and (math.abs(p.x) > 200 or math.abs(p.z) > 60)) then logLine('  off his ship: ' .. personLine(p, nil)) end
      end
    end
    if not dumped and #r.mine > 0 then
      -- one yellow shirt's and one other character's own memory, once: for working out what else is in there
      dumped = true
      local seen = {}
      for _, p in ipairs(r.mine) do
        local k = kind(p) == 'yellow' and 'yellow' or 'other'
        if not seen[k] then
          seen[k] = true
          for off = 0, 1792, 256 do
            local ok2, hex = pcall(native.dump, p.h, off, 256)
            if ok2 and hex then logLine(string.format('  memory of %s +0x%03x: %s', tostring(p.name), off, hex)) end
          end
        end
      end
    end
  end
  recorderSet(r)
  return r
end

local function summary(r, ctx)
  if #r.people == 0 then
    return string.format('no people found (%d crew environment(s) holding %d objects, %d world objects)', r.envs, r.envObjects, r.regCount)
  end
  local n = { yellow = 0, brown = 0, ours = 0, cat = 0 }
  local near, ours = {}, {}
  for _, p in ipairs(r.mine) do
    n[kind(p)] = n[kind(p)] + 1
    if kind(p) == 'ours' then ours[#ours + 1] = tostring(p.name) end
    local d = ctx and distTo(p, ctx.jx, ctx.jz)
    if d then near[#near + 1] = { p = p, d = d } end
  end
  table.sort(near, function(a, b) return a.d < b.d end)
  table.sort(ours)
  local s = string.format('%d people on your ship: %d yellow, %d brown, %d catapult crew. People of ours: %s.', #r.mine, n.yellow, n.brown, n.cat,
    #ours > 0 and table.concat(ours, ', ') or 'NONE')
  if r.elsewhere > 0 then s = s .. string.format(' (%d more on other ships.)', r.elsewhere) end
  if not r.byShip then s = s .. ' (Ships could not be told apart: no world positions.)' end
  if #near > 0 then
    local parts = {}
    for i = 1, math.min(3, #near) do parts[i] = string.format('%s %.0f m', tostring(near[i].p.name), near[i].d) end
    s = s .. ' Nearest to you: ' .. table.concat(parts, ', ') .. '.'
  else
    s = s .. ' (their positions could not be read: see the log)'
  end
  return s
end

-- the slow scan: the process's own memory
local function memoryScan(ctx)
  logLine('memory scan ...')
  local ok, h = pcall(native.heapscan, 30)
  if not ok or type(h) ~= 'table' then
    info('memory scan failed: ' .. tostring(h))
    return nil
  end
  logLine(string.format('memory scan: %.1f s, %.0f MB read (%.0f MB not in memory, left alone), %d pointers of interest, %d new characters, %d faults, %s',
    h.seconds, h.bytes / 1048576, (h.skipped or 0) / 1048576, h.hits, #h.people, h.faults, h.err == 0 and 'complete' or 'out of time (partial)'))
  logClasses(h.classes, 40)
  for _, p in ipairs(h.people) do logLine(personLine(p, ctx)) end
  return h
end

local function matches(p, mode)
  if mode == 'model' then return p.name == 'catcc-m0' end
  return mode == 'nearest' or mode == kind(p)
end

local function pick(r, ctx, mode)
  local best, bd
  for _, p in ipairs(r.mine) do
    if matches(p, mode or target) then
      local d = distTo(p, ctx.jx, ctx.jz) or 1e9
      if not bd or d < bd then best, bd = p, d end
    end
  end
  return best, bd
end

-- ---------------------------------------------------------------- watching a person after a command
local function startWatch(p, secs, tgt, why)
  local t = now()
  watch = { h = p.h, name = tostring(p.name), untilT = t + secs, nextT = t, t0 = t, tgt = tgt, why = why, path = 0, states = {}, samples = 0 }
  logLine(string.format('watch %s for %d s (%s)', watch.name, secs, why))
end

local function finishWatch(w)
  local parts = { string.format('%s, %d s after "%s":', w.name, math.floor(now() - w.t0 + 0.5), w.why) }
  if w.first and w.last then
    local moved = math.sqrt((w.last.x - w.first.x) ^ 2 + (w.last.z - w.first.z) ^ 2)
    parts[#parts + 1] = string.format('ended %.1f m from where he started (walked %.1f m).', moved, w.path)
    if w.tgt then
      parts[#parts + 1] = string.format('Now %.1f m from the target (was %.1f m).', math.sqrt((w.last.x - w.tgt.x) ^ 2 + (w.last.z - w.tgt.z) ^ 2),
        math.sqrt((w.first.x - w.tgt.x) ^ 2 + (w.first.z - w.tgt.z) ^ 2))
    end
  else
    parts[#parts + 1] = 'his position could not be read.'
  end
  parts[#parts + 1] = 'States (0 standing, 1 moving): ' .. (#w.states > 0 and table.concat(w.states, ' > ') or '?') .. '.'
  if w.nearMin then
    -- (a straight walk goes through the middle; a Hornet is 17 m long and 8 to 11 m across)
    parts[#parts + 1] = string.format('The nearest he came to the middle of your jet: %.1f m (he walked %.1f m; the straight line is %.1f m).', w.nearMin, w.path,
      (w.first and w.tgt) and math.sqrt((w.first.x - w.tgt.x) ^ 2 + (w.first.z - w.tgt.z) ^ 2) or 0)
  end
  say(table.concat(parts, ' '))
end

local function tickWatch(t)
  local w = watch
  if not w or t < w.nextT then return end
  w.nextT = t + 0.5
  local ok, st, x, _, z = pcall(native.state, w.h, false)
  if not ok or st == nil then
    watch = nil
    return say(string.format('%s: lost sight of him (%s)', w.name, tostring(x or st)))
  end
  w.samples = w.samples + 1
  if x and z then
    if not w.first then w.first = { x = x, z = z } end
    if w.last then w.path = w.path + math.sqrt((x - w.last.x) ^ 2 + (z - w.last.z) ^ 2) end
    w.last = { x = x, z = z }
    if w.near then
      local dn = math.sqrt((x - w.near.x) ^ 2 + (z - w.near.z) ^ 2)
      w.nearMin = math.min(w.nearMin or dn, dn)
    end
  end
  local label = tostring(st)
  if label ~= w.lastLabel then
    w.lastLabel = label
    if #w.states < 12 then w.states[#w.states + 1] = label end
    logLine(string.format('  watch %s +%.1f s: state %s at %s', w.name, t - w.t0, label, x and string.format('%.2f fwd %.2f stbd', x, z) or '?'))
  elseif w.samples % 10 == 0 and x then
    logLine(string.format('  watch %s +%.1f s: at %.2f fwd %.2f stbd', w.name, t - w.t0, x, z))
  end
  if t >= w.untilT then
    watch = nil
    finishWatch(w)
  end
end

-- ---------------------------------------------------------------- walk orders
-- A walk order given to a man who is already walking can leave him walking on the spot (2026-11-14:
-- a catapult crew sent back mid-walk; three of the six turned round and stayed there, legs going), or
-- jump him to the new place at once. So a man who is moving gets the new order when he stands (asked
-- four times a second), however long that takes. The latest order for a man replaces an earlier one
-- still waiting.
-- The waiting order keeps only the place on the ship: where the ship is in the world is asked for
-- afresh when the order is given (a carrier at 30 kn has moved 60 m in four seconds, and the module
-- refuses an order whose ship position is stale: that left a crew standing on 2026-11-14).
local walkQueue = {} -- [handle] = { x, z, fx, fz, at = when it was asked for, name }

-- The walk order itself. A man who holds a signal or some other pose is put back to idle first: on
-- 2026-11-15 a catapult director sent off while DCS still had him in a marshalling pose slid across the
-- deck in that pose instead of walking. (Idle, a walk, a turn: left as they are.)
local function giveWalk(h, x, z, fx, fz, s)
  holding[h] = nil
  if native.anim then
    local ok, a = pcall(native.anim, h)
    local n = (ok and type(a) == 'table' and type(a.name) == 'string') and a.name or nil
    if n and (n:find('sign', 1, true) or n:find('pass', 1, true) or not (n:find('idle', 1, true) or n:find('walk', 1, true) or n:find('move', 1, true) or n:find('turn', 1, true))) then
      pcall(native.play, h, 'idle', 0)
      logLine(string.format('  walk: %s was playing "%s": put back to idle before the walk order', tostring(h), n))
    end
  end
  return pcall(native.walk, h, x, z, fx, fz, unpack(s))
end

-- NOBODY WALKS ACROSS A LOWERED ELEVATOR (the user, 2026-11-16: "sometimes they walk back over a lowered elevator and
-- float": our people stay at deck height). A walk is a straight line; one that would cross a platform that is down (or
-- on its way) is taken round its inboard side instead, corner to corner, Walk.round clear of it; a place ON such a
-- platform becomes the nearest place at its inboard side. The legs after the first wait in Walk.legs and are given one
-- at a time, each when he stands at the end of the one before.
--   Walk.blocks()  the platforms nobody may cross now: { { x from, x to, z from, z to, zin = its inboard side's z } }
--                 (set where the elevators are, further down)
-- (one table for all of it: a Lua chunk takes 200 local names and this file has them)
--   Walk.legs  [handle] = { legs = { { x, z, fx, fz }, ... } (still to walk), x, z (the leg he is on), at, name }
local Walk = { round = 1.2, legs = {}, queueT = 0, legsT = 0, blocks = function() return {} end }

-- does the line from a to b pass through the box grown by m? (b: { x from, x to, z from, z to })
function Walk.hits(ax, az, bx, bz, b, m)
  local t0, t1 = 0, 1
  local dx, dz = bx - ax, bz - az
  for _, pq in ipairs({ { -dx, ax - (b[1] - m) }, { dx, (b[2] + m) - ax }, { -dz, az - (b[3] - m) }, { dz, (b[4] + m) - az } }) do
    local p, q = pq[1], pq[2]
    if p == 0 then
      if q < 0 then return false end
    else
      local r = q / p
      if p < 0 then
        if r > t1 then return false end
        if r > t0 then t0 = r end
      else
        if r < t0 then return false end
        if r < t1 then t1 = r end
      end
    end
  end
  return t1 - t0 > 1e-6
end

-- the way from px, pz to x, z clear of every blocked platform: the points to walk to in turn (the last is the place
-- itself, or where it was moved to), and what was done (nil: a straight walk)
function Walk.plan(px, pz, x, z)
  local pts, note = {}, nil
  for _, b in ipairs(Walk.blocks()) do
    if x > b[1] - 0.5 and x < b[2] + 0.5 and z > b[3] - 0.5 and z < b[4] + 0.5 then
      z = b.zin
      note = 'the place is on a lowered elevator: its inboard side instead'
    end
    local m = Walk.round - 0.3
    if Walk.hits(px, pz, x, z, b, m) then
      local ca, cb = { b[1] - Walk.round, b.zin }, { b[2] + Walk.round, b.zin }
      local best, bestLen
      for _, via in ipairs({ { ca }, { cb }, { ca, cb }, { cb, ca } }) do
        local ok, len, lx, lz = true, 0, px, pz
        for i = 1, #via + 1 do
          local v = via[i] or { x, z }
          if Walk.hits(lx, lz, v[1], v[2], b, m) then ok = false end
          len = len + math.sqrt((v[1] - lx) ^ 2 + (v[2] - lz) ^ 2)
          lx, lz = v[1], v[2]
        end
        if ok and (not bestLen or len < bestLen) then best, bestLen = via, len end
      end
      if best then -- (none: he stands on the platform itself: straight off it)
        for _, v in ipairs(best) do pts[#pts + 1] = { v[1], v[2] } end
        note = (note and (note .. '; ') or '') .. 'round a lowered elevator'
      end
    end
  end
  pts[#pts + 1] = { x, z }
  return pts, note
end

-- a walk given to a man who stands at px, pz: its first leg now, the rest kept for later
function Walk.give(h, px, pz, x, z, fx, fz, s, name)
  Walk.legs[h] = nil
  local pts, note = { { x, z } }, nil
  if px and pz then pts, note = Walk.plan(px, pz, x, z) end
  if not note then return giveWalk(h, x, z, fx, fz, s) end
  local legs, lx, lz = {}, px, pz
  for i, p in ipairs(pts) do
    local dx, dz = p[1] - lx, p[2] - lz
    local m = math.sqrt(dx * dx + dz * dz)
    -- (on the way he faces the way he goes; at the end, the way he was told to)
    legs[i] = { x = p[1], z = p[2], fx = (i < #pts and m > 0.01) and dx / m or fx, fz = (i < #pts and m > 0.01) and dz / m or fz }
    lx, lz = p[1], p[2]
  end
  logLine(string.format('  walk: %s to %.1f fwd %.1f stbd: %s: %d leg(s), first to %.1f / %.1f', tostring(name or h), x, z, note, #legs, legs[1].x, legs[1].z))
  local first = table.remove(legs, 1)
  if #legs > 0 then Walk.legs[h] = { legs = legs, x = first.x, z = first.z, at = now(), name = tostring(name or h) } end
  return giveWalk(h, first.x, first.z, first.fx, first.fz, s)
end

local function walkOrder(h, x, z, fx, fz, s, name)
  local ok, st, px, _, pz = pcall(native.state, h, false)
  Walk.legs[h] = nil
  if ok and st ~= nil and st ~= 0 then
    -- No stop order: DCS's stop does not end a walk (2026-11-15: five men told to stop walked on to
    -- where they were going), and a walk order given to a man still walking either jumped him to the
    -- new place at once or left him walking on the spot for good. So he finishes the walk he is on.
    walkQueue[h] = { x = x, z = z, fx = fx, fz = fz, at = now(), name = tostring(name or h) }
    return true, true, 'walking: he finishes this walk first, the new order follows when he stands'
  end
  walkQueue[h] = nil
  -- standing where he is sent already: nothing to do (a walk of no length made men jump about)
  if ok and px and pz and math.sqrt((px - x) ^ 2 + (pz - z) ^ 2) < 0.3 then return true, true, 'he stands there already: no order given' end
  return Walk.give(h, ok and px or nil, ok and pz or nil, x, z, fx, fz, s, name)
end

-- the legs of walks that go round something: the next one when he stands at the end of the one he is on (a man given
-- a walk order still "stands" for a moment: so by where he is, not by his state alone). Standing somewhere else for 6 s
-- (he was stopped, or sent elsewhere by DCS): the rest is planned again from where he stands.
function Walk.tickLegs(t)
  if not native or t < Walk.legsT then return end
  Walk.legsT = t + 0.25
  local ctx
  for h, L in pairs(Walk.legs) do
    local ok, st, px, _, pz = pcall(native.state, h, false)
    if not ok or st == nil then
      Walk.legs[h] = nil
    elseif walkQueue[h] then
      Walk.legs[h] = nil -- (a newer order waits for him: this walk is over)
    elseif st == 0 and px and pz then
      local near = math.sqrt((px - L.x) ^ 2 + (pz - L.z) ^ 2) < 0.8
      if near or t - L.at > 6 then
        ctx = ctx or getCtx()
        if not ctx then return end
        if near then
          local leg = table.remove(L.legs, 1)
          L.x, L.z, L.at = leg.x, leg.z, t
          if #L.legs == 0 then Walk.legs[h] = nil end
          local ok2, res, e = giveWalk(h, leg.x, leg.z, leg.fx, leg.fz, ctx.s)
          logLine(string.format('  walk: %s: next leg, to %.1f fwd %.1f stbd%s: %s', L.name, leg.x, leg.z, Walk.legs[h] and '' or ' (the last)', (ok2 and res) and tostring(e) or ('FAILED: ' .. tostring(ok2 and e or res))))
        else
          local last = L.legs[#L.legs]
          logLine(string.format('  walk: %s stands at %.1f / %.1f, not at the end of his leg (%.1f / %.1f): planned again from there', L.name, px, pz, L.x, L.z))
          Walk.give(h, px, pz, last.x, last.z, last.fx, last.fz, ctx.s, L.name)
        end
      end
    end
  end
end

local function tickWalkQueue(t)
  if not native or t < Walk.queueT then return end
  Walk.queueT = t + 0.25
  local ctx
  for h, q in pairs(walkQueue) do
    local ok, st = pcall(native.state, h, false)
    if not ok or st == nil then
      walkQueue[h] = nil
      logLine(string.format('  walk order for %s dropped: he is gone', q.name))
    elseif st == 0 then
      ctx = ctx or getCtx()
      if not ctx then return end -- no ship position this instant: asked again in a quarter of a second
      walkQueue[h] = nil
      local okp, _, qx, _, qz = pcall(native.state, h, false)
      local ok2, res, e = Walk.give(h, okp and qx or nil, okp and qz or nil, q.x, q.z, q.fx, q.fz, ctx.s, q.name)
      logLine(string.format('  walk order for %s given %.1f s after it was asked for (he stands): to %.1f fwd %.1f stbd: %s', q.name, t - q.at, q.x, q.z,
        (ok2 and res) and tostring(e) or ('FAILED: ' .. tostring(ok2 and e or res))))
    elseif t - q.at > 120 and not q.said then
      q.said = true -- still "moving" two minutes on: he is stuck, and no order is given to a man who is moving
      logLine(string.format('  walk order for %s still waiting after %.0f s: he has not stood since (stuck?)', q.name, t - q.at))
    end
  end
end

-- ---------------------------------------------------------------- commands
local function withTarget(fn)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for a command', false)
  if not r then return say('the scan failed (see the log)') end
  local p, d = pick(r, ctx)
  if not p then return say('nobody on your ship matches the target (' .. TARGET_TEXT[target] .. '). ' .. summary(r, ctx)) end
  return fn(p, d, ctx, r)
end

local commands = {}

function commands.list()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'list', true)
  if not r then return say('the scan failed (see the log)') end
  if #r.people > 0 then return say(summary(r, ctx)) end
  -- nobody the quick way: look through memory (in the next frame, so this message is up while DCS freezes)
  say('quick scan: ' .. summary(r, ctx) .. '. Scanning memory instead: DCS will freeze for a few seconds.')
  pending = { at = now() + 0.3, fn = function() commands.memory(true) end }
end

function commands.memory(auto)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx = getCtx()
  if not auto and not pending then
    say('scanning memory: DCS will freeze for a few seconds.')
    pending = { at = now() + 0.3, fn = function() commands.memory(true) end }
    return
  end
  local h = memoryScan(ctx)
  if not h then return say('the memory scan failed (see the log)') end
  local r = doScan(ctx, 'after the memory scan', true)
  say(string.format('memory scan (%.0f s, %d new): %s', h.seconds, #h.people, r and summary(r, ctx or nil) or 'scan failed'))
end

-- steps to the next kind of target that someone on the player's ship matches
function commands.target()
  local ctx = native and getCtx()
  local r = ctx and doScan(ctx, 'for a command', false)
  local at = 1
  for i, v in ipairs(TARGETS) do
    if v == target then at = i end
  end
  local p, d
  for step = 1, #TARGETS do
    local mode = TARGETS[(at + step - 1) % #TARGETS + 1]
    if r then p, d = pick(r, ctx, mode) end
    if p or not r then
      target = mode
      break
    end
  end
  say('target is now ' .. TARGET_TEXT[target] .. (p and string.format(': %s, %.0f m from you', tostring(p.name), d) or ': nobody like that found'))
end

-- ---------------------------------------------------------------- the directors' signals
-- What DCS's own deck directors play, recorded by this hook on 2026-11-14 during a native-marshalled
-- taxi from spawn spot 1 to catapult 1:
--   * on taking the jet: "sign_attention_taxi", once (1.33 s);
--   * then the blend spaces "bs_sign_taxi_fwd" / "bs_sign_taxi_left" / "bs_sign_taxi_right" (and
--     "bs_sign_stop"), looped, their one axis "torso_angle" (-45..45) following the jet all the while;
--   * on handing over: "bs_pass_control", once (2 s; axis "angle", -135..135: the way to the next
--     director), then "idle".
-- The turn blend spaces are named for the DIRECTOR'S side: through the jet's right turn the native
-- directors played "bs_sign_taxi_left" (and the user saw "sign_taxifwd_l" as the pilot's right).
-- The angles, fitted on two directors of that taxi (within 2 degrees): angle = the way he faces minus
-- the bearing from him to what he looks at, bearings measured from the bow towards starboard, so
-- positive = it is to his left. The torso looks at a point 4 m ahead of the jet's own position along
-- its nose (the pilot); pass control looks at the next director.
-- The night set (light wands in the hands) has the same names with "night_" in front.
-- A blend space reads its parameter when it is applied and when the animation instance is told to take
-- its parameters again; the native module does the second on every write (native.prop).
local SIGNALS = {
  attention = { name = 'sign_attention_taxi' },
  ahead = { name = 'bs_sign_taxi_fwd', held = true, aim = 'torso_angle', lim = 45 },
  left = { name = 'bs_sign_taxi_right', held = true, aim = 'torso_angle', lim = 45 }, -- the PILOT'S left
  right = { name = 'bs_sign_taxi_left', held = true, aim = 'torso_angle', lim = 45 },
  stop = { name = 'bs_sign_stop', held = true, aim = 'torso_angle', lim = 45 },
  pass = { name = 'bs_pass_control', aim = 'angle', lim = 135 },
}
local PILOT_AHEAD = 4 -- m ahead of the jet's position along its nose: where the directors look

local function wrap180(a) return (a + 180) % 360 - 180 end

-- the angle for a man at x, z facing fx, fz to a target tx, tz (ship coordinates), limited to +-lim
local function aimAngle(x, z, fx, fz, tx, tz, lim)
  local a = wrap180(math.deg(atan2(fz, fx)) - math.deg(atan2(tz - z, tx - x)))
  return math.max(-lim, math.min(lim, a))
end

-- where he stands and the way he faces, if he stands (a walking man's aim is left alone)
local function standing(h)
  local ok, st, x, _, z, _, fx, fz = pcall(native.state, h, false)
  if ok and st == 0 and x and z and fx and fz then return x, z, fx, fz end
end

-- the angle a signal should have now: a fixed one, towards a point on the deck, or towards the pilot
local function aimOf(hd, ctx)
  if hd.angle then return hd.angle end
  local x, z, fx, fz = standing(hd.h)
  if not x then return nil end
  local tx, tz
  if hd.target then
    tx, tz = hd.target.x, hd.target.z
  elseif ctx then
    tx, tz = ctx.jx + PILOT_AHEAD * ctx.fx, ctx.jz + PILOT_AHEAD * ctx.fz
  end
  if not tx then return nil end
  return aimAngle(x, z, fx, fz, tx, tz, hd.lim)
end

-- Gives h the signal `key` (SIGNALS), in his day or night set. opt.target = { x, z }: look there
-- instead of at the pilot; opt.angle: a fixed angle; opt.sweep = seconds: the angle goes across its
-- range and back in that time. The parameter is written BEFORE the animation is applied and kept up
-- to date by tickSignals for as long as he is on the signal. Returns true, the animation's name.
local function sendSignal(h, key, opt, ctx)
  local s = SIGNALS[key]
  opt = opt or {}
  local name = (nightOn[h] and 'night_' or '') .. s.name
  local hd = { h = h, key = key, name = name, prop = s.aim, lim = s.lim, target = opt.target, angle = opt.angle, at = now(), held = s.held, resent = 0, writes = 0,
    keep = opt.keep } -- keep: a one-shot the caller follows up itself (attention, then the signal): no idle in between
  if opt.sweep then hd.sweep, hd.angle = opt.sweep, -s.lim end
  if s.aim and native.prop then
    local a = aimOf(hd, ctx or getCtx())
    if a and pcall(native.prop, h, s.aim, a) then hd.last = a end
  end
  local ok, res, e = pcall(native.play, h, name, s.held and 2 or 1)
  if not (ok and res) then return false, tostring(ok and e or res) end
  holding[h] = hd
  return true, name
end

local function toIdle(h)
  holding[h] = nil
  pcall(native.play, h, 'idle', 0)
end

-- Ten times a second: everyone on a signal of ours keeps looking where he should; a one-shot goes
-- back to idle when it is over (as the native directors do); a held signal that the readout shows
-- replaced by something else is sent again.
local sigNextT = 0
local function tickSignals(t)
  if t < sigNextT or not native then return end
  sigNextT = t + 0.1
  local ctx
  for h, hd in pairs(holding) do
    ctx = ctx or getCtx()
    if hd.prop and native.prop then
      if hd.sweep then
        local k = math.min(1, (t - hd.at) / hd.sweep)
        hd.angle = -hd.lim + 2 * hd.lim * (k < 0.5 and 2 * k or 2 * (1 - k))
      end
      local a = aimOf(hd, ctx)
      if a and (not hd.last or math.abs(a - hd.last) >= 0.5) and pcall(native.prop, h, hd.prop, a) then hd.last, hd.writes = a, hd.writes + 1 end
    end
    if native.anim and t - (hd.checkT or hd.at) >= 0.5 then
      hd.checkT = t
      local ok, a = pcall(native.anim, h)
      if ok and type(a) == 'table' then
        hd.len = a.name == hd.name and a.dur or hd.len
        if hd.held and a.name ~= hd.name then
          hd.resent = hd.resent + 1
          pcall(native.play, h, hd.name, 2)
        end
      end
    end
    if not hd.held and not hd.keep and t - hd.at >= (hd.len or DUR[hd.name] or 2) then toIdle(h) end
  end
end

-- one of the directors' signals (the Signals submenu), looking at the pilot; "pass" takes an angle
function commands.sig(key, arg)
  if not SIGNALS[key] then return end
  withTarget(function(p, d, ctx)
    local ok, name = sendSignal(p.h, key, key == 'pass' and { angle = tonumber(arg) or 90 } or nil, ctx)
    if not ok then return say(string.format('%s: "%s" failed: %s', tostring(p.name), key, tostring(name))) end
    logLine(string.format('command signal: %s <- %s ("%s")', tostring(p.name), key, name))
    say(string.format('%s (%.0f m from you): %s ("%s")%s.', tostring(p.name), d, key, name, SIGNALS[key].held and ', held, his torso following you' or ', once'))
  end)
end

-- a plain animation by name; mode "2": held (the engine's loop flag), else once
function commands.raw(name, mode)
  if not name or name == '' then return end
  local held = tonumber(mode) == 2
  withTarget(function(p, d)
    holding[p.h] = nil
    logLine(string.format('command play: %s <- "%s"%s', tostring(p.name), name, held and ' (held)' or ''))
    local ok, res, e = pcall(native.play, p.h, name, held and 2 or 0)
    if not ok or not res then return say(string.format('%s: playing "%s" failed: %s', tostring(p.name), name, tostring(ok and e or res))) end
    say(string.format('%s (%.0f m from you): "%s", %s.', tostring(p.name), d, name, held and 'held' or 'once'))
  end)
end

-- to a point 16 m ahead of the jet's nose, turned to face the jet
function commands.walk()
  withTarget(function(p, d, ctx)
    local tx, tz = ctx.jx + 16 * ctx.fx, ctx.jz + 16 * ctx.fz
    logLine(string.format('command walk: %s -> %.2f fwd %.2f stbd, to face %.2f %.2f (jet at %.2f fwd %.2f stbd, nose %.3f %.3f)', tostring(p.name), tx, tz,
      -ctx.fx, -ctx.fz, ctx.jx, ctx.jz, ctx.fx, ctx.fz))
    local ok, res, e = walkOrder(p.h, tx, tz, -ctx.fx, -ctx.fz, ctx.s, p.name)
    if not ok or not res then return say(string.format('%s: walk failed: %s', tostring(p.name), tostring(ok and e or res))) end
    logLine('  walk: ' .. tostring(e))
    say(string.format('%s told to walk to a point 16 m ahead of your nose (%.0f m from him) and face you. Watch him.', tostring(p.name), distTo(p, tx, tz) or 0))
    startWatch(p, 45, { x = tx, z = tz }, 'walk')
  end)
end

function commands.stop()
  withTarget(function(p)
    local ok, res, e = pcall(native.stop, p.h)
    if not ok or not res then return say(string.format('%s: stop failed: %s', tostring(p.name), tostring(ok and e or res))) end
    say(tostring(p.name) .. ' told to stop.')
    startWatch(p, 8, nil, 'stop')
  end)
end

-- ---------------------------------------------------------------- night mode
-- The light wands every crew member carries (GroundCrew.lua: two sticks, two lights) shown, the arm
-- held for them, and from then on the "night_" set of signals; off: wands hidden, arm pose off, day set.
-- The arm pose is an "override" animation: DCS keeps it under whatever else the man plays
-- (GroundCrew.lua gives its own crew Night_Stick_ArmPose_L / _R and Holdbar_ArmPose_L / _R this way).
-- Seen 2026-11-14: wands shown without any of this are not held properly, and the override alone, on a
-- man without wands in daylight, shows nothing. Which of "night_stick_armpose" / "_l" / "_r" is right
-- for a director with a wand in each hand is one of the things the signal test shows.
local WANDS = { 'RightStick', 'LeftStick', 'RightLight', 'LeftLight' }
local ARM_POSE = 'night_stick_armpose'

local function setNight(h, on, pose)
  local failed = {}
  for _, n in ipairs(WANDS) do
    local ok, res, e = pcall(native.attach, h, n, on)
    if not (ok and res) then failed[#failed + 1] = n .. ' (' .. tostring(ok and e or res) .. ')' end
  end
  local ok, res, e = pcall(native.override, h, on and (pose or ARM_POSE) or '')
  if not (ok and res) then failed[#failed + 1] = 'arm pose (' .. tostring(ok and e or res) .. ')' end
  nightOn[h] = on or nil
  return failed
end

function commands.night()
  withTarget(function(p, d, ctx)
    local on = not nightOn[p.h]
    local failed = setNight(p.h, on)
    local hd = holding[p.h]
    if hd then sendSignal(p.h, hd.key, { target = hd.target, angle = (not hd.sweep) and hd.angle or nil }, ctx) end -- the same signal, in the other set
    say(string.format('%s (%.0f m from you): night mode %s: light wands %s, arm pose "%s" %s, %s signals from now on%s.', tostring(p.name), d, on and 'ON' or 'OFF',
      on and 'shown' or 'hidden', ARM_POSE, on and 'held' or 'off', on and 'night' or 'day', #failed > 0 and ('; FAILED: ' .. table.concat(failed, ', ')) or ''))
  end)
end

-- ---------------------------------------------------------------- the demo: directors of our own
-- People of ours (nothing native ever tasks them) bring the jet 12 m straight ahead with DCS's own
-- director signals, all of it worked out here from the jet's and their positions in ship coordinates:
--   * the last director walks to a point 25 m ahead of the nose and faces the jet;
--   * with a second person of ours there is a first director too, 12 m ahead and 6 m to the pilot's
--     right, facing the jet. He takes the jet (attention, then come ahead / turn left / turn right by
--     where the 25 m point is off the nose: more than 8 degrees = turn) and, when it has come 4 m,
--     hands it over: pass control, pointing at the last director, then idle;
--   * the last director takes it when the pass is over (attention, then the same signals) and stops
--     it 13 m short of himself.
-- Every held signal follows the pilot with the torso, as the native directors' do (tickSignals).
local DEMO = { ahead = 25, stopAt = 13, turnDeg = 8, firstAhead = 12, firstRight = 6, handAt = 21 }

function commands.demo()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if marsh then return say('the marshalling is running: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for the demo', false)
  local ours = {}
  for _, p in ipairs(r and r.mine or {}) do
    if kind(p) == 'ours' and role(p) ~= 'driver' and p.x and p.z then ours[#ours + 1] = p end
  end
  if #ours == 0 then return say('the demo needs a person of ours (catcc-...) on your ship: none found (data patch applied?)') end
  loadAnimInfo(ours[1])
  local P = { x = ctx.jx + DEMO.ahead * ctx.fx, z = ctx.jz + DEMO.ahead * ctx.fz }
  table.sort(ours, function(a, b) return distTo(a, P.x, P.z) < distTo(b, P.x, P.z) end)
  local function order(p, x, z, fx, fz)
    local ok, res, e = pcall(native.walk, p.h, x, z, fx, fz, unpack(ctx.s))
    if not ok or not res then return nil, tostring(ok and e or res) end
    logLine(string.format('demo: %s -> %.2f fwd %.2f stbd, to face %.2f %.2f; walk: %s', tostring(p.name), x, z, fx, fz, tostring(e)))
    return { h = p.h, name = tostring(p.name), P = { x = x, z = z }, togo = distTo(p, x, z) or 0 }
  end
  local t = now()
  local d = { P = P, phase = 'walk', t0 = t, nextT = t, sent = 0 }
  local why
  d.last, why = order(ours[1], P.x, P.z, -ctx.fx, -ctx.fz) -- the last director: whoever of ours is nearest to the 25 m point
  if not d.last then return say('demo: the walk order failed: ' .. tostring(why)) end
  if ours[2] then
    local qx = ctx.jx + DEMO.firstAhead * ctx.fx - DEMO.firstRight * ctx.fz -- the pilot's right is (-fz, fx)
    local qz = ctx.jz + DEMO.firstAhead * ctx.fz + DEMO.firstRight * ctx.fx
    local fx, fz = ctx.jx - qx, ctx.jz - qz
    local m = math.sqrt(fx * fx + fz * fz)
    d.first = order(ours[2], qx, qz, fx / m, fz / m)
  end
  watch, sigtest = nil, nil
  demo = d
  if d.first then
    say(string.format('demo: %s is walking to a point %d m ahead of your nose (%.0f m to go) and %s to %d m ahead, %d m to your right. When they are there, taxi ahead: %s takes you first and hands you over to %s, who stops you %d m short of himself.',
      d.last.name, DEMO.ahead, d.last.togo, d.first.name, DEMO.firstAhead, DEMO.firstRight, d.first.name, d.last.name, DEMO.stopAt))
  else
    say(string.format('demo: %s is walking to a point %d m ahead of your nose (he has %.0f m to go). When he is there, taxi towards him and follow his signals: he stops you %d m short of him.',
      d.last.name, DEMO.ahead, d.last.togo, DEMO.stopAt))
  end
end

-- true: he stands on his point, or has stood still somewhere else for 5 s with no walk order waiting (as
-- near as his path finder brought him); false: not yet; nil: he can't be read. A man still walking is
-- never in place, however long he takes: on 2026-11-15 a plane captain with 123 m to walk was taken to
-- be in place after a minute, 24 m short and still walking, and the signal he was given then slid him
-- over the deck in that pose.
local function inPlace(who, t0, t)
  local ok, st, x, _, z = pcall(native.state, who.h, false)
  if not ok or st == nil then return nil end
  who.away = (x and z) and math.sqrt((x - who.P.x) ^ 2 + (z - who.P.z) ^ 2) or 0
  if st ~= 0 or walkQueue[who.h] then
    who.stoodAt = nil
    return false
  end
  if who.away < 1.5 then return true end
  who.stoodAt = who.stoodAt or t
  return t - who.stoodAt >= 5
end

local function demoTake(d, who, t, ctx)
  d.ctl, d.sig, d.attUntil = who, nil, t + 1.4
  local ok, name = sendSignal(who.h, 'attention', { keep = true }, ctx)
  logLine(string.format('  demo: %s takes the jet: attention ("%s")%s', who.name, tostring(name), ok and '' or ' FAILED'))
end

local function tickDemo(t)
  local d = demo
  if not d or t < d.nextT then return end
  d.nextT = t + 0.25
  local ctx = getCtx()
  if not ctx then return end
  if d.phase == 'walk' then
    local a = inPlace(d.last, d.t0, t)
    local b = true
    if d.first then b = inPlace(d.first, d.t0, t) end
    if a == nil or b == nil then
      demo = nil
      return say('demo: lost sight of ' .. ((a == nil) and d.last.name or d.first.name))
    end
    if a and b then
      d.phase = 'direct'
      say(string.format('demo: %s in place (%.1f m from the point, after %.0f s). Taxi %s.', d.first and (d.first.name .. ' and ' .. d.last.name .. ' are') or (d.last.name .. ' is'),
        d.last.away or 0, t - d.t0, d.first and 'ahead' or 'towards him'))
      demoTake(d, d.first or d.last, t, ctx)
    end
    return
  end
  -- where the 25 m point is from the jet: distance, and the angle off the nose (positive: to the right of it)
  local dx, dz = d.P.x - ctx.jx, d.P.z - ctx.jz
  local dist = math.sqrt(dx * dx + dz * dz)
  local ang = math.deg(atan2(ctx.fx * dz - ctx.fz * dx, ctx.fx * dx + ctx.fz * dz))
  if d.first and d.ctl == d.first and dist <= DEMO.handAt then
    local ok, name = sendSignal(d.first.h, 'pass', { target = d.last.P }, ctx)
    logLine(string.format('  demo: %s hands over to %s: pass control ("%s")%s; jet %.1f m from the point', d.first.name, d.last.name, tostring(name), ok and '' or ' FAILED', dist))
    d.ctl, d.sig, d.takeAt = nil, nil, t + 2 -- the next director takes the jet when the pass is over, as the native ones do
    return
  end
  if not d.ctl then
    if t >= d.takeAt then demoTake(d, d.last, t, ctx) end
    return
  end
  if t < d.attUntil then return end
  local want
  if dist <= DEMO.stopAt and d.ctl == d.last then
    want = 'stop'
  elseif ang > DEMO.turnDeg then
    want = 'right'
  elseif ang < -DEMO.turnDeg then
    want = 'left'
  else
    want = 'ahead'
  end
  if want ~= d.sig then
    d.sig, d.sent = want, d.sent + 1
    local ok, name = sendSignal(d.ctl.h, want, nil, ctx)
    logLine(string.format('  demo: %s signals %s ("%s")%s; jet %.1f m from the point, the point %.0f deg off the nose', d.ctl.name, want, tostring(name), ok and '' or ' FAILED', dist, ang))
    if (want == 'left' or want == 'right') and not d.turnSaid then
      d.turnSaid = true
      say(string.format('demo: the point is %.0f degrees to your %s: %s signals turn %s', math.abs(ang), want, d.ctl.name, want))
    end
  end
  if want == 'stop' then
    d.stopT = d.stopT or t
    if t - d.stopT >= 6 then
      demo = nil
      local resent = 0
      for _, who in ipairs({ d.first or false, d.last }) do
        if who then
          resent = resent + ((holding[who.h] and holding[who.h].resent) or 0)
          toIdle(who.h)
        end
      end
      logLine(string.format('  demo: over; %d signals sent; sent again because the readout showed them replaced: %d', d.sent, resent))
      say(string.format('demo over: stop signalled with you %.1f m from %s.', dist, d.last.name))
    end
  else
    d.stopT = nil
  end
end

-- ---------------------------------------------------------------- the signal test
-- A person of ours (or, with none, the current target) comes to 14 m ahead of the nose, faces the jet,
-- and goes through the directors' signals as DCS's own directors play them (SIGNALS), then the night
-- set with the light wands. What he actually plays is read back four times a second (native.anim), so
-- the log says for every step whether it played as sent, and how far the blend angle moved.
local SIGTEST = {
  { 'attention', sig = 'attention', secs = 2.5 },
  { 'come ahead, his torso on you', sig = 'ahead', secs = 5 },
  { 'come ahead, his torso swung from one side to the other', sig = 'ahead', secs = 8, sweep = true },
  { 'turn LEFT (your left)', sig = 'left', secs = 8 },
  { 'turn RIGHT (your right)', sig = 'right', secs = 8 },
  { 'stop', sig = 'stop', secs = 6 },
  { 'pass control, pointing to his left', sig = 'pass', angle = 90, secs = 3 },
  { 'pass control, pointing to his right', sig = 'pass', angle = -90, secs = 3 },
  { 'NIGHT: light wands, standing idle, arm pose "night_stick_armpose"', night = 'night_stick_armpose', secs = 5 },
  { 'NIGHT: arm pose "night_stick_armpose_r"', night = 'night_stick_armpose_r', secs = 4 },
  { 'NIGHT: arm pose "night_stick_armpose_l"', night = 'night_stick_armpose_l', secs = 4 },
  { 'NIGHT: come ahead (arm pose "night_stick_armpose" again)', night = 'night_stick_armpose', sig = 'ahead', secs = 6 },
  { 'NIGHT: turn LEFT (your left)', sig = 'left', secs = 6 },
  { 'NIGHT: stop', sig = 'stop', secs = 5 },
  { 'day again', night = false, secs = 1 },
}

function commands.sigtest()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.anim and native.prop) then return say('the signal test needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  if marsh then return say('the marshalling is running: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for the signal test', false)
  local p = r and (pick(r, ctx, 'ours') or pick(r, ctx))
  if not p then return say('the signal test found nobody on your ship to use') end
  loadAnimInfo(p)
  local P = { x = ctx.jx + 14 * ctx.fx, z = ctx.jz + 14 * ctx.fz }
  local t = now()
  watch, demo = nil, nil
  sigtest = { h = p.h, name = tostring(p.name), P = P, phase = 'run', t0 = t, nextT = t, i = 0, res = {} }
  local togo = distTo(p, P.x, P.z) or 0
  if togo > 2 then
    local ok, res, e = pcall(native.walk, p.h, P.x, P.z, -ctx.fx, -ctx.fz, unpack(ctx.s))
    if not ok or not res then
      sigtest = nil
      return say('signal test: his walk order failed: ' .. tostring(ok and e or res))
    end
    logLine('  walk: ' .. tostring(e))
    sigtest.phase = 'walk'
  end
  local total = 0
  for _, step in ipairs(SIGTEST) do total = total + step.secs end
  say(string.format('signal test: %s %s. Then %d steps, about %d s in all: watch him; each one is announced.', sigtest.name,
    togo > 2 and string.format('is walking to 14 m ahead of your nose (%.0f m to go)', togo) or 'is in front of you', #SIGTEST, math.floor(total + 0.5)))
end

local function sigtestBegin(s, t)
  local step = SIGTEST[s.i]
  local st = { t0 = t, untilT = t + step.secs }
  if step.night ~= nil then
    local failed = setNight(s.h, step.night ~= false, step.night or nil)
    if #failed > 0 then st.err = table.concat(failed, ', ') end
    if not step.sig then toIdle(s.h) end
  end
  if step.sig then
    local ok, name = sendSignal(s.h, step.sig, { angle = step.angle, sweep = step.sweep and step.secs or nil })
    if ok then st.name = name else st.err = tostring(name) end
  end
  s.step = st
  logLine(string.format('  sigtest %d: %s%s%s', s.i, step[1], st.name and (' ("' .. st.name .. '")') or '', st.err and (': FAILED ' .. st.err) or ''))
  say(string.format('signal test %d of %d: %s%s', s.i, #SIGTEST, step[1], st.err and ' - could not be done (see the log)' or ''), math.max(3, math.min(12, math.floor(step.secs))))
end

local function sigtestEnd(s)
  local st, step = s.step, SIGTEST[s.i]
  local verdict
  if st.err then
    verdict = 'FAILED (' .. st.err .. ')'
  elseif not step.sig then
    verdict = 'done'
  elseif not st.seen then
    verdict = 'NOT SEEN playing' .. (st.other and (' (he played "' .. st.other .. '")') or '')
  elseif SIGNALS[step.sig].held and st.lastName ~= st.name then
    verdict = 'seen, but REPLACED by "' .. tostring(st.lastName) .. '" before the end'
  else
    verdict = 'played'
  end
  logLine(string.format('  sigtest %d: %s: %s%s', s.i, st.name and ('"' .. st.name .. '"') or step[1], verdict, st.seen and string.format(
    '; first seen +%.2f s; length %.2f, loop %.3g/%.3g/%.3g; blend x %.1f..%.1f; %d parameter write(s), sent again %d time(s)', st.seen, st.dur or 0, st.l1 or 0, st.l2 or 0,
    st.l3 or 0, st.bmin or 0, st.bmax or 0, st.writes or 0, st.resent or 0) or ''))
  s.res[#s.res + 1] = { label = step[1], ok = verdict == 'played' or verdict == 'done', sweep = (step.sweep and st.seen) and { st.bmin or 0, st.bmax or 0 } or nil }
  s.step = nil
end

local function tickSigtest(t)
  local s = sigtest
  if not s or t < s.nextT then return end
  s.nextT = t + 0.25
  if s.phase == 'walk' then
    local ok, st, x, _, z = pcall(native.state, s.h, false)
    if not ok or st == nil then
      sigtest = nil
      return say('signal test: lost sight of him (' .. tostring(x or st) .. ')')
    end
    local away = (x and z) and math.sqrt((x - s.P.x) ^ 2 + (z - s.P.z) ^ 2) or 0
    if (st == 0 and away < 1.5) or t - s.t0 > 60 then s.phase = 'run' end
    return
  end
  local st = s.step
  if st and st.name then
    local hd = holding[s.h]
    if hd then st.writes, st.resent = hd.writes, hd.resent end
    local ok, a = pcall(native.anim, s.h)
    if ok and type(a) == 'table' then
      st.lastName = a.name
      if a.name == st.name then
        st.seen = st.seen or (t - st.t0)
        st.dur, st.l1, st.l2, st.l3 = a.dur, a.l1, a.l2, a.l3
        local bx = a.bx or 0
        st.bmin, st.bmax = math.min(st.bmin or bx, bx), math.max(st.bmax or bx, bx)
      elseif not st.seen then
        st.other = a.name
      end
    end
  end
  if st and t < st.untilT then return end
  if st then sigtestEnd(s) end
  s.i = s.i + 1
  if SIGTEST[s.i] then return sigtestBegin(s, t) end
  -- done: day set, back to his idle, and the result on screen
  sigtest = nil
  if nightOn[s.h] then setNight(s.h, false) end
  toIdle(s.h)
  local bad, sweep = {}, nil
  for _, r in ipairs(s.res) do
    if not r.ok then bad[#bad + 1] = r.label end
    sweep = r.sweep or sweep
  end
  say(string.format('signal test done: %d of %d steps as sent%s.%s', #s.res - #bad, #s.res, #bad > 0 and ('; NOT as sent: ' .. table.concat(bad, '; ')) or '',
    sweep and string.format(' Torso swing: his blend angle went %.0f..%.0f (asked for -45..45).', sweep[1], sweep[2]) or ''), 40)
end

-- ---------------------------------------------------------------- marshalling along a taxi route
-- "Marshal me to catapult N": people of ours bring the jet along a taxi route from PriFly's own taxi
-- network (Scripts/CATCC/crewtest_routes.lua, made from src/components/catcc/prifly/taxiNet.ts: the
-- route PriFly's room would send, here from the spawn spot the jet stands on to the catapult picked)
-- up to the catapult's start box, where the catapult's own crew takes the jet as it always does.
--   * The part of the route before the start box is cut into equal stretches of at most 30 m, one
--     director each (no more than there are people of ours). A director stands 8 m beyond the end of
--     his stretch and 8 m to the side of the route: on the outside of the bend there, on the pilot's
--     left where it runs straight; he faces back along the route, towards where the jet comes from.
--   * Signals: the route point 10 m ahead of the jet's place on the route is looked at from the jet;
--     more than 10 degrees off the nose = turn that way (back to come ahead under 5), else come ahead.
--   * At the end of his stretch a director passes control, pointing at the next one, who takes the jet
--     when the pass is over (attention, then signals), as DCS's own directors do; the last one passes
--     control towards the catapult's director when the jet is in the start box. Then everyone walks
--     back to where he stood.
-- The catapult start boxes are GroundCrew.lua's (ship coordinates: x forward from, to; z starboard from, to).
local CAT_BOX = { { 21, 62, 11, 23.5 }, { 16, 60, -12, 6 }, { -78, -57, -25, -13 }, { -96, -68.5, -36, -27.5 } }
local MARSHAL = { stretch = 30, beyond = 8, side = 8, lookAhead = 10, turnOn = 10, turnOff = 5, maxStart = 3, maxFirstTurn = 60, maxJoin = 40, maxJoinTurn = 110, gearIn = 8 }
-- The bow's catapult control bubble: when it stands up, its collision shape stops a jet's wheels (2026-11-15:
-- the route from a bow spot to catapult 1 ran straight over it and the jet stopped dead against it at 71 m
-- forward, 3.4 m to starboard, nose aft; it took a lot of thrust to climb over). Where it is, from that:
-- about 64 m forward, 3 m to starboard. A route that passes within `r` of it has the bubble lowered until
-- the jet is `clear` metres past. (It also makes a fine chock: worth remembering.)
local BOW_BUBBLE = { x = 64, z = 3, r = 6, clear = 14 }
local bowWhy = {} -- why the bow bubble is to be down: closed (catapults 1 and 2 both closed), route (a route of ours crosses it), hand
local bowBubbleUpdate, shipHandle -- (defined with the bubbles, further down)
local camAfter -- the catapult director the camera stays on after our own directors have handed the jet over
local teleWait -- a parking spot the jet is to be put on once it stands still (tickTeleport)
-- The flight deck's outline as the crew's own navigation has it (GroundCrew.lua deck(): metres, ship
-- coordinates x forward, z to starboard; the island is cut out of it). move_command_world has no deck
-- limit of its own (2026-11-14: men sent to a point off the deck walked off it), so a station is only
-- taken if it and the deck 2 m around it are inside this.
local DECK = {
  { -59.12, -36.5 }, { -119.82, -37.21 }, { -124.27, -20.36 }, { -160.7, -15.91 }, { -163.92, -15.52 }, { -157.65, 22.74 }, { -148.72, 21.28 }, { -143.94, 28.06 },
  { -111.84, 32.05 }, { -111.56, 34.4 }, { -83.76, 37.21 }, { -75.53, 37.21 }, { -75.53, 32.79 }, { -70.54, 32.79 }, { -70.54, 37.21 }, { -64.23, 37.21 },
  { -64.23, 24.69 }, { -36.86, 22.38 }, { -36.86, 37.21 }, { 41.41, 37.21 }, { 69.15, 37.21 }, { 93.06, 19.18 }, { 167.53, 12.21 }, { 167.53, -12.21 },
  { 92.02, -19.2 }, { 63.1, -40.59 }, { 35.69, -40.59 }, { 15.11, -36.51 }, { -55.75, -36.5 }, { -55.75, -39.25 }, { -59.1, -39.25 },
}
local function insideDeck(x, z)
  local inside, j = false, #DECK
  for i = 1, #DECK do
    local a, b = DECK[i], DECK[j]
    if ((a[2] > z) ~= (b[2] > z)) and (x < (b[1] - a[1]) * (z - a[2]) / (b[2] - a[2]) + a[1]) then inside = not inside end
    j = i
  end
  return inside
end
local function standable(x, z) return insideDeck(x, z) and insideDeck(x + 2, z) and insideDeck(x - 2, z) and insideDeck(x, z + 2) and insideDeck(x, z - 2) end
-- Parking nose-on to the deck edge: the jet is stopped with its nose wheel 6 ft from the edge (asked for
-- 2026-11-15; the first build stopped it 2 m short of the spot's own point, which left the tail outside
-- the elevator's outline). The edge is the deck outline above, straight on from the route's end; the F/A-18C's
-- nose wheel is 2.99 m ahead of the jet's position (FA-18C_hornet.lua, nose_gear_pos); `lead` is how far the
-- jet still rolls after the stop signal at marshalling speed (0.3 m seen).
local PARK = { noseGear = 2.985, noseFromEdge = 1.83, lead = 0.4, edgeWithin = 25 }
-- how far it is from x, z to the deck's edge along dx, dz (a unit vector), or nil if there is none that way
local function edgeAhead(x, z, dx, dz)
  local best, j = nil, #DECK
  for i = 1, #DECK do
    local a, b = DECK[j], DECK[i]
    local ex, ez = b[1] - a[1], b[2] - a[2]
    local den = dx * ez - dz * ex
    if math.abs(den) > 1e-9 then
      local t = ((a[1] - x) * ez - (a[2] - z) * ex) / den
      local u = ((a[1] - x) * dz - (a[2] - z) * dx) / den
      if t > 1e-6 and u >= 0 and u <= 1 and (not best or t < best) then best = t end
    end
    j = i
  end
  return best
end
local ROUTES -- nil: not loaded yet; false: no file

-- Out of the landing area first (asked for 2026-11-15): a jet that is to be parked and stands in the
-- landing area is first turned square off it and taken straight across until it is clear, and only then
-- joins the way to its spot. The landing area: DCS's own landing strip of the ship (GT.RunWays[1]: through
-- 45 m aft / 10.49 m to port, 9.14 degrees to port of the bow, 25 m wide). Clear: the jet's own position
-- `clear` metres beyond the strip's edge (its tail is 8.5 m behind that). To starboard, where the deck is.
local LA = { cx = -45, cz = -10.49, dx = 0.98731, dz = -0.15877, half = 12.5, clear = 10, aft = -125, fwd = 120, lead = 4 }
local function laExit(ctx)
  local nx, nz = -LA.dz, LA.dx -- to starboard of the landing direction
  local rx, rz = ctx.jx - LA.cx, ctx.jz - LA.cz
  local along, lat = rx * LA.dx + rz * LA.dz, rx * nx + rz * nz
  if math.abs(lat) > LA.half + 2 or along < LA.aft or along > LA.fwd then return nil end
  local out = LA.half + LA.clear - lat
  local x1, z1 = ctx.jx + ctx.fx * LA.lead, ctx.jz + ctx.fz * LA.lead
  local ex, ez = x1 + nx * out, z1 + nz * out
  if not standable(ex, ez) then return nil end
  return { { ctx.jx, ctx.jz }, { x1, z1 }, { ex, ez } }, out
end

local function loadRoutes()
  if ROUTES ~= nil then return ROUTES end
  ROUTES = false
  local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_routes.lua')
  if f then
    local ok, t = pcall(f)
    if ok and type(t) == 'table' then ROUTES = t end
  end
  return ROUTES
end

-- a route is { {x, z}, ... } in ship coordinates; s[i] = the length along it up to point i
local function routeLengths(r)
  local s = { 0 }
  for i = 2, #r do s[i] = s[i - 1] + math.sqrt((r[i][1] - r[i - 1][1]) ^ 2 + (r[i][2] - r[i - 1][2]) ^ 2) end
  return s
end

-- the point at length d along the route and the route's direction there (past either end: the end's)
local function routeAt(r, s, d)
  local n = #r
  local i = 1
  if d >= s[n] then
    i, d = n - 1, s[n]
  else
    d = math.max(0, d)
    while i < n - 1 and s[i + 1] < d do i = i + 1 end
  end
  local dx, dz = r[i + 1][1] - r[i][1], r[i + 1][2] - r[i][2]
  local m = math.sqrt(dx * dx + dz * dz)
  local k = m > 0 and (d - s[i]) / m or 0
  return r[i][1] + dx * k, r[i][2] + dz * k, dx / m, dz / m
end

-- the length along the route of its point nearest to x, z, looked for between lengths lo and hi; and how far off that is
local function routeNearest(r, s, x, z, lo, hi)
  local best, bd = lo, 1e9
  for i = 1, #r - 1 do
    if s[i + 1] >= lo and s[i] <= hi then
      local dx, dz = r[i + 1][1] - r[i][1], r[i + 1][2] - r[i][2]
      local l2 = dx * dx + dz * dz
      local l = math.sqrt(l2)
      local k = 0
      if l > 0 then
        -- the nearest point of this leg, kept to the part of it between lo and hi
        k = ((x - r[i][1]) * dx + (z - r[i][2]) * dz) / l2
        k = math.max(math.max(0, (lo - s[i]) / l), math.min(math.min(1, (hi - s[i]) / l), k))
      end
      local d = math.sqrt((x - r[i][1] - dx * k) ^ 2 + (z - r[i][2] - dz * k) ^ 2)
      if d < bd then best, bd = s[i] + l * k, d end
    end
  end
  return best, bd
end

local function inBox(b, x, z) return x >= b[1] and x <= b[2] and z >= b[3] and z <= b[4] end

-- the angle of a point off the jet's nose, degrees, positive to the right
local function offNose(ctx, x, z)
  local dx, dz = x - ctx.jx, z - ctx.jz
  return math.deg(atan2(ctx.fx * dz - ctx.fz * dx, ctx.fx * dx + ctx.fz * dz))
end

-- arg: the catapult (1..4), or with parkArea the deck area to be parked in ("El 2", "Bow stbd", ...): the
-- way there is the parking route of that area's first spot (crewtest_routes.lua, parking), which starts
-- where the roll-out ends; it is joined where it passes nearest, and the last director stops the jet on the spot.
-- hold: the directors walk to their stations and wait there; nobody takes the jet until the hold is
-- lifted (the plane captain's release).
function commands.marshal(arg, parkArea, hold)
  local cat = tonumber(arg)
  if not parkArea and not (cat and CAT_BOX[cat]) then return end
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.anim and native.prop) then return say('marshalling needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  if demo or sigtest or marsh then return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local routes = loadRoutes()
  if not routes then return say('the taxi routes are missing (Scripts\\CATCC\\crewtest_routes.lua): run crew-test\\install.ps1 with DCS closed') end
  -- The route to take: of the routes to this catapult, the one whose first 15 m pass nearest to the jet
  -- (a jet on its spot, or one that has rolled a few metres); `start` is how far along that route the
  -- jet already is.
  local park
  if parkArea then
    for _, e in ipairs(routes.parking or {}) do
      if e.area == parkArea and type(e.route) == 'table' and #e.route >= 2 then
        park = e
        break
      end
    end
    if not park then return say(string.format('there is no parking route to the %s spots in the routes file', tostring(parkArea))) end
    for _, st in ipairs(routes) do
      if st.spot == park.spot and st.fx then park.x, park.z, park.fx, park.fz = st.x, st.z, st.fx, st.fz end
    end
  end
  local from, route, s, start, fd
  local exitNote = ''
  local exit, exitOut
  if park then exit, exitOut = laExit(ctx) end
  if park and exit then
    -- in the landing area: square off it first, then the way to the spot from wherever that leaves the jet
    local s0 = routeLengths(park.route)
    local ex, ez = exit[3][1], exit[3][2]
    local p1 = routeNearest(park.route, s0, ex, ez, 0, s0[#park.route])
    local r2 = { exit[1], exit[2], exit[3] }
    for i = 1, #park.route do
      if s0[i] > p1 + 3 and math.sqrt((park.route[i][1] - ex) ^ 2 + (park.route[i][2] - ez) ^ 2) > 6 then r2[#r2 + 1] = park.route[i] end
    end
    if #r2 == 3 then r2[4] = park.route[#park.route] end
    from, route, s, start, fd = { spot = park.spot }, r2, routeLengths(r2), 0, 0
    exitNote = string.format(' First OUT OF THE LANDING AREA: a turn to starboard, square off it, %.0f m; then the way to the spot.', exitOut)
    logLine(string.format('marshal: the jet is in the landing area: first leg %.1f fwd %.1f stbd -> %.1f fwd %.1f stbd (%.0f m square off the landing area), then the way to %s from its %.0f m point',
      exit[2][1], exit[2][2], ex, ez, exitOut, tostring(park.name), p1))
  elseif park then
    local s0 = routeLengths(park.route)
    local p0, d = routeNearest(park.route, s0, ctx.jx, ctx.jz, 0, s0[#park.route])
    local ax, az = routeAt(park.route, s0, p0 + MARSHAL.lookAhead)
    local turn = math.abs(offNose(ctx, ax, az))
    if d > MARSHAL.maxJoin or turn > MARSHAL.maxJoinTurn then
      return say(string.format('the way to %s (spot %d) starts where the roll-out ends; it passes %.0f m from you and leads on %.0f degrees off your nose: too far, or behind you (taken within %d m and %d degrees).',
        tostring(park.name), park.spot, d, turn, MARSHAL.maxJoin, MARSHAL.maxJoinTurn))
    end
    from, route, s, start, fd = { spot = park.spot }, park.route, s0, p0, d
  end
  for _, st in ipairs(park and {} or routes) do
    local r0 = st.routes[cat]
    if type(r0) == 'table' and #r0 >= 2 then
      local s0 = routeLengths(r0)
      local p0, d = routeNearest(r0, s0, ctx.jx, ctx.jz, 0, 15)
      if not fd or d < fd then from, route, s, start, fd = st, r0, s0, p0, d end
    end
  end
  if not from then return say(string.format('there is no taxi route to catapult %d in the routes file', cat)) end
  local joined = park ~= nil
  if not park and fd > MARSHAL.maxStart then
    -- Not on a spot (the jet has taxied off, or was never on one): join whichever route to this catapult
    -- suits best, anywhere along it. Best: near, leading on in front of the nose rather than behind it,
    -- and with little left to taxi (so of two roads side by side the one already nearer the catapult).
    local best
    for _, st in ipairs(routes) do
      local r0 = st.routes[cat]
      if type(r0) == 'table' and #r0 >= 2 then
        local s0 = routeLengths(r0)
        local p0, d = routeNearest(r0, s0, ctx.jx, ctx.jz, 0, s0[#r0])
        if d <= MARSHAL.maxJoin then
          local ax, az = routeAt(r0, s0, p0 + MARSHAL.lookAhead)
          local turn = math.abs(offNose(ctx, ax, az))
          local cost = d + turn * 0.15 + (s0[#r0] - p0) * 0.05
          if turn <= MARSHAL.maxJoinTurn and (not best or cost < best.cost) then best = { st = st, r = r0, s = s0, p = p0, d = d, cost = cost } end
        end
      end
    end
    if not best then
      return say(string.format('no taxi route to catapult %d near you: none of the routes passes within %d m of you leading on within %d degrees of your nose (the nearest spot route, from spot %d, passes %.0f m from you).',
        cat, MARSHAL.maxJoin, MARSHAL.maxJoinTurn, from.spot, fd))
    end
    from, route, s, start, fd, joined = best.st, best.r, best.s, best.p, best.d, true
  end
  -- parking: the route goes on straight to the deck edge, and the jet stops with its nose wheel 6 ft short of it
  local parkStop, stationMax
  if park then
    local n = #route
    local dx, dz = route[n][1] - route[n - 1][1], route[n][2] - route[n - 1][2]
    local l = math.sqrt(dx * dx + dz * dz)
    local dE = l > 0 and edgeAhead(route[n][1], route[n][2], dx / l, dz / l) or nil
    if dE and dE <= PARK.edgeWithin then
      local r2 = {}
      for i = 1, n do r2[i] = route[i] end
      r2[n + 1] = { route[n][1] + dx / l * dE, route[n][2] + dz / l * dE }
      stationMax = s[n]
      route, s = r2, routeLengths(r2)
      parkStop = math.max(start + 5, s[n + 1] - PARK.noseFromEdge - PARK.noseGear - PARK.lead)
      logLine(string.format('marshal: %s: the deck edge is %.1f m straight on from the spot: the jet is stopped at %.1f m of the route, its nose wheel %.1f m from the edge', tostring(park.name), dE,
        parkStop + PARK.lead, PARK.noseFromEdge))
    end
  end
  local x4, z4 = routeAt(route, s, start + 4)
  local turn0 = math.abs(offNose(ctx, x4, z4))
  if not joined and turn0 > MARSHAL.maxFirstTurn then
    return say(string.format("the route from spawn spot %d to catapult %d starts %.0f degrees off your nose: you are not parked the way the spot's route leaves it. Turn the jet, or taxi off the spot and ask again.",
      from.spot, cat, turn0))
  end
  -- where the catapult's own crew takes over: the first metre of the route inside its start box
  local total = s[#route]
  local sEnd = total
  for d = 0, math.floor(total) do
    local x, z = routeAt(route, s, d)
    if cat and inBox(CAT_BOX[cat], x, z) then
      sEnd = d
      break
    end
  end
  if park then sEnd = parkStop or (total - 2) end -- to 6 ft from the edge (or, with no edge ahead, the spot itself): the last director stops the jet there
  local span = sEnd - start -- what our crew has: from where the jet is to the start box (or the spot)
  if span < 5 then
    if park then return say(string.format('you are within 5 m of %s already', tostring(park.name))) end
    return say(string.format("you are in catapult %d's start box already (or within 5 m of it): the catapult's own crew takes you from where you stand.", cat))
  end
  local r = doScan(ctx, 'for the marshalling', false)
  local ours, catDir = {}, nil
  for _, p in ipairs(r and r.mine or {}) do
    if kind(p) == 'ours' and role(p) ~= 'driver' and p.x and p.z and not (captain and captain.h == p.h) then ours[#ours + 1] = p end -- (the plane captain stays with the jet)
    if cat and tostring(p.full) == cat .. ': director' and p.x and p.z then catDir = { x = p.x, z = p.z, h = p.h, name = cat .. ': director' } end
  end
  do -- the yellow shirts direct; the brown shirt only if there is no yellow shirt at all
    local dirs = {}
    for _, q in ipairs(ours) do
      if role(q) == 'director' then dirs[#dirs + 1] = q end
    end
    if #dirs > 0 then ours = dirs end
  end
  if #ours == 0 then return say('marshalling needs people of ours (catcc-...) on your ship: none found (data patch applied?)') end
  loadAnimInfo(ours[1])
  -- the stretches and where their directors stand
  local n = math.max(1, math.min(#ours, math.ceil(span / MARSHAL.stretch)))
  local team = {}
  for k = 1, n do
    local sTo = start + span * k / n
    local sAt = math.min(sTo + MARSHAL.beyond, stationMax or 1e9) -- (parking: nobody stands beyond the spot, between the nose and the edge)
    local x, z, dx, dz = routeAt(route, s, sAt)
    local _, _, ax, az = routeAt(route, s, sAt - 10)
    local _, _, bx, bz = routeAt(route, s, sAt + 10)
    local bend = ax * bz - az * bx -- positive: the route turns right there
    local side = bend < -0.05 and 1 or -1 -- he stands on the outside of the bend (the pilot's right is (-dz, dx)); straight: the pilot's left
    -- ... if there is deck there: else the other side, else closer in (catapult 4's line runs along the deck edge)
    local px, pz
    for _, try in ipairs({ { side, MARSHAL.side }, { -side, MARSHAL.side }, { side, 5 }, { -side, 5 } }) do
      local qx, qz = x - try[1] * try[2] * dz, z + try[1] * try[2] * dx
      if standable(qx, qz) then
        px, pz, side = qx, qz, try[1]
        break
      end
    end
    if not px then
      px, pz = x - side * MARSHAL.side * dz, z + side * MARSHAL.side * dx
      logLine(string.format('marshal: no place on deck found for the director of stretch %d: left at %.1f fwd %.1f stbd', k, px, pz))
    end
    local cx, cz = routeAt(route, s, math.max(0, sAt - 15))
    local fx, fz = cx - px, cz - pz
    local m = math.sqrt(fx * fx + fz * fz)
    team[k] = { sFrom = start + span * (k - 1) / n, sTo = sTo, P = { x = px, z = pz }, fx = fx / m, fz = fz / m, left = side < 0 }
  end
  -- who goes where: for each station in turn, whoever of ours is nearest and still free
  local t = now()
  local m = { cat = cat, park = park, spot = from.spot, route = route, s = s, sEnd = sEnd, total = total, team = team, phase = 'walk', t0 = t, nextT = t, prog = start, k = 1,
    sent = 0, maxOff = 0, catDir = catDir, hold = hold or nil }
  -- does the way ahead cross the bow bubble? Then it is lowered now and raised when the jet is past it.
  local bubbleSaid = ''
  for d = math.floor(start), math.floor(total) do
    local x, z = routeAt(route, s, d)
    if math.sqrt((x - BOW_BUBBLE.x) ^ 2 + (z - BOW_BUBBLE.z) ^ 2) <= BOW_BUBBLE.r then
      m.bubble = m.bubble or { sIn = d }
      m.bubble.sOut = d
    end
  end
  if m.bubble then
    bowWhy.route = true
    bubbleSaid = ' ' .. bowBubbleUpdate(shipHandle())
    logLine(string.format('marshal: the route crosses the bow bubble between %.0f and %.0f m: lowered until the jet is at %.0f m', m.bubble.sIn, m.bubble.sOut, m.bubble.sOut + BOW_BUBBLE.clear))
  end
  camAfter, teleWait = nil, nil
  local names = {}
  for k = 1, n do
    local who, bi, bd = team[k], nil, nil
    for i, p in ipairs(ours) do
      local d = distTo(p, who.P.x, who.P.z)
      if not bd or d < bd then bi, bd = i, d end
    end
    local p = table.remove(ours, bi)
    who.h, who.name, who.home = p.h, tostring(p.name), { x = p.x, z = p.z }
    names[k] = who.name
    local ok, res, e = walkOrder(p.h, who.P.x, who.P.z, who.fx, who.fz, ctx.s, p.name)
    if not ok or not res then return say(string.format('marshalling: the walk order for %s failed: %s', who.name, tostring(ok and e or res))) end
    logLine(string.format('marshal: %s takes the stretch %.0f..%.0f m: stands at %.1f fwd %.1f stbd (%s of the route), facing %.2f %.2f; walk: %s', who.name, who.sFrom, who.sTo,
      who.P.x, who.P.z, who.left and 'left' or 'right', who.fx, who.fz, tostring(e)))
  end
  watch = nil
  marsh = m
  if park then
    logLine(string.format('marshal: to park on %s (spot %d): route of %d points, %.0f m; the jet is %.1f m along it (%.1f m off it); %d director(s)', tostring(park.name), park.spot, #route,
      total, start, fd, n))
    do -- the route itself, for whoever reads the log (and the tests)
      local pts = {}
      for i, q in ipairs(route) do pts[i] = string.format('%.2f,%.2f', q[1], q[2]) end
      logLine('marshal: route ' .. table.concat(pts, ' '))
    end
    return say(string.format('marshalling to %s (spot %d): %.0f m to go. %s walking to %s. When %s is in place he takes you: follow the signals; the last director stops you on the spot.%s',
      tostring(park.name), park.spot, total - start, table.concat(names, ', '), n > 1 and 'their stations' or 'his station', names[1], bubbleSaid .. exitNote))
  end
  logLine(string.format('marshal: spawn spot %d to catapult %d: route of %d points, %.0f m; the jet is %.1f m along it (%.1f m off it); the catapult start box begins at %.0f m; %d director(s); catapult director %s',
    from.spot, cat, #route, total, start, fd, sEnd, n, catDir and string.format('at %.1f fwd %.1f stbd', catDir.x, catDir.z) or 'not found'))
  say(string.format("marshalling to catapult %d: %.0f m to go on the route from spawn spot %d; our crew has the first %.0f m, then the catapult's own crew. %s walking to %s. %s%s%s",
    cat, total - start, from.spot, span, table.concat(names, ', '), n > 1 and 'their stations' or 'his station',
    hold and 'They wait there: nobody takes you until your plane captain releases you.' or string.format('When %s is in place he takes you: follow the signals.', names[1]),
    joined and string.format(' (You are not on a spot: that route is joined where it passes %.0f m from you.)', fd) or '', bubbleSaid))
end

-- to a parking spot of a deck area (the menu's "Marshal me to a parking spot")
function commands.park(area) return commands.marshal(nil, area) end

-- everyone of the team back to idle, and walking back to where he stood
local function marshalHome(m, ctx)
  if m.bubble and bowWhy.route then -- (ended before the jet was past the bubble: it comes up again unless something else keeps it down)
    bowWhy.route = nil
    bowBubbleUpdate(shipHandle())
  end
  for _, who in ipairs(m.team) do
    if who.h then
      toIdle(who.h)
      if ctx then walkOrder(who.h, who.home.x, who.home.z, 0, 0, ctx.s, who.name) end
    end
  end
end

local function marshalTake(m, who, t, ctx)
  m.ctl, m.sig, m.attUntil = who, nil, t + 1.4
  local ok, name = sendSignal(who.h, 'attention', { keep = true }, ctx)
  logLine(string.format('  marshal: %s takes the jet at %.0f m: attention ("%s")%s', who.name, m.prog, tostring(name), ok and '' or ' FAILED'))
end

local function tickMarshal(t)
  local m = marsh
  if not m or t < m.nextT then return end
  m.nextT = t + 0.25
  local ctx = getCtx()
  if not ctx then return end
  if m.phase == 'done' then -- the last pass is over: everyone home
    if t >= m.doneAt then
      marsh = nil
      marshalHome(m, ctx)
    end
    return
  end
  -- where the jet is on the route (forwards only), and how far off it
  local prog, off = routeNearest(m.route, m.s, ctx.jx, ctx.jz, m.prog - 3, m.prog + 25)
  m.prog = math.max(m.prog, prog)
  -- who has reached his station (asked every tick until he has; "there" stays true)
  for _, who in ipairs(m.team) do
    if not who.there then
      local a = inPlace(who, t, t)
      if a == nil then
        marsh = nil
        return say('marshalling: lost sight of ' .. who.name)
      end
      if a then
        who.there = true
        logLine(string.format('  marshal: %s is at his station (%.1f m off it) after %.0f s', who.name, who.away or 0, t - m.t0))
      end
    end
  end
  if m.phase == 'walk' then
    if m.hold or not m.team[1].there then return end
    m.phase = 'direct'
    say(string.format('marshalling: %s is in place (after %.0f s). Taxi: follow the signals.', m.team[1].name, t - m.t0))
    marshalTake(m, m.team[1], t, ctx)
    return
  end
  m.maxOff = math.max(m.maxOff, off)
  if m.bubble and bowWhy.route and m.prog >= m.bubble.sOut + BOW_BUBBLE.clear then
    bowWhy.route = nil
    logLine(string.format('  marshal: the jet is past the bow bubble (at %.0f m): %s', m.prog, bowBubbleUpdate(shipHandle())))
  end
  -- In the catapult's start box, far enough for the gear to be in it (the catapult's crew takes a jet
  -- whose gear is in the box: the nose gear is about 5.5 m ahead of the jet's position, the main gear
  -- just behind it), or at the end of our part: the catapult's own crew has the jet.
  if m.park then
    -- parking: at the end of the route the director who has the jet stops it; five seconds on, everyone goes home
    if m.prog >= m.sEnd then
      local who = m.ctl or m.team[m.k]
      local ok, name = sendSignal(who.h, 'stop', nil, ctx)
      logLine(string.format('  marshal: %s stops the jet on %s ("%s")%s; jet at %.0f m of the route, %.1f m off it', who.name, tostring(m.park.name), tostring(name), ok and '' or ' FAILED', m.prog, off))
      logLine(string.format('  marshal: over after %.0f s; %d signal changes; furthest off the route %.1f m', t - m.t0, m.sent, m.maxOff))
      say(string.format('marshalling over: you are on %s (you were at most %.1f m off the route).%s', tostring(m.park.name), m.maxOff,
        m.park.fx and ' Hold the brakes: when you stand still you are put square on the spot.' or ''))
      -- the spot itself and the way a jet spawned on it faces: the jet is put there when it stands still (tickTeleport)
      if m.park.fx then teleWait = { x = m.park.x, z = m.park.z, fx = m.park.fx, fz = m.park.fz, name = tostring(m.park.name), at = t } end
      m.phase, m.doneAt, m.ctl = 'done', t + 5, nil
      return
    end
  end
  local box = m.cat and CAT_BOX[m.cat]
  local gearIn = box and inBox(box, ctx.jx + 5.5 * ctx.fx, ctx.jz + 5.5 * ctx.fz) and inBox(box, ctx.jx - 1 * ctx.fx, ctx.jz - 1 * ctx.fz)
  if not m.park and (gearIn or m.prog >= m.sEnd + MARSHAL.gearIn) then
    local who = m.ctl or m.team[m.k]
    local ok, name = sendSignal(who.h, 'pass', m.catDir and { target = m.catDir } or { angle = 0 }, ctx)
    logLine(string.format("  marshal: %s passes control to catapult %d's crew (\"%s\")%s; jet at %.0f m of the route, %.1f m off it", who.name, m.cat, tostring(name), ok and '' or ' FAILED', m.prog, off))
    logLine(string.format('  marshal: over after %.0f s; %d signal changes; furthest off the route %.1f m', t - m.t0, m.sent, m.maxOff))
    say(string.format("marshalling over: catapult %d's own crew has you (you were at most %.1f m off the route).", m.cat, m.maxOff))
    -- (the camera stays on the catapult's own director for the hook-up: two minutes, or until the jet has left the deck)
    if m.catDir and m.catDir.h then camAfter = { h = m.catDir.h, name = m.catDir.name, untilT = t + 120, jy = ctx.jy } end
    m.phase, m.doneAt, m.ctl = 'done', t + 2, nil
    return
  end
  -- the end of a stretch: pass control to the next director
  if m.ctl and m.k < #m.team and m.prog >= m.ctl.sTo then
    local nxt = m.team[m.k + 1]
    local ok, name = sendSignal(m.ctl.h, 'pass', { target = nxt.P }, ctx)
    logLine(string.format('  marshal: %s hands over to %s at %.0f m: pass control ("%s")%s', m.ctl.name, nxt.name, m.prog, tostring(name), ok and '' or ' FAILED'))
    m.k, m.ctl, m.sig, m.takeAt = m.k + 1, nil, nil, t + 2 -- the next one takes the jet when the pass is over
    return
  end
  if not m.ctl then
    if t >= (m.takeAt or 0) then
      local who = m.team[m.k]
      if who.there then
        marshalTake(m, who, t, ctx)
      elseif not who.lateSaid then
        who.lateSaid = true
        logLine(string.format('  marshal: %s is not at his station yet (%.1f m to go): nobody signals until he is', who.name, who.away or -1))
      end
    end
    return
  end
  if t < m.attUntil then return end
  -- the signal: where the route goes 10 m ahead, seen from the jet
  local lx, lz = routeAt(m.route, m.s, m.prog + MARSHAL.lookAhead)
  local ang = offNose(ctx, lx, lz)
  local lim = (m.sig == 'left' or m.sig == 'right') and MARSHAL.turnOff or MARSHAL.turnOn
  local want = ang > lim and 'right' or (ang < -lim and 'left' or 'ahead')
  if want ~= m.sig then
    m.sig, m.sent = want, m.sent + 1
    local ok, name = sendSignal(m.ctl.h, want, nil, ctx)
    logLine(string.format('  marshal: %s signals %s ("%s")%s; jet at %.0f m of the route, %.1f m off it; the route ahead %.0f deg off the nose', m.ctl.name, want, tostring(name),
      ok and '' or ' FAILED', m.prog, off, ang))
  end
end

-- ---------------------------------------------------------------- the catapult crews' own orders
-- DCS's catapult crews (one behaviour tree each, USS_Nimitz/scripts/common.xml) wait on three orders:
--   free the catapult: with no aircraft assigned, the six walk their "free_cat" routes and the crew is
--     then not ready to be given an aircraft (the catapult is out of use);
--   take the catapult: they walk their "occupy_cat" routes back and are ready again;
--   operation allowed: with an aircraft in the start box, they wait while it is false.
-- Flight.dll exports the functions that give them (wCarrierCrew::request_free_catapult(bool),
-- set_operation_allowed(bool), reset_orders()); the native module calls them. What each really does,
-- and whether DCS's own logic (which frees the waist catapults for a landing aircraft) undoes it, is
-- what these menu items are for: the recorder logs where every crew member walks.
-- A crew is matched to its catapult by its start box (GroundCrew.lua's, CAT_BOX above).
local function catCrews(r)
  local p = r and r.mine[1]
  if not p then return nil, 'nobody found on your ship to ask through' end
  if not native.catcrews then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  local ok, t, e = pcall(native.catcrews, p.h)
  if not ok or type(t) ~= 'table' then return nil, tostring(ok and e or t) end
  t.h, t.byCat = p.h, {}
  for _, c in ipairs(t.crews) do
    if c.ok and c.x1 then
      for k, b in ipairs(CAT_BOX) do
        if math.abs(c.x1 - b[1]) < 1 and math.abs(c.x2 - b[2]) < 1 and math.abs(c.z1 - b[3]) < 1 and math.abs(c.z2 - b[4]) < 1 then c.cat, t.byCat[k] = k, c end
      end
    end
  end
  return t
end

local function withCrews(fn)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for a catapult crew command', false)
  local t, why = catCrews(r)
  if not t then return say('catapult crews: ' .. tostring(why)) end
  return fn(t, ctx, r)
end

local function onOff(v) return v == nil and '?' or (v and 'ON' or 'off') end

-- The character code's own switches (AnimatorLogic::debug_settings, four bytes; native.catcrews gives
-- them as "0101"): [2] a walker takes the velocity the collision avoidance worked out, [3] a walker asks
-- his path finder for a way to the target. With [3] off (as found 2026-11-14) a walk order is the
-- straight line, whatever the crew environment's own two switches say.
local function dbgOn(d, i) return type(d) == 'string' and d:sub(i + 1, i + 1) == '1' end
local function switchesText(avoid, pathAvoid, d)
  return string.format("crew environment: avoid collisions %s, path avoids collisions %s; character code: take the avoidance's velocity %s, use the path finder %s", onOff(avoid),
    onOff(pathAvoid), type(d) == 'string' and onOff(dbgOn(d, 2)) or '?', type(d) == 'string' and onOff(dbgOn(d, 3)) or '?')
end

-- What runs every frame for the catapult crews (tickCats): set by any catapult command.
--   catAsk   a handle on the ship to ask through, and each catapult's crew number
--   catHold  [cat] = the free order is given again every frame (run 2026-11-14: given once, the crew
--            walked off and came straight back, three times out of three)
--   ordSeen  [cat] = the crew's order bytes as last read (native.orderpeek: the places a setter was
--            seen to change), so a change made by DCS itself is logged with its time
--   crewHome [handle] = where a catapult crew member stood, and faced, before we walked him away
local catAsk, catHold, ordSeen, crewHome, allowedOff = nil, {}, {}, {}, {}

local function catsReset() catAsk, catHold, ordSeen, crewHome, allowedOff = nil, {}, {}, {}, {} end

local function rememberCrews(t)
  catAsk = { h = t.h, byCat = {} }
  for k, c in pairs(t.byCat) do catAsk.byCat[k] = c.i end
end

function commands.cats()
  withCrews(function(t)
    rememberCrews(t)
    for _, c in ipairs(t.crews) do
      local s = c.ok and (c.x1 and string.format('crew %d: start box x %.1f..%.1f, z %.1f..%.1f = catapult %s', c.i, c.x1, c.x2, c.z1, c.z2, tostring(c.cat or '?'))
        or string.format('crew %d: start box unreadable', c.i)) or string.format('crew %d: not a catapult crew', c.i)
      logLine('  ' .. s)
    end
    -- The order bytes' places are found from what a setter changes. If none are known yet, each order is
    -- switched and switched straight back on one crew (catapult 1's) inside this one call: its behaviour
    -- tree does not run in between, so the crew never sees it. From then on tickCats logs every change
    -- DCS itself makes to any catapult's orders (it frees the waist catapults for each landing aircraft).
    local c1 = t.byCat[1] or t.byCat[2]
    if c1 and native.orderpeek then
      local okp, txt = pcall(native.orderpeek, t.h, c1.i)
      if okp and txt == '' then
        local _, _, a = pcall(native.catorder, t.h, c1.i, 'allowed', false)
        pcall(native.catorder, t.h, c1.i, 'allowed', true, true)
        local _, _, f = pcall(native.catorder, t.h, c1.i, 'free', true)
        pcall(native.catorder, t.h, c1.i, 'free', false, true)
        logLine(string.format('  order bytes looked for on crew %d (each order switched and switched straight back): operation allowed off changed: %s; free changed: %s', c1.i,
          (type(a) == 'string' and a ~= '') and a or 'nothing found', (type(f) == 'string' and f ~= '') and f or 'nothing found'))
      end
    end
    local known, held, off = {}, {}, {}
    for k = 1, 4 do
      known[#known + 1] = t.byCat[k] and tostring(k) or nil
      held[#held + 1] = catHold[k] and tostring(k) or nil
      off[#off + 1] = allowedOff[k] and tostring(k) or nil
      if t.byCat[k] and native.orderpeek then
        local ok, txt = pcall(native.orderpeek, t.h, t.byCat[k].i)
        logLine(string.format('  catapult %d order bytes: %s', k, (ok and txt and txt ~= '') and txt or 'no places known yet (give one catapult an order first)'))
      end
    end
    local atc = deckNow()
    if atc then logLine('  deck: ' .. atc .. ' (asked for the report)') end
    say(string.format('catapult crews on your ship: %d (catapults %s recognised by their start boxes). Free order held on: %s. Operation allowed switched off by us on: %s. Switches: %s.%s',
      t.count, #known > 0 and table.concat(known, ', ') or 'none', #held > 0 and table.concat(held, ', ') or 'none', #off > 0 and table.concat(off, ', ') or 'none',
      switchesText(t.avoid, t.pathAvoid, t.debug), atc and (" The carrier's ATC: " .. atc .. '.') or ''))
  end)
end

-- what: "close" (operation allowed off, then the free order every frame: the crew clears and, with
-- director-test.ps1 -CatGate in DCS's crew tree, stays off whatever DCS orders), "open" (operation
-- allowed on, take the catapult; ends the hold), "free" (request_free_catapult true, once), "hold" (the
-- same, then again every frame until "take"), "take" (request_free_catapult false; ends a hold),
-- "allowoff" / "allowon" (set_operation_allowed false / true), "reset" (reset_orders); cat: 1..4
local CAT_ORDER = {
  close = { 'free', true, 'CLOSED: operation allowed off, and told to free the catapult (given again every frame until "Open it"). They should walk off and STAY off, through landings too, and leave a jet in the start box alone' },
  open = { 'free', false, 'OPEN: operation allowed on, told to take the catapult' },
  free = { 'free', true, 'told to FREE the catapult, once (on 2026-11-14 the crew walked off and came straight back)' },
  hold = { 'free', true, 'told to FREE the catapult, and the order is now given again every frame until "take it" (do they walk off and STAY off?)' },
  take = { 'free', false, 'told to TAKE the catapult' },
  allowoff = { 'allowed', false, 'operation allowed set to FALSE. Taxi into its start box: its crew should leave you alone' },
  allowon = { 'allowed', true, 'operation allowed set to TRUE: its crew should work a jet in its start box' },
  reset = { 'reset', false, 'orders reset' },
  -- wCarrierCrew::reset_LA: the crew's own "no aircraft" (what it does to a jet already on the shuttle is for the eye)
  abort = { 'dropjet', false, 'told to LET GO of its aircraft, the catapult CLOSED (Open it: the same menu)' },
}

-- The carrier's catapult control bubbles. DCS has its own command for them (woShip::setBubbleCommand,
-- exported by Transport.dll; the native module calls it), and the ship's own code moves them from it:
-- command 2 takes the bubble's model argument up to 1, command 0 or 1 takes it down to 0; the ship
-- definition lists two bubbles (GT.animation_arguments.bubbles = {138, 139}).
--   Run of 2026-11-15: both arguments stood at 1 with both bubbles UP, so the argument at 1 is the
--   bubble raised and command 2 raises it (the first build had this the wrong way round: its "down" sent
--   command 2 to a bubble that was up already). DCS gives these commands itself: the waist bubble went
--   down for a landing aircraft and came up when it had left the landing area.
--   Which is which (run of 2026-11-15, 07:30): index 0 (model argument 138) is the BOW's, index 1 (139)
--   the WAIST's (the second build had them the other way round: a route over the bow bubble lowered the
--   waist's). DCS gives the WAIST bubble its command again every frame (up while launching, down for a
--   landing); the bow's it leaves alone once set.
--   A bubble we want down is KEPT down: four times a second the command the ship holds is read
--   (native.shipcmds) and given again if DCS has changed it.
--   The rules: with catapults 1 and 2 both CLOSED the bow bubble goes down, and while a route of ours
--   crosses it; it comes up when neither holds any more.
local BUBBLE = { bow = 0, waist = 1, down = 1, up = 2 }
local BUBBLE_STATE = { [-1] = 'no such bubble', [0] = 'up (argument at 1)', [1] = 'down (argument at 0)', [2] = 'moving' }
local catClosed, bowDown = {}, false
local bubbleKeep, elevKeep = {}, {} -- [index from 0] = { cmd, n = times given again }: commands of ours that are kept
local cmdSeen, cmdT = nil, 0        -- the ship's commands as last read (tickShipCmds)

-- someone on the player's ship to ask through (the recorder's people), or nil
function shipHandle() return (next(recPeople)) end

local function bubbleSet(h, idx, cmd)
  if not native.bubble then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  if not h then return nil, 'nobody found on your ship to ask through yet' end
  local ok, st, e = pcall(native.bubble, h, idx, cmd)
  if not ok or st == nil then return nil, tostring(ok and e or st) end
  return st
end

-- The bow bubble follows the reasons for it to be down (bowWhy); returns what to say ('' if nothing changed).
function bowBubbleUpdate(h)
  local want = next(bowWhy) ~= nil
  if want == bowDown then return '' end
  local st, why = bubbleSet(h, BUBBLE.bow, want and BUBBLE.down or BUBBLE.up)
  if not st then
    logLine('bow bubble: the command failed: ' .. tostring(why))
    return '(The bow bubble could not be commanded: ' .. tostring(why) .. '.)'
  end
  bowDown = want
  bubbleKeep[BUBBLE.bow] = want and { cmd = BUBBLE.down, n = 0 } or nil
  local whys = {}
  for k in pairs(bowWhy) do whys[#whys + 1] = k end
  table.sort(whys)
  logLine(string.format('bow bubble: %s: bubble %d <- command %d; state now: %s', want and ('down for: ' .. table.concat(whys, ', ')) or 'nothing keeps it down any more', BUBBLE.bow + 1,
    want and BUBBLE.down or BUBBLE.up, BUBBLE_STATE[st] or tostring(st)))
  return want and 'The bow bubble is told to go DOWN.' or 'The bow bubble is told to come UP again.'
end

-- after a catapult was closed or opened: the bow bubble follows catapults 1 and 2
local function bowBubbleRule(h)
  bowWhy.closed = (catClosed[1] == true and catClosed[2] == true) or nil
  local said = bowBubbleUpdate(h)
  return said ~= '' and (' ' .. (bowWhy.closed and 'Catapults 1 and 2 are both closed. ' or '') .. said) or ''
end

-- Four times a second: the commands the ship holds for its bubbles and elevators. A change we did not
-- make is DCS's own (its landing and launch logic, its elevator control): logged with the time. A
-- command of ours that is kept (a bubble down, an elevator down) is given again when DCS has changed it.
local function tickShipCmds(t)
  if t < cmdT or not native or not native.shipcmds then return end
  cmdT = t + 0.25
  local h = shipHandle()
  if not h then return end
  local ok, c = pcall(native.shipcmds, h)
  if not ok or type(c) ~= 'table' then return end
  -- (a command of ours that is kept is shown as ours, with a star: DCS's own, which we overwrite four times
  -- a second, would otherwise fill the log)
  local bt, et = {}, {}
  for i = 1, 2 do bt[i] = bubbleKeep[i - 1] and (bubbleKeep[i - 1].cmd .. '*') or tostring(c.bubble and c.bubble[i] or '?') end
  for i = 1, 4 do et[i] = elevKeep[i - 1] and (elevKeep[i - 1].cmd .. '*') or tostring(c.elevator and c.elevator[i] or '?') end
  local txt = string.format('bubbles %s; elevators %s', table.concat(bt, ' '), table.concat(et, ' '))
  if txt ~= cmdSeen then
    logLine(string.format('  ship commands: %s%s', txt, cmdSeen and ('   was: ' .. cmdSeen) or ' (first reading; a bubble: 2 up, 0 or 1 down; an elevator: 1 down, 2 up, 0 none; a star: kept by us)'))
    cmdSeen = txt
  end
  for idx, k in pairs(bubbleKeep) do
    if c.bubble and c.bubble[idx + 1] and c.bubble[idx + 1] ~= k.cmd then
      k.n = k.n + 1
      pcall(native.bubble, h, idx, k.cmd, true)
      if k.n <= 3 or k.n % 500 == 0 then logLine(string.format('  bubble %d: the ship held command %d, ours is %d: given again (%d times so far)', idx + 1, c.bubble[idx + 1], k.cmd, k.n)) end
    end
  end
  for idx, k in pairs(elevKeep) do
    if c.elevator and c.elevator[idx + 1] and c.elevator[idx + 1] ~= k.cmd then
      k.n = k.n + 1
      pcall(native.elevator, h, idx, k.cmd, true)
      if k.n <= 3 or k.n % 500 == 0 then logLine(string.format('  elevator %d: the ship held command %d, ours is %d: given again (%d times so far)', idx + 1, c.elevator[idx + 1], k.cmd, k.n)) end
    end
  end
end

-- by hand: which = "1" / "2" (the bubble), cmd = "down" / "up"; or which = "report"
function commands.bubble(which, cmd)
  withCrews(function(t)
    if which == 'report' then
      local parts = {}
      for i = 0, 1 do
        local st, why = bubbleSet(t.h, i, nil)
        parts[#parts + 1] = string.format('%s bubble: %s', i == BUBBLE.bow and 'bow' or 'waist', st and (BUBBLE_STATE[st] or tostring(st)) or ('could not be read: ' .. tostring(why)))
      end
      logLine('command bubble report: ' .. table.concat(parts, '; '))
      return say(table.concat(parts, '; ') .. '.')
    end
    local idx = (which == 'bow' and BUBBLE.bow) or (which == 'waist' and BUBBLE.waist) or nil
    local c = (cmd == 'down' or cmd == 'up') and BUBBLE[cmd] or nil
    if not idx or not c then return say('unknown bubble command') end
    if idx == BUBBLE.bow then
      -- the bow's goes through its reasons: by hand down is one more; by hand up clears them all
      if cmd == 'down' then bowWhy.hand = true else bowWhy = {} end
      local said = bowBubbleUpdate(t.h)
      logLine(string.format('command bubble: the bow bubble by hand %s: %s', cmd, said ~= '' and said or 'it is told so already'))
      return say(string.format('the bow bubble told to go %s%s.', cmd == 'down' and 'DOWN, and kept down' or 'UP', said == '' and ' (it was told so already)' or ''))
    end
    local st, why = bubbleSet(t.h, idx, c)
    if not st then return say(string.format('the waist bubble: the command failed: %s', tostring(why))) end
    bubbleKeep[idx] = cmd == 'down' and { cmd = c, n = 0 } or nil
    logLine(string.format('command bubble: the waist bubble (bubble %d) <- command %d (%s); state now: %s', idx + 1, c, cmd, BUBBLE_STATE[st] or tostring(st)))
    say(cmd == 'down' and 'the waist bubble told to go DOWN, and kept down (DCS raises it again by itself while launching: ours is given again).'
      or 'the waist bubble told to go UP (DCS lowers it again by itself for a landing).')
  end)
end

function commands.catorder(what, catArg)
  local cat = tonumber(catArg)
  local o = CAT_ORDER[what or '']
  if not o then return say('unknown catapult order ' .. tostring(what)) end
  withCrews(function(t)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    if what == 'close' or what == 'open' then
      local okA, resA, eA = pcall(native.catorder, t.h, c.i, 'allowed', what == 'open')
      if not okA or not resA then return say(string.format("catapult %d's crew: the operation allowed order failed: %s", cat, tostring(okA and eA or resA))) end
      allowedOff[cat] = (what == 'close') or nil
    end
    local ok, res, chg = pcall(native.catorder, t.h, c.i, o[1], o[2])
    if not ok or not res then return say(string.format("catapult %d's crew: the order failed: %s", cat, tostring(ok and chg or res))) end
    rememberCrews(t)
    local ended = ''
    if o[1] == 'dropjet' then
      -- (2026-11-15: the crew's own "no aircraft" alone changed nothing that could be seen with the jet in
      -- the shuttle.) So the abort is now three things: the crew told to let go, the catapult closed (its
      -- crew walks off and stays off), and the jet itself moved 20 m straight back off the shuttle (the
      -- aircraft's own ForcePosition, which put the jet on a parking spot the same day).
      pcall(native.catorder, t.h, c.i, 'allowed', false)
      pcall(native.catorder, t.h, c.i, 'free', true)
      allowedOff[cat], catClosed[cat] = true, true
      catHold[cat] = { i = c.i, n = 0, undone = 0 }
      ended = ' ' .. bowBubbleRule(t.h)
      local ctx = getCtx()
      local id = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
      if ctx and type(id) == 'number' and native.forcepos and inBox({ CAT_BOX[cat][1] - 10, CAT_BOX[cat][2] + 95, CAT_BOX[cat][3] - 12, CAT_BOX[cat][4] + 12 }, ctx.jx, ctx.jz) then
        local bx, bz = ctx.jx - 20 * ctx.fx, ctx.jz - 20 * ctx.fz
        if standable(bx, bz) then
          local sh = ctx.s
          local okF, resF, eF = pcall(native.forcepos, id, ctx.fx * sh[1] + ctx.fz * sh[7], ctx.fx * sh[2] + ctx.fz * sh[8], ctx.fx * sh[3] + ctx.fz * sh[9], sh[4], sh[5], sh[6],
            ctx.fx * sh[7] - ctx.fz * sh[1], ctx.fx * sh[8] - ctx.fz * sh[2], ctx.fx * sh[9] - ctx.fz * sh[3],
            sh[10] + bx * sh[1] + ctx.jy * sh[4] + bz * sh[7], sh[11] + bx * sh[2] + ctx.jy * sh[5] + bz * sh[8], sh[12] + bx * sh[3] + ctx.jy * sh[6] + bz * sh[9])
          logLine(string.format('  abort: the jet moved 20 m straight back, from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd: %s', ctx.jx, ctx.jz, bx, bz, (okF and resF) and 'called' or ('FAILED: ' .. tostring(okF and eF or resF))))
          ended = ended .. ((okF and resF) and ' You are moved 20 m straight back, off the shuttle.' or ' Moving the jet back failed.')
        else
          ended = ended .. ' (No deck 20 m behind you: the jet is left where it is.)'
        end
      else
        ended = ended .. ' (You are not on that catapult: the jet is left where it is.)'
      end
    elseif o[1] ~= 'allowed' then
      local hd = catHold[cat]
      local holds = what == 'hold' or what == 'close'
      if hd and not holds then ended = string.format(' The hold is ended: the free order was given %d times.', hd.n) end
      catHold[cat] = holds and { i = c.i, n = 0, undone = 0 } or nil
    else
      allowedOff[cat] = (not o[2]) or nil
    end
    ordSeen[cat] = nil -- the next frame logs the order bytes afresh
    local bubble = ''
    if what == 'close' or what == 'open' then
      catClosed[cat] = (what == 'close') or nil
      bubble = bowBubbleRule(t.h)
    end
    logLine(string.format('command catorder: catapult %d (crew %d) <- %s; bytes the call changed 0 <-> 1: %s.%s', cat, c.i, what, (type(chg) == 'string' and chg ~= '') and chg or 'none found', ended))
    say(string.format("catapult %d's crew: %s.%s%s", cat, o[3], ended, bubble))
  end)
end
-- Every frame: the order bytes of each catapult's crew are read (a change since the frame before is
-- DCS's own doing, or the crew's own behaviour tree's: logged, at most 6 lines a second per catapult),
-- then a held free order is given again.
local function tickCats(t)
  if not native or not catAsk or not native.orderpeek then return end
  for cat = 1, 4 do
    local i = catAsk.byCat[cat]
    if i then
      local ok, txt = pcall(native.orderpeek, catAsk.h, i)
      if not ok or txt == nil then
        logLine('  catapult orders: the man asked through is gone; the order watch and any hold have stopped (give a catapult order again)')
        catAsk, catHold = nil, {}
        return
      end
      local s = ordSeen[cat]
      if not s then
        s = { logT = t, logN = 0, skipped = 0 }
        ordSeen[cat] = s
      end
      if txt ~= s.txt then
        if t - s.logT >= 1 then
          if s.skipped > 0 then logLine(string.format('  orders, catapult %d: %d more changes in that second, not logged', cat, s.skipped)) end
          s.logT, s.logN, s.skipped = t, 0, 0
        end
        if s.logN < 6 then
          s.logN = s.logN + 1
          logLine(string.format('  orders, catapult %d (crew %d): %s%s', cat, i, txt ~= '' and txt or '(no places known yet)', s.txt and ('   was: ' .. s.txt) or ''))
        else
          s.skipped = s.skipped + 1
        end
      end
      local hd = catHold[cat]
      if hd then
        local ok2, res = pcall(native.catorder, catAsk.h, i, 'free', true, true)
        if ok2 and res then
          hd.n = hd.n + 1
          local ok3, after = pcall(native.orderpeek, catAsk.h, i)
          if ok3 and after then
            if after ~= txt then hd.undone = hd.undone + 1 end
            txt = after
          end
        end
      end
      s.txt = txt
    end
  end
end

-- A catapult's crew walked somewhere else, and back, by our own walk orders (move_command_world: the
-- same order every test of ours has used), not by DCS's free / take routes: can PriFly put a catapult's
-- crew anywhere on the deck? Each member's place and facing are noted first. The places they are sent
-- to: six spots 2 m apart, on the deck (checked against its outline in the tests):
--   catapult 1: starboard side abeam its start box      catapult 3: starboard side, forward of the island's aft end
--   catapult 2: the port bow edge                       catapult 4: starboard side aft
local CREW_AWAY = { { 46, 29 }, { 50, -32 }, { -30, 29 }, { -100, 25 } } -- [cat] = x forward, z starboard of the first spot
local function awaySpot(cat, k) -- k 1..6: two rows of three
  local b = CREW_AWAY[cat]
  return b[1] + ((k - 1) % 3) * 2, b[2] + (k > 3 and 2 or 0)
end

local function crewMembers(r, crewNo)
  local out = {}
  for _, p in ipairs(r.mine) do
    local n = tostring(p.full or ''):match('^(%d+): ')
    if tonumber(n) == crewNo and kind(p) == 'cat' and p.movable and p.x and p.y then out[#out + 1] = p end
  end
  table.sort(out, function(a, b) return tostring(a.name) < tostring(b.name) end)
  return out
end

function commands.crewaway(catArg)
  local cat = tonumber(catArg)
  withCrews(function(t, ctx, r)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    rememberCrews(t)
    local sent, left, k = {}, {}, 0
    local members, deckY = crewMembers(r, c.i), -1e9
    for _, p in ipairs(members) do deckY = math.max(deckY, p.y) end
    for _, p in ipairs(members) do
      if p.y < deckY - 0.5 then
        left[#left + 1] = tostring(p.name) -- not on the flight deck (catapult 4's white2 stands on the catwalk, 1.3 m lower): left where he is
      else
        k = k + 1
        if not crewHome[p.h] then
          local ok, _, x, _, z, _, fx, fz = pcall(native.state, p.h, true)
          crewHome[p.h] = { x = (ok and x) or p.x, z = (ok and z) or p.z, fx = (ok and fx) or 0, fz = (ok and fz) or 0, name = tostring(p.name), cat = cat }
        end
        local tx, tz = awaySpot(cat, k)
        local ok, res, e = walkOrder(p.h, tx, tz, 0, 0, ctx.s, p.name)
        logLine(string.format('command crewaway: catapult %d %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd: %s', cat, tostring(p.name), p.x, p.z, tx, tz,
          (ok and res) and tostring(e) or ('FAILED: ' .. tostring(ok and e or res))))
        if ok and res then sent[#sent + 1] = tostring(p.name) end
      end
    end
    if #sent == 0 then return say(string.format("catapult %d's crew: nobody could be sent (see the log)", cat)) end
    say(string.format("catapult %d's crew sent to %.0f m fwd, %.0f m stbd by our own walk orders: %s.%s Do they go, and stay there? (The log records where each walks.)", cat,
      CREW_AWAY[cat][1], CREW_AWAY[cat][2], table.concat(sent, ', '), #left > 0 and (' Left where he is (not on the flight deck): ' .. table.concat(left, ', ') .. '.') or ''))
  end)
end

function commands.crewback(catArg)
  local cat = tonumber(catArg)
  withCrews(function(t, ctx, r)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    local sent = {}
    for _, p in ipairs(crewMembers(r, c.i)) do
      local hm = crewHome[p.h]
      if hm then
        local ok, res, e = walkOrder(p.h, hm.x, hm.z, hm.fx, hm.fz, ctx.s, p.name)
        logLine(string.format('command crewback: catapult %d %s to %.1f fwd %.1f stbd, to face %.2f %.2f: %s', cat, tostring(p.name), hm.x, hm.z, hm.fx, hm.fz,
          (ok and res) and tostring(e) or ('FAILED: ' .. tostring(ok and e or res))))
        -- (his place is kept: it is where he stood before we first sent him anywhere, whatever happens to this order)
        if ok and res then sent[#sent + 1] = tostring(p.name) end
      end
    end
    if #sent == 0 then return say(string.format("catapult %d's crew: nobody of it was sent away by us", cat)) end
    say(string.format("catapult %d's crew sent back to where they stood: %s.", cat, table.concat(sent, ', ')))
  end)
end

-- The switches that decide whether a walker goes round things. which:
--   "path"  path finding on: the environment's "path avoids collisions" (it then keeps its navigation
--           grid filled with the objects on deck) and the character code's "use the path finder"
--   "vel"   the avoidance's velocity on: the environment's "avoid collisions" and the character code's
--           "take the avoidance's velocity"
--   "none"  all four off, as DCS had them (deck crew option off, 2026-11-14)
--   "report" nothing changed
function commands.avoid(which)
  withCrews(function(t)
    if not native.envflags or not native.debugset then return say('this needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
    local a, p, d2, d3 = -1, -1, nil, nil
    if which == 'path' then
      p, d3 = 1, 1
    elseif which == 'vel' then
      a, d2 = 1, 1
    elseif which == 'none' then
      a, p, d2, d3 = 0, 0, 0, 0
    elseif which ~= 'report' then
      return say('unknown switch ' .. tostring(which))
    end
    local ok, av, pa = pcall(native.envflags, t.h, a, p)
    if not ok or av == nil then return say('collision avoidance: the environment switches could not be set: ' .. tostring(pa or av)) end
    if d2 then pcall(native.debugset, 2, d2) end
    if d3 then pcall(native.debugset, 3, d3) end
    local ok2, b0, b1, b2, b3 = pcall(native.debugset)
    local d = (ok2 and b0) and string.format('%d%d%d%d', b0, b1, b2, b3) or nil
    local text = switchesText(av, pa, d)
    logLine(string.format('command avoid %s: %s (the four bytes: %s)', tostring(which), text, tostring(d)))
    say(text .. (which == 'report' and '.' or '. Wait 10 s (the navigation grid is refilled on a timer), then "Target: walk > To the far side of my jet".'))
  end)
end

-- The carrier's four elevators by hand: DCS's own command (woShip::setElevatorCommand, the call the
-- BetteraircraftCarrier mod makes). which = "1".."4", cmd = "down" / "up"; or which = "report".
--   What the commands do, from the ship's own code (Transport.dll) and the run of 2026-11-15:
--   command 1 lowers: the fence at the deck edge comes up, the platform goes down, and at the bottom the
--     hangar door behind it opens (the door is one of the elevator's own model arguments:
--     GT.animation_arguments.elevators_doors) and the lower fence goes down;
--   command 2 raises: the same backwards (door shut first); it also stops a lowering under way;
--   command 0 leaves everything where it is.
--   Given once, command 1 took the platform down and at the bottom it came straight back up: DCS's own
--   elevator control (the ATC's, for AI aircraft struck below) had told it to. So "down" is KEPT here
--   (tickShipCmds gives it again whenever the ship holds another command) until "up".
local ELEV_STATE = { [-1] = 'no such elevator', [0] = 'up (argument at 0)', [1] = 'down (argument at 1)', [2] = 'moving' }
local ELEV_CMD = { down = 1, up = 2 }
-- The hangar door opens from the moment the elevator is told to go down (asked for 2026-11-15), not only
-- when the platform has reached the bottom as DCS's own sequence has it. The door is one of the ship's
-- model arguments (GT.animation_arguments.elevators_doors = {47, 48, 53, 54}, the same on every Nimitz
-- class ship of the module; 0 shut, 1 open), and while the platform is on its way down DCS's sequence
-- leaves it alone: so the hook moves it itself, every frame, at DCS's own door speed (open in 6 s),
-- through the ship's own list of model arguments (native.shiparg). When the platform is down DCS finds
-- the door open already and goes on to the lower fence. Going up is left as DCS has it (door shut first).
-- What is drawn on this PC only: another player's PC opens the door when its own copy of this runs.
--   Going UP (2026-11-15: "the doors don't need to close before the elevator can ascend"): DCS's own
--   sequence for "raise" is lower fence up, door SHUT, platform up, deck-edge fence down. Here the door is
--   held open (written back to open every frame: DCS's sequence then never gets past its door step) and
--   the hook moves the platform and the deck-edge fence itself, at DCS's own speeds (platform 17 s, a fence
--   4 s), once the lower fence is up. The door then stays open until "Shut the hangar doors", which lets
--   DCS's sequence finish (door shut).
-- The elevators' model arguments, per elevator 1..4 (GT.animation_arguments of the ship's definition):
local ELEV_DOOR = { args = { 47, 48, 53, 54 }, secs = 6, plat = { 57, 58, 59, 60 }, top = { 27, 29, 31, 33 }, bottom = { 28, 30, 32, 34 }, platSecs = 17, fenceSecs = 4 }
local doorOpen = {} -- [elevator index from 0] = { arg, t = when it was last moved }: a door being opened
local elevRise = {} -- [elevator index from 0] = { t, t0, phase }: an elevator we are raising, and whose door we hold open

local function tickDoors(t)
  if not (next(doorOpen) or next(elevRise)) or not native or not native.shiparg then return end
  local h = shipHandle()
  if not h then return end
  local function arg(n, v)
    local ok, r = pcall(native.shiparg, h, n, v)
    return (ok and type(r) == 'number') and r or nil
  end
  for idx, d in pairs(doorOpen) do
    local v = arg(d.arg)
    if not v then
      doorOpen[idx] = nil
      logLine(string.format('  elevator %d: the hangar door (model argument %d) cannot be read: left to DCS', idx + 1, d.arg))
    elseif v >= 0.999 then
      doorOpen[idx] = nil
      logLine(string.format('  elevator %d: the hangar door is open (%.0f s after the elevator was told to go down)', idx + 1, t - d.t0))
    elseif t > d.t then
      arg(d.arg, math.min(1, v + (t - d.t) / ELEV_DOOR.secs))
      d.t = t
    end
  end
  for idx, r in pairs(elevRise) do
    local dt = math.max(0, t - r.t)
    r.t = t
    local i = idx + 1
    local door, bottom, plat, top = arg(ELEV_DOOR.args[i]), arg(ELEV_DOOR.bottom[i]), arg(ELEV_DOOR.plat[i]), arg(ELEV_DOOR.top[i])
    if not (door and bottom and plat and top) then
      elevRise[idx] = nil
      logLine(string.format('  elevator %d: its model arguments cannot be read: the raising is left to DCS', i))
    else
      if door < 0.999 then arg(ELEV_DOOR.args[i], 1) end -- held open
      if r.phase ~= 'up' and dt > 0 then
        if bottom < 0.999 then
          arg(ELEV_DOOR.bottom[i], math.min(1, bottom + dt / ELEV_DOOR.fenceSecs))
        elseif plat > 0.001 then
          arg(ELEV_DOOR.plat[i], math.max(0, plat - dt / ELEV_DOOR.platSecs))
        elseif top > 0.001 then
          arg(ELEV_DOOR.top[i], math.max(0, top - dt / ELEV_DOOR.fenceSecs))
        else
          r.phase = 'up'
          logLine(string.format('  elevator %d: at the flight deck after %.0f s, its hangar door still open', i, t - r.t0))
        end
      end
    end
  end
end

-- Nobody of ours rides an elevator down (2026-11-15: our people stay at deck height, so they hung in the
-- air over a lowered platform). Anyone of ours standing on the platform is walked off it, inboard, and
-- the elevator is lowered when the last of them is clear (or after `wait` seconds whatever). The
-- platforms, in ship coordinates { x from, x to, z from, z to }: from the deck outline and the spots
-- drawn on them (about 27 m along the deck edge, 16 m deep), with a margin.
local ELEV_BOX = { { 15.5, 42.5, 20, 40 }, { -31.5, -4.5, 20, 40 }, { -111.5, -83.8, 20, 40 }, { -117.5, -90, -40, -20 } }
local ELEV_CLEAR = { inboard = 15, step = 1.5, wait = 40 }
local elevWait = {} -- [elevator 1..4] = { t0, people = { { h, name } } }: lowered when they are off it
function commands.elevator(which, cmd, cleared)
  withCrews(function(t)
    if not native.elevator then return say('this needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
    if which == 'report' then
      local parts = {}
      for i = 0, 3 do
        local ok, st, e = pcall(native.elevator, t.h, i)
        parts[#parts + 1] = string.format('elevator %d: %s', i + 1, (ok and st ~= nil) and (ELEV_STATE[st] or tostring(st)) or ('could not be read: ' .. tostring(ok and e or st)))
      end
      logLine('command elevator report: ' .. table.concat(parts, '; '))
      return say(table.concat(parts, '; ') .. '.')
    end
    if which == 'shut' then
      -- the doors we hold open are let go: DCS's own "raise" sequence shuts them
      local n = 0
      for idx in pairs(elevRise) do
        n = n + 1
        elevRise[idx] = nil
        pcall(native.elevator, t.h, idx, ELEV_CMD.up)
      end
      logLine(string.format('command elevator shut: %d hangar door(s) let go', n))
      return say(n > 0 and string.format('%d hangar door(s) let go: DCS shuts them.', n) or 'no hangar door is being held open by us.')
    end
    local idx, c = tonumber(which), ELEV_CMD[cmd or '']
    if not (idx and idx >= 1 and idx <= 4 and c) then return say('unknown elevator command') end
    if cmd == 'up' then elevWait[idx] = nil end
    if cmd == 'down' and not cleared then
      local ctx = getCtx()
      local r = ctx and doScan(ctx, 'for the elevator', false)
      local on = {}
      for _, q in ipairs(r and r.mine or {}) do
        if kind(q) == 'ours' and q.x and q.z and inBox(ELEV_BOX[idx], q.x, q.z) then on[#on + 1] = q end
      end
      if #on > 0 then
        local side, names, people = idx == 4 and -1 or 1, {}, {}
        for k, q in ipairs(on) do
          local zTo = side * (ELEV_CLEAR.inboard - ELEV_CLEAR.step * (k - 1))
          holding[q.h] = nil
          walkOrder(q.h, q.x, zTo, 0, side, ctx.s, q.name)
          names[k], people[k] = tostring(q.name), { h = q.h, name = tostring(q.name) }
          logLine(string.format('  elevator %d: %s stands on it (%.1f fwd %.1f stbd): walked off to %.1f fwd %.1f stbd', idx, tostring(q.name), q.x, q.z, q.x, zTo))
        end
        elevWait[idx] = { t0 = now(), people = people }
        return say(string.format('elevator %d: %s of ours on it (%s): walking off first. It goes down when they are clear.', idx, #on == 1 and 'one' or tostring(#on), table.concat(names, ', ')))
      end
    end
    local ok, st, e = pcall(native.elevator, t.h, idx - 1, c)
    if not ok or st == nil then return say(string.format('elevator %d: the command failed: %s', idx, tostring(ok and e or st))) end
    elevKeep[idx - 1] = cmd == 'down' and { cmd = c, n = 0 } or nil
    doorOpen[idx - 1] = (cmd == 'down' and native.shiparg) and { arg = ELEV_DOOR.args[idx], t = now(), t0 = now() } or nil
    elevRise[idx - 1] = (cmd == 'up' and native.shiparg) and { t = now(), t0 = now() } or nil
    logLine(string.format('command elevator: elevator %d <- command %d (%s); state now: %s%s', idx, c, cmd, ELEV_STATE[st] or tostring(st),
      doorOpen[idx - 1] and string.format('; its hangar door (model argument %d) opens from now', ELEV_DOOR.args[idx]) or ''))
    say(cmd == 'down' and string.format('elevator %d told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?', idx)
      or string.format('elevator %d told to come UP%s.', idx, elevRise[idx - 1] and ', its hangar door left open (Elevators > Shut the hangar doors)' or ''))
  end)
end

local elevWaitT = 0
local function tickElevWait(t)
  if t < elevWaitT or not native then return end
  elevWaitT = t + 0.25
  for idx, w in pairs(elevWait) do
    local left = 0
    for _, q in ipairs(w.people) do
      local ok, st, x, _, z = pcall(native.state, q.h, false)
      if ok and st ~= nil and x and z and inBox(ELEV_BOX[idx], x, z) then left = left + 1 end
    end
    if left == 0 or t - w.t0 > ELEV_CLEAR.wait then
      elevWait[idx] = nil
      logLine(string.format('  elevator %d: %s after %.0f s: lowered now', idx, left == 0 and 'everyone of ours is off it' or (left .. ' of ours still on it'), t - w.t0))
      commands.elevator(idx, 'down', true)
    end
  end
end

-- the platforms nobody may walk across now: an elevator we hold down, one waiting to go down (its people walking off),
-- one on its way up. (z: the starboard ones' inboard side is their low-z side, elevator 4's its high-z side)
Walk.blocks = function()
  local out = {}
  for idx = 1, 4 do
    if elevKeep[idx - 1] or elevWait[idx] or elevRise[idx - 1] then
      local b = ELEV_BOX[idx]
      out[#out + 1] = { b[1], b[2], b[3], b[4], zin = idx == 4 and (b[4] + Walk.round) or (b[3] - Walk.round), idx = idx }
    end
  end
  return out
end

-- ---------------------------------------------------------------- the plane captain
-- One of ours as the jet's plane captain, start to taxi (a first version; every step is a menu item,
-- standing in for what PriFly and the jet itself will trigger):
--   come     he walks out to a point 11 m ahead of the nose and 3.5 m to the pilot's left (the right, or
--            straight ahead, if there is no deck there), faces the jet and, once he STANDS there, signals
--            "hold brakes"
--   cat      "My catapult: N": the catapult this jet launches from (PriFly's launch plan will say)
--   start    the engine signals: "run up engine" held 6 s and a thumbs-up, for the pilot's RIGHT engine
--            then the left (the animations are named for the signaller's own side, as the turn signals
--            are: "_l" is the pilot's right; 2026-11-15, the first build had them the other way round).
--            With a catapult set, the directors walk out to their stations along the route as the first
--            engine signal is given, and wait there.
--   release  (PriFly's release) "release brakes" (no "unfold wings": that is the catapult's shooter's,
--            on the line-up); then, with a catapult set, he passes control to the first director, who
--            takes the jet; without one he salutes. Then he walks back to where he stood.
--   home     he walks back at once
-- The signals are the deck crew's own animations (sign_setbrakes, sign_runupengine_r / _l, sign_ok_r / _l,
-- sign_releasebrakes, sign_salut); a one-shot's length is the animation's own.
local CAPTAIN = { ahead = 11, side = 3.5, runUp = 6 }

local function captainPlay(c, name, mode)
  local full = name
  if nightOn[c.h] and DUR['night_' .. name] then full = 'night_' .. name end -- (not every signal has a night version)
  holding[c.h] = nil
  local ok, res, e = pcall(native.play, c.h, full, mode)
  logLine(string.format('  captain: %s plays "%s" (%s)%s', c.name, full, mode == 2 and 'held' or 'once', (ok and res) and '' or (' FAILED: ' .. tostring(ok and e or res))))
  return DUR[full] or 3
end

-- the steps of a sequence: { animation, held seconds or false for a one-shot }
local function captainRun(c, steps, t, after)
  c.steps, c.step, c.stepUntil, c.after = steps, 0, t, after
end

function commands.captain(what, arg)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local t = now()
  if what == 'come' then
    if captain then return say(string.format('%s is your plane captain already (F10 > Plane captain > Send him home ends it)', captain.name)) end
    if demo or sigtest or marsh then return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)') end
    local r = doScan(ctx, 'for the plane captain', false)
    local best, bd, bs
    for _, p in ipairs(r and r.mine or {}) do
      local d = (kind(p) == 'ours' and role(p) ~= 'driver') and distTo(p, ctx.jx, ctx.jz)
      if d then
        local sc = role(p) == 'captain' and d - 1e6 or d -- the brown shirt, wherever he stands; else the nearest of ours
        if not bs or sc < bs then best, bd, bs = p, d, sc end
      end
    end
    if not best then return say('a plane captain needs people of ours (catcc-...) on your ship: none found') end
    loadAnimInfo(best)
    -- the pilot's left of the nose is (fz, -fx)
    local px, pz
    for _, side in ipairs({ CAPTAIN.side, -CAPTAIN.side, 0 }) do
      local qx, qz = ctx.jx + CAPTAIN.ahead * ctx.fx + side * ctx.fz, ctx.jz + CAPTAIN.ahead * ctx.fz - side * ctx.fx
      if standable(qx, qz) then
        px, pz = qx, qz
        break
      end
    end
    if not px then return say('there is no deck 11 m ahead of your nose for a plane captain to stand on') end
    local ok, res, e = walkOrder(best.h, px, pz, -ctx.fx, -ctx.fz, ctx.s, best.name)
    if not ok or not res then return say(string.format('plane captain: the walk order for %s failed: %s', tostring(best.name), tostring(ok and e or res))) end
    captain = { h = best.h, name = tostring(best.name), home = { x = best.x, z = best.z }, P = { x = px, z = pz }, phase = 'walk', t0 = t }
    logLine(string.format('command captain come: %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd (the jet at %.1f fwd %.1f stbd, nose %.2f %.2f): %s', captain.name, best.x, best.z, px, pz,
      ctx.jx, ctx.jz, ctx.fx, ctx.fz, tostring(e)))
    return say(string.format('%s is your plane captain: walking out to you (%.0f m). When he is in place he signals "hold brakes".', captain.name, bd))
  end
  if what == 'cat' then
    local cat = tonumber(arg)
    if not (cat and CAT_BOX[cat]) then return say('unknown catapult ' .. tostring(arg)) end
    launchCat = cat
    logLine(string.format('command captain cat: this jet launches from catapult %d', cat))
    return say(string.format('your catapult is %d: the directors walk out to the route there when the engine start signals begin, and take you when the plane captain releases you.', cat))
  end
  local c = captain
  if not c then return say('you have no plane captain yet (F10 > Plane captain > Come to my jet)') end
  if what == 'home' then
    captain = nil
    toIdle(c.h)
    walkOrder(c.h, c.home.x, c.home.z, 0, 0, ctx.s, c.name)
    return say(c.name .. ' walks back to where he stood.')
  end
  if c.phase == 'walk' then return say(c.name .. ' is still on his way to you') end
  if what == 'start' then
    captainRun(c, { { 'sign_runupengine_l', CAPTAIN.runUp }, { 'sign_ok_l', false }, { 'sign_runupengine_r', CAPTAIN.runUp }, { 'sign_ok_r', false } }, t)
    say(c.name .. ': engine start signals (your right engine, thumbs-up, your left engine, thumbs-up).')
    -- the directors set out now, so that they are in place when the jet is ready
    if launchCat and not (demo or sigtest or marsh) then commands.marshal(tostring(launchCat), nil, true) end
    return
  end
  if what == 'release' then
    local cat = tonumber(arg) or launchCat
    if cat and not (marsh and marsh.hold and marsh.cat == cat) and (demo or sigtest or marsh) then
      return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)')
    end
    captainRun(c, { { 'sign_releasebrakes', false } }, t, cat and { cat = cat } or { salute = true })
    return say(string.format('%s: released. Release brakes%s.', c.name, cat and string.format(', then our directors take you to catapult %d', cat) or ', then his salute'))
  end
  say('unknown plane captain command ' .. tostring(what))
end

local function tickCaptain(t)
  local c = captain
  if not c or not native then return end
  if c.phase == 'walk' then
    local a = inPlace(c, c.t0, t)
    if a == nil then
      captain = nil
      return say('plane captain: lost sight of ' .. c.name)
    end
    if not a then return end
    c.phase = 'there'
    logLine(string.format('  captain: %s is in place (%.1f m off his point) after %.0f s', c.name, c.away or 0, t - c.t0))
    captainRun(c, { { 'sign_setbrakes', false } }, t)
    say(string.format('%s is in place: hold brakes. F10 > Plane captain: engine start signals, then release.', c.name))
  end
  if not c.steps or t < c.stepUntil then return end
  c.step = c.step + 1
  local s = c.steps[c.step]
  if s then
    local len = captainPlay(c, s[1], s[2] and 2 or 1)
    c.stepUntil = t + (s[2] or len)
    return
  end
  -- the sequence is over
  local after = c.after
  c.steps, c.after = nil, nil
  local ctx = getCtx()
  toIdle(c.h)
  if c.leaving then -- the pass or the salute is done: home
    captain = nil
    if ctx then walkOrder(c.h, c.home.x, c.home.z, 0, 0, ctx.s, c.name) end
    logLine(string.format('  captain: %s walks back to where he stood', c.name))
    return
  end
  if not after then return end
  if after.cat then
    -- the directors: waiting at their stations since the engine start, or sent out now
    if not marsh then commands.marshal(tostring(after.cat)) end
    if marsh and marsh.cat == after.cat then marsh.hold = nil end
    if marsh and marsh.team[1] then
      sendSignal(c.h, 'pass', { target = marsh.team[1].P }, ctx)
      logLine(string.format('  captain: %s passes control to %s', c.name, tostring(marsh.team[1].name)))
    end
  else
    captainPlay(c, 'sign_salut', 1)
  end
  c.steps, c.step, c.stepUntil, c.leaving = {}, 0, t + 3, true -- three seconds for the pass / the salute, then home
end

-- ---------------------------------------------------------------- the cockpit camera follows the director
-- While the jet is being marshalled the cockpit view turns by itself to whoever is signalling: the
-- director who has the jet (or the next one, standing at his station, between a pass and a take), the
-- plane captain while he stands at the nose, and after our last director has handed over, the catapult's
-- own director for the hook-up. On by itself; "Our crew > Camera follows the director: on / off" switches it.
--   How: the export interface's LoSetCommand with view command 2007 (in DCS's own list: camera rotate
--   left / right) and the camera's own direction read back every time (LoGetCameraPosition). What the
--   command's value MEANS is not written down anywhere we can read, and the first build guessed wrong: it
--   took the value for an angle to go to and sent it twenty times a second; on 2026-11-15 the view swung
--   round to its stop behind the jet (172 degrees) and stayed there. The value is an amount to turn BY
--   (as mouse movement is). So now nothing is assumed:
--     1. a first, very small value is sent once and the camera's turn measured (too small to see: sent
--        again four times larger, up to 0.5; no answer at all: said, and the camera is left alone);
--     2. then a zero is sent, and then the same small value again: a camera that stays where it is on
--        the zero and turns as much again on the repeat takes the value as a turn (degrees per unit
--        measured); one that goes to straight ahead on the zero and back to the same place on the repeat
--        takes it as an angle;
--     3. from then on the camera is steered by the ERROR: every tick, the angle between where the camera
--        looks and where the signaller is, and a value that takes out a third of it; within 0.6 degrees
--        nothing is sent. The degrees per unit are kept up to date from every turn the camera makes.
--   Only left / right is driven: up / down and zoom stay as the pilot has them. Only in the cockpit: the
--   camera has to be within 9 m of the jet (an outside view is left alone).
--   Smoothness (2026-11-15: the first working build stepped the view twenty times a second, a third of
--   the error at a time, stop and go at 0.6 degrees: correct, but a judder that was hard to look at in
--   turns). Now: every frame; the angle to the signaller is worked out in SHIP coordinates only (the
--   pilot's seat from the jet's place on the ship, the man's place on the ship: no mixing of two readings
--   of where the ship is in the world, which at 25 knots are a frame apart); the camera closes on him with
--   a time constant (0.2 s) and at no more than 80 degrees a second; nothing is sent within 0.05 degrees.
local CAM = { cmd = 2007, tick = 0.05, maxAz = 150, near = 9, seat = 3.5, probe = 0.002, probeMax = 0.5, seen = 0.15, tau = 0.2, rate = 80, dead = 0.05, smooth = 0.25 }
local camOn = true -- (kept over missions: the pilot's choice)
-- mode: nil not known yet, 'turn' (the value turns the camera: g degrees per unit) or 'angle' (the value is
-- where it looks: k degrees per unit); both kept for the session once found
local cam = { mode = nil, g = nil, k = nil, id = nil, nextT = 0, who = nil, logT = 0, dead = false, fed = 0, last = 0 }

local function camSend(v)
  if Export and Export.LoSetCommand then
    pcall(Export.LoSetCommand, CAM.cmd, v)
  else
    pcall(net.dostring_in, 'export', string.format('LoSetCommand(%d, %.5f)', CAM.cmd, v))
  end
end

-- who the camera should be on now: his handle and name, or nil
local function camTarget(t, ctx)
  local m = marsh
  if m and m.phase ~= 'done' then
    if m.ctl then return m.ctl.h, m.ctl.name end
    local nxt = m.team[m.k]
    if nxt and nxt.there and not m.hold then return nxt.h, nxt.name end
  end
  if demo and demo.ctl then return demo.ctl.h, demo.ctl.name end
  local c = captain
  if c and c.phase == 'there' and not c.leaving then return c.h, c.name end
  if camAfter then
    if t > camAfter.untilT or (ctx and ctx.jy > camAfter.jy + 3) then
      camAfter = nil
    else
      return camAfter.h, camAfter.name
    end
  end
end

local function tickCamera(t)
  if not camOn or cam.dead or not native then return end
  if not (marsh or captain or camAfter or demo) then
    cam.who = nil
    return
  end
  local ctx = getCtx()
  if not ctx then return end
  local h, name = camTarget(t, ctx)
  if not h then
    cam.who = nil
    return
  end
  if not (Export and Export.LoGetCameraPosition) then
    cam.dead = true
    return logLine('camera: the export interface has no LoGetCameraPosition here: the camera cannot be followed')
  end
  local okc, cp = pcall(Export.LoGetCameraPosition)
  local oks, st, x, y, z = pcall(native.state, h, false)
  if not (okc and type(cp) == 'table' and cp.p and cp.x and oks and st ~= nil and x and z) then return end
  local s = ctx.s
  local function world(f, u, r) return s[10] + f * s[1] + u * s[4] + r * s[7], s[11] + f * s[2] + u * s[5] + r * s[8], s[12] + f * s[3] + u * s[6] + r * s[9] end
  local jx, jy, jz = world(ctx.jx, ctx.jy, ctx.jz)
  if math.sqrt((cp.p.x - jx) ^ 2 + (cp.p.y - jy) ^ 2 + (cp.p.z - jz) ^ 2) > CAM.near then -- not in the cockpit: left alone
    cam.who = nil
    return
  end
  -- where he is, seen from the pilot's seat: degrees off the nose, positive to the right (ship coordinates)
  local ex, ez = ctx.jx + CAM.seat * ctx.fx, ctx.jz + CAM.seat * ctx.fz
  local want = math.deg(atan2(ctx.fx * (z - ez) - ctx.fz * (x - ex), ctx.fx * (x - ex) + ctx.fz * (z - ez)))
  -- where the camera looks: its own direction against the nose's (directions only)
  local nx, nz = ctx.fx * s[1] + ctx.fz * s[7], ctx.fx * s[3] + ctx.fz * s[9]
  local have = wrap180(math.deg(atan2(cp.x.z, cp.x.x)) - math.deg(atan2(nz, nx)))
  want = math.max(-CAM.maxAz, math.min(CAM.maxAz, want))
  if cam.who ~= h then
    cam.who, cam.fed = h, 0
    logLine(string.format('camera: on %s, %.0f deg off the nose; the camera looks %.0f deg off it; %s', tostring(name), want, have,
      cam.mode == 'turn' and string.format('the view command turns it %.0f deg a unit', cam.g) or (cam.mode == 'angle' and string.format('the view command is an angle, %.0f deg a unit', cam.k)
        or 'what the view command does is found out first')))
  end
  local err = wrap180(want - have)
  -- 1 and 2: what the command does (once a session)
  if not cam.mode then
    local id = cam.id
    if not id then
      if math.abs(err) < 2 then return end -- (looking at him already: nothing to find out with)
      id = { p = CAM.probe * (err < 0 and -1 or 1), step = 1 }
      cam.id = id
    end
    if id.step == 1 then
      id.have0, id.t, id.step = have, t, 2
      return camSend(id.p)
    end
    if t - id.t < 2 * CAM.tick then return end
    if id.step == 2 then
      id.s1 = wrap180(have - id.have0)
      if math.abs(id.s1) < CAM.seen then
        -- (no turn to see: the other way first, in case the camera stands against its stop on this side; then four times larger)
        if not id.flipped then
          id.p, id.flipped, id.step = -id.p, true, 1
          return
        end
        id.flipped = false
        if math.abs(id.p) * 4 > CAM.probeMax then
          cam.dead, cam.id = true, nil
          logLine(string.format('camera: the view did not answer command %d (values up to %.3f turned it %.2f deg): following is off', CAM.cmd, math.abs(id.p), id.s1))
          return say('the cockpit camera did not answer the view command: it is not being turned for you (see the log).')
        end
        id.p, id.step = -id.p * 4, 1
        return
      end
      id.have1, id.t, id.step = have, t, 3
      return camSend(0)
    end
    if id.step == 3 then
      id.have2, id.t, id.step = have, t, 4
      return camSend(id.p)
    end
    local s2, s3 = wrap180(id.have2 - id.have1), wrap180(have - id.have2)
    if math.abs(s2) < 0.35 * math.abs(id.s1) and math.abs(s3 - id.s1) < 0.5 * math.abs(id.s1) then
      cam.mode, cam.g = 'turn', (id.s1 + s3) / (2 * id.p)
      logLine(string.format('camera: the view command TURNS the camera: the value %.4f turned it %.2f deg, a zero left it there (%.2f), the value again turned it %.2f: %.0f deg a unit', id.p,
        id.s1, s2, s3, cam.g))
    elseif math.abs(id.have2) <= 0.05 + 0.3 * math.abs(id.have1) and math.abs(have - id.have1) <= 0.05 + 0.2 * math.abs(id.have1) and math.abs(id.have1 / id.p) >= 5 then
      cam.mode, cam.k = 'angle', id.have1 / id.p
      logLine(string.format('camera: the view command is an ANGLE: the value %.4f put it %.2f deg off the nose, a zero put it at %.2f, the value again at %.2f: %.0f deg a unit', id.p,
        id.have1, id.have2, have, cam.k))
    else
      cam.dead = true
      logLine(string.format('camera: what command %d does could not be made out (the value %.4f turned it %.2f deg, a zero then %.2f, the value again %.2f): following is off', CAM.cmd, id.p,
        id.s1, s2, s3))
      say('the cockpit camera could not be steered (see the log): it is left alone.')
    end
    cam.id, cam.last = nil, 0
    return
  end
  -- 3: steering
  local v
  local dt = math.min(0.1, math.max(0.001, t - (cam.sentT or (t - CAM.tick))))
  if cam.mode == 'turn' then
    if math.abs(err) < CAM.dead then
      v = 0
      if cam.last ~= 0 then camSend(0) end -- (once, when he comes into view: a value that kept turning the camera would stop here)
    else
      local step = err * (1 - math.exp(-dt / CAM.tau))
      local cap = CAM.rate * dt
      v = math.max(-cap, math.min(cap, step)) / cam.g
      camSend(v)
    end
  else
    local goal = math.max(-1, math.min(1, want / cam.k))
    v = cam.last + (goal - cam.last) * math.min(1, dt / CAM.smooth)
    if math.abs(err) >= CAM.dead or math.abs(goal - v) > 1e-4 then camSend(v) end
  end
  cam.last, cam.sentT = v, t
  cam.fed = cam.fed + 1
  if t - cam.logT >= 5 then
    cam.logT = t
    logLine(string.format('  camera: %s %.0f deg off the nose, the camera at %.0f, value %.5f, %.0f deg a unit (%s)', tostring(name), want, have, v, cam.g or cam.k, cam.mode))
  end
end

function commands.camfollow()
  camOn = not camOn
  cam.dead, cam.who, cam.id = false, nil, nil
  if not camOn and cam.mode == 'turn' and cam.last ~= 0 then camSend(0) end
  cam.last = 0
  logLine('command camfollow: ' .. (camOn and 'on' or 'off'))
  say(camOn and 'the cockpit camera follows whoever is signalling to you (left / right only), whenever you are being marshalled.'
    or 'the cockpit camera is left alone.')
end

-- ---------------------------------------------------------------- put square on a parking spot
-- After the last director has stopped the jet on a parking spot (or from the menu, for the spot nearest
-- to the jet), the jet is put exactly on the spot, facing the way a jet spawned there faces: the spot's
-- place and heading from the routes file, at the height the jet stands at now. DCS's own call does it:
-- the carrier's ATC has a teleport for an aircraft (woATC::teleport_aircraft, given the new position and
-- axes in world coordinates and the aircraft's object id). EXPERIMENTAL: what that call does to a player's
-- jet is what the first run shows; where the jet is two seconds later is logged and said.
--   Run of 2026-11-15: the ATC's teleport returned and the jet had not moved. So when that leaves the jet
--   where it is, a second call is tried: the aircraft's own MovingObject::ForcePosition (WorldGeneral.dll's
--   virtual, called through the aircraft's own table: native.forcepos), with the same position; and the
--   result of that is said too.
local TELE = { still = 2, moved = 0.15, give = 40, maxFar = 30 }
local teleDone -- { x, z, fx, fz, name, at, how, id, pose }: a move just made, to be checked

local function teleportTo(ctx, sp)
  if not native.teleport then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  local h = shipHandle()
  if not h then -- (nobody listed yet this mission: look now)
    doScan(ctx, 'for the teleport', false)
    h = shipHandle()
  end
  if not h then return nil, 'nobody found on your ship to ask through' end
  local id = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
  if type(id) ~= 'number' then return nil, "your aircraft's object id could not be read (no LoGetPlayerPlaneId)" end
  local s = ctx.s
  local m = math.sqrt(sp.fx * sp.fx + sp.fz * sp.fz)
  local fx, fz = sp.fx / m, sp.fz / m
  -- the jet's axes in the world: nose = fx forward + fz starboard of the ship; up = the ship's; right = nose x up
  local ax = { fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9] }
  local ay = { s[4], s[5], s[6] }
  local az = { fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3] }
  local px, py, pz = s[10] + sp.x * s[1] + ctx.jy * s[4] + sp.z * s[7], s[11] + sp.x * s[2] + ctx.jy * s[5] + sp.z * s[8], s[12] + sp.x * s[3] + ctx.jy * s[6] + sp.z * s[9]
  logLine(string.format('teleport: object %d to %s: %.2f fwd %.2f stbd on the ship, nose %.2f %.2f (the jet is at %.2f fwd %.2f stbd, nose %.2f %.2f); world %.1f, %.1f, %.1f', id, sp.name,
    sp.x, sp.z, fx, fz, ctx.jx, ctx.jz, ctx.fx, ctx.fz, px, py, pz))
  local pose = { ax[1], ax[2], ax[3], ay[1], ay[2], ay[3], az[1], az[2], az[3], px, py, pz }
  local ok, res, e = pcall(native.teleport, h, id, unpack(pose))
  if not ok or not res then return nil, tostring(ok and e or res) end
  teleDone = { x = sp.x, z = sp.z, fx = fx, fz = fz, name = sp.name, at = now(), how = "the ATC's teleport", id = id, sp = sp }
  return true
end

local function tickTeleport(t)
  local d = teleDone
  if d and t - d.at >= 2 then
    teleDone = nil
    local ctx = getCtx()
    if not ctx then
      logLine('teleport: two seconds on the jet cannot be found on the carrier any more')
      return say('teleport: two seconds on, your jet cannot be found on the carrier (see the log).')
    end
    local off = math.sqrt((ctx.jx - d.x) ^ 2 + (ctx.jz - d.z) ^ 2)
    local turn = math.abs(math.deg(atan2(d.fx * ctx.fz - d.fz * ctx.fx, d.fx * ctx.fx + d.fz * ctx.fz)))
    logLine(string.format('teleport (%s): two seconds on the jet is at %.2f fwd %.2f stbd, nose %.2f %.2f: %.1f m from the spot, %.0f deg off its heading', d.how, ctx.jx, ctx.jz, ctx.fx, ctx.fz, off, turn))
    if not (off < 1 and turn < 5) and not d.second and native.forcepos then
      -- the second way: the aircraft's own ForcePosition, to the same place (worked out afresh: the ship has moved on)
      local s, sp = ctx.s, d.sp
      local fx, fz = d.fx, d.fz
      local ok, res, e = pcall(native.forcepos, d.id, fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9], s[4], s[5], s[6],
        fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3], s[10] + sp.x * s[1] + ctx.jy * s[4] + sp.z * s[7], s[11] + sp.x * s[2] + ctx.jy * s[5] + sp.z * s[8],
        s[12] + sp.x * s[3] + ctx.jy * s[6] + sp.z * s[9])
      logLine(string.format("teleport: the ATC's teleport left the jet where it was: the aircraft's own ForcePosition tried: %s", (ok and res) and ('called (class ' .. tostring(e) .. ')') or
        ('FAILED: ' .. tostring(ok and e or res))))
      if ok and res then
        teleDone = { x = d.x, z = d.z, fx = d.fx, fz = d.fz, name = d.name, at = t, how = "the aircraft's own ForcePosition", id = d.id, sp = sp, second = true }
        return
      end
    end
    return say(string.format('teleport to %s (%s): you are now %.1f m from the spot and %.0f degrees off its heading%s.', d.name, d.how, off, turn,
      (off < 1 and turn < 5) and ': on it' or ' (it did not put you there)'))
  end
  local w = teleWait
  if not w then return end
  local ctx = getCtx()
  if not ctx then return end
  if t - w.at > TELE.give then
    teleWait = nil
    return logLine('teleport: the jet did not stand still within 40 s of the stop signal: not put on the spot')
  end
  if not w.px or math.sqrt((ctx.jx - w.px) ^ 2 + (ctx.jz - w.pz) ^ 2) > TELE.moved then
    w.px, w.pz, w.since = ctx.jx, ctx.jz, t
    return
  end
  if t - w.since < TELE.still then return end
  teleWait = nil
  local ok, why = teleportTo(ctx, w)
  if not ok then
    logLine('teleport: ' .. tostring(why))
    say('you could not be put square on the spot: ' .. tostring(why))
  end
end

-- from the menu: onto the deck spot nearest to the jet
function commands.teleport()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local routes = loadRoutes()
  if not routes then return say('the taxi routes are missing (Scripts\\CATCC\\crewtest_routes.lua): run crew-test\\install.ps1 with DCS closed') end
  local best, bd
  for _, st in ipairs(routes) do
    if st.fx and st.x and st.z then
      local d = math.sqrt((st.x - ctx.jx) ^ 2 + (st.z - ctx.jz) ^ 2)
      if not bd or d < bd then best, bd = st, d end
    end
  end
  if not best then return say('the routes file has no spot headings (an older file): run crew-test\\install.ps1 with DCS closed') end
  if bd > TELE.maxFar then return say(string.format('the nearest deck spot (%s) is %.0f m away: taxi to within %d m of a spot first', tostring(best.name), bd, TELE.maxFar)) end
  local ok, why = teleportTo(ctx, { x = best.x, z = best.z, fx = best.fx, fz = best.fz, name = tostring(best.name) })
  if not ok then return say('teleport: ' .. tostring(why)) end
  say(string.format('teleport: you are being put on %s (spot %d, %.1f m away), facing the way a jet spawned there faces.', tostring(best.name), best.spot, bd))
end

-- The target walks to the point on the far side of the jet from where he stands: the straight line goes
-- through the jet. Watched for 60 s; the closing message says how near he came to the jet's centre.
-- ---------------------------------------------------------------- towing, and the axle finder (crewtest-15 to -17)
-- A tow tractor with a driver and a tow bar pulls the player's jet, by itself, from the lowered elevator into
-- the hangar. What each thing is:
--   the tractor  a static object (DCS's own AS32-31A), made once a mission by the mission script
--                (CATCC_CR.statics), NOT linked to the ship (a linked static stands on the flight deck; an
--                unlinked one lies on the sea bed), and put where it belongs every frame by the native
--                module through the object's own position setter (native.staticpos). The BetteraircraftCarrier
--                mod shows its hangar tug the same way. (A static keeps its place as single-precision world
--                numbers: far from the map's origin they step by a centimetre or so, which shows as a faint
--                shimmer against the jet on a ship under way.)
--   the tow bar  a static of a type of our own (our mod's Database file: "CATCC_Towbar"), drawn with a model of
--                our own: the 15 ft ALBAR 15 (crew-test/model/towbar.py; the first build was the 9 ft bar, far too small). Its origin is the tow ring's centre
--                (on the tractor's pintle); its x axis runs along the bar to the middle between its two AXLE
--                PINS, which point inboard from its heads and go into the ends of the nose wheel's hollow
--                axle. Its two arms turn on pivots at the ring head: they open and close to fit the axle
--                (ONE model argument, TOW.bar.arg: 0 closed .. 0.5 wide open with the chain slack; 0.5 .. 1
--                closing again with the tensioning chain taut: Tow.armArg). Placed every frame rigid, pitched
--                from the ring's height to the pins'.
--   the driver   catcc-t0, one of ours, put on the tractor's seat every frame (native.place) in the pilot
--                figure's seated pose, which the deck crew can play. First run in DCS (2026-11-15): the pose
--                was played, the placing reported no error, and nobody was on the tractor: native.place went
--                through AnimatedCharacterBase::set_origin alone, which only stores a pose nothing reads
--                for a man who stands (he stayed on the flight deck). From crewtest-16 it also writes his
--                own pose on the ship (what local_position() returns). UNTRIED: that, and where the seated
--                pose's origin is on the man (F10 > Tow > Driver seat moves him 10 cm at a time).
--   the jet      moved every frame by the aircraft's own ForcePosition (native.forcepos, as the teleport).
-- The joints, as the real bar has them (the user, 2026-11-15): the ring on the tractor's pintle is free in
-- yaw; the pins in the axle make the bar rigid in yaw and roll on the aircraft and free only in pitch: the
-- bar's heading IS the nose wheel's heading (the nose wheel castors; nose wheel steering off). So the nose
-- wheel rolls along the bar: its point follows the hitch as a trailer's axle does, at the bar's length; the
-- jet follows the nose wheel with its main wheels dragged behind, and the angle between the bar and the jet's
-- nose is the nose wheel's steering angle: shown on the jet's own nose wheel (its model argument TOW.steerArg,
-- written every frame through native.objarg; UNTRIED: the argument's number, its scale, and whether the
-- aircraft's own code writes over it: the log says), and the largest angle of the tow is reported.
-- The sequence (asked for 2026-11-15):
--   arrive   the tractor drives from where it waits in the hangar with the bar on its pintle, closed, trailing
--            on the bar's own little wheels; it comes round in front of the jet and stops on the jet's nose
--            line, facing away from it, the bar trailing towards the nose
--   unhitch  the ring comes off the pintle and is set down on its foot
--   open     the bar's arms are swung wide open
--   carry    the bar is taken back to the nose gear (rolled on its wheels, as the crew would) and lifted to the
--            axle, an arm either side of the nose wheels, straight ahead of them
--   clamp    the tensioning chain is tightened: the arms close until the pins are in the axle's ends
--   lift     the ring end is lifted to the hitch's height: the bar pitches about the axle
--   backup   the tractor backs onto the ring (hooked up), a pause, and the pull: straight on to the hangar's
--            port lane and along it to the parking place, where it stops
-- "Unhook", in the order the user gave (2026-11-16): OFF THE TRACTOR (the ring lifted off the pintle and set down; the
-- tractor moves 1.2 m up to make room), OFF THE AIRCRAFT (the chain let go, the arms open and the pins out of the axle;
-- the head end set down on the bar's own wheels; the bar rolled forward clear of the nose wheels, up to the tractor; its
-- arms closed), BACK ON THE TRACTOR (the ring lifted onto the pintle), AWAY (8 m on, the bar trailing).
-- Everything is drawn on this PC only (another player's PC shows the tractor when its own copy of this runs).
-- The tractor (DCS's AS32-31A model, read: its collision shell runs from 3.01 m behind its position to 1.80 m
-- ahead, 1.01 m high): the hitch is taken at its rear end, `hitch` behind its position, `hitchUp` above the
-- floor. As in the photographs, the tractor's rear sits under the jet's radome when hooked up.
-- The jet's nose wheel axle (F/A-18C): `noseGear` ahead of the jet's own position and `axleDown` below it;
-- `gearUp` is the jet's own position above the deck it stands on. FOUND IN DCS WITH THE AXLE FINDER (the user,
-- 2026-11-15, spawn spot at 151 m forward on the flight deck): the axle's middle is 3.005 m ahead and 0.257 m
-- above the deck (the marker at 0.26 m, "down about 3 mm"); the jet's position stood 21.975 m above the ship's
-- origin there, the flight deck being 20.149 m: 1.826 m. (Before: 2.985 m from FA-18C_hornet.lua's nose gear
-- position, and 0.265 m.) `axleLen` from end to end is still a guess (two 6.6 in tyres and the strut between);
-- a pin goes `pinIn` into each end. THE AXLE FINDER (F10 > Tow > Axle finder) stands a marker at these numbers
-- under the player's jet and moves it; the numbers it ends with are logged, and the tow uses them as they stand.
local TOW = {
  speed = 1.4, backSpeed = 0.7, accel = 0.5, turnR = 4.0, look = 3.0,
  -- (the pintle hook as the tractor's model has it, as32-31a.edm read 2026-11-15: 2.85 to 3.00 m behind the tractor's
  -- position, 0.22 to 0.39 m above the floor, on the centre line. Before: 3.05 / 0.45, guessed, and in DCS the ring
  -- hung above and short of the hook)
  hitch = 2.93, hitchUp = 0.30,
  -- (the tractor has the same pintle hook at its FRONT: 1.65 to 1.80 m ahead of its position, 0.22 to 0.39 m up. Not
  -- used yet: the user, 2026-11-15: "in some situations it could be good to use the forward attachment instead of the
  -- rear": pushing a jet back into a spot nose-out, say. The tractor then drives towards the jet, hitchFront ahead of
  -- its position where `hitch` is behind it)
  hitchFront = 1.73,
  -- (axleLen: the nose tyres' outer faces, FA-18C_Collision.edm's two WHEEL_F shells: each 0.173 m wide, 0.115 to
  -- 0.289 m either side of the centre line. The bar's heads go OUTSIDE the tyres, their pins inwards into the axle's
  -- ends: the pins' tips 0.25 m either side, the heads' inboard faces 0.30 m. Before: 0.46, guessed, and in DCS the
  -- heads sat inside the wheels)
  noseGear = 3.005, axleDown = 1.569, axleLen = 0.58, pinIn = 0.04,
  mainGear = 2.438, gearUp = 1.826, hangarBelow = 14,
  -- the bar: what crew-test/model/towbar.py prints for the hook (a test keeps these the same as the model)
  bar = { pivotX = 0.3333, armZ0 = 0.05458, pinU = 3.8577, pinW = 0.1042, a0 = 0.017170, thetaMax = 0.091651, wheelUp = 0.1250, ringRest = 0.1529, arg = 10 },
  carrySpeed = 0.8, step = 1.5, liftT = 2.0, -- the crew's pace
  -- the nose wheel's steering on the jet's model: argument 2 (seen to turn the wheels in DCS, 2026-11-15), the angle
  -- of a value of 1 (90 degrees: FA-18C_Collision.edm's nose gear node turns that far at +1 and -1; 75 was assumed
  -- before), and its sense (-1: + on the model is to the LEFT; the first run, with +1, turned them the wrong way)
  steerArg = 2, steerDeg = 90, steerSign = -1,
  -- the wheels' turning (Tow.wheelsShow). The tractor (as32-31a.edm): rear wheels 0.385 m in radius (the front ones
  -- 0.266: one argument turns them all at one rate, so the front ones turn too slowly for their size), wheelbase
  -- 1.685 m, the front wheels steer 31 degrees at an argument of 1. The jet: its nose wheels roll on the radius
  -- the axle finder found (0.257 m), its main wheels (0.78 m across) on 0.37 m, 3.12 m apart
  -- (FA-18C_Collision.edm: 1.55 m either side)
  tugWheelArg = 8, tugSteerArg = 9, tugPitchArg = 20, tugWheelR = 0.385, tugBase = 1.685, tugSteerDeg = 31,
  jetWheelArgs = { nose = 101, left = 103, right = 102 }, noseWheelR = 0.257, mainWheelR = 0.37, track = 3.12,
  -- the driver's seat (the tractor's model: the steering wheel is on the left, 0.40 to 0.76 m off the centre line,
  -- 0.10 to 0.35 m ahead of the tractor's position; the seat cushion behind it 0.65 m up, from 0.15 to 0.55 m behind
  -- the position; the seat back's top 0.90 m up). Where the seated pose's own origin is on the man is not known:
  -- F10 > Tow > Driver seat moves him
  seat = { fwd = -0.40, left = 0.58, up = 0.65 },
  clearBar = 1.2, -- unhooking: how far the tractor moves up, and the open bar is then rolled after it, its heads clear of the nose wheels
  ahead = 8, uTurn = 8, pause = 1.5, clearNose = 6, -- (clearNose: the U-turn's line point beyond the hook-up place, clear of the radome)
  home = { x = 36, z = -9.5, hx = -1, hz = 0 }, -- where the tractor waits: a hangar parking place (the forward one)
  spot = { x = 8.25, z = -8, fx = -1, fz = 0, name = 'the hangar, port lane (8 m forward, 8 m to port), nose aft' },
  seatAnim = 'f18_0_init',
}
local tow -- the tow in hand: see Tow.begin
local towIds, towRetry, towFail = nil, 0, nil -- the two statics' object ids; when to ask again; what last went wrong
local Tow = {} -- (Tow.ax: the axle finder, once its marker has been shown: { on })

-- where the jet and the ship are, asked once a frame however many things want it
function Tow.ctx(t)
  if Tow.ctxT ~= t then Tow.ctxT, Tow.ctxV = t, getCtx() end
  return Tow.ctxV
end

-- 12 world numbers for something at x, y, z of the ship, facing fx, fz (its axes: forward, up, right)
function Tow.pose(s, x, y, z, fx, fz)
  return { fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9], s[4], s[5], s[6], fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3],
    s[10] + x * s[1] + y * s[4] + z * s[7], s[11] + x * s[2] + y * s[5] + z * s[8], s[12] + x * s[3] + y * s[6] + z * s[9] }
end

-- the same for something whose axes are given (ship coordinates: x forward, y up, z to starboard)
function Tow.pose3(s, p, X, Y, Z)
  local function w(v) return v[1] * s[1] + v[2] * s[4] + v[3] * s[7], v[1] * s[2] + v[2] * s[5] + v[3] * s[8], v[1] * s[3] + v[2] * s[6] + v[3] * s[9] end
  local o = {}
  for _, v in ipairs({ X, Y, Z }) do
    local a, b, c = w(v)
    o[#o + 1], o[#o + 2], o[#o + 3] = a, b, c
  end
  local a, b, c = w(p)
  o[10], o[11], o[12] = s[10] + a, s[11] + b, s[12] + c
  return o
end

function Tow.unit(x, z)
  local m = math.sqrt(x * x + z * z)
  if m < 1e-6 then return 1, 0, 0 end
  return x / m, z / m, m
end

-- the tractor driven on along its path for dt seconds; true when it has reached the end
function Tow.drive(d, dt)
  local total = d.s[#d.path]
  local near = routeNearest(d.path, d.s, d.x, d.z, d.at - 1, d.at + 6)
  if near > d.at then d.at = near end
  local remain = total - d.at
  if remain <= 0.15 then
    d.v = 0
    return true
  end
  d.v = math.min(math.min(d.speed, math.sqrt(2 * TOW.accel * remain) + 0.05), d.v + TOW.accel * dt)
  local lx, lz, ldx, ldz = routeAt(d.path, d.s, math.min(total, d.at + TOW.look))
  if remain < TOW.look then lx, lz = lx + ldx * (TOW.look - remain), lz + ldz * (TOW.look - remain) end -- past the end: on along the last leg
  local ax, az = lx - d.x, lz - d.z
  local al = math.sqrt(ax * ax + az * az)
  local ang = (math.atan2 or math.atan)(d.hx * az - d.hz * ax, d.hx * ax + d.hz * az) -- to the aim point, + to the right
  local curv = al > 0.01 and 2 * math.sin(ang) / al or 0
  curv = math.max(-1 / TOW.turnR, math.min(1 / TOW.turnR, curv))
  local c, sn = math.cos(d.v * dt * curv), math.sin(d.v * dt * curv)
  d.hx, d.hz = d.hx * c - d.hz * sn, d.hx * sn + d.hz * c
  d.x, d.z = d.x + d.hx * d.v * dt, d.z + d.hz * d.v * dt
  return false
end

-- statics of ours made (once a mission) by the mission script. spec: "name=type;name=type"; at: { forward, starboard }:
-- made LINKED to the ship, at that place of its deck. Their object ids in that order (false: that one could not be
-- made), and the script's note; or nil, why
function Tow.statics(spec, at)
  local ok, r = pcall(dostring, 'return (CATCC_CR and CATCC_CR.statics) and CATCC_CR.statics(' .. string.format('%q', spec) .. (at and string.format(', %.3f, %.3f', at[1], at[2]) or '')
    .. ') or "ERR|the menu script cannot make statics: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  local ids, n = {}, select(2, spec:gsub('=', '='))
  for i = 1, n do
    local id = tonumber(p[1 + i])
    ids[i] = (id and id ~= 0) and id or false
  end
  return ids, (p[2 + n] and p[2 + n] ~= '') and p[2 + n] or nil
end

-- the ship's own frame as the 12 numbers of a pose (for something that is the ship's child)
Tow.OWN = { 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0 }

-- the tractor and the bar: { tug = id, bar = id or nil, tugOwn, barOwn }
-- THE SHIMMER AND ITS CURE (2026-11-15). A static made by itself holds its place as single-precision WORLD numbers
-- (steps of 1.6 cm where this mission is), re-given every frame beside a ship doing 30 knots: the tractor and the bar
-- shimmered against the deck and the jet (the user: "the only issue"). A static LINKED to a ship is the ship's CHILD
-- (edObjects.dll: viObjectNode::Parent; lLandObject keeps its pose in its parent's frame and its SetPos stores what it
-- is given there): drawn with the ship, as the axle finder's marker was (steady to the millimetre). So the two are
-- now made linked, and placed in the ship's own frame (Tow.OWN: metres forward, up, to starboard; any height).
-- tugOwn / barOwn: that object has a parent (native.staticinfo) and is placed so; else in the world, as before.
function Tow.ids()
  if towIds then return towIds end
  if now() < towRetry then return nil, towFail end
  towRetry = now() + 2
  local ids, note = Tow.statics('catcc-tug=AS32-31A;catcc-towbar=CATCC_Towbar', { TOW.home.x, TOW.home.z })
  if not ids or not ids[1] then
    towFail = ids and ('the tractor could not be made' .. (note and (': ' .. note) or '')) or tostring(note)
    logLine('tow: no tractor: ' .. towFail)
    return nil, towFail
  end
  towIds = { tug = ids[1], bar = ids[2] or nil }
  logLine(string.format('tow: statics made: tractor object %d, tow bar %s%s', ids[1], towIds.bar and ('object ' .. towIds.bar) or 'NONE (the bar type of our mod is missing?)',
    note and (' (' .. note .. ')') or ''))
  for _, k in ipairs({ 'tug', 'bar' }) do
    local id = towIds[k]
    if id then
      local ok, cls, kind, parent = pcall(function() return native.staticinfo(id) end)
      local own = ok and type(parent) == 'string'
      towIds[k .. 'Own'] = own or nil
      logLine(string.format('tow: the %s (object %d): %s', k == 'tug' and 'tractor' or 'bar', id,
        own and ('the ship\'s child (its parent: ' .. parent .. '): placed in the ship\'s own frame')
        or ('NO PARENT (' .. (native.staticinfo and (ok and 'not linked' or tostring(cls)) or 'an older native module') .. '): placed in the world, where it shimmers against a ship under way')))
    end
  end
  return towIds
end

-- The bar's geometry (crew-test/model/towbar.py): with its arms open by theta (radians beyond closed), its axle
-- pins' tips are `along` from the ring's centre and `half` either side of its centre line
function Tow.pins(theta)
  local b = TOW.bar
  local a = b.a0 + theta
  return b.pivotX + b.pinU * math.cos(a) + b.pinW * math.sin(a), b.armZ0 + b.pinU * math.sin(a) - b.pinW * math.cos(a)
end

-- the opening at which the pins' tips are `half` from the centre line (as far as the bar opens, at most)
function Tow.thetaFor(half)
  local lo, hi = 0, TOW.bar.thetaMax
  for _ = 1, 40 do
    local mid = (lo + hi) / 2
    local _, z = Tow.pins(mid)
    if z < half then lo = mid else hi = mid end
  end
  return (lo + hi) / 2
end

-- the bar's model argument for an opening: free (0 closed .. 0.5 wide open, the chain slack) or clamped (0.5 wide
-- open .. 1 closed, the chain taut)
function Tow.armArg(theta, clamped)
  local k = math.max(0, math.min(1, theta / TOW.bar.thetaMax))
  return clamped and (1 - 0.5 * k) or (0.5 * k)
end

-- the bar's length on the flat, from the ring to the axle pins, as it stands now (its opening, its two ends' heights)
function Tow.flat(w)
  local along = Tow.pins(w.theta)
  return math.sqrt(along * along - (w.lugUp - w.ringUp) ^ 2)
end

-- the axle's height above the floor the jet stands on; the opening at which the pins are in the axle's ends
function Tow.axleUp() return TOW.gearUp - TOW.axleDown end
function Tow.thetaIn() return Tow.thetaFor(math.max(0.01, TOW.axleLen / 2 - TOW.pinIn)) end

-- everything put where it is this frame
function Tow.apply(w, ctx, dt)
  local s = ctx.s
  local d = w.d
  local ok, res, e, rk, took, flags = pcall(native.staticpos, towIds.tug, unpack(Tow.pose(towIds.tugOwn and Tow.OWN or s, d.x, w.floor, d.z, d.hx, d.hz)))
  if not (ok and res) then return nil, 'the tractor could not be placed: ' .. tostring(ok and e or res) end
  if not w.tugSeen then
    w.tugSeen = true
    logLine(string.format('tow: the tractor is placed (class %s, register kind %s; %s; its flag word %s)', tostring(e), tostring(rk),
      took == nil and 'whether it took the place is not known' or (took and 'it says it is there' or 'IT IS NOT WHERE IT WAS PUT'), tostring(flags)))
    if took == false then say('the tow tractor did not take the place it was given: DCS leaves this object where it is (the log has its flag word).') end
  end
  -- the hitch at the tractor's rear
  local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
  if w.bar == 'tug' or w.bar == 'both' then
    -- on the pintle: the bar's pin end follows the hitch as a trailer's axle does ((ux, uz): from the pin end to the
    -- ring); on its own wheels behind the tractor, or on the nose wheel's axle when towing
    w.ringUp, w.lugUp = TOW.hitchUp, w.bar == 'tug' and TOW.bar.wheelUp or Tow.axleUp()
    local ux, uz = Tow.unit(hx - w.lx, hz - w.lz)
    local fl = Tow.flat(w)
    w.ux, w.uz, w.lx, w.lz = ux, uz, hx - ux * fl, hz - uz * fl
  end
  if towIds.bar and not w.barBad then
    local fl = Tow.flat(w)
    local pb = Tow.barPose(towIds.barOwn and Tow.OWN or s, w.lx + w.ux * fl, w.floor + w.ringUp, w.lz + w.uz * fl, w.lx, w.floor + w.lugUp, w.lz)
    local okb, resb, eb = pcall(native.staticpos, towIds.bar, unpack(pb))
    if not (okb and resb) then
      w.barBad = true
      logLine('tow: the bar could not be placed (the tow goes on without it): ' .. tostring(okb and eb or resb))
    else
      Tow.armShow(w)
    end
  end
  if w.driver and not w.driverBad then
    local okd, resd, ed = pcall(native.place, w.driver.h, d.x + d.hx * TOW.seat.fwd + d.hz * TOW.seat.left, w.floor + TOW.seat.up, d.z + d.hz * TOW.seat.fwd - d.hx * TOW.seat.left, d.hx, d.hz)
    if not (okd and resd) then
      w.driverBad = true
      logLine('tow: the driver could not be put on the seat (the tow goes on without him): ' .. tostring(okd and ed or resd))
    elseif not w.driverSaid then
      -- (ed: how he was placed, from the native module: "origin + pose" when his own pose on the ship was written too)
      w.driverSaid = true
      logLine(string.format('tow: the driver is put on the seat (%s): %.2f m forward, %.2f m left, %.2f m up of the tractor\'s position', tostring(ed or 'origin only: an older native module'),
        TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
    end
  end
  if w.bar == 'both' then
    -- the jet: its nose wheel where the bar's pin end is, its main wheels dragged behind that
    local fx, fz = Tow.unit(w.lx - w.mx, w.lz - w.mz)
    w.mx, w.mz = w.lx - fx * (TOW.noseGear + TOW.mainGear), w.lz - fz * (TOW.noseGear + TOW.mainGear)
    w.jx, w.jz, w.jfx, w.jfz = w.lx - fx * TOW.noseGear, w.lz - fz * TOW.noseGear, fx, fz
    local okj, resj, ej = pcall(native.forcepos, w.jet, unpack(Tow.pose(s, w.jx, w.jy, w.jz, fx, fz)))
    if not (okj and resj) then return nil, 'the jet could not be moved: ' .. tostring(okj and ej or resj) end
  end
  if w.bar == 'gear' or w.bar == 'both' then
    -- on the nose gear the bar's heading is the nose wheel's: its steering angle, from the jet's nose, + to the right
    local steer = math.deg((math.atan2 or math.atan)(w.jfx * w.uz - w.jfz * w.ux, w.jfx * w.ux + w.jfz * w.uz))
    w.steer = steer
    if math.abs(steer) > math.abs(w.maxSteer or 0) then w.maxSteer = steer end
    Tow.steerShow(w, steer)
  end
  Tow.wheelsShow(w, dt or 0)
  return true
end

-- The wheels, turned on the models (the arguments the user gave, 2026-11-15; their ranges and senses read from
-- DCS's own models, as32-31a.edm and FA-18C_Collision.edm):
--   the tractor   8: every wheel, one turn a unit, rising = rolling forward; 9: steering, +1 = 31 degrees to the LEFT
--                 (the steering wheel turns with it); 20: pitch about the rear axle, +1 = nose up (1 cm)
--   the jet       101 nose wheels, 103 left main wheel, 102 right main wheel: one turn a unit, rising = rolling forward
-- Everything comes from what moved since the frame before, whichever way it was moved: the tractor's own travel along
-- its heading (backing counts backwards), its turn for that travel (the steering a tractor of its wheelbase needs
-- for it), its change of speed (the pitch); the jet's nose wheel point along the bar, each main wheel along the
-- jet's nose (the outer one turns further in a turn). Written every frame; the first write is logged.
function Tow.wheelsShow(w, dt)
  if not native.objarg or w.wheelsBad then return end
  local h = shipHandle()
  if not h then return end
  local d = w.d
  local W = w.wheels
  if not W then
    W = { roll = 0, steer = 0, pitch = 0, v = 0, n = 0, nl = 0, nr = 0 }
    w.wheels = W
  end
  local TWO_PI_ = 2 * math.pi
  local function set(id, arg, v)
    local ok, res, e = pcall(native.objarg, h, id, arg, v)
    if not (ok and res) then
      w.wheelsBad = true
      logLine(string.format('tow: a wheel argument could not be set (object %s argument %d; no more are written): %s', tostring(id), arg, tostring(ok and e or res)))
      return false
    end
    return true
  end
  -- the tractor
  if W.tx then
    local ds = (d.x - W.tx) * d.hx + (d.z - W.tz) * d.hz
    local turn = (math.atan2 or math.atan)(W.thx * d.hz - W.thz * d.hx, W.thx * d.hx + W.thz * d.hz) -- + to the right
    W.roll = (W.roll + ds / (TWO_PI_ * TOW.tugWheelR)) % 1
    if dt > 0 then
      local k = math.min(1, dt / 0.25)
      if math.abs(ds) > 1e-4 then
        local want = -math.deg(math.atan(TOW.tugBase * turn / ds)) / TOW.tugSteerDeg -- (the argument: + to the left)
        W.steer = W.steer + (math.max(-1, math.min(1, want)) - W.steer) * k
      end -- (standing: the wheels stay as they were turned)
      local v = ds / dt
      local acc = (v - W.v) / dt
      W.v = v
      W.pitch = W.pitch + (math.max(-1, math.min(1, 0.6 * acc / TOW.accel)) - W.pitch) * k
    end
  end
  W.tx, W.tz, W.thx, W.thz = d.x, d.z, d.hx, d.hz
  if not (set(towIds.tug, TOW.tugWheelArg, W.roll) and set(towIds.tug, TOW.tugSteerArg, W.steer) and set(towIds.tug, TOW.tugPitchArg, W.pitch)) then return end
  -- the jet's wheels, once it is on the bar and moves with it
  if w.bar == 'both' and w.jfx then
    local fx, fz = w.jfx, w.jfz
    local half = TOW.track / 2
    -- (the jet's left on the ship is (fz, -fx))
    local lx, lz, rx, rz = w.mx + fz * half, w.mz - fx * half, w.mx - fz * half, w.mz + fx * half
    if W.jn then
      W.n = (W.n + ((w.lx - W.jn[1]) * w.ux + (w.lz - W.jn[2]) * w.uz) / (TWO_PI_ * TOW.noseWheelR)) % 1
      W.nl = (W.nl + ((lx - W.jl[1]) * fx + (lz - W.jl[2]) * fz) / (TWO_PI_ * TOW.mainWheelR)) % 1
      W.nr = (W.nr + ((rx - W.jr[1]) * fx + (rz - W.jr[2]) * fz) / (TWO_PI_ * TOW.mainWheelR)) % 1
    end
    W.jn, W.jl, W.jr = { w.lx, w.lz }, { lx, lz }, { rx, rz }
    if not (set(w.jet, TOW.jetWheelArgs.nose, W.n) and set(w.jet, TOW.jetWheelArgs.left, W.nl) and set(w.jet, TOW.jetWheelArgs.right, W.nr)) then return end
  else
    W.jn, W.jl, W.jr = nil, nil, nil
  end
  if not W.said then
    W.said = true
    logLine(string.format('tow: the wheels are turned on the models: the tractor\'s arguments %d (wheels), %d (steering), %d (pitch); the jet\'s %d / %d / %d (nose, left main, right main) once it is pulled',
      TOW.tugWheelArg, TOW.tugSteerArg, TOW.tugPitchArg, TOW.jetWheelArgs.nose, TOW.jetWheelArgs.left, TOW.jetWheelArgs.right))
  end
end


-- the bar's arms (its model argument TOW.bar.arg) as w.theta and w.clamped have them: written every frame (a static's
-- arguments are its own list: native.objarg reaches it as it does the jet's); the first result logged
function Tow.armShow(w)
  if not native.objarg or w.armBad then return end
  local h = shipHandle()
  if not h then return end
  local ok, res, e = pcall(native.objarg, h, towIds.bar, TOW.bar.arg, Tow.armArg(w.theta, w.clamped))
  if not (ok and res) then
    w.armBad = true
    logLine(string.format('tow: the bar\'s arms (its argument %d) could not be set: %s', TOW.bar.arg, tostring(ok and e or res)))
  elseif not w.armSeen then
    w.armSeen = true
    logLine(string.format('tow: the bar\'s arms are on its argument %d (class %s)', TOW.bar.arg, tostring(e)))
  end
end

-- the nose wheel's steering shown on the jet's model (native.objarg: the jet's own list of model arguments).
-- Before each write the value there is read: if it is not what was written the frame before, the aircraft's
-- own code writes the argument too (logged the first three times, then every 200th).
function Tow.steerShow(w, steer)
  if not native.objarg or w.steerBad then return end
  local h = shipHandle()
  if not h then return end
  local v = math.max(-1, math.min(1, TOW.steerSign * steer / TOW.steerDeg))
  local okr, now0 = pcall(native.objarg, h, w.jet, TOW.steerArg)
  if okr and type(now0) == 'number' and w.steerSet and math.abs(now0 - w.steerSet) > 0.01 then
    w.steerOver = (w.steerOver or 0) + 1
    if w.steerOver <= 3 or w.steerOver % 200 == 0 then
      logLine(string.format('tow: the jet\'s argument %d read %.3f where %.3f was written: something else writes it too (%d times so far)', TOW.steerArg, now0, w.steerSet, w.steerOver))
    end
  end
  local ok, res, e = pcall(native.objarg, h, w.jet, TOW.steerArg, v)
  if not (ok and res) then
    w.steerBad = true
    logLine('tow: the nose wheel steering could not be shown on the jet: ' .. tostring(ok and e or res))
    return
  end
  if not w.steerSet then logLine(string.format('tow: the nose wheel\'s steering is shown on the jet (argument %d; was %s; class %s)', TOW.steerArg, tostring(now0), tostring(e))) end
  w.steerSet = v
end

-- 12 world numbers for the bar: its origin (the ring's centre) at the ring, its x axis to the pins' middle, y square
-- to it in the vertical plane, z = x cross y (its right)
function Tow.barPose(s, rx, ry, rz, lx, ly, lz)
  local X = { lx - rx, ly - ry, lz - rz }
  local m = math.sqrt(X[1] ^ 2 + X[2] ^ 2 + X[3] ^ 2)
  X = { X[1] / m, X[2] / m, X[3] / m }
  local Y = { -X[1] * X[2], 1 - X[2] * X[2], -X[3] * X[2] }
  local ym = math.sqrt(Y[1] ^ 2 + Y[2] ^ 2 + Y[3] ^ 2)
  Y = { Y[1] / ym, Y[2] / ym, Y[3] / ym }
  local Z = { X[2] * Y[3] - X[3] * Y[2], X[3] * Y[1] - X[1] * Y[3], X[1] * Y[2] - X[2] * Y[1] }
  return Tow.pose3(s, { rx, ry, rz }, X, Y, Z)
end

function Tow.phase(w, name, text)
  w.phase, w.t0 = name, now()
  logLine(string.format('tow: %s (tractor at %.1f fwd %.1f stbd, heading %.2f %.2f; bar %s, arms open %.1f degrees%s%s)', name, w.d.x, w.d.z, w.d.hx, w.d.hz, tostring(w.bar),
    math.deg(w.theta), w.clamped and ', clamped' or '', w.bar == 'both' and string.format('; jet at %.1f fwd %.1f stbd, nose %.2f %.2f', w.jx or 0, w.jz or 0, w.jfx or 0, w.jfz or 0) or ''))
  if text then say(text) end
end

function Tow.path(w, pts, speed)
  local d = w.d
  d.path, d.s, d.at, d.speed = pts, routeLengths(pts), 0, speed
end

local function smooth(k)
  k = math.max(0, math.min(1, k))
  return k * k * (3 - 2 * k)
end

local function tickTow(t)
  local w = tow
  if not w or not native or not towIds then return end
  local dt = math.max(0, math.min(0.3, t - (w.last or t)))
  w.last = t
  local ctx = Tow.ctx(t)
  if not ctx then return end
  local d = w.d
  local k = t - w.t0
  local B = TOW.bar
  if not w.paused then
    if w.phase == 'arrive' then
      if Tow.drive(d, dt) then
        w.bar = 'free'
        Tow.phase(w, 'unhitch', 'tow: the tractor is in front of you. The bar comes off its pintle...')
      end
    elseif w.phase == 'unhitch' then
      w.ringUp = TOW.hitchUp + (B.ringRest - TOW.hitchUp) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp = B.ringRest
        Tow.phase(w, 'open', 'tow: ...its arms are swung open...')
      end
    elseif w.phase == 'open' then
      -- the arms swing open about the ring head, which stays where it lies
      local fl = Tow.flat(w)
      local rx, rz = w.lx + w.ux * fl, w.lz + w.uz * fl
      w.theta = B.thetaMax * smooth(k / TOW.step)
      fl = Tow.flat(w)
      w.lx, w.lz = rx - w.ux * fl, rz - w.uz * fl
      if k >= TOW.step then
        -- from where it lies to the nose wheel's axle, straight ahead of the nose wheels, an arm either side of them
        local a0 = (math.atan2 or math.atan)(w.uz, w.ux)
        local a1 = (math.atan2 or math.atan)(w.jfz, w.jfx)
        w.carry = { x = w.lx, z = w.lz, a = a0, da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi, len = math.sqrt((w.nx - w.lx) ^ 2 + (w.nz - w.lz) ^ 2) }
        Tow.phase(w, 'carry', 'tow: ...and it is taken to your nose gear.')
      end
    elseif w.phase == 'carry' then
      local c = w.carry
      local q = smooth(k * TOW.carrySpeed / math.max(c.len, 0.5))
      w.lx, w.lz = c.x + (w.nx - c.x) * q, c.z + (w.nz - c.z) * q
      w.ux, w.uz = math.cos(c.a + c.da * q), math.sin(c.a + c.da * q)
      w.lugUp = B.wheelUp + (Tow.axleUp() - B.wheelUp) * smooth((q - 0.8) / 0.2) -- (up to the axle at the end)
      if q >= 1 then
        w.bar, w.clamped = 'gear', true
        Tow.phase(w, 'clamp', 'tow: the chain is tightened: the bar\'s arms close and its pins go into your nose wheel\'s axle.')
      end
    elseif w.phase == 'clamp' then
      w.theta = B.thetaMax + (w.thetaIn - B.thetaMax) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.theta = w.thetaIn
        Tow.phase(w, 'lift', 'tow: the bar is lifted to the tractor\'s hitch height.')
      end
    elseif w.phase == 'lift' then
      w.ringUp = B.ringRest + (TOW.hitchUp - B.ringRest) * smooth(k / TOW.liftT)
      if k >= TOW.liftT then
        w.ringUp = TOW.hitchUp
        w.back = { x = d.x, z = d.z, hx = d.hx, hz = d.hz, len = math.sqrt((w.hitchAt.x - d.x) ^ 2 + (w.hitchAt.z - d.z) ^ 2), u = 0 }
        Tow.phase(w, 'backup', 'tow: the tractor backs onto the bar\'s ring.')
      end
    elseif w.phase == 'backup' then
      local b = w.back
      b.u = math.min(1, b.u + TOW.backSpeed * dt / math.max(b.len, 0.5))
      local q = smooth(b.u)
      d.x, d.z = b.x + (w.hitchAt.x - b.x) * q, b.z + (w.hitchAt.z - b.z) * q
      d.hx, d.hz = Tow.unit(b.hx + (w.hitchAt.hx - b.hx) * q, b.hz + (w.hitchAt.hz - b.hz) * q)
      if b.u >= 1 then
        w.bar = 'both'
        Tow.phase(w, 'hooked', 'tow: hooked up. Brakes OFF and hands off: you are pulled in ' .. TOW.pause .. ' seconds.')
      end
    elseif w.phase == 'hooked' then
      if k >= TOW.pause then
        Tow.path(w, w.pull, TOW.speed)
        Tow.phase(w, 'pull', string.format('tow: under way to %s.', TOW.spot.name))
      end
    elseif w.phase == 'pull' then
      if Tow.drive(d, dt) then
        Tow.phase(w, 'arrived', string.format('tow: stopped. You are %.1f m from the place and %.0f degrees off its heading; the nose wheel turned at most %.0f degrees. Set the parking brake, then F10 > Tow > Unhook.',
          math.sqrt((w.jx - TOW.spot.x) ^ 2 + (w.jz - TOW.spot.z) ^ 2), math.deg(math.acos(math.max(-1, math.min(1, w.jfx * TOW.spot.fx + w.jfz * TOW.spot.fz)))), math.abs(w.maxSteer or 0)))
      end
    elseif w.phase == 'ringoff' then
      -- UNHOOKING, in the order the user gave (2026-11-16): "disconnect from tug. Disconnect from aircraft. Connect to
      -- tug. Drive away." 1: the ring is lifted off the pintle and set down on its foot (the pins still in the axle)...
      w.ringUp = TOW.hitchUp + (B.ringRest - TOW.hitchUp) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp = B.ringRest
        Tow.path(w, { { d.x, d.z }, { d.x + d.hx * TOW.clearBar, d.z + d.hz * TOW.clearBar } }, TOW.backSpeed)
        Tow.phase(w, 'moveup', 'tow: ...the tractor moves up to make room...')
      end
    elseif w.phase == 'moveup' then
      -- ...and the tractor moves up by as much as the bar must come forward to clear the nose wheels
      if Tow.drive(d, dt) then Tow.phase(w, 'release', 'tow: ...the chain is let go: the bar\'s arms open and its pins come out of your nose wheel\'s axle...') end
    elseif w.phase == 'release' then
      -- 2: off the aircraft: the arms open (the pins out of the axle's ends)...
      w.theta = w.thetaIn + (B.thetaMax - w.thetaIn) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.theta, w.clamped, w.bar = B.thetaMax, false, 'free'
        Tow.phase(w, 'setdown', 'tow: ...its head end is set down on its own wheels...')
      end
    elseif w.phase == 'setdown' then
      -- ...its head end down on its own wheels...
      w.lugUp = Tow.axleUp() + (B.wheelUp - Tow.axleUp()) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.lugUp = B.wheelUp
        -- ...and it is rolled forward, its heads clear of the nose wheels, until its ring (once the arms are closed
        -- again) lies under the tractor's pintle: where its pin end then is
        local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
        local ux, uz = Tow.unit(hx - w.lx, hz - w.lz)
        local flEnd = math.sqrt(Tow.pins(0) ^ 2 - (B.wheelUp - TOW.hitchUp) ^ 2)
        local c = { x = w.lx, z = w.lz, ux0 = w.ux, uz0 = w.uz, ux = ux, uz = uz, tx = hx - ux * flEnd, tz = hz - uz * flEnd }
        c.len = math.sqrt((c.tx - c.x) ^ 2 + (c.tz - c.z) ^ 2)
        w.roll = c
        Tow.phase(w, 'roll', 'tow: ...it is rolled clear of your nose wheels, up to the tractor...')
      end
    elseif w.phase == 'roll' then
      local c = w.roll
      local q = smooth(k * TOW.carrySpeed / math.max(c.len, 0.5))
      w.lx, w.lz = c.x + (c.tx - c.x) * q, c.z + (c.tz - c.z) * q
      w.ux, w.uz = Tow.unit(c.ux0 + (c.ux - c.ux0) * q, c.uz0 + (c.uz - c.uz0) * q)
      if q >= 1 then Tow.phase(w, 'close', 'tow: ...its arms are closed...') end
    elseif w.phase == 'close' then
      w.theta = B.thetaMax * (1 - smooth(k / TOW.step))
      if k >= TOW.step then
        w.theta = 0
        Tow.phase(w, 'ringon', 'tow: ...and its ring is put back on the tractor\'s pintle.')
      end
    elseif w.phase == 'ringon' then
      -- 3: back on the tractor: the ring lifted onto the pintle; 4: away
      w.ringUp = B.ringRest + (TOW.hitchUp - B.ringRest) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp, w.bar = TOW.hitchUp, 'tug'
        Tow.path(w, { { d.x, d.z }, { d.x + d.hx * 8, d.z + d.hz * 8 } }, TOW.speed)
        Tow.phase(w, 'leave', 'tow: unhooked: the bar is back on the tractor, which moves 8 m on and waits there.')
      end
    elseif w.phase == 'leave' then
      if w.bar ~= 'tug' then w.ringUp = math.max(B.ringRest, w.ringUp - (TOW.hitchUp - B.ringRest) / TOW.step * dt) end -- (a bar left behind: its ring set down)
      if Tow.drive(d, dt) and k >= TOW.step then Tow.phase(w, 'parked', w.bar == 'tug' and 'tow: the tractor is parked, the bar on its pintle.' or 'tow: the tractor is parked.') end
    end
  end
  local ok, err = Tow.apply(w, ctx, dt)
  if not ok then
    logLine('tow: STOPPED: ' .. tostring(err))
    say('the tow is stopped: ' .. tostring(err))
    tow = nil
  end
end

function Tow.begin()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.staticpos and native.place and native.forcepos) then return say('towing needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  if tow and tow.phase ~= 'parked' and tow.phase ~= 'arrived' then return say('a tow is under way already (F10 > Tow > Unhook ends it)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  if ctx.jy > TOW.hangarBelow then
    return say(string.format('this first tow test starts on the hangar deck: ride elevator 1 down first (you are %.1f m above the ship\'s origin; the hangar deck is below %d).', ctx.jy, TOW.hangarBelow))
  end
  local id = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
  if type(id) ~= 'number' then return say("your aircraft's object id could not be read (no LoGetPlayerPlaneId)") end
  local ids, why = Tow.ids()
  if not ids then return say('the tow tractor could not be made: ' .. tostring(why)) end
  local fx, fz = Tow.unit(ctx.fx, ctx.fz)
  local nx, nz = ctx.jx + fx * TOW.noseGear, ctx.jz + fz * TOW.noseGear -- the nose wheel's axle
  -- hooked up: the bar's arms closed on the axle, its ring on the hitch
  local thetaIn = Tow.thetaIn()
  local alongIn, halfIn = Tow.pins(thetaIn)
  local reach = math.sqrt(alongIn ^ 2 - (Tow.axleUp() - TOW.hitchUp) ^ 2) + TOW.hitch
  -- where the jet's nose line meets the lane to the parking place
  local g = TOW.spot
  local ex, ez = g.x + g.fx * (TOW.noseGear + reach), g.z + g.fz * (TOW.noseGear + reach) -- where the tractor ends up
  local den = fx * g.fz - fz * g.fx
  if math.abs(den) < 0.3 then return say('this first tow test pulls you straight ahead into the hangar and then along its port lane: your nose points along the lane, not into the hangar.') end
  local u = ((ex - nx) * g.fz - (ez - nz) * g.fx) / den -- from the nose wheel to the corner, along the nose
  local cx, cz = nx + fx * u, nz + fz * u
  local wAlong = (ex - cx) * g.fx + (ez - cz) * g.fz -- from the corner to the tractor's end place, along the lane
  if u < reach + TOW.ahead + 4 or wAlong < 10 then
    return say(string.format('this first tow test needs the lane to the parking place ahead of your nose: it is %.0f m ahead (at least %.0f needed) and the place %.0f m along it (at least 10).', u, reach + TOW.ahead + 4, wAlong))
  end
  local old = tow
  local w = { phase = 'arrive', t0 = now(), jet = id, bar = 'tug', theta = 0, clamped = false, thetaIn = thetaIn, jy = ctx.jy, floor = ctx.jy - TOW.gearUp, nx = nx, nz = nz,
    mx = ctx.jx - fx * TOW.mainGear, mz = ctx.jz - fz * TOW.mainGear, jx = ctx.jx, jz = ctx.jz, jfx = fx, jfz = fz, hitchAt = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz } }
  w.d = old and old.d or { x = TOW.home.x, z = TOW.home.z, hx = TOW.home.hx, hz = TOW.home.hz }
  w.d.v = 0
  -- the bar on the tractor's pintle, closed, trailing straight behind it on its own wheels
  w.ux, w.uz, w.ringUp, w.lugUp = w.d.hx, w.d.hz, TOW.hitchUp, TOW.bar.wheelUp
  do
    local fl = Tow.flat(w)
    w.lx, w.lz = w.d.x - w.d.hx * (TOW.hitch + fl), w.d.z - w.d.hz * (TOW.hitch + fl)
  end
  w.driver = old and old.driver
  -- the arrival: towards the jet beside its nose line, a U-turn onto the line clear of the radome, and on to `ahead`
  -- metres beyond the hook-up place (the bar trailing straight behind by then)
  local side = ((w.d.x - nx) * -fz + (w.d.z - nz) * fx) >= 0 and 1 or -1 -- the side of the nose line the tractor is on
  local px, pz = -fz * side * TOW.uTurn, fx * side * TOW.uTurn
  local a0 = reach + TOW.clearNose
  Tow.path(w, { { w.d.x, w.d.z }, { nx + fx * (a0 + 9) + px, nz + fz * (a0 + 9) + pz }, { nx + fx * a0 + px, nz + fz * a0 + pz }, { nx + fx * a0, nz + fz * a0 },
    { nx + fx * (reach + TOW.ahead), nz + fz * (reach + TOW.ahead) } }, TOW.speed)
  w.pull = { { w.hitchAt.x, w.hitchAt.z }, { cx, cz }, { ex, ez } }
  if not w.driver then
    local r = doScan(ctx, 'for the tow', false)
    for _, q in ipairs(r and r.mine or {}) do
      if kind(q) == 'ours' and role(q) == 'driver' then w.driver = { h = q.h, name = tostring(q.name) } end
    end
    if w.driver then
      walkQueue[w.driver.h], holding[w.driver.h] = nil, nil
      local okp, resp, ep = pcall(native.play, w.driver.h, TOW.seatAnim, 2)
      logLine(string.format('tow: the driver is %s; seated pose "%s": %s', w.driver.name, TOW.seatAnim, (okp and resp) and 'played' or ('FAILED: ' .. tostring(okp and ep or resp))))
    else
      logLine('tow: no driver (catcc-t0 is not on the ship: data patch applied?)')
    end
  end
  tow = w
  logLine(string.format('tow: begins. Jet at %.1f fwd %.1f up %.1f stbd, nose %.2f %.2f; floor taken as %.2f; the axle taken %.3f m ahead of the jet and %.3f m below it (%.3f above the floor), %.3f m long: at %.1f / %.1f; the bar\'s pins in it with its arms open %.2f degrees (pin tips %.3f m either side; argument %.3f), the ring then %.3f m from the axle on the flat; hook-up place %.1f / %.1f; corner %.1f / %.1f; tractor ends %.1f / %.1f; tractor now %.1f / %.1f',
    ctx.jx, ctx.jy, ctx.jz, fx, fz, w.floor, TOW.noseGear, TOW.axleDown, Tow.axleUp(), TOW.axleLen, nx, nz, math.deg(thetaIn), halfIn, Tow.armArg(thetaIn, true), reach - TOW.hitch,
    w.hitchAt.x, w.hitchAt.z, cx, cz, ex, ez, w.d.x, w.d.z))
  say(string.format('tow: the tractor is coming with the tow bar%s%s. Nose wheel steering OFF; parking brake on until it is hooked up. Then: straight ahead %.0f m, a turn, %.0f m along the hangar to %s.',
    w.driver and '' or ' (no driver: catcc-t0 not found)', ids.bar and '' or ' (no tow bar: its type is missing)', u - reach, wAlong, g.name))
end

function commands.tow(what, a, b)
  if what == 'hangar' then return Tow.begin() end
  local w = tow
  if what == 'seat' then
    local step = tonumber(b) or 0.1
    if a == 'fwd' then TOW.seat.fwd = TOW.seat.fwd + step elseif a == 'left' then TOW.seat.left = TOW.seat.left + step elseif a == 'up' then TOW.seat.up = TOW.seat.up + step end
    logLine(string.format('tow: driver seat now %.2f m forward, %.2f m left, %.2f m up of the tractor\'s own position', TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
    return say(string.format('driver seat: %.2f m forward, %.2f m left, %.2f m up.', TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
  end
  if not w then return say('no tow in hand (F10 > Tow > Tow me into the hangar).') end
  if what == 'pause' then
    w.paused = not w.paused
    w.d.v = 0
    logLine('tow: ' .. (w.paused and 'held' or 'goes on') .. ' in phase ' .. w.phase)
    return say(w.paused and 'tow: held where it is.' or 'tow: goes on.')
  end
  if what == 'unhook' then
    if w.phase == 'parked' or w.phase == 'leave' then return say('the tractor is unhooked already.') end
    if w.phase == 'ringoff' or w.phase == 'moveup' or w.phase == 'release' or w.phase == 'setdown' or w.phase == 'roll' or w.phase == 'close' or w.phase == 'ringon' then
      return say('the bar is being taken off already.')
    end
    local was = w.phase
    w.paused = false
    if w.bar == 'both' then
      -- hooked up (at the place, or under way: the tractor stops where it is): the bar comes off the tractor, then off
      -- the jet, and goes back on the tractor (the phases from 'ringoff' on); the jet is left where it stands
      w.d.v = 0
      w.bar = 'gear'
      w.ringUp, w.lugUp = TOW.hitchUp, Tow.axleUp()
      return Tow.phase(w, 'ringoff', (was == 'arrived' and 'tow: unhooking. ' or 'tow: broken off. ') .. 'The bar\'s ring is lifted off the tractor\'s pintle and set down...')
    end
    if w.bar == 'tug' then
      -- the bar still on the tractor (it had not reached the jet): it just moves on with it
      local d0 = w.d
      Tow.path(w, { { d0.x, d0.z }, { d0.x + d0.hx * 8, d0.z + d0.hz * 8 } }, TOW.speed)
      return Tow.phase(w, 'leave', 'tow: broken off; the tractor moves 8 m on with its bar and waits there.')
    end
    w.bar = (w.bar == 'both' or w.bar == 'gear') and 'gear' or 'free' -- the ring comes off the pintle and is set down; the bar stays on the nose gear
    local d = w.d
    Tow.path(w, { { d.x, d.z }, { d.x + d.hx * 8, d.z + d.hz * 8 } }, TOW.speed)
    -- (broken off while the bar was off the tractor, being put on the jet: it is left where it is)
    return Tow.phase(w, 'leave', 'tow: broken off; the bar is left where it is and the tractor moves 8 m on and waits there.')
  end
  if what == 'report' then
    local d = w.d
    local txt = string.format('tow: %s%s. Tractor at %.1f fwd %.1f stbd, heading %.2f %.2f, %.1f m/s; bar %s, its arms open %.1f degrees%s; nose wheel %.1f / %.1f turned %.0f degrees (at most %.0f); %s; driver %s; bar %s.',
      w.phase, w.paused and ' (held)' or '', d.x, d.z, d.hx, d.hz, d.v or 0, tostring(w.bar), math.deg(w.theta), w.clamped and ' (clamped)' or '', w.lx, w.lz, w.steer or 0, math.abs(w.maxSteer or 0),
      w.bar == 'both' and string.format('jet at %.1f / %.1f nose %.2f %.2f', w.jx, w.jz, w.jfx, w.jfz) or 'not hooked',
      w.driver and (w.driverBad and 'could not be placed' or w.driver.name) or 'none', towIds and (towIds.bar and (w.barBad and 'could not be placed' or 'drawn') or 'no type') or '?')
    logLine('command ' .. txt)
    return say(txt)
  end
  say('unknown tow command ' .. tostring(what))
end

-- ---- the axle finder
-- A marker (a rod in magenta and cyan bands across the jet, a yellow cube on each end, a yellow disc at its
-- middle) stood under where the hook takes the nose wheel axle to be: a static LINKED to the ship, made by the
-- mission script (CATCC_CR.marker) exactly as the chock test made its chocks, and made anew at every move (a
-- static cannot be moved). A linked static stands on the flight deck, so the rod's height is in the model: one
-- model for every centimetre, CATCC_AxleMarker_H15 ... _H40 (crew-test/model/build_axle_marker.py, Blender-made
-- as the chock was). It does not follow the jet: "Report" or any move puts it under the jet as it then stands.
-- (2026-11-15: the first finder made unlinked statics of types named "CATCC axle marker" with models from our
-- own .edm writer and placed them every frame through the native module; DCS made none of them.)
function Tow.axleCm() return math.max(15, math.min(40, math.floor(Tow.axleUp() * 100 + 0.5))) end

function Tow.axleText()
  return string.format('the marker axle is %.3f m ahead of your jet\'s own position and %.3f m below it (the rod %.2f m above the deck)', TOW.noseGear, TOW.axleDown, Tow.axleCm() / 100)
end

-- the marker made (again) where the numbers now put it: { id, name, type, x, z }; or nil, why
function Tow.axlePlace(ctx)
  local fx, fz = Tow.unit(ctx.fx, ctx.fz)
  local x, z = ctx.jx + fx * TOW.noseGear, ctx.jz + fz * TOW.noseGear
  local typ = string.format('CATCC_AxleMarker_H%02d', Tow.axleCm())
  local ok, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker("catcc-axle", %q, %.4f, %.4f, %.5f)', typ, x, z, (math.atan2 or math.atan)(fz, fx))
    .. ' or "ERR|the menu script cannot place markers: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  return { id = tonumber(p[2]), name = p[3], type = typ, x = x, z = z, jy = ctx.jy }
end

function commands.axle(what, arg)
  local a = Tow.ax
  local shown = (a and a.on) and '' or ' (The marker is not shown: F10 > Tow > Axle finder > Show.)'
  local function place(why)
    local ctx, err = getCtx()
    if not ctx then return nil, "can't tell where you are: " .. tostring(err) end
    local m, e = Tow.axlePlace(ctx)
    if not m then
      logLine('axle finder: no marker (' .. why .. '): ' .. tostring(e))
      return nil, 'the marker axle could not be made: ' .. tostring(e)
    end
    logLine(string.format('axle finder: marker "%s" (%s, object %s) linked to the ship at %.3f fwd %.3f stbd; the jet at %.3f / %.3f / %.3f, nose %.3f %.3f (%s)', tostring(m.name), m.type,
      tostring(m.id), m.x, m.z, ctx.jx, ctx.jy, ctx.jz, ctx.fx, ctx.fz, why))
    return m
  end
  local function numbers() return string.format('noseGear=%.3f axleDown=%.3f axleLen=%.3f', TOW.noseGear, TOW.axleDown, TOW.axleLen) end
  if what == 'show' then
    if a and a.on then
      a.on = false
      pcall(dostring, 'return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker("catcc-axle", "", 0, 0, 0)')
      logLine('command axle show: put away. ' .. numbers())
      return say('axle finder: the marker is put away; ' .. Tow.axleText():gsub('^the marker axle is', 'the axle is taken to be') .. '. The tow uses these.')
    end
    if not a then
      a = {}
      Tow.ax = a
      -- once a mission, for the log: which of our static types DCS makes, linked and not
      local ok, r = pcall(dostring, 'return (CATCC_CR and CATCC_CR.probe) and CATCC_CR.probe() or "ERR|the menu script has no probe"')
      logLine('axle finder: what DCS makes of our static types: ' .. tostring(r))
    end
    -- (the rod's height goes by whole centimetres, the nearest to the tow's number; "Up / down" steps from there)
    local m, e = place('shown')
    if not m then return say(e) end
    a.on = true
    logLine('command axle show: shown. ' .. numbers())
    return say('axle finder: a rod in magenta and cyan bands with a yellow cube on each end stands across your nose gear, where the hook takes the nose wheel axle to be: '
      .. Tow.axleText() .. '. Move it (F10 > Tow > Axle finder) until, seen from the side, the yellow cube is on the middle of the wheel hub. It stands on the flight deck and does not follow the jet.')
  end
  if what == 'fwd' or what == 'up' then
    local step = tonumber(arg)
    if not step then return say('unknown axle finder step') end
    local note = ''
    if what == 'fwd' then
      TOW.noseGear = TOW.noseGear + step
    else
      local cm = Tow.axleCm() + math.floor(step * 100 + 0.5)
      if cm < 15 or cm > 40 then
        cm = math.max(15, math.min(40, cm))
        note = ' (The marker goes from 0.15 to 0.40 m above the deck.)'
      end
      TOW.axleDown = TOW.gearUp - cm / 100
    end
    logLine(string.format('command axle %s %+.3f: %s', what, step, numbers()))
    if a and a.on then
      local m, e = place(what)
      if not m then
        a.on = false
        return say(e)
      end
    end
    return say('axle finder: ' .. Tow.axleText() .. '.' .. note .. shown)
  end
  if what == 'report' then
    if a and a.on then place('report') end
    logLine('command axle report: ' .. numbers() .. ((a and a.on) and '' or ' (marker not shown)'))
    return say('axle finder: ' .. Tow.axleText() .. '. The tow uses these.' .. shown)
  end
  say('unknown axle finder command ' .. tostring(what))
end

-- ---------------------------------------------------------------- the deck spotting tool (F10 > CATCC deck spots)
-- Asked for by the user (2026-11-16): he always starts on the same spot and cannot judge the others: "spawn a full
-- deck of aircraft for me to review ... menu items to lock on to the nearest aircraft and adjust its position in
-- large and small increments, including rotation, so I can spot the entire deck accurately and you can record the
-- exact locations".
--   A static F/A-18C is parked on every deck spot (the spots of crewtest_routes.lua: PriFly's spotting plan), each a
--   static LINKED to the ship, made by the mission script (CATCC_CR.deck) and made anew when it is moved (as the chock
--   test's and the axle finder's). No spot is filled where a live aircraft stands (the player's own).
--   Lock: the aircraft the camera looks at (where its line of sight meets the deck; looking level or up, the one
--   nearest the camera): so from any outside view, F11's free camera best. Moves are along the aircraft's OWN nose and
--   wings, 1 m / 10 cm / 1 cm; turns 5 / 1 / 0.1 degrees.
--   Everything is written, at every change, to Saved Games\DCS\Logs\catcc-deck-spots.lua (a Lua table: for every spot
--   its place now and the built-in place it started from; added and removed ones marked), and that file is taken up
--   again the next time the deck is filled: the work carries over from mission to mission, and it is the record.
--   Wings: the statics' model argument 8 (the F/A-18C's wing fold: FA-18C_Collision.edm, 100 degrees at 1) is set
--   through native.objarg, every second; folded to begin with (the spots were drawn for folded wings).
-- (All of it hangs on Tow: a Lua chunk takes 200 local names and this file has them.)
Tow.Deck = { type = 'FA-18C_hornet', clear = 14, foldArg = 8, fold = true, foldT = 0, file = writedir .. 'Logs/catcc-deck-spots.lua' }

function Tow.Deck.builtIn()
  local out = {}
  for _, e in ipairs(loadRoutes() or {}) do
    if e.spot and e.x and e.z then
      local hd = math.deg((math.atan2 or math.atan)(e.fz or 0, e.fx or 1)) % 360
      out[#out + 1] = { n = e.spot, name = tostring(e.name or ('spot ' .. e.spot)), x = e.x, z = e.z, hdg = hd, x0 = e.x, z0 = e.z, hdg0 = hd }
    end
  end
  return out
end

-- the list to work on: the saved file's if there is one (and `fresh` is not asked for), else the built-in spots
function Tow.Deck.begin(fresh)
  local D = Tow.Deck
  local list, from = nil, 'the built-in spots'
  if not fresh then
    local f = loadfile(D.file)
    local ok, t = pcall(function() return f and f() end)
    if ok and type(t) == 'table' and #t > 0 then list, from = t, 'the saved file (Logs\\catcc-deck-spots.lua)' end
  end
  list = list or D.builtIn()
  for i, e in ipairs(list) do e.key, e.id, e.skipped = 'catcc-spot-' .. i, nil, nil end
  D.list, D.lock = list, nil
  return from
end

function Tow.Deck.save()
  local D = Tow.Deck
  if not D.list then return false end
  local f = io.open(D.file, 'w')
  if not f then
    logLine('deck spots: the file could not be written: ' .. D.file)
    return false
  end
  f:write('-- CATCC deck spots as set in DCS with F10 > CATCC deck spots. Written by the crew test hook, ' .. tostring(os.date('%Y-%m-%d %H:%M:%S')) .. '.\n')
  f:write('-- x: metres forward of the ship\'s origin; z: metres to starboard; hdg: the way the nose points, degrees clockwise from the bow.\n')
  f:write('-- x0, z0, hdg0: the built-in spot it started from. moved / added / removed: what was done to it.\n')
  f:write('return {\n')
  for _, e in ipairs(D.list) do
    local moved = e.x0 and (math.abs(e.x - e.x0) > 0.0005 or math.abs(e.z - e.z0) > 0.0005 or math.abs(e.hdg - e.hdg0) > 0.005)
    f:write(string.format('  { n = %d, name = %q, x = %.3f, z = %.3f, hdg = %.2f%s%s%s%s },\n', e.n, e.name, e.x, e.z, e.hdg,
      e.x0 and string.format(', x0 = %.3f, z0 = %.3f, hdg0 = %.2f', e.x0, e.z0, e.hdg0) or '', moved and ', moved = true' or '', e.added and ', added = true' or '', e.removed and ', removed = true' or ''))
  end
  f:write('}\n')
  f:close()
  return true
end

-- these made (anew) as linked statics, or taken away (removed ones; all with `away`). How many now stand, and the note
function Tow.Deck.make(entries, away)
  local D = Tow.Deck
  local parts = {}
  for _, e in ipairs(entries) do
    parts[#parts + 1] = (away or e.removed) and e.key or string.format('%s,%.3f,%.3f,%.5f', e.key, e.x, e.z, math.rad(e.hdg))
  end
  local ok, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.deck) and CATCC_CR.deck(%q, %q, %d)', table.concat(parts, ';'), D.type, D.clear)
    .. ' or "ERR|the menu script cannot park aircraft: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  local n = 0
  for i, e in ipairs(entries) do
    local id = tonumber(p[1 + i])
    e.id, e.skipped = (id and id > 0) and id or nil, id == -1 or nil
    if e.id then n = n + 1 end
  end
  D.foldT = 0 -- (the wings of the new ones: at the next frame)
  return n, (p[2 + #entries] and p[2 + #entries] ~= '') and p[2 + #entries] or nil
end

-- the wings of every parked aircraft set as D.fold says (once a second, and at once after anything was made)
function Tow.Deck.tick(t)
  local D = Tow.Deck
  if not (D.list and D.shown and native and native.objarg) or D.foldBad or t < D.foldT then return end
  D.foldT = t + 1
  local h = shipHandle()
  if not h then return end
  local done, bad, why = 0, 0, nil
  for _, e in ipairs(D.list) do
    if e.id then
      local ok, res, er = pcall(native.objarg, h, e.id, D.foldArg, D.fold and 1 or 0)
      if ok and res then done = done + 1 else bad, why = bad + 1, tostring(ok and er or res) end
    end
  end
  if not D.foldSaid or D.foldSaid ~= (done .. '/' .. bad) then
    D.foldSaid = done .. '/' .. bad
    logLine(string.format('deck spots: wings %s (model argument %d) on %d aircraft%s', D.fold and 'folded' or 'spread', D.foldArg, done,
      bad > 0 and string.format('; NOT on %d: %s', bad, tostring(why)) or ''))
  end
  if done == 0 and bad > 0 then
    D.foldBad = true -- (a static aircraft's arguments cannot be set this way: left as DCS draws them)
    say('deck spots: the parked aircraft\'s wings could not be folded (' .. tostring(why) .. '): they stay as DCS draws them.')
  end
end

-- where the camera is on the ship and where it looks: the point of the deck it looks at (nil: it looks level or up),
-- its own place, its heading (degrees clockwise from the bow)
function Tow.Deck.camera(ctx)
  if not (Export and Export.LoGetCameraPosition) then return nil end
  local ok, cp = pcall(Export.LoGetCameraPosition)
  if not (ok and type(cp) == 'table' and cp.p) then return nil end
  local s = ctx.s
  local function onShip(v, rel)
    local dx, dy, dz = v.x - (rel and s[10] or 0), v.y - (rel and s[11] or 0), v.z - (rel and s[12] or 0)
    return dx * s[1] + dy * s[2] + dz * s[3], dx * s[4] + dy * s[5] + dz * s[6], dx * s[7] + dy * s[8] + dz * s[9]
  end
  local cx, cy, cz = onShip(cp.p, true)
  local fx, fy, fz = 1, 0, 0
  if cp.x then fx, fy, fz = onShip(cp.x, false) end
  local at
  local up = cy - ctx.jy -- (above the height a parked jet's own position has: the player's)
  if fy < -0.05 and up > 0.5 then
    local k = up / -fy
    if k < 400 then at = { cx + fx * k, cz + fz * k } end
  end
  return at, { cx, cz }, math.deg((math.atan2 or math.atan)(fz, fx)) % 360
end

function Tow.Deck.text(e)
  local d = ''
  if e.added then
    d = ' (added)'
  elseif e.x0 and (math.abs(e.x - e.x0) > 0.0005 or math.abs(e.z - e.z0) > 0.0005 or math.abs(e.hdg - e.hdg0) > 0.005) then
    d = string.format(' (from the built-in spot: %+.2f m forward, %+.2f m to starboard, %+.1f degrees)', e.x - e.x0, e.z - e.z0, (e.hdg - e.hdg0 + 180) % 360 - 180)
  end
  return string.format('spot %d "%s": %.2f m forward, %.2f m to starboard, nose %.1f degrees%s', e.n, e.name, e.x, e.z, e.hdg, d)
end

function commands.spot(what, a, b)
  local D = Tow.Deck
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  if what == 'spawn' or what == 'reset' then
    if D.list and D.shown then D.make(D.list, true) end
    local from = D.begin(what == 'reset')
    if #D.list == 0 then return say('deck spots: no spots to fill (Scripts\\CATCC\\crewtest_routes.lua is missing: run crew-test\\install.ps1 with DCS closed).') end
    local n, note = D.make(D.list)
    if not n then
      logLine('deck spots: nothing parked: ' .. tostring(note))
      return say('deck spots: the aircraft could not be parked: ' .. tostring(note))
    end
    D.shown, D.foldBad, D.foldSaid = true, nil, nil
    if not shipHandle() then doScan(ctx, 'for the deck spots', false) end
    local empty, gone = {}, 0
    for _, e in ipairs(D.list) do
      if e.removed then gone = gone + 1 elseif e.skipped then empty[#empty + 1] = tostring(e.n) end
    end
    D.save()
    logLine(string.format('command spot %s: %d aircraft parked from %s; left empty for a live aircraft: %s; removed spots: %d%s', what, n, from, #empty > 0 and table.concat(empty, ', ') or 'none', gone,
      note and ('; ' .. note) or ''))
    return say(string.format('deck spots: %d aircraft parked, from %s%s%s. Look at one from outside (F11) and F10 > CATCC deck spots > Lock on the one the camera looks at.', n, from,
      #empty > 0 and ('; spot ' .. table.concat(empty, ', ') .. ' left empty (an aircraft stands there)') or '', gone > 0 and ('; ' .. gone .. ' removed before') or ''))
  end
  if not (D.list and D.shown) then return say('deck spots: park the aircraft first (F10 > CATCC deck spots > Park a Hornet on every deck spot).') end
  if what == 'clear' then
    D.make(D.list, true)
    D.shown, D.lock = nil, nil
    D.save()
    logLine('command spot clear: all taken away (their places are kept in the file)')
    return say('deck spots: all taken away. Their places are kept (Logs\\catcc-deck-spots.lua) and come back with "Park a Hornet on every deck spot".')
  end
  if what == 'fold' then
    D.fold, D.foldT, D.foldBad, D.foldSaid = not D.fold, 0, nil, nil
    logLine('command spot fold: wings ' .. (D.fold and 'folded' or 'spread'))
    return say('deck spots: wings ' .. (D.fold and 'folded.' or 'spread.'))
  end
  if what == 'lock' or what == 'add' then
    local at, cam, chdg = D.camera(ctx)
    if not cam then return say('deck spots: the camera cannot be read here (no LoGetCameraPosition).') end
    local px, pz = (at or cam)[1], (at or cam)[2]
    if what == 'add' then
      local n = 0
      for _, e in ipairs(D.list) do n = math.max(n, e.n) end
      local lock = D.lock and D.list[D.lock]
      local e = { n = n + 1, name = 'added ' .. (n + 1), x = px, z = pz, hdg = lock and lock.hdg or chdg, added = true, key = 'catcc-spot-' .. (#D.list + 1) }
      D.list[#D.list + 1] = e
      D.lock = #D.list
      local made, note = D.make({ e })
      D.save()
      logLine(string.format('command spot add: %s%s', D.text(e), (made == 1) and '' or ('; NOT parked: ' .. tostring(note or (e.skipped and 'an aircraft stands there' or 'DCS made nothing')))))
      return say('deck spots: added and locked on: ' .. D.text(e) .. (made == 1 and '.' or '. It could not be parked there.'))
    end
    local best, bd
    for i, e in ipairs(D.list) do
      if not e.removed then
        local dd = math.sqrt((e.x - px) ^ 2 + (e.z - pz) ^ 2)
        if not bd or dd < bd then best, bd = i, dd end
      end
    end
    if not best then return say('deck spots: no aircraft to lock on.') end
    D.lock = best
    logLine(string.format('command spot lock: %s; %.1f m from %s (%.1f / %.1f)', D.text(D.list[best]), bd, at and 'where the camera looks' or 'the camera (it looks level or up)', px, pz))
    return say(string.format('deck spots: locked on %s (%.0f m from %s).', D.text(D.list[best]), bd, at and 'where the camera looks' or 'the camera'))
  end
  if what == 'next' then
    local n, i = #D.list, D.lock or 0
    for _ = 1, n do
      i = (i - 1 + (tonumber(a) or 1)) % n + 1
      if not D.list[i].removed then break end
    end
    D.lock = i
    logLine('command spot next: ' .. D.text(D.list[i]))
    return say('deck spots: locked on ' .. D.text(D.list[i]) .. '.')
  end
  local e = D.lock and D.list[D.lock]
  if what == 'report' then
    D.save()
    local moved, added, gone = 0, 0, 0
    for _, q in ipairs(D.list) do
      if q.removed then gone = gone + 1 elseif q.added then added = added + 1
      elseif math.abs(q.x - q.x0) > 0.0005 or math.abs(q.z - q.z0) > 0.0005 or math.abs(q.hdg - q.hdg0) > 0.005 then moved = moved + 1 end
    end
    logLine(string.format('command spot report: %d spots: %d moved, %d added, %d removed; saved to %s%s', #D.list, moved, added, gone, D.file, e and ('; locked: ' .. D.text(e)) or ''))
    return say(string.format('deck spots: %s. All saved: %d moved, %d added, %d removed (Logs\\catcc-deck-spots.lua).', e and ('locked on ' .. D.text(e)) or 'none locked', moved, added, gone))
  end
  if not e then return say('deck spots: lock on an aircraft first (look at it; F10 > CATCC deck spots > Lock on the one the camera looks at).') end
  if what == 'move' then
    local d = tonumber(b)
    if not d then return say('unknown deck spot step') end
    local hr = math.rad(e.hdg)
    if a == 'fwd' then
      e.x, e.z = e.x + math.cos(hr) * d, e.z + math.sin(hr) * d
    else -- to its own right
      e.x, e.z = e.x - math.sin(hr) * d, e.z + math.cos(hr) * d
    end
  elseif what == 'turn' then
    local d = tonumber(a)
    if not d then return say('unknown deck spot turn') end
    e.hdg = (e.hdg + d) % 360
  elseif what == 'undo' then
    if not e.x0 then return say('deck spots: this one was added here: it has no built-in place (remove it instead).') end
    e.x, e.z, e.hdg = e.x0, e.z0, e.hdg0
  elseif what == 'remove' then
    e.removed = true
  else
    return say('unknown deck spot command ' .. tostring(what))
  end
  local made, note = D.make({ e })
  D.save()
  logLine(string.format('command spot %s %s %s: %s%s', what, tostring(a or ''), tostring(b or ''), D.text(e),
    e.removed and '; REMOVED' or (made == 1 and '' or ('; NOT parked: ' .. tostring(note or (e.skipped and 'an aircraft stands there' or 'DCS made nothing'))))))
  if e.removed then
    D.lock = nil
    return say('deck spots: removed: ' .. D.text(e) .. '. Nothing is locked now.')
  end
  return say('deck spots: ' .. D.text(e) .. (made == 1 and '.' or '. It could not be parked there (an aircraft in the way?).'))
end

function commands.walkthru()
  withTarget(function(p, d, ctx)
    local dx, dz = ctx.jx - p.x, ctx.jz - p.z
    local m = math.sqrt(dx * dx + dz * dz)
    if m < 6 then return say(string.format('%s is only %.0f m from your jet: pick someone further away', tostring(p.name), m)) end
    local tx, tz = ctx.jx + dx / m * 14, ctx.jz + dz / m * 14
    local ok, res, e = walkOrder(p.h, tx, tz, 0, 0, ctx.s, p.name)
    if not ok or not res then return say(string.format('%s: walk failed: %s', tostring(p.name), tostring(ok and e or res))) end
    logLine(string.format('command walkthru: %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd, the jet at %.1f fwd %.1f stbd on the line; walk: %s', tostring(p.name), p.x, p.z, tx, tz,
      ctx.jx, ctx.jz, tostring(e)))
    say(string.format('%s told to walk to the far side of your jet (%.0f m, straight through where it stands). Watch him: through it, or round it?', tostring(p.name), m + 14))
    startWatch(p, 60, { x = tx, z = tz }, 'walk past the jet')
    watch.near = { x = ctx.jx, z = ctx.jz }
  end)
end

-- ends whatever of ours runs (the demo, the signal test or the marshalling) and puts the men back to
-- their idle and to day; the marshalling's people walk back to where they stood
-- on-screen messages off / on. Going off: one short notice that also clears what is on screen now (outText's third
-- argument), then nothing more until they are switched on again
function commands.messages()
  if quiet then
    quiet = false
    return say('on-screen messages are ON again.', 6)
  end
  logLine('command messages: on-screen messages OFF (they still go to this log)')
  pcall(dostring, string.format('trigger.action.outText(%q, 4, true)', 'CATCC crew test: on-screen messages are OFF (F10 > CATCC crew test > Tow > Messages on screen brings them back; they still go to the log).'))
  quiet = true
end

function commands.demostop()
  if not (demo or sigtest or marsh) then return say('nothing of ours is running (no demo, signal test or marshalling)') end
  local what = demo and 'demo' or (sigtest and 'signal test' or 'marshalling')
  if marsh then marshalHome(marsh, getCtx()) end
  local hs = demo and { demo.first and demo.first.h or false, demo.last.h } or (sigtest and { sigtest.h } or {})
  if sigtest and nightOn[sigtest.h] then setNight(sigtest.h, false) end
  demo, sigtest, marsh = nil, nil, nil
  for _, h in ipairs(hs) do
    if h then toIdle(h) end
  end
  say(what .. ' stopped.')
end

-- Path finding switched on, once a mission, when the people are first found: from then on everyone we
-- send somewhere walks round aircraft and the island instead of through them (2026-11-14: with the crew
-- environment's "path avoids collisions" and the character code's "use the path finder" both on, the
-- walker went round the jet, 4.8 m from its middle; with them off, as DCS has them, straight through).
local pathOnDone = false
local function pathFindingOn(r)
  if pathOnDone or not (native and native.envflags and native.debugset) then return end
  local p = r and r.mine and r.mine[1]
  if not p then return end
  pathOnDone = true
  local ok, av, pa = pcall(native.envflags, p.h, -1, 1)
  local ok2 = pcall(native.debugset, 3, 1)
  logLine(string.format('path finding switched on at mission start: environment "path avoids collisions" %s, character code "use the path finder" %s', (ok and av ~= nil) and onOff(pa) or 'FAILED',
    ok2 and 'ON' or 'FAILED'))
end
local function run(cmd)
  logLine('menu: ' .. cmd)
  local parts = split(cmd)
  local f = commands[parts[1]]
  if not f then return info('unknown command ' .. cmd) end
  local ok, err = pcall(f, parts[2], parts[3], parts[4])
  if not ok then say('error in "' .. cmd .. '": ' .. tostring(err)) end
end

-- ---------------------------------------------------------------- the menu script, every mission
local function installMenu(t)
  if t - lastInstallAt < 5 then return end
  lastInstallAt = t
  local ok, present = pcall(dostring, 'return type(CATCC_CR)')
  if installed and ok and present == 'table' then return end
  local fh = io.open(writedir .. 'Scripts/CATCC/crewtest.lua', 'r')
  if not fh then
    if not installWarned then
      installWarned = true
      info('Scripts/CATCC/crewtest.lua is missing')
    end
    return
  end
  local src = fh:read('*a')
  fh:close()
  local ok2, r = pcall(dostring, src .. '\nreturn (type(CATCC_CR) == "table") and "CATCC_OK" or "CATCC_FAIL"')
  if ok2 and r == 'CATCC_OK' then
    installed = true
    info('crew test menu installed (F10 > CATCC crew test)')
    if not native and not nativeSaid then
      nativeSaid = true
      say('the native module is not loaded: ' .. tostring(nativeWhy))
    end
  elseif not installWarned then
    installWarned = true
    info('crew test menu install failed: ' .. tostring(r) .. ' (check autoexec.cfg: net.allow_dostring_in must include "' .. STATE .. '")')
  end
end

-- The people on deck, once a mission, by itself: when the simulation has run for 8 s (model time: the
-- briefing screen and pauses don't count; on 2026-11-14 the list was made while the mission still sat
-- paused before "Fly" and found the crew environments empty) and the player sits in a jet on a carrier.
-- If the quick scan finds nobody, the memory scan follows by itself (a freeze of a few seconds, said
-- first), so the recorder has people to follow without anyone asking.
local function modelTime()
  local ok, v = pcall(function() return DCS.getModelTime() end)
  return ok and tonumber(v) or nil
end

local function autoList(t)
  if autoListed or not native then return end
  startT = startT or t
  if t - lastAutoTry < 2 then return end
  lastAutoTry = t
  local mt = modelTime()
  if mt then
    if mt < 8 then return end
  elseif t - startT < 20 then
    return -- no model time to go by: 20 s of real time instead
  end
  local ctx = getCtx()
  if not ctx then return end -- no player in a cockpit on a carrier yet: ask again in 2 s
  autoListed = true
  local r = doScan(ctx, 'mission start', true)
  if not r then return end
  pathFindingOn(r)
  if #r.people > 0 then
    say('at mission start: ' .. summary(r, ctx) .. (customClip ~= nil and (customClip and ' Our own animation clip: in the list.' or ' Our own animation clip: NOT in the list.') or ''))
  else
    say('at mission start: ' .. summary(r, ctx) .. ' the quick way. Scanning memory instead: DCS will freeze for a few seconds.')
    pending = { at = now() + 1, fn = function() commands.memory(true) end }
  end
end

local function frame()
  if not missionRunning then return end
  local t = now()
  installMenu(t)
  if not installed then return end
  if pending and t >= pending.at then
    local f = pending.fn
    pending = nil
    f()
  end
  if t - lastPollAt >= 0.25 then
    lastPollAt = t
    local ok, c = pcall(dostring, 'return (CATCC_CR and CATCC_CR.poll) and CATCC_CR.poll() or ""')
    if ok and type(c) == 'string' and c ~= '' then run(c) end
  end
  tickWatch(t)
  tickDemo(t)
  tickSigtest(t)
  tickMarshal(t)
  tickCats(t)
  tickWalkQueue(t)
  Walk.tickLegs(t)
  tickCaptain(t)
  tickDeck(t)
  tickShipCmds(t)
  tickDoors(t)
  tickElevWait(t)
  tickTeleport(t)
  tickTow(t)
  Tow.Deck.tick(t)
  tickSignals(t)
  tickCamera(t)
  autoList(t)
  tickRecorder(t)
  tickAnimRec(t)
end

-- ---------------------------------------------------------------- DCS callbacks
local handler = {}

function handler.onSimulationStart()
  missionRunning = true
  installed, lastInstallAt, installWarned = false, -1e9, false
  startT, lastAutoTry, autoListed = nil, -1e9, false
  watch, pending, demo, sigtest, marsh, dumped = nil, nil, nil, nil, nil, false
  target = 'nearest'
  recPeople, recNextT, recJetT, recJet = {}, 0, 0, nil
  recAnimT, animInfoDone, DUR, BS = 0, false, {}, {}
  holding, nightOn = {}, {}
  catsReset()
  walkQueue, Walk.legs, pathOnDone = {}, {}, false
  catClosed, bowDown, bowWhy, bubbleKeep, elevKeep, cmdSeen = {}, false, {}, {}, {}, nil
  captain, deckSeen, deckOff, launchCat = nil, nil, false, nil
  camAfter, teleWait, teleDone, doorOpen, elevRise = nil, nil, nil, {}, {}
  cam.who, cam.dead, cam.id, cam.last = nil, false, nil, 0
  tow, towIds, towRetry, towFail, elevWait = nil, nil, 0, nil, {}
  Tow.ax, Tow.ctxT, Tow.ctxV = nil, nil, nil
  Tow.Deck.list, Tow.Deck.lock, Tow.Deck.shown = nil, nil, nil
  quiet = false
  logLine('---------------- mission start ----------------')
end

function handler.onSimulationStop()
  missionRunning = false
  watch, pending, demo, sigtest, marsh, recPeople, holding = nil, nil, nil, nil, nil, {}, {}
  captain, camAfter, teleWait, teleDone, bubbleKeep, elevKeep, doorOpen, elevRise = nil, nil, nil, nil, {}, {}, {}, {}
  tow, towIds, elevWait = nil, nil, {}
  Tow.ax, Tow.ctxT, Tow.ctxV = nil, nil, nil
  Tow.Deck.list, Tow.Deck.lock, Tow.Deck.shown = nil, nil, nil
  logLine('---------------- mission stop ----------------')
end

function handler.onSimulationFrame()
  local ok, err = pcall(frame)
  if not ok and not frameErrLogged then
    frameErrLogged = true
    info('frame error: ' .. tostring(err))
  end
end

if DCS and DCS.setUserCallbacks then DCS.setUserCallbacks(handler) end
info('crew test hook ready' .. (native and '' or ' (WITHOUT the native module)'))
