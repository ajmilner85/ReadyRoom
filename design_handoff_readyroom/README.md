# Handoff: ReadyRoom UI Refactor

## Overview
A full visual and structural refactor of ReadyRoom (squadron ops for VFA-161 / VFA-44 / CVW-14). Goals: one token system instead of hard-coded hex values; a shared set of base components that replaces the four duplicate style modules (`RosterManagementStyles`, `MissionPrepStyles`, `commsStyles`, `dossierStyles`); a dense, no-page-scroll "CAD, not blog" workspace; light and dark themes; squadron-driven branding; and a usable mobile layout. **App functionality is unchanged.** This is a presentation-layer refactor plus the structural changes listed per page below.

## About the design files
The files in this bundle are **design references built in HTML**. They are prototypes showing the intended look and behaviour, not production code to copy. The task is to **recreate them in the existing ReadyRoom codebase** (React 19 + TypeScript + Vite + Tailwind + Supabase + dnd-kit), using its existing patterns. Do not ship the HTML.

- `ReadyRoom.dc.html` is the whole app as one clickable prototype. Open it in a browser and use the nav rail to switch pages. All styling is inline `style="…"`, so exact values can be read straight from the markup. The logic class at the bottom of the file holds the sample data and the state behaviour.
- `Recovery Explorations.dc.html` holds the recovery/marshal strip explorations. **D02.1 (orange outline, top of the dense set) is the chosen design**; everything else on that page is reference only.
- `tokens.css` is the token source of truth. Port it to `src/index.css` (CSS variables) and map it into `tailwind.config` `theme.extend.colors`, e.g. `panel: 'var(--rr-panel)'`.
- `support.js` is only needed to open the prototypes locally. Ignore it for implementation.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and interactions are final. Recreate them pixel-accurately using tokens and shared components. Where a mockup value conflicts with a token, use the token.

## Rules that apply everywhere
- **No emoji anywhere in the app.** Use line icons (stroke 1.7–1.8, round caps and joins, 16–19px) or the masked aircraft icon. Remove `lucide-react` usages that look off-style. The mockup's icon path data can be lifted directly.
- **No page scroll on desktop.** Panes scroll internally (`min-height:0; overflow:auto`). Mobile is the exception (see Responsive).
- **Shadows:** cards and panes use the subtle `--rr-shadow` or a 1px border only. The old `0 10px 15px -3px rgba(0,0,0,.25)` card shadow is removed everywhere.
- **Text contrast:** body and sub-text use `--rr-text`/`--rr-text2`. `--rr-text3` is only for decorative or disabled text.
- **Sub-page navigation is always a horizontal tab bar** (44px tall, 13px/600, 2px accent underline on the active tab). Never a two-item left rail.
- **Numbers** (board numbers, frequencies, fuel, times, MIDS, TACAN) use IBM Plex Mono.
- **Squadron colour** comes from the admin branding config (Primary, Secondary, Accent, Neutral Light/Dark), never hard-coded. VFA-161: Primary `#F15822`, Secondary `#534758`, Accent `#726279`, Neutral `#D8D9DB` / `#595959`. VFA-44: Primary `#005774`, Secondary `#F4EFDC`, Accent `#64748B`, Neutral `#F8FAFC` / `#1E293B`.

## Design tokens
See `tokens.css`. Summary:
- **Type:** Saira (UI) 400/500/600/700; IBM Plex Mono (data) 400/500/600/700.
- **Type scale (px):** pane title 12/600, uppercase, letter-spacing .14em, `--rr-text2` · body 13–13.5 · row primary 13.5/600 · page title 15–17/600 · dialog title 16/700 · mono labels 9.5–10, letter-spacing .12–.16em · stat numerals 22–26/700.
- **Spacing:** 4-based. Page gutter 14px, pane padding 12–16px, row padding 7–11px vertical, gaps 6/8/10/12/14.
- **Radii:** 4 (chips) · 6 (buttons, inputs, strips) · 7–8 (controls) · 10 (panes) · 12 (dialogs).
- **Motion:** 120–260ms. Selection indicators use `cubic-bezier(.34,1.4,.5,1)` (slight overshoot); colour and background use `ease`.

## Shell
- **Context strip** (52px, `--rr-panel`, bottom border): `SECTION / Page title · meta` in an accent mono code, a "Discord synced" status pill, presence avatars, and a LIGHT/DARK segmented control.
- **Navigation is a per-user preference** (stored in Settings) with three options:
  1. **Labeled Rail:** 230px, grouped (Overview / Flight Ops / Squadron / Records / Admin), 28px icon tiles, active row gets `--rr-accent-weak` plus a 3px accent left border.
  2. **Compact Rail:** 70px, 42px icon tiles only, title tooltip.
  3. **Command Bar:** 56px top bar, uppercase 12.5/600 labels, 2px accent underline.
- Squadron insignia and the "READY**ROOM**" wordmark sit at the top of each nav variant.

## Pages
Open each page in the prototype for exact layout. Notes below cover structure and behaviour.

### Home (new)
A dashboard that launches into other areas. Rows: **Next Event** card (title, time, cycle, description, RSVP Accept/Tentative/Decline that syncs to Discord) + **Last Mission** card (result badge, A2A/A2G/Losses/Traps stat tiles, "Open debrief"). Then **Pending Tasks**, a list of PTR/AAR/RSVP/QUAL items that deep-link to the relevant page, with due dates coloured by urgency. Polls and the changelog sit at the bottom and are secondary.

### Mission Prep
Tabs, in workflow order: **Mission Details** (merged with objectives) → **Flight Assignments** → **Mission Support** → **Communications**.
- **Details:** event, mission brief, timing grid, weather, bullseye, mission commander, and the objectives list scoped Mission / Flight / Element / Individual.
- **Flight Assignments:** Available Pilots pane (status dot, squadron-coloured board number, full qualification badges; Auto-Assign, settings and Clear buttons) beside **one column per participating squadron** (insignia in the header). Each flight card shows callsign, airframe, tasking chip, priority signal-bars + P1–P3, and step time. Below that is a **finger-four layout**: lead in front, −2 and −3 one step back, −4 two steps back. Each 62px aircraft tile shows MIDS A (top-left) and MIDS B (top-right) as bare numbers, the aircraft icon tinted to squadron colour, the board number in squadron colour, and the callsign. Tiles support click-to-select (accent ring) as well as drag.
- **MIDS rules:** MIDS B is one channel per flight (inter-flight). MIDS A is one channel per two-ship section. There is no NET field.
- **Communications:** a channel table with **channels 1–20 in the centre column, PRI presets to the left, AUX presets to the right** (AUX is a placeholder until the backend supports it). Columns per side are Name, Freq, TACAN, ILS, KY. **KY shows the cypher number (1–6) in green**; unencrypted is "—". The presets are agencies and common frequencies (Wing Common, Big Voice, carrier Air Ops/Paddles, JTACs, tankers), not flights. A MIDS panel lists each flight's B channel and each section's A channel. Includes an Export Kneeboards action and the toolbar icon-button group (copy, save template, edit, load template, reset).

### Roster
Squadron-grouped table with sticky group headers (insignia, count, group select-all). Rows have a checkbox, board #, callsign, status chip, billet, qualification badges and an edit icon. **Sortable** Board, Callsign and Status headers (accent caret). **Filter drawer** slides in from the right (340px) and uses visual facets: squadron insignia toggles, status pills, qualification chips; a count badge shows on the FILTERS button. A **bulk action bar** appears when rows are selected (Set Status / Standing / Squadron, + Qualification, Clear). The **Pilot Detail** side pane has Edit and Open Dossier. The **Add/Edit Pilot dialog** (660px) has board/callsign/Discord fields, then segmented Squadron / Status / Standing / Billet pickers, then qualification and team chips.

### Events (matches `feature/cycles-activities`)
- **Left pane:** a pinned "Standalone Events" entry, then cycles grouped Active / Upcoming / Completed, then the selected cycle's events grouped This Week / Upcoming / Previous.
- **Main pane tabs:** Cycle Builder · Event Details · Attendance.
- **Cycle Builder** (Cycle → Activity → Event): a Gantt with **participant-group rows** (insignia + criteria pills) × **week columns** (122px). Activity bars span weeks and are tinted by kind: syllabus = info, qualification = accent, objectives/exercise = good. Each bar is split into per-week cells naming the event it generates; empty weeks are dashed.
- **Event Details:** Discord publish status, Send Reminder Now, Edit; a meta grid (date/time, local time, duration, cycle, linked mission, creator); **Activities at this event** with objective scope (Individual / Element / Flight / Mission); **Mission Support roles**, reorderable, showing filled/required (0 = optional); **Notifications** (Initial, First, Second reminder, each with timing and recipient RSVP statuses); and Reference Materials.
- **Attendance:** accepted pilots **grouped by the activity they are doing at this event**, plus a Mission Support column with role labels. Columns are at least 170px wide and scroll horizontally.

### Training
Tabs: Pilot Training Records · Syllabus Management.
- **PTR grid:** sticky student column and sticky attendance column; one column per lesson. Grade cells are 26px: · not started, P in progress (warn), C complete (good), S signed off (accent). **Under each graded cell is a 20×3px roll-call attendance bar:** green = present, red = absent (no make-up), amber = make-up flight. Hovering a column header or a cell shows lesson or entry detail (grade, date, IP, attendance) in a footer info bar.
- **Syllabus Management:** cards grouped by kind (Linear, Advanced Qual, Module, Pool).

### Pilot Dossier
Three columns: details (insignia, fields, qualifications with dates, teams) · scope segmented control (Career/Cycle/Event) + 6-tile stats + Trap Sheet / Attendance / Kills tabs + awards · career timeline.

### Coordination (full-screen)
Opens **full-screen with minimal chrome**: Exit, title, LIVE indicator, light/dark toggle, → Debrief. It is a **4-column ATC-style strip board**: Launch (with an **Inactive drawer** inside it) · En Route/Tasking · Recovery · Tanker. Each column is split into horizontal divisions with **the label on the left** and strips on the right. Strips **stack bottom-up**, like a physical strip board. Every division is tall enough for at least one 4-ship strip. Strips move between divisions by drag, or by click-to-select then click-a-division.
- **Recovery** has a compact **I / II / III toggle in the column header row** (no extra row). **Case I:** INBOUND, ANGELS 6 down to 2, SPIN, CHARLIE, BOLTER. **Case II/III:** INBOUND, marshal stack ANGELS 17 down to 6 (each label shows ANGELS large, DME = angels + 15, EAT in warn colour), then SPIN, COMMENCE, PLATFORM, BOLTER.
- **Strip design = D02.1** (see `Recovery Explorations.dc.html`). Background `--rr-panel3` (lighter than the board), border `--rr-border2`, radius 6, 4px squadron colour bar on the left, squadron insignia in greyscale at low opacity filling the callsign block.
  - **Header line:** callsign 13/700 · "N× AIRFRAME" in `--rr-text2` · right-aligned `BRA bearing/range/angels` (e.g. 270/32/17; ellipsis if it doesn't fit).
  - **Member line:** compact, **left-aligned** chips with a 4px gap and padding from the strip edge. Each chip has a `--rr-panel2` background, a 1.5px `--rr-border` border and 4px radius, and shows board # and fuel (mono), with fuel coloured good ≥5.0, warn 4.0–4.9, bad <4.0.
  - **Exactly one aircraft per strip is boxed:** the flight's **low state** (lowest fuel). Its chip border uses its fuel colour and its fuel figure is bold. Single-ship strips box their only aircraft.
  - The greyscale insignia backdrop is limited to the left ~96px (callsign area) so it never sits behind the BRA readout.
  - **Division labels** (64px, `--rr-panel2`): the angels number large (20/700), with DME and the EAT (in warn colour) stacked below in Case II/III.
  - The same strip is used on desktop and mobile.

### Debrief, Reports, Settings
Built in the prototype; follow it for layout. Settings holds the per-user nav-layout preference, theme, and squadron branding (the five-colour palette per squadron).

## UI Kit (base components to build first)
Every component below is live and interactive on the prototype's **UI Kit** page:
- Buttons (primary, secondary, ghost, danger; press scales to .93)
- Icon buttons 28px (filled, outline, ghost, danger)
- **Toolbar icon-button group** (30px buttons in a `--rr-panel2` tray)
- Search input with caret
- Select/dropdown (animated chevron, popover list)
- **Popover menu** (icon + label rows; destructive item in `--rr-bad`)
- **Toast** (left colour border, icon, dismiss)
- Status chips and qualification badges (colour map in the prototype's `mkQual()` / `statusStyle()`)
- Segmented control with sliding thumb
- Tabs with sliding underline
- Toggle switch
- **Stepper/wizard**
- Checkbox and radio
- Tooltip
- **Dialog** (overlay rgba(0,0,0,.55), 12px radius, header/body/footer)
- **Filter drawer**
- Empty state (greyscale masked aircraft icon, never an emoji)
- Number stepper and textarea
- **Accordion**
- Progress bar
- Avatar stack and count badge
- Stat tile
- Pilot row
- Aircraft tile
- Table with bulk select and sortable headers

## Responsive
Below 760px:
- The rail and command bar hide and a **scrollable bottom nav bar** appears.
- The context strip compacts.
- Tab bars scroll horizontally.
- Multi-pane rows stack vertically and the page scrolls.
- The Coordination board becomes **swipe-between-columns** (scroll-snap).
- Wide tables scroll horizontally with their headers.

## Assets
- `uploads/Aircraft Icon.png`: top-down F/A-18 silhouette. Use it as a **CSS mask** so it takes `currentColor` or a squadron colour.
- `uploads/VFA-161-4c608a9b.png` and `uploads/VFA-44-4c020ee5.png`: current squadron insignia. At runtime these come from squadron config.
- `uploads/CVW-14 Logo.png`: air wing.

## Suggested implementation order
1. Tokens (`index.css` + `tailwind.config`) and the theme provider. Delete the default Vite `App.css` and favicon.
2. Base UI Kit components (`src/components/ui/primitives/*`).
3. Shell: nav preference, context strip, mobile bottom nav.
4. Pages, highest traffic first: Mission Prep → Roster → Events → Training → Home → Dossier → Coordination → Debrief/Reports/Settings.
5. Delete the four legacy style modules once nothing imports them.

## Design governance
**The ReadyRoom Claude Design project is the authority for design.** If implementation exposes a design gap (a missing component, an unclear state, a layout that doesn't fit real data):
- Small, obvious gaps can be resolved in code if they use existing tokens and base components. Log each one in `design_handoff_readyroom/DECISIONS.md` (date, page, what was decided).
- Anything that adds a new pattern, colour, or component, or changes a layout, should go back to the design project. Update the mockup there and re-export this folder, so the design file stays the single reference.

## Files
- `ReadyRoom.dc.html`: full app prototype (all pages, UI Kit, dialogs, drawers, mobile).
- `Recovery Explorations.dc.html`: strip explorations. The final design is D02.1 with the refinements above; **`ReadyRoom.dc.html` → Coordination is the source of truth for the strip.**
- `tokens.css`: design tokens.
- `uploads/`: assets.
- Source mapping: see `github.md` in the design project (Events → `src/components/ui/events/*` on `feature/cycles-activities`; Mission Prep → `src/components/ui/MissionPreparation.tsx` + `mission prep/*`; Roster → `src/components/ui/roster/*`).
