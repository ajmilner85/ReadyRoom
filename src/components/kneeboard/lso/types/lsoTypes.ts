// LSO Grading Types - Based on LSO-NATOPS

// Grade types
export type GradeType = 'OK_UNDERLINE' | 'OK' | 'FAIR' | 'NO_GRADE' | 'CUT' | 'NO_COUNT';
export type OutcomeType = 'TRAP' | 'BOLTER' | 'WAVE_OFF' | 'OWN_WAVE_OFF' | 'WOFD';
export type ApproachPhase = 'AW' | 'X' | 'IM' | 'IC' | 'AR' | 'TL' | 'IW';
export type DeviationSeverity = 'a_little' | 'reasonable' | 'gross';

export interface Deviation {
  phase: ApproachPhase;
  symbol: string;
  severity: DeviationSeverity;
  isOC?: boolean;  // Over-Controlled prefix modifier
}

// Grading pad button definition (configurable per phase)
export interface PadButton {
  symbol: string;          // LSO shorthand code
  label: string;           // Display label on button
  category: string;        // Row grouping label
  exclusiveGroup?: string; // Mutually exclusive within this group per phase
  isLabel?: boolean;       // Non-interactive label tile (renders as text, not a button)
  binaryToggle?: boolean;  // Only toggles on/off (no a_little/gross severity states)
}

// The full state of a grade being entered
export interface GradeEntry {
  carrierId: string;
  missionId: string | null;
  boardNumber: string;
  aircraftType: string;
  fuelState: string;
  pilotId: string | null;
  pilotCallsign: string | null;
  isNight: boolean;
  currentPhase: ApproachPhase | null;
  deviations: Deviation[];
  wireNumber: number | null;
  outcomeType: OutcomeType | null;
  overallGrade: GradeType | null;
  grooveTimeSeconds: number | null;
  hasBallCall: boolean;
  hasWaveOff: boolean;          // WO was signaled (can combine with TRAP/BOLTER = "landed on WO")
  pendingOC: boolean;           // OC prefix is waiting to be applied to next deviation
  twaSeverity: DeviationSeverity | null;  // Too Wide Abeam — pattern, not phase-specific
  tcaSeverity: DeviationSeverity | null;  // Too Close Abeam — pattern, not phase-specific
  nesaSeverity: DeviationSeverity | null;
  ligSeverity: DeviationSeverity | null;
  aaSeverity: DeviationSeverity | null;  // Angled Approach — not phase-specific
  comments: Record<string, number>;      // Comment button states: 0=off, 1=label1, 2=label2
  remarks: string;
}

// Grade point mapping per NATOPS
export const GRADE_POINTS: Record<GradeType, number> = {
  OK_UNDERLINE: 5.0,
  OK: 4.0,
  FAIR: 3.0,
  NO_GRADE: 2.0,
  CUT: 0.0,
  NO_COUNT: 0.0,
};

// Grade display labels for buttons
export const GRADE_DISPLAY: Record<GradeType, string> = {
  OK_UNDERLINE: '_OK_',
  OK: 'OK',
  FAIR: '(OK)',
  NO_GRADE: '--',
  CUT: 'C',
  NO_COUNT: 'NC',
};

// Phase display order
export const PHASE_ORDER: ApproachPhase[] = ['AW', 'X', 'IM', 'IC', 'AR', 'TL', 'IW'];

// Phases that constitute "all the way" (ball call to ramp)
export const ALL_THE_WAY_PHASES: ApproachPhase[] = ['X', 'IM', 'IC', 'AR'];

// Carrier type from database
export interface Carrier {
  id: string;
  hull: string;
  name: string;
  callsign: string;
  tacan_channel: string;
  tacan_identifier: string;
}

// Resolved pilot info from board number lookup
export interface ResolvedPilot {
  id: string;
  callsign: string;
  boardNumber: number;
  wingInsigniaUrl: string | null;
  squadronInsigniaUrl: string | null;
  squadronDesignation: string | null;
}
