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
  renderFlightCard
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
  });

  if (!label) return null;

  console.log(`DroppableZone ${id} rendering with ${flights.length} flights:`, flights);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '117px',
      borderBottom: '1px dotted #CBD5E1',
    }}>
      <div
        ref={setNodeRef}
        style={{
          minHeight: '117px',
          backgroundColor: isOver ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
          transition: 'background-color 0.2s',
          padding: '8px',
        }}
      >
        {flights.map((flight, index) => (
          <div 
            key={flight.id}
            style={{
              position: 'relative',
              marginBottom: index === flights.length - 1 ? 0 : '8px',
              display: 'block',
              width: '442px',
              marginLeft: 'auto',
              marginRight: '4px',
            }}
          >
            {console.log(`Rendering flight card for ${flight.id} in ${id}`)}
            {renderFlightCard(flight)}
          </div>
        ))}

        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
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