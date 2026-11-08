import fs from 'node:fs';
import zlib from 'node:zlib';
import { AcmiLineParser, type AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';

/** Read a Tacview recording (.txt.acmi, or the single-entry .zip.acmi Tacview writes) as text. */
export function readAcmiFile(path: string): string {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf.toString('utf8');
  // ZIP local file header: method @8, name length @26, extra length @28, data @30+n+m.
  const method = buf.readUInt16LE(8);
  const start = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
  const body = buf.subarray(start);
  if (method === 0) return body.toString('utf8');
  if (method !== 8) throw new Error(`unsupported zip compression method ${method}`);
  return zlib.inflateRawSync(body, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
}

export interface ReplayOptions {
  /** playback rate; 0 = as fast as possible */
  speed?: number;
  /** sim seconds to skip to (applied instantly) */
  from?: number;
  /** stop after this sim time */
  until?: number;
  signal?: AbortSignal;
}

/**
 * Plays a recording as an event stream paced by its "#t" frames, standing in for the
 * real-time feed when no mission is running.
 */
export async function replayAcmi(text: string, onEvent: (ev: AcmiEvent) => void, opts: ReplayOptions = {}): Promise<void> {
  const events: AcmiEvent[] = [];
  const parser = new AcmiLineParser((e) => events.push(e));
  parser.push(text);
  parser.end();

  const speed = opts.speed ?? 1;
  const from = opts.from ?? 0;
  const wallStart = Date.now();
  let simStart: number | undefined;

  for (const ev of events) {
    if (opts.signal?.aborted) return;
    if (ev.kind === 'time') {
      if (opts.until !== undefined && ev.t > opts.until) return;
      if (ev.t >= from && speed > 0) {
        simStart ??= ev.t;
        const due = wallStart + ((ev.t - simStart) / speed) * 1000;
        const wait = due - Date.now();
        if (wait > 5) await new Promise((r) => setTimeout(r, wait));
      }
    }
    onEvent(ev);
  }
}
