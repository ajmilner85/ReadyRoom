// The Navy's TD-1A aircraft tiedown (catcc-dcs/deck-test/crew-test/model/tiedown.py): a model of our own .edm writer with
// its length on model argument 10 and its rise from the deck on 11, and its textures. The model as written to the mod is
// read back and its node tree evaluated at many settings: what DCS would draw, by the keys and ranges in the file.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = (p: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), p);
const MODEL = here('../deck-test/crew-test/model');
const MOD = here('../deck-test/crew-test/Mods/tech/CATCC-Crew');
const EDM = path.join(MOD, 'Shapes/CATCC_Tiedown.edm');
const py = (args: string[]) => execFileSync('python', ['-I', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const FILES = ['Shapes/CATCC_Tiedown.edm', 'Shapes/textures/catcc_tiedown_diff.dds', 'Shapes/textures/catcc_tiedown_nm.dds',
  'Shapes/textures/catcc_tiedown_diff_roughmet.dds'];

// (python: the written file read back; every shown render node's matrix and vertices in the model's frame at L and deg)
const READ = `import sys, json, math, struct; sys.path.insert(0, ${JSON.stringify(MODEL)}); import edm, tiedown as td
f = edm.read(open(${JSON.stringify(EDM)}, 'rb').read())
nodes, parents = f['nodes'][1:], f['parents'][1:]
rn = f['items'][0][1]
def pose(L, deg, colour=0.0):
    mats, shown = td.evaluate(nodes, parents, {td.LEN_ARG: td.len_arg(L), td.ELEV_ARG: td.elev_arg(deg), td.COLOUR_ARG: colour})
    out = {}
    for n in rn:
        k = n['parents'][0][0]
        if not shown[k]:
            continue
        fl = struct.unpack('<%df' % (n['vtx']['count'] * 15), n['vtx']['data'])
        out[n['name']] = (mats[k], [td.apply(mats[k], fl[i * 15:i * 15 + 3]) for i in range(n['vtx']['count'])])
    return out
`;

describe('the tiedown model', () => {
  it('the model and textures in the mod are what tiedown.py makes now (else: python -I model/tiedown.py)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-tiedown-'));
    const said = py([path.join(MODEL, 'tiedown.py'), out]);
    expect(said).toMatch(/^tiedown: 29 parts on 36 nodes; tensioner, hooks and links 0 and 1: \d+ triangles; a link 48; chain 124 links, 2\.728 m, pitch 0\.022, wire 0\.0072\r?\n/);
    // light: the tensioner and hooks under 1,500 triangles; every setting the same, in at most 15 pieces
    expect(Number(/links 0 and 1: (\d+) triangles/.exec(said)![1])).toBeLessThan(1500);
    const drawn = /drawn: (\d+) to (\d+) triangles in (\d+) to (\d+) parts/.exec(said)!.slice(1).map(Number);
    expect(drawn[1]).toBeLessThan(7500);
    expect(drawn[3]).toBeLessThanOrEqual(15);
    expect(said).toContain('argument 10: length / 4 m, from 0.512 to 3.240 m (padeye to fitting); the body moves 0 to 0.044 m along the bar, the chain seated every 2 links');
    expect(said).toContain('argument 11: rise / 90 degrees; chain lock 0.381 to 0.425 m from the fitting');
    expect(said).toContain("argument 12: the tensioner's finish: 0 yellow, 0.1 red, 0.2 bare");
    for (const f of FILES) expect(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(MOD, f))), f).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  }, 180000);

  it('reads back as a version 10 file: one material with the three textures; the tilt, the taut chain in six pieces, the tensioner and the spare chain in loops on their arguments', () => {
    const dump = py([path.join(MODEL, 'edm.py'), EDM]);
    expect(dump).toContain("root 'Scene Root' v0 props [('__VERSION__', 3)]");
    expect(dump).toMatch(/'MATERIAL_NAME': 'def_material', 'NAME': 'catcc_tiedown'/);
    expect(dump).toContain("(0, 'catcc_tiedown_diff', -1, [2, 2, 10, 6]), (1, 'catcc_tiedown_nm', -1, [2, 2, 10, 6]), (2, 'catcc_tiedown_diff_roughmet', -1, [2, 2, 10, 6])");
    expect(dump).toContain("('normalMapValue', 1.0)");
    expect(dump).toContain("node 1 model::ArgRotationNode 'tilt' parent 0 pos [] rot [11] scale 0");
    expect(dump.match(/model::ArgVisibilityNode 'chain_\d' parent 1 vis \[\(10, /g)?.length).toBe(6);
    expect(dump.match(/model::ArgPositionNode 'chain_\d_place' parent \d+ pos \[10\]/g)?.length).toBe(6);
    expect(dump).toMatch(/node (\d+) model::ArgPositionNode 'tensioner' parent 1 pos \[10\]/);
    expect(dump).toMatch(/model::ArgPositionNode 'tensioner_body' parent \d+ pos \[10\]/);
    expect(dump).toMatch(/model::ArgRotationNode 'spare' parent \d+ pos \[\] rot \[11\]/);
    expect(dump.match(/model::ArgVisibilityNode 'loop_\d' /g)?.length).toBe(5);
    expect(dump.match(/model::ArgVisibilityNode 'loop_short_\d\d' /g)?.length).toBe(11);
    expect(dump).toMatch(/model::ArgVisibilityNode 'wrap' parent \d+ vis \[\(10, /);
    expect(dump.match(/model::ArgVisibilityNode 'paint_(yellow|red|bare)' parent \d+ vis \[\(12, /g)?.length).toBe(3);
    expect(dump).toContain('round trip: IDENTICAL');
  });

  it('at every setting: the tensioner is the length away along the rise; its pocket holds the link the length puts there; every link is drawn once, taut or in a loop; the loops hang clear of the deck when the pocket is high enough', () => {
    const res = JSON.parse(py(['-c', `${READ}
res = []
for L in [0.3, td.L_MIN, 0.5, 0.75, 1.0, 1.2345, 1.5, 1.8, 2.1, 2.5, 2.9, 3.15, td.L_MAX, 3.5]:
    for deg in [0, 8, 20, 35, 50, 65, 80, 90]:
        p = pose(L, deg)
        Lc = min(td.L_MAX, max(td.L_MIN, L))
        k, n, delta, spare = td.setting(Lc)
        e = math.radians(deg)
        hook = td.apply(p['tensioner'][0], (0.0, 0.0, 0.0))
        seat = td.apply(p['padeye_hook'][0], (td.X0 + n * td.P, 0.0, 0.0))     # link n's centre
        pocket = td.apply(p['tensioner_body'][0], td.to_model((td.POCKET[0], td.POCKET[1], 0.0)))
        taut = 2 + sum(2 ** (int(name[6]) + 1) for name in p if name.startswith('chain_'))
        loops = [name for name in p if name.startswith('loop_')]
        looped = sum(td.LOOP_N if name[5] != 's' else int(name[-2:]) for name in loops) + (td.WRAP if 'wrap' in p else 0)
        low = min([v[1] for name in loops for v in p[name][1]] + [9.0])
        res.append({'L': L, 'deg': deg, 'hook': [hook[0] - Lc * math.cos(e), hook[1] - Lc * math.sin(e), hook[2]],
                    'seat': math.dist(seat, pocket), 'n': n, 'taut': taut, 'spare': spare, 'looped': looped, 'parts': len(p),
                    'low': low, 'pocketY': pocket[1]})
print(json.dumps(res))`]));
    for (const r of res) {
      const at = `L ${r.L} at ${r.deg} degrees`;
      // the tensioner hook's bend (the fitting) is L from the padeye along the rise
      for (const d of r.hook) expect(Math.abs(d), at).toBeLessThan(1e-4);
      // the chain lock holds link n: on that link's centre, to within what the body's slide along the bar moves it off the
      // chain's line (the body hangs 10.7 degrees off it from the bar's eyelet: up to 0.044 m x sin 10.7 degrees)
      expect(r.seat, at).toBeLessThan(0.009);
      // links 0 .. n are taut, the rest go round the jaw's end and hang in loops: all 124 drawn, none twice
      expect(r.taut, at).toBe(r.n + 1);
      expect(r.looped, at).toBe(r.spare);
      expect(r.taut + r.looped, at).toBe(124);
      expect(r.parts, at).toBeLessThanOrEqual(15);
      if (r.pocketY > 0.36) expect(r.low, at).toBeGreaterThan(0.0);
    }
  }, 120000);

  it('argument 12 picks the finish: yellow at 0, red at 0.1, bare metal at 0.2, one set of painted parts drawn at any value', () => {
    const got = JSON.parse(py(['-c', `${READ}
print(json.dumps([[c, sorted(n for n in pose(1.5, 40, c) if n.startswith('paint_'))] for c in [-1, 0, 0.04, 0.06, 0.1, 0.14, 0.16, 0.2, 0.6, 1]]))`]));
    expect(got).toEqual([[-1, ['paint_yellow']], [0, ['paint_yellow']], [0.04, ['paint_yellow']], [0.06, ['paint_red']], [0.1, ['paint_red']], [0.14, ['paint_red']],
      [0.16, ['paint_bare']], [0.2, ['paint_bare']], [0.6, ['paint_bare']], [1, ['paint_bare']]]);
  });

  it('the textures: BC1 colours and roughmet, a BC5 normal map, 1024 square with all their mipmaps', () => {
    for (const [f, four, size] of [['catcc_tiedown_diff', 'DXT1', 699192], ['catcc_tiedown_nm', 'BC5U', 1398256], ['catcc_tiedown_diff_roughmet', 'DXT1', 699192]] as const) {
      const d = fs.readFileSync(path.join(MOD, 'Shapes/textures', `${f}.dds`));
      expect(d.subarray(0, 4).toString('latin1'), f).toBe('DDS ');
      expect([d.readUInt32LE(12), d.readUInt32LE(16), d.readUInt32LE(28)], f).toEqual([1024, 1024, 11]);
      expect(d.subarray(84, 88).toString('latin1'), f).toBe(four);
      expect(d.length, f).toBe(size);
    }
  });

  it("the normal map is DCS's way round (green DOWN the texture): a cheek's rounded edges read as falling away", () => {
    // a cheek across its middle (the drawing's x 215, clear of the cast words): its top edge (top of the texture) rounds
    // away upwards, so the surface rises going down from it: green below the middle; its bottom edge the other way:
    // green above it; the sunk face between its rims is flat
    const v = JSON.parse(py(['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(MODEL)}); import tiedown as td
col, nx, ny, ao, ro, me = td.atlas()
r = td.R['plate_m:yellow']
u = td.uv_px(215, 0)[0]
n = len(td.BODY)
vs = []
for i in range(n):
    (ua, va), (ub, vb) = td.BODY[i], td.BODY[(i + 1) % n]
    if min(ua, ub) <= u <= max(ua, ub) and ua != ub:
        vs.append(va + (vb - va) * (u - ua) / (ub - ua))
a = (td.U_HI - u) * 1000
bt, bb = (td.V_HI - max(vs)) * 1000, (td.V_HI - min(vs)) * 1000
px = lambda a, b: int(r.y0 + b * r.db) * td.W + int(r.x0 + a * r.da)
print(json.dumps({'top': ny[px(a, bt + 0.7)], 'bottom': ny[px(a, bb - 0.7)], 'flat': [nx[px(a, (bt + bb) / 2)], ny[px(a, (bt + bb) / 2)]]}))`]));
    expect(v.top).toBeLessThan(110);
    expect(v.bottom).toBeGreaterThan(146);
    expect(v.flat.every((x: number) => Math.abs(x - 128) <= 3)).toBe(true);
  }, 120000);
});
