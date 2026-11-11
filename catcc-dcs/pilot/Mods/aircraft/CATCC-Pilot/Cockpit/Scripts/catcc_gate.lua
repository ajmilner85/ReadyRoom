-- CATCC launch gate (cockpit device, one per aircraft).
--
-- The deck crew's launch sequence (common.xml, patched by install.ps1) waits after your salute
-- while this aircraft's draw argument GATE_ARG reads above 0.5. This device sets it:
--   1 = held (PriFly hasn't cleared you), 0 = go (the stock behaviour).
-- The GUI hook (Scripts/Hooks/CATCC-pilot-hook.lua) sends CMD_GATE with value 1 or 0 every couple of
-- seconds. Fail-open: if it stops (no mod hook, lost connection, no room), the gate opens by itself.
--
-- GATE_ARG and CMD_GATE must match the hook and the common.xml patch (install.ps1 writes all three).

local GATE_ARG = 997   -- spare external model argument (must be unused by the aircraft's model)
local CMD_GATE = 11873 -- custom command id, sent by the hook with LoSetCommand
local STALE_S = 15     -- no word from the hook for this long: open the gate

local dev = GetSelf()
local held = false
local lastWord = -1e9
local clock = 0

make_default_activity(0.5)

local function apply(v)
  held = v
  set_aircraft_draw_argument_value(GATE_ARG, v and 1 or 0)
end

function post_initialize()
  apply(false)
end

dev:listen_command(CMD_GATE)

function SetCommand(command, value)
  if command == CMD_GATE then
    lastWord = clock
    local want = value > 0.5
    if want ~= held then apply(want) end
  end
end

function update()
  clock = clock + 0.5
  if held and clock - lastWord > STALE_S then apply(false) end
  -- keep it set: some models reset unused arguments
  set_aircraft_draw_argument_value(GATE_ARG, held and 1 or 0)
end

need_to_be_closed = false
