// THE FLIGHT DECK AS A PICTURE FOR DCS (the slot picker, catcc-dcs/Scripts/CATCC/crewtest_slots.lua): PriFly's own
// deck drawing (src/components/catcc/prifly/DeckDrawing.tsx, as the PriFly page draws it: its default layers),
// rendered to SVG here and to PNG by a headless Chromium (DCS's window toolkit shows PNG, not SVG).
//   npx vite-node scripts/catcc/deck-picture.tsx
// writes catcc-dcs/Scripts/CATCC/catcc_deck.svg and catcc_deck.png. The picture spans PriFly's DECK_VIEWBOX
// (x forward from -172 m, z to starboard from -47 m: 348 x 96 m) at 4 pixels a metre: 1392 x 384.
// The PNG needs playwright-core and a Chromium of ms-playwright (CHROME / PWCORE in the environment, or found in the
// usual places of an npx cache and %LOCALAPPDATA%\ms-playwright).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeckDrawing } from '../../src/components/catcc/prifly/DeckDrawing.tsx';
import { DECK_VIEWBOX, type DeckLayer } from '../../src/components/catcc/prifly/deck.ts';

const PX = 4;
const [vx, vy, vw, vh] = DECK_VIEWBOX.split(' ').map(Number);
const W = Math.round(vw * PX);
const H = Math.round(vh * PX);
const OUT = path.resolve(import.meta.dirname ?? __dirname, '../../catcc-dcs/Scripts/CATCC');

// the deck's lettering as the PriFly page sets it: catcc.css's `.deck` rules (IBM Plex Mono), carried into the SVG; and
// the font itself for the headless Chromium (catcc-dcs/fonts: the app's fonts, unchanged), else it falls back to a serif
// (the user's run of 2026-11-20: the picker's deck lettered in a serif)
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '../..');
const DECK_CSS = fs.readFileSync(path.join(ROOT, 'src/components/catcc/catcc.css'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('.deck ')).join('\n');
const fontFace = (file: string, weight: number) =>
  `@font-face { font-family: 'IBM Plex Mono'; font-weight: ${weight}; src: url(data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'catcc-dcs/fonts', file)).toString('base64')}) format('truetype'); }`;
const FONTS = fontFace('CATCC-IBMPlexMono-Regular.ttf', 400) + '\n' + fontFace('CATCC-IBMPlexMono-SemiBold.ttf', 600) + '\n' + fontFace('CATCC-IBMPlexMono-SemiBold.ttf', 700);
const svg =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={DECK_VIEWBOX} width={W} height={H} className="deck">
      <style>{DECK_CSS}</style>
      <rect x={vx} y={vy} width={vw} height={vh} fill="#0B0E12" />
      <DeckDrawing layers={new Set<DeckLayer>(['areas', 'gear'])} />
    </svg>,
  ) +
  '\n';
fs.writeFileSync(path.join(OUT, 'catcc_deck.svg'), svg);
console.log(`written: catcc_deck.svg (${W} x ${H})`);

function find(dir: string, pred: (p: string) => boolean, depth = 4): string | null {
  if (depth < 0 || !fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (pred(p)) return p;
    if (e.isDirectory()) {
      const q = find(p, pred, depth - 1);
      if (q) return q;
    }
  }
  return null;
}

const local = process.env.LOCALAPPDATA ?? '';
const pwcore = process.env.PWCORE ?? find(path.join(local, 'npm-cache', '_npx'), (p) => p.endsWith(path.join('node_modules', 'playwright-core')), 3);
const chrome = process.env.CHROME ?? find(path.join(local, 'ms-playwright'), (p) => /chromium-\d+/.test(p) && p.endsWith('chrome.exe'), 4);
if (!pwcore || !chrome) {
  console.log('NO PNG: playwright-core or Chromium not found (set PWCORE and CHROME)');
  process.exit(1);
}
const pw = createRequire(import.meta.url)(pwcore);
const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(`<html><head><style>${FONTS}</style></head><body style="margin:0;background:#0B0E12">${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`);
await page.evaluate(async () => {
  await document.fonts.load("400 10px 'IBM Plex Mono'");
  await document.fonts.load("600 10px 'IBM Plex Mono'");
  await document.fonts.ready;
});
await (await page.$('svg')).screenshot({ path: path.join(OUT, 'catcc_deck.png') });
console.log(`written: catcc_deck.png (${W} x ${H})`);

// THE AIRCRAFT ON THE DECK: a folded-wing Hornet from the user's own trace, carrier-ops-handoff-2/Hornet.svg, its
// "Folded" layer: ONE closed outline of the whole aircraft (PriFly's jetShape(FOLDED) is three overlapping polygons,
// fuselage, wings, stabilators: stroked, each piece got its own outline; the user, 2026-11-21: "The magenta outline is
// kind of fucked ... why you're not using the Hornet.svg shape"). The trace in mm, nose at X = 0 pointing -X, the
// centreline at Y = 186.50, 549.5398 mm to 17.07 m (scripts/catcc/nimitz-spots.py); its layer is translated
// (223.30833, 125.41912). On a see-through square of 21 m (84 px at 4 px a metre, the jet's middle (half its length, on
// the centreline) in its middle; room for its shadow), nose along the deck's x at angle 0 and turned counter-clockwise
// (PriFly's angle: CCW from the bow) by the picker, in the colours the picker uses (PriFly's: gray: spotted; mine:
// grey, outlined in PriFly's magenta (the user: "The players assigned slot should be outlined in Magenta"); ready:
// green, the pilot ready to taxi; sel: chosen), each with a dark drop shadow to set it off from the deck (the user chose
// the shadow over an outline, 2026-11-21). jets/catcc_jet_<colour>.png, jets/catcc_jet_shadow.png
const HORNET = fs.readFileSync(path.join(ROOT, 'carrier-ops-handoff-2/Hornet.svg'), 'utf8');
const folded = [...HORNET.matchAll(/<path\b([^>]*?)\/>/gs)].map((m) => m[1]).find((a) => /inkscape:label="Folded"/.test(a));
const FOLDED_D = folded?.match(/\sd="([^"]+)"/)?.[1];
if (!FOLDED_D) throw new Error('Hornet.svg: no path labelled "Folded"');
const MM_PER_M = 549.5398 / 17.07;
const LAYER = [223.30833, 125.41912];
const MID = [549.5398 / 2, 186.5];
const JET_COL: Record<string, { fill: string; stroke?: string }> = {
  gray: { fill: '#6E7A88' },
  mine: { fill: '#6E7A88', stroke: '#E45BEA' },
  ready: { fill: '#5FC37A' },
  sel: { fill: '#F15822' },
};
const JS = 21;
const JPX = Math.round(JS * PX);
const JOUT = path.join(OUT, 'jets');
fs.mkdirSync(JOUT, { recursive: true });
// (the pictures of an earlier set, gone: only this set's names are made)
for (const f of fs.readdirSync(JOUT)) if (/^catcc_jet_.*\.png$/.test(f)) fs.rmSync(path.join(JOUT, f));
await page.setViewportSize({ width: JPX, height: JPX });
let nJets = 0;
// THE PICTURES THE PICKER TURNS ITSELF (2026-11-23: DCS's GUI turns a Static's picture: Static:setAngle about its
// pivot point, as DCS's own binocular view turns its heading scale): one per colour at angle 0 without its shadow
// (catcc_jet_<colour>.png), and the shadow alone (catcc_jet_shadow.png), drawn under it at its offset and turned with
// it: five pictures. (Until 2026-11-23: 72 per colour, every 5 degrees, chosen by heading; gone once the turning was
// seen to work in DCS.)
const SHADOW = '<defs><filter id="sb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.35"/></filter></defs>';
const tr0 = `scale(${-1 / MM_PER_M}) translate(${LAYER[0] - MID[0]} ${LAYER[1] - MID[1]})`;
const one = async (name: string, body: string) => {
  const jsvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-JS / 2} ${-JS / 2} ${JS} ${JS}" width="${JPX}" height="${JPX}">${body}</svg>`;
  await page.setContent(`<html><body style="margin:0;background:transparent">${jsvg}</body></html>`);
  await (await page.$('svg')).screenshot({ path: path.join(JOUT, name), omitBackground: true });
  nJets++;
};
for (const [cls, c] of Object.entries(JET_COL)) {
  await one(`catcc_jet_${cls}.png`, `<path transform="${tr0}" d="${FOLDED_D}" fill="${c.fill}"${c.stroke ? ` stroke="${c.stroke}" stroke-width="${0.7 * MM_PER_M}" stroke-linejoin="round"` : ''}/>`);
}
await one('catcc_jet_shadow.png', `${SHADOW}<path transform="${tr0}" d="${FOLDED_D}" fill="#000" fill-opacity="0.9" filter="url(#sb)"/>`);
await browser.close();
console.log(`written: jets/catcc_jet_*.png (${nJets}, ${JPX} x ${JPX})`);
