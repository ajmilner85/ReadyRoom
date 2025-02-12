import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Flight } from '../../types/FlightData';

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
  onUpdateMemberFuel,
  renderFlightCard
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
  });

  if (!label) return null;

  // Calculate dynamic height based on card types
  const getCardHeight = (flight: Flight) => {
    if (flight.formation === 'single') {
      return 43; // Height of a single aircraft card
    }
    return 110; // Height of a regular flight card
  };

  const getCardWidth = (flight: Flight) => {
    return flight.formation === 'single' ? 436 : 442;
  };

  // Base height for an empty zone
  const baseHeight = 117;
  // Reduced spacing between cards in the same division
  const sameDivisionSpacing = 3;
  
  // Calculate total height needed for all cards
  const totalCardsHeight = flights.reduce((acc, flight, index) => {
    const cardHeight = getCardHeight(flight);
    // Add spacing for all cards except the last one
    const spacing = index < flights.length - 1 ? sameDivisionSpacing : 0;
    return acc + cardHeight + spacing;
  }, 0);

  // Use either base height or calculated height, whichever is larger
  const dynamicHeight = Math.max(baseHeight, totalCardsHeight + 8); // 8px for padding

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: dynamicHeight,
      borderBottom: '1px dotted #CBD5E1',
    }}>
      <div
        ref={setNodeRef}
        style={{
          height: '100%',
          position: 'relative',
          backgroundColor: isOver ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
          transition: 'background-color 0.2s',
          padding: '4px',
        }}
      >
        {/* Container for flight cards */}
        <div style={{
          position: 'relative', // Changed from absolute
          width: '100%',
          height: '100%',
        }}>
          {flights.map((flight, index) => {
            // Calculate vertical position based on all previous cards
            const previousCardsHeight = flights
              .slice(0, index)
              .reduce((acc, prevFlight) => {
                return acc + getCardHeight(prevFlight) + sameDivisionSpacing;
              }, 0);

            return (
              <div 
                key={flight.id} 
                style={{
                  width: getCardWidth(flight),
                  marginBottom: index === flights.length - 1 ? 0 : sameDivisionSpacing,
                  position: 'absolute',
                  right: '4px',
                  top: `${previousCardsHeight}px`,
                  zIndex: 10 + index, // Ensure higher cards are always on top
                }}
              >
                {renderFlightCard(flight)}
              </div>
            );
          })}
        </div>

        {/* Division Label */}
        <div style={{
          position: 'absolute',
          bottom: '4px',
          left: '4px',
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 300,
          color: '#64748B',
          pointerEvents: 'none',
          zIndex: 1,
          paddingBottom: '4px'
        }}>
          {label.toUpperCase()}
        </div>
      </div>
    </div>
  );
};

export default DroppableZone;