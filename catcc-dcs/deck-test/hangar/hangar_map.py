"""The hangar deck of DCS's Nimitz-class carrier, mapped FROM THE MODELS THEMSELVES.

    python -I hangar_map.py [--dcs "C:\\Program Files\\Eagle Dynamics\\DCS World"] [--out <folder>]

Asked for by the user (2026-11-17): "map the hangar space ... What's the best way to get the available space in the
hangar? ... maybe there is a faster way from reading the model geometry itself?" There is: the carrier's models are
plain .edm files, which crew-test/model/edm.py reads whole, and their coordinates ARE the ship's (x forward, y up,
z to starboard, from the ship's own origin: the same numbers the hook and PriFly use). No camera, no clicking, no
screenshot: every wall, pillar and fitting to the centimetre, and what DCS's physics takes for the floor.

What is read (nothing of DCS's is run or changed):
  CoreMods/tech/USS_Nimitz/Shapes/Nimitz_CVN_71_Collision.EDM   the ship's collision shells: "Col_Hangar" is the
        hangar as the physics has it (a floor and what bounds it); the elevators' shells and where they travel
  Mods/tech/Supercarrier/Shapes/Nimitz_Hangar.EDM               the hangar as it is DRAWN with the Supercarrier
        (523,000 triangles: walls, doors, fittings, everything standing on the floor)
  CoreMods/tech/USS_Nimitz/Shapes/Hang_Floor.edm                the hangar as drawn without it (the plain floor)

What is made of it (in --out, default this folder):
  hangar-plan.png    seen from straight above with everything over 4.8 m taken away (the roof, the lights): 10 cm a
                     pixel, bow to the right, starboard down. White: floor free up to 4.8 m (a Hornet is 4.7 m to the
                     top of its fins). Orange: something stands there but only below 1.2 m (wheels and a tractor
                     cannot pass; a wing or a nose can hang over it). Red: something between 1.2 and 4.8 m (nothing
                     passes). Purple: part of something that MOVES in the model (an elevator, a door, a rail). Blue-grey:
                     free floor that is drawn but is not the physics'. Black: nothing. Blue line: the edge of the
                     physics' floor. Thin lines every 10 m, heavier through the ship's origin.
  hangar-plan.svg    the same as drawing: the physics' floor as a polygon, the cuts through the drawn hangar at 0.3,
                     1.5 and 3.0 m above the floor, the elevators' platforms as they stand when lowered, a 10 m grid
                     with the ship's coordinates written on it.
  hangar-map.json    for programs: the floor's height, the physics' floor polygon(s), the elevators, and the grid
                     at 20 cm ("rows": one string a row from port to starboard... see "legend" in the file), the
                     areas in square metres.
  --nimitz <Nimitz.svg>   also (re)writes the layer "Hangar Deck" in the deck drawing (carrier-ops-handoff-2/
                     Nimitz.svg: asked for by the user, 2026-11-17), in that drawing's own millimetres (its fit to the
                     ship, as scripts/catcc/nimitz-deck.py works it out and writes at the top of nimitzDeck.gen.ts):
                     the physics' floor, the drawn floor, the cut at 1.5 m (walls and fittings) and at 0.3 m.
                     Everything else in the file is left byte for byte.

TWO FLOORS. The floor that is DRAWN is 203 m by 42.7 m. The floor DCS's PHYSICS has is smaller: the shell
"Col_Hangar" (180 m by 34.7 m: it stops 4 m short of either side wall and 20 m short of the forward bulkhead) plus a
sill in each of the four elevator doorways (the hull's own shells). An aircraft standing on its own wheels needs the
physics' floor; an aircraft we place ourselves (a static, or the player's jet held by the hook) only needs to clear
what is drawn.

The transforms (checked 2026-11-17 against what is known from DCS: the collision model's elevator 1 comes out at
29.2 m forward, 30.0 m to starboard, its top at 20.24 m, where the hook has elevator 1 and the flight deck is
20.15): a node's 16 numbers are a matrix in column order (OpenGL's); an animated node at rest is its base matrix x
a move to its base position (+ its position key at argument 0) x its base turn x its base scale; a render node's
vertices carry, as their fourth number, which of the node's parents they hang on.
"""
import importlib.util
import json
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('edm', os.path.join(HERE, '..', 'crew-test', 'model', 'edm.py'))
edm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(edm)

CELL = 0.1          # metres a pixel
TOP = 4.8           # everything above this over the floor is taken away
LOW = 1.2           # below this an obstacle is "low": wheels cannot pass, a wing can hang over
SKIN = 0.15         # what is this near the floor counts as floor (markings, tie-down points)
CUTS = (0.3, 1.5, 3.0)
X0, X1, Z0, Z1 = -140.0, 100.0, -45.0, 45.0   # what is drawn, in ship coordinates


# ---------------------------------------------------------------- matrices (4 x 4, as rows)
def ident():
    return [[1.0, 0, 0, 0], [0, 1.0, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]


def mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def from_columns(m):
    return [[m[c * 4 + r] for c in range(4)] for r in range(4)]


def move(x, y, z):
    m = ident()
    m[0][3], m[1][3], m[2][3] = x, y, z
    return m


def turn(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1.0]]


def stretch(s):
    m = ident()
    m[0][0], m[1][1], m[2][2] = s[0], s[1], s[2]
    return m


def key_at_zero(keys, width):
    """an animation's value at argument 0: keys are [t, v...]; between two keys, in proportion; none: nothing"""
    if not keys:
        return None
    ks = sorted(keys, key=lambda k: k[0])
    if ks[0][0] >= 0:
        return ks[0][1:1 + width]
    if ks[-1][0] <= 0:
        return ks[-1][1:1 + width]
    for a, b in zip(ks, ks[1:]):
        if a[0] <= 0 <= b[0]:
            k = (0 - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0
            return [a[1 + i] + (b[1 + i] - a[1 + i]) * k for i in range(width)]
    return None


def local(n):
    """a node's own transform, at rest; and whether it is one that moves"""
    t = n['type']
    if t == 'model::TransformNode':
        return from_columns(n['matrix']), False
    if 'base' in n:
        b = n['base']
        p = list(b['position'])
        for _arg, keys in n.get('pos', []):
            v = key_at_zero(keys, 3)
            if v:
                p = [p[i] + v[i] for i in range(3)]
        m = mul(from_columns(b['matrix']), move(*p))
        m = mul(m, turn(b['quat1']))
        for _arg, keys in n.get('rot', []):
            v = key_at_zero(keys, 4)
            if v:
                m = mul(m, turn(v))
        m = mul(m, stretch(b['scale']))
        return m, True
    return ident(), t == 'model::ArgVisibilityNode'


def world_matrices(f):
    """every node's transform to the ship's coordinates, and whether anything above it moves"""
    out, moving = [], []
    for i, n in enumerate(f['nodes']):
        m, mv = local(n)
        p = f['parents'][i]
        if p >= 0:
            m = mul(out[p], m)
            mv = mv or moving[p]
        out.append(m)
        moving.append(mv)
    return out, moving


def triangles(f, want=None):
    """every triangle of the model's render and shell nodes, in the ship's coordinates:
    yields (name, kind, moving, (x, y, z) x 3). want(name, kind): which nodes"""
    mats, moving = world_matrices(f)
    for kind, nodes in f['items']:
        for n in nodes:
            if 'vtx' not in n or n['type'] not in ('model::RenderNode', 'model::ShellNode'):
                continue
            name = n.get('name') or ''
            if want and not want(name, n['type']):
                continue
            v = n['vtx']
            stride, count = v['stride'], v['count']
            fl = struct.unpack('<%df' % (count * stride), v['data'])
            it = n['idx']
            idx = struct.unpack('<%d%s' % (it['count'], 'BHI'[it['type']]), it['data'])
            if n['type'] == 'model::ShellNode':
                slots = [n['parent']]
                per_vertex = False
            else:
                slots = [p[0] for p in n['parents']]
                per_vertex = len(slots) > 1
            pts, mov = [None] * count, [False] * count
            for i in range(count):
                o = i * stride
                x, y, z = fl[o], fl[o + 1], fl[o + 2]
                s = slots[int(round(fl[o + 3]))] if per_vertex and 0 <= int(round(fl[o + 3])) < len(slots) else slots[0]
                m = mats[s] if 0 <= s < len(mats) else None
                if m is None:
                    pts[i] = (x, y, z)
                else:
                    pts[i] = (m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3], m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3], m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3])
                    mov[i] = moving[s]
            for j in range(0, len(idx) - 2, 3):
                a, b, c = idx[j], idx[j + 1], idx[j + 2]
                if a < count and b < count and c < count:
                    yield name, n['type'], mov[a] or mov[b] or mov[c], pts[a], pts[b], pts[c]


# ---------------------------------------------------------------- the grid
NX, NZ = int(round((X1 - X0) / CELL)), int(round((Z1 - Z0) / CELL))


class Grid:
    def __init__(self):
        self.b = bytearray(NX * NZ)

    def fill(self, poly):
        """the cells whose centres a convex polygon ((x, z) points) covers, and those its edge passes through"""
        n = len(poly)
        if n < 3:
            return
        zs = [p[1] for p in poly]
        r0, r1 = max(0, int(math.floor((min(zs) - Z0) / CELL))), min(NZ - 1, int(math.floor((max(zs) - Z0) / CELL)))
        b = self.b
        for r in range(r0, r1 + 1):
            za, zb = Z0 + r * CELL, Z0 + (r + 1) * CELL
            lo, hi = None, None
            for i in range(n):
                (xa, ya), (xb, yb) = poly[i], poly[(i + 1) % n]
                if ya > yb:
                    xa, ya, xb, yb = xb, yb, xa, ya
                if yb < za or ya > zb:
                    continue
                # the part of this edge inside the row's band
                if yb - ya < 1e-12:
                    e0, e1 = min(xa, xb), max(xa, xb)
                else:
                    t0, t1 = max(0.0, (za - ya) / (yb - ya)), min(1.0, (zb - ya) / (yb - ya))
                    e0, e1 = xa + (xb - xa) * t0, xa + (xb - xa) * t1
                    if e0 > e1:
                        e0, e1 = e1, e0
                lo = e0 if lo is None or e0 < lo else lo
                hi = e1 if hi is None or e1 > hi else hi
            if lo is None:
                continue
            c0, c1 = max(0, int(math.floor((lo - X0) / CELL))), min(NX - 1, int(math.floor((hi - X0) / CELL)))
            if c1 >= c0:
                o = r * NX
                b[o + c0:o + c1 + 1] = b'\x01' * (c1 - c0 + 1)


def clip_band(tri, lo, hi):
    """the part of a triangle between two heights, as (x, z) points (a convex polygon); None: none of it"""
    poly = list(tri)
    for level, keep_above in ((lo, True), (hi, False)):
        out = []
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            ia = (a[1] >= level) if keep_above else (a[1] <= level)
            ib = (b[1] >= level) if keep_above else (b[1] <= level)
            if ia:
                out.append(a)
            if ia != ib:
                t = (level - a[1]) / (b[1] - a[1])
                out.append((a[0] + (b[0] - a[0]) * t, level, a[2] + (b[2] - a[2]) * t))
        poly = out
        if len(poly) < 3:
            # (a triangle standing on edge still shows as a line: keep two points)
            if len(poly) < 2:
                return None
    return [(p[0], p[2]) for p in poly]


def cut(tri, level):
    """where a triangle crosses a height: a segment ((x, z), (x, z)), or None"""
    pts = []
    for i in range(3):
        a, b = tri[i], tri[(i + 1) % 3]
        if (a[1] - level) * (b[1] - level) < 0:
            t = (level - a[1]) / (b[1] - a[1])
            pts.append((a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t))
        elif a[1] == level:
            pts.append((a[0], a[2]))
    if len(pts) >= 2 and (abs(pts[0][0] - pts[1][0]) > 1e-6 or abs(pts[0][1] - pts[1][1]) > 1e-6):
        return pts[0], pts[1]
    return None


def join(segs):
    """segments ((x, z), (x, z)) joined end to end into lines (lists of points): neighbouring triangles cut by one
    height give segments that share their ends"""
    def key(q):
        return (round(q[0], 3), round(q[1], 3))
    ends = {}
    for i, (a, b) in enumerate(segs):
        ends.setdefault(key(a), []).append(i)
        ends.setdefault(key(b), []).append(i)
    used = [False] * len(segs)
    lines = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        line = [segs[i][0], segs[i][1]]
        for at_end in (True, False):
            while True:
                tip = line[-1] if at_end else line[0]
                nxt = [j for j in ends.get(key(tip), []) if not used[j]]
                if not nxt:
                    break
                j = nxt[0]
                used[j] = True
                a, b = segs[j]
                other = b if key(a) == key(tip) else a
                if at_end:
                    line.append(other)
                else:
                    line.insert(0, other)
        lines.append(line)
    return lines


# ---------------------------------------------------------------- pictures
def png(path, w, h, rgb):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = bytearray()
    for r in range(h):
        raw.append(0)
        raw += rgb[r * w * 3:(r + 1) * w * 3]
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


def outline(tris):
    """the outer edge(s) of a set of flat triangles ((x, z) x 3), as loops of points. Every triangle is taken the same
    way round; an edge is on the rim if no triangle runs it the other way; the rim edges are followed head to tail.
    A loop that goes round a hole (the other way round), or encloses next to nothing (where a long edge meets two
    short ones), is left out."""
    def key(p):
        return (round(p[0], 3), round(p[1], 3))
    directed = {}
    for t in tris:
        q = [key(v) for v in t]
        if q[0] == q[1] or q[1] == q[2] or q[0] == q[2]:
            continue
        twice = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1])
        if twice < 0:
            q = [q[0], q[2], q[1]]
        for i in range(3):
            directed[(q[i], q[(i + 1) % 3])] = True
    nxt = {}
    for (u, v) in directed:
        if (v, u) not in directed:
            nxt.setdefault(u, []).append(v)
    loops = []
    while nxt:
        start = next(iter(nxt))
        loop, cur = [start], start
        while len(loop) < 200000:
            outs = nxt.get(cur)
            if not outs:
                break
            v = outs.pop()
            if not outs:
                del nxt[cur]
            if v == start:
                break
            loop.append(v)
            cur = v
        signed = sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop))) / 2
        if len(loop) >= 3 and signed > 1.0:
            # (points in a straight line with their neighbours are dropped)
            keep = []
            n = len(loop)
            for i in range(n):
                a_, b_, c_ = loop[i - 1], loop[i], loop[(i + 1) % n]
                if abs((b_[0] - a_[0]) * (c_[1] - a_[1]) - (c_[0] - a_[0]) * (b_[1] - a_[1])) > 1e-4:
                    keep.append(b_)
            loops.append(keep if len(keep) >= 3 else loop)
    return loops


def trace(mask, tol=0.12):
    """the outer edge(s) of the filled cells of a grid (a bytearray, NX by NZ), as loops of (x, z) points: the cells'
    own edges followed, then straightened to within `tol` metres. Holes and specks (under 50 m2) are left out. (For a
    floor that the models give only as thousands of overlapping pieces.)"""
    nxt = {}
    for r in range(NZ):
        o = r * NX
        for c in range(NX):
            if not mask[o + c]:
                continue
            if r == 0 or not mask[o - NX + c]:
                nxt.setdefault((c + 1, r), []).append((c, r))
            if r == NZ - 1 or not mask[o + NX + c]:
                nxt.setdefault((c, r + 1), []).append((c + 1, r + 1))
            if c == 0 or not mask[o + c - 1]:
                nxt.setdefault((c, r), []).append((c, r + 1))
            if c == NX - 1 or not mask[o + c + 1]:
                nxt.setdefault((c + 1, r + 1), []).append((c + 1, r))

    def simplify(seg):
        if len(seg) < 3:
            return seg
        (ax, az), (bx, bz) = seg[0], seg[-1]
        ln = math.hypot(bx - ax, bz - az) or 1e-9
        far, at = 0.0, 0
        for i in range(1, len(seg) - 1):
            d = abs((bx - ax) * (seg[i][1] - az) - (bz - az) * (seg[i][0] - ax)) / ln
            if d > far:
                far, at = d, i
        if far <= tol:
            return [seg[0], seg[-1]]
        return simplify(seg[:at + 1])[:-1] + simplify(seg[at:])

    loops = []
    while nxt:
        start = next(iter(nxt))
        loop, cur = [start], start
        while True:
            outs = nxt.get(cur)
            if not outs:
                break
            v = outs.pop()
            if not outs:
                del nxt[cur]
            if v == start:
                break
            loop.append(v)
            cur = v
        signed = sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop))) / 2 * CELL * CELL
        if abs(signed) < 50:
            continue
        pts = [(X0 + c * CELL, Z0 + r * CELL) for c, r in loop]
        i0 = min(range(len(pts)), key=lambda i: pts[i])
        ring = pts[i0:] + pts[:i0]
        j = max(range(len(ring)), key=lambda i: ring[i])
        out = simplify(ring[:j + 1])[:-1] + simplify(ring[j:] + [ring[0]])[:-1]
        if len(out) >= 3:
            loops.append(out)
    return loops


def area(loop):
    return abs(sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop)))) / 2


def write_layer(path, floor_y, loops, drawn, walls, low):
    """(Re)writes the layer "Hangar Deck" of the deck drawing, in the drawing's own millimetres. The drawing's fit to the
    ship (x = A * X + BX forward, z = A * Y + BZ to starboard) is read from the top of nimitzDeck.gen.ts, where
    scripts/catcc/nimitz-deck.py writes it. Everything else in the file is left byte for byte."""
    import re
    gen = os.path.join(HERE, '..', '..', '..', 'src', 'components', 'catcc', 'prifly', 'nimitzDeck.gen.ts')
    head = open(gen, encoding='utf-8').read(600)
    m = re.search(r'fit: x = ([\d.]+)\*X (-?[\d.]+), z = ([\d.]+)\*Y (-?[\d.]+)', head)
    if not m:
        raise SystemExit('the drawing\'s fit to the ship is not at the top of ' + gen)
    A, BX, BZ = float(m.group(1)), float(m.group(2)), float(m.group(4))

    def P(q):
        return '%.2f,%.2f' % ((q[0] - BX) / A, (q[1] - BZ) / A)

    def paths(lines):
        return ''.join('<path d="%s" />' % ''.join('M' + 'L'.join(P(q).replace(',', ' ') for q in ln) for ln in lines[i:i + 150]) for i in range(0, len(lines), 150))

    text = open(path, encoding='utf-8', newline='').read()
    text = re.sub(r'<g\b[^>]*\bid="layer-hangar-deck"[^>]*>.*?</g><!--/layer-hangar-deck-->', '', text, flags=re.S)
    parts = ['<g inkscape:label="Hangar Deck" inkscape:groupmode="layer" id="layer-hangar-deck" style="display:inline">',
             '<desc id="hangar-deck-desc">The hangar deck, %.2f m above the ship\'s origin (the flight deck is 20.15), from DCS\'s models: catcc-dcs/deck-test/hangar/hangar_map.py. Rewritten by that script: do not edit by hand.</desc>' % floor_y,
             '<g inkscape:label="Floor as drawn" id="hangar-floor-drawn" style="fill:#aab9c8;fill-opacity:0.35;stroke:#6b7682;stroke-width:0.2">',
             ''.join('<polygon points="%s" />' % ' '.join(P(q) for q in lp) for lp in drawn), '</g>',
             '<g inkscape:label="Floor of the physics (Col_Hangar and the doorway sills)" id="hangar-floor-physics" style="fill:#1e6eff;fill-opacity:0.18;stroke:#1e6eff;stroke-width:0.25">',
             ''.join('<polygon points="%s" />' % ' '.join(P(q) for q in lp) for lp in loops), '</g>',
             '<g inkscape:label="Low fittings (cut 0.3 m above the floor)" id="hangar-cut-low" style="fill:none;stroke:#f0961e;stroke-width:0.1;stroke-linecap:round;stroke-linejoin:round">', paths(low), '</g>',
             '<g inkscape:label="Walls and fittings (cut 1.5 m above the floor)" id="hangar-cut-walls" style="fill:none;stroke:#c82828;stroke-width:0.15;stroke-linecap:round;stroke-linejoin:round">', paths(walls), '</g>',
             '</g><!--/layer-hangar-deck-->']
    layer = ''.join(parts)
    i = text.rindex('</svg>')
    open(path, 'w', encoding='utf-8', newline='').write(text[:i] + layer + text[i:])
    print('the layer "Hangar Deck" written to %s: %d + %d polygons, %d + %d lines, %d bytes (the drawing\'s fit: x = %.5f X %+.3f, z = %.5f Y %+.3f)' % (
        path, len(drawn), len(loops), len(low), len(walls), len(layer), A, BX, A, BZ))


def main():
    args = sys.argv[1:]
    dcs = r'C:\Program Files\Eagle Dynamics\DCS World'
    out = HERE
    nimitz = None
    while args:
        a = args.pop(0)
        if a == '--dcs':
            dcs = args.pop(0)
        elif a == '--out':
            out = args.pop(0)
        elif a == '--nimitz':
            nimitz = args.pop(0)
    os.makedirs(out, exist_ok=True)
    files = {
        'collision': os.path.join(dcs, 'CoreMods', 'tech', 'USS_Nimitz', 'Shapes', 'Nimitz_CVN_71_Collision.EDM'),
        'hangar': os.path.join(dcs, 'Mods', 'tech', 'Supercarrier', 'Shapes', 'Nimitz_Hangar.EDM'),
        'plain': os.path.join(dcs, 'CoreMods', 'tech', 'USS_Nimitz', 'Shapes', 'Hang_Floor.edm'),
    }
    notes = []

    # ---- the physics: the hangar's shell, the elevators
    col = edm.read(open(files['collision'], 'rb').read())
    shell = [t for t in triangles(col, lambda name, kind: name == 'Col_Hangar')]
    if not shell:
        raise SystemExit('no Col_Hangar shell in ' + files['collision'])
    floor_y = min(min(p[1] for p in t[3:6]) for t in shell)
    roof_y = max(max(p[1] for p in t[3:6]) for t in shell)
    # (the floor of Col_Hangar, and the sills in the elevator doorways, which are level faces of the hull's own shells
    # at the same height: CENTER_R_01 / _02, BACK_R, BACK_L)
    every = list(triangles(col))
    flat = [[(p[0], p[2]) for p in t[3:6]] for t in every
            if abs(max(p[1] for p in t[3:6]) - floor_y) < 0.03 and abs(min(p[1] for p in t[3:6]) - floor_y) < 0.03 and X0 < min(p[0] for p in t[3:6]) and max(p[0] for p in t[3:6]) < X1]
    sills = sorted(set(t[0] for t in every if t[0] != 'Col_Hangar' and abs(max(p[1] for p in t[3:6]) - floor_y) < 0.03 and abs(min(p[1] for p in t[3:6]) - floor_y) < 0.03 and X0 < min(p[0] for p in t[3:6]) and max(p[0] for p in t[3:6]) < X1))
    loops = sorted(outline(flat), key=area, reverse=True)
    print('   the doorway sills: level faces at the same height in the shells %s' % ', '.join(sills))
    print('the physics: Col_Hangar: %d triangles; floor at %.3f m above the ship\'s origin, roof %.3f (%.2f m of height); %d floor triangles, %d outline(s)' % (
        len(shell), floor_y, roof_y, roof_y - floor_y, len(flat), len(loops)))
    for lp in loops:
        print('   outline: %d corners, %.0f m2: %s' % (len(lp), area(lp), ' '.join('%.2f/%.2f' % p for p in lp)))
    col_floor = Grid()
    for t in flat:
        col_floor.fill(t)
    col_walls = []   # the shell's own cut at 1.5 m: where the physics has walls
    for t in every:
        if X0 < min(q[0] for q in t[3:6]) and max(q[0] for q in t[3:6]) < X1 and max(abs(q[2]) for q in t[3:6]) < 24 and not t[0].startswith('ELEVATOR'):
            s = cut(t[3:6], floor_y + 1.5)
            if s:
                col_walls.append(s)
    # the elevators: each shell's extent as it stands (up), and how far it comes down (its node's position keys)
    elevators = []
    names = {i: n for i, n in enumerate(col['nodes'])}
    for kind, nodes in col['items']:
        for n in nodes:
            if (n.get('name') or '').startswith('ELEVATOR_'):
                tr = [t for t in triangles(col, lambda name, k, want=n['name']: name == want)]
                xs = [p[0] for t in tr for p in t[3:6]]
                ys = [p[1] for t in tr for p in t[3:6]]
                zs = [p[2] for t in tr for p in t[3:6]]
                node = names.get(n['parent'])
                drop = 0.0
                for _arg, keys in (node or {}).get('pos', []):
                    drop = max(drop, max(abs(k[3]) for k in keys))
                arg = [a for a, _ in (node or {}).get('pos', [])]
                elevators.append({'shell': n['name'], 'x': [round(min(xs), 2), round(max(xs), 2)], 'z': [round(min(zs), 2), round(max(zs), 2)], 'top_up': round(max(ys), 3),
                                  'top_down': round(max(ys) - drop, 3), 'travel': round(drop, 3), 'argument': arg[0] if arg else None})
    # (numbered as the ship numbers them: 1 and 2 forward of the island to starboard, 3 aft of it, 4 to port)
    order = sorted(elevators, key=lambda e: (e['z'][0] < 0, -e['x'][0]))
    for i, e in enumerate(order):
        e['elevator'] = i + 1
        print('   elevator %d (%s, argument %s): %.1f..%.1f forward, %.1f..%.1f to starboard; its top at %.2f up, %.2f lowered (the hangar floor is %.2f)' % (
            e['elevator'], e['shell'], e['argument'], e['x'][0], e['x'][1], e['z'][0], e['z'][1], e['top_up'], e['top_down'], floor_y))

    # ---- what is drawn: floor, obstacles, cuts
    vis_floor, low, high, moves = Grid(), Grid(), Grid(), Grid()
    cuts = {c: [] for c in CUTS}
    counts = {}
    for which in ('hangar', 'plain'):
        p = files[which]
        if not os.path.exists(p):
            notes.append('%s is not there (%s): left out' % (which, p))
            print('NOT THERE:', p)
            continue
        f = edm.read(open(p, 'rb').read())
        n_all = n_floor = n_obst = 0
        for _name, _kind, mv, a, b, c in triangles(f):
            n_all += 1
            ymin, ymax = min(a[1], b[1], c[1]), max(a[1], b[1], c[1])
            if max(a[0], b[0], c[0]) < X0 or min(a[0], b[0], c[0]) > X1:
                continue
            if ymax <= floor_y + SKIN and ymin >= floor_y - 0.5:
                vis_floor.fill([(a[0], a[2]), (b[0], b[2]), (c[0], c[2])])
                n_floor += 1
                continue
            if ymax <= floor_y + SKIN or ymin >= floor_y + TOP:
                continue
            n_obst += 1
            tri = (a, b, c)
            if which == 'hangar':
                for cc in CUTS:
                    if ymin < floor_y + cc < ymax:
                        s = cut(tri, floor_y + cc)
                        if s:
                            cuts[cc].append(s)
            if mv:
                poly = clip_band(tri, floor_y + SKIN, floor_y + TOP)
                if poly:
                    moves.fill(poly)
                continue
            if ymin < floor_y + LOW:
                poly = clip_band(tri, floor_y + SKIN, floor_y + LOW)
                if poly:
                    low.fill(poly)
            if ymax > floor_y + LOW:
                poly = clip_band(tri, floor_y + LOW, floor_y + TOP)
                if poly:
                    high.fill(poly)
        counts[which] = (n_all, n_floor, n_obst)
        print('%s: %d triangles; %d of the floor, %d between %.2f and %.1f m above it' % (os.path.basename(p), n_all, n_floor, n_obst, SKIN, TOP))

    # the floor as drawn, as one outline: the models give it in thousands of overlapping pieces (plates, markings), so
    # it is taken from the picture's cells (10 cm) and straightened to 12 cm
    both = bytearray(NX * NZ)
    for i in range(NX * NZ):
        if vis_floor.b[i] or col_floor.b[i]:
            both[i] = 1
    drawn = sorted(trace(both), key=area, reverse=True)[:1]
    for lp in drawn:
        xs, zs = [q[0] for q in lp], [q[1] for q in lp]
        print('the floor as drawn (traced from the cells, to 12 cm): %d corners, %.0f m2: %.1f..%.1f forward, %.1f..%.1f to starboard' % (len(lp), area(lp), min(xs), max(xs), min(zs), max(zs)))

    # ---- the picture
    rgb = bytearray(NX * NZ * 3)
    tally = {'free': 0, 'low': 0, 'high': 0, 'moves': 0, 'drawn_free': 0, 'drawn_low': 0, 'drawn_high': 0}
    cf, vf, lo, hi, mo = col_floor.b, vis_floor.b, low.b, high.b, moves.b
    for i in range(NX * NZ):
        if hi[i]:
            col_ = (200, 40, 40)
            if cf[i]:
                tally['high'] += 1
            elif vf[i]:
                tally['drawn_high'] += 1
        elif mo[i]:
            col_ = (150, 60, 200)
            if cf[i]:
                tally['moves'] += 1
        elif lo[i]:
            col_ = (240, 150, 30)
            if cf[i]:
                tally['low'] += 1
            elif vf[i]:
                tally['drawn_low'] += 1
        elif cf[i]:
            col_ = (245, 245, 245)
            tally['free'] += 1
        elif vf[i]:
            col_ = (170, 185, 200)
            tally['drawn_free'] += 1
        else:
            col_ = (0, 0, 0)
        rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2] = col_
    # the physics floor's edge in blue; the grid
    def dot(c, r, colr):
        if 0 <= c < NX and 0 <= r < NZ:
            o = (r * NX + c) * 3
            rgb[o], rgb[o + 1], rgb[o + 2] = colr
    for lp in loops:
        for i in range(len(lp)):
            (xa, za), (xb, zb) = lp[i], lp[(i + 1) % len(lp)]
            n = max(1, int(max(abs(xb - xa), abs(zb - za)) / CELL) * 2)
            for k in range(n + 1):
                x, z = xa + (xb - xa) * k / n, za + (zb - za) * k / n
                dot(int((x - X0) / CELL), int((z - Z0) / CELL), (30, 110, 255))
    for gx in range(int(X0), int(X1) + 1, 10):
        c = int(round((gx - X0) / CELL))
        for r in range(NZ):
            if gx == 0 or r % 4 < 2:
                o = (r * NX + min(c, NX - 1)) * 3
                rgb[o], rgb[o + 1], rgb[o + 2] = [(v + 110) // 2 for v in rgb[o:o + 3]]
    for gz in range(int(Z0), int(Z1) + 1, 10):
        r = min(NZ - 1, int(round((gz - Z0) / CELL)))
        for c in range(NX):
            if gz == 0 or c % 4 < 2:
                o = (r * NX + c) * 3
                rgb[o], rgb[o + 1], rgb[o + 2] = [(v + 110) // 2 for v in rgb[o:o + 3]]
    png(os.path.join(out, 'hangar-plan.png'), NX, NZ, rgb)
    m2 = CELL * CELL
    print('on the physics\' floor: %.0f m2 free up to %.1f m; %.0f m2 with something below %.1f m only; %.0f m2 with something above that; %.0f m2 under parts that move' % (
        tally['free'] * m2, TOP, tally['low'] * m2, LOW, tally['high'] * m2, tally['moves'] * m2))
    print('drawn floor that is not the physics\': %.0f m2 free up to %.1f m; %.0f m2 with something low; %.0f m2 with something higher' % (tally['drawn_free'] * m2, TOP, tally['drawn_low'] * m2, tally['drawn_high'] * m2))

    # ---- the drawing
    S = 8.0  # pixels a metre
    def X(x): return (x - X0) * S
    def Zc(z): return (z - Z0) * S
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="Segoe UI, Arial, sans-serif">' % ((X1 - X0) * S, (Z1 - Z0) * S, (X1 - X0) * S, (Z1 - Z0) * S),
           '<rect width="100%" height="100%" fill="#ffffff"/>',
           '<title>Nimitz class hangar deck, from DCS\'s models (ship coordinates: metres forward of the origin, metres to starboard)</title>']
    svg.append('<g id="grid" stroke="#d8dde3" stroke-width="1" font-size="11" fill="#6b7682">')
    for gx in range(int(X0), int(X1) + 1, 10):
        svg.append('<line x1="%.1f" y1="0" x2="%.1f" y2="%.1f"%s/>' % (X(gx), X(gx), (Z1 - Z0) * S, ' stroke="#9aa5b1"' if gx == 0 else ''))
        svg.append('<text x="%.1f" y="12" stroke="none">%d</text>' % (X(gx) + 3, gx))
    for gz in range(int(Z0), int(Z1) + 1, 10):
        svg.append('<line x1="0" y1="%.1f" x2="%.1f" y2="%.1f"%s/>' % (Zc(gz), (X1 - X0) * S, Zc(gz), ' stroke="#9aa5b1"' if gz == 0 else ''))
        svg.append('<text x="3" y="%.1f" stroke="none">%d</text>' % (Zc(gz) - 3, gz))
    svg.append('</g>')
    svg.append('<g id="drawn-floor" fill="#f1f3f5" stroke="#6b7682" stroke-width="1.5">')
    for lp in drawn:
        svg.append('<polygon points="%s"/>' % ' '.join('%.2f,%.2f' % (X(x), Zc(z)) for x, z in lp))
    svg.append('</g>')
    svg.append('<g id="physics-floor" fill="#e8f1ff" stroke="#1e6eff" stroke-width="2">')
    for lp in loops:
        svg.append('<polygon points="%s"/>' % ' '.join('%.2f,%.2f' % (X(x), Zc(z)) for x, z in lp))
    svg.append('</g>')
    svg.append('<g id="elevators-lowered" fill="none" stroke="#8a3fd1" stroke-width="2" stroke-dasharray="8 5" font-size="14">')
    for e in order:
        svg.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f"/>' % (X(e['x'][0]), Zc(e['z'][0]), (e['x'][1] - e['x'][0]) * S, (e['z'][1] - e['z'][0]) * S))
        svg.append('<text x="%.1f" y="%.1f" fill="#8a3fd1" stroke="none">elevator %d</text>' % (X(e['x'][0]) + 6, Zc(e['z'][0]) + 18, e['elevator']))
    svg.append('</g>')
    for cc, colr, wd in ((0.3, '#f0961e', 0.7), (3.0, '#7a8794', 0.7), (1.5, '#c82828', 1.1)):
        lines = join(cuts[cc])
        svg.append('<g id="cut-%.1fm" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round">' % (cc, colr, wd))
        for i in range(0, len(lines), 200):
            svg.append('<path d="%s"/>' % ''.join('M' + 'L'.join('%.1f %.1f' % (X(q[0]), Zc(q[1])) for q in ln) for ln in lines[i:i + 200]))
        svg.append('</g>')
    svg.append('<g id="physics-walls" fill="none" stroke="#1e6eff" stroke-width="1.2" stroke-dasharray="3 3">')
    svg.append('<path d="%s"/>' % ''.join('M%.1f %.1fL%.1f %.1f' % (X(a[0]), Zc(a[1]), X(b[0]), Zc(b[1])) for a, b in col_walls))
    svg.append('</g>')
    svg.append('<g font-size="14" fill="#222">')
    svg.append('<text x="12" y="%.1f">Hangar deck, floor %.2f m above the ship\'s origin. Bow to the right, starboard down. Numbers: metres forward of the origin (across), metres to starboard (down).</text>' % ((Z1 - Z0) * S - 46, floor_y))
    svg.append('<text x="12" y="%.1f"><tspan fill="#6b7682">grey outline: the floor as drawn</tspan> · <tspan fill="#1e6eff">blue: the floor as DCS\'s physics has it (Col_Hangar and the doorway sills), dashed: its walls</tspan> · <tspan fill="#c82828">red: the drawn hangar cut 1.5 m above the floor</tspan> · <tspan fill="#f0961e">orange: cut at 0.3 m</tspan> · <tspan fill="#7a8794">grey: cut at 3.0 m</tspan> · <tspan fill="#8a3fd1">purple: the elevators\' platforms</tspan></text>' % ((Z1 - Z0) * S - 26))
    svg.append('<line x1="12" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#222" stroke-width="3"/><text x="%.1f" y="%.1f">10 m</text>' % ((Z1 - Z0) * S - 10, 12 + 10 * S, (Z1 - Z0) * S - 10, 18 + 10 * S, (Z1 - Z0) * S - 6))
    svg.append('</g></svg>')
    open(os.path.join(out, 'hangar-plan.svg'), 'w', encoding='utf-8').write('\n'.join(svg))

    # ---- for programs: the grid at 20 cm (2 x 2 of the picture's cells: the worst of the four)
    step = 2
    rows = []
    for r in range(0, NZ - step + 1, step):
        row = []
        for c in range(0, NX - step + 1, step):
            ids = [(r + dr) * NX + c + dc for dr in range(step) for dc in range(step)]
            phys = all(cf[i] for i in ids)
            if not phys and not all(cf[i] or vf[i] for i in ids):
                row.append(' ')
            elif any(hi[i] for i in ids):
                row.append('h')
            elif any(mo[i] for i in ids):
                row.append('m')
            elif any(lo[i] for i in ids):
                row.append('l')
            else:
                row.append('.' if phys else ',')
        rows.append(''.join(row).rstrip())
    data = {
        'what': 'The hangar deck of DCS\'s Nimitz class carrier (CVN-71), from the models (catcc-dcs/deck-test/hangar/hangar_map.py). Ship coordinates: x metres forward of the ship\'s origin, z metres to starboard, heights above the origin.',
        'floor_y': round(floor_y, 3), 'roof_y': round(roof_y, 3),
        'floor': [[[round(x, 3), round(z, 3)] for x, z in lp] for lp in loops],
        'floor_area_m2': round(sum(area(lp) for lp in loops), 1),
        'floor_shells': ['Col_Hangar'] + sills,
        'drawn_floor': [[[round(x, 3), round(z, 3)] for x, z in lp] for lp in drawn],
        'drawn_floor_area_m2': round(sum(area(lp) for lp in drawn), 1),
        'elevators': [{k: e[k] for k in ('elevator', 'shell', 'argument', 'x', 'z', 'top_up', 'top_down', 'travel')} for e in order],
        'grid': {'cell': CELL * step, 'x0': X0, 'z0': Z0, 'columns': NX // step, 'rows': len(rows),
                 'legend': {'.': 'physics floor, free from %.2f to %.1f m above it' % (SKIN, TOP), ',': 'floor that is drawn but is not the physics\', free likewise', 'l': 'something below %.1f m only' % LOW, 'h': 'something between %.1f and %.1f m' % (LOW, TOP),
                            'm': 'under a part that moves in the model (an elevator, a door, a rail)', ' ': 'no floor'},
                 'how': 'rows[r][c]: the cell whose corner is x0 + c * cell forward, z0 + r * cell to starboard (rows run from port to starboard); a row is cut where nothing more follows',
                 'rows': rows},
        'area_m2': {k: round(v * m2, 1) for k, v in tally.items()},
        'triangles': counts, 'notes': notes,
    }
    json.dump(data, open(os.path.join(out, 'hangar-map.json'), 'w', encoding='utf-8'), indent=1)
    if nimitz:
        write_layer(nimitz, floor_y, loops, drawn, join(cuts[1.5]), join(cuts[0.3]))
    print('written: hangar-plan.png (%d x %d), hangar-plan.svg (%d cut segments), hangar-map.json (%d x %d cells of %.1f m)' % (
        NX, NZ, sum(len(v) for v in cuts.values()), NX // step, len(rows), CELL * step))


if __name__ == '__main__':
    main()
