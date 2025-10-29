/**
 * Attendance Report Service
 * Generates Excel reports showing attendance history across training cycles
 */

import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';
import type {
  CycleReportData,
  EventReportData,
  PilotReportData,
  AttendanceRecord,
  PilotAttendanceRow,
  QualificationAttendanceRow,
  SquadronAttendanceRow,
  CycleSheetData,
  AttendanceMarker,
  QualificationReportData
} from './attendanceReportTypes';

/**
 * Fetch cycle data by ID
 */
async function fetchCycleData(cycleId: string): Promise<CycleReportData | null> {
  try {
    const { data, error } = await supabase
      .from('cycles')
      .select('id, name, start_date, end_date, type')
      .eq('id', cycleId)
      .single();

    if (error) {
      console.error('Error fetching cycle data:', error);
      return null;
    }

    if (!data) {
      console.error('Cycle not found:', cycleId);
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      startDate: data.start_date,
      endDate: data.end_date,
      type: data.type
    };
  } catch (error) {
    console.error('Unexpected error fetching cycle data:', error);
    return null;
  }
}

/**
 * Fetch events for a cycle
 */
async function fetchCycleEvents(cycleId: string): Promise<EventReportData[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, start_datetime, discord_event_id')
      .eq('cycle_id', cycleId)
      .order('start_datetime', { ascending: true });

    if (error) {
      console.error('Error fetching cycle events:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn('No events found for cycle:', cycleId);
      return [];
    }

    return data.map(event => ({
      id: event.id,
      name: event.name,
      startDatetime: event.start_datetime,
      discordEventIds: Array.isArray(event.discord_event_id)
        ? (event.discord_event_id as Array<{ messageId: string; guildId: string; channelId: string; squadronId: string; }>)
        : []
    }));
  } catch (error) {
    console.error('Unexpected error fetching cycle events:', error);
    return [];
  }
}

/**
 * Fetch pilots who were active during the cycle period
 */
async function fetchActivePilots(startDate: string, endDate: string): Promise<PilotReportData[]> {
  try {
    // Get pilots who had an active status during the cycle period
    const { data: pilotStatusRecords, error: statusError } = await supabase
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

    if (statusError) {
      console.error('Error fetching active pilots:', statusError);
      return [];
    }

    if (!pilotStatusRecords || pilotStatusRecords.length === 0) {
      console.warn('No active pilots found for date range:', startDate, endDate);
      return [];
    }

    // Get unique pilot IDs
    const uniquePilotIds = [...new Set(pilotStatusRecords.map(record => record.pilot_id))];

    // Fetch full pilot data with qualifications
    const pilots: PilotReportData[] = [];

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

      // Fetch qualifications for this pilot
      const { data: qualificationData, error: qualError } = await supabase
        .from('pilot_qualifications')
        .select(`
          qualification_id,
          qualifications!inner(
            id,
            name,
            order
          )
        `)
        .eq('pilot_id', pilotId)
        .or(`expiry_date.is.null,expiry_date.gte.${startDate}`);

      if (qualError) {
        console.error(`Error fetching qualifications for pilot ${pilotId}:`, qualError);
      }

      const qualifications: QualificationReportData[] = [];
      if (qualificationData && qualificationData.length > 0) {
        qualificationData.forEach(qRecord => {
          if (qRecord.qualifications) {
            const qual = Array.isArray(qRecord.qualifications)
              ? qRecord.qualifications[0]
              : qRecord.qualifications;
            qualifications.push({
              id: qual.id,
              name: qual.name,
              order: qual.order ?? 999
            });
          }
        });
      }

      pilots.push({
        id: pilot.id,
        callsign: pilot.callsign,
        boardNumber: pilot.boardNumber.toString(),
        discordId: pilot.discord_id || undefined,
        qualifications: qualifications,
        squadronId: squadronId,
        squadronName: squadronName
      });
    }

    // Sort by board number
    pilots.sort((a, b) => parseInt(a.boardNumber) - parseInt(b.boardNumber));

    return pilots;
  } catch (error) {
    console.error('Unexpected error fetching active pilots:', error);
    return [];
  }
}

/**
 * Fetch attendance data for all events
 */
async function fetchAttendanceData(events: EventReportData[]): Promise<AttendanceRecord[]> {
  try {
    const attendanceRecords: AttendanceRecord[] = [];

    // For each event, get all Discord message IDs
    for (const event of events) {
      const messageIds = event.discordEventIds.map(d => d.messageId);

      if (messageIds.length === 0) {
        console.warn(`No Discord message IDs for event: ${event.name}`);
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
        console.warn(`No attendance data for event: ${event.name}`);
        continue;
      }

      // Get pilot IDs by matching discord_id
      const discordIds = attendanceData.map(a => a.discord_id).filter(Boolean);

      if (discordIds.length === 0) {
        continue;
      }

      const { data: pilotsData, error: pilotsError } = await supabase
        .from('pilots')
        .select('id, discord_id')
        .in('discord_id', discordIds);

      if (pilotsError) {
        console.error(`Error fetching pilots for event ${event.name}:`, pilotsError);
        continue;
      }

      // Map discord_id to pilot_id
      const discordToPilotMap = new Map<string, string>();
      pilotsData?.forEach(pilot => {
        if (pilot.discord_id) {
          discordToPilotMap.set(pilot.discord_id, pilot.id);
        }
      });

      // Map to attendance records
      attendanceData.forEach(record => {
        if (record.discord_id) {
          const pilotId = discordToPilotMap.get(record.discord_id);
          if (pilotId) {
            attendanceRecords.push({
              pilotId: pilotId,
              eventId: event.id,
              rollCallResponse: record.roll_call_response as 'Present' | 'Absent' | 'Tentative' | null
            });
          }
        }
      });
    }

    return attendanceRecords;
  } catch (error) {
    console.error('Unexpected error fetching attendance data:', error);
    return [];
  }
}

/**
 * Transform attendance data into pilot rows
 */
function buildPilotRows(
  pilots: PilotReportData[],
  events: EventReportData[],
  attendanceRecords: AttendanceRecord[]
): PilotAttendanceRow[] {
  return pilots.map(pilot => {
    const attendance: Record<string, AttendanceMarker> = {};

    events.forEach(event => {
      const record = attendanceRecords.find(
        r => r.pilotId === pilot.id && r.eventId === event.id
      );

      if (!record || record.rollCallResponse === null) {
        // No roll call entry
        attendance[event.id] = '?';
      } else if (record.rollCallResponse === 'Present') {
        attendance[event.id] = 'X';
      } else if (record.rollCallResponse === 'Absent') {
        attendance[event.id] = '';
      } else if (record.rollCallResponse === 'Tentative') {
        attendance[event.id] = '?';
      }
    });

    return {
      pilotId: pilot.id,
      boardNumber: pilot.boardNumber,
      callsign: pilot.callsign,
      displayName: `${pilot.boardNumber} - ${pilot.callsign}`,
      attendance
    };
  });
}

/**
 * Build qualification attendance rows
 */
function buildQualificationRows(
  pilots: PilotReportData[],
  events: EventReportData[],
  attendanceRecords: AttendanceRecord[]
): QualificationAttendanceRow[] {
  // Get all unique qualifications across all pilots
  const qualificationMap = new Map<string, QualificationReportData>();

  pilots.forEach(pilot => {
    pilot.qualifications.forEach(qual => {
      if (!qualificationMap.has(qual.id)) {
        qualificationMap.set(qual.id, qual);
      }
    });
  });

  const qualifications = Array.from(qualificationMap.values());
  qualifications.sort((a, b) => a.order - b.order);

  // For each qualification, count unique pilots who attended each event
  return qualifications.map(qual => {
    const attendance: Record<string, number> = {};

    events.forEach(event => {
      // Find all pilots with this qualification
      const pilotsWithQual = pilots.filter(pilot =>
        pilot.qualifications.some(q => q.id === qual.id)
      );

      // Count how many of them were present at this event
      const presentCount = pilotsWithQual.filter(pilot => {
        const record = attendanceRecords.find(
          r => r.pilotId === pilot.id && r.eventId === event.id
        );
        return record && record.rollCallResponse === 'Present';
      }).length;

      attendance[event.id] = presentCount;
    });

    return {
      qualificationName: qual.name,
      qualificationOrder: qual.order,
      attendance
    };
  });
}

/**
 * Build squadron attendance rows
 */
function buildSquadronRows(
  pilots: PilotReportData[],
  events: EventReportData[],
  attendanceRecords: AttendanceRecord[]
): SquadronAttendanceRow[] {
  // Get all unique squadrons
  const squadronMap = new Map<string, string>();
  pilots.forEach(pilot => {
    if (pilot.squadronId && pilot.squadronName) {
      squadronMap.set(pilot.squadronId, pilot.squadronName);
    }
  });

  const squadrons = Array.from(squadronMap.entries()).map(([id, name]) => ({ id, name }));
  squadrons.sort((a, b) => a.name.localeCompare(b.name));

  // For each squadron, count unique pilots who attended each event
  return squadrons.map(squadron => {
    const attendance: Record<string, number> = {};

    events.forEach(event => {
      // Find all pilots in this squadron
      const pilotsInSquadron = pilots.filter(pilot => pilot.squadronId === squadron.id);

      // Count how many of them were present at this event
      const presentCount = pilotsInSquadron.filter(pilot => {
        const record = attendanceRecords.find(
          r => r.pilotId === pilot.id && r.eventId === event.id
        );
        return record && record.rollCallResponse === 'Present';
      }).length;

      attendance[event.id] = presentCount;
    });

    return {
      squadronName: squadron.name,
      attendance
    };
  });
}

/**
 * Generate Excel workbook from cycle sheet data
 */
function generateExcelWorkbook(sheetData: CycleSheetData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const now = new Date();

  // Create worksheet data array
  const wsData: any[][] = [];

  // Header row (Event 1, Event 2, etc.)
  const headerRow = ['Board # - Callsign'];
  sheetData.events.forEach((_event, index) => {
    headerRow.push(`Event ${index + 1}`);
  });
  wsData.push(headerRow);

  // Date row (event start dates)
  const dateRow = [''];
  sheetData.events.forEach(event => {
    const eventDate = new Date(event.startDatetime);
    const dateStr = eventDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    dateRow.push(dateStr);
  });
  wsData.push(dateRow);

  // Pilot rows
  sheetData.pilotRows.forEach(pilotRow => {
    const row = [pilotRow.displayName];
    sheetData.events.forEach(event => {
      row.push(pilotRow.attendance[event.id] || '');
    });
    wsData.push(row);
  });

  // Blank separator row
  wsData.push([]);

  // Qualification section header
  wsData.push(['QUALIFICATION BREAKDOWN']);

  // Qualification rows
  sheetData.qualificationRows.forEach(qualRow => {
    const row: (string | number)[] = [qualRow.qualificationName];
    sheetData.events.forEach(event => {
      row.push(qualRow.attendance[event.id] || 0);
    });
    wsData.push(row);
  });

  // Blank separator row
  wsData.push([]);

  // Squadron section header
  wsData.push(['SQUADRON BREAKDOWN']);

  // Squadron rows
  sheetData.squadronRows.forEach(squadronRow => {
    const row: (string | number)[] = [squadronRow.squadronName];
    sheetData.events.forEach(event => {
      row.push(squadronRow.attendance[event.id] || 0);
    });
    wsData.push(row);
  });

  // Create worksheet from data
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = [{ wch: 20 }]; // First column (pilot names)
  sheetData.events.forEach(() => {
    colWidths.push({ wch: 12 }); // Event columns
  });
  worksheet['!cols'] = colWidths;

  // Add cell styles and formatting
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellAddress];

      if (!cell) continue;

      // Initialize cell style
      if (!cell.s) cell.s = {};

      // Header row (row 0) - center align
      if (R === 0 && C > 0) {
        cell.s.alignment = { horizontal: 'center', vertical: 'center' };
      }

      // Date row (row 1) - center align
      if (R === 1 && C > 0) {
        cell.s.alignment = { horizontal: 'center', vertical: 'center' };

        // Check if event is in the future, apply grey text
        const eventIndex = C - 1;
        if (eventIndex < sheetData.events.length) {
          const eventDate = new Date(sheetData.events[eventIndex].startDatetime);
          if (eventDate > now) {
            cell.s.font = { color: { rgb: 'D1D5DB' } }; // Light grey
          }
        }
      }

      // Pilot attendance cells (columns > 0, rows after header+date) - center align
      if (R >= 2 && C > 0) {
        const pilotRowEnd = 2 + sheetData.pilotRows.length - 1;
        if (R <= pilotRowEnd) {
          cell.s.alignment = { horizontal: 'center', vertical: 'center' };

          // Apply grey text if event is in future
          const eventIndex = C - 1;
          if (eventIndex < sheetData.events.length) {
            const eventDate = new Date(sheetData.events[eventIndex].startDatetime);
            if (eventDate > now) {
              cell.s.font = { color: { rgb: 'D1D5DB' } }; // Light grey
            }
          }
        }
      }

      // Qualification and Squadron breakdown cells - center align numbers
      if (C > 0 && cell.t === 'n') {
        cell.s.alignment = { horizontal: 'center', vertical: 'center' };
      }
    }
  }

  // Add comments/notes to header cells with event titles
  sheetData.events.forEach((event, index) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index + 1 });
    if (!worksheet[cellAddress].c) worksheet[cellAddress].c = [];
    worksheet[cellAddress].c.push({
      a: 'ReadyRoom',
      t: event.name
    });
  });

  // Add worksheet to workbook
  // Excel sheet names are limited to 31 characters
  let sheetName = sheetData.cycle.name;
  if (sheetName.length > 31) {
    sheetName = sheetName.substring(0, 31);
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return workbook;
}

/**
 * Download Excel file to browser
 */
function downloadExcelFile(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename);
}

/**
 * Main function: Generate attendance report for a cycle
 */
export async function generateAttendanceReport(cycleId: string): Promise<void> {
  console.log('Generating attendance report for cycle:', cycleId);

  try {
    // Step 1: Fetch cycle data
    console.log('Fetching cycle data...');
    const cycle = await fetchCycleData(cycleId);
    if (!cycle) {
      console.error('Failed to fetch cycle data. Aborting report generation.');
      return;
    }

    // Step 2: Fetch events
    console.log('Fetching events...');
    const events = await fetchCycleEvents(cycleId);
    if (events.length === 0) {
      console.error('No events found for this cycle. Aborting report generation.');
      return;
    }
    console.log(`Found ${events.length} events`);

    // Step 3: Fetch active pilots
    console.log('Fetching active pilots...');
    const pilots = await fetchActivePilots(cycle.startDate, cycle.endDate);
    if (pilots.length === 0) {
      console.error('No active pilots found for this cycle. Aborting report generation.');
      return;
    }
    console.log(`Found ${pilots.length} active pilots`);

    // Step 4: Fetch attendance data
    console.log('Fetching attendance data...');
    const attendanceRecords = await fetchAttendanceData(events);
    console.log(`Found ${attendanceRecords.length} attendance records`);

    // Step 5: Build pilot rows
    console.log('Building pilot attendance rows...');
    const pilotRows = buildPilotRows(pilots, events, attendanceRecords);

    // Step 6: Build qualification rows
    console.log('Building qualification rows...');
    const qualificationRows = buildQualificationRows(pilots, events, attendanceRecords);

    // Step 7: Build squadron rows
    console.log('Building squadron rows...');
    const squadronRows = buildSquadronRows(pilots, events, attendanceRecords);

    // Step 8: Generate Excel workbook
    console.log('Generating Excel workbook...');
    const sheetData: CycleSheetData = {
      cycle,
      events,
      pilots,
      pilotRows,
      qualificationRows,
      squadronRows
    };
    const workbook = generateExcelWorkbook(sheetData);

    // Step 9: Download file
    const filename = `Attendance_${cycle.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    console.log(`Downloading file: ${filename}`);
    downloadExcelFile(workbook, filename);

    console.log('✅ Attendance report generated successfully!');
  } catch (error) {
    console.error('❌ Error generating attendance report:', error);
  }
}

// Expose function to window for console testing
if (typeof window !== 'undefined') {
  (window as any).generateAttendanceReport = generateAttendanceReport;
}
