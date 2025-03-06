import React from 'react';
import aircraftIcon from '../../../assets/Aircraft Icon.svg';

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
  const FADED_PURPLE = 'rgba(91, 78, 97, 0.5)'; // Faded version of PURPLE
  const FADED_LIGHT_PURPLE = 'rgba(130, 114, 140, 0.5)'; // Faded version of LIGHT_PURPLE

  // Determine tile height based on position
  const tileHeight = (isFlightLead || isWingPair) ? 102 : 92;
  
  // Determine accent color with fading when empty
  const accentColor = isEmpty 
    ? (isFlightLead ? FADED_PURPLE : isWingPair ? FADED_LIGHT_PURPLE : '')
    : (isFlightLead ? PURPLE : isWingPair ? LIGHT_PURPLE : '');

  return (
    <div 
      style={{
        position: 'relative',
        width: '92px', // All tiles should be 92px wide
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: `${verticalOffset}px`, // Apply vertical offset
        marginBottom: '0px' // Remove the margin bottom since spacing is handled by parent
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
          marginBottom: '8px', // Restored from 6px back to 8px
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
          overflow: 'hidden',
          padding: '10px', // Reduced padding
          boxSizing: 'border-box'
        }}
      >
        {/* Bottom accent strip (for flight lead 1-1 and wing pair 1-3) */}
        {(isFlightLead || isWingPair) && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: '10px',
              background: accentColor,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Flight lead or section lead indicator dots */}
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '10px',
                lineHeight: '10px',
                color: LIGHT_SLATE_GREY,
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -60%)', // Move dots up by adjusting Y translation
                textAlign: 'center'
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
            justifyContent: 'flex-start',
            height: '100%',
            paddingTop: '0px', // Removed padding to allow manual positioning
            paddingLeft: '5px',
            paddingRight: '5px',
            boxSizing: 'border-box',
            position: 'relative', // Added for absolute positioning of children
            marginTop: '-5px' // Pull everything up slightly
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
              opacity: isEmpty ? 0.5 : 1,
              marginTop: '6px', // Increased from 5px to shift down by 1px
              marginBottom: '2px'
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
              color: isEmpty ? TEXT_GRAY : '#646F7E',
              marginTop: '-2px' // Shift down by 4px from previous position
            }}
          >
            {isEmpty ? '' : boardNumber} {/* Removed '-' placeholder */}
          </div>

          {/* Pilot callsign */}
          <div
            style={{
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: '17px',
              textAlign: 'center',
              color: isEmpty ? TEXT_GRAY : PURE_BLACK,
              marginTop: '-1px' // Adjusted from 1px to -1px to move up 2px more
            }}
          >
            {isEmpty ? '' : callsign} {/* Removed '-' placeholder */}
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