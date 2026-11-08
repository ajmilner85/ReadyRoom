/** Radar panels and dialogs, ported from catcc-handoff/mockup/Main.dc.html and Comms.dc.html. */
import React, { useEffect, useState } from 'react';
import type { CommsPlanEntry } from '../../../types/CommsTypes';
import { supabase } from '../../../utils/supabaseClient';
import { normalizeCommsEntries } from '../../../types/CommsTypes';
import { norm360 } from '../../../catcc/core/geo.ts';
import type { Assignment, CarrierPlan } from '../../../catcc/core/room/protocol.ts';
import { IcChevron, IcEdit, IcGoTo, IcPopOut, IcX } from '../icons.tsx';
import { Icon } from '../../ui/primitives';
import type { CoordGeom, CoordSetting } from '../../../catcc/core/geometry/coordination.ts';
import { CONFLICT_DEF, LAYER_GROUPS, LW_STEPS, UI_DEF, UI_STEPS, type ConflictCfg, type Editing, type Highlight, type Placement, type UiScale } from './types.ts';
import type { ScopeTrack } from '../scopeModel.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const iconBtn: React.CSSProperties = { width: 24, height: 24, border: 0, borderRadius: 4, background: 'transparent', color: '#93A1B0', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const smallBtn: React.CSSProperties = { width: 22, height: 22, border: '1px solid #374250', borderRadius: 4, background: '#1A212A', color: '#E6EDF3', cursor: 'pointer', padding: 0 };

// ---------------------------------------------------------------- radials manager

export interface RadialsProps {
  plan: CarrierPlan;
  emr: number;
  hel: number;
  placement: Placement;
  status: { text: string; color: string };
  hl: Highlight | null;
  onHl: (h: Highlight | null) => void;
  onArm: (k: 'dep' | 'm') => void;
  onEdit: (e: Editing) => void;
  onCancel: () => void;
  onRemoveDep: (r: number) => void;
  onRemoveStack: (id: string) => void;
  onBase: (id: string, d: number) => void;
  onToggleStack: (id: string) => void;
  coords: { hull: string; g: CoordGeom }[];
  onCoordSet: (other: string, s: CoordSetting | null) => void;
  onCoordPlace: (other: string) => void;
  assignments: Map<string, Assignment>;
  hull: string;
  air: ScopeTrack[];
  readOnly: boolean;
}

export const RadialsPanel: React.FC<RadialsProps> = (p) => {
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const { placing, editing } = p.placement;
  const armBtn = (k: 'dep' | 'm') => {
    const on = placing === k && !editing;
    return (
      <button
        onClick={() => p.onArm(k)}
        disabled={p.readOnly}
        title={p.readOnly ? 'Claim a seat on this carrier to edit' : undefined}
        style={{ height: 28, padding: '0 10px', borderRadius: 5, fontFamily: "'Saira', sans-serif", fontSize: 12, cursor: p.readOnly ? 'default' : 'pointer', background: on ? 'rgba(241,88,34,.18)' : 'transparent', border: `1px solid ${on ? '#F15822' : '#374250'}`, color: on ? '#FFB08F' : '#E6EDF3', opacity: p.readOnly ? 0.5 : 1 }}
      >
        {on ? 'Cancel' : k === 'dep' ? 'Add' : 'Add stack'}
      </button>
    );
  };
  const row = (o: {
    key: string;
    name: string;
    fg: string;
    r: string;
    alt: string;
    lit: boolean;
    sel: boolean;
    onPick: () => void;
    onEdit?: () => void;
    onRemove?: () => void;
    isStack?: boolean;
    stackId?: string;
    baseAlt?: number;
    levels?: React.ReactNode;
    /** stack on/off toggle (stacks only) */
    toggleId?: string;
  }) => (
    <div key={o.key} style={{ borderRadius: 5, background: o.sel ? 'rgba(241,88,34,.14)' : o.lit ? '#2E3946' : '#222C37', border: `1px solid ${o.sel ? '#F15822' : o.lit ? '#E6EDF3' : 'transparent'}` }}>
      <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 4px 0 0', fontSize: 12.5 }}>
        {o.toggleId && (
          <button
            onClick={() => p.onToggleStack(o.toggleId!)}
            disabled={p.readOnly}
            aria-pressed={!p.plan.off?.includes(o.toggleId)}
            title={p.plan.off?.includes(o.toggleId) ? 'Stack off · click to enable' : 'Stack on · click to disable'}
            style={{ ...iconBtn, marginLeft: 4, marginRight: -6, cursor: p.readOnly ? 'default' : 'pointer', color: p.plan.off?.includes(o.toggleId) ? '#5E6A78' : '#93A1B0' }}
          >
            <Icon name={p.plan.off?.includes(o.toggleId) ? 'eyeOff' : 'eye'} size={13} />
          </button>
        )}
        <button onClick={o.onPick} aria-pressed={o.lit} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 0 0 8px', border: 0, background: 'transparent', color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ width: 74, color: o.fg, opacity: o.toggleId && p.plan.off?.includes(o.toggleId) ? 0.45 : 1 }}>{o.name}</span>
          <span style={{ fontWeight: 600 }}>{o.r}</span>
          <span style={{ color: '#93A1B0' }}>{o.alt}</span>
        </button>
        <span style={{ flex: 1 }} />
        {o.levels !== undefined && (
          <button onClick={() => setExp((e) => ({ ...e, [o.key]: !e[o.key] }))} aria-expanded={!!exp[o.key]} title="Levels" style={iconBtn}>
            <IcChevron rot={exp[o.key] ? 180 : 0} />
          </button>
        )}
        {o.onEdit && !o.sel && !p.readOnly && (
          <button onClick={o.onEdit} title="Edit" style={iconBtn}>
            <IcEdit />
          </button>
        )}
        {o.onRemove && !p.readOnly && (
          <button onClick={o.onRemove} title="Remove" style={iconBtn}>
            <IcX />
          </button>
        )}
      </div>
      {o.sel && (
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 6px 8px', fontSize: 11.5 }}>
          {o.isStack && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#93A1B0' }}>Base</span>
              <button onClick={() => p.onBase(o.stackId!, -1)} aria-label="Lower base altitude" style={smallBtn}>−</button>
              <span style={{ minWidth: 30, textAlign: 'center', color: '#E6EDF3' }}>{o.alt}</span>
              <button onClick={() => p.onBase(o.stackId!, 1)} aria-label="Raise base altitude" style={smallBtn}>+</button>
            </span>
          )}
          <span style={{ flex: 1, color: p.status.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.status.text}</span>
          <button onClick={p.onCancel} style={{ height: 24, padding: '0 8px', border: '1px solid #374250', borderRadius: 4, background: 'transparent', color: '#E6EDF3', cursor: 'pointer', fontFamily: "'Saira', sans-serif", fontSize: 11.5 }}>Cancel</button>
        </div>
      )}
      {o.levels !== undefined && exp[o.key] && o.levels}
    </div>
  );
  const levelsOf = (id: string, base: number) => {
    const occ = new Map<number, { ac: string; eat: string; st: string }>();
    for (const [tid, a] of p.assignments) {
      if (a.stackId !== id || a.carrier !== p.hull) continue;
      const t = p.air.find((x) => x.id === tid);
      const m = Math.floor(((a.eatS % 86400) + 86400) % 86400 / 60) % 60;
      occ.set(a.angels, { ac: t?.bd ?? t?.cs ?? tid, eat: `:${String(m).padStart(2, '0')}`, st: t?.lb !== undefined ? (t.lb / 1000).toFixed(1) : '' });
    }
    const top = Math.max(base + 5, ...[...occ.keys()]);
    return (
      <div style={{ padding: '0 4px 5px' }}>
        <div className="srow" style={{ color: '#6B7683', fontSize: 10, letterSpacing: '.06em' }}>
          <span>ANG</span><span>DME</span><span>EAT</span><span>A/C</span><span>ST</span>
        </div>
        {Array.from({ length: top - base + 1 }, (_, i) => base + i).map((a) => {
          const o = occ.get(a);
          return (
            <div key={a} className="srow" style={{ background: 'transparent', color: o ? '#E6EDF3' : '#6B7683', border: '1px solid transparent' }}>
              <span>{a}</span><span>{a + 15}</span><span>{o?.eat ?? '—'}</span><span>{o?.ac ?? 'open'}</span><span>{o?.st ?? ''}</span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <section className="pnl" aria-label="Departure and marshal radials" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="lbl">Departure radials</span>
          {armBtn('dep')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {p.plan.deps.map((r) =>
            row({
              key: `d${r}`,
              name: 'DR',
              fg: '#C9D3DD',
              r: `${r3(r)}R`,
              alt: '',
              lit: p.hl?.k === 'dep' && p.hl.id === r,
              sel: editing?.k === 'dep' && editing.r === r,
              onPick: () => p.onHl(p.hl?.k === 'dep' && p.hl.id === r ? null : { k: 'dep', id: r }),
              onEdit: () => p.onEdit({ k: 'dep', r }),
              onRemove: () => p.onRemoveDep(r),
            }),
          )}
          {!p.plan.deps.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683', padding: '2px 2px' }}>None</div>}
        </div>
      </div>
      <div style={{ height: 1, background: '#262F3A' }} />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="lbl">Marshal</span>
          {armBtn('m')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {p.plan.stacks.map((m) =>
            row({
              key: `m${m.id}`,
              name: `Stack ${m.id}`,
              fg: '#FFB08F',
              r: `${r3(m.r)}R`,
              alt: `A${m.base}+`,
              lit: p.hl?.k === 'm' && p.hl.id === m.id,
              sel: editing?.k === 'm' && editing.id === m.id,
              onPick: () => p.onHl(p.hl?.k === 'm' && p.hl.id === m.id ? null : { k: 'm', id: m.id }),
              onEdit: () => p.onEdit({ k: 'm', id: m.id }),
              onRemove: p.plan.stacks.length > 1 ? () => p.onRemoveStack(m.id) : undefined,
              isStack: true,
              stackId: m.id,
              levels: levelsOf(m.id, m.base),
              toggleId: m.id,
            }),
          )}
          {row({ key: 'e', name: 'Emergency', fg: '#E7B04F', r: `${r3(p.emr)}R`, alt: 'A6+', lit: p.hl?.k === 'e', sel: false, onPick: () => p.onHl(p.hl?.k === 'e' ? null : { k: 'e' }), levels: levelsOf('E', 6), toggleId: 'E' })}
          {row({ key: 'h', name: 'Helo', fg: '#6FB6E6', r: `${r3(p.hel)}R`, alt: '1000 ft', lit: p.hl?.k === 'h', sel: false, onPick: () => p.onHl(p.hl?.k === 'h' ? null : { k: 'h' }), toggleId: 'H' })}
        </div>
      </div>
      {placing && !editing && <div className="mono" style={{ fontSize: 12, color: p.status.color }}>{p.status.text}</div>}
      {p.coords.length > 0 && (
        <>
          <div style={{ height: 1, background: '#262F3A' }} />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="lbl">Coordination</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {p.coords.map(({ hull, g }) => (
                <CoordRow key={hull} hull={hull} g={g} readOnly={p.readOnly} placing={placing === 'coord' && editing?.k === 'coord' && editing.hull === hull} onSet={(s) => p.onCoordSet(hull, s)} onPlace={() => p.onCoordPlace(hull)} onCancel={p.onCancel} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- coordination line row

const CoordRow: React.FC<{ hull: string; g: CoordGeom; readOnly: boolean; placing: boolean; onSet: (s: CoordSetting | null) => void; onPlace: () => void; onCancel: () => void }> = ({ hull, g, readOnly, placing, onSet, onPlace, onCancel }) => {
  const [open, setOpen] = useState(false);
  const [brg, setBrg] = useState('');
  const [off, setOff] = useState('');
  const start = () => {
    setBrg(String(Math.round(g.brg)).padStart(3, '0'));
    setOff(g.off.toFixed(1));
    setOpen(true);
  };
  const apply = () => {
    const b = Number(brg);
    const o = Number(off);
    if (Number.isFinite(b) && Number.isFinite(o) && b >= 0 && b < 360 && Math.abs(o) <= 100) {
      onSet({ brg: b, off: o });
      setOpen(false);
    }
  };
  const input: React.CSSProperties = { width: 52, height: 22, background: '#0E1116', border: '1px solid #374250', borderRadius: 4, color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, padding: '0 5px' };
  const btn: React.CSSProperties = { height: 24, padding: '0 8px', border: '1px solid #374250', borderRadius: 4, background: 'transparent', color: '#E6EDF3', cursor: 'pointer', fontFamily: "'Saira', sans-serif", fontSize: 11.5 };
  const sel = open || placing;
  return (
    <div style={{ borderRadius: 5, background: sel ? 'rgba(241,88,34,.14)' : '#222C37', border: `1px solid ${sel ? '#F15822' : 'transparent'}` }}>
      <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 4px 0 8px', fontSize: 12.5 }}>
        <span style={{ width: 74, color: '#6FB6E6' }}>{hull}</span>
        <span style={{ fontWeight: 600 }}>{String(Math.round(g.brg)).padStart(3, '0')}°</span>
        <span style={{ color: '#93A1B0' }}>{g.off.toFixed(1)} NM</span>
        {g.auto && <span style={{ fontSize: 10, color: '#6B7683', letterSpacing: '.08em' }}>AUTO</span>}
        <span style={{ flex: 1 }} />
        {!readOnly && !sel && (
          <button onClick={start} title="Adjust coordination line" style={iconBtn}>
            <IcEdit />
          </button>
        )}
      </div>
      {placing && (
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 6px 8px', fontSize: 11.5 }}>
          <span style={{ flex: 1, color: '#FFB08F' }}>Point at where the line crosses our radial · click to set</span>
          <button onClick={onCancel} style={btn}>Cancel</button>
        </div>
      )}
      {open && !placing && (
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 6px 8px', fontSize: 11.5, flexWrap: 'wrap' }}>
          <span style={{ color: '#93A1B0' }}>BRG</span>
          <input style={input} value={brg} onChange={(e) => setBrg(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && apply()} aria-label="Coordination line bearing" />
          <span style={{ color: '#93A1B0' }}>OFF</span>
          <input style={input} value={off} onChange={(e) => setOff(e.target.value.replace(/[^0-9.\-]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && apply()} aria-label="Coordination line offset from this carrier, NM" />
          <span style={{ flex: 1 }} />
          <button onClick={apply} style={btn}>Set</button>
          <button onClick={() => { setOpen(false); onPlace(); }} style={btn}>Place</button>
          <button onClick={() => { onSet(null); setOpen(false); }} style={btn}>Auto</button>
          <button onClick={() => setOpen(false)} style={btn}>Cancel</button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- notifications

export interface Note {
  id: string;
  k: 'conflict' | 'warn' | 'coord' | 'info';
  kind: string;
  t: string;
  title: string;
  body?: string;
  goTo?: [number, number];
}
const KINDS = {
  conflict: { fg: '#FF8A85', bc: '#E0524E', bg: 'rgba(224,82,78,.10)' },
  warn: { fg: '#E7B04F', bc: '#8A6A2A', bg: 'rgba(222,154,31,.07)' },
  coord: { fg: '#6FB6E6', bc: '#2F5F80', bg: 'rgba(62,155,212,.07)' },
  info: { fg: '#93A1B0', bc: '#262F3A', bg: '#1A212A' },
};

export const Notifications: React.FC<{ notes: Note[]; onAck: (id: string) => void; onGoTo: (p: [number, number]) => void }> = ({ notes, onAck, onGoTo }) => (
  <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="lbl">Notifications</span>
      <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{notes.length}</span>
    </div>
    {notes.map((n) => {
      const k = KINDS[n.k];
      return (
        <article key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, border: `1px solid ${k.bc}`, background: k.bg }}>
          <button aria-label="Go to on scope" title="Go to on scope" onClick={() => n.goTo && onGoTo(n.goTo)} disabled={!n.goTo} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'transparent', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, cursor: n.goTo ? 'pointer' : 'default', flex: '0 0 30px', opacity: n.goTo ? 1 : 0.4 }}>
            <IcGoTo />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 600, color: k.fg }}>{n.kind}</span>
              <span className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>{n.t}</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
            {n.body && <div className="mono" style={{ fontSize: 11.5, color: '#FFC2BF' }}>{n.body}</div>}
          </div>
          <button onClick={() => onAck(n.id)} style={{ height: 30, padding: '0 10px', background: 'transparent', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 12, cursor: 'pointer' }}>
            Ack
          </button>
        </article>
      );
    })}
  </>
);

// ---------------------------------------------------------------- layers

const SHARED: Record<string, true> = { coord: true, latlon: true, grid: true };

export const LayersPanel: React.FC<{ ov: Record<string, boolean>; ov2: Record<string, boolean>; set: (ov: Record<string, boolean>, ov2: Record<string, boolean>) => void; hull: string; other?: string }> = ({ ov, ov2, set, hull, other }) => {
  const labels = LAYER_GROUPS.flatMap((g) => g[1]);
  const allOn = labels.every(([k]) => ov[k] && (SHARED[k] || k === 'cca' || ov2[k]));
  const toggleAll = () => {
    const n: Record<string, boolean> = {};
    const n2: Record<string, boolean> = {};
    labels.forEach(([k]) => {
      n[k] = !allOn;
      if (!SHARED[k] && k !== 'cca') n2[k] = !allOn;
    });
    set(n, n2);
  };
  return (
    <section aria-label="Layers" style={{ width: 290, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="lbl">Layers</span>
        <button onClick={toggleAll} style={{ background: '#222C37', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '3px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, cursor: 'pointer' }}>
          {allOn ? 'All off' : 'All on'}
        </button>
      </div>
      <div className="lrow" style={{ marginTop: 4 }}>
        <span />
        <span className="mono" style={{ fontSize: 9.5, color: '#93A1B0', letterSpacing: '.06em' }}>{hull}</span>
        <span className="mono" style={{ fontSize: 9.5, color: '#6FB6E6', letterSpacing: '.06em' }}>{other ?? 'OTHER'}</span>
      </div>
      {LAYER_GROUPS.map(([t, items]) => (
        <React.Fragment key={t}>
          <div className="lbl" style={{ fontSize: 9.5, color: '#6B7683', margin: '8px 0 2px 2px' }}>{t}</div>
          {items.map(([k, l, c]) => {
            const has2 = !SHARED[k] && k !== 'cca';
            return (
              <div key={k} className="lrow" style={{ color: ov[k] || (has2 && ov2[k]) ? '#E6EDF3' : '#93A1B0' }}>
                <span style={{ paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
                <button className="lcb" onClick={() => set({ ...ov, [k]: !ov[k] }, ov2)} aria-pressed={!!ov[k]} aria-label={`${l} · ${hull}`}>
                  <span style={{ borderColor: c, background: ov[k] ? c : 'transparent' }} />
                </button>
                {has2 ? (
                  <button className="lcb" onClick={() => set(ov, { ...ov2, [k]: !ov2[k] })} aria-pressed={!!ov2[k]} aria-label={`${l} · ${other ?? 'other carriers'}`}>
                    <span style={{ borderColor: '#3E9BD4', background: ov2[k] ? '#3E9BD4' : 'transparent' }} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </section>
  );
};

// ---------------------------------------------------------------- frequencies (ReadyRoom comms plan)

export function useCommsPlan(): { plan: CommsPlanEntry[] | null; source: string | null } {
  const [res, setRes] = useState<{ plan: CommsPlanEntry[] | null; source: string | null }>({ plan: null, source: null });
  useEffect(() => {
    let off = false;
    (async () => {
      const now = Date.now();
      const { data: events } = await supabase
        .from('events')
        .select('id, name, start_datetime')
        .gte('start_datetime', new Date(now - 18 * 3_600_000).toISOString())
        .lte('start_datetime', new Date(now + 18 * 3_600_000).toISOString());
      if (!events?.length) return;
      const sorted = [...events].sort((a, b) => Math.abs(Date.parse(a.start_datetime) - now) - Math.abs(Date.parse(b.start_datetime) - now));
      const { data: missions } = await supabase.from('missions').select('event_id, mission_settings').in('event_id', sorted.map((e) => e.id));
      for (const e of sorted) {
        const m = missions?.find((x) => x.event_id === e.id);
        const plan = (m?.mission_settings as { comms_plan?: unknown } | null)?.comms_plan;
        if (Array.isArray(plan) && plan.length) {
          if (!off) setRes({ plan: normalizeCommsEntries(plan), source: e.name });
          return;
        }
      }
    })().catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  return res;
}

const blank = (s: string | undefined) => !s || /^[—\-–\s]*$/.test(s);

export const FreqPanel: React.FC<{ plan: CommsPlanEntry[] | null; source: string | null }> = ({ plan, source }) => {
  const com = (plan ?? []).filter((e) => !blank(e.name) && !blank(e.freq));
  const nav = (plan ?? []).flatMap((e) => [
    ...(!blank(e.tacan) ? [{ name: `TACAN · ${e.name}`, v: e.tacan }] : []),
    ...(!blank(e.ils) ? [{ name: `ICLS · ${e.name}`, v: e.ils }] : []),
  ]);
  return (
    <section aria-label="Frequencies" style={{ width: 270, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: '8px 10px', boxShadow: '0 10px 30px rgba(0,0,0,.5)', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div className="frow" style={{ color: '#6B7683', fontSize: 9.5, letterSpacing: '.1em' }}>
        <span>COM</span><span /><span style={{ textAlign: 'center' }}>PRI</span><span style={{ textAlign: 'center' }}>AUX</span>
      </div>
      {com.map((e, i) => (
        <div key={i} className="frow">
          <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
          <span style={{ textAlign: 'right' }}>{e.freq}</span>
          {e.radio !== 'AUX' && e.chan ? <span className="fch">{e.chan}</span> : <span style={{ color: '#4A5562' }}>—</span>}
          {e.radio === 'AUX' && e.chan ? <span className="fch">{e.chan}</span> : <span style={{ color: '#4A5562' }}>—</span>}
        </div>
      ))}
      {!plan && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683', padding: '4px 0' }}>No comms plan for a nearby event</div>}
      {nav.length > 0 && (
        <>
          <div className="frow" style={{ color: '#6B7683', fontSize: 9.5, letterSpacing: '.1em', marginTop: 6, paddingTop: 8, borderTop: '1px solid #262F3A' }}>
            <span>NAV</span><span />
          </div>
          {nav.map((n, i) => (
            <div key={i} className="frow">
              <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
              <span style={{ textAlign: 'right' }}>{n.v}</span>
              <span /><span />
            </div>
          ))}
        </>
      )}
      {source && <div className="mono" style={{ fontSize: 10, color: '#6B7683', marginTop: 6 }}>Comms plan · {source}</div>}
    </section>
  );
};

// ---------------------------------------------------------------- display settings

export const DisplaySettings: React.FC<{ ui: UiScale; conflict: ConflictCfg; onApply: (u: UiScale, c: ConflictCfg) => void; onClose: () => void }> = ({ ui, conflict, onApply, onClose }) => {
  const [d, setD] = useState<UiScale>(ui);
  const [cf, setCf] = useState<ConflictCfg>(conflict);
  const sel = (label: string, hint: string, value: number, opts: number[], fmt: (n: number) => string, set: (n: number) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 14, alignItems: 'center', padding: '8px 0' }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        <div className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{hint}</div>
      </div>
      <select value={value} onChange={(e) => set(+e.target.value)} style={{ background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
        {opts.map((o) => (
          <option key={o} value={o}>{fmt(o)}</option>
        ))}
      </select>
    </div>
  );
  const RP = 860 / 97;
  const x = (k: keyof UiScale) => (k === 'l' ? LW_STEPS : UI_STEPS)[d[k] - 1];
  const row = (k: keyof UiScale, label: string, preview: React.ReactNode) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 236px', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #262F3A' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
          <span className="mono" style={{ fontSize: 11.5, color: d[k] !== ui[k] ? '#FFB08F' : '#93A1B0' }}>
            ×{x(k).toFixed(2)}
            {d[k] !== ui[k] ? ` · was ×${(k === 'l' ? LW_STEPS : UI_STEPS)[ui[k] - 1].toFixed(2)}` : ''}
          </span>
        </div>
        <input className="uirng" type="range" min="1" max="5" step="1" value={d[k]} onChange={(e) => setD({ ...d, [k]: +e.target.value })} aria-label={label} />
        <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6B7683', padding: '2px 3px 0' }}>
          <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 72, background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 6, overflow: 'hidden' }}>{preview}</div>
    </div>
  );
  const hp = 0.8 * RP * x('h');
  const tp = 0.32 * RP * x('h');
  const dots: React.ReactNode[] = [];
  ([[40, 40, 'sq'], [120, 30, 'sq'], [196, 44, 'ci']] as const).forEach(([cx, cy, t], j) => {
    for (let i = 5; i >= 1; i--) dots.push(<div key={`${j}${i}`} style={{ position: 'absolute', left: cx - i * 7, top: cy + i * 3, width: tp, height: tp, margin: `${-tp / 2}px 0 0 ${-tp / 2}px`, background: '#3E9A4C', opacity: 1 - i * 0.16, boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }} />);
    const w = t === 'ci' ? 0.9 * RP * x('h') : hp;
    dots.push(<div key={`${j}h`} style={{ position: 'absolute', left: cx, top: cy, width: w, height: w, margin: `${-w / 2}px 0 0 ${-w / 2}px`, background: j === 1 ? '#FF8A85' : '#5FD068', borderRadius: t === 'ci' ? '50%' : 0, boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }} />);
  });
  const fs = 0.9 * RP * x('t');
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,10,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 70 }}>
      <div role="dialog" aria-label="Display settings" style={{ width: 'min(560px, calc(100% - 32px))', background: '#151A21', border: '1px solid #374250', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #262F3A' }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Display settings</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', cursor: 'pointer', padding: 0 }}>
            <IcX size={14} sw={2} />
          </button>
        </div>
        <div style={{ padding: '6px 14px 4px' }}>
          {row('h', 'Radar hits', dots)}
          {row(
            't',
            'Data tags',
            <>
              <div style={{ position: 'absolute', left: 24, top: 46, width: 7, height: 7, background: '#5FD068' }} />
              <div style={{ position: 'absolute', left: 31, top: 36, width: 14, height: 1, background: '#5FD068', transform: 'rotate(-45deg)', transformOrigin: '0 0' }} />
              <div className="mono" style={{ position: 'absolute', left: 42, top: 40 - fs * 1.7, fontSize: fs, lineHeight: 1.12, color: '#5FD068', background: 'rgba(11,14,18,.72)', padding: '1px 3px', whiteSpace: 'nowrap' }}>
                106 F18E 7.4<br />↓168 420<br />RMK ICLS ONLY
              </div>
            </>,
          )}
          {row(
            'l',
            'Line weight',
            <svg width="236" height="72" style={{ position: 'absolute', inset: 0 }}>
              <path d="M-20 70 A 120 120 0 0 1 200 -10" fill="none" stroke="rgba(64,168,91,.5)" strokeWidth={x('l')} />
              <path d="M18 60 L70 22 L150 22 Q170 22 178 40" fill="none" stroke="rgba(147,161,176,.8)" strokeWidth={x('l')} strokeDasharray="6 4" />
              <path d="M150 58 L214 30" fill="none" stroke="#E45BEA" strokeWidth={1.6 * x('l')} />
              <path d="M40 66 L90 50" fill="none" stroke="#5FD068" strokeWidth={1.8 * x('l')} strokeLinecap="round" />
            </svg>,
          )}
          {row(
            'o',
            'Other scope text',
            <>
              <div className="mono" style={{ position: 'absolute', left: 12, top: 10, fontSize: 0.8 * RP * x('o'), color: '#93A1B0' }}>BRC 345</div>
              <div className="mono" style={{ position: 'absolute', left: 12, top: 40, fontSize: 0.8 * RP * x('o'), color: '#5E9A6C' }}>20 NM</div>
              <div className="mono" style={{ position: 'absolute', left: 96, top: 40, fontSize: 0.72 * RP * x('o'), color: '#7D8896' }}>26°20'N</div>
              <div className="mono" style={{ position: 'absolute', left: 120, top: 10, transform: `scale(${(x('o') * 0.8 * RP) / 10.5})`, transformOrigin: '0 0', height: 16, lineHeight: '16px', padding: '0 11px 0 6px', fontSize: 10.5, color: '#E6EDF3', background: '#151A21', border: '1px solid #93A1B0', clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%)' }}>
                DR 285
              </div>
            </>,
          )}
          <div className="lbl" style={{ margin: '12px 0 2px' }}>Conflict alerts</div>
          {sel('Look-ahead', 'Alert when both standards are lost within this time', cf.lookAheadS, [60, 90, 120, 180, 240], (n) => `${n} s`, (n) => setCf({ ...cf, lookAheadS: n }))}
          {sel('Vertical prediction', 'Climb/descent extrapolated this long, then level', cf.vertCapS, [0, 15, 30, 60, 120], (n) => (n ? `${n} s` : 'Off'), (n) => setCf({ ...cf, vertCapS: n }))}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px' }}>
          <button onClick={() => { setD(UI_DEF); setCf(CONFLICT_DEF); }} style={{ height: 32, padding: '0 12px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>Reset</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ height: 32, padding: '0 14px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onApply(d, cf)} style={{ height: 32, padding: '0 16px', border: '1px solid #F15822', borderRadius: 5, background: '#F15822', color: '#0E1116', fontFamily: "'Saira', sans-serif", fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- reference

const MIN_ROWS: [string, string, string][] = [
  ['JET', 'Non-precision', '600-1-1/4'], ['', 'ICLS', '300-3/4'], ['', 'ICLS/ILM w/ SPN-42/46', '200-1/2'], ['', 'Mode I', 'As certified'], ['', 'Mode IA, II, IIT, III', '200-1/2'],
  ['TURBOPROP', 'Non-precision', '400-1'], ['', 'ICLS', '300-3/4'], ['', 'ICLS/ILM w/ SPN-42/46', '200-1/2'], ['', 'Mode II / IIT / III', '200-1/2'],
  ['HELO', 'Non-precision', '300-3/4'], ['', 'Mode III', '200-1/2'],
];

export const Reference: React.FC<{ onClose: () => void; current: { hull: string; ceiling: number | null; vis: number | null } }> = ({ onClose, current }) => {
  const [tab, setTab] = useState<'min' | 'app' | 'helo' | 'docs'>('min');
  const above = (current.ceiling ?? 99999) >= 600 && (current.vis ?? 10) >= 1.25;
  return (
    <div role="dialog" aria-label="Reference" style={{ position: 'absolute', top: 58, right: 16, width: 'min(600px, calc(100% - 32px))', maxHeight: 'calc(100% - 76px)', display: 'flex', flexDirection: 'column', background: '#151A21', border: '1px solid #374250', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', zIndex: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #262F3A', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Reference</div>
        <div style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
          {([['min', 'Minimums'], ['app', 'Approaches'], ['helo', 'Helo ops'], ['docs', 'Documents']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ border: 0, padding: '5px 10px', borderRadius: 4, background: tab === k ? '#222C37' : 'transparent', color: tab === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button aria-label="Open in new window" title="Open in new window" onClick={() => window.open(`${window.location.pathname}?m=reference`, '_blank', 'popup,width=640,height=760')} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', cursor: 'pointer', padding: 0 }}>
          <IcPopOut />
        </button>
        <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', cursor: 'pointer', padding: 0 }}>
          <IcX size={14} sw={2} />
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tab === 'min' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="mono" style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6, background: above ? 'rgba(64,168,91,.12)' : 'rgba(224,82,78,.12)', border: `1px solid ${above ? '#2F6B40' : '#8A3330'}`, color: above ? '#A9E2B9' : '#FFC2BF' }}>
              Current over {current.hull || 'the carrier'}: {current.ceiling != null ? `${current.ceiling} ft` : 'no ceiling'} / {current.vis != null ? `${current.vis.toFixed(1)} NM` : 'vis unknown'}. {above ? 'Above all published minima.' : 'Below non-precision minima.'}
            </div>
            <div className="lbl">Approach weather minimums · ceiling (ft) – visibility (SM) · Fig 6-6</div>
            <div style={{ border: '1px solid #262F3A', borderRadius: 6, overflow: 'hidden' }}>
              <div className="mono" style={{ display: 'grid', gridTemplateColumns: '96px 1fr 110px', gap: 8, padding: '6px 10px', background: '#1A212A', fontSize: 10.5, letterSpacing: '.08em', color: '#93A1B0' }}>
                <span>AIRCRAFT</span><span>APPROACH</span><span>MINIMUMS</span>
              </div>
              {MIN_ROWS.map(([ac, ap, min], i) => (
                <div key={i} className="mono" style={{ display: 'grid', gridTemplateColumns: '96px 1fr 110px', gap: 8, padding: '5px 10px', borderTop: '1px solid #262F3A', fontSize: 12 }}>
                  <span style={{ color: '#93A1B0' }}>{ac}</span><span>{ap}</span><span style={{ fontWeight: 600 }}>{min}</span>
                </div>
              ))}
            </div>
            <div className="lbl">Chart minimums · CV-1 / CV-2</div>
            <div style={{ border: '1px solid #262F3A', borderRadius: 6, overflow: 'hidden' }}>
              <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px', gap: 8, padding: '6px 10px', background: '#1A212A', fontSize: 10.5, letterSpacing: '.08em', color: '#93A1B0' }}>
                <span>CATEGORY</span><span>JET</span><span>TURBOPROP</span>
              </div>
              {[
                ['ICLS', '360-3/4', '300 (300-3/4)'],
                ['ICLS/ILM w/ SPN-42/46 · S-PALS', '260-1/2', '200 (200-1/2)'],
                ['S-ASR / S-TAC', '600-1-1/4 · 540', '400-1 · 340'],
              ].map(([a, b, c]) => (
                <div key={a} className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px', gap: 8, padding: '5px 10px', borderTop: '1px solid #262F3A', fontSize: 12 }}>
                  <span style={{ color: '#93A1B0' }}>{a}</span><span>{b}</span><span>{c}</span>
                </div>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>PALS Mode I aircraft without an operating ILM may be certified to 200-1/2. Avg deck elev 60 ft.</div>
          </div>
        )}
        {tab === 'app' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pnl"><div style={{ fontWeight: 600 }}>CV-1 TACAN · jet / turboprop</div><div className="mono" style={{ fontSize: 12, color: '#C9D3DD', marginTop: 4 }}>Marshal on reciprocal of FB. Platform 5000. 1200 ft by 10 DME, FB inbound through 6 DME to FAF 3 DME.<br />Bolter/waveoff: no instructions by 4 DME / 2 min, turn downwind, report abeam. No COMM, turn to FB at 4 DME.</div></div>
            <div className="pnl"><div style={{ fontWeight: 600 }}>CV-2 TACAN overhead · jet / turboprop</div><div className="mono" style={{ fontSize: 12, color: '#C9D3DD', marginTop: 4 }}>Marshal as assigned, IAF 4 DME on 030 relative. Overhead, outbound 210 relative descending. Level left turn not before 10 DME at 1/3 marshal altitude, onto FB at 10 DME, 1200 ft. FAF 3 DME.</div></div>
            <div className="pnl"><div style={{ fontWeight: 600 }}>CV-3 TACAN · helicopter</div><div className="mono" style={{ fontSize: 12, color: '#C9D3DD', marginTop: 4 }}>IAF on 110 relative. Inbound 290 to 3 DME, 3 DME arc to FB, FAF 3 DME at 500 ft. Minima: S-ASR 260-1/2, S-TAC 300-3/4.<br />Missed approach: no instructions by 4 DME / 2 min, turn downwind, report abeam. No COMM, reenter FB through 3 DME FAF.</div></div>
            <div className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>Courses are relative to FB. Turn on the CV-1, CV-2 and CV-3 layers to draw each one on the scope.</div>
          </div>
        )}
        {tab === 'helo' && (
          <div className="mono" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#C9D3DD' }}>
            <div style={{ fontFamily: "'Saira', sans-serif", fontWeight: 600, fontSize: 14, color: '#E6EDF3' }}>Helicopter restrictions during fixed-wing launch/recovery · Fig 4-3</div>
            <span>No helicopter operations within the shaded areas without Air Officer approval:</span>
            <span>· Within 1 NM of the ship.</span>
            <span>· 340°–020° relative, 1 to 5 NM ahead.</span>
            <span>· 150°–190° relative, 1 to 3 NM astern.</span>
            <span>Altitude limits: 200′ ahead, 300′ to port and 400′ to starboard inside 5 NM. 400′ from 5 to 10 NM.</span>
          </div>
        )}
        {tab === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['CV NATOPS', 'NAVAIR 00-80T-105 · Jul 2009 · PDF'],
              ['CVW kneeboard · Case III', 'Squadron differences from NATOPS'],
              ['Comms plan', 'Frequencies, buttons, TACAN/ICLS'],
            ].map(([t, d]) => (
              <div key={t} className="pnl" style={{ color: '#E6EDF3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <span style={{ fontWeight: 600 }}>{t}</span>
                  <span className="mono" style={{ display: 'block', fontSize: 11, color: '#93A1B0' }}>{d}</span>
                </span>
                <span className="mono" style={{ fontSize: 11, color: '#FFB08F' }}>[add file]</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- comms scripts (Comms.dc.html)

export interface CommsFields {
  id: string;
  type: string;
  brg: string;
  rng: string;
  angels: string;
  state: string;
  fb: string;
  altimeter: string;
  radial: string;
  dme: string;
  angelsM: string;
  eat: string;
  button: string;
  time: string;
  tanker: string;
}

const PHASES = (f: CommsFields) => [
  { title: 'Check-in', who: 'AIRCRAFT → MARSHAL', when: '~50 NM · Marshal freq', lines: [
    ['AIRCRAFT', `[${f.id}], marking Mother's [${f.brg}] for [${f.rng}], angels [${f.angels}], state [${f.state}].`],
    ['MARSHAL', `[${f.id}], Marshal, radar contact [${f.brg}] for [${f.rng}]. CASE III recovery, CV-1 approach, expected final bearing [${f.fb}], altimeter [${f.altimeter}].`],
  ] },
  { title: 'Marshal instructions', who: 'MARSHAL', when: 'After check-in', lines: [
    ['MARSHAL', `[${f.id}], marshal on the [${f.radial}] radial, [${f.dme}] DME, angels [${f.angelsM}]. Expected approach time [${f.eat}], approach button [${f.button}]. Time now [${f.time}].`],
    ['AIRCRAFT', `[${f.id}], marshal [${f.radial}], [${f.dme}], angels [${f.angelsM}], time [${f.eat}], button [${f.button}].`],
  ] },
  { title: 'Established', who: 'AIRCRAFT', when: 'In holding', lines: [['AIRCRAFT', `[${f.id}], established angels [${f.angelsM}], state [${f.state}].`], ['MARSHAL', `[${f.id}], roger.`]] },
  { title: 'Commencing', who: 'AIRCRAFT', when: 'Leaving fix at EAT', lines: [['AIRCRAFT', `[${f.id}], commencing, state [${f.state}], altimeter [${f.altimeter}].`], ['MARSHAL', `[${f.id}], roger, switch approach, button [${f.button}].`]] },
  { title: 'Platform', who: 'AIRCRAFT → APPROACH', when: 'Passing 5,000 ft', lines: [['AIRCRAFT', `[${f.id}], platform.`], ['APPROACH', `[${f.id}], Approach, radar contact [${f.rng}] miles, continue.`]] },
  { title: 'Dirty up', who: 'APPROACH', when: '10 DME · 1,200 ft', lines: [['APPROACH', `[${f.id}], [10] miles, dirty up.`], ['AIRCRAFT', `[${f.id}], dirty.`]] },
  { title: '¾ mile · Ball call', who: 'APPROACH → LSO', when: '¾ NM', lines: [['APPROACH', `[${f.id}], three-quarter mile, call the ball.`], ['AIRCRAFT', `[${f.id}], [${f.type}] ball, [${f.state}].`], ['LSO', 'Roger ball, [27] knots, [axial].']] },
  { title: 'Bolter / Waveoff', who: 'APPROACH', when: 'After a bolter or waveoff', lines: [
    ['APPROACH', `[${f.id}], climb to [1,200], turn left downwind heading [${f.radial}], report abeam.`],
    ['AIRCRAFT', `[${f.id}], abeam, state [${f.state}].`],
    ['APPROACH', `[${f.id}], turn left heading [${f.fb}], final bearing, [6] miles.`],
  ] },
  { title: 'Low state → tanker', who: 'APPROACH · TANKER', when: 'State below tank state', lines: [
    ['APPROACH', `[${f.id}], your tank state. Texaco [${f.tanker}] is overhead angels [6]. Climb to angels [6].`],
    ['APPROACH', `[${f.tanker}], your customer [${f.id}], angels [${f.angels}] climbing to [6]. Give him [2.0].`],
  ] },
];

export const CommsScripts: React.FC<{ fields: CommsFields; candidates: { id: string; label: string }[]; selected: string | null; onSelect: (id: string) => void; onClose: () => void }> = ({ fields, candidates, selected, onSelect, onClose }) => {
  const [i, setI] = useState(1);
  const [flow, setFlow] = useState<'dep' | 'arr' | 'c1'>('arr');
  const P = PHASES(fields);
  const whoCol: Record<string, string> = { AIRCRAFT: '#6FB6E6', MARSHAL: '#FFB08F', APPROACH: '#FFB08F', LSO: '#7FD397' };
  const parse = (s: string) =>
    s.split(/(\[[^\]]+\])/).filter(Boolean).map((x, k) => {
      const f = x[0] === '[';
      return (
        <span key={k} style={{ padding: f ? '1px 4px' : 0, borderRadius: 3, background: f ? 'rgba(241,88,34,.16)' : 'transparent', color: f ? '#FFB08F' : '#E6EDF3', borderBottom: f ? '1px dashed #F15822' : 0 }}>
          {f ? x.slice(1, -1) : x}
        </span>
      );
    });
  const c = P[i];
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,14,18,.92)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-label="Comms scripts" style={{ width: 'min(1040px, 100%)', height: 'min(700px, 100%)', display: 'flex', flexDirection: 'column', background: '#151A21', border: '1px solid #374250', borderRadius: 10, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #262F3A' }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '.04em' }}>Comms scripts</div>
          <div style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
            {([['dep', 'Departure'], ['arr', 'Arrival · Case III'], ['c1', 'Case I/II']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFlow(k)} style={{ border: 0, padding: '5px 11px', borderRadius: 4, background: flow === k ? '#222C37' : 'transparent', color: flow === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <span className="lbl">Aircraft</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 360 }}>
            {candidates.slice(0, 5).map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                style={{ padding: '4px 10px', borderRadius: 4, background: selected === a.id ? 'rgba(241,88,34,.16)' : 'transparent', border: `1px solid ${selected === a.id ? '#F15822' : '#374250'}`, color: selected === a.id ? '#FFB08F' : '#93A1B0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: selected === a.id ? 600 : 400, cursor: 'pointer' }}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#E6EDF3', border: '1px solid #374250', background: 'transparent', cursor: 'pointer' }}>
            <IcX size={16} sw={2} />
          </button>
        </header>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <nav aria-label="Phases" style={{ flex: '0 0 230px', borderRight: '1px solid #262F3A', padding: '8px 0', overflowY: 'auto', background: '#12161C' }}>
            {P.map((p, k) => (
              <button key={k} className="cc-tab" onClick={() => setI(k)} style={{ borderLeftColor: k === i ? '#F15822' : 'transparent', background: k === i ? '#1A212A' : 'transparent', color: k === i ? '#E6EDF3' : k < i ? '#93A1B0' : '#C9D3DD' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, background: k < i ? '#2F5D3B' : k === i ? '#F15822' : '#222C37', color: k === i ? '#0E1116' : '#E6EDF3', flex: '0 0 22px' }}>{k + 1}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                  <span>{p.title}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#93A1B0' }}>{p.who}</span>
                </span>
              </button>
            ))}
          </nav>
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 22px 8px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{c.title}</div>
              <div className="lbl">{c.when}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 22px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.lines.map(([w, s], k) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'start', padding: '10px 12px', borderRadius: 6, background: w === 'AIRCRAFT' ? '#12161C' : '#1A212A', border: '1px solid #262F3A' }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: '.1em', paddingTop: 3, color: whoCol[w] }}>{w}</span>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, lineHeight: 1.8, color: '#E6EDF3' }}>{parse(s)}</div>
                </div>
              ))}
            </div>
            <footer style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderTop: '1px solid #262F3A' }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => setI(Math.max(0, i - 1))} style={{ height: 38, padding: '0 14px', background: 'transparent', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 5, fontFamily: "'Saira', sans-serif", fontSize: 13, cursor: 'pointer' }}>← Prev</button>
              <button onClick={() => setI(Math.min(P.length - 1, i + 1))} style={{ height: 38, padding: '0 16px', background: '#F15822', color: '#0E1116', border: 0, borderRadius: 5, fontFamily: "'Saira', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Issued · next phase →</button>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
};
