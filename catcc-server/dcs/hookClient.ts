import net from 'node:net';
import type { HookFrame, HookMessage } from '../../src/catcc/core/dcs/hookProtocol.ts';

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
  onStatus?: (status: HookClientStatus) => void;
}

export interface HookClientStatus {
  connected: boolean;
  authed: boolean;
  server?: string;
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
      case 'frame':
        this.opts.onFrame(msg);
        break;
      default:
        break;
    }
  }
}
