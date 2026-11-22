# CATCC Kit for Figma

A Figma development plugin that builds a **CATCC Kit** page in the open file from the CATCC UI kit (the app's `/catcc/kit` page), so new CATCC features can be sketched from the real components.

When it runs it makes:

- **Variables**: a `CATCC` collection (mode `Dark`) with every CATCC colour (`surface/…`, `border/…`, `text/…`, `accent/…`, `status/…`, `scope/…`).
- **Text styles**: `CATCC/Label`, `CATCC/Mono/Row`, `CATCC/Title/Logo`, `CATCC/Scope/Tag` and the others in `src/components/catcc/kit/tokens.ts`.
- **A page, "CATCC Kit"**: colour swatches and type samples, then one section per kit section (Header & seats, Controls, Panels, Sidebar panels, Strips & rows, Scope, Contacts & tags, Overlays & dialogs, Icons). Each component is a Figma **Component**, and a component with states is a **Component Set** with variant properties (for example `Control/Tool button` → `state=off | on | float | open`, `Contact/Symbol` → `shape`, `side`, `mark`).
- Fills and strokes that match a CATCC colour are bound to its variable. Text that matches a CATCC text style uses it.
- Flex rows and columns become auto layout, so buttons, rows and panels resize as you edit them. Scope graphics (rings, symbols, tags) are vector layers. Their lettering is real text in IBM Plex Mono.

Running it again replaces the page's contents and updates the variables and styles in place. Instances you have already placed elsewhere in the file keep pointing at the old components, which are deleted. Detach them, or keep the kit in its own file and publish it as a library.

## Fonts

The kit uses **Saira** (300–700) and **IBM Plex Mono** (400–700). Both are Google Fonts, which Figma has built in, so nothing needs installing for Figma in the browser or the desktop app. If your Figma is set up to use only local fonts, install them:

- Saira: https://fonts.google.com/specimen/Saira
- IBM Plex Mono: https://fonts.google.com/specimen/IBM+Plex+Mono

If a font can't be loaded, the plugin falls back to the family's Regular, then to Inter.

## Import and run (Figma desktop app)

1. Open Figma **desktop**. Development plugins can only be imported in the desktop app.
2. Open or create the design file to sketch in.
3. Menu **Plugins → Development → Import plugin from manifest…** and pick `figma/catcc-kit/manifest.json` from this repo.
4. Run it: **Plugins → Development → CATCC Kit**. When it finishes, a notice says how many components it made, and the view moves to the new page.

To sketch, drag components from the **Assets** panel (or copy them from the CATCC Kit page) onto your own page, then switch variants in the right-hand panel.

## Regenerating

`code.js` and `kit.json` are generated. Don't edit them. After changing the kit (`src/components/catcc/kit/`) or the CATCC styles it uses:

```
node scripts/catcc/figma-kit.gen.ts
```

The generator serves the kit page from its own Vite server on a free port, opens it in a headless Chromium (playwright-core and an ms-playwright Chromium; set `PWCORE` / `CHROME` if they aren't in the usual places), reads each `data-figma` specimen as the browser lays it out (`scripts/catcc/figma-kit/serialize.js`), and writes `kit.json` and `code.js` (`plugin.cjs` with the data in front). It needs the network for the Google fonts. It reads no `.env` and gives the app's Supabase client an address nothing listens on, so it never reaches a live service. `--shot <dir>` also saves screenshots of the kit page.

`src/components/catcc/kit/figmaKit.test.ts` fails when `kit.json` is missing a specimen, has the wrong tokens, or `code.js` is out of date. It also runs the plugin against a stand-in for the Figma API.

## Files

| File | |
|---|---|
| `manifest.json` | the plugin manifest (`documentAccess: dynamic-page`, no network) |
| `plugin.cjs` | the plugin's source (plain JS; its helpers are unit-tested) |
| `kit.json` | generated: tokens and every specimen's node tree |
| `code.js` | generated: what Figma runs (`kit.json` + `plugin.cjs`) |
