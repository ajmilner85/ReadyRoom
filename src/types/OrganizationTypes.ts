// TypeScript interfaces for organizational hierarchy

export interface Command {
  id: string;
  name: string;
  established_date: string | null;
  deactivated_date: string | null;
  created_at: string;
  updated_at: string | null;
  insignia_url: string | null;
}

export interface Group {
  id: string;
  command_id: string;
  name: string;
  established_date: string | null;
  deactivated_date: string | null;
  created_at: string;
  updated_at: string | null;
  insignia_url: string | null;
  // Populated via join
  command?: Command;
}

export interface Wing {
  id: string;
  group_id: string | null;
  name: string;
  established_date: string | null;
  deactivated_date: string | null;
  designation: string | null;
  insignia_url: string | null;
  carrier_id: string | null;
  tail_code: string | null;
  created_at: string | null;
  // Populated via join
  group?: Group;
}

export interface Squadron {
  id: string;
  wing_id: string;
  name: string;
  established_date: string | null;
  deactivated_date: string | null;
  designation: string;
  insignia_url: string | null;
  carrier_id: string | null;
  tail_code: string | null;
  callsigns: any | null; // JSONB field
  updated_at: string | null;
  // Populated via join
  wing?: Wing;
}

// Helper types for creating new entities
export type NewCommand = Omit<Command, 'id' | 'created_at' | 'updated_at'>;
export type NewGroup = Omit<Group, 'id' | 'created_at' | 'updated_at' | 'command'>;
export type NewWing = Omit<Wing, 'id' | 'created_at' | 'group'>;
export type NewSquadron = Omit<Squadron, 'id' | 'updated_at' | 'wing'>;

// Helper types for updating entities
export type UpdateCommand = Partial<NewCommand>;
export type UpdateGroup = Partial<NewGroup>;
export type UpdateWing = Partial<NewWing>;
export type UpdateSquadron = Partial<NewSquadron>;

// Organizational hierarchy level types
export type OrgLevel = 'command' | 'group' | 'wing' | 'squadron';

// Entity union type for generic operations
export type OrgEntity = Command | Group | Wing | Squadron;