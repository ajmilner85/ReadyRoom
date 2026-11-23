# ReadyRoom

A flight planning and pilot management application designed for virtual naval aviation squadrons.

## Overview

ReadyRoom is intended to provide a complete solution for squadron management, mission preparation, and flight operations. It serves as a digital ready room, allowing squadrons to efficiently manage their roster, plan missions, and coordinate flight activities. 

## Key Features

- **Roster Management**: Track pilots, their qualifications, roles, and statuses
- **DCS World Integration**: Import mission data directly from DCS mission files (.miz)
- **Mission Preparation**: Plan missions with tools for:
  - Flight assignments and aircraft grouping
  - Communications planning
  - Automatic pilot assignments based on qualifications
  - Prepare kneeboards
- **Mission Coordination**: Coordinate status of flights from launch to recovery


## Technology Stack

Built with:
- React + TypeScript
- Vite for fast development
- Supabase for backend storage
- Tailwind CSS for styling

## Development

This project uses Vite for an optimized development workflow.

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

### CATCC replay

- `npm run catcc:replay` runs the CATCC room on port 3002 with a Tacview recording as its source "Replay" (`CATCC_ACMI`, else the newest `.acmi` in Downloads, then Documents/Tacview), from 3300 s. `npm run catcc:replay:demo` adds synthetic pattern traffic. Options of `node catcc-server/room/main.ts --acmi <file|latest>`: `--from <s>` (start and restart point), `--speed 2|4|8` (start fast forward), `--once` (stop on the last frame instead of looping), `--demo-pattern`; `CATCC_PORT` sets the port.
- With a replay source, `/catcc` shows playback controls after the "Replay feed" indicator: Rewind, Play / Pause, Fast forward, Restart, Skip ahead, and the skip interval (30 s to 10 min, or any number of seconds up to an hour; kept per browser). Fast forward and Rewind play at 2x, then 4x and 8x with each further press; Play goes back to 1x. The recording's time and the rate (away from 1x) follow; the indicator reads "paused" while paused. Every viewer sees the same playback, and anyone in the room may steer it. A live DCS source has no controls.

### CATCC UI kit and Figma plugin

- `/catcc/kit` (signed in, like `/catcc`) is the CATCC UI kit: the CATCC interface's tokens, type and components (header, controls, panels, scope symbols, data tags, strips, overlays, icons) rendered live with demo data. The source is `src/components/catcc/kit/`.
- `figma/catcc-kit/` is a Figma development plugin built from that page. It makes CATCC colour variables, text styles and components with variants for sketching new CATCC features. To import it, open the Figma desktop app, choose **Plugins → Development → Import plugin from manifest…**, pick `figma/catcc-kit/manifest.json`, then run **CATCC Kit**. See `figma/catcc-kit/README.md`.
- On Figma's free (Starter) plan, use the SVG export instead: drag `figma/catcc-kit/svg/CATCC Kit.svg` (the whole kit by section) or a file from `figma/catcc-kit/svg/parts/` (one per component and variant) into a draft. Text comes in as editable text and layers are named after the components. Then make components with **Create component** / **Create multiple components** → **Combine as variants**. The steps are in `figma/catcc-kit/README.md`.
- After changing the kit, regenerate the plugin's data and the SVGs with `node scripts/catcc/figma-kit.gen.ts`. `node scripts/catcc/figma-kit-svg.ts` redoes only the SVGs from `kit.json`, with no browser. It needs headless Chromium (playwright-core) and the network for the Google fonts. The tests check that it is current.

## CATCC access

The CATCC interface (`/catcc`) and the deck kneeboard read their picture from the CATCC room, which lets in members of the wing only. The room checks every sign-in against the roster (`catcc-server/room/membership.ts`):

- The pilot record whose Discord ID is the Discord account the user signed in with (a pilot record linked only through the user's own profile doesn't count).
- That pilot has a current squadron assignment, in a squadron that isn't deactivated.
- That pilot's current roster status is one marked active in Settings > Roster (today only Active; On Leave, Retired, AWOL and Removed are not).
- Or the user is a ReadyRoom admin: they have a manual-override Developer Settings permission.

Anyone else who signs in sees "Access denied" with the reason (for example "No roster pilot for this Discord account"). Answers are cached for 5 minutes (a refusal for 1 minute), so a roster change takes effect within that time; after a refusal, reload the page. Local development with `CATCC_DEV_NOAUTH` (`npm run catcc:replay`, `npm run catcc:local`) lets anyone in.

## Customization

Squadron-specific configurations can be adjusted in the settings panel, allowing customization of callsigns, qualifications, and roles specific to your unit.

## License

See the [LICENSE](LICENSE) file for details.
