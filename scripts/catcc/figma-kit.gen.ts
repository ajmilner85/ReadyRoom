// THE CATCC KIT FOR FIGMA: renders the CATCC UI kit page (src/components/catcc/kit, the /catcc/kit route) in a
// headless Chromium, reads every [data-figma] specimen as the browser laid it out (scripts/catcc/figma-kit/
// serialize.js) and writes the Figma development plugin's data:
//   node scripts/catcc/figma-kit.gen.ts            → figma/catcc-kit/kit.json and code.js
//   node scripts/catcc/figma-kit.gen.ts --shot DIR → also screenshots of the kit: DIR/catcc-kit.png and one per section
// The page is served by a Vite server of its own on a free port (never the app's 5173 / 3001 / 3002), stopped at
// the end. Needs playwright-core and a Chromium of ms-playwright (PWCORE / CHROME in the environment, or found in
// the usual places of an npx cache and %LOCALAPPDATA%\ms-playwright), and the network for the Google fonts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer, type Plugin } from 'vite';
import { COLORS, FONTS, RADII, TEXT_STYLES } from '../../src/components/catcc/kit/tokens.ts';
import { assembleCode, formatKit } from './figma-kit/assemble.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'figma/catcc-kit');
const shotAt = process.argv.indexOf('--shot');
const SHOT = shotAt > 0 ? process.argv[shotAt + 1] : undefined;

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
const chrome = process.env.CHROME ?? find(path.join(local, 'ms-playwright'), (p) => /chromium-\d+/.test(p) && /chrome(\.exe)?$/.test(p) && !p.includes('headless_shell'), 4);
if (!pwcore || !chrome) {
  console.error('playwright-core or Chromium not found (set PWCORE and CHROME)');
  process.exit(1);
}

// the kit page, without the app's sign-in: index.html's fonts, the kit's own entry
const HTML = `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Saira:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <title>CATCC kit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/scripts/catcc/figma-kit/entry.tsx"></script>
  </body>
</html>`;
const kitPage = (): Plugin => ({
  name: 'catcc-kit-page',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__catcc-kit')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml(req.url, HTML));
    });
  },
});

// Some panels import the app's Supabase client, which needs its settings to load. The kit page must never reach
// the live database: no .env is read (an empty envDir) and the client gets an address nothing listens on.
const NO_ENV = fs.mkdtempSync(path.join(os.tmpdir(), 'catcc-figma-kit-env-'));
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'catcc-kit-offline';
process.env.VITE_API_URL = 'http://127.0.0.1:9';
const server = await createServer({
  root: ROOT,
  envDir: NO_ENV,
  configFile: path.join(ROOT, 'vite.config.ts'),
  // the dependency cache outside the repo (a worktree has no node_modules of its own)
  cacheDir: path.join(os.tmpdir(), 'catcc-figma-kit-vite'),
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, fs: { strict: false } },
  plugins: [kitPage()],
});
let browser: { close: () => Promise<void> } | undefined;
try {
  await server.listen();
  const addr = server.httpServer?.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  const url = `http://127.0.0.1:${addr.port}/__catcc-kit`;

  const pw = createRequire(import.meta.url)(pwcore);
  const b = await pw.chromium.launch({ executablePath: chrome, headless: true });
  browser = b;
  const page = await b.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  page.on('console', (m: { type: () => string; text: () => string }) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForSelector('[data-figma]', { state: 'attached', timeout: 60_000 }).catch((e: Error) => {
    throw new Error(`${e.message}\npage errors:\n  ${errors.join('\n  ')}`);
  });
  const fontsOk = await page.evaluate(async () => {
    const want = ["300 12px 'Saira'", "400 12px 'Saira'", "500 12px 'Saira'", "600 12px 'Saira'", "700 12px 'Saira'", "400 12px 'IBM Plex Mono'", "500 12px 'IBM Plex Mono'", "600 12px 'IBM Plex Mono'", "700 12px 'IBM Plex Mono'"];
    await Promise.all(want.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return want.every((f) => document.fonts.check(f));
  });
  if (!fontsOk) throw new Error('Saira / IBM Plex Mono did not load (the page needs the Google fonts)');
  if (errors.length) console.warn(`page errors:\n  ${errors.join('\n  ')}`);
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'scripts/catcc/figma-kit/serialize.js'), 'utf8') });
  const specimens = await page.evaluate(() => (window as unknown as { __catccFigmaKit: () => unknown[] }).__catccFigmaKit());
  const sections = await page.evaluate(() => [...document.querySelectorAll('[data-kit-section]')].map((e) => ({ id: e.getAttribute('data-kit-section'), title: e.getAttribute('data-kit-title') })));
  if (SHOT) {
    fs.mkdirSync(SHOT, { recursive: true });
    // the page scrolls inside .cc-root: let it grow to its content for the picture
    await page.addStyleTag({ content: '.cc-root { position: static !important; overflow: visible !important; } .cc-root > div { overflow: visible !important; }' });
    await page.screenshot({ path: path.join(SHOT, 'catcc-kit.png'), fullPage: true });
    // and each section on its own, for a closer look
    for (const s of sections) await page.locator(`[data-kit-section="${s.id}"]`).screenshot({ path: path.join(SHOT, `catcc-kit-${s.id}.png`) });
    console.log(`screenshots: ${SHOT}`);
  }

  const kit = {
    generator: 'node scripts/catcc/figma-kit.gen.ts',
    source: 'src/components/catcc/kit (route /catcc/kit)',
    tokens: { colors: COLORS, text: TEXT_STYLES, fonts: FONTS, radii: RADII },
    sections,
    specimens,
  };
  fs.mkdirSync(OUT, { recursive: true });
  const json = formatKit(kit);
  fs.writeFileSync(path.join(OUT, 'kit.json'), json);
  fs.writeFileSync(path.join(OUT, 'code.js'), assembleCode(fs.readFileSync(path.join(OUT, 'plugin.cjs'), 'utf8'), json));
  console.log(`written: figma/catcc-kit/kit.json (${specimens.length} specimens), code.js (${Math.round(fs.statSync(path.join(OUT, 'code.js')).size / 1024)} KB)`);
} finally {
  await browser?.close();
  await server.close();
}
