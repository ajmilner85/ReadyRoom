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

  // Fetch full pilot data with squadron assignments
  const pilots: PilotData[] = [];

  for (const pilotId of uniquePilotIds) {
    const pilotRecord = pilotStatusRecords.find(r => r.pilot_id === pilotId);
    if (!pilotRecord || !pilotRecord.pilots) continue;

    const pilot = Array.isArray(pilotRecord.pilots) ? pilotRecord.pilots[0] : pilotRecord.pilots;

    // Fetch squadron assignment for this pilot
    const { data: squadronData, error: squadronError } = await supabase
      .from('pilot_assignments')
      .select(`
        squadron_id,
        org_squadrons(
          id,
          name
        )
      `)
      .eq('pilot_id', pilotId)
      .is('end_date', null)
      .maybeSingle();

    let squadronId: string | undefined;
    let squadronName: string | undefined;

    if (!squadronError && squadronData && squadronData.org_squadrons) {
      const squadron = Array.isArray(squadronData.org_squadrons)
        ? squadronData.org_squadrons[0]
        : squadronData.org_squadrons;
      squadronId = squadron.id;
      squadronName = squadron.name;
    }

    // Apply squadron filter if specified
    if (filters?.squadronIds && filters.squadronIds.length > 0) {
      if (!squadronId || !filters.squadronIds.includes(squadronId)) {
        continue; // Skip this pilot
      }
    }

    // Apply qualification filter if specified
    if (filters?.qualificationIds && filters.qualificationIds.length > 0) {
      // Fetch pilot qualifications
      const { data: qualData, error: qualError } = await supabase
        .from('pilot_qualifications')
        .select('qualification_id')
        .eq('pilot_id', pilotId)
        .or(`expiry_date.is.null,expiry_date.gte.${startDate}`);

      if (qualError) {
        console.error(`Error fetching qualifications for pilot ${pilotId}:`, qualError);
        continue;
      }

      const pilotQualIds = (qualData || []).map(q => q.qualification_id);
      const hasRequiredQual = filters.qualificationIds.some(qid => pilotQualIds.includes(qid));

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
      squadronName
    });
  }

  // Sort by board number
  pilots.sort((a, b) => parseInt(a.boardNumber) - parseInt(b.boardNumber));

  return pilots;
}

/**
 * Fetch attendance data for events
 */
async function fetchAttendanceData(events: EventData[], pilots: PilotData[]): Promise<AttendanceData[]> {
  const attendanceRecords: AttendanceData[] = [];

  // For each event, get all Discord message IDs
  for (const event of events) {
    const messageIds = event.discord_event_id.map(d => d.messageId);

    if (messageIds.length === 0) {
      continue;
    }

    // Fetch roll call responses for this event's message IDs
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, roll_call_response')
      .in('discord_event_id', messageIds)
      .not('roll_call_response', 'is', null);

    if (attendanceError) {
      console.error(`Error fetching attendance for event ${event.name}:`, attendanceError);
      continue;
    }

    if (!attendanceData || attendanceData.length === 0) {
      continue;
    }

    // Map discord_id to pilot_id using the pilots we already have
    const discordToPilotMap = new Map<string, PilotData>();
    pilots.forEach(pilot => {
      if (pilot.discord_id) {
        discordToPilotMap.set(pilot.discord_id, pilot);
      }
    });

    // Map to attendance records
    attendanceData.forEach(record => {
      if (record.discord_id) {
        const pilot = discordToPilotMap.get(record.discord_id);
        if (pilot) {
          attendanceRecords.push({
            pilotId: pilot.id,
            eventId: event.id,
            rollCallResponse: record.roll_call_response as 'Present' | 'Absent' | 'Tentative' | null
          });
        }
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
  attendance: AttendanceData[]
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

      // Count presents
      const attendanceCount = squadronAttendance.filter(a => a.rollCallResponse === 'Present').length;

      // Count no-shows (pilots who didn't respond)
      const respondedPilotIds = new Set(squadronAttendance.map(a => a.pilotId));
      const noShowCount = totalPilots - respondedPilotIds.size;

      // Count snivels (absent responses)
      const lastMinuteSniveCount = squadronAttendance.filter(a => a.rollCallResponse === 'Absent').length;

      const attendancePercentage = totalPilots > 0
        ? Math.round((attendanceCount / totalPilots) * 100)
        : 0;

      squadronMetrics.push({
        squadronId,
        attendanceCount,
        noShowCount,
        lastMinuteSniveCount,
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
    .select('id, name, start_datetime, cycle_id, discord_event_id')
    .eq('cycle_id', cycleId)
    .lte('start_datetime', now) // Only past events
    .order('start_datetime', { ascending: true });

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    throw eventsError;
  }

  const events: EventData[] = (eventsData || []).map(event => ({
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

    const presentCount = eventAttendance.filter(a => a.rollCallResponse === 'Present').length;
    const respondedPilotIds = new Set(eventAttendance.map(a => a.pilotId));
    const noShowCount = pilots.length - respondedPilotIds.size;
    const lastMinuteSniveCount = eventAttendance.filter(a => a.rollCallResponse === 'Absent').length;

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
      lastMinuteSniveCount
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
    'Last Minute Snivel Count'
  ];

  const rows = data.chartData.map(row => [
    row.eventName,
    new Date(row.eventDate).toLocaleString(),
    row.attendanceCount.toString(),
    row.totalPilots.toString(),
    `${row.attendancePercentage}%`,
    row.noShowCount.toString(),
    row.lastMinuteSniveCount.toString()
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}
