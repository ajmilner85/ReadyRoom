import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import FlightCard from '../ui/flight cards/FlightCard';
import { Icon } from '../ui/primitives';
import type { Flight, FlightMember } from '../../types/FlightData';
import { THEATRE_UTC_OFFSET_H } from '../../catcc/core/dcs/aircraft.ts';
import { CARRIER_HULLS } from '../../catcc/core/tracks/naming.ts';
import { checkDepartureRadial, checkStackRadial } from '../../catcc/core/geometry/procedures.ts';
import { angDiff, type Pt } from '../../catcc/core/geometry/vec.ts';
import { norm360 } from '../../catcc/core/geo.ts';
import { SEAT_ROLES, type Assignment, type CarrierPlan, type SeatKey, type SeatRole } from '../../catcc/core/room/protocol.ts';
import Scope, { type Fit } from './Scope';
import { buildPicture, defaultStack, fuelK, PHASE_LABEL, PHASE_ORDER, phaseOf, type Formation, type Phase, type Picture } from './scopeModel';
import { useCatccRoom } from './useCatccRoom';
import './catcc.css';

const ROLE_LABEL: Record<SeatRole, string> = {
  departure: 'DEP',
  marshal: 'MARSHAL',
  approach: 'APPROACH',
  final: 'FINAL',
  boss: 'BOSS',
  lso: 'LSO',
  mission_commander: 'MC',
};

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
const LOW_STATE_LB = 4000;

// ---------------------------------------------------------------- strips (D02.1 via FlightCard)

function elementOf(cs?: string): string {
  const m = /-(\d+)$/.exec(cs ?? '');
  return m ? m[1] : '';
}

function flightOf(f: Formation): Flight {
  const lead = f.lead;
  const [name, num] = (lead.fl ?? f.group).split(/\s+(?=\d+$)/);
  const members: FlightMember[] = [...f.members]
    .sort((a, b) => Number(elementOf(a.cs) || 99) - Number(elementOf(b.cs) || 99))
    .map((m) => ({
      dashNumber: elementOf(m.cs) || m.id,
      boardNumber: m.bd ?? '---',
      // FuelDisplay renders "—" for undefined (type unknown to the capacity table)
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

// ---------------------------------------------------------------- notifications

interface Note {
  key: string;
  kind: 'CONFLICT' | 'LOW STATE';
  title: string;
  p: Pt;
}

function notesOf(pic: Picture): Note[] {
  const out: Note[] = [];
  for (const c of pic.conflicts) {
    const la = c.a.bd ?? c.a.cs ?? c.a.pi ?? c.a.id;
    const lb = c.b.bd ?? c.b.cs ?? c.b.pi ?? c.b.id;
    out.push({
      key: `c:${[c.a.id, c.b.id].sort().join('-')}`,
      kind: 'CONFLICT',
      title: `${la} / ${lb} · CPA ${c.cpa.latNm.toFixed(1)} NM / ${Math.round(c.cpa.vertFt / 100) * 100} FT`,
      p: [(c.cpa.a[0] + c.cpa.b[0]) / 2, (c.cpa.a[1] + c.cpa.b[1]) / 2],
    });
  }
  for (const t of pic.air) {
    if (t.lb === undefined || t.lb >= LOW_STATE_LB || /tanker|kc|e-2/i.test(t.ty) || t.air === false) continue;
    out.push({ key: `l:${t.id}`, kind: 'LOW STATE', title: `${t.bd ?? t.cs ?? t.pi ?? t.id} · ${fuelK(t.lb)} · ${r3(t.brg)}/${Math.round(t.rng)}`, p: t.p });
  }
  return out;
}

// ---------------------------------------------------------------- app

const CatccApp: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const { state, history, selectSource, claim, release, setPlan: sendPlan, assign, clearError } = useCatccRoom(params.get('src') ?? undefined);
  const [focusHull, setFocusHull] = useState<string | undefined>(params.get('cv') ?? undefined);
  const [hookedId, setHookedId] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit>('r50');
  const [goTo, setGoTo] = useState<{ p: Pt; nonce: number } | undefined>();
  const [leftTab, setLeftTab] = useState<'info' | 'strips'>('strips');
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [caseNo, setCaseNo] = useState<'I' | 'II' | 'III'>('III');
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pic = useMemo(() => buildPicture(state.tracks, focusHull, history, state.mt), [state.tracks, focusHull, history, state.mt]);
  const hull = pic.focus?.track.hull;
  const ship = pic.focus?.ship;

  useEffect(() => {
    if (!focusHull && hull) setFocusHull(hull);
  }, [focusHull, hull]);
  // Plans and assignments are room state. Until someone edits a carrier's plan, show the CV-1
  // default stack locally; the first edit sends the whole plan.
  const plan: CarrierPlan = (hull && state.plans[hull]) || { deps: [], stacks: ship ? [defaultStack(ship)] : [] };
  const setPlan = (fn: (p: CarrierPlan) => CarrierPlan) => {
    if (hull) sendPlan(hull, fn(plan));
  };
  const assignments = useMemo(() => new Map(Object.entries(state.assignments)), [state.assignments]);
  const onAssign = useCallback((id: string, a: Assignment) => assign(id, a), [assign]);
  const marshalled = useMemo(() => new Set(assignments.keys()), [assignments]);

  const strips = useMemo(() => {
    const by = new Map<Phase, { f: Formation; flight: Flight }[]>();
    for (const f of pic.formations) {
      const ph = phaseOf(f, marshalled);
      if (ph === 'other') continue;
      const arr = by.get(ph) ?? [];
      arr.push({ f, flight: flightOf(f) });
      by.set(ph, arr);
    }
    for (const arr of by.values()) arr.sort((a, b) => a.f.lead.rng - b.f.lead.rng);
    return by;
  }, [pic.formations, marshalled]);
  const nFlights = [...strips.values()].reduce((s, a) => s + a.length, 0);
  const nAircraft = [...strips.values()].reduce((s, a) => s + a.reduce((t, x) => t + x.f.members.length, 0), 0);
  const conflictIds = new Set(pic.conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const notes = notesOf(pic);

  const src = state.sources.find((s) => s.id === state.src);
  const live = state.lastFrameAt !== undefined && Date.now() - state.lastFrameAt < 5000;
  const offH = state.theatre ? THEATRE_UTC_OFFSET_H[state.theatre] : undefined;
  const localD = state.utc && offH !== undefined ? new Date(state.utc.getTime() + offH * 3600_000) : undefined;
  const mySeats = state.seats.filter((s) => s.userId === state.user?.userId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const seatPill = (key: SeatKey) => {
    const holder = state.seats.find((s) => s.carrier === key.carrier && s.role === key.role);
    const mine = holder?.userId === state.user?.userId;
    return (
      <button
        key={`${key.carrier}:${key.role}`}
        className={`cc-seat ${holder ? (mine ? 'mine' : 'taken') : ''} ${holder?.away ? 'away' : ''}`}
        title={holder ? `${holder.name}${holder.away ? ' (reconnecting)' : ''}` : 'Open: click to claim'}
        disabled={!!holder && !mine}
        onClick={() => (mine ? release(key) : claim(key))}
      >
        <span className="role">{ROLE_LABEL[key.role]}</span>
        {holder && <span className="who">{holder.board ? `${holder.board} ` : ''}{holder.name}</span>}
      </button>
    );
  };

  // ---------------------------------------------------------------- radials manager
  const [newDep, setNewDep] = useState('');
  const [newStack, setNewStack] = useState('');
  const depCheck = (b: number) => (ship ? checkDepartureRadial(b, ship, plan.deps, plan.stacks.map((s) => ({ r: s.r, name: `stack ${s.id}` }))) : {});
  const stackCheck = (b: number) => (ship ? checkStackRadial(b, ship, plan.deps, plan.stacks) : {});
  const parsedDep = Number(newDep);
  const depStatus = newDep && Number.isFinite(parsedDep) ? depCheck(norm360(parsedDep)) : null;
  const parsedStack = Number(newStack);
  const stackStatus = newStack && Number.isFinite(parsedStack) ? stackCheck(norm360(parsedStack)) : null;
  const nextStackId = () => 'ABCDFGHJ'.split('').find((l) => !plan.stacks.some((s) => s.id === l)) ?? '?';

  return (
    <div className="cc-root" data-theme="dark">
      {/* ------------------------------------------------ top bar */}
      <header className="cc-top">
        <span className="cc-brand">CATCC</span>
        <nav className="cc-modules">
          <button className="on">Radar</button>
          <button disabled title="Not built yet">PriFly · LSO</button>
          <button disabled title="Not built yet">PriFly · Boss</button>
        </nav>
        {state.sources.length > 1 && (
          <select className="cc-select" value={state.src ?? ''} onChange={(e) => selectSource(e.target.value)}>
            {state.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select className="cc-select" value={hull ?? ''} onChange={(e) => setFocusHull(e.target.value)} disabled={!pic.carriers.length}>
          {pic.carriers.map((c) => (
            <option key={c.track.id} value={c.track.hull}>
              {c.track.hull} {CARRIER_HULLS[c.track.ty]?.name ?? ''}
            </option>
          ))}
          {!pic.carriers.length && <option value="">No carrier</option>}
        </select>
        <button className="cc-badge" onClick={() => setCaseNo((c) => (c === 'I' ? 'II' : c === 'II' ? 'III' : 'I'))} title="Recovery case">
          CASE {caseNo} · CV-1
        </button>
        <div className="cc-seats">
          {hull && SEAT_ROLES.filter((r) => r !== 'mission_commander').map((role) => seatPill({ carrier: hull, role }))}
          {seatPill({ carrier: '*', role: 'mission_commander' })}
          {!mySeats.length && <span className="cc-viewonly">VIEW ONLY</span>}
        </div>
        <span className="flex" />
        <span className={`cc-feed ${live ? 'live' : ''}`} title={src?.lastError ?? ''}>
          <span className="dot" />
          {state.conn !== 'open'
            ? state.conn === 'denied'
              ? 'Room · sign-in refused'
              : 'Room · connecting'
            : !src
              ? 'No sources'
              : live
                ? `${src.name} · live`
                : src.mission?.state === 'stopped'
                  ? `${src.name} · no mission`
                  : src.connected
                    ? `${src.name} · waiting`
                    : `${src.name} · offline`}
        </span>
        <span className="cc-clock">
          <span className="lbl">LOCAL</span>
          <span className="cc-mono">{localD ? hhmm(localD) : '--:--:--'}</span>
        </span>
        <span className="cc-clock">
          <span className="lbl">ZULU</span>
          <span className="cc-mono">{state.utc ? `${hhmm(state.utc)}Z` : '--:--:--'}</span>
        </span>
        <button className="cc-iconbtn" title="Open another display (new window)" onClick={() => window.open(window.location.href, '_blank', 'popup,width=1400,height=900')}>
          <Icon name="externalLink" size={16} />
        </button>
      </header>
      {state.error && (
        <div className="cc-error" onClick={clearError}>
          {state.error} <Icon name="close" size={12} />
        </div>
      )}

      <div className="cc-main">
        {/* ------------------------------------------------ left sidebar */}
        <aside className="cc-side">
          <div className="cc-tabs">
            <button className={leftTab === 'info' ? 'on' : ''} onClick={() => setLeftTab('info')}>
              Info
            </button>
            <button className={leftTab === 'strips' ? 'on' : ''} onClick={() => setLeftTab('strips')}>
              Strips <span className="cc-mono count">{nFlights} · {nAircraft}</span>
            </button>
          </div>
          {leftTab === 'info' ? (
            <InfoPanel pic={pic} />
          ) : (
            <DndContext sensors={sensors}>
              <div className="cc-strips">
                {PHASE_ORDER.filter((p) => strips.get(p)?.length).map((p) => (
                  <section key={p}>
                    <h4>
                      {PHASE_LABEL[p]} <span className="cc-mono">{strips.get(p)!.length}</span>
                    </h4>
                    {strips.get(p)!.map(({ f, flight }) => (
                      <div
                        key={f.id}
                        className={`cc-strip ${f.members.some((m) => m.id === hookedId) ? 'sel' : ''} ${f.members.some((m) => conflictIds.has(m.id)) ? 'conflict' : ''}`}
                        onClick={() => setHookedId(f.lead.id)}
                      >
                        <FlightCard {...flight} />
                      </div>
                    ))}
                  </section>
                ))}
                {!nFlights && <div className="cc-empty">No flights</div>}
              </div>
            </DndContext>
          )}
        </aside>

        {/* ------------------------------------------------ scope */}
        <main className="cc-center">
          <Scope
            pic={pic}
            utc={state.utc}
            hookedId={hookedId}
            onHook={setHookedId}
            deps={plan.deps}
            stacks={plan.stacks}
            assignments={assignments}
            onAssign={onAssign}
            goTo={goTo}
            fit={fit}
            onFit={setFit}
          />
        </main>

        {/* ------------------------------------------------ right sidebar */}
        <aside className="cc-side">
          <div className="cc-panel">
            <h3>Radials</h3>
            {plan.deps.map((r) => (
              <div key={`d${r}`} className="cc-row">
                <span className="cc-mono">DR {r3(r)}</span>
                <span className="flex" />
                <button className="cc-iconbtn" title="Remove" onClick={() => setPlan((p) => ({ ...p, deps: p.deps.filter((x) => x !== r) }))}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            {plan.stacks.map((s) => {
              const levels = [...assignments.entries()].filter(([, a]) => a.stackId === s.id).sort((a, b) => a[1].angels - b[1].angels);
              return (
                <div key={`s${s.id}`} className="cc-row stack">
                  <div className="cc-rowline">
                    <span className="cc-mono">
                      Stack {s.id} {r3(s.r)}R A{s.base}+
                    </span>
                    {ship && angDiff(s.r, ship.brc) < 90 && <span className="cc-warn">BOW-ON</span>}
                    <span className="flex" />
                    <button className="cc-iconbtn" title="Base −" onClick={() => setPlan((p) => ({ ...p, stacks: p.stacks.map((x) => (x.id === s.id ? { ...x, base: Math.max(6, x.base - 1) } : x)) }))}>
                      <Icon name="minus" size={13} />
                    </button>
                    <button className="cc-iconbtn" title="Base +" onClick={() => setPlan((p) => ({ ...p, stacks: p.stacks.map((x) => (x.id === s.id ? { ...x, base: Math.min(20, x.base + 1) } : x)) }))}>
                      <Icon name="plus" size={13} />
                    </button>
                    <button className="cc-iconbtn" title="Remove" onClick={() => setPlan((p) => ({ ...p, stacks: p.stacks.filter((x) => x.id !== s.id) }))}>
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                  {levels.map(([id, a]) => {
                    const t = pic.air.find((x) => x.id === id);
                    return (
                      <div key={id} className="cc-level cc-mono">
                        <span>A{a.angels}</span>
                        <span>{a.angels + 15} DME</span>
                        <span>EAT {hhmm(new Date(a.eatS * 1000)).slice(0, 5)}</span>
                        <span>{t?.bd ?? t?.cs ?? t?.pi ?? id}</span>
                        <button className="cc-iconbtn" title="Clear" onClick={() => assign(id, null)}>
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {ship && (
              <div className="cc-row">
                <span className="cc-mono emerg">Emergency {r3(ship.fb + 150)}R · Helo {r3(ship.fb + 110)}R</span>
              </div>
            )}
            <div className="cc-add">
              <input className="cc-mono" placeholder="DEP radial" value={newDep} onChange={(e) => setNewDep(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} />
              <button
                disabled={!depStatus || !!depStatus.err}
                onClick={() => {
                  setPlan((p) => ({ ...p, deps: [...p.deps, norm360(parsedDep)].sort((a, b) => a - b) }));
                  setNewDep('');
                }}
              >
                Add
              </button>
              <span className={`status ${depStatus?.err ? 'err' : depStatus?.warn ? 'warn' : ''}`}>{depStatus?.err ?? depStatus?.warn ?? ''}</span>
            </div>
            <div className="cc-add">
              <input className="cc-mono" placeholder="Stack radial" value={newStack} onChange={(e) => setNewStack(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} />
              <button
                disabled={!stackStatus || !!stackStatus.err}
                onClick={() => {
                  setPlan((p) => ({ ...p, stacks: [...p.stacks, { id: nextStackId(), r: norm360(parsedStack), base: 6 }] }));
                  setNewStack('');
                }}
              >
                Add stack
              </button>
              <span className={`status ${stackStatus?.err ? 'err' : stackStatus?.warn ? 'warn' : ''}`}>{stackStatus?.err ?? stackStatus?.warn ?? ''}</span>
            </div>
          </div>

          <div className="cc-panel">
            <h3>Notifications</h3>
            {notes
              .filter((n) => !acked.has(n.key))
              .map((n) => (
                <div key={n.key} className={`cc-note ${n.kind === 'CONFLICT' ? 'conflict' : 'warn'}`}>
                  <div className="cc-rowline">
                    <span className="kind">{n.kind}</span>
                    <span className="cc-mono time">{state.utc ? hhmm(state.utc).slice(0, 5) : ''}</span>
                    <span className="flex" />
                    <button className="cc-iconbtn" title="Centre the scope" onClick={() => setGoTo({ p: n.p, nonce: Date.now() })}>
                      <Icon name="crosshair" size={13} />
                    </button>
                    <button className="cc-ack" onClick={() => setAcked((s) => new Set(s).add(n.key))}>
                      Ack
                    </button>
                  </div>
                  <div className="cc-mono title">{n.title}</div>
                </div>
              ))}
            {!notes.filter((n) => !acked.has(n.key)).length && <div className="cc-empty">None</div>}
          </div>
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- info panel

const InfoPanel: React.FC<{ pic: Picture }> = ({ pic }) => {
  const f = pic.focus;
  if (!f) return <div className="cc-empty">No carrier</div>;
  const t = f.track;
  const wx = t.wx;
  const kt = (ms: number | null | undefined) => (ms == null ? '-' : Math.round(ms / 0.514444).toString());
  // wind over deck: ship's own motion (headwind = speed on the BRC) plus true wind
  let wod: { dir: number; kt: number; angle: number } | undefined;
  if (wx?.d0 != null && wx.s0 != null) {
    const toRad = Math.PI / 180;
    const wTo = (wx.d0 + 180) * toRad;
    const wv = [Math.sin(wTo) * wx.s0, Math.cos(wTo) * wx.s0];
    const sv = [Math.sin(f.ship.brc * toRad) * ((t.gs ?? 0) * 0.514444), Math.cos(f.ship.brc * toRad) * ((t.gs ?? 0) * 0.514444)];
    const rel = [wv[0] - sv[0], wv[1] - sv[1]]; // air motion relative to the deck
    const spd = Math.hypot(rel[0], rel[1]);
    const from = norm360(Math.atan2(rel[0], rel[1]) / toRad + 180);
    wod = { dir: from, kt: spd / 0.514444, angle: Math.round(((from - f.ship.fb + 540) % 360) - 180) };
  }
  const inHg = wx?.qnh != null ? (wx.qnh / 3386.389).toFixed(2) : '-';
  const hPa = wx?.qnh != null ? Math.round(wx.qnh / 100) : '-';
  const tempC = wx?.tK != null ? Math.round(wx.tK - 273.15) : '-';
  return (
    <div className="cc-info">
      <div className="cc-ship">
        <div className="hull">{t.hull}</div>
        <div className="name">{CARRIER_HULLS[t.ty]?.name ?? t.ty}</div>
      </div>
      <dl className="cc-kv cc-mono">
        <dt>BRC</dt>
        <dd>{r3(f.ship.brc)}</dd>
        <dt>FB</dt>
        <dd>{r3(f.ship.fb)}</dd>
        <dt>SPEED</dt>
        <dd>{Math.round(t.gs ?? 0)} KT</dd>
        <dt>WOD</dt>
        <dd>{wod ? `${r3(wod.dir)} / ${Math.round(wod.kt)} KT` : '-'}</dd>
        <dt>DOWN ANGLE</dt>
        <dd>{wod ? `${wod.angle > 0 ? 'R' : wod.angle < 0 ? 'L' : ''}${Math.abs(wod.angle)}°` : '-'}</dd>
        <dt>TRUE WIND</dt>
        <dd>{wx?.d0 != null ? `${r3(wx.d0)} / ${kt(wx.s0)} KT` : '-'}</dd>
      </dl>
      <dl className="cc-kv cc-mono">
        <dt>ALTIMETER</dt>
        <dd>
          {inHg} / {hPa}
        </dd>
        <dt>TEMP</dt>
        <dd>{tempC} °C</dd>
        <dt>WIND 2K</dt>
        <dd>{wx?.d2 != null ? `${r3(wx.d2)} / ${kt(wx.s2)}` : '-'}</dd>
        <dt>WIND 10K</dt>
        <dd>{wx?.d10 != null ? `${r3(wx.d10)} / ${kt(wx.s10)}` : '-'}</dd>
      </dl>
      {!wx && <div className="cc-empty">Weather needs the CATCC DCS hook source</div>}
    </div>
  );
};

export default CatccApp;
