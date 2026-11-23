import net from 'node:net';
import type { HookEnv, HookFrame, HookMessage, LaunchCmd, PilotEvent, ReplayCmd, ReplayState, ShipCmd } from '../../src/catcc/core/dcs/hookProtocol.ts';

/**
 * Client for the CATCC DCS export hook (protocol v1): newline-delimited JSON, AUTH <token>.
 * Reconnects with backoff. The hook only processes sockets while a mission is running, so a
 * connection to an idle server may sit silent; the handshake timeout recycles it.
 */
export interface HookClientOptions {
  host: string;
  port?: number;
  token: string;
  reconnectMs?: number;
  handshakeTimeoutMs?: number;
  onFrame: (frame: HookFrame) => void;
  onEnv?: (env: HookEnv) => void;
  /** a pilot's mod reported a salute (player name) */
  onSalute?: (player: string) => void;
  /** a pilot's mod reported something else (chocks request, launch bar) */
  onPilotEvent?: (player: string, e: PilotEvent) => void;
  /** a replay source's playback clock (on connect and whenever it changes) */
  onReplay?: (state: ReplayState) => void;
  onStatus?: (status: HookClientStatus) => void;
}

export interface HookClientStatus {
  connected: boolean;
  authed: boolean;
  server?: string;
  /** the hook accepts ship orders */
  cmds?: boolean;
  /** the hook can use the Supercarrier's Air Boss ship control (heading orders, bells, astern) */
  ab?: boolean;
  /** the source is a replay whose playback takes orders (ReplayCmd) */
  replay?: boolean;
  mission?: { state: 'running' | 'stopped'; name: string };
  lastError?: string;
  bytesIn: number;
}

export class HookClient {
  private sock?: net.Socket;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private hsTimer?: NodeJS.Timeout;
  private backoff: number;
  private cmdSeq = 0;
  private readonly waiting = new Map<number, { resolve: (r: { ok: boolean; error?: string }) => void; timer: NodeJS.Timeout }>();
  readonly status: HookClientStatus = { connected: false, authed: false, bytesIn: 0 };
  private readonly opts: HookClientOptions & { port: number; reconnectMs: number; handshakeTimeoutMs: number };

  constructor(opts: HookClientOptions) {
    this.opts = {
      ...opts,
      port: opts.port ?? 10310,
      reconnectMs: opts.reconnectMs ?? 5000,
      handshakeTimeoutMs: opts.handshakeTimeoutMs ?? 30_000,
    };
    this.backoff = this.opts.reconnectMs;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.hsTimer);
    this.sock?.destroy();
  }

  /** Send a ship order; resolves with the hook's reply (or a local failure after 10 s). */
  command(cmd: ShipCmd | LaunchCmd | ReplayCmd): Promise<{ ok: boolean; error?: string }> {
    const sock = this.sock;
    if (!sock || !this.status.authed) return Promise.resolve({ ok: false, error: 'not connected to the DCS hook' });
    // launch holds aren't ship orders: the hook takes them whatever its commands setting
    if (cmd.op === 'replay' && !this.status.replay) return Promise.resolve({ ok: false, error: 'this source is not a replay' });
    if (!this.status.cmds && cmd.op !== 'launch' && cmd.op !== 'replay') return Promise.resolve({ ok: false, error: 'the DCS hook does not accept orders (commands = true in Config/CATCC.lua)' });
    const id = ++this.cmdSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, error: 'no reply from the DCS hook' });
      }, 10_000);
      this.waiting.set(id, { resolve, timer });
      sock.write(`CMD ${JSON.stringify({ id, ...cmd })}\n`);
    });
  }

  private failWaiting(why: string): void {
    for (const [id, w] of this.waiting) {
      clearTimeout(w.timer);
      w.resolve({ ok: false, error: why });
      this.waiting.delete(id);
    }
  }

  private emit(): void {
    this.opts.onStatus?.({ ...this.status });
  }

  private connect(): void {
    const sock = net.connect({ host: this.opts.host, port: this.opts.port });
    this.sock = sock;
    sock.setKeepAlive(true, 10_000);
    sock.setNoDelay(true);
    let buf = '';
    const decoder = new TextDecoder();

    this.hsTimer = setTimeout(() => sock.destroy(new Error('no handshake (mission not running?)')), this.opts.handshakeTimeoutMs);

    sock.on('connect', () => {
      this.status.connected = true;
      this.emit();
    });
    sock.on('data', (chunk: Buffer) => {
      this.status.bytesIn += chunk.length;
      buf += decoder.decode(chunk, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line) this.handle(sock, line);
        nl = buf.indexOf('\n');
      }
      if (buf.length > 16 * 1024 * 1024) sock.destroy(new Error('line too long'));
    });
    sock.on('error', (e) => {
      this.status.lastError = e.message;
    });
    sock.on('close', () => {
      clearTimeout(this.hsTimer);
      this.status.connected = false;
      this.status.authed = false;
      this.failWaiting('connection to the DCS hook lost');
      this.emit();
      if (this.stopped) return;
      this.timer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 60_000);
    });
  }

  private handle(sock: net.Socket, line: string): void {
    let msg: HookMessage;
    try {
      msg = JSON.parse(line) as HookMessage;
    } catch {
      this.status.lastError = `bad JSON: ${line.slice(0, 80)}`;
      return;
    }
    switch (msg.type) {
      case 'hello':
        this.status.server = msg.server;
        this.status.cmds = msg.cmds === true;
        this.status.ab = msg.ab === true;
        this.status.replay = msg.replay === true;
        if (msg.proto !== 1) {
          sock.destroy(new Error(`unsupported hook protocol ${msg.proto}`));
          return;
        }
        sock.write(`AUTH ${this.opts.token}\n`);
        break;
      case 'auth':
        clearTimeout(this.hsTimer);
        this.status.authed = true;
        this.status.lastError = undefined;
        this.backoff = this.opts.reconnectMs;
        this.emit();
        break;
      case 'mission':
        this.status.mission = { state: msg.state, name: msg.name };
        this.emit();
        break;
      case 'error':
        this.status.lastError = msg.error;
        this.emit();
        break;
      case 'cmd': {
        const w = msg.id === null ? undefined : this.waiting.get(msg.id);
        if (w) {
          clearTimeout(w.timer);
          this.waiting.delete(msg.id!);
          w.resolve({ ok: msg.ok, ...(msg.error ? { error: msg.error } : {}) });
        }
        break;
      }
      case 'frame':
        this.opts.onFrame(msg);
        break;
      case 'salute':
        if (typeof msg.p === 'string') this.opts.onSalute?.(msg.p);
        break;
      case 'pilotev':
        if (typeof msg.p === 'string' && (msg.e === 'taxi' || msg.e === 'lb1' || msg.e === 'lb0')) this.opts.onPilotEvent?.(msg.p, msg.e);
        break;
      case 'replay':
        if (typeof msg.playing === 'boolean' && [msg.rate, msg.mt, msg.start, msg.end].every((n) => typeof n === 'number' && Number.isFinite(n))) {
          this.opts.onReplay?.({ playing: msg.playing, rate: msg.rate, mt: msg.mt, start: msg.start, end: msg.end });
        }
        break;
      case 'env': {
        // every HookEnv field is passed on (bulls was being dropped here, so no bullseye reached the scope)
        const env: HookEnv = { start: msg.start, date: msg.date, theatre: msg.theatre, wx: msg.wx, routes: msg.routes, ...(msg.bulls ? { bulls: msg.bulls } : {}) };
        this.opts.onEnv?.(env);
        break;
      }
      default:
        break;
    }
  }
}
