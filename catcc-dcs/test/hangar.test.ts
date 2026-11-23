import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The hangar deck as catcc-dcs/deck-test/hangar/hangar_map.py reads it out of DCS's own models (the collision shells,
// the drawn hangar): what the map says, held against what is known from DCS itself.
const here = (p: string) => path.join(__dirname, p);
const map = JSON.parse(fs.readFileSync(here('../deck-test/hangar/hangar-map.json'), 'utf8'));
const hook = fs.readFileSync(here('../Scripts/CATCC/crewtest_hook.lua'), 'utf8');

type V = [number, number];
const area = (lp: V[]) => Math.abs(lp.reduce((t, p, i) => t + p[0] * lp[(i + 1) % lp.length][1] - lp[(i + 1) % lp.length][0] * p[1], 0)) / 2;

describe('the hangar deck, from the models', () => {
  it("the floor: 8.71 m above the ship's origin (the player's jet stood 10.5 m up down there: 1.826 m above its wheels), under a roof 7.9 m higher", () => {
    expect(map.floor_y).toBeCloseTo(8.711, 2);
    // (the hook's tow takes a jet's own position as 1.826 m above the deck it stands on, and "the hangar deck" as below 14 m)
    expect(hook).toContain('gearUp = 1.826, hangarBelow = 14');
    expect(map.floor_y + 1.826).toBeLessThan(14);
    expect(map.floor_y + 1.826).toBeCloseTo(10.54, 1);
    expect(map.roof_y - map.floor_y).toBeGreaterThan(7.5);
    expect(map.roof_y).toBeLessThan(20.15); // (the flight deck)
  });

  it("the physics' floor: the hangar's own shell, 180 m by 34.7 m, and a sill in each of the four elevator doorways", () => {
    const loops: V[][] = map.floor;
    expect(loops.length).toBe(5);
    expect(map.floor_shells).toEqual(['Col_Hangar', 'BACK_L', 'BACK_R', 'CENTER_R_01', 'CENTER_R_02']);
    const main = loops[0];
    const xs = main.map((p) => p[0]);
    const zs = main.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-127.1, 1);
    expect(Math.max(...xs)).toBeCloseTo(53.28, 1);
    expect(Math.min(...zs)).toBeCloseTo(-17.85, 1);
    expect(Math.max(...zs)).toBeCloseTo(16.81, 1);
    expect(area(main)).toBeGreaterThan(6100);
    expect(area(main)).toBeLessThan(6300);
    // each sill reaches from the shell's edge out to the elevator's platform, at that elevator
    for (const e of map.elevators) {
      const sill = loops.slice(1).find((lp) => {
        const cx = lp.reduce((t, p) => t + p[0], 0) / lp.length;
        const cz = lp.reduce((t, p) => t + p[1], 0) / lp.length;
        return cx > e.x[0] && cx < e.x[1] && Math.sign(cz) === Math.sign(e.z[0] + e.z[1]);
      });
      expect(sill, `a sill at elevator ${e.elevator}`).toBeTruthy();
      const out = Math.max(...sill!.map((p) => Math.abs(p[1])));
      const inner = Math.min(Math.abs(e.z[0]), Math.abs(e.z[1]));
      expect(Math.abs(out - inner)).toBeLessThan(1.2);
    }
    expect(map.floor_area_m2).toBeCloseTo(loops.reduce((t, lp) => t + area(lp), 0), 0);
  });

  it('the elevators are where the hook has them, their tops at the flight deck when up and at the hangar floor when lowered', () => {
    const boxes = [...hook.match(/local ELEV_BOX = \{(.*)\}\n/)![1].matchAll(/\{ (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+) \}/g)].map((m) => m.slice(1).map(Number));
    expect(boxes.length).toBe(4);
    expect(map.elevators.map((e: { elevator: number }) => e.elevator)).toEqual([1, 2, 3, 4]);
    map.elevators.forEach((e: { x: V; z: V; top_up: number; top_down: number; travel: number; argument: number }, i: number) => {
      const [x0, x1, z0, z1] = boxes[i];
      // (the model's platform lies within the hook's box, to within 1.5 m)
      expect(e.x[0]).toBeGreaterThan(x0 - 1.5);
      expect(e.x[1]).toBeLessThan(x1 + 1.5);
      expect(e.z[0]).toBeGreaterThan(z0 - 1.5);
      expect(e.z[1]).toBeLessThan(z1 + 1.5);
      expect(e.top_up).toBeCloseTo(20.15, 0);
      expect(e.top_down - map.floor_y).toBeLessThan(0.15);
      expect(e.top_down - map.floor_y).toBeGreaterThan(0);
      expect(e.travel).toBeCloseTo(11.43, 1);
      expect(e.argument).toBe(57 + i);
    });
  });

  it('the grid: 20 cm cells over the whole hangar; nearly all of the physics floor is free up to 4.8 m; the drawn floor is wider and longer', () => {
    const g = map.grid;
    expect(g.cell).toBeCloseTo(0.2, 5);
    expect(g.rows.length).toBe(450);
    expect(g.columns).toBe(1200);
    const count: Record<string, number> = {};
    for (const row of g.rows as string[]) for (const ch of row) count[ch] = (count[ch] || 0) + 1;
    const m2 = (ch: string) => (count[ch] || 0) * g.cell * g.cell;
    expect(Object.keys(count).sort()).toEqual([' ', ',', '.', 'h', 'l', 'm'].sort());
    expect(m2('.')).toBeGreaterThan(6200);
    expect(m2('.')).toBeLessThan(6500);
    expect(m2(',')).toBeGreaterThan(1300);
    expect(m2('h')).toBeGreaterThan(400);
    // a cell in the middle of the hangar is free physics floor; one outside the hull is nothing
    const at = (x: number, z: number) => (g.rows[Math.floor((z - g.z0) / g.cell)] as string)[Math.floor((x - g.x0) / g.cell)] ?? ' ';
    expect(at(0, 0)).toBe('.');
    expect(at(-60, 5)).toBe('.');
    expect(at(60, 0)).toBe(','); // forward of the physics' floor, still drawn
    expect(at(0, 19)).not.toBe('.'); // the strip along the starboard wall: drawn, not the physics'
    expect(at(0, 30)).toBe(' ');
    expect(map.drawn_floor_area_m2).toBeGreaterThan(map.floor_area_m2 + 1500);
  });

  it('the deck drawing (Nimitz.svg) has the hangar as a layer of its own; the user has since drawn his hangar spotting plan on it (29 aircraft) and rearranged the layers', () => {
    const svg = fs.readFileSync(here('../../carrier-ops-handoff-2/Nimitz.svg'), 'utf8');
    // (the drawing has been saved by the user's editor since: a tag's attributes come in any order, over several lines)
    const tags = [...svg.matchAll(/<g\b[^>]*>/g)].map((m) => m[0]);
    const attr = (t: string, k: string) => (new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(t) ?? [])[1];
    const hangar = tags.find((t) => attr(t, 'id') === 'layer-hangar-deck');
    expect(hangar).toBeDefined();
    expect(attr(hangar as string, 'inkscape:label')).toBe('Hangar Deck');
    const labels = tags.map((t) => attr(t, 'inkscape:label')).filter((l): l is string => !!l).map((l) => l.replace(/&amp;/g, '&'));
    for (const label of ['Floor as drawn', 'Floor of the physics (Col_Hangar and the doorway sills)', 'Low fittings (cut 0.3 m above the floor)', 'Walls and fittings (cut 1.5 m above the floor)']) {
      expect(labels).toContain(label);
    }
    // in the drawing's own millimetres: the physics floor's forward starboard corner (53.28 m forward, 16.81 m to
    // starboard) by the drawing's fit to the ship (x = 0.52669 X - 165.963, z = 0.52669 Y - 47.853)
    const X = ((53.28 + 165.963) / 0.52669).toFixed(2);
    const Y = ((16.81 + 47.853) / 0.52669).toFixed(2);
    expect(svg).toContain(`${X},${Y}`);
    // the layers that were there are all still there (he has put some inside others); and his own: Hangar Spotting
    for (const label of ['Flight Deck', 'Helicopter Landing Areas', 'Catapults', 'Arrestor Cables', 'Other Structures', 'Parking Locations', 'Aircraft Spotting', 'Spawn Points', 'Hangar Deck', 'Hangar Spotting', 'Hangar Marks']) {
      expect(labels).toContain(label);
    }
    // the aircraft he has drawn: 40 on the flight deck's spotting layers; in the hangar 29 at first (what the hangar's
    // plan was made from: hangar_plan.py, through hangar_spots.py). THE HANGAR'S AS HE THEN SET THEM IN DCS (2026-11-18,
    // with the deck spotting tool: "The hangar space doesn't actually manage what was generated in the svg ... I've
    // saved the updated hangar layout if you can update the SVG"): written back into the layer: 15 moved, 6 taken out:
    // 23; he then placed the last one in the drawing and labelled each "F/A-18C EL<elevator> <turn>": 24, six for each
    // elevator (the 40 on the flight deck's layers are still plain "F/A-18C")
    expect(labels.filter((l) => l === 'F/A-18C').length).toBe(40);
    const el = labels.map((l) => /^F\/A-18C EL([1-4]) ([1-6])$/.exec(l)).filter((m): m is RegExpExecArray => !!m);
    expect(el.length).toBe(24);
    for (const k of ['1', '2', '3', '4']) expect(el.filter((m) => m[1] === k).map((m) => m[2]).sort().join('')).toBe('123456');
    // (the plan the demo runs with is made from those 24: each place with its elevator and its turn there)
    const plan = fs.readFileSync(here('../Scripts/CATCC/crewtest_hangar.lua'), 'utf8');
    expect([...plan.matchAll(/\{ n = \d+, x = [-\d.]+, z = [-\d.]+, fx = [-\d.]+, fz = [-\d.]+, el = [1-4], turn = [1-6] \}/g)].length).toBe(24);
  });

  it('what the user marked in DCS along the hangar\'s end walls: 29 floor points, two outlines; blocked in the plan the demo runs with, and drawn as a layer of the deck drawing', () => {
    // THE USER (2026-11-18, with the crew test panel's crosshair, "Hangar marks"): "I only marked the objects along the
    // fwd and aft walls of the hangar (I didn't actually mark the fwd and aft walls themselves), the rest of the floor
    // plan seemed correct." hangar-marks.json has his points as the hook saved them (ship coordinates, on the floor)
    const marks = JSON.parse(fs.readFileSync(here('../deck-test/hangar/hangar-marks.json'), 'utf8')).points as { n: number; kind: string; x: number; y: number; z: number }[];
    expect(marks.length).toBe(29);
    expect(marks.every((p) => p.kind === 'floor' && p.y === map.floor_y)).toBe(true);
    // two runs (a new one where two points in a row are more than 15 m apart): ten across the after end, 119 to 126 m aft
    // of the ship's origin; nineteen across the forward end, 45 to 53 m forward: each from one side of the hangar to the other
    const aft = marks.filter((p) => p.x < 0);
    const fwd = marks.filter((p) => p.x > 0);
    expect(aft.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(fwd.map((p) => p.n)).toEqual(Array.from({ length: 19 }, (_, i) => 11 + i));
    for (const run of [aft, fwd]) {
      for (let i = 1; i < run.length; i++) expect(Math.hypot(run[i].x - run[i - 1].x, run[i].z - run[i - 1].z)).toBeLessThan(15);
      expect(Math.min(...run.map((p) => p.z))).toBeLessThan(-15);
      expect(Math.max(...run.map((p) => p.z))).toBeGreaterThan(15);
    }
    expect(Math.min(...aft.map((p) => p.x))).toBeGreaterThan(-126);
    expect(Math.max(...aft.map((p) => p.x))).toBeLessThan(-118.9);
    expect(Math.min(...fwd.map((p) => p.x))).toBeGreaterThan(45);
    expect(Math.max(...fwd.map((p) => p.x))).toBeLessThan(53.3); // (the physics' floor ends at 53.28: nothing he marked is beyond it)
    // THE MODELS' MAP HAS FREE FLOOR THERE (hangar-map.json is as the models give it: not changed) ...
    const cell = (x: number, z: number) => (map.grid.rows[Math.floor((z - map.grid.z0) / map.grid.cell)] ?? '')[Math.floor((x - map.grid.x0) / map.grid.cell)] ?? ' ';
    expect(cell(54, -7)).toBe(',');
    expect(cell(-122, -3)).toBe('.');
    // ... THE PLAN THE DEMO RUNS WITH HAS IT BLOCKED (hangar_plan.py, through hangar_marks.py): everything between an
    // outline and the end of the hangar behind it, to the full height ("#")
    const plan = fs.readFileSync(here('../Scripts/CATCC/crewtest_hangar.lua'), 'utf8');
    expect(plan).toContain('marked in DCS along its forward and after walls (hangar_marks.py: 29 points, 2 outlines, blocked to the full height)');
    const rows = [...(/rows = \{([\s\S]*?)\n {2}\} \},/.exec(plan) ?? ['', ''])[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const at = (x: number, z: number) => (rows[Math.floor((z + 24) / 0.5)] ?? '')[Math.floor((x + 132) / 0.5)] ?? ' ';
    for (const [x, z] of [[54, -7], [54, 7], [60, 0], [50, -10], [48, 12], [-122, -3], [-121, -12], [-123, 12]]) expect(at(x, z)).toBe('#');
    // (the recesses of his outlines are floor: forward to 53.1 m between 4.6 m to port and the centreline, to 50.7 m
    // between 0.4 and 5.2 m to starboard, to 52 m between 7.6 and 9.5; aft the one between 5.8 and 9.3 m to starboard)
    for (const [x, z] of [[52, -2], [50, 3], [51, 8.5], [-123, 7.5], [47, -10], [44, 12], [-118, 0], [-118, -12]]) expect(at(x, z)).toBe('.');
    // no aircraft of his plan stands in it
    for (const m of plan.matchAll(/\{ n = \d+, x = ([-\d.]+), z = ([-\d.]+), fx/g)) expect(at(Number(m[1]), Number(m[2]))).toBe('.');
    // THE DRAWING ("save the geometry to a new layer in the svg"): the layer "Hangar Marks", the last thing in the file:
    // the two blocked areas, his two outlines, his 29 points, in the drawing's own millimetres
    const svg = fs.readFileSync(here('../../carrier-ops-handoff-2/Nimitz.svg'), 'utf8');
    // (he has saved the drawing since, with the layer in it: his editor writes a tag's attributes one to a line)
    const start = svg.search(/<g\b[^>]*\bid="layer-hangar-marks"/);
    expect(start).toBeGreaterThan(0);
    const layer = svg.slice(start);
    expect(/inkscape:label="Hangar Marks"/.test(layer.slice(0, 300))).toBe(true);
    expect(/<\/g>\s*<\/g>\s*<\/svg>\s*$/.test(layer)).toBe(true);
    expect([...layer.matchAll(/<polygon\b/g)].length).toBe(2);
    expect([...layer.matchAll(/<polyline\b/g)].length).toBe(2);
    expect([...layer.matchAll(/<circle\b[^>]*inkscape:label="point \d+"/g)].length).toBe(29);
    // (his first point, 120.55 m aft and 15.36 m to starboard, by the drawing's fit to the ship)
    const first = /<circle\b[^>]*inkscape:label="point 1"[^>]*>/.exec(layer)?.[0] ?? '';
    // (his editor has since written it as 86.220001: held to the hundredth of a millimetre)
    expect(Number((/cx="([-\d.]+)"/.exec(first) ?? [])[1])).toBeCloseTo((-120.55 + 165.963) / 0.52669, 1);
    expect(Number((/cy="([-\d.]+)"/.exec(first) ?? [])[1])).toBeCloseTo((15.363 + 47.853) / 0.52669, 1);
  });
});