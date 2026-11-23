"""
Reads the "Aircraft Spotting" layer of carrier-ops-handoff-2/Nimitz.svg (F/A-18C groups placed by hand)
and writes each jet's DCS spawn position in USS Nimitz ship coordinates:
  carrier-ops-handoff-2/deck-spots.csv and deck-spots.lua

Ship coordinates (USS_Nimitz_RunwaysAndRoutes.lua): metres, x forward, y up (flight deck 20.1494), z to
starboard, origin = the ship's reference point. Trace -> ship uses the same fit as nimitz-deck.py
(catapult starts <-> GT.RunWays).

Each jet's position is the F/A-18C's DCS reference point, not the middle of the outline. FA-18C_hornet.lua
puts the nozzle exits 8.005 m aft of it (engines_nozzles pos x). On the Hornet.svg trace the nozzles end
16.585 m behind the nose, so the reference point is 8.58 m behind the nose on the centreline. The
wingtip check agrees: DCS wing_tip_pos x -2.466 is 11.05 m behind the nose, and the traced tip's centre
is at 11.17 m.

Heading is the nose direction in degrees clockwise from the bow (0 = bow, 90 = starboard). For a
GT.TaxiForTORoutes entry DCS takes the spawn heading from the direction toward the route's second point,
so `ahead` is a point 10 m in front of the nose.

Usage: python scripts/catcc/nimitz-spots.py
"""
import html
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SVG = os.path.join(ROOT, 'carrier-ops-handoff-2', 'Nimitz.svg')
OUT_DIR = os.path.join(ROOT, 'carrier-ops-handoff-2')
DECK_Y = 20.1494

# nimitz-deck.py's trace helpers and fit, without running its main()
_gen_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nimitz-deck.py')
_src = open(_gen_path, encoding='utf-8').read()
_gen = {'__file__': _gen_path, '__name__': 'nimitz_deck'}
exec(compile(_src[:_src.rindex('main()')], _gen_path, 'exec'), _gen)
_gen['SVG'] = SVG
mat_mul, parse_tr, ap, I = _gen['mat_mul'], _gen['parse_tr'], _gen['ap'], _gen['I']

# Hornet trace (Hornet.svg root coords, mm; nose at X = 0 pointing -X, centreline Y = 186.50)
HORNET_MM_PER_M = 549.5398 / 17.07
REF_AFT_OF_NOSE = 16.585 - 8.005
REF = (REF_AFT_OF_NOSE * HORNET_MM_PER_M, 186.50)
NOSE = (0.0, 186.50)
# Nimitz.svg mm per metre, for the to-scale check
NIMITZ_MM_PER_M = 1 / 0.52669


def flatten(d, n=12):
    """SVG path data (M L H V C S Q Z, absolute or relative) -> list of point lists."""
    toks = re.findall(r'[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)
    i = 0
    subs, cur = [], []
    x = y = sx = sy = 0.0
    cmd = None
    lc = None

    def num():
        nonlocal i
        i += 1
        return float(toks[i - 1])
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]
            i += 1
            if cmd in 'Zz':
                if cur:
                    cur.append(cur[0])
                    subs.append(cur)
                    cur = []
                x, y, lc = sx, sy, None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if c == 'M':
            x, y = ox + num(), oy + num()
            if cur:
                subs.append(cur)
            cur, sx, sy, lc = [(x, y)], x, y, None
            cmd = 'l' if rel else 'L'
        elif c == 'L':
            x, y = ox + num(), oy + num()
            cur.append((x, y))
            lc = None
        elif c == 'H':
            x = ox + num()
            cur.append((x, y))
            lc = None
        elif c == 'V':
            y = oy + num()
            cur.append((x, y))
            lc = None
        elif c in 'CS':
            if c == 'C':
                x1, y1 = ox + num(), oy + num()
            else:
                x1, y1 = (2 * x - lc[0], 2 * y - lc[1]) if lc else (x, y)
            x2, y2 = ox + num(), oy + num()
            ex, ey = ox + num(), oy + num()
            for k in range(1, n + 1):
                t = k / n
                u = 1 - t
                cur.append((u**3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * ex,
                            u**3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * ey))
            lc, x, y = (x2, y2), ex, ey
        elif c == 'Q':
            x1, y1 = ox + num(), oy + num()
            ex, ey = ox + num(), oy + num()
            for k in range(1, n + 1):
                t = k / n
                u = 1 - t
                cur.append((u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey))
            x, y, lc = ex, ey, None
        else:
            raise ValueError('unsupported path command ' + cmd)
    if cur:
        subs.append(cur)
    return subs


def inside(p, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1:
            c = not c
    return c


def read():
    text = re.sub(r'xlink:href="data:[^"]*"', '', open(SVG, encoding='utf-8').read())
    areas, jets = [], []
    stack = [(I, [])]
    for m in re.finditer(r'<(g|path|rect)\b([^>]*?)(/?)>|</g>', text):
        if m.group(0) == '</g>':
            stack.pop()
            continue
        tag, a = m.group(1), m.group(2)
        g = lambda k: (re.search(r'(?:^|\s)%s="([^"]*)"' % k, a) or [None, None])[1]
        M = mat_mul(stack[-1][0], parse_tr(g('transform')))
        names = stack[-1][1] + [html.unescape(g('inkscape:label') or '')]
        if tag == 'g':
            if m.group(3) != '/':
                stack.append((M, names))
                # a placed jet: an F/A-18C group in any layer (copies pasted into another layer still count)
                if names[-1] == 'F/A-18C':
                    jets.append((g('id'), M, names[-2] if len(names) > 1 else ''))
            continue
        if tag == 'path' and ('Parking Locations' in names or 'Aircraft Elevators' in names) and 'Safety' not in names[-1]:
            areas.append((names[-1], [ap(M, p) for s in flatten(g('d')) for p in s]))
        elif tag == 'rect' and 'Parking Locations' in names:
            x, y, w, h = [float(g(k)) for k in ('x', 'y', 'width', 'height')]
            areas.append((names[-1], [ap(M, p) for p in [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]]))
    return areas, jets


def main():
    areas, jets = read()
    A, BX, BZ = _gen['fit'](_gen['read_trace']())
    inner = [1, 0, 0, 1, 223.30833, 125.41912]  # each jet's source group translate (Hornet.svg layer)
    rows = []
    layers = {}
    for _, _, ly in jets:
        layers[ly] = layers.get(ly, 0) + 1
    print('jets per layer:', layers)
    for jid, M, _ in jets:
        Mi = mat_mul(M, inner)
        # REF/NOSE are Hornet.svg root coords = source-group coords + translate, so apply M (outer) to them
        o, n = ap(M, REF), ap(M, NOSE)
        x, z = A * o[0] + BX, A * o[1] + BZ
        nx, nz = A * n[0] + BX, A * n[1] + BZ
        hdg = math.degrees(math.atan2(nz - z, nx - x)) % 360
        scale = math.hypot(Mi[0], Mi[1]) * HORNET_MM_PER_M / NIMITZ_MM_PER_M
        assert abs(scale - 1) < 0.01, (jid, scale)
        area = next((nm for nm, poly in areas if inside(o, poly)), '')
        if not area:
            # (the area names of 2026-11-23: deck-spots-dcs.csv, which names every spot, numbers each area by nearness
            # to its catapult; this script numbers the drawing's from the bow aft)
            area = ('Stbd bow' if z > 0 else 'Port bow') if x > 85 else 'Fantail' if x < -145 else 'Port quarter'
        r = math.radians(hdg)
        rows.append(dict(id=jid, area=area, x=x, z=z, hdg=hdg, ax=x + 10 * math.cos(r), az=z + 10 * math.sin(r), svg=o))
    order = ['Stbd bow', 'Port bow', 'Crotch', 'Point', 'El 1', 'Box', 'Sixpack', 'Street', 'Corral', 'El 2',
             'Junk Yard', 'El 3', 'Patio', 'Fantail', 'Port quarter', 'El 4', 'Finger']
    rows.sort(key=lambda r: (order.index(r['area']) if r['area'] in order else 99, -r['x']))
    count = {}
    for r in rows:
        count[r['area']] = count.get(r['area'], 0) + 1
        r['name'] = '%s %d' % (r['area'] or 'Deck', count[r['area']])

    with open(os.path.join(OUT_DIR, 'deck-spots.csv'), 'w', encoding='utf-8', newline='') as f:
        f.write('spot,name,x_fwd_m,y_up_m,z_stbd_m,heading_rel_bow_deg,ahead_x_m,ahead_z_m,svg_id\n')
        for i, r in enumerate(rows, 1):
            f.write('%d,%s,%.2f,%.4f,%.2f,%.1f,%.2f,%.2f,%s\n' % (i, r['name'], r['x'], DECK_Y, r['z'], r['hdg'], r['ax'], r['az'], r['id']))
    with open(os.path.join(OUT_DIR, 'deck-spots.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('-- F/A-18C spawn spots on USS Nimitz, from the Aircraft Spotting layer of Nimitz.svg\n')
        f.write('-- (scripts/catcc/nimitz-spots.py). Ship coords as in USS_Nimitz_RunwaysAndRoutes.lua: x forward,\n')
        f.write('-- y up, z starboard, metres. hdg: nose direction, deg clockwise from the bow. ahead: 10 m in front of\n')
        f.write('-- the nose; as the second point of a GT.TaxiForTORoutes route it gives DCS the spawn heading.\n')
        f.write('local SPOTS = {\n')
        for i, r in enumerate(rows, 1):
            f.write('  { n = %2d, name = %-14s pos = {%8.2f, %.4f, %7.2f}, hdg = %5.1f, ahead = {%8.2f, %.4f, %7.2f} },\n'
                    % (i, '"%s",' % r['name'], r['x'], DECK_Y, r['z'], r['hdg'], r['ax'], DECK_Y, r['az']))
        f.write('}\nreturn SPOTS\n')
    for i, r in enumerate(rows, 1):
        print('%2d  %-12s %8.2f %8.2f %6.1f' % (i, r['name'], r['x'], r['z'], r['hdg']))
    print('fit A=%.5f BX=%.3f BZ=%.3f; %d jets' % (A, BX, BZ, len(rows)))
    write_svg_layer(rows)


def write_svg_layer(rows):
    """(Re)writes the "Spawn Points" layer of Nimitz.svg: one dot per spot at the jet's DCS reference point
    (root user units, mm). Everything else in the file is left byte for byte."""
    text = open(SVG, encoding='utf-8', newline='').read()
    text = re.sub(r'<g\b[^>]*\bid="layer-spawn-points"[^>]*>.*?</g>', '', text, flags=re.S)
    dots = ''.join(
        '<circle id="spawn-%d" inkscape:label="%d %s" cx="%.4f" cy="%.4f" r="0.3" />'
        % (i, i, html.escape(r['name']), r['svg'][0], r['svg'][1]) for i, r in enumerate(rows, 1))
    layer = ('<g inkscape:label="Spawn Points" inkscape:groupmode="layer" id="layer-spawn-points" '
             'style="fill:#ff2a2a;stroke:none">%s</g>' % dots)
    i = text.rindex('</svg>')
    open(SVG, 'w', encoding='utf-8', newline='').write(text[:i] + layer + text[i:])
    print('wrote %d dots to the Spawn Points layer of %s' % (len(rows), SVG))


main()
