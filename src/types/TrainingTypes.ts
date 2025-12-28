// Training System Types

// Syllabus Versioning
export interface TrainingSyllabusVersion {
  id: string;
  syllabusId: string;
  versionNumber: number;
  versionLabel?: string;
  createdAt: string;
  createdBy: string;
  isActive: boolean;

  // Snapshot data
  name: string;
  description?: string;
  aircraftType?: string;
  estimatedHours?: number;
  missions: VersionedMission[];

  notes?: string;
}

export interface VersionedMission {
  id: string;
  missionNumber: string;
  name: string;
  description?: string;
  sortOrder: number;
  referenceMaterials?: any[];
  trainingObjectives: VersionedObjective[];
}

export interface VersionedObjective {
  id: string;
  code: string;
  description: string;
  category?: string;
  sortOrder: number;
}

// Training Debriefing
export interface TrainingDebrief {
  id: string;
  eventId: string;
  syllabusId: string;
  missionId: string;
  versionId?: string;

  debriefedAt?: string;
  debriefedBy?: string;
  isFinalized: boolean;

  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface TrainingFlightDebrief {
  id: string;
  trainingDebriefId: string;
  flightId: string;
  instructorPilotId: string;

  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;

  createdAt: string;
  updatedAt: string;
  notes?: string;

  // Expanded data (not in DB)
  instructorPilot?: {
    id: string;
    callsign: string;
    boardNumber: string;
  };
  flight?: {
    id: string;
    name: string;
  };
}

export interface TrainingObjectiveScore {
  id: string;
  flightDebriefId: string;
  studentId: string;
  objectiveId: string;

  result: 'SAT' | 'UNSAT' | 'N/A';
  notes?: string;

  createdAt: string;
  updatedAt: string;
  scoredBy: string;

  // Expanded data (not in DB)
  student?: {
    id: string;
    callsign: string;
    boardNumber: string;
  };
  objective?: {
    id: string;
    code: string;
    description: string;
    category?: string;
  };
}

// PTR (Pilot Training Record) Data
export interface PTRRow {
  studentId: string;
  studentCallsign: string;
  studentBoardNumber: string;
  objectives: PTRCell[];
}

export interface PTRCell {
  missionId: string;
  missionNumber: string;
  missionName: string;
  objectiveId: string;
  objectiveCode: string;
  objectiveDescription: string;
  objectiveCategory?: string;

  result?: 'SAT' | 'UNSAT' | 'N/A';
  eventId?: string;
  eventDatetime?: string;
  scoredAt?: string;
}

export interface PTRObjectiveDetail {
  objectiveId: string;
  objectiveCode: string;
  objectiveDescription: string;
  objectiveCategory?: string;

  missionId: string;
  missionNumber: string;
  missionName: string;

  studentId: string;
  studentCallsign: string;

  result?: 'SAT' | 'UNSAT' | 'N/A';
  notes?: string;

  eventId?: string;
  eventName?: string;
  eventDatetime?: string;
  scoredAt?: string;
  scoredBy?: string;
  instructorPilot?: string;
}

// Training Management UI State
export interface TrainingManagementState {
  selectedSyllabusId?: string;
  selectedCycleId?: string;
  viewMode: 'overview' | 'ptr' | 'debriefs';
  filters: {
    showOnlyIncomplete?: boolean;
    squadronFilter?: string;
  };
}

export interface MyTrainingState {
  selectedSyllabusId?: string;
  viewMode: 'progress' | 'roadmap' | 'materials';
}

// Syllabus Editor State
export interface SyllabusEditorState {
  syllabusId?: string;
  isCreating: boolean;
  hasUnsavedChanges: boolean;
  currentVersion?: TrainingSyllabusVersion;
}

// Version Migration Options
export type VersionMigrationAction =
  | 'create_new_version'  // Create new version, leave old cycles on old version
  | 'migrate_all'         // Migrate all cycles to new version
  | 'migrate_future';     // Only migrate future/upcoming cycles

export interface VersionMigrationDialog {
  show: boolean;
  syllabusId: string;
  oldVersionNumber: number;
  newVersionNumber: number;
  affectedCycles: Array<{
    id: string;
    name: string;
    startDate: string;
    status: 'upcoming' | 'active' | 'completed';
  }>;
}

// Training Debrief UI State
export interface TrainingDebriefUIState {
  debriefId: string;
  selectedFlightId?: string;
  expandedStudents: Set<string>;
  sortBy: 'callsign' | 'boardNumber' | 'progress';
  filterBy: {
    showOnlyUnsat?: boolean;
    categoryFilter?: string;
  };
}

// Flight Debrief Form State
export interface FlightDebriefFormState {
  flightDebriefId: string;
  students: Array<{
    studentId: string;
    callsign: string;
    scores: Map<string, 'SAT' | 'UNSAT' | 'N/A'>;  // objectiveId -> result
    notes: Map<string, string>;  // objectiveId -> notes
  }>;
  isDirty: boolean;
  isLocked: boolean;
}

// Training Progress Summary
export interface TrainingProgressSummary {
  studentId: string;
  syllabusId: string;
  syllabusName: string;

  totalObjectives: number;
  completedObjectives: number;
  satisfactoryObjectives: number;
  unsatisfactoryObjectives: number;

  percentComplete: number;
  percentSatisfactory: number;

  lastTrainingEvent?: {
    eventId: string;
    eventName: string;
    eventDate: string;
    missionName: string;
  };

  nextMission?: {
    missionId: string;
    missionNumber: string;
    missionName: string;
  };
}

// Roadmap View
export interface TrainingRoadmapMission {
  missionId: string;
  missionNumber: string;
  missionName: string;
  description?: string;
  sortOrder: number;

  totalObjectives: number;
  completedObjectives: number;
  status: 'not_started' | 'in_progress' | 'completed';

  lastAttempt?: {
    eventId: string;
    eventDate: string;
    result: 'all_sat' | 'some_unsat' | 'incomplete';
  };
}
