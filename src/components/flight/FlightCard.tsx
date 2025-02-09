import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight, FlightMember } from '../../types/FlightData';
import FuelDisplay from './FuelDisplay';

interface FlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
}

const FlightCard: React.FC<FlightCardProps> = ({
  id,
  flightNumber,
  callsign,
  members,
  position,
  lowState,
  isDragging,
  onUpdateMemberFuel
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: id,
    data: {
      type: 'FlightCard',
      flight: { id, flightNumber, callsign, members, position, lowState }
    }
  });

  const lead = members.find(m => m.dashNumber === "1");
  const wingmen = members.filter(m => m.dashNumber !== "1");

  const cardStyle: React.CSSProperties = {
    ...transform ? {
      transform: CSS.Translate.toString(transform),
      zIndex: 1000 // High z-index while dragging
    } : {},
    opacity: isDragging ? 0.5 : 1,
    boxSizing: 'border-box',
    width: '442px',
    height: '100px',
    padding: '6px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    cursor: 'grab',
    userSelect: 'none',
    position: 'relative', // Ensure z-index works
  };

  const handleUpdateMemberFuel = (member: FlightMember, newFuel: number) => {
    if (onUpdateMemberFuel) {
      onUpdateMemberFuel(member.dashNumber, newFuel);
    }
  };

  // Prevent drag events from interfering with fuel editing
  const preventDragEvents = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!lead) return null;

  return (
    <div 
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={cardStyle}
      onMouseDown={preventDragEvents}
      onDoubleClick={preventDragEvents}
    >
      <div style={{
        display: 'flex',
        gap: '4px',
        height: '88px',
      }}>
        {/* Flight Lead */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div 
            style={{ fontSize: '36px', fontWeight: 700, lineHeight: '44px', color: '#1E1E1E' }}
            title={`${lead.pilotCallsign}`}
          >
            {lead.boardNumber}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 300, lineHeight: '15px', color: '#000000' }}>
            {callsign} {flightNumber}-1
          </div>
          <div style={{ color: '#FF3B30' }}>
            <FuelDisplay 
              fuel={lead.fuel} 
              size="small" 
              onUpdateFuel={(newFuel) => handleUpdateMemberFuel(lead, newFuel)}
            />
          </div>
        </div>

        {/* Flight Members */}
        <div style={{
          flex: '0 0 138px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {wingmen.map((member) => (
            <div key={member.boardNumber} 
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   height: '24px',
                 }}>
              <span style={{ fontSize: '12px', fontWeight: 300, width: '28px', color: '#000000' }}>
                {flightNumber}-{member.dashNumber}
              </span>
              <span 
                style={{ fontSize: '20px', fontWeight: 700, marginLeft: '29px', color: '#000000' }}
                title={`${member.pilotCallsign}`}
              >
                {member.boardNumber}
              </span>
              <span style={{ marginLeft: 'auto', color: '#FF3B30' }}>
                <FuelDisplay 
                  fuel={member.fuel} 
                  size="small" 
                  onUpdateFuel={(newFuel) => handleUpdateMemberFuel(member, newFuel)}
                />
              </span>
            </div>
          ))}
        </div>

        {/* Position */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-evenly',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#000000' }}>
            {position.bearing}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#1E1E1E' }}>
            {position.altitude}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 300, color: '#1E1E1E' }}>
            {position.status}
          </div>
        </div>

        {/* Low State */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <FuelDisplay fuel={lowState} size="large" />
        </div>
      </div>
    </div>
  );
};

export default FlightCard;