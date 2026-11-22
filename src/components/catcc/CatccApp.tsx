/**
 * CATCC & PriFly shell: one room connection; locations on the ship (CDC, CATCC, PriFly, Bridge, LSO)
 * each with one seat (condensed) or several (expanded), selected by ?seat=. Each seat shows its
 * interface (radar with the seat's preset, PriFly boss, LSO). Headers ported from
 * catcc-handoff/mockup/*.dc.html.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { THEATRE_UTC_OFFSET_H } from '../../catcc/core/dcs/aircraft.ts';
import { carrierByHull } from '../../catcc/core/tracks/naming.ts';
import type { SeatKey, SeatRole } from '../../catcc/core/room/protocol.ts';
import { IcBook, IcCatcc, IcDisplays, IcPrifly } from './icons.tsx';
import { BossView } from './prifly/BossView.tsx';
import { deckStatus } from './prifly/deck.ts';
import { LsoView, lsoHeaderInfo } from './prifly/LsoView.tsx';
import { useDeckLog } from './prifly/useDeckLog.ts';
import { envSummary } from './radar/InfoPanels.tsx';
import RadarView from './radar/RadarView.tsx';
import { buildPicture } from './scopeModel.ts';
import { SCAN_S, useSweep } from './radar/sweep.ts';
import { CONFLICT_DEF, type ConflictCfg } from './radar/types.ts';
import { useCatccRoom } from './useCatccRoom.ts';
import { PLAN_ROLES } from '../../catcc/core/room/protocol.ts';
import { launchAuthority } from '../../catcc/core/room/launch.ts';
import { LOCATIONS, resolveSeat, seatsAt, type SeatLayout } from './seats.ts';
import { OptionsDialog } from './OptionsDialog.tsx';
import { Reference } from './radar/Panels.tsx';
import { FinalView } from './final/FinalView.tsx';
import { deckCall } from './deck.ts';
import type { HandoffCtx } from './ownership.ts';
import { EmptyState } from '../ui/primitives/Display';
import './catcc.css';

const hms = (d: Date) => [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');

const CatccApp: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [layout, setLayoutState] = useState<SeatLayout>(() => {
    try {
      return localStorage.getItem('catcc.layout') === 'expanded' ? 'expanded' : 'condensed';
    } catch {
      return 'condensed';
    }
  });
  const [seatWant, setSeatWant] = useState<string | null>(() => params.get('seat') ?? params.get('m'));
  const seatDef = resolveSeat(layout, seatWant);
  const mod = seatDef.view;
  const [optsOpen, setOptsOpen] = useState(false);
  const { state, history, selectSource, claim, release, setPlan, assign, setIntercept, handoff, accept, setOps, clearLaunch } = useCatccRoom(params.get('src') ?? undefined);
  const [focusHull, setFocusHull] = useState<string | undefined>(params.get('cv') ?? undefined);
  const [uiOpen, setUiOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [bossMode, setBossMode] = useState<'live' | 'sand'>('live');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [conflict, setConflictState] = useState<ConflictCfg>(() => {
    try {
      return { ...CONFLICT_DEF, ...JSON.parse(localStorage.getItem('catcc.conflict') ?? '{}') };
    } catch {
      return CONFLICT_DEF;
    }
  });
  const setConflict = (c: ConflictCfg) => {
    setConflictState(c);
    try {
      localStorage.setItem('catcc.conflict', JSON.stringify(c));
    } catch {
      /* private mode */
    }
  };
  // aircraft assigned to a marshal level are not predicted to descend below it
  const floors = useMemo(() => new Map(Object.entries(state.assignments).map(([id, a]) => [id, a.angels * 1000])), [state.assignments]);
  // CATCC seats switch between the radar and the Approach / Final displays (Approach and Final open on the latter)
  const [catccView, setCatccViewState] = useState<Record<string, 'radar' | 'final'>>(() => {
    try {
      return JSON.parse(localStorage.getItem('catcc.view') ?? '{}');
    } catch {
      return {};
    }
  });
  const cview = seatDef.loc === 'catcc' ? (catccView[seatDef.id] ?? (seatDef.id === 'approach' || seatDef.id === 'final' ? 'final' : 'radar')) : 'radar';
  const setCatccView = (v: 'radar' | 'final') => {
    const n = { ...catccView, [seatDef.id]: v };
    setCatccViewState(n);
    try {
      localStorage.setItem('catcc.view', JSON.stringify(n));
    } catch {
      /* private mode */
    }
  };
  // realistic radar update rate (radar module only): the picture is what the sweep has painted
  const refId = useMemo(() => {
    const cvs = state.tracks.filter((t) => t.k === 'carrier').sort((a, b) => (a.hull ?? '').localeCompare(b.hull ?? ''));
    return (cvs.find((c) => c.hull === focusHull) ?? cvs[0])?.id;
  }, [state.tracks, focusHull]);
  // the ACLS radar (SPN-46) feeds the final controller's display only, and only while the ACLS is up
  const refHull = state.tracks.find((t) => t.id === refId)?.hull;
  const aclsUp = (refHull ? state.ops[refHull]?.aids?.acls : undefined) ?? true;
  const sw = useSweep(state.tracks, state.mt, refId, conflict.sweep && mod === 'radar', !!conflict.datalink, cview === 'final' && aclsUp);
  const pic = useMemo(
    () =>
      buildPicture(sw?.tracks ?? state.tracks, focusHull, sw?.hist ?? history, state.mt, {
        conflictLookAheadS: conflict.lookAheadS,
        vertCapS: conflict.vertCapS,
        floors,
        trailStepS: sw ? SCAN_S : undefined,
      }),
    [sw, state.tracks, focusHull, history, state.mt, conflict, floors],
  );
  const hull = pic.focus?.track.hull;
  useEffect(() => {
    if (!focusHull && hull) setFocusHull(hull);
  }, [focusHull, hull]);
  const switchSeat = (id: string) => {
    setSeatWant(id);
    const u = new URL(window.location.href);
    u.searchParams.delete('m');
    u.searchParams.set('seat', id);
    window.history.replaceState(null, '', u.toString());
  };
  const setLayout = (l: SeatLayout) => {
    setLayoutState(l);
    try {
      localStorage.setItem('catcc.layout', l);
    } catch {
      /* private mode */
    }
  };
  const locSeats = seatsAt(layout, seatDef.loc);
  const setHullOps = (patch: Record<string, unknown>) => hull && setOps(hull, patch);
  const locLabel = (LOCATIONS.find((l) => l.id === seatDef.loc)?.label ?? '').toUpperCase();

  const offH = state.theatre ? THEATRE_UTC_OFFSET_H[state.theatre] : undefined;
  const utc = state.utc;
  const local = utc && offH !== undefined ? new Date(utc.getTime() + offH * 3_600_000) : undefined;
  const env = envSummary(pic.focus, state.env, utc);
  const deck = deckStatus(pic);
  const ops = hull ? state.ops[hull] : undefined;
  // PriFly's call wins over the picture
  const dc = deckCall(pic, ops);
  const deckClear = dc ? !dc.foul : null;
  const allAir = useMemo(() => [...pic.air, ...(pic.ground ?? [])], [pic.air, pic.ground]);
  const { log, landedAt } = useDeckLog(pic.focus, allAir, local);
  const assignments = useMemo(() => new Map(Object.entries(state.assignments)), [state.assignments]);
  const src = state.sources.find((s) => s.id === state.src);
  const live = state.lastFrameAt !== undefined && Date.now() - state.lastFrameAt < 5000;
  const user = state.user;
  const mine = state.seats.filter((s) => s.userId === user?.userId);
  // carrier plans are edited from CATCC and the bridge: once any of those seats is held, only its holders may edit
  const carrierSeats = state.seats.filter((s) => (s.carrier === hull || s.carrier === '*') && PLAN_ROLES.includes(s.role));
  const mayEdit = carrierSeats.length === 0 || carrierSeats.some((s) => s.userId === user?.userId);
  // ops state (deck call, lights, launch, aids, formation): anyone with a seat on this carrier, or anyone while none are held
  const anyCarrierSeat = state.seats.filter((s) => s.carrier === hull || s.carrier === '*');
  const mayEditOps = anyCarrierSeat.length === 0 || anyCarrierSeat.some((s) => s.userId === user?.userId);
  // launch clearance: the Shooter, else the Air Boss, clears each shot (nobody seated: launches go on the salute)
  const launchAuth = hull ? launchAuthority(state.seats, hull) : null;
  const launch = hull ? state.launch[hull] : undefined;
  const mayClear = !!launchAuth && launchAuth.userId === user?.userId;
  const handoffCtx: HandoffCtx = { layout, me: { carrier: hull ?? '', role: seatDef.id }, seats: state.seats, userId: user?.userId, onHandoff: handoff, onAccept: accept };

  const seatPill = (key: SeatKey, label: string) => {
    const h = state.seats.find((s) => s.carrier === key.carrier && s.role === key.role);
    const me = !!h && h.userId === user?.userId;
    const st = !h
      ? { who: 'Open', init: '+', title: `Assume ${label}`, bs: 'dashed', bc: '#374250', bg: 'transparent', cur: 'pointer', as: 'dashed', ab: '#5E6A78', af: 'transparent', afg: '#93A1B0', whoFg: '#93A1B0' }
      : me
        ? { who: `${h.board ? `${h.board} · ` : ''}You`, init: String(h.board ?? 'ME'), title: `You hold ${label} · click to release`, bs: 'solid', bc: '#F15822', bg: 'rgba(241,88,34,.12)', cur: 'pointer', as: 'solid', ab: '#F15822', af: '#F15822', afg: '#0E1116', whoFg: '#FFB08F' }
        : { who: `${h.board ? `${h.board} · ` : ''}${h.name}${h.away ? ' (away)' : ''}`, init: String(h.board ?? h.name.slice(0, 2).toUpperCase()), title: `${label} held by ${h.name}`, bs: 'solid', bc: '#374250', bg: '#1A212A', cur: 'default', as: 'solid', ab: '#3E9BD4', af: '#1F3A52', afg: '#CFE6F6', whoFg: '#C9D3DD' };
    return (
      <button
        key={`${key.carrier}:${key.role}`}
        onClick={() => (!h ? claim(key) : me ? release(key) : undefined)}
        title={st.title}
        aria-label={st.title}
        style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 12px 0 4px', borderRadius: 19, border: `1px ${st.bs} ${st.bc}`, background: st.bg, cursor: st.cur, fontFamily: "'IBM Plex Mono', monospace", opacity: h?.away ? 0.6 : 1 }}
      >
        <span style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px ${st.as} ${st.ab}`, background: st.af, color: st.afg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, flex: '0 0 28px' }}>{st.init}</span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
          <span style={{ fontSize: 10, letterSpacing: '.1em', color: '#93A1B0' }}>{label}</span>
          <span style={{ fontSize: 11.5, color: st.whoFg, whiteSpace: 'nowrap' }}>{st.who}</span>
        </span>
      </button>
    );
  };
  const seat = (role: SeatRole, label: string) => (hull ? seatPill({ carrier: hull, role }, label) : null);

  const logo = (icon: React.ReactNode, text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 5, background: '#F15822', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '.08em' }}>{text}</div>
    </div>
  );
  // seat tabs carry a dot for who holds the seat on this carrier (orange: you, blue: someone else)
  const holderDot = (id: string) => {
    const h = hull ? state.seats.find((s) => s.carrier === hull && s.role === id) : undefined;
    if (!h) return null;
    const me = h.userId === user?.userId;
    return <span aria-label={me ? 'held by you' : `held by ${h.name}`} title={me ? 'You hold this seat' : `Held by ${h.name}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle', background: me ? '#F15822' : '#3E9BD4', opacity: h.away ? 0.5 : 1 }} />;
  };
  const tabLink = (id: string, label: string, on: boolean, title?: string, dot?: React.ReactNode) => (
    <a
      key={id}
      href={`?seat=${id}`}
      title={title}
      aria-current={on ? 'page' : undefined}
      onClick={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        switchSeat(id);
      }}
      style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: 4, background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', fontSize: 13, fontWeight: on ? 600 : 400 }}
    >
      {label}
      {dot}
    </a>
  );
  // locations, then (expanded layout) the seats at this location
  const nav = (
    <>
      <nav aria-label="Location" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
        {LOCATIONS.map((l) => tabLink(seatsAt(layout, l.id)[0].id, l.label, l.id === seatDef.loc, l.name))}
      </nav>
      {locSeats.length > 1 && (
        <nav aria-label="Seat" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
          {locSeats.map((s) => tabLink(s.id, s.label, s.id === seatDef.id, undefined, holderDot(s.id)))}
        </nav>
      )}
    </>
  );
  const optsBtn = (
    <button onClick={() => setOptsOpen(true)} aria-label="Options" title="Options: seat layout" style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: optsOpen ? 'rgba(241,88,34,.18)' : '#0E1116', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
      Options
    </button>
  );
  // live green; a feed that's up but idle amber; refused / offline / no sources red; connecting grey. Not live = animated.
  const feedColour = live ? '#40A85B' : state.conn === 'denied' || (state.conn === 'open' && (!src || !src.connected)) ? '#FF8A85' : state.conn === 'open' ? '#DE9A1F' : '#93A1B0';
  const feed = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#93A1B0' }} title={src?.lastError ?? ''}>
      <span className={live ? undefined : 'cc-feed-alert'} style={{ width: 8, height: 8, borderRadius: '50%', background: feedColour, color: feedColour, flex: 'none' }} />
      <span className={live ? undefined : 'cc-feed-alert-text'} style={{ color: live ? undefined : feedColour }}>
      {state.conn !== 'open'
        ? state.conn === 'denied'
          ? 'Room · sign-in refused'
          : 'Room · connecting'
        : !src
          ? 'No sources'
          : `${src.name} feed · ${live ? 'live' : src.mission?.state === 'stopped' ? 'no mission' : src.connected ? 'waiting' : 'offline'}`}
      </span>
    </div>
  );
  const sourceSelect =
    state.sources.length > 1 ? (
      <select value={state.src ?? ''} onChange={(e) => selectSource(e.target.value)} style={{ background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
        {state.sources.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    ) : null;
  const headerStyle: React.CSSProperties = { display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #262F3A', background: '#151A21', flex: 'none', overflowX: 'auto', whiteSpace: 'nowrap' };
  const hdrBtn = (on: boolean): React.CSSProperties => ({ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: on ? 'rgba(241,88,34,.18)' : '#0E1116', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' });
  const caseBadge = (text: string) => (
    <div style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(241,88,34,.15)', border: '1px solid #F15822', color: '#FFB08F', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: '.1em' }}>{text}</div>
  );

  // the room refused this user (not a member of the wing): nothing of the interface
  if (state.conn === 'forbidden')
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <EmptyState icon="lock" title="Access denied" message={state.refused} />
      </div>
    );

  return (
    <div className="cc-root" data-theme="dark" onContextMenu={(e) => e.preventDefault()}>
      {/* the header carries only what every seat shares; view-specific status lives in the views */}
      <header style={headerStyle}>
        {logo(mod === 'radar' ? <IcCatcc /> : <IcPrifly />, locLabel)}
        {nav}
        {sourceSelect}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="lbl" htmlFor="boat">Ship</label>
          <select id="boat" value={hull ?? ''} onChange={(e) => setFocusHull(e.target.value)} style={{ background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
            {pic.carriers.map((c) => (
              <option key={c.track.id} value={c.track.hull}>
                {c.track.hull} · {carrierByHull(c.track.hull)?.nick ?? ''}
              </option>
            ))}
            {!pic.carriers.length && <option value="">No carrier</option>}
          </select>
        </div>
        {seatDef.loc === 'catcc' && (
          <div style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }} aria-label="CATCC view">
            {([['radar', 'Radar'], ['final', 'Approach / Final']] as const).map(([k, l]) => (
              <button key={k} aria-pressed={cview === k} onClick={() => setCatccView(k)} style={{ border: 0, height: 28, padding: '0 10px', borderRadius: 4, background: cview === k ? '#222C37' : 'transparent', color: cview === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5, fontWeight: cview === k ? 600 : 400, cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>
        )}
        {caseBadge(`CASE ${env?.case ?? 'III'} · CV-1`)}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} aria-label="Seat">
          {seat(seatDef.id, seatDef.short)}
          {!mine.length && <span className="mono" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #374250', color: '#93A1B0' }}>VIEW ONLY</span>}
        </div>
        <div style={{ flex: 1 }} />
        {feed}
        <div style={{ display: 'flex', gap: 14, fontFamily: "'IBM Plex Mono', monospace" }} aria-label="Time">
          <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
            <div style={{ fontSize: 10, color: '#93A1B0', letterSpacing: '.12em' }}>LOCAL{offH !== undefined ? ` · UTC${offH >= 0 ? '+' : ''}${offH}` : ''}</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{local ? hms(local) : '--:--:--'}</div>
          </div>
          <div style={{ width: 1, background: '#374250' }} />
          <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
            <div style={{ fontSize: 10, color: '#93A1B0', letterSpacing: '.12em' }}>ZULU</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{utc ? `${hms(utc)}Z` : '--:--:--'}</div>
          </div>
        </div>
        <button onClick={() => setRefOpen(!refOpen)} aria-expanded={refOpen} aria-label="Reference" title="Reference: minimums, approaches, CV NATOPS" style={hdrBtn(refOpen)}>
          <IcBook />
          Reference
        </button>
        <button aria-label="Open another display" title="Pop out to another monitor / device" onClick={() => window.open(window.location.href, '_blank', 'popup,width=1440,height=900')} style={hdrBtn(false)}>
          <IcDisplays />
          Displays
        </button>
        {optsBtn}
      </header>

      {/* PriFly / LSO: the view's own status bar (deck state, wind over deck, view mode) */}
      {mod !== 'radar' && (
        <div role="toolbar" aria-label="View status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid #262F3A', background: '#11161C', flex: 'none', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {mod === 'boss' && (
            <div style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }} aria-label="Deck view mode">
              {([['live', 'Live positions'], ['sand', 'Ouija Board']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setBossMode(k)} style={{ border: 0, padding: '5px 11px', borderRadius: 4, background: bossMode === k ? '#222C37' : 'transparent', color: bossMode === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {mod === 'lso' && <div className="mono" style={{ fontSize: 12.5, color: '#E6EDF3' }}>{lsoHeaderInfo(pic)}</div>}
          <div style={{ flex: 1 }} />
          {mod === 'lso' && deckClear != null && (
            <div style={{ padding: '4px 12px', borderRadius: 5, background: deckClear ? 'rgba(64,168,91,.2)' : 'rgba(224,82,78,.2)', border: `1px solid ${deckClear ? '#40A85B' : '#E0524E'}`, color: deckClear ? '#8FE0A6' : '#FF9C98', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 12.5, letterSpacing: '.12em' }}>
              {deckClear ? 'CLEAR DECK' : 'FOUL DECK'}
            </div>
          )}
          <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0' }}>{`${hull ?? '—'} · RECOVERY · ${deck?.jets.length ?? 0} aboard`}</span>
        </div>
      )}

      {mod === 'radar' && cview === 'final' && (
        <FinalView
          key={`final-${seatDef.id}`}
          pic={pic}
          ops={ops}
          setOps={setHullOps}
          deck={dc}
          local={local}
          defaultRange={seatDef.id === 'final' ? 12 : 24}
          handoffCtx={handoffCtx}
          owners={state.owners}
          readOnly={!mayEditOps}
          recoveryCase={env?.case}
        />
      )}
      {mod === 'radar' && cview === 'radar' && (
        <RadarView
          key={seatDef.id}
          seat={seatDef}
          handoffCtx={handoffCtx}
          ops={ops}
          setOps={setHullOps}
          mayEditOps={mayEditOps}
          state={state}
          pic={pic}
          offH={offH}
          mayEdit={mayEdit}
          sendPlan={setPlan}
          assign={assign}
          setIntercept={setIntercept}
          uiOpen={uiOpen}
          setUiOpen={setUiOpen}
          conflict={conflict}
          setConflict={setConflict}
        />
      )}
      {mod === 'lso' && <LsoView pic={pic} mt={state.mt} assignments={assignments} offH={offH} />}
      {mod === 'boss' && <BossView key={seatDef.id} pic={pic} mode={bossMode} log={log} landedAt={landedAt} ops={ops} setOps={setHullOps} deck={dc} readOnly={!mayEditOps} env={state.env} utc={utc} offH={offH} mt={state.mt} assignments={assignments} defaultTab={seatDef.id === 'miniboss' ? 'plan' : 'launch'} launch={launch} mayClear={mayClear} onClear={(id, c) => hull && clearLaunch(hull, id, c)} />}
      {optsOpen && <OptionsDialog layout={layout} onLayout={setLayout} onClose={() => setOptsOpen(false)} />}
      {refOpen && <Reference onClose={() => setRefOpen(false)} current={{ hull: hull ?? '', ceiling: env?.ceiling ?? null, vis: env?.visNm ?? null }} />}
    </div>
  );
};

export default CatccApp;
