// Mission Debriefing Feature - Type Definitions
// Phase 1 MVP types for After-Action Report (AAR) system

// ============================================================================
// Enums and Status Types
// ============================================================================

export type MissionOutcome = 'pending' | 'success' | 'partial_success' | 'failure';
export type DebriefStatus = 'in_progress' | 'submitted' | 'finalized';
export type FlightStatus = 'scheduled' | 'launched' | 'scrubbed';
export type PilotMissionStatus = 'recovered' | 'damaged' | 'missing_in_action' | 'killed_in_action';
export type PerformanceRating = 'SAT' | 'UNSAT';
export type ReminderType = 'first_reminder' | 'second_reminder';

// ============================================================================
// Performance Rating Categories
// ============================================================================

export type PerformanceCategoryKey =
  | 'mission_planning'
  | 'flight_discipline'
  | 'formation_navigation'
  | 'tactical_execution'
  | 'situational_awareness'
  | 'weapons_employment'
  | 'survivability_safety'
  | 'debrief_participation';

export interface PerformanceCategoryRating {
  rating: PerformanceRating;
  comments?: string;
}

// Database storage format for performance ratings (JSON)
export type PerformanceRatings = Record<PerformanceCategoryKey, PerformanceCategoryRating>;

// Form state type for performance ratings (simpler, just boolean | null for SAT/UNSAT)
export type PerformanceRatingsFormState = Record<PerformanceCategoryKey, boolean | null>;

// ============================================================================
// Core Database Types
// ============================================================================

export interface MissionDebriefing {
  id: string;
  mission_id: string;
  mission_outcome?: MissionOutcome | null;
  status: DebriefStatus;

  // Mission objectives (Phase 2+ feature)
  mission_objectives?: MissionObjective[] | null;

  // Tacview recording (skeleton for R2 integration)
  tacview_file_url?: string | null;
  tacview_uploaded_by?: string | null;
  tacview_uploaded_at?: string | null;

  // Finalization
  finalized_by?: string | null;
  finalized_at?: string | null;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface FlightDebrief {
  id: string;
  mission_debriefing_id: string;

  // Flight identification
  flight_id: string;
  callsign: string;
  squadron_id: string;

  // Flight lead
  flight_lead_pilot_id: string;
  submitted_by_user_id?: string | null;
  submitted_at?: string | null;

  // Status
  flight_status: FlightStatus;
  status: DebriefStatus;

  // Performance ratings
  performance_ratings: PerformanceRatings;

  // Comments
  key_lessons_learned?: string | null;

  // Audit
  created_at: string;
  updated_at: string;
}

export interface PilotKill {
  id: string;
  flight_debrief_id: string;
  pilot_id: string;
  mission_id: string;

  // Status
  pilot_mission_status: PilotMissionStatus;

  // Kill counts (Phase 1: simple counts)
  air_to_air_kills: number;
  air_to_ground_kills: number;

  // Audit
  created_at: string;
  updated_at: string;
}

export interface DebriefDelegation {
  id: string;
  flight_debrief_id: string;

  // Delegation
  original_flight_lead_id: string;
  delegated_to_user_id: string;
  delegated_by_user_id: string;

  reason?: string | null;

  // Audit
  created_at: string;
}

export interface AARReminder {
  id: string;
  mission_id: string;
  flight_debrief_id?: string | null;
  squadron_id: string;

  // Reminder config
  reminder_type: ReminderType;
  scheduled_for: string;
  sent_at?: string | null;

  // Recipients
  recipients: ReminderRecipient[];
  additional_recipients?: LeadershipRecipient[] | null;

  // Discord tracking
  message_id?: string | null;

  // Audit
  created_at: string;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface MissionObjective {
  id: string;
  description: string;
  priority: 'primary' | 'secondary';
  status: 'success' | 'failure' | 'partial';
  notes?: string;
  assessed_by?: string;
}

export interface ReminderRecipient {
  pilot_id: string;
  user_id: string;
  discord_id?: string;
  flight_callsign: string;
}

export interface LeadershipRecipient {
  user_id: string;
  discord_id?: string;
  role: 'CO' | 'XO' | 'Operations Officer';
}

// ============================================================================
// UI/Display Types
// ============================================================================

export interface FlightDebriefWithDetails extends FlightDebrief {
  mission_debriefing?: MissionDebriefing;
  flight_lead?: {
    id: string;
    board_number: string;
    callsign: string;
    pilot_name: string;
  };
  submitted_by?: {
    id: string;
    username: string;
  };
  squadron?: {
    id: string;
    name: string;
    wing_id?: string;
  };
  pilot_kills?: PilotKill[];
  delegation_history?: DebriefDelegation[];
}

export interface MissionDebriefingWithFlights extends MissionDebriefing {
  mission?: {
    id: string;
    name: string;
    event_id: string;
    start_time: string;
    end_time?: string;
  };
  flight_debriefs?: FlightDebriefWithDetails[];
  finalized_by_user?: {
    id: string;
    username: string;
  };
}

export interface PilotKillWithPilot extends PilotKill {
  pilot?: {
    id: string;
    board_number: string;
    callsign: string;
    pilot_name: string;
  };
}

// ============================================================================
// Form/Input Types
// ============================================================================

export interface FlightDebriefFormData {
  flight_id: string;
  callsign: string;
  squadron_id: string;
  flight_lead_pilot_id: string;
  flight_status: FlightStatus;
  performance_ratings: Partial<PerformanceRatings>;
  key_lessons_learned?: string;
  pilot_kills: PilotKillFormData[];
}

export interface PilotKillFormData {
  pilot_id: string;
  pilot_mission_status: PilotMissionStatus;
  air_to_air_kills: number;
  air_to_ground_kills: number;
}

export interface DelegationFormData {
  flight_debrief_id: string;
  delegated_to_user_id: string;
  reason?: string;
}

// ============================================================================
// Aggregate/Analytics Types
// ============================================================================

export interface PerformanceStatistics {
  category: PerformanceCategoryKey;
  sat_count: number;
  unsat_count: number;
  sat_percentage: number;
}

export interface SquadronPerformanceSummary {
  squadron_id: string;
  squadron_name: string;
  total_flights: number;
  flights_submitted: number;
  overall_sat_percentage: number;
  category_stats: PerformanceStatistics[];
  total_a2a_kills: number;
  total_a2g_kills: number;
}

export interface WingPerformanceSummary {
  wing_id: string;
  wing_name: string;
  total_flights: number;
  flights_submitted: number;
  overall_sat_percentage: number;
  squadron_summaries: SquadronPerformanceSummary[];
  total_a2a_kills: number;
  total_a2g_kills: number;
}

export interface TopPerformer {
  pilot_id: string;
  board_number: string;
  callsign: string;
  pilot_name: string;
  squadron_name: string;
  flight_callsign: string;
  sat_percentage: number;
  a2a_kills: number;
  a2g_kills: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateMissionDebriefingRequest {
  mission_id: string;
}

export interface CreateFlightDebriefRequest extends FlightDebriefFormData {
  mission_debriefing_id: string;
}

export interface UpdateFlightDebriefRequest extends Partial<FlightDebriefFormData> {
  id: string;
}

export interface FinalizeFlightDebriefRequest {
  id: string;
}

export interface SetMissionOutcomeRequest {
  mission_debrief_id: string;
  outcome: MissionOutcome;
}

export interface SetFlightStatusRequest {
  flight_debrief_id: string;
  status: FlightStatus;
}

export interface CreateDelegationRequest extends DelegationFormData {}

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface DebriefingListFilters {
  squadron_id?: string;
  wing_id?: string;
  date_from?: string;
  date_to?: string;
  mission_outcome?: MissionOutcome[];
  debrief_status?: DebriefStatus[];
  search_query?: string;
}

export interface AggregateDataQuery {
  squadron_id?: string;
  wing_id?: string;
  date_from: string;
  date_to: string;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface DebriefValidationResult {
  is_valid: boolean;
  errors: DebriefValidationError[];
  warnings: DebriefValidationWarning[];
}

export interface DebriefValidationError {
  field: string;
  message: string;
}

export interface DebriefValidationWarning {
  field: string;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

export const PERFORMANCE_CATEGORIES: Record<PerformanceCategoryKey, string> = {
  mission_planning: 'Mission Planning & Brief Execution',
  flight_discipline: 'Flight Discipline & Communication',
  formation_navigation: 'Formation & Navigation',
  tactical_execution: 'Tactical Execution',
  situational_awareness: 'Situational Awareness',
  weapons_employment: 'Weapons Employment',
  survivability_safety: 'Survivability & Safety',
  debrief_participation: 'Debrief Participation'
};

export const MISSION_OUTCOME_LABELS: Record<MissionOutcome, string> = {
  pending: 'Pending',
  success: 'Success',
  partial_success: 'Partial Success',
  failure: 'Failure'
};

export const DEBRIEF_STATUS_LABELS: Record<DebriefStatus, string> = {
  in_progress: 'In Progress',
  submitted: 'Submitted',
  finalized: 'Finalized'
};

export const FLIGHT_STATUS_LABELS: Record<FlightStatus, string> = {
  scheduled: 'Scheduled',
  launched: 'Launched',
  scrubbed: 'Scrubbed'
};

export const PILOT_MISSION_STATUS_LABELS: Record<PilotMissionStatus, string> = {
  recovered: 'Recovered',
  damaged: 'Damaged',
  missing_in_action: 'Missing In Action',
  killed_in_action: 'Killed In Action'
};

export const PERFORMANCE_RATING_LABELS: Record<PerformanceRating, string> = {
  SAT: 'Satisfactory',
  UNSAT: 'Unsatisfactory'
};
