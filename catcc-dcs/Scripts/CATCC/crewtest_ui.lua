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
--   4. The panel listens for LAlt+C itself (a hot key of its window, as Ctrl+Shift+F10 is; DCS's own windows use
--      such: 'Alt+y') and takes the cursor or gives it back; only while it is shown. Shown from the F10 radio menu it
--      had the mouse at once. Seen in DCS: the window is told of LAlt+C, AND DCS's own LAlt+C still toggles DCS's
--      cursor: two toggles, kept in step only if they start in step. Shown from the F10 menu (the panel's mouse on,
--      DCS's cursor off) they never were: the user, 2026-11-24: "when I open the UI and press Alt C to enter cursor
--      mode, I can no longer press any buttons. I have to press Alt C to return to camera mode to interact, but then
--      when I move the mouse to use the UI it moves the camera".
--   5. Now: the panel's mouse follows DCS's own cursor: off at a mission's start (as DCS's is), toggled by EVERY
--      LAlt+C of the mission, the panel shown or not (it is handed to the window only while shown), and no longer
--      taken when the F10 menu shows the panel.
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
--   Padeyes          (2026-11-23) the flight deck's padeyes (tie-down points) as small dots on the screen, magenta, or
--                    orange for one to confirm (under paint, not seen in the deck's texture); on while this page is the
--                    one open (and after "Hide", as the crosshair). CLICK A DOT to select it (the yellow mark sits on
--                    it), then move it forward / aft / port / starboard (the SHIP's axes) by the chosen step: it alone,
--                    its group (the flight deck, or one elevator's platform) or all of them; confirm, remove, add
--                    (its group by where it is: an elevator's platform or the flight deck; a click on one there
--                    selects it), "Clear all" (2026-11-24, the user: "start with no padeyes placed and just click on
--                    the deck where I want to add one": all taken away, "Click adds" chosen; Undo brings them back),
--                    ("Click adds": a click makes one where it meets the deck), undo. Kept in Logs\catcc-padeyes.lua
--                    (crewtest_padeye_tool.lua, which says how; the dots: crewtest_ui_dots.dlg, a window over the
--                    whole screen that lets clicks through, as the mark does). Any padeye can be confirmed (green).
--                    TOP VIEW (2026-11-24, the user: "Set my view to be perfectly orthogonal to the deck ... Middle
--                    mouse click and drag to pan the camera while maintaining that orthogonality"): the camera put
--                    straight down on the deck every frame (F11's free camera, as the slot picker's view: there DCS
--                    keeps a camera put from here), the ship's bow at the screen's top, over where the camera was;
--                    the middle button dragged moves it over the deck (the deck follows the mouse), the wheel takes
--                    it up or down. Pressed again, or another page opened: the camera is DCS's again.
--   Chocks           (2026-11-24) the wheel chock model (CATCC_WheelChock) on the player's jet or on the aircraft
--                    selected on the deck page: a chock on each wheel, its spacing (model argument 10) fitted to the
--                    tyre, opened, closed, stepped for one wheel or all, swept (crewtest_chocks.lua, which says how).
--   Flag             (2026-11-25) a folded US flag (CATCC_Flag) on the glareshield of the player's jet or of the aircraft
--                    selected on the deck page, any number of them; where it sits moved and turned for all at once
--                    (crewtest_flag.lua, which says how).
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
  padStep = '0.1', padScope = 'one', padMode = 'select', dots = {}, padMine = true, padModel = false, padHoles = false, padCombined = false,
  pages = { deck = {}, tow = {}, menu = {}, marks = {}, pad = {}, chock = {}, flag = {} } }
local L = { w = 760, h = 620, x = 8, bh = 26, gap = 4, top = 30, x0 = 60, y0 = 120 } -- (wide enough for the F10 menu's longest items in one column)
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

-- ---- the padeyes page (the tool: crewtest_padeye_tool.lua, UI.pad; the dots: UI.dotsWin)
local PAD_SCOPES = { { 'This one', 'one' }, { 'Its group', 'group' }, { 'All', 'all' } }
-- THE JET VIEWS (2026-11-25, the user: "create a tool that I can use to point the camera at the hornet model from one or
-- more camera angles for you to figure out the tie down ring locations"): the camera held on the player's own jet from
-- fixed places, in the JET's frame (a metres forward of its origin, b up from the deck under it, c to its right), looking
-- at a point of that frame (la, lb, lc); "Top" straight down and "Below" straight up from under the deck, the jet's nose
-- at the screen's top. Each view's exact camera (and each change of the field of view while in it) is written to
-- Logs\catcc-ringviews.lua with the time: the user's screenshots (DCS's own key) are matched to them by their times,
-- and a point picked in two of them gives its place on the jet.
local JET_VIEWS = {
  { name = 'Left', a = 0.5, b = 0.35, c = -8, la = 0.5, lb = 0.9, lc = 0 },
  { name = 'Right', a = 0.5, b = 0.35, c = 8, la = 0.5, lb = 0.9, lc = 0 },
  { name = 'Front', a = 11, b = 0.35, c = 0, la = 0, lb = 0.9, lc = 0 },
  { name = 'Rear', a = -13, b = 0.35, c = 0, la = -3, lb = 0.9, lc = 0 },
  { name = 'Top', a = 0, b = 25, c = 0, la = 0, lb = 0, lc = 0, up = 'nose' },
  { name = 'Below', a = 0, b = -0.6, c = 0, la = 0, lb = 5, lc = 0, up = 'nose' },
  { name = 'L front', a = 7, b = 0.35, c = -6, la = 0, lb = 0.9, lc = 0 },
  { name = 'R front', a = 7, b = 0.35, c = 6, la = 0, lb = 0.9, lc = 0 },
  { name = 'L rear', a = -8, b = 0.35, c = -6, la = -2, lb = 0.9, lc = 0 },
  { name = 'R rear', a = -8, b = 0.35, c = 6, la = -2, lb = 0.9, lc = 0 },
}
local JET_DECK = 1.826 -- metres from a parked jet's origin down to the deck under it (the hook's)
local DOT = 6 -- a dot's size on the screen, pixels

-- the flight deck's height above the ship's origin (a parked jet's own position less its 1.826 m: the hook's)
local function deckY() return ((api.deck and api.deck.jy) or 21.975) - 1.826 end

local function padStatus()
  local Pd = UI.pad
  if not Pd then return 'The padeye tool is not there (Scripts\\CATCC\\crewtest_padeye_tool.lua: run crew-test\\install.ps1 with DCS closed).' end
  local n, conf, done = Pd.counts()
  local e = Pd.sel
  return string.format('%d padeyes%s%s.', n, conf > 0 and string.format(', %d to confirm (orange)', conf) or '', (done or 0) > 0 and string.format(', %d confirmed (green)', done) or '')
    .. (e and not e.removed and ('\nSelected: ' .. Pd.text(e)) or '\nNothing selected: click a dot (LAlt+C gives the panel the mouse).')
end

local function refreshPad()
  if not UI.window then return end
  setText(UI.padStatus, padStatus())
  for _, s in ipairs(UI.padStepBtns) do setText(s.b, s.v == UI.padStep and ('[' .. s.t .. ']') or s.t) end
  for _, s in ipairs(UI.padScopeBtns) do setText(s.b, s.v == UI.padScope and ('[' .. s.t .. ']') or s.t) end
  setText(UI.padSelBtn, UI.padMode == 'select' and '[Click selects]' or 'Click selects')
  setText(UI.padAddBtn, UI.padMode == 'add' and '[Click adds]' or 'Click adds')
  setText(UI.padOverBtn, (UI.padOverAt and api.now() - UI.padOverAt < 4) and 'Start over: press again' or 'Start over')
  setText(UI.padTopBtn, UI.top and '[Top view]' or 'Top view')
  setText(UI.padMineBtn, UI.padMine and '[Mine]' or 'Mine')
  setText(UI.padModelBtn, UI.padModel and '[Model]' or 'Model')
  setText(UI.padHolesBtn, UI.padHoles and '[Holes]' or 'Holes')
  setText(UI.padCombinedBtn, UI.padCombined and '[Combined]' or 'Combined')
  for _, s in ipairs(UI.jetViewBtns or {}) do setText(s.b, (UI.jetView and UI.jetView.name == s.t) and ('[' .. s.t .. ']') or s.t) end
  setText(UI.padCrossBtn, UI.padCross and '[Crosshair]' or 'Crosshair')
  setText(UI.padClearBtn, (UI.padClearAt and api.now() - UI.padClearAt < 4) and 'Clear all: press again' or 'Clear all')
end

-- a padeye button's work: the tool's answer (a message, or nil and why) on the panel's last line
local function padDo(fn)
  return function()
    if not UI.pad then return end
    local msg, why = fn(UI.pad)
    UI.msg = msg or why or ''
  end
end

local function buildPad()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x
  local w3 = math.floor((W - 2 * L.gap) / 3)
  local ws = math.floor((W - 74 - 2 * L.gap) / 3)
  local function row() y = y + L.bh + L.gap end
  local function third(i) return x + (i - 1) * (w3 + L.gap) end
  local function step() return tonumber(UI.padStep) or 0.1 end
  UI.padStatus = label('pad', '', x, y, W, 3 * L.bh)
  y = y + 3 * L.bh + L.gap
  UI.padSelBtn = button('pad', '', third(1), y, w3, function() UI.padMode = 'select' end)
  UI.padAddBtn = button('pad', '', third(2), y, w3, function() UI.padMode = 'add' end)
  button('pad', 'Remove', third(3), y, w3, padDo(function(Pd) return Pd.remove() end))
  row()
  label('pad', 'Move', x, y, 70)
  UI.padScopeBtns = {}
  for i, s in ipairs(PAD_SCOPES) do
    local b = button('pad', s[1], x + 74 + (i - 1) * (ws + L.gap), y, ws, function() UI.padScope = s[2] end)
    UI.padScopeBtns[i] = { b = b, t = s[1], v = s[2] }
  end
  row()
  label('pad', 'Move by', x, y, 70)
  UI.padStepBtns = {}
  for i, s in ipairs(STEPS) do
    local b = button('pad', s[1], x + 74 + (i - 1) * (ws + L.gap), y, ws, function() UI.padStep = s[2] end)
    UI.padStepBtns[i] = { b = b, t = s[1], v = s[2] }
  end
  row()
  button('pad', 'Forward', third(2), y, w3, padDo(function(Pd) return Pd.move(step(), 0, UI.padScope) end))
  row()
  button('pad', 'Port', third(1), y, w3, padDo(function(Pd) return Pd.move(0, -step(), UI.padScope) end))
  button('pad', 'Aft', third(2), y, w3, padDo(function(Pd) return Pd.move(-step(), 0, UI.padScope) end))
  button('pad', 'Starboard', third(3), y, w3, padDo(function(Pd) return Pd.move(0, step(), UI.padScope) end))
  row()
  button('pad', 'Confirm', third(1), y, w3, padDo(function(Pd) return Pd.confirm() end))
  button('pad', 'Undo', third(2), y, w3, padDo(function(Pd) return Pd.undo() end))
  -- (starting over throws away all the user's changes: a second press within 4 s does it)
  UI.padOverBtn = button('pad', '', third(3), y, w3, padDo(function(Pd)
    local t = api.now()
    if UI.padOverAt and t - UI.padOverAt < 4 then
      UI.padOverAt = nil
      return Pd.startOver()
    end
    UI.padOverAt = t
    return 'padeyes: press "Start over" again to go back to the drawing\'s padeyes (all your changes go).'
  end))
  row()
  UI.padTopBtn = button('pad', '', third(1), y, w3, function() UI.wantTop = not UI.top end)
  -- (what is drawn: the user's own padeyes, DCS's model's (cyan), or both)
  UI.padMineBtn = button('pad', '', third(3), y, math.floor((w3 - L.gap) / 2), function() UI.padMine = not UI.padMine end)
  UI.padModelBtn = button('pad', '', third(3) + math.floor((w3 - L.gap) / 2) + L.gap, y, w3 - math.floor((w3 - L.gap) / 2) - L.gap, function() UI.padModel = not UI.padModel end)
  -- (all of them taken away, to place each by a click: a second press within 4 s does it; Undo brings them back)
  UI.padClearBtn = button('pad', '', third(2), y, w3, padDo(function(Pd)
    local t = api.now()
    if UI.padClearAt and t - UI.padClearAt < 4 then
      UI.padClearAt = nil
      UI.padMode = 'add'
      return Pd.clearAll()
    end
    UI.padClearAt = t
    return 'padeyes: press "Clear all" again to take every padeye away (Undo brings them back).'
  end))
  row()
  -- (the holes in the grid, yellow: padeye tool's P.holes)
  UI.padCombinedBtn = button('pad', '', third(2), y, w3, function() UI.padCombined = not UI.padCombined end)
  UI.padHolesBtn = button('pad', '', third(3), y, w3, function() UI.padHoles = not UI.padHoles end)
  row()
  -- (the jet views: the camera held on the player's jet from fixed places, for finding its tie-down rings)
  label('pad', 'Jet', x, y, 70)
  UI.jetViewBtns = {}
  local wv = math.floor((W - 74 - 5 * L.gap) / 6)
  for i, v in ipairs(JET_VIEWS) do
    local col, rw = (i - 1) % 6, math.floor((i - 1) / 6)
    local b = button('pad', v.name, x + 74 + col * (wv + L.gap), y + rw * (L.bh + L.gap), wv, function()
      if UI.jetView and UI.jetView.name == v.name then UI.wantJetView = false else UI.wantJetView = v.name end
    end)
    UI.jetViewBtns[i] = { b = b, t = v.name }
  end
  -- (the crosshair at the screen's centre, after the views on their second row)
  local nv = #JET_VIEWS
  UI.padCrossBtn = button('pad', '', x + 74 + (nv % 6) * (wv + L.gap), y + math.floor(nv / 6) * (L.bh + L.gap), 2 * wv + L.gap, function() UI.padCross = not UI.padCross end)
  y = y + math.floor((#JET_VIEWS - 1) / 6) * (L.bh + L.gap)
  row()
  -- (the tie-down chains on the player's jet: crewtest_tiedowns.lua, UI.tiedown)
  label('pad', 'Tie-downs', x, y, 70)
  local wt = math.floor((W - 74 - 3 * L.gap) / 4)
  local function tdDo(fn) return function() if UI.tiedown then local m, why = fn(UI.tiedown) UI.msg = m or why or '' end end end
  button('pad', 'Tie down my jet', x + 74, y, wt, tdDo(function(Td) return Td.place() end))
  -- (every static Hornet of the flight deck, and the player's jet: the user, 2026-11-25)
  button('pad', 'Tie down all', x + 74 + wt + L.gap, y, wt, tdDo(function(Td) return Td.placeAll() end))
  button('pad', 'Take away', x + 74 + 2 * (wt + L.gap), y, wt, tdDo(function(Td) return Td.clear() end))
  button('pad', 'Report', x + 74 + 3 * (wt + L.gap), y, wt, tdDo(function(Td) return Td.report() end))
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- ---- the chocks page (the tool: crewtest_chocks.lua, UI.chock)
local CHOCK_WHEELS = { { 'Both', 'all' }, { 'Left main', 'left' }, { 'Right main', 'right' } }
local CHOCK_STEPS = { { '-5 cm', -0.05 }, { '-1 cm', -0.01 }, { '-1 mm', -0.001 }, { '+1 mm', 0.001 }, { '+1 cm', 0.01 }, { '+5 cm', 0.05 } }
local CHOCK_MOVES = { { 'Aft 5 cm', -0.05 }, { 'Aft 1 cm', -0.01 }, { 'Aft 1 mm', -0.001 }, { 'Fwd 1 mm', 0.001 }, { 'Fwd 1 cm', 0.01 }, { 'Fwd 5 cm', 0.05 } }

local function refreshChock()
  if not UI.window then return end
  setText(UI.chockStatus, UI.chock and UI.chock.status() or 'The chock tool is not there (Scripts\\CATCC\\crewtest_chocks.lua: run crew-test\\install.ps1 with DCS closed).')
  local which = UI.chock and UI.chock.which
  for _, s in ipairs(UI.chockWheelBtns) do setText(s.b, s.v == which and ('[' .. s.t .. ']') or s.t) end
  setText(UI.chockSweepBtn, (UI.chock and UI.chock.sweepOn) and '[Sweep]' or 'Sweep')
end

-- a chock button's work: the tool's answer (a message, or nil and why) on the panel's last line
local function chockDo(fn)
  return function()
    if not UI.chock then return end
    local msg, why = fn(UI.chock)
    if msg or why then UI.msg = msg or why end
  end
end

local function buildChock()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x
  local w3 = math.floor((W - 2 * L.gap) / 3)
  local w4 = math.floor((W - 74 - 2 * L.gap) / 3)
  local w6 = math.floor((W - 74 - 5 * L.gap) / 6)
  local function row() y = y + L.bh + L.gap end
  local function third(i) return x + (i - 1) * (w3 + L.gap) end
  UI.chockStatus = label('chock', '', x, y, W, 3 * L.bh)
  y = y + 3 * L.bh + L.gap
  button('chock', 'Chock my jet', third(1), y, w3, chockDo(function(Ck) return Ck.place('jet') end))
  button('chock', 'Chock selected', third(2), y, w3, chockDo(function(Ck) return Ck.place('lock') end))
  button('chock', 'Take away', third(3), y, w3, chockDo(function(Ck) return Ck.clear() end))
  row()
  label('chock', 'Wheel', x, y, 70)
  UI.chockWheelBtns = {}
  for i, s in ipairs(CHOCK_WHEELS) do
    local b = button('chock', s[1], x + 74 + (i - 1) * (w4 + L.gap), y, w4, chockDo(function(Ck) return Ck.select(s[2]) end))
    UI.chockWheelBtns[i] = { b = b, t = s[1], v = s[2] }
  end
  row()
  button('chock', 'Fit', third(1), y, w3, chockDo(function(Ck) return Ck.fit() end))
  button('chock', 'Open', third(2), y, w3, chockDo(function(Ck) return Ck.set(Ck.M.MAX) end))
  button('chock', 'Closed', third(3), y, w3, chockDo(function(Ck) return Ck.set(Ck.M.MIN) end))
  row()
  label('chock', 'Spacing', x, y, 70)
  for i, s in ipairs(CHOCK_STEPS) do
    button('chock', s[1], x + 74 + (i - 1) * (w6 + L.gap), y, w6, chockDo(function(Ck) return Ck.step(s[2]) end))
  end
  row()
  label('chock', 'Fore / aft', x, y, 70)
  for i, s in ipairs(CHOCK_MOVES) do
    button('chock', s[1], x + 74 + (i - 1) * (w6 + L.gap), y, w6, chockDo(function(Ck) return Ck.move(s[2], 0) end))
  end
  row()
  label('chock', 'In / out', x, y, 70)
  button('chock', 'Inboard 1 cm', x + 74, y, w4, chockDo(function(Ck) return Ck.move(0, -0.01) end))
  button('chock', 'Outboard 1 cm', x + 74 + w4 + L.gap, y, w4, chockDo(function(Ck) return Ck.move(0, 0.01) end))
  row()
  UI.chockSweepBtn = button('chock', '', third(1), y, w3, chockDo(function(Ck) return Ck.sweep() end))
  button('chock', 'Report', third(2), y, w3, chockDo(function(Ck) return Ck.report() end))
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- ---- the flag page (the tool: crewtest_flag.lua, UI.flag)
local FLAG_MOVES = {
  { 'Fore / aft', 'fwd', { { 'Aft 5 cm', -0.05 }, { 'Aft 1 cm', -0.01 }, { 'Aft 2 mm', -0.002 }, { 'Fwd 2 mm', 0.002 }, { 'Fwd 1 cm', 0.01 }, { 'Fwd 5 cm', 0.05 } } },
  { 'Left / right', 'side', { { 'Left 5 cm', -0.05 }, { 'Left 1 cm', -0.01 }, { 'Left 2 mm', -0.002 }, { 'Right 2 mm', 0.002 }, { 'Right 1 cm', 0.01 }, { 'Right 5 cm', 0.05 } } },
  { 'Up / down', 'up', { { 'Down 5 cm', -0.05 }, { 'Down 1 cm', -0.01 }, { 'Down 2 mm', -0.002 }, { 'Up 2 mm', 0.002 }, { 'Up 1 cm', 0.01 }, { 'Up 5 cm', 0.05 } } },
  { 'Turn', 'turn', { { 'Left 10', -10 }, { 'Left 2', -2 }, { 'Left 0.5', -0.5 }, { 'Right 0.5', 0.5 }, { 'Right 2', 2 }, { 'Right 10', 10 } } },
  { 'Pitch', 'pitch', { { 'Down 10', -10 }, { 'Down 2', -2 }, { 'Down 0.5', -0.5 }, { 'Up 0.5', 0.5 }, { 'Up 2', 2 }, { 'Up 10', 10 } } },
  { 'Lean', 'lean', { { 'Left 10', -10 }, { 'Left 2', -2 }, { 'Left 0.5', -0.5 }, { 'Right 0.5', 0.5 }, { 'Right 2', 2 }, { 'Right 10', 10 } } },
}

local function refreshFlag()
  if not UI.window then return end
  setText(UI.flagStatus, UI.flag and UI.flag.status() or 'The flag tool is not there (Scripts\\CATCC\\crewtest_flag.lua: run crew-test\\install.ps1 with DCS closed).')
end

local function flagDo(fn)
  return function()
    if not UI.flag then return end
    local msg, why = fn(UI.flag)
    if msg or why then UI.msg = msg or why end
  end
end

local function buildFlag()
  local x, y = L.x, L.top + L.bh + 2 * L.gap
  local W = L.w - 2 * L.x
  local w3 = math.floor((W - 2 * L.gap) / 3)
  local w6 = math.floor((W - 94 - 5 * L.gap) / 6)
  local function row() y = y + L.bh + L.gap end
  local function third(i) return x + (i - 1) * (w3 + L.gap) end
  UI.flagStatus = label('flag', '', x, y, W, 3 * L.bh)
  y = y + 3 * L.bh + L.gap
  button('flag', 'Flag my jet', third(1), y, w3, flagDo(function(Fl) return Fl.toggle('jet') end))
  button('flag', 'Flag selected', third(2), y, w3, flagDo(function(Fl) return Fl.toggle('lock') end))
  button('flag', 'Take away all', third(3), y, w3, flagDo(function(Fl) return Fl.clear() end))
  row()
  for _, m in ipairs(FLAG_MOVES) do
    label('flag', m[1], x, y, 90)
    for i, s in ipairs(m[3]) do
      button('flag', s[1], x + 94 + (i - 1) * (w6 + L.gap), y, w6, flagDo(function(Fl) return Fl.move(m[2], s[2]) end))
    end
    row()
  end
  button('flag', 'Report', third(1), y, w3, flagDo(function(Fl) return Fl.report() end))
  row()
  UI.msgY = math.max(UI.msgY or 0, y)
end

-- THE DOTS: buttons of one solid colour (the slot picker's coloured buttons are such) in a window over the whole
-- screen that lets clicks through (as the mark's does); made as they are needed, told their place only when it moves
local function dotsOff()
  if not UI.dotsOn then return end
  for _, d in ipairs(UI.dots) do
    setShown(d.b, false)
    d.x = nil
  end
  pcall(function() UI.dotsWin:setBounds(0, 0, 1, 1) end)
  UI.dotsOn = false
end

local function updateDots(t)
  if not (UI.dotsWin and UI.pad) then return end
  if not UI.padOn then return dotsOff() end
  local c = camera(api.ctx(t))
  if not c then return dotsOff() end
  if not UI.dotsOn or UI.dotsW ~= c.sw or UI.dotsH ~= c.sh then
    UI.dotsWin:setBounds(0, 0, c.sw, c.sh)
    UI.dotsOn, UI.dotsW, UI.dotsH = true, c.sw, c.sh
  end
  -- (the model's padeyes first, cyan, under the user's: "Model"; the user's own: "Mine", the only ones a click picks)
  local list = {}
  if UI.padHoles then
    for _, q in ipairs(UI.pad.projectHoles(c, deckY())) do list[#list + 1] = q end
  end
  if UI.padCombined then
    for _, q in ipairs(UI.pad.projectCombined(c, deckY())) do list[#list + 1] = q end
  end
  if UI.padModel then
    for _, q in ipairs(UI.pad.projectModel(c, deckY())) do list[#list + 1] = q end
  end
  if UI.padMine then
    for _, q in ipairs(UI.pad.project(c, deckY())) do list[#list + 1] = q end
  else
    UI.pad.drawn = {}
  end
  for i, q in ipairs(list) do
    local d = UI.dots[i]
    if not d then
      local b = T.Button.new('')
      b:setSkin(UI.dotSkin)
      pcall(function() b:setTransparentForUserInput(true) end)
      UI.dotsWin:insertWidget(b)
      d = { b = b, k = 'dot' }
      UI.dots[i] = d
    end
    local k = (q.e.state == 'confirm' or q.e.state == 'confirmed' or q.e.state == 'model' or q.e.state == 'hole' or q.e.state == 'combined') and q.e.state or 'dot'
    if d.k ~= k then
      d.b:setSkin(k == 'confirm' and UI.dotConfirmSkin or (k == 'confirmed' and (UI.dotDoneSkin or UI.dotSkin)) or (k == 'model' and (UI.dotModelSkin or UI.dotSkin)) or (k == 'hole' and (UI.dotHoleSkin or UI.dotConfirmSkin)) or (k == 'combined' and (UI.dotDoneSkin or UI.dotSkin)) or UI.dotSkin)
      d.k = k
    end
    local x, y = math.floor(q.sx - DOT / 2 + 0.5), math.floor(q.sy - DOT / 2 + 0.5)
    if d.x ~= x or d.y ~= y then
      d.b:setBounds(x, y, DOT, DOT)
      d.x, d.y = x, y
    end
    setShown(d.b, true)
  end
  for i = #list + 1, #UI.dots do
    local d = UI.dots[i]
    if d.b.catccShown then
      setShown(d.b, false)
      d.x = nil
    end
  end
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
  if UI.page == 'deck' then refreshDeck() elseif UI.page == 'tow' then refreshTow() elseif UI.page == 'marks' then refreshMarks() elseif UI.page == 'pad' then refreshPad() elseif UI.page == 'chock' then refreshChock() elseif UI.page == 'flag' then refreshFlag() else refreshMenu() end
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
    setText(UI.tabPad, UI.page == 'pad' and '[Padeyes]' or 'Padeyes')
    setText(UI.tabChock, UI.page == 'chock' and '[Chocks]' or 'Chocks')
    setText(UI.tabFlag, UI.page == 'flag' and '[Flag]' or 'Flag')
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
  if not UI.window or v == UI.mouse then return end
  UI.mouse = v
  if UI.visible then
    UI.window:setHasCursor(v)
    UI.window:setText(title())
  end
  api.log('panel: the mouse ' .. (v and 'to the panel (cursor)' or 'back to the camera') .. (UI.visible and '' or ' (the panel put away: kept in step with DCS\'s cursor)'))
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
  if not (UI.window and UI.visible and ((UI.page == 'deck' and UI.pick) or UI.page == 'tow' or UI.page == 'pad')) then return end
  local D = api.deck
  local pad = UI.page == 'pad'
  if pad and not UI.pad then return end
  if not pad and not (D.list and D.shown) then return end
  local bx, by, bw, bh = UI.window:getBounds()
  if bx and x >= bx and x <= bx + bw and y >= by and y <= by + bh then return end -- (a click on the panel itself)
  -- (the padeyes: a click selects the dot nearest it, as drawn last frame; or, adding, makes one where it meets the deck)
  if pad and UI.padMode == 'select' then
    local msg, why = UI.pad.pick(x, y)
    UI.msg = msg or why
    return
  end
  local ctx = api.ctx(api.now())
  local c = camera(ctx)
  if not c then return api.log('panel: click at ' .. tostring(x) .. ', ' .. tostring(y) .. ': the camera cannot be read') end
  local nx, ny = (2 * x / c.sw - 1) * c.tanH, (1 - 2 * y / c.sh) * c.tanV
  local d = { c.f[1] + c.r[1] * nx + c.u[1] * ny, c.f[2] + c.r[2] * nx + c.u[2] * ny, c.f[3] + c.r[3] * nx + c.u[3] * ny }
  if pad then
    local msg, why = UI.pad.addAt(c.o, d, deckY())
    UI.msg = msg or why
    return
  end
  D.pick(c.o, d, ctx, string.format('a click at %d, %d of %d x %d, field of view %.1f (%s)', x, y, c.sw, c.sh, c.fov, UI.fovH and 'horizontal' or 'vertical'))
end

-- ---- THE TOP VIEW (the padeyes' page; see the top of this file). UI.top = { x, z, h }: the camera's place over the
-- deck in the ship's frame (metres forward, to starboard) and its height above the flight deck. Put every frame from
-- tick (the ship moves); the camera looks down the ship's own up axis, the bow at the screen's top.
local TOP_H = { 3, 250 } -- the lowest and highest the wheel takes it, metres above the deck
local TOP_WHEEL = 0.85   -- each click of the wheel: the height times this (down) or divided by it (up)

local function topOn(ctx)
  local c = camera(ctx)
  if not c then return nil, 'Top view: the camera cannot be read here.' end
  if not (Export and Export.LoSetCameraPosition) then return nil, 'Top view: the camera cannot be put from here (no LoSetCameraPosition).' end
  local h = c.o[2] - deckY()
  if h < 10 then h = 40 end
  UI.top = { x = c.o[1], z = c.o[3], h = math.min(h, TOP_H[2]), n = 0 }
  -- (F11, the free camera: the view in which DCS keeps a camera put from here; the slot picker's view, seen in DCS)
  if Export.LoSetCommand then pcall(Export.LoSetCommand, 16) end
  if UI.topMouse then UI.topMouse(true) end
  api.log(string.format('panel: top view on: %.1f m forward, %.1f m to starboard, %.1f m above the deck', UI.top.x, UI.top.z, UI.top.h))
  return 'Top view.'
end

-- ---- THE JET VIEWS (JET_VIEWS above): the jet's place and axes in the SHIP's frame, read from the mission when a view
-- is chosen (it stands still on the deck); then each frame the camera is put there through the ship's place
local function jetPose(ctx)
  local okd, r = pcall(api.dostring, [[
local u
for _, s in ipairs({ 2, 1, 0 }) do for _, p in ipairs(coalition.getPlayers(s) or {}) do if not u and p and p:isExist() then u = p end end end
if not u then return '' end
local P = u:getPosition()
return string.format('%s|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f|%.6f', u:getTypeName(), P.p.x, P.p.y, P.p.z, P.x.x, P.x.y, P.x.z, P.y.x, P.y.y, P.y.z, P.z.x, P.z.y, P.z.z)]])
  if not (okd and type(r) == 'string' and r ~= '') then return nil, 'no player aircraft (the jet views look at your own jet: sit in it)' end
  local p = api.split(r)
  local n = {}
  for i = 2, 13 do n[i - 1] = tonumber(p[i]) end
  if #n < 12 then return nil, 'the jet could not be read' end
  local s = ctx.s
  local function rel(x, y, z, point)
    if point then x, y, z = x - s[10], y - s[11], z - s[12] end
    return { x * s[1] + y * s[2] + z * s[3], x * s[4] + y * s[5] + z * s[6], x * s[7] + y * s[8] + z * s[9] }
  end
  return { type = p[1], p = rel(n[1], n[2], n[3], true), x = rel(n[4], n[5], n[6]), y = rel(n[7], n[8], n[9]), z = rel(n[10], n[11], n[12]) }
end

local function v3(a, b, c) return { a, b, c } end
local function sub(a, b) return { a[1] - b[1], a[2] - b[2], a[3] - b[3] } end
local function dot3(a, b) return a[1] * b[1] + a[2] * b[2] + a[3] * b[3] end
local function cross(a, b) return { a[2] * b[3] - a[3] * b[2], a[3] * b[1] - a[1] * b[3], a[1] * b[2] - a[2] * b[1] } end
local function unit(a) local m = math.sqrt(dot3(a, a)) return { a[1] / m, a[2] / m, a[3] / m } end

-- the view's camera in the JET's frame: its place and axes (x where it looks, y the screen's up, z its right)
local function jetViewCam(v)
  local p = v3(v.a, v.b - JET_DECK, v.c)
  local x = unit(sub(v3(v.la, v.lb - JET_DECK, v.lc), p))
  local up0 = v.up == 'nose' and v3(1, 0, 0) or v3(0, 1, 0)
  local y = unit(sub(up0, { x[1] * dot3(up0, x), x[2] * dot3(up0, x), x[3] * dot3(up0, x) }))
  return { p = p, x = x, y = y, z = cross(x, y) }
end

local function fovNow()
  local fov = 78
  if DCS and DCS.getCurrentFOV then
    local okf, f = pcall(DCS.getCurrentFOV)
    if okf and type(f) == 'number' and f > 1 and f < 179 then fov = f end
  end
  return fov
end

-- one line of Logs\catcc-ringviews.lua: the time, the view, the camera in the jet's frame, the field of view, the screen
local function jetViewLog(what)
  local jv = UI.jetView
  local c = jv.cam
  local sw, sh = T.dxgui.GetScreenSize()
  local function t3(a) return string.format('{ %.4f, %.4f, %.4f }', a[1], a[2], a[3]) end
  local line = string.format('{ time = %q, what = %q, view = %q, jet = %q, cam = { p = %s, x = %s, y = %s, z = %s }, fov = %.3f, fov_axis = %q, screen = { %d, %d } },\n',
    os.date('%Y-%m-%d %H:%M:%S'), what, jv.name, tostring(jv.jet.type), t3(c.p), t3(c.x), t3(c.y), t3(c.z), jv.fov, UI.fovH and 'horizontal' or 'vertical', sw, sh)
  local f = io.open(api.writedir .. 'Logs/catcc-ringviews.lua', 'a')
  if f then
    f:write(line)
    f:close()
  end
  api.log('panel: jet view ' .. what .. ': ' .. jv.name .. string.format(' (field of view %.1f)', jv.fov))
end

local function jetViewOff(why)
  if not UI.jetView then return end
  UI.jetView = nil
  api.log('panel: jet view off (' .. why .. ')')
end

local function jetViewOn(name, ctx)
  local v
  for _, w in ipairs(JET_VIEWS) do if w.name == name then v = w end end
  if not (v and ctx) then return nil, 'Jet view: no carrier here.' end
  if not (Export and Export.LoSetCameraPosition) then return nil, 'Jet view: the camera cannot be put from here (no LoSetCameraPosition).' end
  local jet, why = jetPose(ctx)
  if not jet then return nil, 'Jet view: ' .. why .. '.' end
  if Export.LoSetCommand and not UI.jetView then pcall(Export.LoSetCommand, 16) end
  UI.jetView = { name = name, jet = jet, cam = jetViewCam(v), fov = fovNow() }
  jetViewLog('on')
  return 'Jet view: ' .. name .. '.'
end

-- each frame: the camera put (jet frame -> ship frame -> world); a change of the field of view written down
local function jetViewPut(ctx)
  local jv, s = UI.jetView, ctx.s
  local J, c = jv.jet, jv.cam
  local function shipOf(a, point)
    local o = { J.x[1] * a[1] + J.y[1] * a[2] + J.z[1] * a[3], J.x[2] * a[1] + J.y[2] * a[2] + J.z[2] * a[3], J.x[3] * a[1] + J.y[3] * a[2] + J.z[3] * a[3] }
    if point then o = { o[1] + J.p[1], o[2] + J.p[2], o[3] + J.p[3] } end
    return o
  end
  local function worldOf(a, point)
    local o = { s[1] * a[1] + s[4] * a[2] + s[7] * a[3], s[2] * a[1] + s[5] * a[2] + s[8] * a[3], s[3] * a[1] + s[6] * a[2] + s[9] * a[3] }
    if point then o = { o[1] + s[10], o[2] + s[11], o[3] + s[12] } end
    return { x = o[1], y = o[2], z = o[3] }
  end
  local okp, err = pcall(Export.LoSetCameraPosition, { x = worldOf(shipOf(c.x)), y = worldOf(shipOf(c.y)), z = worldOf(shipOf(c.z)), p = worldOf(shipOf(c.p, true), true) })
  if not okp then
    jetViewOff('the camera could not be put: ' .. tostring(err))
    UI.msg = 'Jet view: the camera could not be put (see the log).'
    return
  end
  local fov = fovNow()
  if math.abs(fov - jv.fov) > 0.05 then
    jv.fovAt = jv.fovAt or api.now()
    -- (written once the zoom has been still for half a second)
    if api.now() - jv.fovAt > 0.5 then
      jv.fov, jv.fovAt = fov, nil
      jetViewLog('zoom')
    end
  else
    jv.fovAt = nil
  end
end

-- THE CAMERA AT REST (2026-11-25: the user's first shots of the rings were taken with DCS's own free camera, framed
-- close up by hand, and so could not be measured): while the padeyes' page is open (or put away after it), every time
-- the camera has stood still for CAM_REST seconds after moving, its place in the player's jet's frame (and the field
-- of view, the screen) is a line of Logs\catcc-ringviews.lua, what = "still": a screenshot is matched to the last line
-- before it by its time
local CAM_REST = 0.4
local function camRestLog(t, ctx)
  local okc, cp = pcall(Export.LoGetCameraPosition)
  if not (okc and type(cp) == 'table' and cp.p and cp.x and cp.y and cp.z) then return end
  if not ctx then return end
  local fov = fovNow()
  local s = ctx.s
  local function ship(v, point)
    local x, y, z = v.x, v.y, v.z
    if point then x, y, z = x - s[10], y - s[11], z - s[12] end
    return { x * s[1] + y * s[2] + z * s[3], x * s[4] + y * s[5] + z * s[6], x * s[7] + y * s[8] + z * s[9] }
  end
  -- (still: in the SHIP's frame, where the jet stands; a camera left still in the world while the ship sails on moves)
  local sp, sx = ship(cp.p, true), ship(cp.x)
  local key = { sp[1], sp[2], sp[3], sx[1], sx[2], sx[3], fov }
  local last = UI.camLast
  local moved = not last
  if last then
    for i = 1, 7 do if math.abs(key[i] - last[i]) > (i <= 3 and 0.01 or (i <= 6 and 0.0005 or 0.05)) then moved = true end end
  end
  UI.camLast = key
  if moved then
    UI.camMovedAt, UI.camLogged = t, false
    return
  end
  if UI.camLogged or not UI.camMovedAt or t - UI.camMovedAt < CAM_REST then return end
  UI.camLogged = true
  local jet = jetPose(ctx)
  if not jet then return end
  local function jetOf(a, point)
    if point then a = { a[1] - jet.p[1], a[2] - jet.p[2], a[3] - jet.p[3] } end
    return { dot3(a, jet.x), dot3(a, jet.y), dot3(a, jet.z) }
  end
  local sw, sh = T.dxgui.GetScreenSize()
  local function t3(a) return string.format('{ %.4f, %.4f, %.4f }', a[1], a[2], a[3]) end
  local line = string.format('{ time = %q, what = "still", view = "free", jet = %q, cam = { p = %s, x = %s, y = %s, z = %s }, fov = %.3f, fov_axis = %q, screen = { %d, %d } },\n',
    os.date('%Y-%m-%d %H:%M:%S'), tostring(jet.type), t3(jetOf(ship(cp.p, true), true)), t3(jetOf(ship(cp.x))), t3(jetOf(ship(cp.y))), t3(jetOf(ship(cp.z))), fov,
    UI.fovH and 'horizontal' or 'vertical', sw, sh)
  local f = io.open(api.writedir .. 'Logs/catcc-ringviews.lua', 'a')
  if f then
    f:write(line)
    f:close()
  end
end

local function topOff(why)
  if not UI.top then return end
  UI.top, UI.drag = nil, nil
  if UI.topMouse then UI.topMouse(false) end
  api.log('panel: top view off (' .. why .. ')')
end

-- the camera put where UI.top says, this frame
local function topPut(ctx)
  local q, s = UI.top, ctx.s
  local y = deckY() + q.h
  local X, Y, Z = { s[1], s[2], s[3] }, { s[4], s[5], s[6] }, { s[7], s[8], s[9] }
  local function v(a) return { x = a[1], y = a[2], z = a[3] } end
  local p = { s[10] + q.x * X[1] + y * Y[1] + q.z * Z[1], s[11] + q.x * X[2] + y * Y[2] + q.z * Z[2], s[12] + q.x * X[3] + y * Y[3] + q.z * Z[3] }
  local okp, err = pcall(Export.LoSetCameraPosition, { x = v({ -Y[1], -Y[2], -Y[3] }), y = v(X), z = v(Z), p = v(p) })
  q.n = q.n + 1
  if not okp then
    topOff('the camera could not be put: ' .. tostring(err))
    UI.msg = 'Top view: the camera could not be put (see the log).'
    return
  end
  -- (once, 30 frames on: does DCS keep it there? what the first try in DCS shows)
  if q.n == 30 then
    local okc, cp = pcall(Export.LoGetCameraPosition)
    if okc and type(cp) == 'table' and cp.p then
      local far = math.sqrt((cp.p.x - p[1]) ^ 2 + (cp.p.y - p[2]) ^ 2 + (cp.p.z - p[3]) ^ 2)
      api.log(string.format('panel: top view: after 30 frames the camera is %.2f m from where it is put, looking %.2f / %.2f / %.2f', far, cp.x.x, cp.x.y, cp.x.z))
      if far > 1 then UI.msg = 'Top view: DCS does not keep the camera where it is put in this view.' end
    end
  end
end

-- metres of deck across one pixel of the screen, straight down from height h
local function topScale(h)
  local c = camera(api.ctx(api.now()))
  if not c then return nil end
  return 2 * h * c.tanH / c.sw
end

-- the mouse kinds DCS tells of (the first of each logged: what the first try in DCS shows)
local function mouseSeen(kind, x, y, b)
  UI.mouseSeen = UI.mouseSeen or {}
  if UI.mouseSeen[kind] then return end
  UI.mouseSeen[kind] = true
  api.log(string.format('panel: the first mouse "%s": %s, %s, %s', kind, tostring(x), tostring(y), tostring(b)))
end

-- a button pressed: the left one clicks (select / add / lock on); the middle one, in the top view, takes hold of the
-- deck (DCS's mission editor numbers the buttons 1 left, 2 right, 3 middle)
local function onDown(x, y, b)
  mouseSeen('down ' .. tostring(b), x, y, b)
  if b == 3 then
    if UI.top then
      local k = topScale(UI.top.h)
      if k then UI.drag = { x = x, y = y, tx = UI.top.x, tz = UI.top.z, k = k } end
    end
    return
  end
  UI.drag = nil
  if b == nil or b == 1 then onMouseDown(x, y) end
end

-- the middle button held and moved: the deck follows the mouse
local function onMove(x, y)
  mouseSeen('move', x, y)
  local d = UI.drag
  if not (d and UI.top) then return end
  UI.top.x = d.tx + (y - d.y) * d.k
  UI.top.z = d.tz - (x - d.x) * d.k
end

local function onUp(x, y, b)
  mouseSeen('up ' .. tostring(b), x, y, b)
  if b == 3 or b == nil then UI.drag = nil end
end

local function onWheel(x, y, clicks)
  mouseSeen('wheel', x, y, clicks)
  if not (UI.top and tonumber(clicks)) then return end
  local h = UI.top.h * TOP_WHEEL ^ clicks
  UI.top.h = math.max(TOP_H[1], math.min(TOP_H[2], h))
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
  UI.tabDeck = button(nil, 'Deck spots', L.x, L.top, 104, function() UI.page = 'deck' end)
  UI.tabTow = button(nil, 'Tow', L.x + 108, L.top, 56, function() UI.page = 'tow' end)
  UI.tabMenu = button(nil, 'Crew test menu', L.x + 168, L.top, 130, function() UI.page = 'menu' end)
  UI.tabMarks = button(nil, 'Hangar marks', L.x + 302, L.top, 116, function() UI.page = 'marks' end)
  UI.tabPad = button(nil, 'Padeyes', L.x + 422, L.top, 86, function() UI.page = 'pad' end)
  UI.tabChock = button(nil, 'Chocks', L.x + 512, L.top, 76, function() UI.page = 'chock' end)
  UI.tabFlag = button(nil, 'Flag', L.x + 592, L.top, 64, function() UI.page = 'flag' end)
  local hide = button(nil, 'Hide', L.w - L.x - 80, L.top, 80, function() UI.want = false end)
  UI.always = { UI.tabDeck, UI.tabTow, UI.tabMenu, UI.tabMarks, UI.tabPad, UI.tabChock, UI.tabFlag, hide }
  -- the chock tool (no window of its own: the page is the panel's)
  guard('the chock tool', function()
    local f, err = loadfile(api.writedir .. 'Scripts/CATCC/crewtest_chocks.lua')
    if not f then return api.log('panel: the chock tool not loaded: ' .. tostring(err)) end
    UI.chock = f({ dostring = api.dostring, split = api.split, objarg = api.objarg, jet = api.jet, jetId = api.jetId, deck = api.deck, log = api.log, now = api.now,
      staticpos = api.staticpos, platformAt = api.platformAt })
  end)
  -- the flag tool (no window of its own: the page is the panel's)
  guard('the flag tool', function()
    local f, err = loadfile(api.writedir .. 'Scripts/CATCC/crewtest_flag.lua')
    if not f then return api.log('panel: the flag tool not loaded: ' .. tostring(err)) end
    UI.flag = f({ dostring = api.dostring, split = api.split, objarg = api.objarg, jetId = api.jetId, deck = api.deck, log = api.log, now = api.now })
  end)
  -- the padeye tool (no window of its own: the page and the dots below are the panel's)
  guard('the padeye tool', function()
    local f, err = loadfile(api.writedir .. 'Scripts/CATCC/crewtest_padeye_tool.lua')
    if not f then return api.log('panel: the padeye tool not loaded: ' .. tostring(err)) end
    UI.pad = f({ writedir = api.writedir, log = api.log, now = api.now })
  end)
  -- the tie-down chains (no window of their own: their buttons are on the padeyes' page)
  guard('the tie-down tool', function()
    local f, err = loadfile(api.writedir .. 'Scripts/CATCC/crewtest_tiedowns.lua')
    if not f then return api.log('panel: the tie-down tool not loaded: ' .. tostring(err)) end
    UI.tiedown = f({ dostring = api.dostring, split = api.split, objarg = api.objarg, writedir = api.writedir, log = api.log, now = api.now, deckY = deckY,
      staticpos = api.staticpos, platformAt = api.platformAt,
      ctx = function() return api.ctx(api.now()) end,
      jet = function()
        local c = api.ctx(api.now())
        if not c then return nil, 'no carrier here' end
        return jetPose(c)
      end })
  end)
  buildDeck()
  buildTow()
  buildMenu()
  buildMarks()
  buildPad()
  buildChock()
  buildFlag()
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
  -- THE PADEYES' DOTS: a window over the whole screen while they are on (else one pixel in the corner), under the
  -- mark and the panel, letting clicks through; its two templates lend their skins (magenta, orange) to the dots
  if UI.pad then
    guard('the padeyes\' dots', function()
      UI.dotsWin = T.DialogLoader.spawnDialogFromFile(dir .. 'crewtest_ui_dots.dlg')
      pcall(function() UI.dotsWin:setTransparentForUserInput(true) end)
      UI.dotSkin = UI.dotsWin.tplDot:getSkin()
      UI.dotConfirmSkin = UI.dotsWin.tplDotConfirm:getSkin()
      UI.dotsWin.tplDot:setVisible(false)
      UI.dotsWin.tplDotConfirm:setVisible(false)
      if UI.dotsWin.tplDotDone then
        UI.dotDoneSkin = UI.dotsWin.tplDotDone:getSkin()
        UI.dotsWin.tplDotDone:setVisible(false)
      end
      if UI.dotsWin.tplDotModel then
        UI.dotModelSkin = UI.dotsWin.tplDotModel:getSkin()
        UI.dotsWin.tplDotModel:setVisible(false)
      end
      if UI.dotsWin.tplDotHole then
        UI.dotHoleSkin = UI.dotsWin.tplDotHole:getSkin()
        UI.dotsWin.tplDotHole:setVisible(false)
      end
      UI.dotsWin:setVisible(true)
      UI.dotsWin:setBounds(0, 0, 1, 1)
    end)
  end
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
  T.dxgui.AddMouseCallback('down', function(x, y, b) guard('a click', onDown, x, y, b) end)
  -- (the top view's drag and wheel: DCS's "move", "up" and "wheel", ONLY WHILE THE TOP VIEW IS ON. Held for the
  -- whole mission (2026-11-24), the user could no longer orbit the camera in DCS's outside views, the top view off;
  -- DCS's own scripts take none of these three, only "down". Each kind's first event is logged.)
  local topCbs = {}
  for _, k in ipairs({ { 'move', onMove }, { 'up', onUp }, { 'wheel', onWheel } }) do
    topCbs[#topCbs + 1] = { k[1], function(x, y, b) guard('the mouse (' .. k[1] .. ')', k[2], x, y, b) end }
  end
  function UI.topMouse(on)
    if on == (UI.topCbsOn or false) then return end
    for _, cb in ipairs(topCbs) do
      local okm, err = pcall(on and T.dxgui.AddMouseCallback or T.dxgui.RemoveMouseCallback, cb[1], cb[2])
      if not okm then api.log('panel: the mouse "' .. cb[1] .. '" could not be ' .. (on and 'taken' or 'given back') .. ': ' .. tostring(err)) end
    end
    UI.topCbsOn = on
    api.log('panel: the mouse\'s move / up / wheel ' .. (on and 'taken (the top view)' or 'given back'))
  end
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
  -- (also drawn for the padeyes' page's "Crosshair", 2026-11-25, the user: "a cross hair I can switch on to line up the
  -- rings in the center of the view": a ring under it lies on the camera's own line of sight, which the camera at rest
  -- writes down. Only drawn: the hangar marks' keys stay the marks page's, UI.crossOn)
  local crossShown = crossOn or (UI.padOn and UI.padCross) or false
  if UI.cross and (crossShown ~= UI.crossShown or crossShown) then
    if crossShown then
      local sw, sh = T.dxgui.GetScreenSize()
      local cx, cy = math.floor(sw / 2 - 3 + 0.5), math.floor(sh / 2 - 3 + 0.5)
      if UI.crossAt ~= cx * 100000 + cy then
        UI.cross:setBounds(cx, cy, 6, 6)
        UI.crossAt = cx * 100000 + cy
      end
    elseif UI.crossShown then
      UI.cross:setBounds(0, 0, 1, 1)
      UI.crossAt = nil
    end
  end
  UI.crossOn, UI.crossShown = crossOn, crossShown
  if crossOn and api.marks then
    local ctx = api.ctx(t)
    if ctx then pcall(api.marks.showAll, ctx.ship) end
  end
  -- (the padeyes' dots: on while their page is the one open, the panel shown or put away after it was opened, as
  -- the crosshair; their file written when the changes have been quiet a moment)
  if UI.page == 'pad' and UI.visible then UI.padOn = true elseif UI.visible then UI.padOn = false end
  -- (the top view: asked for by its button; off with the padeyes' page; the camera put before the dots are drawn)
  if UI.wantTop ~= nil then
    local v = UI.wantTop
    UI.wantTop = nil
    if v and not UI.top then
      local msg, why = topOn(api.ctx(t))
      UI.msg = msg or why
    elseif not v then
      topOff('its button')
    end
  end
  if UI.top and not UI.padOn then topOff('the padeyes\' page closed') end
  if UI.top then
    local ctx = api.ctx(t)
    if ctx then topPut(ctx) end
  end
  -- (the jet views: asked for by their buttons; one at a time, and not with the top view; off with the page)
  if UI.wantJetView ~= nil then
    local v = UI.wantJetView
    UI.wantJetView = nil
    if v then
      if UI.top then topOff('a jet view') end
      local msg, why = jetViewOn(v, api.ctx(t))
      UI.msg = msg or why
    else
      jetViewOff('its button')
    end
  end
  if UI.wantTop and UI.jetView then jetViewOff('the top view') end
  if UI.jetView and not UI.padOn then jetViewOff('the padeyes\' page closed') end
  if UI.jetView then
    local ctx = api.ctx(t)
    if ctx then jetViewPut(ctx) end
  end
  if UI.padOn and not UI.jetView and not UI.top then
    camRestLog(api.now(), api.ctx(t))
  else
    UI.camLast, UI.camMovedAt = nil, nil
  end
  -- (each tool's own frame in its own pcall: a tool's error is logged once and stops only that tool's frame, never
  -- the panel, which must always stay able to put itself away)
  local function toolTick(name, fn, ...)
    local okt, r = pcall(fn, ...)
    if okt then return r end
    UI.toolErr = UI.toolErr or {}
    if not UI.toolErr[name] then
      UI.toolErr[name] = true
      api.log('panel: the ' .. name .. ' tool: ' .. tostring(r))
    end
  end
  if UI.pad then
    toolTick('padeyes\' dots', updateDots, t)
    toolTick('padeyes', UI.pad.tick, api.now())
  end
  if UI.tiedown then
    toolTick('tiedowns', UI.tiedown.tick)
  end
  -- (the chocks: the Hornet's own hidden and ours put in with them, their spacing kept, the sweep)
  if UI.chock then
    local cmsg = toolTick('chocks', UI.chock.tick)
    if cmsg then UI.msg = cmsg end
  end
  -- (the flags: their arguments kept, their aircraft followed)
  if UI.flag then
    local fmsg = toolTick('flag', UI.flag.tick)
    if fmsg then UI.msg = fmsg end
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
    -- (the padeyes' page: the mark on the selected padeye, at the deck's height)
    local padSel = (UI.page == 'pad' and UI.pad and UI.pad.sel) or nil
    if padSel then e = padSel end
    local sx, sy
    if e and not e.removed then
      local ctx = api.ctx(t)
      local c = camera(ctx)
      if c then
        local ex, ez = e.x, e.z
        if D.pose and not padSel then ex, ez = D.pose(e) end
        local ey = padSel and deckY() or (D.yOf and D.yOf(e) or D.jy)
        local v = { ex - c.o[1], ey - c.o[2], ez - c.o[3] }
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
    -- (put away first: a panel switched off while shown would stay on the screen with the cursor, its Hide and its
    -- keys no longer answered)
    pcall(mouse, false)
    pcall(apply, false)
    pcall(function() markAt(nil) end)
    pcall(dotsOff)
    if UI.cross then pcall(function() UI.cross:setBounds(0, 0, 1, 1) end) end
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
  UI.crossOn, UI.crossShown, UI.crossAt = false, false, nil
  -- (the padeyes: what is not written yet is written; their dots put away)
  UI.padOn, UI.padOverAt = false, nil
  UI.top, UI.drag, UI.wantTop, UI.mouse = nil, nil, nil, false
  if UI.topMouse then pcall(UI.topMouse, false) end
  UI.jetView, UI.wantJetView = nil, nil
  UI.toolErr = nil
  if UI.pad then pcall(UI.pad.reset) end
  if UI.chock then pcall(UI.chock.reset) end
  if UI.flag then pcall(UI.flag.reset) end
  if UI.tiedown then pcall(UI.tiedown.reset) end
  pcall(dotsOff)
  if UI.window and not UI.dead then
    pcall(function()
      if UI.visible then apply(false) end
      markAt(nil)
    end)
  end
end

return UI
