/**
 * CATCC UI kit (/catcc/kit): a living reference of the CATCC / PriFly interface's tokens and components,
 * rendered in the CATCC shell (.cc-root, catcc.css, dark only) with demo data. Specimens are marked
 * data-figma / data-variant: scripts/catcc/figma-kit.gen.tsx reads them into the Figma plugin (figma/catcc-kit).
 */
import React from 'react';
import '../catcc.css';
import { COLORS, FONTS, RADII, TEXT_STYLES } from './tokens.ts';
import { SECTIONS, type KitSection, type Specimen } from './specimens.tsx';

const MONO = "'IBM Plex Mono', monospace";

const SectionHead: React.FC<{ id: string; title: string; source?: string }> = ({ id, title, source }) => (
  <div id={id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '28px 0 10px', borderBottom: '1px solid #262F3A', paddingBottom: 6 }}>
    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</span>
    {source && <span className="mono" style={{ fontSize: 11, color: '#6B7683' }}>{source}</span>}
  </div>
);

/** One specimen: the caption, then the component itself, marked for the Figma generator. */
const Tile: React.FC<{ s: Specimen }> = ({ s }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
    {s.variant && <span className="mono" style={{ fontSize: 10, color: '#6B7683' }}>{s.variant}</span>}
    <div data-figma={s.name} data-variant={s.variant ?? ''} style={{ display: 'inline-block', maxWidth: '100%' }}>
      {s.render()}
    </div>
  </div>
);

const Section: React.FC<{ sec: KitSection }> = ({ sec }) => {
  // specimens grouped by component name: one card each
  const groups = new Map<string, Specimen[]>();
  for (const s of sec.specimens) groups.set(s.name, [...(groups.get(s.name) ?? []), s]);
  return (
    <>
      <SectionHead id={sec.id} title={sec.title} source={sec.source} />
      <div data-kit-section={sec.id} data-kit-title={sec.title} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {[...groups].map(([name, list]) => (
          <div key={name} style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12, minWidth: 0, maxWidth: '100%' }}>
            <div className="lbl" style={{ marginBottom: 8 }}>{name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
              {list.map((s) => (
                <Tile key={`${s.name}|${s.variant ?? ''}`} s={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const Tokens: React.FC = () => {
  const groups = new Map<string, typeof COLORS>();
  for (const c of COLORS) {
    const g = c.name.split('/')[0];
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  return (
    <>
      <SectionHead id="tokens" title="Tokens" source="kit/tokens.ts (from catcc.css and the components' inline styles)" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {[...groups].map(([g, list]) => (
          <div key={g} className="pnl" style={{ width: 340 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>{g}</div>
            {list.map((c) => (
              <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                <span style={{ width: 36, height: 24, borderRadius: 4, border: '1px solid #374250', background: `linear-gradient(${c.value}, ${c.value}), #0E1116` }} />
                <span style={{ minWidth: 0 }}>
                  <span className="mono" style={{ fontSize: 12, display: 'block' }}>{c.name.split('/')[1]} <span style={{ color: '#93A1B0' }}>{c.value}</span></span>
                  <span className="mono" style={{ fontSize: 10.5, color: '#6B7683', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.use}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="pnl" style={{ width: 340 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>radii</div>
          {RADII.map((r) => (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '4px 0' }}>
              <span style={{ width: 36, height: 24, borderRadius: r.px, border: '1px solid #93A1B0' }} />
              <span className="mono" style={{ fontSize: 12 }}>{r.name} <span style={{ color: '#93A1B0' }}>{r.px}px</span> <span style={{ fontSize: 10.5, color: '#6B7683' }}>{r.use}</span></span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const Typography: React.FC = () => (
  <>
    <SectionHead id="type" title="Typography" source={FONTS.map((f) => `${f.name} ${f.weights.join('/')}`).join(' · ')} />
    <div className="pnl" style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr) 260px', gap: '8px 16px', alignItems: 'baseline' }}>
      {TEXT_STYLES.map((t) => (
        <React.Fragment key={t.name}>
          <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0' }}>{t.name}</span>
          <span style={{ fontFamily: t.family === 'Saira' ? "'Saira', sans-serif" : MONO, fontWeight: t.weight, fontSize: t.size, letterSpacing: t.tracking ? `${t.tracking}em` : undefined, textTransform: t.upper ? 'uppercase' : undefined, color: t.color }}>{t.sample}</span>
          <span className="mono" style={{ fontSize: 10.5, color: '#6B7683' }}>{`${t.family} ${t.weight} · ${t.size}${t.tracking ? ` · ${t.tracking}em` : ''} — ${t.use}`}</span>
        </React.Fragment>
      ))}
    </div>
  </>
);

const CatccKit: React.FC = () => (
  <div className="cc-root" data-theme="dark">
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ padding: '20px 24px 60px', maxWidth: 1640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 5, background: '#F15822' }} />
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '.08em' }}>CATCC UI KIT</div>
        </div>
        <nav className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 11.5 }}>
          {[['tokens', 'Tokens'], ['type', 'Typography'], ...SECTIONS.map((s) => [s.id, s.title])].map(([id, t]) => (
            <a key={id} href={`#${id}`} style={{ textDecoration: 'none' }}>
              {t}
            </a>
          ))}
        </nav>
        <Tokens />
        <Typography />
        {SECTIONS.map((s) => (
          <Section key={s.id} sec={s} />
        ))}
      </div>
    </div>
  </div>
);

export default CatccKit;
