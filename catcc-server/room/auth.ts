import type { RoomUser } from '../../src/catcc/core/room/protocol.ts';
import { decideMembership, discordIdOf, todayUtc, type Assignment, type Squadron, type Status, type StatusRow } from './membership.ts';

/** a valid sign-in that isn't allowed in: closed with CLOSE_FORBIDDEN and this reason */
export interface Refused {
  refused: string;
}
/** the user, a refusal, or null when the token isn't a valid sign-in (or Supabase couldn't be asked) */
export type VerifyResult = RoomUser | Refused | null;
export type VerifyToken = (token: string) => Promise<VerifyResult>;

export const isRefused = (r: VerifyResult): r is Refused => !!r && 'refused' in r;

const MEMBER_TTL_MS = 5 * 60_000;
const REFUSED_TTL_MS = 60_000;

/**
 * Verifies a ReadyRoom (Supabase) access token by asking Supabase Auth who it belongs to, then
 * checks the user is a member of the wing (membership.ts) and looks up their pilot callsign/board
 * for display. Members are cached 5 min, refusals 1 min; lookup failures aren't cached.
 * Uses the service key server-side only; it never reaches clients.
 */
export function supabaseVerifier(url: string, serviceKey: string): VerifyToken {
  const cache = new Map<string, { result: RoomUser | Refused; until: number }>();
  const headers = (bearer: string) => ({ apikey: serviceKey, Authorization: `Bearer ${bearer}` });
  const rest = async <T>(path: string): Promise<T[]> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers(serviceKey) });
    if (!res.ok) throw new Error(`supabase ${res.status} on ${path.split('?')[0]}`);
    return (await res.json()) as T[];
  };
  const q = encodeURIComponent;
  const inList = (ids: string[]) => `in.(${ids.map((id) => q(id)).join(',')})`;

  return async (token) => {
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.result;
    for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
    try {
      const res = await fetch(`${url}/auth/v1/user`, { headers: headers(token) });
      if (!res.ok) return null;
      const authUser = (await res.json()) as {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
        identities?: { provider?: string; id?: string; identity_data?: Record<string, unknown> }[];
      };
      let name = String(authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? 'Unknown');
      let board: number | undefined;

      const [prof] = await rest<{ id: string; discord_username: string | null }>(
        `user_profiles?auth_user_id=eq.${q(authUser.id)}&select=id,discord_username&limit=1`,
      );
      if (prof?.discord_username) name = prof.discord_username;

      // ReadyRoom admin: a manual-override access_developer_settings rule on their profile
      let admin = false;
      if (prof) {
        const [perm] = await rest<{ id: string }>(`app_permissions?name=eq.access_developer_settings&select=id&limit=1`);
        if (perm) {
          const rules = await rest<{ id: string }>(
            `permission_rules?basis_type=eq.manual_override&basis_id=eq.${q(prof.id)}&permission_id=eq.${q(perm.id)}&active=is.true&select=id&limit=1`,
          );
          admin = rules.length > 0;
        }
      }

      const discordId = discordIdOf(authUser);
      const [pilot] = discordId
        ? await rest<{ id: string; callsign: string | null; boardNumber: number | null }>(
            `pilots?discord_id=eq.${q(discordId)}&select=id,callsign,boardNumber&limit=1`,
          )
        : [];
      let assignments: Assignment[] = [];
      let squadrons: Squadron[] = [];
      let statusRows: StatusRow[] = [];
      let statuses: Status[] = [];
      if (pilot) {
        if (pilot.callsign) name = pilot.callsign;
        if (pilot.boardNumber != null) board = pilot.boardNumber;
        [assignments, statusRows] = await Promise.all([
          rest<Assignment>(`pilot_assignments?pilot_id=eq.${q(pilot.id)}&select=squadron_id,start_date,end_date`),
          rest<StatusRow>(`pilot_statuses?pilot_id=eq.${q(pilot.id)}&select=status_id,start_date,end_date`),
        ]);
        const sqIds = [...new Set(assignments.map((a) => a.squadron_id).filter((x): x is string => !!x))];
        const stIds = [...new Set(statusRows.map((r) => r.status_id))];
        [squadrons, statuses] = await Promise.all([
          sqIds.length ? rest<Squadron>(`org_squadrons?id=${inList(sqIds)}&select=id,deactivated_date`) : [],
          stIds.length ? rest<Status>(`statuses?id=${inList(stIds)}&select=id,name,isActive`) : [],
        ]);
      }

      const d = decideMembership({ pilot: !!pilot, assignments, squadrons, statusRows, statuses, admin }, todayUtc());
      const result: RoomUser | Refused = d.ok ? { userId: authUser.id, name, board } : { refused: d.reason };
      cache.set(token, { result, until: Date.now() + (d.ok ? MEMBER_TTL_MS : REFUSED_TTL_MS) });
      return result;
    } catch {
      return null;
    }
  };
}

/**
 * Local development only: accepts any token without verification. A Supabase JWT is decoded
 * (not verified) for a readable name; any other string is used as the name.
 */
export const devVerifier: VerifyToken = async (token) => {
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        sub?: string;
        email?: string;
        user_metadata?: { full_name?: string; name?: string };
      };
      return { userId: `dev:${p.sub ?? 'unknown'}`, name: p.user_metadata?.full_name ?? p.user_metadata?.name ?? p.email ?? 'dev' };
    } catch {
      /* fall through */
    }
  }
  return { userId: `dev:${token}`, name: token.slice(0, 24) || 'dev' };
};
