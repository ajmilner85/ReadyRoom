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
| `status` | enum | 'in_progress', 'submitted', 'finalized' |
| `finalized_by` | uuid | User who finalized (department head) |
| `finalized_at` | timestamptz | When finalized |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |
| `created_by` | uuid | Foreign key to user_profiles |

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
| `status` | enum | 'pending', 'submitted', 'finalized' |
| `performance_ratings` | jsonb | SAT/UNSAT ratings (see structure below) |
| `key_lessons_learned` | text | Final comments section |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

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

## Permissions System

New permissions to be added to `app_permissions` table:

### View Permissions

| Permission Name | Display Name | Scope Type | Description |
|----------------|--------------|------------|-------------|
| `view_debriefs_own_flight` | View Own Flight Debriefs | flight | View debriefs for flights you participated in |
| `view_debriefs_squadron` | View Squadron Debriefs | squadron | View all debriefs for own squadron |
| `view_debriefs_wing` | View Wing Debriefs | wing | View all debriefs for own wing |
| `view_debriefs_global` | View All Debriefs | global | View debriefs across all wings |
| `view_aggregate_squadron` | View Squadron Aggregate Data | squadron | View aggregate performance for squadron |
| `view_aggregate_wing` | View Wing Aggregate Data | wing | View aggregate performance for wing |
| `view_aggregate_global` | View Global Aggregate Data | global | View aggregate performance across all wings |

### Edit Permissions

| Permission Name | Display Name | Scope Type | Description |
|----------------|--------------|------------|-------------|
| `edit_debriefs_own_flight` | Edit Own Flight Debriefs | flight | Edit debriefs for own flight (as flight lead) |
| `edit_debriefs_squadron` | Edit Squadron Debriefs | squadron | Edit any debrief in own squadron |
| `edit_debriefs_wing` | Edit Wing Debriefs | wing | Edit any debrief in own wing |
| `edit_debriefs_global` | Edit All Debriefs | global | Edit debriefs across all wings |
| `finalize_debriefs_squadron` | Finalize Squadron Debriefs | squadron | Mark debriefs as finalized (read-only) |
| `finalize_debriefs_wing` | Finalize Wing Debriefs | wing | Finalize debriefs at wing level |
| `finalize_debriefs_global` | Finalize All Debriefs | global | Finalize debriefs globally |

### Delegation Permissions

| Permission Name | Display Name | Scope Type | Description |
|----------------|--------------|------------|-------------|
| `delegate_own_debrief` | Delegate Own Debrief | flight | Delegate debrief responsibility as flight lead |
| `reassign_debrief_squadron` | Reassign Squadron Debriefs | squadron | Reassign debrief responsibility within squadron |
| `reassign_debrief_wing` | Reassign Wing Debriefs | wing | Reassign debrief responsibility within wing |
| `reassign_debrief_global` | Reassign All Debriefs | global | Reassign any debrief responsibility |

### Permission Logic

**Flight Lead Default Permissions:**
- Automatically granted `edit_debriefs_own_flight` for their assigned flight
- Can delegate via `delegate_own_debrief` (scoped to their flight members)
- Loses edit permission after delegation (unless explicitly reassigned)

**Squadron Leadership (e.g., XO, Operations Officer):**
- Typically granted `view_debriefs_squadron` and `edit_debriefs_squadron`
- Can reassign within squadron via `reassign_debrief_squadron`
- Can view aggregate data via `view_aggregate_squadron`

**Wing Leadership (e.g., CAG, Wing Commander):**
- Granted `view_debriefs_wing` and `edit_debriefs_wing`
- Can finalize debriefs via `finalize_debriefs_wing`
- Can view aggregate data via `view_aggregate_wing`

**Department Heads:**
- Require `finalize_debriefs_*` permission to mark debriefs as complete
- Once finalized, only users with override permissions can edit

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

## Open Questions (Awaiting User Feedback)

### Discord Integration
1. **Infographic Content**: What should the Discord infographic show?
   - Top performers by kills?
   - Squadron performance comparison?
   - Mission summary?
   - All of the above?

2. **Posting Trigger**: Should infographic posting be:
   - Automatic after all flights submit?
   - Manual trigger by leadership?
   - Optional per mission?

3. **Notification Channel**: Should notifications go to:
   - Same channel as event?
   - Dedicated "after action" channel?
   - Configurable per squadron?

4. **Reminder Timing**: When should reminders be sent?
   - 24 hours after mission?
   - 48 hours after mission?
   - Configurable?

### Service Records
1. **Service Record Page**: Do you want a new dedicated page for pilot service records, or should it be:
   - Integrated into existing Pilot Details page?
   - A new tab in Roster Management?
   - Standalone page linked from roster?

2. **Qualification Impact**: Should poor performance (UNSAT ratings) affect pilot qualifications?
   - Trigger currency review?
   - Require remedial training?
   - Flag for leadership review?

3. **Career Statistics**: What career stats should be tracked?
   - Total missions flown?
   - Total kills (career)?
   - Average performance ratings?
   - Flight Lead experience?

### Edge Cases
1. **Cancelled Missions**: What happens if:
   - Mission is cancelled before launch?
   - Flight doesn't launch (scrub)?
   - Should debrief still be required?

2. **Missing Reports**: If Flight Lead doesn't submit:
   - Reminder system?
   - Auto-escalation to leadership?
   - Mark as "Not Submitted" after deadline?

3. **Multi-Squadron Ops**: For joint missions:
   - Does each squadron's leadership see only their flights or all flights?
   - Can Wing leadership compare cross-squadron?
   - Privacy/access control considerations?

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
    ├── 005_create_ref_target_types.sql     # Phase 2
    ├── 006_create_ref_weapon_types.sql     # Phase 2
    ├── 007_create_mission_target_inventory.sql # Phase 2
    └── 008_add_indexes_and_rls.sql
```

---

## Related Documentation

- [Mission Planning Feature](./MISSION_PLANNING.md)
- [Mission Execution Feature](./MISSION_EXECUTION.md)
- [Permissions System](./PERMISSIONS.md)
- [Discord Integration](./DISCORD.md)
- [Architecture Overview](../ARCHITECTURE.md)
