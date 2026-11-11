/**
 * PriFly Air Boss / Mini Boss (carrier-ops-handoff-2/mockup/Boss.dc.html): left sidebar (Info, wind),
 * the flight deck with live positions and the DCS deck-crew taxi routes, the arrivals / departures
 * boards with flight strips, and the right sidebar (PLAT, launch, lights, air plan).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import FlightCard from '../../ui/flight cards/FlightCard';
import { fuelK, groupFormations, phaseOf, shortType, type Formation, type Picture, type ScopeTrack } from '../scopeModel.ts';
import { DECK_LAYERS, DECK_VIEWBOX, FOLDED, SPREAD, deckStatus, inLandingArea, jetShape, line, onCat, routeAhead, taxiToCat, type DeckJet, type DeckLayer, type V } from './deck.ts';
import { DeckDrawing } from './DeckDrawing.tsx';
import { IcReset } from '../icons.tsx';
import type { DeckEvent } from './useDeckLog.ts';
import type { OpsState } from '../../../catcc/core/room/ops.ts';
import type { HookEnv } from '../../../catcc/core/dcs/hookProtocol.ts';
import type { Assignment } from '../../../catcc/core/room/protocol.ts';
import type { DeckCall } from '../deck.ts';
import { DeckBar, LaunchTab, LightsPanel } from './BossPanels.tsx';
import { catEntry, withQueued } from './launch.ts';
import { PRIFLY_LIGHTS } from './lights.ts';
import { InfoPanels } from '../radar/InfoPanels.tsx';
import { WindIndicator, type WindMode } from '../bridge/Nav.tsx';
import { flightOf } from '../strips.ts';
import { finalPicture } from '../final/finalModel.ts';

type Mode = 'live' | 'sand';

const DEFAULT_LAYERS: DeckLayer[] = ['areas', 'gear'];
const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private window */
  }
};

interface AirPlanRow {
  n: string;
  l: string;
  name: string;
  s: 'done' | 'now' | 'next' | 'later';
}

function useAirPlan(): { rows: AirPlanRow[]; day: string } {
  const [rows, setRows] = useState<AirPlanRow[]>([]);
  useEffect(() => {
    let off = false;
    (async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 12 * 3_600_000).toISOString();
      const end = new Date(now.getTime() + 12 * 3_600_000).toISOString();
      const { data } = await supabase.from('events').select('id, name, start_datetime').gte('start_datetime', start).lte('start_datetime', end).order('start_datetime');
      if (off || !data) return;
      let nextSet = false;
      setRows(
        data.map((e, i) => {
          const t = new Date(e.start_datetime);
          const past = t.getTime() < now.getTime() - 2 * 3_600_000;
          const nowish = !past && t.getTime() <= now.getTime();
          let s: AirPlanRow['s'] = past ? 'done' : nowish ? 'now' : 'later';
          if (s === 'later' && !nextSet) {
            s = 'next';
            nextSet = true;
          }
          return { n: String(i + 1), l: t.toTimeString().slice(0, 5), name: e.name, s };
        }),
      );
    })().catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  return { rows, day: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
}

const ms = (t: number) => {
  const n = Math.max(0, Math.round(t));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const keyOf = (t: ScopeTrack) => t.g || t.id;
const btn = (on = false, enabled = true): React.CSSProperties => ({
  height: 30,
  padding: '0 10px',
  background: on ? 'rgba(241,88,34,.16)' : 'transparent',
  border: `1px solid ${on ? '#F15822' : '#374250'}`,
  borderRadius: 5,
  color: !enabled ? '#5E6A78' : on ? '#FFB08F' : '#E6EDF3',
  fontFamily: "'Saira', sans-serif",
  fontSize: 12.5,
  cursor: enabled ? 'pointer' : 'default',
});

export const BossView: React.FC<{
  pic: Picture;
  mode: Mode;
  log: DeckEvent[];
  landedAt: Map<string, number>;
  ops?: OpsState;
  setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void;
  deck: DeckCall | null;
  readOnly: boolean;
  env?: HookEnv;
  utc?: Date;
  offH?: number;
  mt: number;
  assignments: Map<string, Assignment>;
  /** Mini Boss opens on the air plan, the Air Boss on launch */
  defaultTab?: 'launch' | 'lights' | 'plan';
}> = ({ pic, mode, log, landedAt, ops, setOps, deck, readOnly, env, utc, offH, mt, assignments, defaultTab }) => {
  const [tab, setTab] = useState<'launch' | 'lights' | 'plan'>(defaultTab ?? 'launch');
  const st = deckStatus(pic);
  const plan = useAirPlan();
  const [chits, setChits] = useState<Record<string, { x: number; y: number; a: number }>>({});
  const [paths, setPaths] = useState<V[][]>([]);
  const [curPath, setCurPath] = useState<V[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [layerList, setLayerList] = useState<DeckLayer[]>(() => load('catcc.deck.layers', { l: DEFAULT_LAYERS }).l.filter((k) => DECK_LAYERS.some((x) => x.k === k)));
  const layers = useMemo(() => new Set(layerList), [layerList]);
  const [wind, setWind] = useState<{ m: WindMode }>(() => load('catcc.wind', { m: 'true' as WindMode }));
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const hull = pic.focus?.track.hull;

  // seed the sand table from live positions when entering it
  useEffect(() => {
    if (mode !== 'sand' || !st) return;
    setChits(Object.fromEntries(st.jets.map((j) => [j.t.id, { x: j.x, y: j.y, a: j.a }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toDeck = (e: { clientX: number; clientY: number }): V | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const q = svg.createSVGPoint();
    q.x = e.clientX;
    q.y = e.clientY;
    const v = q.matrixTransform(m.inverse());
    return [v.x, -v.y];
  };

  // ------------------------------------------------ launch queues: which catapult each flight on deck is assigned to
  const onDeckKeys = useMemo(() => new Set((st?.jets ?? []).map((j) => keyOf(j.t))), [st]);
  const assignedCat = useMemo(() => {
    const m = new Map<string, { cat: string; pos: number }>();
    for (const k of ['1', '2', '3', '4']) catEntry(ops, k).queue.filter((x) => onDeckKeys.has(x)).forEach((key, pos) => m.set(key, { cat: k, pos }));
    return m;
  }, [ops, onDeckKeys]);
  const taxiTo = (key: string, k: string | null) => setOps({ launch: withQueued(ops, onDeckKeys, key, k) });

  const jets: (DeckJet & { cls: 'sel' | 'green' | 'white' | 'gray' })[] = useMemo(() => {
    if (!st) return [];
    const now = Date.now();
    return st.jets.map((j) => {
      const c = mode === 'sand' ? chits[j.t.id] : undefined;
      const jj = c ? { ...j, x: c.x, y: c.y, a: c.a } : j;
      const atCat = ['1', '2', '3', '4'].some((k) => onCat([jj], k));
      const cls: 'sel' | 'green' | 'white' | 'gray' =
        j.t.id === selected || (mode === 'live' && (jj.moving || inLandingArea(jj.x, jj.y))) ? 'sel' : atCat || assignedCat.has(keyOf(j.t)) ? 'green' : (landedAt.get(j.t.id) ?? 0) > now - 15 * 60_000 ? 'white' : 'gray';
      return { ...jj, cls };
    });
  }, [st, mode, chits, selected, landedAt, assignedCat]);

  // taxi routes: assigned jets along the DCS launch route to their catapult; other taxiing jets along the route they're on
  const routes = useMemo(() => {
    const out: { id: string; pts: V[]; kind: 'next' | 'queued' | 'ahead' }[] = [];
    for (const j of jets) {
      const a = assignedCat.get(keyOf(j.t));
      if (a) {
        if (onCat([j], a.cat)) continue;
        out.push({ id: j.t.id, pts: taxiToCat([j.x, j.y], a.cat), kind: a.pos === 0 ? 'next' : 'queued' });
      } else if (mode === 'live' && j.moving) {
        const r = routeAhead(j);
        if (r) out.push({ id: j.t.id, pts: r.pts, kind: 'ahead' });
      }
    }
    return out;
  }, [jets, assignedCat, mode]);

  const shape = (j: DeckJet & { cls: string }) => jetShape(j.cls === 'gray' || j.cls === 'white' ? FOLDED : SPREAD, j.x, j.y, j.a);
  const byCls = (c: string) => jets.filter((j) => j.cls === c).map(shape).join('');
  const aboard = st?.jets.length ?? 0;
  const owned = pic.air.filter((t) => t.owner === hull).length;
  const tanker = pic.air.find((t) => t.owner === hull && /tanker|S-3B/i.test(t.ty) && t.air !== false);
  const guard = pic.air.find((t) => t.owner === hull && t.k === 'rotary');
  const colors: Record<string, string> = { sel: '#F15822', green: '#5FC37A', white: '#C9D3DD', gray: '#6E7A88' };
  const labelCol: Record<string, string> = { sel: '#FFB08F', green: '#7FD397', white: '#C9D3DD', gray: '#93A1B0' };
  const selJet = jets.find((j) => j.t.id === selected);
  const selCat = selJet ? assignedCat.get(keyOf(selJet.t))?.cat ?? null : null;
  const toggleLayer = (k: DeckLayer) => {
    const next = layers.has(k) ? layerList.filter((x) => x !== k) : [...layerList, k];
    setLayerList(next);
    save('catcc.deck.layers', { l: next });
  };
  const resetLayers = () => {
    setLayerList(DEFAULT_LAYERS);
    save('catcc.deck.layers', { l: DEFAULT_LAYERS });
  };

  // ------------------------------------------------ arrivals and departures boards
  const boards = useMemo(() => {
    const marshalled = new Set(assignments.keys());
    const fp = finalPicture(pic);
    const ballT = new Map((fp?.arrivals ?? []).map((a) => [a.t.id, a.tBall!]));
    const mine = (f: Formation) => !f.lead.owner || f.lead.owner === hull;
    const arr: { f: Formation; why: string; order: number }[] = [];
    const dep: { f: Formation; why: string; order: number }[] = [];
    for (const f of pic.formations) {
      if (!mine(f)) continue;
      const ph = phaseOf(f, marshalled);
      const tb = Math.min(...f.members.map((m) => ballT.get(m.id) ?? Infinity));
      if (tb < Infinity) arr.push({ f, why: `¾ NM in ${ms(tb)}`, order: tb });
      else if (ph === 'approach') arr.push({ f, why: `APPROACH · ${Math.round(f.lead.rng)} NM`, order: 1e5 + f.lead.rng });
      else if (ph === 'marshal') {
        const a = assignments.get(f.lead.id);
        arr.push({ f, why: a ? `MARSHAL · ANGELS ${a.angels}` : 'MARSHAL', order: 2e5 + (a?.angels ?? 0) * 100 + f.lead.rng });
      } else if (ph === 'inbound') arr.push({ f, why: `INBOUND · ${Math.round(f.lead.rng)} NM`, order: 3e5 + f.lead.rng });
      else if (ph === 'departure') dep.push({ f, why: `AIRBORNE · ${Math.round(f.lead.rng)} NM`, order: 1e5 + f.lead.rng });
    }
    // on deck: grouped into flights, in launch order (queued on a ready catapult first), then unassigned
    const cv = pic.focus?.track.p;
    const aboardT = cv ? (pic.ground ?? []).filter((t) => Math.hypot(t.p[0] - cv[0], t.p[1] - cv[1]) < 0.5) : [];
    for (const f of groupFormations(aboardT, 0.3)) {
      const a = f.members.map((m) => assignedCat.get(keyOf(m))).find(Boolean);
      const status = a ? catEntry(ops, a.cat).status : null;
      const spotted = a && st?.cats[a.cat] && f.members.some((m) => m.id === st.cats[a.cat]!.t.id);
      dep.push({
        f,
        why: a ? `CAT ${a.cat} · ${spotted ? 'SPOTTED' : `#${a.pos + 1}`}${status && status !== 'ready' ? ` · ${status.toUpperCase()}` : ''}` : 'ON DECK',
        order: a ? a.pos * 10 + Number(a.cat) + (status === 'ready' ? 0 : 1000) : 5000,
      });
    }
    arr.sort((a, b) => a.order - b.order);
    dep.sort((a, b) => a.order - b.order);
    return { arr, dep };
  }, [pic, hull, assignments, assignedCat, ops, st]);

  const board = (title: string, rows: { f: Formation; why: string }[], empty: string, first: string) => (
    <section className="pnl" aria-label={title} style={{ flex: '1 1 340px', minWidth: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="lbl">{title}</span>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{`${rows.length} flight${rows.length === 1 ? '' : 's'} · ${rows.reduce((s, r) => s + r.f.members.length, 0)} aircraft`}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.f.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="mono" style={{ display: 'flex', gap: 8, fontSize: 11, color: i === 0 ? '#7FD397' : '#93A1B0', letterSpacing: '.04em', padding: '0 2px' }}>
            <span style={{ fontWeight: 600 }}>{i === 0 ? first : String(i + 1)}</span>
            <span>{r.why}</span>
          </div>
          <div style={{ borderRadius: 6, outline: i === 0 ? '1.5px solid #5FD068' : 'none', outlineOffset: -1 }}>
            <FlightCard {...flightOf(r.f)} />
          </div>
        </div>
      ))}
      {!rows.length && <div className="mono" style={{ fontSize: 12, color: '#6B7683', padding: '4px 2px' }}>{empty}</div>}
    </section>
  );

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* ---------------- left sidebar */}
      <aside aria-label="Left sidebar" style={{ flex: '0 0 344px', width: 344, borderRight: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto', boxSizing: 'border-box' }}>
        <InfoPanels focus={pic.focus} env={env} utc={utc} offH={offH} mt={mt} deckClear={null} />
        <WindIndicator
          carrier={pic.focus}
          mode={wind.m}
          onMode={(m) => {
            setWind({ m });
            save('catcc.wind', { m });
          }}
        />
      </aside>

      {/* ---------------- deck and boards */}
      <main aria-label="Deck and boards" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto', boxSizing: 'border-box' }}>
        <DeckBar pic={pic} deck={deck} ops={ops} setOps={setOps} readOnly={readOnly} />
        <section aria-label="Flight deck" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="lbl">Flight deck · {mode === 'live' ? 'live from DCS' : 'sand table (manual chits)'}</span>
            <div style={{ flex: 1 }} />
            <div role="group" aria-label="Deck layers" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
              {DECK_LAYERS.map((l) => (
                <button key={l.k} aria-pressed={layers.has(l.k)} title={l.title} onClick={() => toggleLayer(l.k)} style={{ border: 0, height: 26, padding: '0 8px', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 12, cursor: 'pointer', background: layers.has(l.k) ? '#222C37' : 'transparent', color: layers.has(l.k) ? '#E6EDF3' : '#93A1B0' }}>
                  {l.label}
                </button>
              ))}
              <button aria-label="Reset deck layers" title="Reset layers to default (Areas, Equipment)" onClick={resetLayers} style={{ border: 0, height: 26, width: 26, display: 'grid', placeItems: 'center', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: '#93A1B0' }}>
                <IcReset />
              </button>
            </div>
            <button
              onClick={() => {
                if (drawing && curPath.length > 1) setPaths((ps) => [...ps, curPath]);
                setCurPath([]);
                setDrawing((d) => !d);
              }}
              style={btn(drawing)}
            >
              {drawing ? 'Finish path' : 'Draw path'}
            </button>
            <button onClick={() => { setPaths([]); setCurPath([]); }} style={btn()}>Clear paths</button>
          </div>

          <div style={{ background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <svg
              ref={svgRef}
              className="deck"
              viewBox={DECK_VIEWBOX}
              style={{ width: '100%', height: 'auto', maxHeight: 560, cursor: drawing ? 'crosshair' : 'default' }}
              role="img"
              aria-label="Nimitz-class flight deck to scale, bow to the right, with aircraft positions and taxi routes"
              onClick={(e) => {
                if (drawing) {
                  const q = toDeck(e);
                  if (q) setCurPath((c) => [...c, q]);
                } else if (e.target === e.currentTarget) setSelected(null);
              }}
              onMouseMove={(e) => {
                const d = dragRef.current;
                if (!d) return;
                const q = toDeck(e);
                if (q) setChits((c) => ({ ...c, [d.id]: { ...c[d.id], x: q[0] - d.dx, y: q[1] - d.dy } }));
              }}
              onMouseUp={() => (dragRef.current = null)}
              onMouseLeave={() => (dragRef.current = null)}
            >
              <DeckDrawing layers={layers} hull={hull} jbdUp={Object.fromEntries(Object.entries(st?.cats ?? {}).map(([k, j]) => [k, !!j]))} />
              {[...paths, curPath].filter((p) => p.length > 1).map((p, i) => (
                <path key={i} d={line(p)} fill="none" stroke="#F15822" strokeWidth={1} strokeDasharray="3 2" />
              ))}
              <g fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                {routes.map((r) => (
                  <path key={r.id} d={line(r.pts)} stroke={r.kind === 'ahead' ? '#F15822' : '#5FD068'} strokeWidth={r.kind === 'next' ? 1.1 : 0.7} strokeOpacity={r.kind === 'queued' ? 0.5 : 0.9} strokeDasharray={r.kind === 'ahead' ? '2 1.5' : '3 1.5'} />
                ))}
              </g>
              <path d={byCls('gray')} fill={colors.gray} />
              <path d={byCls('white')} fill={colors.white} />
              <path d={byCls('green')} fill={colors.green} />
              <path d={byCls('sel')} fill={colors.sel} />
              {mode === 'live' && (
                <g fill="none" strokeWidth={0.5} style={{ pointerEvents: 'none' }}>
                  {jets.filter((j) => j.cls === 'sel').map((j) => (
                    <circle key={j.t.id} cx={j.x} cy={-j.y} r={10} stroke={colors[j.cls]} className="live" />
                  ))}
                </g>
              )}
              <g className="id">
                {jets.map((j) => {
                  const a = assignedCat.get(keyOf(j.t));
                  return (
                    <text
                      key={j.t.id}
                      x={j.x}
                      y={-j.y - 9.5}
                      textAnchor="middle"
                      style={{ fill: labelCol[j.cls], cursor: mode === 'sand' ? 'grab' : 'pointer' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelected(j.t.id === selected ? null : j.t.id);
                        if (mode !== 'sand') return;
                        const q = toDeck(e);
                        if (q) dragRef.current = { id: j.t.id, dx: q[0] - j.x, dy: q[1] - j.y };
                      }}
                    >
                      {j.t.bd ?? j.t.cs ?? ''}
                      {a ? ` C${a.cat}` : ''}
                    </text>
                  );
                })}
              </g>
            </svg>

            {/* the selected jet: send it to a catapult (planning: DCS has no API to order deck crews) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 30 }}>
              {selJet ? (
                <>
                  <span className="mono" style={{ fontSize: 12.5, color: '#FFB08F', fontWeight: 600 }}>
                    {selJet.t.bd ?? selJet.t.cs ?? selJet.t.id} {shortType(selJet.t.ty)}
                    {selJet.t.lb !== undefined ? ` · ${fuelK(selJet.t.lb)}` : ''}
                  </span>
                  <span className="lbl" title="Puts the flight in that catapult's launch queue and shows the deck crew's route there. DCS can't be ordered to taxi a jet: this is the plan the directors work to.">
                    Taxi to
                  </span>
                  {['1', '2', '3', '4'].map((k) => (
                    <button key={k} disabled={readOnly} aria-pressed={selCat === k} onClick={() => taxiTo(keyOf(selJet.t), selCat === k ? null : k)} style={btn(selCat === k, !readOnly)}>
                      CAT {k}
                    </button>
                  ))}
                  {selCat && !readOnly && (
                    <button onClick={() => taxiTo(keyOf(selJet.t), null)} style={btn()}>
                      Unassign
                    </button>
                  )}
                </>
              ) : (
                <span className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>
                  {mode === 'sand' ? 'Drag a board number to move its chit. Positions here are planning only.' : 'Click a board number to assign it a catapult; its DCS taxi route shows on the deck.'}
                </span>
              )}
            </div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: '#93A1B0', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span><span style={{ color: '#F15822' }}>■</span> selected / taxiing / in landing area</span>
            <span><span style={{ color: '#5FC37A' }}>■</span> on a catapult or queued</span>
            <span><span style={{ color: '#C9D3DD' }}>■</span> recovered</span>
            <span><span style={{ color: '#6E7A88' }}>■</span> parked / down</span>
            <span><span style={{ color: '#5FD068' }}>- -</span> route to catapult</span>
            <span><span style={{ color: '#F15822' }}>- -</span> route ahead</span>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {board('Arrivals', boards.arr, 'No arrivals', 'NEXT')}
          {board('Departures', boards.dep, 'Nothing on deck or departing', 'NEXT')}
        </div>
      </main>

      {/* ---------------- right sidebar */}
      <aside aria-label="PLAT, launch, lights and plan" style={{ flex: '0 0 400px', width: 400, borderLeft: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto', boxSizing: 'border-box' }}>
        <section className="pnl" style={{ padding: 8 }} aria-label="PLAT">
          <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#07090C', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(230,237,243,.25)' }} />
            <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(230,237,243,.25)' }} />
            <span className="mono" style={{ position: 'absolute', left: 8, top: 6, fontSize: 10.5, color: '#93A1B0' }}>PLAT</span>
            <span className="mono" style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 10.5, color: '#5E6A78' }}>NO SIGNAL · RTMP</span>
          </div>
        </section>
        <div role="tablist" aria-label="PriFly panels" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2, flex: 'none' }}>
          {([['launch', 'Launch'], ['lights', 'Lights'], ['plan', 'Air plan']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ flex: 1, height: 30, border: 0, borderRadius: 4, fontFamily: "'Saira', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer', background: tab === k ? '#222C37' : 'transparent', color: tab === k ? '#E6EDF3' : '#93A1B0' }}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'launch' && <LaunchTab pic={pic} ops={ops} setOps={setOps} readOnly={readOnly} />}
        {tab === 'lights' && <LightsPanel items={PRIFLY_LIGHTS} ops={ops} setOps={setOps} readOnly={readOnly} />}
        {tab === 'plan' && (
          <>
            <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="lbl">Air plan · {plan.day}</span>
                <a href="/mission-prep" target="_blank" rel="noopener" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textDecoration: 'none' }}>Open in Mission Prep ↗</a>
              </div>
              <div className="ev" style={{ color: '#93A1B0', fontSize: 10.5, letterSpacing: '.08em' }}>
                <span>EVENT</span><span>LAUNCH</span><span>RECOVER</span><span>FLIGHTS</span>
              </div>
              {plan.rows.map((e) => (
                <div key={e.n} className="ev" style={{ background: e.s === 'now' ? 'rgba(241,88,34,.14)' : e.s === 'next' ? '#1A212A' : 'transparent', border: `1px solid ${e.s === 'now' ? '#F15822' : '#262F3A'}`, color: e.s === 'done' ? '#93A1B0' : '#E6EDF3', marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>{e.n}</span><span>{e.l}</span><span>—</span><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                </div>
              ))}
              {!plan.rows.length && <div className="mono" style={{ fontSize: 12, color: '#6B7683', marginTop: 6 }}>No ReadyRoom events within 12 hours</div>}
            </section>

            <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>Current cycle</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{aboard} / {owned}</div>
                <div className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>aboard</div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#222C37', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${owned ? Math.round((aboard / owned) * 100) : 0}%`, height: '100%', background: '#F15822' }} />
              </div>
              <div className="mono" style={{ fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5 }}>
                <span style={{ color: '#93A1B0' }}>Landing area</span><span style={{ color: st?.foul.length ? '#FF9C98' : '#7FD397' }}>{st?.foul.length ? 'FOUL' : 'CLEAR'}</span>
                <span style={{ color: '#93A1B0' }}>Recovery tanker</span><span>{tanker ? `${tanker.bd ?? tanker.cs ?? tanker.id}${tanker.lb !== undefined ? ` · ${fuelK(tanker.lb)}` : ''}` : '—'}</span>
                <span style={{ color: '#93A1B0' }}>Plane guard</span><span>{guard ? guard.bd ?? guard.cs ?? guard.id : '—'}</span>
              </div>
            </section>

            <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>Deck log</div>
              <div className="mono" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, color: '#C9D3DD' }}>
                {log.map((e, i) => (
                  <span key={i}>
                    <span style={{ color: '#93A1B0' }}>{e.t}</span>  {e.text}
                  </span>
                ))}
                {!log.length && <span style={{ color: '#6B7683' }}>No traps or launches seen yet</span>}
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
};
