/**
 * Type definitions for the Reports page
 */

export interface CycleData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  type: string;
}

export interface EventData {
  id: string;
  name: string;
  start_datetime: string;
  cycle_id: string | null;
  discord_event_id: Array<{
    messageId: string;
    guildId: string;
    channelId: string;
    squadronId: string;
  }>;
}

export interface AttendanceData {
  pilotId: string;
  eventId: string;
  rollCallResponse: 'Present' | 'Absent' | 'Tentative' | null;
}

export interface PilotData {
  id: string;
  callsign: string;
  boardNumber: string;
  discord_id: string | null;
  squadronId?: string;
  squadronName?: string;
}

export interface SquadronData {
  id: string;
  name: string;
}

/**
 * Processed data for line chart display
 */
export interface ChartDataPoint {
  eventName: string;
  eventDate: string;
  attendanceCount: number;
  totalPilots: number;
  attendancePercentage: number;
  noShowCount: number;
  lastMinuteSniveCount: number;
}

/**
 * Filter options for the report
 */
export interface ReportFilters {
  squadronIds: string[];
  pilotIds: string[];
}

/**
 * Complete dataset for Cycle Attendance Report
 */
export interface CycleAttendanceReportData {
  cycle: CycleData;
  events: EventData[];
  chartData: ChartDataPoint[];
  squadrons: SquadronData[];
  pilots: PilotData[];
}
