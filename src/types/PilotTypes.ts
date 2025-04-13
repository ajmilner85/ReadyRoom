export type QualificationType = 
  | 'Strike Lead' 
  | 'Instructor Pilot' 
  | 'LSO' 
  | 'Flight Lead'  // Formerly '4-Ship'
  | 'Section Lead' // Formerly '2-Ship'
  | 'CQ' 
  | 'Night CQ'
  | 'Wingman';  // Added Wingman as a valid qualification type

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

// Legacy Pilot interface
export interface Pilot {
  id: string;
  callsign: string;
  boardNumber: string;
  status: PilotStatus;
  status_id?: string; // Added to support new status system
  billet: string;
  qualifications: Qualification[];
  discordUsername: string;
  role?: string; // Added role field to display in the UI
}

// Supabase Pilot interface - matches our database schema
export interface SupabasePilot {
  id: string;
  callsign: string;
  boardNumber: number;
  discordId?: string;
  discord_original_id?: string;
  qualifications: string[];
  roles: PilotRole;
  created_at?: string;
  updated_at?: string;
  status_id?: string; // Foreign key to statuses table
  primary_role_id?: string; // Foreign key to roles table
  role_name?: string; // Added to store the role name from the join
  role?: string; // Added for runtime property set in pilotService.ts
}

// Convert legacy pilot format to Supabase format
export function convertLegacyPilotToSupabase(pilot: Pilot): Omit<SupabasePilot, 'created_at' | 'updated_at'> {
  return {
    id: pilot.id,
    callsign: pilot.callsign,
    boardNumber: parseInt(pilot.boardNumber),
    discordId: pilot.discordUsername,
    discord_original_id: pilot.id,
    qualifications: pilot.qualifications.map(q => q.type),
    roles: {
      squadron: pilot.billet,
      site: [],
      discord: []
    },
    status_id: pilot.status_id // Include status_id if available
  };
}

// Convert Supabase pilot format to legacy format (for backwards compatibility)
export function convertSupabasePilotToLegacy(pilot: SupabasePilot): Pilot {
  return {
    id: pilot.id, // Always use the database UUID as the ID
    callsign: pilot.callsign,
    boardNumber: pilot.boardNumber.toString(),
    status: 'Provisional', // Default, should be updated with actual value
    status_id: pilot.status_id, // Include status_id if available
    billet: pilot.roles?.squadron || '',
    qualifications: (pilot.qualifications || []).map((q, index) => ({
      id: `${pilot.id}-${index}`,
      type: q as QualificationType,
      dateAchieved: new Date().toISOString().split('T')[0]
    })),
    discordUsername: pilot.discordId || '', // Use discordId (username) for display
    role: pilot.role_name || pilot.role // Check for both role_name and role properties
  };
}