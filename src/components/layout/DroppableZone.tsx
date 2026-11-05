import React, { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Flight } from '../../types/FlightData';
import { useSections } from '../layout/SectionContext';
import { TimeAdjuster } from '../ui/buttons/TimeAdjuster';

interface DroppableZoneProps {
  id: string;
  label: string;
  flights: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
  renderFlightCard: (flight: Flight) => React.ReactNode;
}

const DroppableZone: React.FC<DroppableZoneProps> = ({ 
  id, 
  label, 
  flights, 
  renderFlightCard
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditingEAT, setIsEditingEAT] = useState(false);
  const [editedEAT, setEditedEAT] = useState("");
  const { isOver, setNodeRef } = useDroppable({
    id: id,
  });

  const { sections, adjustRecoveryTime, updateDivisionLabel } = useSections();
  const recoverySection = sections.find(s => s.title === 'Recovery');
  const isRecoveryZone = id.startsWith('recovery-');
  const isCaseIIorIII = isRecoveryZone && (recoverySection?.mode === 1 || recoverySection?.mode === 2);

  // Extract altitude from id for recovery divisions
  const altitudeMatch = id.match(/recovery-(\d+)/);
  const altitude = altitudeMatch ? parseInt(altitudeMatch[1]) : null;

  // Show time adjuster only for numbered recovery divisions in Case II/III
  const showTimeAdjuster = isCaseIIorIII && altitude !== null && altitude >= 6;

  const handleTimeAdjust = (minutesToAdd: number) => {
    if (altitude !== null) {
      adjustRecoveryTime(altitude, minutesToAdd);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isCaseIIorIII || !altitude || altitude < 6) return;
    
    // Extract current EAT from label
    const timeMatch = label.match(/:(\d{2})/);
    if (timeMatch) {
      setIsEditingEAT(true);
      setEditedEAT(timeMatch[1]);
      e.stopPropagation();
    }
  };

  const handleEATChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 2);
    setEditedEAT(value);
  };

  const handleEATBlur = () => {
    if (altitude && editedEAT) {
      const newTime = parseInt(editedEAT);
      if (!isNaN(newTime) && newTime >= 0 && newTime <= 59) {
        const dme = altitude + 15;
        const newLabel = `DME ${dme}\nANGELS ${altitude}\n:${editedEAT.padStart(2, '0')}`;
        updateDivisionLabel('Recovery', id, newLabel);
      }
    }
    setIsEditingEAT(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setIsEditingEAT(false);
    }
  };

  if (!label) return null;

  // Sort flights by fuel state (lowest at bottom)
  const sortedFlights = useMemo(() => {
    if (flights.length <= 1) return flights;
    
    return [...flights].sort((a, b) => {
      // Get minimum fuel state for each flight
      const getMinFuel = (flight: Flight) => {
        if (flight.formation === 'single') {
          return flight.lowState;
        }
        return flight.lowState;
      };
      
      return getMinFuel(b) - getMinFuel(a); // Higher fuel at top
    });
  }, [flights]);

  // Calculate minimum height based on section and mode
  const getMinHeight = () => {
    if (!isRecoveryZone) return 117;
    if (!isCaseIIorIII) return 117;
    const baseHeight = 59;
    return showTimeAdjuster ? baseHeight + 20 : baseHeight;
  };

  const getContentHeight = () => {
    const baseHeight = !isRecoveryZone ? 117 : (isCaseIIorIII ? 50 : 117);
    const adjustedBase = showTimeAdjuster ? baseHeight + 20 : baseHeight;
    const cardSpacing = isCaseIIorIII ? 4 : 8; // Reduced spacing for CASE II/III
    const numCards = sortedFlights.length;

    if (numCards === 0) return adjustedBase;

    let totalCardHeight = 0;
    sortedFlights.forEach(flight => {
      totalCardHeight += flight.formation === 'single' ? 43 : 100;
    });

    totalCardHeight += (numCards - 1) * cardSpacing;
    // Add padding for top and bottom
    const topPadding = isCaseIIorIII ? 0 : 10;
    const bottomPadding = isCaseIIorIII ? 8 : 10;
    totalCardHeight += topPadding + bottomPadding;

    return Math.max(adjustedBase, totalCardHeight);
  };

  const contentHeight = getContentHeight();

  // Division label (64px column): recovery angels render as a large number; Case II/III
  // adds DME and the EAT (warn colour, double-click to edit). Other labels are small mono text.
  const renderLabel = () => {
    if (isRecoveryZone && altitude !== null) {
      const parts = label.split('\n');
      const eat = isCaseIIorIII && altitude >= 6 ? parts[2] : null;
      return (
        <div className="flex flex-col items-start leading-none gap-[3px]">
          <span className="text-[20px] font-bold text-text">{altitude}</span>
          {isCaseIIorIII && altitude >= 6 ? (
            <>
              <span className="font-mono text-[9px] tracking-[.08em] text-text2">DME {altitude + 15}</span>
              {isEditingEAT ? (
                <input
                  type="text"
                  value={editedEAT}
                  onChange={handleEATChange}
                  onBlur={handleEATBlur}
                  onKeyDown={handleKeyDown}
                  onFocus={(e) => e.target.select()}
                  className="w-[30px] h-4 px-1 font-mono text-[10px] rounded-rr-sm bg-panel border border-accent text-warn focus:outline-none"
                  autoFocus
                />
              ) : (
                <span className="font-mono text-[10px] font-semibold text-warn">{eat}</span>
              )}
            </>
          ) : null}
        </div>
      );
    }
    return (
      <span className="font-mono text-[9.5px] leading-[1.25] tracking-[.08em] text-text2 whitespace-pre-line break-normal">
        {label.toUpperCase()}
      </span>
    );
  };

  void contentHeight;
  void getMinHeight;

  return (
    <div
      className="relative w-full flex border-b border-border"
      style={{ minHeight: isRecoveryZone && isCaseIIorIII ? 52 : 74 }}
    >
      {/* Label column */}
      <div
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className="flex-none w-[78px] px-2 py-[7px] bg-panel2 border-r border-border flex flex-col justify-end relative"
        style={{ cursor: isCaseIIorIII && altitude && altitude >= 6 ? 'pointer' : 'default' }}
      >
        {renderLabel()}
        <TimeAdjuster
          isVisible={showTimeAdjuster && isHovering && !isEditingEAT}
          onAdjust={handleTimeAdjust}
        />
      </div>

      {/* Strips: stack bottom-up like a physical strip board */}
      <div
        ref={setNodeRef}
        className="flex-1 min-w-0 flex flex-col-reverse justify-start gap-1 p-1 transition-colors duration-150"
        style={{ background: isOver ? 'var(--rr-accent-weak)' : 'transparent', outline: isOver ? '1.5px dashed var(--rr-accent)' : undefined, outlineOffset: -3 }}
      >
        {[...sortedFlights].reverse().map((flight) => (
          <div key={flight.id} className="relative">
            {renderFlightCard(flight)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DroppableZone;