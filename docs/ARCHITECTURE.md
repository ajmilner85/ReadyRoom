# ReadyRoom Architecture

## Purpose

**ReadyRoom** is a comprehensive squadron management and mission planning application for virtual naval aviation communities. It provides tools for:
- Managing pilot rosters, qualifications, and squadron organizations
- Planning and coordinating flight operations
- Tracking event attendance and scheduling
- Discord integration for community engagement
- Real-time mission execution tracking
- Reporting and analytics

## System Overview

ReadyRoom is a **full-stack web application** consisting of three primary components:

```
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Vite + React)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React App (SPA)                                         │   │
│  │  • Mission Planning • Roster Management • Events         │   │
│  │  • Reports • Settings • Real-time Mission Execution      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           ↓ HTTP/REST                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   SUPABASE (PostgreSQL + Auth)                   │
│  • Database (RLS-protected)                                      │
│  • Authentication (Discord OAuth)                                │
│  • Real-time Subscriptions                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVERS (Node.js)                     │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   Express Server     │    │    Discord Bot (SDOBot)      │  │
│  │  • Event Publishing  │◄──►│  • Event Notifications       │  │
│  │  • Reminders         │    │  • Message Management        │  │
│  │  • Discord API Proxy │    │  • Button Interactions       │  │
│  └──────────────────────┘    │  • Thread Management         │  │
│                               │  • Countdown Updates         │  │
│                               └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DISCORD PLATFORM                            │
│  • Servers/Guilds • Channels • Messages • Threads • Roles       │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- **Framework**: React 19.0.0 with TypeScript ~5.7.2
- **Build Tool**: Vite 6.1.0 with SWC transpilation
- **Routing**: React Router v7.8.1
- **Styling**: Tailwind CSS 3.4.17 + PostCSS
- **UI Components**: Radix UI (@radix-ui/react-*)
- **State Management**:
  - React Context API (Auth, Settings, WebSocket, Page Loading, Roll Call)
  - Custom Hooks (7 hooks for domain logic)
- **Drag & Drop**: dnd-kit ecosystem
- **Charts**: Chart.js 4.5.1 with react-chartjs-2
- **Data Libraries**:
  - date-fns & date-fns-tz (date manipulation)
  - uuid (ID generation)
  - xlsx (Excel exports)
  - html-to-image (screenshot generation)
  - proj4 (geospatial mapping)

### Backend
- **Runtime**: Node.js
- **Web Server**: Express 4.18.2
- **Discord**: discord.js 14.22.1
- **Database**: @supabase/supabase-js 2.49.4
- **Real-time**: socket.io 4.8.1 (WebSockets)
- **Middleware**: body-parser, cors, multer
- **Dev Tools**: nodemon

### Infrastructure
- **Database**: Supabase (PostgreSQL with Row-Level Security)
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Fly.io (Docker containers)
- **Authentication**: Discord OAuth via Supabase Auth

## Major Modules

### Frontend (`/src`)

| Module | Purpose | Key Files | Lines of Code |
|--------|---------|-----------|---------------|
| **Components** | UI components (107 files) | RosterManagement.tsx, MissionPreparation.tsx, EventsManagement.tsx | ~50,000 |
| **Context** | Global state providers (5 contexts) | AuthContext.tsx, AppSettingsContext.tsx, WebSocketContext.tsx | ~2,000 |
| **Hooks** | Custom React hooks (7 hooks) | useMission.ts, useMissionPrepData.ts, usePermissions.ts | ~3,000 |
| **Utils** | Business logic & services (60+ files) | pilotService.ts, discordService.ts, missionService.ts | ~25,000 |
| **Types** | TypeScript definitions (19 files) | PilotTypes.ts, FlightData.ts, supabase.ts (auto-generated) | ~3,500 |
| **Styles** | Styling utilities | MissionPrepStyles.ts, commsStyles.ts | ~500 |

### Backend (`/server` & `/SDOBot`)

| Component | Purpose | Key Files | Lines of Code |
|-----------|---------|-----------|---------------|
| **Express Server** | API endpoints for Discord integration | server/index.js | ~2,300 |
| **Discord Bot** | Discord.js bot for events & notifications | SDOBot/index.js, SDOBot/discordBot.js | ~2,700 |
| **Bot Libraries** | Reusable bot modules | SDOBot/lib/* (8 modules) | ~3,000 |

## Runtime Flow

### Application Startup

1. **HTML Entry** (`index.html`) → loads JavaScript bundle
2. **React Bootstrap** (`src/main.tsx`):
   - Initializes React Router
   - Wraps app in `AuthProvider` → `WebSocketProvider`
   - Routes to `/auth/callback`, `/auth/reset-password`, or protected routes
3. **Protected Routes** (`src/App.tsx`):
   - Checks authentication via `AuthContext`
   - Loads app settings via `AppSettingsContext`
   - Initializes wake handlers and debug utilities
   - Renders navigation + routed page components

### Authentication Flow

```
User clicks "Login"
  ↓
Redirects to Supabase Auth (Discord OAuth)
  ↓
Discord authorizes → redirects to /auth/callback
  ↓
AuthCallback.tsx exchanges code for session token
  ↓
Token stored in Supabase client + localStorage
  ↓
AuthContext.user populated → app renders
```

### Data Flow (Example: Event Creation)

```
1. User creates event in EventDialog.tsx
   ↓
2. Component calls eventService.createEvent()
   ↓
3. eventService inserts row into Supabase events table
   ↓
4. If "Publish to Discord" checked:
   ↓
5. Frontend calls /api/events/publish (Express server)
   ↓
6. Server calls discordBot.publishEventToDiscord()
   ↓
7. Bot posts embed message to Discord channel
   ↓
8. Bot stores discord_event_id back in Supabase events table
   ↓
9. Users react to Discord message with buttons (✅ ❓ ❌)
   ↓
10. Bot handles interaction, writes to discord_event_attendance table
   ↓
11. Frontend subscribes to real-time updates via WebSocket
   ↓
12. EventAttendance.tsx re-renders with updated RSVP list
```

## Key Dependencies

### Production Dependencies (Frontend)
```json
{
  "@supabase/supabase-js": "^2.49.4",     // Database & Auth
  "react": "^19.0.0",                      // UI framework
  "react-router-dom": "^7.8.1",           // Client-side routing
  "chart.js": "^4.5.1",                    // Data visualizations
  "@dnd-kit/core": "^6.3.1",              // Drag-and-drop
  "date-fns": "^4.1.0",                    // Date utilities
  "xlsx": "^0.18.5",                       // Excel exports
  "tailwindcss": "^3.4.17"                 // CSS framework
}
```

### Production Dependencies (Backend)
```json
{
  "discord.js": "14.22.1",                 // Discord bot SDK
  "express": "^4.18.2",                    // HTTP server
  "@supabase/supabase-js": "^2.49.4",     // Database client
  "socket.io": "^4.8.1",                   // WebSocket server
  "multer": "*",                           // File uploads
  "cors": "*",                             // CORS middleware
  "dotenv": "*"                            // Environment variables
}
```

## Data Model (High-Level)

### Core Tables
- **pilots** - Pilot roster with qualifications, status, Discord linkage
- **organizations** - Hierarchy: Command → Group → Wing → Squadron
- **events** - Scheduled events with Discord integration
- **event_attendance** - Pilot attendance (in-app)
- **discord_event_attendance** - Discord button responses
- **event_reminders** - Scheduled reminder jobs
- **flights** - Mission flight assignments
- **aircraft** - Aircraft database with squadron assignments
- **qualifications** - Pilot qualifications and currency
- **roles** - User roles for RBAC
- **permissions** - Permission matrix
- **teams** - Pilot team assignments
- **user_profiles** - User preferences and settings
- **change_log_posts** - Application changelog

### Row-Level Security (RLS)
All tables use **Wing-based RLS**:
- Users only see data for their assigned Wing and child organizations (Groups, Squadrons)
- Enforced at the database layer via PostgreSQL RLS policies
- See `/database_migrations/rls/README.md` for details

## ASCII Deployment Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             ↓
┌────────────────────────────────────────────────────────────────┐
│                    VERCEL (CDN + Edge)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Static Assets (HTML, CSS, JS bundles)                   │  │
│  │  Rewrites: /api/* → Supabase or server.fly.dev          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────┬──────────────────────┘
             │                            │
             ↓                            ↓
┌────────────────────────────┐  ┌─────────────────────────────┐
│   SUPABASE PLATFORM        │  │    FLY.IO (Docker)          │
│  • PostgreSQL Database     │  │  ┌─────────────────────────┐│
│  • Auth (Discord OAuth)    │  │  │  Express Server         ││
│  • Real-time Subscriptions │  │  │  Discord Bot (SDOBot)   ││
│  • Storage (Event Images)  │  │  └─────────────────────────┘│
└────────────────────────────┘  └─────────────────────────────┘
             ↑                            ↑
             │                            │
             └────────────────┬───────────┘
                              ↓
                     ┌─────────────────────┐
                     │  DISCORD PLATFORM   │
                     │  • API Gateway      │
                     │  • Guilds/Channels  │
                     │  • Message Storage  │
                     └─────────────────────┘
```

## Security Considerations

1. **Authentication**: Discord OAuth via Supabase Auth (no passwords stored)
2. **Authorization**: Row-Level Security (RLS) enforces Wing-based data isolation
3. **API Security**: CORS configured to allow only authorized origins
4. **Environment Variables**: Sensitive tokens stored in .env (gitignored)
5. **Input Validation**: Form validation + server-side checks
6. **SQL Injection**: Protected via Supabase prepared statements
7. **XSS**: React auto-escapes output; Discord embeds sanitized

## Performance Optimizations

1. **Code Splitting**: React.lazy() for page-level components
2. **Image Compression**: Automatic WebP conversion for event images (60-70% reduction)
3. **Caching**: Vercel CDN caching for static assets
4. **Database Indexing**: Key indexes on foreign keys and query fields
5. **N+1 Query Prevention**: Fixed in cycle attendance reports
6. **Drag-and-Drop**: dnd-kit modifiers for smooth UX
7. **Real-time**: WebSocket subscriptions for live updates (not polling)

## Known Limitations

1. **Single Timezone Handling**: Reference timezone in settings (not multi-timezone)
2. **Large Components**: 6 components >2000 LOC (see HOTSPOTS.md)
3. **Type Safety**: Some `any` types in mission prep state
4. **Testing**: No automated test suite currently
5. **Discord Rate Limits**: Must handle 429 responses gracefully

## Development Workflow

```bash
# Frontend Development
npm run dev          # Vite dev server on http://localhost:5173

# Backend Development
cd server
npm run dev          # Nodemon watches server/index.js

cd SDOBot
npm run dev          # Nodemon watches SDOBot/index.js

# Production Build
npm run build        # TypeScript compile + Vite bundle
npm run preview      # Preview production build locally
```

## Deployment Targets

- **Frontend**: Vercel (automatic deploy from git)
- **Backend**: Fly.io (Docker via `server/Dockerfile` and `SDOBot/Dockerfile`)
- **Database**: Supabase managed PostgreSQL

## Next Steps for Understanding

1. Read `/docs/FEATURES/INDEX.md` for feature breakdown
2. Read `/docs/DEVELOPER_GUIDE.md` for setup instructions
3. Read `/docs/LLM_CONTEXT.md` for AI-assisted navigation
4. Read `/docs/HOTSPOTS.md` for refactoring priorities
5. Explore `/docs/API/ENDPOINTS.md` for API reference
