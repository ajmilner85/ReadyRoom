-- THE SLOT PICKER'S SERVER SIDE, in the test harness of crewtest.test.ts (run by the test "the slot picker" under DCS's
-- own Lua 5.1, through luarun.py): a multiplayer mission stood in for (DCS.getCurrentMission, the net functions) with
-- two Client Hornets on the demo's carrier: on spot 1 (Stbd bow 6: its aircraft stands there from the start) and on
-- spot 18 (Sixpack 1: its aircraft comes up from the hangar). The host is player 1, Bob player 2.
ROUTES_SRC = ROUTES_REAL
STATIC_UP = 21.9
for i = 0, 9 do add(105 + i, 'catcc-t' .. i, '1: catcc-t' .. i, 12 + i, 33, SHIP_A) end
PLAYER = false
-- THE VIEW BEHIND THE PICKER (crewtest_slots.lua S.view): DCS's camera stood in for: a view command (LoSetCommand:
-- 13 the ship view, 16 the free camera, 15 the map) chooses the view; in a view of VIEW_HOLDS a camera put
-- (LoSetCameraPosition) stays where it was put and is read back there; in any other DCS keeps its own (CAMAT's).
VIEWCMDS, VIEW_NOW, VIEW_HOLDS, CAMSET, CAMPUTS = {}, 15, { [13] = true, [16] = true }, nil, 0
do
  local own = Export.LoGetCameraPosition
  Export.LoSetCommand = function(cmd) VIEWCMDS[#VIEWCMDS + 1] = cmd VIEW_NOW = cmd if not VIEW_HOLDS[cmd] then CAMSET = nil end end
  Export.LoSetCameraPosition = function(pos) CAMPUT, CAMPUTS = pos, CAMPUTS + 1 if VIEW_HOLDS[VIEW_NOW] then CAMSET = pos end end
  Export.LoGetCameraPosition = function() return CAMSET or own() end
end
HANDLER.onSimulationStart()
frames(1)
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
-- (the mission's slots known before the demo starts: Hornet 1's livery on spot 1 is 744, which the demo's own plan
-- gives another spot: the demo paints its aircraft on spot 1 744, and gives that other one spot 1's paint)
DCS.getCurrentMission = function()
  return { mission = { coalition = { blue = { country = { {
    ship = { group = { { units = { { unitId = 900, name = 'CVN-72' } } }, { units = { { unitId = 903, name = 'CVN-73', type = 'CVN_73' } } } } },
    plane = { group = { { name = 'Hornets', route = { points = { { linkUnit = 900 } } }, units = {
      { unitId = 901, name = 'Hornet 1', skill = 'Client', parking_id = '1', type = 'FA-18C_hornet', livery_id = 'KING - LineJet - 744' },
      { unitId = 902, name = 'Hornet 2', skill = 'Client', parking_id = '18', type = 'FA-18C_hornet', onboard_num = '102' } } },
      -- (a dynamic spawn template on spot 1 too: not a slot)
      { name = 'Template', dynSpawnTemplate = true, route = { points = { { linkUnit = 900 } } }, units = {
      { unitId = 904, name = 'Template 1', skill = 'Client', parking_id = '1', parking = '1', type = 'FA-18C_hornet' } } } } } } } } } } }
end
CATCC_SLOTS.loadSlots()
HOTKEYS['Ctrl+Shift+F9']()
frames(3)
local D, SL = CATCC_DEMO, CATCC_SLOTS
local was744
for _, a in ipairs(D.aircraft) do if a.spot.spot ~= 1 and a.livery:match('%- 623$') then was744 = a end end
rec(string.format('paint: spot 1 board %s (%s); the one the plan had as 744 (%s) now %s (%s)', tostring(D.onSpot(1).board), tostring(D.onSpot(1).livery),
  tostring(was744 and was744.spot.name), tostring(was744 and was744.board), tostring(was744 and was744.livery)))
-- (the hook's own callback, as DCS calls it on the server)
function handlerTry(id, side, slot) return HANDLER.onPlayerTryChangeSlot(id, side, slot) end
rec('loaded: demo ' .. tostring(D ~= nil) .. ', slots ' .. tostring(SL ~= nil))
local players = { [1] = { name = 'Host', ucid = 'u1', slot = '' }, [2] = { name = 'Bob', ucid = 'u2', slot = '' } }
CHAT = {}
DCS.isMultiplayer = function() return true end
DCS.isServer = function() return true end
net.get_player_list = function() return { 1, 2 } end
net.get_player_info = function(id, k)
  local p = players[id]
  if k then return p and p[k] end
  return p
end
net.get_slot = function(id) return 2, players[id].slot end
net.get_my_player_id = function() return 1 end
net.send_chat_to = function(msg, id) CHAT[#CHAT + 1] = id .. ': ' .. msg end
net.set_slot = function(side, slot) players[1].slot = slot end
SL.loadSlots()
frames(2)
rec('slots: ' .. #SL.slots .. ' on ' .. table.concat(SL.carriers, ', ') .. '; the deck reported: ' .. tostring(SL.demoOn()) .. ', ' .. #SL.list .. ' aircraft')
local function stateOf(n) return SL.map[n] and SL.map[n].state end
CHAT = {}
rec(string.format('template: Bob asks for it: %s (%s); spot 1 still Hornet 1: %s', tostring(handlerTry(2, 2, '904')), tostring(CHAT[1]), tostring(SL.bySpot['CVN-72/1'] and SL.bySpot['CVN-72/1'].name)))
CHAT = {}
-- 0) THE PICKER OVER DCS'S SCREEN (the GUI state out of reach here too): the host has no slot: it is up, with the deck's
-- picture, a mark for each aircraft on the deck and each slot (in brackets: not to be taken), the cursor
local win = WINDOWS.crewtest_slots
-- (on the screen as DCS draws it: the window visible, never made invisible (the harness: DCS does not show such a
-- window again), in its own skin, at its full size)
local function onScreen() return win ~= nil and win.visible == true and not (win.skin and win.skin.hidden) and win.b[3] > 100 end
-- (the deck as drawn: each board number shown, with its colour (its label's skin); the folded-wing pictures shown, and
-- the one nearest each board number)
local function marks()
  local labs, jets = {}, {}
  for _, c in ipairs(win and win.children or {}) do
    if c.visible and c.kind == 'Static' and c.skin and type(c.skin.tpl) == 'string' and c.skin.tpl:match('^tplBoard') then labs[#labs + 1] = c end
    if c.visible and c.kind == 'Static' and c.skin and type(c.skin.picture) == 'string' and c.skin.picture:match('catcc_jet_') and not c.skin.picture:match('shadow') and c.b[3] > 1 then jets[#jets + 1] = c end
  end
  local out = {}
  for _, l in ipairs(labs) do
    local lx, ly = l.b[1] + l.b[3] / 2, l.b[2] + l.b[4] / 2
    local best, bd
    for _, j in ipairs(jets) do
      local d = math.abs(j.b[1] + j.b[3] / 2 - lx) + math.abs(j.b[2] + j.b[4] / 2 - ly)
      if not bd or d < bd then best, bd = j, d end
    end
    -- (the picture, and the angle it is turned to with its pivot point: "catcc_jet_mine.png at 196 about 42,42")
    local p = best and bd < 60 and best.skin.picture:match('[^\\/]+$') or 'none'
    if p ~= 'none' and best.angle then p = string.format('%s at %d about %d,%d', p, best.angle, best.pivot and best.pivot[1] or -1, best.pivot and best.pivot[2] or -1) end
    out[l.text] = { col = l.skin.tpl:gsub('^tplBoard', ''):lower(), pic = p }
  end
  return #labs, #jets, out
end
local board1 = tostring(D.onSpot(1).board)
local nl, nj, m0 = marks()
local pic
for _, c in ipairs(win and win.children or {}) do
  if c.skin and type(c.skin.picture) == 'string' and c.skin.picture:match('catcc_deck') then pic = c.skin.picture end
end
rec(string.format('picker over DCS: shown %s, cursor %s, deck picture %s; %d board numbers, %d aircraft pictures; spot 1 (%s): %s, %s; Hornet 2 (102): %s',
  tostring(onScreen()), tostring(win and win.cursor), tostring(pic and pic:match('[^\\/]+$')), nl, nj, board1,
  m0[board1] and m0[board1].col or 'none', m0[board1] and m0[board1].pic or 'none', m0['(102)'] and (m0['(102)'].col .. ', ' .. m0['(102)'].pic) or 'none'))
rec('spot 1\'s heading in the report: ' .. string.format('%.1f', SL.map[1] and SL.map[1].hdg or -1))
-- 0b) the user, 2026-11-21: Spawn faded unless the aircraft chosen is the player's to take; his in magenta, green only for
-- a green jet; the demo's counts on the tab row (the status line had no room for them)
local function spawnState() local b for _, c in ipairs(win.children) do if c.kind == 'Button' and c.text == 'Spawn' then b = c end end return string.format('%s%s', tostring(b.skin.tpl), b.disabled and ' disabled' or '') end
local function statusText() for _, c in ipairs(win.children) do if c.kind == 'Static' and c.b[1] == 6 and c.b[2] == 421 then return c.text end end end
local demoLab
for _, c in ipairs(win.children) do if c.kind == 'Static' and c.visible and tostring(c.text):match('^Deck spotting demo') then demoLab = c end end
rec(string.format('nothing chosen: Spawn %s; status one line %s; demo counts at %s: %s', spawnState(), tostring(not tostring(statusText()):find('\n')),
  demoLab and (demoLab.b[1] .. ', ' .. demoLab.b[2]) or 'none', demoLab and (demoLab.text:gsub('%d+', 'N')) or 'none'))
local grayOne
for _, it in ipairs(SL.items()) do if not it.ok and not grayOne then grayOne = it end end
SL.sel = grayOne
frames(1)
rec('a grey one chosen: Spawn ' .. spawnState())
local pressed = pcall(press, 'Spawn')
rec('Spawn pressed anyway: did nothing ' .. tostring(not pressed and SL.spawnWait == nil))
for _, it in ipairs(SL.items()) do if it.slot and it.slot.id == '901' then SL.sel = it end end
frames(1)
rec('Hornet 1 chosen: Spawn ' .. spawnState())
SL.sel = nil
frames(1)
press('Close')
frames(2)
rec('closed: shown ' .. tostring(onScreen()) .. ' (the host still has no slot)')
rec('spot 1: ' .. tostring(stateOf(1)) .. '; spot 18: ' .. tostring(stateOf(18)))
-- 1) refused while its aircraft is in the hangar (and told why); spot 1's stands: no objection
rec('Bob asks for Hornet 2: ' .. tostring(handlerTry(2, 2, '902')) .. ' (' .. tostring(CHAT[#CHAT]) .. ')')
rec('Bob asks for Hornet 1: ' .. tostring(handlerTry(2, 2, '901')))
-- 2) Bob takes Hornet 1: the static on spot 1 is taken away, the slot held for him
local key = D.onSpot(1).key
local function statics()
  local n = 0
  for name in pairs(STATICS) do if name:find('^' .. key:gsub('%-', '%%-') .. ' ') or name == key then n = n + 1 end end
  return n
end
rec('before: statics on spot 1: ' .. statics())
-- (a parked static's pose, as DCS sets it: the gear down (0, 3, 5), the struts part compressed (1, 4, 6); read for the
-- lookalikes a few arguments a frame: crewtest_demo.lua LOOK.scan)
for name, st in pairs(STATICS) do
  if name:find('^catcc%-demo%-a%d+ %d+$') then
    for n, v in pairs({ [0] = 1, [3] = 1, [5] = 1, [1] = 0.4, [4] = 0.35, [6] = 0.35 }) do JETARG[st.id_ .. '/' .. n] = v end
  end
end
D.lookRescan(40)
frames(6)
do
  local line
  for i = #LOG, 1, -1 do if not line and LOG[i]:find('demo: lookalike: a parked static', 1, true) then line = LOG[i] end end
  rec('pose read: ' .. tostring(line):gsub('^.-demo: lookalike: ', ''):gsub('[\r\n]+$', ''))
end
players[2].slot = '901'
frames(3)
rec(string.format('Bob in Hornet 1: statics on spot 1: %d, state %s, held for %s', statics(), tostring(stateOf(1)), tostring(SL.hold['901'] and SL.hold['901'].name)))
-- THE LOOKALIKE in the static's place (crewtest_demo.lua LOOK): its model arguments as the static's (the wings 8, the
-- chocks 23, the board number 442 / 31 / 32)
local function looks()
  local out = {}
  for name, s in pairs(STATICS) do if name:find('^' .. key:gsub('%-', '%%-') .. '%-look ') then out[#out + 1] = { name = name, id = s.id_ } end end
  return out
end
do
  local l = looks()[1]
  local function arg(n) return tostring(l and JETARG[l.id .. '/' .. n]) end
  rec(string.format('Bob in: lookalikes on spot 1: %d; wings %s, chocks %s, covers %s, board %s %s %s', #looks(), arg(8), arg(23), arg(24), arg(442), arg(31), arg(32)))
  rec(string.format('Bob in: its lookalike: gear %s %s %s, struts %s %s %s', arg(0), arg(3), arg(5), arg(1), arg(4), arg(6)))
end
-- 3) Bob leaves (spectators): the static is back, the slot still held for him; the host is refused; released: free
players[2].slot = ''
frames(3)
rec(string.format('Bob out: statics on spot 1: %d, state %s, held for %s', statics(), tostring(stateOf(1)), tostring(SL.hold['901'] and SL.hold['901'].name)))
rec('Bob out: lookalikes on spot 1: ' .. #looks())
rec('the host asks for Hornet 1: ' .. tostring(handlerTry(1, 2, '901')) .. ' (' .. tostring(CHAT[#CHAT]) .. ')')
rec('Bob asks for it again: ' .. tostring(handlerTry(2, 2, '901')))
SL.release('901')
rec('released; the host asks: ' .. tostring(handlerTry(1, 2, '901')))
-- 4) assigned aircraft only
SL.cfg = { assignedOnly = true, assign = { ['Hornet 1'] = 'Bob' } }
rec('assigned to Bob: the host ' .. tostring(handlerTry(1, 2, '901')) .. ', Bob ' .. tostring(handlerTry(2, 2, '901')))
SL.cfg = {}
-- 5) the picker's marks for the host: which can be taken
local items = SL.items()
local ok1, ok18
for _, it in ipairs(items) do
  if it.slot and it.slot.id == '901' then ok1 = it.ok end
  if it.slot and it.slot.id == '902' then ok18 = it.ok end
end
rec(string.format('picker: %d marks; Hornet 1 can be taken %s, Hornet 2 %s', #items, tostring(ok1), tostring(ok18)))
-- 6) the host takes Hornet 1 through the picker: the slot, the static away
SL.sel = nil
for _, it in ipairs(items) do if it.slot and it.slot.id == '901' then SL.sel = it end end
SL.spawnSel()
frames(3)
rec(string.format('the host spawned: his slot %s, statics on spot 1: %d, held for %s', players[1].slot, statics(), tostring(SL.hold['901'] and SL.hold['901'].name)))
-- 7) the host back among the spectators: the picker over DCS's screen again
players[1].slot = ''
frames(3)
rec('the host a spectator again: picker shown ' .. tostring(onScreen()))
-- 8) THE GUI STATE REACHABLE (Config/autoexec.cfg allows net.dostring_in('gui'): the crew test's installer adds that):
-- DCS's slot screen stood in for in a GUI state of its own, up under the picker (shown over it just now). Once the
-- wrap lands, DCS's screen is put away under the picker.
local MSR = { up = true, escs = {}, spectate = true }
function MSR.show() MSR.up = true end
function MSR.hide() MSR.up = false end
function MSR.isVisible() return MSR.up end
function MSR.showInSelectRoleMode() MSR.show() end
-- (DCS's: its close button calls onEsc(): spectating (net.spawn_player) and its screen away; its BRIEFING button
-- onEsc(true): its screen away, no spawn; refused where the server allows no spectators)
function MSR.onEsc(notNetSpawn)
  MSR.escs[#MSR.escs + 1] = notNetSpawn and 'onEsc(true)' or 'onEsc()'
  MSR.hide()
end
function MSR.checkSpectatorExternalViews() return MSR.spectate end
local COAL = { up = false }
function COAL.show(b) COAL.up = b ~= false end
-- (DCS's briefing: its FLY (Fly_onChange, bound to its button when the window is made) calls net.spawn_player and puts
-- the briefing away; the GUI state's own net, as BriefingDialog.lua has it: require('net'))
local BRIEF = {}
SPAWNS = {}
local GNET = setmetatable({ spawn_player = function() SPAWNS[#SPAWNS + 1] = 'at ' .. T end }, { __index = net })
function BRIEF.show(from) BRIEF.shown = from end
function BRIEF.Fly_onChange()
  GNET.spawn_player()
  BRIEF.shown = nil
end
BRIEF.buttonFly = { onChange = BRIEF.Fly_onChange }
local GUI = setmetatable({ package = { loaded = { MultiplayerSelectRole = MSR, MultiplayerSelectCoalitionDialog = COAL,
  MultiplayerSelectRoleDialog = { show = function() end }, BriefingDialog = BRIEF, net = GNET } }, net = GNET,
  DCS = setmetatable({ getPlayerUnitType = function() return 'FA-18C_hornet' end, preloadCockpit = function(t) BRIEF.preloaded = t end }, { __index = DCS }) },
  { __index = _G })
local inMission = net.dostring_in
net.dostring_in = function(state, code)
  if state ~= 'gui' then return inMission(state, code) end
  local r = assert(load(code, 'gui', 't', GUI))()
  return r ~= nil and tostring(r) or nil
end
frames(3)
local function logged(text)
  for i = #LOG, 1, -1 do if LOG[i]:find(text, 1, true) then return (LOG[i]:gsub('[\r\n]+$', '')) end end
end
rec('the GUI state reached: ' .. tostring(logged('slots: DCS\'s slot screen, in the GUI state: ')))
rec('FLY wrapped: ' .. tostring(logged('slots: FLY, in the GUI state: ')))
rec(string.format('wrapped: picker shown %s, DCS\'s screen up %s', tostring(onScreen()), tostring(MSR.up)))
-- 9) the picker's Close: DCS's own close (onEsc: spectating); DCS asks for its screen again (its Esc menu's "Choose
-- Slot"): nothing drawn, the picker instead
press('Close')
frames(1)
rec(string.format('Close: DCS\'s own close %s, picker shown %s', table.concat(MSR.escs, ' '), tostring(onScreen())))
MSR.showInSelectRoleMode()
frames(2)
rec(string.format('DCS asked again: DCS\'s screen up %s, picker shown %s', tostring(MSR.up), tostring(onScreen())))
-- 10) the hook not looking for a while (a long stall, its mission over): the lease runs out, DCS's screen is DCS's again
T = T + 4
COAL.show(true)
rec('4 s without a look: DCS\'s coalition dialog drawn ' .. tostring(COAL.up))
COAL.up = false
frames(1)
-- 11) the picker's "DCS slot list": DCS's own screen at once, nothing held back any more; the picker away
press('DCS slot list')
frames(2)
COAL.show(true)
rec(string.format('DCS slot list: DCS\'s screen up %s, its coalition dialog drawn %s, picker shown %s', tostring(MSR.up), tostring(COAL.up), tostring(onScreen())))
-- 11b) ... for that once: DCS's own screen closed (spectating), its Esc menu's "Choose Slot" brings the picker again
-- (the user, 2026-11-20: "I would like the ESC menu 'Choose Slot' option to bring them back to the new UI")
MSR.up = false
frames(1)
MSR.showInSelectRoleMode()
frames(1)
rec(string.format('DCS\'s own screen closed, then "Choose Slot": DCS\'s screen up %s, picker shown %s', tostring(MSR.up), tostring(onScreen())))
-- 12) asked for again (the Tow page's "Slot picker"), after being put away four times: it comes up; no window of ours
-- was ever made invisible
SL.showPicker(true)
frames(1)
rec(string.format('asked for again: picker shown %s, DCS\'s screen up %s; windows made invisible: %d', tostring(onScreen()), tostring(MSR.up), SET_INVISIBLE or 0))
-- 13) the way back to DCS's own slot screen whatever is on the screen: Ctrl+Shift+F8 (done at the next frame)
HOTKEYS['Ctrl+Shift+F8']()
frames(1)
rec(string.format('Ctrl+Shift+F8: DCS\'s screen up %s, picker shown %s', tostring(MSR.up), tostring(onScreen())))
-- 14) DCS's own screen closed again; "Choose Slot": the picker. The server allows no spectators: Close refused, as DCS's
-- own close is (the picker stays)
MSR.up = false
frames(1)
MSR.showInSelectRoleMode()
frames(1)
MSR.spectate, MSR.escs = false, {}
press('Close')
frames(1)
rec(string.format('no spectators: Close %s, picker shown %s', #MSR.escs == 0 and 'refused' or table.concat(MSR.escs, ' '), tostring(onScreen())))
MSR.spectate = true
-- 15) Spawn: the slot taken (net.set_slot), then DCS's briefing as DCS's own BRIEFING button opens it (onEsc(true), the
-- cockpit preloaded, the briefing 'Menu'); its FLY puts the player in the jet
-- (the mission asked what stands on a spot (S.staticOn): every static the mission script has made, where it is)
do
  local own = MISSION.Unit.getByName
  MISSION.Unit.getByName = function(n) if n == 'CVN-72' then return CV end return own(n) end
  MISSION.coalition.getStaticObjects = function(side)
    local out = {}
    for name, s in pairs(side == 2 and STATICS or {}) do
      out[#out + 1] = { isExist = function() return STATICS[name] ~= nil end, getName = function() return name end, getPoint = function() return s.getPosition().p end }
    end
    return out
  end
end
-- (spot 1's static back: step 6's Spawn took it away (static first) and its slot came to the host as the rig moved on)
D.unman(1)
frames(1)
rec(string.format('before Spawn: statics on spot 1: %d, state %s', statics(), tostring(stateOf(1))))
SL.sel = nil
for _, it in ipairs(SL.items()) do if it.slot and it.slot.id == '901' then SL.sel = it end end
press('Spawn')
frames(1)
-- (DCS'S FLY HELD: the slot at once, the static standing until his FLY: the user, 2026-11-23, "tighten the delay
-- between removing the static and spawning the actual aircraft")
rec(string.format('Spawn pressed: slot "%s", its static taken away %s, reserved for %s', players[1].slot, tostring(D.onSpot(1).manned == true), tostring(SL.hold['901'] and SL.hold['901'].name)))
frames(3)
rec(string.format('Spawn: slot %s; DCS %s, cockpit %s, briefing %s; picker shown %s', players[1].slot, table.concat(MSR.escs, ' '), tostring(BRIEF.preloaded), tostring(BRIEF.shown), tostring(onScreen())))
rec(string.format('in the briefing 3 s: statics on spot 1: %d, spawned %d', statics(), #SPAWNS))
-- (what the mission says stands on spot 1's place, and on a place 10 m off it)
local sp1 = SL.spotPos[1]
rec(string.format('on spot 1: %s; 10 m off it: "%s"', tostring(SL.staticOn('CVN-72', sp1, 3)), tostring(SL.staticOn('CVN-72', { x = sp1.x + 10, z = sp1.z }, 3))))
-- his FLY, as DCS calls it (the button bound when the briefing was made): noted, not done; the briefing stays up
BRIEF.buttonFly.onChange()
frames(0.25)
rec(string.format('FLY pressed: spawned %d, statics on spot 1: %d, briefing up %s', #SPAWNS, statics(), tostring(BRIEF.shown ~= nil)))
local flyT = T
frames(0.75)
rec(string.format('FLY + 1 s: spawned %d, statics on spot 1: %d', #SPAWNS, statics()))
frames(1)
rec(string.format('FLY + 2 s: spawned %d (%s s after FLY), statics on spot 1: %d, briefing up %s', #SPAWNS, SPAWNS[1] and tostring(tonumber(SPAWNS[1]:match('[%d.]+')) - flyT) or '-', statics(), tostring(BRIEF.shown ~= nil)))
rec('FLY asked: ' .. tostring(logged("slots: FLY: Hornet 1: DCS's FLY asked for")):gsub('^.-(slots: )', '%1'))
rec('FLY: ' .. tostring(logged('slots: FLY: Hornet 1: the spot')):gsub('^.-slots: ', ''))
rec('FLY: ' .. tostring(logged('slots: FLY: Hornet 1: DCS\'s FLY made')):gsub('^.-slots: ', ''))
-- (the lookalike stands until an aircraft is on the spot: the rig has no live jet, so one is said to be there)
rec(string.format('FLY + 2 s: lookalikes on spot 1: %d', #looks()))
do
  local jetOn = SL.jetOn
  SL.jetOn = function(carrier, sp, r) return (sp == SL.spotPos[1] and r == 3) and 'Host' or '' end
  frames(0.25)
  SL.jetOn = jetOn
end
rec(string.format('his jet on spot 1: lookalikes on spot 1: %d; %s', #looks(), tostring(logged('slots: lookalike: Hornet 1')):gsub('^.-slots: ', '')))
-- (nothing held: DCS's own FLY at once)
BRIEF.buttonFly.onChange()
rec('FLY again, nothing held: spawned ' .. #SPAWNS)
-- WHAT EACH FLY SAYS (what aimTick reports: the rig has no native module to aim with): how long its spot stood empty,
-- of that the wait, the check and aim, and DCS; whether updobs ran
do
  local f = { state = 'spawning', sl = { name = 'Hornet 1' }, settle = 0, goneT = T - 2.5, at = T - 2.5, goT = T - 2.5, gap = 2.4, refresh = 'yes' }
  SL.flyResult(f, 'landed', T)
  rec('result: ' .. f.state .. '; ' .. tostring(logged('slots: FLY: Hornet 1: ON ITS SPOT')):gsub('^.-slots: ', ''))
end
-- 16) THE TWO RELEASES (the user, 2026-11-20: Release slot unseats as DCS's own does; a separate release of a player's
-- reservation on a spotted aircraft; "visually distinct and physically separate ... Both should have confirmations").
-- In the jet, back to the picker through "Choose Slot": Release slot shown (amber), Release reservation not (he is in it)
function MSR.releaseSlot() players[1].slot = '' end
frames(3)
MSR.showInSelectRoleMode()
frames(1)
local function btn(text)
  for _, c in ipairs(win.children or {}) do
    if c.kind == 'Button' and c.text == text then return c end
  end
end
local function shownBtn(text) local b = btn(text) return b ~= nil and b.visible == true end
SL.sel = nil
for _, it in ipairs(SL.items()) do if it.slot and it.slot.id == '901' then SL.sel = it end end
frames(1)
rec(string.format('in the jet: picker shown %s; Release slot shown %s (%s at %d, %d), Release reservation shown %s',
  tostring(onScreen()), tostring(shownBtn('Release slot')), tostring(btn('Release slot').skin.tpl), btn('Release slot').b[1], btn('Release slot').b[2], tostring(shownBtn('Release reservation'))))
-- asked first; No: nothing done
press('Release slot')
frames(1)
local askText
for _, c in ipairs(win.children or {}) do if c.visible and c.skin and c.skin.tpl == 'tplAsk' then askText = c.text end end
rec('Release slot asks: ' .. tostring(askText))
press('No')
frames(1)
rec('No: his slot ' .. players[1].slot)
-- Yes: DCS's own Release Slot: to the spectators; the static back, still reserved for him
press('Release slot')
frames(1)
press('Yes')
frames(3)
rec(string.format('Yes: his slot "%s", spot 1 %s, reserved for %s', players[1].slot, tostring(stateOf(1)), tostring(SL.hold['901'] and SL.hold['901'].name)))
-- out of the jet: Release reservation shown (red, at the far left), asked first; Yes: anyone may take it
frames(1)
rec(string.format('out of it: Release reservation shown %s (%s at %d, %d), Release slot shown %s',
  tostring(shownBtn('Release reservation')), tostring(btn('Release reservation').skin.tpl), btn('Release reservation').b[1], btn('Release reservation').b[2], tostring(shownBtn('Release slot'))))
press('Release reservation')
frames(1)
for _, c in ipairs(win.children or {}) do if c.visible and c.skin and c.skin.tpl == 'tplAsk' then askText = c.text end end
rec('Release reservation asks: ' .. tostring(askText))
press('Yes')
frames(1)
rec('Yes: reserved for ' .. tostring(SL.hold['901'] and SL.hold['901'].name))
-- 17) SMOOTHLY: halfway between two reports an aircraft is drawn halfway, its heading turned halfway the short way
-- round (350 to 10 through 0), both together; done when the time between the reports has passed
local px, pz, ph, pm = SL.pose({ fx = 0, fz = 0, fh = 350, tx = 10, tz = 4, th = 10, t0 = 100, dt = 1 }, 100.5)
local qx, qz, qh, qm = SL.pose({ fx = 0, fz = 0, fh = 350, tx = 10, tz = 4, th = 10, t0 = 100, dt = 1 }, 101.2)
rec(string.format('smoothly: halfway %.1f, %.1f, %.1f, moving %s; after %.1f, %.1f, %.1f, moving %s', px, pz, ph, tostring(pm), qx, qz, qh, tostring(qm)))
-- 17b) THE LOOKALIKE TEST (F10 > "CATCC demo: lookalike: swap the nearest aircraft"; crewtest_demo.lua M.lookswap): one
-- aircraft standing on its spot, each press the next: its lookalike of the first kind, of the second, its static again
do
  local made = {}
  for i = 1, 3 do
    local n0 = #REC
    D.lookswap()
    frames(0.25)
    for j = n0 + 1, #REC do
      if REC[j]:find('lookalike test: ', 1, true) then made[i] = (REC[j]:gsub('^.-lookalike test: ', '')) end
    end
  end
  for i = 1, 3 do rec('lookalike test ' .. i .. ': ' .. tostring(made[i])) end
end
-- 18) SPOT DECK (the user, 2026-11-21: started from the slot screen, the demo found "no aircraft carrier within 5 km"
-- of the camera): the demo stopped, the camera 20 km away; the picker's Spot Deck (the host's) starts it on the
-- carrier the picker shows, by name; hidden while it runs
HOTKEYS['Ctrl+Shift+F9']()
frames(3)
T = T + 6
CAMAT = { f = 20000, s = 0, up = 300 }
frames(1)
rec('demo stopped: Bob asks for Hornet 1: ' .. tostring(handlerTry(2, 2, '901')) .. ' (' .. tostring(CHAT[#CHAT]) .. ')')
local spotShown = shownBtn('Spot Deck')
local sb = btn('Spot Deck')
rec(string.format('demo stopped: running %s; Spot Deck shown %s (at %d, %d)', tostring(D.on), tostring(spotShown), sb and sb.b[1] or -1, sb and sb.b[2] or -1))
-- the carriers' tabs: every carrier of the mission (CVN-73: no slots); a click shows its deck
local function tab(name) local b = btn(name) return b and (tostring(b.skin and b.skin.tpl) .. (b.visible and '' or ' hidden')) or 'none' end
local function boards() local n = marks() return n end
rec(string.format('tabs: CVN-72 %s at %d, %d; CVN-73 %s at %d, %d', tab('CVN-72'), btn('CVN-72').b[1], btn('CVN-72').b[2], tab('CVN-73'), btn('CVN-73').b[1], btn('CVN-73').b[2]))
press('CVN-73')
frames(1)
rec(string.format('CVN-73 clicked: tabs CVN-72 %s, CVN-73 %s; board numbers %d', tab('CVN-72'), tab('CVN-73'), boards()))
press('CVN-72')
frames(1)
rec(string.format('CVN-72 clicked: tabs CVN-72 %s, CVN-73 %s; board numbers %d', tab('CVN-72'), tab('CVN-73'), boards()))
press('Spot Deck')
frames(3)
rec(string.format('Spot Deck: running %s on %s; Spot Deck shown %s', tostring(D.on), tostring(D.ship), tostring(shownBtn('Spot Deck'))))
-- 19) THE VIEW BEHIND THE PICKER (the user, 2026-11-23: the carrier in the outside view below the picker's window, not
-- the map: crewtest_slots.lua VIEW, S.view). The picker is up and the host has no slot: the ship view asked for (view
-- command 13), the camera put beside the carrier the picker shows every frame.
do
  local V = SL.view
  -- (a point of the world on the screen of a camera as DCS has it: its axes x forward, y up, z right; the field of
  -- view 78 degrees across the screen's width)
  local function onscreen(cp, w, sw, sh)
    local d = { x = w.x - cp.p.x, y = w.y - cp.p.y, z = w.z - cp.p.z }
    local function dot(a) return d.x * a.x + d.y * a.y + d.z * a.z end
    local th = math.tan(math.rad(78) / 2)
    return sw / 2 + dot(cp.z) / (dot(cp.x) * th) * sw / 2, sh / 2 - dot(cp.y) / (dot(cp.x) * th * sh / sw) * sh / 2
  end
  local function ends(ox, oz)
    local sx, sy = onscreen(CAMPUT, toWorld(-164, 20, 0, ox, oz), 2560, 1600)
    local bx, by = onscreen(CAMPUT, toWorld(168, 20, 0, ox, oz), 2560, 1600)
    return string.format('stern at %.0f, %.0f, bow at %.0f, %.0f', sx, sy, bx, by)
  end
  frames(10)
  local wx, wy, ww, wh = win:getBounds()
  rec(string.format('view: held %s, view commands %s; the window at %d, %d (%d x %d); the camera level %s, %.0f m up; on the screen: %s',
    tostring(V.held), table.concat(VIEWCMDS, ' '), wx, wy, ww, wh, tostring(math.abs(CAMPUT.z.y) < 1e-9), CAMPUT.p.y, ends()))
  rec('view: ' .. tostring(logged('view: HOLDS')):gsub('^.-(HOLDS: %d+ frames after view command %d+).*$', '%1'))
  -- the ship sails 50 m on and turns 90 degrees: the camera is put with it the same frame
  local sx0, sz0, hc0 = SX, SZ, HC
  SX, SZ = SX + 50 * shipX.x, SZ + 50 * shipX.z
  frames(0.25)
  rec('view: the ship 50 m on: ' .. ends())
  -- the window dragged 300 pixels down: the ship goes down the screen with the free part below it
  win:setBounds(wx, wy + 300, ww, wh)
  frames(0.25)
  rec('view: the window 300 lower: ' .. ends())
  win:setBounds(wx, wy, ww, wh)
  -- zoomed in (the field of view 40 degrees): the camera stands further off, the picture stays
  local p0 = CAMPUT.p.y
  FOV = 40
  frames(0.25)
  rec(string.format('view: field of view 40: the camera %.1f times as high', CAMPUT.p.y / p0))
  FOV = 78
  SX, SZ = sx0, sz0
  -- another carrier's tab (CVN-71, 3 km north): the camera goes there; one that is not in the mission's world
  -- (CVN-73): the camera is left where it is
  TWO_SHIPS = true
  SL.carriers[#SL.carriers + 1] = 'CVN-71'
  SL.carrierIx = #SL.carriers
  frames(0.25)
  rec('view: CVN-71 chosen: ' .. ends(SX + 3000, SZ))
  local n0 = CAMPUTS
  SL.carrierIx = 2
  frames(1)
  rec(string.format('view: CVN-73 chosen (not there): held %s, the camera put %d times; said: %s', tostring(V.held), CAMPUTS - n0, tostring(logged('could not be asked') ~= nil)))
  SL.carrierIx = 1
  table.remove(SL.carriers)
  frames(0.25)
  -- in his aircraft: given up (nothing put, no view command: DCS's cockpit view); a spectator again: taken again
  local nc = #VIEWCMDS
  players[1].slot = '901'
  frames(1)
  n0 = CAMPUTS
  frames(1)
  rec(string.format('view: in his aircraft: held %s, the camera put %d times, view commands sent %d (%s)', tostring(V.held), CAMPUTS - n0, #VIEWCMDS - nc,
    tostring(logged('view: given up')):match('given up %((.-)%)')))
  players[1].slot = ''
  frames(3)
  rec(string.format('view: a spectator again: picker shown %s, held %s, view commands %s', tostring(onScreen()), tostring(V.held), table.concat(VIEWCMDS, ' ')))
  -- DCS's own slot list: given up
  press('DCS slot list')
  frames(1)
  rec(string.format('view: DCS slot list: held %s (%s)', tostring(V.held), tostring(logged('view: given up')):match('given up %((.-)%)')))
  -- THE FIRST VIEW ASKED FOR (16, the free camera) DOES NOT KEEP THE CAMERA: the ship view (13) next, which does
  VIEWCMDS, VIEW_NOW, VIEW_HOLDS, CAMSET = {}, 15, { [13] = true }, nil
  SL.showPicker(true)
  frames(20)
  rec(string.format('view: the ship view does not hold: view commands %s, held %s; %s', table.concat(VIEWCMDS, ' '), tostring(V.held),
    tostring(logged('view: HOLDS')):gsub('^.-(HOLDS: %d+ frames after view command %d+).*$', '%1')))
  -- NEITHER DOES: said once, the camera left alone for the rest of the mission
  SL.hidePicker()
  frames(1)
  VIEWCMDS, VIEW_NOW, VIEW_HOLDS, CAMSET = {}, 15, {}, nil
  SL.showPicker(true)
  frames(20)
  n0 = CAMPUTS
  frames(2)
  rec(string.format('view: no view holds: view commands %s, held %s, the camera put %d times since', table.concat(VIEWCMDS, ' '), tostring(V.held), CAMPUTS - n0))
  -- THE PICTURE at other screens (the window at the top, its lower edge at row 532; 78 degrees across the width): the
  -- hull's box (waterline to flight deck, both sides, both ends) on the screen
  for _, s in ipairs({ { 1920, 1080 }, { 2560, 1440 }, { 2560, 1600 }, { 3440, 1440 }, { 3840, 2160 }, { 1600, 1200 } }) do
    local sw, sh = s[1], s[2]
    local q = V.frame(sw, sh, 532, 78)
    local sx, sy = V.project(q, { -164, 20, 0 })
    local bx, by = V.project(q, { 168, 20, 0 })
    rec(string.format('picture %d x %d: bow right of stern %s; the length %.2f of the width, its ends at %d and %d; the hull %d to %d across, %d to %d down; the camera %d m off, looking down %.1f',
      sw, sh, tostring(bx > sx and math.abs(by - sy) < 1), (bx - sx) / sw, sx, bx, q.x0, q.x1, q.y0, q.y1, q.range, q.pitch))
  end
end
-- 20) THE FIRST-SPAWN TEST'S SERIES (crewtest_slots.lua FIRST, S.firstStart): each mission start runs the next case;
-- a start that finds "started" as the last line writes "froze" and the series stops there
do
  local path = 'W/Logs/catcc-firstspawn-test.txt'
  SL.firstFile, SL.firstOn = path, true -- (the series is off in the file since it was done, 2026-11-24)
  SL.firstDone = nil -- (as at a mission's start: step 15's FLY was this mission's first)
  -- (the file, as the harness keeps its files: in memory; written, appended to, read by lines)
  local text, own = nil, io.open
  io.open = function(p, mode)
    if p ~= path then return own(p, mode) end
    mode = mode or 'r'
    if mode == 'r' then
      if not text then return nil end
      local t = text
      return { lines = function() return t:gmatch('([^\n]*)\n') end, close = function() end }
    end
    if mode == 'w' or not text then text = '' end
    return { write = function(_, ...) text = text .. table.concat({ ... }) end, close = function() end }
  end
  local function lines()
    local out, f = {}, io.open(path, 'r')
    if not f then return 'no file' end
    for l in f:lines() do out[#out + 1] = (l:gsub('^.-case', 'case')) end
    f:close()
    return table.concat(out, ' / ')
  end
  local function add(l)
    local f = assert(io.open(path, 'a'))
    f:write('2026-11-24 00:00:00 ' .. l .. '\n')
    f:close()
  end
  do local f0 = io.open(path, 'w') if f0 then f0:close() end end
  SL.firstStart()
  rec('series, an empty file: case ' .. tostring(SL.first and SL.first.n) .. ' at ' .. tostring(SL.first and SL.first.at) .. ' s; the hold ' .. SL.notBefore() .. ' s')
  add('case 1 at=25s started (test)')
  add('case 1 at=25s landed (DCS 6.0 s)')
  SL.firstStart()
  rec('series, case 1 landed: case ' .. tostring(SL.first and SL.first.n) .. ' at ' .. tostring(SL.first and SL.first.at) .. ' s')
  add('case 2 at=20s started (test)')
  SL.firstStart()
  rec('series, case 2 started and never finished: case ' .. tostring(SL.first and SL.first.n) .. '; the hold ' .. SL.notBefore() .. ' s; the file: ' .. lines())
  SL.firstStart()
  rec('series, the next start: case ' .. tostring(SL.first and SL.first.n) .. '; the file: ' .. lines())
  io.open = own
  SL.first, SL.firstFile, SL.firstOn = nil, nil, nil
  -- (and with the series off, as installed: no case, no hold)
  SL.firstDone, SL.firstAsked = nil, nil
  rec('series off: the hold ' .. SL.notBefore() .. ' s, case ' .. tostring(SL.first and SL.first.n))
end
