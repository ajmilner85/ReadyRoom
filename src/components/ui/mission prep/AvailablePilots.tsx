import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card } from '../card';
import QualificationBadge from '../QualificationBadge';
import { Filter } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';

interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[];
  selectedEvent: Event | null;
  assignedPilots?: Record<string, Pilot[]>;
  onAutoAssign?: () => void;
  onClearAssignments?: () => void;
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

interface PilotEntryProps {
  pilot: Pilot;
  isAssigned?: boolean;
  currentFlightId?: string;
}

const PilotEntry: React.FC<PilotEntryProps> = ({ pilot, isAssigned = false, currentFlightId }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-${pilot.boardNumber}`,
    data: {
      type: 'Pilot',
      pilot,
      currentFlightId
    },
    disabled: false // Allow dragging even when assigned
  });
  
  // Keep track of original position
  const originalStyle = useRef<CSSStyleDeclaration | null>(null);
  
  // When dragging starts, store the original position but don't actually transform the element
  useEffect(() => {
    if (isDragging) {
      const element = document.getElementById(`pilot-${pilot.boardNumber}`);
      if (element) {
        // Store the original style
        originalStyle.current = window.getComputedStyle(element);
        
        // Ensure the element stays in its original position
        element.style.transform = 'none';
        element.style.transition = 'none';
        element.style.zIndex = '1';
        
        // Make element semi-transparent to indicate it's being dragged
        element.style.opacity = '0.4';
      }
    } else if (originalStyle.current) {
      // Reset the element style when dragging ends
      const element = document.getElementById(`pilot-${pilot.boardNumber}`);
      if (element) {
        element.style.opacity = isAssigned ? '0.5' : '1'; // Use the isAssigned prop to set opacity
        element.style.zIndex = '1';
      }
      originalStyle.current = null;
    }
  }, [isDragging, pilot.boardNumber, isAssigned]);

  // Style for the element - note we don't apply transform from DnD Kit
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
      
      {/* Qualification badges */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginLeft: 'auto',
        height: '24px'
      }}>
        {pilot.qualifications.map((qual, index) => (
          <QualificationBadge 
            key={`${qual.type}-${index}`} 
            type={qual.type}
          />
        ))}
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
  onClearAssignments
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOnlyAttending, setShowOnlyAttending] = useState(false);
  const [selectedQualifications, setSelectedQualifications] = useState<QualificationType[]>([]);

  // Get all unique qualifications from all pilots
  const allQualifications = useMemo(() => {
    const qualSet = new Set<QualificationType>();
    pilots.forEach(pilot => {
      pilot.qualifications.forEach(qual => {
        qualSet.add(qual.type);
      });
    });
    return Array.from(qualSet).sort((a, b) => 
      QUALIFICATION_ORDER.indexOf(a) - QUALIFICATION_ORDER.indexOf(b)
    );
  }, [pilots]);

  // Toggle qualification filter
  const toggleQualification = (qual: QualificationType) => {
    setSelectedQualifications(prev => 
      prev.includes(qual) 
        ? prev.filter(q => q !== qual)
        : [...prev, qual]
    );
  };

  // Filter pilots based on attendance and qualifications
  const filteredPilots = useMemo(() => {
    let filtered = [...pilots];

    // Filter by event attendance
    if (showOnlyAttending && selectedEvent) {
      const attendingBoardNumbers = [
        ...selectedEvent.attendance.accepted,
        ...selectedEvent.attendance.tentative
      ].map(p => p.boardNumber);
      filtered = filtered.filter(pilot => 
        attendingBoardNumbers.includes(pilot.boardNumber)
      );
    }

    // Filter by selected qualifications
    if (selectedQualifications.length > 0) {
      filtered = filtered.filter(pilot =>
        pilot.qualifications.some(qual => 
          selectedQualifications.includes(qual.type)
        )
      );
    }

    // Sort pilots with roles to the top, and by role.order if available
    return filtered.sort((a, b) => {
      // If both pilots have roles, sort by role order
      if (a.role && b.role) {
        // If we have access to role.order, we'd use it here, but we don't have it in this component
        // So we'll just sort alphabetically for now
        return a.role.localeCompare(b.role);
      }
      
      // Put pilots with roles at the top
      if (a.role) return -1;
      if (b.role) return 1;
      
      // Otherwise, keep existing sort (by qualification)
      return 0;
    });
  }, [pilots, selectedEvent, showOnlyAttending, selectedQualifications]);

  // Initialize groupedPilots with all possible qualification types
  const groupedPilots: Record<QualificationType, Pilot[]> = QUALIFICATION_ORDER.reduce((acc, qual) => {
    acc[qual] = [];
    return acc;
  }, {} as Record<QualificationType, Pilot[]>);
  
  filteredPilots.forEach(pilot => {
    // Find pilot's highest qualification
    let highestQual: QualificationType = 'Wingman';  // Default to Wingman
    for (const qual of QUALIFICATION_ORDER) {
      if (pilot.qualifications.some(q => q.type === qual)) {
        highestQual = qual;
        break;
      }
    }
    
    groupedPilots[highestQual].push(pilot);
  });

  // Enhanced isPilotAssigned to return flight ID
  const isPilotAssignedToFlight = (pilot: Pilot): { isAssigned: boolean; flightId?: string } => {
    for (const [flightId, flightPilots] of Object.entries(assignedPilots)) {
      if (flightPilots.some(p => p.boardNumber === pilot.boardNumber)) {
        return { isAssigned: true, flightId };
      }
    }
    return { isAssigned: false };
  };

  // Add an event listener to prevent horizontal scrolling during drag
  useEffect(() => {
    const preventHorizontalScroll = (e: WheelEvent) => {
      if (document.body.classList.contains('dragging')) {
        // Only allow vertical scrolling during drag operations
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

  // Add a more aggressive scroll prevention approach
  useEffect(() => {
    // Store original overflow style
    const originalOverflow = document.body.style.overflowX;
    
    // Create a style element for our global CSS
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
      
      /* Additional styles to prevent horizontal scroll during drag */
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
    
    // Handle drag start - lock scroll
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
    
    // Handle drag end - restore scroll
    const handleDragEnd = () => {
      document.body.style.overflowX = originalOverflow;
    };
    
    // Listen for drag events
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
      overflow: 'visible', // Changed from 'hidden' to 'visible'
      position: 'relative',
      padding: '10px', // Added padding for shadows
      margin: '-10px', // Added negative margin to maintain layout
      height: '100%' // Added to ensure full height
    }}>
      <Card 
        style={{
          width: '100%',
          height: '100%', // Ensure card takes full height of container
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'visible', // Changed from 'hidden' to 'visible'
          boxSizing: 'border-box'
        }}
      >
        {/* Header with new card label style */}
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

        {/* Filter section */}
        <div className="mb-4">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {/* Qualification filter tags */}
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

            {/* Attending filter button */}
            <button
              onClick={() => setShowOnlyAttending(!showOnlyAttending)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: showOnlyAttending ? '#EFF6FF' : 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease',
                color: showOnlyAttending ? '#2563EB' : '#64748B'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <Filter size={16} />
            </button>
          </div>
        </div>

        {/* Pilots list with ref */}
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
                {/* Qualification group divider */}
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

                {/* Pilot entries */}
                <div style={{ 
                  width: '100%', 
                  position: 'relative', 
                  overflowX: 'hidden' 
                }}>
                  {qualPilots.map(pilot => {
                    const assignment = isPilotAssignedToFlight(pilot);
                    return (
                      <PilotEntry 
                        key={`${pilot.id}-${assignment.isAssigned ? 'assigned' : 'available'}`}
                        pilot={pilot} 
                        isAssigned={assignment.isAssigned}
                        currentFlightId={assignment.flightId}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom action buttons with separator */}
        <div style={{
          marginTop: 'auto',
          width: '100%',
        }}>
          {/* Horizontal separator */}
          <div style={{
            borderTop: '1px solid #E2E8F0',
            marginTop: '16px',
            marginBottom: '16px',
            width: '100%'
          }}></div>

          {/* Buttons container */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            padding: '0 16px'
          }}>
            <button
              onClick={onAutoAssign}
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