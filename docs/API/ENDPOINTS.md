# API Endpoints

This document catalogs all HTTP API endpoints exposed by the ReadyRoom Express server.

## Server Overview

**Base URL (Development)**: `http://localhost:3001`
**Base URL (Production)**: `https://readyroom-server.fly.dev` (or custom domain)

**Technology**: Express 4.18.2 on Node.js
**Authentication**: Handled via Supabase (frontend includes auth token in headers)
**CORS**: Configured to allow specific origins (localhost:5173, Vercel domains)

## Endpoint Categories

1. [Health Checks](#health-checks)
2. [Discord Events](#discord-events)
3. [Discord Integration](#discord-integration)
4. [Reminders](#reminders)
5. [Settings](#settings)
6. [Flight Assignments](#flight-assignments)

---

## Health Checks

### `GET /api/health`
**Purpose**: Check server status
**Auth**: None
**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-07T12:00:00.000Z"
}
```

### `HEAD /api/health`
**Purpose**: Lightweight health check (no body)
**Auth**: None
**Response**: HTTP 200 OK

---

## Discord Events

### `POST /api/events/publish`
**Purpose**: Publish event to Discord channel
**Auth**: Required (Supabase token)

**Request Body**:
```json
{
  "title": "Event Name",
  "description": "Event description",
  "startTime": "2025-01-15T19:00:00Z",
  "endTime": "2025-01-15T21:00:00Z",
  "eventId": "uuid",
  "guildId": "discord-guild-id",
  "channelId": "discord-channel-id",
  "imageUrl": "https://...",
  "images": [...],
  "creator": { "boardNumber": "100", "callsign": "Maverick", "billet": "CO" },
  "notificationRoles": ["@everyone", "@Pilots"]
}
```

**Response**:
```json
{
  "success": true,
  "discordMessageId": "1234567890",
  "discordGuildId": "guild-id"
}
```

**Side Effects**:
- Posts embed to Discord channel
- Adds reaction buttons (✅ ❓ ❌)
- Stores `discord_event_id` in events table
- Creates thread if multi-squadron event
- Schedules countdown updates

**File**: `server/index.js:435`

---

### `PUT /api/events/:messageId/edit`
**Purpose**: Edit existing Discord event message
**Auth**: Required

**Request Body**: Same as `/api/events/publish` plus:
```json
{
  "originalStartTime": "2025-01-15T19:00:00Z",
  "reminders": { ... }
}
```

**Response**:
```json
{
  "success": true,
  "messageId": "1234567890"
}
```

**Side Effects**:
- Updates Discord embed message
- Preserves existing reactions
- Reschedules reminders if time changed
- Updates countdown manager

**File**: `server/index.js:642`

---

### `DELETE /api/events/:discordMessageId`
**Purpose**: Delete Discord event message
**Auth**: Required

**Query Params**:
- `guildId` (optional): Discord server ID
- `channelId` (optional): Discord channel ID

**Response**:
```json
{
  "success": true,
  "deletionResults": {
    "originalMessage": true,
    "threads": ["thread-id"],
    "reminders": 2,
    "reminderMessages": 3,
    "countdownCleared": true
  },
  "alreadyDeleted": false
}
```

**Side Effects**:
- Deletes Discord message
- Deletes associated threads
- Deletes reminder messages
- Removes event reminders from DB
- Clears countdown updates

**File**: `server/index.js:236`

---

### `GET /api/events/:eventId/attendance`
**Purpose**: Get event attendance from Discord responses
**Auth**: Required

**Response**:
```json
{
  "accepted": [
    { "boardNumber": "100", "callsign": "Maverick", "discord_id": "...", "billet": "CO" }
  ],
  "declined": [...],
  "tentative": [...]
}
```

**File**: `server/index.js:897`

---

### `GET /api/events/discord/:discordMessageId`
**Purpose**: Find event by Discord message ID
**Auth**: Required

**Response**:
```json
{
  "id": "event-uuid",
  "name": "Event Name",
  "start_datetime": "...",
  ...
}
```

**File**: `server/index.js:1013`

---

## Discord Integration

### `GET /api/discord/servers`
**Purpose**: Get list of Discord servers the bot has access to
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "servers": [
    { "id": "guild-id", "name": "Squadron Name", "icon": "..." }
  ]
}
```

**File**: `server/index.js:1105`

---

### `GET /api/discord/servers/:guildId/channels`
**Purpose**: Get channels for a specific Discord server
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "channels": [
    { "id": "channel-id", "name": "general", "type": 0 }
  ]
}
```

**File**: `server/index.js:1135`

---

### `GET /api/discord/guild-members`
**Purpose**: Fetch all members from a Discord guild
**Auth**: Required

**Query Params**:
- `guildId` (required): Discord server ID

**Response**:
```json
{
  "members": [
    {
      "id": "user-id",
      "username": "username",
      "displayName": "Display Name",
      "roles": ["Role1", "Role2"],
      "isBot": false
    }
  ]
}
```

**Side Effects**: Bots are filtered out

**File**: `server/index.js:1030`

---

### `GET /api/discord/guild/:guildId/roles`
**Purpose**: Get all roles from a Discord guild
**Auth**: Required

**Response**:
```json
{
  "roles": [
    { "id": "role-id", "name": "Pilot", "color": "#...", "position": 1 }
  ]
}
```

**File**: `server/index.js:1266`

---

### `GET /api/discord/guild/:guildId/member/:userId`
**Purpose**: Get specific member from Discord guild
**Auth**: Required

**Response**:
```json
{
  "member": {
    "id": "user-id",
    "username": "username",
    "displayName": "Display Name",
    "roles": ["role-id-1", "role-id-2"]
  }
}
```

**File**: `server/index.js:1299`

---

### `POST /api/discord/switch-bot`
**Purpose**: Switch Discord bot token (dev vs prod) for local development
**Auth**: Required

**Request Body**:
```json
{
  "tokenType": "development" // or "production"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Discord bot switched to development successfully",
  "tokenType": "development",
  "botInfo": { "username": "...", "id": "..." }
}
```

**File**: `server/index.js:132`

---

## Reminders

### `POST /api/reminders/send`
**Purpose**: Send reminder message to Discord for an event
**Auth**: Required

**Request Body**:
```json
{
  "eventId": "uuid",
  "message": "Reminder: Event starting in 15 minutes!",
  "userIds": ["discord-user-id-1", "discord-user-id-2"],
  "discordEventId": [...]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Reminder sent using new threading system"
}
```

**Side Effects**:
- Posts reminder to Discord channel or thread
- Mentions specified users
- Creates thread if first reminder and threading enabled

**File**: `server/index.js:1174`

---

## Settings

### `POST /api/settings/timezone`
**Purpose**: Update reference timezone setting for all squadrons
**Auth**: Required

**Request Body**:
```json
{
  "timezone": "America/New_York"
}
```

**Response**:
```json
{
  "success": true
}
```

**Side Effects**: Updates `squadron` settings in database via RPC

**File**: `server/index.js:106`

---

## Flight Assignments

### `POST /api/discord/post-image`
**Purpose**: Post flight assignments image to Discord channel
**Auth**: Required

**Request Body** (multipart/form-data):
- `image` (file): Image file (PNG/JPG)
- `guildId` (string): Discord server ID
- `channelId` (string): Discord channel ID
- `message` (string, optional): Message text

**Response**:
```json
{
  "success": true,
  "messageId": "discord-message-id",
  "guildId": "guild-id",
  "channelId": "channel-id"
}
```

**File**: `server/index.js:1332`

---

### `PUT /api/discord/update-image/:messageId`
**Purpose**: Update existing Discord message with new flight assignments image
**Auth**: Required

**Request Body** (multipart/form-data):
- `image` (file): Updated image file
- `guildId` (string): Discord server ID
- `channelId` (string): Discord channel ID
- `message` (string, optional): Updated message text

**Response**:
```json
{
  "success": true,
  "messageId": "discord-message-id",
  "guildId": "guild-id",
  "channelId": "channel-id"
}
```

**File**: `server/index.js:1435`

---

### `GET /api/discord/flight-posts/:eventId`
**Purpose**: Get existing flight assignment posts for an event
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "existingPosts": [
    {
      "squadronId": "uuid",
      "guildId": "...",
      "channelId": "...",
      "messageId": "...",
      "isLatest": true,
      "revision": 2
    }
  ],
  "hasExistingPosts": true
}
```

**File**: `server/index.js:1392`

---

### `POST /api/discord/save-flight-post`
**Purpose**: Save flight post record to database
**Auth**: Required

**Request Body**:
```json
{
  "eventId": "uuid",
  "squadronId": "uuid",
  "guildId": "...",
  "channelId": "...",
  "messageId": "...",
  "isUpdate": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Flight post record saved"
}
```

**Side Effects**: Updates `discord_flight_assignments_posts` in events table

**File**: `server/index.js:1510`

---

## Background Processes

The server runs automated background jobs:

### Reminder Processor
- **Frequency**: Every 1 minute
- **Purpose**: Check for scheduled reminders and send them
- **Function**: `processReminders()`
- **File**: `server/index.js:1614`

### Concluded Events Processor
- **Frequency**: Every 1 minute
- **Purpose**: Mark events as concluded and remove response buttons
- **Function**: `processConcludedEvents()`
- **File**: `server/index.js:2239`

### Countdown Manager
- **Frequency**: Managed by Discord bot
- **Purpose**: Update event countdown timers in Discord
- **Module**: `SDOBot/lib/countdownManager.js`

---

## Error Handling

All endpoints return errors in the format:
```json
{
  "success": false,
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (missing/invalid parameters)
- `404` - Resource not found
- `500` - Internal server error

---

## Rate Limiting

No explicit rate limiting on Express server. Discord API rate limits:
- **Message posting**: 5 per 5 seconds
- **Channel operations**: 50 per second
- **Guild operations**: 50 per second

Discord bot handles rate limits automatically via discord.js.

---

## CORS Configuration

Allowed origins (server/index.js:80):
```javascript
[
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'https://ready-room.vercel.app',
  'https://ready-room-git-development-ajmilner85.vercel.app',
  'https://readyroompreview.ajmilner.com'
]
```

Allowed methods: `GET, POST, PUT, DELETE, OPTIONS`

---

## Testing Endpoints

### Using curl

**Health check**:
```bash
curl http://localhost:3001/api/health
```

**Get Discord servers**:
```bash
curl -H "Authorization: Bearer $SUPABASE_TOKEN" \
  http://localhost:3001/api/discord/servers
```

**Post event to Discord**:
```bash
curl -X POST http://localhost:3001/api/events/publish \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Event","startTime":"2025-01-15T19:00:00Z","guildId":"...","channelId":"..."}'
```

---

## Security Considerations

1. **Authentication**: Server trusts Supabase JWT tokens (validated by Supabase SDK)
2. **CORS**: Restricts origins to prevent unauthorized access
3. **Input Validation**: Basic validation on required fields
4. **Discord Bot Token**: Stored in environment variables (`.env`)
5. **Advisory Locks**: Reminder processing uses PostgreSQL advisory locks to prevent duplicate sends in multi-instance setups

---

## Related Documentation

- [Discord Bot Implementation](../SDOBot_README.md)
- [Event Management Feature](../FEATURES/EVENTS.md)
- [Discord Integration Feature](../FEATURES/DISCORD.md)
