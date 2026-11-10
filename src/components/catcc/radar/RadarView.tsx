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
import { antennaFtOf, BLIND_ALTS, coverageNm, radarOf } from '../../../catcc/core/sensors/radar.ts';
import type { Assignment, CarrierPlan } from '../../../catcc/core/room/protocol.ts';
import type { RoomState } from '../useCatccRoom.ts';
import { STACK_IDS, defaultStack, fuelK, phaseOf, stackLabel, type Carrier, type Formation, type Phase, type Picture } from '../scopeModel.ts';
import { InfoPanels } from './InfoPanels.tsx';
import { HandoffRow } from '../Handoff.tsx';
import { flightKey, handoffState, OWNER_LABEL, ownerOf, type HandoffCtx } from '../ownership.ts';
import { finalPicture, patternIds } from '../final/finalModel.ts';
import { DeckPanel, DonorsPanel } from './SidePanels.tsx';
import { HelmPanel } from '../bridge/Helm.tsx';
import { useMarineData, useSeaRoom } from '../bridge/seaRoom.ts';
import { THEATRE_BOXES, theatreAt } from '../../../catcc/core/dcs/theatres.ts';
import { FormationPanel } from '../bridge/Formation.tsx';
import { escortsOf, stateOf } from '../bridge/escorts.ts';
import { formationFor } from '../../../catcc/core/geometry/formation.ts';
import { LightsPanel } from '../prifly/BossPanels.tsx';
import { BRIDGE_LIGHTS } from '../prifly/lights.ts';
import type { OpsState } from '../../../catcc/core/room/ops.ts';
import type { SeatDef } from '../seats.ts';
import { CommsScripts, DisplaySettings, FreqPanel, LayersPanel, Notifications, RadialsPanel, useCommsPlan, type Note } from './Panels.tsx';
import Scope from './Scope.tsx';
import { OV2_DEFAULT, OV_DEFAULT, UI_DEF, type PimShip, type RadarDonor, type Editing, type Fit, type Highlight, type Placement, type Tool, type UiScale, type ConflictCfg } from './types.ts';

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
  /** the carrier's shared ops state (formation, lights) and who may change it */
  ops?: OpsState;
  setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void;
  mayEditOps: boolean;
  /** owner chips and handoff actions on strips and notifications */
  handoffCtx: HandoffCtx;
  /** the seat this radar is for: its preset gives the default layers, zoom and tool, and its own saved layers */
  seat: SeatDef;
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
}

export const RadarView: React.FC<RadarViewProps> = ({ ops, setOps, mayEditOps, handoffCtx, seat, state, pic: picIn, offH, mayEdit, sendPlan, assign, uiOpen, setUiOpen, conflict, setConflict }) => {
  const pre = seat.radar ?? { ov: OV_DEFAULT, ov2: OV2_DEFAULT, fit: 'r50' as Fit, tool: 'marshal' as Tool };
  const [tool, setTool] = useState<Tool>(pre.tool);
  // layers are kept per seat; the CATCC seats fall back to the layers saved before there were seats
  const legacy = (k: string, d: Record<string, boolean>) => {
    try {
      return (seat.id === 'catcc' || seat.id === 'airops') && !localStorage.getItem(`${k}.${seat.id}`) && localStorage.getItem(k) ? { ...load(k, d), sweep: false } : load(`${k}.${seat.id}`, d);
    } catch {
      return d;
    }
  };
  const [ov, setOv] = useState<Record<string, boolean>>(() => {
    let v = legacy('catcc.ov', pre.ov);
    // seat defaults changed after seats had saved their layers: each change is applied once
    // (1: bathymetry Bridge-only; 2: blind spots on for CDC)
    // (3: range rings on for CDC)
    const CHANGED: string[][] = [['bathy'], ['blind'], ['rings']];
    try {
      const k = `catcc.ov.defaultsV.${seat.id}`;
      // the earlier bathymetry-only marker counts as version 1
      const had = Number(localStorage.getItem(k) ?? (localStorage.getItem(`catcc.ov.bathyDefault.${seat.id}`) ? 1 : 0));
      for (let i = had; i < CHANGED.length; i++) for (const key of CHANGED[i]) v = { ...v, [key]: (pre.ov as Record<string, boolean>)[key] };
      localStorage.setItem(k, String(CHANGED.length));
    } catch {
      /* private mode */
    }
    return v;
  });
  const [ov2, setOv2] = useState<Record<string, boolean>>(() => legacy('catcc.ov2', pre.ov2));
  const [ui, setUi] = useState<UiScale>(() => load('catcc.ui', UI_DEF));
  const [layersOpen, setLayersOpen] = useState(false);
  // target altitude the radar blind spots are drawn for, ft
  const [blind, setBlind] = useState<{ alt: number }>(() => load(`catcc.blind.${seat.id}`, { alt: 1000 }));
  const [freqOpen, setFreqOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [commsSel, setCommsSel] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit>(pre.fit);
  const [goTo, setGoTo] = useState<{ p: Pt; nonce: number; fit?: Pt[] } | undefined>();
  const [hookedId, setHookedId] = useState<string | null>(null);
  const [hl, setHl] = useState<Highlight | null>(null);
  // aircraft of the strip under the cursor: their marshal assignments show on the scope
  const [stripHov, setStripHov] = useState<string[] | null>(null);
  const [placement, setPlacement] = useState<Placement>({ placing: null, editing: null, hov: null });
  const sui = seat.ui;
  // the conning seat's sea room ahead, from the theatre's chart data (as the scope picks the theatre)
  const ftk = picIn.focus?.track;
  const tb = state.theatre ? THEATRE_BOXES[state.theatre] : undefined;
  const inTb = !!tb && !!ftk && ftk.lat >= tb[0] && ftk.lat <= tb[2] && ftk.lon >= tb[1] && ftk.lon <= tb[3];
  const marineData = useMarineData(sui?.right.includes('helm') ? (inTb ? state.theatre : ftk ? theatreAt(ftk.lat, ftk.lon) : undefined) : undefined);
  const seaRoom = useSeaRoom(marineData, ftk?.lat, ftk?.lon, ftk?.crs ?? ftk?.hdg);
  // conflict alerts are traffic control's: off on the Bridge, switchable in CDC
  const [cfOn, setCfOn] = useState<{ on: boolean }>(() => load(`catcc.cf.${seat.id}`, { on: true }));
  useEffect(() => save(`catcc.cf.${seat.id}`, cfOn), [cfOn, seat.id]);
  const cfMode = sui?.conflicts ?? 'on';
  const showCf = cfMode === 'on' || (cfMode === 'toggle' && cfOn.on);
  const pic = useMemo(() => (showCf ? picIn : { ...picIn, conflicts: [] }), [picIn, showCf]);
  const lefts = sui?.left ?? ['info', 'strips'];
  const rights = sui?.right ?? ['dep', 'marshal', 'coord', 'notes'];
  const [ltab, setLtab] = useState<'info' | 'strips'>(lefts.includes('strips') ? 'strips' : 'info');
  // altitude filter (not saved: it's a moment's tool, and a conflict outside it clears it)
  const [altF, setAltF] = useState<{ lo: number; hi: number } | null>(null);
  // north-up / track-up, per seat
  const [tu, setTu] = useState<{ on: boolean }>(() => load(`catcc.tu.${seat.id}`, { on: false }));
  useEffect(() => save(`catcc.tu.${seat.id}`, tu), [tu, seat.id]);
  const [acked, setAcked] = useState<Record<string, true>>({});
  const comms = useCommsPlan();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => save(`catcc.ov.${seat.id}`, ov), [ov, seat.id]);
  useEffect(() => save(`catcc.ov2.${seat.id}`, ov2), [ov2, seat.id]);
  useEffect(() => save('catcc.ui', ui), [ui]);
  useEffect(() => save(`catcc.blind.${seat.id}`, blind), [blind, seat.id]);

  const focus = pic.focus;
  const ship = focus?.ship;
  const hull = focus?.track.hull ?? '';
  const plans = useMemo(() => {
    const out: Record<string, CarrierPlan> = {};
    for (const c of pic.carriers) if (c.track.hull) out[c.track.hull] = state.plans[c.track.hull] ?? { deps: [], stacks: [defaultStack(c.ship)], off: ['E', 'H'] };
    return out;
  }, [pic.carriers, state.plans]);
  const plan = useMemo(() => plans[hull] ?? { deps: [], stacks: [] }, [plans, hull]);
  const assignments = useMemo(() => new Map(Object.entries(state.assignments)), [state.assignments]);

  // ------------------------------------------------ radar donors: friendly ships and airborne AEW
  const donors = useMemo<RadarDonor[]>(() => {
    const side = focus?.track.sd ?? 'blue';
    const out: RadarDonor[] = [];
    for (const t of [...pic.carriers.map((c) => c.track), ...(pic.ships ?? []), ...pic.air]) {
      if (t.sd !== side) continue;
      const spec = radarOf(t.ty);
      if (!spec) continue;
      // an AEW aircraft on deck or on the ground isn't radiating
      if (spec.kind === 'aew' && (t.air === false || t.alt < 500)) continue;
      out.push({ id: t.id, p: t.p, name: t.hull ?? (spec.kind === 'aew' ? (t.cs ?? t.ty) : (spec.cls ?? t.ty.replace(/_/g, ' '))), radar: spec.radar, kind: spec.kind, sym: t.k !== 'ship', cov: coverageNm(spec, antennaFtOf(spec, t.alt), blind.alt), covLow: coverageNm(spec, antennaFtOf(spec, t.alt), BLIND_ALTS[0]) });
    }
    return out;
  }, [pic.carriers, pic.ships, pic.air, focus?.track.sd, blind.alt]);

  // ------------------------------------------------ CSG stations (the active formation preset)
  // the formation display belongs to the seats with the CSG panel, switched from the toolbar
  const csgShow = rights.includes('csg') && !!ov.csg;
  const csgStations = useMemo(() => {
    if (!csgShow || !focus) return [];
    const es = escortsOf(pic);
    const f = formationFor(ops?.formation, es.map((e) => e.id));
    const act = f.presets[f.active];
    return es.map((e) => ({ label: e.label, st: act[e.id], p: e.t.p, state: stateOf(act[e.id], focus.ship.brc, e) }));
  }, [csgShow, pic, ops?.formation, focus]);

  // ------------------------------------------------ PIM / waypoints: carrier groups with a planned route
  const routes = state.env?.routes;
  const pimShips = useMemo<PimShip[]>(() => {
    const side = focus?.track.sd ?? 'blue';
    return (routes ?? [])
      .filter((r) => r.side === side && r.pts.length >= 2 && pic.carriers.some((x) => x.track.g === r.g))
      .map((r) => {
        const c = pic.carriers.find((x) => x.track.g === r.g);
        return { g: r.g, label: c?.track.hull ?? r.g, own: !!c?.focus, carrierId: c?.track.id, pts: r.pts };
      })
      .sort((a, b) => Number(b.own) - Number(a.own) || Number(!!b.carrierId) - Number(!!a.carrierId) || a.label.localeCompare(b.label));
  }, [routes, pic.carriers, focus?.track.sd]);

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
  // aircraft in the pattern belong to Approach / Final (the same rule as the Approach / Final screen)
  const inPattern = useMemo(() => patternIds(finalPicture(pic)), [pic]);
  const ownPhase = (f: Formation, p: Phase): Phase => (inPattern.has(f.lead.id) ? 'approach' : p);
  const nFl = [...strips.values()].reduce((s, a) => s + a.length, 0);
  const nAc = [...strips.values()].reduce((s, a) => s + a.reduce((t, x) => t + x.f.members.length, 0), 0);
  const conflictIds = new Set(pic.conflicts.flatMap((c) => [c.a.id, c.b.id]));

  // ------------------------------------------------ notifications
  const label = (t: { bd?: string; cs?: string; pi?: string; id: string }) => t.bd ?? t.cs ?? t.pi ?? t.id;
  const tLocal = localNow ? hhmm(localNow) : '';
  const notes: Note[] = [];
  // handoffs offered to this seat
  for (const f of pic.formations) {
    if (f.lead.owner && f.lead.owner !== hull) continue;
    const v = ownerOf(flightKey(f), hull, ownPhase(f, phaseOf(f, marshalled)), f.lead.rng, handoffCtx.layout, state.owners);
    if (!v.pending || !handoffState(v, handoffCtx).incoming) continue;
    notes.push({
      id: `h:${v.key}:${v.pending.at}`,
      k: 'handoff',
      kind: 'HANDOFF',
      t: tLocal,
      title: `${label(f.lead)} ← ${OWNER_LABEL[v.owner.role]}`,
      goTo: f.lead.p as [number, number],
      action: { label: 'Accept', run: () => handoffCtx.onAccept(v.key) },
    });
  }
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
        {lefts.length > 1 && (
        <div role="tablist" aria-label="Sidebar" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2, flex: 'none' }}>
          {([['info', 'Info', ''], ['strips', 'Strips', `${nFl} · ${nAc}`]] as const).filter(([k]) => lefts.includes(k)).map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={ltab === k} onClick={() => setLtab(k)} style={{ flex: 1, height: 30, border: 0, borderRadius: 4, background: ltab === k ? '#222C37' : 'transparent', color: ltab === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {l}
              <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: '#93A1B0' }}>{n}</span>
            </button>
          ))}
        </div>
        )}
        {ltab === 'info' ? (
          <InfoPanels focus={focus} env={state.env} utc={utc} offH={offH} mt={state.mt} deckClear={null} />
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
                      onMouseEnter={() => setStripHov(f.members.map((m) => m.id))}
                      onMouseLeave={() => setStripHov(null)}
                      aria-label={`${flight.callsign} ${flight.flightNumber} strip`}
                      style={{ borderRadius: 6, cursor: 'pointer', outline: sel ? '1.5px solid #E45BEA' : hot ? '1.5px solid #E0524E' : 'none', outlineOffset: -1 }} // drawn over the card's own 1 px border, so no dark sliver beside the squadron bar
                    >
                      <FlightCard {...flight} />
                      <HandoffRow v={ownerOf(flightKey(f), hull, ownPhase(f, p), f.lead.rng, handoffCtx.layout, state.owners)} ctx={handoffCtx} />
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
        tools={sui?.tools}
        fits={sui?.fits}
        comms={sui?.comms ?? true}
        trackUp={!!sui?.trackUp && tu.on}
        ringsFar={!!sui?.ringsFar}
        altFilter={altF}
        onAltFilter={setAltF}
        onTrackUp={sui?.trackUp ? (on) => setTu({ on }) : undefined}
        trend={rights.includes('helm')}
        helm={rights.includes('helm') ? plan.helm : undefined}
        csgOn={csgShow}
        onCsg={rights.includes('csg') ? (on) => setOv((o) => ({ ...o, csg: on })) : undefined}
        conflictsOn={showCf}
        magYear={state.utc ? state.utc.getUTCFullYear() + (state.utc.getTime() - Date.UTC(state.utc.getUTCFullYear(), 0, 1)) / 31_557_600_000 : undefined}
        onConflicts={cfMode === 'toggle' ? (on) => setCfOn({ on }) : undefined}
        onOpenDisplay={() => setUiOpen(true)}
        donors={donors}
        stations={csgStations}
        blindAlt={blind.alt}
        bulls={state.env?.bulls?.filter((b) => b.side === (focus?.track.sd ?? 'blue'))}
        showAssigned={stripHov}
        pimRoutes={pimShips.filter((s) => (s.own ? ov.pim : ov2.pim))}
        mt={state.mt}
        dayStart={state.env?.start}
        pic={pic}
        nowS={nowS}
        ui={ui}
        ov={{ ...ov, csg: csgShow, arr: ov.arr && ov.marshal }}
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
        onToggleBulls={() => setOv((o) => ({ ...o, bulls: !o.bulls }))}
        layersPanel={<LayersPanel ov={ov} ov2={ov2} set={(a, b) => { setOv(a); setOv2(b); }} hull={hull} other={other} defaults={pre} extra={{ blind: ov.blind ? (
          <div role="radiogroup" aria-label="Blind spots for targets at" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 0 6px 6px', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 9.5, color: '#93A1B0', letterSpacing: '.06em', marginRight: 2 }}>TARGET AT</span>
            {BLIND_ALTS.map((a) => (
              <button key={a} role="radio" aria-checked={blind.alt === a} onClick={() => setBlind({ alt: a })} className="mono" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${blind.alt === a ? '#FF8A85' : '#374250'}`, background: blind.alt === a ? 'rgba(255,138,133,.16)' : '#222C37', color: blind.alt === a ? '#FFC2BF' : '#C9D3DD' }}>
                {a >= 1000 ? `${a / 1000}K` : a} FT
              </button>
            ))}
          </div>
        ) : null }} />}
        freqOpen={freqOpen}
        onToggleFreq={() => setFreqOpen((o) => !o)}
        freqPanel={<FreqPanel plan={comms.plan} source={comms.source} />}
        onOpenComms={() => setCommsOpen(true)}
      />

      {/* ---------------- right sidebar */}
      <aside aria-label="Right sidebar" style={{ flex: '0 0 344px', width: 344, borderLeft: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
        {rights.includes('helm') && (
          <HelmPanel
            carrier={focus}
            ordered={plan.helm}
            onOrder={(h) => setPlan((p) => ({ ...p, helm: h }))}
            readOnly={!mayEdit}
            route={pimShips.find((s) => s.own)?.pts}
            nowS={state.mt}
            dayStart={state.env?.start}
            seaRoom={seaRoom}
          />
        )}
        {rights.includes('csg') && <FormationPanel pic={pic} ops={ops} setOps={setOps} readOnly={!mayEditOps} />}
        {rights.includes('blights') && <LightsPanel title="Lights" items={BRIDGE_LIGHTS} ops={ops} setOps={setOps} readOnly={!mayEditOps} />}
        {rights.includes('deck') && <DeckPanel pic={pic} />}
        {rights.includes('donors') && <DonorsPanel donors={donors} alt={blind.alt} />}
        {ship && (rights.includes('dep') || rights.includes('marshal') || rights.includes('coord')) && (
          <RadialsPanel
            show={{ dep: rights.includes('dep'), marshal: rights.includes('marshal'), coord: rights.includes('coord') }}
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
        {rights.includes('notes') && <Notifications notes={shown} onAck={(id) => setAcked((a) => ({ ...a, [id]: true }))} onGoTo={(p, fit) => setGoTo({ p, fit, nonce: Date.now() })} />}
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
      {commsOpen && <CommsScripts fields={commsFields} candidates={commsCands} selected={commsTrack?.id ?? null} onSelect={setCommsSel} onClose={() => setCommsOpen(false)} />}
    </div>
  );
};

export default RadarView;
