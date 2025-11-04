import { supabase } from './supabaseClient';
import type {
  Team,
  NewTeam,
  TeamResponse,
  TeamsResponse,
  PilotTeam,
  PilotTeamResponse,
  PilotTeamsResponse,
  TeamScope
} from '../types/TeamTypes';

// ============================================================================
// TEAM CRUD OPERATIONS
// ============================================================================

/**
 * Get all teams, optionally filtered by scope
 */
export async function getAllTeams(
  scope?: TeamScope,
  scopeId?: string
): Promise<TeamsResponse> {
  try {
    let query = supabase
      .from('teams')
      .select('*')
      .order('name', { ascending: true });

    if (scope) {
      query = query.eq('scope', scope);
    }

    if (scopeId) {
      query = query.eq('scope_id', scopeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching teams:', error);
      return { data: null, error };
    }

    return { data: data as Team[], error: null };
  } catch (error: any) {
    console.error('Error in getAllTeams:', error);
    return { data: null, error };
  }
}

/**
 * Get a team by ID
 */
export async function getTeamById(teamId: string): Promise<TeamResponse> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error) {
      console.error('Error fetching team:', error);
      return { data: null, error };
    }

    return { data: data as Team, error: null };
  } catch (error: any) {
    console.error('Error in getTeamById:', error);
    return { data: null, error };
  }
}

/**
 * Create a new team
 */
export async function createTeam(team: NewTeam): Promise<TeamResponse> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        description: team.description || null,
        scope: team.scope,
        scope_id: team.scope_id || null,
        active: team.active !== undefined ? team.active : true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating team:', error);
      return { data: null, error };
    }

    return { data: data as Team, error: null };
  } catch (error: any) {
    console.error('Error in createTeam:', error);
    return { data: null, error };
  }
}

/**
 * Update an existing team
 */
export async function updateTeam(
  teamId: string,
  updates: Partial<NewTeam>
): Promise<TeamResponse> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.scope !== undefined) updateData.scope = updates.scope;
    if (updates.scope_id !== undefined) updateData.scope_id = updates.scope_id;
    if (updates.active !== undefined) updateData.active = updates.active;

    const { data, error } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      console.error('Error updating team:', error);
      return { data: null, error };
    }

    return { data: data as Team, error: null };
  } catch (error: any) {
    console.error('Error in updateTeam:', error);
    return { data: null, error };
  }
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId: string): Promise<{ success: boolean; error?: Error }> {
  try {
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      console.error('Error deleting team:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in deleteTeam:', error);
    return { success: false, error };
  }
}

// ============================================================================
// PILOT TEAM MEMBERSHIP OPERATIONS
// ============================================================================

/**
 * Get all team memberships for a pilot (active and historical)
 */
export async function getPilotTeams(pilotId: string): Promise<PilotTeamsResponse> {
  try {
    const { data, error } = await supabase
      .from('pilot_teams')
      .select(`
        *,
        team:team_id (
          id,
          name,
          description,
          scope,
          scope_id,
          active
        )
      `)
      .eq('pilot_id', pilotId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching pilot teams:', error);
      return { data: null, error };
    }

    return { data: data as any[], error: null };
  } catch (error: any) {
    console.error('Error in getPilotTeams:', error);
    return { data: null, error };
  }
}

/**
 * Get active team memberships for a pilot (end_date is NULL)
 */
export async function getActivePilotTeams(pilotId: string): Promise<PilotTeamsResponse> {
  try {
    const { data, error } = await supabase
      .from('pilot_teams')
      .select(`
        *,
        team:team_id (
          id,
          name,
          description,
          scope,
          scope_id,
          active
        )
      `)
      .eq('pilot_id', pilotId)
      .is('end_date', null)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching active pilot teams:', error);
      return { data: null, error };
    }

    return { data: data as any[], error: null };
  } catch (error: any) {
    console.error('Error in getActivePilotTeams:', error);
    return { data: null, error };
  }
}

/**
 * Batch load team memberships for multiple pilots
 */
export async function getBatchPilotTeams(
  pilotIds: string[]
): Promise<Record<string, PilotTeam[]>> {
  try {
    const { data, error } = await supabase
      .from('pilot_teams')
      .select(`
        *,
        team:team_id (
          id,
          name,
          description,
          scope,
          scope_id,
          active
        )
      `)
      .in('pilot_id', pilotIds)
      .is('end_date', null);

    if (error) {
      console.error('Error batch fetching pilot teams:', error);
      return {};
    }

    // Group by pilot_id
    const grouped: Record<string, PilotTeam[]> = {};

    if (data) {
      data.forEach((pt: any) => {
        if (!grouped[pt.pilot_id]) {
          grouped[pt.pilot_id] = [];
        }
        grouped[pt.pilot_id].push(pt as PilotTeam);
      });
    }

    return grouped;
  } catch (error: any) {
    console.error('Error in getBatchPilotTeams:', error);
    return {};
  }
}

/**
 * Assign a pilot to a team
 */
export async function assignPilotToTeam(
  pilotId: string,
  teamId: string,
  startDate?: Date
): Promise<PilotTeamResponse> {
  try {
    // Check if pilot already has an active membership to this team
    const { data: existing, error: checkError } = await supabase
      .from('pilot_teams')
      .select('id')
      .eq('pilot_id', pilotId)
      .eq('team_id', teamId)
      .is('end_date', null)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing team membership:', checkError);
      return { data: null, error: checkError };
    }

    if (existing) {
      return {
        data: null,
        error: new Error('Pilot is already a member of this team') as any
      };
    }

    const start = startDate
      ? startDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('pilot_teams')
      .insert({
        pilot_id: pilotId,
        team_id: teamId,
        start_date: start
      })
      .select(`
        *,
        team:team_id (
          id,
          name,
          description,
          scope,
          scope_id,
          active
        )
      `)
      .single();

    if (error) {
      console.error('Error assigning pilot to team:', error);
      return { data: null, error };
    }

    return { data: data as any, error: null };
  } catch (error: any) {
    console.error('Error in assignPilotToTeam:', error);
    return { data: null, error };
  }
}

/**
 * Remove a pilot from a team (ends the membership)
 */
export async function removePilotFromTeam(
  pilotTeamId: string
): Promise<{ success: boolean; error?: Error }> {
  try {
    const endDate = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('pilot_teams')
      .update({
        end_date: endDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', pilotTeamId);

    if (error) {
      console.error('Error removing pilot from team:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in removePilotFromTeam:', error);
    return { success: false, error };
  }
}

/**
 * Delete a pilot team membership record (hard delete)
 */
export async function deletePilotTeam(
  pilotTeamId: string
): Promise<{ success: boolean; error?: Error }> {
  try {
    const { error } = await supabase
      .from('pilot_teams')
      .delete()
      .eq('id', pilotTeamId);

    if (error) {
      console.error('Error deleting pilot team:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in deletePilotTeam:', error);
    return { success: false, error };
  }
}

/**
 * Get all members of a team
 */
export async function getTeamMembers(teamId: string): Promise<PilotTeamsResponse> {
  try {
    const { data, error } = await supabase
      .from('pilot_teams')
      .select(`
        *,
        pilot:pilot_id (
          id,
          callsign,
          boardNumber
        )
      `)
      .eq('team_id', teamId)
      .is('end_date', null)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching team members:', error);
      return { data: null, error };
    }

    return { data: data as any[], error: null };
  } catch (error: any) {
    console.error('Error in getTeamMembers:', error);
    return { data: null, error };
  }
}
