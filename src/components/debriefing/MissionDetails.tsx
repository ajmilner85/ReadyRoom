import React, { useState, useRef, useEffect } from 'react';
import { missionDetailsStyles, squadronTileStyles } from '../../styles/DebriefingStyles';
import FlightListItem from './FlightListItem';
import FlightDebriefForm from './FlightDebriefForm';
import MissionSummaryWithPopups from './MissionSummaryWithPopups';
import type { PilotAssignment } from '../../types/MissionTypes';
import type { FlightDebrief } from '../../types/DebriefingTypes';
import type { Squadron } from '../../utils/squadronService';
import { ChevronDown } from 'lucide-react';
import { debriefingService } from '../../services/debriefingService';
import { killTrackingService } from '../../services/killTrackingService';

interface MissionListItem {
  id: string;
  name: string;
  scheduled_time: string;
  wing_id?: string;
  squadron_id?: string;
  mission_objectives?: any;
  mission_debriefings?: Array<{
    id: string;
    status: string;
    mission_outcome?: string | null;
    created_at: string;
    finalized_at?: string;
  }>;
}

interface FlightInfo {
  flightId: string;
  callsign: string;
  flightNumber: number;
  squadronId: string;
  flightLeadPilotId: string;
  flightLeadBoardNumber: string;
  flightLeadCallsign: string;
  pilotAssignments: PilotAssignment[];
}

interface MissionDetailsProps {
  selectedMission: MissionListItem | null;
  missionFlights: FlightInfo[];
  missionDebriefId: string | null;
  flightDebriefs: Map<string, FlightDebrief>;
  showDebriefForm: boolean;
  selectedFlight: FlightInfo | null;
  canSubmitAAR: (flight: FlightInfo) => boolean;
  aarOperationalOnly: boolean; // Filter to show only operational squadron flights
  onSubmitAAR: (flight: FlightInfo) => void;
  onCloseForm: () => void;
  onFormSuccess: () => void;
  userPilotId?: string;
  squadrons: Squadron[];
  onOutcomeUpdate?: () => void;
}

const MissionDetails: React.FC<MissionDetailsProps> = ({
  selectedMission,
  missionFlights,
  missionDebriefId,
  flightDebriefs,
  showDebriefForm,
  selectedFlight,
  canSubmitAAR,
  aarOperationalOnly,
  onSubmitAAR,
  onCloseForm,
  onFormSuccess,
  userPilotId,
  squadrons,
  onOutcomeUpdate
}) => {
  // All hooks must be called before any conditional returns
  const [outcomeDropdownOpen, setOutcomeDropdownOpen] = useState(false);
  const [updatingOutcome, setUpdatingOutcome] = useState(false);
  const [missionSummary, setMissionSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const outcomeDropdownRef = useRef<HTMLDivElement>(null);

  // Load mission summary when missionDebriefId changes
  useEffect(() => {
    const loadMissionSummary = async () => {
      if (!missionDebriefId) {
        setMissionSummary(null);
        return;
      }

      setLoadingSummary(true);
      try {
        const summary = await killTrackingService.getMissionSummary(missionDebriefId);
        setMissionSummary(summary);
      } catch (error) {
        console.error('Failed to load mission summary:', error);
      } finally {
        setLoadingSummary(false);
      }
    };

    loadMissionSummary();
  }, [missionDebriefId, flightDebriefs]); // Re-load when flight debriefs change

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (outcomeDropdownRef.current && !outcomeDropdownRef.current.contains(event.target as Node)) {
        setOutcomeDropdownOpen(false);
      }
    };

    if (outcomeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [outcomeDropdownOpen]);

  // Group flights by squadron - must be called before conditional return
  const flightsBySquadron = React.useMemo(() => {
    const grouped = new Map<string, FlightInfo[]>();

    missionFlights.forEach(flight => {
      if (!flight.squadronId) return;

      // Filter by squadron type if aarOperationalOnly is enabled
      if (aarOperationalOnly) {
        const squadron = squadrons.find(s => s.id === flight.squadronId);
        // Skip training squadrons when aarOperationalOnly is true
        if (squadron?.squadron_type === 'training') {
          return;
        }
      }

      if (!grouped.has(flight.squadronId)) {
        grouped.set(flight.squadronId, []);
      }
      grouped.get(flight.squadronId)!.push(flight);
    });

    return grouped;
  }, [missionFlights, aarOperationalOnly, squadrons]);

  if (!selectedMission) {
    return (
      <div style={missionDetailsStyles.container}>
        <div style={missionDetailsStyles.emptyState}>
          Select a mission from the list to view flight debriefs
        </div>
      </div>
    );
  }

  // mission_debriefings is an object, not an array
  const debriefing = Array.isArray(selectedMission.mission_debriefings)
    ? selectedMission.mission_debriefings[0]
    : selectedMission.mission_debriefings;

  const missionOutcome = debriefing?.mission_outcome || 'pending';
  const missionFinalized = debriefing?.finalized_at != null;

  const outcomeOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'success', label: 'Success' },
    { value: 'partial_success', label: 'Partial Success' },
    { value: 'failure', label: 'Failure' }
  ];

  return (
    <div style={missionDetailsStyles.container}>
      {/* Mission Header */}
      <div style={missionDetailsStyles.header}>
        <div style={{ flex: 1 }}>
          <h2 style={missionDetailsStyles.missionName}>
            {selectedMission.name}
          </h2>
          <p style={missionDetailsStyles.missionTime}>
            {new Date(selectedMission.scheduled_time).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>

        {/* Mission Outcome Selector */}
        <div style={{ minWidth: '200px', position: 'relative', marginRight: '16px' }} ref={outcomeDropdownRef}>
          <label style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: '#64748B',
            marginBottom: '6px'
          }}>
            Mission Outcome
          </label>
          <div
            onClick={() => setOutcomeDropdownOpen(!outcomeDropdownOpen)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              color: '#1E293B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'Inter',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}
          >
            <span>{outcomeOptions.find(o => o.value === missionOutcome)?.label || 'Pending'}</span>
            <ChevronDown size={16} style={{ color: '#64748B' }} />
          </div>

          {outcomeDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              width: '100%',
              marginTop: '4px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              maxHeight: '200px',
              overflowY: 'auto',
              boxSizing: 'border-box'
            }}>
              {outcomeOptions.map(option => (
                <div
                  key={option.value}
                  onClick={async () => {
                    if (missionDebriefId && !updatingOutcome) {
                      setUpdatingOutcome(true);
                      try {
                        await debriefingService.updateMissionOutcome(
                          missionDebriefId,
                          option.value as 'pending' | 'success' | 'partial_success' | 'failure'
                        );
                        setOutcomeDropdownOpen(false);
                        // Notify parent to refresh data
                        if (onOutcomeUpdate) {
                          onOutcomeUpdate();
                        }
                      } catch (error) {
                        console.error('Failed to update mission outcome:', error);
                      } finally {
                        setUpdatingOutcome(false);
                      }
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: updatingOutcome ? 'not-allowed' : 'pointer',
                    backgroundColor: missionOutcome === option.value ? '#EFF6FF' : 'transparent',
                    fontSize: '14px',
                    fontFamily: 'Inter',
                    transition: 'background-color 0.2s',
                    opacity: updatingOutcome ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (missionOutcome !== option.value) {
                      e.currentTarget.style.backgroundColor = '#F8FAFC';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (missionOutcome !== option.value) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {option.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mission Summary Section */}
      {!loadingSummary && missionSummary && missionDebriefId && (
        <MissionSummaryWithPopups
          missionDebriefId={missionDebriefId}
          summaryData={missionSummary}
        />
      )}

      {/* After Action Reports Section */}
      <h3 style={{
        fontSize: '20px',
        fontWeight: 300,
        color: '#646F7E',
        fontFamily: 'Inter',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '16px',
        textAlign: 'center'
      }}>
        After Action Reports
      </h3>

      {/* Squadron Tiles with Flights */}
      {flightsBySquadron.size > 0 ? (
        <div style={missionDetailsStyles.squadronsContainer}>
          {Array.from(flightsBySquadron.entries()).map(([squadronId, flights]) => {
            const squadron = squadrons.find(s => s.id === squadronId);
            const squadronName = squadron?.name || 'Unknown Squadron';

            return (
              <div key={squadronId} style={squadronTileStyles.container}>
                {/* Squadron Header */}
                <div style={squadronTileStyles.header}>
                  {squadron?.insignia_url && (
                    <img
                      src={squadron.insignia_url}
                      alt={`${squadronName} insignia`}
                      style={squadronTileStyles.insignia}
                    />
                  )}
                  <div>
                    <div style={squadronTileStyles.squadronDesignation}>
                      {squadron?.designation || 'Unknown'}
                    </div>
                    <div style={squadronTileStyles.squadronName}>
                      {squadronName}
                    </div>
                  </div>
                </div>

                {/* Flights in this squadron */}
                <div style={squadronTileStyles.flightsContainer}>
                  {flights.map((flight) => {
                    const debrief = flightDebriefs.get(flight.flightId);
                    const flightLeadDashNumber = flight.pilotAssignments.find(
                      a => a.pilot_id === flight.flightLeadPilotId
                    )?.dash_number || '1';

                    // Check permissions regardless of whether debrief exists
                    const hasPermission = canSubmitAAR(flight);

                    return (
                      <FlightListItem
                        key={flight.flightId}
                        flight={flight}
                        debrief={debrief || null}
                        canSubmit={hasPermission}
                        pilotKills={(debrief as any)?.pilot_kills}
                        onSubmitAAR={() => onSubmitAAR(flight)}
                        dashNumber={flightLeadDashNumber}
                        compact={true}
                        missionFinalized={missionFinalized}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: '#94A3B8',
            fontSize: '14px',
            backgroundColor: '#F8FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0'
          }}
        >
          No flights found for this mission.
        </div>
      )}

      {/* Debrief Form Modal */}
      {showDebriefForm && selectedFlight && missionDebriefId && userPilotId && selectedMission && (
        <FlightDebriefForm
          missionId={selectedMission.id}
          missionDebriefId={missionDebriefId}
          flightId={selectedFlight.flightId}
          flightName={`${selectedFlight.callsign} ${selectedFlight.flightNumber}`}
          squadronId={selectedFlight.squadronId}
          flightLeadPilotId={selectedFlight.flightLeadPilotId}
          pilotAssignments={selectedFlight.pilotAssignments}
          userPilotId={userPilotId}
          existingDebrief={flightDebriefs.get(selectedFlight.flightId)}
          missionFinalized={missionFinalized}
          onClose={onCloseForm}
          onSuccess={onFormSuccess}
        />
      )}
    </div>
  );
};

export default MissionDetails;
