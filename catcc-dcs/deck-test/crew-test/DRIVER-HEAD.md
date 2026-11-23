# The tractor drivers' head

The user (2026-11-22): "can you investigate whether it's possible to get the tug drivers to turn their heads while they
are driving? If so, while reversing they should turn their heads 90-110 degrees (whatever is realistic for a human) to
the right. At other times it would be nice if their heads moved to look where they are about to turn or check the area
around them."

## The answer

**Yes, by DCS's own means, and it is built. Whether it looks right needs one DCS run** (it is OFF until installed with
`install.ps1 -DriverHead on`).

A driver is a Supercarrier deck crew figure (`woCarrierTechnician`, skeleton `typeV`) sitting in the F/A-18C pilot
figure's seated pose `f18_0_init`. The pilot figure has a clip of its own for looking round, `F18_39_Look_LR.fbx`, and
the deck crew can play it (it is in their animation list: `Logs/catcc-crewtest.log`, "33 f18_39_look_lr"). From that
clip five still poses are made (head 100 and 50 degrees left, ahead, 50 and 100 right) and a **blend space** over them
with one axis, the parameter `catcc_head_yaw` (degrees, + to the driver's right). A driver sits in that blend space
instead of `f18_0_init`; writing the parameter turns his head to any angle between the poses. Both halves of that are
things DCS already does for its own directors (their `bs_sign_*` blend spaces follow the parameter `torso_angle`), and
both have been seen working from our module (DECISIONS.md, crew test runs 7 and 9: a clip of our own mounted by our
mod plays; a playing blend space follows a parameter we write).

What is not known until DCS has run it: that DCS picks up a `blend_space/*.lua` from OUR mod's animations folder the
way it picks up our clip, and how the turn looks.

## How far, and what part is the neck

**Backing: 100 degrees to the right.** Of that, in the pose:

| part | degrees |
|---|---|
| torso (pelvis and the three spine bones, measured at the top spine bone) | 18.5 |
| neck and head | 81.5 |
| head, total | 100.0 |

(`python -I model/driver_head.py --report` prints these from the clip by working out the bones' turns.)

A neck turns about 80 degrees to a side at the most, so 81.5 is all of it; a seated driver gets the rest from his torso
(18.5 here: as far as the source clip turns the torso at all) and the last of "looking straight back" from his eyes.
More than 100 would have to come from the torso: the source clip, at its end, has head 112 = torso 18.5 + neck 93.5,
which is more neck than a person has, so its last 12 degrees are not used. A driver who turns his shoulders a quarter
round and puts an arm on the seat back (the usual way to back a tractor) would need a pose of our own making: the
figure's arms and spine keyed by hand (see "A pose of our own", below).

The turn itself: a critically damped one (it begins and ends gently), 100 degrees in about 0.9 s, at its quickest some
220 degrees a second. A new direction given in mid-turn bends it without a jerk.

## Where a driver looks (crewtest_head.lua)

| his tractor | he looks |
|---|---|
| backs (more than 0.12 m/s backwards) | over his right shoulder, 100 degrees; now and then eases off up to 8 degrees and looks round again; stays turned through a stop shorter than 0.6 s |
| drives | towards the point of his way 9 m ahead (0.9 of its bearing, 70 degrees at the most; nothing within 8 degrees of straight): into a turn before the tractor has begun it. On a straight: ahead, and every 6 to 12 s a look to one side (35 to 75 degrees, about a second) |
| stands | ahead, and every 4 to 9 s a look round: to one side for 1 to 2.6 s, sometimes then to the other |

What is random is drawn from the driver's name: a run plays the same every time, and two drivers do not look round
together. He begins to turn when the tractor begins to back, not before: see "Follow-ups".

## What it costs a frame

- The hook (Lua): for a tractor that drives, one call of `Tow.Head.drive` a frame (a few dozen arithmetic operations,
  no tables made); for one that stands, a step four times a second. The native module is told a head's direction only
  when it changes by 4 degrees or more: a tow of a minute and a half makes a few dozen such calls (tested).
- On the demo's own thread these calls are commands (not waited for), as places are.
- The native module: `headtick()` once a frame: for each head still turning, one parameter write and one
  `update_properties`; for a head that has arrived, one comparison. It is a part of its own in the hook's frame
  profile ("driver heads"), so the log's 20 s lines show what it takes.

## The routes

### 1. A blend space of our own over still poses of the pilot figure's look clip: BUILT

Known, from files and from animator.dll (its code is not packed; read on disk with `dumpbin /disasm`, nothing run):

- `CoreMods/aircraft/FA-18C/animations/animations/typeV/F18_39_Look_LR.fbx`: binary FBX 7.4, 74 bones, 201 frames at
  30 a second: the seated figure turning from full left (frame 0, head -111.5 degrees) to full right (frame 200,
  +112.0), the middle frame ahead. Its middle frame's head bone is `F18_0_Init`'s exactly (as DCS's own Assimp reads
  both), so a driver does not twitch when the blend space takes over from the seated pose.
- The deck crew plays the pilot figure's clips, and a clip mounted by our own mod (run 7).
- `Animator::AnimationManager::_load_blend_spaces(files, Lua::Config&)`: the files are those under
  `<animations path>/<skeleton>/blend_space/` (strings `/animations/`, `/blend_space/`; error text "can not load
  blendspace"); each is run (`Lua::Config::load_buffer`), what it RETURNS is the table, and the blend space is named
  after the file (lower case, no extension).
- `Animator::Animation::load(Lua::Config&)` reads that table: `type` ("gesture" and "additive" are kinds of their own,
  anything else an ordinary one); `y_axis` and `x_axis`, each `{ name, default_value }`, either may be absent; then
  the array part, each entry `{ x, y, animation }` (y 0 when absent). The axis bounds are the least and the most of
  the entries. The same keys as the example left as a comment in the F/A-18C pilot's graph file
  (`.../typeV/graph/fa18c_anim_graph.lua`: `x_axis = {name = 'pitch', default_value = 0}`, `{x = 0, y = 10,
  animation = ...}`).
- DCS's own one-axis blend spaces look the same from outside: `bs_sign_taxi_fwd`: x "torso_angle" -45..45, y "" 0..0
  (the log's animation data).
- A blend space is played through the character's `CharacterModelCookie::set_animation(index, time, loop, now)` and
  follows `PropertyHolderImpl::set_property(name, value)` + `CharacterModelCookie::update_properties(time)` (run 9).
- Our five poses, read by DCS's own Assimp (`bin/assimp-vc140-mt.dll` 4.1, the library animator.dll reads clips
  with): one animation each, 11 frames at 30 a second, 74 bones, the same shape as `F18_0_Init.fbx`.

Guessed:

- That `blend_space/*.lua` under OUR mod's mounted animations path is listed with the others. (The clips are; the
  F/A-18C module's `graph/` folder reaches the deck crew's skeleton from another module's mount in the same way.)
- That five poses blend evenly enough between them (they are 50 degrees apart; DCS's own are 45 apart or less).

A DCS run must show: the blend space in the log's list (`blend space catcc_bs_drv_look ... x "catcc_head_yaw"
-100..100`), and the heads turning (see "The DCS run").

Cost: built. Each install makes the files (0.5 s; needs python). Five clips and one blend space more in the deck
crew's 347 animations.

### 2. The stock clip played as it is: `f18_39_look_lr` (no files of ours): DEAD for a held look

Known: the clip is in the drivers' list and `play(h, 'f18_39_look_lr', mode)` plays it. But it is a sweep in TIME (6.67 s
from full left to full right); a head held at an angle is one frame of it held. `CharacterModelCookie::set_animation`
takes a start time, so it could be begun in mid-sweep, but it then runs on at 32 degrees a second to the right end.
Holding a frame needs a loop range of a few hundredths of a second in the record (the cookie's `ShaderAnimation`: its
loop values), which only `Animator::Animation::apply` with a transition record of our own would set: a structure
whose layout is known only in part (DECISIONS.md, 2026-11-14). The blend space gives the same poses with nothing
guessed about records. The one thing this route could do with no files of ours is "backing: look right", by playing
the clip from its middle and letting it stop at its right end (112 degrees, 3.3 s to get there): too slow, too far,
and nothing else.

### 3. An override animation with a bone mask (a head-only layer over the seated pose): possible, not needed here

Known: DCS has it and uses it: `night_stick_armpose` is an override on a director's arm while his body plays the
signals (`AnimatedCharacterBase::set_override_animation(string)`, called from our module already as
`override(h, name)`); `AnimationManager::_load_overrides` and `_load_masks` read `<skeleton>/overrides/*.lua`
(`type`, `mask_name`, `animations`, `animation`) and `<skeleton>/masks/*.lua`; `get_node_override_mask(node, mask)`
gives a weight per bone. Guessed: the exact tables (the deck crew's own are in the encrypted `animations.edce`; only
the key names are readable in animator.dll). An override is ONE pose at a time, not an angle: a driver would need an
override per direction and would snap or cross-fade between them. Worth it only for a figure that must do something
else with its body at the same time (a director who walks and looks); a driver only sits. Cost: reading two more
loaders in animator.dll (a day), then a DCS run.

### 4. Bone overrides through exported functions: possible on paper, the costliest to prove

Known (export tables): `Animator::CharacterModelCookie::set_node_matrix(string | int, osg::Matrixf)`,
`get_node_id(string)`, `set_direct_pose_control(bool)` / `get_direct_pose_control()`, `set_pose(vector<Matrixf>,
bool)`; `Animator::FabrikSolver` (IK: `set_bone_local_transform`, `set_effector_transform`, `solve`),
`AnimationManager::get_solver(name)`, `apply_ik`, `<skeleton>/ik_config/` (chains, effectors); the engine's own debug
panel has a "Pose Controller" (RotateBone: yaw, pitch, roll; use_direct_pose_control; use_ik). So a head bone can be
given a matrix directly. Guessed: everything about how (which space the matrix is in, whether direct pose control
freezes the rest of the figure, whether the pose computed on the graphics card (`ANIM_COMPUTE_TYPE`,
`animator/animation_compute.fx`) honours it, what a wrong call does). It would give a true look-at (the head on a
point in the world) and needs no files, but it writes into the figure's bones every frame through functions nobody
outside ED has documented: several DCS runs, each able to crash. Not taken while route 1 does the job.

### 5. A draw argument on the figure: DEAD

`CharacterModelCookie::set_arg(int, float)` / `get_arg` exist, and a character's ATTACHMENTS take arguments
(`AnimatedCharacterBase::set_attachment_arg`: the wands, the lights). The figure itself is a skinned mesh driven by
clips; nothing in the readable model descriptors (`.chanimgpu`: mesh, skeleton, default animation, LODs, connectors)
ties an argument to a bone, and the deck crew's own descriptors are encrypted. No evidence that any argument turns a
head.

### 6. A look-at or aim facility of the animator's: NONE FOUND

No export of animator.dll or animator_logic.dll is a look-at (searched: look, aim, head, target). The one "look" is
`AnimatorLogic::IEnvObject::get_look_direction`, a getter the collision avoidance uses for the way a walker faces.

### A pose of our own (a better backing pose)

The poses are made by `model/driver_head.py`, which reads and writes binary FBX itself (the source clip written back
unchanged is byte for byte the file read) and can put any bone at any angle. A backing pose with the shoulders a
quarter round and the right arm on the seat back is a matter of keying spine, clavicle and arm bones for one more
still pose and giving the blend space a sixth entry (or a second axis). Not done: it wants looking at in DCS first.
(2026-11-23: the legs and arms ARE keyed by hand now, onto the tractor's pedals and steering wheel, in all five head
poses: `driver_head.py --pose`, `install.ps1 -DriverPose on`: DRIVER-POSE.md. The backing pose with an arm on the
seat back is still not made.)

## What is built, and where

| file | what |
|---|---|
| `crew-test/model/driver_head.py` | the poses and the blend space file, from this PC's DCS (`--report`, `--dump`, `--assimp`) |
| `Scripts/CATCC/crewtest_head.lua` | where a driver looks; told to the native module on change; the probe |
| `crew-test/native/catcc_crew.cpp` (crewtest-21) | `head(h, degrees [, briskness])`, `head(h)`, `headtick()`: the turn itself |
| `Scripts/CATCC/crewtest_hook.lua` | loads it as `Tow.Head`; seats a driver in the blend space; `Tow.apply` gives his tractor's place and the point of its way 9 m on; `headtick` once a frame; the command `tow|head|...` |
| `Scripts/CATCC/crewtest_demo.lua` | seats the demo's drivers in the blend space; the standing tractors' drivers four times a second |
| `Scripts/CATCC/crewtest_worker.lua` | `head` is a command on the demo's thread (not waited for) |
| `Scripts/CATCC/crewtest.lua` | F10 > Tow > Driver seat > Head: right 100 / left 100 / ahead / report |
| `crew-test/install.ps1` | `-DriverHead on / off`; installs crewtest_head.lua |
| `test/driver-head.test.ts` | the look logic, the calls made of the module, the poses and the blend space file |

New files (`driver_head.py`, `crewtest_head.lua`, `driver-head.test.ts`, this file) came with the branch
`task/driver-head`. The changes to files that were being worked on elsewhere at the time came as three patches, made
against the working copy of 2026-11-22 and to be deleted once applied (`git apply --ignore-whitespace <file>`):
`crew-test/driver-head-patches/native.diff` (the module, its self-test, the smoke test), `scripts.diff` (hook, demo,
worker, menu, install.ps1), `tests.diff` (the rig: `crewtest.test.ts`, `demo-run.lua`, `luarun.py`).

Nothing made from DCS's clip is kept in the repository: the five `.fbx` and the blend space file are made on the
user's PC into `Saved Games\DCS\Mods\tech\CATCC-Crew\animations\typeV\` at install.

**The switch.** Off until `install.ps1 -DriverHead on` (it writes `driverHead = true` into `Config\CATCC-test.lua`, so
later installs make the files again; `-DriverHead off` takes them out). Without the files nothing changes: a driver
whose blend space is not in his list sits in `f18_0_init` as before (`Tow.Head.seat` gives nil and why, logged). In
the hook's state `CATCC_HEAD_OFF = true` turns it off whatever is installed.

## The DCS run (one run settles it)

1. DCS closed: `native\build.cmd`, then `install.ps1 -DriverHead on`. It says `The drivers' head: driver head: made
   catcc_drv_look_l100.fbx ...`.
2. A mission on the carrier with our crew data (as for the deck spotting demo). F10 > CATCC crew test > Tow > Driver
   seat > **Head: right 100 (as when backing)**.
   - On screen: `driver head: N of N driver(s) now turn their heads to their RIGHT, 100 degrees ...`.
   - To see: every driver (blue shirt; one not on a tractor sits on the deck where he stood) turns his head and
     shoulders to HIS right in about a second, smoothly, and holds it. **Head: left 100** and **Head: ahead** likewise.
   - If instead: `driver head: NOT TURNED: the blend space "catcc_bs_drv_look" could not be played ...`: DCS did not
     take the blend space from our mod's folder (the guess above was wrong). The log then has no line
     `blend space catcc_bs_drv_look`; dcs.log's ANIMATOR lines say why ("can not load blendspace"). Route 3 or a
     graph file is next.
3. Ctrl+Shift+F9 (the deck spotting demo). To see: a tractor that backs (onto a tow bar's ring, out of a parking
   place) has its driver looking over his right shoulder for as long as it backs; one that drives looks into a turn
   as it comes up; one that stands looks round now and then.

What to judge: is right RIGHT (the sign of the axis); does 100 degrees look like a person; is the turn smooth and its
pace natural (`H.CFG.omega`); does the body pop when a driver is first seated; do the looks round come too often.

## Follow-ups

- **Looking back BEFORE backing.** A driver looks over his shoulder, then backs. Here the head turns when the tractor
  moves (0.1 to 0.3 s in). For the look to come first the tow has to wait about a second before it backs: a change to
  the tow's timing (every tow backs out and onto rings), so not made without being asked for.
- **Eyes on the aircraft.** While hooking up a real driver watches the bar and the nose wheel; here he looks ahead or
  over his shoulder. The tow knows where the bar is: `H.step` takes any point to look at.
- **A better backing pose** (above), and a second axis for looking down at the bar.
- **Other machines.** Each PC plays its own figures; a driver's head is turned on the PC that runs the demo only, as
  his place on the seat is.
