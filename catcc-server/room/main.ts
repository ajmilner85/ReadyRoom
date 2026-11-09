/**
 * Standalone CATCC room server (future dedicated Fly app; local development today).
 *
 *   node catcc-server/room/main.ts                       sources from CATCC_SOURCES
 *   node catcc-server/room/main.ts --acmi <file.acmi> [--speed 1] [--from 2300]
 *        dev mode: runs a fake DCS hook in-process, fed by a Tacview recording, as source "replay",
 *        and accepts any token (CATCC_DEV_NOAUTH).
 *        --acmi latest: CATCC_ACMI if set, else the newest .acmi in ~/Downloads (then
 *        ~/Documents/Tacview). `npm run catcc:replay` is that, from 3300 s.
 *        --demo-pattern adds synthetic pattern traffic (final, bolter downwind, inbound) for the
 *        Approach / Final displays.
 *
 * Env: CATCC_PORT (default 3002), plus everything attach.ts reads.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { withDemoPattern } from '../dcs/demoPattern.ts';
import { readAcmiFile, replayAcmi } from '../tacview/replay.ts';
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

async function main() {
  const port = Number(process.env.CATCC_PORT ?? 3002);
  const extra: SourceConfig[] = [];
  const env = { ...process.env };

  const acmi = opt('acmi') === 'latest' ? latestAcmi() : opt('acmi');
  if (acmi) {
    const token = 'dev-token-dev-token';
    const fake = new FakeHookServer({ port: 0, token, name: 'replay' });
    const fakePort = await fake.listen();
    const text = readAcmiFile(acmi);
    // --demo-pattern: synthetic final / bolter / inbound traffic around the first carrier
    const sink = args.includes('--demo-pattern') ? withDemoPattern(fake.apply, fake.store) : fake.apply;
    void replayAcmi(text, sink, { speed: Number(opt('speed') ?? 1), from: opt('from') ? Number(opt('from')) : undefined }).then(() =>
      console.log('[CATCC] replay finished'),
    );
    extra.push({ id: 'replay', name: 'Replay', kind: 'hook', host: '127.0.0.1', port: fakePort, token });
    env.CATCC_DEV_NOAUTH = '1';
    console.log(`[CATCC] dev replay of ${acmi} via fake hook on :${fakePort}`);
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
