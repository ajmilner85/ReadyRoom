# CATCC & PriFly: build handoff

This package hands the CATCC & PriFly mockup over for implementation. The mockup is a set of interactive design files built in a Claude Design canvas. It shows the intended look and behaviour, and its scripts already contain working geometry for departures, arrivals, holds, turns and EAT estimates. Treat the mockup as the **behavioural spec**, and this document as the **written spec**. Where they disagree, this document wins, because it records decisions made after some mockup details were drawn.

Contents:

```
HANDOFF.md                 this file
mockup/Main.dc.html        CATCC radar (the main focus; ~1,750 lines)
mockup/Comms.dc.html       Comms scripts dialog
mockup/LSO.dc.html         PriFly: LSO station (arrivals board, pattern view, grading)
mockup/Boss.dc.html        PriFly: Air Boss deck view and events
mockup/canvas.json         canvas index (artboard sizes and titles only)
```

Not included, and needed:
- **CV NATOPS (NAVAIR 00-80T-105, JUL 2009).** The user has the PDF. The geometry below cites its sections. Ask for it before touching procedure logic.
- **ReadyRoom app source.** CATCC is meant to live inside, or alongside, the squadron's ReadyRoom web app, share its styling, and later read its comms plan and flight assignments. The flight strips must match the ReadyRoom **"D02.1 Chips refined"** component from its Website Redesign project. The mockup's strips were rebuilt from a screenshot of it (see §9.1); match the real component once you have the source.

---

## 1. Reading the mockup files

Each `.dc.html` file is one screen:
- **Markup:** the `<x-dc>` element holds HTML/SVG templates. `{{a.b}}` holes are lookups into `renderVals()`, `<sc-for list as>` repeats and `<sc-if value>` branches.
- **Logic:** the `<script type="text/x-dc">` block defines `class Component extends DCLogic`, with `this.state`, `this.setState` and `renderVals()`.

Treat the format as a prototype, not a framework to port. Lift the **logic** and re-implement the **UI** in the real app's stack.

Where the logic in `Main.dc.html` lives:

| Method | What it holds |
|---|---|
| `frame(asp, W, cx, cy, bw)` | View box, lat/lon frame ticks and labels, the symbol-scale factor `z` |
| `radials(s, ZK)` | Departure radials, marshal stacks, holds, arrival paths, placement rules, hooked-aircraft tools (marshal assignment and vector helper). Contains `depPath`, `arrival`, `holdOf`, `rHold`, `fixOf`, `fly`, `assign`, `hitStack` |
| `renderVals()` | View and zoom state, zoom fits, anchors for constant-size symbols, edge indicators, formation model, flight strips, layers, settings, notifications, event handlers (wheel, pan, click) |

The scenario data (tracks, tags, trails, conflict pair, CVN-71 traffic) is hard-coded SVG in the markup. None of it is live.

---

## 2. Target architecture (proposal; confirm with the user)

**Stack.** ReadyRoom's stack. Earlier squadron work used React + TypeScript, and dnd-kit for draggable flight cards. Confirm before starting.

**Data in.**
- **Phase 1:** read-only feeds from a DCS dedicated server, either the LotATC export or TacView real-time telemetry. Each provides tracks (position, altitude, heading, groundspeed, type, side/board number, coalition), ship positions and headings, and weather and time.
- **Phase 2:** our own export scripts, à la DCS Olympus, to control units: carrier waypoints and BRC, launching a recovery tanker to rendezvous with a low-state aircraft, and so on. Plan the data layer so commands can be added later.

**Multi-user.** Positions can be claimed (§10): Departure, Marshal, Approach, Final. Any number of view-only clients can watch. State that must be shared goes in a server-side room, not the browser:
- seat claims;
- marshal assignments and EATs;
- radials and stacks;
- acknowledged alerts;
- flight strips.

**Multi-monitor.** Each module (Radar, LSO, Boss, Comms, Reference) opens in its own window or device, all bound to the same room. This is the "Displays" button.

**Rendering.** The radar scope has three stacked layers:
1. **Background:** lat/lon frame and grid, range rings and compass, CCAs.
2. **Overlays:** coordination line, BRC/FB, bolter, helo restrictions, CV approaches, tanker, departure radials, marshal stacks, arrival paths, other-carrier copies, BRA ruler, conflict projections.
3. **HTML label layer, then the traffic layer:** radial flags and edge indicators are HTML. Above them sit trails, vectors, ships, hits, tags, CPA label, hooked-aircraft tools and helper tags.

The mockup uses SVG throughout. That's fine for overlays. For live traffic at scale, consider Canvas/WebGL, keeping the screen-constant symbology rules in §3.3.

---

## 3. Coordinates, view and zoom

### 3.1 Scope coordinates
- **Units and origin:** nautical miles, centred on the focus carrier. SVG +x is east and +y is south (north is −y).
- **Bearing and range to a point:** `P(b, r) = [r·sin b, −r·cos b]`, with `b` in degrees true.
- **Lat/lon:** the mockup uses a flat local tangent plane. Ship at 26°12'N 056°48'E; 1' lat = 1 NM; 1' lon = cos(lat) NM ≈ 0.8975. Production should use a proper local projection, such as azimuthal equidistant about the focus carrier, updated as the ship moves.

### 3.2 View
- **View box:** `W` NM wide, centred on (cx, cy). Height is `W × aspect`, where aspect is the panel height/width from a ResizeObserver.
- **Zoom fits:**
  - **50NM:** a 50 NM radius around the carrier. This is the default and opens selected.
  - **CCA:** CCA + 20 NM.
  - **DEP:** fits the carrier and every departure radial out to 50 NM.
  - **APP:** fits the carrier, bolter pattern and every marshal stack.
- **A fit stays live while selected.** It is recomputed every render, so it follows added or moved radials and stacks. Any manual pan or zoom deselects it.
- **Zoom controls:** the wheel zooms about the cursor (×1.15 per notch), and there are buttons for zoom in/out plus an RNG readout.
- **Pan:** left-click and drag. A drag over 3 px swallows the click that follows. The view centre is clamped to **100 NM** from the focus carrier, for both pan and zoom-about-cursor.

### 3.3 Screen-constant symbology (important)
Symbols, text and tags keep a **constant screen size** at any zoom and any panel width. Geography (rings, routes, holds, turn radii, velocity vectors, trail spacing) scales with zoom.

- **Scale factor:** `z = (W / 97) × (860 / panelWidthPx)`. That is NM per "reference pixel", tuned so a 97 NM view in an 860 px panel is 1:1.
  - The mockup first scaled with `W` only, so symbols grew when the browser got wider. The user rejected that, so the panel width is now in the formula.
- **Each symbol or tag group** is drawn in NM and wrapped in `translate(a) scale(z × userScale) translate(−a)` about its anchor `a`, which is the hit position.
- **Every stroke uses `vector-effect: non-scaling-stroke`.** Dash arrays are therefore in screen px.
- **Text outside those groups** uses `font-size: calc(base × var(--z))`.
- **Anchor every hit on its own position.** Never scale two hits about a shared midpoint: that bug moved 101/102 as you zoomed.

Reference sizes in z-units (× the user scale from §8):

| Element | Size |
|---|---|
| Hit square | 0.8 |
| Trail dot | 0.32 |
| Tanker circle radius | 0.45 |
| Tag text | 0.9 (line pitch 1.0) |
| Other scope text | 0.8 |
| Lat/lon labels | 0.72 |
| Fix hash half-length | 0.55 |

### 3.4 Off-scope indicators
- **When one shows:** for any hit within **CCA + 10 NM (60 NM)** of the focus carrier that is outside the view.
- **Shape and placement:** a filled triangle about the size of a hit, on the scope edge, inset 24 px. It sits where the ray from the view centre to the contact crosses the edge, and points at the contact. It uses the track colour.
- **Conflict aircraft:** the triangle gets the same blinking red ring as on-scope conflict hits.
- **CPA tag:** if the CPA point is off-scope, the CPA tag is pinned inside the edge in the CPA's direction, clear of corners and lat/lon labels.

---

## 4. Colour and type

ReadyRoom styling, dark only.

| Token | Value |
|---|---|
| Background | `#0E1116`; scope `#0B0E12` |
| Panels | `#151A21` / `#1A212A` / `#222C37` |
| Borders | `#262F3A` / `#374250` |
| Text / secondary text | `#E6EDF3` / `#93A1B0` |
| Accent (VFA-161 orange) | `#F15822` |
| Fonts | Saira (UI), IBM Plex Mono (data) |
| Own tracks | green: hit `#5FD068`, trail `#3E9A4C` (a "White" option exists: `#E6EDF3` / `#93A1B0`) |
| Conflict | red: hit/tag `#FF8A85`, outline and rings `#E0524E`, trail `#B8433F` |
| Other carrier (everything belonging to it) | blue `#3E9BD4` / `#6FB6E6` / `#5AAEE3` |
| Hooked-aircraft tools | **magenta `#E45BEA`**, tag text `#F2B3F5` |
| Warnings / low fuel | amber `#E7B04F` |
| Range rings / compass | faint green `rgba(64,168,91,.22)` |

Two hard rules:
- **Orange and red are reserved for conflict alerts.**
- **Anything belonging to the other carrier is always blue.**

---

## 5. Scope content

### 5.1 Ship symbols
- **Outline:** the carrier is an 11-vertex outline traced from the user's reference, with the origin on the landing-area centreline.
- **FB and BRC lines:** the final-bearing line runs down the angled deck. The BRC line starts at the bow midpoint.
- **CVN-71:** the same outline in blue.

### 5.2 Tracks
- **Hit:** a square with a 1 px, 50% black border. Exceptions: the S-3 tanker is a solid circle and the H-60 is a diamond.
- **Trails:** always on. Five square dots at decreasing opacity (.8, .6, .45, .3, .2).
- **Velocity vector:** 30 s of travel, capped at 2.5 NM, 1.8 px wide.
- **Conflict pair:** hits, vectors, trails and tags are red, with a blinking ring around each hit.

### 5.3 Data tags
- **Rows:** Row 1 is side, type and fuel (`106 F18E 7.4`). Row 2 is altitude and speed in hundreds of feet and knots, with a ↑/↓ climb or descent arrow **left of** the altitude (`↓168 420`). Row 3 is an optional remark (`RMK ICLS ONLY`). The remark row uses the tag colour too.
- **Leader:** solid, at 45° on an intercardinal (NE/SE/SW/NW). It starts 0.7 NM from the hit and ends 2.4 NM out (in z-units).
- **Tag position:** an east-side tag starts at the leader end, and a west-side tag ends there. The first row is centred vertically on the leader end.
- **Box:** semi-transparent dark background `rgba(11,14,18,.72)`. The conflict pair's tags get a red outline.
- **Placement:** fixed per track in the mockup. Automatic tag placement to avoid overlaps is backlog.

### 5.4 Conflict detection (CPA)
- **Calculation:** project each pair along its own heading and groundspeed, and solve for the closest point of approach.
- **Display:**
  - dashed projection lines along each track to CPA + 10 s;
  - a solid segment between the two CPA positions, with dots;
  - a CPA tag `CPA 1.4 NM / 700 FT · 1:04` (separation, vertical separation, time to CPA) in a dark box with a red border;
  - a notification card (§9.3).
- **Standards** (CV NATOPS §4.3, §6.4.1.7):
  - **Lateral:** 5 NM beyond 50 NM; 3 NM inside 50 NM; 2 NM on approach inside 12 NM; 1.5 NM on final inside 5 NM.
  - **Vertical:** 1,000 ft. In marshal, 1,000 ft, reducible to 800 ft inside 12 NM; helos 500 ft.
- **Alerts:** raise when a pair is predicted to lose **both** lateral and vertical separation within a look-ahead window. The mockup doesn't fix one; suggest 2 minutes, configurable.
- **Deconfliction advice:** the original brief asked for a recommended instruction with each alert. The user later removed the recommendation text from the UI. Keep the logic in the backlog, but don't show it unless asked.

### 5.5 Formations
At these ranges a 4-ship in finger-four cruise or echelon is a single blob of hits. Real systems carry one data block for the flight on the lead until it's split, so:
- **Collapsed by default:** only the lead's hit shows, with a dashed box around it. The tag reads `401 F18C 6.2 / 200 350 / FLT ×4 · LOW 5.9`.
- **Hover:** shows a dashed ring around the formation.
- **Wheel over the formation** cycles: flight (collapsed) → member 1 → 2 → 3 → 4 → flight. Each member state shows every member's hit, boxes the selected one, and shows its own tag (`VOLT 3-2 · 2/4`).
- **Click** toggles between collapsed and member 1.
- **Production grouping:** derive formations from proximity plus matching heading, speed and altitude, or from the mission's group data when the feed provides it. Choose the lead from the group's lead unit. Fall back to the front-most aircraft. Allow manual split and join.

### 5.6 Hooked aircraft (click a hit to hook it)
- **Hook box:** magenta square around the hit. In the mockup only 106 can be hooked. Make every track hookable.
- **Marshal assignment.** While hooked, move the cursor over any marshal stack except the helo stack, including the emergency stack.
  - **Route:** a magenta route from the aircraft's current heading to the stack's DME fix.
    - It turns at a 30° bank radius for its current speed: `R(ft) = V² / (11.26 × tan 30°)`, so about 4.5 NM at 420 kt.
    - It then flies straight to the fix, along the shortest turn direction.
  - **Wheel changes the level:** from the stack base up 12 levels. The fix is at **angels + 15 DME**.
    - Ticks on the radial mark every level's fix, and the selected one is highlighted.
    - The selected level's holding pattern is drawn in magenta.
  - **Tag:** `106 → A9 · 24 DME / ANGELS 9 · FIX 18:21:03 / EAT 18:22 · 420 KT`.
  - **EAT:** the fix time from the route length at current groundspeed, rounded up to the next minute. It is also kept at least 1 minute after the previous EAT in that stack.
  - **Click to assign:** the aircraft is unhooked. A dimmer magenta route and the label `106 · A9 · EAT 18:22` stay on the scope, and the stack's levels table shows the assignment.
  - **Original brief:** the EAT estimate should account for the manoeuvring needed to arrive at the fix **on the inbound course**. The mockup ends the route at the fix without a hold entry; add the entry (direct, parallel or teardrop) and the inbound alignment.
- **Vector helper.** While hooked, with the cursor anywhere else, a dashed magenta path is drawn from the aircraft to the cursor, using the same turn model. The tag shows:
  - `BRG 142 · RNG 25.8`: bearing and straight-line range;
  - `HDG 145 · TRK DIST 26.1`: heading after the turn, and distance along the path;
  - `ETE 3:44 · 420 KT`.

  The wheel adjusts speed in 10 kt steps from 150 to 650 kt, and the turn radius and times update.
- **Wheel priority:** formation cycling, then hooked-aircraft level or speed, then zoom. Zoom buttons still work while hooked.

---

## 6. Procedures and geometry (CV NATOPS)

All of this is implemented in `radials()` and was tested in node across many radials. Port it as a pure, unit-tested geometry module.

**Scenario constants.** These become live data in production.
- **Ships:** CVN-73 at BRC 345, FB 336 (angled deck 9° left). CVN-71 at (37.09, −14.98) NM, BRC 020.
- **Time:** local UTC+4, 18:12:30, Case III, night.

### 6.1 Departure radials (§5.13)
- **Separation rule:** departure radials are ≥ 20° apart in IMC, and clear of radials reserved for holding.
- **Jet path** (`depPath`, ported from the squadron's Case III departure animation):
  - Climb out on the BRC.
  - Turn at 7 NM, with R = 3 NM, onto the **10 NM arc**.
  - Fly the arc, then lead-turn onto the radial and run out to the CCA edge.
- **Radials too close to the BRC for the arc:** fly an S-turn. Search the intercept angle from 45° downward so the second turn rolls out on the radial.
- **Output:** a sampled polyline.
- **Flags:** each departure radial gets a flag labelled `DR 285` at **35 DME**, pointing outbound.

### 6.2 Marshal stacks (§6.4.1)
- **CV-1 marshal:** 180° relative to the expected FB by default, but a stack can be placed on any radial within the rules below.
  - Fix at **angels + 15 DME**; base ≥ angels 6.
  - Left-hand 6-minute racetrack with the inbound leg over the fix.
  - Each 1,000 ft up adds 1 NM.
- **Emergency marshal:** 150° relative to the FB, right-hand pattern.
- **Helo marshal:** 110° relative to the FB, starting at 5 NM / 1,000 ft and stepping 1 NM per 500 ft, right-hand pattern with 2 NM legs.
- **Hold drawing:** 250 KIAS, 1-minute legs (4.2 NM) and 2-minute turns (R 2.65 NM, 5.3 NM wide). Only the lowest level is drawn, plus a hash mark at each stack's fix.
- **Flags:** marshal flags sit on the inbound holding leg, pointing inbound, labelled e.g. `A 145`.
- **Bow-on recovery caution (§6.4.1.9):** warn when a stack is within 90° of the BRC.

### 6.3 Arrival path (§6.4.7.3; `arrival(m)`)
1. Inbound on the marshal radial.
2. **At 20 DME, turn toward the FB:**
   - if the radial is within 10° of the FB reciprocal, make a gradual turn (2 × the offset);
   - otherwise make a 30° turn.
3. **Join the FB**, with a 1.5 NM turn radius at each turn:
   - **Normal intercept:** used when the 30° leg reaches the FB astern of the ship before the 12 DME circle.
   - **12 DME arc:** used when the 30° leg reaches the 12 DME circle first. Fly the leg to 12 DME, take the arc the correct way round, then turn onto the FB with a fillet tangent to both.
   - **Short arc:** if less than 20° of arc would remain, intercept directly instead.
4. Down the FB to the ship.

The ordering checks matter. Early versions accepted the FB line ahead of the ship, and overshot on tiny arcs.

### 6.4 Radials manager rules (current, and known to be incomplete)

| Check | Result | Basis |
|---|---|---|
| Stack within 20° of a departure radial | Blocked | Borrowed from §5.13.1 |
| Stack within **10°** of another stack | Blocked | **Invented. NATOPS has no such rule.** |
| Stack within 90° of the BRC | Warning (bow-on) | §6.4.1.9 |
| Departure radial within 20° of another departure radial or a reserved holding radial | Blocked | §5.13.1 |

**Known problem (the user deferred it; do not ship as is).** Stacks are checked by angle only.
- A 10° wedge at 21 NM is only ~3.7 NM across, but a hold is 5.3 NM wide to one side, so overlapping holds pass.
- Hold size uses indicated airspeed; true airspeed at altitude, and wind, make the real pattern 10–20% larger.
- Only the lowest level is drawn, while a 6-level stack runs from 21 to 26 DME, with its outer leg near 30 NM.
- NATOPS separates stacks by **1,000 ft vertical**, or **3 NM radar lateral inside 50 NM**. It gives no angular minimum.

**Proposed replacement:**
1. Model each stack's protected airspace: the holds at every occupied level, sized for true airspeed at that altitude, plus a 3 NM buffer.
2. Give each stack an altitude band from its base to its top level, plus 1,000 ft.
3. Block only where both the footprint **and** the altitude band overlap.
4. Draw the full stack footprint faintly behind the lowest hold.
5. Test departure radials against the footprints instead of the 20° wedge.

### 6.5 Other overlays
- **CCA:** 50 NM, dashed, own carrier in green. The other carrier's CCA is blue and **always shown**.
- **Coordination line:** joins the two CCA intersections, with a pill label `COORD · CVN-73 │ CVN-71` that keeps a constant size.
- **BRC:** subtle chevron. **FB:** line with 3/6/10 NM distance ticks.
- **Bolter pattern:** turn-ins at 4, 6 and 8 NM.
- **Recovery tanker:** a 250 kt holding racetrack aligned with the BRC.
- **Helo restrictions:** per CV NATOPS Fig 4-3, relative to the BRC.
- **CV-1/2/3 approach overlays:** per Figs 6-3, 6-4 and 6-5.
- **Range rings and compass:** 10–40 NM in faint green, with "NM" in the labels.
- **Lat/lon:** marks on all four edges, filling the view. The grid is a separate layer, off by default.
- **Other carrier:** its overlays are drawn with **its own geometry, in blue.** The mockup cheats by rotating CVN-73's ship-relative layout 35° onto CVN-71 and leaves out text labels. Production should draw each carrier's real radials, stacks and paths, with their labels.

---

## 7. Layers panel

Opened from the toolbar Layers button. Two checkbox columns, **CVN-73 | CVN-71**, grouped as below. Coordination lines and the lat/lon layers are not carrier-specific, so they have only the first checkbox. "All on / All off" switches both columns.

| Group | Layer | CVN-73 default | CVN-71 default |
|---|---|---|---|
| Ship | BRC | on | on |
| | Final bearing | on | on |
| Airspace | CCA 50 NM | on | always shown, no checkbox |
| | Coordination lines | on | — |
| | Helo restrictions | off | off |
| Departure | Departure radials | on | on |
| Approach | Marshal stacks | on | on |
| | Arrival paths | on | on |
| | CV-1 approach | off | off |
| | CV-2 approach | off | off |
| | CV-3 approach (helo) | off | off |
| Recovery | Bolter pattern | off | off |
| | Tanker pattern | on | off |
| Reference | Range rings / compass | on | off |
| | Lat / lon marks | on | — |
| | Lat / lon grid | off | — |

The hooked aircraft's EAT estimate is **not** a layer. It shows only while an aircraft is hooked and a stack is hovered.

---

## 8. Display settings

Opened from the sliders button in the top bar. There are four 5-step sliders. Each has a live preview beside it. **Nothing changes on the scope until Apply.** Cancel throws the changes away, and Reset puts every slider back to step 2.

| Slider | Steps | Default | Covers |
|---|---|---|---|
| Radar hits | ×1.15, 1.3, 1.45, 1.6, 1.8 | step 2 | hits, trails, ship symbols, formation boxes, edge triangles |
| Data tags | ×1.15, 1.3, 1.45, 1.6, 1.8 | step 2 | aircraft tags and leaders; CPA, hook and vector helper tags; coordination pill |
| Line weight | ×1.15, 1.5, 1.9, 2.4, 3.0 | step 2 | **overlays only** (see below) |
| Other scope text | ×1.15, 1.3, 1.45, 1.6, 1.8 | step 2 | range and lat/lon labels, BRC/FB, bolter numbers, radial flags, small fixed markers |

- **Minimum size:** ×1.15, slightly larger than the mockup's original sizes. That is the user's stated minimum.
- **Line weight:** the steps are spread wider because stroke steps of 0.15 px were invisible. It applies to overlays: rings, CCA, coordination line, routes and paths, holds, bolter, tanker, helo, CV marks, grid and the BRA ruler. It does **not** apply to tag outlines, hit borders, vectors, trails, ships, conflict projections or the magenta tool lines.
- **Flag text:** radial flags use the same type size as the other scope text. They were about 50% larger, and the user rejected that.
- **Helper tags:** HTML tags (hook, vector, CPA) use the same base size as the SVG data tags.
- **Saving:** settings aren't persisted in the mockup. Persist them per user.

---

## 9. Sidebars

Both sidebars are a **fixed 344 px** and the same width.

### 9.1 Left sidebar: tabs "Info" and "Strips"
- **Info tab:**
  - **Ship:** CVN-73 large, then "GEORGE WASHINGTON · WARFIGHTER", DECK CLEAR, BRC/FB/speed, wind over deck, winds down the angle, true wind, next PIM turn.
  - **Weather (no title):** visibility, ceiling and altimeter large, in METAR order; then clouds, temp/dew, and winds at 2K/10K.
  - **Light / Case:** a sun-elevation curve from noon to noon with day, civil, nautical and astronomical bands, sunset and sunrise, moonrise, a NOW marker, and the Case III window (sunset + 30 to sunrise − 30). Below it: "NIGHT / CASE III · SUN −10.3°" and "DAY OPS IN 11:44".
- **Strips tab:** flights under our control, grouped Departure, Inbound, Marshal, Approach and Support, each heading with a count. The tab label shows "8 · 13" (flights · aircraft). Each strip has:
  - **Row 1:** callsign in bold (`VOLT 3`), count and type in grey (`4× F/A-18C`), and on the right `BRA 210/38/20`, the lead's bearing, range and angels from the focus carrier.
  - **Row 2:** up to four members as `board fuel`. Fuel is green ≥ 5.0, amber 4.0–4.9 and red < 4.0. The **lowest state** in the flight gets a box in its fuel colour.
  - **Left edge:** a 3 px accent for squadron or ownership: orange for own squadron, blue for others. *Assumption: confirm the meaning against D02.1.*
  - **Conflict:** a red border while in conflict. **Selected:** lighter background.
  - **Click:** selects the strip and hooks its aircraft.
  - **Later:** drag and drop between phases, as on the ReadyRoom Coordination page; strips driven from the mission's flight assignments; a full Coordination tab.

### 9.2 Right sidebar
- **Radials panel:** departure radials and marshal stacks as unified rows, e.g. `DR 285`, `Stack A 145R A6+`, `Emergency 126R`, `Helo 086R`.
  - **Clicking a row** highlights it on the scope. The pencil icon edits it, and × removes it.
  - **Editing** expands the row with a second line (Base −/+ for stacks, a live rule status, Cancel) and arms on-scope placement.
  - **On-scope placement:** blocked sectors show as wedges. A green, amber or red candidate preview of the whole stack (hold, fix and arrival) or departure path follows the cursor at 5° steps. The original is dimmed while being moved.
  - **"Add" / "Add stack"** arm placement for a new item.
  - **Stack rows** have an expand arrow that opens the levels table: angels, DME, EAT, aircraft and state. A proposed or assigned slot shows in magenta.
- **Notifications:** compact cards with a kind, a time and a one-line title. Kinds are CONFLICT (with the CPA line), LOW STATE, LATE PUSH, COORD LINE and BRC CHANGE. Each card has a go-to icon (centres the scope) and an Ack button.

### 9.3 Scope chrome
- **Top-left:** Frequencies popover, behind a mast-and-waves radio icon.
  - **COM**, with PRI and AUX channel columns. A channel shows only when the frequency is assigned one in the comms plan.
  - **NAV**, with no channel columns.
  - Sample data:

| Section | Name | Frequency | PRI | AUX |
|---|---|---|---|---|
| COM | Strike | 262.000 | 2 | — |
| COM | Departure | 252.000 | 8 | — |
| COM | Marshal | 252.000 | 8 | — |
| COM | Approach | 252.000 | 8 | — |
| COM | Tower | 252.000 | 8 | — |
| COM | Paddles | 256.750 | — | — |
| NAV | TACAN | 73X | | |
| NAV | ICLS | CH 13 | | |
| NAV | Link 4 · ACLS | 373.000 | | |

  - **Comms plan:** later, read from the ReadyRoom Mission Prep → Communications plan, which has PRI/AUX channels, TACAN, ILS and KY.
  - **Mismatches to raise with the user:** the plan's Paddles is 265.750 on channel 9, not 256.750. The plan's carrier TACAN/ICLS (72X/12) doesn't match CVN-73 here (73X/13).
- **Top-centre:** a floating toolbar. Tools: select/hook, BRA ruler, marshal, CPA probe and vector. Then Layers, a Comms link, zoom out / RNG / zoom in, and the 50NM / CCA / DEP / APP fit buttons.
- **Bottom:** a 10 NM scale bar, and a cursor readout (bearing, range, lat/lon).
- **Removed:** the old "Approach seq." strip under the scope. Don't bring it back.

---

## 10. Top bar
- **Module navigation:** Radar, PriFly · LSO, PriFly · Boss.
- **Ship select:** CVN-73 Warfighter / CVN-71 Rough Rider. This sets the focus carrier.
- **CASE III · CV-1 badge.**
- **Position seats:** DEPARTURE, MARSHAL, APPROACH and FINAL as pill buttons with avatars, which can be claimed and released. A VIEW ONLY badge shows when you hold no seat.
- **Feed status:** "LotATC feed · live".
- **Clocks:** LOCAL (UTC+4) and ZULU, at equal weight.
- **Reference:** a popup with tabs for Minimums (Fig 6-6), Approaches, Helo ops and Documents (the CV NATOPS PDF). It can pop out to a new window.
- **Display settings** (§8), and **Displays** (open another monitor or device).

---

## 11. Other screens

### 11.1 Comms scripts (`Comms.dc.html`)
- **Layout:** a dialog with vertical phase tabs and a Departure / Arrival · Case III flow switch.
- **Phases:** Check-in, Marshal instructions, Established, Commencing, Platform, Dirty up, ¾ mile and ball call, Bolter/waveoff, and Low state → tanker.
- **Lines:** each line is coloured by speaker. `[bracketed]` fields fill in from the selected track and the marshal assignment: radial, DME, angels, EAT, button, altimeter and state.
- **No help text.** The user had notes and hints removed.

### 11.2 LSO station (`LSO.dc.html`)
- **Arrivals board:** a replica of the DCS/real LSO board, drawn as a CSS grid with olive `#B8CC5C` lines and 8 columns. Columns: side, callsign (`Charger-1-1`), blank, state/endurance (`6.8/31`, endurance in minutes), then blank columns, 22 rows.
- **Pattern view (larger):** final bearing with distance marks, the bolter pattern, and F/A-18C icons. The planform comes from the squadron tactics-animation model.
- **Grading panel:** the squadron's existing LSO grading interface.

### 11.3 Air Boss (`Boss.dc.html`)
- **Deck:** a Nimitz-class deck to scale, traced from the CVGEO blueprint (metres): catapults, JBDs, landing area, elevators and island. F/A-18C planforms, with wings folded for parked jets.
- **Modes:** Live (real positions) and Sand table (drag the pieces), plus taxi paths with conflict highlighting.
- **Events and air plan:** for scheduling and tracking launch and recovery events. Later linked to ReadyRoom Mission Prep.

---

## 12. User preferences learned during design (follow these)
- **Minimal and functional:** no explanatory text or help copy, and no "recommended action" prose in the UI. Don't over-condense into cryptic labels either.
- **Rows, not pills,** for lists. The sidebar uses text elements.
- **Geometry must be correct:** real turn radii, NATOPS-correct procedures, real headings, CPA computed from the tracks.
- **Radar legibility:** layered, constant-size symbology, labels under traffic, dark backgrounds behind flags and tags.
- **Colour:** orange and red mean alerts only, other-carrier items are blue, and hooked-aircraft tools are magenta.
- **Clicks:** clicking a list row highlights it. Editing is an explicit pencil button with a Cancel.

---

## 13. Backlog / open questions
1. Stack separation by footprint and altitude band (§6.4). This was explicitly deferred, not dropped.
2. Hold entry and inbound alignment in the marshal assignment EAT (§5.6).
3. Formation auto-grouping, plus split and join (§5.5).
4. Every track hookable; tag auto-placement; BRA ruler and CPA probe tools wired up. They show in the toolbar but are only partly mocked.
5. Real geometry and labels for the other carrier (§6.5).
6. Strips: match D02.1 exactly; drag and drop; full Coordination tab; data from ReadyRoom flight assignments.
7. Frequencies from the ReadyRoom comms plan (PRI/AUX channel lookup).
8. Persist display settings and layer choices per user, and room state per server.
9. Phase 2 unit control (carrier waypoints and BRC, tanker launch and rendezvous).
10. Multi-monitor and multi-device "Displays".
11. Alert look-ahead and thresholds made configurable (§5.4).

## 14. Suggested first milestones
1. **Geometry module** with unit tests: `depPath`, `arrival`, holds, `fly` (turn then direct), EAT, CPA, and conversions to and from lat/lon. Use the mockup's node checks as fixtures: radial sweeps 0–355° with no NaNs, no fillet overshoot, and arcs flown only when NATOPS calls for them.
2. **Feed adapter** (LotATC or TacView, read-only) to a normalised track store.
3. **Scope renderer** with the three layers, constant-size symbology, zoom, pan and fits.
4. **Tags, trails, vectors, conflict detection,** then the hooked-aircraft tools.
5. **Sidebars and panels** (layers, settings, radials manager, strips, frequencies, notifications).
6. **Rooms and seats,** then PriFly screens and Comms.
