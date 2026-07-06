import type { Pilot } from '../utils/pilotTypes';

// Assigned pilots are serialized snapshots (localStorage + mission JSON), where
// boardNumber is stored as a string ('' marks an empty support-role slot) even
// though the pilots table stores it as a number.
export interface AssignedPilot extends Omit<Pilot, 'boardNumber'> {
  boardNumber: string;
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative' | 'declined';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
}

export type AssignedPilotsRecord = Record<string, AssignedPilot[]>;
