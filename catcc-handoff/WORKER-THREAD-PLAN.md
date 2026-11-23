# Deck spotting demo on its own thread: implementation plan

Written 2026-11-19. Decisions that led here are in `DECISIONS.md` (search "worker thread" and "planning spread over
frames").

## 0. Status: built 2026-11-19, not yet run in DCS

Built the same day the user asked for it ("Complete the multi-threaded implementation"). The result of each part is
in `DECISIONS.md` ("THE DECK SPOTTING DEMO ON ITS OWN THREAD"). What was built, and where it departs from the plan
below:

| Plan | Built |
|---|---|
| Step 0, the gate | The user's run of 18:01: the hook's slowest 1 % of frames 38.1 ms, 0.1 % 77.0 ms. Over the gate's 20 ms, so the thread buys the long frames as well as the planning time. |
| Step 1, the bridge `B` at every call site | No call site changed. The demo and the tow library reach DCS through five tables (`native`, `DCS`, `Export`, `net`, `lfs`). On the worker those tables are stand-ins (`crewtest_worker.lua`); on the main thread they are the real ones. The call record was made first (one full run, every call counted) and decided each call's kind. |
| 4.1, three kinds of call | As planned, with one addition: the FIRST command for an object is waited for, so what DCS answered (its class, whether it took the place) is known to the caller; later ones are queued and answer the same. A command that fails later is reported back and fails from then on. |
| 4.1, reads | Not a fixed list. A read is asked for once and the main thread then sends its value with every frame in which it changed (20 to 24 values in a run). One not asked for in 3 s is dropped. What is asked must not change from frame to frame: each new question is waited for. Where the ship and the jet are is therefore one value the main thread works out (`h.deckctx`), not a question with the camera's place in it. The worker says in the log when a function's questions keep changing, and stops keeping its answers for a minute. |
| 4.1, commands kept against DCS | A bubble's or an elevator's command given again four times a second to keep it is queued, not waited for. |
| The first run in DCS (2026-11-20) | The hook took 47 ms a frame: the two rows above were the causes (a question that changed every frame; kept commands waited for). The rig now does what DCS does there (`LIVE=true`: the camera's place changes every frame, DCS's command is put back every frame). `DECISIONS.md` has the figures. |
| Step 2, a single-thread shuttle in `luarun.py` | Not built. The rig drives the real thread in the real DLL, each frame waiting for the worker's step (`CATCC_DEMO_LOCKSTEP`), which is as repeatable and tests the DLL too. Steps 2 and 4 are one. |
| Step 3, disorder | `CATCC_DEMO_DISORDER=<seed>`: one frame in five not sent, every list of commands held 0 to 3 frames. |
| 4.5, velocity sent with each pose | The main thread works it out from the worker's last two lists. An object is shown where it would be one frame behind the mission's clock (`Tow.Thr.carry`); with lists on time nothing is extrapolated. |
| 4.4, a 25 ms planning share | 2 ms of each step, and planning goes on between the frames 8 ms at a time (the demo's tick run again for the same moment), so positions are never kept waiting for planning. |
| Step 5, in DCS | Wired and installed with DCS closed. `demoThread = false` in `Config\CATCC-test.lua` runs the demo on the main thread as before (`crew-test\install.ps1 -DemoThread off` writes it, `-DemoThread on` takes it out). The worker starts with the first demo of a mission and is stopped when the mission ends. |
| Step 6, binary buffer applied by the DLL | Built 2026-11-20 (module crewtest-20), after the user's run of 07:54 showed the main thread's side at 0.68 ms a frame, 0.41 of it Lua reading the worker's text and making the calls. The worker's places and model arguments (staticpos, place, objarg and shiparg written: some 56 a frame in the rig) go as a block of bytes (`CATCC_W.bcmd` / `bflush`); the main thread hands the block to the module (`worker_blob`), which makes the calls itself and follows what moves (`worker_carry`). Text lists remain for everything else, in order with the blocks. `CATCC_DEMO_NO_BLOB` (rig) is the text-only way; an older module without `worker_blob` falls back to it by itself. Not yet run in DCS. |
| Step 6, spotting time | Free-running at real time in the rig: 16.7 and 17.9 minutes (two variants), against 16.9 to 17.7 on the main thread. No gain in spotting time is shown: tows waiting for each other and the hangar's order decide it, as section 1 says. |

Files: as in section 7, except `luarun.py` (two globals and the real `package.loadlib` kept, no second state) and
`INSTALL.md` (the crew test is described in the header of `crew-test/install.ps1`, which now lists the worker file).

## 1. What this does and does not buy

(Sections 1 to 7 are the plan as it was written before the work, kept as written.)

Measured in DCS (the user's runs of 2026-11-19, six deck tractors, before planning was spread over frames):

| | 1x run | 2x run |
|---|---|---|
| Frame time, average | 50.6 ms | 54.6 ms |
| The hook's share, average | 1.71 ms | 2.41 ms |
| Single frames the demo held | up to 0.3 to 1.5 s | 1484, 765, 552 ms the worst three |

Since then planning is spread over frames with coroutines (12 ms of each frame). In the rig the slowest step fell from
1.0 to 2.4 s to 56 to 125 ms. That build has not yet been run with the demo in DCS.

What a worker thread changes:

- **Long frames:** the demo's Lua no longer runs inside DCS's frame at all. What is left on the main thread is
  applying the positions the worker computed (section 4.5).
- **Planning throughput:** at 18 frames a second the 12 ms budget gives planning about 216 ms of processor time
  per second. On its own thread it can have most of a core. Plans are ready sooner, so tows begin sooner.
- **Average frame rate: almost nothing.** The hook's share is 3 to 5 % of the frame. The other 95 % is DCS drawing
  and simulating the deck (39 static aircraft, the crews). A thread cannot give back more than the hook's share.
- **Spotting time where tows wait for each other:** nothing. That is sequencing, not processor time.

**Gate before starting (step 0):** read the next DCS run's `catcc-crewtest.log` with planning spread over frames
(the log says "planning is spread over frames: 12 ms of each frame, by the clock"). If the hook's slowest 0.1 % of
frames is already under about 20 ms and no single frame over 50 ms is the demo's, the thread buys only the
planning throughput. Put those numbers in front of the user before building.

## 2. The design in one paragraph

The demo and the tow library it drives run **whole** in a second Lua state on a worker thread inside
`catcc_crew.dll`, exactly as they already run whole in the test rig outside DCS. The hook on DCS's main thread
stops ticking the demo. Each frame it sends the worker a small snapshot of what the demo reads from DCS, and
applies the list of DCS calls the worker asked for. No DCS function is ever called from the worker thread.

### Why whole, and not only the planners

The other design considered was a planner service: the demo stays on the main thread and only the seven pieces
that are already spread over frames (`M.sliced`: `hangarSearch`, `hangarHome`, the deck plan, the plan from
behind, `soloPlan`, `startMove`, `M.noseWay`) are sent to the worker. Its cost: those pieces read the live world
(`M.aircraft`, `M.tugs`, `M.jobs` with their circles, `M.el`) through upvalues and write into it, so the world
would have to exist twice and be kept the same in both states, and each piece would have to be split into a pure
calculation and a commit. A field missed in the copy gives a different plan with no error. It would also leave
the give-way pass (8 % of the demo's processor time) and the driving on the main thread.

Running the demo whole keeps all of its state in one Lua state. The boundary is then the DCS API, which is narrow
and already listed, because the rig replaces every one of those calls with a stand-in.

Keep the planner service in mind only as the fallback if step 1 shows the boundary is wider than counted below.

## 3. Facts the design rests on (checked 2026-11-19)

- DCS's `bin-mt/lua.dll` is plain Lua 5.1 (no `luaJIT_setmode`) and exports everything a second state needs:
  `luaL_newstate`, `luaL_openlibs`, `luaL_loadbuffer`, `luaL_loadfile`, `lua_pcall`, `lua_close`, `lua_next`,
  `lua_type`, `lua_objlen`, `lua_rawgeti`, `lua_pushlstring`, `lua_tolstring`, `lua_pushcclosure`, `lua_gc`,
  `lua_sethook`, `luaL_ref` and the `luaopen_*` set (49 names asked for, 49 found). `catcc_crew.cpp` already
  resolves its Lua functions from that DLL by name at load (`loadLua()`), so it links against nothing.
- Two `lua_State`s made with `luaL_newstate` share nothing. One thread per state is safe.
- The rig (`catcc-dcs/deck-test/crew-test/luarun.py` with `catcc-dcs/test/demo-run.lua` and the harness in
  `catcc-dcs/test/crewtest.test.ts`) runs `crewtest_hook.lua` and `crewtest_demo.lua` unchanged under that same
  `lua.dll`, with stand-ins for DCS. It is deterministic when planning is not spread by the clock.
- The demo is a chunk that takes one `api` table and returns `M` (`crewtest_hook.lua`, the loader after
  `commands.demo2`). What it uses from `api`: `Tow`, `TOW`, `native`, `log`, `say`, `dostring`, `split`,
  `getCtx`, `doScan`, `shipHandle`, `routes`, `run`, `walkQueue`, `holding`, `unpack`, `atan2`, `hangar`.
- Native functions the demo calls itself: `objarg`, `staticpos`, `place`, `staticinfo`, `play`. The tow library
  in the hook adds `shiparg`, `elevator`, `shipcmds`, `bubble`, `deck`, `forcepos`, `anim`, `state`, `prop`,
  `walk`, `stop` and the catapult crew calls.
- DCS functions the hook calls: `DCS.getModelTime`, `DCS.getRealTime`, `Export.LoGetPlayerPlaneId`,
  `Export.LoGetCameraPosition`, `Export.LoSimulationOnActivePause`, `Export.LoSetCommand`, `net.dostring_in`,
  `lfs.writedir`, `DCS.getObjectLiveriesNames`.
- The native module is built with MSVC (`native/build.cmd`: `cl /O2 /MT /EHa`), after a self-test executable
  (`catcc_crew_selftest.cpp`) has passed. `native/smoke.py` loads the built DLL.
- The hook has the 200 local names limit at chunk level. New code goes in do-blocks or on tables.

## 4. Architecture

### 4.1 The bridge

One table, `B`, is the only way the demo and the tow library reach DCS. Three kinds of entry:

| Kind | Meaning | On the main thread today | In the worker |
|---|---|---|---|
| `B.read.*` | Something read from DCS every frame | the call itself | the value from the last frame snapshot |
| `B.cmd.*` | A DCS call whose result is not used | the call itself | appended to this tick's command list |
| `B.call.*` | A rare call whose result is needed | the call itself | sent, and the worker waits for the reply |

Expected classification (step 1 confirms each one against the code):

- **read:** model time, real time, active pause, time acceleration, the player's aircraft (id, position in the
  ship's frame, heading), the four elevator arguments and the bubble arguments (`shiparg`), the camera's
  position (only at start).
- **cmd:** `place`, `staticpos` when it sets, `objarg`, `forcepos`, `play`, `anim`, `walk`, `stop`, `elevator`,
  `shipcmds`, `bubble`, `deck`, `log`, `say`, the panel's status text, releasing a person from the hook's
  `walkQueue` / `holding` tables (today the demo writes into those tables directly: that becomes a command).
- **call:** making and removing statics (`dostring` into the mission), `doScan`, `getCtx`, `shipHandle`,
  `staticinfo`, `staticpos` when it reads, `routes`, `hangar` (both are files: the worker reads them itself).

`B.call` is used at start and stop only. During those the main thread serves calls in a loop inside one frame
until the worker says the burst is over, which is what happens today (the demo makes its statics in one long
frame that the performance line already leaves out as test-only).

### 4.2 The worker state

`catcc_crew.dll` gets a worker: one thread, one `lua_State`, two queues (main to worker, worker to main), each a
mutex, a condition variable and a `std::deque<std::string>`.

The worker state loads `Scripts/CATCC/crewtest_worker.lua` (new), which:

1. defines `CATCC_WORKER = true` and the stand-ins the hook's top level needs (`DCS`, `net`, `lfs`, `Export`):
   the production form of the rig's harness, each stand-in routed to `B`;
2. loads `crewtest_hook.lua`. In worker mode the hook skips `DCS.setUserCallbacks`, the menu, the panel and
   `package.loadlib`, takes `native` from `B`, and still defines `Tow` and loads the demo, so `CATCC_DEMO` exists;
3. runs the loop: wait for a message; on a frame snapshot, set the inputs, call the demo's tick with the model
   time's step, send back the command list.

### 4.3 Messages

Strings. A message is a Lua table literal (`return { ... }`), written by a small serializer (numbers with
`%.17g`, strings with `%q`) and read with `loadstring`. One format in the rig and in DCS, readable in a log.

- Main to worker: `frame` (model time, real time, pause, acceleration, player's aircraft, elevator and bubble
  arguments, replies to calls, panel clicks), `start`, `stop`, `report`, `quit`.
- Worker to main: `cmds` (the tick's commands, in order, with the model time they were computed for), `call`
  (one synchronous call), `burst-end`, `error` (the Lua error text), `stopped`.

Size: about 60 objects move at the peak, a pose and two or three model arguments each: 5 to 10 KB a frame.

### 4.4 Time

The worker ticks when a frame snapshot arrives. If it is still busy when the next one arrives, the snapshots
merge: the newest inputs, the summed step. `Tow.now()` in the worker is the snapshot's model time. Active pause
and time acceleration arrive as inputs, as the demo sees them today.

Planning stays spread over ticks with the coroutines that exist (`M.sliced`), with the worker's own clock
(`QueryPerformanceCounter` exposed to the worker state as `B.clock`) and a larger share: 25 ms a tick to begin
with. That bound is what keeps positions coming at a steady rate.

### 4.5 Applying commands on the main thread

Each frame: `native.worker_poll()` returns the pending messages; the hook applies each command through the same
functions it calls today.

Positions arrive one frame late and, at high frame rates, less often than frames. Each pose command therefore
carries the object's velocity and turn rate. Between updates the main thread moves the object on by
velocity times the model time since the command. Stopped objects have zero velocity and stand exactly.

Later (step 6): pose and model-argument commands go into a binary buffer that the DLL applies itself on the main
thread (`native.worker_apply()`), so no Lua runs on the main thread for them.

### 4.6 Lifecycle and failure

- The worker starts when the demo is started and is told `quit` at mission stop. The main thread waits up to
  200 ms for `stopped`, then leaves the thread parked on its queue. Never join a thread in `DllMain`.
- Every tick runs under `lua_pcall`. An error goes to the main thread as `error`: the hook logs it, says it, and
  stops the demo, as `commands.demo2` does today.
- If the worker cannot start (thread or state not made, `crewtest_worker.lua` missing), the demo runs on the main
  thread as it does now. `CATCC_DEMO_THREAD = false` forces that. Both paths stay in the tests.
- The worker never calls a DCS export, never touches an object pointer, and never writes a file other than
  through a `log` command.

## 5. Steps

Each step ends with the rig's sixteen runs (eight variants, plain and with `CATCC_DEMO_SLICE_CALLS=3`) all
finishing and `npx vitest run catcc-dcs/test src/components/catcc/prifly` passing.

**Step 0. Gate.** Section 1. No code.

**Step 1. The boundary, in one state.** Introduce `B` in `crewtest_hook.lua` (a do-block) with the direct
implementation: every entry calls what is called today. Route the demo's and the tow library's DCS and native
calls through it. Find them by making the rig's stand-ins record every call with its caller, then run the eight
variants: the record is the complete list, with counts per frame. Fix the classification table in 4.1 from it.
Any call found whose result is used every frame and is not a `read` is redesigned here.
*Done when:* the rig's logs are the same, line for line, as before the step.

**Step 2. The worker file and split mode in the rig, one thread.** Write `crewtest_worker.lua` and the worker
implementation of `B`. Extend `luarun.py` to make two Lua states and pass the message strings between them:
one frame of the main state, then one tick of the worker. Add the main-side proxy in the hook (send snapshot,
apply commands, serve calls).
*Done when:* split mode gives the same demo log as step 1, the positions one frame later.

**Step 3. Disorder in the rig.** A seeded option that makes the worker skip ticks (snapshots merge) and deliver
its commands up to N frames late. Add the velocity carry-on of 4.5 and check the largest jump of any object
between two frames against its speed.
*Done when:* all variants finish under disorder; no object jumps more than its speed allows; least distances
are no smaller than in step 2.

**Step 4. The thread in the DLL.** `worker_start(path)`, `worker_post(string)`, `worker_poll()`,
`worker_stop()`, `worker_state()` on the main side; in the worker state `B.recv`, `B.send`, `B.clock`. Add to
the self-test: start and stop 100 times, 10,000 messages each way in order, a Lua error in the worker reported
and the thread still answering, stop while the worker is busy. Extend `smoke.py` to run the rig's split mode
through the real DLL thread instead of the single-thread shuttle.
*Done when:* the self-test passes and the rig's split mode through the DLL finishes all variants.

**Step 5. In DCS.** Wire the proxy to the DLL, the start and stop bursts, mission stop, the fallback. Install
with DCS closed. The performance line gains the main thread's share of applying commands and the worker's tick
times (average, slowest 1 %, slowest 0.1 %).
*What the user will see:* the demo starts and runs as before; with the frame-rate counter up, no long frames
while tractors plan; the log's performance line shows the hook's share under about 0.5 ms.
*Manual checks for the report:* a full run at 1x; a run at 2x and at 4x; active pause on and off; stopping the
demo mid-run; ending the mission mid-run; starting the demo twice in one DCS session.

**Step 6. Use the room.** Raise the worker's planning share and measure spotting time. Move pose and argument
commands to the binary buffer applied by the DLL. Spread nothing further by hand: what is left of long ticks is
in the worker and costs no frames.

## 6. Risks

| Risk | How it is met |
|---|---|
| A DCS call left on the worker thread | Step 1's recorded list is the whole boundary. In worker mode the stand-ins for anything not on the list raise an error naming the call. |
| The hook's file does more at load than define `Tow` | Worker mode is a flag checked at the hook's registration points. The rig already loads the whole hook under stand-ins, so the list of what must be stood in for exists. |
| Tables shared by reference between the demo and the hook (`walkQueue`, `holding`) | Replaced by commands in step 1, while everything is still one state and the logs can be compared. |
| An aircraft on a moving elevator lags the platform by a frame | The platform's argument is a `read`. The worker places the aircraft for the snapshot's time, and the carry-on of 4.5 covers the frame between. Measure the height error in step 3. |
| Results that differ from run to run make failures hard to repeat | The rig's split mode is deterministic (step 2), and the disorder of step 3 is seeded. |
| The thread outlives the mission or blocks DCS at exit | 4.6: bounded wait, no join in `DllMain`, the thread only ever waits on its own queue. |
| Memory | The second state holds the hangar plan and routes a second time: a few MB. |
| The planner service turns out to be needed after all | Section 2 keeps its shape. Step 1's bridge is useful to both designs. |

## 7. Files

| File | Change |
|---|---|
| `catcc-dcs/Scripts/CATCC/crewtest_hook.lua` | `B`, worker mode flag, the main-side proxy |
| `catcc-dcs/Scripts/CATCC/crewtest_demo.lua` | DCS and native calls through `B`; `walkQueue` / `holding` writes become commands |
| `catcc-dcs/Scripts/CATCC/crewtest_worker.lua` | new: stand-ins, the worker's `B`, the loop |
| `catcc-dcs/deck-test/crew-test/native/catcc_crew.cpp` | the worker thread, queues, the functions of step 4 |
| `catcc-dcs/deck-test/crew-test/native/catcc_crew_selftest.cpp` | the thread and queue tests |
| `catcc-dcs/deck-test/crew-test/luarun.py`, `native/smoke.py` | two states; split mode; through the DLL |
| `catcc-dcs/test/demo-run.lua`, `catcc-dcs/test/crewtest.test.ts` | split mode and disorder variants; the call record of step 1 |
| `catcc-dcs/deck-test/crew-test/install.ps1` | copies `crewtest_worker.lua` |
| `catcc-dcs/INSTALL.md`, `catcc-handoff/DECISIONS.md` | the new file and switch; each step's result |
