import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card } from '../card';
import QualificationBadge from '../QualificationBadge';
import { Filter } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';

// Define the structure for the polled attendance data (matching MissionPreparation)
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
}

interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[];
  selectedEvent: Event | null;
  assignedPilots?: Record<string, any>;
  onAutoAssign: (attendingPilotInfo?: { id: string; status: 'accepted' | 'tentative' }[]) => void;
  onClearAssignments: () => void;
  pilotQualifications?: Record<string, any[]>;
  realtimeAttendanceData: RealtimeAttendanceRecord[];
}

const QUALIFICATION_ORDER: QualificationType[] = [
  'FAC(A)', 'TL', '4FL', '2FL', 'WQ', 'T/O', 'NATOPS', 'DFL', 'DTL'
]; // These should now match the updated QualificationType


interface PilotEntryProps {
  pilot: Pilot & { attendanceStatus?: 'accepted' | 'tentative' };
  isAssigned?: boolean;
  currentFlightId?: string;
  pilotQualifications?: any[];
}

const PilotEntry: React.FC<PilotEntryProps> = ({ pilot, isAssigned = false, currentFlightId, pilotQualifications }) => {  
  // Make sure we explicitly include attendanceStatus in drag data
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-${pilot.id || pilot.boardNumber}`,
    data: {
      type: 'Pilot',
      pilot: {
        ...pilot,
        // Explicitly ensure attendanceStatus is included
        attendanceStatus: pilot.attendanceStatus
      },
      currentFlightId
    },
    disabled: isAssigned
  });
  
  const originalStyle = useRef<CSSStyleDeclaration | null>(null);
  
  useEffect(() => {
    if (isDragging) {
      const element = document.getElementById(`pilot-${pilot.id || pilot.boardNumber}`);
      if (element) {
        originalStyle.current = window.getComputedStyle(element);
        element.style.transform = 'none';
        element.style.transition = 'none';
        element.style.zIndex = '1';
        element.style.opacity = '0.4';
      }
    } else if (originalStyle.current) {
      const element = document.getElementById(`pilot-${pilot.id || pilot.boardNumber}`);
      if (element) {
        element.style.opacity = isAssigned ? '0.5' : '1';
        element.style.zIndex = '1';
      }
      originalStyle.current = null;
    }
  }, [isDragging, pilot.id, pilot.boardNumber, isAssigned]);

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '24px',
    marginBottom: '10px',
    transition: 'background-color 0.2s ease, opacity 0.2s ease',
    borderRadius: '8px',
    padding: '0 10px',
    cursor: isAssigned ? 'default' : 'grab',
    position: 'relative',
    left: 0,
    width: 'calc(100% - 20px)',
    zIndex: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    opacity: isAssigned ? 0.5 : 1,
  };

  const renderQualificationBadges = () => {
    const dbQualifications = pilotQualifications || [];
    
    if (dbQualifications && dbQualifications.length > 0) {
      return dbQualifications.map((pq, index) => {
        if (pq.qualification) {
          return (
            <QualificationBadge 
              key={`db-${pq.qualification.id}-${index}`}
              type={pq.qualification.name as QualificationType}
              code={pq.qualification.code}
              color={pq.qualification.color}
            />
          );
        }
        return null;
      }).filter(badge => badge !== null);
    }
    
    return [];
  };

  return (
    <div
      id={`pilot-${pilot.id || pilot.boardNumber}`}
      ref={setNodeRef}
      style={style}
      {...(isAssigned ? {} : { ...listeners, ...attributes })}
      data-dragging={isDragging ? 'true' : 'false'}
      data-assigned={isAssigned ? 'true' : 'false'}
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: '120px',
        gap: '4px'
      }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {pilot.callsign}
        </span>
        {pilot.attendanceStatus === 'tentative' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#5865F2', // Blurple color
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            flexShrink: 0
          }}>
            ?
          </div>
        )}
      </div>
      <span style={{
        fontSize: '16px',
        fontWeight: 300,
        color: '#646F7E'
      }}>
        {pilot.billet}
      </span>
      
      <div style={{
        display: 'flex',
        gap: '4px',
        marginLeft: 'auto',
        height: '24px'
      }}>
        {renderQualificationBadges()}
      </div>
    </div>
  );
};


const AvailablePilots: React.FC<AvailablePilotsProps> = ({
  width,
  pilots,
  selectedEvent,
  assignedPilots = {},
  onAutoAssign,
  onClearAssignments,
  pilotQualifications = {},
  realtimeAttendanceData
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOnlyAttending, setShowOnlyAttending] = useState(false);
  const [selectedQualifications, setSelectedQualifications] = useState<QualificationType[]>([]);

  // Simplified allQualifications derivation, assuming mapQualificationNameToType is not needed if types match
   const allQualifications = useMemo(() => {
    const qualSet = new Set<QualificationType>();
    Object.values(pilotQualifications).forEach(qualArray => {
      if (Array.isArray(qualArray)) {
        qualArray.forEach(qual => {
          if (qual.qualification && qual.qualification.name) {
            // Directly use the name if it's a valid QualificationType
            const qualName = qual.qualification.name as QualificationType;
             // Check if it's one of the defined types before adding
            if ([...QUALIFICATION_ORDER, 'Wingman', 'Strike Lead', 'Instructor Pilot', 'LSO', 'Flight Lead', 'Section Lead', 'CQ', 'Night CQ'].includes(qualName)) {
               qualSet.add(qualName);
            }
          }
        });
      }
    });
    // Ensure QUALIFICATION_ORDER items are prioritized, then add others
    const orderedQuals = QUALIFICATION_ORDER.filter(q => qualSet.has(q));
    const otherQuals = Array.from(qualSet).filter(q => !QUALIFICATION_ORDER.includes(q));
    // Add Wingman if present, ensuring it's last unless it's the only one
    const wingmanPresent = qualSet.has('Wingman');
    const finalQuals = [...orderedQuals, ...otherQuals.filter(q => q !== 'Wingman')];
    if (wingmanPresent) finalQuals.push('Wingman');

    return finalQuals;
  }, [pilotQualifications]);


  const toggleQualification = (qual: QualificationType) => {
    setSelectedQualifications(prev =>
      prev.includes(qual)
        ? prev.filter(q => q !== qual)
        : [...prev, qual]
    );
  };
  const hasDatabaseQualification = (pilotIdOrBoardNumber: string, qualType: QualificationType) => {
    const pilotQuals = pilotQualifications[pilotIdOrBoardNumber] || [];
    return pilotQuals.some(qual => {
      const mappedType = qual.qualification?.name as QualificationType;
      return mappedType === qualType;
    });
  };

  const pilotsWithAttendanceStatus = useMemo(() => {
    if (!selectedEvent || !realtimeAttendanceData || realtimeAttendanceData.length === 0) {
      // If no event or no realtime data, return pilots without status updates
      return pilots.map(p => ({ ...p, attendanceStatus: undefined }));
    }
    return pilots.map(pilot => {
      const pilotCopy = { ...pilot, attendanceStatus: undefined as ('accepted' | 'tentative' | undefined) };
      const discordId = pilotCopy.discordId || (pilotCopy as any).discord_original_id || (pilotCopy as any).discord_id;
      if (discordId) {
        const attendanceRecord = realtimeAttendanceData.find(record => record.discord_id === discordId);
        if (attendanceRecord) {
          if (attendanceRecord.response === 'tentative') pilotCopy.attendanceStatus = 'tentative';
          else if (attendanceRecord.response === 'accepted') pilotCopy.attendanceStatus = 'accepted';
        }
      }
      return pilotCopy;
    });
  }, [pilots, selectedEvent, realtimeAttendanceData]);

  const filteredPilots = useMemo(() => {
    let filtered = [...pilotsWithAttendanceStatus];
    if (showOnlyAttending && selectedEvent) {
      if (realtimeAttendanceData.length > 0) {
        const attendingDiscordIds = realtimeAttendanceData
          .filter(record => record.response === 'accepted' || record.response === 'tentative')
          .map(record => record.discord_id);
        filtered = filtered.filter(pilot => {
          const discordId = pilot.discordId || (pilot as any).discord_original_id || (pilot as any).discord_id;
          return discordId && attendingDiscordIds.includes(discordId);
        });
      } else {
        filtered = [];
      }
    }
    if (selectedQualifications.length > 0) {
      filtered = filtered.filter(pilot => {
        const pilotIdKey = pilot.id || pilot.boardNumber;
        const hasQual = selectedQualifications.some(qualType => hasDatabaseQualification(pilotIdKey, qualType));
        return hasQual;
      });
    }
    return filtered.sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''));
  }, [pilotsWithAttendanceStatus, selectedEvent, showOnlyAttending, selectedQualifications, pilotQualifications, hasDatabaseQualification, realtimeAttendanceData]);


  const isPilotAssignedToFlight = (pilot: Pilot): { isAssigned: boolean; flightId?: string } => {
    if (!assignedPilots) return { isAssigned: false };
    for (const flightId in assignedPilots) {
      const flightPilots = assignedPilots[flightId];
      if (flightPilots.some((p: any) => (p.id && p.id === pilot.id) || p.boardNumber === pilot.boardNumber)) {
        return { isAssigned: true, flightId: flightId };
      }
    }
    return { isAssigned: false };
  };

  const groupedPilots = useMemo(() => {
    const result: Record<string, Pilot[]> = {}; // Use string index signature

    // Create the order ensuring Wingman is at the end if present
    const groupOrder = [...allQualifications];
    if (groupOrder.includes('Wingman')) {
      // Remove Wingman from its current position
      const wingmanIndex = groupOrder.indexOf('Wingman');
      groupOrder.splice(wingmanIndex, 1);
      // Add it to the end
      groupOrder.push('Wingman');
    }
    
    // Initialize groups based on our order
    groupOrder.forEach(qual => { result[qual] = []; });
    
    filteredPilots.forEach(pilot => {
      let highestQual: QualificationType = 'Wingman';
      const pilotIdKey = pilot.id || pilot.boardNumber;
      const pilotDbQuals = pilotQualifications[pilotIdKey] || [];

      if (pilotDbQuals.length > 0) {
        const mappedTypes = pilotDbQuals
          .filter(q => q.qualification && q.qualification.name)
          .map(q => q.qualification.name as QualificationType);
        
        for (const qual of groupOrder) {
          if (mappedTypes.includes(qual)) {
            highestQual = qual;
            break;
          }
        }
      }

      // Add pilot to the determined group (ensure group exists)
      if (!result[highestQual]) { result[highestQual] = []; }
      result[highestQual].push(pilot);
    });
    
    return { groups: result, order: groupOrder }; // Return both groups and the order
  }, [filteredPilots, pilotQualifications, allQualifications]);


    // Set up some style attributes for drag operations
  useEffect(() => {
    const originalOverflow = document.body.style.overflowX;
    
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .pilots-container, 
      .pilots-container * {
        overflow-x: hidden !important;
        max-width: ${width};
        scrollbar-width: thin;
      }
      
      .pilots-scroll-container {
        overflow-y: auto;
        overflow-x: hidden !important;
        scrollbar-width: thin;
        width: 100%;
        contain: strict;
        scrollbar-gutter: stable;
      }
      
      .qualification-group {
        overflow-x: hidden !important;
        width: 100%;
        position: relative;
      }
      
      body.dragging .pilots-scroll-container {
        overflow-x: hidden !important;
        transform: translateZ(0);
        will-change: transform;
      }
      
      [data-dragging="true"] {
        pointer-events: auto !important;
        z-index: 9999 !important;
      }
    `;
    document.head.appendChild(styleElement);
    
    const handleDragStart = () => {
      document.body.style.overflowX = 'hidden';
      
      const containers = document.querySelectorAll('.pilots-scroll-container, .qualification-group');
      containers.forEach(container => {
        if (container instanceof HTMLElement) {
          container.style.overflowX = 'hidden';
          container.style.maxWidth = width;
        }
      });
    };
    
    const handleDragEnd = () => {
      document.body.style.overflowX = originalOverflow;
    };
    
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);
    
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
      document.body.style.overflowX = originalOverflow;
      document.head.removeChild(styleElement);
    };
  }, [width, assignedPilots]);

  return (
    <div className="pilots-container" style={{ 
      width,
      maxWidth: width,
      overflow: 'visible',
      position: 'relative',
      padding: '10px',
      margin: '-10px',
      height: '100%'
    }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'visible',
          boxSizing: 'border-box'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={{
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textTransform: 'uppercase'
          }}>
            Available Pilots
          </span>
        </div>

        <div className="mb-4">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flex: 1
            }}>
              {allQualifications.map(qual => (
                <button
                  key={qual}
                  onClick={() => toggleQualification(qual)}
                  style={{
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: selectedQualifications.length === 0 || selectedQualifications.includes(qual) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  <QualificationBadge type={qual} />
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setShowOnlyAttending(!showOnlyAttending)}
                disabled={!selectedEvent}
                title={selectedEvent 
                  ? (showOnlyAttending 
                    ? "Show all pilots" 
                    : "Show only pilots attending event") 
                  : "Select an event to filter by attendance"}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: selectedEvent ? 'pointer' : 'not-allowed',
                  background: showOnlyAttending ? '#EFF6FF' : 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: showOnlyAttending ? '1px solid #2563EB' : '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: showOnlyAttending ? '#2563EB' : selectedEvent ? '#64748B' : '#A1A1AA',
                  opacity: selectedEvent ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (selectedEvent) {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedEvent) {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }
                }}
              >
                <Filter size={16} />
              </button>
            </div>
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          className="pilots-scroll-container" 
          style={{ 
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            width: '100%',
            position: 'relative',
            padding: '0 10px',
            boxSizing: 'border-box',
            margin: '0 -10px'
          }}
        >
          {groupedPilots.order.map(qualification => {
            const qualPilots = groupedPilots.groups[qualification] || [];
            if (qualPilots.length === 0) return null;

            return (
              <div key={qualification} className="qualification-group" style={{ 
                width: '100%',
                overflowX: 'hidden',
                position: 'relative'
              }}>
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
                    {qualification}
                  </span>
                </div>

                <div style={{ 
                  width: '100%', 
                  position: 'relative', 
                  overflowX: 'hidden' 
                }}>
                  {qualPilots.map(pilot => {
                    const assignment = isPilotAssignedToFlight(pilot);
                    const pilotIdKey = pilot.id || pilot.boardNumber;
                    const specificPilotQuals = pilotQualifications[pilotIdKey] || [];
                    
                    return (
                      <PilotEntry 
                        key={pilot.id || pilot.boardNumber}
                        pilot={pilot} 
                        isAssigned={assignment.isAssigned}
                        currentFlightId={assignment.flightId}
                        pilotQualifications={specificPilotQuals}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 'auto',
          width: '100%',
        }}>
          <div style={{
            borderTop: '1px solid #E2E8F0',
            marginTop: '16px',
            marginBottom: '16px',
            width: '100%'
          }}></div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            padding: '0 16px'
          }}>
            <button
              onClick={() => {
                if (onAutoAssign) {
                  // Pass attendance data to onAutoAssign
                  const attendingPilotInfo = pilotsWithAttendanceStatus
                    .filter(pilot => pilot.attendanceStatus === 'accepted' || pilot.attendanceStatus === 'tentative')
                    .map(pilot => ({
                      id: pilot.id || pilot.discordId || (pilot as any).discord_original_id || pilot.boardNumber,
                      status: pilot.attendanceStatus as 'accepted' | 'tentative'
                    }))
                    .filter(info => info.id && info.status);
                  onAutoAssign(attendingPilotInfo);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 400,
                flex: '0 0 40%',
                margin: '0 8px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
                <line x1="14" y1="15" x2="20" y2="9" />
                <path d="M9 15h4.5c.28 0 .5-.22.5-.5v-4c0-.28-.22-.5-.5-.5H9" />
                <line x1="5" y1="9" x2="5" y2="15" />
              </svg>
              Auto Assign
            </button>
            <button
              onClick={onClearAssignments}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 400,
                flex: '0 0 40%',
                margin: '0 8px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear Assignments
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AvailablePilots;