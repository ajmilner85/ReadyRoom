# Developer Guide

## Getting Started

This guide will help you set up ReadyRoom for local development.

## Prerequisites

- **Node.js**: v18+ (v20 recommended)
- **npm**: v9+
- **Git**: Latest version
- **Code Editor**: VS Code recommended
- **Discord Developer Account**: For bot development
- **Supabase Account**: For database access

## Repository Setup

### 1. Clone Repository
```bash
git clone https://github.com/ajmilner85/ReadyRoom.git
cd ReadyRoom
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Install Server Dependencies
```bash
cd server
npm install
cd ..
```

### 4. Install Discord Bot Dependencies
```bash
cd SDOBot
npm install
cd ..
```

## Environment Configuration

### Frontend Environment Variables

Create `.env.local` in the root directory:
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Server URLs
VITE_SERVER_URL=http://localhost:3001
VITE_DISCORD_BOT_URL=http://localhost:3002
```

### Backend Environment Variables

Create `.env.local` in root (or `.env` in production):
```bash
# Supabase Configuration (Server-side)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Discord Bot Tokens
BOT_TOKEN=your-discord-bot-token
BOT_TOKEN_DEV=your-dev-bot-token (optional)
BOT_TOKEN_PROD=your-prod-bot-token (optional)

# Server Configuration
SERVER_PORT=3001
NODE_ENV=development

# Bot Configuration
DISCORD_BOT_PORT=3002
```

### Getting Supabase Credentials

1. Log in to [Supabase](https://supabase.com)
2. Navigate to your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

### Getting Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing
3. Go to **Bot** section
4. Click **Reset Token** and copy
5. Paste into `BOT_TOKEN` in `.env.local`

**Bot Permissions Required**:
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions
- Manage Messages
- Create Public Threads
- Send Messages in Threads

**Privileged Intents**:
- Server Members Intent
- Message Content Intent

### Invite Bot to Server

1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select permissions (see above)
4. Copy generated URL and open in browser
5. Select your test Discord server

## Running the Application

### Development Mode (All Services)

**Terminal 1 - Frontend**:
```bash
npm run dev
```
Frontend runs on: `http://localhost:5173`

**Terminal 2 - Express Server**:
```bash
cd server
npm run dev
```
Server runs on: `http://localhost:3001`

**Terminal 3 - Discord Bot** (optional):
```bash
cd SDOBot
npm run dev
```
Bot runs on: `http://localhost:3002`

### Production Build

```bash
# Build frontend
npm run build

# Preview production build
npm run preview
```

Output: `/dist` directory with optimized bundles

## Project Structure

```
ReadyRoom/
├── src/                     # Frontend source code
│   ├── components/          # React components (107 files)
│   │   ├── ui/             # Feature components
│   │   ├── auth/           # Authentication
│   │   ├── settings/       # Settings panels
│   │   ├── reports/        # Analytics
│   │   ├── layout/         # Layout components
│   │   └── onboarding/     # Onboarding wizard
│   ├── context/            # React Context providers (5 contexts)
│   ├── hooks/              # Custom hooks (7 hooks)
│   ├── utils/              # Services and utilities (60+ files)
│   ├── types/              # TypeScript type definitions (19 files)
│   ├── styles/             # Style utilities
│   ├── assets/             # Images and media
│   ├── App.tsx             # Main app component
│   └── main.tsx            # React entry point
├── server/                  # Express API server
│   ├── index.js            # Main server file
│   ├── supabaseClient.js   # Supabase client
│   ├── package.json        # Server dependencies
│   └── Dockerfile          # Container config
├── SDOBot/                  # Discord bot
│   ├── index.js            # Bot entry point
│   ├── discordBot.js       # Bot logic
│   ├── lib/                # Bot modules (8 files)
│   ├── package.json        # Bot dependencies
│   └── Dockerfile          # Container config
├── public/                  # Static assets
├── database_migrations/     # Database migrations
├── docs/                    # Documentation (this folder!)
├── .github/                 # CI/CD workflows
├── index.html              # HTML entry point
├── vite.config.ts          # Vite configuration
├── tsconfig*.json          # TypeScript configs (3 files)
├── tailwind.config.cjs     # Tailwind CSS config
├── package.json            # Frontend dependencies
└── README.md               # Project README
```

## Development Workflow

### 1. Create Feature Branch
```bash
git checkout -b feature/my-new-feature
```

### 2. Make Changes
- Edit code in `src/` for frontend
- Edit code in `server/` or `SDOBot/` for backend
- Follow coding conventions (see below)

### 3. Test Locally
- Verify frontend changes in browser
- Test API endpoints via Postman or curl
- Check Discord bot interactions

### 4. Lint Code
```bash
npm run lint
```

### 5. Commit Changes
```bash
git add .
git commit -m "feat: add new feature"
```

**Commit Convention** (recommended):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Add tests
- `chore:` - Build/config changes

### 6. Push Branch
```bash
git push origin feature/my-new-feature
```

### 7. Create Pull Request
- Go to GitHub repository
- Click "New Pull Request"
- Select your branch
- Add description
- Request review

## Coding Conventions

### TypeScript
- Use TypeScript for all new files
- Avoid `any` type - use `unknown` or proper types
- Export types from `src/types/`
- Use interfaces for object shapes

### React Components
- Functional components with hooks (no class components)
- Use `React.FC<Props>` for component types
- Extract reusable logic into custom hooks
- Use Context for global state (not prop drilling)

### File Naming
- Components: `PascalCase.tsx` (e.g., `RosterManagement.tsx`)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useMission.ts`)
- Services: `camelCase.ts` with `Service` suffix (e.g., `pilotService.ts`)
- Types: `PascalCase.ts` with `Types` suffix (e.g., `PilotTypes.ts`)

### Component Structure
```typescript
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { pilotService } from '../utils/pilotService';
import type { Pilot } from '../types/PilotTypes';

interface MyComponentProps {
  pilotId: string;
  onSave?: () => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ pilotId, onSave }) => {
  const { user } = useAuth();
  const [pilot, setPilot] = React.useState<Pilot | null>(null);

  React.useEffect(() => {
    // Load data
  }, [pilotId]);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};

export default MyComponent;
```

### Service Pattern
```typescript
// pilotService.ts
import { supabase } from './supabaseClient';
import type { Pilot } from '../types/PilotTypes';

export const pilotService = {
  async getPilots(squadronId: string): Promise<Pilot[]> {
    const { data, error } = await supabase
      .from('pilots')
      .select('*')
      .eq('squadron_id', squadronId);

    if (error) throw error;
    return data || [];
  },

  async createPilot(pilot: Partial<Pilot>): Promise<Pilot> {
    const { data, error } = await supabase
      .from('pilots')
      .insert(pilot)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
```

### Styling
- Use Tailwind CSS utility classes
- Create reusable style objects in `src/styles/`
- Avoid inline styles unless dynamic
- Use `clsx` for conditional classes

```tsx
import clsx from 'clsx';

<button
  className={clsx(
    'px-4 py-2 rounded',
    isActive ? 'bg-blue-500 text-white' : 'bg-gray-200'
  )}
>
  Click Me
</button>
```

## Common Tasks

### Add a New Page

1. Create component in `src/components/ui/`:
```typescript
// src/components/ui/MyNewPage.tsx
import React from 'react';

const MyNewPage: React.FC = () => {
  return <div>My New Page</div>;
};

export default MyNewPage;
```

2. Add route in `src/App.tsx`:
```typescript
const MyNewPage = React.lazy(() => import('./components/ui/MyNewPage'));

// In Routes component:
<Route path="/my-page" element={
  <Suspense fallback={<StandardPageLoader />}>
    <MyNewPage />
  </Suspense>
} />
```

3. Add navigation in `src/components/ui/NavigationBar.tsx`

### Add a New Supabase Table

1. Create table in Supabase dashboard or via migration
2. Add type to `src/types/` (or regenerate from Supabase CLI)
3. Create service in `src/utils/`:
```typescript
// src/utils/myEntityService.ts
export const myEntityService = {
  async getAll() { ... },
  async create(entity) { ... },
  async update(id, entity) { ... },
  async delete(id) { ... }
};
```

### Add Discord Bot Command

1. Edit `SDOBot/discordBot.js` or create new module in `SDOBot/lib/`
2. Register command handler
3. Test in Discord server
4. Update documentation

### Run Database Migration

1. Create migration SQL file in `database_migrations/`
2. Run in Supabase SQL Editor
3. Document changes in migration README

## Testing

### Manual Testing Checklist

Frontend:
- [ ] Login with Discord OAuth
- [ ] Navigate to each page
- [ ] Test CRUD operations
- [ ] Verify permissions
- [ ] Check mobile responsive

Backend:
- [ ] Test API endpoints with Postman
- [ ] Verify database updates
- [ ] Check error handling
- [ ] Test Discord bot interactions

### Automated Testing

**Status**: Not currently implemented

**Recommended Setup**:
- **Frontend**: Vitest + React Testing Library
- **Backend**: Jest + Supertest
- **E2E**: Playwright or Cypress

## Troubleshooting

### Frontend Won't Start
- Check Node.js version: `node --version` (should be v18+)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check `.env.local` variables

### Backend Connection Errors
- Verify Supabase URL and keys in `.env.local`
- Check server is running on port 3001
- Verify CORS settings in `server/index.js`

### Discord Bot Not Responding
- Verify bot token in `.env.local`
- Check bot is invited to server with correct permissions
- Check privileged intents are enabled
- Review `SDOBot/index.js` console logs

### Database Permission Errors
- Check user's Wing assignment in `user_profiles`
- Verify RLS policies in Supabase
- Ensure service role key is used for admin operations

### Build Errors
- Run `npm run lint` to check for errors
- Check TypeScript errors: `npx tsc --noEmit`
- Clear Vite cache: `rm -rf node_modules/.vite`

## Performance Tips

1. **Code Splitting**: Use `React.lazy()` for large components
2. **Memoization**: Use `React.memo()` for expensive renders
3. **Database Queries**: Use `.select()` to limit columns
4. **Image Optimization**: Use WebP format for images
5. **Bundle Analysis**: Run `npm run build` and check bundle size

## Security Best Practices

1. **Never commit `.env` files** - Use `.env.local` for development
2. **Use service role key only server-side** - Never in frontend
3. **Validate user input** - Both client and server side
4. **Use RLS policies** - Enforce data access at database level
5. **Sanitize Discord messages** - Prevent injection attacks
6. **Rate limit API calls** - Prevent abuse

## Deployment

### Frontend (Vercel)
1. Push to `main` branch
2. Vercel auto-deploys via GitHub integration
3. Set environment variables in Vercel dashboard

### Backend (Fly.io)
```bash
cd server
fly deploy
```

```bash
cd SDOBot
fly deploy
```

### Database (Supabase)
- Migrations applied via Supabase dashboard
- Production database uses separate Supabase project

## Getting Help

- **Documentation**: Check `/docs` folder
- **Code Comments**: Read inline comments in complex functions
- **Git History**: Use `git log` to see why changes were made
- **Issues**: Open GitHub issue for bugs or questions

## Additional Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Discord.js Guide](https://discordjs.guide)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
