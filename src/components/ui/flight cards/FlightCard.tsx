import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Flight, FlightMember } from '../../../types/FlightData';
import FuelDisplay, { stripFuelColor } from './FuelDisplay';
import { legibleColor } from '../primitives/color';

interface FlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
  /** Squadron insignia for the greyscale backdrop behind the callsign block. */
  insigniaUrl?: string | null;
}

const BINGO_FUEL = 3.0;

// Format aircraft type for display (e.g., 'FA-18C_hornet' -> 'F/A-18C')
export const formatAircraftType = (type?: string): string => {
  if (!type) return '---';
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

/** BRA readout "bearing/range/angels" (angels = altitude in thousands). */
export const braOf = (pos?: { bearing: string; distance: string; altitude: string }) => {
  if (!pos) return '';
  const alt = parseInt(String(pos.altitude || '').replace(/[^0-9]/g, ''), 10);
  const angels = Number.isNaN(alt) ? '' : alt >= 1000 ? String(Math.round(alt / 1000)) : String(alt);
  return [pos.bearing, pos.distance, angels].filter(v => v !== '' && v !== undefined).join('/');
};

/** Index of the flight's low-state aircraft (lowest fuel); -1 when no fuel is known. */
export const lowStateIndex = (members: FlightMember[]) => {
  let idx = -1;
  let low = Infinity;
  members.forEach((m, i) => {
    if (typeof m.fuel === 'number' && !Number.isNaN(m.fuel) && m.fuel < low) { low = m.fuel; idx = i; }
  });
  return idx;
};

/**
 * Coordination strip (design D02.1): panel3 strip, 4px squadron bar, callsign · N× airframe ·
 * right-aligned BRA; member chips (board + fuel, mono). Exactly one chip — the low state — is
 * boxed in its fuel colour with bold fuel. Strips are drag sources; fuel edits on double-click.
 */
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
  squadronColorPalette,
  insigniaUrl,
  onUpdateMemberFuel,
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

  // Individual positions take precedence over group position
  const displayPosition = members[0]?.position || position;
  const bra = braOf(displayPosition);
  const lowIdx = members.length === 1 ? 0 : lowStateIndex(members);
  const bar = legibleColor(squadronColorPalette?.primary, 'var(--rr-accent)');
  const bingo = typeof lowState === 'number' && lowState < BINGO_FUEL;

  return (
    <div
      ref={setNodeRef}
      {...(isEditingFuel ? {} : { ...attributes, ...listeners })}
      data-flight-id={id}
      className="relative w-full select-none rounded-rr-md overflow-hidden"
      style={{
        background: 'var(--rr-panel3)',
        border: '1px solid var(--rr-border2)',
        boxShadow: isDragging ? 'var(--rr-shadow-lg)' : 'var(--rr-shadow)',
        opacity: isDragging ? 0.92 : 1,
        cursor: isEditingFuel ? 'default' : 'grab',
        transform: transform ? CSS.Translate.toString(transform) : undefined,
      }}
    >
      {/* Squadron colour bar */}
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: bar }} />
      {/* Greyscale insignia backdrop, limited to the callsign block (never behind BRA) */}
      {insigniaUrl ? (
        <img
          src={insigniaUrl}
          alt=""
          className="absolute pointer-events-none"
          style={{ left: 8, top: 2, width: 88, height: 'calc(100% - 4px)', objectFit: 'contain', objectPosition: 'left center', filter: 'grayscale(1)', opacity: 0.14 }}
        />
      ) : null}

      <div className="relative pl-[10px] pr-2 pt-[6px] pb-[6px]">
        {/* Header line */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-bold whitespace-nowrap text-text">{callsign} {flightNumber}</span>
          <span className="text-[11px] text-text2 whitespace-nowrap">{members.length}× {formatAircraftType(aircraftType)}</span>
          <span className="flex-1" />
          {bra ? (
            <span className="font-mono text-[11px] text-text2 truncate min-w-0" title={`BRA ${bra}`}>
              BRA <span className="text-text font-semibold">{bra}</span>
            </span>
          ) : (
            <span className="font-mono text-[10px] text-text3">NO POS</span>
          )}
        </div>

        {/* Member chips (left-aligned) */}
        <div className="flex flex-wrap items-center gap-1 mt-[5px]">
          {members.map((member, i) => {
            const boxed = i === lowIdx;
            const fc = stripFuelColor(member.fuel);
            return (
              <span
                key={`${member.dashNumber}-${member.boardNumber}`}
                data-board-number={member.boardNumber}
                className="inline-flex items-baseline gap-[5px] px-[6px] py-[2px] rounded-rr-sm"
                style={{
                  background: 'var(--rr-panel2)',
                  border: `1.5px solid ${boxed ? fc : 'var(--rr-border)'}`,
                  animation: boxed && bingo ? 'pulse-red 1.5s ease-in-out infinite' : undefined,
                }}
                title={`${callsign} ${flightNumber}-${member.dashNumber} · ${member.pilotCallsign || ''}`}
              >
                <span className="font-mono text-[11px] font-semibold text-text">{member.boardNumber}</span>
                <FuelDisplay
                  fuel={member.fuel}
                  size="strip"
                  bold={boxed}
                  onUpdateFuel={(newFuel) => onUpdateMemberFuel?.(member.dashNumber, newFuel)}
                  onEditStateChange={setIsEditingFuel}
                />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FlightCard;
