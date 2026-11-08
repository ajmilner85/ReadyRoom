import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMsg } from '../../src/catcc/core/room/protocol.ts';
import { destination } from '../../src/catcc/core/geo.ts';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { devVerifier } from './auth.ts';
import { RoomService } from './roomService.ts';

/** Synthetic picture: a carrier and a Hornet, advanced each call. */
function feed(fake: FakeHookServer, t: number) {
  const cv = destination(26.2, 56.8, 70, (25 * t) / 3600);
  const fa = destination(26.5, 56.6, 160, (420 * t) / 3600);
  fake.apply({ kind: 'time', t });
  fake.apply({ kind: 'update', id: '0', props: { ReferenceTime: '2026-11-08T14:00:00Z' } });
  fake.apply({
    kind: 'update',
    id: '602',
    props: { T: `${cv.lon}|${cv.lat}|20|0|0|70|0|0|70`, Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_72', Color: 'Blue', Pilot: 'CSG-1-1', Group: 'CSG-1' },
  });
  fake.apply({
    kind: 'update',
    id: '103',
    props: { T: `${fa.lon}|${fa.lat}|6000|0|0|160|0|0|160`, Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: 'Blue', Pilot: 'Volt 3-1 | 401 Ace', Group: 'Volt 3' },
  });
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

describe('room service with fake DCS hook', () => {
  let fake: FakeHookServer;
  let room: RoomService;
  let server: http.Server;
  let url: string;
  let tick: NodeJS.Timeout;

  beforeAll(async () => {
    fake = new FakeHookServer({ port: 0, token: 'test-token-test-token', rateHz: 10 });
    const hookPort = await fake.listen();
    let t = 0;
    feed(fake, t);
    tick = setInterval(() => feed(fake, (t += 1)), 100);
    room = new RoomService({
      sources: [{ id: 'fox3', name: 'Fox3', kind: 'hook', host: '127.0.0.1', port: hookPort, token: 'test-token-test-token' }],
      verify: devVerifier,
      seatGraceMs: 300,
      log: () => undefined,
    });
    server = http.createServer();
    room.attach(server);
    room.start();
    await new Promise<void>((r) => server.listen(0, r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/catcc/ws`;
  });

  afterAll(() => {
    clearInterval(tick);
    room.stop();
    fake.close();
    server.close();
  });

  it('closes connections that do not authenticate first', async () => {
    const c = new Client(url);
    await c.open();
    c.send({ t: 'subscribe', src: 'fox3' });
    const code = await new Promise<number>((r) => c.ws.once('close', (code) => r(code)));
    expect(code).toBe(4001);
  });

  it('streams frames with fuel and identity after auth + subscribe', async () => {
    const c = new Client(url);
    await c.open();
    c.send({ t: 'auth', token: 'ace' });
    const hello = await c.waitFor('hello');
    expect(hello.user.name).toBe('ace');
    expect(hello.sources[0]).toMatchObject({ id: 'fox3', kind: 'hook' });
    c.send({ t: 'subscribe', src: 'fox3' });
    const frame = await c.waitFor('frame', (f) => f.tracks.length === 2);
    const fa = frame.tracks.find((x) => x.ty === 'FA-18C_hornet')!;
    expect(fa).toMatchObject({ k: 'fixedwing', sd: 'blue', cs: 'VOLT 3-1', bd: '401', g: 'Volt 3' });
    expect(fa.f).toBeGreaterThan(0);
    expect(fa.lb).toBeGreaterThan(0);
    const cv = frame.tracks.find((x) => x.k === 'carrier')!;
    expect(cv.hull).toBe('CVN-72');
    expect(cv.wx?.d0).toBe(70);
    const latest = [...c.msgs].reverse().find((m) => m.t === 'status' || m.t === 'hello') as Extract<ServerMsg, { t: 'status' | 'hello' }>;
    expect(latest.sources[0]).toMatchObject({ connected: true, authed: true, mission: { state: 'running' } });
    c.ws.close();
  });

  it('enforces seat ownership and keeps seats through a short disconnect', async () => {
    const a = new Client(url);
    const b = new Client(url);
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'auth', token: 'alpha' });
    b.send({ t: 'auth', token: 'bravo' });
    await Promise.all([a.waitFor('hello'), b.waitFor('hello')]);
    a.send({ t: 'subscribe', src: 'fox3' });
    b.send({ t: 'subscribe', src: 'fox3' });

    a.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'marshal' } });
    await b.waitFor('seats', (s) => s.seats.some((x) => x.role === 'marshal' && x.name === 'alpha'));

    b.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'marshal' } });
    expect((await b.waitFor('error')).error).toMatch(/held by alpha/);

    b.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'mission_commander' } });
    expect((await b.waitFor('error', (e) => e.error === 'invalid seat')).error).toBe('invalid seat');

    a.ws.close();
    await b.waitFor('seats', (s) => s.seats.some((x) => x.role === 'marshal' && x.away === true));
    await b.waitFor('seats', (s) => s.seats.length === 0, 2000); // grace (300 ms) expires
    b.ws.close();
  });

  it('shares plans and assignments, locks edits to seat holders, drops stale assignments', async () => {
    const a = new Client(url);
    const b = new Client(url);
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'auth', token: 'alpha2' });
    b.send({ t: 'auth', token: 'bravo2' });
    await Promise.all([a.waitFor('hello'), b.waitFor('hello')]);
    a.send({ t: 'subscribe', src: 'fox3' });
    b.send({ t: 'subscribe', src: 'fox3' });
    const frame = await b.waitFor('frame', (f) => f.tracks.length === 2);
    const jetId = frame.tracks.find((x) => x.k === 'fixedwing')!.id;

    // the previous test's seat is in its disconnect grace; wait for it to expire
    await a.waitFor('seats', (s) => s.seats.length === 0, 3000);
    // open edit while nobody holds a CVN-72 seat
    a.send({ t: 'plan', src: 'fox3', carrier: 'CVN-72', plan: { deps: [285], stacks: [{ id: 'A', r: 156, base: 6 }] } });
    await b.waitFor('plans', (m) => m.plans['CVN-72']?.deps[0] === 285);

    // switching a stack off round-trips through the room
    a.send({ t: 'plan', src: 'fox3', carrier: 'CVN-72', plan: { deps: [285], stacks: [{ id: 'A', r: 156, base: 6 }], off: ['E'] } });
    await b.waitFor('plans', (m) => m.plans['CVN-72']?.off?.[0] === 'E');

    // invalid plans are refused
    a.send({ t: 'plan', src: 'fox3', carrier: 'CVN-72', plan: { deps: [400], stacks: [] } });
    expect((await a.waitFor('error', (e) => e.error === 'invalid plan')).error).toBe('invalid plan');

    // once bravo holds a CVN-72 seat, alpha can no longer edit; bravo can
    b.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'marshal' } });
    await a.waitFor('seats', (s) => s.seats.some((x) => x.name === 'bravo2'));
    a.send({ t: 'plan', src: 'fox3', carrier: 'CVN-72', plan: { deps: [], stacks: [] } });
    expect((await a.waitFor('error', (e) => /claim a CVN-72 seat/.test(e.error))).error).toMatch(/seat/);
    b.send({ t: 'assign', src: 'fox3', trackId: jetId, assignment: { stackId: 'A', angels: 7, eatS: 60_000, fixS: 59_950, carrier: 'CVN-72' } });
    b.send({ t: 'assign', src: 'fox3', trackId: 'u99999', assignment: { stackId: 'A', angels: 8, eatS: 60_060, fixS: 60_000, carrier: 'CVN-72' } });
    await a.waitFor('assignments', (m) => m.assignments[jetId]?.angels === 7);
    // the unknown track's assignment is dropped on the next frame
    await a.waitFor('assignments', (m) => !!m.assignments[jetId] && !m.assignments['u99999']);
    a.ws.close();
    b.ws.close();
  });
});
