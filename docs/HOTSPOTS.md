# Code Hotspots & Complexity Analysis

This document identifies areas of the codebase with high complexity, large file sizes, or architectural concerns that warrant attention.

## Critical Hotspots (>2000 LOC)

These files exceed 2000 lines and should be prioritized for refactoring:

### 1. RosterSettings.tsx (4,280 LOC) 🔥🔥🔥
**File**: `src/components/settings/RosterSettings.tsx`
**Purpose**: Squadron roster field configuration and customization
**Why it's large**: Multiple nested forms, field validation, default value management
**Concerns**:
- Extremely difficult to maintain
- High cognitive load
- Likely contains duplicate logic
- Test coverage would be challenging

**Refactor Priority**: **CRITICAL**
**Refactor Suggestions**:
- Split into separate components per settings section:
  - `RosterFieldEditor.tsx` - Field customization
  - `RosterFieldDefaults.tsx` - Default values
  - `RosterFieldValidation.tsx` - Validation rules
- Extract field management logic into custom hook: `useRosterFieldSettings()`
- Move validation schemas to separate file

---

### 2. RosterManagement.tsx (2,602 LOC) 🔥🔥
**File**: `src/components/ui/RosterManagement.tsx`
**Purpose**: Main roster view with filtering, selection, and bulk operations
**Why it's large**: Combines display, filtering, selection, bulk edit, export logic
**Concerns**:
- Multiple responsibilities (violates Single Responsibility Principle)
- Complex state management
- Difficult to test individual features

**Refactor Priority**: **HIGH**
**Refactor Suggestions**:
- Extract `RosterFilters.tsx` - Filtering logic
- Extract `RosterSelectionControls.tsx` - Selection state and UI
- Extract `RosterExport.tsx` - Export functionality
- Move roster state to custom hook: `useRosterManagement()`
- Consider using React Query for server state

---

### 3. FlightAssignments.tsx (2,261 LOC) 🔥🔥
**File**: `src/components/ui/mission prep/FlightAssignments.tsx`
**Purpose**: Flight assignment UI with drag-and-drop pilot assignment
**Why it's large**: Complex drag-and-drop, auto-assignment, multi-squadron handling
**Concerns**:
- Tight coupling between UI and business logic
- Auto-assignment logic embedded in component
- Difficult to unit test algorithm

**Refactor Priority**: **HIGH**
**Refactor Suggestions**:
- Extract `FlightAssignmentRow.tsx` - Single flight row
- Extract `PilotAssignmentCell.tsx` - Pilot drag-drop cell
- Move auto-assignment to service: `autoAssignmentService.ts`
- Create custom hook: `useFlightAssignments()`

---

### 4. EventDialog.tsx (2,168 LOC) 🔥🔥
**File**: `src/components/ui/events/EventDialog.tsx`
**Purpose**: Event creation/editing form with Discord integration
**Why it's large**: Multi-step form, Discord settings, reminder scheduling, participant selection
**Concerns**:
- Too many form fields in single component
- Complex validation logic
- Discord integration tightly coupled

**Refactor Priority**: **HIGH**
**Refactor Suggestions**:
- Multi-step form approach:
  - `EventDetailsStep.tsx` - Basic event info
  - `EventParticipantsStep.tsx` - Squadron selection
  - `EventDiscordStep.tsx` - Discord settings
  - `EventRemindersStep.tsx` - Reminder configuration
- Extract validation: `eventValidation.ts`
- Use form library (React Hook Form)

---

### 5. OrgEntityModal.tsx (2,126 LOC) 🔥🔥
**File**: `src/components/settings/OrgEntityModal.tsx`
**Purpose**: Create/edit organizational entities (Command, Group, Wing, Squadron)
**Why it's large**: Handles 4 entity types with different fields and validation
**Concerns**:
- Polymorphic form handling
- Complex branching logic
- Type-specific validation

**Refactor Priority**: **MEDIUM**
**Refactor Suggestions**:
- Create separate modals:
  - `CommandModal.tsx`
  - `GroupModal.tsx`
  - `WingModal.tsx`
  - `SquadronModal.tsx`
- Share common logic via hook: `useOrgEntityForm(entityType)`
- Extract validation per entity type

---

### 6. PilotDetails.tsx (2,115 LOC) 🔥🔥
**File**: `src/components/ui/roster/PilotDetails.tsx`
**Purpose**: Pilot create/edit form
**Why it's large**: Many form fields, qualification management, Discord linking
**Concerns**:
- Form validation complexity
- Qualification UI embedded
- Discord integration mixed in

**Refactor Priority**: **MEDIUM**
**Refactor Suggestions**:
- Extract `PilotBasicInfo.tsx` - Core fields
- Extract `PilotQualifications.tsx` - Quals section (already exists as QualificationsManager)
- Extract `PilotDiscordLink.tsx` - Discord linking UI
- Use React Hook Form for validation

---

## High-Complexity Files (>1000 LOC)

These files warrant attention but are not critical:

| File | LOC | Role | Concern | Priority |
|------|-----|------|---------|----------|
| `types/supabase.ts` | 1,856 | Auto-generated types | Should be regenerated, not manually edited | LOW |
| `components/ui/dialogs/DiscordPilotsDialog.tsx` | 1,850 | Discord pilot linking | Complex state, API calls | MEDIUM |
| `components/reports/CycleAttendanceReport.tsx` | 1,832 | Attendance report | Chart config, data aggregation | LOW |
| `utils/discordService.ts` | 1,678 | Discord API integration | Large API surface, error handling | LOW |
| `components/ui/EventsManagement.tsx` | 1,544 | Events list view | Filtering, state management | MEDIUM |
| `utils/pilotService.ts` | 1,488 | Pilot CRUD | Many methods, could be split | LOW |
| `components/settings/SquadronDiscordSettings.tsx` | 1,439 | Discord config UI | Multi-bot support, complex UI | MEDIUM |
| `components/ui/roster/BulkEditPilotDetails.tsx` | 1,301 | Bulk pilot editing | Form complexity, validation | MEDIUM |
| `components/ui/mission prep/AvailablePilots.tsx` | 1,246 | Pilot selection list | Filtering, qualification checks | LOW |
| `components/reports/DiscordRoleVerificationReport.tsx` | 1,245 | Role verification | Data aggregation, table rendering | LOW |

## Complex Functions (>100 lines)

Functions that should be broken down:

### RosterManagement.tsx
- `handleBulkEdit()` - ~150 lines
- `handleExport()` - ~120 lines
- `applyFilters()` - ~180 lines

### FlightAssignments.tsx
- `handleAutoAssign()` - ~200 lines
- `handlePilotDrop()` - ~150 lines
- `validateAssignment()` - ~100 lines

### EventDialog.tsx
- `handleSaveEvent()` - ~250 lines
- `validateEventForm()` - ~120 lines
- `prepareDiscordPublish()` - ~100 lines

## Multi-Role Files (Components doing too much)

### RosterManagement.tsx
**Roles**:
1. Data fetching (pilots, squadrons, qualifications)
2. Filtering and search
3. Selection management
4. Bulk operations
5. Export functionality
6. UI rendering

**Recommendation**: Split into container/presentation pattern

### EventsManagement.tsx
**Roles**:
1. Event list display
2. Filtering (status, squadron, date range)
3. Event creation (opens dialog)
4. Event editing
5. Event deletion
6. Discord sync status

**Recommendation**: Extract filters and sync logic

### MissionPreparation.tsx
**Roles**:
1. Mission file upload
2. Flight extraction
3. Pilot assignment
4. Communications configuration
5. Mission support roles
6. Mission Commander assignment

**Recommendation**: Each role should be a sub-component

## Top Refactor Targets (by impact)

### 1. RosterSettings.tsx
**Impact**: Very High
**Effort**: High
**Reason**: Extremely difficult to modify or extend
**Ticket**: See `REFACTOR_TICKETS.md #1`

### 2. FlightAssignments.tsx
**Impact**: High
**Effort**: Medium
**Reason**: Auto-assignment logic should be testable separately
**Ticket**: See `REFACTOR_TICKETS.md #2`

### 3. EventDialog.tsx
**Impact**: High
**Effort**: Medium
**Reason**: Multi-step form would improve UX and maintainability
**Ticket**: See `REFACTOR_TICKETS.md #3`

### 4. RosterManagement.tsx
**Impact**: Medium
**Effort**: Medium
**Reason**: Splitting concerns would improve testability
**Ticket**: See `REFACTOR_TICKETS.md #4`

### 5. Bulk Edit System
**Impact**: Medium
**Effort**: Low
**Reason**: Shared bulk edit logic across features
**Ticket**: See `REFACTOR_TICKETS.md #7`

## Circular Dependencies

**Status**: None detected ✅

Manual check reveals no circular imports. TypeScript compiler would error if present.

## Dead Exports & Unused Code

**Potential candidates** (require manual verification):

### src/utils/
- `debugUtils.ts` - Debug utilities may only be used in development
- `wake.ts` - Wake handlers may be redundant with modern browsers

**Recommendation**: Add `eslint-plugin-unused-imports` to detect unused code

## Untested Modules

**High-risk areas without automated tests**:

1. Auto-assignment algorithm (`autoAssignUtils.ts`) ⚠️
2. Permission calculator (`permissionCalculator.ts`) ⚠️
3. Discord bot event handlers (`SDOBot/lib/eventHandlers.js`) ⚠️
4. Reminder processor (`server/index.js:processReminders()`) ⚠️
5. Bulk edit transactions (`pilotService.ts:updateMultiplePilots()`) ⚠️

**Recommendation**: Add unit tests for these critical paths

## Performance Concerns

### Large Data Fetching

**Files**:
- `RosterManagement.tsx:loadPilots()` - Fetches all pilots at once
- `EventsManagement.tsx:loadEvents()` - Fetches all events at once

**Issue**: No pagination
**Impact**: Slow load times for large datasets (>500 records)
**Recommendation**: Implement virtual scrolling or pagination

### Client-Side Filtering

**Files**:
- `RosterManagement.tsx:applyFilters()`
- `EventsManagement.tsx:filterEvents()`

**Issue**: Filters applied after fetching all data
**Impact**: Unnecessary data transfer and memory usage
**Recommendation**: Move filters to database query

### Re-rendering

**Files**:
- `FlightAssignments.tsx` - Entire component re-renders on pilot drop
- `RosterManagement.tsx` - Re-renders on selection change

**Issue**: Expensive renders
**Impact**: UI lag on large datasets
**Recommendation**: Use `React.memo()` and memoization

## Database Query Issues

### N+1 Query Prevention

**Status**: Fixed in cycle attendance reports ✅
**Previously affected**: `cycleAttendanceReportService.ts`
**Fix**: Batched queries with joins

**Watch for**: New N+1 patterns in:
- Nested data fetching (events → participants → pilots)
- Repeated `getById()` calls in loops

### Missing Indexes

**Recommendation**: Add indexes on:
- `pilots.squadron_id`
- `pilots.discord_id`
- `events.start_datetime`
- `event_reminders.scheduled_time`
- `discord_event_attendance.discord_event_id`

## Security Hygiene

### Secrets Management ✅
- `.env` files in `.gitignore`
- No hardcoded tokens found
- Service role key only used server-side

### CORS Configuration ✅
- Specific origins whitelisted in `server/index.js:80`
- No `*` wildcard

### Input Validation ⚠️
- **Good**: Form validation on frontend
- **Missing**: Server-side validation for API endpoints
- **Recommendation**: Add validation middleware to Express

### Unsafe Input Handling ⚠️
- **File**: `EventDialog.tsx` - Event description rendered as HTML
- **Risk**: XSS if user inputs malicious HTML
- **Recommendation**: Sanitize HTML before rendering

## Configuration Best Practices

### Missing Configurations

1. **`.editorconfig`** - Ensure consistent formatting across editors
2. **`.nvmrc`** - Pin Node.js version
3. **Prettier config** - Automated code formatting
4. **`tsconfig.json` strictness** - Some strict flags disabled
5. **Dependabot** - Automated dependency updates

### Lint Configuration ✅
- ESLint configured with TypeScript support
- React hooks linting enabled

### Build Configuration ✅
- Vite configured for optimal bundling
- TypeScript strict mode enabled
- Code splitting via `React.lazy()`

## File Organization Recommendations

### Create New Directories

```
src/
├── components/
│   ├── shared/          # Shared reusable components (NEW)
│   ├── forms/           # Form components (NEW)
│   └── tables/          # Table components (NEW)
├── utils/
│   ├── api/             # API clients (NEW)
│   ├── validation/      # Validation schemas (NEW)
│   └── helpers/         # Pure utility functions (NEW)
└── constants/           # App-wide constants (NEW)
```

### Move Files

- `src/utils/autoAssignUtils.ts` → `src/services/autoAssignmentService.ts`
- `src/utils/*Service.ts` → `src/services/`
- Validation logic → `src/utils/validation/`

## Summary Statistics

| Metric | Count | Notes |
|--------|-------|-------|
| **Files >2000 LOC** | 6 | Critical refactor targets |
| **Files >1000 LOC** | 20 | Medium refactor targets |
| **Total LOC (src)** | ~80,000 | Estimated |
| **Largest file** | 4,280 | RosterSettings.tsx |
| **Avg file size** | ~380 LOC | Reasonable |
| **Components** | 107 | Well-modularized |
| **Services** | 60+ | Could be better organized |
| **Contexts** | 5 | Good use of Context API |
| **Custom Hooks** | 7 | More could be extracted |

## Next Steps

1. Read `/docs/REFACTOR_TICKETS.md` for specific refactoring tasks
2. Prioritize refactoring based on:
   - Frequency of changes (Git history)
   - Number of bugs reported
   - Business criticality
3. Start with smallest high-impact ticket (`REFACTOR_TICKETS.md #7`)
4. Add tests before refactoring critical paths
5. Refactor incrementally, not all at once

## Related Documentation

- **Refactor Tickets**: `/docs/REFACTOR_TICKETS.md`
- **Architecture**: `/docs/ARCHITECTURE.md`
- **Developer Guide**: `/docs/DEVELOPER_GUIDE.md`
- **Feature Docs**: `/docs/FEATURES/`
