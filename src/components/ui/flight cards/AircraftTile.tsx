import React, { useState, useEffect } from 'react';
import aircraftMask from '../../../assets/aircraft-mask.png';
import flightDeckPersonnelIcon from '../../../assets/Flight Deck Personnel Icon.png';
import { useDraggable } from '@dnd-kit/core';
import { Icon, legibleColor } from '../primitives';

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
  isDropTarget?: boolean; // A dragged pilot is over this slot - highlight the tile only (not the label)
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
  hideMidsBackground = false,
  isDropTarget = false
}) => {
  // Track local drag state
  const [localDragging, setLocalDragging] = useState(false);

  // Check if this is a cross-squadron assignment
  // The flight callsign should be in the pilot's squadron's callsign list
  const pilotSquadron = pilot?.currentSquadron || pilot?.squadronAssignment?.org_squadrons;
  const squadronCallsigns = pilotSquadron?.callsigns;
  const flightCallsignUpper = flightCallsign.toUpperCase();

  const isCrossSquadronAssignment = !isEmpty &&
    squadronCallsigns &&
    Array.isArray(squadronCallsigns) &&
    !squadronCallsigns.some((cs: string) => cs.toUpperCase() === flightCallsignUpper);

  // Make the tile draggable if it has a pilot assigned
  // CRITICAL: Include flightId and dashNumber in the draggable ID to ensure uniqueness.
  // Without this, the same pilot appearing in both a flight card and a support card
  // creates two draggable elements with the same ID, causing dnd-kit to grab the wrong one.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-tile-${flightId || 'list'}-${dashNumber}-${boardNumber}`,
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

  // IMPORTANT: Force re-render when attendanceStatus changes
  const [renderKey, setRenderKey] = useState(Date.now());
  useEffect(() => {
    // Update the render key whenever attendance status or roll call status changes
    if (!isEmpty) {
      setRenderKey(Date.now());
    }
  }, [attendanceStatus, rollCallStatus, isEmpty]);

  // ---- UI Kit aircraft tile (74 x 87px): MIDS A/B bare numbers, masked aircraft tinted to the
  // pilot's squadron colour, board number in squadron colour, callsign. Click-free drag source.
  const tileColor = legibleColor(pilotSquadronColor, 'var(--rr-accent-text)');
  const isDeclinedDiscord = attendanceStatus === 'declined';
  const isAbsentRollCall = rollCallStatus === 'Absent';
  const isTentativeDiscord = attendanceStatus === 'tentative';
  const isTentativeRollCall = rollCallStatus === 'Tentative';
  const isRollCallOverriding = rollCallStatus === 'Present' || rollCallStatus === 'Absent' || rollCallStatus === 'Tentative';
  const showAbsent = !isEmpty && (isAbsentRollCall || (isDeclinedDiscord && !isRollCallOverriding));
  const showTentative = !showAbsent && !isEmpty && (isTentativeRollCall || (isTentativeDiscord && !isRollCallOverriding));
  const showNoResponse = !showAbsent && !showTentative && !isEmpty && !attendanceStatus && !rollCallStatus;
  const statusTitle = showAbsent ? 'Declined / absent' : showTentative ? 'Tentative' : showNoResponse ? 'No response' : undefined;

  const positionLabel = iconType === 'personnel'
    ? flightCallsign
    : isFlightLead
      ? `${flightNumber}-${dashNumber}`
      : `${flightNumber}-${dashNumber}`;

  return (
    <div
      className="aircraft-tile-container"
      key={`tile-${boardNumber}-${callsign}-${attendanceStatus}-${rollCallStatus}-${renderKey}`}
      style={{
        position: 'relative',
        width: '74px', // aircraft tiles were 62px; widened 20% (now same width as personnel tiles)
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: `${verticalOffset}px`,
        pointerEvents: 'auto',
        isolation: 'isolate',
      }}
    >
      {/* Position label above the tile; the lead (1-1) is bold/bright, the MC gets a star */}
      <div
        className="aircraft-tile-label font-mono"
        style={{
          fontSize: '9.5px',
          lineHeight: '12px',
          letterSpacing: '.04em',
          textAlign: 'center',
          marginBottom: '4px',
          width: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isMissionCommander ? 'var(--rr-accent-text)' : isFlightLead ? 'var(--rr-text)' : 'var(--rr-text2)',
          fontWeight: isFlightLead || isMissionCommander ? 700 : 400,
        }}
        title={isFlightLead ? `${flightCallsign} ${flightNumber}-${dashNumber}` : undefined}
      >
        {isMissionCommander ? <span title="Mission Commander">★ </span> : null}
        {positionLabel}
      </div>

      <div
        ref={setNodeRef}
        className="aircraft-tile-wrapper"
        {...(!isEmpty ? { ...attributes, ...listeners } : {})}
        title={isEmpty ? undefined : [boardNumber, callsign, statusTitle].filter(Boolean).join(' · ')}
        style={{
          position: 'relative',
          width: '100%',
          padding: '6px 5px 7px',
          boxSizing: 'border-box',
          // Aircraft tiles: fixed 87px height (empty and filled share the same box); spare height
          // goes either side of the silhouette.
          ...(iconType === 'aircraft'
            ? { height: '87px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between' }
            : {}),
          borderRadius: '8px',
          background: 'var(--rr-panel)',
          border: isEmpty
            ? '1.5px dashed var(--rr-border2)'
            : isCrossSquadronAssignment && pilotSquadronColor
              ? `1.5px solid ${tileColor}`
              : isMissionCommander
                ? '1.5px solid var(--rr-accent)'
                : '1.5px solid var(--rr-border2)', // same width in every state so empty = filled size
          cursor: isEmpty ? 'default' : 'grab',
          lineHeight: 1,
          opacity: localDragging ? 0.4 : 1,
          transition: 'transform .15s ease, border-color .15s ease',
          willChange: 'transform',
        }}
        onMouseEnter={(e) => { if (!isEmpty) e.currentTarget.style.transform = 'translateY(-3px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
      >
        {/* MIDS A (top-left) / MIDS B (top-right) */}
        {/* Attendance indicator sits centred in this row so the callsign never shifts */}
        <div className="relative flex items-center justify-between font-mono text-[8px] leading-[10px] h-[10px] px-[1px] text-text3">
          <span>{!isEmpty && !hideMidsBackground ? midsA : (isEmpty ? midsA : '')}</span>
          {statusTitle ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex" title={statusTitle}>
              {showAbsent ? <Icon name="close" size={10} stroke={3} style={{ color: 'var(--rr-bad)' }} /> : null}
              {showTentative ? <Icon name="help" size={10} stroke={2.4} style={{ color: 'var(--rr-info)' }} /> : null}
              {showNoResponse ? <Icon name="messageOff" size={10} stroke={2} style={{ color: 'var(--rr-text3)' }} /> : null}
            </span>
          ) : null}
          <span>{!isEmpty && !hideMidsBackground ? midsB : (isEmpty ? midsB : '')}</span>
        </div>

        {/* Aircraft / personnel silhouette as a CSS mask tinted to squadron colour */}
        <span
          aria-hidden
          style={{
            display: 'block',
            width: iconType === 'personnel' ? '22px' : '20px',
            height: iconType === 'personnel' ? '22px' : '26px',
            margin: '1px auto 0',
            background: isEmpty ? 'var(--rr-border2)' : tileColor,
            WebkitMask: `url("${iconType === 'personnel' ? flightDeckPersonnelIcon : aircraftMask}") center/contain no-repeat`,
            mask: `url("${iconType === 'personnel' ? flightDeckPersonnelIcon : aircraftMask}") center/contain no-repeat`,
          }}
        />

        {/* Board number (squadron colour) */}
        <div
          className="font-mono text-center"
          style={{ fontSize: '11px', lineHeight: '14px', height: '14px', fontWeight: 700, color: isEmpty ? 'var(--rr-text3)' : tileColor }}
        >
          {isEmpty ? '' : boardNumber}
        </div>

        {/* Callsign */}
        <div
          className="flex items-center justify-center text-center"
          style={{ fontSize: '10px', lineHeight: '15px', height: '15px', fontWeight: 600, color: 'var(--rr-text)' }}
        >
          <span className="truncate" style={{ maxWidth: '100%' }}>{isEmpty ? '' : callsign}</span>
        </div>

        {/* Drop-target highlight, confined to the tile itself */}
        {isDropTarget ? (
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: '-1.5px', borderRadius: '8px', pointerEvents: 'none',
              background: 'var(--rr-accent-weak)', outline: '1.5px dashed var(--rr-accent)', outlineOffset: '-1.5px',
            }}
          />
        ) : null}

        {/* Lead (1-1) / section lead (1-3) bar */}
        {(isFlightLead || isWingPair) && !isEmpty ? (
          <span
            aria-hidden
            style={{
              position: 'absolute', left: '10px', right: '10px', bottom: '-1px', height: '2px', borderRadius: '2px',
              background: isMissionCommander ? 'var(--rr-accent)' : isFlightLead ? 'var(--rr-text2)' : 'var(--rr-border2)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default AircraftTile;
