import type { OpsState, Ownership } from '../../src/catcc/core/room/ops.ts';
import type { Assignment, CarrierPlan, SeatHolder } from '../../src/catcc/core/room/protocol.ts';

/**
 * What the room keeps across restarts (an SDOBot deploy restarts it), per DCS source and mission:
 * the shared plans, ops, marshal assignments, flight ownership and seat claims. Orders sent to DCS
 * and launch clearances are transient and not kept.
 */
export interface PersistedState {
  plans?: Record<string, CarrierPlan>;
  ops?: Record<string, OpsState>;
  assignments?: Record<string, Assignment>;
  owners?: Record<string, Ownership>;
  seats?: SeatHolder[];
}

export interface RoomStore {
  load(source: string, mission: string): Promise<PersistedState | null>;
  save(source: string, mission: string, state: PersistedState): Promise<void>;
}

/** Supabase table public.catcc_room_state (service key only: RLS on, no policies). */
export function supabaseStore(url: string, serviceKey: string, log: (m: string) => void = () => undefined): RoomStore {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
  const base = `${url}/rest/v1/catcc_room_state`;
  return {
    async load(source, mission) {
      try {
        const q = `?source_id=eq.${encodeURIComponent(source)}&mission=eq.${encodeURIComponent(mission)}&select=state&limit=1`;
        const res = await fetch(base + q, { headers });
        if (!res.ok) {
          log(`state load failed: HTTP ${res.status}`);
          return null;
        }
        const [row] = (await res.json()) as { state: PersistedState }[];
        return row?.state ?? null;
      } catch (e) {
        log(`state load failed: ${(e as Error).message}`);
        return null;
      }
    },
    async save(source, mission, state) {
      try {
        const res = await fetch(base, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ source_id: source, mission, state, updated_at: new Date().toISOString() }]),
        });
        if (!res.ok) log(`state save failed: HTTP ${res.status}`);
      } catch (e) {
        log(`state save failed: ${(e as Error).message}`);
      }
    },
  };
}

/** In-memory store, for tests and local development. */
export function memoryStore(): RoomStore & { rows: Map<string, PersistedState> } {
  const rows = new Map<string, PersistedState>();
  return {
    rows,
    async load(source, mission) {
      const s = rows.get(`${source}|${mission}`);
      return s ? (JSON.parse(JSON.stringify(s)) as PersistedState) : null;
    },
    async save(source, mission, state) {
      rows.set(`${source}|${mission}`, JSON.parse(JSON.stringify(state)) as PersistedState);
    },
  };
}
