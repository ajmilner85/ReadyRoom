import React, { useEffect, useRef, useState } from 'react';
import { getAllSquadrons } from '../../utils/squadronService';
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
import { Icon } from '../ui/primitives';

interface GridLayoutProps {
  flights?: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

const GridLayout: React.FC<GridLayoutProps> = ({ flights = [], onUpdateMemberFuel }) => {
  const { sections, createLaunchDivisionsFromStepTimes } = useSections();
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // squadron_id -> insignia URL for the strip backdrop (keyed by id, never tail code)
  const [insigniaById, setInsigniaById] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    getAllSquadrons().then(r => {
      if (!alive || !r.data) return;
      const m: Record<string, string> = {};
      r.data.forEach(sq => { if (sq.insignia_url) m[sq.id] = sq.insignia_url; });
      setInsigniaById(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
    } else if (divisionNum === 'platform') {
      expectedDivisionNumber = -3;
    } else if (divisionNum === 'bolter') {
      expectedDivisionNumber = -4;
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
      insigniaUrl: flight.squadronId ? insigniaById[flight.squadronId] : undefined,
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

  const sortedInactive = [...unassignedFlights].sort((a, b) => {
    if (a.callsign !== b.callsign) return a.callsign.localeCompare(b.callsign);
    return (parseInt(a.flightNumber) || 0) - (parseInt(b.flightNumber) || 0);
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* 4-column strip board; columns swipe on mobile (scroll-snap) */}
      <div data-m="board" className="flex-1 min-h-0 flex gap-[10px] p-[10px] overflow-x-auto">
        {sections.map((section, index) => (
          <div
            key={section.title}
            ref={(el: HTMLDivElement | null) => { sectionRefs.current[index] = el }}
            className="flex-1 min-w-[320px] flex flex-col min-h-0 relative bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden"
          >
            {/* Column header (Recovery carries the compact Case I/II/III toggle) */}
            <div className="flex-none flex items-center gap-2 px-3 h-[42px] border-b border-border">
              <span className="rr-pane-title">{section.title}</span>
              <span className="flex-1" />
              {section.title === 'Recovery' ? <RecoveryToggleSwitch /> : null}
            </div>

            {/* Divisions */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-end">
              {renderSectionDivisions(section, index)}
            </div>

            {/* Add division */}
            {section.title !== 'Recovery' ? (
              <div className="flex-none flex items-center justify-center border-t border-border min-h-[40px] py-1">
                {section.type === 'launch' ? (
                  <LaunchDivisionButton sectionTitle={section.title} position="bottom" />
                ) : section.title === 'En Route/Tasking' ? (
                  <EnRouteDivisionButton sectionTitle={section.title} position="bottom" />
                ) : section.type === 'tanker' ? (
                  <TankerDivisionButton sectionTitle={section.title} position="bottom" />
                ) : (
                  <AddDivisionButton sectionTitle={section.title} position="bottom" />
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Inactive flights drawer (drop target) */}
      <div
        className="flex-none border-t border-border bg-panel"
        style={{ maxHeight: isDrawerOpen ? '45vh' : 36, transition: 'max-height .25s ease', overflow: 'hidden' }}
      >
        <button
          type="button"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="w-full h-9 flex items-center gap-2 px-4 bg-panel2 hover:bg-panel3 border-0 cursor-pointer text-left"
        >
          <span className="rr-pane-title">Inactive</span>
          <span className="font-mono text-[11px] text-text3">{unassignedFlights.length}</span>
          <span className="flex-1" />
          <span className="flex text-text2 transition-transform duration-200" style={{ transform: isDrawerOpen ? 'rotate(180deg)' : 'none' }}>
            <Icon name="chevronUp" size={16} />
          </span>
        </button>
        <div
          ref={setDrawerRef}
          className="overflow-y-auto p-3 grid gap-2 transition-colors"
          style={{
            maxHeight: 'calc(45vh - 36px)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            background: isDrawerOver ? 'var(--rr-accent-weak)' : 'transparent',
          }}
        >
          {sortedInactive.length > 0 ? sortedInactive.map(renderFlightCard) : (
            <div className="col-span-full py-6 text-center text-[12.5px] text-text3">No inactive flights</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GridLayout;