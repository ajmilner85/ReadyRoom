# Deck orchestration: plan, fact check and open questions (2026-11-25)

The next CATCC phase: a per-carrier orchestration layer that configures the flight deck for each event (launch, recovery, flex deck, carrier qualifications) and directs the subsystems already built. This file holds the condensed notes for the phase, a fact check against the manuals, a feasibility review of what exists, the open questions and a phased plan. Nothing in it is built yet. Decisions taken from it go into `DECISIONS.md` as usual.

**Sources.** The two NATOPS manuals in `carrier-ops-handoff-2/`: `USNavy_CVN_FlightDeck.pdf` is **NAVAIR 00-80T-120, CVN Flight/Hangar Deck NATOPS (2010)**, and `FA18_doc_CV-natops-21oct99.pdf` is **NAVAIR 00-80T-105, CV NATOPS (1999)**. A § number on its own means 00-80T-120; "105" means the CV NATOPS. Web sources are listed at the end; code facts come from `DECISIONS.md` and the CATCC code.

**In short**
- The plan matches the manuals on most points. Three corrections change the design: cyclic ops alternate launches and recoveries and are not simultaneous ops (F2); a NATOPS tow needs a director, a brake rider in the cockpit and two chock walkers (F5); chocks and chains come off on the director's call just before taxi, not during engine start (F8).
- All eight foundations work on one PC, mostly with the user hosting. Nothing that moves is seen by other players yet, and how that is solved shapes the whole architecture, so it is tested first (P0).
- Casual servers are the second gap: current Foothold editions use dynamic spawn, and a spotted deck blocks dynamic spawn (W2).

## 1. The notes, condensed

**Goal:** an orchestration layer for each carrier that configures the deck for the current event and directs the subordinate systems, making the deck feel alive.

**Already built:** LA and catapult-area obstruction detection; catapults enabled/disabled, crews dismissed and recalled; tows between deck, elevators and hangar; deck spotting; dynamic crew routes, with stop signals when blocked; spawning on a chosen spot; slots restricted to their reservation; spawns refused on an obstructed spot. (Their actual state: section 3.)

**Requirements**
- Two settings: unattended casual servers (Foothold, Contention) and organized flight nights with the Air Boss seat manned.
- Runs for days without a restart and through hours-long missions. Fails gracefully. Catapults or crews must never end up stuck.
- In-game resets (for example, catapult or tow crews that stop responding), for admins only. The permission comes from ReadyRoom when it is linked; ReadyRoom must never be required.
- Stretch goal: an API for other tools.

**Launch** (the start of an air plan or an alpha strike; most flight nights start here)
- Aircraft on deck and/or in the hangar, spotted in launch order: earlier departures nearest the catapults. Flights are spread so members can launch from all four catapults at once or in quick succession (F9).
- Fill order: aft of the bow elevators first, then the Point, then the starboard bow (keeps Cat 2 open), then the Crotch, then the port bow. Bow spots block catapults, so they fill last and empty first: port bow and Crotch first (frees Cat 2), then starboard bow and Point (frees Cat 1).
- Routes off the bow follow the street aft, avoiding the bow bubble and JBD 2.
  - To Cats 3 and 4: aft to the wires, then across.
  - To Cats 1 and 2: around the six-pack (or through it if empty), staying outside Cat 3's launch path, and queue behind JBD 2.
  - If there is no room between the six-pack and Cat 3: keep left to the end of the queue, reverse, and hold short of the six-pack.

**Recovery** (the end of an air plan: maximum recovery rate)
- Park so the LA stays clear. Keep Cat 2 open as long as possible for tankers. Cats 3 and 4 can launch only while recoveries are paused, and their crews stay out of the way until a jet is sent to them.
- The bow is the main parking area. Jets taxi to the deck edge, turn, and waiting tugs push them back into their spots (F3).
- Keep the elevators free as long as possible. Damaged jets go to the elevators first: El 3, or El 2 or El 1 if El 3 is busy. Lower each one as soon as it is secured. Respot the hangar in reverse of its unloading order, planned ahead of time.
- Strike as many aircraft below as possible, damaged ones first.
- A player who leaves is replaced by a static in the same place. A disabled jet in the LA is lifted by a crane (stretch goal); until then it is removed (F11).

**Flex deck** (launches and recoveries together: cyclic ops, CQ, alert readiness; see F2)
- Keep the bow catapults open by parking on the Patio, El 3, El 2 and El 1, the Corral, the street, and in front of the island.
- Tow to El 4 and the spot behind the JBD during short recovery pauses or gaps in arrivals.
- Refuel, rearm and spot the next event's jets for launch. Send down jets and jets not in the next launch to the hangar.

**CQ:** like flex deck, but a jet that has trapped taxis straight from the LA into a bow-catapult queue. Once it has its traps, it is parked or struck below. Fewer aircraft than in cyclic ops.

**PriFly**
- Sets the mode and overrides catapult availability; the orchestration reconfigures the systems to match. A future timeline (Gantt) can set the mode too.
- Example: the air plan starts with the hangar full and few jets on deck, so the mode is Launch. Catapult crews man only clear catapults. After the launch, the mode switches to flex deck or Recovery, Cats 3 and 4 are secured, and tractors reposition.

**Deck crew**
- **Catapult crews:** every crew can be dismissed, and none returns unless told to. During recoveries, the Cat 3 and 4 crews stay out of the LA. While jets taxi off the bow, the Cat 1 and 2 crews stay off the route until their catapult opens, then walk around aircraft. Their waiting places stay clear of parking spots.
- **Plane captains** (F6–F8): accompany each jet being spotted and fit the initial tiedowns (our chain model, NATOPS patterns, no animation). Wait forward-left of the canopy without blocking neighbouring spots, and give engine-start signals once the player spawns. Later: chains carried over the shoulder. Open: after the hand-off, back to the island or on to their next aircraft?
- **Tractor teams** (F5, F8): the driver, plus one blue shirt walking with two chocks. Chocks go in before the tug unhooks and come out after it hooks up; they also come out after the plane captain's set-brakes signal during start. Objects simply appear in place; no animation.
- **Directors** (F10): a shared pool, waiting along the deck edge, by the island and junk yard, and at the finger. One is always dedicated to the LA during recoveries. Open: one for wires 3–4 and another for 1–2?
- **Fouling:** anyone or anything inside the LA safety line fouls the deck.
- **Multiplayer:** the crews must look the same for every player (all have the mod). Architecture: see W1.

**Automation vs. humans**
- Works with or without an Air Boss. When unattended, taxi orders follow the planned launch sequence, so jets queue at each catapult in order.
- Pilots report up or down through F10 or our own UI first; SRS speech recognition later.
- A jet that is not ready at its turn gets extra time if nothing is waiting on it. Otherwise it is held in place, the next jet goes, and it is resequenced once ready.
- A down jet never holds up the sequence.

## 2. Fact check

**What matches the manuals**
- **Cats 3 and 4 during a recovery.** They sit in the landing area (LA), so launching from them means pausing recoveries.
- **Cat 2 during a recovery.** A named NATOPS case: Cat 2's deck-edge and JBD operators "shall not be considered fouling the landing area" (§4.5.1).
- **Anything in the LA fouls it.** The LA runs from the fantail to the forward end of the angled deck, including the safe-parking area by the island (§5.1.2). Parked aircraft and equipment must be inside the safe-parking line before a recovery (§5.2.1).
- **Parking.** Aircraft are backed into deck-edge spots with chock walkers ready (§7.4.3 item 16). Wikipedia: "after the last recovery of the day, all of the aircraft are generally stored on the bow".
- **Down and late jets.** A down aircraft is handled as the pre-launch brief says, so it does not hold the sequence (105 §4.8.1). The rule for a jet that is not ready fits "a steady flow of traffic while avoiding unnecessary crowding" (§7.4.4.3).
- **CQ.** Trap, then straight to a bow cat, with few aircraft. The CQ pattern is capped at six aircraft (105 §5.7.1).

**Corrections and additions**

- **F1. "Flight quarters" means something else in NATOPS.** It is a manning condition of three kinds: Flight Quarters, Flight Quarters for Respot, Helicopter Flight Quarters (§3.4.1). Launches, recoveries and CQ happen within it.
  - **→** Call the modes "deck modes". Two are missing: **Respot** (aircraft moving, nobody flying) and **Secured** (not at flight quarters, permanent tiedowns, no crews on deck). Secured is the natural idle state for an unattended server.
- **F2. Cyclic ops are not simultaneous ops.** Wikipedia: "Launching and recovering aircraft aboard aircraft carriers is best accomplished nonconcurrently, and cyclic operations are the norm."
  - In a cycle, event N+1 launches, then event N is recovered, refuelled, rearmed and respotted for N+2.
  - Events are 12–20 aircraft. Cycles run 1:00–1:45, usually 1:30, and a launch takes about 15 min.
  - Engines start about 30 min before launch, and jets taxi to the cats about 15 min before.
  - Flex deck means launching from Cats 1 and 2 while recovering, with a goal of one landing every 45 s (Navy SWOS slide).
  - **→** Cyclic ops is a schedule: Launch → Re-spot forward → Recovery → Respot. Flex deck is its own mode, for CQ and for tanker or alert launches during a recovery. On casual servers unscheduled launches and recoveries overlap all the time, so flex deck is the only mode that fits there: a departure the game forces, to be logged in `DECISIONS.md`.
- **F3. "Re-spot forward" has a specific meaning.** The move after a launch that brings aircraft left aft forward, clearing the LA for the coming recovery. Its pace depends on when the recovery starts. Tow bars stay on every deck aircraft so it can be done at once in an emergency (§7.4.5; 105 §4.9).
  - The handler's pre-launch brief covers "aircraft to be towed or taxied forward after the launch", the "recovery spot" and the "emergency pull-forward" (§7.2.1).
  - 105 §6.1: "when aircraft are airborne, the desirability of maintaining a ready deck for as long as possible should be kept in mind."
  - **→** Re-spot forward is the transition from Launch to Recovery, and needs an emergency version. The ready-deck rule is a good default for unattended servers.
- **F4. The handler runs the deck, not the Air Boss.** "All aircraft handling on the flight or hangar deck shall be controlled and authorized by the ACHO", the handler in Flight Deck Control (§7.1). The handler also sets how many aircraft are on the flight and hangar decks (§1.7.5). The Boss runs launches, recoveries and the airspace (§1.7.1). About 12–15 yellow shirts work the deck, reporting to the handler (Wikipedia).
  - **→** The orchestrator is the handler; PriFly's mode and catapult calls are the Boss's inputs to it. PriFly's Ouija Board mode is already the handler's tool (Q18).
- **F5. A NATOPS tow team is bigger than planned.** A move needs a director, the tractor driver, a plane captain and two chock walkers; wing and tail safeties are added within 5 ft of any obstruction (§7.4.3).
  - A brake rider sits in the cockpit.
  - The driver moves the aircraft only under a director's positive control, and never faster than the handlers can walk.
  - Each chock walker walks a chock beside one main wheel, on its outboard side, adjustable block aft, carrying no chains while doing it.
  - Chocks and initial tiedowns go on before the tow bar comes off, and the director stays until the tiedowns are done.
  - **→** The plan has the driver plus one walker carrying both chocks. Missing: the director, a seated brake rider (the drivers' seating method would work), and the second chock walker. About 5 people per moving aircraft instead of 2, against the 2026-11-19 "no spare performance" rule (Q8).
- **F6. Blue shirts put on the first chains, not the plane captain.** F/A-18 tiedown counts: 6 initial, 9 intermediate, 12/14 permanent, 18/20 heavy weather (§2.5).
  - After a recovery or respot, the handling crew puts on the initial tiedowns; the plane captain then adds chains up to the intermediate count (§2.4, §7.4.6 item 6).
  - Aircraft in the next event stay on initial tiedowns; others go to intermediate; hangar aircraft are on permanent.
  - No aircraft rides an elevator without intermediate tiedowns, chocks and brakes (§7.5.4).
- **F7. One plane captain per aircraft.** Plane captains are squadron sailors, designated in writing and tied to a particular aircraft; they earn their name on it.
  - "Plane captains of landing aircraft … join their aircraft as they are being parked." When the aircraft is struck below, "its plane captain should board the elevator with it" (105 §5.5.4).
  - No source states a strict one-to-one rule.
  - **→** After the launch a plane captain has no "next aircraft in the sequence": they clear the deck until their aircraft comes back.
- **F8. The start and release order differs.**
  - Engines start only on PriFly's signal, after the plane captain has removed the tow bar.
  - The plane captain controls preflight checks only, and may not have chains removed or wings spread without a director's clearance.
  - After post-start checks the pilot signals the aircraft's status to the plane captain, who tells the director it is ready (§7.4.4.2).
  - The director then signals "hold brakes"; the pilot nods (a flashlight at night), and only then are chocks and chains ordered off (§7.4.4.3, §7.4.3 item 2).
  - **→** Chocks come out on the director's call just before taxi, not at the plane captain's set-brakes signal during start.
  - **→** The up/down report has a real-world home: pilot to plane captain to director. The pilot hook already intercepts the salute, and in DCS's Supercarrier the second salute means "ready to taxi".
- **F9. Queue rules at the catapults.**
  - No aircraft with folded wings or an open canopy is taxied, spotted or towed behind a JBD while that cat is at high power. Wings do not fold or spread close behind a JBD.
  - While Cat 4 is loaded, Cat 3's next aircraft waits aft of JBD 3 until Cat 4 fires (§7.4.4.3–4).
  - **→** A jet spreads its wings before it reaches the JBD 2 queue. "All four cats at once" really means the bow pair, plus Cats 3 and 4 in turn.
- **F10. One LA director, plus a hook runner.** NATOPS uses one Gear Puller (a director) and one Hook Runner (arresting gear crew, green shirt). Neither enters the LA until the aircraft stops.
  - The hook runner signals "wire clear". The gear puller signals hook up, hold brakes and off brakes, taxis the jet clear, signals "fold wings", and hands it to the next director (§5.2.3, §7.4.6).
  - Control passes only when the next director raises one arm (§7.4.4.3). NATOPS has no second gear puller split by wire.
  - Crossing the LA during a recovery needs the arresting gear officer's OK, with the pattern clear, running straight across at least 10 ft aft of the 1-wire (§5.1.2).
  - **→** Our crew crosses the LA only when CATCC shows no aircraft close in.
- **F11. A disabled jet is towed out before anyone calls a crane.** A "hot chocks" crew stands by for the LA during every recovery: two crash and salvage crewmen with chocks, and a driver with a running tractor and tow bar. The crane and forklift run through every recovery (§7.4.6, §3.4.2.1).
  - **→** The first response is a tow, which already exists. The crane is for aircraft that cannot roll.
- **F12. Parking and the player's exit.** Pilots do not shut down or leave until chocks, initial tiedowns and gear locks are in, and not without the director's clearance (§7.4.7). A route for fire trucks must stay open when parking (§7.4.7).
  - **→** The director's shutdown signal is the natural moment to swap the jet for a static. The fire lane is a real spotting constraint.
- **F13. Timing in flex deck and CQ.**
  - During CQ, "the Launching Officer shall closely scan recovering aircraft to avoid simultaneously launching and recovering" (§4.9). Bolters and wave-offs are kept apart from departing jets (105 §5.7.1).
  - CQ also involves hot refuelling and hot-seat pilot swaps, done only after the "tiedowns in place" signal, and a board of landings required and completed per aircraft, with its location (105 §5.7.1).
  - **→** Time bow-cat shots against arrivals (CATCC has them). The trap board is a natural CATCC feature. Whether DCS allows hot refuelling and hot seating needs checking.
- **F14. Spares and alert aircraft are missing from the notes.**
  - Spares are manned and kept running. When one launches in place of a down jet, PriFly tells it which side number it replaces (105 §4.8.2).
  - An alert Condition I aircraft is on the cat or has a clear route to it, with crew in the cockpit and a director, plane captain and handlers standing by (105 §4.11.1).
  - **→** "Keeping alert readiness during recoveries" means keeping a clear route to a bow cat.
- **F15. Elevator rules.** The aircraft is placed so it can be towed straight into the hangar. Riders stand on the inboard half; nobody rides at night. The elevator is not run while a turn heels the ship toward its side. A director and an operator work it on each level (§7.5).
  - **→** "Lower as soon as secured" means after chocks and 9 chains. A plane captain riding down is day-only.

Chains over the shoulder: no source either way. 105 §6.4 gives plane captains canvas bags for chains and says removed chains must not hang on an aircraft being moved. A Navy feature describes blue shirts "always carrying something heavy, whether it be a chain, tractor bar or chock."

## 3. Feasibility and gaps

**The eight foundations, as the repo shows them (2026-11-25)**

| # | Foundation | What exists | What orchestration still lacks |
|---|---|---|---|
| 1 | LA and catapult-area obstruction detection | PriFly checks whether an aircraft's centre point is inside the LA (`src/components/catcc/prifly/deck.ts`, `inLandingArea`); the slot picker checks the spawn spot | Our people, tractors, bars, statics and chocks are not counted, nor wings or tails hanging over the line. No catapult launch-path or safe-park-line check. The check runs in the web app, not in DCS. The demo uses the LA as a holding area: right for a respot, wrong during a recovery |
| 2 | Catapults on/off, crews away/back | CatGate: close/open per catapult, seen working | Single PC only. The crews' behaviour runs on every PC (Test 1b showed this for the launch), so every client needs the same gate state |
| 3 | Tows between deck, elevators and hangar | The spotting demo, seen in DCS (16–18 min at 1x) | Statics move only on the PC running the demo. Hornet only. Always starts from a full hangar. Refilling the hangar in reverse is not built |
| 4 | Spotting | The 40 spots, Spot All, the deck tool | No spotting plan derived from an air plan |
| 5 | Routes that avoid obstructions, stop when blocked | Tows yield and hold; walkers use DCS's path finder; PriFly's preview and the kneeboard show "hold short" | Directors marshalling *players* use fixed routes, one jet at a time, started from F10, with no hold-short, and not wired to PriFly's taxi orders. Adapting the taxi network to parked aircraft was decided on 2026-11-17 but not built |
| 6 | Spawn on a chosen spot | A Client slot per spot, held FLY and native aiming, seen with the user hosting | A remote client, a dedicated server and two players at once are untested. Needs a Client slot per spot in the mission file |
| 7 | Slot restricted to its reservation | Server-side gate by player ID (UCID) | Seen only with the user hosting. Reservations come from the picker, not an air plan |
| 8 | Spawn refused on an obstructed spot | The picker's pre-check | AI spawns are not covered |

**Weak points**

- **W1. Multiplayer shapes the architecture.** The facts:
  - Whatever our native module moves, it moves only on its own PC.
  - DCS creates the deck crew on each PC separately; on a server, only once a player sits in an aircraft on that ship.
  - The catapult behaviour runs on each pilot's PC.
  - Forum reports say clients sometimes do not see statics linked to a ship, see them at the wrong attitude, or lose them after rejoining (untested by us).
  - The demo's plans depend on frame timing: "two runs never match".

  The options:
  - **A. The server streams positions every frame.** Simple clients, but heavy traffic for dozens of objects, and motion jitters with ping.
  - **B. The server plans and clients replay.** The server sends each move as data: who moves, the path in ship coordinates, a start time, a speed profile, and timed events such as "chocks in at t". Every client plays it with the module it already has; late joiners get a snapshot. Needs a clock offset per client, stable names for every actor (our crew already have them), and a way for a client to find a static the server spawned (unknown).
  - **C. Peer-to-peer.** Ruled out by the last fact: clients that plan for themselves drift apart.
  - **D. DCS's own crew sync.** Flight.dll has functions for it (`procCrewMoveMember` and others). It might sync DCS's crew for free, but it is untested, works at the binary level, and has nothing equivalent for statics.

  B is the only option consistent with all of these facts. Its transport already exists: the server hook accepts client connections (`catcc-dcs/Scripts/CATCC/catcc.lua`, `PILOT`), so the deck keeps running if the room or the internet is down. Every remote-controlled state becomes a lease, as the launch hold already is (refreshed every 5 s, dropped after 15 s): if the brain stops, everything falls back to DCS's own behaviour.
- **W2. Casual servers use dynamic spawn.** Current Foothold editions use it. The spawn probes showed one static on spot 1 also made dynamic spawn skip spots 2–4, up to 59 m away; with statics on 39 spots the dynamic spawn screen offered no Hornet at all. Aiming did work for dynamic spawn on an empty deck. Spawning into a spotted aircraft needs a Client slot per spot, which third-party missions do not have (Q1).
- **W3. AI and DCS's air traffic control.** AI held off while a hot client jet sat on deck (2026-11-15). DCS gives each new spawn the lowest free spot, so AI late activation on a full deck is delayed. DCS parks AI on its own routes without seeing our objects, and AI will land whatever our deck model says. Nobody has yet looked for a DCS function that makes AI hold or wave off (Q3).
- **W4. Performance.** 38 static Hornets alone dropped the frame rate from 134 to 39 fps. The demo runs at 17–19 fps, and about 47 ms of each frame is DCS drawing objects, not our code. NATOPS chain counts would add about 530–700 chain objects for 40 deck and 24 hangar aircraft, plus chocks, about 40 plane captains and 12–15 directors. Ways to cut the count: one chain-set model per aircraft positioned by model arguments (1 object instead of 6–14); hangar chains drawn only when the camera is below; plane captains only for the next event's aircraft. The cost of one chain or one character is unmeasured: measure it first.
- **W5. Patched DCS files.** CatGate, the spawn-route tables and the crew lists live in the DCS install folder. Every DCS update overwrites them, and the server needs them too; whether the managed host gives access to the install folder is unknown (Q24). A startup check that finds a missing patch and falls back to stock behaviour keeps a server usable after an update. The hook also relies on `net.dostring_in`: DCS's API docs call it obsolete since 2.9.18; an ED forum thread says that label is a mistake; no official answer found.
- **W6. Long uptime.** Everything runs from test menus and the panel. State lives in the hook's tables with nothing supervising it. The deck's live state is not saved anywhere a server restart could reload it. The hook's Lua state outlives missions, so memory can build up over days. The test rig runs about 50x real time, so a 72-hour soak takes about 1.5 hours.
- **W7. No air plan model.** PriFly's "Air plan" tab lists ReadyRoom events within ±12 h (`src/components/catcc/prifly/BossView.tsx`, `useAirPlan`). Nothing holds launch and recovery events, flights, aircraft, pilots, spares or trap counts.
- **W8. The planners were built for the demo.** Hornets only, a known start state, about 15 min offline to solve a hangar layout. They use the LA for holding and pull-throughs, and do not treat taxiing players as moving traffic.
- **W9. Players will not follow the plan.** A player can taxi off-route, ignore the director, leave mid-sequence or crash on deck. The orchestrator must detect when a player leaves the plan and re-plan. Only the chock and launch holds physically stop anyone.

## 4. Open questions

**Scope**
1. Which casual missions first? Foothold uses dynamic spawn. Is adding a Client slot per spot to someone else's mission file acceptable (a patch tool), or must the deck work with dynamic spawn as the mission ships?
2. Hornet only for this phase? What happens to other types flown from the carrier: left out of spotting, or parked by DCS?
3. Carrier-based AI (tankers, E-2, AI CAP): managed by the orchestrator, kept to spots 1–4 and DCS's routes, or not allowed?
4. Up to three carriers: one independent orchestrator each? Handle a jet landing on a different carrier?
5. Force the Supercarrier taxi deck crew off through the mission, or coexist with DCS's directors on clients that turn them on?

**Procedures**

6. Cyclic ops as alternating Launch → Re-spot forward → Recovery → Respot, keeping flex deck for CQ, tanker or alert launches, and unscheduled traffic (F2)? Or cyclic = flex as written?
7. Add Respot and Secured modes (F1)?
8. Tow team: full NATOPS crew, a reduced crew, or driver plus one walker as written (F5)?
9. Chains: NATOPS counts everywhere, fewer, or none in the hangar (F6, W4)?
10. Chocks and chains off on the director's call just before taxi (F8)?
11. Plane captains: one per aircraft. For every spotted aircraft, or only the next event's? Riding the brakes, seated, during tows?
12. LA crew: one gear puller, one hook runner, and the next director waiting outside the LA (F10)?
13. Until a crane exists, should a disabled jet get the hot-chocks crew and a tow instead of being removed (F11)?
14. Will flight nights have spares, standby pilots who take a down jet's place in the sequence?
15. How is an aircraft marked damaged: pilot report, PriFly or LSO mark, or DCS's hit events?
16. During a recovery, do spots fill in the same order as the launch fill order, with Cat 2 closing last? Does "keep elevators free" mean nobody parks on an elevator while it is taking jets below?
17. When the deck fills up in flex deck: strike aircraft below faster, close Cat 1, or ask CATCC to hold arrivals?

**Control and UI**

18. In organized missions, who owns the deck plan: PriFly, or a separate handler seat (Flight Deck Control, using the Ouija board)?
19. Is a PriFly order a fixed constraint that automation plans around? Can PriFly freeze automation entirely?
20. Up/down: salute = up, plus an F10 item or a key for down?
21. How long to wait for a jet that is not ready before holding and resequencing it? The same on unattended servers?
22. Admin resets without ReadyRoom: a list of player IDs in the server's CATCC config? Which levels: one actor, one catapult, the whole deck, back to stock DCS?

**Multiplayer and hosting**

23. Does the brain run on the DCS server, with the room only viewing and sending commands (W1)?
24. Can the managed host take changes to the DCS install folder and our DLLs on the server? Can every client reach the hook's port?
25. Must late joiners see exactly the same picture, or the same end state with roughly the same motion?
26. Should the deck's state survive a server restart? Contention, for example, keeps units across restarts for weeks.

## 5. Implementation plan

**Principles** (each follows from the facts above)
- One brain per carrier, running on the DCS server. PriFly and the room view it and send it commands.
- The brain sets a desired state for each actor (a catapult crew, a tractor, an elevator). Each actor works toward that state from what it actually sees, with a watchdog that notices when it stops making progress.
- Every remote-controlled state is a lease: if nobody refreshes it, it falls back to DCS's own behaviour.
- Each actor has escalating resets: retry, reset the actor, take it out of service, revert to stock DCS. Each level has an in-game admin button.
- Everything is proven in the rig first, including soak tests and injected faults.

**Phases**
- **P0. Multiplayer test (gates everything else).** A dedicated server with two remote clients, running one tow, one director and one catapult gate from a streamed plan. Measure how far the clients drift apart, the clock offset, and how quickly a late joiner catches up. Settle at the same time: can a client find a static the server spawned; are our added crew on every client; what 100 chains and 20 extra characters cost; what the managed host allows. Done when both clients show the same motion within an agreed tolerance.
- **P1. Deck model.** One model per carrier on the server, holding the footprint of everything on deck (live aircraft, statics, people, tractors, bars, chocks, chains) and every zone (the LA, catapult launch paths and safe-park lines, JBD arcs, elevators, the bow bubble). It answers: is the LA foul (overhangs and people included), is each catapult clear, is each spot free, is each route blocked, how long until the deck is ready (which CATCC needs, §5.1.2). Replaces the web-only foul check.
- **P2. Actors, supervisor and resets.** Wrap each existing capability as a supervised actor: catapult crews, tow teams, the director pool, plane captains, elevators, statics, chocks and chains, the spawn gate. An admin page in the panel. Done when a 72-hour soak with injected faults in the rig leaves no actor stuck.
- **P3. Air plan v1 and Launch.** An air plan edited in PriFly, ReadyRoom as one import source, and a spotting plan built from the launch sequence. The launch chain: PriFly's start call and the plane captain's start signals; the pilot reports up or down; the director calls hold brakes and chocks and chains come off; several jets marshalled at once from PriFly's taxi orders, with hold-short and the queue behind the JBD; the catapult crew takes over. Jets not ready, down jets and spares.
- **P4. Re-spot forward and Recovery.** Clear the LA, with an emergency version; secure Cats 3 and 4. Gear puller and hook runner, then directors, to bow parking (taxi to the edge, turn, push back); handlers fit 6 chains, the plane captain adds 3. Static swap at the shutdown signal. Strike below: damaged first, El 3 then 2 then 1, secured, lowered, the hangar respotted. Tow out disabled jets.
- **P5. Respot, Secured and the scheduler.** The two missing modes and transitions between modes with time estimates. A timeline drives the modes from event times.
- **P6. Flex deck and CQ.** Bow catapults kept open, with the parking priority from the notes. Tows to El 4 and behind the JBD during gaps in arrivals. Bow shots timed against landings. CQ: a trap board, plus hot refuelling and hot seating if DCS allows them.
- **P7. Unattended servers.** Flex deck all the time, a ready deck while anything is airborne, a pool of spotted jets ready to spawn into, the dynamic-spawn path and the AI policy (Q1, Q3), persistence across restarts.
- **P8. Stretch goals.** Crane, an external API, SRS speech recognition, other aircraft types.

## Sources
- [Modern US Navy carrier air operations (Wikipedia)](https://en.wikipedia.org/wiki/Modern_United_States_Navy_carrier_air_operations) · [Launch and recovery cycle (Wikipedia)](https://en.wikipedia.org/wiki/Launch_and_recovery_cycle)
- [Flex Deck Operations, Navy SWOS slide (FAS)](https://man.fas.org/dod-101/navy/docs/swos/eng/62n7-1/tsld015.htm)
- [The brain behind the plane (navy.mil)](https://www.navy.mil/Press-Office/News-Stories/Article/2250137/the-brain-behind-the-plane) · [Trust is at the heart of a plane captain's duties (Baptist Press)](https://www.baptistpress.com/resource-library/news/trust-is-at-the-heart-of-a-plane-captains-duties/)
- [The flight deck choreographers (CENTCOM)](https://www.centcom.mil/MEDIA/NEWS-ARTICLES/News-Article-View/Article/1270155/the-flight-deck-choreographers/)
- [P-1211 Hot Seat Procedures (tpub)](https://navyflightmanuals.tpub.com/P-1211/Hot-Seat-Procedures-53.htm)
- [Foothold Sinai Extended, dynamic spawn](https://www.digitalcombatsimulator.com/en/files/3340421) · [Foothold Caucasus Extended, dynamic spawn](https://www.digitalcombatsimulator.com/it/files/3341245) · [SPS Contention](https://forum.dcs.world/topic/334682-sps-contention-dcs-pvp-server)
- [net.dostring_in "obsolete" label (ED forum)](https://forum.dcs.world/topic/379858-apisim_controlapihtml-mistakenly-calls-netdostring_in-obsolete)
- ED forum reports on statics in multiplayer: [statics not syncing between clients](https://forum.dcs.world/topic/179654-static-objects-not-syncing-between-clients) · [linked static attitude](https://forum.dcs.world/topic/316815-static-av-8b-alignment-to-linked-ship) · [statics gone after relog](https://forum.dcs.world/topic/235378-resolvedstatic-disappering-after-relogging-on-mission)

Two DCS forum threads on real cyclic ops and recovery spotting (topics 190704 and 262004) refuse automated fetches; nothing here comes from them.
