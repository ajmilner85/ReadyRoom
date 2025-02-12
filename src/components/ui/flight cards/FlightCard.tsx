import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight, FlightMember } from '../../../types/FlightData';
import FuelDisplay from './FuelDisplay';

interface FlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
}

const BINGO_FUEL = 3.0;

const FlightCard: React.FC<FlightCardProps> = ({
  id,
  flightNumber,
  callsign,
  members,
  position,
  lowState,
  isDragging,
  formation,
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

  // THIS IS THE PROBLEM - when dividing flights, the second section doesn't have a lead 
  // because we're filtering based on dashNumber "1"
  const lead = members.find(m => m.dashNumber === "1");
  const wingmen = members.filter(m => m.dashNumber !== "1");

  // In sections, we should treat the first member as lead regardless of dashNumber
  const useFirstMemberAsLead = formation === 'section';
  const actualLead = useFirstMemberAsLead ? members[0] : lead;

  if (!actualLead) {
    console.warn('FlightCard missing lead:', id, members.map(m => m.dashNumber));
    return null;
  }

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
    width: '442px',
    height: '100px',
    padding: '6px',
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
        height: '88px',
      }}>
        {/* Lead Aircraft */}
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
            title={`${actualLead.pilotCallsign}`}
            data-board-number={actualLead.boardNumber}
          >
            {actualLead.boardNumber}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 300, lineHeight: '15px', color: '#000000' }}>
            {callsign} {flightNumber}-{actualLead.dashNumber}
          </div>
          <div style={{ 
            color: actualLead.fuel < BINGO_FUEL ? '#FF3B30' : '#FF3B30',
            animation: actualLead.fuel < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none'
          }}>
            <FuelDisplay 
              fuel={actualLead.fuel} 
              size="small" 
              onUpdateFuel={(newFuel) => handleUpdateMemberFuel(actualLead, newFuel)}
              onEditStateChange={setIsEditingFuel}
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
          {useFirstMemberAsLead ? 
            members.slice(1).map((member) => (
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
                  style={{ fontSize: '20px', fontWeight: 700, marginLeft: '29px', color: '#1E1E1E' }}
                  title={`${member.pilotCallsign}`}
                  data-board-number={member.boardNumber}
                >
                  {member.boardNumber}
                </span>
                <span style={{ 
                  marginLeft: 'auto', 
                  color: member.fuel < BINGO_FUEL ? '#FF3B30' : '#FF3B30',
                  animation: member.fuel < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none'
                }}>
                  <FuelDisplay 
                    fuel={member.fuel} 
                    size="small" 
                    onUpdateFuel={(newFuel) => handleUpdateMemberFuel(member, newFuel)}
                    onEditStateChange={setIsEditingFuel}
                  />
                </span>
              </div>
            ))
            : wingmen.map((member) => (
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
                  style={{ fontSize: '20px', fontWeight: 700, marginLeft: '29px', color: '#1E1E1E' }}
                  title={`${member.pilotCallsign}`}
                  data-board-number={member.boardNumber}
                >
                  {member.boardNumber}
                </span>
                <span style={{ 
                  marginLeft: 'auto', 
                  color: member.fuel < BINGO_FUEL ? '#FF3B30' : '#FF3B30',
                  animation: member.fuel < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none'
                }}>
                  <FuelDisplay 
                    fuel={member.fuel} 
                    size="small" 
                    onUpdateFuel={(newFuel) => handleUpdateMemberFuel(member, newFuel)}
                    onEditStateChange={setIsEditingFuel}
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