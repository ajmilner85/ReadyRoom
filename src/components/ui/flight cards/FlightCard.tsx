import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight, FlightMember } from '../../../types/FlightData';
import FuelDisplay from './FuelDisplay';
import { formatAltitude } from '../../../utils/positionUtils';

interface FlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
}

const BINGO_FUEL = 3.0;

// Format aircraft type for display (e.g., 'FA-18C_hornet' -> 'F/A-18C')
const formatAircraftType = (type?: string): string => {
  if (!type) return '---';
  
  // Map common DCS aircraft types to display names
  const typeMap: Record<string, string> = {
    'FA-18C_hornet': 'F/A-18C',
    'F-16C_50': 'F-16C',
    'F-15C': 'F-15C',
    'F-15E': 'F-15E',
    'F-14B': 'F-14B',
    'F-14A-135-GR': 'F-14A',
    'AV8BNA': 'AV-8B',
    'A-10C': 'A-10C',
    'A-10C_2': 'A-10C II',
  };
  
  return typeMap[type] || type;
};

const FlightCard: React.FC<FlightCardProps> = ({
  id,
  flightNumber,
  callsign,
  members,
  position,
  lowState,
  isDragging,
  formation,
  aircraftType,
  onUpdateMemberFuel
}) => {
  const [isEditingFuel, setIsEditingFuel] = useState(false);
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: id,
    data: {
      type: 'FlightCard',
      flight: { id, flightNumber, callsign, members, position, lowState, formation }
    },
    disabled: isEditingFuel
  });

  const formatPosition = (pos?: { bearing: string; distance: string; altitude: string }) => {
    if (!pos) return '';
    return `${pos.bearing}/${pos.distance}`;
  };

  // Get all members for display (no special treatment for dash-1)
  const allMembers = members;

  // Determine display position - individual positions take precedence over group position
  const displayPosition = members[0]?.position || position;

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
    width: '442px',
    height: '100px',
    padding: '5px 4px 5px 5px',
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    cursor: isEditingFuel ? 'default' : 'grab',
    userSelect: 'none',
    ...(isDragging ? {
      boxShadow: '0px 20px 25px -5px rgba(0, 0, 0, 0.3), 0px 10px 10px -5px rgba(0, 0, 0, 0.2)',
      opacity: 0.9,
    } : {
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      opacity: 1,
    }),
    ...(transform ? {
      transform: CSS.Translate.toString(transform)
    } : {})
  };

  const handleUpdateMemberFuel = (member: FlightMember, newFuel: number) => {
    if (onUpdateMemberFuel) {
      onUpdateMemberFuel(member.dashNumber, newFuel);
    }
  };

  return (
    <div 
      ref={setNodeRef}
      {...(isEditingFuel ? {} : { ...attributes, ...listeners })}
      style={cardStyle}
      data-flight-id={id}
    >
      <div style={{
        display: 'flex',
        gap: '4px',
        height: '90px',
      }}>
        {/* Flight Callsign */}
        <div style={{
          flex: '0 0 88px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '4px',
          paddingTop: '6px',
        }}>
          <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: '16px', color: '#575A58', textAlign: 'center', marginBottom: '3px' }}>
            {callsign} {flightNumber}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', color: '#575A58', textAlign: 'center' }}>
            {members.length}x {formatAircraftType(aircraftType)}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', color: '#575A58', textAlign: 'center' }}>
            ---
          </div>
          <div style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', color: '#575A58', textAlign: 'center' }}>
            ---
          </div>
        </div>

        {/* All Flight Members (including dash-1) */}
        <div style={{
          flex: '0 0 78px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {allMembers.map((member) => (
            <div key={member.boardNumber}
                 data-board-number={member.boardNumber}
                 style={{
                   display: 'flex',
                   alignItems: 'baseline',
                   height: '19px',
                 }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 400,
                color: '#94A3B8',
                lineHeight: '16px',
                width: '10px',
                textAlign: 'left',
                flexShrink: 0
              }}>
                {member.dashNumber}
              </span>
              <span style={{
                fontFamily: 'USN Stencil',
                fontSize: '16px',
                fontWeight: 400,
                color: '#575A58',
                width: '26px',
                lineHeight: '16px',
                textAlign: 'left',
                marginLeft: '2px',
                flexShrink: 0
              }}>
                {member.boardNumber}
              </span>
              <div style={{ 
                color: member.fuel < BINGO_FUEL ? '#FF3B30' : '#FF3B30',
                animation: member.fuel < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none',
                width: '34px',
                lineHeight: '16px',
                marginLeft: '12px',
                flexShrink: 0
              }}>
                <FuelDisplay 
                  fuel={member.fuel} 
                  size="small" 
                  onUpdateFuel={(newFuel) => handleUpdateMemberFuel(member, newFuel)}
                  onEditStateChange={setIsEditingFuel}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Position */}
        <div style={{
          flex: '0 0 141px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {displayPosition ? (
            <>
              <div style={{ fontSize: '20px', fontWeight: 500, color: '#000000' }}>
                {formatPosition(displayPosition)}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 500, color: '#1E1E1E' }}>
                {formatAltitude(displayPosition.altitude)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '14px', color: '#64748B' }}>NO POS</div>
          )}
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
          <div style={{
            animation: lowState < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none'
          }}>
            <FuelDisplay 
              fuel={lowState} 
              size="large"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightCard;