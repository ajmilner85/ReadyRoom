-- CATCC crew test, data part. director-test.ps1 -Crew Draw|People|Full|Extra appends this, wrapped in
-- "do ... end" after a line `local CATCC_CREW = 'draw' | 'people' | 'full' | 'extra'`, to the end of
-- CoreMods/tech/USS_Nimitz/scripts/GroundCrew.lua (the file DCS runs to set up the Supercarrier's crews;
-- its globals are read after it has run, and its file-level locals, the wand models and transforms, are
-- still in scope here). full = draw + people; the two halves exist so one can be dropped if it upsets DCS.
-- extra = full + items 3 and 4 below.
--
-- draw and full:
--   1. DCS's own crew debug drawing switched on: GroundCrew.lua ships with this block commented out, and
--      the shipped animator_logic.dll still reads these settings. Whether a release build draws anything
--      is the test.
-- people and full:
--   2. One person of ours added to the take-off crew: "catcc-00", a green shirt standing at 14 m forward,
--      27 m to starboard (7 m clear of every taxi route, between spawn spots 1 and 5, where no green
--      shirt stands otherwise). Declared exactly as the cat crews' green shirts are, with the wands every
--      take-off crew member gets. Not in any hand-off list: nothing native should ever send him anywhere.
--      Test: can people be added by data alone, and is he there with the deck crew option off?
--      (Result 2026-11-14: he is there and takes orders with the option on; with it off the whole
--      take-off crew, he included, does not exist: only the four catapult crews do.)
-- extra only:
--   3. "catcc-c0" .. "catcc-c3": four more members in catapult crew 1's own list (seven to ten), each
--      declared with every field a catapult crew member has (the field set of crew 4's "white2", who has
--      no routes either). The catapult crews exist with the deck crew option off. Nothing in the crew's
--      behaviour tree (common.xml) names them.
--      Result 2026-11-14 with one such member (catcc-c0), deck crew option OFF: the mission loaded, he
--      was there (25 people on the ship: the 24 catapult crew and him), walked 35 m to the point, took
--      the light wands and every signal. Still to see: catapult 1's crew launching a jet with the extra
--      members in its list, and four of them instead of one.
--   (Tried the same day and dropped: a "static_crew" list with one member. GroundCrew.lua has
--   `static_crew = crews.static_crew`, crew.lua ships no such list, DCS's ModelViewer reads it with the
--   take-off crew's member loader; the game created nobody from it with the deck crew option off.)
--
-- NOT done any more (it crashed DCS, 2026-11-14): emptying a route's hand-off list (takeoff_tasks[n]).
-- The take-off crew's update takes the first hand-off of the jet's route without checking there is one:
-- with spawn spot 1's list emptied and the player's jet on spot 1, DCS died on the first simulation
-- step (read of address 0 in Flight.dll; the crash dump shows route 1's record with an empty list next
-- to its brown_id 14). Every route must keep at least one hand-off entry. The hand-off lists are left
-- exactly as DCS ships them.
-- Plain Lua 5.1; also run under fengari on DCS's own GroundCrew.lua by catcc-dcs/test/crewtest.test.ts.

if CATCC_CREW ~= 'people' then
  environment_options.DebugDraw =
  {
    draw_tail             = true,
    draw_shell            = true,
    draw_goal             = true,
    show_labels           = true,
    show_nav_grid         = false,
    show_scene_objs       = false,
    show_env_box          = false,
    show_static_obstacles = true,
    show_agent_neighbours = false,
    show_agent_obstacles  = true,
    route_height          = 1.0,
  }
end

if CATCC_CREW ~= 'draw' then
  local id = #takeoff_crew.members + 1
  takeoff_crew.members[id] =
  {
    animation = 'idle',
    model_name = 'carrier_shooter',
    unit_type = 'us carrier shooter',
    livery = 'green',
    name = 'catcc-00',
    position = { 14.0, 20.1494140625, 27.0, 0 },
    fast_start_position = { 0, 0, 0, 0 },
  }
  add_gpu_attachment(takeoff_crew, id, 'RightStick', '__conn_hand_R', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
  add_gpu_attachment(takeoff_crew, id, 'LeftStick', '__conn_hand_L', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
  add_light_attachment(takeoff_crew, id, 'LeftLight', '__conn_hand_L', light_transform, light_yellow_color)
  add_light_attachment(takeoff_crew, id, 'RightLight', '__conn_hand_R', light_transform, light_yellow_color)
end

if CATCC_CREW == 'extra' or CATCC_CREW == 'model' then
  local function wands(list, id)
    add_gpu_attachment(list, id, 'RightStick', '__conn_hand_R', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
    add_gpu_attachment(list, id, 'LeftStick', '__conn_hand_L', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
    add_light_attachment(list, id, 'LeftLight', '__conn_hand_L', light_transform, light_yellow_color)
    add_light_attachment(list, id, 'RightLight', '__conn_hand_R', light_transform, light_yellow_color)
  end

  -- 14 m forward, 29 / 31 / 33 m to starboard, and 16 m forward, 29 m to starboard: each at least
  -- 7 m clear of every taxi route and 8 m of every spawn spot
  local spots = { { 14.0, 29.0 }, { 14.0, 31.0 }, { 14.0, 33.0 }, { 12.0, 29.0 } }
  for i, at in ipairs(spots) do
    local cid = #crew[1].members + 1
    crew[1].members[cid] =
    {
      animation = 'idle',
      model_name = 'carrier_shooter',
      unit_type = 'us carrier shooter',
      livery = 'yellow', -- flight directors: yellow shirts (asked for 2026-11-15; green until then)
      name = 'catcc-c' .. (i - 1),
      decal_index = { 0, 2 },
      position = { at[1], 20.1494140625, at[2], 0 },
      fast_start_position = { at[1], 20.1494140625, at[2], 0 },
      routes = {},
    }
    wands(crew[1], cid)
  end
end

if CATCC_CREW == 'model' then
  -- 5. "catcc-m0": the plane captain, one more member of catapult crew 1: a BROWN shirt (DCS's own crew
  --    figure with the brown livery its take-off crew's plane captains wear), with the light wands. At 12 m
  --    forward, 31 m to starboard (off elevator 1's platform, as all of ours now are). (Until 2026-11-15 he was the test of a character model of our own, the
  --    pilot figure: that worked, and the descriptor is still in our mod.)
  -- 6. "catcc-t0": the tow tractor's driver, one more member: a BLUE shirt (the user, 2026-11-17: blue
  --    shirts drive the deck tractors), at 12 m forward, 33 m to starboard. The livery "blue" is DCS's own:
  --    crew.lua dresses its crews in yellow, brown, white, green and the shooter's default only, but ED's
  --    missions give the static of this same figure (type "us carrier shooter", shape carrier_shooter) the
  --    liveries blue, purple and red as well (22 times blue in the Supercarrier's and the F/A-18C's
  --    missions). NOT YET SEEN on an animated crew member. (Green until then.)
  -- 7. "catcc-t1" .. "catcc-t7": seven more tractor drivers, blue shirts as he is, for the deck spotting demo
  --    (2026-11-17: four tractors in the hangar and four on the flight deck, a driver on each). They wait in a row
  --    by the island, 1 m apart at 34.5 m to starboard, until the demo seats them. Members of catapult crews 2, 3
  --    and 4 (three, two, two): crew 1 has twelve members with ours and is seen to work with twelve; no crew is
  --    made larger than that. NOT YET SEEN IN DCS.
  --    "catcc-t8", "catcc-t9" (2026-11-19: the demo has six tractors on the flight deck and four in the hangar: the
  --    user, 2026-11-18: "add two additional tugs"; then, of the hangar: "seeing two tugs in the hangar that have no
  --    driver": the deck's tractors are given their drivers first, and there were eight for ten): two more, in
  --    catapult crews 3 and 4 (nine members each then, as crew 2 has).
  --    (Twelve for some hours of 2026-11-19, catcc-t10 and catcc-t11, while twelve tractors were tried; the demo
  --    went back to ten, and the user: "the only blue shirts should be in tugs. We don't have spare performance to
  --    waste": A DRIVER FOR EACH TRACTOR OF THE DEMO AND NO MORE.)
  -- 8. "catcc-b0" .. "catcc-b8": the deck spotting demo's brake riders (the user, 2026-11-25: "add brown shirts to
  --    the cockpit of aircraft being towed"): brown shirts as catcc-m0 is, put in the cockpit of an aircraft just before
  --    its tractor arrives and taken away once it is clear (crewtest_cockpit.lua). Three in each of catapult crews 2, 3
  --    and 4: twelve members each then, as crew 1 has (no crew larger than that), so nine, for ten tractors: a tenth
  --    tow at the same moment goes without one. They wait in a row at 33 m to starboard, 10 m forward to 2 m forward
  --    (between the drivers' row and the directors), until the demo puts them away. NOT YET SEEN IN DCS.
  local people = { { 'catcc-m0', 'brown', 12.0, 31.0, 1 }, { 'catcc-t0', 'blue', 12.0, 33.0, 1 } }
  for i = 1, 9 do people[#people + 1] = { 'catcc-t' .. i, 'blue', 14.0 - i, 34.5, i <= 3 and 2 or ((i <= 5 or i == 8) and 3 or 4) } end
  for i = 0, 8 do people[#people + 1] = { 'catcc-b' .. i, 'brown', 10.0 - i, 33.0, 2 + math.floor(i / 3) } end
  for _, who in ipairs(people) do
    local c = crew[who[5]] or crew[1] -- (this one's catapult crew)
    local cid = #c.members + 1
    c.members[cid] =
    {
      animation = 'idle',
      model_name = 'carrier_shooter',
      unit_type = 'us carrier shooter',
      livery = who[2],
      name = who[1],
      decal_index = { 0, 2 },
      position = { who[3], 20.1494140625, who[4], 0 },
      fast_start_position = { who[3], 20.1494140625, who[4], 0 },
      routes = {},
    }
    add_gpu_attachment(c, cid, 'RightStick', '__conn_hand_R', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
    add_gpu_attachment(c, cid, 'LeftStick', '__conn_hand_L', light_stick_transform, light_stick_model, { arg_scalable = scale_table })
    add_light_attachment(c, cid, 'LeftLight', '__conn_hand_L', light_transform, light_yellow_color)
    add_light_attachment(c, cid, 'RightLight', '__conn_hand_R', light_transform, light_yellow_color)
  end
end
