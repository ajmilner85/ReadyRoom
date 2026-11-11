import { applyOpsPatch, cleanOpsPatch, cleanSeat, okFlightKey, sameSeat, type OpsState, type Ownership } from '../../src/catcc/core/room/ops.ts';
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { AcmiLineParser } from '../../src/catcc/core/acmi/parser.ts';
import { HookTrackStore } from '../../src/catcc/core/dcs/hookTrackStore.ts';
import type { OrderPoint, ShipCmd } from '../../src/catcc/core/dcs/hookProtocol.ts';
import { bellFor, hasAirBoss } from '../../src/catcc/core/dcs/bells.ts';
import { formationFor } from '../../src/catcc/core/geometry/formation.ts';
import { orderChanged, stationOrder } from '../../src/catcc/core/geometry/stationKeeping.ts';
import {
  ROOM_PROTO,
  PLAN_ROLES,
  SEAT_ROLES,
  cleanAssignment,
  cleanPlan,
  seatId,
  toWire,
  type Assignment,
  type CarrierPlan,
  type ClientMsg,
  type OrderStatus,
  type RoomUser,
  type SeatHolder,
  type SeatKey,
  type ServerMsg,
  type SourceStatus,
  type WireTrack,
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
  readonly owners: Record<string, Ownership> = {};
  readonly ops: Record<string, OpsState> = {};
  /** the last ship order sent to DCS per ship (carrier hull or escort track id) and its answer */
  readonly orders: Record<string, OrderStatus> = {};
  readonly subscribers = new Set<Conn>();
  /** the latest picture (for ship groups and positions) */
  private tracks: WireTrack[] = [];
  private hook?: HookClient;
  /** what was last sent per ship, to refresh helm orders and skip unchanged station orders */
  private readonly sent = new Map<string, { at: number; pts?: OrderPoint[]; bridge?: boolean }>();
  /** escorts being split out of the carrier's group: track id -> unit name and old group, until the unit shows up in a group of its own */
  private readonly detaching = new Map<string, { un: string; g: string }>();
  private orderTimer?: NodeJS.Timeout;
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
          Object.assign(this.status, { connected: s.connected, authed: s.authed, mission: s.mission, lastError: s.lastError, cmds: s.cmds, ab: s.ab });
          if (s.mission?.state === 'stopped') store.reset();
          if (JSON.stringify(this.status) !== was) this.onStatus();
        },
      });
      client.start();
      this.hook = client;
      this.orderTimer = setInterval(() => this.orderTick(), 15_000);
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
    clearInterval(this.orderTimer);
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
    this.tracks = msg.tracks;
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
    // ownership of flights no longer in the picture is dropped
    const flights = new Set(msg.tracks.flatMap((t) => [t.id, ...(t.g ? [t.g] : [])]));
    let gone = false;
    for (const k of Object.keys(this.owners)) {
      if (!flights.has(k)) {
        delete this.owners[k];
        gone = true;
      }
    }
    if (gone) this.broadcastOwners();
  }

  ordersMsg(): string {
    return JSON.stringify({ t: 'orders', src: this.cfg.id, orders: this.orders } satisfies ServerMsg);
  }

  broadcastOrders(): void {
    const m = this.ordersMsg();
    for (const c of this.subscribers) send(c, m);
  }

  /**
   * A carrier's helm order: through the Air Boss ship control where the hook has it and the ship
   * has the station (a heading order and the nearest bell; astern works), else as a route 60 NM
   * ahead. An Air Boss order DCS refuses falls back to the route.
   */
  private helmOrder(hull: string, g: string, helm: { crs: number; kt: number }): void {
    const route: ShipCmd = { op: 'helm', g, crs: helm.crs, kt: helm.kt };
    if (this.status.ab && hasAirBoss(this.carrierTrack(hull)?.ty)) {
      this.order(hull, 'helm', { op: 'bridge', g, crs: helm.crs, bell: bellFor(helm.kt).id }, route);
    } else this.order(hull, 'helm', route);
  }

  /** Send one ship order to DCS and publish what became of it; a refused Air Boss order is retried as `fallback`. */
  private order(key: string, op: OrderStatus['op'], cmd: ShipCmd | { error: string }, fallback?: ShipCmd): void {
    const at = Date.now();
    if ('error' in cmd) {
      this.orders[key] = { op, at, ok: false, error: cmd.error };
      this.broadcastOrders();
      return;
    }
    if (!this.hook) {
      this.orders[key] = { op, at, ok: false, error: 'this source is a Tacview feed: orders need the DCS hook' };
      this.broadcastOrders();
      return;
    }
    this.sent.set(key, { at, ...(cmd.op === 'route' ? { pts: cmd.pts } : {}), ...(cmd.op === 'bridge' ? { bridge: true } : {}) });
    this.orders[key] = { op, at };
    this.broadcastOrders();
    void this.hook.command(cmd).then((r) => {
      if (this.orders[key]?.at !== at) return; // superseded
      if (!r.ok && fallback) {
        this.log(`[${this.cfg.id}] Air Boss order for ${key} refused (${r.error}); sending it as a route`);
        this.order(key, op, fallback);
        return;
      }
      this.orders[key] = { op, at, ok: r.ok, ...(r.error ? { error: r.error } : {}) };
      this.log(`[${this.cfg.id}] ${op} order for ${key}: ${r.ok ? 'ok' : r.error}`);
      this.broadcastOrders();
    });
  }

  private carrierTrack(hull: string): WireTrack | undefined {
    return this.tracks.find((t) => t.k === 'carrier' && t.hull === hull);
  }

  /** A carrier's plan changed: a new helm order or a route to follow goes to DCS. */
  onPlan(carrier: string, prev: CarrierPlan | undefined, next: CarrierPlan): void {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const g = this.carrierTrack(carrier)?.g;
    if (next.route?.active && !same(prev?.route, next.route)) {
      this.order(carrier, 'route', g ? { op: 'route', g, pts: next.route.pts } : { error: `no DCS group found for ${carrier}` });
    } else if (next.helm && (!same(prev?.helm, next.helm) || (prev?.route?.active && !next.route?.active))) {
      if (g) this.helmOrder(carrier, g, next.helm);
      else this.order(carrier, 'helm', { error: `no DCS group found for ${carrier}` });
    }
  }

  /**
   * Every 15 s: helm orders are re-sent before the ship reaches the end of the 60 NM leg, and escorts of a
   * formation the bridge drives are ordered (again) toward their stations.
   */
  private orderTick(): void {
    if (!this.hook || !this.status.authed || !this.status.cmds) return;
    const now = Date.now();
    for (const [hull, plan] of Object.entries(this.plans)) {
      const last = this.sent.get(hull);
      const g = this.carrierTrack(hull)?.g;
      // (an Air Boss heading order holds by itself: nothing to re-send)
      if (plan.helm && !plan.route?.active && g && last && !last.bridge && this.orders[hull]?.ok && now - last.at > 10 * 60_000) {
        this.order(hull, 'helm', { op: 'helm', g, crs: plan.helm.crs, kt: plan.helm.kt });
      }
    }
    this.rekeyDetached();
    for (const [hull, ops] of Object.entries(this.ops)) {
      if (!ops.formation?.drive) continue;
      const cv = this.carrierTrack(hull);
      if (!cv) continue;
      const stations = formationFor(ops.formation, Object.keys(ops.formation.presets[ops.formation.active] ?? {})).presets[ops.formation.active] ?? {};
      const crs = cv.crs ?? cv.hdg ?? 0;
      const axis = this.plans[hull]?.helm?.crs ?? crs;
      for (const [id, st] of Object.entries(stations)) {
        const t = this.tracks.find((x) => x.id === id);
        if (!t?.g) continue;
        if (t.g === cv.g) {
          // in the carrier's own DCS group it keeps DCS's formation: split it out (once), then order it
          if (this.detaching.has(id)) continue;
          if (!t.un) {
            if (!this.orders[id]) this.order(id, 'station', { error: `${t.g}: no unit name to detach it by` });
            continue;
          }
          this.detaching.set(id, { un: t.un, g: t.g });
          this.order(id, 'station', { op: 'detach', g: t.g, u: t.un });
          continue;
        }
        const pts = stationOrder(st, axis, { lat: cv.lat, lon: cv.lon, crs, kt: cv.gs ?? 0 }, t);
        if (!pts) continue;
        const prev = this.sent.get(id);
        if (!orderChanged(prev?.pts, pts, prev ? (now - prev.at) / 1000 : Infinity)) continue;
        this.order(id, 'station', { op: 'route', g: t.g, pts });
      }
    }
  }

  /**
   * A detached escort comes back as a new DCS unit: if DCS gave it a new unit id, its formation
   * stations (keyed by track id) and order status move to the new track, found by unit name.
   */
  private rekeyDetached(): void {
    for (const [oldId, { un, g }] of this.detaching) {
      // (a refused detach leaves the unit in its old group: it stays here, and isn't retried)
      const now = this.tracks.find((t) => t.un === un && t.g !== g && (t.k === 'ship' || t.k === 'carrier'));
      if (!now) continue;
      this.detaching.delete(oldId);
      if (now.id === oldId) continue;
      let changed = false;
      for (const ops of Object.values(this.ops)) {
        for (const preset of Object.values(ops.formation?.presets ?? {})) {
          if (!(oldId in preset)) continue;
          preset[now.id] = preset[oldId];
          delete preset[oldId];
          changed = true;
        }
      }
      if (this.orders[oldId]) {
        this.orders[now.id] = this.orders[oldId];
        delete this.orders[oldId];
      }
      this.sent.delete(oldId);
      if (changed) this.broadcastOps();
      this.broadcastOrders();
    }
  }

  ownersMsg(): string {
    return JSON.stringify({ t: 'owners', src: this.cfg.id, owners: this.owners } satisfies ServerMsg);
  }

  opsMsg(): string {
    return JSON.stringify({ t: 'ops', src: this.cfg.id, ops: this.ops } satisfies ServerMsg);
  }

  broadcastOwners(): void {
    const m = this.ownersMsg();
    for (const c of this.subscribers) send(c, m);
  }

  broadcastOps(): void {
    const m = this.opsMsg();
    for (const c of this.subscribers) send(c, m);
  }

  /** A user may act for a seat they hold, or for one nobody holds (its work rolls up to whoever is there). */
  mayActFor(userId: string, seat: SeatKey): boolean {
    const h = this.seats.get(seatId(seat));
    return !h || h.userId === userId;
  }

  /** Ops state is edited by anyone holding a seat on the carrier, or by anyone while none are held. */
  mayEditOps(userId: string, carrier: string): boolean {
    const relevant = [...this.seats.values()].filter((s) => s.carrier === carrier || s.carrier === '*');
    return relevant.length === 0 || relevant.some((s) => s.userId === userId);
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
    const relevant = [...this.seats.values()].filter((s) => (s.carrier === carrier || s.carrier === '*') && PLAN_ROLES.includes(s.role));
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
        send(c, src.ownersMsg());
        send(c, src.opsMsg());
        send(c, src.ordersMsg());
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
        const prev = src.plans[msg.carrier];
        src.plans[msg.carrier] = plan;
        src.broadcastPlans();
        src.onPlan(msg.carrier, prev, plan);
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
      case 'handoff': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        const from = cleanSeat(msg.from);
        const to = msg.to === null ? null : cleanSeat(msg.to);
        if (!okFlightKey(msg.key) || !from || (msg.to !== null && !to)) return send(c, { t: 'error', error: 'invalid handoff' });
        const cur = src.owners[msg.key];
        const owner = cur?.owner ?? from;
        if (!src.mayActFor(c.user.userId, owner)) return send(c, { t: 'error', error: 'only the owning seat can hand this flight off' });
        if (to && sameSeat(to, owner)) return send(c, { t: 'error', error: 'already owned by that seat' });
        src.owners[msg.key] = to ? { owner, pending: { to, at: Date.now() } } : { owner };
        src.broadcastOwners();
        return;
      }
      case 'accept': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        const cur = okFlightKey(msg.key) ? src.owners[msg.key] : undefined;
        if (!cur?.pending) return send(c, { t: 'error', error: 'no handoff pending' });
        if (!src.mayActFor(c.user.userId, cur.pending.to)) return send(c, { t: 'error', error: 'that handoff is for another seat' });
        src.owners[msg.key] = { owner: cur.pending.to };
        src.broadcastOwners();
        return;
      }
      case 'ops': {
        const src = this.sources.get(msg.src);
        if (!src) return send(c, { t: 'error', error: `unknown source ${msg.src}` });
        const patch = cleanOpsPatch(msg.patch);
        if (!patch || typeof msg.carrier !== 'string' || msg.carrier.length < 1 || msg.carrier.length > 16) return send(c, { t: 'error', error: 'invalid ops update' });
        if (!src.mayEditOps(c.user.userId, msg.carrier)) return send(c, { t: 'error', error: `claim a ${msg.carrier} seat to change this` });
        src.ops[msg.carrier] = applyOpsPatch(src.ops[msg.carrier] ?? {}, patch);
        src.broadcastOps();
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
