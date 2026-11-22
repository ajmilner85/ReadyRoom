# CATCC Kit for Figma

Two ways to get the CATCC UI kit (the app's `/catcc/kit` page) into Figma, both generated from the same `kit.json`:

- **SVG import (any plan, including the free Starter plan).** `svg/CATCC Kit.svg` is the whole kit on one sheet, laid out by section, and `svg/parts/` has one SVG per component and variant. Drag one into a file and you get editable layers: text stays text in Saira / IBM Plex Mono, and boxes keep their fills, borders and corner radii. You turn the pieces into components yourself, which takes a few clicks (below).
- **The development plugin (`manifest.json`, `code.js`).** Builds a page of real Components and Component Sets with variant properties, auto layout, colour Variables and text styles in one run. Figma's docs list development plugins for all plans in the desktop app, but it was reported not to run on a free account, so the SVG route is the one for Starter (see *Plans* at the end).

## Free plan: the SVG sheet

### Bring it in

1. In the Figma desktop app, open a **draft**: the file browser's **Drafts** → **New design file**. The Starter plan allows unlimited drafts, but only 3 design files in a team project.
2. Drag `figma/catcc-kit/svg/CATCC Kit.svg` from Explorer onto the canvas. (Or use **Place image**, Ctrl+Shift+K, and choose the file. You can also open the SVG in a text editor, copy all of it, and paste it on the canvas with Ctrl+V.)
3. You get one frame, **CATCC Kit**, on a dark background:
   - **Section/Tokens**: a swatch for every CATCC colour, named for its token (`surface/panel`, `accent/orange`, …), and a sample of every text style.
   - One group per kit section (**Section/Header & seats**, **Section/Controls**, …, **Section/Icons**).
   - In each section there is a group per component, named like the app's kit (`Control/Tool button`). A component with states has one layer per variant, named the way Figma names variants (`state=on`, `shape=jet, side=own, mark=none`). A caption with the component's name sits beside each group and isn't part of it.

   A single piece: drag a file from `svg/parts/` instead, for example `Control - Tool button - state=on.svg`. Its layer is named `Control/Tool button / state=on`.

### Make components (once per file)

- **One component:** select its group (for example `Control/Toolbar`) and press **Ctrl+Alt+K** (or **Create component** at the top of the right panel). It becomes a component with the same name.
- **A component with variants:** expand the component's group in the Layers panel, select all its variant layers (`state=off`, `state=on`, …), then use the arrow next to **Create component** in the right panel → **Create multiple components**. Then, with the new components still selected, choose **Combine as variants**. Figma reads properties from layer names in the `prop=value` form, so you get a set with a `state` property (`off | on | float | open`). Rename the set to the group's name (`Control/Tool button`).
- **Colours:** on the Starter plan you can make local styles. Select a swatch and click **+** next to Fill (*Create style*), giving it the swatch's name.
- Do this in the draft that holds the sheet. Starter has no team libraries, so components can't be shared between files. Keep your sketches in the same draft as the components.

### Sketch

Add a page or frame for the new feature. Drag components from **Assets** (Alt+2) or copy them from the sheet (Ctrl+C / Ctrl+V), and switch variants in the right panel. Double-click any text to change it. The pieces are drawn at the app's real pixel sizes, so a frame of 1440×900 or 1520×860 (`Layout/Approach Final`) has the app's scale.

### What the SVG route doesn't carry

- No auto layout: rows, buttons and panels are fixed groups. They don't resize as you edit text. (The plugin makes auto layout.)
- No variants or component properties until you combine them as above, and no colour Variables or text styles. Text has the right font, size, weight, tracking and colour set directly.
- No shadows (overlays, dialogs, popovers). Box borders become separate strips where only some sides have one.
- Text that wraps in the app is one text layer with a line per line. It won't re-wrap when you edit it.
- Boxes and scopes that hide what overflows them come in as clipped groups (a mask group in Figma).
- What we have checked: the files are valid SVG, and they render like the kit page in Chromium. What Figma's SVG import does with them we haven't checked in Figma itself. Its known quirks (opacity on `<text>`, letter spacing on `<tspan>`, `em` font sizes) are avoided: colours carry their own `fill-opacity`, letter spacing is on the `<text>`, and sizes are in px. If a layer name doesn't come through, the name is still the group's `id` in the file.

## Paid seat: the development plugin

When it runs, the plugin makes:


- **Variables**: a `CATCC` collection (mode `Dark`) with every CATCC colour (`surface/…`, `border/…`, `text/…`, `accent/…`, `status/…`, `scope/…`).
- **Text styles**: `CATCC/Label`, `CATCC/Mono/Row`, `CATCC/Title/Logo`, `CATCC/Scope/Tag` and the others in `src/components/catcc/kit/tokens.ts`.
- **A page, "CATCC Kit"**: colour swatches and type samples, then one section per kit section (Header & seats, Controls, Panels, Sidebar panels, Strips & rows, Scope, Contacts & tags, Overlays & dialogs, Layouts, Icons). Each component is a Figma **Component**, and a component with states is a **Component Set** with variant properties (for example `Control/Tool button` → `state=off | on | float | open`, `Contact/Symbol` → `shape`, `side`, `mark`). `Layout/Approach Final` is the whole Approach / Final seat (the live FinalView); its precision displays, toolbar, two-column sidebar and bolter slot are also components of their own, picked out of it.
- Fills and strokes that match a CATCC colour are bound to its variable. Text that matches a CATCC text style uses it.
- Flex rows and columns become auto layout, so buttons, rows and panels resize as you edit them. Scope graphics (rings, symbols, tags) are vector layers. Their lettering is real text in IBM Plex Mono.

Running it again replaces the page's contents and updates the variables and styles in place. Instances you have already placed elsewhere in the file keep pointing at the old components, which are deleted. Detach them, or keep the kit in its own file and publish it as a library (team libraries need a paid plan).

## Fonts

The kit uses **Saira** (300–700) and **IBM Plex Mono** (400–700). Both are Google Fonts, which Figma has built in, so nothing needs installing for Figma in the browser or the desktop app. If your Figma is set up to use only local fonts, install them:

- Saira: https://fonts.google.com/specimen/Saira
- IBM Plex Mono: https://fonts.google.com/specimen/IBM+Plex+Mono

If a font can't be loaded, the plugin falls back to the family's Regular, then to Inter.

## Import and run the plugin (Figma desktop app)

1. Open Figma **desktop**. Development plugins can only be imported in the desktop app.
2. Open or create the design file to sketch in.
3. Menu **Plugins → Development → Import plugin from manifest…** and pick `figma/catcc-kit/manifest.json` from this repo.
4. Run it: **Plugins → Development → CATCC Kit**. When it finishes, a notice says how many components it made, and the view moves to the new page.

To sketch, drag components from the **Assets** panel (or copy them from the CATCC Kit page) onto your own page, then switch variants in the right-hand panel.

## Regenerating

`code.js`, `kit.json` and `svg/` are generated. Don't edit them. After changing the kit (`src/components/catcc/kit/`) or the CATCC styles it uses:

```
node scripts/catcc/figma-kit.gen.ts
```

That writes all three. `node scripts/catcc/figma-kit-svg.ts` redoes only the SVGs from the current `kit.json`. It's a plain conversion (`scripts/catcc/figma-kit/svg.ts`) and needs no browser.

The generator serves the kit page from its own Vite server on a free port, opens it in a headless Chromium (playwright-core and an ms-playwright Chromium; set `PWCORE` / `CHROME` if they aren't in the usual places), reads each `data-figma` specimen as the browser lays it out (`scripts/catcc/figma-kit/serialize.js`), and writes `kit.json` and `code.js` (`plugin.cjs` with the data in front). It needs the network for the Google fonts. It reads no `.env` and gives the app's Supabase client an address nothing listens on, so it never reaches a live service. `--shot <dir>` also saves screenshots of the kit page.

`src/components/catcc/kit/figmaSvg.test.ts` fails when `svg/` isn't what `kit.json` converts to. It also checks that every SVG is well formed, every specimen has a file and a place on the sheet, layers carry the component names, and every text run is a `<text>` in the kit's fonts. `src/components/catcc/kit/figmaKit.test.ts` fails when `kit.json` is missing a specimen, has the wrong tokens, or `code.js` is out of date. It also runs the plugin against a stand-in for the Figma API.

## Files

| File | |
|---|---|
| `manifest.json` | the plugin manifest (`documentAccess: dynamic-page`, no network) |
| `plugin.cjs` | the plugin's source (plain JS; its helpers are unit-tested) |
| `kit.json` | generated: tokens and every specimen's node tree |
| `code.js` | generated: what Figma runs (`kit.json` + `plugin.cjs`) |
| `svg/CATCC Kit.svg` | generated: the whole kit on one sheet, for any plan |
| `svg/parts/*.svg` | generated: one SVG per component and variant |

## Plans: what the free (Starter) plan allows

From Figma's help centre (checked 2026-11-22):

- Development plugins: "All plans", "Requires the Figma desktop app" ([help: development plugins](https://help.figma.com/hc/en-us/articles/360042786733)). Running plugins: a Starter seat can run them in Figma Design, FigJam, Slides and Buzz, but **not in Dev Mode** ([help: who can use plugins](https://help.figma.com/hc/en-us/articles/360042532714)).
- Starter limits: 3 design files in the team, but unlimited drafts. No team libraries. No Dev Mode. ([help: Starter plan permissions](https://help.figma.com/hc/en-us/articles/13838684089751))
- A free-plan block on the plugin is therefore probably one of these: the file is open in Dev Mode (Shift+D switches back to Design); you're in the browser rather than the desktop app; a fourth design file in the team hits the 3-file limit; or you tried to publish the kit as a library. To try the plugin on Starter anyway, run it in a **draft**, in **Design** mode, in the desktop app.
- Components and variants are on all plans ([help: components](https://help.figma.com/hc/en-us/articles/360038662654)). SVG import is on all plans and makes vector layers, not an image ([help: import files](https://help.figma.com/hc/en-us/articles/360040028034)).
- Other routes: publishing this plugin to Community is free on any plan, but it makes the plugin public and review takes up to two weeks ([help: publish plugins to Community](https://help.figma.com/hc/en-us/articles/360042293394)). html.to.design's free tier allows about 10 imports per 30 days ([html.to.design](https://html.to.design/docs/free-features)). A `.fig` file can't be generated: the format isn't documented.
