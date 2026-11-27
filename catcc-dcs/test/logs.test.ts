// CATCC live logs: the DCS side (Scripts/CATCC/catcc_logs.lua under fengari, with a made-up Logs folder and network:
// logs-run.lua) and what SDOBot takes (SDOBot/lib/catccLogIntake.js).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari ships no types
import { lauxlib, lua, lualib, to_luastring } from 'fengari';

const dir = path.resolve(__dirname, '..');
const repo = path.resolve(dir, '..');
const read = (p: string) => fs.readFileSync(path.join(dir, p), 'utf8');

function run(): Map<string, string[]> {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(read('Scripts/CATCC/catcc_logs.lua')));
  lua.lua_setglobal(L, to_luastring('LOGS_SRC'));
  const status = lauxlib.luaL_dostring(L, to_luastring(read('test/logs-run.lua')));
  const text = lua.lua_tojsstring(L, -1) as string;
  if (status !== 0) throw new Error(text);
  // (a request's body is %q-quoted: its newlines are "\" + newline; put them back as \n)
  const out = new Map<string, string[]>();
  let last: string[] | undefined;
  for (const line of text.split('\n')) {
    const i = line.indexOf('\t');
    if (i < 0 && last) {
      last[last.length - 1] += '\n' + line;
      continue;
    }
    const label = line.slice(0, i);
    if (!out.has(label)) out.set(label, []);
    last = out.get(label)!;
    last.push(line.slice(i + 1));
  }
  for (const v of out.values()) for (let k = 0; k < v.length; k++) v[k] = v[k].replace(/\\\n/g, '\\n');
  return out;
}

const R = run();
const get = (label: string) => R.get(label) ?? [];
const SESSION = '20261126-120000-abcdef';
const PREV = '20261125-200000-000001';
const FLY = '10.0.0.11:80';
const HOME = '127.0.0.1:3001';

describe('CATCC live logs: the DCS hook', () => {
  it('sends whole lines with the profile folder replaced, a chunk per request, with its headers', () => {
    expect(get('basic head')).toEqual(['POST /api/catcc/logs HTTP/1.1 | fly.example | Bearer 0123456789abcdef0123456789abcdef | text/plain; charset=utf-8 | 82=82 | close']);
    expect(get('basic')).toEqual([
      `${FLY} ${SESSION} dcs.log 0 TESTPC "one\\nloading %USERPROFILE%\\\\Saved Games\\\\DCS\\\\x.lua and %USERPROFILE%/Saved Games/DCS\\n"`,
      `${FLY} ${SESSION} catcc-crewtest.log 4 TESTPC "new line\\n"`,
      `${FLY} ${SESSION} dcs.log 84 TESTPC "partial\\n"`,
    ]);
    expect(get('basic log')).toEqual([
      `CATCC logs: session ${SESSION} on TESTPC: sending dcs.log, catcc-crewtest.log to http://fly.example/api/catcc/logs`,
      'CATCC logs: stored by http://fly.example/api/catcc/logs',
    ]);
    // what was sent, by file offset (the raw bytes, not the replaced text), for the next start
    expect(get('basic state')[0]).toBe(`return { session = "${SESSION}", started = 1100, files = { ["catcc-crewtest.log"] = 13, ["dcs.log"] = 92, } }\n`);
    expect(get('basic dns')).toEqual(['1']);
  });

  it('holds a line without its end for 10 s, then sends it as it is', () => {
    expect(get('held')).toEqual(['0', `${FLY} ${SESSION} dcs.log 0 TESTPC "no end yet"`]);
  });

  it('tries the next address when one fails, and keeps the one that works', () => {
    expect(get('fallback')).toEqual([
      `${FLY} ${SESSION} dcs.log 0 TESTPC "a\\n"`,
      `${HOME} ${SESSION} dcs.log 0 TESTPC "a\\n"`,
      `${HOME} ${SESSION} dcs.log 2 TESTPC "b\\n"`,
    ]);
    expect(get('fallback log')).toContain('CATCC logs: http://fly.example/api/catcc/logs: HTTP 404 (that SDOBot has no /api/catcc/logs yet): nope');
  });

  it('waits 5 s, then 15 s, when every address fails, and sends the same chunk again', () => {
    expect([get('backoff 4.5 s'), get('backoff 5.5 s'), get('backoff 19.5 s')]).toEqual([['1'], ['2'], ['2']]);
    expect(get('backoff')).toEqual([
      `${HOME} ${SESSION} dcs.log 0 TESTPC "x\\n"`,
      `${HOME} ${SESSION} dcs.log 0 TESTPC "x\\n"`,
      `${HOME} ${SESSION} dcs.log 0 TESTPC "x\\n"`,
      `${HOME} ${SESSION} dcs.log 2 TESTPC "y\\n"`,
    ]);
    expect(get('backoff log')).toEqual(expect.arrayContaining([
      'CATCC logs: http://fly.example/api/catcc/logs: no connection (connection refused)',
      'CATCC logs: http://127.0.0.1:3001/api/catcc/logs: HTTP 503 (that SDOBot has no CATCC_LOG_TOKEN): nope',
    ]));
  });

  it('gives a connection 5 s', () => {
    expect(get('hang')).toEqual([`${HOME} ${SESSION} dcs.log 0 TESTPC "z\\n"`]);
    expect(get('hang log')).toContain('CATCC logs: http://fly.example/api/catcc/logs: no connection in 5 s');
  });

  it('sends what the previous run left (dcs.log.old, the rest of catcc-*.log) under that run\'s session', () => {
    expect(get('left')).toEqual([
      `${FLY} ${PREV} dcs.log 4 TESTPC "last words\\n"`,
      `${FLY} ${SESSION} dcs.log 0 TESTPC "new\\n"`,
      `${FLY} ${PREV} catcc-crewtest.log 4 TESTPC "unsent\\n"`,
      `${FLY} ${SESSION} catcc-crewtest.log 11 TESTPC "this run\\n"`,
    ]);
    expect(get('left log')[0]).toContain(`and what was left of session ${PREV}: dcs.log 1 KB, catcc-crewtest.log 1 KB`);
    // a dcs.log.old from before that run is not its own
    expect(get('stale')).toEqual([`${FLY} ${SESSION} dcs.log 0 TESTPC "new\\n"`]);
  });

  it('halves its chunks when the server finds them too big (413), losing nothing', () => {
    expect(get('413')).toEqual(['0+2000 2000+2000 4000+2000 6000+2000 8000+1000 = 9000 of 9000; chunk now 2048; 7 requests']);
  });

  it('stops a file at its limit for the session, saying so once', () => {
    expect(get('cap')).toEqual([
      `${FLY} ${SESSION} dcs.log 0 TESTPC "aaaaaaaaa\\nbbbbbbbbb\\n"`,
      `${FLY} ${SESSION} dcs.log 20 TESTPC "[CATCC logs: dcs.log reached 0 MB in this session: the rest of it is not sent]\\n"`,
    ]);
  });

  it('takes up a catcc-*.log made during the session, and one made again, from its start', () => {
    expect(get('new')).toEqual([
      `${FLY} ${SESSION} catcc-new.log 0 TESTPC "first\\n"`,
      `${FLY} ${SESSION} catcc-crewtest.log 0 TESTPC "again\\n"`,
    ]);
  });

  it('is off without a token or an http:// address, and looks addresses up only where that may block', () => {
    expect(get('off')).toEqual([]);
    expect(get('off log')).toEqual([
      'CATCC logs: https://fly.example/x: https is not possible from DCS (its Lua has no TLS): use http://',
      'CATCC logs: off: no http:// address in Config/CATCC-logs.lua',
      'CATCC logs: off: no token in Config/CATCC-logs.lua',
    ]);
    expect(get('in mission')).toEqual(['0 requests, 0 lookups']);
    expect(get('outside')).toEqual(['1 requests, 1 lookups']);
    expect(get('no address')).toEqual([`${HOME} ${SESSION} dcs.log 0 TESTPC "a\\n"`]);
    expect(get('no address log')).toContain('CATCC logs: http://nowhere.invalid/x: no address for nowhere.invalid (host not found)');
  });

  it('flushes what is waiting at once, when asked (the end of a mission without ticks outside one)', () => {
    expect(get('flush')).toEqual(['2 requests in 0.04 s; pending false']);
  });

  it('in DCS: starts from Config\\CATCC-logs.lua, runs on DCS\'s GUI update (the menu too), and is off without it', () => {
    const boot = get('boot');
    expect(boot).toHaveLength(2);
    const id = /^127\.0\.0\.1:3001 (\d{8}-\d{6}-[0-9a-f]{6}) dcs\.log (\d+) BOOTPC "(.*)"$/s;
    expect(boot.map((b) => b.replace(id, '$2 $3'))).toEqual(['0 boot line\\n', '10 in the mission\\n']);
    const session = id.exec(boot[0])![1];
    expect(get('boot dcs.log')).toEqual([
      `CATCC logs: session ${session} on BOOTPC: sending dcs.log to http://127.0.0.1:3001/api/catcc/logs`,
      "ticks outside a mission too (DCS's GUI update)",
      'CATCC logs: stored by http://127.0.0.1:3001/api/catcc/logs',
    ]);
    // (the GUI update ticks it in a mission too: onSimulationFrame adds nothing then)
    expect(get('boot frames alone')).toEqual(['0']);
    expect(get('boot global')).toEqual(['true 1 updater(s) true']);
    expect(get('boot off')).toEqual(['off: no W/Config/CATCC-logs.lua']);
    expect(get('boot off global')).toEqual(['false 0 updater(s) false']);
  });

  it('reads addresses, PC names and the profile folder', () => {
    expect(get('url')).toEqual(['a.b:3001 | a.b | 1.2.3.4 | https://a.b/: https is not possible from DCS (its Lua has no TLS): use http://']);
    expect(get('pc')).toEqual(['DESKTOP-1_a.bc unknown']);
    expect(get('scrub')).toEqual(['at %USERPROFILE%\\f and %USERPROFILE%/g; C:\\Users\\AxB (x)']);
  });

  it('is installed by the crew test\'s installer and goes onto the USB stick, with the scripts the installer runs', () => {
    const crew = read('deck-test/crew-test/install.ps1');
    expect(crew).toContain("'Scripts\\Hooks\\CATCC-logs-hook.lua'; to = Join-Path $hooksDst 'CATCC-logs-hook.lua'");
    expect(crew).toContain("'Scripts\\CATCC\\catcc_logs.lua'; to = Join-Path $scriptsDst 'catcc_logs.lua'");
    expect(crew).toContain("Join-Path $repoDcs 'Config\\CATCC-logs.lua'");
    const usb = read('usb/make-usb.ps1');
    for (const f of ['Scripts\\Hooks\\CATCC-logs-hook.lua', 'Scripts\\CATCC\\catcc_logs.lua', 'Config\\CATCC-logs.lua']) expect(usb).toContain(`'${f}'`);
    // every python script the crew installer runs, and what they import from beside them
    const ran = [...crew.matchAll(/model\\(\w+\.py)/g)].map((m) => m[1]);
    expect(new Set(ran)).toEqual(new Set(['driver_head.py', 'driver_pose.py', 'rider_pose.py']));
    for (const f of [...ran, 'edm.py']) expect(usb).toContain(`'deck-test\\crew-test\\model\\${f}'`);
    const imports = new Set<string>();
    for (const f of ran) for (const m of read(`deck-test/crew-test/model/${f}`).matchAll(/^\s*import (\w+)/gm)) imports.add(m[1]);
    for (const m of imports) if (fs.existsSync(path.join(dir, 'deck-test/crew-test/model', `${m}.py`))) expect(usb).toContain(`'deck-test\\crew-test\\model\\${m}.py'`);
    expect(fs.existsSync(path.join(dir, 'Scripts/Hooks/CATCC-logs-hook.lua'))).toBe(true);
  });
});

const require = createRequire(import.meta.url);
const intake = require(path.join(repo, 'SDOBot/lib/catccLogIntake.js')) as {
  readChunk: (h: Record<string, string>, body: unknown, token?: string) => { row?: Record<string, unknown>; status?: number; error?: string };
  pruneDue: (now: number, state: { at?: number }) => boolean;
  pruneCutoff: (now: number) => string;
  KEEP_DAYS: number;
};

describe('CATCC live logs: what SDOBot takes', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  const h = (over: Record<string, string> = {}) => ({
    authorization: `Bearer ${TOKEN}`,
    'x-catcc-session': SESSION,
    'x-catcc-pc': 'TESTPC',
    'x-catcc-file': 'dcs.log',
    'x-catcc-offset': '84',
    ...over,
  });

  it('keeps a chunk as one row, keyed by session, file and offset', () => {
    expect(intake.readChunk(h(), 'a line\n', TOKEN)).toEqual({
      row: { session_id: SESSION, pc: 'TESTPC', file: 'dcs.log', start_offset: 84, body: 'a line\n' },
    });
    expect(intake.readChunk(h(), 'a\u0000b\n', TOKEN).row?.body).toBe('ab\n');
  });

  it('refuses what is not a chunk of ours', () => {
    expect(intake.readChunk(h(), 'x', undefined)).toMatchObject({ status: 503 });
    expect(intake.readChunk(h({ authorization: 'Bearer wrong' }), 'x', TOKEN)).toMatchObject({ status: 401 });
    expect(intake.readChunk(h({ authorization: '' }), 'x', TOKEN)).toMatchObject({ status: 401 });
    expect(intake.readChunk(h({ 'x-catcc-session': 'x; drop' }), 'x', TOKEN)).toMatchObject({ status: 400, error: 'bad X-CATCC-Session' });
    expect(intake.readChunk(h({ 'x-catcc-pc': 'a b' }), 'x', TOKEN)).toMatchObject({ status: 400, error: 'bad X-CATCC-PC' });
    expect(intake.readChunk(h({ 'x-catcc-file': '../dcs.log' }), 'x', TOKEN)).toMatchObject({ status: 400, error: 'bad X-CATCC-File' });
    expect(intake.readChunk(h({ 'x-catcc-offset': '-1' }), 'x', TOKEN)).toMatchObject({ status: 400, error: 'bad X-CATCC-Offset' });
    expect(intake.readChunk(h(), {}, TOKEN)).toMatchObject({ status: 415 });
    expect(intake.readChunk(h(), '', TOKEN)).toMatchObject({ status: 400, error: 'empty chunk' });
  });

  it('deletes chunks older than 14 days, at most once an hour', () => {
    const state = {};
    expect([intake.pruneDue(5e6, state), intake.pruneDue(5e6 + 3599e3, state), intake.pruneDue(5e6 + 3600e3, state)]).toEqual([true, false, true]);
    expect(intake.KEEP_DAYS).toBe(14);
    expect(intake.pruneCutoff(Date.UTC(2026, 10, 26))).toBe('2026-11-12T00:00:00.000Z');
  });

  it('is mounted in SDOBot', () => {
    const index = fs.readFileSync(path.join(repo, 'SDOBot/index.js'), 'utf8');
    expect(index).toContain("require('./routes/catccLogs')");
    expect(index).toContain("app.use('/api', catccLogsRoutes)");
    expect(fs.readFileSync(path.join(repo, 'SDOBot/routes/catccLogs.js'), 'utf8')).toContain("router.post('/catcc/logs'");
  });
});
