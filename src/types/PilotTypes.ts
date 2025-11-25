export type QualificationType = 
  | 'Strike Lead' 
  | 'Instructor Pilot' 
  | 'LSO' 
  | 'Flight Lead'  // Formerly '4-Ship'
  | 'Section Lead' // Formerly '2-Ship'
  | 'CQ' 
  | 'Night CQ'
  | 'Wingman'  // Added Wingman as a valid qualification type
  // Added missing types based on usage in AvailablePilots.tsx
  | 'FAC(A)'
  | 'TL'
  | '4FL'
  | '2FL'
  | 'WQ'
  | 'T/O'
  | 'NATOPS'
  | 'DFL'
  | 'DTL'
  | 'JTAC';

// Legacy status type - maintained for compatibility
export type PilotStatus = 'Command' | 'Staff' | 'Cadre' | 'Provisional' | 'Inactive' | 'Retired' | 'On Leave' | 'AWOL';

export interface PilotRole {
  site?: string[];
  discord?: string[];
  squadron?: string;
}

export interface Qualification {
  id: string;
  type: QualificationType;
  dateAchieved: string;
}

// Interface for pilot role assignments from the join table
export interface PilotRoleAssignment {
  id: string;
  pilot_id: string;
  role_id: string | null;
  effective_date: string;
  is_acting: boolean;
  end_date: string | null;
  created_at: string;
  updated_at: string | null;
  role?: {
    id: string;
    name: string;
    exclusivity_scope: 'none' | 'squadron' | 'wing';
    order: number;
  };
  roles?: {  // Alias from SQL join (roles:role_id)
    id: string;
    name: string;
    exclusivity_scope: 'none' | 'squadron' | 'wing';
    order: number;
  } | null;
}

// Pilot interface with standardized identifiers
export interface Pilot {
  id: string;                 // Primary identifier - Supabase UUID
  discord_username?: string;  // Discord username (e.g., "hoover_bb") - for display only
  discord_id?: string;        // Numeric Discord ID (e.g., "413851905555431442") - primary identifier for Discord API
  callsign: string;
  boardNumber: string;        // Not a unique identifier, just a display property
  status: PilotStatus;
  status_id?: string;         // Foreign key to statuses table
  standing_id?: string;       // Foreign key to standings table (through pilot_standings join)
  billet: string;
  qualifications: Qualification[];
  discordUsername: string;
  // Removed role field - UI should get role from roles array only
  roles?: PilotRoleAssignment[]; // Array of role assignments from join table (single role per pilot)
  // Add attendance statuses
  attendanceStatus?: 'accepted' | 'tentative' | 'declined'; // From Discord event response - ADDED 'declined'
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; // From Roll Call UI
  // New fields for current status and standing (populated from join tables)
  currentStatus?: {
    id: string;
    name: string;
    isActive: boolean;
    order: number;
  };
  currentStanding?: {
    id: string;
    name: string;
    order: number;
  };
  // Squadron assignment information
  currentSquadron?: {
    id: string;
    name: string;
    designation: string;
    wing_id: string;
    tail_code?: string | null;
    established_date?: string | null;
    deactivated_date?: string | null;
    insignia_url?: string | null;
    carrier_id?: string | null;
    callsigns?: any;
    updated_at?: string | null;
  };
  squadronAssignment?: {
    id: string;
    pilot_id: string;
    squadron_id: string | null;
    start_date: string;
    end_date: string | null;
    created_at: string;
    updated_at: string | null;
    org_squadrons?: {
      id: string;
      name: string;
      designation: string;
      wing_id: string | null;
      tail_code: string | null;
      established_date: string | null;
      deactivated_date: string | null;
      insignia_url: string | null;
      carrier_id: string | null;
      callsigns: any;
      color_palette: any;
      discord_integration: any;
      updated_at: string | null;
    } | null;
  };
}

// Supabase Pilot interface - matches our database schema
export interface SupabasePilot {
  id: string;
  callsign: string;
  boardNumber: number;
  discord_username?: string;
  discord_id?: string;
  qualifications: string[];
  roles: PilotRole;
  created_at?: string;
  updated_at?: string;
  status_id?: string; // Foreign key to statuses table
  role_name?: string; // Added to store the role name from the join
  role?: string; // Added for runtime property set in pilotService.ts
}

/**
 * @deprecated This function is deprecated and should not be used for new development.
 * All new pilot entries should be created directly using the Supabase schema format.
 * Use pilotDataUtils.ts functions instead for working with pilot data.
 */
export function convertPilotToSupabase(pilot: Pilot): Omit<SupabasePilot, 'created_at' | 'updated_at'> {
  console.warn('convertPilotToSupabase is deprecated and should not be used for new code');
  return {
    id: pilot.id,
    callsign: pilot.callsign,
    boardNumber: parseInt(pilot.boardNumber),
    discord_username: pilot.discordUsername,
    discord_id: pilot.discord_id,
    qualifications: pilot.qualifications.map(q => q.type),
    roles: {
      squadron: pilot.billet,
      site: [],
      discord: []
    },
    status_id: pilot.status_id // Include status_id if available
  };
}

