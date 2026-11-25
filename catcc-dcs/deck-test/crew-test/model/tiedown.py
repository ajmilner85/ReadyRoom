"""The US Navy's TD-1A aircraft tiedown assembly: a chain hook in a deck padeye, nine feet of chain up to a tensioner
hooked into the aircraft's tiedown fitting, the spare chain hanging from the tensioner in loops. Its length, its rise
from the deck and its finish are three model arguments.

    python -I tiedown.py              writes into ../Mods/tech/CATCC-Crew, and model/out (OBJ, pictures)
    python -I tiedown.py <out dir>    writes the DCS files only, into <out dir> (the tests do this)

DCS files (a version 10 .edm written by edm.py, with towbar.py's mesh, tangent-frame and node helpers, and a copy of
wheel_chock.py's face, noise and BC1 / BC5 code; the textures beside the models, as the chock's are):
    Shapes/CATCC_Tiedown.edm                          the tiedown
    Shapes/textures/catcc_tiedown_diff.dds            colours (BC1)
    Shapes/textures/catcc_tiedown_nm.dds              normal map (BC5: red along the texture's width, green DOWN it)
    Shapes/textures/catcc_tiedown_diff_roughmet.dds   ambient occlusion (red), roughness (green), metalness (blue) (BC1)

THE REFERENCES (the user, 2026-11-24). What each gave:
  the profile   (the manual's line drawing of the tensioner from the side: "basically a perfect 2D profile") every
                outline of the tensioner's body is measured on its upper figure, in its pixels (CHEEK_PX and the
                others below): the cheek's outline, the pin and the raised ring round it, the two bolts in their lugs,
                the raised tongue at the neck with its small bolt, the cast arrow, the release lever's thin bar over
                the top with its lip turned down at the ring, the chain lock's hump, the chain held on the top of the
                jaw and going round its end
  the scale     the body (ring to jaw's end) 0.200 m: twice the ring's diameter in every photograph, and 9.5 pitches
                of the chain in the catalogue photograph. That makes the ring 0.10 m across, the neck 41 mm and the
                jaw 70 mm deep, the fitting to the chain lock 15.0 in at the shortest (Peck & Hale's 'B': 13.0 to 16.5)
  the widths    (photographs of red tensioners from the lever's side and end on) the two cheeks stand 66 mm apart over
                all at the jaw and close in to 28 mm at the ring; the lever's trigger plate is as wide as the jaw at
                the ring's end and narrows to two prongs, which run between the cheeks to the hinge bolt; the chain
                lock's ribbed housing shows between the prongs; the jaw's pin crosses between the cheeks
  the bar       (the user, with a photograph of yellow tensioners) "NOT a simple threaded rod": a flat slotted bar,
                threaded on its two narrow edges for part of its length, an eyelet at its end; a link joins the eyelet
                to the hook's eye; the ring has a block of a hub on the hook's side
  the hook      the padeye hook's shape at both ends (the user's choice over the catalogue's latched hook)
  the chain     (catalogue photograph) 9/32 in: 22 mm inside length (the pitch), 7.2 mm wire, 11 mm inside width;
                108 in of it (Peck & Hale's 'C')
  the finish    (photographs) the cheeks, neck and lever painted yellow or red over a primer, or left bare cast metal
                (COLOUR_ARG shows one); the ring, hub, chain lock, bar, bolts and hooks bare; the chain dark steel,
                rusty. WEAR FOLLOWS THE SHAPE (the user: not a noise layer): what stands proud is rubbed bare (the rim
                round a cheek, the ring round the pin, the bolts' lugs, the letters' tops, the lever's edges and ribs);
                the broad raised tongue keeps some paint; the open middle of a cheek's face is scuffed through the
                primer to the metal, the more the further from anything raised; beside a rim or a boss the paint is
                whole and the dirt stays; the lever is worn most at the wide end, where it is pulled. Noise only
                makes the edges of that ragged
  the use       (photographs, the user's sketch) the tensioner hangs at the fitting; the chain runs down to the padeye;
                what is not used of it goes round the jaw's end and hangs in loops

LIGHT: about 1,370 triangles for the tensioner, both hooks and the chain's first two links; each other link 48. The
chain is geometry (a link is shape, not surface: without alpha cut-outs it cannot be a texture), and all of its 124
links are always drawn, taut or hanging: about 7,200 triangles at every setting. Few draw calls: the taut chain is six
pieces of 2, 4, 8, 16, 32 and 64 links, shown and placed by the length (any even count is a sum of them); the spare
chain is two links round the jaw's end, loops of 24 links and one shorter loop, each one piece. At most 15 pieces are
drawn. The rims, bosses, lugs, tongue, cast words, the bar's teeth, the ring's grooves, pitting and rust are in the
textures.

THE MODEL'S FRAME: metres; the origin is the PADEYE: the centre of the bend of the chain's hook, where the padeye's bar
sits, on the deck; y up; x level, towards the aircraft's tiedown fitting (the script turns the model to face it).

THREE MODEL ARGUMENTS:
  LEN_ARG (10)    the length, padeye to fitting (the centre of the tensioner hook's bend), in metres / LEN_SCALE (4):
                  from L_MIN (0.512 m: the chain in the lock at its second link) to L_MAX (3.240 m: all of it out).
                  The tensioner moves out along the chain's line by the length; its body, ring and chain lock move
                  along the bar by what is left over a whole two links (0 to 0.044 m: the chain seats only with a link
                  on edge); the links between the padeye and the lock are drawn taut, the rest hang from the jaw.
  ELEV_ARG (11)   the chain's rise from the deck, in degrees / 90 (0 to 1): the whole assembly turns up about the
                  padeye by it; the spare chain's loops still hang straight down.
  COLOUR_ARG (12) the tensioner's finish: 0 yellow, 0.1 red, 0.2 bare metal (each holds to half way to the next). The
                  painted parts (the side plates, the neck, the lever) are in the model once in each finish, with
                  their own part of the textures, and one is shown.
So for a fitting at f and a padeye at p (in the deck's frame): L = |f - p|, heading the level direction from p to f,
LEN = L / 4, ELEV = asin((f - p).up / L) / 90 degrees.
The loops hang up to LOOP_DEEP (0.28 m) below the jaw's end: with the tensioner lower than about 0.36 m (a short
tiedown at a low angle) the lowest loop goes into the deck. Arguments set one at a time cannot tell how high it is.
"""
import math
import os
import struct
import sys
from array import array

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edm  # noqa: E402
import towbar as tb  # noqa: E402  (its Mesh helpers, tangent frames, quaternions, nodes, EDM file layout, PNG writer)

HERE = os.path.dirname(os.path.abspath(__file__))
X, Y, Z = (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)
INCH = 0.0254

# ---------------------------------------------------------------- helpers, as wheel_chock.py has them (copied so that
# this generator stands alone): texture regions, colour mixing, value noise, scratches, BC1 / BC5 DDS, flat faces
W = 1024

class Region:
    def __init__(self, name, w_mm, h_mm, da, db=None):
        self.name, self.w, self.h, self.da, self.db = name, w_mm, h_mm, da, (db or da)
        self.wp, self.hp = int(math.ceil(w_mm * self.da)), int(math.ceil(h_mm * self.db))
        self.x0 = self.y0 = 0

    def uv(self, a, b):
        return ((self.x0 + a * self.da) / W, (self.y0 + b * self.db) / W)


def mix(c, d, t):
    return (c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t)


def mul3(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)


def sstep(t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)


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


class FaceMesh(tb.Mesh):
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


# ---------------------------------------------------------------- dimensions (metres)
# the chain: 9/32 in
RW = 0.0036
P = 0.022
IW = 0.011
RC = (IW + 2 * RW) / 2          # a link's centre line: the radius of its ends
LA = (P + 2 * RW) / 2 - RC      # ... half its straight sides
N_LINKS = 124                   # 2.728 m (108 in is 124.7 links)
# the chain's hook in the padeye: the bend's centre line round the bar, an oval section; the eye ring at its shank's end
RB = 0.024
HOOK_R = (0.0085, 0.0065)       # section: in the hook's plane, across it
EYE_C, EYE_R, EYE_W = 0.090, 0.012, 0.0045
X0 = EYE_C + EYE_R - EYE_W - RW + (LA + RC)    # link 0's centre from the padeye
TRAVEL = 2 * P                  # how far the body moves along the bar (the chain seats every other link)
STEPS = N_LINKS // 2            # 62 settings of the pocket, two links apart
LEN_ARG, ELEV_ARG, COLOUR_ARG = 10, 11, 12
COLOURS = ('yellow', 'red', 'bare')   # the tensioner's finish: COLOUR_ARG 0, 0.1, 0.2
LEN_SCALE = 4.0
CHUNKS = 6                      # the taut chain's pieces: 2 ** (b + 1) links each
LOOP_N = 24                     # links in a full loop of spare chain
LOOP_W = 0.022                  # its legs apart
LOOP_TOP = -0.010               # its top below the point the spare chain leaves the tensioner
LOOP_Z = 0.0                    # ... and beside it (it hangs out between the cheeks at the jaw's end)
LOOP_FAN = [0.0, 0.55, -0.55, 1.1, -1.1]       # the full loops' turns about the vertical (radians)
PART_FAN = 1.6                  # the short loop's
LOOP_DEEP = -LOOP_TOP + (LOOP_N * P - math.pi * LOOP_W / 2) / 2 + LOOP_W / 2 + RC + RW
WRAP = 2                        # spare links round the jaw's end, from the chain lock to where the loops hang
NORMAL_VALUE = 1.0
NAMES = ('catcc_tiedown_diff', 'catcc_tiedown_nm', 'catcc_tiedown_diff_roughmet')
EPS = 1e-6

# ---------------------------------------------------------------- the tensioner, measured on the manual's drawing
# (the user's reference, "basically a perfect 2D profile": a side view with the hook end to the left, 493 x 306 px; its
# upper figure, the lever closed, read at 8 times its size with a grid). The tensioner's own frame: u from the fitting's
# bar in its hook's bend, along the slotted bar towards the jaw; v up (the lever's side); w across (the drawing is seen
# from +w). Widths across (w) are from the photographs of red tensioners seen from the lever's side and end on.
DRAW_NUT_X0, DRAW_X0, DRAW_X1 = 110.0, 143.0, 306.1   # the tensioning ring's far face; its face on the body; the jaw's end
DRAW_ROD_Y = 71.5               # the slotted bar's line
BODY_LEN = 0.200                # the body, ring to jaw's end: twice the ring's diameter in every photograph, and 9.5 pitches of its 9/32 in chain in the catalogue's
SC = BODY_LEN / (DRAW_X1 - DRAW_X0)   # metres a pixel (1.23 mm)
# a cheek (side plate): its outline, clockwise as drawn from the ring's top corner: the top edge under the lever, the
# lug of the lever's hinge bolt, the jaw's top, its rounded end, the straight underside back to the ring
CHEEK_PX = [(143.0, 57.1), (169.3, 54.75), (231.1, 49.25), (241.0, 48.4), (243.0, 44.6), (247.0, 42.2), (253.0, 42.0), (257.0, 43.6),
            (258.3, 39.5), (280.5, 39.5), (284.3, 41.4), (293.0, 46.0), (300.5, 52.0), (305.0, 59.0), (306.1, 63.5), (305.0, 70.0),
            (303.2, 79.0), (302.0, 89.5), (298.0, 92.6), (280.0, 95.3), (260.5, 97.0), (230.0, 95.5), (200.5, 93.25), (170.0, 91.5),
            (143.0, 90.5)]
CHEEK_Y0, CHEEK_Y1 = 39.5, 97.0
PIN_PX = (284.9, 63.3)          # the jaw's pin
PIN_HEAD_PX = 8.5               # its head's radius
BOSS_PX = (288.6, 63.9, 16.5, 13.75)   # the raised ring round it on the cheek: centre, radii
HINGE_PX = (250.1, 49.75)       # the release lever's hinge bolt (hexagon head), in a lug on the cheek's top edge
BOLT2_PX = (264.9, 87.0)        # the second bolt, in a lug on the underside
NECK_BOLT_PX = (150.0, 72.0)    # the small bolt through the neck
LUG_PX = 7.0                    # a bolt's lug: radius
# the raised tongue on the cheek at the neck (rounded, pointing to the jaw), and the step on it
TONGUE_PX = [(143.0, 57.1), (168.6, 60.1), (176.0, 64.0), (180.0, 69.0), (180.0, 76.0), (176.0, 81.5), (168.6, 85.75), (143.0, 90.5)]
TONGUE2_PX = [(143.0, 59.0), (160.0, 59.8), (168.0, 65.0), (172.4, 72.0), (169.5, 79.5), (162.0, 84.8), (143.0, 89.0)]
ARROW_PX = (240.5, 251.5, 255.0, 63.3)   # the cast arrow pointing at the pin: its shaft from x, to x; its point; y
TEXT_PX = {'HOOK END': ((213.0, 63.3), 0.9), 'FREE END': ((255.0, 75.0), 0.6)}   # cast words: centre, letter cell (mm)
LOCK_PX = (279.0, 33.5)         # the chain lock: the taut chain's link in it, on the top of the jaw
WRAP_PX = [(279.0, 33.5), (296.0, 36.5), (307.5, 50.0), (308.5, 66.0)]   # the spare chain's way round the jaw's end
EXIT_PX = (308.0, 62.0)         # where its loops hang from
# the release lever's top face from the side: the lip turned down to the neck at the ring, the bend, the trigger plate,
# the waist (prongs from here), the prongs' run, the hinge
LEVER_PX = [(146.0, 54.5), (160.5, 45.6), (173.0, 45.6), (198.0, 43.85), (236.0, 41.2), (250.1, 46.5)]
LEVER_HW = (0.030, 0.033, 0.031, 0.014)        # its half width at the first four: the trigger plate, to the prongs' width
PRONG = (0.0055, 0.014)         # a prong: its inside and outside edges from the middle
LEVER_T = 0.0032
LEVER_HMAX = max(LEVER_HW)
# the chain lock's housing between the prongs: its outline (the hump over the jaw in the drawing)
LOCK_BLOCK_PX = [(200.5, 43.5), (215.0, 38.8), (230.5, 35.3), (246.0, 34.2), (263.0, 33.9), (281.0, 36.0), (293.0, 41.5), (300.0, 50.0),
                 (300.0, 58.0), (200.5, 58.0)]
LOCK_HW = 0.005
CHEEK_T = 0.007                 # a cheek's thickness
CHEEK_OUT = (0.014, 0.033)      # the cheeks' outside faces from the middle: at the ring, at the jaw's end (they close in)
NECK_PX = (143.0, 180.0, 59.5, 89.0)   # the neck between the cheeks: x from, to; y top, bottom
RIM_W = 3.8                     # the raised rim round a cheek's face (mm)
# the hook's end (the user: "NOT a simple threaded rod": a slotted flat bar, threaded on its two edges for part of its
# length, an eyelet at its end; a link joins that to the hook's eye). u from the fitting:
CL_LA, CL_RC, CL_W = 0.010, 0.011, 0.0045      # the link: half its straight sides, its ends' radius, its wire
CL_C = EYE_C + (EYE_R - EYE_W) + (CL_LA + CL_RC) - CL_W
U_J = CL_C + CL_LA + CL_RC - CL_W              # where the link bears in the bar's eyelet: the joint the tensioner hangs from
BAR_T, BAR_HV, BAR_EYE_HV, BAR_SLOT, BAR_HOLE = 0.005, 0.0145, 0.017, 0.0035, 0.0065   # half thickness; half width over the threads, at the eyelet; half the slot; the eyelet's hole
BAR_U0 = U_J - 0.008            # its end at the hook
BAR_EYE = 0.028                 # its eyelet end's length
HUB_U0, HUB_LEN, HUB_HV, HUB_HW = BAR_U0 + BAR_EYE + 0.001, 0.018, 0.0165, 0.0095   # the ring's hub (a block the bar runs through), body home
NUT_U0 = HUB_U0 + HUB_LEN
NUT_T = (DRAW_X0 - DRAW_NUT_X0) * SC
NUT_RO = 41.0 * SC              # the tensioning ring's radius over its eight lugs
NUT_LUG = 0.004
NUT_CH = (0.007, 0.005)         # its rim rounded towards each face: along, in
NUT_PTS = 24                    # round it: eight lugs, two points up and one down each


def uv_px(x, y):
    return (NUT_U0 + (x - DRAW_NUT_X0) * SC, (DRAW_ROD_Y - y) * SC)


BODY = [uv_px(*q) for q in CHEEK_PX]
POCKET = uv_px(*LOCK_PX)        # (the link the taut chain is held by)
PIN = uv_px(*PIN_PX)
EXIT = uv_px(*EXIT_PX)
U_LO, U_HI = uv_px(DRAW_X0, 0)[0], uv_px(DRAW_X1, 0)[0]
V_HI, V_LO = uv_px(0, CHEEK_Y0)[1], uv_px(0, CHEEK_Y1)[1]
BAR_U1 = uv_px(190.0, 0)[0]     # the bar's end inside the neck
THREAD_U0 = BAR_U0 + BAR_EYE - 0.002
LEVER = [uv_px(*q) for q in LEVER_PX]
LEVER_S = [0.0]
for _i in range(1, len(LEVER)):
    LEVER_S.append(LEVER_S[-1] + math.dist(LEVER[_i - 1], LEVER[_i]))


def cheek_out(u):
    """the cheeks' outside faces from the middle at u: they close in from the jaw to the ring"""
    t = max(0.0, min(1.0, (u - U_LO) / (U_HI - U_LO)))
    return CHEEK_OUT[0] + (CHEEK_OUT[1] - CHEEK_OUT[0]) * t


def cheek_in(u):
    return cheek_out(u) - CHEEK_T


# the tensioner (from the bar's eyelet on) hangs from its joint with the link, turned about w so that the chain lock is
# on the chain's line; the hook and the link stay on the line
ALPHA = math.atan2(POCKET[1], POCKET[0] - U_J)
B_MIN = U_J + math.hypot(POCKET[0] - U_J, POCKET[1])   # the fitting to the chain lock (the centre of the link in it), shortest
L_MIN = X0 + P + B_MIN          # link 1 in the lock
L_MAX = L_MIN + STEPS * TRAVEL


def to_model(p):
    """a point of the tensioner's frame (u, v, w) to the frame of its hook's bend in the model (x back down the chain),
    turned about the joint"""
    u, v, w = p
    x, y = -(u - U_J), v
    c, sn = math.cos(ALPHA), math.sin(ALPHA)
    return (-U_J + c * x - sn * y, sn * x + c * y, -w)


def dir_model(d):
    o = to_model((0.0, 0.0, 0.0))
    return tb.sub(to_model(d), o)


def hook_model(p):
    """the hook's and the link's points: on the chain's line, not turned"""
    return (-p[0], p[1], -p[2])


ROD_DIR = dir_model((1.0, 0.0, 0.0))     # the way the body moves along the bar (towards the padeye)


def len_arg(L):
    return L / LEN_SCALE


def elev_arg(deg):
    return deg / 90.0


def setting(L):
    """for a length (held to L_MIN .. L_MAX): the pocket's step k, the link in the pocket, the body's move, the spare links"""
    L = min(L_MAX - 1e-9, max(L_MIN, L))
    k = min(int((L - L_MIN) // TRAVEL), STEPS - 1)
    return k, 1 + 2 * k, (L - L_MIN) - k * TRAVEL, N_LINKS - 2 - 2 * k


# ---------------------------------------------------------------- paths
def ring_path(la, rc, per_end=3):
    """a link's centre line in its plane (along, across), anticlockwise from (la, -rc)"""
    angs = [-90 + 180 * i / (per_end - 1) for i in range(per_end)]
    pts = []
    for cx, base in ((la, 0), (-la, 180)):
        for a in angs:
            pts.append((cx + rc * math.cos(math.radians(a + base)), rc * math.sin(math.radians(a + base))))
    return pts


def path_len(pts, closed):
    n = len(pts)
    return sum(math.dist(pts[i], pts[(i + 1) % n]) for i in range(n if closed else n - 1))


LINK2 = ring_path(LA, RC)
LINK_PERIM = path_len(LINK2, True)
_s = [0.0]
for _i in range(len(LINK2)):
    _s.append(_s[-1] + math.dist(LINK2[_i], LINK2[(_i + 1) % len(LINK2)]))
LINK_BEAR = (_s[1] * 1000, _s[4] * 1000)   # where the links bear on each other (mm along: the ends' middles)
EYE2 = ring_path(0.0, EYE_R, 4)
EYE_PERIM = path_len(EYE2, True)


def hook_path():
    """the hook's centre line in its plane (bend centre at the origin, shank along +x) with its section radii"""
    pts = [(EYE_C - EYE_R + 0.003, 0.0), (0.060, 0.005), (0.040, 0.014), (0.018, 0.022)]
    rad = [(0.0070, 0.0060), (0.0075, 0.0062), (0.0080, 0.0064), HOOK_R]
    for a in range(90, 271, 30):
        pts.append((RB * math.cos(math.radians(a)), RB * math.sin(math.radians(a))))
        rad.append(HOOK_R)
    pts += [(0.016, -0.0235), (0.034, -0.019), (0.048, -0.011)]
    rad += [(0.0075, 0.0060), (0.0062, 0.0054), (0.0046, 0.0042)]
    return pts, rad


HOOK2, HOOK_RAD = hook_path()
HOOK_LEN = path_len(HOOK2, False)
_hs = [0.0]
for _i in range(len(HOOK2) - 1):
    _hs.append(_hs[-1] + math.dist(HOOK2[_i], HOOK2[_i + 1]))
THROAT = (_hs[4] * 1000, _hs[10] * 1000)   # the bend: where the bar bears (mm along the hook)
BODY_PERIM = path_len(BODY, True)
CLINK2 = ring_path(CL_LA, CL_RC, 4)

# ---------------------------------------------------------------- the texture atlas (wheel_chock.py's way)
PADPX = 4
NUT_RIM = 2 * math.hypot(*NUT_CH) + (NUT_T - 2 * NUT_CH[0])     # across the ring's rim, over its rounded edges
REGIONS = [Region('link%d' % i, LINK_PERIM * 1000, 2 * math.pi * RW * 1000, 2.5) for i in range(4)] + [
    Region('hookA', HOOK_LEN * 1000, math.pi * (HOOK_R[0] + HOOK_R[1]) * 1000, 1.7),
    Region('hookB', HOOK_LEN * 1000, math.pi * (HOOK_R[0] + HOOK_R[1]) * 1000, 1.7),
    Region('eye', EYE_PERIM * 1000, 2 * math.pi * EYE_W * 1000, 2.5),
    Region('bar', (BAR_U1 - BAR_U0) * 1000, 2 * BAR_EYE_HV * 1000, 2.0),
    Region('bar_edge', (BAR_U1 - BAR_U0) * 1000, 2 * BAR_T * 1000, 2.0),
    Region('nut_side', 2 * math.pi * (NUT_RO - NUT_LUG / 2) * 1000, NUT_RIM * 1000, 1.5),
    Region('nut_face', 2 * NUT_RO * 1000, 2 * NUT_RO * 1000, 1.6),
    Region('dark', 24, 24, 1.5), Region('zinc', 32, 32, 1.5), Region('bolt', 24, 24, 2.0), Region('cast', 40, 40, 1.5),
]
for _c in COLOURS:   # what is painted, once for each finish
    REGIONS += [
        Region('plate_m:' + _c, (U_HI - U_LO) * 1000, (V_HI - V_LO) * 1000, 2.2), Region('plate_p:' + _c, (U_HI - U_LO) * 1000, (V_HI - V_LO) * 1000, 2.2),
        Region('plate_edge:' + _c, BODY_PERIM * 1000, CHEEK_T * 1000, 1.2),
        Region('block:' + _c, (NECK_PX[1] - NECK_PX[0]) * SC * 1000, 72.0, 1.5),
        Region('lever:' + _c, LEVER_S[-1] * 1000, 2 * LEVER_HMAX * 1000, 2.0),
        Region('paint:' + _c, 24, 24, 1.5),
    ]
R = {r.name: r for r in REGIONS}


def pack():
    shelves = []
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
# the paints: colour, the primer under it; how far the open face of a cheek is rubbed through (0 not, 1 all of it)
PAINTS = {'yellow': ((222, 178, 34), (228, 214, 164)), 'red': ((172, 44, 40), (216, 164, 152))}
PANEL_WEAR = {'yellow': 0.34, 'red': 0.52, 'bare': 0.40}
ALU = (176, 176, 172)           # the cast metal under the paint
STEEL = (100, 98, 94)           # forged hooks
CHAIN = (80, 78, 75)
BRIGHT = (172, 170, 164)
RUST = (118, 74, 46)
DIRT = (74, 66, 56)
DARK = (24, 22, 20)
NUT = (124, 122, 117)
ROD = (152, 150, 143)
GREASE = (60, 54, 44)
ZINC = (140, 139, 134)

FONT = {
    'H': ('#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'), 'O': ('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
    'K': ('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'), 'E': ('#####', '#....', '#....', '####.', '#....', '#....', '#####'),
    'N': ('#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'), 'D': ('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
    'P': ('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'), 'U': ('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
    'L': ('#....', '#....', '#....', '#....', '#....', '#....', '#####'), 'V': ('#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'),
    'R': ('####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'), 'T': ('#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'),
    'S': ('.####', '#....', '#....', '.###.', '....#', '....#', '####.'), 'A': ('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
    'F': ('#####', '#....', '#....', '####.', '#....', '#....', '#....'), ' ': ('.....',) * 7,
    'I': ('.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'), 'G': ('.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'),
    '&': ('.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'),
}


def text_at(a, b, lines, ac, bc, cell):
    """1 where a cast letter is at (a, b) mm: lines centred on (ac, bc), letters 5 x 7 cells of `cell` mm"""
    lh = 9 * cell
    b0 = bc - (len(lines) * lh - 2 * cell) / 2
    li = int((b - b0) // lh)
    if li < 0 or li >= len(lines):
        return 0
    row = int((b - b0 - li * lh) // cell)
    if row > 6:
        return 0
    text = lines[li]
    a0 = ac - (len(text) * 6 - 1) * cell / 2
    col = int((a - a0) // cell)
    if col < 0 or col >= len(text) * 6:
        return 0
    ch, gx = text[col // 6], col % 6
    return 1 if gx < 5 and FONT[ch][row][gx] == '#' else 0


def poly_inside(pts, x, y):
    """how far inside a polygon a point is (negative outside)"""
    inside, best = False, 1e9
    n = len(pts)
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
    return best if inside else -best


# ---------------------------------------------------------------- what is on each face: (a, b) mm -> height (mm), colour,
# ambient occlusion, roughness, metalness
def face_link(seed):
    """a chain link: dark steel, pitted and rusty, bright where it bears on its neighbours (the inside of its ends)"""
    hh = 2 * math.pi * RW * 1000
    inner = hh * 0.375          # (the section's inside: its angle pi less the sweep's quarter-turn start)

    def f(a, b):
        pit = vn(a / 1.4 + seed * 7, b / 1.4 + seed)
        h = 0.16 * (pit - 0.5)
        col = mul3(CHAIN, 0.86 + 0.22 * vn(a / 8.0 + seed * 3, b / 5.0))
        ro, me = 0.62, 0.75
        r = vn(a / 6.0 + seed * 11, b / 4.5 + 40) + 0.25 * vn(a / 1.8, b / 1.8 + seed)
        if r > 0.78:
            t = min(1.0, (r - 0.78) / 0.2)
            col, ro, me, h = mix(col, RUST, t), ro + (0.88 - ro) * t, me * (1 - 0.8 * t), h + 0.1 * t
        for u in LINK_BEAR:
            d = math.hypot((a - u) / 4.5, (b - inner) / 3.5)
            if d < 1.0:
                t = sstep(1.0 - d)
                col, ro, me = mix(col, BRIGHT, 0.85 * t), ro - 0.25 * t, me + (0.95 - me) * t
        return h, col, 1.0 - 0.2 * sstep(1.0 - abs(b - inner) / (hh / 4)), ro, me
    return f


def face_steel(seed, length, throat, reg):
    """forged steel: grey, a faint parting line along its outside, rust, worn bright in a hook's throat"""
    def g(a, b):
        hh = R[reg].h
        h = 0.12 * (vn(a / 2.2 + seed, b / 2.2) - 0.5)
        d = min(b, hh - b)
        h += 0.35 * sstep(1.0 - d / 0.8)
        col = mul3(STEEL, 0.84 + 0.24 * vn(a / 14.0 + seed * 5, b / 8.0))
        ro, me = 0.55, 0.8
        r = vn(a / 10.0 + seed * 9, b / 6.0 + 20)
        if r > 0.7:
            t = min(1.0, (r - 0.7) / 0.2)
            col, ro, me = mix(col, RUST, 0.8 * t), ro + 0.3 * t, me * (1 - 0.7 * t)
        if throat and throat[0] < a < throat[1]:   # the inside of the bend, worn on the padeye's bar or the fitting
            t = sstep(1.0 - abs(b - hh / 2) / (hh / 4)) * sstep(min(a - throat[0], throat[1] - a) / 10.0)
            col, ro, me = mix(col, BRIGHT, 0.85 * t), ro - 0.25 * t, me + (0.95 - me) * t
        if a > length - 6:
            col = mix(col, BRIGHT, 0.3)
        return h, col, 1.0, ro, me
    return g


def face_bar():
    """the slotted bar's flat face (a from its end at the hook, b across from the eyelet's upper edge): the eyelet's
    hole, the thread's teeth cut in both edges beyond the eyelet, grease in them"""
    hv = BAR_EYE_HV * 1000
    hole = ((U_J + BAR_HOLE - BAR_U0) * 1000, BAR_HOLE * 1000)
    t0 = (THREAD_U0 - BAR_U0) * 1000

    def f(a, b):
        v = hv - b
        col = mul3(ROD, 0.84 + 0.16 * vn(a / 9.0, b / 6.0))
        h, ao, ro, me = 0.0, 1.0, 0.42, 0.85
        r = math.hypot(a - hole[0], v)
        if r < hole[1] + 1.0:
            t = sstep((hole[1] + 1.0 - r) / 1.5)
            col, h, ao = mix(col, DARK, t), -3.0 * t, 1.0 - 0.7 * t
        elif r < hole[1] + 4.0:
            col = mix(col, BRIGHT, 0.4)                 # worn by the link
        e = BAR_HV * 1000 - abs(v)                      # in from a threaded edge
        if a > t0 and e < 2.4:
            t = (a / 2.5) % 1.0
            tri = 1.0 - abs(2.0 * t - 1.0)
            if e < 2.4 * (1.0 - tri):                   # between two teeth
                col, h, ao, ro, me = mix(GREASE, DARK, 0.4), -1.6, 0.5, 0.7, 0.3
            else:
                col = mix(col, GREASE, 0.25)
        slot = BAR_SLOT * 1000 - abs(v)
        if a > BAR_EYE * 1000 and -1.0 < slot < 0.0:
            col = mix(col, BRIGHT, 0.3)                 # the slot's edge
        return h, mix(col, DIRT, 0.08 + 0.14 * vn(a / 11.0 + 3, b / 5.0)), ao, ro, me
    return f


def face_bar_edge():
    """the bar's threaded edge (a along it from its end at the hook, b across its thickness)"""
    t0 = (THREAD_U0 - BAR_U0) * 1000

    def f(a, b):
        if a < t0:
            return 0.0, mul3(ROD, 0.86 + 0.12 * vn(a / 5.0, b / 3.0)), 1.0, 0.42, 0.85
        t = (a / 2.5) % 1.0
        tri = 1.0 - abs(2.0 * t - 1.0)
        g = (1.0 - tri) * (0.5 + 0.4 * vn(a / 7.0, b / 3.0))
        return 1.4 * tri, mix(mul3(ROD, 0.9 + 0.14 * tri), GREASE, g), 0.6 + 0.4 * tri, 0.4 + 0.3 * g, 0.85 - 0.4 * g
    return f


def face_nut_side():
    """the tensioning ring's rim (a round it, b across it over its rounded edges): cast metal, a parting line round its
    middle, rubbed bright on the lugs' corners"""
    ln = NUT_RIM * 1000
    wd = 2 * math.pi * (NUT_RO - NUT_LUG / 2) * 1000

    def f(a, b):
        edge = min(b, ln - b)
        h = 0.25 * sstep(1.0 - abs(b - ln / 2) / 0.9)
        col = mix(mul3(NUT, 0.88 + 0.14 * vn(a / 10.0, b / 6.0)), DIRT, 0.10 + 0.22 * vn(a / 14.0 + 5, b / 9.0))
        k = math.hypot(*NUT_CH) * 1000
        if abs(edge - k) < 1.6:
            col = mix(col, BRIGHT, 0.22)                # the rounded edges' crowns
        g = abs(((a / wd * 8.0 + 0.5) % 1.0) - 0.5) * wd / 8.0     # mm from the nearest groove between two lugs
        ao = 1.0
        if g < 4.5:
            t = sstep(1.0 - g / 4.5)
            col, ao = mix(col, mix(DARK, DIRT, 0.5), 0.6 * t), 1.0 - 0.4 * t
        elif g < 7.5:
            col = mix(col, BRIGHT, 0.15)                # the lugs' corners
        return h + 0.1 * (vn(a / 1.5, b / 1.5) - 0.5), col, ao, 0.52, 0.85
    return f


def face_nut_face():
    """the ring's face: the hole the bar runs through, a sunk channel round the hub, TIGHTEN and an arrow cast round the
    rim"""
    c = NUT_RO * 1000

    def f(a, b):
        x, y = a - c, c - b
        r = math.hypot(x, y)
        col = mul3(NUT, 0.86 + 0.14 * vn(a / 6.0 + 7, b / 6.0))
        h, ao = 0.0, 1.0
        if abs(x) < BAR_T * 1000 + 1.0 and abs(y) < BAR_HV * 1000 + 1.0:
            col, ao, h = DARK, 0.3, -4.0
        elif 21.0 < r < 35.0:                           # the channel
            t = sstep(min(r - 21.0, 35.0 - r) / 2.0)
            col, ao, h = mix(col, mix(DARK, DIRT, 0.5), 0.75 * t), 1.0 - 0.45 * t, -2.5 * t
        elif r >= 35.0:
            th = math.atan2(x, y)                       # round from the top
            if text_at(th * 41.0, r, ['TIGHTEN'], 0.0, 41.0, 0.85):
                h, col = 0.45, mix(col, BRIGHT, 0.5)
            ka = th * 41.0 - 26.0                       # the arrow after the word
            if 0.0 <= ka <= 16.0 and (abs(r - 41.0) < 0.6 or (ka > 11.0 and abs(abs(r - 41.0) - (16.0 - ka) * 0.6) < 0.7)):
                h, col = 0.45, mix(col, BRIGHT, 0.5)
        return h, mix(col, DIRT, 0.10 + 0.2 * vn(a / 9.0, b / 9.0 + 4)), ao, 0.5, 0.85
    return f


def finish(a, b, expo, prot, seed, colour, sharp=False):
    """the tensioner's finish at (a, b) mm: colour, roughness, metalness. expo (0..1): how open the place is to rubbing
    (a raised rim, a boss, a letter's top: 1; the open middle of a face: some; beside something raised: none); prot
    (0..1): how sheltered it is (dirt stays there). Painted: where it is rubbed the paint is through to its primer and
    then to the cast metal, the edge between them ragged; bare: the cast metal, rubbed bright where it is open"""
    n = 0.55 * vn(a / 11.0 + seed * 3, b / 11.0 + seed) + 0.30 * vn(a / 4.0 + seed, b / 4.0 + 7) + 0.15 * vn(a / 1.4, b / 1.4 + seed)
    g = 0.04 * (grain(a, b, seed) - 0.5)
    if colour == 'bare':
        k = max(0.0, min(1.0, (expo - 0.6 * n) * 2.0))
        col, ro, me = mul3(ALU, 0.84 + 0.12 * vn(a / 14.0 + seed, b / 9.0) + g + 0.18 * k), 0.52 - 0.14 * k, 0.8
    else:
        paint, primer = PAINTS[colour]
        w = expo - n
        if sharp or w > 0.14:
            col, ro, me = mix(ALU, DIRT, 0.10 + 0.2 * vn(a / 5.0, b / 5.0 + seed)), 0.42, 0.75
        elif w > 0.0:
            col, ro, me = mix(primer, paint, 0.3 * vn(a / 2.0 + seed, b / 2.0)), 0.62, 0.0
        else:
            col, ro, me = mul3(paint, 0.88 + 0.12 * vn(a / 16.0 + seed, b / 10.0) + g), 0.55, 0.0
    col = mix(col, DIRT, min(0.7, 0.07 + 0.40 * prot + 0.10 * vn(a / 12.0 + 30, b / 7.0 + seed)))
    return col, ro, me


def lvl(n):
    """1 inside something raised, 0 beyond its foot; n: mm outside it (negative inside)"""
    return sstep(0.5 - n / 1.5)


def face_plate(side, colour):
    """a cheek's outside face (side 'p': the drawing's side, +w; 'm': -w, the same mirrored so that its words read).
    Raised: the rim round its outline, the ring round the pin, the lugs under the two bolts, the tongue at the neck;
    the face between them sunk, HOOK END, FREE END and the arrow cast on it. The finish is worn by that shape"""
    mmpx = SC * 1000
    seed = 21 + (side == 'm')
    sc = scratches(seed, (U_HI - U_LO) * 1000, (V_HI - V_LO) * 1000, 34, True, (6.0, 30.0))
    wear = PANEL_WEAR[colour]

    def at(x, y):
        return ((x - DRAW_X0) if side == 'p' else (DRAW_X1 - x)) * mmpx, (y - CHEEK_Y0) * mmpx
    words = [(t, at(*c), cell) for t, (c, cell) in TEXT_PX.items()]
    ax0, ax1, ax2, ay = ARROW_PX

    def f(a, b):
        x = DRAW_X0 + a / mmpx if side == 'p' else DRAW_X1 - a / mmpx
        y = CHEEK_Y0 + b / mmpx
        d = poly_inside(CHEEK_PX, x, y) * mmpx
        nb = (math.hypot((x - BOSS_PX[0]) / BOSS_PX[2], (y - BOSS_PX[1]) / BOSS_PX[3]) - 1.0) * BOSS_PX[3] * mmpx
        nh = (math.hypot(x - HINGE_PX[0], y - HINGE_PX[1]) - LUG_PX) * mmpx
        n2 = (math.hypot(x - BOLT2_PX[0], y - BOLT2_PX[1]) - LUG_PX) * mmpx
        nt = -poly_inside(TONGUE_PX, x, y) * mmpx
        near = min(d - RIM_W, nb, nh, n2, nt)           # mm from the nearest raised thing (negative on one)
        raised = lvl(near)
        step = lvl(-poly_inside(TONGUE2_PX, x, y) * mmpx)
        h = 0.9 * raised + 0.7 * step + edge_fall(max(d, 0.0), 1.5, 1.0)
        mark = 0
        if raised < 0.3:
            for t, (ac, bc), cell in words:
                mark = mark or text_at(a, b, [t], ac, bc, cell)
            if ax0 <= x <= ax1 and abs(y - ay) < 0.7:
                mark = 1
            if ax1 < x <= ax2 and abs(y - ay) < 2.3 * (ax2 - x) / (ax2 - ax1):
                mark = 1
        if mark:
            h += 0.5
        sv = sc.get((int(a * 2), int(b * 2)), 0.0)
        proud = lvl(min(d - RIM_W, nb, nh, n2))            # the narrow raised things: rubbed bare
        expo = max(proud, 0.66 * raised + 0.3 * lvl(abs(nt) - 1.2) * raised, 0.9 * mark, wear * sstep((near - 1.5) / 9.0) + 0.45 * sv)
        prot = (1.0 - raised) * (1.0 - mark) * sstep(1.0 - near / 3.0)
        col, ro, me = finish(a, b, expo, prot, seed, colour, sharp=d < 0.8)
        return h, col, 1.0 - 0.22 * prot, ro, me
    return f


def face_plate_edge(colour):
    def f(a, b):
        col, ro, me = finish(a, b, 0.95, 0.0, 23, colour)
        return edge_fall(min(b, CHEEK_T * 1000 - b), 1.5, 1.0), col, 1.0, ro, me
    return f


def face_block(colour):
    def f(a, b):
        col, ro, me = finish(a, b, 0.2, 0.5, 24, colour)
        return 0.0, col, 0.85, ro, me
    return f


def lever_at(sv):
    """the release lever's half width at sv metres along it from its lip's edge (the trigger plate), or None on the prongs"""
    for i in range(3):
        if sv <= LEVER_S[i + 1]:
            return LEVER_HW[i] + (LEVER_HW[i + 1] - LEVER_HW[i]) * (sv - LEVER_S[i]) / (LEVER_S[i + 1] - LEVER_S[i])
    return None


def face_lever(colour):
    """the release lever from above (a along it from its lip's edge at the ring, b across it): the trigger plate with
    PULL & LIFT TO RELEASE cast across it (read from the ring) and the prongs' two ribs running on into it, then the
    prongs. Worn at its edges, on the ribs and letters, and where it is pulled"""
    s1, s3 = LEVER_S[1] * 1000, LEVER_S[3] * 1000
    sc = scratches(25, LEVER_S[-1] * 1000, 2 * LEVER_HMAX * 1000, 30, True, (8.0, 40.0))
    wear = PANEL_WEAR[colour]

    def f(a, b):
        w = b - LEVER_HMAX * 1000
        hw = lever_at(a / 1000)
        if hw is None:                                  # a prong
            d = min(abs(w) - PRONG[0] * 1000, PRONG[1] * 1000 - abs(w))
            rib, mark = 0.0, 0
        else:
            d = min(hw * 1000 - abs(w), a)
            rib = lvl(abs(abs(w) - (PRONG[0] + PRONG[1]) * 500) - 1.6) * sstep((a - (s1 + 20.0)) / 6.0)
            mark = text_at(-w, a, ['PULL & LIFT', 'TO RELEASE'], 0.0, s1 + 10.0, 0.75)
        edge = sstep((1.8 - d) / 1.0)
        h = 0.6 * rib + (0.45 if mark else 0.0) + edge_fall(max(d, 0.0), 1.0, 1.0)
        pulled = sstep((s1 + 26.0 - a) / 14.0)          # the wide end, where the hand takes it
        sv = sc.get((int(a * 2), int(b * 2)), 0.0)
        expo = max(edge, 0.95 * rib, 0.9 * mark, wear * (0.55 + 0.6 * pulled) + 0.45 * sv)
        prot = (1.0 - rib) * (1.0 - mark) * (1.0 - edge) * 0.25
        col, ro, me = finish(a, b, expo, prot, 25, colour, sharp=d < 0.6)
        return h, col, 1.0, ro, me
    return f


def face_flat(c, rough, metal, dirt=0.15):
    def f(a, b):
        return 0.0, mix(mul3(c, 0.88 + 0.12 * vn(a / 4.0 + 13, b / 4.0)), DIRT, dirt * vn(a / 6.0, b / 6.0 + 2)), 1.0, rough, metal
    return f


def face_bolt():
    """a bolt's head from above (and its sides): dark steel, its corners and face rubbed, rust in the middle"""
    def f(a, b):
        r = math.hypot(a - 12.0, b - 12.0)
        col = mul3((104, 101, 96), 0.86 + 0.16 * vn(a / 3.0, b / 3.0))
        if 0.62 * vn(a / 4.0 + 9, b / 4.0) + 0.38 * vn(a / 1.2, b / 1.2) > 0.62:
            col = mix(col, RUST, 0.55)
        if r > 8.5:
            col = mix(col, BRIGHT, 0.4)
        return -0.3 * sstep(1.0 - r / 2.0), mix(col, DIRT, 0.15), 1.0, 0.5, 0.8
    return f


def face_cast():
    """the chain lock's housing and the ring's hub: bare cast metal, ribs across it, dirt between them"""
    def f(a, b):
        t = (a / 3.2) % 1.0
        rib = sstep(1.0 - abs(2.0 * t - 1.0) * 1.6)
        col = mul3(NUT, 0.8 + 0.2 * rib + 0.1 * (vn(a / 5.0, b / 5.0) - 0.5))
        return 0.5 * rib, mix(col, DIRT, 0.35 * (1.0 - rib) + 0.1), 0.75 + 0.25 * rib, 0.55, 0.8
    return f


def face_paint(colour):
    """the painted parts' undersides and edges: rubbed through over most of them"""
    def f(a, b):
        col, ro, me = finish(a, b, 0.62, 0.15, 26, colour)
        return 0.0, col, 1.0, ro, me
    return f


FACES = {
    'link0': face_link(1), 'link1': face_link(2), 'link2': face_link(3), 'link3': face_link(4),
    'hookA': face_steel(5, HOOK_LEN * 1000, THROAT, 'hookA'), 'hookB': face_steel(6, HOOK_LEN * 1000, THROAT, 'hookB'),
    'eye': face_steel(7, EYE_PERIM * 1000, None, 'eye'), 'bar': face_bar(), 'bar_edge': face_bar_edge(),
    'nut_side': face_nut_side(), 'nut_face': face_nut_face(),
    'dark': face_flat((66, 63, 60), 0.6, 0.7), 'zinc': face_flat(ZINC, 0.4, 0.85), 'bolt': face_bolt(), 'cast': face_cast(),
}
for _c in COLOURS:
    FACES.update({'plate_m:' + _c: face_plate('m', _c), 'plate_p:' + _c: face_plate('p', _c), 'plate_edge:' + _c: face_plate_edge(_c),
                  'block:' + _c: face_block(_c), 'lever:' + _c: face_lever(_c), 'paint:' + _c: face_paint(_c)})


def atlas():
    """the atlas's layers: colour (r, g, b), normal (x, y), ambient occlusion, roughness, metalness; bytes"""
    from array import array
    n = W * W
    hgt = array('f', bytes(4 * n))
    col = bytearray(bytes(CHAIN) * n)
    ao, ro, me = bytearray(b'\xff' * n), bytearray(b'\xa0' * n), bytearray(n)
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
    # the normal map from each region's heights (mm): red along the texture's width, green DOWN it
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


# ---------------------------------------------------------------- the meshes
class Mesh(FaceMesh):
    def sweep(self, pts, rads, nrm, closed, sides, reg, phase=0.0, caps=False):
        """a tube along a path in the plane square to nrm; rads: (in the plane, across it) at each point; the region's
        width along the path, its height round it"""
        n = len(pts)
        tang = []
        for i in range(n):
            a = pts[(i - 1) % n] if closed else pts[max(0, i - 1)]
            b = pts[(i + 1) % n] if closed else pts[min(n - 1, i + 1)]
            tang.append(tb.unit(tb.sub(b, a)))
        total = sum(tb.length(tb.sub(pts[(i + 1) % n], pts[i])) for i in range(n if closed else n - 1))
        rings, s = [], 0.0
        for i in range(n + 1 if closed else n):
            if i:
                s += tb.length(tb.sub(pts[i % n], pts[i - 1]))
            p, t = pts[i % n], tang[i % n]
            side = tb.unit(tb.cross(t, nrm))
            ri, ro_ = rads[i % n]
            ring = []
            for k in range(sides + 1):
                th = phase + 2 * math.pi * k / sides
                off = tb.comb((0, 0, 0), (side, ri * math.cos(th)), (nrm, ro_ * math.sin(th)))
                nn = tb.comb((0, 0, 0), (side, math.cos(th) / ri), (nrm, math.sin(th) / ro_))
                ring.append(self.vert(tb.add(p, off), nn, reg.uv(reg.w * s / total, reg.h * k / sides), reg.name))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for k in range(sides):
                a, b, c, d = rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]
                self.face(a, b, c)
                self.face(a, c, d)
        if caps and not closed:
            for ring, t, u in ((rings[0], tb.mul(tang[0], -1), 0.5), (rings[-1], tang[-1], reg.w - 0.5)):
                ids = [self.vert(self.v[q][0], t, reg.uv(u, reg.h * (0.5 + 0.4 * math.cos(2 * math.pi * k / sides))), reg.name) for k, q in enumerate(ring[:-1])]
                for k in range(1, sides - 1):
                    self.face(ids[0], ids[k], ids[k + 1], t)

    def slab(self, outline, w0, w1, cap_reg, cap_ab, edge_reg, edge_b=(0.0, None)):
        """a plate: the outline (u, v) from w0 to w1 (numbers, or functions of u: a plate set at a slant); its two faces
        from cap_ab(u, v, which) on cap_reg, its edge round the edge region (along it, across the thickness)"""
        f0 = w0 if callable(w0) else (lambda u: w0)
        f1 = w1 if callable(w1) else (lambda u: w1)
        tris = tb.triangulate(outline)
        for fw, nz in ((f0, -1.0), (f1, 1.0)):
            ids = []
            for u, v in outline:
                g = (fw(u + 1e-4) - fw(u - 1e-4)) / 2e-4
                ids.append(self.vert((u, v, fw(u)), (-g * nz, 0.0, nz), cap_reg.uv(*cap_ab(u, v, nz)), cap_reg.name))
            for a, b, c in tris:
                self.face(ids[a], ids[b], ids[c], (0.0, 0.0, nz))
        n = len(outline)
        area = sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n))
        s = 0.0
        tot = path_len(outline, True)
        e0, e1 = edge_b[0], edge_b[1] if edge_b[1] is not None else edge_reg.h
        for i in range(n):
            (ua, va), (ub, vb) = outline[i], outline[(i + 1) % n]
            ln = math.hypot(ub - ua, vb - va)
            nn = ((vb - va) / ln, -(ub - ua) / ln, 0.0) if area > 0 else (-(vb - va) / ln, (ub - ua) / ln, 0.0)
            a0, a1 = edge_reg.w * s / tot, edge_reg.w * (s + ln) / tot
            self.poly([(ua, va, f0(ua)), (ub, vb, f0(ub)), (ub, vb, f1(ub)), (ua, va, f1(ua))], nn, edge_reg, [(a0, e0), (a1, e0), (a1, e1), (a0, e1)])
            s += ln

    def transform(self, fn, fd):
        self.v = [(fn(p), tb.unit(fd(n)), uv, tag) for p, n, uv, tag in self.v]
        return self


def plane_pts(c, e1, e2, pts2):
    return [tb.comb(c, (e1, x), (e2, y)) for x, y in pts2]


def link(m, c, e_long, e_across, idx):
    """a chain link centred on c, long along e_long, its plane holding e_across"""
    m.sweep(plane_pts(c, e_long, e_across, LINK2), [(RW, RW)] * len(LINK2), tb.unit(tb.cross(e_long, e_across)), True, 4, R['link%d' % (idx % 4)], phase=math.pi / 4)


def eye(m, c, e_long, e_across):
    m.sweep(plane_pts(c, e_long, e_across, EYE2), [(EYE_W, EYE_W)] * len(EYE2), tb.unit(tb.cross(e_long, e_across)), True, 4, R['eye'], phase=math.pi / 4)


def link_frame(i):
    """link i's long direction and the other direction in its plane: even links lie flat (x-z), odd ones on edge (x-y)"""
    return (X, Z) if i % 2 == 0 else (X, Y)


def padeye_hook():
    """the chain's hook in the padeye (its bend's centre at the origin), its eye, and links 0 and 1"""
    m = Mesh()
    m.sweep([(x, y, 0.0) for x, y in HOOK2], HOOK_RAD, Z, False, 6, R['hookB'], caps=True)
    eye(m, (EYE_C, 0.0, 0.0), X, Y)
    for i in (0, 1):
        e1, e2 = link_frame(i)
        link(m, (X0 + i * P, 0.0, 0.0), e1, e2, i)
    return m


def chunk(b):
    """2 ** (b + 1) links of the taut chain, the first (lying flat) centred on the origin"""
    m = Mesh()
    for i in range(2 ** (b + 1)):
        e1, e2 = link_frame(i)
        link(m, (i * P, 0.0, 0.0), e1, e2, i + b)
    return m


def flat_piece(m, u0, u1, v0, v1, top, bottom, ends):
    """a piece of the slotted bar: from u0 to u1 and v0 to v1, its two flat faces on the bar's face texture; top / bottom:
    the regions of its +v and -v edges (None: not made); ends: of its -u and +u ends"""
    t = BAR_T
    br = R['bar']
    ab = lambda u, v: ((u - BAR_U0) * 1000, (BAR_EYE_HV - v) * 1000)
    for w, nz in ((-t, -1.0), (t, 1.0)):
        m.poly([(u0, v0, w), (u1, v0, w), (u1, v1, w), (u0, v1, w)], (0.0, 0.0, nz), br, [ab(u0, v0), ab(u1, v0), ab(u1, v1), ab(u0, v1)])
    for reg, v, ny in ((top, v1, 1.0), (bottom, v0, -1.0)):
        if reg is not None:
            a0, a1 = (u0 - BAR_U0) * 1000, (u1 - BAR_U0) * 1000
            if reg.name != 'bar_edge':
                a0, a1 = 2.0, reg.w - 2.0
            m.poly([(u0, v, -t), (u1, v, -t), (u1, v, t), (u0, v, t)], (0.0, ny, 0.0), reg, [(a0, 0.0), (a1, 0.0), (a1, reg.h), (a0, reg.h)])
    for reg, u, nx in ((ends[0], u0, -1.0), (ends[1], u1, 1.0)):
        if reg is not None:
            m.poly([(u, v0, -t), (u, v1, -t), (u, v1, t), (u, v0, t)], (nx, 0.0, 0.0), reg, [(2, 2), (reg.w - 2, 2), (reg.w - 2, reg.h - 2), (2, reg.h - 2)])


def tensioner_hook():
    """what stays at the fitting, in the model's frame of the tensioner's node: the hook, its eye and the link (the
    padeye hook's, on the chain's line), and, turned about the joint, the slotted bar: its eyelet end, its two threaded
    rails either side of the slot, its inner end"""
    h = Mesh()
    h.sweep([(x, y, 0.0) for x, y in HOOK2], HOOK_RAD, Z, False, 6, R['hookA'], caps=True)
    eye(h, (EYE_C, 0.0, 0.0), X, Y)
    h.sweep(plane_pts((CL_C, 0.0, 0.0), X, Z, CLINK2), [(CL_W, CL_W)] * len(CLINK2), tb.unit(tb.cross(X, Z)), True, 4, R['eye'], phase=math.pi / 4)
    h.transform(hook_model, hook_model)
    m = Mesh()
    zr, be = R['zinc'], R['bar_edge']
    u0, ue, u1 = BAR_U0, BAR_U0 + BAR_EYE, BAR_U1
    # the eyelet end: rounded towards the hook, as wide as the eyelet needs
    outline = [(u0, -0.009), (u0 + 0.006, -BAR_EYE_HV), (ue - 0.004, -BAR_EYE_HV), (ue, -BAR_HV), (ue, BAR_HV), (ue - 0.004, BAR_EYE_HV),
               (u0 + 0.006, BAR_EYE_HV), (u0, 0.009)]
    m.slab(outline, -BAR_T, BAR_T, R['bar'], lambda u, v, nz: ((u - BAR_U0) * 1000, (BAR_EYE_HV - v) * 1000), zr, edge_b=(2.0, 12.0))
    flat_piece(m, ue, u1 - 0.006, BAR_SLOT, BAR_HV, be, zr, (None, None))      # the rail on the lever's side
    flat_piece(m, ue, u1 - 0.006, -BAR_HV, -BAR_SLOT, zr, be, (None, None))    # the other
    flat_piece(m, u1 - 0.006, u1, -BAR_HV, BAR_HV, be, be, (zr, zr))
    m.transform(to_model, dir_model)
    h.merge(m)
    return h


def ribbon(m, pts, wl, wh, top_ab, top_reg, pr, t):
    """a strip of plate along the points (u, v) of its top face, from wl[i] to wh[i] across at each, t thick: its top (on
    top_reg by top_ab(i, w)), its underside, its two long edges and its two ends (on pr)"""
    n = len(pts)
    seg = [tb.unit((-(pts[i + 1][1] - pts[i][1]), pts[i + 1][0] - pts[i][0], 0.0)) for i in range(n - 1)]
    nrm = [seg[0]] + [tb.unit(tb.add(seg[i - 1], seg[i])) for i in range(1, n - 1)] + [seg[-1]]
    top = [[(pts[i][0], pts[i][1], w) for w in (wl[i], wh[i])] for i in range(n)]
    bot = [[tb.comb(q, (nrm[i], -t)) for q in top[i]] for i in range(n)]
    box = [(2, 2), (22, 2), (22, 22), (2, 22)]
    for i in range(n - 1):
        m.poly([top[i][0], top[i][1], top[i + 1][1], top[i + 1][0]], seg[i], top_reg, [top_ab(i, wl[i]), top_ab(i, wh[i]), top_ab(i + 1, wh[i + 1]), top_ab(i + 1, wl[i + 1])])
        m.poly([bot[i][0], bot[i][1], bot[i + 1][1], bot[i + 1][0]], tb.mul(seg[i], -1), pr, box)
        for k, nz in ((0, -1.0), (1, 1.0)):
            m.poly([top[i][k], top[i + 1][k], bot[i + 1][k], bot[i][k]], (0.0, 0.0, nz), pr, [(2, 19), (22, 19), (22, 22), (2, 22)])
    for i, sgn in ((0, -1.0), (n - 1, 1.0)):
        d = tb.unit((pts[min(i + 1, n - 1)][0] - pts[max(i - 1, 0)][0], pts[min(i + 1, n - 1)][1] - pts[max(i - 1, 0)][1], 0.0))
        m.poly([top[i][0], top[i][1], bot[i][1], bot[i][0]], tb.mul(d, sgn), pr, [(2, 19), (22, 19), (22, 22), (2, 22)])


def tensioner_body():
    """what moves along the bar (built home) and is not painted, in the tensioner's frame (u, v, w): the tensioning ring
    and its hub, the chain lock's housing, the jaw's pin, the bolts"""
    m = Mesh()
    zr = R['zinc']
    m.box((HUB_U0, -HUB_HV, -HUB_HW), (HUB_U0 + HUB_LEN, HUB_HV, HUB_HW), R['cast'], skip=('+x',))
    # the tensioning ring: round, eight lugs, its rim rounded towards its faces (smooth round it)
    ns, nf = R['nut_side'], R['nut_face']
    ring = []
    for i in range(NUT_PTS):
        th = 2 * math.pi * (i + 0.5) / NUT_PTS
        r = NUT_RO - (NUT_LUG if i % 3 == 2 else 0.0)
        ring.append((r, math.cos(th), math.sin(th)))
    bands = [(NUT_U0, NUT_CH[1], 0.0), (NUT_U0 + NUT_CH[0], 0.0, math.hypot(*NUT_CH)), (NUT_U0 + NUT_T - NUT_CH[0], 0.0, NUT_RIM - math.hypot(*NUT_CH)),
             (NUT_U0 + NUT_T, NUT_CH[1], NUT_RIM)]                    # u, how far in, across the rim
    tilt = (-0.6, 0.0, 0.0, 0.6)                                       # the normal's lean along u at each
    tot = 2 * math.pi * (NUT_RO - NUT_LUG / 2)
    rows = []
    for i in range(NUT_PTS + 1):
        r, cs, sn = ring[i % NUT_PTS]
        a = ns.w * i / NUT_PTS
        rows.append([m.vert((u, (r - inn) * cs, (r - inn) * sn), (tilt[k], cs, sn), ns.uv(a, bb * 1000), ns.name) for k, (u, inn, bb) in enumerate(bands)])
    for i in range(NUT_PTS):
        for k in range(3):
            a0, a1, b0, b1 = rows[i][k], rows[i + 1][k], rows[i][k + 1], rows[i + 1][k + 1]
            m.face(a0, a1, b1)
            m.face(a0, b1, b0)
    c = NUT_RO * 1000
    for u, sgn in ((NUT_U0, -1.0), (NUT_U0 + NUT_T, 1.0)):
        nrm = (sgn, 0.0, 0.0)
        ctr = m.vert((u, 0.0, 0.0), nrm, nf.uv(c, c), nf.name)
        ids = [m.vert((u, (r - NUT_CH[1]) * cs, (r - NUT_CH[1]) * sn), nrm, nf.uv(c + (r - NUT_CH[1]) * sn * 1000, c - (r - NUT_CH[1]) * cs * 1000), nf.name) for r, cs, sn in ring]
        for i in range(NUT_PTS):
            m.face(ctr, ids[i], ids[(i + 1) % NUT_PTS], nrm)
    # the chain lock's housing between the prongs (dark steel)
    ct = R['cast']
    m.slab([uv_px(*q) for q in LOCK_BLOCK_PX], -LOCK_HW, LOCK_HW, ct, lambda u, v, nz: (4 + 32 * (u - U_LO) / (U_HI - U_LO), 4 + 32 * (v - V_LO) / (V_HI - V_LO)), ct, edge_b=(2.0, 12.0))
    # the jaw's pin: across between the cheeks, a round head either side; the hinge bolt across; the bolts' heads
    for (px_, r, hgt, sides, shaft) in ((PIN_PX, PIN_HEAD_PX * SC, 0.004, 12, 0.0075), (HINGE_PX, 0.0069, 0.0055, 6, 0.004),
                                        (BOLT2_PX, 0.0060, 0.0050, 6, 0.0), (NECK_BOLT_PX, 0.0045, 0.0040, 6, 0.0)):
        u, v = uv_px(*px_)
        for side in (-1.0, 1.0):
            m.prism((u, v, side * cheek_out(u)), (0.0, 0.0, side), r, hgt, sides, R['dark'] if sides == 12 else R['bolt'], phase=math.pi / sides)
        if shaft:
            m.prism((u, v, -cheek_in(u)), Z, shaft, 2 * cheek_in(u), 8, zr, cap=False)
    return m


def tensioner_paint(colour):
    """what is painted (or left bare), in one finish, in the tensioner's frame: the two cheeks, the neck between them,
    the release lever (its lip, trigger plate and two prongs)"""
    m = Mesh()
    rg = lambda name: R['%s:%s' % (name, colour)]
    # the cheeks: the drawing's outline, closing in from the jaw to the ring
    for side, reg in ((-1.0, rg('plate_m')), (1.0, rg('plate_p'))):
        def ab(u, v, nz, side=side):
            return (((U_HI - u) if side < 0 else (u - U_LO)) * 1000, (V_HI - v) * 1000)
        fin = lambda u, side=side: side * cheek_in(u)
        fout = lambda u, side=side: side * cheek_out(u)
        m.slab(BODY, fout if side < 0 else fin, fin if side < 0 else fout, reg, ab, rg('plate_edge'))
    # the neck between the cheeks (its top, its underside, its end towards the jaw)
    (u0, v1), (u1, v0) = uv_px(NECK_PX[0], NECK_PX[2]), uv_px(NECK_PX[1], NECK_PX[3])
    bk = rg('block')
    h0, h1 = cheek_in(u0), cheek_in(u1)
    m.poly([(u0, v1, -h0), (u1, v1, -h1), (u1, v1, h1), (u0, v1, h0)], (0, 1, 0), bk, [(0, 0), (bk.w, 0), (bk.w, 24), (0, 24)])
    m.poly([(u0, v0, -h0), (u1, v0, -h1), (u1, v0, h1), (u0, v0, h0)], (0, -1, 0), bk, [(0, 24), (bk.w, 24), (bk.w, 48), (0, 48)])
    m.poly([(u1, v0, -h1), (u1, v1, -h1), (u1, v1, h1), (u1, v0, h1)], (1, 0, 0), bk, [(0, 48), (bk.w * 0.5, 48), (bk.w * 0.5, 72), (0, 72)])
    # the release lever: the trigger plate (with its lip), then the two prongs to the hinge between the cheeks
    lv, pr = rg('lever'), rg('paint')
    top_ab = lambda base: (lambda i, w: (LEVER_S[base + i] * 1000, (w + LEVER_HMAX) * 1000))
    ribbon(m, LEVER[:4], [-h for h in LEVER_HW], list(LEVER_HW), top_ab(0), lv, pr, LEVER_T)
    for sgn in (1.0, -1.0):
        a, b = sorted((sgn * PRONG[0], sgn * PRONG[1]))
        ribbon(m, LEVER[3:], [a] * 3, [b] * 3, top_ab(3), lv, pr, LEVER_T)
    return m


def wrap_links():
    """the first spare links, from the chain lock round the jaw's end to where the loops hang (the tensioner's frame)"""
    m = Mesh()
    pts = [uv_px(*q) for q in WRAP_PX]
    seg, sv = [], 0.0
    for i in range(len(pts) - 1):
        ln = math.dist(pts[i], pts[i + 1])
        seg.append((sv, ln, pts[i], pts[i + 1]))
        sv += ln
    for j in range(1, WRAP + 1):
        d = j * P
        k = 0
        while k < len(seg) - 1 and seg[k][0] + seg[k][1] < d:
            k += 1
        s0, ln, p0, p1 = seg[k]
        f = (d - s0) / ln
        c = (p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, 0.0)
        t = tb.unit((p1[0] - p0[0], p1[1] - p0[1], 0.0))
        link(m, c, t, Z if j % 2 else (-t[1], t[0], 0.0), j)
    return m


def loop_poses(c, fan):
    """c links hanging in a loop (both its ends up) turned by fan about the vertical: [(centre, quaternion)] in the
    frame of the point the spare chain leaves the tensioner (level)"""
    eh = (math.cos(fan), 0.0, math.sin(fan))
    en = tb.unit(tb.cross(eh, Y))
    top = (0.0, LOOP_TOP, LOOP_Z)
    r = LOOP_W / 2
    a = max(0.002, (c * P - math.pi * r) / 2)
    path = [tb.comb(top, (eh, -r))]
    path.append(tb.comb(top, (eh, -r), (Y, -a)))
    for i in range(1, 12):
        th = math.pi * i / 12
        path.append(tb.comb(top, (eh, -r * math.cos(th)), (Y, -a - r * math.sin(th))))
    path.append(tb.comb(top, (eh, r), (Y, -a)))
    path.append(tb.comb(top, (eh, r)))
    seg, s = [], 0.0
    for i in range(len(path) - 1):
        ln = tb.length(tb.sub(path[i + 1], path[i]))
        seg.append((s, ln, path[i], path[i + 1]))
        s += ln
    out = []
    for i in range(c):
        si = (i + 0.5) * s / c
        k = 0
        while k < len(seg) - 1 and seg[k][0] + seg[k][1] < si:
            k += 1
        s0, ln, p0, p1 = seg[k]
        pos = tb.comb(p0, (tb.sub(p1, p0), (si - s0) / ln))
        t = tb.unit(tb.sub(p1, p0))
        n = en if i % 2 == 0 else tb.unit(tb.cross(t, en))
        out.append((pos, t, n))
    return out


def loop(c, fan):
    m = Mesh()
    for i, (pos, t, n) in enumerate(loop_poses(c, fan)):
        link(m, pos, t, tb.unit(tb.cross(n, t)), i)
    return m


# ---------------------------------------------------------------- the node tree
def quat_z(deg):
    h = math.radians(deg) / 2
    return [0.0, 0.0, math.sin(h), math.cos(h)]


def vis_node(name, arg, ranges):
    return {'type': 'model::ArgVisibilityNode', 'name': name, 'version': 0, 'props': [], 'vis': [(arg, [list(r) for r in ranges])]}


def k_range(k):
    """the LEN_ARG range of the pocket's step k (the first from -1.01, the last to 1.01)"""
    return (-1.01 if k == 0 else len_arg(L_MIN + k * TRAVEL), 1.01 if k == STEPS - 1 else len_arg(L_MIN + (k + 1) * TRAVEL))


def ranges_k(pred):
    """the LEN_ARG ranges in which pred(k) holds"""
    out = []
    for k in range(STEPS):
        if not pred(k):
            continue
        a0, a1 = k_range(k)
        if out and abs(out[-1][1] - a0) < 1e-12:
            out[-1][1] = a1
        else:
            out.append([a0, a1])
    return out


def step_keys(value):
    """position keys on LEN_ARG holding value(k) through each step k"""
    keys = []
    for k in range(STEPS):
        a0, a1 = k_range(k)
        v = value(k)
        keys.append([a0 if k else -1.0] + list(v))
        keys.append([(a1 - EPS) if k < STEPS - 1 else 1.0] + list(v))
    return keys


def chunk_x(b, k):
    """where chunk b's first link is (along the chain from the padeye) at step k: after links 0 and 1 and the larger
    chunks shown"""
    return X0 + (2 + 2 * ((k >> (b + 1)) << (b + 1))) * P


def colour_range(i):
    """the COLOUR_ARG range of finish i (its value is i / 10)"""
    return (-1.01 if i == 0 else i / 10 - 0.05, 1.01 if i == len(COLOURS) - 1 else i / 10 + 0.05)


def build():
    """the nodes (index 1 on: 0 is the root), their parents, and the meshes on them: [(name, node, mesh)]"""
    nodes, parents, parts = [], [], []

    def add(n, parent):
        nodes.append(n)
        parents.append(parent)
        return len(nodes)
    turn = lambda sign: [(ELEV_ARG, [[-1.0] + quat_z(0)] + [[j / 12, *quat_z(sign * 90 * j / 12)] for j in range(13)])]
    tilt = add(tb.anim_node('model::ArgRotationNode', 'tilt', rot=turn(1)), 0)
    parts.append(('padeye_hook', tilt, padeye_hook()))
    for b in range(CHUNKS):
        v = add(vis_node('chain_%d' % b, LEN_ARG, ranges_k(lambda k, b=b: (k >> b) & 1)), tilt)
        p = add(tb.anim_node('model::ArgPositionNode', 'chain_%d_place' % b, pos=[(LEN_ARG, step_keys(lambda k, b=b: (chunk_x(b, k), 0.0, 0.0)))]), v)
        parts.append(('chain_%d' % b, p, chunk(b)))
    far = add(tb.anim_node('model::ArgPositionNode', 'tensioner', pos=[(LEN_ARG, [[-1.0, L_MIN, 0.0, 0.0], [len_arg(L_MIN), L_MIN, 0.0, 0.0],
                                                                                  [len_arg(L_MAX), L_MAX, 0.0, 0.0], [1.0, L_MAX, 0.0, 0.0]])]), tilt)
    parts.append(('tensioner', far, tensioner_hook()))
    saw = [[-1.0, 0.0, 0.0, 0.0]]
    for k in range(STEPS):
        a0, a1 = len_arg(L_MIN + k * TRAVEL), len_arg(L_MIN + (k + 1) * TRAVEL)
        end = TRAVEL * (1.0 - (0.0 if k == STEPS - 1 else EPS * LEN_SCALE / TRAVEL))
        saw.append([a0] + [0.0, 0.0, 0.0])
        saw.append([a1 - (0.0 if k == STEPS - 1 else EPS)] + [ROD_DIR[i] * end for i in range(3)])
    saw.append([1.0] + [ROD_DIR[i] * TRAVEL for i in range(3)])
    body = add(tb.anim_node('model::ArgPositionNode', 'tensioner_body', pos=[(LEN_ARG, saw)]), far)
    parts.append(('tensioner_body', body, tensioner_body().transform(to_model, dir_model)))
    for i, c in enumerate(COLOURS):   # the painted parts, once in each finish: one is shown
        v = add(vis_node('paint_' + c, COLOUR_ARG, [colour_range(i)]), body)
        parts.append(('paint_' + c, v, tensioner_paint(c).transform(to_model, dir_model)))
    # the spare chain: its first links round the jaw's end (with the body), then loops hanging from there in a level frame
    spare = lambda k: N_LINKS - 2 - 2 * k
    v = add(vis_node('wrap', LEN_ARG, ranges_k(lambda k: spare(k) >= WRAP)), body)
    parts.append(('wrap', v, wrap_links().transform(to_model, dir_model)))
    hang = add(tb.anim_node('model::ArgRotationNode', 'spare', position=to_model((EXIT[0], EXIT[1], 0.0)), rot=turn(-1)), body)
    looped = lambda k: max(0, spare(k) - WRAP)
    for q, fan in enumerate(LOOP_FAN):
        v = add(vis_node('loop_%d' % q, LEN_ARG, ranges_k(lambda k, q=q: looped(k) // LOOP_N > q)), hang)
        parts.append(('loop_%d' % q, v, loop(LOOP_N, fan)))
    for c in range(2, LOOP_N, 2):
        v = add(vis_node('loop_short_%02d' % c, LEN_ARG, ranges_k(lambda k, c=c: looped(k) % LOOP_N == c)), hang)
        parts.append(('loop_short_%02d' % c, v, loop(c, PART_FAN)))
    return nodes, parents, parts


# ---------------------------------------------------------------- the tree evaluated (for pictures, bounds and the tests)
def m4(rows):
    return [list(r) for r in rows]


def mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def m_move(p):
    return m4([[1, 0, 0, p[0]], [0, 1, 0, p[1]], [0, 0, 1, p[2]], [0, 0, 0, 1]])


def m_quat(q):
    x, y, z, w = q
    return m4([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
               [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0], [0, 0, 0, 1]])


def key_at(keys, a, width):
    if a <= keys[0][0]:
        return keys[0][1:1 + width]
    if a >= keys[-1][0]:
        return keys[-1][1:1 + width]
    for p, q in zip(keys, keys[1:]):
        if p[0] <= a <= q[0]:
            t = (a - p[0]) / (q[0] - p[0]) if q[0] > p[0] else 0.0
            return [p[1 + i] + (q[1 + i] - p[1 + i]) * t for i in range(width)]


def evaluate(nodes, parents, args):
    """each node's matrix to the model's frame and whether it is shown, with the arguments {arg: value}"""
    ident = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    mats, shown = [m4(ident)], [True]
    for n, par in zip(nodes, parents):
        m, vis = m4(ident), True
        if 'base' in n:
            b = n['base']
            p = list(b['position'])
            for arg, keys in n['pos']:
                v = key_at(keys, args.get(arg, 0.0), 3)
                p = [p[i] + v[i] for i in range(3)]
            m = mm(m_move(p), m_quat(b['quat1']))
            for arg, keys in n['rot']:
                q = key_at(keys, args.get(arg, 0.0), 4)
                ql = math.sqrt(sum(c * c for c in q))
                m = mm(m, m_quat([c / ql for c in q]))
        if 'vis' in n:
            for arg, rngs in n['vis']:
                a = args.get(arg, 0.0)
                vis = vis and any(r0 <= a < r1 for r0, r1 in rngs)
        mats.append(mm(mats[par], m))
        shown.append(shown[par] and vis)
    return mats, shown


def apply(mat, p, w=1.0):
    return tuple(mat[i][0] * p[0] + mat[i][1] * p[1] + mat[i][2] * p[2] + mat[i][3] * w for i in range(3))


def posed(tree, L, deg, only=None, colour=0.0):
    """the whole assembly (or the parts named in only) as one mesh, at a length, a rise and a finish (COLOUR_ARG's value)"""
    nodes, parents, parts = tree
    mats, shown = evaluate(nodes, parents, {LEN_ARG: len_arg(L), ELEV_ARG: elev_arg(deg), COLOUR_ARG: colour})
    out = Mesh()
    for name, node, mesh in parts:
        if not shown[node] or (only and name not in only):
            continue
        mt = mats[node]
        o = len(out.v)
        out.v += [(apply(mt, p), tb.unit(apply(mt, n, 0.0)), uv, tag) for p, n, uv, tag in mesh.v]
        out.tri += [(a + o, b + o, c + o) for a, b, c in mesh.tri]
    return out


POSES = [(L, d) for L in (L_MIN, 0.9, 1.5, 2.2, L_MAX) for d in (0, 15, 30, 45, 60, 75, 90)]


def picture(w, h, views, tex, bg=(236, 238, 240)):
    """the model drawn with its textures and normal map (wheel_chock.py's picture, the light over the camera's left
    shoulder in every view). views: [(mesh, view direction, (x, y, width, height), focus)]; focus None or (centre, half
    size m)"""
    col, nx, ny, ao = tex
    img = [[bg] * w for _ in range(h)]
    zb = [[1e9] * w for _ in range(h)]
    for m, vdir, (ox, oy, vw, vh), focus in views:
        fwd = tb.unit(vdir)
        right = tb.unit(tb.cross(fwd, tb.Y)) if abs(fwd[1]) < 0.99 else tb.X
        up = tb.cross(right, fwd)
        light = tb.unit(tb.comb((0.0, 0.0, 0.0), (fwd, -0.75), (up, 0.60), (right, -0.35)))
        pts = [q[0] for q in m.v]
        if focus:
            cx, cy = tb.dot(focus[0], right), tb.dot(focus[0], up)
            sc = min(vw, vh) / (2 * focus[1])
        else:
            xs, ys = [tb.dot(q, right) for q in pts], [tb.dot(q, up) for q in pts]
            sc = min((vw - 30) / (max(xs) - min(xs)), (vh - 30) / (max(ys) - min(ys)))
            cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        frames = tb.tangents(m)
        scr = [(ox + vw / 2 + (tb.dot(q, right) - cx) * sc, oy + vh / 2 - (tb.dot(q, up) - cy) * sc, tb.dot(q, fwd)) for q in pts]
        for i, j, k in m.tri:
            a, b, c = scr[i], scr[j], scr[k]
            fn = tb.cross(tb.sub(pts[j], pts[i]), tb.sub(pts[k], pts[i]))
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


def tiedown_edm(tree):
    nodes, parents, parts = tree
    render = [tb.render_node(name, node, mesh) for name, node, mesh in parts]
    lo, hi = [1e9] * 3, [-1e9] * 3
    for L, d in POSES:
        for p, _, _, _ in posed(tree, L, d).v:
            for k in range(3):
                lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
    f = tb.edm_file(nodes, parents, render, COLOUR_ARG + 1, lo, hi, material_name='catcc_tiedown')
    mat = f['root']['materials'][0]
    for i, (k, v) in enumerate(mat):
        if k == 'TEXTURES':
            mat[i] = (k, [dict(t, name=NAMES[t['index']]) for t in v])
        elif k == 'UNIFORMS':
            mat[i] = (k, [dict(p, value=NORMAL_VALUE) if p['name'] == 'normalMapValue' else p for p in v])
    return f, lo, hi


def main(out, extras):
    col, nx, ny, ao, ro, me = atlas()
    tree = build()
    f, lo, hi = tiedown_edm(tree)
    data = edm.write(f)
    assert edm.write(edm.read(data), keep_table=True) == data, 'the written model does not read back the same'
    os.makedirs(os.path.join(out, 'Shapes', 'textures'), exist_ok=True)
    open(os.path.join(out, 'Shapes', 'CATCC_Tiedown.edm'), 'wb').write(data)
    rgb = [col[0::3], col[1::3], col[2::3]]
    open(os.path.join(out, 'Shapes', 'textures', NAMES[0] + '.dds'), 'wb').write(dds(rgb, 'bc1'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[1] + '.dds'), 'wb').write(dds([nx, ny], 'bc5'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[2] + '.dds'), 'wb').write(dds([ao, ro, me], 'bc1'))
    parts = tree[2]
    fixed = sum(len(m.tri) for name, _, m in parts if name in ('padeye_hook', 'tensioner', 'tensioner_body', 'paint_yellow'))
    counts = []
    for L, d in POSES:
        nodes, parents, _ = tree
        mats, shown = evaluate(nodes, parents, {LEN_ARG: len_arg(L), ELEV_ARG: elev_arg(d)})
        drawn = [m for _, node, m in parts if shown[node]]
        counts.append((sum(len(m.tri) for m in drawn), len(drawn)))
    print('tiedown: %d parts on %d nodes; tensioner, hooks and links 0 and 1: %d triangles; a link %d; chain %d links, %.3f m, pitch %.3f, wire %.4f'
          % (len(parts), len(tree[0]), fixed, len(chunk(0).tri) // 2, N_LINKS, N_LINKS * P, P, 2 * RW))
    print('  argument %d: length / %.0f m, from %.3f to %.3f m (padeye to fitting); the body moves 0 to %.3f m along the bar, the chain seated every %d links'
          % (LEN_ARG, LEN_SCALE, L_MIN, L_MAX, TRAVEL, 2))
    print('  argument %d: rise / 90 degrees; chain lock %.3f to %.3f m from the fitting; drawn: %d to %d triangles in %d to %d parts; loops hang %.3f m'
          % (ELEV_ARG, B_MIN, B_MIN + TRAVEL, min(c[0] for c in counts), max(c[0] for c in counts), min(c[1] for c in counts), max(c[1] for c in counts), LOOP_DEEP))
    print('  argument %d: the tensioner\'s finish: %s' % (COLOUR_ARG, ', '.join('%s %s' % (('%.1f' % (i / 10)).rstrip('0').rstrip('.') or '0', c) for i, c in enumerate(COLOURS))))
    print('  bounding box %s to %s; atlas %d x %d, %d rows used; wrote CATCC_Tiedown.edm and three textures to %s'
          % (['%.3f' % v for v in lo], ['%.3f' % v for v in hi], W, W, ATLAS_USED, out))
    if not extras:
        return
    extra = os.path.join(HERE, 'out')
    os.makedirs(extra, exist_ok=True)
    for old in ('catcc_tiedown_detail.png',):
        if os.path.exists(os.path.join(extra, old)):
            os.remove(os.path.join(extra, old))
    open(os.path.join(extra, 'catcc_tiedown_diff.png'), 'wb').write(tb.png(W, W, [[(col[3 * (y * W + x)], col[3 * (y * W + x) + 1], col[3 * (y * W + x) + 2]) for x in range(W)] for y in range(W)]))
    open(os.path.join(extra, 'catcc_tiedown_nm.png'), 'wb').write(tb.png(W, W, [[(nx[y * W + x], ny[y * W + x], 255) for x in range(W)] for y in range(W)]))
    typical = posed(tree, 1.3, 35)
    obj, mtl = tb.obj(typical, 'catcc_tiedown')
    obj = '# CATCC tiedown (generated by tiedown.py) at 1.3 m and 35 degrees: origin the padeye, x towards the fitting, y up; metres\n%s' % obj.split('\n', 1)[1]
    open(os.path.join(extra, 'catcc_tiedown.obj'), 'w').write(obj)
    open(os.path.join(extra, 'catcc_tiedown.mtl'), 'w').write(mtl)
    tex = (col, nx, ny, ao)
    a = posed(tree, 1.3, 35)
    b = posed(tree, 0.7, 60)
    c = posed(tree, 2.4, 22)

    def near(L, deg):
        e = math.radians(deg)
        s = L - 0.17
        return (s * math.cos(e), s * math.sin(e) - 0.08, 0.0)
    open(os.path.join(extra, 'catcc_tiedown_preview.png'), 'wb').write(picture(1600, 1000, [
        (a, (-0.30, -0.25, -0.92), (0, 0, 900, 560), None),
        (b, (-0.35, -0.20, -0.92), (900, 0, 700, 560), None),
        (c, (-0.25, -0.35, -0.90), (0, 560, 900, 440), None),
        (a, (-0.45, -0.30, -0.84), (900, 560, 700, 440), (near(1.3, 35), 0.28)),
    ], tex))
    # the tensioner (level, 0.9 m): the drawing's side whole, in each finish; then the body close: the same side, from
    # the lever's side, from the hook's end and from the jaw's end
    names = ('tensioner', 'tensioner_body', 'wrap') + tuple('paint_' + c for c in COLOURS) + tuple('chain_%d' % b for b in range(CHUNKS))
    ts = [posed(tree, 0.9, 0, only=names, colour=i / 10) for i in range(len(COLOURS))]
    whole, body = (0.9 - 0.225, 0.0, 0.0), (0.9 - 0.30, 0.0, 0.0)
    open(os.path.join(extra, 'catcc_tiedown_tensioner.png'), 'wb').write(picture(1600, 1000, [
        (ts[0], (0.0, -0.03, 1.0), (0, 0, 1600, 330), (whole, 0.118)),
        (ts[1], (0.0, -0.03, 1.0), (0, 330, 800, 335), (body, 0.076)),
        (ts[2], (0.0, -0.03, 1.0), (800, 330, 800, 335), (body, 0.076)),
        (ts[1], (0.0, -1.0, 0.12), (0, 665, 800, 335), (body, 0.09)),
        (ts[0], (-0.70, -0.40, 0.60), (800, 665, 400, 335), (whole, 0.15)),
        (ts[2], (0.50, -0.50, 0.70), (1200, 665, 400, 335), (body, 0.12)),
    ], tex))
    # the cheek's face close, yellow and red, and the lever from above, to judge the finish by
    open(os.path.join(extra, 'catcc_tiedown_finish.png'), 'wb').write(picture(1600, 1000, [
        (ts[0], (0.0, 0.0, 1.0), (0, 0, 1600, 500), (body, 0.062)),
        (ts[1], (0.0, 0.0, 1.0), (0, 500, 1000, 500), (body, 0.062)),
        (ts[1], (0.0, -1.0, 0.02), (1000, 500, 600, 500), ((0.9 - 0.25, 0.0, 0.0), 0.075)),
    ], tex))
    print('wrote the atlas pictures, the OBJ copy and the previews to', extra)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1], False)
    else:
        main(os.path.join(HERE, '..', 'Mods', 'tech', 'CATCC-Crew'), True)
