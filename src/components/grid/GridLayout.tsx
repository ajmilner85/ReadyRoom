import React from 'react';
import DroppableZone from './DroppableZone';
import type { Flight } from '../../types/FlightData';

interface GridLayoutProps {
  flights?: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

interface SectionConfig {
  title: string;
  type: 'launch' | 'altitude' | 'tanker';
  divisions: {
    id: string;
    label: string;
    groupType?: 'mission-tankers' | 'recovery-tankers';
  }[];
}

const sections: SectionConfig[] = [
  {
    title: "Launch",
    type: 'launch',
    divisions: [
      { id: 'launch-5', label: "STEP +25min" },
      { id: 'launch-4', label: "STEP +20min" },
      { id: 'launch-3', label: "STEP +15min" },
      { id: 'launch-2', label: "STEP +10min" },
      { id: 'launch-1', label: "STEP +5min" },
      { id: 'launch-0', label: "STEP +0min" }
    ]
  },
  {
    title: "En Route/Tasking",
    type: 'altitude',
    divisions: [
      { id: 'enroute-9', label: "Angels 28-30" },
      { id: 'enroute-8', label: "Angels 25-27" },
      { id: 'enroute-7', label: "Angels 22-24" },
      { id: 'enroute-6', label: "Angels 19-21" },
      { id: 'enroute-5', label: "Angels 16-18" },
      { id: 'enroute-4', label: "Angels 13-15" },
      { id: 'enroute-3', label: "Angels 10-12" },
      { id: 'enroute-2', label: "Angels 7-9" },
      { id: 'enroute-1', label: "Angels 4-6" },
      { id: 'enroute-0', label: "Angels 1-3" }
    ]
  },
  {
    title: "Recovery",
    type: 'altitude',
    divisions: [
      { id: 'recovery-9', label: "Angels 20" },
      { id: 'recovery-8', label: "Angels 18" },
      { id: 'recovery-7', label: "Angels 16" },
      { id: 'recovery-6', label: "Angels 14" },
      { id: 'recovery-5', label: "Angels 12" },
      { id: 'recovery-4', label: "Angels 10" },
      { id: 'recovery-3', label: "Angels 8" },
      { id: 'recovery-2', label: "Angels 6" },
      { id: 'recovery-1', label: "Angels 4" },
      { id: 'recovery-0', label: "Angels 2" }
    ]
  },
  {
    title: "Tanker",
    type: 'tanker',
    divisions: [
      { id: 'tanker-0', label: "Shell - Angels 22", groupType: 'mission-tankers' },
      { id: 'tanker-1', label: "Texaco - Angels 20", groupType: 'mission-tankers' },
      { id: 'tanker-2', label: "Arco - Angels 18", groupType: 'mission-tankers' },
      { id: 'tanker-3', label: "Bloodhound - Angels 16", groupType: 'mission-tankers' },
      { id: 'tanker-4', label: "Recovery Tanker 1 - Angels 4", groupType: 'recovery-tankers' },
      { id: 'tanker-5', label: "Recovery Tanker 2 - Angels 4", groupType: 'recovery-tankers' }
    ]
  }
];

const GridLayout: React.FC<GridLayoutProps> = ({ flights = [], onUpdateMemberFuel }) => {
  return (
    <div style={{
      display: 'flex',
      gap: '20px',
      padding: '5px',
      backgroundColor: '#F8FAFC',
      height: 'fit-content',
      overflowX: 'auto',
      overflowY: 'auto',
      position: 'relative',
      zIndex: 1
    }}>
      {sections.map((section) => (
        <div
          key={section.title}
          style={{
            flex: '0 0 550px',
            width: '550px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1)',
            padding: '4px'
          }}
        >
          {/* Content area */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            height: 'fit-content'
          }}>
            {section.type === 'tanker' ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: 'fit-content',
                position: 'relative',
              }}>
                {/* Mission tankers section */}
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '4px',
                  position: 'relative',
                }}>
                  {section.divisions
                    .filter(d => d.groupType === 'mission-tankers')
                    .map((division) => (
                      <DroppableZone
                        key={division.id}
                        id={division.id}
                        label={division.label}
                        flights={flights.filter(
                          flight => flight.currentSection === 'Tanker' && 
                                   flight.currentDivision === parseInt(division.id.split('-')[1])
                        )}
                        onUpdateMemberFuel={onUpdateMemberFuel}
                      />
                    ))}
                </div>

                {/* Empty space - shows background color */}
                <div style={{ flex: 1 }} />

                {/* Recovery tankers section */}
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '4px',
                  position: 'relative',
                }}>
                  {section.divisions
                    .filter(d => d.groupType === 'recovery-tankers')
                    .map((division) => (
                      <DroppableZone
                        key={division.id}
                        id={division.id}
                        label={division.label}
                        flights={flights.filter(
                          flight => flight.currentSection === 'Tanker' && 
                                   flight.currentDivision === parseInt(division.id.split('-')[1])
                        )}
                        onUpdateMemberFuel={onUpdateMemberFuel}
                      />
                    ))}
                </div>
              </div>
            ) : (
              // Regular sections
              section.divisions.map((division) => (
                <DroppableZone
                  key={division.id}
                  id={division.id}
                  label={division.label}
                  flights={flights.filter(
                    flight => flight.currentSection === section.title && 
                             flight.currentDivision === parseInt(division.id.split('-')[1])
                  )}
                  onUpdateMemberFuel={onUpdateMemberFuel}
                />
              ))
            )}
          </div>
          
          {/* Section Title */}
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textAlign: 'center',
            marginTop: '16px'
          }}>
            {section.title.toUpperCase()}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GridLayout;