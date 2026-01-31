import type { Event } from './EventTypes';
import type { AssignedPilotsRecord } from './MissionPrepTypes';
import type { MissionCommanderInfo } from './MissionCommanderTypes';

export type MissionStatus = 'planning' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
export type FlightImportFilter = 'all' | 'wing_only' | 'selected_only';

// Individual flight configuration from .miz file
export interface MissionFlight {
  id: string;
  callsign: string;
  squadron_id?: string;
  aircraft_type: string;
  slots: number;
  // Store full flight data from the .miz extraction
  flight_data: {
    units?: any[];
    route?: any;
    frequency?: number;
    modulation?: number;
    [key: string]: any;
  };
}

// Pilot assignment with MIDS channels
export interface PilotAssignment {
  pilot_id: string;
  flight_id: string;
  slot_number: number;
  dash_number: string;
  mids_a_channel?: string;
  mids_b_channel?: string;
  assigned_by?: string;
  assigned_at?: string;
  roll_call_status?: 'Present' | 'Absent' | 'Tentative' | null;
}

// Support role assignment (mission commander, etc.)
export interface SupportRoleAssignment {
  role_type: string;
  pilot_id: string;
  assigned_by?: string;
  assigned_at?: string;
}

// Support role card definition (carrier, command control)
export interface SupportRoleCard {
  id: string;
  callsign: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  creationOrder: number;
  carrier?: {
    hull?: string;
    name?: string;
    carrierId?: string;
  };
  slots?: Array<{
    type: string;
    name: string;
    id: string;
  }>;
}

// Combined structure for support_role_assignments JSONB column
export interface SupportRoleData {
  assignments: SupportRoleAssignment[];
  cards: SupportRoleCard[];
}

// Mission settings and configuration
export interface MissionSettings {
  auto_assign_enabled?: boolean;
  cross_squadron_assignments_allowed?: boolean;
  [key: string]: any;
}

// Complete mission interface
export interface Mission {
  id: string;
  event_id?: string;
  name: string;
  description?: string;
  status: MissionStatus;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  step_time?: string; // UTC timestamp for step time

  // Planning configuration
  selected_squadrons: string[];
  flight_import_filter: FlightImportFilter;

  // Mission data
  miz_file_data: {
    processed_at?: string;
    file_name?: string;
    [key: string]: any;
  };
  flights: MissionFlight[];
  pilot_assignments: Record<string, PilotAssignment[]>; // Keyed by flight_id
  support_role_assignments: SupportRoleData; // Combined: pilot assignments + card definitions
  mission_settings: MissionSettings;

  // Optional linked event data (populated when joining with events table)
  event?: Event;
}

// Mission creation/update payload
export interface CreateMissionRequest {
  event_id?: string;
  name: string;
  description?: string;
  selected_squadrons?: string[];
  flight_import_filter?: FlightImportFilter;
}

export interface UpdateMissionRequest extends Partial<CreateMissionRequest> {
  status?: MissionStatus;
  flights?: MissionFlight[];
  pilot_assignments?: Record<string, PilotAssignment[]>;
  support_role_assignments?: SupportRoleData;
  mission_settings?: MissionSettings;
  step_time?: string; // UTC timestamp for step time
}

// Mission state for frontend components (maps to current localStorage structure)
export interface MissionState {
  mission?: Mission;
  assignedPilots: AssignedPilotsRecord;
  missionCommander?: MissionCommanderInfo | null;
  extractedFlights?: any[];
  prepFlights?: any[];
}

// API response types
export interface MissionResponse {
  mission: Mission;
  error?: string;
}

export interface MissionsListResponse {
  missions: Mission[];
  total: number;
  error?: string;
}