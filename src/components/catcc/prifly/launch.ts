/** Launch queues (shared ops state): helpers for PriFly's launch tab and the deck's taxi assignments. */
import type { CatStatus, OpsState } from '../../../catcc/core/room/ops.ts';

/** a catapult's launch state (waist cats start DOWN: they sit in the landing area) */
export const catEntry = (ops: OpsState | undefined, k: string): { status: CatStatus; queue: string[] } => ops?.launch?.[k] ?? { status: (k === '3' || k === '4' ? 'down' : 'ready') as CatStatus, queue: [] };

/** the launch queues with a flight moved onto catapult k (or off every catapult with null); launched flights drop out */
export function withQueued(ops: OpsState | undefined, onDeck: Set<string>, key: string, k: string | null) {
  const all: Record<string, { status: CatStatus; queue: string[] }> = {};
  for (const c of ['1', '2', '3', '4']) {
    const cur = catEntry(ops, c);
    const q = cur.queue.filter((x) => onDeck.has(x) && x !== key);
    all[c] = { status: cur.status, queue: c === k ? [...q, key] : q };
  }
  return all;
}
