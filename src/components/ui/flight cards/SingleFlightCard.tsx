import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight } from '../../../types/FlightData';
import FuelDisplay from './FuelDisplay';
import { formatAltitude } from '../../../utils/positionUtils';

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

  const aircraft = members[0];
  if (!aircraft) return null;

  // Determine the position to display (individual aircraft position takes precedence)
  const displayPosition = aircraft.position || position;

  const formatPosition = (pos?: { bearing: string; distance: string; altitude: string }) => {
    if (!pos) return '';
    return `${pos.bearing}/${pos.distance}`;
  };

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

  return (
    <div 
      ref={setNodeRef}
      {...(isEditingFuel ? {} : { ...attributes, ...listeners })}
      style={cardStyle}
      data-flight-id={id}
    >
      {/* Block 1 - Board Number */}
      <div style={{
        position: 'absolute',
        width: '67px',
        height: '35px',
        left: '4px',
        top: '4px',
        backgroundColor: '#F8FAFC',
        borderRadius: '8px'
      }}>
        <div 
          style={{
            position: 'absolute',
            width: '43.7px',
            height: '24px',
            left: '15.65px',
            top: '6px',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 700,
            fontSize: '20px',
            lineHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            textAlign: 'center',
            color: '#000000'
          }}
          title={aircraft.pilotCallsign}
          data-board-number={aircraft.boardNumber}
        >
          {aircraft.boardNumber}
        </div>
      </div>

      {/* Block 2 - Flight Affiliation */}
      <div style={{
        position: 'absolute',
        width: '108px',
        height: '35px',
        left: '75px',
        top: '4px',
        backgroundColor: '#F8FAFC',
        borderRadius: '8px'
      }}>
        <div style={{
          position: 'absolute',
          width: '108px',
          height: '35px',
          left: '0px',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 300,
          fontSize: '12px',
          lineHeight: '15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000000'
        }}>
          {`${callsign} ${flightNumber}-${aircraft.dashNumber}`}
        </div>
      </div>

      {/* Block 3 - Position */}
      <div style={{
        position: 'absolute',
        width: '181px',
        height: '35px',
        left: '187px',
        top: '4px',
        backgroundColor: '#F8FAFC',
        borderRadius: '8px'
      }}>
        <div style={{
          position: 'absolute',
          width: '171px',
          height: '35px',
          left: '5.48px',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '20px',
          lineHeight: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1E1E1E'
        }}>
          {displayPosition ? (
            <>
              <div>{formatPosition(displayPosition)}</div>
              <div style={{ fontSize: '14px' }}>{formatAltitude(displayPosition.altitude)}</div>
            </>
          ) : (
            <div style={{ fontSize: '14px', color: '#64748B' }}>NO POS</div>
          )}
        </div>
      </div>

      {/* Block 4 - Fuel State */}
      <div style={{
        position: 'absolute',
        width: '66px',
        height: '35px',
        left: '372px',
        top: '4px',
        backgroundColor: '#F8FAFC',
        borderRadius: '8px'
      }}>
        <div style={{
          position: 'absolute',
          width: '70px',
          height: '35px',
          display: 'flex',
          alignItems: 'center',
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