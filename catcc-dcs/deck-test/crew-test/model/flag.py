"""A folded US flag (the triangle of a ceremonial fold) to stand on a jet's glareshield, inside the canopy.

    python -I flag.py              writes into ../Mods/tech/CATCC-Crew, and model/out (OBJ, pictures)
    python -I flag.py <out dir>    writes the DCS files only, into <out dir> (the tests do this)

DCS files (a version 10 .edm written by edm.py with towbar.py's node helpers, wheel_chock.py's mesh, DDS and picture
helpers; the textures beside the models, as the chock's are):
    Shapes/CATCC_Flag.edm                          the flag (its nearest level of detail, to 6 m)
    Shapes/CATCC_Flag_lod1.edm .. _lod3.edm        simpler (LEVELS: to 20, 60 and 200 m; beyond, nothing)
    Shapes/CATCC_Flag.lods                         the levels and how far each is drawn (DCS takes it for the name)
    Shapes/textures/catcc_flag_diff.dds            colours (BC1)
    Shapes/textures/catcc_flag_nm.dds              normal map (BC5: red along the texture's width, green DOWN it)
    Shapes/textures/catcc_flag_diff_roughmet.dds   ambient occlusion (red), roughness (green), metalness (blue) (BC1)

THE REFERENCES (the user, 2026-11-25): a photograph of an F-15E crew with a folded flag on the glareshield (the
triangle standing on its long edge, point up, a face to the side), and three product photographs of folded flags. The
shape and the stars are measured on the one taken square on (a folded flag standing on a table: 960 x 450 px):
  the shape    the height 0.47 of the long edge; the corners pointed (the cloth thinning into them); the faces flat in
               the middle, rolling over at every edge (a fold of the cloth)
  the stars    SEVEN on a face, on the user's own grid drawn over the preview (2026-11-25: "The stars still aren't
               aligned properly. I've drawn the correct grid"; STARS: long-edge units from the long edge's middle):
               a row of four along the long edge, a row of two over its middle columns, one under the point; the rows
               rising 3 degrees to the right; each star turned 2.5 degrees anticlockwise (the user: the rows' 3 "rotated about 30
               degrees counter clockwise", "another 10 degrees ccw", "5 degrees clockwise", "0.5 degree ccw").
               EMBROIDERED (the user, with photographs of embroidered flags): each star raised in ten flat facets
               meeting at a point at its centre (a ridge out to every point, a crease in to every inner corner),
               its satin-stitch threads across each arm, square to the line from the centre to its point, 1.4 mm
               apart; a sewn-in groove and shadow round each star on the blue (star_at) Each 0.08 of the long edge in radius (the
               photograph's 0.09: the user had asked for smaller ones), a point up
  the cloth    a plain blue, a canvas weave, a few soft wrinkles; no crease lines on the faces
SIZE: a 3 x 5 ft flag's fold (legs 0.229 m) would touch the F/A-18C's windscreen (fa-18c.edm: the glass 0.15 to 0.18 m
over the glareshield beside the HUD), so it was made smaller: the long edge 0.269 m, T 0.032 m. Then, seen in DCS lying on
the glareshield, 20 % larger (the user, 2026-11-26: "scaled up by about 20%"): SCALE, every size of the cloth (the
stitches and the groove are thread's and stay): the long edge 0.323 m, the point 0.152 m up, T 0.038 m.

THE SHAPE: rings of the outline drawn in towards its incentre (each the outline scaled about it: the corners stay
pointed): the fold's rings round a quarter circle of radius T / 2 from the outline to each face, then the faces' puff.
The two faces meet at the outline (the fold's middle). THE TEXTURE follows the cloth: each face's half of the texture is
the face's plane unrolled over the fold by the distance along it, and the two halves meet on the same point of the plane
at the fold's middle, so a star running round a fold goes on unbroken onto the other face (the user, 2026-11-25: "the
stars shouldn't get cut off going around the corners").

THE MODEL'S FRAME: x along the long edge (forward on the jet), y up, z across (the faces to +z and -z); metres. The
origin is the middle of the long edge's underside: where it touches the glareshield.

THREE MODEL ARGUMENTS (a static linked to a ship stands on its deck: where it sits is in the arguments). At 0 they are
the user's pose on an F/A-18C on the flight deck (BASE_HEIGHT, BASE_PITCH, BASE_LEAN), so anything that draws the model
without them (its shadow, it may be) still draws it there:
    10  height: the origin over the deck it stands on = BASE_HEIGHT x (1 + the argument) (-1 to 1: 0 to 5.36 m)
    11  pitch: turned about z, nose up positive: BASE_PITCH + 90 degrees x the argument
    12  lean: turned about x, its top to +z (starboard) positive: BASE_LEAN + 90 degrees x the argument
"""
import math
import os
import sys
from array import array

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edm  # noqa: E402
import towbar as tb  # noqa: E402
import wheel_chock as wc  # noqa: E402  (its Mesh, DDS writer and picture; textures W x W, W = 1024)

HERE = os.path.dirname(os.path.abspath(__file__))

SCALE = 1.2                 # (the user's 20 % up)
HYP = 0.269 * SCALE         # the long edge (it stands on this)
APEX = 0.47 * HYP           # its point's height over the long edge (the photograph's 450 / 960)
LEG = math.hypot(HYP / 2, APEX)
T = 0.032 * SCALE           # thickness
RF = T / 2                  # the fold's radius
PUFF = 0.009 * SCALE        # the faces' puff over T / 2 (in the middle)
CORNER_R = tuple(r * SCALE for r in (0.004, 0.004, 0.008))  # the corners' rounding in the plane: the long edge's ends, the point (a little blunter)
# THE LEVELS OF DETAIL (the user, 2026-11-26: "Please also create LODs"): each level's points along the long edge and
# each leg, points round each corner, rings round the fold (a quarter circle each face), the faces' rings (this far in
# from the fold's end); and how far (m) it is drawn, as DCS's .lods files have it (beyond the last, nothing)
PUFF_ALL = tuple(r * SCALE for r in (0.004, 0.010, 0.018, 0.028))
LEVELS = [
    {'name': 'CATCC_Flag', 'far': 6.0, 'side': (24, 16, 16), 'corner': 5, 'fold': 8, 'puff': PUFF_ALL},
    {'name': 'CATCC_Flag_lod1', 'far': 20.0, 'side': (12, 8, 8), 'corner': 3, 'fold': 4, 'puff': (PUFF_ALL[1], PUFF_ALL[3])},
    {'name': 'CATCC_Flag_lod2', 'far': 60.0, 'side': (6, 4, 4), 'corner': 2, 'fold': 2, 'puff': (PUFF_ALL[3],)},
    {'name': 'CATCC_Flag_lod3', 'far': 200.0, 'side': (2, 1, 1), 'corner': 1, 'fold': 1, 'puff': ()},
]
HEIGHT_ARG, PITCH_ARG, LEAN_ARG = 10, 11, 12
# THE POSE AT ARGUMENTS 0 (the user's: on an F/A-18C on the flight deck, 2026-11-26), so that anything drawing the model
# without its arguments (its shadow, it may be: the user, 2026-11-26, "The flag doesn't cast any shadow on the jet")
# draws it where it sits: BASE_HEIGHT metres over the deck, pitched BASE_PITCH, leaned BASE_LEAN degrees
BASE_HEIGHT = 2.68          # metres at argument 10 = 0 (-1: 0 m, 1: twice this)
BASE_PITCH, BASE_LEAN = 7.0, -45.0
TURN_MAX = 90.0             # degrees from the base at arguments 11 and 12 = +-1 (45 at first: the user leaned it past)
NAMES = ('catcc_flag_diff', 'catcc_flag_nm', 'catcc_flag_diff_roughmet')
W = wc.W
SPAN = 0.34 * SCALE         # the texture's width in metres (each face on a half, its fold unrolled too)
Y_OFF = 0.016 * SCALE       # the half's bottom this far below the long edge

BLUE = (28, 42, 92)         # the union's blue, as cotton in daylight (Old Glory Blue is (10, 49, 97))
WHITE = (238, 238, 232)
STAR_R = 0.08 * HYP         # a star's outer radius
# the stars on the user's own grid (drawn over the preview, 2026-11-25): x, y in long-edge units from the long edge's
# middle; turn in degrees. Two rows rising 3 degrees to the right (the long edge's row of four, 0.229 apart; the row of
# two over its middle columns), one star under the point midway between those columns. Each star turned STAR_TURN
# degrees anticlockwise (the user, 2026-11-25: "rotated about 30 degrees counter clockwise" from the rows' 3, then
# "another 10 degrees ccw", then "5 degrees clockwise", then "0.5 degree ccw": 35.5 in all from a star drawn 36
# degrees round from its own up, star_inside's slip until the embroidery came: the same look is 2.5 from up)
STAR_TURN = 2.5
STARS = [(-0.382, 0.040, STAR_TURN), (-0.153, 0.052, STAR_TURN), (0.076, 0.064, STAR_TURN), (0.305, 0.076, STAR_TURN),
         (-0.148, 0.222, STAR_TURN), (0.100, 0.236, STAR_TURN),
         (-0.018, 0.403, STAR_TURN)]


# ---------------------------------------------------------------- the shape
def outline():
    """the triangle in its plane (x, y), anticlockwise: A, B the long edge's ends, C the point"""
    return [(-HYP / 2, 0.0), (HYP / 2, 0.0), (0.0, APEX)]


def incentre():
    A, B, C = outline()
    a, b, c = math.dist(B, C), math.dist(A, C), math.dist(A, B)
    s = a + b + c
    return ((a * A[0] + b * B[0] + c * C[0]) / s, (a * A[1] + b * B[1] + c * C[1]) / s), 2 * (0.5 * c * APEX) / s


I0, RIN = incentre()


def ring_points(L):
    """the outline's points in order (each side's own count, each corner once), each with the in-plane direction that
    is 'inward' there (a side's normal; at a corner, the two sides' between): [(x, y, nx, ny)]"""
    P = outline()
    norms = []
    for i in range(3):
        a, b = P[i], P[(i + 1) % 3]
        ln = math.dist(a, b)
        norms.append((-(b[1] - a[1]) / ln, (b[0] - a[0]) / ln))
    # each corner rounded (CORNER_R): its arc's centre, where the arc meets the side before and the side after
    arcs = []
    for i in range(3):
        n0, n1 = norms[i - 1], norms[i]
        bx, by = n0[0] + n1[0], n0[1] + n1[1]
        bl = math.hypot(bx, by)
        half = math.acos(max(-1.0, min(1.0, n0[0] * n1[0] + n0[1] * n1[1]))) / 2   # (half the turn at the corner)
        r = CORNER_R[i] if L['corner'] > 1 else 0.0
        dist = r / math.cos(half)
        cx, cy = P[i][0] + bx / bl * dist, P[i][1] + by / bl * dist
        arcs.append((cx, cy, r, n0, n1))
    out = []
    for i in range(3):
        cx, cy, r, n0, n1 = arcs[i]
        a0, a1 = math.atan2(-n0[1], -n0[0]), math.atan2(-n1[1], -n1[0])
        while a1 < a0:
            a1 += 2 * math.pi
        nc = L['corner']
        for k in range(nc):
            t = a0 + (a1 - a0) * (k / (nc - 1) if nc > 1 else 0.5)
            out.append((cx + r * math.cos(t), cy + r * math.sin(t), -math.cos(t), -math.sin(t)))
        # the side to the next corner, from this arc's end to the next one's start
        nx_, ny_ = arcs[(i + 1) % 3][0], arcs[(i + 1) % 3][1]
        r2, n2 = arcs[(i + 1) % 3][2], arcs[(i + 1) % 3][3]
        s0 = (cx - n1[0] * r, cy - n1[1] * r)
        s1 = (nx_ - n2[0] * r2, ny_ - n2[1] * r2)
        n = L['side'][i]
        for k in range(1, n):
            t = k / n
            out.append((s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t, n1[0], n1[1]))
    return out


def scaled(x, y, d):
    """a point of the outline moved d in (the outline scaled about its incentre; d < 0 out)"""
    k = 1.0 - d / RIN
    return I0[0] + (x - I0[0]) * k, I0[1] + (y - I0[1]) * k


G0 = RF * math.pi / 2 - RF  # (the unrolled plane reaches this far outside the outline at the fold's middle)


def rings(L):
    """the rings from the fold's middle in: [(d in the plane, z over the middle plane, the normal's in-plane part (along
    'inward'), its z part, g: where the texture is, the distance in from the outline unrolled)]"""
    out = []
    for k in range(L['fold'] + 1):
        ph = (math.pi / 2) * k / L['fold']
        out.append((RF * (1 - math.cos(ph)), RF * math.sin(ph), -math.cos(ph), math.sin(ph), RF * ph - G0))
    last = PUFF_ALL[-1]
    for e in L['puff']:
        d = RF + e
        if d > RIN - 0.004:
            break
        t = e / last
        slope = PUFF * 6 * t * (1 - t) / last
        nl = math.hypot(slope, 1.0)
        out.append((d, RF + PUFF * t * t * (3 - 2 * t), -slope / nl, 1.0 / nl, d))
    return out


def tex_uv(x, y, side):
    """a point of the unrolled plane on its face's half of the texture: the front (+z) the top half, the back mirrored
    below (the two meet on the same point of the plane at the fold)"""
    u = (x + SPAN / 2) / SPAN
    if side < 0:
        u = 1.0 - u
    v = (SPAN / 2 - (y + Y_OFF)) / SPAN
    return (min(1.0, max(0.0, u)), min(0.5, max(0.0, v)) + (0.5 if side < 0 else 0.0))


def build(lod=0):
    m = wc.Mesh()
    R = ring_points(LEVELS[lod])
    Q = rings(LEVELS[lod])
    n = len(R)
    for side in (1, -1):
        hint = (0.0, 0.0, float(side))
        grid = []
        for d, z, nin, nz, g in Q:
            row = []
            for x, y, ix, iy in R:
                px, py = scaled(x, y, d)
                tx, ty = scaled(x, y, g)
                row.append(m.vert((px, py, side * z), tb.unit((ix * nin, iy * nin, side * nz)), tex_uv(tx, ty, side), 'cloth'))
            grid.append(row)
        for a, b in zip(grid, grid[1:]):
            for i in range(n):
                j = (i + 1) % n
                m.face(a[i], a[j], b[j], hint)
                m.face(a[i], b[j], b[i], hint)
        # the middle: a fan to the incentre
        c = m.vert((I0[0], I0[1], side * (RF + PUFF)), hint, tex_uv(I0[0], I0[1], side), 'cloth')
        for i in range(n):
            m.face(grid[-1][i], grid[-1][(i + 1) % n], c, hint)
    return m


# ---------------------------------------------------------------- the textures
def star_inside(px, py):
    """is (px, py) in a five-pointed star of outer radius 1, a point up"""
    a = math.atan2(px, py)  # (from straight up, clockwise)
    r = math.hypot(px, py)
    if r > 1.0:
        return False
    k = 2 * math.pi / 10
    a = abs(((a + k) % (2 * k)) - k)   # (0 along a point, k towards an inner corner)
    ri = 0.382
    x1, y1 = ri * math.sin(k), ri * math.cos(k)
    qx, qy = r * math.sin(a), r * math.cos(a)
    return x1 * (qy - 1.0) - (y1 - 1.0) * qx <= 0


_STARS = [(sx * HYP, sy * HYP, math.cos(math.radians(t)), math.sin(math.radians(t))) for sx, sy, t in STARS]
# the star's outline in its own units (outer radius 1, a point up): ten corners, the points and the inner corners
_OUTLINE = [((1.0 if k % 2 == 0 else 0.382) * math.sin(math.pi * k / 5), (1.0 if k % 2 == 0 else 0.382) * math.cos(math.pi * k / 5)) for k in range(10)]
STITCH = 1.4     # mm between the satin stitches
GROOVE = 1.2     # mm: the groove and shadow round a star, on the blue
RAISE = (1.6, 0.20, 0.25)  # mm over the cloth: the embroidery at the star's centre, at its points, at its inner corners


def local(x, y):
    """the nearest star and (x, y) in its own units: (qx, qy), or None"""
    for cx, cy, c, s in _STARS:
        dx, dy = x - cx, y - cy
        if abs(dx) < 1.3 * STAR_R and abs(dy) < 1.3 * STAR_R:
            return (c * dx + s * dy) / STAR_R, (-s * dx + c * dy) / STAR_R
    return None


def outline_dist(qx, qy):
    """the distance from (qx, qy) to the star's outline (its units), and the direction along the nearest side"""
    best, along = 1e9, (1.0, 0.0)
    for k in range(10):
        (ax, ay), (bx, by) = _OUTLINE[k], _OUTLINE[(k + 1) % 10]
        ex, ey = bx - ax, by - ay
        ll = ex * ex + ey * ey
        t = max(0.0, min(1.0, ((qx - ax) * ex + (qy - ay) * ey) / ll))
        d = math.hypot(qx - ax - ex * t, qy - ay - ey * t)
        if d < best:
            best, along = d, (ex / math.sqrt(ll), ey / math.sqrt(ll))
    return best, along


def star_at(x, y):
    """a point (x, y) of the unrolled plane (m): how much of a star covers it (0 .. 1, 2 x 2 samples); the distance in
    from the star's outline in mm (negative outside, None far from any star); the embroidery's height there (mm); its
    satin stitches there (-1 .. 1).
    THE EMBROIDERY (the user, 2026-11-25, with a close photograph: "The embroidery meets at a point in the center of
    each star, and the threads run perpendicular to a line from the center of the star to each point"): ten flat
    facets, each arm's two halves, every one a triangle from the centre (highest) to a point and an inner corner (low):
    a ridge from the centre out to every point, a crease in to every inner corner. The threads lie across each arm,
    square to the line from the centre to its point: lines repeating along that line"""
    q = local(x, y)
    if q is None:
        return 0.0, None, 0.0, 0.0
    hits = 0
    for sx, sy in ((-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25)):
        p = local(x + sx * SPAN / W, y + sy * SPAN / W)
        if p and star_inside(*p):
            hits += 1
    d, _ = outline_dist(*q)
    inside = star_inside(*q)
    mm = d * STAR_R * 1000.0
    # (the arm: its point's direction, from up clockwise; which half of it)
    a = math.degrees(math.atan2(q[0], q[1]))
    j = round(a / 72.0)
    side = 1.0 if a - j * 72.0 >= 0 else -1.0
    ta, ia = math.radians(j * 72.0), math.radians(j * 72.0 + side * 36.0)
    T = (math.sin(ta), math.cos(ta))
    I = (0.382 * math.sin(ia), 0.382 * math.cos(ia))
    # (the facet: the triangle centre, point, inner corner; the height across it, flat)
    den = T[0] * I[1] - T[1] * I[0]
    lt = (q[0] * I[1] - q[1] * I[0]) / den
    li = (T[0] * q[1] - T[1] * q[0]) / den
    lc = 1.0 - lt - li
    h = lc * RAISE[0] + lt * RAISE[1] + li * RAISE[2]
    stitch = math.sin(2 * math.pi * (q[0] * T[0] + q[1] * T[1]) * STAR_R * 1000.0 / STITCH)
    return hits / 4.0, (mm if inside else -mm), max(0.0, h), stitch


def atlas():
    """colour (r, g, b), normal (x, y), ambient occlusion, roughness, metalness: bytes, W x W"""
    n = W * W
    col = bytearray(n * 3)
    hgt = array('f', bytes(4 * n))
    ao, ro, me = bytearray(b'\xff' * n), bytearray(n), bytearray(n)
    clamp = lambda v: 0 if v < 0 else (255 if v > 255 else int(v + 0.5))
    mpp = SPAN / W
    for py in range(W):
        half = 1 if py < W // 2 else -1
        v = (py + 0.5) / W - (0.0 if half > 0 else 0.5)
        y = SPAN / 2 - v * SPAN - Y_OFF
        for px in range(W):
            u = (px + 0.5) / W
            x = u * SPAN - SPAN / 2
            if half < 0:
                x = -x
            st, dmm, emb, stitch = star_at(x, y)
            # slow wrinkles; the canvas weave
            wr = (wc.vn(px * 0.020, py * 0.020) - 0.5) + 0.5 * (wc.vn(px * 0.05 + 40, py * 0.05 + 9) - 0.5)
            weave = 0.5 * (math.sin(px * 2.2) + math.sin(py * 2.2))
            shade = 1.0 + 0.08 * wr
            # the embroidery: raised in from its outline (ridges to the points, valleys to the inner corners), the
            # stitches' threads; round it on the blue, the groove where it is sewn in, in shadow
            groove, thread = 0.0, 1.0
            if dmm is not None:
                if dmm > 0:
                    thread = 0.94 + 0.06 * stitch
                elif -dmm < GROOVE:
                    groove = 1.0 - (-dmm) / GROOVE
            blue = [b * (1.0 - 0.30 * groove) * (1.0 + 0.04 * weave) for b in BLUE]
            white = [w * thread for w in WHITE]
            c = [(blue[k] * (1 - st) + white[k] * st) * shade for k in range(3)]
            i = py * W + px
            col[3 * i], col[3 * i + 1], col[3 * i + 2] = clamp(c[0]), clamp(c[1]), clamp(c[2])
            # (heights in millimetres: the embroidery with its threads, the groove round it, wrinkles, the weave)
            hgt[i] = st * (emb + 0.06 * stitch) - 0.25 * groove * (1 - st) + 0.6 * wr + 0.05 * weave * (1 - st)
            ao[i] = clamp(255 * (1.0 - 0.35 * groove * (1 - st)))
            ro[i] = clamp(255 * (0.80 - 0.20 * st))
    nx, ny = bytearray(b'\x80' * n), bytearray(b'\x80' * n)
    s = 2.0 * mpp * 1000.0
    for py in range(W):
        up, dn = max(0, py - 1) * W, min(W - 1, py + 1) * W
        row = py * W
        for px in range(W):
            gx = (hgt[row + min(W - 1, px + 1)] - hgt[row + max(0, px - 1)]) / s
            gy = (hgt[dn + px] - hgt[up + px]) / s
            k = 1.0 / math.sqrt(gx * gx + gy * gy + 1.0)
            nx[row + px] = clamp((-gx * k * 0.5 + 0.5) * 255)
            ny[row + px] = clamp((-gy * k * 0.5 + 0.5) * 255)
    return col, nx, ny, ao, ro, me


# ---------------------------------------------------------------- the EDM file
def quat_axis(axis, deg):
    h = math.radians(deg) / 2
    s = math.sin(h)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(h)]


def turn_keys(axis, base):
    """-1 .. 1 -> base - TURN_MAX .. base + TURN_MAX degrees, a key every 1/8 (DCS goes between keys straight)"""
    return [[k / 8, *quat_axis(axis, base + TURN_MAX * k / 8)] for k in range(-8, 9)]


def flag_edm(m):
    nodes = [tb.anim_node('model::ArgPositionNode', 'flag_height', pos=[(HEIGHT_ARG, [[-1.0, 0.0, 0.0, 0.0], [0.0, 0.0, BASE_HEIGHT, 0.0], [1.0, 0.0, 2 * BASE_HEIGHT, 0.0]])]),
             tb.anim_node('model::ArgRotationNode', 'flag_pitch', rot=[(PITCH_ARG, turn_keys((0.0, 0.0, 1.0), BASE_PITCH))]),
             tb.anim_node('model::ArgRotationNode', 'flag_lean', rot=[(LEAN_ARG, turn_keys((1.0, 0.0, 0.0), BASE_LEAN))])]
    render = [tb.render_node('flag', 3, m)]
    # (its box: anywhere it can be put, turned either way)
    rr = HYP / 2 + 0.01
    lo, hi = [-rr, -rr, -rr], [rr, 2 * BASE_HEIGHT + rr, rr]
    f = tb.edm_file(nodes, [0, 1, 2], render, LEAN_ARG + 1, lo, hi, material_name='catcc_flag')
    mat = f['root']['materials'][0]
    for i, (k, v) in enumerate(mat):
        if k == 'TEXTURES':
            mat[i] = (k, [dict(t, name=NAMES[t['index']]) for t in v])
        elif k == 'UNIFORMS':
            mat[i] = (k, [dict(p, value=1.0) if p['name'] == 'normalMapValue' else p for p in v])
    return f, lo, hi


def lods_file():
    """the .lods file: the levels in order, each with how far it is drawn (DCS takes it for the shape's name)"""
    rows = ''.join('\t\t{"%s.edm", %.1f},\n' % (L['name'], L['far']) for L in LEVELS)
    return '-- the CATCC folded flag\'s levels of detail (generated by crew-test/model/flag.py)\nmodel = {\n\tlods = {\n%s\t};\n}\n' % rows


def main(out, extras):
    meshes = [build(i) for i in range(len(LEVELS))]
    m = meshes[0]
    col, nx, ny, ao, ro, me = atlas()
    os.makedirs(os.path.join(out, 'Shapes', 'textures'), exist_ok=True)
    for L, mesh in zip(LEVELS, meshes):
        f, lo, hi = flag_edm(mesh)
        data = edm.write(f)
        assert edm.write(edm.read(data), keep_table=True) == data, L['name'] + ': the written model does not read back the same'
        open(os.path.join(out, 'Shapes', L['name'] + '.edm'), 'wb').write(data)
    open(os.path.join(out, 'Shapes', 'CATCC_Flag.lods'), 'w', newline='\n').write(lods_file())
    open(os.path.join(out, 'Shapes', 'textures', NAMES[0] + '.dds'), 'wb').write(wc.dds([col[0::3], col[1::3], col[2::3]], 'bc1'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[1] + '.dds'), 'wb').write(wc.dds([nx, ny], 'bc5'))
    open(os.path.join(out, 'Shapes', 'textures', NAMES[2] + '.dds'), 'wb').write(wc.dds([ao, ro, me], 'bc1'))
    blo, bhi = tb.bounds([m])
    print('folded flag: %d vertices, %d triangles; legs %.3f m, long edge %.3f m, point %.3f m up, %.3f m thick; %d stars a face'
          % (len(m.v), len(m.tri), LEG, HYP, APEX, T, len(STARS)))
    print('  levels of detail: %s' % ', '.join('%s %d triangles to %.0f m' % (L['name'], len(x.tri), L['far']) for L, x in zip(LEVELS, meshes)))
    print('  shape %s to %s; argument %d height (0: %.2f m, -1: 0, 1: %.2f m), %d pitch (0: %.1f) and %d lean (0: %.1f), +-%.0f degrees'
          % (['%.3f' % v for v in blo], ['%.3f' % v for v in bhi], HEIGHT_ARG, BASE_HEIGHT, 2 * BASE_HEIGHT, PITCH_ARG, BASE_PITCH, LEAN_ARG, BASE_LEAN, TURN_MAX))
    print('  wrote %s, CATCC_Flag.lods and three textures to %s' % (', '.join(L['name'] + '.edm' for L in LEVELS), out))
    if not extras:
        return
    extra = os.path.join(HERE, 'out')
    os.makedirs(extra, exist_ok=True)
    open(os.path.join(extra, 'catcc_flag_diff.png'), 'wb').write(tb.png(W, W, [[(col[3 * (y * W + x)], col[3 * (y * W + x) + 1], col[3 * (y * W + x) + 2]) for x in range(W)] for y in range(W)]))
    obj, mtl = tb.obj(m, 'catcc_flag')
    open(os.path.join(extra, 'catcc_flag.obj'), 'w').write(obj)
    open(os.path.join(extra, 'catcc_flag.mtl'), 'w').write(mtl)
    tex = (col, nx, ny, ao)
    open(os.path.join(extra, 'catcc_flag_preview.png'), 'wb').write(wc.picture(1600, 800, [
        ([(m, 0.0)], (0.0, -0.05, -1.0), (0, 0, 800, 800), None),
        ([(m, 0.0)], (-0.55, -0.35, -0.75), (800, 0, 800, 400), None),
        ([(m, 0.0)], (0.6, -0.3, 0.75), (800, 400, 800, 400), None),
    ], tex))
    # (the levels of detail side by side, from the front and from above the long edge)
    open(os.path.join(extra, 'catcc_flag_lods.png'), 'wb').write(wc.picture(1600, 800, [
        ([(x, 0.0)], view, (400 * i, 400 * row, 400, 400), ((0.0, APEX / 2, 0.0), HYP * 0.6))
        for row, view in enumerate(((0.0, -0.05, -1.0), (0.45, -0.6, -0.65))) for i, x in enumerate(meshes)], tex))
    print('wrote the atlas picture, the OBJ copy, the preview and the levels of detail to', extra)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1], False)
    else:
        main(os.path.join(HERE, '..', 'Mods', 'tech', 'CATCC-Crew'), True)
