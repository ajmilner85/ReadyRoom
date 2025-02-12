import React, { useRef } from 'react';
import DroppableZone from './DroppableZone';
import DivisionEditor from '../ui/DivisionEditor';
import { AddDivisionButton } from '../ui/buttons/AddDivisionButton';
import { LaunchDivisionButton } from '../ui/buttons/LaunchDivisionButton';
import { EnRouteDivisionButton } from '../ui/buttons/EnRouteDivisionButton';
import { TankerDivisionButton } from '../ui/buttons/TankerDivisionButton';
import { RecoveryToggleSwitch } from '../ui/buttons/RecoveryToggleSwitch';
import { useSections } from './SectionContext';
import type { Flight } from '../../types/FlightData';
import FlightCard from '../ui/flight cards/FlightCard';
import SingleFlightCard from '../ui/flight cards/SingleFlightCard';

interface GridLayoutProps {
  flights?: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

const GridLayout: React.FC<GridLayoutProps> = ({ flights = [], onUpdateMemberFuel }) => {
  const { sections } = useSections();
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getFlightsForDivision = (sectionTitle: string, divisionId: string): Flight[] => {
    const [sectionType, divisionNum] = divisionId.split('-');
    
    let expectedDivisionNumber: number;
    if (divisionNum === 'spin') {
      expectedDivisionNumber = -1;
    } else if (divisionNum === 'charlie') {
      expectedDivisionNumber = -2;
    } else {
      expectedDivisionNumber = parseInt(divisionNum);
    }
    
    const matchingFlights = flights.filter(flight => {
      // Debug log for each flight being checked
      console.log(`Checking flight ${flight.id} for section ${sectionTitle}, division ${expectedDivisionNumber}:`, {
        flightSection: flight.currentSection,
        flightDivision: flight.currentDivision,
        matches: flight.currentSection === sectionTitle && flight.currentDivision === expectedDivisionNumber
      });
      
      return flight.currentSection === sectionTitle && flight.currentDivision === expectedDivisionNumber;
    });

    console.log(`Found ${matchingFlights.length} flights for ${sectionTitle}, division ${divisionId}:`, matchingFlights);
    return matchingFlights;
  };

  const renderFlightCard = (flight: Flight) => {
    console.log('Rendering flight card for:', flight.id, flight.formation);
    const commonProps = {
      ...flight,
      onUpdateMemberFuel: (dashNumber: string, newFuel: number) => 
        onUpdateMemberFuel?.(flight.id, dashNumber, newFuel)
    };

    if (flight.formation === 'single') {
      return <SingleFlightCard key={flight.id} {...commonProps} />;
    }
    return <FlightCard key={flight.id} {...commonProps} />;
  };

  const unassignedFlights = flights.filter(flight => !flight.currentSection);
  console.log('Unassigned flights:', unassignedFlights);

  const renderSectionDivisions = (section: typeof sections[0], sectionIndex: number) => {
    console.log(`Rendering section ${section.title} divisions`);
    
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
                  renderFlightCard={renderFlightCard}
                />
                <DivisionEditor 
                  sectionTitle={section.title}
                  division={division}
                  sectionRef={sectionRefs.current[sectionIndex] ? { current: sectionRefs.current[sectionIndex] } : undefined}
                  flights={flights}
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
                  renderFlightCard={renderFlightCard}
                />
                <DivisionEditor 
                  sectionTitle={section.title}
                  division={division}
                  sectionRef={sectionRefs.current[sectionIndex] ? { current: sectionRefs.current[sectionIndex] } : undefined}
                  flights={flights}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
        {section.title === "Recovery" ? (
          <RecoveryToggleSwitch />
        ) : section.type === 'launch' ? (
          <LaunchDivisionButton sectionTitle={section.title} position="bottom" />
        ) : section.title === "En Route/Tasking" ? (
          <EnRouteDivisionButton sectionTitle={section.title} position="bottom" />
        ) : (
          <AddDivisionButton sectionTitle={section.title} position="bottom" />
        )}
        {[...section.divisions].reverse().map((division) => {
          const divisionFlights = getFlightsForDivision(section.title, division.id);
          console.log(`Division ${division.id} has ${divisionFlights.length} flights:`, divisionFlights);
          
          return (
            <div key={division.id} style={{ position: 'relative' }}>
              <DroppableZone
                id={division.id}
                label={division.label}
                flights={divisionFlights}
                onUpdateMemberFuel={onUpdateMemberFuel}
                renderFlightCard={renderFlightCard}
              />
              <DivisionEditor 
                sectionTitle={section.title}
                division={division}
                sectionRef={sectionRefs.current[sectionIndex] ? { current: sectionRefs.current[sectionIndex] } : undefined}
                flights={flights}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ 
      backgroundColor: '#F0F4F8', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '20px',
      paddingBottom: '20px',
      boxSizing: 'border-box'
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
        justifyContent: 'center',
        width: '100%',
      }}>
        {sections.map((section, index) => (
          <div
            key={section.title}
            ref={el => sectionRefs.current[index] = el}
            style={{
              flex: '1 0 550px', 
              minWidth: '550px', 
              maxWidth: '550px',
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
              justifyContent: 'flex-end',
              position: 'relative',
              minHeight: 0,
              paddingBottom: '8px'
            }}>
              {renderSectionDivisions(section, index)}
            </div>

            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'normal',
              fontWeight: 300,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              textAlign: 'center',
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
        backgroundColor: '#F8FAFC',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        position: 'relative',
        justifyContent: 'center',
        width: '100%',
        boxSizing: 'border-box',
        padding: '20px 0'
      }}>
        {unassignedFlights.map(renderFlightCard)}
      </div>
    </div>
  );
};

export default GridLayout;