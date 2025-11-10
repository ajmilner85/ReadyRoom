# Feature Index

This document provides a quick reference to all major features in ReadyRoom, organized by functional area.

## Features Overview

| Feature | Summary | Documentation |
|---------|---------|---------------|
| **Roster Management** | Manage pilot roster, qualifications, status, teams, and filtering | [ROSTER.md](./ROSTER.md) |
| **Events Management** | Create, schedule, and track squadron events with Discord integration | [EVENTS.md](./EVENTS.md) |
| **Mission Planning** | Extract flights from DCS mission files, assign pilots, manage communications | [MISSION_PLANNING.md](./MISSION_PLANNING.md) |
| **Mission Execution** | Real-time flight tracking (launch, en-route, recovery) with drag-and-drop | [MISSION_EXECUTION.md](./MISSION_EXECUTION.md) |
| **Mission Debriefing** | Post-flight after action reports, performance assessment, kill tracking, aggregate analytics | [MISSION_DEBRIEFING.md](./MISSION_DEBRIEFING.md) |
| **Discord Integration** | Publish events, sync roles, verify pilots, send notifications | [DISCORD.md](./DISCORD.md) |
| **Reports & Analytics** | Cycle attendance reports, Discord role verification, trend analysis | [REPORTS.md](./REPORTS.md) |
| **Permissions & Roles** | Role-based access control (RBAC) with permission matrix | [PERMISSIONS.md](./PERMISSIONS.md) |
| **Organization Hierarchy** | Manage Command → Group → Wing → Squadron structure | [ORGANIZATION.md](./ORGANIZATION.md) |
| **Settings & Configuration** | Squadron settings, Discord integration, event defaults, roster fields | [SETTINGS.md](./SETTINGS.md) |
| **Polls** | Create and manage polls for squadron decisions | [POLLS.md](./POLLS.md) |
| **Change Log** | Application changelog with versioning and rich formatting | [CHANGELOG_FEATURE.md](./CHANGELOG_FEATURE.md) |
| **Onboarding** | Interactive guide for new users | [ONBOARDING.md](./ONBOARDING.md) |

## Feature Map by Route

| Route | Feature | Main Component |
|-------|---------|----------------|
| `/` | Home Dashboard | Home.tsx |
| `/roster` | Roster Management | RosterManagement.tsx |
| `/events` | Events Management | EventsManagement.tsx |
| `/mission-prep` | Mission Planning | MissionPreparation.tsx |
| `/mission-coordination` | Mission Execution | AppContent.tsx (Flights view) |
| `/mission-debriefing` | Mission Debriefing | MissionDebriefing.tsx |
| `/reports` | Reports & Analytics | Reports.tsx |
| `/settings` | Settings & Admin | Settings.tsx |

## Feature Dependencies

### Core Features (Required for app to function)
- **Authentication** - All features require Discord OAuth login
- **Organization Hierarchy** - All data scoped to Wing/Squadron
- **Permissions** - All actions gated by permission checks

### Standalone Features (Can be used independently)
- **Roster Management** - Independent of events/missions
- **Events Management** - Can work without Discord (in-app only)
- **Polls** - Self-contained voting system

### Integrated Features (Depend on other features)
- **Mission Planning** - Requires Roster (pilot assignments)
- **Discord Integration** - Enhances Events, Roster verification
- **Reports** - Aggregates data from Events, Roster
- **Mission Execution** - Depends on Mission Planning

## Data Flow Between Features

```
┌─────────────────────┐
│  Roster Management  │
│  (Pilots, Quals)    │
└──────────┬──────────┘
           ↓
    ┌──────┴──────┐
    ↓             ↓
┌─────────────┐ ┌────────────────┐
│   Events    │ │ Mission Planning│
│ Management  │ │ (Flight Assign.)│
└──────┬──────┘ └────────┬────────┘
       ↓                 ↓
  ┌────┴─────────────────┴────┐
  │   Discord Integration     │
  │  (Notifications, Roles)   │
  └───────────────────────────┘
           ↓
    ┌──────┴──────┐
    │   Reports   │
    │  Analytics  │
    └─────────────┘
```

## Quick Start by User Role

### Squadron Member
1. **Login** → Discord OAuth authentication
2. **View Roster** → See squadron pilots and status
3. **RSVP to Events** → Respond to upcoming events
4. **Check Mission Assignments** → See assigned flights

### Squadron Leader / SDO
1. All member features +
2. **Manage Roster** → Add/edit/archive pilots
3. **Create Events** → Schedule events and publish to Discord
4. **Plan Missions** → Assign pilots to flights
5. **Run Reports** → View attendance trends

### Wing Administrator
1. All leader features +
2. **Manage Organization** → Create/edit Squadrons, Groups, Commands
3. **Configure Permissions** → Set role-based access control
4. **Global Settings** → Manage Wing-wide configuration
5. **Discord Integration** → Configure bot tokens and channels

## Feature Complexity Ratings

| Feature | Complexity | Reason |
|---------|-----------|--------|
| Roster Management | **High** | Bulk editing, filtering, qualifications, Discord sync |
| Events Management | **High** | Discord publishing, reminders, threading, attendance tracking |
| Mission Planning | **Very High** | DCS file parsing, auto-assignment, multi-squadron coordination |
| Mission Execution | **Medium** | Drag-and-drop, state management, WebSocket updates |
| Discord Integration | **Very High** | Bot management, thread handling, role sync, multi-guild support |
| Reports | **Medium** | Data aggregation, Chart.js visualizations, Excel export |
| Permissions | **High** | Permission calculator, matrix UI, role inheritance |
| Organization | **Medium** | Hierarchical data, cascading deletes, RLS enforcement |
| Settings | **Medium** | Multi-tab UI, validation, default values |
| Polls | **Low** | Simple CRUD with voting logic |
| Change Log | **Low** | Markdown rendering, version display |
| Onboarding | **Low** | Step-by-step wizard |

## Feature Test Priorities

Based on complexity and criticality:

1. **High Priority**:
   - Authentication flow
   - Permission checks
   - Mission Planning (auto-assignment)
   - Discord integration (event publishing)
   - Roster bulk operations

2. **Medium Priority**:
   - Event creation and editing
   - Mission execution drag-and-drop
   - Reports data accuracy
   - Organization hierarchy operations

3. **Low Priority**:
   - Poll creation and voting
   - Change log display
   - Onboarding steps
   - Settings UI validation

## Common Cross-Feature Operations

### Adding a New Pilot
1. **Roster Management** → Create pilot record
2. **Discord Integration** (optional) → Link Discord user
3. **Permissions** → Assign role
4. **Events** → Pilot can now RSVP
5. **Mission Planning** → Pilot available for assignment

### Creating an Event
1. **Events Management** → Create event with details
2. **Roster Management** → Mark participating squadrons
3. **Discord Integration** (optional) → Publish to Discord
4. **Reminders** → Schedule automated reminders
5. **Reports** → Event attendance tracked for analytics

### Planning a Mission
1. **Mission Planning** → Upload DCS .miz file
2. **File Parsing** → Extract flights and aircraft
3. **Roster Integration** → Load available pilots
4. **Auto-Assignment** → Match pilots to aircraft by qualifications
5. **Discord** (optional) → Post flight assignments
6. **Mission Execution** → Track flight progress

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Roster Management | ✅ Production | Actively used |
| Events Management | ✅ Production | Actively used |
| Mission Planning | ✅ Production | Core feature |
| Mission Execution | ✅ Production | Real-time tracking |
| Discord Integration | ✅ Production | Multiple bots supported |
| Reports | ✅ Production | Recently optimized |
| Permissions | ✅ Production | RBAC enforced |
| Organization | ✅ Production | Hierarchical structure |
| Settings | ✅ Production | Multi-squadron config |
| Polls | ✅ Production | Active feature |
| Change Log | ✅ Production | Regular updates |
| Onboarding | ✅ Production | User guide |
| Teams | ✅ Production | New feature (recent) |

## For More Details

- See individual feature docs linked in the table above
- Check `/docs/API/ENDPOINTS.md` for API specifications
- Review `/docs/HOTSPOTS.md` for known complexity areas
- Read `/docs/REFACTOR_TICKETS.md` for improvement opportunities
