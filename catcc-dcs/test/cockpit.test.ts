// The brake riders (catcc-dcs/deck-test/crew-test/BRAKE-RIDER.md): brown shirts in the cockpit of an aircraft the deck
// spotting demo tows.
//   * Scripts/CATCC/crewtest_cockpit.lua under fengari, with a stand-in native module and the drivers' own head
//     (crewtest_head.lua): when a rider climbs in and out, where he sits, where he looks, what happens when none is free;
//   * deck-test/crew-test/model/rider_pose.py against this PC's DCS (skipped where DCS is not installed): the cockpit as
//     the Hornet's model has it, the poses solved, made, and read by DCS's own Assimp, the blend space between them;
//   * the crew data patch, the hook, the demo and the installer: the riders are declared, found and installed.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const here = (p: string) => path.resolve(__dirname, p);
const COCKPIT_SRC = fs.readFileSync(here('../Scripts/CATCC/crewtest_cockpit.lua'), 'utf8');
const HEAD_SRC = fs.readFileSync(here('../Scripts/CATCC/crewtest_head.lua'), 'utf8');

const PRELUDE = `
local out = {}
function rec(s) out[#out + 1] = s end
C = assert(load(COCKPIT_SRC, 'crewtest_cockpit'))()
H = assert(load(HEAD_SRC, 'crewtest_head'))()
NOPLAY = {}
native = {
  place = function(h, x, y, z, fx, fz) rec(string.format('place %d %.3f %.3f %.3f %.3f %.3f', h, x, y, z, fx, fz)) return true, 'origin + pose' end,
  play = function(h, n, m)
    rec('play ' .. h .. ' ' .. n .. ' mode ' .. tostring(m))
    if NOPLAY[n] then return nil, 'DCS has no animation called "' .. n .. '"' end
    return true
  end,
  head = function(h, y, w) rec('head ' .. h .. ' ' .. (y and string.format('%g', y) or 'forgotten') .. (w and (' w' .. w) or '')) return true end,
  headtick = function() return 0, 0 end,
}
CB = {
  board = function(k) rec('BOARD ' .. k.name) end,
  leave = function(k) rec('LEAVE ' .. k.name) end,
  log = function(t) rec('LOG ' .. t) end,
}
-- an aircraft: its position (the static's own: 1.856 m above the deck) and facing; a tractor coming for it
A = { name = 'A', x = 10, y = 22.005, z = 5, fx = 1, fz = 0 }
B = { name = 'B', x = -40, y = 22.005, z = -5, fx = 0, fz = 1 }
function entry(a, stage, tx, tz, hx, hz)
  return { key = a, name = a.name, stage = stage, x = a.x, y = a.y, z = a.z, fx = a.fx, fz = a.fz, tx = tx, tz = tz, hx = hx, hz = hz }
end
function count(pat) local n = 0 for _, l in ipairs(out) do if l:find(pat) then n = n + 1 end end return n end
function first(pat) for i, l in ipairs(out) do if l:find(pat) then return i, l end end end
`;

function run(script: string): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries({ COCKPIT_SRC, HEAD_SRC })) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  if (lauxlib.luaL_dostring(L, to_luastring(`${PRELUDE}\n${script}\nOUT = table.concat(out, '\\n')`)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  return lua.lua_tojsstring(L, -1).split('\n');
}

// the tractor comes from 40 m off at 2 m/s (half-second steps), hooks on, tows A 30 m ahead, unhooks and drives away
const SCENE = `
st = C.new({ { h = 7, name = 'catcc-b0' } })
local t = 0
local function step(list) t = t + 0.5 C.tick(st, native, H, t, list, CB) end
-- coming: 40 m from where it hooks on (A's nose, 10 m ahead), 2 m/s
local hx, hz = A.x + 10, A.z
for i = 0, 20 do
  local d = 40 - 2 * 0.5 * i
  step({ entry(A, 'coming', hx + d, hz, hx, hz) })
  rec(string.format('# coming d=%d aboard=', d) .. tostring(st.aboard[A] ~= nil))
end
-- on: hooked, towed 30 m ahead in 60 s, then stands 10 s
for i = 1, 140 do
  if i <= 120 then A.x = A.x + 0.25 end
  step({ entry(A, 'on', A.x + 10, A.z) })
end
rec('# towed')
-- done: the tractor backs off 1 m every step from 10 m ahead of A
for i = 1, 30 do
  step({ entry(A, 'done', A.x + 10 + i, A.z) })
  rec('# done i=' .. i .. ' aboard=' .. tostring(st.aboard[A] ~= nil))
end
`;

describe('the brake riders: crewtest_cockpit.lua', () => {
  it('a rider climbs in when the tractor is 20 m from where it hooks on, sits in the Hornet\'s seat and goes with the aircraft, looks round, and climbs out once the tractor is 8 m further off than it was when it delivered the aircraft; the canopy is asked open once', () => {
    const out = run(SCENE);
    // before: nobody aboard, and he was put away (900 m aft of the ship's origin) as the run began
    expect(out).toContain('# coming d=22 aboard=false');
    expect(out).toContain('# coming d=20 aboard=true');
    expect(out.indexOf('place 7 -900.000 20.149 0.000 1.000 0.000')).toBeGreaterThanOrEqual(0);
    // in: our blend space, his head ahead with the drivers' speed of turn, the canopy (BOARD), and the seat: 3.640 m
    // ahead of the aircraft's position, 0.425 m up
    const board = out.indexOf('BOARD A');
    expect(board).toBeGreaterThan(0);
    expect(out.filter((l) => l === 'BOARD A').length).toBe(1);
    expect(out).toContain('play 7 catcc_bs_rdr_look mode 2');
    expect(out).toContain('head 7 0 w6');
    expect(out).toContain('place 7 13.640 22.430 5.000 1.000 0.000');
    expect(out.find((l) => l.startsWith('LOG cockpit: catcc-b0 climbs into A'))).toBe('LOG cockpit: catcc-b0 climbs into A (catcc_bs_rdr_look)');
    // with the aircraft: placed again only when it moved (after the seat he was put in as he climbed in, before BOARD):
    // the 120 steps of the tow, none while it stands, none while it waited for the tractor
    const towed = out.indexOf('# towed');
    const seats = out.slice(board, towed).filter((l) => l.startsWith('place 7 '));
    expect(seats.length).toBe(120);
    expect(seats[seats.length - 1]).toBe('place 7 43.640 22.430 5.000 1.000 0.000');
    // he looks round: to both sides, never beyond what the poses go to, a call every few seconds
    const looks = out.slice(board, towed).filter((l) => /^head 7 -?\d+$/.test(l)).map((l) => Number(l.split(' ')[2]));
    expect(looks.length).toBeGreaterThan(8);
    expect(looks.length).toBeLessThan(80);
    expect(Math.min(...looks)).toBeLessThan(-30);
    expect(Math.max(...looks)).toBeGreaterThan(30);
    expect(looks.every((y) => Math.abs(y) <= 100)).toBe(true);
    // out: when the tractor is clear: it was 10 m from A when it delivered it, so out beyond 18 m
    expect(out).toContain('# done i=8 aboard=true');
    expect(out).toContain('# done i=9 aboard=false');
    expect(out.find((l) => l.startsWith('LOG cockpit: catcc-b0 climbs out of A'))).toBe('LOG cockpit: catcc-b0 climbs out of A: its tractor is clear (19.0 m off)');
    const leave = out.indexOf('LEAVE A');
    // (his head forgotten, then put away, then the demo told)
    expect(out.slice(leave - 2, leave)).toEqual(['head 7 forgotten', 'place 7 -900.000 20.149 0.000 1.000 0.000']);
    expect(out.slice(towed, leave).filter((l) => l === 'head 7 forgotten').length).toBe(1);
    // and he is not put back for a delivered aircraft
    expect(out.slice(leave).some((l) => l.startsWith('BOARD'))).toBe(false);
  });

  it('a tractor still on its way from further than 20 m has no rider sent ahead; one whose way begins nearer has him at once; an aircraft that leaves the list (its tow broken off) loses him at once; a delivered aircraft never takes one', () => {
    const out = run(`
st = C.new({ { h = 7, name = 'catcc-b0' } })
C.tick(st, native, H, 1, { entry(A, 'coming', 45, 5, 20, 5) }, CB)
rec('# far ' .. tostring(st.aboard[A] ~= nil))
C.tick(st, native, H, 2, { entry(A, 'coming', 25, 5, 20, 5) }, CB)
rec('# near ' .. tostring(st.aboard[A] ~= nil))
C.tick(st, native, H, 3, {}, CB)
rec('# gone ' .. tostring(st.aboard[A] ~= nil))
C.tick(st, native, H, 4, { entry(A, 'done', 21, 5) }, CB)
rec('# delivered ' .. tostring(st.aboard[A] ~= nil))
C.tick(st, native, H, 5, { entry(A, 'coming', 21, 5) }, CB)
rec('# no hitch given ' .. tostring(st.aboard[A] ~= nil))
`);
    expect(out).toContain('# far false');
    expect(out).toContain('# near true');
    expect(out).toContain('# gone false');
    expect(out).toContain('# delivered false');
    expect(out).toContain('# no hitch given false');
    expect(out.filter((l) => l.startsWith('BOARD')).length).toBe(1);
    expect(out.filter((l) => l.startsWith('LEAVE')).length).toBe(1);
  });

  it('an aircraft in two entries (the hangar\'s tractor leaving it, the deck\'s coming) keeps its rider; a delivered one lets him go after 60 s whatever the tractor does; with every rider aboard another tow goes without one, said once', () => {
    const out = run(`
st = C.new({ { h = 8, name = 'catcc-b1' }, { h = 7, name = 'catcc-b0' } })
-- (riders are taken by name: catcc-b0 first)
C.tick(st, native, H, 1, { entry(A, 'on', 20, 5) }, CB)
rec('# A has ' .. st.aboard[A].name)
-- delivered, the tractor standing by; the next tractor coming from far off: still aboard
for t = 2, 30 do C.tick(st, native, H, t, { entry(A, 'done', 20, 5), entry(A, 'coming', 60, 5, 20, 5) }, CB) end
rec('# both ' .. tostring(st.aboard[A] ~= nil))
-- (the next one is called off: the first tractor stands by for good)
-- (the linger counts from when the last tractor coming for it was called off)
for t = 31, 89 do C.tick(st, native, H, t, { entry(A, 'done', 20, 5) }, CB) end
rec('# not yet ' .. tostring(st.aboard[A] ~= nil))
for t = 90, 95 do C.tick(st, native, H, t, { entry(A, 'done', 20, 5) }, CB) end
rec('# lingered ' .. tostring(st.aboard[A] ~= nil))
-- three tows at once, two riders
local Z = { name = 'Z', x = 0, y = 22.005, z = 30, fx = 1, fz = 0 }
for t = 96, 100 do C.tick(st, native, H, t, { entry(A, 'on', 20, 5), entry(B, 'on', -40, 5), entry(Z, 'on', 10, 30) }, CB) end
rec('# three: ' .. tostring(st.aboard[A] and st.aboard[A].name) .. ' ' .. tostring(st.aboard[B] and st.aboard[B].name) .. ' ' .. tostring(st.aboard[Z]))
`);
    expect(out).toContain('# A has catcc-b0');
    expect(out).toContain('# both true');
    expect(out).toContain('# not yet true');
    expect(out).toContain('# lingered false');
    expect(out).toContain('LOG cockpit: catcc-b0 climbs out of A: its tractor is still near after 60 s');
    expect(out).toContain('# three: catcc-b0 catcc-b1 nil');
    expect(out.filter((l) => l === 'LOG cockpit: no brake rider free for Z (all 2 are in other aircraft): it is towed without one').length).toBe(1);
  });

  it('on an elevator between its two tractors (hold) a rider stays in through the ride, going up with the platform, until the deck\'s tractor has the aircraft; hold puts nobody in; a hold that ends with no tractor working on it lets him out', () => {
    const out = run(`
st = C.new({ { h = 7, name = 'catcc-b0' } })
-- an aircraft with no rider on a platform: none put in
C.tick(st, native, H, 1, { entry(B, 'hold') }, CB)
rec('# hold alone ' .. tostring(st.aboard[B] ~= nil))
-- the hangar's tow; delivered onto the platform; its tractor drives away and is long gone (its job ends)
C.tick(st, native, H, 2, { entry(A, 'on', 20, 5) }, CB)
for t = 3, 70 do C.tick(st, native, H, t, { entry(A, 'done', 20 + t, 5), entry(A, 'hold') }, CB) end
rec('# tractor gone ' .. tostring(st.aboard[A] ~= nil))
-- the platform goes up 11.43 m: he goes with it
for i = 1, 20 do A.y = 22.005 - 11.43 + 11.43 * i / 20 C.tick(st, native, H, 70 + i, { entry(A, 'hold') }, CB) end
rec('# up ' .. tostring(st.aboard[A] ~= nil))
-- the deck's tractor comes from far off, hooks on
C.tick(st, native, H, 95, { entry(A, 'hold'), entry(A, 'coming', 80, 5, 20, 5) }, CB)
C.tick(st, native, H, 96, { entry(A, 'on', 20, 5) }, CB)
rec('# deck tow ' .. tostring(st.aboard[A] ~= nil))
-- an aircraft left on the platform as its deck spot: out of the list
C.tick(st, native, H, 97, { entry(A, 'hold') }, CB)
C.tick(st, native, H, 98, {}, CB)
rec('# stays on the platform ' .. tostring(st.aboard[A] ~= nil))
`);
    expect(out).toContain('# hold alone false');
    expect(out).toContain('# tractor gone true');
    expect(out).toContain('# up true');
    expect(out).toContain('# deck tow true');
    expect(out).toContain('# stays on the platform false');
    expect(out.filter((l) => l === 'BOARD A').length).toBe(1);
    expect(out.filter((l) => l === 'LEAVE A').length).toBe(1);
    expect(out).toContain('place 7 13.640 22.430 5.000 1.000 0.000');
    expect(out).toContain('LOG cockpit: catcc-b0 climbs out of A: no tractor is working on it');
  });

  it('without our blend space a rider sits in our still pose (hands in the lap, head ahead), without that in the pilot\'s own; his head is left alone then, and with CATCC_HEAD_OFF', () => {
    const seat = (set: string) =>
      run(`${set}\nst = C.new({ { h = 7, name = 'catcc-b0' } })\nfor t = 1, 40 do C.tick(st, native, H, t * 0.5, { entry(A, 'on', 20, 5) }, CB) end`);
    const still = seat("NOPLAY['catcc_bs_rdr_look'] = true");
    expect(still).toContain('play 7 catcc_rdr_seat mode 2');
    expect(still).toContain('LOG cockpit: catcc-b0 climbs into A (catcc_rdr_seat)');
    expect(still.some((l) => l.startsWith('head 7'))).toBe(false);
    const pilot = seat("NOPLAY['catcc_bs_rdr_look'] = true NOPLAY['catcc_rdr_seat'] = true");
    expect(pilot).toContain('play 7 f18_0_init mode 2');
    const off = seat('CATCC_HEAD_OFF = true');
    expect(off).not.toContain('play 7 catcc_bs_rdr_look mode 2');
    expect(off).toContain('play 7 catcc_rdr_seat mode 2');
    expect(off.some((l) => l.startsWith('head 7'))).toBe(false);
    const none = seat("NOPLAY['catcc_bs_rdr_look'] = true NOPLAY['catcc_rdr_seat'] = true NOPLAY['f18_0_init'] = true");
    expect(none).toContain('LOG cockpit: catcc-b0 climbs into A (NO POSE could be played)');
  });

  it('when the demo stops every rider climbs out and is put away; people added twice are kept once', () => {
    const out = run(`
st = C.new({ { h = 7, name = 'catcc-b0' } })
rec('# added again ' .. C.add(st, { { h = 7, name = 'catcc-b0' }, { h = 9, name = 'catcc-b2' } }) .. ' of ' .. #st.pool)
C.tick(st, native, H, 1, { entry(A, 'on', 20, 5) }, CB)
C.stop(st, native, H, CB)
rec('# after stop ' .. tostring(next(st.aboard)))
`);
    expect(out).toContain('# added again 1 of 2');
    expect(out).toContain('LEAVE A');
    expect(out).toContain('head 7 forgotten');
    expect(out).toContain('# after stop nil');
    expect(out.slice(out.indexOf('LEAVE A')).filter((l) => /^place (7|9) -900\.000 /.test(l)).length).toBe(2);
  });
});

// ---------------------------------------------------------------- the poses, from this PC's DCS
const DCS = 'C:\\Program Files\\Eagle Dynamics\\DCS World';
const SOURCE = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\animations\\animations\\typeV\\F18_39_Look_LR.fbx');
const JET = path.join(DCS, 'CoreMods\\aircraft\\FA-18C\\Shapes\\fa-18c.edm');
const POSE = here('../deck-test/crew-test/model/rider_pose.py');
const canMake = fs.existsSync(SOURCE) && fs.existsSync(JET) && spawnSync('python', ['--version']).status === 0;
const py = (args: string[]) => execFileSync('python', ['-I', POSE, ...args], { encoding: 'utf8' }).trim().split(/\r?\n/);
const NAMES = ['catcc_rdr_look_l100', 'catcc_rdr_look_l050', 'catcc_rdr_look_c000', 'catcc_rdr_look_r050', 'catcc_rdr_look_r100'];

describe.skipIf(!canMake)("the brake riders' pose (rider_pose.py, from this PC's DCS)", () => {
  it("the cockpit in the settings is the Hornet model's own (the seat, the windscreen's arch: to a centimetre); the pilot figure put at seat_pilot has its hand on the throttle; the open canopy's frame is out of reach; the seat is the one crewtest_cockpit.lua puts riders in", () => {
    const said = py(['--measure']);
    expect(said[0]).toBe("seat_pilot (the figure's pelvis bone): fwd 3.640 up 0.425 right -0.000");
    expect(said).toContain('the cockpit as POSE has it against fa-18c.edm: all within a centimetre');
    const thr = said.find((l) => l.startsWith("the pilot's left hand"))!;
    expect(Number(thr.match(/: (\d+\.\d) cm apart$/)![1])).toBeLessThan(6);
    const canopy = said.find((l) => l.startsWith("the canopy's frame, open: "))!;
    expect(Number(canopy.match(/open: (\d\.\d\d) \.\. (\d\.\d\d) m up/)![2])).toBeGreaterThan(2);
    // the hook's side holds the same seat
    expect(COCKPIT_SRC).toContain('seat = { fwd = 3.640, up = 0.425 }');
    expect(fs.readFileSync(POSE, 'utf8')).toContain("'seat': {'fwd': 3.640, 'up': 0.425, 'right': 0.0},");
  });

  it('every pose has both hands resting in the lap, palm down on the thighs (0.0 cm), with elbows and wrists within what a man can do; the head turned as the head poses turn it', () => {
    // (the user, 2026-11-25: "the towel rack is attached to the part of the canopy that raises when opening ... rest their hands in their lap for now")
    expect(fs.readFileSync(POSE, 'utf8')).toContain("'hold': 'lap',");
    const said = py(['--report']);
    const summary = said.filter((l) => l.includes('the grips are'));
    expect(summary.length).toBe(6);
    for (const l of summary) expect(l).toMatch(/: the grips are 0\.0 cm \(left\) and 0\.0 cm \(right\) from where they rest; the head is turned as it was; joints: all within what a man can do$/);
    expect(said.some((l) => l.includes('OUT OF REACH'))).toBe(false);
  });

  it("the clips are made; DCS's own Assimp reads each with the hands where they rest; half way between two head poses the hands stay within a centimetre of that and no bone's two turns are opposite", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-rider-pose-'));
    try {
      const made = py([out]);
      expect(made[0]).toMatch(/^brake rider pose: made catcc_rdr_seat\.fbx \(\d+ bytes\), .*blend_space\/catcc_bs_rdr_look\.lua$/);
      expect(fs.readdirSync(out).sort()).toEqual(['blend_space', 'catcc_rdr_seat.fbx', ...NAMES.map((n) => `${n}.fbx`)].sort());
      const check = py(['--check', out]);
      expect(check.length).toBe(10);
      for (const l of check.slice(0, 6)) expect(l).toMatch(/^\S+\.fbx: Assimp: 74 bones; the grips 0\.\d cm \(left\) and 0\.\d cm \(right\) from where they rest$/);
      for (const l of check.slice(6)) {
        const m = l.match(/the turns nearest opposite: \S+ \((\d\.\d+); .*half way: the grips (\d+\.\d) cm \(left\) and (\d+\.\d) cm \(right\) from where they rest$/);
        expect(m, l).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThan(0.9);
        expect(Number(m![2])).toBeLessThanOrEqual(1.0);
        expect(Number(m![3])).toBeLessThanOrEqual(1.0);
      }
      const space = fs.readFileSync(path.join(out, 'blend_space', 'catcc_bs_rdr_look.lua'), 'utf8');
      expect(space).toContain("x_axis = { name = 'catcc_head_yaw', default_value = 0 },");
      for (const [x, n] of [[-100, NAMES[0]], [0, NAMES[2]], [100, NAMES[4]]]) expect(space).toContain(`{ x = ${x}, animation = '${n}' },`);
      // the plain pose is the one that faces ahead
      expect(fs.readFileSync(path.join(out, 'catcc_rdr_seat.fbx')).equals(fs.readFileSync(path.join(out, `${NAMES[2]}.fbx`)))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 120000);
});

describe('the brake riders: declared, found, installed', () => {
  it('the crew data patch declares catcc-b0 .. b8, brown shirts, three in each of catapult crews 2, 3 and 4; the hook keeps them out of the marshalling crew; the demo finds them and opens the canopy of the aircraft they climb into; install.ps1 copies the script and makes the poses', () => {
    const patch = fs.readFileSync(here('../deck-test/crew-test/groundcrew-patch.lua'), 'utf8');
    expect(patch).toContain("for i = 0, 8 do people[#people + 1] = { 'catcc-b' .. i, 'brown', 10.0 - i, 33.0, 2 + math.floor(i / 3) } end");
    const hook = fs.readFileSync(here('../Scripts/CATCC/crewtest_hook.lua'), 'utf8');
    expect(hook).toContain("if n:find('^catcc%-b%d') then return 'rider' end");
    expect(hook).toContain("local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_cockpit.lua')");
    expect(hook.match(/role\(p\) ~= 'driver' and role\(p\) ~= 'rider'/g)!.length).toBe(3);
    const demo = fs.readFileSync(here('../Scripts/CATCC/crewtest_demo.lua'), 'utf8');
    expect(demo).toContain("if tostring(q.name):find('^catcc%-b%d') then");
    expect(demo).toContain('{ ARG.canopy, a.canopy, ARG.canopyOpen }');
    expect(demo).toContain('canopy = 38, canopyOpen = 0.9');
    const ps = fs.readFileSync(here('../deck-test/crew-test/install.ps1'), 'utf8');
    expect(ps).toContain("@{ from = Join-Path $repoDcs 'Scripts\\CATCC\\crewtest_cockpit.lua'; to = Join-Path $scriptsDst 'crewtest_cockpit.lua' },");
    expect(ps).toContain("$said = & $python.Source -I (Join-Path $here 'model\\rider_pose.py') $headDir --dcs $DcsDir");
    // (made after the drivers' head, whose failure takes the whole blend_space folder away)
    expect(ps.indexOf("model\\rider_pose.py') $headDir")).toBeGreaterThan(ps.indexOf("model\\driver_pose.py') $headDir"));
  });
});
