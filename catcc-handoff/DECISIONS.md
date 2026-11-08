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
