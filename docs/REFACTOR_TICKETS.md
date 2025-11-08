# Refactor Tickets

This document contains specific, actionable refactoring tasks prioritized by impact and effort.

Each ticket includes:
- **Problem**: What's wrong
- **Proposed Fix**: How to improve it
- **Risk**: Potential issues
- **Tests**: What to test
- **Scope**: Estimated effort (S/M/L)

---

## Ticket #1: Split RosterSettings.tsx (4,280 LOC)

**Problem**:
- Extremely large file (4,280 LOC) makes it difficult to:
  - Navigate and understand
  - Test individual features
  - Modify without introducing bugs
  - Review in PRs

**Current Structure**:
- Single component handles all roster field configuration
- Contains field editor, default values, validation rules, custom field types
- Deeply nested state management

**Proposed Fix**:
1. Create new directory: `src/components/settings/roster-settings/`
2. Split into focused components:
   ```
   roster-settings/
   ├── RosterSettingsContainer.tsx       # Main container (200 LOC)
   ├── FieldEditor.tsx                    # Field configuration (800 LOC)
   ├── DefaultValuesEditor.tsx            # Default value management (600 LOC)
   ├── ValidationRulesEditor.tsx          # Validation config (500 LOC)
   ├── CustomFieldsEditor.tsx             # Custom field types (400 LOC)
   └── hooks/
       ├── useRosterFieldSettings.ts      # Shared state logic (300 LOC)
       └── useFieldValidation.ts          # Validation logic (200 LOC)
   ```
3. Extract validation schemas to `src/utils/validation/rosterFieldValidation.ts`
4. Move API calls to service: `src/utils/rosterSettingsService.ts`

**Risk**: **Medium**
- Breaking existing functionality
- Migration of complex state management
- Need to maintain backward compatibility

**Tests**:
- [ ] Field creation, editing, deletion
- [ ] Default value assignment
- [ ] Validation rule enforcement
- [ ] Custom field type creation
- [ ] Settings persistence to database

**Scope**: **L** (Large - 5-8 hours)

**Priority**: **CRITICAL** - Blocks future roster enhancements

**Dependencies**: None

---

## Ticket #2: Extract Auto-Assignment Logic from FlightAssignments.tsx

**Problem**:
- Auto-assignment algorithm (200+ LOC) embedded in UI component
- Impossible to unit test without rendering component
- Algorithm logic mixed with state updates and UI logic
- Difficult to understand and modify

**Current Structure**:
- `FlightAssignments.tsx:handleAutoAssign()` contains entire algorithm
- Tight coupling to component state
- No test coverage

**Proposed Fix**:
1. Create `src/services/autoAssignmentService.ts`:
   ```typescript
   export const autoAssignmentService = {
     assignPilotsToFlights(
       flights: Flight[],
       availablePilots: Pilot[],
       qualifications: Qualification[],
       options: AutoAssignOptions
     ): AssignmentResult {
       // Pure function - testable
     }
   };
   ```
2. Extract qualification matching logic:
   ```typescript
   const qualificationMatcher = {
     getPilotQualifications(pilot: Pilot, quals: Qualification[]): string[],
     isQualified(pilot: Pilot, aircraft: string): boolean,
     rankPilotForAircraft(pilot: Pilot, aircraft: string): number
   };
   ```
3. Update `FlightAssignments.tsx` to call service:
   ```typescript
   const handleAutoAssign = () => {
     const result = autoAssignmentService.assignPilotsToFlights(
       flights,
       availablePilots,
       qualifications,
       { preserveExisting: true }
     );
     setAssignedPilots(result.assignments);
     setUnassignedPilots(result.unassigned);
   };
   ```
4. Add unit tests for algorithm

**Risk**: **Low**
- Algorithm is complex but well-contained
- Easy to verify with tests
- Can refactor incrementally

**Tests**:
- [ ] All pilots qualified → all assigned
- [ ] Some pilots unqualified → partial assignment
- [ ] Insufficient pilots → fill what possible
- [ ] Preserve existing assignments
- [ ] Multi-squadron handling
- [ ] Edge case: No available pilots
- [ ] Edge case: No flights to assign

**Scope**: **M** (Medium - 3-4 hours)

**Priority**: **HIGH** - Critical algorithm needs testing

**Dependencies**: None

---

## Ticket #3: Convert EventDialog.tsx to Multi-Step Form

**Problem**:
- Single massive form (2,168 LOC) with ~30 fields
- Poor UX - overwhelming for users
- Difficult to validate and maintain
- All fields rendered at once (performance issue)

**Current Structure**:
- Single component with all form fields
- Conditional rendering based on event type
- Complex validation logic

**Proposed Fix**:
1. Implement multi-step form with React Hook Form:
   ```typescript
   // Step 1: Basic Info
   <EventBasicInfoStep />  // Name, type, date/time, description

   // Step 2: Participants
   <EventParticipantsStep />  // Squadron selection, qualifications

   // Step 3: Discord Settings (optional)
   <EventDiscordStep />  // Publish settings, channels, notifications

   // Step 4: Reminders (optional)
   <EventRemindersStep />  // Reminder schedule, recipients

   // Step 5: Review & Submit
   <EventReviewStep />  // Summary before creation
   ```
2. Use stepper UI component (custom or from Radix UI)
3. Persist form state to localStorage (auto-save draft)
4. Extract validation schemas to `src/utils/validation/eventValidation.ts`
5. Share form state via Context or React Hook Form

**Risk**: **Medium**
- UX change - users need to adapt
- State management complexity
- Need to maintain backward compatibility for editing

**Tests**:
- [ ] Complete all steps successfully
- [ ] Navigate between steps (back/forward)
- [ ] Validation on each step
- [ ] Draft auto-save and restore
- [ ] Skip optional steps
- [ ] Edit existing event (load into multi-step)

**Scope**: **L** (Large - 6-8 hours)

**Priority**: **HIGH** - Improves UX and maintainability

**Dependencies**: None

---

## Ticket #4: Extract Filtering from RosterManagement.tsx

**Problem**:
- Filtering logic (180 LOC) mixed with display logic
- Complex state management for filters
- Filters applied client-side (performance issue)
- Duplicate filtering UI code

**Proposed Fix**:
1. Create `src/components/ui/roster/RosterFilters.tsx`:
   - Move all filter UI from `FilterDrawer.tsx`
   - Self-contained filter state
   - Emit filter changes via callback
2. Create `src/hooks/useRosterFilters.ts`:
   ```typescript
   export const useRosterFilters = () => {
     const [filters, setFilters] = useState<RosterFilters>({...});
     const applyFilters = (pilots: Pilot[]) => { /* ... */ };
     const clearFilters = () => { /* ... */ };
     return { filters, applyFilters, clearFilters, setFilters };
   };
   ```
3. Move server-side filtering to `pilotService.ts`:
   ```typescript
   async getPilots(filters: RosterFilters): Promise<Pilot[]> {
     let query = supabase.from('pilots').select('*');
     if (filters.status) query = query.in('status', filters.status);
     if (filters.squadron) query = query.eq('squadron_id', filters.squadron);
     // ... more filters
     return query;
   }
   ```
4. Update `RosterManagement.tsx` to use hook

**Risk**: **Low**
- Well-defined interface
- Easy to test filters independently
- Backward compatible

**Tests**:
- [ ] Filter by status
- [ ] Filter by qualifications
- [ ] Filter by squadron
- [ ] Filter by billet
- [ ] Free text search
- [ ] Multiple filters combined
- [ ] Clear all filters

**Scope**: **M** (Medium - 2-3 hours)

**Priority**: **MEDIUM** - Improves organization and performance

**Dependencies**: None

---

## Ticket #5: Standardize Service Error Handling

**Problem**:
- Inconsistent error handling across services
- Some services throw errors, others return `{ error }` objects
- No centralized error logging
- Poor error messages to users

**Current Pattern**:
```typescript
// Service A - throws
async createPilot(pilot) {
  const { data, error } = await supabase.from('pilots').insert(pilot);
  if (error) throw error;  // ❌ Throws
  return data;
}

// Service B - returns error
async updatePilot(id, pilot) {
  const { data, error } = await supabase.from('pilots').update(pilot);
  return { data, error };  // ❌ Returns error
}
```

**Proposed Fix**:
1. Standardize on throwing errors:
   ```typescript
   async createPilot(pilot: Pilot): Promise<Pilot> {
     try {
       const { data, error } = await supabase
         .from('pilots')
         .insert(pilot)
         .select()
         .single();

       if (error) throw new DatabaseError(error.message, { cause: error });
       if (!data) throw new DatabaseError('No data returned');

       return data;
     } catch (error) {
       logger.error('Failed to create pilot', { pilot, error });
       throw error;
     }
   }
   ```
2. Create custom error classes:
   ```typescript
   // src/utils/errors.ts
   export class DatabaseError extends Error { /* ... */ }
   export class ValidationError extends Error { /* ... */ }
   export class PermissionError extends Error { /* ... */ }
   ```
3. Add centralized error logger:
   ```typescript
   // src/utils/logger.ts
   export const logger = {
     error(message: string, context: any) { /* ... */ },
     warn(message: string, context: any) { /* ... */ }
   };
   ```
4. Update all services to use pattern
5. Create error boundary for UI error handling

**Risk**: **Medium**
- Requires updating all service calls
- Need to ensure all errors are caught in UI
- Potential for breaking changes if not careful

**Tests**:
- [ ] Service throws on database error
- [ ] Error logged to console/service
- [ ] User-friendly error message shown
- [ ] Error boundary catches errors
- [ ] Specific error types handled correctly

**Scope**: **M** (Medium - 4-5 hours)

**Priority**: **MEDIUM** - Improves debugging and UX

**Dependencies**: None

---

## Ticket #6: Add Pagination to Large Lists

**Problem**:
- Roster and Events views fetch all records at once
- Slow load times for 500+ records
- High memory usage
- Poor performance on mobile devices

**Proposed Fix**:
1. Add pagination to `pilotService.getPilots()`:
   ```typescript
   async getPilots(
     filters: RosterFilters,
     page: number = 1,
     pageSize: number = 50
   ): Promise<{ pilots: Pilot[], total: number }> {
     const from = (page - 1) * pageSize;
     const to = from + pageSize - 1;

     const { data, error, count } = await supabase
       .from('pilots')
       .select('*', { count: 'exact' })
       .range(from, to);

     if (error) throw error;
     return { pilots: data || [], total: count || 0 };
   }
   ```
2. Create pagination component:
   ```tsx
   <Pagination
     currentPage={page}
     totalPages={Math.ceil(total / pageSize)}
     onPageChange={setPage}
   />
   ```
3. Update `RosterManagement.tsx` to use pagination:
   ```typescript
   const [page, setPage] = useState(1);
   const [total, setTotal] = useState(0);

   useEffect(() => {
     const { pilots, total } = await pilotService.getPilots(filters, page, 50);
     setPilots(pilots);
     setTotal(total);
   }, [page, filters]);
   ```
4. Add page size selector (25, 50, 100, 200)
5. Repeat for `EventsManagement.tsx`

**Alternative**: Virtual scrolling with `react-virtual`

**Risk**: **Low**
- Well-established pattern
- Easy to implement
- Backward compatible (start with page 1)

**Tests**:
- [ ] Navigate between pages
- [ ] Change page size
- [ ] Filter preserves pagination
- [ ] Total count accurate
- [ ] Edge case: Last page with partial results

**Scope**: **S** (Small - 2-3 hours)

**Priority**: **MEDIUM** - Performance improvement

**Dependencies**: None

---

## Ticket #7: Extract Shared Bulk Edit Logic

**Problem**:
- Duplicate bulk edit logic in:
  - `BulkEditPilotDetails.tsx` (pilots)
  - `EventsManagement.tsx` (events - basic)
  - Potential future features (flights, assignments)
- No consistent UX for bulk operations

**Proposed Fix**:
1. Create generic bulk edit hook:
   ```typescript
   // src/hooks/useBulkEdit.ts
   export const useBulkEdit = <T>(
     items: T[],
     updateFn: (ids: string[], updates: Partial<T>) => Promise<void>
   ) => {
     const [selectedIds, setSelectedIds] = useState<string[]>([]);
     const [isEditing, setIsEditing] = useState(false);

     const selectAll = () => setSelectedIds(items.map(i => i.id));
     const selectNone = () => setSelectedIds([]);
     const toggleSelection = (id: string) => { /* ... */ };
     const applyBulkEdit = async (updates: Partial<T>) => {
       await updateFn(selectedIds, updates);
       selectNone();
     };

     return { selectedIds, selectAll, selectNone, toggleSelection, applyBulkEdit };
   };
   ```
2. Create generic bulk edit UI component:
   ```tsx
   <BulkEditControls
     selectedCount={selectedIds.length}
     totalCount={items.length}
     onSelectAll={selectAll}
     onSelectNone={selectNone}
     onBulkEdit={() => setShowBulkEditModal(true)}
   />
   ```
3. Update `BulkEditPilotDetails.tsx` to use hook
4. Add bulk edit to events (currently manual)

**Risk**: **Low**
- Doesn't affect existing functionality initially
- Can migrate incrementally
- Well-tested pattern

**Tests**:
- [ ] Select/deselect individual items
- [ ] Select all/none
- [ ] Apply bulk update
- [ ] Bulk update with validation
- [ ] Bulk update with errors (partial success)

**Scope**: **S** (Small - 2-3 hours)

**Priority**: **MEDIUM** - Code reuse and consistency

**Dependencies**: None

---

## Ticket #8: Add Database Indexes

**Problem**:
- Missing indexes on frequently queried columns
- Slow queries for large datasets
- Full table scans on foreign keys

**Proposed Fix**:
Add indexes via SQL migration:
```sql
-- Foreign key indexes
CREATE INDEX idx_pilots_squadron_id ON pilots(squadron_id);
CREATE INDEX idx_events_creator_id ON events(creator_id);
CREATE INDEX idx_flights_event_id ON flights(event_id);
CREATE INDEX idx_qualifications_pilot_id ON qualifications(pilot_id);

-- Query optimization indexes
CREATE INDEX idx_pilots_status ON pilots(status);
CREATE INDEX idx_pilots_discord_id ON pilots(discord_id);
CREATE INDEX idx_events_start_datetime ON events(start_datetime);
CREATE INDEX idx_event_reminders_scheduled_time ON event_reminders(scheduled_time);
CREATE INDEX idx_discord_event_attendance_discord_event_id
  ON discord_event_attendance(discord_event_id);

-- Composite indexes for common queries
CREATE INDEX idx_pilots_squadron_status ON pilots(squadron_id, status);
CREATE INDEX idx_events_squadron_start ON events(squadron_id, start_datetime);

-- Partial indexes for active records
CREATE INDEX idx_pilots_active ON pilots(squadron_id) WHERE status = 'Active';
CREATE INDEX idx_events_upcoming ON events(start_datetime) WHERE start_datetime > NOW();
```

**Risk**: **Very Low**
- Indexes only improve read performance
- Small write overhead (negligible for this use case)
- Can be added without downtime

**Tests**:
- [ ] Verify query performance before/after
- [ ] Test write operations still work
- [ ] Measure index size impact
- [ ] Check query plans use indexes

**Scope**: **S** (Small - 1 hour)

**Priority**: **MEDIUM** - Performance improvement

**Dependencies**: Database access

---

## Ticket #9: Add Input Sanitization

**Problem**:
- Event descriptions rendered as HTML without sanitization
- Potential XSS vulnerability
- User-generated content not sanitized

**Proposed Fix**:
1. Install sanitization library:
   ```bash
   npm install dompurify
   npm install --save-dev @types/dompurify
   ```
2. Create sanitization utility:
   ```typescript
   // src/utils/sanitize.ts
   import DOMPurify from 'dompurify';

   export const sanitizeHtml = (html: string): string => {
     return DOMPurify.sanitize(html, {
       ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
       ALLOWED_ATTR: ['href', 'target', 'rel']
     });
   };
   ```
3. Update event rendering:
   ```tsx
   <div dangerouslySetInnerHTML={{
     __html: sanitizeHtml(event.description)
   }} />
   ```
4. Add sanitization to other user content areas

**Risk**: **Low**
- Well-established library
- No breaking changes
- Improves security

**Tests**:
- [ ] Render safe HTML correctly
- [ ] Strip dangerous tags (<script>, <iframe>)
- [ ] Preserve allowed formatting
- [ ] Handle empty/null input
- [ ] Test with malicious payloads

**Scope**: **S** (Small - 1-2 hours)

**Priority**: **HIGH** - Security fix

**Dependencies**: None

---

## Ticket #10: Create Shared Form Components

**Problem**:
- Duplicate form field code across components
- Inconsistent validation patterns
- Difficult to ensure accessibility

**Proposed Fix**:
1. Create shared form components library:
   ```tsx
   // src/components/forms/FormInput.tsx
   <FormInput
     label="Callsign"
     name="callsign"
     value={callsign}
     onChange={setCallsign}
     error={errors.callsign}
     required
   />

   // src/components/forms/FormSelect.tsx
   <FormSelect
     label="Status"
     name="status"
     options={statusOptions}
     value={status}
     onChange={setStatus}
   />

   // src/components/forms/FormDatePicker.tsx
   <FormDatePicker
     label="Event Date"
     value={eventDate}
     onChange={setEventDate}
     minDate={new Date()}
   />
   ```
2. Add form validation helper:
   ```typescript
   // src/utils/validation/formValidation.ts
   export const validators = {
     required: (value: any) => !value ? 'This field is required' : null,
     email: (value: string) => !isEmail(value) ? 'Invalid email' : null,
     minLength: (min: number) => (value: string) =>
       value.length < min ? `Minimum ${min} characters` : null
   };
   ```
3. Integrate with React Hook Form
4. Add consistent styling and accessibility

**Risk**: **Low**
- Additive change - doesn't break existing forms
- Can migrate forms incrementally

**Tests**:
- [ ] Render with/without error
- [ ] Required field validation
- [ ] Keyboard navigation (a11y)
- [ ] Screen reader labels
- [ ] Custom validation rules

**Scope**: **M** (Medium - 3-4 hours)

**Priority**: **LOW** - Nice to have, improves consistency

**Dependencies**: None

---

## Prioritization Matrix

| Ticket | Impact | Effort | Priority | Quick Win? |
|--------|--------|--------|----------|-----------|
| #1 - Split RosterSettings | Very High | Large | CRITICAL | No |
| #2 - Extract Auto-Assignment | High | Medium | HIGH | No |
| #3 - Multi-Step Event Form | High | Large | HIGH | No |
| #4 - Extract Roster Filters | Medium | Medium | MEDIUM | No |
| #5 - Standardize Errors | Medium | Medium | MEDIUM | No |
| #6 - Add Pagination | Medium | Small | MEDIUM | **Yes** ✅ |
| #7 - Shared Bulk Edit | Medium | Small | MEDIUM | **Yes** ✅ |
| #8 - Database Indexes | Medium | Small | MEDIUM | **Yes** ✅ |
| #9 - Input Sanitization | High | Small | HIGH | **Yes** ✅ |
| #10 - Form Components | Low | Medium | LOW | No |

## Recommended Order of Execution

### Phase 1: Quick Wins (1-2 weeks)
1. **Ticket #9** - Input Sanitization (security)
2. **Ticket #8** - Database Indexes (performance)
3. **Ticket #6** - Add Pagination (performance)
4. **Ticket #7** - Shared Bulk Edit (code quality)

### Phase 2: High-Impact Refactors (2-4 weeks)
5. **Ticket #2** - Extract Auto-Assignment (testability)
6. **Ticket #4** - Extract Roster Filters (organization)
7. **Ticket #5** - Standardize Errors (debugging)

### Phase 3: Major Refactors (1-2 months)
8. **Ticket #3** - Multi-Step Event Form (UX)
9. **Ticket #1** - Split RosterSettings (maintainability)
10. **Ticket #10** - Form Components (consistency)

## Success Metrics

- **Code quality**: Reduce average file size below 500 LOC
- **Test coverage**: Achieve 80% coverage on services
- **Performance**: Page load times <2s for large datasets
- **Developer velocity**: Reduce time to add new features by 25%
- **Bug rate**: Reduce regression bugs by 30%

## Related Documentation

- **Hotspots Analysis**: `/docs/HOTSPOTS.md`
- **Architecture**: `/docs/ARCHITECTURE.md`
- **Developer Guide**: `/docs/DEVELOPER_GUIDE.md`
