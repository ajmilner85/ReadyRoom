# LLM Context Guide

This document helps AI assistants (like Claude Code or GitHub Copilot) navigate the ReadyRoom codebase efficiently.

## Start Here

When first exploring this codebase, open these files in order:

1. **`/docs/ARCHITECTURE.md`** - System overview and tech stack
2. **`/docs/FEATURES/INDEX.md`** - Feature catalog
3. **`package.json`** - Dependencies and scripts
4. **`src/App.tsx`** - Main app routes and structure
5. **`src/main.tsx`** - React bootstrap and providers

## Quick Navigation by Task

### "I need to understand authentication"
**Files to read**:
- `src/context/AuthContext.tsx` - Auth state management
- `src/components/auth/ProtectedRoute.tsx` - Route protection
- `src/components/auth/AuthCallback.tsx` - OAuth callback handler
- `src/utils/supabaseClient.ts` - Supabase client setup

**Key concepts**:
- Discord OAuth via Supabase Auth
- JWT tokens stored in localStorage
- `useAuth()` hook for accessing user

### "I need to modify the roster"
**Files to read**:
- `src/components/ui/RosterManagement.tsx` - Main roster view (2,602 LOC)
- `src/components/ui/roster/PilotDetails.tsx` - Pilot form (2,115 LOC)
- `src/utils/pilotService.ts` - Pilot CRUD (1,488 LOC)
- `src/types/PilotTypes.ts` - Type definitions

**Key concepts**:
- RLS (Row-Level Security) filters data by Wing
- Soft deletes (status = 'Archived')
- Bulk edit uses transactions

### "I need to work with events"
**Files to read**:
- `src/components/ui/EventsManagement.tsx` - Event list (1,544 LOC)
- `src/components/ui/events/EventDialog.tsx` - Event form (2,168 LOC)
- `src/utils/eventService.ts` - Event CRUD
- `server/index.js:435` - `/api/events/publish` endpoint
- `SDOBot/discordBot.js` - Discord event posting

**Key concepts**:
- Events can be published to multiple Discord servers
- Reminders scheduled via `event_reminders` table
- Threading enabled for multi-squadron events

### "I need to understand mission planning"
**Files to read**:
- `src/components/ui/MissionPreparation.tsx` - Main mission prep view (615 LOC)
- `src/components/ui/mission prep/FlightAssignments.tsx` - Flight assignment UI (2,261 LOC)
- `src/utils/autoAssignUtils.ts` - Auto-assignment logic (834 LOC)
- `src/hooks/useMissionPrepData.ts` - Mission data hook

**Key concepts**:
- DCS `.miz` file parsing extracts flights
- Auto-assignment matches pilots to aircraft by qualifications
- Local storage persists mission prep state

### "I need to add a Discord feature"
**Files to read**:
- `server/index.js` - Express API endpoints
- `SDOBot/index.js` - Discord bot entry point (77KB)
- `SDOBot/discordBot.js` - Bot logic (27KB)
- `SDOBot/lib/eventHandlers.js` - Button interaction handlers
- `SDOBot/lib/messageManager.js` - Message operations
- `src/utils/discordService.ts` - Frontend Discord integration (1,678 LOC)

**Key concepts**:
- Server proxies Discord API calls
- Bot handles interactions (buttons, threads)
- Multi-guild support via `discord_integration` table

### "I need to modify permissions"
**Files to read**:
- `src/utils/permissionService.ts` - Permission CRUD (653 LOC)
- `src/utils/permissionCalculator.ts` - Permission logic (738 LOC)
- `src/components/settings/PermissionsMatrix.tsx` - Permission UI (592 LOC)
- `src/hooks/usePermissions.ts` - Permission hook

**Key concepts**:
- Role-based access control (RBAC)
- Permissions inherited from parent organizations
- Permission checks via `usePermissions()` hook

### "I need to add a report"
**Files to read**:
- `src/components/reports/Reports.tsx` - Reports container
- `src/components/reports/CycleAttendanceReport.tsx` - Example report (1,832 LOC)
- `src/utils/cycleAttendanceReportService.ts` - Report data service (713 LOC)

**Key concepts**:
- Chart.js for visualizations
- Excel export via `xlsx` library
- Aggregates data from events and attendance

## Codebase Glossary

### Domain Terms
- **Board Number**: Unique pilot identifier (e.g., "100", "101")
- **Callsign**: Pilot nickname (e.g., "Maverick", "Iceman")
- **Billet**: Pilot role (e.g., "CO", "XO", "SDO")
- **Squadron**: Organizational unit (CVW-11, VFA-14, etc.)
- **Wing**: Group of squadrons (CVW-11 contains multiple VFA squadrons)
- **RLS**: Row-Level Security - database access control
- **DCS**: Digital Combat Simulator - flight sim software
- **.miz file**: DCS mission file format
- **SDO**: Squadron Duty Officer - event coordinator role
- **Quals**: Qualifications - aircraft/role certifications

### Technical Terms
- **Supabase**: PostgreSQL database + auth platform
- **RLS Policy**: Database rule restricting data access
- **Discord Guild**: Discord server
- **Discord Channel**: Chat channel in a server
- **Discord Thread**: Sub-conversation in a channel
- **WebSocket**: Real-time bidirectional communication
- **Vercel**: Frontend hosting platform
- **Fly.io**: Backend container hosting

### Component Patterns
- **`*Management.tsx`**: Top-level feature views (e.g., RosterManagement, EventsManagement)
- **`*Details.tsx`**: Edit forms (e.g., PilotDetails, EventDetails)
- **`*Dialog.tsx`**: Modal dialogs (e.g., EventDialog, AddFlightDialog)
- **`*Service.ts`**: Data layer services (e.g., pilotService, eventService)
- **`use*.ts`**: Custom React hooks (e.g., useMission, usePermissions)

## Coding Standards

### TypeScript
- **Strict mode enabled**: `tsconfig.json` has strict checks
- **Avoid `any`**: Use `unknown` or proper types
- **Export types**: From `src/types/` directory
- **Interfaces over types**: Use `interface` for object shapes

### React
- **Functional components**: No class components
- **Hooks**: Use `useState`, `useEffect`, `useContext`
- **Custom hooks**: Extract reusable logic
- **Context**: For global state (auth, settings, WebSocket)

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **`clsx`**: Conditional class names
- **Responsive**: Mobile-first design
- **Dark mode**: Not currently implemented

### Data Fetching
- **Supabase client**: Direct database access from frontend
- **Real-time**: Use `.on('UPDATE')` subscriptions for live data
- **Error handling**: Try-catch with user-friendly messages
- **Loading states**: Show spinners during async operations

### File Organization
```
src/
├── components/           # React components
│   ├── ui/              # Feature components
│   ├── auth/            # Auth components
│   ├── settings/        # Settings panels
│   └── reports/         # Report components
├── context/             # React Context providers
├── hooks/               # Custom React hooks
├── utils/               # Services and utilities
├── types/               # TypeScript types
└── styles/              # Style utilities
```

## Common Patterns

### Service Layer Pattern
```typescript
// utils/myEntityService.ts
import { supabase } from './supabaseClient';
import type { MyEntity } from '../types/MyEntityTypes';

export const myEntityService = {
  async getAll(): Promise<MyEntity[]> {
    const { data, error } = await supabase
      .from('my_entities')
      .select('*');
    if (error) throw error;
    return data || [];
  },

  async create(entity: Partial<MyEntity>): Promise<MyEntity> {
    const { data, error } = await supabase
      .from('my_entities')
      .insert(entity)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
```

### Component with Service Pattern
```typescript
import React from 'react';
import { myEntityService } from '../utils/myEntityService';
import type { MyEntity } from '../types/MyEntityTypes';

const MyComponent: React.FC = () => {
  const [entities, setEntities] = React.useState<MyEntity[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    try {
      setLoading(true);
      const data = await myEntityService.getAll();
      setEntities(data);
    } catch (error) {
      console.error('Error loading entities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return <div>{/* Render entities */}</div>;
};
```

### Permission Check Pattern
```typescript
import { usePermissions } from '../hooks/usePermissions';

const MyComponent: React.FC = () => {
  const { hasPermission } = usePermissions();

  const canEdit = hasPermission('edit_pilots');
  const canDelete = hasPermission('delete_pilots');

  return (
    <div>
      {canEdit && <button>Edit</button>}
      {canDelete && <button>Delete</button>}
    </div>
  );
};
```

## Quick-Start Prompts for Common Edits

### Add a new field to pilot form
**Prompt**:
```
I need to add a new field called "emergency_contact" to the pilot form.
Steps:
1. Add field to pilots table in Supabase
2. Update PilotTypes.ts interface
3. Add input to PilotDetails.tsx form
4. Update pilotService.ts create/update methods
5. Regenerate supabase.ts types if needed
```

### Create a new report
**Prompt**:
```
I need to create a new report showing pilot qualification expirations.
Steps:
1. Create component: src/components/reports/QualificationExpirationReport.tsx
2. Create service: src/utils/qualificationExpirationReportService.ts
3. Add report to Reports.tsx as a new tab
4. Use Chart.js for visualization
5. Add Excel export functionality
```

### Add a new API endpoint
**Prompt**:
```
I need to add a new API endpoint for syncing pilot qualifications.
Steps:
1. Add route in server/index.js (e.g., POST /api/qualifications/sync)
2. Implement handler function
3. Call Supabase from server
4. Update ENDPOINTS.md documentation
5. Add error handling and logging
```

### Modify Discord bot behavior
**Prompt**:
```
I need to change how event embeds are formatted in Discord.
Steps:
1. Modify SDOBot/lib/embedCreator.js
2. Update createEventEmbed() function
3. Test in Discord server
4. Update documentation
```

## Large File Warnings

**Files >2000 LOC** (consider refactoring):
1. `src/components/settings/RosterSettings.tsx` (4,280 LOC) ⚠️
2. `src/components/ui/RosterManagement.tsx` (2,602 LOC) ⚠️
3. `src/components/ui/mission prep/FlightAssignments.tsx` (2,261 LOC) ⚠️
4. `src/components/ui/events/EventDialog.tsx` (2,168 LOC) ⚠️
5. `src/components/settings/OrgEntityModal.tsx` (2,126 LOC) ⚠️
6. `src/components/ui/roster/PilotDetails.tsx` (2,115 LOC) ⚠️

**Recommendation**: When modifying these files, consider extracting sub-components or logic into separate files. See `/docs/HOTSPOTS.md` for refactoring suggestions.

## Security Considerations

### Authentication
- **Never bypass RLS**: All data access goes through Supabase with RLS enabled
- **Check permissions**: Use `usePermissions()` hook for UI-level checks
- **Validate server-side**: Don't trust client-side validation alone

### Environment Variables
- **Never commit `.env` files**: Use `.gitignore`
- **Service role key**: Only use server-side, never in frontend
- **Bot tokens**: Store in environment, never hardcode

### Input Validation
- **Sanitize user input**: Especially for Discord messages
- **Validate file uploads**: Check file types and sizes
- **SQL injection**: Prevented by Supabase prepared statements

## Performance Optimization Opportunities

1. **Pagination**: Implement for large lists (roster, events)
2. **Lazy loading**: Use `React.lazy()` for more routes
3. **Memoization**: Add `React.memo()` to expensive components
4. **Database indexing**: Add indexes on frequently queried columns
5. **Image optimization**: Compress images before upload (already done for events)

## Testing Recommendations

**High-priority areas for testing**:
1. Authentication flow (login, logout, session persistence)
2. Permission checks (RBAC enforcement)
3. Mission auto-assignment algorithm
4. Discord event publishing (multi-guild)
5. Roster bulk operations
6. RLS policies (data isolation)

**Testing tools to add**:
- **Vitest**: Frontend unit tests
- **React Testing Library**: Component tests
- **Playwright**: E2E tests
- **Jest**: Backend tests

## Related Documentation

- **Architecture**: `/docs/ARCHITECTURE.md`
- **Features**: `/docs/FEATURES/INDEX.md`
- **API Reference**: `/docs/API/ENDPOINTS.md`
- **Developer Guide**: `/docs/DEVELOPER_GUIDE.md`
- **Refactoring**: `/docs/REFACTOR_TICKETS.md`
- **Hotspots**: `/docs/HOTSPOTS.md`

## Helpful Commands

```bash
# Find a function
grep -r "functionName" src/

# Find all TODOs
grep -r "TODO" src/

# Find usages of a component
grep -r "import.*ComponentName" src/

# Count lines of code
find src -name "*.tsx" -o -name "*.ts" | xargs wc -l

# Find large files
find src -type f -exec wc -l {} + | sort -rn | head -20

# Search for specific text
ag "searchTerm" src/
```

## AI-Specific Tips

When working with this codebase:
1. **Always check RLS policies** before suggesting database queries
2. **Verify permission checks** before adding CRUD operations
3. **Consider multi-squadron scenarios** (data is shared across squadrons in a Wing)
4. **Check Discord rate limits** when adding bot features
5. **Use existing services** instead of creating new database calls
6. **Follow TypeScript types** strictly (don't cast to `any`)
7. **Test in multiple roles** (Admin, Leader, Member) to verify permissions
