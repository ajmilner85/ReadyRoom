/**
 * Type definitions for the Reports page
 */

export interface CycleData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  type: string;
  participants?: any;
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
  qualificationIds?: string[];
}

export interface SquadronData {
  id: string;
  name: string;
  designation: string;
  insignia_url?: string | null;
  color_palette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  } | null;
}

export interface QualificationData {
  id: string;
  name: string;
  code: string;
  color?: string | null;
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
  advancedSniveCount: number;
  totalSnivelsCount: number;
  noResponseCount: number;
}

/**
 * Squadron-specific metrics for a single event
 */
export interface SquadronMetrics {
  squadronId: string;
  attendanceCount: number;
  noShowCount: number;
  lastMinuteSniveCount: number;
  advancedSniveCount: number;
  totalSnivelsCount: number;
  noResponseCount: number;
  totalPilots: number;
  attendancePercentage: number;
}

/**
 * Metrics grouped by squadron for all events
 */
export interface EventSquadronMetrics {
  eventId: string;
  eventName: string;
  eventDate: string;
  squadronMetrics: SquadronMetrics[];
}

/**
 * Filter options for the report
 */
export interface ReportFilters {
  squadronIds: string[];
  qualificationIds: string[];
  showAttendancePercent: boolean;
  showAttendanceCount: boolean;
  showNoShowsPercent: boolean;
  showNoShowsCount: boolean;
  showSnivelsPercent: boolean;
  showSnivelsCount: boolean;
  showAdvancedSnivelsPercent: boolean;
  showAdvancedSnivelsCount: boolean;
  showTotalSnivelsPercent: boolean;
  showTotalSnivelsCount: boolean;
  showNoResponsePercent: boolean;
  showNoResponseCount: boolean;
  attendanceTrendLine: 'disabled' | 'linear' | 'moving-average';
  noShowsTrendLine: 'disabled' | 'linear' | 'moving-average';
  snivelsTrendLine: 'disabled' | 'linear' | 'moving-average';
  advancedSnivelsTrendLine: 'disabled' | 'linear' | 'moving-average';
  totalSnivelsTrendLine: 'disabled' | 'linear' | 'moving-average';
  noResponseTrendLine: 'disabled' | 'linear' | 'moving-average';
}

/**
 * Complete dataset for Cycle Attendance Report
 */
export interface CycleAttendanceReportData {
  cycle: CycleData;
  events: EventData[];
  chartData: ChartDataPoint[];
  eventSquadronMetrics: EventSquadronMetrics[];
  squadrons: SquadronData[];
  qualifications: QualificationData[];
  pilots: PilotData[];
}
