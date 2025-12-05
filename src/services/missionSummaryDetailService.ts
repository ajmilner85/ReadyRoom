import { supabase } from '../utils/supabaseClient';

export interface PilotDetail {
  id: string;
  callsign: string;
  boardNumber: string;
  squadron?: {
    id: string;
    designation: string;
    name: string;
    tail_code: string;
    insignia_url: string;
  };
}

export interface MissionSummaryDetails {
  pilotStatusDetails: {
    alive: PilotDetail[];
    mia: PilotDetail[];
    kia: PilotDetail[];
    unaccounted: PilotDetail[];
  };
  aircraftStatusDetails: {
    recovered: PilotDetail[];
    damaged: PilotDetail[];
    destroyed: PilotDetail[];
    down: PilotDetail[];
    unaccounted: PilotDetail[];
  };
  killDetails: {
    a2a: Array<{ unitTypeName: string; displayName: string; count: number }>;
    a2g: Array<{ unitTypeName: string; displayName: string; count: number }>;
    a2s: Array<{ unitTypeName: string; displayName: string; count: number }>;
  };
  performanceDetails: {
    categories: Array<{
      name: string;
      displayName: string;
      sats: number;
      unsats: number;
      unassessed: number;
    }>;
  };
}

class MissionSummaryDetailService {
  async getMissionSummaryDetails(missionDebriefId: string): Promise<MissionSummaryDetails> {
    // Get the mission_debriefing record to find the mission_id
    const { data: missionDebrief, error: missionDebriefError } = await supabase
      .from('mission_debriefings')
      .select('mission_id')
      .eq('id', missionDebriefId)
      .single();

    if (missionDebriefError || !missionDebrief) {
      throw new Error(`Failed to fetch mission debrief: ${missionDebriefError?.message || 'Not found'}`);
    }

    // Get mission to access pilot_assignments
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('pilot_assignments')
      .eq('id', missionDebrief.mission_id)
      .single();

    if (missionError) {
      throw new Error(`Failed to fetch mission: ${missionError.message}`);
    }

    // Get all flight debriefs for this mission
    const { data: flightDebriefs, error: flightDebriefError } = await supabase
      .from('flight_debriefs')
      .select('id, performance_ratings, squadron_id')
      .eq('mission_debriefing_id', missionDebriefId);

    if (flightDebriefError) {
      throw new Error(`Failed to fetch flight debriefs: ${flightDebriefError.message}`);
    }

    const flightDebriefIds = flightDebriefs?.map(fd => fd.id) || [];

    // Get all pilot kills with pilot details
    const { data: pilotKills, error: killsError } = await supabase
      .from('pilot_kills')
      .select(`
        pilot_id,
        pilot_status,
        aircraft_status,
        kills_detail,
        pilot:pilots(
          id,
          callsign,
          boardNumber
        )
      `)
      .in('flight_debrief_id', flightDebriefIds);

    if (killsError) {
      throw new Error(`Failed to fetch pilot kills: ${killsError.message}`);
    }

    // Get unique pilot IDs
    const pilotIds = new Set<string>();
    pilotKills?.forEach(record => {
      const pilot = record.pilot as any;
      if (pilot?.id) {
        pilotIds.add(pilot.id);
      }
    });

    // Get pilot assignments to find squadron associations
    const { data: pilotAssignmentsData } = await supabase
      .from('pilot_assignments')
      .select('pilot_id, squadron_id')
      .in('pilot_id', Array.from(pilotIds));

    // Create pilot to squadron mapping
    const pilotToSquadronMap = new Map<string, string>();
    pilotAssignmentsData?.forEach(pa => {
      if (pa.squadron_id) {
        pilotToSquadronMap.set(pa.pilot_id, pa.squadron_id);
      }
    });

    // Get unique squadron IDs
    const squadronIds = new Set<string>(pilotToSquadronMap.values());

    // Fetch squadron details
    const { data: squadrons } = await supabase
      .from('org_squadrons')
      .select('id, designation, name, tail_code, insignia_url')
      .in('id', Array.from(squadronIds));

    // Create squadron lookup map
    const squadronMap = new Map();
    squadrons?.forEach(sq => {
      squadronMap.set(sq.id, sq);
    });

    // Initialize detail arrays
    const details: MissionSummaryDetails = {
      pilotStatusDetails: {
        alive: [],
        mia: [],
        kia: [],
        unaccounted: []
      },
      aircraftStatusDetails: {
        recovered: [],
        damaged: [],
        destroyed: [],
        down: [],
        unaccounted: []
      },
      killDetails: {
        a2a: [],
        a2g: [],
        a2s: []
      },
      performanceDetails: {
        categories: []
      }
    };

    // Group pilots by status
    const pilotsProcessed = new Set<string>();
    pilotKills?.forEach(record => {
      const pilot = record.pilot as any;
      if (!pilot || pilotsProcessed.has(pilot.id)) return;

      pilotsProcessed.add(pilot.id);

      const squadronId = pilotToSquadronMap.get(pilot.id);
      const pilotDetail: PilotDetail = {
        id: pilot.id,
        callsign: pilot.callsign,
        boardNumber: pilot.boardNumber,
        squadron: squadronId ? squadronMap.get(squadronId) : undefined
      };

      const pilotStatus = record.pilot_status || 'unaccounted';
      const aircraftStatus = record.aircraft_status || 'unaccounted';

      // Add to pilot status arrays
      if (pilotStatus === 'alive') details.pilotStatusDetails.alive.push(pilotDetail);
      else if (pilotStatus === 'mia') details.pilotStatusDetails.mia.push(pilotDetail);
      else if (pilotStatus === 'kia') details.pilotStatusDetails.kia.push(pilotDetail);
      else details.pilotStatusDetails.unaccounted.push(pilotDetail);

      // Add to aircraft status arrays
      if (aircraftStatus === 'recovered') details.aircraftStatusDetails.recovered.push(pilotDetail);
      else if (aircraftStatus === 'damaged') details.aircraftStatusDetails.damaged.push(pilotDetail);
      else if (aircraftStatus === 'destroyed') details.aircraftStatusDetails.destroyed.push(pilotDetail);
      else if (aircraftStatus === 'down') details.aircraftStatusDetails.down.push(pilotDetail);
      else details.aircraftStatusDetails.unaccounted.push(pilotDetail);
    });

    // Get all pilot IDs that participated in the mission
    const pilotAssignments = mission?.pilot_assignments as any || {};
    const allPilotIds = new Set<string>();
    Object.values(pilotAssignments).forEach((flightPilots: any) => {
      if (Array.isArray(flightPilots)) {
        flightPilots.forEach((p: any) => {
          if (p.pilot_id) allPilotIds.add(p.pilot_id);
        });
      }
    });

    // Find unaccounted pilots (those not in pilot_kills)
    const unaccountedPilotIds = Array.from(allPilotIds).filter(id => !pilotsProcessed.has(id));

    if (unaccountedPilotIds.length > 0) {
      const { data: unaccountedPilots } = await supabase
        .from('pilots')
        .select('id, callsign, boardNumber')
        .in('id', unaccountedPilotIds);

      // Get pilot assignments for unaccounted pilots
      const { data: unaccountedAssignments } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, squadron_id')
        .in('pilot_id', unaccountedPilotIds);

      // Add to pilot-to-squadron mapping
      unaccountedAssignments?.forEach(pa => {
        if (pa.squadron_id) {
          pilotToSquadronMap.set(pa.pilot_id, pa.squadron_id);
          if (!squadronMap.has(pa.squadron_id)) {
            squadronIds.add(pa.squadron_id);
          }
        }
      });

      // Fetch additional squadrons if needed
      if (squadronIds.size > squadronMap.size) {
        const additionalSquadronIds = Array.from(squadronIds).filter(id => !squadronMap.has(id));
        const { data: additionalSquadrons } = await supabase
          .from('org_squadrons')
          .select('id, designation, name, tail_code, insignia_url')
          .in('id', additionalSquadronIds);

        additionalSquadrons?.forEach(sq => {
          squadronMap.set(sq.id, sq);
        });
      }

      unaccountedPilots?.forEach((pilot: any) => {
        const squadronId = pilotToSquadronMap.get(pilot.id);
        const pilotDetail: PilotDetail = {
          id: pilot.id,
          callsign: pilot.callsign,
          boardNumber: pilot.boardNumber,
          squadron: squadronId ? squadronMap.get(squadronId) : undefined
        };
        details.pilotStatusDetails.unaccounted.push(pilotDetail);
        details.aircraftStatusDetails.unaccounted.push(pilotDetail);
      });
    }

    // Aggregate kill details by unit type
    const killsByUnit = new Map<string, { category: string; count: number }>();

    pilotKills?.forEach(record => {
      if (record.kills_detail && Array.isArray(record.kills_detail)) {
        const killsDetail = record.kills_detail as Array<{unit_type_id: string, kill_count: number}>;
        killsDetail.forEach(kill => {
          const existing = killsByUnit.get(kill.unit_type_id);
          if (existing) {
            existing.count += kill.kill_count;
          } else {
            killsByUnit.set(kill.unit_type_id, { category: '', count: kill.kill_count });
          }
        });
      }
    });

    // Fetch unit type details
    if (killsByUnit.size > 0) {
      const { data: unitTypes } = await supabase
        .from('dcs_unit_types')
        .select('id, type_name, display_name, kill_category')
        .in('id', Array.from(killsByUnit.keys()));

      unitTypes?.forEach(ut => {
        const killData = killsByUnit.get(ut.id);
        if (killData) {
          const unitDetail = {
            unitTypeName: ut.type_name,
            displayName: ut.display_name,
            count: killData.count
          };

          if (ut.kill_category === 'A2A') {
            details.killDetails.a2a.push(unitDetail);
          } else if (ut.kill_category === 'A2G') {
            details.killDetails.a2g.push(unitDetail);
          } else if (ut.kill_category === 'A2S') {
            details.killDetails.a2s.push(unitDetail);
          }
        }
      });

      // Sort by count descending
      details.killDetails.a2a.sort((a, b) => b.count - a.count);
      details.killDetails.a2g.sort((a, b) => b.count - a.count);
      details.killDetails.a2s.sort((a, b) => b.count - a.count);
    }

    // Aggregate performance ratings by category
    const PERFORMANCE_CATEGORIES: Record<string, string> = {
      mission_planning: 'Mission Planning & Brief Execution',
      flight_discipline: 'Flight Discipline & Communication',
      formation_navigation: 'Formation & Navigation',
      tactical_execution: 'Tactical Execution',
      situational_awareness: 'Situational Awareness',
      weapons_employment: 'Weapons Employment',
      survivability_safety: 'Survivability & Safety',
      debrief_participation: 'Debrief Participation'
    };

    const categoryStats = new Map<string, { sats: number; unsats: number; total: number }>();

    // Initialize all categories
    Object.keys(PERFORMANCE_CATEGORIES).forEach(key => {
      categoryStats.set(key, { sats: 0, unsats: 0, total: 0 });
    });

    // Count ratings per category
    flightDebriefs?.forEach(fd => {
      const performanceRatings = fd.performance_ratings as any;
      if (performanceRatings && typeof performanceRatings === 'object') {
        Object.entries(performanceRatings).forEach(([category, ratingObj]: [string, any]) => {
          if (ratingObj && typeof ratingObj === 'object' && ratingObj.rating) {
            const stats = categoryStats.get(category);
            if (stats) {
              const rating = ratingObj.rating.toLowerCase();
              if (rating === 'sat') {
                stats.sats++;
                stats.total++;
              } else if (rating === 'unsat') {
                stats.unsats++;
                stats.total++;
              }
            }
          }
        });
      }
    });

    // Build category details array
    const totalFlights = Object.keys(pilotAssignments).length;
    Object.entries(PERFORMANCE_CATEGORIES).forEach(([key, displayName]) => {
      const stats = categoryStats.get(key)!;
      details.performanceDetails.categories.push({
        name: key,
        displayName,
        sats: stats.sats,
        unsats: stats.unsats,
        unassessed: totalFlights - stats.total
      });
    });

    return details;
  }
}

export const missionSummaryDetailService = new MissionSummaryDetailService();
