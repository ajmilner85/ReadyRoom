import React, { useState, useEffect } from 'react';
import aircraftIcon from '../../../assets/Aircraft Icon.svg';
import flightDeckPersonnelIcon from '../../../assets/Flight Deck Personnel Icon.png';
import { useDraggable } from '@dnd-kit/core';
import { X, HelpCircle, MessageCircleOff } from 'lucide-react';

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
  attendanceStatus?: 'accepted' | 'tentative' | 'declined'; // Discord attendance status - ADDED 'declined'
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; // Roll call attendance status
  iconType?: 'aircraft' | 'personnel'; // Add prop to specify icon type
  pilot?: any; // Add full pilot object for drag operations
  pilotSquadronColor?: string; // Pilot's squadron primary color
  hideMidsBackground?: boolean; // Hide MIDS channel white backgrounds (for Mission Support tiles)
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
  attendanceStatus,
  rollCallStatus,
  iconType = 'aircraft',
  pilot,
  pilotSquadronColor,
  hideMidsBackground = false
}) => {
  // Track local drag state
  const [localDragging, setLocalDragging] = useState(false);

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

  // Check if this is a cross-squadron assignment
  // The flight callsign should be in the pilot's squadron's callsign list
  const pilotSquadron = pilot?.currentSquadron || pilot?.squadronAssignment?.org_squadrons;
  const squadronCallsigns = pilotSquadron?.callsigns;
  const flightCallsignUpper = flightCallsign.toUpperCase();

  const isCrossSquadronAssignment = !isEmpty &&
    squadronCallsigns &&
    Array.isArray(squadronCallsigns) &&
    !squadronCallsigns.some((cs: string) => cs.toUpperCase() === flightCallsignUpper);

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
      pilot: isEmpty ? null : (pilot || {
        boardNumber,
        callsign,
        dashNumber,
        attendanceStatus // Fallback to minimal data if pilot object not available
      }),
      currentFlightId: flightId
    },
    disabled: isEmpty
  });

  // Update local dragging state
  useEffect(() => {
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

  // IMPORTANT: Force re-render when attendanceStatus changes
  const [renderKey, setRenderKey] = useState(Date.now());
  useEffect(() => {
    // Update the render key whenever attendance status or roll call status changes
    if (!isEmpty) {
      setRenderKey(Date.now());
    }
  }, [attendanceStatus, rollCallStatus, isEmpty]);

  return (
    <div 
      className="aircraft-tile-container"
      key={`tile-${boardNumber}-${callsign}-${attendanceStatus}-${rollCallStatus}-${renderKey}`}
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
        }}      >
        {/* Display logic based on iconType */}
        {iconType === 'personnel' 
          ? flightCallsign // For personnel, show the position name (AIR BOSS, MINI BOSS, etc.)
          : isFlightLead 
            ? `${flightCallsign} ${flightNumber}-${dashNumber}` // For flight lead aircraft
            : `${flightNumber}-${dashNumber}` // For other aircraft
        }
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
            boxSizing: 'border-box',
            // Add border for cross-squadron assignments - using box-shadow inside the tile
            boxShadow: isCrossSquadronAssignment ? `inset 0 0 0 2px ${pilotSquadronColor}` : 'none'
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
                zIndex: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px'
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
          >            {/* Aircraft/Personnel icon - faded when empty */}            <img
              src={iconType === 'personnel' ? flightDeckPersonnelIcon : aircraftIcon}
              alt=""
              style={{
                width: '34px',
                height: iconType === 'personnel' ? '34px' : '46px', // Make personnel icon square
                filter: isEmpty 
                  ? 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1)) opacity(0.5)' 
                  : 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1))',
                opacity: isEmpty ? 0.5 : 1,
                marginTop: '6px', // Increased from 5px to shift down by 1px
                marginBottom: iconType === 'personnel' ? '8px' : '2px' // Add more bottom margin for personnel icon
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
            
            {/* Pilot callsign with tentative badge if applicable */}
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '14px',
                lineHeight: '17px',
                textAlign: 'center',
                color: isEmpty ? TEXT_GRAY : (isCrossSquadronAssignment && pilotSquadronColor ? pilotSquadronColor : PURE_BLACK),
                marginTop: '-1px', // Adjusted from 1px to -1px to move up 2px more
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '4px'
              }}
            >              {isEmpty ? '' : (
                <>                  {/* Show status badge - prioritizing Absent/Declined over Tentative over No Response */}
                  {(() => {
                    // Calculate badge conditions
                    const isDeclinedDiscord = attendanceStatus === 'declined';
                    const isAbsentRollCall = rollCallStatus === 'Absent';
                    const isTentativeDiscord = attendanceStatus === 'tentative';
                    const isTentativeRollCall = rollCallStatus === 'Tentative';

                    // Roll call status overrides Discord status if it's Present, Absent, or Tentative
                    const isRollCallOverriding = rollCallStatus === 'Present' || rollCallStatus === 'Absent' || rollCallStatus === 'Tentative';

                    const shouldShowAbsentDeclinedBadge = !isEmpty && (isAbsentRollCall || (isDeclinedDiscord && !isRollCallOverriding));
                    const shouldShowTentativeBadge = !isEmpty && (isTentativeRollCall || (isTentativeDiscord && !isRollCallOverriding));

                    // Show "no response" badge if no Discord attendance and no roll call response
                    const hasNoResponse = !isEmpty && !attendanceStatus && !rollCallStatus;

                    // Debug log
                    if (!isEmpty && (rollCallStatus || attendanceStatus) && (callsign === 'MIRAGE' || callsign === 'VIKING')) {
                       // console.log(`[BADGE-DEBUG] AircraftTile ${callsign}: RollCall=${rollCallStatus || 'none'}, Discord=${attendanceStatus || 'none'}, ShowAbsent=${shouldShowAbsentDeclinedBadge}, ShowTentative=${shouldShowTentativeBadge}`);
                    }

                    // Render Absent/Declined badge if needed
                    if (shouldShowAbsentDeclinedBadge) {
                      return (
                        <X
                          key={`tile-badge-absent-${boardNumber}-${rollCallStatus || ''}-${attendanceStatus || ''}`}
                          size={14}
                          strokeWidth={3}
                          style={{
                            color: '#DC2626',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        />
                      );
                    }

                    // Render Tentative badge if needed (and Absent/Declined isn't shown)
                    if (shouldShowTentativeBadge) {
                      return (
                        <HelpCircle
                          key={`tile-badge-tentative-${boardNumber}-${rollCallStatus || ''}-${attendanceStatus || ''}`}
                          size={14}
                          strokeWidth={2.5}
                          style={{
                            color: '#5865F2',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        />
                      );
                    }

                    // Render No Response badge if needed (and other badges aren't shown)
                    if (hasNoResponse) {
                      return (
                        <MessageCircleOff
                          key={`tile-badge-no-response-${boardNumber}`}
                          size={14}
                          strokeWidth={2}
                          style={{
                            color: '#9CA3AF',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        />
                      );
                    }

                    // No badge needed
                    return null;
                  })()}
                  <span>{callsign}</span>
                </>
              )}
            </div>
          </div>

          {/* MIDS assignment sections - positioned within the tile */}
          {/* MIDS A - top left */}
          {!isEmpty && !hideMidsBackground && (
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
          {!isEmpty && !hideMidsBackground && (
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
