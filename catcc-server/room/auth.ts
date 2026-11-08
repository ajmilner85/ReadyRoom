import type { RoomUser } from '../../src/catcc/core/room/protocol.ts';

export type VerifyToken = (token: string) => Promise<RoomUser | null>;

/**
 * Verifies a ReadyRoom (Supabase) access token by asking Supabase Auth who it belongs to, then
 * looks up the user's pilot callsign/board for display. Results are cached briefly.
 * Uses the service key server-side only; it never reaches clients.
 */
export function supabaseVerifier(url: string, serviceKey: string): VerifyToken {
  const cache = new Map<string, { user: RoomUser; until: number }>();
  const headers = (bearer: string) => ({ apikey: serviceKey, Authorization: `Bearer ${bearer}` });

  return async (token) => {
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    try {
      const res = await fetch(`${url}/auth/v1/user`, { headers: headers(token) });
      if (!res.ok) return null;
      const authUser = (await res.json()) as { id: string; email?: string; user_metadata?: Record<string, unknown> };
      let name = String(authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? 'Unknown');
      let board: number | undefined;

      const prof = await fetch(
        `${url}/rest/v1/user_profiles?auth_user_id=eq.${encodeURIComponent(authUser.id)}&select=pilot_id,discord_username&limit=1`,
        { headers: headers(serviceKey) },
      );
      if (prof.ok) {
        const [p] = (await prof.json()) as { pilot_id: string | null; discord_username: string | null }[];
        if (p?.discord_username) name = p.discord_username;
        if (p?.pilot_id) {
          const pil = await fetch(`${url}/rest/v1/pilots?id=eq.${encodeURIComponent(p.pilot_id)}&select=callsign,boardNumber&limit=1`, {
            headers: headers(serviceKey),
          });
          if (pil.ok) {
            const [pilot] = (await pil.json()) as { callsign: string | null; boardNumber: number | null }[];
            if (pilot?.callsign) name = pilot.callsign;
            if (pilot?.boardNumber != null) board = pilot.boardNumber;
          }
        }
      }
      const user: RoomUser = { userId: authUser.id, name, board };
      cache.set(token, { user, until: Date.now() + 5 * 60_000 });
      return user;
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
