# Roster Management Feature

## Purpose
Manage squadron pilot rosters including personal information, qualifications, status tracking, team assignments, and Discord account linking.

## Key Files

### Components
- `src/components/ui/RosterManagement.tsx` (2,602 LOC) - Main roster view
- `src/components/ui/roster/PilotDetails.tsx` (2,115 LOC) - Pilot edit form
- `src/components/ui/roster/BulkEditPilotDetails.tsx` (1,301 LOC) - Bulk operations
- `src/components/ui/roster/FilterDrawer.tsx` (959 LOC) - Advanced filtering
- `src/components/ui/roster/PilotList.tsx` (577 LOC) - Pilot list display
- `src/components/ui/roster/QualificationsManager.tsx` (642 LOC) - Quals UI
- `src/components/ui/roster/TeamsManager.tsx` (567 LOC) - Team assignments

### Services
- `src/utils/pilotService.ts` (1,488 LOC) - Pilot CRUD operations
- `src/utils/pilotDataUtils.ts` (570 LOC) - Data transformations
- `src/utils/qualificationService.ts` (605 LOC) - Qualification logic
- `src/utils/discordPilotService.ts` (605 LOC) - Discord pilot verification
- `src/utils/teamService.ts` (545 LOC) - Team management

### Types
- `src/types/PilotTypes.ts` - Pilot data structures

## Data Flow

```
┌────────────────────────────────────────────────────────────┐
│                    RosterManagement.tsx                     │
│  • Displays pilot list with filtering                      │
│  • Handles selection, bulk actions, export                 │
└────────┬───────────────────────────────────────────────────┘
         ↓
┌────────┴────────┐
│  pilotService   │ ──→ Supabase.from('pilots')
└────────┬────────┘
         ↓
┌────────┴────────────────────────────────────────────────────┐
│  Database: pilots table                                     │
│  Fields: id, board_number, callsign, rank, status,         │
│          discord_id, qualifications, billet, squadron_id    │
└─────────────────────────────────────────────────────────────┘
```

## Key Operations

### View Roster
**Entry Point**: `/roster` route → `RosterManagement.tsx`

**Flow**:
1. Component loads pilots via `pilotService.getPilots()`
2. Applies Wing-based RLS filtering automatically
3. Renders filterable, sortable pilot list
4. Displays: Board #, Callsign, Rank, Status, Billet, Qualifications

### Add Pilot
**Trigger**: "Add Pilot" button → Opens `PilotDetails.tsx` modal

**Flow**:
1. User fills form: Board #, Callsign, Rank, Status, etc.
2. Optionally link Discord user via `DiscordPilotsDialog`
3. Call `pilotService.createPilot()`
4. Insert into `pilots` table
5. Refresh roster list

### Edit Pilot
**Trigger**: Click pilot row → Opens `PilotDetails.tsx`

**Flow**:
1. Load pilot data
2. User edits fields
3. Call `pilotService.updatePilot()`
4. Update `pilots` table
5. Refresh roster

### Bulk Edit
**Trigger**: Select multiple pilots → "Bulk Edit" → `BulkEditPilotDetails.tsx`

**Flow**:
1. User selects pilots (checkbox selection)
2. Opens bulk edit modal
3. Change common fields (status, squadron, rank)
4. Call `pilotService.updateMultiplePilots()`
5. Transaction updates all selected pilots
6. Refresh roster

### Archive/Restore Pilot
**Trigger**: Edit pilot → Change status to "Inactive" or "Archived"

**Flow**:
1. Set `status` field
2. Call `pilotService.updatePilot()`
3. Pilot removed from active roster filter (still in DB)

### Filter Roster
**Trigger**: Open filter drawer → `FilterDrawer.tsx`

**Options**:
- Status: Active, Inactive, Archived
- Qualifications: Select specific quals
- Squadron: Multi-squadron filter
- Billet: Role filter
- Discord Linked: Yes/No
- Free text search: Board #, Callsign, Name

### Export Roster
**Trigger**: "Export" button → Downloads Excel file

**Flow**:
1. Call `pilotService.getPilots()` with current filters
2. Transform to Excel format via `xlsx` library
3. Include: Board #, Callsign, Rank, Status, Quals, Discord ID
4. Download as `roster_export_<date>.xlsx`

## Dependencies

### Required Services
- `pilotService` - CRUD operations
- `qualificationService` - Qualification management
- `organizationService` - Squadron lookups
- `permissionService` - Permission checks
- `discordPilotService` - Discord linking

### Database Tables
- `pilots` (main)
- `qualifications` (lookup)
- `organizations` (squadrons)
- `discord_pilots` (Discord linkage)
- `teams` (team assignments)

### Permissions Required
- **View Roster**: `view_pilots` permission
- **Add Pilot**: `create_pilots` permission
- **Edit Pilot**: `edit_pilots` permission
- **Delete Pilot**: `delete_pilots` permission (soft delete)
- **Bulk Edit**: `edit_pilots` permission

## Gotchas & Edge Cases

### 1. Discord Linkage
- **Issue**: Multiple pilots can have same Discord ID (shared accounts)
- **Handling**: Allow duplicates but warn user
- **File**: `discordPilotService.ts:linkDiscordToPilot()`

### 2. Bulk Edit Validation
- **Issue**: Changing squadron for pilots with active flight assignments
- **Handling**: Validation check before bulk update
- **File**: `BulkEditPilotDetails.tsx:handleBulkSave()`

### 3. Qualification Currency
- **Issue**: Qualifications can expire (currency dates)
- **Handling**: Show warning icon for expired quals
- **File**: `QualificationsManager.tsx:renderQualificationStatus()`

### 4. Board Number Uniqueness
- **Issue**: Board numbers should be unique per Wing
- **Handling**: Validation on create/edit
- **File**: `pilotService.ts:createPilot()`

### 5. Cascading Deletes
- **Issue**: Deleting pilot removes flight assignments, event RSVPs
- **Handling**: Soft delete (set status='Archived') instead of hard delete
- **File**: `pilotService.ts:archivePilot()`

## Testing Focus

### Critical Paths
1. ✅ Create pilot with all fields
2. ✅ Edit pilot and save changes
3. ✅ Bulk edit multiple pilots
4. ✅ Link Discord account to pilot
5. ✅ Filter roster by multiple criteria
6. ✅ Export roster to Excel

### Edge Cases to Test
1. ⚠️ Create pilot with duplicate board number
2. ⚠️ Edit pilot with active flight assignments
3. ⚠️ Bulk edit across different squadrons
4. ⚠️ Link Discord account already linked to another pilot
5. ⚠️ Filter roster with no results
6. ⚠️ Export large roster (>1000 pilots)

## Performance Notes

- **Large Rosters**: Currently fetches all pilots into memory
  - **Optimization**: Implement pagination for 500+ pilots
  - **File**: `RosterManagement.tsx:loadPilots()`

- **Filter Performance**: Filters applied client-side
  - **Optimization**: Move filters to database query
  - **File**: `FilterDrawer.tsx:applyFilters()`

- **Bulk Edit**: Single transaction for multiple updates
  - **Current**: Efficient for <100 pilots
  - **File**: `pilotService.ts:updateMultiplePilots()`

## Known Issues

1. **Qualification Ordering**: Quals display in insertion order, not alphabetical
   - **Impact**: Minor UX issue
   - **File**: `QualificationsManager.tsx:renderQualificationList()`

2. **Discord Sync Lag**: Discord role changes not immediately reflected
   - **Impact**: User must refresh to see updated roles
   - **File**: `discordPilotService.ts:syncDiscordRoles()`

3. **Large Form Validation**: `PilotDetails.tsx` validation runs on every keystroke
   - **Impact**: Performance lag on slow devices
   - **Fix**: Debounce validation

## Related Features

- **Discord Integration**: Links pilots to Discord users → [DISCORD.md](./DISCORD.md)
- **Mission Planning**: Uses roster for flight assignments → [MISSION_PLANNING.md](./MISSION_PLANNING.md)
- **Events**: Pilots RSVP to events → [EVENTS.md](./EVENTS.md)
- **Reports**: Attendance reports aggregate pilot data → [REPORTS.md](./REPORTS.md)
- **Teams**: Organize pilots into teams → Teams feature

## API Endpoints Used

(Frontend calls Supabase directly, no Express API for roster)

- `supabase.from('pilots').select()` - Fetch pilots
- `supabase.from('pilots').insert()` - Create pilot
- `supabase.from('pilots').update()` - Edit pilot
- `supabase.from('pilots').delete()` - Soft delete pilot
- `supabase.from('qualifications').select()` - Load qualifications
- `supabase.from('discord_pilots').select()` - Get Discord linkage

## File References

| File | Role | Complexity |
|------|------|-----------|
| `RosterManagement.tsx:1` | Main roster view | High |
| `PilotDetails.tsx:1` | Pilot form | Very High |
| `BulkEditPilotDetails.tsx:1` | Bulk operations | High |
| `FilterDrawer.tsx:1` | Filter UI | Medium |
| `pilotService.ts:1` | Data layer | High |
| `qualificationService.ts:1` | Quals logic | Medium |
