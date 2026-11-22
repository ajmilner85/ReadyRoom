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
