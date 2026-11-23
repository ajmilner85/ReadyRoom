// The ATC probe (deck-test/spawn-probe): can the carrier's air traffic control be told which spawn spot a client's
// dynamic spawn gets?
//   * every DCS function the native module looks up by name really is exported by the DLL it names (when this PC
//     has DCS installed), in both of DCS's program folders;
//   * the hook, end to end under fengari: stage A and the rounds against stand-ins for DCS, the mission scripting state and
//     the native module (deck-test/spawn-probe/test/standins.lua). The module has its own self-test, run by
//     native/build.cmd.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const here = (p: string) => path.resolve(__dirname, p);
const DCS = 'C:/Program Files/Eagle Dynamics/DCS World';
const cpp = fs.readFileSync(here('../deck-test/spawn-probe/native/catcc_atcprobe.cpp'), 'utf8');
const hookSrc = fs.readFileSync(here('../deck-test/spawn-probe/CATCC-atcprobe-hook.lua'), 'utf8');
const standins = fs.readFileSync(here('../deck-test/spawn-probe/test/standins.lua'), 'utf8');
const routesSrc = fs.readFileSync(here('../Scripts/CATCC/crewtest_routes.lua'), 'utf8').replace(/\r\n/g, '\n');

/** the names a PE file exports */
function peExports(file: string): Set<string> {
  const d = fs.readFileSync(file);
  const pe = d.readUInt32LE(0x3c);
  const nsec = d.readUInt16LE(pe + 6);
  const opt = pe + 24;
  const dd = opt + (d.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const so = opt + d.readUInt16LE(pe + 20);
  const secs: { va: number; size: number; raw: number }[] = [];
  for (let i = 0; i < nsec; i++) {
    const o = so + 40 * i;
    secs.push({ va: d.readUInt32LE(o + 12), size: Math.max(d.readUInt32LE(o + 8), d.readUInt32LE(o + 16)), raw: d.readUInt32LE(o + 20) });
  }
  const off = (rva: number) => {
    const s = secs.find((x) => rva >= x.va && rva < x.va + x.size);
    if (!s) throw new Error('rva outside sections');
    return s.raw + rva - s.va;
  };
  const e = off(d.readUInt32LE(dd));
  const n = d.readUInt32LE(e + 24);
  const names = off(d.readUInt32LE(e + 32));
  const out = new Set<string>();
  for (let i = 0; i < n; i++) {
    const o = off(d.readUInt32LE(names + 4 * i));
    out.add(d.toString('latin1', o, d.indexOf(0, o)));
  }
  return out;
}

/** runs the stand-ins with a script; what the probe logged, what it said in the chat, the native calls, RESULT */
function run(script: string, hook = hookSrc) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries({ HOOK_SRC: hook, ROUTES_SRC: routesSrc, SCRIPT: script })) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  if (lauxlib.luaL_dostring(L, to_luastring(standins)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
  lua.lua_getglobal(L, to_luastring('OUT'));
  const [log, rest] = (lua.lua_tojsstring(L, -1) as string).split('\n@@CHAT\n');
  const [chat, rest2] = rest.split('\n@@CALLS\n');
  const [calls, result] = rest2.split('\n@@RESULT\n');
  return { log, lines: log.split('\n'), chat: chat.split('\n'), calls: calls.split('\n'), result };
}
/** the hook with one of its settings changed */
function withSetting(line: RegExp, to: string): string {
  expect(hookSrc).toMatch(line);
  return hookSrc.replace(line, to);
}

describe('ATC probe: native module', () => {
  const syms = [...cpp.matchAll(/\{"([\w.]+\.dll)", "([^"]+)", &s_\w+, "([^"]+)"\}/g)].map((m) => ({ dll: m[1], name: m[2] }));
  it('looks up its DCS functions through one table', () => {
    expect(syms.length).toBeGreaterThanOrEqual(30);
    // (nothing else in the module asks a DLL for a function by name, but Lua's own from lua.dll)
    expect(cpp.match(/GetProcAddress\(/g)!.length).toBe(2);
  });
  for (const bin of ['bin', 'bin-mt']) {
    for (const dll of ['edObjects.dll', 'Flight.dll', 'Transport.dll']) {
      it.skipIf(!fs.existsSync(`${DCS}/${bin}/${dll}`))(`${bin}/${dll} exports every name the module looks up in it`, () => {
        const exp = peExports(`${DCS}/${bin}/${dll}`);
        const mine = syms.filter((s) => s.dll === dll);
        expect(mine.length).toBeGreaterThan(0);
        expect(mine.filter((s) => !exp.has(s.name)).map((s) => s.name)).toEqual([]);
      });
    }
  }
  it('the three calls of the slot picker: aim, restore, and the read-only pre-check', () => {
    for (const fn of ['{"aim", l_aim}', '{"restore", l_restorelifts}', '{"check", l_check}']) expect(cpp).toContain(fn);
    // the pre-check asks DCS's own functions and writes nothing: no procInitTerminals, no memory write in it
    const check = cpp.slice(cpp.indexOf('static int checkOneRaw('), cpp.indexOf('static const char *checkWhy('));
    expect(check).toContain('s_obstr');
    expect(check).toContain('termRead(');
    expect(check).not.toMatch(/s_initTerms|wr\(|s_acquire|s_free\b|s_spawnOn/);
    // what it could not ask counts as not usable
    expect(cpp).toMatch(/static bool checkUsable\(const CheckOut &o\) \{ return o\.isFree == 1 && o\.client == 0 && o\.hasObj == 0 && o\.obstructed == 0; \}/);
    // numbers 1 to 4 are lifted only when asked, and the floor goes back to 5 after the call
    expect(cpp).toMatch(/g_aimFloor = \(fromOne && mode != 2\) \? 1 : 5;\s+int e = aimRaw\(g_atc, \(int\)t, mode, allowWrite, &o\);\s+g_aimFloor = 5;/);
  });
  it('keeps user paths and names out of the sources', () => {
    for (const src of [cpp, hookSrc, standins]) expect(src).not.toMatch(/C:\\Users\\|C:\/Users\//);
    // (no byte order mark: DCS's Lua cannot load a file that starts with one)
    expect(hookSrc.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('ATC probe: the hook, round 9 (the first spawn of the mission aimed: one case a mission start, kept in a file)', () => {
  const SHIP = 16777473;
  const results = (r: ReturnType<typeof run>) => r.lines.filter((l) => /^00:00:00 {3}RESULT round \d+ /.test(l)).map((l) => /ON THE TARGET/.test(l));
  const changing = (r: ReturnType<typeof run>) => r.calls.filter((c) => !/^(attach|canspawn|termbyclient|forced|undo)[(]/.test(c) && c !== '');
  const FILE = `(CASEFILE or ''):gsub('\\n', ';')`;

  it('what the hook may change DCS with: aim and restore; one chooser call, in case 3 only; the settings of old off', () => {
    expect(hookSrc).toMatch(/^local RESTORE_BY_POKE = false$/m);
    expect(hookSrc).toMatch(/^local HOLD_WITHOUT_RELEASE = false$/m);
    expect(hookSrc).toContain("N('aim'");
    expect(hookSrc).toContain("N('restore'");
    expect(hookSrc.match(/N\('spawnonmiss'/g)!.length).toBe(1);
    for (const gone of ['initrows', "N('acquire'", "N('termstatus'", "N('atccall'", "N('poke'", "N('waitspawn'", "N('setorder'"]) expect(hookSrc).not.toContain(gone);
    // no case lifts by + 100 as a first spawn without the priming before it
    const cases = hookSrc.slice(hookSrc.indexOf('local CASES = {'), hookSrc.indexOf('-- after a case'));
    expect(cases.match(/mode = 'up'/g)!.length).toBe(1);
    expect(cases).toMatch(/mode = 'up', prime = true, ifNoneLanded = true/);
  });

  it('start 1: case "low" is the first spawn; it lands, and the same mission goes on with spot 20 and the spawn-only spots 36 and 40', () => {
    const r = run(`boot() advance(70) RESULT = playerSpot() .. ' ' .. state() .. ' ' .. OUT_OF_TABLE .. ' ' .. ${FILE}`);
    const at = (s: string) => r.lines.findIndex((l) => l.includes(s));
    expect(r.log).toContain('the cases so far: 1 low: not run yet; 2 neg: not run yet; 3 prime: not run yet');
    expect(r.log).toContain('THIS MISSION START RUNS CASE 1 of 3 ("low")');
    expect(r.log).toMatch(/ROUND 1 of 1: case 1, the first spawn of the mission: aim\(24, low\); aim: spot 24 /);
    // the numbers before the target all become 4
    expect(r.log).toContain('the round set: aim(spot 24, low): 19 numbers lifted through procInitTerminals, 0 written directly');
    expect(r.log).toMatch(/after aim: #5 \(.*\): .* \+0x8c=5 \+0x94=0 {2}-> {2}.* \+0x8c=4 \+0x94=0/);
    expect(r.chat[0]).toMatch(/^CATCC test: ready \(round 1 of 1\)\. Take a Hornet slot on CVN-71 now\. Aim: [^.]+\. Case 1 of 3 \("low"\): the first spawn of the mission\. THIS SPAWN MAY FREEZE DCS\.$/);
    // the case file: "started" before DCS spawns, "done landed" once the aircraft is there
    expect(at('the case file: case 1 started')).toBeGreaterThan(at('round 1: slot 1000003 asked for by player 1'));
    expect(at('the case file: case 1 started')).toBeLessThan(at('the slot request is answered: back to DCS'));
    expect(r.log).toMatch(/ROUND 1 RESULT \[case 1, the first spawn of the mission: aim\(24, low\)\]: the jet stood on spot 24 \(.*\): ON THE TARGET/);
    expect(r.log).toContain('CASE 1 (low) LANDED: 3 more rounds follow in this mission, in the same mode');
    // the rounds that follow, in the same mode; the write only where a round asks for it
    expect(changing(r)).toEqual([
      `aim(${SHIP},24,low,false)`, `restore(${SHIP})`,
      `aim(${SHIP},20,low,false)`, `restore(${SHIP})`,
      `aim(${SHIP},36,low,true)`, `restore(${SHIP})`,
      `aim(${SHIP},40,low,true)`, `restore(${SHIP})`,
    ]);
    expect(r.log).toContain('the round set: aim(spot 36, low, writes allowed): 27 numbers lifted through procInitTerminals, 4 written directly, 0 spawn-only spots still in the way');
    expect(r.log).toContain('the round set: aim(spot 40, low, writes allowed): 27 numbers lifted through procInitTerminals, 8 written directly, 0 spawn-only spots still in the way');
    expect(r.log).toMatch(/after aim: #32 \(.*Term_Index -1.*\): .* \+0x8c=32 \+0x94=0 {2}-> {2}.* \+0x8c=4 \+0x94=0/);
    expect(results(r)).toEqual([true, true, true, true]);
    expect(r.chat[1]).toMatch(/^CATCC test: round 1: ON THE TARGET\. Release the slot and spawn again \(round 2 of 4\)\. Aim: [^.]+\.$/);
    // the rounds with the direct write warn too; the plain one after a landed first spawn does not
    expect(r.chat[2]).toMatch(/round 3 of 4\)\. Aim: [^.]+\. THIS SPAWN MAY FREEZE DCS\.$/);
    expect(r.chat[3]).toMatch(/round 4 of 4\)\. Aim: [^.]+\. THIS SPAWN MAY FREEZE DCS\.$/);
    expect(r.lines.filter((l) => l.includes("every terminal's number reads as at stage A") && !l.startsWith('DCSLOG')).length).toBe(4);
    // the trace of round 8 is kept
    expect(r.log).toContain('    > native.aim');
    expect(r.log).toContain('frame 1 after the slot request (the hook runs)');
    expect(r.log).toContain('second 1 after the slot request: the hook runs, no aircraft yet');
    // the last jet on spot 40; nothing left lifted; no number was ever outside the spawn table
    expect(r.result).toBe('40 0/0/0 0 case 1 started;case 1 done landed;');
    expect(r.log).not.toContain('ERROR');
  });

  it('the next mission starts: case "neg" freezes DCS at its first spawn; the start after finds it unfinished, marks it frozen and does not run it again', () => {
    const r = run(`boot() advance(70)
      restart() advance(40) local frozen = tostring(FROZEN) .. ' ' .. ${FILE}
      restart() advance(40) RESULT = frozen .. ' | ' .. tostring(FROZEN) .. ' ' .. state() .. ' ' .. ${FILE}`);
    expect(r.log).toContain('the cases so far: 1 low: done landed; 2 neg: not run yet; 3 prime: not run yet');
    expect(r.log).toContain('THIS MISSION START RUNS CASE 2 of 3 ("neg")');
    expect(r.calls).toContain(`aim(${SHIP},24,neg,false)`);
    // (the frozen start wrote "started" and nothing after it)
    expect(r.result.split(' | ')[0]).toBe('true case 1 started;case 1 done landed;case 2 started;');
    // the third start
    expect(r.log).toContain('case 2 (neg) was started on an earlier mission start and never finished: DCS FROZE on it; it is not run again');
    expect(r.log).toContain('case 3 (prime) is only for when no case before it landed: left out');
    expect(r.log).toContain('every case has been run (or left out): nothing is aimed in this mission start.');
    expect(r.chat[r.chat.length - 1]).toBe('CATCC test: every case has been run. Nothing is aimed in this mission.');
    expect(r.result.split(' | ')[1]).toBe('false 0/0/0 case 1 started;case 1 done landed;case 2 started;case 2 froze;');
    // (the third start aimed nothing)
    expect(r.calls.filter((c) => c.startsWith('aim(')).length).toBe(5);
  });

  it('"low" freezes and "neg" lands: the second start goes on with the rounds that follow, in the negative mode', () => {
    const r = run(`OPT.lowFreezes = true OPT.negOk = true boot() advance(40)
      restart() advance(70) RESULT = playerSpot() .. ' ' .. state() .. ' ' .. ${FILE}`);
    expect(r.log).toContain('case 1 (low) was started on an earlier mission start and never finished: DCS FROZE on it');
    expect(r.log).toContain('CASE 2 (neg) LANDED: 3 more rounds follow in this mission, in the same mode');
    expect(changing(r).slice(1)).toEqual([
      `aim(${SHIP},24,neg,false)`, `restore(${SHIP})`,
      `aim(${SHIP},20,neg,false)`, `restore(${SHIP})`,
      `aim(${SHIP},36,neg,true)`, `restore(${SHIP})`,
      `aim(${SHIP},40,neg,true)`, `restore(${SHIP})`,
    ]);
    expect(r.result).toBe('40 0/0/0 case 1 started;case 1 froze;case 2 started;case 2 done landed;');
  });

  it('neither lands: the third start asks DCS\'s chooser once and gives back what it took, then aims as runs 6 and 8 did', () => {
    const r = run(`OPT.lowFreezes = true OPT.primeWorks = true boot() advance(40)
      restart() advance(40)
      restart() advance(70) RESULT = playerSpot() .. ' ' .. state() .. ' ' .. ${FILE}`);
    expect(r.log).toContain('THIS MISSION START RUNS CASE 3 of 3 ("prime")');
    expect(r.log).toMatch(/ROUND 1 of 1: case 3, the first spawn of the mission: the chooser asked once and given back, then aim\(24, up\)/);
    expect(r.log).toMatch(/PRIMED: the chooser asked once \(id 900001\): it gave #5 \(.*\); given back: done, every terminal reads as at stage A/);
    const third = r.calls.slice(r.calls.lastIndexOf(`attach(${SHIP})`));
    expect(third.filter((c) => /^(snapstate|spawnonmiss|release|initterms|aim)\(/.test(c)).slice(0, 5)).toEqual([
      'snapstate()', 'spawnonmiss(900001,FA-18C_hornet,16000)', 'release(5)', 'initterms(5)', `aim(${SHIP},24,up,false)`,
    ]);
    expect(r.calls.filter((c) => c.startsWith('spawnonmiss(')).length).toBe(1);
    expect(r.log).toContain('CASE 3 (prime) LANDED');
    expect(r.calls).toContain(`aim(${SHIP},40,up,true)`);
    expect(r.result).toBe('40 0/0/0 case 1 started;case 1 froze;case 2 started;case 2 froze;case 3 started;case 3 done landed;');
  });

  it('a case that did not freeze but missed, or was stopped before its aircraft: missed is settled, stopped is run again', () => {
    // (a spawn that does not go by the numbers: it stands elsewhere: the case is done, and the next start runs the next)
    let r = run(`OPT.numbersIgnored = true boot() advance(40) restart() advance(5) RESULT = ${FILE}`);
    expect(r.log).toContain('CASE 1 (low) did not land. Host the mission again for the next case.');
    expect(r.log).toContain('THIS MISSION START RUNS CASE 2 of 3 ("neg")');
    expect(r.result).toBe('case 1 started;case 1 done missed;');
    // the simulation stopped after the slot was asked for, before the aircraft: not a freeze
    r = run(`boot() advance(13.5) stop() local mid = ${FILE} restart() advance(15) RESULT = mid .. ' | ' .. state()`);
    expect(r.log).toContain('the case file: case 1 stopped before its aircraft appeared: it is run again');
    expect(r.result.split(' | ')[0]).toBe('case 1 started;case 1 stopped;');
    expect(r.lines.filter((l) => l.startsWith('00:00:00 THIS MISSION START RUNS CASE 1 of 3')).length).toBe(2);
    // the mission ended without anyone asking for a slot: nothing in the file, the case is run again; what was lifted is restored
    r = run(`boot() advance(11, false) local mid = state() stop() RESULT = mid .. ' ' .. state() .. ' [' .. ${FILE} .. ']'`);
    expect(r.result).toBe('0/19/0 0/0/0 []');
  });

  it('the stand-ins hold what the runs showed: the place comes from the number; a first spawn with a number outside the table freezes; later spawns do not', () => {
    let r = run(`NATIVE_SETUP()
      NATIVE_T.initrows('24,-,5,-;5,-,24,-')
      spawnPlayer('1000001')
      RESULT = playerSpot() .. ' ' .. tostring(TERMS[24].obj) .. ' ' .. tostring(TERMS[5].obj)`);
    expect(r.result).toBe('5 true false');
    // run 7: aim(24, up) as the first spawn; run 8: the same after a plain spawn
    r = run(`NATIVE_SETUP()
      NATIVE_T.aim(${SHIP}, 24, 'up', false)
      local a = spawnPlayer('1000001')
      RESULT = tostring(a) .. ' ' .. tostring(FROZEN)`);
    expect(r.result).toBe('false true');
    r = run(`NATIVE_SETUP()
      spawnPlayer('1000001') removePlayer()
      NATIVE_T.aim(${SHIP}, 24, 'up', false)
      local a = spawnPlayer('1000002')
      RESULT = tostring(a) .. ' ' .. tostring(FROZEN) .. ' ' .. playerSpot()`);
    expect(r.result).toBe('true false 24');
  });

  it('the slot refused by another hook: the user is asked again; the case stays open, not frozen', () => {
    const r = run(`OPT.refuse = 1 boot() advance(150) RESULT = ${FILE}`);
    expect(r.log).toContain('no aircraft appeared in 120 s after slot 1000003 was asked for');
    expect(r.chat).toContain('CATCC test: no aircraft appeared. Take a slot again (round 1 of 1).');
    expect(r.log).toMatch(/ROUND 1 RESULT \[case 1, .*\]: the jet stood on spot 24 \(.*\): ON THE TARGET/);
    expect(r.result).toBe('case 1 started;case 1 started;case 1 done landed;');
  });

  it('WRITE_SPAWN_ONLY_NUMBERS off: nothing is written directly, and the rounds for spots 36 and 40 are not asked of the user', () => {
    const r = run(`boot() advance(70) RESULT = playerSpot() .. ' ' .. state()`, withSetting(/^local WRITE_SPAWN_ONLY_NUMBERS = true$/m, 'local WRITE_SPAWN_ONLY_NUMBERS = false'));
    expect(r.calls).toContain(`aim(${SHIP},36,low,false)`);
    expect(r.calls.filter((c) => /^aim\(.*,true\)$/.test(c))).toEqual([]);
    expect(r.log).toContain('THE TARGET IS NOT THE NEXT SPOT (4 spawn-only spots in the way, 0 numbers not as wanted): this round is not asked of the user');
    expect(results(r)).toEqual([true, true, false, false]);
    expect(r.result).toBe('20 0/0/0');
  });

  it('the "slot per spot" mission: watch only in this round; the case file is not touched', () => {
    const r = run(`OPT.mission = 'Deck Spotting Test - slot per spot' OPT.slots = { '233', '210' } boot() advance(40) RESULT = playerSpot() .. ' ' .. state() .. ' [' .. ${FILE} .. ']'`);
    expect(r.log).toContain('mode: mission slots (watch mode)');
    expect(r.chat[0]).toBe('CATCC test: ready (round 1 of 1). Take a Hornet slot on CVN-71 now.');
    expect(r.log).toMatch(/ROUND 1 RESULT \[watch only: nothing set\]: the jet stood on spot 33 \(.*\): the slot's own spot/);
    expect(changing(r)).toEqual([]);
    expect(r.result).toBe('33 0/0/0 []');
  });

  it('no native module, or no terminal list: stage A fails and the rest is skipped; other missions are left alone', () => {
    let r = run(`OPT.noNative = true boot() advance(60) RESULT = ${FILE}`);
    expect(r.log).toContain('STAGE A FAILED: the native module is not loaded (Scripts\\CATCC\\bin\\catcc_atcprobe.dll): The specified module could not be found.');
    expect(r.log).toContain('THE ROUNDS ARE SKIPPED: stage A failed');
    expect(r.chat).toEqual(['']);
    expect(r.result).toBe('');
    r = run(`OPT.badList = true boot() advance(60) DCSTRY('1000003') RESULT = state()`);
    expect(r.log).toContain('STAGE A FAILED: the terminal list could not be walked');
    expect(changing(r)).toEqual([]);
    for (const opt of [`OPT.mission = 'Caucasus free flight'`, 'OPT.server = false', 'OPT.mp = false']) {
      r = run(`${opt} boot() advance(30) DCSTRY('1000003') stop() RESULT = ${FILE}`);
      expect(r.log).toMatch(/nothing is done/);
      expect(r.calls).toEqual(['']);
      expect(r.chat).toEqual(['']);
      expect(r.result).toBe('');
    }
    // (the mission file's folder, which holds the user's name, is not written to the log)
    expect(run(`boot() advance(1) RESULT = ''`).log).not.toContain('X:/Missions');
  });
});
