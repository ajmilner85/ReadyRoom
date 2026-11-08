import net from 'node:net';

/**
 * Serves a recording over the Tacview real-time protocol, for development when no mission is
 * running. Each client gets its own playback from `from` seconds, paced by "#t" frames.
 * Lines before `from` (the object definitions) are sent immediately, like a real server's
 * initial full-state dump.
 */
export function serveAcmi(text: string, opts: { port: number; speed?: number; from?: number; name?: string }): net.Server {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const speed = opts.speed ?? 1;
  const from = opts.from ?? 0;

  const server = net.createServer((sock) => {
    let closed = false;
    sock.on('close', () => (closed = true));
    sock.on('error', () => (closed = true));
    sock.write(`XtraLib.Stream.0\nTacview.RealTimeTelemetry.0\n${opts.name ?? 'CATCC-replay'}\n\0`);

    let hs = Buffer.alloc(0);
    const onHandshake = (d: Buffer) => {
      hs = Buffer.concat([hs, d]);
      if (hs.indexOf(0) === -1) return;
      sock.off('data', onHandshake);
      void play();
    };
    sock.on('data', onHandshake);

    async function play() {
      const wallStart = Date.now();
      let simStart: number | undefined;
      let batch: string[] = [];
      for (const line of lines) {
        if (closed) return;
        if (line.startsWith('#')) {
          const t = Number(line.slice(1));
          if (t >= from) {
            if (batch.length) sock.write(batch.join('\n') + '\n');
            batch = [];
            simStart ??= t;
            const wait = wallStart + ((t - simStart) / speed) * 1000 - Date.now();
            if (wait > 5) await new Promise((r) => setTimeout(r, wait));
          }
        }
        batch.push(line);
        if (batch.length > 2000) {
          sock.write(batch.join('\n') + '\n');
          batch = [];
        }
      }
      if (batch.length && !closed) sock.write(batch.join('\n') + '\n');
      sock.end();
    }
  });
  server.listen(opts.port);
  return server;
}
