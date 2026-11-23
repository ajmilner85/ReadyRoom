import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import { destination } from '../../src/catcc/core/geo.ts';
import type { ServerMsg } from '../../src/catcc/core/room/protocol.ts';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { indexAcmi, ReplayPlayer } from '../tacview/replayClock.ts';
import { devVerifier } from './auth.ts';
import { RoomService } from './roomService.ts';

/** a carrier and a Hornet, frames every second from 0 to 600 s */
function recording(): AcmiEvent[] {
  const ev: AcmiEvent[] = [{ kind: 'update', id: '0', props: { ReferenceTime: '2026-11-08T14:00:00Z' } }];
  for (let t = 0; t <= 600; t++) {
    const cv = destination(26.2, 56.8, 70, (25 * t) / 3600);
    const fa = destination(26.5, 56.6, 160, (420 * t) / 3600);
    ev.push({ kind: 'time', t });
    ev.push({ kind: 'update', id: '602', props: { T: `${cv.lon}|${cv.lat}|20|0|0|70|0|0|70`, Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_72', Color: 'Blue', Pilot: 'CSG-1-1', Group: 'CSG-1' } });
    ev.push({ kind: 'update', id: '103', props: { T: `${fa.lon}|${fa.lat}|6000|0|0|160|0|0|160`, Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: 'Blue', Pilot: 'Volt 3-1 | 401 Ace', Group: 'Volt 3' } });
  }
  return ev;
}

class Client {
  readonly ws: WebSocket;
  readonly msgs: ServerMsg[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(String(d)) as ServerMsg));
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 5000) {
    const start = Date.now();
    for (;;) {
      const m = this.msgs.find((x) => x.t === t && pred(x as Extract<ServerMsg, { t: T }>));
      if (m) return m as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout waiting for ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

describe('room service: replay playback', () => {
  const TOKEN = 'test-token-test-token';
  let live: FakeHookServer;
  let rep: FakeHookServer;
  let player: ReplayPlayer;
  let room: RoomService;
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    live = new FakeHookServer({ port: 0, token: TOKEN, rateHz: 10 });
    // the live source's picture: the recording's first frame
    for (const e of recording().slice(0, 4)) live.apply(e);
    rep = new FakeHookServer({ port: 0, token: TOKEN, rateHz: 10, name: 'replay' });
    player = new ReplayPlayer(indexAcmi(recording()), { sink: rep.apply, store: rep.store, from: 100, tickMs: 100, onChange: () => rep.replayChanged() });
    rep.setReplay(player);
    player.start();
    const livePort = await live.listen();
    const repPort = await rep.listen();
    room = new RoomService({
      sources: [
        { id: 'live', name: 'Live', kind: 'hook', host: '127.0.0.1', port: livePort, token: TOKEN },
        { id: 'replay', name: 'Replay', kind: 'hook', host: '127.0.0.1', port: repPort, token: TOKEN },
      ],
      verify: devVerifier,
      log: () => undefined,
    });
    server = http.createServer();
    room.attach(server);
    room.start();
    await new Promise<void>((r) => server.listen(0, r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/catcc/ws`;
  });

  afterAll(() => {
    player.stop();
    room.stop();
    live.close();
    rep.close();
    server.close();
  });

  async function member(token: string, src: string) {
    const c = new Client(url);
    await c.open();
    c.send({ t: 'auth', token });
    await c.waitFor('hello');
    c.send({ t: 'subscribe', src });
    await c.waitFor('frame', (f) => f.tracks.length === 2);
    return c;
  }

  it('marks the replay source and sends its clock on subscribe; every viewer sees a command', async () => {
    const a = await member('alpha', 'replay');
    const b = await member('bravo', 'replay');
    const st = [...a.msgs].reverse().find((m) => m.t === 'status' || m.t === 'hello') as Extract<ServerMsg, { t: 'status' | 'hello' }>;
    expect(st.sources.find((s) => s.id === 'replay')?.replay).toBe(true);
    expect(st.sources.find((s) => s.id === 'live')?.replay).toBeUndefined();
    const first = await a.waitFor('replayState');
    expect(first).toMatchObject({ src: 'replay', playing: true, rate: 1, start: 0, end: 600 });

    // any member steers it (no seat needed); both viewers get the new clock
    a.send({ t: 'replay', src: 'replay', cmd: 'pause' });
    await b.waitFor('replayState', (m) => !m.playing);
    a.send({ t: 'replay', src: 'replay', cmd: 'ff' });
    a.send({ t: 'replay', src: 'replay', cmd: 'ff' });
    await b.waitFor('replayState', (m) => m.playing && m.rate === 4);
    b.send({ t: 'replay', src: 'replay', cmd: 'rew' });
    await a.waitFor('replayState', (m) => m.rate === -2);

    // skip ahead: the next frame is the new picture
    b.send({ t: 'replay', src: 'replay', cmd: 'pause' });
    const paused = await a.waitFor('replayState', (m) => !m.playing && m.rate === 1);
    a.msgs.length = 0;
    a.send({ t: 'replay', src: 'replay', cmd: 'skip', s: 120 });
    const skipped = await a.waitFor('replayState', (m) => m.mt > paused.mt + 100);
    expect(skipped.mt).toBeCloseTo(paused.mt + 120, 0);
    await a.waitFor('frame', (f) => Math.abs(f.mt - skipped.mt) <= 1);

    a.send({ t: 'replay', src: 'replay', cmd: 'restart' });
    await b.waitFor('replayState', (m) => m.playing && m.rate === 1 && m.mt < 102);

    // invalid commands are refused by the room
    a.msgs.length = 0;
    a.send({ t: 'replay', src: 'replay', cmd: 'skip', s: 0 });
    expect((await a.waitFor('error')).error).toMatch(/invalid replay command/);
    a.ws.close();
    b.ws.close();
  });

  it('refuses playback commands on a live source', async () => {
    const c = await member('charlie', 'live');
    c.send({ t: 'replay', src: 'live', cmd: 'pause' });
    expect((await c.waitFor('error')).error).toMatch(/not a replay/);
    expect(c.msgs.some((m) => m.t === 'replayState')).toBe(false);
    c.ws.close();
  });
});
