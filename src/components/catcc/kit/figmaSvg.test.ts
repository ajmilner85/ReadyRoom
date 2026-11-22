/**
 * The kit as SVG for Figma's free plan (figma/catcc-kit/svg): every specimen has its own file and a place on the
 * sheet, the files are well-formed XML, layers carry the component names, text runs are real <text> in the kit's
 * fonts, and the files on disk are what kit.json converts to.
 * Regenerate with: node scripts/catcc/figma-kit-svg.ts (figma-kit.gen.ts runs it too)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kitSvgFiles, nodeOf, SHEET, specimenFile, specimenLabel, svgOf, textOf, type Kit, type KitNode } from '../../../../scripts/catcc/figma-kit/svg.ts';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'figma/catcc-kit/svg');
const KIT: Kit = JSON.parse(fs.readFileSync(path.join(ROOT, 'figma/catcc-kit/kit.json'), 'utf8'));
const FILES = kitSvgFiles(KIT);

interface El {
  tag: string;
  at: Record<string, string>;
  kids: El[];
  text: string;
}

/** a strict little XML reader: throws on anything not well formed (unclosed or crossed tags, bad attributes, stray &) */
function parseXml(src: string): El {
  const re = /<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  const top: El = { tag: '#doc', at: {}, kids: [], text: '' };
  const stack = [top];
  let at = 0;
  for (let m; (m = re.exec(src)); ) {
    if (m.index !== at) throw new Error(`not XML at ${at}: ${src.slice(at, at + 40)}`);
    at = re.lastIndex;
    const cur = stack[stack.length - 1];
    if (m[1]) {
      if (cur.tag !== m[1]) throw new Error(`</${m[1]}> closes <${cur.tag}>`);
      stack.pop();
    } else if (m[2]) {
      const el: El = { tag: m[2], at: {}, kids: [], text: '' };
      for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) {
        if (a[1] in el.at) throw new Error(`duplicate attribute ${a[1]}`);
        if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(a[2])) throw new Error(`stray & in ${a[1]}`);
        el.at[a[1]] = a[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      }
      cur.kids.push(el);
      if (!m[4]) stack.push(el);
    } else if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(m[5])) throw new Error('stray & in text');
      if (stack.length === 1 && m[5].trim()) throw new Error('text outside the root');
      cur.text += m[5].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    }
  }
  if (at !== src.length) throw new Error('trailing garbage');
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].tag}> not closed`);
  const roots = top.kids;
  if (roots.length !== 1) throw new Error('not one root');
  return roots[0];
}
const all = (e: El, out: El[] = []) => {
  out.push(e);
  e.kids.forEach((k) => all(k, out));
  return out;
};
const textOfEl = (e: El): string => e.text + e.kids.map(textOfEl).join('');
const specTexts = (n: KitNode, out: KitNode[] = []) => {
  if (n.t === 'text') out.push(n);
  (n.kids ?? []).forEach((k) => specTexts(k, out));
  return out;
};

describe('figma/catcc-kit/svg is current', () => {
  it('has exactly the files kit.json converts to, with the same contents', () => {
    const onDisk = [
      ...fs.readdirSync(DIR).filter((f) => f.endsWith('.svg')),
      ...fs
        .readdirSync(path.join(DIR, 'parts'))
        .filter((f) => f.endsWith('.svg'))
        .map((f) => `parts/${f}`),
    ].sort();
    expect(onDisk).toEqual([...FILES.keys()].sort());
    for (const [p, text] of FILES) expect(fs.readFileSync(path.join(DIR, p), 'utf8').replace(/\r\n/g, '\n'), p).toBe(text);
  });

  it('is a reasonable size', () => {
    const bytes = [...FILES.values()].reduce((a, s) => a + s.length, 0);
    expect(bytes).toBeLessThan(3_000_000);
  });
});

describe('every specimen exported', () => {
  const sheet = parseXml(FILES.get(SHEET)!);
  const sheetEls = all(sheet);

  it('a file per specimen, its root layer named for the component and variant', () => {
    expect(FILES.size).toBe(KIT.specimens.length + 1);
    for (const s of KIT.specimens) {
      const src = FILES.get(specimenFile(s));
      expect(src, specimenFile(s)).toBeTruthy();
      const doc = parseXml(src!);
      expect(doc.tag).toBe('svg');
      expect(doc.at.xmlns).toBe('http://www.w3.org/2000/svg');
      expect(Number(doc.at.width)).toBe(Math.ceil(s.node.w));
      const layer = doc.kids[0];
      expect(layer.at.id).toBe(specimenLabel(s));
      expect(specimenLabel(s)).toBe(s.variant ? `${s.name} / ${s.variant}` : s.name);
    }
  });

  it('text runs are editable <text> in the kit fonts, one per run', () => {
    for (const s of KIT.specimens) {
      const doc = parseXml(FILES.get(specimenFile(s))!);
      const texts = all(doc).filter((e) => e.tag === 'text');
      const want = specTexts(s.node);
      expect(texts.length, specimenLabel(s)).toBe(want.length);
      texts.forEach((t, i) => {
        expect(['Saira', 'IBM Plex Mono', 'IBM Plex Sans']).toContain(t.at['font-family']);
        expect(Number(t.at['font-size'])).toBeGreaterThan(0);
        expect(Number(t.at['font-weight'])).toBeGreaterThanOrEqual(300);
        expect(t.at.fill).toMatch(/^#[0-9A-F]{6}$/);
        expect(t.at['letter-spacing']).toMatch(/^-?[\d.]+em$/);
        // the words: the shown text (a wrapped one line by line, a truncated one as the browser cut it)
        const w = want[i];
        const s2 = (w.lines?.map((l) => l.s).join('') ?? w.vis ?? w.s ?? '').replace(/\s+/g, '');
        expect(textOfEl(t).replace(/\s+/g, ''), specimenLabel(s)).toBe(w.up ? s2.toUpperCase() : s2);
        for (const sp of t.kids) {
          expect(sp.tag).toBe('tspan');
          expect(Number.isFinite(Number(sp.at.x)) && Number.isFinite(Number(sp.at.y))).toBe(true);
        }
      });
    }
  });

  it('the sheet holds every component by section, its variants as prop=value layers', () => {
    expect(sheet.tag).toBe('svg');
    const ids = (e: El) => e.kids.map((k) => k.at.id);
    const sections = sheet.kids.filter((k) => k.at.id?.startsWith('Section/'));
    expect(sections.map((s) => s.at.id)).toEqual(['Section/Tokens', ...KIT.sections.map((s) => `Section/${s.title}`)]);
    for (const sec of KIT.sections) {
      const g = sections.find((s) => s.at.id === `Section/${sec.title}`)!;
      const names = [...new Set(KIT.specimens.filter((s) => s.section === sec.id).map((s) => s.name))];
      for (const name of names) {
        const comp = g.kids.find((k) => k.tag === 'g' && k.at.id === name);
        expect(comp, name).toBeTruthy();
        const items = KIT.specimens.filter((s) => s.section === sec.id && s.name === name);
        if (items.length > 1 || items[0].variant) {
          expect(ids(comp!)).toEqual(items.map((s, i) => s.variant || `variant=v${i + 1}`));
          for (const v of ids(comp!)) expect(v).toMatch(/^[^=,]+=[^=,]+(, [^=,]+=[^=,]+)*$/);
        }
        // the caption is beside the component, not in it
        expect(g.kids.some((k) => k.tag === 'text' && k.at.id === `${name} label`)).toBe(true);
      }
    }
    // every colour token has a swatch
    for (const c of KIT.tokens.colors) expect(sheetEls.some((e) => e.at.id === c.name)).toBe(true);
  });

  it('clip paths are referenced and defined once per file', () => {
    for (const [p, src] of FILES) {
      const els = all(parseXml(src));
      const defs = els.filter((e) => e.tag === 'clipPath').map((e) => e.at.id);
      expect(new Set(defs).size, p).toBe(defs.length);
      for (const e of els) if (e.at['clip-path']) expect(defs, p).toContain(/^url\(#(.+)\)$/.exec(e.at['clip-path'])![1]);
      expect(els.some((e) => e.tag === 'svg' && e !== els[0]), `${p}: nested <svg>`).toBe(false);
    }
  });
});

describe('conversion', () => {
  it('writes text on its baseline, upper-cased and escaped', () => {
    const t = textOf({ t: 'text', n: 'a&b', s: 'a < b & c', x: 4, y: 10, w: 50, h: 14, by: 11, f: 'Saira', wt: 600, sz: 12, ls: 0.6, up: true, col: { c: '#E6EDF3', a: 0.5 } });
    expect(t).toBe('<text id="a&amp;b" fill="#E6EDF3" fill-opacity="0.5" xml:space="preserve" style="white-space: pre" font-family="Saira" font-size="12" font-weight="600" letter-spacing="0.05em"><tspan x="4" y="21">A &lt; B &amp; C</tspan></text>');
    const wrapped = textOf({ t: 'text', n: 'w', s: 'one two', x: 0, y: 0, w: 30, h: 30, sz: 10, f: 'IBM Plex Mono', lines: [{ s: 'one', dx: 0, dy: 8 }, { s: 'two', dx: 0, dy: 21 }] });
    expect(wrapped).toContain('<tspan x="0" y="8">one</tspan><tspan x="0" y="21">two</tspan>');
    // a truncated text as shown, and a run that starts right of its box
    expect(textOf({ t: 'text', n: 'v', s: 'LONG NAME', vis: 'LONG…', gx: 3, x: 1, y: 0, w: 20, h: 14, by: 10, sz: 10, f: 'Saira' })).toContain('<tspan x="4" y="10">LONG…</tspan>');
  });

  it('places and scales an inline SVG by its viewBox', () => {
    const g = svgOf({ t: 'svg', n: 'icon', x: 10, y: 5, w: 20, h: 20, svg: '<svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24"/></svg>' });
    expect(g).toBe('<g id="icon" transform="translate(10 5) scale(0.83333)" fill="none"><path d="M0 0h24"/></g>');
    // meet: centred on the long side
    expect(svgOf({ t: 'svg', n: 's', x: 0, y: 0, w: 40, h: 20, svg: '<svg viewBox="0 0 10 10"></svg>' })).toContain('transform="translate(10 0) scale(2)"');
    expect(svgOf({ t: 'svg', n: 's', x: 0, y: 0, w: 40, h: 20, svg: '<svg viewBox="0 0 10 10" preserveAspectRatio="none"></svg>' })).toContain('scale(4 2)');
  });

  it('draws a box with its fill, inset border and radius', () => {
    const b = nodeOf({ t: 'frame', n: 'btn', x: 2, y: 3, w: 40, h: 20, r: 5, fill: { c: '#151A21', a: 1 }, stroke: { c: '#374250', a: 1, w: 1 }, kids: [] });
    expect(b).toBe('<g id="btn" transform="translate(2 3)"><rect id="box" x="0.5" y="0.5" width="39" height="19" rx="4.5" fill="#151A21" stroke="#374250" stroke-width="1"/></g>');
    const sides = nodeOf({ t: 'frame', n: 'row', x: 0, y: 0, w: 100, h: 20, stroke: { c: '#262F3A', a: 1, w: [0, 0, 1, 0] }, kids: [] });
    expect(sides).toContain('<rect id="border-bottom" y="19" width="100" height="1" fill="#262F3A"/>');
  });
});
