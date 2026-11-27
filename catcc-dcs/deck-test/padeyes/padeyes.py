"""The flight deck's padeyes (tie-down points): the "Padeyes" layer of the deck drawing, for the in-game panel.

    python -I padeyes.py                  writes Scripts/CATCC/crewtest_padeyes.lua from the Padeyes layer of Nimitz.svg
    python -I padeyes.py --check          says whether that file is what the layer gives now (exit 1 if not)
    (--svg <file>, --out <file> and --fix <file> read and write other files than these, for the tests)
    python -I padeyes.py --from <file>    takes the padeyes as the user left them in DCS (the crew test panel's
                                          "Padeyes" page saves them to Saved Games/DCS/Logs/catcc-padeyes.lua) into
                                          the Padeyes layer, then writes crewtest_padeyes.lua again from it
    python -I padeyes.py --fit <file>     fits the texture's fix (padeyes-fix.json) again with the padeyes the user
                                          set one by one in that file (confirmed, or moved on their own), writes
                                          crewtest_padeyes.lua again, and rebases the file on it (the old one kept
                                          as <file>.before-fit)

THE LAYER (carrier-ops-handoff-2/Nimitz.svg, top level, above the deck texture "Layer 1"): one dot (a circle) for
each padeye, at its centre, in the drawing's own units (mm; the texture spans the whole view box), in sublayers:
"Flight Deck", "El 1" .. "El 4" (each elevator's platform has its own grid of padeyes, shifted from the deck's) and
"Under Paint" (hidden: where the deck's grid runs on under a painted line and no padeye can be seen in the texture;
very likely padeyes, not seen). First found in the texture by machine (2026-11-23); the user then corrects them in DCS.

SHIP COORDINATES: nimitz-deck.py's own fit of the drawing to DCS (x = A*X + BX forward, z = A*Y + BZ to starboard,
metres from the ship's origin), then THE TEXTURE'S FIX (padeyes-fix.json): the deck texture in the drawing sits turned
by about half a degree against DCS's deck (2026-11-24: the user's padeyes set by hand at the port bow wanted 1.3 m to
starboard, while the texture's deck edge at elevators 3 and 4 lies 0.9 m to starboard of DCS's own platforms and at
elevators 1 and 2 within 0.2 m: a turn, not a shift). The fix is a turn and a shift fitted by least squares to the
evidence the file keeps: the user's padeyes ('point': where the drawing's fit put one, where the user set it) and marks
measured in the texture against DCS's models ('z': the correction across the ship at a place, from the outer edge
of each elevator in hangar-map.json; 'dx': the difference of the corrections along the ship at the elevators of
either side, from the painted line round them). The layer itself stays on the texture.

THE FILE FOR DCS (crewtest_padeyes.lua): { n, group, x, z, k }, group an index into `groups`, k 1 for one to
confirm (Under Paint), else 0. The panel draws them as dots on the screen; what the user changes is kept in the user's own
file, not here: each saved entry is { n, g, x, z, x0, z0, state }, state 'seen' (found in the texture), 'confirm'
(under paint, not yet confirmed), 'confirmed' (one of those, confirmed in DCS) or 'added' (made in DCS).
"""
import collections
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SVG = os.path.join(ROOT, 'carrier-ops-handoff-2', 'Nimitz.svg')
OUT = os.path.join(ROOT, 'catcc-dcs', 'Scripts', 'CATCC', 'crewtest_padeyes.lua')
GROUPS = ['Flight Deck', 'El 1', 'El 2', 'El 3', 'El 4']
PAINT = 'Under Paint'
LAYER = '<g inkscape:label="Padeyes"'
DOT_R = 0.25

# nimitz-deck.py's trace and fit, without running its main()
_gen_path = os.path.join(ROOT, 'scripts', 'catcc', 'nimitz-deck.py')
_src = open(_gen_path, encoding='utf-8').read()
_gen = {'__file__': _gen_path, '__name__': 'nimitz_deck'}
exec(compile(_src[:_src.rindex('main()')], _gen_path, 'exec'), _gen)
_gen['SVG'] = SVG


def fit():
    return _gen['fit'](_gen['read_trace']())


# ---------------------------------------------------------------- the texture's own fix (padeyes-fix.json)
FIX = os.path.join(HERE, 'padeyes-fix.json')


def read_fix():
    """theta (rad), tx, tz: the turn and shift that take a padeye from the drawing's fit to where DCS has it"""
    if not os.path.exists(FIX):
        return {'theta': 0.0, 'tx': 0.0, 'tz': 0.0, 'evidence': []}
    return json.load(open(FIX, encoding='utf-8'))


def to_ship(fx, X, Y, A, BX, BZ):
    """a dot of the layer (drawing units) -> ship frame: the drawing's fit, then the texture's fix"""
    x, z = A * X + BX, A * Y + BZ
    c, s = math.cos(fx['theta']), math.sin(fx['theta'])
    return c * x - s * z + fx['tx'], s * x + c * z + fx['tz']


def from_ship(fx, x, z, A, BX, BZ):
    """the inverse of to_ship"""
    c, s = math.cos(fx['theta']), math.sin(fx['theta'])
    x, z = x - fx['tx'], z - fx['tz']
    x, z = c * x + s * z, -s * x + c * z
    return (x - BX) / A, (z - BZ) / A


def solve_fix(evidence):
    """least squares for theta, tx, tz (small angle) over the evidence: each row says what correction a point of the
    drawing's fit (x, z: without any fix) needs, along x ('x'), along z ('z'), or (kind 'dx') the difference of the x
    corrections of two places a z apart"""
    rows, rhs = [], []
    for e in evidence:
        if e['kind'] == 'point':
            rows.append([-e['z'], 1, 0]); rhs.append(e['to'][0] - e['x'])
            rows.append([e['x'], 0, 1]); rhs.append(e['to'][1] - e['z'])
        elif e['kind'] == 'z':
            rows.append([e['x'], 0, 1]); rhs.append(e['corr'])
        elif e['kind'] == 'dx':
            rows.append([-e['dz'], 0, 0]); rhs.append(e['corr'])
    th, tx, tz = _gen['lstsq'](rows, rhs)
    res = [abs(sum(u * v for u, v in zip(r, (th, tx, tz))) - y) for r, y in zip(rows, rhs)]
    return {'theta': th, 'tx': tx, 'tz': tz}, max(res)


def individually_set(entries):
    """the user's padeyes that say where one really is: confirmed, or moved otherwise than the most common move of
    their group (a move of a whole group or of all of them is no evidence)"""
    common = {}
    for g in set(e['g'] for e in entries):
        moves = collections.Counter((round(e['x'] - e['x0'], 3), round(e['z'] - e['z0'], 3)) for e in entries if e['g'] == g)
        common[g] = moves.most_common(1)[0][0]
    out = []
    for e in entries:
        if e['state'] == 'added':
            continue
        mv = (round(e['x'] - e['x0'], 3), round(e['z'] - e['z0'], 3))
        if e['state'] == 'confirmed' or (abs(mv[0] - common[e['g']][0]) > 0.004 or abs(mv[1] - common[e['g']][1]) > 0.004):
            out.append(e)
    return out


def read_user(path):
    out = []
    for line in open(path, encoding='utf-8'):
        m = re.search(r'n = (\d+), g = (\d+), x = (-?[\d.]+), z = (-?[\d.]+), x0 = (-?[\d.]+), z0 = (-?[\d.]+), state = "(\w+)"', line)
        if m:
            out.append({'n': int(m.group(1)), 'g': int(m.group(2)), 'x': float(m.group(3)), 'z': float(m.group(4)),
                        'x0': float(m.group(5)), 'z0': float(m.group(6)), 'state': m.group(7)})
    return out


def layer_span(text):
    """where the Padeyes layer starts and ends in the file (it is written on one line, its groups nested)"""
    a = text.find(LAYER)
    if a < 0:
        return None
    depth = 0
    for m in re.finditer(r'<g[ >]|</g>', text[a:]):
        depth += -1 if m.group(0) == '</g>' else 1
        if depth == 0:
            return a, a + m.end()
    raise SystemExit('the Padeyes layer of %s is not closed' % SVG)


def read_layer(text):
    """the dots of the layer: [(sublayer label, X, Y)] in the drawing's units, in the file's order"""
    span = layer_span(text)
    if not span:
        raise SystemExit('no Padeyes layer in %s' % SVG)
    out, label = [], None
    for m in re.finditer(r'<g\b([^>]*)>|<circle\b([^>]*)/>', text[span[0]:span[1]]):
        if m.group(1) is not None:
            lab = re.search(r'inkscape:label="([^"]*)"', m.group(1))
            if 'transform=' in m.group(1):
                raise SystemExit('a group of the Padeyes layer has a transform: not read (take it out in Inkscape)')
            if lab and lab.group(1) != 'Padeyes':
                label = lab.group(1)
            continue
        a = m.group(2)
        if 'transform=' in a:
            raise SystemExit('a padeye of the layer has a transform: not read')
        cx = float(re.search(r'\bcx="([^"]*)"', a).group(1))
        cy = float(re.search(r'\bcy="([^"]*)"', a).group(1))
        out.append((label, cx, cy))
    return out


def build_lua(dots, A, BX, BZ, fx=None):
    fx = fx or read_fix()
    rows = []
    for j, (label, X, Y) in enumerate(dots):
        if label == PAINT:
            g, k = None, 1
        else:
            g, k = GROUPS.index(label) + 1, 0
        x, z = to_ship(fx, X, Y, A, BX, BZ)
        rows.append([g, x, z, k, j])  # (j: the dot it is, for refit)
    # an Under Paint padeye takes the group of the nearest one seen (the grids of deck and platforms differ)
    seen = [r for r in rows if r[3] == 0]
    for r in rows:
        if r[0] is None:
            r[0] = min(seen, key=lambda s: (s[1] - r[1]) ** 2 + (s[2] - r[2]) ** 2)[0]
    rows.sort(key=lambda r: (r[0], round(r[1], 3), round(r[2], 3)))
    lines = [
        '-- CATCC: the padeyes (tie-down points) of USS Nimitz\'s flight deck, in the ship\'s own frame: x metres forward',
        '-- of its origin, z metres to starboard, on the flight deck. Made by catcc-dcs/deck-test/padeyes/padeyes.py from the',
        '-- "Padeyes" layer of carrier-ops-handoff-2/Nimitz.svg (fit A=%.5f BX=%.3f BZ=%.3f; the texture fix, padeyes-fix.json:' % (A, BX, BZ),
        '-- turned %.5f deg, shifted %.3f m forward, %.3f m to starboard): do not edit by hand.' % (math.degrees(fx['theta']), fx['tx'], fx['tz']),
        '-- Read by crewtest_padeye_tool.lua (the crew test panel\'s "Padeyes" page), which keeps the user\'s own changes in',
        '-- Saved Games\\DCS\\Logs\\catcc-padeyes.lua. Each: { n, group, x, z, k }; k = 1: one to confirm (under paint).',
        'return { groups = { %s }, list = {' % ', '.join("'%s'" % g for g in GROUPS),
    ]
    for i, (g, x, z, k, _) in enumerate(rows, 1):
        lines.append('  { %d, %d, %.3f, %.3f, %d },' % (i, g, x, z, k))
    lines.append('} }')
    return '\n'.join(lines) + '\n', rows


def write_lua():
    text = open(SVG, encoding='utf-8', newline='').read()
    lua, rows = build_lua(read_layer(text), *fit())
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(lua)
    n_conf = sum(1 for r in rows if r[3])
    print('%d padeyes (%d to confirm) written to %s' % (len(rows), n_conf, os.path.relpath(OUT, ROOT)))


def check():
    text = open(SVG, encoding='utf-8', newline='').read()
    lua, rows = build_lua(read_layer(text), *fit())
    have = open(OUT, encoding='utf-8').read().replace('\r\n', '\n') if os.path.exists(OUT) else ''
    if have != lua:
        print('%s is NOT what the Padeyes layer gives now: python -I %s' % (os.path.relpath(OUT, ROOT), os.path.relpath(__file__, ROOT)))
        return 1
    print('%s is current: %d padeyes' % (os.path.relpath(OUT, ROOT), len(rows)))
    return 0


def take(path):
    """the user's padeyes as the hook saved them, into the Padeyes layer (the rest of the file byte for byte)"""
    A, BX, BZ = fit()
    fx = read_fix()
    pts = []
    for line in open(path, encoding='utf-8'):
        m = re.search(r'n = (\d+), g = (\d+), x = (-?[\d.]+), z = (-?[\d.]+).*state = "(\w+)"', line)
        if m:
            pts.append((int(m.group(2)), float(m.group(3)), float(m.group(4)), m.group(5)))
    if not pts:
        raise SystemExit('no padeyes in ' + path)
    groups = {g: [] for g in GROUPS + [PAINT]}
    for g, x, z, state in pts:
        label = PAINT if state == 'confirm' else GROUPS[g - 1]
        groups[label].append(from_ship(fx, x, z, A, BX, BZ))
    text = open(SVG, encoding='utf-8', newline='').read()
    span = layer_span(text)
    if span:
        text = text[:span[0]] + text[span[1]:]
    text = text[:anchor(text)] + layer(groups) + text[anchor(text):]
    with open(SVG, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('%d padeyes from %s taken into the Padeyes layer of %s (%s)' % (len(pts), path, os.path.relpath(SVG, ROOT),
          ', '.join('%s %d' % (k, len(v)) for k, v in groups.items())))
    write_lua()


def user_text(entries):
    """the user's file as the tool writes it (crewtest_padeye_tool.lua P.save)"""
    parts = [
        '-- CATCC padeyes: the flight deck\'s tie-down points as set with the crew test panel\'s "Padeyes" page. Rebased by padeyes.py --fit, %s.\n' % time.strftime('%Y-%m-%d %H:%M:%S'),
        '-- x: metres forward of the ship\'s origin; z: to starboard; x0, z0: where it started. g: its group (groups). state: "seen" (found in\n',
        '-- the deck\'s texture), "confirm" (under paint, not confirmed), "confirmed", "added" (made in DCS). Removed ones are left out.\n',
        '-- Into the deck drawing: python -I catcc-dcs/deck-test/padeyes/padeyes.py --from <this file>\n',
        'return { groups = { %s }, list = {\n' % ', '.join('"%s"' % g for g in GROUPS),
    ]
    for e in entries:
        parts.append('  { n = %d, g = %d, x = %.3f, z = %.3f, x0 = %.3f, z0 = %.3f, state = "%s" },\n'
                     % (e['n'], e['g'], e['x'], e['z'], e['x0'], e['z0'], e['state']))
    parts.append('} }\n')
    return ''.join(parts)


def refit(path):
    """the texture's fix fitted again with the padeyes the user set one by one in DCS (confirmed, or moved on their
    own), together with the evidence padeyes-fix.json has already; then crewtest_padeyes.lua written again, and the
    user's file rebased on it (kept first as <file>.before-fit): each padeye at its new place, except those the user set one
    by one, which stay where they were put, confirmed; moves of whole groups or of all (made for the old fix) dropped;
    removed ones stay removed, added ones stay"""
    A, BX, BZ = fit()
    old = read_fix()
    text = open(SVG, encoding='utf-8', newline='').read()
    dots = read_layer(text)
    old_rows = build_lua(dots, A, BX, BZ, old)[1]
    user = read_user(path)
    if not user:
        raise SystemExit('no padeyes in ' + path)

    def raw_of(x, z):
        X, Y = from_ship(old, x, z, A, BX, BZ)
        return A * X + BX, A * Y + BZ

    # (the user's x0, z0 are the built-in places as the panel's file had them: to the millimetre)
    old_at = {}
    for i, r in enumerate(old_rows):
        old_at[(round(r[1], 3), round(r[2], 3))] = i

    def built_in_at(x, z):
        return old_at.get((round(x, 3), round(z, 3)))

    evidence = list(old.get('evidence', []))
    taken, skipped = 0, 0
    for e in individually_set(user):
        if built_in_at(e['x0'], e['z0']) is None:
            skipped += 1
            continue
        rx, rz = raw_of(e['x0'], e['z0'])
        evidence = [v for v in evidence if not (v['kind'] == 'point' and math.hypot(v['x'] - rx, v['z'] - rz) < 0.01)]
        evidence.append({'kind': 'point', 'x': round(rx, 3), 'z': round(rz, 3), 'to': [e['x'], e['z']], 'from': '%s (%s)' % (os.path.basename(path), time.strftime('%Y-%m-%d'))})
        taken += 1
    if not taken:
        raise SystemExit('%s has no padeye set one by one (confirmed, or moved on its own): nothing to fit' % path)
    fx, worst = solve_fix(evidence)
    fx = {'about': old.get('about', ''), 'theta': fx['theta'], 'tx': fx['tx'], 'tz': fx['tz'], 'evidence': evidence}
    with open(FIX, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(fx, f, indent=1)
        f.write('\n')
    print('the fix from %d padeyes of yours (%d skipped: not from the current drawing) and %d other marks: turned %.4f deg, '
          'shifted %.3f m forward, %.3f m to starboard; the worst mark off by %.3f m'
          % (taken, skipped, len(evidence) - sum(1 for v in evidence if v['kind'] == 'point'), math.degrees(fx['theta']), fx['tx'], fx['tz'], worst))
    write_lua()
    # the user's file, rebased
    new_rows = build_lua(dots, A, BX, BZ, fx)[1]
    new_of = {}  # the dot -> its number in the new file
    for i, r in enumerate(new_rows, 1):
        new_of[r[4]] = i
    own = set(id(e) for e in individually_set(user))
    out, seq = [], len(new_rows)
    for e in user:
        if e['state'] == 'added':
            out.append(dict(e))
            continue
        i = built_in_at(e['x0'], e['z0'])
        if i is None:
            out.append(dict(e))
            continue
        n = new_of[old_rows[i][4]]
        g, x0, z0, k, _ = new_rows[n - 1]
        r = {'n': n, 'g': g, 'x0': x0, 'z0': z0, 'x': x0, 'z': z0, 'state': e['state']}
        if id(e) in own:
            r['x'], r['z'] = e['x'], e['z']
            if r['state'] == 'seen':
                r['state'] = 'confirmed'
        out.append(r)
    for r in out:
        if r['state'] == 'added':
            seq += 1
            r['n'] = seq
    out.sort(key=lambda r: r['n'])
    keep = path + '.before-fit'
    if os.path.exists(keep):
        keep = path + '.before-fit-' + time.strftime('%Y%m%d-%H%M%S')
    os.replace(path, keep)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(user_text(out))
    print('%s rebased: %d padeyes (%d of yours kept where you set them); the old one kept as %s'
          % (path, len(out), len(own), os.path.basename(keep)))


def anchor(text):
    """the layer's place: top level, straight after the texture (Layer 1), before the Flight Deck layer"""
    m = re.search(r'<g\s+inkscape:groupmode="layer"\s+id="layer2"', text)
    if not m:
        raise SystemExit('no Flight Deck layer (id layer2) in %s' % SVG)
    return m.start()


def layer(groups):
    def dots(pts, prefix):
        pts = sorted(pts, key=lambda p: (round(p[1], 1), p[0]))
        return ''.join('<circle id="%s-%d" cx="%.4f" cy="%.4f" r="%s" />' % (prefix, i, x, y, DOT_R) for i, (x, y) in enumerate(pts, 1))
    parts = []
    for label in GROUPS:
        pid = 'padeye-deck' if label == 'Flight Deck' else 'padeye-el' + label[-1]
        parts.append('<g inkscape:label="%s" inkscape:groupmode="layer" id="layer-%s">%s</g>' % (label, pid, dots(groups[label], pid)))
    parts.append('<g inkscape:label="%s" inkscape:groupmode="layer" id="layer-padeye-paint" style="display:none;fill:#ff9900">%s</g>'
                 % (PAINT, dots(groups[PAINT], 'padeye-paint')))
    return ('<g inkscape:label="Padeyes" inkscape:groupmode="layer" id="layer-padeyes" '
            'style="display:inline;fill:#00e5ff;stroke:none">%s</g>' % ''.join(parts))


if __name__ == '__main__':
    if '--svg' in sys.argv:
        SVG = _gen['SVG'] = sys.argv[sys.argv.index('--svg') + 1]
    if '--out' in sys.argv:
        OUT = sys.argv[sys.argv.index('--out') + 1]
    if '--fix' in sys.argv:
        FIX = sys.argv[sys.argv.index('--fix') + 1]
    if '--fit' in sys.argv:
        refit(sys.argv[sys.argv.index('--fit') + 1])
    elif '--from' in sys.argv:
        take(sys.argv[sys.argv.index('--from') + 1])
    elif '--check' in sys.argv:
        sys.exit(check())
    else:
        write_lua()
