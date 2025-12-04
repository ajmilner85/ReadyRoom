import { supabase } from '../utils/supabaseClient';
import type { PilotKill } from '../types/DebriefingTypes';

/**
 * Service for tracking pilot kills in debriefs
 */
class KillTrackingService {
  /**
   * Record kills for a pilot in a flight debrief
   */
  async recordKills(
    flightDebriefId: string,
    pilotId: string,
    missionId: string,
    a2aKills: number,
    a2gKills: number
  ): Promise<PilotKill> {
    // Check if kills already exist for this pilot/debrief
    const { data: existing } = await supabase
      .from('pilot_kills')
      .select('id')
      .eq('flight_debrief_id', flightDebriefId)
      .eq('pilot_id', pilotId)
      .single();

    if (existing) {
      // Update existing record
      return await this.updateKills(existing.id, a2aKills, a2gKills);
    }

    // Create new record
    const { data, error } = await supabase
      .from('pilot_kills')
      .insert({
        flight_debrief_id: flightDebriefId,
        pilot_id: pilotId,
        mission_id: missionId,
        air_to_air_kills: a2aKills,
        air_to_ground_kills: a2gKills
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record kills: ${error.message}`);
    }

    return data as PilotKill;
  }

  /**
   * Update existing kill record
   */
  async updateKills(
    killRecordId: string,
    a2aKills: number,
    a2gKills: number
  ): Promise<PilotKill> {
    const { data, error } = await supabase
      .from('pilot_kills')
      .update({
        air_to_air_kills: a2aKills,
        air_to_ground_kills: a2gKills
      })
      .eq('id', killRecordId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update kills: ${error.message}`);
    }

    return data as PilotKill;
  }

  /**
   * Get all kills for a flight debrief
   */
  async getKillsByFlight(flightDebriefId: string): Promise<PilotKill[]> {
    const { data, error } = await supabase
      .from('pilot_kills')
      .select(`
        *,
        pilot:pilots(
          id,
          callsign
        )
      `)
      .eq('flight_debrief_id', flightDebriefId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get kills: ${error.message}`);
    }

    return data as PilotKill[];
  }

  /**
   * Get kills for a specific pilot in a flight debrief
   */
  async getKillsByPilot(
    flightDebriefId: string,
    pilotId: string
  ): Promise<PilotKill | null> {
    const { data, error } = await supabase
      .from('pilot_kills')
      .select('*')
      .eq('flight_debrief_id', flightDebriefId)
      .eq('pilot_id', pilotId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get pilot kills: ${error.message}`);
    }

    return data as PilotKill;
  }

  /**
   * Delete kill record
   */
  async deleteKills(killRecordId: string): Promise<void> {
    const { error } = await supabase
      .from('pilot_kills')
      .delete()
      .eq('id', killRecordId);

    if (error) {
      throw new Error(`Failed to delete kills: ${error.message}`);
    }
  }

  /**
   * Get aggregate kill statistics for a mission
   */
  async getMissionKillStats(missionDebriefId: string) {
    const { data, error } = await supabase
      .from('pilot_kills')
      .select(`
        air_to_air_kills,
        air_to_ground_kills,
        flight_debrief:flight_debriefs!inner(
          mission_debrief_id
        )
      `)
      .eq('flight_debrief.mission_debrief_id', missionDebriefId);

    if (error) {
      throw new Error(`Failed to get mission kill stats: ${error.message}`);
    }

    const totalA2A = data.reduce((sum, record) => sum + (record.air_to_air_kills || 0), 0);
    const totalA2G = data.reduce((sum, record) => sum + (record.air_to_ground_kills || 0), 0);

    return {
      totalA2A,
      totalA2G,
      totalKills: totalA2A + totalA2G,
      recordCount: data.length
    };
  }

  /**
   * Get mission unit pool - units available for kill tracking in this mission
   */
  async getMissionUnitPool(missionDebriefingId: string) {
    const { data, error } = await supabase
      .from('mission_unit_type_pool')
      .select(`
        id,
        unit_type_id,
        kill_category,
        added_at,
        unit_type:dcs_unit_types(
          id,
          type_name,
          display_name,
          category,
          kill_category
        )
      `)
      .eq('mission_debriefing_id', missionDebriefingId)
      .order('added_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get mission unit pool: ${error.message}`);
    }

    return data;
  }

  /**
   * Add units to mission pool (stored in mission_debriefings.unit_type_pool JSONB column)
   * Uses the database function add_units_to_pool which handles duplicates
   */
  async addUnitsToPool(missionDebriefingId: string, unitTypeIds: string[]) {
    if (!unitTypeIds || unitTypeIds.length === 0) {
      console.log('No unit type IDs provided to add to pool');
      return;
    }

    console.log('Adding units to pool:', { missionDebriefingId, unitTypeIds });

    // Call the database function to add units to the JSONB pool
    const { data, error } = await supabase.rpc('add_units_to_pool', {
      p_mission_debriefing_id: missionDebriefingId,
      p_unit_type_ids: unitTypeIds
    });

    if (error) {
      console.error('Error adding units to pool:', error);
      throw new Error(`Failed to add units to pool: ${error.message || JSON.stringify(error)}`);
    }

    console.log('Successfully added units to pool:', data);
    return data;
  }

  /**
   * Remove unit from mission pool
   */
  async removeUnitFromPool(poolId: string) {
    const { error } = await supabase
      .from('mission_unit_type_pool')
      .delete()
      .eq('id', poolId);

    if (error) {
      throw new Error(`Failed to remove unit from pool: ${error.message}`);
    }
  }

  /**
   * Record unit-specific kills for a pilot (using JSONB structure)
   */
  async recordUnitKills(
    flightDebriefId: string,
    pilotId: string,
    missionId: string,
    unitTypeId: string,
    killCount: number,
    pilotStatus: 'alive' | 'mia' | 'kia' = 'alive',
    aircraftStatus: 'recovered' | 'damaged' | 'destroyed' = 'recovered'
  ) {
    // Get existing record for this pilot in this mission
    const { data: existing } = await supabase
      .from('pilot_kills')
      .select('id, kills_detail')
      .eq('flight_debrief_id', flightDebriefId)
      .eq('pilot_id', pilotId)
      .eq('mission_id', missionId)
      .maybeSingle();

    if (existing) {
      // Update existing record - modify kills_detail JSONB array
      const killsDetail = existing.kills_detail as Array<{unit_type_id: string, kill_count: number}> || [];

      // Find if this unit type already exists in the array
      const existingKillIndex = killsDetail.findIndex(k => k.unit_type_id === unitTypeId);

      let updatedKillsDetail;
      if (existingKillIndex >= 0) {
        // Update existing unit kill count
        updatedKillsDetail = [...killsDetail];
        updatedKillsDetail[existingKillIndex] = { unit_type_id: unitTypeId, kill_count: killCount };
      } else {
        // Add new unit kill to array
        updatedKillsDetail = [...killsDetail, { unit_type_id: unitTypeId, kill_count: killCount }];
      }

      const { data, error } = await supabase
        .from('pilot_kills')
        .update({
          kills_detail: updatedKillsDetail,
          pilot_status: pilotStatus,
          aircraft_status: aircraftStatus
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update unit kills: ${error.message}`);
      }
      return data;
    }

    // Create new record with kills_detail as JSONB array
    const { data, error } = await supabase
      .from('pilot_kills')
      .insert({
        flight_debrief_id: flightDebriefId,
        pilot_id: pilotId,
        mission_id: missionId,
        kills_detail: [{ unit_type_id: unitTypeId, kill_count: killCount }],
        pilot_status: pilotStatus,
        aircraft_status: aircraftStatus
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record unit kills: ${error.message}`);
    }

    return data;
  }

  /**
   * Save pilot and aircraft status for a pilot with no kills
   */
  async savePilotStatus(
    flightDebriefId: string,
    pilotId: string,
    missionId: string,
    pilotStatus: 'alive' | 'mia' | 'kia',
    aircraftStatus: 'recovered' | 'damaged' | 'destroyed'
  ) {
    // Check if record exists
    const { data: existing } = await supabase
      .from('pilot_kills')
      .select('id')
      .eq('flight_debrief_id', flightDebriefId)
      .eq('pilot_id', pilotId)
      .eq('mission_id', missionId)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('pilot_kills')
        .update({
          pilot_status: pilotStatus,
          aircraft_status: aircraftStatus
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update pilot status: ${error.message}`);
      }
      return data;
    }

    // Create new record with empty kills_detail
    const { data, error } = await supabase
      .from('pilot_kills')
      .insert({
        flight_debrief_id: flightDebriefId,
        pilot_id: pilotId,
        mission_id: missionId,
        kills_detail: [],
        pilot_status: pilotStatus,
        aircraft_status: aircraftStatus
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save pilot status: ${error.message}`);
    }

    return data;
  }

  /**
   * Get pilot and aircraft statuses for all pilots in a flight debrief
   */
  async getPilotStatusesByFlight(flightDebriefId: string) {
    const { data, error } = await supabase
      .from('pilot_kills')
      .select(`
        pilot_id,
        pilot_status,
        aircraft_status
      `)
      .eq('flight_debrief_id', flightDebriefId);

    if (error) {
      throw new Error(`Failed to get pilot statuses: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get unit-specific kills for a flight debrief (expands JSONB kills_detail)
   */
  async getUnitKillsByFlight(flightDebriefId: string) {
    const { data, error } = await supabase
      .from('pilot_kills')
      .select(`
        id,
        flight_debrief_id,
        pilot_id,
        mission_id,
        kills_detail,
        pilot_status,
        aircraft_status,
        created_at,
        updated_at,
        pilot:pilots(
          id,
          callsign,
          boardNumber
        )
      `)
      .eq('flight_debrief_id', flightDebriefId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get unit kills: ${error.message}`);
    }

    // Expand kills_detail JSONB array into individual records
    const expandedKills: any[] = [];

    for (const record of data || []) {
      const killsDetail = record.kills_detail as Array<{unit_type_id: string, kill_count: number}> || [];

      for (const kill of killsDetail) {
        // Fetch unit type data for each kill
        const { data: unitType } = await supabase
          .from('dcs_unit_types')
          .select('id, type_name, display_name, kill_category')
          .eq('id', kill.unit_type_id)
          .single();

        expandedKills.push({
          id: `${record.id}-${kill.unit_type_id}`, // Composite ID for UI
          flight_debrief_id: record.flight_debrief_id,
          pilot_id: record.pilot_id,
          mission_id: record.mission_id,
          unit_type_id: kill.unit_type_id,
          kill_count: kill.kill_count,
          pilot_status: record.pilot_status,
          aircraft_status: record.aircraft_status,
          pilot: record.pilot,
          unit_type: unitType,
          created_at: record.created_at,
          updated_at: record.updated_at,
          parent_record_id: record.id // Reference to parent pilot_kills record
        });
      }
    }

    return expandedKills;
  }

  /**
   * Delete unit-specific kill record (removes unit from JSONB array)
   * @param killRecordId - Composite ID in format "parentId-unitTypeId" or actual record ID
   * @param unitTypeId - Optional unit type ID to remove from kills_detail array
   */
  async deleteUnitKills(killRecordId: string, unitTypeId?: string) {
    console.log('Attempting to delete kill record from DB:', { killRecordId, unitTypeId });

    // Parse composite ID if needed (format: "parentId-unitTypeId")
    let parentRecordId: string;
    let targetUnitTypeId: string;

    if (killRecordId.includes('-') && !unitTypeId) {
      const parts = killRecordId.split('-');
      parentRecordId = parts[0];
      targetUnitTypeId = parts.slice(1).join('-'); // Handle UUIDs with dashes
    } else {
      parentRecordId = killRecordId;
      targetUnitTypeId = unitTypeId || '';
    }

    console.log('Parsed IDs:', { parentRecordId, targetUnitTypeId });

    // Get the parent record
    const { data: parentRecord, error: fetchError } = await supabase
      .from('pilot_kills')
      .select('id, kills_detail')
      .eq('id', parentRecordId)
      .maybeSingle();

    if (fetchError) {
      console.error('Failed to fetch parent record:', fetchError);
      throw new Error(`Failed to fetch kill record: ${fetchError.message}`);
    }

    if (!parentRecord) {
      console.warn('Parent record not found:', parentRecordId);
      return;
    }

    console.log('Found parent record:', parentRecord);

    const killsDetail = parentRecord.kills_detail as Array<{unit_type_id: string, kill_count: number}> || [];

    // Remove the specific unit from the array
    const updatedKillsDetail = killsDetail.filter(k => k.unit_type_id !== targetUnitTypeId);

    console.log('Kills detail before:', killsDetail);
    console.log('Kills detail after:', updatedKillsDetail);

    if (updatedKillsDetail.length === 0) {
      // If no kills left, delete the entire record
      console.log('No kills remaining, deleting entire record');
      const { data, error } = await supabase
        .from('pilot_kills')
        .delete()
        .eq('id', parentRecordId)
        .select();

      if (error) {
        console.error('Delete failed with error:', error);
        throw new Error(`Failed to delete pilot kills record: ${error.message}`);
      }

      console.log('Delete successful:', data);
    } else {
      // Update the record with the filtered kills_detail
      console.log('Updating kills_detail array');
      const { data, error } = await supabase
        .from('pilot_kills')
        .update({ kills_detail: updatedKillsDetail })
        .eq('id', parentRecordId)
        .select();

      if (error) {
        console.error('Update failed with error:', error);
        throw new Error(`Failed to update kills detail: ${error.message}`);
      }

      console.log('Update successful:', data);
    }
  }

  /**
   * Batch save kills for a pilot (replaces entire kills_detail array)
   * More efficient than calling recordUnitKills multiple times
   */
  async saveAllKillsForPilot(
    flightDebriefId: string,
    pilotId: string,
    missionId: string,
    kills: Array<{ unitTypeId: string, killCount: number }>,
    pilotStatus: 'alive' | 'mia' | 'kia' = 'alive',
    aircraftStatus: 'recovered' | 'damaged' | 'destroyed' = 'recovered'
  ) {
    // Get existing record for this pilot in this mission
    const { data: existing } = await supabase
      .from('pilot_kills')
      .select('id')
      .eq('flight_debrief_id', flightDebriefId)
      .eq('pilot_id', pilotId)
      .eq('mission_id', missionId)
      .maybeSingle();

    // Build kills_detail array
    const killsDetail = kills.map(k => ({
      unit_type_id: k.unitTypeId,
      kill_count: k.killCount
    }));

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('pilot_kills')
        .update({
          kills_detail: killsDetail,
          pilot_status: pilotStatus,
          aircraft_status: aircraftStatus
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update pilot kills: ${error.message}`);
      }
      return data;
    }

    // Create new record
    const { data, error } = await supabase
      .from('pilot_kills')
      .insert({
        flight_debrief_id: flightDebriefId,
        pilot_id: pilotId,
        mission_id: missionId,
        kills_detail: killsDetail,
        pilot_status: pilotStatus,
        aircraft_status: aircraftStatus
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save pilot kills: ${error.message}`);
    }

    return data;
  }
}

export const killTrackingService = new KillTrackingService();
