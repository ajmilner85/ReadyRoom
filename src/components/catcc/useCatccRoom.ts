import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import type { HookEnv } from '../../catcc/core/dcs/hookProtocol.ts';
import type { Assignment, CarrierPlan, RoomUser, SeatHolder, SeatKey, ServerMsg, SourceStatus, WireTrack } from '../../catcc/core/room/protocol.ts';
import type { OpsState, Ownership } from '../../catcc/core/room/ops.ts';
import type { Trail } from './scopeModel.ts';

/**
 * Room service URL: ?ws=... (dev override), else VITE_CATCC_WS_URL, else VITE_API_URL with
 * http(s) -> ws(s) and /catcc/ws (the room runs inside SDOBot for now).
 */
export function catccWsUrl(): string {
  const qs = new URLSearchParams(window.location.search).get('ws');
  if (qs) return qs;
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_CATCC_WS_URL) return env.VITE_CATCC_WS_URL;
  // Local development: the standalone room (npm run catcc:room) on port 3002.
  if (import.meta.env.DEV) return 'ws://localhost:3002/catcc/ws';
  const api = env.VITE_API_URL || 'http://localhost:3001';
  return api.replace(/^http/, 'ws').replace(/\/$/, '') + '/catcc/ws';
}

export type ConnState = 'connecting' | 'open' | 'closed' | 'denied';

export interface RoomState {
  conn: ConnState;
  user?: RoomUser;
  sources: SourceStatus[];
  src?: string;
  seats: SeatHolder[];
  plans: Record<string, CarrierPlan>;
  env?: HookEnv;
  assignments: Record<string, Assignment>;
  /** flight key → owner seat and pending handoff */
  owners: Record<string, Ownership>;
  /** carrier hull → shared ops state */
  ops: Record<string, OpsState>;
  tracks: WireTrack[];
  /** model time (s) and UTC of the latest frame */
  mt: number;
  utc?: Date;
  theatre?: string;
  lastFrameAt?: number;
  error?: string;
}

const HISTORY_S = 40;

export function useCatccRoom(preferredSrc?: string) {
  const [state, setState] = useState<RoomState>({ conn: 'connecting', sources: [], seats: [], plans: {}, assignments: {}, owners: {}, ops: {}, tracks: [], mt: 0 });
  const history = useRef(new Map<string, Trail[]>());
  const wsRef = useRef<WebSocket | null>(null);
  const srcRef = useRef<string | undefined>(preferredSrc);

  const send = useCallback((m: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;

    const connect = () => {
      setState((s) => ({ ...s, conn: 'connecting' }));
      const ws = new WebSocket(catccWsUrl());
      wsRef.current = ws;

      ws.onopen = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setState((s) => ({ ...s, conn: 'denied', error: 'Not signed in' }));
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ t: 'auth', token }));
      };

      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMsg;
        switch (m.t) {
          case 'hello': {
            backoff = 1000;
            const pick =
              (srcRef.current && m.sources.find((s) => s.id === srcRef.current)?.id) ??
              m.sources.find((s) => s.kind === 'hook')?.id ??
              m.sources[0]?.id;
            srcRef.current = pick;
            setState((s) => ({ ...s, conn: 'open', user: m.user, sources: m.sources, src: pick, error: undefined }));
            if (pick) ws.send(JSON.stringify({ t: 'subscribe', src: pick }));
            break;
          }
          case 'status':
            setState((s) => ({ ...s, sources: m.sources }));
            break;
          case 'seats':
            if (m.src === srcRef.current) setState((s) => ({ ...s, seats: m.seats }));
            break;
          case 'plans':
            if (m.src === srcRef.current) setState((s) => ({ ...s, plans: m.plans }));
            break;
          case 'env':
            if (m.src === srcRef.current) setState((s) => ({ ...s, env: m.env }));
            break;
          case 'assignments':
            if (m.src === srcRef.current) setState((s) => ({ ...s, assignments: m.assignments }));
            break;
          case 'owners':
            if (m.src === srcRef.current) setState((s) => ({ ...s, owners: m.owners }));
            break;
          case 'ops':
            if (m.src === srcRef.current) setState((s) => ({ ...s, ops: m.ops }));
            break;
          case 'frame': {
            if (m.src !== srcRef.current) break;
            const h = history.current;
            const seen = new Set<string>();
            for (const t of m.tracks) {
              seen.add(t.id);
              let arr = h.get(t.id);
              if (!arr) h.set(t.id, (arr = []));
              if (!arr.length || arr[arr.length - 1].t < m.mt) arr.push({ t: m.mt, lat: t.lat, lon: t.lon });
              while (arr.length > 2 && arr[0].t < m.mt - HISTORY_S) arr.shift();
            }
            for (const id of h.keys()) if (!seen.has(id)) h.delete(id);
            setState((s) => ({
              ...s,
              tracks: m.tracks,
              mt: m.mt,
              utc: m.utc ? new Date(m.utc) : undefined,
              theatre: m.theatre,
              lastFrameAt: Date.now(),
            }));
            break;
          }
          case 'error':
            setState((s) => ({ ...s, error: m.error }));
            break;
          default:
            break;
        }
      };

      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        const denied = ev.code === 4003;
        setState((s) => ({ ...s, conn: denied ? 'denied' : 'closed' }));
        retry = setTimeout(connect, denied ? 30_000 : backoff);
        backoff = Math.min(backoff * 2, 15_000);
      };
    };

    connect();
    const ping = setInterval(() => send({ t: 'ping' }), 25_000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [send]);

  const selectSource = useCallback(
    (src: string) => {
      srcRef.current = src;
      history.current.clear();
      setState((s) => ({ ...s, src, tracks: [], seats: [], plans: {}, assignments: {}, owners: {}, ops: {}, env: undefined }));
      send({ t: 'subscribe', src });
    },
    [send],
  );
  const claim = useCallback((seat: SeatKey) => send({ t: 'claim', src: srcRef.current, seat }), [send]);
  const release = useCallback((seat: SeatKey) => send({ t: 'release', src: srcRef.current, seat }), [send]);
  const setPlan = useCallback((carrier: string, plan: CarrierPlan) => send({ t: 'plan', src: srcRef.current, carrier, plan }), [send]);
  const assign = useCallback(
    (trackId: string, assignment: Assignment | null) => send({ t: 'assign', src: srcRef.current, trackId, assignment }),
    [send],
  );
  const handoff = useCallback((key: string, from: SeatKey, to: SeatKey | null) => send({ t: 'handoff', src: srcRef.current, key, from, to }), [send]);
  const accept = useCallback((key: string) => send({ t: 'accept', src: srcRef.current, key }), [send]);
  const setOps = useCallback((carrier: string, patch: Partial<OpsState> | Record<string, unknown>) => send({ t: 'ops', src: srcRef.current, carrier, patch }), [send]);
  const clearError = useCallback(() => setState((s) => ({ ...s, error: undefined })), []);

  return { state, history: history.current, selectSource, claim, release, setPlan, assign, handoff, accept, setOps, clearError };
}
