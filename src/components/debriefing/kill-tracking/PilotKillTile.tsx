import React from 'react';
import aircraftIcon from '../../../assets/Aircraft Icon.svg';

interface PilotKillTileProps {
  boardNumber: string;
  callsign: string;
  dashNumber: string;
  flightNumber: string;
  flightCallsign: string;
  isFlightLead?: boolean;
  isSectionLead?: boolean;
  pilotSquadronColor?: string;
}

/**
 * Simplified aircraft tile for kill tracking (no drag/drop, no MIDS)
 * Based on AircraftTile but streamlined for AAR display
 */
const PilotKillTile: React.FC<PilotKillTileProps> = ({
  boardNumber,
  callsign,
  dashNumber,
  flightNumber,
  flightCallsign,
  isFlightLead = false,
  isSectionLead = false,
  pilotSquadronColor
}) => {
  // Component styling constants
  const PURPLE = '#5B4E61';
  const LIGHT_SLATE_GREY = '#F9FAFB';
  const PURE_BLACK = '#000000';
  const TEXT_GRAY = '#646F7E';
  const FADED_PURPLE = 'rgba(91, 78, 97, 0.5)';

  // Check if tile is empty
  const isEmpty = !boardNumber && !callsign;

  // Determine tile height based on position
  const tileHeight = (isFlightLead || isSectionLead) ? 102 : 92;

  // Get accent color (faded when empty)
  const accentColor = isEmpty
    ? (isFlightLead || isSectionLead ? FADED_PURPLE : '')
    : (isFlightLead || isSectionLead ? PURPLE : '');

  return (
    <div
      style={{
        position: 'relative',
        width: '92px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '8px'
      }}
    >
      {/* Flight number and dash number label above the tile */}
      <div
        style={{
          fontFamily: 'Inter',
          fontWeight: 400,
          fontSize: '12px',
          lineHeight: '15px',
          textAlign: 'center',
          color: TEXT_GRAY,
          marginBottom: '8px',
          width: '100%'
        }}
      >
        {isFlightLead
          ? `${flightCallsign} ${flightNumber}-${dashNumber}`
          : `${flightNumber}-${dashNumber}`
        }
      </div>

      {/* Main tile background with shadow wrapper */}
      <div
        style={{
          position: 'relative',
          width: '92px',
          boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '92px',
            height: `${tileHeight}px`,
            background: LIGHT_SLATE_GREY,
            borderRadius: '8px',
            overflow: 'hidden',
            padding: '10px',
            boxSizing: 'border-box',
            boxShadow: pilotSquadronColor ? `inset 0 0 0 2px ${pilotSquadronColor}` : 'none'
          }}
        >
          {/* Bottom accent strip (for flight lead or section lead) */}
          {(isFlightLead || isSectionLead) && (
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
              {/* Flight lead indicator dots */}
              {isFlightLead && (
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
                    marginLeft: '-50%',
                    marginTop: '-6px',
                    textAlign: 'center',
                    width: '100%',
                    height: '10px'
                  }}
                >
                  ••••
                </div>
              )}
              {/* Section lead indicator dots */}
              {isSectionLead && !isFlightLead && (
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
                    marginLeft: '-50%',
                    marginTop: '-6px',
                    textAlign: 'center',
                    width: '100%',
                    height: '10px'
                  }}
                >
                  ••
                </div>
              )}
            </div>
          )}

          {/* Aircraft information */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              height: '100%',
              paddingTop: '0px',
              paddingLeft: '5px',
              paddingRight: '5px',
              boxSizing: 'border-box',
              position: 'relative',
              marginTop: '-5px'
            }}
          >
            {/* Aircraft icon */}
            <img
              src={aircraftIcon}
              alt=""
              style={{
                width: '34px',
                height: '46px',
                filter: isEmpty
                  ? 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1)) opacity(0.5)'
                  : 'drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.1))',
                opacity: isEmpty ? 0.5 : 1,
                marginTop: '6px',
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
                marginTop: '-2px'
              }}
            >
              {isEmpty ? '' : boardNumber}
            </div>

            {/* Pilot callsign */}
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '14px',
                lineHeight: '17px',
                textAlign: 'center',
                color: isEmpty ? TEXT_GRAY : (pilotSquadronColor || PURE_BLACK),
                marginTop: '-1px'
              }}
            >
              {isEmpty ? '' : callsign}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PilotKillTile;
