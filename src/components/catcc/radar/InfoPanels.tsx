/** Left sidebar Info tab: ship, weather, light/case. Ported from the mockup markup. */
import React from 'react';
import type { HookEnv } from '../../../catcc/core/dcs/hookProtocol.ts';
import { lightDay, sunAltitude } from '../../../catcc/core/env/astro.ts';
import { ceilingFt, cloudsText, nextPimTurn, precipText, recoveryCase, visibilityNm } from '../../../catcc/core/env/weather.ts';
import { norm360 } from '../../../catcc/core/geo.ts';
import { carrierByHull } from '../../../catcc/core/tracks/naming.ts';
import type { Carrier } from '../scopeModel.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const KT = 0.514444;

export interface EnvSummary {
  night: boolean;
  sunAlt: number;
  case: 'I' | 'II' | 'III';
  ceiling: number | null;
  visNm: number | null;
}

/** Sun, weather and recommended case at the focus carrier. */
export function envSummary(focus: Carrier | undefined, env: HookEnv | undefined, utc: Date | undefined): EnvSummary | null {
  if (!focus || !utc) return null;
  const sunAlt = sunAltitude(utc, focus.track.lat, focus.track.lon);
  const ceiling = env ? ceilingFt(env.wx) : null;
  const visNm = env ? visibilityNm(env.wx) : null;
  // Case III window: sunset + 30 min to sunrise − 30 min ≈ sun below about −6°
  const night = sunAlt < -6;
  return { night, sunAlt, ceiling, visNm, case: recoveryCase(night, ceiling, visNm) };
}

export const InfoPanels: React.FC<{ focus?: Carrier; env?: HookEnv; utc?: Date; offH?: number; mt: number; deckClear: boolean | null }> = ({ focus, env, utc, offH, mt, deckClear }) => {
  if (!focus) return <div className="pnl mono" style={{ fontSize: 12, color: '#93A1B0' }}>No carrier in the picture</div>;
  const t = focus.track;
  const info = carrierByHull(t.hull);
  const wx = t.wx;
  // wind over deck: air motion relative to the deck = true wind minus ship velocity
  let wod: { from: number; kt: number; angle: number } | undefined;
  if (wx?.d0 != null && wx.s0 != null) {
    const D = Math.PI / 180;
    const wTo = (wx.d0 + 180) * D;
    const ws = [Math.sin(wTo) * wx.s0, Math.cos(wTo) * wx.s0];
    const sv = [Math.sin(focus.ship.brc * D) * (t.gs ?? 0) * KT, Math.cos(focus.ship.brc * D) * (t.gs ?? 0) * KT];
    const rel = [ws[0] - sv[0], ws[1] - sv[1]];
    const from = norm360(Math.atan2(rel[0], rel[1]) / D + 180);
    wod = { from, kt: Math.hypot(rel[0], rel[1]) / KT, angle: Math.round(((from - focus.ship.fb + 540) % 360) - 180) };
  }
  const route = env?.routes.find((r) => r.g === t.g);
  const pim = route ? nextPimTurn(route.pts, mt) : null;
  const pimAt = pim && env && offH !== undefined ? new Date(Date.parse(`${env.date ?? '1970-01-01'}T00:00:00Z`) + (env.start + pim.etaS) * 1000) : null;
  const ceil = env ? ceilingFt(env.wx) : null;
  const vis = env ? visibilityNm(env.wx) : null;

  return (
    <>
      <section className="pnl" aria-label="Ship data">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.05em', lineHeight: 1 }}>{t.hull}</div>
            <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0', letterSpacing: '.1em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }}>
              {info ? `${info.name} · ${info.nick.toUpperCase()}` : t.ty}
            </div>
          </div>
          {deckClear != null && (
            <span className="mono" style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '2px 7px', borderRadius: 3, background: deckClear ? 'rgba(64,168,91,.18)' : 'rgba(224,82,78,.16)', color: deckClear ? '#7FD397' : '#FF9C98', fontWeight: 600 }}>
              {deckClear ? 'DECK CLEAR' : 'DECK FOUL'}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
          <div><div className="lbl">BRC</div><div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{r3(focus.ship.brc)}</div></div>
          <div><div className="lbl">FB</div><div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{r3(focus.ship.fb)}</div></div>
          <div><div className="lbl">Speed</div><div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{Math.round(t.gs ?? 0)}<span style={{ fontSize: 11, color: '#93A1B0' }}> KT</span></div></div>
        </div>
        <div className="kv"><span>Wind over deck</span><span>{wod ? `${r3(wod.from)} / ${Math.round(wod.kt)} KT` : '—'}</span></div>
        <div className="kv">
          <span>Winds down angle</span>
          <span>{wod ? `${Math.round(wod.kt * Math.cos(wod.angle * Math.PI / 180))} KT · ${Math.abs(wod.angle)} ${wod.angle > 0 ? 'STBD' : wod.angle < 0 ? 'PORT' : ''}` : '—'}</span>
        </div>
        <div className="kv"><span>True wind</span><span>{wx?.d0 != null && wx.s0 != null ? `${r3(wx.d0)} / ${Math.round(wx.s0 / KT)} KT` : '—'}</span></div>
        <div className="kv"><span>Next PIM turn</span><span>{pim && pimAt ? `BRC ${r3(pim.brc)} @ ${hhmm(pimAt)}` : '—'}</span></div>
      </section>

      <section className="pnl" aria-label="Weather">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
          <div>
            <div className="lbl">Visibility</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{vis != null ? (vis >= 10 ? '10+' : vis.toFixed(vis < 3 ? 1 : 0)) : '—'}</div>
            <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>NM{env && precipText(env.wx) ? ` · ${precipText(env.wx)}` : ''}</div>
          </div>
          <div>
            <div className="lbl">Ceiling</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15, color: ceil != null && ceil < 3000 ? '#FFB08F' : '#E6EDF3' }}>{ceil ?? (env ? 'NONE' : '—')}</div>
            <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>{env ? `${cloudsText(env.wx).split(' ')[0]} · FT` : 'FT'}</div>
          </div>
          <div>
            <div className="lbl">Altimeter</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{wx?.qnh != null ? (wx.qnh / 3386.389).toFixed(2) : '—'}</div>
            <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>{wx?.qnh != null ? `${Math.round(wx.qnh / 100)} hPa` : 'hPa'}</div>
          </div>
        </div>
        <div className="kv"><span>Clouds</span><span>{env ? cloudsText(env.wx) : '—'}</span></div>
        <div className="kv"><span>Temp / dew</span><span>{wx?.tK != null ? `${Math.round(wx.tK - 273.15)}° / —` : '—'}</span></div>
        <div className="kv">
          <span>Wind 2K / 10K</span>
          <span>{wx?.d2 != null && wx.s2 != null && wx.d10 != null && wx.s10 != null ? `${r3(wx.d2)}/${Math.round(wx.s2 / KT)} · ${r3(wx.d10)}/${Math.round(wx.s10 / KT)}` : '—'}</span>
        </div>
      </section>

      {utc && offH !== undefined && <LightPanel focus={focus} utc={utc} offH={offH} ceiling={ceil} vis={vis} />}
    </>
  );
};

// ---------------------------------------------------------------- light / case

const LightPanel: React.FC<{ focus: Carrier; utc: Date; offH: number; ceiling: number | null; vis: number | null }> = ({ focus, utc, offH, ceiling, vis }) => {
  const { lat, lon } = focus.track;
  // chart spans local noon → noon; recompute at most once per minute
  const key = Math.floor(utc.getTime() / 60_000);
  const data = React.useMemo(() => {
    // Window: solar noon at the ship → next solar noon (independent of the clock offset).
    const day0 = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    let noon = day0 + (12 - lon / 15) * 3_600_000;
    while (noon > utc.getTime()) noon -= 86_400_000;
    while (noon + 86_400_000 <= utc.getTime()) noon += 86_400_000;
    const from = new Date(noon);
    return { from, day: lightDay(from, lat, lon, 6) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lat, lon, offH]);
  const X = (t: Date) => 10 + ((t.getTime() - data.from.getTime()) / 86_400_000) * 240;
  // Plotted as sin(elevation): that is exactly A + B·cos(hour angle), a smooth sine wave all day.
  // Elevation in degrees is not: where the sun passes near the zenith or nadir (low latitudes) it
  // reverses sharply, which read as a V. Near the horizon sin(e) ≈ e, so twilight bands keep their
  // spacing. The scale fits the day's highest and lowest sun (horizon at 58).
  const sinD = (e: number) => Math.sin((e * Math.PI) / 180);
  const els = data.day.samples.map((s) => sinD(s.sun));
  const k = Math.min((58 - 16) / Math.max(sinD(10), ...els), (100 - 58) / Math.max(sinD(18), ...els.map((e) => -e)));
  const Y = (e: number) => 58 - k * sinD(e);
  const [y6, y12, y18] = [Y(-6), Y(-12), Y(-18)];
  const path = 'M' + data.day.samples.map((s) => `${X(s.t).toFixed(1)} ${Y(s.sun).toFixed(1)}`).join(' L');
  const loc = (t: Date) => hhmm(new Date(t.getTime() + offH * 3_600_000));
  const ss = data.day.sunset;
  const sr = data.day.sunrise;
  const c3a = ss ? new Date(ss.getTime() + 30 * 60_000) : undefined;
  const c3b = sr ? new Date(sr.getTime() - 30 * 60_000) : undefined;
  const sunNow = sunAltitude(utc, lat, lon);
  const nowX = X(utc);
  const night = c3a && c3b ? utc >= c3a && utc <= c3b : sunNow < -6;
  const kase = recoveryCase(night, ceiling, vis);
  const until = night ? c3b : c3a;
  const dt = until ? Math.max(0, until.getTime() - utc.getTime()) / 60_000 : null;
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const mr = data.day.moonrise;
  return (
    <section className="pnl" aria-label="Light and case">
      <svg viewBox="0 0 260 132" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Sun elevation from noon to noon with the Case III window">
        <rect x="10" y="14" width="240" height="44" fill="rgba(111,143,179,.10)" />
        <rect x="10" y="58" width="240" height={y6 - 58} fill="rgba(61,88,120,.30)" />
        <rect x="10" y={y6} width="240" height={y12 - y6} fill="rgba(38,58,84,.38)" />
        <rect x="10" y={y12} width="240" height={y18 - y12} fill="rgba(24,38,58,.45)" />
        {c3a && c3b && c3b > c3a && (
          <>
            <rect x={X(c3a)} y="14" width={X(c3b) - X(c3a)} height="88" fill="rgba(241,88,34,.07)" />
            <line x1={X(c3a)} y1="14" x2={X(c3a)} y2="108" stroke="rgba(241,88,34,.55)" strokeWidth="0.8" strokeDasharray="2 2" />
            <line x1={X(c3b)} y1="14" x2={X(c3b)} y2="108" stroke="rgba(241,88,34,.55)" strokeWidth="0.8" strokeDasharray="2 2" />
            <rect x={X(c3a)} y="104" width={X(c3b) - X(c3a)} height="4" rx="2" fill="#F15822" />
            <text x={(X(c3a) + X(c3b)) / 2} y="116" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="7.5" fill="#FFB08F" letterSpacing=".6">
              CASE III · {loc(c3a)} – {loc(c3b)}
            </text>
          </>
        )}
        <line x1="10" y1="58" x2="250" y2="58" stroke="#5E6A78" strokeWidth="1" />
        <line x1="10" y1={y6} x2="250" y2={y6} stroke="rgba(147,161,176,.35)" strokeWidth="0.6" strokeDasharray="1.5 2" />
        <line x1="10" y1={y12} x2="250" y2={y12} stroke="rgba(147,161,176,.35)" strokeWidth="0.6" strokeDasharray="1.5 2" />
        <g fontFamily="IBM Plex Mono, monospace" fontSize="6" fill="#7D8896">
          <text x="252" y="60">0°</text>
          {y6 - 58 >= 6 && <text x="252" y={y6 + 2}>−6</text>}
          <text x="252" y={y12 + 2}>−12</text>
        </g>
        <path d={path} fill="none" stroke="#C9D3DD" strokeWidth="1.6" strokeLinejoin="round" />
        {ss && (
          <>
            <circle cx={X(ss)} cy="58" r="2" fill="#E7B04F" />
            <line x1={X(ss)} y1="13" x2={X(ss)} y2="56" stroke="rgba(231,176,79,.35)" strokeWidth="0.6" />
            <text x={X(ss)} y="10" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#E6EDF3">↓ {loc(ss)}</text>
          </>
        )}
        {sr && (
          <>
            <circle cx={X(sr)} cy="58" r="2" fill="#E7B04F" />
            <line x1={X(sr)} y1="13" x2={X(sr)} y2="56" stroke="rgba(231,176,79,.35)" strokeWidth="0.6" />
            <text x={X(sr)} y="10" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#E6EDF3">↑ {loc(sr)}</text>
          </>
        )}
        {mr && (
          <>
            <path d={`M${(X(mr) - 3.3).toFixed(1)} 53.5 a4 4 0 1 0 3.2 6.4 a3.2 3.2 0 1 1 -3.2 -6.4 z`} fill="#C9D3DD" />
            <text x={X(mr) + 3} y="54" fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fill="#93A1B0">
              {loc(mr)} · {Math.round(data.day.moonIllum * 100)}%
            </text>
          </>
        )}
        <line x1={nowX} y1="18" x2={nowX} y2="100" stroke="#F15822" strokeWidth="1" />
        <circle cx={nowX} cy={Y(sunNow)} r="5.5" fill="rgba(241,88,34,.25)" />
        <circle cx={nowX} cy={Y(sunNow)} r="2.8" fill="#F15822" stroke="#0E1116" strokeWidth="1" />
        <rect x={nowX + 2.4} y="18" width="26" height="10" rx="2" fill="#F15822" />
        <text x={nowX + 15.4} y="25.5" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="7" fontWeight="600" fill="#0E1116">NOW</text>
        <g fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fill="#7D8896" textAnchor="middle">
          {Array.from({ length: 5 }, (_, i) => {
            // local clock hours that are multiples of 6, placed at their true position
            const startLocalH = (data.from.getTime() / 3_600_000 + offH) % 24;
            const first = Math.ceil(startLocalH / 6) * 6;
            const h = first + i * 6;
            const t = new Date(data.from.getTime() + (h - startLocalH) * 3_600_000);
            const x = X(t);
            return x <= 250.5 ? <text key={i} x={x} y="128">{String(((h % 24) + 24) % 24).padStart(2, '0')}</text> : null;
          })}
        </g>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6, gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.1 }}>{night ? 'NIGHT' : 'DAY'}</div>
          <div className="mono" style={{ fontSize: 11, color: '#FFB08F' }}>
            CASE {kase} <span style={{ color: '#93A1B0' }}>· SUN {sunNow < 0 ? '−' : ''}{Math.abs(sunNow).toFixed(1)}°</span>
          </div>
        </div>
        {dt != null && (
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0', letterSpacing: '.08em' }}>{night ? 'DAY OPS IN' : 'NIGHT OPS IN'}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>{hm(dt)}</div>
          </div>
        )}
      </div>
    </section>
  );
};
