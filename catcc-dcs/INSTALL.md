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
catcc-dcs/Config/CATCC.example.lua       ->  Scripts\CATCC\config.lua    (then edit it)
```

The settings file can also go in `Config\CATCC.lua`, the older location. The hook reads `Scripts\CATCC\config.lua` first, which suits hosts whose file access doesn't reach `Config`. When copying a new `Scripts\CATCC` folder later, keep the server's `config.lua`.

In the settings file, set `token` to a long random string; anything shorter than 16 characters is refused. For example, in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

The same token goes in the room service's `CATCC_TOKEN` secret (see below). Keep it out of git.

## 3. Allow `net.dostring_in` (probably already done)

Since DCS 2.9.18, hooks may only call `net.dostring_in` for states listed in `Config\autoexec.cfg`. Olympus and LotATC need the same entries, so they're probably there already. Make sure the file contains:

```lua
net.allow_unsafe_api = {"userhooks"}
net.allow_dostring_in = {"mission", "server"}
```

If either line already exists with other values, **add** `"server"` (and `"userhooks"`) to it instead of adding a second line. Edit with a code editor, not Notepad.

The crew test's installer (`deck-test\crew-test\install.ps1`) adds a line marked `-- CATCC slot picker`. It adds `"gui"` to `net.allow_dostring_in` and `"userhooks"` to `net.allow_unsafe_api` without replacing either list. Keep it the last line: a `net.allow_dostring_in = {...}` line after it replaces the list and drops `"gui"`.

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
3. On the same PC: `npm run catcc:local` (the room on port 3002, source "DCS (localhost)"; it reads the token from your `Config\CATCC.lua`, so it never has to be typed), then `npm run dev` and open `/catcc`.
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

The room keeps plans, ops (deck call, launch queues, lights, formation), marshal assignments, flight ownership and seat claims in Supabase (`public.catcc_room_state`, per source and mission), so a deploy doesn't wipe them. Seats come back held for their users until they reconnect. `CATCC_PERSIST=0` turns this off.

## Pilot mod (PriFly launch clearance)

Lets PriFly hold each catapult shot until it clears it. Every pilot installs it on their own PC (one command, one UAC prompt):

```
powershell -ExecutionPolicy Bypass -File catcc-dcs\pilot\install.ps1
```

`-Server <host>` points it somewhere other than the squadron server (`-Server localhost` for local testing), `-Uninstall` removes it and puts the stock launch sequence back. DCS updates replace the patched `common.xml`: run it again after an update.

How it works:
- The Shooter seat (expanded layout), else the Air Boss, clears launches in PriFly. While someone holds either seat, every player jet on that carrier's deck is held until cleared: the pilot salutes, the shooter holds ("Shooter holding: awaiting PriFly clearance"), PriFly presses LAUNCH, the shot goes. With neither seat held nothing is held: launches go on the salute, as in stock DCS.
- The room sends the hook the names of the players held. The hook passes them to pilots' mods, which connect to the same port without a token (`PILOT`) and receive nothing else.
- The mod's cockpit device sets a spare model draw argument (997) that the patched launch sequence waits on after the salute.
- It fails open at every step: no seat, no room, no hook, no word for 12–15 s, or no mod means no hold.

Not verified in DCS yet: that draw argument 997 is free and settable on the Hornet (the hook logs what it reads back while held: `CATCC-PILOT ... gate argument 997 reads ...` in `dcs.log`), that `LoSetCommand` from the GUI hook reaches the cockpit device, and which PC runs the launch sequence in multiplayer.

## Another PC from a USB stick (crew test, slot picker, pilot mod)

For testing on a second PC without the repository: build the installer onto the stick on the development PC, then double-click on the other PC.

```
powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1          (or VS Code's "USB" status bar button)
powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1 -Check   (only says which drive it would use)
```

It takes no destination. It writes only onto the one drive that is removable, not the system drive, labelled exactly `USB DRIVE 01`, and has `CATCC-USB-TARGET.txt` at its root with the first line `CATCC USB target`. With no such drive, or more than one, it writes nothing. The stick is used for nothing else: each build first empties it, keeping only the sentinel file and Windows' own `System Volume Information` and `$RECYCLE.BIN`, then writes `Install CATCC.cmd` and `Uninstall CATCC.cmd` in the root and everything else in `CATCC-files`. If anything on the stick is a link (a junction or symbolic link), it deletes nothing. Every file is checked to be on the stick before it is deleted or written.

`CATCC-files` holds the crew test's and the pilot mod's installers with every file they read, in the repository's layout, so they run there unchanged. Both `.cmd` files run `CATCC-files\catcc-usb.ps1`, which finds that PC's `Saved Games\DCS` and DCS folder (DCS's registry entry), refuses while DCS is running, asks for admin once, runs the crew test's installer and then the pilot mod's (`-Uninstall` for the other), and waits for Enter. What they printed is kept in `CATCC-files\last-run.log`. Uninstall takes out everything they put in and returns the patched DCS files to stock.

The folder is built from the working tree as it is, so rebuild it after changing anything. `Scripts\CATCC\config.lua` (the room's settings) is left out. The native modules must be built first (the builder checks that each is newer than its source).
