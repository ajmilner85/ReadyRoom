# CATCC: decisions and findings

Running log of decisions made after HANDOFF.md. Where they disagree, this file wins.

## Hosting and environment (2026-11-07)

- **DCS server:** Fox3 Managed Solutions (`dcs.fightingstingrays.com`; Playground at `dcs2.`). We have file access to `Saved Games` (Scripts, Hooks, Mods), so we can install our own Lua hooks. Outbound connections from the host are probably restricted. Inbound mod ports are evidently allowed (Tacview 42674, LotATC 10310 and Olympus 3001 are all reachable).
- **Already on the server:** Tacview real-time export, LotATC, DCS Olympus v2.0.5 (web client on :3001), and DCS-gRPC (in `Scripts/DCS-gRPC`).
- **Credentials live outside the repo:** in `.env.local` / Fly secrets only.

## Seats

- **Typical:** 2 carriers × 2 controllers. The first controller is Departure + Marshal + Approach + Boss ("captain"); the second is the LSO.
- **Growth order:** a mission commander first, then per-boat approach/deck controllers. Up to 3 boats × 2.
- **Design limit:** 10 seats.
- **Model:** a seat is `(carrier, role)`, and one person may hold several roles. Command authority follows the roles:
  - the ship's controller steers;
  - the ship's controller or the mission commander launches tankers.
- **Supersedes the handoff:** this replaces HANDOFF §10's single global DEP/MARSHAL/APPROACH/FINAL row. Carriers are a list (up to 3), not "focus + other".

## Data sources

| Source | What it gives | Verdict |
|---|---|---|
| **Tacview real-time** (42674, no password) | Every object: position, attitude, heading, type, Pilot/Group/Color. Measured at about 11 KB/s during a 2-carrier cruise. **No fuel, no TAS/GS for other aircraft** (GS, course and VS are derived from position history). | **Phase 1 source.** Documented protocol, read-only, multiple clients are fine. Implemented. |
| **LotATC** (10310, coalition password) | A controller picture. | **Not used.** The protocol is proprietary and undocumented (the server waits for the client to speak first). A client of our own would be reverse-engineering a licensed product. Licences apply to the LotATC *client*, not to the stream, so licences aren't the reason; the protocol is. |
| **Olympus** REST (`/olympus/units`, `mission`, `commands`, etc.) | Every unit including **fuel (0–100 %, integer)**, plus unit control (routes, speed, spawn, tanker/AWACS, refuel). Also has an **SRS audio backend** (browser radios over WebSocket). | **Best candidate for fuel and Phase 2 control.** The auth is HTTP Basic `user:sha256(password)` with an `X-Command-Mode` header. A read-only probe returned 401 with the Blue password while the server was idle; recheck it while a mission is running. |
| **Own Lua hook** | Anything in the mission environment. | Fallback if Olympus doesn't fit. |

### Fuel

Tacview can't supply fuel. ACMI defines `FuelWeight`/`FuelVolume`, but DCS's exporter (DCS2ACMI 1.9.4) doesn't write them. The Week 5 cruise recording (1.3 M lines) has no fuel property at all, not even for the recording player's own jet.

A server-side Lua export **can** supply fuel. `Unit.getFuel()` in the mission scripting environment returns fuel as a fraction of internal capacity (above 1.0 with external tanks). Olympus exports exactly this, as an integer percentage. Converting it to pounds needs an internal-capacity table per type (F/A-18C: 10,860 lb, so 1 % ≈ 109 lb, which is enough for a `7.4` display).

**To verify live:** that `getFuel()` is accurate for *client* (player) aircraft on the server, not only for AI.

### Other facts found in the cruise recording

- `Coalition` is relative to the recorder (blue jets show as "Enemies"). Use `Color` for the side.
- Pilot strings are free text, e.g. `Hawk 4-2/733 QUIZNOS`. `parsePilot` extracts the callsign, a 3-digit board number and the handle. Roster matching should use the board number.
- `Group` matches the DCS flight, so formations come from the feed directly (HANDOFF §5.5).
- Several non-carrier ships report `AircraftCarrier` (e.g. `atconveyor`). Carriers are identified by type name (`CARRIER_HULLS`).

## Room service egress (Fly.io)

- **Ingress is free.** That covers the Tacview stream into the room service.
- **Worst case:** forwarding the raw stream to 10 clients is about 110 KB/s ≈ 0.4 GB/h, so ~1.2 GB for a 3-hour event, which is cents at Fly's per-GB egress rates.
- **Normalised deltas at 1 Hz with permessage-deflate:** roughly 10× less.
- **Conclusion:** telemetry won't affect the bill. Video would (see below).

## PLAT sharing (aspirational, documented per user request)

The capture tool (`Desktop/LSO-Diagnostic`) shares `LSOFRAME` as a D3D11 shared texture on the LSO's own machine. That machine must run DCS with the LSO platform selected. As of 2026-11-07 it has been tested in single player only, and it is pinned to a single DCS build.

1. **Other controllers monitoring the PLAT** (useful, but not on the critical path). The LSO station hardware-encodes the texture (NVENC/AMF/QSV via Media Foundation, zero-copy from D3D11) and publishes it to the room. Viewers receive it over WebRTC, which keeps latency under a second. Controllers then don't need DCS running to watch.
2. **A squadron-wide PLAT stream on a ReadyRoom page.** One publisher per boat pushes RTMP. **Don't relay it through Fly:** 1080p30 at about 4 Mbps is ~1.8 GB per viewer-hour. Push to an unlisted YouTube or Twitch stream, or to Cloudflare Stream, and embed that player in ReadyRoom. Expect 3–10 s of latency, which is fine for spectators.

## Own export hook (2026-11-08)

The user chose to build our own hook rather than reuse Olympus. It reuses LotATC's port 10310 (already open on Fox3; nobody uses LotATC), so the server admin doesn't need to open anything. Install steps are in `catcc-dcs/INSTALL.md`.

- **Design:** a GameGUI hook (`Scripts/Hooks/CATCC-hook.lua` loads `Scripts/CATCC/catcc.lua`) runs a non-blocking LuaSocket server and polls the mission environment once per second.
  - The poll runs `net.dostring_in('server', ...)` calling `CATCC_sample()`, which `sampler.lua` installs and reinstalls after a mission restart.
  - Protocol v1 is newline-delimited JSON. The client sends `AUTH <token>`; the token lives in `Config/CATCC.lua`, and the hook fails closed without it.
- **What it adds over Tacview:**
  - fuel (`getFuel()`);
  - true velocity (groundspeed, course and vertical speed come from DCS, not from position differences);
  - true-north heading, with the grid convergence correction;
  - unit/player/group identity, and the coalition as data;
  - deck, 2,000 ft and 10,000 ft winds plus sea-level temperature and pressure at each carrier;
  - mission date, local time and theatre.
- **Tacview stays configured** as a fallback source and for development.
- **Fuel in lb:** the internal capacities in `src/catcc/core/dcs/aircraft.ts` are taken from `M_fuel_max` in the local DCS install. For example, the Hornet is 4,900 kg.
- **Time:** DCS mission time is map-local. `THEATRE_UTC_OFFSET_H` converts it to UTC. The offsets are from memory, **so verify them per map** (especially Normandy/Channel and Sinai).
- **Testing:** `catcc-dcs/test` runs the real hook under fengari (Lua 5.3) with mocked DCS, LuaSocket and a mission environment on a grid rotated 3° from true north. DCS itself is Lua 5.1: the hook avoids 5.2+ features, and the harness shims `math.atan2`.
- **Not verified live yet:**
  - which `net.dostring_in` state reaches the scripting environment on Fox3 (`server` expected);
  - `getFuel()` for player aircraft;
  - CPU cost per sample with about 100 units.

## Room service (2026-11-08)

- **Hosting:** it runs inside SDOBot for now, at `/catcc/ws` on the existing Fly app, off unless `CATCC_ENABLED=true`, because the user is watching the billing threshold. `catcc-server/room/main.ts` is the standalone server for when it moves to its own app.
  - SDOBot loads a CommonJS bundle (`SDOBot/catcc/room.cjs`, built by `npm run catcc:bundle`). SDOBot's dependencies and its Node 20 image stay unchanged.
  - A room failure is caught and logged; it never takes SDOBot down.
- **Auth:** the first WebSocket message must carry the ReadyRoom Supabase access token. It is verified with `/auth/v1/user` using the service key; the display name and board number come from `user_profiles` → `pilots`. Any signed-in user can view and claim seats for now. **TODO:** add a `manage_catcc`/`operate_catcc` permission before Phase 2 commands.
- **Frames:** a complete picture at 1 Hz, as compact `WireTrack`s, with permessage-deflate. Clients keep their own trails. That's about 11 KB per frame uncompressed for 43 tracks.
- **Seats:** `(carrier hull, role)` with the roles departure, marshal, approach, final, boss, lso, and mission_commander (carrier `*`). One user can hold several. A seat survives a disconnect for 60 s, marked `away`.
- **Dev:** `npm run catcc:room -- --acmi <recording> [--speed 1] [--from 2300]` serves a recording through an in-process fake hook with synthetic fuel, no auth.

## Geometry module (2026-11-08)

`src/catcc/core/geometry/` is ported from the mockup's `radials()` as pure functions returning sampled polylines in scope coordinates.

- **What's in it:**
  - Case III departure paths (10 NM arc or S-turn);
  - left- and right-hand holds, sized for 250 kt or from TAS;
  - CV-1 arrivals (gradual or 30° turn at 20 DME, normal intercept or the 12 DME arc with fillets);
  - radial placement rules;
  - the turn-then-direct `fly()` model, EAT, CPA and NATOPS conflict standards;
  - the AEQD projection.
- **Tests:** 0–355° sweeps check that every path is finite and joins final astern of the ship, on the FB line and flying the FB; that arcs are flown only from wide radials and their points are really at 12 DME; and that the first fillet doesn't overshoot.
- **Still to do from the handoff backlog:**
  - hold-entry modelling in the EAT;
  - stack separation by footprint and altitude band (the 10° stack rule is still the mockup's invented one, flagged in code).

## Radar UI, first pass (2026-11-08)

- **Route:** `/catcc` is a top-level route in `main.tsx` next to `/kneeboard`: full-viewport, no app shell, pinned to `data-theme="dark"`. It is meant to be the page each Electron window or browser popup loads. `?src=`, `?cv=` and `?ws=` (dev room URL) are query overrides.
- **Code:**
  - `src/components/catcc/`: `useCatccRoom` (WebSocket + Supabase token, reconnect, trail history), `scopeModel` (pure picture: projection, formations by DCS group, conflicts, phases, tags; unit-tested), `Scope` (SVG), `CatccApp` (shell).
  - Strips reuse the ui-refactor D02.1 `FlightCard` unchanged.
- **Built:**
  - screen-constant symbology (handoff §3.3);
  - rings and compass, CCAs (focus green, others blue), the coordination line with pill, BRC chevron, FB with 3/6/10 ticks;
  - departure radials with DR flags; marshal stacks (hold, fix hash, arrival, flag); emergency (amber) and helo holds;
  - trails (5 dots at about 6 s), 30 s velocity vectors, tags with leaders (row 3 = `FLT ×n · LOW x.x` for collapsed formations);
  - collapsed formations (click to expand), conflict pairs in red with CPA projections and tag, off-scope edge triangles;
  - zoom about the cursor, drag pan clamped to 100 NM, live fits (50NM/CCA/DEP/APP), cursor BRG/RNG/lat-lon readout, 10 NM scale bar;
  - hooked-aircraft tools:
    - **vector helper:** BRG/RNG/HDG/TRK DIST/ETE, with the wheel setting speed;
    - **marshal assignment:** wheel picks the level, fix = angels + 15, EAT; a click assigns, draws the dim assignment, and fills the stack's levels table;
  - strips grouped Departure/Inbound/Marshal/Approach/Support (heuristic phases);
  - Info tab: BRC/FB/speed, wind over deck and down-the-angle, true wind, altimeter, temperature, 2K/10K winds;
  - Radials panel: add departure radials and stacks through the rule checks, base −/+, remove;
  - notifications (CONFLICT, LOW STATE < 4.0) with go-to and Ack;
  - seat pills with claim and release, VIEW ONLY, feed status, LOCAL/ZULU clocks, and an open-another-window button.
- **Verified in a browser:** against your Week 5 host recording through the fake hook (Playwright, 1700×950). Hook, assign, vector, claim and release all work. **Visual QA of styling is still yours.**
- **Not done yet:**
  - Display-settings dialog: the scale multipliers exist but are fixed at the defaults.
  - Layers panel; tag auto-placement; formation wheel-cycling; BRA ruler and CPA probe tools; Light/Case curve; frequencies popover; Reference popup; PriFly screens; Comms scripts.
  - Strip drag between phases.
  - A `manage_catcc` permission.

## Shared room state (2026-11-08)

- **What's shared:** radials plans (departure radials and stacks, per carrier hull) and marshal assignments now live in the room. They are validated by `cleanPlan`/`cleanAssignment` and broadcast to every subscriber.
- **Edit rights:** anyone signed in can edit until someone holds a seat on that carrier (or MC); from then on, only seat holders can. A seat in its disconnect grace still counts, so a reconnecting controller isn't locked out.
- **Cleanup:** an assignment is dropped when its aircraft leaves the picture.
- **Default stack:** until a carrier's plan is first edited, clients draw the CV-1 default stack locally. The first edit sends the full plan.
- **Persistence:** room state is in memory. It's lost on a room restart, and SDOBot deploys restart it. Persisting plans to Supabase per mission is backlog.

## Radar rebuilt as a faithful mockup port (2026-11-08)

The first radar pass was an approximation. The user compared it with the mockup, and it has been rebuilt from `Main.dc.html` with its exact markup values, colours and symbol geometry.

- **Code:** `src/components/catcc/radar/` (`Scope`, `RadarView`, `InfoPanels`, `Panels`, `types`).
- **Scope layers, in the mockup's order:** background svg, overlay svg, HTML flags/edge markers, traffic svg, HTML helper tags, then floating controls.
- **Now matches the mockup:**
  - **Header:** logo, module nav, Ship select (hull · nickname), CASE badge, seat pills with avatars, feed status, LOCAL/ZULU, Reference, Display settings, Displays.
  - **Floating toolbar:** select, BRA ruler, marshal, CPA probe and vector tools; Layers; Comms; zoom/RNG; fit buttons.
  - **Panels and dialogs:**
    - Frequencies popover, read from the ReadyRoom comms plan of the event nearest to now (`missions.mission_settings.comms_plan`; PRI/AUX columns from `radio`);
    - Layers panel with focus and other-carrier columns;
    - Display settings with live previews, applied on Apply and saved in localStorage;
    - Reference popup (Minimums, Approaches, Helo ops, Documents);
    - Comms scripts dialog, with fields filled from the selected aircraft and its assignment.
  - **Scope frame and overlays:**
    - lat/lon frame with edge labels, and the grid;
    - rings and compass;
    - CCAs, plus the other carrier's rings and CCA;
    - coordination line with the rotated pill.
  - **Per-carrier overlays:** BRC, FB, bolter, helo restrictions, CV-1/2/3, tanker, departures, arrivals and marshal. These are the mockup's SVG rotated by (BRC − 345), with labels kept upright. Other carriers are drawn from their **own** room plans, in blue.
  - **Radials manager:** pennant flags (HTML), on-scope placement with blocked wedges, a bow-on wedge and a candidate preview/flag, Edit/Cancel/status rows, highlight, and the expandable stack levels table.
  - **Traffic:**
    - trails as screen-constant dots and velocity vectors;
    - tags placed exactly as in the mockup, with the leader quadrant chosen away from the velocity vector;
    - formation hover ring, wheel cycling and member tags;
    - conflicts with projections, the CPA segment and label, pinned to the edge when off-scope;
    - off-scope triangles;
    - other-carrier traffic (nearest carrier within 60 NM) drawn in blue.
  - **Info tab:** Ship, Weather, and Light/Case. The sun and moon come from `core/env/astro.ts`, and the chart window is solar noon to solar noon at the ship. The case comes from night plus ceiling and visibility.
  - **Notifications:** CONFLICT, LOW STATE, LATE PUSH, COORD LINE and BRC CHANGE, all derived from live data.
- **Hold entry (backlog item 2, done):** `marshalRoute()` flies a turn-rate-limited path to the fix. The entry is straight-in, direct, teardrop or parallel by the 70° sectors, and the aircraft finishes established inbound at the fix. EAT uses that distance, and the hook tag shows the entry type.
- **Hook `env` message (30 s):** mission weather (cloud preset/base, visibility, fog, precipitation), every live ship group's route (used for "Next PIM turn" and the BRC CHANGE note) and the mission start time. These feed the Weather panel and the case. DCS has no dew point.
- **Seats:** the Mission Commander pill was removed from the radar header so it fits on one row. Seat access is being redesigned around qualifications (see the user's request below).
- **PriFly LSO and Boss:** both screens are ported and fed by live data, but the user has paused work on them. **Unverified:** deck placement of parked jets. In the Week 5 recording, jets on deck report headings of 340/160 while the ship is on 070, and nothing was placed during the check, so the deck-frame transform (`prifly/deck.ts`, `DCS_ORIGIN_X`) needs a look against a live carrier.

## Open requests from the user (not started)

- **Seat access tied to ReadyRoom qualifications**, with a settings UI that maps qualifications to seats. Seniority rules: a senior user can displace a junior one; an equal or junior user can only request a takeover, and the occupant must accept it in a dialog. Waiting on answers about the seniority source, the request timeout and who can view.
- **Marine view:** ship traffic, bathymetry and coastlines (DCS doesn't expose them, so external sources such as GEBCO and OSM/Natural Earth are proposed), PIM and waypoints for every friendly CSG, and a CSG formation manager (needs the Phase 2 command channel).

## Code layout (Phase 1 start)

```
src/catcc/core/            pure TS, no DOM/Node APIs; shared by the scope UI and the room service
  acmi/parser.ts           streaming ACMI line parser (chunk-boundary safe, escapes, continuations)
  acmi/state.ts            object table; T= transforms with reference offsets and partial updates
  tracks/trackStore.ts     radar tracks: kind/side/identity, GS/course/VS from history, 60 s history
  tracks/naming.ts         pilot-string parsing, carrier hull table
  geo.ts                   distance, bearing, destination
catcc-server/              Node 23.6+ runs these .ts files directly
  tacview/realtimeClient   Tacview real-time client (handshake, reconnect)
  tacview/replay.ts        .acmi/.zip.acmi reader and paced replay
  tacview/fakeServer.ts    serves a recording over the real-time protocol (dev without a live mission)
  cli.ts                   prints the picture around a carrier
```

Commands:

```
npm test                                                   unit tests (vitest)
npm run catcc:typecheck
npm run catcc:tacview -- --live dcs.fightingstingrays.com --focus CVN-72
npm run catcc:tacview -- --replay <file.zip.acmi> --speed 0 --until 2400 --summary
npm run catcc:tacview -- --serve <file.zip.acmi> --port 42675 --from 2380   (then --live localhost:42675)
```

## Coordination line (replaces the handoff's ship-to-ship bisector)
- Automatic line: separator between each carrier's protected areas (ship + each active marshal hold, holds scored as whole areas). Margins 5 NM for ships, 2 NM for holds. If a clean band exists the line runs midway across the widest one; otherwise (holds of the two carriers overlap) it minimises the weighted depth it cuts into the margins, ships weighted 25x holds. Every bearing 0-179 deg tried; near-ties lean toward the ships' mean course. The original bisector ran through the other carrier's marshal stack, and the first max-margin version broke down when holds overlapped.
- Manual override per carrier pair, stored in the room plan as `coord[otherHull] = { brg, off }` (off = NM from our ship toward the other). Set numerically or placed on the scope (cursor positions, wheel rotates, Ctrl for 1°, click sets, Esc/right-click cancels) from the Coordination section of the airspace panel; Auto clears it. If only the other carrier set one, it is reframed into ours.
