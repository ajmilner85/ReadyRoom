import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card } from '../card';
import QualificationBadge from '../QualificationBadge';
import { Filter } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';
import { supabase } from '../../../utils/supabaseClient';

interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[];
  selectedEvent: Event | null;
  assignedPilots?: Record<string, Pilot[]>;
  onAutoAssign?: (attendingPilotIds?: string[]) => void;
  onClearAssignments?: () => void;
  pilotQualifications?: Record<string, any[]>;
}

const QUALIFICATION_ORDER: QualificationType[] = [
  'Strike Lead',
  'Instructor Pilot',
  'LSO',
  'Flight Lead',
  'Section Lead',
  'CQ',
  'Night CQ',
  'Wingman'
];

const DISPLAY_ORDER = QUALIFICATION_ORDER.filter(qual => qual !== 'Wingman');

const mapQualificationNameToType = (name: string): QualificationType => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('strike lead')) return 'Strike Lead';
  if (lowerName.includes('instructor')) return 'Instructor Pilot';
  if (lowerName.includes('lso')) return 'LSO';
  if (lowerName.includes('flight lead')) return 'Flight Lead';
  if (lowerName.includes('section lead')) return 'Section Lead';
  if (lowerName.includes('carrier qual') || lowerName === 'cq') return 'CQ';
  if (lowerName.includes('night') && lowerName.includes('cq')) return 'Night CQ';
  return 'Wingman';
};

interface PilotEntryProps {
  pilot: Pilot;
  isAssigned?: boolean;
  currentFlightId?: string;
  pilotQualifications?: any[];
}

const PilotEntry: React.FC<PilotEntryProps> = ({ pilot, isAssigned = false, currentFlightId, pilotQualifications }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-${pilot.boardNumber}`,
    data: {
      type: 'Pilot',
      pilot,
      currentFlightId
    },
    disabled: false
  });
  
  const originalStyle = useRef<CSSStyleDeclaration | null>(null);
  
  useEffect(() => {
    if (isDragging) {
      const element = document.getElementById(`pilot-${pilot.boardNumber}`);
      if (element) {
        originalStyle.current = window.getComputedStyle(element);
        element.style.transform = 'none';
        element.style.transition = 'none';
        element.style.zIndex = '1';
        element.style.opacity = '0.4';
      }
    } else if (originalStyle.current) {
      const element = document.getElementById(`pilot-${pilot.boardNumber}`);
      if (element) {
        element.style.opacity = isAssigned ? '0.5' : '1';
        element.style.zIndex = '1';
      }
      originalStyle.current = null;
    }
  }, [isDragging, pilot.boardNumber, isAssigned]);

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
              type={pq.qualification.name}
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
      id={`pilot-${pilot.boardNumber}`}
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
  pilotQualifications = {}
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOnlyAttending, setShowOnlyAttending] = useState(false);
  const [selectedQualifications, setSelectedQualifications] = useState<QualificationType[]>([]);
  const [discordEventAttendance, setDiscordEventAttendance] = useState<any[]>([]);  // Fetch event attendance data using polling, matching the approach in EventAttendance.tsx
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    const fetchEventAttendance = async () => {
      if (!selectedEvent?.id) {
        setDiscordEventAttendance([]);
        return;
      }
      
      try {
        console.log(`Fetching attendance for event ${selectedEvent.id}`);
        
        // Use the same API endpoint as the EventAttendance component
        const response = await fetch(`http://localhost:3001/api/events/${selectedEvent.id}/attendance`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch attendance: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Fetched event attendance:', data);
        
        // Transform the attendance data to match the format we need for filtering
        // We'll create an array of objects with discord_id and response fields
        const attendanceRecords = [
          ...data.accepted.map((attendee: any) => ({ 
            discord_id: attendee.discord_id,
            response: 'accepted'
          })),
          ...data.tentative.map((attendee: any) => ({ 
            discord_id: attendee.discord_id, 
            response: 'tentative'
          })),
          ...data.declined.map((attendee: any) => ({ 
            discord_id: attendee.discord_id, 
            response: 'declined'
          }))
        ].filter(record => record.discord_id); // Filter out any without discord_id
        
        setDiscordEventAttendance(attendanceRecords);
      } catch (err) {
        console.error('Error fetching event attendance:', err);
        setDiscordEventAttendance([]);
      }
    };
    
    // Initial fetch
    fetchEventAttendance();
    
    // Set up polling at the same interval as EventAttendance
    if (selectedEvent?.id) {
      pollInterval = setInterval(fetchEventAttendance, 5000); // 5 seconds
      console.log('Set up attendance polling interval');
    }
    
    // Clean up interval when component unmounts or event changes
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        console.log('Cleaned up attendance polling interval');
      }
    };
  }, [selectedEvent?.id]); // Changed dependency to id instead of discordEventId

  const allQualifications = useMemo(() => {
    const qualSet = new Set<QualificationType>();
    
    Object.values(pilotQualifications).forEach(qualArray => {
      if (Array.isArray(qualArray)) {
        qualArray.forEach(qual => {
          if (qual.qualification && qual.qualification.name) {
            const mappedType = mapQualificationNameToType(qual.qualification.name);
            qualSet.add(mappedType);
          }
        });
      }
    });
    
    // Don't fall back to legacy qualifications
    
    return Array.from(qualSet).sort((a, b) => 
      QUALIFICATION_ORDER.indexOf(a) - QUALIFICATION_ORDER.indexOf(b)
    );
  }, [pilotQualifications]);

  const toggleQualification = (qual: QualificationType) => {
    setSelectedQualifications(prev => 
      prev.includes(qual) 
        ? prev.filter(q => q !== qual)
        : [...prev, qual]
    );
  };

  const hasDatabaseQualification = (pilotId: string, qualType: QualificationType) => {
    const pilotQuals = pilotQualifications[pilotId] || [];
    return pilotQuals.some(qual => {
      const mappedType = mapQualificationNameToType(qual.qualification?.name || '');
      return mappedType === qualType;
    });
  };
  const filteredPilots = useMemo(() => {
    let filtered = [...pilots];
    
    console.log('--- FILTERING PILOTS ---');
    console.log('Total pilots before filtering:', pilots.length);
    console.log('ShowOnlyAttending:', showOnlyAttending);
    console.log('Selected Event:', selectedEvent);
    console.log('Discord Event Attendance data count:', discordEventAttendance.length);
    
    if (pilots.length > 0) {
      console.log('Sample pilot structure:', Object.keys(pilots[0]));
      console.log('Sample pilot full object:', pilots[0]);
    }
    
    if (showOnlyAttending && selectedEvent) {
      console.log('Filtering by attendance...');
      
      if (selectedEvent.discordEventId && discordEventAttendance.length > 0) {
        console.log('Using fetched Discord Attendance Data');
          // Inspect the structure of the attendance record to understand the field names
        if (discordEventAttendance.length > 0) {
          console.log('First attendance record structure:', Object.keys(discordEventAttendance[0]));
          console.log('First attendance record full data:', discordEventAttendance[0]);
        }
        
        // Filter to get only accepted/tentative responses, checking all possible field names
        const attendingDiscordIds = discordEventAttendance
          .filter(record => {
            // Check all possible field names for the response status
            const responseValue = record.response || record.user_response || record.status;
            const isAttending = responseValue === 'accepted' || 
                             responseValue === 'tentative' ||
                             responseValue === 'yes' ||
                             responseValue === 'maybe';
            console.log(`Discord User ${record.discord_id || record.user_id} response: ${responseValue}, attending: ${isAttending}`);
            return isAttending;
          })
          .map(record => record.discord_id || record.user_id);
        
        console.log('Attending Discord IDs:', attendingDiscordIds);
        
        const beforeFilterCount = filtered.length;
        filtered = filtered.filter(pilot => {
          // Log all properties of each pilot to debug field names
          const pilotProps = Object.keys(pilot);
          const discordId = 
            pilot.discordId || 
            (pilot as any).discord_original_id ||
            (pilot as any).discord_id;
            
          const isAttending = discordId && attendingDiscordIds.includes(discordId);
          
          console.log(`Pilot ${pilot.callsign} (${pilot.boardNumber}): props=${pilotProps.join(',')}`);
          console.log(`Pilot ${pilot.callsign} discordId=${discordId}, isAttending=${isAttending}`);
          
          return isAttending;
        });
        
        console.log(`Filtered by Discord attendance: ${beforeFilterCount} -> ${filtered.length} pilots`);
      } else if (selectedEvent.attendance && 
                (selectedEvent.attendance.accepted?.length > 0 || 
                selectedEvent.attendance.tentative?.length > 0)) {
        // Fallback to the regular attendance format if available
        console.log('Using regular attendance data');
        
        const attendingBoardNumbers = [
          ...(selectedEvent.attendance.accepted || []),
          ...(selectedEvent.attendance.tentative || [])
        ]
        .filter(p => p.boardNumber)
        .map(p => p.boardNumber);
        
        console.log('Attending Board Numbers:', attendingBoardNumbers);
        
        const beforeFilterCount = filtered.length;
        filtered = filtered.filter(pilot => {
          const isAttending = attendingBoardNumbers.includes(pilot.boardNumber);
          console.log(`Pilot ${pilot.callsign} (${pilot.boardNumber}): isAttending=${isAttending}`);
          return isAttending;
        });
        console.log(`Filtered by regular attendance: ${beforeFilterCount} -> ${filtered.length} pilots`);
      } else {
        console.log('No attendance data available for filtering');
        // If filtering is on but no attendance data, show no pilots
        filtered = [];
      }
    }

    if (selectedQualifications.length > 0) {
      console.log('Filtering by qualifications:', selectedQualifications);
      
      const beforeFilterCount = filtered.length;
      filtered = filtered.filter(pilot => {
        // Only use database qualifications for filtering
        const pilotId = pilot.id || pilot.boardNumber;
        const hasQual = selectedQualifications.some(qualType => 
          hasDatabaseQualification(pilotId, qualType) || 
          hasDatabaseQualification(pilot.boardNumber, qualType)
        );
        
        console.log(`Pilot ${pilot.callsign} (${pilot.boardNumber}) has selected qualifications: ${hasQual}`);
        return hasQual;
      });
      console.log(`Filtered by qualifications: ${beforeFilterCount} -> ${filtered.length} pilots`);
    }

    console.log('Final filtered pilots count:', filtered.length);
    
    return filtered.sort((a, b) => {
      if (a.role && b.role) {
        return a.role.localeCompare(b.role);
      }
      
      if (a.role) return -1;
      if (b.role) return 1;
      
      return 0;
    });
  }, [pilots, selectedEvent, showOnlyAttending, selectedQualifications, pilotQualifications, hasDatabaseQualification, discordEventAttendance]);

  const groupedPilots = useMemo(() => {
    const result: Record<QualificationType, Pilot[]> = QUALIFICATION_ORDER.reduce((acc, qual) => {
      acc[qual] = [];
      return acc;
    }, {} as Record<QualificationType, Pilot[]>);
    
    filteredPilots.forEach(pilot => {
      let highestQual: QualificationType = 'Wingman';
      
      const pilotDbQuals = pilotQualifications[pilot.id] || pilotQualifications[pilot.boardNumber] || [];
      
      if (pilotDbQuals.length > 0) {
        const mappedTypes = pilotDbQuals.map(q => mapQualificationNameToType(q.qualification?.name || ''));
        
        for (const qual of QUALIFICATION_ORDER) {
          if (mappedTypes.includes(qual)) {
            highestQual = qual;
            break;
          }
        }
      }
      // Don't fall back to legacy qualifications, just use Wingman as default
      
      result[highestQual].push(pilot);
    });
    
    return result;
  }, [filteredPilots, pilotQualifications]);

  const isPilotAssignedToFlight = (pilot: Pilot): { isAssigned: boolean; flightId?: string } => {
    for (const [flightId, flightPilots] of Object.entries(assignedPilots)) {
      if (flightPilots.some(p => p.boardNumber === pilot.boardNumber)) {
        return { isAssigned: true, flightId };
      }
    }
    return { isAssigned: false };
  };

  useEffect(() => {
    const preventHorizontalScroll = (e: WheelEvent) => {
      if (document.body.classList.contains('dragging')) {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop += e.deltaY;
          e.preventDefault();
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('wheel', preventHorizontalScroll);
      
      return () => {
        container.removeEventListener('wheel', preventHorizontalScroll);
      };
    }
  }, []);

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
            </div>            <div style={{ position: 'relative', display: 'inline-block' }}>
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
              </button>              {showOnlyAttending && selectedEvent && (
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: '#2563EB',
                  color: 'white',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                }}>
                  {discordEventAttendance.length > 0
                    ? discordEventAttendance.filter(record => 
                        record.response === 'accepted' || record.response === 'tentative'
                      ).length
                    : (selectedEvent.attendance.accepted.length + selectedEvent.attendance.tentative.length)}
                </div>
              )}
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
          {[...DISPLAY_ORDER, 'Wingman' as QualificationType].map(qualification => {
            const qualPilots = groupedPilots[qualification] || [];
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
                    // Get qualifications for this specific pilot
                    const pilotId = pilot.id || pilot.boardNumber;
                    const pilotDbQuals = pilotQualifications[pilotId] || [];
                    
                    return (
                      <PilotEntry 
                        key={`${pilot.boardNumber}-${assignment.isAssigned ? 'assigned' : 'available'}`}
                        pilot={pilot} 
                        isAssigned={assignment.isAssigned}
                        currentFlightId={assignment.flightId}
                        pilotQualifications={pilotDbQuals}
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
          }}>            <button
              onClick={() => {
                // Pass attendance data to onAutoAssign if available
                if (onAutoAssign) {
                  // Get attending pilot IDs
                  let attendingPilotIds: string[] = [];
                  
                  if (selectedEvent && discordEventAttendance.length > 0) {
                    // Get attending Discord IDs from the fetched attendance data
                    attendingPilotIds = discordEventAttendance
                      .filter(record => {
                        const responseValue = record.response || record.user_response || record.status;
                        return responseValue === 'accepted' || responseValue === 'tentative' || 
                               responseValue === 'yes' || responseValue === 'maybe';
                      })
                      .map(record => record.discord_id || record.user_id);
                  } else if (selectedEvent?.attendance) {
                    // Fallback to the regular attendance format if available
                    const attendees = [
                      ...(selectedEvent.attendance.accepted || []),
                      ...(selectedEvent.attendance.tentative || [])
                    ].filter(p => p.discord_id);
                    
                    attendingPilotIds = attendees.map(a => a.discord_id as string);
                  }
                  
                  onAutoAssign(attendingPilotIds);
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