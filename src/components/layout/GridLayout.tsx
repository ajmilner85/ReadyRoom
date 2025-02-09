import React from 'react';
import DroppableZone from './DroppableZone';
import DivisionEditor, { AddDivisionButton } from './DivisionEditor';
import { useSections } from './SectionContext';
import type { Flight } from '../../types/FlightData';
import FlightCard from '../flight/FlightCard';

interface GridLayoutProps {
  flights?: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

const GridLayout: React.FC<GridLayoutProps> = ({ flights = [], onUpdateMemberFuel }) => {
  const { sections } = useSections();

  const getFlightsForDivision = (sectionTitle: string, divisionId: string): Flight[] => {
    return flights.filter(flight => {
      const divisionNumber = parseInt(divisionId.split('-')[1]);
      return flight.currentSection === sectionTitle && flight.currentDivision === divisionNumber;
    });
  };

  const unassignedFlights = flights.filter(flight => !flight.currentSection);

  return (
    <div style={{ 
      backgroundColor: '#F8FAFC', 
      padding: '20px',
      position: 'relative',
      zIndex: 0 
    }}>
      <div style={{
        display: 'flex',
        gap: '20px',
        padding: '5px',
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
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column-reverse',
              position: 'relative',
              height: 'fit-content',
            }}>
              {section.type === 'tanker' ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  height: 'fit-content',
                  position: 'relative',
                  background: 'transparent',
                }}>
                  {/* Recovery tankers section */}
                  <div style={{
                    position: 'relative',
                    background: 'transparent',
                    borderRadius: '8px',
                    padding: '4px',
                  }}>
                    <AddDivisionButton sectionTitle={section.title} position="bottom" />
                    {[...section.divisions]
                      .filter(d => d.groupType === 'recovery-tankers')
                      .reverse()
                      .map((division) => (
                        <div key={division.id} style={{ position: 'relative', background: 'transparent' }}>
                          <DroppableZone
                            id={division.id}
                            label={division.label}
                            flights={getFlightsForDivision(section.title, division.id)}
                            onUpdateMemberFuel={onUpdateMemberFuel}
                          />
                          <DivisionEditor 
                            sectionTitle={section.title}
                            division={division}
                          />
                        </div>
                      ))}
                  </div>

                  <div style={{ flex: 1, background: 'transparent' }} />

                  {/* Mission tankers section */}
                  <div style={{
                    position: 'relative',
                    background: 'transparent',
                    borderRadius: '8px',
                    padding: '4px',
                  }}>
                    {[...section.divisions]
                      .filter(d => d.groupType === 'mission-tankers')
                      .reverse()
                      .map((division) => (
                        <div key={division.id} style={{ position: 'relative', background: 'transparent' }}>
                          <DroppableZone
                            id={division.id}
                            label={division.label}
                            flights={getFlightsForDivision(section.title, division.id)}
                            onUpdateMemberFuel={onUpdateMemberFuel}
                          />
                          <DivisionEditor 
                            sectionTitle={section.title}
                            division={division}
                          />
                        </div>
                      ))}
                    <AddDivisionButton sectionTitle={section.title} position="top" />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column-reverse', background: 'transparent' }}>
                  <AddDivisionButton sectionTitle={section.title} position="bottom" />
                  {[...section.divisions].reverse().map((division) => (
                    <div key={division.id} style={{ position: 'relative', background: 'transparent' }}>
                      <DroppableZone
                        id={division.id}
                        label={division.label}
                        flights={getFlightsForDivision(section.title, division.id)}
                        onUpdateMemberFuel={onUpdateMemberFuel}
                      />
                      <DivisionEditor 
                        sectionTitle={section.title}
                        division={division}
                      />
                    </div>
                  ))}
                  <AddDivisionButton sectionTitle={section.title} position="top" />
                </div>
              )}
            </div>

            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'normal',
              fontWeight: 300,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              textAlign: 'center',
              marginTop: '16px',
              padding: '8px',
              borderTop: '1px solid #E2E8F0',
              position: 'relative',
              background: 'transparent'
            }}>
              {section.title.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#F8FAFC',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        position: 'relative',
        zIndex: 1
      }}>
        {unassignedFlights.map((flight) => (
          <FlightCard
            key={flight.id}
            {...flight}
            onUpdateMemberFuel={(dashNumber, newFuel) => 
              onUpdateMemberFuel && onUpdateMemberFuel(flight.id, dashNumber, newFuel)
            }
          />
        ))}
      </div>
    </div>
  );
};

export default GridLayout;