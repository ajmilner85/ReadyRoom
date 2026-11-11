"""
Generates src/components/catcc/prifly/nimitzDeck.gen.ts: the Nimitz flight deck for PriFly, in DCS
ship coordinates, plus the Supercarrier AI taxi routes.

Inputs
  - carrier-ops-handoff-2/Nimitz.svg: a hand trace (Inkscape, mm) over a top-down render of the DCS model.
  - the DCS install's CoreMods/tech/USS_Nimitz/scripts/trajectories_f18.lua (spawn spot -> catapult)
    and trajectories_f18_park.lua (landing -> parking spot): recorded deck-crew taxi paths, ship coords.

Coordinates out: metres, x forward (bow +), y to port, origin = the DCS unit's reference point (what the
hook's lat/lon is). DCS ship-local is x forward, z to starboard, so y = -z.

Trace -> DCS: x = A*X + BX, z = A*Y + BZ, fitted (least squares, residuals < 0.7 m) to the catapult start
points in USS_Nimitz_RunwaysAndRoutes.lua (GT.RunWays 1-4). The image is not stretched: the traced deck
is 332.4 m long (DCS GT.Length 332.9).

The trace is a sketch, so the landing area is regularised: every landing-area line shares one direction
(9.78 deg, the mean of the traced borders; the painted deck, not DCS's 9.14 deg landing strip), the hash
blocks sit square to the borders at equal stations and pair across the deck, the wires are parallel and
evenly spaced, and lines keep their traced offsets.

Usage: python scripts/catcc/nimitz-deck.py [DCS install dir]
"""
import html
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SVG = os.path.join(ROOT, 'carrier-ops-handoff-2', 'Nimitz.svg')
DCS = sys.argv[1] if len(sys.argv) > 1 else r'C:\Program Files\Eagle Dynamics\DCS World'
SCRIPTS = os.path.join(DCS, 'CoreMods', 'tech', 'USS_Nimitz', 'scripts')
OUT = os.path.join(ROOT, 'src', 'components', 'catcc', 'prifly', 'nimitzDeck.gen.ts')

# ---------------------------------------------------------------- SVG trace -> named polylines (doc mm)

def mat_mul(a, b):
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]

I = [1, 0, 0, 1, 0, 0]

def parse_tr(s):
    m = I
    for fn, args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
        a = [float(x) for x in re.split(r'[ ,]+', args.strip())]
        if fn == 'translate':
            n = [1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0]
        elif fn == 'rotate':
            r = math.radians(a[0]); c, s_ = math.cos(r), math.sin(r)
            n = [c, s_, -s_, c, 0, 0]
            if len(a) == 3:
                n = mat_mul(mat_mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]])
        elif fn == 'matrix':
            n = a
        elif fn == 'scale':
            n = [a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0]
        else:
            raise ValueError(fn)
        m = mat_mul(m, n)
    return m

def ap(m, p):
    return (m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5])

def path_pts(d):
    """Line-only SVG path data (M/L/H/V/Z, absolute or relative) -> list of subpaths."""
    toks = re.findall(r'[MmLlHhVvZz]|-?[\d.]+(?:e-?\d+)?', d)
    subs, cur = [], []
    x = y = 0.0
    start = (0.0, 0.0)
    cmd = None
    i = 0
    while i < len(toks):
        tk = toks[i]
        if re.match(r'[A-Za-z]', tk):
            cmd = tk
            i += 1
            if cmd in 'Zz':
                if cur:
                    cur.append(cur[0]); subs.append(cur); cur = []
                    x, y = start
            elif cmd in 'Mm':
                dx, dy = float(toks[i]), float(toks[i+1]); i += 2
                x, y = (x+dx, y+dy) if (cmd == 'm' and (subs or cur)) else (dx, dy)
                if cur:
                    subs.append(cur)
                cur = [(x, y)]; start = (x, y)
                cmd = 'l' if cmd == 'm' else 'L'
            continue
        if cmd in 'Ll':
            dx, dy = float(toks[i]), float(toks[i+1]); i += 2
            x, y = (x+dx, y+dy) if cmd == 'l' else (dx, dy)
        elif cmd in 'Hh':
            v = float(toks[i]); i += 1
            x = x+v if cmd == 'h' else v
        elif cmd in 'Vv':
            v = float(toks[i]); i += 1
            y = y+v if cmd == 'v' else v
        cur.append((x, y))
    if cur:
        subs.append(cur)
    return [s for s in subs if len(s) > 1]

def read_trace():
    t = open(SVG, encoding='utf-8').read()
    t = re.sub(r'xlink:href="data:[^"]*"', '', t)
    out = []
    stack = [(I, [])]
    for m in re.finditer(r'<(g|path|rect)\b([^>]*?)(/?)>|</g>', t):
        if m.group(0) == '</g>':
            stack.pop(); continue
        tag, a = m.group(1), m.group(2)
        g = lambda k: (re.search(r'(?:^|\s)%s="([^"]*)"' % k, a) or [None, None])[1]
        M = mat_mul(stack[-1][0], parse_tr(g('transform')))
        names = stack[-1][1] + [html.unescape(g('inkscape:label') or '')]
        if tag == 'g':
            if m.group(3) != '/':
                stack.append((M, names))
            continue
        if tag == 'path':
            subs = [[ap(M, p) for p in s] for s in path_pts(g('d'))]
        else:
            x, y, w, h = [float(g(k)) for k in ('x', 'y', 'width', 'height')]
            subs = [[ap(M, p) for p in [(x, y), (x+w, y), (x+w, y+h), (x, y+h), (x, y)]]]
        out.append(('/'.join(n for n in names if n), subs))
    return out

# ---------------------------------------------------------------- fit trace mm -> DCS metres

def lstsq(A, b):
    n = len(A[0])
    M = [[sum(r[i]*r[j] for r in A) for j in range(n)] + [sum(r[i]*y for r, y in zip(A, b))] for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda k: abs(M[k][i])); M[i], M[p] = M[p], M[i]
        for k in range(n):
            if k != i:
                f = M[k][i] / M[i][i]; M[k] = [u - f*v for u, v in zip(M[k], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]

def fit(trace):
    """Catapult start (aft end of the traced track) <-> GT.RunWays start points."""
    runways = {'1': (59.954, 18.02), '2': (58.80, -3.752), '3': (-37.374, -20.162), '4': (-56.176, -32.90)}
    rows, rhs = [], []
    for k, (x, z) in runways.items():
        s = feat(trace, 'Catapults/Cat %s' % k)[0]
        a = min(s, key=lambda p: p[0])
        rows.append([a[0], 1, 0]); rhs.append(x)
        rows.append([a[1], 0, 1]); rhs.append(z)
    A, BX, BZ = lstsq(rows, rhs)
    res = [abs(sum(u*v for u, v in zip(r, (A, BX, BZ))) - y) for r, y in zip(rows, rhs)]
    assert max(res) < 1.0, res
    return A, BX, BZ

def feat(trace, name):
    hits = [s for n, s in trace if n == name or n.endswith('/' + name)]
    assert hits, name
    return hits[0]

def feats(trace, prefix):
    return [(n, s) for n, s in trace if n.startswith(prefix)]

# ---------------------------------------------------------------- DCS taxi trajectories

def read_traj(file):
    s = open(os.path.join(SCRIPTS, file)).read()
    d, cur = {}, None
    for line in s.splitlines():
        m = re.match(r'^\[(\d+)\] = \{', line)
        if m:
            cur = int(m.group(1)); d[cur] = []; continue
        m = re.search(r'p=\{\s*([-\d.]+),\s*[-\d.]+,\s*([-\d.]+)\}', line)
        if m and cur is not None:
            x, z = map(float, m.groups())
            d[cur].append((x, -z))
    return d

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    L = math.hypot(b[0]-a[0], b[1]-a[1]) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts)-1):
        p = pts[i]
        d = abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx+1], eps)[:-1] + rdp(pts[idx:], eps)
    return [a, b]

# ---------------------------------------------------------------- build

def main():
    trace = read_trace()
    A, BX, BZ = fit(trace)
    D = lambda p: (A*p[0] + BX, -(A*p[1] + BZ))  # deck metres, y to port
    poly = lambda s: [D(p) for p in s]

    # landing area frame: u along the angled deck (forward, toward port), n to port of it
    th = math.radians(9.78)
    u = (math.cos(th), math.sin(th))
    n = (-math.sin(th), math.cos(th))
    S = lambda p: p[0]*u[0] + p[1]*u[1]
    O = lambda p: p[0]*n[0] + p[1]*n[1]
    P = lambda s, o: (s*u[0] + o*n[0], s*u[1] + o*n[1])
    mean = lambda xs: sum(xs) / len(xs)

    cl = poly(feat(trace, 'Landing Area Centreline')[0])
    li = poly(feat(trace, 'Landing Area Left Inner Border')[0])
    ri = poly(feat(trace, 'Laning Area Right Inner Border')[0])
    outer = poly(feat(trace, 'Landing Area Outer Border')[0])
    oC, oLI, oRI = mean([O(p) for p in cl]), mean([O(p) for p in li]), mean([O(p) for p in ri])
    # outer border polygon: [aft-port, aft-stbd, fwd-stbd, fwd-port, aft-port]
    oLO = mean([O(outer[0]), O(outer[3])])
    oRO = mean([O(outer[1]), O(outer[2])])
    # aft end: the stern edge (traced), as a line in the frame
    def at_edge(edge, o):
        (a, b) = edge
        # point on segment a-b with offset o
        oa, ob = O(a), O(b)
        t = (o - oa) / (ob - oa)
        return (a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)
    stern = (outer[0], outer[1])
    bowEdge = (outer[3], outer[2])
    aftS = lambda o: S(at_edge(stern, o))
    fwdS = lambda o: S(at_edge(bowEdge, o))
    # inner borders run to the launch round-down on the starboard side and to the traced end to port
    seg = lambda o, s0, s1: [P(s0, o), P(s1, o)]
    la = {
        'c': seg(oC, aftS(oC), max(S(p) for p in cl)),
        'li': seg(oLI, aftS(oLI), max(S(p) for p in li)),
        'ri': seg(oRI, aftS(oRI), max(S(p) for p in ri)),
        'outer': [at_edge(stern, oLO), at_edge(stern, oRO), at_edge(bowEdge, oRO), at_edge(bowEdge, oLO)],
    }
    # hash blocks: traced stations (both sides), snapped to one even spacing
    marks = feats(trace, 'Flight Deck/Landing Area/Left Landing Area Hash Marks') + feats(trace, 'Flight Deck/Landing Area/Right Landing Area Hash Marks')
    centroid = lambda s: (mean([D(p)[0] for p in s]), mean([D(p)[1] for p in s]))
    st = sorted(S(centroid(s[0])) for _, s in marks)
    # cluster to stations
    groups = []
    for s_ in st:
        if groups and s_ - groups[-1][-1] < 4:
            groups[-1].append(s_)
        else:
            groups.append([s_])
    cs = [mean(g) for g in groups]
    step = mean([b - a for a, b in zip(cs, cs[1:]) if b - a < 30])
    off = mean([c - round(c/step)*step for c in cs])
    side = lambda pref: {round((S(centroid(s[0])) - off) / step) for _, s in feats(trace, pref)}
    left = side('Flight Deck/Landing Area/Left Landing Area Hash Marks')
    right = side('Flight Deck/Landing Area/Right Landing Area Hash Marks')
    W = 5.765 * A / 2  # half the traced block width along the border
    block = lambda s, o0, o1: [P(s-W, o0), P(s+W, o0), P(s+W, o1), P(s-W, o1)]
    la['hash'] = [block(k*step + off, oLI, oLO) for k in sorted(left)] + [block(k*step + off, oRI, oRO) for k in sorted(right)]
    # centreline yellow dashes and the round-down mark: keep traced stations, on the centreline
    la['yellow'] = []
    for _, s in feats(trace, 'Flight Deck/Landing Area Centerline Yellow Markings'):
        q = poly(s[0]); la['yellow'].append([P(S(q[0]), oC), P(S(q[-1]), oC)])
    rdm = poly(feat(trace, 'Round Down Centerline Marking')[0])
    la['rdMark'] = [P(S(rdm[0]), oC), P(S(rdm[-1]), oC)]
    la['sternRd'] = poly(feat(trace, 'Stern Rounddown')[0])
    la['launchRd'] = poly(feat(trace, 'Stern Cats Launch Rounddown')[0])

    # wires: perpendicular to the landing area, evenly spaced, spanning the traced ends
    ws = []
    for k in '1234':
        q = poly(feat(trace, '%s Wire' % k)[0]); ws.append((mean([S(p) for p in q]), min(O(p) for p in q), max(O(p) for p in q)))
    w0, w3 = ws[0][0], ws[-1][0]
    wo0, wo1 = mean([w[1] for w in ws]), mean([w[2] for w in ws])
    wires = [[P(w0 + (w3-w0)*i/3, wo0), P(w0 + (w3-w0)*i/3, wo1)] for i in range(4)]

    cats = {}
    for k in '1234':
        q = poly(feat(trace, 'Catapults/Cat %s' % k)[0])
        a, b = (q[0], q[-1]) if q[0][0] < q[-1][0] else (q[-1], q[0])
        cats[k] = [a, b]
    jbd = {k: poly(feat(trace, 'Cat %s JBD' % k)[0])[:-1] for k in '1234'}
    elev = {}
    for k in '1234':
        elev[k] = {'poly': poly(feat(trace, 'El %s' % k)[0]), 'safety': poly(feat(trace, 'El %s Safety Line' % k)[0])}
    parking = []
    for nm, s in feats(trace, 'Parking Locations/'):
        q = poly(s[0])
        parking.append({'name': nm.split('/')[-1], 'poly': q[:-1] if q[0] == q[-1] else q})
    helo = []
    for nm, s in feats(trace, 'Helicopter Landing Areas/'):
        parts = nm.split('/')
        spot = parts[1]
        if not helo or helo[-1]['n'] != spot:
            helo.append({'n': spot, 'sq': []})
        part = parts[-1]
        q = poly(s[0])
        if part == 'T':
            helo[-1]['t'] = q
        elif part == 'Numeral':
            helo[-1]['num'] = q[:4]  # the box the spot number is painted in (no box: no number painted)
        elif part == 'Extension':
            helo[-1]['ext'] = q
        else:
            helo[-1]['sq'].append(q)
    safety = [poly(s[0]) for nm, s in feats(trace, 'Flight Deck/Safety Lines/')]
    # hull number on the bow: hollow block glyphs, tops toward the bow. The traced strokes are glyph
    # centrelines; keep the 7's measured skeleton and the 1's bar so the TS glyphs can be placed exactly
    bow = {'seven': poly(feat(trace, 'CVN-71 - 7 Numeral')[0]), 'one': poly(feat(trace, 'CVN-71 - 1 Numeral')[0]), 'stroke': 1.865 * A}
    struct = {nm.split('/')[-1]: poly(s[0]) for nm, s in feats(trace, 'Other Structures/') if 'Ordnance' not in nm}
    ordnance = [poly(s[0]) for nm, s in feats(trace, 'Other Structures/Ordnance Elevator')]
    barricade = [poly(feat(trace, '%s Barricade Stanchion' % k)[0]) for k in ('Left', 'Right')]
    outline = poly(feat(trace, 'Deck Outline')[0])

    # taxi routes (F/A-18 recordings; the F-14 ones follow the same lanes)
    TO_CAT = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 1, 2, 2, 1, 3, 4]  # GT.TaxiForTORoutes[i].RunwayIdx
    to = read_traj('trajectories_f18.lua')
    park = read_traj('trajectories_f18_park.lua')
    taxiTo = [{'spot': k, 'cat': str(TO_CAT[k-1]), 'pts': rdp(v, 0.25)} for k, v in sorted(to.items())]
    taxiPark = [{'spot': k, 'pts': rdp(v, 0.25)} for k, v in sorted(park.items())]

    def r(v):
        if isinstance(v, float):
            return round(v, 2)
        if isinstance(v, (list, tuple)):
            return [r(x) for x in v]
        if isinstance(v, dict):
            return {k: r(x) for k, x in v.items()}
        return v

    deck = r({
        'outline': outline, 'la': la, 'wires': wires, 'barricade': barricade, 'cats': cats, 'jbd': jbd,
        'elev': elev, 'parking': parking, 'helo': helo, 'bow': bow, 'safety': safety, 'struct': struct, 'ordnance': ordnance,
        'laDeg': 9.78,
    })
    taxi = r({'to': taxiTo, 'park': taxiPark})
    js = lambda o: json.dumps(o, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by scripts/catcc/nimitz-deck.py from carrier-ops-handoff-2/Nimitz.svg and the DCS\n')
        f.write('// Supercarrier taxi trajectories. Do not edit by hand. Metres, x forward, y to port, origin = the\n')
        f.write('// DCS unit reference point. fit: x = %.5f*X %+.3f, z = %.5f*Y %+.3f (trace mm -> DCS)\n' % (A, BX, A, BZ))
        f.write('type V = [number, number];\n')
        f.write('export const NIMITZ_DECK = %s as unknown as NimitzDeck;\n' % js(deck))
        f.write('export const NIMITZ_TAXI = %s as unknown as { to: { spot: number; cat: string; pts: V[] }[]; park: { spot: number; pts: V[] }[] };\n' % js(taxi))
        f.write('''export interface NimitzDeck {
  outline: V[];
  la: { c: V[]; li: V[]; ri: V[]; outer: V[]; hash: V[][]; yellow: V[][]; rdMark: V[]; sternRd: V[]; launchRd: V[] };
  wires: V[][];
  barricade: V[][];
  cats: Record<string, V[]>;
  jbd: Record<string, V[]>;
  elev: Record<string, { poly: V[]; safety: V[] }>;
  parking: { name: string; poly: V[] }[];
  helo: { n: string; t: V[]; sq: V[][]; ext?: V[]; num?: V[] }[];
  bow: { seven: V[]; one: V[]; stroke: number };
  safety: V[][];
  struct: Record<string, V[]>;
  ordnance: V[][];
  laDeg: number;
}
''')
    print('fit A=%.5f BX=%.3f BZ=%.3f; stations step %.2f m; %d hash blocks; to %d, park %d routes; %d bytes' % (A, BX, BZ, step, len(la['hash']), len(taxiTo), len(taxiPark), os.path.getsize(OUT)))

main()
