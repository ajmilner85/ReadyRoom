import type { Pilot } from './PilotTypes';

export interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative' | 'declined';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
}

export type AssignedPilotsRecord = Record<string, AssignedPilot[]>;