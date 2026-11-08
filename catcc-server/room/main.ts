/**
 * Standalone CATCC room server (future dedicated Fly app; local development today).
 *
 *   node catcc-server/room/main.ts                       sources from CATCC_SOURCES
 *   node catcc-server/room/main.ts --acmi <file.acmi> [--speed 1] [--from 2300]
 *        dev mode: runs a fake DCS hook in-process, fed by a Tacview recording, as source "replay",
 *        and accepts any token (CATCC_DEV_NOAUTH).
 *
 * Env: CATCC_PORT (default 3002), plus everything attach.ts reads.
 */
import http from 'node:http';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { readAcmiFile, replayAcmi } from '../tacview/replay.ts';
import { attachCatccRoom } from './attach.ts';
import type { SourceConfig } from './roomService.ts';

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};

async function main() {
  const port = Number(process.env.CATCC_PORT ?? 3002);
  const extra: SourceConfig[] = [];
  const env = { ...process.env };

  const acmi = opt('acmi');
  if (acmi) {
    const token = 'dev-token-dev-token';
    const fake = new FakeHookServer({ port: 0, token, name: 'replay' });
    const fakePort = await fake.listen();
    const text = readAcmiFile(acmi);
    void replayAcmi(text, fake.apply, { speed: Number(opt('speed') ?? 1), from: opt('from') ? Number(opt('from')) : undefined }).then(() =>
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
