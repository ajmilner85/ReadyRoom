"""The flight deck's padeyes as DCS's own carrier model has them, for the crew test panel.

    python -I vodostoki.py                 writes Scripts/CATCC/crewtest_padeyes_model.lua from the model
    python -I vodostoki.py --check         says whether that file is what the model gives now (exit 1 if not;
                                           exit 0 and says so if DCS's model is not on this machine)
    (--edm <file> and --out <file> read and write other files than these)

FOUND 2026-11-25 (catcc-handoff/DECISIONS.md): the padeyes are in none of the deck's textures. They are meshes of
the close-up model (CoreMods/tech/USS_Nimitz/Shapes/Nimitz_CVN_71_LOD_0.EDM, drawn within 300 m; the same in all
five hulls), material "Vodostok": flat squares 0.317 m across, 5 mm over their deck, each showing one picture of
Nimitz_Vodostok_Base.dds (512 x 256: four across, two down; six star padeyes, two round grates):
  Vodostoki            5360: 4193 on the flight deck (20.154 m), 1168 on the HANGAR deck (8.71 m: the "dark 2"
                       picture; drawn at the flight deck's height by the panel, they looked like a second, wider
                       grid over the true one mid-ship, the user's report of 2026-11-25)
  Vodost_Hole_79..82   231: 227 on the flight deck, 4 on the hangar deck; each mesh under a visibility node
                       (hidden, it seems, where the deck is shown damaged). The user had filled 226 of them by hand
                       as "holes" before they were found here
  Vodost_Evelat_1..4   89, 89, 88, 88: the elevators' platforms ("Evelat"), on the elevators' own bones
                       (Dum_Elevator_N): read with the platforms up; the round grate picture
The user's padeyes placed by hand lie on them (median 3 mm).

THE FILE (crewtest_padeyes_model.lua), THE AUTHORITATIVE MAP OF THE PADEYES from 2026-11-25: `list` { n, group, x,
z, style, mesh } in the ship's frame (x metres forward of its origin, z to starboard): the flight deck's and the
platforms' (4773), and two placed by hand (HAND); group as crewtest_padeyes.lua's
(1 the flight deck, 2..5 elevators 1..4: by the mesh), style an index into `styles`, mesh into `meshes`. `hangar`
{ n, x, z, style }: the hangar deck's (8.71 m), not drawn. The panel draws `list` cyan ("Model") and, with the
user's own, green ("Combined").

READING THE MODEL: catcc-dcs/deck-test/crew-test/model/edm.py, which does not know DCS's fake light nodes
(AnimatedFakeSpotLightsNode, FakeOmniLightsNode) among the render nodes: each is stepped over by going on to the
next place a render node reads whole. Each mesh's place: the transforms of the nodes above it
(deck-test/hangar/hangar_map.py's world_matrices: every animation at its argument's zero).
"""
import importlib.util
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
EDM = os.path.join(os.environ.get('DCS_INSTALL', r'C:\Program Files\Eagle Dynamics\DCS World'),
                   'CoreMods', 'tech', 'USS_Nimitz', 'Shapes', 'Nimitz_CVN_71_LOD_0.EDM')
OUT = os.path.join(ROOT, 'catcc-dcs', 'Scripts', 'CATCC', 'crewtest_padeyes_model.lua')
GROUPS = ['Flight Deck', 'El 1', 'El 2', 'El 3', 'El 4']
# the texture's cells: (column 1..4, row 1..2) -> name
STYLES = {(1, 1): 'dark', (3, 1): 'dark 2', (2, 1): 'grey', (4, 1): 'grey 2', (2, 2): 'grey dirty', (1, 2): 'yellow',
          (3, 2): 'grate', (4, 2): 'grate worn'}
STYLE_ORDER = ['dark', 'dark 2', 'grey', 'grey 2', 'grey dirty', 'yellow', 'grate', 'grate worn']
MESHES = ['Vodostoki', 'Vodost_Hole_79', 'Vodost_Hole_80', 'Vodost_Hole_81', 'Vodost_Hole_82',
          'Vodost_Evelat_1', 'Vodost_Evelat_2', 'Vodost_Evelat_3', 'Vodost_Evelat_4']
# THE AUTHORITATIVE MAP (the user, 2026-11-25, of the panel's "Combined" view, the model's and the user's own: "The
# combined view was perfect. I could not find any missing padeyes with it enabled. We can consider this the
# authoritative map of padeyes going forward"): the model's, and these, placed by hand in DCS where the model has
# none (Logs/catcc-padeyes.lua of 2026-11-25, its padeyes 5122 and 5123): x, z, style (dark)
HAND = [(149.901, 0.004, 1), (152.248, -1.633, 1)]
FLIGHT_DECK_OVER = 15.0  # metres over the ship's origin: above, the flight deck (20.15); below, the hangar's (8.71)

_spec = importlib.util.spec_from_file_location('hangar_map', os.path.join(ROOT, 'catcc-dcs', 'deck-test', 'hangar', 'hangar_map.py'))
hm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hm)
edm = hm.edm


def read_meshes(path):
    """the padeye meshes' vertices in the ship's frame: {name: [(x, y, z, u, v)]}, four a square"""
    data = open(path, 'rb').read()
    r = edm.R(data)
    if r.take(3) != b'EDM':
        raise SystemExit('not an EDM file: ' + path)
    r.take(2)
    table = r.take(r.u32())
    r.strings = [x.decode('cp1251') for x in table.split(b'\0')]
    [(r.s(), r.u32()) for _ in range(r.u32())]
    [(r.s(), r.u32()) for _ in range(r.u32())]
    edm._node(r, r.s())
    nodes = [edm._node(r, r.s()) for _ in range(r.u32())]
    parents = [r.i32() for _ in range(len(nodes))]
    known = set(i for i, s in enumerate(r.strings) if s in ('model::RenderNode', 'model::SkinNode', 'model::ShellNode'))
    found = {}
    for _ in range(r.u32()):
        kind, cnt = r.s(), r.u32()
        if kind != 'RENDER_NODES':
            for _ in range(cnt):
                edm._node(r, r.s())
            continue
        i = 0
        while i < cnt and len(found) < len(MESHES):
            start = r.o
            try:
                n = edm._node(r, r.s())
            except Exception:
                n = None
                o = start + 4
                while o < len(data) - 4:
                    if struct.unpack_from('<I', data, o)[0] in known:
                        r.o = o
                        try:
                            n = edm._node(r, r.s())
                            if 0 < n['vtx']['count'] < 10000000 and n['vtx']['stride'] < 64:
                                break
                        except Exception:
                            pass
                        n = None
                    o += 1
                if n is None:
                    break
            i += 1
            if n.get('name') in MESHES:
                found[n['name']] = n
        break
    missing = [m for m in MESHES if m not in found]
    if missing:
        raise SystemExit('not in %s: %s' % (path, ', '.join(missing)))
    mats, _ = hm.world_matrices({'nodes': nodes, 'parents': parents})
    out = {}
    for name, n in found.items():
        if n['type'] != 'model::RenderNode':
            raise SystemExit('%s is not a render node any more: look again' % name)
        m = mats[n['parents'][0][0]]
        v = n['vtx']
        st = v['stride']
        fl = struct.unpack('<%df' % (v['count'] * st), v['data'])
        pts = []
        for k in range(v['count']):
            x, y, z = fl[k * st], fl[k * st + 1], fl[k * st + 2]
            pts.append((m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3], m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
                        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3], fl[k * st + st - 2], fl[k * st + st - 1]))
        out[name] = pts
    return out


def padeyes(meshes):
    """each square: (group, x, z, style, mesh) on the flight deck or a platform, and (x, z, style) on the hangar deck"""
    deck, hangar = [], []
    for name in MESHES:
        verts = meshes[name]
        if len(verts) % 4:
            raise SystemExit('%s is not squares of four vertices' % name)
        group = int(name[-1]) + 1 if name.startswith('Vodost_Evelat_') else 1
        for k in range(0, len(verts), 4):
            q = verts[k:k + 4]
            x = sum(p[0] for p in q) / 4
            y = sum(p[1] for p in q) / 4
            z = sum(p[2] for p in q) / 4
            u = min(p[3] for p in q) % 1
            vv = min(p[4] for p in q)
            style = STYLE_ORDER.index(STYLES[(int(u * 4 + 1e-6) + 1, 1 if vv < 0.5 else 2)]) + 1
            if y > FLIGHT_DECK_OVER:
                deck.append((group, round(x, 3), round(z, 3), style, MESHES.index(name) + 1))
            else:
                hangar.append((round(x, 3), round(z, 3), style))
    for x, z, style in HAND:
        deck.append((1, x, z, style, len(MESHES) + 1))
    deck.sort()
    hangar.sort()
    return deck, hangar


def lua(deck, hangar):
    q = lambda xs: ', '.join("'%s'" % s for s in xs)
    lines = [
        '-- CATCC: the padeyes (tie-down points) of USS Nimitz as DCS\'s own model has them: the "Vodostok" meshes of',
        '-- Nimitz_CVN_71_LOD_0.EDM (Vodostoki, Vodost_Hole_79..82, Vodost_Evelat_1..4). Made by catcc-dcs/deck-test/padeyes/',
        '-- vodostoki.py: do not edit by hand. THE AUTHORITATIVE MAP OF THE PADEYES (with two placed by hand). Ship\'s frame: x metres forward of its origin, z to starboard. list: the flight',
        '-- deck\'s and the elevators\' platforms\', { n, group, x, z, style, mesh }; hangar: the hangar deck\'s, { n, x, z, style }.',
        'return { groups = { %s }, styles = { %s }, meshes = { %s }, list = {' % (q(GROUPS), q(STYLE_ORDER), q(MESHES + ['by hand'])),
    ]
    for i, (g, x, z, s, m) in enumerate(deck, 1):
        lines.append('  { %d, %d, %.3f, %.3f, %d, %d },' % (i, g, x, z, s, m))
    lines.append('}, hangar = {')
    for i, (x, z, s) in enumerate(hangar, 1):
        lines.append('  { %d, %.3f, %.3f, %d },' % (i, x, z, s))
    lines.append('} }')
    return '\n'.join(lines) + '\n'


def main():
    global EDM, OUT
    if '--edm' in sys.argv:
        EDM = sys.argv[sys.argv.index('--edm') + 1]
    if '--out' in sys.argv:
        OUT = sys.argv[sys.argv.index('--out') + 1]
    if '--check' in sys.argv and not os.path.exists(EDM):
        print('DCS\'s carrier model is not on this machine (%s): not checked' % EDM)
        return 0
    deck, hangar = padeyes(read_meshes(EDM))
    text = lua(deck, hangar)
    rel = os.path.relpath(OUT, ROOT)
    if '--check' in sys.argv:
        have = open(OUT, encoding='utf-8').read().replace('\r\n', '\n') if os.path.exists(OUT) else ''
        if have != text:
            print('%s is NOT what the model gives now: python -I %s' % (rel, os.path.relpath(__file__, ROOT)))
            return 1
        print('%s is current: %d padeyes (and %d on the hangar deck)' % (rel, len(deck), len(hangar)))
        return 0
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    by = {}
    for g, x, z, s, m in deck:
        by[GROUPS[g - 1]] = by.get(GROUPS[g - 1], 0) + 1
    print('%d padeyes written to %s (%s), and %d on the hangar deck' % (len(deck), rel, ', '.join('%s %d' % kv for kv in by.items()), len(hangar)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
