import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import FlightCard from '../ui/flight cards/FlightCard';
import type { Flight } from '../../types/FlightData';

interface DroppableZoneProps {
  id: string;
  label: string;
  flights: Flight[];
  onUpdateMemberFuel?: (flightId: string, dashNumber: string, newFuel: number) => void;
}

const DroppableZone: React.FC<DroppableZoneProps> = ({ 
  id, 
  label, 
  flights, 
  onUpdateMemberFuel 
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
  });

  if (!label) return null;

  // Base height for an empty zone
  const baseHeight = 103;
  // Height of each flight card with margin
  const flightCardHeight = 110;
  // Reduced spacing between cards in the same division
  const sameDivisionSpacing = 3;
  
  // Calculate dynamic height based on number of flights
  const dynamicHeight = flights.length > 1
    ? baseHeight + ((flights.length - 1) * (flightCardHeight - sameDivisionSpacing))
    : baseHeight;

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
        <div style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          width: '100%'
        }}>
          {flights.map((flight, index) => (
            <div 
              key={flight.id} 
              style={{
                width: '442px',
                marginBottom: index === flights.length - 1 ? 0 : sameDivisionSpacing,
                // Base z-index for stationary cards
                zIndex: 1,
                position: 'absolute',
                right: '4px',
                top: index === 0 
                  ? 0 
                  : `${index * (flightCardHeight - sameDivisionSpacing)}px`,
                // Re-enable pointer events for the flight card
                pointerEvents: 'auto'
              }}
            >
              <FlightCard
                {...flight}
                onUpdateMemberFuel={(dashNumber, newFuel) => 
                  onUpdateMemberFuel && onUpdateMemberFuel(flight.id, dashNumber, newFuel)
                }
              />
            </div>
          ))}
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
          zIndex: 1
        }}>
          {label.toUpperCase()}
        </div>
      </div>
    </div>
  );
};

export default DroppableZone;