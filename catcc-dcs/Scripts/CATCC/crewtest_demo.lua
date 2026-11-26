-- CATCC crew test: THE DECK SPOTTING DEMO (TEST ONLY). Loaded by crewtest_hook.lua, which hands it what it needs of
-- itself (api). Asked for by the user (2026-11-17):
--   "Spot a maximum of 40 aircraft on the flight deck ... Spawn as many aircraft in the hangar as possible, bearing in
--    mind that all aircraft need to be accessible by a tug in order to move them to elevators and then to the deck ...
--    Tugs may not ride on elevators, a separate team of tugs should exist above and below the flight deck ... Park
--    aircraft on the deck in a logical sequence, i.e. outside in ... Use 4 tugs in the hangar, and 4 on the flight deck,
--    ensure they don't interfere with each other at any point ... Aircraft in the hangar can spawn with tow bars
--    already attached ... CVW-14 liveries in groups of 4 aircraft per flight ... If all 40 aircraft can't start in the
--    hangar, start some in locations on the flight deck that don't block the elevators or tow routes ... tugs should
--    park themselves when finished ... catapult crews should move somewhere out of the way ... and the bow bubble
--    should be retracted ... a shortcut key I can press to start the demo."
--
-- WHAT IT DOES
--   The carrier is the one the camera is at (as the deck tool's). Forty static F/A-18Cs, wings folded: TWENTY IN THE
--   HANGAR, TWENTY ON THE FLIGHT DECK (the user, 2026-11-17, after the first run: "aim to have 50% of the aircraft
--   spotted on the flight deck already, and 50% on the hangar deck"). The hangar's are twenty of the 29 places of THE
--   USER'S OWN HANGAR PLAN (crewtest_hangar.lua, read from the layer "Hangar Spotting" of his deck drawing by
--   deck-test/hangar/hangar_plan.py: packed, no lane: see LOADS and "IN THE HANGAR"), each with a tow bar on its nose
--   gear. The deck's stand on their own spots from the start: the bow, the point, the stern. The twenty from below
--   are the last to be parked: the six-pack and the corral (down the middle of the deck), Point 1, three spots aft,
--   and the eight places on the four elevators themselves. (The player's own jet: its spot is left empty; see
--   liveJet.)
--   (The first build, of the day before: thirteen in the hangar in one row with the port side kept as a lane, every
--   one reachable at any time. The user: "you made an assumption ... that aircraft in the hangar all have to be
--   accessible at any time when the reality is that crews would be parking aircraft in a certain order".)
--   Four tractors wait in the hangar, four on the flight deck; none rides an elevator.
--   THE DECK'S FOUR (after the first run in DCS, the user 2026-11-17): they are parked side by side in the junkyard
--   (the pocket aft of the island) and end there, backed into their places. By itself a tractor keeps to the
--   right-hand lane of the taxi roads (LANE, findWay): two pass each other on one road.
--   WHO TAKES WHAT, AND WHERE THEY WAIT (the user, 2026-11-18, after the third run: "Lift the tugs' zone limitations
--   ... add a distance penalty to jobs ... tugs that are anticipating an aircraft arriving on an elevator should wait
--   at a staging area ... and time their travel to the elevator such that they arrive just before the elevator
--   reaches the flight deck level"): no sections any more (Fly 1 / 2 / 3 until then). Every aircraft on its way up
--   is a task; a task costs a tractor the later of "the aircraft is up" and "the tractor is there, and 30 s"; the
--   cheapest pairs are made (assign). A tractor waits at a staging place: the junkyard, the pocket between the
--   island and elevator 2, or a deck spot that is still empty (stagePlace), and sets off for the front of its
--   elevator so as to be there as the platform comes up (nextPlace, travelTime); when the platform is up it backs
--   onto the bar. See "the flight deck: who takes what, where they wait".
--   THE HANGAR (the user, 2026-11-18): "while elevators are up, tugs in the hangar should move the next set of
--   aircraft into position just short of the blast doors": READY: an aircraft drawn out nose first is stood on the
--   line of its place, its tail 0.6 m inside the door, the tractor on its bar (the hook: w.hold); one pushed back
--   round into the doorway is planned onto the platform and stops on that push short of the door (the hook:
--   w.pushDoor); either goes on when the platform is down.
--   A deck tow is planned past the tractors that stand parked, shape for shape (startDeckJob: known).
--   CHOCKS, COVERS, BARS: every aircraft stands with its chocks in (model argument 23); they come out when the
--   tractor is hooked on and go in again when the tow has stopped. The hangar's aircraft have their covers on (24);
--   once an aircraft stands on its deck spot its covers come off and its tow bar is taken away.
--   BOARD NUMBERS: every aircraft carries the number its livery is named for (model arguments 442 / 31 / 32: ARG).
--   Each elevator works by itself: it comes down, hangar tractors bring it two aircraft (onto it tail first, side by
--   side: the first of its list that can be reached at that moment), it goes up, deck tractors take them off to their
--   spots (pulled past the spot, pushed back in), it comes down again. An elevator's last two stay on it: those are
--   its two deck spots. Which aircraft, in what order, to which deck spot: LOADS.
--   IN THE HANGAR a tow has one reversal at most: pushed all the way (tail to the doorway), or drawn out nose first and
--   pushed back; the tractor comes alongside under the wings and swings in ahead of the nose, or, where there is no
--   getting past the nose, comes at it head on and takes the bar on its FRONT hitch (the hook: w.frontHitch).
--   The hangar's planning is done a step a frame (hangarSearch): one way driven in the head each frame.
--   NO TWO TRACTORS IN ONE PLACE: before a tractor starts on a job, everything it will sweep (its own way to the
--   aircraft, the tow, the push, the spot) is laid out as a chain of circles and held against the circles of every
--   job in hand on that deck and against every tractor standing idle. In the hangar it starts only when none touch,
--   and keeps the lot until the aircraft is delivered.
--   ON THE FLIGHT DECK THE TRACTORS WORK SIDE BY SIDE (the user, 2026-11-18: "Sometimes it looks like a tug is waiting
--   for another tug to finish an operation before it moves to its next job. I want tugs to do their work in parallel
--   and deconflict with each other logically"): every circle is held only for the time the job needs it (driven in
--   the head: `circles`, `driven`): two jobs are in each other's way only where circles touch AND the times overlap.
--   So a tractor follows another down a lane, crosses behind a tow, passes ahead of one still hooking up. A job may
--   also start BEHIND another (`free`): it sets off, stops short of what the two share and goes on when the other
--   has passed (giveWay, the hook's d.hold); one that falls behind its plan takes its times with it (job.lag), and
--   whoever then comes second gives way. What a job has passed it gives up (letGo). A deck tractor by itself finds
--   its own way (findWay: its lane; round what the others hold if its lane is taken at that time: soloPlan); what
--   it holds is the track it will drive (`driven`) and the place it backs into.
--   An elevator is not lowered under a tractor's way, and not raised with a tractor on it.
--   NOTHING IS PLANNED TWICE FOR THE SAME DECK: what could not be done is looked at again when something has changed
--   (a tow started, an aircraft delivered, a tractor back, an elevator arrived: M.sig), not on a timer.
--   Every tow is the hook's own (Tow.tickOne: the same planning, the same trailing, the same checks against the other
--   aircraft as a tow asked for by hand), with the bar left on the aircraft. In the hangar the planners are given the
--   hangar's floor and walls instead of the flight deck's outline (and not what stands in the aircraft's own strip:
--   hangarEnv).
--   The catapult crews are walked to the port edge forward of the landing area; both bubbles are lowered.
--   Liveries: CVW-14's, by pilot (the user's two lists): VFA-44 "KING - LineJet - <board>", VFA-161 "STING - LineJet -
--   <board>", the flight lead's "... LineJet-FL - <board>". Ten flights of four, each flight's four spots together on
--   the deck (one flight is in two pairs: there is no fourth and fifth pair of neighbours left for it).
--   Drivers: our people named catcc-t0 .. t9 (the crew data patch), one to a tractor, the deck's first; a tractor
--   without one drives with an empty seat.
--   Tested from start to finish in the test rig (catcc-dcs/test/demo-run.lua under DCS's own Lua: crewtest.test.ts).
--
-- commands (hook: demo2|start, demo2|stop, demo2|toggle, demo2|report); the panel's key Ctrl+Shift+F9 toggles it.
local api = ...
local Tow, TOW = api.Tow, api.TOW
local logLine, say = api.log, api.say
local unpack, atan2 = api.unpack, api.atan2

local M = { on = false }
local DY = 1.856            -- a parked static Hornet's own position above the deck it stands on (DCS: 22.005 on a deck at 20.149)
local DECK_Y = 20.149       -- the flight deck above the ship's origin
local HALF = 4.2            -- half a Hornet's span, wings folded
local RETRY = 5             -- seconds before an elevator command that was refused is given again
-- WHERE THE FOUR DECK TRACTORS ARE PARKED: the junkyard (the pocket between the island's aft end and elevator 3), side
-- by side (the user, 2026-11-17, after the first run in DCS: a tractor that is parking "should have gone back to the
-- junkyard area", not into the landing area), noses inboard, 4.4 m apart. A TRACTOR BACKS INTO ITS PLACE (park: see
-- PARK and soloWay): it comes along a line 17 m to starboard, stops PARK.r past its place, backs a quarter circle onto the
-- place's own line and straight back into it. So it stands nose out, leaves forwards, and never swings through the
-- tractor beside it (driven in nose first on a 7 m run, the rig had it 1.5 m from its neighbour's middle).
local DECK_HOMES = { { x = -67.0, z = 28.0, hx = 0, hz = -1, park = true }, { x = -71.4, z = 28.0, hx = 0, hz = -1, park = true }, { x = -75.8, z = 28.0, hx = 0, hz = -1, park = true },
  { x = -80.2, z = 28.0, hx = 0, hz = -1, park = true } }
-- SIX (the user, 2026-11-18: "add two additional tugs on both decks to help with parellelization"; then: "the 2
-- additional tugs on the flight deck cannot park on the CAT 4 JBD, sorry, put them in the junkyard or pocket between
-- the island and el 2"): FIVE IN THE JUNKYARD, 3.3 m apart over the same 13.2 m the four stood on (forward of it is
-- the island: the hook's deck outline has its inboard face 0.75 m outboard of the first tractor; aft of it is
-- elevator 3), AND ONE IN THE POCKET between the island and elevator 2, on its place in front (POCKET[2], below).
-- Nobody else waits in the pocket then: one tractor behind another there is shut in, and a tractor that drove in past
-- one that stood in front came 2.7 m from it (the rig).
local DECK_HOMES6 = { { x = -67.0, z = 28.0, hx = 0, hz = -1, park = true }, { x = -70.3, z = 28.0, hx = 0, hz = -1, park = true }, { x = -73.6, z = 28.0, hx = 0, hz = -1, park = true },
  { x = -76.9, z = 28.0, hx = 0, hz = -1, park = true }, { x = -80.2, z = 28.0, hx = 0, hz = -1, park = true } }
-- EIGHT (the user, 2026-11-19: "add an 8th tug to the flight deck ... The goal is to get complete deck spotting down to
-- 15 minutes"; there were six: up to eight aircraft come up within two minutes of each other, and in the rig one
-- stood on a raised platform with no tractor free for it for 229 s of a run): SIX IN THE JUNKYARD, 3.2 m apart over
-- 16 m (the first 0.87 m from the island's inboard face, the last 0.86 m from elevator 3's forward edge: there were
-- five over 13.2 m), AND TWO IN THE POCKET between the island and elevator 2, one behind the other: see M.pairHome.
-- NOT THE DEFAULT (CATCC_DEMO_EIGHT switches it on): in the rig eight were 0.3 to 3.5 minutes slower than six in seven
-- of eight variants, and the user, the same day: "If 8 tugs will not be faster, there's no need for me to test it.
-- You can revert to 6 on the flight deck". (Tried in the rig and not kept: seven in the junkyard 2.64 m apart, 0.84 m
-- between two tractors' sides: a tractor backing into its place is then in what its neighbours hold: 204 times one
-- was told to clear off in one run, two of four variants did not finish, and the one that did took 24.4 minutes.)
local DECK_HOMES8 = { { x = -66.0, z = 28.0, hx = 0, hz = -1, park = true }, { x = -69.2, z = 28.0, hx = 0, hz = -1, park = true }, { x = -72.4, z = 28.0, hx = 0, hz = -1, park = true }, { x = -75.6, z = 28.0, hx = 0, hz = -1, park = true }, { x = -78.8, z = 28.0, hx = 0, hz = -1, park = true }, { x = -82.0, z = 28.0, hx = 0, hz = -1, park = true } }
-- (a place a tractor backs into: park = true; back: how far straight back (7 m: the junkyard's line is then 17 m to
-- starboard); r: the quarter circle; run: the straight before it. The same for the places in the pocket between the
-- island and elevator 2, and for a tractor that waits in front of an elevator: see soloWay.)
local PARK = { back = 7.0, r = 4.0, run = 8.0 }
-- THE POCKET BETWEEN THE ISLAND'S FORWARD END AND ELEVATOR 2 (the user, 2026-11-18: tractors "should stage themselves
-- between the island and el 2"): 6.2 m wide and 15 m deep: two tractors one behind the other, backed in, noses
-- inboard; the deep place first (`front`: the place in front of it: with a tractor standing there the deep one cannot
-- be reached, and one that stands on it cannot leave: shutIn).
-- (Until 2026-11-18 the deck's tractors belonged to Fly 1 / 2 / 3, each with its own waiting places; the user then:
-- "Lift the tugs' zone limitations". The sections are gone: see "who takes what".)
local POCKET = { { x = -33.7, z = 31.0, hx = 0, hz = -1, park = true, back = 10, pocket = true }, { x = -33.7, z = 25.0, hx = 0, hz = -1, park = true, back = 4, pocket = true } }
POCKET[1].front = POCKET[2]
-- IN FRONT OF AN ELEVATOR (the user, 2026-11-18: "Tugs should anticipate aircraft arriving on the elevators if there
-- are any in the queue, and wait nearby to pick up those aircraft"): the tractor that is for an aircraft on its way up
-- comes to stand ON ITS NOSE LINE, `ahead` beyond where it will hook on, facing away from the elevator (backed in:
-- `back`), as the platform comes up (it times its drive: nextPlace): it then only has to back onto the bar.
local WAIT = { ahead = 6.0, back = 3.0 }
-- FOUR IN THE HANGAR: the plan's four homes (nil). SIX (the plan's homes and the first two of its other posts:
-- CATCC_DEMO_POSTS = { 1, 2, 3, 4, 5, 6 }) were tried on 2026-11-19 and not kept: the user: "6 in the hangar (which
-- saves 1 minute over 4 tugs in the hangar, correct? If I'm wrong about that, go to 4 tugs in the hangar)", and then:
-- "I don't care about accelerated time results, only realtime". In the rig at real time, six against four, six on the
-- flight deck: 17.1 against 17.7 minutes (18.4 against 18.2 with planning spread over frames); with the player's jet
-- on elevator 1: 19.1 against 17.4 (19.1 against 17.9). Eight (all the plan's posts) do not finish: the tractors on
-- the last two posts stand where the first tows need room.
local HANGAR_POSTS = nil
-- SHORT OF THE DOOR, IN THE HANGAR (the user: "while elevators are up, tugs in the hangar should move the next set of
-- aircraft into position just short of the blast doors, so that they can push their aircraft onto the elevator as
-- soon as it arrives"): an aircraft's own position there, on the line of its place on the platform, its tail 0.6 m
-- inside the door (starboard: the wall is at 16.4 m; port: 17.0), the tractor still on its bar.
-- An aircraft that is PUSHED ALL THE WAY (back along its own line and round into the doorway) is planned onto the
-- platform as if it were down and STOPS on that push where its tail would come past READY.line (0.6 m inside the
-- door): the hook's w.pushDoor; when the platform is down the same push goes on.
local READY = { stbd = 7.3, port = 7.9, line = { stbd = 15.8, port = 16.4 } }
-- A TOW'S TIMES (see `circles`): a circle of its pull is held from `pre` seconds before the tractor is at it until `post`
-- after (at the pace of a turn, 1.4 m/s: the tractor reaches 2 m ahead of its own point and the circle is 8 m in
-- radius; the aircraft's tail is 22 m behind the tractor's point); the last `tail` seconds of the pull are held from
-- then on: there it stops and pushes back.
-- (2026-11-19: the tugs twice as fast: 5 / 12 / 10 s where it was 8 / 22 / 18)
local TOW_T = { pre = 5, post = CATCC_DEMO_POST or 12, tail = 10 }
M.TAIL = 24
-- a tractor by itself keeps to the RIGHT of a taxi road's centreline (the user: "the taxi route that aircraft use is
-- wide enough that two tugs should be able to pass each other just fine if they stay in lanes either side of the
-- route's centreline"): its lane is the strip from `from` to `to` metres to the right of the line, the way it is
-- going. SOLO: the radius of what a tractor by itself holds along its way (half its width and half a metre).
local LANE = { from = 2.0, to = 3.5, centre = 1.2, with = 0.7, across = 1.0, against = 2.5, off = 1.3 }
-- FIVE LANES (the user, 2026-11-20, with a drawing of the street between the six-pack and the island: "the network on
-- the deck in high traffic areas should almost be in two layers. One that's wide enough to accommodate aircraft taxiing
-- or under tow, and a second that subdivides the first and is wide enough for multiple tugs to pass each other in their
-- own lanes e.g. far left of centreline (red), left of centreline (orange), centreline (purple), right of centreline
-- (blue) and far right of centreline (green). Each lane spaced far enough that tugs pass each other with at least 3ft of
-- clearance or so. The far left and right lanes can be used to traverse the area while an aircraft is being towed on
-- the centreline. Lanes should be one directional and follow north american conventions, except for the centerline
-- where traffic can flow in either direction"). Measures: a tractor is 1.8 m wide (the hook's Tow.Fd.tugShape); what a
-- tractor by itself holds is 1.4 m about its track (SOLO). INNER (right and left of the centreline): 3.0 m off it:
-- two tractors in the two lanes, or in a lane and on the centreline, are 1.2 m apart (3 ft is 0.91 m) and what they hold
-- does not touch. FAR: 6.6 m off it: past a tow on the centreline (an aircraft's wings folded: 4.19 m from its centre
-- line; what a tow holds of its own width: 4.6 m): a tractor's side 1.5 m from the wing tip, what it holds 0.6 m clear
-- of the tow's. A lane is `half` either side of its line (a cell of the way-finder is 1.5 m: one at least across it).
-- One way: the lanes to the RIGHT of a road's centreline, the way the road is driven (inner and far), are that way's;
-- the centreline both ways. A cell: in its lane the way it goes `with` (the far lane `withFar`: a little dearer, so
-- that the inner lane is taken unless it is held); the other way `against`; on the centreline `centreCost`; on the
-- road between the lanes `between`; off the roads `off`. OFF (CATCC_DEMO_LANES5 switches it on): in the rig the same
-- day the tractors' ways ran between the lanes for 30 to 41 % of their length, whatever that strip cost (1.0 to 2.0):
-- on cells of 1.5 m, and with the corners cut and rounded afterwards, a cost on the cells does not keep a way in a lane
-- 1.6 m wide. Lanes kept as lanes need ways along lane lines (a lane graph), not costs on a grid.
local LANE5 = { inner = 3.0, far = 6.6, half = 0.8, centreHalf = 0.8, withFar = 0.75, centreCost = 0.9, between = tonumber(CATCC_DEMO_LANE_BETWEEN) or 1.0 }
local SOLO = 1.4
-- a static Hornet's model arguments (the user: chocks 2026-11-12, covers 2026-11-17): 1 = shown
-- THE BOARD NUMBER (MODEX; the user, 2026-11-18: "set the MODEX of all aircraft in the demo using the appropriate
-- arguments"): the Hornet's model (fa-18c.edm, read 2026-11-18) has 15 number pieces, each shifting its digit strip by
-- one argument: 442, 31 or 32. Taken as hundreds, tens, units, a digit d as d / 10 (the usual way of DCS models: NOT
-- SEEN IN DCS YET). DCS gives a static a number of its own when it is made; ours is written over it, and again in turn
-- with the wings.
-- (canopy: argument 38, opened as the jet's own mechanism opens it (FA-18C_hornet.lua: Door0, "to 0.9"): opened when a
-- brake rider climbs in (Tow.Cockpit, crewtest_cockpit.lua; the user, 2026-11-25: "The canopy should remain open") and
-- left open)
local ARG = { chocks = 23, covers = 24, canopy = 38, canopyOpen = 0.9, modex = { 442, 31, 32 } }
-- where the catapult crews are sent: the port deck edge forward of the landing area ([catapult] = the first of six places)
local CREW_AWAY = { { 20, -34.5 }, { 27, -35.5 }, { 34, -37.5 }, { 41, -37.5 } }

-- THE FLIGHTS: the deck spots of each (by the spotting plan's ids), the squadron, the boards (the lead first)
local FLIGHTS = {
  { sq = 'KING', spots = { 'SB6', 'SB5', 'SB4', 'SB3' }, boards = { 623, 551, 564, 516 } },
  { sq = 'KING', spots = { 'SB2', 'SB1', 'PT4', 'PT3' }, boards = { 575, 512, 741, 644 } },
  { sq = 'KING', spots = { 'PT2', 'PT1', 'E11', 'E12' }, boards = { 523, 511, 517, 712 } },
  { sq = 'KING', spots = { 'CO1', 'CO2', 'E21', 'E22' }, boards = { 744, 711, 527, 566 } },
  { sq = 'KING', spots = { 'PB2', 'PB1', 'CR2', 'CR1' }, boards = { 646, 733, 545, 652 } },
  { sq = 'STING', spots = { 'E31', 'E32', 'PA1', 'PA2' }, boards = { 637, 525, 571, 574 } },
  { sq = 'STING', spots = { 'PA3', 'FT4', 'FT3', 'FT1' }, boards = { 664, 725, 614, 524 } },
  { sq = 'STING', spots = { 'FT2', 'PQ3', 'PQ2', 'E42' }, boards = { 777, 636, 615, 514 } },
  { sq = 'STING', spots = { 'E41', 'PQ1', 'SP6', 'SP5' }, boards = { 577, 754, 526, 555 } },
  { sq = 'STING', spots = { 'SP1', 'SP2', 'SP3', 'SP4' }, boards = { 771, 772, 632, 522 } },
}
-- THE HANGAR IS FULL, AND COMES UP IN THE USER'S ORDER (2026-11-18). He set the hangar's aircraft by hand in DCS (the
-- deck spotting tool: "The hangar space doesn't actually manage what was generated in the svg"), drew them into his
-- deck drawing and labelled each: "I've also labelled each Hangar spot with 'EL# X' based on what I think the
-- unloading sequence should be for a FULL hangar. There may be a more optimal solution but this should be a good
-- starting point. If it doesn't work, then I may need to reconsider how the hangar is spotted." So: 24 aircraft below,
-- six for each elevator, each with its turn there (the plan's slots: el, turn: crewtest_hangar.lua); 16 on the flight
-- deck from the start. An elevator asks for its aircraft in the order of their turns, two a trip; its last two stay
-- on its platform (its two deck spots: El k 1 the forward place: the one of the two that stands further forward in the
-- hangar). (Until then: twenty of an earlier plan's 29, chosen and ordered by me: LOADS written out by hand.)
-- WHICH DECK SPOT the first four of each elevator go to (DEST: by elevator, by turn): the sixteen spots nearest the
-- elevators that are not on a platform: the six-pack and the corral off elevators 1 and 2 (a corral spot before the
-- six-pack spot across the street from it: the tow into the corral passes that one's nose; of the six-pack the
-- middle ones before their neighbours: `after`: that one is not towed until the other stands on its spot); off
-- elevator 3 the patio and Fantail 4; off elevator 4 Port quarter 2 and 3 and Fantail 1 and 2. The other sixteen stand
-- on the deck from the start: the bow, the point, the crotch, Fantail 3, Port quarter 1.
-- st (not given: either place on the platform, the further one first): pinned where the rig showed it must be.
-- THE DEMO STARTS WITH THE HANGAR FULL (the user, 2026-11-18: "start with a full hangar deck so I can validate that
-- everything looks correct ... fill the hangar and put what doesn't fit on the deck to start"). NOT ALL OF IT COMES UP
-- YET: in the rig 8 of the 24 come up in his order and the rest wait on each other (DECISIONS.md has which and why).
-- (THE AIRCRAFT NOW COME UP IN PAIRS, each on the side of the platform the user gave it (2026-11-18): turns 1 and 2
-- together, 3 and 4 together. Which deck spot each goes on to, and in what order (`after`), is what the rig showed
-- the hook's deck planner can drive with the pairs standing as they do (ten orders tried, 2026-11-18):
--   elevator 3: its aft one to Patio 3 / Stbd 1 first, its forward one then to Patio 2 / Patio 1 (the forward one's
--     way aft leads past its partner);
--   elevator 4: its aft one to Port 4 / Port 1 first, its forward one then to Port 5 / Port 2 (to Port 1 from the
--     forward place the planner has no way at all);
--   (the names of that day: since 2026-11-23 Stbd 1 is Fantail 4, Port 1 to 3 are Port quarter 1 to 3, Port 4 and 5
--     are Fantail 1 and 2)
--   elevator 2: Corral 2, Sixpack 6, Sixpack 4, then Sixpack 5: the one order of ten in which no tow goes more than
--     0.1 m into another aircraft's padded shape (the last, into Sixpack 5, brushes the one on Corral 2 by that).
-- PORT 3 IS SPOTTED LAST (the user, 2026-11-18: "If it blocks the aircraft on the stern, just spot it last, no?"): the
-- after Port 4 and Port 5, straight in along its own line (axisTow: the hook's own ways have none onto it); Port 2
-- after it (with an aircraft on Port 2 the way across to Port 3's line runs into its nose). Port 1 has an aircraft from
-- the start, as it had. (Until then Port 3 was left empty.) (Port 3 is now Port quarter 3.))
local LEFT_EMPTY = ''
local DEST = {
  [1] = { { spot = 'SP2' }, { spot = 'CO1' }, { spot = 'SP1' }, { spot = 'SP3', after = 'CO1' } },
  [2] = { { spot = 'CO2' }, { spot = 'SP6' }, { spot = 'SP4' }, { spot = 'SP5', after = 'SP4' } },
  [3] = { { spot = 'PA2', after = 'PA3' }, { spot = 'PA3' }, { spot = 'PA1', after = 'FT4' }, { spot = 'FT4' } },
  [4] = { { spot = 'FT2', after = 'FT1' }, { spot = 'FT1' }, { spot = 'PQ2', after = 'PQ3' }, { spot = 'PQ3' } },
}
-- each elevator's list, from the plan: { n (the place it stands on), spot, st, after (the place of the one that must
-- be on its deck spot first), stay }
local function loadsOf(plan)
  local out = {}
  for k = 1, 4 do
    local list = {}
    for _, sl in ipairs(plan.slots) do
      if sl.el == k then list[#list + 1] = sl end
    end
    table.sort(list, function(a, b) return (a.turn or 0) < (b.turn or 0) end)
    out[k] = {}
    local nStay = math.min(2, #list)
    local bySpot = {}
    for i, sl in ipairs(list) do
      local d = (CATCC_DEMO_DEST or DEST)[k][i] -- (CATCC_DEMO_DEST: a test's own)
      if i > #list - nStay or not d then
        -- (the two that stay: the one further forward in the hangar on the forward place)
        local other = list[(i == #list) and (#list - 1) or #list]
        local fwd = (not other) or other == sl or sl.x > other.x or (sl.x == other.x and i < #list)
        -- (NAMED BY THE PLATFORM PLACE ITS SOLVED TOW PARKS IT ON (place 2 is the forward one: "El k 1"), where the
        -- plan has solved tows: the run of 2026-11-22, a slot on every spot: on elevators 2, 3 and 4 the two that
        -- stay stood on each other's spots (named by which stood further forward in the HANGAR, parked by the tow's
        -- place), so the slot picker took the wrong static away and DCS found the spot occupied)
        local ts, to = plan.tows and plan.tows[sl.n], plan.tows and other and plan.tows[other.n]
        if not CATCC_DEMO_NO_TOWS and ts and ts.st and (other == sl or not other or (to and to.st and to.st ~= ts.st)) then fwd = ts.st == 2 end
        out[k][#out[k] + 1] = { n = sl.n, spot = string.format('E%d%d', k, fwd and 1 or 2), stay = true }
      else
        out[k][#out[k] + 1] = { n = sl.n, spot = d.spot, st = d.st, afterSpot = d.after }
        bySpot[d.spot] = sl.n
      end
    end
    for _, ld in ipairs(out[k]) do
      if ld.afterSpot then ld.after = bySpot[ld.afterSpot] end
    end
  end
  return out
end

local function unit(x, z) return Tow.unit(x, z) end
local function hyp(x, z) return math.sqrt(x * x + z * z) end

-- ---------------------------------------------------------------- the hangar as surroundings for the hook's planners
local H -- crewtest_hangar.lua's table
local function cell(x, z)
  local g = H.grid
  local r, c = math.floor((z - g.z0) / g.cell) + 1, math.floor((x - g.x0) / g.cell) + 1
  local row = g.rows[r]
  if not row or c < 1 or c > #row then return ' ' end
  return row:sub(c, c)
end

-- (a platform's box is taken 0.7 m further inboard: between the hangar's sill and the platform's edge the map's grid
-- has a strip of "no floor" a third of a metre wide, where the two models meet)
local function onPlatform(x, z, needDown)
  for k, e in pairs(H.elevators) do
    local z1, z2 = e.z[1], e.z[2]
    if z1 > 0 then z1 = z1 - 0.7 else z2 = z2 + 0.7 end
    if x >= e.x[1] and x <= e.x[2] and z >= z1 and z <= z2 then
      if not needDown then return k end
      local E = M.el and M.el[k]
      return (E and E.state == 'down') and k or nil
    end
  end
  return nil
end

local ENV_HANGAR = {
  inside = function(x, z) return cell(x, z) == '.' or onPlatform(x, z, true) ~= nil end,
  wall = function(x, z) return cell(x, z) == '#' end,
  blocks = function() return {} end,
}
-- (ENV_HANGAR.finder: the hangar's own way-finder, set where it is made)
-- on the flight deck: the hook's own outline; a platform that is not up is a hole
local ENV_DECK = {
  blocks = function()
    local out = {}
    for k, E in pairs(M.el or {}) do
      if E.state ~= 'up' then
        local e = H.elevators[k]
        out[#out + 1] = { e.x[1] - 1, e.x[2] + 1, math.min(e.z[1], e.z[2]) - 1.4, math.max(e.z[1], e.z[2]) + 3, idx = k }
      end
    end
    return out
  end,
}

-- PLANNING SPREAD OVER FRAMES (2026-11-19: the user's run at twice the speed: single frames in which the hook took
-- 0.3 to 1.5 s; the rig, timed: a hangar tractor's search for its way back after a tow 1.1 s in one frame, a deck
-- tow's plan 0.4 s). A long piece of planning runs as a coroutine (M.sliced: a call a frame until it has ended); it
-- gives up the frame (M.pause) before a planner call (`within`, not one inside another) once it has made
-- its share of the frame. CATCC_DEMO_NO_SLICE: all in one frame, as it was.
-- (ms: the share: milliseconds from the beginning of the demo's tick, for all of the demo together, by LuaSocket's
-- clock (M.cpu): DCS has it; the rig and the tests do not, and there NOTHING IS SPREAD unless it is asked for by the
-- count (calls: CATCC_DEMO_SLICE_CALLS: planner calls and steps inside them a frame): a run there is then the same
-- run every time. A piece that is given a turn makes at least one planner call. starve: a piece that has not had a
-- turn for that many frames gets one whatever the share.)
M.SLICE = { calls = CATCC_DEMO_SLICE_CALLS, ms = CATCC_DEMO_SLICE_MS or 12, starve = 4 }
do
  local oks, sock = pcall(require, 'socket')
  M.cpu = (oks and type(sock) == 'table' and sock.gettime) or nil
end
function M.overShare()
  if M.SLICE.calls then return (M.frameCalls or 0) > M.SLICE.calls end
  if not M.cpu then return false end
  return (M.cpu() - (M.frameT0 or 0)) * 1000 > M.SLICE.ms
end

-- THE FRAME IS GIVEN UP. What is the piece's own (the planners' surroundings as its planner call set them, how deep
-- in planner calls it is, the way-finder's switches, M.tried) is kept here and put back when its next turn begins;
-- M.sliced puts back what was its caller's.
local function sliceYield()
  local F = Tow.Fd
  local i1, w1, b1, m1, f1 = F.inside, F.wall, F.blocks, F.mute, F.finder
  local depth, top = M.withinDepth, M.envTop
  local tried, fT, fJ, fW, fF = M.tried, M.finderTug, M.finderJet, M.finderTow, M.finderFree
  local fG, fU, fWd, fFo = M.finderGoal, M.finderUnder, M.finderWide, M.finderForce
  M.yieldN = (M.yieldN or 0) + 1
  coroutine.yield()
  F.inside, F.wall, F.blocks, F.mute, F.finder = i1, w1, b1, m1, f1
  M.withinDepth, M.envTop = depth, top
  M.tried, M.finderTug, M.finderJet, M.finderTow, M.finderFree = tried, fT, fJ, fW, fF
  M.finderGoal, M.finderUnder, M.finderWide, M.finderForce = fG, fU, fWd, fFo
end

-- before a planner call, and at the loops inside the heavy planners (M.pauseIn; the hook's: Tow.pauseIn): not inside
-- a planner call that another one made (that one runs under pcall: no coroutine can sleep across it)
function M.pause()
  if not M.sliceOn or not M.sliceCo or coroutine.running() ~= M.sliceCo or (M.withinDepth or 0) > 1 then return end
  M.frameCalls = (M.frameCalls or 0) + 1
  if M.overShare() then sliceYield() end
end
M.pauseIn = M.pause
Tow.pauseIn = function() return M.pause() end

-- one call a frame: true and what fn gave when it has ended; false while it is still at it (holder[key]: the coroutine)
function M.sliced(holder, key, fn, ...)
  local co = holder[key]
  local fr = M.frameNo or 0
  if not co then
    co = coroutine.create(fn)
    holder[key] = co
    -- (the rig's profiler, if it runs: in this coroutine too)
    if PROF_HOOK then debug.sethook(co, PROF_HOOK, '', 2000) end
  elseif M.overShare() and fr - (holder[key .. 'F'] or fr) < M.SLICE.starve then
    -- (this frame's share is used up, and it had a turn not long ago)
    return false
  end
  holder[key .. 'F'] = fr
  -- (the caller's: put back when the turn ends, however it ends)
  local F = Tow.Fd
  local i0, w0, b0, m0, f0 = F.inside, F.wall, F.blocks, F.mute, F.finder
  local d0, top0, tried0, fT, fJ, fW, fF = M.withinDepth, M.envTop, M.tried, M.finderTug, M.finderJet, M.finderTow, M.finderFree
  local fG0, fU0, fWd0, fFo0 = M.finderGoal, M.finderUnder, M.finderWide, M.finderForce
  M.withinDepth, M.envTop = 0, nil
  M.finderTug, M.finderJet, M.finderTow, M.finderFree = nil, nil, nil, nil
  M.finderGoal, M.finderUnder, M.finderWide, M.finderForce = nil, nil, nil, nil
  M.sliceCo, M.sliceOn = co, true
  local res = { coroutine.resume(co, ...) }
  M.sliceCo, M.sliceOn = nil, nil
  local triedCo = M.tried
  M.finderGoal, M.finderUnder, M.finderWide, M.finderForce = fG0, fU0, fWd0, fFo0
  F.inside, F.wall, F.blocks, F.mute, F.finder = i0, w0, b0, m0, f0
  M.withinDepth, M.envTop, M.tried, M.finderTug, M.finderJet, M.finderTow, M.finderFree = d0, top0, tried0, fT, fJ, fW, fF
  if not res[1] then
    -- (it failed: said; the piece counts as ended with nothing found)
    holder[key] = nil
    logLine('demo: error in planning spread over frames: ' .. tostring(res[2]))
    return true
  end
  if coroutine.status(co) == 'dead' then
    holder[key] = nil
    -- (what it wrote of the ways it tried is the caller's to read, as when it ran in one go)
    M.tried = triedCo
    return true, unpack(res, 2, 8)
  end
  M.slices = (M.slices or 0) + 1
  return false
end

-- a planner run with the hangar's (or the deck's) surroundings; they are put back whatever happens
local function within(env, fn, ...)
  if (M.withinDepth or 0) == 0 then M.pause() end
  M.withinDepth = (M.withinDepth or 0) + 1
  local F = Tow.Fd
  local i0, w0, b0, m0, f0 = F.inside, F.wall, F.blocks, F.mute, F.finder
  -- (F.mute: the planners' own account of every way they tried is not written to the log, the demo plans again and
  -- again: it is kept in M.tried, and written when an elevator begins to wait for a new reason: `waits`)
  F.inside, F.wall, F.blocks, F.mute, F.finder = env.inside, env.wall, env.blocks, M.tried or true, env.finder
  local r
  if M.sliceCo and M.withinDepth == 1 and coroutine.running() == M.sliceCo then
    -- (from a piece of planning that is spread over frames: called as it is, not under pcall, so that it can give up
    -- the frame inside (M.pauseIn); M.envTop: what is put back while it sleeps; an error ends the piece: M.sliced)
    M.envTop = { i0, w0, b0, m0, f0 }
    r = { true, fn(...) }
    M.envTop = nil
  else
    r = { pcall(fn, ...) }
  end
  F.inside, F.wall, F.blocks, F.mute, F.finder = i0, w0, b0, m0, f0
  M.withinDepth = M.withinDepth - 1
  if not r[1] then return nil, 'the planning failed: ' .. tostring(r[2]) end
  return unpack(r, 2, 6)
end

-- ---------------------------------------------------------------- placing things
local function placeAircraft(a)
  local ok, res, e = pcall(api.native().staticpos, a.id, unpack(Tow.pose(Tow.OWN, a.x, a.y, a.z, a.fx, a.fz)))
  if not (ok and res) and not a.bad then
    a.bad = true
    logLine(string.format('demo: %s could not be placed: %s', a.name, tostring(ok and e or res)))
  end
  if a.bar and not a.towed and not a.preHooked then
    -- its bar: the pins in the nose wheel's axle, the ring on its foot, straight ahead of the nose
    local floor = a.y - DY
    local nx, nz = a.x + a.fx * TOW.noseGear, a.z + a.fz * TOW.noseGear
    local w = { theta = M.thetaIn, lugUp = Tow.axleUp(), ringUp = TOW.bar.ringRest }
    local fl = Tow.flat(w)
    pcall(api.native().staticpos, a.bar, unpack(Tow.barPose(Tow.OWN, nx + a.fx * fl, floor + w.ringUp, nz + a.fz * fl, nx, floor + w.lugUp, nz)))
    local h = api.shipHandle()
    if h and api.native().objarg then pcall(api.native().objarg, h, a.bar, TOW.bar.arg, Tow.armArg(M.thetaIn, true)) end
  end
end

-- its wings folded (the deck's spots and the hangar's row are drawn for folded wings): the model argument the deck
-- tool sets, written again in turn (one aircraft a frame) as the deck tool does
-- With them its chocks (a.chocks: in while it stands, out from the moment the tractor is hooked on until it stands
-- again) and its covers (a.covers: on in the hangar and on the way up, off once it stands on its deck spot).
local function foldWings(a)
  local h = api.shipHandle()
  if h and a.id and api.native().objarg then
    local ok, res, er = pcall(api.native().objarg, h, a.id, Tow.Deck.foldArg, 1)
    if not (ok and res) and not M.foldBad then
      M.foldBad = true
      logLine('demo: the wings could not be folded (' .. tostring(ok and er or res) .. '): they stay as DCS draws them')
    end
    for _, q in ipairs({ { ARG.chocks, a.chocks }, { ARG.covers, a.covers }, { ARG.canopy, a.canopy, ARG.canopyOpen } }) do
      local ok2, res2, er2 = pcall(api.native().objarg, h, a.id, q[1], q[2] and (q[3] or 1) or 0)
      if not (ok2 and res2) and not M.argBad then
        M.argBad = true
        logLine(string.format('demo: argument %d (chocks %d, covers %d) could not be written on %s: %s', q[1], ARG.chocks, ARG.covers, tostring(a.name), tostring(ok2 and er2 or res2)))
      end
    end
    -- its board number: the three digits of the number its livery is named for
    local board = tonumber(a.board)
    if board then
      local digits = { math.floor(board / 100) % 10, math.floor(board / 10) % 10, board % 10 }
      for i, arg in ipairs(ARG.modex) do
        local ok3, res3, er3 = pcall(api.native().objarg, h, a.id, arg, digits[i] / 10)
        if not (ok3 and res3) and not M.modexBad then
          M.modexBad = true
          logLine(string.format('demo: the board number (argument %d) could not be written on %s: %s', arg, tostring(a.name), tostring(ok3 and er3 or res3)))
        end
      end
    end
  end
end

-- an aircraft that has reached its deck spot: its tow bar is taken away (the user: "just disappearing it is fine"),
-- its covers come off
local function spotted(a)
  a.covers, a.chocks = false, true
  if a.bar then
    pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or ""', a.key .. '-bar', M.ship))
    a.bar, a.barGone = nil, true
  end
  foldWings(a)
end

local function placeTug(t)
  -- (one that stands hooked on from the start (t.pre): as its tow has it: on its front hitch it faces the aircraft)
  local x, z, hx, hz = t.d.x, t.d.z, t.d.hx, t.d.hz
  if t.pre then x, z, hx, hz = Tow.real(t.pre.w) end
  pcall(api.native().staticpos, t.id, unpack(Tow.pose(Tow.OWN, x, t.floor, z, hx, hz)))
  if t.driver then
    pcall(api.native().place, t.driver.h, x + hx * TOW.seat.fwd + hz * TOW.seat.left, t.floor + TOW.seat.up, z + hz * TOW.seat.fwd - hx * TOW.seat.left, hx, hz)
  end
end

-- ---------------------------------------------------------------- who is in whose way: circles
-- a way (points { x, z }) as circles of radius r, one every `every` metres
-- WHEN A CIRCLE IS HELD (the user, 2026-11-18: "Sometimes it looks like a tug is waiting for another tug to finish an
-- operation before it moves to its next job. I want tugs to do their work in parallel and deconflict with each other
-- logically"). On the flight deck a job's circles carry the time they are needed for, counted from the job's own clock
-- (job.t0, the model time it was planned at; job.lag: how far it has fallen behind its plan since):
--   c[4]  from when (seconds; nil: from the start),  c[5]  until when (nil: until it is given up),  c[6]  when the
--   tractor is planned to be at its middle (what the job's lag is read from as it goes: letGo).
-- Two jobs are in each other's way only where circles of theirs touch AND the times overlap (GAP seconds kept between
-- them): so a tractor follows another down a lane, crosses behind a tow, or passes ahead of one that is still hooking
-- up. A circle without times is held all the while, as before (the hangar's all are).
-- pre / post (with pts that carry a time as their third number): the circle is held from `pre` seconds before the
-- tractor is at it until `post` after; off: added to the points' times.
local HUGE = math.huge
local GAP = { plan = 5, run = 2 }
local function circles(out, pts, r, every, pre, post, off)
  every = every or 2.5
  off = off or 0
  local function put(x, z, t)
    local c = { x, z, r }
    if pre and t then c[4], c[5], c[6] = t + off - pre, t + off + post, t + off end
    out[#out + 1] = c
  end
  for i = 1, #pts do
    local p = pts[i]
    if i == 1 then
      put(p[1], p[2], p[3])
    else
      local q = pts[i - 1]
      local len = hyp(p[1] - q[1], p[2] - q[2])
      local n = math.max(1, math.ceil(len / every))
      for k = 1, n do put(q[1] + (p[1] - q[1]) * k / n, q[2] + (p[2] - q[2]) * k / n, (p[3] and q[3]) and (q[3] + (p[3] - q[3]) * k / n) or nil) end
    end
  end
  return out
end

-- (circles held from time t on, until they are given up)
local function heldFrom(cs, t)
  for _, c in ipairs(cs) do c[4], c[5] = t, nil end
  return cs
end

-- do two sets of circles clash: do any two touch at overlapping times? ta, tb: the model time each set's clock runs
-- from. The two circles, if so.
local function clash(A, ta, B, tb, gap)
  for _, a in ipairs(A) do
    local a1, a2 = a[4] and ta + a[4] or -HUGE, a[5] and ta + a[5] or HUGE
    for _, b in ipairs(B) do
      local d = a[3] + b[3]
      local dx, dz = a[1] - b[1], a[2] - b[2]
      if dx * dx + dz * dz < d * d then
        local b1, b2 = b[4] and tb + b[4] or -HUGE, b[5] and tb + b[5] or HUGE
        if a1 < b2 + gap and b1 < a2 + gap then return true, a, b end
      end
    end
  end
  return false
end

-- a job's clock: the model time its circles' times are counted from, as it has gone (its lag added)
local function clockOf(j) return (j.t0 or 0) + (j.lag or 0) end
-- WHEN A JOB COMES TO A CIRCLE OF ITS OWN (t: its clock): for the push line and the spot of a tow (c[11]) when its
-- push begins; else when it begins to hold it (c[4]). (2026-11-19, the rig and the user's run: a tow's push line and
-- spot are held from 15 s before its push begins, so that nothing is planned into them; giveWay stopped the tow
-- GIVE.near seconds before THAT: 21 s before its push, which with a pull of 17 s is where it stands hooked on: the
-- second aircraft of a platform, and a tow to the spot beside one that was being pushed into, did not begin until
-- the other was parked.) CATCC_DEMO_NO_NEEDAT: as it was.
function M.needAt(c, t)
  if c[11] and not CATCC_DEMO_NO_NEEDAT then return t + c[11] end
  return c[4] and t + c[4] or -HUGE
end

local function touch(A, B)
  for _, a in ipairs(A) do
    for _, b in ipairs(B) do
      local d = a[3] + b[3]
      local dx, dz = a[1] - b[1], a[2] - b[2]
      if dx * dx + dz * dz < d * d then return true end
    end
  end
  return false
end

-- may a job with these circles start on this level? Not if they touch another job's there, or a tractor standing idle
-- (other than its own)
-- a tractor that stands: a disc about its middle (its own point is 0.6 m forward of that; it is 5.4 m long)
local function tugDisc(t) return { t.d.x - t.d.hx * 0.6, t.d.z - t.d.hz * 0.6, 2.9 } end
-- (the same as two discs along its length, 1.6 m in radius: what is held alongside it comes nearer than its own half
-- length: in the hangar a tow passes 8 m from a tractor parked along the wall, and the one disc touched it by 0.1 m)
local function tugDiscs(t)
  return { { t.d.x + t.d.hx * 0.75, t.d.z + t.d.hz * 0.75, 1.6 }, { t.d.x - t.d.hx * 1.95, t.d.z - t.d.hz * 1.95, 1.6 } }
end

-- A JOB THAT STANDS WAITING FOR A TRACTOR TO PASS (it gave way to it: giveWay) is, to that tractor, what stands there:
-- its tractor, and the aircraft on its bar if it has one (four circles along it, 4.8 m in radius: half its folded
-- span and 0.6 m), not the wide way it holds (8 m either side of its line) nor anything ahead of it: it does not move
-- until that tractor is gone. So a tractor that has delivered its aircraft into a spot gets out past a tow that
-- waits for it in the street. (The rig, 2026-11-18: before this the two stood nose to nose for a minute, each in
-- what the other held.)
local function standsFor(j, tug, solo)
  -- (j.yield.who: the tractor it gives way to, by name. Until 2026-11-18 this looked at j.yield.to, which for a tractor
  -- that STANDS in the way is its name and ", which stands there": so that tractor was held against the whole of the
  -- waiting tow's way, could not set off, and the two held each other up for good: seen in the rig once aircraft came
  -- up in pairs)
  -- (solo: asked for a TRACTOR BY ITSELF: any job that has stood held for 5 s is what stands there: the rig, 2026-11-18:
  -- a tractor that was stood down between two tows that waited (one of them for it) had every way out through the
  -- 8 m band one of them held, and none of the three moved again)
  local forMe = j.yield and (j.yield.who or j.yield.to) == (tug and tug.name)
  local long = solo and j.yield and j.yieldAt and Tow.now() - j.yieldAt > 5 and (j.w.d.v or 0) == 0
  if not (tug and j.w.d.hold and (forMe or long)) then return nil end
  local w = j.w
  local out = {}
  for _, q in ipairs(tugDiscs(j.tug)) do out[#out + 1] = { q[1], q[2], q[3] + 0.6 } end
  if w.bar == 'both' and w.jx and w.jfx then
    for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do out[#out + 1] = { w.jx + w.jfx * u, w.jz + w.jfz * u, 4.8 } end
  end
  return out
end

-- MAY A JOB WITH THESE CIRCLES START on this level (cs: its circles; their times, if they have any, are counted from
-- now)? Not if an idle tractor other than its own stands in them (the third result: that tractor; known: tractors the
-- plan itself was driven against, shape for shape: not asked again here). And against every job in hand there:
--   nothing of theirs touches at an overlapping time: it may;
--   in the hangar: else not;
--   on the flight deck: it may still start BEHIND the other (the fourth result: the jobs it then gives way to), if
--     the other is into the stretch they share first, and this one comes to that stretch (the first of its circles
--     that touches ANY of the other's, whatever the time) no sooner than BEHIND.lead seconds from now: it sets off,
--     stops short of that stretch (giveWay) and goes on when the other has passed. So where it stands waiting, and
--     all it holds before that, is nowhere the other comes.
-- (soloWait: A TRACTOR BY ITSELF FOLLOWS ANOTHER only if it would stand no longer than this behind it, and never one that
-- itself follows a third (2026-11-20: with the places tractors back into held only until they are in, the rig had a
-- tractor stand 42 s behind one that stood behind a third, and then for that one's tow: its way to elevator 2 took 2.5
-- minutes for 73 m). Else it waits for its lane or goes round, as before. CATCC_DEMO_NO_PARKPASS: as it was.)
local BEHIND = { lead = 7, soloWait = 15 }
-- (pass(j): the job's own tow is known to be clear of this one (the hangar's solved tows: H.clear): only what its
-- tractor's own way holds counts: the first j.wayN + 1 of its circles)
-- (fine(a, b, bi, j): two circles that touch (a of cs, b the job's bi-th): do the things themselves? The hangar's:
-- a tow's swept shapes against a tractor's way)
local function free(level, cs, tug, known, pass, fine)
  local now = Tow.now()
  local behind = {}
  for _, j in ipairs(M.jobs) do
    if j.level == level and j.tug ~= tug then
      local tj = clockOf(j)
      -- (a job that stands waiting for THIS tractor to pass: what stands there: standsFor)
      local theirs = (level == 'deck' and standsFor(j, tug, cs.solo)) or j.circles
      local plain = theirs == j.circles
      -- (a tractor by itself against a tow: the tow's band (M.towBand): it may pass in a far lane)
      if plain and level == 'deck' and cs.solo and j.tPull and CATCC_DEMO_LANES5 then theirs = M.towBand(j) end
      -- (THE OTHER TOW OFF THE SAME PLATFORM (cs.pairE: the elevator; cs.tight: this one's circles drawn tight): held
      -- against each other as the aircraft's own width along what each sweeps (M.tightNow), not as the 8 to 9.5 m
      -- bands a tow holds against everything else: the two stand 10 m apart, and may leave side by side)
      local mineC = cs
      if plain and cs.pairE and j.pairE == cs.pairE and j.tPull and not CATCC_DEMO_NO_PAIR then mineC, theirs = cs.tight or cs, M.tightNow(j) end
      -- (ANY TWO TOWS (2026-11-19): the same, and M.PAD between them: a tow's own circles are 8 m about its tractor's
      -- track and 9 to 9.5 m about its push and spot: two tows had to be 16 m apart, track to track, where the
      -- aircraft are 8.4 m wide with their wings folded. CATCC_DEMO_NO_ALLTIGHT: as it was.)
      local pad = 0
      if plain and mineC == cs and cs.tight and j.tPull and not j.delivered and not j.freed and not j.move and not CATCC_DEMO_NO_ALLTIGHT then
        mineC, theirs, pad = cs.tight, M.tightNow(j), M.PAD
      end
      local lim = (pass and plain and pass(j)) and math.min(#theirs, (j.wayN or 0) + 1) or #theirs
      -- (THE RIGHT OF WAY (giveWay): a tow is not put off for what a tractor by itself holds: only for that tractor
      -- where it is at this moment (below))
      if level == 'deck' and not cs.solo and (j.move or j.delivered) and not CATCC_DEMO_NO_ROW then lim = 0 end
      local myIn, jIn, ca, cb, stop, rest = HUGE, HUGE, nil, nil, HUGE, false
      local soloPair = cs.solo and (j.move or j.delivered) and not CATCC_DEMO_NO_PARKPASS
      local longest = 0
      for _, a in ipairs(mineC) do
        local a1, a2 = a[4] and now + a[4] or -HUGE, a[5] and now + a[5] or HUGE
        for bi = 1, lim do
          local b = theirs[bi]
          local d = a[3] + b[3] + pad
          local dx, dz = a[1] - b[1], a[2] - b[2]
          if dx * dx + dz * dz < d * d then
            local b1, b2 = b[4] and tj + b[4] or -HUGE, b[5] and tj + b[5] or HUGE
            -- (WHERE AN AIRCRAFT STANDS (c[8]: the start of a tow) IS NOT HELD AGAINST A TRACTOR BY ITSELF, either way round:
            -- its way is found and driven in the head clear of every aircraft where it stands: 2026-11-19: a tractor
            -- that would pass in front of elevator 2 a minute later put the tow of the aircraft on it off until then)
            local standing = (a[8] and (j.move or j.delivered)) or (b[8] and cs.solo)
            if not standing and (not fine or fine(a, b, bi, j)) then
              if a1 < stop then stop = a1 end
              if a1 < b2 + GAP.plan and b1 < a2 + GAP.plan then
                if a1 < myIn then myIn, ca, cb = a1, a, b end
                if b1 < jIn then jIn = b1 end
                if soloPair and b2 - a1 > longest then longest = b2 - a1 end
                -- (b[7]: where a tractor by itself will come to rest: nothing is planned through that for later)
                -- (but not where this tow was planned clear of a tractor standing there (cs.vt): the tractor of the
                -- other aircraft of its platform, on its way to that aircraft's nose)
                -- (nor, for a tow that hooks on at once, where the tractor of the other aircraft of its platform is
                -- about to wait: that one hooks on too)
                if b[7] and not M.nearVt(cs.vt, b[1], b[2]) and not (cs.nose and j.tug.waitFor and j.tug.waitFor.E == cs.pairE) then rest = true end
              end
            end
          end
        end
      end
      local hit = ca ~= nil
      -- (not behind one that is itself behind this tractor's job in hand: one of two gives way, never both)
      local mine = tug.job
      -- (cs.lateFrom: a tow that may hold in the landing area: behind the other whoever is into what they share
      -- first, if the first of its circles that the other needs AT THE SAME TIME comes no sooner than that: giveWay
      -- stops it short of that circle (job.late))
      if hit and level == 'deck' and not rest and plain and not (mine and j.after and j.after[mine])
        and not (soloPair and (longest > BEHIND.soloWait or (j.after and next(j.after))))
        and ((jIn < myIn - 1 and stop > now + BEHIND.lead) or (cs.lateFrom and myIn >= now + cs.lateFrom)) then
        hit = false
        behind[#behind + 1] = j
      end
      -- (IN THE HANGAR: BEHIND a tow that is under way onto a platform that is down, if the first metres of what this
      -- one sweeps (cs.followFrom) are clear of all that one still holds: M.followTick stops it short of the rest)
      if hit and level == 'hangar' and cs.followFrom and M.followable(j) and M.followOk(cs, j, cs.followFrom) then
        hit = false
        behind[#behind + 1] = j
      end
      -- (not for a tow that hooks on at once (cs.nose): it stands on the bar and gives way from there)
      if not hit and level == 'deck' and not cs.nose then
        -- (and where its tractor is at this moment and for the next 6 s)
        local q = tugDisc(j.tug)
        q[5] = 6
        hit, ca = clash(mineC, now, { q }, now, GAP.plan)
        cb = nil
      end
      if hit then
        -- (where, and for how long from now the other holds that place: nothing said of time: all the while)
        local at = ''
        if level == 'deck' and ca then
          local tb = tj - now
          at = string.format(': near %.0f / %.0f, %s', ca[1], ca[2], (cb and cb[4]) and string.format('which it needs from %.0f s to %s from now', math.max(0, tb + cb[4]), cb[5] and string.format('%.0f s', tb + cb[5]) or 'the end of its job')
            or (cb and 'which it holds until it has gone' or 'where it is now'))
        end
        return false, 'the way is in use (' .. tostring(j.tug.name) .. at .. ')'
      end
    end
  end
  -- (a tractor by itself: not through the way an aircraft waits for on its platform: M.pending)
  if cs.solo and level == 'deck' then
    for _, P in pairs(M.pending or {}) do
      if now - P.at < 8 and P.tug ~= tug and touch(cs, P.cs) then
        return false, 'the way is kept for ' .. P.name .. ', which waits on its platform (the way is in use)'
      end
    end
  end
  for _, t in ipairs(M.tugs) do
    -- (a tractor standing beside this one where they wait is not in its way: they stand side by side: both on places
    -- of their own. One that stands loose within 7 m (it was called back or stood down there) is: the rig, 2026-11-19:
    -- a tractor came to an aircraft's nose where another stood 1 m from the hook-up place)
    if t ~= tug and not (known and known[t]) and t.level == level and not t.job and (hyp(t.d.x - tug.d.x, t.d.z - tug.d.z) > 7 or (level == 'deck' and not (t.place and tug.place)))
      and not (cs.nose and t.waitFor and t.waitFor.E == cs.pairE) and not M.onVt(cs.vt, t)
      and touch((t.place and cs.tight) or cs, tugDiscs(t)) then
      return false, string.format('%s stands in the way (at %.1f / %.1f)', tostring(t.name), t.d.x, t.d.z), t
    end
  end
  return true, nil, nil, behind
end

M.standsFor = standsFor

-- (a reason without its numbers: said again only when it is another reason)
local function gist(why) return (tostring(why):gsub(': near .*$', ')')) end

-- the jobs a new job starts behind: it gives way to them wherever the two come together (giveWay)
local function afterOf(...)
  local set, any = {}, false
  for _, list in ipairs({ ... }) do
    for _, j in ipairs(list or {}) do set[j], any = true, true end
  end
  return any and set or nil
end

-- WHAT A JOB HOLDS IS GIVEN UP AS IT IS PASSED (2026-11-17: the first run in DCS had an elevator's second aircraft, and
-- the next tractor, wait until the tow before was delivered and its tractor back). A job's circles are kept in parts:
--   seq   in the order they are passed: the tractor's way to the aircraft (or, a tractor by itself, its whole way),
--         let go behind the tractor;
--   start the place the aircraft stands on, let go when it is 14 m off;
--   pull  the pull, in order, let go 12 m behind the aircraft;
--   keep  the push and the spot: kept until the aircraft is delivered.
-- job.circles is all that is still held (what `free` and the way-finder look at).
local function gather(job)
  local c = {}
  -- (each part by name: a tractor by itself has no start and no pull, and a list with a gap in it ends at the gap:
  -- the place it backs into was never held; the rig, 2026-11-18: another tractor's way went 0.1 m past its nose)
  -- (and the box they all lie in: two jobs whose boxes do not meet are not held against each other circle by circle)
  local x1, x2, z1, z2 = HUGE, -HUGE, HUGE, -HUGE
  for _, part in ipairs({ job.seq or {}, job.start or {}, job.pull or {}, job.keep or {} }) do
    for _, q in ipairs(part) do
      c[#c + 1] = q
      if q[1] - q[3] < x1 then x1 = q[1] - q[3] end
      if q[1] + q[3] > x2 then x2 = q[1] + q[3] end
      if q[2] - q[3] < z1 then z1 = q[2] - q[3] end
      if q[2] + q[3] > z2 then z2 = q[2] + q[3] end
    end
  end
  job.circles, job.box = c, { x1, x2, z1, z2 }
end

-- (mt: the model time now: the job's lag is read off the circle its tractor is at: how much later than planned)
local function letGo(job, mt)
  local w = job.w
  local d = w.d
  local gone = false
  -- (the reckoned ends of what a tow holds of its push and spot (c[10]) are taken off when the push begins)
  if job.level == 'deck' and not job.endsOpen and (w.phase == 'push' or w.phase == 'arrived') and not job.move and not job.delivered then
    job.endsOpen = true
    for _, part in ipairs({ job.keep or {}, job.pull or {}, job.tKeep or {}, job.tPull or {} }) do
      for _, c in ipairs(part) do
        if c[10] then c[5], gone = nil, true end
      end
    end
  end
  local function lagAt(c)
    if c and c[6] and job.t0 and mt then job.lag = math.max(-3, (mt - job.t0) - c[6]) end
  end
  -- the tractor's own way: the circles before the one it is nearest
  local seq = job.seq
  if seq and #seq > 1 and (w.phase == 'arrive' or w.phase == 'leave') then
    local best, bi
    for i = 1, math.min(#seq, 12) do
      local dd = (seq[i][1] - d.x) ^ 2 + (seq[i][2] - d.z) ^ 2
      if not best or dd < best then best, bi = dd, i end
    end
    lagAt(bi and seq[bi])
    if bi and bi > 2 then
      for _ = 1, bi - 2 do table.remove(seq, 1) end
      gone = true
    end
  end
  if job.delivered and job.keep and w.phase == 'leave' then
    local k2, n = {}, 0
    for _, c in ipairs(job.keep) do
      if c[12] and hyp(c[1] - d.x, c[2] - d.z) > c[3] + 5 then n = n + 1 else k2[#k2 + 1] = c end
    end
    if n > 0 then job.keep, gone = k2, true end
  end
  if w.jx and w.bar == 'both' and (w.phase == 'pull' or w.phase == 'push') then
    -- (a tow's way to its aircraft, and onto the bar: given up when it pulls: until 2026-11-19 its last circles were
    -- held until the aircraft was parked)
    if job.a and job.level == 'deck' and seq and #seq > 0 and not CATCC_DEMO_NO_HOOKTRACK then job.seq, gone = {}, true end
    if job.start and #job.start > 0 and hyp(w.jx - job.start[1][1], w.jz - job.start[1][2]) > 14 then
      job.start, job.startGone, gone = {}, true, true
    end
    local pull = job.pull
    if pull and #pull > 1 and w.phase == 'pull' then
      local best, bi
      for i = 1, math.min(#pull, 16) do
        local dd = (pull[i][1] - w.jx) ^ 2 + (pull[i][2] - w.jz) ^ 2
        if not best or dd < best then best, bi = dd, i end
      end
      -- (its lag: off the circle the TRACTOR is at: the pull's times are the tractor's)
      local tb, ti
      for i = 1, math.min(#pull, 28) do
        local dd = (pull[i][1] - d.x) ^ 2 + (pull[i][2] - d.z) ^ 2
        if not tb or dd < tb then tb, ti = dd, i end
      end
      lagAt(ti and pull[ti])
      if bi and bi > 6 then
        for _ = 1, bi - 6 do table.remove(pull, 1) end
        gone = true
      end
    end
  end
  -- WHAT A PUSH HOLDS IS GIVEN UP BEHIND THE TRACTOR AS IT GOES (2026-11-19): the push's line and the spot were held
  -- whole until the aircraft stood: the second aircraft of elevator 4, whose way crosses the line the first is pushed
  -- back along, stood on the platform for 66 s until the first was parked 60 m aft. A circle of the job's `keep`
  -- that lies wholly behind the tractor (5 m and more, the way the push goes: from where it began to its place) and
  -- 10 m beyond the aircraft's middle is given up.
  if w.jx and w.bar == 'both' and w.phase == 'push' and job.level == 'deck' and job.keep and #job.keep > 1 and w.dest and not CATCC_DEMO_NO_KEEPGO then
    job.pushFrom = job.pushFrom or { w.jx, w.jz }
    local ux, uz = unit(w.dest.x - job.pushFrom[1], w.dest.z - job.pushFrom[2])
    local keep2, n = {}, 0
    for _, c in ipairs(job.keep) do
      if ((c[1] - d.x) * ux + (c[2] - d.z) * uz) < -(c[3] + 5) and hyp(c[1] - w.jx, c[2] - w.jz) > c[3] + 10 then n = n + 1 else keep2[#keep2 + 1] = c end
    end
    if n > 0 then
      job.keep, gone = keep2, true
    end
    -- (AND THE END OF ITS PULL (2026-11-19): what was kept of it for the push (the last M.TAIL metres: no end to
    -- their time once the push has begun) is given up the same way: in the list of all it holds (job.pull) and in
    -- the tight one two tows are held against each other by (job.tPull: its circles are timed, not taken off: their
    -- time ends now). The user's run: a tow off elevator 3 to the patio stood 34 s hooked on for one that was
    -- pushing into its spot 40 m aft, "already well out of the way". CATCC_DEMO_NO_TAILGO: as it was.)
    if not CATCC_DEMO_NO_TAILGO then
      -- (WHICHEVER WAY THE PUSH TURNS (2026-11-20): a circle kept of the pull is given up as soon as neither the tow as
      -- it is now (its tractor, its aircraft: M.bodyOf) nor what it still holds of its push and spot (job.keep) is on
      -- it: until then only what lay behind the tractor along the straight line from where the push began to the spot:
      -- a push that swings its aircraft a quarter round into its spot (Patio 3 from the after elevators) kept the end
      -- of its pull until the aircraft stood: the user's run of 07:54: the second tow off elevator 3 stood 34 s hooked on
      -- for it. CATCC_DEMO_NO_TAILSWEEP: as it was.)
      local body = (not CATCC_DEMO_NO_TAILSWEEP) and M.bodyOf(job) or nil
      local function behind(c)
        if body and not touch({ c }, body) and not touch({ c }, job.keep) then return true end
        return ((c[1] - d.x) * ux + (c[2] - d.z) * uz) < -(c[3] + 5) and hyp(c[1] - w.jx, c[2] - w.jz) > c[3] + 10
      end
      local pull2, m = {}, 0
      for _, c in ipairs(job.pull or {}) do
        if behind(c) then m = m + 1 else pull2[#pull2 + 1] = c end
      end
      if m > 0 then job.pull, gone = pull2, true end
      local tnow = mt - clockOf(job)
      for _, c in ipairs(job.tPull or {}) do
        if not c[5] and behind(c) then c[5], c[10], gone = tnow, nil, true end
      end
    end
  end
  if gone then
    gather(job)
    M.relWant = true
  end
end

-- ---------------------------------------------------------------- the other aircraft, for the planners
-- THE PLAYER'S OWN JET, if it stands on this carrier's flight deck: { x, z, fx, fz } (asked once for each state of
-- the deck: M.sig). It is in every plan's way as the parked aircraft are (its wings taken as spread).
local function liveJet()
  if M.liveSig ~= M.sig then
    M.liveSig, M.live = M.sig, nil
    local okc, c = pcall(api.getCtx)
    if okc and type(c) == 'table' and c.ship == M.ship and c.jx and c.jz and (c.jy or 99) > TOW.hangarBelow then
      local fx, fz = Tow.unit(c.fx or 1, c.fz or 0)
      M.live = { x = c.jx, z = c.jz, fx = fx, fz = fz }
    end
  end
  return M.live
end

-- (leaving: ONE IN TOW ON THE FLIGHT DECK IS LEFT OUT WHERE IT IS NOW: it is on its way off that place, and all its
-- tow still sweeps is held by its job, with the times (`free`: nothing starts through that until it has passed).
-- Until 2026-11-18 the second aircraft of a platform was planned against its partner while that one was being hooked
-- up beside it: "the aircraft in tow goes 2.3 m into 744": its tow was put off for three minutes and given to the
-- tractor that was busy with the first: the platform stood up two minutes longer for every pair.)
local function others(level, except, leaving)
  local out = {}
  for _, a in ipairs(M.aircraft) do
    if a ~= except and a.id and a.level == level then
      if not (leaving and level == 'deck' and a.towed) then
        out[#out + 1] = { x = a.x, z = a.z, fx = a.fx, fz = a.fz, name = a.name, half = HALF }
        out[#out].shape = Tow.Fd.shape(a.x, a.z, a.fx, a.fz, HALF)
      end
      -- (one in tow on the flight deck: WHERE IT IS GOING counts too: a tow may now start while that one is still on
      -- its way (behind it: `free`), and must be clear of it where it will stand)
      if level == 'deck' and a.towed and a.spot and hyp(a.x - a.spot.x, a.z - a.spot.z) > 1 then
        local sx, sz = unit(a.spot.fx, a.spot.fz)
        out[#out + 1] = { x = a.spot.x, z = a.spot.z, fx = sx, fz = sz, name = a.name .. ', where it is being towed to', half = HALF }
        out[#out].shape = Tow.Fd.shape(a.spot.x, a.spot.z, sx, sz, HALF)
      end
    end
  end
  local j = level == 'deck' and liveJet() or nil
  if j then
    out[#out + 1] = { x = j.x, z = j.z, fx = j.fx, fz = j.fz, name = 'your own jet', half = 6.3 }
    out[#out].shape = Tow.Fd.shape(j.x, j.z, j.fx, j.fz, 6.3)
  end
  return out
end

-- ---------------------------------------------------------------- a tractor by itself: its way across a deck
-- The hook's own way-finder for a tractor alone (Tow.Net.solo) keeps to the taxi roads and 5.5 m off every aircraft's
-- whole length: on a full deck that sent a tractor 318 m round the ship to a place 45 m away, past the place where
-- another tractor waits (the demo's first whole run). Here (astar): a deck in square cells; some are shut; the
-- cheapest way through the open ones (A*), a little dearer beside a shut one; then drawn tight: a corner is cut where
-- the straight line is open and costs no more than the way it replaces. The hook rounds its corners and drives it in
-- the head before it is taken (Tow.Fd.simSolo). Two decks:
-- THE FLIGHT DECK (FIND, findWay): cells of 1.5 m; shut are the cells off the deck (the hook's outline, with 1.6 m of
--   deck all round), within 3.4 m of an aircraft's wheels (a tractor goes under a nose or a wing, not through the
--   gear), on a platform that is not up, in what another tractor's job holds (its circles, and 2.4 m more; 1.5 m more
--   round what a tractor by itself holds), and within 4.5 m of another tractor.
--   IT KEEPS TO THE RIGHT ON THE TAXI ROADS (the user, 2026-11-17: two tractors pass each other "if they stay in lanes
--   either side of the route's centreline"): a cell in the strip LANE.from..LANE.to metres to the right of a road's
--   centreline, the way the tractor is going, costs 0.7 a cell; the same strip taken the wrong way 2.5; a road's
--   middle, or a lane crossed, 1; the open deck off the roads 1.3. So it takes a road where one goes its way, in its
--   own lane, and still cuts across the open deck where the roads would take it far round.
-- THE HANGAR (HFIND, hangarWay): cells of 0.75 m of the hangar's own map; shut are the cells without 1.2 m of free
--   floor all round, within 3 m of the line through another aircraft's wheels (the hook's own measure of what a
--   tractor may not drive through: it goes UNDER a wing, a nose or a tail: the user, 2026-11-17: "It's also
--   permissible for a tug to drive under the wing of an aircraft"), what another tractor's job holds, and round
--   another tractor. No lanes down there.
-- a, b: { x, z }; d0: the tractor as it stands ({ x, z, hx, hz }): the way begins 5 m straight ahead of it, if that is
-- open. M.finderTug: the tractor it is for; M.finderFree: other tractors' jobs are not shut (a last resort);
-- M.finderJet: (the hangar) the aircraft the tractor is going to: it may come nearer that one's wheels (2.7 m).
local FIND = { c = 1.5, x0 = -176, z0 = -46, nx = 236, nz = 62, edge = 1.6, wheels = 3.4, along = { -2.6, -0.7, 1.2, 3.1 }, deck = {}, level = 'deck' }
local HFIND = { c = 0.75, x0 = -132, z0 = -24, nx = 280, nz = 64, edge = 1.2, wheels = 3.0, own = 2.7, deck = {}, level = 'hangar', lu = {}, lv = {}, lc = {} }
local NB = { { 1, 0, 1 }, { -1, 0, 1 }, { 0, 1, 1 }, { 0, -1, 1 }, { 1, 1, 1.4142 }, { 1, -1, 1.4142 }, { -1, 1, 1.4142 }, { -1, -1, 1.4142 } }

-- the lanes of the taxi network, cell by cell: FIND.lu / lv: the way a lane's cell is driven; FIND.lc: a road's middle
local function laneField()
  if FIND.lu then return end
  local LU, LV, LC, LD = {}, {}, {}, {}
  FIND.lu, FIND.lv, FIND.lc = LU, LV, LC
  -- (five lanes: LF a far lane's cells, LX the road between the lanes)
  local five = CATCC_DEMO_LANES5
  local LF, LX = {}, {}
  FIND.lf, FIND.lx = five and LF or nil, five and LX or nil
  local reach = five and (LANE5.far + LANE5.half) or LANE.to
  local g = Tow.Net.graph()
  if not (g and g.nodes and g.adj) then return end
  local c, x0, z0, NX, NZ = FIND.c, FIND.x0, FIND.z0, FIND.nx, FIND.nz
  local floor, max, min, abs = math.floor, math.max, math.min, math.abs
  local mid = (LANE.from + LANE.to) / 2
  for i, a in ipairs(g.nodes) do
    for _, j in ipairs(g.adj[i] or {}) do
      local b = g.nodes[j]
      if j > i and b then
        local len = hyp(b[1] - a[1], b[2] - a[2])
        if len > 0.01 then
          local ux, uz = (b[1] - a[1]) / len, (b[2] - a[2]) / len
          local rx, rz = -uz, ux -- (to the right of a -> b: x forward, z to starboard)
          local i0, j0 = floor((min(a[1], b[1]) - reach - c - x0) / c), floor((min(a[2], b[2]) - reach - c - z0) / c)
          local i1, j1 = floor((max(a[1], b[1]) + reach + c - x0) / c), floor((max(a[2], b[2]) + reach + c - z0) / c)
          for cj = max(0, j0), min(NZ - 1, j1) do
            for ci = max(0, i0), min(NX - 1, i1) do
              local cx, cz = x0 + (ci + 0.5) * c, z0 + (cj + 0.5) * c
              local t = (cx - a[1]) * ux + (cz - a[2]) * uz
              if t >= 0 and t <= len then
                local s = (cx - a[1]) * rx + (cz - a[2]) * rz
                local k = cj * NX + ci
                local as = abs(s)
                if five then
                  local offI, offF = abs(as - LANE5.inner), abs(as - LANE5.far)
                  if as < LANE5.centreHalf then
                    LC[k] = true
                  elseif offI <= LANE5.half or offF <= LANE5.half then
                    local off = math.min(offI, offF)
                    if not LD[k] or off < LD[k] then
                      LD[k] = off
                      LF[k] = offF < offI or nil
                      if s > 0 then LU[k], LV[k] = ux, uz else LU[k], LV[k] = -ux, -uz end
                    end
                  elseif as <= reach then
                    LX[k] = true
                  end
                elseif as < LANE.centre then
                  LC[k] = true
                elseif as >= LANE.from and as <= LANE.to then
                  local off = abs(as - mid)
                  if not LD[k] or off < LD[k] then
                    LD[k] = off
                    if s > 0 then LU[k], LV[k] = ux, uz else LU[k], LV[k] = -ux, -uz end
                  end
                end
              end
            end
          end
        end
      end
    end
  end
end

function M.laneCount(way)
  laneField()
  local L = M.laneStats or {}
  M.laneStats = L
  local c, x0, z0, NX = FIND.c, FIND.x0, FIND.z0, FIND.nx
  for i = 2, #way do
    local a, b = way[i - 1], way[i]
    local len = hyp(b[1] - a[1], b[2] - a[2])
    local n = math.max(1, math.floor(len))
    local ux, uz = (b[1] - a[1]) / math.max(len, 1e-6), (b[2] - a[2]) / math.max(len, 1e-6)
    for k = 1, n do
      local x, z = a[1] + (b[1] - a[1]) * k / n, a[2] + (b[2] - a[2]) * k / n
      local key = math.floor((z - z0) / c) * NX + math.floor((x - x0) / c)
      local lu = FIND.lu and FIND.lu[key]
      local what
      if lu then
        local dot = ux * lu + uz * FIND.lv[key]
        what = dot > 0.5 and ((FIND.lf and FIND.lf[key]) and 'far' or 'inner') or (dot < -0.5 and 'wrong' or 'between')
      elseif FIND.lc and FIND.lc[key] then
        what = 'centre'
      elseif FIND.lx and FIND.lx[key] then
        what = 'between'
      else
        what = 'off'
      end
      L[what] = (L[what] or 0) + len / n
    end
  end
end

-- sp: the deck (FIND or HFIND, with sp.base(x, z): is a cell's middle open as the deck stands empty; sp.stamp(mark,
-- box): what stands or is held on it now)
local function astar(sp, a, b, d0)
  local c, x0, z0, NX, NZ = sp.c, sp.x0, sp.z0, sp.nx, sp.nz
  local floor, max, min, abs = math.floor, math.max, math.min, math.abs
  local LU, LV, LC = sp.lu, sp.lv, sp.lc
  local LF, LX = sp.lf, sp.lx
  local function cellOf(x, z) return floor((x - x0) / c), floor((z - z0) / c) end
  local function centre(i, j) return x0 + (i + 0.5) * c, z0 + (j + 0.5) * c end
  local hard = {}
  -- (2026-11-19: no function call and no power a cell: this stamping was a seventh of all the time the demo took)
  local function mark(x, z, r)
    local i0, j0 = cellOf(x - r, z - r)
    local i1, j1 = cellOf(x + r, z + r)
    local r2 = r * r
    local ia, ib = max(0, i0), min(NX - 1, i1)
    for j = max(0, j0), min(NZ - 1, j1) do
      local dz = z0 + (j + 0.5) * c - z
      local dz2, row = dz * dz, j * NX
      if dz2 < r2 then
        for i = ia, ib do
          local dx = x0 + (i + 0.5) * c - x
          if dx * dx + dz2 < r2 then hard[row + i] = true end
        end
      end
    end
  end
  local function box(xa, xb, za, zb)
    local i0, j0 = cellOf(xa, za)
    local i1, j1 = cellOf(xb, zb)
    for j = max(0, j0), min(NZ - 1, j1) do
      for i = max(0, i0), min(NX - 1, i1) do hard[j * NX + i] = true end
    end
  end
  sp.stamp(mark, box)
  local deck = sp.deck
  local function open(i, j)
    if i < 0 or j < 0 or i >= NX or j >= NZ then return false end
    local k = j * NX + i
    if hard[k] then return false end
    local m = deck[k]
    if m == nil then
      local x, z = centre(i, j)
      m = sp.base(x, z) and true or false
      deck[k] = m
    end
    return m
  end
  -- what a cell costs, driven the way (dx, dz) (of length len): see above
  local function factor(k, dx, dz, len)
    -- (sp.la: what a cell costs more for where it is: the flight deck's landing area, for a tractor by itself)
    local more = sp.la and sp.la(k) or 1
    local ux = LU[k]
    if ux then
      local dot = (dx * ux + dz * LV[k]) / len
      if dot > 0.5 then return ((LF and LF[k]) and LANE5.withFar or LANE.with) * more end
      if dot < -0.5 then return LANE.against * more end
      return LANE.across * more
    end
    if LC[k] then return (LF and LANE5.centreCost or LANE.across) * more end
    if LX and LX[k] then return LANE5.between * more end
    return LANE.off * more
  end
  local function beside(i, j) return not (open(i + 1, j) and open(i - 1, j) and open(i, j + 1) and open(i, j - 1)) end
  -- the open cell nearest a point (itself, or one within 7 m)
  local function near(x, z)
    local i, j = cellOf(x, z)
    if open(i, j) then return i, j end
    for r = 1, math.ceil(7.5 / c) do
      local best, bi, bj
      for dj = -r, r do
        for di = -r, r do
          if max(abs(di), abs(dj)) == r and open(i + di, j + dj) then
            local cx, cz = centre(i + di, j + dj)
            local dd = (cx - x) ^ 2 + (cz - z) ^ 2
            if not best or dd < best then best, bi, bj = dd, i + di, j + dj end
          end
        end
      end
      if best then return bi, bj end
    end
    return nil
  end
  -- it sets off straight ahead; or, if where it is going lies behind it, ahead and to one side (the side nearer its
  -- goal, if that is open): the turn round is begun the way it will go on (a way that starts straight ahead and then
  -- doubles back is turned either way by the tractor: once into an aircraft's wheels, in the rig)
  local lead
  if d0 and d0.hx and hyp(a[1] - d0.x, a[2] - d0.z) < 1 then
    if (b[1] - d0.x) * d0.hx + (b[2] - d0.z) * d0.hz < 0 then
      -- (M.finderFlip: the other side than the nearer: the caller's second go, when the first could not be driven)
      local best
      for _, sd in ipairs({ 1, -1 }) do
        local lx, lz = d0.x + d0.hx * 4 - d0.hz * sd * 5, d0.z + d0.hz * 4 + d0.hx * sd * 5
        if open(cellOf(lx, lz)) and open(cellOf(d0.x + d0.hx * 3 - d0.hz * sd * 2, d0.z + d0.hz * 3 + d0.hx * sd * 2)) and open(cellOf(lx - d0.hx * 4, lz - d0.hz * 4)) then
          local dd = hyp(lx - b[1], lz - b[2])
          if M.finderFlip then dd = -dd end
          if not best or dd < best then best, lead = dd, { lx, lz } end
        end
      end
    end
    if not lead then
      local lx, lz = d0.x + d0.hx * 5, d0.z + d0.hz * 5
      if open(cellOf(lx, lz)) and open(cellOf(d0.x + d0.hx * 2.5, d0.z + d0.hz * 2.5)) then lead = { lx, lz } end
    end
  end
  local from = lead or a
  local si, sj = near(from[1], from[2])
  local gi, gj = near(b[1], b[2])
  if not (si and gi) then return nil end
  local start, goal = sj * NX + si, gj * NX + gi
  local G, parent, closed = { [start] = 0 }, {}, {}
  local heap, hn = {}, 0
  local function push(k, f)
    hn = hn + 1
    heap[hn] = { k, f }
    local n = hn
    while n > 1 do
      local q = floor(n / 2)
      if heap[q][2] <= heap[n][2] then break end
      heap[q], heap[n] = heap[n], heap[q]
      n = q
    end
  end
  local function pop()
    local top = heap[1]
    heap[1] = heap[hn]
    heap[hn] = nil
    hn = hn - 1
    local n = 1
    while true do
      local l, r, m = 2 * n, 2 * n + 1, n
      if l <= hn and heap[l][2] < heap[m][2] then m = l end
      if r <= hn and heap[r][2] < heap[m][2] then m = r end
      if m == n then break end
      heap[m], heap[n] = heap[n], heap[m]
      n = m
    end
    return top[1]
  end
  local least = LANE.with
  local function est(i, j)
    local dx, dz = abs(i - gi), abs(j - gj)
    return (dx + dz - 0.5858 * min(dx, dz)) * least
  end
  push(start, est(si, sj))
  local found, steps = false, 0
  -- (a search that is part of planning spread over frames gives up the frame every 1500 cells it takes off its
  -- list (M.pauseIn): one across the whole hangar that finds nothing was still one piece of 30 to 50 ms; all it
  -- works with is its own (what is shut, its list, where it came from): another search in between does not touch it)
  local popped = 0
  while hn > 0 do
    popped = popped + 1
    if popped % 1500 == 0 then M.pauseIn() end
    local k = pop()
    if k == goal then
      found = true
      break
    end
    if not closed[k] then
      closed[k] = true
      steps = steps + 1
      if steps > 20000 then break end
      local i, j = k % NX, floor(k / NX)
      for _, n in ipairs(NB) do
        local ni, nj = i + n[1], j + n[2]
        if open(ni, nj) and (n[3] == 1 or (open(i + n[1], j) and open(i, j + n[2]))) then
          local nk = nj * NX + ni
          if not closed[nk] then
            local cost = n[3] * factor(nk, n[1], n[2], n[3])
            if beside(ni, nj) then cost = cost + 1 end
            local g2 = G[k] + cost
            if not G[nk] or g2 < G[nk] then
              G[nk], parent[nk] = g2, k
              push(nk, g2 + est(ni, nj))
            end
          end
        end
      end
    end
  end
  if not found then return nil end
  local all, rev = { a }, {}
  if lead then all[2] = lead end
  local k = goal
  while k do
    rev[#rev + 1] = k
    k = parent[k]
  end
  for i = #rev, 1, -1 do
    local cx, cz = centre(rev[i] % NX, floor(rev[i] / NX))
    all[#all + 1] = { cx, cz }
  end
  all[#all + 1] = b
  -- drawn tight
  local function clear(p, q)
    local len = hyp(q[1] - p[1], q[2] - p[2])
    local n = max(1, math.ceil(len / (c / 2)))
    for i = 0, n do
      local x, z = p[1] + (q[1] - p[1]) * i / n, p[2] + (q[2] - p[2]) * i / n
      -- (its ends may stand where no cell is open: within 3 m of them nothing is asked)
      if hyp(x - a[1], z - a[2]) > 3 and hyp(x - b[1], z - b[2]) > 3 and not open(cellOf(x, z)) then return false end
    end
    return true
  end
  -- (what a straight stretch costs, as the cells along it are counted above)
  local function price(p, q)
    local len = hyp(q[1] - p[1], q[2] - p[2])
    if len < 1e-6 then return 0 end
    local dx, dz = (q[1] - p[1]) / len, (q[2] - p[2]) / len
    local n = max(1, math.ceil(len / (c / 2)))
    local sum = 0
    for i = 1, n do
      local t = (i - 0.5) / n
      local ci, cj = cellOf(p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t)
      local f = factor(cj * NX + ci, dx, dz, 1)
      if beside(ci, cj) then f = f + 1 end
      sum = sum + f * (len / n) / c
    end
    return sum
  end
  local cum = { 0 }
  for i = 2, #all do cum[i] = cum[i - 1] + price(all[i - 1], all[i]) end
  local out, at = { all[1] }, 1
  if lead then out[2], at = all[2], 2 end
  local span = math.ceil(60 / c)
  while at < #all do
    local nxt = at + 1
    for m = min(#all, at + span), at + 2, -1 do
      if clear(all[at], all[m]) and price(all[at], all[m]) <= cum[m] - cum[at] + 0.05 then
        nxt = m
        break
      end
    end
    out[#out + 1] = all[nxt]
    at = nxt
  end
  return out
end

-- the flight deck as it stands
FIND.base = function(x, z) return Tow.Fd.on(x, z, FIND.edge) end
-- A TRACTOR BY ITSELF KEEPS OUT OF THE LANDING AREA where a way round it costs little more (the user, 2026-11-18, with a
-- drawing of the after elevators: "The purple tugs take one of the pink routes after dropping their aircraft in order
-- to stay out of the way of the green/orange tugs": his pink ways run outboard of the landing area, along the parked
-- aircraft): a cell inside DCS's own landing strip of the ship (the hook's LA: 12.5 m either side of the line through
-- 45 m aft / 10.49 m to port, 9.14 degrees to port of the bow) costs FIND.laCost times as much. It still crosses it
-- where it must (to elevator 4 and the port side), by the shortest way across. Not for a tow's own way
-- (M.finderTow). CATCC_DEMO_NO_PINK: a test's wish.
-- (2026-11-19, the user: "tugs need their own route network for traversing the deck without a towed aircraft that
-- always keeps them out of parking areas and the major tow paths"; "If we are parking aircraft in the sixpack it
-- means the LA is closed": the landing area itself now costs 1.2 (it was 2.2: a tow's own way through it is shut
-- for a tractor by itself anyway, while it is held or waited for); A PARKING PLACE (within FIND.spotR of where an
-- aircraft stands or will stand on its deck spot, along its whole length) costs FIND.spotCost times as much, and THE
-- DECK IN FRONT OF AN ELEVATOR (26 m inboard of the platform, where every tow off it begins) FIND.frontCost. A
-- tractor still goes there where its place or its aircraft is. FIND.laC: kept; made anew when the demo starts.)
FIND.laCost, FIND.laC = 1.2, {}
FIND.spotCost, FIND.spotR, FIND.frontCost, FIND.goalR = 2.5, 9.5, 1.5, 16
-- (the whole aircraft for a tractor by itself: { metres ahead of its own position, radius }: its tail and tailplane,
-- its wings (4.2 m to the folded tip, the tractor's half width and half a metre), its nose (a metre to the side):
-- four discs of one size reached 3.8 m beyond the nose: the street between the six-pack's noses and the corral's
-- was then shut, and the places in front of elevator 2 with it)
FIND.whole = { { -6.6, 5.0 }, { -2.2, 5.9 }, { 2.0, 5.9 }, { 6.3, 3.2 } }
FIND.la = function(k)
  if CATCC_DEMO_NO_PINK or M.finderTow then return 1 end
  -- (not within FIND.goalR of where it is going (M.finderGoal: findWay): its way in is the way that fits its last turn)
  local G = M.finderGoal
  if G then
    local i = k % FIND.nx
    local j = (k - i) / FIND.nx
    local dx, dz = FIND.x0 + (i + 0.5) * FIND.c - G[1], FIND.z0 + (j + 0.5) * FIND.c - G[2]
    if dx * dx + dz * dz < FIND.goalR * FIND.goalR then return 1 end
  end
  local v = FIND.laC[k]
  if v == nil then
    local i = k % FIND.nx
    local j = (k - i) / FIND.nx
    local x, z = FIND.x0 + (i + 0.5) * FIND.c, FIND.z0 + (j + 0.5) * FIND.c
    v = (math.abs((x + 45) * 0.15877 + (z + 10.49) * 0.98731) < 12.5) and FIND.laCost or 1
    if not CATCC_DEMO_NO_ZONES then
      local r2 = FIND.spotR * FIND.spotR
      for _, a in ipairs(M.aircraft or {}) do
        local sp = a.spot
        if sp and sp.x and sp.fx and (sp.x - x) ^ 2 + (sp.z - z) ^ 2 < 400 then
          local ux, uz = unit(sp.fx, sp.fz)
          for _, q in ipairs(FIND.whole) do
            local u = q[1]
            if (sp.x + ux * u - x) ^ 2 + (sp.z + uz * u - z) ^ 2 < r2 then
              v = v * FIND.spotCost
              break
            end
          end
          if v >= FIND.spotCost then break end
        end
      end
      for kk = 1, 4 do
        local e = H.elevators[kk]
        local zin = (e.z[1] + e.z[2]) > 0 and math.min(e.z[1], e.z[2]) or math.max(e.z[1], e.z[2])
        local sgn = (e.z[1] + e.z[2]) > 0 and -1 or 1
        local dzz = (z - zin) * sgn
        if x > e.x[1] - 2 and x < e.x[2] + 2 and dzz > 0 and dzz < 26 then v = v * FIND.frontCost end
      end
    end
    FIND.laC[k] = v
  end
  return v
end
-- (M.finderTow = { skip = the aircraft in tow, wide = metres more }: the way is for a tractor WITH AN AIRCRAFT ON ITS
-- BAR: every other aircraft and every standing tractor is shut that much wider)
FIND.stamp = function(mark, box)
  local tw = M.finderTow
  -- (tw.walls: circles shut for this way only)
  for _, q in ipairs(tw and tw.walls or {}) do mark(q[1], q[2], q[3]) end
  for _, o in ipairs(M.aircraft) do
    if o.id and o.level == 'deck' and not (tw and tw.skip == o) then
      -- (M.finderForce: a tractor driving out through what the others hold: 3 m more round an aircraft that is in tow:
      -- it moves: the rig, 2026-11-19: one passed 4.1 m from the centre line of an aircraft on another's bar)
      for _, u in ipairs(FIND.along) do mark(o.x + o.fx * u, o.z + o.fz * u, FIND.wheels + (tw and tw.wide or 0) + ((M.finderForce and o.towed) and 3 or 0)) end
      -- (A TRACTOR BY ITSELF: THE WHOLE AIRCRAFT, nose to tail and wing tip to wing tip, and its own half width and half
      -- a metre: the user, 2026-11-19: "A tug drives through that aircraft just moments after": it kept 3.4 m from
      -- the wheels and drove under noses, wings and tails. M.finderUnder: the second go, where there is no way
      -- clear of them all (findWay). CATCC_DEMO_UNDER_WINGS: as it was.)
      -- (not the aircraft it stands at: it has just put that one on its spot, or stands at its nose, inside this
      -- outline already: it leaves from there (M.finderStart: findWay): the rig: after a tow into a row it was shut
      -- in by its own aircraft's outline and its neighbours', and there was "no way clear" at all)
      if not tw and not M.finderUnder and not CATCC_DEMO_UNDER_WINGS then
        local st, at = M.finderStart, false
        if st then
          for _, q in ipairs(FIND.whole) do
            if (o.x + o.fx * q[1] - st[1]) ^ 2 + (o.z + o.fz * q[1] - st[2]) ^ 2 < q[2] * q[2] then at = true end
          end
        end
        if not at then
          for _, q in ipairs(FIND.whole) do mark(o.x + o.fx * q[1], o.z + o.fz * q[1], q[2]) end
        end
      end
    end
  end
  local pj = liveJet()
  if pj then
    for _, u in ipairs(FIND.along) do mark(pj.x + pj.fx * u, pj.z + pj.fz * u, FIND.wheels + 1) end
  end
  for _, bl in ipairs(ENV_DECK.blocks()) do box(bl[1] - 1, bl[2] + 1, bl[3] - 1, bl[4] + 1) end
  local own = M.finderTug
  for _, j in ipairs(M.jobs) do
    if j.level == 'deck' and j.tug ~= own then
      if not M.finderFree then
        -- (one that stands waiting for THIS tractor to pass: what stands there: as in `free`)
        local st = M.standsFor(j, own, not M.finderTow)
        if st then
          for _, q in ipairs(st) do mark(q[1], q[2], q[3] + 1.5) end
        elseif not M.finderTow and j.tPull and CATCC_DEMO_LANES5 then
          -- (a tow, for a tractor by itself: its band (M.towBand), and what that tractor holds (SOLO) and a little)
          for _, q in ipairs(M.towBand(j)) do mark(q[1], q[2], q[3] + SOLO + 0.3) end
        else
          for _, q in ipairs(j.circles) do mark(q[1], q[2], q[3] + (q[3] < 2 and 1.5 or 2.4)) end
        end
      end
      -- (and where its tractor is at this moment; 6 m for one that drives out through what the others hold: the rig,
      -- 2026-11-19: it passed 3.0 m from the tractor of a tow that stood waiting for it)
      local q = tugDisc(j.tug)
      mark(q[1], q[2], M.finderForce and 6.0 or 4.5)
    end
  end
  for _, t in ipairs(M.tugs) do
    if t ~= own and t.level == 'deck' and not t.job then
      local q = tugDisc(t)
      mark(q[1], q[2], 4.5 + (tw and tw.wide or 0))
    end
  end
  -- (the way an aircraft waits for on its platform (M.pending): shut for a tractor by itself)
  if not M.finderFree and not tw then
    local now = Tow.now()
    for _, P in pairs(M.pending or {}) do
      if now - P.at < 8 and P.tug ~= own then
        for _, q in ipairs(P.cs) do mark(q[1], q[2], q[3] + 1.5) end
      end
    end
  end
end
local function findWay(_, a, b, _, d0)
  laneField()
  M.finderGoal = (not M.finderTow) and b or nil
  M.finderStart = a
  local way = astar(FIND, a, b, d0)
  -- (a tractor by itself, no way clear of the whole of every aircraft: once more, clear of their wheels only; counted)
  if (not way or #way < 2) and not M.finderTow and not CATCC_DEMO_UNDER_WINGS then
    M.finderUnder = true
    way = astar(FIND, a, b, d0)
    M.finderUnder = nil
    if way and #way >= 2 then
      M.under = (M.under or 0) + 1
      logLine(string.format('demo: %s: no way clear of the whole of every aircraft from %.0f / %.0f to %.0f / %.0f: one that keeps clear of their wheels only', tostring(M.finderTug and M.finderTug.name or 'a tractor'), a[1], a[2], b[1], b[2]))
    end
  end
  M.finderGoal, M.finderStart = nil, nil
  return way
end
ENV_DECK.finder = findWay

-- the hangar as it stands
HFIND.base = function(x, z)
  -- (a platform is not a tractor's way: it only ever stands on a platform's inboard edge, at the end of a push)
  if cell(x, z) ~= '.' then return false end
  local m = HFIND.edge + (M.finderWide or 0)
  for _, q in ipairs({ { m, 0 }, { -m, 0 }, { 0, m }, { 0, -m }, { m * 0.7, m * 0.7 }, { m * 0.7, -m * 0.7 }, { -m * 0.7, m * 0.7 }, { -m * 0.7, -m * 0.7 } }) do
    if not ENV_HANGAR.inside(x + q[1], z + q[2]) then return false end
  end
  return true
end
HFIND.stamp = function(mark, box)
  -- (a platform that is down, and its doorway, are floor to a tractor: opened below, as cells of their own)
  local jet = M.finderJet
  for _, o in ipairs(M.aircraft) do
    if o.id and (o.level == 'hangar' or o.level == 'el') then
      for _, u in ipairs(FIND.along) do mark(o.x + o.fx * u, o.z + o.fz * u, o == jet and HFIND.own or (HFIND.wheels + (M.finderWide or 0))) end
    end
  end
  local own = M.finderTug
  for _, j in ipairs(M.jobs) do
    if j.level == 'hangar' and j.tug ~= own then
      if not M.finderFree then
        for _, q in ipairs(j.circles) do mark(q[1], q[2], q[3] + 1.2) end
      end
      local q = tugDisc(j.tug)
      mark(q[1], q[2], 3.6)
    end
  end
  for _, t in ipairs(M.tugs) do
    if t ~= own and t.level == 'hangar' and not t.job then
      local q = tugDisc(t)
      mark(q[1], q[2], 4.6)
    end
  end
end
local function hangarWay(_, a, b, _, d0)
  -- (the platforms that are down are part of the floor: the map's own answer is asked afresh for their cells)
  local sig = 0
  for k = 1, 4 do
    if M.el and M.el[k] and M.el[k].state == 'down' then sig = sig + 2 ^ k end
  end
  sig = sig + 100 * (M.finderWide or 0)
  if HFIND.sig ~= sig then HFIND.sig, HFIND.deck = sig, {} end
  return astar(HFIND, a, b, d0)
end
ENV_HANGAR.finder = hangarWay
-- A TRACTOR'S WAY THROUGH THE FULL HANGAR, WITH MORE ROOM FIRST (2026-11-18: the cheapest way through the cells hugs
-- the walls and the other aircraft's wheels, and a tractor that turns on 4 m cannot always follow its corners: driven
-- in the head it left the floor, and the tow waited for the hangar to change): the way-finder is asked for a way that
-- keeps 1.5 m more from the walls and from every other aircraft's wheels, then 0.7 m more, then as it was: WIDE. A
-- caller tries them in that order (hangarWide(i, ...): the i-th, or nil).
local WIDE = { 1.5, 0.7, 0 }
local function hangarWide(i, a, b, d0)
  M.finderWide = WIDE[i]
  local way = hangarWay(nil, a, b, nil, d0)
  M.finderWide = nil
  return way
end

-- something has changed (a tow started, an aircraft was delivered, a tractor is back, an elevator arrived): what
-- could not be done before is looked at again
-- (h: down in the hangar, or an elevator: what the hangar's own planning waits for: M.sigH)
local function changed(h)
  M.sig = (M.sig or 0) + 1
  if h then M.sigH = (M.sigH or 0) + 1 end
end

local function reachOf()
  local alongIn = Tow.pins(M.thetaIn)
  return math.sqrt(alongIn ^ 2 - (Tow.axleUp() - TOW.hitchUp) ^ 2) + TOW.hitch
end

-- AN AIRCRAFT THAT GOES SECOND (LOADS' `after`: its way leads past the other, or the other's spot is filled first)
-- waits only until the other is OUT OF ITS WAY, not until it stands on its spot (the user, 2026-11-18, after the run:
-- "there's no reason a tug couldn't pull an aircraft off of the hangar onto the flight deck before the path is
-- fully clear to park its aircraft if that means releasing the elevator to return to the hangar to get more
-- aircraft"): the other is parked, or it is in tow on the flight deck, off the platforms and 16 m and more away.
-- Its own tow is then planned with the other where it is and where it is going (`others`), and follows it (`free`:
-- it starts behind, and stops short of what the two share until the other has passed).
function M.waitsFor(a)
  local o = a.after
  if not (o and o.id) or o.parked then return false end
  -- (the other is still in the hangar: the two did not come up together: it would wait for one that waits for its platform)
  if o.level == 'hangar' then return false end
  -- (CATCC_DEMO_NO_FOLLOW: a test's wish: it waits until the other stands on its spot, as it did)
  -- (AS SOON AS THE OTHER IS IN TOW: the two are held against each other tight (`free`): the user, 2026-11-18, with a
  -- drawing of the after elevators: the aftmost aircraft is taken off first and "at the same time, tugs take the
  -- forewardmost aircraft into the landing area". CATCC_DEMO_ONE_WAITS: as it was: off the platform and 16 m away.)
  -- (2026-11-19: 16 m away and off the platform again for these: an aircraft has an `after` because its way crosses
  -- the other's: begun at the same moment, the two tows off elevator 4 to Port 2 and Port 3 (now Port quarter 2 and 3) were swapped every 30 s
  -- where their ways cross and passed 3.5 m from each other's tractors. The two of a platform that have no `after`
  -- between them still leave together.)
  if not CATCC_DEMO_NO_FOLLOW and o.towed and o.level == 'deck' and not onPlatform(o.x, o.z) and hyp(o.x - a.x, o.z - a.z) >= 16 then return false end
  -- (IT HOOKS ON AS SOON AS THE OTHER IS IN TOW (2026-11-20, the user, of the two first off elevator 3: "The second tug
  -- waits until the first aircraft is off the elevator to begin connecting. Why? The connections could happen in
  -- parallel"): its tow is planned and begun then, and it stands hooked on until the other is off the platform and
  -- 16 m away (M.pairClose: giveWay holds it at the start of its pull). NOT PULLED BEFORE THAT: tried in the rig the
  -- same day: the two off elevator 2 were pulled side by side and turned away from each other, and their tails swung
  -- to 5.7 m centre line to centre line (a Hornet's tailplane is 6.6 m across): what two tows are held against each
  -- other by is the tractor's track, not the aircraft's tail as it swings. CATCC_DEMO_FOLLOW16: it is not begun
  -- before then either, as it was.)
  if not CATCC_DEMO_NO_FOLLOW and not CATCC_DEMO_FOLLOW16 and o.towed and o.level == 'deck' then return false end
  return true
end
-- (the other of its platform, which it goes second to, is still on the platform or within 16 m: see M.waitsFor)
function M.pairClose(a)
  local o = a and a.after
  if CATCC_DEMO_FOLLOW16 or CATCC_DEMO_NO_FOLLOW or not (o and o.id) or o.parked or o.level ~= 'deck' then return nil end
  if onPlatform(o.x, o.z) or hyp(o.x - a.x, o.z - a.z) < 16 then return o end
  return nil
end

-- A TRACTOR BY ITSELF DRIVES FAST ONLY WHERE IT IS NOT AMONG AIRCRAFT (the user, 2026-11-18: "up to 3.0x faster with
-- no aircraft in tow if not in a congested area (i.e. driving under an aircraft wing)"): its cap for the hook
-- (d.cap): within 2.5 m of the outline of an aircraft of its deck it keeps to the plain pace (TOW.speed); elsewhere
-- it may go up to TOW.fastSolo on the straights (the hook slows it for bends itself).
function M.capFor(level)
  return function(x, z)
    local T
    for _, a in ipairs(M.aircraft) do
      if a.id and (a.level == level or (level == 'hangar' and a.level == 'el')) and (a.x - x) ^ 2 + (a.z - z) ^ 2 < 196 then
        T = T or { { x, z, x, z, 0.9 } }
        if Tow.Fd.gap(T, Tow.Fd.shape(a.x, a.z, a.fx, a.fz, HALF)) < 2.5 then return TOW.speed end
      end
    end
    return nil
  end
end

-- a direction turned `deg` degrees (from forward towards starboard); nil or 0: as it is
function M.turned(fx, fz, deg)
  if not deg or deg == 0 then return fx, fz end
  local c, sn = math.cos(math.rad(deg)), math.sin(math.rad(deg))
  return fx * c - fz * sn, fx * sn + fz * c
end

-- ---------------------------------------------------------------- a tow, as the hook drives it
local function newTow(tug, a, plan, arrive, opts)
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  local reach = reachOf()
  local floor = a.y - DY
  -- (plan.alpha: THE NOSE WHEEL TURNED AT THE HOOK-UP (the user, 2026-11-18: "Tugs may connect to aircraft with the
  -- nosewheel turned initially if required. In these cases, the nosewheel and towbar should be rotated together after
  -- the connection is made, then connected to the tug"): the tractor comes to the bar's line as it will be turned; the
  -- bar, which is on the aircraft already, and the nose wheel are turned onto that line together (the hook's phase
  -- 'turn': w.turnTo), and then the tractor is hooked on)
  local ux, uz = M.turned(fx, fz, plan.alpha)
  local w = { phase = 'arrive', t0 = Tow.now(), jet = a.id, bar = 'gear', theta = M.thetaIn, clamped = true, thetaIn = M.thetaIn, jy = a.y, floor = floor, nx = nx, nz = nz,
    mx = a.x - fx * TOW.mainGear, mz = a.z - fz * TOW.mainGear, jx = a.x, jz = a.z, jfx = fx, jfz = fz, hitchAt = { x = nx + ux * reach, z = nz + uz * reach, hx = ux, hz = uz },
    turnTo = (plan.alpha and plan.alpha ~= 0) and { ux, uz } or nil,
    deck = opts.level == 'deck' and 'flight' or 'hangar', dest = plan.dest, push = plan.push, pushText = plan.pushText, towR = TOW.towR, soft = plan.soft,
    subj = { e = a, id = a.id, own = true, name = a.name }, ship = M.ship, others = opts.others, half = HALF,
    ids = { tug = tug.id, bar = a.bar, tugOwn = true, barOwn = true }, keepBar = true, quiet = true, name = tug.name, env = opts.env, driver = tug.driver, home = tug.home,
    arc = opts.arc, pull = plan.pull }
  w.d = tug.d
  w.d.v, w.d.turnR = 0, nil
  w.ux, w.uz, w.lx, w.lz = fx, fz, nx, nz
  w.ringUp, w.lugUp = TOW.bar.ringRest, Tow.axleUp()
  w.soloCap = M.capFor(opts.level == 'deck' and 'deck' or 'hangar')
  w.d.cap = w.soloCap
  Tow.path(w, arrive, TOW.speed, TOW.fastSolo)
  if opts.backOut and opts.backOut > 0 then w.phase, w.backOut = 'backout', { len = opts.backOut, s = 0, v = 0 } end
  return w
end

-- THE HANGAR'S TRACTORS BEGIN HOOKED ON TO THEIR FIRST AIRCRAFT (the user, 2026-11-19: "to speed up the first tows out of
-- each elevator, spawn the hangar tugs attached to their first aircraft to be towed"). At the start each tractor that
-- stands at the nose of its elevator's first aircraft (the plan's `start`) is hooked on there and then: a tow of the
-- hook's own is made for the two, with the turn of the nose wheel and the hitch the solved tow has, and driven in no
-- time as far as 'hooked' (bar lifted, tractor on the ring); it then rests (w.paused) until that tow begins
-- (hsearch), which takes it over as it is and has only to push or pull. If the tractor is given anything else first,
-- or the tow that begins is another (another hitch, another turn of the nose wheel), the bar is put back on its
-- foot and the tractor stands where it is (M.preDrop). CATCC_DEMO_NO_SPAWNHOOK: as it was: it hooks on when the tow
-- begins (6 s).
function M.preHook(t, ctx)
  local ld = t.claim and t.claim.ld
  local a = ld and ld.a
  if not a or not a.id or not a.bar or CATCC_DEMO_NO_SPAWNHOOK then return end
  local T = H.tows and H.tows[ld.n]
  local alpha = T and T.alpha or nil
  local mt = Tow.now()
  local d0 = { x = t.d.x, z = t.d.z, hx = t.d.hx, hz = t.d.hz }
  local w = newTow(t, a, { alpha = alpha }, { { t.d.x, t.d.z }, { t.d.x + t.d.hx * 0.3, t.d.z + t.d.hz * 0.3 } }, { level = 'hangar', env = ENV_HANGAR, others = {} })
  w.frontHitch = t.claim.front or nil
  w.last = mt
  local tf = mt
  for _ = 1, 400 do
    if w.bar == 'both' then break end
    tf = tf + 0.25
    local okt, good = pcall(Tow.tickOne, w, ctx, tf)
    if not okt or not good then break end
  end
  Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks = nil, nil, nil
  if w.bar ~= 'both' then
    -- (not hooked on: as it stood)
    t.d.x, t.d.z, t.d.hx, t.d.hz, t.d.v = d0.x, d0.z, d0.hx, d0.hz, 0
    placeAircraft(a)
    logLine(string.format('demo: %s could not be hooked on to %s at the start (the tow came as far as %s): it hooks on when its tow begins', t.name, tostring(a.board), tostring(w.phase)))
    return
  end
  w.paused, w.last, w.clock = true, nil, nil
  t.d.v = 0
  a.preHooked = true
  t.pre = { w = w, a = a, alpha = alpha or 0, front = (t.claim.front and true) or false }
  M.preN = (M.preN or 0) + 1
  logLine(string.format('demo: %s begins hooked on to %s, the first of elevator %d%s', t.name, tostring(a.board), t.el or 0, t.claim.front and ' (on its front hitch)' or ''))
end
-- (the tractor is given something else, or another tow of that aircraft: the bar back on its foot)
function M.preDrop(t)
  local pre = t.pre
  if not pre then return end
  t.pre = nil
  local x, z, hx, hz = Tow.real(pre.w)
  t.d.x, t.d.z, t.d.hx, t.d.hz, t.d.v = x, z, hx, hz, 0
  pre.a.preHooked = nil
  if not pre.a.towed then placeAircraft(pre.a) end
  logLine(string.format('demo: %s is no longer hooked on to %s (it is given something else first): the bar is back on its foot', t.name, tostring(pre.a.board)))
end

-- ---------------------------------------------------------------- IN THE HANGAR
-- THE HANGAR IS PACKED AS THE USER DREW IT (crewtest_hangar.lua: the layer "Hangar Spotting" of his deck drawing):
-- packs of five (three abreast nose one way, two nose the other way tucked between their noses) and single aircraft
-- across the elevators' doorways; no lane. An aircraft comes out when the ones between it and its elevator have gone
-- ("crews would be parking aircraft in a certain order so that the aircraft they need to access first are
-- accessible"): the order is LOADS'; whether a tow can be driven NOW is tried in the head (the hook's own planners,
-- against the walls, the fittings and every aircraft still there), and an elevator takes the first of its aircraft
-- that can.
-- A TOW HAS ONE REVERSAL AT MOST (the user: "They can reverse and go back and forth ... maybe set 1 reversal max to
-- begin with"). Onto a platform an aircraft always goes tail first, its nose inboard, the tractor inboard of it (a
-- tractor does not ride an elevator). So:
--   pushed all the way   its tail towards the doorway: straight back, or back along its own line and round into the
--                        doorway (the hook's push: the main wheels steered along the way, the tractor following);
--   pulled, then pushed  its nose towards the doorway: drawn out nose first along its own line, round onto the line
--                        through the place on the platform, across the hangar until the whole tow is in line, and
--                        pushed straight back.
-- THE TRACTOR COMES ALONGSIDE (the user's sketch: under a wing, past the nose, into the space ahead of it): there is
-- no room in a pack to turn round in front of a nose. It drives up beside the aircraft's forward fuselage, 3 m off
-- its centre line, under its wing and its neighbour's, swings onto the nose line ahead of the nose and backs onto the
-- bar's ring.

-- the points of an aircraft the hook holds against the hangar's walls (Tow.Fd.check), about its own position
local WALL_PTS = { { 8.4, 0 }, { 5.5, 0 }, { -2.2, 4.2 }, { -2.2, -4.2 }, { -0.6, 3.9 }, { -0.6, -3.9 }, { -3.8, 3.9 }, { -3.8, -3.9 }, { -8.3, 0 }, { -7.0, 3.1 }, { -7.0, -3.1 } }

-- the hangar for a tow of aircraft a. THE USER'S PLAN STANDS THE AIRCRAFT HARD AGAINST WHAT THE MAP HAS AS HIGH (he
-- drew over the walls cut at 1.5 m): a few tails over a step at the forward end, and the port row's wing tips tucked
-- BETWEEN the wall's pillars, 12 cm inside their line. What is in the strip an aircraft stands in (its own length and
-- a little, its wing's width and 15 cm either side) does not count against its own tow: it is drawn out of there the
-- way it was put in.
-- (kUp: that elevator's platform is floor although it is up: a tow planned onto it that stops short of its door)
local function hangarEnv(a, kUp)
  local ax, az, afx, afz = a.x, a.z, a.fx, a.fz
  local inside = ENV_HANGAR.inside
  if kUp then inside = function(x, z) return ENV_HANGAR.inside(x, z) or onPlatform(x, z) == kUp end end
  return { inside = inside, blocks = ENV_HANGAR.blocks, finder = ENV_HANGAR.finder, own = a.name,
    wall = function(x, z)
      if cell(x, z) ~= '#' then return false end
      local u, v = (x - ax) * afx + (z - az) * afz, (x - ax) * -afz + (z - az) * afx
      return not (u > -9.2 and u < 9.2 and v > -4.35 and v < 4.35)
    end }
end

-- the other aircraft down there, for a tow of a to elevator E: those in the hangar and those on E's platform
local function hangarOthers(a, E, follow)
  local oth = others('hangar', a)
  -- (follow: an aircraft that is under way onto a platform that is down (M.followable): WHERE IT WILL STAND, not where
  -- it is at this moment: the tow asked about may follow it (free: cs.followFrom; M.followTick))
  if follow and not CATCC_DEMO_NO_HFOLLOW then
    for _, j in ipairs(M.jobs) do
      if j.a ~= a and M.followable(j) then
        local S = H.elevators[j.E.k].stations[j.load.st]
        for i = #oth, 1, -1 do
          if oth[i].name == j.a.name then table.remove(oth, i) end
        end
        oth[#oth + 1] = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = j.a.name .. ', where it is being towed to', half = HALF, shape = Tow.Fd.shape(S.x, S.z, S.fx, S.fz, HALF) }
      end
    end
  end
  for _, r in ipairs(E and E.riders or {}) do
    if r ~= a then oth[#oth + 1] = { x = r.x, z = r.z, fx = r.fx, fz = r.fz, name = r.name, half = HALF, shape = Tow.Fd.shape(r.x, r.z, r.fx, r.fz, HALF) } end
  end
  return oth
end

-- what an aircraft sweeps where it stands with its nose wheel at (lx, lz) and its main wheels at (mx, mz): three circles
local function bodyCircles(out, lx, lz, mx, mz)
  local fx, fz = unit(lx - mx, lz - mz)
  local x, z = lx - fx * TOW.noseGear, lz - fz * TOW.noseGear
  out[#out + 1] = { x + fx * 5.2, z + fz * 5.2, 5.0 }
  out[#out + 1] = { x, z, 5.0 }
  out[#out + 1] = { x - fx * 5.2, z - fz * 5.2, 5.0 }
  return out
end

-- THE TOW IN THE HANGAR: aircraft a from where it stands onto place `st` of elevator k (which is down): THE WAYS TO
-- TRY, each a function that gives the plan (with plan.sweep: what it sweeps, as circles), or nil and why it cannot be
-- driven. (One is tried a frame: a way driven in the head takes some hundredths of a second, and there are a dozen
-- for an aircraft: tried all at once, the first build held the game for a second or two every time something moved.)
-- ready: not onto the platform (it is up) but to the place short of its door (READY), on the same line.
local function hangarCands(a, k, st, oth, ready)
  local e = H.elevators[k]
  local S0 = e.stations[st]
  local S = S0
  local s = S.fz < 0 and 1 or -1 -- (which side the platform is on: 1 starboard)
  if ready then S = { x = S.x, z = s * (s > 0 and READY.stbd or READY.port), fx = S.fx, fz = S.fz } end
  local reach = reachOf()
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  local L = TOW.noseGear + TOW.mainGear
  local st0 = { d = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch, blocks = {}, others = oth, half = HALF }
  local name = string.format(ready and 'the door of elevator %d, place %d' or 'elevator %d, place %d', k, st)
  local dest = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, short = name }
  local mF = { x = S.x - S.fx * TOW.mainGear, z = S.z - S.fz * TOW.mainGear }
  Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, dest)
  local out = {}
  local function no(what, why)
    Tow.Fd.log(string.format('tow: %s to %s, %s, is not driven: %s', tostring(a.board), name, what, tostring(why)))
    return nil, why
  end
  local across = math.abs(fx * S.fx + fz * S.fz) > 0.9 -- (it stands across the hangar, as the place on the platform does)
  -- 1. PUSHED ALL THE WAY: the place lies behind it
  -- (ready: onto the platform itself, as if it were down: the push stops short of the door: door)
  local door = ready and { s = s, lim = s > 0 and READY.line.stbd or READY.line.port, x1 = e.x[1], x2 = e.x[2] } or nil
  local S, dest, mF, st0 = S, dest, mF, st0
  if ready then
    local name0 = string.format('elevator %d, place %d', k, st)
    S = S0
    dest = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name0, short = name0 }
    mF = { x = S.x - S.fx * TOW.mainGear, z = S.z - S.fz * TOW.mainGear }
    st0 = { d = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch, blocks = {}, others = oth, half = HALF }
    Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, dest)
  end
  if (S.x - a.x) * -fx + (S.z - a.z) * -fz > 2 and (not across or fx * S.fx + fz * S.fz > 0) then
    local Ks = {}
    if across then
      -- straight back: what little it stands off the place's line is taken out in a shallow S: 5 m back along its own
      -- line, across to the place's line at 10 (then 15, 6) degrees, and on along that
      for _, deg in ipairs({ 10, 15, 6 }) do
        local K1 = { st0.mx - fx * 5, st0.mz - fz * 5 }
        local run = math.max(4, math.abs(S.x - K1[1]) / math.tan(math.rad(deg)))
        local K2 = { S.x, K1[2] + s * run }
        if s * (mF.z - K2[2]) > 5 then Ks[#Ks + 1] = { K2[1], K2[2], pts = { K1, K2 } } end
      end
    else
      -- back along its own line and round into the doorway; or across towards the hangar's middle on the way; each
      -- also with its first 6 m straight back along its own line (an aircraft the user stood askew beside a fitting
      -- comes out the way it points)
      local kzs = { a.z, a.z * 0.5, 0, -s * 4, s * 4 }
      for _, kz in ipairs(kzs) do
        if (S.x - st0.mx) * -fx > 5 and s * (mF.z - kz) > 8 then Ks[#Ks + 1] = { S.x, kz } end
      end
      local K1 = { st0.mx - fx * 6, st0.mz - fz * 6 }
      for _, kz in ipairs(kzs) do
        if (S.x - K1[1]) * -fx > 5 and s * (mF.z - kz) > 8 then Ks[#Ks + 1] = { S.x, kz, pts = { K1, { S.x, kz } } } end
      end
      -- (out of a row along a wall, its wing tip a metre from the wall's fittings: first 10 m back and 3 m in towards
      -- the hangar's middle, a shallow slant: the nose swings no more than 3 m outwards on it)
      if math.abs(a.z) > 6 then
        local inb = a.z > 0 and -1 or 1
        local Ka = { st0.mx - fx * 10, st0.mz - fz * 10 + inb * 3 }
        for _, kz in ipairs({ Ka[2], a.z * 0.5, 0 }) do
          if (S.x - Ka[1]) * -fx > 5 and s * (mF.z - kz) > 8 then Ks[#Ks + 1] = { S.x, kz, pts = { Ka, { S.x, kz } }, slant = true } end
        end
      end
    end
    -- ANY WAY IT STANDS (the user's own layout, 2026-11-18: aircraft at an angle across the hangar, and abeam a doorway;
    -- until then the ways above were all there was: for an aircraft along the ship, or within 26 degrees of square
    -- across it). The main wheels' way, whatever the aircraft's heading:
    --   (a) back along its own line to where that meets the place's line, and out along that;
    --   (b) back along its own line 3 / 6 / 10 m, then slanting to the place's line 6 / 10 / 14 m further out, and out
    --       along it: each bend 75 degrees at most (80 into the place's line).
    do
      local bx, bz = -fx, -fz
      local function ang(ux, uz, vx, vz)
        local d = (ux * vx + uz * vz) / math.max(1e-9, hyp(ux, uz) * hyp(vx, vz))
        return math.deg(math.acos(math.max(-1, math.min(1, d))))
      end
      local seen = {}
      for _, K in ipairs(Ks) do seen[string.format('%.0f/%.0f/%d', K[1], K[2], K.pts and #K.pts or 0)] = true end
      local function add(K)
        local key = string.format('%.0f/%.0f/%d', K[1], K[2], K.pts and #K.pts or 0)
        if not seen[key] then
          seen[key] = true
          K.any = true
          Ks[#Ks + 1] = K
        end
      end
      if math.abs(bx) > 0.05 then
        local t = (S.x - st0.mx) / bx
        local zx = st0.mz + bz * t
        if t > 1.5 and s * (mF.z - zx) > 6 then add({ S.x, zx }) end
      end
      for _, d in ipairs({ 3, 6, 10 }) do
        local K1 = { st0.mx + bx * d, st0.mz + bz * d }
        for _, far in ipairs({ 6, 10, 14 }) do
          local kz = K1[2] + s * far
          local ux, uz = S.x - K1[1], kz - K1[2]
          if hyp(ux, uz) >= 3 and ang(ux, uz, bx, bz) <= 75 and ang(ux, uz, 0, s) <= 80 and s * (mF.z - kz) > 6 then add({ S.x, kz, pts = { K1, { S.x, kz } } }) end
        end
      end
    end
    for _, rho in ipairs(across and { 15, 9, 6 } or { TOW.backR, 9, 4 }) do
      for _, K in ipairs(Ks) do
        out[#out + 1] = function()
          local rec, facts = Tow.Fd.back(st0, mF, S.fx, S.fz, K, rho)
          if rec then
            local sweep = {}
            for i = 1, #rec, 40 do
              local r = rec[i]
              bodyCircles(sweep, r[5], r[6], r[7], r[8])
              sweep[#sweep + 1] = { r[1], r[2], 2.6 }
            end
            bodyCircles(sweep, mF.x + S.fx * L, mF.z + S.fz * L, mF.x, mF.z)
            return { kind = 'spot', dest = dest, push = { mF = mF, hx = S.fx, hz = S.fz, K = K, rho = rho }, sweep = sweep, door = door,
              note = (across and not K.any) and string.format('pushed straight back %.1f m', facts.len) or string.format('pushed back %.1f m, tail first, round %.1f / %.1f into the doorway', facts.len, K[1], K[2]) }
          end
          return no(string.format('pushed all the way round %.1f / %.1f on %.0f m%s', K[1], K[2], rho, K.slant and ', first slanting in from the wall' or ((K.pts and not across) and ', its first 6 m straight back' or '')), facts)
        end
      end
    end
  end
  -- DRAWN OUT A LITTLE, THEN PUSHED BACK ROUND INTO THE DOORWAY (the user's layout, 2026-11-18: an aircraft across the
  -- hangar whose tail stands a metre or two from the wall beside the doorway: pushed from where it stands its tail
  -- goes into the wall; drawn out 5 / 9 m the way it points first, it comes round into the doorway). One reversal,
  -- as the user allowed. The main wheels' way back: from where the pull leaves them, slanting to the place's line
  -- 4 / 8 / 12 m further out, and out along it; each bend 80 degrees at most.
  if (S.x - a.x) * -fx + (S.z - a.z) * -fz > 2 and math.abs(fx) < 0.9 then
    local function ang(ux, uz, vx, vz)
      local d = (ux * vx + uz * vz) / math.max(1e-9, hyp(ux, uz) * hyp(vx, vz))
      return math.deg(math.acos(math.max(-1, math.min(1, d))))
    end
    for _, d in ipairs({ 5, 9 }) do
      local m1 = { st0.mx + fx * d, st0.mz + fz * d }
      for _, far in ipairs({ 4, 8, 12 }) do
        local kz = m1[2] + s * far
        local ux, uz = S.x - m1[1], kz - m1[2]
        if hyp(ux, uz) >= 3 and ang(ux, uz, -fx, -fz) <= 80 and ang(ux, uz, 0, s) <= 80 and s * (mF.z - kz) > 6 then
          for _, rho in ipairs({ TOW.backR, 4 }) do
            local K = { S.x, kz }
            out[#out + 1] = function()
              local path = { { st0.d.x, st0.d.z }, { st0.d.x + fx * d, st0.d.z + fz * d } }
              local res, why = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
              if not res then return no(string.format('drawn out %d m and pushed back round %.1f / %.1f', d, K[1], K[2]), 'on the pull ' .. tostring(why)) end
              local st1 = { d = res.d, lx = res.lx, lz = res.lz, mx = res.mx, mz = res.mz, fl = st0.fl, blocks = st0.blocks, others = st0.others, half = st0.half }
              local rec, facts = Tow.Fd.back(st1, mF, S.fx, S.fz, K, rho)
              if not rec then return no(string.format('drawn out %d m and pushed back round %.1f / %.1f on %.0f m', d, K[1], K[2], rho), facts) end
              local sweep = bodyCircles({}, st0.lx, st0.lz, st0.mx, st0.mz)
              bodyCircles(sweep, res.lx, res.lz, res.mx, res.mz)
              sweep[#sweep + 1] = { res.d.x, res.d.z, 2.6 }
              for i = 1, #rec, 40 do
                local r = rec[i]
                bodyCircles(sweep, r[5], r[6], r[7], r[8])
                sweep[#sweep + 1] = { r[1], r[2], 2.6 }
              end
              bodyCircles(sweep, mF.x + S.fx * L, mF.z + S.fz * L, mF.x, mF.z)
              return { kind = 'spot', dest = dest, pull = path, push = { mF = mF, hx = S.fx, hz = S.fz, K = K, rho = rho }, sweep = sweep, door = door,
                note = string.format('drawn out %d m the way it points, then pushed back %.1f m, tail first, round %.1f / %.1f into the doorway', d, facts.len, K[1], K[2]) }
            end
          end
        end
      end
    end
  end
  -- PULLED PAST THE DOORWAY, PUSHED BACK ROUND INTO IT (the user's layout, 2026-11-18: an aircraft along the ship just
  -- short of a doorway, with no clear line across the hangar in front of that doorway to be drawn onto): drawn out
  -- along its own line until its main wheels are past the place's line by the bend and 2 m, then pushed back along
  -- its own line and round into the doorway: as an aircraft is put on a deck spot. One reversal.
  if math.abs(fx) > 0.3 then
    local tf = (S.x - st0.mx) / fx -- (how far ahead of its main wheels its own line meets the place's)
    local zx = st0.mz + fz * tf
    if tf > 2 and s * (mF.z - zx) > 8 then
      local cosT = math.max(-1, math.min(1, -fz * s)) -- (between the way it is pushed back along its own line and the way out)
      local theta = math.acos(cosT)
      for _, rho in ipairs({ TOW.backR, 4, 9 }) do
        local d = tf + rho * math.tan(theta / 2) + 2
        local K = { S.x, zx }
        out[#out + 1] = function()
          local path = { { st0.d.x, st0.d.z }, { st0.d.x + fx * d, st0.d.z + fz * d } }
          local res, why = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
          if not res then return no(string.format('pulled %.0f m past the doorway and pushed back round %.1f / %.1f', d, K[1], K[2]), 'on the pull ' .. tostring(why)) end
          local st1 = { d = res.d, lx = res.lx, lz = res.lz, mx = res.mx, mz = res.mz, fl = st0.fl, blocks = st0.blocks, others = st0.others, half = st0.half }
          local rec, facts = Tow.Fd.back(st1, mF, S.fx, S.fz, K, rho)
          if not rec then return no(string.format('pulled %.0f m past the doorway and pushed back round %.1f / %.1f on %.0f m', d, K[1], K[2], rho), facts) end
          local sweep = bodyCircles({}, st0.lx, st0.lz, st0.mx, st0.mz)
          circles(sweep, { { a.x, a.z }, { a.x + fx * (d + 10), a.z + fz * (d + 10) } }, 5.5)
          for i = 1, #rec, 40 do
            local r = rec[i]
            bodyCircles(sweep, r[5], r[6], r[7], r[8])
            sweep[#sweep + 1] = { r[1], r[2], 2.6 }
          end
          bodyCircles(sweep, mF.x + S.fx * L, mF.z + S.fz * L, mF.x, mF.z)
          return { kind = 'spot', dest = dest, pull = path, push = { mF = mF, hx = S.fx, hz = S.fz, K = K, rho = rho }, sweep = sweep, door = door,
            note = string.format('drawn out %.0f m past the doorway along its own line, then pushed back %.1f m, tail first, round %.1f / %.1f into it', d, facts.len, K[1], K[2]) }
        end
      end
    end
  end
  return out, door
end

-- (the second kind: for `ready` to the place short of the door itself, on the same line)
local function hangarCands2(a, k, st, oth, ready, out)
  local e = H.elevators[k]
  local S = e.stations[st]
  local s = S.fz < 0 and 1 or -1
  if ready then S = { x = S.x, z = s * (s > 0 and READY.stbd or READY.port), fx = S.fx, fz = S.fz } end
  local reach = reachOf()
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  local L = TOW.noseGear + TOW.mainGear
  local st0 = { d = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch, blocks = {}, others = oth, half = HALF }
  local name = string.format(ready and 'the door of elevator %d, place %d' or 'elevator %d, place %d', k, st)
  local dest = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, short = name }
  Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, dest)
  local function no(what, why)
    Tow.Fd.log(string.format('tow: %s to %s, %s, is not driven: %s', tostring(a.board), name, what, tostring(why)))
    return nil, why
  end
  local across = math.abs(fx * S.fx + fz * S.fz) > 0.9
  -- 2. PULLED, THEN PUSHED BACK: the place's line lies ahead of it
  local ahead = (S.x - a.x) * fx
  if not across and ahead > 4 then
    local train = reach + L -- (from the tractor's own point back to the main wheels, the tow straight)
    -- (off: ACROSS THE HANGAR ON A LINE BESIDE THE PLACE'S OWN, 4.5 m forward or aft of it: the push then slants onto
    -- the place's line on its way out. The user's layout, 2026-11-18: in front of elevator 1's doorway the lines of
    -- both places are stood on (a tail on the after one, a nose on the forward one); between them the floor is free.)
    for _, off in ipairs({ 0, 4.5, -4.5 }) do
    for _, lim in ipairs(s > 0 and { 14.2, 12.5 } or { 13.4, 11.8 }) do
      local xo = S.x + off
      local P = { xo, -s * lim } -- (where the tractor stops, across the hangar from the doorway)
      local K = { xo, P[2] + s * (2 + train) }
      -- (the line it turns from: as far to the doorway's side as an aircraft goes (the longest run across the hangar to
      -- come into line on), its own line, or between; with 12 m at least to run across)
      for _, zc in ipairs({ s * 10.5, a.z, s * 6 }) do
        if s * (zc - P[2]) >= 12 and (xo - a.x) * fx > 4 then
          local wp = { { a.x, a.z } }
          local ok = true
          if math.abs(zc - a.z) > 0.5 then
            -- (out of its place straight ahead, then across to the line it turns from: on that line 14 m before the
            -- corner, to come to the corner straight)
            local dir = fx >= 0 and 1 or -1
            local E1 = { a.x + fx * 9, a.z + fz * 9 }
            local M1 = { xo - dir * 14, zc }
            if (M1[1] - E1[1]) * dir < 4 then
              E1 = { a.x + fx * 4, a.z + fz * 4 }
              if (M1[1] - E1[1]) * dir < 4 then ok = false end
            end
            wp[2], wp[3] = E1, M1
          end
          if ok then
            wp[#wp + 1] = { xo, zc }
            wp[#wp + 1] = K
            wp[#wp + 1] = { xo, S.z }
            out[#out + 1] = function()
              -- (the push: not straight for the place from where the pull ends, a tow still bent: first to the
              -- place's line 16 m on, at a shallow angle; then along it)
              -- (eased in: its first 6 m straight back the way the aircraft then points)
              local K2 = { S.x, K[2] + s * (ready and 4 or 16) }
              local plan, why = Tow.Fd.trySpot(st0, { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, spot = k * 10 + st, pushK = { K2[1], K2[2], pts = { K2 }, ease = ready and 3 or 6 }, pushRho = 12 },
                reach, wp, S.fx, S.fz, 0, -s, K, TOW.backR, true)
              if plan then
                plan.dest = dest
                local sweep = bodyCircles({}, st0.lx, st0.lz, st0.mx, st0.mz)
                circles(sweep, plan.pull, 5.5)
                circles(sweep, { { xo, P[2] + s * 6 }, { S.x, K[2] + s * 16 }, { S.x, S.z } }, 5.0)
                plan.sweep = sweep
                plan.note = string.format('drawn out nose first %.0f m, round onto the line of %s%s and across the hangar, then pushed straight back', Tow.routeLen(plan.pull), name,
                  off ~= 0 and string.format(' (%.1f m %s of it)', math.abs(off), off > 0 and 'forward' or 'aft') or '')
                return plan
              end
              return no(string.format('pulled round %.1f / %.1f (the tractor to %.1f) and pushed back', xo, zc, P[2]), why)
            end
          end
        end
      end
    end
    end
  end
  -- ANY WAY IT STANDS (the user's own layout, 2026-11-18): an aircraft at an angle across the hangar whose NOSE points
  -- to the doorway's side: drawn out nose first 9 / 13 m the way it points, on to the place's line (at 10.5 / 6 / 0 m
  -- to the doorway's side of the centre line), round onto that line and across the hangar until the tow is straight,
  -- then pushed straight back: the first bend 60 degrees at most, the turn onto the place's line 125.
  if not across and math.abs(fx) < 0.9 and fz * s > 0.2 then
    local train = reach + L
    local function ang(ux, uz, vx, vz)
      local d = (ux * vx + uz * vz) / math.max(1e-9, hyp(ux, uz) * hyp(vx, vz))
      return math.deg(math.acos(math.max(-1, math.min(1, d))))
    end
    for _, off in ipairs({ 0, 4.5, -4.5 }) do
    for _, lim in ipairs(s > 0 and { 14.2, 12.5 } or { 13.4, 11.8 }) do
      local xo = S.x + off
      local P = { xo, -s * lim }
      local K = { xo, P[2] + s * (2 + train) }
      for _, d in ipairs({ 9, 13 }) do
        local p1 = { a.x + fx * d, a.z + fz * d }
        for _, zc in ipairs({ s * 10.5, s * 6, 0 }) do
          local ux, uz = xo - p1[1], zc - p1[2]
          if s * (zc - P[2]) >= 12 and hyp(ux, uz) >= 8 and ang(ux, uz, fx, fz) <= 60 and ang(ux, uz, 0, -s) <= 125 then
            local wp = { { a.x, a.z }, p1, { xo, zc }, K, { xo, S.z } }
            out[#out + 1] = function()
              local K2 = { S.x, K[2] + s * (ready and 4 or 16) }
              local plan, why = Tow.Fd.trySpot(st0, { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, spot = k * 10 + st, pushK = { K2[1], K2[2], pts = { K2 }, ease = ready and 3 or 6 }, pushRho = 12 },
                reach, wp, S.fx, S.fz, 0, -s, K, TOW.backR, true)
              if plan then
                plan.dest = dest
                local sweep = bodyCircles({}, st0.lx, st0.lz, st0.mx, st0.mz)
                circles(sweep, plan.pull, 5.5)
                circles(sweep, { { xo, P[2] + s * 6 }, { S.x, K[2] + s * 16 }, { S.x, S.z } }, 5.0)
                plan.sweep = sweep
                plan.note = string.format('drawn out nose first %.0f m, round onto the line of %s and across the hangar, then pushed straight back', Tow.routeLen(plan.pull), name)
                return plan
              end
              return no(string.format('pulled %.0f m the way it points, round %.1f / %.1f (the tractor to %.1f) and pushed back', d, xo, zc, P[2]), why)
            end
          end
        end
      end
    end
    end
  end
  return out
end

-- WHAT A TOW REALLY SWEEPS (2026-11-18, the user after the run: "we need to bring the overall run time down by
-- parallelizing tow tasks"): a tow in the hangar held a band of 5 m circles round all it would sweep, a tractor's way
-- a band of 2 m: with four tractors driving to and fro, a tow's band was nearly always touched by some tractor's, and
-- it waited. Now two bands that touch are asked about: the tow's own shapes along its trace (the aircraft's outline
-- and the tractor, every metre and a half: towOf's trace) against the other's circle: taken as touching within 0.5 m.
local function sweptShapes(trace)
  local out = {}
  for _, q in ipairs(trace or {}) do
    local fx, fz = unit(q[1] - q[3], q[2] - q[4])
    local x, z = q[1] - fx * TOW.noseGear, q[2] - fz * TOW.noseGear
    out[#out + 1] = { x = x, z = z, jet = Tow.Fd.shape(x, z, fx, fz, HALF), tug = Tow.Fd.tugShape(q[5], q[6], q[7], q[8]) }
  end
  return out
end
-- does a circle ({ x, z, r }) touch a tow's swept shapes
local function sweptHits(shapes, c)
  local disc
  for _, sh in ipairs(shapes) do
    if (sh.x - c[1]) ^ 2 + (sh.z - c[2]) ^ 2 < (15 + c[3]) ^ 2 then
      disc = disc or { { c[1], c[2], c[1], c[2], c[3] } }
      if Tow.Fd.gap(disc, sh.jet) < 0.5 or Tow.Fd.gap(disc, sh.tug) < 0.5 then return true end
    end
  end
  return false
end
-- does a tractor, as it stands, come within 0.6 m of a tow's swept shapes (its own shape: the solver's measure for a
-- tractor waiting at a post or at a nose: until 2026-11-19 a disc of 2.9 m about its middle was asked about: a
-- tractor that waited at the nose of its next aircraft, where the solver had it clear, "stood in the way" of the
-- tow beside it and was sent 107 m off to a post at the other end of the hangar)
function M.tugHits(shapes, o)
  local T
  for _, sh in ipairs(shapes) do
    if (sh.x - o.d.x) ^ 2 + (sh.z - o.d.z) ^ 2 < 484 then
      T = T or Tow.Fd.tugShape(o.d.x, o.d.z, o.d.hx, o.d.hz)
      if Tow.Fd.gap(T, sh.jet) < 0.6 or Tow.Fd.gap(T, sh.tug) < 0.6 then return true end
    end
  end
  return false
end
-- (a tractor's own way, or where it stands, against the other jobs: one of their tows counts by its swept shapes)
local function wayFine(a, b, bi, j)
  if bi > (j.wayN or 0) + 1 and j.fine then return sweptHits(j.fine, a) end
  return true
end

-- A TOW IN THE HANGAR FROM DATA (T): what the solver finds for the user's layout in his own order
-- (catcc-dcs/deck-test/hangar/hangar_solve.lua; kept in crewtest_hangar.lua as `tows`, by the plan's place), and what
-- the solver itself tries. Aircraft a onto place `st` of elevator k:
--   T.alpha   the nose wheel (and the bar) turned that many degrees at the hook-up (+ towards starboard of its nose):
--             the tractor stands on that line (newTow);
--   T.pull    the tractor's corners on the pull, from where it is hooked on ({ x, z } each), or none: pushed only;
--   T.kz      where the push's last corner is on the place's line (x of the place, that z); T.pts: corners before it;
--             T.ease: the push's first metres straight back; T.rho: the radius its corners are rounded on.
-- Driven in the head exactly as the other ways are (the hook's Tow.Fd.sim and Tow.Fd.back, against the hangar, the
-- fittings and every other aircraft): the plan, or nil and why. With the plan: its length and its least room to
-- another aircraft (for the solver's choice).
local function towOf(a, k, st, oth, ready, T)
  local e = H.elevators[k]
  local S = e.stations[st]
  local s = S.fz < 0 and 1 or -1
  local reach = reachOf()
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  local L = TOW.noseGear + TOW.mainGear
  local ux, uz = M.turned(fx, fz, T.alpha)
  local st0 = { d = { x = nx + ux * reach, z = nz + uz * reach, hx = ux, hz = uz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch, blocks = {}, others = oth, half = HALF }
  local name = string.format('elevator %d, place %d', k, st)
  local dest = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, short = name }
  local mF = { x = S.x - S.fx * TOW.mainGear, z = S.z - S.fz * TOW.mainGear }
  local door = ready and { s = s, lim = s > 0 and READY.line.stbd or READY.line.port, x1 = e.x[1], x2 = e.x[2] } or nil
  Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, dest)
  local what = string.format('%s%s round %.1f / %.1f on %.0f m', (T.alpha or 0) ~= 0 and string.format('nose wheel turned %d degrees, ', T.alpha) or '',
    T.pull and string.format('pulled by %d corner(s) to %.1f / %.1f and pushed back', #T.pull, T.pull[#T.pull][1], T.pull[#T.pull][2]) or 'pushed', S.x, T.kz or 0, T.rho or 0)
  local function no(why)
    Tow.Fd.log(string.format('tow: %s to %s, the solved way (%s), is not driven: %s', tostring(a.board), name, what, tostring(why)))
    return nil, why
  end
  -- (as it stands hooked on: the tractor on the floor, clear of the others' wheels)
  local bad = Tow.Fd.check(st0.d.x, st0.d.z, ux, uz, nx, nz, st0.mx, st0.mz, st0.blocks, oth, HALF)
  if bad then return no('hooked on, ' .. tostring(bad)) end
  local sweep = bodyCircles({}, st0.lx, st0.lz, st0.mx, st0.mz)
  sweep[#sweep + 1] = { st0.d.x, st0.d.z, 2.6 }
  local st1, path, res = st0, nil, nil
  local len, gap = 0, nil
  local trace = { { st0.lx, st0.lz, st0.mx, st0.mz, st0.d.x, st0.d.z, st0.d.hx, st0.d.hz } }
  if T.pull then
    local corners = { { st0.d.x, st0.d.z } }
    for _, q in ipairs(T.pull) do corners[#corners + 1] = { q[1], q[2] } end
    path = #corners > 2 and Tow.Net.smooth(corners, TOW.towR) or corners
    local why
    res, why = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
    if not res then return no('on the pull ' .. tostring(why)) end
    if T.trace then
      -- (the same pull once more, step by step as Tow.Fd.sim drives it, kept every metre and a half: where the aircraft
      -- and the tractor are: for the solver's count of which tows are clear of which)
      local d = { x = st0.d.x, z = st0.d.z, hx = st0.d.hx, hz = st0.d.hz, v = 0, path = path, s = Tow.routeLengths and Tow.routeLengths(path) or nil, at = 0, speed = TOW.simSpeed, turnR = TOW.towR, acc = TOW.simAccel, brk = TOW.simBrake }
      local q = { lx = st0.lx, lz = st0.lz, mx = st0.mx, mz = st0.mz, fl = st0.fl, steer = 0, blocks = st0.blocks, half = st0.half }
      Tow.path({ d = d }, path, TOW.simSpeed)
      d.turnR = TOW.towR
      local lastX, lastZ
      for _ = 1, 40 * (Tow.routeLen(path) + 20) do
        local done = Tow.drive(d, 0.1)
        Tow.Fd.trail(q, d)
        if not lastX or hyp(d.x - lastX, d.z - lastZ) >= 1.5 or done then
          lastX, lastZ = d.x, d.z
          trace[#trace + 1] = { q.lx, q.lz, q.mx, q.mz, d.x, d.z, d.hx, d.hz }
        end
        if done then break end
      end
    end
    st1 = { d = res.d, lx = res.lx, lz = res.lz, mx = res.mx, mz = res.mz, fl = st0.fl, blocks = st0.blocks, others = st0.others, half = st0.half }
    circles(sweep, path, 5.5)
    bodyCircles(sweep, res.lx, res.lz, res.mx, res.mz)
    len, gap = Tow.routeLen(path), res.gap
  end
  -- (the push: T's own; or, for the solver, the best of T.pushes ({ kz, ease, rho, pts } each; T.filter: which of
  -- them are worth driving from where the pull ends): the one that keeps the most room to the other aircraft (up to
  -- 1.5 m; then the shortest); T is then given that one's kz, ease, rho, pts)
  local K, rec, facts, bestV, best, lastWhy
  local pfx, pfz = unit(st1.lx - st1.mx, st1.lz - st1.mz)
  for _, v in ipairs(T.pushes or { T }) do
    if not T.filter or T.filter(st1.mx, st1.mz, pfx, pfz, v, S, mF) then
      local K1 = { S.x, v.kz, ease = v.ease or nil }
      if v.pts then
        K1.pts = {}
        for _, q in ipairs(v.pts) do K1.pts[#K1.pts + 1] = { q[1], q[2] } end
        K1.pts[#K1.pts + 1] = { S.x, v.kz }
      end
      local rec1, facts1 = Tow.Fd.back(st1, mF, S.fx, S.fz, K1, v.rho)
      if rec1 then
        local score = math.min(1.5, facts1.gap or 1.5) * 20 - facts1.len
        if not best or score > best then best, K, rec, facts, bestV = score, K1, rec1, facts1, v end
      else
        lastWhy = lastWhy or facts1
      end
    end
  end
  if not rec then return no((T.pull and 'on the push ' or '') .. tostring(lastWhy or 'no push worth trying from there')) end
  if T.pushes then T.kz, T.ease, T.rho, T.pts = bestV.kz, bestV.ease or nil, bestV.rho, bestV.pts end
  local rho = bestV.rho
  for i = 1, #rec, 40 do
    local r = rec[i]
    bodyCircles(sweep, r[5], r[6], r[7], r[8])
    sweep[#sweep + 1] = { r[1], r[2], 2.6 }
  end
  bodyCircles(sweep, mF.x + S.fx * L, mF.z + S.fz * L, mF.x, mF.z)
  if facts.gap and (not gap or facts.gap < gap) then gap = facts.gap end
  if T.trace then
    for i = 1, #rec, 30 do
      local r = rec[i]
      trace[#trace + 1] = { r[5], r[6], r[7], r[8], r[1], r[2], r[3], r[4] }
    end
    local r = rec[#rec]
    trace[#trace + 1] = { r[5], r[6], r[7], r[8], r[1], r[2], r[3], r[4] }
  end
  -- (how long it takes: the pull at the pace of a tow on the straights, the push between its plain pace and half as fast again)
  local secs = len / TOW.fastTow + facts.len / (TOW.backSpeed * 1.25)
  local turnedText = (T.alpha or 0) ~= 0 and string.format('the nose wheel and bar turned %d degrees to the %s for the hook-up; ', math.abs(T.alpha), T.alpha > 0 and 'right' or 'left') or ''
  local last = rec[#rec]
  return { kind = 'spot', dest = dest, pull = path, push = { mF = mF, hx = S.fx, hz = S.fz, K = K, rho = rho }, sweep = sweep, door = door, alpha = T.alpha, solved = true, T = T,
    endTug = { x = last[1], z = last[2], hx = last[3], hz = last[4] }, trace = T.trace and trace or nil, secs = secs, pullLen = len, pushLen = facts.len,
    note = turnedText .. (T.pull and string.format('drawn out %.0f m to %.1f / %.1f, then pushed back %.1f m, tail first, round %.1f / %.1f', len, res.d.x, res.d.z, facts.len, S.x, T.kz)
      or string.format('pushed back %.1f m, tail first, round %.1f / %.1f', facts.len, S.x, T.kz)) }, len + facts.len, gap, math.max(res and res.steer or 0, facts.steer or 0)
end

-- a tractor's way (as it will be driven) and the other tractors of its deck that stand idle: true if it keeps 4.2 m
-- from the middle of each (the hook drives a way in the head against the deck and the aircraft only; the way-finder
-- keeps off them, but a rounded corner and the tractor's own swing cut into that: once to 1.8 m, in the rig)
local function offTugs(path, tug)
  for _, t in ipairs(M.tugs) do
    if t ~= tug and t.level == tug.level and not t.job then
      local q = tugDisc(t)
      for i = 2, #path do
        local a, b = path[i - 1], path[i]
        local n = math.max(1, math.ceil(hyp(b[1] - a[1], b[2] - a[2])))
        for k = 0, n do
          local x, z = a[1] + (b[1] - a[1]) * k / n, a[2] + (b[2] - a[2]) * k / n
          if hyp(x - q[1], z - q[2]) < 4.2 and hyp(x - tug.d.x, z - tug.d.z) > 4 then return false, t.name, t end
        end
      end
    end
  end
  return true
end

-- A TRACTOR TURNS ROUND BEFORE IT SETS OFF: where it waits it stands as it drove in, often facing the wrong way with no
-- room to drive round. It first backs a quarter circle (its tightest: 4 m) to one side or the other (the hook's
-- 'backout' with an arc), and drives off from there. side: +1 / -1; returns the arc, and where it then stands; or nil
-- (no floor for it, or an aircraft's wheels or another tractor in the way).
local function quarterBack(tug, side, oth)
  local d = tug.d
  local R = TOW.turnR
  local cx, cz = d.x - d.hz * side * R, d.z + d.hx * side * R
  local a0 = atan2(d.z - cz, d.x - cx)
  local a1 = a0 - side * math.pi / 2
  local sg = a1 >= a0 and 1 or -1
  for i = 1, 6 do
    local a = a0 + (a1 - a0) * i / 6
    local x, z = cx + R * math.cos(a), cz + R * math.sin(a)
    if not Tow.Fd.on(x, z, 1.1) then return nil end
    local T = Tow.Fd.tugShape(x, z, sg * math.sin(a), -sg * math.cos(a))
    for _, o in ipairs(oth or {}) do
      if (o.x - x) ^ 2 + (o.z - z) ^ 2 < 169 and Tow.Fd.gap(T, o.shape.low) < 0.15 then return nil end
    end
    for _, t in ipairs(M.tugs) do
      if t ~= tug and t.level == tug.level and hyp(t.d.x - t.d.hx * 0.6 - x, t.d.z - t.d.hz * 0.6 - z) < 4.6 then return nil end
    end
  end
  return { cx = cx, cz = cz, r = R, a0 = a0, a1 = a1 }, { x = cx + R * math.cos(a1), z = cz + R * math.sin(a1), hx = sg * math.sin(a1), hz = -sg * math.cos(a1) }
end

-- THE TRACTOR'S WAY TO AN AIRCRAFT IN THE HANGAR: alongside its forward fuselage (ALONG.off from its centre line, on
-- either side), swung onto the nose line on two bends of ALONG.r, then straight on along the nose line to stop
-- `run` beyond the hook-up place, facing away from the aircraft: from there it backs straight onto the ring.
-- run: 5, 3.5 or 2 m, the most there is floor for: the swing ends 2 m beyond the hook-up place (no nearer: the
-- tractor's tail would swing into the nose wheel), and what is left of `run` is straight, to come into line (with
-- none, the rig had the tractor 13 degrees round at the end of the swing: it then straightens as it backs: turnOk).
-- from: how far behind the nose wheel it comes onto the line alongside: beside the tail (the wheels are 0 to 5.6 m
-- behind the nose wheel: coming onto the line beside them, across it, its own nose went into them: the rig).
-- It sets off as it stands, or (start: 1 / -1) after backing a quarter circle to that side (quarterBack).
-- Returns its way and that quarter circle (or nil); or nil and why.
local ALONG = { off = { 3.6, 3.0 }, r = 5.0, run = { 5, 3.5, 2 }, swingTo = 2.0, from = { -12, -16 }, turnOk = 15 }
-- (side: 1 / -1: on the aircraft's right or left; uA: how far behind its nose wheel the tractor comes alongside)
-- (al: the bar turned that many degrees at the hook-up (the plan's alpha): its line is the line the tractor comes onto)
local function hangarApproach(tug, a, oth, side, uA, start, al)
  local reach = reachOf()
  local jfx, jfz = unit(a.fx, a.fz)
  local nx, nz = a.x + jfx * TOW.noseGear, a.z + jfz * TOW.noseGear
  local fx, fz = M.turned(jfx, jfz, al)
  local px, pz = -fz * side, fx * side
  local function at(u, v) return { nx + fx * u + px * v, nz + fz * u + pz * v } end
  -- (every aircraft down there, the one it goes to among them: it does not drive through that one's wheels either)
  local all = { { x = a.x, z = a.z, fx = jfx, fz = jfz, name = a.name, half = HALF, shape = Tow.Fd.shape(a.x, a.z, jfx, jfz, HALF) } }
  for _, o in ipairs(oth) do all[#all + 1] = o end
  local d, arc = tug.d, nil
  if start then
    arc, d = quarterBack(tug, start, all)
    if not arc then return nil, nil, 'there is no room for the tractor to back round where it stands' end
  end
  -- (the furthest stop there is floor for)
  local run
  for _, r0 in ipairs(ALONG.run) do
    if not run and Tow.Fd.on(nx + fx * (reach + r0), nz + fz * (reach + r0), 1.2) then run = r0 end
  end
  if not run then return nil, nil, 'there is not the floor ahead of its nose for a tractor' end
  local uG = reach + run
  local goal = { x = nx + fx * uG, z = nz + fz * uG, hx = fx, hz = fz, turnOk = ALONG.turnOk }
  local why
  for _, off in ipairs(ALONG.off) do
    local th = math.acos(1 - off / (2 * ALONG.r))
    local uE = reach + ALONG.swingTo -- (where the swing ends, on the nose line)
    local u0 = uE - 2 * ALONG.r * math.sin(th)
    local swing = {}
    local n = math.max(3, math.ceil(th * ALONG.r / 0.5))
    for i = 1, n do
      local t = th * i / n
      swing[#swing + 1] = at(u0 + ALONG.r * math.sin(t), off - ALONG.r * (1 - math.cos(t)))
    end
    for i = n - 1, 0, -1 do
      local t = th * i / n
      swing[#swing + 1] = at(uE - ALONG.r * math.sin(t), ALONG.r * (1 - math.cos(t)))
    end
    if uG - uE > 0.3 then swing[#swing + 1] = at(uG, 0) end
    local B0 = at(math.min(uA, u0 - 4), off)
    for wi = 1, #WIDE do
    M.pauseIn()
    M.finderTug, M.finderJet = tug, a
    local way = hangarWide(wi, { d.x, d.z }, B0, d)
    M.finderTug, M.finderJet = nil, nil
    if not way then
      why = why or 'the tractor finds no way to its nose'
    else
      -- (onto the line alongside, and along it: the corner there rounded with the rest)
      way[#way + 1] = at(u0, off)
      for _, r in ipairs({ 4, 2.5 }) do
        local path = Tow.Net.smooth(way, r)
        for _, q in ipairs(swing) do path[#path + 1] = q end
        local good, bad = Tow.Fd.simSolo(d, path, {}, goal, all)
        if good and not offTugs(path, tug) then good, bad = nil, 'its way passes too near another tractor' end
        if good then
          Tow.Fd.log(string.format('tow: the tractor%s comes alongside %s on its %s side, %.1f m off, and swings onto its nose line; it stops %.1f m beyond the hook-up place', arc and ' backs round a quarter circle,' or '',
            tostring(a.board), side > 0 and 'right' or 'left', off, run))
          return path, arc
        end
        Tow.Fd.log(string.format('tow: the tractor to %s%s, alongside on its %s %.1f m off from %d m behind its nose wheel, corners on %.1f m, to stop %.1f m beyond: %s', tostring(a.board), arc and ' (backed round first)' or '',
          side > 0 and 'right' or 'left', off, -uA, r, run, tostring(bad)))
        why = why or bad
      end
    end
    end
  end
  return nil, nil, why
end

-- HEAD ON, FOR ITS FRONT HITCH (the user: "push an aircraft with its other connection point"): where there is no
-- getting past an aircraft's nose (its neighbour's wheels on one side, a wall on the other) the tractor comes down
-- the nose line towards it and stops FRONT.run short of where its front pintle is in the bar's ring; it then drives
-- that last bit onto the ring (the hook: w.frontHitch). start: as hangarApproach's. Returns its way and the quarter
-- circle it backs first (or nil); or nil, nil and why.
local FRONT = { run = 1.5, lead = { 9, 6, 3, 1.2 } } -- (3 and 1.2: a tractor that stands near the line already, or has little floor beyond it)
local function hangarFront(tug, a, oth, start, al)
  local reach = reachOf()
  local jfx, jfz = unit(a.fx, a.fz)
  local nx, nz = a.x + jfx * TOW.noseGear, a.z + jfz * TOW.noseGear
  local fx, fz = M.turned(jfx, jfz, al) -- (the bar's line, if it is turned at the hook-up)
  local all = { { x = a.x, z = a.z, fx = jfx, fz = jfz, name = a.name, half = HALF, shape = Tow.Fd.shape(a.x, a.z, jfx, jfz, HALF) } }
  for _, o in ipairs(oth) do all[#all + 1] = o end
  local d, arc = tug.d, nil
  if start then
    arc, d = quarterBack(tug, start, all)
    if not arc then return nil, nil, 'there is no room for the tractor to back round where it stands' end
  end
  -- (the tractor's own point as it stops, facing the aircraft)
  local uG = reach - (TOW.hitch - TOW.hitchFront) + FRONT.run
  local goal = { x = nx + fx * uG, z = nz + fz * uG, hx = -fx, hz = -fz }
  local why
  for _, lead in ipairs(FRONT.lead) do
    local Q = { nx + fx * (uG + lead), nz + fz * (uG + lead) }
    for wi = 1, #WIDE do
    M.pauseIn()
    M.finderTug, M.finderJet = tug, a
    local way = hangarWide(wi, { d.x, d.z }, Q, d)
    M.finderTug, M.finderJet = nil, nil
    if not way then
      why = why or 'the tractor finds no way to the line ahead of its nose'
    else
      way[#way + 1] = { goal.x, goal.z }
      for _, r in ipairs({ 4, 2.5 }) do
        local path = Tow.Net.smooth(way, r)
        local good, bad = Tow.Fd.simSolo(d, path, {}, goal, all)
        if good and not offTugs(path, tug) then good, bad = nil, 'its way passes too near another tractor' end
        if good then
          Tow.Fd.log(string.format('tow: the tractor%s comes down the nose line of %s head on, for its front hitch', arc and ' backs round a quarter circle and' or '', tostring(a.board)))
          return path, arc
        end
        Tow.Fd.log(string.format('tow: the tractor to %s%s, head on down its nose line from %d m out, corners on %.1f m: %s', tostring(a.board), arc and ' (backed round first)' or '', lead, r, tostring(bad)))
        why = why or bad
      end
    end
    end
  end
  return nil, nil, why
end

-- THE TRACTORS' SOLVED WAYS (crewtest_hangar.lua: with each aircraft's tow; hangar_solve.lua plans them as a tractor
-- drives). THE USER, 2026-11-18: "the hangar environment is essentially static, vs the dynamic environment of the
-- flight deck. Players won't be taxiing aircraft through the hangar deck. So tugs don't need to account for dynamic
-- obstacles the way they do on the deck." So down there a tractor stands at a POST (the plan's homes and rest), goes
-- from its post to an aircraft by the way solved for that pair, and from where the tow ends back to a post by a
-- solved way; what the demo finds for itself as it runs (hangarApproach, hangarFront, hangarHome's own way-finder) is
-- only for a tractor that stands elsewhere, or a way that cannot be driven as things stand (it is driven in the head
-- first, as every way is: another tractor may be in it).
-- IN THE HANGAR, WHAT A TRACTOR'S OWN WAY HOLDS IS GIVEN UP BEHIND IT AS IT DRIVES (job.wayN: the first so many of the
-- job's circles are its way's, in the order it drives them): those more than two circles behind the one it is at.
-- (Until 2026-11-18 a tractor on its way to an aircraft 90 m off held the whole of that way until the aircraft was
-- delivered: every tow that crossed it waited.)
local function wayLetGo(job)
  local n = job.wayN
  if not n or n < 4 then return end
  local d, cs = job.w.d, job.circles
  local best, at
  for i = 1, math.min(n, #cs) do
    local dd = (cs[i][1] - d.x) ^ 2 + (cs[i][2] - d.z) ^ 2
    if not best or dd < best then best, at = dd, i end
  end
  if at and at > (job.wayAt or 0) then
    for i = math.max(1, job.wayAt or 1), at - 3 do cs[i][1], cs[i][2], cs[i][3] = 1e6, 1e6, 0 end
    job.wayAt = at
    -- (what was given up may be what a tow waits for: the hangar counts as changed (M.tick: every 2 s at the most).
    -- Until 2026-11-18 a tow that waited for a tractor to drive by was looked at again only when some job began or
    -- ended: minutes later)
    M.relH = true
  end
end

-- IN THE HANGAR, WHAT A TOW HAS SWEPT IS GIVEN UP BEHIND IT AS IT GOES (2026-11-19: the user: "get the spotting time
-- down as much as possible"): a tow held all it would ever sweep until its aircraft stood on the platform: the tow
-- beside it, which crosses the same floor a minute later or earlier, waited two and a half minutes for it ("the
-- way is in use"). The job's circles after its tractor's own way are the tow's sweep in the order it is swept
-- (towOf: where the aircraft stands, the pull, the push, the place): the one the tractor is in now is found (the
-- next in order that it stands in: job.sweepI), and every one before that which neither the aircraft (its middle
-- 10 m and more beyond the circle) nor the tractor (4 m beyond it) is near is given up (set to nothing, in place).
-- Once a second, when the aircraft is on the bar and the tow is moving.
function M.sweepLetGo(job, mt)
  if mt < (job.sweepT or 0) then return end
  job.sweepT = mt + 1
  local w, cs = job.w, job.circles
  local d = w.d
  -- (WHERE ITS TRACTOR STOOD WHEN IT SET OFF (the circle after its way's: 2.9 m about that place) is given up when the
  -- tractor is 4 m clear of it, and what is left of its way to the aircraft when it is hooked on: until 2026-11-19
  -- that circle was held until the aircraft stood on the platform: a tow the solver has clear of this one still
  -- waited for it wherever its sweep came within 8 m of the post this one's tractor had left)
  if not CATCC_DEMO_NO_SWEEPGO and not job.held and job.to ~= 'ready' and job.wayN then
    local sd = cs[job.wayN + 1]
    if sd and sd[3] > 0 and hyp(sd[1] - d.x, sd[2] - d.z) > sd[3] + 4 then
      sd[1], sd[2], sd[3] = 1e6, 1e6, 0
      M.relH = true
    end
    if w.bar == 'both' and not job.wayGone then
      job.wayGone = true
      for i = 1, math.min(job.wayN, #cs) do cs[i][1], cs[i][2], cs[i][3] = 1e6, 1e6, 0 end
      M.relH = true
    end
  end
  if CATCC_DEMO_NO_SWEEPGO or not (w.jx and w.bar == 'both' and (w.phase == 'pull' or w.phase == 'push')) then return end
  -- (not one that stood short of a door: what it holds from there on is a list of its own: M.tick)
  if job.held or job.to == 'ready' then return end
  local base = (job.wayN or 0) + 2
  local at = math.min(#cs, math.max(base, job.sweepI or base))
  for i = at, math.min(#cs, at + 40) do
    local c = cs[i]
    if c[3] > 0 and (c[1] - d.x) ^ 2 + (c[2] - d.z) ^ 2 < c[3] * c[3] then
      at = i
      break
    end
  end
  job.sweepI = at
  local gone = false
  for i = base, at - 1 do
    local c = cs[i]
    if c and c[3] > 0 and hyp(c[1] - w.jx, c[2] - w.jz) > c[3] + 10 and hyp(c[1] - d.x, c[2] - d.z) > c[3] + 4 then
      c[1], c[2], c[3] = 1e6, 1e6, 0
      gone = true
    end
  end
  if gone then M.relH = true end
end

-- A TRACTOR THAT HAS PARKED AT ITS POST IS SET SQUARE ON IT (within 0.8 m and 20 degrees of it: the hook drives it
-- there to a few centimetres and a degree or two): the solved ways from a post are planned from the post itself, and
-- held against a tractor 12 cm and 2.5 degrees off it (the solver's OFF); in the rig a tractor that had come to stand
-- 10 cm off could not begin a way planned to the centimetre. Returns how far off it was (m, degrees), or nil.
local function settle(tug)
  local P, d = tug.home, tug.d
  if not (P and tug.level == 'hangar') then return nil end
  local off, dot = hyp(d.x - P.x, d.z - P.z), d.hx * P.hx + d.hz * P.hz
  if off > 0.8 or dot < 0.94 then return nil end
  d.x, d.z, d.hx, d.hz = P.x, P.z, P.hx, P.hz
  placeTug(tug)
  return off, math.deg(math.acos(math.min(1, dot)))
end

-- the post a tractor stands at (within 1.5 m of it): its number. WHICHEVER WAY IT FACES (until 2026-11-19: within 20
-- degrees of the way a tractor stands there: one that had come to its post by the way-finder's own way, 0.14 m off
-- it and facing another way, was "NOT at a post": it had no solved way from there, the ways made up as it runs had
-- none either ("the tractor would leave the deck on its way"), and its elevator's aircraft stood for good). A solved
-- way is driven in the head from how the tractor stands before it is taken (solvedWay).
local function postOf(t)
  for i, P in ipairs(M.posts or {}) do
    if hyp(t.d.x - P.x, t.d.z - P.z) < 1.5 then return i end
  end
  return nil
end

-- a solved way (W: { side, back, pts }) for tractor `tug` as it stands: where it sets off from after backing (a
-- quarter circle to W.side, or W.back metres straight), driven in the head against `all` (goal: what its end is
-- held against, or nil). Returns the way, the quarter circle (or nil), the metres backed straight (or nil); or nil
-- and why.
local function solvedWay(tug, W, goal, all)
  local d, arc, back = tug.d, nil, nil
  if W.side ~= 0 then
    arc, d = quarterBack(tug, W.side, all)
    if not arc then return nil, 'there is no room for the tractor to back round where it stands' end
  elseif W.back then
    back = W.back
    d = { x = d.x - d.hx * back, z = d.z - d.hz * back, hx = d.hx, hz = d.hz }
  end
  local path = {}
  for _, q in ipairs(W.pts) do path[#path + 1] = { q[1], q[2] } end
  local good, bad = Tow.Fd.simSolo(d, path, {}, goal, all)
  if good then
    -- (an idle tractor that stands by the way: said, and which: it is the one to move off)
    local clear, _, blk = offTugs(path, tug)
    if not clear then return nil, 'its way passes too near another tractor', blk end
  end
  if not good then return nil, bad end
  return path, arc, back
end

-- OFF THE PLATFORM FIRST (the user, 2026-11-20, after his run: "after a hangar tug parks an aircraft on an elevator,
-- its priority should be getting off the elevator ASAP so the elevator can ascend ... This tug seems to disconnect and
-- then stop again ... Then the tug takes an immediate turn that keeps it conflicting with the elevator longer than it
-- needs to"). Until then it backed off the bar 0.6 m, asked for its way home there, and that way began with a quarter
-- circle backwards (the way-finder's "least that works") which turned it along the door, on the platform: the
-- platform went up 19 s after the aircraft stood (rig and run alike). Now: as it moves off the bar it goes on along
-- the same line, straight away from the aircraft, until all of it is M.OFF.margin clear of the platform (M.offAt: the
-- hook's 'moveup'), and only there is its way on asked for. Not if that line is not open: then as before.
-- CATCC_DEMO_NO_OFFFIRST: as it was.
-- (extra: past the first step that is clear (2026-11-20): the hook's drive stops a few centimetres short of where
-- it is sent: the rig had a tractor's rear disc 0.08 m inside the margin, and the platform waited until it drove off
-- along its way home, 45 s later: what this was for was lost. OFF (CATCC_DEMO_OFFEXTRA switches it on): with it
-- the rig had, with planning spread over frames, a tow pass a tractor that stood in its way in front of elevator 2
-- at 0.1 m (the tow does not stop for a tractor by itself that was told to clear off and could not): that first.)
M.OFF = { margin = 1.0, most = 14, step = 0.25, extra = 0.4 }
-- the platform's box as the hangar's floor has it (onPlatform: 0.7 m further inboard), grown by m
function M.platBox(k, m)
  local e = H.elevators[k]
  local z1, z2 = e.z[1], e.z[2]
  if z1 > 0 then z1 = z1 - 0.7 else z2 = z2 + 0.7 end
  return e.x[1] - m, e.x[2] + m, z1 - m, z2 + m
end
-- does any of these discs reach into the box
function M.discsIn(discs, x1, x2, z1, z2)
  for _, q in ipairs(discs) do
    local cx, cz = math.max(x1, math.min(x2, q[1])), math.max(z1, math.min(z2, q[2]))
    if (q[1] - cx) ^ 2 + (q[2] - cz) ^ 2 < q[3] * q[3] then return true end
  end
  return false
end
-- a tractor's two discs as it really stands (on its front hitch the tow's w.d is the tractor the other way round)
function M.realDiscs(w)
  local x, z, hx, hz = Tow.real(w)
  return { { x + hx * 0.75, z + hz * 0.75, 1.6 }, { x - hx * 1.95, z - hz * 1.95, 1.6 } }
end
-- how far the tractor of tow w goes on along w.d's heading to be clear of the platform k its aircraft stands on; nil
-- if it is clear already, or that line is not open (the floor, the other tractors and aircraft, what the other jobs hold)
function M.offAt(w, tug, k)
  if CATCC_DEMO_NO_OFFFIRST or not k then return nil end
  local d = w.d
  local x1, x2, z1, z2 = M.platBox(k, M.OFF.margin)
  local function discsAt(s)
    local ww = { d = { x = d.x + d.hx * s, z = d.z + d.hz * s, hx = d.hx, hz = d.hz }, front = w.front }
    return M.realDiscs(ww)
  end
  if not M.discsIn(discsAt(TOW.clearBar), x1, x2, z1, z2) then return nil end
  local B
  local s = TOW.clearBar
  while s <= M.OFF.most do
    s = s + M.OFF.step
    if not M.discsIn(discsAt(s), x1, x2, z1, z2) then
      B = s
      break
    end
  end
  if not B then return nil end
  if CATCC_DEMO_OFFEXTRA then B = B + M.OFF.extra end
  -- (the line itself: on the floor, clear of the other tractors and of what the other jobs hold)
  local x0, z0 = d.x, d.z
  local xe, ze = d.x + d.hx * B, d.z + d.hz * B
  for i = 0, 8 do
    local px, pz = x0 + (xe - x0) * i / 8, z0 + (ze - z0) * i / 8
    if not ENV_HANGAR.inside(px, pz) then return nil end
  end
  for _, t in ipairs(M.tugs) do
    if t ~= tug and t.level == 'hangar' and touch(discsAt(B), tugDiscs(t)) then return nil end
  end
  if not free('hangar', circles({}, { { x0, z0 }, { xe, ze } }, 2.0), tug, nil, nil, wayFine) then return nil end
  return B - TOW.clearBar
end

-- the tractor's way back to where it waits in the hangar. It sets off as it stands, or after backing a quarter circle
-- (the hook: w.startBack); one that stood on its front hitch faces the aircraft it has just left: it always backs.
local function hangarHome(w, tug)
  local d = w.d
  -- (asked again while it waits for its way: every second and a half)
  local now = Tow.now()
  if w.homeAsk and now < w.homeAsk then return nil, nil, true end
  w.homeAsk = now + 1.5
  -- AN AIRCRAFT IN TOW HAS THE RIGHT OF WAY (the user, 2026-11-19: "The final tow out of the hangar waits far too long.
  -- It waits for the penultimate tug to return all the way to its parking spot before towing ... Aircraft under tow
  -- have right of way, and it's up to tugs not actively towing to avoid them"): the tractor that has just put an
  -- aircraft on a platform stays where it stands (at that aircraft's nose, clear of the platform's other place)
  -- while the trip's next aircraft is on its way there behind another tractor, or has another tractor waiting at
  -- its nose: it does not drive up the hangar towards it. Four minutes at the most. CATCC_DEMO_NO_HROW: off.
  if not CATCC_DEMO_NO_HROW and not w.rowDone then
    local J = tug.job
    local E0 = J and J.E
    local trip = E0 and E0.trips and E0.trips[E0.trip]
    local coming = false
    if trip and J.load then
      for _, ld in ipairs(trip.on or {}) do
        -- (on its way: not one that stands on the platform too, its tractor unhooking: the two would wait for each other)
        local ph = ld.job and ld.job.w and ld.job.w.phase
        if ld ~= J.load and not ld.done and ld.job and ld.job.tug ~= tug and (ph == 'arrive' or ph == 'backout' or ph == 'lift' or ph == 'backup' or ph == 'hooked' or ph == 'pull' or ph == 'push') then coming = true end
      end
      for _, ld in ipairs(trip.pool and E0.pool or E0.stay or {}) do
        if not ld.taken then
          if ld.claim and ld.claim ~= tug and #(trip.on or {}) < (trip.size or 0) then coming = true end
          break
        end
      end
    end
    w.rowT0 = w.rowT0 or now
    if coming and now - w.rowT0 < 240 then
      if not w.rowSaid then
        w.rowSaid = true
        logLine(string.format('demo: %s stays at the platform of elevator %d: the next aircraft for it is on its way with another tractor', tug.name, E0.k))
      end
      return nil, nil, true
    end
    w.rowDone = true
  end
  w.homeT0 = w.homeT0 or now
  local front = w.front or w.wasFront
  if w.front then
    -- (from here on w.d is the tractor as it really stands)
    d.x, d.z, d.hx, d.hz = Tow.real(w)
    w.front, w.frontHitch, w.wheels = nil, nil, nil
    w.wasFront = true
  end
  local home = tug.home
  local why = 'no way found'
  local taken = false
  local oth = others('hangar', nil)
  for _, el in ipairs(M.elevators) do
    for _, r in ipairs(el.riders) do
      if r.level == 'el' then oth[#oth + 1] = { x = r.x, z = r.z, fx = r.fx, fz = r.fz, name = r.name, half = HALF, shape = Tow.Fd.shape(r.x, r.z, r.fx, r.fz, HALF) } end
    end
  end
  -- STRAIGHT TO THE NEXT AIRCRAFT OF ITS ELEVATOR (the user, 2026-11-18, after the run: "Tugs in the hangar sometimes
  -- pull off to the side to stage instead of parking at their next aircraft even when there is no collision risk if
  -- they wait at the aircraft"): the plan's nextWay for the tow just ended (from the hitch it was on), if the next of
  -- this tractor's elevator is the aircraft that way was solved for, still parked, and a tractor standing at its
  -- nose is in no earlier tow's way (that aircraft's `early`). The tractor then waits there (tug.claim).
  local nw = w.solvedT and w.solvedT.nextWay and w.solvedT.nextWay[front and 'front' or 'rear']
  local E = tug.el and M.el and M.el[tug.el]
  if nw and E and M.tugOf and M.tugOf[tug.el] == tug then
    local ldY
    for _, list in ipairs({ E.pool, E.stay }) do
      for _, ld in ipairs(list) do
        if not ldY and not ld.taken then ldY = ld end
      end
    end
    local X, sy = w.subj and w.subj.e, ldY and M.slotOf and M.slotOf[ldY.n]
    local sx = X and M.slotOf and M.slotOf[X.slot or 0]
    local Ty = ldY and H.tows and H.tows[ldY.n]
    local kind = nw.front and 'front' or 'rear'
    if sx and sy and Ty and sy.turn == sx.turn + 1 and Ty.early and Ty.early[kind] and ldY.a.level == 'hangar' and not ldY.claim and not ldY.a.towed then
      local Y = ldY.a
      local fx, fz = unit(Y.fx, Y.fz)
      local ux, uz = M.turned(fx, fz, Ty.alpha)
      local last = nw.pts[#nw.pts]
      local goal = nw.front and { x = last[1], z = last[2], hx = -ux, hz = -uz } or { x = last[1], z = last[2], hx = ux, hz = uz, turnOk = ALONG.turnOk }
      local path, arc, back = within(ENV_HANGAR, solvedWay, tug, nw, goal, oth)
      if path and not free('hangar', circles({}, path, 2.0), tug, nil, nil, wayFine) then path, taken = nil, true end
      if path then
        if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
        if back then w.solo, w.startBack, w.backOut = true, true, { len = back, s = 0, v = 0 } end
        tug.claim, ldY.claim = { ld = ldY, front = nw.front or nil }, tug
        logLine(string.format('demo: %s goes straight to the nose of %s, the next of elevator %d, and waits there%s', tug.name, tostring(Y.board), tug.el, nw.front and ' (head on, for its front hitch)' or ''))
        return path
      end
      if taken and now - w.homeT0 < 45 then return nil, nil, true end
    end
  end
  -- TO THE NOSE OF THE NEXT AIRCRAFT BY A WAY MADE UP HERE, where the plan has no solved way on from this tow's end on
  -- this hitch (2026-11-19: elevator 4's tractor, after its first tow on its front hitch, had none: its solved ways
  -- back led only to a post 90 m forward, from which there is no way to its next aircraft: another elevator's tractor
  -- then came 200 m for it): hangarFront / hangarApproach from where it stands (backing round first if it must), if
  -- a tractor may wait at that nose (the plan's `early`). Tried twice at the most.
  if E and M.tugOf and M.tugOf[tug.el] == tug and not CATCC_DEMO_NO_NOSE2 and (w.noseTried or 0) < 2 then
    local ldY
    for _, list in ipairs({ E.pool, E.stay }) do
      for _, ld in ipairs(list) do
        if not ldY and not ld.taken then ldY = ld end
      end
    end
    -- ITS OWN ELEVATOR HAS NOTHING LEFT: TO THE NOSE OF THE LAST AIRCRAFT OF ANOTHER ELEVATOR that still has two and more
    -- to come: the one that stands furthest from its elevator (its own tractor has the longest way back for it): the
    -- user, 2026-11-19: "The final tow out of the hangar still takes way too long": elevator 4's last aircraft
    -- stands 107 m from it, and its tractor, the one before on the platform, drove back for it for 80 s while
    -- elevator 1's tractor had stood idle 40 m from that aircraft for nine minutes. CATCC_DEMO_NO_LASTCLAIM: off.
    local helpK
    if not ldY and not CATCC_DEMO_NO_LASTCLAIM then
      local bd
      for _, E2 in ipairs(M.elevators) do
        if E2 ~= E then
          local left, last = 0, nil
          for _, list in ipairs({ E2.pool or {}, E2.stay or {} }) do
            for _, ld in ipairs(list) do
              if not ld.taken then left, last = left + 1, ld end
            end
          end
          local e2 = H.elevators[E2.k]
          if left >= 2 and last and e2 and last.a.level == 'hangar' and not last.claim and not last.a.towed then
            local dd = hyp(last.a.x - (e2.x[1] + e2.x[2]) / 2, last.a.z - (e2.z[1] + e2.z[2]) / 2)
            if not bd or dd > bd then ldY, helpK, bd = last, E2.k, dd end
          end
        end
      end
    end
    local Ty = ldY and H.tows and H.tows[ldY.n]
    if ldY and Ty and Ty.early and (Ty.early.front or Ty.early.rear) and ldY.a.level == 'hangar' and not ldY.claim and not ldY.a.towed then
      w.noseTried = (w.noseTried or 0) + 1
      local Y = ldY.a
      local oth2 = {}
      for _, o in ipairs(oth) do
        if o.name ~= Y.name then oth2[#oth2 + 1] = o end
      end
      local tries = {}
      local starts = front and { 1, -1 } or { 0, 1, -1 }
      if Ty.early.front then
        for _, st in ipairs(starts) do tries[#tries + 1] = { front = true, start = st ~= 0 and st or nil } end
      end
      if Ty.early.rear then
        local jx, jz = unit(Y.fx, Y.fz)
        local nx, nz = Y.x + jx * TOW.noseGear, Y.z + jz * TOW.noseGear
        local pref = ((d.x - nx) * -jz + (d.z - nz) * jx) >= 0 and 1 or -1
        for _, st in ipairs(starts) do
          for _, side in ipairs({ pref, -pref }) do tries[#tries + 1] = { side = side, uA = ALONG.from[1], start = st ~= 0 and st or nil } end
        end
      end
      for _, q in ipairs(tries) do
        local arr, arc
        if q.front then
          arr, arc = within(ENV_HANGAR, hangarFront, tug, Y, oth2, q.start, Ty.alpha)
        else
          arr, arc = within(ENV_HANGAR, hangarApproach, tug, Y, oth2, q.side, q.uA, q.start, Ty.alpha)
        end
        if type(arr) == 'table' and free('hangar', circles({}, arr, 2.0), tug, nil, nil, wayFine) then
          if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
          tug.claim, ldY.claim = { ld = ldY, front = q.front or nil }, tug
          logLine(string.format('demo: %s goes to the nose of %s, the %s of elevator %d, by a way made up here (%.0f m%s), and waits there', tug.name, tostring(Y.board), helpK and 'LAST' or 'next', helpK or tug.el, Tow.routeLen(arr),
            q.front and ', head on, for its front hitch' or ''))
          return arr
        end
      end
    end
  end
  -- A SOLVED WAY BACK (the tow was the solved one: w.solvedT): to its own post if that has one and is free, else to the
  -- nearest post that is (no other tractor's, none standing there): that post is its own from then on
  local outs = w.solvedT and w.solvedT.out and w.solvedT.out[front and 'front' or 'rear']
  -- (the next aircraft of this tractor's elevator: its tow, for the choice of post)
  local nextT, nextA
  if E and M.tugOf and M.tugOf[tug.el] == tug then
    for _, list in ipairs({ E.pool, E.stay }) do
      for _, ld in ipairs(list) do
        if not nextT and not ld.taken then nextT, nextA = H.tows and H.tows[ld.n] or false, ld.a end
      end
    end
  end
  if outs then
    local list = {}
    for i, P in ipairs(M.posts or {}) do
      if outs[i] then
        local mine, taken = (P == home), false
        for _, t in ipairs(M.tugs) do
          if t ~= tug and t.level == 'hangar' and (t.home == P or hyp(t.d.x - P.x, t.d.z - P.z) < 6.5) then taken = true end
        end
        -- (the nearest: a tractor stays where the work is. Until 2026-11-18 its own post came first: a tractor from
        -- the forward end drove 90 m to each of the after aircraft and 90 m back, holding the floor between)
        -- (and from which it has a way to the next aircraft of its elevator: else it would have to be fetched from there)
        local onward = 150
        if nextT and nextT.ways and nextT.ways[i] then onward = Tow.routeLen(nextT.ways[i].pts) end
        -- (not one that a tow still to come passes through: only if there is no other)
        -- (but 60 only where the post has a solved way to this tractor's next aircraft: it stands there for that one tow
        -- and is gone: the rig, 2026-11-19: elevator 4's tractor passed over the post beside its next aircraft for one
        -- 90 m forward that has no way to it)
        -- (and 1000 where one of those tows is near (M.soon): the tractor would stand in its way when it begins)
        local safe, soon = M.postSafe(i, nextA)
        if not safe then onward = onward + ((nextT and nextT.ways and nextT.ways[i] and not soon) and 60 or 1000) end
        if not taken then list[#list + 1] = { P = P, W = outs[i], cost = Tow.routeLen(outs[i].pts) + onward - (mine and 5 or 0) } end
      end
    end
    table.sort(list, function(p, q) return p.cost < q.cost end)
    -- (FIRST THE POSTS THAT COST LESS THAN 250 (the way there and the way on from there to its next aircraft; 150 where
    -- there is none; 1000 more where a tow still to come passes through the post); THEN ASIDE NEAR BY (M.hangarStandOk:
    -- 6 to 30 m off, by the way-finder); only then the far posts)
    for pass = 1, 2 do
    -- (a post near by whose way is only in use just now: waited for, 20 s, before anything further off)
    if pass == 2 and taken and now - w.homeT0 < 20 then break end
    if pass == 2 and not CATCC_DEMO_NO_HASIDE and (w.asideTried or 0) < 2 then
      w.asideTried = (w.asideTried or 0) + 1
      local n = 0
      for _, r in ipairs({ 6, 9, 13, 18, 24, 30 }) do
        for k = 0, 15 do
          local an = k * math.pi / 8
          local P = { x = d.x + r * math.cos(an), z = d.z + r * math.sin(an), hx = math.cos(an), hz = math.sin(an), adhoc = true }
          if n < 4 and M.hangarStandOk(P, tug, nil, nil, oth) then
            n = n + 1
            for _, start in ipairs(front and { 1, -1 } or { 0, 1, -1 }) do
              local from, arc = d, nil
              if start ~= 0 then arc, from = within(ENV_HANGAR, quarterBack, tug, start, oth) end
              if from then
                M.finderTug = tug
                local way = within(ENV_HANGAR, hangarWide, #WIDE, { from.x, from.z }, { P.x, P.z }, from)
                M.finderTug = nil
                if type(way) == 'table' then
                  local path = Tow.Net.smooth(way, 4)
                  local good = within(ENV_HANGAR, Tow.Fd.simSolo, from, path, {}, nil, oth)
                  if good and not offTugs(path, tug) then good = nil end
                  if good and not free('hangar', circles({}, path, 2.0), tug, nil, nil, wayFine) then good = nil end
                  if good then
                    if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
                    logLine(string.format('demo: %s stands aside at %.1f / %.1f (no post near by has a way on from it)', tug.name, P.x, P.z))
                    tug.home = P
                    return path
                  end
                end
              end
            end
          end
        end
      end
    end
    for _, c in ipairs(list) do
      if (c.cost < 250) == (pass == 1) then
      local path, arc, back = within(ENV_HANGAR, solvedWay, tug, c.W, nil, oth)
      -- (HELD AGAINST WHAT THE OTHER JOBS HOLD (2026-11-18: in the rig two tractors came within a metre of each other:
      -- one on its solved way back, one on its way to an aircraft: a solved way keeps off aircraft and posts, not off
      -- a tractor that is driving): if it is taken, the next post's; if all are, it waits where it stands, up to 45 s)
      if path and not free('hangar', circles({}, path, 2.0), tug, nil, nil, wayFine) then path, taken = nil, true end
      if path then
        if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
        if back then w.solo, w.startBack, w.backOut = true, true, { len = back, s = 0, v = 0 } end
        if c.P ~= home then logLine(string.format('demo: %s goes to wait at %.1f / %.1f (the nearest free post with a way from here)', tug.name, c.P.x, c.P.z)) end
        tug.home = c.P
        return path
      end
      why = arc or why
      end
    end
    end
    if taken and now - w.homeT0 < 45 then return nil, nil, true end
  end
  for _, start in ipairs(front and { 1, -1 } or { 0, 1, -1 }) do
    local from, arc = d, nil
    if start ~= 0 then arc, from = within(ENV_HANGAR, quarterBack, tug, start, oth) end
    if from then
      for wi = 1, #WIDE do
      M.finderTug = tug
      local way = within(ENV_HANGAR, hangarWide, wi, { from.x, from.z }, { home.x, home.z }, from)
      -- (onto the post along the way a tractor stands there: 4 m straight in: so that it stands as its solved ways have it)
      local lead = home.hx and within(ENV_HANGAR, hangarWide, wi, { from.x, from.z }, { home.x - home.hx * 4, home.z - home.hz * 4 }, from)
      M.finderTug = nil
      if type(lead) == 'table' and #lead >= 1 then
        lead[#lead + 1] = { home.x, home.z }
        for _, r in ipairs({ 4, 2.5 }) do
          local path = Tow.Net.smooth(lead, r)
          local good = within(ENV_HANGAR, Tow.Fd.simSolo, from, path, {}, { x = home.x, z = home.z, hx = home.hx, hz = home.hz }, oth)
          if good and not offTugs(path, tug) then good = nil end
          if good and now - w.homeT0 < 150 and not free('hangar', circles({}, path, 2.0), tug, nil, nil, wayFine) then good, taken = nil, true end
          if good then
            if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
            return path
          end
        end
      end
      if way then
        for _, r in ipairs({ 4, 2.5 }) do
          local path = Tow.Net.smooth(way, r)
          local good, bad = within(ENV_HANGAR, Tow.Fd.simSolo, from, path, {}, nil, oth)
          if good and not offTugs(path, tug) then good, bad = nil, 'its way passes too near another tractor' end
          -- (HELD AGAINST WHAT THE OTHER JOBS HOLD, as a solved way is: the rig, 2026-11-18: after its 45 s of
          -- waiting a tractor took the way-finder's way back through another tractor's way to a post: the two met
          -- 0.2 m apart. It waits two and a half minutes in all; then it goes.)
          if good and now - w.homeT0 < 150 and not free('hangar', circles({}, path, 2.0), tug, nil, nil, wayFine) then good, bad, taken = nil, 'its way is in use', true end
          if good then
            if arc then w.solo, w.startBack, w.backOut = true, true, { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
            return path
          end
          why = bad or why
        end
      end
      end
    else
      why = 'there is no room for the tractor to back round where it stands'
    end
  end
  if taken and now - w.homeT0 < 150 then return nil, nil, true end
  if front then
    -- (it stands facing the platform: straight back 6 m, into the hangar, and there it stands)
    logLine(string.format('demo: %s finds no clear way back to its place (%s): it backs 6 m and stands', tug.name, tostring(why)))
    w.solo, w.startBack, w.backOut = true, true, { len = 6, s = 0, v = 0 }
    return { { d.x - d.hx * 6, d.z - d.hz * 6 }, { d.x - d.hx * 5.9, d.z - d.hz * 5.9 } }
  end
  logLine(string.format('demo: %s finds no clear way back to its place (%s): it moves on 8 m and stands', tug.name, tostring(why)))
  return nil
end

-- a hangar tractor by itself sets off for a place to wait at (path: its way; arc / back: it first backs a quarter
-- circle / that many metres straight): the job; that place is its own from then on. False if what its way would
-- hold is held by another job.
local function shiftGo(tug, dest, path, arc, back, oth, text)
  local d = tug.d
  local cs = circles({}, path, 2.0)
  cs[#cs + 1] = { d.x, d.z, 2.9 }
  if not free('hangar', cs, tug, nil, nil, wayFine) then return false end
  local w = { phase = 'leave', t0 = Tow.now(), bar = 'none', theta = M.thetaIn, clamped = true, thetaIn = M.thetaIn, ringUp = TOW.bar.ringRest, lugUp = Tow.axleUp(), floor = H.floor,
    deck = 'hangar', ids = { tug = tug.id, tugOwn = true }, quiet = true, solo = true, name = tug.name, env = ENV_HANGAR, driver = tug.driver, home = dest, ship = M.ship, others = oth }
  w.d = d
  d.v, d.turnR, d.hold = 0, nil, nil
  w.soloCap = M.capFor('hangar')
  d.cap = w.soloCap
  Tow.path(w, path, TOW.speed, TOW.fastSolo)
  if arc then w.phase, w.backOut = 'backout', { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
  if back then w.phase, w.backOut = 'backout', { len = back, s = 0, v = 0 } end
  local job = { level = 'hangar', tug = tug, w = w, shift = true, circles = cs, wayN = #cs - 1 }
  tug.job, tug.home = job, dest
  M.jobs[#M.jobs + 1] = job
  changed(true)
  logLine(string.format('demo: %s %s (%.0f m%s); %d circles held', tug.name, text, Tow.routeLen(path), arc and ', backing round a quarter circle first' or (back and ', backing straight first' or ''), #cs))
  return true
end

-- MAY A TRACTOR WAIT AT A POST: no tow that is still to come passes through a tractor standing there (the plan's
-- postClash: by post, the places of those tows): none of those aircraft is still parked (but `mine`: the aircraft
-- the tractor itself is for: it leaves the post to tow that one)
-- Its second answer: one of those tows is NEAR (M.soon): the post is then not taken while there is any other (the
-- rig, 2026-11-20, at real time: elevator 4's tractor, back from a tow at 10:04, went to the post at -93.5 / -3.0,
-- which has a way to its own next aircraft, through the way of elevator 3's next tow (525), whose platform was down:
-- 525 began at 10:45; at that post it then stood in the way of 637, elevator 3's next but one, and stepped aside twice
-- (20 s): the four tows at the end of the demo wait for each other in a row behind those two)
function M.postSafe(i, mine)
  local safe, soon = true, false
  for _, n in ipairs((H.postClash and H.postClash[i]) or {}) do
    local a = M.bySlot and M.bySlot[n]
    if a and a ~= mine and a.level == 'hangar' and not a.towed and a.slot == n and hyp(a.x - M.slotOf[n].x, a.z - M.slotOf[n].z) < 1 then
      safe = false
      if M.soon(a, mine) then soon = true end
    end
  end
  return safe, soon
end

-- IS AN AIRCRAFT'S TOW NEAR: its elevator's platform is down (or on its way down) and it is one of those that
-- platform is down for (its trip's places not yet taken: the next of that elevator still to be taken). Not counted
-- while the tractor's own next aircraft (mine) is one that a platform is down for: the tractor leaves the post for it.
-- (Counting the next trip of a platform that was still up as well: the rig, 2026-11-20: elevator 4's tractor, after
-- its first tow, found no post near by but the one in the way of elevator 3's second trip, stood aside where it had
-- no way to its own next aircraft, and elevators 3 and 4 stood still for good.) CATCC_DEMO_NO_POSTSOON: never (as
-- it was).
function M.soon(a, mine)
  if CATCC_DEMO_NO_POSTSOON then return false end
  local function nextTwo(E, x)
    local tr = E.trips and E.trips[E.trip]
    local need = tr and (tr.size - #tr.on) or 0
    if need <= 0 then return false end
    local n = 0
    for _, list in ipairs({ E.pool, E.stay }) do
      for _, ld in ipairs(list) do
        if not ld.taken then
          n = n + 1
          if ld.a == x then return n <= need end
        end
      end
    end
    return false
  end
  local function lowered(E) return E.state == 'down' or E.state == 'lowering' end
  if mine then
    for _, E in ipairs(M.elevators or {}) do
      if lowered(E) and nextTwo(E, mine) then return false end
    end
  end
  for _, E in ipairs(M.elevators or {}) do
    if lowered(E) and nextTwo(E, a) then return true end
  end
  return false
end

-- is a post free for a tractor: no other tractor's own, none standing within 6.5 m of it
local function postFree(P, tug)
  for _, t in ipairs(M.tugs) do
    if t ~= tug and t.level == 'hangar' and (t.home == P or hyp(t.d.x - P.x, t.d.z - P.z) < 6.5) then return false end
  end
  return true
end

-- every aircraft down there and on the platforms that are down (for a tractor's way by itself)
local function hangarAll()
  local oth = others('hangar', nil)
  for _, el in ipairs(M.elevators) do
    for _, r in ipairs(el.riders) do
      if r.level == 'el' then oth[#oth + 1] = { x = r.x, z = r.z, fx = r.fx, fz = r.fz, name = r.name, half = HALF, shape = Tow.Fd.shape(r.x, r.z, r.fx, r.fz, HALF) } end
    end
  end
  return oth
end

-- A TOW THAT HAS NO SOLVED WAY FROM WHERE THE IDLE TRACTORS STAND IS FETCHED: an idle tractor goes, by a solved way
-- from post to post (the plan's hops), to a free post from which the tow (T) has one: the pair that is shortest in
-- all. True if one has set off (the tow is looked at again when it stands there).
local function hangarFetch(T, a)
  if not (T and T.ways and H.hops) then return false end
  local list = {}
  -- (NOT WHILE AN IDLE TRACTOR STANDS AT A POST FROM WHICH THE TOW HAS A SOLVED WAY: it only cannot take that way just
  -- now: the rig, 2026-11-19: one drove from post 1 to post 2 and back six times, each "from there it has a way")
  for _, t in ipairs(M.tugs) do
    local i = t.level == 'hangar' and not t.job and postOf(t)
    if i and T.ways[i] then return false end
  end
  for _, t in ipairs(M.tugs) do
    local i = t.level == 'hangar' and not t.job and postOf(t)
    if i and H.hops[i] then
      for j, P in ipairs(M.posts) do
        local hop = H.hops[i][j]
        if hop and T.ways[j] and postFree(P, t) and M.postSafe(j, a) then list[#list + 1] = { t = t, P = P, hop = hop, j = j, cost = Tow.routeLen(hop.pts) + Tow.routeLen(T.ways[j].pts) } end
      end
    end
  end
  table.sort(list, function(p, q) return p.cost < q.cost end)
  local oth = hangarAll()
  for i = 1, math.min(4, #list) do
    local c = list[i]
    local path, arc, back = within(ENV_HANGAR, solvedWay, c.t, c.hop, nil, oth)
    if path and shiftGo(c.t, c.P, path, arc, back, oth, string.format('goes to post %d (%.1f / %.1f): from there it has a way to %s', c.j, c.P.x, c.P.z, tostring(a.board))) then return true end
  end
  return false
end

-- AN IDLE TRACTOR THAT STANDS IN A TOW'S WAY AND CANNOT TAKE THAT TOW ITSELF MOVES OFF (the user's full hangar,
-- 2026-11-18: the tractor that waits in the starboard wall's pocket stands 8 m ahead of the nose of the aircraft
-- beside it, off its line and facing it: it has no way onto that line, and while it stood there no other tractor was
-- given the tow): to another place to wait at (the plan's `rest`, or a home nobody has): the nearest that no other
-- tractor stands at or is on its way to, that the tow does not sweep, and that it has a way to (found and driven in
-- the head as its way home is). That place is its own from then on. sweep: the tow's circles; what: for the log.
-- True if it has set off.
-- A PLACE NEAR BY TO STAND ASIDE AT (the hangar has few posts, and aft of amidships only three: a tractor that stood in
-- a tow's way there was sent to a post 100 m forward, and came 100 m back for its next aircraft: the rig,
-- 2026-11-19): 6 to 30 m off: free floor under the tractor and 1.2 m either side of it, 1 m from every aircraft,
-- 6.5 m from every other tractor and its place, 0.8 m from all the tow sweeps (its shapes; without them 3.4 m from
-- its circles), 3 m clear of what the other jobs hold, not in front of an elevator's doorway. P: { x, z, hx, hz }:
-- nose the way it gets there.
function M.hangarStandOk(P, tug, fine, sweep, oth)
  for _, u in ipairs({ -3.6, -2.4, -1.2, 0, 1.2, 2.4 }) do
    for _, sd in ipairs({ -1.2, 0, 1.2 }) do
      if cell(P.x + P.hx * u - P.hz * sd, P.z + P.hz * u + P.hx * sd) ~= '.' then return false end
    end
  end
  for k = 1, 4 do
    local e = H.elevators[k]
    local sgn = e.z[1] > 0 and 1 or -1
    if P.x > e.open[1] - 3 and P.x < e.open[2] + 3 and sgn * P.z > 4 then return false end
  end
  local T = Tow.Fd.tugShape(P.x, P.z, P.hx, P.hz)
  for _, o in ipairs(oth) do
    if (o.x - P.x) ^ 2 + (o.z - P.z) ^ 2 < 484 and Tow.Fd.gap(T, o.shape) < 1.0 then return false end
  end
  for _, t in ipairs(M.tugs) do
    if t ~= tug and t.level == 'hangar' and (hyp(t.d.x - P.x, t.d.z - P.z) < 6.5 or (t.home and hyp(t.home.x - P.x, t.home.z - P.z) < 6.5)) then return false end
  end
  if fine then
    for _, sh in ipairs(fine) do
      if (sh.x - P.x) ^ 2 + (sh.z - P.z) ^ 2 < 484 and (Tow.Fd.gap(T, sh.jet) < 0.8 or Tow.Fd.gap(T, sh.tug) < 0.8) then return false end
    end
  else
    for _, c in ipairs(sweep or {}) do
      if hyp(c[1] - P.x, c[2] - P.z) < c[3] + 3.4 then return false end
    end
  end
  for _, j in ipairs(M.jobs) do
    if j.level == 'hangar' and j.tug ~= tug then
      for _, c in ipairs(j.circles or {}) do
        if hyp(c[1] - P.x, c[2] - P.z) < c[3] + 3.0 then return false end
      end
    end
  end
  return true
end

local function hangarShift(tug, sweep, what, fine)
  local d = tug.d
  if tug.claim then
    tug.claim.ld.claim = nil
    tug.claim = nil
  end
  local oth = others('hangar', nil)
  for _, el in ipairs(M.elevators) do
    for _, r in ipairs(el.riders) do
      if r.level == 'el' then oth[#oth + 1] = { x = r.x, z = r.z, fx = r.fx, fz = r.fz, name = r.name, half = HALF, shape = Tow.Fd.shape(r.x, r.z, r.fx, r.fz, HALF) } end
    end
  end
  local places = {}
  for _, list in ipairs({ H.rest or {}, H.homes }) do
    for _, h in ipairs(list) do
      local good = hyp(h.x - d.x, h.z - d.z) > 6
      for _, t in ipairs(M.tugs) do
        if t.level == 'hangar' and t ~= tug and (t.home == h or hyp(t.d.x - h.x, t.d.z - h.z) < 6.5) then good = false end
      end
      for _, c in ipairs(sweep) do
        if hyp(c[1] - h.x, c[2] - h.z) < c[3] + 3.4 then good = false end
      end
      -- (and no tow still to come passes through it)
      for pi, P in ipairs(M.posts or {}) do
        if P == h and not M.postSafe(pi) then good = false end
      end
      if good then places[#places + 1] = h end
    end
  end
  table.sort(places, function(p, q) return hyp(p.x - d.x, p.z - d.z) < hyp(q.x - d.x, q.z - d.z) end)
  local why = 'no place to wait at is free'
  local all = {}
  -- (FIRST: ASIDE NEAR BY (M.hangarStandOk): the nearest four such places the way-finder has a way to; it stands there,
  -- at no post, and is given its next tow from there by the ways made up as it runs)
  if not CATCC_DEMO_NO_HASIDE then
    local near = {}
    for _, r in ipairs({ 6, 9, 13, 18, 24, 30 }) do
      for k = 0, 15 do
        local an = k * math.pi / 8
        local P = { x = d.x + r * math.cos(an), z = d.z + r * math.sin(an), hx = math.cos(an), hz = math.sin(an), adhoc = true }
        if #near < 4 and M.hangarStandOk(P, tug, fine, sweep, oth) then near[#near + 1] = P end
      end
    end
    for _, dest in ipairs(near) do
      for _, start in ipairs({ 0, 1, -1 }) do
        local from, arc = d, nil
        if start ~= 0 then arc, from = within(ENV_HANGAR, quarterBack, tug, start, oth) end
        if from then
          M.finderTug = tug
          local way = within(ENV_HANGAR, hangarWide, #WIDE, { from.x, from.z }, { dest.x, dest.z }, from)
          M.finderTug = nil
          if way then
            for _, r in ipairs({ 4, 2.5 }) do
              local path = Tow.Net.smooth(way, r)
              local good = within(ENV_HANGAR, Tow.Fd.simSolo, from, path, {}, nil, oth)
              if good and not offTugs(path, tug) then good = nil end
              if good and shiftGo(tug, dest, path, arc, nil, oth, string.format('stands in the way of the tow of %s and cannot take it itself: it steps aside to %.1f / %.1f', tostring(what), dest.x, dest.z)) then
                M.hAside = (M.hAside or 0) + 1
                return true
              end
            end
          end
        end
      end
    end
  end
  -- (by a solved way from post to post, if it stands at a post)
  local at = postOf(tug)
  for i = 1, #places do
    local hop
    for j, P in ipairs(M.posts or {}) do
      if P == places[i] and at and H.hops and H.hops[at] then hop = H.hops[at][j] end
    end
    if hop then
      local path, arc, back = within(ENV_HANGAR, solvedWay, tug, hop, nil, oth)
      if path and shiftGo(tug, places[i], path, arc, back, oth, string.format('stands in the way of the tow of %s and cannot take it itself: it moves off to wait at %.1f / %.1f', tostring(what), places[i].x, places[i].z)) then
        return true
      end
    end
  end
  for i = 1, math.min(4, #places) do
    local dest = places[i]
    for _, start in ipairs({ 0, 1, -1 }) do
      local from, arc = d, nil
      if start ~= 0 then arc, from = within(ENV_HANGAR, quarterBack, tug, start, oth) end
      if from then
        for wi = 1, #WIDE do
        M.finderTug = tug
        local way = within(ENV_HANGAR, hangarWide, wi, { from.x, from.z }, { dest.x, dest.z }, from)
        M.finderTug = nil
        if way then
          for _, r in ipairs({ 4, 2.5 }) do
            local path = Tow.Net.smooth(way, r)
            local good, bad = within(ENV_HANGAR, Tow.Fd.simSolo, from, path, {}, nil, oth)
            if good and not offTugs(path, tug) then good, bad = nil, 'its way passes too near another tractor' end
            if not good then
              all[#all + 1] = string.format('to %.0f / %.0f%s, %s room, corners on %.1f m: %s', dest.x, dest.z, start ~= 0 and ' (backed round first)' or '', WIDE[wi] > 0 and (WIDE[wi] .. ' m more') or 'the least', r,
                gist(bad))
            end
            if good and shiftGo(tug, dest, path, arc, nil, oth, string.format('stands in the way of the tow of %s and cannot take it itself: it moves off to wait at %.1f / %.1f', tostring(what), dest.x, dest.z)) then
              return true
            end
            why = bad or why
          end
        end
        end
      end
    end
  end
  if tug.shiftWhy ~= why then
    tug.shiftWhy = why
    logLine(string.format('demo: %s stands in the way of the tow of %s, cannot take it itself, and finds no way to another place to wait at (%s); it stands at %.2f / %.2f, heading %.0f', tug.name, tostring(what), tostring(why), d.x, d.z, math.deg(atan2(d.hz, d.hx)) % 360))
    for i = 1, math.min(CATCC_DEMO_TRIED or 6, #all) do logLine('  tried: ' .. all[i]) end
  end
  return false
end

-- ---------------------------------------------------------------- the jobs
local hangarSearch
-- A STEP OF THE SEARCH (hangarSearch), spread over frames where it is long (the tractor's way to the aircraft: M.sliced):
-- 'busy' while it is still at it. A step begun for another case (the platform has since gone up or come down) is let go.
local function hsearch(E, trip, ready, helper)
  if CATCC_DEMO_NO_SLICE then return hangarSearch(E, trip, ready, helper) end
  local key = tostring(ready and true or false) .. tostring(helper and true or false) .. tostring(E.trip)
  if E.hsCo and E.hsKey ~= key then E.hsCo = nil end
  E.hsKey = key
  local done, r, why = M.sliced(E, 'hsCo', hangarSearch, E, trip, ready, helper)
  if not done then return 'busy' end
  return r, why
end

function M.mayHelp(t, E)
  local k = t.el
  if not k or (k <= 2) == (E.k <= 2) then return true end
  local E2 = M.el and M.el[k]
  for _, list in ipairs(E2 and { E2.pool, E2.stay } or {}) do
    for _, ld in ipairs(list) do
      if not ld.taken then return false end
    end
  end
  return true
end

-- THE NEXT AIRCRAFT FOR AN ELEVATOR THAT IS DOWN, looked for a step a frame (M.budget: one step in all a frame): the
-- next of its list (trip.pool: those that go on to a deck spot; else either of the two that stay), if it has a tow
-- that can be driven now (hangarCands, one way a step), an idle tractor whose way to it is clear (hangarApproach or
-- hangarFront, one go a step) and nothing held in its way. Returns true: a job has started; 'busy': still looking; nil and why: none can
-- come as the hangar stands (kept: nothing is tried again until the hangar has changed: M.sigH).
-- ready: the elevator is not down: the aircraft is taken to the place short of its door and held there, its tractor on
-- the bar (the job's to = 'ready', w.hold; pushed on when the elevator is down: startPush). Not while another elevator
-- is down and itself looking for a tractor (E.wantsTug).
function hangarSearch(E, trip, ready, helper)
  ready = ready and true or false
  helper = helper and true or false
  local S = E.search
  -- (A SEARCH THAT IS UNDER WAY IS FINISHED, NOT BEGUN ANEW, WHEN THE HANGAR CHANGES (2026-11-19): it goes a step a
  -- frame, and the hangar "changes" every 2 s while any tow there gives up what it has passed: at 8 times speed,
  -- where a frame is a quarter of a second, no search came to its end while anything moved below: elevator 4's
  -- last two aircraft were begun 2 min 10 and 2 min 18 after they could have been. What it finds is asked against
  -- what every job holds at that moment (`free`) before a tow begins; if it finds nothing, it is begun anew at
  -- once. CATCC_DEMO_NO_KEEPSEARCH: as it was.)
  if S and (S.ready ~= ready or (S.helper or false) ~= helper) then S = nil end
  if S and S.sig ~= M.sigH and (S.done or CATCC_DEMO_NO_KEEPSEARCH) then S = nil end
  if not S then
    S = { sig = M.sigH, loads = {}, li = 1, ready = ready, helper = helper }
    for _, ld in ipairs(trip.pool and E.pool or E.stay) do
      -- (of those that go on to a deck spot: the next of the list only; of the two that stay: either)
      -- (with the solved tows: the next of the list only for those too: the fifth before the sixth, as they were solved)
      if not ld.taken and not ((trip.pool or (H.tows and not CATCC_DEMO_NO_TOWS)) and #S.loads > 0) then S.loads[#S.loads + 1] = ld end
    end
    E.search = S
    M.tried = {}
  end
  if S.done then return nil, S.why end
  if (M.budget or 0) <= 0 then return 'busy' end
  M.budget = M.budget - 1
  local ld = S.loads[S.li]
  if not ld then
    S.done, S.why = true, S.why or 'no aircraft of its list is left for this trip'
    return nil, S.why
  end
  local a = ld.a
  local function nextLoad(why)
    S.why = S.why or (tostring(a.board) .. ': ' .. tostring(why))
    S.li, S.cands, S.plan, S.tugs, S.last, S.blocker = S.li + 1, nil, nil, nil, nil, nil
    return 'busy'
  end
  if not S.cands then
    S.env, S.cands, S.ci = hangarEnv(a, ready and E.k or nil), {}, 1
    local open = 0
    for _, st in ipairs(ld.sts) do
      -- (ready: E.at is still the trip's that has gone up: the places are this trip's to take, but for one already
      -- given to an aircraft drawn up to the door: E.pre)
      if (ready or not E.at[st]) and not (E.pre[st] and E.pre[st] ~= ld) then
        open = open + 1
        -- (ready: not those that stand on the platform up on the flight deck)
        local oth = hangarOthers(a, (not ready) and E or nil, not ready)
        -- (THE SOLVED TOW FIRST: the way found for this aircraft in the user's own order (H.tows, by its place); then
        -- the ways made up here, as before)
        local T = H.tows and H.tows[a.slot or 0]
        if T and T.st == st and not CATCC_DEMO_NO_TOWS then
          S.cands[#S.cands + 1] = { st = st, oth = oth, run = function() return towOf(a, E.k, st, oth, ready, T) end }
        end
        local list = within(S.env, hangarCands, a, E.k, st, oth, ready)
        list = type(list) == 'table' and list or {}
        within(S.env, hangarCands2, a, E.k, st, oth, ready, list)
        for _, run in ipairs(list) do S.cands[#S.cands + 1] = { st = st, oth = oth, run = run } end
      end
    end
    -- (its place on the platform is taken: nothing more comes this trip)
    if open == 0 then S.full = true end
    return 'busy'
  end
  if not S.plan then
    local c = S.cands[S.ci]
    if not c then return nextLoad('no tow: ' .. tostring(S.last or 'it stands neither tail nor nose towards a free place on the platform')) end
    S.ci = S.ci + 1
    local plan, why = within(S.env, c.run)
    if plan then S.plan, S.st, S.oth = plan, c.st, c.oth else S.last = S.last or why end
    return 'busy'
  end
  if not S.tugs then
    local idle = {}
    for _, t in ipairs(M.tugs) do
      if t.level == 'hangar' and not t.job then idle[#idle + 1] = t end
    end
    -- (A TRACTOR FOR EACH ELEVATOR (M.tugOf): the elevator's own takes its aircraft; another only if its own has been
    -- busy elsewhere for 75 s)
    local own = M.tugOf and M.tugOf[E.k]
    -- (ANOTHER TRACTOR STANDS AT THIS AIRCRAFT'S NOSE, WAITING FOR IT (it came there when its own elevator had nothing
    -- left: hangarHome): the tow is its own)
    local cl = ld.claim
    if cl and cl ~= own and not cl.job and cl.claim and cl.claim.ld == ld and not CATCC_DEMO_NO_LASTCLAIM then
      S.tugs, S.ti, S.last = { { t = cl, claimed = true, front = cl.claim.front or nil } }, 1, nil
      return 'busy'
    end
    -- (helper: while the elevator's own tractor has the aircraft before in tow: another tractor only)
    if S.helper then
      local keep = {}
      for _, t in ipairs(idle) do
        if t ~= own and M.mayHelp(t, E) then keep[#keep + 1] = t end
      end
      idle, own = keep, nil
    end
    if own then
      if not own.job then
        -- (ITS OWN TRACTOR HAS FOUND NO WAY TO ITS AIRCRAFT FOR 45 s (E.ownFailAt): any idle tractor may take it)
        if not (E.ownFailAt and Tow.now() - E.ownFailAt > 45) then idle = { own } end
        E.ownSince = nil
      else
        E.ownSince = E.ownSince or Tow.now()
        if Tow.now() - E.ownSince < (tonumber(CATCC_DEMO_OWNWAIT) or 75) then
          S.done, S.why = true, 'its own tractor (' .. own.name .. ') is still busy: the way is in use'
          return nil, S.why
        end
      end
    end
    -- (WHO MAY TAKE ANOTHER ELEVATOR'S AIRCRAFT: a tractor of the same half of the hangar (elevators 1 and 2; 3 and
    -- 4), or one whose own elevator has nothing left below: the rig, 2026-11-19: elevator 1's tractor drove 200 m
    -- aft for one of elevator 4's and elevator 1's next aircraft left seven minutes late)
    if own then
      local keep = {}
      for _, t in ipairs(idle) do
        if t == own or M.mayHelp(t, E) then keep[#keep + 1] = t end
      end
      idle = keep
    end
    if #idle == 0 then
      S.done, S.why = true, 'no tractor is idle'
      return nil, S.why
    end
    -- (its own tractor stands at this aircraft's nose already (hangarHome: nextWay): it has no way to drive)
    if own and not own.job and own.claim and own.claim.ld == ld then
      S.tugs, S.ti, S.last = { { t = own, claimed = true, front = own.claim.front or nil } }, 1, nil
      return 'busy'
    end
    if ready then
      -- (an elevator that is down and itself looking for a tractor comes first)
      for _, el in ipairs(M.elevators) do
        if el ~= E and el.wantsTug then return 'busy' end
      end
    end
    table.sort(idle, function(p, q) return hyp(p.d.x - a.x, p.d.z - a.z) < hyp(q.d.x - a.x, q.d.z - a.z) end)
    S.tugs, S.ti, S.last = {}, 1, nil
    local nx, nz = a.x + a.fx * TOW.noseGear, a.z + a.fz * TOW.noseGear
    for _, t in ipairs(idle) do
      -- (the side the tractor stands on first)
      local pref = ((t.d.x - nx) * -a.fz + (t.d.z - nz) * a.fx) >= 0 and 1 or -1
      -- (as it stands if the aircraft is ahead of it; else backed round a quarter circle first, either way)
      local ahead = (a.x - t.d.x) * t.d.hx + (a.z - t.d.z) * t.d.hz > 0
      for _, start in ipairs(ahead and { 0, 1, -1 } or { 1, -1, 0 }) do
        for _, side in ipairs({ pref, -pref }) do
          for _, uA in ipairs(ALONG.from) do S.tugs[#S.tugs + 1] = { t = t, side = side, uA = uA, start = start ~= 0 and start or nil } end
        end
      end
      -- (then head on, for its front hitch)
      for _, start in ipairs({ 0, 1, -1 }) do S.tugs[#S.tugs + 1] = { t = t, front = true, start = start ~= 0 and start or nil } end
    end
    -- (FIRST OF ALL: a tractor that stands at a post from which this tow has a solved way to the aircraft: the
    -- nearest by that way)
    local T = S.plan.solved and S.plan.T
    if T and T.ways then
      local first = {}
      for _, t in ipairs(idle) do
        local i = postOf(t)
        if i and T.ways[i] then first[#first + 1] = { t = t, way = T.ways[i], front = T.ways[i].front or nil, len = Tow.routeLen(T.ways[i].pts) } end
      end
      table.sort(first, function(p, q) return p.len < q.len end)
      for i = #first, 1, -1 do table.insert(S.tugs, 1, first[i]) end
    end
    return 'busy'
  end
  local q = S.tugs[S.ti]
  if not q then
    -- (an idle tractor stands in the tow's way and could not take it itself: it moves off; the tow is looked at again
    -- when it has (the hangar has changed))
    if S.blocker and not S.blocker.job and hangarShift(S.blocker, S.plan.sweep, a.board, S.plan.fine or nil) then
      E.search = nil
      return 'busy'
    end
    -- (no tractor that is idle could take it: one is brought to a post from which the tow has a solved way)
    if S.plan.solved and hangarFetch(S.plan.T, a) then
      E.search = nil
      return 'busy'
    end
    local own2 = M.tugOf and M.tugOf[E.k]
    if own2 and not own2.job then E.ownFailAt = E.ownFailAt or Tow.now() end
    return nextLoad(S.last or 'no tractor can get to it')
  end
  S.ti = S.ti + 1
  local t = q.t
  if t.job then return 'busy' end
  -- (first what costs nothing to ask: is the tow's own room free; only then the tractor's way to the aircraft)
  -- (A TOW IN HAND WHOSE SWEEP THIS ONE IS KNOWN TO BE CLEAR OF DOES NOT HOLD IT UP (the user, 2026-11-18, after the
  -- run: "we need to bring the overall run time down by parallelizing tow tasks"): the solver has, for every pair
  -- of solved tows, whether the one's aircraft and tractor keep 0.6 m from the other's all along both (the plan's
  -- `clear`); until then a tow in hand held a 5 m band round all it would ever sweep, and its neighbours waited)
  local clearOf = S.plan.solved and H.clear and H.clear[a.slot or 0]
  local y0 = M.yieldN
  -- (its own swept shapes: the solved tow once more, traced: kept with the plan)
  if S.plan.solved and S.plan.fine == nil then
    S.plan.fine = false
    local T = S.plan.T
    T.trace = true
    local p2 = within(S.env, towOf, a, E.k, S.st, S.oth, ready, T)
    T.trace = nil
    if type(p2) == 'table' and p2.trace then S.plan.fine = sweptShapes(p2.trace) end
  end
  local mine = S.plan.fine or nil
  -- (an idle tractor that the tow's band touches but its shapes do not is not in its way)
  local known
  if mine then
    known = {}
    for _, o in ipairs(M.tugs) do
      if o.level == 'hangar' and not o.job and not M.tugHits(mine, o) then known[o] = true end
    end
  end
  if not ready and not CATCC_DEMO_NO_HFOLLOW and not S.plan.sweep.followFrom then S.plan.sweep.followFrom = M.followFrom(S.plan.sweep) end
  local function sweepFree()
    return free('hangar', S.plan.sweep, t, known, clearOf and function(j)
      return j.a and j.w and j.w.solvedT and not j.freed and clearOf[j.a.slot or 0] == true
    end or nil, mine and function(_, b, bi, j)
      -- (the other's own tow, not known to be clear of this one: it holds; its tractor's way: by this tow's shapes)
      if bi > (j.wayN or 0) + 1 then return true end
      return sweptHits(mine, b)
    end or nil)
  end
  local okf, whyf, standing, bh = sweepFree()
  if not okf then
    -- (an idle tractor stands in the tow's way: the next of the list is asked: that tractor itself can take it: the
    -- full hangar, 2026-11-18: a tractor waiting in the starboard wall's pocket stood in the way of the aircraft
    -- beside it, and the tow was only ever offered to the tractor nearest the aircraft)
    if standing then
      S.last = S.last or whyf
      S.blocker = standing
      return 'busy'
    end
    return nextLoad(whyf)
  end
  local arr, arc, why2, backed
  if q.claimed then
    arr = { { t.d.x, t.d.z }, { t.d.x + t.d.hx * 0.3, t.d.z + t.d.hz * 0.3 } }
  elseif q.way then
    -- (the solved way: what its end is held against: the bar's line, as the tractor comes to it: facing the aircraft
    -- for its front hitch, away from it to back onto the ring)
    local fx, fz = unit(a.fx, a.fz)
    local ux, uz = M.turned(fx, fz, S.plan.alpha)
    local last = q.way.pts[#q.way.pts]
    local goal = q.front and { x = last[1], z = last[2], hx = -ux, hz = -uz } or { x = last[1], z = last[2], hx = ux, hz = uz, turnOk = ALONG.turnOk }
    local all = { { x = a.x, z = a.z, fx = fx, fz = fz, name = a.name, half = HALF, shape = Tow.Fd.shape(a.x, a.z, fx, fz, HALF) } }
    for _, o in ipairs(S.oth) do all[#all + 1] = o end
    arr, arc, backed = within(S.env, solvedWay, t, q.way, goal, all)
    if not arr then
      -- (an idle tractor by its way: that one is to move off: S.blocker)
      if type(backed) == 'table' and backed.d and not backed.job then S.blocker = S.blocker or backed end
      why2, arc, backed = arc, nil, nil
      if S.said ~= tostring(why2) .. t.name then
        S.said = tostring(why2) .. t.name
        logLine(string.format('demo: %s, at post %d, cannot take its solved way to %s just now: %s', t.name, postOf(t) or 0, tostring(a.board), gist(why2)))
      end
    end
  elseif q.front then
    arr, arc, why2 = within(S.env, hangarFront, t, a, S.oth, q.start, S.plan.alpha)
  else
    arr, arc, why2 = within(S.env, hangarApproach, t, a, S.oth, q.side, q.uA, q.start, S.plan.alpha)
  end
  if not arr then
    S.last = S.last or ('no way for ' .. t.name .. ' to it: ' .. tostring(why2))
    return 'busy'
  end
  -- (THE STEP WAS SPREAD OVER FRAMES while the tractor's way was looked for: what was asked before that is asked once
  -- more: the tractor still idle, the aircraft still to come, the platform as it was, the tow's own room free)
  if M.yieldN ~= y0 then
    if t.job or ld.taken or a.towed or (E.state == 'down') == ready then return 'busy' end
    okf, whyf, standing, bh = sweepFree()
    if not okf then
      S.last = S.last or whyf
      return 'busy'
    end
  end
  local cs = circles({}, arr, 2.0)
  local wayN = #cs
  cs[#cs + 1] = { t.d.x, t.d.z, 2.9 }
  local ok2, why3 = free('hangar', cs, t, nil, nil, wayFine)
  if not ok2 then
    S.last = S.last or why3
    return 'busy'
  end
  for _, c in ipairs(S.plan.sweep) do cs[#cs + 1] = c end
  local plan, st = S.plan, S.st
  local own = M.tugOf and M.tugOf[E.k]
  local w
  local pre = t.pre
  if pre and pre.a == a and q.claimed and not arc and not backed and (plan.alpha or 0) == pre.alpha and ((q.front and true) or false) == pre.front then
    -- (IT STANDS HOOKED ON ALREADY (M.preHook): the tow that was made at the start goes on from 'hooked')
    t.pre, a.preHooked = nil, nil
    w = pre.w
    w.paused = nil
    w.dest, w.push, w.pushText, w.soft, w.pull, w.others, w.env = plan.dest, plan.push, plan.pushText, plan.soft, plan.pull, S.oth, S.env
    w.last, w.clock, w.t0 = nil, nil, Tow.now()
    M.preUsed = (M.preUsed or 0) + 1
  else
    if pre then M.preDrop(t) end
    w = newTow(t, a, plan, arr, { level = 'hangar', env = S.env, others = S.oth })
  end
  if arc then w.phase, w.backOut = 'backout', { arc = arc, len = math.abs(arc.a1 - arc.a0) * arc.r, s = 0, v = 0 } end
  if backed then w.phase, w.backOut = 'backout', { len = backed, s = 0, v = 0 } end
  w.frontHitch = q.front or nil
  w.solvedT = plan.solved and plan.T or nil
  -- (onto a platform: off it first, then its way on: M.offAt)
  if not ready then
    w.offAt = function(ww)
      -- (ONLY FOR THE TRIP'S LAST: when the platform goes up as soon as this tractor is off it. While another aircraft of
      -- the trip is still to come onto it, the tractor stays at its aircraft's nose, clear of the platform's other
      -- place (hangarHome: the right of way): the rig, 2026-11-20: going off first, it backed 6 to 7 m into the way the
      -- trip's second aircraft was pushed in by, and that one came 2 minutes and 15 s later)
      local tr = E.trips and E.trips[E.trip]
      if tr then
        if #(tr.on or {}) < (tr.size or 0) then return nil end
        for _, l2 in ipairs(tr.on or {}) do
          if l2 ~= ld and not l2.done then return nil end
        end
      end
      local B = M.offAt(ww, t, E.k)
      if B then logLine(string.format('demo: %s goes %.1f m straight off the platform of elevator %d before its way on', t.name, B + TOW.clearBar, E.k)) end
      M.offFirst = (M.offFirst or 0) + (B and 1 or 0)
      return B
    end
  end
  w.onFree = function(ww)
    local way, _, wait
    if CATCC_DEMO_NO_SLICE then
      way, _, wait = hangarHome(ww, t)
    else
      -- (spread over frames: until it has ended the tractor stands where it is and asks again)
      local done
      done, way, _, wait = M.sliced(ww, 'homeCo', hangarHome, ww, t)
      if not done then return nil, TOW.fastSolo, true end
    end
    -- (its way back is chosen: from now it is what the job holds (M.tick), not only once the tractor is on it: one
    -- that backs first held nothing of it meanwhile)
    if not wait then ww.homeSet = true end
    return way, TOW.fastSolo, wait
  end
  ld.st, ld.taken = st, true
  -- (a tractor that waited at this aircraft's nose, this one or another: no longer)
  if ld.claim then ld.claim.claim = nil end
  ld.claim, t.claim = nil, nil
  if own == t then E.ownSince = nil end
  E.ownFailAt = nil
  local door = ready and plan.door or nil
  if ready then
    E.pre[st] = ld
    if door then
      w.pushDoor = { s = door.s, lim = door.lim, x1 = door.x1, x2 = door.x2, pts = WALL_PTS }
    else
      w.hold = true
    end
  else
    E.at[st] = a
  end
  trip.on[#trip.on + 1] = ld
  local job = { level = 'hangar', tug = t, a = a, w = w, circles = cs, E = E, load = ld, to = ready and 'ready' or 'el', env = S.env, door = door and true or nil, wayN = wayN,
    fine = S.plan.fine or nil }
  ld.job = job
  job.after = (not ready) and afterOf(bh) or nil
  if job.after then
    job.trk = M.markers(cs, wayN + 2)
    local names = {}
    for A in pairs(job.after) do names[#names + 1] = A.tug.name .. ' with ' .. tostring(A.a.board) end
    logLine(string.format('demo: %s with %s FOLLOWS %s through the hangar: it stops short of what that one has not yet passed', t.name, tostring(a.board), table.concat(names, ' and ')))
    M.followed = (M.followed or 0) + 1
  end
  t.job, a.towed, t.done = job, true, (t.done or 0) + 1
  M.jobs[#M.jobs + 1] = job
  E.search = nil
  changed(true)
  logLine(string.format('demo: %s takes %s (place %d of the hangar plan) to %s, place %d (%s)%s; %d circles held', t.name, a.name, a.slot or 0,
    ready and string.format('the door of elevator %d (the platform is up: it waits there on the bar)', E.k) or string.format('elevator %d', E.k), st, tostring(plan.note or plan.text or ''),
    (q.front and ', on its FRONT hitch (it comes at the nose head on)' or '') .. (q.claimed and ', which waited at its nose' or (q.way and string.format(', by its solved way from post %d', postOf(t) or 0) or '')), #cs))
  return true
end

-- THE ELEVATOR IS DOWN: an aircraft that waits short of its door, its tractor on the bar, is pushed straight back onto
-- its place on the platform (the same tow goes on: the hook's push from 'hooked'). True if it set off.
-- (one that was pushed all the way and stopped short of the door, or is still on its way to it: the same push goes on)
local function pushOn(E, ld)
  local job, a = ld.job, ld.a
  local w = job.w
  local stood = job.held
  w.pushDoor, w.pushStop, w.pushHeld = nil, nil, nil
  job.to, job.held, ld.held = 'el', nil, nil
  E.at[ld.st], E.pre[ld.st] = a, nil
  changed(true)
  logLine(string.format(stood and 'demo: %s pushes %s from the door onto elevator %d, place %d (the same push goes on)' or 'demo: %s with %s: elevator %d is down: it does not stop at the door (place %d)',
    job.tug.name, a.name, E.k, ld.st))
  return true
end

local function startPush(E, ld)
  if ld.job.door then return pushOn(E, ld) end
  if E.pushSig == M.sigH then return false end -- (not driven as the hangar stands: asked again when it has changed)
  local job, a = ld.job, ld.a
  local w = job.w
  local S = H.elevators[E.k].stations[ld.st]
  local L = TOW.noseGear + TOW.mainGear
  local mF = { x = S.x - S.fx * TOW.mainGear, z = S.z - S.fz * TOW.mainGear }
  local name = string.format('elevator %d, place %d', E.k, ld.st)
  local dest = { x = S.x, z = S.z, fx = S.fx, fz = S.fz, name = name, short = name }
  local oth = hangarOthers(a, E)
  local st0 = { d = w.d, lx = w.lx, lz = w.lz, mx = w.mx, mz = w.mz, fl = reachOf() - TOW.hitch, blocks = {}, others = oth, half = HALF }
  local K = { S.x, (w.mz + mF.z) / 2 }
  local rec, facts = within(job.env or ENV_HANGAR, function()
    Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = a.fx, fz = a.fz }, dest)
    return Tow.Fd.back(st0, mF, S.fx, S.fz, K, 12)
  end)
  local sweep, why = {}, nil
  if rec then
    for i = 1, #rec, 40 do
      local r = rec[i]
      bodyCircles(sweep, r[5], r[6], r[7], r[8])
      sweep[#sweep + 1] = { r[1], r[2], 2.6 }
    end
    bodyCircles(sweep, mF.x + S.fx * L, mF.z + S.fz * L, mF.x, mF.z)
    local okf, whyf = free('hangar', sweep, job.tug)
    if not okf then rec, why = nil, whyf end
  else
    why = facts
  end
  if not rec then
    E.pushSig = M.sigH
    logLine(string.format('demo: %s, short of the door of elevator %d, is not pushed on yet: %s', tostring(a.board), E.k, tostring(why)))
    return false
  end
  w.dest, w.push, w.pull, w.others, w.hold = dest, { mF = mF, hx = S.fx, hz = S.fz, K = K, rho = 12 }, nil, oth, nil
  w.pushText = string.format('tow: the elevator is down: pushed straight back onto %s.', name)
  w.phase, w.t0 = 'hooked', w.clock or Tow.now()
  job.to, job.held, job.circles = 'el', nil, sweep
  ld.held = nil
  E.at[ld.st], E.pre[ld.st] = a, nil
  changed(true)
  logLine(string.format('demo: %s pushes %s from the door onto elevator %d, place %d (%.1f m straight back)', job.tug.name, a.name, E.k, ld.st, facts.len))
  return true
end

-- ---------------------------------------------------------------- the flight deck: who takes what, where they wait
-- THE USER, 2026-11-18 (after the third run): "Some tugs still spend a lot of time idle, even while there are aircraft
-- on [the elevators] waiting to be moved. Lift the tugs' zone limitations and allow them to assist with aircraft on
-- any [elevator], but make them prefer jobs that are closer, i.e. add a distance penalty to jobs so that if a tug has
-- a choice between crossing the deck to move an aircraft off of elevator 4 immediately, or waiting for an aircraft to
-- arrive on Elevator 1 for the equivalent amount of time it would take to traverse the distance to elevator 4 + some
-- fixed cost (e.g. 30 seconds), it will choose to wait for the close job instead of crossing the deck for the far one."
-- So there are no sections. Every aircraft that will want a tow across the deck (it stands on a platform, or is on its
-- way onto one that is down) is A TASK, with the time until its platform is up (readyIn). What a tractor would take
-- to be there: the time until it is free, its drive, and DISPATCH.far seconds on top. A task costs a tractor the
-- LATER of the two (the aircraft ready, the tractor there). The cheapest pair of all is made first, then the cheapest
-- of what is left (`assign`, every half second): a tractor is for one aircraft (tug.waitFor), an aircraft has one
-- tractor (a.waiter). A pair is kept unless another is DISPATCH.keep seconds cheaper; once the tractor is on its way
-- to the elevator, or there, it is not changed.
-- "Instead of parking in front of the elevator and potentially blocking taxi routes for longer than necessary, tugs
-- that are anticipating an aircraft arriving on an elevator should wait at a staging area (either the junkyard, pocket
-- between el 2 and the island, or any empty aircraft parking space that's nearby) and time their travel to the
-- elevator such that they arrive just before the elevator reaches the flight deck level."
-- So a tractor waits at A STAGING PLACE (stagePlace): its own place in the junkyard, the pocket between the island and
-- elevator 2, or a deck spot that is empty and stays so for a while (its own aircraft still stands in the hangar, and
-- no aircraft that is on its way up goes to a spot within 11 m of it): the one from which it is soonest in front of
-- its elevator, if it can get there and still be in time. It SETS OFF FOR THE ELEVATOR (the place on its aircraft's
-- nose line: WAIT) when the time until the platform is up has come down to its drive there (driven in the head:
-- travelTime) and DISPATCH.lead seconds. If the platform is up before that, the tow begins from where it stands.
-- far: the user's fixed cost; lead: how long before the platform it is to be there; keep: what a pair in being is
-- worth; second: how much later the second aircraft of a platform can be begun than the first; unknown: taken for an
-- aircraft that is still to be found a tow below; clear: from the last aircraft aboard to the platform starting up;
-- raise: how long a platform takes to come up (until one has been seen: M.raiseT); pace, park: a tractor's pace by
-- itself (m/s, its turns counted in) and its backing in (s), for the estimates.
local DISPATCH = { far = 30, lead = 12, keep = 12, second = 0, unknown = 60, clear = 6, raise = 18, pace = 3.2, park = 14, stay = 45 }

-- is a place taken: another tractor stands on it, or is on its way to it
local function taken(pl, tug)
  for _, t in ipairs(M.tugs) do
    if t ~= tug and (t.place == pl or (t.job and t.job.goal == pl)) then return true end
  end
  return false
end

-- SHUT IN: a tractor on the deep place of the pocket by the island while another stands on the place in front of it.
-- It is given nothing to do until that one has gone: the one in front is as near to any work, and goes first. (The
-- rig at 8 times speed, 2026-11-18: the deep one was given a tow and squeezed out past the other, 0.2 m into it.)
local function shutIn(t)
  local f = t.place and t.place.front
  if not f then return false end
  for _, o in ipairs(M.tugs) do
    if o ~= t and not o.job and o.place == f then return true end
  end
  return false
end

-- THE TWO OF THE POCKET (eight tractors: both places of the pocket are tractors' own, one behind the other; a
-- tractor cannot pass one that stands on the place in front: the pocket is 6.2 m wide). WHICH OF THE TWO PLACES IS
-- WHOSE is settled each time one of them is to go there: the first to come home takes the deep place, the other the
-- place in front, and that one does not set off before the first stands on its place (tug.homeHold: it stays where
-- it is meanwhile). One that stands on the place in front with nobody behind it and nothing to wait for backs into
-- the deep place itself. The one that is shut in gives what it is for to the one in front of it: assign.
function M.pairHome(tug)
  tug.homeHold = nil
  if not tug.pocket or tug.level ~= 'deck' then return end
  local deep, front = POCKET[1], POCKET[2]
  local o
  for _, t in ipairs(M.tugs) do
    if t ~= tug and t.level == 'deck' and t.pocket then o = t end
  end
  if not o then return end
  local oToDeep = o.job and o.job.goal == deep
  local oToFront = o.job and o.job.goal == front
  if tug.place == deep then
    tug.home, o.home = deep, front
  elseif tug.place == front then
    if o.place == deep or oToDeep then
      tug.home, o.home = front, deep
    else
      tug.home, o.home = deep, front
    end
  elseif o.place == deep then
    tug.home, o.home = front, deep
  elseif oToDeep or o.place == front or oToFront then
    -- (the other is on its way in, or stands in front and has still to back into the deep place: this one waits)
    tug.home, o.home, tug.homeHold = front, deep, true
  else
    tug.home, o.home = deep, front
  end
end

-- the aircraft a tractor is for (tug.waitFor = { a, E, pose, readyIn, first }), if that still holds
local function waitOk(tug)
  local wf = tug.waitFor
  if not wf then return nil end
  local a = wf.a
  if a.id and not a.parked and a.waiter == tug and not (a.towed and a.level ~= 'hangar') then return wf end
  tug.waitFor = nil
  if a.waiter == tug then a.waiter = nil end
  return nil
end

-- is there still work for the deck's tractors: an aircraft to take off a platform, now or later
local function deckWork()
  for _, E in ipairs(M.elevators) do
    local cur = E.trips[E.trip]
    local loading = (E.state == 'down' or E.state == 'lowering') and cur and cur.stay
    if not E.staying and not loading then
      for _, a in ipairs(E.riders) do
        if not a.towed then return true end
      end
    end
    for i = E.trip, #E.trips do
      if not E.trips[i].stay then return true end
    end
  end
  return false
end

-- how long a tractor by itself takes from one point to another, roughly (for the costs; park: backed in at the end)
local function est(x1, z1, x2, z2, park)
  return hyp(x2 - x1, z2 - z1) * 1.25 / DISPATCH.pace + (park and DISPATCH.park or 0)
end

-- HOW LONG A TOW IN HAND STILL TAKES until its aircraft stands and the tractor is off the bar: counted from where it
-- is (what is left of its way at its pace; the push from the hook's own record once it is worked out, 22 m before)
local function towRemain(w)
  local d = w.d
  local deck = w.deck == 'flight'
  local function left(v)
    if not (d.path and d.s) then return 0 end
    return math.max(0, d.s[#d.path] - (d.at or 0)) / v
  end
  local pullT = w.pull and Tow.routeLen(w.pull) / (deck and 1.7 or 1.3) or 0
  local pushLen = w.pushRec and (#w.pushRec - 1) * w.pushRec.ds or (w.push and 22 or 0)
  local pushT = pushLen > 0 and (pushLen / 0.65 + 2) or 0
  local hook = TOW.liftT + 4 + TOW.pause
  local tail = 2 * TOW.pause + TOW.step + 3
  local ph = w.phase
  if ph == 'backout' then
    local b = w.backOut or { len = 0, s = 0 }
    return (b.len - b.s) / TOW.backSpeed + left(deck and DISPATCH.pace or 1.3) + hook + pullT + pushT + tail
  elseif ph == 'arrive' then
    return left(deck and DISPATCH.pace or 1.3) + hook + pullT + pushT + tail
  elseif ph == 'turn' or ph == 'lift' or ph == 'backup' or ph == 'hooked' then
    return hook / 2 + pullT + pushT + tail
  elseif ph == 'pull' then
    return left(deck and 1.7 or 1.3) + pushT + tail
  elseif ph == 'push' then
    return math.max(0, pushLen - (w.pushAt and w.pushAt.s or 0)) / 0.65 + tail
  elseif ph == 'arrived' then
    return tail
  end
  return 0
end

-- HOW LONG UNTIL AN ELEVATOR IS UP with what it is to bring: up: 0; coming up: what is left of its rise; down: the
-- aircraft of its trip still on their way onto it (towRemain; one that waits at its door: 20 s; one not yet begun:
-- DISPATCH.unknown), then DISPATCH.clear and the rise
local function upIn(E, mt)
  if E.state == 'up' then return 0 end
  local raise = M.raiseT or DISPATCH.raise
  if E.state == 'raising' then return math.max(0, raise - (mt - E.t0)) end
  local trip = E.trips[E.trip]
  if E.state ~= 'down' or not trip then return 600 end
  local load = 0
  for _, ld in ipairs(trip.on) do
    if not ld.done then
      local w = ld.job and ld.job.w
      load = math.max(load, ld.held and 20 or (w and towRemain(w) or DISPATCH.unknown))
    end
  end
  if #trip.on < trip.size then
    -- (one aboard and no second that can come: it goes up with the one 40 s after it found that out (feedBelow:
    -- E.shortAt): counted down from then, not taken as unknown. The user's fourth run, 2026-11-18: elevator 3 went up
    -- with one aircraft and its tractor, which had the platform down as 84 s off until that moment, came 26 s late)
    local more = DISPATCH.unknown
    -- (only while the hangar's search stands at "none can come", and only over its last 20 s: within the 40 the
    -- hangar often changes and a second aircraft is found after all: the rig: two tractors then stood in front of
    -- their elevators two minutes early)
    -- (and not when the second only waits for a tractor or for a way that is in use: that clears by itself)
    local why = tostring(E.why or '')
    local passing = why:find('in use', 1, true) or why:find('no tractor is idle', 1, true)
    if trip.pool and E.shortAt and E.search and E.search.done and not passing and 40 - (mt - E.shortAt) <= 20 then more = math.max(0, 40 - (mt - E.shortAt)) end
    load = math.max(load, more)
  end
  return load + DISPATCH.clear + raise
end

-- THE TASKS: for every elevator whose aircraft go on to deck spots: those that stand on it, and (if it is down) those
-- on their way onto it; in the order they are taken off (the one whose deck spot is furthest first); not one that
-- waits for another to stand on its spot first (LOADS' `after`). Each: { a, E, pose (where a tractor waits for it in
-- front of the elevator, if there is such a place and none was sent off from it), readyIn, first (it is the next to
-- be taken off: only its tractor comes to the front of the elevator: two side by side stand in the way of each
-- other's tows) }
local function deckTasks(mt)
  local out = {}
  for _, E in ipairs(M.elevators) do
    local cur = E.trips[E.trip]
    local stays
    if E.state == 'up' or E.state == 'raising' then stays = E.staying else stays = cur and cur.stay end
    if not stays then
      local order, stOf = {}, {}
      local function add(a, st)
        -- (one that waits for another to be out of its way (M.waitsFor) is a task too (2026-11-19): its tractor is
        -- then at its nose when it may go: until now one was only asked for at that moment, and came from the
        -- junkyard: elevator 4's second aircraft left two minutes after its first. CATCC_DEMO_NO_PREWAIT: as it was.)
        if a.id and not a.parked and not (a.towed and a.level ~= 'hangar') and (not M.waitsFor(a) or not CATCC_DEMO_NO_PREWAIT) then
          order[#order + 1], stOf[a] = a, st
        end
      end
      for _, a in ipairs(E.riders) do add(a, a.st) end
      if E.state == 'down' and cur then
        for _, ld in ipairs(cur.on) do
          if not ld.done and ld.job and ld.st then add(ld.a, ld.st) end
        end
      end
      local e = H.elevators[E.k]
      local mid = (e.x[1] + e.x[2]) / 2
      table.sort(order, function(p, q)
        local dp, dq = math.abs(p.spot.x - mid), math.abs(q.spot.x - mid)
        if dp ~= dq then return dp > dq end
        return p.n < q.n
      end)
      local base = upIn(E, mt)
      -- (one of its aircraft is being hooked up in front of it: the next cannot be begun until that one has left)
      if E.busy and CATCC_DEMO_ONE_WAITS then base = math.max(base, 20) end
      for i, a in ipairs(order) do
        local ri = base + (i - 1) * DISPATCH.second
        -- (one whose tow is put off for a while: startDeckJob)
        if a.holdOff and a.holdOff > mt then ri = math.max(ri, a.holdOff - mt) end
        out[#out + 1] = { a = a, E = E, pose = (not a.noWait) and E.wait[stOf[a]] or nil, readyIn = ri, poseIn = base, first = (i == 1) and not (E.busy and CATCC_DEMO_ONE_WAITS) }
      end
    end
  end
  return out
end

-- WHO TAKES WHAT (see above): every half second
local function assign(mt)
  if mt < (M.assignAt or 0) then return end
  M.assignAt = mt + 0.5
  local tasks = deckTasks(mt)
  local tugs = {}
  for i, t in ipairs(M.tugs) do
    if t.level == 'deck' then
      -- (when it is free, and where it will be then)
      local av, x, z = 0, t.d.x, t.d.z
      local j = t.job
      if j and j.move then
        if j.goal then av, x, z = est(t.d.x, t.d.z, j.goal.x, j.goal.z, j.park), j.goal.x, j.goal.z end
      elseif j and not j.delivered then
        av = towRemain(j.w) + 8
        if j.w.dest then x, z = j.w.dest.x, j.w.dest.z end
      end
      -- (shut in behind another in the pocket: it cannot leave before that one)
      if shutIn(t) then av = av + 45 end
      tugs[#tugs + 1] = { t = t, av = av, x = x, z = z, i = i }
    end
  end
  local list = {}
  for ki, k in ipairs(tasks) do
    local px, pz = (k.pose or k.a).x, (k.pose or k.a).z
    for _, g in ipairs(tugs) do
      local t = g.t
      local there = g.av + est(g.x, g.z, px, pz, true)
      local cost = math.max(k.readyIn, there + DISPATCH.far)
      local wf = t.waitFor
      if wf and wf.a == k.a then
        cost = cost - DISPATCH.keep
        if wf.pose and (t.place == wf.pose or (t.job and t.job.goal == wf.pose)) then cost = cost - 1000 end
        -- (and one whose aircraft is up, or will be within half a minute: it stays that aircraft's (the user, 2026-11-19:
        -- "The other El 2 tug drives off to the junkyard and never comes back, leaving the aircraft for another tug
        -- to tow a full 4 minutes later"), unless it could not begin its tow (badTug: below))
        if k.readyIn <= 30 and not (k.a.badTug and (k.a.badTug[t] or 0) > mt) and not CATCC_DEMO_NO_STICKY then cost = cost - 1000 end
      end
      -- (a tractor that could not begin this aircraft's tow for over a minute: another's turn)
      if k.a.badTug and (k.a.badTug[t] or 0) > mt then cost = cost + 300 end
      -- (on a tie (the aircraft is ready later than any of them can be there): the one that is there soonest)
      list[#list + 1] = { k = k, g = g, cost = cost + there * 0.001, there = there, key = ki * 10 + g.i }
    end
  end
  table.sort(list, function(p, q)
    if p.cost ~= q.cost then return p.cost < q.cost end
    return p.key < q.key
  end)
  local got, has = {}, {}
  for _, q in ipairs(list) do
    if not got[q.k] and not has[q.g] then got[q.k], has[q.g] = q, q end
  end
  -- (THE TWO OF THE POCKET: the one that is shut in behind the other cannot leave before that one: what it is for goes
  -- to the one in front, if that one is for nothing or for something that is ready later. The rig, 2026-11-19, with
  -- eight tractors: the last aircraft of a run was the shut-in tractor's, the one in front had nothing to do and
  -- stood, and the run never ended.)
  for _, g in ipairs(tugs) do
    local q = has[g]
    if q and shutIn(g.t) then
      local gf
      for _, o in ipairs(tugs) do
        if o.t ~= g.t and not o.t.job and o.t.place == g.t.place.front then gf = o end
      end
      local qf = gf and has[gf]
      if gf and (not qf or qf.k.readyIn > q.k.readyIn) then
        has[gf] = { k = q.k, g = gf, there = q.there }
        got[q.k] = has[gf]
        if qf then
          has[g] = { k = qf.k, g = g, there = qf.there }
          got[qf.k] = has[g]
        else
          has[g] = nil
        end
      end
    end
  end
  for _, g in ipairs(tugs) do
    local t, q = g.t, has[g]
    local wf = t.waitFor
    if wf and (not q or q.k.a ~= wf.a) then
      if wf.a.waiter == t then wf.a.waiter = nil end
      t.waitFor, t.eta, wf = nil, nil, nil
    end
    if q then
      local k = q.k
      if not wf then
        wf = { a = k.a }
        t.waitFor, t.moveTry, t.eta = wf, nil, nil
        M.relWant = true
        logLine(string.format('demo: %s is for %s (elevator %d): the aircraft is ready in %.0f s, the tractor could be there in %.0f s', t.name, tostring(k.a.board), k.E.k, k.readyIn, q.there))
      end
      k.a.waiter = t
      wf.E, wf.pose, wf.readyIn, wf.first, wf.poseIn = k.E, k.pose, k.readyIn, k.first, k.poseIn
    end
  end
end

-- an aircraft that is on its way up: in tow, on a platform, or up and not yet on its spot
local function soon(a)
  return a.towed or a.level == 'el' or (a.level == 'deck' and not a.parked)
end

-- may this tractor wait on this place now (see above)
local function stageOpen(pl, tug, mt)
  if tug.avoid and (tug.avoid[pl] or 0) > mt then return false end
  if pl == tug.home then return not tug.homeHold end
  if tug.place ~= pl and (taken(pl, tug) or (pl.front and taken(pl.front, tug))) then return false end
  if pl.a then
    local a = pl.a
    if not (a.id and a.level == 'hangar' and not a.towed) then return false end
    for _, o in ipairs(M.aircraft) do
      if o ~= a and o.id and o.spot and soon(o) and hyp(o.spot.x - pl.x, o.spot.z - pl.z) < 11 then return false end
    end
  end
  return true
end

-- THE STAGING PLACE FOR A TRACTOR: wf: the aircraft it is for (the place from which it is soonest in front of that
-- elevator, half its drive to the place counted in; not one it could not reach and leave again in time); none: the
-- nearest. The place it stands on counts for 12 s more than another (it does not move for a little gain); the deep
-- place of the pocket for 15 s less (it is shut in there behind the other).
local function stagePlace(tug, wf, mt)
  local P = wf and (wf.pose or wf.a)
  local best, bs
  local list = { tug.home }
  for _, pl in ipairs(M.pocket or {}) do list[#list + 1] = pl end
  for _, pl in ipairs(M.spotPlaces or {}) do list[#list + 1] = pl end
  for _, pl in ipairs(list) do
    if stageOpen(pl, tug, mt) then
      local go = (tug.place == pl) and 0 or est(tug.d.x, tug.d.z, pl.x, pl.z, true)
      local score = go
      if P then
        local back = est(pl.x, pl.z, P.x, P.z, true)
        score = back + 0.5 * go
        if tug.place ~= pl and go + back + 15 > (wf.readyIn or 0) then score = nil end
      end
      if score and tug.place == pl then score = score - 12 end
      if score and pl.front then score = score + 15 end
      if score and (not bs or score < bs) then best, bs = pl, score end
    end
  end
  return best
end

local travelTime -- (how long a tractor takes from where it stands to a place, driven in the head: below)

-- WHERE A DECK TRACTOR THAT HAS NOTHING IN HAND BELONGS (nil: where it is):
--   it is for an aircraft whose platform is up: where it is (the tow begins from there: startDeckJob);
--   it is for the next aircraft to come off a platform, and it is time to go (see above), or it stands there already
--   and the platform is no more than DISPATCH.stay seconds off: in front of the elevator;
--   else a staging place; when there is nothing more to tow: its own place in the junkyard.
-- (clearOff: it stood in a tow's way: not where it is, and not to the front of the elevator)
local function nextPlace(tug, mt)
  M.pairHome(tug)
  local wf = waitOk(tug)
  if wf then
    local a, E = wf.a, wf.E
    -- (whether or not its aircraft is the next to be taken off (the user, 2026-11-18, after the run: "it seems like a
    -- tug has to go back to its staging area before proceeding to the next aircraft"): until then one that had no
    -- place (its last tow had just ended) and was for the SECOND aircraft of a platform drove off to a staging place)
    if E.state == 'up' and a.level == 'deck' and not tug.clearOff and not (a.holdOff and a.holdOff > mt) then
      -- (IT FOUND NO WAY TO THE NOSE FROM WHERE IT STANDS (startDeckJob, within the last 10 s): to the place in front of
      -- the elevator first, by the deck's own way-finder, as it would have gone had the platform still been on its
      -- way up: until 2026-11-19 it stood where it was and asked again for 75 s, and then another tractor was asked)
      if tug.noNoseAt and mt - tug.noNoseAt < 10 and wf.pose and tug.place ~= wf.pose and not CATCC_DEMO_NO_FARPOSE then return wf.pose end
      return nil
    end
    -- (A TRACTOR FOR EACH AIRCRAFT OF A PLATFORM WAITS IN FRONT OF IT, each on its own aircraft's nose line, there when
    -- the platform is up (wf.poseIn), not only the one for the aircraft that is taken off first: the user, 2026-11-18,
    -- with a picture of the deck as elevators 1 and 3 came up: "one tug has gone to each elevator, but two tugs are
    -- just sitting doing nothing when they could be waiting at El 1 and El 3 as well". CATCC_DEMO_ONE_WAITS: as it was.)
    local due = (CATCC_DEMO_ONE_WAITS and wf.readyIn) or wf.poseIn or wf.readyIn
    if wf.pose and (wf.first or not CATCC_DEMO_ONE_WAITS) and not tug.clearOff then
      if tug.place == wf.pose then
        if due <= DISPATCH.stay then return wf.pose end
      elseif due <= travelTime(tug, wf.pose) + DISPATCH.lead then
        return wf.pose
      end
    end
    local pl = stagePlace(tug, wf, mt)
    if pl then return pl end
    -- (no staging place it could reach and leave in time: to the elevator now, if it may; else the nearest place)
    if wf.pose and (wf.first or not CATCC_DEMO_ONE_WAITS) and not tug.clearOff then return wf.pose end
  elseif not deckWork() then
    if tug.homeHold then return nil end
    return tug.home
  end
  local sp = stagePlace(tug, nil, mt)
  if sp then return sp end
  if tug.homeHold then return nil end
  return tug.home
end

-- what a place is, in words
local function placeText(pl, tug)
  if pl.aside then return string.format('open deck out of the way (%.0f / %.0f)', pl.x, pl.z) end
  if pl == tug.home then return pl.pocket and 'its place in the pocket by the island' or 'its place in the junkyard' end
  if pl.wait then return string.format('the front of elevator %d, place %d', pl.k or 0, pl.st or 0) end
  if pl.a then return string.format('the empty spot %s, to wait there', tostring(pl.a.spot.name)) end
  return 'the pocket between the island and elevator 2, to wait there'
end

-- an idle tractor stands in a tow's way (or on another tractor's): it clears off: the place it stands on is not one
-- it waits on for the next two minutes; one that stood in front of an elevator: nobody comes to wait there for that
-- aircraft again. (In its own place in the junkyard: said once, nothing done: there is nowhere else for it.)
local function shoo(t, why)
  if t.clearOff then
    -- (STILL THERE: the place it stands on stays one it does not wait on: the two minutes begin anew (2026-11-19: the
    -- rig, the player's jet on elevator 1: a tractor told to clear off the empty spot it waited on found its way to
    -- the junkyard in use for two minutes; then that spot was "the place it belongs" again, it stayed, and the
    -- aircraft whose tow it stood in the way of was left on elevator 4 for good: the run did not end))
    if t.place and not (t.place == t.home and not t.pocket) then
      t.avoid = t.avoid or {}
      t.avoid[t.place] = Tow.now() + 120
    end
    return
  end
  -- (not one whose own place is in the pocket by the island: that place is in the way of tows off elevator 2: it
  -- clears off as it would from a place it only waits on)
  if t.place and t.place == t.home and not t.pocket then
    if not t.shooSaid then
      t.shooSaid = true
      logLine(string.format('demo: %s, in its own place in the junkyard, stands in the way of %s', t.name, tostring(why)))
    end
    return
  end
  t.clearOff = true
  t.avoid = t.avoid or {}
  if t.place then t.avoid[t.place] = Tow.now() + 120 end
  -- (where it stands: not stepped aside to again for 3 minutes: M.asideOk)
  t.asideBad = t.asideBad or {}
  t.asideBad[#t.asideBad + 1] = { t.d.x, t.d.z, Tow.now() + 180 }
  local wf = t.waitFor
  if wf and t.place and t.place == wf.pose then wf.a.noWait = true end
  logLine(string.format('demo: %s, standing %s, is in the way of %s: it clears off', t.name, t.place and ('at ' .. placeText(t.place, t)) or 'where its tow ended', tostring(why)))
end

-- A DECK TRACTOR'S WAY BY ITSELF from where it stands (d0) to a place: the way-finder's, its corners rounded, driven
-- in the head (first clear of every aircraft's wheels, then regardless: the way-finder keeps off them anyway).
-- To a place it backs into (dest.park: the junkyard, the pocket by the island, in front of an elevator) the way ends
-- on the line square to the place's own, `back` + PARK.r in front of it, PARK.r past the place, after PARK.run
-- straight along that line; the third result is how it then backs in: { arc = the quarter circle backwards onto the
-- place's own line, back = metres straight back from there }.
local function soloWay(d0, dest)
  -- (2026-11-19: tried in turn: as it was; with 8 m more of the line it comes along before the place; then both from
  -- the other side: the way-finder's way came to that line from any side, and where the tractor could not come out
  -- of its last turn in line there was "no way" to the place: three to eight times a run a tractor stood for half a
  -- minute and more before it could set off for an elevator. CATCC_DEMO_NO_SOLOTRY: the first only.)
  local why
  local sgn0
  -- (THE POCKET: FROM THE PLACE IN FRONT INTO THE DEEP PLACE BEHIND IT: half a metre forward, then straight back (no
  -- quarter circle: park.noArc): the way round by the line the place is backed into from begins too near to it
  -- ("the tractor would not come out of its turn in line"): the rig, 2026-11-19, eight tractors: the one in front
  -- could not make room, the other could not come home, and the run never ended)
  if dest.park and dest.front and hyp(d0.x - dest.front.x, d0.z - dest.front.z) < 0.6 and d0.hx * dest.hx + d0.hz * dest.hz > 0.99 then
    local nx, nz = dest.hx, dest.hz
    local P = { d0.x + nx * 0.5, d0.z + nz * 0.5 }
    local a0 = atan2(nz, nx)
    return { { d0.x, d0.z }, P }, nil,
      { arc = { cx = P[1] - nx * PARK.r, cz = P[2] - nz * PARK.r, r = PARK.r, a0 = a0, a1 = a0 }, back = hyp(P[1] - dest.x, P[2] - dest.z), x = dest.x, z = dest.z, nx = nx, nz = nz, noArc = true }
  end
  if dest.park then
    local tx, tz = -dest.hz, dest.hx
    sgn0 = ((d0.x - dest.x) * tx + (d0.z - dest.z) * tz) >= 0 and 1 or -1
  end
  local tries = dest.park and (CATCC_DEMO_NO_SOLOTRY and { { sgn0, 0 } } or { { sgn0, 0 }, { sgn0, 8 }, { -sgn0, 0 }, { -sgn0, 8 } }) or { { 1, 0 } }
  for _, tr in ipairs(tries) do
    M.pauseIn()
    local target, tails, goal, park = { dest.x, dest.z }, {}, nil, nil
    if dest.park then
      -- (n: the way its nose points in the place; the line it comes along is square to that, back + r in front of the
      -- place; it comes along it from the side it is on and stops r past the place's own line)
      local nx, nz = dest.hx, dest.hz
      local back = dest.back or PARK.back
      local tx, tz = -nz, nx
      local sgn = tr[1]
      local ux, uz = -sgn * tx, -sgn * tz
      local P = { dest.x + nx * (back + PARK.r) + ux * PARK.r, dest.z + nz * (back + PARK.r) + uz * PARK.r }
      target = { P[1] - ux * (PARK.run + tr[2]), P[2] - uz * (PARK.run + tr[2]) }
      if tr[2] > 0 then tails[#tails + 1] = { P[1] - ux * PARK.run, P[2] - uz * PARK.run } end
      tails[#tails + 1] = P
      goal = { x = P[1], z = P[2], hx = ux, hz = uz }
      local a0, a1 = atan2(nz, nx), atan2(-uz, -ux)
      while a1 - a0 > math.pi do a1 = a1 - 2 * math.pi end
      while a1 - a0 < -math.pi do a1 = a1 + 2 * math.pi end
      park = { arc = { cx = P[1] - nx * PARK.r, cz = P[2] - nz * PARK.r, r = PARK.r, a0 = a0, a1 = a1 }, back = back, x = dest.x, z = dest.z, nx = nx, nz = nz }
    end
    local way = findWay(nil, { d0.x, d0.z }, target, nil, d0)
    if not way then
      why = why or 'no way found'
    else
      for _, q in ipairs(tails) do way[#way + 1] = q end
      local blocks = Tow.Fd.blockList()
      for _, oth in ipairs({ others('deck', nil), false }) do
        for _, r in ipairs({ 5, 3, 2 }) do
          local path = Tow.Net.smooth(way, r)
          local good, bad = Tow.Fd.simSolo(d0, path, blocks, goal, oth or nil)
          if good then return path, nil, park end
          why = why or bad
        end
      end
    end
  end
  return nil, why
end

-- THE TRACK A TRACTOR WILL DRIVE along a way from where it stands (d0), a point every 2 m: what it holds is laid along
-- this, not along the way's own line. (The rig, 2026-11-18: a tractor that stood facing forward was sent aft: it swung
-- round 3 m to the side of its way's first leg, through the lane another tractor held, and the two passed 0.7 m
-- apart. A way begins where the tractor stands, whichever way it faces; the hook then drives it round onto it.)
-- Each point with the time it is reached (its third number: seconds from setting off), driven as the hook drives it
-- (fast: its pace on a straight; turnR: its tightest turn, with an aircraft on the bar); the second result: how long
-- the whole way takes.
local function driven(d0, path, fast, turnR)
  local d = { x = d0.x, z = d0.z, hx = d0.hx, hz = d0.hz, v = 0, turnR = turnR }
  Tow.path({ d = d }, path, TOW.speed, fast)
  local out = { { d.x, d.z, 0 } }
  local t = 0
  for _ = 1, 40 * (d.s[#path] + 20) do
    local done = Tow.drive(d, 0.1)
    t = t + 0.1
    local q = out[#out]
    if done or hyp(d.x - q[1], d.z - q[2]) >= 2.0 then out[#out + 1] = { d.x, d.z, t } end
    if done then break end
  end
  return out, t
end

-- what a tractor holds while it backs into its place in the junkyard
local function parkCircles(out, park)
  local a = park.arc
  for i = 0, 3 do
    local t = a.a0 + (a.a1 - a.a0) * i / 3
    out[#out + 1] = { a.cx + a.r * math.cos(t), a.cz + a.r * math.sin(t), 2.9 }
  end
  -- (its own place and the line into it: no wider than a tractor by itself holds: its neighbours stand 4.4 m off)
  out[#out + 1] = { park.x + park.nx * park.back / 2, park.z + park.nz * park.back / 2, SOLO }
  out[#out + 1] = { park.x, park.z, SOLO }
  -- (and its tail: it reaches 3.3 m behind its own point. The rig, 2026-11-18: another tractor's way went between a
  -- tractor backing in to wait in front of elevator 2 and the platform, past its tail with nothing to spare)
  out[#out + 1] = { park.x - park.nx * 2.2, park.z - park.nz * 2.2, SOLO }
  return out
end

-- how long the backing in takes (the quarter circle, then straight back, at the hook's backing pace)
local function parkTime(park)
  return math.abs(park.arc.a1 - park.arc.a0) * park.arc.r / TOW.backSpeed + park.back / TOW.backSpeed + 5
end

-- WHAT A TRACTOR BY ITSELF HOLDS on a way from where it stands: `seq`: the track it will drive, each circle for the
-- time it passes (from SOLO_T.pre seconds before the tractor's own point is at it until SOLO_T.post after: the
-- tractor reaches 2.1 m ahead of its point and 3.3 m behind it; at the pace of a turn); the end of its way from when
-- it gets there; `keep`: the place it backs into, from 6 s before it gets to the line it backs in from. The third
-- result: how long it takes to get there (the backing in included).
local SOLO_T = { pre = 2, post = 3 }
local function soloHold(d0, way, park)
  local trk, T = driven(d0, way, TOW.fastSolo)
  local seq = circles({}, trk, SOLO, nil, SOLO_T.pre, SOLO_T.post)
  -- (c[7]: where it comes to rest: no other job is planned through that for a later time: `free`)
  -- (A TRACTOR THAT BACKS INTO ITS PLACE does not rest where its way ends, nor on the quarter circle and the line it
  -- backs along: those are held from 6 s before it is there UNTIL IT IS IN (its backing timed, and GAP.run more); only
  -- its place and its tail for good (until 2026-11-20 all of it was "where it comes to rest", for good: nothing could be
  -- planned through it for later, nor follow it: the user's run of 07:54: the second tractor for elevator 1 waited 45 s
  -- to set off because its way passed the first one's quarter circle 8 m in front of that one's place, "when in reality
  -- the second tug could drive a short distance in trail"). CATCC_DEMO_NO_PARKPASS: as it was.)
  local inT = park and (T + parkTime(park) + GAP.run) or nil
  for i = math.max(1, #seq - 1), #seq do
    if inT and not CATCC_DEMO_NO_PARKPASS then seq[i][5] = inT else seq[i][5], seq[i][7] = nil, true end
  end
  local keep = park and heldFrom(parkCircles({}, park), T - 6) or {}
  for i, c in ipairs(keep) do
    if CATCC_DEMO_NO_PARKPASS or i > #keep - 2 then c[7] = true else c[5] = inT end
  end
  return seq, keep, T + (park and parkTime(park) or 0)
end

-- how long a tractor takes from where it stands to a place (the others' jobs not minded): its way found and driven
-- in the head; kept while the tractor stands where it stood
travelTime = function(tug, dest)
  local c = tug.eta
  if c and c.dest == dest and hyp(c.x - tug.d.x, c.z - tug.d.z) < 1 then return c.T end
  M.finderTug, M.finderFree = tug, true
  local way, _, park = within(ENV_DECK, soloWay, tug.d, dest)
  M.finderTug, M.finderFree = nil, nil
  local T = est(tug.d.x, tug.d.z, dest.x, dest.z, dest.park)
  if way then
    local _, _, t = soloHold(tug.d, way, park)
    T = t
  end
  tug.eta = { dest = dest, x = tug.d.x, z = tug.d.z, T = T }
  return T
end

-- (what a tractor by itself asks for: marked so: `free`: standsFor)
local function soloCs(seq, keep)
  local all = { solo = true }
  for _, q in ipairs(seq) do all[#all + 1] = q end
  for _, q in ipairs(keep or {}) do all[#all + 1] = q end
  return all
end

local function both(seq, keep)
  local all = {}
  for _, q in ipairs(seq) do all[#all + 1] = q end
  for _, q in ipairs(keep or {}) do all[#all + 1] = q end
  return all
end

-- THE WAY A TRACTOR TAKES BY ITSELF, with the others in mind: first the way it would take if no other tractor had
-- anything in hand (its lane along the roads); if nothing another tractor holds touches that, it is taken. Else the
-- way round what they hold: taken if it is no more than a tenth longer; if it is longer the tractor waits for its
-- lane (they give it up as they pass: `letGo`), a minute at most (since: when it began to wait), then goes round.
-- (The first whole run with lanes: two tractors left the junkyard for the bow in the same instant, and the second,
-- its lane held by the first, went round through the landing area. Now it follows when the first has arrived. Two
-- tractors do not follow each other down one lane at the same time: a lane is held whole, ahead of the tractor.)
-- (round: it does not wait for its lane: the way round what the others hold is taken however much longer it is: a
-- tractor that stands in a tow's way: M.escape)
local function soloPlan(tug, d0, dest, since, mt, round)
  M.finderTug, M.finderFree = tug, true
  local way0, why0, park0 = within(ENV_DECK, soloWay, d0, dest)
  M.finderFree = nil
  if not way0 then
    M.finderTug = nil
    return nil, 'no way there (' .. tostring(why0) .. ')'
  end
  -- (what it would hold on it, and when: taken if no other tractor needs any of it at the same time)
  local seq0, keep0 = soloHold(d0, way0, park0)
  local ok0, _, _, behind0 = free('deck', soloCs(seq0, keep0), tug)
  if ok0 then
    M.finderTug = nil
    return way0, nil, park0, seq0, keep0, behind0
  end
  local way1, _, park1 = within(ENV_DECK, soloWay, d0, dest)
  M.finderTug = nil
  local forced = since and mt - since > 60
  local seq1, keep1, behind1
  if way1 then seq1, keep1 = soloHold(d0, way1, park1) end
  if way1 and not forced then
    -- (the way round is the way-finder's as far as the line it backs in from: its last stretch along that line and
    -- the backing in are not; all of it is held against what the others hold. The rig at 8 times speed, 2026-11-18:
    -- two tractors came to the junkyard from either end along the same line and met on it)
    local ok1, why1, _, bh = free('deck', soloCs(seq1, keep1), tug)
    if not ok1 then return nil, why1 end
    behind1 = bh
  end
  if way1 and (Tow.routeLen(way1) <= 1.1 * Tow.routeLen(way0) or forced or round) then return way1, nil, park1, seq1, keep1, behind1 end
  return nil, way1 and 'its lane is in use: it waits for it rather than go far round' or 'its way is in use'
end

-- BACKING IN: the tractor has come to the end of its way on the line (the hook has it 'parked'): it backs the quarter
-- circle (the hook's 'backout' with an arc; w.solo: then 'leave' again), then straight back (the same, straight), and
-- stands. Stepped from M.tick; true when the tractor is in its place.
local function parkStep(job)
  local w, pk = job.w, job.park
  if not pk then return w.phase == 'parked' end
  if pk.step == nil and w.phase == 'parked' and pk.noArc then
    -- (straight back only: from the pocket's place in front into the deep one: soloWay)
    pk.step = 2
    w.solo = true
    w.d.v = 0
    Tow.path(w, { { pk.x, pk.z }, { pk.x + pk.nx * 0.1, pk.z + pk.nz * 0.1 } }, TOW.speed)
    w.phase, w.t0 = 'backout', w.clock or Tow.now()
    w.backOut = { len = pk.back, s = 0, v = 0 }
  elseif pk.step == nil and w.phase == 'parked' then
    pk.step = 1
    w.solo = true
    w.d.v = 0
    Tow.path(w, { { pk.x, pk.z }, { pk.x + pk.nx * 0.1, pk.z + pk.nz * 0.1 } }, TOW.speed)
    w.phase, w.t0 = 'backout', w.clock or Tow.now()
    w.backOut = { arc = pk.arc, len = math.abs(pk.arc.a1 - pk.arc.a0) * pk.arc.r, s = 0, v = 0 }
  elseif pk.step == 1 and (w.phase == 'leave' or w.phase == 'parked') then
    pk.step = 2
    w.phase, w.t0 = 'backout', w.clock or Tow.now()
    w.backOut = { len = pk.back, s = 0, v = 0 }
  elseif pk.step == 2 and (w.phase == 'leave' or w.phase == 'parked') then
    -- (the hook has it 'leave' on a way of no length, then 'parked')
    pk.step = 3
  end
  return pk.step == 3 and w.phase == 'parked'
end

-- A TRACTOR BY ITSELF TO A PLACE (where it waits, or the junkyard): the hook drives it as it drives a tractor that has
-- unhooked ('leave': w.solo). True if it set off.
-- (force: THROUGH WHAT THE OTHER JOBS HOLD: the way-finder's way past every aircraft and tractor where they are now,
-- nothing asked of what is held: for a tractor that is boxed in (idleTugs). The other jobs give way to it (giveWay:
-- job.force).)
local function startMove(tug, dest, force)
  local d = tug.d
  local w = { phase = 'leave', t0 = Tow.now(), bar = 'none', theta = M.thetaIn, clamped = true, thetaIn = M.thetaIn, ringUp = TOW.bar.ringRest, lugUp = Tow.axleUp(), floor = DECK_Y,
    deck = 'flight', ids = { tug = tug.id, tugOwn = true }, quiet = true, solo = true, name = tug.name, env = ENV_DECK, driver = tug.driver, home = dest, ship = M.ship,
    others = others('deck', nil) }
  w.d = d
  M.tried = {}
  local mt = Tow.now()
  tug.wantAt = (tug.wantFor == dest) and tug.wantAt or mt
  tug.wantFor = dest
  -- (ONE AT A TIME THROUGH WHAT THE OTHERS HOLD (2026-11-19: the rig: two tractors, both boxed in in front of the
  -- junkyard, were both sent through what the others hold; neither gave way, and they passed 1.6 m apart))
  if force then
    for _, j in ipairs(M.jobs) do
      if j.level == 'deck' and j.tug ~= tug and j.force then return false, j.tug.name .. ' is driving out through what the others hold: one at a time' end
    end
  end
  -- (NOT TO A PLACE ANOTHER TRACTOR STANDS IDLE ON OR WITHIN 5 M OF (it stopped there: called back, or where its tow
  -- ended): the rig, 2026-11-18: one drove to its place in front of elevator 2 and stood 2 m from another. In front of
  -- an elevator the one that stands there is sent off.)
  for _, o in ipairs(M.tugs) do
    if o ~= tug and o.level == 'deck' and not o.job and not o.place and hyp(o.d.x - dest.x, o.d.z - dest.z) < 5 then
      if dest.wait then shoo(o, tug.name .. '\'s place in front of elevator ' .. tostring(dest.k)) end
      return false, o.name .. ' stands there'
    end
  end
  local way, why, park, seq, keep, behind
  if force then
    M.finderTug, M.finderFree, M.finderForce = tug, true, true
    way, why, park = within(ENV_DECK, soloWay, d, dest)
    M.finderTug, M.finderFree, M.finderForce = nil, nil, nil
    if way then
      seq, keep = soloHold(d, way, park)
      behind = {}
      -- (but not through a tractor that stands idle in its own place: it cannot clear off, and nobody gives way)
      local cs = soloCs(seq, keep)
      for _, o in ipairs(M.tugs) do
        if o ~= tug and o.level == 'deck' and not o.job and o.place and o.place == o.home and not o.pocket and hyp(o.d.x - d.x, o.d.z - d.z) > 6 and touch(cs, tugDiscs(o)) then
          return false, o.name .. ' stands in its own place in the way'
        end
      end
    end
  else
    way, why, park, seq, keep, behind = soloPlan(tug, d, dest, tug.wantAt, mt, (tug.roundTill and mt < tug.roundTill) or nil)
    -- (spread over frames: it may have been given a tow meanwhile)
    if tug.job then return false, 'it has been given something else to do meanwhile' end
    -- (and its clock begins when it sets off, not when the planning began: frames may lie between: the rig: a job
    -- whose times were those of some frames before let another tractor pass 1.6 m from it)
    mt = Tow.now()
    w.t0 = mt
  end
  if not way then return false, why end
  if behind == nil then
    -- (a way taken after a minute's wait, through what the others hold if it must: asked once more)
    local okf, whyf, _, bh = free('deck', soloCs(seq, keep), tug)
    if not okf then return false, whyf end
    behind = bh
  end
  d.v, d.turnR, d.hold = 0, nil, nil
  w.soloCap = M.capFor('deck')
  d.cap = w.soloCap
  Tow.path(w, way, TOW.speed, TOW.fastSolo)
  local job = { level = 'deck', tug = tug, w = w, move = true, goal = dest, seq = seq, keep = keep, park = park, t0 = mt, lag = 0, after = afterOf(behind), force = force or nil }
  gather(job)
  -- (CATCC_DEMO_LANE_STATS: the rig's: every 1 m of the way, which strip of a taxi road it is in, the way it goes)
  if CATCC_DEMO_LANE_STATS then M.laneCount(way) end
  tug.job, tug.place, tug.clearOff, tug.wantFor = job, nil, nil, nil
  M.jobs[#M.jobs + 1] = job
  logLine(string.format('demo: %s drives to %s (%.0f m%s)%s; %d circles held%s', tug.name, placeText(dest, tug) .. (force and ', THROUGH WHAT THE OTHERS HOLD (it was boxed in: they give way to it)' or ''), Tow.routeLen(way), park and ', then backed into it' or '',
    (dest.wait and tug.waitFor) and string.format(': %s is up in %.0f s', tostring(tug.waitFor.a.board), tug.waitFor.readyIn or 0) or '', #job.circles, M.behindText(job)))
  -- (CATCC_DEMO_WAYS: a test's wish: the way itself in the log)
  if CATCC_DEMO_WAYS then
    local pts = {}
    for i, q in ipairs(way) do
      if i % 4 == 1 or i == #way then pts[#pts + 1] = string.format('%.1f/%.1f', q[1], q[2]) end
    end
    logLine('  way: ' .. table.concat(pts, ' '))
    -- (and how near it comes to what each other tractor holds)
    for _, j in ipairs(M.jobs) do
      if j ~= job and j.level == 'deck' then
        local best, at
        for _, p in ipairs(job.circles) do
          for _, q in ipairs(j.circles) do
            local g = hyp(p[1] - q[1], p[2] - q[2]) - p[3] - q[3]
            if not best or g < best then best, at = g, q end
          end
        end
        logLine(string.format('  %s holds %d circles (seq %d, keep %d), the nearest %.1f m off (at %.1f / %.1f, r %.1f); it is at %.1f / %.1f', j.tug.name, #j.circles, #(j.seq or {}), #(j.keep or {}),
          best or -1, at and at[1] or 0, at and at[2] or 0, at and at[3] or 0, j.w.d.x, j.w.d.z))
      end
    end
  end
  return true
end

-- a job on the flight deck: aircraft a (on the platform, up) to its deck spot. True if it started.
-- clearOnly: not started if the tow would touch another aircraft (then: false, why, true)
-- STRAIGHT IN ALONG THE SPOT'S OWN LINE (the user, 2026-11-18, after the run: "I'm not sure what the issue with Port 3
-- is. If it blocks the aircraft on the stern, just spot it last, no?" It was: the hook's ways onto a spot are its
-- taxi road's line and lines across the spot's front at 60 / 90 / 120 degrees, and for Port 3 (now Port quarter 3) none of those
-- can be come onto from elevator 4): the aircraft is drawn off the platform (10 / 16 / 22 m the way it points), across to
-- the spot's own line ahead of the spot, along that line away from the spot until the tow is straight on it, and
-- pushed straight back into the spot. Driven in the head by the hook's own Tow.Fd.trySpot (strictly: nothing
-- touched). Tried when the hook's planner has no way, or none that is clear. The plan, or nil and why.
-- (Ds: how far ahead of the spot the push begins, in the order tried (12, 18, 24 if not given); okPlan: a plan that
-- does not pass it is not taken)
local function axisTow(a, oth, reach, fx, fz, nx, nz, Ds, okPlan)
  local sp = a.spot
  local hx, hz = unit(sp.fx, sp.fz)
  local L = TOW.noseGear + TOW.mainGear
  local mFx, mFz = sp.x - hx * TOW.mainGear, sp.z - hz * TOW.mainGear
  local why
  for _, D in ipairs(Ds or { 12, 18, 24 }) do
    local K = { mFx + hx * D, mFz + hz * D }
    for _, d0 in ipairs({ 10, 16, 22 }) do
      local V = { a.x + fx * d0, a.z + fz * d0 }
      for _, u in ipairs({ D - 8, D, D + 8 }) do
        M.pauseIn()
        local X = { mFx + hx * u, mFz + hz * u }
        if hyp(X[1] - V[1], X[2] - V[2]) > 8 then
          local st0 = { d = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch,
            blocks = Tow.Fd.blockList(), others = oth, half = HALF }
          Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, { x = sp.x, z = sp.z, fx = hx, fz = hz })
          -- (the push eased in: its first 6 m straight back the way the aircraft then points, then onto the spot's line
          -- half way back: begun as the hook's own pushes are, hard over for the spot at once, the bar folded)
          local K2 = { mFx + hx * D * 0.5, mFz + hz * D * 0.5 }
          local spot = { x = sp.x, z = sp.z, name = sp.name, spot = sp.spot, id = sp.id, pushK = { K2[1], K2[2], pts = { K2 }, ease = 6 }, pushRho = 12 }
          local plan, w = Tow.Fd.trySpot(st0, spot, reach, { { a.x, a.z }, V, X, X }, hx, hz, hx, hz, K, 12, false)
          if plan and okPlan and not okPlan(plan) then plan, w = nil, 'it leaves its side of the landing area' end
          if plan then
            plan.text = string.format('%.0f m across the deck onto the line of %s, then pushed straight back %.0f m into it, tail first', Tow.routeLen(plan.pull), tostring(sp.name), D + 2)
            return plan
          end
          why = why or w
          Tow.Fd.log(string.format('tow: %s straight in along the line of %s (off the platform %d m, onto the line %d m ahead of the spot, backed from %d m): %s', tostring(a.board), tostring(sp.name), d0, u, D, tostring(w)))
        end
      end
    end
  end
  return nil, why
end

-- HEAD ON, FOR ITS FRONT HITCH, ON THE FLIGHT DECK (the user, 2026-11-18, twice: "I see a lot of tugs wasting time making
-- half turns in front of aircraft to line up their hitch when they could have just pulled straight in and used the
-- hitch on the other side of the tug"; "I'm still seeing a lot of tugs doing half turns to connect, particularly on
-- the flight deck"): the tractor comes down the aircraft's nose line towards it and stops FRONT.run short of where
-- its front pintle is in the bar's ring (the hook: w.frontHitch, as in the hangar). The tow is then driven with the
-- tractor FACING the aircraft: it backs along the pull and drives forward on the push. Its way, or nil and why.
function M.deckFront(tug, a, nx, nz, fx, fz, reach, oth)
  local d = tug.d
  local uG = reach - (TOW.hitch - TOW.hitchFront) + FRONT.run
  local goal = { x = nx + fx * uG, z = nz + fz * uG, hx = -fx, hz = -fz }
  local all = { { x = a.x, z = a.z, fx = fx, fz = fz, name = a.name, half = HALF, shape = Tow.Fd.shape(a.x, a.z, fx, fz, HALF) } }
  for _, o in ipairs(oth) do all[#all + 1] = o end
  local blocks = Tow.Fd.blockList()
  local why
  -- (it stands on the nose line already, facing the aircraft: straight on)
  local along, off = (d.x - nx) * fx + (d.z - nz) * fz, math.abs((d.x - nx) * -fz + (d.z - nz) * fx)
  if off < 0.5 and (d.hx * fx + d.hz * fz) < -0.985 and along > uG + 0.5 and along < uG + 30 then
    local path = { { d.x, d.z }, { goal.x, goal.z } }
    local good, bad = Tow.Fd.simSolo(d, path, blocks, goal, all)
    if good then return path end
    why = bad
  end
  for _, lead in ipairs({ 10, 6, 3 }) do
    local Q = { nx + fx * (uG + lead), nz + fz * (uG + lead) }
    local way = findWay(nil, { d.x, d.z }, Q, nil, d)
    if not way then
      why = why or 'the tractor finds no way to the line ahead of its nose'
    else
      way[#way + 1] = { goal.x, goal.z }
      for _, r in ipairs({ 5, 3, 2 }) do
        local path = Tow.Net.smooth(way, r)
        local good, bad = Tow.Fd.simSolo(d, path, blocks, goal, all)
        if good then return path end
        why = why or bad
      end
    end
  end
  return nil, why
end

-- is a point in the landing area (DCS's own landing strip of the ship, and m metres either side)
function M.inLA(x, z, m)
  return math.abs((x + 45) * 0.15877 + (z + 10.49) * 0.98731) < 12.5 + (m or 0)
end

-- INTO A SIX-PACK SPOT FROM BEHIND, THROUGH THE LANDING AREA (the user, 2026-11-18: "Aircraft spotted in the sixpack
-- don't always need to be backed in, they can be pulled into the spot from behind through the landing area"): the
-- six-pack's aircraft stand in a row along the middle of the deck, noses to starboard, the landing area behind their
-- tails. The aircraft is drawn off the platform, round the end of the row (the way-finder's way for a tractor with an
-- aircraft on its bar: every other aircraft shut 3.6 m wider), onto the spot's own line behind the spot, and along
-- that line nose first through the spot until its main wheels are 3.5 m past where they will stand; then set back
-- those 3.5 m. Driven in the head by the hook's own Tow.Fd.trySpot (strictly: nothing touched). plan.holdS: how far
-- along the pull it is behind the row, in the landing area (where it may hold: see startDeckJob). The plan, or nil
-- and why.
-- PULLED STRAIGHT TO ITS PLACE, NO SET-BACK (the user, 2026-11-19: "Tugs pulling into the sixpack are pulling the
-- aircraft all the way through its parking location, then backing up to the final position. It would be much more
-- expedient if they just pulled the aircraft to the correct position to begin with"; and: "Would it help efficiency
-- at all to loosen the precision required when parking aircraft ... +/- 20cm in lateral and longitudinal positioning
-- and +/- 5 degrees in angular positioning?"): the pull ends where the tractor stands when the main wheels are on
-- their place and the tow is straight; driven in the head (the hook's Tow.Fd.sim: nothing touched); how far along
-- the aircraft then stands from its place is taken out by ending the pull that much sooner (one more go). Taken if
-- it then stands within M.DIRECT of the spot (to the side, along, degrees): the set-back was there to take out what
-- is left of the turn onto the spot's line. wp: the aircraft's place, the way round the row, W, X.
M.DIRECT = { lat = 0.15, lon = 0.05, ang = 2.0 }
function M.pullDirect(a, sp, oth, reach, wp, hx, hz, mFx, mFz, fx, fz, nx, nz, hx0, hz0)
  local N = Tow.Net
  local L = TOW.noseGear + TOW.mainGear
  local off, out, why = 0, nil, nil
  for _ = 1, 2 do
    local st0 = { d = { x = hx0, z = hz0, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch,
      blocks = Tow.Fd.blockList(), others = oth, half = HALF }
    Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, { x = sp.x, z = sp.z, fx = hx, fz = hz })
    local train = TOW.hitch + st0.fl + L
    local cs = {}
    for i = 1, #wp do cs[#cs + 1] = { wp[i][1], wp[i][2] } end
    cs[#cs + 1] = { mFx + hx * (train - off), mFz + hz * (train - off) }
    local route = N.smooth(cs)
    local skip = TOW.noseGear + reach + 1.5
    if Tow.routeLen(route) < skip + 4 then return nil, 'the spot is too near for a tow' end
    local path = Tow.Fd.join(st0.d, route, skip)
    local res, w = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
    if not res then return nil, 'on the pull into the spot ' .. tostring(w) end
    local ex, ez = res.mx - mFx, res.mz - mFz
    local ax, az = unit(res.lx - res.mx, res.lz - res.mz)
    out = { path = path, res = res, lon = ex * hx + ez * hz, lat = ex * -hz + ez * hx, ang = N.turn(ax, az, hx, hz) }
    if math.abs(out.lon) <= 0.02 then break end
    off = off + out.lon
  end
  if math.abs(out.lat) > M.DIRECT.lat or math.abs(out.lon) > M.DIRECT.lon or math.abs(out.ang) > M.DIRECT.ang then
    return nil, string.format('it would stand %.2f m to the side, %.2f m along and %.1f degrees off the spot', out.lat, out.lon, out.ang)
  end
  local res = out.res
  return { kind = 'spot', pull = out.path, steer = res.steer, room = Tow.Fd.roomText(res, nil), roomOf = { Tow.Fd.roomOf(res, nil) },
    dest = { x = sp.x, z = sp.z, fx = hx, fz = hz, name = sp.name, short = sp.name }, direct = { lat = out.lat, lon = out.lon, ang = out.ang } }
end

function M.pullThrough(a, oth, reach, fx, fz, nx, nz)
  local sp = a.spot
  if tostring(sp.id):sub(1, 2) ~= 'SP' then return nil, 'not a six-pack spot' end
  local hx, hz = unit(sp.fx, sp.fz)
  local L = TOW.noseGear + TOW.mainGear
  local mFx, mFz = sp.x - hx * TOW.mainGear, sp.z - hz * TOW.mainGear
  local hx0, hz0 = nx + fx * reach, nz + fz * reach
  -- (THE ROW IS SHUT for its way-finder, every six-pack spot as if an aircraft stood on it: the way goes round an end
  -- of the row, not through a spot that is still empty: the first build came down the spot's own line from the
  -- front: "the line across the spot runs against the way the jet comes")
  -- (walls: 3.6 m more than a tractor by itself keeps from an aircraft's wheels; wallsWide: 7 m more, tried first: the
  -- user, 2026-11-19: "The final tow from El 2 to the sixpack does not leave much clearance between the right wingtip
  -- of the towed aircraft and the right wingtip of the aftmost aircraft already parked on the sixpack. There is
  -- plenty of space toward the stern of the ship, so it should utilize that space")
  local walls, wallsWide = {}, {}
  for _, o in ipairs(M.aircraft) do
    local s2 = o.spot
    if s2 and tostring(s2.id):sub(1, 2) == 'SP' then
      local ux, uz = unit(s2.fx, s2.fz)
      for _, u in ipairs(FIND.along) do
        walls[#walls + 1] = { s2.x + ux * u, s2.z + uz * u, FIND.wheels + 3.6 }
        wallsWide[#wallsWide + 1] = { s2.x + ux * u, s2.z + uz * u, FIND.wheels + 7.0 }
      end
    end
  end
  local ways = {}
  -- (the side of the row its way comes round: the end nearer the aircraft first; px, pz: along the row, forward)
  local px, pz = hz, -hx
  local near = ((a.x - sp.x) * px + (a.z - sp.z) * pz) >= 0 and 1 or -1
  local why
  -- (ub: how far behind its place it comes onto the spot's line: square onto it, from W, 14 m along the row from
  -- there; D: how far past its place the main wheels are drawn before it is set back: the push D + 2 m, its first
  -- D / 2 m straight back the way the aircraft then points, as the straight-in tows' are)
  -- (pass 1: pulled straight to its place (M.pullDirect); pass 2: drawn past it and set back, as before)
  -- (pass 1: the longest line first: the more of it the aircraft has behind it, the straighter it stands at the end)
  for pass = (CATCC_DEMO_NO_DIRECT and 2 or 1), 2 do
  for _, ub in ipairs(pass == 1 and { 30, 26, 22 } or { 24, 28, 20 }) do
    local X = { mFx - hx * ub, mFz - hz * ub }
    -- (each end of the row: with the wide berth, then with the plain one: round the after end, between Sixpack 6 and
    -- the island, the wide berth leaves a way the tow cannot be driven along (2026-11-19: "the tractor would leave
    -- the deck": the only way from behind was then the 125 m round the forward end))
    for _, sw in ipairs(CATCC_DEMO_NO_WIDEWALL and { { near, walls }, { -near, walls } } or { { near, wallsWide }, { near, walls }, { -near, wallsWide }, { -near, walls } }) do
      local side, wl = sw[1], sw[2]
      M.pauseIn()
      local W = { X[1] + px * side * 14, X[2] + pz * side * 14 }
      local key = ub .. '|' .. side .. '|' .. (wl == walls and 'n' or 'w')
      if ways[key] == nil then
        M.finderTow, M.finderFree = { skip = a, wide = 3.6, walls = wl }, true
        local way = findWay(nil, { hx0, hz0 }, W, nil, { x = hx0, z = hz0, hx = fx, hz = fz })
        M.finderTow, M.finderFree = nil, nil
        ways[key] = way or false
      end
      local way = ways[key]
      if not way or #way < 2 then
        why = why or 'the way-finder has no way round the row to the line behind the spot'
      else
        local wp = { { a.x, a.z } }
        for _, q in ipairs(way) do wp[#wp + 1] = { q[1], q[2] } end
        if hyp(wp[#wp][1] - W[1], wp[#wp][2] - W[2]) < 4 then wp[#wp] = nil end
        wp[#wp + 1] = W
        wp[#wp + 1] = X
        if pass == 1 then
          local pd, wd = M.pullDirect(a, sp, oth, reach, wp, hx, hz, mFx, mFz, fx, fz, nx, nz, hx0, hz0)
          if pd then
            local sAt, best, run = 0, nil, 0
            for i = 2, #pd.pull do
              run = run + hyp(pd.pull[i][1] - pd.pull[i - 1][1], pd.pull[i][2] - pd.pull[i - 1][2])
              local dd = hyp(pd.pull[i][1] - W[1], pd.pull[i][2] - W[2])
              if not best or dd < best then best, sAt = dd, run end
            end
            pd.holdS, pd.through, pd.noKnown = math.max(8, sAt - 3), true, true
            pd.text = string.format('%.0f m round the %s end of the row and through the landing area onto the line of %s from behind, pulled into it nose first to its place (it stands %.2f m to the side, %.2f m along and %.1f degrees off the spot)',
              Tow.routeLen(pd.pull), side > 0 and 'forward' or 'after', tostring(sp.name), pd.direct.lat, pd.direct.lon, pd.direct.ang)
            return pd
          end
          why = why or wd
          Tow.Fd.log(string.format('tow: %s into %s from behind, straight to its place (round the %s end, onto its line %d m behind the spot): %s', tostring(a.board), tostring(sp.name), side > 0 and 'forward' or 'after', ub, tostring(wd)))
        end
        wp[#wp + 1] = X
        for _, D in ipairs(pass == 2 and { 4, 6 } or {}) do
          local K = { mFx + hx * D, mFz + hz * D }
          local K2 = { mFx + hx * D * 0.5, mFz + hz * D * 0.5 }
          local st0 = { d = { x = hx0, z = hz0, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch,
            blocks = Tow.Fd.blockList(), others = oth, half = HALF }
          Tow.Fd.limits(st0, { x = a.x, z = a.z, fx = fx, fz = fz }, { x = sp.x, z = sp.z, fx = hx, fz = hz })
          local spot = { x = sp.x, z = sp.z, name = sp.name, spot = sp.spot, id = sp.id, pushK = { K2[1], K2[2], pts = { K2 }, ease = D * 0.5 }, pushRho = 12 }
          local plan, w = Tow.Fd.trySpot(st0, spot, reach, wp, hx, hz, hx, hz, K, 12, false)
          if plan then
            -- (where it is behind the row: the point of its pull nearest W, less 3 m)
            local sAt, best, run = 0, nil, 0
            for i = 2, #plan.pull do
              run = run + hyp(plan.pull[i][1] - plan.pull[i - 1][1], plan.pull[i][2] - plan.pull[i - 1][2])
              local dd = hyp(plan.pull[i][1] - W[1], plan.pull[i][2] - W[2])
              if not best or dd < best then best, sAt = dd, run end
            end
            plan.holdS, plan.through, plan.noKnown = math.max(8, sAt - 3), true, true
            plan.text = string.format('%.0f m round the %s end of the row and through the landing area onto the line of %s from behind, pulled into it nose first, then set back %d m', Tow.routeLen(plan.pull),
              side > 0 and 'forward' or 'after', tostring(sp.name), D + 2)
            return plan
          end
          why = why or w
          Tow.Fd.log(string.format('tow: %s into %s from behind (round the %s end, onto its line %d m behind the spot, drawn %d m past it): %s', tostring(a.board), tostring(sp.name), side > 0 and 'forward' or 'after', ub, D,
            tostring(w)))
        end
      end
    end
  end
  end
  return nil, why
end

-- DOES A TOW TURN IN FRONT OF ITS OWN ELEVATOR'S PLATFORM: where its pull ends, the corner of its push, or the line
-- between them and on to its place, comes within 5 m of the platform's rectangle (and 1.5 m): the platform then
-- stays up until the aircraft is parked (tickElevator: what is still to come over the platform)
function M.holdsFront(E, plan)
  local e = H.elevators[E.k]
  local x1, x2 = e.x[1] - 1.5, e.x[2] + 1.5
  local z1, z2 = math.min(e.z[1], e.z[2]) - 1.5, math.max(e.z[1], e.z[2]) + 1.5
  local pts = {}
  if plan.pull then pts[#pts + 1] = plan.pull[#plan.pull] end
  if plan.push and plan.push.K then pts[#pts + 1] = { plan.push.K[1], plan.push.K[2] } end
  pts[#pts + 1] = { plan.dest.x, plan.dest.z }
  for i = 1, #pts do
    local a, b = pts[i], pts[math.min(#pts, i + 1)]
    local n = math.max(1, math.ceil(hyp(b[1] - a[1], b[2] - a[2]) / 3))
    for k = 0, n do
      local x, z = a[1] + (b[1] - a[1]) * k / n, a[2] + (b[2] - a[2]) * k / n
      local nx, nz = math.max(x1, math.min(x2, x)), math.max(z1, math.min(z2, z))
      if (x - nx) ^ 2 + (z - nz) ^ 2 < 25 then return true end
    end
  end
  return false
end

-- HOW FAR A TOW'S PULL GOES OVER THE LANDING AREA'S CENTRE LINE to the other side (side: 1: its own side is to
-- starboard of the line, -1 to port). The line is DCS's own landing strip of the ship (the hook's LA: through 45 m
-- aft / 10.49 m to port, 9.14 degrees to port of the bow).
function M.crossing(plan, side)
  local worst = 0
  for _, q in ipairs(plan.pull or {}) do
    local lat = (q[1] + 45) * 0.15877 + (q[2] + 10.49) * 0.98731
    if -side * lat > worst then worst = -side * lat end
  end
  return worst
end

local function startDeckJob(E, a, clearOnly)
  -- WHO TAKES IT: the tractor that is for it (`assign`), once it has nothing else in hand.
  local mine = a.waiter
  if not (mine and mine.waitFor and mine.waitFor.a == a) then return false, 'no tractor is for it yet' end
  if mine.job then
    local j = mine.job
    -- IT IS ON ITS WAY TO A PLACE BY ITSELF (a staging place, or wherever it was sent after its last tow) AND ITS
    -- AIRCRAFT IS UP: IT IS CALLED BACK: it brakes to a stand where it is (M.tick: job.recall), has then nothing in
    -- hand, and the tow begins from there. Not one that is backing into a place already, nor one on its way to the
    -- front of this elevator.
    local now = Tow.now()
    if (j.move or j.delivered) and not j.recall and not CATCC_DEMO_NO_RECALL and j.w.phase == 'leave' and not (j.park and j.park.step) and E.state == 'up' and a.level == 'deck'
      and not (a.holdOff and a.holdOff > now) and not (j.goal and j.goal.wait and j.goal.k == E.k) and now >= (mine.recallAt or 0) and M.standFree(mine) then
      j.recall, mine.recallAt = a, now + 30
      logLine(string.format('demo: %s is called back from its way to %s: %s, which it is for, is up on elevator %d', mine.name, j.goal and placeText(j.goal, mine) or 'a place', tostring(a.board), E.k))
    end
    return false, mine.name .. ', which is for it, has not finished what it has in hand (' .. ((j.move and 'on its way to a place') or (j.delivered and 'on its way from its last tow') or 'a tow') .. ')'
  end
  if shutIn(mine) then return false, mine.name .. ', which is for it, is shut in behind another in the pocket' end
  if mine.restAt and Tow.now() < mine.restAt then return false, mine.name .. ', which is for it, was stood down a moment ago' end
  local idle = { mine }
  local reach = reachOf()
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  -- (the tow itself: worked out once for the deck as it stands, kept until something changes; with it the list of
  -- the other aircraft it was worked out against: each has the room the tow must keep from it written on it)
  -- THE TRACTORS THAT STAND PARKED (where their section waits, or in the junkyard; not one in front of an elevator: it
  -- stands on a tow's own line) are in the plan as the aircraft are, with a tractor's shape: the tow is driven clear
  -- of them, and they are not then asked about again with a circle (`free`: a circle of 8 m about a tow's line took
  -- a tractor in the pocket by the island, 4 m clear of the wing that passes it, to stand in the way of every tow off
  -- elevator 2's after place: the rig, 2026-11-18). If no tow can be driven past them: planned without them, and the
  -- one that stands in the way is then sent off as before.
  local plan, why, oth, known
  if a.planSig == M.sig then
    plan, why, oth, known, M.tried = a.planKept, a.planWhy, a.planOth, a.planTugs, a.planTried or {}
  else
    -- (SPREAD OVER FRAMES (M.sliced): until it has ended the tow is not begun; kept under the deck's state it was
    -- begun for (sig0): if that has changed meanwhile it is worked out again)
    local sig0 = M.sig
    local function work()
    M.tried = {}
    local air = others('deck', a, not CATCC_DEMO_NO_LEAVING)
    oth, known = {}, {}
    for _, o in ipairs(air) do oth[#oth + 1] = o end
    for _, t in ipairs(M.tugs) do
      -- (and one that waits in front of an elevator for ANOTHER aircraft: on its own aircraft's nose line, not this one's)
      -- (NOT ONE THAT STANDS ON OR WITHIN 9 m OF THE SPOT THE AIRCRAFT GOES TO: the hook keeps from each other thing the
      -- room there is to it where the aircraft will stand: for a tractor on the spot itself that is none, and the tow
      -- was planned, and driven, through it: the rig, 2026-11-19: an aircraft pushed into Sixpack 6 over the tractor
      -- that waited on that spot. Left out here it is found standing in the way, and sent off.)
      if t.level == 'deck' and not t.job and t.place and hyp(t.d.x - a.spot.x, t.d.z - a.spot.z) > 9 and (not t.place.wait or (t ~= mine and not (t.place.k == E.k and t.place.st == a.st))) then
        local sh = Tow.Fd.tugShape(t.d.x, t.d.z, t.d.hx, t.d.hz)
        sh.low = { sh[1] }
        oth[#oth + 1] = { x = t.d.x, z = t.d.z, fx = t.d.hx, fz = t.d.hz, name = t.name, half = HALF, shape = sh, tug = t }
        known[t] = true
      end
    end
    -- THE TRACTOR OF THE OTHER AIRCRAFT OF THIS PLATFORM IS IN THE PLAN WHERE IT WAITS AND WHERE IT HOOKS ON, whether one
    -- stands there yet or not (the user, 2026-11-19, of his run: a tractor at elevator 2 that waited for the other
    -- tow to end, and one that drove off and came back: "maybe its pathfinding was stale?": it was: the after
    -- aircraft's tow was planned before the forward one's tractor had come to its nose, through the place it then
    -- stood on; that tractor was sent off, and its aircraft waited two minutes). Both can then hook on at once.
    -- CATCC_DEMO_NO_VTUG: as it was.
    local vt = {}
    if not CATCC_DEMO_NO_VTUG then
      local e = H.elevators[E.k]
      for _, r in ipairs(E.riders or {}) do
        if r ~= a and r.id and r.level == 'deck' and not r.parked and r.x > e.x[1] - 1 and r.x < e.x[2] + 1
          and r.z > math.min(e.z[1], e.z[2]) - 1 and r.z < math.max(e.z[1], e.z[2]) + 1 then
          local rfx, rfz = unit(r.fx, r.fz)
          local places = { { r.x + rfx * (TOW.noseGear + reach), r.z + rfz * (TOW.noseGear + reach) } }
          -- (not also where it waits before the platform is up, 6 m further out: the road in front of the platform
          -- runs through that place: no tow could be planned clear of it; it has hooked on by the time a tow passes)
          for _, P in ipairs(places) do
            local sh = Tow.Fd.tugShape(P[1], P[2], rfx, rfz)
            sh.low = { sh[1] }
            oth[#oth + 1] = { x = P[1], z = P[2], fx = rfx, fz = rfz, name = 'the tractor at the nose of ' .. tostring(r.board), half = HALF, shape = sh, tug = { virtual = true } }
            vt[#vt + 1] = P
          end
        end
      end
    end
    plan, why = within(ENV_DECK, Tow.Fd.plan, { x = a.x, z = a.z, ship = M.ship }, 'spot', a.spot.spot, reach, fx, fz, nx, nz, { e = a }, nil, oth, HALF)
    if plan and not plan.soft and #vt > 0 then
      plan.vt = vt
    elseif #vt > 0 then
      -- (no way clear of those places: as it was: against the tractors that do stand there)
      Tow.Fd.log(string.format('tow: %s to %s: no way clear of where the tractor of the other aircraft of its platform stands: planned without that', tostring(a.board), tostring(a.spot.name)))
      local oth0 = {}
      for _, o in ipairs(oth) do
        if not (o.tug and o.tug.virtual) then oth0[#oth0 + 1] = o end
      end
      oth = oth0
      plan, why = within(ENV_DECK, Tow.Fd.plan, { x = a.x, z = a.z, ship = M.ship }, 'spot', a.spot.spot, reach, fx, fz, nx, nz, { e = a }, nil, oth, HALF)
    end
    if (not plan or plan.soft) and #oth > #air then
      local tried = M.tried
      M.tried = {}
      local plan2, why2 = within(ENV_DECK, Tow.Fd.plan, { x = a.x, z = a.z, ship = M.ship }, 'spot', a.spot.spot, reach, fx, fz, nx, nz, { e = a }, nil, air, HALF)
      if plan2 and not (plan and plan2.soft) then
        plan, why, oth, known = plan2, why2, air, {}
      else
        M.tried = tried
      end
    end
    -- (no way, or none that is clear: straight in along the spot's own line. (CATCC_DEMO_NO_AXIS: a test's wish: only
    -- when there is no way at all.))
    if not plan or (plan.soft and not CATCC_DEMO_NO_AXIS) then
      local p2 = within(ENV_DECK, axisTow, a, air, reach, fx, fz, nx, nz)
      if type(p2) == 'table' then plan, why, oth, known = p2, nil, air, {} end
    end
    -- OFF THE AFTER ELEVATORS A TOW KEEPS TO ITS OWN SIDE OF THE LANDING AREA (the user, 2026-11-18, with a drawing: the
    -- aircraft of elevator 3 and of elevator 4 are towed "remaining on its side of the LA as much as possible to avoid
    -- conflict with the opposite elevator"; the forward one is taken forward into the landing area and pushed back
    -- along its own side): a way that takes the tractor more than 3 m over the landing area's centre line is given up
    -- for one straight in along the spot's own line that does not (the pull forward onto that line as far as 60 m
    -- ahead of the spot, then the straight push back), if there is one. CATCC_DEMO_NO_SIDE: a test's wish.
    local side = (E.k == 3 and 1) or (E.k == 4 and -1) or nil
    -- (THE FORWARD ONE OF THE TWO ONLY (its place on the platform is the second: the after one is "sent directly to the
    -- parking spot", as he drew it): for both, every tow that crossed the line became a pull forward and a straight
    -- push of 50 to 62 m, and the rig's runs were a minute longer on average (2026-11-19: 31.6 / 32.1 / 35.0 / 29.1
    -- minutes at paces 2 / 4 / 8 / 1 with the rule for both, 29.6 / 33.6 / 32.8 / 27.7 without it).
    -- CATCC_DEMO_SIDE_ALL: for both.)
    if side and plan and not CATCC_DEMO_NO_SIDE and (a.st == 2 or CATCC_DEMO_SIDE_ALL) and M.crossing(plan, side) > 3 then
      local over = M.crossing(plan, side)
      local p3 = within(ENV_DECK, axisTow, a, air, reach, fx, fz, nx, nz, { 60, 48, 36, 24, 18, 12 }, function(pl) return M.crossing(pl, side) <= 3 end)
      if type(p3) == 'table' then
        Tow.Fd.log(string.format('tow: %s to %s: the way found goes %.0f m over the landing area\'s centre line: straight in along the spot\'s own line instead (%s)', tostring(a.board), tostring(a.spot.name), over, tostring(p3.text)))
        plan, why, oth, known = p3, nil, air, {}
      end
    end
    a.planSig, a.planKept, a.planWhy, a.planOth, a.planTugs, a.planTried = sig0, plan, why, oth, known, M.tried
    end
    if CATCC_DEMO_NO_SLICE then
      work()
    else
      if not M.sliced(a, 'planCo', work) or a.planSig ~= M.sig then
        E.planning = true
        return false, E.why or 'its tow is being worked out'
      end
      plan, why, oth, known, M.tried = a.planKept, a.planWhy, a.planOth, a.planTugs, a.planTried or {}
    end
  end
  -- (for the tow itself, and for a tractor's way to the aircraft: the aircraft only; and not the tractor itself)
  local function othFor(t)
    local out = {}
    for _, o in ipairs(oth) do
      if (not o.tug or (t and o.tug ~= t)) and not (o.tug and o.tug.virtual) then out[#out + 1] = o end
    end
    return out
  end
  if not plan then return false, 'no tow: ' .. tostring(why) end
  if plan.soft and clearOnly then return false, 'its tow is not clear of the others', true end
  if plan.soft then
    -- (a way that only brushes another aircraft's padded shape is driven and said; one that goes half a metre into
    -- one, or takes the tractor through one's wheels, is not begun: it waits for the deck to change (three minutes;
    -- then it goes, and says so: an aircraft left on a platform holds up everything below it))
    local g, tg = plan.roomOf and plan.roomOf[1], plan.roomOf and plan.roomOf[3]
    if (g and -g > 0.5) or (tg and tg < 0) then
      local mt = Tow.now()
      a.deepAt = a.deepAt or mt
      -- (put off: it counts as ready only then: its tractor does not stand in front of the elevator meanwhile)
      a.holdOff = a.deepAt + 180
      if mt - a.deepAt < 180 then return false, 'no tow yet: the only way found ' .. tostring(plan.text):gsub('^.*NOT CLEAR: ', 'is not clear: ') end
    else
      a.deepAt, a.holdOff = nil, nil
    end
  else
    -- (its way is clear now: it is not put off any longer)
    a.deepAt, a.holdOff = nil, nil
  end
  -- WHAT THE TOW WILL SWEEP, AND WHEN, in the parts it is given up in (`gather`). The pull is driven in the head as the
  -- hook will drive it (the tractor from where it stands hooked on, with the aircraft's turn and pace): every circle of
  -- it is held from TOW_T.pre seconds before the tractor is at it until TOW_T.post after (the aircraft's tail is 22 m
  -- behind the tractor's own point); where the pull ends, the push and the spot from then until the aircraft stands.
  -- The place the aircraft stands on now: all the while, until it is 14 m off.
  local hx0, hz0 = nx + fx * reach, nz + fz * reach
  local tug, arrive, backOut, seq, start, pull, keep, whyNot, blocker, behind, headOn, tStart, tPull, later
  -- ONE GO AT IT: with this plan; late: IT MAY BEGIN ALTHOUGH THE REST OF ITS WAY IS HELD BY OTHERS, if nothing of
  -- theirs touches its way as far as where it holds (plan.holdS along its pull, or the pull's end): it begins BEHIND
  -- every job that holds part of the rest (`free`: cs.lateFrom), stops short of what they share (giveWay), THE AIRCRAFT
  -- ON ITS BAR, and goes on when they have passed (the user, 2026-11-18: "Even if they couldn't take their aircraft
  -- to its spot immediately because of the other tug, they could at least pull the aircraft off the elevator so it
  -- can go back down ... it has the whole landing area to use as a holding point with its aircraft"). True if a
  -- tractor can begin it.
  local function attempt(plan, late)
  local ptrk, pullT = nil, 0
  if plan.pull then ptrk, pullT = driven({ x = hx0, z = hz0, hx = fx, hz = fz }, plan.pull, TOW.fastTow, TOW.towR) end
  -- (holdT: when the tractor is at the place it holds at, in seconds from the beginning of the pull)
  local holdT = pullT
  -- (OFF THE PLATFORM: when the tractor is M.LATE.off metres along its pull (the aircraft's tail is then clear of the
  -- platform's edge: it stands 11 m in from it and is 8.5 m long behind its middle), and where it is then)
  local offT, offAt
  if ptrk then
    local run = 0
    for i = 2, #ptrk do
      run = run + hyp(ptrk[i][1] - ptrk[i - 1][1], ptrk[i][2] - ptrk[i - 1][2])
      if not offT and run >= M.LATE.off then offT, offAt = ptrk[i][3], ptrk[i] end
    end
  end
  if plan.holdS and ptrk then
    local run = 0
    for i = 2, #ptrk do
      run = run + hyp(ptrk[i][1] - ptrk[i - 1][1], ptrk[i][2] - ptrk[i - 1][2])
      if run >= plan.holdS then
        holdT = ptrk[i][3]
        break
      end
    end
  end
  -- (THE END OF THE PULL THAT STAYS HELD FOR THE PUSH: the last M.TAIL metres of it: where the aircraft still lies
  -- when the push begins (it is 22 m long behind the tractor's own point). Until 2026-11-19 its last TOW_T.tail
  -- seconds: 14 to 21 m at the pace of before, 28 to 42 m since the tractors drive twice as fast: a tow that crossed
  -- that stretch behind the aircraft waited until the aircraft was parked. tailT: when the tractor comes to it, in
  -- seconds from the beginning of the pull. CATCC_DEMO_NO_TAILM: as it was.)
  local tailT = pullT - TOW_T.tail
  if ptrk and not CATCC_DEMO_NO_TAILM then
    local run = 0
    tailT = 0
    for i = #ptrk, 2, -1 do
      run = run + hyp(ptrk[i][1] - ptrk[i - 1][1], ptrk[i][2] - ptrk[i - 1][2])
      if run >= M.TAIL then
        tailT = ptrk[i - 1][3]
        break
      end
    end
  end
  -- (tA: when the tractor is hooked on and the pull begins, in seconds from now)
  local function hold(tA)
    -- (WHERE THE AIRCRAFT STANDS: three circles of 5.5 m along it (its middle first: `letGo` measures from that), not one
    -- of 9.5 m about its middle (2026-11-19): that one reached 22 m across the platform's front and into the pocket by
    -- the island: every tractor that drove past in front of elevator 2, or to its place in the pocket, put the tow
    -- off until it had passed: the two aircraft of elevator 2's first trip stood for 3 minutes 45 with their
    -- tractors ready. CATCC_DEMO_WIDE_START: as it was.)
    local start = CATCC_DEMO_WIDE_START and circles({}, { { a.x, a.z } }, 9.5) or { { a.x, a.z, 5.5 }, { a.x + fx * 5.2, a.z + fz * 5.2, 5.5 }, { a.x - fx * 5.2, a.z - fz * 5.2, 5.5 } }
    -- (marked (c[8]): not held against a tractor by itself: `free`)
    for _, c in ipairs(start) do c[8] = true end
    local pull = {}
    if ptrk then
      circles(pull, ptrk, 8.0, nil, TOW_T.pre, TOW_T.post, tA)
      for _, c in ipairs(pull) do
        if c[6] > tA + tailT then c[5] = nil end
      end
    end
    local keep = {}
    if plan.push and plan.pull then circles(keep, { plan.pull[#plan.pull], plan.push.K, { plan.dest.x, plan.dest.z } }, 9.0) end
    circles(keep, { { plan.dest.x, plan.dest.z } }, 9.5)
    heldFrom(keep, tA + pullT - TOW_T.pre - 2)
    -- (c[11]: WHEN THE TOW COMES TO THEM: when its push begins: giveWay stops it for them then, not when it begins to
    -- hold them: M.needAt)
    for _, c in ipairs(keep) do c[11] = tA + pullT - 2 end
    -- UNTIL ABOUT WHEN THE AIRCRAFT STANDS (2026-11-19; c[10] marks an end that is reckoned): the push line, the spot
    -- and the end of the pull were held from the moment the tow began "to the end of its job", so nothing could be
    -- planned across them for AFTER it either: a tow that would be there two minutes later waited to begin until
    -- this one was parked. The ends are taken off again when the push begins (letGo): from then on they are held
    -- until they are given up behind it. CATCC_DEMO_NO_ENDS: as it was.
    if not CATCC_DEMO_NO_ENDS then
      local tEnd = tA + pullT + M.pushTime(plan, a)
      for _, c in ipairs(keep) do c[5], c[10] = tEnd, true end
      for _, c in ipairs(pull) do
        if not c[5] then c[5], c[10] = tEnd, true end
      end
    end
    return start, pull, keep
  end
  -- THE SAME, TIGHT (for the other tow off this platform: `free`): where the aircraft stands, three circles of its own
  -- width (half its folded span and 0.4 m) along it; its pull, the same width along the track, for the time it passes
  local function tightOf(tA)
    local ts, tp = {}, {}
    for _, u in ipairs({ 5.2, 0, -5.2 }) do ts[#ts + 1] = { a.x + fx * u, a.z + fz * u, 4.6 } end
    if ptrk then
      circles(tp, ptrk, 4.6, nil, TOW_T.pre, TOW_T.post, tA)
      local tEnd = (not CATCC_DEMO_NO_ENDS) and (tA + pullT + M.pushTime(plan, a)) or nil
      for _, c in ipairs(tp) do
        if c[6] > tA + tailT then c[5], c[10] = tEnd, tEnd and true or nil end
      end
    end
    return ts, tp
  end
  local function claim(tA, s, pl, k)
    local ts, tp = tightOf(tA)
    local ts0
    -- (HOOKED ON AT ONCE (late == 'nose'): where the aircraft stands is asked for from when its pull begins: it stands
    -- there whether it is hooked on or not, and every other tow was driven in the head clear of it)
    if late == 'nose' then
      local function timed(list)
        local out = {}
        for _, c in ipairs(list) do
          local q = { c[1], c[2], c[3] }
          q[4], q[8] = tA - TOW_T.pre, c[8]
          out[#out + 1] = q
        end
        return out
      end
      -- (HELD, all the while, from the moment it begins: those discs as they are, and one about its tractor where it
      -- hooks on (ts0, and `start`): the rig, 2026-11-19: the other tow off elevator 2 was pulled past the tractor
      -- that stood hooked on at the first aircraft's nose 4.6 m from the aircraft's centre line: its discs were
      -- "not needed yet")
      ts[#ts + 1] = { hx0, hz0, 3.0 }
      ts0 = ts
      s, ts = timed(s), timed(ts)
    else
      -- (every tow: its tractor where it hooks on, from the moment it begins)
      ts[#ts + 1] = { hx0, hz0, 3.0 }
    end
    local cs = both(both(s, pl), k)
    -- (the push and the spot, tight: 5 m about the line from where the pull ends by the push's corner to the place,
    -- held from when the push begins: for the other tow off this platform: the 9 m circles reached back to the
    -- platform from a place in front of it, and the second aircraft stood until the first was parked)
    local tk = {}
    -- (OFF (CATCC_DEMO_TIGHT_KEEP switches it on): with it the two tows off elevator 4 came to stand in each other's
    -- way in the landing area at 8 times speed, and two tractors 1.6 m apart: the rig, 2026-11-19)
    if plan.pull and CATCC_DEMO_TIGHT_KEEP then
      local pts = { plan.pull[#plan.pull] }
      if plan.push and plan.push.K then pts[#pts + 1] = { plan.push.K[1], plan.push.K[2] } end
      pts[#pts + 1] = { plan.dest.x, plan.dest.z }
      circles(tk, pts, 5.0)
      heldFrom(tk, tA + pullT - TOW_T.pre - 2)
    elseif plan.pull and pullT and not plan.soft and not CATCC_DEMO_NO_TIMEDKEEP then
      -- (AS WIDE AS THEY ARE, BUT ONLY FROM 10 s BEFORE THE PUSH BEGINS, for the other tow off this platform: the rig,
      -- 2026-11-19: the second aircraft of every platform was let begin "behind" the first and then gave way at the
      -- platform's edge, its tail still on it, for 74 to 76 s, until the first was PARKED: the first's push line and
      -- spot, held from the moment its tow began, lay across the second's first metres, though the first was a
      -- minute from pushing back along it. With this the second crosses before, and holds further on if it must.)
      for _, c in ipairs(k) do
        local q = { c[1], c[2], c[3] }
        q[4], q[6], q[7], q[8] = tA + pullT - TOW_T.pre - 10, c[6], c[7], c[8]
        q[5], q[10], q[11] = c[5], c[10], c[11]
        tk[#tk + 1] = q
      end
    else
      tk = k
    end
    cs.tKeep = tk
    cs.vt = plan.vt
    cs.pairE, cs.tight = E, both(both(ts, tp), tk)
    -- (late: from when it is 4 s short of where it holds: `free` lets it begin behind whatever holds its way from there on)
    -- (late == 'off': from when it is off the platform: it then stands somewhere along its pull, in the landing area)
    if late == 'nose' then
      cs.lateFrom, cs.nose = tA - TOW_T.pre - 0.5, true
    elseif late == 'off' and offT then
      cs.lateFrom = tA + offT - TOW_T.pre - 0.5
    elseif late then
      cs.lateFrom = tA + holdT - TOW_T.pre - 3
    end
    return cs, ts0 or ts, tp
  end
  local known = (not plan.soft and not plan.noKnown) and known or nil
  for _, t in ipairs(idle) do
    -- (first what costs little to ask: is the tow's own room free at about the time it would be there, the tractor's
    -- way to the aircraft taken as a straight line; only then that way itself)
    -- (a tow that is not clear of everything: asked the old way)
    local tA0 = hyp(t.d.x - hx0, t.d.z - hz0) * 1.2 / 2.4 + 10
    local s0, p0, k0 = hold(tA0)
    local okf, whyf, bl = free('deck', claim(tA0, s0, p0, k0), t, known)
    if not okf then
      whyNot, blocker = whyNot or whyf, blocker or bl
    else
      local arr, why2, bo
      -- (one that stands on its nose line already, facing away (it waited there): it only backs onto the ring)
      local along, off = (t.d.x - nx) * fx + (t.d.z - nz) * fz, math.abs((t.d.x - nx) * -fz + (t.d.z - nz) * fx)
      local front = false
      local busyArr = false
      if off < 0.6 and (t.d.hx * fx + t.d.hz * fz) > 0.985 and along > reach + 1.5 and along < reach + 14 then
        arr, bo = { { t.d.x, t.d.z }, { t.d.x + fx * 0.05, t.d.z + fz * 0.05 } }, 0
      else
        -- (ONCE for the deck as it stands and where the tractor stands, kept (a.arrRes), and spread over frames (2026-11-19:
        -- it was worked out anew for each way the tow was tried, up to five times in one frame: 2.1 s in the rig where
        -- there was none). nil: still being worked out.)
        local R = M.noseWay(a, t, function()
          local out = {}
          M.finderTug = t
          out.arr, out.why2, out.bo = within(ENV_DECK, Tow.Fd.arrival, t.d, { x = a.x, z = a.z, fx = fx, fz = fz }, nx, nz, fx, fz, reach, othFor(t))
          -- (HEAD ON, FOR ITS FRONT HITCH: taken if it can be driven and is no more than 10 m longer than the way round
          -- onto the nose line, the metres that one backs first counted twice. CATCC_DEMO_NO_FRONT: a test's wish.)
          if not CATCC_DEMO_NO_FRONT then
            local fw = within(ENV_DECK, M.deckFront, t, a, nx, nz, fx, fz, reach, othFor(t))
            if type(fw) == 'table' and (not out.arr or Tow.routeLen(fw) <= Tow.routeLen(out.arr) + 2 * (out.bo or 0) + 10) then out.arr, out.why2, out.bo, out.front = fw, nil, 0, true end
          end
          M.finderTug = nil
          return out
        end)
        if R then
          arr, why2, bo, front = R.arr, R.why2, R.bo, R.front or false
        else
          busyArr = true
        end
      end
      if busyArr then
        whyNot = whyNot or 'its tractor\'s way to its nose is being worked out'
        E.planning = true
      elseif not arr then
        whyNot = whyNot or ('no way for ' .. t.name .. ' to it: ' .. tostring(why2))
        -- (it drives to the place in front of the elevator first: nextPlace)
        t.noNoseAt = Tow.now()
      else
        -- (its way to the aircraft, with the times: backed out first (bo metres), then driven; hooked on: the bar's
        -- ring lifted, the tractor backed onto it, the pause)
        local boT = (bo and bo > 0) and (bo / TOW.backSpeed + 2) or 0
        local trk, tArr = driven({ x = t.d.x - t.d.hx * (bo or 0), z = t.d.z - t.d.hz * (bo or 0), hx = t.d.hx, hz = t.d.hz }, arr, TOW.fastSolo)
        local sq = circles({}, trk, SOLO, nil, SOLO_T.pre, SOLO_T.post, boT)
        for i = math.max(1, #sq - 2), #sq do sq[i][5] = nil end
        local last = arr[#arr]
        -- (AND ITS WAY ONTO THE BAR: from where its way to the aircraft ends to where it stands hooked on (6 to 11 m,
        -- backwards): held from when it comes there until it pulls (letGo). 2026-11-19, the rig: nothing held it: a
        -- tractor by itself drove across it behind a tractor that was backing onto its bar and passed 0.5 m from
        -- it. CATCC_DEMO_NO_HOOKTRACK: as it was.)
        if not CATCC_DEMO_NO_HOOKTRACK then
          local nH = math.max(1, math.ceil(hyp(last[1] - hx0, last[2] - hz0) / 2.5))
          for k = 1, nH do
            local c = { last[1] + (hx0 - last[1]) * k / nH, last[2] + (hz0 - last[2]) * k / nH, 2.9 }
            c[4], c[6] = boT + tArr - SOLO_T.pre, boT + tArr
            sq[#sq + 1] = c
          end
        end
        local tA = boT + tArr + TOW.liftT + (front and FRONT.run or hyp(last[1] - hx0, last[2] - hz0)) / TOW.backSpeed + TOW.pause + 1
        local s1, p1, k1 = hold(tA)
        if late == 'nose' then
          local q = { hx0, hz0, 3.5 }
          q[8] = true
          s1[#s1 + 1] = q
        end
        sq.pairE, sq.tight = E, sq
        local ok2, why3, bl2, bh1
        -- (HOOKING ON AT ONCE, the tractor on the nose line already (bo == 0 and its way a few centimetres): it stands
        -- where it stands whether it hooks on or not: its place is not asked for against the 9 m bands the other
        -- tows hold (2026-11-19: the rig at 8 times speed: elevator 1's second aircraft stood 210 s unhooked because
        -- the push line of a tow into Corral 2, 12 m off, was "in use" where its tractor stood): only that no other
        -- tow's own width comes to where it hooks on: M.noseStandOk)
        if late == 'nose' and bo == 0 and #arr == 2 and not front and M.noseStandOk(t, hx0, hz0) then
          ok2 = true
        else
          ok2, why3, bl2, bh1 = free('deck', sq, t)
        end
        local bh2
        local cs1, ts1, tp1 = claim(tA, s1, p1, k1)
        if ok2 then ok2, why3, bl2, bh2 = free('deck', cs1, t, known) end
        if ok2 then
          tug, arrive, backOut, seq, start, pull, keep, behind, headOn = t, arr, bo, sq, s1, p1, k1, afterOf(bh1, bh2), front
          tStart, tPull, M.tKeepNew = ts1, tp1, cs1.tKeep
          later = late and behind ~= nil
          M.lateKind, M.tANew = late, tA
          break
        end
        whyNot, blocker = whyNot or why3, blocker or bl2
      end
    end
  end
  return tug ~= nil
  end
  -- (where a plan would hold: the point of its pull at plan.holdS, or its end: only in the landing area)
  local function holdsInLA(pl)
    if not pl.pull or pl.soft or CATCC_DEMO_NO_HOLD then return false end
    local q = pl.pull[#pl.pull]
    if pl.holdS then
      local run = 0
      for i = 2, #pl.pull do
        run = run + hyp(pl.pull[i][1] - pl.pull[i - 1][1], pl.pull[i][2] - pl.pull[i - 1][2])
        if run >= pl.holdS then
          q = pl.pull[i]
          break
        end
      end
    end
    return M.inLA(q[1], q[2], 2)
  end
  -- THE GOES, in turn: the whole way at once; the same, held in the landing area; for a six-pack spot: from behind
  -- through the landing area, the whole way at once, then held behind the row
  -- (OFF THE PLATFORM AND INTO THE LANDING AREA (the user, 2026-11-18: "they could at least pull the aircraft off the
  -- elevator so it can go back down ... it has the whole landing area to use as a holding point with its aircraft";
  -- with his drawing: "tugs take the forewardmost aircraft into the landing area (green line) and push their
  -- aircraft back (orange line) on their side of the LA as soon as the other tug is clear"): a tow whose pull is in
  -- the landing area by the time the aircraft is off the platform (M.LATE.off m along it) may begin if nothing another
  -- job needs at the same time lies before that: it goes as far as it can, stops short of the first circle that is
  -- so needed (giveWay: job.late), and goes on when the other has passed.)
  local function offInLA(pl)
    if not pl.pull or pl.soft or CATCC_DEMO_NO_HOLD or CATCC_DEMO_NO_OFFHOLD or Tow.routeLen(pl.pull) < M.LATE.off + 6 then return false end
    local run = 0
    for i = 2, #pl.pull do
      run = run + hyp(pl.pull[i][1] - pl.pull[i - 1][1], pl.pull[i][2] - pl.pull[i - 1][2])
      if run >= M.LATE.off then return M.inLA(pl.pull[i][1], pl.pull[i][2], 2) end
    end
    return false
  end
  local function lateGo(pl)
    local off = offInLA(pl)
    if not off and not holdsInLA(pl) then return false end
    local before = whyNot
    whyNot = nil
    local ok = attempt(pl, off and 'off' or true)
    if not ok and a.lateSaid ~= gist(whyNot) then
      a.lateSaid = gist(whyNot)
      Tow.Fd.log(string.format('tow: %s to %s cannot begin and hold in the landing area either: %s', tostring(a.board), tostring(a.spot.name), tostring(whyNot)))
    end
    whyNot = before or whyNot
    return ok
  end
  -- (spread over frames too: its second result: it is still being worked out: the tow is not begun this frame)
  local function altPlan()
    if a.altCo or (a.altSig ~= M.sig and Tow.now() >= (a.altAt or 0)) then
      local function work()
        a.altSig, a.altAt = M.sig, Tow.now() + 15
        M.finderTug = mine
        a.altOth = others('deck', a, true)
        local p4, w4 = within(ENV_DECK, M.pullThrough, a, a.altOth, reach, fx, fz, nx, nz)
        M.finderTug = nil
        a.altPlan = type(p4) == 'table' and p4 or false
        if not a.altPlan then Tow.Fd.log(string.format('tow: %s into %s from behind through the landing area: not now: %s', tostring(a.board), tostring(a.spot.name), tostring(w4 or p4))) end
      end
      if CATCC_DEMO_NO_SLICE then
        work()
      elseif not M.sliced(a, 'altCo', work) then
        E.planning = true
        return nil, true
      end
    end
    return a.altPlan
  end
  local sixPack = not CATCC_DEMO_NO_THROUGH and tostring(a.spot.id):sub(1, 2) == 'SP'
  local altOnly = false
  -- (FROM BEHIND FIRST, where the backed-in way turns in front of this elevator's platform (M.holdsFront): the user,
  -- 2026-11-18: "in a lot of cases the elevator is waiting for nothing, or a different route that doesn't hold up
  -- the elevator could have been taken on the flight deck": elevator 2 stood up 7 minutes while its aircraft for
  -- Sixpack 6 was backed in in front of it. CATCC_DEMO_NO_FRONTFREE: a test's wish.)
  if sixPack and not CATCC_DEMO_NO_FRONTFREE and not plan.soft and (M.holdsFront(E, plan) or not CATCC_DEMO_NO_BEHINDFIRST) then
    local alt, altBusy = altPlan()
    if altBusy then return false, E.why or 'its tow is being worked out' end
    -- (not one of more than 140 m: round the far end of the row it is 205 m: three minutes: the rig, 2026-11-19)
    if alt and Tow.routeLen(alt.pull) <= 140 and (attempt(alt, false) or lateGo(alt)) then plan = alt end
    -- (THE BACKED-IN WAY ONLY IF THERE HAS BEEN NO WAY FROM BEHIND FOR A MINUTE (the user, 2026-11-19: "There's also no
    -- reason for it to be doing a push back onto the six pack (which blocks el 2 from descending longer than
    -- necessary) because the landing area is free for a pull through"; "If we are parking aircraft in the sixpack it
    -- means the LA is closed"): a way from behind that is only in use just now is waited for, hooked on)
    if alt and Tow.routeLen(alt.pull) <= 140 and not CATCC_DEMO_NO_BEHINDFIRST then
      a.altSeen = Tow.now()
      altOnly = true
    elseif a.altSeen and Tow.now() - a.altSeen < 60 and not CATCC_DEMO_NO_BEHINDFIRST then
      altOnly = true
    end
  end
  if altOnly and not tug then
    local before = whyNot
    if type(a.altPlan) == 'table' and not CATCC_DEMO_NO_NOSE then attempt(a.altPlan, 'nose') end
    if tug then plan = a.altPlan end
    whyNot = before or whyNot or 'its way from behind into the six-pack is not free yet'
  elseif not tug and not attempt(plan, false) and not lateGo(plan) then
    if sixPack then
      local alt, altBusy = altPlan()
      if altBusy then return false, E.why or 'its tow is being worked out' end
      if alt and (attempt(alt, false) or lateGo(alt)) then plan = alt end
    end
  end
  -- HOOKED ON AT ONCE (the user, 2026-11-19: "the two El 2 tugs wait to connect to their aircraft until El 1 tows are
  -- complete. No reason they couldn't already be connected the whole time"; in that run both stood at the noses, each
  -- in the way of the other's tow, were both sent off, and one aircraft was taken four minutes later): a tow whose
  -- way is in use begins all the same if its tractor has a way to the nose: it hooks on and STANDS THERE ON THE BAR
  -- until nothing a job that began before it needs at the same time lies on its way (giveWay: job.late == 'nose');
  -- every job that begins after it gives way to it. For a six-pack spot whose backed-in way turns in front of its
  -- own platform: the way from behind, if there is one.
  if not tug and not altOnly and not CATCC_DEMO_NO_NOSE and not plan.soft and plan.pull then
    local before, pl2 = whyNot, plan
    if sixPack and not CATCC_DEMO_NO_FRONTFREE and (M.holdsFront(E, plan) or not CATCC_DEMO_NO_BEHINDFIRST) then
      local alt, altBusy = altPlan()
      if altBusy then return false, E.why or 'its tow is being worked out' end
      if alt and Tow.routeLen(alt.pull) <= 140 then pl2 = alt end
    end
    whyNot = nil
    if attempt(pl2, 'nose') then
      plan = pl2
    elseif pl2 ~= plan and attempt(plan, 'nose') then
      pl2 = plan
    end
    -- (said, once for each reason: why it does not hook on at once)
    if not tug and a.noseSaid ~= gist(whyNot) then
      a.noseSaid = gist(whyNot)
      Tow.Fd.log(string.format('tow: %s to %s does not hook on at once either: %s', tostring(a.board), tostring(a.spot.name), tostring(whyNot)))
    end
    whyNot = before or whyNot
  end
  -- IT WAITS, ITS TRACTOR READY, FOR A WAY THAT IS IN USE: THE WAY IS KEPT FOR IT AGAINST EVERY TRACTOR BY ITSELF THAT
  -- WOULD SET OFF THROUGH IT (M.pending: by aircraft: its tow's circles, for the next 8 s; asked again every 4 s
  -- while it waits): 2026-11-19: in front of elevator 2 a tractor passed, or parked, every half minute (to a place
  -- in front of the elevator, to the pocket, home from a tow), and each put the two aircraft's tows off until it had
  -- passed: they stood 4 minutes 25 with their tractors ready. (A tractor's way keeps clear of it too: FIND.stamp.)
  M.pending = M.pending or {}
  if not tug and not CATCC_DEMO_NO_PENDING and E.state == 'up' and plan.pull and not plan.soft and tostring(whyNot):find('in use', 1, true) then
    local cs = { { a.x, a.z, 5.5 }, { a.x + fx * 5.2, a.z + fz * 5.2, 5.5 } }
    circles(cs, plan.pull, 6.0)
    if plan.push and plan.push.K then circles(cs, { plan.pull[#plan.pull], { plan.push.K[1], plan.push.K[2] }, { plan.dest.x, plan.dest.z } }, 6.0) end
    M.pending[a] = { cs = cs, at = Tow.now(), tug = mine, name = tostring(a.board) }
  elseif tug then
    M.pending[a] = nil
  end
  -- (an idle tractor that stands in its way: said to the elevator, which sends it off if none of its aircraft can go)
  if not tug then
    -- (its tractor stands ready and cannot begin for over 75 s: another's turn, for two and a half minutes)
    local mt = Tow.now()
    a.stuckAt = a.stuckAt or mt
    -- (ONLY WHERE THE TRACTOR ITSELF FINDS NO WAY TO THE AIRCRAFT (2026-11-19): where it is the tow's own way that is in
    -- use, another tractor is no nearer to beginning it: the one that stood ready on the nose line was then in the
    -- next one's way, was sent off, and the two aircraft of elevator 2's first trip stood for 3 minutes 45 while
    -- four tractors took turns)
    if mt - a.stuckAt > 75 and not tostring(whyNot):find('no way for', 1, true) then a.stuckAt = mt end
    if mt - a.stuckAt > 75 then
      a.badTug, a.stuckAt = { [mine] = mt + 150 }, nil
      logLine(string.format('demo: %s has stood ready for %s for 75 s and could not begin (%s): another tractor is asked', mine.name, tostring(a.board), gist(whyNot)))
    end
    return false, whyNot, nil, blocker
  end
  a.stuckAt = nil
  for _, t in ipairs(M.tugs) do
    if t.waitFor and (t == tug or t.waitFor.a == a) then
      if t.waitFor.a.waiter == t then t.waitFor.a.waiter = nil end
      t.waitFor = nil
    end
  end
  a.waiter = nil
  local w = newTow(tug, a, plan, arrive, { level = 'deck', env = ENV_DECK, others = plan.noKnown and a.altOth or othFor(nil), backOut = backOut })
  w.frontHitch = headOn or nil
  tug.d.hold = nil
  -- THE AIRCRAFT IS DELIVERED (the hook asks where the tractor goes next): all it held is given up but the place it
  -- stands on. Then (nextPlace): an aircraft of its section waits on a platform: it stays where it is and is given
  -- that tow at once (the user: the tractor that worked elevator 1 "should have just continued to work El 1"); its
  -- section has more to come: to where it waits for it; else to its place in the junkyard. Its way there clear of
  -- what the other tractors hold: until there is one it stands where it is and asks again every 3 s (after a minute:
  -- through what the others hold, if it must; after a minute and a half it moves 8 m on and stands)
  w.onFree = function(ww)
    local job = tug.job
    if not job then return nil end
    local mt = Tow.now()
    if ww.front then
      -- (from here on w.d is the tractor as it really stands: FACING the aircraft it has just left: it backs straight
      -- out 7 m, the way it came in on the push, before it drives off)
      ww.d.x, ww.d.z, ww.d.hx, ww.d.hz = Tow.real(ww)
      ww.front, ww.frontHitch, ww.wheels = nil, nil, nil
      job.backFirst = 7
    end
    if not job.delivered then
      job.delivered, job.homeSince = true, mt
      -- (the tractors its TOW was planned past, shape for shape, are not overlooked on its way from here: the rig,
      -- 2026-11-18: one of them had since stopped in the lane this tractor then took, and it drove past it 0.4 m off)
      job.known = nil
      job.seq, job.start, job.pull, job.keep = {}, {}, {}, { { ww.d.x, ww.d.z, 4 } }
      -- (and the line it backs out along)
      local B = job.backFirst
      if B then
        job.keep[2] = { ww.d.x - ww.d.hx * B / 2, ww.d.z - ww.d.hz * B / 2, 4 }
        job.keep[3] = { ww.d.x - ww.d.hx * B, ww.d.z - ww.d.hz * B, 4 }
      end
      job.t0, job.lag = mt, 0
      gather(job)
      changed()
    end
    if mt < (job.homeTry or 0) then return nil, nil, true end
    job.homeTry = mt + 3
    local dest = nextPlace(tug, mt)
    -- (where its way begins: where it stands, or B metres straight behind that)
    local B = job.backFirst
    local d0 = B and { x = ww.d.x - ww.d.hx * B, z = ww.d.z - ww.d.hz * B, hx = ww.d.hx, hz = ww.d.hz } or ww.d
    local function backs()
      if B then ww.solo, ww.startBack, ww.backOut = true, true, { len = B, s = 0, v = 0 } end
      job.backFirst = nil
    end
    if not dest then
      job.goal = nil
      if B then
        backs()
        return { { d0.x, d0.z }, { d0.x + d0.hx * 0.1, d0.z + d0.hz * 0.1 } }
      end
      return { { ww.d.x, ww.d.z }, { ww.d.x + ww.d.hx * 1.5, ww.d.z + ww.d.hz * 1.5 } }
    end
    local way, _, park, sq2, kp2, bh
    if job.escape and not CATCC_DEMO_NO_ROW then
      -- (IT STANDS IN A TOW'S WAY (M.escape): to where it was going, else to the nearest place aside it finds a way
      -- to: round what the others hold, however long, and at once; spread over frames)
      local function out()
        local w1, _, p1, s1, k1, b1 = soloPlan(tug, d0, dest, nil, Tow.now(), true)
        if w1 then return w1, p1, s1, k1, b1, dest end
        for _, c in ipairs(M.asideList(tug, d0.x, d0.z)) do
          w1, _, p1, s1, k1, b1 = soloPlan(tug, d0, c, nil, Tow.now(), true)
          if w1 then return w1, p1, s1, k1, b1, c end
        end
        return nil
      end
      local done, dst
      if CATCC_DEMO_NO_SLICE then
        done, way, park, sq2, kp2, bh, dst = true, out()
      else
        done, way, park, sq2, kp2, bh, dst = M.sliced(job, 'escCo', out)
        if not done then
          job.homeTry = mt
          return nil, nil, true
        end
      end
      if way then
        dest, job.escape = dst, nil
        logLine(string.format('demo: %s leaves the way of the tow: to %s', tug.name, placeText(dest, tug)))
      else
        -- (none now: asked again in 2 s; after a minute as any tractor that finds no way: below)
        job.homeTry = mt + 2
      end
    elseif CATCC_DEMO_NO_SLICE then
      way, _, park, sq2, kp2, bh = soloPlan(tug, d0, dest, job.homeSince, mt)
    else
      -- (spread over frames: until it has ended the tractor stands where it is and asks again the next frame)
      local done
      done, way, _, park, sq2, kp2, bh = M.sliced(job, 'homeCo', soloPlan, tug, d0, dest, job.homeSince, mt)
      if not done then
        job.homeTry = mt
        return nil, nil, true
      end
    end
    if not way and mt - job.homeSince > 60 then
      M.finderTug, M.finderFree = tug, true
      way, _, park = within(ENV_DECK, soloWay, d0, dest)
      M.finderTug, M.finderFree = nil, nil
      if way then sq2, kp2 = soloHold(d0, way, park) end
    end
    if way then
      -- (its clock begins again: what it holds now is its way from here)
      job.seq, job.keep, job.goal, job.park = sq2, kp2, dest, park
      if B then
        -- (c[12]: where it stood and backs out along: given up once it is 8 m off (letGo): they were held until it was
        -- home: the rig, 2026-11-19: the tractor that had unhooked beside it, in a tow's way, found no way out past
        -- them for 25 s after it had gone)
        local q1, q2 = { ww.d.x, ww.d.z, 3 }, { ww.d.x - ww.d.hx * B / 2, ww.d.z - ww.d.hz * B / 2, 3 }
        q1[12], q2[12] = true, true
        table.insert(job.keep, q1)
        table.insert(job.keep, q2)
      end
      job.t0, job.lag, job.after = mt, 0, afterOf(bh)
      ww.d.hold = nil
      gather(job)
      M.relWant = true
      backs()
      return way, TOW.fastSolo
    end
    -- (a staging place it cannot set off to now: not asked for again for 20 s: the next best is, in 3 s: a tractor
    -- that has delivered its aircraft does not stand where the tow ended waiting for one particular way)
    if dest ~= tug.home and not dest.wait then
      tug.avoid = tug.avoid or {}
      tug.avoid[dest] = mt + 20
    end
    if mt - job.homeSince <= 90 then return nil, nil, true end
    if B then
      logLine(string.format('demo: %s found no way to %s in 90 s: it backs %d m and stands', tug.name, placeText(dest, tug), B))
      backs()
      return { { d0.x, d0.z }, { d0.x + d0.hx * 0.1, d0.z + d0.hz * 0.1 } }
    end
    logLine(string.format('demo: %s found no way to %s in 90 s: it moves 8 m on and stands', tug.name, placeText(dest, tug)))
    return nil
  end
  local job = { level = 'deck', tug = tug, a = a, w = w, E = E, to = 'spot', seq = seq, start = start, pull = pull, keep = keep, t0 = Tow.now(), lag = 0, after = behind,
    known = (not plan.noKnown) and known or nil, pairE = E, tStart = tStart, tPull = tPull, tKeep = M.tKeepNew, late = later and (M.lateKind == 'nose' and 'nose' or true) or nil,
    tA = M.tANew, born = Tow.now(), vt = plan.vt,
    -- (stub: its tractor stood on the nose line already: its way to the aircraft is a few centimetres)
    stub = ((backOut or 0) == 0 and arrive and #arrive == 2 and hyp(arrive[1][1] - arrive[2][1], arrive[1][2] - arrive[2][2]) < 0.5) or nil }
  gather(job)
  tug.job, tug.place, tug.clearOff, a.towed, tug.done = job, nil, nil, true, (tug.done or 0) + 1
  M.jobs[#M.jobs + 1] = job
  changed()
  if plan.soft then
    M.notClear = (M.notClear or 0) + 1
    for i = 1, math.min(#M.tried, 30) do logLine('  tried: ' .. tostring(M.tried[i])) end
  end
  logLine(string.format('demo: %s takes %s off elevator %d to %s: %s; %d circles held', tug.name, a.name, E.k, tostring(a.spot.name), tostring(plan.text), #job.circles) .. M.behindText(job)
    .. ((later and M.lateKind == 'nose') and '; ITS WAY IS NOT FREE YET: it hooks on and stands on the bar where the aircraft is until it is'
      or (later and '; THE REST OF ITS WAY IS NOT FREE YET: it holds in the landing area with the aircraft on its bar until it is' or ''))
    .. (headOn and '; on its FRONT hitch (it comes at the nose head on)' or ''))
  return true
end

-- AN IDLE TRACTOR THAT IS IN THE WAY AND FINDS NO WAY TO A PLACE TO WAIT AT STEPS ASIDE: to open deck near by where it
-- is in nobody's way: 9 to 28 m off, on the deck 3 m from its edge, off the platforms and what lies 26 m in front of
-- them, 8 m from every aircraft's wheels, 11 m from every spot an aircraft is still to come to, 7 m from every
-- other tractor, and 3.5 m clear of all that any job holds, now or later. The nearest it finds a way to. (The rig,
-- 2026-11-18: a tractor that was called back in front of elevator 2, and one that was stood down beside it, found
-- no way to any place they wait at: the tows that needed where they stood waited for good.)
-- (M.asideLoose: FOR A TRACTOR THAT HAS TO LEAVE A TOW'S WAY and finds no place by the rules below (2026-11-19: at the
-- stern there is none: it is all landing area, spots that aircraft are still to come to, and the fronts of elevators
-- 3 and 4: a tractor that had unhooked at Port 5 (now Fantail 2) stood in the way of a tow off elevator 3 for 78 s in the rig, 84 s
-- in the user's run): the landing area too, a spot whose aircraft is still in the hangar, the way an aircraft that
-- still waits has been found, and the front of an elevator beyond 6 m: it stands there until it has a way on, not
-- to wait. Clear of all that any job in hand holds, of every aircraft and of every tractor as ever.)
function M.asideOk(c, t)
  local loose = M.asideLoose
  if not Tow.Fd.on(c.x, c.z, 3.0) then return false end
  -- (not in the landing area: the tows' own road aft; not within 9 m of the way an aircraft that waits has been found
  -- (its pull, its push, its spot); not within 10 m of where this tractor was sent off from in the last 3 minutes: the
  -- rig, 2026-11-18: one stepped aside 199 times, each time into the way of the same tow off elevator 3)
  if not loose and M.inLA(c.x, c.z, 2) then return false end
  -- (NOT WITHIN 9 m OF ANOTHER TRACTOR'S OWN PLACE: the rig, 2026-11-19, 4 times speed: one stepped aside to "open
  -- deck" 4.6 m in front of the first place in the junkyard: it stood in the way of every tractor that came home,
  -- was sent off through what the others held, on a way that touched the tractor parked in the next place, gave way
  -- to it, and the run stood for good with three tractors behind it)
  for _, o in ipairs(M.tugs) do
    if o ~= t and o.level == 'deck' and o.home and o.home.x and hyp(c.x - o.home.x, c.z - o.home.z) < 9 then return false end
  end
  local now = Tow.now()
  for _, q in ipairs(t.asideBad or {}) do
    if q[3] > now and hyp(c.x - q[1], c.z - q[2]) < 10 then return false end
  end
  for _, b in ipairs(M.aircraft) do
    if b.id and not b.parked and not b.towed and not loose then
      for _, pl in ipairs({ b.planKept or false, b.altPlan or false }) do
        if pl and pl.pull then
          for _, q in ipairs(pl.pull) do
            if hyp(c.x - q[1], c.z - q[2]) < 9 then return false end
          end
          local e, g = pl.pull[#pl.pull], pl.dest
          if g then
            local len = hyp(g.x - e[1], g.z - e[2])
            for u = 0, len, 4 do
              if hyp(c.x - (e[1] + (g.x - e[1]) * u / math.max(len, 0.1)), c.z - (e[2] + (g.z - e[2]) * u / math.max(len, 0.1))) < 9 then return false end
            end
          end
        end
      end
    end
  end
  for k = 1, 4 do
    local e = H.elevators[k]
    local za, zb = math.min(e.z[1], e.z[2]), math.max(e.z[1], e.z[2])
    if za > 0 then za = za - (loose and 6 or 26) else zb = zb + (loose and 6 or 26) end
    if c.x > e.x[1] - 4 and c.x < e.x[2] + 4 and c.z > za - 3 and c.z < zb + 3 then return false end
  end
  for _, a in ipairs(M.aircraft) do
    if a.id and a.level == 'deck' then
      for _, u in ipairs(FIND.along) do
        if hyp(c.x - (a.x + a.fx * u), c.z - (a.z + a.fz * u)) < 5.5 then return false end
      end
    end
    if a.id and a.spot and not a.parked and (not loose or a.towed or a.level ~= 'hangar') and hyp(c.x - a.spot.x, c.z - a.spot.z) < 11 then return false end
  end
  for _, o in ipairs(M.tugs) do
    if o ~= t and o.level == 'deck' and hyp(c.x - o.d.x, c.z - o.d.z) < 7 then return false end
  end
  for _, j in ipairs(M.jobs) do
    if j.level == 'deck' then
      for _, q in ipairs(j.circles or {}) do
        if hyp(c.x - q[1], c.z - q[2]) < q[3] + 3.5 then return false end
      end
    end
  end
  return true
end

function M.stepAside(t, mt, startMove, force)
  if mt < (t.asideTry or 0) then return false end
  t.asideTry = mt + 6
  -- (asideNone: it looked and found none, or could set off to none)
  t.asideNone = true
  local d = t.d
  local tried = 0
  -- (one that has to leave a tow's way (t.roundTill): also the places that are not for waiting at: M.asideList)
  if t.roundTill and mt < t.roundTill and not CATCC_DEMO_NO_ROW then
    local list = M.asideList(t, d.x, d.z)
    local whys = {}
    for _, c in ipairs(list) do
      local okm, whym = startMove(t, c, force)
      if okm then
        M.aside = (M.aside or 0) + 1
        t.asideNone = nil
        return true
      end
      whys[#whys + 1] = string.format('%.0f / %.0f: %s', c.x, c.z, tostring(whym))
    end
    if CATCC_DEMO_YIELD_LOG then logLine(string.format('demo: ASIDE %s: %d places: %s', t.name, #list, table.concat(whys, ' | '))) end
    return false
  end
  for _, r in ipairs(force and { 9, 14, 20, 28, 40, 55, 70 } or { 9, 14, 20, 28, 40 }) do
    for k = 0, 11 do
      local an = k * math.pi / 6
      local c = { x = d.x + r * math.cos(an), z = d.z + r * math.sin(an), aside = true }
      if tried < 5 and M.asideOk(c, t) then
        tried = tried + 1
        if startMove(t, c, force) then
          M.aside = (M.aside or 0) + 1
          t.asideNone = nil
          return true
        end
      end
    end
  end
  return false
end

-- the deck tractors that have nothing in hand: each to where it belongs (nextPlace), if it is not there
local function idleTugs(mt)
  for _, t in ipairs(M.tugs) do
    if t.level == 'deck' and not t.job and t.mustAside and mt < t.mustAside and not (t.homeGo and mt < (t.asideTry or 0)) then
      -- (it was stood down where it stood in another's way: aside first; after 15 s through what the others hold)
      local frc = mt > t.mustAside - 25 or (t.forceNext and mt < t.forceNext) or false
      t.asideNone = nil
      if M.stepAside(t, mt, startMove, frc) then
        t.mustAside, t.moveTry, t.homeGo = nil, mt + 15, nil
      elseif t.asideNone and (frc or (t.roundTill and mt < t.roundTill)) and not CATCC_DEMO_NO_ROW then
        -- (NO PLACE ASIDE (2026-11-19, the user's run: a tractor stood down out of a ring at the stern, two tows
        -- waiting for it with their aircraft on the bar, looked for a place aside for 40 s before it set off): to
        -- where it belongs, now)
        -- (and a place aside is looked for again every 3 s meanwhile: t.homeGo: one may be free the next moment: the
        -- rig: the tractor beside it, which had also unhooked, drove off 3 s later)
        t.homeGo, t.moveTry, t.asideTry = true, mt, mt + 3
      end
    elseif t.level == 'deck' and not t.job and mt >= (t.moveTry or 0) and not shutIn(t) then
      local want = nextPlace(t, mt)
      local gone = false
      if want and t.place ~= want then
        local okm, why, busy
        if CATCC_DEMO_NO_SLICE then
          okm, why = startMove(t, want, (t.forceNext and mt < t.forceNext) or nil)
        else
          -- (spread over frames: still at it: asked again the next frame)
          local done
          done, okm, why = M.sliced(t, 'moveCo', startMove, t, want, (t.forceNext and mt < t.forceNext) or nil)
          busy = not done
        end
        if okm then t.forceNext = nil end
        if okm and t.homeGo then t.homeGo, t.mustAside = nil, nil end
        t.moveTry = mt + ((okm or busy) and 0 or 3)
        t.stuckAt = (not okm and not busy) and (t.stuckAt or mt) or ((busy and t.stuckAt) or nil)
        gone = okm or busy
        if okm then
          t.moveSaid = nil
        elseif busy then
          t.moveSaid = t.moveSaid
        else
          -- (a staging place it finds no way to: not asked for again for two minutes)
          if not want.wait and want ~= t.home then
            t.avoid = t.avoid or {}
            t.avoid[want] = mt + (tostring(why):find('no way', 1, true) and 120 or 20)
          end
          if t.moveSaid ~= gist(why) then
            t.moveSaid = gist(why)
            logLine(string.format('demo: %s cannot set off to %s yet: %s', t.name, placeText(want, t), tostring(why)))
          end
        end
      elseif t.clearOff then
        -- (it is to clear off, and the only place it has is the one it stands on)
        t.stuckAt = t.stuckAt or mt
        t.moveTry = mt + 3
      else
        t.stuckAt = nil
      end
      -- IT IS IN THE WAY (clearOff) AND HAS FOUND NO WAY TO A PLACE FOR 6 s: it steps aside (M.stepAside); for 20 s: the
      -- tractors by themselves near it are stood down (a jam); for 25 s: it steps aside THROUGH WHAT THE OTHERS HOLD, as
      -- far as 70 m off, and they give way to it. (The rig, 2026-11-18: after a tow into the six-pack from behind the
      -- tractor stood in the street between the six-pack and the corral, a tow that waited for it on one side: every
      -- way out was through what that tow held, and nothing moved again.)
      local stuck = mt - (t.stuckAt or mt)
      if not gone and t.clearOff and stuck >= 6 and not CATCC_DEMO_NO_ASIDE then
        if M.stepAside(t, mt, startMove, stuck >= 25) then
          t.moveTry, t.moveSaid, t.stuckAt = mt + 20, nil, nil
        elseif stuck >= 30 and mt >= (t.homeForceAt or 0) and not CATCC_DEMO_NO_HOMEFORCE and t.place ~= t.home and startMove(t, t.home, true) then
          -- (FOR 30 s: TO ITS OWN PLACE THROUGH WHAT THE OTHERS HOLD (2026-11-19: the rig, the player's jet on elevator 1:
          -- a tractor that waited on an empty spot beside elevator 4 stood in the way of a tow off it for three
          -- minutes: its way to the junkyard was in use, and there was no place aside within reach))
          logLine(string.format('demo: %s, in the way for %.0f s with no way out and no place aside, sets off for its own place through what the others hold', t.name, stuck))
          t.moveTry, t.moveSaid, t.stuckAt = mt + 20, nil, nil
        elseif stuck >= 20 and mt >= (t.jamAt or 0) then
          t.jamAt = mt + 30
          if stuck >= 30 then t.homeForceAt = mt + 10 end
          local list = {}
          for _, j in ipairs(M.jobs) do
            if j.level == 'deck' and j.tug ~= t and hyp(j.w.d.x - t.d.x, j.w.d.z - t.d.z) < 30 and not (j.park and j.park.step)
              and (j.move or j.delivered or (not j.freed and (j.w.phase == 'arrive' or j.w.phase == 'backout'))) then list[#list + 1] = j end
          end
          for _, j in ipairs(list) do
            logLine(string.format('demo: %s is boxed in (it stands in the way of a tow and finds no way out): %s, by itself near it, is stood down', t.name, j.tug.name))
            M.jam = (M.jam or 0) + 1
            M.standDown(j, mt)
          end
        end
      end
    end
  end
end

-- ---------------------------------------------------------------- the elevators
-- an elevator's trips from trip `from` on: those of its list that go on to a deck spot, two a trip; then the two that stay
function M.retrip(E, from)
  for i = #E.trips, from, -1 do E.trips[i] = nil end
  local left = 0
  for _, ld in ipairs(E.pool) do
    if not ld.taken then left = left + 1 end
  end
  while left > 0 do
    E.trips[#E.trips + 1] = { pool = true, size = math.min(2, left), on = {} }
    left = left - 2
  end
  if #E.stay > 0 then E.trips[#E.trips + 1] = { stay = true, size = #E.stay, on = {} } end
end

local function drop(k, f)
  -- how far a platform is down for its model argument
  local keys = H.keys
  f = math.max(0, math.min(1, f))
  for i = 2, #keys do
    if f <= keys[i][1] then
      local a, b = keys[i - 1], keys[i]
      return a[2] + (b[2] - a[2]) * (f - a[1]) / math.max(1e-9, b[1] - a[1])
    end
  end
  return keys[#keys][2]
end

-- why an elevator waits: kept, and in the log when it is a new reason. It is looked at again when something has
-- changed (M.sig), or after `again` seconds (30: nothing is planned over and over while nothing moves)
local function waits(E, why, mt, again)
  E.why, E.retry, E.sig, E.rel = why, mt + (again or 30), M.sig, M.rel
  if gist(why) ~= E.said then
    E.said = gist(why)
    logLine(string.format('demo: elevator %d (%s) waits: %s', E.k, E.state, tostring(why)))
    -- (what the planners tried, when it is a tow that was not found)
    if tostring(why):find('no tow', 1, true) or tostring(why):find('no way', 1, true) then
      -- (CATCC_DEMO_TRIED: a test's wish: more of them)
      for i = math.max(1, #M.tried - (CATCC_DEMO_TRIED or 30) + 1), #M.tried do logLine('  tried: ' .. tostring(M.tried[i])) end
    end
  end
end

-- THE HANGAR'S SIDE OF AN ELEVATOR, one job in motion at a time. The trip's aircraft (the next of its list):
--   the platform down: one that waits short of the door is pushed on (startPush); else the next is towed onto it;
--   the platform up or coming up: the next trip's are drawn up short of the door (hangarSearch, ready).
-- Returns how many of the trip stand on the platform.
-- ---------------------------------------------------------------- one tow behind another in the hangar
-- (free: the metres of its own sweep that must be clear of the one it follows for it to begin; look: how far ahead
-- of its tractor, along its own way, it looks for what that one still holds)
-- (more: how much further it looks before it goes on again; gap: what is kept between the two's circles)
M.FOLLOW = { free = 12, look = 10, every = 0.5, more = 6, gap = 1.5 }

-- a hangar tow that another may follow: under way (hooked on, pulling or pushing) onto a platform that is down
function M.followable(j)
  if CATCC_DEMO_NO_HFOLLOW then return false end
  if j.level ~= 'hangar' or j.to ~= 'el' or j.held or j.freed or j.shift or not j.a or not j.load or not j.load.st or not j.E then return false end
  -- (from the moment it hooks on: the tow that would follow is then planned, and begins when its first metres are clear)
  local w = j.w
  local ph = w.phase
  return ph == 'lift' or ph == 'backup' or ph == 'hooked' or (w.bar == 'both' and (ph == 'pull' or ph == 'push'))
end

-- the circles of a sweep that mark its tractor's track (its own discs of 2.6 m, its pull's of 5.5 m), from index i0:
-- { index, metres along } each
function M.markers(cs, i0)
  local out, run, px, pz = {}, 0, nil, nil
  for i = i0, #cs do
    local c = cs[i]
    if c[3] == 2.6 or c[3] == 5.5 then
      if px then run = run + hyp(c[1] - px, c[2] - pz) end
      px, pz = c[1], c[2]
      out[#out + 1] = { i, run }
    end
  end
  return out
end

-- how many of a sweep's circles lie within M.FOLLOW.free metres of its beginning
function M.followFrom(sweep)
  local trk = M.markers(sweep, 1)
  for _, q in ipairs(trk) do
    if q[2] >= M.FOLLOW.free then return q[1] end
  end
  return #sweep
end

-- are the first `from` circles of a sweep clear of all that a job still holds
function M.followOk(sweep, j, from)
  for i = 1, math.min(from, #sweep) do
    local a = sweep[i]
    for _, b in ipairs(j.circles) do
      if b[3] > 0 then
        local d = a[3] + b[3] + M.FOLLOW.gap
        if (a[1] - b[1]) ^ 2 + (a[2] - b[2]) ^ 2 < d * d then return false end
      end
    end
  end
  return true
end

-- A TOW THAT FOLLOWS (job.after): twice a second, once it is under way: does what it sweeps over the next M.FOLLOW.look
-- metres of its tractor's way touch anything the one ahead still holds? It stops (a pull: braked; a push: w.pushStop,
-- as short of a door) and goes on when that has been given up. One ahead that stands on its platform is not followed
-- any more.
function M.followTick(job, mt)
  if mt < (job.folT or 0) then return end
  job.folT = mt + M.FOLLOW.every
  local w, cs, trk = job.w, job.circles, job.trk
  for A in pairs(job.after) do
    -- (nor one whose aircraft stands on the platform: this tow was planned against it there; its tractor, still at
    -- that aircraft's nose, waits for THIS one to pass before it can drive off: the rig, 2026-11-19: 154 s)
    -- (it stands there from the moment its tow ends (it unhooks, and its tractor can only drive off when this one
    -- has passed): no longer pulling or pushing)
    if A.freed or A.tug.job ~= A or not A.a or (A.load and A.load.done) or A.a.level ~= 'hangar' or (A.w.phase ~= 'pull' and A.w.phase ~= 'push') then job.after[A] = nil end
  end
  if not (w.bar == 'both' and (w.phase == 'pull' or w.phase == 'push')) or not trk or #trk == 0 then return end
  local d = w.d
  local bi, bd = job.folI or 1, nil
  for k = math.max(1, (job.folI or 1) - 2), math.min(#trk, (job.folI or 1) + 14) do
    local c = cs[trk[k][1]]
    local dd = (c[1] - d.x) ^ 2 + (c[2] - d.z) ^ 2
    if not bd or dd < bd then bi, bd = k, dd end
  end
  job.folI = bi
  local k2 = bi
  local look = M.FOLLOW.look + (job.folHold and M.FOLLOW.more or 0)
  while k2 < #trk and trk[k2][2] - trk[bi][2] < look do k2 = k2 + 1 end
  local i1, i2 = trk[math.max(1, bi - 1)][1], (k2 < #trk) and trk[k2][1] or #cs
  local stop
  for A in pairs(job.after) do
    local ac = A.circles
    for i = i1, i2 do
      local a = cs[i]
      if a[3] > 0 and not stop then
        for bidx = (A.wayN or 0) + 2, #ac do
          local b = ac[bidx]
          if b[3] > 0 then
            local dd = a[3] + b[3] + M.FOLLOW.gap
            if (a[1] - b[1]) ^ 2 + (a[2] - b[2]) ^ 2 < dd * dd then
              stop = A
              break
            end
          end
        end
      end
    end
  end
  if stop then
    if not job.folHold then
      job.folHold = mt
      M.folHolds = (M.folHolds or 0) + 1
      logLine(string.format('demo: %s with %s has come up behind %s: it stops and waits', job.tug.name, tostring(job.a.board), stop.tug.name))
    end
    if w.phase == 'pull' then
      d.hold = true
    elseif w.pushAt and not job.folStop then
      job.folStop = w.pushAt.s + (w.pushAt.v or 0) ^ 2 / (2 * TOW.accel) + 0.05
      w.pushStop = job.folStop
    end
  elseif job.folHold then
    logLine(string.format('demo: %s with %s goes on (it waited behind for %.0f s)', job.tug.name, tostring(job.a.board), mt - job.folHold))
    job.folHold = nil
    d.hold = nil
    if job.folStop then w.pushStop, job.folStop = nil, nil end
  end
end

-- THE NEXT AIRCRAFT OF A TRIP MAY BE BEGUN WHILE THE ONE BEFORE IS ON ITS WAY: a tractor other than the elevator's own
-- waits at its nose (CATCC_DEMO_HSECOND: or any idle tractor that may help this elevator)
function M.secondBy(E, trip)
  local own = M.tugOf and M.tugOf[E.k]
  for _, ld in ipairs(trip.pool and E.pool or E.stay) do
    if not ld.taken then
      local cl = ld.claim
      if cl and cl ~= own and not cl.job and cl.claim and cl.claim.ld == ld then return true end
      break
    end
  end
  if CATCC_DEMO_HSECOND then
    for _, t in ipairs(M.tugs) do
      if t.level == 'hangar' and not t.job and t ~= own and M.mayHelp(t, E) then return true end
    end
  end
  return false
end

-- AN ELEVATOR OPPOSITE THIS ONE (across the hangar: 3 and 4) THAT IS DOWN AND STILL HAS AIRCRAFT TO BRING for the trip it
-- is taking on: an aircraft drawn up to this one's door, its tractor on the bar, reaches from the door 26 m across the
-- hangar, which is 43 m wide there: every aircraft of the other elevator is drawn out through that place before it
-- is pushed onto its platform. (The rig and the user's run, 2026-11-19: elevator 4's third aircraft stood at its door
-- from 6:53 until the platform came down at 10:50, and elevator 3's fourth could not be drawn out until then, with
-- its platform down and waiting since 8:14: every minute elevator 4 stayed up on the flight deck was a minute lost
-- for elevator 3 too, and for all that follows it below.) Five minutes at the most. CATCC_DEMO_NO_DOORWAIT: off.
function M.doorWaits(E, mt)
  if CATCC_DEMO_NO_DOORWAIT then return nil end
  local e = H.elevators[E.k]
  for _, P in ipairs(M.elevators) do
    local p = H.elevators[P.k]
    if P ~= E and p and e and p.x[1] < e.x[2] and e.x[1] < p.x[2] and (p.z[1] + p.z[2]) * (e.z[1] + e.z[2]) < 0 then
      local tp = P.trips[P.trip]
      local need = false
      if tp and (P.state == 'down' or P.state == 'lowering') then
        if #tp.on < tp.size then need = true end
        for _, ld in ipairs(tp.on) do
          if not ld.done and not ld.held then need = true end
        end
      end
      -- (the five minutes: from when this was first asked of it, in one go: asked again after 10 s and more: anew)
      if need then
        if not P.needSince or mt - (P.needSeen or -1e9) > 10 then P.needSince = mt end
        P.needSeen = mt
        if mt - P.needSince < 300 then return P end
      else
        P.needSince = nil
      end
    end
  end
  return nil
end

function M.feedBelow(E, trip, mt)
  local started, done, moving, held = #trip.on, 0, 0, nil
  for _, ld in ipairs(trip.on) do
    if ld.done then done = done + 1 elseif ld.held then held = held or ld else moving = moving + 1 end
  end
  E.wantsTug = nil
  if E.state == 'down' then
    -- (one on its way to the door on a push that would stop there: it need not stop)
    for _, ld in ipairs(trip.on) do
      if not ld.done and not ld.held and ld.job and ld.job.door and ld.job.to == 'ready' then pushOn(E, ld) end
    end
    if moving == 0 and held then
      startPush(E, held)
    elseif moving == 0 and started < trip.size then
      local r, why = hsearch(E, trip, false)
      -- (still looking, or with a tow found and no tractor idle)
      E.wantsTug = (r == 'busy' or (r == nil and why == 'no tractor is idle')) or nil
      if r == true then
        E.why, E.said, E.shortAt = nil, nil, nil
      elseif r == nil then
        waits(E, why or 'no aircraft left for this trip', mt)
        -- (one aboard and no second that can come: after 40 s it goes up with the one; at once if the second's
        -- place on the platform is the one that is taken)
        if trip.pool and done >= 1 then
          E.shortAt = E.shortAt or mt
          -- (THE USER'S ORDER COMES UP IN PAIRS (2026-11-18: each aircraft has its side of the platform): a second one
          -- that is only held up for a while (the way to it or its own way is in use, no tractor is idle or finds
          -- its way just now) is waited for five minutes, not forty seconds)
          local w0 = tostring(why or '')
          local soon = w0:find('in use', 1, true) or w0:find('no tractor is idle', 1, true) or w0:find('no way for', 1, true) or w0:find('stands in the way', 1, true)
          if (E.search and E.search.full) or mt - E.shortAt > (soon and 300 or 40) then
            logLine(string.format('demo: elevator %d goes up with %d aircraft: %s', E.k, done, (E.search and E.search.full) and 'the next of its list has the same place on the platform' or 'no other of its list can be towed yet'))
            trip.size, E.shortAt = done, nil
            M.retrip(E, E.trip + 1)
          end
        end
      end
    elseif moving >= 1 and started < trip.size and not CATCC_DEMO_NO_HFOLLOW and M.secondBy(E, trip) then
      -- THE NEXT AIRCRAFT OF THE TRIP WHILE THE ONE BEFORE IS STILL ON ITS WAY ONTO THE PLATFORM, by the tractor that waits
      -- at its nose (the user, 2026-11-19: "The final tow out of the hangar still takes way too long ... tugs should
      -- be pushing their aircraft into a queue near the elevators, not waiting until every other tow is complete
      -- before starting to move their aircraft"): it follows the one before down the hangar
      local r, why = hsearch(E, trip, false, true)
      if r == true then
        E.why, E.said, E.secWhy = nil, nil, nil
      elseif r == nil and why and E.secWhy ~= why then
        E.secWhy = why
        logLine(string.format('demo: elevator %d (down): its next aircraft does not follow the one before yet: %s', E.k, tostring(why)))
      end
    end
  elseif (E.state == 'up' or E.state == 'raising') and moving == 0 and started < trip.size and M.doorWaits(E, mt) then
    if E.preWhy ~= 'opposite' then
      E.preWhy = 'opposite'
      logLine(string.format('demo: elevator %d (%s): nothing is drawn up to its door yet: elevator %d, opposite it, is down and has aircraft to bring: one that stood at this door would stand across their way', E.k, E.state, M.doorWaits(E, mt).k))
    end
  -- (ALSO WHILE THE PLATFORM IS ON ITS WAY DOWN (2026-11-19): the 21 s it takes were lost on every trip, the first above
  -- all: nothing began until it was down. A tow that is on its way to the door when the platform is down does not
  -- stop there (pushOn). Not held back for the elevator opposite (M.doorWaits) then.
  -- OFF (CATCC_DEMO_LOWERDRAW switches it on): the first aircraft are on their platforms sooner with it (elevator 3's
  -- at 0:49 for 1:01, elevator 4 up at 3:33 for 4:27), but in the rig at real time the whole took 16.8 to 17.9
  -- minutes with it for 16.4 to 17.8 without (more aircraft are up at once than the deck's six tractors take), and
  -- two aircraft in tow came within 1.4 m of each other in the hangar once (elevators 3 and 4 begin together).)
  elseif (E.state == 'up' or E.state == 'raising' or (E.state == 'lowering' and CATCC_DEMO_LOWERDRAW)) and moving == 0 and started < trip.size then
    local r, why = hsearch(E, trip, true)
    -- (said once for each reason: why nothing is drawn up to its door)
    if r == nil and why and E.preWhy ~= why then
      E.preWhy = why
      logLine(string.format('demo: elevator %d (%s): nothing is drawn up to its door yet: %s', E.k, E.state, tostring(why)))
    elseif r == true then
      E.preWhy = nil
    end
  end
  return done
end

local function tickElevator(E, ctx, mt)
  local e = H.elevators[E.k]
  local f = Tow.Aux.platform(ctx, E.k)
  if f then E.f = f end
  local top = e.top - drop(E.k, E.f or 0)
  -- whoever stands on it goes with it
  if E.state == 'lowering' or E.state == 'raising' then
    for _, a in ipairs(E.riders) do
      a.y = top + DY
      placeAircraft(a)
    end
    -- (said once if it takes long: what its argument reads)
    if mt - E.t0 > 60 and not E.slow then
      E.slow = true
      logLine(string.format('demo: elevator %d has been %s for a minute: the argument of its platform reads %s', E.k, E.state, tostring(f)))
    end
    if E.state == 'lowering' and (E.f or 0) >= 0.99 then
      E.state = 'down'
      changed(true)
      logLine(string.format('demo: elevator %d is down (%.0f s)', E.k, mt - E.t0))
    elseif E.state == 'raising' and (E.f or 1) <= 0.01 then
      E.state = 'up'
      M.raiseT = math.max(10, math.min(40, mt - E.t0))
      changed(true)
      for _, a in ipairs(E.riders) do
        a.y, a.level = DECK_Y + DY, 'deck'
        placeAircraft(a)
        -- (the two that stay on it stand on their deck spots now: bars away, covers off)
        if E.staying then
          spotted(a)
          a.stayed = true
        end
      end
      logLine(string.format('demo: elevator %d is up (%.0f s) with %d aircraft%s', E.k, mt - E.t0, #E.riders, E.staying and ': they stay on it (its two deck spots)' or ''))
      -- (CATCC_DEMO_HANGAR_ONLY: a test's switch, to look at the hangar alone: what comes up stands on its deck spot
      -- at once, with no tow across the deck)
      if CATCC_DEMO_HANGAR_ONLY and not E.staying then
        for _, a in ipairs(E.riders) do
          a.x, a.z, a.fx, a.fz = a.spot.x, a.spot.z, unit(a.spot.fx, a.spot.fz)
          a.level, a.parked = 'deck', true
          M.moved = (M.moved or 0) + 1
          spotted(a)
          placeAircraft(a)
        end
        E.riders = {}
        changed(true)
      end
    end
  end
  -- (gated: nothing has changed since it last found it could not go on: neither the deck (M.sig) nor what the
  -- tractors hold of it (M.rel))
  -- (nor is a tow of its aircraft still being worked out over the frames: E.planning)
  local gated = mt < (E.retry or 0) and E.sig == M.sig and E.rel == M.rel and not E.planning
  E.planning = nil
  local trip = E.trips[E.trip]
  local doneBelow = trip and M.feedBelow(E, trip, mt) or 0
  if E.state == 'up' then
    -- its aircraft are taken off one at a time, the one whose spot is furthest from the elevator first (outside in);
    -- an elevator's last two stay
    if #E.riders > 0 and not E.staying then
      if not (E.busy and CATCC_DEMO_ONE_WAITS) and not gated then
        -- (the furthest first; but one whose tow is clear of every other aircraft before one whose tow is not)
        local order = {}
        for _, a in ipairs(E.riders) do
          -- (not one that waits for another to stand on its spot first: LOADS' `after`)
          if not a.towed and not M.waitsFor(a) then order[#order + 1] = a end
        end
        local mid = (e.x[1] + e.x[2]) / 2
        table.sort(order, function(p, q) return math.abs(p.spot.x - mid) > math.abs(q.spot.x - mid) end)
        local okj, why, blocker
        for pass = 1, 2 do
          for _, a in ipairs(order) do
            local w2, soft, bl
            okj, w2, soft, bl = startDeckJob(E, a, pass == 1)
            -- (CATCC_DEMO_START_LOG: the rig's: every try and why it did not begin, once a second for each aircraft)
            if CATCC_DEMO_START_LOG and not okj and mt >= (a.startLogAt or 0) then
              a.startLogAt = mt + 1
              logLine(string.format('demo: START elevator %d, %s, pass %d: %s%s', E.k, tostring(a.board), pass, tostring(w2), soft and ' (soft)' or ''))
            end
            if okj then break end
            blocker = blocker or bl
            if not soft then why = why or w2 end
          end
          -- (none is clear: the furthest goes, and says so; but not while one only waits for a tractor or a free way)
          if okj or why then break end
        end
        if okj then
          E.why, E.said, E.mateAt = nil, nil, nil
        elseif #order > 0 then
          -- (NOT THE TRACTOR THAT STANDS AT THE NOSE OF THIS PLATFORM'S OTHER AIRCRAFT AND IS FOR IT, for the first 60 s:
          -- it leaves with that aircraft. 2026-11-19, elevator 2's first trip: the tractor for the forward aircraft
          -- stood in the way of the after aircraft's pull, its own tow waited 60 s for a tractor that was to pass;
          -- it was sent off, the aircraft was marked as one nobody waits for, the tractors were dealt out again, and
          -- the two aircraft stood on the platform for five minutes.)
          local mate = blocker and blocker.waitFor and blocker.waitFor.E == E and not blocker.waitFor.a.towed and not CATCC_DEMO_NO_MATE
          if mate then
            E.mateAt = E.mateAt or mt
            if mt - E.mateAt > 60 then mate = false end
          end
          if blocker and not mate then shoo(blocker, 'a tow off elevator ' .. E.k) end
          -- (asked again in 4 s: a way that is in use now is free when the other has passed: time alone clears it)
          waits(E, why or 'no tow', mt, 4)
        end
      end
      return
    end
    -- (down for its next aircraft: not under a tractor's way)
    if #E.riders == 0 and trip and not E.busy and mt >= (E.cmdAt or 0) then
      -- (WHAT IS STILL TO COME OVER THE PLATFORM ITSELF (its rectangle and 1.5 m): a tow as its own width (M.tightNow:
      -- 4.6 m, and of what it holds wider no more than 5 m), a tractor by itself as what it holds; only what is not
      -- yet behind it. Until 2026-11-19: anything a tractor held within 16 m of the platform's middle: a platform
      -- stayed up for every tow that passed in front of it (the user, 2026-11-18: "in a lot of cases the elevator is
      -- waiting for nothing"): elevator 2 stood up 7.8 minutes for two aircraft that had left it in two.)
      local under, underJob
      local x1, x2 = e.x[1] - 1.5, e.x[2] + 1.5
      local z1, z2 = math.min(e.z[1], e.z[2]) - 1.5, math.max(e.z[1], e.z[2]) + 1.5
      for _, j in ipairs(M.jobs) do
        if j.level == 'deck' then
          local tj = (j.t0 or 0) + (j.lag or 0)
          -- (THE PUSH AND THE SPOT of a tow not yet delivered (job.keep: 9 m about the push's line and the spot): as the
          -- aircraft's own width, 4.4 m about that line, against the platform's rectangle itself: 2026-11-19: with
          -- 5 m against the rectangle and 1.5 m every platform stayed up until the last aircraft off it was PARKED,
          -- 2.3 to 4.7 minutes after that tow began, for a spot beside it that nothing crosses the platform to reach
          -- (the user, 2026-11-18: "elevators only return to the hangar deck once the last aircraft to be towed off
          -- of it has reached its destination, instead of once the aircraft is clear of the elevator boundary").
          -- A pull's circle counts as behind 10 s sooner: it is held 22 s after the tractor has passed it for the
          -- aircraft behind the tractor, which has passed it in 12.)
          -- (ITS PULL: only what lies ahead of the aircraft's tail: the circles the tow has not yet given up behind it
          -- (job.pull: letGo), and of those behind the aircraft's middle only what is within 10 m of it: the tight
          -- circles (job.tPull) are never given up, only timed: a platform stayed up for "its pull near 34 / 16", the
          -- circle at the aircraft's nose, until the aircraft was parked: the rig, 2026-11-19)
          local kset, pset, list
          if not CATCC_DEMO_WIDE_UNDER and not CATCC_DEMO_NO_TIGHTUNDER and j.tPull and j.keep and not j.delivered and not j.freed then
            kset, pset, list = {}, {}, {}
            -- (its way to the aircraft: not once it pulls: the last two circles of it are never given up)
            if j.w.phase ~= 'pull' and j.w.phase ~= 'push' then
              for _, q in ipairs(j.seq or {}) do list[#list + 1] = q end
            end
            if not j.startGone then for _, q in ipairs(j.tStart or {}) do list[#list + 1] = q end end
            local pl, w, bi, best = j.pull or {}, j.w, 0, nil
            local moving = w.jx and (w.phase == 'pull' or w.phase == 'push')
            if moving then
              for i = 1, #pl do
                local dd = (pl[i][1] - w.jx) ^ 2 + (pl[i][2] - w.jz) ^ 2
                if not best or dd < best then best, bi = dd, i end
              end
            end
            for i, q in ipairs(pl) do
              if w.phase ~= 'push' and i >= bi then
                list[#list + 1] = q
                pset[q] = true
              end
            end
            -- (and the aircraft where it is now: 3.5 m about four points along it: a tow may stand in front of the
            -- platform it came off, waiting for another to pass)
            if moving and w.jfx then
              for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do
                local q = { w.jx + w.jfx * u, w.jz + w.jfz * u, 3.5 }
                q[9] = true
                list[#list + 1] = q
                kset[q] = true
              end
            end
            for _, q in ipairs(j.keep) do
              kset[q] = true
              list[#list + 1] = q
            end
          end
          -- (A TRACTOR ON ITS WAY TO ITS OWN PLACE IN THE JUNKYARD: not the last 8 m of that way: with eight tractors
          -- the junkyard's last place is 0.86 m from elevator 3's forward edge, and the tractor that backed into it
          -- kept the platform up for a minute each time: the rig, 2026-11-19)
          local hm = (j.move or j.delivered) and j.goal and j.goal == j.tug.home and not j.goal.pocket and j.goal or nil
          for _, c in ipairs(list or (CATCC_DEMO_WIDE_UNDER and j.circles) or M.tightNow(j)) do
            local isKeep = kset and kset[c]
            if hm and hyp(c[1] - hm.x, c[2] - hm.z) < 8 then
              -- (its own place: see above)
            elseif not c[5] or (pset and pset[c]) or tj + c[5] > mt then
              local tight = isKeep or (pset and pset[c])
              local r = CATCC_DEMO_WIDE_UNDER and c[3] + 8 or math.min(c[3], tight and 3.5 or 5)
              -- (a tractor by itself: its way within 1.7 m of the platform's edge: not 2.9: one that stood giving way
              -- in front of elevator 3, on its way to the junkyard beside it, kept the platform up for three minutes
              -- after its last aircraft was parked: the rig, 2026-11-19)
              local m = (not CATCC_DEMO_WIDE_UNDER and (j.move or j.delivered)) and 1.2 or (tight and 1.5 or 0)
              local nx, nz = math.max(x1 + m, math.min(x2 - m, c[1])), math.max(z1 + m, math.min(z2 - m, c[2]))
              if (c[1] - nx) ^ 2 + (c[2] - nz) ^ 2 < r * r then
                under, underJob = j.tug.name, j
                E.underWhat = string.format("%s near %.0f / %.0f", (c[9] and "the aircraft on its bar") or (isKeep and "its push or spot") or ((pset and pset[c]) and "its pull") or ((j.move or j.delivered) and "its way") or "its way to the aircraft, or the aircraft", c[1], c[2])
              end
            end
          end
        end
      end
      -- (A TRACTOR BY ITSELF THAT HAS STOOD GIVING WAY FOR 20 s WITH ITS WAY OVER THE PLATFORM IS STOOD DOWN: it steps
      -- aside, and the platform goes down: the rig, 2026-11-19: one on its way home stood in front of elevator 3 for
      -- three minutes, giving way to tows, and the platform stayed up for it)
      if underJob and (underJob.move or underJob.delivered) and not underJob.force and not (underJob.park and underJob.park.step)
        and underJob.w.d.hold and (underJob.w.d.v or 0) == 0 and underJob.yieldAt and mt - underJob.yieldAt > 20 and not CATCC_DEMO_NO_UNDERDOWN then
        logLine(string.format('demo: %s, by itself, has stood for %.0f s with its way over elevator %d, which is to go down: it is stood down and steps aside', underJob.tug.name, mt - underJob.yieldAt, E.k))
        local tg = underJob.tug
        M.standDown(underJob, mt)
        shoo(tg, 'elevator ' .. E.k .. ', which is to go down')
      end
      -- (AND EVERY TRACTOR WHERE IT IS NOW, in hand or idle: one that stands on the platform or within 1.5 m of it (it
      -- came at an aircraft's nose head on, on the platform's inboard edge, and was called back or stood down there)
      -- is sent off; the platform waits for it)
      -- (NOT ONE THAT STANDS IDLE ON ITS OWN PLACE: with eight tractors the junkyard's last place is 0.86 m from
      -- elevator 3's forward edge, inside this test's metre: the platform stayed up for the tractor that stood there,
      -- for good: the rig, 2026-11-19)
      for _, t in ipairs(M.tugs) do
        if t.level == 'deck' and not (not t.job and t.place and t.place == t.home) then
          for _, q in ipairs(tugDiscs(t)) do
            -- (the platform's own rectangle and 0.3 m: the pocket by the island is 1.6 m from elevator 2's platform:
            -- with 1.5 m the tractor whose place it is kept elevator 2 up at the start)
            local nx, nz = math.max(x1 + 1.2, math.min(x2 - 1.2, q[1])), math.max(z1 + 1.2, math.min(z2 - 1.2, q[2]))
            if (q[1] - nx) ^ 2 + (q[2] - nz) ^ 2 < q[3] * q[3] then
              under = t.name
              E.underWhat = "it stands there"
              if not t.job then shoo(t, 'elevator ' .. E.k .. ', which is to go down') end
            end
          end
        end
      end
      if under then
        local what = under .. '|' .. tostring(E.underWhat):sub(1, 12)
        if E.said ~= what then
          E.said = what
          logLine(string.format('demo: elevator %d stays up until %s is clear of it (%s)', E.k, under, tostring(E.underWhat)))
        end
      else
        local okc, why = Tow.Aux.elevator(ctx, E.k, 'down')
        if okc then
          E.state, E.t0, E.slow, E.at = 'lowering', mt, nil, {}
          changed(true)
        else
          E.cmdAt = mt + RETRY
          waits(E, why, mt, RETRY)
        end
      end
    end
  elseif E.state == 'down' then
    if not trip then return end
    local allOn = doneBelow >= trip.size
    -- (up as soon as the tractor that brought the last one is off the platform and inside the hull)
    -- (OFF IT: all of it M.OFF.margin clear of the platform as the hangar's floor has it, as it really stands (until
    -- 2026-11-20: its point 15 m or less from the ship's centre line: 6 m inboard of the sill, for any tractor on
    -- either hitch); and no other tractor of the hangar on it. CATCC_DEMO_NO_OFFFIRST: as it was.)
    local clear = true
    if CATCC_DEMO_NO_OFFFIRST then
      for _, j in ipairs(M.jobs) do
        if j.E == E and (not j.freed or math.abs(j.w.d.z) > 15) then clear = false end
      end
    else
      local x1, x2, z1, z2 = M.platBox(E.k, M.OFF.margin)
      for _, j in ipairs(M.jobs) do
        if j.E == E and (not j.freed or M.discsIn(M.realDiscs(j.w), x1, x2, z1, z2)) then
          clear = false
          -- (the rig's: CATCC_DEMO_RAISE_LOG: what keeps a platform whose aircraft are aboard down)
          if CATCC_DEMO_RAISE_LOG and allOn and mt >= (E.raiseLog or 0) then
            E.raiseLog = mt + 5
            local rx, rz = Tow.real(j.w)
            logLine(string.format('demo: RAISE elevator %d held by %s (%s, freed %s, phase %s, at %.1f / %.1f)', E.k, j.tug.name, tostring(j.a and j.a.board), tostring(j.freed), tostring(j.w.phase), rx, rz))
          end
        end
      end
      for _, t in ipairs(M.tugs) do
        if t.level == 'hangar' and not t.job and M.discsIn(tugDiscs(t), x1, x2, z1, z2) then clear = false end
      end
    end
    if allOn and clear and mt >= (E.cmdAt or 0) then
      local okc, why = Tow.Aux.elevator(ctx, E.k, 'up')
      if okc then
        E.state, E.t0, E.slow, E.pre = 'raising', mt, nil, {}
        E.staying = trip.stay or nil
        E.trip = E.trip + 1
        E.why, E.said = nil, nil
        changed(true)
      else
        E.cmdAt = mt + RETRY
        waits(E, why, mt, RETRY)
      end
    end
  end
end

-- ---------------------------------------------------------------- every frame
local function finish(job, mt, failed)
  local a, w = job.a, job.w
  -- (an aircraft that was delivered is no longer this job's: the hangar's tractor is still on its way home when the
  -- deck's tow of the same aircraft begins, now that a deck tractor is there as the platform comes up: the rig,
  -- 2026-11-18: the hangar job's end put its chocks back in under the deck's tow and took "in tow" off it)
  if not job.freed then
    if w.jx and (w.bar == 'gear' or failed) then
      a.x, a.z, a.fx, a.fz = w.jx, w.jz, w.jfx, w.jfz
    end
    a.towed = nil
    a.at = nil
    if not a.chocks then
      a.chocks = true
      foldWings(a)
    end
  end
  for i, j in ipairs(M.jobs) do
    if j == job then table.remove(M.jobs, i) break end
  end
  job.tug.job, job.tug.idleAt, job.tug.d.hold = nil, mt, nil
  job.E.busy = nil
  changed(job.level == 'hangar')
end

-- a tractor that drove somewhere by itself has got there (or could not go on)
local function finishMove(job, mt)
  for i, j in ipairs(M.jobs) do
    if j == job then table.remove(M.jobs, i) break end
  end
  job.tug.job, job.tug.idleAt, job.tug.d.hold = nil, mt, nil
  M.relWant = true
end

-- where a deck tractor stands when it has parked: the place it was going to, if it got there
local function placeOf(job)
  local g, d = job.goal, job.w.d
  return (g and hyp(d.x - g.x, d.z - g.z) < 2.5) and g or nil
end

-- GIVING WAY. A tractor starts on a way only when no other needs any part of it at the same time, or behind another
-- (`free`). As they go, one may fall behind its plan (it gave way, a hook-up took longer than counted): the times of
-- what it holds move with it (job.lag). Twice a second every two jobs on the flight deck are held against each other:
-- where circles of theirs touch at overlapping times, ONE GOES FIRST: the one the other started behind (job.after);
-- else the one that is into that stretch first. THE OTHER STOPS SHORT OF ALL THE TWO SHARE: when it is within
-- GIVE.near seconds of the first circle ahead of it that touches any of the first one's (whatever the time), it
-- brakes to a stand on its way (the hook's d.hold) and goes on when nothing of theirs touches at the same time any
-- more. One that has nothing of that ahead of it (it is in the stretch already) cannot give way: said in the log.
-- A TRACTOR THAT STANDS IDLE ON A JOB'S WAY (it stopped there after the job was planned): the job stops short of it,
-- and the tractor is sent off (shoo).
local GIVE = { every = 0.5, near = 6 }
-- IS A TOW'S WAY AHEAD CLEAR OF WHERE OTHER JOBS STAND: the next 25 s of its pull, as its own width (job.tPull),
-- against each other job's tractor and (if it has one on its bar) aircraft where they are now
function M.clearAhead(r, others, mt)
  if not (r.tPull and r.w.phase == 'pull') then return false end
  local tr = (r.t0 or 0) + (r.lag or 0)
  for _, o in ipairs(others) do
    if o ~= r then
      local stand = {}
      for _, q in ipairs(tugDiscs(o.tug)) do stand[#stand + 1] = { q[1], q[2], q[3] + 0.6 } end
      if o.w.bar == 'both' and o.w.jx and o.w.jfx then
        for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do stand[#stand + 1] = { o.w.jx + o.w.jfx * u, o.w.jz + o.w.jfz * u, 4.4 } end
      end
      for _, c in ipairs(r.tPull) do
        local at = tr + (c[6] or 0) - mt
        if at > -3 and at < 25 and touch({ c }, stand) then return false end
      end
    end
  end
  return true
end

-- does job A wait on job B, itself or through others (what each started behind: job.after)
function M.waitsOn(A, B, depth)
  depth = depth or 0
  if depth > 6 then return false end
  for j in pairs(A.after or {}) do
    if j == B or M.waitsOn(j, B, depth + 1) then return true end
  end
  return false
end
-- a job is stood down (see giveWay): a tractor by itself stands where it is; one on its way to an aircraft leaves it
function M.standDown(job, mt)
  local tug = job.tug
  tug.d.hold = nil
  if job.move then
    finishMove(job, mt)
  else
    if not job.freed and job.a then
      -- (not the same tractor again for a minute)
      job.a.badTug = { [tug] = mt + 60 }
    end
    finish(job, mt, not job.freed)
  end
  tug.place = nil
  tug.restAt = mt + 20
  -- (one that was by itself steps aside before it sets off again (idleTugs): it would take the same way into the same
  -- ring: the rig: 76 times)
  if job.level == 'deck' and (job.move or job.delivered) then tug.mustAside = tug.mustAside or (mt + 40) end
  changed()
end
function M.behindText(job)
  local names = {}
  for j in pairs(job.after or {}) do names[#names + 1] = tostring(j.tug.name) end
  table.sort(names)
  return #names > 0 and ('; it starts behind ' .. table.concat(names, ' and ') .. ': it will stop short of what they share until that one has passed') or ''
end

-- THE RIGHT OF WAY (the user, 2026-11-19: "Aircraft under tow have right of way, and it's up to tugs not actively towing
-- to avoid them as they return to their spots or move to the next aircraft"; and of his run that day: "once
-- disconnected, the tug without a tow should give way to the tug with a tow"). Between a TOW (a tractor on its way
-- to its aircraft, hooking on, pulling, pushing, unhooking) and a TRACTOR BY ITSELF (on its way to a place, or one
-- that has delivered its aircraft):
--   1. the tractor by itself gives way: it stops short of the first circle of its way that the tow needs at the
--      same time (M.rowPair). The tow is never held for what such a tractor HOLDS (its way, the place it stands on);
--   2. the tow stops only for the tractor ITSELF: where it is at this moment, if what the tow comes to within
--      GIVE.near + 4 s touches it (giveWay, below: as it does for a tractor that stands idle);
--   3. a tractor by itself that STANDS there (it gave way to another, or has unhooked and has no way yet) leaves at
--      once: M.escape: its next way is asked for now, and it does not wait for its lane: the way round what the
--      other jobs hold is taken however long, to where it was going, else to open deck aside. The tow that waits for
--      it is, to it, only what stands there (standsFor), so it may leave through that tow's way; what every other
--      job holds it keeps clear of, as always. (Tried first: straight out through what the others hold: at real
--      time one such tractor passed 2.3 m from another that was backing onto its bar.)
-- Before this: a tow that had started behind another waited until that one's tractor, its aircraft parked, had found
-- a free way home; that tractor waited for a way clear of what the waiting tow held: 59 s in the rig at real time,
-- 84 s in the user's run (broken by a ring's stand-down, and the tractor then found no place aside for 40 s).
-- CATCC_DEMO_NO_ROW: as it was.
function M.byItself(j) return (j.move or j.delivered) and true or false end
-- (what a job is where it is now: its tractor, and its aircraft if that is on the bar: as standsFor)
function M.bodyOf(j)
  local out, w = {}, j.w
  for _, q in ipairs(tugDiscs(j.tug)) do out[#out + 1] = { q[1], q[2], q[3] + 0.6 } end
  if w.bar == 'both' and w.jx and w.jfx then
    for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do out[#out + 1] = { w.jx + w.jfx * u, w.jz + w.jfz * u, 4.8 } end
  end
  return out
end
function M.rowPair(J, K, mt, jGo, kGo, at)
  if CATCC_DEMO_NO_ROW then return false end
  local sJ, sK = M.byItself(J), M.byItself(K)
  if sJ == sK then return false end
  local tow, solo, go = sJ and K or J, sJ and J or K, sJ and jGo or kGo
  if CATCC_DEMO_YIELD_LOG and mt >= (solo.rowLog or 0) then
    solo.rowLog = mt + 2
    logLine(string.format('demo: ROW solo %s (%s%s at %.0f / %.0f) tow %s (%s at %.0f / %.0f): go in %s s', solo.tug.name, tostring(solo.w.phase), solo.force and ' force' or '', solo.w.d.x, solo.w.d.z,
      tow.tug.name, tostring(tow.w.phase), tow.w.d.x, tow.w.d.z, go and string.format('%.1f', go - mt) or 'none'))
  end
  -- (one that drives out through what the others hold does not stop: the tow stops for it where it is; nor one that
  -- is backing into its place: it is there in seconds, and a tractor held half way into its place stood in the
  -- tow's way for good: the rig at 4 times speed)
  if solo.force or (solo.park and solo.park.step) then return true end
  local ts, tt = clockOf(solo), clockOf(tow)
  -- (IT DOES NOT STOP FOR WHAT THE TOW HOLDS:
  --   where the tow stands for it, or stood for it within the last minute (tug.passFor: giveWay): it is leaving that
  --   tow's way, and the tow waits until it has (the rig: it set off, gave way to the very tow that waited for it,
  --   was stood down, and set off again, every 5 s for good);
  --   where it is INSIDE the way the tow has still to come to: stopping there is standing in that way.
  -- There it stops only for the tow ITSELF: its tractor, and its aircraft if that is on the bar, where they are now.)
  local pf = solo.tug.passFor
  local stoodFor = pf and (pf[tow.tug] or 0) > mt
  -- (NOR FOR WHAT A TOW HOLDS THAT ITSELF STANDS FOR A TRACTOR, this one or another (tow.bodyHeldAt: giveWay): it goes
  -- nowhere until that tractor has left its way: the rig, 2026-11-19, at the stern: a tow off elevator 3 stood for a
  -- tractor that had unhooked at Port 5 (now Fantail 2); that one's way out was behind a second tractor by itself, which stood
  -- giving way to the same tow's way: 78 s, ended by a tractor driving out through what the others held)
  if not stoodFor and tow.bodyHeldAt and mt - tow.bodyHeldAt < 1.5 and tow.w.d.hold and (tow.w.d.v or 0) <= 0.05 then stoodFor = true end
  -- (NOR FOR WHAT A TOW HOLDS THAT STANDS HELD FOR ANYTHING, for a second and more (2026-11-20): it goes nowhere until
  -- what it waits for has gone; when it goes on, it stops for this tractor itself if this one is in what it comes to
  -- (giveWay). The rig the same day: the second tow off elevator 3 stood behind the first; the first stood for a tractor
  -- that had unhooked in its way; that one, sent off, stopped every 5 s for the second's pull "about to be needed":
  -- 994 times, and the three stood for good. CATCC_DEMO_NO_HELDSTANDS: as it was.)
  if not stoodFor and not CATCC_DEMO_NO_HELDSTANDS and tow.w.d.hold and (tow.w.d.v or 0) <= 0.05 and tow.yieldAt and mt - tow.yieldAt >= 1 then stoodFor = true end
  local inside = stoodFor
  local towC = (CATCC_DEMO_LANES5) and M.towBand(tow) or tow.circles
  if not inside then
    local discs = tugDiscs(solo.tug)
    for _, c in ipairs(towC) do
      if not inside and not c[8] and M.needAt(c, tt) > mt and touch({ c }, discs) then inside = true end
    end
  end
  if not inside then
    if go and go - mt <= GIVE.near then
      solo.yield = solo.yield or { to = tow.tug.name, who = tow.tug.name, x = at[1], z = at[2], job = tow }
    end
    return true
  end
  -- (cn: when the tractor is AT a circle of its way (c[6]), not when it begins to hold it (2 s sooner: at its pace
  -- every circle within 17 m was "held already" and not looked at: the rig: it passed 1.3 m from a tractor that was
  -- backing onto its bar))
  local body = M.bodyOf(tow)
  for _, c in ipairs(solo.circles) do
    local cn = (c[6] or c[4]) and ts + (c[6] or c[4]) or -HUGE
    if cn > mt - 0.5 and cn - mt <= GIVE.near then
      if touch({ c }, body) then
        solo.yield = solo.yield or { to = tow.tug.name .. ', which is there', who = tow.tug.name, x = c[1], z = c[2], job = tow }
        break
      end
      -- (AND FOR WHAT THE TOW COMES TO WITHIN THE SAME SECONDS, or is on now (its tractor's way onto the bar, the
      -- next metres of its pull): not if the tow stands for it)
      if not stoodFor then
        for _, q in ipairs(towC) do
          if not q[8] and (not q[5] or tt + q[5] > mt) and M.needAt(q, tt) - mt <= GIVE.near and touch({ c }, { q }) then
            solo.yield = solo.yield or { to = tow.tug.name, who = tow.tug.name, x = c[1], z = c[2], job = tow }
            break
          end
        end
        if solo.yield then break end
      end
    end
  end
  return true
end
-- (true: a job was stood down: the list of jobs has changed)
function M.escape(t, J, mt)
  local sj = t.job
  if not sj then return false end
  local d = sj.w.d
  -- (backing into its place: it is nearly there; under way, or about to be (it has a way and is not held): it is
  -- leaving: only one that STANDS: held, giving way to another, or unhooked with no way yet)
  if (sj.park and sj.park.step) or sj.force then return false end
  -- (atNose: unhooked, and asking for its way (the hook has it 'moveup'))
  local atNose = sj.delivered and not sj.goal and sj.w.phase == 'moveup'
  if not atNose and not (d.hold and (d.v or 0) <= 0.05) then return false end
  if mt < (t.escAt or 0) then return false end
  t.escAt = mt + 5
  M.escaped = (M.escaped or 0) + 1
  if sj.delivered and not sj.goal then
    -- (it has unhooked and has no way yet: its next way is asked for now, and may go through what the others hold)
    if not sj.escape then
      logLine(string.format('demo: %s, its aircraft parked, stands in the way of %s\'s tow: its way from there is asked for at once, round what the others hold', t.name, J.tug.name))
    end
    sj.escape, sj.homeTry = J, mt
    return false
  end
  logLine(string.format('demo: %s, by itself, stands in the way of %s\'s tow: it is stood down and finds its way from there at once, round what the others hold', t.name, J.tug.name))
  t.mustAside, t.roundTill, t.asideTry, t.moveTry = mt + 40, mt + 40, nil, mt
  M.standDown(sj, mt)
  shoo(t, J.tug.name .. '\'s tow')
  return true
end
-- the places aside a tractor may go to from x / z (M.asideOk), the nearest first, five at the most; then, loose (see
-- M.asideOk), five more
function M.asideList(t, x, z)
  local out = {}
  for pass = 1, 2 do
    M.asideLoose = (pass == 2) or nil
    local n = 0
    for _, r in ipairs({ 9, 14, 20, 28, 40, 55, 70 }) do
      for k = 0, 11 do
        local an = k * math.pi / 6
        local c = { x = x + r * math.cos(an), z = z + r * math.sin(an), aside = true }
        if n < 5 and M.asideOk(c, t) then
          n = n + 1
          out[#out + 1] = c
        end
      end
    end
  end
  M.asideLoose = nil
  return out
end

-- IS A TOW'S TRACTOR IN WHAT ANOTHER NEEDS WITHIN 20 s (fc: that one's circles as the two are held against each other)
function M.tugInWay(o, f, mt, fc, pad)
  local q = tugDisc(o.tug)
  local tf = clockOf(f)
  for _, c in ipairs(fc) do
    if (c[4] and tf + c[4] or -HUGE) <= mt + 20 and hyp(c[1] - q[1], c[2] - q[2]) < c[3] + pad + q[3] - 1 then return true end
  end
  return false
end

local function giveWay(mt)
  if mt < (M.giveAt or 0) then return end
  M.giveAt = mt + GIVE.every
  local js = {}
  for _, j in ipairs(M.jobs) do
    if j.level == 'deck' and j.box then
      js[#js + 1] = j
      -- (whom it gave way to at the last look: see "a tow does not wait for a tractor by itself that itself stands")
      j.wasWho = j.yield and j.yield.who or nil
      j.yield = nil
    end
  end
  for _, j in ipairs(js) do
    if j.forceTill and mt > j.forceTill then j.force, j.forceTill = nil, nil end
    -- (a tow that hooked on at once: off once its tractor is 2 m along its pull)
    if j.late == 'nose' and not j.noseOff then
      local ph = j.w.phase
      if ph == 'pull' then
        j.noseAt = j.noseAt or { j.w.d.x, j.w.d.z }
        if hyp(j.w.d.x - j.noseAt[1], j.w.d.z - j.noseAt[2]) > 2 then j.noseOff = true end
      elseif ph == 'push' or ph == 'arrived' or j.delivered then
        j.noseOff = true
      end
    end
  end
  for x = 1, #js do
    for y = x + 1, #js do
      local J, K = js[x], js[y]
      local A, B = J.box, K.box
      if A[1] < B[2] and B[1] < A[2] and A[3] < B[4] and B[3] < A[4] and not M.noseYield(J, K, mt) then
        local tj, tk = clockOf(J), clockOf(K)
        -- (jIn, kIn: when each is into what they contest; jStop, kStop: the first circle ahead of each that touches
        -- any of the other's)
        -- (jGo, kGo: the first circle each has still to come to of those that are contested)
        local jIn, kIn, jStop, kStop, at, jGo, kGo = HUGE, HUGE, nil, nil, nil, nil, nil
        -- (the two tows of one platform: held against each other tight: M.tightNow)
        local JC, KC = J.circles, K.circles
        local pad = 0
        if J.pairE and J.pairE == K.pairE and J.tPull and K.tPull and not CATCC_DEMO_NO_PAIR then
          JC, KC = M.tightNow(J), M.tightNow(K)
        elseif J.tPull and K.tPull and not J.delivered and not K.delivered and not J.freed and not K.freed and not J.move and not K.move and not CATCC_DEMO_NO_ALLTIGHT then
          -- (any two tows: M.PAD between their tight circles: `free`)
          JC, KC, pad = M.tightNow(J), M.tightNow(K), M.PAD
        end
        -- (a tow that is to hook on at once, on its way to the nose: its tractor's way only)
        if M.noseArr(J) then JC = J.seq or {} end
        if M.noseArr(K) then KC = K.seq or {} end
        local g4 = not CATCC_DEMO_NO_G4D
        -- (a tow and a tractor by itself: where the aircraft stands (c[8]) is not held against the tractor, as in
        -- `free`: its way is found clear of every aircraft where it stands; where the tow's own tractor hooks on is
        -- part of its way to the aircraft (job.seq))
        local rowP = not CATCC_DEMO_NO_ROW and ((J.move or J.delivered) and true or false) ~= ((K.move or K.delivered) and true or false)
        for _, a in ipairs(JC) do
          local a1, a2 = a[4] and tj + a[4] or -HUGE, a[5] and tj + a[5] or HUGE
          for _, b in ipairs(KC) do
            local d = a[3] + b[3] + pad
            local dx, dz = a[1] - b[1], a[2] - b[2]
            if dx * dx + dz * dz < d * d and not (rowP and (a[8] or b[8])) then
              local b1, b2 = b[4] and tk + b[4] or -HUGE, b[5] and tk + b[5] or HUGE
              -- (WHAT THE OTHER HAS GIVEN UP BY ITS CLOCK IS NOT STOPPED SHORT OF (2026-11-19): the tight circles two tows
              -- of one platform are held against each other by are never taken off the list behind the tow: the
              -- second stopped short of the first metres of the first's pull until the first was parked)
              -- (an, bn: when each comes to its circle: M.needAt)
              local an, bn = M.needAt(a, tj), M.needAt(b, tk)
              if an > mt and (not g4 or b2 > mt - GAP.run) and (not jStop or an < jStop) then jStop = an if CATCC_DEMO_YIELD_LOG then J.dbgS = { a, b, an, a2, b1, b2 } end end
              if bn > mt and (not g4 or a2 > mt - GAP.run) and (not kStop or bn < kStop) then kStop = bn if CATCC_DEMO_YIELD_LOG then K.dbgS = { b, a, bn, b2, a1, a2 } end end
              if a1 < b2 + GAP.run and b1 < a2 + GAP.run then
                if a1 < jIn then jIn = a1 end
                if b1 < kIn then kIn = b1 end
                if an > mt and (not jGo or an < jGo) then jGo = an if CATCC_DEMO_YIELD_LOG then J.dbgG = { a, b, an, a2, b1, b2 } end end
                if bn > mt and (not kGo or bn < kGo) then kGo = bn if CATCC_DEMO_YIELD_LOG then K.dbgG = { b, a, bn, b2, a1, a2 } end end
                at = at or a
              end
            end
          end
        end
        if at and M.rowPair(J, K, mt, jGo, kGo, at) then
          -- (a tow and a tractor by itself: the right of way, above)
        elseif at then
          local first, other, stopIn = J, K, kStop
          local jk, kj = J.after and J.after[K], K.after and K.after[J]
          if (jk and not kj) or (not (kj and not jk) and kIn < jIn) then first, other, stopIn = K, J, jStop end
          -- (A TOW GOES BEFORE A TRACTOR BY ITSELF (2026-11-19: the rig: a tow off elevator 4 stood 96 s, its aircraft
          -- on the bar and the platform up behind it, for a tractor on its way home that was itself waiting for a
          -- third): of the two, the one that is by itself (on its way to a place, or from its last tow) gives way,
          -- whoever came first. One that is already in what they share cannot (below): then the tow waits for it.
          -- OFF (CATCC_DEMO_TOWFIRST switches it on): in the rig the tractors by themselves were then stood down over
          -- and over where they stood in a tow's way, and two came within 0.9 m of each other.)
          if CATCC_DEMO_TOWFIRST then
            local sj, sk = (J.move or J.delivered) and true or false, (K.move or K.delivered) and true or false
            if sj ~= sk then
              if sj then first, other, stopIn = K, J, jStop else first, other, stopIn = J, K, kStop end
            end
          end
          -- (A TOW DOES NOT WAIT FOR A TRACTOR BY ITSELF THAT ITSELF STANDS GIVING WAY TO A THIRD (2026-11-19, the rig
          -- with eight tractors: the second tow off elevator 4 had started behind the first; the first's tractor,
          -- its aircraft parked, stood on its way home for 113 s giving way to a tow off elevator 3, and the second
          -- tow stood 179 s on the platform for it, the platform up behind it: the user, the same day: "Aircraft
          -- under tow have right of way, and it's up to tugs not actively towing to avoid them as they return to
          -- their spots or move to the next aircraft"). Only then: a tractor by itself that is moving is past in
          -- seconds, and the wider rule (CATCC_DEMO_TOWFIRST, above) had them stood down over and over.
          -- CATCC_DEMO_NO_TOWPAST: as it was.)
          if not CATCC_DEMO_NO_TOWPAST and (first.move or first.delivered) and not first.force and not (first.park and first.park.step)
            and other.a and not other.move and not other.delivered and not other.freed
            and first.w.d.hold and (first.w.d.v or 0) == 0 and first.wasWho and first.wasWho ~= other.tug.name and mt - (first.yieldAt or mt) > 3 then
            first, other = other, first
            stopIn = (other == J) and jStop or kStop
          end
          -- (a tractor that was boxed in and drives out through what the others hold (job.force): it goes first)
          if (J.force or false) ~= (K.force or false) then
            if K.force then first, other, stopIn = K, J, jStop else first, other, stopIn = J, K, kStop end
          end
          -- (ONLY ONE THAT HAS STILL TO COME TO WHAT THEY CONTEST CAN GIVE WAY: one that is in it already (it stands
          -- on it: the place its aircraft is hooked up on, say) is not held for it: the rig, 2026-11-18: a tow stood
          -- 109 s for a tractor that had long passed and was backing into the pocket beside where the tow began. If
          -- the one that was to give way is in it and the other has still to come: the other gives way.)
          local otherGo, firstGo = (other == J) and jGo or kGo, (first == J) and jGo or kGo
          -- (A TOW THAT IS PUSHING INTO ITS SPOT, OR UNHOOKING THERE, IS NOT STOPPED (M.fixed; 2026-11-19): the rig: one
          -- was held for 30 s on its spot, its tractor unhooking, for the next tow off its platform, and the two then
          -- stood in each other's way for four minutes)
          if g4 and M.fixed(other) then otherGo = nil end
          if not otherGo and firstGo then
            first, other = other, first
            stopIn = (other == J) and jStop or kStop
          elseif not otherGo then
            stopIn = nil
          end
          -- (the one that is to give way stands still, and its tractor in what the first needs within 20 s: giving
          -- way there helps nobody: the other way round, if the first has still to come to what they share)
          if other.w.d.hold and (other.w.d.v or 0) == 0 then
            local q = tugDisc(other.tug)
            local tf = clockOf(first)
            local inWay = false
            -- (with the circles the two are held against each other by: two tows: their own width (2026-11-19: the rig:
            -- the second tow off elevator 2 stood, hooking on, 9.4 m beside the first's line, "in its way" by the
            -- first's 8 m band: it was sent on first, and was pulled past the first's tractor, hooked on at its
            -- aircraft's nose, 2.7 m from it))
            for _, c in ipairs(g4 and ((first == J) and JC or KC) or first.circles) do
              if (c[4] and tf + c[4] or -HUGE) <= mt + 20 and hyp(c[1] - q[1], c[2] - q[2]) < c[3] + (g4 and pad or 0) + q[3] - 1 then
                inWay = true
                break
              end
            end
            local back = (first == J) and jStop or kStop
            -- (NOT if the one that would then wait is itself waited for by this one, through others: a ring: the
            -- rig, 2026-11-18, with six tractors: 5 behind 4, 6 behind 5, 4 behind 6, and nothing moved again. Both
            -- then wait, and the ring is broken below.)
            -- (through others: the two's own "behind" is what the swap turns round)
            local direct = other.after and other.after[first]
            if direct then other.after[first] = nil end
            local ring = M.waitsOn(other, first)
            if direct then other.after[first] = direct end
            -- (and not turned back within 30 s: the rig, 2026-11-18: two that both stood were swapped twice a second,
            -- 7497 times, and neither ever got under way)
            local again = first.swapFor == other and mt - (first.swapAt or -99) < 30
            -- (A TRACTOR BY ITSELF IS NOT SWAPPED: IT IS STOOD DOWN, and finds another way from where it stands (the
            -- one that stands in the way, if it is by itself; else the other, if that is): the rig, 2026-11-18: two
            -- tractors by themselves met head on in the street by elevator 2, were swapped twice, and passed each
            -- other 2.0 m apart)
            local function byItself(j) return (j.move or j.delivered) and not j.force and not (j.park and j.park.step) and mt >= (j.tug.restAt or 0) end
            local solo = (byItself(other) and other) or (byItself(first) and first) or nil
            if inWay and back and solo and not CATCC_DEMO_NO_SOLODOWN then
              logLine(string.format('demo: %s and %s stand in each other\'s way: %s, by itself, is stood down and finds another way', first.tug.name, other.tug.name, solo.tug.name))
              M.soloDown = (M.soloDown or 0) + 1
              local tg = solo.tug
              -- (OUT OF THE WAY FIRST: it steps aside before it sets off for a place again (idleTugs): it would only
              -- be given the same way, through the other: the rig: 872 times)
              tg.mustAside = mt + 40
              -- (THE THIRD TIME IN 150 s: from now on, for 90 s, it sets off through what the others hold, and they
              -- give way to it: the rig, 2026-11-19, one planning step a frame: a tractor that stood where its tow
              -- had ended, in the way of a tow that had stopped for it, was stood down every 41 s for an hour: every
              -- way out of there began through what that tow held, so it gave way to it at once, and the two stood
              -- in each other's way again)
              tg.downN = (tg.downAt and mt - tg.downAt < 150) and (tg.downN or 0) + 1 or 1
              tg.downAt = mt
              -- (AT ONCE where the one it stands in the way of is a tow that stands held with its aircraft on the bar: that
              -- one goes nowhere until this one is gone: 2026-11-19)
              local tow = (solo == other) and first or other
              local towHeld = tow.w.bar == 'both' and tow.w.d.hold and not tow.move and not tow.delivered and not CATCC_DEMO_NO_TOWFORCE
              if (tg.downN >= 3 or towHeld) and not CATCC_DEMO_NO_DOWNFORCE then
                tg.forceNext, tg.downN = mt + 90, 0
                logLine(string.format('demo: %s %s: it sets off through what the others hold from now on', tg.name,
                  towHeld and ('stands in the way of ' .. tow.tug.name .. ', which is held with its aircraft on the bar') or 'has been stood down three times in the same place'))
              end
              M.standDown(solo, mt)
              shoo(tg, ((solo == other) and first or other).tug.name .. '\'s way')
              return
            elseif inWay and back and (ring or again) then
              if ring then first.yield = first.yield or { to = other.tug.name .. ', which stands in its way', who = other.tug.name, x = q[1], z = q[2], job = other } end
            elseif inWay and back and other.w.bar == 'both' and first.w.bar == 'both' and not M.clearAhead(other, { first }, mt) then
              -- (TWO TOWS: the one that stands in the way goes on only if its own way ahead is clear of where the other
              -- stands: else both wait, and the ring below lets the one go whose way is clear)
              first.yield = first.yield or { to = other.tug.name .. ', which stands in its way', who = other.tug.name, x = q[1], z = q[2], job = other }
            elseif inWay and back and g4 and other.tPull and first.tPull and not other.move and not other.delivered and not first.move and not first.delivered
              and not M.wayClearOf(other, first) and mt - (other.blockAt or mt) < 45 then
              -- (TWO TOWS: IT GOES ON FIRST ONLY IF ITS OWN WAY IS CLEAR OF WHERE THE FIRST STANDS (its tractor, and its
              -- aircraft if that is on the bar): else both wait (the ring below lets one go, or stands one down); after
              -- 45 s: as before)
              other.blockAt = other.blockAt or mt
              first.yield = first.yield or { to = other.tug.name .. ', which stands in its way', who = other.tug.name, x = q[1], z = q[2], job = other }
            elseif inWay and back and first.force and not CATCC_DEMO_NO_FORCEKEEP then
              -- (NOT A TOW THAT WAS LET GO FIRST OUT OF A RING (job.force): the swap put the one that stood in its way before
              -- it again, which itself stood in the ring: the rig, 2026-11-20, another unloading order: three tows, twice a
              -- second for good. It goes on; the one in its way stands. CATCC_DEMO_NO_FORCEKEEP: as it was.)
            elseif inWay and back then
              other.blockAt = nil
              other.swapFor, other.swapAt = first, mt
              logLine(string.format('demo: %s stands in %s\'s way where it gave way: it goes on, and %s waits for it from now on', other.tug.name, first.tug.name, first.tug.name))
              -- (for good: the first is behind it from now on)
              if other.after then other.after[first] = nil end
              first.after = first.after or {}
              first.after[other] = true
              first, other, stopIn = other, first, back
            end
          end
          -- (a tow that may hold in the landing area (job.late): short of the first circle ahead of it that the other
          -- needs at the same time: it goes as far as it can)
          -- (EVERY TOW (2026-11-19: the user: "I still see a lot of tugs waiting to begin a 2nd tow off an elevator until
          -- the 1st tow has been completed, even though the paths of each would never intersect as long as the
          -- second tow was started once the first was sufficiently clear": it follows the one ahead, the time a
          -- circle is held behind a tow apart, and stops only short of what that one still needs when it comes
          -- there. CATCC_DEMO_NO_G4D: as it was: short of the first circle that touches any of the other's.)
          if (other.late or (g4 and other.tPull and not other.move and not other.delivered)) and not (g4 and M.fixed(other)) then
            local go = (other == J) and jGo or kGo
            if go then stopIn = go end
          end
          if g4 and M.fixed(other) then stopIn = nil end
          -- (ONE IN THE WAY OF A TOW THAT CANNOT STOP (M.fixed: it pushes into its spot) DOES NOT STOP THERE: it goes on
          -- until its tractor is out of what that one needs within 20 s (the rig, 2026-11-20, at real time: the second
          -- tow off elevator 3 stood in the way of the first's push into Stbd 1 (now Fantail 4); it was sent on ("stands in its way
          -- where it gave way") and half a second later made to give way to it again, for 20 s: it went at half its
          -- pace, and the platform stayed up behind it. CATCC_DEMO_NO_FIXEDCLEAR: as it was.)
          if stopIn and g4 and not CATCC_DEMO_NO_FIXEDCLEAR and M.fixed(first) and other.tPull and not other.move and not other.delivered
            and M.tugInWay(other, first, mt, (first == J) and JC or KC, pad) then
            stopIn = nil
            if mt >= (other.fixedSaid or 0) then
              other.fixedSaid = mt + 30
              logLine(string.format('demo: %s is in the way of %s, which is pushing into its spot: it goes on until it is clear of it', other.tug.name, first.tug.name))
            end
          end
          if stopIn and stopIn - mt <= GIVE.near then
            other.yield = other.yield or { to = first.tug.name, who = first.tug.name, x = at[1], z = at[2], job = first }
            if CATCC_DEMO_YIELD_LOG and mt >= (other.ylog2 or 0) then
              other.ylog2 = mt + 10
              local useGo = (other.late or (g4 and other.tPull and not other.move and not other.delivered)) and not (g4 and M.fixed(other))
              local q = (useGo and other.dbgG) or other.dbgS
              logLine(string.format('demo: YIELD2 %s (%s %s) to %s (%s %s%s) lists %s pad %.0f after %s: stop in %.0f s%s', other.tug.name, other.move and 'move' or (other.delivered and 'delivered' or 'tow'), tostring(other.w.phase),
                first.tug.name, first.move and 'move' or (first.delivered and 'delivered' or 'tow'), tostring(first.w.phase), first.w.d.hold and ' held' or '',
                (JC ~= J.circles or KC ~= K.circles) and 'tight' or 'wide', pad, (other.after and other.after[first]) and 'yes' or 'no', stopIn - mt,
                q and string.format(': its %.0f / %.0f r %.1f (%.0f to %.0f) against %.0f / %.0f r %.1f (%.0f to %.0f)', q[1][1], q[1][2], q[1][3], q[3] - mt, q[4] - mt, q[2][1], q[2][2], q[2][3], q[5] - mt, q[6] - mt) or ''))
            end
          elseif not stopIn and not (g4 and M.fixed(other)) then
            local key = tostring(J.tug.name) .. '|' .. tostring(K.tug.name)
            M.crossSaid = M.crossSaid or {}
            if not M.crossSaid[key] or mt - M.crossSaid[key] > 30 then
              M.crossed = (M.crossed or 0) + 1
              logLine(string.format('demo: %s and %s both hold the deck near %.0f / %.0f at the same time: %s cannot give way now', J.tug.name, K.tug.name, at[1], at[2], other.tug.name))
            end
            M.crossSaid[key] = mt
            -- (THE TWO TRACTORS WITHIN 10 m OF EACH OTHER: the one that was to give way stands until the other is past
            -- (2026-11-19: the rig: two tows through the landing area, each in what the other held: their tractors
            -- passed 3.0 m apart))
            -- (for 20 s at the most, and only two tows that are both pulling: else the one stood for good for one that
            -- was itself standing)
            if hyp(J.w.d.x - K.w.d.x, J.w.d.z - K.w.d.z) < 10 and not CATCC_DEMO_NO_NEARHOLD and not (g4 and M.fixed(other))
              and J.w.phase == 'pull' and K.w.phase == 'pull' and J.w.bar == 'both' and K.w.bar == 'both' and not first.w.d.hold then
              other.nearAt = (other.nearWho == first and other.nearAt) or mt
              other.nearWho = first
              if mt - other.nearAt < 20 then
                other.yield = other.yield or { to = first.tug.name .. ', which is within 10 m of it', who = first.tug.name, x = at[1], z = at[2], job = first }
              end
            end
          end
        end
      end
    end
    -- (an idle tractor on its way: one that was not there when the job was planned)
    local J = js[x]
    local tj = clockOf(J)
    for _, t in ipairs(M.tugs) do
      if t.level == 'deck' and not t.job and not (J.known and J.known[t]) and not M.onVt(J.vt, t) then
        local discs = tugDiscs(t)
        -- (ONE THAT STANDS ON A PLACE OF ITS OWN (the junkyard, the pocket, a spot, aside) is in a tow's way only if the
        -- tow's own width touches it (M.tightNow): the 8 m band a tow holds reaches into the pocket by the island
        -- from every tow off elevator 2: the rig, 2026-11-18: a tow stood for good for a tractor parked there)
        local JC = (t.place and J.tPull and not J.delivered) and M.tightNow(J) or J.circles
        -- (ONE THAT STANDS LOOSE (where its tow ended, where it was called back or stood down): a tow gives way to it
        -- where its own width and 1.5 m touches it (2026-11-19: the rig: a tow stood 226 s for a tractor that stood
        -- 9 m off its line and could not get away through what the tow held))
        -- (OFF AGAIN the same day (CATCC_DEMO_LOOSE_TIGHT switches it on): the tight circles follow the TRACTOR's track:
        -- on a push, and on the inside of a turn, the aircraft is not on it: the rig at 8 times speed: an aircraft was
        -- pushed past a tractor that had been stood down beside its way 2.9 m from its centre line)
        local loose = 0
        if CATCC_DEMO_LOOSE_TIGHT and not t.place and J.tPull and not J.delivered and not J.move and not J.freed and not CATCC_DEMO_NO_ALLTIGHT then JC, loose = M.tightNow(J), 1.5 end
        -- (ONE THAT STANDS IN ITS OWN PLACE IN THE JUNKYARD cannot clear off: a tractor by itself gives way to it only
        -- where its own width (2.2 m) touches it; AND A TRACTOR BY ITSELF THAT HAS GIVEN WAY TO AN IDLE ONE FOR 25 s
        -- is stood down and finds another way from where it stands: the rig, 2026-11-19: see M.asideOk)
        local atHome = t.place and t.place == t.home and not t.pocket and (J.move or J.delivered) and not CATCC_DEMO_NO_HOMETIGHT
        for _, a in ipairs(JC) do
          local a1 = a[4] and tj + a[4] or -HUGE
          if a1 > mt and a1 - mt <= GIVE.near + 4 and touch({ atHome and { a[1], a[2], math.min(a[3], 2.2) } or (loose > 0 and { a[1], a[2], a[3] + loose }) or a }, discs) then
            J.yield = J.yield or { to = t.name .. ', which stands there', who = t.name, x = a[1], z = a[2] }
            if J.a and not (J.move or J.delivered) then J.bodyHeldAt = mt end
            shoo(t, J.tug.name .. '\'s way')
            -- (THE RIGHT OF WAY, 3: one that stands idle in a TOW's way leaves at once: aside, or to where it belongs,
            -- through what the others hold: the rig, 2026-11-19: a tractor that waited in front of elevator 2 for
            -- the platform's other aircraft found no free way off for 45 s, and the tow stood for it for 50)
            if t.clearOff and J.a and not M.byItself(J) and not CATCC_DEMO_NO_ROW and mt >= (t.escAt or 0) then
              t.escAt = mt + 5
              M.escaped = (M.escaped or 0) + 1
              t.mustAside, t.roundTill, t.asideTry, t.moveTry = math.max(t.mustAside or 0, mt + 40), mt + 40, nil, mt
            end
            if J.idleWho ~= t then J.idleWho, J.idleAt = t, mt end
            if (J.move or J.delivered) and not (J.park and J.park.step) and mt - J.idleAt > 25 and J.w.d.hold and not CATCC_DEMO_NO_IDLEDOWN then
              logLine(string.format('demo: %s, by itself, has given way to %s, which stands there, for %.0f s: it is stood down and finds another way', J.tug.name, t.name, mt - J.idleAt))
              M.idleDown = (M.idleDown or 0) + 1
              J.tug.mustAside = mt + 40
              M.standDown(J, mt)
              return
            end
            break
          end
        end
      end
    end
  end
  -- (THE RIGHT OF WAY, 2 and 3: a tow stops for a tractor by itself only where that tractor is: and one that stands
  -- there leaves at once)
  if not CATCC_DEMO_NO_ROW then
    for _, J in ipairs(js) do
      if J.a and not M.byItself(J) and not J.freed then
        local tj = clockOf(J)
        for _, t in ipairs(M.tugs) do
          local sj = t.job
          if t.level == 'deck' and t ~= J.tug and sj and M.byItself(sj) then
            local discs = tugDiscs(t)
            for _, a in ipairs((CATCC_DEMO_LANES5) and M.towBand(J) or J.circles) do
              local an = M.needAt(a, tj)
              if an > mt and an - mt <= GIVE.near + 4 and touch({ a }, discs) then
                J.yield = J.yield or { to = t.name .. ', which is there', who = t.name, x = a[1], z = a[2] }
                J.bodyHeldAt = mt
                -- (the tow stands for it: for a minute it is not stopped for what this tow holds: M.rowPair)
                t.passFor = t.passFor or {}
                t.passFor[J.tug] = mt + 60
                if M.escape(t, J, mt) then return end
                break
              end
            end
          end
        end
      end
    end
  end
  -- A RING OF JOBS THAT WAIT FOR EACH OTHER (each stands, held, for the next; 8 s and more): one of them is STOOD DOWN:
  -- a tractor by itself (its way is given up: it stands where it is, and is sent off if it is in the way), else a
  -- tractor that is still on its way to its aircraft (the aircraft is left where it stands and given out again).
  -- None such: said once; the tows then wait as they did.
  for _, j in ipairs(js) do
    if j.yield and j.yield.job and j.w.d.hold and mt - (j.yieldAt or mt) > 8 then
      local seen, ring, k, n = { [j] = true }, { j }, j.yield.job, 0
      while k and not seen[k] and k.yield and k.yield.job and k.w.d.hold and n < 8 do
        seen[k], ring[#ring + 1] = true, k
        k, n = k.yield.job, n + 1
      end
      if k == j then
        local pick
        for _, r in ipairs(ring) do
          if (r.move or r.delivered) and not (r.park and r.park.step) then pick = pick or r end
        end
        for _, r in ipairs(ring) do
          if not pick and not r.move and not r.delivered and (r.w.phase == 'arrive' or r.w.phase == 'backout') then pick = r end
        end
        local names = {}
        for _, r in ipairs(ring) do names[#names + 1] = r.tug.name end
        if pick then
          logLine(string.format('demo: %s wait for each other in a ring: %s is stood down%s', table.concat(names, ', '), pick.tug.name,
            (pick.move or pick.delivered) and '' or string.format(' (%s is given out again)', tostring(pick.a.board))))
          M.ring = (M.ring or 0) + 1
          -- (A TRACTOR BY ITSELF OUT OF A RING (2026-11-19: the rig, the player's jet on elevator 1: it was stood down,
          -- set off for its place the same second by the same way, gave way to the same tow, and was stood down
          -- again, once a second for an hour and a quarter, two tows with their aircraft on the bar waiting for it):
          -- as one that is stood down where it stands in another's way: aside first; and through what the others
          -- hold, for 90 s, where a tow of the ring has its aircraft on the bar, or the second time in 150 s)
          if (pick.move or pick.delivered) and not CATCC_DEMO_NO_RINGFORCE then
            local tg = pick.tug
            tg.mustAside = mt + 40
            tg.downN = (tg.downAt and mt - tg.downAt < 150) and (tg.downN or 0) + 1 or 1
            tg.downAt = mt
            local onBar = false
            for _, r in ipairs(ring) do
              if r ~= pick and r.w.bar == 'both' then onBar = true end
            end
            if onBar or tg.downN >= 2 then
              tg.forceNext, tg.downN = mt + 90, 0
              logLine(string.format('demo: %s sets off through what the others hold from now on (a ring it was stood down out of)', tg.name))
            end
          end
          M.standDown(pick, mt)
          return
        else
          -- ALL HAVE THEIR AIRCRAFT ON THE BAR: THE ONE WHOSE WAY AHEAD IS CLEAR OF WHERE THE OTHERS STAND GOES FIRST (the
          -- next 25 s of its pull, as its own width, against the others' tractors and aircraft where they stand): for
          -- 40 s the others give way to it (job.force) whatever they hold. (The rig, 2026-11-19: the two tows off
          -- elevator 4 to Port 2 and Port 3 (now Port quarter 2 and 3) waited for each other for good.)
          local go
          for _, r in ipairs(ring) do
            if not go and r.tPull and r.w.phase == 'pull' and mt >= (r.ringAt or 0) then
              local tr = (r.t0 or 0) + (r.lag or 0)
              local clear = true
              for _, o in ipairs(ring) do
                if o ~= r and clear then
                  local stand = {}
                  for _, q in ipairs(tugDiscs(o.tug)) do stand[#stand + 1] = { q[1], q[2], q[3] + 0.6 } end
                  if o.w.bar == 'both' and o.w.jx and o.w.jfx then
                    for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do stand[#stand + 1] = { o.w.jx + o.w.jfx * u, o.w.jz + o.w.jfz * u, 4.4 } end
                  end
                  for _, c in ipairs(r.tPull) do
                    local at = tr + (c[6] or 0) - mt
                    if at > -3 and at < 25 and touch({ c }, stand) then clear = false end
                  end
                end
              end
              if clear then go = r end
            end
          end
          if go then
            go.force, go.forceTill, go.ringAt = true, mt + 40, mt + 60 * 2 ^ (go.ringN or 0)
            go.ringN = (go.ringN or 0) + 1
            M.ringGo = (M.ringGo or 0) + 1
            logLine(string.format('demo: %s wait for each other in a ring, each with its aircraft on the bar: %s, whose way ahead is clear of where the others stand, goes first', table.concat(names, ', '), go.tug.name))
            return
          elseif not j.ringSaid then
            j.ringSaid = true
            logLine(string.format('demo: %s WAIT FOR EACH OTHER IN A RING and none can be stood down (each has its aircraft on the bar)', table.concat(names, ', ')))
          end
        end
      end
    end
  end
  -- (THE SECOND OF A PLATFORM, hooked on while the first was still close (M.pairClose): held at the start of its pull)
  for _, j in ipairs(js) do
    if j.level == 'deck' and j.a and not j.move and not j.delivered and not j.yield and j.w.bar == 'both' then
      local o = M.pairClose(j.a)
      if o then
        local oj
        for _, k in ipairs(js) do
          if k.a == o then oj = k end
        end
        j.yield = { to = (oj and oj.tug.name or tostring(o.board)) .. ', with the first aircraft of its platform', who = oj and oj.tug.name or nil, x = o.x, z = o.z, job = oj }
        -- (to a tractor by itself it is what stands there, as a tow that stands for a tractor is (M.rowPair): its way
        -- ahead is not "about to be needed" while it stands: the rig, 2026-11-20: one that had to get out of the way of
        -- the first tow stopped for the second's pull every 5 s, 994 times, and the three stood for good)
        j.bodyHeldAt = mt
      end
    end
  end
  for _, j in ipairs(js) do
    local d = j.w.d
    if j.yield then j.yieldSeen = mt end
    -- (NO TOW IS STOPPED WHILE IT HOOKS ON (the bar's ring lifted, backed onto it, the pause): it stands there anyway,
    -- and is stopped, if it must be, when it would begin to pull)
    local ph = j.w.phase
    -- (nor one whose tractor stood on the nose line already, before it lifts the ring (job.stub): the rig, 2026-11-19:
    -- the tractor for elevator 2's forward aircraft was stopped in that instant, 6 m short of where it hooks on, in
    -- the way of the after aircraft's tow, was sent on first, and its aircraft was pulled 3.3 m past the tractor
    -- hooked on at the other's nose: hooked on, it stands clear of that tow)
    local hooking = j.tPull and not j.delivered and not j.move and (ph == 'lift' or ph == 'backup' or ph == 'hooked' or (j.stub and ph == 'arrive')) and not CATCC_DEMO_NO_G4D
    if j.yield and not d.hold and not hooking and not (M.atNose(j) and j.w.phase ~= 'pull') then
      d.hold, j.yieldAt, j.yieldSaid = true, mt, nil
      M.gave = (M.gave or 0) + 1
      if j.late and j.w.bar == 'both' then M.held = (M.held or 0) + 1 end
      logLine(string.format('demo: %s gives way to %s (near %.0f / %.0f): it stops and waits', j.tug.name, j.yield.to, j.yield.x, j.yield.z)
        .. (M.atNose(j) and string.format(': IT STANDS HOOKED ON to %s where that stands', tostring(j.a.board))
          or ((j.late and j.w.bar == 'both') and string.format(': IT HOLDS at %.1f / %.1f with %s on its bar', d.x, d.z, tostring(j.a.board)) or '')))
    elseif d.hold and not j.yield and not j.recall and mt - (j.yieldSeen or 0) >= 1 then
      d.hold = nil
      logLine(string.format('demo: %s goes on (it gave way for %.0f s)', j.tug.name, mt - (j.yieldAt or mt)))
    elseif CATCC_DEMO_YIELD_LOG and d.hold and j.yield and mt >= (j.ylogAt or 0) then
      -- (for the rig: every 10 s: what a job that stands giving way is held by)
      j.ylogAt = mt + 10
      local K = j.yield.job
      logLine(string.format('demo: YIELD %s (%s%s%s, %s, at %.0f / %.0f) to %s for %.0f s%s', j.tug.name, j.move and 'move' or (j.delivered and 'delivered' or 'tow'), j.freed and ' freed' or '', j.late and ' late' or '',
        tostring(j.w.phase), d.x, d.z, tostring(j.yield.to), mt - (j.yieldAt or mt),
        K and string.format(': that one %s%s, %s, at %.0f / %.0f%s, %d circles', K.move and 'move' or (K.delivered and 'delivered' or 'tow'), K.freed and ' freed' or '', tostring(K.w.phase), K.w.d.x, K.w.d.z, K.w.d.hold and ' held' or '', #(K.circles or {})) or ''))
      if K then
        local tj, tk, n = clockOf(j), clockOf(K), 0
        for _, a in ipairs(j.circles) do
          for _, c in ipairs(K.circles) do
            if n < 3 and hyp(a[1] - c[1], a[2] - c[2]) < a[3] + c[3] then
              local a1, a2 = a[4] and tj + a[4] or -HUGE, a[5] and tj + a[5] or HUGE
              local b1, b2 = c[4] and tk + c[4] or -HUGE, c[5] and tk + c[5] or HUGE
              if a1 > mt then
                n = n + 1
                logLine(string.format('  YIELD its %.0f / %.0f r %.1f (%.0f to %.0f s) against %.0f / %.0f r %.1f (%.0f to %.0f)%s', a[1], a[2], a[3], a1 - mt, a2 - mt, c[1], c[2], c[3], b1 - mt, b2 - mt,
                  (a1 < b2 + GAP.run and b1 < a2 + GAP.run) and ' SAME TIME' or ''))
              end
            end
          end
        end
      end
    elseif d.hold and j.yield and mt - (j.yieldAt or mt) > 90 and not j.yieldSaid then
      j.yieldSaid = true
      logLine(string.format('demo: %s HAS GIVEN WAY TO %s FOR 90 s', j.tug.name, j.yield.to))
      -- (what the two contest, for the log)
      local K = j.yield.job
      if K then
        local tj, tk, n = clockOf(j), clockOf(K), 0
        for _, a in ipairs(j.circles) do
          for _, c in ipairs(K.circles) do
            if hyp(a[1] - c[1], a[2] - c[2]) < a[3] + c[3] then
              local a1, a2 = a[4] and tj + a[4] or -HUGE, a[5] and tj + a[5] or HUGE
              local b1, b2 = c[4] and tk + c[4] or -HUGE, c[5] and tk + c[5] or HUGE
              if a1 < b2 + GAP.run and b1 < a2 + GAP.run and n < 6 then
                n = n + 1
                logLine(string.format('  its circle at %.0f / %.0f r %.1f (from %.0f s to %.0f s from now) against a circle of that one at %.0f / %.0f r %.1f (from %.0f to %.0f); that one is at %.0f / %.0f in phase %s%s', a[1], a[2], a[3], a1 - mt, a2 - mt,
                  c[1], c[2], c[3], b1 - mt, b2 - mt, K.w.d.x, K.w.d.z, tostring(K.w.phase), K.w.d.hold and ', held' or ''))
              end
            end
          end
        end
      end
    end
  end
end

-- A TRACTOR BY ITSELF THAT WAS CALLED BACK (job.recall: the aircraft it is for is up: startDeckJob): it is held (the
-- hook brakes it to a stand); true once it stands: it has then nothing in hand, where it is
-- (off: how far along its pull a tow's tractor is when its aircraft is off the platform: see startDeckJob)
M.LATE = { off = 26 }

-- A TOW'S CIRCLES DRAWN TIGHT, as they are now (for the other tow off the same platform: `free`, giveWay): its
-- tractor's way to the aircraft, the aircraft where it stands (until it is 14 m off), its pull, its push and spot.
-- One that has delivered: what it holds.
-- A TOW THAT HOOKED ON AT ONCE (job.late == 'nose') AND HAS NOT SET OFF YET.
-- atNose: it is hooking on, or stands hooked on; noseArr: its tractor is still on its way to the nose.
function M.atNose(j)
  if j.late ~= 'nose' or j.noseOff or j.delivered then return false end
  local ph = j.w.phase
  return ph == 'lift' or ph == 'backup' or ph == 'hooked' or ph == 'pull'
end

function M.noseArr(j)
  if j.late ~= 'nose' or j.noseOff or j.delivered then return false end
  local ph = j.w.phase
  return ph == 'arrive' or ph == 'backout'
end

-- what such a tow would sweep if it set off this moment: its pull and its push and spot (tight: against the other tow
-- off its platform), each with the time from now it would be held
function M.noseCs(j, pair)
  local out = {}
  for _, part in ipairs(pair and { j.tPull or {}, j.tKeep or j.keep or {} } or { j.pull or {}, j.keep or {} }) do
    for _, q in ipairs(part) do out[#out + 1] = q end
  end
  return out
end

-- THE TWO IN giveWay: one of them stands hooked on at its aircraft and the other began before it (or both stand so: the
-- one that began first counts as the other): it stands until nothing the other needs, by its clock, lies on its way
-- at the time it would be there if it set off now. The other does not give way to it. True: this was such a pair.
function M.noseYield(J, K, mt)
  if CATCC_DEMO_NO_NOSE then return false end
  local nJ, nK = M.atNose(J), M.atNose(K)
  if not nJ and not nK then return false end
  local N, O
  local bJ, bK = J.born or J.t0 or 0, K.born or K.t0 or 0
  if nJ and nK then
    if bJ <= bK then N, O = K, J else N, O = J, K end
  elseif nJ and (bK <= bJ or (J.after and J.after[K])) then
    N, O = J, K
  elseif nK and (bJ <= bK or (K.after and K.after[J])) then
    N, O = K, J
  end
  if not N then return false end
  -- (THE OTHER IS A TRACTOR BY ITSELF: the right of way (M.rowPair): it gives way to this tow as to any other: the rig,
  -- 2026-11-19: one drove across behind a tractor that was backing onto its bar, 0.5 m from it: "the other does not
  -- give way" to a tow that hooks on at once, and nothing held where it hooks on)
  if (O.move or O.delivered) and not CATCC_DEMO_NO_ROW then return false end
  local pair = N.pairE and N.pairE == O.pairE and N.tPull and O.tPull and not CATCC_DEMO_NO_PAIR
  local pad = 0
  if not pair and N.tPull and O.tPull and not O.delivered and not O.freed and not O.move and not CATCC_DEMO_NO_ALLTIGHT then pair, pad = true, M.PAD end
  local oNose = M.atNose(O)
  local OC = (oNose and M.noseCs(O, pair)) or (M.noseArr(O) and (O.seq or {})) or (pair and M.tightNow(O)) or O.circles
  -- (the other stands hooked on too: where its aircraft and its tractor stand is held all the while (they have no
  -- times): the rig, 2026-11-19: the second tow off elevator 2 was pulled past the first's tractor, hooked on at its
  -- aircraft's nose, 2.7 m from it)
  if oNose and not O.startGone then
    for _, q in ipairs((pair and O.tStart) or O.start or {}) do OC[#OC + 1] = { q[1], q[2], q[3] } end
  end
  local to = (O.t0 or 0) + (O.lag or 0)
  local bN, bO = (N.tA or 0) - TOW_T.pre, (O.tA or 0) - TOW_T.pre
  for _, a in ipairs(M.noseCs(N, pair)) do
    local a1 = a[4] and mt + math.max(0, a[4] - bN) or mt
    local a2 = a[5] and mt + math.max(0, a[5] - bN) or HUGE
    for _, b in ipairs(OC) do
      local d = a[3] + b[3] + pad
      local dx, dz = a[1] - b[1], a[2] - b[2]
      if dx * dx + dz * dz < d * d then
        local b1, b2
        if oNose then
          b1, b2 = b[4] and mt + math.max(0, b[4] - bO) or mt, b[5] and mt + math.max(0, b[5] - bO) or HUGE
        else
          b1, b2 = b[4] and to + b[4] or -HUGE, b[5] and to + b[5] or HUGE
        end
        if a1 < b2 + GAP.run and b1 < a2 + GAP.run then
          N.yield = N.yield or { to = O.tug.name, who = O.tug.name, x = a[1], z = a[2], job = O }
          return true
        end
      end
    end
  end
  return true
end

-- ABOUT HOW LONG A TOW'S PUSH TAKES, and the unhooking after it: from where its pull ends round the push's corner to
-- its place at the pace it backs (the tractor's own point is a tow's length beyond the wheels: so it is on the long
-- side), and M.END_PAD seconds. No push: the pad.
M.END_PAD = 15
function M.pushTime(plan, a)
  local n = 0
  if plan.push then
    local e = plan.pull and plan.pull[#plan.pull] or { a.x, a.z }
    local K = plan.push.K
    if K and K[1] then
      n = hyp(e[1] - K[1], e[2] - K[2]) + hyp(K[1] - plan.dest.x, K[2] - plan.dest.z)
    else
      n = hyp(e[1] - plan.dest.x, e[2] - plan.dest.z)
    end
  end
  return n / TOW.backSpeed + M.END_PAD
end

-- (what is added to two tows' tight circles where they are not the two of one platform)
M.PAD = 2.0

-- MAY A TRACTOR HOOK ON AT (x, z) AND STAND THERE: no other tow's own width (its tight circles; its push and spot as
-- 5.5 m at the most), and 1 m, comes to it there at any time
-- does a tractor stand on one of the places a tow was planned clear of (plan.vt: where the other aircraft of its
-- platform has its tractor)
function M.nearVt(vt, x, z)
  for _, P in ipairs(vt or {}) do
    if (x - P[1]) ^ 2 + (z - P[2]) ^ 2 < 9 then return true end
  end
  return false
end

function M.onVt(vt, t)
  for _, P in ipairs(vt or {}) do
    if (t.d.x - P[1]) ^ 2 + (t.d.z - P[2]) ^ 2 < 2.25 then return true end
  end
  return false
end

-- A DECK TRACTOR'S WAY TO THE NOSE OF AN AIRCRAFT: what `work` gives ({ arr, why2, bo, front }), kept for the deck as it
-- stands (M.sig) and where the tractor stands; worked out as planning spread over frames: nil while it is at it
-- (one turn a frame, however often it is asked in that frame).
function M.noseWay(a, t, work)
  local key = tostring(M.sig) .. '|' .. tostring(t.name) .. '|' .. string.format('%.1f|%.1f', t.d.x, t.d.z)
  local R = a.arrRes
  if R and R.key == key then return R end
  if CATCC_DEMO_NO_SLICE then
    R = work()
  else
    if a.arrCoKey ~= key then a.arrCo, a.arrCoKey = nil, key end
    if a.arrTurn == M.frameNo then return nil end
    a.arrTurn = M.frameNo
    local done
    done, R = M.sliced(a, 'arrCo', work)
    if not done then return nil end
    R = R or { why2 = 'the planning failed' }
  end
  R.key = key
  a.arrRes = R
  return R
end

function M.noseStandOk(t, x, z)
  for _, j in ipairs(M.jobs) do
    if j.level == 'deck' and j.tug ~= t and j.tPull and not j.delivered and not j.move and not j.freed then
      -- (a tow that was planned clear of this very place (job.vt): it is)
      local planned = false
      for _, P in ipairs(j.vt or {}) do
        if (P[1] - x) ^ 2 + (P[2] - z) ^ 2 < 1 then planned = true end
      end
      if not planned then
        for _, c in ipairs(M.tightNow(j)) do
          local r = math.min(c[3], 5.5) + 2.2 + 1.0
          if (c[1] - x) ^ 2 + (c[2] - z) ^ 2 < r * r then return false end
        end
      end
    end
  end
  return true
end

-- a tow that is pushing into its spot or unhooking there (not on its way to the aircraft, hooking on, or pulling)
function M.fixed(j)
  if not j.tPull or j.delivered or j.move or j.freed then return false end
  local ph = j.w.phase
  return not (ph == 'arrive' or ph == 'backout' or ph == 'lift' or ph == 'backup' or ph == 'hooked' or ph == 'pull')
end

-- IS A TOW'S WAY (the first 40 s of its pull, as its own width; from where it is, or from its beginning if it has not
-- set off) CLEAR OF WHERE ANOTHER STANDS (its tractor; its aircraft if that is on the bar)
function M.wayClearOf(r, o)
  if not r.tPull then return true end
  local stand = {}
  for _, q in ipairs(tugDiscs(o.tug)) do stand[#stand + 1] = { q[1], q[2], q[3] + 0.6 } end
  if o.w.bar == 'both' and o.w.jx and o.w.jfx then
    for _, u in ipairs({ -6, -1.5, 3, 7.5 }) do stand[#stand + 1] = { o.w.jx + o.w.jfx * u, o.w.jz + o.w.jfz * u, 4.4 } end
  end
  local mt = Tow.now()
  local pulling = r.w.phase == 'pull'
  local tr = (r.t0 or 0) + (r.lag or 0)
  for _, c in ipairs(r.tPull) do
    local at = pulling and (tr + (c[6] or 0) - mt) or ((c[6] or 0) - (r.tA or 0))
    if at > -3 and at < 40 and touch({ c }, stand) then return false end
  end
  return true
end

-- WHAT A TRACTOR BY ITSELF KEEPS OFF A TOW BY (five lanes, CATCC_DEMO_LANES5 only; without them what the tow holds, as before): the
-- tow's own width (4.6 m: M.tightNow) WHERE ITS TRACK RUNS STRAIGHT, so that a tractor in a far lane passes it; where
-- its track turns (more than 10 degrees within 12 m of a point, either way) what it holds there (8 m): on the inside of
-- a turn the aircraft is not on its tractor's track (the rig at 8 times speed, 2026-11-19: an aircraft passed a tractor
-- 2.9 m from its centre line where the tight circles were used everywhere); its push and spot as it holds them (9 m).
-- Kept for the job until its circles change (job.circles is a new table then: gather).
function M.towBand(j)
  if not CATCC_DEMO_LANES5 or not j.tPull or j.delivered or j.freed or j.move then return j.circles end
  local bc = j.bandOf
  if bc and bc.c == j.circles and bc.ph == j.w.phase then return bc.out end
  local tight = M.tightNow(j)
  local tp = j.tPull
  local turned = {}
  for i = 1, #tp do
    local ia, ib = math.max(1, i - 5), math.min(#tp, i + 5)
    local ok = ib - ia >= 2
    if ok then
      local m = math.max(ia + 1, math.min(ib - 1, i))
      local ax, az = tp[m][1] - tp[ia][1], tp[m][2] - tp[ia][2]
      local bx, bz = tp[ib][1] - tp[m][1], tp[ib][2] - tp[m][2]
      local la, lb = hyp(ax, az), hyp(bx, bz)
      if la > 0.5 and lb > 0.5 and (ax * bx + az * bz) / (la * lb) < math.cos(math.rad(10)) then turned[tp[i]] = true end
    end
  end
  local out = {}
  for _, q in ipairs(tight) do
    if turned[q] then
      local w = { q[1], q[2], 8.0 }
      for k = 4, 12 do w[k] = q[k] end
      out[#out + 1] = w
    else
      out[#out + 1] = q
    end
  end
  j.bandOf = { c = j.circles, ph = j.w.phase, out = out }
  return out
end

function M.tightNow(j)
  if j.delivered or j.freed or not j.tPull then return j.circles end
  local out = {}
  -- (its push and spot: what it still holds of them once it pushes: job.keep, given up behind it as it goes)
  -- (its way to the aircraft: only while it is on it: once it hooks on it stands where tStart has it)
  local ph = j.w.phase
  for _, part in ipairs({ (ph == 'arrive' or ph == 'backout' or ((ph == 'lift' or ph == 'backup') and not CATCC_DEMO_NO_HOOKTRACK)) and j.seq or {}, (not j.startGone) and j.tStart or {}, j.tPull,
    (ph == 'push' and j.keep) or j.tKeep or j.keep or {} }) do
    for _, q in ipairs(part) do out[#out + 1] = q end
  end
  return out
end

-- MAY A TRACTOR STOP AND STAND WHERE IT IS NOW (and over the 6 m it brakes in): nothing another tractor's job still
-- holds, now or later, comes within a metre of it there
function M.standFree(tug)
  local d = tug.d
  local now = Tow.now()
  for _, j in ipairs(M.jobs) do
    if j.level == 'deck' and j.tug ~= tug then
      local tj = (j.t0 or 0) + (j.lag or 0)
      for _, c in ipairs(j.circles or {}) do
        if not c[5] or tj + c[5] > now then
          for _, u in ipairs({ -2, 1.5, 5 }) do
            if (c[1] - d.x - d.hx * u) ^ 2 + (c[2] - d.z - d.hz * u) ^ 2 < (c[3] + 3.4) ^ 2 then return false end
          end
        end
      end
    end
  end
  return true
end

function M.recalled(job, mt)
  local d = job.w.d
  d.hold = true
  job.recallAt = job.recallAt or mt
  if (d.v or 0) > 0.01 and mt - job.recallAt < 8 then return false end
  job.tug.place, d.hold = nil, nil
  logLine(string.format('demo: %s stands where it was called back (%.1f / %.1f)', job.tug.name, d.x, d.z))
  return true
end

function M.tick(t)
  if not M.on then return end
  -- (the deck as the slot picker shows it, once a second: M.deckMap)
  if api.deckmap and t >= (M.mapAt or 0) then
    M.mapAt = t + 1
    pcall(function() api.deckmap(M.deckMap()) end)
  end
  local ctx = Tow.Deck.ctx(t)
  if not ctx or ctx.ship ~= M.ship then
    ctx = api.getCtx(nil, nil, M.ship)
    if not ctx then return end
  end
  local mt = Tow.now()
  -- (tractors still without a driver: looked for again; with them DCS's catapult crews have come: sent away as at
  -- the start)
  if M.driverAt and mt >= M.driverAt then
    M.driverAt = mt + 5
    local had = 0
    for _, tg in ipairs(M.tugs) do
      if tg.driver then had = had + 1 end
    end
    local okd, seated = pcall(M.seatDrivers, ctx, api.native())
    if not okd then
      logLine('demo: looking for the drivers again: ' .. tostring(seated))
    elseif #seated > had then
      local oks, sent = pcall(Tow.Aux.crewsAway, ctx, CREW_AWAY)
      logLine(string.format('demo: %d more driver(s) found and seated: %d of %d tractors have one; catapult crews sent away: %s', #seated - had, #seated, #M.tugs, tostring(oks and sent or sent)))
      if #seated >= #M.tugs then M.driverAt = nil end
    end
  end
  giveWay(mt)
  if M.relH and mt - (M.relHt or 0) >= 2 then
    M.relH, M.relHt = nil, mt
    -- (an elevator whose aircraft waits for a way that was in use looks again: its search only, not the hangar's)
    for _, E in ipairs(M.elevators) do
      if E.search and E.search.done and tostring(E.search.why):find('in use', 1, true) then E.search, E.sig = nil, nil end
    end
  end
  -- (a tractor that stood hooked on from the start and was given something else: M.preDrop)
  for _, tg in ipairs(M.tugs) do
    if tg.pre and ((tg.job and tg.job.w ~= tg.pre.w) or tg.pre.a.towed) then M.preDrop(tg) end
  end
  -- (the drivers of tractors that stand: a look round now and then (Tow.Head: crewtest_head.lua); four times a second)
  if Tow.Head then Tow.Head.idle(api.native(), M.tugs, mt) end
  -- the tows in hand
  for i = #M.jobs, 1, -1 do
    local job = M.jobs[i]
    local w = job.w
    local okt, good, err = pcall(Tow.tickOne, w, ctx, mt)
    Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks = nil, nil, nil
    if job.level == 'hangar' and okt and good and (job.shift or job.freed or w.phase == 'arrive') then wayLetGo(job) end
    if job.level == 'hangar' and okt and good and not job.shift and not job.freed and job.a then M.sweepLetGo(job, mt) end
    if job.level == 'hangar' and job.after and not job.shift and not job.freed and job.a then M.followTick(job, mt) end
    if job.shift then
      -- a hangar tractor by itself, moving off to another place to wait at (hangarShift)
      if not okt or not good or w.phase == 'parked' then
        logLine(string.format((okt and good) and 'demo: %s stands at its new place (%.1f / %.1f)' or 'demo: %s by itself: STOPPED (%.1f / %.1f): ' .. tostring(okt and err or good), job.tug.name, w.d.x, w.d.z))
        if okt and good then settle(job.tug) end
        table.remove(M.jobs, i)
        job.tug.job, job.tug.idleAt, job.tug.d.hold = nil, mt, nil
        changed(true)
      end
    elseif job.move then
      -- a tractor by itself, on its way to where it waits or to the junkyard
      if not okt or not good then
        logLine(string.format('demo: %s by itself: STOPPED: %s', job.tug.name, tostring(okt and err or good)))
        finishMove(job, mt)
      elseif job.recall and (job.park and job.park.step) then
        job.recall = nil -- (it is backing in by now: it ends that)
      elseif job.recall and M.recalled(job, mt) then
        finishMove(job, mt)
      elseif parkStep(job) then
        job.tug.place = placeOf(job)
        -- (parked where the tows are planned past it: they are looked at again)
        if job.tug.place and not job.tug.place.wait then changed() end
        logLine(string.format('demo: %s stands %s (%.1f / %.1f)%s', job.tug.name, job.tug.place and ('at ' .. placeText(job.tug.place, job.tug)) or 'short of where it was going', w.d.x, w.d.z,
          (job.tug.place and job.tug.place.wait and job.tug.waitFor) and string.format(': %s is up in %.0f s', tostring(job.tug.waitFor.a.board), job.tug.waitFor.readyIn or 0) or ''))
        finishMove(job, mt)
      else
        letGo(job, mt)
      end
    elseif not okt or not good then
      logLine(string.format('demo: %s with %s: STOPPED: %s', job.tug.name, job.a.name, tostring(okt and err or good)))
      M.failed = (M.failed or 0) + 1
      if job.load then job.load.done = true end -- (left where it is: the demo goes on without it)
      finish(job, mt, true)
    else
      -- the aircraft is where the tow has it
      if w.bar == 'both' and w.jx then job.a.x, job.a.z, job.a.fx, job.a.fz = w.jx, w.jz, w.jfx, w.jfz end
      -- ITS CHOCKS (the user, 2026-11-17: "Before an aircraft can be towed its chocks need to be removed (visually)
      -- ... Chocks should be reinserted after the tow is complete"): out once the tractor is hooked on, in again a
      -- second after it has stopped at its place
      -- (stopped short of a hangar door on its push: in, a second after it has stopped there)
      if w.phase == 'push' and w.pushHeld then job.stoodAt = job.stoodAt or mt else job.stoodAt = nil end
      local rolling = w.phase == 'hooked' or w.phase == 'pull' or (w.phase == 'push' and not (job.stoodAt and mt - job.stoodAt >= 1)) or (w.phase == 'arrived' and (w.clock or mt) - (w.t0 or mt) < 1)
      -- (and never in the frame it still moved in: a frame is worth 2 s of the mission at 8 times speed)
      if w.jx then
        if job.cx and hyp(w.jx - job.cx, w.jz - job.cz) > 0.005 then rolling = true end
        job.cx, job.cz = w.jx, w.jz
      end
      if not job.freed and job.a.chocks == rolling then
        job.a.chocks = not rolling
        foldWings(job.a)
      end
      if job.level == 'deck' then letGo(job, mt) end
      -- OFF ITS ELEVATOR'S LIST ONCE IT IS OFF THE PLATFORM (it was: when it stood parked: the platform stayed up until
      -- then): the elevator goes down for its next aircraft as soon as the last one is off it and nothing a tractor
      -- holds lies over it (the user, 2026-11-18: "pull the aircraft off the elevator so it can go back down")
      if job.level == 'deck' and job.startGone and not job.offEl and job.E and not job.freed then
        job.offEl = true
        for k, r in ipairs(job.E.riders) do
          if r == job.a then table.remove(job.E.riders, k) break end
        end
        job.E.retry = 0
      end
      -- SHORT OF THE DOOR: the aircraft stands, its tractor stays on the bar (the hook holds the tow: w.hold) until the
      -- elevator is down; what the job holds is now only where the two stand
      if job.to == 'ready' and not job.held and (w.phase == 'arrived' or (w.phase == 'push' and w.pushHeld)) then
        job.held, job.load.held = true, true
        local c = bodyCircles({}, w.lx, w.lz, w.mx, w.mz)
        c[#c + 1] = { w.d.x, w.d.z, 2.6 }
        if job.door then
          -- (and the rest of its push: straight on to its place on the platform)
          local S = H.elevators[job.E.k].stations[job.load.st]
          local l2x, l2z = S.x + S.fx * TOW.noseGear, S.z + S.fz * TOW.noseGear
          local m2x, m2z = S.x - S.fx * TOW.mainGear, S.z - S.fz * TOW.mainGear
          bodyCircles(c, (w.lx + l2x) / 2, (w.lz + l2z) / 2, (w.mx + m2x) / 2, (w.mz + m2z) / 2)
          bodyCircles(c, l2x, l2z, m2x, m2z)
        end
        job.circles = c
        changed(true)
        logLine(string.format('demo: %s stands short of the door of elevator %d (%.2f / %.2f), %s on its bar', job.a.name, job.E.k, w.jx or 0, w.jz or 0, job.tug.name))
      end
      -- (OR ITS TRACTOR STANDS OFF THE BAR AND ONLY WAITS FOR ITS WAY ON (w.freeWait: the hook): the tow is over: the
      -- aircraft is on the platform and what the tow swept is given up now, not when the tractor's way is found (the
      -- rig, 2026-11-20, at real time, a new unloading order: elevator 4's first aircraft of its last trip stood on
      -- its place at 11:51; its tractor waited 47 s for a way to the next aircraft's nose, which another tow crossed;
      -- until then the aircraft was not counted aboard and the next tow was not looked for, nor begun by another
      -- tractor. Its way, once found, is held from then (job.freedEarly). OFF (CATCC_DEMO_FREEWAIT switches it on): with
      -- the order of 2026-11-20 elevator 4 was up 36 s sooner, but elevator 2 went up 45 s after its last aircraft was
      -- aboard, its tractor 6 m off the platform waiting for its way: 3732 s for the four runs against 3662 without.)
      local early = not job.freed and CATCC_DEMO_FREEWAIT and job.level == 'hangar' and job.to == 'el' and w.freeWait
      if not job.freed and (w.phase == 'leave' or w.phase == 'parked' or job.delivered or w.homeSet or early) then
        -- delivered: the aircraft stands, its bar on it; the tractor is on its way back
        job.freed = true
        job.freedEarly = early or nil
        -- (IN THE HANGAR: what the tow swept is given up: from here on the job holds the tractor's way back only (a
        -- band 2 m either side of it) and where the tractor is. Until 2026-11-18 it kept the whole tow's room until
        -- the tractor was parked: the next aircraft beside it waited a minute and more for nothing.)
        if job.level == 'hangar' then
          local cs = circles({}, w.d.path or {}, 2.0)
          job.wayN, job.wayAt = #cs, nil
          cs[#cs + 1] = { w.d.x, w.d.z, 2.9 }
          job.circles = cs
        end
        local a = job.a
        a.x, a.z, a.fx, a.fz = w.jx, w.jz, w.jfx, w.jfz
        a.towed = nil
        -- (NOT ON THE PLATFORM: its tow stopped short of it (the hook's w.pushShort: the push could not begin, even after
        -- waiting on the bar), or it stands off it for another reason: it is not taken up with the platform (the user's
        -- run of 2026-11-26: such an aircraft was raised through the hangar's ceiling). Left where it stands, as a tow
        -- that STOPPED is: the elevator goes on without it)
        local pe = job.to == 'el' and H.elevators[job.E.k]
        if pe and (w.pushShort or a.x < pe.x[1] - 1 or a.x > pe.x[2] + 1 or a.z < math.min(pe.z[1], pe.z[2]) - 1 or a.z > math.max(pe.z[1], pe.z[2]) + 1) then
          job.load.done = true
          M.failed = (M.failed or 0) + 1
          logLine(string.format('demo: %s is NOT on elevator %d: its tow stopped short of the platform (%.2f / %.2f): it stays in the hangar where it stands; the elevator goes on without it', a.name, job.E.k, a.x, a.z))
          say(string.format('demo: %s could not be pushed onto elevator %d: it stays in the hangar.', a.name, job.E.k))
        elseif job.to == 'el' then
          a.level, a.st = 'el', job.load.st
          a.y = H.elevators[job.E.k].top - drop(job.E.k, job.E.f or 1) + DY -- (it stands on the platform, 11 cm above the hangar's floor)
          job.E.riders[#job.E.riders + 1] = a
          job.load.done = true
          -- (its bar is the aircraft's from here on, not this tow's: the tow went on placing it on the hangar's
          -- level while its tractor drove home, and the platform went up without it: the rig, 2026-11-18: the bar
          -- of an aircraft that had come up stood 11.4 m below it until the hangar tractor was back)
          if w.ids then w.ids.bar = nil end
          logLine(string.format('demo: %s is on elevator %d (%.2f / %.2f)', a.name, job.E.k, a.x, a.z))
        else
          for k, r in ipairs(job.E.riders) do
            if r == a then table.remove(job.E.riders, k) break end
          end
          a.level, a.parked = 'deck', true
          M.moved = (M.moved or 0) + 1
          -- (on its spot: its bar is taken away, its covers come off)
          if w.ids then w.ids.bar = nil end
          spotted(a)
          logLine(string.format('demo: %s is parked on %s, %.2f m from the spot: chocks in, covers off, its tow bar taken away', a.name, tostring(a.spot.name), hyp(a.x - a.spot.x, a.z - a.spot.z)))
        end
        placeAircraft(a)
        changed(job.level == 'hangar')
      end
      if job.freedEarly and (w.homeSet or w.phase == 'leave' or w.phase == 'backout') then
        -- (freed while it waited: its way on is what it holds from now)
        job.freedEarly = nil
        local cs = circles({}, w.d.path or {}, 2.0)
        job.wayN, job.wayAt = #cs, nil
        cs[#cs + 1] = { w.d.x, w.d.z, 2.9 }
        job.circles = cs
        changed(true)
      end
      if job.recall and (job.park and job.park.step) then job.recall = nil end
      if job.level == 'deck' and job.freed and job.recall and M.recalled(job, mt) then
        finish(job, mt, false)
      elseif (job.level == 'deck' and job.freed and parkStep(job)) or (job.level ~= 'deck' and w.phase == 'parked') then
        if job.level == 'deck' then
          job.tug.place = placeOf(job)
          logLine(string.format('demo: %s is idle %s (%.1f / %.1f)', job.tug.name, job.tug.place and ('at ' .. placeText(job.tug.place, job.tug)) or 'where its tow ended: the aircraft it is for is up', w.d.x, w.d.z))
        else
          local off, deg = settle(job.tug)
          logLine(string.format('demo: %s is back and idle (%.1f / %.1f)%s', job.tug.name, w.d.x, w.d.z, off and string.format(': on its post (it came to %.2f m and %.1f degrees off it)', off, deg)
            or (job.tug.claim and (': at the nose of ' .. tostring(job.tug.claim.ld.a.board) .. ', its next') or ': NOT at a post')))
        end
        finish(job, mt, false)
      end
    end
  end
  -- (the hangar's planning: one step a frame in all; the elevators have it in turn. CATCC_DEMO_BUDGET: a test's own:
  -- its frames are a quarter of a second long)
  M.budget, M.turn = CATCC_DEMO_BUDGET or 1, ((M.turn or 0) + 1) % 4
  M.frameCalls, M.frameNo, M.frameT0 = 0, (M.frameNo or 0) + 1, M.cpu and M.cpu() or 0
  for n = 1, #M.elevators do
    local E = M.elevators[(M.turn + n - 1) % #M.elevators + 1]
    local busy = false
    -- (its next aircraft goes as soon as the one before is delivered; on the flight deck as soon as the one before
    -- has left the platform: another tractor takes it, when what that tow still holds lets it)
    for _, j in ipairs(M.jobs) do
      -- (not the hangar's: an aircraft may be on its way to the door below while the platform is up)
      if j.E == E and j.level == 'deck' and not j.freed and not j.startGone then busy = true end
    end
    E.busy = busy or nil
    tickElevator(E, ctx, mt)
  end
  assign(mt)
  idleTugs(mt)
  -- (what the tractors hold has changed: said to those that wait at most every 2 s)
  if M.relWant and mt >= (M.relAt or 0) then
    M.rel, M.relWant, M.relAt = (M.rel or 0) + 1, nil, mt + 2
  end
  if #M.aircraft > 0 then
    M.foldI = (M.foldI or 0) % #M.aircraft + 1
    foldWings(M.aircraft[M.foldI])
  end
  -- everything else stays where it is: two things a frame told their place again, in turn
  local n = #M.aircraft + #M.tugs
  for _ = 1, 2 do
    M.keep = (M.keep or 0) % n + 1
    if M.keep <= #M.aircraft then
      local a = M.aircraft[M.keep]
      if a.id and not a.towed then placeAircraft(a) end
    else
      local tg = M.tugs[M.keep - #M.aircraft]
      if not tg.job then placeTug(tg) end
    end
  end
  -- (the brake riders: brown shirts in the cockpits of the aircraft being towed: M.cockpitTick)
  if M.cockpit then
    local okc, errc = pcall(M.cockpitTick, ctx, mt)
    if not okc and not M.cockpitErr then
      M.cockpitErr = true
      logLine('demo: the brake riders: ' .. tostring(errc))
    end
  end
  -- done?
  if not M.done then
    local left = false
    for _, E in ipairs(M.elevators) do
      if E.trips[E.trip] or E.state ~= 'up' or (#E.riders > 0 and not E.staying) then left = true end
    end
    -- (and every deck tractor back in the junkyard; one that cannot get there is given a minute)
    for _, tg in ipairs(M.tugs) do
      if tg.level == 'deck' and tg.place ~= tg.home and not (tg.stuckAt and mt - tg.stuckAt > 180) then left = true end
    end
    if not left and #M.jobs == 0 then
      M.done = true
      for _, E in ipairs(M.elevators) do
        for _, a in ipairs(E.riders) do a.parked = true end
      end
      local txt = string.format('demo: the deck is spotted: %d aircraft on the flight deck (%d came up from the hangar: %d towed on to their spots, %d stay on the elevators); the tractors are parked. %.0f minutes.%s%s',
        M.count(), M.hangarN, M.moved or 0, M.hangarN - (M.moved or 0) - (M.failed or 0), (mt - M.t0) / 60,
        (M.failed or 0) > 0 and string.format(' %d could not be moved (the log has why).', M.failed) or '', (M.notClear or 0) > 0 and (M.notClear == 1 and ' 1 tow was not clear of another aircraft (the log has which).' or string.format(' %d tows were not clear of another aircraft (the log has which).', M.notClear)) or '')
      logLine(txt)
      if CATCC_DEMO_LANE_STATS and M.laneStats then
        local L = M.laneStats
        logLine(string.format('demo: LANES the tractors\' own ways, metres: in their lane (inner) %d, in their far lane %d, on a centreline %d, between lanes %d, in a lane the wrong way %d, off the roads %d',
          L.inner or 0, L.far or 0, L.centre or 0, L.between or 0, L.wrong or 0, L.off or 0))
      end
      -- (on the screen only when something did not go as planned)
      if (M.failed or 0) > 0 or (M.notClear or 0) > 0 then say(txt) end
    end
  end
  -- nothing moving for a long while: said once, in the log
  if #M.jobs > 0 then
    M.idleSince = nil
  elseif not M.done then
    M.idleSince = M.idleSince or mt
    if mt - M.idleSince > 180 and not M.stuckSaid then
      M.stuckSaid = true
      local whys = {}
      for _, E in ipairs(M.elevators) do whys[#whys + 1] = string.format('elevator %d %s, trip %d: %s', E.k, E.state, E.trip, tostring(E.why or '-')) end
      logLine('demo: NOTHING HAS MOVED FOR 3 MINUTES: ' .. table.concat(whys, '; '))
    end
  end
end

function M.count()
  local n = 0
  for _, a in ipairs(M.aircraft or {}) do
    if a.id and a.level == 'deck' then n = n + 1 end
  end
  return n
end

-- ---------------------------------------------------------------- starting and stopping
local function livery(sq, board, lead)
  return string.format('%s - LineJet%s - %d', sq, lead and '-FL' or '', board)
end

-- THE BRAKE RIDERS (Tow.Cockpit: crewtest_cockpit.lua; our people named catcc-b...: brown shirts). The user
-- (2026-11-25): "Please add brown shirts to the cockpit of aircraft being towed. They should spawn into the cockpit just
-- before the tug arrives. They should remain in the cockpit until the tug is clear." Found as the drivers are (looked
-- for again every 5 s until all nine are there: a server makes its people only once a player is aboard).
M.RIDERS = 9
function M.findRiders(ctx)
  if not (Tow.Cockpit and M.cockpit) then return 0 end
  local scan = api.doScan(ctx, 'for the demo: the brake riders', false)
  local found = {}
  for _, q in ipairs(scan and scan.mine or {}) do
    if tostring(q.name):find('^catcc%-b%d') then
      found[#found + 1] = { h = q.h, name = tostring(q.name) }
      api.walkQueue[q.h], api.holding[q.h] = nil, nil
    end
  end
  local n = Tow.Cockpit.add(M.cockpit, found)
  if n > 0 then logLine(string.format('demo: %d brake rider(s) found (%d of %d)', n, #M.cockpit.pool, M.RIDERS)) end
  return #M.cockpit.pool
end

-- each frame: the aircraft the tractors are working on, as crewtest_cockpit.lua takes them (C.tick: coming, on, done)
function M.cockpitTick(ctx, mt)
  local CK = M.cockpit
  if M.riderAt and mt >= M.riderAt then
    M.riderAt = (M.findRiders(ctx) < M.RIDERS) and mt + 5 or nil
  end
  if #CK.pool == 0 then return end
  local list, seen = {}, {}
  CK.tugOf = CK.tugOf or {}
  for _, job in ipairs(M.jobs) do
    local a, w = job.a, job.w
    if a and w and not job.move and not job.shift and type(w.subj) == 'table' and w.subj.e == a then
      seen[a] = true
      local tx, tz = Tow.real(w)
      local e = { key = a, name = a.name, tx = tx, tz = tz }
      if job.freed or job.delivered then
        e.stage, e.x, e.y, e.z, e.fx, e.fz = 'done', a.x, a.y, a.z, a.fx, a.fz
        CK.tugOf[a] = job.tug
      else
        e.x, e.y, e.z, e.fx, e.fz = w.jx or a.x, w.jy or a.y, w.jz or a.z, w.jfx or a.fx, w.jfz or a.fz
        if (w.phase == 'arrive' or w.phase == 'backout') and w.bar ~= 'both' then
          e.stage = 'coming'
          -- (where it hooks on: the tractor's own point then (w.d is that point, whichever hitch it uses))
          local hp = w.hitchAt
          e.tx, e.tz = w.d.x, w.d.z
          if hp then e.hx, e.hz = hp.x, hp.z end
        else
          e.stage = 'on'
        end
      end
      list[#list + 1] = e
    end
  end
  -- (DELIVERED, ITS TRACTOR ALREADY GIVEN SOMETHING ELSE (its next tow at once, or its job ended): the rider still
  -- waits until that tractor is clear of the aircraft: the tractor followed wherever its work now is)
  for a, tug in pairs(CK.tugOf) do
    if seen[a] or not CK.aboard[a] then
      if not CK.aboard[a] then CK.tugOf[a] = nil end
    else
      local tx, tz = tug.d.x, tug.d.z
      if tug.job and tug.job.w and tug.job.w.d == tug.d then tx, tz = Tow.real(tug.job.w) end
      list[#list + 1] = { key = a, name = a.name, stage = 'done', x = a.x, y = a.y, z = a.z, fx = a.fx, fz = a.fz, tx = tx, tz = tz }
    end
  end
  -- (ON A PLATFORM BETWEEN ITS TWO TRACTORS: the rider stays in (the user, 2026-11-26: "I would prefer the brake rider
  -- to remain in the cockpit during elevator rides between tugs"), from the hangar's tractor leaving it to the deck's
  -- taking it; not one of the two that stay on the platform as their deck spots, once it is up (a.stayed))
  for _, E in ipairs(M.elevators or {}) do
    for _, a in ipairs(E.riders or {}) do
      if not a.stayed then list[#list + 1] = { key = a, name = a.name, stage = 'hold', x = a.x, y = a.y, z = a.z, fx = a.fx, fz = a.fz } end
    end
  end
  Tow.Cockpit.tick(CK, api.native(), Tow.Head, mt, list, M.cockpitCb)
end

M.cockpitCb = {
  -- (in: its canopy opens, and stays open)
  board = function(a)
    if not a.canopy then
      a.canopy = true
      foldWings(a)
    end
  end,
  log = function(text) logLine('demo: ' .. text) end,
}

-- THE DRIVERS (our people named catcc-t...: one to a tractor, the deck's tractors first): every one found now that
-- has no tractor yet is seated on the next tractor without a driver. The list of all that are seated.
function M.seatDrivers(ctx, native)
  local scan = api.doScan(ctx, 'for the demo', false)
  local found, seated, has = {}, {}, {}
  for _, tg in ipairs(M.tugs) do
    if tg.driver then
      has[tg.driver.name] = true
      seated[#seated + 1] = tg.driver
    end
  end
  for _, q in ipairs(scan and scan.mine or {}) do
    if tostring(q.name):find('^catcc%-t%d') and not has[tostring(q.name)] then found[#found + 1] = q end
  end
  table.sort(found, function(a, b) return tostring(a.name) < tostring(b.name) end)
  local order = {}
  for _, tg in ipairs(M.tugs) do if tg.level == 'deck' and not tg.driver then order[#order + 1] = tg end end
  for _, tg in ipairs(M.tugs) do if tg.level == 'hangar' and not tg.driver then order[#order + 1] = tg end end
  for i, q in ipairs(found) do
    local tg = order[i]
    if tg then
      tg.driver = { h = q.h, name = tostring(q.name) }
      seated[#seated + 1] = tg.driver
      api.walkQueue[q.h], api.holding[q.h] = nil, nil
      -- (his head turns if it can (Tow.Head: crewtest_head.lua): then he sits in the blend space of ours)
      -- (else in the seated pose: ours with the limbs at the pedals and the wheel when the mod has it: Tow.sit)
      if not (Tow.Head and Tow.Head.seat(native, tg.driver)) then Tow.sit(native, q.h) end
      -- (after the start: what the start does for a driver it finds: the Hide switches' list, his place on the tractor)
      if M.on then
        if M.hideMen then M.hideMen[q.h] = M.hideMen[q.h] or {} end
        pcall(placeTug, tg)
        -- (A TOW OR A DRIVE ALREADY BEGUN WAS MADE WITHOUT HIM (it takes its tractor's driver when it is made): the
        -- user's run of 2026-11-23: "the drivers of the hangar tugs were floating inside the hangar and not attached
        -- to their tugs", until each tractor's next drive: every tow object of this tractor is given him now)
        local function give(w)
          if type(w) == 'table' and type(w.ids) == 'table' and w.ids.tug == tg.id and w.driver == nil then w.driver = tg.driver end
        end
        for _, v in pairs(tg) do
          if type(v) == 'table' then
            give(v)
            give(rawget(v, 'w'))
          end
        end
        for _, job in ipairs(M.jobs or {}) do
          give(job)
          give(job.w)
        end
      end
    end
  end
  return seated
end

-- (the slot picker's "Spot All" / "Spot Deck", ahead of a start: 1: every aircraft on its deck spot at once)
function M.all(v) M.spotAll = tonumber(v) == 1 end

function M.start()
  if M.on then return say('demo: it is running already (the same key, or F10 > CATCC demo, stops it).') end
  local native = api.native()
  if not native then return say('demo: the native module is not loaded.') end
  if not (native.staticpos and native.place and native.staticinfo and Tow.tickOne) then return say('demo: this needs the newer native module and hook: run crew-test\\install.ps1 with DCS closed.') end
  H = api.hangar()
  if not H then return say('demo: the hangar\'s plan is missing (Scripts\\CATCC\\crewtest_hangar.lua): run crew-test\\install.ps1 with DCS closed.') end
  local routes = api.routes()
  if not (routes and routes.net) then return say('demo: the deck\'s spots and taxi network are missing (Scripts\\CATCC\\crewtest_routes.lua): run crew-test\\install.ps1 with DCS closed.') end
  -- the deck tool's own aircraft would be in the way: taken away
  if Tow.Deck.list and Tow.Deck.shown then api.run('spot|clear') end
  local ctx, err = Tow.Deck.ctx()
  if not ctx then return say('demo: ' .. tostring(err) .. ' (put the camera over the carrier).') end
  M.ship, M.thetaIn = ctx.ship, Tow.thetaIn()
  -- (the rig: CATCC_DEMO_LEAD: another lead for the deck tractors' departure (DISPATCH.lead))
  if tonumber(CATCC_DEMO_LEAD) then DISPATCH.lead = tonumber(CATCC_DEMO_LEAD) end
  M.jobs, M.aircraft, M.tugs, M.elevators, M.el = {}, {}, {}, {}, {}
  M.done, M.moved, M.failed, M.notClear, M.stuckSaid, M.idleSince, M.keep, M.tried, M.sig, M.foldBad, M.foldI = nil, 0, 0, 0, nil, nil, 0, {}, 1, nil, 0
  M.rel, M.relWant, M.relAt, M.argBad, M.sigH, M.turn = 0, nil, 0, nil, 1, 0
  M.giveAt, M.gave, M.crossed, M.crossSaid, M.assignAt, M.raiseT = 0, 0, 0, {}, 0, nil
  FIND.deck, FIND.lu, FIND.lv, FIND.lc = {}, nil, nil, nil
  local bySpot = {}
  for _, e in ipairs(routes) do
    if e.spot and e.id then bySpot[e.id] = e end
  end
  -- the forty, by their deck spots: flight by flight
  local byId = {}
  for fi, fl in ipairs(FLIGHTS) do
    for i, id in ipairs(fl.spots) do
      local sp = bySpot[id]
      if sp then
        local a = { n = #M.aircraft + 1, spot = sp, flight = fi, board = fl.boards[i], livery = livery(fl.sq, fl.boards[i], i == 1), level = 'deck',
          x = sp.x, z = sp.z, fx = sp.fx, fz = sp.fz, y = DECK_Y + DY, parked = true, chocks = true, covers = false }
        a.name = string.format('%d (%s, flight %d, for %s)', a.board, fl.sq == 'KING' and 'VFA-44' or 'VFA-161', fi, tostring(sp.name))
        a.key = 'catcc-demo-a' .. a.n
        M.aircraft[#M.aircraft + 1] = a
        byId[id] = a
      end
    end
  end
  -- THE MISSION'S SLOTS' PAINT (M.paint, from the slot picker: "<DCS parking spot>=<livery>"): the aircraft spotted on
  -- a slot's parking spot wears that slot's livery and board number, which DCS gives the player's jet there; the one
  -- that wore it takes the first's (the user's run of 2026-11-20: his slot on spot 1 painted 744, the demo's 744 spotted
  -- elsewhere: he chose it and it had no slot)
  for spot, lv in pairs(M.slotPaint or {}) do
    local target, donor
    for _, a in ipairs(M.aircraft) do
      if tonumber(a.spot.spot) == spot then target = a end
    end
    local num = tonumber(tostring(lv):match('(%d+)%s*$'))
    if target and num and target.board ~= num then
      for _, a in ipairs(M.aircraft) do
        if a ~= target and a.board == num then donor = a end
      end
      if donor then
        donor.board, donor.livery = target.board, target.livery
        donor.name = donor.name:gsub('^%d+', tostring(donor.board))
      end
      target.board, target.livery = num, lv
      target.name = target.name:gsub('^%d+', tostring(num))
      logLine(string.format('demo: spot %d (%s) painted %s for the mission\'s slot there%s', spot, tostring(target.spot.name), tostring(lv), donor and (' (its paint to the one for ' .. tostring(donor.spot.name) .. ')') or ''))
    end
  end
  -- the hangar's: where each stands down there, and its elevator's list (the user's order: loadsOf; CATCC_DEMO_LOADS:
  -- a test's own choice)
  -- (M.spotAll, the slot picker's "Spot All": none goes below: every aircraft stays on its deck spot, where it was
  -- put above, and nothing is towed)
  -- (CATCC_DEMO_SPOT_ALL: the rig's)
  local LOADS = (M.spotAll or CATCC_DEMO_SPOT_ALL) and {} or (CATCC_DEMO_LOADS or loadsOf(H))
  local hangarN = 0
  -- (the player's own jet: an elevator it stands on is not moved, a spot it stands on gets no aircraft: those stay
  -- unmade)
  M.sig, M.liveSig = 1, nil
  local pj, notUp = liveJet(), {}
  -- (deck spots left without an aircraft: LEFT_EMPTY; CATCC_DEMO_EMPTY: a test's own, as "PQ3,FT2")
  for id in tostring(CATCC_DEMO_EMPTY or LEFT_EMPTY):gmatch('%w+') do
    local a0 = byId[id]
    if a0 then a0.level, a0.parked, a0.skip = 'none', nil, true end
  end
  for k = 1, 4 do
    local E = { k = k, state = 'up', trips = {}, trip = 1, riders = {}, f = 0, at = {}, pre = {}, pool = {}, stay = {}, wait = {} }
    local e = H.elevators[k]
    local onIt = pj and pj.x > e.x[1] - 4 and pj.x < e.x[2] + 4 and pj.z > math.min(e.z[1], e.z[2]) - 4 and pj.z < math.max(e.z[1], e.z[2]) + 4
    for _, ld in ipairs(LOADS[k] or {}) do -- (LOADS: the plan's order: loadsOf)
      local a = byId[ld.spot]
      local slot
      for _, sl in ipairs(H.slots) do
        if sl.n == ld.n then slot = sl end
      end
      if a and slot and (onIt or (pj and hyp(a.spot.x - pj.x, a.spot.z - pj.z) < 12)) then
        a.level, a.parked, a.skip = 'none', nil, true
        notUp[#notUp + 1] = tostring(a.spot.name)
      elseif a and slot then
        a.level, a.parked, a.x, a.z, a.fx, a.fz, a.y, a.hasBar, a.covers, a.slot = 'hangar', nil, slot.x, slot.z, slot.fx, slot.fz, H.floor + DY, true, true, slot.n
        local load = { a = a, stay = ld.stay, n = ld.n, after = ld.after }
        local solved = H.tows and H.tows[slot.n]
        if solved and solved.st and not CATCC_DEMO_NO_TOWS then
          -- (THE USER'S OWN SIDES, 2026-11-18: "pushed back onto the left side of EL1 (assume looking from starboard
          -- to port)": left is aft, place 1; right is forward, place 2: the solved tow has it)
          load.sts = { solved.st }
          if ld.stay then E.stay[#E.stay + 1] = load else E.pool[#E.pool + 1] = load end
        elseif ld.stay then
          -- (its own place on the platform: El k 1 the forward one)
          load.sts = { tostring(ld.spot):sub(3, 3) == '1' and 2 or 1 }
          E.stay[#E.stay + 1] = load
        elseif ld.st then
          load.sts = { ld.st }
          E.pool[#E.pool + 1] = load
        else
          -- (no place given: either: the further one first, so that the nearer stays open; one that stands across the
          -- hangar: the one more nearly behind it)
          local d1, d2 = math.abs(e.stations[1].x - slot.x), math.abs(e.stations[2].x - slot.x)
          local across = math.abs(slot.fz) > 0.9
          load.sts = ((d1 > d2) ~= across) and { 1, 2 } or { 2, 1 }
          E.pool[#E.pool + 1] = load
        end
        hangarN = hangarN + 1
      end
    end
    -- (`after`: the aircraft it waits for, on the deck too: not towed to its spot until that one stands on its own)
    for _, ld in ipairs(E.pool) do
      for _, o in ipairs(E.pool) do
        if ld.after and o.n == ld.after then ld.a.after = o.a end
      end
    end
    M.retrip(E, 1)
    M.elevators[k], M.el[k] = E, E
  end
  M.hangarN = hangarN
  -- the tractors
  -- (the plan's `clear`: by place, the places whose tows are clear of its own: made a set of)
  if H.clear and not H.clearSet then
    H.clearSet = true
    for n, list in pairs(H.clear) do
      local set = {}
      for _, m in ipairs(list) do set[m] = true end
      H.clear[n] = set
    end
  end
  M.slotOf, M.bySlot = {}, {}
  for _, sl in ipairs(H.slots) do M.slotOf[sl.n] = sl end
  for _, a0 in ipairs(M.aircraft) do
    if a0.level == 'hangar' and a0.slot then M.bySlot[a0.slot] = a0 end
  end
  M.posts = {}
  for _, h in ipairs(H.homes) do M.posts[#M.posts + 1] = h end
  for _, h in ipairs(H.rest or {}) do M.posts[#M.posts + 1] = h end
  -- (WHERE THE HANGAR'S TRACTORS START: the plan's homes (posts 1 .. 4); CATCC_DEMO_POSTS: another list of posts, for
  -- more of them (the user, 2026-11-18: "add two additional tugs on both decks to help with parellelization"))
  local startAt = CATCC_DEMO_POSTS or HANGAR_POSTS
  if not startAt then
    startAt = {}
    for i = 1, #H.homes do startAt[i] = i end
  end
  for _, pi in ipairs(startAt) do
    local h = M.posts[pi]
    if h then
      local i = #M.tugs + 1
      M.tugs[i] = { name = 'hangar tractor ' .. i, key = 'catcc-demo-th' .. i, level = 'hangar', floor = H.floor, home = h, d = { x = h.x, z = h.z, hx = h.hx, hz = h.hz, v = 0 } }
    end
  end
  -- A TRACTOR FOR EACH ELEVATOR (hangar tractor k for elevator k: M.tugOf): it starts at the post from which the way to
  -- its elevator's first aircraft is the shortest (the solved tow's `ways`; a post is one tractor's), nose as a tractor
  -- stands there
  -- (OFF FOR NOW (CATCC_DEMO_OWN switches it on): with the hangar alone it brings an elevator's two aircraft up a minute
  -- and a half apart and the whole hangar in 37 minutes for 39; with the flight deck running the whole demo took 55 to 63
  -- minutes with it for 41 to 42 without (the rig, 2026-11-18, at four paces: the elevators' waiting rules are not yet
  -- matched to a tractor that waits at a nose). The tractors then start at the plan's homes and take whatever is
  -- nearest, as before.)
  M.tugOf = {}
  if H.tows and not CATCC_DEMO_NO_TOWS and not CATCC_DEMO_NO_OWN then
    local used = {}
    -- (THOSE THAT HAVE NO PLACE AT A NOSE TO START FROM CHOOSE THEIR POSTS FIRST (pass 1), the others (which stand at the
    -- nose of their first aircraft: the plan's `start`) take what is left (pass 2): until 2026-11-19 they chose in the
    -- order of the elevators: elevator 3's tractor, which stands at a nose, held the post nearest elevator 4's first
    -- aircraft; elevator 4's then started 61 m off, across the way of elevator 3's second tow, and its first aircraft
    -- left 3 minutes 45 after the start)
    for pass = 1, 2 do
    for _, t in ipairs(M.tugs) do
      local k = t.level == 'hangar' and tonumber(t.name:match('(%d+)$'))
      local T
      for _, sl in ipairs(H.slots) do
        if k and sl.el == k and sl.turn == 1 then T = H.tows[sl.n] end
      end
      if k and (pass == 2) == ((T and T.start) ~= nil) then
        t.el, M.tugOf[k] = k, t
        local best, bestLen
        for pi, P in ipairs(M.posts) do
          local W = T and T.ways and T.ways[pi]
          if W and not used[pi] then
            local len = Tow.routeLen(W.pts) + (W.back or 0) + (W.side ~= 0 and 6 or 0)
            if not bestLen or len < bestLen then best, bestLen = pi, len end
          end
        end
        if best then
          used[best] = true
          local P = M.posts[best]
          t.home, t.d = P, { x = P.x, z = P.z, hx = P.hx, hz = P.hz, v = 0 }
        end
        -- (AT THE NOSE OF ITS FIRST AIRCRAFT, if the plan has it so (start: a tractor standing there from the beginning
        -- is in no earlier tow's way): the user, 2026-11-18: tugs "parking at their next aircraft")
        local st0 = T and T.start
        local E = M.el[k]
        if st0 and E then
          for _, ld in ipairs(E.pool) do
            local sl = M.slotOf[ld.n]
            if sl and sl.turn == 1 and ld.a.level == 'hangar' then
              t.d = { x = st0.x, z = st0.z, hx = st0.hx, hz = st0.hz, v = 0 }
              t.claim, ld.claim = { ld = ld, front = st0.front or nil }, t
            end
          end
        end
      end
    end
    end
  end
  -- (a place to wait at is used only if it is on the deck, 2 m off every platform and 6.5 m from the wheels of every
  -- aircraft of the plan)
  local function stageOk(s)
    if not Tow.Fd.on(s.x, s.z, 2.5) then return false end
    for k = 1, 4 do
      local e = H.elevators[k]
      if s.x > e.x[1] - 2 and s.x < e.x[2] + 2 and s.z > math.min(e.z[1], e.z[2]) - 2 and s.z < math.max(e.z[1], e.z[2]) + 2 then return false end
    end
    for _, a in ipairs(M.aircraft) do
      for _, u in ipairs(FIND.along) do
        if hyp(s.x - (a.spot.x + a.spot.fx * u), s.z - (a.spot.z + a.spot.fz * u)) < 6.5 then return false end
      end
    end
    return true
  end
  local deckHomes = {}
  if CATCC_DEMO_FOUR then
    for _, h in ipairs(DECK_HOMES) do deckHomes[#deckHomes + 1] = h end
  elseif CATCC_DEMO_EIGHT then
    for _, h in ipairs(DECK_HOMES8) do deckHomes[#deckHomes + 1] = h end
    deckHomes[#deckHomes + 1] = POCKET[2]
    deckHomes[#deckHomes + 1] = POCKET[1]
  else
    for _, h in ipairs(DECK_HOMES6) do deckHomes[#deckHomes + 1] = h end
    deckHomes[#deckHomes + 1] = POCKET[2]
  end
  for i, h in ipairs(deckHomes) do
    M.tugs[#M.tugs + 1] = { name = 'deck tractor ' .. i, key = 'catcc-demo-td' .. i, level = 'deck', floor = DECK_Y, home = h, place = h, pocket = h.pocket or nil, d = { x = h.x, z = h.z, hx = h.hx, hz = h.hz, v = 0 } }
  end
  -- WHERE THEY MAY WAIT besides the junkyard: the pocket between the island and elevator 2 (its places that are
  -- clear), and the deck spots that are empty to begin with: those of the aircraft that come up from the hangar and
  -- go on to a spot (not the two of each elevator that stay on its platform): backed into, nose out as the aircraft
  -- will stand
  M.pocket, M.spotPlaces = {}, {}
  FIND.laC = {}
  -- (with six tractors the pocket is the sixth's own: nobody waits there)
  for _, pl in ipairs(CATCC_DEMO_FOUR and POCKET or {}) do
    if stageOk(pl) then M.pocket[#M.pocket + 1] = pl end
  end
  for _, E in ipairs(M.elevators) do
    for _, ld in ipairs(E.pool) do
      local sp = ld.a.spot
      local sx, sz = unit(sp.fx, sp.fz)
      -- (NO LONGER, unless CATCC_DEMO_SPOT_STAGING: the user, 2026-11-19: tugs by themselves are to keep "out of parking
      -- areas": a tractor that waited on an empty spot beside elevator 4 stood in the way of the tows off it)
      if CATCC_DEMO_SPOT_STAGING then M.spotPlaces[#M.spotPlaces + 1] = { x = sp.x, z = sp.z, hx = sx, hz = sz, park = true, back = 4, a = ld.a } end
    end
  end
  -- where a tractor waits in front of each place of each platform (WAIT), if that is clear
  local ahead = TOW.noseGear + reachOf() + WAIT.ahead
  for k = 1, 4 do
    for st, S in ipairs(H.elevators[k].stations) do
      local pose = { x = S.x + S.fx * ahead, z = S.z + S.fz * ahead, hx = S.fx, hz = S.fz, park = true, back = WAIT.back, wait = true, k = k, st = st }
      if Tow.Fd.on(pose.x, pose.z, 2.5) then M.elevators[k].wait[st] = pose end
    end
  end
  -- all of it made, in one go
  local parts, what = {}, {}
  for _, a in ipairs(M.aircraft) do
    if not a.skip then
      parts[#parts + 1] = string.format('%s,FA-18C_hornet,Planes,%.3f,%.3f,%.5f,%s,%s', a.key, a.x, a.z, atan2(a.fz, a.fx) % (2 * math.pi), a.livery, a.level == 'deck' and '1' or '0')
      what[#what + 1] = { a = a }
    end
  end
  for _, a in ipairs(M.aircraft) do
    if a.hasBar then
      parts[#parts + 1] = string.format('%s-bar,CATCC_Towbar,,%.3f,%.3f,%.5f,,0', a.key, a.x, a.z, atan2(a.fz, a.fx) % (2 * math.pi))
      what[#what + 1] = { bar = a }
    end
  end
  for _, tg in ipairs(M.tugs) do
    parts[#parts + 1] = string.format('%s,AS32-31A,,%.3f,%.3f,%.5f,,0', tg.key, tg.d.x, tg.d.z, atan2(tg.d.hz, tg.d.hx) % (2 * math.pi))
    what[#what + 1] = { tug = tg }
  end
  local okd, r = pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or "ERR|the menu script is an older one: run crew-test\\\\install.ps1 with DCS closed"', table.concat(parts, ';'), M.ship))
  local p = (okd and type(r) == 'string') and api.split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then
    M.aircraft, M.tugs = {}, {}
    return say('demo: the aircraft could not be made: ' .. tostring(p[2]))
  end
  local made, skipped, noBar, noTug = 0, {}, 0, 0
  for i, q in ipairs(what) do
    local id = tonumber(p[1 + i])
    if q.a then
      if id and id > 0 then
        q.a.id = id
        made = made + 1
      else
        q.a.level = 'none'
        if id == -1 then skipped[#skipped + 1] = tostring(q.a.spot.name) end
      end
    elseif q.bar then
      if id and id > 0 then q.bar.bar = id else noBar = noBar + 1 end
    elseif q.tug then
      if id and id > 0 then q.tug.id = id else noTug = noTug + 1 end
    end
  end
  local note = (p[2 + #what] and p[2 + #what] ~= '') and p[2 + #what] or nil
  if noTug > 0 or noBar > 0 then
    M.stop(true)
    return say(string.format('demo: %d tractors and %d tow bars could not be made (%s): nothing started.', noTug, noBar, tostring(note or 'DCS made nothing')))
  end
  -- someone on the ship to ask through; the drivers (our people named catcc-t...: one to a tractor, the deck's first)
  Tow.Aux.handle(ctx)
  local drivers = M.seatDrivers(ctx, native)
  -- (ON A SERVER THE DEMO STARTS FROM THE SLOT SCREEN: DCS makes the ship's people only once a player is in an
  -- aircraft on it, so none is found now (the user, 2026-11-22: "none of the tractors had their drivers"): looked for
  -- again every 5 s until every tractor has one: M.tick)
  M.driverAt = #drivers < #M.tugs and Tow.now() + 5 or nil
  -- the brake riders (catcc-b...: Tow.Cockpit): they wait out of sight until a tractor comes for an aircraft
  M.cockpit, M.cockpitErr = Tow.Cockpit and Tow.Cockpit.new() or nil, nil
  M.riderAt = (M.cockpit and M.findRiders(ctx) < M.RIDERS) and Tow.now() + 5 or nil
  -- (what is drawn: the panel's "Hide" switches: M.hideSetup)
  M.hideSetup(native)
  -- everything put where it belongs (the hangar's go down at once)
  for _, a in ipairs(M.aircraft) do
    if a.id then
      placeAircraft(a)
      foldWings(a)
    end
  end
  for _, tg in ipairs(M.tugs) do placeTug(tg) end
  -- (the hangar's tractors hooked on to their first aircraft: M.preHook)
  for _, tg in ipairs(M.tugs) do
    if tg.level == 'hangar' then
      local okp, errp = pcall(M.preHook, tg, ctx)
      if not okp then logLine('demo: hooking on at the start: ' .. tostring(errp)) end
    end
  end
  -- the deck made ready: the catapult crews out of the way, the bubbles down
  local sent, crews = Tow.Aux.crewsAway(ctx, CREW_AWAY)
  local bub = Tow.Aux.bubbles(ctx, true)
  M.on, M.t0 = true, Tow.now()
  -- (making forty static aircraft in one frame is the test's own doing: left out of the hook's "performance")
  if Tow.Prof and Tow.Prof.testOnly then Tow.Prof.testOnly('the demo making its static aircraft') end
  local onDeck = 0
  for _, a in ipairs(M.aircraft) do
    if a.id and a.level == 'deck' then onDeck = onDeck + 1 end
  end
  -- (how many tractors on each deck)
  local nDeck, nHangar = 0, 0
  for _, tg in ipairs(M.tugs) do
    if tg.level == 'deck' then nDeck = nDeck + 1 else nHangar = nHangar + 1 end
  end
  logLine(string.format('demo: planning is %s', CATCC_DEMO_NO_SLICE and 'done in one frame (CATCC_DEMO_NO_SLICE)' or (M.SLICE.calls and string.format('spread over frames: %d planner calls a frame', M.SLICE.calls)) or (M.cpu and string.format('spread over frames: %d ms of each frame, by the clock', M.SLICE.ms)) or 'done in one frame: there is no clock here to share a frame by'))
  logLine(string.format('demo: started on %s: %d aircraft made (%d on the flight deck on their spots, %d in the hangar with tow bars), %d + %d tractors, %d driver(s); catapult crews: %d of %d crews found, %d people sent to the port edge; bubbles %s%s%s%s',
    tostring(M.ship), made, onDeck, hangarN, nHangar, nDeck, #drivers, crews, 4, sent, bub and 'told down' or 'NOT reached',
    #skipped > 0 and ('; left empty for a live aircraft: ' .. table.concat(skipped, ', ')) or '',
    #notUp > 0 and ('; not brought up from the hangar, your own jet stands there or on that elevator: ' .. table.concat(notUp, ', ')) or '', note and ('; ' .. note) or ''))
  local names = {}
  for _, pl in ipairs(M.spotPlaces) do names[#names + 1] = tostring(pl.a.spot.name) end
  logLine(string.format('demo: the deck\'s %d tractors take whatever costs them least (no sections); they wait in the junkyard, in the pocket between the island and elevator 2 (%d places) and on deck spots while those are empty (%s)',
    nDeck, #M.pocket, #names > 0 and table.concat(names, ', ') or 'none: they keep out of the parking places'))
  -- (in the log only: the demo is settled (the user, 2026-11-24: "remove any debugging messages that are for systems
  -- we've already settled"); a server finds its drivers later, so a count of them at the start says nothing)
  logLine(string.format('demo: %d aircraft on %s: %d on the flight deck, %d in the hangar. The elevators bring those up two at a time; %d tractors below, %d above.%s Ctrl+Shift+F9 stops it.',
    made, tostring(M.ship), onDeck, hangarN, nHangar, nDeck, #drivers < #M.tugs and string.format(' (%d of %d tractors have a driver: for the others run deck-test\\director-test.ps1 -Spawn Spots -Crew Model with DCS closed.)', #drivers, #M.tugs) or ''))
end

-- everything taken away again. quiet: nothing said
-- WHAT IS DRAWN (the panel's "Hide" switches; the hook's Tow.Hide says why and what is logged). Only where DCS draws
-- an object changes: every place the demo and the hook's tows give an object of the demo's goes through the native
-- module's staticpos (aircraft, tractors, bars) or place (drivers), wrapped here for the run (M.hideSetup): the place
-- given is kept (M.hideLast), and an object of a hidden kind is put HIDE.x m ahead of the ship and HIDE.y m up instead
-- (beyond where DCS draws an aircraft or a tractor); a driver HIDE.man m aft of the ship's origin (the native module
-- puts a man no further than 1000 m). Nothing the demo plans or times by reads where DCS has an object: the run is the
-- same. The kinds: drivers, bars, tractors; aircraft as `hangar` or `deck` by the height they are given (below or
-- above halfway between the hangar's floor and the flight deck: one on a platform changes kind on its way).
-- On a switch everything is put again where it is or away (M.hideAll); when the demo stops the drivers are put back on
-- their seats (they stay; the rest is taken away) and the native module's functions are its own again.
M.HIDE = { x = 100000, y = 10000, man = -900 }
function M.hideSetup(nt)
  M.hideIds, M.hideLast, M.hideMen, M.hidden = {}, {}, {}, {}
  for _, a in ipairs(M.aircraft) do
    if a.id then M.hideIds[a.id] = 'aircraft' end
    if a.bar then M.hideIds[a.bar] = 'bar' end
  end
  for _, tg in ipairs(M.tugs) do
    if tg.id then M.hideIds[tg.id] = 'tractor' end
    if tg.driver then M.hideMen[tg.driver.h] = {} end
  end
  M.hideMid = (H.floor + DECK_Y) / 2 + DY
  if M.hideOrig and M.hideOrig.t == nt then return end
  local sp, pl = nt.staticpos, nt.place
  M.hideOrig = { t = nt, sp = sp, pl = pl }
  local scratch = {}
  nt.staticpos = function(id, ...)
    local kind = M.hideIds and M.hideIds[id]
    local n = select('#', ...)
    if not kind or n < 12 then return sp(id, ...) end
    local v = M.hideLast[id]
    if not v then
      v = {}
      M.hideLast[id] = v
    end
    v.n, v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11], v[12], v[13], v[14], v[15] = n, ...
    local hid = M.hidden
    if not (hid and next(hid)) then return sp(id, ...) end
    if kind == 'aircraft' then
      if not hid[v[11] < M.hideMid and 'hangar' or 'deck'] then return sp(id, ...) end
    elseif not hid[kind == 'bar' and 'bars' or 'tractors'] then
      return sp(id, ...)
    end
    for i = 1, n do scratch[i] = v[i] end
    scratch[10], scratch[11] = v[10] + M.HIDE.x, v[11] + M.HIDE.y
    return sp(id, unpack(scratch, 1, n))
  end
  nt.place = function(h, x, y, z, fx, fz, ...)
    local m = M.hideMen and M.hideMen[h]
    if not m then return pl(h, x, y, z, fx, fz, ...) end
    m[1], m[2], m[3], m[4], m[5], m.set = x, y, z, fx, fz, true
    if not (M.hidden and M.hidden.drivers) then return pl(h, x, y, z, fx, fz, ...) end
    return pl(h, M.HIDE.man, y, z, fx, fz, ...)
  end
end

function M.hideAll()
  local nt = M.hideOrig and M.hideOrig.t
  if not nt then return end
  local function again(id)
    local v = id and M.hideLast[id]
    if v then pcall(nt.staticpos, id, unpack(v, 1, v.n)) end
  end
  for _, a in ipairs(M.aircraft or {}) do
    again(a.id)
    again(a.bar)
  end
  for _, tg in ipairs(M.tugs or {}) do
    again(tg.id)
    local m = tg.driver and M.hideMen[tg.driver.h]
    if m and m.set then pcall(nt.place, tg.driver.h, m[1], m[2], m[3], m[4], m[5]) end
  end
end

-- list: the kinds to hide, as "drivers,bars" ("none": everything drawn)
function M.hide(list)
  if not (M.on and M.hideOrig) then return end
  local want, names = {}, {}
  for k in tostring(list or ''):gmatch('%a+') do
    if k ~= 'none' then
      want[k] = true
      names[#names + 1] = k
    end
  end
  M.hidden = want
  M.hideAll()
  logLine('demo: hidden: ' .. (#names > 0 and table.concat(names, ', ') or 'nothing'))
end

function M.hideOff()
  local o = M.hideOrig
  if not o then return end
  M.hidden = {}
  for _, tg in ipairs(M.tugs or {}) do
    local m = tg.driver and M.hideMen and M.hideMen[tg.driver.h]
    if m and m.set then pcall(o.pl, tg.driver.h, m[1], m[2], m[3], m[4], m[5]) end
  end
  o.t.staticpos, o.t.place = o.sp, o.pl
  M.hideOrig, M.hideIds, M.hideLast, M.hideMen = nil, nil, nil, nil
end

-- THE DECK FOR THE SLOT PICKER (crewtest_slots.lua; the user, 2026-11-20: "wait until spotted ... It doesn't make
-- sense to load into a jet that's on the move"): every aircraft of the demo as "key|board|spot|spotId|x|z|hdg|level|
-- state", ";" between them, the carrier first ("ship=<name>"): spot is the DCS parking number of the deck spot it is
-- for (the routes' `spot`); state: parked (it stands on its spot: a slot there may be taken), manned (a player has
-- it: its static is gone), tow (in tow), up (on a platform on its way up), deck (on the flight deck, not yet on its
-- spot), hangar.
function M.deckMap()
  local out = { 'ship=' .. tostring(M.ship) }
  for _, a in ipairs(M.aircraft or {}) do
    if a.level ~= 'none' and a.spot then
      local st
      if a.manned then
        st = 'manned'
      elseif a.towed then
        st = 'tow'
      elseif a.level == 'deck' and (a.parked or a.stayed) then
        st = 'parked'
      elseif a.level == 'el' then
        st = 'up'
      elseif a.level == 'deck' then
        st = 'deck'
      else
        st = 'hangar'
      end
      out[#out + 1] = string.format('%s|%s|%s|%s|%.2f|%.2f|%.1f|%s|%s', a.key, tostring(a.board), tostring(a.spot.spot or ''), tostring(a.spot.id or ''), a.x or 0, a.z or 0,
        math.deg(atan2(a.fz or 0, a.fx or 1)) % 360, tostring(a.level), st)
    end
  end
  return table.concat(out, ';')
end

-- the aircraft of the demo for a deck spot (its DCS parking number)
function M.onSpot(n)
  for _, a in ipairs(M.aircraft or {}) do
    if a.spot and tonumber(a.spot.spot) == tonumber(n) and a.level ~= 'none' then return a end
  end
  return nil
end

-- THE MISSION'S SLOTS' PAINT (from the hook, ahead of every start: crewtest_slots.lua S.paint): "<spot>=<livery>;..."
function M.paint(text)
  M.slotPaint = {}
  for spot, lv in tostring(text or ''):gmatch('(%d+)=([^;]+)') do M.slotPaint[tonumber(spot)] = lv end
end

-- A PLAYER HAS TAKEN THE SLOT ON SPOT n: its static is taken away (his jet is put there by DCS); one that stands
-- there only (parked or staying), never one on the move. unman: he has left it: the static is made again where it
-- stood (the slot is held for him: crewtest_slots.lua).
function M.man(n)
  local a = M.onSpot(n)
  if not (M.on and a) or a.manned then return end
  if not (a.level == 'deck' and (a.parked or a.stayed) and not a.towed) then
    return logLine(string.format('demo: %s is not standing on its spot: it is not taken away for the player who has its slot', tostring(a.name)))
  end
  a.manned = true
  if a.id then
    pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or ""', a.key, M.ship))
    if M.hideIds then M.hideIds[a.id] = nil end
    a.id = nil
  end
  logLine(string.format('demo: %s on %s is manned: its static is taken away', tostring(a.name), tostring(a.spot.name)))
end

function M.unman(n)
  local a = M.onSpot(n)
  if not (M.on and a and a.manned) then return end
  a.manned = nil
  local part = string.format('%s,FA-18C_hornet,Planes,%.3f,%.3f,%.5f,%s,%s', a.key, a.x, a.z, atan2(a.fz, a.fx) % (2 * math.pi), a.livery, a.level == 'deck' and '1' or '0')
  local okd, r = pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or "ERR|the menu script is an older one"', part, M.ship))
  local p = (okd and type(r) == 'string') and api.split(r) or { 'ERR', tostring(r) }
  local id = tonumber(p[2])
  if p[1] ~= 'OK' or not id or id <= 0 then
    return logLine(string.format('demo: %s could not be made again on %s: %s', tostring(a.name), tostring(a.spot.name), tostring(p[2])))
  end
  a.id = id
  if M.hideIds then M.hideIds[id] = 'aircraft' end
  placeAircraft(a)
  foldWings(a)
  logLine(string.format('demo: %s on %s is unmanned: its static is made again where it stood', tostring(a.name), tostring(a.spot.name)))
end

-- THE SPOT A SLOT COMES UP ON (the runs of 2026-11-22, a slot on every spot: whatever its parking number, a slot came
-- up on the LOWEST-NUMBERED deck spot with nothing standing on it: Patio 2 (7) for the slots of spots 8, 11, 15 and
-- 33 while spots 1 to 6 held aircraft; spot 5 for the slot of spot 5 once its own static was gone). So the picker makes
-- the chosen aircraft's spot the lowest-numbered empty one for the moment the slot is taken: M.block(n) puts a static
-- Hornet on every deck spot numbered below n that has nothing of the demo's standing on it (none where a live
-- aircraft stands); M.unblock takes them away.
function M.block(n)
  n = tonumber(n)
  if not (M.on and n) then return end
  M.unblock()
  local standing = {}
  for _, a in ipairs(M.aircraft or {}) do
    if a.id and a.level == 'deck' and (a.parked or a.stayed) and not a.towed and a.spot and tonumber(a.spot.spot) then standing[tonumber(a.spot.spot)] = true end
  end
  local parts, keys = {}, {}
  for _, sp in ipairs(api.routes() or {}) do
    local k = tonumber(sp.spot)
    if k and k < n and not standing[k] and sp.x and sp.z then
      local key = 'catcc-blk-' .. k
      keys[#keys + 1] = key
      parts[#parts + 1] = string.format('%s,FA-18C_hornet,Planes,%.3f,%.3f,%.5f,,1', key, sp.x, sp.z, atan2(sp.fz or 0, sp.fx or 1) % (2 * math.pi))
    end
  end
  M.blockers = keys
  if #parts > 0 then
    pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or ""', table.concat(parts, ';'), M.ship))
  end
  logLine(string.format('demo: %d empty deck spot(s) below spot %d blocked with a static for a moment', #keys, n))
end

function M.unblock()
  local keys = M.blockers
  M.blockers = nil
  if not (keys and #keys > 0 and M.ship) then return end
  pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or ""', table.concat(keys, ';'), M.ship))
  logLine(string.format('demo: the %d blocking static(s) taken away', #keys))
end

function M.stop(quiet)
  pcall(M.unblock)
  -- (the brake riders out of the cockpits and away)
  if M.cockpit and Tow.Cockpit then pcall(Tow.Cockpit.stop, M.cockpit, api.native(), Tow.Head) end
  M.cockpit, M.riderAt = nil, nil
  if Tow.Prof and Tow.Prof.testOnly then Tow.Prof.testOnly('the demo taking its static aircraft away') end
  pcall(M.hideOff)
  local parts = {}
  for _, a in ipairs(M.aircraft or {}) do
    parts[#parts + 1] = a.key
    if a.hasBar then parts[#parts + 1] = a.key .. '-bar' end
  end
  for _, tg in ipairs(M.tugs or {}) do parts[#parts + 1] = tg.key end
  if #parts > 0 and M.ship then
    pcall(api.dostring, string.format('return (CATCC_CR and CATCC_CR.demo) and CATCC_CR.demo(%q, %q) or ""', table.concat(parts, ';'), M.ship))
  end
  local was = M.on
  if was and M.ship then
    local ctx = api.getCtx(nil, nil, M.ship)
    if ctx then
      pcall(Tow.Aux.bubbles, ctx, false)
      for k = 1, 4 do
        local E = M.el and M.el[k]
        if E and E.state ~= 'up' then pcall(Tow.Aux.elevator, ctx, k, 'up') end
      end
    end
  end
  M.on, M.jobs, M.aircraft, M.tugs, M.elevators, M.el = false, {}, {}, {}, {}, {}
  if not quiet then
    logLine('demo: stopped: everything taken away')
    if not was then say('demo: it was not running.') end
  end
end

function M.report()
  if not M.on then return say('demo: it is not running (Ctrl+Shift+F9, or F10 > CATCC demo: spot the deck).') end
  local jobs = {}
  for _, j in ipairs(M.jobs) do
    jobs[#jobs + 1] = (j.move or j.shift) and string.format('%s by itself', j.tug.name) or string.format('%s with %s (%s)', j.tug.name, tostring(j.a.board), tostring(j.w.phase))
  end
  local els = {}
  for _, E in ipairs(M.elevators) do els[#els + 1] = string.format('%d %s%s', E.k, E.state, E.trips[E.trip] and '' or ' (done)') end
  local up = 0
  for _, a in ipairs(M.aircraft) do
    if a.hasBar and a.level == 'deck' then up = up + 1 end
  end
  local txt = string.format('demo: %s. %d aircraft on the flight deck, %d of %d up from the hangar. Elevators: %s. In hand: %s.', M.done and 'finished' or 'running', M.count(), up, M.hangarN,
    table.concat(els, ', '), #jobs > 0 and table.concat(jobs, '; ') or 'nothing')
  logLine(txt)
  say(txt)
end

-- THE LAB: what the solver (catcc-dcs/deck-test/hangar/hangar_solve.lua, in the test rig) needs of the demo: the
-- hangar's plan, a tow from data driven in the head, the tractor's ways to an aircraft, the other aircraft down there
function M.lab()
  return { H = H, towOf = towOf, hangarEnv = hangarEnv, within = within, others = others, approach = hangarApproach, front = hangarFront, ALONG = ALONG, reach = reachOf,
    shape = function(x, z, fx, fz) return Tow.Fd.shape(x, z, fx, fz, HALF) end, READY = READY, cell = cell, Tow = Tow, TOW = TOW, FRONT = FRONT, quarterBack = quarterBack,
    ENV = ENV_HANGAR }
end

-- a mission starts or ends: nothing of it is left (the statics go with the mission)
function M.reset()
  M.on, M.jobs, M.aircraft, M.tugs, M.elevators, M.el = false, {}, {}, {}, {}, {}
end

return M
