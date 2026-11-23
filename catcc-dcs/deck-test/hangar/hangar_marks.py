"""The hangar's surfaces the user marked in DCS, folded into the hangar's map.

    python -I hangar_marks.py                      says what hangar-marks.json holds
    python -I hangar_marks.py --from <file>        takes the points of a marks file saved by the crew test hook
                                                   (Saved Games/DCS/Logs/catcc-hangar-marks.lua) into hangar-marks.json
    python -I hangar_marks.py --svg <Nimitz.svg>   (re)writes the layer "Hangar Marks" of the deck drawing

WHAT THE POINTS ARE (the user, 2026-11-18, with the panel's crosshair, "Hangar marks": each a point on the hangar
floor, in the ship's own frame: x metres forward of its origin, z to starboard): "I only marked the objects along the
fwd and aft walls of the hangar (I didn't actually mark the fwd and aft walls themselves), the rest of the floor plan
seemed correct." The map made from DCS's models (hangar_map.py) has free floor there: the drawn floor runs on forward
of the physics' own (to 74 m, where the physics' ends at 53.3), and nothing of what stands along the two end walls
is in it.

WHAT IS MADE OF THEM. The points come in the order he walked them: each run of points (a new run where two in a row
are more than 15 m apart) is the OUTLINE of what stands along one end wall, from one side of the hangar to the other.
Everything between an outline and the hangar's end behind it is taken as BLOCKED, to the full height (nothing passes:
no wheel, no tractor, no wing over it): the outline, closed round the end of the drawn floor. Two things in that are
ASSUMED, not marked: (1) from an outline's first and last point straight out to the hangar's side (he stopped 1.4 to
2.6 m short of the side walls) counts as blocked too; (2) how high the objects are (a wing might pass over a low one).

hangar_plan.py applies this to the map's grid before it makes the plan the demo runs with (crewtest_hangar.lua).
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, 'hangar-marks.json')
LAYER_ID = 'layer-hangar-marks'
NEW_RUN = 15.0


def points():
    return json.load(open(FILE, encoding='utf-8'))['points'] if os.path.exists(FILE) else []


def runs(pts=None):
    """the outlines: the points in runs, as he walked them"""
    out = []
    for p in (points() if pts is None else pts):
        if out and math.hypot(p['x'] - out[-1][-1]['x'], p['z'] - out[-1][-1]['z']) <= NEW_RUN:
            out[-1].append(p)
        else:
            out.append([p])
    return [r for r in out if len(r) >= 2]


def blocked(MAP, pts=None):
    """the blocked areas: one polygon ((x, z) corners) for each outline, closed round the hangar's end behind it"""
    drawn = [q for lp in MAP['drawn_floor'] for q in lp]
    phys = [q for lp in MAP['floor'] for q in lp]
    mid = (min(q[0] for q in phys) + max(q[0] for q in phys)) / 2
    za, zb = min(q[1] for q in drawn), max(q[1] for q in drawn)
    polys = []
    for r in runs(pts):
        fwd = sum(p['x'] for p in r) / len(r) > mid
        xe = max(q[0] for q in drawn) if fwd else min(q[0] for q in drawn)
        z0 = zb if r[0]['z'] > r[-1]['z'] else za
        z1 = za if z0 == zb else zb
        polys.append({'end': 'forward' if fwd else 'aft', 'points': [p['n'] for p in r],
                      'poly': [(xe, z0), (r[0]['x'], z0)] + [(p['x'], p['z']) for p in r] + [(r[-1]['x'], z1), (xe, z1)]})
    return polys


def inside(poly, x, z):
    n, hit = len(poly), False
    for i in range(n):
        (ax, az), (bx, bz) = poly[i], poly[(i + 1) % n]
        if (az > z) != (bz > z) and x < ax + (bx - ax) * (z - az) / (bz - az):
            hit = not hit
    return hit


def apply(MAP, pts=None):
    """the map's grid with every cell of floor whose middle is in a blocked area made 'h' (something high): changed in
    place; gives the polygons and how many square metres of floor that had been free are now blocked"""
    G = MAP['grid']
    cell, rows = G['cell'], G['rows']
    polys = blocked(MAP, pts)
    was_free = 0
    for B in polys:
        xs, zs = [q[0] for q in B['poly']], [q[1] for q in B['poly']]
        r0, r1 = int(math.floor((min(zs) - G['z0']) / cell)), int(math.ceil((max(zs) - G['z0']) / cell))
        c0, c1 = int(math.floor((min(xs) - G['x0']) / cell)), int(math.ceil((max(xs) - G['x0']) / cell))
        for r in range(max(0, r0), min(len(rows), r1 + 1)):
            row = list(rows[r])
            z = G['z0'] + (r + 0.5) * cell
            for c in range(max(0, c0), min(len(row), c1 + 1)):
                if row[c] != ' ' and row[c] != 'h' and inside(B['poly'], G['x0'] + (c + 0.5) * cell, z):
                    if row[c] in '.,':
                        was_free += 1
                    row[c] = 'h'
            rows[r] = ''.join(row)
    return polys, was_free * cell * cell


def take(path):
    """the points of a marks file as the hook saves it"""
    pts = []
    for line in open(path, encoding='utf-8'):
        m = re.search(r'n = (\d+), kind = "([^"]*)", x = (-?[\d.]+), y = (-?[\d.]+), z = (-?[\d.]+)', line)
        if m:
            p = {'n': int(m.group(1)), 'kind': m.group(2), 'x': float(m.group(3)), 'y': float(m.group(4)), 'z': float(m.group(5))}
            g = re.search(r'gap = ([\d.]+)', line)
            if g:
                p['gap'] = float(g.group(1))
            pts.append(p)
    assert pts, 'no points in ' + path
    doc = {'what': 'Points on the hangar deck marked by the user in DCS with the crew test panel\'s crosshair ("Hangar marks"), in the order he took them: '
                   'the outlines of what stands along the hangar\'s forward and after walls. Ship coordinates: x metres forward of the ship\'s origin, '
                   'y up, z to starboard. Read by hangar_marks.py.',
           'points': pts}
    with open(FILE, 'w', encoding='utf-8', newline='\n') as f:
        f.write('{\n  "what": %s,\n  "points": [\n%s\n  ]\n}\n' % (json.dumps(doc['what']), ',\n'.join('    ' + json.dumps(p) for p in pts)))
    print('%d points taken into %s' % (len(pts), os.path.normpath(FILE)))


def write_layer(path, MAP):
    """(Re)writes the layer "Hangar Marks" of the deck drawing, in the drawing's own millimetres, as the last thing in
    the file (the drawing's fit to the ship is read as hangar_map.py reads it). Everything else is left byte for byte."""
    gen = os.path.join(HERE, '..', '..', '..', 'src', 'components', 'catcc', 'prifly', 'nimitzDeck.gen.ts')
    m = re.search(r'fit: x = ([\d.]+)\*X (-?[\d.]+), z = ([\d.]+)\*Y (-?[\d.]+)', open(gen, encoding='utf-8').read(600))
    if not m:
        raise SystemExit('the drawing\'s fit to the ship is not at the top of ' + gen)
    A, BX, BZ = float(m.group(1)), float(m.group(2)), float(m.group(4))

    def P(q):
        return '%.2f,%.2f' % ((q[0] - BX) / A, (q[1] - BZ) / A)

    text = open(path, encoding='utf-8', newline='').read()
    # the layer as it is, if it is there: from its opening tag to the </g> that closes it
    o = re.search(r'<g\b[^>]*\bid="%s"[^>]*>' % LAYER_ID, text)
    if o:
        depth, end = 1, None
        for t in re.finditer(r'<g\b[^>]*?(/?)>|</g>', text[o.end():]):
            if t.group(0) == '</g>':
                depth -= 1
            elif t.group(1) != '/':
                depth += 1
            if depth == 0:
                end = o.end() + t.end()
                break
        assert end, 'the layer "Hangar Marks" does not close'
        text = text[:o.start()] + text[end:]
    pts = points()
    polys = blocked(MAP, pts)
    by_n = {p['n']: p for p in pts}
    parts = ['<g inkscape:label="Hangar Marks" inkscape:groupmode="layer" id="%s" style="display:inline">' % LAYER_ID,
             '<desc id="hangar-marks-desc">What stands along the hangar\'s forward and after walls, as the user marked it in DCS (%d points on the hangar floor, '
             'catcc-dcs/deck-test/hangar/hangar-marks.json). The areas are what the tow planner takes as blocked: each outline closed round the end of the hangar '
             'behind it, and (assumed, not marked) straight out to the hangar\'s side from its first and last point. Rewritten by hangar_marks.py: do not edit by hand.</desc>' % len(pts),
             '<g inkscape:label="Blocked: what stands along the end walls" id="hangar-marks-blocked" style="fill:#c82828;fill-opacity:0.3;stroke:none">',
             ''.join('<polygon inkscape:label="%s end" points="%s" />' % (B['end'], ' '.join(P(q) for q in B['poly'])) for B in polys), '</g>',
             '<g inkscape:label="Outlines as marked" id="hangar-marks-outlines" style="fill:none;stroke:#c82828;stroke-width:0.3;stroke-linecap:round;stroke-linejoin:round">',
             ''.join('<polyline inkscape:label="%s end" points="%s" />' % (B['end'], ' '.join(P((by_n[n]['x'], by_n[n]['z'])) for n in B['points'])) for B in polys), '</g>',
             '<g inkscape:label="Marked points" id="hangar-marks-points" style="fill:#00b4d8;stroke:none">',
             ''.join('<circle inkscape:label="point %d" cx="%s" cy="%s" r="0.35" />' % ((p['n'],) + tuple(P((p['x'], p['z'])).split(','))) for p in pts), '</g>',
             '</g>']
    layer = ''.join(parts)
    i = text.rindex('</svg>')
    open(path, 'w', encoding='utf-8', newline='').write(text[:i] + layer + text[i:])
    print('the layer "Hangar Marks" written to %s: %d areas, %d points, %d bytes%s' % (path, len(polys), len(pts), len(layer), ' (it replaced the one that was there)' if o else ''))


def main():
    args = sys.argv[1:]
    MAP = json.load(open(os.path.join(HERE, 'hangar-map.json'), encoding='utf-8'))
    if '--from' in args:
        take(args[args.index('--from') + 1])
    polys, m2 = apply(MAP)
    print('%d points, %d outline(s); %.1f m2 of floor that the models\' map has free is blocked by them' % (len(points()), len(polys), m2))
    for B in polys:
        xs = [q[0] for q in B['poly'][2:-2]]
        zs = [q[1] for q in B['poly'][2:-2]]
        print('  the %s end: points %d .. %d, from %.2f to %.2f m to starboard; its face between %.2f and %.2f m forward' % (
            B['end'], B['points'][0], B['points'][-1], min(zs), max(zs), min(xs), max(xs)))
    if '--svg' in args:
        write_layer(args[args.index('--svg') + 1], MAP)


if __name__ == '__main__':
    main()
