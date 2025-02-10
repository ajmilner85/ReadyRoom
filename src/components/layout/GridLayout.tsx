import React from 'react';
import DroppableZone from './DroppableZone';
import DivisionEditor, { AddDivisionButton } from './DivisionEditor';
import { LaunchDivisionButton } from './LaunchDivisionButton';
import { EnRouteDivisionButton } from './EnRouteDivisionButton';
import { TankerDivisionButton } from './TankerDivisionButton';
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
      const [, ...divisionParts] = divisionId.split('-');
      const divisionIdPart = divisionParts.join('-');
      
      let expectedDivisionNumber: number;
      if (divisionIdPart === 'spin') {
        expectedDivisionNumber = -1;
      } else if (divisionIdPart === 'charlie') {
        expectedDivisionNumber = -2;
      } else {
        expectedDivisionNumber = parseInt(divisionIdPart);
      }
      
      return flight.currentSection === sectionTitle && flight.currentDivision === expectedDivisionNumber;
    });
  };

  const unassignedFlights = flights.filter(flight => !flight.currentSection);

  const renderSectionDivisions = (section: typeof sections[0]) => {
    if (section.type === 'tanker') {
      // Filter mission and recovery tankers
      const missionTankers = section.divisions.filter(d => d.groupType === 'mission-tankers');
      const recoveryTankers = section.divisions.filter(d => d.groupType === 'recovery-tankers');

      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Mission tankers at the top */}
          <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
            {[...missionTankers].reverse().map((division) => (
              <div key={division.id} style={{ position: 'relative' }}>
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

          {/* Empty space in the middle */}
          <div style={{ flex: 1 }} />

          {/* Recovery tankers at the bottom */}
          <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
            <TankerDivisionButton sectionTitle={section.title} position="bottom" />
            {[...recoveryTankers].reverse().map((division) => (
              <div key={division.id} style={{ position: 'relative' }}>
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
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
        {section.type === 'launch' ? (
          <LaunchDivisionButton sectionTitle={section.title} position="bottom" />
        ) : section.title === "En Route/Tasking" ? (
          <EnRouteDivisionButton sectionTitle={section.title} position="bottom" />
        ) : (
          <AddDivisionButton sectionTitle={section.title} position="bottom" />
        )}
        {[...section.divisions].reverse().map((division) => (
          <div key={division.id} style={{ position: 'relative' }}>
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
    );
  };

  return (
    <div style={{ 
      backgroundColor: '#F8FAFC', 
      padding: '20px',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        gap: '20px',
        padding: '5px',
        height: 'fit-content',
        overflowX: 'auto',
        overflowY: 'auto',
        position: 'relative',
        zIndex: 1,
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
              flexDirection: 'column',
              position: 'relative',
              height: 'fit-content',
            }}>
              {renderSectionDivisions(section)}
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
            }}>
              {section.title.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned flights area */}
      <div style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#F8FAFC',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        position: 'relative',
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