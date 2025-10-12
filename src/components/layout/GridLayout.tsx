import React, { useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
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
import { ChevronUp, ChevronDown } from 'lucide-react';

interface GridLayoutProps {
  flights?: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

const GridLayout: React.FC<GridLayoutProps> = ({ flights = [], onUpdateMemberFuel }) => {
  const { sections, createLaunchDivisionsFromStepTimes } = useSections();
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isOver: isDrawerOver, setNodeRef: setDrawerRef } = useDroppable({
    id: 'inactive',
  });

  // Memoize unique step times to prevent unnecessary re-renders
  const uniqueStepTimes = React.useMemo(() => {
    if (flights.length === 0) return [];
    const stepTimes = flights
      .map(flight => (flight as any).stepTime ?? 0)
      .filter((stepTime, index, self) => self.indexOf(stepTime) === index);
    return stepTimes.sort((a, b) => a - b);
  }, [flights]);

  // Convert to string for stable comparison
  const stepTimesKey = uniqueStepTimes.join(',');

  // Track the last step times we used to create divisions
  const lastStepTimesRef = React.useRef<string>('');

  // Create launch divisions based on flight step times when they actually change
  React.useEffect(() => {
    if (uniqueStepTimes.length > 0 && stepTimesKey !== lastStepTimesRef.current) {
      createLaunchDivisionsFromStepTimes(uniqueStepTimes);
      lastStepTimesRef.current = stepTimesKey;
    }
  }, [stepTimesKey, uniqueStepTimes, createLaunchDivisionsFromStepTimes]);

  const getFlightsForDivision = (sectionTitle: string, divisionId: string): Flight[] => {
    const divisionNum = divisionId.split('-')[1];
    
    let expectedDivisionNumber: number;
    if (divisionNum === 'spin') {
      expectedDivisionNumber = -1;
    } else if (divisionNum === 'charlie') {
      expectedDivisionNumber = -2;
    } else if (divisionNum === 'inbound') {
      expectedDivisionNumber = 99;
    } else {
      expectedDivisionNumber = parseInt(divisionNum);
    }
    
    return flights.filter(flight => 
      flight.currentSection === sectionTitle && 
      flight.currentDivision === expectedDivisionNumber
    );
  };

  const renderFlightCard = (flight: Flight) => {
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

  const renderSectionDivisions = (section: typeof sections[0], sectionIndex: number) => {
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
        {[...section.divisions].reverse().map((division) => (
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
    );
  };

  return (
    <div style={{
      backgroundColor: '#F0F4F8',
      minHeight: '100vh',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0',
      boxSizing: 'border-box',
      width: '100%',
      overflowX: 'hidden',
      overflowY: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        gap: '20px',
        padding: '20px 15px 15px 15px',
        height: '100vh',
        overflowX: 'hidden',
        overflowY: 'hidden',
        position: 'relative',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {sections.map((section, index) => (
          <div
            key={section.title}
            ref={(el: HTMLDivElement | null) => { sectionRefs.current[index] = el }}
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
              padding: '24px',
              margin: '0 0 20px 0'
            }}
          >
            {/* Header with section label */}
            <div style={{
              width: '100%',
              textAlign: 'center',
              marginBottom: '16px',
              position: 'relative'
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
                {section.title}
              </span>
            </div>

            {/* Divisions content area */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              position: 'relative',
              minHeight: 0,
              overflowY: 'auto',
              paddingBottom: '20px'
            }}>
              {renderSectionDivisions(section, index)}
            </div>

            {/* Footer with add button */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderTop: '1px solid #E2E8F0',
              paddingTop: '18px',
              minHeight: '48px'
            }}>
              {section.type === 'launch' ? (
                <LaunchDivisionButton sectionTitle={section.title} position="bottom" />
              ) : section.title === "En Route/Tasking" ? (
                <EnRouteDivisionButton sectionTitle={section.title} position="bottom" />
              ) : section.type === 'tanker' ? (
                <TankerDivisionButton sectionTitle={section.title} position="bottom" />
              ) : section.title === "Recovery" ? (
                <RecoveryToggleSwitch />
              ) : (
                <AddDivisionButton sectionTitle={section.title} position="bottom" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Drawer for inactive flights */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: isDrawerOpen 
          ? 'translateX(-50%) translateY(0)' 
          : 'translateX(-50%) translateY(calc(100% - 38px))',
        width: '1828px', // 4 cards (442px each) + 3 gaps (10px) + padding (30px)
        maxWidth: 'calc(100vw - 120px)', // Don't exceed viewport minus nav bar margin
        zIndex: 1000,
        transition: 'transform 0.3s ease-in-out',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.15)',
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        pointerEvents: 'auto'
      }}>
        {/* Drawer Handle */}
        <button
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          style={{
            width: '100%',
            height: '38px', // Reduced from 48px
            backgroundColor: '#F8FAFC',
            border: 'none',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontFamily: 'Inter',
            fontSize: '14px',
            fontWeight: 500,
            color: '#64748B',
            transition: 'background-color 0.2s ease',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 1
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E2E8F0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
        >
          {isDrawerOpen ? (
            <>
              <ChevronDown size={20} />
              Hide Inactive Flights ({unassignedFlights.length})
            </>
          ) : (
            <>
              <ChevronUp size={20} />
              Show Inactive Flights ({unassignedFlights.length})
            </>
          )}
        </button>

        {/* Drawer Content */}
        <div
          ref={setDrawerRef}
          style={{
            maxHeight: '60vh',
            overflowY: 'auto',
            backgroundColor: isDrawerOver ? '#E0E7FF' : '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'center',
            padding: '20px 15px',
            boxSizing: 'border-box',
            transition: 'background-color 0.2s ease'
          }}>
          {unassignedFlights.length > 0 ? (
            [...unassignedFlights].sort((a, b) => {
              // Primary sort: by callsign alphabetically
              if (a.callsign !== b.callsign) {
                return a.callsign.localeCompare(b.callsign);
              }
              // Secondary sort: by flightNumber numerically
              const aNum = parseInt(a.flightNumber) || 0;
              const bNum = parseInt(b.flightNumber) || 0;
              return aNum - bNum;
            }).map(renderFlightCard)
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#94A3B8',
              fontFamily: 'Inter',
              fontSize: '14px'
            }}>
              No inactive flights
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GridLayout;