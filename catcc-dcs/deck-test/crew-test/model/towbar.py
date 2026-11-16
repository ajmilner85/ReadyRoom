"""The tow bar model (an ALBAR universal aircraft tow bar, US Navy: the 15 ft ALBAR 15) and a probe model.

    python -I towbar.py              writes into ../Mods/tech/CATCC-Crew, and model/out (OBJ, previews)
    python -I towbar.py <out dir>    writes the DCS files only, into <out dir> (the tests do this)

DCS files (version 10 .edm, written by edm.py; the textures beside the models, where DCS's ModelViewer2 also
looks by itself):
    Shapes/CATCC_Towbar.edm                         the tow bar
    Shapes/CATCC_AxleProbe.edm                      a thin rod with a centre disc and a flag on argument 1: the
                                                    first axle marker, kept as the test of whether DCS makes a
                                                    static from a model this writer wrote (the axle finder's
                                                    own markers are Blender-made: build_axle_marker.py)
    Shapes/textures/catcc_towbar_diff.dds           colours (flat paints, the stencil markings)
    Shapes/textures/catcc_towbar_nm.dds             normal map (flat)
    Shapes/textures/catcc_towbar_diff_roughmet.dds  roughness (green) and metalness (blue)

THE TOW BAR, from the user's references (2026-11-15: model-kit renders and photographs, an orthographic sheet of
the ALBAR 15, and photographs of F/A-18s under tow: the 15 ft bar; see SCALE below):
  ring head   a lunette ring on a red neck; a red top plate and bottom plate, three bolts through them (the two
              rear ones are the arms' pivots, a white bushing round each); a foot under it the ring end rests on
  arms        two white square tubes, side by side at the ring head, each turning on its pivot bolt: the heads
              swing in and out to fit nose gear axles of different widths. On each: holes, yellow reflective
              patches, stencilled markings, a bushing (boss) for the tensioning chain three quarters of the way
              down, bolts round the end where the head goes in
  heads       red, tapered, set into the arms' ends; on the INBOARD side of each the AXLE PIN that goes into the
              end of a hollow nose wheel axle; at the tip a dark tow hook plate (for aircraft with tow lugs:
              not used on the F/A-18); a small wheel on the outboard side the bar rolls on
  chain       the tensioning chain, from the left arm's boss across to the right arm's and through it to the
              star knob: tightening it pulls the arms together and holds the pins in the axle

The model's frame: x along the bar from the tow ring (the ring's centre is the origin: the tractor's pintle) to
the aircraft; y up; z to the right. Left arm: z < 0.

ONE MODEL ARGUMENT, JAW_ARG, runs through what is done with the bar:
    0            closed, as stowed: the axle pins' tips 2 cm apart, the chain slack (it lies on the deck)
    0 .. 0.5     the arms open, to THETA_MAX each at 0.5 (pin tips 0.62 m apart), the chain coming straight
    0.5 .. 1     the arms close again WITH THE CHAIN TAUT at every width (the knob takes it up): the clamped
                 states. The crew test hook opens the bar to 0.5, puts it over the nose wheels, and closes it
                 to the value at which the pins are in the aircraft's axle (PIN geometry below: printed for the hook).
The bar's pitch about the axle needs no argument: the hook places the whole bar.

THE AXLE FINDER's markers are bright things the hook puts on the player's nose gear, to be moved from the F10
menu until they sit on the real axle: a magenta rod along the axle with a yellow disc at its middle (and a
green flag turned by model argument 1: a test of setting a static object's arguments), and a cyan disc for
each end of the axle.
"""
import math
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edm  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
INCH = 0.0254
X, Y, Z = (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)

# ---------------------------------------------------------------- dimensions (metres)
# WHICH BAR. The first builds took it for the 9 ft bar (108 in) and the user saw in DCS that it was far too small
# (2026-11-15): on a carrier the bar reaches from the nose wheels to about 2 ft short of an F/A-18's nose, and it is
# much heavier in section. His orthographic sheet is headed "ALBAR 15 Universal Towbar": the 15 ft bar (the ALBAR
# comes in 9, 15 and 20 ft). An F/A-18C's nose is 5.6 m ahead of its nose wheel axle; a 15 ft bar's ring comes
# 4.2 m ahead of it.
# So: everything below and in the build functions is still the drawing as it was made, 108 in long ("drawing
# metres"), and the model is written out SCALE times larger: 180 in, its arms 4.2 in square. What has a size of
# its own whatever the bar's length (the lunette ring, the axle pins, the chain's links) is divided by SCALE here
# and so comes out at its real size. real() gives a drawing length in real metres.
DRAWN = 108 * INCH
SCALE = (180 * INCH) / DRAWN


def real(x):
    return x * SCALE


TOTAL = DRAWN                    # from the ring's outer edge to the tow hooks' tips
RING_R, RING_T = 0.062 / SCALE, 0.019 / SCALE  # lunette ring: centre-line radius, section radius (real: 86 mm eye, 162 mm over all)
TUBE, WALL = 2.5 * INCH, 0.004   # the arms: square tube, its wall
PLATE_T = 0.010                  # the ring head's top and bottom plates
PIVOT_X = 0.20                   # the arms' pivot bolts, from the ring's centre
ARM_Z0 = TUBE / 2 + 0.001        # an arm's centre line at its pivot, either side (the tubes touch there)
HEAD_HW = 0.0265                 # the red head: half width and half height where it leaves the tube
HEAD_LEN = 0.25                  # ... its length beyond the tube
HOOK_OVER = 0.05                 # the tow hooks reach this far beyond the heads' tips
ARM_LEN = TOTAL - (RING_R + RING_T) - PIVOT_X - HEAD_LEN - HOOK_OVER  # pivot to the tube's end
PIN_LEN, PIN_R = 0.060 / SCALE, 0.016 / SCALE  # the axle pins (real: 60 mm long, 32 mm thick)
PIN_U = ARM_LEN + 0.12           # an axle pin's station along its arm, from the pivot
PIN_W = HEAD_HW + PIN_LEN        # its tip: this far inboard of the arm's centre line
BOSS_U, BOSS_H = ARM_LEN - 0.24, 0.014  # the chain bushings: station, how far they stand out of the arm's sides
WHEEL_R, WHEEL_V = 0.04, -0.035  # the heads' wheels: radius, axle height on the arm
FOOT_Y = TUBE / 2 + PLATE_T + 0.050  # the ring head's foot: its sole below the ring's centre
JAW_ARG = 10
OPEN_HALF = 0.37                 # real metres: wide open, each axle pin's tip is this far off the bar's line (an F/A-18C's
                                 # nose tyres' outer faces are 0.289 m off it: the open bar passes them with 8 cm to spare)


def _closed_angle():
    """each arm's angle off the bar's line when closed: the pins' tips 1 cm either side of the middle"""
    lo, hi = 0.0, 0.2
    for _ in range(60):
        a = (lo + hi) / 2
        if ARM_Z0 + PIN_U * math.sin(a) - PIN_W * math.cos(a) < 0.010:
            lo = a
        else:
            hi = a
    return (lo + hi) / 2


A0 = _closed_angle()


def _open_angle():
    """how far each arm opens beyond closed: until its pin's tip is OPEN_HALF (real) off the bar's line"""
    lo, hi = 0.0, 0.5
    for _ in range(60):
        a = (lo + hi) / 2
        if real(ARM_Z0 + PIN_U * math.sin(A0 + a) - PIN_W * math.cos(A0 + a)) < OPEN_HALF:
            lo = a
        else:
            hi = a
    return (lo + hi) / 2


THETA_MAX = _open_angle()


def theta_of(arg):
    """how far the arms are open at a value of the model argument"""
    return THETA_MAX * (1 - abs(2 * max(0.0, min(1.0, arg)) - 1))


def pin_tip(theta):
    """an axle pin's tip with the arms open by theta: (x from the ring's centre, distance off the bar's line)"""
    a = A0 + theta
    return PIVOT_X + PIN_U * math.cos(a) + PIN_W * math.sin(a), ARM_Z0 + PIN_U * math.sin(a) - PIN_W * math.cos(a)


# the chain: links of 8 mm wire, 48 mm long and 24 mm wide over all (real sizes)
LINK_A, LINK_B, LINK_R = 0.012 / SCALE, 0.008 / SCALE, 0.004 / SCALE  # half the straight part, the ends' radius, the wire's radius
PITCH = 2 * (LINK_A + LINK_B - LINK_R)          # from one link's middle to the next's
# as many links as reach from one arm's bushing to the other's with the arms wide open
CHAIN_N = int(math.ceil(2 * (ARM_Z0 + BOSS_U * math.sin(A0 + THETA_MAX) - (TUBE / 2 + BOSS_H + 0.004) * math.cos(A0 + THETA_MAX)) / PITCH))
CHAIN_L = CHAIN_N * PITCH
FLOOR_Y = -0.095                 # where a slack chain's links lie: the deck, with the bar on its wheels and foot
CHAIN_KEYS = 20                  # the chain's shape is keyed at this many steps of the argument

# ---------------------------------------------------------------- the texture atlas: a cell of each paint, stencils, and
# a strip for each side of each arm.
# The paints are the deck tractor's own (DCS's AS32-31A, CoreMods/tech/USS_Nimitz/Textures/as32-31a.zip, read
# 2026-11-15): its white panels are 189 186 186 clean and 163 162 162 where dirty, roughness 0.46 to 0.55; its red
# hitch parts 146 32 32, roughness 0.65; its yellow reflective patches 180 128 18, roughness 0.38. The bar is drawn
# as used gear (atlas_layers below): every face's edges chipped, scratches, scuffs, grime.
ATLAS, CELL, PAD = 512, 64, 8
PAINT = {  # name: (cell column, cell row), colour RGB, roughness 0..1, metalness 0..1
    'white': ((0, 0), (188, 186, 185), 0.50, 0.0),
    'red': ((1, 0), (148, 32, 30), 0.62, 0.0),
    'steel': ((2, 0), (72, 74, 78), 0.42, 0.80),
    'rubber': ((3, 0), (26, 26, 28), 0.90, 0.0),
    'yellow': ((4, 0), (182, 130, 20), 0.38, 0.0),
    'zinc': ((5, 0), (170, 172, 174), 0.36, 0.85),
    'black': ((6, 0), (16, 16, 18), 0.60, 0.2),
    'magenta': ((0, 1), (255, 0, 200), 0.50, 0.0),
    'cyan': ((1, 1), (0, 220, 255), 0.50, 0.0),
    'lime': ((2, 1), (130, 255, 0), 0.50, 0.0),
}
STENCIL_SCALE, STENCIL_MARGIN = 6, 7
STENCILS = {'GPNB': (8, 136), 'D9K108': (8, 200)}  # text: where its patch is in the atlas (pixels)
STENCIL_H = 0.045                # a patch's height on the arm (the letters are 35 mm)
FONT = {  # 5 x 7
    'G': ('.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'),
    'P': ('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'),
    'N': ('#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'),
    'B': ('####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'),
    'D': ('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
    'K': ('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'),
    '9': ('.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'),
    '1': ('..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'),
    '0': ('.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'),
    '8': ('.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'),
}


def stencil_rect(text):
    """a stencil's patch in the atlas: x, y, width, height (pixels)"""
    x, y = STENCILS[text]
    return x, y, len(text) * 6 * STENCIL_SCALE - STENCIL_SCALE + 2 * STENCIL_MARGIN + 8, 7 * STENCIL_SCALE + 2 * STENCIL_MARGIN


# the arms' sides: eight strips, each the whole width of the atlas (an arm's side is 2 m by 6 cm: 4 mm a pixel)
STRIPS, STRIP_Y, STRIP_H, STRIP_PITCH, STRIP_PAD_X, STRIP_PAD_Y = 8, 270, 16, 28, 4, 5


def strip_uv(i, s, t):
    """a point of strip i: s along the arm (0 at its ring end), t across it"""
    return ((STRIP_PAD_X + (ATLAS - 2 * STRIP_PAD_X) * s) / ATLAS, (STRIP_Y + i * STRIP_PITCH + STRIP_H * t) / ATLAS)


def cell_uv(paint, s, t):
    """a point of a paint's cell (s, t in 0..1; the cell's edge, PAD wide, is not used)"""
    cx, cy = PAINT[paint][0]
    return ((cx * CELL + PAD + (CELL - 2 * PAD) * max(0.0, min(1.0, s))) / ATLAS,
            (cy * CELL + PAD + (CELL - 2 * PAD) * max(0.0, min(1.0, t))) / ATLAS)


# ---------------------------------------------------------------- vectors
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))


def unit(a):
    m = length(a)
    return mul(a, 1 / m) if m > 1e-12 else (0.0, 0.0, 0.0)


def comb(o, *terms):
    """o + sum of vector * factor"""
    for v, k in terms:
        o = (o[0] + v[0] * k, o[1] + v[1] * k, o[2] + v[2] * k)
    return o


def rot_y(v, phi):
    """a direction (or a point about the origin) turned about +y by phi"""
    c, s = math.cos(phi), math.sin(phi)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def quat_of(c0, c1, c2):
    """the quaternion (x, y, z, w) of the rotation whose matrix has these columns"""
    m00, m10, m20 = c0
    m01, m11, m21 = c1
    m02, m12, m22 = c2
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = ((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s)
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1.0 + m00 - m11 - m22) * 2
        q = (0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s)
    elif m11 > m22:
        s = math.sqrt(1.0 + m11 - m00 - m22) * 2
        q = ((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s)
    else:
        s = math.sqrt(1.0 + m22 - m00 - m11) * 2
        q = ((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s)
    n = math.sqrt(sum(x * x for x in q))
    return tuple(x / n for x in q)


def quat_rot(q, v):
    """v turned by the quaternion (x, y, z, w)"""
    u = (q[0], q[1], q[2])
    t = mul(cross(u, v), 2.0)
    return add(add(v, mul(t, q[3])), cross(u, t))


def triangulate(poly):
    """triangles (index triples) of a simple polygon given as 2D points, by ear clipping"""
    n = len(poly)
    idx = list(range(n))
    if sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) < 0:
        idx.reverse()
    c2 = lambda a, b, c: (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    tris = []
    for _ in range(4 * n):
        if len(idx) <= 3:
            break
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if c2(a, b, c) <= 1e-12:
                continue  # a reflex corner
            if any(c2(a, b, poly[j]) > -1e-12 and c2(b, c, poly[j]) > -1e-12 and c2(c, a, poly[j]) > -1e-12 for j in idx if j not in (i0, i1, i2)):
                continue  # another corner inside this ear
            tris.append((i0, i1, i2))
            del idx[k]
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


# ---------------------------------------------------------------- meshes
class Mesh:
    def __init__(self):
        self.v = []    # (position, normal, uv, paint)
        self.tri = []  # (i, j, k) counter-clockwise seen from where the normal points

    def vert(self, p, n, uv, paint):
        self.v.append(((p[0], p[1], p[2]), unit(n), uv, paint))
        return len(self.v) - 1

    def face(self, i, j, k, n=None):
        a, b, c = self.v[i][0], self.v[j][0], self.v[k][0]
        nn = n if n is not None else add(add(self.v[i][1], self.v[j][1]), self.v[k][1])
        if dot(cross(sub(b, a), sub(c, a)), nn) < 0:
            j, k = k, j
        self.tri.append((i, j, k))

    def merge(self, other):
        o = len(self.v)
        self.v += other.v
        self.tri += [(a + o, b + o, c + o) for a, b, c in other.tri]

    def quad(self, p, n, paint, st=((0, 0), (1, 0), (1, 1), (0, 1))):
        """four corners in order round the face; n: the outward normal (one for all)"""
        ids = [self.vert(p[i], n, cell_uv(paint, *st[i]), paint) for i in range(4)]
        self.face(ids[0], ids[1], ids[2], n)
        self.face(ids[0], ids[2], ids[3], n)

    def quad_uv(self, p, n, paint, uvs):
        """as quad, with the corners' places in the atlas given"""
        ids = [self.vert(p[i], n, uvs[i], paint) for i in range(4)]
        self.face(ids[0], ids[1], ids[2], n)
        self.face(ids[0], ids[2], ids[3], n)

    def ngon(self, pts3, pts2, n, paint):
        """a flat face with any outline: pts2 are its corners in the face's own plane"""
        x0, x1 = min(q[0] for q in pts2), max(q[0] for q in pts2)
        y0, y1 = min(q[1] for q in pts2), max(q[1] for q in pts2)
        ids = [self.vert(p, n, cell_uv(paint, (q[0] - x0) / (x1 - x0), (q[1] - y0) / (y1 - y0)), paint) for p, q in zip(pts3, pts2)]
        for a, b, c in triangulate(pts2):
            self.face(ids[a], ids[b], ids[c], n)

    def box(self, c, ax, ay, az, hx, hy, hz, paint):
        """an oriented box: centre c, unit axes, half sizes"""
        for n, (u, w) in (((1, 0, 0), ((0, 1, 0), (0, 0, 1))), ((-1, 0, 0), ((0, 0, 1), (0, 1, 0))),
                          ((0, 1, 0), ((0, 0, 1), (1, 0, 0))), ((0, -1, 0), ((1, 0, 0), (0, 0, 1))),
                          ((0, 0, 1), ((1, 0, 0), (0, 1, 0))), ((0, 0, -1), ((0, 1, 0), (1, 0, 0)))):
            pts = []
            for su, sw in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                s = tuple(n[k] + u[k] * su + w[k] * sw for k in range(3))
                pts.append(comb(c, (ax, s[0] * hx), (ay, s[1] * hy), (az, s[2] * hz)))
            self.quad(pts, comb((0, 0, 0), (ax, n[0]), (ay, n[1]), (az, n[2])), paint)

    def tube(self, c, ax, ay, az, hx, hy, hz, wall, paint, strips=None):
        """a square tube along ax, open at both ends: outside, inside, and the two rims. strips: the atlas strips its
        four outer sides are drawn from (below, above, the -az side, the +az side)"""
        P = lambda sx, y, z: comb(c, (ax, sx * hx), (ay, y), (az, z))
        iy, iz = hy - wall, hz - wall
        side = lambda pts, n, i: (self.quad(pts, n, paint) if strips is None else
                                  self.quad_uv(pts, n, paint, [strip_uv(strips[i], 0, 0), strip_uv(strips[i], 1, 0), strip_uv(strips[i], 1, 1), strip_uv(strips[i], 0, 1)]))
        for k, sy in enumerate((-1, 1)):
            side([P(-1, sy * hy, -hz), P(1, sy * hy, -hz), P(1, sy * hy, hz), P(-1, sy * hy, hz)], mul(ay, sy), k)
            self.quad([P(-1, sy * iy, -iz), P(1, sy * iy, -iz), P(1, sy * iy, iz), P(-1, sy * iy, iz)], mul(ay, -sy), paint)
        for k, sz in enumerate((-1, 1)):
            side([P(-1, -hy, sz * hz), P(1, -hy, sz * hz), P(1, hy, sz * hz), P(-1, hy, sz * hz)], mul(az, sz), 2 + k)
            self.quad([P(-1, -iy, sz * iz), P(1, -iy, sz * iz), P(1, iy, sz * iz), P(-1, iy, sz * iz)], mul(az, -sz), paint)
        for sx in (-1, 1):
            n = mul(ax, sx)
            for s in (-1, 1):
                self.quad([P(sx, s * hy, -hz), P(sx, s * hy, hz), P(sx, s * iy, iz), P(sx, s * iy, -iz)], n, paint)
                self.quad([P(sx, -hy, s * hz), P(sx, hy, s * hz), P(sx, iy, s * iz), P(sx, -iy, s * iz)], n, paint)

    def cylinder(self, c, axis, r, ln, paint, seg=16, cap_paint=None, r2=None, caps=(True, True)):
        """a cylinder centred on c along the unit axis (r at its start, r2 at its end: a cone's frustum)"""
        axis = unit(axis)
        r2 = r if r2 is None else r2
        e1 = unit(cross(axis, Y if abs(dot(axis, Y)) < 0.9 else X))
        e2 = cross(axis, e1)
        a0, a1 = comb(c, (axis, -ln / 2)), comb(c, (axis, ln / 2))
        ring = [unit(comb((0, 0, 0), (e1, math.cos(2 * math.pi * i / seg)), (e2, math.sin(2 * math.pi * i / seg)))) for i in range(seg + 1)]
        for i in range(seg):
            n0, n1 = ring[i], ring[i + 1]
            s0, s1 = 0.3 + 0.4 * i / seg, 0.3 + 0.4 * (i + 1) / seg  # (the middle of the cell: no shading across a round side)
            ids = [self.vert(comb(a0, (n0, r)), n0, cell_uv(paint, s0, 0), paint), self.vert(comb(a1, (n0, r2)), n0, cell_uv(paint, s0, 1), paint),
                   self.vert(comb(a1, (n1, r2)), n1, cell_uv(paint, s1, 1), paint), self.vert(comb(a0, (n1, r)), n1, cell_uv(paint, s1, 0), paint)]
            nm = add(n0, n1)
            self.face(ids[0], ids[1], ids[2], nm)
            self.face(ids[0], ids[2], ids[3], nm)
        cp = cap_paint or paint
        for on, end, n, rr in ((caps[0], a0, mul(axis, -1), r), (caps[1], a1, axis, r2)):
            if not on or rr <= 0:
                continue
            ctr = self.vert(end, n, cell_uv(cp, 0.5, 0.5), cp)
            rim = [self.vert(comb(end, (ring[i], rr)), n, cell_uv(cp, 0.5 + 0.2 * dot(ring[i], e1), 0.5 + 0.2 * dot(ring[i], e2)), cp) for i in range(seg + 1)]
            for i in range(seg):
                self.face(ctr, rim[i], rim[i + 1], n)

    def torus(self, c, R, r, paint, seg=24, side=10, ex=X, ey=Y, ez=Z):
        """a ring in the plane of ex and ez, round ey"""
        grid = []
        for i in range(seg + 1):
            a = 2 * math.pi * i / seg
            d = comb((0, 0, 0), (ex, math.cos(a)), (ez, math.sin(a)))
            row = []
            for j in range(side + 1):
                b = 2 * math.pi * j / side
                n = comb((0, 0, 0), (d, math.cos(b)), (ey, math.sin(b)))
                row.append(self.vert(comb(c, (d, R), (n, r)), n, cell_uv(paint, 0.3 + 0.4 * i / seg, 0.3 + 0.4 * j / side), paint))
            grid.append(row)
        for i in range(seg):
            for j in range(side):
                self.face(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1])
                self.face(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1])

    def prism(self, o, e1, e2, e3, outline, t0, t1, paint, caps=(True, True)):
        """an outline in the plane of e1 and e2 (through o), drawn out along e3 from t0 to t1"""
        P = lambda q, t: comb(o, (e1, q[0]), (e2, q[1]), (e3, t))
        n = len(outline)
        if sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n)) < 0:
            outline = outline[::-1]
        for i in range(n):
            a, b = outline[i], outline[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            self.quad([P(a, t0), P(b, t0), P(b, t1), P(a, t1)], comb((0, 0, 0), (e1, dy), (e2, -dx)), paint)
        if caps[0]:
            self.ngon([P(q, t0) for q in outline], outline, mul(e3, -1), paint)
        if caps[1]:
            self.ngon([P(q, t1) for q in outline], outline, e3, paint)

    def loft(self, o, eu, ev, ew, ua, ra, ub, rb, paint, caps=(True, True), cap_paint=None):
        """a tapered box: the rectangle ra = (v from, v to, w from, w to) at ua joined to rb at ub"""
        P = lambda u, v, w: comb(o, (eu, u), (ev, v), (ew, w))
        A = [P(ua, ra[0], ra[2]), P(ua, ra[1], ra[2]), P(ua, ra[1], ra[3]), P(ua, ra[0], ra[3])]
        B = [P(ub, rb[0], rb[2]), P(ub, rb[1], rb[2]), P(ub, rb[1], rb[3]), P(ub, rb[0], rb[3])]
        mid = mul(add(add(add(A[0], A[2]), B[0]), B[2]), 0.25)
        for i in range(4):
            q = [A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]]
            n = unit(cross(sub(q[1], q[0]), sub(q[3], q[0])))
            if dot(n, sub(q[0], mid)) < 0:
                n = mul(n, -1)
            self.quad(q, n, paint)
        if caps[0]:
            self.quad(A, mul(eu, -1 if ub > ua else 1), cap_paint or paint)
        if caps[1]:
            self.quad(B, mul(eu, 1 if ub > ua else -1), cap_paint or paint)

    def stencil(self, c, eu, ev, n, text):
        """a stencilled marking: a flat patch at c, eu to the reader's right, ev up, facing n"""
        x, y, w, h = stencil_rect(text)
        hv = STENCIL_H / 2
        hu = hv * w / h
        ids = []
        for su, sv, px, py in ((-1, 1, x, y), (1, 1, x + w, y), (1, -1, x + w, y + h), (-1, -1, x, y + h)):
            ids.append(self.vert(comb(c, (eu, su * hu), (ev, sv * hv)), n, (px / ATLAS, py / ATLAS), 'white'))
        self.face(ids[0], ids[1], ids[2], n)
        self.face(ids[0], ids[2], ids[3], n)

    def hexbolt(self, c, axis, r, h, paint='steel', washer=None):
        """a hexagon bolt head (or nut) standing on the surface at c, along the axis; washer: its radius"""
        if washer:
            self.cylinder(comb(c, (axis, 0.0015)), axis, washer, 0.003, 'zinc', seg=14)
            c = comb(c, (axis, 0.003))
        self.cylinder(comb(c, (axis, h / 2)), axis, r, h, paint, seg=6)

    def hole(self, c, axis, r):
        """a hole, drawn: a black disc on the surface at c"""
        self.cylinder(comb(c, (axis, 0.0005)), axis, r, 0.001, 'black', seg=10, caps=(False, True))


# ---------------------------------------------------------------- the tow bar
class Arm:
    """an arm's own frame in the closed pose: u along it from its pivot, v up, w outboard"""

    def __init__(self, side):
        self.side = side
        self.pivot = (PIVOT_X, 0.0, side * ARM_Z0)
        self.ax = (math.cos(A0), 0.0, side * math.sin(A0))
        self.out = (-math.sin(A0), 0.0, side * math.cos(A0))

    def p(self, u, v=0.0, w=0.0):
        return comb(self.pivot, (self.ax, u), (Y, v), (self.out, w))


def build_head():
    """the ring head: what does not move"""
    m = Mesh()
    h = TUBE / 2
    m.torus((0.0, 0.0, 0.0), RING_R, RING_T, 'red', seg=28, side=12)
    # the ring's neck, deepening into the spacer between the plates that the front bolt goes through (narrow: the
    # arms' open ends and their bushings show either side of it)
    m.loft((0, 0, 0), X, Y, Z, RING_R + 0.004, (-0.014, 0.014, -0.022, 0.022), 0.105, (-h, h, -0.024, 0.024), 'red', caps=(True, False))
    m.box((0.135, 0.0, 0.0), X, Y, Z, 0.030, h, 0.024, 'red')
    # the top and bottom plates
    outline = [(0.095, -0.038), (0.095, 0.038), (0.150, 0.070), (0.238, 0.070), (0.262, 0.046), (0.262, -0.046), (0.238, -0.070), (0.150, -0.070)]
    m.prism((0, 0, 0), X, Z, Y, outline, h, h + PLATE_T, 'red')
    m.prism((0, 0, 0), X, Z, Y, outline, -h - PLATE_T, -h, 'red')
    # three bolts through the plates: heads on washers above, nuts below. The two rear ones are the arms' pivots
    for bx, bz in ((PIVOT_X, -ARM_Z0), (PIVOT_X, ARM_Z0), (0.135, 0.0)):
        m.hexbolt((bx, h + PLATE_T, bz), Y, 0.014, 0.012, washer=0.020)
        m.hexbolt((bx, -h - PLATE_T, bz), mul(Y, -1), 0.014, 0.012, washer=0.020)
        m.cylinder((bx, -h - PLATE_T - 0.019, bz), Y, 0.007, 0.008, 'zinc', seg=10)
    # the white bushing round each pivot bolt, between the plates (it shows at the arm's open end)
    for s in (-1, 1):
        m.cylinder((PIVOT_X, 0.0, s * ARM_Z0), Y, 0.027, TUBE - 0.002, 'white', seg=18, caps=(False, False))
    # the foot the ring end rests on
    m.box((0.160, -h - PLATE_T - 0.022, 0.0), X, Y, Z, 0.045, 0.022, 0.004, 'red')
    m.box((0.160, -FOOT_Y + 0.003, 0.0), X, Y, Z, 0.050, 0.003, 0.030, 'red')
    return m


def build_arm(side):
    """one arm with everything on it, in the closed pose (model coordinates)"""
    m = Mesh()
    F = Arm(side)
    ax, out = F.ax, F.out
    inb = mul(out, -1)
    h = TUBE / 2
    up, down = Y, mul(Y, -1)
    # the tube, from just behind the pivot to where the head goes in
    m.tube(F.p((ARM_LEN - 0.012) / 2), ax, Y, out, (ARM_LEN + 0.012) / 2, h, h, WALL, 'white', strips=[k + (0 if side < 0 else 4) for k in range(4)])
    # holes near the ring end: three on top, one in the outboard side
    for u, r in ((0.095, 0.005), (0.150, 0.009), (0.205, 0.005)):
        m.hole(F.p(u, h), up, r)
    m.hole(F.p(0.075, 0.0, h), out, 0.006)
    if side < 0:
        for k in range(5):  # the row of five further along (left arm)
            m.hole(F.p(ARM_LEN - 0.47 - 0.085 * k, h), up, 0.008)
    else:
        m.hole(F.p(ARM_LEN * 0.58, h), up, 0.006)
    # yellow reflective patches, on top and on the outboard side, near each end
    for u in (0.31, ARM_LEN - 0.15):
        m.box(F.p(u, h + 0.0006), ax, Y, out, 0.045, 0.0006, h * 0.72, 'yellow')
        m.box(F.p(u, 0.0, h + 0.0006), ax, Y, out, 0.045, h * 0.72, 0.0006, 'yellow')
    # the stencilled markings on the outboard side (to be read from outside: the reader's right is nose-wards on the right arm)
    right = cross(inb, Y)
    m.stencil(F.p(0.62, 0.0, h + 0.0008), right, Y, out, 'D9K108')
    m.stencil(F.p(1.00, 0.0, h + 0.0008), right, Y, out, 'GPNB')
    # the bolts round the tube's end, through the head inside it: two above, two below, four in each side
    for sw in (-1, 1):
        m.hexbolt(F.p(ARM_LEN - 0.022, h, sw * 0.017), up, 0.007, 0.006)
        m.hexbolt(F.p(ARM_LEN - 0.022, -h, sw * 0.017), down, 0.007, 0.006)
    for u in (ARM_LEN - 0.022, ARM_LEN - 0.052):
        for sv in (-1, 1):
            m.hexbolt(F.p(u, sv * 0.017, h), out, 0.007, 0.006)
            m.hexbolt(F.p(u, sv * 0.017, -h), inb, 0.007, 0.006)
    # the chain's bushing, through the arm: a boss on each side
    for d, sw in ((out, 1), (inb, -1)):
        m.cylinder(F.p(BOSS_U, 0.0, sw * (h + BOSS_H / 2)), d, 0.022, BOSS_H, 'steel', seg=16, cap_paint='black', caps=(False, True))
    if side > 0:
        # the tensioning knob on the right arm's outboard side: a star knob on its rod
        m.cylinder(F.p(BOSS_U, 0.0, h + BOSS_H + 0.016), out, 0.005, 0.032, 'zinc', seg=8)
        star = [(math.cos(math.pi * i / 5) * (0.027 if i % 2 == 0 else 0.017), math.sin(math.pi * i / 5) * (0.027 if i % 2 == 0 else 0.017)) for i in range(10)]
        m.prism(F.p(BOSS_U), ax, Y, out, star, h + BOSS_H + 0.030, h + BOSS_H + 0.044, 'black')
    else:
        # the chain's end pin on the left arm's outboard side
        m.cylinder(F.p(BOSS_U, 0.0, h + BOSS_H + 0.008), out, 0.008, 0.016, 'zinc', seg=10)
    # ---- the head: set into the tube, square for 9 cm, then tapering to the tip (its top comes down, its bottom up
    # a little, its outboard side in); the tip's end dark (it is open)
    hw = HEAD_HW
    m.box(F.p(ARM_LEN + 0.044), ax, Y, out, 0.046, hw, hw, 'red')
    m.loft(F.pivot, ax, Y, out, ARM_LEN + 0.090, (-hw, hw, -hw, hw), ARM_LEN + HEAD_LEN, (-0.020, 0.012, -hw, 0.008), 'red', caps=(False, True), cap_paint='black')
    m.hexbolt(F.p(ARM_LEN + 0.060, hw), up, 0.006, 0.007)
    # the axle pin, on the inboard side: a collar, the pin, its end chamfered
    m.cylinder(F.p(PIN_U, 0.0, -(hw + 0.004)), inb, 0.019, 0.008, 'steel', seg=6)
    m.cylinder(F.p(PIN_U, 0.0, -(hw + (PIN_LEN - 0.008) / 2)), inb, PIN_R, PIN_LEN - 0.008, 'zinc', seg=14, caps=(False, False))
    m.cylinder(F.p(PIN_U, 0.0, -(hw + PIN_LEN - 0.004)), inb, PIN_R, 0.008, 'zinc', seg=14, r2=PIN_R * 0.7, caps=(False, True))
    m.cylinder(F.p(PIN_U, 0.0, 0.0235), out, 0.012, 0.002, 'black', seg=12, caps=(False, True))  # (the pin's other end, in the outboard side)
    # the tow hook plate at the tip, on the inboard side, reaching beyond the tip: a body with five holes and three
    # teeth under it, and a hook (a finger forward and a lip down, the slot open below)
    tip = F.p(ARM_LEN + HEAD_LEN)
    hook = [(-0.070, -0.035), (0.000, -0.035), (0.000, 0.005), (0.030, 0.005), (0.030, -0.030), (HOOK_OVER, -0.030), (HOOK_OVER, 0.022), (0.040, 0.032), (-0.070, 0.032)]
    m.prism(tip, ax, Y, inb, hook, hw, hw + 0.010, 'steel')
    for hu, hv in ((-0.055, 0.016), (-0.030, 0.016), (-0.055, -0.012), (-0.030, -0.012), (-0.0425, 0.002)):
        m.hole(comb(tip, (ax, hu), (Y, hv), (inb, hw + 0.010)), inb, 0.005)
    for hu in (-0.050, -0.035, -0.020):
        m.box(comb(tip, (ax, hu), (Y, -0.039), (inb, hw + 0.005)), ax, Y, out, 0.004, 0.004, 0.005, 'steel')
    # the wheel on the outboard side, at the tube's end: a lug plate down from the head, the stub axle, the wheel
    m.box(F.p(ARM_LEN + 0.020, -0.020, hw + 0.004), ax, Y, out, 0.022, 0.030, 0.004, 'red')
    m.cylinder(F.p(ARM_LEN + 0.020, WHEEL_V, hw + 0.014), out, 0.007, 0.012, 'steel', seg=8)
    m.cylinder(F.p(ARM_LEN + 0.020, WHEEL_V, hw + 0.0095 + 0.0125), out, WHEEL_R, 0.025, 'rubber', seg=20, cap_paint='zinc')
    m.hexbolt(F.p(ARM_LEN + 0.020, WHEEL_V, hw + 0.0095 + 0.025), out, 0.008, 0.005)
    return m


def link_mesh():
    """one chain link, about its own middle: long along x, lying in the x-z plane"""
    m = Mesh()
    ctr = []
    for cx, a0 in ((LINK_A, -90), (-LINK_A, 90)):
        for k in range(6):
            a = math.radians(a0 + 36 * k)
            d = (math.cos(a), 0.0, math.sin(a))
            ctr.append((comb((cx, 0.0, 0.0), (d, LINK_B)), d))
    n, K = len(ctr), 6
    grid = []
    for i in range(n + 1):
        p, d = ctr[i % n]
        row = []
        for k in range(K + 1):
            b = 2 * math.pi * k / K
            nn = comb((0, 0, 0), (d, math.cos(b)), (Y, math.sin(b)))
            row.append(m.vert(comb(p, (nn, LINK_R)), nn, cell_uv('zinc', 0.3 + 0.4 * i / n, 0.3 + 0.4 * k / K), 'zinc'))
        grid.append(row)
    for i in range(n):
        for k in range(K):
            m.face(grid[i][k], grid[i + 1][k], grid[i + 1][k + 1])
            m.face(grid[i][k], grid[i + 1][k + 1], grid[i][k + 1])
    return m


# ---------------------------------------------------------------- where things are at a value of the argument
def arm_turn(side, theta):
    """the angle about +y that takes an arm from closed to open by theta (the left arm opens by a positive turn)"""
    return -side * theta


def arm_point(side, theta, u, v=0.0, w=0.0):
    a = A0 + theta
    return (PIVOT_X + u * math.cos(a) - w * math.sin(a), v, side * (ARM_Z0 + u * math.sin(a) + w * math.cos(a)))


def _catenary_param(d, ln):
    """a of the catenary of length ln hung between two level points d apart"""
    lo, hi = 1e-4, 1e4
    for _ in range(200):
        a = math.sqrt(lo * hi)
        if 2 * a * math.sinh(min(700.0, d / (2 * a))) > ln:
            lo = a
        else:
            hi = a
    return math.sqrt(lo * hi)


def hanging(a, b, ln, floor):
    """a chain of length ln hung between a and b (level with each other), over a floor: a list of points along it.
    Slack enough, it drops to the floor and lies there in a loop towards the ring."""
    e = sub(b, a)
    d = length(e)
    e = unit(e)
    h = a[1] - floor
    if ln <= d * 1.0005 or d < 1e-6:
        return [a, b]
    pts = []
    N = 24
    ac = _catenary_param(d, ln)
    sag = ac * (math.cosh(d / (2 * ac)) - 1)
    if sag <= h:
        for i in range(2 * N + 1):  # free: one catenary
            q = -d / 2 + d * i / (2 * N)
            pts.append(comb(a, (e, q + d / 2), (Y, ac * (math.cosh(q / ac) - 1) - sag)))
        return pts
    if ln < 2 * h + d:
        # it touches the floor and lies on it between two half catenaries: 2 sqrt(h^2 + 2 a h) + d - 2 a acosh(1 + h / a) = ln
        lo, hi = 1e-7, ac
        for _ in range(200):
            c = (lo + hi) / 2
            if 2 * math.sqrt(h * h + 2 * c * h) + d - 2 * c * math.acosh(1 + h / c) > ln:
                lo = c
            else:
                hi = c
        c = (lo + hi) / 2
        x1 = min(d / 2, c * math.acosh(1 + h / c))
        left = [comb(a, (e, x1 - x1 * i / N), (Y, -h + c * (math.cosh((x1 * i / N) / c) - 1))) for i in range(N, -1, -1)]
        right = [comb(b, (e, -(x1 - x1 * i / N)), (Y, -h + c * (math.cosh((x1 * i / N) / c) - 1))) for i in range(N + 1)]
        return left + right
    # it hangs straight down at each end and the rest lies on the floor, in an arc towards the ring
    ta, tb = comb(a, (Y, -h)), comb(b, (Y, -h))
    lf = ln - 2 * h
    bulge = cross(e, Y)
    if bulge[0] > 0:
        bulge = mul(bulge, -1)
    lo, hi = 1e-6, math.pi - 1e-6
    for _ in range(200):
        al = (lo + hi) / 2
        if math.sin(al) / al > d / lf:
            lo = al
        else:
            hi = al
    al = (lo + hi) / 2
    R = lf / (2 * al)
    mid = mul(add(ta, tb), 0.5)
    c0 = comb(mid, (bulge, -R * math.cos(al)))
    arc = [comb(c0, (e, R * math.sin(-al + 2 * al * i / (2 * N))), (bulge, R * math.cos(-al + 2 * al * i / (2 * N)))) for i in range(2 * N + 1)]
    return [a] + arc + [b]


def chain_pose(arg):
    """every link at a value of the argument: [(middle, quaternion x y z w)]"""
    th = theta_of(arg)
    off = TUBE / 2 + BOSS_H + 0.004
    a = arm_point(-1, th, BOSS_U, 0.0, -off)   # off the left arm's inboard boss
    b = arm_point(1, th, BOSS_U, 0.0, -off)    # off the right arm's
    inside = arm_point(1, th, BOSS_U, 0.0, 0.0)  # in the right arm: where the chain taken up by the knob has gone
    path = hanging(a, b, CHAIN_L, FLOOR_Y) if arg <= 0.5 else [a, b]
    path = path + [inside]
    seg, s = [], 0.0
    for i in range(len(path) - 1):
        ln = length(sub(path[i + 1], path[i]))
        seg.append((s, ln, path[i], path[i + 1]))
        s += ln
    out = []
    nrm = X
    for i in range(CHAIN_N):
        si = (i + 0.5) * PITCH
        k = 0
        while k < len(seg) - 1 and seg[k][0] + seg[k][1] < si:
            k += 1
        s0, ln, p0, p1 = seg[k]
        f = max(0.0, min(1.0, (si - s0) / ln)) if ln > 1e-9 else 1.0
        pos = comb(p0, (sub(p1, p0), f))
        t = unit(sub(p1, p0)) if ln > 1e-9 else unit(sub(b, a))
        nrm = unit(sub(nrm, mul(t, dot(nrm, t))))  # carried along the chain, kept square to it
        if length(nrm) < 0.5:
            nrm = unit(cross(t, Y if abs(t[1]) < 0.9 else X))
        n = nrm if i % 2 == 0 else cross(t, nrm)   # every other link a quarter turn round
        out.append((pos, quat_of(t, n, cross(t, n))))
    return out


def chain_keys():
    """per link: [(argument, middle, quaternion)], the quaternions' signs kept from key to key"""
    poses = [(k / CHAIN_KEYS, chain_pose(k / CHAIN_KEYS)) for k in range(CHAIN_KEYS + 1)]
    keys = []
    for i in range(CHAIN_N):
        row, last = [], None
        for arg, pose in poses:
            pos, q = pose[i]
            if last is not None and sum(x * y for x, y in zip(q, last)) < 0:
                q = tuple(-x for x in q)
            last = q
            row.append((arg, pos, q))
        keys.append(row)
    return keys


def posed(arg, head, arms, link):
    """the whole bar as one mesh at a value of the argument (for pictures, the OBJ and the bounding box)"""
    m = Mesh()
    m.merge(head)
    th = theta_of(arg)
    for side, arm in ((-1, arms[0]), (1, arms[1])):
        piv = (PIVOT_X, 0.0, side * ARM_Z0)
        phi = arm_turn(side, th)
        part = Mesh()
        part.v = [(add(piv, rot_y(sub(p, piv), phi)), rot_y(n, phi), uv, paint) for p, n, uv, paint in arm.v]
        part.tri = list(arm.tri)
        m.merge(part)
    for pos, q in chain_pose(arg):
        part = Mesh()
        part.v = [(add(pos, quat_rot(q, p)), quat_rot(q, n), uv, paint) for p, n, uv, paint in link.v]
        part.tri = list(link.tri)
        m.merge(part)
    return m


# ---------------------------------------------------------------- the axle finder's markers
def build_marker():
    """a magenta rod along z through the origin (the axle's line and middle), a yellow disc at the middle"""
    m = Mesh()
    m.cylinder((0, 0, 0), Z, 0.006, 0.90, 'magenta', seg=10)
    m.cylinder((0, 0, 0), Z, 0.070, 0.003, 'yellow', seg=24)
    for s in (-1, 1):
        m.box((0.0, 0.0, s * 0.0022), X, Y, Z, 0.066, 0.004, 0.0006, 'magenta')
        m.box((0.0, 0.0, s * 0.0022), X, Y, Z, 0.004, 0.066, 0.0006, 'magenta')
    return m


def build_flag():
    """the marker's flag (about the origin): it stands up from the rod, and argument 1 lays it forward"""
    m = Mesh()
    m.box((0.0, 0.085, 0.0), X, Y, Z, 0.012, 0.075, 0.002, 'lime')
    return m


def build_end():
    """a cyan disc for an axle end: its face at the origin, facing +z, a cross and a dot on it"""
    m = Mesh()
    m.cylinder((0, 0, -0.002), Z, 0.050, 0.004, 'cyan', seg=24)
    m.box((0.0, 0.0, 0.0006), X, Y, Z, 0.046, 0.003, 0.0006, 'magenta')
    m.box((0.0, 0.0, 0.0006), X, Y, Z, 0.003, 0.046, 0.0006, 'magenta')
    m.cylinder((0, 0, 0.0012), Z, 0.008, 0.0012, 'yellow', seg=12)
    return m


# ---------------------------------------------------------------- the EDM files
def tangents(m):
    """per vertex: the direction of increasing u and of increasing v (a frame for the normal map)"""
    tu = [(0.0, 0.0, 0.0)] * len(m.v)
    tv = [(0.0, 0.0, 0.0)] * len(m.v)
    for i, j, k in m.tri:
        (p0, _, w0, _), (p1, _, w1, _), (p2, _, w2, _) = m.v[i], m.v[j], m.v[k]
        e1, e2 = sub(p1, p0), sub(p2, p0)
        du1, dv1, du2, dv2 = w1[0] - w0[0], w1[1] - w0[1], w2[0] - w0[0], w2[1] - w0[1]
        det = du1 * dv2 - du2 * dv1
        if abs(det) < 1e-14:
            continue
        a = mul(sub(mul(e1, dv2), mul(e2, dv1)), 1 / det)
        b = mul(sub(mul(e2, du1), mul(e1, du2)), 1 / det)
        for q in (i, j, k):
            tu[q], tv[q] = add(tu[q], a), add(tv[q], b)
    out = []
    for q, (p, n, _, _) in enumerate(m.v):
        t = unit(sub(tu[q], mul(n, dot(n, tu[q]))))
        if t == (0.0, 0.0, 0.0):
            t = unit(cross(n, Y if abs(n[1]) < 0.9 else X))
        b = cross(n, t)
        if dot(b, tv[q]) < 0:
            b = mul(b, -1)
        out.append((t, b))
    return out


IDENT = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]


def render_node(name, node, m, origin=(0.0, 0.0, 0.0), scale=1.0):
    """a mesh as a render node under a transform node: its vertices about `origin` (where the node puts them),
    written `scale` times larger"""
    frames = tangents(m)
    data = bytearray()
    for (p, n, uv, _), (t, b) in zip(m.v, frames):
        q = mul(sub(p, origin), scale)
        data += struct.pack('<15f', q[0], q[1], q[2], 0.0, n[0], n[1], n[2], t[0], t[1], t[2], b[0], b[1], b[2], uv[0], uv[1])
    flat = [x for tri in m.tri for x in tri]
    itype, fmt = (0, 'B') if len(m.v) < 256 else ((1, 'H') if len(m.v) < 65536 else (2, 'I'))
    return {'type': 'model::RenderNode', 'name': name, 'version': 1, 'props': [], 'unk': 0, 'material': 0,
            'parents': [(node, -1)], 'vtx': {'count': len(m.v), 'stride': 15, 'data': bytes(data)},
            'idx': {'type': itype, 'count': len(flat), 'unk': 5, 'data': struct.pack('<%d%s' % (len(flat), fmt), *flat)}}


def anim_node(kind, name, position=(0.0, 0.0, 0.0), pos=None, rot=None):
    """an argument-driven node. The node's transform is: the matrix, a move by (position + the position key), the
    quaternion, the rotation key, the scale; a quaternion is x, y, z, w (as OpenSceneGraph keeps it); a key is
    (argument value, ...)"""
    return {'type': kind, 'name': name, 'version': 0, 'props': [],
            'base': {'matrix': list(IDENT), 'position': list(position), 'quat1': [0.0, 0.0, 0.0, 1.0], 'quat2': [0.0, 0.0, 0.0, 1.0], 'scale': [1.0, 1.0, 1.0]},
            'pos': pos or [], 'rot': rot or [], 'scale': []}


def edm_file(nodes, parents, render, nargs, lo, hi, material_name='catcc_towbar'):
    big = struct.unpack('<d', b'\x00\x00\x00\xe0\xff\xff\xefG')[0]
    material = [
        ('BLENDING', 0), ('DEPTH_BIAS', 0), ('VERTEX_FORMAT', [4, 3, 3, 3, 2] + [0] * 21),
        ('TEXTURE_COORDINATES_CHANNELS', [0, 0, 0] + [-1] * 10), ('MATERIAL_NAME', 'def_material'), ('NAME', material_name), ('SHADOWS', 1),
        ('TEXTURES', [{'index': i, 'unk': -1, 'name': name, 'unk2': [2, 2, 10, 6], 'matrix': list(IDENT)}
                      for i, name in enumerate(('catcc_towbar_diff', 'catcc_towbar_nm', 'catcc_towbar_diff_roughmet'))]),
        ('UNIFORMS', [{'type': 'model::Property<float>', 'name': k, 'value': v} for k, v in
                      (('specPower', 0.0001), ('specFactor', 0.1), ('reflectionBlurring', 0.2), ('reflectionValue', 1.0), ('diffuseValue', 1.0), ('specMapValue', 1.0))]
         + [{'type': 'model::Property<osg::Vec2f>', 'name': 'diffuseShift', 'value': [0.0, 0.0]},
            {'type': 'model::Property<float>', 'name': 'normalMapValue', 'value': 0.0}]),
        ('ANIMATED_UNIFORMS', []),
    ]
    return {
        'version': 10, 'strings': [], 'indexA': [], 'indexB': [], 'rest': b'',
        'root': {'type': 'model::RootNode', 'name': 'Scene Root', 'version': 0,
                 'props': [{'type': 'model::Property<unsigned int>', 'name': '__VERSION__', 'value': 3}],
                 'bbox': list(lo) + list(hi), 'unkB': list(lo) + list(hi) + [big] * 3 + [-big] * 3, 'materials': [material],
                 'unkC': [0, nargs]},  # (the second: the model's argument count, the highest argument + 1)
        'nodes': [{'type': 'model::Node', 'name': '', 'version': 0, 'props': []}] + nodes,
        'parents': [-1] + parents,
        'items': [('RENDER_NODES', render)],
    }


def bounds(meshes):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for m in meshes:
        for p, _, _, _ in m.v:
            for k in range(3):
                lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
    return lo, hi


def towbar_edm(head, arms, link):
    # (drawn at 108 in, written SCALE times larger: every vertex, every node's place, every position key)
    nodes, parents, render = [], [], [render_node('ring_head', 0, head, scale=SCALE)]
    for i, (side, name) in enumerate(((-1, 'arm_left'), (1, 'arm_right'))):
        phi = arm_turn(side, THETA_MAX)
        nodes.append(anim_node('model::ArgRotationNode', name, position=(real(PIVOT_X), 0.0, side * real(ARM_Z0)),
                               rot=[(JAW_ARG, [[0.0, 0.0, 0.0, 0.0, 1.0], [0.5, 0.0, math.sin(phi / 2), 0.0, math.cos(phi / 2)], [1.0, 0.0, 0.0, 0.0, 1.0]])]))
        parents.append(0)
        render.append(render_node(name, 1 + i, arms[i], origin=(PIVOT_X, 0.0, side * ARM_Z0), scale=SCALE))
    for i, row in enumerate(chain_keys()):
        nodes.append(anim_node('model::ArgAnimationNode', 'link_%02d' % i,
                               pos=[(JAW_ARG, [[arg, real(p[0]), real(p[1]), real(p[2])] for arg, p, _ in row])],
                               rot=[(JAW_ARG, [[arg, q[0], q[1], q[2], q[3]] for arg, _, q in row])]))
        parents.append(0)
        render.append(render_node('link_%02d' % i, 3 + i, link, scale=SCALE))
    lo, hi = bounds([posed(k / 8, head, arms, link) for k in range(9)])
    return edm_file(nodes, parents, render, JAW_ARG + 1, [real(x) for x in lo], [real(x) for x in hi])


def marker_edm(marker, flag):
    q = math.sin(-math.pi / 4)  # a quarter turn about z, from up to forward
    nodes = [anim_node('model::ArgRotationNode', 'flag', rot=[(1, [[0.0, 0.0, 0.0, 0.0, 1.0], [1.0, 0.0, 0.0, q, math.cos(-math.pi / 4)]])])]
    lo, hi = bounds([marker, flag])
    lo, hi = [min(lo[0], -0.16), lo[1], lo[2]], [max(hi[0], 0.16), hi[1], hi[2]]
    return edm_file(nodes, [0], [render_node('axle_marker', 0, marker), render_node('flag', 1, flag)], 2, lo, hi, 'catcc_marker')


def end_edm(end):
    lo, hi = bounds([end])
    return edm_file([], [], [render_node('axle_end', 0, end)], 0, lo, hi, 'catcc_marker')


# ---------------------------------------------------------------- textures (uncompressed 32-bit DDS, with their mipmaps)
def noise(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFF) / 255.0


def smooth_noise(seed, x, y, period):
    """value noise, 0..1, one cell every `period` pixels"""
    gx, gy = x / period, y / period
    x0, y0 = math.floor(gx), math.floor(gy)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    h = lambda i, j: noise(i * 7 + seed * 131, j * 13 + seed * 977)
    return (h(x0, y0) * (1 - fx) + h(x0 + 1, y0) * fx) * (1 - fy) + (h(x0, y0 + 1) * (1 - fx) + h(x0 + 1, y0 + 1) * fx) * fy


# Used gear: what each paint looks like worn (the tractor's own textures show the same things: mottled white,
# red chipped to the metal, dull reflective tape).
#   under: what shows where the paint is chipped off (None: bare metal parts, which do not chip)
#   chips: how much of a face's edge is chipped; scratches: how many on a 48 x 48 pixel face; grime: how dirty
BARE = ((92, 90, 88), 0.45, 0.65)    # bare steel: colour, roughness, metalness
RUST = ((118, 74, 46), 0.85, 0.10)
DIRT = (96, 88, 78)
PRIMER = (150, 148, 144)
WEAR = {
    'white': ('bare', 0.9, 7, 1.0),
    'red': ('bare', 1.0, 6, 0.8),
    'yellow': ('white', 0.8, 4, 0.7),
    'black': ('bare', 0.5, 3, 0.4),
    'steel': (None, 0.0, 5, 0.9),
    'zinc': (None, 0.0, 4, 0.6),
    'rubber': (None, 0.0, 0, 0.8),
}


def _scratches(seed, w, h, count, along):
    """pixels crossed by a face's scratches: {(x, y): (deep, strength)}. along: mostly lengthwise (the arms)"""
    out = {}
    for k in range(count):
        r = lambda j: noise(seed * 31 + k * 17 + j, seed * 7 + k * 101 + j * 13)
        x, y = r(1) * w, r(2) * h
        ang = (r(3) - 0.5) * 0.22 if along else r(3) * math.pi
        ln = (20 + r(4) * 140) if along else (6 + r(4) * 26)
        deep = r(5) > 0.62
        strength = 0.45 + 0.5 * r(6)
        dx, dy = math.cos(ang), math.sin(ang)
        t = 0.0
        while t < ln:
            px, py = int(x + dx * t), int(y + dy * t)
            if 0 <= px < w and 0 <= py < h:
                # (fading towards its ends; a break here and there)
                fade = min(1.0, t / 3.0, (ln - t) / 3.0)
                if noise(px * 3 + k, py * 5 + seed) > 0.12:
                    out[(px, py)] = (deep, strength * fade)
            t += 0.5
    return out


def paint_region(buf, x0, y0, w, h, pad_x, pad_y, name, seed, along=False, chip_edges=True, edge_dirt=True):
    """a worn patch of one paint drawn into the atlas: the rectangle at x0, y0 (w x h pixels); the faces drawn
    from it use its inside, pad_x / pad_y in from its edges, so what is chipped near that inner edge is chipped
    at the faces' edges. buf[y][x] = [r, g, b, roughness, metalness]"""
    _, base, rough, metal = PAINT[name]
    under, chips, nscr, grime = WEAR.get(name, (None, 0.0, 0, 0.0))
    iw, ih = w - 2 * pad_x, h - 2 * pad_y
    scr = _scratches(seed, w, h, int(round(nscr * (w * h) / (48.0 * 48.0) * (0.45 if along else 1.0))), along) if nscr else {}
    sx = 6.0 if along else 1.0  # (an arm's side is long and thin: its dirt lies in streaks along it)
    for ly in range(h):
        row = buf[y0 + ly]
        for lx in range(w):
            X, Y_ = x0 + lx, y0 + ly
            # how far inside the faces' edge this pixel is (0 at the edge and in the margin)
            d = max(0.0, min(lx - pad_x, pad_x + iw - 1 - lx, ly - pad_y, pad_y + ih - 1 - ly))
            g = 0.6 * smooth_noise(seed, lx / sx, ly, 9.0) + 0.4 * smooth_noise(seed + 1, lx / sx, ly, 3.5)
            col = list(base)
            r_, m_ = rough, metal
            if grime:
                ends = 0.0
                if along:  # dirtier at the ring end and towards the head, by the deck and the wheels
                    s = (lx - pad_x) / max(1.0, iw - 1.0)
                    ends = 0.5 * max(0.0, 1 - s / 0.07) + 0.6 * max(0.0, (s - 0.80) / 0.20)
                k = 1.0 - grime * (0.12 * g + (0.08 * math.exp(-d / 3.0) if edge_dirt else 0.0) + 0.10 * ends)
                mix = grime * (0.07 * g + 0.10 * ends)
                col = [c * k * (1 - mix) + DIRT[i] * mix for i, c in enumerate(col)]
                r_ = min(1.0, r_ + 0.18 * g * grime + 0.1 * ends)
            if under is not None and name in ('white', 'red'):
                # worn thin in patches: the primer shows through
                thin = smooth_noise(seed + 5, lx / sx, ly, 6.0)
                if thin > 0.72:
                    a = min(1.0, (thin - 0.72) / 0.12) * 0.35
                    col = [c * (1 - a) + PRIMER[i] * a for i, c in enumerate(col)]
                    r_ = min(1.0, r_ + 0.08)
            s_ = scr.get((lx, ly))
            if s_:
                deep, a = s_
                if under is None:      # bare metal: a bright line
                    col = [min(255.0, c * (1 + 0.30 * a)) for c in col]
                    r_ = max(0.2, r_ - 0.12 * a)
                elif deep and under == 'bare':
                    col = [c * (1 - a) + BARE[0][i] * a for i, c in enumerate(col)]
                    r_, m_ = r_ * (1 - a) + BARE[1] * a, BARE[2] * a
                else:                  # a scuff: the paint's surface taken off
                    light = PAINT['white'][1] if under == 'white' else tuple(0.5 * c + 0.5 * PRIMER[i] for i, c in enumerate(base))
                    col = [c * (1 - 0.6 * a) + light[i] * 0.6 * a for i, c in enumerate(col)]
            if chips and chip_edges:
                c_ = smooth_noise(seed + 2, lx, ly, 3.2)
                depth = (2.6 * max(0.0, c_ - 0.64) if along else 5.0 * max(0.0, c_ - 0.55)) * chips  # (an arm's side is only 16 pixels across)
                if d < depth:
                    if under == 'white':
                        cu, ru, mu = PAINT['white'][1], PAINT['white'][2], 0.0
                    elif smooth_noise(seed + 3, lx, ly, 4.0) > 0.70:
                        cu, ru, mu = RUST
                    else:
                        cu, ru, mu = BARE
                    col, r_, m_ = list(cu), ru, mu
            if name == 'rubber' and noise(X * 5, Y_ * 3) > 0.93:
                col = [c + 26 for c in col]  # dust
            if under is None and name != 'rubber' and smooth_noise(seed + 4, lx, ly, 2.6) > 0.80:
                a = 0.55  # a rust stain on bare metal
                col = [c * (1 - a) + RUST[0][i] * a for i, c in enumerate(col)]
                r_, m_ = r_ * (1 - a) + RUST[1] * a, m_ * (1 - a)
            grain = 1.0 + (noise(X, Y_) - 0.5) * 0.05
            row[X] = [max(0.0, min(255.0, c * grain)) for c in col] + [r_, m_]


def atlas_layers():
    """the atlas as rows of [r, g, b, roughness, metalness]"""
    white = PAINT['white']
    buf = [[[float(white[1][0]), float(white[1][1]), float(white[1][2]), white[2], white[3]] for _ in range(ATLAS)] for _ in range(ATLAS)]
    for name, (cell, col, rough, metal) in PAINT.items():
        x0, y0 = cell[0] * CELL, cell[1] * CELL
        if name in WEAR:
            paint_region(buf, x0, y0, CELL, CELL, PAD, PAD, name, 11 + cell[0] + 8 * cell[1])
        else:  # (the markers' paints: flat)
            for y in range(y0, y0 + CELL):
                for x in range(x0, x0 + CELL):
                    buf[y][x] = [float(col[0]), float(col[1]), float(col[2]), rough, metal]
    # the arms' sides: a long strip each, so that no two look alike
    for i in range(STRIPS):
        paint_region(buf, 0, STRIP_Y + i * STRIP_PITCH - STRIP_PAD_Y, ATLAS, STRIP_H + 2 * STRIP_PAD_Y, STRIP_PAD_X, STRIP_PAD_Y, 'white', 40 + i, along=True)
    # the stencils: on a patch of the same white (touched up when the marking was sprayed: not chipped), the letters worn
    for ti, text in enumerate(STENCILS):
        x0, y0, w, h = stencil_rect(text)
        paint_region(buf, x0 - 4, y0 - 4, w + 8, h + 8, 4, 4, 'white', 70 + ti, chip_edges=False, edge_dirt=False)
        for ci, ch in enumerate(text):
            for gy, line in enumerate(FONT[ch]):
                for gx, bit in enumerate(line):
                    if bit != '#':
                        continue
                    for py in range(STENCIL_SCALE):
                        for px in range(STENCIL_SCALE):
                            X0 = x0 + STENCIL_MARGIN + 4 + (ci * 6 + gx) * STENCIL_SCALE + px
                            Y0 = y0 + STENCIL_MARGIN + gy * STENCIL_SCALE + py
                            worn = smooth_noise(90 + ti, X0, Y0, 5.0)
                            if worn > 0.80 or noise(X0 * 3, Y0 * 7) < 0.03:
                                continue  # worn away
                            a = 0.92 if worn < 0.68 else 0.55
                            p = buf[Y0][X0]
                            buf[Y0][X0] = [p[0] * (1 - a) + 26 * a, p[1] * (1 - a) + 26 * a, p[2] * (1 - a) + 28 * a, p[3], p[4]]
    return buf


_LAYERS = []


def atlas_pixels(kind):
    """rows of (r, g, b, a). kind: 'diff' colours, 'nm' normals, 'rm' roughness and metalness"""
    if kind == 'nm':
        return [[(128, 128, 255, 255)] * ATLAS for _ in range(ATLAS)]
    if not _LAYERS:
        _LAYERS.append(atlas_layers())
    buf = _LAYERS[0]
    if kind == 'diff':
        return [[(int(p[0]), int(p[1]), int(p[2]), 255) for p in row] for row in buf]
    return [[(255, int(p[3] * 255), int(p[4] * 255), 255) for p in row] for row in buf]


def halve(rows):
    n = len(rows) // 2
    out = []
    for y in range(n):
        r0, r1 = rows[2 * y], rows[2 * y + 1]
        out.append([tuple((r0[2 * x][k] + r0[2 * x + 1][k] + r1[2 * x][k] + r1[2 * x + 1][k] + 2) // 4 for k in range(4)) for x in range(n)])
    return out


def dds(rows):
    """a square texture and all its mipmaps; rows of (r, g, b, a), top row first"""
    w = len(rows)
    levels = [rows]
    while len(levels[-1]) > 1:
        levels.append(halve(levels[-1]))
    hdr = struct.pack('<4sI', b'DDS ', 124)
    hdr += struct.pack('<6I', 0x1 | 0x2 | 0x4 | 0x1000 | 0x8 | 0x20000, w, w, w * 4, 0, len(levels))
    hdr += b'\0' * 44
    hdr += struct.pack('<2I4s5I', 32, 0x1 | 0x40, b'\0\0\0\0', 32, 0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000)
    hdr += struct.pack('<5I', 0x1000 | 0x8 | 0x400000, 0, 0, 0, 0)
    body = bytearray()
    for lv in levels:
        for row in lv:
            for r, g, b, a in row:
                body += bytes((b, g, r, a))
    return hdr + bytes(body)


def png(w, h, rows):
    raw = b''.join(b'\0' + bytes(v for px in row for v in px[:3]) for row in rows)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


# ---------------------------------------------------------------- pictures (flat-shaded, z-buffered, parallel views)
def picture(w, h, panels, atlas=None):
    """panels: [(mesh, view direction, (x, y, width, height) on the picture, focus)]; focus: None for the whole mesh,
    or (centre point, half size in metres) to look closely at a part"""
    img = [[(236, 238, 240)] * w for _ in range(h)]
    zb = [[1e9] * w for _ in range(h)]
    light = unit((0.35, 0.8, 0.5))
    for m, vdir, (ox, oy, vw, vh), focus in panels:
        fwd = unit(vdir)
        right = unit(cross(fwd, Y)) if abs(fwd[1]) < 0.99 else X
        up = cross(right, fwd)
        pts = [(dot(p, right), dot(p, up), dot(p, fwd)) for p, _, _, _ in m.v]
        if focus:
            cx, cy = dot(focus[0], right), dot(focus[0], up)
            s = min(vw, vh) / (2 * focus[1])
        else:
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]
            s = min((vw - 30) / (max(xs) - min(xs)), (vh - 30) / (max(ys) - min(ys)))
            cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        scr = [(ox + vw / 2 + (q[0] - cx) * s, oy + vh / 2 - (q[1] - cy) * s, q[2]) for q in pts]
        for i, j, k in m.tri:
            a, b, c = scr[i], scr[j], scr[k]
            x0, x1 = max(ox, int(min(a[0], b[0], c[0]))), min(ox + vw - 1, int(max(a[0], b[0], c[0])) + 1)
            y0, y1 = max(oy, int(min(a[1], b[1], c[1]))), min(oy + vh - 1, int(max(a[1], b[1], c[1])) + 1)
            if x0 > x1 or y0 > y1:
                continue
            pa, pb, pc = m.v[i][0], m.v[j][0], m.v[k][0]
            n = unit(cross(sub(pb, pa), sub(pc, pa)))
            if dot(n, fwd) > 0:
                continue  # facing away
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-9:
                continue
            sh = 0.35 + 0.65 * max(0.0, dot(n, light))
            col = PAINT[m.v[i][3]][1]
            flat = tuple(int(min(255, cc * sh)) for cc in col)
            uva, uvb, uvc = m.v[i][2], m.v[j][2], m.v[k][2]
            textured = atlas is not None and m.v[i][3] in WEAR
            for y in range(y0, y1 + 1):
                zr, ir = zb[y], img[y]
                for x in range(x0, x1 + 1):
                    l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
                    l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
                    l3 = 1 - l1 - l2
                    if l1 < 0 or l2 < 0 or l3 < 0:
                        continue
                    z = l1 * a[2] + l2 * b[2] + l3 * c[2]
                    if z < zr[x]:
                        zr[x] = z
                        if textured:
                            tu = min(ATLAS - 1, max(0, int((l1 * uva[0] + l2 * uvb[0] + l3 * uvc[0]) * ATLAS)))
                            tv = min(ATLAS - 1, max(0, int((l1 * uva[1] + l2 * uvb[1] + l3 * uvc[1]) * ATLAS)))
                            t = atlas[tv][tu]
                            ir[x] = (int(t[0] * sh), int(t[1] * sh), int(t[2] * sh))
                        else:
                            ir[x] = flat
    return png(w, h, img)


def obj(m, name):
    lines = ['# CATCC tow bar (generated by towbar.py), closed: x along the bar from the tow ring, y up, z right; metres', 'mtllib %s.mtl' % name, 'o %s' % name]
    for p, _, _, _ in m.v:
        lines.append('v %.5f %.5f %.5f' % p)
    for _, _, uv, _ in m.v:
        lines.append('vt %.5f %.5f' % (uv[0], 1 - uv[1]))
    for _, n, _, _ in m.v:
        lines.append('vn %.4f %.4f %.4f' % n)
    lines.append('usemtl %s' % name)
    for i, j, k in m.tri:
        lines.append('f %d/%d/%d %d/%d/%d %d/%d/%d' % (i + 1, i + 1, i + 1, j + 1, j + 1, j + 1, k + 1, k + 1, k + 1))
    mtl = 'newmtl %s\nKd 1 1 1\nmap_Kd %s_diff.png\n' % (name, name)
    return '\n'.join(lines) + '\n', mtl


def main(out, extras):
    head, arms, link = build_head(), (build_arm(-1), build_arm(1)), link_mesh()
    files = {
        # (named as their static types are, as the chock's and the route lines' are)
        'CATCC_Towbar.edm': towbar_edm(head, arms, link),
        'CATCC_AxleProbe.edm': marker_edm(build_marker(), build_flag()),
    }
    os.makedirs(os.path.join(out, 'Shapes', 'textures'), exist_ok=True)
    for name, f in files.items():
        data = edm.write(f)
        assert edm.write(edm.read(data), keep_table=True) == data, name + ': the written model does not read back the same'
        open(os.path.join(out, 'Shapes', name), 'wb').write(data)
    diff = atlas_pixels('diff')
    for kind, name in (('diff', 'catcc_towbar_diff'), ('nm', 'catcc_towbar_nm'), ('rm', 'catcc_towbar_diff_roughmet')):
        open(os.path.join(out, 'Shapes', 'textures', name + '.dds'), 'wb').write(dds(diff if kind == 'diff' else atlas_pixels(kind)))
    closed = posed(0.0, head, arms, link)
    lo, hi = bounds([closed])
    tip = pin_tip(0.0)
    print('tow bar: %d vertices, %d triangles in %d parts; closed it is %.3f m long (%.3f to %.3f), %.3f wide, %.3f high; its arms %.3f m square' %
          (len(closed.v), len(closed.tri), 3 + CHAIN_N, real(hi[0] - lo[0]), real(lo[0]), real(hi[0]), real(hi[2] - lo[2]), real(hi[1] - lo[1]), real(TUBE)))
    print('  argument %d: 0 closed (pin tips %.3f m apart), 0.5 open by %.2f degrees an arm (%.3f m apart), 0.5 to 1 closing again with the chain taut' %
          (JAW_ARG, real(2 * tip[1]), math.degrees(THETA_MAX), real(2 * pin_tip(THETA_MAX)[1])))
    print('  hook: pivotX=%.4f armZ0=%.5f pinU=%.4f pinW=%.4f a0=%.6f thetaMax=%.6f wheelUp=%.4f ringRest=%.4f' %
          (real(PIVOT_X), real(ARM_Z0), real(PIN_U), real(PIN_W), A0, THETA_MAX, real(WHEEL_R - WHEEL_V), real(FOOT_Y)))
    print('wrote', ', '.join(sorted(files)), 'and three textures to', out)
    if not extras:
        return
    extra = os.path.join(HERE, 'out')
    os.makedirs(extra, exist_ok=True)
    full = Mesh()  # (the OBJ copy at its real size)
    full.v = [(mul(p_, SCALE), n_, uv_, paint_) for p_, n_, uv_, paint_ in closed.v]
    full.tri = list(closed.tri)
    o, mtl = obj(full, 'catcc_towbar')
    open(os.path.join(extra, 'catcc_towbar.obj'), 'w').write(o)
    open(os.path.join(extra, 'catcc_towbar.mtl'), 'w').write(mtl)
    open(os.path.join(extra, 'catcc_towbar_diff.png'), 'wb').write(png(ATLAS, ATLAS, diff))
    mid = posed(0.70, head, arms, link)
    wide = posed(0.5, head, arms, link)
    iso = (0.60, -0.50, 0.62)
    open(os.path.join(extra, 'catcc_towbar_preview.png'), 'wb').write(picture(1500, 1000, [
        (closed, iso, (0, 0, 900, 520), None),                                   # the whole bar, closed
        (closed, (0.0, -1.0, 0.0001), (900, 0, 600, 170), None),                  # from above: closed
        (wide, (0.0, -1.0, 0.0001), (900, 170, 600, 200), None),                  # ... open (argument 0.5)
        (mid, (0.0, -1.0, 0.0001), (900, 370, 600, 150), None),                   # ... clamped (argument 0.7)
        (closed, (-0.55, -0.50, 0.67), (0, 520, 500, 480), ((0.12, 0.0, 0.0), 0.20)),          # the ring head
        (mid, (0.62, -0.45, -0.64), (500, 520, 500, 480), ((ARM_LEN + 0.30, 0.0, -0.20), 0.26)),  # a head, from inboard
        (closed, (0.0, 0.0, 1.0), (1000, 520, 500, 240), None),                   # from the side
        (mid, (0.55, -0.60, 0.58), (1000, 760, 500, 240), ((BOSS_U + 0.1, 0.0, 0.0), 0.42)),   # the chain, clamped
    ], diff))
    mk = Mesh()
    mk.merge(build_marker())
    mk.merge(build_flag())
    e = build_end()
    for s in (-1, 1):
        part = Mesh()
        part.v = [((p[0], p[1], s * (0.23 + p[2])), (n[0], n[1], s * n[2]), uv, paint) for p, n, uv, paint in e.v]
        part.tri = [(a, c, b) if s < 0 else (a, b, c) for a, b, c in e.tri]
        mk.merge(part)
    open(os.path.join(extra, 'catcc_axle_marker_preview.png'), 'wb').write(picture(700, 400, [(mk, (0.55, -0.45, 0.70), (0, 0, 700, 400), None)]))
    print('wrote the OBJ copy and the preview pictures to', extra)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1], False)
    else:
        main(os.path.join(HERE, '..', 'Mods', 'tech', 'CATCC-Crew'), True)
