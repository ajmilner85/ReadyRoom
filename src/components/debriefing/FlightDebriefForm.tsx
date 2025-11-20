import React, { useState, useEffect, useRef } from 'react';
import { Save, X, AlertCircle } from 'lucide-react';
import PerformanceCategories from './PerformanceCategories';
import KillTracker, { type KillCounts } from './KillTracker';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';
import { useAppSettings } from '../../context/AppSettingsContext';
import type { PerformanceRatingsFormState, PerformanceCategoryKey } from '../../types/DebriefingTypes';
import type { PilotAssignment } from '../../types/MissionTypes';
import { debriefingService } from '../../services/debriefingService';
import { killTrackingService } from '../../services/killTrackingService';
import { supabase } from '../../utils/supabaseClient';

interface FlightDebriefFormProps {
  missionId: string;
  missionDebriefId: string;
  flightId: string;
  flightName: string;
  squadronId: string;
  flightLeadPilotId: string;
  pilotAssignments: PilotAssignment[];
  userPilotId: string;
  existingDebrief?: any;
  missionFinalized?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Squadron {
  id: string;
  name: string;
  designation: string;
  insignia_url: string | null;
  tail_code: string | null;
  color_palette?: {
    primary?: string;
  } | null;
}

const FlightDebriefForm: React.FC<FlightDebriefFormProps> = ({
  missionId,
  missionDebriefId,
  flightId,
  flightName,
  squadronId,
  flightLeadPilotId,
  pilotAssignments,
  userPilotId,
  existingDebrief,
  missionFinalized = false,
  onClose,
  onSuccess
}) => {
  const { settings } = useAppSettings();
  const [pilots, setPilots] = useState<Array<{ id: string; callsign: string; boardNumber: number }>>([]);
  const [squadron, setSquadron] = useState<Squadron | null>(null);

  // Get flight lead dash number for display
  const flightLeadDashNumber = React.useMemo(() => {
    const flightLead = pilotAssignments.find(a => a.pilot_id === flightLeadPilotId);
    return flightLead?.dash_number || '1';
  }, [pilotAssignments, flightLeadPilotId]);

  // Get flight lead info for display
  const flightLeadInfo = React.useMemo(() => {
    const pilot = pilots.find(p => p.id === flightLeadPilotId);
    return pilot ? { boardNumber: pilot.boardNumber, callsign: pilot.callsign } : null;
  }, [pilots, flightLeadPilotId]);

  // Sort pilots by dash number for kill tracking display
  const sortedPilots = React.useMemo(() => {
    return [...pilots].sort((a, b) => {
      const dashA = pilotAssignments.find(pa => pa.pilot_id === a.id)?.dash_number || '99';
      const dashB = pilotAssignments.find(pa => pa.pilot_id === b.id)?.dash_number || '99';
      return parseInt(dashA) - parseInt(dashB);
    });
  }, [pilots, pilotAssignments]);

  // Get squadron primary color for callsign styling
  const getCallsignColor = () => {
    // When setting is disabled, use black
    if (!settings.displayPilotsWithSquadronColors) {
      return '#000000';
    }
    // Use squadron primary color from color_palette.primary if available, otherwise black
    return squadron?.color_palette?.primary || '#000000';
  };

  // Fetch squadron details
  useEffect(() => {
    const fetchSquadron = async () => {
      const { data, error } = await supabase
        .from('org_squadrons')
        .select('id, name, designation, insignia_url, tail_code, color_palette')
        .eq('id', squadronId)
        .single();

      if (!error && data) {
        setSquadron({
          ...data,
          color_palette: data.color_palette as { primary?: string } | null
        });
      }
    };

    fetchSquadron();
  }, [squadronId]);

  // Fetch pilot details for all flight members
  useEffect(() => {
    const fetchPilots = async () => {
      const pilotIds = pilotAssignments.map(a => a.pilot_id);
      const { data, error } = await supabase
        .from('pilots')
        .select('id, boardNumber, callsign')
        .in('id', pilotIds);

      if (error) {
        console.error('Failed to fetch pilots:', error);
        return;
      }

      setPilots(data?.map(p => ({
        id: p.id,
        boardNumber: p.boardNumber,
        callsign: p.callsign
      })) || []);
    };

    fetchPilots();
  }, [pilotAssignments]);
  const [ratings, setRatings] = useState<PerformanceRatingsFormState>({
    mission_planning: null,
    flight_discipline: null,
    formation_navigation: null,
    tactical_execution: null,
    situational_awareness: null,
    weapons_employment: null,
    survivability_safety: null,
    debrief_participation: null
  });

  const [comments, setComments] = useState<Record<string, string>>({});
  const [killCounts, setKillCounts] = useState<Record<string, KillCounts>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const isInitialLoad = useRef(true);

  // Initialize form data from existing debrief
  useEffect(() => {
    // Prevent change tracking during initial load
    isInitialLoad.current = true;
    console.log('[UNSAVED-CHANGES] Setting isInitialLoad to true');

    const loadData = async () => {
      if (existingDebrief) {
        if (existingDebrief.performance_ratings) {
          // Map database format to form format
          const dbRatings = existingDebrief.performance_ratings;
          setRatings({
            mission_planning: dbRatings.mission_planning?.rating === 'SAT' ? true : dbRatings.mission_planning?.rating === 'UNSAT' ? false : null,
            flight_discipline: dbRatings.flight_discipline?.rating === 'SAT' ? true : dbRatings.flight_discipline?.rating === 'UNSAT' ? false : null,
            formation_navigation: dbRatings.formation_navigation?.rating === 'SAT' ? true : dbRatings.formation_navigation?.rating === 'UNSAT' ? false : null,
            tactical_execution: dbRatings.tactical_execution?.rating === 'SAT' ? true : dbRatings.tactical_execution?.rating === 'UNSAT' ? false : null,
            situational_awareness: dbRatings.situational_awareness?.rating === 'SAT' ? true : dbRatings.situational_awareness?.rating === 'UNSAT' ? false : null,
            weapons_employment: dbRatings.weapons_employment?.rating === 'SAT' ? true : dbRatings.weapons_employment?.rating === 'UNSAT' ? false : null,
            survivability_safety: dbRatings.survivability_safety?.rating === 'SAT' ? true : dbRatings.survivability_safety?.rating === 'UNSAT' ? false : null,
            debrief_participation: dbRatings.debrief_participation?.rating === 'SAT' ? true : dbRatings.debrief_participation?.rating === 'UNSAT' ? false : null
          });

          // Load comments for each category
          const loadedComments: Record<string, string> = {};
          Object.keys(dbRatings).forEach((key) => {
            if (dbRatings[key]?.comments) {
              loadedComments[key] = dbRatings[key].comments;
            }
          });
          setComments(loadedComments);
        }

        // Load notes from key_lessons_learned field
        if (existingDebrief.key_lessons_learned) {
          setNotes(existingDebrief.key_lessons_learned);
        }
      }

      // Initialize kill counts for all flight members
      const initialKills: Record<string, KillCounts> = {};
      pilots.forEach((member) => {
        initialKills[member.id] = { a2a: 0, a2g: 0 };
      });
      setKillCounts(initialKills);

      // Load existing kill data if available (await this to complete before enabling change tracking)
      if (existingDebrief?.id) {
        await loadExistingKills(existingDebrief.id);
      }

      // Allow change tracking after ALL async loads complete
      console.log('[UNSAVED-CHANGES] Setting isInitialLoad to false');
      isInitialLoad.current = false;
    };

    loadData();
  }, [existingDebrief, pilots]);

  const loadExistingKills = async (debriefId: string) => {
    try {
      const kills = await killTrackingService.getKillsByFlight(debriefId);
      const killsMap: Record<string, KillCounts> = {};
      kills.forEach((kill) => {
        killsMap[kill.pilot_id] = {
          a2a: kill.air_to_air_kills || 0,
          a2g: kill.air_to_ground_kills || 0
        };
      });
      setKillCounts((prev) => ({ ...prev, ...killsMap }));
    } catch (err) {
      console.error('Failed to load existing kills:', err);
    }
  };

  const handleKillChange = (pilotId: string, kills: KillCounts) => {
    setKillCounts((prev) => ({
      ...prev,
      [pilotId]: kills
    }));
    setHasUnsavedChanges(true);
  };

  // Track changes to ratings, comments, and notes (only after initial load)
  useEffect(() => {
    console.log('[UNSAVED-CHANGES] Change tracking effect fired - isInitialLoad:', isInitialLoad.current);
    if (isInitialLoad.current) {
      console.log('[UNSAVED-CHANGES] Skipping change tracking (still loading)');
      return;
    }
    console.log('[UNSAVED-CHANGES] Setting hasUnsavedChanges to true');
    setHasUnsavedChanges(true);
  }, [ratings, comments, notes]);

  const handleClose = () => {
    console.log('[UNSAVED-CHANGES] handleClose called - hasUnsavedChanges:', hasUnsavedChanges, 'missionFinalized:', missionFinalized);
    if (hasUnsavedChanges && !missionFinalized) {
      console.log('[UNSAVED-CHANGES] Showing confirmation dialog');
      setShowCloseConfirmation(true);
    } else {
      console.log('[UNSAVED-CHANGES] Closing without confirmation');
      onClose();
    }
  };

  const confirmClose = () => {
    setShowCloseConfirmation(false);
    onClose();
  };

  const cancelClose = () => {
    setShowCloseConfirmation(false);
  };

  const validateForm = (): boolean => {
    // Check only the 8 actual performance categories are rated
    const requiredCategories: PerformanceCategoryKey[] = [
      'mission_planning',
      'flight_discipline',
      'formation_navigation',
      'tactical_execution',
      'situational_awareness',
      'weapons_employment',
      'survivability_safety',
      'debrief_participation'
    ];

    const allRated = requiredCategories.every((key) => ratings[key] !== null);
    if (!allRated) {
      setError('All performance categories must be rated SAT or UNSAT');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Map the ratings to the 8-category format expected by database
      const performanceRatings: any = {};
      const categories: PerformanceCategoryKey[] = [
        'mission_planning',
        'flight_discipline',
        'formation_navigation',
        'tactical_execution',
        'situational_awareness',
        'weapons_employment',
        'survivability_safety',
        'debrief_participation'
      ];

      categories.forEach(category => {
        if (ratings[category] !== null) {
          performanceRatings[category] = {
            rating: ratings[category] ? 'SAT' : 'UNSAT',
            comments: comments[category] || ''
          };
        }
      });

      const formData = {
        mission_debriefing_id: missionDebriefId,
        flight_id: flightId,
        callsign: flightName,
        squadron_id: squadronId,
        flight_lead_pilot_id: flightLeadPilotId,
        submitted_by_pilot_id: userPilotId,
        performance_ratings: performanceRatings,
        key_lessons_learned: notes.trim() || null
      };

      let debriefId: string;

      if (existingDebrief?.id) {
        // Update existing debrief
        const updated = await debriefingService.updateFlightDebrief(
          existingDebrief.id,
          formData as any
        );
        debriefId = updated.id;
      } else {
        // Create new debrief
        const created = await debriefingService.createFlightDebrief(formData);
        debriefId = created.id;
      }

      // Save kill counts
      await Promise.all(
        Object.entries(killCounts).map(([pilotId, kills]) =>
          killTrackingService.recordKills(debriefId, pilotId, missionId, kills.a2a, kills.a2g)
        )
      );

      setHasUnsavedChanges(false);
      onSuccess();
    } catch (err: any) {
      console.error('Failed to save debrief:', err);
      setError(err.message || 'Failed to save debrief');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1192px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #E2E8F0',
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
            position: 'relative'
          }}
        >
          {/* Squadron Info - Absolute positioned left */}
          <div style={{ position: 'absolute', left: '24px', top: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {squadron?.insignia_url && (
              <img
                src={squadron.insignia_url}
                alt={`${squadron.name} insignia`}
                style={{
                  width: '32px',
                  height: '32px',
                  objectFit: 'contain'
                }}
              />
            )}
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', marginBottom: '2px' }}>
                {squadron?.designation || ''}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 400, color: '#64748B' }}>
                {squadron?.name || ''}
              </div>
            </div>
          </div>

          {/* Flight Info - Centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#1E293B',
                margin: 0
              }}
            >
              {flightName} {flightLeadDashNumber}
            </h2>
            {flightLeadInfo && (
              <div style={{ fontSize: '16px', color: '#64748B' }}>
                {flightLeadInfo.boardNumber} {flightLeadInfo.callsign}
              </div>
            )}
          </div>

          {/* Close button - Absolute positioned right */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              right: '24px',
              top: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              backgroundColor: '#F1F5F9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B',
              flexShrink: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

          {/* Scrollable Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {/* Two-column layout */}
            <div style={{ display: 'flex', gap: '24px' }}>
              {/* Left Column - Mission Performance */}
              <div style={{ minWidth: '560px', maxWidth: '560px' }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '12px'
                  }}
                >
                  Mission Performance
                </div>
                <PerformanceCategories
                  ratings={ratings}
                  onChange={setRatings}
                  comments={comments}
                  onCommentsChange={setComments}
                  disabled={saving || missionFinalized}
                />
              </div>

              {/* Right Column - Kill Tracking and Notes */}
              <div style={{ minWidth: '560px', maxWidth: '560px', display: 'flex', flexDirection: 'column' }}>
                {/* Kill Tracking */}
                <div style={{ marginBottom: '24px', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#475569',
                      marginBottom: '12px'
                    }}
                  >
                    Kill Tracking
                  </div>
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      paddingTop: '12px',
                      paddingBottom: '12px',
                      paddingLeft: '2px',
                      paddingRight: '20px'
                    }}
                  >
                    {/* Header Row */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '0px',
                        marginBottom: '12px',
                        alignItems: 'center',
                        paddingLeft: '12px'
                      }}
                    >
                      <div style={{ width: '60px', marginRight: '4px' }} />
                      <div style={{ width: '200px' }} />
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#475569',
                        textAlign: 'center',
                        width: '102px',
                        marginLeft: '44px'
                      }}>
                        A2A
                      </div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#475569',
                        textAlign: 'center',
                        width: '102px',
                        marginLeft: '16px'
                      }}>
                        A2G
                      </div>
                    </div>

                    {/* Pilot Rows */}
                    {sortedPilots.map((pilot) => {
                      const dashNumber = pilotAssignments.find(pa => pa.pilot_id === pilot.id)?.dash_number || '1';
                      return (
                        <div
                          key={pilot.id}
                          style={{
                            display: 'flex',
                            gap: '0px',
                            alignItems: 'center',
                            marginBottom: '8px',
                            paddingLeft: '12px'
                          }}
                        >
                          <div style={{
                            width: '60px',
                            fontFamily: 'Inter',
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '14px',
                            textAlign: 'left',
                            color: '#64748B',
                            marginRight: '4px'
                          }}>
                            {flightName} {flightLeadDashNumber}-{dashNumber}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
                            <PilotIDBadgeSm
                              squadronTailCode={squadron?.tail_code ?? undefined}
                              boardNumber={pilot.boardNumber?.toString()}
                              squadronInsigniaUrl={squadron?.insignia_url ?? undefined}
                            />
                            <span style={{
                              fontSize: '16px',
                              fontWeight: 700,
                              color: getCallsignColor()
                            }}>
                              {pilot.callsign}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', width: '102px', marginLeft: '44px' }}>
                            <KillTracker
                              pilotId={pilot.id}
                              kills={killCounts[pilot.id] || { a2a: 0, a2g: 0 }}
                              onChange={handleKillChange}
                              disabled={saving || missionFinalized}
                              type="a2a"
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', width: '102px', marginLeft: '16px' }}>
                            <KillTracker
                              pilotId={pilot.id}
                              kills={killCounts[pilot.id] || { a2a: 0, a2g: 0 }}
                              onChange={handleKillChange}
                              disabled={saving || missionFinalized}
                              type="a2g"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#475569',
                      marginBottom: '8px',
                      flexShrink: 0
                    }}
                  >
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={saving || missionFinalized}
                    placeholder="Additional Notes Update Test"
                    style={{
                      width: '100%',
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      color: '#1E293B',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Fixed */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              flexShrink: 0,
              backgroundColor: '#FFFFFF'
            }}
          >
            {/* Error Alert */}
            {error && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '12px 16px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#991B1B',
                  fontSize: '14px'
                }}
              >
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleClose}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1
                }}
              >
                {missionFinalized ? 'Close' : 'Cancel'}
              </button>
              {!missionFinalized && (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#FFFFFF',
                    backgroundColor: '#3B82F6',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : existingDebrief ? 'Update Debrief' : 'Submit Debrief'}
                </button>
              )}
            </div>
          </div>
      </div>

      {/* Confirmation Dialog */}
      {showCloseConfirmation && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}
          onClick={cancelClose}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1E293B',
                margin: '0 0 12px 0'
              }}
            >
              Unsaved Changes
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: '#64748B',
                margin: '0 0 24px 0',
                lineHeight: '1.5'
              }}
            >
              You have unsaved changes. Are you sure you want to close? All changes will be lost.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelClose}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Keep Editing
              </button>
              <button
                onClick={confirmClose}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  backgroundColor: '#DC2626',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightDebriefForm;
