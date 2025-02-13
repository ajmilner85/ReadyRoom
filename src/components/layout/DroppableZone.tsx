import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Flight } from '../../types/FlightData';
import { useSections } from '../layout/SectionContext';

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

  const { sections } = useSections();
  const recoverySection = sections.find(s => s.title === 'Recovery');
  const isRecoveryZone = id.startsWith('recovery-');
  const isCaseIIorIII = isRecoveryZone && (recoverySection?.mode === 1 || recoverySection?.mode === 2);

  if (!label) return null;

  // Calculate minimum height based on section and mode
  const getMinHeight = () => {
    if (!isRecoveryZone) return '117px';
    if (isCaseIIorIII && !id.includes('inbound')) return '65px';
    return '117px';
  };

  // Calculate actual height based on content
  const getContentHeight = () => {
    const baseHeight = isCaseIIorIII && !id.includes('inbound') ? 65 : 117;
    const cardSpacing = 8;
    const numCards = flights.length;
    
    if (numCards === 0) return baseHeight;

    // Calculate height needed for cards
    let totalCardHeight = 0;
    flights.forEach(flight => {
      // Single flight cards are 43px, group cards are 100px
      totalCardHeight += flight.formation === 'single' ? 43 : 100;
    });

    // Add spacing between cards
    totalCardHeight += (numCards - 1) * cardSpacing;

    // Add padding (8px top and bottom)
    totalCardHeight += 16;

    return Math.max(baseHeight, totalCardHeight);
  };

  const contentHeight = getContentHeight();

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
        style={{
          height: '100%',
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