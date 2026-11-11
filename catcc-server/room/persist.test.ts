import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMsg } from '../../src/catcc/core/room/protocol.ts';
import { FakeHookServer } from '../dcs/fakeHook.ts';
import { devVerifier } from './auth.ts';
import { memoryStore } from './persist.ts';
import { RoomService } from './roomService.ts';

const TOKEN = 'test-token-test-token';

async function startRoom(hookPort: number, store: ReturnType<typeof memoryStore>) {
  const room = new RoomService({
    sources: [{ id: 'fox3', name: 'Fox3', kind: 'hook', host: '127.0.0.1', port: hookPort, token: TOKEN }],
    verify: devVerifier,
    store,
    seatGraceMs: 300,
    log: () => undefined,
  });
  const server = http.createServer();
  room.attach(server);
  room.start();
  await new Promise<void>((r) => server.listen(0, r));
  return { room, server, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/catcc/ws` };
}

async function client(url: string, token: string) {
  const ws = new WebSocket(url);
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d)) as ServerMsg));
  await new Promise<void>((r) => ws.once('open', () => r()));
  const send = (m: object) => ws.send(JSON.stringify(m));
  const waitFor = async <T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 6000) => {
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
  return { ws, send, waitFor };
}

describe('room state survives a restart', () => {
  const fake = new FakeHookServer({ port: 0, token: TOKEN, rateHz: 10 });
  afterAll(() => fake.close());

  it('saves plans, ops and seats per mission and restores them (seats away until their holder reconnects)', async () => {
    const hookPort = await fake.listen();
    const store = memoryStore();

    const a = await startRoom(hookPort, store);
    const c1 = await client(a.url, 'alpha');
    // wait until the source has reported its mission (state loads then)
    for (let i = 0; i < 100 && ![...store.rows.keys()].length; i++) {
      c1.send({ t: 'claim', src: 'fox3', seat: { carrier: 'CVN-72', role: 'boss' } });
      await new Promise((r) => setTimeout(r, 50));
      if (i === 0) {
        c1.send({ t: 'plan', src: 'fox3', carrier: 'CVN-72', plan: { deps: [285], stacks: [{ id: 'A', r: 156, base: 6 }] } });
        c1.send({ t: 'ops', src: 'fox3', carrier: 'CVN-72', patch: { deck: { foul: true, reason: 'Barricade rig', at: 1 } } });
      }
    }
    await a.room.flush();
    const row = store.rows.get('fox3|replay');
    expect(row?.plans?.['CVN-72']?.deps).toEqual([285]);
    expect(row?.ops?.['CVN-72']?.deck?.reason).toBe('Barricade rig');
    expect(row?.seats?.[0]).toMatchObject({ carrier: 'CVN-72', role: 'boss', userId: 'dev:alpha' });
    c1.ws.close();
    a.room.stop();
    a.server.close();

    // a new room (after a deploy) with the same store
    const b = await startRoom(hookPort, store);
    const c2 = await client(b.url, 'bravo');
    const plans = await c2.waitFor('plans', (m) => !!m.plans['CVN-72']);
    expect(plans.plans['CVN-72'].stacks[0]).toMatchObject({ id: 'A', r: 156 });
    const ops = await c2.waitFor('ops', (m) => !!m.ops['CVN-72']);
    expect(ops.ops['CVN-72'].deck?.foul).toBe(true);
    const seats = await c2.waitFor('seats', (m) => m.seats.length > 0);
    expect(seats.seats[0]).toMatchObject({ role: 'boss', userId: 'dev:alpha', away: true });
    // the holder comes back: the seat is theirs, no longer away
    const c3 = await client(b.url, 'alpha');
    const back = await c3.waitFor('seats', (m) => m.seats.some((s) => s.userId === 'dev:alpha' && !s.away));
    expect(back.seats).toHaveLength(1);
    c2.ws.close();
    c3.ws.close();
    b.room.stop();
    b.server.close();
  }, 20_000);
});
