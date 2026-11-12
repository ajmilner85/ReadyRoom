-- CATCC launch gate (cockpit device, one per aircraft).
--
-- The deck crew's launch sequence (common.xml, patched by install.ps1) waits after your salute
-- while this aircraft's draw argument GATE_ARG reads above 0.5. This device sets it:
--   1 = held (PriFly hasn't cleared you), 0 = go (the stock behaviour).
-- The GUI hook (Scripts/Hooks/CATCC-pilot-hook.lua) sends CMD_GATE with value 1 or 0 every couple of
-- seconds. Fail-open: if it stops (no mod hook, lost connection, no room), the gate opens by itself.
--
-- Salutes: the hook looks up the number of the pilot-salute command (whatever key it's bound to) and
-- sends it with CMD_SALUTE_ID; this device then listens for it. For SALUTE_S after a salute the
-- argument reads 0.75 (held) or 0.25 (not held): the same side of 0.5, so the gate is unaffected,
-- and the hook sees the salute and reports it to PriFly.
--
-- GATE_ARG and CMD_GATE must match the hook and the common.xml patch (install.ps1 writes all three).

local GATE_ARG = 997      -- spare external model argument (must be unused by the aircraft's model)
local CMD_GATE = 11873    -- custom command id, sent by the hook with LoSetCommand
local CMD_SALUTE_ID = 11874 -- the hook tells us the salute command's number
local STALE_S = 15        -- no word from the hook for this long: open the gate
local SALUTE_S = 3
-- iCommandPilotGestureSalute in DCS 2.9.31 (the hook's lookup logged it). Listened for from load: a
-- listen added later, when the hook passes the number, did not seem to take.
local SALUTE_CMD = 238
-- Chocks drawn while PriFly holds them (the hook sends CMD_CHOCKS 1/0). Hornet model: 23 = main gear
-- chocks (the nose wheel's argument, if it has one, goes here too). Set to 1 while shown; 0 once when
-- they go, then left alone (DCS may drive them itself for real chocks).
local CMD_CHOCKS = 11875
local CHOCK_ARGS = { 23 }

local dev = GetSelf()
local held = false
local lastWord = -1e9
local clock = 0
local saluteId = SALUTE_CMD
local salutedUntil = -1e9
local chocks = false
local chocksWord = -1e9

make_default_activity(0.5)

local function value()
  local saluted = clock < salutedUntil
  if held then return saluted and 0.75 or 1 end
  return saluted and 0.25 or 0
end

local function apply()
  set_aircraft_draw_argument_value(GATE_ARG, value())
  if chocks then for _, a in ipairs(CHOCK_ARGS) do set_aircraft_draw_argument_value(a, 1) end end
end

local function setChocks(on)
  if on == chocks then return end
  chocks = on
  if not on then for _, a in ipairs(CHOCK_ARGS) do set_aircraft_draw_argument_value(a, 0) end end
  apply()
end

function post_initialize()
  held = false
  apply()
end

dev:listen_command(CMD_GATE)
dev:listen_command(CMD_SALUTE_ID)
dev:listen_command(SALUTE_CMD)
dev:listen_command(CMD_CHOCKS)
local listening = { [SALUTE_CMD] = true }

function SetCommand(command, v)
  if command == CMD_GATE then
    lastWord = clock
    local want = v > 0.5
    if want ~= held then
      held = want
      apply()
    end
  elseif command == CMD_SALUTE_ID then
    local id = math.floor(v + 0.5)
    -- a different number (a future DCS version): listen for that too
    if id > 0 and not listening[id] and id ~= CMD_GATE and id ~= CMD_SALUTE_ID then
      listening[id] = true
      saluteId = id
      dev:listen_command(id)
    end
  elseif command == CMD_CHOCKS then
    chocksWord = clock
    setChocks(v > 0.5)
  elseif command == SALUTE_CMD or command == saluteId then
    salutedUntil = clock + SALUTE_S
    apply()
  end
end

function update()
  clock = clock + 0.5
  if held and clock - lastWord > STALE_S then held = false end
  if chocks and clock - chocksWord > STALE_S then setChocks(false) end
  -- keep it set: some models reset unused arguments
  apply()
end

need_to_be_closed = false
