import type { Database } from '../types/supabase';

// Base type from database
type PilotBase = Database['public']['Tables']['pilots']['Row'];
type PilotRoleRow = Database['public']['Tables']['pilot_roles']['Row'];
type RoleRow = Database['public']['Tables']['roles']['Row'];

// Extended role assignment type for joins
export interface PilotRoleAssignment extends PilotRoleRow {
  role?: RoleRow | null;  // Optional for backward compatibility
  roles?: RoleRow | null; // SQL join alias (roles:role_id)
}

// Extended Pilot type with runtime properties
export interface Pilot extends PilotBase {
  // Custom property for role name added at runtime
  role?: string;
  // Include the roles property from join queries - array of role assignments
  roles?: PilotRoleAssignment[] | null;
  // New fields for current status and standing (populated from join tables)
  currentStatus?: {
    id: string;
    name: string;
    isActive: boolean;
    order: number;
  } | null;
  currentStanding?: {
    id: string;
    name: string;
    order: number;
  } | null;
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
    color_palette?: any;
    discord_integration?: any;
    updated_at?: string | null;
  } | null;
  squadronAssignment?: {
    id: string;
    pilot_id: string;
    squadron_id: string | null;
    start_date: string;
    end_date?: string;
    created_at: string;
    updated_at?: string;
  };
  // Additional fields for compatibility
  standing_id?: string;
  status?: string; // Legacy status field for backward compatibility - optional
}

export type NewPilot = Database['public']['Tables']['pilots']['Insert'];
export type UpdatePilot = Database['public']['Tables']['pilots']['Update'];

// Role type with non-null created_at
export interface Role {
  id: string;
  name: string;
  isExclusive: boolean;
  compatible_statuses: string[];
  order: number;
  created_at: string;
}
