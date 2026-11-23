// The tractor drivers' limbs (catcc-dcs/deck-test/crew-test/DRIVER-POSE.md): deck-test/crew-test/model/driver_pose.py
// against this PC's DCS (skipped where DCS is not installed): the cab's numbers against the tractor's model, the solved
// limbs of every pose (hands on the rim, feet on floor and pedal, bones as long as they were, joints as a man's), the
// made clips as DCS's own Assimp reads them, the blend between two head poses, the drawing; and that the pose is solved
// for the seat the hook puts the driver on. (How the hook chooses the pose: crewtest.test.ts.)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = (p: string) => path.resolve(__dirname, p);
const DCS = 'C:\\Program Files\\Eagle Dynamics\\DCS World';
const SOURCE = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\animations\\animations\\typeV\\F18_39_Look_LR.fbx');
const TRACTOR = path.join(DCS, 'CoreMods\\tech\\USS_Nimitz\\Shapes\\as32-31a.edm');
const POSE = here('../deck-test/crew-test/model/driver_pose.py');
const HEAD = here('../deck-test/crew-test/model/driver_head.py');
const HOOK = fs.readFileSync(here('../Scripts/CATCC/crewtest_hook.lua'), 'utf8');
const canMake = fs.existsSync(SOURCE) && fs.existsSync(TRACTOR) && spawnSync('python', ['--version']).status === 0;
const py = (tool: string, args: string[]) => execFileSync('python', ['-I', tool, ...args], { encoding: 'utf8' }).trim().split(/\r?\n/);
const NAMES = ['catcc_drv_look_l100', 'catcc_drv_look_l050', 'catcc_drv_look_c000', 'catcc_drv_look_r050', 'catcc_drv_look_r100'];

describe.skipIf(!canMake)("the tractor drivers' limbs: the pose (driver_pose.py, from this PC's DCS)", () => {
  it("the cab in the settings is the tractor model's own (wheel, pedals, floor, seat: to a centimetre); the pose is solved for the seat the hook puts the driver on", () => {
    const said = py(POSE, ['--measure']);
    expect(said[0]).toMatch(/^steering wheel: middle fwd 0\.17\d left 0\.58\d up 0\.84\d; rim to its outside 0\.18\d; top leans 1\d\.\d degrees forward; rim ends 0\.91\d up$/);
    expect(said).toContain('the cab as POSE has it against as32-31a.edm (22 numbers): all within a centimetre');
    // TOW.seat in the hook is where the pelvis bone goes: the same numbers here, or hands and feet are off by the difference
    const seat = said.find((l) => l.startsWith('the seat POSE is solved for: '))!.slice('the seat POSE is solved for: '.length);
    expect(seat).toMatch(/^seat = \{ fwd = -?\d\.\d\d, left = \d\.\d\d, up = \d\.\d\d \}$/);
    expect(HOOK).toContain(`  ${seat},`);
    // the pose the hook plays is the one made here
    expect(HOOK).toContain("seatPose = 'catcc_drv_seat',");
    // as the user drew them: the left hand lower on the rim (8 to 9 o'clock) than the right (2 to 3); the right foot on a pedal
    expect(said[said.length - 1]).toMatch(/^the hands: left at (8|8\.5|9) on the clock face, right at (2|2\.5|3); the right foot on the (accelerator|brake)$/);
  }, 60000);

  it('every pose (the plain seated one and the five head poses): wrists and ankles where they were to be, the grips on the rim, the feet on their surfaces, every bone as long as it was, the head turned as before, the joints within what a man can do', () => {
    const said = py(POSE, ['--report']);
    for (const name of ['catcc_drv_seat', ...NAMES]) {
      const mine = said.filter((l) => l.startsWith(`${name}: `));
      expect(mine.length, name).toBe(6);
      for (const limb of ['L leg', 'R leg', 'L arm', 'R arm']) {
        const line = mine.find((l) => l.startsWith(`${name}: ${limb}: `))!;
        const m = line.match(/at fwd ([+-]\d\.\d+) left ([+-]\d\.\d+) up (\d\.\d+), (\d+\.\d) cm from where it was to be(?: \(OUT OF REACH by (\d+\.\d) cm: stopped short\))?; bones (\d\.\d+) \/ (\d\.\d+) m \(as in the clip: (\d\.\d+) \/ (\d\.\d+)\); (.+)$/);
        expect(m, line).not.toBeNull();
        // within 2 mm of its place (a hand that cannot reach stops short: never more than 5 mm, and only with the head right round)
        expect(Number(m![4]), line).toBeLessThanOrEqual(m![5] ? 0.5 : 0.2);
        if (m![5]) expect(name).toMatch(/_[lr]100$/);
        // the bones are not stretched
        expect(m![6]).toBe(m![8]);
        expect(m![7]).toBe(m![9]);
        const angles = Object.fromEntries(m![10].split('; ').map((a) => [a.slice(0, a.lastIndexOf(' ')), Number(a.slice(a.lastIndexOf(' ') + 1))]));
        if (limb.endsWith('leg')) {
          // the shins about upright under knees bent past a right angle; the thighs a little above level (he sits low)
          expect(angles.knee, line).toBeGreaterThan(90);
          expect(angles.knee, line).toBeLessThan(125);
          expect(angles['thigh up'], line).toBeGreaterThan(5);
          expect(angles['thigh up'], line).toBeLessThan(25);
          // the left foot flat (square to the shin, within 10 degrees); the right pressed down on its pedal
          if (limb === 'L leg') expect(Math.abs(angles.ankle), line).toBeLessThan(10);
          else expect(angles.ankle, line).toBeLessThan(-10);
        } else {
          // elbows bent, never locked (the solver's own stop is 19.9), never folded
          expect(angles.elbow, line).toBeGreaterThanOrEqual(19.8);
          expect(angles.elbow, line).toBeLessThan(90);
          expect(angles.wrist, line).toBeLessThan(35);
          expect(angles['upper arm below level'], line).toBeGreaterThan(20); // (elbows down)
          expect(angles['upper arm out'], line).toBeGreaterThan(0); // (and out)
        }
      }
      const ends = mine[4].match(/the hands' grip is (\d+\.\d) cm \(left\) and (\d+\.\d) cm \(right\) from the rim's middle; the balls of the feet (\d+\.\d) cm and (\d+\.\d) cm from their surface; the head is turned as it was$/);
      expect(ends, mine[4]).not.toBeNull();
      for (const v of ends!.slice(1, 5)) expect(Number(v)).toBeLessThanOrEqual(0.5);
      expect(mine[5]).toBe(`${name}: joints: all within what a man can do`);
    }
    // facing ahead: both elbows well bent (as drawn: the forearms about level to the wheel)
    const elbow = (limb: string) => Number(said.find((l) => l.startsWith(`catcc_drv_seat: ${limb}: `))!.match(/elbow (\d+\.\d)/)![1]);
    expect(elbow('L arm')).toBeGreaterThan(35);
    expect(elbow('R arm')).toBeGreaterThan(35);
    // why the torso is brought forward: with the pilot's the hands cannot reach the rim
    const last = said[said.length - 1].match(/^with the pilot's torso \(lean 0, shoulder_fwd None\): the hands stop (\d+\.\d) cm \(left\) and (\d+\.\d) cm \(right\) short of the rim$/);
    expect(last, said[said.length - 1]).not.toBeNull();
    expect(Number(last![1])).toBeGreaterThan(5);
    expect(Number(last![2])).toBeGreaterThan(3);
  }, 60000);

  it("the clips are made (driver_head.py --pose: the five head poses with the limbs; driver_pose.py: the plain seated pose); DCS's own Assimp reads each as a still pose whose hands and feet are where they were solved to be; half way between two head poses the hands are still on the rim; without --pose the head poses are the pilot's as before", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-driver-pose-'));
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-driver-pose-plain-'));
    try {
      const made = py(HEAD, [out, '--pose']);
      expect(made[0]).toMatch(/^driver head: made catcc_drv_look_l100\.fbx \(\d+ bytes\), .*blend_space\/catcc_bs_drv_look\.lua \(the limbs at the wheel and the pedals\)$/);
      expect(py(POSE, [out])).toEqual([expect.stringMatching(/^driver pose: made catcc_drv_seat\.fbx \(\d+ bytes\)$/)]);
      expect(fs.readdirSync(out).sort()).toEqual(['blend_space', 'catcc_drv_seat.fbx', ...NAMES.map((n) => `${n}.fbx`)].sort());
      const files = ['catcc_drv_seat', ...NAMES].map((n) => path.join(out, `${n}.fbx`));
      // as DCS reads them: one still animation of 11 frames on 74 bones each (the head test's own check) ...
      const seat = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\animations\\animations\\typeV\\F18_0_Init.fbx');
      const read = py(HEAD, ['--assimp', ...files, seat]);
      const heads = read.map((line) => {
        const m = line.match(/^(\S+)\.fbx: Assimp: 1 animation, 10 frames at 30 a second, 74 bones, keys \[\(11, 11, 11\)\], a still pose; the head bone (.+)$/);
        expect(m, line).not.toBeNull();
        return m![2];
      });
      // ... the head bone of the pose that faces ahead the seated pilot's own (nothing twitches when a pose takes over)
      expect(heads[0]).toBe(heads[6]);
      expect(heads[3]).toBe(heads[6]);
      // ... and hands and feet, worked out from what Assimp gives, where the solver put them
      for (const line of py(POSE, ['--assimp', ...files])) {
        const m = line.match(/^\S+\.fbx: Assimp: 74 bones; wrists and ankles within (\d+\.\d+) cm of the solved pose; the grips (\d+\.\d) cm \(left\) and (\d+\.\d) cm \(right\) from the rim$/);
        expect(m, line).not.toBeNull();
        expect(Number(m![1])).toBeLessThanOrEqual(0.05);
        expect(Number(m![2])).toBeLessThanOrEqual(0.5);
        expect(Number(m![3])).toBeLessThanOrEqual(0.5);
      }
      // the plain seated pose is the head pose that faces ahead, byte for byte
      expect(fs.readFileSync(files[0]).equals(fs.readFileSync(files[3]))).toBe(true);
      // the blend space mixes two poses' turns: no bone's turns are opposite ones, and half way the hands are within
      // a centimetre of the rim, the ankles of their places
      const blend = py(POSE, ['--blend', out]);
      expect(blend.length).toBe(4);
      for (const line of blend) {
        const m = line.match(/the turns nearest opposite: \S+ \((\d\.\d+); .*half way: the grips (\d+\.\d) cm \(left\) and (\d+\.\d) cm \(right\) from the rim, the ankles (\d+\.\d) cm and (\d+\.\d) cm from their places$/);
        expect(m, line).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThan(0.9);
        for (const v of m!.slice(2, 6)) expect(Number(v)).toBeLessThanOrEqual(1.0);
      }
      // the blend space file is the head's own: the same five names
      expect(fs.readFileSync(path.join(out, 'blend_space', 'catcc_bs_drv_look.lua'), 'utf8')).toContain("{ x = 100, animation = 'catcc_drv_look_r100' },");

      // without --pose: the pilot's limbs (the arms' and legs' bones differ from the posed files; a pose made twice is the same bytes)
      py(HEAD, [plain]);
      expect(fs.readdirSync(plain).sort()).toEqual(['blend_space', ...NAMES.map((n) => `${n}.fbx`)].sort());
      expect(fs.readFileSync(path.join(plain, 'catcc_drv_look_c000.fbx')).equals(fs.readFileSync(files[3]))).toBe(false);
      const pilot = py(POSE, ['--assimp', path.join(plain, 'catcc_drv_look_c000.fbx')])[0];
      const far = pilot.match(/wrists and ankles within (\d+\.\d+) cm of the solved pose/);
      expect(Number(far![1])).toBeGreaterThan(20); // (the pilot's feet are out on the rudder pedals)
      py(HEAD, [plain, '--pose']);
      expect(fs.readFileSync(path.join(plain, 'catcc_drv_look_r100.fbx')).equals(fs.readFileSync(files[5]))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
      fs.rmSync(plain, { recursive: true, force: true });
    }
  }, 120000);

  it('the drawing: the solved skeleton from the side and from above over the lines of the tractor model, the four limbs in the colours of the drawing they were read from', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-driver-pose-svg-'));
    try {
      const file = path.join(out, 'pose.svg');
      expect(py(POSE, ['--svg', file])[0]).toMatch(/^driver pose: drawn: .*pose\.svg \(catcc_drv_seat\)$/);
      const svg = fs.readFileSync(file, 'utf8');
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      for (const colour of ['#1faa2e', '#e02020', '#ff70e0', '#ff7a10']) expect(svg).toContain(`stroke="${colour}"`);
      expect(svg.length).toBeGreaterThan(100000); // (the model's lines are in it)
      expect(svg).toMatch(/L leg: knee \d+ degrees; ankle [+-]\d+/);
      expect(svg).toMatch(/R arm: elbow \d+ degrees; wrist \d+/);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 60000);
});

describe("the tractor drivers' limbs: the installer and the hook", () => {
  it('install.ps1 -DriverPose: a switch of its own, off until asked for, kept in Config\\CATCC-test.lua; it makes the plain pose and has the head poses made with the limbs; nothing half made is left', () => {
    const ps = fs.readFileSync(here('../deck-test/crew-test/install.ps1'), 'utf8');
    expect(ps).toContain("[ValidateSet('', 'on', 'off')][string]$DriverPose = '',");
    expect(ps).toContain("if ($DriverPose -eq 'on') { $flags['driverPose'] = 'true' }");
    expect(ps).toContain("elseif ($DriverPose -eq 'off' -and $flags.Contains('driverPose')) { $flags.Remove('driverPose') }");
    expect(ps).toContain("if ($flags['driverPose'] -eq 'true') { $headArgs += '--pose' }");
    expect(ps).toContain("$said = & $python.Source -I (Join-Path $here 'model\\driver_pose.py') $headDir --dcs $DcsDir");
    expect(ps).toContain("if (Test-Path $seatFile) { Remove-Item -Force $seatFile }");
    // uninstalling takes the switch out with the others
    expect(ps).toContain("if ($flags.Contains('driverPose')) { $flags.Remove('driverPose') }");
    expect(ps.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("the hook: Tow.sit plays the pose of ours and falls back on the pilot's; the demo seats its drivers through it", () => {
    expect(HOOK).toContain("seatAnim = 'f18_0_init',");
    expect(HOOK).toMatch(/function Tow\.sit\(native, h\)\r?\n {2}local ok, res = pcall\(native\.play, h, TOW\.seatPose, 2\)\r?\n {2}if ok and res then return TOW\.seatPose end\r?\n {2}local ok2, res2, e2 = pcall\(native\.play, h, TOW\.seatAnim, 2\)/);
    const demo = fs.readFileSync(here('../Scripts/CATCC/crewtest_demo.lua'), 'utf8');
    expect(demo).toContain('if not (Tow.Head and Tow.Head.seat(native, tg.driver)) then Tow.sit(native, q.h) end');
    expect(demo).not.toContain('native.play, q.h, TOW.seatAnim');
  });
});
