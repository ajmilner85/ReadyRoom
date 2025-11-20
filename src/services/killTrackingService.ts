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
}

export const killTrackingService = new KillTrackingService();
