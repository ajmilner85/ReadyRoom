"""The user's hangar spotting plan, read from the deck drawing.

    python -I catcc-dcs/deck-test/hangar/hangar_spots.py [--csv out.csv]

Reads carrier-ops-handoff-2/Nimitz.svg: every F/A-18C group under the layer "Hangar Spotting" (the user's, 2026-11-17:
"The hangar deck plan I've built is kind of a worst case, fully packed state"), wherever that layer sits in the
drawing, and gives each aircraft's DCS reference point and heading in the ship's own coordinates (x forward, z to
starboard, metres; heading in degrees clockwise from the bow), exactly as scripts/catcc/nimitz-spots.py does for the
flight deck's "Aircraft Spotting" (its Hornet reference point, its fit of the drawing to the ship). Nothing is written
to the drawing.

Also says, for each aircraft, what the hangar's map (hangar-map.json) has under it: how much of its folded outline
stands on floor, and its room to the walls.
"""
import html
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SPOTS_PY = os.path.join(ROOT, 'scripts', 'catcc', 'nimitz-spots.py')
LAYER = 'Hangar Spotting'


def tools():
    """nimitz-spots.py's own helpers and constants, without running its main()"""
    src = open(SPOTS_PY, encoding='utf-8').read()
    ns = {'__file__': SPOTS_PY, '__name__': 'nimitz_spots'}
    exec(compile(src[:src.rindex('\nmain()')], SPOTS_PY, 'exec'), ns)
    return ns


def read(ns=None):
    ns = ns or tools()
    mat_mul, parse_tr, ap, I = ns['mat_mul'], ns['parse_tr'], ns['ap'], ns['I']
    text = re.sub(r'xlink:href="data:[^"]*"', '', open(ns['SVG'], encoding='utf-8').read())
    jets = []
    stack = [(I, [])]
    for m in re.finditer(r'<(g)\b([^>]*?)(/?)>|</g>', text):
        if m.group(0) == '</g>':
            stack.pop()
            continue
        a = m.group(2)
        g = lambda k: (re.search(r'(?:^|\s)%s="([^"]*)"' % k, a) or [None, None])[1]
        M = mat_mul(stack[-1][0], parse_tr(g('transform')))
        names = stack[-1][1] + [html.unescape(g('inkscape:label') or '')]
        if m.group(3) != '/':
            stack.append((M, names))
            # (the user's own labels, 2026-11-18: "F/A-18C EL3 6": the elevator it goes up by and its turn there)
            if names[-1].startswith('F/A-18C') and LAYER in names[:-1]:
                jets.append((g('id'), M, names[-1]))
    A, BX, BZ = ns['_gen']['fit'](ns['_gen']['read_trace']())
    inner = [1, 0, 0, 1, 223.30833, 125.41912]
    rows = []
    for jid, M, label in jets:
        Mi = mat_mul(M, inner)
        o, n = ap(M, ns['REF']), ap(M, ns['NOSE'])
        x, z = A * o[0] + BX, A * o[1] + BZ
        nx, nz = A * n[0] + BX, A * n[1] + BZ
        hdg = math.degrees(math.atan2(nz - z, nx - x)) % 360
        scale = math.hypot(Mi[0], Mi[1]) * ns['HORNET_MM_PER_M'] / ns['NIMITZ_MM_PER_M']
        el = re.search(r'EL\s*(\d)\s+(\d+)', label)
        rows.append(dict(id=jid, x=x, z=z, hdg=hdg, scale=scale, label=label, el=int(el.group(1)) if el else None, seq=int(el.group(2)) if el else None))
    rows.sort(key=lambda r: -r['x'])
    return rows


def main():
    rows = read()
    print('%d aircraft on the layer "%s"' % (len(rows), LAYER))
    for i, r in enumerate(rows, 1):
        print('%2d  x %8.2f  z %7.2f  hdg %6.1f  scale %.3f  %-14s %s' % (i, r['x'], r['z'], r['hdg'], r['scale'], r['label'], r['id']))
    if '--csv' in sys.argv:
        out = sys.argv[sys.argv.index('--csv') + 1]
        with open(out, 'w', encoding='utf-8', newline='') as f:
            f.write('n,x_fwd_m,z_stbd_m,heading_rel_bow_deg,svg_id\n')
            for i, r in enumerate(rows, 1):
                f.write('%d,%.3f,%.3f,%.2f,%s\n' % (i, r['x'], r['z'], r['hdg'], r['id']))
        print('written', out)


if __name__ == '__main__':
    main()
