import React, { useState, useEffect, useRef } from 'react';
import { Card } from './card';
import QualificationBadge from './QualificationBadge';
import { Pilot, pilots } from '../../types/PilotTypes';

const RosterManagement: React.FC = () => {
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [hoveredPilot, setHoveredPilot] = useState<string | null>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const rosterContentRef = useRef<HTMLDivElement>(null);

  // Group pilots by status
  const groupedPilots = pilots.reduce((acc, pilot) => {
    const status = pilot.status;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  const statusOrder: Array<Pilot['status']> = ['Command', 'Staff', 'Cadre', 'Provisional', 'Inactive', 'Retired'];

  const renderQualificationBadges = (qualifications: Pilot['qualifications']) => {
    const qualTypes = qualifications.map(q => q.type);
    const uniqueQuals = Array.from(new Set(qualTypes));
    
    return uniqueQuals.map((type, index) => {
      const count = qualTypes.filter(t => t === type).length;
      return (
        <QualificationBadge 
          key={`${type}-${index}`} 
          type={type} 
          count={count > 1 ? count : undefined} 
        />
      );
    });
  };

  useEffect(() => {
    // Synchronize heights of both columns
    if (rosterListRef.current && pilotDetailsRef.current && rosterContentRef.current) {
      // Ensure both columns have the same height
      const rosterHeight = rosterListRef.current.clientHeight;
      pilotDetailsRef.current.style.height = `${rosterHeight}px`;
    }
  }, [selectedPilot]);

  const baseWidth = 663; // Width of roster list tile

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        boxSizing: 'border-box'
      }}
    >
      <div 
        style={{
          display: 'flex',
          gap: '20px',
          height: 'calc(100% - 40px)', // Subtract top and bottom padding
          position: 'relative',
          zIndex: 1,
          maxWidth: `${baseWidth * 3 + 20}px`,
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Left column - Squadron Roster List */}
        <div
          ref={rosterListRef}
          style={{
            width: `${baseWidth}px`,
            backgroundColor: '#FFFFFF',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden' // Contain the scrollbar
          }}
        >
          <div 
            ref={rosterContentRef}
            style={{
              flex: 1,
              overflowY: 'auto', // Enable vertical scrolling
              padding: '10px 10px 0 10px', // Reduced bottom padding
              paddingRight: '20px', // Make room for scrollbar
            }}
          >
            {statusOrder.map(status => {
              const statusPilots = groupedPilots[status];
              if (!statusPilots?.length) return null;

              return (
                <div key={status}>
                  {/* Status group divider */}
                  <div 
                    style={{
                      position: 'relative',
                      textAlign: 'center',
                      margin: '20px 0'
                    }}
                  >
                    <div 
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: '1px',
                        backgroundColor: '#E2E8F0'
                      }}
                    />
                    <span 
                      style={{
                        position: 'relative',
                        backgroundColor: '#FFFFFF',
                        padding: '0 16px',
                        color: '#646F7E',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 300,
                        textTransform: 'uppercase'
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {statusPilots.map(pilot => (
                    <div
                      key={pilot.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '24px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        backgroundColor: 
                          selectedPilot?.id === pilot.id ? '#EFF6FF' : 
                          hoveredPilot === pilot.id ? 'rgba(100, 116, 139, 0.1)' : 
                          'transparent',
                        transition: 'background-color 0.2s ease',
                        borderRadius: '8px',
                        padding: '0 10px'
                      }}
                      onClick={() => setSelectedPilot(pilot)}
                      onMouseEnter={() => setHoveredPilot(pilot.id)}
                      onMouseLeave={() => setHoveredPilot(null)}
                    >
                      <span style={{
                        width: '62px',
                        textAlign: 'center',
                        fontSize: '16px',
                        fontWeight: 400,
                        color: '#646F7E'
                      }}>
                        {pilot.boardNumber}
                      </span>
                      <span style={{
                        width: '120px',
                        fontSize: '16px',
                        fontWeight: 700
                      }}>
                        {pilot.callsign}
                      </span>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: 300,
                        color: '#646F7E'
                      }}>
                        {pilot.billet}
                      </span>
                      
                      {/* Qualification badges */}
                      <div style={{
                        display: 'flex',
                        gap: '4px',
                        marginLeft: 'auto',
                        height: '24px'
                      }}>
                        {renderQualificationBadges(pilot.qualifications)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column - Pilot Details */}
        <div
          ref={pilotDetailsRef}
          style={{
            width: `${baseWidth * 2}px`,
            backgroundColor: '#FFFFFF',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflowY: 'auto' // Add scrollbar if content overflows
          }}
        >
          {selectedPilot ? (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#0F172A'
                }}>
                  {selectedPilot.callsign}
                </h1>
                <div style={{
                  fontSize: '18px',
                  color: '#64748B'
                }}>
                  Board #{selectedPilot.boardNumber}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '24px' }}>
                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-2">Squadron Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-slate-500">Status</div>
                      <div className="font-medium">{selectedPilot.status}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">Billet</div>
                      <div className="font-medium">{selectedPilot.billet}</div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-2">Qualifications</h2>
                  {selectedPilot.qualifications.length > 0 ? (
                    <div className="space-y-2">
                      {selectedPilot.qualifications.map(qual => (
                        <div key={qual.id} className="flex justify-between items-center">
                          <span className="font-medium">{qual.type}</span>
                          <span className="text-sm text-slate-500">
                            {new Date(qual.dateAchieved).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500">No qualifications</div>
                  )}
                </Card>

                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-2">Contact Information</h2>
                  <div>
                    <div className="text-sm text-slate-500">Discord</div>
                    <div className="font-medium">{selectedPilot.discordUsername}</div>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B'
            }}>
              Select a pilot to view their details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RosterManagement;