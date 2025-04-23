import type { Database } from '../types/supabase';

// Base type from database
type PilotBase = Database['public']['Tables']['pilots']['Row'];

// Extended Pilot type with runtime properties
export interface Pilot extends PilotBase {
  // Custom property for role name added at runtime
  role?: string;
  // Include the roles property from join queries
  roles?: {
    id: string;
    name: string;
  } | null;
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
