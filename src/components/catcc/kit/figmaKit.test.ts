/**
 * The Figma plugin (figma/catcc-kit) against the kit: kit.json has every specimen of the kit page and the
 * current tokens, code.js is plugin.cjs + kit.json as the generator writes it, the plugin's helpers convert
 * the specs correctly, and the whole plugin runs against a stand-in for the Figma API that checks what it is
 * given (enums, auto layout children, fonts loaded before use, unique variant names).
 * Regenerate with: node scripts/catcc/figma-kit.gen.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { COLORS, FONTS, RADII, TEXT_STYLES } from './tokens.ts';
import { assembleCode } from '../../../../scripts/catcc/figma-kit/assemble.ts';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'figma/catcc-kit');
const kitText = fs.readFileSync(path.join(DIR, 'kit.json'), 'utf8');
const KIT = JSON.parse(kitText);
const P = createRequire(import.meta.url)(path.join(DIR, 'plugin.cjs'));

interface Spec {
  t: 'frame' | 'text' | 'svg';
  kids?: Spec[];
  [k: string]: unknown;
}
const walk = (n: Spec, f: (n: Spec) => void) => {
  f(n);
  (n.kids ?? []).forEach((k) => walk(k, f));
};

describe('figma/catcc-kit is current', () => {
  it('has every specimen of the kit page, and nothing else', async () => {
    // some panels import the app's Supabase client, which wants its settings
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:9');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
    const { specimenKeys } = await import('./specimens.tsx');
    const want = specimenKeys();
    const got = KIT.specimens.map((s: { name: string; variant: string }) => `${s.name}|${s.variant}`);
    expect(new Set(want).size).toBe(want.length);
    expect(got).toEqual(want);
    vi.unstubAllEnvs();
  });

  it('carries the current tokens', () => {
    expect(KIT.tokens).toEqual(JSON.parse(JSON.stringify({ colors: COLORS, text: TEXT_STYLES, fonts: FONTS, radii: RADII })));
  });

  it('code.js is plugin.cjs with kit.json', () => {
    const code = fs.readFileSync(path.join(DIR, 'code.js'), 'utf8').replace(/\r\n/g, '\n');
    expect(code).toBe(assembleCode(fs.readFileSync(path.join(DIR, 'plugin.cjs'), 'utf8'), kitText));
  });

  it('the manifest is a dynamic-page development plugin running code.js', () => {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    expect(m).toMatchObject({ api: '1.0.0', main: 'code.js', editorType: ['figma'], documentAccess: 'dynamic-page' });
    expect(m.networkAccess.allowedDomains).toEqual(['none']);
  });

  it('every node spec is well formed', () => {
    for (const s of KIT.specimens) {
      walk(s.node, (n) => {
        expect(['frame', 'text', 'svg']).toContain(n.t);
        for (const k of ['x', 'y', 'w', 'h']) expect(Number.isFinite(n[k]), `${s.name} ${k}`).toBe(true);
        if (n.t === 'text') {
          expect(typeof n.s).toBe('string');
          expect(['Saira', 'IBM Plex Mono', 'IBM Plex Sans']).toContain(n.f);
          expect(n.sz).toBeGreaterThan(0);
        }
        if (n.t === 'svg') expect(String(n.svg)).toMatch(/^<svg[\s\S]*<\/svg>$/);
      });
    }
  });
});

describe('plugin helpers', () => {
  it('parses the colours the kit uses', () => {
    expect(P.cssColor('#F15822')).toEqual({ r: 241 / 255, g: 88 / 255, b: 34 / 255, a: 1 });
    expect(P.cssColor('rgba(241,88,34,.18)')).toEqual({ r: 241 / 255, g: 88 / 255, b: 34 / 255, a: 0.18 });
    expect(P.cssColor('rgb(14, 17, 22)').a).toBe(1);
    for (const c of COLORS) expect(() => P.cssColor(c.value)).not.toThrow();
    // a serialised fill matches its token
    expect(P.colorKey('#F15822', 0.18)).toBe(P.tokenColorKey('rgba(241,88,34,.18)'));
    expect(P.colorKey('#0E1116', 1)).toBe(P.tokenColorKey('#0E1116'));
  });

  it('names fonts as Figma does', () => {
    expect(P.fontName('Saira', 600)).toEqual({ family: 'Saira', style: 'SemiBold' });
    expect(P.fontName('IBM Plex Mono', 400)).toEqual({ family: 'IBM Plex Mono', style: 'Regular' });
    expect(P.fontName('Saira', 700, true)).toEqual({ family: 'Saira', style: 'Bold Italic' });
    expect(P.fontName('system-ui', 400)).toEqual({ family: 'Inter', style: 'Regular' });
  });

  it('gives every variant of a set every property, uniquely', () => {
    expect(P.normalizeVariants(['side=own', 'side=own, hooked=yes'])).toEqual(['side=own, hooked=default', 'side=own, hooked=yes']);
    expect(P.normalizeVariants(['', ''])).toEqual(['variant=v1', 'variant=v2']);
    for (const sec of P.groupSpecimens(KIT)) {
      for (const g of sec.groups) {
        const names = P.normalizeVariants(g.items.map((x: { variant: string }) => x.variant));
        expect(new Set(names).size, g.name).toBe(names.length);
      }
    }
  });

  it('groups the specimens by section and component, in order, losing none', () => {
    const secs = P.groupSpecimens(KIT);
    expect(secs.map((s: { id: string }) => s.id)).toEqual(KIT.sections.map((s: { id: string }) => s.id));
    expect(secs.flatMap((s: { groups: { items: unknown[] }[] }) => s.groups.flatMap((g) => g.items)).length).toBe(KIT.specimens.length);
  });

  it('maps flex layout to auto layout', () => {
    expect(P.layoutProps({ dir: 'H', gap: 6, pad: [0, 10, 0, 10], main: 'MIN', cross: 'CENTER', hugW: true, hugH: false })).toMatchObject({
      layoutMode: 'HORIZONTAL',
      itemSpacing: 6,
      paddingLeft: 10,
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
      counterAxisAlignItems: 'CENTER',
    });
    expect(P.layoutProps({ dir: 'H', gap: 12, cgap: 8, pad: [0, 0, 0, 0], main: 'MIN', cross: 'MIN', wrap: true, hugW: false, hugH: true })).toMatchObject({ layoutWrap: 'WRAP', counterAxisSpacing: 8 });
    expect(P.layoutProps(undefined)).toBeNull();
  });

  it('places SVG lettering by its anchor and centres text on the browser line', () => {
    expect(P.textPosition({ x: 10, ax: 50, anchor: 'center', cy: 20 }, 30, 12)).toEqual({ x: 35, y: 14 });
    expect(P.textPosition({ x: 10, ax: 50, anchor: 'right', cy: 20 }, 30, 12)).toEqual({ x: 20, y: 14 });
    expect(P.textPosition({ x: 10, cy: 20 }, 30, 12)).toEqual({ x: 10, y: 14 });
  });

  it('turns box shadows into effects', () => {
    expect(P.effectsOf([{ inset: false, x: 0, y: 6, blur: 20, spread: 0, c: '#000000', a: 0.45 }])).toEqual([{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.45 }, offset: { x: 0, y: 6 }, radius: 20, spread: 0, visible: true, blendMode: 'NORMAL' }]);
  });
});

// ---------------------------------------------------------------- a stand-in for the Figma plugin API

const ENUMS: Record<string, string[]> = {
  layoutMode: ['NONE', 'HORIZONTAL', 'VERTICAL'],
  primaryAxisAlignItems: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'],
  counterAxisAlignItems: ['MIN', 'CENTER', 'MAX', 'BASELINE'],
  primaryAxisSizingMode: ['FIXED', 'AUTO'],
  counterAxisSizingMode: ['FIXED', 'AUTO'],
  layoutWrap: ['NO_WRAP', 'WRAP'],
  textAutoResize: ['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'],
  layoutAlign: ['MIN', 'CENTER', 'MAX', 'STRETCH', 'INHERIT'],
  layoutPositioning: ['AUTO', 'ABSOLUTE'],
  textCase: ['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'],
  strokeAlign: ['INSIDE', 'OUTSIDE', 'CENTER'],
  textTruncation: ['DISABLED', 'ENDING'],
};

interface MockNode {
  type: string;
  name: string;
  children: MockNode[];
  parent: MockNode | null;
  width: number;
  height: number;
  appendChild: (c: MockNode) => void;
  [k: string]: unknown;
}

function mockFigma() {
  const loaded = new Set<string>();
  const problems: string[] = [];
  const fk = (f: { family: string; style: string }) => `${f.family}|${f.style}`;
  const node = (type: string): MockNode => {
    const n: MockNode = {
      type,
      name: type,
      children: [],
      parent: null,
      width: 100,
      height: 100,
      layoutMode: 'NONE',
      appendChild(c: MockNode) {
        if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c);
        c.parent = n;
        n.children.push(c);
      },
      remove() {
        if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n);
      },
      resize(w: number, h: number) {
        if (!(w > 0 && h > 0)) problems.push(`resize ${type} ${w}x${h}`);
        n.width = w;
        n.height = h;
        // as Figma: resizing an auto layout frame fixes both its axes
        if (n.layoutMode !== 'NONE') {
          n.primaryAxisSizingMode = 'FIXED';
          n.counterAxisSizingMode = 'FIXED';
        }
      },
      async setTextStyleIdAsync() {},
    };
    return new Proxy(n, {
      set(t, k: string, v) {
        if (ENUMS[k] && !ENUMS[k].includes(v)) problems.push(`${k}=${v}`);
        if ((k === 'layoutGrow' || k === 'layoutAlign' || k === 'layoutPositioning') && (!t.parent || t.parent.layoutMode === 'NONE')) problems.push(`${k} on a child of a frame without auto layout (${t.name})`);
        if (k === 'fontName' && !loaded.has(fk(v))) problems.push(`font not loaded: ${fk(v)}`);
        if (k === 'characters' && t.fontName && !loaded.has(fk(t.fontName as { family: string; style: string }))) problems.push('characters before font load');
        (t as Record<string, unknown>)[k] = v;
        return true;
      },
    }) as MockNode;
  };
  const pages: MockNode[] = [];
  const variables: { name: string; variableCollectionId: string; setValueForMode: () => void }[] = [];
  const sets: MockNode[] = [];
  const figma = {
    root: { children: pages },
    createPage: () => {
      const p = node('PAGE');
      pages.push(p);
      return p;
    },
    setCurrentPageAsync: async () => {},
    loadFontAsync: async (f: { family: string; style: string }) => {
      if (!['Saira', 'IBM Plex Mono', 'IBM Plex Sans', 'Inter'].includes(f.family)) throw new Error('no font');
      loaded.add(fk(f));
    },
    createFrame: () => node('FRAME'),
    createComponent: () => node('COMPONENT'),
    createRectangle: () => node('RECTANGLE'),
    createText: () => node('TEXT'),
    createNodeFromSvg: (svg: string) => {
      if (!svg.startsWith('<svg')) throw new Error('bad svg');
      return node('FRAME');
    },
    createTextStyle: () => ({ id: `S:${Math.random()}`, name: '' }),
    getLocalTextStylesAsync: async () => [],
    combineAsVariants: (nodes: MockNode[], parent: MockNode) => {
      if (nodes.some((n) => n.type !== 'COMPONENT')) problems.push('combineAsVariants: not components');
      const names = nodes.map((n) => n.name);
      if (new Set(names).size !== names.length) problems.push(`duplicate variants ${names.join(' / ')}`);
      if (names.some((x) => !/^[^=,]+=[^=,]+(, [^=,]+=[^=,]+)*$/.test(x))) problems.push(`variant names not prop=value: ${names.join(' / ')}`);
      const s = node('COMPONENT_SET');
      parent.appendChild(s);
      nodes.forEach((n) => s.appendChild(n));
      sets.push(s);
      return s;
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      createVariableCollection: (name: string) => ({ id: 'C1', name, modes: [{ modeId: 'M1' }], renameMode: () => {} }),
      getLocalVariablesAsync: async () => variables,
      createVariable: (name: string, coll: { id: string }, type: string) => {
        if (typeof coll !== 'object' || type !== 'COLOR') problems.push('createVariable args');
        const v = { name, variableCollectionId: coll.id, setValueForMode: () => {}, description: '' };
        variables.push(v);
        return v;
      },
      setBoundVariableForPaint: (p: object, field: string, v: unknown) => ({ ...p, boundVariables: { [field]: v } }),
    },
    viewport: { scrollAndZoomIntoView: () => {} },
  };
  return { figma, problems, sets, variables, pages };
}

describe('plugin run against a stand-in Figma', () => {
  it('builds the page without errors', async () => {
    const m = mockFigma();
    (globalThis as Record<string, unknown>).figma = m.figma;
    try {
      const r = await P.run(KIT);
      expect(m.problems).toEqual([]);
      expect(r.components).toBe(KIT.specimens.length);
      expect(m.variables.map((v) => v.name)).toEqual(COLORS.map((c) => c.name));
      // every component with variants is a set named for it
      const multi = P.groupSpecimens(KIT).flatMap((s: { groups: { name: string; items: { variant: string }[] }[] }) => s.groups.filter((g) => g.items.length > 1 || g.items[0].variant).map((g) => g.name));
      expect(m.sets.map((s) => s.name)).toEqual(multi);
      expect(m.pages.map((p) => p.name)).toEqual(['CATCC Kit']);
      // the section rows grow with what they hold
      const all: MockNode[] = [];
      const gather = (n: MockNode) => {
        all.push(n);
        n.children.forEach(gather);
      };
      m.pages.forEach(gather);
      const rows = all.filter((n) => n.name.endsWith(' components'));
      expect(rows.length).toBe(KIT.sections.length);
      for (const r of rows) expect(r.counterAxisSizingMode).toBe('AUTO');
      for (const s of m.sets) expect(s.counterAxisSizingMode).toBe('AUTO');
    } finally {
      delete (globalThis as Record<string, unknown>).figma;
    }
  });
});
