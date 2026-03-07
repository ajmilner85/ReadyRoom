import React, { useState, useEffect, useCallback } from 'react';
import { Check, Clock, HelpCircle, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../context/AuthContext';

interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
}

interface FlightAssignmentsKneeboardProps {
  pilotId: string | null;
  cycleId: string | null;
  theme: 'light' | 'dark';
  colors: ThemeColors;
  selectedMissionId?: string | null;
  onMissionChange?: (missionId: string) => void;
  missions?: Mission[];
  onMissionsLoad?: (missions: Mission[]) => void;
}

interface Mission {
  id: string;
  event_id: string | null;
  event_name: string;
  event_start_time: string;
  event_duration_minutes: number;
  flights: Flight[];
  pilot_assignments: Record<string, AssignedPilot[]>;
}

interface Flight {
  id: string;
  callsign: string;
  flightNumber: string;
  aircraftType?: string;
  stepTime?: number;
  squadronId?: string;
  midsA?: string;
  midsB?: string;
  displayCallsign?: string;
}

interface AssignedPilot {
  dashNumber: string;
  boardNumber: string;
  callsign: string;
  attendanceStatus?: 'accepted' | 'tentative' | 'declined';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  pilotId?: string;
}

interface SquadronInfo {
  id: string;
  designation: string;
  name: string;
  insignia_url: string | null;
  callsigns: string[];
  primaryColor: string | null;
}

const POLL_INTERVAL = 5000; // 5 seconds

const FlightAssignmentsKneeboard: React.FC<FlightAssignmentsKneeboardProps> = ({
  pilotId,
  cycleId,
  theme,
  colors,
  selectedMissionId: externalSelectedMissionId,
  onMissionChange,
  missions: externalMissions,
  onMissionsLoad
}) => {
  useAuth(); // Required for authentication context
  const [missions, setMissions] = useState<Mission[]>(externalMissions || []);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(externalSelectedMissionId || null);
  const [loading, setLoading] = useState(true);
  const [squadrons, setSquadrons] = useState<SquadronInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Find the active/upcoming mission based on time
  const getActiveMission = useCallback((missionList: Mission[]): Mission | null => {
    if (missionList.length === 0) return null;

    const now = new Date();
    const bufferMs = 2 * 60 * 60 * 1000; // 2 hour buffer

    // First, try to find a mission that's currently active (within start time to end time + buffer)
    const activeMission = missionList.find(m => {
      const start = new Date(m.event_start_time);
      const end = new Date(start.getTime() + m.event_duration_minutes * 60000 + bufferMs);
      return now >= start && now <= end;
    });

    if (activeMission) return activeMission;

    // Otherwise, find the next upcoming mission
    const upcomingMissions = missionList
      .filter(m => new Date(m.event_start_time) > now)
      .sort((a, b) => new Date(a.event_start_time).getTime() - new Date(b.event_start_time).getTime());

    if (upcomingMissions.length > 0) return upcomingMissions[0];

    // If no upcoming, return the most recent past mission
    const pastMissions = missionList
      .filter(m => new Date(m.event_start_time) <= now)
      .sort((a, b) => new Date(b.event_start_time).getTime() - new Date(a.event_start_time).getTime());

    return pastMissions[0] || null;
  }, []);

  // Fetch missions
  const fetchMissions = useCallback(async () => {
    if (!cycleId) {
      setMissions([]);
      setLoading(false);
      return;
    }

    try {
      // Get recent missions (past 7 days and future)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: missionsData, error: missionsError } = await supabase
        .from('missions')
        .select(`
          id,
          event_id,
          flights,
          pilot_assignments,
          events!missions_event_id_fkey (
            id,
            name,
            start_datetime,
            end_datetime,
            participants,
            cycle_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (missionsError) {
        console.error('[KNEEBOARD] Error fetching missions:', missionsError);
        setError('Failed to fetch missions');
        return;
      }

      // Filter and transform missions
      const transformedMissions = (missionsData || [])
        .filter(mission => {
          // Must have an associated event
          if (!mission.events) return false;

          // Must match the selected cycle
          if (mission.events.cycle_id !== cycleId) return false;

          // Check if mission is within time window
          const eventStart = new Date(mission.events.start_datetime);
          if (eventStart < sevenDaysAgo) return false;

          return true;
        })
        .map(mission => {
          // Calculate duration from start and end datetime
          const startTime = new Date(mission.events!.start_datetime);
          const endTime = mission.events!.end_datetime
            ? new Date(mission.events!.end_datetime)
            : new Date(startTime.getTime() + 120 * 60000); // Default 2 hours
          const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          // Enrich flights with flight numbers and MIDS channels in displayCallsign
          const enrichedFlights = (Array.isArray(mission.flights) ? mission.flights : []).map((flight: any) => ({
            ...flight,
            displayCallsign: flight.flight_data?.flightNumber
              ? `${flight.callsign} ${flight.flight_data.flightNumber}`
              : flight.callsign,
            midsA: flight.flight_data?.midsA || '',
            midsB: flight.flight_data?.midsB || ''
          }));

          // Enrich pilot assignments with pilot details
          // @ts-ignore - Unused but kept for future use
          const _enrichPilotAssignments = async (assignments: Record<string, any[]>) => {
            const pilotIds = new Set<string>();
            for (const flightId of Object.keys(assignments)) {
              const pilots = assignments[flightId] || [];
              for (const pilot of pilots) {
                if (pilot.pilot_id) {
                  pilotIds.add(pilot.pilot_id);
                }
              }
            }

            if (pilotIds.size === 0) return assignments;

            const { data: pilots } = await supabase
              .from('pilots')
              .select('id, board_number, callsign')
              .in('id', Array.from(pilotIds));

            const pilotLookup = (pilots || []).reduce((acc: any, p: any) => {
              acc[p.id] = {
                callsign: p.callsign,
                boardNumber: p.board_number
              };
              return acc;
            }, {});

            const enrichedAssignments: Record<string, any[]> = {};
            for (const flightId of Object.keys(assignments)) {
              enrichedAssignments[flightId] = (assignments[flightId] || []).map(pilot => {
                const pilotDetails = pilot.pilot_id ? pilotLookup[pilot.pilot_id] : null;
                return {
                  ...pilot,
                  callsign: pilotDetails?.callsign || '',
                  boardNumber: pilotDetails?.boardNumber || ''
                };
              });
            }
            return enrichedAssignments;
          };

          return {
            id: mission.id,
            event_id: mission.event_id,
            event_name: mission.events!.name,
            event_start_time: mission.events!.start_datetime,
            event_duration_minutes: durationMinutes,
            flights: enrichedFlights,
            pilot_assignments: (mission.pilot_assignments as Record<string, any[]>) || {}
          };
        })
        .sort((a, b) => new Date(b.event_start_time).getTime() - new Date(a.event_start_time).getTime());

      // Enrich all pilot assignments
      for (const mission of transformedMissions) {
        const pilotIds = new Set<string>();
        for (const flightId of Object.keys(mission.pilot_assignments)) {
          const pilots = mission.pilot_assignments[flightId] || [];
          for (const pilot of pilots as any[]) {
            if (pilot.pilot_id) {
              pilotIds.add(pilot.pilot_id);
            }
          }
        }

        if (pilotIds.size > 0) {
          const { data: pilots, error: pilotsError } = await supabase
            .from('pilots')
            .select('id, boardNumber, callsign')
            .in('id', Array.from(pilotIds));

          if (pilotsError) {
            console.error('[KNEEBOARD] Error fetching pilot details:', pilotsError);
          }

          const pilotLookup = (pilots || []).reduce((acc: any, p: any) => {
            acc[p.id] = {
              callsign: p.callsign,
              boardNumber: p.boardNumber
            };
            return acc;
          }, {});

          for (const flightId of Object.keys(mission.pilot_assignments)) {
            mission.pilot_assignments[flightId] = (mission.pilot_assignments[flightId] || []).map((pilot: any) => {
              const pilotDetails = pilot.pilot_id ? pilotLookup[pilot.pilot_id] : null;

              // Debug: Log first pilot's MIDS data
              if (Object.keys(mission.pilot_assignments).indexOf(flightId) === 0 && (mission.pilot_assignments[flightId] as any[]).indexOf(pilot) === 0) {
                console.log('[KNEEBOARD] Raw pilot assignment data from database:', {
                  pilot_id: pilot.pilot_id,
                  dash_number: pilot.dash_number,
                  mids_a_channel: pilot.mids_a_channel,
                  mids_b_channel: pilot.mids_b_channel,
                  allKeys: Object.keys(pilot)
                });
              }

              return {
                ...pilot, // Preserves mids_a_channel, mids_b_channel, dash_number, etc.
                pilotId: pilot.pilot_id, // Add camelCase field for interface compatibility
                callsign: pilotDetails?.callsign || '',
                boardNumber: pilotDetails?.boardNumber || ''
              };
            });
          }
        }
      }

      setMissions(transformedMissions);
      setLastUpdated(new Date());

      // Call callback to pass missions to parent
      if (onMissionsLoad) {
        onMissionsLoad(transformedMissions);
      }

      // Debug logging
      console.log('[KNEEBOARD] Fetched missions:', transformedMissions.length);
      transformedMissions.forEach((mission, idx) => {
        console.log(`[KNEEBOARD] Mission ${idx}:`, {
          id: mission.id,
          name: mission.event_name,
          start: mission.event_start_time,
          flightCount: mission.flights.length,
          hasAssignments: Object.keys(mission.pilot_assignments).length > 0
        });
      });

      // Auto-select active mission if none selected
      if (!externalSelectedMissionId && !selectedMissionId && transformedMissions.length > 0) {
        const active = getActiveMission(transformedMissions);
        if (active) {
          const newMissionId = active.id;
          setSelectedMissionId(newMissionId);
          if (onMissionChange) onMissionChange(newMissionId);
          console.log('[KNEEBOARD] Auto-selected mission:', newMissionId, active.event_name);
        } else {
          // If no active mission, select the most recent one with flights
          const missionWithFlights = transformedMissions.find(m => m.flights.length > 0);
          if (missionWithFlights) {
            const newMissionId = missionWithFlights.id;
            setSelectedMissionId(newMissionId);
            if (onMissionChange) onMissionChange(newMissionId);
            console.log('[KNEEBOARD] Auto-selected most recent mission with flights:', newMissionId, missionWithFlights.event_name);
          }
        }
      }

      setError(null);
    } catch (err) {
      console.error('[KNEEBOARD] Error in fetchMissions:', err);
      setError('Failed to load missions');
    } finally {
      setLoading(false);
    }
  }, [cycleId, externalSelectedMissionId, selectedMissionId, getActiveMission, onMissionChange, onMissionsLoad]);

  // Fetch squadron data once on mount
  useEffect(() => {
    supabase
      .from('org_squadrons')
      .select('id, designation, name, insignia_url, callsigns, color_palette')
      .then(({ data }) => {
        if (data) {
          setSquadrons(data.map((s: any) => ({
            id: s.id,
            designation: s.designation,
            name: s.name,
            insignia_url: s.insignia_url ?? null,
            callsigns: Array.isArray(s.callsigns)
              ? s.callsigns.filter((c: any): c is string => typeof c === 'string')
              : [],
            primaryColor: s.color_palette?.primary ?? null
          })));
        }
      });
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  // Polling for real-time updates
  useEffect(() => {
    const interval = setInterval(fetchMissions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  // Sync external selected mission with internal state
  useEffect(() => {
    if (externalSelectedMissionId !== undefined && externalSelectedMissionId !== selectedMissionId) {
      setSelectedMissionId(externalSelectedMissionId);
    }
  }, [externalSelectedMissionId]);

  // Sync external missions with internal state
  useEffect(() => {
    if (externalMissions) {
      setMissions(externalMissions);
    }
  }, [externalMissions]);

  const selectedMission = missions.find(m => m.id === selectedMissionId);

  // Find the user's flight
  const getUserFlight = (): { flight: Flight; pilots: AssignedPilot[] } | null => {
    if (!selectedMission || !pilotId) {
      console.log('[KNEEBOARD] getUserFlight: No mission or pilot ID', { selectedMission: !!selectedMission, pilotId });
      return null;
    }

    console.log('[KNEEBOARD] Looking for user flight. Pilot ID:', pilotId);

    for (const flight of selectedMission.flights) {
      const pilots = selectedMission.pilot_assignments[flight.id] || [];
      console.log(`[KNEEBOARD] Flight ${flight.callsign}:`, pilots.map(p => ({ pilotId: p.pilotId, callsign: p.callsign })));
      const isInFlight = pilots.some(p => p.pilotId === pilotId);
      if (isInFlight) {
        console.log('[KNEEBOARD] Found user in flight:', flight.callsign);
        return { flight, pilots };
      }
    }
    console.log('[KNEEBOARD] User not found in any flight');
    return null;
  };

  const userFlight = getUserFlight();

  // Get status icon and color
  // @ts-ignore - Unused but kept for future use
  const _getStatusIndicator = (pilot: AssignedPilot) => {
    // Roll call status takes precedence
    if (pilot.rollCallStatus === 'Present') {
      return { icon: <Check size={16} />, color: colors.success, label: 'Present' };
    }
    if (pilot.rollCallStatus === 'Absent') {
      return { icon: <X size={16} />, color: colors.error, label: 'Absent' };
    }
    if (pilot.rollCallStatus === 'Tentative') {
      return { icon: <HelpCircle size={16} />, color: colors.warning, label: 'Tentative' };
    }

    // Fall back to attendance status
    if (pilot.attendanceStatus === 'accepted') {
      return { icon: <Check size={16} />, color: colors.success, label: 'Accepted' };
    }
    if (pilot.attendanceStatus === 'tentative') {
      return { icon: <Clock size={16} />, color: colors.warning, label: 'Tentative' };
    }
    if (pilot.attendanceStatus === 'declined') {
      return { icon: <X size={16} />, color: colors.error, label: 'Declined' };
    }

    return { icon: <HelpCircle size={16} />, color: colors.textSecondary, label: 'Unknown' };
  };

  // Render a flight card
  const renderFlightCard = (flight: Flight, pilots: AssignedPilot[], isUserFlight: boolean, accentColor: string = colors.accent) => {
    // Derive a semi-transparent version for the pilot row highlight
    const highlightBg = (() => {
      // Try to convert hex to rgba; fall back to opacity trick via a wrapper
      const hex = accentColor.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return theme === 'dark' ? `rgba(${r},${g},${b},0.18)` : `rgba(${r},${g},${b},0.12)`;
      }
      return theme === 'dark' ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.1)';
    })();

    const sortedPilots = [...pilots].sort((a, b) => {
      // Handle both dashNumber (camelCase) and dash_number (snake_case from database)
      const dashA = parseInt((a as any).dash_number || a.dashNumber || '0');
      const dashB = parseInt((b as any).dash_number || b.dashNumber || '0');
      return dashA - dashB;
    });

    return (
      <div
        key={flight.id}
        style={{
          backgroundColor: colors.backgroundSecondary,
          border: `2px solid ${isUserFlight ? accentColor : colors.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '12px'
        }}
      >
        {/* Flight header - callsign starts at left edge */}
        <div style={{
          backgroundColor: isUserFlight ? accentColor : colors.border,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center'
        }}>
          {/* Callsign column - contains flight callsign and step time */}
          <span style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{
              fontSize: '24px',
              fontWeight: 700,
              color: isUserFlight ? '#FFFFFF' : colors.text,
              letterSpacing: '0.5px'
            }}>
              {flight.displayCallsign || flight.callsign}
            </span>
            {flight.stepTime !== undefined && (
              <span style={{
                fontSize: '20px',
                fontWeight: 500,
                color: isUserFlight ? 'rgba(255,255,255,0.9)' : colors.textSecondary
              }}>
                Step +{flight.stepTime}
              </span>
            )}
          </span>

          {/* MIDS A column header */}
          <span style={{
            width: '52px',
            fontSize: '20px',
            fontWeight: 600,
            color: isUserFlight ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
            textAlign: 'center'
          }}>
            A
          </span>

          {/* MIDS B column header */}
          <span style={{
            width: '52px',
            fontSize: '20px',
            fontWeight: 600,
            color: isUserFlight ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
            textAlign: 'center'
          }}>
            B
          </span>
        </div>

        {/* Pilot list */}
        <div style={{ padding: '8px' }}>
          {sortedPilots.length === 0 ? (
            <div style={{
              padding: '12px',
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: '24px',
              fontStyle: 'italic'
            }}>
              No pilots assigned
            </div>
          ) : (
            sortedPilots.map((pilot, index) => {
              const isCurrentUser = pilot.pilotId === pilotId;

              return (
                <div
                  key={`${flight.id}-${pilot.dashNumber}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',
                    backgroundColor: isCurrentUser
                      ? highlightBg
                      : 'transparent',
                    borderRadius: '6px',
                    marginBottom: index < sortedPilots.length - 1 ? '4px' : 0
                  }}
                >
                  {/* Dash number */}
                  <span style={{
                    width: '46px',
                    fontSize: '24px',
                    fontWeight: 600,
                    color: colors.textSecondary
                  }}>
                    {(pilot as any).dash_number || pilot.dashNumber}
                  </span>

                  {/* Board number */}
                  <span style={{
                    width: '62px',
                    fontSize: '24px',
                    fontWeight: 800,
                    color: accentColor,
                    fontFamily: 'monospace'
                  }}>
                    {pilot.boardNumber || '---'}
                  </span>

                  {/* Callsign */}
                  <span style={{
                    flex: 1,
                    fontSize: '24px',
                    fontWeight: isCurrentUser ? 600 : 400,
                    color: colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0
                  }}>
                    {pilot.callsign || '(Empty)'}
                  </span>

                  {/* MIDS A - from flight level */}
                  <span style={{
                    width: '52px',
                    fontSize: '22px',
                    fontWeight: 500,
                    color: colors.textSecondary,
                    textAlign: 'center'
                  }}>
                    {flight.midsA || '---'}
                  </span>

                  {/* MIDS B - from flight level */}
                  <span style={{
                    width: '52px',
                    fontSize: '22px',
                    fontWeight: 500,
                    color: colors.textSecondary,
                    textAlign: 'center'
                  }}>
                    {flight.midsB || '---'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        color: colors.textSecondary,
        fontSize: '24px'
      }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '12px' }} />
        Loading flight assignments...
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
        border: `1px solid ${colors.error}`,
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p style={{ color: colors.error, fontSize: '24px', margin: 0 }}>{error}</p>
      </div>
    );
  }

  // No missions
  if (missions.length === 0) {
    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: colors.textSecondary
      }}>
        <p style={{ fontSize: '24px', margin: '0 0 8px 0' }}>No missions available</p>
        <p style={{ fontSize: '18px', margin: 0 }}>Check back when a mission is being planned.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Flight assignments */}
      {selectedMission && (
        <>
          {selectedMission.flights.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: colors.textSecondary,
              backgroundColor: colors.backgroundSecondary,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`
            }}>
              No flights configured for this mission
            </div>
          ) : (() => {
            // Group flights by callsign root (first word, e.g. "DODGE", "HAWK", "STING")
            const groups: Record<string, Flight[]> = {};
            for (const flight of selectedMission.flights) {
              const root = flight.callsign.split(' ')[0].toUpperCase();
              if (!groups[root]) groups[root] = [];
              groups[root].push(flight);
            }

            // Sort each group by flight number
            for (const root of Object.keys(groups)) {
              groups[root].sort((a, b) => {
                const numA = parseInt(a.callsign.replace(/\D/g, '') || '0', 10);
                const numB = parseInt(b.callsign.replace(/\D/g, '') || '0', 10);
                return numA - numB;
              });
            }

            // Sort columns alphabetically by callsign root
            const sortedRoots = Object.keys(groups).sort();

            // Build callsign-root → squadron lookup
            const callsignToSquadron: Record<string, SquadronInfo | undefined> = {};
            for (const sq of squadrons) {
              for (const cs of sq.callsigns) {
                callsignToSquadron[cs.toUpperCase().trim()] = sq;
              }
            }

            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${sortedRoots.length}, 1fr)`,
                gap: '12px',
                alignItems: 'start'
              }}>
                {sortedRoots.map(root => {
                  const sq = callsignToSquadron[root];
                  const accentColor = sq?.primaryColor || colors.accent;
                  return (
                    <div key={root}>
                      {/* Squadron insignia header */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '16px',
                        paddingBottom: '12px',
                        borderBottom: `2px solid ${accentColor}`
                      }}>
                        {sq?.insignia_url ? (
                          <img
                            src={sq.insignia_url}
                            alt={sq.designation}
                            style={{
                              width: '80px',
                              height: '80px',
                              objectFit: 'contain'
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            backgroundColor: colors.border,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '28px',
                            color: colors.textSecondary
                          }}>
                            ✈
                          </div>
                        )}
                        {sq && (
                          <div style={{
                            fontSize: '20px',
                            fontWeight: 700,
                            color: accentColor,
                            textAlign: 'center',
                            letterSpacing: '1px'
                          }}>
                            {sq.designation}
                          </div>
                        )}
                      </div>

                      {/* Flights */}
                      {groups[root].map(flight => {
                        const pilots = selectedMission.pilot_assignments[flight.id] || [];
                        const isThisUserFlight = userFlight?.flight.id === flight.id;
                        const accentColor = sq?.primaryColor || colors.accent;
                        return renderFlightCard(flight, pilots, isThisUserFlight, accentColor);
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {/* Last updated indicator */}
      {lastUpdated && (
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '16px',
          color: colors.textSecondary
        }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default FlightAssignmentsKneeboard;
