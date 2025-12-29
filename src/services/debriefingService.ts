import { supabase } from '../utils/supabaseClient';
import type {
  MissionDebriefing,
  FlightDebrief,
  DebriefDelegation
} from '../types/DebriefingTypes';

/**
 * Service for managing mission debriefings
 */
class DebriefingService {
  /**
   * Create a new mission debriefing record
   */
  async createMissionDebrief(missionId: string): Promise<MissionDebriefing> {
    const { data, error } = await supabase
      .from('mission_debriefings')
      .insert({
        mission_id: missionId,
        mission_outcome: 'pending',  // Default outcome is pending
        status: 'in_progress'  // Debriefing is in progress (not yet submitted/finalized)
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create mission debrief: ${error.message}`);
    }

    return data as MissionDebriefing;
  }

  /**
   * Get debriefing by mission ID
   */
  async getDebriefByMissionId(missionId: string): Promise<MissionDebriefing | null> {
    console.log('[DEBRIEF] Fetching debrief for mission:', missionId);

    const { data, error } = await supabase
      .from('mission_debriefings')
      .select('*')
      .eq('mission_id', missionId)
      .single();

    if (error) {
      console.log('[DEBRIEF] Query error:', { code: error.code, message: error.message, details: error.details, hint: error.hint });
      if (error.code === 'PGRST116') {
        // No rows returned - debrief doesn't exist yet
        console.log('[DEBRIEF] No existing debrief found');
        return null;
      }
      throw new Error(`Failed to get debrief: ${error.message}`);
    }

    console.log('[DEBRIEF] Found existing debrief:', data);
    return data as MissionDebriefing;
  }

  /**
   * Get or create debriefing for a mission
   */
  async getOrCreateDebrief(missionId: string): Promise<MissionDebriefing> {
    const existing = await this.getDebriefByMissionId(missionId);
    if (existing) {
      return existing;
    }
    return await this.createMissionDebrief(missionId);
  }

  /**
   * Update mission outcome
   */
  async updateMissionOutcome(
    missionDebriefId: string,
    outcome: 'pending' | 'success' | 'partial_success' | 'failure'
  ): Promise<MissionDebriefing> {
    const { data, error } = await supabase
      .from('mission_debriefings')
      .update({ mission_outcome: outcome })
      .eq('id', missionDebriefId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update mission outcome: ${error.message}`);
    }

    return data as MissionDebriefing;
  }

  /**
   * Get all flight debriefs for a mission
   */
  async getFlightDebriefsByMission(missionDebriefId: string): Promise<FlightDebrief[]> {
    const { data, error } = await supabase
      .from('flight_debriefs')
      .select(`
        *,
        submitted_by_pilot:pilots!flight_debriefs_submitted_by_fkey(
          id,
          callsign,
          board_number
        )
      `)
      .eq('mission_debrief_id', missionDebriefId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get flight debriefs: ${error.message}`);
    }

    return data as unknown as FlightDebrief[];
  }

  /**
   * Create a flight debrief (with automatic upsert if duplicate exists)
   */
  async createFlightDebrief(data: any): Promise<FlightDebrief> {
    // Check if a debrief already exists for this mission/flight combination
    const { data: existing, error: checkError } = await supabase
      .from('flight_debriefs')
      .select('id')
      .eq('mission_debriefing_id', data.mission_debriefing_id)
      .eq('flight_id', data.flight_id)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking for existing debrief:', checkError);
    }

    // If debrief already exists, update it instead of creating a new one
    if (existing) {
      console.log('Flight debrief already exists, updating instead:', existing.id);
      return await this.updateFlightDebrief(existing.id, data);
    }

    // No existing debrief, proceed with creation
    const insertData: any = {
      mission_debriefing_id: data.mission_debriefing_id,
      flight_id: data.flight_id,
      callsign: data.callsign,
      squadron_id: data.squadron_id,
      flight_lead_pilot_id: data.flight_lead_pilot_id,
      submitted_at: new Date().toISOString(),
      flight_status: 'launched', // Default to launched when AAR is submitted
      status: 'submitted',
      performance_ratings: data.performance_ratings,
      key_lessons_learned: data.key_lessons_learned || null
    };

    const { data: result, error } = await supabase
      .from('flight_debriefs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create flight debrief: ${error.message}`);
    }

    return result as unknown as FlightDebrief;
  }

  /**
   * Update a flight debrief
   */
  async updateFlightDebrief(
    id: string,
    data: any
  ): Promise<FlightDebrief> {
    const updateData: any = {
      performance_ratings: data.performance_ratings,
      key_lessons_learned: data.key_lessons_learned
    };

    const { data: result, error } = await supabase
      .from('flight_debriefs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update flight debrief: ${error.message}`);
    }

    return result as unknown as FlightDebrief;
  }

  /**
   * Finalize a flight debrief (lock from further edits)
   */
  async finalizeFlightDebrief(id: string): Promise<FlightDebrief> {
    const { data, error } = await supabase
      .from('flight_debriefs')
      .update({
        status: 'finalized'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to finalize flight debrief: ${error.message}`);
    }

    return data as unknown as FlightDebrief;
  }

  /**
   * Delete a flight debrief (only if not finalized)
   */
  async deleteFlightDebrief(id: string): Promise<void> {
    const { error } = await supabase
      .from('flight_debriefs')
      .delete()
      .eq('id', id)
      .neq('status', 'finalized');

    if (error) {
      throw new Error(`Failed to delete flight debrief: ${error.message}`);
    }
  }

  /**
   * Get delegation for a specific mission and user
   */
  async getDelegation(
    missionDebriefId: string,
    pilotId: string
  ): Promise<DebriefDelegation | null> {
    const { data, error } = await supabase
      .from('debrief_delegation')
      .select('*')
      .eq('mission_debrief_id', missionDebriefId)
      .eq('delegated_to_pilot_id', pilotId)
      .eq('revoked', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get delegation: ${error.message}`);
    }

    return data as DebriefDelegation;
  }

  /**
   * Create a delegation
   */
  async createDelegation(
    flightDebriefId: string,
    originalFlightLeadId: string,
    delegatedToUserId: string,
    delegatedByUserId: string,
    reason?: string
  ): Promise<DebriefDelegation> {
    const { data, error } = await supabase
      .from('debrief_delegation')
      .insert({
        flight_debrief_id: flightDebriefId,
        original_flight_lead_id: originalFlightLeadId,
        delegated_to_user_id: delegatedToUserId,
        delegated_by_user_id: delegatedByUserId,
        reason
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create delegation: ${error.message}`);
    }

    return data as DebriefDelegation;
  }

  /**
   * Revoke a delegation (delete it)
   */
  async revokeDelegation(delegationId: string): Promise<void> {
    const { error } = await supabase
      .from('debrief_delegation')
      .delete()
      .eq('id', delegationId);

    if (error) {
      throw new Error(`Failed to revoke delegation: ${error.message}`);
    }
  }

  /**
   * Get missions that are ready for debriefing (completed events)
   */
  async getDebriefableMissions(_wingId?: string, cycleId?: string) {
    // First, query missions with events
    let query = supabase
      .from('missions')
      .select(`
        id,
        name,
        event_id,
        status,
        created_at,
        events!missions_event_id_fkey(
          id,
          name,
          start_datetime,
          participants,
          cycle_id
        ),
        mission_debriefings(
          id,
          status,
          mission_outcome,
          created_at,
          finalized_at
        )
      `)
      .in('status', ['completed', 'in_progress']) // Only show missions that are in progress or completed
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get debriefable missions: ${error.message}`);
    }

    // Flatten the event data and filter by cycle/wing if needed
    let missions = data?.map((mission: any) => {
      // The participants array contains squadron IDs, not auth_user_ids
      const participants = mission.events?.participants || [];

      // Use first squadron ID if multiple squadrons participated
      const primarySquadronId = participants.length > 0 ? participants[0] : null;

      return {
        id: mission.id,
        name: mission.name,
        scheduled_time: mission.events?.start_datetime || mission.created_at,
        status: mission.status, // Mission planning status from missions table
        cycle_id: mission.events?.cycle_id,
        wing_id: undefined, // Not available in events schema
        squadron_id: primarySquadronId,
        participating_squadron_ids: participants, // Include all participating squadrons for filtering
        mission_debriefings: mission.mission_debriefings
      };
    }) || [];

    console.log('[DEBRIEF-SERVICE] Mapped missions with squadron_ids:', JSON.stringify(missions.slice(0, 2), null, 2));

    // Filter by cycle if specified
    // Note: cycleId can be null to explicitly filter for standalone events (no cycle)
    if (cycleId !== undefined) {
      missions = missions.filter((m) => m.cycle_id === cycleId);
    }

    // Note: Wing filtering would need to be done via participants JSONB if required
    // Skipping for MVP as missions are accessible to all with permission

    return missions;
  }

  /**
   * Get all cycles for filtering
   */
  async getCycles() {
    const { data, error } = await supabase
      .from('cycles')
      .select('id, name, start_date, end_date')
      .order('start_date', { ascending: false});

    if (error) {
      throw new Error(`Failed to get cycles: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get full mission details including flights and pilot assignments
   */
  async getMissionWithFlights(missionId: string) {
    const { data, error } = await supabase
      .from('missions')
      .select(`
        id,
        name,
        event_id,
        status,
        flights,
        pilot_assignments,
        created_at,
        events!missions_event_id_fkey(
          id,
          name,
          start_datetime,
          participants
        )
      `)
      .eq('id', missionId)
      .single();

    if (error) {
      throw new Error(`Failed to get mission: ${error.message}`);
    }

    return data;
  }

  /**
   * Get flight debriefs with pilot kills for a mission debrief
   */
  async getFlightDebriefsByMissionWithKills(missionDebriefId: string) {
    const { data, error } = await supabase
      .from('flight_debriefs')
      .select(`
        *,
        pilot_kills(
          air_to_air_kills,
          air_to_ground_kills
        )
      `)
      .eq('mission_debriefing_id', missionDebriefId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get flight debriefs: ${error.message}`);
    }

    return data || [];
  }
}

export const debriefingService = new DebriefingService();
