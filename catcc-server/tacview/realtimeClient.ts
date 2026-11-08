import net from 'node:net';

/**
 * Tacview real-time telemetry client (read-only).
 *
 * Handshake: the server sends
 *   "XtraLib.Stream.0\nTacview.RealTimeTelemetry.0\n<host name>\n\0"
 * and the client answers in kind with its name and a password hash ("0" when the server
 * has no password; password-protected servers are not supported yet). After that the server
 * streams plain ACMI text: header, full current state, then incremental updates.
 *
 * On every (re)connect the server resends the full state, so consumers must reset their
 * track store in onConnect.
 */
export interface TacviewRealtimeOptions {
  host: string;
  port?: number;
  clientName?: string;
  reconnectMs?: number;
  onConnect?: (serverName: string) => void;
  onText: (text: string) => void;
  onDisconnect?: (reason: string) => void;
}

export class TacviewRealtimeClient {
  private sock?: net.Socket;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  bytesIn = 0;
  private readonly opts: Required<Omit<TacviewRealtimeOptions, 'onConnect' | 'onDisconnect'>> &
    Pick<TacviewRealtimeOptions, 'onConnect' | 'onDisconnect'>;

  constructor(opts: TacviewRealtimeOptions) {
    this.opts = {
      ...opts,
      port: opts.port ?? 42674,
      clientName: opts.clientName ?? 'CATCC',
      reconnectMs: opts.reconnectMs ?? 5000,
    };
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.sock?.destroy();
  }

  private connect(): void {
    const { host, port } = this.opts;
    const sock = net.connect({ host, port });
    this.sock = sock;
    sock.setKeepAlive(true, 10_000);
    let handshake: Buffer | null = Buffer.alloc(0);
    const decoder = new TextDecoder('utf-8');

    sock.on('data', (chunk: Buffer) => {
      this.bytesIn += chunk.length;
      if (handshake) {
        handshake = Buffer.concat([handshake, chunk]);
        const z = handshake.indexOf(0);
        if (z === -1) return;
        const lines = handshake.subarray(0, z).toString('utf8').split('\n');
        if (lines[0] !== 'XtraLib.Stream.0' || lines[1] !== 'Tacview.RealTimeTelemetry.0') {
          sock.destroy(new Error(`unexpected handshake: ${JSON.stringify(lines.slice(0, 2))}`));
          return;
        }
        sock.write(`XtraLib.Stream.0\nTacview.RealTimeTelemetry.0\n${this.opts.clientName}\n0\0`);
        const rest = handshake.subarray(z + 1);
        handshake = null;
        this.opts.onConnect?.(lines[2] ?? '');
        if (rest.length) this.opts.onText(decoder.decode(rest, { stream: true }));
        return;
      }
      this.opts.onText(decoder.decode(chunk, { stream: true }));
    });

    let reason = 'closed';
    sock.on('error', (e) => {
      reason = e.message;
    });
    sock.on('close', () => {
      this.opts.onDisconnect?.(reason);
      if (!this.stopped) this.timer = setTimeout(() => this.connect(), this.opts.reconnectMs);
    });
  }
}
