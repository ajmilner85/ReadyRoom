import net from 'node:net';
import type { AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import { REPLAY_COMMANDS, type HookEnv, type HookFrame, type HookUnit, type ReplayCommand, type ReplayState } from '../../src/catcc/core/dcs/hookProtocol.ts';
import { destination, M_PER_FT, MS_PER_KT } from '../../src/catcc/core/geo.ts';
import { TrackStore, type Track } from '../../src/catcc/core/tracks/trackStore.ts';
import { THEATRE_UTC_OFFSET_H } from '../../src/catcc/core/dcs/aircraft.ts';
import { theatreAt } from '../../src/catcc/core/dcs/theatres.ts';

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
  /** announce Air Boss ship control (the hello's "ab") */
  ab?: boolean;
}

/** a replay's playback, steered through the hook's orders (catcc-server/tacview/replayClock.ts) */
export interface ReplayControl {
  readonly state: ReplayState;
  /** null when done, else why not */
  command(cmd: ReplayCommand, s?: number): string | null;
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
    // Tacview has no in-air flag: slow and below 150 ft MSL is on a deck or a sea-level field (a carrier's
    // deck is ~65 ft); a hovering helicopter is in the air. Real DCS sends Unit:inAir().
    u.air = (t.gsKt ?? 0) > 50 || t.altFt > 150;
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
    this.opts = { rateHz: 1, name: 'CATCC-fake-hook', ab: false, ...opts };
  }

  /** Feed replayed ACMI events (e.g. from replayAcmi or a ReplayPlayer). */
  apply = (ev: AcmiEvent): void => {
    this.store.apply(ev);
  };

  /**
   * Bullseyes: the recording's Navaid objects, read from the store's object table (not from the events
   * seen), so a replay that seeks still has the ones placed before its keyframe.
   */
  private bulls(): { side: 'blue' | 'red'; lat: number; lon: number }[] {
    const out: { side: 'blue' | 'red'; lat: number; lon: number }[] = [];
    for (const o of this.store.acmi.objects.values()) {
      if (!o.props.Type?.includes('Bullseye')) continue;
      const side = o.props.Color === 'Blue' ? 'blue' : o.props.Color === 'Red' ? 'red' : undefined;
      const { lat, lon } = o.transform;
      if (side && lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) out.push({ side, lat, lon });
    }
    return out;
  }

  private replay?: ReplayControl;

  /**
   * Make this a replay source: the hello announces it, `CMD {"op":"replay"}` orders go to `ctl`, and its
   * state goes to the room on connect and with replayChanged().
   */
  setReplay(ctl: ReplayControl): void {
    this.replay = ctl;
  }

  private replayLine(): string {
    return `${JSON.stringify({ type: 'replay', ...this.replay!.state })}\n`;
  }

  /** the replay's clock changed (a command, a loop): tell the room, with a frame of the new picture */
  replayChanged(): void {
    if (!this.replay) return;
    const line = this.replayLine();
    for (const c of this.clients) if (c.authed) c.sock.write(line);
    this.broadcastFrame();
  }

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
    const { theatre, local } = this.localTime();
    return {
      type: 'frame',
      seq: ++this.seq,
      mt: this.store.t,
      abs: local ? local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds() : 0,
      date: local ? local.toISOString().slice(0, 10) : null,
      theatre: theatre ?? null,
      unitErrors: 0,
      units,
    };
  }

  /**
   * DCS reports mission time in the theatre's local zone; a Tacview replay carries UTC. The theatre
   * is inferred from where the units are, and the clock shifted to it.
   */
  private localTime(): { theatre?: string; local?: Date } {
    const utc = this.store.utc;
    const any = [...this.store.tracks.values()].find((t) => t.kind === 'carrier') ?? this.store.tracks.values().next().value;
    let theatre = any ? theatreAt(any.lat, any.lon) : undefined;
    let off = theatre ? THEATRE_UTC_OFFSET_H[theatre] : undefined;
    if (off === undefined) {
      theatre = 'Normandy'; // UTC+0: the clock passes through as UTC
      off = 0;
    }
    return { theatre, local: utc ? new Date(utc.getTime() + off * 3_600_000) : undefined };
  }

  /** Synthetic environment: broken layer at 800 ft, 4 NM in rain; carriers hold course 30 min, then turn 35° right. */
  buildEnv(): HookEnv {
    const { theatre, local } = this.localTime();
    const now = this.store.t;
    const routes = [...this.store.tracks.values()]
      .filter((t) => t.kind === 'carrier')
      .map((t) => {
        const crs = t.courseDeg ?? t.headingDeg ?? 0;
        const kt = t.gsKt ?? 20;
        const a = destination(t.lat, t.lon, crs, kt * 0.5);
        const b = destination(a.lat, a.lon, crs + 35, kt);
        const spd = kt * MS_PER_KT;
        return {
          g: t.group ?? t.id,
          side: t.side,
          pts: [
            { lat: t.lat, lon: t.lon, spd, eta: now },
            { lat: a.lat, lon: a.lon, spd, eta: now + 1800 },
            { lat: b.lat, lon: b.lon, spd, eta: now + 5400 },
          ],
        };
      });
    return {
      start: local ? local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds() - Math.round(now) : 0,
      date: local ? local.toISOString().slice(0, 10) : null,
      theatre: theatre ?? null,
      wx: { cb: 244, ct: 900, cd: 7, cp: 'RainyPreset1', pr: 1, vis: 7400, fog: null, dust: null },
      routes,
      bulls: this.bulls(),
    };
  }

  private envAt = -1e9;
  /** ops of the orders received, in order (tests) */
  readonly ops: string[] = [];
  /** refuse Air Boss orders as a server without the API would (tests) */
  refuseBridge = false;

  private accept(sock: net.Socket): void {
    const c = { sock, authed: false };
    this.clients.add(c);
    sock.on('close', () => this.clients.delete(c));
    sock.on('error', () => this.clients.delete(c));
    sock.write(JSON.stringify({ type: 'hello', proto: 1, version: 'fake', server: this.opts.name, cmds: true, ab: this.opts.ab, ...(this.replay ? { replay: true } : {}) }) + '\n');
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
            if (this.replay) sock.write(this.replayLine());
            this.envAt = -1e9;
          } else {
            sock.end('{"type":"error","error":"auth"}\n');
          }
        } else if (line === 'PING') {
          sock.write('{"type":"pong"}\n');
        } else if (line.startsWith('CMD ')) {
          // a replay can't be steered: orders are acknowledged (so the UI path can be tested) and logged
          let id: number | null = null;
          let refused: string | null = null;
          try {
            const m = JSON.parse(line.slice(4)) as { id?: number; op?: string; g?: string; hold?: string[]; chocks?: string[]; cmd?: string; s?: number };
            id = typeof m.id === 'number' ? m.id : null;
            if (m.op === 'replay') {
              // playback: the one order a replay obeys
              if (!this.replay) refused = 'not a replay';
              else if (!REPLAY_COMMANDS.includes(m.cmd as ReplayCommand)) refused = 'unknown replay command';
              else refused = this.replay.command(m.cmd as ReplayCommand, m.s);
              // after the reply below
              if (!refused) queueMicrotask(() => this.replayChanged());
            } else if (m.op === 'launch') {
              // launch holds: kept for tests (and the pilots' side of a replay has nobody to hold)
              this.hold = Array.isArray(m.hold) ? m.hold : [];
              this.chocks = Array.isArray(m.chocks) ? m.chocks : [];
            } else {
              this.ops.push(String(m.op));
              if (m.op === 'bridge' && this.refuseBridge) refused = 'Air Boss ship control is not available on this server';
              console.log(`[fake hook] order ${m.op} for ${m.g} (not applied: replay) ${line.slice(4, 300)}`);
            }
          } catch {
            /* reply below */
          }
          sock.write(JSON.stringify({ type: 'cmd', id, ok: id !== null && !refused, ...(id === null ? { error: 'bad JSON' } : refused ? { error: refused } : {}) }) + '\n');
        }
        nl = buf.indexOf('\n');
      }
    });
  }

  /** the players the room last asked to hold on deck */
  hold: string[] = [];
  /** the players whose chocks the room last asked to hold */
  chocks: string[] = [];

  /** a pilot's mod reporting a chocks request or the launch bar */
  pilotEvent(player: string, e: 'taxi' | 'lb1' | 'lb0'): void {
    const line = `${JSON.stringify({ type: 'pilotev', e, p: player })}\n`;
    for (const c of this.clients) if (c.authed) c.sock.write(line);
  }

  /** a pilot's mod reporting a salute */
  salute(player: string): void {
    const line = `${JSON.stringify({ type: 'salute', p: player })}\n`;
    for (const c of this.clients) if (c.authed) c.sock.write(line);
  }

  private broadcastFrame(): void {
    if (![...this.clients].some((c) => c.authed)) return;
    if (Date.now() - this.envAt > 30_000) {
      this.envAt = Date.now();
      const env = JSON.stringify({ type: 'env', ...this.buildEnv() }) + '\n';
      for (const c of this.clients) if (c.authed) c.sock.write(env);
    }
    const line = JSON.stringify(this.buildFrame()) + '\n';
    for (const c of this.clients) if (c.authed) c.sock.write(line);
  }
}
