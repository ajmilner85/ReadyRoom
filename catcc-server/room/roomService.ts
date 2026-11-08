import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { AcmiLineParser } from '../../src/catcc/core/acmi/parser.ts';
import { HookTrackStore } from '../../src/catcc/core/dcs/hookTrackStore.ts';
import {
  ROOM_PROTO,
  SEAT_ROLES,
  cleanAssignment,
  cleanPlan,
  seatId,
  toWire,
  type Assignment,
  type CarrierPlan,
  type ClientMsg,
  type RoomUser,
  type SeatHolder,
  type SeatKey,
  type ServerMsg,
  type SourceStatus,
} from '../../src/catcc/core/room/protocol.ts';
import { TrackStore, type Track } from '../../src/catcc/core/tracks/trackStore.ts';
import { HookClient } from '../dcs/hookClient.ts';
import { TacviewRealtimeClient } from '../tacview/realtimeClient.ts';
import type { VerifyToken } from './auth.ts';

export type SourceConfig =
  | { id: string; name: string; kind: 'hook'; host: string; port?: number; token: string }
  | { id: string; name: string; kind: 'tacview'; host: string; port?: number };

export interface RoomOptions {
  sources: SourceConfig[];
  verify: VerifyToken;
  path?: string;
  seatGraceMs?: number;
  authTimeoutMs?: number;
  log?: (msg: string) => void;
}

interface Conn {
  ws: WebSocket;
  user?: RoomUser;
  subs: Set<string>;
  alive: boolean;
}

class Source {
  readonly status: SourceStatus;
  readonly seats = new Map<string, SeatHolder>();
  readonly plans: Record<string, CarrierPlan> = {};
  readonly assignments: Record<string, Assignment> = {};
  readonly subscribers = new Set<Conn>();
  private seq = 0;
  private stopFn?: () => void;
  private timer?: NodeJS.Timeout;
  lastFrame?: string;
  lastEnv?: string;
  readonly cfg: SourceConfig;
  private readonly onStatus: () => void;
  private readonly log: (m: string) => void;

  constructor(cfg: SourceConfig, onStatus: () => void, log: (m: string) => void) {
    this.cfg = cfg;
    this.onStatus = onStatus;
    this.log = log;
    this.status = { id: cfg.id, name: cfg.name, kind: cfg.kind, connected: false };
  }

  start(): void {
    const cfg = this.cfg;
    if (cfg.kind === 'hook') {
      const store = new HookTrackStore();
      const client = new HookClient({
        host: cfg.host,
        port: cfg.port,
        token: cfg.token,
        onFrame: (frame) => {
          store.applyFrame(frame);
          if (frame.err) this.log(`[${cfg.id}] sampler error: ${frame.err}`);
          this.publish(store.t, store.utc, frame.theatre ?? undefined, store.tracks.values());
        },
        onEnv: (env) => {
          const m = JSON.stringify({ t: 'env', src: cfg.id, env } satisfies ServerMsg);
          if (m === this.lastEnv) return;
          this.lastEnv = m;
          for (const c of this.subscribers) send(c, m);
        },
        onStatus: (s) => {
          const was = JSON.stringify(this.status);
          Object.assign(this.status, { connected: s.connected, authed: s.authed, mission: s.mission, lastError: s.lastError });
          if (s.mission?.state === 'stopped') store.reset();
          if (JSON.stringify(this.status) !== was) this.onStatus();
        },
      });
      client.start();
      this.stopFn = () => client.stop();
    } else {
      const store = new TrackStore();
      const parser = new AcmiLineParser((ev) => store.apply(ev));
      const client = new TacviewRealtimeClient({
        host: cfg.host,
        port: cfg.port,
        clientName: 'CATCC-room',
        onConnect: () => {
          store.reset();
          this.status.connected = true;
          this.status.lastError = undefined;
          this.onStatus();
        },
        onText: (text) => parser.push(text),
        onDisconnect: (why) => {
          this.status.connected = false;
          this.status.lastError = why;
          this.onStatus();
        },
      });
      client.start();
      this.timer = setInterval(() => {
        if (store.tracks.size) this.publish(store.t, store.utc, undefined, store.tracks.values());
      }, 1000);
      this.stopFn = () => client.stop();
    }
  }

  stop(): void {
    clearInterval(this.timer);
    this.stopFn?.();
  }

  private publish(mt: number, utc: Date | undefined, theatre: string | undefined, tracks: Iterable<Track>): void {
    const msg: ServerMsg = {
      t: 'frame',
      src: this.cfg.id,
      seq: ++this.seq,
      mt,
      utc: utc?.toISOString(),
      theatre,
      tracks: [...tracks].map(toWire),
    };
    this.lastFrame = JSON.stringify(msg);
    this.status.lastFrameAt = Date.now();
    for (const c of this.subscribers) send(c, this.lastFrame);
    // assignments for aircraft that have left the picture are dropped
    const live = new Set(msg.tracks.map((t) => t.id));
    let dropped = false;
    for (const id of Object.keys(this.assignments)) {
      if (!live.has(id)) {
        delete this.assignments[id];
        dropped = true;
      }
    }
    if (dropped) this.broadcastAssignments();
  }

  seatsMsg(): string {
    return JSON.stringify({ t: 'seats', src: this.cfg.id, seats: [...this.seats.values()] } satisfies ServerMsg);
  }

  plansMsg(): string {
    return JSON.stringify({ t: 'plans', src: this.cfg.id, plans: this.plans } satisfies ServerMsg);
  }

  assignmentsMsg(): string {
    return JSON.stringify({ t: 'assignments', src: this.cfg.id, assignments: this.assignments } satisfies ServerMsg);
  }

  broadcastPlans(): void {
    const m = this.plansMsg();
    for (const c of this.subscribers) send(c, m);
  }

  broadcastAssignments(): void {
    const m = this.assignmentsMsg();
    for (const c of this.subscribers) send(c, m);
  }

  /** Open to all until someone holds a seat on this carrier (or MC); then seat holders only. */
  mayEdit(userId: string, carrier: string): boolean {
    const relevant = [...this.seats.values()].filter((s) => s.carrier === carrier || s.carrier === '*');
    return relevant.length === 0 || relevant.some((s) => s.userId === userId);
  }

  broadcastSeats(): void {
    const m = this.seatsMsg();
    for (const c of this.subscribers) send(c, m);
  }
}

function send(c: Conn, data: string | ServerMsg): void {
  if (c.ws.readyState !== 1) return;
  // Skip frames for clients that are badly backed up rather than buffering without bound.
  if (c.ws.bufferedAmount > 4 * 1024 * 1024) return;
  c.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

function validSeat(s: unknown): s is SeatKey {
  if (!s || typeof s !== 'object') return false;
  const { carrier, role } = s as SeatKey;
  if (typeof carrier !== 'string' || carrier.length < 1 || carrier.length > 16) return false;
  if (!SEAT_ROLES.includes(role)) return false;
  return role === 'mission_commander' ? carrier === '*' : carrier !== '*';
}

export class RoomService {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: { threshold: 1024 } });
  private readonly sources = new Map<string, Source>();
  private readonly conns = new Set<Conn>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private heartbeat?: NodeJS.Timeout;
  private readonly opts: Required<Omit<RoomOptions, 'log'>> & { log: (m: string) => void };

  constructor(opts: RoomOptions) {
    this.opts = {
      sources: opts.sources,
      verify: opts.verify,
      path: opts.path ?? '/catcc/ws',
      seatGraceMs: opts.seatGraceMs ?? 60_000,
      authTimeoutMs: opts.authTimeoutMs ?? 10_000,
      log: opts.log ?? ((m) => console.log(`[CATCC] ${m}`)),
    };
    for (const cfg of opts.sources) {
      this.sources.set(cfg.id, new Source(cfg, () => this.broadcastStatus(), this.opts.log));
    }
  }

  get path(): string {
    return this.opts.path;
  }

  start(): void {
    for (const s of this.sources.values()) s.start();
    this.heartbeat = setInterval(() => {
      for (const c of this.conns) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 30_000);
    this.opts.log(`room started with sources: ${[...this.sources.keys()].join(', ') || '(none)'}`);
  }

  stop(): void {
    clearInterval(this.heartbeat);
    for (const s of this.sources.values()) s.stop();
    for (const c of this.conns) c.ws.terminate();
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.wss.close();
  }

  /** Attach to an existing HTTP server; only upgrades on our path are taken. */
  attach(server: http.Server): void {
    server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
      socket.on('error', () => undefined);
      const url = req.url ?? '';
      if (url !== this.opts.path && !url.startsWith(`${this.opts.path}?`)) {
        // Leave other paths to other upgrade handlers; if we're the only one, refuse cleanly.
        if (server.listenerCount('upgrade') === 1) socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });
  }

  private statusList(): SourceStatus[] {
    return [...this.sources.values()].map((s) => ({ ...s.status }));
  }

  private broadcastStatus(): void {
    const m = JSON.stringify({ t: 'status', sources: this.statusList() } satisfies ServerMsg);
    for (const c of this.conns) if (c.user) send(c, m);
  }

  private onConnection(ws: WebSocket): void {
    const c: Conn = { ws, subs: new Set(), alive: true };
    this.conns.add(c);
    const authTimer = setTimeout(() => {
      if (!c.user) ws.close(4001, 'auth timeout');
    }, this.opts.authTimeoutMs);
    ws.on('pong', () => (c.alive = true));
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data)) as ClientMsg;
      } catch {
        send(c, { t: 'error', error: 'bad json' });
        return;
      }
      void this.onMessage(c, msg, authTimer);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      this.conns.delete(c);
      for (const id of c.subs) this.sources.get(id)?.subscribers.delete(c);
      if (c.user) this.onUserMaybeGone(c.user.userId);
    });
    ws.on('error', () => undefined);
  }

  private async onMessage(c: Conn, msg: ClientMsg, authTimer: NodeJS.Timeout): Promise<void> {
    if (!c.user) {
      if (msg.t !== 'auth' || typeof msg.token !== 'string') {
        c.ws.close(4001, 'auth required');
        return;
      }
      const user = await this.opts.verify(msg.token);
      if (!user) {
        c.ws.close(4003, 'auth failed');
        return;
      }
      clearTimeout(authTimer);
      c.user = user;
      this.onUserBack(user.userId);
      send(c, { t: 'hello', proto: ROOM_PROTO, user, sources: this.statusList() });
      return;
    }
    switch (msg.t) {
      case 'ping':
        send(c, { t: 'pong' });
        return;
      case 'subscribe': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        c.subs.add(src.cfg.id);
        src.subscribers.add(c);
        send(c, src.seatsMsg());
        send(c, src.plansMsg());
        send(c, src.assignmentsMsg());
        if (src.lastEnv) send(c, src.lastEnv);
        if (src.lastFrame) send(c, src.lastFrame);
        return;
      }
      case 'plan': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        const plan = cleanPlan(msg.plan);
        if (!plan || typeof msg.carrier !== 'string' || msg.carrier.length > 16) return send(c, { t: 'error', error: 'invalid plan' });
        if (!src.mayEdit(c.user.userId, msg.carrier)) return send(c, { t: 'error', error: `claim a ${msg.carrier} seat to edit its radials` });
        src.plans[msg.carrier] = plan;
        src.broadcastPlans();
        return;
      }
      case 'assign': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        if (typeof msg.trackId !== 'string' || msg.trackId.length > 32) return send(c, { t: 'error', error: 'invalid track' });
        const a = msg.assignment === null ? null : cleanAssignment(msg.assignment);
        if (msg.assignment !== null && !a) return send(c, { t: 'error', error: 'invalid assignment' });
        const carrier = a?.carrier ?? src.assignments[msg.trackId]?.carrier ?? '*';
        if (!src.mayEdit(c.user.userId, carrier)) return send(c, { t: 'error', error: `claim a ${carrier} seat to assign` });
        if (a) src.assignments[msg.trackId] = a;
        else delete src.assignments[msg.trackId];
        src.broadcastAssignments();
        return;
      }
      case 'claim':
      case 'release': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        if (!validSeat(msg.seat)) return send(c, { t: 'error', error: 'invalid seat' });
        const key = seatId(msg.seat);
        const held = src.seats.get(key);
        if (msg.t === 'claim') {
          if (held && held.userId !== c.user.userId) return send(c, { t: 'error', error: `seat held by ${held.name}` });
          src.seats.set(key, { ...msg.seat, userId: c.user.userId, name: c.user.name, board: c.user.board, since: held?.since ?? Date.now() });
        } else {
          if (!held || held.userId !== c.user.userId) return send(c, { t: 'error', error: 'not your seat' });
          src.seats.delete(key);
        }
        src.broadcastSeats();
        return;
      }
      default:
        send(c, { t: 'error', error: 'unknown message' });
    }
  }

  private userConnected(userId: string): boolean {
    for (const c of this.conns) if (c.user?.userId === userId) return true;
    return false;
  }

  private onUserMaybeGone(userId: string): void {
    if (this.userConnected(userId)) return;
    let anyChanged = false;
    for (const src of this.sources.values()) {
      let changed = false;
      for (const seat of src.seats.values()) {
        if (seat.userId === userId && !seat.away) {
          seat.away = true;
          changed = true;
        }
      }
      if (changed) src.broadcastSeats();
      anyChanged ||= changed;
    }
    if (!anyChanged) return;
    clearTimeout(this.graceTimers.get(userId));
    this.graceTimers.set(
      userId,
      setTimeout(() => {
        this.graceTimers.delete(userId);
        for (const src of this.sources.values()) {
          let removed = false;
          for (const [k, seat] of src.seats) {
            if (seat.userId === userId && seat.away) {
              src.seats.delete(k);
              removed = true;
            }
          }
          if (removed) src.broadcastSeats();
        }
      }, this.opts.seatGraceMs),
    );
  }

  private onUserBack(userId: string): void {
    clearTimeout(this.graceTimers.get(userId));
    this.graceTimers.delete(userId);
    for (const src of this.sources.values()) {
      let changed = false;
      for (const seat of src.seats.values()) {
        if (seat.userId === userId && seat.away) {
          seat.away = false;
          changed = true;
        }
      }
      if (changed) src.broadcastSeats();
    }
  }
}
