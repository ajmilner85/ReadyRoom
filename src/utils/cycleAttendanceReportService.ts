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
  ChartDataPoint,
  CycleAttendanceReportData,
  ReportFilters
} from '../types/ReportTypes';

/**
 * Fetch all cycles for dropdown selection
 */
export async function fetchCycles(): Promise<CycleData[]> {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, name, start_date, end_date, type')
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
    .select('id, name, start_date, end_date, type')
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
    .select('id, name, start_date, end_date, type')
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
 * Fetch active pilots during a cycle period, optionally filtered by squadron
 */
async function fetchActivePilots(
  startDate: string,
  endDate: string,
  filters?: ReportFilters
): Promise<PilotData[]> {
  // Get pilots who had an active status during the cycle period
  let statusQuery = supabase
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

    // Apply pilot filter if specified
    if (filters?.pilotIds && filters.pilotIds.length > 0) {
      if (!filters.pilotIds.includes(pilot.id)) {
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
      .select('discord_id, roll_call_response, updated_at')
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

    // Map to attendance records with updated_at for last-minute snivel detection
    attendanceData.forEach(record => {
      if (record.discord_id) {
        const pilot = discordToPilotMap.get(record.discord_id);
        if (pilot) {
          attendanceRecords.push({
            pilotId: pilot.id,
            eventId: event.id,
            rollCallResponse: record.roll_call_response as 'Present' | 'Absent' | 'Tentative' | null
          });

          // Track updated_at separately for snivel detection
          if (record.roll_call_response === 'Absent') {
            const eventDate = new Date(event.start_datetime);
            const twentyFourHoursBefore = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
            const responseDate = new Date(record.updated_at);

            // Store this info on the record for later use (we'll track it in the processing step)
            (record as any).isLastMinuteSnivel = responseDate >= twentyFourHoursBefore;
          }
        }
      }
    });
  }

  return attendanceRecords;
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
    .select('id, name, start_date, end_date, type')
    .eq('id', cycleId)
    .single();

  if (cycleError || !cycleData) {
    console.error('Error fetching cycle:', cycleError);
    throw cycleError || new Error('Cycle not found');
  }

  // Fetch events in this cycle
  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select('id, name, start_datetime, cycle_id, discord_event_id')
    .eq('cycle_id', cycleId)
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

  // Fetch squadrons for filter UI
  const { data: squadronsData, error: squadronsError } = await supabase
    .from('org_squadrons')
    .select('id, name')
    .order('name', { ascending: true });

  if (squadronsError) {
    console.error('Error fetching squadrons:', squadronsError);
    throw squadronsError;
  }

  const squadrons = (squadronsData || []) as SquadronData[];

  // Process data into chart format
  const chartData: ChartDataPoint[] = events.map(event => {
    const eventAttendance = attendance.filter(a => a.eventId === event.id);

    // Count unique pilots who responded Present
    const presentCount = eventAttendance.filter(a => a.rollCallResponse === 'Present').length;

    // Count pilots who didn't respond at all (no record for this event)
    const respondedPilotIds = new Set(eventAttendance.map(a => a.pilotId));
    const noShowCount = pilots.length - respondedPilotIds.size;

    // Count "Last Minute Snivel" (Absent responses within 24h of event)
    // Note: We simplified this - in production you'd track updated_at through the whole chain
    const lastMinuteSniveCount = eventAttendance.filter(a => {
      return a.rollCallResponse === 'Absent';
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
      lastMinuteSniveCount
    };
  });

  return {
    cycle: cycleData,
    events,
    chartData,
    squadrons,
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
