-- PARKED EXPERIMENT (not installed, not loaded): the carrier's wheel-chock flags through a native module.
--
-- What it was: this code sat in Scripts/Hooks/CATCC-pilot-hook.lua until 2026-11-13. It loaded
-- catcc_chocks.dll (pilot/native/catcc_chocks.cpp), which finds the carrier under the jet and calls
-- the carrier's own SetWheelchocksFlag(slot, on) the way the BetteraircraftCarrier mod does. The idea:
-- the ship keeps a chock flag per parking spot, so setting a held jet's flag would chock it.
--
-- What DCS 2.9.31 showed:
--   * 2026-11-12: the flag re-set once a second; the player taxied away freely.
--   * 2026-11-13 (F10 test switch, every spot's flag set on every frame): the flags stayed on (over
--     700 frames of 700 checked) and nothing happened. Taxi deck crew on, after the crew had pulled the
--     chocks: no chocks drawn, the jet taxied. Taxi deck crew off: the jet spawned unchocked and taxied
--     with all the flags on. With the deck crew's chocks in at spawn the flags read 0000.
--   So the flag is neither what the deck crew's chocks use nor what holds the jet. (The "chocks
--   flashing" seen on 2026-11-12 came from the gate device drawing argument 23 itself, below.)
--
-- Also parked here, from Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua: the gate device
-- drew the Hornet's chocks itself (model argument 23 set to 1 on the hook's CMD_CHOCKS 11875) while
-- PriFly held them. Looks only: the flight model drives that argument too, the drawn chocks
-- flickered and held nothing.
--
-- What replaced both: the jet's real chocks are kept in (the salute is held, or the ground crew is
-- asked for chocks): see "chocks held by PriFly" in the pilot hook.
--
-- The functions below are as they were; they need the hook's logi / say / now / cfg / readArg and are
-- kept for reference only.

-- The carrier's own wheel chocks (catcc_chocks.dll, next to the gate device): the ship keeps one chock
-- flag per parking spot. While PriFly holds this jet's chocks, the spot's flag goes back on whenever
-- the deck crew pulls it (their second salute); on the taxi instruction it is let go. The spot is the
-- one whose flag last changed while this jet sat parked (the crew placing or pulling its chocks).
-- First version: also logs what it sees (flags, ship memory around them) so the spot can be found
-- without that. Anything missing or failing: no native chocks, everything else carries on.
local native, nativeTried = nil, false
local lastNativeAt, nativeFlags, nativeErr = -1e9, nil, nil
local mySlot, slotSetByUs, nativeDumped, slotUnknownSaid = nil, false, false, false

-- the spots with chocks on (as the ship counts them, from 0), short enough for the screen
local function spotList(flags)
  local l = {}
  for i = 1, #flags do
    if flags:sub(i, i) == '1' then
      if #l == 12 then l[#l + 1] = '...' break end
      l[#l + 1] = tostring(i - 1)
    end
  end
  return #l > 0 and ('spots ' .. table.concat(l, ', ')) or 'no spots'
end

local function loadNative()
  if nativeTried then return native end
  nativeTried = true
  local path = ((lfs and lfs.writedir and lfs.writedir()) or '') .. 'Mods\\aircraft\\CATCC-Pilot\\bin\\catcc_chocks.dll'
  local ok, loader, err = pcall(package.loadlib, path, 'luaopen_catcc_chocks')
  if ok and loader then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' then native = m end
  end
  say(native and 'native chocks module loaded' or ('native chocks module not loaded: ' .. tostring(ok and err or loader)))
  return native
end

local function selfPos()
  if not (Export and Export.LoGetSelfData) then return nil end
  local ok, d = pcall(Export.LoGetSelfData)
  local p = ok and type(d) == 'table' and d.Position
  if type(p) == 'table' and p.x then return p end
  return nil
end

local function dumpNative(why)
  for off = 0x1300, 0x16ff, 0x100 do
    local ok, hex = pcall(native.dump, off, 0x100)
    logi(string.format('ship memory %s +0x%x: %s', why, off, ok and tostring(hex) or 'n/a'))
  end
end

local function nativeChocks(t, name, chock, parked)
  if t - lastNativeAt < 1 or not loadNative() then return end
  lastNativeAt = t
  local p = selfPos()
  if not p then return end
  local ok, info, err = pcall(native.probe, p.x, p.y, p.z)
  if not ok or not info then
    local e = tostring(ok and err or info)
    if e ~= nativeErr then
      nativeErr = e
      -- away from the carrier is no news
      if e == 'no carrier here' then logi('native chocks: ' .. e) else say('native chocks: ' .. e) end
    end
    nativeFlags = nil
    return
  end
  nativeErr = nil
  local flags = info.flags
  if flags ~= nativeFlags then
    logi(string.format('carrier chock flags (%d spots, ship %s, me %s %s, %.0f m off): %s',
      info.count, tostring(info.ship), tostring(info.self), tostring(info.selfType), info.dist or -1, flags))
    if not nativeFlags then
      say(string.format('carrier found (%d parking spots), chocks on %s', info.count, spotList(flags)))
    elseif parked then
      say('carrier chocks now on ' .. spotList(flags))
    end
    -- a flag that changed while this jet sat parked: its spot
    if nativeFlags and #nativeFlags == #flags and parked then
      for i = 1, #flags do
        if flags:sub(i, i) ~= nativeFlags:sub(i, i) and i - 1 ~= mySlot then
          mySlot = i - 1
          say('my parking spot: ' .. mySlot .. ' (its chock flag changed while I was parked)')
        end
      end
    end
    if not nativeDumped or (nativeFlags and parked) then
      nativeDumped = true
      dumpNative(nativeFlags and 'after a change' or 'first look')
    end
    nativeFlags = flags
  end
  if not mySlot then
    if chock and parked and not slotUnknownSaid then
      slotUnknownSaid = true
      say('PriFly holds the chocks, but my parking spot is not known yet')
    end
    return
  end
  -- Re-setting the ship's chock flag once a second did not hold the player (2026-11-12): the deck crew's
  -- C++ update clears it at once, so the jet was chocked for a frame at a time (the drawn chocks
  -- flickered). Off by default; the flag read above still finds the parking spot. cfg.fightDeckCrew =
  -- true only to re-test that. Whether the jet holds while the flag stays on: shipFlagTest below.
  if not cfg.fightDeckCrew then return end
  local on = flags:sub(mySlot + 1, mySlot + 1) == '1'
  if chock and parked and not on then
    local ok2, r, e2 = pcall(native.set, mySlot, true)
    slotSetByUs = ok2 and r == true
    say('PriFly holds the chocks: spot ' .. mySlot .. ' chocked again' .. (slotSetByUs and '' or (' (failed: ' .. tostring(ok2 and e2 or r) .. ')')))
  elseif not chock and slotSetByUs then
    slotSetByUs = false
    if on then pcall(native.set, mySlot, false) end
    say('chocks let go (spot ' .. mySlot .. ')')
  end
end

-- TEST ONLY (Config\CATCC-test.lua chockTest = true; F10 > CATCC chock test > Ship chock flags: ON / OFF,
-- which sets CATCC_CT.shipFlag in the mission's Lua state).
-- The carrier keeps a wheel-chock flag per parking spot; the jet on the spot draws its chocks while the
-- flag is on, and the deck crew's chocks arrest a Hornet in full afterburner (2026-11-13). The Hornet's
-- own ground crew won't place chocks on the carrier ("unable to comply"). ON: every frame, set every
-- spot's flag, and say what the flags read just before (what survived since the last frame). It answers:
-- with the flag kept on, is the jet held? and does anything clear the flag (the deck crew does while it
-- runs; with the taxi deck crew disabled in the mission, maybe nothing)?
local FLAG_SAY_S = 5
local flagTest = { want = nil, pollAt = -1e9, saidAt = -1e9, sets = 0, checked = 0, kept = 0, err = nil }

local function flagProbe()
  if not loadNative() then return nil, 'the native module is not loaded' end
  local p = selfPos()
  if not p then return nil, 'no aircraft position' end
  local ok, info, err = pcall(native.probe, p.x, p.y, p.z)
  if not ok or not info then return nil, tostring(ok and err or info) end
  return info
end

local function shipFlagTest(t)
  if not cfg.chockTest then return end
  if t - flagTest.pollAt >= 0.5 then
    flagTest.pollAt = t
    local ok, r = pcall(net.dostring_in, 'server', 'return tostring(CATCC_CT and CATCC_CT.shipFlag or "")')
    local want = (ok and (r == 'on' or r == 'off')) and r or nil
    if want ~= flagTest.want then
      flagTest.want, flagTest.saidAt, flagTest.sets, flagTest.checked, flagTest.kept, flagTest.err = want, t, 0, 0, 0, nil
      if want == 'off' then
        local info, err = flagProbe()
        if info then
          for i = 0, info.count - 1 do pcall(native.set, i, false) end
          say(string.format('ship chock flags cleared on all %d spots (they read %s before)', info.count, info.flags))
        else
          say('ship chock flags: ' .. err)
        end
      end
    end
  end
  if flagTest.want ~= 'on' then return end
  local info, err = flagProbe()
  if not info then
    if err ~= flagTest.err then
      flagTest.err = err
      say('ship chock flags: ' .. err)
    end
    return
  end
  flagTest.err = nil
  -- what survived since the last frame's set
  if flagTest.sets > 0 then
    flagTest.checked = flagTest.checked + 1
    if not info.flags:find('0', 1, true) then flagTest.kept = flagTest.kept + 1 end
  end
  for i = 0, info.count - 1 do pcall(native.set, i, true) end
  flagTest.sets = flagTest.sets + 1
  if t - flagTest.saidAt >= FLAG_SAY_S then
    flagTest.saidAt = t
    say(string.format('ship chock flags: set on all %d spots every frame; still on at the next frame %d times of %d (last read %s)',
      info.count, flagTest.kept, flagTest.checked, info.flags))
    flagTest.checked, flagTest.kept = 0, 0
  end
end

-- ---- from catcc_gate.lua (the device side of the drawn chocks) ----
-- local CMD_CHOCKS = 11875
-- local CHOCK_ARGS = { 23 }
-- local chocks, chocksWord = false, -1e9
-- local function setChocks(on)
--   if on == chocks then return end
--   chocks = on
--   if not on then for _, a in ipairs(CHOCK_ARGS) do set_aircraft_draw_argument_value(a, 0) end end
--   apply()
-- end
-- in apply():      if chocks then for _, a in ipairs(CHOCK_ARGS) do set_aircraft_draw_argument_value(a, 1) end end
-- in SetCommand(): elseif command == CMD_CHOCKS then chocksWord = clock; setChocks(v > 0.5)
-- in update():     if chocks and clock - chocksWord > STALE_S then setChocks(false) end
