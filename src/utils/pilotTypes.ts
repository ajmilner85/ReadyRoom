import type { Database } from '../types/supabase';

// Base type from database
type PilotBase = Database['public']['Tables']['pilots']['Row'];
type PilotRoleRow = Database['public']['Tables']['pilot_roles']['Row'];
type RoleRow = Database['public']['Tables']['roles']['Row'];

// Extended role assignment type for joins
export interface PilotRoleAssignment extends PilotRoleRow {
  role: RoleRow | null;
}

// Extended Pilot type with runtime properties
export interface Pilot extends PilotBase {
  // Custom property for role name added at runtime
  role?: string;
  // Include the roles property from join queries - array of role assignments
  roles?: PilotRoleAssignment[] | null;
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
