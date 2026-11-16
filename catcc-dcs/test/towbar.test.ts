// The models of our own (catcc-dcs/deck-test/crew-test/model): our .edm writer, the tow bar and the axle finder's markers.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = (p: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), p);
const MODEL = here('../deck-test/crew-test/model');
const MOD = here('../deck-test/crew-test/Mods/tech/CATCC-Crew');
const DCS = 'C:\\Program Files\\Eagle Dynamics\\DCS World';
const py = (args: string[]) => execFileSync('python', ['-I', ...args], { encoding: 'utf8' });
// (a model is named as its static type is, as the chock's and the route lines' are)
const FILES = ['Shapes/CATCC_Towbar.edm', 'Shapes/CATCC_AxleProbe.edm', 'Shapes/textures/catcc_towbar_diff.dds', 'Shapes/textures/catcc_towbar_nm.dds',
  'Shapes/textures/catcc_towbar_diff_roughmet.dds'];

describe('the tow bar model and the axle markers', () => {
  it('the models and textures in the mod are what towbar.py makes now (else: python -I model/towbar.py)', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-towbar-'));
    const said = py([path.join(MODEL, 'towbar.py'), out]);
    // the 15 ft ALBAR 15: 180 in (4.572 m) from the ring's outer edge to the tow hooks' tips, its arms 4.2 in square (the
    // first build was the 9 ft bar: in DCS it reached nowhere near the nose and looked thin); closed, the axle pins' tips
    // are 3 cm apart; wide open (argument 0.5) the tips are 0.74 m apart (an F/A-18C's nose tyres are 0.58 m over all)
    expect(said).toMatch(/^tow bar: \d+ vertices, \d+ triangles in 24 parts; closed it is 4\.572 m long \(-0\.081 to 4\.491\), 0\.489 wide, 0\.265 high; its arms 0\.106 m square/);
    expect(said).toMatch(/argument 10: 0 closed \(pin tips 0\.033 m apart\), 0\.5 open by 5\.25 degrees an arm \(0\.740 m apart\), 0\.5 to 1 closing again with the chain taut/);
    for (const f of FILES) expect(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(MOD, f))), f).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('the tow bar reads back as a version 10 file: one material, the ring head still, an arm on each pivot, twenty-one chain links, all on argument 10', () => {
    const dump = py([path.join(MODEL, 'edm.py'), path.join(MOD, 'Shapes/CATCC_Towbar.edm')]);
    expect(dump).toContain("root 'Scene Root' v0 props [('__VERSION__', 3)]");
    expect(dump).toMatch(/'MATERIAL_NAME': 'def_material'/);
    expect(dump).toContain("(0, 'catcc_towbar_diff', -1, [2, 2, 10, 6]), (1, 'catcc_towbar_nm', -1, [2, 2, 10, 6]), (2, 'catcc_towbar_diff_roughmet', -1, [2, 2, 10, 6])");
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'ring_head' material 0 parents \[\(0, -1\)\] vtx \d+ x 15 idx type 1/);
    // (the bounding box takes in the arms wide open, their wheels 0.57 m either side)
    expect(dump).toMatch(/bbox \['-0\.081', '-0\.\d+', '-0\.5\d\d', '4\.491', '0\.\d+', '0\.5\d\d'\]/);
    // the arms open and close: each whole arm turns about its pivot at the ring head (an ArgRotationNode), its render node under it
    expect(dump).toContain("node 1 model::ArgRotationNode 'arm_left' parent 0 pos [] rot [10] scale 0");
    expect(dump).toContain("node 2 model::ArgRotationNode 'arm_right' parent 0 pos [] rot [10] scale 0");
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'arm_left' material 0 parents \[\(1, -1\)\]/);
    expect(dump).toMatch(/RENDER_NODES model::RenderNode 'arm_right' material 0 parents \[\(2, -1\)\]/);
    // the tensioning chain: every link moved and turned by the same argument (an ArgAnimationNode each)
    for (const i of [0, 10, 20]) {
      const n = String(i).padStart(2, '0');
      expect(dump).toContain(`node ${3 + i} model::ArgAnimationNode 'link_${n}' parent 0 pos [10] rot [10] scale 0`);
      expect(dump).toMatch(new RegExp(`RENDER_NODES model::RenderNode 'link_${n}' material 0 parents \\[\\(${3 + i}, -1\\)\\]`));
    }
    expect(dump).not.toContain("'link_21'");
    expect(dump).toContain('round trip: IDENTICAL');
  });

  it("the axle finder's markers: one Blender-made model for every centimetre of height from 0.15 to 0.40 m (build_axle_marker.py, as the chock was made)", () => {
    const names = fs.readdirSync(path.join(MOD, 'Shapes')).filter((f) => f.startsWith('CATCC_AxleMarker_')).sort();
    expect(names).toEqual(Array.from({ length: 26 }, (_, i) => `CATCC_AxleMarker_H${15 + i}.edm`));
    for (const f of names) {
      const data = fs.readFileSync(path.join(MOD, 'Shapes', f));
      expect(data.subarray(0, 3).toString('latin1'), f).toBe('EDM');
      expect(data.length, f).toBeGreaterThan(10000);
    }
    // each its own height: no two files the same
    expect(new Set(names.map((f) => fs.readFileSync(path.join(MOD, 'Shapes', f)).toString('base64'))).size).toBe(26);
  });

  it('the probe: a rod with a flag on argument 1, written by our own writer (the test of whether DCS makes a static from such a model)', () => {
    const rod = py([path.join(MODEL, 'edm.py'), path.join(MOD, 'Shapes/CATCC_AxleProbe.edm')]);
    expect(rod).toMatch(/RENDER_NODES model::RenderNode 'axle_marker' material 0 parents \[\(0, -1\)\]/);
    expect(rod).toContain("node 1 model::ArgRotationNode 'flag' parent 0 pos [] rot [1] scale 0");
    expect(rod).toMatch(/RENDER_NODES model::RenderNode 'flag' material 0 parents \[\(1, -1\)\]/);
    // (the rod is 0.9 m long along z: the axle's line)
    expect(rod).toMatch(/bbox \['-0\.160', '-0\.070', '-0\.450', '0\.160', '0\.160', '0\.450'\]/);
    expect(rod).toContain('round trip: IDENTICAL');
  });

  it.skipIf(!fs.existsSync(DCS))("the reader and writer give DCS's own models back byte for byte", () => {
    const shapes = path.join(DCS, 'CoreMods/tech/USS_Nimitz/Shapes');
    const dump = py([path.join(MODEL, 'edm.py'), path.join(shapes, 'Holdback_Bar.EDM'), path.join(shapes, 'Light_Stick.EDM'), path.join(shapes, 'Catapult_Runner.EDM')]);
    expect(dump.match(/round trip: IDENTICAL/g)?.length).toBe(3);
  });
});
