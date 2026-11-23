-- CATCC crew test: the in-game panel (TEST ONLY). Loaded by crewtest_hook.lua in DCS's GUI Lua state, where
-- DCS's own window toolkit (dxgui: the one the mission editor, the options and mods such as Scratchpad use) is
-- at hand. Asked for by the user (2026-11-16): the F10 radio menu is cumbersome; "go into F11 view, move the
-- camera to where I can see the aircraft, open the interface, select the deck spotting tool, position the cursor
-- over an aircraft, click to select it, then use the nudge controls to translate and rotate it".
--
--   Ctrl+Shift+F10   shows / hides the panel (once a mission runs). So does F10 > "CATCC panel: show / hide" (the
--                    radio menu's own top level).
--   THE MOUSE: LAlt+C, while the panel is shown: to the panel (a cursor: click aircraft and buttons) or back to the
--   camera (look around). What DCS did with each way:
--   1. The panel took the mouse whenever it was shown (a window that "has a cursor" keeps DCS's cursor up, and with
--      it up the mouse no longer turns the camera): the user, 2026-11-16: "I can no longer use the mouse to look around".
--   2. A key of its own for it, Ctrl+Shift+M, and a "Look" button: the user, 2026-11-18: "get rid of the Ctrl Shift M
--      shortcut and just let me use the built in Alt C function to take control of the mouse cursor".
--   3. The panel never took the cursor, DCS's own LAlt+C to give one: the user, the same day: "I can't interact with
--      the UI after bringing it up with either the keyboard shortcut or radio menu and pressing Alt C": a window that
--      does not "have a cursor" is not given the mouse, whatever DCS's own cursor does.
--   4. Now: the panel listens for LAlt+C itself (a hot key of its window, as Ctrl+Shift+F10 is; DCS's own windows use
--      such: 'Alt+y') and takes the cursor or gives it back; only while it is shown. Shown from the F10 radio menu it
--      has the mouse at once. Put away, it gives the mouse back. NOT SEEN IN DCS YET: that the window is told of
--      LAlt+C when DCS has a command of its own on that key.
-- The panel is put away when the mission ends (the first build left it on the screen).
--   Deck spots       the spotting tool: park / take away, CLICK AN AIRCRAFT IN THE WORLD to lock on it (a yellow mark
--                    follows the locked one), move and turn it by the chosen step, add / remove, save.
--   Tow              (2026-11-17) the aircraft clicked on is towed: to a catapult, or to a deck spot chosen by its
--                    area. The tractor comes, hooks up, tows it there, unhooks and drives home (the hook's Tow part,
--                    its commands "tow|cat|N|lock" and "tow|spot|n|lock").
--   Hangar marks     (2026-11-18) a CROSSHAIR at the screen's centre, while this page is the one open (and on after
--                    "Hide": the key Ctrl+Shift+F10 brings the panel back): aim it at a surface the hangar's map
--                    should have, and record the point (the hook's Tow.Marks, which says how):
--                      Ctrl+Shift+Z  a floor point: where the line of sight meets the floor (aim at a wall's foot);
--                      Ctrl+Shift+X  a two-angle shot: the same point from two places, the second gives it;
--                    and buttons for both, for dropping a first shot, for taking away the last point. Each point
--                    is drawn as a cyan plate where it is, and saved at once (Logs\catcc-hangar-marks.lua).
--   Crew test menu   everything the F10 menu has, as buttons: the same tree (asked from the mission script), the
--                    panel staying where it is after a click.
--   Ctrl+Shift+S     saves the deck spots (they are also saved at every change).
--   Ctrl+Shift+F9    THE DECK SPOTTING DEMO (the hook's crewtest_demo.lua): starts it; pressed again, stops it and
--                    takes everything away. Works with the panel put away. (Also two buttons on the Tow page, and
--                    F10 > "CATCC demo: spot the deck: start / stop".)
--
-- The click: the mouse position, the camera (Export.LoGetCameraPosition), the field of view (DCS.getCurrentFOV)
-- and the screen's size give a line of sight; the aircraft nearest that line is locked on. Whether DCS's field of
-- view is the horizontal or the vertical one is not written anywhere: taken as horizontal, and "FOV: H / V" on
-- the panel switches it (the yellow mark sits on the locked aircraft when it is right).
--
-- SHOWN AND PUT AWAY: what DCS did with each way (the log and the user, 2026-11-16 / 17):
--   1. The first build: the window made visible once, for good; put away = a see-through skin, shrunk to 10 x 10, its
--      buttons not visible; shown = its own skin and size again. Built so, it was not to be seen; its hot key showed
--      it, and it worked (the whole deck was spotted with it). Its "Hide" button, which did the putting away inside the
--      button's own click, left it on the screen, dead.
--   2. The second: put away = window:setVisible(false), shown = setVisible(true), the hot keys on a second, one-pixel
--      window. NEVER SEEN AGAIN: every show was logged ("panel: shown") and nothing came up, by the key or by the F10
--      menu; and on the one-pixel window DCS called a hot key's function several times a press. (The SRS mod's overlay
--      says of the same toolkit: "if you make the window invisible, its destroyed".)
--   3. Now: the first build's way again (the window is NEVER made invisible; the hot keys are on it), and NOTHING is done
--      to the window or its buttons inside a key's or a button's own call: a call only notes what is wanted, and the
--      next frame (tick) does it, as the building did. Every change is logged with what the window then says of itself.
--
-- api (from the hook): run(cmd) a command as the F10 menu gives it; log(text); deck (the hook's Tow.Deck);
-- ctx(t) where the deck tool's carrier (the one the camera is at) is this frame; dostring(code) in the mission's Lua
-- state; split(s); writedir; now(); towSpots() the deck spots by area ("label::n=name,n=name;;label::...").
-- Returns the panel's table (tick(t), said(text), toggle(), reset()), or nil and why.
local api = ...
local ok, T = pcall(function()
  return { dxgui = require('dxgui'), DialogLoader = require('DialogLoader'), Button = require('Button'), Static = require('Static'), Skin = require('Skin') }
end)
if not ok then return nil, 'no window toolkit here (' .. tostring(T) .. ')' end

local UI = { visible = false, mouse = false, live = false, page = 'deck', step = '0.1', turn = '1', pick = true, fovH = true, dead = false, msg = '', path = {}, towGroup = 1,
  pages = { deck = {}, tow = {}, menu = {}, marks = {} } }
local L = { w = 620, h = 620, x = 8, bh = 26, gap = 4, top = 30, x0 = 60, y0 = 120 } -- (wide enough for the F10 menu's longest items in one column)
local STEPS = { { '1 m', '1' }, { '10 cm', '0.1' }, { '1 cm', '0.01' } }
local TURNS = { { '5 deg', '5' }, { '1 deg', '1' }, { '0.1 deg', '0.1' } }
local SLOTS = 10 -- the menu page's buttons, one column (an F10 menu holds ten items on a level); the tow page's spots
local GROUPS = 6 -- the tow page's deck areas: two rows of three
local KEY_QUIET = 0.6 -- seconds a hot key must have been quiet for a press of it to count (see build)
UI.keyAt = {}

local function guard(what, fn, ...)
  local okc, err = pcall(fn, ...)
  if not okc then api.log('panel: ' .. what .. ': ' .. tostring(err)) end
  return okc
end

local function button(page, text, x, y, w, fn)
  local b = T.Button.new(text)
  b:setSkin(UI.btnSkin)
  b:setBounds(x, y, w, L.bh)
  b:addMouseUpCallback(function() guard('button "' .. tostring(text) .. '"', fn) end)
  UI.window:insertWidget(b)
  if page then table.insert(UI.pages[page], b) end
  return b
end

local function label(page, text, x, y, w, h)
  local s = T.Static.new(text)
  s:setSkin(UI.lblSkin)
  s:setBounds(x, y, w, h or L.bh)
  pcall(function() s:setWrapping(true) end)
  UI.window:insertWidget(s)
  if page then table.insert(UI.pages[page], s) end
  return s
end

-- a text put on a button or a label only when it changes
local function setText(wd, txt)
  if wd.catccText ~= txt then
    wd.catccText = txt
    wd:setText(txt)
  end
end

-- a button or a label shown or not, told to DCS only when it changes (every frame, for every button of a page, it
-- was a redraw of the window every frame)
local function setShown(wd, v)
  v = v and true or false
  if wd.catccShown ~= v then
    wd.catccShown = v
    wd:setVisible(v)
  end
end

-- ---- the deck page
local function deckStatus()
  local D = api.deck
  local e = D.list and D.lock and D.list[D.lock]
  if not (D.list and D.shown) then return 'No aircraft parked: put the camera over the carrier, then "Park Hornets" (the deck and the hangar).' end
  if not e then return 'On ' .. tostring(D.ship) .. '. Nothing locked: click an aircraft (or Next). The camera in the hangar: the hangar\'s.' end
  return 'On ' .. tostring(D.ship) .. '. Locked: ' .. D.text(e)
end

local function refreshDeck()
  if not UI.window then return end
  setText(UI.status, deckStatus())
  for _, s in ipairs(UI.stepBtns) do setText(s.b, s.v == UI.step and ('[' .. s.t .. ']') or s.t) end
  for _, s in ipairs(UI.turnBtns) do setText(s.b, s.v == UI.turn and ('[' .. s.t .. ']') or s.t) end
  setText(UI.pickBtn, UI.pick and 'Click picks: ON' or 'Click picks: off')
  setText(UI.fovBtn, UI.fovH and 'FOV: H' or 'FOV: V')
end

local function buildDeck()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x                    -- the width to fill
  local w3 = math.floor((W - 2 * L.gap) / 3) -- a third
  local w2 = math.floor((W - L.gap) / 2)     -- a half
  local ws = math.floor((W - 74 - 2 * L.gap) / 3) -- a step button, beside its label
  local function row() y = y + L.bh + L.gap end
  local function third(i) return x + (i - 1) * (w3 + L.gap) end
  button('deck', 'Park Hornets', third(1), y, w3, function() api.run('spot|spawn') end)
  button('deck', 'Take away', third(2), y, w3, function() api.run('spot|clear') end)
  button('deck', 'Wings', third(3), y, w3, function() api.run('spot|fold') end)
  row()
  UI.status = label('deck', '', x, y, W, 2 * L.bh)
  y = y + 2 * L.bh + L.gap
  UI.pickBtn = button('deck', '', third(1), y, w3, function() UI.pick = not UI.pick end)
  button('deck', 'Previous', third(2), y, w3, function() api.run('spot|next|-1') end)
  button('deck', 'Next', third(3), y, w3, function() api.run('spot|next|1') end)
  row()
  -- the step, and the moves along the aircraft's own nose and wings
  label('deck', 'Move by', x, y, 70)
  UI.stepBtns = {}
  for i, s in ipairs(STEPS) do
    local b = button('deck', s[1], x + 74 + (i - 1) * (ws + L.gap), y, ws, function() UI.step = s[2] end)
    UI.stepBtns[i] = { b = b, t = s[1], v = s[2] }
  end
  row()
  button('deck', 'Forward', third(2), y, w3, function() api.run('spot|move|fwd|' .. UI.step) end)
  row()
  button('deck', 'Left', third(1), y, w3, function() api.run('spot|move|right|-' .. UI.step) end)
  button('deck', 'Aft', third(2), y, w3, function() api.run('spot|move|fwd|-' .. UI.step) end)
  button('deck', 'Right', third(3), y, w3, function() api.run('spot|move|right|' .. UI.step) end)
  row()
  label('deck', 'Turn by', x, y, 70)
  UI.turnBtns = {}
  for i, s in ipairs(TURNS) do
    local b = button('deck', s[1], x + 74 + (i - 1) * (ws + L.gap), y, ws, function() UI.turn = s[2] end)
    UI.turnBtns[i] = { b = b, t = s[1], v = s[2] }
  end
  row()
  button('deck', 'Turn left', x, y, w2, function() api.run('spot|turn|-' .. UI.turn) end)
  button('deck', 'Turn right', x + w2 + L.gap, y, w2, function() api.run('spot|turn|' .. UI.turn) end)
  row()
  button('deck', 'Add where I look', third(1), y, w3, function() api.run('spot|add') end)
  button('deck', 'Remove', third(2), y, w3, function() api.run('spot|remove') end)
  button('deck', 'Back to built-in', third(3), y, w3, function() api.run('spot|undo') end)
  row()
  button('deck', 'Save (Ctrl+Shift+S)', third(1), y, w3, function() api.run('spot|report') end)
  button('deck', 'Start over', third(2), y, w3, function() api.run('spot|reset') end)
  UI.fovBtn = button('deck', '', third(3), y, w3, function() UI.fovH = not UI.fovH end)
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- ---- the tow page: the aircraft clicked on (the deck tool's lock) is towed to a catapult or to a deck spot
-- the deck spots by area, from the hook: { { label = 'Stbd bow, Port bow, Crotch', items = { { n = 5, name = 'Stbd bow 1' }, .. } }, .. }
local function towGroups()
  local out = {}
  local okg, s = pcall(api.towSpots)
  if not (okg and type(s) == 'string') then return out end
  for grp in (s .. ';;'):gmatch('(.-);;') do
    local lbl, list = grp:match('^(.-)::(.*)$')
    if lbl then
      local items = {}
      for n, name in list:gmatch('(%d+)=([^,]+)') do items[#items + 1] = { n = tonumber(n), name = name } end
      if #items > 0 then out[#out + 1] = { label = lbl, items = items } end
    end
  end
  return out
end

local function towStatus()
  local D = api.deck
  local e = D.list and D.lock and D.list[D.lock]
  if not (D.list and D.shown) then return 'No aircraft parked: "Deck spots" > "Park Hornets" first (the camera over the carrier).' end
  if not e then return 'On ' .. tostring(D.ship) .. '. Nothing selected: click an aircraft on the deck (LAlt+C gives the panel the mouse).' end
  return 'Selected: ' .. D.label(e) .. '. Choose where the tractor takes it. (Your own jet: Crew test menu > Tow.)'
end

local function refreshTow()
  if not UI.window then return end
  if not UI.towGroups or #UI.towGroups == 0 then UI.towGroups = towGroups() end
  local D = api.deck
  local e = D.list and D.shown and D.lock and D.list[D.lock] or nil
  setText(UI.towStatus, towStatus())
  if UI.viewBtn then setText(UI.viewBtn, (api.view and api.view.on) and '[Saved view]' or 'Saved view') end
  for _, hb in ipairs(UI.hideBtns or {}) do
    local Hd = api.hide
    local on = Hd and ((hb.k == 'cycle' and Hd.cycle) or (hb.k ~= 'cycle' and Hd.on and Hd.on[hb.k]))
    setText(hb.b, on and ('[' .. hb.text .. ']') or hb.text)
  end
  if UI.towGroup > #UI.towGroups then UI.towGroup = 1 end
  for i = 1, GROUPS do
    local g = UI.towGroups[i]
    local b = UI.towGroupBtns[i]
    if g then setText(b, i == UI.towGroup and ('[' .. g.label .. ']') or g.label) end
    setShown(b, UI.page == 'tow' and g ~= nil)
  end
  local g = UI.towGroups[UI.towGroup]
  -- (which spots are taken: looked up twice a second, or when the area or the selected aircraft changes)
  local tnow = api.now()
  local fresh = not UI.takenAt or tnow - UI.takenAt > 0.5 or UI.takenG ~= UI.towGroup or UI.takenE ~= e
  if fresh then UI.takenAt, UI.takenG, UI.takenE, UI.taken = tnow, UI.towGroup, e, {} end
  for i = 1, SLOTS do
    local it = g and g.items[i]
    local b = UI.towSpotBtns[i]
    if it then
      if fresh then UI.taken[i] = (D.taken and D.taken(it.n, e)) and true or false end
      setText(b, UI.taken[i] and (it.name .. '  - taken') or it.name)
    end
    setShown(b, UI.page == 'tow' and it ~= nil)
  end
end

local function buildTow()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x
  local w3 = math.floor((W - 2 * L.gap) / 3)
  local w2 = math.floor((W - L.gap) / 2)
  local function row() y = y + L.bh + L.gap end
  UI.towStatus = label('tow', '', x, y, W, 2 * L.bh)
  y = y + 2 * L.bh + L.gap
  label('tow', 'To a catapult', x, y, 110)
  local wc = math.floor((W - 114 - 3 * L.gap) / 4)
  for k = 1, 4 do
    button('tow', 'Cat ' .. k, x + 114 + (k - 1) * (wc + L.gap), y, wc, function() api.run('tow|cat|' .. k .. '|lock') end)
  end
  row()
  label('tow', 'To a deck spot: its area, then the spot', x, y, W)
  row()
  UI.towGroupBtns = {}
  for i = 1, GROUPS do
    local col, rw = (i - 1) % 3, math.floor((i - 1) / 3)
    UI.towGroupBtns[i] = button('tow', '', x + col * (w3 + L.gap), y + rw * (L.bh + L.gap), w3, function() UI.towGroup = i end)
  end
  y = y + 2 * (L.bh + L.gap)
  UI.towSpotBtns = {}
  for i = 1, SLOTS do
    local col, rw = (i - 1) % 2, math.floor((i - 1) / 2)
    UI.towSpotBtns[i] = button('tow', '', x + col * (w2 + L.gap), y + rw * (L.bh + L.gap), w2, function()
      local g = UI.towGroups and UI.towGroups[UI.towGroup]
      local it = g and g.items[i]
      if it then api.run('tow|spot|' .. it.n .. '|lock') end
    end)
  end
  y = y + 5 * (L.bh + L.gap)
  button('tow', 'Hold / go on', x, y, w3, function() api.run('tow|pause') end)
  button('tow', 'Unhook now', x + w3 + L.gap, y, w3, function() api.run('tow|unhook') end)
  button('tow', 'Report', x + 2 * (w3 + L.gap), y, w3, function() api.run('tow|report') end)
  row()
  -- the deck spotting demo (the hook's crewtest_demo.lua); started from the frame loop, as the hot key's
  button('tow', 'Deck spotting demo: start / stop', x, y, w2, function() UI.wantDemo = 'demo2|toggle' end)
  button('tow', 'Demo: report', x + w2 + L.gap, y, w2, function() UI.wantDemo = 'demo2|report' end)
  row()
  -- the camera: where it is now kept for later (in the ship's frame); held there while "Saved view" is on
  button('tow', 'Save view', x, y, w3, function() api.run('view|save') end)
  UI.viewBtn = button('tow', 'Saved view', x + w3 + L.gap, y, w3, function() api.run('view|hold') end)
  -- (the slot picker, for a look in any mission: crewtest_slots.lua; in multiplayer it comes up by itself)
  button('tow', 'Slot picker', x + 2 * (w3 + L.gap), y, w3, function() api.run('slots|show') end)
  row()
  -- what of the demo is drawn (the hook's Tow.Hide): each kind on or off, or each in turn; from the frame loop, as
  -- the demo's own buttons
  UI.hideBtns = {}
  for i, q in ipairs({ { 'drivers', 'Hide drivers' }, { 'bars', 'Hide tow bars' }, { 'tractors', 'Hide tractors' },
    { 'hangar', 'Hide hangar aircraft' }, { 'deck', 'Hide deck aircraft' }, { 'cycle', 'Hide each in turn' } }) do
    if i == 4 then row() end
    local k = q[1]
    UI.hideBtns[i] = { k = k, text = q[2], b = button('tow', q[2], x + ((i - 1) % 3) * (w3 + L.gap), y, w3, function() UI.wantDemo = 'demo2|hide|' .. k end) }
  end
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- ---- the hangar marks page
local camera -- (below)

local function marksStatus()
  local M = api.marks
  if not M then return 'The hook has no hangar marks (an older one: run crew-test\\install.ps1 with DCS closed).' end
  local list = M.load()
  local last = list[#list]
  return string.format('%d point(s) recorded.%s%s', #list, M.pending and ' A first shot is waiting for its second (Ctrl+Shift+X from another place).' or '',
    last and ('\nLast: ' .. M.text(last)) or '\nAim the dot at the foot of a wall (Ctrl+Shift+Z), or at any point from two places (Ctrl+Shift+X twice).')
end

local function refreshMarks()
  if not UI.window then return end
  setText(UI.marksStatus, marksStatus())
end

-- a point aimed at with the crosshair: kind 'floor' or 'shot' (from a key or a button, done at the next frame: tick)
local function aim(kind)
  local M = api.marks
  if not M then return end
  local ctx = api.ctx(api.now())
  local c = camera(ctx)
  if not c then
    UI.msg = 'hangar marks: the camera cannot be read here.'
    return
  end
  local msg, why
  if kind == 'floor' then msg, why = M.floor(c.o, c.f, ctx.ship) else msg, why = M.shot(c.o, c.f, ctx.ship) end
  UI.msg = msg or why
  api.deck.say(UI.msg)
end

local function buildMarks()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x
  local w2 = math.floor((W - L.gap) / 2)
  local function row() y = y + L.bh + L.gap end
  UI.marksStatus = label('marks', '', x, y, W, 3 * L.bh)
  y = y + 3 * L.bh + L.gap
  button('marks', 'Floor point (Ctrl+Shift+Z)', x, y, w2, function() UI.wantAim = 'floor' end)
  button('marks', 'Two-angle shot (Ctrl+Shift+X)', x + w2 + L.gap, y, w2, function() UI.wantAim = 'shot' end)
  row()
  button('marks', 'Drop the first shot', x, y, w2, function() UI.wantMarks = 'cancel' end)
  button('marks', 'Remove the last point', x + w2 + L.gap, y, w2, function() UI.wantMarks = 'undo' end)
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- ---- the menu page: the F10 menu's own tree, asked from the mission script once a mission
local function loadTree()
  local okd, r = pcall(api.dostring, 'return (CATCC_CR and CATCC_CR.tree) and CATCC_CR.tree() or ""')
  if not (okd and type(r) == 'string' and r ~= '') then return nil end
  local root = { label = 'Crew test menu', items = {} }
  local stack = { root }
  for line in (r .. ';;'):gmatch('(.-);;') do
    local depth, lbl, cmd = line:match('^(%d+)::(.-)::(.*)$')
    depth = tonumber(depth)
    if depth then
      local node = { label = lbl, cmd = cmd ~= '' and cmd or nil, items = cmd == '' and {} or nil }
      while #stack > depth + 1 do table.remove(stack) end
      table.insert(stack[#stack].items, node)
      if node.items then stack[#stack + 1] = node end
    end
  end
  return root
end

local function menuNode()
  local n = UI.tree
  for _, i in ipairs(UI.path) do n = n and n.items and n.items[i] end
  return n
end

local function refreshMenu()
  if not UI.window then return end
  if not UI.tree then UI.tree = loadTree() end
  local n = menuNode()
  local names = {}
  local at = UI.tree
  for _, i in ipairs(UI.path) do
    at = at and at.items and at.items[i]
    names[#names + 1] = at and at.label or '?'
  end
  setText(UI.menuPath, UI.tree and (#names > 0 and table.concat(names, ' > ') or 'Crew test menu') or 'The menu is not there yet (no mission running?).')
  setShown(UI.backBtn, UI.page == 'menu' and #UI.path > 0)
  for i = 1, SLOTS do
    local it = n and n.items and n.items[i]
    local b = UI.slots[i]
    if it then setText(b, it.items and (it.label .. '  >') or it.label) end
    setShown(b, UI.page == 'menu' and it ~= nil)
  end
end

local function buildMenu()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  UI.backBtn = button('menu', '< Back', x, y, 80, function() table.remove(UI.path) end)
  UI.menuPath = label('menu', '', x + 86, y, L.w - 2 * L.x - 86)
  y = y + L.bh + L.gap
  UI.slots = {}
  for i = 1, SLOTS do
    UI.slots[i] = button('menu', '', x, y + (i - 1) * (L.bh + L.gap), L.w - 2 * L.x, function()
      local n = menuNode()
      local it = n and n.items and n.items[i]
      if not it then return end
      if it.items then UI.path[#UI.path + 1] = i else api.run(it.cmd) end
    end)
  end
end

-- ---- the panel as a whole
local function refreshPage()
  if UI.page == 'deck' then refreshDeck() elseif UI.page == 'tow' then refreshTow() elseif UI.page == 'marks' then refreshMarks() else refreshMenu() end
end

local function refresh()
  if not UI.window then return end
  for name, list in pairs(UI.pages) do
    for _, wd in ipairs(list) do setShown(wd, UI.visible and UI.page == name) end
  end
  for _, wd in ipairs(UI.always) do setShown(wd, UI.visible) end
  if UI.visible then
    setText(UI.tabDeck, UI.page == 'deck' and '[Deck spots]' or 'Deck spots')
    setText(UI.tabTow, UI.page == 'tow' and '[Tow]' or 'Tow')
    setText(UI.tabMenu, UI.page == 'menu' and '[Crew test menu]' or 'Crew test menu')
    setText(UI.tabMarks, UI.page == 'marks' and '[Hangar marks]' or 'Hangar marks')
    refreshPage()
  end
end

-- the mark: a window of its own, always there; with nothing to mark it is one pixel in the screen's corner
local function markAt(sx, sy)
  if not UI.mark then return end
  local on = sx ~= nil
  if on then
    UI.mark:setBounds(math.floor(sx - 8 + 0.5), math.floor(sy - 8 + 0.5), 16, 16)
  elseif UI.markOn ~= false then
    UI.mark:setBounds(0, 0, 1, 1)
  end
  UI.markOn = on
end

-- what the window says of itself, for the log
local function windowSays()
  local vis, bx, by, bw, bh = '?', '?', '?', '?', '?'
  pcall(function() vis = tostring(UI.window:getVisible()) end)
  pcall(function() bx, by, bw, bh = UI.window:getBounds() end)
  return string.format('the window says: visible %s, at %s / %s, %s x %s', vis, tostring(bx), tostring(by), tostring(bw), tostring(bh))
end

local function title()
  return UI.mouse and 'CATCC crew test - mouse: PANEL (LAlt+C: look around)' or 'CATCC crew test - mouse: camera (LAlt+C: cursor)'
end

-- Shown or put away, DONE (from tick, the building and the mission's end only: never from inside a key's or a
-- button's own call). Put away: the see-through skin, 10 x 10 where it stood, nothing in it visible, no cursor: the
-- window itself stays "visible" for good (see the top of this file).
local function apply(v)
  if not UI.window then return end
  if v then
    UI.window:setSkin(UI.winSkin)
    local b = UI.bounds or { L.x0, L.y0 }
    UI.window:setBounds(b[1], b[2], L.w, L.h)
    UI.window:setHasCursor(UI.mouse)
    UI.window:setText(title())
  else
    if UI.visible then
      local bx, by = UI.window:getBounds()
      UI.bounds = { bx or L.x0, by or L.y0 }
    end
    UI.mouse = false
    UI.window:setSkin(UI.hiddenSkin)
    local b = UI.bounds or { L.x0, L.y0 }
    UI.window:setBounds(b[1], b[2], 10, 10)
    UI.window:setHasCursor(false)
    markAt(nil)
  end
  UI.visible = v
  UI.pageShown = UI.page
  refresh()
  api.log('panel: ' .. (v and 'shown' or 'hidden') .. ' (' .. windowSays() .. ')')
end

-- the mouse to the panel (DCS's cursor kept up) or back to the camera: done (from tick)
local function mouse(v)
  if not (UI.window and UI.visible) or v == UI.mouse then return end
  UI.mouse = v
  UI.window:setHasCursor(v)
  UI.window:setText(title())
  api.log('panel: the mouse ' .. (v and 'to the panel (cursor)' or 'back to the camera'))
end

-- the camera this instant, in the SHIP's own frame: its place, its forward / up / right, and how far half the
-- screen's width and height reach at a distance of 1 (the tangents)
camera = function(ctx)
  if not (Export and Export.LoGetCameraPosition and ctx) then return nil end
  local okc, cp = pcall(Export.LoGetCameraPosition)
  if not (okc and type(cp) == 'table' and cp.p and cp.x and cp.y and cp.z) then return nil end
  local s = ctx.s
  local function dir(v) return { v.x * s[1] + v.y * s[2] + v.z * s[3], v.x * s[4] + v.y * s[5] + v.z * s[6], v.x * s[7] + v.y * s[8] + v.z * s[9] } end
  local o = dir({ x = cp.p.x - s[10], y = cp.p.y - s[11], z = cp.p.z - s[12] })
  local sw, sh = T.dxgui.GetScreenSize()
  local fov = 78
  if DCS and DCS.getCurrentFOV then
    local okf, f = pcall(DCS.getCurrentFOV)
    if okf and type(f) == 'number' and f > 1 and f < 179 then fov = f end
  end
  local th = math.tan(math.rad(fov) / 2)
  local tanH, tanV = th, th * sh / sw
  if not UI.fovH then tanV, tanH = th, th * sw / sh end
  return { o = o, f = dir(cp.x), u = dir(cp.y), r = dir(cp.z), sw = sw, sh = sh, tanH = tanH, tanV = tanV, fov = fov }
end

-- a click in the world: the aircraft nearest the line of sight through that point of the screen is locked on (the
-- deck page, with "Click picks" on; the tow page, always)
local function onMouseDown(x, y)
  if not (UI.window and UI.visible and ((UI.page == 'deck' and UI.pick) or UI.page == 'tow')) then return end
  local D = api.deck
  if not (D.list and D.shown) then return end
  local bx, by, bw, bh = UI.window:getBounds()
  if bx and x >= bx and x <= bx + bw and y >= by and y <= by + bh then return end -- (a click on the panel itself)
  local ctx = api.ctx(api.now())
  local c = camera(ctx)
  if not c then return api.log('panel: click at ' .. tostring(x) .. ', ' .. tostring(y) .. ': the camera cannot be read') end
  local nx, ny = (2 * x / c.sw - 1) * c.tanH, (1 - 2 * y / c.sh) * c.tanV
  local d = { c.f[1] + c.r[1] * nx + c.u[1] * ny, c.f[2] + c.r[2] * nx + c.u[2] * ny, c.f[3] + c.r[3] * nx + c.u[3] * ny }
  D.pick(c.o, d, ctx, string.format('a click at %d, %d of %d x %d, field of view %.1f (%s)', x, y, c.sw, c.sh, c.fov, UI.fovH and 'horizontal' or 'vertical'))
end

local function build()
  local dir = api.writedir .. 'Scripts\\CATCC\\'
  UI.window = T.DialogLoader.spawnDialogFromFile(dir .. 'crewtest_ui.dlg')
  UI.winSkin = UI.window:getSkin()
  UI.hiddenSkin = T.Skin.windowSkinChatMin()
  UI.btnSkin = UI.window.tplButton:getSkin()
  UI.lblSkin = UI.window.tplLabel:getSkin()
  UI.window.tplButton:setVisible(false)
  UI.window.tplLabel:setVisible(false)
  UI.always = {}
  -- (a key or a button only notes what is wanted: UI.want, UI.wantMouse, UI.page; tick does it)
  UI.tabDeck = button(nil, 'Deck spots', L.x, L.top, 130, function() UI.page = 'deck' end)
  UI.tabTow = button(nil, 'Tow', L.x + 134, L.top, 90, function() UI.page = 'tow' end)
  UI.tabMenu = button(nil, 'Crew test menu', L.x + 228, L.top, 160, function() UI.page = 'menu' end)
  UI.tabMarks = button(nil, 'Hangar marks', L.x + 392, L.top, 132, function() UI.page = 'marks' end)
  local hide = button(nil, 'Hide', L.w - L.x - 80, L.top, 80, function() UI.want = false end)
  UI.always = { UI.tabDeck, UI.tabTow, UI.tabMenu, UI.tabMarks, hide }
  buildDeck()
  buildTow()
  buildMenu()
  buildMarks()
  UI.msgLabel = label(nil, '', L.x, UI.msgY, L.w - 2 * L.x, L.h - UI.msgY - 30)
  UI.always[#UI.always + 1] = UI.msgLabel
  -- the mark on the locked aircraft: a small window of its own, which lets clicks through
  guard('the mark', function()
    UI.mark = T.DialogLoader.spawnDialogFromFile(dir .. 'crewtest_ui_mark.dlg')
    pcall(function() UI.mark:setTransparentForUserInput(true) end)
    UI.mark:setVisible(true)
    markAt(nil)
  end)
  -- THE CROSSHAIR (the hangar marks page): the same kind of window, 6 x 6 at the screen's centre while that page is
  -- open, else one pixel in the corner
  guard('the crosshair', function()
    UI.cross = T.DialogLoader.spawnDialogFromFile(dir .. 'crewtest_ui_mark.dlg')
    pcall(function() UI.cross:setTransparentForUserInput(true) end)
    UI.cross:setVisible(true)
    UI.cross:setBounds(0, 0, 1, 1)
  end)
  -- THE HOT KEYS, on the panel's own window (which is always "visible": a dxgui window answers its hot keys only
  -- then). ONE PRESS, ONE ACTION: DCS may call a hot key's function more than once for one press (seen on the second
  -- build's one-pixel key window: "panel: shown" and "panel: hidden" in the same second, five in a second with the key
  -- held): a call counts only when that key has been quiet for KEY_QUIET seconds, and every call, counted or not,
  -- starts the quiet again (so a held key acts once). Outside a mission (the window is still there) they do nothing.
  local function once(name, fn)
    return function()
      local t = api.now()
      local last = UI.keyAt[name]
      UI.keyAt[name] = t
      if last and t - last < KEY_QUIET then
        UI.keyDropped = (UI.keyDropped or 0) + 1
        return
      end
      if not UI.live then return end
      UI.keyN = (UI.keyN or 0) + 1
      guard(name, fn)
    end
  end
  UI.window:addHotKeyCallback('Ctrl+Shift+F10', once('the hot key', function()
    local now = UI.visible
    if UI.want ~= nil then now = UI.want end
    UI.want = not now
  end))
  -- LAlt+C, with the panel shown: the mouse to the panel, or back to the camera (see the top of this file)
  UI.window:addHotKeyCallback('Alt+c', once('the mouse key', function()
    if not UI.visible then return end
    local now = UI.mouse
    if UI.wantMouse ~= nil then now = UI.wantMouse end
    UI.wantMouse = not now
  end))
  -- (the hangar marks: while the crosshair is up)
  UI.window:addHotKeyCallback('Ctrl+Shift+z', once('the floor point key', function() if UI.crossOn then UI.wantAim = 'floor' end end))
  UI.window:addHotKeyCallback('Ctrl+Shift+x', once('the two-angle shot key', function() if UI.crossOn then UI.wantAim = 'shot' end end))
  UI.window:addHotKeyCallback('Ctrl+Shift+s', once('the save key', function() if UI.visible and UI.page == 'deck' then api.run('spot|report') end end))
  -- THE DECK SPOTTING DEMO (the user, 2026-11-17: "Give me a shortcut key I can press to start the demo"): starts it,
  -- or stops it if it runs; whether the panel is shown or not. Asked for here, done from the frame loop (tick).
  UI.window:addHotKeyCallback('Ctrl+Shift+F9', once('the demo key', function() UI.wantDemo = 'demo2|toggle' end))
  T.dxgui.AddMouseCallback('down', function(x, y) guard('a click', onMouseDown, x, y) end)
  -- made visible once, for good; it starts put away
  UI.window:setVisible(true)
  UI.visible = false
  apply(false)
  api.log('panel: built (Ctrl+Shift+F10 shows it; Ctrl+Shift+F9 starts / stops the deck spotting demo)')
end

-- every frame of a running mission (from the hook)
local function tick(t)
  if UI.dead then return end
  if not UI.window then
    if not guard('building it', build) then
      UI.dead = true
      api.log('panel: it could not be built: the F10 menu is all there is')
    end
    UI.live = true
    return
  end
  UI.live = true
  -- what a key, a button or the F10 menu asked for since the last frame
  if UI.want ~= nil then
    local v = UI.want
    UI.want = nil
    if v ~= UI.visible then apply(v) end
  end
  if UI.wantMouse ~= nil then
    local v = UI.wantMouse
    UI.wantMouse = nil
    mouse(v)
  end
  if UI.wantAim or UI.wantMarks then
    local a, m = UI.wantAim, UI.wantMarks
    UI.wantAim, UI.wantMarks = nil, nil
    if a then guard('a hangar mark', aim, a) end
    if m and api.marks then
      UI.msg = (m == 'undo') and api.marks.undo() or api.marks.cancel()
      api.deck.say(UI.msg)
    end
  end
  -- (the crosshair: up while the marks page is the one open, the panel shown or put away after it was opened)
  if UI.page == 'marks' and UI.visible then UI.marksOn = true elseif UI.visible then UI.marksOn = false end
  local crossOn = UI.marksOn and true or false
  if UI.cross and (crossOn ~= UI.crossOn or crossOn) then
    if crossOn then
      local sw, sh = T.dxgui.GetScreenSize()
      local cx, cy = math.floor(sw / 2 - 3 + 0.5), math.floor(sh / 2 - 3 + 0.5)
      if UI.crossAt ~= cx * 100000 + cy then
        UI.cross:setBounds(cx, cy, 6, 6)
        UI.crossAt = cx * 100000 + cy
      end
    elseif UI.crossOn then
      UI.cross:setBounds(0, 0, 1, 1)
      UI.crossAt = nil
    end
  end
  UI.crossOn = crossOn
  if crossOn and api.marks then
    local ctx = api.ctx(t)
    if ctx then pcall(api.marks.showAll, ctx.ship) end
  end
  if UI.wantDemo then
    local cmd = UI.wantDemo
    UI.wantDemo = nil
    api.log('panel: ' .. cmd .. ' (the demo key, or its button)')
    api.run(cmd)
  end
  if not UI.visible then return end
  -- the hook's last message: the panel's last line
  setText(UI.msgLabel, UI.msg)
  -- what a button did shows at once: the texts follow the state
  if UI.page ~= UI.pageShown then
    UI.pageShown = UI.page
    refresh()
  else
    refreshPage()
  end
  -- the mark follows the locked aircraft on the screen (where it stands NOW: one that was towed is not on its spot)
  if UI.mark then
    local D = api.deck
    local e = ((UI.page == 'deck' or UI.page == 'tow') and D.list and D.shown and D.lock) and D.list[D.lock] or nil
    local sx, sy
    if e and not e.removed then
      local ctx = api.ctx(t)
      local c = camera(ctx)
      if c then
        local ex, ez = e.x, e.z
        if D.pose then ex, ez = D.pose(e) end
        local v = { ex - c.o[1], (D.yOf and D.yOf(e) or D.jy) - c.o[2], ez - c.o[3] }
        local zf = v[1] * c.f[1] + v[2] * c.f[2] + v[3] * c.f[3]
        if zf > 1 then
          local px = c.sw / 2 * (1 + (v[1] * c.r[1] + v[2] * c.r[2] + v[3] * c.r[3]) / (zf * c.tanH))
          local py = c.sh / 2 * (1 - (v[1] * c.u[1] + v[2] * c.u[2] + v[3] * c.u[3]) / (zf * c.tanV))
          if px > 0 and px < c.sw and py > 0 and py < c.sh then sx, sy = px, py end
        end
      end
    end
    markAt(sx, sy)
  end
end

-- (whatever goes wrong in the panel stays in the panel: the hook's own frame goes on, and the panel is switched off)
function UI.tick(t)
  local okt, err = pcall(tick, t)
  if not okt and not UI.dead then
    UI.dead = true
    api.log('panel: switched off after an error: ' .. tostring(err))
    pcall(function() markAt(nil) end)
  end
end

-- shown / put away from outside (the F10 menu's "CATCC panel: show / hide", for when the hot key does not answer):
-- true or false as it will be at the next frame; or nil and why not. Shown this way it has the mouse at once (so
-- that it can be used even if its LAlt+C never reaches it).
function UI.toggle()
  if UI.dead then return nil, 'it was switched off after an error (the hook\'s log has it)' end
  if not UI.window then return nil, 'it is not built yet (a mission\'s first frames)' end
  local now = UI.visible
  if UI.want ~= nil then now = UI.want end
  UI.want = not now
  if UI.want then UI.wantMouse = true end
  return UI.want
end

-- a message of the hook's (also when on-screen messages are hidden): the panel's last line, from the next frame
function UI.said(text)
  UI.msg = tostring(text)
end

-- a mission starts or ends: the menu tree is asked for again; the panel and its mark are put away and its keys do
-- nothing (nothing of it shows or answers in DCS's menus) until a mission's first frame
function UI.reset()
  UI.tree, UI.path, UI.towGroups = nil, {}, nil
  UI.live, UI.want, UI.wantMouse, UI.wantDemo, UI.wantAim, UI.wantMarks, UI.marksOn = false, nil, nil, nil, nil, nil, nil
  if UI.cross then pcall(function() UI.cross:setBounds(0, 0, 1, 1) end) end
  UI.crossOn, UI.crossAt = false, nil
  if UI.window and not UI.dead then
    pcall(function()
      if UI.visible then apply(false) end
      markAt(nil)
    end)
  end
end

return UI
