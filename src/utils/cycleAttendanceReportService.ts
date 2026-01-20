/**
 * Data service for Cycle Attendance Reports
 */

import { supabase } from './supabaseClient';
import {
  CycleData,
  EventData,
  AttendanceData,
  PilotData,
  SquadronData,
  QualificationData,
  ChartDataPoint,
  EventSquadronMetrics,
  SquadronMetrics,
  CycleAttendanceReportData,
  ReportFilters
} from '../types/ReportTypes';

/**
 * Fetch all cycles for dropdown selection
 */
export async function fetchCycles(): Promise<CycleData[]> {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, name, start_date, end_date, type, participants')
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Error fetching cycles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch the most recent active or recently completed cycle
 */
export async function fetchDefaultCycle(): Promise<CycleData | null> {
  const now = new Date().toISOString();

  // First try to find an active cycle
  const { data: activeCycles, error: activeError } = await supabase
    .from('cycles')
    .select('id, name, start_date, end_date, type, participants')
    .lte('start_date', now)
    .gte('end_date', now)
    .order('start_date', { ascending: false })
    .limit(1);

  if (activeError) {
    console.error('Error fetching active cycle:', activeError);
    throw activeError;
  }

  if (activeCycles && activeCycles.length > 0) {
    return activeCycles[0];
  }

  // If no active cycle, get the most recently completed one
  const { data: recentCycles, error: recentError } = await supabase
    .from('cycles')
    .select('id, name, start_date, end_date, type, participants')
    .lt('end_date', now)
    .order('end_date', { ascending: false })
    .limit(1);

  if (recentError) {
    console.error('Error fetching recent cycle:', recentError);
    throw recentError;
  }

  return recentCycles && recentCycles.length > 0 ? recentCycles[0] : null;
}

/**
 * Fetch active pilots during a cycle period, optionally filtered by squadron and qualification
 */
async function fetchActivePilots(
  startDate: string,
  endDate: string,
  filters?: ReportFilters
): Promise<PilotData[]> {
  // Get pilots who had an active status during the cycle period
  const statusQuery = supabase
    .from('pilot_statuses')
    .select(`
      pilot_id,
      pilots!inner(
        id,
        callsign,
        boardNumber,
        discord_id
      ),
      statuses!inner(
        isActive
      )
    `)
    .eq('statuses.isActive', true)
    .lte('start_date', endDate)
    .or(`end_date.is.null,end_date.gte.${startDate}`);

  const { data: pilotStatusRecords, error: statusError } = await statusQuery;

  if (statusError) {
    console.error('Error fetching active pilots:', statusError);
    throw statusError;
  }

  if (!pilotStatusRecords || pilotStatusRecords.length === 0) {
    return [];
  }

  // Get unique pilot IDs
  const uniquePilotIds = [...new Set(pilotStatusRecords.map(record => record.pilot_id))];

  // Batch fetch squadron assignments for all pilots at once (prevents N+1 queries)
  const { data: squadronAssignments, error: squadronError } = await supabase
    .from('pilot_assignments')
    .select(`
      pilot_id,
      squadron_id,
      org_squadrons(
        id,
        name
      )
    `)
    .in('pilot_id', uniquePilotIds)
    .is('end_date', null);

  // Map squadron data by pilot_id for quick lookup
  const squadronByPilot = new Map<string, { id: string; name: string }>();
  if (!squadronError && squadronAssignments) {
    squadronAssignments.forEach(assignment => {
      if (assignment.org_squadrons) {
        const squadron = Array.isArray(assignment.org_squadrons)
          ? assignment.org_squadrons[0]
          : assignment.org_squadrons;
        squadronByPilot.set(assignment.pilot_id, {
          id: squadron.id,
          name: squadron.name
        });
      }
    });
  }

  // Batch fetch qualifications for all pilots at once (prevents N+1 queries)
  const { data: qualData, error: qualError } = await supabase
    .from('pilot_qualifications')
    .select('pilot_id, qualification_id')
    .in('pilot_id', uniquePilotIds)
    .or(`expiry_date.is.null,expiry_date.gte.${startDate}`);

  // Map qualifications by pilot_id for quick lookup
  const qualsByPilot = new Map<string, string[]>();
  if (!qualError && qualData) {
    qualData.forEach(qual => {
      const existing = qualsByPilot.get(qual.pilot_id) || [];
      qualsByPilot.set(qual.pilot_id, [...existing, qual.qualification_id]);
    });
  }

  // Build pilot data with squadron and qualification info
  const pilots: PilotData[] = [];

  for (const pilotId of uniquePilotIds) {
    const pilotRecord = pilotStatusRecords.find(r => r.pilot_id === pilotId);
    if (!pilotRecord || !pilotRecord.pilots) continue;

    const pilot = Array.isArray(pilotRecord.pilots) ? pilotRecord.pilots[0] : pilotRecord.pilots;

    // Get squadron from map
    const squadron = squadronByPilot.get(pilotId);
    const squadronId = squadron?.id;
    const squadronName = squadron?.name;

    // Get qualifications from map
    const qualificationIds = qualsByPilot.get(pilotId) || [];

    // Apply qualification filter if specified
    if (filters?.qualificationIds && filters.qualificationIds.length > 0) {
      const hasRequiredQual = filters.qualificationIds.some(qid => qualificationIds.includes(qid));
      if (!hasRequiredQual) {
        continue; // Skip this pilot
      }
    }

    pilots.push({
      id: pilot.id,
      callsign: pilot.callsign,
      boardNumber: pilot.boardNumber.toString(),
      discord_id: pilot.discord_id,
      squadronId,
      squadronName,
      qualificationIds
    });
  }

  // Sort by board number
  pilots.sort((a, b) => parseInt(a.boardNumber) - parseInt(b.boardNumber));

  return pilots;
}

/**
 * Extended attendance data including Discord RSVP response history
 */
interface ExtendedAttendanceData extends AttendanceData {
  userResponse?: string;
  responseHistory?: Array<{ response: string; timestamp: string }>;
  hadLastMinuteSnivel?: boolean;
  hadAdvancedSnivel?: boolean;
  hadNoResponse?: boolean;
}

/**
 * Batch fetch all pilot statuses for efficiency
 */
async function fetchAllPilotStatuses(pilotIds: string[]): Promise<Map<string, Array<{ start_date: string; end_date: string | null; isActive: boolean }>>> {
  const { data, error } = await supabase
    .from('pilot_statuses')
    .select(`
      pilot_id,
      start_date,
      end_date,
      statuses!inner(isActive)
    `)
    .in('pilot_id', pilotIds);

  if (error) {
    console.error('Error fetching pilot statuses:', error);
    return new Map();
  }

  // Group statuses by pilot_id
  const statusesByPilot = new Map<string, Array<{ start_date: string; end_date: string | null; isActive: boolean }>>();

  data?.forEach((record: any) => {
    const status = Array.isArray(record.statuses) ? record.statuses[0] : record.statuses;
    if (!statusesByPilot.has(record.pilot_id)) {
      statusesByPilot.set(record.pilot_id, []);
    }
    statusesByPilot.get(record.pilot_id)!.push({
      start_date: record.start_date,
      end_date: record.end_date,
      isActive: status?.isActive ?? false
    });
  });

  return statusesByPilot;
}

/**
 * Check if a pilot was active on a specific date using pre-fetched statuses
 */
function isPilotActiveOnDate(
  pilotStatuses: Array<{ start_date: string; end_date: string | null; isActive: boolean }>,
  eventDate: string
): boolean {
  if (!pilotStatuses || pilotStatuses.length === 0) {
    return false;
  }

  // Check if any status record covers this date and is active
  return pilotStatuses.some(status => {
    const startDate = new Date(status.start_date);
    const endDate = status.end_date ? new Date(status.end_date) : null;
    const checkDate = new Date(eventDate);

    const isInRange = startDate <= checkDate && (!endDate || endDate >= checkDate);
    return isInRange && status.isActive;
  });
}

/**
 * Fetch attendance data for events including response history
 */
async function fetchAttendanceData(events: EventData[], pilots: PilotData[]): Promise<ExtendedAttendanceData[]> {
  const attendanceRecords: ExtendedAttendanceData[] = [];

  // Batch fetch all pilot statuses upfront for performance
  const pilotIds = pilots.map(p => p.id);
  const pilotStatusesMap = await fetchAllPilotStatuses(pilotIds);

  // Map discord_id to pilot_id
  const discordToPilotMap = new Map<string, PilotData>();
  pilots.forEach(pilot => {
    if (pilot.discord_id) {
      discordToPilotMap.set(pilot.discord_id, pilot);
    }
  });

  // For each event, get all Discord message IDs (or synthetic IDs for manual entries)
  for (const event of events) {
    // Filter pilots to only include those who were active on this event's date
    const eventDate = new Date(event.start_datetime).toISOString().split('T')[0];
    const activePilotsForEvent: PilotData[] = [];

    for (const pilot of pilots) {
      const statuses = pilotStatusesMap.get(pilot.id) || [];
      const isActive = isPilotActiveOnDate(statuses, eventDate);
      if (isActive) {
        activePilotsForEvent.push(pilot);
      }
    }
    const messageIds = event.discord_event_id.map(d => d.messageId);
    const syntheticId = `manual-${event.id}`;
    const allEventIds = messageIds.length > 0 ? messageIds : [syntheticId];

    if (allEventIds.length === 0) {
      continue;
    }

    // Fetch ALL response rows (including history) for this event
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, user_response, roll_call_response, created_at')
      .in('discord_event_id', allEventIds)
      .order('created_at', { ascending: true });

    if (attendanceError) {
      console.error(`Error fetching attendance for event ${event.name}:`, attendanceError);
      continue;
    }

    if (!attendanceData || attendanceData.length === 0) {
      continue;
    }

    // Group responses by pilot
    const responsesByPilot = new Map<string, typeof attendanceData>();
    attendanceData.forEach(record => {
      if (record.discord_id) {
        const existing = responsesByPilot.get(record.discord_id) || [];
        responsesByPilot.set(record.discord_id, [...existing, record]);
      }
    });

    // Process each pilot's response history
    const eventStartTime = new Date(event.start_datetime);
    const twoHoursBeforeEvent = new Date(eventStartTime.getTime() - 2 * 60 * 60 * 1000);

    // Track which pilots have responses
    const pilotsWithResponses = new Set<string>();

    responsesByPilot.forEach((responses, discordId) => {
      const pilot = discordToPilotMap.get(discordId);
      if (!pilot) return;

      pilotsWithResponses.add(pilot.id);

      // Get Discord RSVP responses (accepted/declined/tentative)
      const discordResponses = responses.filter(r =>
        ['accepted', 'declined', 'tentative'].includes(r.user_response)
      );

      // Find the latest roll call response
      // Roll call data can be stored two ways:
      // 1. As a separate record with user_response='roll_call' (when pilot had no RSVP)
      // 2. On an existing RSVP record with roll_call_response set (when pilot had RSVP)
      const recordsWithRollCall = responses.filter(r => r.roll_call_response != null);
      const latestRollCall = recordsWithRollCall.length > 0
        ? recordsWithRollCall[recordsWithRollCall.length - 1]
        : null;

      // Get the latest Discord RSVP response
      const latestDiscordResponse = discordResponses.length > 0
        ? discordResponses[discordResponses.length - 1]
        : null;

      // Build response history for Discord RSVPs
      const responseHistory = discordResponses.map(r => ({
        response: r.user_response,
        timestamp: r.created_at
      }));

      // Determine if this was a "last minute snivel"
      // Criteria: Changed from 'accepted' to 'declined' or 'tentative' within 2 hours of event start
      let hadLastMinuteSnivel = false;
      for (let i = 1; i < discordResponses.length; i++) {
        const prevResponse = discordResponses[i - 1];
        const currResponse = discordResponses[i];
        const changeTime = new Date(currResponse.created_at);

        if (prevResponse.user_response === 'accepted' &&
            (currResponse.user_response === 'declined' || currResponse.user_response === 'tentative') &&
            changeTime >= twoHoursBeforeEvent &&
            changeTime <= eventStartTime) {
          hadLastMinuteSnivel = true;
          break;
        }
      }

      // Determine if this was an "advanced snivel"
      // Criteria: Latest response is 'declined' or 'tentative', not present at roll call,
      // and did NOT have a last minute snivel (i.e., marked declined/tentative >2 hours before event)
      const hadAdvancedSnivel = Boolean(
        !hadLastMinuteSnivel &&
        (!latestRollCall || latestRollCall.roll_call_response !== 'Present') &&
        latestDiscordResponse &&
        (latestDiscordResponse.user_response === 'declined' || latestDiscordResponse.user_response === 'tentative')
      );

      // Determine if this was "no response"
      // Criteria: No Discord RSVP response (no accepted/declined/tentative) AND no roll call entry at all
      // If they have a roll call entry (even if Absent), they were accounted for
      const hasValidDiscordResponse = latestDiscordResponse &&
        ['accepted', 'declined', 'tentative'].includes(latestDiscordResponse.user_response);

      const hadNoResponse = !latestRollCall && !hasValidDiscordResponse;

      attendanceRecords.push({
        pilotId: pilot.id,
        eventId: event.id,
        rollCallResponse: latestRollCall?.roll_call_response as 'Present' | 'Absent' | 'Tentative' | null,
        userResponse: latestDiscordResponse?.user_response,
        responseHistory,
        hadLastMinuteSnivel,
        hadAdvancedSnivel,
        hadNoResponse
      });
    });

    // Add records for pilots who had NO responses at all for this event
    // Only include pilots who were active on this event's date
    activePilotsForEvent.forEach(pilot => {
      if (!pilotsWithResponses.has(pilot.id)) {
        attendanceRecords.push({
          pilotId: pilot.id,
          eventId: event.id,
          rollCallResponse: null,
          userResponse: undefined,
          responseHistory: [],
          hadLastMinuteSnivel: false,
          hadAdvancedSnivel: false,
          hadNoResponse: true  // They didn't respond and weren't present
        });
      }
    });
  }

  return attendanceRecords;
}

/**
 * Calculate squadron-specific metrics for each event
 */
function calculateEventSquadronMetrics(
  events: EventData[],
  pilots: PilotData[],
  attendance: ExtendedAttendanceData[]
): EventSquadronMetrics[] {
  // Group pilots by squadron
  const pilotsBySquadron = new Map<string, PilotData[]>();
  pilots.forEach(pilot => {
    const squadronId = pilot.squadronId || 'unassigned';
    if (!pilotsBySquadron.has(squadronId)) {
      pilotsBySquadron.set(squadronId, []);
    }
    pilotsBySquadron.get(squadronId)!.push(pilot);
  });

  return events.map(event => {
    const eventAttendance = attendance.filter(a => a.eventId === event.id);
    const squadronMetrics: SquadronMetrics[] = [];

    // Calculate metrics for each squadron
    pilotsBySquadron.forEach((squadronPilots, squadronId) => {
      const totalPilots = squadronPilots.length;
      const squadronPilotIds = new Set(squadronPilots.map(p => p.id));

      // Filter attendance to only this squadron's pilots
      const squadronAttendance = eventAttendance.filter(a => squadronPilotIds.has(a.pilotId));

      // Attendance: Pilots marked as present during roll call
      const attendanceCount = squadronAttendance.filter(a => a.rollCallResponse === 'Present').length;

      // Last Minute Snivels: Pilots who changed from accepted to declined/tentative within 2 hours of event start
      const lastMinuteSniveCount = squadronAttendance.filter(a => a.hadLastMinuteSnivel === true).length;

      // Advanced Snivels: Pilots who marked declined/tentative more than 2 hours before event
      const advancedSniveCount = squadronAttendance.filter(a => a.hadAdvancedSnivel === true).length;

      // Total Snivels: Sum of last minute and advanced snivels
      const totalSnivelsCount = lastMinuteSniveCount + advancedSniveCount;

      // No Response: Pilots who didn't respond to Discord and weren't marked present
      const noResponseCount = squadronAttendance.filter(a => a.hadNoResponse === true).length;

      // Debug logging for development
      if (event.name && event.name.includes('Week 6') && squadronId !== 'unassigned') {
        const noResponsePilots = squadronAttendance.filter(a => a.hadNoResponse === true);
        console.log(`${event.name} - Squadron ${squadronId}:`, {
          totalPilots,
          attendanceCount,
          lastMinuteSniveCount,
          advancedSniveCount,
          totalSnivelsCount,
          noResponseCount,
          noResponsePilotIds: noResponsePilots.map(a => a.pilotId),
          allPilotIds: squadronPilots.map(p => p.id),
          attendanceRecords: squadronAttendance.map(a => ({
            pilotId: a.pilotId,
            rollCall: a.rollCallResponse,
            userResponse: a.userResponse,
            hadNoResponse: a.hadNoResponse,
            hadAdvancedSnivel: a.hadAdvancedSnivel,
            hadLastMinuteSnivel: a.hadLastMinuteSnivel
          }))
        });
      }

      // No Shows: Pilots who responded "accepted" to Discord but were NOT marked present during roll call
      // (excluding those counted as last minute snivels)
      const noShowCount = squadronAttendance.filter(a => {
        const acceptedDiscord = a.userResponse === 'accepted';
        const notPresent = a.rollCallResponse !== 'Present';
        const notLastMinuteSnivel = !a.hadLastMinuteSnivel;
        return acceptedDiscord && notPresent && notLastMinuteSnivel;
      }).length;

      const attendancePercentage = totalPilots > 0
        ? Math.round((attendanceCount / totalPilots) * 100)
        : 0;

      squadronMetrics.push({
        squadronId,
        attendanceCount,
        noShowCount,
        lastMinuteSniveCount,
        advancedSniveCount,
        totalSnivelsCount,
        noResponseCount,
        totalPilots,
        attendancePercentage
      });
    });

    return {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.start_datetime,
      squadronMetrics
    };
  });
}

/**
 * Fetch complete report data for a specific cycle
 */
export async function fetchCycleAttendanceReport(
  cycleId: string,
  filters?: ReportFilters
): Promise<CycleAttendanceReportData> {
  // Fetch cycle details
  const { data: cycleData, error: cycleError } = await supabase
    .from('cycles')
    .select('id, name, start_date, end_date, type, participants')
    .eq('id', cycleId)
    .single();

  if (cycleError || !cycleData) {
    console.error('Error fetching cycle:', cycleError);
    throw cycleError || new Error('Cycle not found');
  }

  // Fetch events in this cycle (filter out future events)
  const now = new Date().toISOString();
  const { data: eventsData, error: eventsError} = await supabase
    .from('events')
    .select('id, name, start_datetime, cycle_id, discord_event_id, event_settings')
    .eq('cycle_id', cycleId)
    .lte('start_datetime', now) // Only past events
    .order('start_datetime', { ascending: true });

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    throw eventsError;
  }

  // Filter out events excluded from attendance reports (via event_settings.includeInAttendanceReport)
  const includedEvents = (eventsData || []).filter(event => {
    const eventSettings = event.event_settings as any;
    // Include event if includeInAttendanceReport is undefined (default) or true
    return eventSettings?.includeInAttendanceReport !== false;
  });

  const events: EventData[] = includedEvents.map(event => ({
    id: event.id,
    name: event.name,
    start_datetime: event.start_datetime,
    cycle_id: event.cycle_id,
    discord_event_id: Array.isArray(event.discord_event_id)
      ? (event.discord_event_id as Array<{ messageId: string; guildId: string; channelId: string; squadronId: string; }>)
      : []
  }));

  // Fetch active pilots with filters
  const pilots = await fetchActivePilots(cycleData.start_date, cycleData.end_date, filters);

  // Fetch attendance records
  const attendance = await fetchAttendanceData(events, pilots);

  // Fetch squadrons with color palettes
  const { data: squadronsData, error: squadronsError } = await supabase
    .from('org_squadrons')
    .select('id, name, designation, insignia_url, color_palette')
    .order('name', { ascending: true });

  if (squadronsError) {
    console.error('Error fetching squadrons:', squadronsError);
    throw squadronsError;
  }

  const squadrons = (squadronsData || []) as SquadronData[];

  // Fetch qualifications
  const { data: qualificationsData, error: qualificationsError } = await supabase
    .from('qualifications')
    .select('id, name, code, color')
    .eq('active', true)
    .order('order', { ascending: true });

  if (qualificationsError) {
    console.error('Error fetching qualifications:', qualificationsError);
    throw qualificationsError;
  }

  const qualifications = (qualificationsData || []) as QualificationData[];

  // Calculate squadron metrics for each event
  const eventSquadronMetrics = calculateEventSquadronMetrics(events, pilots, attendance);

  // Process data into overall chart format (legacy, kept for compatibility)
  const chartData: ChartDataPoint[] = events.map(event => {
    const eventAttendance = attendance.filter(a => a.eventId === event.id);

    // Attendance: Pilots marked as present during roll call
    const presentCount = eventAttendance.filter(a => a.rollCallResponse === 'Present').length;

    // Last Minute Snivels: Pilots who changed from accepted to declined/tentative within 2 hours of event start
    const lastMinuteSniveCount = eventAttendance.filter(a => a.hadLastMinuteSnivel === true).length;

    // Advanced Snivels: Pilots who marked declined/tentative more than 2 hours before event
    const advancedSniveCount = eventAttendance.filter(a => a.hadAdvancedSnivel === true).length;

    // Total Snivels: Sum of last minute and advanced snivels
    const totalSnivelsCount = lastMinuteSniveCount + advancedSniveCount;

    // No Response: Pilots who didn't respond to Discord and weren't marked present
    const noResponseCount = eventAttendance.filter(a => a.hadNoResponse === true).length;

    // No Shows: Pilots who responded "accepted" to Discord but were NOT marked present during roll call
    // (excluding those counted as last minute snivels)
    const noShowCount = eventAttendance.filter(a => {
      const acceptedDiscord = a.userResponse === 'accepted';
      const notPresent = a.rollCallResponse !== 'Present';
      const notLastMinuteSnivel = !a.hadLastMinuteSnivel;
      return acceptedDiscord && notPresent && notLastMinuteSnivel;
    }).length;

    const totalPilots = pilots.length;
    const attendancePercentage = totalPilots > 0
      ? Math.round((presentCount / totalPilots) * 100)
      : 0;

    return {
      eventName: event.name,
      eventDate: event.start_datetime,
      attendanceCount: presentCount,
      totalPilots,
      attendancePercentage,
      noShowCount,
      lastMinuteSniveCount,
      advancedSniveCount,
      totalSnivelsCount,
      noResponseCount
    };
  });

  return {
    cycle: cycleData,
    events,
    chartData,
    eventSquadronMetrics,
    squadrons,
    qualifications,
    pilots
  };
}

/**
 * Export report data to CSV format
 */
export function exportToCSV(data: CycleAttendanceReportData): string {
  const headers = [
    'Event Name',
    'Event Date',
    'Attendance Count',
    'Total Pilots',
    'Attendance %',
    'No Show Count',
    'Last Minute Snivel Count',
    'Advanced Snivel Count'
  ];

  const rows = data.chartData.map(row => [
    row.eventName,
    new Date(row.eventDate).toLocaleString(),
    row.attendanceCount.toString(),
    row.totalPilots.toString(),
    `${row.attendancePercentage}%`,
    row.noShowCount.toString(),
    row.lastMinuteSniveCount.toString(),
    row.advancedSniveCount.toString()
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}
