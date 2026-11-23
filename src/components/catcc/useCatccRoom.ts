import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import type { HookEnv, ReplayCommand, ReplayState } from '../../catcc/core/dcs/hookProtocol.ts';
import { distanceNm, implausibleMove } from '../../catcc/core/geo.ts';
import { CLOSE_AUTH_FAILED, CLOSE_FORBIDDEN, type Assignment, type CarrierPlan, type OrderStatus, type RoomUser, type SeatHolder, type SeatKey, type ServerMsg, type SourceStatus, type WireTrack } from '../../catcc/core/room/protocol.ts';
import type { OpsState, Ownership } from '../../catcc/core/room/ops.ts';
import type { LaunchState } from '../../catcc/core/room/launch.ts';
import { SHIP_HISTORY_S, type Trail } from './scopeModel.ts';

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

/** denied: the sign-in isn't valid; forbidden: signed in, but not a member of the wing (see `refused`) */
export type ConnState = 'connecting' | 'open' | 'closed' | 'denied' | 'forbidden';

export interface RoomState {
  conn: ConnState;
  user?: RoomUser;
  sources: SourceStatus[];
  src?: string;
  seats: SeatHolder[];
  plans: Record<string, CarrierPlan>;
  env?: HookEnv;
  assignments: Record<string, Assignment>;
  /** interceptor track id → target track id (committed intercept assignments) */
  intercepts: Record<string, string>;
  /** flight key → owner seat and pending handoff */
  owners: Record<string, Ownership>;
  /** track id → the carrier hull the aircraft spawned on (core/room/spawns.ts); aircraft that started elsewhere are absent */
  spawns: Record<string, string>;
  /** carrier hull → shared ops state */
  ops: Record<string, OpsState>;
  /** ship (carrier hull or escort track id) → the last order sent to DCS and its answer */
  orders: Record<string, OrderStatus>;
  /** carrier hull → launch clearance */
  launch: Record<string, LaunchState>;
  /** the source is a replay: its playback clock (the header's replay controls) */
  replay?: ReplayState;
  tracks: WireTrack[];
  /** model time (s) and UTC of the latest frame */
  mt: number;
  utc?: Date;
  theatre?: string;
  lastFrameAt?: number;
  error?: string;
  /** why the room refused this user (conn 'forbidden') */
  refused?: string;
}

const HISTORY_S = 40;

export function useCatccRoom(preferredSrc?: string) {
  const [state, setState] = useState<RoomState>({ conn: 'connecting', sources: [], seats: [], plans: {}, assignments: {}, intercepts: {}, owners: {}, spawns: {}, ops: {}, orders: {}, launch: {}, tracks: [], mt: 0 });
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
          case 'intercepts':
            if (m.src === srcRef.current) setState((s) => ({ ...s, intercepts: m.intercepts }));
            break;
          case 'assignments':
            if (m.src === srcRef.current) setState((s) => ({ ...s, assignments: m.assignments }));
            break;
          case 'owners':
            if (m.src === srcRef.current) setState((s) => ({ ...s, owners: m.owners }));
            break;
          case 'spawns':
            if (m.src === srcRef.current) setState((s) => ({ ...s, spawns: m.spawns }));
            break;
          case 'ops':
            if (m.src === srcRef.current) setState((s) => ({ ...s, ops: m.ops }));
            break;
          case 'orders':
            if (m.src === srcRef.current) setState((s) => ({ ...s, orders: m.orders }));
            break;
          case 'launch':
            if (m.src === srcRef.current) setState((s) => ({ ...s, launch: m.launch }));
            break;
          case 'replayState':
            if (m.src === srcRef.current) setState((s) => ({ ...s, replay: { playing: m.playing, rate: m.rate, mt: m.mt, start: m.start, end: m.end } }));
            break;
          case 'frame': {
            if (m.src !== srcRef.current) break;
            const h = history.current;
            const seen = new Set<string>();
            for (const t of m.tracks) {
              seen.add(t.id);
              let arr = h.get(t.id);
              if (!arr) h.set(t.id, (arr = []));
              // mission time ran backwards (mission restart, replay loop, rewind): the points after it aren't
              // where it has been (a rewind keeps the trail up to the new time; a restart keeps none)
              while (arr.length && arr[arr.length - 1].t > m.mt) arr.pop();
              // it jumped further than anything flies (respawn, replay loop or seek): a new trail
              if (arr.length && implausibleMove(distanceNm(arr[arr.length - 1].lat, arr[arr.length - 1].lon, t.lat, t.lon), Math.max(0, m.mt - arr[arr.length - 1].t))) arr.length = 0;
              if (!arr.length || arr[arr.length - 1].t < m.mt) arr.push({ t: m.mt, lat: t.lat, lon: t.lon, alt: t.alt, ...(t.air === false ? { gnd: true } : {}) });
              const keep = t.k === 'ship' || t.k === 'carrier' ? SHIP_HISTORY_S : HISTORY_S;
              while (arr.length > 2 && arr[0].t < m.mt - keep) arr.shift();
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
        if (ev.code === CLOSE_FORBIDDEN) {
          // a decision, not a fault: no retry (a reload tries again once the roster is changed)
          setState((s) => ({ ...s, conn: 'forbidden', refused: ev.reason || 'Not a member of the wing' }));
          return;
        }
        const denied = ev.code === CLOSE_AUTH_FAILED;
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
      setState((s) => ({ ...s, src, tracks: [], seats: [], plans: {}, assignments: {}, intercepts: {}, owners: {}, spawns: {}, ops: {}, orders: {}, launch: {}, env: undefined, replay: undefined }));
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
  const setIntercept = useCallback(
    (interceptor: string, target: string | null) => send({ t: 'intercept', src: srcRef.current, interceptor, target }),
    [send],
  );
  const handoff = useCallback((key: string, from: SeatKey, to: SeatKey | null) => send({ t: 'handoff', src: srcRef.current, key, from, to }), [send]);
  const accept = useCallback((key: string) => send({ t: 'accept', src: srcRef.current, key }), [send]);
  const assume = useCallback((key: string, from: SeatKey, to: SeatKey) => send({ t: 'assume', src: srcRef.current, key, from, to }), [send]);
  const setOps = useCallback((carrier: string, patch: Partial<OpsState> | Record<string, unknown>) => send({ t: 'ops', src: srcRef.current, carrier, patch }), [send]);
  const clearLaunch = useCallback((carrier: string, trackId: string, clear: boolean) => send({ t: 'launch', src: srcRef.current, carrier, trackId, clear }), [send]);
  const replay = useCallback((cmd: ReplayCommand, s?: number) => send({ t: 'replay', src: srcRef.current, cmd, ...(s !== undefined ? { s } : {}) }), [send]);
  const clearError = useCallback(() => setState((s) => ({ ...s, error: undefined })), []);

  return { state, history: history.current, selectSource, claim, release, setPlan, assign, setIntercept, handoff, accept, assume, setOps, clearLaunch, replay, clearError };
}
