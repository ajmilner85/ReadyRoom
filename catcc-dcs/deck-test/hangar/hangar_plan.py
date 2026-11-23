"""The hangar's PARKING PLAN for the deck spotting demo, worked out from the hangar's map.

    python -I hangar_plan.py            (after hangar_map.py: it reads hangar-map.json)

Writes catcc-dcs/Scripts/CATCC/crewtest_hangar.lua (what the hook's demo reads: the floor, a grid of what stands
where, the elevators and where aircraft stand on them, the aircraft's places, where the tractors wait) and
hangar-parking.svg (the plan as a drawing, over the walls).

THE PLAN IS THE USER'S (2026-11-17, after the demo's first run: "I've updated the hangar deck spotting plan in the
Nimitz .svg ... The hangar deck plan I've built is kind of a worst case, fully packed state"): the F/A-18C groups on
the layer "Hangar Spotting" of carrier-ops-handoff-2/Nimitz.svg, read by hangar_spots.py: 29 places, in packs of
five (three abreast nose one way, two nose the other way tucked between their noses) and single ones across the
elevators' doorways. They are written out as they are drawn, numbered from the bow aft. Which of them the demo fills
(half of the air wing: 20), which elevator each goes up by and in what order is the demo's (crewtest_demo.lua): "crews
would be parking aircraft in a certain order so that the aircraft they need to access first are accessible".
  (The first plan, worked out here: one row along the starboard side and the port side kept as a lane, thirteen
  aircraft, every one reachable at any time. The user: that was an assumption of mine, not how a hangar is packed.)
  * What the map has under each place is said (a tail or a wing tip over something low, or in something high): the
    user drew over the walls cut at 1.5 m with the low fittings hidden; nothing is moved for it.
  * ON A PLATFORM two aircraft stand side by side, noses inboard, their tails out over the platform's edge: ON THE
    DECK SPOTS THE USER PUT THERE (El n 1 and El n 2 of the spotting plan, read from crewtest_routes.lua), as nearly
    as the doorway lets them. They are pushed onto the platform straight through the doorway, which is 19 to 19.6 m
    wide at wing height at its narrowest (between the door housings at its sill; 20.8 m between the posts further
    in); the user's two spots on a platform are 11.5 to 12.5 m apart, 19.9 to 20.9 m over the wing tips: wider than
    the doorway. So each place has its spot's own distance from the centreline, and is moved along the ship only as
    far as it must be to keep its outer wing tip DOOR_ROOM clear of the doorway's side: of the eight, four are on
    their spots or within 0.4 m, the other four (the one of each pair further out than the doorway) 1 to 2.7 m
    inboard of theirs.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = json.load(open(os.path.join(HERE, 'hangar-map.json'), encoding='utf-8'))
OUT = os.path.join(HERE, '..', '..', 'Scripts', 'CATCC', 'crewtest_hangar.lua')

# WHAT THE USER MARKED IN DCS (2026-11-18, the panel's crosshair): what stands along the hangar's forward and after
# walls, which the models' map has as free floor: blocked, to the full height (hangar_marks.py says how, and what of it
# is assumed). Applied to the map's grid here, before anything is made of it.
sys.path.insert(0, HERE)
import hangar_marks  # noqa: E402
MARKED, MARKED_M2 = hangar_marks.apply(MAP)

G = MAP['grid']
ROWS, CELL = G['rows'], G['cell']
FLOOR = MAP['floor_y']

LEN_AHEAD, LEN_BEHIND = 8.6, 8.5      # a Hornet's nose and tail from its own position
HALF = 4.2                            # half its span, wings folded
STATION_Z = 32.5                      # an aircraft's own position on a platform, if the spotting plan has no spot there
DOOR_ROOM = 0.6                       # from a wing tip to the doorway's side as an aircraft is pushed through
ROUTES = os.path.join(HERE, '..', '..', 'Scripts', 'CATCC', 'crewtest_routes.lua')


def at(x, z):
    r, c = int(math.floor((z - G['z0']) / CELL)), int(math.floor((x - G['x0']) / CELL))
    if 0 <= r < len(ROWS) and 0 <= c < len(ROWS[r]):
        return ROWS[r][c]
    return ' '


def bars(x, z, fx, fz, half=HALF, grow=0.25):
    """the aircraft's four rounded bars (as the hook's Tow.Fd.shape), each a little fatter"""
    rx, rz = -fz, fx
    w, t = half - 1.8, 3.3 - 1.0
    return [(x + fx * 2.5, z + fz * 2.5, x + fx * 8.1, z + fz * 8.1, 0.5 + grow),
            (x - fx * 7.4, z - fz * 7.4, x + fx * 2.5, z + fz * 2.5, 1.1 + grow),
            (x - fx * 2.2 - rx * w, z - fz * 2.2 - rz * w, x - fx * 2.2 + rx * w, z - fz * 2.2 + rz * w, 1.8 + grow),
            (x - fx * 7.0 - rx * t, z - fz * 7.0 - rz * t, x - fx * 7.0 + rx * t, z - fz * 7.0 + rz * t, 1.0 + grow)]


def clear(x, z, fx, fz, ok='.,'):
    """nothing of the hangar under or in the aircraft: every cell its shape covers is free floor"""
    for ax, az, bx, bz, r in bars(x, z, fx, fz):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 0.2))
        for i in range(n + 1):
            px, pz = ax + (bx - ax) * i / n, az + (bz - az) * i / n
            k = int(math.ceil(r / 0.2))
            for dx in range(-k, k + 1):
                for dz in range(-k, k + 1):
                    if dx * dx + dz * dz <= k * k and at(px + dx * 0.2, pz + dz * 0.2) not in ok:
                        return False
    return True


def free_run(z, xa, xb):
    """the widest free stretch along x at this z, between xa and xb"""
    best, start, x = (0.0, 0.0, 0.0), None, xa
    while x <= xb:
        if at(x, z) in '.,':
            if start is None:
                start = x
            if x - start > best[0]:
                best = (x - start, start, x)
        else:
            start = None
        x += 0.2
    return best[1], best[2] + 0.2


def wing_run(z, mid, xa, xb):
    """the stretch along x at this z, round mid, where nothing stands that a wing would hit (something low may)"""
    a = mid
    while a - 0.2 >= xa and at(a - 0.2, z) != 'h':
        a -= 0.2
    b = mid
    while b + 0.2 <= xb and at(b + 0.2, z) != 'h':
        b += 0.2
    return a, b + 0.2


# ---------------------------------------------------------------- the elevators and their doorways
# the spotting plan's deck spots on the platforms: "E<elevator><n>" in crewtest_routes.lua
EL_SPOTS = {}
if os.path.exists(ROUTES):
    import re
    for m in re.finditer(r'id = "E(\d)(\d)", name = "[^"]*", area = "[^"]*", x = ([-\d.]+), z = ([-\d.]+)', open(ROUTES, encoding='utf-8').read()):
        EL_SPOTS.setdefault(int(m.group(1)), []).append({'id': 'E' + m.group(1) + m.group(2), 'x': float(m.group(3)), 'z': float(m.group(4))})
elevators = []
for e in MAP['elevators']:
    k = e['elevator']
    stbd = e['z'][0] > 0
    zdoor = 18.6 if stbd else -19.4
    a, b = free_run(zdoor, e['x'][0] - 4, e['x'][1] + 4)
    # (the doorway at wing height, at its narrowest from the hangar's side to the platform's edge)
    zz = 16.4 if stbd else -21.2
    while zz <= (21.2 if stbd else -16.4) + 1e-9:
        wa, wb = wing_run(zz, (e['x'][0] + e['x'][1]) / 2, e['x'][0] - 4, e['x'][1] + 4)
        a, b = max(a, wa), min(b, wb)
        zz += 0.2
    mid = (a + b) / 2
    SIDE = HALF + (b - a - 4 * HALF) / 6
    # the user's two deck spots on this platform (aft one first): where the two stand, as nearly as the doorway lets them
    own = sorted(EL_SPOTS.get(k, []), key=lambda q: q['x'])
    sz = STATION_Z if stbd else -STATION_Z
    fz = -1.0 if stbd else 1.0
    stations = [{'x': round(mid - SIDE, 2), 'z': sz, 'fx': 0.0, 'fz': fz}, {'x': round(mid + SIDE, 2), 'z': sz, 'fx': 0.0, 'fz': fz}]
    if len(own) == 2:
        lo, hi = a + HALF + DOOR_ROOM, b - HALF - DOOR_ROOM
        xa, xb = min(max(own[0]['x'], lo), hi), min(max(own[1]['x'], lo), hi)
        if xb - xa >= 2 * HALF + 0.4:
            stations = [{'x': round(xa, 2), 'z': round(own[0]['z'], 2), 'fx': 0.0, 'fz': fz, 'spot': own[0]['id'], 'off': round(math.hypot(xa - own[0]['x'], 0), 2)},
                        {'x': round(xb, 2), 'z': round(own[1]['z'], 2), 'fx': 0.0, 'fz': fz, 'spot': own[1]['id'], 'off': round(math.hypot(xb - own[1]['x'], 0), 2)}]
    elevators.append({'k': k, 'x': e['x'], 'z': e['z'], 'arg': e['argument'], 'top_up': e['top_up'], 'travel': e['travel'], 'open': [round(a, 2), round(b, 2)], 'mid': round(mid, 2), 'stbd': stbd,
                      'stations': stations})

# how far a platform has come down for its model argument (the collision model's own position keys: 0 up, 1 down)
KEYS = [(0, 0), (0.05, 0.04), (0.10, 0.14), (0.15, 0.44), (0.20, 0.89), (0.25, 1.70), (0.30, 2.50), (0.35, 3.31), (0.40, 4.11), (0.45, 4.91), (0.50, 5.72), (0.55, 6.52), (0.60, 7.33), (0.65, 8.13),
        (0.70, 8.94), (0.75, 9.74), (0.80, 10.55), (0.85, 11.00), (0.90, 11.29), (0.95, 11.42), (1.00, 11.43)]

# ---------------------------------------------------------------- the aircraft's places: the user's drawing
import hangar_spots  # noqa: E402


def under(x, z, fx, fz):
    """what the map has under an aircraft's shape: (cells of something high, cells of something low or no floor)"""
    high = low = 0
    seen = set()
    for ax, az, bx, bz, r in bars(x, z, fx, fz, grow=0.0):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 0.2))
        for i in range(n + 1):
            px, pz = ax + (bx - ax) * i / n, az + (bz - az) * i / n
            k = int(math.ceil(r / 0.2))
            for dx in range(-k, k + 1):
                for dz in range(-k, k + 1):
                    if dx * dx + dz * dz <= k * k:
                        key = (int(math.floor((px + dx * 0.2) / 0.2)), int(math.floor((pz + dz * 0.2) / 0.2)))
                        if key not in seen:
                            seen.add(key)
                            c = at(px + dx * 0.2, pz + dz * 0.2)
                            if c == 'h':
                                high += 1
                            elif c not in '.,':
                                low += 1
    return high, low


slots = []
for n, r in enumerate(hangar_spots.read(), 1):
    assert abs(r['scale'] - 1) < 0.01, ('an aircraft of the hangar plan is not drawn to scale', r)
    a = math.radians(r['hdg'])
    q = {'n': n, 'x': round(r['x'], 2), 'z': round(r['z'], 2), 'fx': round(math.cos(a), 4), 'fz': round(math.sin(a), 4), 'hdg': r['hdg'], 'el': r.get('el'), 'seq': r.get('seq')}
    q['high'], q['low'] = under(q['x'], q['z'], q['fx'], q['fz'])
    slots.append(q)
assert len(slots) >= 20, 'the layer "Hangar Spotting" has fewer than 20 aircraft'
# THE USER'S OWN ORDER (2026-11-18: "I've also labelled each Hangar spot with \"EL# X\" based on what I think the
# unloading sequence should be for a FULL hangar"): every aircraft says which elevator it goes up by and its turn there:
# each elevator's turns run 1, 2, 3 ... without a gap
for k in (1, 2, 3, 4):
    turns = sorted(q['seq'] for q in slots if q['el'] == k)
    assert turns == list(range(1, len(turns) + 1)), ('elevator %d: its aircraft are not numbered 1, 2, 3 ...' % k, turns)
assert all(q['el'] for q in slots), 'an aircraft of the layer has no "EL# X" in its label'
# THE ORDER FOUND IN THE RIG (2026-11-20; the user: "I'm not fixated on the order if there is another order that would
# speed up unloading. That goes for the entire sequence. What I provided was meant to be a starting point ... You can
# experiment with the unloading order in your rig to your hearts content"): by place, the elevator and the turn there.
# From his: place 8 goes up elevator 2 last (not 4), 14 up elevator 3 last (not 2); elevator 4 takes 19 before 18 and
# ends with 15 and 12 (the port row 19 > 16 > 15 > 12 comes free in that order; 12 no longer waits for elevator 3's
# 15, nor 8 for 12). In the rig at real time the four runs took 3662 s against 4032 with his (each 1 to 2.3 minutes
# shorter). His labels stay in the drawing: USER_ORDER=1 in the environment makes the plan with them, as before.
RIG_ORDER = {1: (1, 1), 4: (1, 2), 6: (1, 3), 2: (1, 4), 3: (1, 5), 7: (1, 6),
             9: (2, 1), 11: (2, 2), 5: (2, 3), 10: (2, 4), 13: (2, 5), 8: (2, 6),
             22: (3, 1), 20: (3, 2), 23: (3, 3), 17: (3, 4), 16: (3, 5), 14: (3, 6),
             21: (4, 1), 24: (4, 2), 19: (4, 3), 18: (4, 4), 15: (4, 5), 12: (4, 6)}
if not os.environ.get('USER_ORDER'):
    assert sorted(RIG_ORDER) == [q['n'] for q in slots], 'RIG_ORDER is for another layout'
    for q in slots:
        q['el'], q['seq'] = RIG_ORDER[q['n']]
# no two of them into each other (their shapes, as the hook has them)
for i, a in enumerate(slots):
    for b in slots[i + 1:]:
        if math.hypot(a['x'] - b['x'], a['z'] - b['z']) < 17.5:
            A, B = bars(a['x'], a['z'], a['fx'], a['fz'], grow=0.0), bars(b['x'], b['z'], b['fx'], b['fz'], grow=0.0)

            def seg(p, q0, q1):
                vx, vz = q1[0] - q0[0], q1[1] - q0[1]
                t = max(0.0, min(1.0, ((p[0] - q0[0]) * vx + (p[1] - q0[1]) * vz) / max(1e-9, vx * vx + vz * vz)))
                return math.hypot(p[0] - q0[0] - vx * t, p[1] - q0[1] - vz * t)
            gap = 1e9
            for ba in A:
                for bb in B:
                    for k in range(9):
                        pa = (ba[0] + (ba[2] - ba[0]) * k / 8, ba[1] + (ba[3] - ba[1]) * k / 8)
                        pb = (bb[0] + (bb[2] - bb[0]) * k / 8, bb[1] + (bb[3] - bb[1]) * k / 8)
                        gap = min(gap, seg(pa, (bb[0], bb[1]), (bb[2], bb[3])) - ba[4] - bb[4], seg(pb, (ba[0], ba[1]), (ba[2], ba[3])) - ba[4] - bb[4])
            a.setdefault('gap', (1e9, 0))
            b.setdefault('gap', (1e9, 0))
            if gap < a['gap'][0]:
                a['gap'] = (gap, b['n'])
            if gap < b['gap'][0]:
                b['gap'] = (gap, a['n'])

# ---------------------------------------------------------------- where the four tractors wait
# THE HANGAR IS FULL NOW (the user's layout of 2026-11-18: 24 aircraft): the places the tractors had (in the plan's
# places 8, 10, 23 and 28, which the demo then left empty) have aircraft on them. Where a tractor (5.4 x 1.9 m) stands
# on free floor 1.5 m from every aircraft (found with the session's hangar_free.py): the bay forward of x = 46, which
# is empty; the after end behind the aftmost two (x -124 .. -120); a pocket along the starboard wall at x -76 .. -65
# and one along the port wall at x -58 .. -50; a band at x 26 .. 34 (elevator 1's own working room: not used) and the
# floor in front of elevator 3's doorway (not used). So: two in the forward bay, 14 m apart, noses aft; one in the
# starboard wall's pocket, nose aft; one at the after end, nose forward.
# THREE OF THOSE WERE INSIDE WHAT STANDS ALONG THE END WALLS (the user, 2026-11-18, after marking it: "adjust where the
# hangar tugs spawn so they aren't spawning inside walls"): the forward bay is not empty (his outline runs across the
# ship at 45 to 53 m forward) and the after end is blocked aft of 119 m. With the marks applied a tractor still fits,
# 1.5 m from every aircraft: forward, in the two recesses of the forward outline either side of the centreline (free
# to 53.1 m forward between 4.6 m to port and the centreline, to 50.7 m between 0.4 and 5.2 m to starboard): one in
# each, noses aft; the starboard wall's pocket (as before); and, the after end having no room left (the floor aft of
# the aftmost two aircraft is within 1 m of them, and the recess of the after outline at 5.8 .. 9.3 m to starboard
# opens onto the wing of the aircraft in front of it), the port wall's pocket at x -60 .. -45, nose aft.
# (THE TWO RECESSES ARE 5 M APART: in the rig the second tractor, setting off, passed 1.6 m from the first where it
# stood. So one in the port recess, and the second forward one in the port forward corner, along the wall.)
# THE PLACES A TRACTOR WAITS AT ("posts") ARE THE ONES THAT CONNECT (2026-11-18: the solver, hangar_solve.lua, plans every
# way of a tractor as it drives, with the hangar packed, and counts for each place and each way of standing there how
# many of the others it gets to and is reached from: its POSTWAY lines. Of the places found by the rule below, and two
# in the open floor, these connect both ways; 44 / -14.5, -67 / -14.5 and -66.5 / 14.5 do not). Four are where the
# tractors start (`homes`): the port recess of what stands along the forward wall, the starboard wall forward, the
# starboard wall aft, the port wall aft of amidships; four are spare (`rest`): three along the port wall, and one in
# the open floor between the after elevators' doorways (in front of elevator 1's the floor is under a nose now). Which way a tractor stands at
# each is the solver's (hangar-tows.lua: posts).
homes = [{'x': 48.5, 'z': -2.2, 'hx': -1.0, 'hz': 0.0}, {'x': 42.0, 'z': 14.5, 'hx': -1.0, 'hz': 0.0},
         {'x': -77.0, 'z': 14.5, 'hx': -1.0, 'hz': 0.0}, {'x': -52.0, 'z': -14.5, 'hx': -1.0, 'hz': 0.0}]
REST = [{'x': -1.0, 'z': -14.5, 'hx': -1.0, 'hz': 0.0}, {'x': 27.0, 'z': -14.5, 'hx': -1.0, 'hz': 0.0}, {'x': -10.0, 'z': -14.5, 'hx': -1.0, 'hz': 0.0},
        {'x': -93.5, 'z': -3.0, 'hx': -1.0, 'hz': 0.0}]
if os.environ.get('HANGAR_HOME4'):      # (to try another place for the fourth in the rig: "x,z,hx,hz")
    v = [float(q) for q in os.environ['HANGAR_HOME4'].split(',')]
    homes[3] = {'x': v[0], 'z': v[1], 'hx': v[2], 'hz': v[3]}


def tug_clear(h):
    for d in (-3.2, -2, -1, 0, 1, 2.0):
        for sd in (-0.9, 0, 0.9):
            px, pz = h['x'] + h['hx'] * d - h['hz'] * sd, h['z'] + h['hz'] * d + h['hx'] * sd
            if at(px, pz) not in '.,':
                return False
    return True


GSTEP, GX0, GZ0 = 0.5, -132.0, -24.0   # (the grid the demo is given: see below)


def coarse(x, z):
    """what the demo's grid has at a point: its half-metre cell, as it is made below"""
    cx, cz = GX0 + math.floor((x - GX0) / GSTEP) * GSTEP, GZ0 + math.floor((z - GZ0) / GSTEP) * GSTEP
    cs = [at(cx + a * 0.2 + 0.05, cz + b * 0.2 + 0.05) for a in range(3) for b in range(3)]
    return '#' if 'h' in cs else 'o' if 'l' in cs else ' ' if ' ' in cs else '.'


def tug_margin(h, r=1.5):
    """free floor all round the tractor's own point, r metres out, BY THE DEMO'S OWN GRID (half-metre cells: a cell is
    shut if anything stands in any part of it): the hook's test of where a tractor may be is 1 m all round its point,
    the way-finder's 1.2 m; a tractor whose place was 1 m from a fitting by the fine map could not set off again
    (the rig, 2026-11-18)"""
    return all(coarse(h['x'] + q * math.cos(math.radians(a)), h['z'] + q * math.sin(math.radians(a))) == '.' for a in range(0, 360, 30) for q in (r, r / 2))


def tug_room(h):
    """how near a tractor standing there is to the nearest aircraft of the plan (their shapes)"""
    best = 1e9
    for d in (-3.3, -2.2, -1.1, 0, 1.1, 2.1):
        for sd in (-0.95, 0, 0.95):
            px, pz = h['x'] + h['hx'] * d - h['hz'] * sd, h['z'] + h['hz'] * d + h['hx'] * sd
            for q in slots:
                if math.hypot(px - q['x'], pz - q['z']) < 16:
                    for ax, az, bx, bz, r in bars(q['x'], q['z'], q['fx'], q['fz'], grow=0.0):
                        vx, vz = bx - ax, bz - az
                        t = max(0.0, min(1.0, ((px - ax) * vx + (pz - az) * vz) / max(1e-9, vx * vx + vz * vz)))
                        best = min(best, math.hypot(px - ax - vx * t, pz - az - vz * t) - r)
    return best


for h in homes:
    assert tug_clear(h) and tug_margin(h), ('a tractor\'s waiting place is not free floor, 1.4 m all round', h)
    assert tug_room(h) >= 1.0, ('a tractor\'s waiting place is under or beside an aircraft', h, tug_room(h))
# SPARE PLACES TO WAIT AT (`rest`): a tractor that stands idle in the way of a tow it cannot take itself moves off to
# one of these (the demo's hangarShift). Along both side walls, 13 to 15 m off the centre line, nose aft: wherever a
# tractor stands on free floor 1.5 m from every aircraft of the plan, not abeam an elevator's doorway (3 m either
# side of it), 9 m and more from the four places above and from each other.
rest = REST
for h in rest:
    assert tug_clear(h) and tug_margin(h) and tug_room(h) >= 1.0, ('a spare waiting place is not free floor 1 m from every aircraft', h, tug_room(h))
scan = []
for zz in (14.5, 14.0, 13.5, 13.0, -14.5, -14.0, -13.5, -13.0):
    xx = 44.0
    while xx > -118.0:
        h = {'x': xx, 'z': zz, 'hx': -1.0, 'hz': 0.0}
        door = any(e['open'][0] - 3 < xx < e['open'][1] + 3 and (e['stbd'] == (zz > 0)) for e in elevators)
        if not door and tug_clear(h) and tug_margin(h) and tug_room(h) >= 1.5 and all(math.hypot(o['x'] - xx, o['z'] - zz) >= 9 for o in scan):
            scan.append(h)
        xx -= 0.5

# (and no aircraft of the plan stands in what he marked)
for q in slots:
    assert q['high'] == 0, ('an aircraft of the plan stands in something high (the map, with what the user marked)', q['n'], q['high'])

# ---------------------------------------------------------------- the grid for the hook: half-metre cells
STEP = 0.5
X0, X1, Z0, Z1 = -132.0, 78.0, -24.0, 24.0
assert (STEP, X0, Z0) == (GSTEP, GX0, GZ0)
grid = []
z = Z0
while z < Z1 - 1e-9:
    row = []
    x = X0
    while x < X1 - 1e-9:
        cs = [at(x + i * 0.2 + 0.05, z + j * 0.2 + 0.05) for i in range(3) for j in range(3)]
        if 'h' in cs:
            row.append('#')        # something between 1.2 and 4.8 m: nothing passes
        elif 'l' in cs:
            row.append('o')        # something low: no wheel, no tractor; a wing or a nose passes over
        elif ' ' in cs:
            row.append(' ')        # no floor
        else:
            row.append('.')        # floor (also where a part of the model moves: a door that is open, a rail that is down)
        x += STEP
    grid.append(''.join(row).rstrip())
    z += STEP

# ---------------------------------------------------------------- written out
def num(v):
    return ('%.3f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)


L = ['-- GENERATED by catcc-dcs/deck-test/hangar/hangar_plan.py from the hangar\'s map (hangar_map.py, DCS\'s own models) and what the user',
     '-- marked in DCS along its forward and after walls (hangar_marks.py: %d points, %d outlines, blocked to the full height). Do not edit.' % (len(hangar_marks.points()), len(MARKED)),
     '-- The hangar deck for the deck spotting demo (crewtest_demo.lua). Ship coordinates: x metres forward of the ship\'s origin,',
     '-- z metres to starboard; heights above the origin.',
     'return {',
     '  floor = %s, -- the hangar floor' % num(FLOOR),
     '  -- what stands where, in cells of %s m from x0 forward and z0 to starboard (a row runs forward, the rows from port to starboard):' % num(STEP),
     '  -- "." floor, "o" something low on it (no wheel passes; a wing does), "#" something up to 4.8 m, " " no floor',
     '  grid = { cell = %s, x0 = %s, z0 = %s, rows = {' % (num(STEP), num(X0), num(Z0))]
for r in grid:
    L.append('    "%s",' % r)
L.append('  } },')
L.append('  -- the elevators: the platform (x forward, z to starboard), its model argument (0 up .. 1 down), its top when up, how far it')
L.append('  -- comes down, the doorway between its posts, and the two places on it (an aircraft\'s own position, its nose inboard)')
L.append('  elevators = {')
for e in elevators:
    L.append('    [%d] = { x = { %s, %s }, z = { %s, %s }, arg = %d, top = %s, travel = %s, open = { %s, %s }, stations = { %s } },' % (
        e['k'], num(e['x'][0]), num(e['x'][1]), num(e['z'][0]), num(e['z'][1]), e['arg'], num(e['top_up']), num(e['travel']), num(e['open'][0]), num(e['open'][1]),
        ', '.join('{ x = %s, z = %s, fx = %s, fz = %s }' % (num(s['x']), num(s['z']), num(s['fx']), num(s['fz'])) for s in e['stations'])))
L.append('  },')
L.append('  -- how far a platform is down for its argument: { argument, metres }')
L.append('  keys = { %s },' % ', '.join('{ %s, %s }' % (num(float(a)), num(float(d))) for a, d in KEYS))
L.append('  -- where aircraft stand, fully packed: THE USER\'S PLAN (the layer "Hangar Spotting" of Nimitz.svg), numbered from the bow aft:')
L.append('  -- its own position and its nose; el, turn: THE USER\'S ORDER (his labels "EL# X"): the elevator it goes up by and its turn there.')
L.append('  slots = {')
for q in slots:
    L.append('    { n = %d, x = %s, z = %s, fx = %s, fz = %s, el = %d, turn = %d },' % (q['n'], num(q['x']), num(q['z']), num(q['fx']), num(q['fz']), q['el'], q['seq']))
L.append('  },')
# ---------------------------------------------------------------- the solved tows (hangar_solve.py), if they are this layout's
# THE USER, 2026-11-18: "I'm not even going to run the demo anymore unless we have paths for all aircraft. I've described
# what I believe is the correct unloading sequence to guide you." hangar_solve.lua finds, in the test rig, a tow for
# every aircraft in his order (hangar-tows.lua); here they go into the plan, by the place's number. They are taken only
# if every aircraft still stands where it stood when they were solved (the drawing may have changed since: then the
# plan is written without them, and says so: run hangar_solve.py and this again).
TOWS, HOPS, CLEAR, POSTCLASH, TOWS_WHY = [], [], [], [], 'hangar-tows.lua is not there: run hangar_solve.py'
tows_file = os.path.join(HERE, 'hangar-tows.lua')
if os.path.exists(tows_file):
    import re
    text = open(tows_file, encoding='utf-8').read()
    was = {int(m.group(1)): (float(m.group(2)), float(m.group(3)), float(m.group(4))) for m in re.finditer(r'\[(\d+)\] = \{ (-?[\d.]+), (-?[\d.]+), (-?[\d.]+) \}', text.split('tows = {')[0])}
    moved = [q['n'] for q in slots if q['n'] not in was or math.hypot(q['x'] - was[q['n']][0], q['z'] - was[q['n']][1]) > 0.011 or abs((q['hdg'] - was[q['n']][2] + 180) % 360 - 180) > 0.11]
    rows = re.findall(r'^    (\[(\d+)\] = \{ el = (\d), turn = (\d), st = (\d), .*)$', text, flags=re.M)
    by_n = {q['n']: q for q in slots}
    wrong = [int(n) for _, n, el, turn, st in rows if int(n) not in by_n or by_n[int(n)]['el'] != int(el) or by_n[int(n)]['seq'] != int(turn)]
    # (the posts it was solved for: the homes and the rest, in that order; which way a tractor stands at each)
    pm = re.search(r'posts = \{ (.*) \},', text)
    post_was = [tuple(float(v) for v in m.groups()) for m in re.finditer(r'\{ (-?[\d.]+), (-?[\d.]+), (-?\d+) \}', pm.group(1))] if pm else []
    post_now = homes + rest
    posts_same = len(post_was) == len(post_now) and all(abs(a[0] - b['x']) < 0.01 and abs(a[1] - b['z']) < 0.01 for a, b in zip(post_was, post_now))
    if moved or wrong or len(was) != len(slots):
        TOWS_WHY = 'hangar-tows.lua is for another layout (places %s differ): run hangar_solve.py' % sorted(set(moved + wrong))
    elif not posts_same:
        TOWS_WHY = 'hangar-tows.lua is for other waiting places of the tractors: run hangar_solve.py'
    else:
        TOWS, TOWS_WHY = [r[0] for r in rows], None
        HOPS = re.findall(r'^    (\[\d+\] = \{.*\}, -- from post .*)$', text.split('hops = {')[1], flags=re.M) if 'hops = {' in text else []
        CLEAR = re.findall(r'^    (\[\d+\] = \{[\d, ]*\},)$', text.split('clear = {')[1].split('postClash = {')[0], flags=re.M) if 'clear = {' in text else []
        POSTCLASH = re.findall(r'^    (\[\d+\] = \{[\d, ]*\},)$', text.split('postClash = {')[1], flags=re.M) if 'postClash = {' in text else []
        for a, b in zip(post_was, post_now):
            b['hx'], b['hz'] = a[2], 0.0
if TOWS:
    L.append('  -- THE TOWS, SOLVED (hangar_solve.py, in the user\'s own order; by the place\'s number): st: the place on the platform (1 aft, 2')
    L.append('  -- forward: the side he gave it); alpha: the nose wheel and bar turned that many degrees at the hook-up (+ to starboard of its')
    L.append('  -- nose); pull: the tractor\'s corners on the pull (none: pushed only); kz: where the push\'s last corner is on the place\'s line;')
    L.append('  -- ease: the push\'s first metres straight back; rho: the radius its corners are rounded on.')
    L.append('  -- THE TRACTORS\' OWN WAYS with it (planned as a tractor drives; by the post: the homes 1 .. %d, then the rest): ways: from a post' % len(homes))
    L.append('  -- to the aircraft\'s hook-up place (front: head on, for its front hitch; else to back onto the ring); out: from where the tow leaves')
    L.append('  -- the tractor back to a post, for the rear hitch and for the front one. side: it first backs a quarter circle to that side (1 / -1);')
    L.append('  -- back: it first backs that many metres straight; pts: the way.')
    L.append('  tows = {')
    L += ['    ' + t for t in TOWS]
    L.append('  },')
    L.append('  -- a tractor\'s ways from post to post, with the hangar as it is packed (a tractor that stands at a post without a way to an')
    L.append('  -- aircraft first goes to one that has): [from] = { [to] = { side, back, pts } }')
    L.append('  hops = {')
    L += ['    ' + h for h in HOPS]
    L.append('  },')
    L.append('  -- WHICH TOWS CAN BE DRIVEN AT THE SAME TIME: by place, the places whose tows keep 0.6 m from its own all along both (aircraft')
    L.append('  -- and tractors), whenever each begins: a tow in hand does not hold up one that is clear of it')
    L.append('  clear = {')
    L += ['    ' + c for c in CLEAR]
    L.append('  },')
    L.append('  -- BY POST: the places whose tows pass through a tractor waiting at that post: no tractor is sent to wait there while one of')
    L.append('  -- those aircraft is still parked')
    L.append('  postClash = {')
    L += ['    ' + c for c in POSTCLASH]
    L.append('  },')
L.append('  -- where the four tractors wait (its own position, its heading): two in the recesses of what stands along the forward wall, one along the')
L.append('  -- starboard wall, one along the port wall')
L.append('  homes = { %s },' % ', '.join('{ x = %s, z = %s, hx = %s, hz = %s }' % (num(h['x']), num(h['z']), num(h['hx']), num(h['hz'])) for h in homes))
L.append('  -- spare places to wait at, along the side walls: a tractor that stands idle in the way of a tow it cannot take itself moves off to one')
L.append('  rest = { %s },' % ', '.join('{ x = %s, z = %s, hx = %s, hz = %s }' % (num(h['x']), num(h['z']), num(h['hx']), num(h['hz'])) for h in rest))
L.append('}')
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')

# ---------------------------------------------------------------- the drawing
S = 8.0
VX0, VX1, VZ0, VZ1 = -132.0, 78.0, -40.0, 40.0


def X(x): return (x - VX0) * S
def Z(z): return (z - VZ0) * S


svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="Segoe UI, Arial, sans-serif" font-size="12">' % ((VX1 - VX0) * S, (VZ1 - VZ0) * S, (VX1 - VX0) * S, (VZ1 - VZ0) * S),
       '<rect width="100%" height="100%" fill="#ffffff"/>']
for r, row in enumerate(grid):
    c = 0
    while c < len(row):
        ch = row[c]
        d = c
        while d < len(row) and row[d] == ch:
            d += 1
        if ch != ' ':
            svg.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>' % (X(X0 + c * STEP), Z(Z0 + r * STEP), (d - c) * STEP * S, STEP * S + 0.3, {'.': '#eef1f4', 'o': '#f0961e', '#': '#c82828'}[ch]))
        c = d
for e in elevators:
    svg.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#f4ecff" stroke="#8a3fd1" stroke-dasharray="6 4"/>' % (X(e['x'][0]), Z(e['z'][0]), (e['x'][1] - e['x'][0]) * S, (e['z'][1] - e['z'][0]) * S))
    svg.append('<text x="%.1f" y="%.1f" fill="#8a3fd1">elevator %d</text>' % (X(e['x'][0]) + 4, Z(e['z'][0] if e['stbd'] else e['z'][1]) + (14 if e['stbd'] else -6), e['k']))


def plane(s, fill, label):
    pts = []
    fx, fz = s['fx'], s['fz']
    rx, rz = -fz, fx
    for u, v in ((8.6, 0), (6.5, 0.6), (2.5, 1.1), (-0.4, 1.3), (-0.4, HALF), (-4.0, HALF), (-4.0, 1.2), (-6.0, 1.2), (-6.0, 3.3), (-8.0, 3.3), (-8.5, 0.8),
                 (-8.5, -0.8), (-8.0, -3.3), (-6.0, -3.3), (-6.0, -1.2), (-4.0, -1.2), (-4.0, -HALF), (-0.4, -HALF), (-0.4, -1.3), (2.5, -1.1), (6.5, -0.6)):
        pts.append('%.1f,%.1f' % (X(s['x'] + fx * u + rx * v), Z(s['z'] + fz * u + rz * v)))
    svg.append('<polygon points="%s" fill="%s" fill-opacity="0.75" stroke="#223" stroke-width="1"/>' % (' '.join(pts), fill))
    svg.append('<text x="%.1f" y="%.1f" text-anchor="middle" fill="#fff" font-weight="600">%s</text>' % (X(s['x']), Z(s['z']) + 4, label))


for q in slots:
    plane(q, ['#2a7de1', '#1f9d55', '#c2410c', '#7c3aed'][q['el'] - 1], '%d: EL%d %d' % (q['n'], q['el'], q['seq']))
for e in elevators:
    for st in e['stations']:
        svg.append('<circle cx="%.1f" cy="%.1f" r="4" fill="none" stroke="#8a3fd1" stroke-width="2"/>' % (X(st['x']), Z(st['z'])))
for i, h in enumerate(homes):
    svg.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#f5c400" stroke="#223" transform="rotate(%.1f %.1f %.1f)"/>' % (
        X(h['x']) - 3.0 * S, Z(h['z']) - 0.9 * S, 4.8 * S, 1.8 * S, math.degrees(math.atan2(h['hz'], h['hx'])), X(h['x']), Z(h['z'])))
svg.append('<text x="10" y="%.1f" font-size="14" fill="#222">The hangar, fully packed: the user\'s plan (%d aircraft, numbered from the bow aft); yellow: where the four tractors wait; circles: the places on the platforms.</text>' % ((VZ1 - VZ0) * S - 12, len(slots)))
svg.append('</svg>')
open(os.path.join(HERE, 'hangar-parking.svg'), 'w', encoding='utf-8').write('\n'.join(svg))

print('the user\'s marks: %d outline(s), %.0f m2 of the map\'s free floor blocked' % (len(MARKED), MARKED_M2))
print('the solved tows: %s' % ('%d of %d aircraft' % (len(TOWS), len(slots)) if TOWS else 'NONE IN THE PLAN: ' + TOWS_WHY))
for h in homes:
    print('a tractor waits at %.1f fwd %.1f stbd: %.2f m from the nearest aircraft' % (h['x'], h['z'], tug_room(h)))
print('spare places to wait at: %s' % ', '.join('%.1f / %.1f' % (h['x'], h['z']) for h in rest))
print('(where a tractor fits along the side walls, by the rule: %s)' % ', '.join('%.1f / %.1f' % (h['x'], h['z']) for h in scan))
print('%d places in the hangar (the user\'s plan):' % len(slots))
for q in slots:
    g = q.get('gap')
    print('  %2d  %7.2f fwd %6.2f stbd, heading %5.1f%s%s' % (q['n'], q['x'], q['z'], q['hdg'],
          (';  nearest: %.2f m from %d' % (g[0], g[1])) if g else '',
          (';  over something high %d cells, low / no floor %d (of 4 cm2 x 100)' % (q['high'], q['low'])) if q['high'] or q['low'] else ''))
for e in elevators:
    print('elevator %d: doorway %.1f .. %.1f; on the platform at %s' % (e['k'], e['open'][0], e['open'][1], ' and '.join(
        '%.2f / %.2f%s' % (q['x'], q['z'], (' (%s, %.2f m along the ship from it)' % (q['spot'], q['off'])) if q.get('spot') else '') for q in e['stations'])))
print('written:', os.path.normpath(OUT), 'and hangar-parking.svg')
