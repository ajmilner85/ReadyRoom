/**
 * Standalone CATCC room server (future dedicated Fly app; local development today).
 *
 *   node catcc-server/room/main.ts                       sources from CATCC_SOURCES
 *   node catcc-server/room/main.ts --acmi <file.acmi> [--speed 1|2|4|8] [--from 2300] [--once]
 *        dev mode: runs a fake DCS hook in-process, fed by a Tacview recording, as source "replay",
 *        and accepts any token (CATCC_DEV_NOAUTH). The header's replay controls steer the playback
 *        (play / pause, 2-8x forward and back, restart, skip ahead: tacview/replayClock.ts); it loops
 *        from --from at the end (--once: stops on the last frame).
 *        --acmi latest: CATCC_ACMI if set, else the newest .acmi in ~/Downloads (then
 *        ~/Documents/Tacview). `npm run catcc:replay` is that, from 3300 s.
 *        --demo-pattern adds synthetic pattern traffic (final, bolter downwind, inbound) for the
 *        Approach / Final displays.
 *   node catcc-server/room/main.ts --hook <host[:port]> [--token <token>]
 *        (the token defaults to the one in Saved Games/DCS/Config/CATCC.lua)
 *        dev mode against a real DCS hook (e.g. a local DCS with the hook installed: --hook localhost),
 *        as source "local", accepting any sign-in token (CATCC_DEV_NOAUTH). `npm run catcc:local`.
 *
 * Env: CATCC_PORT (default 3002), plus everything attach.ts reads.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { withDemoPattern } from '../dcs/demoPattern.ts';
import { readAcmiFile } from '../tacview/replay.ts';
import { indexAcmi, parseAcmi, ReplayPlayer } from '../tacview/replayClock.ts';
import { attachCatccRoom } from './attach.ts';
import type { SourceConfig } from './roomService.ts';

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};

/** CATCC_ACMI, else the most recently modified Tacview recording in Downloads, then Documents/Tacview. */
function latestAcmi(): string {
  if (process.env.CATCC_ACMI) return process.env.CATCC_ACMI;
  for (const dir of [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Documents', 'Tacview')]) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => /\.acmi$/i.test(f));
    } catch {
      continue;
    }
    const newest = files.map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (newest) return newest;
  }
  throw new Error('--acmi latest: no .acmi recording in Downloads or Documents/Tacview (or set CATCC_ACMI)');
}

/**
 * The token from the local DCS install's hook config (Saved Games/DCS[.openbeta]/Config/CATCC.lua),
 * so it never has to be typed (or pasted anywhere) for local testing. Never logged.
 */
function localConfigToken(): string | undefined {
  for (const d of ['DCS', 'DCS.openbeta']) {
    try {
      const src = fs.readFileSync(path.join(os.homedir(), 'Saved Games', d, 'Config', 'CATCC.lua'), 'utf8');
      const m = /^\s*token\s*=\s*['"]([^'"]+)['"]/m.exec(src);
      if (m && m[1].length >= 16) return m[1];
    } catch {
      /* not there */
    }
  }
  return undefined;
}

async function main() {
  const port = Number(process.env.CATCC_PORT ?? 3002);
  const extra: SourceConfig[] = [];
  const env = { ...process.env };

  const acmi = opt('acmi') === 'latest' ? latestAcmi() : opt('acmi');
  if (acmi) {
    const token = 'dev-token-dev-token';
    const fake = new FakeHookServer({ port: 0, token, name: 'replay' });
    const fakePort = await fake.listen();
    const t0 = Date.now();
    const index = indexAcmi(parseAcmi(readAcmiFile(acmi)));
    console.log(`[CATCC] indexed ${index.events.length} events, ${index.start.toFixed(0)}-${index.end.toFixed(0)} s, ${index.keyframes.length} keyframes in ${Date.now() - t0} ms`);
    // --demo-pattern: synthetic final / bolter / inbound traffic around the first carrier
    const demo = args.includes('--demo-pattern') ? withDemoPattern(fake.apply, fake.store) : undefined;
    // playback under the room's control (the header's replay controls); at the end it starts again
    // from --from (--once: it stops on the last frame)
    const player = new ReplayPlayer(index, {
      sink: demo ?? fake.apply,
      store: fake.store,
      from: opt('from') ? Number(opt('from')) : undefined,
      loop: !args.includes('--once'),
      onRestore: () => demo?.reset(),
      onChange: (s) => {
        console.log(`[CATCC] replay ${s.playing ? `playing ${s.rate}x` : 'paused'} at ${s.mt.toFixed(0)} s`);
        fake.replayChanged();
      },
    });
    const speed = Number(opt('speed') ?? 1);
    if (speed !== 1 && [2, 4, 8].includes(Math.abs(speed))) for (let r = 2; r <= Math.abs(speed); r *= 2) player.command(speed > 0 ? 'ff' : 'rew');
    fake.setReplay(player);
    player.start();
    extra.push({ id: 'replay', name: 'Replay', kind: 'hook', host: '127.0.0.1', port: fakePort, token });
    env.CATCC_DEV_NOAUTH = '1';
    console.log(`[CATCC] dev replay of ${acmi} via fake hook on :${fakePort}`);
  }

  const hook = opt('hook');
  if (hook) {
    const [host, p] = hook.split(':');
    const token = opt('token') ?? process.env.CATCC_HOOK_TOKEN ?? localConfigToken();
    if (!token) throw new Error('--hook: no token in Saved Games/DCS/Config/CATCC.lua (or pass --token / set CATCC_HOOK_TOKEN)');
    extra.push({ id: 'local', name: `DCS (${host})`, kind: 'hook', host, port: p ? Number(p) : 10310, token });
    env.CATCC_DEV_NOAUTH = '1';
    console.log(`[CATCC] dev: DCS hook at ${host}:${p ?? 10310}`);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    res.writeHead(404).end();
  });
  attachCatccRoom(server, env, extra);
  server.listen(port, () => console.log(`[CATCC] room server on :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
