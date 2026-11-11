/**
 * Bridge navigation panels (carrier-ops-handoff-2 §6): the plotted waypoints and following them in
 * DCS, PIM (box, catch-up speed, recovery window strip), wind over deck, and the wind indicator.
 * The waypoints, PIM and wind-over-deck panels sit in the dock under the chart; the wind indicator in
 * the left sidebar.
 */
import React from 'react';
import { bearingDeg, destination, distanceNm, norm360 } from '../../../catcc/core/geo.ts';
import { pimAt } from '../../../catcc/core/env/weather.ts';
import { bestRecovery, deckWind, windOverDeck } from '../../../catcc/core/env/wod.ts';
import type { OrderPoint, RoutePoint } from '../../../catcc/core/dcs/hookProtocol.ts';
import type { CarrierPlan, OrderStatus } from '../../../catcc/core/room/protocol.ts';
import type { Carrier } from '../scopeModel.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const KT_PER_MS = 1 / 0.514444;
const MONO = "'IBM Plex Mono', monospace";
const BTN: React.CSSProperties = { height: 28, padding: '0 10px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12, cursor: 'pointer' };
const dig = (min: number, size: number): React.CSSProperties => ({
  display: 'inline-block',
  boxSizing: 'border-box',
  minWidth: min,
  padding: '2px 6px',
  borderRadius: 2,
  background: '#0B100C',
  border: '1px solid #3A4A3B',
  fontFamily: MONO,
  fontSize: size,
  fontWeight: 600,
  color: '#6FBF68',
  textAlign: 'center',
  letterSpacing: '.04em',
});
const kv = (k: string, v: React.ReactNode, c = '#E6EDF3') => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: MONO, fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: '#93A1B0' }}>{k}</span>
    <span style={{ color: c, textAlign: 'right' }}>{v}</span>
  </div>
);
const title = (t: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
    <span className="lbl">{t}</span>
    {right}
  </div>
);

/** half-size of the PIM box, NM (a 10 NM box about the PIM) */
export const PIM_BOX_NM = 5;
/** the catch-up speed is what regains the PIM in this long, h */
export const CATCH_UP_H = 1;
/** the fastest the ship is asked to go, kt */
export const MAX_SHIP_KT = 30;

/** HH:MM local (mission time `mt` s, the mission starting `dayStart` s after local midnight) */
export const clockOf = (dayStart: number | undefined) => (mt: number) => {
  const x = ((((dayStart ?? 0) + mt) % 86400) + 86400) % 86400;
  return `${String(Math.floor(x / 3600)).padStart(2, '0')}:${String(Math.floor(x / 60) % 60).padStart(2, '0')}`;
};

/** seconds from (lat, lon) to each waypoint in turn, each leg at its waypoint's speed */
export function routeEtas(from: { lat: number; lon: number }, pts: OrderPoint[]): number[] {
  let t = 0;
  let p = from;
  return pts.map((q) => {
    t += (distanceNm(p.lat, p.lon, q.lat, q.lon) / Math.max(1, q.kt)) * 3600;
    p = q;
    return t;
  });
}

const ll = (lat: number, lon: number) => {
  const f = (x: number, w: number, pos: string, neg: string) => {
    const a = Math.abs(x);
    const d = Math.floor(a);
    return `${String(d).padStart(w, '0')}°${((a - d) * 60).toFixed(1).padStart(4, '0')}'${x >= 0 ? pos : neg}`;
  };
  return `${f(lat, 2, 'N', 'S')} ${f(lon, 3, 'E', 'W')}`;
};

/** A ship order's state as a small mark: sending, taken, refused (the reason in its tooltip). */
export const OrderMark: React.FC<{ o?: OrderStatus; label?: boolean }> = ({ o, label = true }) => {
  // only a refusal is worth showing: the header's pulsing alert dot, with the reason on hover
  if (!o || o.ok !== false) return null;
  const tip = `DCS refused the order: ${o.error ?? 'no reason given'}`;
  return (
    <span title={tip} aria-label={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, verticalAlign: 'middle' }}>
      <span className="cc-feed-alert" style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF8A85', color: '#FF8A85', flex: 'none' }} />
      {label && <span className="cc-feed-alert-text" style={{ color: '#FF8A85' }}>DCS</span>}
    </span>
  );
};

// ---------------------------------------------------------------- waypoints

export const WaypointsPanel: React.FC<{
  carrier?: Carrier;
  route?: CarrierPlan['route'];
  onRoute: (r: CarrierPlan['route'] | undefined) => void;
  /** stop following: hold the present course and speed (a helm order) */
  onStop: () => void;
  /** drop the route (holding course first if it was being followed) */
  onClear: () => void;
  readOnly: boolean;
  mt: number;
  dayStart?: number;
  /** the last order to the ship, when it was a route */
  order?: OrderStatus;
  plotting: boolean;
  onPlot: () => void;
}> = ({ carrier, route, onRoute, onStop, onClear, readOnly, mt, dayStart, order, plotting, onPlot }) => {
  const t = carrier?.track;
  const pts = route?.pts ?? [];
  const etas = t ? routeEtas(t, pts) : [];
  const clock = clockOf(dayStart);
  const set = (next: OrderPoint[], active = route?.active ?? false) => onRoute(next.length ? { pts: next, active: active && next.length > 0 } : undefined);
  return (
    <section className="pnl" aria-label="Waypoints" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {title(
        'Waypoints',
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {route?.active && <OrderMark o={order} />}
          <button disabled={readOnly} aria-pressed={plotting} onClick={onPlot} title="Plot waypoints: click the chart" style={{ ...BTN, height: 24, fontSize: 11.5, border: `1px solid ${plotting ? '#F15822' : '#374250'}`, background: plotting ? 'rgba(241,88,34,.16)' : 'transparent' }}>
            + Waypoint
          </button>
        </span>,
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {pts.map((q, i) => (
          <div key={i} className="mono" style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto auto 20px', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 4px', borderRadius: 4, background: route?.active && i === 0 ? 'rgba(95,208,104,.12)' : 'transparent' }}>
            <b>WP{i + 1}</b>
            <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ll(q.lat, q.lon)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button disabled={readOnly} aria-label={`WP${i + 1} slower`} onClick={() => set(pts.map((x, k) => (k === i ? { ...x, kt: Math.max(3, x.kt - 1) } : x)))} style={{ ...BTN, height: 20, width: 20, padding: 0 }}>
                −
              </button>
              <span style={{ minWidth: 40, textAlign: 'center' }}>{q.kt} KT</span>
              <button disabled={readOnly} aria-label={`WP${i + 1} faster`} onClick={() => set(pts.map((x, k) => (k === i ? { ...x, kt: Math.min(MAX_SHIP_KT, x.kt + 1) } : x)))} style={{ ...BTN, height: 20, width: 20, padding: 0 }}>
                +
              </button>
            </span>
            <span>{t ? clock(mt + etas[i]) : '--:--'}</span>
            <button disabled={readOnly} aria-label={`Remove WP${i + 1}`} onClick={() => set(pts.filter((_, k) => k !== i))} style={{ ...BTN, height: 20, width: 20, padding: 0, color: '#93A1B0' }}>
              ×
            </button>
          </div>
        ))}
        {!pts.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683', padding: '2px 0' }}>No waypoints. Plot them on the chart with + Waypoint.</div>}
      </div>
      {pts.length > 0 && !readOnly && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {route?.active ? (
            <button onClick={onStop} title="Stop following the route: hold the present course and speed" style={{ ...BTN, flex: 1 }}>
              Stop · hold course
            </button>
          ) : (
            <button onClick={() => set(pts, true)} title="The ship follows the route (sent to DCS)" style={{ ...BTN, flex: 1, border: '1px solid #5FD068', color: '#7FD397' }}>
              Follow route
            </button>
          )}
          <button onClick={onClear} style={BTN}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- PIM

export const PimPanel: React.FC<{
  carrier?: Carrier;
  /** the mission's planned route for the carrier's group */
  route?: RoutePoint[];
  mt: number;
  dayStart?: number;
  helm?: { crs: number; kt: number };
  recovery?: CarrierPlan['recovery'];
  onRecovery: (r: CarrierPlan['recovery'] | undefined) => void;
  readOnly: boolean;
}> = ({ carrier, route, mt, dayStart, helm, recovery, onRecovery, readOnly }) => {
  const t = carrier?.track;
  const clock = clockOf(dayStart);
  const pim = route && t ? pimAt(route, mt) : null;
  if (!t || !route || !pim) {
    return (
      <section className="pnl" aria-label="PIM">
        {title('PIM')}
        <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No planned route</div>
      </section>
    );
  }
  const legKt = (() => {
    const i = pim.leg;
    if (i <= 0 || i >= route.length) return 0;
    const a = route[i - 1];
    const b = route[i];
    return b.eta > a.eta ? (distanceNm(a.lat, a.lon, b.lat, b.lon) / (b.eta - a.eta)) * 3600 : 0;
  })();
  const pimNm = distanceNm(t.lat, t.lon, pim.lat, pim.lon);
  const pimBrg = bearingDeg(t.lat, t.lon, pim.lat, pim.lon);
  // the box is north-up about the PIM
  const inBox = (lat: number, lon: number, at: number) => {
    const p = pimAt(route, at);
    if (!p) return false;
    const dy = (lat - p.lat) * 60;
    const dx = (lon - p.lon) * 60 * Math.cos((p.lat * Math.PI) / 180);
    return Math.abs(dx) <= PIM_BOX_NM && Math.abs(dy) <= PIM_BOX_NM;
  };
  const inside = inBox(t.lat, t.lon, mt);
  // catch-up: the speed that has the ship at the PIM an hour from now
  const ahead = pimAt(route, mt + CATCH_UP_H * 3600);
  const catchKt = ahead ? distanceNm(t.lat, t.lon, ahead.lat, ahead.lon) / CATCH_UP_H : 0;
  // recovery window: into the wind on the helm order until it ends, then back to the PIM at full speed
  // (closing on it at the speed difference): times for the strip
  const rec = recovery && recovery.endMt > mt - 3600 ? recovery : undefined;
  let back: number | null = null;
  if (rec) {
    const sog = t.gs ?? 0;
    const crs = helm?.crs ?? t.crs ?? t.hdg ?? 0;
    const kt = Math.max(0, helm?.kt ?? sog);
    const left = Math.max(0, rec.endMt - mt);
    const pEnd = destination(t.lat, t.lon, crs, (kt * left) / 3600);
    const qEnd = pimAt(route, Math.max(mt, rec.endMt));
    const gap = qEnd ? Math.max(0, distanceNm(pEnd.lat, pEnd.lon, qEnd.lat, qEnd.lon) - PIM_BOX_NM) : 0;
    const close = MAX_SHIP_KT - legKt;
    back = close > 1 ? Math.max(mt, rec.endMt) + (gap / close) * 3600 : null;
  }
  const strip = rec
    ? (() => {
        const t0 = rec.startMt;
        const t1 = Math.max(rec.endMt, t0 + 60);
        const t2 = back ?? t1;
        const span = Math.max(60, t2 - t0);
        const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - t0) / span) * 100))}%`;
        return (
          <>
            <div style={{ position: 'relative', height: 16, background: '#0E1116', borderRadius: 3, marginTop: 8 }}>
              <span style={{ position: 'absolute', left: 0, width: pct(t1), top: 0, bottom: 0, borderRadius: '3px 0 0 3px', background: 'rgba(95,208,104,.3)' }} />
              {back !== null && <span style={{ position: 'absolute', left: pct(t1), width: `calc(${pct(t2)} - ${pct(t1)})`, top: 0, bottom: 0, background: 'rgba(62,155,212,.25)' }} />}
              <span title="Now" style={{ position: 'absolute', left: pct(mt), top: -3, bottom: -3, width: 2, background: '#E6EDF3' }} />
            </div>
            <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#93A1B0', marginTop: 3 }}>
              <span>{clock(t0)} INTO WIND</span>
              <span>{clock(t1)} TO PIM</span>
              <span>{back !== null ? `${clock(t2)} IN BOX` : 'PIM OUT OF REACH'}</span>
            </div>
          </>
        );
      })()
    : null;
  return (
    <section className="pnl" aria-label="PIM">
      {title(
        'PIM',
        !readOnly && (
          <span style={{ display: 'flex', gap: 4 }}>
            {rec ? (
              <>
                <button onClick={() => onRecovery({ ...rec, endMt: Math.max(rec.startMt + 300, rec.endMt - 300) })} title="Recovery ends 5 min earlier" style={{ ...BTN, height: 22, padding: '0 6px', fontSize: 11 }}>
                  −5
                </button>
                <button onClick={() => onRecovery({ ...rec, endMt: rec.endMt + 300 })} title="Recovery ends 5 min later" style={{ ...BTN, height: 22, padding: '0 6px', fontSize: 11 }}>
                  +5
                </button>
                <button onClick={() => onRecovery(undefined)} title="Clear the recovery window" style={{ ...BTN, height: 22, padding: '0 8px', fontSize: 11 }}>
                  Clear
                </button>
              </>
            ) : (
              <button onClick={() => onRecovery({ startMt: mt, endMt: mt + 1800 })} title="Start a recovery window now (into the wind for 30 min, then back to PIM)" style={{ ...BTN, height: 22, padding: '0 8px', fontSize: 11 }}>
                Recovery window
              </button>
            )}
          </span>
        ),
      )}
      {kv('PIM now', `${r3(pimBrg)} / ${pimNm.toFixed(1)} NM`)}
      {kv('PIM course · speed', pim.crs != null ? `${r3(pim.crs)} · ${Math.round(legKt)} KT` : '—')}
      {kv('Box', inside ? 'INSIDE' : `OUTSIDE${catchKt <= MAX_SHIP_KT ? ` · back by ${clock(mt + CATCH_UP_H * 3600)}` : ''}`, inside ? '#7FD397' : '#E7B04F')}
      {kv('Catch-up speed', catchKt > MAX_SHIP_KT ? `> ${MAX_SHIP_KT} KT` : `${Math.round(catchKt)} KT`, catchKt > MAX_SHIP_KT ? '#E7B04F' : '#E6EDF3')}
      {strip}
    </section>
  );
};

// ---------------------------------------------------------------- wind over deck

export const WodPanel: React.FC<{ carrier?: Carrier; readOnly: boolean; onOrder: (h: { crs: number; kt: number }) => void }> = ({ carrier, readOnly, onOrder }) => {
  const t = carrier?.track;
  const crs = t?.crs ?? t?.hdg ?? 0;
  const sog = t?.gs ?? 0;
  const wx = t?.wx;
  const hasWind = wx?.d0 != null && wx.s0 != null;
  const dw = hasWind ? deckWind(crs, sog, wx!.d0!, wx!.s0!) : null;
  const best = hasWind ? bestRecovery(wx!.d0!, wx!.s0!) : null;
  return (
    <section className="pnl" aria-label="Wind over deck">
      {title('Wind over deck', dw && <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: dw.inLimits ? '#7FD397' : '#E7B04F' }}>{dw.inLimits ? 'IN LIMITS' : 'OUT OF LIMITS'}</span>)}
      {dw && hasWind ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 6, textAlign: 'center' }}>
            {[
              ['TRUE WIND', `${r3(wx!.d0!)}`],
              ['TRUE KT', `${Math.round(wx!.s0! * KT_PER_MS)}`],
              ['DOWN ANGLE', `${Math.round(dw.along)}`],
              ['CROSS', `${Math.abs(dw.cross) < 0.5 ? '0' : `${Math.round(Math.abs(dw.cross))} ${dw.cross > 0 ? 'R' : 'L'}`}`],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="lbl" style={{ fontSize: 8.5, whiteSpace: 'nowrap' }}>{k}</div>
                <span style={dig(0, 13)}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
            {[
              ['Down-angle wind', '0', '40', -90 + (Math.max(0, Math.min(40, dw.along)) / 40) * 180],
              ['Cross-deck wind', '15 L', '15 R', (Math.max(-15, Math.min(15, dw.cross)) / 15) * 90],
            ].map(([k, l, r, rot]) => (
              <div key={k as string} style={{ textAlign: 'center' }}>
                <svg viewBox="-60 -56 120 66" style={{ width: '100%', maxWidth: 120 }} aria-hidden="true">
                  <path d="M-48 0 A48 48 0 0 1 48 0" fill="none" stroke="#C9D3DD" strokeWidth="3" />
                  <path d="M-48 0 L-40 0 M48 0 L40 0 M0 -48 L0 -40 M-34 -34 L-28.3 -28.3 M34 -34 L28.3 -28.3" stroke="#C9D3DD" strokeWidth="1.5" />
                  <text x="-50" y="9" textAnchor="middle" style={{ fill: '#93A1B0', fontFamily: MONO, fontSize: 8 }}>{l}</text>
                  <text x="50" y="9" textAnchor="middle" style={{ fill: '#93A1B0', fontFamily: MONO, fontSize: 8 }}>{r}</text>
                  <path d="M-3 0 L0 -44 L3 0 Z" fill="#5FD068" transform={`rotate(${(rot as number).toFixed(1)})`} />
                </svg>
                <div className="lbl" style={{ marginTop: 2, fontSize: 10 }}>{k}</div>
              </div>
            ))}
          </div>
          {best && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>
                Best recovery{' '}
                <b style={{ color: '#E6EDF3' }}>
                  {r3(best.crs)}° / {best.kt} KT
                </b>
              </span>
              <button disabled={readOnly} onClick={() => onOrder({ crs: best.crs, kt: Math.round(best.kt) })} style={{ ...BTN, cursor: readOnly ? 'default' : 'pointer' }}>
                Set
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No wind data</div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- wind indicator

export type WindMode = 'true' | 'wod' | 'angle';

/** the carrier symbol (the scope's), hull keel at x = 0.165, 2.8 units long, bow up */
const CV_D = 'M0.287 -1.4 L0.06 -1.4 L-0.011 -0.703 L-0.178 -0.488 L-0.166 1.06 L-0.029 1.102 L0.001 1.4 L0.316 1.4 L0.465 1.013 L0.477 -0.429 L0.328 -0.727 Z';
const ANGLED_DECK_DEG = 9;

/**
 * The wind about the ship, bow up: an arrow along the way the air moves (pointing downwind), across the
 * carrier symbol. TRUE: the true wind. WOD: the wind over the deck (true wind less the ship's motion).
 * DOWN ANGLE: the wind over the deck against the landing area's axis (9° to port), with the down-angle
 * and cross-deck components.
 */
export const WindIndicator: React.FC<{ carrier?: Carrier; mode: WindMode; onMode: (m: WindMode) => void }> = ({ carrier, mode, onMode }) => {
  const t = carrier?.track;
  const wx = t?.wx;
  const hdg = t?.hdg ?? t?.crs ?? 0;
  const crs = t?.crs ?? hdg;
  const sog = t?.gs ?? 0;
  const has = wx?.d0 != null && wx.s0 != null;
  const trueKt = has ? wx!.s0! * KT_PER_MS : 0;
  const wod = has ? windOverDeck(crs, sog, wx!.d0!, wx!.s0!) : null;
  const dw = has ? deckWind(crs, sog, wx!.d0!, wx!.s0!) : null;
  const from = !has ? 0 : mode === 'true' ? wx!.d0! : wod!.from;
  const kt = !has ? 0 : mode === 'true' ? trueKt : wod!.kt;
  // relative to the bow; the arrow runs from the windward side across the ship, pointing downwind
  const rel = norm360(from - hdg);
  const R = 74;
  const D = Math.PI / 180;
  const tail: [number, number] = [R * Math.sin(rel * D), -R * Math.cos(rel * D)];
  const head: [number, number] = [-tail[0] * 0.78, -tail[1] * 0.78];
  const label = !has
    ? 'NO WIND DATA'
    : mode === 'true'
      ? `WIND FROM ${r3(from)} / ${Math.round(kt)}`
      : mode === 'wod'
        ? (() => {
            // relative to the bow, port negative
            const rs = Math.round(norm360(rel + 180) - 180);
            return `WOD ${Math.round(kt)} KT · ${rs === 0 ? 'ON THE BOW' : `${Math.abs(rs)}° ${rs < 0 ? 'PORT' : 'STBD'}`}`;
          })()
        : `DOWN ANGLE ${Math.round(dw!.along)} · CROSS ${Math.abs(dw!.cross) < 0.5 ? '0' : `${Math.round(Math.abs(dw!.cross))} ${dw!.cross > 0 ? 'R' : 'L'}`}`;
  const seg = (m: WindMode, l: string) => (
    <button key={m} aria-pressed={mode === m} onClick={() => onMode(m)} style={{ border: 0, height: 22, padding: '0 8px', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 11.5, cursor: 'pointer', background: mode === m ? '#222C37' : 'transparent', color: mode === m ? '#E6EDF3' : '#93A1B0' }}>
      {l}
    </button>
  );
  const ah = Math.atan2(head[1] - tail[1], head[0] - tail[0]);
  const wing = (s: 1 | -1): [number, number] => [head[0] - 9 * Math.cos(ah + s * 0.45), head[1] - 9 * Math.sin(ah + s * 0.45)];
  return (
    <section className="pnl" aria-label="Wind">
      {title(
        'Wind',
        <div role="group" aria-label="Wind shown as" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
          {seg('true', 'True')}
          {seg('wod', 'WOD')}
          {seg('angle', 'Down angle')}
        </div>,
      )}
      <svg viewBox="-100 -100 200 200" style={{ width: '100%', maxWidth: 230, display: 'block', margin: '0 auto' }} role="img" aria-label={label}>
        <circle r="90" fill="none" stroke="rgba(147,161,176,.25)" />
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d={`M0 -90 L0 -84`} stroke="rgba(147,161,176,.5)" transform={`rotate(${a})`} />
        ))}
        <text y="-93" textAnchor="middle" style={{ fill: '#6B7683', fontFamily: MONO, fontSize: 8 }}>BOW</text>
        {/* the landing area's axis, 9° to port of the bow */}
        {mode === 'angle' && <path d="M0 62 L0 -62" stroke="#E7C66B" strokeOpacity={0.7} strokeDasharray="5 4" transform={`rotate(${-ANGLED_DECK_DEG})`} />}
        <g transform="scale(40) translate(-0.165 0)">
          <path d={CV_D} fill="#151A21" stroke="#E6EDF3" strokeWidth={1.4 / 40} strokeLinejoin="miter" />
        </g>
        {has && kt >= 0.5 && (
          <g stroke="#6FB6E6" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d={`M${tail[0].toFixed(1)} ${tail[1].toFixed(1)}L${head[0].toFixed(1)} ${head[1].toFixed(1)}`} />
            <path d={`M${wing(1)[0].toFixed(1)} ${wing(1)[1].toFixed(1)}L${head[0].toFixed(1)} ${head[1].toFixed(1)}L${wing(-1)[0].toFixed(1)} ${wing(-1)[1].toFixed(1)}`} />
          </g>
        )}
      </svg>
      <div className="mono" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: has ? '#C9D3DD' : '#6B7683', marginTop: 2 }}>
        {label}
      </div>
      {has && mode !== 'true' && dw && (
        <div className="mono" style={{ textAlign: 'center', fontSize: 11, color: dw.inLimits ? '#7FD397' : '#E7B04F', marginTop: 2 }}>
          {Math.round(wod!.kt)} KT OVER THE DECK · {Math.abs(Math.round(dw.rel))}° {dw.rel > 0 ? 'STBD' : dw.rel < 0 ? 'PORT' : ''} OF THE ANGLE
        </div>
      )}
    </section>
  );
};
