import type { MissionWx, RoutePoint } from '../dcs/hookProtocol.ts';
import { bearingDeg } from '../geo.ts';

export type Coverage = 'CLR' | 'FEW' | 'SCT' | 'BKN' | 'OVC';

/**
 * Cloud coverage from the DCS 2.7+ preset name (Preset1–2 light scattered, 3–12 scattered,
 * 13–20 broken, 21–27 overcast, RainyPreset* overcast) or, for legacy clouds, density 0–10.
 */
export function coverageOf(wx: MissionWx): Coverage {
  const p = wx.cp ?? '';
  if (/^Rainy/i.test(p)) return 'OVC';
  const m = /^Preset(\d+)/i.exec(p);
  if (m) {
    const k = Number(m[1]);
    if (k <= 2) return 'FEW';
    if (k <= 12) return 'SCT';
    if (k <= 20) return 'BKN';
    return 'OVC';
  }
  const d = wx.cd ?? 0;
  if (d <= 0) return 'CLR';
  if (d <= 2) return 'FEW';
  if (d <= 5) return 'SCT';
  if (d <= 8) return 'BKN';
  return 'OVC';
}

const FT = 3.28084;
const M_PER_NM = 1852;

/** Ceiling (ft) = base of a BKN/OVC layer; null when none. */
export function ceilingFt(wx: MissionWx): number | null {
  const c = coverageOf(wx);
  if ((c === 'BKN' || c === 'OVC') && wx.cb != null) return Math.round((wx.cb * FT) / 100) * 100;
  return null;
}

/** Visibility, NM (fog counts when it is the lower). */
export function visibilityNm(wx: MissionWx): number | null {
  const v = [wx.vis, wx.fog ? wx.fog.v : null].filter((x): x is number => x != null && x > 0);
  if (!v.length) return null;
  return Math.min(...v) / M_PER_NM;
}

export function precipText(wx: MissionWx): string {
  return ['', '−RA', 'TS', 'SN', '+SN'][wx.pr ?? 0] ?? '';
}

/** METAR-ish cloud group, e.g. "BKN 008". */
export function cloudsText(wx: MissionWx): string {
  const c = coverageOf(wx);
  if (c === 'CLR' || wx.cb == null) return 'CLR';
  return `${c} ${String(Math.round((wx.cb * FT) / 100)).padStart(3, '0')}`;
}

/**
 * Recovery case: night is Case III; by day Case I needs ceiling ≥ 3,000 ft and visibility
 * ≥ 5 NM, Case II ceiling ≥ 1,000 ft and visibility ≥ 5 NM (CV NATOPS §6.2).
 */
export function recoveryCase(night: boolean, ceiling: number | null, visNm: number | null): 'I' | 'II' | 'III' {
  if (night) return 'III';
  const v = visNm ?? 10;
  const c = ceiling ?? 99_999;
  if (c >= 3000 && v >= 5) return 'I';
  if (c >= 1000 && v >= 5) return 'II';
  return 'III';
}

/** Next course change on a ship's planned route after `nowS` (mission seconds). */
export function nextPimTurn(pts: RoutePoint[], nowS: number): { brc: number; etaS: number } | null {
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i].eta <= nowS) continue;
    const a = bearingDeg(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    const b = bearingDeg(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
    const d = Math.abs(((b - a + 540) % 360) - 180);
    if (d >= 3) return { brc: Math.round(b) % 360, etaS: pts[i].eta };
  }
  return null;
}
