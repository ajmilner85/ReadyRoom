# The tractor drivers' legs and arms

The user (2026-11-23), with a picture of a driver seen from his tractor's left, the wanted limbs drawn over it: "Is it
possible retarget the deck tractor drivers leg and arm bone positions so they line up with the pedals/steering wheel
better? Can you infer the correct positions from the image (green is left leg, red is right, pink is left arm, orange
is right)?"

## The answer

**Yes, and it is built. How it looks needs one DCS run** (it is OFF until installed with `install.ps1 -DriverPose on`).

A driver sits in the F/A-18C pilot figure's seated pose: legs out on rudder pedals, hands at throttle and stick. A pose
is a table of angles, one set for each of the figure's 74 bones. `model/driver_pose.py` keys the leg and arm bones of
that pose again, so that the left foot is flat on the cab's floor beside the pedals, the right foot on the accelerator
and both hands on the steering wheel's rim, and writes the result as still clips that DCS's animation system plays as
it plays any other clip. This is the way the head poses are made (`DRIVER-HEAD.md`), and the user has seen those play
correctly from our mod (2026-11-23: "The driver head animations looked good in all phases"). No bone is moved while
DCS runs.

Where the limbs go was not read off the picture alone. The picture gives how each limb bends (which way the knees and
elbows point, which hand is higher, which foot is on a pedal). Where the wheel, the pedals, the floor and the seat ARE
was measured from the tractor's own model, `as32-31a.edm`, which gives them to the millimetre; the picture, taken from
above and close by, cannot.

## What the skeleton offers

The figure (`typeV`, as the clips name its bones; every name begins `typeV_`):

| part | bones, from the body outwards |
|---|---|
| torso | `Pelvis` > `Spine` > `Spine1` > `Spine2` > `Neck` > `Head` > `HeadNub` |
| a leg (L_, R_) | on `Pelvis`: `Thigh` (0.430 m) > `Calf` (0.390 m) > `Foot` > `Toe0` > `Toe0Nub` |
| an arm (L_, R_) | on `Spine2`: `Clavicle` > `UpperArm` (0.283 m) > `Forearm` (0.255 m) > `Hand` |
| a hand | on `Hand`: `Finger0` (the thumb) .. `Finger4`, each > `Finger01` > `Finger02` > `Finger0Nub` (and so on): 20 bones a hand |
| twist bones | on `UpperArm`: `LUpArmTwist` > `LUpArmTwist1`; on `Forearm`: `L_ForeTwist` > `L_ForeTwist1` (and R): they roll the sleeve with the arm |

A bone's own X runs along it to the next joint. A knee and an elbow are hinges about the bone's own Z (the clips
bend them with a negative angle and nothing else). The pelvis bone is at the figure's own origin, so it is the point
the hook puts on the seat (`TOW.seat`). The figure's metres are real ones.

**Fingers are there** (15 bones a hand and the thumb's), and the pilot's are already curled: the left hand round the
throttle, the right round the stick. They are left as they are: both are grips round a bar about as thick as the
wheel's rim (0.036 m).

**What cannot be done this way:**

- Nothing follows anything while DCS runs: no hand follows the wheel as it turns, no foot a pedal (see "Steering").
  DCS has an IK solver of its own (`Animator::FabrikSolver`, `ik_config/`), exported but undocumented: not used.
- The arms are 0.54 m long, shoulder to wrist. The user's drawn arms are about 1.6 times that. From the pilot's seated
  torso the rim is 0.71 m from the shoulders: out of reach by 9 cm (left) and 6 cm (right) with the arms straight. So
  the torso is brought forward (below). An elbow hanging by the hip with a level forearm to the wheel, as the pink
  line has it, is further than the figure's arm reaches.
- The mesh cannot be read (the deck crew's model is encrypted), so what the SKIN does at shoulders, hips and wrists,
  and how thick a thigh or a boot is, is only seen in DCS.

## The cab, measured (`python -I model/driver_pose.py --measure`)

Metres in the tractor's frame: ahead of its own position, left of its centre line, up from the deck.

| thing | measured from `as32-31a.edm` |
|---|---|
| steering wheel | the middle of its rim: 0.171 ahead, 0.581 left, 0.840 up; 0.183 to the rim's outside (0.165 to its middle); its top leans 15.5 degrees forward. The model's rim ends 0.910 up: there is none above 10 and 2 o'clock |
| accelerator | the small pedal right of the column: pad from (0.025 ahead, 0.269 up) to (0.194, 0.340), 0.335 left, 0.087 wide |
| brake | the wide pedal under the column: pad from (0.093, 0.338) to (0.253, 0.356), 0.576 left, 0.168 wide |
| floor | 0.240 up; the firewall 0.276 ahead |
| seat | cushion 0.557 behind to 0.154 behind, its top under the driver 0.651 up; the seat back's face 0.512 behind, its top 0.895 up |

A test compares these 22 numbers with the settings table every run.

## The settings (`POSE` in `model/driver_pose.py`)

| setting | value | from |
|---|---|---|
| `seat` | fwd -0.40, left 0.58, up 0.65 | the hook's `TOW.seat` (where the pelvis bone is put). A test holds the two together |
| `wheel`, `floor`, `accelerator`, `brake`, `cushion`, `seat_back`, `firewall` | as above | measured from the model |
| `left_hand` | 9.0 (o'clock, seen from the seat) | the picture: the pink line ends on the wheel's lower left. 8.5 was tried: the arm then lies on the left knee |
| `right_hand` | 2.5 | the picture: the orange line ends on the upper right (2 o'clock is where the model's rim ends) |
| `left_foot` | the ball of the foot 0.130 ahead, 0.740 left, toes 8 degrees out | the picture (flat on the floor, left of the pedals), placed between the brake's left edge (0.660) and the cab's side (0.82) |
| `right_foot`, `right_ball`, `right_toe_out` | `accelerator`, 0.60 along its pad, toes 10 degrees out | the picture (the red foot on a pedal, toes up its slope). `'brake'` puts it on the wide pedal |
| `knee_out`, `elbow_out` | 0.05, 0.45 | the picture: knees up, elbows down and out |
| `lean` | 18 degrees | worked out: the least forward lean of the torso with which both hands reach the rim in all five head poses with the elbows bent (45 and 53 degrees facing ahead) |
| `shoulder_fwd` | 18 degrees | worked out with it: both collar bones point this far forward of straight sideways (the pilot's: left 5 back, right 7 forward) |
| `sole` | 0.035 | estimated: the toe joint above the boot's sole |
| `grip` | 0.090, 0.032 | estimated: the rim's middle in the closed hand, ahead of the wrist and out of the palm |
| `reach` | 0.985 | a limb is not stretched further than this share of its length |

Where the four ends are put (`--report` prints them):

| end | in the tractor's frame | from the seat (`TOW.seat`) |
|---|---|---|
| left hand: the rim at 9 o'clock | 0.171 ahead, 0.746 left, 0.840 up | +0.571 ahead, +0.166 left, +0.190 up |
| right hand: the rim at 2.5 | 0.182 ahead, 0.422 left, 0.881 up | +0.582 ahead, -0.158 left, +0.231 up |
| ball of the left foot: the floor | 0.130 ahead, 0.740 left, 0.240 up | +0.530 ahead, +0.160 left, -0.410 up |
| ball of the right foot: the accelerator | 0.126 ahead, 0.336 left, 0.312 up | +0.526 ahead, -0.244 left, -0.338 up |

## The torso (a departure from "keep the torso as it is")

The pilot sits leaning back, as in an ejection seat: his neck's base is 6 degrees behind upright over his hips. With that torso the hands cannot reach the wheel (above).
The choices, and what each costs:

| choice | what it does | cost |
|---|---|---|
| **lean 18, shoulders 18 forward (built)** | the three spine bones come forward 6 degrees each: his neck's base is then 5 degrees ahead of upright over his hips, which stay against the seat back | the torso is no longer the pilot's; his head is 0.11 m further forward |
| lean 12 and the seat 5 cm forward (`TOW.seat.fwd` -0.35) | less of a lean; the elbows bend the same | he sits 5 cm off the seat back; the hook's seat changes for every driver |
| lean 0 (`lean` 0, `shoulder_fwd` None) | the pilot's torso untouched | the arms are straight and the hands stop 9 cm and 6 cm short of the rim |

The head is not changed by any of them: the neck is turned back by exactly what the spine came forward, so the head
has, in every pose, the direction the head poses gave it (`--report`: "the head is turned as it was").

## How a limb is solved

For each of the six poses (the plain seated one and the five head poses: the shoulders move with the torso as the head
turns, the hands stay on the wheel):

1. The foot or hand is laid where it belongs: the ball of the foot on its surface, the foot along it; the rim across
   the palm with the thumb upwards, the hand turned about the rim until it is as nearly in line with the forearm as
   it can be.
2. Hip to ankle (shoulder to wrist) is then two bones of known length: the knee (elbow) lies on a circle, and the
   point of it nearest the pole direction is taken (knees up, elbows down and out).
3. The upper bone is turned so that its hinge lies across that plane, the lower one bent about its hinge.
4. The arm's twist bones are set as the figure's own clips set them: the upper arm's keeps its roll against the
   shoulder; the forearm's two each take a third of the hand's turn (checked against five of DCS's clips: within 2
   degrees for the forearm, 2 to 8 on average for the upper arm).

## What is checked without DCS (`test/driver-pose.test.ts`, `python -I model/driver_pose.py --report`)

| check | result |
|---|---|
| wrists and ankles, worked out again from the keyed bones, against where they were to be | 0.0 cm in every pose but one: head 100 degrees left, the left wrist 0.1 cm short |
| the grips on the rim, the balls of the feet on floor and pedal | 0.0 cm (0.1 cm in that one pose) |
| bone lengths | unchanged (0.4299 / 0.3904 m, 0.2832 / 0.2547 m) |
| knees | 104 degrees (left), 109 (right) from straight; thighs 13 and 16 degrees above level; the left foot square to its shin, the right pressed 25 degrees down on the pedal |
| elbows, facing ahead | 45 degrees (left), 53 (right); wrists 4 and 17 |
| elbows, head 100 right (backing) | 63 (left), 26 (right); head 100 left: 20 (left: as straight as it is let), 68 (right) |
| joint limits (knee 150, elbow 145, wrist 60, ankle 45 down / 25 up, thigh 35 up / 45 out) | none passed in any pose |
| the head | the same turn as in the head poses, every pose |
| the clips as DCS's own Assimp reads them (`--assimp`) | each one still animation, 11 frames, 74 bones; hands and feet within 0.00 cm of the solved pose; the pose facing ahead has the seated pilot's own head bone |
| half way between two head poses, the bones' turns mixed as a blend space mixes them (`--blend`) | the grips within 0.3 cm of the rim, the ankles 0.0 cm; no bone's two turns are opposite ones |
| the plain seated pose | byte for byte the head pose that faces ahead |
| without `--pose` | the head poses are the pilot's, as before |

The drawing: `python -I model/driver_pose.py --svg <file.svg> [catcc_drv_look_r100]`: the solved skeleton from the
tractor's left and from above, over the lines of the tractor's own model, the pilot's pose in grey.

## What is built, and where

| file | what |
|---|---|
| `crew-test/model/driver_pose.py` | the settings, the solver, the plain seated pose `catcc_drv_seat.fbx`; `--report`, `--measure`, `--svg`, `--assimp`, `--blend` |
| `crew-test/model/driver_head.py` | `--pose`: the five head poses are made with the limbs solved for each |
| `Scripts/CATCC/crewtest_hook.lua` | `TOW.seatPose`; `Tow.sit`: a driver whose head does not turn is seated in `catcc_drv_seat` where the mod has it, else in `f18_0_init` |
| `Scripts/CATCC/crewtest_demo.lua` | seats its drivers through `Tow.sit` |
| `crew-test/install.ps1` | `-DriverPose on / off` |
| `test/driver-pose.test.ts`, `test/crewtest.test.ts` | the pose, the clips, the drawing; how the hook chooses |

**The switch.** `install.ps1 -DriverPose on` writes `driverPose = true` into `Config\CATCC-test.lua` (later installs
make the files again; `-DriverPose off` takes it out). It is a switch of its own beside `-DriverHead`: the heads have
been seen in DCS, the limbs have not, and each can be taken out alone.

| installed with | a driver sits in | his limbs |
|---|---|---|
| neither | `f18_0_init` | the pilot's |
| `-DriverHead on` | the blend space `catcc_bs_drv_look` | the pilot's |
| `-DriverPose on` | `catcc_drv_seat` | at the pedals and the wheel |
| both | the blend space, its five poses made with `--pose` | at the pedals and the wheel |

Nothing made from DCS's clip is kept in the repository: the files are made on the user's PC at install.

## The DCS run

1. DCS closed: `install.ps1 -DriverHead on -DriverPose on`. It says `The drivers' head: driver head: made ... (the
   limbs at the wheel and the pedals)`, `The drivers' limbs: driver pose: made catcc_drv_seat.fbx`, and at the end
   `The tractor drivers' limbs are at the pedals and the steering wheel`.
2. A mission on the carrier with our crew data. Ctrl+Shift+F9 (the deck spotting demo): every tractor has its driver.
   Look at a standing tractor from its left side, as in the picture, then from above and from the front.
3. To see: the left foot flat on the floor left of the wide pedal; the right foot on the small pedal right of the
   column, heel on the floor; both hands closed round the wheel's rim, the left at 9 o'clock, the right a little
   higher; elbows bent, down and out; he sits a little forward of upright (5 degrees).
4. F10 > CATCC crew test > Tow > Driver seat > **Head: right 100** and **Head: left 100**: the head turns as before
   and both hands stay on the wheel (the arm on the side he turns away from goes nearly straight).

What to judge, and the number to change (in `POSE`, then `install.ps1` again):

| seen | change |
|---|---|
| hands short of the rim by N cm (in front of it: beyond) | `wheel.fwd` down (up) by N; or, if the fingers do not close on the rim, `grip[0]` |
| hands inside or outside the rim's circle | `wheel.radius`; one hand too high or low: `left_hand` / `right_hand` (an hour is 30 degrees, 8.6 cm of rim) |
| the palms off the rim, the fingers round nothing | `grip[1]` (out of the palm) |
| elbows too straight | `lean` up (2 degrees bend each elbow about 5 more); too hunched: `lean` down, or the seat forward (`TOW.seat.fwd` AND `POSE['seat']`) |
| elbows too wide, or in the ribs | `elbow_out` (0: straight down; 1: 45 degrees out) |
| a foot in the floor, or floating | `sole` up (down) by as much |
| the left foot under the brake, or outside the cab | `left_foot.left` (0.66 is the brake's edge, 0.82 the cab's side) |
| the right foot beside its pedal | `accelerator.left`; too far up or down the pad: `right_ball` |
| knees in the steering wheel | `left_foot.ball` and `right_ball` further ahead (the knees come down), or `knee_out` up |
| thighs sunk in the seat cushion | this is `TOW.seat.up` (0.65: the pelvis bone, 0.65 up over a cushion 0.651 up). Raise it AND `POSE['seat'].up` by the same; the limbs are then solved for the higher seat |
| shoulders or hips pinched or stretched | `shoulder_fwd` down; `lean` down |
| the sleeve twisted at the wrist | the forearm's twist bones: say so (the rule is in `solve`) |

F10 > Tow > Driver seat > Forward / Back / Left / Right / Up / Down moves the whole man 10 cm on his tractor without
making anything again: the quickest way to see whether an error is the seat's or the limbs'.

## Risks

- **The skin.** Shoulders brought 18 degrees forward and arms raised to a wheel may pinch or stretch the jacket at the
  shoulder; the thighs, now nearly level, may show a crease at the hip.
- **Thighs in the cushion.** The pelvis bone is 0.65 up and the cushion's top 0.651: he sits about 7 cm into it, as he
  did before, but the thighs are lower now (13 degrees above level, not about 20) and cross the cushion's front edge.
- **Boot and hand sizes are estimates** (`sole`, `grip`): feet may sink into or float over the floor by a centimetre
  or two; the fingers may not quite close on the rim.
- **Popping.** A driver seated mid-walk goes from standing to this pose in one frame, as he did to the pilot's.
- **Head 100 left.** The left arm is at its longest and the hand 0.1 cm short. Looks round while standing go to 75.
- **Forearms over knees.** The middle lines of forearm and thigh pass 14 cm apart (left) and 15 cm (right): about 2 cm of air between a sleeve and a trouser leg of ordinary thickness.

## Steering (not built)

The tractor's wheel is argument 9 of its model: it turns 225 degrees each way at full lock. For the hands to go with
it:

- a second axis on the blend space (the parameter would be the hook's steering value): the poses solved here with both
  hands some hours round the rim (`left_hand` and `right_hand` plus the same number: no new code in the solver), three
  steering positions for each of the five head poses: 15 clips. `Animation::load` reads `x` AND `y` for each entry, so
  a two-axis blend space is the same kind of file; none of DCS's own two-axis ones has been seen from outside, so it is
  a guess until a run shows it;
- the native module writes one parameter a head now: a second, smoothed the same way (a rebuild);
- the hook says the steering value when it changes.

How far hands can follow: with the wheel 30 degrees either way both still reach it; at 60 degrees one hand is 1 to 6 cm
short, at 90 up to 8 cm (worked out with the solver). So hands could follow the first 30 to 45 degrees of the wheel's
225 and would have to slip or let go beyond. Hand over hand needs clips of its own.
