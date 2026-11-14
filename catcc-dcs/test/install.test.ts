// The pilot mod's installer (pilot/install.ps1) run for real against stand-ins for the DCS files it
// patches, in a temp folder: what it copies, what it leaves out, the autoexec.cfg entries, and the two
// lines it adds to the Hornet's radio menu, which are then loaded under fengari and pressed.
// Windows only (PowerShell); skipped elsewhere.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const script = path.resolve(__dirname, '../pilot/install.ps1');
const windows = process.platform === 'win32';

// the parts of the Hornet's comm.lua the installer looks for, in the order DCS has them
const COMM = [
  "local g_crew_items = menus['Ground Crew'].items;",
  '',
  '-- Wheel Chocks',
  "menus['Wheel chocks'] = {",
  "\tname = _('Wheel chocks'),",
  '\titems = {',
  "\t\t[1] = {name = _('Place_'), \t\tcommand = sendMessage.new(Message.wMsgLeaderGroundToggleWheelChocks, true)},",
  "\t\t[2] = {name = _('Remove_'),\t\tcommand = sendMessage.new(Message.wMsgLeaderGroundToggleWheelChocks, false)}",
  '\t}',
  '}',
  "g_crew_items[#g_crew_items  + 1] = { name = _('Wheel chocks'), submenu = menus['Wheel chocks']}",
  '',
  "g_crew_items[#g_crew_items  + 1] = { name = _('Salute!'), command = sendMessage.new(Message.wMsgLeaderGroundGestureSalut, true)}",
  "g_crew_items[#g_crew_items  + 1] = { name = _('Request Launch'), command = sendMessage.new(Message.wMsgLeaderGroundRequestLaunch, true)}",
  '',
].join('\r\n');

const XML = [
  '<root>',
  '    <BehaviorTree ID="BehaviorTree">',
  '        <SequenceStar>',
  '            <Action ID="CheckCrewDataInt" condition="equal" name="client_status == 13" output_bb_key="" param_name="client_status" param_value="13"/>',
  '            <Action ID="PlayAnimation" animation_name="Sign_Launch1"/>',
  '        </SequenceStar>',
  '    </BehaviorTree>',
  '</root>',
  '',
].join('\n');

// the shape of Scripts/Speech/speech.lua around what the installer patches
const SPEECH = [
  'local base = _G',
  "module('speech')",
  'local finalPause = 1.0',
  '--The function is to be called from wMessage::buildContent_()',
  'function make(message)',
  '\treturn { text = "call " .. message.event, duration = finalPause }',
  'end',
  '',
].join('\r\n');

// the patched speech module loaded under fengari (module() as in Lua 5.1, minimal) and asked for calls
const speechHarness = `
local out = {}
local clockNow = 100
os.clock = function() return clockNow end
Message = { wMsgGroundCrewCopy = 1, wMsgGroundCrewWheelChocksOn = 2, wMsgGroundCrewWheelChocksOff = 3 }
local M = setmetatable({}, { __index = _G })
M.module = function() end -- the chunk already runs in M (fengari is Lua 5.3: no setfenv)
local chunk = assert(load(SPEECH_SRC, 'speech.lua', 't', M))
chunk()
local function call(ev) out[#out + 1] = ev .. (M.make({ event = ev }) and ' voiced' or ' silent') end
out[#out + 1] = 'flag ' .. tostring(M.catccQuiet)
call(1); call(2)
CATCC_CHOCKS = { quietUntil = clockNow + 20 }
call(1); call(2); call(3)
clockNow = clockNow + 21
call(1); call(2)
return table.concat(out, ' | ')
`;

function setup(autoexec?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-install-'));
  const dcs = path.join(root, 'dcs');
  const sg = path.join(root, 'sg');
  fs.mkdirSync(path.join(dcs, 'CoreMods/tech/USS_Nimitz/scripts'), { recursive: true });
  fs.mkdirSync(path.join(dcs, 'Mods/aircraft/FA-18C'), { recursive: true });
  fs.mkdirSync(path.join(dcs, 'Data'), { recursive: true });
  fs.mkdirSync(path.join(sg, 'Config'), { recursive: true });
  fs.writeFileSync(path.join(dcs, 'CoreMods/tech/USS_Nimitz/scripts/common.xml'), XML);
  fs.writeFileSync(path.join(dcs, 'Mods/aircraft/FA-18C/comm.lua'), COMM);
  fs.mkdirSync(path.join(dcs, 'Scripts/Speech'), { recursive: true });
  fs.writeFileSync(path.join(dcs, 'Scripts/Speech/speech.lua'), SPEECH);
  if (autoexec !== undefined) fs.writeFileSync(path.join(sg, 'Config/autoexec.cfg'), autoexec);
  const install = (...more: string[]) =>
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NoElevate', '-DcsPath', dcs, '-SavedGames', sg, ...more], { encoding: 'utf8' });
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  const has = (p: string) => fs.existsSync(path.join(root, p));
  return { root, install, read, has, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// the patched menu file, loaded the way DCS loads it, and pressed
const menuHarness = `
local out = {}
local function rec(s) out[#out + 1] = s end
local clockNow = 100
os = { clock = function() return clockNow end }
getfenv = function() return _G end     -- Lua 5.1's, as in DCS
print = function() end
_ = function(s) return s end
menus = { ['Ground Crew'] = { items = {} } }
Message = { wMsgLeaderGroundToggleWheelChocks = 'CHOCKS', wMsgLeaderGroundGestureSalut = 'SALUTE', wMsgLeaderGroundRequestLaunch = 'LAUNCH' }
sendMessage = { new = function(cmd, v) return { perform = function(self, p) rec('sent ' .. cmd .. ' ' .. tostring(v)) end } end }
selectAndTuneCommunicator = function() rec('tuned to the ground crew') end
assert(load(COMM_SRC, 'comm.lua'))()
local items = menus['Ground Crew'].items
local remove, salute, launch = menus['Wheel chocks'].items[2].command, items[2].command, items[3].command
local S = CATCC_CHOCKS
rec('items ' .. #items .. ' state ' .. type(S) .. ' salute line ' .. tostring(S.salPatched))
-- nobody holds anything: the stock requests
remove:perform({}); salute:perform({}); launch:perform({})
-- PriFly holds the chocks (the hook sets the flags and the time every second)
S.held, S.sal, S.at = true, true, clockNow
remove:perform({}); salute:perform({}); salute:perform({}); launch:perform({})
rec(string.format('kept remove=%d pending=%s salutes=%d', S.asked, tostring(S.pending), S.salAsked))
-- the hook goes quiet for 15 s: stock again
clockNow = clockNow + 16
remove:perform({}); salute:perform({})
-- what the hook asks for itself
S.place(); S.remove()
-- the pilot's own Place request ends the hook's quiet window (his crew's answer is voiced)
S.quietUntil = clockNow + 20
menus['Wheel chocks'].items[1].command:perform({})
rec('quiet after own place ' .. tostring(S.quietUntil))
return table.concat(out, '\\n')
`;

function pressMenu(comm: string): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(comm));
  lua.lua_setglobal(L, to_luastring('COMM_SRC'));
  const status = lauxlib.luaL_dostring(L, to_luastring(menuHarness));
  const out = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(out);
  return out.split('\n');
}

describe.skipIf(!windows)('CATCC pilot mod installer', () => {
  const t = setup('net.allow_dostring_in = {\n  "mission",\n}\n');
  const said = t.install('-Server', 'localhost');
  const comm = t.read('dcs/Mods/aircraft/FA-18C/comm.lua');
  const out = pressMenu(comm);

  it('copies the gate device and the hook, and none of the parked experiments', () => {
    expect(t.has('sg/Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua')).toBe(true);
    expect(t.has('sg/Scripts/Hooks/CATCC-pilot-hook.lua')).toBe(true);
    expect(t.read('sg/Config/CATCC-pilot.lua')).toContain("host = 'localhost'");
    expect(t.has('sg/Mods/aircraft/CATCC-Pilot/bin')).toBe(false);
    expect(t.has('sg/Mods/tech/CATCC-Chocks')).toBe(false);
    expect(fs.readdirSync(path.join(t.root, 'dcs/Data'))).toEqual([]);
  });
  it('adds the launch gate to the deck crew\'s launch sequence', () => {
    const xml = t.read('dcs/CoreMods/tech/USS_Nimitz/scripts/common.xml');
    expect(xml).toContain('<Fallback name="CATCC PriFly clearance">');
    expect(xml.indexOf('CATCC PriFly clearance')).toBeLessThan(xml.indexOf('Sign_Launch1'));
  });
  it('adds one line after the Wheel chocks menu and one after the Salute! item, and nothing else', () => {
    const lines = comm.split('\r\n');
    const ours = lines.filter((l) => l.includes('-- CATCC'));
    expect(ours).toHaveLength(2);
    expect(lines.filter((l) => !l.includes('-- CATCC')).join('\r\n')).toBe(COMM);
    expect(lines[lines.findIndex((l) => l.includes("submenu = menus['Wheel chocks']}")) + 1]).toBe(ours[0]);
    expect(lines[lines.findIndex((l) => l.includes('wMsgLeaderGroundGestureSalut')) + 1]).toBe(ours[1]);
    expect(said).toContain('Hornet chocks and salute routed through PriFly');
  });
  it('leaves the menu working as stock while PriFly holds nothing', () => {
    expect(out[0]).toBe('items 3 state table salute line true');
    expect(out.slice(1, 4)).toEqual(['sent CHOCKS false', 'sent SALUTE true', 'sent LAUNCH true']);
  });
  it('keeps Remove and Salute! while PriFly holds the chocks, counts them for the hook, and leaves Request Launch alone', () => {
    expect(out.slice(4, 6)).toEqual(['sent LAUNCH true', 'kept remove=1 pending=true salutes=2']);
  });
  it('is stock again when the hook has been quiet for 15 s', () => {
    expect(out.slice(6, 8)).toEqual(['sent CHOCKS false', 'sent SALUTE true']);
  });
  it('gives the hook a way to ask the ground crew for chocks and to have them removed', () => {
    expect(out.slice(8, 12)).toEqual(['tuned to the ground crew', 'sent CHOCKS true', 'tuned to the ground crew', 'sent CHOCKS false']);
  });
  it('ends the hook\'s quiet window when the pilot asks for chocks himself (his crew\'s answer is voiced)', () => {
    expect(out.slice(12)).toEqual(['sent CHOCKS true', 'quiet after own place nil']);
  });
  it('lets the hook reach the F8 menu: autoexec.cfg gets what DCS asks for, existing entries kept', () => {
    const cfg = t.read('sg/Config/autoexec.cfg');
    expect(cfg).toContain('net.allow_dostring_in = {\n  "mission", "server"\n}');
    expect(cfg).toContain('net.allow_unsafe_api = {"userhooks"} -- CATCC');
    expect(said).toContain('autoexec.cfg now lets the hook reach the F8 menu');
  });
  it('changes nothing when run again', () => {
    const cfg = t.read('sg/Config/autoexec.cfg');
    const xml = t.read('dcs/CoreMods/tech/USS_Nimitz/scripts/common.xml');
    const again = t.install('-Server', 'localhost');
    expect(t.read('dcs/Mods/aircraft/FA-18C/comm.lua')).toBe(comm);
    expect(t.read('dcs/CoreMods/tech/USS_Nimitz/scripts/common.xml')).toBe(xml);
    expect(t.read('sg/Config/autoexec.cfg')).toBe(cfg);
    expect(again).not.toContain('autoexec.cfg now');
  });
  it('installs the parked experiments only when asked', () => {
    t.install('-Experiments');
    expect(t.has('sg/Mods/aircraft/CATCC-Pilot/bin/catcc_chocks.dll')).toBe(true);
    expect(t.has('sg/Mods/tech/CATCC-Chocks/entry.lua')).toBe(true);
    expect(fs.readdirSync(path.join(t.root, 'dcs/Data')).sort()).toEqual(['CATCC_Block.csv', 'CATCC_Chock.csv', 'CATCC_Wall.csv']);
    t.install();
    expect(t.has('sg/Mods/aircraft/CATCC-Pilot/bin')).toBe(false);
    expect(t.has('sg/Mods/tech/CATCC-Chocks')).toBe(false);
    expect(fs.readdirSync(path.join(t.root, 'dcs/Data'))).toEqual([]);
  });
  it('makes the crew\'s chock calls silent only in the hook\'s quiet window, adding two marked lines to speech.lua', () => {
    const sp = t.read('dcs/Scripts/Speech/speech.lua');
    const lines = sp.split('\r\n');
    expect(lines.filter((l) => l.includes('-- CATCC'))).toHaveLength(2);
    expect(lines.filter((l) => !l.includes('-- CATCC')).join('\r\n')).toBe(SPEECH);
    expect(said).toContain('crew chock calls silent for the mod');
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lua.lua_pushstring(L, to_luastring(sp));
    lua.lua_setglobal(L, to_luastring('SPEECH_SRC'));
    const status = lauxlib.luaL_dostring(L, to_luastring(speechHarness));
    const r = lua.lua_tojsstring(L, -1) as string;
    if (status !== 0) throw new Error(r);
    expect(r).toBe('flag true | 1 voiced | 2 voiced | 1 silent | 2 silent | 3 voiced | 1 voiced | 2 voiced');
  });
  it('uninstalls: the DCS files are stock again, its autoexec line is gone, the pilot\'s own entries stay', () => {
    t.install('-Uninstall');
    expect(t.read('dcs/Mods/aircraft/FA-18C/comm.lua')).toBe(COMM);
    expect(t.read('dcs/Scripts/Speech/speech.lua')).toBe(SPEECH);
    expect(t.read('dcs/CoreMods/tech/USS_Nimitz/scripts/common.xml')).toBe(XML);
    expect(t.has('sg/Mods/aircraft/CATCC-Pilot')).toBe(false);
    expect(t.has('sg/Scripts/Hooks/CATCC-pilot-hook.lua')).toBe(false);
    const cfg = t.read('sg/Config/autoexec.cfg');
    expect(cfg).not.toContain('CATCC');
    expect(cfg).toContain('"mission", "server"');
    t.done();
  });
  it('writes autoexec.cfg when there is none, and leaves a complete one alone', () => {
    const none = setup();
    none.install();
    expect(none.read('sg/Config/autoexec.cfg')).toBe(
      'net.allow_unsafe_api = {"userhooks"} -- CATCC: the pilot hook reaches the F8 menu\r\n' +
      'net.allow_dostring_in = {"server"} -- CATCC: the pilot hook reaches the F8 menu\r\n');
    none.done();
    const full = 'net.allow_unsafe_api = {"userhooks"}\r\nnet.allow_dostring_in = {"mission", "server"}\r\n';
    const complete = setup(full);
    complete.install();
    expect(complete.read('sg/Config/autoexec.cfg')).toBe(full);
    complete.done();
  });
});
