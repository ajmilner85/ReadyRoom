/**
 * PriFly panels (carrier-ops-handoff-2/mockup/Boss.dc.html): the deck status bar (PriFly owns the
 * deck call), the launch sequence per catapult and the lights panel. All of it is shared room
 * state (ops), so every seat sees PriFly's call and the queues.
 */
import React from 'react';
import type { CatStatus, LightSetting, OpsState } from '../../../catcc/core/room/ops.ts';
import type { LightItem } from './lights.ts';
import { fuelK, shortType, type Picture, type ScopeTrack } from '../scopeModel.ts';
import type { DeckCall } from '../deck.ts';
import { finalPicture, landingWeightLb } from '../final/finalModel.ts';
import { deckStatus, onCat } from './deck.ts';
import { catEntry } from './launch.ts';

const SEG: React.CSSProperties = { display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 };
const ms = (t: number) => {
  const n = Math.max(0, Math.round(t));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const id = (t: ScopeTrack) => t.bd ?? t.cs ?? t.id;

// ---------------------------------------------------------------- deck status bar

const REASONS = ['Clearing landing area', 'Aircraft in landing area', 'Pack not ready', 'Barricade rig', 'Wires reset', 'Foul line'];

export const DeckBar: React.FC<{ pic: Picture; deck: DeckCall | null; ops?: OpsState; setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void; readOnly: boolean }> = ({ pic, deck, setOps, readOnly }) => {
  if (!deck) return null;
  const foul = deck.foul;
  const fp = finalPicture(pic);
  const next = fp?.arrivals[0];
  const call = (f: boolean | null, reason?: string) => setOps({ deck: f === null ? null : { foul: f, ...(reason ? { reason } : {}), at: Date.now() } });
  return (
    <section aria-label="Deck status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, border: `1px solid ${foul ? '#E0524E' : '#40A85B'}`, background: foul ? 'rgba(224,82,78,.1)' : 'rgba(64,168,91,.1)' }}>
      <div style={SEG} role="radiogroup" aria-label="Deck call">
        {(['CLEAR', 'FOUL'] as const).map((k) => {
          const on = deck.called && foul === (k === 'FOUL');
          return (
            <button key={k} role="radio" aria-checked={on} disabled={readOnly} onClick={() => call(k === 'FOUL', k === 'FOUL' ? (deck.reason ?? REASONS[0]) : undefined)} style={{ border: 0, height: 34, padding: '0 16px', borderRadius: 4, fontSize: 15, fontWeight: 700, letterSpacing: '.06em', fontFamily: "'Saira', sans-serif", cursor: readOnly ? 'default' : 'pointer', background: on ? (k === 'FOUL' ? '#E0524E' : '#40A85B') : 'transparent', color: on ? '#0E1116' : '#93A1B0' }}>
              {k}
            </button>
          );
        })}
        <button role="radio" aria-checked={!deck.called} disabled={readOnly} title="Follow the picture: foul while an aircraft is in the landing area" onClick={() => call(null)} style={{ border: 0, height: 34, padding: '0 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", cursor: readOnly ? 'default' : 'pointer', background: !deck.called ? '#222C37' : 'transparent', color: !deck.called ? '#E6EDF3' : '#93A1B0' }}>
          AUTO
        </button>
      </div>
      {foul && deck.called ? (
        <select aria-label="Foul deck reason" disabled={readOnly} value={deck.reason ?? ''} onChange={(e) => call(true, e.target.value)} style={{ background: 'transparent', color: '#FF8A85', border: '1px solid #E0524E', borderRadius: 4, height: 32, fontFamily: "'Saira', sans-serif", fontSize: 15, fontWeight: 700, padding: '0 6px' }}>
          {[...new Set([...(deck.reason ? [deck.reason] : []), ...REASONS])].map((r) => (
            <option key={r} value={r} style={{ color: '#0E1116' }}>
              {r.toUpperCase()}
            </option>
          ))}
        </select>
      ) : (
        <span style={{ fontSize: 18, fontWeight: 700, color: foul ? '#FF8A85' : '#7FD397' }}>{foul ? (deck.reason ?? 'FOUL').toUpperCase() : 'READY DECK'}</span>
      )}
      <div style={{ flex: 1 }} />
      {next && <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>NEXT · {id(next.t)} 3/4 NM in {ms(next.tBall!)}</span>}
    </section>
  );
};

// ---------------------------------------------------------------- launch sequence

const CAT_STATUS: { k: CatStatus; l: string; fg: string; bg: string }[] = [
  { k: 'ready', l: 'READY', fg: '#7FD397', bg: 'rgba(127,211,151,.14)' },
  { k: 'hold', l: 'HOLD', fg: '#E7B04F', bg: 'rgba(231,176,79,.16)' },
  { k: 'suspended', l: 'SUSPEND', fg: '#FF8A85', bg: 'rgba(224,82,78,.16)' },
  { k: 'down', l: 'DOWN', fg: '#93A1B0', bg: '#222C37' },
];

export const LaunchTab: React.FC<{ pic: Picture; ops?: OpsState; setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void; readOnly: boolean }> = ({ pic, ops, setOps, readOnly }) => {
  const st = deckStatus(pic);
  const jets = st?.jets ?? [];
  const keyOf = (t: ScopeTrack) => t.g || t.id;
  // aircraft on deck, by flight key (a queue entry is a flight)
  const onDeck = new Map<string, ScopeTrack>();
  for (const j of jets) if (!onDeck.has(keyOf(j.t))) onDeck.set(keyOf(j.t), j.t);
  const cat = (k: string) => catEntry(ops, k);
  // flights that have launched (no longer on deck) drop out of the queues when the boss next edits them
  const live = (q: string[]) => q.filter((k) => onDeck.has(k));
  const save = (k: string, v: { status: CatStatus; queue: string[] }) => {
    const all: Record<string, { status: CatStatus; queue: string[] }> = {};
    for (const c of ['1', '2', '3', '4']) all[c] = c === k ? v : { ...cat(c), queue: live(cat(c).queue) };
    setOps({ launch: all });
  };
  const queued = new Set(['1', '2', '3', '4'].flatMap((k) => live(cat(k).queue)));
  const free = [...onDeck.entries()].filter(([k]) => !queued.has(k));
  // the launch sequence: catapults take turns, bow cats first
  const order: { cat: string; key: string }[] = [];
  const qs = ['1', '2', '3', '4'].map((k) => (cat(k).status === 'ready' ? live(cat(k).queue).map((key) => ({ cat: k, key })) : []));
  for (let i = 0; qs.some((q) => q.length > i); i++) for (const q of qs) if (q[i]) order.push(q[i]);
  const name = (k: string) => {
    const t = onDeck.get(k);
    return t ? `${id(t)} ${shortType(t.ty)}` : k;
  };
  const laInUse = !!st?.foul.length;
  return (
    <>
      <section className="pnl" aria-label="Launch sequence" style={{ padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span className="lbl">Launch sequence</span>
          <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{order.length} queued · {free.length} unassigned</span>
        </div>
        <div className="mono" style={{ fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {order.map((o, i) => (
            <span key={o.key} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${i === 0 ? '#5FD068' : '#374250'}`, background: i === 0 ? 'rgba(95,208,104,.16)' : 'transparent' }}>
              {i + 1}. {name(o.key)} · C{o.cat}
            </span>
          ))}
          {!order.length && <span style={{ color: '#6B7683' }}>Nothing queued on a ready catapult</span>}
        </div>
      </section>
      {['1', '2', '3', '4'].map((k) => {
        const c = cat(k);
        const q = live(c.queue);
        const spotted = onCat(jets, k);
        const s = CAT_STATUS.find((x) => x.k === c.status)!;
        const waist = k === '3' || k === '4';
        const label = spotted ? `SPOTTED · ${s.l}` : waist && laInUse ? 'IN LANDING AREA' : s.l;
        const wt = spotted ? landingWeightLb(spotted.t.ty, spotted.t.lb) : null;
        return (
          <section key={k} className="pnl" aria-label={`Catapult ${k}`} style={{ padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>CAT {k}</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', padding: '2px 7px', borderRadius: 3, background: s.bg, color: s.fg }}>{label}</span>
              <span style={{ flex: 1 }} />
              <div style={SEG} role="radiogroup" aria-label={`Catapult ${k} status`}>
                {CAT_STATUS.map((x) => (
                  <button key={x.k} role="radio" aria-checked={c.status === x.k} disabled={readOnly} onClick={() => save(k, { status: x.k, queue: q })} style={{ border: 0, height: 22, padding: '0 6px', borderRadius: 3, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, cursor: readOnly ? 'default' : 'pointer', background: c.status === x.k ? x.bg : 'transparent', color: c.status === x.k ? x.fg : '#7D8896' }}>
                    {x.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {q.map((key, i) => (
                <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 7px', borderRadius: 4, border: `1px solid ${i === 0 && spotted ? '#5FD068' : '#374250'}`, background: i === 0 && spotted ? 'rgba(95,208,104,.16)' : 'transparent' }}>
                  {name(key)}
                  {!readOnly && (
                    <button aria-label={`Remove ${name(key)} from cat ${k}`} onClick={() => save(k, { status: c.status, queue: q.filter((x) => x !== key) })} style={{ border: 0, background: 'transparent', color: '#93A1B0', cursor: 'pointer', padding: '0 2px', fontSize: 12 }}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && free.length > 0 && q.length < 12 && (
                <select aria-label={`Queue an aircraft on cat ${k}`} value="" onChange={(e) => e.target.value && save(k, { status: c.status, queue: [...q, e.target.value] })} style={{ height: 24, background: '#0E1116', color: '#93A1B0', border: '1px dashed #374250', borderRadius: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                  <option value="">+ queue</option>
                  {free.map(([key, t]) => (
                    <option key={key} value={key}>
                      {id(t)} {shortType(t.ty)} · {fuelK(t.lb)}
                    </option>
                  ))}
                </select>
              )}
              {!q.length && (readOnly || !free.length) && <span style={{ color: '#6B7683' }}>Empty</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, padding: '6px 0 0' }}>
              <span style={{ color: '#93A1B0' }}>Weight board · JBD</span>
              <span>{spotted ? `${wt ? wt.toLocaleString('en-US') : '—'} · ${c.status === 'ready' ? 'UP' : 'DOWN'}` : '— · DOWN'}</span>
            </div>
          </section>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- lights

const LC: Record<string, string> = { ON: '#5FD068', OFF: '#C9D3DD', AUTO: '#A08CFF', GREEN: '#5FD068', RED: '#FF6B66', VIOLET: '#D27CFF', YELLOW: '#E7D04F', NIGHT: '#E7B04F' };
const SHORT: Partial<Record<LightSetting, string>> = { VIOLET: 'VIO', YELLOW: 'YEL', GREEN: 'GRN' };

export const LightsPanel: React.FC<{ items: LightItem[]; ops?: OpsState; setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void; readOnly: boolean; title?: string }> = ({ items, ops, setOps, readOnly, title }) => {
  const cur = ops?.lights ?? {};
  return (
    <section className="pnl" aria-label={title ?? 'Lights'} style={{ padding: 10 }}>
      {title && <div className="lbl" style={{ marginBottom: 6 }}>{title}</div>}
      {items.map(([k, n, opts, d0]) => {
        const v = cur[k] ?? d0;
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6, padding: '3px 0' }}>
            <span className="mono" style={{ fontSize: 12 }}>{n}</span>
            <div style={SEG} role="radiogroup" aria-label={n}>
              {opts.map((o) => (
                <button key={o} role="radio" aria-checked={v === o} disabled={readOnly} onClick={() => setOps({ lights: { ...cur, [k]: o } })} style={{ border: 0, height: 24, fontSize: 11, padding: '0 7px', borderRadius: 4, fontFamily: "'Saira', sans-serif", cursor: readOnly ? 'default' : 'pointer', background: v === o ? `${LC[o]}33` : 'transparent', color: v === o ? LC[o] : '#7D8896', boxShadow: `inset 0 0 0 1px ${v === o ? LC[o] : 'transparent'}` }}>
                  {SHORT[o] ?? o}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};
