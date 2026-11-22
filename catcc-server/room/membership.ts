/**
 * Who may use the CATCC room: members of the wing, read from the ReadyRoom roster.
 *
 * A signed-in user is a member when the pilot record whose `discord_id` is the Discord account
 * they signed in with (Supabase Auth's Discord identity, set by Discord's OAuth, not by the user):
 *   1. has a current squadron assignment (pilot_assignments: started on or before today, no end
 *      date or one after today) in a squadron that isn't deactivated, and
 *   2. has a current roster status (pilot_statuses, same date rule; the latest start wins) whose
 *      `statuses.isActive` is true, the same flag Settings > Roster sets per status.
 * Or, without either, they hold a manual-override `access_developer_settings` rule (ReadyRoom admin).
 *
 * `user_profiles.pilot_id` is deliberately not trusted here: a user can write their own profile row.
 * Pilot `discord_id`, assignments and statuses are written only by roster managers.
 */

export interface Assignment {
  squadron_id: string | null;
  start_date: string | null;
  end_date: string | null;
}
export interface Squadron {
  id: string;
  deactivated_date: string | null;
}
export interface StatusRow {
  status_id: string;
  start_date: string | null;
  end_date: string | null;
}
export interface Status {
  id: string;
  name: string;
  isActive: boolean;
}

export interface MemberFacts {
  /** a pilot record matched the user's Discord account */
  pilot: boolean;
  assignments: Assignment[];
  squadrons: Squadron[];
  statusRows: StatusRow[];
  statuses: Status[];
  /** manual-override access_developer_settings rule on the user's profile */
  admin: boolean;
}

export type MemberDecision = { ok: true } | { ok: false; reason: string };

/** refusal reasons: shown to the user on the "access denied" screen (WebSocket close reasons, < 123 bytes) */
export const REASON = {
  noPilot: 'No roster pilot for this Discord account',
  noSquadron: 'Not assigned to a squadron',
  inactive: (status: string) => `Roster status: ${status}`,
  noStatus: 'No roster status',
} as const;

/** YYYY-MM-DD in UTC (dates in the roster are plain dates) */
export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

/** a dated row is current: started on or before today (or no start), and no end or an end after today */
export const isCurrent = (r: { start_date: string | null; end_date: string | null }, today: string) =>
  (!r.start_date || r.start_date.slice(0, 10) <= today) && (!r.end_date || r.end_date.slice(0, 10) > today);

export function decideMembership(f: MemberFacts, today: string): MemberDecision {
  if (f.admin) return { ok: true };
  if (!f.pilot) return { ok: false, reason: REASON.noPilot };
  const live = new Set(f.squadrons.filter((s) => !s.deactivated_date || s.deactivated_date.slice(0, 10) > today).map((s) => s.id));
  if (!f.assignments.some((a) => a.squadron_id && live.has(a.squadron_id) && isCurrent(a, today))) return { ok: false, reason: REASON.noSquadron };
  const cur = f.statusRows.filter((r) => isCurrent(r, today)).sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0];
  const st = cur && f.statuses.find((s) => s.id === cur.status_id);
  if (!st) return { ok: false, reason: REASON.noStatus };
  if (!st.isActive) return { ok: false, reason: REASON.inactive(st.name) };
  return { ok: true };
}

/** The Discord user id of the account the user signed in with, from Supabase Auth's user object. */
export function discordIdOf(authUser: { identities?: { provider?: string; id?: string; identity_data?: Record<string, unknown> }[] }): string | undefined {
  const i = authUser.identities?.find((x) => x.provider === 'discord');
  if (!i) return undefined;
  const v = i.identity_data?.provider_id ?? i.identity_data?.sub ?? i.id;
  return v != null && String(v) ? String(v) : undefined;
}
