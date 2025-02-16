import React, { useState, useMemo } from 'react';
import { Card } from '../card';
import QualificationBadge from '../QualificationBadge';
import { Filter } from 'lucide-react';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';

interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[];
  selectedEvent: Event | null;
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

const AvailablePilots: React.FC<AvailablePilotsProps> = ({ 
  width,
  pilots,
  selectedEvent 
}) => {
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

    return filtered;
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

  return (
    <div style={{ width }}>
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
          overflow: 'hidden',
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

        {/* Pilots list */}
        <div className="flex-1 overflow-y-auto">
          {[...DISPLAY_ORDER, 'Wingman' as QualificationType].map(qualification => {
            const qualPilots = groupedPilots[qualification] || [];
            if (qualPilots.length === 0) return null;

            return (
              <div key={qualification}>
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
                {qualPilots.map(pilot => (
                  <div
                    key={pilot.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '24px',
                      marginBottom: '10px',
                      transition: 'background-color 0.2s ease',
                      borderRadius: '8px',
                      padding: '0 10px'
                    }}
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
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default AvailablePilots;