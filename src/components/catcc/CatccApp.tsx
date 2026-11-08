/**
 * CATCC & PriFly shell: one room connection, three modules (Radar, PriFly · LSO, PriFly · Boss)
 * selected by ?m=. Headers ported from catcc-handoff/mockup/*.dc.html.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { THEATRE_UTC_OFFSET_H } from '../../catcc/core/dcs/aircraft.ts';
import { carrierByHull } from '../../catcc/core/tracks/naming.ts';
import type { SeatKey, SeatRole } from '../../catcc/core/room/protocol.ts';
import { IcBook, IcCatcc, IcDisplays, IcPrifly, IcSliders } from './icons.tsx';
import { BossChips, BossView, deckStatus } from './prifly/BossView.tsx';
import { LsoView, lsoHeaderInfo } from './prifly/LsoView.tsx';
import { useDeckLog } from './prifly/useDeckLog.ts';
import { envSummary } from './radar/InfoPanels.tsx';
import RadarView from './radar/RadarView.tsx';
import { buildPicture } from './scopeModel.ts';
import { useCatccRoom } from './useCatccRoom.ts';
import './catcc.css';

type Module = 'radar' | 'lso' | 'boss';
const hms = (d: Date) => [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');

const CatccApp: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [mod, setMod] = useState<Module>(() => (['radar', 'lso', 'boss'].includes(params.get('m') ?? '') ? (params.get('m') as Module) : 'radar'));
  const { state, history, selectSource, claim, release, setPlan, assign } = useCatccRoom(params.get('src') ?? undefined);
  const [focusHull, setFocusHull] = useState<string | undefined>(params.get('cv') ?? undefined);
  const [uiOpen, setUiOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [bossMode, setBossMode] = useState<'live' | 'sand'>('live');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pic = useMemo(() => buildPicture(state.tracks, focusHull, history, state.mt), [state.tracks, focusHull, history, state.mt]);
  const hull = pic.focus?.track.hull;
  useEffect(() => {
    if (!focusHull && hull) setFocusHull(hull);
  }, [focusHull, hull]);
  const switchMod = (m: Module) => {
    setMod(m);
    const u = new URL(window.location.href);
    u.searchParams.set('m', m);
    window.history.replaceState(null, '', u.toString());
  };

  const offH = state.theatre ? THEATRE_UTC_OFFSET_H[state.theatre] : undefined;
  const utc = state.utc;
  const local = utc && offH !== undefined ? new Date(utc.getTime() + offH * 3_600_000) : undefined;
  const env = envSummary(pic.focus, state.env, utc);
  const deck = deckStatus(pic);
  const deckClear = deck ? deck.foul.length === 0 : null;
  const { log, landedAt } = useDeckLog(pic.focus, pic.air, local);
  const assignments = useMemo(() => new Map(Object.entries(state.assignments)), [state.assignments]);
  const src = state.sources.find((s) => s.id === state.src);
  const live = state.lastFrameAt !== undefined && Date.now() - state.lastFrameAt < 5000;
  const user = state.user;
  const mine = state.seats.filter((s) => s.userId === user?.userId);
  const carrierSeats = state.seats.filter((s) => s.carrier === hull || s.carrier === '*');
  const mayEdit = carrierSeats.length === 0 || carrierSeats.some((s) => s.userId === user?.userId);

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
  const nav = (
    <nav aria-label="Module" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
      {([['radar', 'Radar'], ['lso', 'PriFly · LSO'], ['boss', 'PriFly · Boss']] as const).map(([k, l]) => (
        <a
          key={k}
          href={`?m=${k}`}
          onClick={(e) => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
            e.preventDefault();
            switchMod(k);
          }}
          style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: 4, background: mod === k ? '#222C37' : 'transparent', color: mod === k ? '#E6EDF3' : '#93A1B0', fontSize: 13, fontWeight: mod === k ? 600 : 400 }}
        >
          {l}
        </a>
      ))}
    </nav>
  );
  const feed = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#93A1B0' }} title={src?.lastError ?? ''}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#40A85B' : state.conn === 'open' ? '#DE9A1F' : '#5E6A78' }} />
      {state.conn !== 'open'
        ? state.conn === 'denied'
          ? 'Room · sign-in refused'
          : 'Room · connecting'
        : !src
          ? 'No sources'
          : `${src.name} feed · ${live ? 'live' : src.mission?.state === 'stopped' ? 'no mission' : src.connected ? 'waiting' : 'offline'}`}
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

  return (
    <div className="cc-root" data-theme="dark">
      {mod === 'radar' ? (
        <header style={headerStyle}>
          {logo(<IcCatcc />, 'CATCC')}
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
          {caseBadge(`CASE ${env?.case ?? 'III'} · CV-1`)}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} aria-label="Controller positions">
            {seat('departure', 'DEPARTURE')}
            {seat('marshal', 'MARSHAL')}
            {seat('approach', 'APPROACH')}
            {seat('final', 'FINAL')}
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
          <button onClick={() => setUiOpen(true)} aria-label="Display settings" title="Display settings" style={{ ...hdrBtn(uiOpen), width: 36, padding: 0, justifyContent: 'center' }}>
            <IcSliders />
          </button>
          <button aria-label="Open another display" title="Pop out to another monitor / device" onClick={() => window.open(window.location.href, '_blank', 'popup,width=1440,height=900')} style={hdrBtn(false)}>
            <IcDisplays />
            Displays
          </button>
        </header>
      ) : (
        <header style={headerStyle}>
          {logo(<IcPrifly />, 'PRIFLY')}
          {nav}
          {sourceSelect}
          {mod === 'boss' && (
            <div style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }} aria-label="Deck view mode">
              {([['live', 'Live positions'], ['sand', 'Sand table']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setBossMode(k)} style={{ border: 0, padding: '5px 11px', borderRadius: 4, background: bossMode === k ? '#222C37' : 'transparent', color: bossMode === k ? '#E6EDF3' : '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {mod === 'lso' && (
            <>
              {caseBadge(`${hull ?? '—'} · CASE ${env?.case ?? 'III'}`)}
              <div className="mono" style={{ fontSize: 12.5, color: '#E6EDF3' }}>{lsoHeaderInfo(pic)}</div>
            </>
          )}
          {seat(mod === 'lso' ? 'lso' : 'boss', mod === 'lso' ? 'LSO' : 'AIR BOSS')}
          <div style={{ flex: 1 }} />
          {mod === 'boss' && <BossChips pic={pic} />}
          {mod === 'lso' && deckClear != null && (
            <div style={{ padding: '6px 14px', borderRadius: 5, background: deckClear ? 'rgba(64,168,91,.2)' : 'rgba(224,82,78,.2)', border: `1px solid ${deckClear ? '#40A85B' : '#E0524E'}`, color: deckClear ? '#8FE0A6' : '#FF9C98', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, letterSpacing: '.12em' }}>
              {deckClear ? 'CLEAR DECK' : 'FOUL DECK'}
            </div>
          )}
          {feed}
          <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.15 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{local ? `${hms(local)}L` : '--:--:--'}</div>
            <div style={{ fontSize: 11, color: '#93A1B0' }}>{mod === 'lso' ? `RECOVERY · ${deck?.jets.length ?? 0} aboard` : `${hull ?? '—'} · RECOVERY`}</div>
          </div>
        </header>
      )}

      {mod === 'radar' && (
        <RadarView
          state={state}
          pic={pic}
          offH={offH}
          mayEdit={mayEdit}
          sendPlan={setPlan}
          assign={assign}
          uiOpen={uiOpen}
          setUiOpen={setUiOpen}
          refOpen={refOpen}
          setRefOpen={setRefOpen}
          deckClear={deckClear}
          envCase={{ ceiling: env?.ceiling ?? null, vis: env?.visNm ?? null }}
        />
      )}
      {mod === 'lso' && <LsoView pic={pic} mt={state.mt} assignments={assignments} offH={offH} />}
      {mod === 'boss' && <BossView pic={pic} mode={bossMode} log={log} landedAt={landedAt} />}
    </div>
  );
};

export default CatccApp;
