// THE CATCC KIT AS SVG, for Figma on any plan: converts figma/catcc-kit/kit.json (written by
// `node scripts/catcc/figma-kit.gen.ts`, which also runs this step) into figma/catcc-kit/svg:
//   node scripts/catcc/figma-kit-svg.ts   → svg/CATCC Kit.svg (the whole kit by section) and svg/parts/*.svg
// No browser: a pure conversion (scripts/catcc/figma-kit/svg.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeKitSvg } from './figma-kit/svg.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'figma/catcc-kit');
const kit = JSON.parse(fs.readFileSync(path.join(DIR, 'kit.json'), 'utf8'));
const bytes = writeKitSvg(path.join(DIR, 'svg'), kit);
console.log(`written: figma/catcc-kit/svg (${kit.specimens.length + 1} files, ${Math.round(bytes / 1024)} KB)`);
