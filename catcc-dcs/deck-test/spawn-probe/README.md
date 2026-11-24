# ATC probe (spawn-probe)

An experiment, not part of the mod. Runs 1 to 9 and the slot picker's first run with mission slots were on
2026-11-22. The module is `atcprobe-11` (`aim`, `restore`, `check`, and since 2026-11-23 `updobs`); **`check` and `aim`'s `fromOne` have not run
in DCS.**

Question: can the carrier's air traffic control (class `woATC`, `Flight.dll`) be told which spawn spot
("terminal") a client's spawn gets, so that the player is put straight into the spotted aircraft's place?

**Where it stands.** Run 9: the first spawn of a mission aimed by `low` landed (spot 24), then 20, 36 and 40
(the last two with the direct write). The slot picker's run with mission slots on a spotted deck: 33 of 39 aimed
spots landed with `up`; the six that did not are explained by the demo, not by DCS (below). `low` is out: it
froze DCS once and missed twice. What makes a mission's first aimed spawn freeze is still not known.

## The rule, as runs 1 to 6 showed it

- Every jet terminal of the ship's ATC has an **order number**: the word at +0x8c of the terminal, the third
  field of its record (`woATC::fillTerminalsState`), Lua's `Term_Index_0`. Untouched, it is the deck spot's
  number.
- **A real spawn takes the terminal with the lowest number from 5 on that has no aircraft on it, and the jet
  appears at that number's place.** Run 6: spot 24's terminal was given number 5 and spot 5's number 24. The ATC
  then held spot 24's terminal for the client, and the jet stood on spot 5. The number is a place in the spawn
  table (`GT.TaxiForTORoutes`); the terminal is only the bookkeeping.
- So, to put a spawn on spot T, every number from 5 to T - 1 must be out of play. Run 6 did that for T = 32.
- `woATC::procInitTerminals` writes a terminal's number, if the terminal has a `Term_Index` of its own (31 of the
  40: the ones with a parking route). For the nine spawn-only terminals (spots 32 to 40, `Term_Index` -1) it
  cannot: run 6, the write on spot 36 did not take.
- Numbers below 5 are not chosen (run 6: number 1 on the target was ignored).
- What does not work: marking terminals taken ourselves (`acquire`, `procTerminalStatus`, taken records with a
  made-up client); exchanging two numbers (moves the bookkeeping, not the place).
- DCS's chooser (`setClientSpawnOnTerminalMiss`) changes what it is asked about, and for a spawn-only terminal
  for good. It has not been called since. (The final check of run 6 left spot 5 held until the mission
  ended: the hook no longer took the snapshot its give-back needed. That check is gone.)
- No crash in any run.

## From the files (not changed)

- **`GT.TaxiForTORoutes` order against our spot numbers: confirms "the number indexes the route list".**
  `spots.gen.ts` writes the 40 routes in the order of the spots, route n for spot n
  (`director-spots.lua`: `-- 1 Bow stbd 1` to `-- 40 ...`), and a spawn spot is the first point of its route. An
  untouched terminal's number is its spot's number, and run 6's jet appeared at route 5's first point when the
  terminal chosen carried number 5.
- **Why 5:** in DCS's stock file the first four routes are `1 spawn spot(6pack 1) -> catapult 1` to
  `4 ... -> catapult 4`, one per catapult. Hoggit says the first four spawn points are available only at mission
  start. Our file puts Bow stbd 1 to 4 in those four places, so those four spots cannot be aimed at after
  mission start. Reordering the spot list so that four spots nobody needs come first would free them; not done.
- **`GT.BlockerTerminals = {6,7,8,9}`** is about parking, not spawning: its comment in DCS's file says that when
  such a terminal "is assigned or obstacled, parking with greater number will be searched to taxi to". Those are
  parking-route numbers (`Term_Index`): in our file Sixpack 6, 5, 4, 3. It says nothing about numbers 1 to 4.
- **`Term_Index` is the parking route's number** (`GT.TaxiRoutes`, `PARK_ORDER` in `spots.gen.ts`: 22 is Bow stbd
  6, 12 is Corral 1: as the runs read). The nine spots without one are Port 1 to 5, El 4 1 and 2, Stbd 1 and 2.
- **Giving the nine a `GT.TaxiRoutes` entry, as the alternative to the direct write:** add their ids to
  `PARK_ORDER` (nine more entries, 32 to 40). `buildParkRoutes` then needs a route from the roll-out's end to
  each (`taxiWaypoints(fan, id, -90)`): the port side and the stern are in or beside the landing area, so the
  taxi network may have no such route yet, and the generator throws if it has none. The parking-route tests and
  `director-spots.lua` change with it. Cost in the sim: AI aircraft may be sent to park on those spots after
  landing, in the landing area; `GT.BlockerTerminals` and the order decide which parking is tried first, so
  putting the nine last keeps them as the last resort. Whether a terminal then gets a `Term_Index` from its
  parking route is what the runs suggest, not proven for new entries.

## Runs 7 and 8: the freeze needs the first spawn of the mission

Run 7: DCS hung (Windows: AppHangB1), with no crash file, on the first spawn of the mission, after
`aim(24, 'up')` (spots 5 to 23 lifted to 105 to 123, read back, 24 the lowest in play). Run 8: a plain first
spawn, then `aim(32)`, `aim(32)` with `aim` again inside the slot request, `aim(19)`, `aim(18)`, `aim(20)` and
the very `aim(24)` that froze: all on the target, no freeze. So:

- A target with a `Term_Index`, a number that is also another terminal's `Term_Index` (20, 24), and a call of
  ours inside `onPlayerTryChangeSlot` are all cleared.
- What is left is the first spawn. The reading round 9 works from: at the first client spawn DCS does something
  once with every terminal's number, and a number outside the spawn table (1 to 40) is what it cannot take.
  For it: run 6's first spawn had two numbers exchanged, both within the table, and did not freeze; run 5's
  first spawn had taken records and did not freeze; run 7's had 105 to 123 and froze. Not proven.

## What round 9 does

Each case is the **first spawn of a fresh mission start**; the user hosts the mission again for the next case.
Which case a start runs is kept in a file of the hook's own (below).

| Case | First spawn of the mission | Why |
|---|---|---|
| 1 `low` | `aim(24, 'low')`: every number from 5 to 23 becomes **4** | 4 is a place of the spawn table, so nothing DCS does with a number reads outside it; numbers 1 to 4 are never chosen after mission start (run 6: number 1 on the target was ignored), so the lifted spots are out of play all the same |
| 2 `neg` | `aim(24, 'neg')`: every number n becomes -(1000 + n) | outside the table the other way: tells "outside the table" from "above the table" |
| 3 `prime` | DCS's chooser asked once and what it gave given back, then `aim(24, 'up')` | only if neither of the others landed: see below |

**Why 4, and the same for all.** The four candidates are 1 to 4. At a mission start DCS gives those out in turn
(run 4: 1, 2, 3, 4), so 4 is the one it would reach last if it ever chose from them again. All lifted terminals
get the same value so that there is one value to reason about; two terminals with one number were already seen
without trouble (run 6: number 1 on a second terminal). Spot 4's own terminal keeps its 4 and is not touched.
What it costs: up to 19 terminals (35 for spot 40) share a number for the seconds between `aim` and `restore`.
If DCS's once-only work needs the numbers to be different, this case freezes and case 2 answers the other half.

**Case 3, `prime`.** `woATC::setClientSpawnOnTerminalMiss(900001, "FA-18C_hornet", 16000)` once, about 10 s
into the mission, with every number untouched, then `free()` and `procInitTerminals` with stage A's record of
that terminal (run 4's release). On an untouched deck the chooser gives spot 5 (run 3), which has a `Term_Index`
of its own, so the give-back reaches it; if it gave a spawn-only terminal the round is not asked of the user.
The hope: the chooser is the function a client spawn goes through, so whatever DCS sets up once, it sets up
here, before anything is lifted, and `aim(.., 'up')` is then as safe as it was in run 8. The lift by + 100 is not
run as a first spawn without this before it.

**In the start whose first spawn lands**, the same mission goes on, in that case's mode:

| Round | What | Tells |
|---|---|---|
| 2 | `aim(20)` | the mode on a second spot, not as the first spawn |
| 3 | `aim(36)`, writes allowed | a spawn-only target: spots 32 to 35 have their number word (+0x8c) written directly, 5 to 31 lifted by record |
| 4 | `aim(40)`, writes allowed | the last spot: 32 to 39 written |

Case 3 is left out once a case has landed. A case that missed (the jet stood elsewhere) is settled and the next
start runs the next case.

**The case file:** `%USERPROFILE%\Saved Games\DCS\Logs\catcc-atcprobe-case.txt`, written by the hook, one line
an event:

| Line | Written |
|---|---|
| `case n started` | at the slot request, before DCS spawns |
| `case n done landed` / `case n done missed` | when the aircraft is seen |
| `case n froze` | at a later mission start that finds `started` as the case's last line: the case is not run again |
| `case n stopped` | the mission was stopped between the slot request and the aircraft: the case is run again |
| `case n not set` | the round could not be set (aim or prime failed): settled |

**To start over, delete the file.** The hook cannot tell a freeze from DCS being ended by hand between the slot
request and the aircraft: both leave `started` as the last line.

**The log places a freeze**, as in round 8: every line is written and the file closed at once; `aim` and
`restore` have a line before and after the native call; from the slot request to the end of the round there is a
line before and after every native call, `the slot request is answered: back to DCS`, a line for each of the
first 30 frames, and a line a second while the aircraft is awaited.

## Run 9 and the picker's run with mission slots (2026-11-22, 19:53 to 20:52)

**Run 9** (dynamic spawn, empty deck): `aim(24, 'low')` as the first spawn of the mission, 35 s after the mission
loaded: on the target. Then 20, 36, 40: on the target; restores clean. Cases 2 and 3 were not run.

**The picker's run** ("slot per spot", a Client Hornet per spot, the deck being spotted by the demo; the picker
calls `aim` just before `net.set_slot`): on the target for spots 5 to 25, 30, 31 (mode `up`) and 32 to 38.

**The six elevator spots (26 to 29, 39, 40): the demo's two aircraft that stay on elevators 2, 3 and 4 stand on
each other's spots.** `crewtest_demo.lua`, `loadsOf`: the two that stay are named by which stood further forward
*in the hangar* (that one is "El k 1", the forward spot), but they are parked on the platform place the plan's
tow gives them (`tows[n].st`: 1 aft, 2 forward). For elevator 1 the two agree; for 2, 3 and 4 they are crossed.
The crew-test log of the run says so itself:

| Aircraft | Named for | Stands at (x) | That is |
|---|---|---|---|
| 517 | El 1 1 (spot 16, x 34.2) | 33.05 | spot 16: right |
| 712 | El 1 2 (spot 17, x 22.74) | 23.05 | spot 17: right |
| 527 | El 2 1 (spot 26, x -12.29) | -24.29 | spot 27 |
| 566 | El 2 2 (spot 27, x -24.29) | -14.88 | spot 26 (2.6 m off) |
| 637 | El 3 1 (spot 28, x -91.22) | -103.74 | spot 29 |
| 525 | El 3 2 (spot 29, x -103.74) | -93.91 | spot 28 (2.7 m off) |
| 577 | El 4 1 (spot 39, x -98.1) | -109.75 | spot 40 |
| 514 | El 4 2 (spot 40, x -109.96) | -100.00 | spot 39 (1.9 m off) |

So "take the static of spot 39 away" took the one standing on spot 40, and spot 39 kept an aircraft. Each of the
seven spawns then follows from the rule:

| Aimed | Static taken away stood on | DCS | Why |
|---|---|---|---|
| 39 | 40 | came up on 40 | 39 obstructed; the next number in play, 40, was just emptied |
| 40 | 39 | "flight is delayed" | 40 obstructed (the one made again there); nothing after it |
| 27 | 26 | delayed | 27 obstructed; 28 to 40 all have aircraft |
| 26 | 27 | came up on 27 | 26 obstructed; 27 just emptied |
| 27 again | 26 | delayed | as before |
| 29 | 28 | came up on spot 28's terminal, **number 128** | 29 obstructed; 30 to 40 occupied; of the lifted terminals only spot 28's place was empty |
| 28 | 29 | came up on 29 | 28 obstructed; 29 just emptied |

The fix is in the demo (not in this branch): name the two that stay by the platform place they are parked on
(`st` 2: "El k 1", `st` 1: "El k 2"). Elevator 1 stays as it is. Apart from the crossing, a platform place is up
to 2.7 m from its deck spot (El 2 1: 2.6 m, El 3 1: 2.7 m, El 4 1: 1.9 m, El 1 1: 1.2 m): after the fix the static
and the jet that replaces it stand that far apart on those four spots.

**What the run adds to the rule:**
- A number lifted by `up` is not out of play, it is last: when no spot from the target on is usable, DCS gives a
  lifted terminal whose place is free (the spawn on spot 28 with number 128).
- When the target is obstructed DCS does not wait: it gives the next usable number, or nothing ("delayed").
- A static 1.9 to 2.7 m from a spot obstructs it; one 10 m away (the partner on a platform) does not.

**`low`: out.** (1) 20:23:30, `aim(34, 'low')` as the first Spawn of a mission, 16 s after the mission loaded: the
picker's log ends there and Windows logged DCS as hung at 20:24:13 (AppHangB1, the same fault bucket as run 7's
freeze). So numbers inside the table do not keep a first spawn from freezing. (2) 20:07, `aim(34, 'low')` and
then `aim(33, 'low')`: both aircraft came up on the bow; after the first, spot 33's terminal (the first in the
ATC's list carrying number 4) read taken. A terminal carrying number 4 was given. (3) 20:27, `aim(33, 'low')` as
the first Spawn: on the target. Run 4 had already shown DCS's chooser giving spots 1, 2, 3, 4 before 5 in one
mission start, and 5 first in three others at the same mission time: in some mission starts numbers 1 to 4 are in
play. What decides that is not known.

**First aimed spawns so far** (time from "mission loaded" to the slot being asked for):

| When | Mode, kind | Seconds | Outcome |
|---|---|---|---|
| run 7, 19:19 | `up`, dynamic | 23 | froze |
| 20:23 | `low`, mission slot | 16 | froze |
| 20:07 | `low`, mission slot | 23 (taken at 29) | no freeze; on the bow |
| 20:27 | `low`, mission slot | 29 (taken at 36) | on the target |
| run 9, 19:53 | `low`, dynamic | 35 | on the target |

Two freezes at 16 and 23 s, none from 29 s on: five data points, no proof. Every plain first spawn (25 s and
later) was fine; no spawn after the first ever froze (about 50).

## The calls (native module `atcprobe-11`)

| Call | What it does |
|---|---|
| `native.aim(shipObjectId, T [, mode, allowWrite])` | Every terminal whose number is in play before T (5 <= number < T) is lifted out of play. With a `Term_Index`: one `procInitTerminals` call. Spawn-only: counted as `blocked`, or, with `allowWrite`, the number word written directly. Verified by a fresh list of the ATC's records. Returns `{ target, taken, client, lifted, written, blocked, failed, layoutBad }`. Calling it again lifts nothing twice. |
| `native.restore([shipObjectId])` | Every lifted number put back, verified. Returns `{ records, written, left, failed }`. Calling it twice does nothing the second time. |
| `native.updobs(shipObjectId)` | `woATC::updateTermObstructions()` (protected, `void()`, Flight.dll) on the ship's ATC: its own pass over what stands on its terminals. `true`, or `nil, why`. Added 2026-11-23 for the slot picker's held FLY, called the moment a spot's static is seen gone. **NOT YET RUN IN DCS**: whether DCS keeps obstructions from such a pass, or works them out afresh when it chooses, is what the picker's wait ladder tells. |

| `native.check(shipObjectId, spot [, typeName [, mass]])` | **Read only.** DCS's own answers about that spot's terminal, now. Returns `{ spot, place, termIndex, number, type, lifted, free, client, taken, object, obstructed, obstructedWide, usable, why }`. `nil, message` if the ship or the spot's terminal is not found. Without a spot: `{ [spot] = that table }` for every terminal. NOT YET RUN IN DCS. |

`aim`'s `mode`: `'up'` (number + 100: runs 6 to 8 and the picker's run; froze once as a first spawn), `'low'` (4:
out, see above), `'neg'` (-(1000 + number): never run). A fifth argument `true` (`fromOne`) lifts numbers 1 to 4
too (not with `low`): for the mission starts in which DCS gives those. The target must still be 5 or more.

**`check`, field by field:**

| Field | From | Meaning |
|---|---|---|
| `usable` | the four below | `free` and `client == 0` and not `object` and not `obstructed`. Anything that could not be asked makes it false. |
| `why` | | `""`, or `"an aircraft stands on it"`, `"held for a client"`, `"not free (acquired)"`, `"obstructed (woATC::isAdrTermObstructedFor)"`, `"could not be asked"` |
| `free` | `wsBasicTerminal::is_free` | |
| `client` | the ATC's record | the client id it is held for, 0 for none |
| `object` | `wsBasicTerminal::get_acquired_object` | an aircraft stands on it |
| `obstructed` | `woATC::isAdrTermObstructedFor(terminal, type, type, mass)` | run 1: true for the terminal a static Hornet stood on, false for its neighbour 16 m away |
| `obstructedWide` | `woATC::isAdrTermObstructedForDynamicAirdromeSpawn` | run 1: true also for neighbours up to about 29 m. Not what a spawn on the ship goes by (33 spawns landed between statics); for the log only |
| `taken` | the record's byte | stays set after an aircraft has left: not a reason to refuse |
| `lifted`, `number`, `termIndex`, `place`, `type` | | the terminal as it reads: a spot whose number `aim` has lifted is still found by its spot number |

DCS's two functions answer yes or no: **they do not name what obstructs.** The picker can name it itself: the
demo knows where every aircraft of its own stands (the nearest one to the spot's position).
`typeName` defaults to `"FA-18C_hornet"`, `mass` to 16000 (what run 1 asked with; what DCS does with the number
is a guess).

**In the picker** (`spawnTick`, after the static is gone, before `aim` and `net.set_slot`):

```lua
local c, err = aimMod.check(ship, spot)
if not c then            -- not checked: do not take the slot
  refuse('the spot could not be checked: ' .. tostring(err))
elseif not c.usable then -- DCS would put the aircraft elsewhere, or delay it
  refuse('Spot ' .. spot .. ' is not clear: ' .. c.why)
else
  aimMod.aim(ship, spot, 'up', true, true)
  net.set_slot(...)
end
```

Run 1 read the obstruction 10 s after a static was made or taken away, not sooner: if `check` still says
obstructed 3 s after the static went, ask again each tick for a few seconds before refusing.

## What the slot picker needs (`crewtest_slots.lua`; not edited here)

Today `S.spawnSel` takes the target's static away (`demo2|man`), calls `demo2|block|<spot>`, and `spawnTick`
takes the slot `SPAWN_PRE` (3 s) later with `net.set_slot`; `demo2|unblock` follows once the slot is the
player's, or `spawnUndo` after 10 s.

- **Where the calls go.** `aim(ship, spot)` in `spawnTick`, just before `net.set_slot`, in place of
  `demo2|block`. `restore(ship)` in place of `demo2|unblock`, but later than today: not when the slot is the
  player's, but **when his aircraft exists**. DCS gives the terminal when the aircraft appears (3 to 11 s after
  the slot request in the runs), and with a mission slot the player first sits in the briefing until FLY. So:
  restore when the mission state shows his unit on the deck, when he leaves the slot, or after a timeout.
- **One aim at a time per ship.** While numbers are lifted, any other spawn on that ship goes to the target or
  to the spots after it. The picker has to hold a second Spawn until the first aircraft exists and `restore` has
  run. With the briefing in between that can be long: a timeout that gives the spawn up (restore, static back,
  as `spawnUndo` does) is needed.
- **Which process.** The calls must run where the ATC that decides lives. In the runs that was the host, which
  was also the player. The picker today runs on the host; for a remote client the server has to make the calls
  on his request, and whether the server's or the client's ATC decides is untested (below).
- **Where the functions live.** `aim` and `restore` are in `catcc_atcprobe.dll`. The crew test's hook loads
  `catcc_crew.dll`: either it loads this module too, or the two functions (with the list walk, the record
  reading and the ship lookup they use) move into `catcc_crew.cpp`.
- **The ship's object id**: `Unit.getByName(<carrier>).id_` from the mission state, as this hook reads it.
- **The first spawn of the mission** must not be aimed with numbers above the table (run 7). Which mode the
  picker's `aim` uses, and whether the first spawn needs anything else, is what round 9 decides.
- **Spots 1 to 4** cannot be aimed at (`aim` refuses a target below 5). **Spots 33 to 40** need the write, or
  parking routes for the nine.
- **Mission slots.** The picker's test mission has one Client Hornet per spot, not dynamic spawn. Mission slots
  were seen to follow the same order (slots coming up on spot 7 when 5 and 6 were blocked), so `aim` should
  apply; untested.
- **A first integrated test:** (1) this probe in the "slot per spot" mission, crew-test hook out: do mission
  slots land on the target? (2) Then wired into the picker: Spot Deck, pick the aircraft on Corral 1 (spot 24),
  Spawn, FLY: the jet must appear on Corral 1 where its static stood, with the statics on the lower spots still
  standing; the log must show `aim` before `set_slot` and `restore` after the aircraft exists; then pick a
  second aircraft at once (the queue), and one on a spot from 33 on.

## Which side decides: what this run cannot tell

The run is a hosted server whose host is also the player: one process, one ATC (`WHICH SIDE DECIDES` in the
log). To be tested with a dedicated server and a remote client: hook and module on the server only; on the
client only; where the other players see the jet; whether numbers lifted on the server reach a client that
joins while they are lifted.

## Spots 1 to 4 (Bow stbd 1, 2, 4, 5)

`aim` cannot make DCS give a number below 5, and the place comes from the number. The spawn table is read from
`USS_Nimitz_RunwaysAndRoutes.lua` when DCS loads the ship. So the only way found is in the table: the 40 spots
must carry numbers from 5 on.

**A: four more entries in front (44 routes).** `GT.TaxiForTORoutes` = four fillers, then the 40 spots as numbers
5 to 44. DCS took 40 routes where it ships 16 (the count is `#GT.TaxiForTORoutes`), so 44 is likely taken; not
tested. What changes:
- `spots.gen.ts`: `buildSpawnRoutes` puts four filler routes first; route n + 4 is spot n.
  `director-spots.lua` regenerated; the per-route hand-off lists it also writes (one for each route: 40 today)
  become 44.
- Everything that says "spot n is DCS's number n": the picker's `aim(ship, spot)` and `check` become `spot + 4`;
  `crewtest_routes.lua`'s comment ("its number in DCS's spawn table"); the probe hook and its stand-ins. The
  mission's `parking` numbers are read by the picker only (DCS was not seen to use them) and can stay.
- The 31 parking routes (`GT.TaxiRoutes`, `PARK_ORDER`): not touched. A terminal's `Term_Index` comes from the
  parking route that ends on it, by place.
- Tests: `spots.test.ts` (40 routes, the first on the plan's first spot, the hand-off lists), `install.test.ts`,
  `crewtest.test.ts` where it reads the DCS file, `atcprobe.test.ts`.
- **The fillers need places of their own.** DCS makes one terminal a place (31 parking ends and 40 spawn spots
  give 40 jet terminals, not 71), so a filler on a spot's own position would merge with it, and which number the
  merged terminal gets is unknown. A filler is a real spawn point: in a mission start in which DCS gives numbers
  1 to 4, and for anything that spawns without an aim, an aircraft can appear there. Where the four go is a deck
  decision (DCS's own first four lead to the four catapults).
- With `aim(.., fromOne = true)` the fillers' numbers are lifted with the rest; a filler has no parking route, so
  its number is one of the direct writes.

**B: four spots moved to the front (40 routes).** The spot list reordered so that four spots players never spawn
on are numbers 1 to 4. No new geometry, the count stays 40. Costs: those four cannot be aimed at instead; every
spot number changes (CSV order, `deckSpots.gen.ts`, `director-spots.lua`, `crewtest_routes.lua`, the mission's
`parking` numbers, the tests' expected numbers).

**C: as it is.** Bow stbd 1, 2, 4 and 5 hold aircraft and cannot be spawned into.

## The mode for mission slots

- **`up`, with `fromOne`.** `up` is the only mode with a clean record on mission slots: 33 of 33 where the spot
  was really clear. What it does when the target is not usable is known (the next usable number, then a lifted
  terminal's own place, else "delayed"), and `check` keeps the picker from getting there. `fromOne` closes the
  mission starts in which numbers 1 to 4 are in play (with `up` alone a clear spot 1 to 4 would win there).
- **No in-table value is "safe as a first spawn":** `low` froze one (20:23). A value like "40 for all" would add
  nothing known and would put a last-resort spawn on spot 40's place whatever stands there.
- **The first spawn.** Not solved. The one pattern in five cases is time: both freezes were aimed less than 25 s
  after the mission loaded. A rule that costs nothing if it holds: the picker does not take a slot before 60 s
  of mission time.
- **One mission start tests it:** host, Spot Deck, wait until the mission is 60 s old (the picker can log the
  model time at each `aim`), then the first Spawn of the mission with `aim(ship, 24, 'up', true, true)`. On the
  target, no freeze: go on in the same mission with spots 26 to 29, 39, 40 (after the demo's fix, or with
  `check` refusing them), and one spawn with a static taken away by hand from a lower spot to see `check` say
  clear and the jet still land. A freeze: time is not it, and the next try is the chooser called once at mission
  start (round 9's case 3, never run).

## The product's shape

| | A: a module of its own (`catcc_spawn.dll`: `aim`, `restore`, `check`) | B: folded into `catcc_crew.dll` |
|---|---|---|
| Code | about 600 of the probe's 1,950 lines: the export table (about a dozen of its 44 names), the guarded call helpers, the register walk to the ship, `getATC`, the list walk, `fillTerminalsState` / `procInitTerminals`, aim / restore / check. A new file; the probe stays as the experiment | the same 600 lines added to a 3,600-line file that already has the register walk, the guarded helpers and a symbol table of the same form: about 150 lines are shared and need not be copied |
| Build and install | a third DLL: its own `build.cmd`, self-test (the probe's aim / restore / check tests carried over), an install line, a load in the picker | no new file: the crew test's build and install; the picker already depends on the crew hook's module being loaded |
| Failure | a DCS update that renames one of those exports disables spawn aiming only | the same symbols missing must not stop the crew module loading: its table has to treat them as optional |
| Who needs it | a server that runs the picker without the deck crew still gets it | only with the crew module |
| Tests | the probe's self-test split off | the crew module's self-test grows |

My recommendation: A. The three calls have one caller (the picker), one reason to change (DCS's ATC), and the
crew module is already the largest native file; B saves about 150 lines and one DLL.

## Files

| File | What |
|---|---|
| `CATCC-atcprobe-hook.lua` | the run; its settings are at the top |
| `native/catcc_atcprobe.cpp` | the native Lua module (`luaopen_catcc_atcprobe`, version `atcprobe-11`): `aim`, `restore`, `check`, `updobs`, and the read-only functions the hook logs with |
| `native/catcc_atcprobe_selftest.cpp` | its self-test, on stand-in classes shaped like DCS's |
| `native/build.cmd` | builds and runs the self-test, then builds `bin\catcc_atcprobe.dll` (only if it passed) |
| `native/check_exports.py` | checks every decorated name of the module against the DLLs' export tables (`bin` and `bin-mt`) |
| `test/standins.lua` | stand-ins for DCS, the mission state and the module; used by `catcc-dcs/test/atcprobe.test.ts` |
| `bin/` | build output, not committed |

## Install (the orchestrator, with DCS closed)

1. Build: `catcc-dcs\deck-test\spawn-probe\native\build.cmd` (VS 2022 Build Tools). Output:
   `catcc-dcs\deck-test\spawn-probe\bin\catcc_atcprobe.dll`. **The DLL changed since run 9** (`check`, `fromOne`);
   the hook did not. For the slot picker only the DLL is needed: keep `CATCC-atcprobe-hook.lua` OUT of
   `Scripts\Hooks` then (it is the round-9 experiment and acts in the "dynamic spawn" mission).
2. Copy exactly these two files:
   - `catcc-dcs\deck-test\spawn-probe\bin\catcc_atcprobe.dll` to
     `%USERPROFILE%\Saved Games\DCS\Scripts\CATCC\bin\catcc_atcprobe.dll`
   - `catcc-dcs\deck-test\spawn-probe\CATCC-atcprobe-hook.lua` to
     `%USERPROFILE%\Saved Games\DCS\Scripts\Hooks\CATCC-atcprobe-hook.lua`
3. If `%USERPROFILE%\Saved Games\DCS\Logs\catcc-atcprobe-case.txt` exists from an earlier try, delete it: the
   series then starts at case 1.
4. Already there from the crew test's install, and needed: `Scripts\CATCC\crewtest_routes.lua` (the deck spots),
   `net.allow_dostring_in` "server" (`autoexec.cfg`), the deck spots installed as DCS's spawn spots
   (`director-test.ps1 -Spawn Spots`).
5. Keep the other spawn probes out of `Scripts\Hooks`. For the "slot per spot" mission: `CATCC-crewtest-hook.lua`
   out of `Scripts\Hooks` (or its slot refusal off) and an empty deck.
6. Start DCS afresh.
7. Remove the hook and the DLL when done.

## What the user does and sees

**Every mission start:** host the "dynamic spawn" mission as a multiplayer server and stay in spectators. The
first slot taken must be the one the chat asks for: a spawn before it would no longer be the first.

**Start 1 (case 1, `low`).**
1. About 10 s in: `CATCC test: ready (round 1 of 1). Take a Hornet slot on <ship> now. Aim: Corral 1. Case 1 of
   3 ("low"): the first spawn of the mission. THIS SPAWN MAY FREEZE DCS.` Take a dynamic Hornet slot.
2. The first spawn loads the aircraft: about 10 s. **If DCS freezes:** wait a full minute, then end it and go
   to start 2.
3. If the jet appears: `CATCC test: round 1: ON THE TARGET. Release the slot and spawn again (round 2 of 4).
   Aim: Sixpack 3.` (or the spot it stood on, and no more rounds). The jet should stand on Corral 1 (spot 24),
   with spots 5 to 23 empty.
4. **Go back to spectators first**, then take a slot again, for each round: Sixpack 3 (spot 20); then spot 36
   and spot 40, on the port side and at the stern, whose chat lines end with `THIS SPAWN MAY FREEZE DCS.`
5. The end: `CATCC test: finished. ON THE TARGET: spot 24 (...); ...`

**Start 2 (case 2, `neg`).** Host the mission again (after a freeze: start DCS again). The chat says `Case 2 of
3 ("neg")`. The same steps. It is run whether case 1 landed or not: it tells whether a number below the table
freezes too.

**Start 3.** If neither landed: `Case 3 of 3 ("prime")`, the same steps. If one landed: `CATCC test: every case
has been run. Nothing is aimed in this mission.` and nothing more.

Other lines: `round n: not set.` (a round whose target is not the next spot by the numbers is not asked of the
user); `CATCC test: no aircraft appeared. Take a slot again (round n of N).` two minutes after a slot request
with no aircraft. No message at all means stage A failed.

## The log

`%USERPROFILE%\Saved Games\DCS\Logs\catcc-atcprobe.log` (lines with `native` are the module's own), and one line
per event in `dcs.log` (`CATCC-ATCPROBE`).

- `the cases so far: 1 low: done landed; 2 neg: not run yet; 3 prime: not run yet`, then `THIS MISSION START
  RUNS CASE n of 3 ("name")`.
- `case n (name) was started on an earlier mission start and never finished: DCS FROZE on it; it is not run
  again`; `case 3 (prime) is only for when no case before it landed: left out`.
- `ROUND 1 of 1: case 1, the first spawn of the mission: aim(24, low); aim: spot 24 (...)`.
- `    > native.aim` / `    < native.aim`; `the round set: aim(spot 24, low): 19 numbers lifted through
  procInitTerminals, 0 written directly, ...`; for spot 36 `..., writes allowed): 27 numbers lifted ..., 4
  written directly`.
- Case 3: `PRIMED: the chooser asked once (id 900001): it gave #i (...); given back: done, every terminal reads
  as at stage A`.
- **From the slot request:** `the case file: case n started`; `the slot request is answered: back to DCS`;
  `frame 1 after the slot request (the hook runs)` to `frame 30 ...`; `second 1 after the slot request: the hook
  runs, no aircraft yet`.
- **If it froze:** the last line. After `the slot request is answered` with no `frame` line: DCS never came back
  to the frame loop. With `frame` and `second` lines going on: DCS was running and the aircraft did not come.
  After a `>` line with no `<`: inside that native call.
- `CASE n (name) LANDED: 3 more rounds follow in this mission, in the same mode`, or `CASE n (name) did not
  land. Host the mission again for the next case.`
- `RESTORED (round n): ...; every terminal's number reads as at stage A`.
- **The answer:** `THE SERIES IS OVER: N rounds`, then one `RESULT round n [...]` per round.

## Settings (top of the hook; no rebuild)

`CASES` (each `{ name, spot, mode, prime, ifNoneLanded }`), `FOLLOW` (each `{ spot, write }`),
`WRITE_SPAWN_ONLY_NUMBERS` (on: used only by a round with `write = true`), `DUMMY_ID`, `TRACE_AFTER_SLOT`,
`TRACE_FRAMES`, `SLOT_WATCH_FIRST`, `CLIENT_QUERIES`, `FORCED_QUERY`, `SPAWN_WAIT`, `AFTER_SPAWN`, `READY_WAIT`.

`RESTORE_BY_POKE` and `HOLD_WITHOUT_RELEASE` are `false` and nothing uses them.

## Risks and guards

- **Every first spawn of this round may freeze DCS, and the chat says so**; so may the two rounds with the
  direct write. A frozen DCS has to be ended; nothing of ours outlives the process, and no file of DCS's is
  changed. The case file makes the next start go on with the next case.
- Every call into DCS and every read or write of DCS memory is inside a structured exception handler. That
  catches a crash inside our call; it does not catch a hang inside DCS's own code later, which is what run 7 was.
- **The one memory write of ours** (rounds 3 and 4 of a start that landed): the number word of the spawn-only
  terminals before the target. The module writes only after finding both words (+0x88, +0x8c) of every terminal
  where the ATC's own records say they are, reads each word back, and writes the old number back at `restore`.
  If the layout check fails nothing is written and the round is not asked of the user.
- Case 3 calls DCS's chooser once. On a spawn-only terminal its change could not be given back (run 5); on an
  untouched deck it gives spot 5, which can. If the give-back does not read clean, the round is not asked of the
  user and spot 5 stays held until the mission ends.
- `restore` runs about 5 s after the jet appears, on simulation stop, and on an error of the hook's own.
- The mission "slot per spot" is watched only in this round: nothing is set there.
