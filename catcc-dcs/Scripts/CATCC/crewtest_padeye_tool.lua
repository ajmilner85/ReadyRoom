-- CATCC crew test: the padeyes (TEST ONLY). The crew test panel's "Padeyes" page (crewtest_ui.lua) draws and edits
-- with this; it has no window of its own. Asked for by the user (2026-11-23), for the tie-down chains of parked aircraft
-- to come: "a small magenta dot for each padeye that I can click on with my mouse to select, and then use our UI ... to
-- adjust in x and y directions".
--
-- THE PADEYES: Scripts/CATCC/crewtest_padeyes.lua (made by deck-test/padeyes/padeyes.py from the "Padeyes" layer of
-- the deck drawing, carrier-ops-handoff-2/Nimitz.svg: found in the deck's texture by machine), until the user changes
-- one; from then on the user's own file, Saved Games\DCS\Logs\catcc-padeyes.lua, written within half a second of every change
-- (and when the mission ends), and read again next time: the work carries over from mission to mission. padeyes.py
-- --from takes that file back into the drawing.
-- Each: n, g (its group: 1 the flight deck, 2..5 elevators 1..4, which have grids of their own), x, z (the ship's own
-- frame: metres forward of its origin, to starboard), x0, z0 (where it started), state: 'seen' (in the texture),
-- 'confirm' (where the deck's grid runs on under a painted line and the texture shows none: drawn orange until the
-- user confirms or removes it), 'confirmed' (the user says it is right: any padeye can be confirmed, drawn green; the
-- confirmed ones are what padeyes.py --fit fits the whole grid to), 'added' (made in DCS). Removed ones are left out
-- of the file.
--
-- ON THE SCREEN: each padeye in front of the camera and within MAX_DIST is projected onto the screen (at the flight
-- deck's height, as the panel projects its other marks); the nearest MAX_DOTS of them are what the panel draws.
-- A click selects the drawn one nearest the click, within PICK_PX; in "add" mode a click makes one where the click's
-- line of sight meets the flight deck. Moves are along the SHIP's axes (forward / aft, port / starboard), by the
-- chosen step, for the selected padeye, its whole group, or all of them.
--
-- api: writedir, log(text), now(). Returns the tool's table.
local api = ...
local P = { list = nil, sel = nil, undoList = {}, dirty = false, changedAt = 0, source = nil, groups = { 'Flight Deck', 'El 1', 'El 2', 'El 3', 'El 4' } }
P.file = api.writedir .. 'Logs/catcc-padeyes.lua'
P.builtInFile = api.writedir .. 'Scripts/CATCC/crewtest_padeyes.lua'
P.modelFile = api.writedir .. 'Scripts/CATCC/crewtest_padeyes_model.lua'
P.MAX_DOTS = 800    -- the most dots drawn at once (the nearest to the camera)
P.MAX_DIST = 150    -- metres from the camera
P.PICK_PX = 16      -- a click selects the nearest drawn dot within this many pixels of it
P.SAVE_QUIET = 0.5  -- seconds after the last change that the file is written
P.UNDO_MAX = 200

local function groupName(g) return P.groups[g] or ('group ' .. tostring(g)) end

-- the built-in padeyes (the drawing's), as entries
function P.builtIn()
  local f = loadfile(P.builtInFile)
  local ok, t = pcall(function() return f and f() end)
  local out = {}
  if not (ok and type(t) == 'table' and type(t.list) == 'table') then return out, 'no built-in padeyes (' .. P.builtInFile .. ')' end
  if type(t.groups) == 'table' then P.groups = t.groups end
  for _, r in ipairs(t.list) do
    if tonumber(r[1]) and tonumber(r[3]) and tonumber(r[4]) then
      out[#out + 1] = { n = r[1], g = r[2] or 1, x = r[3], z = r[4], x0 = r[3], z0 = r[4], state = (r[5] == 1) and 'confirm' or 'seen' }
    end
  end
  return out
end

-- the padeyes: the user's file if there is one, else the drawing's
function P.load()
  if P.list then return P.list end
  local f = loadfile(P.file)
  local ok, t = pcall(function() return f and f() end)
  -- (an empty list is the user's too: "Clear all", then nothing added yet)
  if ok and type(t) == 'table' and type(t.list) == 'table' then
    if type(t.groups) == 'table' then P.groups = t.groups end
    P.list = {}
    for _, e in ipairs(t.list) do
      if tonumber(e.x) and tonumber(e.z) and tonumber(e.n) then
        P.list[#P.list + 1] = { n = e.n, g = tonumber(e.g) or 1, x = e.x, z = e.z, x0 = tonumber(e.x0) or e.x, z0 = tonumber(e.z0) or e.z, state = e.state or 'seen' }
      end
    end
    P.source = 'yours'
  else
    local why
    P.list, why = P.builtIn()
    P.source = 'drawing'
    if why then api.log('padeyes: ' .. why) end
  end
  P.seq = 0
  for _, e in ipairs(P.list) do P.seq = math.max(P.seq, e.n) end
  api.log(string.format('padeyes: %d from %s', #P.list, P.source == 'yours' and P.file or P.builtInFile))
  return P.list
end

function P.save()
  local f = io.open(P.file, 'w')
  if not f then
    api.log('padeyes: the file could not be written: ' .. P.file)
    return false
  end
  local parts = {
    '-- CATCC padeyes: the flight deck\'s tie-down points as set with the crew test panel\'s "Padeyes" page. Written by the crew test hook, ' .. tostring(os.date('%Y-%m-%d %H:%M:%S')) .. '.\n',
    '-- x: metres forward of the ship\'s origin; z: to starboard; x0, z0: where it started. g: its group (groups). state: "seen" (found in\n',
    '-- the deck\'s texture), "confirm" (under paint, not confirmed), "confirmed", "added" (made in DCS). Removed ones are left out.\n',
    '-- Into the deck drawing: python -I catcc-dcs/deck-test/padeyes/padeyes.py --from <this file>\n',
    'return { groups = { ',
  }
  for i, g in ipairs(P.groups) do parts[#parts + 1] = string.format('%s%q', i > 1 and ', ' or '', g) end
  parts[#parts + 1] = ' }, list = {\n'
  for _, e in ipairs(P.list) do
    if not e.removed then
      parts[#parts + 1] = string.format('  { n = %d, g = %d, x = %.3f, z = %.3f, x0 = %.3f, z0 = %.3f, state = %q },\n', e.n, e.g, e.x, e.z, e.x0, e.z0, e.state)
    end
  end
  parts[#parts + 1] = '} }\n'
  f:write(table.concat(parts))
  f:close()
  P.dirty = false
  P.version = (P.version or 0) + 1
  P.source = 'yours'
  return true
end

-- (the file written when changes have been quiet for a moment: a run of nudges is one write)
function P.tick(t)
  if P.dirty and t - P.changedAt >= P.SAVE_QUIET then P.save() end
end

function P.flush()
  if P.dirty then P.save() end
end

local function changed()
  P.dirty = true
  P.changedAt = api.now()
  P.version = (P.version or 0) + 1
end

-- what each change undoes: the entries it touched, as they were
local function remember(what, entries)
  local snap = {}
  for i, e in ipairs(entries) do snap[i] = { e = e, x = e.x, z = e.z, state = e.state, removed = e.removed } end
  P.undoList[#P.undoList + 1] = { what = what, snap = snap, sel = P.sel }
  if #P.undoList > P.UNDO_MAX then table.remove(P.undoList, 1) end
end

function P.counts()
  local n, conf, done = 0, 0, 0
  for _, e in ipairs(P.load()) do
    if not e.removed then
      n = n + 1
      if e.state == 'confirm' then conf = conf + 1 elseif e.state == 'confirmed' then done = done + 1 end
    end
  end
  return n, conf, done
end

-- metres to two places, without a "-0.00"
local function m2(v)
  local r = math.floor(v * 100 + 0.5) / 100
  if r == 0 then r = 0 end
  return string.format('%.2f', r)
end
P.m2 = m2

function P.text(e)
  local dx, dz = e.x - e.x0, e.z - e.z0
  local moved = math.sqrt(dx * dx + dz * dz)
  return string.format('padeye %d (%s%s): %s m forward, %s to starboard%s', e.n, groupName(e.g),
    e.state == 'confirm' and ', to confirm' or (e.state == 'added' and ', added' or (e.state == 'confirmed' and ', confirmed' or '')), m2(e.x), m2(e.z),
    moved >= 0.005 and string.format('; moved %s m forward, %s to starboard', m2(dx), m2(dz)) or '')
end

-- the padeyes on the screen. c: the panel's camera (o, f, r, u in the ship's frame, sw, sh, tanH, tanV); y: the flight
-- deck's height. Gives { { e, sx, sy, d } } (the nearest MAX_DOTS), kept for the clicks (P.drawn).
local function projectList(list, c, y)
  local out = {}
  if not c then return out end
  local ox, oy, oz = c.o[1], c.o[2], c.o[3]
  local fx, fy, fz = c.f[1], c.f[2], c.f[3]
  local rx, ry, rz = c.r[1], c.r[2], c.r[3]
  local ux, uy, uz = c.u[1], c.u[2], c.u[3]
  local hw, hh = c.sw / 2, c.sh / 2
  local maxD2 = P.MAX_DIST * P.MAX_DIST
  local vy = y - oy
  for _, e in ipairs(list) do
    if not e.removed then
      local vx, vz = e.x - ox, e.z - oz
      local d2 = vx * vx + vy * vy + vz * vz
      if d2 < maxD2 then
        local zf = vx * fx + vy * fy + vz * fz
        if zf > 0.5 then
          local px = hw * (1 + (vx * rx + vy * ry + vz * rz) / (zf * c.tanH))
          local py = hh * (1 - (vx * ux + vy * uy + vz * uz) / (zf * c.tanV))
          if px >= 0 and px < c.sw and py >= 0 and py < c.sh then out[#out + 1] = { e = e, sx = px, sy = py, d = d2 } end
        end
      end
    end
  end
  if #out > P.MAX_DOTS then
    table.sort(out, function(a, b) return a.d < b.d end)
    for i = #out, P.MAX_DOTS + 1, -1 do out[i] = nil end
  end
  return out
end

function P.project(c, y)
  local out = projectList(P.load(), c, y)
  P.drawn = out
  return out
end

-- THE MODEL'S PADEYES (2026-11-25: DCS's own carrier model has them, its "Vodostoki" mesh: crewtest_padeyes_model.lua,
-- made by deck-test/padeyes/vodostoki.py). Shown beside the user's, to be checked against the deck; never edited,
-- never picked by a click. Gives the same as P.project (not kept for clicks).
function P.loadModel()
  if P.model then return P.model end
  local f = loadfile(P.modelFile)
  local ok, t = pcall(function() return f and f() end)
  P.model = {}
  if ok and type(t) == 'table' and type(t.list) == 'table' then
    for _, r in ipairs(t.list) do
      if tonumber(r[1]) and tonumber(r[3]) and tonumber(r[4]) then
        P.model[#P.model + 1] = { n = r[1], g = r[2] or 1, x = r[3], z = r[4], style = r[5], state = 'model' }
      end
    end
  end
  api.log(string.format('padeyes: the model\'s %d (%s)', #P.model, P.modelFile))
  return P.model
end

function P.projectModel(c, y)
  return projectList(P.loadModel(), c, y)
end

-- THE COMBINED PADEYES (2026-11-25, "Combined", green): the model's, and each of the user's that no model padeye is
-- within SAME_M of (the user's own additions). What the panel's padeyes are to become, once the user says so.
function P.combined()
  local v = P.version or 0
  if P.combinedList and P.combinedAt == v then return P.combinedList end
  local model = P.loadModel()
  local h = {}
  for _, e in ipairs(model) do
    local k = math.floor(e.x) .. ':' .. math.floor(e.z)
    h[k] = h[k] or {}
    table.insert(h[k], e)
  end
  local out, added = {}, 0
  for _, e in ipairs(model) do out[#out + 1] = { x = e.x, z = e.z, g = e.g, state = 'combined', from = 'model' } end
  local r2 = P.SAME_M * P.SAME_M
  for _, e in ipairs(P.load()) do
    if not e.removed then
      local dup = false
      for i = math.floor(e.x - P.SAME_M), math.floor(e.x + P.SAME_M) do
        for j = math.floor(e.z - P.SAME_M), math.floor(e.z + P.SAME_M) do
          for _, q in ipairs(h[i .. ':' .. j] or {}) do
            if (q.x - e.x) ^ 2 + (q.z - e.z) ^ 2 <= r2 then dup = true end
          end
        end
      end
      if not dup then
        out[#out + 1] = { x = e.x, z = e.z, g = e.g, state = 'combined', from = 'yours' }
        added = added + 1
      end
    end
  end
  P.combinedList, P.combinedAt, P.combinedAdded = out, v, added
  return out
end

function P.projectCombined(c, y)
  return projectList(P.combined(), c, y)
end

-- THE HOLES (2026-11-25, "Holes"): places the deck's grid has a padeye and neither the model nor the user has one,
-- to be looked at in DCS (a painted area, a catapult track or the like may truly have none). From every padeye of
-- the flight deck (the model's and the user's) each of the grid's six steps (HOLE_STEPS, measured from the model) points at a place;
-- a place with no padeye within HOLE_EMPTY, pointed at by HOLE_VOTES padeyes or more (within HOLE_JOIN of each other),
-- is a hole, at the mean of where they point. Worked out again after each change of the user's.
P.HOLE_STEPS = { { 2.409, 0 }, { 1.204, 1.526 }, { 1.204, -1.526 } }
P.HOLE_EMPTY = 0.5
P.HOLE_JOIN = 0.35
P.HOLE_VOTES = 3

local function cellKey(x, z) return math.floor(x) .. ':' .. math.floor(z) end

local function hashOf(list)
  local h = {}
  for _, e in ipairs(list) do
    local k = cellKey(e.x, e.z)
    local c = h[k]
    if not c then c = {} h[k] = c end
    c[#c + 1] = e
  end
  return h
end

local function anyNear(h, x, z, r)
  local r2 = r * r
  for i = math.floor(x - r), math.floor(x + r) do
    for j = math.floor(z - r), math.floor(z + r) do
      local c = h[i .. ':' .. j]
      if c then
        for _, e in ipairs(c) do
          if (e.x - x) ^ 2 + (e.z - z) ^ 2 <= r2 then return e end
        end
      end
    end
  end
  return nil
end

function P.holes()
  local v = P.version or 0
  if P.holeList and P.holeAt == v then return P.holeList end
  local pts = {}
  -- (the flight deck's only: each elevator's platform has a grid of its own, whose steps point off the platform)
  for _, e in ipairs(P.loadModel()) do if (e.g or 1) == 1 then pts[#pts + 1] = e end end
  for _, e in ipairs(P.load()) do if not e.removed and (e.g or 1) == 1 then pts[#pts + 1] = e end end
  local h = hashOf(pts)
  local groups, gh = {}, {}
  for _, p in ipairs(pts) do
    for _, st in ipairs(P.HOLE_STEPS) do
      for sg = -1, 1, 2 do
        local x, z = p.x + sg * st[1], p.z + sg * st[2]
        if not anyNear(h, x, z, P.HOLE_EMPTY) then
          local g = anyNear(gh, x, z, P.HOLE_JOIN)
          if g then
            g.sx, g.sz, g.n = g.sx + x, g.sz + z, g.n + 1
          else
            g = { x = x, z = z, sx = x, sz = z, n = 1 }
            groups[#groups + 1] = g
            local k = cellKey(x, z)
            gh[k] = gh[k] or {}
            table.insert(gh[k], g)
          end
        end
      end
    end
  end
  local out = {}
  for _, g in ipairs(groups) do
    if g.n >= P.HOLE_VOTES then out[#out + 1] = { x = g.sx / g.n, z = g.sz / g.n, state = 'hole', votes = g.n } end
  end
  P.holeList, P.holeAt = out, v
  return out
end

function P.projectHoles(c, y)
  return projectList(P.holes(), c, y)
end

-- a click at sx, sy: the drawn padeye nearest it is selected
function P.pick(sx, sy)
  local best, bd = nil, P.PICK_PX * P.PICK_PX
  for _, q in ipairs(P.drawn or {}) do
    local d = (q.sx - sx) ^ 2 + (q.sy - sy) ^ 2
    if d <= bd then best, bd = q.e, d end
  end
  if not best then return nil, 'padeyes: no padeye there (click on a dot)' end
  P.sel = best
  return 'padeyes: selected ' .. P.text(best) .. '.'
end

-- the elevators' platforms as DCS's models have them (deck-test/hangar/hangar-map.json): x, z ranges; the group of
-- a padeye added on one (2..5: elevators 1..4); anywhere else the flight deck (1)
P.PLATFORMS = {
  { g = 2, x = { 16.7, 42.6 }, z = { 21.37, 37.21 } },
  { g = 3, x = { -30.63, -4.73 }, z = { 21.37, 37.21 } },
  { g = 4, x = { -109.66, -83.76 }, z = { 21.37, 37.21 } },
  { g = 5, x = { -115.75, -89.85 }, z = { -37.21, -21.37 } },
}
P.SAME_M = 0.3 -- a click this near a padeye there already selects it instead of adding a second (the grid: 1.5 m)

function P.groupAt(x, z)
  for _, p in ipairs(P.PLATFORMS) do
    if x >= p.x[1] and x <= p.x[2] and z >= p.z[1] and z <= p.z[2] then return p.g end
  end
  return 1
end

-- a new padeye where the line of sight (o, d: ship's frame) meets the flight deck (height y); its group by where it
-- is (an elevator's platform, or the flight deck); a click on one there already selects that one
function P.addAt(o, d, y)
  if d[2] > -0.02 then return nil, 'padeyes: that click looks level or up: it never meets the deck.' end
  local k = (y - o[2]) / d[2]
  if k > P.MAX_DIST then return nil, 'padeyes: the deck is more than ' .. P.MAX_DIST .. ' m away there: not added.' end
  local x, z = o[1] + d[1] * k, o[3] + d[3] * k
  local near, bd = nil, P.SAME_M * P.SAME_M
  for _, e in ipairs(P.load()) do
    if not e.removed then
      local dd = (e.x - x) ^ 2 + (e.z - z) ^ 2
      if dd < bd then near, bd = e, dd end
    end
  end
  if near then
    P.sel = near
    return 'padeyes: one there already: selected ' .. P.text(near) .. '.'
  end
  local g = P.groupAt(x, z)
  P.seq = (P.seq or 0) + 1
  local e = { n = P.seq, g = g, x = x, z = z, x0 = x, z0 = z, state = 'added', removed = true }
  P.list[#P.list + 1] = e
  remember('add', { e })
  e.removed = nil
  P.sel = e
  changed()
  api.log('padeyes: added ' .. P.text(e))
  return 'padeyes: added ' .. P.text(e) .. '.'
end

-- the padeyes a move takes: 'one' the selected, 'group' all of its group, 'all'
function P.scopeOf(scope)
  local e = P.sel
  if scope == 'all' then
    local out = {}
    for _, q in ipairs(P.load()) do if not q.removed then out[#out + 1] = q end end
    return out
  end
  if not e or e.removed then return nil end
  if scope == 'group' then
    local out = {}
    for _, q in ipairs(P.list) do if not q.removed and q.g == e.g then out[#out + 1] = q end end
    return out
  end
  return { e }
end

-- moved along the ship's axes: dx metres forward, dz to starboard
function P.move(dx, dz, scope)
  local list = P.scopeOf(scope)
  if not list then return nil, 'padeyes: nothing selected: click a dot first.' end
  remember('move', list)
  for _, e in ipairs(list) do e.x, e.z = e.x + dx, e.z + dz end
  changed()
  local what = (scope == 'all') and string.format('all %d padeyes', #list)
    or (scope == 'group' and string.format('the %d padeyes of %s', #list, groupName(P.sel.g)))
    or nil
  if what then
    api.log(string.format('padeyes: %s moved %s m forward, %s to starboard', what, m2(dx), m2(dz)))
    return string.format('padeyes: %s moved %s m forward, %s to starboard.', what, m2(dx), m2(dz))
  end
  return 'padeyes: ' .. P.text(P.sel) .. '.'
end

function P.remove()
  local e = P.sel
  if not e or e.removed then return nil, 'padeyes: nothing selected: click a dot first.' end
  remember('remove', { e })
  e.removed = true
  P.sel = nil
  changed()
  api.log('padeyes: removed ' .. P.text(e))
  return 'padeyes: removed ' .. P.text(e) .. '.'
end

function P.confirm()
  local e = P.sel
  if not e or e.removed then return nil, 'padeyes: nothing selected: click a dot first.' end
  if e.state == 'confirmed' or e.state == 'added' then return nil, 'padeyes: ' .. P.text(e) .. ': already.' end
  remember('confirm', { e })
  e.state = 'confirmed'
  changed()
  return 'padeyes: confirmed ' .. P.text(e) .. '.'
end

function P.undo()
  local u = table.remove(P.undoList)
  if not u then return nil, 'padeyes: nothing to undo.' end
  for _, s in ipairs(u.snap) do s.e.x, s.e.z, s.e.state, s.e.removed = s.x, s.z, s.state, s.removed end
  P.sel = u.sel
  if P.sel and P.sel.removed then P.sel = nil end
  changed()
  return 'padeyes: undone (' .. u.what .. ').'
end

-- none at all (the user, 2026-11-24: "Can I not just start with no padeyes placed and just click on the deck where I
-- want to add one?"): every padeye removed, as one change (Undo brings them all back); the file written at once
function P.clearAll()
  local list = {}
  for _, e in ipairs(P.load()) do if not e.removed then list[#list + 1] = e end end
  if #list == 0 then return nil, 'padeyes: there are none.' end
  remember('clear all', list)
  for _, e in ipairs(list) do e.removed = true end
  P.sel = nil
  P.save()
  api.log('padeyes: all ' .. #list .. ' cleared')
  return string.format('padeyes: all %d cleared ("Click adds": click the deck where each one is).', #list)
end

-- back to the drawing's padeyes (the user's file written over at once)
function P.startOver()
  local list, why = P.builtIn()
  if #list == 0 then return nil, 'padeyes: ' .. tostring(why) end
  P.list, P.sel, P.undoList = list, nil, {}
  P.seq = 0
  for _, e in ipairs(P.list) do P.seq = math.max(P.seq, e.n) end
  P.save()
  api.log('padeyes: started over from the drawing: ' .. #P.list)
  return string.format('padeyes: back to the drawing\'s %d padeyes.', #P.list)
end

-- a mission ends: what is not written yet is written; the selection and the undo go
function P.reset()
  if P.list then P.flush() end
  P.sel, P.undoList, P.drawn = nil, {}, nil
end

return P
