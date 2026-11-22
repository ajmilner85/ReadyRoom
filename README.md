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

### CATCC UI kit and Figma plugin

- `/catcc/kit` (signed in, like `/catcc`) is the CATCC UI kit: the CATCC interface's tokens, type and components (header, controls, panels, scope symbols, data tags, strips, overlays, icons) rendered live with demo data. The source is `src/components/catcc/kit/`.
- `figma/catcc-kit/` is a Figma development plugin built from that page. It makes CATCC colour variables, text styles and components with variants for sketching new CATCC features. To import it, open the Figma desktop app, choose **Plugins → Development → Import plugin from manifest…**, pick `figma/catcc-kit/manifest.json`, then run **CATCC Kit**. See `figma/catcc-kit/README.md`.
- After changing the kit, regenerate the plugin's data with `node scripts/catcc/figma-kit.gen.ts`. It needs headless Chromium (playwright-core) and the network for the Google fonts. The tests check that it is current.

## Customization

Squadron-specific configurations can be adjusted in the settings panel, allowing customization of callsigns, qualifications, and roles specific to your unit.

## License

See the [LICENSE](LICENSE) file for details.
