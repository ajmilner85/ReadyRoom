# Mission Debriefing Feature

## Purpose
Provide a comprehensive after-action reporting system for Flight Leads and leadership to assess mission performance, track pilot achievements, and maintain squadron/wing readiness standards.

## Overview
The Mission Debriefing system allows Flight Leads to submit standardized after-action reports following missions, rating their flight's performance across key tactical categories. Squadron and Wing leadership can review individual flight reports and analyze aggregate performance data across their organization.

---

## Key Files

### Components (To Be Created)
- `src/components/debriefing/MissionDebriefing.tsx` - Main debriefing page/router
- `src/components/debriefing/DebriefingList.tsx` - List of missions requiring/with debriefs
- `src/components/debriefing/FlightDebriefForm.tsx` - Flight Lead AAR submission form
- `src/components/debriefing/PerformanceCategories.tsx` - SAT/UNSAT rating component
- `src/components/debriefing/KillTracker.tsx` - A2A/A2G kill recording
- `src/components/debriefing/LeadershipDashboard.tsx` - Squadron/Wing aggregate view
- `src/components/debriefing/DelegationManager.tsx` - Delegate report responsibility

### Services (To Be Created)
- `src/utils/debriefingService.ts` - CRUD operations for debriefs
- `src/utils/killTrackingService.ts` - Kill/target tracking logic
- `src/utils/debriefingPermissions.ts` - Permission checks for debrief access

### Types (To Be Created)
- `src/types/DebriefingTypes.ts` - Debriefing data structures

---

## Data Model

### Core Tables

#### `mission_debriefings`
Main table storing the debriefing record for each mission.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `mission_id` | uuid | Foreign key to missions table |
| `mission_status` | enum | 'pending', 'in_progress', 'complete', 'scrubbed' |
| `status` | enum | 'in_progress', 'submitted', 'finalized' |
| `mission_objectives` | jsonb | Mission objectives with success/failure status (future) |
| `tacview_file_url` | text | URL to Tacview recording in cloud storage (R2) |
| `tacview_uploaded_by` | uuid | Foreign key to user_profiles |
| `tacview_uploaded_at` | timestamptz | When Tacview file was uploaded |
| `finalized_by` | uuid | User who finalized (department head) |
| `finalized_at` | timestamptz | When finalized |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |
| `created_by` | uuid | Foreign key to user_profiles |

**Mission Status Transitions:**
- `pending` → Created, awaiting mission execution
- `in_progress` → Set when Flight Assignments are published from Mission Prep
- `complete` → Set manually by authorized users after mission completion
- `scrubbed` → Mission cancelled/not executed

**Mission Objectives JSONB Structure (Future Bonus Feature):**
```json
{
  "objectives": [
    {
      "id": "uuid",
      "description": "Destroy enemy SAM sites",
      "priority": "primary" | "secondary",
      "status": "success" | "failure" | "partial",
      "notes": "text",
      "assessed_by": "user_profile_id"
    }
  ]
}
```

**Relationships:**
- One-to-one with `missions` (one debriefing per mission)
- One-to-many with `flight_debriefs` (multiple flights per mission)

---

#### `flight_debriefs`
Individual flight after-action reports submitted by Flight Leads.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `mission_debriefing_id` | uuid | Foreign key to mission_debriefings |
| `flight_id` | string | Flight identifier from mission.flights |
| `callsign` | string | Flight callsign (denormalized for easier queries) |
| `squadron_id` | uuid | Foreign key to organizations (squadrons) |
| `flight_lead_pilot_id` | uuid | Foreign key to pilots (the -1 slot pilot) |
| `submitted_by_user_id` | uuid | Foreign key to user_profiles (actual submitter) |
| `submitted_at` | timestamptz | Submission timestamp |
| `flight_status` | enum | 'scheduled', 'launched', 'scrubbed' |
| `status` | enum | 'pending', 'submitted', 'finalized' |
| `performance_ratings` | jsonb | SAT/UNSAT ratings (see structure below) |
| `key_lessons_learned` | text | Final comments section |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

**Flight Status:**
- `scheduled` → Default when created
- `launched` → Flight participated in mission (default assumption if AAR submitted)
- `scrubbed` → Flight did not launch; can be set by Flight Lead or authorized user

**Performance Ratings JSONB Structure:**
```json
{
  "mission_planning": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "flight_discipline": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "formation_navigation": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "tactical_execution": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "situational_awareness": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "weapons_employment": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "survivability_safety": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  },
  "debrief_participation": {
    "rating": "SAT" | "UNSAT",
    "comments": "text"
  }
}
```

**Relationships:**
- Many-to-one with `mission_debriefings`
- One-to-many with `pilot_kills` (multiple pilots in flight)
- Many-to-one with `pilots` (flight_lead_pilot_id)
- Many-to-one with `user_profiles` (submitted_by_user_id)

**Notes:**
- `submitted_by_user_id` may differ from flight lead if delegated
- `status` transitions: pending → submitted → finalized
- Once finalized by department head, record becomes read-only (except for authorized overrides)

---

#### `pilot_kills`
**Phase 1 (Simple):** Track aggregate kill counts per pilot per mission.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `flight_debrief_id` | uuid | Foreign key to flight_debriefs |
| `pilot_id` | uuid | Foreign key to pilots |
| `mission_id` | uuid | Foreign key to missions (denormalized) |
| `air_to_air_kills` | integer | Total A2A kills |
| `air_to_ground_kills` | integer | Total A2G targets destroyed |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

**Phase 2 (Detailed):** Add specific kill tracking with types and weapons.

Additional columns for Phase 2:
| Column | Type | Description |
|--------|------|-------------|
| `kill_type` | enum | 'air_to_air', 'air_to_ground' |
| `target_type_id` | uuid | Foreign key to ref_target_types |
| `weapon_type_id` | uuid | Foreign key to ref_weapon_types |
| `quantity` | integer | Number of this type destroyed |

---

#### `ref_target_types` (Phase 2)
Reference table for aircraft and ground target types.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `category` | enum | 'aircraft', 'ground_target' |
| `name` | string | Display name (e.g., "Su-27", "SA-10 Battery") |
| `dcs_identifier` | string | DCS internal name/type for .miz mapping |
| `icon_url` | string | Optional icon for UI |
| `active` | boolean | Whether type is currently in use |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

**Relationships:**
- One-to-many with `pilot_kills` (Phase 2)
- One-to-many with `mission_target_inventory` (Phase 2)

---

#### `ref_weapon_types` (Phase 2)
Reference table for weapon types.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | string | Display name (e.g., "AIM-120", "GBU-38", "Gun") |
| `dcs_identifier` | string | DCS internal name for .miz mapping |
| `category` | enum | 'air_to_air', 'air_to_ground', 'gun' |
| `active` | boolean | Whether weapon is currently in use |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

---

#### `mission_target_inventory` (Phase 2)
Tracks which targets were present in the mission (from .miz import).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `mission_id` | uuid | Foreign key to missions |
| `target_type_id` | uuid | Foreign key to ref_target_types |
| `quantity` | integer | Number present in mission |
| `source` | enum | 'miz_import', 'manual_addition' |
| `added_by` | uuid | Foreign key to user_profiles (if manual) |
| `created_at` | timestamptz | Creation timestamp |

**Purpose:** Pre-populate kill tracking form with targets that were actually in the mission.

---

#### `debrief_delegation`
Tracks delegation of debrief submission responsibility.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `flight_debrief_id` | uuid | Foreign key to flight_debriefs |
| `original_flight_lead_id` | uuid | Foreign key to pilots (the -1 slot) |
| `delegated_to_user_id` | uuid | Foreign key to user_profiles |
| `delegated_by_user_id` | uuid | Foreign key to user_profiles |
| `reason` | text | Optional explanation |
| `created_at` | timestamptz | When delegation occurred |

**Relationships:**
- Many-to-one with `flight_debriefs`
- Many-to-one with `pilots` (original_flight_lead_id)
- Many-to-one with `user_profiles` (delegated_to, delegated_by)

---

#### `aar_reminders`
Tracks scheduled AAR submission reminders (separate from event reminders).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `mission_id` | uuid | Foreign key to missions |
| `flight_debrief_id` | uuid | Foreign key to flight_debriefs (null for mission-level reminders) |
| `squadron_id` | uuid | Foreign key to organizations (for filtering) |
| `reminder_type` | enum | 'first_reminder', 'second_reminder' |
| `scheduled_for` | timestamptz | When reminder should be sent |
| `sent_at` | timestamptz | When reminder was actually sent (null if not sent yet) |
| `recipients` | jsonb | Array of user/pilot IDs to notify |
| `additional_recipients` | jsonb | Leadership to notify (for 2nd reminder) |
| `message_id` | text | Discord message ID (for tracking) |
| `created_at` | timestamptz | Creation timestamp |

**Relationships:**
- Many-to-one with `missions`
- Many-to-one with `flight_debriefs` (optional)
- Many-to-one with `organizations` (squadrons)

**JSONB Structures:**

`recipients`:
```json
[
  {
    "pilot_id": "uuid",
    "user_id": "uuid",
    "discord_id": "discord-user-id",
    "flight_callsign": "STING 1"
  }
]
```

`additional_recipients`:
```json
[
  {
    "user_id": "uuid",
    "discord_id": "discord-user-id",
    "role": "CO" | "XO" | "Operations Officer"
  }
]
```

**Notes:**
- Separate table from `event_reminders` to maintain clear separation of concerns
- Background processor checks this table every 15 minutes for pending reminders
- Reminders are marked as sent by updating `sent_at` timestamp
- Leadership recipients (CO, XO) are only notified on 2nd reminder

---

## Permissions System

### Permission System Enhancements

To support Mission Debriefing, the permission system needs the following enhancements:

**1. Add "Flight" Scope Level**
- Current `ScopeType` enum: `'global' | 'squadron' | 'wing'`
- **Add**: `'flight'` to support flight-level permissions
- "Flight" scope means user can only perform action on flights where they are the flight lead

**2. Add `available_scopes` Field to `app_permissions` Table**
- **New column**: `available_scopes` (text[] or jsonb)
- Defines which scopes are valid for each permission
- Example:
  - `view_debriefs`: `["flight", "squadron", "wing", "global"]`
  - `manage_roster`: `["squadron", "wing", "global"]` (no flight scope)
  - `manage_change_log`: `["global"]` (only global scope)

**3. Update Permission Matrix UI**
- Only display scope toggles that are in the permission's `available_scopes`
- For Mission Debriefing permissions, show: `[ ] Flight  [ ] Squadron  [ ] Wing  [ ] Global`

### New Permissions to Add

The following permissions should be added to the `app_permissions` table:

### View Permissions

| Permission Name | Display Name | Available Scopes | Description |
|----------------|--------------|-----------------|-------------|
| `view_debriefs` | View Mission Debriefs | flight, squadron, wing, global | View mission debriefing data |
| `view_aggregate_debriefs` | View Aggregate Debrief Data | squadron, wing, global | View aggregate performance statistics |

### Edit Permissions

| Permission Name | Display Name | Available Scopes | Description |
|----------------|--------------|-----------------|-------------|
| `edit_debriefs` | Edit Mission Debriefs | flight, squadron, wing, global | Edit flight after-action reports |
| `finalize_debriefs` | Finalize Mission Debriefs | squadron, wing, global | Mark debriefs as finalized (read-only) |

### Delegation Permissions

| Permission Name | Display Name | Available Scopes | Description |
|----------------|--------------|-----------------|-------------|
| `delegate_debrief` | Delegate Debrief Responsibility | flight, squadron, wing, global | Delegate or reassign debrief submission responsibility |

**Notes on Delegation:**
- **Flight scope**: User can delegate their own flight's debrief to another flight member
- **Squadron scope**: User can reassign any debrief within their squadron
- **Wing scope**: User can reassign any debrief within their wing
- **Global scope**: User can reassign any debrief across all wings

### Tacview & Mission Status Permissions

| Permission Name | Display Name | Available Scopes | Description |
|----------------|--------------|-----------------|-------------|
| `upload_tacview_recording` | Upload Tacview Recording | squadron, wing, global | Upload Tacview file for mission (requires Cloudflare R2) |
| `download_tacview_recording` | Download Tacview Recording | squadron, wing, global | Download Tacview file from mission |
| `set_mission_status` | Set Mission Status | squadron, wing, global | Change mission status (pending/in_progress/complete/scrubbed) |
| `set_flight_status` | Set Flight Status | flight, squadron, wing, global | Mark flight as scrubbed |
| `assess_mission_objectives` | Assess Mission Objectives | squadron, wing, global | Mark mission objectives as success/failure (future) |
| `publish_aar_discord` | Publish AAR to Discord | squadron, wing, global | Post AAR infographic to Discord channel |

### Permission Logic

**Flight Lead Default Permissions:**
- Automatically granted `edit_debriefs` at **Flight scope** for their assigned flight
- Can delegate via `delegate_debrief` at **Flight scope** (scoped to their flight members)
- Loses edit permission after delegation (unless explicitly reassigned)

**Squadron Leadership (e.g., XO, Operations Officer):**
- Typically granted:
  - `view_debriefs` at **Wing scope** (can see all squadrons in wing)
  - `edit_debriefs` at **Squadron scope** (can edit own squadron only)
  - `finalize_debriefs` at **Squadron scope**
  - `view_aggregate_debriefs` at **Squadron scope**
  - `delegate_debrief` at **Squadron scope**

**Wing Leadership (e.g., CAG, Wing Commander):**
- Typically granted:
  - `view_debriefs` at **Wing scope**
  - `edit_debriefs` at **Wing scope**
  - `finalize_debriefs` at **Wing scope**
  - `view_aggregate_debriefs` at **Wing scope**
  - `delegate_debrief` at **Wing scope**

**Department Heads:**
- Require `finalize_debriefs` permission (Squadron/Wing/Global scope) to mark debriefs as complete
- Once finalized, only users with appropriate `edit_debriefs` permissions can override

**Permission Summary:**
- Total new permissions: **10**
  - 2 view permissions
  - 2 edit permissions
  - 1 delegation permission
  - 5 Tacview & status permissions

---

## User Workflows

### 1. Flight Lead Submits Debrief

**Trigger:** Navigate to `/mission-debriefing` or click "After Action Report" from Events page

**Prerequisites:**
- Event start time has passed
- User is assigned to -1 slot in mission OR has been delegated responsibility
- User has `edit_debriefs_own_flight` permission (or higher)

**Flow:**
1. User sees list of missions requiring debriefing (filtered by permissions)
2. Selects mission → sees their flight(s)
3. Clicks "Submit Debrief" for their flight
4. Form loads with:
   - Flight information (callsign, squadron, pilots assigned)
   - 8 performance categories with SAT/UNSAT radio buttons
   - Text area for amplifying comments under each category
   - Kill tracker section (A2A and A2G counts per pilot)
   - "Key Lessons Learned" final comments section
5. User fills out form:
   - All 8 categories must be rated (validation)
   - Comments are optional but encouraged
   - Adds kill counts for each pilot in flight
6. User clicks "Save Draft" or "Submit"
   - "Save Draft" keeps status as 'pending' (editable)
   - "Submit" changes status to 'submitted' (editable until finalized)
7. Success message displayed
8. Optional: System sends notification to squadron leadership

**Validation Rules:**
- All 8 performance categories must have a rating
- At least one comment is recommended (warning, not blocker)
- Kill counts must be non-negative integers

---

### 2. Flight Lead Delegates Debrief

**Trigger:** Flight lead unable to submit, delegates to another pilot

**Prerequisites:**
- User is the flight lead (or has reassign permission)
- User has `delegate_own_debrief` permission

**Flow:**
1. Flight lead navigates to their pending debrief
2. Clicks "Delegate" button
3. Modal opens showing:
   - List of pilots in their flight (if flight-scoped permission)
   - List of squadron members (if squadron-scoped permission)
4. Selects user to delegate to
5. Optionally adds reason for delegation
6. Confirms delegation
7. System:
   - Creates record in `debrief_delegation` table
   - Updates `flight_debriefs.submitted_by_user_id` expectation
   - Sends notification to delegated user
   - Removes edit access from original flight lead
8. Delegated user can now submit the debrief

---

### 3. Squadron Leadership Reviews Debriefs

**Trigger:** Navigate to `/mission-debriefing` with squadron-level permissions

**Prerequisites:**
- User has `view_debriefs_squadron` permission (or higher)

**Flow:**
1. Dashboard loads showing:
   - List of missions with debrief status
   - Filters: Date range, squadron, status (pending/submitted/finalized)
   - Aggregate statistics (if `view_aggregate_squadron` permission)
2. User clicks on a mission
3. Sees all flight debriefs for their squadron:
   - Flight callsign, flight lead, submission status
   - Quick view of SAT/UNSAT summary
4. User can click individual flight to view full details
5. If user has `edit_debriefs_squadron`:
   - Can modify any flight debrief
   - Can add comments/corrections
6. If user has `finalize_debriefs_squadron`:
   - Can click "Finalize" to lock debrief (read-only)
7. If user has `view_aggregate_squadron`:
   - Sees aggregate statistics tab:
     - Percentage SAT across all categories
     - Total kills by type
     - Trend over time (multiple missions)

---

### 4. Wing Leadership Views Aggregate Data

**Trigger:** Navigate to `/mission-debriefing` with wing-level permissions

**Prerequisites:**
- User has `view_debriefs_wing` or `view_aggregate_wing` permission

**Flow:**
1. Dashboard loads with wing-wide view:
   - All squadrons in wing
   - Mission list across all squadrons
   - Aggregate performance metrics
2. User can:
   - Filter by squadron, date range, mission type
   - View individual flight debriefs (if view permission)
   - Edit debriefs (if edit permission)
   - Finalize debriefs (if finalize permission)
3. Aggregate data shows:
   - Squadron comparison (% SAT by category)
   - Kill statistics by squadron
   - Trend analysis over time
4. Can export data to Excel (using existing `xlsx` library)

---

## UI Components

### Main Debriefing Page (`/mission-debriefing`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Mission Debriefing                                [Export]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Filters: [Squadron ▼] [Date Range] [Status ▼] [Search]        │
│                                                                  │
│  Tabs: [ My Flights ] [ Squadron ] [ Wing ] [ Aggregate ]      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Mission: Operation Red Flag - Jan 15, 2025             │    │
│  │ Status: 3/5 flights submitted  [View Details]          │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Mission: Strike on Batumi - Jan 10, 2025               │    │
│  │ Status: Finalized  [View Report]                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Tabs visible based on permissions:**
- "My Flights" - Always visible (shows flights where user was assigned)
- "Squadron" - Visible if `view_debriefs_squadron` or higher
- "Wing" - Visible if `view_debriefs_wing` or higher
- "Aggregate" - Visible if `view_aggregate_*` permission

---

### Flight Debrief Form

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  After Action Report - VIPER 1                                  │
│  Mission: Operation Red Flag | Date: Jan 15, 2025 | VFA-113    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Flight Lead: 100 | "Maverick" Smith                            │
│  Flight Members: 101 "Goose", 102 "Iceman", 103 "Slider"        │
│                                                                  │
│  [Delegate Responsibility]                                      │
│                                                                  │
│  ── Performance Assessment ──────────────────────────────────   │
│                                                                  │
│  1. Mission Planning & Brief Execution                          │
│     ○ SAT   ○ UNSAT                                            │
│     Comments: ___________________________________________        │
│                                                                  │
│  2. Flight Discipline & Communication                           │
│     ○ SAT   ○ UNSAT                                            │
│     Comments: ___________________________________________        │
│                                                                  │
│  [... 6 more categories ...]                                    │
│                                                                  │
│  ── Kill Tracking ───────────────────────────────────────────   │
│                                                                  │
│  100 "Maverick" Smith                                           │
│    A2A Kills: [2]  A2G Targets: [3]                            │
│                                                                  │
│  101 "Goose" Mitchell                                           │
│    A2A Kills: [1]  A2G Targets: [2]                            │
│                                                                  │
│  [... other pilots ...]                                         │
│                                                                  │
│  ── Key Lessons Learned ─────────────────────────────────────   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [Free text area for final comments]                      │  │
│  │                                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Save Draft]  [Submit]  [Cancel]                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Aggregate Performance Dashboard

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Squadron Performance - VFA-113                                 │
│  Missions Analyzed: 12 | Date Range: Dec 2024 - Jan 2025       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Performance Categories (% SAT)                        │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ Mission Planning        ████████░░ 82%          │   │    │
│  │  │ Flight Discipline       ██████████ 95%          │   │    │
│  │  │ Formation & Nav         ████████░░ 78%          │   │    │
│  │  │ Tactical Execution      ██████░░░░ 68%          │   │    │
│  │  │ Situational Awareness   ████████░░ 85%          │   │    │
│  │  │ Weapons Employment      ███████░░░ 73%          │   │    │
│  │  │ Survivability           ██████████ 100%         │   │    │
│  │  │ Debrief Participation   █████████░ 91%          │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Kill Statistics                                       │    │
│  │  Total A2A: 47  |  Total A2G: 156                     │    │
│  │  Top Performers: Maverick (12), Iceman (9), Viper (8) │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [Export to Excel]  [View Detailed Breakdown]                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Uses Chart.js (already in dependencies) for visualizations.

---

## Integration Points

### Events Page

**Changes needed:**
- Add "After Action Report" button to Mission event cards
- Button visible only after event start time
- Button links to `/mission-debriefing?eventId={id}&missionId={missionId}`
- Badge showing debrief status: "Pending (3/5)", "Submitted", "Finalized"

**File to modify:** `src/components/ui/EventsManagement.tsx`

---

### Mission Service

**Enhancements needed:**
- Add method to extract Flight Lead pilot IDs from mission data:
  ```typescript
  export const getFlightLeads = (mission: Mission): FlightLeadInfo[] => {
    // Parse mission.pilot_assignments
    // Find all assignments where dash_number === '-1'
    // Return array of { flightId, pilotId, callsign, squadronId }
  }
  ```

**File to modify:** `src/utils/missionService.ts`

---

### Roster/Pilot Service

**Enhancements needed:**
- Link pilot kills to pilot profile (Phase 2)
- Aggregate career statistics (Phase 2)

---

### Discord Integration (Bonus Feature)

**New API Endpoint:** `POST /api/discord/post-debrief-infographic`

**Request:**
```json
{
  "missionId": "uuid",
  "guildId": "discord-guild-id",
  "channelId": "discord-channel-id",
  "infographicData": {
    "squadronPerformance": [...],
    "topPerformers": [...],
    "missionSummary": "..."
  }
}
```

**Process:**
1. Generate infographic image (using html-to-image or similar)
2. Post to Discord channel
3. Include summary text with key stats

**File to create:** `server/lib/debriefingInfographic.js`

---

## Implementation Phases

### Phase 1: Core Functionality (MVP)
**Goal:** Allow Flight Leads to submit basic debriefs with SAT/UNSAT ratings and simple kill counts.

**Tasks:**
1. **Database Setup**
   - Create `mission_debriefings` table
   - Create `flight_debriefs` table (with performance_ratings JSONB)
   - Create `pilot_kills` table (simple counts only)
   - Create `debrief_delegation` table
   - Add RLS policies for Wing-based access
   - Add indexes for performance

2. **Permissions Setup**
   - Add new permissions to `app_permissions` table
   - Create default permission rules for common roles
   - Update `UserPermissions` interface in TypeScript

3. **Backend Services**
   - `debriefingService.ts`:
     - `createMissionDebrief(missionId)`
     - `getDebriefByMissionId(missionId)`
     - `createFlightDebrief(data)`
     - `updateFlightDebrief(id, data)`
     - `finalizeFlightDebrief(id)`
   - `killTrackingService.ts`:
     - `recordKills(flightDebriefId, pilotId, a2a, a2g)`
     - `getKillsByFlight(flightDebriefId)`
   - `debriefingPermissions.ts`:
     - `canViewDebrief(userId, debriefId)`
     - `canEditDebrief(userId, debriefId)`
     - `canFinalizeDebrief(userId, debriefId)`

4. **Frontend Components**
   - `MissionDebriefing.tsx` - Main page with tabs and filtering
   - `DebriefingList.tsx` - List of missions
   - `FlightDebriefForm.tsx` - SAT/UNSAT rating form
   - `PerformanceCategories.tsx` - Reusable rating component
   - `KillTracker.tsx` - Simple A2A/A2G count inputs

5. **UI Integration**
   - Add route: `/mission-debriefing`
   - Add navigation menu item (permission-gated)
   - Add "After Action Report" button to Events page Mission cards
   - Add status badges to mission cards

6. **Testing & Validation**
   - Test Flight Lead submission flow
   - Test permission enforcement
   - Test debrief list filtering
   - Test status transitions (pending → submitted → finalized)

**Deliverables:**
- Flight Leads can submit basic debriefs
- Leadership can view submitted debriefs
- Simple aggregate statistics (% SAT)
- Delegation works (basic)

---

### Phase 2: Enhanced Kill Tracking
**Goal:** Add detailed kill tracking with aircraft/target types and weapons.

**Tasks:**
1. **Database Enhancements**
   - Create `ref_target_types` table
   - Create `ref_weapon_types` table
   - Create `mission_target_inventory` table
   - Modify `pilot_kills` table to support detailed tracking
   - Seed reference tables with DCS data

2. **MIZ Import Enhancement**
   - Parse .miz file to extract target types present
   - Populate `mission_target_inventory` automatically
   - Extract weapon loadouts (optional, advanced)

3. **Frontend Enhancements**
   - Enhanced `KillTracker.tsx`:
     - Show target types from mission inventory
     - Quick-add buttons for common targets
     - Add "Other" targets dynamically
     - Select weapon type for each kill
   - Target type autocomplete
   - Visual icons for aircraft/targets

4. **Reference Data Management**
   - Admin UI to manage target types
   - Admin UI to manage weapon types
   - Sync with DCS updates (manual initially)

**Deliverables:**
- Detailed kill tracking with types
- Pre-populated targets from .miz import
- Weapon type recording

---

### Phase 3: Aggregate Dashboards & Analytics
**Goal:** Provide leadership with comprehensive performance analytics.

**Tasks:**
1. **Backend Analytics**
   - Aggregate statistics queries
   - Trend analysis (over time)
   - Squadron comparison
   - Export to Excel

2. **Frontend Dashboards**
   - `LeadershipDashboard.tsx`:
     - Chart.js visualizations
     - Performance trends over time
     - Squadron/Wing comparisons
   - `DebriefingReports.tsx`:
     - Detailed report generation
     - Export functionality

3. **Reports Integration**
   - Add debriefing section to existing Reports page
   - Link to detailed debriefing data

**Deliverables:**
- Comprehensive leadership dashboards
- Trend analysis and comparisons
- Excel export for offline analysis

---

### Phase 4: Discord Integration & Service Records
**Goal:** Post performance summaries to Discord and integrate with pilot service records.

**Tasks:**
1. **Discord Infographic**
   - Generate infographic image
   - Post to Discord channel
   - Notification system for pending debriefs

2. **Service Record Integration**
   - Link kills to pilot profiles
   - Career kill statistics
   - Performance history

3. **Automation & Reminders**
   - Reminder system for pending debriefs
   - Auto-notification to leadership when all debriefs submitted
   - Integration with SDOBot

**Deliverables:**
- Discord infographic posting
- Pilot service record with career stats
- Automated reminders

---

## Detailed Implementation Specifications

### Leadership Dashboard Design

The Mission Debriefing page presents a comprehensive view for leadership to monitor and assess mission performance.

**Main Interface Components:**

1. **Cycle & Event Selectors** (Top of page)
   - Dropdown for Cycle selection (similar to Mission Preparation page)
   - Dropdown for Event selection within cycle
   - Filter flights based on selected event/mission

2. **Flight List** (Left panel, ~40% width)
   - Displays all flights for selected mission
   - Each flight entry shows:
     - **Callsign** (e.g., "STING 1", "HAWK 2")
     - **Flight Lead** (Board # and Callsign)
     - **Status Indicator**:
       - If pending: Orange badge "PENDING AAR"
       - If submitted: Performance summary showing:
         - Percentage score: "SAT: 7/8 (87.5%)"
         - Kill tallies: "A2A: 3 | A2G: 5"
       - If scrubbed: Gray badge "SCRUBBED"
   - Click flight to view detailed AAR in modal/panel
   - Sort options: By callsign, by squadron, by status

3. **Squadron Performance Cards** (Right panel, ~60% width)
   - Grouped by Wing, then Squadron
   - Wing-level summary card at top:
     - Wing name and insignia
     - Overall SAT percentage across all categories
     - Total A2A and A2G kills for wing
     - Number of flights submitted/total
   - Squadron cards below, grouped under wing:
     - Squadron name and insignia
     - SAT percentage for squadron
     - Total kills for squadron
     - Number of flights submitted/total
     - Color-coded: Green (>80% SAT), Yellow (60-80%), Red (<60%)

4. **Export Options**
   - Export to Excel: Mission summary with all flight data
   - Export to PDF: Future enhancement (not Phase 1)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Mission Debriefing                                              │
│  Cycle: [Training Cycle Q1 ▼]  Event: [Red Flag Jan 15 ▼]      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  Flight List             │  │  Wing Performance            │ │
│  │  ───────────────────     │  │  ────────────────────────    │ │
│  │                          │  │  CVW-8                       │ │
│  │  ┌────────────────────┐  │  │  SAT: 82% | A2A: 12 A2G: 47 │ │
│  │  │ STING 1            │  │  │  Flights: 8/10              │ │
│  │  │ FL: 100 "Maverick" │  │  │                             │ │
│  │  │ SAT: 7/8 (87.5%)   │  │  │  ┌────────────────────────┐ │ │
│  │  │ A2A: 2 | A2G: 3    │  │  │  │  VFA-113 (Squadron)    │ │ │
│  │  └────────────────────┘  │  │  │  SAT: 85% | A2A: 5 | 19│ │ │
│  │                          │  │  │  Flights: 3/4          │ │ │
│  │  ┌────────────────────┐  │  │  └────────────────────────┘ │ │
│  │  │ STING 2            │  │  │                             │ │
│  │  │ FL: 101 "Goose"    │  │  │  ┌────────────────────────┐ │ │
│  │  │ PENDING AAR        │  │  │  │  VFA-211 (Squadron)    │ │ │
│  │  └────────────────────┘  │  │  │  SAT: 80% | A2A: 7 | 28│ │ │
│  │                          │  │  │  Flights: 5/6          │ │ │
│  │  ┌────────────────────┐  │  │  └────────────────────────┘ │ │
│  │  │ HAWK 1 (SCRUBBED)  │  │  │                             │ │
│  │  └────────────────────┘  │  └──────────────────────────────┘ │
│  └──────────────────────────┘                                   │
│                                                                   │
│  [Export to Excel]  [Publish AAR to Discord]                    │
└──────────────────────────────────────────────────────────────────┘
```

---

### Discord Integration Specifications

#### AAR Channel Configuration

**Settings Location:** Settings → Discord Integration → AAR Channel

**New Settings Fields:**
- **AAR Channel** (dropdown): Select Discord channel for AAR posting
  - Shows list of channels from connected Discord server
  - Separate from event publication channel
  - Can be same channel if desired, but defaults to dedicated channel

**Settings UI Addition:**
```
Discord Integration Settings
────────────────────────────
Event Publication Channel:  [#squadron-events ▼]
AAR Channel:               [#after-action-reports ▼]
```

#### Infographic Content

The Discord AAR infographic includes:

1. **Mission Header**
   - Mission name
   - Date/time
   - Participating squadrons

2. **Wing Performance**
   - Overall SAT percentage
   - Total A2A kills
   - Total A2G kills
   - Flights completed/total

3. **Squadron Breakdowns**
   - Each squadron's SAT percentage
   - Kill counts per squadron
   - Visual bar charts or progress bars

4. **Top Performing Flight**
   - Callsign
   - Flight Lead name
   - 100% SAT achievement or highest kill count
   - Optional: Include squadron insignia

**Posting Trigger:**
- **Manual only** (Phase 1-3)
- User with `publish_aar_discord` permission clicks "Publish AAR to Discord" button
- Confirmation dialog before posting
- Button only enabled when at least one flight has submitted AAR

**Example Infographic:**
```
╔══════════════════════════════════════════════════════════╗
║  AFTER ACTION REPORT                                     ║
║  Operation Red Flag - January 15, 2025                   ║
╠══════════════════════════════════════════════════════════╣
║  CVW-8 Performance                                       ║
║  SAT: 82% (66/80 categories) | A2A: 12 | A2G: 47        ║
║  Flights: 10 sorties                                     ║
╠══════════════════════════════════════════════════════════╣
║  Squadron Performance                                    ║
║  ───────────────────────────────────────────────────     ║
║  VFA-113  ████████░░ 85% | A2A: 5 | A2G: 19            ║
║  VFA-211  ████████░░ 80% | A2A: 7 | A2G: 28            ║
║                                                          ║
║  Top Flight: STING 1 (VFA-113)                          ║
║  FL: 100 "Maverick" Smith                               ║
║  100% SAT | A2A: 2 | A2G: 3                             ║
╚══════════════════════════════════════════════════════════╝
```

**Implementation:**
- Use `html-to-image` library (already in dependencies) to generate PNG
- Post via existing `POST /api/discord/post-image` endpoint
- Store Discord message ID in `mission_debriefings` table for reference

---

### AAR Submission Reminder System

#### Configuration (Squadron Settings)

**Settings Location:** Settings → Events → AAR Reminders (new section)

**Configuration Options:**
1. **Enable AAR Reminders** (toggle)
   - Default: Disabled
   - Enables automated reminder system

2. **Reminder Schedule**
   - **First Reminder:** X hours after event end time
     - Input field: Number (default: 24)
     - Dropdown: hours/days
   - **Second Reminder:** Y hours after event end time
     - Input field: Number (default: 48)
     - Dropdown: hours/days
   - Validation: Second reminder must be > First reminder

3. **Additional Recipients** (multi-select)
   - Tag squadron leadership (CO, XO, etc.) in reminder
   - Optional: Notify if Flight Lead is truant
   - Multi-select from squadron members with appropriate roles

**Settings UI:**
```
AAR Reminder Settings
─────────────────────────────────────────────────
☑ Enable AAR Reminders

First Reminder:  [24] [hours ▼] after event end
Second Reminder: [48] [hours ▼] after event end

Additional Recipients (notified if Flight Lead is truant):
  ☑ CO - 100 "Maverick" Smith
  ☑ XO - 101 "Goose" Mitchell
  ☐ Operations Officer - 102 "Iceman" Kazansky
```

#### Reminder Behavior

**Processing:**
- Background job runs every 15 minutes (similar to event reminders)
- Checks `flight_debriefs` table for flights with `status = 'pending'`
- Compares current time against event end time + reminder offset
- Sends reminders to AAR channel via SDOBot

**Reminder Message Format:**
```
📋 **AAR Submission Reminder**

The following Flight Leads have pending After Action Reports for **Operation Red Flag (Jan 15, 2025)**:

@Maverick (STING 1), @Goose (STING 2), @Iceman (VIPER 1)

Please submit your AARs at your earliest convenience.

[Link to Mission Debriefing Page]
```

**Second Reminder with Leadership Notification:**
```
📋 **AAR Submission Reminder (2nd Notice)**

The following Flight Leads still have pending After Action Reports for **Operation Red Flag (Jan 15, 2025)**:

@Goose (STING 2)

Notifying: @CO @XO

Please submit your AAR or contact squadron leadership.

[Link to Mission Debriefing Page]
```

**Implementation:**
- Add `aar_reminder_settings` JSONB column to `organizations` table
- Create new `aar_reminders` table (separate from `event_reminders`)
- Background processor in `server/index.js` (new function `processAARReminders()`)
- Use existing `threadManager.js` to post to AAR channel
- Consider refactoring to generic scheduler in future (handles events, AAR, countdowns, etc.)

---

### Service Record Integration

**Future Implementation:** Pilot Profile Page (separate feature)

**Data Requirements for Service Records:**
The Mission Debriefing system must track:

1. **Cumulative Kill Counts**
   - Career total: A2A and A2G kills
   - Per cycle: A2A and A2G kills for each training cycle

2. **Cycle Participation**
   - Number of missions participated in per cycle
   - Based on published flight assignments (pilot appears in `pilot_assignments` for mission)
   - Count missions where pilot was assigned, regardless of AAR submission

3. **Flight Lead Experience**
   - Number of times assigned to -1 slot
   - Number of successful missions as Flight Lead

**Database Support:**
- `pilot_kills` table already links to `pilot_id` and `mission_id`
- Queries can aggregate kills by pilot across missions
- Queries can filter by cycle using `events.cycle_id` → `missions.event_id` relationship
- No additional tables needed; service records will query existing data

**Future Service Record Display (placeholder for Phase 4+):**
```
Pilot Profile: 100 "Maverick" Smith
─────────────────────────────────────────────
Career Statistics:
  Total Missions: 47
  A2A Kills: 23
  A2G Kills: 156
  Flight Lead Experience: 12 missions

Current Cycle (Training Q1 2025):
  Missions: 8
  A2A: 5
  A2G: 24
  Participation Rate: 80% (8/10 cycle missions)
```

---

### Mission and Flight Status Handling

#### Mission Status

**Status Field:** `mission_debriefings.mission_status`

**Status Values:**
- `pending` - Mission created, awaiting execution (default)
- `in_progress` - Flight assignments published from Mission Prep page
- `complete` - Mission executed, debriefs being collected
- `scrubbed` - Mission cancelled/not executed

**Status Transitions:**
- Automatic: `pending` → `in_progress` when flight assignments published
- Manual: Authorized users can set to `complete` or `scrubbed` from Mission Debriefing page

**UI Controls:**
- Status dropdown on Mission Debriefing page header
- Visible to users with `set_mission_status` permission
- Confirmation dialog when changing to `scrubbed`

**Impact:**
- `scrubbed` missions: AARs not required, reminders not sent
- `complete` missions: Eligible for finalization and AAR publication

#### Flight Status

**Status Field:** `flight_debriefs.flight_status`

**Status Values:**
- `scheduled` - Flight is planned (default)
- `launched` - Flight participated in mission
- `scrubbed` - Flight did not launch

**Status Transitions:**
- Default: `scheduled` when created
- Automatic: `scheduled` → `launched` when Flight Lead submits AAR
- Manual: Flight Lead or authorized user can mark as `scrubbed`

**UI Controls:**
- "Mark as Scrubbed" button on flight debrief form
- Available to Flight Lead or users with `set_flight_status` permission
- Once scrubbed, AAR submission not required for that flight
- Scrubbed flights excluded from performance calculations

**Missing Reports:**
- If Flight Lead doesn't submit AAR:
  - Reminder system sends notifications (configured per squadron)
  - Leadership notified on 2nd reminder
  - Flight remains in `pending` state (no automatic "Not Submitted" status)
  - Leadership can manually mark as scrubbed or follow up directly

---

### Multi-Squadron Operations & Permissions

**View Access:**
- Controlled by permission system
- Squadron leadership: Granted `view_debriefs_wing` to see all squadrons in wing
- Wing leadership: Can view all flights across wing
- Permission-based filtering in queries ensures proper access

**Edit Access:**
- Squadron leadership: Typically `edit_debriefs_squadron` (own squadron only)
- Wing leadership: May have `edit_debriefs_wing` (all squadrons in wing)
- Flexible permission assignment allows custom configurations

**Example Permission Setup:**
```
Squadron XO:
  - view_debriefs_wing (can see all wing debriefs)
  - edit_debriefs_squadron (can only edit own squadron)
  - finalize_debriefs_squadron (can finalize own squadron)

Wing CAG:
  - view_debriefs_wing (can see all wing debriefs)
  - edit_debriefs_wing (can edit any wing debrief)
  - finalize_debriefs_wing (can finalize any debrief)
```

---

### Tacview Recording Upload/Download

**Feature Status:** Skeleton implementation (Phase 1-2), full functionality after Cloudflare R2 migration

#### Database Fields

Already added to `mission_debriefings`:
- `tacview_file_url` - URL to file in R2 storage
- `tacview_uploaded_by` - User who uploaded
- `tacview_uploaded_at` - Upload timestamp

#### UI Components

**On Mission Debriefing Page:**

1. **Upload Section** (if user has `upload_tacview_recording` permission)
   ```
   ┌────────────────────────────────────────────────┐
   │  Tacview Recording                             │
   │  ──────────────────────────────────────────    │
   │  No recording uploaded                         │
   │                                                 │
   │  [Select File] [Upload]  (grayed out/disabled) │
   │                                                 │
   │  Accepted formats: .acmi, .txt.acmi, .zip.acmi │
   │  Max file size: 100 MB                         │
   └────────────────────────────────────────────────┘
   ```

2. **Download Section** (if file exists and user has `download_tacview_recording` permission)
   ```
   ┌────────────────────────────────────────────────┐
   │  Tacview Recording                             │
   │  ──────────────────────────────────────────    │
   │  📁 tacview_red_flag_jan15.acmi                │
   │  Uploaded by: 100 "Maverick" Smith             │
   │  Date: Jan 15, 2025 22:30                      │
   │  Size: 45.2 MB                                 │
   │                                                 │
   │  [Download] [Delete]  (grayed out/disabled)    │
   └────────────────────────────────────────────────┘
   ```

3. **No Permission State** (if user lacks permission)
   - Section is hidden entirely (not shown)

#### Implementation Notes

**Phase 1-2 (Initial Implementation):**
- Display full UI components with proper styling
- All buttons and inputs are disabled (grayed out, cursor: not-allowed)
- Tooltip on hover: "Tacview upload/download will be available after cloud storage migration"
- Form validation and file type checking implemented but not functional
- Database fields (`tacview_file_url`, etc.) are ready and can be manually populated for testing
- Permission checks fully functional (show/hide based on user permissions)

**Phase 4+ (Full Implementation after R2 migration):**
- Configure Cloudflare R2 bucket for file storage
- Implement signed URL generation for uploads
- Implement signed URL generation for downloads (time-limited)
- Add file size validation (max 100MB recommended)
- Add file type validation (.acmi, .txt.acmi, .zip.acmi)
- Generate upload progress indicator
- Add "Replace File" functionality for authorized users

**File Naming Convention:**
```
tacview_{mission_name}_{timestamp}.acmi
Example: tacview_operation_red_flag_20250115_1930.acmi
```

---

### Training Flights vs Live Sorties

**Differentiation:** Future enhancement (not Phase 1-4)

**Requirements for Training Flights:**
- Ability to create training objectives (separate from mission objectives)
- Mark individual pilots as SAT/UNSAT (not just flight-level)
- Different performance categories (more granular/educational)
- Link to training curriculum/syllabi

**Database Consideration:**
- Add `mission_type` field to `missions` table: 'live' | 'training'
- Add `training_objectives` JSONB field to `mission_debriefings`
- Add `pilot_training_assessments` table for individual pilot ratings

**Note:** Current implementation focuses on live sorties. Training flight functionality will be designed and implemented as a separate enhancement after core AAR system is stable.

---

---

## Technical Considerations

### Performance
- Aggregate queries may be slow for large datasets
  - Solution: Materialized views or caching
  - Consider background jobs for statistics calculation
- RLS policies must be efficient
  - Add appropriate indexes on foreign keys
  - Test with large data volumes

### Data Integrity
- Ensure flight_lead_pilot_id matches mission data (-1 slot)
  - Validation in `createFlightDebrief()`
- Prevent edits after finalization
  - Database constraint + RLS policy
  - Frontend validation
- Audit trail for modifications
  - Consider adding `edited_by` and `edited_at` fields

### Migration Path
- Debriefing is optional (no historical data)
- No migration needed for existing missions
- New missions will have debriefing available

### Testing Strategy
- Unit tests for service methods
- Integration tests for permission enforcement
- E2E tests for critical workflows:
  - Flight Lead submits debrief
  - Leadership finalizes debrief
  - Delegation flow

---

## API Endpoints (Frontend → Supabase)

### Debriefing Operations
```typescript
// Create mission debrief container
POST /mission_debriefings
{
  mission_id: string,
  status: 'in_progress'
}

// Get debriefing for mission
GET /mission_debriefings?mission_id=eq.{id}

// Create flight debrief
POST /flight_debriefs
{
  mission_debriefing_id: string,
  flight_id: string,
  performance_ratings: {...},
  ...
}

// Update flight debrief
PATCH /flight_debriefs?id=eq.{id}
{
  performance_ratings: {...},
  key_lessons_learned: string
}

// Finalize debrief
PATCH /flight_debriefs?id=eq.{id}
{
  status: 'finalized',
  finalized_by: string,
  finalized_at: timestamp
}
```

### Kill Tracking
```typescript
// Record kills
POST /pilot_kills
{
  flight_debrief_id: string,
  pilot_id: string,
  air_to_air_kills: number,
  air_to_ground_kills: number
}

// Update kills
PATCH /pilot_kills?id=eq.{id}
{
  air_to_air_kills: number,
  air_to_ground_kills: number
}

// Get kills for flight
GET /pilot_kills?flight_debrief_id=eq.{id}
```

### Delegation
```typescript
// Create delegation
POST /debrief_delegation
{
  flight_debrief_id: string,
  delegated_to_user_id: string,
  reason: string
}

// Get delegation info
GET /debrief_delegation?flight_debrief_id=eq.{id}
```

---

## Database Indexes

For optimal performance:

```sql
-- mission_debriefings
CREATE INDEX idx_mission_debriefings_mission_id ON mission_debriefings(mission_id);
CREATE INDEX idx_mission_debriefings_status ON mission_debriefings(status);

-- flight_debriefs
CREATE INDEX idx_flight_debriefs_mission_debriefing_id ON flight_debriefs(mission_debriefing_id);
CREATE INDEX idx_flight_debriefs_squadron_id ON flight_debriefs(squadron_id);
CREATE INDEX idx_flight_debriefs_flight_lead_pilot_id ON flight_debriefs(flight_lead_pilot_id);
CREATE INDEX idx_flight_debriefs_status ON flight_debriefs(status);
CREATE INDEX idx_flight_debriefs_submitted_at ON flight_debriefs(submitted_at);

-- pilot_kills
CREATE INDEX idx_pilot_kills_flight_debrief_id ON pilot_kills(flight_debrief_id);
CREATE INDEX idx_pilot_kills_pilot_id ON pilot_kills(pilot_id);
CREATE INDEX idx_pilot_kills_mission_id ON pilot_kills(mission_id);

-- debrief_delegation
CREATE INDEX idx_debrief_delegation_flight_debrief_id ON debrief_delegation(flight_debrief_id);
CREATE INDEX idx_debrief_delegation_delegated_to_user_id ON debrief_delegation(delegated_to_user_id);

-- aar_reminders
CREATE INDEX idx_aar_reminders_mission_id ON aar_reminders(mission_id);
CREATE INDEX idx_aar_reminders_flight_debrief_id ON aar_reminders(flight_debrief_id);
CREATE INDEX idx_aar_reminders_squadron_id ON aar_reminders(squadron_id);
CREATE INDEX idx_aar_reminders_scheduled_for ON aar_reminders(scheduled_for);
CREATE INDEX idx_aar_reminders_sent_at ON aar_reminders(sent_at);
CREATE INDEX idx_aar_reminders_pending ON aar_reminders(scheduled_for, sent_at) WHERE sent_at IS NULL;
```

---

## Row-Level Security (RLS) Policies

Follow existing Wing-based RLS pattern:

```sql
-- mission_debriefings: Users can only see debriefs for missions in their wing
CREATE POLICY mission_debriefings_select_policy ON mission_debriefings
FOR SELECT USING (
  mission_id IN (
    SELECT id FROM missions WHERE ...wing check...
  )
);

-- flight_debriefs: Users can see debriefs based on squadron/wing access
CREATE POLICY flight_debriefs_select_policy ON flight_debriefs
FOR SELECT USING (
  squadron_id IN (SELECT id FROM organizations WHERE ...wing check...)
);

-- Update/Delete policies based on edit permissions
-- (Check user permissions in addition to wing membership)
```

---

## Future Enhancements (Post-Phase 4)

1. **Live API Integration**: Automatically receive kill data from DCS server during mission
2. **Video/Screenshot Attachments**: Allow uploading tacview/screenshots to debrief
3. **Collaborative Debriefs**: Multiple flight members can contribute to debrief
4. **AI-Assisted Summaries**: Generate summary from comments using AI
5. **Mobile App**: Submit debriefs from mobile device
6. **Peer Reviews**: Allow squadron members to comment on debriefs
7. **Training Recommendations**: Suggest training based on UNSAT areas
8. **Qualification Automation**: Auto-update pilot qualifications based on performance

---

## Success Metrics

### Phase 1
- [ ] 90%+ of flights submit debriefs within 48 hours
- [ ] Zero permission bypass incidents
- [ ] <2 second page load time for debrief list
- [ ] Positive user feedback from Flight Leads

### Phase 2
- [ ] 80%+ of kills include detailed type information
- [ ] Target types successfully imported from .miz files
- [ ] Reference tables stay current with DCS updates

### Phase 3
- [ ] Leadership views aggregate dashboard weekly
- [ ] Dashboard loads in <3 seconds
- [ ] Export functionality used regularly

### Phase 4
- [ ] Discord infographics posted for 80%+ of missions
- [ ] Pilot service records accessed regularly
- [ ] Reminder system reduces late submissions by 50%

---

## File Structure

```
src/
├── components/
│   └── debriefing/
│       ├── MissionDebriefing.tsx           # Main page
│       ├── DebriefingList.tsx              # Mission list
│       ├── FlightDebriefForm.tsx           # Flight Lead form
│       ├── PerformanceCategories.tsx       # SAT/UNSAT ratings
│       ├── KillTracker.tsx                 # Kill tracking
│       ├── DelegationManager.tsx           # Delegation UI
│       ├── LeadershipDashboard.tsx         # Aggregate view
│       └── DebriefingReports.tsx           # Reports & export
├── utils/
│   ├── debriefingService.ts                # CRUD operations
│   ├── killTrackingService.ts              # Kill tracking logic
│   └── debriefingPermissions.ts            # Permission checks
├── types/
│   └── DebriefingTypes.ts                  # Type definitions
└── hooks/
    └── useDebriefing.ts                    # React hook for debriefing state

server/
└── lib/
    └── debriefingInfographic.js            # Discord infographic generator

database_migrations/
└── debriefing/
    ├── 001_create_mission_debriefings.sql
    ├── 002_create_flight_debriefs.sql
    ├── 003_create_pilot_kills.sql
    ├── 004_create_debrief_delegation.sql
    ├── 005_create_aar_reminders.sql
    ├── 006_create_ref_target_types.sql     # Phase 2
    ├── 007_create_ref_weapon_types.sql     # Phase 2
    ├── 008_create_mission_target_inventory.sql # Phase 2
    ├── 009_add_permissions.sql              # Add new permissions to app_permissions
    └── 010_add_indexes_and_rls.sql
```

---

## Related Documentation

- [Mission Planning Feature](./MISSION_PLANNING.md)
- [Mission Execution Feature](./MISSION_EXECUTION.md)
- [Permissions System](./PERMISSIONS.md)
- [Discord Integration](./DISCORD.md)
- [Architecture Overview](../ARCHITECTURE.md)
