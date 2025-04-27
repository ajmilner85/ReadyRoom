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
  | 'DTL';

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

// Pilot interface with standardized identifiers
export interface Pilot {
  id: string;                 // Primary identifier - Supabase UUID
  discordId?: string;         // Discord user ID (previously stored in id)
  callsign: string;
  boardNumber: string;        // Not a unique identifier, just a display property
  status: PilotStatus;
  status_id?: string;         // Foreign key to statuses table
  billet: string;
  qualifications: Qualification[];
  discordUsername: string;
  role?: string;              // Role name for display in the UI
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
    discordId: pilot.discordUsername,
    discord_original_id: pilot.discordId, // Use the standardized discordId property
    qualifications: pilot.qualifications.map(q => q.type),
    roles: {
      squadron: pilot.billet,
      site: [],
      discord: []
    },
    status_id: pilot.status_id // Include status_id if available
  };
}

/**
 * @deprecated This function is deprecated and should not be used for new development.
 * Your application should work directly with SupabasePilot objects.
 * Use pilotDataUtils.ts functions instead for working with pilot data.
 */
export function convertSupabasePilotToLegacy(pilot: SupabasePilot): Pilot {
  console.warn('convertSupabasePilotToLegacy is deprecated - use pilotDataUtils.ts instead');
  return {
    id: pilot.id,                        // Use Supabase UUID as the primary ID
    discordId: pilot.discord_original_id, // Store Discord ID in dedicated field
    callsign: pilot.callsign,
    boardNumber: pilot.boardNumber.toString(),
    status: 'Provisional',               // Default, should be updated with actual value
    status_id: pilot.status_id,          // Include status_id if available
    billet: pilot.roles?.squadron || '',
    qualifications: (pilot.qualifications || []).map((q, index) => ({
      id: `${pilot.id}-${index}`,
      type: q as QualificationType,
      dateAchieved: new Date().toISOString().split('T')[0]
    })),
    discordUsername: pilot.discordId || '', // Use discordId (username) for display
    role: pilot.role_name || pilot.role   // Check for both role_name and role properties
  };
}