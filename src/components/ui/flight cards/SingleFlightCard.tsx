import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight } from '../../../types/FlightData';
import FuelDisplay from './FuelDisplay';

interface SingleFlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
}

const BINGO_FUEL = 3.0;

const SingleFlightCard: React.FC<SingleFlightCardProps> = ({
  id,
  flightNumber,
  callsign,
  members,
  position,
  isDragging,
  onUpdateMemberFuel
}) => {
  const [isEditingFuel, setIsEditingFuel] = useState(false);
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: id,
    data: {
      type: 'FlightCard',
      flight: { id, flightNumber, callsign, members, position }
    },
    disabled: isEditingFuel
  });

  // Since this is a single aircraft card, we know there's only one member
  const aircraft = members[0];
  if (!aircraft) return null;

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    width: '442px',
    height: '43px',
    backgroundColor: '#FFFFFF',
    boxShadow: isDragging 
      ? '0px 20px 25px -5px rgba(0, 0, 0, 0.3), 0px 10px 10px -5px rgba(0, 0, 0, 0.2)'
      : '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    cursor: isEditingFuel ? 'default' : 'grab',
    userSelect: 'none',
    opacity: isDragging ? 0.9 : 1,
    ...(transform ? {
      transform: CSS.Translate.toString(transform)
    } : {})
  };

  const blockStyle: React.CSSProperties = {
    position: 'absolute',
    height: '35px',
    top: '4px',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px'
  };

  return (
    <div 
      ref={setNodeRef}
      {...(isEditingFuel ? {} : { ...attributes, ...listeners })}
      style={cardStyle}
    >
      {/* Board Number Block */}
      <div style={{
        ...blockStyle,
        width: '67px',
        left: '4px'
      }}>
        <div 
          style={{
            position: 'absolute',
            width: '43.7px',
            height: '24px',
            left: '15.65px',
            top: '10px',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 700,
            fontSize: '20px',
            lineHeight: '24px',
            display: 'flex',
            alignItems: 'flex-end',
            textAlign: 'center',
            color: '#000000'
          }}
          title={aircraft.pilotCallsign}
          data-board-number={aircraft.boardNumber}
        >
          {aircraft.boardNumber}
        </div>
      </div>

      {/* Flight Affiliation Block */}
      <div style={{
        ...blockStyle,
        width: '88px',
        left: '75px'
      }}>
        <div style={{
          position: 'absolute',
          width: '88px',
          height: '22px',
          left: '0px',
          top: '10px',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 300,
          fontSize: '12px',
          lineHeight: '15px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          color: '#000000'
        }}>
          {`${callsign} ${flightNumber}-${aircraft.dashNumber}`}
        </div>
      </div>

      {/* Position Block */}
      <div style={{
        ...blockStyle,
        width: '168px',
        left: '167px'
      }}>
        <div style={{
          position: 'absolute',
          width: '157.04px',
          height: '26px',
          left: '5.48px',
          top: '4.5px',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '20px',
          lineHeight: '24px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          color: '#1E1E1E'
        }}>
          {`${position.bearing} ${position.altitude}`}
        </div>
      </div>

      {/* Fuel State Block */}
      <div style={{
        ...blockStyle,
        width: '92px',
        left: '339px'
      }}>
        <div style={{
          position: 'absolute',
          width: '73px',
          height: '23px',
          left: '9.5px',
          top: '6px',
          display: 'flex',
          justifyContent: 'center',
          color: aircraft.fuel < BINGO_FUEL ? '#FF3B30' : '#FF3B30',
          animation: aircraft.fuel < BINGO_FUEL ? 'pulse-red 1.5s ease-in-out infinite' : 'none'
        }}>
          <FuelDisplay 
            fuel={aircraft.fuel}
            size="small"
            onUpdateFuel={(newFuel) => onUpdateMemberFuel?.(aircraft.dashNumber, newFuel)}
            onEditStateChange={setIsEditingFuel}
          />
        </div>
      </div>
    </div>
  );
};

export default SingleFlightCard;