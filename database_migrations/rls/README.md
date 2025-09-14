# Row Level Security (RLS) Implementation

This folder contains SQL scripts to replace overly permissive RLS policies with proper wing-based access control and permission-based management.

## Current Problem

Most tables currently have "any authenticated user can do anything" policies:
```sql
CREATE POLICY "Allow authenticated everything" ON table_name
FOR ALL TO authenticated USING (true);
```

This provides no data isolation between wings and no permission enforcement at the database level.

## Implementation Approach

### Wing-Based Access Control
- **Primary principle**: Users can see data within their wing
- **Permission escalation**: Users with appropriate permissions can access data across wings
- **Organization hierarchy**: Command → Group → Wing → Squadron

### Permission Integration
- **Leverages existing permission system**: `app_permissions`, `permission_rules`, `user_permission_cache`
- **Scope handling**: `global`, `own_wing`, `own_squadron`
- **Permission caching**: Uses cached permissions for performance

## Script Execution Order

Execute these scripts **one at a time** to implement RLS incrementally:

### 1. `01_pilots_table_rls.sql` (HIGH PRIORITY)
- **Impact**: Core personnel data protection
- **Features**: Wing-based pilot visibility, permission-based management
- **Functions**: `user_has_roster_permission()`, `user_can_view_pilot()`

### 2. `02_events_table_rls.sql` (HIGH PRIORITY)
- **Impact**: Event management and visibility
- **Features**: Wing-based event access, anonymous read maintained
- **Functions**: `user_has_event_permission()`, `user_can_view_event()`

### 3. `03_pilot_assignments_rls.sql` (CRITICAL)
- **Impact**: Controls squadron membership (foundational for all other access)
- **Features**: Wing-based assignment visibility, secure assignment management
- **Functions**: `user_can_view_assignment()`, `user_can_manage_assignment()`

### 4. `04_pilot_qualifications_and_roles_rls.sql` (MEDIUM PRIORITY)
- **Impact**: Personnel qualifications and role assignments, training cycles
- **Features**: Wing-based visibility, permission-based management, public read access
- **Functions**: `user_can_view_cycle()`

### 5. `05_organization_tables_rls.sql` (MEDIUM PRIORITY)
- **Impact**: Organizational structure and mission planning
- **Features**: Hierarchical access control, administrative permissions
- **Functions**: `user_can_view_squadron()`, `user_can_view_wing()`

### 6. `06_support_tables_rls.sql` (LOW PRIORITY)
- **Impact**: Attendance tracking, lookup tables, operational data
- **Features**: Event-based visibility, public lookup access, service role integration

## Key Functions Created

### Core Access Control
- `user_has_roster_permission(user_id, permission, target_pilot_id)` - Roster management permissions with proper scope enforcement
- `user_has_event_permission(user_id, permission, target_event_id)` - Event management permissions with proper scope enforcement
- `user_can_view_pilot(user_id, pilot_id)` - Wing-based pilot visibility
- `user_can_view_event(user_id, event_id)` - Wing-based event visibility

### Specialized Functions
- `user_can_view_assignment()` - Assignment visibility control
- `user_can_manage_assignment()` - Assignment management control with proper scope enforcement
- `user_can_view_squadron()` - Squadron visibility control
- `user_can_manage_squadron()` - Squadron management control with proper scope enforcement
- `user_can_view_wing()` - Wing visibility control
- `user_can_view_cycle()` - Training cycle visibility control
- `user_can_manage_cycle()` - Training cycle management control with proper scope enforcement

## Testing Each Script

Each script includes testing queries at the bottom. After applying a script:

1. **Verify policies are active**:
   ```sql
   SELECT schemaname, tablename, policyname, cmd, roles
   FROM pg_policies
   WHERE tablename = 'table_name'
   ORDER BY policyname;
   ```

2. **Test helper functions work**:
   ```sql
   SELECT user_can_view_pilot(auth.uid(), (SELECT id FROM pilots LIMIT 1));
   ```

3. **Verify data access**:
   ```sql
   SELECT count(*) FROM table_name WHERE access_function(auth.uid(), table_name.id);
   ```

## Permission Mappings

### Roster Management
- `manage_roster` - General roster management with scope: global > own_wing > own_squadron
- `edit_pilot_qualifications` - Qualification management with scope: global > own_wing > own_squadron
- `delete_pilots` - Pilot deletion permissions with scope: global > own_wing > own_squadron
- `manage_standings` - Standing management with scope: global > own_wing > own_squadron
- `view_public_roster` - Public roster visibility (global scope)

### Event Management
- `manage_events` - General event management with scope: global > own_wing > own_squadron
- `create_training_cycles` - Training cycle creation with scope: global > own_wing > own_squadron
- `manage_event_attendance` - Attendance tracking with scope: global > own_wing > own_squadron
- `override_event_settings` - Event setting overrides with scope: global > own_wing > own_squadron

### Organization Settings
- `manage_squadron_settings` - Squadron-level settings with scope: global > own_wing > own_squadron
- `edit_organization_settings` - Wing/command/group settings (global scope only)

### Mission Preparation
- `assign_mission_roles` - Mission role assignment with scope: global > own_wing > own_squadron
- `edit_flight_assignments` - Flight planning with scope: global > own_wing > own_squadron

## Security Considerations

### Data Isolation
- **Wing boundaries**: Primary security boundary
- **Permission escalation**: Controlled cross-wing access
- **Service roles**: Maintained for system operations

### Backward Compatibility
- **Anonymous access**: Preserved where needed for public features
- **Service key operations**: Continued support for backend processes
- **Public lookups**: Reference data remains publicly accessible

### Performance Impact
- **Cached permissions**: Uses existing caching system
- **Minimal queries**: Helper functions optimized for performance
- **Index considerations**: Existing indexes should support new queries

## Rollback Strategy

If issues arise, you can rollback by dropping the new policies and recreating the permissive ones:

```sql
-- Example rollback for pilots table
DROP POLICY "pilots_select" ON pilots;
DROP POLICY "pilots_insert" ON pilots;
DROP POLICY "pilots_update" ON pilots;
DROP POLICY "pilots_delete" ON pilots;

CREATE POLICY "Allow authenticated read access" ON pilots
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert access" ON pilots
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update access" ON pilots
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete access" ON pilots
FOR DELETE TO authenticated USING (true);
```

## Implementation Notes

1. **Test thoroughly** in development before applying to production
2. **Apply one script at a time** to isolate any issues
3. **Monitor performance** after each implementation
4. **Verify application functionality** still works as expected
5. **Check service role operations** continue to function properly

## Support

If you encounter issues during implementation:
1. Check the testing queries in each script
2. Verify permission cache is populated for test users
3. Ensure helper functions are accessible to authenticated role
4. Review application logs for RLS-related errors
5. Consider temporary rollback if critical functionality breaks