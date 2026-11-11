# CATCC DCS export hook: install

The hook runs inside the DCS dedicated server. It streams every aircraft and ship to the CATCC room service once per second: position, true heading and course, groundspeed, vertical speed, **fuel**, identity, and carrier winds. With `commands = true` in its config it also takes ship orders from the room (step 6); otherwise it is read-only.

Paths below are relative to the server's Saved Games folder, `Saved Games\DCS.server\` (the folder that holds `Scripts`, `Mods`, `Config` and `Logs`).

## 1. Free port 10310 (LotATC)

The hook listens on 10310 by default because that port is already open on the Fox3 host. LotATC currently holds it, so LotATC must stop listening there. Pick one:

- **Disable LotATC:** move its server folder (`Mods\services\LotAtc`) **out of** `Mods\services`, for example to `_disabled\LotAtc`. Renaming it in place isn't enough, because DCS still loads it. Do the same for any LotATC file in `Scripts\Hooks`.
- **Or move LotATC to another port** in its server config. LotATC then becomes unreachable, since only 10310 is open.

To undo, move the folder back and remove the CATCC files.

## 2. Copy the files

```
catcc-dcs/Scripts/Hooks/CATCC-hook.lua   ->  Scripts\Hooks\CATCC-hook.lua
catcc-dcs/Scripts/CATCC/catcc.lua        ->  Scripts\CATCC\catcc.lua
catcc-dcs/Scripts/CATCC/sampler.lua      ->  Scripts\CATCC\sampler.lua
catcc-dcs/Config/CATCC.example.lua       ->  Config\CATCC.lua            (then edit it)
```

In `Config\CATCC.lua`, set `token` to a long random string; anything shorter than 16 characters is refused. For example, in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

The same token goes in the room service's `CATCC_SOURCES` secret (see below). Keep it out of git.

## 3. Allow `net.dostring_in` (probably already done)

Since DCS 2.9.18, hooks may only call `net.dostring_in` for states listed in `Config\autoexec.cfg`. Olympus and LotATC need the same entries, so they're probably there already. Make sure the file contains:

```lua
net.allow_unsafe_api = {"userhooks"}
net.allow_dostring_in = {"mission", "server"}
```

If either line already exists with other values, **add** `"server"` (and `"userhooks"`) to it instead of adding a second line. Edit with a code editor, not Notepad.

## 4. Restart and check the log

Restart the DCS server, start a mission, then look in `Logs\dcs.log` for:

```
CATCC: CATCC hook 0.1.0 loaded (port 10310, 1 Hz)
CATCC: listening on port 10310
CATCC: client <ip> authenticated
CATCC: sampler installed in state "server"
```

Problems and what to do:

| Log line | Fix |
|---|---|
| `cannot listen on port 10310 ... is another mod such as LotATC using it?` | Step 1 |
| `installing sampler in state "server" failed` | Step 3. Or try `state = 'mission'` in `Config\CATCC.lua` (community notes say `server` is the one that reaches `Unit`/`coalition`) |
| `token missing or shorter than 16 characters` | Step 2 |

The hook only services connections **while a mission is running**. With no mission loaded, clients connect but get no reply until one starts.

## 5. Test from any PC

```
npm run catcc:tacview -- --hook dcs.fightingstingrays.com:10310 --token <token> --focus CVN-72
```

This prints the picture around the carrier every 5 s. It includes a FUEL column: thousands of lb for known types, percent otherwise.

## 6. Ship orders (optional)

Set `commands = true` in `Config\CATCC.lua` to let the room steer ships: the Bridge's helm orders and plotted waypoints for its carrier, and escorts ordered to their formation stations. Any signed-in user holding the carrier's Bridge seat (or anyone, while no seat on that carrier is held) can give them, so only enable it on servers where that's acceptable.

What DCS allows: AI ships take **routes only**. There is no rudder or engine-order API for them (the Supercarrier Air Boss ship panel is a client-side UI, not exposed to scripts). So:

- a helm order becomes a waypoint 60 NM ahead on the ordered course at the ordered speed, re-sent every 10 minutes;
- the ship always turns at its full-rudder radius (for CVN-71/72/... 0.36 NM at every speed, measured in DCS);
- DCS ships can't go astern: an astern order stops the ship and says so;
- escorts can only be ordered if each is in **its own** DCS group. Ships in the carrier's group follow DCS's own group formation.

Each order is logged in `dcs.log` as `CATCC: order helm for <group> from <ip>`.

### Testing on a local DCS first

1. Install the files into your own `Saved Games\DCS\` (not `DCS.server`) exactly as above, with `commands = true` and any 16+ character token.
2. Start a mission with a carrier group (single player is fine). If the log says the sampler failed in state `server`, set `state = 'mission'` in the config.
3. On the same PC: `npm run catcc:local -- --token <token>` (the room on port 3002, source "DCS (localhost)"), then `npm run dev` and open `/catcc`.
4. Take the Bridge seat and give a helm order. The ship should start turning within a second or two.

## Room service (SDOBot on Fly)

The room service runs inside SDOBot until it gets its own Fly app. Use a token of letters and digits only (no quoting needed), then from `SDOBot\`:

```
fly secrets set CATCC_TOKEN=<token> -a readyroom
fly deploy
```

Setting the token turns the room on and points it at the hook on `dcs.fightingstingrays.com:10310` (`CATCC_HOOK=host:port` overrides; `CATCC_ENABLED=false` turns it off). For several sources, `CATCC_SOURCES` (a JSON array of sources) still takes precedence.

The browser endpoint is `wss://readyroom.fly.dev/catcc/ws`. It uses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to verify ReadyRoom sign-ins.

Rebuild `SDOBot/catcc/room.cjs` with `npm run catcc:bundle` whenever `catcc-server/` or `src/catcc/core/` changes.
