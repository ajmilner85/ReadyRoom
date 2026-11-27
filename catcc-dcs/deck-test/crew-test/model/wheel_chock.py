"""The US Navy's universal wheel chock (NWC-4): two blocks on a bar, their spacing on one model argument.

    python -I wheel_chock.py              writes into ../Mods/tech/CATCC-Crew, and model/out (OBJ, pictures)
    python -I wheel_chock.py <out dir>    writes the DCS files only, into <out dir> (the tests do this)

DCS files (a version 10 .edm written by edm.py with towbar.py's mesh, tangent-frame and node helpers; the textures
beside the models, as the tow bar's are):
    Shapes/CATCC_WheelChock.edm                         the chock
    Shapes/textures/catcc_wheelchock_diff.dds           colours (BC1)
    Shapes/textures/catcc_wheelchock_nm.dds             normal map (BC5: red along the texture's width, green DOWN
                                                        it, as DCS's own and Heatblur's normal maps have it)
    Shapes/textures/catcc_wheelchock_diff_roughmet.dds  ambient occlusion (red), roughness (green), metalness (blue) (BC1)

LIGHT: some 530 triangles. What is smaller than a bolt (the blocks' pads and ribs, the bar's ratchet teeth, the holes,
the rounded edges of the mouldings) is in the textures and the normal map; the bolts, nuts, washers, the release
pin and its wire rope loop are modelled.

THE REFERENCES (the user, 2026-11-24): US patent 3,189,127 "Universal wheel chock" (Karnow and Hutchins for the US Navy,
1965: carrier-ops-handoff-2/US3189127.pdf) and six photographs (chocks carried and stood on carrier decks, and a 1/48
model kit's render, which is for shape only). What each gave:
  the build    (patent) two blocks of uniform hexagonal section: a wide outer plate, top and bottom faces (either can be
               the deck side: the chock is the same upside down), 45 degree wheel-bearing plates and a narrow plate
               facing the tyre; a square steel tube through both near one end of each, ratchet teeth along one side;
               one block fixed to the tube's end, the other sliding, held by a spring pawl on the teeth that a pull
               cord lifts; a stop and bolt at the tube's other end
  the section  (patent fig. 1, measured on the scan: 323 x 302 px, chamfers 90 px at 45 degrees) height 1.07 x depth,
               chamfers 0.3 x depth; (photographs) the blocks twice as long as deep
  the size     no published figures. Measured on the photographs against what is in them: the sailor's goggles and
               cranial helmet (photo 5), a shoe (photo 4) and boots (photo 1) make the blocks 0.25 to 0.35 m long; in
               photo 2 one sailor carries four or five chocks on a shoulder. (Heatblur's F-14 has bigger ones: blocks
               0.43 x 0.20 x 0.18 m on a 1.47 m bar, read from its F-14A-135-GR_lod1.edm.)
  the blocks   (photographs) moulded orange polyurethane: raised pads in a hexagonal pattern on the top and bottom
               faces (pointed along the block, 20 x 24 mm, 25 mm apart across, rows 23 mm apart), ribs along the
               chamfers and the tyre-side plate, a rectangular pocket in the end by the bar, a round hole in the
               other end, a drain hole in a raised ring on the top face by the bar, black tyre rubber on the tyre side
  the bar      (photographs) about 1.6 in square, yellow (photos 1, 2 and 4: BAR_PAINT; photos 5 and 6 have it orange),
               the ratchet teeth on its side away from the tyre (5 mm), bolted to the fixed block, a square stop plate
               and a bolt at its tail; the sliding block's release pin on its end face, with a wire rope loop
  colours      sampled from the photographs (the median of the paint's own pixels): the blocks' orange has green / red
               0.63 to 0.70 and blue / red about 0.30 in every one; the bar's yellow green / red 0.88 (photo 4)

THE MODEL'S FRAME: x along the bar (the fixed block forward), y up, z across (the bar on the +z side); metres. The origin
is the CENTRE POINT: on the deck, midway between the blocks' tyre-side plates; across, in the middle of the span between
the bar's tyre-side face and the blocks' far ends, which is where the tyre stands (SPAN, 0.2135 m: a wider tyre needs the
chock moved away from the bar by half the difference).

ONE MODEL ARGUMENT, CHOCK_ARG (10): the spacing. Its value is how far each block's tyre-side plate is from the centre
point, in metres: from S_MIN (0.012: the bolt in front of the fixed block stops the sliding one) to S_MAX (0.36, the
widest the bar allows); above S_MAX it holds S_MAX. At 0 and below (an argument nothing has written: each PC's own) it
is REST, a parked Hornet's fit; between 0 and S_MIN it passes from REST to S_MIN (nothing writes such a value).
The fixed block with the bar, its bolts and stop plate moves forward by the value (an ArgPositionNode), the sliding block
with its pin and loop back by it (another). spacing(r) is the value at which both blocks touch a tyre of radius r
standing on the deck: printed for the F/A-18C's wheels.
"""
import math
import os
import struct
import sys
from array import array

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edm  # noqa: E402
import towbar as tb  # noqa: E402  (its Mesh, tangent frames, nodes, EDM file layout, PNG writer)

HERE = os.path.dirname(os.path.abspath(__file__))
SQ2 = math.sqrt(2.0)

# ---------------------------------------------------------------- dimensions (metres)
L = 0.300            # a block's length, across the tyre (the model's z)
D = 0.145            # its depth along the bar (x): the tyre-side plate to the outer plate
H = 0.150            # its height (y)
C = 0.040            # the 45 degree wheel-bearing plates between the top / bottom faces and the tyre-side plate
BAR = 0.041          # the bar: square steel tube
BAR_E = 0.066        # the bar's centre line from the blocks' bar ends
S_MAX = 0.360        # the widest setting: each tyre-side plate this far from the centre point (0.72 m apart)
S_MIN = 0.012        # the closest: the bolt in front of the fixed block stops the sliding block
# the spacing with the argument untouched (0): a parked static Hornet's fit (its axle 0.305 m up: struts 0.778, standing
# 22.005 m above the ship's origin, measured in DCS 2026-11-26; crewtest_chocks.lua C.wheelAt). Model arguments are each
# PC's own: a multiplayer client that cannot set ours (its server does not allow object export) shows this, where a
# chock left at S_MIN sat closed inside the tyre (the user's two-PC run, 2026-11-26: "in the fully closed state")
REST = 0.338
TAIL_MIN = 0.030     # the bar's end beyond the sliding block's outer plate at the widest setting
BOSS, BOSS_T = 0.070, 0.014   # the fixed block's boss round the bar's end on its outer plate: side, height
STUB = 0.003         # the bar's end out of the boss
PLATE, PLATE_T = 0.055, 0.006  # the stop plate at the bar's tail: side, thickness
COLLAR, COLLAR_T = (0.070, 0.064), 0.004  # the steel plate round the bar on the sliding block's outer plate: z, y; thickness
PK_X0, PK_X1 = 0.012, 0.105   # the pocket in a block's bar end: from the tyre-side plate
PK_H, PK_D = 0.068, 0.030     # ... its height (centred) and depth
HOLE_R = 0.026       # the round hole in a block's far end
PIN_X = 0.125        # the release pin on the sliding block's bar end, from its tyre-side plate
SPAN = L - BAR_E - BAR / 2
Z_FAR = -SPAN / 2
Z_END = Z_FAR + L
Z_BAR = Z_END - BAR_E
Y_BAR = H / 2
X_END = D + BOSS_T + STUB              # the bar's end at the fixed block (built closed: both tyre-side plates at x = 0)
X_TAIL = -(D + 2 * S_MAX + TAIL_MIN)   # its tail
BAR_LEN = X_END - X_TAIL
CHOCK_ARG = 10
BAR_PAINT = 'yellow'                   # or 'orange' (photos 5 and 6)
NORMAL_VALUE = 1.0                     # the material's normalMapValue (the normal map at full strength)
NAMES = ('catcc_wheelchock_diff', 'catcc_wheelchock_nm', 'catcc_wheelchock_diff_roughmet')


def spacing(r):
    """the argument for a tyre of radius r (m) standing on the deck with its axle over the centre point: how far each
    tyre-side plate is from it when the block touches the tyre"""
    lo = H - C                          # the tyre-side plate's top edge
    t = r * (1 - math.sqrt(0.5))        # where the tyre's surface slopes at 45 degrees
    if r <= lo:
        return r                        # (a small wheel: its widest point is against the plate)
    if t < lo:
        return math.sqrt(r * r - (r - lo) ** 2)      # it bears on the plate's top edge
    if t <= H:
        return lo + r * (SQ2 - 1)                    # on the wheel-bearing plate
    return math.sqrt(r * r - (r - H) ** 2) - C       # on the top face's edge


# ---------------------------------------------------------------- the texture atlas: one region per face kind, in
# millimetres on the face and pixels per millimetre along (a) and across (b); packed into 1024 x 1024
W = 1024
PADPX = 4


class Region:
    def __init__(self, name, w_mm, h_mm, da, db=None):
        self.name, self.w, self.h, self.da, self.db = name, w_mm, h_mm, da, (db or da)
        self.wp, self.hp = int(math.ceil(w_mm * self.da)), int(math.ceil(h_mm * self.db))
        self.x0 = self.y0 = 0

    def uv(self, a, b):
        return ((self.x0 + a * self.da) / W, (self.y0 + b * self.db) / W)


NOSE_W = 2 * C * SQ2 * 1000 + (H - 2 * C) * 1000   # the tyre-side strip: lower plate, tyre-side plate, upper plate
BANDS = (C * SQ2 * 1000, C * SQ2 * 1000 + (H - 2 * C) * 1000)  # where the strip folds
PK_W = (PK_X1 - PK_X0) * 1000
REGIONS = [
    Region('top_F', L * 1000, (D - C) * 1000, 1.5), Region('top_M', L * 1000, (D - C) * 1000, 1.5),
    Region('nose_F', L * 1000, NOSE_W, 1.1), Region('nose_M', L * 1000, NOSE_W, 1.1),
    Region('outer_F', L * 1000, H * 1000, 0.85), Region('outer_M', L * 1000, H * 1000, 0.85),
    Region('endbar_F', D * 1000, H * 1000, 1.1), Region('endbar_M', D * 1000, H * 1000, 1.1),
    Region('endfar_F', D * 1000, H * 1000, 1.1), Region('endfar_M', D * 1000, H * 1000, 1.1),
    Region('pocket', PK_W + 2 * PK_D * 1000, PK_H * 1000 + 2 * PK_D * 1000, 0.8),
    Region('boss', BOSS * 1000, BOSS * 1000 + 4 * BOSS_T * 1000, 1.2),
    Region('rack1', BAR_LEN * 500, BAR * 1000, 1.5), Region('rack2', BAR_LEN * 500, BAR * 1000, 1.5),
    Region('bar_top', BAR_LEN * 1000, BAR * 1000, 0.85, 1.1), Region('bar_bot', BAR_LEN * 1000, BAR * 1000, 0.85, 1.1),
    Region('bar_in', BAR_LEN * 1000, BAR * 1000, 0.85, 1.1),
    Region('barend', BAR * 1000, BAR * 1000, 2.0),
    Region('plate', PLATE * 1000, PLATE * 1000 + 4 * PLATE_T * 1000, 1.5),
    Region('collar', COLLAR[0] * 1000, COLLAR[1] * 1000 + 4 * COLLAR_T * 1000, 1.2),
    Region('zinc', 32, 32, 1.5), Region('cable', 64, 24, 1.0), Region('crimp', 24, 24, 1.3),
]
R = {r.name: r for r in REGIONS}


def pack():
    """first fit, tallest first, on shelves"""
    shelves = []  # [y, height, x used]
    for r in sorted(REGIONS, key=lambda q: (-(q.hp + 2 * PADPX), q.name)):
        w, h = r.wp + 2 * PADPX, r.hp + 2 * PADPX
        for s in shelves:
            if h <= s[1] and s[2] + w <= W:
                r.x0, r.y0 = s[2] + PADPX, s[0] + PADPX
                s[2] += w
                break
        else:
            y = shelves[-1][0] + shelves[-1][1] if shelves else 0
            if y + h > W or w > W:
                raise ValueError('the atlas is full at ' + r.name)
            shelves.append([y, h, w])
            r.x0, r.y0 = PADPX, y + PADPX
    return shelves[-1][0] + shelves[-1][1]


ATLAS_USED = pack()

# ---------------------------------------------------------------- paints (sRGB) and wear
ORANGE = (204, 128, 58)       # the blocks: moulded polyurethane
ORANGE_LIGHT = (218, 150, 84)
DIRT = (88, 72, 54)
RUBBER = (36, 34, 33)
PAINTS = {'yellow': (216, 170, 46), 'orange': (202, 116, 44)}
BARE = (128, 126, 122)
RUST = (118, 74, 46)
ZINC = (168, 170, 172)
DARK = (30, 22, 17)


def mix(c, d, t):
    return (c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t)


def mul3(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)


def sstep(t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)


# value noise: a 256 x 256 table of tow-bar noise, read bilinearly (wrapping)
NN = 256
_NT = array('f', [tb.noise(x * 7 + 3, y * 13 + 5) for y in range(NN) for x in range(NN)])


def vn(x, y):
    """smooth noise 0..1, one cell per unit"""
    xf, yf = math.floor(x), math.floor(y)
    fx, fy = x - xf, y - yf
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    xi, yi = int(xf) & 255, int(yf) & 255
    x1, y1 = (xi + 1) & 255, (yi + 1) & 255
    r0, r1 = yi * NN, y1 * NN
    a = _NT[r0 + xi] + (_NT[r0 + x1] - _NT[r0 + xi]) * fx
    b = _NT[r1 + xi] + (_NT[r1 + x1] - _NT[r1 + xi]) * fx
    return a + (b - a) * fy


def grain(a, b, seed):
    return tb.noise(int(a * 3.0) + seed * 101, int(b * 3.0) + seed * 37)


def edge_fall(d, w, k):
    """the height (mm, at most 0) by a convex edge: d from the edge (mm), w the rounding's width, k the slope at it"""
    if d >= w:
        return 0.0
    if d < 0:
        d = 0.0
    return -k * (w - d) * (w - d) / (2.0 * w)


def scratches(seed, w_mm, h_mm, count, along, ln=(6.0, 30.0)):
    """{(a, b) at 0.5 mm: strength} of thin straight marks on a face (along: mostly lengthwise)"""
    out = {}
    for k in range(count):
        r = lambda j: tb.noise(seed * 31 + k * 17 + j, seed * 7 + k * 101 + j * 13)
        a, b = r(1) * w_mm, r(2) * h_mm
        ang = (r(3) - 0.5) * 0.3 if along else r(3) * math.pi
        n = ln[0] + r(4) * (ln[1] - ln[0])
        s = 0.4 + 0.6 * r(5)
        ca, sb = math.cos(ang), math.sin(ang)
        t = 0.0
        while t < n:
            key = (int((a + ca * t) * 2), int((b + sb * t) * 2))
            out[key] = max(out.get(key, 0.0), s * min(1.0, t / 2.0, (n - t) / 2.0))
            t += 0.4
    return out


# ---------------------------------------------------------------- what is on each face. A face's function gives, at
# (a, b) mm on it: height (mm), colour, ambient occlusion, roughness, metalness (0..1)
# a pad: a rounded diamond, pointed along the block: its core (half length to the point, half width, half length of
# its flat sides) grown by the rounding: 24 x 20 mm over all
PAD_H, PAD_BEV, PAD_CA, PAD_CB, PAD_FLAT, PAD_RC = 1.6, 1.5, 7.5, 5.5, 2.0, 4.5
ROW_P, COL_P = 23.0, 25.0
FIELD = (10.0, 292.0, 3.0, 100.0)       # the pads' field on a top face: a from .. to (along), b from .. to (across)
DRAIN = (26.0, 17.0)                    # the drain hole's ring: from the bar end, from the wheel-bearing plate's edge
_n2 = math.hypot(PAD_CB, PAD_CA - PAD_FLAT)
N2A, N2B = PAD_CB / _n2, (PAD_CA - PAD_FLAT) / _n2


def _seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return math.hypot(px - ax - dx * t, py - ay - dy * t)


def pad_sdf(a, b):
    """signed distance (mm) to a pad centred on the origin, pointed along a"""
    x, y = abs(a), abs(b)
    d1 = y - PAD_CB
    d2 = (x - PAD_CA) * N2A + y * N2B
    if d1 <= 0 and d2 <= 0:
        return max(d1, d2) - PAD_RC
    s1 = abs(y - PAD_CB) if x <= PAD_FLAT else math.hypot(x - PAD_FLAT, y - PAD_CB)
    return min(s1, _seg(x, y, PAD_FLAT, PAD_CB, PAD_CA, 0.0)) - PAD_RC


def pads_height(a, b):
    """the pads' height at (a, b) on a top face, and how far into the drain ring (or None)"""
    fa0, fa1, fb0, fb1 = FIELD
    field = max(fa0 - a, a - fa1, fb0 - b, b - fb1)
    dr = math.hypot(a - DRAIN[0], b - DRAIN[1])
    j0 = math.floor((a - fa0 - 12.0) / ROW_P)
    best = 1e9
    for j in (j0, j0 + 1):
        ca = fa0 + 12.0 + j * ROW_P
        off = (COL_P / 2) if (j & 1) else 0.0
        k = round((b - fb0 - 10.0 - off) / COL_P)
        cb = fb0 + 10.0 + off + k * COL_P
        d = pad_sdf(a - ca, b - cb)
        if d < best:
            best = d
    s = max(best, field, 12.5 - dr)     # (no pad on the drain ring)
    h = PAD_H * sstep(-s / PAD_BEV)
    if dr < 8.5 + PAD_BEV:              # the drain ring and its hole
        h = max(h, PAD_H * sstep((8.5 - dr) / PAD_BEV + 1.0))
        if dr < 5.5:
            h = PAD_H - 4.6 * sstep((5.5 - dr) / 1.0)
    return h, dr


def face_pads(seed, rubber):
    """the top (and bottom) faces: pads, the drain ring, the rounded edges; worn, dirty in the grooves; tyre rubber
    by the wheel-bearing plate"""
    sc = scratches(seed, L * 1000, (D - C) * 1000, 26, True, (8.0, 40.0))

    def f(a, b):
        h, dr = pads_height(a, b)
        h += edge_fall(a, 4.0, 1.0) + edge_fall(L * 1000 - a, 4.0, 1.0) + edge_fall(b, 3.0, 0.414) + edge_fall((D - C) * 1000 - b, 4.0, 1.0)
        top = max(0.0, min(1.0, h / PAD_H))
        mot = 0.94 + 0.08 * vn(a / 22.0 + seed, b / 22.0) + 0.03 * (grain(a, b, seed) - 0.5)
        col = mul3(mix(ORANGE, ORANGE_LIGHT, 0.18 * top), mot * (0.92 + 0.08 * top))
        dirt = (1.0 - top) * (0.16 + 0.30 * vn(a / 9.0, b / 9.0 + seed * 3))
        col = mix(col, DIRT, dirt)
        ao = 0.80 + 0.20 * top
        ro = 0.80 - 0.20 * top + 0.06 * vn(a / 15.0 + 40, b / 15.0)
        if dr < 5.5:  # the drain hole
            t = sstep((5.5 - dr) / 1.0)
            col, ao, ro = mix(col, DARK, t), ao * (1 - 0.7 * t), ro
        if rubber:  # tyre rubber: thin streaks by the edge the tyre bears on, beyond the bar
            m = vn(a / 28.0 + seed * 5, b / 2.5) * sstep((9.0 - b) / 6.0) * sstep((a - 95.0) / 30.0)
            if m > 0.42:
                t = min(1.0, (m - 0.42) / 0.2) * 0.6
                col, ro = mix(col, RUBBER, t), ro + (0.9 - ro) * t
        s = sc.get((int(a * 2), int(b * 2)))
        if s and top > 0.6:  # scuffs on the pads' tops: lighter
            col = mix(col, (226, 172, 120), 0.5 * s)
        return h, col, ao, ro, 0.0
    return f


def face_nose(seed):
    """the tyre side: the lower wheel-bearing plate, the tyre-side plate, the upper wheel-bearing plate; ribbed
    along the block, black with tyre rubber where the tyre bears"""
    b1, b2 = BANDS
    bands = ((0.0, b1, 6), (b1, b2, 7), (b2, NOSE_W, 6))

    def f(a, b):
        for b0, bb, n in bands:
            if b <= bb or bb == NOSE_W:
                break
        p = (bb - b0) / n
        t = (b - b0) / p
        d = abs(t - math.floor(t) - 0.5) * p          # from the rib's middle
        rw = 0.31 * p
        h = 1.0 * sstep((rw - d) / 1.2 + 0.5) * sstep((min(a - 7.0, L * 1000 - 7.0 - a)) / 1.5)
        h += (edge_fall(a, 4.0, 1.0) + edge_fall(L * 1000 - a, 4.0, 1.0) + edge_fall(b, 3.0, 0.414) + edge_fall(NOSE_W - b, 3.0, 0.414)
              + edge_fall(abs(b - b1), 2.5, 0.414) + edge_fall(abs(b - b2), 2.5, 0.414))
        rib = max(0.0, min(1.0, h))
        mot = 0.93 + 0.10 * vn(a / 20.0 + seed, b / 20.0 + 7) + 0.04 * (grain(a, b, seed) - 0.5)
        col = mul3(mix(ORANGE, ORANGE_LIGHT, 0.3 * rib), mot * (0.86 + 0.14 * rib))
        col = mix(col, DIRT, (1.0 - rib) * (0.25 + 0.3 * vn(a / 8.0, b / 8.0 + seed)))
        ao, ro = 0.80 + 0.20 * rib, 0.78 - 0.16 * rib
        # tyre rubber: streaks along the block where the tyre bears (the tyre-side plate's top edge and the upper
        # plate), beyond the bar
        zone = sstep((a - 95.0) / 25.0) * sstep(1.0 - abs(b - b2 - 6.0) / 24.0)
        m = (0.6 * vn(a / 40.0 + seed * 9, b / 4.0) + 0.4 * vn(a / 9.0, b / 2.5 + seed)) * zone
        if m > 0.40:
            t = min(1.0, (m - 0.40) / 0.2) * (0.75 if rib > 0.5 else 0.55)
            col, ro = mix(col, RUBBER, t), ro + (0.9 - ro) * t
        return h, col, ao, ro, 0.0
    return f


def face_outer(seed):
    """the outer plate: plain, scuffed, dirtier towards the deck"""
    sc = scratches(seed, L * 1000, H * 1000, 30, False, (5.0, 25.0))

    def f(a, b):
        h = edge_fall(a, 4.0, 1.0) + edge_fall(L * 1000 - a, 4.0, 1.0) + edge_fall(b, 4.0, 1.0) + edge_fall(H * 1000 - b, 4.0, 1.0)
        mot = 0.92 + 0.11 * vn(a / 26.0 + seed, b / 26.0 + 3) + 0.04 * (grain(a, b, seed) - 0.5)
        col = mul3(ORANGE, mot)
        deck = sstep((b - 105.0) / 45.0)
        col = mix(col, DIRT, deck * (0.25 + 0.3 * vn(a / 10.0, b / 6.0 + seed)) + 0.12 * vn(a / 40.0 + 9, b / 40.0))
        ao, ro = 1.0, 0.70 + 0.1 * deck
        s = sc.get((int(a * 2), int(b * 2)))
        if s:
            col = mix(col, (230, 180, 128), 0.55 * s)
        if h < -0.3:  # the edges rubbed light
            col = mix(col, ORANGE_LIGHT, 0.4)
        return h, col, ao, ro, 0.0
    return f


HEX = ((0.0, (H - C) * 1000), (C * 1000, H * 1000), (D * 1000, H * 1000), (D * 1000, 0.0), (C * 1000, 0.0), (0.0, C * 1000))


def hex_inside(a, b):
    """how far inside a block's end outline (a from the tyre side, b down from the top) a point is (mm)"""
    best = 1e9
    for i in range(6):
        ax, ay = HEX[i]
        bx, by = HEX[(i + 1) % 6]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy)
        d = ((a - ax) * dy - (b - ay) * dx) / n   # (positive inside: the outline runs clockwise in a, b)
        if d < best:
            best = d
    return best


def face_end(seed, pocket):
    """a block's end: the pocket's lip (bar end) or the round hole (far end); rounded edges; deck dirt"""
    pa0, pa1 = PK_X0 * 1000, PK_X1 * 1000
    pb0, pb1 = (H - PK_H) / 2 * 1000, (H + PK_H) / 2 * 1000
    ha, hb, hr = 80.0, H * 500, HOLE_R * 1000
    sc = scratches(seed, D * 1000, H * 1000, 14, False, (4.0, 18.0))

    def f(a, b):
        d = hex_inside(a, b)
        h = edge_fall(d, 4.0, 1.0)
        col = mul3(ORANGE, 0.92 + 0.10 * vn(a / 24.0 + seed, b / 24.0) + 0.04 * (grain(a, b, seed) - 0.5))
        ao, ro = 1.0, 0.72
        if pocket:
            out = max(pa0 - a, a - pa1, pb0 - b, b - pb1)
            h += edge_fall(max(out, 0.0), 2.5, 1.0)
            col = mix(col, DIRT, 0.45 * sstep((6.0 - out) / 6.0))
            ao = 1.0 - 0.15 * sstep((6.0 - out) / 6.0)
        else:
            dr = math.hypot(a - ha, b - hb) - hr
            if dr < 0:
                t = sstep(-dr / 4.0)
                h = -8.0 * t + edge_fall(0.0, 3.0, 1.0) * (1 - t)
                col, ao, ro = mix(col, DARK, 0.5 + 0.5 * t), 1.0 - 0.75 * t, 0.85
            else:
                h += edge_fall(dr, 3.0, 1.0)
                col = mix(col, DIRT, 0.35 * sstep((5.0 - dr) / 5.0))
        col = mix(col, DIRT, sstep((b - 115.0) / 35.0) * (0.2 + 0.3 * vn(a / 8.0 + seed, b / 8.0)))
        s = sc.get((int(a * 2), int(b * 2)))
        if s:
            col = mix(col, (230, 180, 128), 0.5 * s)
        return h, col, ao, ro, 0.0
    return f


def face_pocket():
    """inside the pocket: its four walls round its bottom (a cross); dark towards the bottom and its corners"""
    pw, ph, pd = PK_W, PK_H * 1000, PK_D * 1000

    def f(a, b):
        u, v = a - pd, b - pd
        if 0 <= u <= pw and 0 <= v <= ph:      # the bottom
            e = min(u, pw - u, v, ph - v)
            ao = 0.38 + 0.22 * sstep(e / 15.0)
        else:                                  # a wall: lighter towards its opening
            depth = max(-u, u - pw, -v, v - ph)
            ao = 0.85 - 0.40 * sstep(1.0 - depth / pd)
        col = mix(mul3(ORANGE, 0.80), DIRT, 0.35 + 0.3 * vn(a / 7.0, b / 7.0 + 11))
        return 0.0, col, ao, 0.85, 0.0
    return f


def face_boss():
    """the boss round the bar's end on the fixed block: its face, then its four sides"""
    def f(a, b):
        s = BOSS * 1000
        if b <= s:
            h = edge_fall(min(a, s - a, b, s - b), 3.0, 1.0)
        else:
            k = (b - s) % (BOSS_T * 1000)
            h = edge_fall(min(a, s - a), 3.0, 1.0) + edge_fall(k, 3.0, 1.0)
        col = mul3(ORANGE, 0.90 + 0.10 * vn(a / 14.0 + 5, b / 14.0))
        if h < -0.2:
            col = mix(col, ORANGE_LIGHT, 0.4)
        return h, col, 1.0, 0.70, 0.0
    return f


TEETH0, TEETH1 = (X_END - 0.0) * 1000, (X_END - X_TAIL - 0.036) * 1000   # where the ratchet teeth are (a along the bar)


def face_bar(seed, w_mm, teeth=0.0, a_off=0.0, ends=True):
    """a side of the bar: paint worn at the tube's corners, scratched along, grimy; (teeth) the ratchet teeth, their tops
    worn to the steel"""
    paint = PAINTS[BAR_PAINT]
    sc = scratches(seed, w_mm, BAR * 1000, int(w_mm / 14), True, (10.0, 70.0))

    def f(a, b):
        ag = a + a_off
        e = min(b, BAR * 1000 - b)
        h = edge_fall(e, 2.5, 1.0)
        if ends:
            h += edge_fall(ag, 1.0, 1.0)
        tooth = 0.0
        if teeth and TEETH0 <= ag <= TEETH1 and 3.0 < b < BAR * 1000 - 3.0:
            t = (ag / 5.0) % 1.0
            tooth = (t / 0.78) if t < 0.78 else (1.0 - (t - 0.78) / 0.22)
            tooth *= sstep((min(b, BAR * 1000 - b) - 3.0) / 1.5) * sstep((min(ag - TEETH0, TEETH1 - ag)) / 3.0)
            h += 1.3 * tooth - 0.6
        col = mul3(paint, 0.93 + 0.08 * vn(ag / 30.0 + seed, b / 12.0) + 0.04 * (grain(ag, b, seed) - 0.5))
        ro, me, ao = 0.46, 0.0, 1.0
        chip = (vn(ag / 6.0 + seed * 3, b / 4.0) - 0.62) * 9.0
        if e < chip:  # chipped at the corners
            bare = BARE if vn(ag / 6.0, b / 6.0 + seed) < 0.72 else RUST
            col, ro, me = bare, 0.45, (0.75 if bare is BARE else 0.1)
        if teeth and tooth:
            col = mix(col, (70, 62, 50), (1.0 - tooth) * 0.65)   # grease and grime between the teeth
            ao = 0.72 + 0.28 * tooth
            if tooth > 0.85 and vn(ag / 2.0, b / 4.0 + seed) > 0.35:
                col, ro, me = mix(col, BARE, 0.75), 0.40, 0.6     # their tops worn bright
        s = sc.get((int(a * 2), int(b * 2)))
        if s:
            col = mix(col, BARE, 0.6 * s) if s > 0.75 else mix(col, (240, 214, 150), 0.4 * s)
        col = mix(col, DIRT, 0.06 + 0.12 * vn(ag / 25.0 + 30, b / 8.0 + seed) + 0.25 * sstep((ag - 980.0) / 60.0))
        return h, col, ao, ro, me
    return f


def face_barend():
    """the bar's end at the fixed block: the tube's open end"""
    s, wall = BAR * 1000, 3.0

    def f(a, b):
        e = min(a, s - a, b, s - b)
        if e < wall:
            h = edge_fall(e, 1.0, 1.0)
            col = mix(PAINTS[BAR_PAINT], BARE, 0.6)
            return h, col, 1.0, 0.45, 0.5
        t = sstep((e - wall) / 1.5)
        return -10.0 * t, mix(BARE, DARK, t), 1.0 - 0.8 * t, 0.8, 0.2
    return f


def face_plate():
    """the stop plate at the bar's tail: its face, then its four edges; paint worn"""
    paint = PAINTS[BAR_PAINT]

    def f(a, b):
        s = PLATE * 1000
        if b <= s:
            e = min(a, s - a, b, s - b)
        else:
            e = min(a, s - a, (b - s) % (PLATE_T * 1000), PLATE_T * 1000 - (b - s) % (PLATE_T * 1000))
        h = edge_fall(e, 1.5, 1.0)
        col = mul3(paint, 0.92 + 0.1 * vn(a / 10.0, b / 10.0 + 50))
        ro, me = 0.48, 0.0
        if e < vn(a / 3.0 + 7, b / 3.0) * 4.0 - 1.6:
            col, ro, me = BARE, 0.45, 0.75
        col = mix(col, DIRT, 0.2 + 0.2 * vn(a / 6.0, b / 6.0 + 3))
        return h, col, 1.0, ro, me
    return f


def face_collar():
    """the steel plate round the bar on the sliding block: zinc plated, four screws, the bar's opening"""
    sw, sh = COLLAR[0] * 1000, COLLAR[1] * 1000
    screws = [(9.0, 9.0), (sw - 9.0, 9.0), (9.0, sh - 9.0), (sw - 9.0, sh - 9.0)]

    def f(a, b):
        if b <= sh:
            h = edge_fall(min(a, sw - a, b, sh - b), 1.5, 1.0)
            col, ao = mul3(ZINC, 0.86 + 0.12 * vn(a / 9.0 + 3, b / 9.0)), 1.0
            for sa, sb in screws:   # pan head screws, a slot across each
                r = math.hypot(a - sa, b - sb)
                if r < 4.6:
                    h += 1.6 * math.sqrt(max(0.0, 1.0 - (r / 4.6) ** 2))
                    if abs(b - sb) < 0.6:
                        h -= 0.8
                    col = mul3(ZINC, 0.95)
            gap = max(abs(a - sw / 2), abs(b - sh / 2)) - BAR * 500   # round the bar
            if gap < 2.0:
                col, ao = mix(col, DARK, sstep((2.0 - gap) / 2.0)), 0.5
        else:
            h = edge_fall(min(a, sw - a), 1.0, 1.0)
            col, ao = mul3(ZINC, 0.8), 1.0
        col = mix(col, DIRT, 0.15 + 0.2 * vn(a / 6.0 + 9, b / 6.0))
        return h, col, ao, 0.42, 0.85
    return f


def face_metal(c, rough, metal):
    def f(a, b):
        return 0.0, mul3(c, 0.88 + 0.12 * vn(a / 4.0 + 13, b / 4.0)), 1.0, rough, metal
    return f


def face_cable():
    """galvanised wire rope: strands across it at a slant (a along the rope, b round it)"""
    def f(a, b):
        t = ((a * 1.0 + b * 0.9) / 3.0) % 1.0
        h = 0.5 * math.sin(t * math.pi)
        return h, mul3((150, 153, 155), 0.8 + 0.3 * h), 0.85 + 0.3 * h, 0.5, 0.8
    return f


FACES = {
    'top_F': face_pads(1, True), 'top_M': face_pads(2, True), 'nose_F': face_nose(3), 'nose_M': face_nose(4),
    'outer_F': face_outer(5), 'outer_M': face_outer(6), 'endbar_F': face_end(7, True), 'endbar_M': face_end(8, True),
    'endfar_F': face_end(9, False), 'endfar_M': face_end(10, False), 'pocket': face_pocket(), 'boss': face_boss(),
    'rack1': face_bar(11, BAR_LEN * 500, teeth=1.0), 'rack2': face_bar(12, BAR_LEN * 500, teeth=1.0, a_off=BAR_LEN * 500, ends=False),
    'bar_top': face_bar(13, BAR_LEN * 1000), 'bar_bot': face_bar(14, BAR_LEN * 1000), 'bar_in': face_bar(15, BAR_LEN * 1000),
    'barend': face_barend(), 'plate': face_plate(), 'collar': face_collar(),
    'zinc': face_metal(ZINC, 0.36, 0.85), 'cable': face_cable(), 'crimp': face_metal((176, 178, 181), 0.42, 0.85),
}


def atlas():
    """the atlas's layers: colour (r, g, b), normal (x, y), ambient occlusion, roughness, metalness; bytes"""
    n = W * W
    hgt = array('f', bytes(4 * n))
    col = bytearray(bytes(ORANGE) * n)
    ao, ro, me = bytearray(b'\xff' * n), bytearray(b'\xb4' * n), bytearray(n)
    clamp = lambda v: 0 if v < 0 else (255 if v > 255 else int(v + 0.5))
    for r in REGIONS:
        f = FACES[r.name]
        for py in range(r.y0 - PADPX, r.y0 + r.hp + PADPX):
            b = (py + 0.5 - r.y0) / r.db
            b = 0.0 if b < 0 else (r.h if b > r.h else b)
            row = py * W
            for px in range(r.x0 - PADPX, r.x0 + r.wp + PADPX):
                a = (px + 0.5 - r.x0) / r.da
                a = 0.0 if a < 0 else (r.w if a > r.w else a)
                h, c, o, rr, m = f(a, b)
                i = row + px
                hgt[i] = h
                col[3 * i], col[3 * i + 1], col[3 * i + 2] = clamp(c[0]), clamp(c[1]), clamp(c[2])
                ao[i], ro[i], me[i] = clamp(o * 255), clamp(rr * 255), clamp(m * 255)
    # the normal map, from each region's heights (millimetres either way): DCS reads red along the texture's width
    # and green DOWN it, so a slope up to the right gives red below the middle and a slope up downwards green below it
    nx, ny = bytearray(b'\x80' * n), bytearray(b'\x80' * n)
    for r in REGIONS:
        xa, xb, ya, yb = r.x0 - PADPX, r.x0 + r.wp + PADPX - 1, r.y0 - PADPX, r.y0 + r.hp + PADPX - 1
        sx, sy = 2.0 / r.da, 2.0 / r.db
        for py in range(ya, yb + 1):
            up, dn = max(ya, py - 1) * W, min(yb, py + 1) * W
            row = py * W
            for px in range(xa, xb + 1):
                gx = (hgt[row + min(xb, px + 1)] - hgt[row + max(xa, px - 1)]) / sx
                gy = (hgt[dn + px] - hgt[up + px]) / sy
                k = 1.0 / math.sqrt(gx * gx + gy * gy + 1.0)
                nx[row + px] = clamp((-gx * k * 0.5 + 0.5) * 255)
                ny[row + px] = clamp((-gy * k * 0.5 + 0.5) * 255)
    return col, nx, ny, ao, ro, me


# ---------------------------------------------------------------- DDS: BC1 (colour, roughmet) and BC5 (normal map),
# with their mipmaps
def halve(chans, w):
    out = []
    n = w // 2
    for c in chans:
        o = bytearray(n * n)
        for y in range(n):
            r0, r1 = 2 * y * w, (2 * y + 1) * w
            for x in range(n):
                o[y * n + x] = (c[r0 + 2 * x] + c[r0 + 2 * x + 1] + c[r1 + 2 * x] + c[r1 + 2 * x + 1] + 2) >> 2
        out.append(o)
    return out, n


def _565(c):
    return (((int(c[0] + 0.5) * 31 + 127) // 255) << 11) | (((int(c[1] + 0.5) * 63 + 127) // 255) << 5) | ((int(c[2] + 0.5) * 31 + 127) // 255)


def _888(c):
    r, g, b = c >> 11, (c >> 5) & 63, c & 31
    return ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2))


def bc1_block(px):
    """16 (r, g, b): endpoints at the colour box's ends along its widest channel (the others turned by how they go with
    it), drawn in by a sixteenth; four colours"""
    ch = ([p[0] for p in px], [p[1] for p in px], [p[2] for p in px])
    ranges = [max(c) - min(c) for c in ch]
    m = ranges.index(max(ranges))
    mm = sum(ch[m]) / 16.0
    hi, lo = [0.0] * 3, [0.0] * 3
    for k in range(3):
        c = ch[k]
        mk = sum(c) / 16.0
        cov = sum((c[i] - mk) * (ch[m][i] - mm) for i in range(16))
        a, b = min(c), max(c)
        ins = (b - a) / 16.0
        a, b = a + ins, b - ins
        hi[k], lo[k] = (b, a) if cov >= 0 else (a, b)
    c0, c1 = _565(hi), _565(lo)
    if c0 < c1:
        c0, c1 = c1, c0
    if c0 == c1:
        return struct.pack('<HHI', c0, c1, 0)
    p0, p1 = _888(c0), _888(c1)
    d = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    dd = float(d[0] * d[0] + d[1] * d[1] + d[2] * d[2])
    bits = 0
    for i, p in enumerate(px):
        t = ((p[0] - p0[0]) * d[0] + (p[1] - p0[1]) * d[1] + (p[2] - p0[2]) * d[2]) / dd
        k = int(t * 3 + 0.5)
        k = 0 if k < 0 else (3 if k > 3 else k)
        bits |= (0, 2, 3, 1)[k] << (2 * i)
    return struct.pack('<HHI', c0, c1, bits)


def bc4_block(v):
    hi, lo = max(v), min(v)
    if hi == lo:
        return bytes((hi, lo, 0, 0, 0, 0, 0, 0))
    s = 7.0 / (hi - lo)
    bits = 0
    for i, x in enumerate(v):
        k = int((hi - x) * s + 0.5)
        bits |= (0 if k == 0 else (1 if k == 7 else k + 1)) << (3 * i)
    return bytes((hi, lo)) + bits.to_bytes(6, 'little')


def _blocks(chans, w, fn, nch):
    out = bytearray()
    bw = max(1, w // 4)
    for by in range(bw):
        for bx in range(bw):
            idx = [min(w - 1, by * 4 + j // 4) * w + min(w - 1, bx * 4 + j % 4) for j in range(16)]
            if nch == 3:
                out += fn([(chans[0][i], chans[1][i], chans[2][i]) for i in idx])
            else:
                for c in chans:
                    out += fn([c[i] for i in idx])
    return out


def dds(chans, kind):
    """kind 'bc1' (three channels) or 'bc5' (two)"""
    w, body, levels = W, bytearray(), 0
    four, bsz = (b'DXT1', 8) if kind == 'bc1' else (b'BC5U', 16)
    while True:
        body += _blocks(chans, w, bc1_block, 3) if kind == 'bc1' else _blocks(chans, w, bc4_block, 2)
        levels += 1
        if w == 1:
            break
        chans, w = halve(chans, w)
    hdr = b'DDS ' + struct.pack('<7I', 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000, W, W, (W // 4) * (W // 4) * bsz, 0, levels)
    hdr += b'\0' * 44
    hdr += struct.pack('<2I4s5I', 32, 0x4, four, 0, 0, 0, 0, 0)
    hdr += struct.pack('<5I', 0x1000 | 0x8 | 0x400000, 0, 0, 0, 0)
    return hdr + bytes(body)


# ---------------------------------------------------------------- the meshes
class Mesh(tb.Mesh):
    def poly(self, pts, n, reg, ab, tag=None):
        """a flat convex face: its corners, their places on the region (mm)"""
        ids = [self.vert(p, n, reg.uv(*q), tag or reg.name) for p, q in zip(pts, ab)]
        for i in range(1, len(ids) - 1):
            self.face(ids[0], ids[i], ids[i + 1], n)

    def prism(self, c, axis, r, ln, sides, reg, cap=True, phase=0.0):
        """`sides` flat sides round the unit axis from c to c + axis * ln (a cylinder, a hexagon head), its far end capped"""
        e1 = tb.unit(tb.cross(axis, tb.Y if abs(axis[1]) < 0.9 else tb.X))
        e2 = tb.cross(axis, e1)
        ring = []
        for i in range(sides + 1):
            t = phase + 2 * math.pi * i / sides
            ring.append(tb.comb((0, 0, 0), (e1, math.cos(t)), (e2, math.sin(t))))
        end = tb.comb(c, (axis, ln))
        for i in range(sides):
            n = tb.unit(tb.add(ring[i], ring[i + 1]))
            u0, u1 = reg.w * i / sides, reg.w * (i + 1) / sides
            self.poly([tb.comb(c, (ring[i], r)), tb.comb(c, (ring[i + 1], r)), tb.comb(end, (ring[i + 1], r)), tb.comb(end, (ring[i], r))],
                      n, reg, [(u0, 0.0), (u1, 0.0), (u1, reg.h), (u0, reg.h)])
        if cap:
            self.poly([tb.comb(end, (ring[i], r)) for i in range(sides)], axis, reg,
                      [(reg.w * (0.5 + 0.45 * math.cos(2 * math.pi * i / sides)), reg.h * (0.5 + 0.45 * math.sin(2 * math.pi * i / sides))) for i in range(sides)])

    def box(self, lo, hi, reg, skip=()):
        """an axis-aligned box from its region (each face the whole region)"""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        faces = {
            '+x': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            '-x': ([(x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (x0, y0, z0)], (-1, 0, 0)),
            '+y': ([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], (0, 1, 0)),
            '-y': ([(x0, y0, z1), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1)], (0, -1, 0)),
            '+z': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
            '-z': ([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], (0, 0, -1)),
        }
        for k, (pts, n) in faces.items():
            if k not in skip:
                self.poly(pts, n, reg, [(0, 0), (reg.w, 0), (reg.w, reg.h), (0, reg.h)])

    def loop(self, pts, r, sides, reg, plane_n):
        """a round tube of radius r along the closed path pts (in a plane with normal plane_n)"""
        n = len(pts)
        frames = []
        for i in range(n):
            t = tb.unit(tb.sub(pts[(i + 1) % n], pts[i - 1]))
            frames.append((plane_n, tb.unit(tb.cross(t, plane_n))))
        for i in range(n):
            j = (i + 1) % n
            for k in range(sides):
                ring = []
                for q in (k, k + 1):
                    ang = 2 * math.pi * q / sides
                    ring.append([tb.comb((0, 0, 0), (fr[0], math.cos(ang)), (fr[1], math.sin(ang))) for fr in (frames[i], frames[j])])
                (ni0, nj0), (ni1, nj1) = ring
                pts4 = [tb.comb(pts[i], (ni0, r)), tb.comb(pts[j], (nj0, r)), tb.comb(pts[j], (nj1, r)), tb.comb(pts[i], (ni1, r))]
                ab = [(reg.w * i / n, reg.h * k / sides), (reg.w * (i + 1) / n, reg.h * k / sides),
                      (reg.w * (i + 1) / n, reg.h * (k + 1) / sides), (reg.w * i / n, reg.h * (k + 1) / sides)]
                nrm = tb.unit(tb.add(tb.add(ni0, nj0), tb.add(ni1, nj1)))
                ids = [self.vert(pts4[q], tb.unit(tb.add((ni0, nj0, nj1, ni1)[q], nrm)), reg.uv(*ab[q]), reg.name) for q in range(4)]
                self.face(ids[0], ids[1], ids[2], nrm)
                self.face(ids[0], ids[2], ids[3], nrm)


def bolt(m, c, up):
    """a hex bolt through the bar, up or down from the point c on its face: washer, hexagon head (or nut and end)"""
    zr = R['zinc']
    m.prism(c, up, 0.0105, 0.0022, 10, zr)
    m.prism(tb.comb(c, (up, 0.0022)), up, 0.0094, 0.0068, 6, zr, phase=math.pi / 6)


def nut(m, c, up):
    zr = R['zinc']
    m.prism(c, up, 0.0105, 0.0022, 10, zr)
    m.prism(tb.comb(c, (up, 0.0022)), up, 0.0094, 0.0080, 6, zr, phase=math.pi / 6)
    m.prism(tb.comb(c, (up, 0.0102)), up, 0.0050, 0.0040, 8, zr)


def block(m, side, F):
    """a block, built closed (its tyre-side plate at x = 0): side +1 the fixed block (outer plate at +x), -1 the
    sliding one. Its section from the tyre side (xd, y): P0 (0, C), P1 (0, H - C), P2 (C, H), P3 (D, H), P4 (D, 0), P5 (C, 0)"""
    X = lambda xd: side * xd
    zE, zF = Z_END, Z_FAR
    A = lambda z: (Z_END - z) * 1000               # along the block from its bar end (mm)
    sec = [(0.0, C), (0.0, H - C), (C, H), (D, H), (D, 0.0), (C, 0.0)]
    top, nose, outer = R['top_' + F], R['nose_' + F], R['outer_' + F]
    b1, b2 = BANDS

    def side_face(i, j, reg, bi, bj, n):
        (xi, yi), (xj, yj) = sec[i], sec[j]
        m.poly([(X(xi), yi, zE), (X(xj), yj, zE), (X(xj), yj, zF), (X(xi), yi, zF)], n, reg,
               [(A(zE), bi), (A(zE), bj), (A(zF), bj), (A(zF), bi)])

    r2 = 1 / SQ2
    side_face(5, 0, nose, 0.0, b1, (-side * r2, -r2, 0.0))          # the lower wheel-bearing plate
    side_face(0, 1, nose, b1, b2, (-side, 0.0, 0.0))                # the tyre-side plate
    side_face(1, 2, nose, b2, NOSE_W, (-side * r2, r2, 0.0))        # the upper wheel-bearing plate
    side_face(2, 3, top, 0.0, (D - C) * 1000, (0.0, 1.0, 0.0))      # the top face
    side_face(4, 5, top, (D - C) * 1000, 0.0, (0.0, -1.0, 0.0))     # the bottom face (the same pads)
    side_face(3, 4, outer, 0.0, H * 1000, (side, 0.0, 0.0))         # the outer plate
    # the far end: the hexagon (with the round hole in its texture)
    far = R['endfar_' + F]
    m.poly([(X(x), y, zF) for x, y in sec], (0.0, 0.0, -1.0), far, [(x * 1000, (H - y) * 1000) for x, y in sec])
    # the bar end: round the pocket, four convex pieces; then the pocket's walls and bottom
    end, pk = R['endbar_' + F], R['pocket']
    y0, y1 = (H - PK_H) / 2, (H + PK_H) / 2
    q = {'P0': sec[0], 'P1': sec[1], 'P2': sec[2], 'P3': sec[3], 'P4': sec[4], 'P5': sec[5],
         'R00': (PK_X0, y0), 'R10': (PK_X1, y0), 'R11': (PK_X1, y1), 'R01': (PK_X0, y1)}
    for piece in (('P0', 'R00', 'R01', 'P1'), ('P1', 'R01', 'R11', 'P3', 'P2'), ('R11', 'R10', 'P4', 'P3'), ('P5', 'P4', 'R10', 'R00', 'P0')):
        m.poly([(X(q[k][0]), q[k][1], zE) for k in piece], (0.0, 0.0, 1.0), end, [(q[k][0] * 1000, (H - q[k][1]) * 1000) for k in piece])
    zb = zE - PK_D
    pd, pw, ph = PK_D * 1000, PK_W, PK_H * 1000
    m.poly([(X(PK_X0), y0, zb), (X(PK_X1), y0, zb), (X(PK_X1), y1, zb), (X(PK_X0), y1, zb)], (0.0, 0.0, 1.0), pk,
           [(pd, pd + ph), (pd + pw, pd + ph), (pd + pw, pd), (pd, pd)])
    m.poly([(X(PK_X0), y0, zE), (X(PK_X0), y1, zE), (X(PK_X0), y1, zb), (X(PK_X0), y0, zb)], (side, 0.0, 0.0), pk,
           [(0.0, pd + ph), (0.0, pd), (pd, pd), (pd, pd + ph)])
    m.poly([(X(PK_X1), y1, zE), (X(PK_X1), y0, zE), (X(PK_X1), y0, zb), (X(PK_X1), y1, zb)], (-side, 0.0, 0.0), pk,
           [(2 * pd + pw, pd), (2 * pd + pw, pd + ph), (pd + pw, pd + ph), (pd + pw, pd)])
    m.poly([(X(PK_X1), y0, zE), (X(PK_X0), y0, zE), (X(PK_X0), y0, zb), (X(PK_X1), y0, zb)], (0.0, 1.0, 0.0), pk,
           [(pd + pw, 2 * pd + ph), (pd, 2 * pd + ph), (pd, pd + ph), (pd + pw, pd + ph)])
    m.poly([(X(PK_X0), y1, zE), (X(PK_X1), y1, zE), (X(PK_X1), y1, zb), (X(PK_X0), y1, zb)], (0.0, -1.0, 0.0), pk,
           [(pd, 0.0), (pd + pw, 0.0), (pd + pw, pd), (pd, pd)])


def fixed_part():
    """the fixed block, the bar (its rack teeth on the +z side), the boss round its end, the bolt by the block, the
    stop plate and bolt at its tail"""
    m = Mesh()
    block(m, 1, 'F')
    y0, y1, z0, z1 = Y_BAR - BAR / 2, Y_BAR + BAR / 2, Z_BAR - BAR / 2, Z_BAR + BAR / 2
    xs = X_TAIL + PLATE_T                         # the bar runs into the stop plate
    a = lambda x: (X_END - x) * 1000
    m.poly([(X_END, y1, z0), (X_END, y1, z1), (xs, y1, z1), (xs, y1, z0)], (0, 1, 0), R['bar_top'],
           [(a(X_END), 0), (a(X_END), BAR * 1000), (a(xs), BAR * 1000), (a(xs), 0)])
    m.poly([(X_END, y0, z1), (X_END, y0, z0), (xs, y0, z0), (xs, y0, z1)], (0, -1, 0), R['bar_bot'],
           [(a(X_END), 0), (a(X_END), BAR * 1000), (a(xs), BAR * 1000), (a(xs), 0)])
    m.poly([(X_END, y0, z0), (X_END, y1, z0), (xs, y1, z0), (xs, y0, z0)], (0, 0, -1), R['bar_in'],
           [(a(X_END), BAR * 1000), (a(X_END), 0), (a(xs), 0), (a(xs), BAR * 1000)])
    xm = X_END - BAR_LEN / 2
    m.poly([(X_END, y1, z1), (X_END, y0, z1), (xm, y0, z1), (xm, y1, z1)], (0, 0, 1), R['rack1'],
           [(0.0, 0.0), (0.0, BAR * 1000), (BAR_LEN * 500, BAR * 1000), (BAR_LEN * 500, 0.0)])
    m.poly([(xm, y1, z1), (xm, y0, z1), (xs, y0, z1), (xs, y1, z1)], (0, 0, 1), R['rack2'],
           [(0.0, 0.0), (0.0, BAR * 1000), (a(xs) - BAR_LEN * 500, BAR * 1000), (a(xs) - BAR_LEN * 500, 0.0)])
    be = R['barend']
    m.poly([(X_END, y1, z1), (X_END, y1, z0), (X_END, y0, z0), (X_END, y0, z1)], (1, 0, 0), be,
           [(0, 0), (be.w, 0), (be.w, be.h), (0, be.h)])
    # the boss: its face, then its four sides on the region's strips
    bs, bx0, bx1 = BOSS / 2, D, D + BOSS_T
    bo = R['boss']
    s, t = BOSS * 1000, BOSS_T * 1000
    m.poly([(bx1, Y_BAR + bs, Z_BAR + bs), (bx1, Y_BAR + bs, Z_BAR - bs), (bx1, Y_BAR - bs, Z_BAR - bs), (bx1, Y_BAR - bs, Z_BAR + bs)], (1, 0, 0), bo,
           [(0, 0), (s, 0), (s, s), (0, s)])
    for k, (p0, p1, n) in enumerate((((Y_BAR + bs, Z_BAR + bs), (Y_BAR + bs, Z_BAR - bs), (0, 1, 0)), ((Y_BAR - bs, Z_BAR - bs), (Y_BAR - bs, Z_BAR + bs), (0, -1, 0)),
                                     ((Y_BAR - bs, Z_BAR + bs), (Y_BAR + bs, Z_BAR + bs), (0, 0, 1)), ((Y_BAR + bs, Z_BAR - bs), (Y_BAR - bs, Z_BAR - bs), (0, 0, -1)))):
        b0 = s + k * t
        m.poly([(bx1, p0[0], p0[1]), (bx1, p1[0], p1[1]), (bx0, p1[0], p1[1]), (bx0, p0[0], p0[1])], n, bo,
               [(0, b0), (s, b0), (s, b0 + t), (0, b0 + t)])
    # the bolt by the block (head up, nut under), the stop plate and its bolt
    bolt(m, (-0.012, y1, Z_BAR), (0, 1, 0))
    nut(m, (-0.012, y0, Z_BAR), (0, -1, 0))
    pl, ps, pt = R['plate'], PLATE * 1000, PLATE_T * 1000
    py0, py1, pz0, pz1 = Y_BAR - PLATE / 2, Y_BAR + PLATE / 2, Z_BAR - PLATE / 2, Z_BAR + PLATE / 2
    xa, xb = X_TAIL, X_TAIL + PLATE_T
    m.poly([(xa, py1, pz0), (xa, py1, pz1), (xa, py0, pz1), (xa, py0, pz0)], (-1, 0, 0), pl, [(0, 0), (ps, 0), (ps, ps), (0, ps)])
    m.poly([(xb, py1, pz1), (xb, py1, pz0), (xb, py0, pz0), (xb, py0, pz1)], (1, 0, 0), pl, [(0, 0), (ps, 0), (ps, ps), (0, ps)])
    for k, (p0, p1, n) in enumerate((((py1, pz0), (py1, pz1), (0, 1, 0)), ((py0, pz1), (py0, pz0), (0, -1, 0)),
                                     ((py1, pz1), (py0, pz1), (0, 0, 1)), ((py0, pz0), (py1, pz0), (0, 0, -1)))):
        b0 = ps + k * pt
        m.poly([(xa, p0[0], p0[1]), (xa, p1[0], p1[1]), (xb, p1[0], p1[1]), (xb, p0[0], p0[1])], n, pl,
               [(0, b0), (ps, b0), (ps, b0 + pt), (0, b0 + pt)])
    bolt(m, (X_TAIL + 0.024, y1, Z_BAR), (0, 1, 0))
    nut(m, (X_TAIL + 0.024, y0, Z_BAR), (0, -1, 0))
    return m


PIN = (-PIN_X, Y_BAR, Z_END)     # where the release pin leaves the sliding block's bar end


def loop_path():
    """the release pin's wire rope loop: from the pin's knob down and out to the deck"""
    top = (PIN[0], PIN[1], PIN[2] + 0.018)
    ln, wd = 0.095, 0.042
    th = math.asin(min(0.99, (top[1] - 0.0035) / ln))
    d = (0.0, -math.sin(th), math.cos(th))
    ctr = tb.comb(top, (d, ln / 2))
    pts = []
    for i in range(18):
        t = 2 * math.pi * i / 18
        pts.append(tb.comb(ctr, (d, -math.cos(t) * ln / 2), ((1.0, 0.0, 0.0), math.sin(t) * wd / 2)))
    return pts, tb.unit(tb.cross((1.0, 0.0, 0.0), d)), d, top


def moving_part():
    """the sliding block, the steel plate round the bar on its outer plate, the release pin with its loop"""
    m = Mesh()
    block(m, -1, 'M')
    cw, ch = COLLAR[0] / 2, COLLAR[1] / 2
    co, sw, sh, st = R['collar'], COLLAR[0] * 1000, COLLAR[1] * 1000, COLLAR_T * 1000
    x0, x1 = -D - COLLAR_T, -D
    m.poly([(x0, Y_BAR + ch, Z_BAR - cw), (x0, Y_BAR + ch, Z_BAR + cw), (x0, Y_BAR - ch, Z_BAR + cw), (x0, Y_BAR - ch, Z_BAR - cw)], (-1, 0, 0), co,
           [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    for k, (p0, p1, n) in enumerate((((Y_BAR + ch, Z_BAR - cw), (Y_BAR + ch, Z_BAR + cw), (0, 1, 0)), ((Y_BAR - ch, Z_BAR + cw), (Y_BAR - ch, Z_BAR - cw), (0, -1, 0)),
                                     ((Y_BAR + ch, Z_BAR + cw), (Y_BAR - ch, Z_BAR + cw), (0, 0, 1)), ((Y_BAR - ch, Z_BAR - cw), (Y_BAR + ch, Z_BAR - cw), (0, 0, -1)))):
        b0 = sh + k * st
        m.poly([(x0, p0[0], p0[1]), (x0, p1[0], p1[1]), (x1, p1[0], p1[1]), (x1, p0[0], p0[1])], n, co,
               [(0, b0), (sw, b0), (sw, b0 + st), (0, b0 + st)])
    zr = R['zinc']
    m.prism(PIN, (0.0, 0.0, 1.0), 0.0060, 0.012, 8, zr, cap=False)
    m.prism((PIN[0], PIN[1], PIN[2] + 0.012), (0.0, 0.0, 1.0), 0.0090, 0.006, 8, zr)
    pts, pn, d, top = loop_path()
    m.loop(pts, 0.0016, 4, R['cable'], pn)
    m.prism(tb.comb(top, (d, -0.002)), d, 0.0032, 0.012, 6, R['crimp'])
    return m


# ---------------------------------------------------------------- the EDM file
def keys(sign):
    """the argument's keys: the value is the spacing itself from S_MIN to S_MAX, held at S_MAX above; at 0 and below
    REST: the spacing a chock shows where nothing writes its argument (a static's arguments start at 0)"""
    return [[-1.0, sign * REST, 0.0, 0.0], [0.0, sign * REST, 0.0, 0.0], [S_MIN, sign * S_MIN, 0.0, 0.0],
            [S_MAX, sign * S_MAX, 0.0, 0.0], [1.0, sign * S_MAX, 0.0, 0.0]]


def chock_edm(fixed, moving):
    nodes = [tb.anim_node('model::ArgPositionNode', 'chock_fixed', pos=[(CHOCK_ARG, keys(1.0))]),
             tb.anim_node('model::ArgPositionNode', 'chock_sliding', pos=[(CHOCK_ARG, keys(-1.0))])]
    render = [tb.render_node('chock_fixed', 1, fixed), tb.render_node('chock_sliding', 2, moving)]
    lo, hi = [1e9] * 3, [-1e9] * 3
    for m, sign in ((fixed, 1.0), (moving, -1.0)):
        for s in (S_MIN, S_MAX):
            for p, _, _, _ in m.v:
                q = (p[0] + sign * s, p[1], p[2])
                for k in range(3):
                    lo[k], hi[k] = min(lo[k], q[k]), max(hi[k], q[k])
    f = tb.edm_file(nodes, [0, 0], render, CHOCK_ARG + 1, lo, hi, material_name='catcc_wheelchock')
    mat = f['root']['materials'][0]
    for i, (k, v) in enumerate(mat):
        if k == 'TEXTURES':
            mat[i] = (k, [dict(t, name=NAMES[t['index']]) for t in v])
        elif k == 'UNIFORMS':
            mat[i] = (k, [dict(p, value=NORMAL_VALUE) if p['name'] == 'normalMapValue' else p for p in v])
    return f, lo, hi


# ---------------------------------------------------------------- pictures: the chock drawn with its textures and
# normal map, the normal turned by the tangent frame as DCS does it (red along dP/du, green along dP/dv)
def picture(w, h, views, tex, bg=(236, 238, 240)):
    """views: [(parts, view direction, (x, y, width, height), focus)]; parts: [(mesh, x offset)]; focus None or
    (centre, half size m)"""
    col, nx, ny, ao = tex
    img = [[bg] * w for _ in range(h)]
    zb = [[1e9] * w for _ in range(h)]
    light = tb.unit((-0.45, 0.80, 0.40))
    for parts, vdir, (ox, oy, vw, vh), focus in views:
        fwd = tb.unit(vdir)
        right = tb.unit(tb.cross(fwd, tb.Y)) if abs(fwd[1]) < 0.99 else tb.X
        up = tb.cross(right, fwd)
        allp = [(p[0] + dx, p[1], p[2]) for m, dx in parts for p, _, _, _ in m.v]
        if focus:
            cx, cy = tb.dot(focus[0], right), tb.dot(focus[0], up)
            s = min(vw, vh) / (2 * focus[1])
        else:
            xs, ys = [tb.dot(p, right) for p in allp], [tb.dot(p, up) for p in allp]
            s = min((vw - 30) / (max(xs) - min(xs)), (vh - 30) / (max(ys) - min(ys)))
            cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        for m, dx in parts:
            frames = tb.tangents(m)
            pts = [(p[0] + dx, p[1], p[2]) for p, _, _, _ in m.v]
            scr = [(ox + vw / 2 + (tb.dot(p, right) - cx) * s, oy + vh / 2 - (tb.dot(p, up) - cy) * s, tb.dot(p, fwd)) for p in pts]
            for i, j, k in m.tri:
                a, b, c = scr[i], scr[j], scr[k]
                fn = tb.unit(tb.cross(tb.sub(pts[j], pts[i]), tb.sub(pts[k], pts[i])))
                if tb.dot(fn, fwd) > 0:
                    continue
                den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(den) < 1e-9:
                    continue
                x0, x1 = max(ox, int(min(a[0], b[0], c[0]))), min(ox + vw - 1, int(max(a[0], b[0], c[0])) + 1)
                y0, y1 = max(oy, int(min(a[1], b[1], c[1]))), min(oy + vh - 1, int(max(a[1], b[1], c[1])) + 1)
                (ua, na), (ub, nb), (uc, nc) = (m.v[i][2], m.v[i][1]), (m.v[j][2], m.v[j][1]), (m.v[k][2], m.v[k][1])
                (ta, ba), (tb_, bb), (tc, bc) = frames[i], frames[j], frames[k]
                for y in range(y0, y1 + 1):
                    zr, ir = zb[y], img[y]
                    for x in range(x0, x1 + 1):
                        l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
                        l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
                        l3 = 1 - l1 - l2
                        if l1 < 0 or l2 < 0 or l3 < 0:
                            continue
                        z = l1 * a[2] + l2 * b[2] + l3 * c[2]
                        if z >= zr[x]:
                            continue
                        zr[x] = z
                        u = min(W - 1, max(0, int((l1 * ua[0] + l2 * ub[0] + l3 * uc[0]) * W)))
                        v = min(W - 1, max(0, int((l1 * ua[1] + l2 * ub[1] + l3 * uc[1]) * W)))
                        t = v * W + u
                        tx, ty = nx[t] / 127.5 - 1.0, ny[t] / 127.5 - 1.0
                        tz = math.sqrt(max(0.0, 1.0 - tx * tx - ty * ty))
                        N = tb.comb((0, 0, 0), (na, l1), (nb, l2), (nc, l3))
                        T = tb.comb((0, 0, 0), (ta, l1), (tb_, l2), (tc, l3))
                        B = tb.comb((0, 0, 0), (ba, l1), (bb, l2), (bc, l3))
                        n = tb.unit(tb.comb((0, 0, 0), (T, tx), (B, ty), (N, tz)))
                        sh = (0.30 + 0.45 * ao[t] / 255.0) * 0.55 + 0.75 * max(0.0, tb.dot(n, light))
                        ir[x] = (min(255, int(col[3 * t] * sh)), min(255, int(col[3 * t + 1] * sh)), min(255, int(col[3 * t + 2] * sh)))
    return tb.png(w, h, img)


def tyre(r, w, seg=28):
    """a plain tyre for the pictures: a cylinder round the z axis, axle over the origin"""
    m = Mesh()
    reg = R['zinc']
    m.prism((0.0, r, -w / 2), (0.0, 0.0, 1.0), r, w, seg, reg, cap=True)
    m.prism((0.0, r, w / 2), (0.0, 0.0, -1.0), r, 0.0001, seg, reg, cap=True)
    for i, v in enumerate(m.v):
        m.v[i] = (v[0], v[1], v[2], 'tyre')
    return m


def main(out, extras):
    col, nx, ny, ao, ro, me = atlas()
    fixed, moving = fixed_part(), moving_part()
    f, lo, hi = chock_edm(fixed, moving)
    data = edm.write(f)
    assert edm.write(edm.read(data), keep_table=True) == data, 'the written model does not read back the same'
    os.makedirs(os.path.join(out, 'Shapes', 'textures'), exist_ok=True)
    open(os.path.join(out, 'Shapes', 'CATCC_WheelChock.edm'), 'wb').write(data)
    rgb = [col[0::3], col[1::3], col[2::3]]
    open(os.path.join(out, 'Shapes', 'textures', NAMES[0] + '.dds'), 'wb').write(dds(rgb, 'bc1'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[1] + '.dds'), 'wb').write(dds([nx, ny], 'bc5'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[2] + '.dds'), 'wb').write(dds([ao, ro, me], 'bc1'))
    nv, nt = len(fixed.v) + len(moving.v), len(fixed.tri) + len(moving.tri)
    print('wheel chock: %d vertices, %d triangles; blocks %.3f x %.3f x %.3f m (long x deep x high), chamfers %.3f; bar %.3f m square, %.3f m long; %s bar'
          % (nv, nt, L, D, H, C, BAR, BAR_LEN, BAR_PAINT))
    print('  argument %d: each tyre-side plate this far from the centre point (m), from %.3f (%.3f apart) to %.3f (%.3f apart); the bar %.3f m end to end'
          % (CHOCK_ARG, S_MIN, 2 * S_MIN, S_MAX, 2 * S_MAX, BAR_LEN))
    print('  argument %d untouched (0): %.3f, a parked Hornet\'s fit' % (CHOCK_ARG, REST))
    print('  the tyre stands on a span of %.4f m beside the bar (its middle is the origin); bounding box %s to %s'
          % (SPAN, ['%.3f' % v for v in lo], ['%.3f' % v for v in hi]))
    nose_r, main_r = 0.5385 / 2, 0.68 / 2      # the F/A-18C's wheels (FA-18C_hornet.lua: nose_gear_wheel_diameter, main_gear_wheel_diameter)
    print('  F/A-18C: nose wheel (r %.4f) %.4f, main wheels (r %.4f) %.4f' % (nose_r, spacing(nose_r), main_r, spacing(main_r)))
    print('  atlas %d x %d, %d rows used; wrote CATCC_WheelChock.edm and three textures to %s' % (W, W, ATLAS_USED, out))
    if not extras:
        return
    extra = os.path.join(HERE, 'out')
    os.makedirs(extra, exist_ok=True)
    open(os.path.join(extra, 'catcc_wheelchock_diff.png'), 'wb').write(tb.png(W, W, [[(col[3 * (y * W + x)], col[3 * (y * W + x) + 1], col[3 * (y * W + x) + 2]) for x in range(W)] for y in range(W)]))
    open(os.path.join(extra, 'catcc_wheelchock_nm.png'), 'wb').write(tb.png(W, W, [[(nx[y * W + x], ny[y * W + x], 255) for x in range(W)] for y in range(W)]))
    s = spacing(main_r)
    both = Mesh()
    for m, dx in ((fixed, s), (moving, -s)):
        o = len(both.v)
        both.v += [((p[0] + dx, p[1], p[2]), n, uv, tag) for p, n, uv, tag in m.v]
        both.tri += [(a + o, b + o, c + o) for a, b, c in m.tri]
    obj, mtl = tb.obj(both, 'catcc_wheelchock')
    obj = '# CATCC wheel chock (generated by wheel_chock.py) set for the F/A-18C main wheel (argument %.4f): x along the bar, y up, z across; metres\n%s' % (s, obj.split('\n', 1)[1])
    open(os.path.join(extra, 'catcc_wheelchock.obj'), 'w').write(obj)
    open(os.path.join(extra, 'catcc_wheelchock.mtl'), 'w').write(mtl)
    tex = (col, nx, ny, ao)
    t = tyre(main_r, 0.20)
    iso = (-0.55, -0.55, -0.62)
    open(os.path.join(extra, 'catcc_wheelchock_preview.png'), 'wb').write(picture(1600, 1000, [
        ([(fixed, s), (moving, -s)], iso, (0, 0, 1000, 560), None),
        ([(fixed, s), (moving, -s)], (0.55, -0.5, 0.62), (1000, 0, 600, 560), None),
        ([(fixed, s), (moving, -s), (t, 0.0)], (0.0, -0.08, -1.0), (0, 560, 800, 440), None),
        ([(fixed, 0.0), (moving, 0.0)], (-0.35, -0.75, -0.5), (800, 560, 400, 440), None),
        ([(fixed, 0.05), (moving, -0.05)], (-0.62, -0.42, -0.62), (1200, 560, 400, 440), ((0.0, 0.08, 0.05), 0.20)),
    ], tex))
    open(os.path.join(extra, 'catcc_wheelchock_detail.png'), 'wb').write(picture(1600, 800, [
        ([(fixed, s)], (-0.35, -0.80, -0.30), (0, 0, 800, 800), ((s + D * 0.55, H, 0.04), 0.16)),
        ([(fixed, s), (moving, -s)], (0.45, -0.45, -0.75), (800, 0, 800, 800), ((-s - D * 0.5, H * 0.55, Z_END - 0.02), 0.13)),
    ], tex))
    print('wrote the atlas pictures, the OBJ copy and the preview to', extra)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1], False)
    else:
        main(os.path.join(HERE, '..', 'Mods', 'tech', 'CATCC-Crew'), True)
