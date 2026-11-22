/**
 * CATCC Approach / Final: two precision-approach (PAR-style) displays stacked on one range axis,
 * touchdown on the left, a square AZ/EL display on the glidepath beside the Azimuth display, plus
 * deck status, ICLS / ACLS, the bolter slot tool and the arrival sequence in two columns above it. Ported from carrier-ops-handoff-2/mockup/Final.dc.html; live data from the picture.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { layoutTags, type Box, type TagPlace } from '../radar/tagLayout.ts';
import type { AclsMode, OpsState, Ownership } from '../../../catcc/core/room/ops.ts';
import { BALL_NM, UPWIND_TURN_IN_NM, type SlotResult } from '../../../catcc/core/geometry/slot.ts';
import { turnRadiusNm } from '../../../catcc/core/geometry/maneuver.ts';
import { windOverDeck } from '../../../catcc/core/env/wod.ts';
import { HandoffRow } from '../Handoff.tsx';
import { IcLayers } from '../icons.tsx';
import { flightKey, ownerOf, type HandoffCtx } from '../ownership.ts';
import { useVecSeconds } from '../vecLength.ts';
import { shortType, fuelK, tagRows, type Picture, type ScopeTrack } from '../scopeModel.ts';
import type { DeckCall } from '../deck.ts';
import { AzElScope } from './AzElScope.tsx';
import { SPN46_ACQ_DEG, SPN46_ACQ_NM, SPN46_CHANNELS, SPN46_RANGE_NM } from '../radar/spn46.ts';
import { LABEL_FONT_PX, LABEL_ROW_PX, TICK_PX, TIMELINE_H, TIMELINE_LINE_Y, labelTop, placeTimelineLabels } from './timelineLabels.ts';
import { bolterSlot, upwindSlot, dmeAt, finalPicture, finalProjection, sepStd, sepViolated, GP_FT_PER_NM, GS_DEG, landingWeightLb, PROFILE, profileAlt, type FinalAc } from './finalModel.ts';

export type ParRange = 6 | 12 | 24;
const AMAX: Record<ParRange, number> = { 6: 1500, 12: 3000, 24: 7000 };
const LMAX: Record<ParRange, number> = { 6: 1.2, 12: 2.6, 24: 4 };
/** the displays run from 4 NM ahead of the ramp (negative) out to the selected range */
const R0 = -4;
/** the main radar's own-track colours */
const TRK = '#5FD068';
const TRK_TRAIL = '#3E9A4C';
const TRAIL_O = [0.8, 0.6, 0.45, 0.3, 0.2];
const FT_PER_NM = 6076.12;
/** Nimitz class: overall flight deck length, and the glidepath's touchdown (target 3-wire) from the ramp, ft */
const SHIP_FT = 1092;
const TD_FT = 230;
/**
 * The main radar's carrier symbol (bow up, starboard +x, 2.8 units stem to stern) and, in the same
 * units, the touchdown point: TD_FT up the angled deck (9° to port) from the ramp.
 */
const CV_PATH: [number, number][] = [
  [0.287, -1.4], [0.06, -1.4], [-0.011, -0.703], [-0.178, -0.488], [-0.166, 1.06], [-0.029, 1.102], [0.001, 1.4], [0.316, 1.4], [0.465, 1.013], [0.477, -0.429], [0.328, -0.727],
];
const CV_UNIT_FT = SHIP_FT / 2.8;
// the landing area centreline crosses the ramp starboard of the stern's middle and leaves the hull through the middle of the angled deck's forward edge
const CV_RAMP: [number, number] = [0.22, 1.4];
const CV_TD: [number, number] = [CV_RAMP[0] - (TD_FT / CV_UNIT_FT) * Math.sin((9 * Math.PI) / 180), CV_RAMP[1] - (TD_FT / CV_UNIT_FT) * Math.cos((9 * Math.PI) / 180)];
/** px per tag-layout reference unit (one tag row), as on the main radar */
const K = 13;
/** leaders stretch as far as needed to keep tags off the final bearing / glidepath */
const LEADERS = [2.4, 3.8, 5.2, 6.8, 8.6, 10.6, 13, 16];
/** the main radar's tag geometry: a climb/descent arrow sits left of the altitude row, outside the text inset */
const tagGeom = (rowsIn: string[]) => {
  const arrow = rowsIn[1]?.[0] === '↑' || rowsIn[1]?.[0] === '↓' ? rowsIn[1][0] : '';
  const rows = arrow ? [rowsIn[0], rowsIn[1].slice(1), ...rowsIn.slice(2)] : rowsIn;
  const inset = arrow ? 0.85 : 0.3;
  return { arrow, rows, inset, w: Math.max(...rows.map((r) => r.length)) * 0.54 + inset + 0.3, h: rows.length + 0.35 };
};
const f1 = (n: number) => n.toFixed(1);
const ms = (t: number) => {
  const n = Math.round(Math.abs(t));
  // the sign of the rounded value: −0.3 s reads 0:00, never −0:00
  return `${t < 0 && n > 0 ? '−' : ''}${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const C = { ok: '#7FD397', marginal: '#E7B04F', bad: '#FF8A85' } as const;
const SEG: React.CSSProperties = { display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 };
const segBtn = (on: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ border: 0, height: 28, padding: '0 10px', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer', background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', ...extra });
const COL: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0, overflowY: 'auto' };
const kv = (k: React.ReactNode, v: React.ReactNode) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: '#93A1B0' }}>{k}</span>
    <span>{v}</span>
  </div>
);

interface Lab {
  x: number;
  y: number;
  tf: string;
  c: string;
  t: string;
  /** a numbered position (ringed) or a point (filled dot) instead of plain text */
  kind?: 'ring' | 'dot';
}
interface Blip {
  id: string;
  x: number;
  y: number;
  c: string;
  red: boolean;
  /** tag home quadrant: NE, SW for the bolter pattern (clear of the turn-back lines) */
  pref: [number, number];
  /** trail colour; trail dots in % of the display, newest first */
  tc: string;
  rows: string[];
  tr: [number, number][];
  /** velocity vector in display units: x1 y1 x2 y2 */
  v?: number[];
}

const label = (t: ScopeTrack) => t.bd ?? t.cs ?? t.pi ?? t.id;

type FinalLayer = 'abeam' | 'portHold' | 'brc' | 'alts' | 'profile' | 'fixes' | 'ball' | 'tol' | 'fan' | 'altScale' | 'latScale';
type RecoveryCase = 'I' | 'II' | 'III';
/** layers on by default only in these recovery cases; a manual choice holds until the case changes */
const CASE_LAYERS: Partial<Record<FinalLayer, RecoveryCase[]>> = { abeam: ['I', 'II'], portHold: ['I'] };
const HOLD_C = '#9FD9A8';
const LAYER_GROUPS: [string, [FinalLayer, string, string][]][] = [
  ['Case I / II', [['abeam', 'Abeam 1-1/4 · 1-1/2 NM', '#E7B04F'], ['portHold', 'Case I port hold · commence', HOLD_C]]],
  ['Case III', [['alts', 'Altitude references', '#E7B04F'], ['profile', 'Descent profile', '#C9D3DD'], ['fixes', 'Fixes · 6 / 10 / 20 DME', '#C9D3DD']]],
  ['Final', [['ball', 'Ball call · GS intercept', '#C9D3DD'], ['tol', 'Glideslope ±0.5°', '#93A1B0'], ['fan', 'Azimuth 1° / 2° / 5°', '#93A1B0']]],
  ['Ship', [['brc', 'BRC', '#6FB6E6']]],
  ['Scales', [['altScale', 'Altitude · 1,000 ft', '#93A1B0'], ['latScale', 'Lateral · 1 NM', '#93A1B0']]],
];
const LAYER_DEFAULT: Record<FinalLayer, boolean> = { abeam: false, portHold: false, brc: false, alts: true, profile: true, fixes: true, ball: true, tol: true, fan: true, altScale: false, latScale: false };
const LAYER_KEY = 'catcc.final.layers';
const loadLayers = (): Record<FinalLayer, boolean> => {
  try {
    return { ...LAYER_DEFAULT, ...JSON.parse(localStorage.getItem(LAYER_KEY) ?? '{}') };
  } catch {
    return LAYER_DEFAULT;
  }
};
const saveLayers = (v: Record<FinalLayer, boolean>) => {
  try {
    localStorage.setItem(LAYER_KEY, JSON.stringify(v));
  } catch {
    /* private window */
  }
};

const AZPICK_KEY = 'catcc.final.azelPrimary';
const loadAzPick = (): string | null => {
  try {
    return localStorage.getItem(AZPICK_KEY);
  } catch {
    return null;
  }
};
const saveAzPick = (id: string | null) => {
  try {
    if (id) localStorage.setItem(AZPICK_KEY, id);
    else localStorage.removeItem(AZPICK_KEY);
  } catch {
    /* private window */
  }
};

/** A mark on the slot timeline: s from now, its label, its colour (arrivals are white). */
interface SlotMark {
  id: string;
  t: number;
  text: string;
  c?: string;
}
/**
 * The slot timeline (Bolter slot, Upwind turn): the options' ticks and keys above the line, the
 * arrivals' below, the ¾ NM window on it. Two label rows each side are always reserved
 * (timelineLabels.ts places the labels), so its height never changes with the picture.
 */
const SlotTimeline: React.FC<{ span: number; arrivals: SlotMark[]; options: SlotMark[]; ballS?: [number, number] | null }> = ({ span, arrivals, options, ballS }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mx = (t: number) => Math.max(0, Math.min(100, (t / span) * 100));
  const px = (t: number) => (mx(t) / 100) * w;
  const side = (marks: SlotMark[], where: 'above' | 'below', c0: string) => {
    if (!w) return null;
    const byId = new Map(marks.map((m) => [m.id, m]));
    return placeTimelineLabels(marks.map((m) => ({ id: m.id, x: px(m.t), text: m.text })), w).map((l) => {
      const c = l.chip ? '#93A1B0' : (byId.get(l.ids[0])?.c ?? c0);
      const top = labelTop(where, l.row);
      // far row: a leader from the tick's end through the near row to the label
      const lead = l.row === 1 && (where === 'above' ? [top + LABEL_ROW_PX, TIMELINE_LINE_Y - TICK_PX] : [TIMELINE_LINE_Y + TICK_PX, top]);
      return (
        <React.Fragment key={`${where}${l.ids[0]}`}>
          {lead && <span style={{ position: 'absolute', left: l.x - 0.5, top: lead[0], width: 1, height: lead[1] - lead[0], background: c, opacity: 0.55 }} />}
          <span className="mono" style={{ position: 'absolute', left: l.left, top, width: l.w, height: LABEL_ROW_PX, lineHeight: `${LABEL_ROW_PX}px`, textAlign: 'center', fontSize: LABEL_FONT_PX, color: c, whiteSpace: 'nowrap' }}>
            {l.text}
          </span>
        </React.Fragment>
      );
    });
  };
  const tick = (key: string, t: number, c: string) => <span key={key} style={{ position: 'absolute', left: `${mx(t)}%`, top: TIMELINE_LINE_Y - TICK_PX, width: 2, height: 2 * TICK_PX, marginLeft: -1, background: c }} />;
  return (
    <div ref={ref} style={{ position: 'relative', height: TIMELINE_H, margin: '2px 0 6px' }}>
      <span style={{ position: 'absolute', left: 0, right: 0, top: TIMELINE_LINE_Y - 1, height: 1, background: '#374250' }} />
      {arrivals.map((a) => tick(`a${a.id}`, a.t, '#E6EDF3'))}
      {options.map((o) => tick(`o${o.id}`, o.t, o.c ?? '#E6EDF3'))}
      {ballS && <span style={{ position: 'absolute', left: `${mx(ballS[0])}%`, width: `${Math.max(0.5, mx(ballS[1]) - mx(ballS[0]))}%`, top: TIMELINE_LINE_Y - 3, height: 6, background: 'rgba(95,208,104,.35)', borderRadius: 2 }} />}
      {side(options, 'above', '#E6EDF3')}
      {side(arrivals, 'below', '#E6EDF3')}
    </div>
  );
};

export const FinalView: React.FC<{
  pic: Picture;
  ops?: OpsState;
  setOps: (patch: Partial<OpsState>) => void;
  deck: DeckCall | null;
  local?: Date;
  defaultRange: ParRange;
  handoffCtx: HandoffCtx;
  owners: Record<string, Ownership>;
  readOnly: boolean;
  recoveryCase?: RecoveryCase;
  /** the aircraft the SPN-46 holds (CatccApp, spn46Locks); without it the nearest two in the gate */
  aclsLocks?: readonly string[];
}> = ({ pic, ops, setOps, deck, local, defaultRange, handoffCtx, owners, readOnly, recoveryCase, aclsLocks }) => {
  const [RG, setRG] = useState<ParRange>(defaultRange);
  // projection-vector time (toolbar Vector button), shared by the Approach / Final displays in this browser
  const [vecS, stepVec] = useVecSeconds('final');
  const [ghost, setGhost] = useState(true);
  const [sep, setSep] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [casePick, setCasePick] = useState<Partial<Record<FinalLayer, { kase?: RecoveryCase; on: boolean }>>>({});
  const caseOn = (k: FinalLayer) => {
    const p = casePick[k];
    return p && p.kase === recoveryCase ? p.on : !!recoveryCase && !!CASE_LAYERS[k]?.includes(recoveryCase);
  };
  const [ovStored, setOvStored] = useState(loadLayers);
  const ov: Record<FinalLayer, boolean> = { ...ovStored, abeam: caseOn('abeam'), portHold: caseOn('portHold') };
  const toggleLayer = (k: FinalLayer) => {
    if (CASE_LAYERS[k]) return setCasePick({ ...casePick, [k]: { kase: recoveryCase, on: !ov[k] } });
    const n = { ...ovStored, [k]: !ovStored[k] };
    setOvStored(n);
    saveLayers(n);
  };
  const resetLayers = () => {
    setCasePick({});
    setOvStored(LAYER_DEFAULT);
    saveLayers(LAYER_DEFAULT);
  };
  const [pick, setPick] = useState<string | null>(null);
  // the AZ/EL display's picked primary track, this seat's browser only
  const [azPick, setAzPick] = useState<string | null>(loadAzPick);
  const azPickSeen = useRef(false);
  const pickAzEl = (id: string | null) => {
    azPickSeen.current = false;
    setAzPick(id);
    saveAzPick(id);
  };
  const fp = useMemo(() => finalPicture(pic), [pic]);
  // conflicts within the Final display's own look-ahead (FINAL_CONFLICT_LOOKAHEAD_S): red tags and bubbles alike
  const finalCf = pic.finalConflicts ?? [];
  // the displays' size in px, for tag placement (both displays are the same size)
  const dispRef = useRef<HTMLElement>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = dispRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const prevPlaces = useRef<Record<string, Map<string, TagPlace>>>({});
  const hull = pic.focus?.track.hull ?? '';

  const X = (r: number) => 60 + ((r - R0) / (RG - R0)) * 920;
  const Ye = (a: number) => 370 - (a / AMAX[RG]) * 330;
  // plan view with the approach running right to left: left of course (lat < 0) is below the centreline;
  // its lateral half-width (170 units) set from the display's px so an NM is the same length both ways
  const LM = sz.w && sz.h ? (170 * sz.h) / 400 / ((920 * sz.w) / 1000 / (RG - R0)) : LMAX[RG];
  const Ya = (l: number) => 200 - (l / LM) * 170;
  const pc = (x: number, y: number) => [x / 10, y / 4] as const;

  const bolter: FinalAc | undefined = fp ? (fp.bolters.find((b) => b.t.id === pick) ?? fp.bolters[0]) : undefined;
  const slot = fp && bolter ? bolterSlot(fp, bolter) : null;
  const tod = (s: number) => {
    if (!local) return '--:--:--';
    const d = new Date(local.getTime() + s * 1000);
    return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };

  // ------------------------------------------------ elevation
  const lblStep = RG === 24 ? 4 : RG === 12 ? 2 : 1;
  const gsInt = 1200 / GP_FT_PER_NM;
  const DM: [number, string][] = (
    [
      [BALL_NM, '3/4 NM - BALL CALL', 'ball'],
      [gsInt, 'GS INTCP', 'ball'],
      [6, 'FINAL', 'fixes'],
      [10, 'DIRTY UP', 'fixes'],
      [20, 'PLATFORM', 'fixes'],
    ] as [number, string, FinalLayer][]
  )
    .filter((d) => d[0] <= RG && ov[d[2]])
    .map((d) => [d[0], d[1]]);
  // full-height lines only at the milestones; range on hash marks (small every 1 NM, wider every 2 NM)
  let eGrid = '';
  for (const [r] of DM) eGrid += `M${f1(X(r))} 30V375`;
  let eTicks = '';
  for (let r = Math.ceil(R0); r <= RG + 1e-9; r += 1) {
    const h = r % 2 === 0 ? 7 : 3.5;
    eTicks += `M${f1(X(r))} 370v${-h * 1.6}`;
    const ga = r * GP_FT_PER_NM;
    if (r > 0 && ga < AMAX[RG]) eTicks += `M${f1(X(r))} ${f1(Ye(ga) - h)}v${f1(2 * h)}`;
  }
  const gsEnd = Math.min(RG, AMAX[RG] / GP_FT_PER_NM);
  const tanFt = (deg: number) => Math.tan((deg * Math.PI) / 180) * 6076.12;
  const eCl = `M${f1(X(0))} ${f1(Ye(0))}L${f1(X(gsEnd))} ${f1(Ye(gsEnd * GP_FT_PER_NM))}`;
  // ±0.5° tolerance lines, each to where it leaves the scale
  const tolLine = (deg: number) => {
    const r = Math.min(RG, AMAX[RG] / tanFt(deg));
    return `M${f1(X(0))} ${f1(Ye(0))}L${f1(X(r))} ${f1(Ye(r * tanFt(deg)))}`;
  };
  const eTol = tolLine(GS_DEG + 0.5) + tolLine(GS_DEG - 0.5);
  const eProf = 'M' + PROFILE.filter((p) => p[0] <= RG + 9).map((p) => `${f1(X(Math.min(p[0], RG)))} ${f1(Ye(Math.min(profileAlt(Math.min(p[0], RG)), AMAX[RG])))}`).join('L');
  const LIMS: [number, string][] = (
    [
      [6000, 'STACK BASE · A6'],
      [5000, 'PLATFORM · 5,000'],
      [1200, "1,200'"],
    ] as [number, string][]
  ).filter((x) => ov.alts && x[0] < AMAX[RG]);
  const eLim = LIMS.map(([al]) => `M60 ${f1(Ye(al))}H980`).join('');
  const eLab: Lab[] = [];
  for (const [al, t] of LIMS) {
    const p = pc(975, Ye(al));
    eLab.push({ x: p[0], y: p[1], tf: 'translate(-100%, -120%)', c: '#E7B04F', t });
  }
  let eAlt = '';
  if (ov.altScale) {
    for (let al = 1000; al < AMAX[RG]; al += 1000) {
      eAlt += `M60 ${f1(Ye(al))}H980`;
      const p = pc(8, Ye(al));
      eLab.push({ x: p[0], y: p[1], tf: 'translate(0, -50%)', c: '#7D8896', t: al.toLocaleString('en-US') });
    }
  }
  const topMarks = (into: Lab[]) =>
    DM.forEach(([r, t]) => {
      const p = pc(X(r), 22);
      into.push({ x: p[0], y: p[1], tf: 'translate(-50%, 0)', c: '#C9D3DD', t });
    });
  const rangeMarks = (into: Lab[]) => {
    for (let r = R0; r <= RG; r += lblStep) {
      const p = pc(X(r), 392);
      into.push({ x: p[0], y: p[1], tf: r === R0 ? 'translate(0, -100%)' : 'translate(-50%, -100%)', c: r ? '#7D8896' : '#C9D3DD', t: r < 0 ? `−${-r}` : `${r}${r ? '' : ' NM'}` });
    }
  };
  topMarks(eLab);
  rangeMarks(eLab);

  // ------------------------------------------------ azimuth
  let aGrid = '';
  for (const [r] of DM) aGrid += `M${f1(X(r))} 30V375`;
  let aTicks = '';
  for (let r = Math.ceil(R0); r <= RG + 1e-9; r += 1) {
    const h = r % 2 === 0 ? 7 : 3.5;
    aTicks += `M${f1(X(r))} ${f1(200 - h)}v${f1(2 * h)}`;
  }
  const aFan = [1, 2, 5]
    .map((dg) => {
      const t = Math.tan((dg * Math.PI) / 180);
      const rr = Math.min(RG, LM / t);
      return `M${f1(X(0))} 200L${f1(X(rr))} ${f1(Ya(-rr * t))}M${f1(X(0))} 200L${f1(X(rr))} ${f1(Ya(rr * t))}`;
    })
    .join('');
  const aCl = `M${f1(X(0))} 200H${f1(X(RG))}`;
  // the landing area centreline carried on past the ramp, and the ramp itself on both displays
  const aAhead = `M${f1(X(R0))} 200H${f1(X(0))}`;
  const ramp = `M${f1(X(0))} 30V375`;
  // the ship: 1,092 ft of deck, the glidepath meeting it at the 3-wire (~230 ft from the ramp)
  // the symbol in the final frame (NM): about the touchdown point, the ship's axis d° right of the inbound course
  const dAx = (((pic.focus?.ship.brc ?? 0) - (fp?.fb ?? 0) + 540) % 360) - 180;
  const cd = Math.cos((dAx * Math.PI) / 180);
  const sd = Math.sin((dAx * Math.PI) / 180);
  const cvPts = CV_PATH.map(([x, y]) => {
    const fw = (-(y - CV_TD[1]) * CV_UNIT_FT) / FT_PER_NM;
    const rt = ((x - CV_TD[0]) * CV_UNIT_FT) / FT_PER_NM;
    return [-fw * cd + rt * sd, fw * sd + rt * cd] as const;
  });
  const cvAz = 'M' + cvPts.map(([al, la]) => `${f1(X(al))} ${f1(Ya(la))}`).join('L') + 'Z';
  // elevation: the deck from stern to bow, top at the glidepath's touchdown height, as deep as the freeboard
  const deckX0 = X(Math.max(...cvPts.map((p) => p[0])));
  const deckX1 = X(Math.min(...cvPts.map((p) => p[0])));
  // a constant-thickness deck line (px), its top on the touchdown height
  const DECK_PX = 4;
  // separation bubbles (CV NATOPS 3.3): a ring of the lateral standard in plan; in elevation a box of lateral × vertical
  const pxNm = 920 / (RG - R0);
  const eSep: React.ReactNode[] = [];
  const aSep: React.ReactNode[] = [];
  if (sep && fp) {
    for (const a of fp.acs) {
      if (!(a.f.along >= R0 && a.f.along <= RG && Math.abs(a.f.lat) <= LM && a.t.alt <= AMAX[RG])) continue;
      const s = sepStd(a);
      const bad = sepViolated(a, finalCf);
      const st = { stroke: bad ? 'rgba(255,138,133,.75)' : 'rgba(201,211,221,.4)', fill: bad ? 'rgba(224,82,78,.1)' : 'rgba(201,211,221,.05)', strokeDasharray: '4 3' };
      const cx = X(a.f.along);
      const rx = s.nm * pxNm;
      const ry = (s.ft / AMAX[RG]) * 330;
      eSep.push(<rect key={a.t.id} x={f1(cx - rx)} y={f1(Ye(a.t.alt) - ry)} width={f1(2 * rx)} height={f1(2 * ry)} rx="4" {...st} />);
      aSep.push(<ellipse key={a.t.id} cx={f1(cx)} cy={f1(Ya(a.f.lat))} rx={f1(rx)} ry={f1((s.nm / LM) * 170)} {...st} />);
    }
  }
  const aLab: Lab[] = [];
  topMarks(aLab);
  for (const [dg, t] of ov.fan ? ([
    [1, '1°'],
    [2, '2°'],
    [5, '5°'],
  ] as const) : []) {
    const tn = Math.tan((dg * Math.PI) / 180);
    const rr = Math.min(RG, LM / tn);
    const p = pc(X(rr) - 4, Ya(-rr * tn));
    aLab.push({ x: p[0], y: p[1], tf: 'translate(-100%, 2px)', c: '#7D8896', t });
  }
  aLab.push({ x: 0.8, y: 6, tf: 'none', c: '#7D8896', t: 'R' }, { x: 0.8, y: 90, tf: 'none', c: '#7D8896', t: 'L' });
  rangeMarks(aLab);
  // Case I / II downwind abeam distances, port side (left of course, below the centreline)
  let aAbeam = '';
  if (ov.abeam) {
    for (const [nm, t, tf] of [
      [1.25, '1-1/4 NM', 'translate(-100%, -120%)'],
      [1.5, '1-1/2 NM', 'translate(-100%, 20%)'],
    ] as const) {
      if (nm > LM) continue;
      aAbeam += `M60 ${f1(Ya(-nm))}H980`;
      const p = pc(975, Ya(-nm));
      aLab.push({ x: p[0], y: p[1], tf, c: '#E7B04F', t });
    }
  }
  let aLat = '';
  if (ov.latScale) {
    for (let nm = 1; nm < LM; nm += 1) {
      for (const sgn of [1, -1]) {
        aLat += `M60 ${f1(Ya(sgn * nm))}H980`;
        const p = pc(8, Ya(sgn * nm));
        aLab.push({ x: p[0], y: p[1], tf: 'translate(0, -50%)', c: '#7D8896', t: `${nm}` });
      }
    }
  }
  // Case I port hold and commence, as on the main radar (Scope.tsx portHold): a left-hand circle 5 NM
  // across to port, its position 1 0.5 NM starboard of the ship; commence from 3 on BRC + 210°,
  // then a left turn onto the BRC to the initial, 3 NM astern
  let aHold = '';
  let aCommence = '';
  let aChev = '';
  const inPlot = (u: number, v: number) => u >= 60 && u <= 980 && v >= 0 && v <= 400;
  // ship frame (x to starboard, y along the BRC) → scope → display units
  const shipAt = fp && pic.focus
    ? (() => {
        const s = pic.focus.track.p;
        const b = (pic.focus.ship.brc * Math.PI) / 180;
        return (x: number, y: number): [number, number] => {
          const [al, la] = fp.toFinal([s[0] + x * Math.cos(b) + y * Math.sin(b), s[1] + x * Math.sin(b) - y * Math.cos(b)]);
          return [X(al), Ya(la)];
        };
      })()
    : null;
  // the base recovery course through the ship, astern to the edge of the display and on ahead
  let aBrc = '';
  if (ov.brc && shipAt && pic.focus) {
    const a = shipAt(0, -(RG + 6));
    const z = shipAt(0, -R0 + 2);
    aBrc = `M${f1(a[0])} ${f1(a[1])}L${f1(z[0])} ${f1(z[1])}`;
    // label at the last point astern still on the display
    let lp: [number, number] | null = null;
    for (let y = -0.5; y >= -(RG + 6); y -= 0.25) {
      const q = shipAt(0, y);
      if (inPlot(q[0], q[1])) lp = q;
    }
    if (lp) {
      const p = pc(lp[0] - 5, lp[1]);
      aLab.push({ x: p[0], y: p[1], tf: 'translate(-100%, -120%)', c: 'rgba(111,182,230,.75)', t: `BRC ${String(Math.round(pic.focus.ship.brc) % 360).padStart(3, '0')}` });
    }
  }
  if (ov.portHold && shipAt && sz.w) {
    const at = shipAt;
    const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => { const q = at(x, y); return `${f1(q[0])} ${f1(q[1])}`; }).join('L');
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
      const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 5));
      return Array.from({ length: n + 1 }, (_, i) => {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
      });
    };
    const R = 2.5;
    const OFF = 0.5;
    const cx = OFF - R;
    aHold = poly(arc(cx, 0, R, 0, 360));
    const r1 = turnRadiusNm(250);
    const r2 = turnRadiusNm(350);
    const th = (210 * Math.PI) / 180;
    const [sn, cs] = [Math.sin(th), Math.cos(th)];
    const c1x = OFF - 5 - r1;
    const qx = c1x + r1 * Math.cos(Math.PI / 6);
    const qy = -r1 * Math.sin(Math.PI / 6);
    const L = Math.max(0, (qx + r2 * (1 - cs)) / -sn);
    const p1x = qx + L * sn;
    const p1y = qy + L * cs;
    aCommence = poly([...arc(c1x, 0, r1, 0, -30), [p1x, p1y], ...arc(p1x - r2 * cs, p1y + r2 * sn, r2, 150, 360), [0, -3]]);
    // positions in flight order from overhead: [x, y, flight direction, outward from the circle's centre]
    const pos: [number, number, [number, number], [number, number]][] = [
      [OFF, 0, [0, 1], [1, 0]],
      [cx, R, [-1, 0], [0, 1]],
      [cx - R, 0, [0, -1], [-1, 0]],
      [cx, -R, [1, 0], [0, -1]],
    ];
    const kx = sz.w / 1000;
    const ky = sz.h / 400;
    // a unit direction on screen (px) from a ship-frame direction at a point
    const dirPx = (x: number, y: number, d: [number, number]): [number, number] => {
      const a = at(x, y);
      const e = at(x + d[0] * 0.1, y + d[1] * 0.1);
      const v: [number, number] = [(e[0] - a[0]) * kx, (e[1] - a[1]) * ky];
      const m = Math.hypot(...v) || 1;
      return [v[0] / m, v[1] / m];
    };
    pos.forEach(([x, y, fwd, out], i) => {
      const p = at(x, y);
      if (!inPlot(p[0], p[1])) return;
      const f = dirPx(x, y, fwd);
      const o = dirPx(x, y, out);
      const u = (dx: number, dy: number) => `${f1(p[0] + dx / kx)} ${f1(p[1] + dy / ky)}`;
      aChev += `M${u(-2 * f[0] + 5 * o[0], -2 * f[1] + 5 * o[1])}L${u(6 * f[0], 6 * f[1])}L${u(-2 * f[0] - 5 * o[0], -2 * f[1] - 5 * o[1])}`;
      const lp = pc(p[0] + (16 * o[0]) / kx, p[1] + (16 * o[1]) / ky);
      aLab.push({ x: lp[0], y: lp[1], tf: 'translate(-50%, -50%)', c: 'rgba(159,217,168,.6)', t: `${i + 1}`, kind: 'ring' });
    });
    const ini = at(0, -3);
    if (inPlot(ini[0], ini[1])) {
      const p = pc(ini[0], ini[1]);
      aLab.push({ x: p[0], y: p[1], tf: 'translate(-50%, -50%)', c: 'rgba(159,217,168,.6)', t: '', kind: 'dot' });
    }
  }

  // bolter downwind, its window and ghost turns
  let aDw = '';
  let aWin = '';
  const ghosts: Record<'ok' | 'marginal' | 'bad', string> = { ok: '', marginal: '', bad: '' };
  if (ghost && bolter && slot && Math.abs(bolter.f.lat) <= LM) {
    const DW = bolter.f.lat;
    aDw = `M${f1(X(Math.max(R0, bolter.f.along)))} ${f1(Ya(DW))}H${f1(X(Math.min(RG, 12)))}`;
    if (slot.window) aWin = `M${f1(X(Math.min(RG, slot.window[0])))} ${f1(Ya(DW))}H${f1(X(Math.min(RG, slot.window[1])))}`;
    const bulge = Math.max(0.6, 1.33 * turnRadiusNm(slot.tas, 25));
    for (const o of slot.options) {
      if (o.x > RG) continue;
      // turn in at the DME, roll out on the final bearing as far astern as the ship has opened
      const xr = o.x + slot.drift;
      ghosts[o.cls] += `M${f1(X(o.x))} ${f1(Ya(DW))}C${f1(X(o.x + bulge))} ${f1(Ya(DW))} ${f1(X(xr + bulge))} 200 ${f1(X(xr))} 200`;
      const p = pc(X(o.x), Ya(DW));
      // option labels below the downwind (the bolter's own label sits above it)
      aLab.push({ x: p[0], y: p[1], tf: 'translate(-50%, 60%)', c: C[o.cls], t: o.key === 'NOW' ? 'NOW' : o.key.replace(' DME', '') });
    }
  }

  // ------------------------------------------------ blips
  const eBlips: Blip[] = [];
  const aBlips: Blip[] = [];
  // only what is inside the displays' coverage: no contacts pinned to the edges
  const inside = (a: FinalAc) => a.f.along >= R0 && a.f.along <= RG && Math.abs(a.f.lat) <= LM && a.t.alt <= AMAX[RG];
  const conflictIds = new Set(finalCf.flatMap((k) => [k.a.id, k.b.id]));
  for (const a of fp?.acs ?? []) {
    if (!fp || !inside(a)) continue;
    const t = a.t;
    // the main radar's colours, data tag, trail and vector (toolbar time), both relative to the ship
    const red = conflictIds.has(t.id);
    const c = red ? '#FF8A85' : TRK;
    const tc = red ? '#B8433F' : TRK_TRAIL;
    const rows = tagRows(t);
    const trE: [number, number][] = [];
    const trA: [number, number][] = [];
    t.trail.forEach((q, i) => {
      // in the ship's frame of the dot's time: a track that flew the moving centreline trails along it
      const [al, la] = fp.toFinalAt(q, t.trailT?.[i]);
      const pa = pc(X(al), Ya(la));
      trA.push([pa[0], pa[1]]);
      const qa = t.trailAlt?.[i];
      if (qa !== undefined) {
        const pe = pc(X(al), Ye(qa));
        trE.push([pe[0], pe[1]]);
      }
    });
    let vE: number[] | undefined;
    let vA: number[] | undefined;
    if ((t.gs ?? 0) >= 20) {
      // relative to the ship (ground velocity less the ship's), the climb or descent over the same time
      const [eal, ela, altEnd] = finalProjection(fp, a, vecS);
      vE = [X(a.f.along), Ye(t.alt), X(eal), Ye(altEnd)];
      vA = [X(a.f.along), Ya(a.f.lat), X(eal), Ya(ela)];
    }
    const e = pc(X(a.f.along), Ye(t.alt));
    const pref: [number, number] = a.kind === 'bolter' ? [-1, 1] : [1, -1];
    eBlips.push({ id: t.id, x: e[0], y: e[1], c, red, pref, tc, rows, tr: trE, v: vE });
    const z = pc(X(a.f.along), Ya(a.f.lat));
    aBlips.push({ id: t.id, x: z[0], y: z[1], c, red, pref, tc, rows, tr: trA, v: vA });
  }

  // ------------------------------------------------ panels
  const shipTrk = pic.focus?.track;
  const wod = shipTrk?.wx?.d0 != null && shipTrk.wx.s0 != null ? windOverDeck(fp?.ship.crs ?? 0, fp?.ship.gs ?? 0, shipTrk.wx.d0, shipTrk.wx.s0) : null;
  const wodAng = wod && fp ? Math.round(((wod.from - fp.fb + 540) % 360) - 180) : 0;
  const next = fp?.arrivals[0];
  const nextW = next ? landingWeightLb(next.t.ty, next.t.lb) : null;
  const aids = { icls: ops?.aids?.icls ?? true, acls: ops?.aids?.acls ?? true, modes: ops?.aids?.modes ?? {} };
  const setAids = (p: Partial<typeof aids>) => setOps({ aids: { ...aids, ...p } });
  const locks = fp ? aclsList(fp, ops, aclsLocks) : [];
  // the AZ/EL track table lists the LOCK-ON aircraft; a pick is dropped once its aircraft, seen held, drops out
  // (so a later pass starts on the nearest again), and kept over a reload until the room has it held again
  const lockOn = locks.filter((l) => l.st === 'LOCK-ON').map((l) => l.a.t.id);
  const pickHeld = !!azPick && lockOn.includes(azPick);
  useEffect(() => {
    if (pickHeld) azPickSeen.current = true;
    else if (azPickSeen.current) {
      azPickSeen.current = false;
      pickAzEl(null);
    }
  });
  const fmOf = (t: ScopeTrack) => pic.formations.find((f) => f.members.some((m) => m.id === t.id));
  const keyOf = (t: ScopeTrack) => {
    const f = fmOf(t);
    return f ? flightKey(f) : t.g || t.id;
  };
  const seq = [...(fp?.arrivals ?? []), ...(fp?.bolters ?? []), ...(fp?.upwinds ?? [])].slice(0, 8);
  // the aircraft climbing out on the upwind nearest the ship: when to turn it downwind
  const upw = fp?.upwinds[0];
  const uslot = fp && upw ? upwindSlot(fp, upw) : null;
  const foul = !!deck?.foul;
  // the right-hand column is as wide as the square AZ/EL display (the Azimuth display's height) plus its margin
  const sideW = sz.h ? sz.h + 10 : 344;

  // slot timeline (s from now, scaled to the latest mark) and the options against the arrivals
  const slotDetail = (sl: SlotResult) => {
    const span = Math.max(240, ...(fp?.arrivals ?? []).map((a) => a.tBall! + 30), ...sl.options.map((o) => o.t + 30));
    return (
      <>
        <SlotTimeline
          span={span}
          arrivals={(fp?.arrivals ?? []).map((a) => ({ id: a.t.id, t: a.tBall!, text: label(a.t) }))}
          options={sl.options.map((o) => ({ id: o.key, t: o.t, text: o.key === 'NOW' ? 'NOW' : o.key.replace(/ (DME|NM)$/, ''), c: C[o.cls] }))}
          ballS={sl.ballS}
        />
        {sl.options.map((o) => (
          <div key={o.key} className="mono" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, fontSize: 12, padding: '3px 0', whiteSpace: 'nowrap' }}>
            <span style={{ color: C[o.cls], fontWeight: 600, width: 48 }}>{o.key}</span>
            <span style={{ width: 104 }}>3/4 {tod(o.t)}</span>
            <span style={{ color: C[o.cls], minWidth: 0, whiteSpace: 'normal' }}>
              {o.gapAhead < 0 ? `${ms(-o.gapAhead)} ahead of ${o.ahead}` : o.gapBehind < 0 ? `${ms(-o.gapBehind)} behind ${o.behind}` : `${Number.isFinite(o.gapAhead) ? `+${ms(o.gapAhead)}` : '—'} / ${Number.isFinite(o.gapBehind) ? `−${ms(o.gapBehind)}` : '—'}`}
            </span>
          </div>
        ))}
      </>
    );
  };

  /** The main radar's tag placement, held to a home quadrant (NE; SW in the bolter pattern) unless that would cover another tag or hit. */
  const placeTags = (key: string, blips: Blip[], datum: (x: number) => number | null) => {
    // the datum line (display units → px) as a chain of small boxes
    const keep: Box[] = [];
    const sx = sz.w / 1000;
    const sy = sz.h / 400;
    for (let x = 60; x <= 980; x += 6) {
      const y = datum(x);
      if (y == null) continue;
      keep.push({ x0: (x - 3) * sx, y0: y * sy - 2, x1: (x + 3) * sx, y1: y * sy + 2 });
    }
    const toPx = (b: Blip): [number, number] => [(b.x / 100) * sz.w, (b.y / 100) * sz.h];
    const places = layoutTags(
      blips.map((b) => {
        const p = toPx(b);
        // its own velocity vector, as a chain of small boxes the tag must keep off
        const own: Box[] = [];
        if (b.v) {
          const x0 = b.v[0] * sx;
          const y0 = b.v[1] * sy;
          const x1 = b.v[2] * sx;
          const y1 = b.v[3] * sy;
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5));
          for (let i = 0; i <= n; i++) {
            const x = x0 + ((x1 - x0) * i) / n;
            const y = y0 + ((y1 - y0) * i) / n;
            own.push({ x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 });
          }
        }
        return { id: b.id, p, ...tagGeom(b.rows), pref: b.pref, keepOff: own, priority: b.red ? 0 : 2 + b.x / 100 };
      }),
      { k: K, hitK: K, view: { x0: 0, y0: 0, x1: sz.w, y1: sz.h }, prev: prevPlaces.current[key], obstacles: blips.map(toPx), keepOff: keep, lengths: LEADERS },
    );
    prevPlaces.current[key] = places;
    return places;
  };

  const disp = (title: string, grid: string, extra: React.ReactNode, labs: Lab[], blips: Blip[], datum: (x: number) => number | null, ref?: React.Ref<HTMLElement>) => {
    const places = sz.w ? placeTags(title, blips, datum) : new Map<string, TagPlace>();
    return (
      <section ref={ref} aria-label={`${title} display`} style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 8, overflow: 'hidden' }}>
        <span className="lbl" style={{ position: 'absolute', left: 10, top: 8, zIndex: 2 }}>{title}</span>
        <svg className="par" viewBox="0 0 1000 400" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          <path d={grid} stroke="rgba(147,161,176,.12)" fill="none" />
          <path d={ramp} stroke="rgba(201,211,221,.4)" fill="none" />
          {extra}
          {blips.map((b) => b.v && <line key={`v${b.id}`} x1={f1(b.v[0])} y1={f1(b.v[1])} x2={f1(b.v[2])} y2={f1(b.v[3])} stroke={b.c} strokeWidth="1.8" strokeLinecap="round" />)}
        </svg>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {labs.map((l, i) =>
            l.kind === 'dot' ? (
              <span key={i} style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, width: 7, height: 7, borderRadius: '50%', background: l.c }} />
            ) : l.kind === 'ring' ? (
              <span key={i} className="mono" style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, width: 16, height: 16, boxSizing: 'border-box', borderRadius: '50%', border: `1px solid ${l.c}`, background: '#0B0E12', color: l.c, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {l.t}
              </span>
            ) : (
              <span key={i} className="mono" style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, fontSize: 10.5, color: l.c, whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
                {l.t}
              </span>
            ),
          )}
          {blips.map((b) =>
            b.tr.map((q, i) => <span key={`${b.id}t${i}`} style={{ position: 'absolute', left: `${q[0]}%`, top: `${q[1]}%`, width: 4, height: 4, margin: '-2px 0 0 -2px', background: b.tc, opacity: TRAIL_O[i] ?? 0.2 }} />),
          )}
          {blips.map((b) => (
            <span key={b.id} style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', background: b.c, border: '1px solid rgba(0,0,0,.5)', boxSizing: 'border-box' }} />
          ))}
        </div>
        {/* data tags: leader on the 45° from 0.7 to L, box starting (east) or ending (west) at the leader's end */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
          {sz.w > 0 &&
            blips.map((b) => {
              const pl = places.get(b.id) ?? { q: [1, -1] as [number, number], L: 2.4 };
              const { arrow, rows, inset, w, h } = tagGeom(b.rows);
              const px = (b.x / 100) * sz.w;
              const py = (b.y / 100) * sz.h;
              const s = Math.SQRT1_2;
              const L0 = [pl.q[0] * 0.7 * s, pl.q[1] * 0.7 * s];
              const L1 = [pl.q[0] * pl.L * s, pl.q[1] * pl.L * s];
              const rx = pl.q[0] > 0 ? L1[0] + 0.05 : L1[0] - 0.05 - w;
              const ty = L1[1] + 0.32;
              return (
                <g key={`tag${b.id}`} transform={`translate(${f1(px)} ${f1(py)}) scale(${K})`} style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  <line x1={L0[0]} y1={L0[1]} x2={L1[0]} y2={L1[1]} stroke={b.c} strokeWidth={1 / K} />
                  <rect x={rx} y={ty - 0.85} width={w} height={h} rx="0.2" fill="rgba(11,14,18,.72)" stroke={b.red ? '#E0524E' : undefined} strokeWidth={b.red ? 1.1 / K : undefined} />
                  {rows.map((r, i) => (
                    <text key={i} x={rx + inset} y={ty + i} fill={b.c} style={{ fontSize: 0.9 }}>
                      {r}
                    </text>
                  ))}
                  {arrow && (
                    <text x={rx + inset - 0.15} y={ty + 1} textAnchor="end" fill={b.c} style={{ fontSize: 0.9 }}>
                      {arrow}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
      </section>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <main aria-label="Precision approach displays" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxSizing: 'border-box' }}>
        {/* toolbar, centred as on the radar; the frame's numbers on the right */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 50 }}>
          <div role="toolbar" aria-label="Approach tools" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'rgba(21,26,33,.96)', border: '1px solid #374250', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.45)' }}>
            <button
              className="tbtn"
              aria-label="Bolter sequencing"
              aria-pressed={ghost}
              title={ghost ? 'Bolter sequencing on: turn-in points and slot window for the bolter' : 'Bolter sequencing off'}
              onClick={() => setGhost(!ghost)}
              style={{ background: ghost ? 'rgba(241,88,34,.18)' : 'transparent', color: ghost ? '#FFB08F' : '#E6EDF3' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 6H9a5 5 0 0 0 0 10h11" />
                <path d="M17 13l3 3-3 3" />
              </svg>
            </button>
            <button
              className="tbtn"
              aria-label="Separation bubbles"
              aria-pressed={sep}
              title="Separation bubbles"
              onClick={() => setSep(!sep)}
              style={{ background: sep ? 'rgba(241,88,34,.18)' : 'transparent', color: sep ? '#FFB08F' : '#E6EDF3' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8" strokeDasharray="3 2.5" />
                <rect x="10.2" y="10.2" width="3.6" height="3.6" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {ghost && fp && fp.bolters.length > 1 && (
              <select aria-label="Bolter" value={bolter?.t.id ?? ''} onChange={(e) => setPick(e.target.value)} style={{ height: 32, background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                {fp.bolters.map((b) => (
                  <option key={b.t.id} value={b.t.id}>
                    {label(b.t)}
                  </option>
                ))}
              </select>
            )}
            <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
            {([6, 12, 24] as ParRange[]).map((r) => (
              <button
                key={r}
                aria-pressed={RG === r}
                onClick={() => setRG(r)}
                title={`${r} NM range`}
                style={{ height: 32, padding: '0 9px', borderRadius: 5, border: `1px solid ${RG === r ? '#F15822' : '#374250'}`, background: RG === r ? 'rgba(241,88,34,.18)' : 'transparent', color: RG === r ? '#FFB08F' : '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, cursor: 'pointer' }}
              >
                {r} NM
              </button>
            ))}
            <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
            <button aria-label="Vector" title="Vector" onClick={stepVec} style={{ height: 32, padding: '0 9px', borderRadius: 5, border: '1px solid #374250', background: 'transparent', color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, cursor: 'pointer' }}>
              {vecS}s
            </button>
          </div>
          <div style={{ position: 'absolute', right: 0, top: 4, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <button className="tbtn" aria-label="Layers" title="Layers" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)} style={{ background: layersOpen ? '#3D2521' : 'rgba(21,26,33,.96)', color: layersOpen ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' }}>
              <IcLayers />
            </button>
            {layersOpen && (
              <section aria-label="Layers" style={{ width: 260, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="lbl">Layers</span>
                  <button onClick={resetLayers} title="Restore the default layers (abeam lines follow the recovery case)" style={{ background: '#222C37', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '3px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, cursor: 'pointer' }}>
                    Reset
                  </button>
                </div>
                {LAYER_GROUPS.map(([g, items]) => (
                  <React.Fragment key={g}>
                    <div className="lbl" style={{ fontSize: 9.5, color: '#6B7683', margin: '8px 0 2px 2px' }}>{g}</div>
                    {items.map(([k, l, c]) => (
                      <div key={k} className="lrow" style={{ gridTemplateColumns: 'minmax(0, 1fr) 52px', color: ov[k] ? '#E6EDF3' : '#93A1B0' }}>
                        <span style={{ paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
                        <button className="lcb" onClick={() => toggleLayer(k)} aria-pressed={ov[k]} aria-label={l}>
                          <span style={{ borderColor: c, background: ov[k] ? c : 'transparent' }} />
                        </button>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </section>
            )}
          </div>
        </div>
        {disp(
          'Elevation',
          eGrid,
          <>
            {eAlt && <path d={eAlt} stroke="rgba(147,161,176,.12)" fill="none" />}
            <path d={eLim} stroke="rgba(231,176,79,.4)" fill="none" strokeDasharray="6 4" />
            {ov.profile && <path d={eProf} stroke="rgba(201,211,221,.45)" fill="none" strokeDasharray="2 4" />}
            {ov.tol && <path d={eTol} stroke="rgba(201,211,221,.18)" fill="none" />}
            {eSep}
            <path d={eCl} stroke="#C9D3DD" strokeOpacity=".6" strokeWidth="1.6" fill="none" />
            {sz.h > 0 && <path d={`M${f1(deckX1)} ${(370 + ((DECK_PX / 2) * 400) / sz.h).toFixed(2)}H${f1(deckX0)}`} stroke="#C9D3DD" strokeWidth={DECK_PX} strokeLinecap="butt" fill="none" />}
            <path d={eTicks} stroke="#C9D3DD" strokeOpacity=".5" fill="none" />
          </>,
          eLab,
          eBlips,
          // the glidepath, from the ramp to where it leaves the scale
          (x) => {
            const r = ((x - 60) / 920) * (RG - R0) + R0;
            return r >= 0 && r <= gsEnd ? Ye(r * GP_FT_PER_NM) : null;
          },
          dispRef,
        )}
        {disp(
          'Azimuth',
          aGrid,
          <>
            {ov.fan && <path d={aFan} stroke="rgba(147,161,176,.17)" fill="none" strokeDasharray="4 4" />}
            <path d={aAhead} stroke="rgba(201,211,221,.21)" fill="none" strokeDasharray="4 4" />
            {aLat && <path d={aLat} stroke="rgba(147,161,176,.12)" fill="none" />}
            {aBrc && <path d={aBrc} stroke="rgba(111,182,230,.45)" strokeWidth="1.2" fill="none" strokeDasharray="10 4 2 4" clipPath="url(#final-az-brc)" />}
            {aBrc && (
              <clipPath id="final-az-brc">
                <rect x="60" y="0" width="920" height="400" />
              </clipPath>
            )}
            {aAbeam && <path d={aAbeam} stroke="rgba(231,176,79,.4)" fill="none" strokeDasharray="6 4" />}
            {aHold && (
              <g clipPath="url(#final-az-plot)">
                <clipPath id="final-az-plot">
                  <rect x="60" y="0" width="920" height="400" />
                </clipPath>
                <path d={aHold} fill="none" stroke={HOLD_C} strokeOpacity=".3" strokeWidth="1.2" />
                <path d={aCommence} fill="none" stroke={HOLD_C} strokeOpacity=".4" strokeWidth="2" strokeDasharray="5 4" />
                <path d={aChev} fill="none" stroke={HOLD_C} strokeOpacity=".5" strokeWidth="1.6" strokeLinejoin="round" />
              </g>
            )}
            {aSep}
            <path d={aCl} stroke="#C9D3DD" strokeOpacity=".6" strokeWidth="1.6" fill="none" />
            <path d={cvAz} fill="#0B0E12" stroke="#E6EDF3" strokeWidth="1.3" strokeLinejoin="miter" />
            <path d={aTicks} stroke="#C9D3DD" strokeOpacity=".5" fill="none" />
            {aDw && <path d={aDw} stroke="rgba(147,161,176,.6)" fill="none" strokeDasharray="5 4" />}
            {aWin && <path d={aWin} stroke="#5FD068" strokeWidth="5" strokeOpacity=".45" fill="none" />}
            <path d={ghosts.bad} stroke="#FF8A85" strokeWidth="1.4" fill="none" strokeDasharray="5 4" />
            <path d={ghosts.marginal} stroke="#E7B04F" strokeWidth="1.4" fill="none" strokeDasharray="5 4" />
            <path d={ghosts.ok} stroke="#5FD068" strokeWidth="1.8" fill="none" strokeDasharray="5 4" />
          </>,
          aLab,
          aBlips,
          // the final bearing, carried on past the ramp
          () => 200,
        )}
      </main>

      {/* right: the panels in two columns beside the Elevation display, the square AZ/EL display beside the Azimuth display */}
      <div style={{ flex: `0 0 ${sideW}px`, width: sideW, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <aside aria-label="Deck, landing aids and sequence" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, borderLeft: '1px solid #262F3A', borderBottom: '1px solid #262F3A', borderBottomLeftRadius: 8, background: '#151A21', padding: 12, boxSizing: 'border-box' }}>
          <div style={COL}>
            {deck && (
              <section className="pnl" aria-label="Deck status" style={{ borderColor: foul ? '#E0524E' : '#2E5E3A', background: foul ? 'rgba(224,82,78,.08)' : 'rgba(64,168,91,.06)' }}>
                {/* one line whatever the callsign: the callsign gives way, the time stays */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="lbl" style={{ color: foul ? '#FF8A85' : '#7FD397' }}>Deck</span>
                  {next && (
                    <span className="mono" style={{ display: 'flex', minWidth: 0, gap: '1ch', whiteSpace: 'nowrap', fontSize: 11.5, color: foul ? '#FF8A85' : '#93A1B0' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label(next.t)}</span>
                      <span>{`3/4 in ${ms(next.tBall!)}`}</span>
                    </span>
                  )}
                </div>
                {/* CLEAR or FOUL only: who fouls the deck is PriFly's business, and the panel keeps its height */}
                <div className={foul ? 'blink' : undefined} style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.04em', color: foul ? '#FF8A85' : '#7FD397', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                  {foul ? 'FOUL' : 'CLEAR'}
                </div>
                {kv('Wind over deck', wod ? `${Math.round(wod.kt)} KT · ${Math.abs(wodAng)}° ${wodAng >= 0 ? 'R' : 'L'} of angle` : '—')}
                {kv('Arresting gear', next ? `${shortType(next.t.ty)} · ${nextW ? nextW.toLocaleString('en-US') : '—'}` : '—')}
                {kv('Lens', `${GS_DEG}° · HTR 13.5 FT`)}
              </section>
            )}

            <section className="pnl" aria-label="Landing aids">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span className="lbl">ICLS</span>
                <div style={SEG}>
                  {(['ON', 'OFF'] as const).map((k) => (
                    <button key={k} disabled={readOnly} aria-pressed={aids.icls === (k === 'ON')} onClick={() => setAids({ icls: k === 'ON' })} style={segBtn(aids.icls === (k === 'ON'), { height: 24, fontSize: 11 })}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              {kv('Channel · glideslope', `CH 13 · ${GS_DEG}°`)}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}>
                <span className="lbl">ACLS · SPN-46</span>
                <div style={SEG}>
                  {(['UP', 'DOWN'] as const).map((k) => (
                    <button key={k} disabled={readOnly} aria-pressed={aids.acls === (k === 'UP')} onClick={() => setAids({ acls: k === 'UP' })} style={segBtn(aids.acls === (k === 'UP'), { height: 24, fontSize: 11 })}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              {kv('Link 4', '373.000')}
              {locks.map(({ a, st }) => {
                const key = keyOf(a.t);
                const mode = aids.modes[key] ?? 'II';
                return (
                  <div key={a.t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '4px 0' }}>
                    <span className="mono" style={{ fontSize: 12 }}>
                      <b>{label(a.t)}</b> <span style={{ color: st === 'LOCK-ON' ? '#7FD397' : '#E7B04F' }}>{st}</span>
                    </span>
                    <div style={SEG}>
                      {(['I', 'IA', 'II', 'III'] as AclsMode[]).map((m) => (
                        <button key={m} disabled={readOnly} aria-pressed={mode === m} onClick={() => setAids({ modes: { ...aids.modes, [key]: m } })} style={segBtn(mode === m, { height: 24, fontSize: 11, padding: '0 7px' })}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!locks.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683', paddingTop: 4 }}>{aids.acls ? 'No aircraft in ACLS coverage' : 'ACLS down'}</div>}
            </section>
          </div>

          <div style={COL}>
            <section className="pnl" aria-label="Bolter slot">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="lbl">Bolter slot{bolter ? ` · ${label(bolter.t)}` : ''}</span>
                {bolter && <span className="mono" style={{ fontSize: 11.5, color: (bolter.t.lb ?? 99999) < 4500 ? '#E7B04F' : '#93A1B0' }}>STATE {fuelK(bolter.t.lb) || '—'}</span>}
              </div>
              {!bolter || !slot ? (
                <div className="mono" style={{ fontSize: 12, color: '#6B7683' }}>No aircraft on the bolter downwind</div>
              ) : (
                <>
                  {slot.window ? (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#7FD397' }}>
                        Turn between {dmeAt(slot.window[0], bolter!.f.lat).toFixed(1)}–{dmeAt(slot.window[1], bolter!.f.lat).toFixed(1)} DME
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: '#93A1B0', marginBottom: 8 }}>
                        in {ms(slot.inS![0])}–{ms(slot.inS![1])} · 3/4 {tod(slot.ballS![0])}–{tod(slot.ballS![1]).slice(3)}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#FF8A85', marginBottom: 8 }}>No slot on this downwind</div>
                  )}
                  {slotDetail(slot)}
                </>
              )}
            </section>

            {upw && uslot && (
              <section className="pnl" aria-label="Upwind turn">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span className="lbl">Upwind turn · {label(upw.t)}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: (upw.t.lb ?? 99999) < 4500 ? '#E7B04F' : '#93A1B0' }}>STATE {fuelK(upw.t.lb) || '—'}</span>
                </div>
                {uslot.window ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#7FD397' }}>
                      Turn downwind {uslot.window[0].toFixed(1)}–{uslot.window[1].toFixed(1)} NM ahead
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: '#93A1B0', marginBottom: 8 }}>
                      in {ms(uslot.inS![0])}–{ms(uslot.inS![1])} · 3/4 {tod(uslot.ballS![0])}–{tod(uslot.ballS![1]).slice(3)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#FF8A85', marginBottom: 8 }}>No slot from this upwind</div>
                )}
                {slotDetail(uslot)}
                <div className="mono" style={{ fontSize: 10.5, color: '#6B7683', marginTop: 4 }}>Turn-in to final at {UPWIND_TURN_IN_NM} DME assumed</div>
              </section>
            )}

            <section className="pnl" aria-label="Sequence">
              <div className="lbl" style={{ marginBottom: 6 }}>Sequence</div>
              {seq.map((a) => {
                const t = a.t;
                // pattern traffic (arrivals, bolters) belongs to Approach / Final, whatever its sortie phase
                const v = ownerOf(keyOf(t), hull, 'approach', Math.max(0, a.f.along), handoffCtx.layout, owners);
                const where = a.kind === 'bolter' ? 'BOLTER · DOWNWIND' : a.kind === 'upwind' ? 'UPWIND' : a.f.along <= 12 ? `3/4 in ${ms(a.tBall!)}` : `${a.f.along.toFixed(1)} NM · 3/4 in ${ms(a.tBall!)}`;
                const low = (t.lb ?? 99999) < 4500;
                return (
                  <div key={t.id} style={{ padding: '6px 8px', marginTop: 4, border: `1px solid ${v.pending ? '#E7B04F' : '#262F3A'}`, borderRadius: 5, background: '#1A212A' }}>
                    <div className="mono" style={{ fontSize: 12 }}>
                      <div>
                        <b>{label(t)}</b> <span style={{ color: '#93A1B0' }}>{t.cs ?? shortType(t.ty)}</span> <span style={{ color: low ? '#E7B04F' : '#E6EDF3' }}>{fuelK(t.lb)}</span>
                      </div>
                      <div style={{ color: '#93A1B0' }}>{where}</div>
                    </div>
                    <HandoffRow v={v} ctx={handoffCtx} />
                  </div>
                );
              })}
              {!seq.length && <div className="mono" style={{ fontSize: 12, color: '#6B7683' }}>No arrivals</div>}
            </section>
          </div>
        </aside>
        <div style={{ padding: '8px 10px 10px 0' }}>
          <AzElScope fp={fp} vecS={vecS} tol={ov.tol} profile={ov.profile} conflictIds={conflictIds} locks={lockOn} pick={azPick} onPick={pickAzEl} style={{ width: sz.h || 334, height: sz.h || 334 }} />
        </div>
      </div>
    </div>
  );
};

/** off the final bearing, degrees */
const offDegOf = (a: FinalAc) => Math.abs((Math.atan2(a.f.lat, Math.max(0.05, a.f.along)) * 180) / Math.PI);
/**
 * The Landing aids ACLS list, agreeing with the radar: LOCK-ON only for the aircraft the SPN-46
 * holds (two channels, spn46.ts), ACQUIRING for the other arrivals on final inside 10 NM and 6° of
 * the centreline (approaching the gate, or waiting for a free channel). Without the held set (the kit),
 * the same gate statelessly: the nearest two inside it.
 */
function aclsList(fp: NonNullable<ReturnType<typeof finalPicture>>, ops: OpsState | undefined, held?: readonly string[]): { a: FinalAc; st: 'LOCK-ON' | 'ACQUIRING' }[] {
  if (ops?.aids?.acls === false) return [];
  const locked = held
    ? fp.acs.filter((a) => held.includes(a.t.id))
    : fp.arrivals.filter((a) => a.kind === 'final' && a.f.along > 0 && a.f.along <= SPN46_ACQ_NM && offDegOf(a) <= SPN46_ACQ_DEG);
  const on = [...locked].sort((x, y) => x.f.along - y.f.along).slice(0, SPN46_CHANNELS);
  const acq = fp.arrivals.filter((a) => a.kind === 'final' && !on.includes(a) && a.f.along <= SPN46_RANGE_NM && offDegOf(a) < 6);
  return [...on.map((a) => ({ a, st: 'LOCK-ON' as const })), ...acq.map((a) => ({ a, st: 'ACQUIRING' as const }))];
}
