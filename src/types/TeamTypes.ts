// Team Types
// Defines types for the Teams feature which allows permission assignment based on team membership

export type TeamScope = 'global' | 'wing' | 'squadron';

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  scope: TeamScope;
  scope_id?: string | null;  // References org_wings.id or org_squadrons.id
  active: boolean;
  created_at: string;
  updated_at?: string | null;
  created_by?: string | null;
}

export interface NewTeam {
  name: string;
  description?: string | null;
  scope: TeamScope;
  scope_id?: string | null;
  active?: boolean;
}

export interface PilotTeam {
  id: string;
  pilot_id: string;
  team_id: string;
  team?: Team;  // Populated when joining with teams table
  start_date: string;
  end_date?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface NewPilotTeam {
  pilot_id: string;
  team_id: string;
  start_date?: string;  // Defaults to current date if not provided
  end_date?: string | null;
}

// Response types for service operations
export interface TeamResponse {
  data?: Team | null;
  error?: Error | null;
}

export interface TeamsResponse {
  data?: Team[] | null;
  error?: Error | null;
}

export interface PilotTeamResponse {
  data?: PilotTeam | null;
  error?: Error | null;
}

export interface PilotTeamsResponse {
  data?: PilotTeam[] | null;
  error?: Error | null;
}

// UI-specific types
export interface TeamWithMemberCount extends Team {
  memberCount?: number;
}

export interface PilotWithTeams {
  pilot_id: string;
  teams: PilotTeam[];
}
