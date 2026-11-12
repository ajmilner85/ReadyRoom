import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMsg } from '../../src/catcc/core/room/protocol.ts';
import { destination } from '../../src/catcc/core/geo.ts';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { devVerifier } from './auth.ts';
import { RoomService } from './roomService.ts';

const TOKEN = 'test-token-test-token';
const PILOT = 'Volt 3-1 | 401 Ace';

/** a carrier stopped in the water and a player Hornet parked on its deck */
function feed(fake: FakeHookServer, t: number) {
  const jet = destination(26.2, 56.8, 90, 60 / 1852);
  fake.apply({ kind: 'time', t });
  fake.apply({ kind: 'update', id: '0', props: { ReferenceTime: '2026-11-08T14:00:00Z' } });
  fake.apply({ kind: 'update', id: '602', props: { T: `56.8|26.2|20|0|0|70|0|0|70`, Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_72', Color: 'Blue', Pilot: 'CSG-1-1', Group: 'CSG-1' } });
  fake.apply({ kind: 'update', id: '103', props: { T: `${jet.lon}|${jet.lat}|20|0|0|70|0|0|70`, Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: 'Blue', Pilot: PILOT, Group: 'Volt 3' } });
}

async function client(url: string, token: string) {
  const ws = new WebSocket(url);
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d)) as ServerMsg));
  await new Promise<void>((r) => ws.once('open', () => r()));
  const send = (m: object) => ws.send(JSON.stringify(m));
  const waitFor = async <T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 5000) => {
    const start = Date.now();
    for (;;) {
      const m = msgs.findLast((x) => x.t === t && pred(x as Extract<ServerMsg, { t: T }>));
      if (m) return m as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout waiting for ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  send({ t: 'auth', token });
  await waitFor('hello');
  send({ t: 'subscribe', src: 'fox3' });
  return { ws, msgs, send, waitFor };
}

const until = async (f: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('launch clearance through the room', () => {
  let fake: FakeHookServer;
  let room: RoomService;
  let server: http.Server;
  let url: string;
  let tick: NodeJS.Timeout;

  beforeAll(async () => {
    fake = new FakeHookServer({ port: 0, token: TOKEN, rateHz: 10 });
    const hookPort = await fake.listen();
    let t = 0;
    feed(fake, t);
    tick = setInterval(() => feed(fake, (t += 1)), 100);
    room = new RoomService({ sources: [{ id: 'fox3', name: 'Fox3', kind: 'hook', host: '127.0.0.1', port: hookPort, token: TOKEN }], verify: devVerifier, seatGraceMs: 300, log: () => undefined });
    server = http.createServer();
    room.attach(server);
    room.start();
    await new Promise<void>((r) => server.listen(0, r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/catcc/ws`;
  });

  afterAll(() => {
    clearInterval(tick);
    room.stop();
    server.close();
    fake.close();
  });

  it('holds a player on deck while the Boss is seated, clears on the Boss\'s word, and auto-clears when the seat empties', async () => {
    const boss = await client(url, 'boss');
    const other = await client(url, 'other');
    // nobody clears launches: nobody held
    const free = await boss.waitFor('launch', (m) => !!m.launch['CVN-72']);
    expect(free.launch['CVN-72']).toMatchObject({ auth: null, hold: [] });

    boss.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'boss' } });
    const held = await boss.waitFor('launch', (m) => m.launch['CVN-72']?.hold.length === 1);
    expect(held.launch['CVN-72'].auth).toMatchObject({ role: 'boss', name: 'boss' });
    const jet = held.launch['CVN-72'].hold[0];
    await until(() => fake.hold.includes(PILOT));

    // the Boss also holds the chocks until a taxi instruction
    expect(held.launch['CVN-72'].taxiAuth).toMatchObject({ role: 'boss' });
    await until(() => fake.chocks.includes(PILOT));
    // the pilot asks for the chocks to come off (their mod reports it): ready to taxi
    fake.pilotEvent(PILOT, 'taxi');
    await boss.waitFor('launch', (m) => !!m.launch['CVN-72']?.taxiReady?.[jet]);
    // the taxi instruction releases the chocks, and ready-to-taxi goes with it
    boss.send({ t: 'ops', src: 'fox3', carrier: 'CVN-72', patch: { taxi: { [jet]: { to: 'C1', at: Date.now() } } } });
    await boss.waitFor('launch', (m) => m.launch['CVN-72']?.chocks?.length === 0 && !m.launch['CVN-72'].taxiReady?.[jet]);
    await until(() => fake.chocks.length === 0);

    // on the cat: launch bar down (the shooter is ready), then a salute
    fake.pilotEvent(PILOT, 'lb1');
    await boss.waitFor('launch', (m) => !!m.launch['CVN-72']?.barDown?.[jet]);
    fake.salute(PILOT);
    await boss.waitFor('launch', (m) => !!m.launch['CVN-72']?.saluted[jet]);

    // only the clearing seat clears
    other.send({ t: 'launch', src: 'fox3', carrier: 'CVN-72', trackId: jet, clear: true });
    const err = await other.waitFor('error');
    expect(err.error).toMatch(/Air Boss \(boss\)/);

    boss.send({ t: 'launch', src: 'fox3', carrier: 'CVN-72', trackId: jet, clear: true });
    await boss.waitFor('launch', (m) => !!m.launch['CVN-72']?.cleared[jet] && m.launch['CVN-72'].hold.length === 0);
    await until(() => fake.hold.length === 0);

    // a Shooter takes over clearing; the clearance already given stands
    other.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'shooter' } });
    await boss.waitFor('launch', (m) => m.launch['CVN-72']?.auth?.role === 'shooter');
    other.send({ t: 'launch', src: 'fox3', carrier: 'CVN-72', trackId: jet, clear: false });
    await until(() => fake.hold.includes(PILOT));

    // both seats empty: nobody clears, nobody is held
    other.send({ t: 'release', src: 'fox3', seat: { carrier: 'CVN-72', role: 'shooter' } });
    boss.send({ t: 'release', src: 'fox3', seat: { carrier: 'CVN-72', role: 'boss' } });
    await boss.waitFor('launch', (m) => m.launch['CVN-72']?.auth === null && m.launch['CVN-72'].hold.length === 0);
    await until(() => fake.hold.length === 0);
    boss.ws.close();
    other.ws.close();
  }, 20_000);
});
