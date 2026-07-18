import type { EventSettings, SupportRoleRequirement } from '../utils/supabaseClient';

export type CycleType = 'Training' | 'Cruise-WorkUp' | 'Cruise-Mission' | 'Other';
export type EventType = 'Hop' | 'Evolution' | 'Episode' | 'Re-attack' | 'Free Fly' | 'Foothold' | 'Pretense' | 'Other';

export interface ReferenceMaterial {
  type: string;
  name: string;
  url: string;
}

export type TrainingSyllabusKind = 'linear' | 'pool' | 'module' | 'advanced_qualification';

export interface TrainingSyllabus {
  id: string;
  name: string;
  description: string;
  kind?: TrainingSyllabusKind; // defaults to 'linear'
  reference_materials?: ReferenceMaterial[];
  created_at?: string;
  updated_at?: string;
}

export interface TrainingSyllabusMission {
  id: string;
  syllabus_id: string;
  mission_number: number | null;
  week_number?: number | null; // null for pool/module lessons
  mission_name: string;
  description?: string;
  reference_materials?: ReferenceMaterial[];
  image_url?: {
    headerImage?: string;
    additionalImages?: string[];
  } | null;
  created_at?: string;
  updated_at?: string;
}

// --- Event Activities (developer-flagged feature) ---
// An activity is defined by what it references, not who it's for:
// 'lesson' points at a training_syllabus_missions row (from any syllabus kind),
// 'objectives' carries an ad-hoc inline objective list,
// 'qualification' references a qualification being pursued.
export type EventActivityKind = 'lesson' | 'objectives' | 'qualification';

// Mirrors syllabus_training_objectives shape for ad-hoc objective lists
export interface AdHocObjective {
  id: string;
  text: string;
  scope_level: string;
  display_order: number;
}

// One eligibility rule inside a participant criteria block. All rule types are
// multi-select (pilot matches ANY listed value); 'squadron' stores squadron
// UUIDs (never tail code / designation), the other types store record names.
export interface EventActivityParticipantRule {
  type: 'squadron' | 'standing' | 'status' | 'qualification';
  value: string; // mirrors values[0] for backward compatibility
  values?: string[];
}

// AND within a block, OR across blocks (same semantics as syllabus
// auto-enrollment rules)
export interface EventActivityParticipantBlock {
  criteria: EventActivityParticipantRule[];
}

// Per-activity configuration stored in event_activities.settings (JSONB).
// Support roles and reference materials are aggregated up to the legacy
// event-level fields on save so the Discord bot and flag-off views keep working.
export interface EventActivitySettings {
  supportRoleRequirements?: SupportRoleRequirement[];
  referenceMaterials?: ReferenceMaterial[];
  participantCriteria?: EventActivityParticipantBlock[];
  requiresAar?: boolean; // opt-in: this activity's flights need After Action Reports (default false - training needs none)
}

export interface EventActivity {
  id?: string; // undefined until persisted
  eventId?: string;
  cycleId?: string;
  cycleActivityId?: string; // the cycle activity this was derived from (two-way reflection)
  kind: EventActivityKind;
  displayOrder: number;
  syllabusMissionId?: string; // 'lesson' kind
  qualificationId?: string; // 'qualification' kind
  label?: string; // 'objectives' title / display override
  adHocObjectives?: AdHocObjective[]; // 'objectives' kind
  settings?: EventActivitySettings;
}

// --- Cycle Activities (developer-flagged feature) ---
// A cycle-level activity spans a range of the cycle's weeks. Events created
// inside the cycle inherit the activities covering their week. 'syllabus'
// references a whole training_syllabi row (its kind - linear/pool/module/
// advanced_qualification - determines the UI treatment); 'objectives' carries
// an ad-hoc objective list.
export type CycleActivityKind = 'syllabus' | 'objectives';

export interface CycleActivity {
  id?: string; // undefined until persisted
  cycleId?: string;
  kind: CycleActivityKind;
  syllabusId?: string; // 'syllabus' kind
  label?: string;
  adHocObjectives?: AdHocObjective[]; // 'objectives' kind
  startWeek: number;
  endWeek: number;
  displayOrder: number;
  settings?: EventActivitySettings; // same shape as event activities
}

// Cycle-level Options/Reminders/Publication defaults for events created in the
// cycle (precedence: event's own settings > cycle settings > user settings).
// Mirrors the event-defaults fields the EventDialog reads from user settings.
export interface CycleSettings {
  timezone?: string;
  trackQualifications?: boolean;
  groupBySquadron?: boolean;
  showNoResponse?: boolean;
  allowTentativeResponse?: boolean;
  firstReminderEnabled?: boolean;
  firstReminderTime?: { value: number; unit: 'minutes' | 'hours' | 'days' };
  firstReminderRecipients?: { accepted: boolean; tentative: boolean; declined: boolean; noResponse: boolean };
  secondReminderEnabled?: boolean;
  secondReminderTime?: { value: number; unit: 'minutes' | 'hours' | 'days' };
  secondReminderRecipients?: { accepted: boolean; tentative: boolean; declined: boolean; noResponse: boolean };
  initialNotificationRoles?: Array<{ id: string; name: string }>;
  scheduledPublicationEnabled?: boolean;
  scheduledPublicationOffset?: { value: number; unit: 'minutes' | 'hours' | 'days' };
}

export interface Cycle {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: CycleType;
  status: 'active' | 'completed' | 'upcoming';
  creator: {
    boardNumber: string;
    callsign: string;
    billet: string;
  };
  restrictedTo?: string[];
  participants?: string[]; // Array of squadron IDs that participate in this cycle
  discordGuildId?: string; // Legacy field for backward compatibility
  syllabusId?: string; // Optional training syllabus for Training cycles
  settings?: CycleSettings; // Cycle-level event defaults (developer-flagged)
}

export interface Event {
    id: string;
    title: string; // Maps to name in database
    description: string | null;
    datetime: string; // Maps to start_datetime in database
    endDatetime?: string | null; // Maps to end_datetime in database
    status: string | null;
    eventType?: EventType | undefined; // Maps to event_type in database
    cycleId?: string | undefined; // Maps to cycle_id in database
    discordEventId?: string | undefined; // Legacy field for backward compatibility
    discord_event_id?: Array<{
      messageId: string;
      guildId: string;
      channelId: string;
      squadronId: string;
    }> | undefined; // JSONB array of Discord publication records
    imageUrl?: string | undefined; // Maps to image_url in database (legacy single image)
    headerImageUrl?: string | undefined; // Header image URL
    additionalImageUrls?: string[] | undefined; // Additional image URLs
    restrictedTo?: string[]; // Used in code but not in database schema
    participants?: string[]; // Override cycle's participating squadrons
    trackQualifications?: boolean; // Whether to group responses by qualification
    // Event-specific settings (stored in event_settings JSONB column)
    eventSettings?: EventSettings;
    // Training workflow fields
    syllabusMissionId?: string; // Optional syllabus mission for training events (legacy/derived when activities are used)
    activities?: EventActivity[]; // Event activities (developer-flagged; absent/empty = legacy behavior)
    referenceMaterials?: ReferenceMaterial[]; // Event-specific reference materials
    // Attendance report settings
    includeInAttendanceReport?: boolean; // Whether to include this event in cycle attendance reports (defaults to true)
    creator: {
      boardNumber: string;
      callsign: string;
      billet: string;
    };
    attendance: {
      accepted: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
      declined: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
      tentative: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
    };
}