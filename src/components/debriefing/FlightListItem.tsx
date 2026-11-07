import React from 'react';
import { BoardNumber, Button, Chip } from '../ui/primitives';
import type { FlightDebrief } from '../../types/DebriefingTypes';
import type { PilotAssignment } from '../../types/MissionTypes';

interface FlightInfo {
  flightId: string;
  callsign: string;
  flightNumber: number;
  squadronId: string;
  flightLeadPilotId: string;
  flightLeadBoardNumber: string;
  flightLeadCallsign: string;
  pilotAssignments: PilotAssignment[];
}

interface FlightListItemProps {
  flight: FlightInfo;
  debrief?: FlightDebrief | null;
  canSubmit: boolean;
  onSubmitAAR: () => void;
  /** Squadron colour for the flight lead's board number. */
  color?: string;
  missionFinalized?: boolean;
}

/**
 * One flight in a squadron's After Action Reports card: callsign, flight lead, AAR state.
 * Status uses tinted chips; the only button is the action the viewer can take
 * (Submit AAR / View-Edit), so pending flights don't shout.
 */
const FlightListItem: React.FC<FlightListItemProps> = ({
  flight,
  debrief,
  canSubmit,
  onSubmitAAR,
  color,
  missionFinalized = false
}) => {
  let status: React.ReactNode;
  if (debrief) {
    // Finalized missions still open the (read-only) form for viewing
    status = canSubmit ? (
      <>
        <Chip tone="good" size="sm">Submitted</Chip>
        <Button size="sm" variant="ghost" icon={missionFinalized ? 'eye' : 'edit'} onClick={onSubmitAAR}>
          {missionFinalized ? 'View' : 'View / Edit'}
        </Button>
      </>
    ) : (
      <Chip tone="good" size="sm">Submitted</Chip>
    );
  } else if (canSubmit) {
    status = (
      <>
        <Chip tone="muted" size="sm">Pending</Chip>
        <Button size="sm" variant="secondary" icon="clipboard" onClick={onSubmitAAR}>Submit AAR</Button>
      </>
    );
  } else {
    status = <Chip tone="muted" size="sm">Pending</Chip>;
  }

  return (
    <div className="flex items-center gap-3 px-[14px] min-h-[52px] py-[8px]">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-text leading-[1.3] truncate">
          {flight.callsign} {flight.flightNumber}
        </div>
        <div className="flex items-center gap-[6px] text-[12px] text-text2 leading-[1.3] min-w-0">
          {flight.flightLeadBoardNumber ? <BoardNumber value={flight.flightLeadBoardNumber} color={color} size={11.5} /> : null}
          <span className="truncate">{flight.flightLeadCallsign || 'No lead assigned'}</span>
        </div>
      </div>
      <div className="flex-none flex items-center gap-2">{status}</div>
    </div>
  );
};

export default FlightListItem;
