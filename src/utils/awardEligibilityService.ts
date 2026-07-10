import { supabase } from './supabaseClient';
import {
  evaluateRuleNode,
  evaluateDeviceTier,
  ruleTreeHasConditions,
  collectRuleCycleIds,
  type AwardMetricValues,
  type AwardEligibilityRules,
  type AwardDeviceConfig,
  type AwardDeviceTier,
  type MetricsResolver
} from './awardRules';

// The awards/status tables are newer than the generated supabase types.
const sb = supabase as any;

// ---------- Types ----------

export interface EligibilityCandidate {
  pilotId: string;
  callsign: string;
  boardNumber: number | string;
  squadronDesignation: string | null;
  metrics: AwardMetricValues;
  eligible: boolean;
  /** Device tier earned for this cycle (tier-mode awards only) */
  earnedTier: AwardDeviceTier | null;
  /** Existing pilot_awards row for this award + cycle, if any */
  alreadyIssued: boolean;
}

export interface EligibilityResult {
  candidates: EligibilityCandidate[];
  /** Published events in the cycle that have already occurred */
  eventsConsidered: number;
}

// ---------- Discord message ID extraction ----------

/**
 * events.discord_event_id is a JSONB whose shape has varied over time
 * (single message id string, object, or an array of publication records).
 * Attendance rows key on the Discord message ID, so collect every plausible
 * message id from the value.
 */
export function extractDiscordMessageIds(discordEventId: any): string[] {
  const ids = new Set<string>();
  const visit = (value: any) => {
    if (value == null) return;
    if (typeof value === 'string') {
      // Discord snowflakes are 15-21 digit numeric strings
      if (/^\d{15,21}$/.test(value)) ids.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      // Only messageId fields identify the publication; guild/channel ids are
      // also snowflakes and must not be mistaken for message ids
      if (typeof value.messageId === 'string') visit(value.messageId);
      else Object.values(value).forEach(visit);
    }
  };
  visit(discordEventId);
  return Array.from(ids);
}

// ---------- Metrics computation ----------

/**
 * Computes eligibility metrics for every pilot against one cycle:
 *  - events attended (roll call Present, or accepted RSVP when no roll call was taken)
 *  - attendance percentage over the cycle's published, already-occurred events
 *  - whether the pilot held an active roster status overlapping the cycle window
 */
export async function computeCycleMetrics(cycleId: string): Promise<{
  data: { metricsByPilot: Record<string, AwardMetricValues>; eventsConsidered: number } | null;
  error: any;
}> {
  try {
    const [cycleRes, eventsRes, pilotsRes] = await Promise.all([
      sb.from('cycles').select('id, start_date, end_date').eq('id', cycleId).single(),
      sb.from('events').select('id, discord_event_id, start_datetime').eq('cycle_id', cycleId),
      sb.from('pilots').select('id, discord_id')
    ]);

    if (cycleRes.error) return { data: null, error: cycleRes.error };
    if (eventsRes.error) return { data: null, error: eventsRes.error };
    if (pilotsRes.error) return { data: null, error: pilotsRes.error };

    const cycle = cycleRes.data;
    const pilots = (pilotsRes.data || []) as Array<{ id: string; discord_id: string | null }>;

    // Published events that have already occurred — unpublished events had no
    // attendance to take (same rule as the dossier attendance card)
    const now = new Date().toISOString();
    const events = ((eventsRes.data || []) as any[])
      .filter(e => !e.start_datetime || e.start_datetime <= now)
      .map(e => ({ id: e.id, messageIds: extractDiscordMessageIds(e.discord_event_id) }))
      .filter(e => e.messageIds.length > 0);

    // --- Active roster status overlapping the cycle window ---
    const cycleStart = (cycle.start_date || '').split('T')[0] || '0000-01-01';
    const cycleEnd = (cycle.end_date || '').split('T')[0] || '9999-12-31';

    const statusQuery = sb
      .from('pilot_statuses')
      .select('pilot_id, start_date, end_date, status:status_id (id, isActive)')
      .lte('start_date', cycleEnd);

    const { data: statusRows, error: statusError } = await statusQuery;
    if (statusError) return { data: null, error: statusError };

    const activePilotIds = new Set<string>();
    ((statusRows || []) as any[]).forEach(row => {
      if (!row.status?.isActive) return;
      // start_date <= cycleEnd already filtered; overlap also needs the
      // status to still be open (or end after) the cycle start
      if (row.end_date && row.end_date < cycleStart) return;
      activePilotIds.add(row.pilot_id);
    });

    // --- Attendance ---
    const allMessageIds = events.flatMap(e => e.messageIds);
    let attendanceRows: any[] = [];
    if (allMessageIds.length > 0) {
      // Chunk the IN clause defensively for cycles with many publications
      const chunkSize = 400;
      for (let i = 0; i < allMessageIds.length; i += chunkSize) {
        const chunk = allMessageIds.slice(i, i + chunkSize);
        const { data: rows, error: attendanceError } = await sb
          .from('discord_event_attendance')
          .select('discord_id, discord_event_id, user_response, roll_call_response')
          .in('discord_event_id', chunk);
        if (attendanceError) return { data: null, error: attendanceError };
        attendanceRows = attendanceRows.concat(rows || []);
      }
    }

    // message id -> event id (an event may be published to several channels)
    const eventByMessageId: Record<string, string> = {};
    events.forEach(e => e.messageIds.forEach(id => { eventByMessageId[id] = e.id; }));

    // discord_id -> event id -> rows
    const rowsByPilotEvent: Record<string, Record<string, any[]>> = {};
    attendanceRows.forEach(row => {
      if (!row.discord_id || !row.discord_event_id) return;
      const eventId = eventByMessageId[row.discord_event_id];
      if (!eventId) return;
      const byEvent = (rowsByPilotEvent[row.discord_id] = rowsByPilotEvent[row.discord_id] || {});
      (byEvent[eventId] = byEvent[eventId] || []).push(row);
    });

    const metricsByPilot: Record<string, AwardMetricValues> = {};
    pilots.forEach(pilot => {
      // Two counting rules, each matching its dossier counterpart:
      //  - participation (events_attended): roll call Present, or an accepted
      //    RSVP when no roll call was taken — same as the dossier's cruise
      //    participation logic, so cycles without roll call still count
      //  - attendance_pct: roll call Present only — same strict rule as the
      //    dossier attendance card, so the percentages always agree
      let participated = 0;
      let present = 0;
      const byEvent = pilot.discord_id ? rowsByPilotEvent[pilot.discord_id] : undefined;
      if (byEvent) {
        events.forEach(event => {
          const rows = byEvent[event.id];
          if (!rows) return;
          const wasPresent = rows.some(r => r.roll_call_response === 'Present');
          const hasRollCall = rows.some(r => r.roll_call_response);
          if (wasPresent) {
            present += 1;
            participated += 1;
          } else if (!hasRollCall && rows.some(r => r.user_response === 'accepted')) {
            participated += 1;
          }
        });
      }

      metricsByPilot[pilot.id] = {
        events_attended: participated,
        attendance_pct: events.length > 0 ? Math.round((present / events.length) * 1000) / 10 : 0,
        active_member: activePilotIds.has(pilot.id) ? 1 : 0,
        events_total: events.length
      };
    });

    return { data: { metricsByPilot, eventsConsidered: events.length }, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// ---------- Eligibility evaluation ----------

export interface EligibilityPilotInfo {
  id: string;
  callsign: string;
  boardNumber: number | string;
  squadronDesignation: string | null;
}

/**
 * Evaluates an award's eligibility rules against one cycle for the supplied
 * pilots, marking pilots who already hold an issuance for that award + cycle.
 *
 * Conditions default to the issuance cycle (`cycleId`), but any condition
 * pinned to a specific cycle (condition.cycleId, e.g. a campaign medal tied
 * to one operation) is measured against that cycle instead — metrics are
 * computed once per referenced cycle.
 */
export async function computeEligibleRecipients(
  awardId: string,
  eligibilityRules: AwardEligibilityRules,
  deviceConfig: AwardDeviceConfig | null,
  cycleId: string,
  pilots: EligibilityPilotInfo[]
): Promise<{ data: EligibilityResult | null; error: any }> {
  try {
    // Every cycle the rule trees reference, plus the issuance cycle
    const referencedCycleIds = collectRuleCycleIds(eligibilityRules.rules);
    (deviceConfig?.tiers || []).forEach(tier => collectRuleCycleIds(tier.rules, referencedCycleIds));
    const allCycleIds = Array.from(new Set([cycleId, ...referencedCycleIds]));

    const [metricsResults, issuedRes] = await Promise.all([
      Promise.all(allCycleIds.map(id => computeCycleMetrics(id))),
      sb.from('pilot_awards').select('pilot_id').eq('award_id', awardId).eq('cycle_id', cycleId)
    ]);

    const failed = metricsResults.find(r => r.error || !r.data);
    if (failed) return { data: null, error: failed.error || new Error('Failed to compute cycle metrics') };
    if (issuedRes.error) return { data: null, error: issuedRes.error };

    const metricsByCycle: Record<string, { metricsByPilot: Record<string, AwardMetricValues>; eventsConsidered: number }> = {};
    allCycleIds.forEach((id, index) => { metricsByCycle[id] = metricsResults[index].data!; });

    const { eventsConsidered } = metricsByCycle[cycleId];
    const issuedPilotIds = new Set(((issuedRes.data || []) as any[]).map(r => r.pilot_id));
    const hasRules = ruleTreeHasConditions(eligibilityRules.rules);

    const emptyMetrics = (cycle: string): AwardMetricValues => ({
      events_attended: 0,
      attendance_pct: 0,
      active_member: 0,
      events_total: metricsByCycle[cycle]?.eventsConsidered ?? 0
    });

    const candidates: EligibilityCandidate[] = pilots.map(pilot => {
      // Resolves a condition's cycle scope: null = the issuance cycle
      const resolveMetrics: MetricsResolver = (conditionCycleId) => {
        const scope = conditionCycleId && metricsByCycle[conditionCycleId] ? conditionCycleId : cycleId;
        return metricsByCycle[scope].metricsByPilot[pilot.id] || emptyMetrics(scope);
      };

      const metrics = resolveMetrics(null); // issuance-cycle metrics for the results table
      const eligible = hasRules ? evaluateRuleNode(eligibilityRules.rules, resolveMetrics) : false;
      return {
        pilotId: pilot.id,
        callsign: pilot.callsign,
        boardNumber: pilot.boardNumber,
        squadronDesignation: pilot.squadronDesignation,
        metrics,
        eligible,
        earnedTier: eligible ? evaluateDeviceTier(deviceConfig, resolveMetrics) : null,
        alreadyIssued: issuedPilotIds.has(pilot.id)
      };
    });

    // Eligible pilots first, then by board number
    candidates.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return String(a.boardNumber).localeCompare(String(b.boardNumber), undefined, { numeric: true });
    });

    return { data: { candidates, eventsConsidered }, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
