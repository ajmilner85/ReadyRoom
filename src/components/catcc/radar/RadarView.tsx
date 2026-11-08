import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import FlightCard from '../../ui/flight cards/FlightCard';
import type { Flight, FlightMember } from '../../../types/FlightData';
import { checkDepartureRadial, checkStackRadial, emergencyMarshalRadial, fixDme, heloMarshalRadial, type RadialCheck } from '../../../catcc/core/geometry/procedures.ts';
import { add, dir, len, mul, P, sub, type Pt } from '../../../catcc/core/geometry/vec.ts';
import { isCarrierCapable } from '../../../catcc/core/dcs/aircraft.ts';
import { autoCoordLine, coordGeom, reframe, sideOf, type CoordArea, type CoordGeom, type CoordSetting } from '../../../catcc/core/geometry/coordination.ts';
import { holdPattern } from '../../../catcc/core/geometry/procedures.ts';
import { nextPimTurn } from '../../../catcc/core/env/weather.ts';
import { norm360 } from '../../../catcc/core/geo.ts';
import type { Assignment, CarrierPlan } from '../../../catcc/core/room/protocol.ts';
import type { RoomState } from '../useCatccRoom.ts';
import { STACK_IDS, defaultStack, fuelK, phaseOf, stackLabel, type Carrier, type Formation, type Phase, type Picture } from '../scopeModel.ts';
import { InfoPanels } from './InfoPanels.tsx';
import { CommsScripts, DisplaySettings, FreqPanel, LayersPanel, Notifications, RadialsPanel, Reference, useCommsPlan, type Note } from './Panels.tsx';
import Scope from './Scope.tsx';
import { OV2_DEFAULT, OV_DEFAULT, UI_DEF, type PimShip, type Editing, type Fit, type Highlight, type Placement, type Tool, type UiScale, type ConflictCfg } from './types.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const LOW_STATE_LB = 4000;
const SUPPORT = /tanker|^KC|E-2|E-3|S-3B|H-60|SH-60|UH-60|CH-47/i;

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

// ---------------------------------------------------------------- strips (D02.1 via FlightCard)
const elementOf = (cs?: string) => /-(\d+)$/.exec(cs ?? '')?.[1] ?? '';
function flightOf(f: Formation): Flight {
  const lead = f.lead;
  const [name, num] = (lead.fl ?? f.group).split(/\s+(?=\d+$)/);
  const members: FlightMember[] = [...f.members]
    .sort((a, b) => Number(elementOf(a.cs) || 99) - Number(elementOf(b.cs) || 99))
    .map((m) => ({
      dashNumber: elementOf(m.cs) || m.id,
      boardNumber: m.bd ?? '---',
      fuel: (m.lb !== undefined ? Math.round(m.lb / 100) / 10 : undefined) as number,
      pilotCallsign: m.pl ?? m.pi ?? '',
    }));
  const fuels = members.map((m) => m.fuel).filter((x) => typeof x === 'number');
  return {
    id: f.id,
    callsign: (name ?? f.group).toUpperCase(),
    flightNumber: num ?? '',
    members,
    position: { bearing: r3(lead.brg), distance: String(Math.round(lead.rng)), altitude: String(Math.round(lead.alt)) },
    lowState: fuels.length ? Math.min(...fuels) : NaN,
    currentSection: '',
    currentDivision: 0,
    formation: members.length === 1 ? 'single' : 'group',
    aircraftType: lead.ty,
  } as Flight;
}
const PHASES: [Phase, string][] = [
  ['departure', 'DEPARTURE'],
  ['inbound', 'INBOUND'],
  ['marshal', 'MARSHAL'],
  ['approach', 'APPROACH'],
  ['support', 'SUPPORT'],
];

// ---------------------------------------------------------------- view

export interface RadarViewProps {
  state: RoomState;
  pic: Picture;
  offH?: number;
  mayEdit: boolean;
  sendPlan: (carrier: string, plan: CarrierPlan) => void;
  assign: (trackId: string, a: Assignment | null) => void;
  uiOpen: boolean;
  conflict: ConflictCfg;
  setConflict: (c: ConflictCfg) => void;
  setUiOpen: (b: boolean) => void;
  refOpen: boolean;
  setRefOpen: (b: boolean) => void;
  deckClear: boolean | null;
  envCase: { ceiling: number | null; vis: number | null };
}

export const RadarView: React.FC<RadarViewProps> = ({ state, pic, offH, mayEdit, sendPlan, assign, uiOpen, setUiOpen, refOpen, setRefOpen, deckClear, envCase, conflict, setConflict }) => {
  const [tool, setTool] = useState<Tool>('marshal');
  const [ov, setOv] = useState<Record<string, boolean>>(() => load('catcc.ov', OV_DEFAULT));
  const [ov2, setOv2] = useState<Record<string, boolean>>(() => load('catcc.ov2', OV2_DEFAULT));
  // PIM / waypoints per ship group; unset groups follow the default (own carrier on, others off)
  const [pimOn, setPimOn] = useState<Record<string, boolean>>(() => load('catcc.pim', {}));
  const [ui, setUi] = useState<UiScale>(() => load('catcc.ui', UI_DEF));
  const [layersOpen, setLayersOpen] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [commsSel, setCommsSel] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit>('r50');
  const [goTo, setGoTo] = useState<{ p: Pt; nonce: number; fit?: Pt[] } | undefined>();
  const [hookedId, setHookedId] = useState<string | null>(null);
  const [hl, setHl] = useState<Highlight | null>(null);
  const [placement, setPlacement] = useState<Placement>({ placing: null, editing: null, hov: null });
  const [ltab, setLtab] = useState<'info' | 'strips'>('strips');
  const [acked, setAcked] = useState<Record<string, true>>({});
  const comms = useCommsPlan();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => save('catcc.ov', ov), [ov]);
  useEffect(() => save('catcc.ov2', ov2), [ov2]);
  useEffect(() => save('catcc.pim', pimOn), [pimOn]);
  useEffect(() => save('catcc.ui', ui), [ui]);

  const focus = pic.focus;
  const ship = focus?.ship;
  const hull = focus?.track.hull ?? '';
  const plans = useMemo(() => {
    const out: Record<string, CarrierPlan> = {};
    for (const c of pic.carriers) if (c.track.hull) out[c.track.hull] = state.plans[c.track.hull] ?? { deps: [], stacks: [defaultStack(c.ship)] };
    return out;
  }, [pic.carriers, state.plans]);
  const plan = useMemo(() => plans[hull] ?? { deps: [], stacks: [] }, [plans, hull]);
  const assignments = useMemo(() => new Map(Object.entries(state.assignments)), [state.assignments]);

  // ------------------------------------------------ PIM / waypoints: friendly ship groups with a planned route
  const routes = state.env?.routes;
  const pimShips = useMemo<PimShip[]>(() => {
    const side = focus?.track.sd ?? 'blue';
    return (routes ?? [])
      .filter((r) => r.side === side && r.pts.length >= 2)
      .map((r) => {
        const c = pic.carriers.find((x) => x.track.g === r.g);
        return { g: r.g, label: c?.track.hull ?? r.g, own: !!c?.focus, carrierId: c?.track.id, pts: r.pts };
      })
      .sort((a, b) => Number(b.own) - Number(a.own) || Number(!!b.carrierId) - Number(!!a.carrierId) || a.label.localeCompare(b.label));
  }, [routes, pic.carriers, focus?.track.sd]);
  const pimShown = useCallback((s: PimShip) => pimOn[s.g] ?? s.own, [pimOn]);
  const pimToggles = {
    ships: pimShips,
    shown: pimShown,
    toggle: (g: string) => {
      const s = pimShips.find((x) => x.g === g);
      if (s) setPimOn((o) => ({ ...o, [g]: !pimShown(s) }));
    },
    setAll: (on: boolean | null) => setPimOn(on === null ? {} : Object.fromEntries(pimShips.map((s) => [s.g, on]))),
  };

  // ------------------------------------------------ coordination lines (ours, theirs reframed, or automatic)
  const protectedAreas = (c: Carrier): CoordArea[] => {
    const pl = plans[c.track.hull ?? ''] ?? { deps: [], stacks: [] };
    const st = [...pl.stacks, { id: 'E', r: emergencyMarshalRadial(c.ship), base: 6, rh: true }].filter((m) => !pl.off?.includes(m.id));
    return [{ pts: [c.track.p], ship: true }, ...st.map((m) => ({ pts: holdPattern(m.r, fixDme(m.base), m.rh ? 'right' : 'left').map((q) => add(q, c.track.p)) }))];
  };
  const coordLines = useMemo(() => {
    const out: Record<string, CoordGeom> = {};
    const f = pic.focus;
    if (!f) return out;
    for (const c of pic.carriers) {
      if (c.focus || !c.track.hull) continue;
      const other = c.track.p;
      const mine = plans[hull]?.coord?.[c.track.hull];
      const theirs = state.plans[c.track.hull]?.coord?.[hull];
      if (mine) out[c.track.hull] = coordGeom(mine, [0, 0], other);
      else if (theirs) out[c.track.hull] = coordGeom(reframe(coordGeom(theirs, other, [0, 0]), [0, 0], other), [0, 0], other);
      else {
        const a = (f.ship.brc * Math.PI) / 180;
        const b = (c.ship.brc * Math.PI) / 180;
        const mean = ((Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) * 180) / Math.PI + 360) % 360;
        out[c.track.hull] = coordGeom(autoCoordLine(protectedAreas(f), protectedAreas(c), [0, 0], other, mean), [0, 0], other, true);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pic.carriers, pic.focus, plans, state.plans, hull]);
  const coordPreview = (() => {
    const pc = placement.coord;
    if (placement.placing !== 'coord' || !pc) return null;
    const c = pic.carriers.find((x) => x.track.hull === pc.hull);
    return c ? { hull: pc.hull, g: coordGeom({ brg: pc.brg, off: pc.off }, [0, 0], c.track.p) } : null;
  })();
  const setCoord = (other: string, s: CoordSetting | null) =>
    setPlan((p) => {
      const coord = { ...(p.coord ?? {}) };
      if (s) coord[other] = { brg: ((Math.round(s.brg) % 180) + 180) % 180, off: Math.round(s.off * 10) / 10 };
      else delete coord[other];
      return { ...p, coord };
    });
  const utc = state.utc;
  const nowS = utc ? utc.getUTCHours() * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds() + utc.getUTCMilliseconds() / 1000 : undefined;
  const localNow = utc && offH !== undefined ? new Date(utc.getTime() + offH * 3_600_000) : undefined;

  // ------------------------------------------------ radials placement
  const checkRadial = useCallback(
    (b: number): RadialCheck => {
      if (!ship) return {};
      const ed = placement.editing;
      if (placement.placing === 'dep') {
        const others = plan.deps.filter((r) => !(ed?.k === 'dep' && ed.r === r));
        const stacks = plan.stacks.filter((m) => !(ed?.k === 'm' && ed.id === m.id)).map((m) => ({ r: m.r, name: `stack ${stackLabel(hull, m.id)}` }));
        return checkDepartureRadial(b, ship, others, stacks);
      }
      return checkStackRadial(b, ship, plan.deps, plan.stacks.filter((m) => !(ed?.k === 'm' && ed.id === m.id)));
    },
    [ship, plan, placement.placing, placement.editing],
  );
  const setPlan = (fn: (p: CarrierPlan) => CarrierPlan) => hull && sendPlan(hull, fn(plan));
  const onPlaceClick = (b: number) => {
    const { placing, editing } = placement;
    if (editing?.k === 'dep') setPlan((p) => ({ ...p, deps: p.deps.map((x) => (x === editing.r ? b : x)).sort((x, y) => x - y) }));
    else if (editing?.k === 'm') setPlan((p) => ({ ...p, stacks: p.stacks.map((m) => (m.id === editing.id ? { ...m, r: b } : m)) }));
    else if (placing === 'dep') setPlan((p) => ({ ...p, deps: [...p.deps, b].sort((x, y) => x - y) }));
    else if (placing === 'm') {
      const id = STACK_IDS.find((k) => !plan.stacks.some((m) => m.id === k)) ?? 'L';
      setPlan((p) => ({ ...p, stacks: [...p.stacks, { id, r: b, base: 6 }] }));
    }
    setPlacement({ placing: null, editing: null, hov: null });
  };
  const status = (() => {
    const { placing, hov } = placement;
    if (!placing) return { text: '', color: '#93A1B0' };
    if (hov == null) return { text: 'Click scope to place · Ctrl for 1°', color: '#93A1B0' };
    const c = checkRadial(hov);
    return { text: `${r3(hov)}R${c.err ? ` · ${c.err}` : c.warn ? ` · ${c.warn}` : ''}`, color: c.err ? '#FF8A85' : c.warn ? '#E7B04F' : '#7FD397' };
  })();
  useEffect(() => {
    if (!mayEdit) setPlacement({ placing: null, editing: null, hov: null });
  }, [mayEdit]);

  // ------------------------------------------------ strips
  const marshalled = useMemo(() => new Set(assignments.keys()), [assignments]);
  const strips = useMemo(() => {
    const by = new Map<Phase, { f: Formation; flight: Flight }[]>();
    for (const f of pic.formations) {
      if (f.lead.owner && f.lead.owner !== hull) continue; // the other carrier's traffic
      const ph = phaseOf(f, marshalled);
      if (ph === 'other') continue;
      const arr = by.get(ph) ?? [];
      arr.push({ f, flight: flightOf(f) });
      by.set(ph, arr);
    }
    for (const arr of by.values()) arr.sort((a, b) => a.f.lead.rng - b.f.lead.rng);
    return by;
  }, [pic.formations, marshalled, hull]);
  const nFl = [...strips.values()].reduce((s, a) => s + a.length, 0);
  const nAc = [...strips.values()].reduce((s, a) => s + a.reduce((t, x) => t + x.f.members.length, 0), 0);
  const conflictIds = new Set(pic.conflicts.flatMap((c) => [c.a.id, c.b.id]));

  // ------------------------------------------------ notifications
  const label = (t: { bd?: string; cs?: string; pi?: string; id: string }) => t.bd ?? t.cs ?? t.pi ?? t.id;
  const tLocal = localNow ? hhmm(localNow) : '';
  const notes: Note[] = [];
  for (const c of pic.conflicts) {
    const s = Math.round(c.cpa.tS);
    notes.push({
      id: `c:${[c.a.id, c.b.id].sort().join('-')}`,
      k: 'conflict',
      kind: 'CONFLICT',
      t: `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
      title: `${label(c.a)} × ${label(c.b)}`,
      body: `CPA ${c.cpa.latNm.toFixed(1)} NM / ${Math.round(c.cpa.vertFt / 100) * 100} FT`,
      goTo: mul(add(c.cpa.a, c.cpa.b), 0.5) as [number, number],
      // the encounter: both aircraft now and at closest approach
      fit: [c.a.p, c.b.p, c.cpa.a, c.cpa.b] as [number, number][],
    });
  }
  for (const t of pic.air) {
    if (t.owner && t.owner !== hull) continue;
    if (t.lb !== undefined && t.lb < LOW_STATE_LB && isCarrierCapable(t.ty) && !SUPPORT.test(t.ty) && t.air !== false)
      notes.push({ id: `l:${t.id}`, k: 'warn', kind: 'LOW STATE', t: tLocal, title: `${label(t)} · state ${fuelK(t.lb)}`, goTo: t.p as [number, number] });
  }
  if (nowS !== undefined && ship) {
    for (const [id, a] of assignments) {
      if (a.carrier !== hull) continue;
      const t = pic.air.find((x) => x.id === id);
      const st = a.stackId === 'E' ? { r: emergencyMarshalRadial(ship) } : plan.stacks.find((m) => m.id === a.stackId);
      if (!t || !st) continue;
      const late = nowS - a.eatS;
      if (late > 15 && len(sub(t.p, P(st.r, fixDme(a.angels)))) < 5)
        notes.push({ id: `p:${id}:${a.eatS}`, k: 'warn', kind: 'LATE PUSH', t: tLocal, title: `${label(t)} · +${Math.round(late)} s`, goTo: t.p as [number, number] });
    }
  }
  for (const g of Object.values(coordLines)) {
    for (const t of pic.air) {
      if (t.owner !== hull) continue;
      const along = sideOf(t.p, g); // negative on our side of the coordination line
      const v = dir(t.crs ?? t.hdg ?? 0);
      if (along > -5 && along < 0 && v[0] * g.n[0] + v[1] * g.n[1] > 0.3)
        notes.push({ id: `co:${t.id}`, k: 'coord', kind: 'COORD LINE', t: tLocal, title: `${label(t)} approaching`, goTo: t.p as [number, number] });
    }
  }
  const route = focus && state.env?.routes.find((r) => r.g === focus.track.g);
  const pim = route ? nextPimTurn(route.pts, state.mt) : null;
  if (pim && state.env && pim.etaS - state.mt < 3600) {
    const at = new Date(Date.parse(`${state.env.date ?? '1970-01-01'}T00:00:00Z`) + (state.env.start + pim.etaS) * 1000);
    notes.push({ id: `b:${pim.etaS}:${pim.brc}`, k: 'info', kind: 'BRC CHANGE', t: tLocal, title: `${r3(pim.brc)} at ${hhmm(at)}` });
  }
  const shown = notes.filter((n) => !acked[n.id]);

  // ------------------------------------------------ comms scripts fields
  const commsTrack = pic.air.find((t) => t.id === (commsSel ?? hookedId)) ?? pic.air.find((t) => t.owner === hull && !SUPPORT.test(t.ty));
  const commsFields = (() => {
    const t = commsTrack;
    const a = t ? assignments.get(t.id) : undefined;
    const st = a && ship ? (a.stackId === 'E' ? { r: emergencyMarshalRadial(ship) } : plan.stacks.find((m) => m.id === a.stackId)) : undefined;
    const btn = comms.plan?.find((e) => /approach|marshal/i.test(e.name))?.chan ?? '—';
    const tanker = pic.air.find((x) => /tanker|S-3B/i.test(x.ty));
    const m = localNow ? `${String(localNow.getUTCMinutes()).padStart(2, '0')}:${String(localNow.getUTCSeconds()).padStart(2, '0')}` : '—';
    const eatLocal = a && offH !== undefined ? String(Math.floor(((a.eatS + offH * 3600) % 3600) / 60)).padStart(2, '0') : '—';
    return {
      id: t ? label(t) : '—',
      type: t && /FA-18/.test(t.ty) ? 'Hornet' : t?.ty ?? '—',
      brg: t ? r3(norm360(t.brg + 180)) : '—',
      rng: t ? String(Math.round(t.rng)) : '—',
      angels: t ? (t.alt / 1000).toFixed(1) : '—',
      state: t?.lb !== undefined ? fuelK(t.lb) : '—',
      fb: ship ? r3(ship.fb) : '—',
      altimeter: focus?.track.wx?.qnh != null ? (focus.track.wx.qnh / 3386.389).toFixed(2) : '—',
      radial: st ? r3(st.r) : '—',
      dme: a ? String(fixDme(a.angels)) : '—',
      angelsM: a ? String(a.angels) : '—',
      eat: eatLocal,
      button: btn,
      time: m,
      tanker: tanker ? label(tanker) : '—',
    };
  })();
  const commsCands = pic.air.filter((t) => t.owner === hull && !SUPPORT.test(t.ty)).sort((a, b) => a.rng - b.rng).map((t) => ({ id: t.id, label: label(t) }));
  const other = pic.carriers.find((c) => !c.focus)?.track.hull;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      {/* ---------------- left sidebar */}
      <aside aria-label="Left sidebar" style={{ flex: '0 0 344px', width: 344, borderRight: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
        <div role="tablist" aria-label="Sidebar" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2, flex: 'none' }}>
          {([['info', 'Info', ''], ['strips', 'Strips', `${nFl} · ${nAc}`]] as const).map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={ltab === k} onClick={() => setLtab(k)} style={{ flex: 1, height: 30, border: 0, borderRadius: 4, background: ltab === k ? '#222C37' : 'transparent', color: ltab === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {l}
              <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: '#93A1B0' }}>{n}</span>
            </button>
          ))}
        </div>
        {ltab === 'info' ? (
          <InfoPanels focus={focus} env={state.env} utc={utc} offH={offH} mt={state.mt} deckClear={deckClear} />
        ) : (
          <DndContext sensors={sensors}>
            {PHASES.filter(([p]) => strips.get(p)?.length).map(([p, t]) => (
              <React.Fragment key={p}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '2px 2px -4px' }}>
                  <span className="lbl">{t}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: '#6B7683' }}>{strips.get(p)!.length}</span>
                </div>
                {strips.get(p)!.map(({ f, flight }) => {
                  const sel = f.members.some((m) => m.id === hookedId);
                  const hot = f.members.some((m) => conflictIds.has(m.id));
                  return (
                    <div
                      key={f.id}
                      onClick={() => setHookedId(sel ? null : f.lead.id)}
                      aria-label={`${flight.callsign} ${flight.flightNumber} strip`}
                      style={{ borderRadius: 6, cursor: 'pointer', outline: sel ? '1.5px solid #E45BEA' : hot ? '1.5px solid #E0524E' : 'none', outlineOffset: -1 }} // drawn over the card's own 1 px border, so no dark sliver beside the squadron bar
                    >
                      <FlightCard {...flight} />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            {!nFl && <div className="mono" style={{ fontSize: 12, color: '#6B7683', padding: '4px 2px' }}>No flights under control</div>}
          </DndContext>
        )}
      </aside>

      {/* ---------------- scope */}
      <Scope
        theatre={state.theatre}
        bulls={state.env?.bulls}
        pimRoutes={pimShips.filter(pimShown)}
        mt={state.mt}
        dayStart={state.env?.start}
        pic={pic}
        nowS={nowS}
        ui={ui}
        ov={{ ...ov, arr: ov.arr && ov.marshal }}
        ov2={{ ...ov2, arr: ov2.arr && ov2.marshal }}
        tool={tool}
        onTool={setTool}
        hookedId={hookedId}
        onHook={setHookedId}
        plans={plans}
        assignments={assignments}
        onAssign={(id, a) => assign(id, a)}
        placement={placement}
        coordLines={coordLines}
        coordPreview={coordPreview}
        onCoordPreview={(c) => setPlacement((p) => ({ ...p, coord: c }))}
        onCoordCommit={(c) => {
          setCoord(c.hull, { brg: c.brg, off: c.off });
          setPlacement({ placing: null, editing: null, hov: null });
        }}
        onCancelPlacement={() => setPlacement({ placing: null, editing: null, hov: null })}
        checkRadial={checkRadial}
        onPlaceHover={(hov) => setPlacement((p) => ({ ...p, hov }))}
        onPlaceClick={onPlaceClick}
        hl={hl}
        fit={fit}
        onFit={setFit}
        goTo={goTo}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((o) => !o)}
        layersPanel={<LayersPanel ov={ov} ov2={ov2} set={(a, b) => { setOv(a); setOv2(b); }} hull={hull} other={other} pim={pimToggles} />}
        freqOpen={freqOpen}
        onToggleFreq={() => setFreqOpen((o) => !o)}
        freqPanel={<FreqPanel plan={comms.plan} source={comms.source} />}
        onOpenComms={() => setCommsOpen(true)}
      />

      {/* ---------------- right sidebar */}
      <aside aria-label="Radials and notifications" style={{ flex: '0 0 344px', width: 344, borderLeft: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
        {ship && (
          <RadialsPanel
            plan={plan}
            emr={emergencyMarshalRadial(ship)}
            hel={heloMarshalRadial(ship)}
            placement={placement}
            status={status}
            hl={hl}
            onHl={setHl}
            onArm={(k) => setPlacement((p) => ({ placing: p.placing === k && !p.editing ? null : k, editing: null, hov: null }))}
            onEdit={(e: Editing) => setPlacement({ placing: e.k, editing: e, hov: null })}
            onCancel={() => setPlacement({ placing: null, editing: null, hov: null })}
            onRemoveDep={(r) => {
              setPlan((p) => ({ ...p, deps: p.deps.filter((x) => x !== r) }));
              setPlacement({ placing: null, editing: null, hov: null });
              setHl(null);
            }}
            onRemoveStack={(id) => {
              setPlan((p) => ({ ...p, stacks: p.stacks.filter((x) => x.id !== id) }));
              setPlacement({ placing: null, editing: null, hov: null });
              setHl(null);
            }}
            coords={pic.carriers
              .filter((c) => !c.focus && c.track.hull && coordLines[c.track.hull])
              .map((c) => ({ hull: c.track.hull!, g: coordLines[c.track.hull!] }))}
            onCoordSet={setCoord}
            onCoordPlace={(other) => {
              const g = coordLines[other];
              setPlacement({ placing: 'coord', editing: { k: 'coord', hull: other }, hov: null, coord: { hull: other, brg: g?.brg ?? 0, off: g?.off ?? 10 } });
            }}
            onToggleStack={(id) => setPlan((p) => ({ ...p, off: p.off?.includes(id) ? p.off.filter((x) => x !== id) : [...(p.off ?? []), id] }))}
            onBase={(id, d) => setPlan((p) => ({ ...p, stacks: p.stacks.map((x) => (x.id === id ? { ...x, base: Math.max(6, Math.min(20, x.base + d)) } : x)) }))}
            assignments={assignments}
            hull={hull}
            air={pic.air}
            readOnly={!mayEdit}
          />
        )}
        <Notifications notes={shown} onAck={(id) => setAcked((a) => ({ ...a, [id]: true }))} onGoTo={(p, fit) => setGoTo({ p, fit, nonce: Date.now() })} />
      </aside>

      {uiOpen && (
        <DisplaySettings
          ui={ui}
          onClose={() => setUiOpen(false)}
          conflict={conflict}
          onApply={(u, c) => {
            setUi(u);
            setConflict(c);
            setUiOpen(false);
          }}
        />
      )}
      {refOpen && <Reference onClose={() => setRefOpen(false)} current={{ hull, ceiling: envCase.ceiling, vis: envCase.vis }} />}
      {commsOpen && <CommsScripts fields={commsFields} candidates={commsCands} selected={commsTrack?.id ?? null} onSelect={setCommsSel} onClose={() => setCommsOpen(false)} />}
    </div>
  );
};

export default RadarView;
