import { supabase } from '../../utils/supabaseClient';

/** Read-only queries for the Home dashboard. All rely on existing RLS. */

export interface NextEventInfo {
  id: string;
  name: string;
  description: string | null;
  start: string;
  end: string | null;
  cycleName: string | null;
  messageIds: string[];
}

export type RsvpState = 'accepted' | 'tentative' | 'declined' | null;

const messageIdsOf = (discordEventId: unknown): string[] => {
  if (!discordEventId) return [];
  if (typeof discordEventId === 'string') return [discordEventId];
  if (Array.isArray(discordEventId)) {
    return discordEventId.map((d: any) => d?.messageId).filter(Boolean);
  }
  return [];
};

export async function fetchUpcomingEvents(limit = 10): Promise<NextEventInfo[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, description, start_datetime, end_datetime, discord_event_id, cycles:cycle_id(name)')
    .gt('start_datetime', new Date().toISOString())
    .is('deleted_at', null)
    .order('start_datetime', { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map((e: any) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    start: e.start_datetime,
    end: e.end_datetime,
    cycleName: e.cycles?.name ?? null,
    messageIds: messageIdsOf(e.discord_event_id),
  }));
}

export async function fetchMyResponses(discordId: string | undefined, messageIds: string[]): Promise<Record<string, RsvpState>> {
  if (!discordId || messageIds.length === 0) return {};
  const { data, error } = await supabase
    .from('discord_event_attendance')
    .select('discord_event_id, user_response, roll_call_response, updated_at')
    .eq('discord_id', discordId)
    .in('discord_event_id', messageIds);
  if (error || !data) return {};
  const out: Record<string, RsvpState> = {};
  data.forEach((r: any) => {
    const v = String(r.user_response || '').toLowerCase();
    out[r.discord_event_id] = v === 'accepted' || v === 'tentative' || v === 'declined' ? (v as RsvpState) : null;
  });
  return out;
}

export interface LastMissionInfo {
  missionId: string;
  name: string;
  date: string | null;
  outcome: string | null;
  a2a: number;
  a2g: number;
  losses: number;
  flights: number;
}

export async function fetchLastMission(): Promise<LastMissionInfo | null> {
  // Most recent debrief that has submitted flight debriefs; falls back to the newest debrief.
  const { data, error } = await supabase
    .from('mission_debriefings')
    .select('id, mission_id, mission_outcome, created_at, missions:mission_id(id, name, events:event_id(name, start_datetime))')
    .order('created_at', { ascending: false })
    .limit(8);
  if (error || !data || data.length === 0) return null;
  // Prefer the latest debrief with a recorded outcome (not 'pending'), else the newest one.
  const chosen: any = (data as any[]).find(d => d.mission_outcome && d.mission_outcome !== 'pending') || data[0];
  const { count } = await supabase.from('flight_debriefs').select('id', { count: 'exact', head: true }).eq('mission_debriefing_id', chosen.id);
  const flightCount = count || 0;
  const missionId: string = chosen.mission_id;
  const kills = await supabase.from('pilot_kills').select('air_to_air_kills, air_to_ground_kills, aircraft_status').eq('mission_id', missionId);
  const rows: any[] = kills.data || [];
  return {
    missionId,
    name: chosen.missions?.events?.name || chosen.missions?.name || 'Mission',
    date: chosen.missions?.events?.start_datetime || chosen.created_at,
    outcome: chosen.mission_outcome,
    a2a: rows.reduce((n, r) => n + (Number(r.air_to_air_kills) || 0), 0),
    a2g: rows.reduce((n, r) => n + (Number(r.air_to_ground_kills) || 0), 0),
    losses: rows.filter(r => r.aircraft_status === 'destroyed' || r.aircraft_status === 'down').length,
    flights: flightCount,
  };
}

export interface ExpiringQual {
  id: string;
  name: string;
  code: string;
  color: string | null;
  expiry: string;
}

export async function fetchMyExpiringQuals(pilotId: string | undefined, withinDays = 30): Promise<ExpiringQual[]> {
  if (!pilotId) return [];
  const horizon = new Date(Date.now() + withinDays * 864e5).toISOString();
  const { data, error } = await supabase
    .from('pilot_qualifications')
    .select('id, expiry_date, is_current, qualifications:qualification_id(name, code, color)')
    .eq('pilot_id', pilotId)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', horizon);
  if (error || !data) return [];
  return data
    .filter((q: any) => q.is_current !== false)
    .map((q: any) => ({ id: q.id, name: q.qualifications?.name, code: q.qualifications?.code, color: q.qualifications?.color, expiry: q.expiry_date }));
}
