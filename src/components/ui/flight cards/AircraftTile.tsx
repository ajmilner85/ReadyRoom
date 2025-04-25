import React, { useState } from 'react';
import aircraftIcon from '../../../assets/Aircraft Icon.svg';
import { useDraggable } from '@dnd-kit/core';

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
  flightId?: string; // Add this prop for drag handling
  isMissionCommander?: boolean; // Add prop for mission commander status
  attendanceStatus?: 'accepted' | 'tentative'; // Add prop for attendance status
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
  verticalOffset = 0,
  flightId,
  isMissionCommander = false,
  attendanceStatus
}) => {
  // Track local drag state
  const [localDragging, setLocalDragging] = useState(false);
  
  // Debug logging for attendance status
  React.useEffect(() => {
    if (!isEmpty && callsign) {
      console.log('[DEBUG] AircraftTile rendered for pilot:', callsign, 
        '- boardNumber:', boardNumber,
        '- attendanceStatus:', attendanceStatus,
        '- should show tentative badge:', attendanceStatus === 'tentative');
    }
  }, [callsign, isEmpty, attendanceStatus, boardNumber]);

  // Component styling constants
  const PURPLE = '#5B4E61';
  const LIGHT_PURPLE = '#82728C'; // For the 1-3 accent
  const LIGHT_SLATE_GREY = '#F9FAFB';
  const PURE_BLACK = '#000000';
  const TEXT_GRAY = '#646F7E';
  const PURE_WHITE = '#FFFFFF';
  const FADED_PURPLE = 'rgba(91, 78, 97, 0.5)'; // Faded version of PURPLE
  const FADED_LIGHT_PURPLE = 'rgba(130, 114, 140, 0.5)'; // Faded version of LIGHT_PURPLE
  const MISSION_COMMANDER_COLOR = '#F24607'; // Orange color for mission commander

  // Determine tile height based on position
  const tileHeight = (isFlightLead || isWingPair) ? 102 : 92;
  
  // Determine accent color with fading when empty
  const getAccentColor = () => {
    if (isEmpty) {
      return isFlightLead ? FADED_PURPLE : isWingPair ? FADED_LIGHT_PURPLE : '';
    }
    
    // If this is the mission commander, use the mission commander color
    if (isMissionCommander) {
      return MISSION_COMMANDER_COLOR;
    }
    
    // Otherwise use standard colors
    return isFlightLead ? PURPLE : isWingPair ? LIGHT_PURPLE : '';
  };
  
  const accentColor = getAccentColor();

  // Make the tile draggable if it has a pilot assigned
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-tile-${boardNumber}`,
    data: {
      type: 'Pilot',
      pilot: isEmpty ? null : {
        boardNumber,
        callsign,
        dashNumber
      },
      currentFlightId: flightId
    },
    disabled: isEmpty
  });

  // Update local dragging state
  React.useEffect(() => {
    if (isDragging !== localDragging) {
      setLocalDragging(isDragging);
    }
  }, [isDragging, localDragging]);

  // Get indicator content (dots or star)
  const getIndicatorContent = () => {
    if (isMissionCommander) {
      // Unicode character for a five-pointed star (★)
      return '★';
    }
    return isFlightLead ? '••••' : '••';
  };

  // Determine font size for indicator based on mission commander status
  const getIndicatorFontSize = () => {
    if (isMissionCommander) {
      return '10px'; // Even smaller font size for the star
    }
    return '10px';
  };

  return (
    <div 
      className="aircraft-tile-container"
      style={{
        position: 'relative',
        width: '92px', // All tiles should be 92px wide
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: `${verticalOffset}px`, // Apply vertical offset
        marginBottom: '0px', // Remove the margin bottom since spacing is handled by parent
        pointerEvents: 'auto', // Ensure pointer events are always enabled
        isolation: 'isolate', // Isolate this component to prevent style leakage
        transform: 'translateZ(0)' // Force GPU acceleration for consistent rendering
      }}
    >
      {/* Flight number and dash number label above the tile */}
      <div
        className="aircraft-tile-label"
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

      {/* Main tile background with shadow wrapper */}
      <div 
        ref={setNodeRef}
        className="aircraft-tile-wrapper"
        {...(!isEmpty ? { ...attributes, ...listeners } : {})}
        style={{
          position: 'relative',
          width: '92px',
          boxShadow: !isEmpty ? '0px 4px 6px rgba(0, 0, 0, 0.1)' : 'none',
          borderRadius: '8px',
          cursor: isEmpty ? 'default' : 'grab',
          willChange: 'transform' // Optimize for animations
        }}
      >
        <div
          className="aircraft-tile-main"
          style={{
            position: 'relative',
            width: '92px', // All tiles are 92px wide
            height: `${tileHeight}px`, // Height varies based on position
            background: LIGHT_SLATE_GREY,
            borderRadius: '8px',
            overflow: 'hidden', // Changed to hidden to show drop shadow below accent strip
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
                className="indicator-dots"
                style={{
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  fontSize: getIndicatorFontSize(),
                  lineHeight: '10px',
                  color: LIGHT_SLATE_GREY,
                  position: 'absolute',
                  left: '50%', 
                  top: '50%',
                  // Replace transform with explicit positioning
                  marginLeft: '-50%', // Center horizontally (equivalent to translateX(-50%))
                  marginTop: '-6px',  // Move up by 6px instead of 3px to position higher
                  textAlign: 'center',
                  width: '100%',      // Ensure the text container spans the full width
                  height: '10px'      // Match the height of the accent strip
                }}
              >
                {getIndicatorContent()}
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
            </div>            {/* Pilot callsign with tentative badge if applicable */}
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '14px',
                lineHeight: '17px',
                textAlign: 'center',
                color: isEmpty ? TEXT_GRAY : PURE_BLACK,
                marginTop: '-1px', // Adjusted from 1px to -1px to move up 2px more
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '4px'
              }}
            >              {!isEmpty && console.log('[DEBUG] AircraftTile rendering - callsign:', callsign, 'attendanceStatus:', attendanceStatus)}
              {isEmpty ? '' : (
                <>
                  {attendanceStatus === 'tentative' && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: '#5865F2', // Blurple color
                      color: 'white',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      flexShrink: 0
                    }}>
                      ?
                    </div>
                  )}
                  <span>{callsign}</span>
                </>
              )}
            </div>
          </div>

          {/* MIDS assignment sections - positioned within the tile */}
          {/* MIDS A - top left */}
          {!isEmpty && (
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
                {midsA}
              </span>
            </div>
          )}

          {/* MIDS B - top right */}
          {!isEmpty && (
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
                {midsB}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AircraftTile;