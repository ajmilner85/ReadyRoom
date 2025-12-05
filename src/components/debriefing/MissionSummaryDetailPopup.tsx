import React from 'react';
import type { PilotDetail } from '../../services/missionSummaryDetailService';

interface MissionSummaryDetailPopupProps {
  type: 'pilot-status' | 'aircraft-status' | 'kills' | 'performance';
  title: string;
  pilots?: PilotDetail[];
  kills?: Array<{ unitTypeName: string; displayName: string; count: number }>;
  performanceCategories?: Array<{
    name: string;
    displayName: string;
    sats: number;
    unsats: number;
    unassessed: number;
  }>;
  position: { top: number; left: number };
  onClose: () => void;
}

const MissionSummaryDetailPopup: React.FC<MissionSummaryDetailPopupProps> = ({
  type,
  title,
  pilots = [],
  kills = [],
  performanceCategories = [],
  position,
  onClose
}) => {
  // Group pilots by squadron
  const pilotsBySquadron = React.useMemo(() => {
    const grouped = new Map<string, { squadron: any; pilots: PilotDetail[] }>();

    pilots.forEach(pilot => {
      const squadronId = pilot.squadron?.id || 'unassigned';
      if (!grouped.has(squadronId)) {
        grouped.set(squadronId, {
          squadron: pilot.squadron,
          pilots: []
        });
      }
      grouped.get(squadronId)!.pilots.push(pilot);
    });

    return Array.from(grouped.values());
  }, [pilots]);

  const renderPilotList = () => {
    if (pilots.length === 0) {
      return (
        <div style={{
          padding: '12px',
          color: '#94A3B8',
          fontSize: '13px',
          fontFamily: 'Inter',
          textAlign: 'center'
        }}>
          No pilots
        </div>
      );
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        padding: '0'
      }}>
        {pilotsBySquadron.map((group, index) => (
          <div key={index} style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            {/* Squadron header - matching Squadron AAR tiles */}
            {group.squadron && (
              <div style={{
                backgroundColor: '#F8FAFC',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid #E2E8F0'
              }}>
                {group.squadron.insignia_url && (
                  <img
                    src={group.squadron.insignia_url}
                    alt={group.squadron.designation}
                    style={{
                      width: '32px',
                      height: '32px',
                      objectFit: 'contain'
                    }}
                  />
                )}
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1E293B',
                    marginBottom: '2px',
                    fontFamily: 'Inter'
                  }}>
                    {group.squadron.designation}
                  </div>
                  {group.squadron.name && (
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 400,
                      color: '#64748B',
                      fontFamily: 'Inter'
                    }}>
                      {group.squadron.name}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pilot list - matching Flight card styling */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '12px',
              gap: '4px'
            }}>
              {group.pilots.map(pilot => (
                <div
                  key={pilot.id}
                  style={{
                    fontSize: '12px',
                    color: '#64748B',
                    fontFamily: 'Inter',
                    padding: '4px 0'
                  }}
                >
                  {pilot.boardNumber} {pilot.callsign}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderKillsList = () => {
    if (kills.length === 0) {
      return (
        <div style={{
          padding: '12px',
          color: '#94A3B8',
          fontSize: '13px',
          fontFamily: 'Inter',
          textAlign: 'center'
        }}>
          No kills
        </div>
      );
    }

    return (
      <div style={{ padding: '8px' }}>
        {kills.map((kill, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
              borderRadius: '4px',
              marginBottom: '4px'
            }}
          >
            <span style={{
              fontSize: '13px',
              color: '#1E293B',
              fontFamily: 'Inter'
            }}>
              {kill.displayName}
            </span>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#2563EB',
              fontFamily: 'Inter'
            }}>
              x{kill.count}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderPerformanceList = () => {
    if (performanceCategories.length === 0) {
      return (
        <div style={{
          padding: '12px',
          color: '#94A3B8',
          fontSize: '13px',
          fontFamily: 'Inter',
          textAlign: 'center'
        }}>
          No performance data
        </div>
      );
    }

    return (
      <div style={{ padding: '8px' }}>
        {performanceCategories.map((category, index) => (
          <div
            key={index}
            style={{
              padding: '12px',
              backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
              borderRadius: '4px',
              marginBottom: '8px'
            }}
          >
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginBottom: '8px'
            }}>
              {category.displayName}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '8px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '11px',
                  color: '#64748B',
                  fontFamily: 'Inter',
                  textTransform: 'uppercase'
                }}>
                  SAT
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#10B981',
                  fontFamily: 'Inter'
                }}>
                  {category.sats}
                </span>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '11px',
                  color: '#64748B',
                  fontFamily: 'Inter',
                  textTransform: 'uppercase'
                }}>
                  UNSAT
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#EF4444',
                  fontFamily: 'Inter'
                }}>
                  {category.unsats}
                </span>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '11px',
                  color: '#64748B',
                  fontFamily: 'Inter',
                  textTransform: 'uppercase'
                }}>
                  N/A
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#94A3B8',
                  fontFamily: 'Inter'
                }}>
                  {category.unassessed}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop to detect clicks outside */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999
        }}
      />

      {/* Popup */}
      <div
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          maxWidth: '400px',
          maxHeight: '500px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px',
          textAlign: 'center'
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: 300,
            color: '#646F7E',
            fontFamily: 'Inter',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {title}
          </h3>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px'
        }}>
          {type === 'pilot-status' || type === 'aircraft-status' ? renderPilotList() : null}
          {type === 'kills' ? renderKillsList() : null}
          {type === 'performance' ? renderPerformanceList() : null}
        </div>
      </div>
    </>
  );
};

export default MissionSummaryDetailPopup;
