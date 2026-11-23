-- CATCC director test, spots part for GroundCrew.lua. director-test.ps1 -Spawn Spots appends this, wrapped
-- in "do ... end", to the end of CoreMods/tech/USS_Nimitz/scripts/GroundCrew.lua, alongside the 40 spawn
-- routes it puts in USS_Nimitz_RunwaysAndRoutes.lua (director-spots.lua).
--
-- DCS's take-off crew (the yellow shirts of the "deck crew" option) keeps one hand-off list per spawn
-- route (takeoff_crew.takeoff_tasks, 16 as shipped) and takes the list of the jet's route without
-- checking there is one: a route without a list crashed DCS on the first simulation step (2026-11-14,
-- with an emptied list). With 40 routes the lists 17..40 would be missing, so each is given one of the
-- stock lists (in rotation). That only keeps DCS alive with the deck crew option ON: the yellow shirts
-- would then direct a jet along a stock spot's hand-offs, which is wrong for the new spot. The spots
-- are meant for the deck crew option OFF (the squadron's setup), where the take-off crew does not exist.
-- Plain Lua 5.1 (DCS); also run under fengari by the tests.

-- (44: DCS's own first four routes, kept in front, and the plan's 40 after them: spots.gen.ts SPAWN_OFFSET)
local SPOTS = 44

local tt = takeoff_crew and takeoff_crew.takeoff_tasks
if type(tt) == 'table' and #tt > 0 then
  local stock = #tt
  for n = stock + 1, SPOTS do tt[n] = tt[((n - 1) % stock) + 1] end
end
