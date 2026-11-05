# Design decisions log

Record small design calls made during implementation so they can be folded back into the design project.

| Date | Page / component | Decision | Folded back into design? |
|---|---|---|---|
| 2026-11-05 | Icons | The prototype ships ~37 hand-drawn line icons (no library). They are ported verbatim into `primitives/Icon.tsx`; ~75 more icons the app needs (chevrons, alert, eye, lock, bell, skull, flame, thumbs, etc.) were drawn in the same grammar (24 grid, 1.7/1.8 stroke, round caps). `lucide-react` is retired page by page. All icons are visible on the UI Kit page. | No |
| 2026-11-05 | Tokens | `--rr-accent-weak` is derived with `color-mix(var(--rr-accent) 15%/10%)` so squadron branding only overrides `--rr-accent`. Added `--rr-purple` (#8B5CF6, used by IP badges/avatars in the prototype) and `--rr-overlay`. | No |
| 2026-11-05 | Branding | Accent = signed-in user's squadron `color_palette.primary` from the DB (VFA-161 is `#ff4715` in the DB vs `#F15822` in the mockup; DB wins). Very dark primaries (luminance < .08, e.g. VFA-44 `#005774`) are lifted 38% toward white in dark theme so accent text stays legible; very light ones darkened in light theme. | No |
| 2026-11-05 | Settings > Appearance | Added a Navigation layout picker (three preview cards) next to Theme, and made the prototype's Accent swatches a real per-user override with a "Squadron" default option. Theme, nav layout and accent persist in `user_profiles` preferences JSON (`appearance.theme/navLayout/accentColor`), no migration. | No |
| 2026-11-05 | Shell / nav | Real nav has more modules than the mockup. Placement: Kneeboard → FLIGHT OPS; My Training → SQUADRON (after Training); UI Kit → ADMIN (settings permission). Nav items stay permission-gated as before. | No |
| 2026-11-05 | Shell / context strip | The "Discord synced" pill shows the user's Discord bot environment (green "Discord" for production, amber "Discord · Dev bot"), since there is no global sync state. Presence avatars only appear when a page publishes presence (Mission Prep). | No |
| 2026-11-05 | Shell / user | Labeled rail footer, compact rail and command bar avatar open a popover menu (My dossier, Settings, Sign out) to replace the old sign-out button. | No |
| 2026-11-05 | Qualification badge | Qualification colours stay admin-configured (qualifications table). Badge renders as the kit's tinted chip: 18% tint background, colour mixed 62% with `--rr-text` for the label, 1px inset ring, so dark admin colours stay readable in dark theme. | No |
| 2026-11-05 | Status chips | `statusTone()` maps status names to tones: active→good, LOA/leave/reserve→warn, provisional/probation/cadet→info, retired/removed/dismissed→bad, else muted. | No |
