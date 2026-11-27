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

The installer also puts in the lookalike Hornet (`Mods\tech\CATCC-Lookalike`). It stands on a deck spot from the moment a player takes the slot there until his jet is on the spot, so nobody on the deck sees the parked aircraft vanish first. Every PC in a session needs it, the server's too. It is deck equipment drawn with the Hornet's own model, in two kinds that get their paint differently:
- `CATCC_HornetLook` uses the Hornet's own liveries (`livery_entry`).
- `CATCC_HornetLookF` uses liveries of its own in `Saved Games\DCS\Liveries\CATCC_HornetLookF`. `lookalike-liveries.ps1` makes one there for each Hornet livery in `Saved Games\DCS\Liveries\FA-18C_hornet`, pointing at that livery's textures, and the installer runs it. Run it again (DCS closed) after adding or renaming a Hornet livery.

DCS paints only the second kind (the looks run of 2026-11-24), so that is the one the slot picker uses. The crew test's F10 item "CATCC demo: lookalike: swap the nearest aircraft" still shows both in turn.

## Another PC from a USB stick (crew test, slot picker, pilot mod)

For testing on a second PC without the repository: build the installer onto the stick on the development PC, then double-click on the other PC.

```
powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1          (or VS Code's "USB" status bar button)
powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1 -Check   (only says which drive it would use)
```

It takes no destination. It writes only onto the one drive that is removable, not the system drive, labelled exactly `USB DRIVE 01`, and has `CATCC-USB-TARGET.txt` at its root with the first line `CATCC USB target`. With no such drive, or more than one, it writes nothing. It does not empty the stick: it replaces only what it writes itself. It first deletes the older build (the `CATCC-files` folder, `Install CATCC.cmd`, `Uninstall CATCC.cmd` and `CATCC test script.txt`), then writes them again. Everything else on the stick stays. If anything it would delete is a link (a junction or symbolic link), it deletes nothing. Every file is checked to be on the stick before it is deleted, moved or written.

`CATCC-files` holds the crew test's and the pilot mod's installers with every file they read, in the repository's layout, so they run there unchanged. Both `.cmd` files run `CATCC-files\catcc-usb.ps1`, which finds that PC's `Saved Games\DCS` and DCS folder (DCS's registry entry), refuses while DCS is running, asks for admin once, runs the crew test's installer and then the pilot mod's (`-Uninstall` for the other), and waits for Enter. Uninstall takes out everything they put in and returns the patched DCS files to stock.

A newer version can be installed over an older one without uninstalling first. Each USB install keeps a list of the files it put in, in `Saved Games\DCS\Config\CATCC-usb-installed.txt`. The next install deletes any file on that list that it did not write itself, and an uninstall deletes whatever on the list is still there. Only the places CATCC writes to are looked at: `Scripts\CATCC`, `Scripts\Hooks\CATCC-*.lua`, `Config\CATCC-*.lua`, `Mods\tech\CATCC-*`, `Mods\aircraft\CATCC-*`, `Liveries\CATCC_*`, and DCS's `dxgui\skins\fonts\CATCC-*.ttf`. A file there counts as installed when the run wrote it (new, or a different length or time), or when it is the same as one of the package's files. A file no install wrote, such as a server's `Scripts\CATCC\config.lua`, is never on the list, so it is never deleted. The first install that finds no list cannot know an earlier version's files; from then on the list is kept.

Every log goes to the stick's `CATCC Logs` folder, which the builder makes and never deletes from. Each build, install and uninstall gets its own folder there, named `<date time> build|install|uninstall on <PC>`. It holds what that run printed (`build.log`, `install.log`, `uninstall.log`). An install or uninstall also first copies that PC's logs into its folder, as they were before the run: `Logs\dcs.log`, `dcs.log.old`, `catcc-*.log`, `catcc-*.lua`, and the last week's `dcs.*.crash`. For a `catcc-*.log` over 16 MB, only its last 16 MB are copied. The crew test's log grows from run to run, so those 16 MB hold the latest runs. When a build finds the older layout's logs (`CATCC-files\last-run.log`, `CATCC-files\logs\*`), it moves them into `CATCC Logs` before deleting `CATCC-files`.

The folder is built from the working tree as it is, so rebuild it after changing anything. `Scripts\CATCC\config.lua` (the room's settings) is left out. The live logs' settings (`Config\CATCC-logs.lua`, below) go in when this PC has them, so the other PC's sessions send their logs too. That puts SDOBot's log token on the stick. The native modules must be built first (the builder checks that each is newer than its source).

## Live logs (every CATCC PC's DCS logs, read on the development PC)

While DCS runs, `Scripts\CATCC\catcc_logs.lua` sends that PC's `Logs\dcs.log` and every `Logs\catcc-*.log` to SDOBot. The crew test's installer puts it in, and `Scripts\Hooks\CATCC-logs-hook.lua` loads it. SDOBot (`POST /api/catcc/logs`) keeps them in Supabase (`public.catcc_log_chunks`), and they are read back with:

```
node scripts/catcc/catcc-logs.mjs                         the last sessions: PC, first and last chunk, files
node scripts/catcc/catcc-logs.mjs get latest [--pc NAME]  one session's files, put together, in documentation/catcc-logs/
```

- **Off unless `Saved Games\DCS\Config\CATCC-logs.lua` is there.** The crew test's installer copies it from `catcc-dcs\Config\CATCC-logs.lua`. That file is gitignored and holds SDOBot's token. `scripts\catcc\catcc-logs-setup.ps1` writes it with a new token and adds the same token to `.env.local` as `CATCC_LOG_TOKEN`. With `-Fly`, it also stages the token as SDOBot's Fly secret. `Config\CATCC-logs.example.lua` shows the format.
- **Addresses.** It tries `http://readyroom.fly.dev/api/catcc/logs`, then `http://127.0.0.1:3001/api/catcc/logs` (the local backend). It keeps the first one that stores a chunk until that one fails. It uses http only, because DCS's Lua has no TLS, so the logs cross the internet unencrypted. The user's profile folder is replaced by `%USERPROFILE%` before sending.
- **What goes.** `dcs.log` is sent from its start. A `catcc-*.log` is sent from where it stood when DCS started, because those files are added to from run to run. Chunks are whole lines, 48 KB at most, at most every 2 s. Each carries the PC's name, a session id made when DCS starts, the file name and the byte offset. At most 16 MB of each file is sent per session. `Logs\catcc-logs-sent.lua` keeps what was sent. At the next start, the rest of the previous session goes under that session's id, with `dcs.log` read from `dcs.log.old`: the last lines before a crash, or what was written after the last send.
- **Never in DCS's way.** It sends one request at a time, non-blocking, a little each tick. DCS's GUI update drives it (it runs in the main menu too), and `onSimulationFrame` if that is missing. Addresses are looked up (which blocks) only when DCS starts, when a mission loads, or outside a mission. A failure tries the next address. After every address has failed, it waits 5, then 15, then 60 s. Nothing is lost while the file is there.
- **SDOBot.** The route is off (503) until `CATCC_LOG_TOKEN` is set. Chunks older than 14 days are deleted. The table comes from `supabase/migrations/catcc/20261126_catcc_log_chunks.sql`.
