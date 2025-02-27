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
    const baseHeight = !isRecoveryZone ? 117 : (isCaseIIorIII ? 59 : 117);
    const adjustedBase = showTimeAdjuster ? baseHeight + 20 : baseHeight;
    const cardSpacing = 8;
    const numCards = sortedFlights.length;
    
    if (numCards === 0) return adjustedBase;

    let totalCardHeight = 0;
    sortedFlights.forEach(flight => {
      totalCardHeight += flight.formation === 'single' ? 43 : 100;
    });

    totalCardHeight += (numCards - 1) * cardSpacing;
    totalCardHeight += 16;

    return Math.max(adjustedBase, totalCardHeight);
  };

  const contentHeight = getContentHeight();

  const renderLabel = () => {
    if (!isCaseIIorIII || !altitude || altitude < 6) {
      return label.toUpperCase();
    }

    const parts = label.split('\n');
    return (
      <>
        {parts[0]?.toUpperCase()}<br />
        {parts[1]?.toUpperCase()}<br />
        {isEditingEAT ? (
          <input
            type="text"
            value={editedEAT}
            onChange={handleEATChange}
            onBlur={handleEATBlur}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            style={{
              width: '20px',
              height: '14px',
              background: 'rgba(148, 163, 184, 0.1)',
              border: 'none',
              color: '#64748B',
              fontSize: '12px',
              fontFamily: 'inherit',
              textAlign: 'center',
              padding: 0,
              margin: 0,
              outline: 'none',
              borderRadius: '2px'
            }}
            autoFocus
          />
        ) : (
          parts[2]
        )}
      </>
    );
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: getMinHeight(),
      height: `${contentHeight}px`,
      borderBottom: '1px dotted #CBD5E1',
      transition: 'height 0.2s ease-in-out',
    }}>
      <div
        ref={setNodeRef}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          height: '100%',
          backgroundColor: isOver ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
          transition: 'background-color 0.2s',
          padding: '8px',
          position: 'relative'
        }}
      >
        {/* Label container at the top */}
        <div 
          onDoubleClick={handleDoubleClick}
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 300,
            color: '#64748B',
            whiteSpace: 'pre-line',
            lineHeight: '1.2',
            cursor: isCaseIIorIII && altitude && altitude >= 6 ? 'pointer' : 'default'
          }}
        >
          {renderLabel()}
          
          <TimeAdjuster 
            isVisible={showTimeAdjuster && isHovering && !isEditingEAT}
            onAdjust={handleTimeAdjust}
          />
        </div>

        {/* Flight cards container */}
        <div style={{
          marginLeft: 'auto',
          width: '442px',
          marginRight: '4px',
        }}>
          {sortedFlights.map((flight, index) => (
            <div 
              key={flight.id}
              style={{
                position: 'relative',
                marginBottom: index === sortedFlights.length - 1 ? 0 : '8px',
                display: 'block'
              }}
            >
              {renderFlightCard(flight)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DroppableZone;