import type http from 'node:http';
import { devVerifier, supabaseVerifier } from './auth.ts';
import { supabaseStore } from './persist.ts';
import { RoomService, type SourceConfig } from './roomService.ts';

/**
 * Builds the room from environment variables and attaches it to an HTTP server.
 *
 *   CATCC_SOURCES        JSON array of SourceConfig, e.g.
 *                        [{"id":"fox3","name":"Fox3","kind":"hook","host":"dcs.example.com","port":10310,"token":"..."},
 *                         {"id":"fox3-tv","name":"Fox3 (Tacview)","kind":"tacview","host":"dcs.example.com"}]
 *   CATCC_TOKEN          or just this: the hook token, with the source at CATCC_HOOK (default DEFAULT_HOOK)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   verify ReadyRoom users' access tokens and wing membership (membership.ts)
 *   CATCC_DEV_NOAUTH=1   accept any token (local development only; refused when NODE_ENV=production)
 *   CATCC_WS_PATH        default /catcc/ws
 *   CATCC_PERSIST=0      don't keep room state in Supabase (public.catcc_room_state); it is kept
 *                        whenever SUPABASE_URL/SUPABASE_SERVICE_KEY are set and auth is real
 *
 * This is the module SDOBot loads (bundled to SDOBot/catcc/room.mjs) when CATCC_ENABLED=true.
 */
/** the squadron's DCS server (Fox3), LotATC's port */
export const DEFAULT_HOOK = 'dcs.fightingstingrays.com:10310';

export function attachCatccRoom(server: http.Server, env: NodeJS.ProcessEnv = process.env, extraSources: SourceConfig[] = []): RoomService {
  let sources: SourceConfig[] = [];
  if (env.CATCC_SOURCES) {
    try {
      sources = JSON.parse(env.CATCC_SOURCES) as SourceConfig[];
    } catch (e) {
      console.error('[CATCC] CATCC_SOURCES is not valid JSON; starting with no sources', e);
    }
  }
  // the simple setup: only the hook's token is set (one plain `fly secrets set CATCC_TOKEN=...`), and the
  // squadron's DCS server hook is the source; CATCC_HOOK (host[:port]) overrides where it is
  if (!sources.length && env.CATCC_TOKEN) {
    const [host, port] = (env.CATCC_HOOK || DEFAULT_HOOK).split(':');
    sources = [{ id: 'fox3', name: 'Fox3', kind: 'hook', host, port: Number(port) || 10310, token: env.CATCC_TOKEN }];
  }
  sources = [...sources, ...extraSources];

  const devAuth = env.CATCC_DEV_NOAUTH === '1' || env.CATCC_DEV_NOAUTH === 'true';
  if (devAuth && env.NODE_ENV === 'production') throw new Error('CATCC_DEV_NOAUTH is not allowed in production');
  let verify = devVerifier;
  if (!devAuth) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('CATCC needs SUPABASE_URL and SUPABASE_SERVICE_KEY');
    verify = supabaseVerifier(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }

  // plans, ops, assignments, ownership and seats survive a restart (deploy); not in dev mode
  const persist = !devAuth && env.CATCC_PERSIST !== '0' && !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_KEY;
  const store = persist ? supabaseStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_KEY!, (m) => console.log(`[CATCC] ${m}`)) : undefined;

  const room = new RoomService({ sources, verify, store, path: env.CATCC_WS_PATH || undefined });
  room.attach(server);
  room.start();
  if (store) {
    // best effort: write pending changes when the app is stopped (a deploy sends SIGTERM)
    const onExit = () => void room.flush();
    process.once('SIGTERM', onExit);
    process.once('SIGINT', onExit);
  }
  console.log(`[CATCC] room attached at ${room.path}${devAuth ? ' (DEV: no auth)' : ''}${store ? ', state kept in Supabase' : ''}`);
  return room;
}
