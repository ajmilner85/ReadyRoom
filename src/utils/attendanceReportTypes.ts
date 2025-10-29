/**
 * Type definitions for attendance report generation
 */

export interface CycleReportData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
}

export interface EventReportData {
  id: string;
  name: string;
  startDatetime: string;
  discordEventIds: Array<{
    messageId: string;
    guildId: string;
    channelId: string;
    squadronId: string;
  }>;
}

export interface PilotReportData {
  id: string;
  callsign: string;
  boardNumber: string;
  discordId?: string;
  qualifications: QualificationReportData[];
  squadronId?: string;
  squadronName?: string;
}

export interface QualificationReportData {
  id: string;
  name: string;
  order: number;
}

export interface AttendanceRecord {
  pilotId: string;
  eventId: string;
  rollCallResponse: 'Present' | 'Absent' | 'Tentative' | null;
}

export interface PilotAttendanceRow {
  pilotId: string;
  boardNumber: string;
  callsign: string;
  displayName: string; // "744 - Nubs" format
  attendance: Record<string, AttendanceMarker>; // eventId -> marker
}

export type AttendanceMarker = 'X' | '?' | '';

export interface QualificationAttendanceRow {
  qualificationName: string;
  qualificationOrder: number;
  attendance: Record<string, number>; // eventId -> count of unique pilots
}

export interface SquadronAttendanceRow {
  squadronName: string;
  attendance: Record<string, number>; // eventId -> count of unique pilots
}

export interface CycleSheetData {
  cycle: CycleReportData;
  events: EventReportData[];
  pilots: PilotReportData[];
  pilotRows: PilotAttendanceRow[];
  qualificationRows: QualificationAttendanceRow[];
  squadronRows: SquadronAttendanceRow[];
}
