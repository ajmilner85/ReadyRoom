import React from 'react';
import aircraftIcon from '../../../assets/Aircraft Icon.png';

interface AircraftTileProps {
  boardNumber: string;
  callsign: string;
  dashNumber: string;
  flightNumber: string;
  flightCallsign: string; // Added to include callsign in label
  isFlightLead?: boolean;
  isWingPair?: boolean; // For 1-3 position
  isEmpty?: boolean;
  midsA?: string;
  midsB?: string;
  verticalOffset?: number; // New prop for vertical positioning
}

const AircraftTile: React.FC<AircraftTileProps> = ({
  boardNumber,
  callsign,
  dashNumber,
  flightNumber,
  flightCallsign,
  isFlightLead = false,
  isWingPair = false,
  isEmpty = false,
  midsA = '',
  midsB = '',
  verticalOffset = 0
}) => {
  // Component styling constants
  const PURPLE = '#5B4E61';
  const LIGHT_PURPLE = '#82728C'; // For the 1-3 accent
  const LIGHT_SLATE_GREY = '#F9FAFB';
  const PURE_BLACK = '#000000';
  const TEXT_GRAY = '#646F7E';
  const PURE_WHITE = '#FFFFFF';

  // Determine tile height based on position
  // Flight lead (1-1) and wingpair (1-3) are taller
  const tileHeight = (isFlightLead || isWingPair) ? 102 : 92;
  
  // Determine accent color
  const accentColor = isFlightLead ? PURPLE : isWingPair ? LIGHT_PURPLE : '';

  return (
    <div 
      style={{
        position: 'relative',
        width: '92px', // All tiles should be 92px wide
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: `${verticalOffset}px` // Apply vertical offset
      }}
    >
      {/* Flight number and dash number label above the tile */}
      <div
        style={{
          fontFamily: 'Inter',
          fontWeight: 400, // Changed to regular weight
          fontSize: '12px', // Changed to size 12
          lineHeight: '15px',
          textAlign: 'center',
          color: TEXT_GRAY, // Changed color to match spec
          marginBottom: '4px',
          width: '100%'
        }}
      >
        {/* Only include callsign for flight lead (1-1) */}
        {isFlightLead ? `${flightCallsign} ${flightNumber}-${dashNumber}` : `${flightNumber}-${dashNumber}`}
      </div>

      {/* Main tile background */}
      <div
        style={{
          position: 'relative',
          width: '92px', // All tiles are 92px wide
          height: `${tileHeight}px`, // Height varies based on position
          background: LIGHT_SLATE_GREY,
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        {/* Bottom accent strip (for flight lead 1-1 and wing pair 1-3) */}
        {(isFlightLead || isWingPair) && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              width: '100%',
              height: '10px',
              background: accentColor,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center', // Center vertically
              justifyContent: 'center'
            }}
          >
            {/* Flight lead or section lead indicator dots with adjusted position */}
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '10px', // Smaller font for dots
                lineHeight: '10px',
                color: LIGHT_SLATE_GREY,
                textAlign: 'center',
                position: 'relative',
                top: '-1px' // Shifted up by 1px for better vertical centering
              }}
            >
              {isFlightLead ? '••••' : '••'}
            </div>
          </div>
        )}

        {/* Aircraft information - centered in the tile */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start', // Changed to allow top padding
            height: '100%',
            paddingTop: '20px', // 10px space from top edge to icon
            paddingLeft: '5px',
            paddingRight: '5px',
            boxSizing: 'border-box'
          }}
        >
          {/* Aircraft icon - faded when empty */}
          <img
            src={aircraftIcon}
            alt="Aircraft"
            style={{
              width: '34px',
              height: '46px',
              filter: isEmpty 
                ? 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1)) opacity(0.5)' 
                : 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1))',
              opacity: isEmpty ? 0.5 : 1
            }}
          />

          {/* Board number */}
          <div
            style={{
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: '19px',
              textAlign: 'center',
              color: isEmpty ? TEXT_GRAY : PURPLE,
              marginTop: '4px'
            }}
          >
            {isEmpty ? '-' : boardNumber}
          </div>
          
          {/* Callsign (replaces the previous flight-dash number) */}
          <div
            style={{
              fontFamily: 'Inter',
              fontWeight: 500,
              fontSize: '12px',
              lineHeight: '15px',
              textAlign: 'center',
              color: isEmpty ? TEXT_GRAY : PURE_BLACK,
              marginTop: '2px'
            }}
          >
            {isEmpty ? '-' : callsign}
          </div>
        </div>

        {/* MIDS assignment sections - positioned within the tile */}
        {/* MIDS A - top left */}
        <div
          style={{
            position: 'absolute',
            top: '5px',
            left: '5px',
            width: '24px',
            height: '24px',
            background: PURE_WHITE,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
            zIndex: 3
          }}
        >
          <span
            style={{
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: '12px',
              color: TEXT_GRAY
            }}
          >
            {midsA || '-'}
          </span>
        </div>

        {/* MIDS B - top right */}
        <div
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            width: '24px',
            height: '24px',
            background: PURE_WHITE,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
            zIndex: 3
          }}
        >
          <span
            style={{
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: '12px',
              color: TEXT_GRAY
            }}
          >
            {midsB || '-'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AircraftTile;