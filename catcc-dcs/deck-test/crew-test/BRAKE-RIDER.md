# The brake riders

The user (2026-11-25): "Please add brown shirts to the cockpit of aircraft being towed. They should spawn into the
cockpit just before the tug arrives. They should remain in the cockpit until the tug is clear. They should look around
while in the cockpit. The canopy should remain open. They should place their hands on the "towel rack" / grab handles
around the canopy frame."

Then, the same day: "the towel rack is attached to the part of the canopy that raises when opening, so they can't put
their hands there. They can just rest their hands in their lap for now instead."

**Built and tested in the rig. Not yet seen in DCS.**

## Who

Nine brown shirts, `catcc-b0` .. `catcc-b8`, declared by the crew data patch (`groundcrew-patch.lua`, mode `model`) as
the drivers are: DCS's own deck crew figure (`carrier_shooter`) in the brown livery that `catcc-m0` already wears, three
in each of catapult crews 2, 3 and 4. That fills those crews to twelve, the size crew 1 is seen to work with. No crew is
made bigger than that, so there are nine riders for ten tractors. When all nine are in aircraft, a tenth tow at the same
moment starts without one, and the log says so once for that aircraft. A rider climbs into it when one becomes free. In
the rig's whole demo each of the 24 aircraft that come up had one rider from the hangar to its deck spot. Two tows started
before a rider was free.

They wait out of sight, 900 m aft of the ship's origin, where the Hide switches put a hidden driver. The hook treats them
as a role of their own (`rider`), so the marshalling and the "our crew" commands never pick one.

## When (`Scripts/CATCC/crewtest_cockpit.lua`)

Each frame the demo hands the module every aircraft a tractor is working on:

| stage | a rider |
|---|---|
| the tractor is on its way | climbs in when the tractor is **20 m** from the place it hooks on at. If its way starts nearer than that, he climbs in at once |
| hooked on, towed or pushed, being unhooked | stays in |
| delivered, the tractor leaving | stays in until the tractor is **8 m** further from the aircraft than it was when it delivered it, or at most **60 s**. The tractor is followed even when it has already been given its next job |
| on an elevator between its two tractors | stays in for the whole ride, from the hangar's tractor leaving it until the deck's tractor has it (the user, 2026-11-26). The two aircraft that stay on a platform as their deck spots let him out once their hangar tractor is clear |
| the tow ended or was broken off | climbs out at once |

So an aircraft keeps one rider from the hangar to its deck spot. Nobody is put into an aircraft that stands on a
platform, and a delivered aircraft never takes a new rider. A hangar tractor that starts hooked on gets its rider when its tow begins.

"Spawn" is the same mechanism the drivers use. The man already exists. He is put into the seat in one frame, and out of
sight again in one frame.

## Where and how he sits

- **The seat.** The figure's pelvis bone goes where the F/A-18C model puts its own pilot: the connector `seat_pilot` of
  `fa-18c.edm`, 3.640 m ahead of the aircraft's position and 0.425 m up, on its centre line, facing its way. Checked
  against the model: the pilot figure put there has its left hand within 5 cm of the throttle's connector. He is placed
  again only in frames in which the aircraft moved.
- **The hands** rest in his lap, palm down on the top of each thigh, 62 % of the way from hip to knee (`POSE['hold']
  = 'lap'`). The towel rack is on the part of the canopy that rises, out of reach when it is open. The fingers keep the
  pilot's curl (round the throttle and the stick), so they lie curled over the thigh. The first version, with both hands
  on the fixed windscreen arch (`'arch'`: 4.066 m ahead, 1.159 m up, measured from the model), is kept in the script but
  not used.
- **The legs** stay as the pilot's, on the rudder pedals. A brake rider's feet are on the brakes, which are the tops of
  those pedals.
- **The torso** is the pilot's.

The poses (`model/rider_pose.py`, made at every install from the F/A-18C pilot figure's look-round clip on the user's
PC, like the drivers' poses):

| file | what |
|---|---|
| `catcc_rdr_look_l100`, `_l050`, `_c000`, `_r050`, `_r100` | head 100 and 50 degrees left, ahead, 50 and 100 right; hands in the lap in each |
| `blend_space/catcc_bs_rdr_look.lua` | the blend space over the five, on the drivers' parameter `catcc_head_yaw` |
| `catcc_rdr_seat` | the pose that faces ahead, played when the head cannot turn |

Checked without DCS: in all six poses both hands are 0.0 cm from where they rest. Elbows bend 90 to 104 degrees and
wrists 11 to 18 degrees, within the joint limits. DCS's own Assimp reads each pose as a still pose with the hands within
0.3 cm of their places (the thighs move a little as the torso turns with the head). Halfway between two head poses, mixed
the way a blend space mixes them, the hands stay within 0.3 cm and no bone's turns are opposite.

## Looking round

Where he looks comes from `crewtest_head.lua`, the same code that steers a driver whose tractor is standing: ahead, and
every 4 to 9 s a look of 35 to 75 degrees to one side for 1 to 2.6 s, sometimes followed by a look to the other side. The
native module turns the head smoothly, as it does a driver's. Without the blend space he sits in `catcc_rdr_seat` with
his head ahead. Without that he sits in the pilot's own `f18_0_init`. `CATCC_HEAD_OFF` leaves his head alone.

## The canopy

The aircraft's model argument 38 is set to 0.9, the value the jet's own mechanism opens it to (`FA-18C_hornet.lua`,
Door0). It opens when a rider climbs in. It stays open after he climbs out, and it is written again with the wings,
chocks and covers. A lookalike made for an aircraft with an open canopy gets an open canopy too.

## Installing

1. `install.ps1` copies `crewtest_cockpit.lua` and makes the poses. It says `The brake riders' poses: made ...`.
2. The riders exist only after the crew data patch is applied again: `director-test.ps1 -Crew Model` (DCS closed).

The USB installer carries the script but not `model\`, so on the second PC the riders sit in the pilot's pose, as its
drivers do. It also carries no crew patch, so that PC has neither riders nor drivers.

## The DCS run: what to look for

1. Start the deck spotting demo (Ctrl+Shift+F9). The log (`Logs/catcc-crewtest.log`) says
   `demo: 9 brake rider(s) found (9 of 9)`. No brown shirts stand by the island.
2. Watch a deck tractor drive to an aircraft. When it is about 20 m from the nose, a brown shirt appears in the cockpit
   and the canopy opens.
3. During the tow he stays in the seat with the aircraft, hands resting on his thighs, forearms level, elbows by his
   sides. Every few seconds he looks to one side.
4. After the tractor unhooks and drives about 8 m off, he disappears. The canopy stays open.
5. A hangar aircraft keeps the same rider as it rides the elevator up and until the deck's tractor tows it to its spot.

What to judge, and the number to change:

| seen | change |
|---|---|
| he sits too high, low, forward or back in the seat | `C.CFG.seat` in `crewtest_cockpit.lua` and `POSE['seat']` in `rider_pose.py` together (a test holds them the same), then install again |
| hands sunk into the thighs, or floating over them | `POSE['lap_up']` up (down) by as much |
| hands too near the knees or the hips | `POSE['lap_along']` (0: the hip, 1: the knee) |
| elbows too wide or in the ribs | `POSE['elbow_out']`; more bends the wrists further |
| he appears too early or too late | `C.CFG.board` (m) |
| he leaves too early or too late | `C.CFG.clear` (m), `C.CFG.linger` (s) |
