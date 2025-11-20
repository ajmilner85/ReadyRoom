import React from 'react';
import { Card } from '../ui/card';
import type { FlightDebrief } from '../../types/DebriefingTypes';
import type { PilotAssignment } from '../../types/MissionTypes';

interface FlightInfo {
  flightId: string;
  callsign: string;
  squadronId: string;
  flightLeadPilotId: string;
  flightLeadBoardNumber: string;
  flightLeadCallsign: string;
  pilotAssignments: PilotAssignment[];
}

interface FlightListItemProps {
  flight: FlightInfo;
  debrief?: FlightDebrief | null;
  canSubmit: boolean;
  pilotKills?: Array<{
    air_to_air_kills: number;
    air_to_ground_kills: number;
  }>;
  onSubmitAAR: () => void;
  dashNumber?: string;
  compact?: boolean;
  missionFinalized?: boolean;
}

const FlightListItem: React.FC<FlightListItemProps> = ({
  flight,
  debrief,
  canSubmit,
  pilotKills,
  onSubmitAAR,
  dashNumber,
  compact = false,
  missionFinalized = false
}) => {
  // Get flight lead dash number
  const flightLeadDashNumber = dashNumber || React.useMemo(() => {
    const flightLead = flight.pilotAssignments.find(
      (a: PilotAssignment) => a.pilot_id === flight.flightLeadPilotId
    );
    return flightLead?.dash_number || '1';
  }, [flight.pilotAssignments, flight.flightLeadPilotId]);

  // Calculate performance summary if debrief exists
  const getPerformanceSummary = () => {
    if (!debrief?.performance_ratings) return null;

    const ratings = Object.values(debrief.performance_ratings);
    const satCount = ratings.filter(r => r.rating === 'SAT').length;
    const totalCount = ratings.length;
    const percentage = totalCount > 0 ? Math.round((satCount / totalCount) * 100) : 0;

    return { satCount, totalCount, percentage };
  };

  // Calculate total kills
  const getTotalKills = () => {
    if (!pilotKills || pilotKills.length === 0) return { a2a: 0, a2g: 0 };

    return pilotKills.reduce(
      (acc, kill) => ({
        a2a: acc.a2a + kill.air_to_air_kills,
        a2g: acc.a2g + kill.air_to_ground_kills
      }),
      { a2a: 0, a2g: 0 }
    );
  };

  const performanceSummary = getPerformanceSummary();
  const totalKills = getTotalKills();

  // Compact mode for grid layout
  if (compact) {
    return (
      <div
        style={{
          padding: '12px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {/* Flight callsign */}
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#1E293B'
          }}
        >
          {flight.callsign} {flightLeadDashNumber}
        </div>

        {/* Flight Lead */}
        <div
          style={{
            fontSize: '12px',
            color: '#64748B'
          }}
        >
          {flight.flightLeadBoardNumber} {flight.flightLeadCallsign}
        </div>

        {/* AAR Status */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {debrief ? (
            <button
              onClick={onSubmitAAR}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: missionFinalized ? '#047857' : '#0369A1',
                backgroundColor: missionFinalized ? '#DCFCE7' : '#E0F2FE',
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: missionFinalized ? 'default' : 'pointer'
              }}
            >
              {missionFinalized ? 'AAR SUBMITTED' : 'VIEW/EDIT AAR'}
            </button>
          ) : canSubmit ? (
            <button
              onClick={onSubmitAAR}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#FFFFFF',
                backgroundColor: '#F59E0B',
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Pending AAR
            </button>
          ) : (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#64748B',
                backgroundColor: '#F1F5F9',
                padding: '4px 8px',
                borderRadius: '4px'
              }}
            >
              PENDING AAR
            </span>
          )}
        </div>
      </div>
    );
  }

  // Full mode (original)
  return (
    <Card>
      <div style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          {/* Flight Info */}
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1E293B',
                marginBottom: '6px'
              }}
            >
              {flight.callsign} {flightLeadDashNumber}
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '0' }}>
              {flight.flightLeadBoardNumber} {flight.flightLeadCallsign}
            </p>
          </div>

          {/* Status/Action Area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {debrief ? (
              <>
                {/* Show performance summary if AAR was submitted */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px 20px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0'
                  }}
                >
                {/* Performance */}
                {performanceSummary && (
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '4px'
                      }}
                    >
                      Performance
                    </div>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color:
                          performanceSummary.percentage >= 80
                            ? '#059669'
                            : performanceSummary.percentage >= 60
                            ? '#D97706'
                            : '#DC2626'
                      }}
                    >
                      {performanceSummary.satCount}/{performanceSummary.totalCount} (
                      {performanceSummary.percentage}%)
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div
                  style={{
                    width: '1px',
                    height: '40px',
                    backgroundColor: '#E2E8F0'
                  }}
                />

                {/* A2A Kills */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#64748B',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}
                  >
                    A2A Kills
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1E293B'
                    }}
                  >
                    {totalKills.a2a}
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    width: '1px',
                    height: '40px',
                    backgroundColor: '#E2E8F0'
                  }}
                />

                {/* A2G Kills */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#64748B',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}
                  >
                    A2G Kills
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1E293B'
                    }}
                  >
                    {totalKills.a2g}
                  </div>
                </div>
              </div>

              {/* View/Edit button */}
              {!missionFinalized && (
                <button
                  onClick={onSubmitAAR}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#FFFFFF',
                    backgroundColor: '#0EA5E9',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0284C7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0EA5E9';
                  }}
                >
                  View/Edit AAR
                </button>
              )}
              </>
            ) : canSubmit ? (
              // Show Submit AAR button if permitted
              <button
                onClick={onSubmitAAR}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  backgroundColor: '#3B82F6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3B82F6';
                }}
              >
                Submit AAR
              </button>
            ) : (
              // Show pending indicator for non-permitted users
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#D97706',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  borderRadius: '6px'
                }}
              >
                Pending AAR
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default FlightListItem;
