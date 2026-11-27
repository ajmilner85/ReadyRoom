-- CATCC crew test: the tie-down chains (TEST ONLY), the in-game panel's "Tie down my jet" (the Padeyes page). Loaded by
-- crewtest_ui.lua. The user, 2026-11-25: "Start with just the 6 chain securing pattern ("initial") from the flight deck
-- natops. Use the NLG left and right, and the Left/Right MLG fwd and aft as the attachment points (per illustration 2-6
-- in the NAVAIR) ... Give me a tie down own aircraft test I can use to assess the first pass."
--
-- THE RULES (CV NATOPS NAVAIR 00-80T-120, 2.4 and 2.5, carrier-ops-handoff-2/USNavy_CVN_FlightDeck.pdf): an F/A-18 on
-- INITIAL tiedown has 6; "arranged to provide an even restraint in all directions and against twisting movements"
-- (Figure 2-1); "only on approved padeyes and approved aircraft attachment points ... not attached to scuppers, coaming,
-- elevators, holdback cleats, or catapults". Figure 2-1, sheet 1, "INITIAL (6 PT)", gives each chain's way from the
-- aircraft, measured on the figure (degrees from the nose, + to the right): the nose gear's two forward and outboard,
-- 37; each main gear's forward ring forward, 11 inboard; its aft ring aft, 13 inboard (the first pass's ways; now the
-- user's sectors, below). The manual gives no angle to the deck.
--
-- THE CHOICE OF PADEYE (one each, none twice; ON ITS OWN DECK: a jet standing on an elevator's platform (its origin
-- within PLATFORM_MARGIN of the platform's padeyes) is chained to that platform's padeyes only, any other jet to the
-- flight deck's only, so that nothing is chained across a platform's edge. The manual's "not attached to ... elevators"
-- is set aside here by the user, 2026-11-25: "I also noticed in my last run that elevators never get chains? Add
-- these."), by the
-- user's own diagram (2026-11-25, after the first pass: "there needs to be a minimum displacement from the attachment
-- point"; a chain "basically points straight down. It should have been connect to the padeye further ahead"): seen from
-- above, round each attachment point, the half towards the fuselage and everything within REACH_MIN of the point are
-- never used; the outboard half, between REACH_MIN and the chain's reach, is three sectors, by the bearing from the
-- nose (0) round to the tail (180) on the point's outboard side: FWD 0 to 75, MID 75 to 105, AFT 105 to 180 (measured
-- on the diagram: its lines 14.5 and 16.6 degrees either side of abeam). The pattern names each chain's sector:
-- INITIAL, the nose gear's two rings and each main gear's forward ring FWD, each main gear's aft ring AFT (Figure 2-1's
-- six: the nose's two forward and outboard, the mains' forward and aft). THE AFT RINGS' AFT reaches on past the tail
-- onto the fuselage's side, to 45 degrees inboard (bearing 225), its middle straight aft (the user, 2026-11-25, with
-- photographs of Hornets' aft chains: "I am seeing aft MLG tie downs extend inboard in a number of reference images, so
-- I'm ok with relaxing that restriction ... 45 degrees is probably as far as we want to go"; the aft ring sits inboard of
-- its main wheel and ahead of its centre: on the outboard side, nearly every aft chain crossed the tyre or its arm; with
-- the outboard half only, 2 of the 32 flight deck spots had all six). Of the padeyes in the sector, with the chain's
-- length (padeye to the fitting) within the model's L_MIN .. L_MAX (LEN_SPARE to spare) and the chain CLEAR OF THE JET
-- (below): the one nearest the sector's IDEAL bearing and H_BEST across the deck (H_WEIGHT degrees a metre). None: no
-- chain there, and the report says so (the user: "We may need to adjust parking spots to ensure there are always
-- suitable attachment points available on either side of the aircraft"). The first pass (by Figure 2-1's angles alone,
-- 10 to 70 degrees up, a fallback to the nearest within 90) chose a padeye almost under the nose gear's ring.
--
-- CLEAR OF THE JET (the user: "chains should never pass through the aircraft's own geometry (e.g. through a tire or
-- strut)"): the chain's line, from CLEAR_SKIP past the fitting to the padeye, sampled every CLEAR_STEP, kept CLEAR_GAP
-- outside each of the points file's obstacles (tyres and struts, the jet's frame).
--
-- THE AIRCRAFT'S POINTS: crewtest_hornet_tiedowns.lua (measured in DCS, the jet's frame); the jet's place and axes in the
-- ship's frame from the mission (the panel's jet views' reading), so a jet standing nose up or rolled is right.
--
-- THE CHAIN (crew-test/model/tiedown.py, static type CATCC_Tiedown): its origin the padeye, on the deck; its x level
-- towards the fitting (the static's heading); argument 10 the length / 4 m, 11 the rise / 90 degrees, 12 the finish
-- (0 yellow). Each a static LINKED to the ship, made by the mission script (CATCC_CR.marker), as the chocks are; its
-- arguments written through native.objarg and written again every REWRITE seconds (as the chocks' spacing is).
--
-- api (from the panel): dostring, split, objarg(id, n, v), ctx() (the carrier: ship, s), jet() (the player's jet:
-- { type, p, x, y, z } in the ship's frame, or nil and why), deckY() (the flight deck's height in the ship's frame),
-- writedir, log(text), now(). Returns the tool: place(), placeAll(), clear(), report(), tick(), reset(), the choice as
-- choose(), the deck's static Hornets as statics().
local api = ...
local TD = { list = nil }
TD.TYPE = 'CATCC_Tiedown'
TD.LEN_ARG, TD.ELEV_ARG, TD.COLOUR_ARG = 10, 11, 12
TD.LEN_SCALE = 4.0
TD.L_MIN, TD.L_MAX = 0.512, 3.240
TD.LEN_SPARE = 0.05
TD.REACH_MIN = 1.0       -- metres across the deck from the point: the diagram's inner ring (a third of the outer)
TD.H_BEST, TD.H_WEIGHT = 1.8, 15
-- THE ANGLE FIRST, IN WIDENING BANDS (the user, 2026-11-26, of a jet whose forward chains went mostly abeam while
-- padeyes nearer the quarter were free: "prefer in a 40-50 degree angle first, then wide the search to 30-60 deg,
-- 20-70 etc."): a padeye's band is how far its bearing is off the chain's ideal, in steps of BAND_STEP past
-- BAND_HALF (band 0: within 5 degrees, band 1: within 15, ...); the lowest band wins, and only within a band does
-- the distance across the deck (H_BEST, H_WEIGHT) choose
TD.BAND_HALF, TD.BAND_STEP = 5, 10
function TD.band(off)
  return math.max(0, math.ceil((math.abs(off) - TD.BAND_HALF) / TD.BAND_STEP - 1e-9))
end
TD.SECTORS = {
  fwd = { lo = 0, hi = 75, ideal = 45 },
  mid = { lo = 75, hi = 105, ideal = 90 },
  aft = { lo = 105, hi = 180, ideal = 140 },
}
TD.CLEAR_SKIP, TD.CLEAR_STEP, TD.CLEAR_GAP = 0.25, 0.05, 0.03  -- (the skip: the ring sits on its strut's surface)
TD.REWRITE = 0.5
TD.POINTS_FILE = api.writedir .. 'Scripts/CATCC/crewtest_hornet_tiedowns.lua'
TD.MAP_FILE = api.writedir .. 'Scripts/CATCC/crewtest_padeyes_model.lua'
-- Figure 2-1's INITIAL (6 PT) for the F/A-18: the aircraft's point and its chain's sector
TD.PATTERNS = {
  initial = {
    { point = 'NLG left ring', sector = 'fwd' },
    { point = 'NLG right ring', sector = 'fwd' },
    { point = 'MLG left fwd ring', sector = 'fwd' },
    { point = 'MLG right fwd ring', sector = 'fwd' },
    { point = 'MLG left aft ring', sector = 'aft', inboard = 45, ideal = 180 },
    { point = 'MLG right aft ring', sector = 'aft', inboard = 45, ideal = 180 },
  },
  -- Figure 2-1's INTERMEDIATE (9 PT), for a jet on an elevator's platform (the user, 2026-11-25: "make aircraft chained
  -- down on elevators use the intermediate tie down setting (9 chains)"): initial's six, and three more: the nose
  -- gear's straight aft (the figure's arrow down the centreline: AFT C, within 30 degrees of the tail either side, from
  -- either nose ring), and each main gear's forward and INBOARD (the figure's arrow from the main gear towards the
  -- nose: FWD IN, 0 to 75 degrees inboard of the nose, ideally 45 (the quarter: 2026-11-26), from either of that gear's rings). A point may
  -- carry two chains (the figure draws three from each main gear's one circle); a `points` list: the best of them.
  intermediate = {
    { point = 'NLG left ring', sector = 'fwd' },
    { point = 'NLG right ring', sector = 'fwd' },
    { points = { 'NLG left ring', 'NLG right ring' }, sector = 'aft', label = 'AFT C', lo = 150, hi = 210, ideal = 180 },
    { point = 'MLG left fwd ring', sector = 'fwd' },
    { point = 'MLG right fwd ring', sector = 'fwd' },
    { points = { 'MLG left fwd ring', 'MLG left aft ring' }, sector = 'fwd', label = 'FWD IN', lo = 285, hi = 360, ideal = 315 },
    { points = { 'MLG right fwd ring', 'MLG right aft ring' }, sector = 'fwd', label = 'FWD IN', lo = 285, hi = 360, ideal = 315 },
    { point = 'MLG left aft ring', sector = 'aft', inboard = 45, ideal = 180 },
    { point = 'MLG right aft ring', sector = 'aft', inboard = 45, ideal = 180 },
  },
}

-- the pattern for a jet: intermediate on an elevator's platform, initial elsewhere
function TD.patternFor(jet)
  return TD.deckOf(jet) ~= 1 and 'intermediate' or 'initial'
end

local function loadData(file)
  local f = loadfile(file)
  local ok, t = pcall(function() return f and f() end)
  if ok and type(t) == 'table' then return t end
  return nil
end

function TD.points()
  if not TD.pts then
    local t = loadData(TD.POINTS_FILE)
    TD.pts, TD.obstacles = {}, (t and t.obstacles) or {}
    for _, p in ipairs(t and t.points or {}) do TD.pts[p.name] = p end
  end
  return TD.pts
end

-- the first obstacle a point of the jet's frame is within CLEAR_GAP of, or nil (not the strut the chain's own ring is on)
local function ownRing(o, point)
  for _, n in ipairs(o.rings or {}) do if n == point then return true end end
  return false
end

local function inside(q, point)
  for _, o in ipairs(TD.obstacles or {}) do
    if ownRing(o, point) then
      -- (the chain's own ring's strut)
    elseif o.kind == 'wheel' then
      local ax = q[3] - o.z
      local rr = math.sqrt((q[1] - o.x) ^ 2 + (q[2] - o.y) ^ 2)
      if math.abs(ax) <= o.w / 2 + TD.CLEAR_GAP and rr <= o.r + TD.CLEAR_GAP then return o end
    elseif o.kind == 'strut' then
      local a, b = o.a, o.b
      local d = { b[1] - a[1], b[2] - a[2], b[3] - a[3] }
      local dd = d[1] * d[1] + d[2] * d[2] + d[3] * d[3]
      local t = ((q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2] + (q[3] - a[3]) * d[3]) / dd
      t = math.max(0, math.min(1, t))
      local c = { a[1] + t * d[1], a[2] + t * d[2], a[3] + t * d[3] }
      if math.sqrt((q[1] - c[1]) ^ 2 + (q[2] - c[2]) ^ 2 + (q[3] - c[3]) ^ 2) <= o.r + TD.CLEAR_GAP then return o end
    end
  end
  return nil
end

-- the obstacle the chain from f to g (the jet's frame), from the point named, passes through, or nil
function TD.blocked(f, g, point)
  local d = { g[1] - f[1], g[2] - f[2], g[3] - f[3] }
  local len = math.sqrt(d[1] * d[1] + d[2] * d[2] + d[3] * d[3])
  local s = TD.CLEAR_SKIP
  while s <= len do
    local o = inside({ f[1] + d[1] * s / len, f[2] + d[2] * s / len, f[3] + d[3] * s / len }, point)
    if o then return o end
    s = s + TD.CLEAR_STEP
  end
  return nil
end

function TD.padeyes()
  if not TD.map then
    local t = loadData(TD.MAP_FILE)
    TD.map, TD.platforms = {}, {}
    for _, r in ipairs(t and t.list or {}) do
      local g = r[2]
      TD.map[#TD.map + 1] = { n = r[1], g = g, x = r[3], z = r[4] }
      if g ~= 1 then
        local b = TD.platforms[g]
        if not b then b = { x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9 } TD.platforms[g] = b end
        b.x0, b.x1, b.z0, b.z1 = math.min(b.x0, r[3]), math.max(b.x1, r[3]), math.min(b.z0, r[4]), math.max(b.z1, r[4])
      end
    end
  end
  return TD.map
end

-- the deck a jet stands on: an elevator's group (its origin within PLATFORM_MARGIN of the box round that platform's
-- padeyes), else the flight deck's (1)
TD.PLATFORM_MARGIN = 0.5
function TD.deckOf(jet)
  TD.padeyes()
  for g, b in pairs(TD.platforms) do
    local m = TD.PLATFORM_MARGIN
    if jet.p[1] >= b.x0 - m and jet.p[1] <= b.x1 + m and jet.p[3] >= b.z0 - m and jet.p[3] <= b.z1 + m then return g end
  end
  return 1
end

-- a point of the jet's frame in the ship's
local function shipOf(jet, p)
  return {
    jet.p[1] + p.x * jet.x[1] + p.y * jet.y[1] + p.z * jet.z[1],
    jet.p[2] + p.x * jet.x[2] + p.y * jet.y[2] + p.z * jet.z[2],
    jet.p[3] + p.x * jet.x[3] + p.y * jet.y[3] + p.z * jet.z[3],
  }
end

-- the chains for a pattern: { { want, fit (ship frame), pad, len, rise, bearing, h } }, and what could not be chosen
function TD.choose(jet, deckY, pattern, used)
  local pts, pads = TD.points(), TD.padeyes()
  local out, missing = {}, {}
  used = used or {} -- (padeyes taken: shared by every aircraft of "Tie down all")
  -- the jet's nose and right along the deck
  local nx, nz = jet.x[1], jet.x[3]
  local nl = math.sqrt(nx * nx + nz * nz)
  nx, nz = nx / nl, nz / nl
  local rx, rz = -nz, nx
  -- a point of the ship's frame in the jet's
  local function jetOf(q)
    local v = { q[1] - jet.p[1], q[2] - jet.p[2], q[3] - jet.p[3] }
    return { v[1] * jet.x[1] + v[2] * jet.x[2] + v[3] * jet.x[3], v[1] * jet.y[1] + v[2] * jet.y[2] + v[3] * jet.y[3], v[1] * jet.z[1] + v[2] * jet.z[2] + v[3] * jet.z[3] }
  end
  local onDeck = TD.deckOf(jet)
  -- every chain's candidates first (padeyes taken by other aircraft left out), then THE FEWEST FIRST: each chain in
  -- turn, the one with the fewest candidates, takes its best still free; where none is free, a chain holding one of
  -- its candidates moves on to another of its own, and so on (an augmenting path: as many chains as the padeyes allow;
  -- in the pattern's order alone, the nose's chains took the padeyes the main gears' forward-inboard chains had alone
  -- on an elevator's platform)
  local wants = TD.PATTERNS[pattern or 'initial']
  local found = {}
  for wi, want in ipairs(wants) do
    local names = want.points or { want.point }
    local sec = TD.SECTORS[want.sector]
    local lo, hi, ideal = want.lo or sec.lo, (want.hi or sec.hi) + (want.inboard or 0), want.ideal or sec.ideal
    local cands, nIn, blockedBy, absent = {}, 0, {}, {}
    for _, pname in ipairs(names) do
     local p = pts[pname]
     if not p then
      absent[#absent + 1] = pname
     else
      local fit = shipOf(jet, p)
      local fitJ = { p.x, p.y, p.z }
      local rise = fit[2] - deckY
      local outSign = p.z >= 0 and 1 or -1
      for _, d in ipairs(pads) do
        if not used[d.n] and d.g == onDeck then
          local dx, dz = d.x - fit[1], d.z - fit[3]
          local h = math.sqrt(dx * dx + dz * dz)
          local len = math.sqrt(h * h + rise * rise)
          if h >= TD.REACH_MIN and len >= TD.L_MIN + TD.LEN_SPARE and len <= TD.L_MAX - TD.LEN_SPARE then
            local along, across = dx * nx + dz * nz, (dx * rx + dz * rz) * outSign
            local bearing = math.deg((math.atan2 or math.atan)(across, along))
            if bearing < 0 then bearing = bearing + 360 end -- (past the tail onto the fuselage's side: 180 and more)
            if bearing >= lo and bearing <= hi then
              nIn = nIn + 1
              local o = TD.blocked(fitJ, jetOf({ d.x, deckY, d.z }), pname)
              if o then
                blockedBy[o.name] = true
              else
                cands[#cands + 1] = { want = want, point = pname, fit = fit, pad = d, len = len, rise = math.deg(math.atan(rise / h)), bearing = bearing, h = h,
                  score = 1000 * TD.band(bearing - ideal) + TD.H_WEIGHT * math.abs(h - TD.H_BEST) }
              end
            end
          end
        end
      end
     end
    end
    table.sort(cands, function(a, b) return a.score < b.score end)
    found[wi] = { cands = cands, nIn = nIn, blockedBy = blockedBy, absent = absent, names = names }
  end
  local order = {}
  for wi in ipairs(wants) do order[#order + 1] = wi end
  table.sort(order, function(a, b)
    if #found[a].cands ~= #found[b].cands then return #found[a].cands < #found[b].cands end
    return a < b
  end)
  local pick, holder = {}, {}
  local function seat(wi, seen)
    for _, c in ipairs(found[wi].cands) do
      local n = c.pad.n
      if not used[n] and not seen[n] then
        seen[n] = true
        if not holder[n] or seat(holder[n], seen) then
          holder[n], pick[wi] = wi, c
          return true
        end
      end
    end
    return false
  end
  for _, wi in ipairs(order) do
    -- (its best free one first; only then the moves)
    for _, c in ipairs(found[wi].cands) do
      if not used[c.pad.n] and not holder[c.pad.n] then holder[c.pad.n], pick[wi] = wi, c break end
    end
    if not pick[wi] then seat(wi, {}) end
  end
  for n in pairs(holder) do used[n] = true end
  for wi, want in ipairs(wants) do
    local f = found[wi]
    if pick[wi] then
      out[#out + 1] = pick[wi]
    elseif #f.absent == #f.names then
      missing[#missing + 1] = table.concat(f.names, ' / ') .. ' (not in ' .. TD.POINTS_FILE .. ')'
    else
      local why = {}
      for n in pairs(f.blockedBy) do why[#why + 1] = n end
      table.sort(why)
      missing[#missing + 1] = string.format('%s (%s: %s)', table.concat(f.names, ' / '), want.label or want.sector:upper(),
        #f.cands > 0 and 'every free one in reach taken by its other chains'
        or f.nIn == 0 and string.format('no padeye %.1f m or more out and in its chain\'s reach', TD.REACH_MIN) or ('every one in reach is behind ' .. table.concat(why, ', ')))
    end
  end
  return out, missing
end

local function mission(code)
  local ok, r = pcall(api.dostring, code)
  if not ok then return { 'ERR', tostring(r) } end
  if type(r) ~= 'string' then return { 'ERR', 'the menu script answered nothing' } end
  return api.split(r)
end

-- a chosen chain's point on the jet: the one it was fitted from (a pattern line with a `points` list, the
-- intermediate pattern's AFT C and FWD IN, has no `point` of its own)
function TD.pointOf(e)
  return tostring(e.point or e.want.point or e.want.label or (e.want.points and table.concat(e.want.points, ' / ')) or '?')
end

local function writeArgs(e)
  local good, why = true, nil
  for _, a in ipairs({ { TD.LEN_ARG, e.len / TD.LEN_SCALE }, { TD.ELEV_ARG, e.rise / 90 }, { TD.COLOUR_ARG, 0 } }) do
    local ok, res, w = pcall(api.objarg, e.id, a[1], a[2])
    if not (ok and res ~= nil and res ~= false) then good, why = false, tostring(ok and w or res) end
  end
  if not e.said then
    e.said = true
    api.log(string.format('tiedowns: %s (object %s): arguments 10 = %.4f, 11 = %.4f, 12 = 0 %s', TD.pointOf(e), tostring(e.id), e.len / TD.LEN_SCALE, e.rise / 90,
      good and 'written' or ('NOT WRITTEN: ' .. tostring(why))))
  end
  e.at = api.now()
  return good, why
end

-- the chosen chains made as statics: keys keyBase .. i; { made }, { why not made }
-- ON AN ELEVATOR'S PLATFORM, AT ITS HEIGHT (the user, 2026-11-26: "The elevator tie downs appear to always spawn at
-- flight deck level, not at hangar deck level and then translate up with the aircraft"): a chain is a static linked to
-- the ship, which DCS makes on the flight deck; one whose padeye is on a platform (api.platformAt: the platform's
-- surface now) is put down to it by the native module (api.staticpos, in the ship's own frame), and moved with it
-- every frame it moves (TD.follow). e.py: the height it was last put at (nil: the flight deck's, where DCS made it).
function TD.follow(e)
  if not (api.platformAt and api.staticpos and e.id) then return end
  -- (the platform under the aircraft's fitting: the padeyes of a platform are on it)
  local y = api.platformAt(e.fit and e.fit[1] or e.pad.x, e.fit and e.fit[3] or e.pad.z)
  if y and (not e.py or math.abs(y - e.py) > 0.001) then
    local ok, res = pcall(api.staticpos, e.id, e.pad.x, y, e.pad.z, math.cos(e.ang), math.sin(e.ang))
    if ok and res then e.py = y end
  end
end

-- the deck under an aircraft: its platform's surface, or the flight deck
function TD.deckUnder(a)
  return (api.platformAt and api.platformAt(a.p[1], a.p[3])) or api.deckY()
end

local function makeChains(chosen, keyBase, ship)
  local list, bad = {}, {}
  for i, ch in ipairs(chosen) do
    local key = keyBase .. i
    local ang = (math.atan2 or math.atan)(ch.fit[3] - ch.pad.z, ch.fit[1] - ch.pad.x)
    local r = mission(string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, %q, %.4f, %.4f, %.5f, nil, %q) or "ERR|the menu script cannot place markers"',
      key, TD.TYPE, ch.pad.x, ch.pad.z, ang, ship))
    if r[1] == 'OK' and tonumber(r[2]) and tonumber(r[2]) ~= 0 then
      ch.key, ch.id, ch.name, ch.ang, ch.at, ch.py, ch.ship = key, tonumber(r[2]), r[3], ang, -1e9, nil, ship
      TD.follow(ch)
      list[#list + 1] = ch
    else
      bad[#bad + 1] = TD.pointOf(ch) .. ': ' .. tostring(r[2])
    end
  end
  return list, bad
end

-- the six made (anew) on the player's jet: a message, or nil and why
function TD.place()
  local c = api.ctx()
  if not c then return nil, 'tiedowns: no carrier here.' end
  local jet, why = api.jet()
  if not jet then return nil, 'tiedowns: ' .. tostring(why) .. '.' end
  if jet.type ~= 'FA-18C_hornet' then return nil, 'tiedowns: your aircraft is a ' .. tostring(jet.type) .. ': the tie-down points are the F/A-18C\'s only.' end
  TD.clear(true)
  local deckY = TD.deckUnder(jet)
  local pattern = TD.patternFor(jet)
  local want = #TD.PATTERNS[pattern]
  local chosen, missing = TD.choose(jet, deckY, pattern)
  local list, bad = makeChains(chosen, 'catcc-tiedown-', c.ship)
  TD.list = #list > 0 and list or nil
  TD.all = nil
  local unset
  for _, e in ipairs(list) do
    local ok, w = writeArgs(e)
    if not ok then unset = w end
  end
  api.log(string.format('tiedowns: %s (%d) on your jet: ', pattern, want) .. TD.lines(list) .. (#missing > 0 and ('; NOT CHOSEN: ' .. table.concat(missing, '; ')) or '')
    .. (#bad > 0 and ('; NOT MADE: ' .. table.concat(bad, '; ')) or ''))
  if #list == 0 then return nil, 'tiedowns: none made: ' .. table.concat(missing, '; ') .. table.concat(bad, '; ') end
  return string.format('tiedowns: %d of %d on your jet.%s%s%s', #list, want, #missing > 0 and (' Not chosen: ' .. table.concat(missing, '; ') .. '.') or '',
    #bad > 0 and (' Not made: ' .. table.concat(bad, '; ') .. '.') or '', unset and (' Arguments not set yet (' .. unset .. '): tried again every half second.') or '')
end

function TD.lines(list)
  local t = {}
  for _, e in ipairs(list or {}) do
    t[#t + 1] = string.format('%s to padeye %d (%.3f / %.3f): %s, bearing %.0f deg, %.2f m out, %.3f m long, %.0f deg up', TD.pointOf(e), e.pad.n, e.pad.x, e.pad.z,
      e.want.label or e.want.sector:upper(), e.bearing, e.h, e.len, e.rise)
  end
  return table.concat(t, '; ')
end

-- all taken away (quiet: no message, for place's own clearing)
function TD.clear(quiet)
  for _, e in ipairs(TD.list or {}) do
    mission(string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, "", 0, 0, 0, nil, %s) or "OK"', e.key, e.ship and string.format('%q', e.ship) or 'nil'))
  end
  local had = TD.list and #TD.list or 0
  TD.list, TD.all = nil, nil
  if quiet then return nil end
  return had > 0 and string.format('tiedowns: %d taken away.', had) or 'tiedowns: none to take away.'
end

-- THE STATIC HORNETS ON THE FLIGHT DECK (the user, 2026-11-25: "a "tie down" all function I can use to scan all spots
-- on static aircraft as well"): every static object of the Hornet's types (the deck's spotted aircraft whatever their
-- names: the mission's, the slot picker's, the demo's; the lookalike's two) whose origin is on the carrier's flight deck
-- (within ALL_REACH of its origin along and across, over ALL_ABOVE: not the hangar's), with its place and axes in the
-- ship's frame: { name, type, p, x, y, z }
TD.ALL_TYPES = { ['FA-18C_hornet'] = true, ['CATCC_HornetLook'] = true, ['CATCC_HornetLookF'] = true }
TD.ALL_REACH, TD.ALL_ABOVE = { 175, 45 }, 15
function TD.statics(c)
  local types = {}
  for t in pairs(TD.ALL_TYPES) do types[#types + 1] = string.format('[%q] = true', t) end
  local r = mission(string.format([[
local want = { %s }
local out = {}
for _, side in pairs(coalition.side) do
  for _, o in ipairs(coalition.getStaticObjects(side) or {}) do
    local okt, t = pcall(o.getTypeName, o)
    if okt and want[t] and o:isExist() then
      local P = o:getPosition()
      out[#out + 1] = string.format('%%s,%%s,%%.4f,%%.4f,%%.4f,%%.6f,%%.6f,%%.6f,%%.6f,%%.6f,%%.6f,%%.6f,%%.6f,%%.6f,%%s', (tostring(o:getName()):gsub('[,;|]', ' ')), t,
        P.p.x, P.p.y, P.p.z, P.x.x, P.x.y, P.x.z, P.y.x, P.y.y, P.y.z, P.z.x, P.z.y, P.z.z, tostring(tonumber(o.id_) or 0))
    end
  end
end
return 'OK|' .. table.concat(out, ';')]], table.concat(types, ', ')))
  if r[1] ~= 'OK' then return nil, tostring(r[2]) end
  local s = c.s
  local function rel(x, y, z, point)
    if point then x, y, z = x - s[10], y - s[11], z - s[12] end
    return { x * s[1] + y * s[2] + z * s[3], x * s[4] + y * s[5] + z * s[6], x * s[7] + y * s[8] + z * s[9] }
  end
  local out = {}
  for item in tostring(r[2] or ''):gmatch('[^;]+') do
    local f = {}
    for v in item:gmatch('[^,]+') do f[#f + 1] = v end
    local n = {}
    for i = 3, 14 do n[i - 2] = tonumber(f[i]) end
    if #n == 12 then
      local a = { name = f[1], type = f[2], p = rel(n[1], n[2], n[3], true), x = rel(n[4], n[5], n[6]), y = rel(n[7], n[8], n[9]), z = rel(n[10], n[11], n[12]), id = tonumber(f[15]) }
      -- (on the flight deck; or on an elevator's platform, whatever its height: api.platformAt)
      if math.abs(a.p[1]) <= TD.ALL_REACH[1] and math.abs(a.p[3]) <= TD.ALL_REACH[2] and (a.p[2] >= TD.ALL_ABOVE or (api.platformAt and api.platformAt(a.p[1], a.p[3]))) then out[#out + 1] = a end
    end
  end
  table.sort(out, function(a, b) return a.p[1] > b.p[1] end)
  return out
end

-- every static Hornet of the flight deck (and the player's jet, if an F/A-18C there) on initial: one padeye a chain over
-- the whole deck (none twice). A message, or nil and why
function TD.placeAll()
  local c = api.ctx()
  if not c then return nil, 'tiedowns: no carrier here.' end
  local planes, why = TD.statics(c)
  if not planes then return nil, 'tiedowns: the statics could not be read: ' .. tostring(why) end
  local jet = api.jet()
  if jet and jet.type == 'FA-18C_hornet' and jet.p[2] >= TD.ALL_ABOVE then
    jet.name = 'your jet'
    table.insert(planes, 1, jet)
  end
  if #planes == 0 then return nil, 'tiedowns: no Hornet on the flight deck.' end
  TD.clear(true)
  local deckY = api.deckY()
  local used, list, all, chains, short = {}, {}, {}, 0, 0
  for i, a in ipairs(planes) do
    local pattern = TD.patternFor(a)
    local want = #TD.PATTERNS[pattern]
    local chosen, missing = TD.choose(a, TD.deckUnder(a), pattern, used)
    local made, bad = makeChains(chosen, string.format('catcc-tiedown-a%d-', i), c.ship)
    for _, e in ipairs(made) do list[#list + 1] = e end
    chains = chains + #made
    if #made < want then short = short + 1 end
    all[#all + 1] = { name = a.name, made = made, missing = missing, bad = bad, want = want, pattern = pattern }
    api.log(string.format('tiedowns: all: %s (%.1f fwd, %.1f stbd): %s, %d of %d: %s%s%s', tostring(a.name), a.p[1], a.p[3], pattern, #made, want, TD.lines(made),
      #missing > 0 and ('; NOT CHOSEN: ' .. table.concat(missing, '; ')) or '', #bad > 0 and ('; NOT MADE: ' .. table.concat(bad, '; ')) or ''))
  end
  TD.list = #list > 0 and list or nil
  TD.all = all
  for _, e in ipairs(list) do writeArgs(e) end
  return string.format('tiedowns: all: %d chains on %d Hornets; %d with all of their pattern (6 initial, 9 intermediate on the elevators), %d short (Report says which).', chains, #planes, #planes - short, short)
end

function TD.report()
  if not TD.list then return 'tiedowns: none placed.' end
  if TD.all then
    local t = {}
    for _, a in ipairs(TD.all) do
      if #a.made < a.want then
        t[#t + 1] = string.format('%s %d of %d (%s)', tostring(a.name), #a.made, a.want, table.concat(a.missing, '; ') .. table.concat(a.bad, '; '))
      end
      api.log(string.format('tiedowns: report: %s: %s', tostring(a.name), TD.lines(a.made)))
    end
    return string.format('tiedowns: %d Hornets, %d chains. %s', #TD.all, #TD.list, #t > 0 and ('Short: ' .. table.concat(t, ' | ') .. '.') or 'Every one has all of its pattern.')
  end
  local s = TD.lines(TD.list)
  api.log('tiedowns: report: ' .. s)
  return 'tiedowns: ' .. s .. '.'
end

-- THE PARKED AIRCRAFT CHAINED DOWN BY THEMSELVES (the user, 2026-11-26: "I would like tie downs to be applied once the
-- aircraft is stationary, both on the elevator (intermediate - 9 chains) and once spotted on the deck (initial - 6
-- chains)"). Every static Hornet on the flight deck or on a platform that is up (TD.statics: the deck spotting demo's,
-- the mission's, the lookalikes), asked for every AUTO.every seconds:
--   CHAINED when its chocks are in (argument 23 from AUTO.chocked: the demo writes 0.25 for in, 0 from the moment a
--           tractor is hooked on; in again a second after a tow has stopped, while its tractor is still on the bar),
--           from where it is asked to stand AFTER they went in (asked at once then): so before its tractor unhooks
--           (the user, 2026-11-26: "Chains are always removed after the tug connects, and added before the tug
--           disconnects"). Its pattern (TD.patternFor: intermediate on a platform, initial on the deck) on padeyes no
--           other chained aircraft has. One aircraft a frame at the most (a chain is a mission call).
--   FREED   the moment its chocks come out (read every AUTO.look seconds: before its tractor pulls), or it is found
--           somewhere else, or it is gone: its chains taken away and its padeyes free again.
-- The player's own jet is the "Tie down my jet" button's, as before. AUTO.on = false: none of this.
local AUTO = { on = true, every = 2, look = 0.25, chocked = 0.2, moved = 0.05, perFrame = 1 }
TD.AUTO = AUTO
TD.auto = { planes = {}, used = {} }

local function autoClear(a, why)
  local bad
  for _, e in ipairs(a.chains or {}) do
    -- (on ITS carrier, by name: without one the mission script takes the player's ship, and a spectator has none: the
    -- user's run of 2026-11-26, the chains of an aircraft taken off a platform stayed on it)
    local r = mission(string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, "", 0, 0, 0, nil, %s) or "OK"', e.key, e.ship and string.format('%q', e.ship) or 'nil'))
    if r[1] ~= 'OK' then bad = tostring(r[2]) end
    if e.pad then TD.auto.used[e.pad.n] = nil end
  end
  if bad then api.log(string.format('tiedowns: auto: %s: a chain could NOT be taken away: %s', tostring(a.name), bad)) end
  if a.chains and #a.chains > 0 then api.log(string.format('tiedowns: auto: %s: %d chain(s) taken away (%s)', tostring(a.name), #a.chains, why)) end
  a.chains = nil
end

local function autoPlace(a, c, deckY)
  local pattern = TD.patternFor(a)
  local want = #TD.PATTERNS[pattern]
  local chosen, missing = TD.choose(a, deckY, pattern, TD.auto.used)
  local list, bad = makeChains(chosen, string.format('catcc-tiedown-o%s-', (tostring(a.id or a.name):gsub('[^%w]', ''))), c.ship)
  -- (the padeyes of chains not made are free again)
  local madeN = {}
  for _, e in ipairs(list) do madeN[e.pad.n] = true end
  for _, ch in ipairs(chosen) do if not madeN[ch.pad.n] then TD.auto.used[ch.pad.n] = nil end end
  for _, e in ipairs(list) do writeArgs(e) end
  a.chains = list
  api.log(string.format('tiedowns: auto: %s (%.1f fwd, %.1f stbd): %s, %d of %d: %s%s%s', tostring(a.name), a.p[1], a.p[3], pattern, #list, want, TD.lines(list),
    #missing > 0 and ('; NOT CHOSEN: ' .. table.concat(missing, '; ')) or '', #bad > 0 and ('; NOT MADE: ' .. table.concat(bad, '; ')) or ''))
end

function TD.autoTick(now)
  if not AUTO.on then return end
  local P = TD.auto.planes
  if now - (TD.auto.askAt or -1e9) >= AUTO.every then
    TD.auto.askAt = now
    local c = api.ctx()
    TD.auto.c = c
    local got = c and TD.statics(c)
    if got then
      local seen = {}
      for _, g in ipairs(got) do
        local k = g.name
        seen[k] = true
        local a = P[k]
        if not a then
          a = { name = g.name, since = now }
          P[k] = a
        end
        -- (up or down with its platform: not moved, its chains go with it: TD.follow)
        local plat = api.platformAt and api.platformAt(g.p[1], g.p[3])
        local moved = not a.p or math.abs(a.p[1] - g.p[1]) + math.abs(a.p[3] - g.p[3]) + (plat and 0 or math.abs(a.p[2] - g.p[2])) > AUTO.moved
          or math.abs(a.x[1] - g.x[1]) + math.abs(a.x[3] - g.x[3]) > 0.002 or a.id ~= g.id
        if moved then
          -- (put again only from a place asked after this one)
          a.since, a.inAt = now, now
          if a.chains then autoClear(a, a.id ~= g.id and 'made anew' or 'it moved') end
        end
        a.type, a.p, a.x, a.y, a.z, a.id, a.at = g.type, g.p, g.x, g.y, g.z, g.id, now
      end
      for k, a in pairs(P) do
        if not seen[k] then
          autoClear(a, 'it is gone, or below the flight deck')
          P[k] = nil
        end
      end
    end
  end
  local c = TD.auto.c
  if not c then return end
  local look = now - (TD.auto.lookAt or -1e9) >= AUTO.look
  if look then TD.auto.lookAt = now end
  local budget = AUTO.perFrame
  for _, a in pairs(P) do
    if look and a.id then
      local ok, v = pcall(api.objarg, a.id, 23)
      local was = a.chocked
      a.chocked = ok and type(v) == 'number' and v >= AUTO.chocked or false
      if a.chocked and not was then
        -- (in: where it stands asked again at once)
        a.inAt, TD.auto.askAt = now, -1e9
      end
      if a.chains and not a.chocked then autoClear(a, 'its chocks are out') end
    end
    if not a.chains and a.chocked and (a.at or -1e9) > (a.inAt or 0) and budget > 0 then
      budget = budget - 1
      autoPlace(a, c, TD.deckUnder(a))
    end
    for _, e in ipairs(a.chains or {}) do
      TD.follow(e)
      if now - (e.at or -1e9) >= TD.REWRITE then writeArgs(e) end
    end
  end
end

-- every frame: each chain's arguments written again every REWRITE seconds; the parked aircraft's chains (TD.autoTick)
function TD.tick()
  local t = api.now()
  for _, e in ipairs(TD.list or {}) do
    TD.follow(e)
    if t - (e.at or -1e9) >= TD.REWRITE then writeArgs(e) end
  end
  TD.autoTick(t)
end

function TD.reset()
  TD.list, TD.all = nil, nil
  TD.auto = { planes = {}, used = {} }
end

return TD
