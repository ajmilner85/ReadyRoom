# Carrier Ops: handoff 2 (locations, seats and the new screens)

This handoff builds on `HANDOFF.md`, the first handoff (radar, geometry, NATOPS procedures, colour rules). It adds:

- the **location and seat model**;
- **four new or reworked screens** (CDC, Approach/Final, Bridge, PriFly);
- **track ownership and handoffs**;
- the **decisions taken since** the first handoff.

Where this file disagrees with `HANDOFF.md` or with the mockup, this file wins.

The mockup screens are in `mockup/`, one `.dc.html` per artboard. The markup is HTML/SVG with `{{holes}}`, and the logic lives in `class Component` → `renderVals()`. Lift the logic; re-implement the UI.

| File | Location / seat |
|---|---|
| `Main.dc.html` | CATCC: radar (Air Ops, Departure, Marshal, plus Approach's radar view) |
| `Final.dc.html` | CATCC: Approach / Final precision displays |
| `CDC.dc.html` | CDC: Strike / Air Warfare / Surface Warfare |
| `Boss.dc.html` | PriFly: Air Boss / Mini Boss |
| `Bridge.dc.html` | Bridge: Officer of the Deck |
| `LSO.dc.html` | LSO platform |
| `Comms.dc.html` | Comms scripts dialog (unchanged) |

---

## 1. Locations and seats

**Location** = a space on the ship. **Seat** = one function inside a location. A seat changes the interface (presets, panels, tools), not just permissions.

| Location | Condensed (default) | Expanded |
|---|---|---|
| CDC | Strike | Air Warfare · Strike · Surface Warfare |
| CATCC | CATCC | Air Ops · Departure · Marshal · Approach · Final |
| PriFly | Air Boss | Air Boss · Mini Boss (Tower) |
| Bridge | OOD | Officer of the Deck |
| LSO | LSO | Controlling LSO · Backup LSO · Writer |
| (off-ship, backlog) | Observer, Instructor | same |

**Staffing setting.** Condensed or Expanded is a **server/room setting** in Options. Default is Condensed. It applies to every location.
- **Condensed:** one person per location covers every function.
- **Expanded:** shows every seat.
- **Combined positions:** when a sub-seat is unclaimed, its alerts, strips and handoffs roll up to whoever holds the parent location, or the nearest claimed sibling. Nothing is ever orphaned.

**Seat states** (pill in the top bar):
- **Open:** dashed outline; click to claim.
- **Mine:** orange.
  - Clicking a held seat that isn't the active one makes it the active view.
  - Clicking the active one releases it.
- **Held by another user:** shows their board number and callsign; read-only.

A user holding no seat in the current location sees **VIEW ONLY**.

**Mockup limitation:** seat claims are per artboard. In production they are room state, shared across clients, with one holder per seat.

**Seat presets.** The same component (e.g. the radar) opens differently per seat. Presets set the default zoom fit, layers, tabs and tools. Users can change things afterwards; their changes persist per user per seat.

| Seat | Preset (as mocked) |
|---|---|
| CATCC (condensed) | 50 NM fit, default layers |
| Air Ops | CCA fit, all layers |
| Departure | DEP fit; departure radials and tanker on; marshal, arrival paths and bolter off |
| Marshal | APP fit; marshal, arrival paths and departure radials on; bolter off |
| Approach | APP fit; marshal, arrival paths, bolter and CV-1 on; departure radials off. Its main screen is Approach/Final at the 24 NM range |
| Final | Approach/Final at the 12 NM range |
| Strike | Theatre fit, bullseye on, Tasking tab; CCA-level layers (marshal, final bearing) off |
| Air Warfare | Air tab; bullseye, SAM, CAP/tanker and air tracks on |
| Surface Warfare | Surface tab; bullseye and surface tracks on |
| Mini Boss | PriFly with Case I/II overhead and the Air plan tab |

**Shared top bar** (every screen):
- ship select;
- location tabs: CDC · CATCC · PriFly · Bridge · LSO;
- the location's seats;
- screen-specific controls;
- LOCAL and ZULU clocks;
- Options.

In CATCC a view switch (**Radar | Approach / Final**) links the two CATCC screens.

---

## 2. Cross-cutting rules

**Deck status is shared state, owned by PriFly.**
- **Values:** CLEAR / FOUL, plus the reason (e.g. "216 clearing landing area").
- **Who sees it:** a banner on PriFly, Approach/Final and LSO. It was removed from the radar's Info panel.
- **Prominence:** FOUL must be impossible to miss on Final and LSO.

**Track ownership and handoffs.**
- **Owner:** every track/flight has one owner seat, shown as a chip on its strip (e.g. STRIKE, MSHL, APP, CATCC).
- **Handoff flow:** the sending seat initiates the handoff; the receiving seat **accepts** it. The strip shows "HANDOFF ← STRIKE · Accept" and a HANDOFF notification appears.
- **Standard handoffs:** Strike → Marshal (~50 NM), Marshal → Approach (commencing), Approach → Final (~6 NM), Final → LSO (¾ NM), Departure → Strike.
- **Recall:** the sender can recall a handoff until it's accepted.
- **Condensed staffing:** owners are locations (STRIKE, CATCC).

**Colour rules** (from HANDOFF.md, still in force):
- orange/red = alerts;
- blue = the other carrier;
- magenta = hooked-aircraft tools.

**Console screens (Bridge).** Muted, photo-like colours. Dim green digits on near-black, and beige/grey dials. Don't use the bright DCS screenshot palette: it's too bright in a dark room.

**Units.** Yards use the naval rule of thumb, **2,000 yd = 1 NM**.

---

## 3. CDC (`CDC.dc.html`)

**Theatre picture** (north up; zoom fits THEATRE / CSG / BULL). Layer toggles: Bullseye, SAM, Kill box, DTC, CAP/TKR, Air, Surf.
- **Bullseye:** rings every 20 NM and spokes every 30°.
- **CSG ships:** with **SAM coverage rings** (SM-2: CG ~90 NM, DDG ~75 NM).
- **CAP stations and tanker tracks:** racetracks.
- **Kill boxes:** a grid, with the active box highlighted and its HOT window shown.
- **Strike routes:** drawn from **DTC data**, either the .miz or the waypoint export. Waypoints are numbered, with push time and TOT.
- **Air tracks:** NTDS/HAFU symbology. Friend is a blue semicircle; unknown is a yellow open square; suspect is an amber chevron; hostile is a red chevron. Velocity leaders and two-line labels.
- **Surface tracks:** full symbols. Friend is a circle, hostile a diamond, unknown a square, neutral green.
- **Rigging:** an identification tasking line from the helo to the contact.

**Left sidebar tabs:**
- **Tasking:** packages (from DTC), CAP stations (with Assign), tanker tracks, kill boxes (with HOT/COLD).
- **Air:** track list with **manual HAFU declaration** (FRD/NEU/UNK/SUS/HOS). The auto-ID shows until a controller declares.
- **Surface:** surface tracks with **Task rig / Recall**.

**Right sidebar:**
- **Altitude blocks:** a bar per flight on a common scale. Overlapping blocks are flagged red.
- **Air defence:** ROE per escort (HOLD / TIGHT / FREE). This is where launch authority will live.
- **EMCON:** conditions A–D, each setting emitter states (air search, SPY, TACAN, ICLS/ACLS, Link 16).
- **Link 16 donors:** per-donor DONOR / SUPPRESSED toggle.

---

## 4. CATCC radar (`Main.dc.html`): changes since handoff 1

- **Seats:** seat bar and presets (§1). Options now opens with **Staffing** above the Display settings sliders.
- **Info tab:** no deck status (§2).
- **Strips:** each strip has an owner chip. A pending handoff adds a row with **Accept**. Example: VOLT 3 arrives from STRIKE.
- **Notifications:** a new HANDOFF kind, whose button reads **Accept** instead of Ack.
- **Data fix:** 203 now reads ↓036 (3,600 ft at 17.5 NM). The old 7,100 ft was inconsistent with the Case III profile.

---

## 5. Approach / Final (`Final.dc.html`)

Precision approach (PAR) style: two displays stacked, sharing a range axis. Touchdown is on the left.
- **Range selector:** 6 / 12 / 24 NM. Approach defaults to 24 NM, Final to 12 NM.
- **Altitude scales:** 0–1,500 ft at 6 NM, 0–3,000 ft at 12 NM, 0–7,000 ft at 24 NM.

**Elevation display (top):**
- **Glidepath:** 3.5° with ±0.5° tolerance lines.
- **Case III profile** (dotted): A6 at 21 DME → platform 5,000 ft at ~20 DME (4,000 fpm, 250 kt) → 2,000 fpm to 1,200 ft by ~12 DME → level → glideslope intercept at ~3.2 NM.
- **Horizontal lines:** stack base (A6), platform (5,000), 1,200 ft. Each is shown only when it fits the range.
- **Distance marks:** ¾ NM BALL, GS intercept, 6 NM FINAL, 10 NM DIRTY UP, 20 NM PLATFORM.

**Azimuth display (bottom):**
- final bearing centreline;
- ±1°, ±2° and ±5° fan (10° total);
- lateral scale exaggerated so the bolter downwind leg (~2 NM abeam) is visible;
- L/R marked.

Blips are squares with two-line labels. Off-course or downwind traffic is dimmed.

**Bolter slot tool.** This is the key new feature. It answers "when should the bolter turn in so it slots into the arrival flow?"

The mocked model works in ship-relative motion:
- **Speeds:** final closure 125 kt, downwind opening 165 kt (aircraft speed plus ship speed), 180° turn about 75 s.
- **Time to the ¾ NM point:** `tBall(X) = (X − R0)/V_dw + T_turn + (X − 0.75)/V_final`, where `R0` is the aircraft's current downwind range and `X` the turn-in range.
- **Traffic:** each arrival's time to ¾ NM comes from its own speed profile.
- **Window:** the range of X keeping ≥ 60 s (Case III interval) to the aircraft ahead and behind. `tBall` is linear in X, so solve for the bounds in closed form.

Display:
- ghost turns on the azimuth display at **now / 4 / 6 / 8 NM**, coloured by interval (green ≥ 60 s, amber 30–60 s, red < 30 s or out of sequence);
- a green band on the downwind leg marking the valid window;
- a right-panel timeline of traffic and option ¾ NM times;
- the window as **"Turn between 4.2–6.4 NM · in 0:37–1:24"**, with per-option ¾ NM time and gaps.

In production:
- use real groundspeeds, wind and ship speed, plus the real bolter pattern geometry (§6.5 of HANDOFF.md);
- recompute every update.

The same tool is wanted for **upwind → downwind turn timing**. It isn't mocked yet.

**Right sidebar:**
- **Deck status:** banner with wind over deck, arresting gear setting (type and weight) and lens.
- **ICLS:** ON/OFF, channel 13, glideslope 3.5°.
- **ACLS (SPN-46):** UP/DOWN and Link 4 frequency. Each aircraft has a lock status and mode select (I / IA / II / III).
- **Sequence:** arrivals with fuel, position, owner and the handoff action (e.g. "Handoff LSO", "Handoff FINAL", "Accept" for one commencing from Marshal).

---

## 6. Bridge (`Bridge.dc.html`)

**Chart (centre).** North up, 10 NM grid, range rings.
- **Track:** past track, the current recovery leg (green), and the return-to-PIM leg (dashed white).
- **Waypoints** and the **PIM** track with its moving **PIM box**.
- **Escort station sectors.**
- **Wind indicator:** an arrow pointing **downwind** (the direction the air flows), labelled **"WIND FROM 330 / 12"**. An earlier version pointed the wrong way.
- **Tools:** Select / Plot waypoint / Edit PIM / Range-bearing.
- **PLAT repeater:** an overlay you can toggle; will be an RTMP stream later.

**Left sidebar:**
- **Waypoints:** position and ETA.
- **PIM:** PIM position, course/speed, in/out of box, catch-up speed, plus a recovery window strip (into wind → back to PIM → in box).
- **CSG formation:** the active preset in its title, then each escort's station and status. "Edit stations" opens the editor (§6.1).
- **Lights:** navigation lights 1 and 2 (ON/OFF/AUTO) and bridge/room lights (ON/NIGHT/OFF).

**Right sidebar: Steering.** A compass modelled on the real Nimitz steering console, at full panel width:
- **Outer ring:** the **true heading card**, grey/beige with graduations on its **inside** edge and numbers every 10°. It **rotates** so the ship's heading is under a fixed lubber mark at the top. The **ordered course** is a green bug on its outer edge, so it rotates with the card.
- **Black band** between the rings, carrying the lubber diamond.
- **Inner grey disk:** the **relative bearing** ring, fixed. Graduations on its **outside** edge; 000 at the bow, 020–160 down each side, 180 astern.
- **Centre:** ORDER / HEADING / SPEED readouts (DEG / KTS).
- **Removed after review:** LEE HELM box, VERNIER, and the HAND/AUTO/NAV steering-mode toggle. DCS ships just follow orders and waypoints.
- **Rudder gauge:** below the compass, compact (~70% width). Order wedge plus port/starboard rudder readouts. Rudder order is derived from the heading error.
- **Order buttons:** large «, −, +, » (±10° / ±1°).

**Right sidebar: Engine order.**
- **Bells:** Ahead Flank / Full / Standard / 2/3 / 1/3, Stop, Back 1/3 / 2/3 / Full. Ahead is green, back is red.
- **Speeds:** 30 / 22 / 15 / 10 / 5 / 0 / −5 / −10 / −15 kt.
- **Ordered speed:** −/+.
- **Readouts:** speed over ground and sea room ahead (open water before the ship must turn).
- **Removed after review:** shaft RPM, "Send to ship" (orders are sent immediately) and the LEE HELM label.

**Right sidebar: Wind over deck.**
- **Header:** status, IN LIMITS or OUT OF LIMITS.
- **Readouts:** true wind direction and speed, down-angle component, cross-deck component.
- **Gauges:** two needle gauges for the down-angle and cross-deck components.
- **Best recovery course/speed:** with a **Set** button.
- **Removed after review:** the true/relative toggle (the components are already relative) and the printed limits line.

**WOD maths:**
- relative wind = true wind vector − own motion;
- the angled deck is 9° left of the BRC;
- **limits** (F/A-18E): 25–30 kt down the angle, within ±5°, crosswind ≤ 7 kt;
- **best course:** a brute-force search over course (1°) and speed (0.5 kt), minimising `2·|angle off| + |kt − 27|`.

### 6.1 CSG formation editor

**Units first.** The list is the escorts (CG, DDG-1, DDG-2), and **each escort holds exactly one station**. Nonsensical double assignment is impossible by construction.

Station types:
- **Sector:** bearing from/to relative to the formation axis, plus inner/outer range.
- **Point:** bearing and range.
- **Free:** no station, e.g. detached.

**Axis.** The formation axis follows the BRC (345 in the mockup), and the plot is drawn axis-up.

**Roles:** AAW, ASW, Plane guard, Picket. Choosing **Plane guard** snaps the station to **170R at 4,000 yd** (2 NM), the standard station on the final bearing astern. That's the only plane-guard setting we use; the USNI 3–5 NM alternative was considered and rejected.

**Presets:** **Flight ops** (launch/recovery, includes the plane guard), **Transit**, **Combat**. There is no separate Plane guard preset.
- **Separate drafts:** each preset keeps its own layout.
- **Apply:** saves all drafts and makes the shown preset **active** (marked ●). The Bridge panel title shows the active preset.
- **Cancel:** discards the drafts.

The mocked defaults below are placeholders; let the squadron edit and save them.

| | CG | DDG-1 | DDG-2 |
|---|---|---|---|
| Flight ops | AAW 330–030R 4–8 NM | AAW 035–075R 9–15 | Plane guard 170R 4,000 yd |
| Transit | AAW 330–030R 6–10 | ASW 240–300R 6–10 | ASW 060–120R 6–10 |
| Combat | AAW 010–050R 12–20 | AAW 300–340R 10–18 | ASW 160–200R 6–12 |

**Editing.** Numeric −/+ fields and mouse dragging stay in sync.
- **Click a sector or point** to select it.
- **Drag a sector's body** to move it; width and depth are kept.
- **Grips:** the selected sector shows four, placed **outside** it so they stay separable on small sectors:
  - two bearing grips, just past the outer arc at each edge;
  - two range grips, just beyond the inner and outer arcs.
- **Point stations:** drag the dot.
- **Nearest grip wins.**
- **Snapping:** 5° and 0.5 NM.
- **Limits:** sector width 10°–180°, depth ≥ 1 NM.

**Backlog:**
- release plane guard after recovery (detach when the drop lights go out, open, then parallel the downwind course);
- station-keeping alarms (unit outside its sector);
- pushing station orders to AI ships (phase 2).

---

## 7. PriFly (`Boss.dc.html`)

- **Top bar:** Live / Sand table, CASE I/II / CASE III.
- **Deck status bar:** CLEAR/FOUL (§2) with reason, the next arrival's ¾ NM time, wires (set weight), barricade, lens and WOD.
- **Flight deck:** the to-scale Nimitz deck from handoff 1.
- **Arrivals board:** one row per aircraft in landing order:
  - landing order, side, type, callsign;
  - **state** and **endurance** (min);
  - **landing weight**, which sets the arresting gear;
  - **pass count** (B after a bolter);
  - **wire** and **LSO grade**.

  The next aircraft is highlighted and low states are amber. Recovered aircraft are dimmed, with wire and grade.
- **Overhead (BRC up):**
  - **Case III:** shows traffic inside 10 NM (final, bolter downwind, plane guard helo, tanker).
  - **Case I/II:** shows the **left-hand overhead holding stack** (ship at 3 o'clock, flights by altitude), the initial (3 NM, 800 ft), the break and the 600 ft downwind.
- **Right sidebar:** a PLAT repeater, then three tabs:
  - **Launch:** per catapult, status, queue, weight board and JBD.
  - **Lights:** modelled on the DCS lights panel.
    - Semaphore: VIOLET/YELLOW/GREEN/RED/OFF/AUTO.
    - Deck lights, cat zone, rear deck, board number, below deck and landing lights: ON/OFF/AUTO.
    - Catapult lights: GREEN/RED/OFF/AUTO.
    - Navigation and room lights belong to the **Bridge**, not PriFly.
  - **Air plan:** events from ReadyRoom Mission Prep, plus the deck log.

## 8. LSO (`LSO.dc.html`)

Arrivals board replica and grading from handoff 1, plus:
- **WAVE OFF** (red) and **CUT** (green) pickle buttons;
- **screen select:** ARBS / ISIS / WIND / IFLOLS / METOC;
- **ACLS** LOCK / MODE / HOLD;
- IFLOLS setting and wave-off light status;
- a **FOUL DECK** banner in the top bar.

---

## 9. Implementation notes

- **Shared code:** build the top bar, seat model, deck status and ownership/handoff as shared components and state. Every location reads them.
- **One radar engine:** CDC (theatre), CATCC (CCA), and Bridge (chart) are the **same scope engine** with different projections, layers and symbol sets. Don't build three.
- **Pure, unit-tested modules:**
  - slot-window maths;
  - WOD and best-course search;
  - formation geometry (sector containment and the station-keeping check).
- **Persistence:**
  - per user per seat: layers, zoom, display scales;
  - per room: staffing, seat claims, deck status, formation presets, ownership.

## 10. Open items
1. Upwind → downwind timing in the slot tool.
2. Observer and Instructor seats (Instructor injects weather, emergencies, no-radio aircraft; drives phase 2 unit control).
3. Plane guard release and station-keeping alarms (§6.1).
4. Strip style must match ReadyRoom **"D02.1 Chips refined"**. Its source is still not in hand.
5. Comms plan, air plan and DTC data from ReadyRoom Mission Prep (frequencies, events, routes).
6. The stack separation rework from HANDOFF.md §6.4 is still deferred.
