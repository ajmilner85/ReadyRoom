# Reading the Hornet's own ICLS / ACLS indications

Question (2026-11-22): can CATCC read the ACLS/ICLS deviations from a client's F/A-18C cockpit, so
approach controllers see what the pilot sees: the ICLS localizer and glideslope needles, the ACLS
tadpole, and the ACL RDY / LND CHK / CMD CNT / 10 SEC cues?

## Verdict: partly

| Indication | Readable? | How |
|---|---|---|
| ICLS localizer and glideslope **deviation** | **Yes, as numbers**, through the standby attitude indicator's (SAI's) two ICLS pointers | cockpit draw arguments **211** (vertical pointer) and **212** (horizontal pointer) |
| ICLS needles on the HUD and the DDI ADI | **Only whether they are shown**, not where | indicator elements `ILS_Vert` / `ILS_Hor` (HUD), `ADI_Director_Indicator_*` (DDI ADI): drawn by a C++ controller, so no number |
| ACLS tadpole (HUD) | **Only whether it is shown** | indicator element `HUD_ACL_Tadpole`: position comes from a C++ controller |
| HUD cues: `10 SEC`, `TILT`, `DATA`, `W/O`; `ACL RDY`, `CPLD P/R`, `CPL ...` | **Yes, as text**, whenever the HUD is on | `list_indication(1)`, elements `Window5_cue`, `Window6_cue` |
| DDI ACL page: `ACL RDY` / `CMD CNT` / `LND CHK` / `NOT CMD` / `W/O` / `CHG CHNL`; `MODE 1` / `MODE 2` / `T/C` / `TILT`; `10 SEC` / `ADJ A/C` / `VOICE`; `ACL 1` / `ACL 2` / `ACL N/A`; commanded airspeed / altitude / rate of descent | **Yes, as text, only while a DDI shows the ACL page** | `list_indication(2)` (left DDI) or `(3)` (right DDI), elements `ACL_Window_R1`..`R5`, `ACL_Command_*` |
| ICLS channel and UFC/MAN switch | Yes | arguments **352** (channel selector, 20 positions, 0.05 a step), **353** (UFC/MAN) |
| ACLS-specific lamps | **None exist** on the Hornet: every ACLS cue is HUD / DDI symbology (no lamp for ACLS in `MainPanel/lamps.lua`) | - |

So the deviations that can be had as numbers are the ICLS ones, and only from the SAI. ACLS
deviation (the tadpole's offset) cannot be read; ACLS **status** can, as text. Three things are
unverified until the probe below runs in DCS: the SAI pointers' scale and their value with no
signal, whether `list_indication` lists non-text elements (the needles and the tadpole) at all, and
whether the GameGUI hook (the pilot mod's environment) can call `GetDevice(0)`.

## Where the numbers come from (DCS install, read 2026-11-22)

All paths under `Mods/aircraft/FA-18C/Cockpit/Scripts/` in the DCS World install.

- **Devices** (`devices.lua`): `ILS` = **52** ("AN/ARA-63D, airborne segment of US NAVY ACLS"),
  `DATALINK_INTERFACE` = 64, `LINK4` = **69**. The ILS device is `F18::avILS_ARA_63_F18`
  (`device_init.lua`, its Lua `Radio/ILS.lua` holds only an update rate). The SAI device
  (`F18::avSAI_F18`) is linked to `{"ICLS", devices.ILS}`: the SAI is fed by the ICLS receiver.
- **SAI draw arguments** (`mainpanel_init.lua` lines 291-321):
  - 205 pitch (input -pi/2..pi/2 rad -> -1..1), 206 bank (-pi..pi -> -1..1), 207 slip ball,
    208 rate of turn (-4.5..4.5 -> 1..-1), 209 OFF flag, 210 manual pitch adjust.
  - **211 `SAI_vertical_pointer`** and **212 `SAI_horisontal_pointer`**, both
    `CreateSimpleGauge` (input -1..1 passed straight through to output -1..1). The controller
    values are set in C++; the gauge itself does no scaling. By the real ARU-50/A's layout the
    vertical pointer is the localizer and the horizontal the glideslope. DCS-BIOS names them the
    same way: `SAI_POINTER_VER` 211, `SAI_POINTER_HOR` 212, range -1..1.
  - Not known from the files: how many degrees full scale is, the sign (fly-to direction), and
    what value parks a pointer out of view with no signal. The probe answers these.
- **ICLS controls** (`clickabledata.lua`): `pnt_352` "ILS Channel Selector Switch" (multiposition,
  20 positions, step 0.05), `pnt_353` "ILS UFC/MAN Switch", `pnt_131` UFC function ILS pushbutton.
- **HUD** (`Multipurpose_Display_Group/HUD_AVQ32/indicator/Pages/HUD_common.lua`):
  - lines 396-399: `ILS_Vert_Root` / `ILS_Hor_Root` placeholders on the velocity vector, driven by
    the controller `{"Common_IndicatorLandingSystem", 0 | 1, 51}`; the lines `ILS_Vert`, `ILS_Hor`.
  - line 522: `HUD_ACL_Tadpole`, controller `{"HUD_ACL_Tadpole", 0}`, on the velocity vector.
  - line 41: `Window5_cue`: `"", "10 SEC", "TILT", "DATA", "W/O"`.
  - line 45: `Window6_cue`: `"", "CPL ASL", "CPL BNK", "CPL SEQ%d", "CPL WYPT", "CPL TCN", "CPLD HDG", "CPLD P/R", "ACL RDY"`.
- **DDI ADI** (`.../Pages/MPD/ADI_SPIN/ADI.lua` lines 129-130): `ADI_Director_Indicator_Vert` and
  `ADI_Director_Indicator_Hor_PH`, the same `Common_IndicatorLandingSystem` controller.
- **DDI ACL page** (`.../Pages/MPD/ACL.lua`): `ACL_Window_R1` `"", "ACL RDY", "CMD CNT", "LND CHK", "NOT CMD", "W/O", "CHG CHNL"`;
  `R2` `"", "MODE 1", "MODE 2", "T/C", "TILT"`; `R3` `"", "10 SEC", "ADJ A/C", "VOICE"`;
  `R4` `"", "ACL 1", "ACL 2", "ACL N/A", "TEST"`; `R5` `"UTM FAIL"`; `ACL_Command_Airspeed`
  (`CMD A/S %3d`), `ACL_Command_Altitude` (`CMD ALT %5d`), `ACL_Command_RateOfDescent` (`%7d`).
  The HSI's PB 4 is `ILS` and the backup HSI has `ACL` (`HSI_MAIN.lua` 370, `HSI_BACKUP_COMMON.lua` 43).
- **Indicator numbers for `list_indication(n)`** (registration order in `device_init.lua` 796-872,
  counted from 0): 0 controls indicator, **1 HUD**, **2 left DDI**, **3 right DDI**, 4 AMPCD,
  5 IFEI, 6 UFC. DCS-BIOS reads the HUD as `parse_indication(1)` and the IFEI as 5, which agrees.

Why the HUD needles and the tadpole give no number: an indicator element's position is set by its
controller inside the module's C++ code each frame. `list_indication` dumps the current page's
elements by name with their text (DCS-BIOS uses this for the UFC, IFEI and HUD text), so a
stroke line has no text to report. Whether non-text elements appear in the dump at all (which would
tell "needles shown" from "not shown") is one of the probe's questions.

## Which Lua environment can read them

| Environment | Runs where | Cockpit access |
|---|---|---|
| **Export** (`Saved Games\DCS\Scripts\Export.lua`) | every client, for its own aircraft | `GetDevice(0):get_argument_value(n)`, `list_indication(n)`, `list_cockpit_params()` (the methods DCS-BIOS, Helios and SRS rely on), plus the `Lo*` functions |
| **GameGUI hook** (`Scripts\Hooks\*.lua`: the CATCC pilot mod) | every client | The GUI's `Export` table on this PC lists `GetDevice`, `GetIndicator`, `LoGetGlideDeviation`, `LoGetSideDeviation`, `LoGetAircraftDrawArgumentValue` and the rest (logged by the pilot hook, `dcs.log` 2026-11-22 13:20:09: "GUI Export table: GetClickableElements, GetDevice, GetIndicator, ..."). `list_indication` and `list_cockpit_params` are not in that table. `net.dostring_in('export', ...)` is not allowed by this PC's `autoexec.cfg` (it allows `server` and `gui` only), and the pilot hook already avoids it. |
| **Mission scripting** (server) | the server | No cockpit access at all. `Unit:getDrawArgumentValue` reads the **external** model's arguments, which have no needles (external arg 212 is even a different thing: the refuelling probe light). |

The pilot hook today reads `LoGetAircraftDrawArgumentValue` (external model arguments: launch bar
85, chocks 23, salute 520/521). Cockpit arguments need `GetDevice(0):get_argument_value(n)`, a
different call. Whether `Export.GetDevice(0)` in the GUI returns the live cockpit is unverified: the
probe runs in both environments to find out.

### Server export settings

`serverSettings.lua` has `allow_ownship_export`, `allow_object_export`, `allow_sensor_export`.
They gate the `Lo*` functions for clients (Hoggit's export page): **ownship** gates
`LoGetSelfData`, `LoGetGlideDeviation`, `LoGetSideDeviation`, `LoGetNavigationInfo`,
`LoGetControlPanel_HSI`, `LoGetMCPState`, `LoSetCommand` and the other own-aircraft data;
**object** gates `LoGetWorldObjects` and `LoGetObjectById`; **sensor** gates the radar / target
functions. None of the three lists `GetDevice(...):get_argument_value` or `list_indication`; those
are the cockpit device API, which home-cockpit tools use on public servers. The stock
`Scripts/Export.lua` comment block (DCS install, lines 1250-1255) claims `GetDevice` is "not in the
external Saved Games Export.lua", which contradicts both its own example at line 76 and what
DCS-BIOS does; the probe checks it.

Practical consequence: the SAI arguments and the HUD / DDI text should be readable whatever the
server's export settings. `LoGetGlideDeviation` / `LoGetSideDeviation` need ownship export (on in
this PC's own `serverSettings.lua`; unknown for the squadron server), and in any case are the
generic flight-model ILS values, probably not the Hornet's ICLS. The probe logs
`LoIsOwnshipExportAllowed()` so we see the squadron server's setting from the client side.

## Does DCS's Hornet compute ACLS?

Yes, both systems are modelled:

- **ICLS** (SPN-41 / AN/ARA-63): the carrier needs **Activate ICLS** (channel 1-20) as a mission
  action (`MissionEditor/modules/me_action_db.lua` `ActivateICLS`, line 2751). The pilot selects
  ILS on the UFC, turns it on, enters the channel, and selects ILS on the HSI (PB 5 in the guide,
  PB 4 in the scripts) to get the needles on the HUD (Hornet guide EN, "Instrument Carrier Landing
  System (ICLS)", pp. 150-151). The SAI pointers follow the ICLS receiver whatever the HUD shows.
- **ACLS** (SPN-46 over Link 4A): the Hornet has the ACL page, the HUD tadpole, ACL RDY, 10 SEC and
  the coupled modes (Mode 1 hands-off, 1A, Mode 2 tadpole only), added by ED in spring 2022; ED
  said ACLS is for Case III recoveries. The carrier needs **Activate Link 4** (frequency 331-399
  MHz) and **Activate ACLS**, both only offered for carrier units with the `Link4` / `ACLS`
  attributes (`me_action_db.lua` 2993-3142); forum reports say a Supercarrier carrier, and that
  TACAN and ICLS should be on as well. The pilot tunes the Link 4 frequency and calls up the ACL
  page on a DDI. Forum threads from 2022-2023 report the tadpole not always appearing.

So for the deviations CATCC wants as numbers (ICLS), the mission must have Activate ICLS on the
carrier and the pilot must have ICLS on and tuned. For ACLS status text, the mission also needs
Activate Link 4 and Activate ACLS (Supercarrier), and the pilot the Link 4 frequency.

## Getting it to CATCC (proposed, not built)

The pilot mod's GameGUI hook (`catcc-dcs/pilot/Scripts/Hooks/CATCC-pilot-hook.lua`) already keeps
a TCP line to the server hook (`PILOT`, then `SALUTE`, `EV taxi|lb1|lb0`, `MSG` lines), and the
server hook relays pilot events to the room as `{"type":"pilotev",...}`. The ICLS data would ride
on that line.

1. **Reader.**
   - *If the probe shows `Export.GetDevice(0)` works in the GUI:* the pilot hook reads args 211 /
     212 / 352 / 353 itself. HUD text (`list_indication`) is then not available there; only the SAI
     numbers are.
   - *Otherwise, or to get the HUD / DDI text too:* a small export-environment script, loaded by one
     `dofile` line at the end of `Saved Games\DCS\Scripts\Export.lua` (the way Tacview, SRS and
     DCS-BIOS install), chained to the existing `LuaExportAfterNextFrame`, sends one UDP datagram
     at 2-4 Hz to `127.0.0.1` on a local port the pilot hook listens on. The pilot install script
     would add that line (and remove it on uninstall). Export.lua stays sending to the local PC only.
2. **When.** Only while the aircraft is an F/A-18C and airborne, and the values are worth sending:
   ICLS on (SAI pointers away from their rest value), or a Window5 / Window6 / ACL page cue present.
   At 2 Hz that is a ~100-byte line, well under the server hook's limits; it needs its own rate
   limit rather than the 20-per-10-s event counter the `EV` lines share.
3. **Line.** `ICLS <player name><TAB>loc=<-1..1>,gs=<-1..1>,ch=<1..20>,hud5=<text>,hud6=<text>,acl=<R1>|<R2>|<R3>|<R4>`
   from the pilot hook; the server hook relays it to authenticated clients as
   `{"type":"icls","p":"<name>","loc":..,"gs":..,"ch":..,"cues":[..]}` (the same path as `pilotev`).
4. **Room and app.** The room attaches it to that player's track; the Approach / Final display shows
   the pilot's own needles beside CATCC's computed glidepath and lineup (which come from the
   aircraft's position and need nothing from the cockpit), and the cues as text.

What it can never show: the tadpole's position (ACLS deviation), and the ACL page cues while the
pilot has another page up.

## Probe

`catcc-handoff/research/hornet-acls/probe-export.lua`: read-only, logs to `dcs.log` (tag
`CATCC-ACLS-PROBE`) and writes one dump file. Not installed; the user installs it by hand and
removes it afterwards.

**Install (both environments, for one test flight):**

1. Copy `probe-export.lua` to `Saved Games\DCS\Scripts\catcc-acls-probe.lua`.
2. Copy it again to `Saved Games\DCS\Scripts\Hooks\catcc-acls-probe.lua`.
3. Add this line at the very end of `Saved Games\DCS\Scripts\Export.lua` (after the Tacview line):
   `local catccProbeLfs = require('lfs'); dofile(catccProbeLfs.writedir() .. 'Scripts/catcc-acls-probe.lua')`

**Flight:** a mission with a carrier that has Activate ICLS (and, to test ACLS text, a Supercarrier
with Activate Link 4 and Activate ACLS), Case III or night. In the Hornet: ICLS on and tuned to the
carrier's channel, ILS on the HSI; fly an approach from about 10 NM, wander left and right of the
lineup and above and below the glideslope; if ACLS is set up, tune Link 4 and put the ACL page on a
DDI until ACL RDY and the tadpole appear. Single player is fine for the first run; a second run as
a client on the squadron server shows that server's export settings.

**What the user sees on screen:** nothing new. The probe draws and says nothing; the SAI's two
pointers, the HUD needles and the ACL cues behave as DCS always draws them. Afterwards I read
`dcs.log` and `Logs\catcc-acls-probe-dump.txt`.

**Remove:** the two copied files and the Export.lua line.

**What the log answers:** the first line per environment says which functions exist there
(`GetDevice`, `list_indication`, ...); the 0.5 s lines give args 211 / 212 against the HUD needle
presence, so the pointers' rest value, scale and sign follow from the wandering; the 5 s lines show
every cockpit argument that moved (anything else carrying ICLS / ACLS) and the landing-aid cockpit
params; the dump shows the full `list_indication` format, i.e. whether non-text elements are listed.

## Sources

- DCS World install, `Mods/aircraft/FA-18C/Cockpit/Scripts/`: `devices.lua`, `device_init.lua`,
  `mainpanel_init.lua`, `clickabledata.lua`, `MainPanel/lamps.lua`,
  `Multipurpose_Display_Group/HUD_AVQ32/indicator/Pages/HUD_common.lua`,
  `.../Pages/MPD/ACL.lua`, `.../Pages/MPD/ADI_SPIN/ADI.lua`, `.../Pages/MPD/HSI/*.lua`; `Doc/DCS FA-18C Early Access Guide EN.pdf` (ICLS chapter);
  `Scripts/Export.lua` (stock comments); `MissionEditor/modules/me_action_db.lua`.
- `Saved Games\DCS\Logs\dcs.log` (the pilot hook's "GUI Export table" line), `Config\autoexec.cfg`,
  `Config\serverSettings.lua`.
- DCS-BIOS F/A-18C module, `SAI_POINTER_VER` 211 / `SAI_POINTER_HOR` 212, `parse_indication(1)` for the HUD:
  https://github.com/DCS-Skunkworks/dcs-bios/blob/main/Scripts/DCS-BIOS/lib/modules/aircraft_modules/FA-18C_hornet.lua
- Hoggit wiki, DCS export (which functions each export setting gates): https://wiki.hoggitworld.com/view/DCS_export
- ED forum, "F/A-18C ACLS preview/tutorial" (ED, 2022: Mode 1 / 1A / 2, Case III only, Link 4 on the Supercarrier): https://forum.dcs.world/topic/299441-fa-18c-acls-previewtutorial
  (the forum refuses automated fetches; the forum points here come from search-result excerpts, not the full threads)
- ED forum, "ACLS questions after YT video" (carrier attributes TCN / ICLS / Link 4 / ACLS): https://forum.dcs.world/topic/299446-acls-questions-after-yt-video
- ED forum, "ACLS data link 4": https://forum.dcs.world/topic/301378-acls-data-link-4 ; "Status of ACLS in current build": https://forum.dcs.world/topic/307083-status-of-acls-in-current-build
- ED forum, "Why player export disabled on so many servers": https://forum.dcs.world/topic/152175-why-quotplayer-exportquot-disabled-on-so-many-servers
