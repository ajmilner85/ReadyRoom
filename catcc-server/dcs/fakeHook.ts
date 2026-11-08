import net from 'node:net';
import type { AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import type { HookFrame, HookUnit } from '../../src/catcc/core/dcs/hookProtocol.ts';
import { M_PER_FT, MS_PER_KT } from '../../src/catcc/core/geo.ts';
import { TrackStore, type Track } from '../../src/catcc/core/tracks/trackStore.ts';

/**
 * Development stand-in for the DCS export hook: replays ACMI events into a TrackStore and
 * serves hook-protocol frames (with synthetic fuel burn and carrier winds) to clients that
 * send the right AUTH token. Lets the room service and UI run without DCS.
 */
export interface FakeHookOptions {
  port: number;
  token: string;
  rateHz?: number;
  name?: string;
}

const KIND_CODE: Record<string, HookUnit['c'] | undefined> = { fixedwing: 'A', rotary: 'H', carrier: 'S', ship: 'S' };
const SIDE_CODE = { neutral: 0, red: 1, blue: 2 } as const;

export function trackToHookUnit(t: Track, numericId: number, simT: number): HookUnit | undefined {
  const c = KIND_CODE[t.kind];
  if (!c) return undefined;
  const u: HookUnit = {
    id: numericId,
    n: t.pilot ?? t.id,
    t: t.type,
    g: t.group ?? '',
    s: SIDE_CODE[t.side],
    c,
    p: t.player ? (t.pilot ?? null) : null,
    cs: t.callsign ?? '',
    lat: t.lat,
    lon: t.lon,
    alt: t.altFt * M_PER_FT,
    hdg: t.headingDeg ?? t.courseDeg ?? 0,
    gs: (t.gsKt ?? 0) * MS_PER_KT,
    crs: t.courseDeg ?? null,
    vs: ((t.vsFpm ?? 0) / 60) * M_PER_FT,
  };
  if (c !== 'S') {
    // Deterministic per-aircraft burn: start 60-95 %, lose 1 % per ~100 s.
    const start = 0.6 + ((numericId * 7919) % 36) / 100;
    u.f = Math.max(0.12, start - simT / 10_000);
    u.air = (t.gsKt ?? 0) > 60;
  } else if (t.kind === 'carrier') {
    u.wx = { d0: 70, s0: 9.5, d2: 75, s2: 12.4, d10: 90, s10: 18.6, tK: 299.2, qnh: 101420 };
  }
  return u;
}

export class FakeHookServer {
  readonly store = new TrackStore();
  private server?: net.Server;
  private readonly clients = new Set<{ sock: net.Socket; authed: boolean }>();
  private timer?: NodeJS.Timeout;
  private seq = 0;
  private readonly ids = new Map<string, number>();
  private readonly opts: Required<FakeHookOptions>;

  constructor(opts: FakeHookOptions) {
    this.opts = { rateHz: 1, name: 'CATCC-fake-hook', ...opts };
  }

  /** Feed replayed ACMI events (e.g. from replayAcmi). */
  apply = (ev: AcmiEvent): void => this.store.apply(ev);

  listen(): Promise<number> {
    this.server = net.createServer((sock) => this.accept(sock));
    this.timer = setInterval(() => this.broadcastFrame(), 1000 / this.opts.rateHz);
    return new Promise((resolve) => {
      this.server!.listen(this.opts.port, () => resolve((this.server!.address() as net.AddressInfo).port));
    });
  }

  close(): void {
    clearInterval(this.timer);
    for (const c of this.clients) c.sock.destroy();
    this.server?.close();
  }

  buildFrame(): HookFrame {
    const units: HookUnit[] = [];
    for (const t of this.store.tracks.values()) {
      let id = this.ids.get(t.id);
      if (id === undefined) {
        id = 16_000_000 + this.ids.size;
        this.ids.set(t.id, id);
      }
      const u = trackToHookUnit(t, id, this.store.t);
      if (u) units.push(u);
    }
    const utc = this.store.utc;
    return {
      type: 'frame',
      seq: ++this.seq,
      mt: this.store.t,
      abs: utc ? utc.getUTCHours() * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds() : 0,
      date: utc ? utc.toISOString().slice(0, 10) : null,
      theatre: 'Normandy', // UTC+0 in THEATRE_UTC_OFFSET_H, so abs above is already UTC
      unitErrors: 0,
      units,
    };
  }

  private accept(sock: net.Socket): void {
    const c = { sock, authed: false };
    this.clients.add(c);
    sock.on('close', () => this.clients.delete(c));
    sock.on('error', () => this.clients.delete(c));
    sock.write(JSON.stringify({ type: 'hello', proto: 1, version: 'fake', server: this.opts.name }) + '\n');
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!c.authed) {
          if (line === `AUTH ${this.opts.token}`) {
            c.authed = true;
            sock.write('{"type":"auth","ok":true}\n{"type":"mission","state":"running","name":"replay"}\n');
          } else {
            sock.end('{"type":"error","error":"auth"}\n');
          }
        } else if (line === 'PING') {
          sock.write('{"type":"pong"}\n');
        }
        nl = buf.indexOf('\n');
      }
    });
  }

  private broadcastFrame(): void {
    if (![...this.clients].some((c) => c.authed)) return;
    const line = JSON.stringify(this.buildFrame()) + '\n';
    for (const c of this.clients) if (c.authed) c.sock.write(line);
  }
}
