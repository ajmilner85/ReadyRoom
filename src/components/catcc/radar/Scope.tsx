/**
 * CATCC radar scope: a port of catcc-handoff/mockup/Main.dc.html (markup, colours, symbol sizes,
 * screen-constant `zs` scaling) driven by the live picture. Layer order as in the mockup:
 * background svg (frame, grid, rings, CCAs) → overlay svg (ship-relative patterns, radials,
 * stacks, rulers) → HTML flags/edge markers → traffic svg (trails, vectors, ships, hits, tags,
 * hooked tools) → HTML helper tags → floating controls.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BLIND_ALTS } from '../../../catcc/core/sensors/radar.ts';
import type { Station } from '../../../catcc/core/room/ops.ts';
import { sectorWidth, stationCentre } from '../../../catcc/core/geometry/formation.ts';
import { cpa as cpaOf, eat as eatOf, fly, interceptSolve, marshalRoute, marshalTimeS, sternConversion, turnRadiusNm, type Cpa } from '../../../catcc/core/geometry/maneuver.ts';
import {
  arrivalPath,
  departurePath,
  emergencyMarshalRadial,
  fixDme,
  heloMarshalRadial,
  holdPattern,
  type HoldSpec,
  type RadialCheck,
} from '../../../catcc/core/geometry/procedures.ts';
import { holdSpecForTas, tasFromIas } from '../../../catcc/core/geometry/procedures.ts';
import { accelRatesKtS, maxEnduranceKias } from '../../../catcc/core/dcs/aircraft.ts';
import { magVar } from '../../../catcc/core/env/magvar.ts';
import { casToTasKt, ISA_SL_K, machFromTasKt, tasToCasKt, tempAtAltK, windAlongKt, windVecKt, wxWindLayers } from '../../../catcc/core/env/atmosphere.ts';
import { orderedPath, trendPath, trendTurnLimit, turnTo } from '../../../catcc/core/geometry/shipTurn.ts';
import { add, bearingOf, D2R, dir, len, mul, P, rot, sub, type Pt } from '../../../catcc/core/geometry/vec.ts';
import { norm360 } from '../../../catcc/core/geo.ts';
import type { Assignment, CarrierPlan, StackDef } from '../../../catcc/core/room/protocol.ts';
import { coordGeom, type CoordGeom } from '../../../catcc/core/geometry/coordination.ts';
import { SCAN_S, sweepAngle } from './sweep.ts';
import { arcPath, clipArc, unionArcs, unionLoopsPath } from './circleUnion.ts';
import { shipClassName } from '../../../catcc/core/dcs/shipNames.ts';
import { buildPaths, terrTopsFor, useMarine, type MarineGeom, type MarinePaths } from './marine.ts';
import { MAX_RANGE_NM, THEATRE_BOXES, theatreAt } from '../../../catcc/core/dcs/theatres.ts';
import { pimAt } from '../../../catcc/core/env/weather.ts';
import { distanceNm } from '../../../catcc/core/geo.ts';

const IS_GECKO = typeof navigator !== 'undefined' && /Gecko\/|Firefox\//.test(navigator.userAgent) && !/like Gecko/.test(navigator.userAgent);

/** SPN-43 antenna bearing: one thin line, ring weight; animated without re-rendering. */
const SweepLine: React.FC<{ x: number; y: number; w: number; len: number; rot: number }> = (p) => (IS_GECKO ? <SweepLineRaf {...p} /> : <SweepLineCss {...p} />);

// Chrome/Safari: a CSS animation runs on the compositor, so the sweep keeps turning smoothly while
// the main thread is busy redrawing the scope. The negative delay puts it in phase with
// sweepAngle(), which the hit painter uses. The animated element IS the line, rotating about its
// bottom end at the carrier.
const SweepLineCss: React.FC<{ x: number; y: number; w: number; len: number; rot: number }> = ({ x, y, w, len, rot: turn }) => {
  const [delay] = useState(() => -(sweepAngle(performance.now()) / 360) * SCAN_S);
  return (
    // the wrapper turns the whole sweep with the picture (track up), about the carrier
    <div aria-hidden="true" style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, transform: turn ? `rotate(${-turn}deg)` : undefined, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: -w / 2,
          top: -len,
          width: w,
          height: len,
          background: 'rgba(64, 168, 91, .55)',
          transformOrigin: '50% 100%',
          pointerEvents: 'none',
          animation: `catcc-sweep ${SCAN_S}s linear infinite`,
          animationDelay: `${delay}s`,
          willChange: 'transform',
        }}
      />
    </div>
  );
};

// Firefox: WebRender rasterises a long, thin, compositor-rotated layer in tiles, and the tiles are
// sampled with a sub-pixel offset at many angles, so the line visibly breaks into offset pieces.
// Instead an SVG line's end point is set every frame (no React render), so the geometry itself is
// rotated and rasterised in one piece.
const SweepLineRaf: React.FC<{ x: number; y: number; w: number; len: number; rot: number }> = ({ x, y, w, len, rot: turn }) => {
  const ref = useRef<SVGLineElement>(null);
  const geo = useRef({ x, y, len, turn });
  geo.current = { x, y, len, turn };
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const g = geo.current;
        const a = ((sweepAngle(performance.now()) - g.turn) * Math.PI) / 180;
        el.setAttribute('x1', g.x.toFixed(2));
        el.setAttribute('y1', g.y.toFixed(2));
        el.setAttribute('x2', (g.x + Math.sin(a) * g.len).toFixed(2));
        el.setAttribute('y2', (g.y - Math.cos(a) * g.len).toFixed(2));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      <line ref={ref} x1={x} y1={y} x2={x} y2={y - len} stroke="rgba(64, 168, 91, .55)" strokeWidth={w} />
    </svg>
  );
};
/**
 * A radar donor's beam: a translucent wedge trailing the antenna bearing, turning once per scan about
 * (x, y). A CSS animation on a group translated to the donor, so it turns without re-rendering; the
 * negative delay puts it in phase with the hit painter (bearing = now·360/scan + phase).
 */
const DonorBeam: React.FC<{ x: number; y: number; r: number; scanS: number; phase: number }> = ({ x, y, r, scanS, phase }) => {
  const [delay] = useState(() => -((((performance.now() / 1000) * 360) / scanS + phase) % 360) / 360 * scanS);
  const W = (60 * Math.PI) / 180; // afterglow width
  const lead = `M0 0L0 ${f2(-r)}`;
  // the afterglow fades with angle behind the sweep line: nested wedges from the line back, each a
  // little wider, so the shade is darkest at the line and falls off smoothly to nothing (no seams)
  const N = 12;
  const wedge = (a: number) => `M0 0L0 ${f2(-r)}A${r} ${r} 0 0 0 ${f2(-r * Math.sin(a))} ${f2(-r * Math.cos(a))}Z`;
  return (
    <g transform={`translate(${f2(x)} ${f2(y)})`}>
      <g style={{ transformOrigin: '0 0', animation: `catcc-sweep ${scanS}s linear infinite`, animationDelay: `${delay}s` }}>
        {Array.from({ length: N }, (_, i) => (
          <path key={i} d={wedge((W * (i + 1)) / N)} fill="#E7C66B" fillOpacity={0.026} />
        ))}
        <path d={lead} stroke="#E7C66B" strokeOpacity={0.5} style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />
      </g>
    </g>
  );
};
import { inAltBlock, smoothedCourse, STACK_IDS, stackLabel, tagRows, velocityEnd, type Carrier, type Formation, type Picture, type ScopeTrack } from '../scopeModel.ts';
import { layoutTags, type TagPlace } from './tagLayout.ts';
import { IcSliders } from '../icons.tsx';
import { IcBra, IcBulls, IcCpa, IcComms, IcIntercept, IcLayers, IcMarshal, IcRadio, IcSelect, IcVec, IcWp, IcZoomIn, IcZoomOut } from '../icons.tsx';

import { LW_STEPS, UI_STEPS, type PimShip, type RadarDonor, type Editing, type Fit, type Highlight, type Placement, type Tool, type UiScale } from './types.ts';

export type { Editing, Fit, Highlight, Placement, Tool, UiScale };

export interface ScopeProps {
  pic: Picture;
  /** seconds of the UTC day, for fix times and EATs */
  nowS?: number;
  ui: UiScale;
  ov: Record<string, boolean>;
  ov2: Record<string, boolean>;
  tool: Tool;
  onTool: (t: Tool) => void;
  hookedId: string | null;
  onHook: (id: string | null) => void;
  /** radials plan for every carrier, by hull */
  plans: Record<string, CarrierPlan>;
  assignments: Map<string, Assignment>;
  onAssign: (trackId: string, a: Assignment) => void;
  /** committed intercept assignments (interceptor id → target id) and local working locks */
  intercepts: Record<string, string>;
  locks: Record<string, string>;
  /** lock the hooked interceptor to a target (working), or release a lock */
  onLock: (interceptor: string, target: string) => void;
  onUnlock: (interceptor: string) => void;
  placement: Placement;
  /** resolved coordination lines toward each other carrier, and the one being placed */
  coordLines: Record<string, CoordGeom>;
  /** aircraft whose marshal assignment (route and tag) to show, from a hovered strip */
  showAssigned?: string[] | null;
  /** coalition bullseyes from the mission environment */
  bulls?: { side: 'blue' | 'red'; lat: number; lon: number }[];
  /** planned routes to draw (PIM / waypoints overlay), already filtered to the ones switched on */
  pimRoutes?: PimShip[];
  /** track-up display: the own ship's heading at the top */
  trackUp?: boolean;
  /** range rings from the carrier out to the theatre's edge (CDC) instead of 10-40 NM */
  ringsFar?: boolean;
  /** altitude block (ft): aircraft outside it, and not climbing or descending into it, are dimmed and untagged */
  altFilter?: { lo: number; hi: number } | null;
  onAltFilter?: (f: { lo: number; hi: number } | null) => void;
  /** offer the north-up / track-up switch (and its state handler) */
  onTrackUp?: (on: boolean) => void;
  /** mission date as a decimal year, for the magnetic variation */
  magYear?: number;
  /** the conning seat: turn trend lines ahead of our carrier (present rate of turn; the helm order's path) */
  trend?: boolean;
  /** the helm order in force for our carrier */
  helm?: { crs: number; kt: number };
  /** the bridge's plotted route for our carrier (from the ship through each point), labelled with ETAs; active when it is being followed */
  navRoute?: { pts: { lat: number; lon: number; label: string }[]; active: boolean };
  /** the Plot waypoint tool: a click adds a waypoint there */
  onPlotWaypoint?: (lat: number, lon: number) => void;
  /** half-size of the PIM box drawn about our carrier's PIM, NM */
  pimBoxNm?: number;
  /** with onCsg the toolbar has a switch for the CSG formation display (stations and off-station labels) */
  csgOn?: boolean;
  onCsg?: (on: boolean) => void;
  /** conflict alerts shown; with onConflicts the toolbar has a switch for them */
  conflictsOn?: boolean;
  onConflicts?: (on: boolean) => void;
  /** the seat's scope tools, range presets and whether it has comms scripts */
  tools?: Tool[];
  fits?: Exclude<Fit, null>[];
  comms?: boolean;
  /** opens the radar display settings (sizes, conflict detection) */
  onOpenDisplay?: () => void;
  /** escorts' formation stations around the own carrier (CSG stations layer) */
  stations?: { label: string; st: Station; p: Pt; state: { t: string; c: string } }[];
  /** friendly air-search radars (Datalink sources layer) and their coverage (Radar blindspots layer) */
  donors?: RadarDonor[];
  /** target altitude the blind spots are drawn for, ft */
  blindAlt?: number;
  /** mission time, s (route ETAs are on this clock) */
  mt?: number;
  /** mission start, s after local midnight, for waypoint times */
  dayStart?: number;
  /** DCS theatre, for the marine layer (inferred from position when absent) */
  theatre?: string;
  coordPreview: { hull: string; g: CoordGeom } | null;
  onCoordPreview: (c: { hull: string; brg: number; off: number }) => void;
  onCoordCommit: (c: { hull: string; brg: number; off: number }) => void;
  onCancelPlacement: () => void;
  checkRadial: (b: number) => RadialCheck;
  onPlaceHover: (b: number | null) => void;
  onPlaceClick: (b: number) => void;
  hl: Highlight | null;
  fit: Fit;
  onFit: (f: Fit) => void;
  goTo?: { p: Pt; nonce: number; fit?: Pt[] };
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** bullseye visibility (its own button beside Layers) */
  onToggleBulls: () => void;
  layersPanel: React.ReactNode;
  freqOpen: boolean;
  onToggleFreq: () => void;
  freqPanel: React.ReactNode;
  onOpenComms: () => void;
}

// ---------------------------------------------------------------- helpers

// map coordinates (NM) to 0.001 NM (~2 m): at the closest zoom (5 NM) 0.01 NM was over a pixel, and curves
// made of many short steps (turn trends, patterns) rounded into a visible wobble
const f2 = (n: number) => (Math.round(n * 1000) / 1000).toString();
const pts = (q: Pt[], close = false) => (q.length ? 'M' + q.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L') + (close ? 'Z' : '') : '');
const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const hms = (t: number) => {
  const s = Math.round(((t % 86400) + 86400) % 86400);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};
const msS = (t: number) => {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const zs = (a: Pt, k: number) => `translate(${f2(a[0])} ${f2(a[1])}) scale(${k.toFixed(4)}) translate(${f2(-a[0])} ${f2(-a[1])})`;
// --- segment / rectangle intersection, for keeping floating labels off lines and other boxes
interface Box { x: number; y: number; w: number; h: number }
const segSeg = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean => {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return d(p3, p4, p1) > 0 !== d(p3, p4, p2) > 0 && d(p1, p2, p3) > 0 !== d(p1, p2, p4) > 0;
};
const segHitsBox = (a: Pt, b: Pt, r: Box): boolean => {
  const inside = (p: Pt) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
  if (inside(a) || inside(b)) return true;
  const c: Pt = [r.x + r.w, r.y];
  const d: Pt = [r.x + r.w, r.y + r.h];
  const e: Pt = [r.x, r.y + r.h];
  const f: Pt = [r.x, r.y];
  return segSeg(a, b, f, c) || segSeg(a, b, c, d) || segSeg(a, b, d, e) || segSeg(a, b, e, f);
};
const boxHitsBox = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const HELO_HOLD: HoldSpec = { legNm: 2, turnNm: 0.5 };
/** view width, NM: 5 NM (edge to centre) at the closest, MAX_RANGE_NM at the widest */
const clampW = (w: number) => Math.max(2 * MIN_RANGE_NM, Math.min(2 * MAX_RANGE_NM, w));
const MIN_RANGE_NM = 5;

const TRK = '#5FD068';
const TRK_TRAIL = '#3E9A4C';
const BLUE_HIT = '#3E9BD4';
/** the radar carrier symbol's hull centreline, symbol units right of its origin (bow 0.06..0.287, stern 0.001..0.316) */
const CV_KEEL_X = 0.165;
const BLUE_TAG = '#6FB6E6';
const BLUE_TRAIL = '#2F6F99';

/** Mockup ship-relative overlays were drawn for BRC 345 / FB 336; they are rotated by (BRC − 345). */
const MOCK_BRC = 345;
/** bathymetry intensity (shading, contours, shallow-water tint/hatch/outline; not the depth labels) */
const BATHY_K = 1;
/** unit vector astern along the final bearing in the mockup frame (the drawn final runs to 6.1, 13.7) */
const FB_U: Pt = [6.1 / Math.hypot(6.1, 13.7), 13.7 / Math.hypot(6.1, 13.7)];
/** IFLOLS / LSO handover: 3/4 SM astern, NM */
const IFLOLS_NM = 0.75 * 0.868976;

// ---------------------------------------------------------------- altitude filter

const ALT_MAX = 50;

/** a + (b − a)·t for #rrggbb colours */
const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Vertical two-handle slider (angels 0-50) setting the altitude block; Reset clears it. Inactive it
 * spans the whole range in grey; set, the block is orange and labelled.
 */
const AltSlider: React.FC<{ value: { lo: number; hi: number } | null; onChange: (f: { lo: number; hi: number } | null) => void }> = ({ value, onChange }) => {
  const H = 260;
  const ref = useRef<HTMLDivElement>(null);
  const lo = value ? value.lo / 1000 : 0;
  const hi = value ? value.hi / 1000 : ALT_MAX;
  const yOf = (a: number) => H - (a / ALT_MAX) * H;
  const aOf = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(ALT_MAX, Math.round(((r.bottom - clientY) / r.height) * ALT_MAX)));
  };
  const set = (l: number, h: number) => (l <= 0 && h >= ALT_MAX ? onChange(null) : onChange({ lo: l * 1000, hi: h * 1000 }));
  const drag = (which: 'lo' | 'hi') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const mv = (ev: PointerEvent) => {
      const a = aOf(ev.clientY);
      if (which === 'lo') set(Math.min(a, hi - 1), hi);
      else set(lo, Math.max(a, lo + 1));
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // a click on the track moves the nearer handle there
  const onTrack = (e: React.PointerEvent) => {
    const a = aOf(e.clientY);
    if (Math.abs(a - lo) <= Math.abs(a - hi)) set(Math.min(a, hi - 1), hi);
    else set(lo, Math.max(a, lo + 1));
    drag(Math.abs(a - lo) <= Math.abs(a - hi) ? 'lo' : 'hi')(e);
  };
  const on = !!value;
  const C = on ? '#F15822' : '#5E6A78';
  const handle = (which: 'lo' | 'hi', a: number) => (
    <div
      role="slider"
      aria-label={which === 'lo' ? 'Altitude filter floor' : 'Altitude filter ceiling'}
      aria-valuemin={0}
      aria-valuemax={ALT_MAX}
      aria-valuenow={a}
      aria-valuetext={`Angels ${a}`}
      tabIndex={0}
      onPointerDown={drag(which)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        if (which === 'lo') set(Math.max(0, Math.min(lo + d, hi - 1)), hi);
        else set(lo, Math.min(ALT_MAX, Math.max(hi + d, lo + 1)));
      }}
      style={{ position: 'absolute', left: -10, top: yOf(a) - 8, width: 36, height: 16, borderRadius: 4, background: '#0E1116', border: `1.5px solid ${on ? '#F15822' : '#5E6A78'}`, color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, lineHeight: '14px', textAlign: 'center', cursor: 'ns-resize', touchAction: 'none' }}
    >
      {a}
    </div>
  );
  return (
    <div aria-label="Altitude filter" style={{ userSelect: 'none', WebkitUserSelect: 'none', width: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '9px 0 9px', background: 'rgba(21,26,33,.96)', border: `1px solid ${on ? '#F15822' : '#374250'}`, borderRadius: 6 }}>
      <span className="mono" title="Altitude filter (angels)" style={{ fontSize: 9, letterSpacing: '.08em', color: on ? '#FFB08F' : '#93A1B0' }}>ALT</span>
      {/* the handles overhang the track's ends by half their height: the margin keeps them clear of the label and reset */}
      <div ref={ref} onPointerDown={onTrack} style={{ position: 'relative', width: 16, height: H, margin: '12px 0', cursor: 'pointer', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 6, width: 4, top: 0, bottom: 0, borderRadius: 2, background: '#262F3A' }} />
        <div style={{ position: 'absolute', left: 5, width: 6, top: yOf(hi), height: yOf(lo) - yOf(hi), borderRadius: 3, background: C, opacity: on ? 1 : 0.6 }} />
        {[10, 20, 30, 40].map((a) => (
          <div key={a} style={{ position: 'absolute', left: 0, width: 3, top: yOf(a), height: 1, background: '#5E6A78' }} />
        ))}
        {handle('hi', hi)}
        {handle('lo', lo)}
      </div>
      <button onClick={() => onChange(null)} disabled={!on} title="Reset the altitude filter" aria-label="Reset altitude filter" style={{ width: 28, height: 24, padding: 0, borderRadius: 4, border: `1px solid ${on ? '#F15822' : '#374250'}`, background: 'transparent', color: on ? '#FFB08F' : '#5E6A78', cursor: on ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.4-5.7" />
          <path d="M4 4v5h5" />
        </svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- component


/**
 * The marine layer (depth shading, contours, land, places, airports) in its own SVG, drawn in the
 * layer's origin frame with an overscan margin. It is memoised on a snapshot of the view, so pans
 * and carrier drift only slide it with a compositor transform; it re-renders on zoom or once the
 * view moves past the margin. (Redrawing it on every pan step was the main cause of pan lag.)
 */
const MarineLayer = React.memo(function MarineLayer(props: {
  marine: MarinePaths;
  vb: string;
  bathy: boolean;
  coast: boolean;
  places: boolean;
  airports: boolean;
  terr: boolean;
  KX: number;
  VW: number;
  k: number;
  sL: number;
  /** track-up: degrees the layer's container is turned (anticlockwise); labels are placed and turned for it */
  rot: number;
  /** the screen-top point of each territorial ring (terrTopsFor) */
  tops: { x: number; y: number; w: number }[];
}) {
  const { marine, bathy, coast, places, airports, terr, KX, VW, k, sL, rot: turn } = props;
  const upT = (x: number, y: number) => (turn ? `rotate(${turn} ${f2(x)} ${f2(y)})` : undefined);
  return (
    <svg className="scope" viewBox={props.vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', '--z': k.toFixed(4), '--lw': sL } as React.CSSProperties}>
      <g>
      {(() => {
            const n = marine.depth.length;
            // shallow → deep: lines go from light to dark blue
            const lineC = (i: number) => {
              const f = n > 1 ? i / (n - 1) : 0;
              const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
              return `rgb(${mix(150, 46)},${mix(196, 92)},${mix(232, 140)})`;
            };
            return (
              <g style={{ pointerEvents: 'none' }}>
                {bathy && (
                  <>
                    {/* water lightens toward the shore: each level fills the region shallower than it */}
                    {marine.depth.map((x, i) => (
                      // the same look as stacking one 3.2 % layer per level: band i sits under (n - i) layers
                      <path key={`f${x.d}`} d={x.band} fill="#5B93C4" fillOpacity={(BATHY_K * (1 - Math.pow(1 - 0.032, marine.depth.length - i))).toFixed(4)} fillRule="evenodd" stroke="none" />
                    ))}
                    {/* not navigable by a CVN: faint tint plus a screen-constant diagonal hatch */}
                    <defs>
                      <pattern id="catccNavHatch" patternUnits="userSpaceOnUse" width={f2(7 / KX)} height={f2(7 / KX)} patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2={f2(7 / KX)} stroke="#A9D6F5" strokeOpacity={0.32 * BATHY_K} strokeWidth={(1 / KX).toFixed(4)} style={{ vectorEffect: 'none' }} />
                      </pattern>
                    </defs>
                    <path d={marine.nav} fill="#A9D6F5" fillOpacity={0.06 * BATHY_K} fillRule="evenodd" stroke="none" />
                    <path d={marine.nav} fill="url(#catccNavHatch)" fillRule="evenodd" stroke="none" />
                    <path d={marine.navLine} fill="none" stroke="#A9D6F5" strokeOpacity={0.5 * BATHY_K} strokeLinejoin="round" style={{ strokeWidth: 'calc(0.9px * var(--lw, 1))' }} />
                    {marine.depth.map((x, i) => (
                      <path key={x.d} d={x.path} fill="none" stroke={lineC(i)} strokeOpacity={0.22 * BATHY_K} strokeLinejoin="round" style={{ strokeWidth: 'calc(0.8px * var(--lw, 1))' }} />
                    ))}
                  </>
                )}
                {terr &&
                  (() => {
                    // territorial limit: dashed, chart violet (approximate: 12 NM from the shoreline, not
                    // baselines). Each ring is labelled at its 12 o'clock point, the line broken under the label;
                    // rings too small to carry the label at this zoom go unlabelled
                    const hw = 1.25 * k;
                    const hh = 0.5 * k;
                    const tops = props.tops.filter((t) => t.w > 6 * hw);
                    return (
                      <>
                        <defs>
                          <mask id="catccTerrGap" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">
                            <rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff" />
                            {tops.map((t, i) => (
                              <rect key={i} x={f2(t.x - hw)} y={f2(t.y - hh)} width={f2(2 * hw)} height={f2(2 * hh)} fill="#000" transform={upT(t.x, t.y)} />
                            ))}
                          </mask>
                        </defs>
                        <path d={marine.terr} mask="url(#catccTerrGap)" fill="none" stroke="#B48AD9" strokeOpacity="0.7" strokeDasharray="6 4" strokeLinejoin="round" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />
                        {tops.map((t, i) => (
                          <text key={`t${i}`} x={f2(t.x)} y={f2(t.y)} className="geo" textAnchor="middle" dominantBaseline="central" style={{ fill: '#C7A6E6', fillOpacity: 0.85 }}>
                            12 NM
                          </text>
                        ))}
                      </>
                    );
                  })()}
                {coast && (
                  <>
                    <path d={marine.land} fill="#1A2119" fillRule="evenodd" stroke="none" />
                    <path d={marine.coast} fill="none" stroke="#A9B4A0" strokeOpacity="0.55" strokeLinejoin="round" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />
                  </>
                )}
                {(places || airports) &&
                  (() => {
                    // declutter by zoom: minor places and fields only appear as the view narrows
                    const maxR = VW > 250 ? 0 : VW > 120 ? 1 : VW > 60 ? 2 : 3;
                    return (
                      <g>
                        {places &&
                          marine.places
                            .filter((p) => p.r <= maxR)
                            .map((p, i) =>
                              p.island ? (
                                <g key={`p${i}`} className="zs" transform={zs([p.x, p.y], k)}>
                                  <text x={f2(p.x)} y={f2(p.y)} textAnchor="middle" dominantBaseline="central" style={{ fill: '#8FB4D6', fontStyle: 'italic', letterSpacing: '0.04em', fontSize: p.r === 0 ? '1.15px' : '1px', stroke: '#0B0E12', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                                    {p.n.toUpperCase()}
                                  </text>
                                </g>
                              ) : (
                                <g key={`p${i}`} className="zs" transform={zs([p.x, p.y], k)}>
                                  <circle cx={f2(p.x)} cy={f2(p.y)} r="0.24" fill="#8E99A6" />
                                  <text className="nr" transform={upT(p.x, p.y)} x={f2(p.x + 0.55)} y={f2(p.y + 0.32)} style={{ fill: '#A3AEBA', fontSize: p.r === 0 ? '1.05px' : '0.92px', stroke: '#0B0E12', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                                    {p.n}
                                  </text>
                                </g>
                              ),
                            )}
                        {airports &&
                          marine.airports
                            .filter((a) => a.r <= maxR)
                            .map((a, i) => {
                              const c = a.mil ? '#C8B07A' : '#A7B3C0';
                              const [x, y] = [a.x, a.y];
                              // Sectional style: the runway layout at its true orientation. Small fields sit in a
                              // ring; fields with a runway of 8069 ft or more are drawn as the pattern alone. The
                              // pattern is enlarged to symbol size, or drawn true to scale once it is bigger.
                              const R = 0.75;
                              const m = a.ext > 0 ? Math.max(1, (0.6 * R * k) / a.ext) / k : 0; // ref units per NM
                              // the ring belongs to the enlarged symbol only; at true scale it would be a stray circle
                              const schem = a.ext > 0 && (0.6 * R * k) / a.ext > 1;
                              const lx = x + (a.rw.length ? Math.max(R, a.ext * m) : 0.42) + 0.45;
                              // Drawn runways in ref units. Parallels closer than one outlined runway width
                              // (1.5 px + 1 px outline each side + 1 px gap) are pushed apart along their normal,
                              // so two runways stay two runways at any zoom.
                              const pxPerRef = k * KX;
                              const minSep = (1.5 * sL + 3) / pxPerRef;
                              const rws = a.rw.map(([x1, y1, x2, y2]) => [x1 * m, y1 * m, x2 * m, y2 * m]);
                              for (let p1 = 0; p1 < rws.length; p1++)
                                for (let p2 = p1 + 1; p2 < rws.length; p2++) {
                                  const [a1, b1, a2, b2] = rws[p1];
                                  const [c1, d1, c2, d2] = rws[p2];
                                  const L1 = Math.hypot(a2 - a1, b2 - b1) || 1;
                                  const ux = (a2 - a1) / L1;
                                  const uy = (b2 - b1) / L1;
                                  const L2 = Math.hypot(c2 - c1, d2 - d1) || 1;
                                  if (Math.abs(ux * (c2 - c1) / L2 + uy * (d2 - d1) / L2) < Math.cos((10 * Math.PI) / 180)) continue;
                                  const [nx, ny] = [-uy, ux];
                                  const sep = ((c1 + c2) / 2 - (a1 + a2) / 2) * nx + ((d1 + d2) / 2 - (b1 + b2) / 2) * ny;
                                  if (Math.abs(sep) >= minSep) continue;
                                  const push = ((Math.sign(sep) || 1) * (minSep - Math.abs(sep))) / 2;
                                  rws[p1] = [a1 - nx * push, b1 - ny * push, a2 - nx * push, b2 - ny * push];
                                  rws[p2] = [c1 + nx * push, d1 + ny * push, c2 + nx * push, d2 + ny * push];
                                }
                              return (
                                <g key={`a${i}`} className="zs" transform={zs([x, y], k)} stroke={c} fill="none">
                                  {a.rw.length ? (
                                    <>
                                      {/* Jeppesen-style: every element carries a 1 px black outline (drawn first, 2 px wider) */}
                                      {!a.long && schem && (
                                        <>
                                          <circle cx={f2(x)} cy={f2(y)} r={R} stroke="#000" style={{ strokeWidth: 'calc(1.1px * var(--lw, 1) + 2px)' }} />
                                          <circle cx={f2(x)} cy={f2(y)} r={R} style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} />
                                        </>
                                      )}
                                      {/* outline + fill per runway, so each runway's outline cuts across the one before:
                                          close parallels read as two runways, not one wide bar */}
                                      {rws.map(([x1, y1, x2, y2], j) => (
                                        <g key={j}>
                                          <line x1={f2(x + x1)} y1={f2(y + y1)} x2={f2(x + x2)} y2={f2(y + y2)} stroke="#000" strokeLinecap="square" style={{ strokeWidth: 'calc(1.5px * var(--lw, 1) + 2px)' }} />
                                          <line x1={f2(x + x1)} y1={f2(y + y1)} x2={f2(x + x2)} y2={f2(y + y2)} strokeLinecap="square" style={{ strokeWidth: 'calc(1.5px * var(--lw, 1))' }} />
                                        </g>
                                      ))}
                                    </>
                                  ) : (
                                    <g style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }}>
                                      <circle cx={f2(x)} cy={f2(y)} r="0.42" />
                                      {a.mil && <circle cx={f2(x)} cy={f2(y)} r="0.16" fill={c} stroke="none" />}
                                      <path d={`M${f2(x)} ${f2(y - 0.42)}v-0.28M${f2(x)} ${f2(y + 0.42)}v0.28M${f2(x - 0.42)} ${f2(y)}h-0.28M${f2(x + 0.42)} ${f2(y)}h0.28`} />
                                    </g>
                                  )}
                                  <text className="nr" transform={upT(x, y)} x={f2(lx)} y={f2(y - 0.12)} stroke="#0B0E12" style={{ fill: c, fontSize: '0.92px', fontWeight: 600, strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                                    {a.id}
                                  </text>
                                  <text className="nr" transform={upT(x, y)} x={f2(lx)} y={f2(y + 0.85)} stroke="#0B0E12" style={{ fill: c, fillOpacity: 0.8, fontSize: '0.78px', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                                    {a.n}
                                  </text>
                                </g>
                              );
                            })}
                      </g>
                    );
                  })()}
                {bathy &&
                  marine.labels.map((l, i) => (
                    <text
                      key={i}
                      x={f2(l.x)}
                      y={f2(l.y)}
                      className="geo nr"
                      textAnchor="middle"
                      dominantBaseline="central"
                      // along the contour, flipped where the turned picture would show it upside down
                      transform={`rotate(${(Math.abs(((((l.ang - turn) % 360) + 540) % 360) - 180) > 90 ? l.ang + 180 : l.ang).toFixed(1)} ${f2(l.x)} ${f2(l.y)})`}
                      style={{ fill: '#7FA8CC', fillOpacity: 0.6, stroke: '#0B0E12', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}
                    >
                      {l.t}
                    </text>
                  ))}
              </g>
            );
      })()}
    </g>
    </svg>
  );
});

export const Scope: React.FC<ScopeProps> = (props) => {
  const { pic, ui, ov, ov2, tool, hookedId, onHook, plans, assignments, placement, hl, fit, onFit } = props;
  const fTrack = pic.focus?.track;
  // the reported theatre wins unless the carrier is outside its box (e.g. a replay that does not know it)
  const tBox = props.theatre ? THEATRE_BOXES[props.theatre] : undefined;
  const inBox = !!tBox && !!fTrack && fTrack.lat >= tBox[0] && fTrack.lat <= tBox[2] && fTrack.lon >= tBox[1] && fTrack.lon <= tBox[3];
  const marine = useMarine(inBox ? props.theatre : fTrack ? theatreAt(fTrack.lat, fTrack.lon) : undefined, fTrack?.lat, fTrack?.lon, !!(ov.coast || ov.bathy || ov.places || ov.airports || ov.terr));
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 900, h: 675 });
  const [view, setView] = useState({ zx: -2, zy: 4, zw: 97 });
  // Scope coordinates are carrier-centred, so a plain view follows the carrier ("locked"). Panning or
  // wheel-zooming unlocks it: the view centre is then pinned to a geographic point until the
  // centre-on-carrier button or a range preset locks it again.
  const [lock, setLock] = useState(true);
  // wheel/zoom-button activity: the marine layer is scaled as an image meanwhile and redrawn once idle
  const zoomedAt = useRef(0);
  const zoomIdleT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, setZoomIdle] = useState(0);
  const anchor = useRef<{ lat: number; lon: number } | null>(null);
  const unlockAt = (zx: number, zy: number) => {
    anchor.current = pic.proj ? pic.proj.toLatLon([zx, zy]) : null;
    setLock(false);
  };
  const anc = !lock && anchor.current && pic.proj ? pic.proj.toScope(anchor.current.lat, anchor.current.lon) : null;
  const [cur, setCur] = useState<Pt | null>(null);
  const [panning, setPanning] = useState(false);
  const [fmSel, setFmSel] = useState<Record<string, number>>({});
  const [fmHov, setFmHov] = useState<string | null>(null);
  // aircraft under the cursor (its marshal assignment is shown while hovered)
  const [acHov, setAcHov] = useState<string | null>(null);
  const [vspd, setVspd] = useState<number | null>(null);
  const [asg, setAsg] = useState<{ id: string; ang: number } | null>(null);
  const [bra, setBra] = useState<{ a: Pt | string; b: Pt | string | null } | null>(null);
  const [probe, setProbe] = useState<{ a: string; b: string | null } | null>(null);
  // intercept tool: a sticky offset of the data tag relative to the interceptor, so the tag rides
  // with the (moving) interceptor and only re-places when it would be obscured
  const intTagPos = useRef<{ key: string; ox: number; oy: number } | null>(null);
  const dragged = useRef(false);
  const prevPlaces = useRef<Map<string, TagPlace>>(new Map());

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setVspd(null);
    setAsg(null);
  }, [hookedId]);
  useEffect(() => {
    setBra(null);
    setProbe(null);
  }, [tool]);
  // Escape drops the hook (and any half-drawn BRA ruler / CPA probe); for intercepts it first
  // releases the target lock, then the hook (same two-step as right click)
  const escRef = useRef({ tool, hookedId, locks: props.locks, onUnlock: props.onUnlock });
  escRef.current = { tool, hookedId, locks: props.locks, onUnlock: props.onUnlock };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const r = escRef.current;
      if (r.tool === 'int' && r.hookedId && r.locks[r.hookedId]) {
        r.onUnlock(r.hookedId);
        return;
      }
      onHook(null);
      props.onCancelPlacement();
      setBra(null);
      setProbe(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHook]);

  const asp = Math.min(2, Math.max(0.4, box.h / box.w));
  const focus = pic.focus;
  const ship = focus?.ship;
  const hull = focus?.track.hull ?? '';
  const plan = plans[hull] ?? { deps: [], stacks: [] };

  // ------------------------------------------------ view and scale (mockup renderVals/frame)
  // Track-up: the picture is turned about the carrier so its heading points up. Scope (map) coordinates
  // stay north-up; rp() takes a map point to the turned frame the SVG viewBox and screen use.
  // held until the heading is a full degree off, so a heading wobbling about x.5° doesn't turn (and rebuild) the picture
  const rotHeld = useRef(0);
  const hdgNow = props.trackUp && fTrack ? norm360(fTrack.hdg ?? fTrack.crs ?? 0) : null;
  if (hdgNow == null) rotHeld.current = 0;
  else if (Math.abs(((hdgNow - rotHeld.current + 540) % 360) - 180) >= 1 || rotHeld.current === 0) rotHeld.current = Math.round(hdgNow) % 360 || 360;
  const ROT = rotHeld.current % 360;
  const rA = (-ROT * Math.PI) / 180;
  const rCo = Math.cos(rA);
  const rSi = Math.sin(rA);
  const rp = (q: Pt): Pt => (ROT ? [q[0] * rCo - q[1] * rSi, q[0] * rSi + q[1] * rCo] : q);
  const rpInv = (q: Pt): Pt => (ROT ? [q[0] * rCo + q[1] * rSi, -q[0] * rSi + q[1] * rCo] : q);
  const fitBox = (q: Pt[], pad: number) => {
    let xa = Infinity;
    let xb = -Infinity;
    let ya = Infinity;
    let yb = -Infinity;
    // boxed as it is seen: in the turned frame in track up
    for (const [x, y] of q.map(rp)) {
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      ya = Math.min(ya, y);
      yb = Math.max(yb, y);
    }
    const w = xb - xa + 2 * pad;
    const h = yb - ya + 2 * pad;
    const cen = rpInv([(xa + xb) / 2, (ya + yb) / 2]);
    return { zw: clampW(Math.max(w, h / asp)), zx: cen[0], zy: cen[1] };
  };
  /** a range about a point: the same view however the picture is turned */
  const fitRing = (c: Pt, r: number) => ({ zw: clampW(Math.max(2 * r, (2 * r) / asp)), zx: c[0], zy: c[1] });
  const interest = (): Pt[] => [[0, 0] as Pt, ...pic.air.map((t) => t.p), ...pic.carriers.map((c) => c.track.p), ...(pic.ships ?? []).map((t) => t.p)];
  const fits: Record<Exclude<Fit, null>, () => { zw: number; zx: number; zy: number }> = {
    // as much of the theatre as the view can show, centred on what's of interest (the theatre clamp
    // then slides it only as far as it must to stay inside)
    thr: () => {
      // the largest view whose footprint (turned, in track up) stays inside the theatre box
      const zw = tBounds ? clampW(Math.min((tBounds.x1 - tBounds.x0) / fpW, (tBounds.y1 - tBounds.y0) / fpH)) : fitBox([[-200, -200], [200, 200]], 0).zw;
      const c = fitBox(interest(), 0);
      return { zw, zx: c.zx, zy: c.zy };
    },
    // everything of interest: aircraft, carriers and other ships
    fit: () => fitBox(interest(), 8),
    // the own side's bullseye, 100 NM around it
    bulls: () => {
      const be = props.bulls?.[0];
      const b = be && pic.proj ? pic.proj.toScope(be.lat, be.lon) : null;
      return fitRing(b ?? [0, 0], 100);
    },
    r50: () => fitRing([0, 0], 50),
    r5: () => fitRing([0, 0], 5),
    // our strike group: the carrier, its stationed escorts, and friendly ships within 30 NM that are nearer
    // to it than to any other friendly carrier (those are the other group's), plus a margin
    csg: () => {
      const sd = fTrack?.sd;
      const others = pic.carriers.filter((c) => !c.focus && c.track.sd === sd).map((c) => c.track.p);
      const ours = (s: ScopeTrack) => s.sd === sd && s.rng <= 30 && !others.some((o) => Math.hypot(s.p[0] - o[0], s.p[1] - o[1]) < s.rng);
      const q: Pt[] = [[0, 0], ...(props.stations ?? []).map((s) => s.p), ...(pic.ships ?? []).filter(ours).map((s) => s.p)];
      const b = fitBox(q, 4);
      return { ...b, zw: Math.max(b.zw, 16) };
    },
    cca: () => fitRing([0, 0], 70),
    dep: () => fitBox([[0, 0] as Pt, ...plan.deps.map((r) => P(r, 50)), P(ship?.brc ?? 0, 10)], 3),
    app: () => {
      const q: Pt[] = [[0, 0], [-4, -5], [4, 9]];
      for (const m of plan.stacks) {
        const a = m.base + 15;
        q.push(P(m.r, a + 4.2 + 2.7), P(m.r + 14, a + 2), P(m.r - 14, a + 2));
      }
      if (ship) q.push(P(emergencyMarshalRadial(ship), 27), P(heloMarshalRadial(ship), 8));
      return fitBox(q, 3);
    },
  };
  // tBounds: the theatre itself: the view (as drawn north-up) stays inside it. dBounds: the chart data's
  // extent (the theatre plus a margin, from the data file); a track-up turn swings the view's corners into
  // that margin, and the view is also held inside it so a turn never shows past the chart. Outside a
  // known theatre the view stays within 100 NM.
  const bounds = useMemo(() => {
    const tb = tBox ?? (fTrack ? THEATRE_BOXES[theatreAt(fTrack.lat, fTrack.lon) ?? ''] : undefined);
    if (!tb || !pic.proj) return null;
    // a box's edges are curved in the carrier-centred projection: take the largest rectangle inside
    const at = (la: number, lo: number) => pic.proj!.toScope(la, lo);
    const k = Array.from({ length: 9 }, (_, i) => i / 8);
    const rect = ([s, w, n, e]: number[]) => {
      const x0 = Math.max(...k.map((f) => at(s + (n - s) * f, w)[0]));
      const x1 = Math.min(...k.map((f) => at(s + (n - s) * f, e)[0]));
      const y0 = Math.max(...k.map((f) => at(n, w + (e - w) * f)[1]));
      const y1 = Math.min(...k.map((f) => at(s, w + (e - w) * f)[1]));
      return x1 > x0 && y1 > y0 ? { x0, x1, y0, y1 } : null;
    };
    const t = rect(tb);
    // no chart drawn (its layers off): nothing to run off, so no footprint limit
    const d = marine ? rect(marine.bbox) : null;
    return t ? { t, d } : null;
    // re-derived when the carrier has moved a few NM (the projection is about it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tBox, Math.round((fTrack?.lat ?? 0) * 20), Math.round((fTrack?.lon ?? 0) * 20), !!pic.proj, marine?.bbox]);
  const tBounds = bounds?.t ?? null;
  const dBounds = bounds?.d ?? null;
  // the view's footprint on the map: its bounding box once turned (track up), per NM of view width
  const fpW = Math.abs(rCo) + asp * Math.abs(rSi);
  const fpH = Math.abs(rSi) + asp * Math.abs(rCo);
  /** widest view the chart allows (turned, its footprint must fit the data) */
  const maxW = (w: number) => Math.min(2 * MAX_RANGE_NM, dBounds ? Math.min(w, (dBounds.x1 - dBounds.x0) / fpW, (dBounds.y1 - dBounds.y0) / fpH) : w);
  const clampCore = (x: number, y: number, w: number) => {
    if (!tBounds) {
      const r = Math.hypot(x, y);
      const k = r > 100 ? 100 / r : 1;
      return { zx: x * k, zy: y * k };
    }
    const cl = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));
    // the view as drawn north-up stays inside the theatre (centred on it when the theatre is smaller) ...
    const zx = cl(x, tBounds.x0 + w / 2, tBounds.x1 - w / 2);
    const zy = cl(y, tBounds.y0 + (w * asp) / 2, tBounds.y1 - (w * asp) / 2);
    // ... and its turned footprint inside the chart data
    if (!dBounds) return { zx, zy };
    const fw = (w * fpW) / 2;
    const fh = (w * fpH) / 2;
    return { zx: cl(zx, dBounds.x0 + fw, dBounds.x1 - fw), zy: cl(zy, dBounds.y0 + fh, dBounds.y1 - fh) };
  };
  const FIT = fit ? fits[fit]() : null;
  // presets and the carrier lock can ask for a view past the theatre's edge: held inside it here too
  const VW = maxW(FIT ? FIT.zw : view.zw);
  const VC = clampCore(FIT ? FIT.zx : anc ? anc[0] : view.zx, FIT ? FIT.zy : anc ? anc[1] : view.zy, VW);
  const VX = VC.zx;
  const VY = VC.zy;
  const VH = VW * asp;
  const RC = rp([VX, VY]);
  // our carrier's rate of turn (deg/s, + right), from its heading over the last ~10 s of mission time
  const hdgLog = useRef<{ t: number; h: number }[]>([]);
  const turnRateNow = (() => {
    const t = props.mt;
    const h = fTrack?.hdg ?? fTrack?.crs;
    const L = hdgLog.current;
    if (t == null || h == null) return 0;
    if (L.length && t < L[L.length - 1].t) L.length = 0; // time ran backwards: a new run
    if (!L.length || t > L[L.length - 1].t) L.push({ t, h });
    while (L.length > 2 && L[0].t < t - 10) L.shift();
    const a = L[0];
    const b = L[L.length - 1];
    if (b.t - a.t < 3) return 0;
    const r = turnTo(a.h, b.h) / (b.t - a.t);
    return Math.abs(r) < 0.02 ? 0 : r;
  })();
  /** for a label offset from a point: turns it about the point so the offset is on screen, not on the map (with class "nr") */
  const upT = (p: Pt) => (ROT ? `rotate(${ROT} ${f2(p[0])} ${f2(p[1])})` : undefined);
  /** an along-line label angle (deg, map frame) flipped so it reads upright on the turned screen */
  const upAng = (a: number) => {
    const sa = ((((a - ROT) % 360) + 540) % 360) - 180;
    return sa > 90 || sa < -90 ? a + 180 : a;
  };
  const vx = RC[0] - VW / 2;
  const vy = RC[1] - VH / 2;
  const z = (VW / 97) * (860 / Math.max(300, box.w));
  const sH = UI_STEPS[ui.h - 1];
  const sT = UI_STEPS[ui.t - 1];
  const sL = LW_STEPS[ui.l - 1];
  const sO = UI_STEPS[ui.o - 1];
  const zkH = z * sH;
  const zkT = z * sT;
  const zkO = z * sO;
  const KX = box.w / VW;
  // Track up: the layers are drawn north-up in a square big enough for any turn, and the square is turned
  // by CSS as one composited layer (turning every shape inside the SVG made each pan/zoom frame re-raster
  // the whole turned picture). SV is the view those layers draw: unturned, about the view centre.
  const RD = ROT ? Math.ceil(Math.hypot(box.w, box.h)) : 0;
  const SV = ROT ? { x: VX - RD / KX / 2, y: VY - RD / KX / 2, w: RD / KX, h: RD / KX, bw: RD, bh: RD } : { x: vx, y: vy, w: VW, h: VH, bw: box.w, bh: box.h };
  // always a div (north up: the box itself, unturned), so switching modes never remounts the layers
  // preserve-3d matters in Firefox: with a plain 2D rotate it repaints the turned SVG on the main thread every
  // frame (measured ~40 ms a pan frame at 2500 px wide); as a 3D-context layer it paints unturned and the
  // compositor turns it (~3 ms). Chromium is fast either way.
  const rotorStyle: React.CSSProperties = ROT
    ? { position: 'absolute', left: (box.w - RD) / 2, top: (box.h - RD) / 2, width: RD, height: RD, transform: `rotate(${-ROT}deg)`, transformOrigin: '50% 50%', willChange: 'transform', transformStyle: 'preserve-3d', pointerEvents: 'none' }
    : { position: 'absolute', inset: 0, pointerEvents: 'none' };
  const rotor = (key: string, kids: React.ReactNode) => (
    <div key={key} style={rotorStyle}>
      {kids}
    </div>
  );
  const toPx = (q0: Pt): Pt => {
    const q = rp(q0);
    return [(q[0] - vx) * KX, (q[1] - vy) * KX];
  };
  const inView = (q0: Pt, pad = 0) => {
    const q = rp(q0);
    return q[0] >= vx - pad && q[0] <= vx + VW + pad && q[1] >= vy - pad && q[1] <= vy + VH + pad;
  };
  const clampC = (x: number, y: number, w: number = VW) => clampCore(x, y, w);
  const zoomBy = (k: number, about?: Pt) => {
    zoomedAt.current = performance.now();
    clearTimeout(zoomIdleT.current);
    zoomIdleT.current = setTimeout(() => setZoomIdle((n) => n + 1), 260);
    const nw = maxW(clampW(VW * k));
    // locked on the carrier: zoom about the view centre so the lock holds (only panning unlocks);
    // unlocked: zoom about the cursor and re-pin the new centre
    const c = lock ? [VX, VY] : (about ?? [VX, VY]);
    const nc = clampC(c[0] + ((VX - c[0]) * nw) / VW, c[1] + ((VY - c[1]) * nw) / VW, nw);
    setView({ zw: nw, ...nc });
    if (!lock) unlockAt(nc.zx, nc.zy);
    onFit(null);
  };
  useEffect(() => {
    if (!props.goTo) return;
    onFit(null);
    const g = props.goTo!;
    if (g.fit?.length) {
      // zoom to fit the encounter with margin (at least 8 NM across)
      const xs = g.fit.map((q) => q[0]);
      const ys = g.fit.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const zw = maxW(clampW(Math.max(8, (x1 - x0) * 1.8, ((y1 - y0) * 1.8) / asp)));
      const nc = clampC((x0 + x1) / 2, (y0 + y1) / 2, zw);
      setView({ zw, ...nc });
      unlockAt(nc.zx, nc.zy);
    } else {
      const nc = clampC(g.p[0], g.p[1]);
      setView((v) => ({ ...v, ...nc }));
      unlockAt(nc.zx, nc.zy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.goTo]);

  // ------------------------------------------------ lat/lon frame (mockup frame(); flat local plane)
  // bottom-left corner block (magnetic variation + range scale): a round scale length 60–150 px long
  const SCALE_NM = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const scaleNm = SCALE_NM.find((s) => s * KX >= 60) ?? 200;
  const cornerPx = 0.5 * z * KX + 8;
  const cornerW = Math.max(58, scaleNm * KX + 52) + 22;
  const cornerH = 102;
  const vc = pic.proj?.toLatLon([VX, VY]);
  const mv = vc ? magVar(vc.lat, vc.lon, 0, props.magYear ?? new Date().getUTCFullYear() + new Date().getUTCMonth() / 12) : null;
  // The frame is the screen rectangle (turned in track up) inset by half a grid step; parallels and
  // meridians are cut where they cross it, with ticks there along the line and labels just inside,
  // upright on screen. North up it is the mockup's frame: ticks on the edges, labels left/right and top/bottom.
  const frame = useMemo(() => {
    const x0 = vx + 0.5 * z;
    const x1 = vx + VW - 0.5 * z;
    const y0 = vy + 0.5 * z;
    const y1 = vy + VH - 0.5 * z;
    const lat0 = focus?.track.lat ?? 0;
    const lon0 = focus?.track.lon ?? 0;
    const SLAT = lat0 * 60;
    const SLON = lon0 * 60;
    const K = Math.cos((lat0 * Math.PI) / 180);
    const majS = VW > 160 ? 30 : 10;
    const minS = VW > 160 ? 10 : VW < 40 ? 1 : 2;
    // the frame's corners on the chart
    const poly = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[]).map(rpInv);
    const outline = `M${poly.map((q) => `${f2(q[0])} ${f2(q[1])}`).join('L')}Z`;
    const ys = poly.map((q) => q[1]);
    const xs = poly.map((q) => q[0]);
    // where the line {q : q[axis] = v} crosses the frame: its two ends, ordered along the other axis
    const cut = (axis: 0 | 1, v: number): [Pt, Pt] | null => {
      const hits: Pt[] = [];
      for (let i = 0; i < 4; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % 4];
        if ((a[axis] - v) * (b[axis] - v) > 0 || a[axis] === b[axis]) continue;
        const t = (v - a[axis]) / (b[axis] - a[axis]);
        hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      if (hits.length < 2) return null;
      const o = axis === 0 ? 1 : 0;
      hits.sort((p, q) => p[o] - q[o]);
      return [hits[0], hits[hits.length - 1]];
    };
    let ticks = '';
    let grid = '';
    type Lbl = { x: number; y: number; t: string; anchor: 'start' | 'middle' | 'end' };
    const labels: Lbl[] = [];
    const fmt = (m: number, w: number, pos: string, neg: string) => {
      const a = Math.abs(m);
      return `${String(Math.floor(a / 60)).padStart(w, '0')}°${String(Math.round(a % 60)).padStart(2, '0')}'${m >= 0 ? pos : neg}`;
    };
    const cornerX = x0 + (cornerW + 24) / KX;
    const cornerY = y1 - (cornerH + 16) / KX;
    const line = (ends: [Pt, Pt], maj: boolean, t: string) => {
      const [a, b] = ends;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 1e-9) return;
      const u: Pt = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
      const L = (maj ? 1.4 : 0.6) * z;
      ticks += `M${f2(a[0])} ${f2(a[1])}l${f2(u[0] * L)} ${f2(u[1] * L)}M${f2(b[0])} ${f2(b[1])}l${f2(-u[0] * L)} ${f2(-u[1] * L)}`;
      if (!maj) return;
      grid += `M${f2(a[0])} ${f2(a[1])}L${f2(b[0])} ${f2(b[1])}`;
      for (const [e, w] of [[a, u], [b, [-u[0], -u[1]] as Pt]] as [Pt, Pt][]) {
        // the inward direction as seen on screen picks the anchor and the inset
        const sw = rp(w);
        const horiz = Math.abs(sw[0]) >= Math.abs(sw[1]);
        const k = horiz ? 1.8 : sw[1] > 0 ? 2.4 : 1.7;
        const q: Pt = [e[0] + w[0] * k * z, e[1] + w[1] * k * z];
        const sq = rp(q);
        // clear of the frame's corners and of the corner block
        if (horiz ? sq[1] < y0 + 1.5 * z || sq[1] > y1 - 2.5 * z : sq[0] < x0 + 3 * z || sq[0] > x1 - 3 * z) continue;
        if (sq[0] < cornerX && sq[1] > cornerY) continue;
        labels.push({ x: q[0], y: q[1] + (horiz && !ROT ? 0.3 : 0), t, anchor: horiz ? (sw[0] > 0 ? 'start' : 'end') : 'middle' });
      }
    };
    for (let m = Math.ceil(SLAT - Math.max(...ys)); m <= Math.floor(SLAT - Math.min(...ys)); m++) {
      const maj = m % majS === 0;
      if (m % minS && !maj) continue;
      const ends = cut(1, -(m - SLAT));
      if (ends) line(ends, maj, fmt(m, 2, 'N', 'S'));
    }
    for (let m = Math.ceil(SLON + Math.min(...xs) / K); m <= Math.floor(SLON + Math.max(...xs) / K); m++) {
      const maj = m % majS === 0;
      if (m % minS && !maj) continue;
      const ends = cut(0, (m - SLON) * K);
      if (ends) line(ends, maj, fmt(m, 3, 'E', 'W'));
    }
    return { outline, ticks, grid, labels };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vx, vy, VW, VH, z, focus?.track.lat, focus?.track.lon, KX, cornerW, ROT]);

  // ------------------------------------------------ hooked tools
  const hooked = hookedId ? pic.air.find((t) => t.id === hookedId) : undefined;
  const nowS = props.nowS ?? 0;
  const stacks = useMemo(() => {
    if (!ship) return [] as (StackDef & { def: number })[];
    const all: StackDef[] = [...plan.stacks, { id: 'E', r: Math.round(emergencyMarshalRadial(ship)), base: 6, rh: true }].filter((m) => !plan.off?.includes(m.id));
    return all.map((st) => {
      const used = new Set([...assignments.entries()].filter(([id, a]) => a.stackId === st.id && a.carrier === hull && id !== hookedId).map(([, a]) => a.angels));
      let def = st.base;
      while (used.has(def) && def < st.base + 12) def++;
      return { ...st, def };
    });
  }, [plan.stacks, plan.off, ship, assignments, hull, hookedId]);
  const hitStack = (q: Pt | null) => {
    if (!q) return null;
    for (const st of stacks) {
      const l = rot(q, -st.r);
      const al = -l[1];
      const x = st.rh ? -l[0] : l[0];
      if (al >= st.base + 13 && al <= st.base + 15 + 12 + 6.5 && x >= -1.5 && x <= 6.8) return st;
    }
    return null;
  };
  // a track in a tight (collapsible) formation is targeted as the whole group: resolve to its lead
  const repOf = (id: string): string => pic.formations.find((f) => f.collapsible && f.members.some((m) => m.id === id))?.lead.id ?? id;
  // the focus carrier's reported weather drives the wind triangle and Mach aloft; absent (e.g. ACMI
  // playback) the day is ISA and calm, and every speed tool degrades to still-air groundspeed = TAS
  const focusWx = pic.focus?.track.wx;
  const windAt = (altFt: number): Pt => (focusWx ? windVecKt(wxWindLayers(focusWx), altFt) : [0, 0]);
  const slTempK = focusWx?.tK ?? ISA_SL_K;
  const qnhPa = focusWx?.qnh ?? undefined;
  // one interceptor → one target intercept: the lead-collision vector to the visual point (10 NM short)
  // plus the stern conversion into the six. `spdOverride` is the wheel-set commanded speed (active only).
  const makeIntercept = (interceptor: ScopeTrack, tgt: ScopeTrack, spdOverride?: number) => {
    const tgtGs = tgt.gs ?? 0;
    const crsE = smoothedCourse(tgt);
    const hdg = interceptor.crs ?? interceptor.hdg ?? 0;
    // default commanded speed: a brisk MIL-power intercept (≥ ~420 kt, with ≥ 80 kt margin over the
    // contact for real closure), not the interceptor's current loiter speed; the wheel overrides it
    // the controller commands a CALIBRATED airspeed (what the pilot flies); the solver works in TAS,
    // so CAS is converted at the merge altitude (the interceptor is vectored to the contact's angels).
    // The default is seeded from a brisk true intercept speed (≥ ~420 KTAS, ≥ 80 kt over the contact)
    // expressed back as CAS. Wind at that altitude makes the geometry wind-correct; Mach follows.
    const altFt = tgt.alt ?? interceptor.alt ?? 0;
    const wind = windAt(altFt);
    const tempK = tempAtAltK(slTempK, altFt);
    const defTas = Math.max(240, Math.min(900, Math.round(Math.max(interceptor.gs ?? 350, tgtGs + 80, 420) / 10) * 10));
    const defCas = Math.round(tasToCasKt(defTas, altFt, slTempK, qnhPa) / 10) * 10;
    const cas = spdOverride ?? Math.max(240, Math.min(900, defCas));
    const tas = casToTasKt(cas, altFt, slTempK, qnhPa);
    const mach = machFromTasKt(tas, tempK);
    // the interceptor's current TAS from its observed groundspeed and the wind at altitude
    const v0 = Math.max(80, len(sub(mul(dir(hdg), Math.max(80, interceptor.gs ?? tas)), wind)));
    const sol = interceptSolve({ p0: interceptor.p, h0: hdg, v0, vSet: tas, rates: accelRatesKtS(interceptor.ty), pe: tgt.p, crsE, gsE: tgtGs, standoffNm: 10, wind });
    const stern = sol.ok ? sternConversion({ p0: sol.rejoin, h0: sol.steerHdg, vKt: tas, pe: tgt.p, crsE, gsE: tgtGs, t0S: sol.eteS, trailNm: 1, wind }) : null;
    return { interceptor, tgt, sol, stern, spd: cas, mach };
  };
  const toolActive = tool === 'marshal' || tool === 'vec' || tool === 'int';
  const hk = useMemo(() => {
    if (!hooked || placement.placing || !toolActive) return null;
    const hdg = hooked.crs ?? hooked.hdg ?? 0;
    // intercept: the interceptee is the locked target, else the track under the cursor; vector the
    // hooked aircraft to a rejoin 10 NM short of a lead-collision, at the commanded speed (wheel)
    if (tool === 'int') {
      const tgtId = props.locks[hooked.id] ?? (acHov ? repOf(acHov) : undefined);
      const tgt = tgtId && tgtId !== hooked.id ? pic.air.find((t) => t.id === tgtId) : undefined;
      if (!tgt) return null;
      return { kind: 'int' as const, ...makeIntercept(hooked, tgt, vspd ?? undefined), locked: !!props.locks[hooked.id] };
    }
    if (!cur) return null;
    const spd = vspd ?? Math.max(150, Math.min(650, Math.round((hooked.gs ?? 300) / 10) * 10));
    const st = tool === 'marshal' ? hitStack(cur) : null;
    if (st) {
      const ang = asg && asg.id === st.id ? asg.ang : st.def;
      // the aircraft slows to its max-endurance speed before the hold; the entry is flown at that
      // speed (true airspeed at the fix altitude) with 1-minute legs and 2-minute 180° turns
      const holdTas = Math.round(tasFromIas(maxEnduranceKias(hooked.ty), ang * 1000));
      const spec = holdSpecForTas(holdTas);
      const route = marshalRoute(hooked.p, hdg, spd, st.r, fixDme(ang), st.rh ? 'right' : 'left', spec);
      // the transit is flown into the wind at the fix altitude: + tailwind shortens the time to the fix
      const wAlong = windAlongKt(windAt(ang * 1000), bearingOf(sub(route.fix, hooked.p)));
      const fixS = nowS + marshalTimeS(route, spd, holdTas, wAlong);
      const prev = [...assignments.entries()].filter(([id, a]) => a.stackId === st.id && a.carrier === hull && id !== hooked.id).map(([, a]) => a.eatS);
      const eatS = eatOf(fixS, prev.length ? Math.max(...prev) : undefined);
      return { kind: 'marshal' as const, st, ang, route, fixS, eatS, spd, holdKias: maxEnduranceKias(hooked.ty), spec };
    }
    // the vector is wind-corrected: the aircraft crabs to track to the point, so the drawn path, the
    // steer heading and the ETE account for the wind at its altitude (commanded speed read as a TAS)
    const fl = fly(hooked.p, hdg, cur, turnRadiusNm(spd), { wind: windAt(hooked.alt ?? 0), vKt: spd });
    return { kind: 'vec' as const, fl, spd, brg: bearingOf(sub(cur, hooked.p)), rng: len(sub(cur, hooked.p)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooked, cur, vspd, asg, stacks, tool, placement.placing, nowS, assignments, hull, acHov, pic.air, props.locks]);

  // every committed / locked intercept (interceptor → target), as geometry to draw alongside the
  // active one. The active pair is flagged so the renderer can give it the full tag.
  const intList = useMemo(() => {
    if (tool !== 'int') return [] as { key: string; committed: boolean; active: boolean; ic: ReturnType<typeof makeIntercept> }[];
    const out: { key: string; committed: boolean; active: boolean; ic: ReturnType<typeof makeIntercept> }[] = [];
    const seen = new Set<string>();
    const add = (interceptorId: string, targetId: string, committed: boolean) => {
      if (seen.has(interceptorId)) return;
      seen.add(interceptorId);
      const a = pic.air.find((t) => t.id === interceptorId);
      const b = pic.air.find((t) => t.id === targetId);
      if (!a || !b) return;
      const active = interceptorId === hookedId;
      out.push({ key: interceptorId, committed, active, ic: makeIntercept(a, b, active ? vspd ?? undefined : undefined) });
    };
    for (const [i, t] of Object.entries(props.locks)) add(i, t, false);
    for (const [i, t] of Object.entries(props.intercepts)) add(i, t, true);
    return out;
    // makeIntercept is recreated each render; its real inputs (picture, locks, wheel speed) are listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, props.locks, props.intercepts, pic.air, pic.focus, hookedId, vspd]);

  // ------------------------------------------------ input
  const svgPoint = (e: { clientX: number; clientY: number }): Pt | null => {
    // from the view itself (toPx inverted): the SVG's screen CTM misses the track-up CSS turn in Chrome
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return null;
    return rpInv([(e.clientX - r.left) / KX + vx, (e.clientY - r.top) / KX + vy]);
  };
  /** Placement bearing: 5° steps, or 1° while Ctrl is held (fine tuning). */
  const bearingAt = (q: Pt | null, fine = false) => {
    if (!q || Math.hypot(q[0], q[1]) < 3) return null;
    const step = fine ? 1 : 5;
    return ((Math.round(bearingOf(q) / step) * step) % 360 + 360) % 360;
  };
  // Pressing or releasing Ctrl re-snaps the candidate without moving the mouse.
  const placeRef = useRef({ placing: placement.placing, hov: placement.hov, cur, onPlaceHover: props.onPlaceHover });
  placeRef.current = { placing: placement.placing, hov: placement.hov, cur, onPlaceHover: props.onPlaceHover };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      const L = placeRef.current;
      if (!L.placing || !L.cur) return;
      const b = bearingAt(L.cur, e.type === 'keydown');
      if (b !== L.hov) L.onPlaceHover(b);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  /**
   * Coordination-line placement: the line is perpendicular to the bearing from our carrier to the
   * cursor, at the cursor's range (1° / 0.1 NM).
   */
  const coordAt = (q: Pt) => {
    const pc = placement.coord;
    const c = pc && pic.carriers.find((x) => x.track.hull === pc.hull);
    if (!pc || !c) return null;
    const theta = Math.round(bearingOf(q)) % 360;
    const range = Math.round(len(q) * 10) / 10;
    const brg = (theta + 90) % 180;
    const g = coordGeom({ brg, off: 0 }, [0, 0], c.track.p);
    const toward = dir(theta);
    const sign = toward[0] * g.n[0] + toward[1] * g.n[1] >= 0 ? 1 : -1;
    return { hull: pc.hull, brg, off: sign * range };
  };

  const latest = useRef({ VX, VY, VW, fmHov, fmSel, hooked, cur, hk, placing: placement.placing, formations: pic.formations, zoomBy, svgPoint });
  latest.current = { VX, VY, VW, fmHov, fmSel, hooked, cur, hk, placing: placement.placing, formations: pic.formations, zoomBy, svgPoint };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const L = latest.current;
      const up = e.deltaY < 0 ? 1 : -1;
      // intercept: the wheel sets the commanded speed, even over a formation (the group is targeted as
      // one, so cycling its members would be wrong) — this takes priority over formation cycling
      if (L.hooked && !L.placing && L.hk && L.hk.kind === 'int') {
        setVspd(Math.max(240, Math.min(900, L.hk.spd + up * 10)));
        return;
      }
      if (L.fmHov && !L.placing) {
        const f = L.formations.find((x) => x.id === L.fmHov);
        if (f) {
          const n = f.members.length + 1;
          setFmSel((s) => ({ ...s, [f.id]: ((s[f.id] ?? 0) + (e.deltaY > 0 ? 1 : -1) + n) % n }));
          return;
        }
      }
      if (L.hooked && L.cur && !L.placing && L.hk) {
        if (L.hk.kind === 'marshal') {
          const st = L.hk.st;
          setAsg({ id: st.id, ang: Math.max(st.base, Math.min(st.base + 12, L.hk.ang + up)) });
        } else setVspd(Math.max(150, Math.min(L.hk.kind === 'int' ? 900 : 650, L.hk.spd + up * 10)));
        return;
      }
      // the current render's conversion (track-up turns it)
      const q = L.svgPoint(e);
      if (q) L.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, q);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const k = KX;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const cx = VX;
    const cy = VY;
    const w = VW;
    let moved = false;
    dragged.current = false;
    const mv = (ev: MouseEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) {
        moved = true;
        setPanning(true);
      }
      onFit(null);
      const d = rpInv([dx / k, dy / k]);
      const nc = clampC(cx - d[0], cy - d[1], w);
      setView({ zw: w, ...nc });
      unlockAt(nc.zx, nc.zy);
    };
    const upH = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', upH);
      if (moved) {
        dragged.current = true;
        setPanning(false);
        setTimeout(() => (dragged.current = false), 0);
      }
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', upH);
    e.preventDefault();
  };
  const nearestTrack = (q: Pt): ScopeTrack | undefined => {
    let best: ScopeTrack | undefined;
    let bd = 1.6 * zkH;
    for (const t of pic.air) {
      const d = Math.hypot(t.p[0] - q[0], t.p[1] - q[1]);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  const onClick = (e: React.MouseEvent) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const q = svgPoint(e);
    if (!q) return;
    if (placement.placing === 'coord') {
      const c = coordAt(q);
      if (c) props.onCoordCommit(c);
      return;
    }
    if (placement.placing) {
      const b = bearingAt(q, e.ctrlKey);
      if (b != null && !props.checkRadial(b).err) props.onPlaceClick(b);
      return;
    }
    if (tool === 'wp') {
      if (props.onPlotWaypoint && pic.proj) {
        const ll = pic.proj.toLatLon(q);
        props.onPlotWaypoint(ll.lat, ll.lon);
      }
      return;
    }
    if (tool === 'bra') {
      const t = nearestTrack(q);
      const end: Pt | string = t ? t.id : q;
      if (!bra || bra.b) setBra({ a: end, b: null });
      else setBra({ a: bra.a, b: end });
      return;
    }
    if (tool === 'cpa') {
      const t = nearestTrack(q);
      if (!t) return;
      if (!probe || probe.b) setProbe({ a: t.id, b: null });
      else if (t.id !== probe.a) setProbe({ a: probe.a, b: t.id });
      return;
    }
    if (tool === 'int') {
      const t = nearestTrack(q);
      if (!t) return;
      if (!hookedId || t.id === hookedId) return void onHook(t.id === hookedId ? null : t.id); // hook / unhook the interceptor
      if (props.locks[hookedId]) return void onHook(t.id); // this interceptor is locked: start a new one on the clicked track
      props.onLock(hookedId, repOf(t.id)); // lock the hooked interceptor to this target (its group lead)
      return;
    }
    if (hk?.kind === 'marshal' && hooked) {
      props.onAssign(hooked.id, { stackId: hk.st.id, angels: hk.ang, eatS: hk.eatS, fixS: hk.fixS, carrier: hull });
      onHook(null);
      return;
    }
    const t = nearestTrack(q);
    if (t) {
      const f = pic.formations.find((x) => x.lead.id === t.id && x.collapsible);
      if (f && !(fmSel[f.id] ?? 0)) setFmSel((s) => ({ ...s, [f.id]: 1 }));
      onHook(hookedId === t.id ? null : t.id);
      return;
    }
    if (hookedId) onHook(null);
  };
  const onMove = (e: React.MouseEvent) => {
    const q = svgPoint(e);
    if (!q) return;
    setCur(q);
    if (placement.placing === 'coord') {
      const c = coordAt(q);
      if (c) props.onCoordPreview(c);
      return;
    }
    if (placement.placing) {
      const b = bearingAt(q, e.ctrlKey);
      if (b !== placement.hov) props.onPlaceHover(b);
      return;
    }
    const f = pic.formations.find((x) => x.collapsible && Math.hypot(q[0] - x.lead.p[0], q[1] - x.lead.p[1]) < 1.6 * zkH);
    const id = f?.id ?? null;
    if (id !== fmHov) setFmHov(id);
    let near: string | null = null;
    let nd = 1.4 * zkH;
    for (const t of pic.air) {
      const d = Math.hypot(q[0] - t.p[0], q[1] - t.p[1]);
      if (d < nd) {
        nd = d;
        near = t.id;
      }
    }
    if (near !== acHov) setAcHov(near);
  };
  const onLeave = () => {
    setCur(null);
    setFmHov(null);
    if (placement.placing) props.onPlaceHover(null);
  };

  // ------------------------------------------------ derived traffic sets
  const conflictIds = new Set(pic.conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const isBlue = (t: ScopeTrack) => !!t.owner && t.owner !== hull;
  const fmInfo = new Map<string, { f: Formation; sel: number }>();
  const hidden = new Set<string>();
  for (const f of pic.formations) {
    if (!f.collapsible) continue;
    if (f.members.some((m) => conflictIds.has(m.id))) continue;
    const sel = fmSel[f.id] ?? 0;
    fmInfo.set(f.lead.id, { f, sel });
    if (!sel) for (const m of f.members) if (m !== f.lead) hidden.add(m.id);
  }

  // ------------------------------------------------ overlay pieces per carrier
  /**
   * Case I port holding: a left-hand circle 5 NM across on the port side, its 3 o'clock (position 1)
   * offset 0.5 NM to starboard of the ship so pilots crossing 1 see the deck down their left side
   * (offset as drawn in the squadron's Case I diagram; not checked against CV NATOPS). Positions are numbered in the direction of flight from overhead the ship: 1 overhead
   * (heading the BRC), 2 ahead, 3 abeam to port (reciprocal), 4 astern. Commence from 3 on BRC + 210°
   * (30° right of the downwind heading), descending to 800 ft and accelerating to 350 kt, then a
   * left turn rolling out on the BRC at the initial, 3 NM astern.
   */
  const portHold = (c: Carrier) => {
    const C = '#9FD9A8';
    const R = 2.5;
    const b = c.ship.brc * D2R;
    const u: Pt = [Math.sin(b), -Math.cos(b)];
    const l: Pt = [-Math.cos(b), -Math.sin(b)];
    const s = c.track.p;
    const OFF = 0.5;
    const o = add(s, mul(l, R - OFF));
    // flight order from overhead: directions from the circle's centre
    const dirs: Pt[] = [mul(l, -1), u, l, mul(u, -1)];
    const pos = dirs.map((d) => add(o, mul(d, R)));
    // ship frame: x to starboard, y along the BRC
    const at = (x: number, y: number): Pt => add(s, add(mul(l, -x), mul(u, y)));
    // commence, flown accelerating from 250 to 350 kt: leave the orbit at 3 (heading the reciprocal)
    // with a 30° right turn at the 250 kt radius onto BRC + 210°, straight, then a left turn at the
    // 350 kt radius onto the BRC; the straight leg is sized so the turn rolls out on the BRC line,
    // which leads on to the initial (3 NM astern)
    const r1 = turnRadiusNm(250);
    const r2 = turnRadiusNm(350);
    const th = 210 * D2R;
    const [sn, cs] = [Math.sin(th), Math.cos(th)];
    // end of the fillet: turned 30° right about (-5 - r1, 0)
    const qx = OFF - 5 - r1 + r1 * Math.cos(30 * D2R);
    const qy = -r1 * Math.sin(30 * D2R);
    const L = Math.max(0, (qx + r2 * (1 - cs)) / -sn);
    const p0 = at(OFF - 5, 0);
    const q = at(qx, qy);
    const p1x = qx + L * sn;
    const p1y = qy + L * cs;
    const p1 = at(p1x, p1y);
    const e = at(p1x + r2 * (1 - cs), p1y + r2 * sn);
    const initial = at(0, -3);
    return (
      <g key={`ph${c.track.id}`} style={{ pointerEvents: 'none' }}>
        <circle cx={f2(o[0])} cy={f2(o[1])} r={R} fill="none" stroke={C} strokeOpacity="0.75" style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} />
        <path d={`M${f2(p0[0])} ${f2(p0[1])}A${f2(r1)} ${f2(r1)} 0 0 1 ${f2(q[0])} ${f2(q[1])}L${f2(p1[0])} ${f2(p1[1])}A${f2(r2)} ${f2(r2)} 0 1 0 ${f2(e[0])} ${f2(e[1])}L${f2(initial[0])} ${f2(initial[1])}`} fill="none" stroke={C} strokeOpacity="0.9" strokeDasharray="5 4" style={{ strokeWidth: 'calc(2px * var(--lw, 1))' }} />
        {pos.map((p, i) => {
          // left-hand flow: the direction of flight at each position is the radius turned 90° left
          const d = dirs[i];
          const fwd: Pt = [d[1], -d[0]];
          const lab = add(p, mul(d, 1.1 * zkO));
          const a = add(p, mul(fwd, 0.45 * zkO));
          const w1 = add(p, add(mul(fwd, -0.15 * zkO), mul(d, 0.35 * zkO)));
          const w2 = add(p, add(mul(fwd, -0.15 * zkO), mul(d, -0.35 * zkO)));
          return (
            <g key={i}>
              <path d={`M${f2(w1[0])} ${f2(w1[1])}L${f2(a[0])} ${f2(a[1])}L${f2(w2[0])} ${f2(w2[1])}`} fill="none" stroke={C} strokeLinejoin="round" style={{ strokeWidth: 'calc(1.6px * var(--lw, 1))' }} />
              <g className="zs" transform={zs(lab, zkO)}>
                <circle cx={f2(lab[0])} cy={f2(lab[1])} r="0.62" fill="#0B0E12" stroke={C} style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} />
                <text x={f2(lab[0])} y={f2(lab[1])} textAnchor="middle" dominantBaseline="central" style={{ fill: C, fontSize: '0.8px', fontWeight: 600 }}>
                  {i + 1}
                </text>
              </g>
            </g>
          );
        })}
        <g className="zs" transform={zs(initial, zkO)}>
          <circle cx={f2(initial[0])} cy={f2(initial[1])} r="0.3" fill={C} />
        </g>
      </g>
    );
  };

  /** Escort stations about the carrier: sectors and points in true bearings (relative + BRC), each unit's label, a dotted leader when off station. */
  const csgOverlay = (c: Carrier) => {
    const brc = c.ship.brc;
    const at = (relB: number, r: number) => add(c.track.p, P(brc + relB, r));
    return (
      <g key="csg" style={{ pointerEvents: 'none' }}>
        {(props.stations ?? []).map((s, i) => {
          const st = s.st;
          const cen = stationCentre(st);
          const ok = s.state.t === 'ON STA';
          let d = '';
          if (st.kind === 'sector') {
            const w = sectorWidth(st);
            const lg = w > 180 ? 1 : 0;
            const a = at(st.b0, st.r1);
            const b = at(st.b0 + w, st.r1);
            const cc = at(st.b0 + w, st.r0);
            const dd = at(st.b0, st.r0);
            d = `M${f2(dd[0])} ${f2(dd[1])}L${f2(a[0])} ${f2(a[1])}A${st.r1} ${st.r1} 0 ${lg} 1 ${f2(b[0])} ${f2(b[1])}L${f2(cc[0])} ${f2(cc[1])}A${st.r0} ${st.r0} 0 ${lg} 0 ${f2(dd[0])} ${f2(dd[1])}Z`;
          }
          const q = cen ? at(cen.b, cen.r) : null;
          return (
            <g key={i}>
              {d && <path d={d} fill="rgba(62,155,212,.07)" stroke="rgba(62,155,212,.55)" strokeDasharray="4 3" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />}
              {st.kind === 'point' && q && (
                <g className="zs" transform={zs(q, zkO)}>
                  <circle cx={f2(q[0])} cy={f2(q[1])} r="0.45" fill="none" stroke="#3E9BD4" style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} />
                </g>
              )}
              {q && !ok && <line x1={f2(s.p[0])} y1={f2(s.p[1])} x2={f2(q[0])} y2={f2(q[1])} stroke="#E7B04F" strokeOpacity="0.8" strokeDasharray="2 3" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />}
              {q && (
                <g className="zs" transform={zs(q, zkO)}>
                  <text className="nr" transform={upT(q)} x={f2(q[0])} y={f2(q[1] + (st.kind === 'point' ? -0.9 : 0))} textAnchor="middle" dominantBaseline="central" stroke="#0B0E12" style={{ fill: ok ? '#6FB6E6' : '#E7B04F', fontSize: '0.8px', fontWeight: 600, letterSpacing: '0.04em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                    {`${s.label} · ${s.state.t}`}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  const carrierOverlays = (c: Carrier) => {
    const blue = !c.focus;
    const o = blue ? ov2 : ov;
    const D = c.ship.brc - MOCK_BRC;
    const T = `translate(${f2(c.track.p[0])} ${f2(c.track.p[1])}) rotate(${f2(D)})`;
    const col = (white: string, b: string) => (blue ? b : white);
    const cr = (x: number, y: number) => `rotate(${f2(ROT - D)} ${x} ${y})`; // keep text upright on screen (with class "nr")
    const lw = (n: number) => ({ strokeWidth: `calc(${n}px * var(--lw, 1))` });
    const plan = plans[c.track.hull ?? ''] ?? { deps: [], stacks: [] };
    const shipAt = (q: Pt[]) => q.map((p) => add(p, c.track.p));
    const emr = emergencyMarshalRadial(c.ship);
    const hel = heloMarshalRadial(c.ship);
    const fixHash = (r: number, a: number) => {
      const cq = add(P(r, a + 15), c.track.p);
      const n: Pt = [Math.cos((r * Math.PI) / 180) * 0.55 * zkO, Math.sin((r * Math.PI) / 180) * 0.55 * zkO];
      return `M${f2(cq[0] - n[0])} ${f2(cq[1] - n[1])}L${f2(cq[0] + n[0])} ${f2(cq[1] + n[1])}`;
    };
    const editingM = c.focus && placement.editing?.k === 'm' ? placement.editing.id : null;
    const liveStacks = plan.stacks.filter((m) => m.id !== editingM && !plan.off?.includes(m.id));
    const eOn = !plan.off?.includes('E');
    const hOn = !plan.off?.includes('H');
    return (
      <g key={`ov${c.track.id}`}>
        {o.brc && (
          <g transform={T}>
            <g transform="rotate(345)">
              <line style={lw(1)} x1={f2(0.1735 * zkH)} y1={f2(-1.4 * zkH)} x2={f2(0.1735 * zkH)} y2="-9" stroke={col('rgba(230,237,243,.6)', 'rgba(62,155,212,.6)')} />
            </g>
          </g>
        )}
        {o.fb && (
          <g transform={T}>
            <line style={lw(1)} x1="0" y1="0" x2="-4.47" y2="-10.05" stroke={col('rgba(230,237,243,.45)', 'rgba(62,155,212,.45)')} strokeDasharray="2 3" />
            <line style={lw(1.2)} x1={f2(FB_U[0] * IFLOLS_NM)} y1={f2(FB_U[1] * IFLOLS_NM)} x2="6.1" y2="13.7" stroke={col('rgba(230,237,243,.55)', 'rgba(62,155,212,.55)')} />
            {(() => {
              // IFLOLS: the ball (dot) with the green datum lights either side, perpendicular to the final bearing
              const q: Pt = [FB_U[0] * IFLOLS_NM, FB_U[1] * IFLOLS_NM];
              const n: Pt = [-FB_U[1], FB_U[0]];
              const seg = (a: number, b: number) => `M${f2(q[0] + n[0] * a)} ${f2(q[1] + n[1] * a)}L${f2(q[0] + n[0] * b)} ${f2(q[1] + n[1] * b)}`;
              return (
                <g className="zs" transform={`translate(${f2(q[0])} ${f2(q[1])}) scale(${zkO.toFixed(4)}) translate(${f2(-q[0])} ${f2(-q[1])})`}>
                  <path style={lw(1.4)} d={seg(0.32, 0.85) + seg(-0.32, -0.85)} stroke={col('rgba(230,237,243,.85)', 'rgba(62,155,212,.85)')} strokeLinecap="round" />
                  <circle cx={f2(q[0])} cy={f2(q[1])} r="0.17" fill={col('#E6EDF3', '#3E9BD4')} />
                </g>
              );
            })()}
            <g style={lw(1)} stroke={col('rgba(230,237,243,.7)', 'rgba(62,155,212,.7)')}>
              <g className="zs" transform={`translate(1.22 2.74) scale(${zkO.toFixed(4)}) translate(-1.22 -2.74)`}><line x1="0.95" y1="2.86" x2="1.49" y2="2.62" /></g>
              <g className="zs" transform={`translate(2.44 5.48) scale(${zkO.toFixed(4)}) translate(-2.44 -5.48)`}><line x1="2.17" y1="5.6" x2="2.71" y2="5.36" /></g>
              <g className="zs" transform={`translate(4.07 9.14) scale(${zkO.toFixed(4)}) translate(-4.07 -9.14)`}><line x1="3.8" y1="9.26" x2="4.34" y2="9.02" /></g>
            </g>
          </g>
        )}
        {o.bolter && (
          <g transform={T} style={lw(1)} fill="none" stroke={col('rgba(222,154,31,.75)', 'rgba(62,155,212,.75)')}>
            <path d="M0 0 L-1.63 -3.65 C-2.17 -4.87 -4.0 -4.06 -3.46 -2.84 L1.43 8.12" strokeDasharray="3 3" />
            <path d="M-0.2 4.47 C0.34 5.69 2.17 4.88 1.63 3.66" />
            <path d="M0.61 6.29 C1.15 7.51 2.98 6.7 2.44 5.48" strokeDasharray="2 2" />
            <path d="M1.43 8.12 C1.97 9.34 3.8 8.53 3.26 7.31" strokeDasharray="2 2" />
            {[
              [-0.2, 4.47, '4'],
              [0.61, 6.29, '6'],
              [1.43, 8.12, '8'],
            ].map(([x, y, t]) => (
              <g key={t as string} className="zs" transform={`translate(${x} ${y}) scale(${zkO.toFixed(4)}) translate(${-(x as number)} ${-(y as number)})`}>
                <circle cx={x} cy={y} r="0.25" fill={col('#DE9A1F', '#5AAEE3')} stroke="none" />
                {!blue && (
                  <text x={(x as number) - 0.75} y={(y as number) + 0.28} textAnchor="end" stroke="none" className="nr" transform={cr(x as number, y as number)} style={{ fill: '#E7B04F' }}>
                    {t}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}
        {o.sar && (
          <g transform={T}>
            <g transform="rotate(345)">
              <circle style={lw(1)} cx="0" cy="0" r="10" fill="none" stroke={col('rgba(222,154,31,.35)', 'rgba(62,155,212,.35)')} strokeDasharray="3 3" />
              <circle style={lw(1)} cx="0" cy="0" r="5" fill="none" stroke={col('rgba(222,154,31,.5)', 'rgba(62,155,212,.5)')} />
              <circle style={lw(1)} cx="0" cy="0" r="1" fill={col('rgba(222,154,31,.16)', 'rgba(62,155,212,.16)')} stroke={col('rgba(222,154,31,.7)', 'rgba(62,155,212,.7)')} />
              <path style={lw(0.8)} d="M-0.342 -0.94 L-1.71 -4.7 A5 5 0 0 1 1.71 -4.7 L0.342 -0.94 A1 1 0 0 0 -0.342 -0.94 Z" fill={col('rgba(222,154,31,.14)', 'rgba(62,155,212,.14)')} stroke={col('rgba(222,154,31,.6)', 'rgba(62,155,212,.6)')} />
              <path style={lw(0.8)} d="M0.5 0.866 L1.5 2.598 A3 3 0 0 1 -0.521 2.954 L-0.174 0.985 A1 1 0 0 0 0.5 0.866 Z" fill={col('rgba(222,154,31,.14)', 'rgba(62,155,212,.14)')} stroke={col('rgba(222,154,31,.6)', 'rgba(62,155,212,.6)')} />
              {!blue && (
                <g textAnchor="middle" style={{ fontSize: 'calc(0.7px * var(--z, 1))' }}>
                  {[
                    [0, -7.4, '200′'],
                    [-3.2, 0.25, '300′'],
                    [3.2, 0.25, '400′'],
                    [-7.6, 0.25, '400′'],
                    [7.6, 0.25, '400′'],
                    [0, 7.6, '400′'],
                  ].map(([x, y, t], i) => (
                    <text key={i} x={x} y={y} className="nr" transform={`rotate(${f2(ROT - c.ship.brc)} ${x} ${y})`} style={{ fill: '#E7B04F' }}>
                      {t}
                    </text>
                  ))}
                </g>
              )}
            </g>
          </g>
        )}
        {o.cv1 && (
          <g transform={T}>
            <g transform="rotate(336)">
              <g className="zs" transform={`translate(0 1.3) scale(${zkO.toFixed(4)}) translate(0 -1.3)`}>
                <path style={lw(1)} d="M-0.35 2 L0 1.3 L0.35 2" fill="none" stroke={col('rgba(230,237,243,.7)', 'rgba(62,155,212,.7)')} />
              </g>
              <g style={lw(1)} stroke={col('rgba(230,237,243,.7)', 'rgba(62,155,212,.7)')}>
                <g className="zs" transform={`translate(0 10) scale(${zkO.toFixed(4)}) translate(0 -10)`}><line x1="-0.45" y1="10" x2="0.45" y2="10" /></g>
                <g className="zs" transform={`translate(0 6) scale(${zkO.toFixed(4)}) translate(0 -6)`}><line x1="-0.45" y1="6" x2="0.45" y2="6" /></g>
                <g className="zs" transform={`translate(0 3) scale(${zkO.toFixed(4)}) translate(0 -3)`}><path d="M-0.3 2.7 L0.3 3.3 M0.3 2.7 L-0.3 3.3" /></g>
              </g>
            </g>
          </g>
        )}
        {o.cv2 && (
          <g transform={`${T} rotate(336)`}>
            <path style={lw(1)} d="M2 -3.46 L3 -5.2 A0.6 0.6 0 0 1 4.04 -4.6 L3.04 -2.86 A0.6 0.6 0 0 1 2 -3.46 Z" fill="none" stroke={col('rgba(201,211,221,.7)', 'rgba(62,155,212,.7)')} />
            <path style={lw(1.8)} d="M2 -3.46 L0 0 L-5 8.66 C-7 12.1 0 14 0 10" fill="none" stroke={col('rgba(201,211,221,.75)', 'rgba(62,155,212,.75)')} strokeLinecap="round" strokeDasharray="0.1 3" />
            <path style={lw(1.1)} d="M0 10 L0 1.3" fill="none" stroke={col('rgba(201,211,221,.6)', 'rgba(62,155,212,.6)')} />
            <g style={lw(1)} stroke={col('rgba(201,211,221,.7)', 'rgba(62,155,212,.7)')}>
              <g className="zs" transform={`translate(-2 3.465) scale(${zkO.toFixed(4)}) translate(2 -3.465)`}><line x1="-2.39" y1="3.24" x2="-1.61" y2="3.69" /></g>
              <g className="zs" transform={`translate(2 -3.465) scale(${zkO.toFixed(4)}) translate(-2 3.465)`}><line x1="1.61" y1="-3.69" x2="2.39" y2="-3.24" /></g>
              <g className="zs" transform={`translate(0 3) scale(${zkO.toFixed(4)}) translate(0 -3)`}><path d="M-0.3 2.7 L0.3 3.3 M0.3 2.7 L-0.3 3.3" /></g>
            </g>
            {!blue && (
              <>
                <text x="-6.4" y="7.4" className="nr" transform={`rotate(${f2(ROT - c.ship.fb)} -6.4 7.4)`} style={{ fill: '#C9D3DD' }}>CV-2</text>
                <text x="2.6" y="-2.6" className="nr" transform={`rotate(${f2(ROT - c.ship.fb)} 2.6 -2.6)`} style={{ fill: '#93A1B0' }}>IAF</text>
              </>
            )}
          </g>
        )}
        {o.cv3 && (
          <g transform={`${T} rotate(336)`}>
            <path style={lw(1)} d="M6.58 2.39 L8.46 3.08 A0.5 0.5 0 0 1 8.12 4.02 L6.24 3.33 A0.5 0.5 0 0 1 6.58 2.39 Z" fill="none" stroke={col('rgba(201,211,221,.7)', 'rgba(62,155,212,.7)')} />
            <path style={lw(1.1)} d="M6.58 2.39 L2.82 1.03 A3 3 0 0 1 0 3 L0 1.3" fill="none" stroke={col('rgba(201,211,221,.7)', 'rgba(62,155,212,.7)')} />
            <g className="zs" transform={`translate(0 3) scale(${zkO.toFixed(4)}) translate(0 -3)`}>
              <path style={lw(1)} d="M-0.3 2.7 L0.3 3.3 M0.3 2.7 L-0.3 3.3" stroke={col('rgba(201,211,221,.7)', 'rgba(62,155,212,.7)')} />
            </g>
            {!blue && <text x="6.4" y="1.7" className="nr" transform={`rotate(${f2(ROT - c.ship.fb)} 6.4 1.7)`} style={{ fill: '#C9D3DD' }}>CV-3 IAF</text>}
          </g>
        )}
        {o.tanker && (
          <g transform={`${T} rotate(345)`}>
            <path style={lw(1)} d="M0 2.1 L0 -2.1 A1.6 1.6 0 0 0 -3.2 -2.1 L-3.2 2.1 A1.6 1.6 0 0 0 0 2.1 Z" fill="none" stroke={col('rgba(147,161,176,.7)', 'rgba(62,155,212,.7)')} strokeDasharray="4 3" />
            <g className="zs" transform={`translate(0 -0.3) scale(${zkO.toFixed(4)}) translate(0 0.3)`}>
              <path d="M0 0 l-0.35 0.6 h0.7 Z" fill={col('rgba(147,161,176,.8)', 'rgba(62,155,212,.8)')} transform="translate(0 -0.6)" />
            </g>
          </g>
        )}
        {o.dep && (
          <path
            style={lw(1)}
            d={plan.deps
              .filter((r) => !(c.focus && placement.editing?.k === 'dep' && placement.editing.r === r))
              .map((r) => pts(shipAt(departurePath(r, c.ship))))
              .join('')}
            fill="none"
            stroke={col('rgba(147,161,176,.55)', 'rgba(62,155,212,.55)')}
            strokeDasharray="6 4"
          />
        )}
        {o.arr && (
          <path
            style={lw(1)}
            d={liveStacks.map((m) => pts(shipAt(arrivalPath(m.r, fixDme(m.base), c.ship).path))).join('')}
            fill="none"
            stroke={col('rgba(147,161,176,.55)', 'rgba(62,155,212,.55)')}
            strokeDasharray="6 4"
          />
        )}
        {o.marshal && (
          <g>
            {eOn && <path style={lw(1)} d={pts(shipAt(holdPattern(emr, 21, 'right')), true)} fill="none" stroke={col('rgba(147,161,176,.55)', 'rgba(62,155,212,.55)')} strokeDasharray="6 4" />}
            {eOn && <path style={lw(1.2)} d={fixHash(emr, 6)} stroke={col('rgba(222,154,31,.8)', 'rgba(62,155,212,.8)')} />}
            {hOn && <path style={lw(1)} d={pts(shipAt(holdPattern(hel, 5, 'right', HELO_HOLD)), true)} fill="none" stroke={col('rgba(147,161,176,.55)', 'rgba(62,155,212,.55)')} strokeDasharray="6 4" />}
            <path style={lw(1.4)} d={liveStacks.map((m) => fixHash(m.r, m.base)).join('')} fill="none" stroke={col('#F15822', '#5AAEE3')} />
            <path style={lw(1)} d={liveStacks.map((m) => pts(shipAt(holdPattern(m.r, fixDme(m.base), m.rh ? 'right' : 'left')), true)).join('')} fill="none" stroke={col('rgba(147,161,176,.55)', 'rgba(62,155,212,.55)')} strokeDasharray="6 4" />
          </g>
        )}
      </g>
    );
  };

  // highlight / dimmed stack while editing / placement preview (focus carrier)
  const focusExtras = () => {
    if (!ship) return null;
    const stackPath = (m: StackDef) => pts(holdPattern(m.r, fixDme(m.base), m.rh ? 'right' : 'left'), true) + fixHashFocus(m.r, m.base) + pts(arrivalPath(m.r, fixDme(m.base), ship).path);
    function fixHashFocus(r: number, a: number) {
      const cq = P(r, a + 15);
      const n: Pt = [Math.cos((r * Math.PI) / 180) * 0.55 * zkO, Math.sin((r * Math.PI) / 180) * 0.55 * zkO];
      return `M${f2(cq[0] - n[0])} ${f2(cq[1] - n[1])}L${f2(cq[0] + n[0])} ${f2(cq[1] + n[1])}`;
    }
    const edM = placement.editing?.k === 'm' ? plan.stacks.find((m) => m.id === (placement.editing as { id: string }).id) : undefined;
    let hlD = '';
    if (hl?.k === 'dep' && plan.deps.includes(hl.id)) hlD = pts(departurePath(hl.id, ship));
    else if (hl?.k === 'e') hlD = pts(holdPattern(emergencyMarshalRadial(ship), 21, 'right'), true) + fixHashFocus(emergencyMarshalRadial(ship), 6);
    else if (hl?.k === 'h') hlD = pts(holdPattern(heloMarshalRadial(ship), 5, 'right', HELO_HOLD), true);
    else if (hl?.k === 'm') {
      const m = plan.stacks.find((x) => x.id === hl.id);
      if (m && m !== edM) hlD = stackPath(m);
    }
    const wedge = (a: number, half: number, r0: number, r1: number) => {
      const a1 = a - half;
      const a2 = a + half;
      const q = (b: number, r: number) => P(b, r).map(f2).join(' ');
      return `M${q(a1, r0)}L${q(a1, r1)}A${r1} ${r1} 0 0 1 ${q(a2, r1)}L${q(a2, r0)}A${r0} ${r0} 0 0 0 ${q(a1, r0)}Z`;
    };
    const { placing, editing, hov } = placement;
    let nogo = '';
    let bow = '';
    let cand = '';
    let candC = '#7FD397';
    if (placing) {
      const depO = plan.deps.filter((r) => !(editing?.k === 'dep' && editing.r === r));
      const marO = plan.stacks.filter((m) => !(editing?.k === 'm' && editing.id === m.id));
      if (placing === 'coord') {
        // no blocked sectors for the coordination line
      } else if (placing === 'dep') {
        const reserved = [...plan.stacks.filter((m) => !(editing?.k === 'm' && editing.id === m.id)).map((m) => m.r), emergencyMarshalRadial(ship), heloMarshalRadial(ship)];
        nogo = depO.map((r) => wedge(r, 20, 7, 50)).concat(reserved.map((r) => wedge(r, 20, 7, 50))).join('');
      } else {
        nogo = plan.deps.map((r) => wedge(r, 20, 7, 50)).concat(marO.map((m) => wedge(m.r, 10, 7, 50))).join('');
        bow = wedge(ship.brc, 90, 7, 50);
      }
      if (hov != null) {
        const ck = props.checkRadial(hov);
        candC = ck.err ? '#FF8A85' : ck.warn ? '#E7B04F' : '#7FD397';
        cand = placing === 'dep' ? pts(departurePath(hov, ship)) : stackPath({ id: '?', r: hov, base: edM?.base ?? 6 });
      }
    }
    return (
      <g>
        {placing && (
          <g>
            <path d={bow} fill="rgba(222,154,31,.07)" />
            <path style={{ strokeWidth: 'calc(0.6px * var(--lw, 1))' }} d={nogo} fill="rgba(224,82,78,.10)" stroke="rgba(224,82,78,.35)" />
          </g>
        )}
        {cand && <path style={{ strokeWidth: 'calc(1.4px * var(--lw, 1))' }} d={cand} fill="none" stroke={candC} strokeDasharray="2 2" />}
        {ov.marshal && <path style={{ strokeWidth: 'calc(2.2px * var(--lw, 1))' }} d={hlD} fill="none" stroke="#E6EDF3" strokeDasharray="6 4" />}
        {edM && <path style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} d={stackPath(edM)} fill="none" stroke="rgba(94,106,120,.55)" strokeDasharray="6 4" />}
      </g>
    );
  };

  // ------------------------------------------------ flags (HTML)
  const flag = (b: number, d: number, outbound: boolean, t: string, origin: Pt, sc = '#93A1B0', tc = '#E6EDF3') => {
    const q = toPx(add(P(b, d), origin));
    const h = outbound ? b : (b + 180) % 360;
    const w = Math.round(t.length * 6.4 + 18);
    const hs = norm360(h - ROT);
    return { x: q[0], y: q[1], rot: hs - 90, tr: hs > 180 ? 180 : 0, t, w, ml: -w / 2, tw: w - 7, sc, tc, d: `M0.5 0.5 H${w - 7.5} L${w - 0.5} 8 L${w - 7.5} 15.5 H0.5 Z` };
  };
  const flags: ReturnType<typeof flag>[] = [];
  for (const c of pic.carriers) {
    const o = c.focus ? ov : ov2;
    const pl = plans[c.track.hull ?? ''] ?? { deps: [], stacks: [] };
    const [sc, tc] = c.focus ? ['#93A1B0', '#E6EDF3'] : ['#3E9BD4', '#6FB6E6'];
    const DIM = ['#4A5562', '#6B7683'];
    if (o.brc) flags.push(flag(c.ship.brc, 9, true, `BRC ${r3(c.ship.brc)}`, c.track.p, sc, tc));
    if (o.fb) flags.push(flag(norm360(c.ship.fb + 180), 12, false, `FB ${r3(c.ship.fb)}`, c.track.p, sc, tc));
    if (o.dep)
      for (const r of pl.deps) {
        const ed = c.focus && placement.editing?.k === 'dep' && placement.editing.r === r;
        flags.push(flag(r, 35, true, `DR ${r3(r)}`, c.track.p, ed ? DIM[0] : sc, ed ? DIM[1] : tc));
      }
    if (o.marshal) {
      for (const m of pl.stacks) {
        if (pl.off?.includes(m.id)) continue;
        const ed = c.focus && placement.editing?.k === 'm' && placement.editing.id === m.id;
        flags.push(flag(m.r, m.base + 15 + 2.1, false, `${stackLabel(c.track.hull, m.id)} ${r3(m.r)}`, c.track.p, ed ? DIM[0] : sc, ed ? DIM[1] : tc));
      }
      const er = emergencyMarshalRadial(c.ship);
      const hr = heloMarshalRadial(c.ship);
      if (!pl.off?.includes('E')) flags.push(flag(er, 23.1, false, `${stackLabel(c.track.hull, 'E')} ${r3(er)}`, c.track.p, sc, tc));
      if (!pl.off?.includes('H')) flags.push(flag(hr, 6, false, `${stackLabel(c.track.hull, 'H')} ${r3(hr)}`, c.track.p, sc, tc));
    }
  }
  if (placement.placing && placement.hov != null && ship) {
    const ck = props.checkRadial(placement.hov);
    const cc = ck.err ? '#FF8A85' : ck.warn ? '#E7B04F' : '#7FD397';
    if (placement.placing === 'm') {
      const em = placement.editing?.k === 'm' ? plan.stacks.find((m) => m.id === (placement.editing as { id: string }).id) : undefined;
      const id = em?.id ?? STACK_IDS.find((k) => !plan.stacks.some((m) => m.id === k)) ?? '?';
      flags.push(flag(placement.hov, (em?.base ?? 6) + 15 + 2.1, false, `${stackLabel(hull, id)} ${r3(placement.hov)}`, [0, 0], cc, cc));
    } else flags.push(flag(placement.hov, 35, true, `DR ${r3(placement.hov)}`, [0, 0], cc, cc));
  }
  const sFl = (sO * 0.8 * 860) / 97 / 10.5;
  const sTg = (sT * 0.9 * 860) / 97 / 11;

  // ------------------------------------------------ off-scope indicators
  const ins = 24 / KX;
  const offs = pic.air
    .filter((t) => !hidden.has(t.id) && t.rng <= 60 && !inView(t.p, 0.4 * z))
    .map((t) => {
      const [dx, dy] = sub(rp(t.p), RC);
      const k = Math.min(dx ? (VW / 2 - ins) / Math.abs(dx) : Infinity, dy ? (VH / 2 - ins) / Math.abs(dy) : Infinity);
      const q: Pt = [(RC[0] + dx * k - vx) * KX, (RC[1] + dy * k - vy) * KX];
      const red = conflictIds.has(t.id);
      return { id: t.id, x: q[0], y: q[1], rot: (Math.atan2(dy, dx) * 180) / Math.PI, c: red ? '#FF8A85' : isBlue(t) ? BLUE_HIT : TRK, ring: red };
    });

  // ------------------------------------------------ altitude filter
  const af = props.altFilter;
  const dim = new Set<string>();
  if (af) for (const t of pic.air) if (!inAltBlock(t, af)) dim.add(t.id);
  // a conflict involving an aircraft the filter hides clears the filter at once
  const dimConflict = !!af && pic.conflicts.some((c) => dim.has(c.a.id) || dim.has(c.b.id));
  useEffect(() => {
    if (dimConflict) props.onAltFilter?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimConflict]);
  // dimmed contacts are drawn in a solid darker colour (mixed toward the scope background), not with
  // opacity: translucent vector and symbol would stack where they overlap, and faded trails vanish
  const dimC = (id: string, c: string) => (dim.has(id) ? mixHex(c, '#0B0E12', 0.55) : c);

  // ------------------------------------------------ tags
  type TagItem = { t: ScopeTrack; rows: string[]; color: 'own' | 'red' | 'blue'; radar?: boolean };
  const tagItems: TagItem[] = [];
  for (const t of pic.air) {
    if (hidden.has(t.id)) continue;
    if (dim.has(t.id) && t.id !== hookedId) continue;
    if (pic.formations.some((f) => f.collapsible && f.lead !== t && f.members.includes(t) && (fmSel[f.id] ?? 0) > 0)) continue;
    const fi = fmInfo.get(t.id);
    const color = conflictIds.has(t.id) ? 'red' : isBlue(t) ? 'blue' : 'own';
    let rows = tagRows(t);
    if (fi && !fi.sel) rows = tagRows(t, fi.f, true);
    else if (fi) {
      const m = fi.f.members[fi.sel - 1] ?? t;
      const r = tagRows(m);
      rows = [r[0], r[1], `${m.cs ?? m.pi ?? m.id} · ${fi.sel}/${fi.f.members.length}`];
    }
    // a radar donor (E-2) with the datalink overlay on: its radar on the tag
    const dn = ov.dl ? props.donors?.find((d) => d.id === t.id) : undefined;
    if (dn) rows = [...rows, dn.radar];
    tagItems.push({ t, rows, color, radar: !!dn });
  }
  const tagGeom = (rowsIn: string[]) => {
    const arrow = rowsIn[1]?.[0] === '↑' || rowsIn[1]?.[0] === '↓' ? rowsIn[1][0] : '';
    const rows = arrow ? [rowsIn[0], rowsIn[1].slice(1), ...rowsIn.slice(2)] : rowsIn;
    const inset = arrow ? 0.85 : 0.3;
    return { arrow, rows, inset, w: Math.max(...rows.map((r) => r.length)) * 0.54 + inset + 0.3, h: rows.length + 0.35 };
  };
  const places = layoutTags(
    tagItems.map(({ t, rows, color }) => ({
      id: t.id,
      // the layout works in the turned frame: tags are screen-aligned, so vectors and obstacles must be too
      p: rp(t.p),
      ...tagGeom(rows),
      v: t.gs && t.gs > 20 ? rp(dir(t.crs ?? t.hdg ?? 0)) : undefined,
      priority: color === 'red' ? 0 : t.id === hookedId ? 1 : 2 + t.rng / 100,
    })),
    { k: zkT, hitK: zkH, view: { x0: vx, y0: vy, x1: vx + VW, y1: vy + VH }, prev: prevPlaces.current, obstacles: pic.air.filter((t) => !hidden.has(t.id)).map((t) => rp(t.p)) },
  );
  prevPlaces.current = places;
  const renderTag = ({ t, rows: rowsIn, color, radar }: TagItem) => {
    const pl = places.get(t.id) ?? { q: [1, -1] as Pt, L: 2.4 };
    const q = pl.q;
    const s = Math.SQRT1_2;
    const L0: Pt = [q[0] * 0.7 * s, q[1] * 0.7 * s];
    const L1: Pt = [q[0] * pl.L * s, q[1] * pl.L * s];
    const { arrow, rows, inset, w, h } = tagGeom(rowsIn);
    const rx = q[0] > 0 ? L1[0] + 0.05 : L1[0] - 0.05 - w;
    const ty = L1[1] + 0.32;
    const cls = color === 'red' ? 'tg tgr' : color === 'blue' ? 'tg tgb' : 'tg';
    const stroke = color === 'red' ? '#FF8A85' : color === 'blue' ? BLUE_TAG : undefined;
    return (
      <g key={`tag${t.id}`} className="zs nr" transform={`translate(${f2(t.p[0])} ${f2(t.p[1])})${ROT ? ` rotate(${ROT})` : ''} scale(${zkT.toFixed(4)})`} style={{ pointerEvents: 'none' }}>
        <line style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x1={f2(L0[0])} y1={f2(L0[1])} x2={f2(L1[0])} y2={f2(L1[1])} className={stroke ? undefined : 'ldr'} stroke={stroke} />
        <rect
          style={color === 'red' ? { strokeWidth: 'calc(1.1px * var(--lw, 1))' } : undefined}
          x={f2(rx)}
          y={f2(ty - 0.85)}
          width={f2(w)}
          height={f2(h)}
          rx="0.2"
          fill="rgba(11,14,18,.72)"
          stroke={color === 'red' ? '#E0524E' : undefined}
        />
        {rows.map((r, i) => (
          // a donor's radar (last row) in the donor yellow, whatever the track's colour
          <text key={i} x={f2(rx + inset)} y={f2(ty + i)} className={cls} style={radar && i === rows.length - 1 ? { fill: '#E7C66B' } : undefined}>
            {r}
          </text>
        ))}
        {arrow && (
          <text x={f2(rx + inset - 0.15)} y={f2(ty + 1)} textAnchor="end" className={cls}>
            {arrow}
          </text>
        )}
      </g>
    );
  };

  // ------------------------------------------------ CPA probe / BRA ruler resolution
  const resolve = (x: Pt | string | null): { p: Pt; t?: ScopeTrack } | null => {
    if (x == null) return cur ? { p: cur } : null;
    if (typeof x === 'string') {
      const t = pic.air.find((a) => a.id === x);
      return t ? { p: t.p, t } : null;
    }
    return { p: x };
  };
  const braA = bra ? resolve(bra.a) : null;
  const braB = bra ? resolve(bra.b) : null;
  const probeA = probe ? pic.air.find((t) => t.id === probe.a) : undefined;
  const probeB = probe?.b ? pic.air.find((t) => t.id === probe.b) : undefined;
  const probeCpa: (Cpa & { a2: ScopeTrack; b2: ScopeTrack }) | null =
    probeA && probeB
      ? {
          ...cpaOf(
            { p: probeA.p, crs: probeA.crs ?? probeA.hdg ?? 0, gs: probeA.gs ?? 0, altFt: probeA.alt, vsFpm: probeA.vs },
            { p: probeB.p, crs: probeB.crs ?? probeB.hdg ?? 0, gs: probeB.gs ?? 0, altFt: probeB.alt, vsFpm: probeB.vs },
            900,
          ),
          a2: probeA,
          b2: probeB,
        }
      : null;
  const cpaList = [
    ...pic.conflicts.map((c) => ({ a: c.a, b: c.b, cpa: c.cpa as Cpa, probe: false })),
    ...(probeCpa ? [{ a: probeCpa.a2, b: probeCpa.b2, cpa: probeCpa as Cpa, probe: true }] : []),
  ];
  const cpaLabel = (c: Cpa) => `CPA ${c.latNm.toFixed(1)} NM / ${Math.round(c.vertFt / 100) * 100} FT · ${msS(c.tS)}`;
  const pinned = cpaList
    .map((c) => ({ c, mid: mul(add(c.cpa.a, c.cpa.b), 0.5) }))
    .filter(({ mid }) => !inView(mid))
    .map(({ c, mid }) => {
      const [dx, dy] = sub(rp(mid), RC);
      const k = Math.min(dx ? (VW / 2 - ins) / Math.abs(dx) : Infinity, dy ? (VH / 2 - ins) / Math.abs(dy) : Infinity);
      const q: Pt = [(RC[0] + dx * k - vx) * KX, (RC[1] + dy * k - vy) * KX];
      const w = 196;
      const h = 20;
      const BH = box.w * asp;
      return { key: `${c.a.id}-${c.b.id}`, t: cpaLabel(c.cpa), x: Math.max(40, Math.min(box.w - 40 - w, q[0] - w / 2)), y: Math.max(44, Math.min(BH - 44 - h, q[1] + (dy < 0 ? 18 : -18 - h))) };
    });

  // ------------------------------------------------ helper tag (hook) + assignment tags (HTML)
  const hkTag = (() => {
    if (!hk || !hooked) return null;
    const label = hooked.bd ?? hooked.cs ?? hooked.pi ?? hooked.id;
    const intLabel = (t: ScopeTrack) => t.bd ?? t.cs ?? t.pi ?? t.id;
    // the intercept tag sits at the midpoint of the commanded leg
    const intAt = hk.kind === 'int' ? (hk.sol.ok && hk.sol.solid.length ? hk.sol.solid[Math.floor(hk.sol.solid.length / 2)] : cur!) : cur!;
    const at = hk.kind === 'marshal' ? hk.route.fix : intAt;
    const q = toPx(at);
    const BH = box.w * asp;
    const rows =
      hk.kind === 'marshal'
        ? [
            `${label} → ${hk.st.id}${hk.ang} · ${fixDme(hk.ang)} DME`,
            `ANGELS ${hk.ang} · FIX ${hms(hk.fixS)} · ${hk.route.entry.toUpperCase()}`,
            `EAT ${hms(hk.eatS).slice(0, 5)} · ${hk.spd} KT → HOLD ${hk.holdKias} KIAS`,
          ]
        : hk.kind === 'int'
        ? hk.sol.ok
          ? [
              `${label} → ${intLabel(hk.tgt)}`,
              `STEER ${r3(hk.sol.steerHdg)} · ${hk.sol.distNm.toFixed(1)} NM FOR INTERCEPT`,
              `ANGELS ${(hk.tgt.alt / 1000).toFixed(1)} · ${hk.spd} KCAS · M${hk.mach.toFixed(2)}`,
              `VISUAL ${msS(hk.sol.eteS)}`,
              `INTERCEPT ${msS(hk.stern ? hk.sol.eteS + hk.stern.timeS : hk.sol.mergeS)}`,
            ]
          : [`${label} → ${intLabel(hk.tgt)}`, 'NO INTERCEPT AT THIS SPEED', `SCROLL TO RAISE · ${hk.spd} KCAS`]
        : [`BRG ${r3(hk.brg)} · RNG ${hk.rng.toFixed(1)}`, `HDG ${r3(hk.fl.hdg)} · TRK DIST ${hk.fl.dist.toFixed(1)}`, `ETE ${msS(hk.fl.timeS ?? (hk.fl.dist / hk.spd) * 3600)} · ${hk.spd} KT`];
    // marshal / vector: a simple offset from the anchor
    if (hk.kind !== 'int') {
      return { x: Math.min(box.w - 230, Math.max(8, q[0] + 16)), y: Math.min(BH - 60, Math.max(8, q[1] + 14)), rows };
    }
    // intercept: the tag rides with the interceptor, offset to a direction that clears the
    // interceptor and interceptee (symbols + radar tags) and, when a solution exists, the geometry.
    const maxChars = Math.max(...rows.map((r) => r.length));
    const W = (maxChars * 6.7 + 16) * sTg;
    const H = (rows.length * 15 + 8) * sTg;
    const segs: [Pt, Pt][] = [];
    const addPoly = (poly: Pt[]) => {
      const px = poly.map(toPx);
      for (let i = 1; i < px.length; i++) segs.push([px[i - 1], px[i]]);
    };
    if (hk.sol.ok) {
      addPoly(hk.sol.solid);
      addPoly(hk.sol.dashed);
      addPoly([hk.tgt.p, hk.stern ? add(hk.stern.end, mul(dir(hk.stern.endHdg), 1)) : hk.sol.merge]);
      if (hk.stern) addPoly(hk.stern.path);
    }
    // either contact's symbol and radar-tag box, reconstructed from the deconflicted layout (CDC is north-up)
    const boxes: Box[] = [];
    const f = zkT * KX;
    const s = Math.SQRT1_2;
    for (const t of [hooked, hk.tgt]) {
      const c = toPx(t.p);
      boxes.push({ x: c[0] - 12, y: c[1] - 12, w: 24, h: 24 }); // symbol + leader root
      const pl = places.get(t.id);
      const ti = tagItems.find((x) => x.t.id === t.id);
      if (!pl || !ti) continue;
      const g = tagGeom(ti.rows);
      const rx = pl.q[0] > 0 ? pl.q[0] * pl.L * s + 0.05 : pl.q[0] * pl.L * s - 0.05 - g.w;
      const ty = pl.q[1] * pl.L * s + 0.32;
      boxes.push({ x: c[0] + rx * f - 2, y: c[1] + (ty - 0.85) * f - 2, w: g.w * f + 4, h: g.h * f + 4 });
    }
    const hits = (bx: number, by: number): boolean => {
      if (bx < 4 || by < 4 || bx + W > box.w - 4 || by + H > BH - 4) return true; // keep fully in view
      const r: Box = { x: bx, y: by, w: W, h: H };
      return segs.some(([a, b]) => segHitsBox(a, b, r)) || boxes.some((bb) => boxHitsBox(bb, r));
    };
    const A = toPx(hooked.p); // the interceptor: the tag's anchor
    const key = `${hookedId}:${hk.tgt.id}`;
    // stabilise: keep the last offset relative to the interceptor while it is still clear
    const prev = intTagPos.current;
    if (prev && prev.key === key && !hits(A[0] + prev.ox, A[1] + prev.oy)) return { x: A[0] + prev.ox, y: A[1] + prev.oy, rows };
    // candidate box centres around the interceptor: preferred directions first, growing outward
    const base = Math.hypot(W, H) / 2 + 14;
    let chosen: { ox: number; oy: number } | null = null;
    for (const m of [1, 1.3, 1.7, 2.2, 2.9]) {
      for (const ang of [45, 90, 135, 0, 180, 315, 225, 270]) {
        const a = (ang * Math.PI) / 180;
        const ox = Math.cos(a) * base * m - W / 2;
        const oy = Math.sin(a) * base * m - H / 2;
        if (!hits(A[0] + ox, A[1] + oy)) {
          chosen = { ox, oy };
          break;
        }
      }
      if (chosen) break;
    }
    const ch = chosen ?? { ox: base - W / 2, oy: base - H / 2 };
    intTagPos.current = { key, ...ch };
    const clampX = (x: number) => Math.min(box.w - W - 6, Math.max(6, x));
    const clampY = (y: number) => Math.min(BH - H - 6, Math.max(6, y));
    return { x: clampX(A[0] + ch.ox), y: clampY(A[1] + ch.oy), rows };
  })();
  // One intercept's geometry. `full` draws the collision reference (grey run-in, dashed closure,
  // merge cross); `dim` fades a committed intercept that is not the active one.
  const renderIntercept = (ic: ReturnType<typeof makeIntercept>, opts: { full: boolean; dim: boolean; key: string }) => {
    const { sol, stern, tgt } = ic;
    if (!sol.ok) return null;
    return (
      <g key={opts.key} fill="none" stroke="#E45BEA" strokeLinejoin="round" style={{ pointerEvents: 'none', opacity: opts.dim ? 0.45 : 1 }}>
        {opts.full && <path style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} d={pts([tgt.p, stern ? add(stern.end, mul(dir(stern.endHdg), 1)) : sol.merge])} stroke="#93A1B0" strokeDasharray="5 4" />}
        <path style={{ strokeWidth: 'calc(1.8px * var(--lw, 1))' }} d={pts(sol.solid)} />
        {opts.full && <path style={{ strokeWidth: 'calc(1.6px * var(--lw, 1))' }} d={pts(sol.dashed)} strokeDasharray="6 4" />}
        {stern && <path style={{ strokeWidth: 'calc(1.8px * var(--lw, 1))' }} d={pts(stern.path)} />}
        {sol.distNm > 0.5 && (
          <g transform={`translate(${f2(sol.rejoin[0])} ${f2(sol.rejoin[1])}) rotate(${(sol.steerHdg + 180).toFixed(1)}) scale(${(zkO * 0.6).toFixed(4)})`}>
            <path d="M-0.95 0Q0 -1.15 0.95 0Q0 1.15 -0.95 0Z" fill="#0E1116" style={{ strokeWidth: 'calc(1.7px * var(--lw, 1))' }} />
            <circle cx="0" cy="0" r="0.276" fill="#E45BEA" stroke="none" />
          </g>
        )}
        {opts.full && (
          <g transform={`translate(${f2(sol.merge[0])} ${f2(sol.merge[1])}) rotate(${(sol.steerHdg + 45).toFixed(1)}) scale(${zkO.toFixed(4)})`}>
            <path style={{ strokeWidth: 'calc(1.9px * var(--lw, 1))' }} d="M-0.6 0L0.6 0M0 -0.6L0 0.6" />
          </g>
        )}
        {stern && (
          <g transform={`translate(${f2(stern.end[0])} ${f2(stern.end[1])}) rotate(${stern.endHdg.toFixed(1)}) scale(${zkO.toFixed(4)})`}>
            <path d="M0 -0.72L0.5 0.42L0 0.14L-0.5 0.42Z" fill="#E45BEA" stroke="none" />
          </g>
        )}
      </g>
    );
  };
  // Assigned routes and tags only for the aircraft hovered on the scope (or its formation) or in
  // the strips list: showing every assignment at once clutters the marshal area.
  const showIds = new Set<string>(props.showAssigned ?? []);
  if (acHov) showIds.add(acHov);
  const fmH = fmHov ? pic.formations.find((x) => x.id === fmHov) : undefined;
  for (const m of fmH?.members ?? []) showIds.add(m.id);
  const adTags = [...assignments.entries()]
    .filter(([id, a]) => a.carrier === hull && id !== hookedId && showIds.has(id))
    .map(([id, a]) => {
      const st = stacks.find((s) => s.id === a.stackId);
      const t = pic.air.find((x) => x.id === id);
      if (!st || !t) return null;
      const fx = P(st.r, fixDme(a.angels));
      const q = toPx(fx);
      const spec = holdSpecForTas(tasFromIas(maxEnduranceKias(t.ty), a.angels * 1000));
      const route = marshalRoute(t.p, t.crs ?? t.hdg ?? 0, Math.max(150, Math.round((t.gs ?? 300) / 10) * 10), st.r, fixDme(a.angels), st.rh ? 'right' : 'left', spec);
      return { id, st, a, fx, route, x: q[0] + 12, y: q[1] + 8, t: `${t.bd ?? t.cs ?? t.pi ?? id} · ${stackLabel(hull, st.id)}·${a.angels} · EAT ${hms(a.eatS).slice(0, 5)}` };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.a.eatS - b.a.eatS);
  // several shown at once (a flight): stack tags that would overlap, in EAT order
  {
    const lh = 18 * sTg;
    const placed: { x: number; y: number; w: number }[] = [];
    for (const a of adTags) {
      const w = a.t.length * 6.6 * sTg + 14;
      while (placed.some((p) => Math.abs(p.y - a.y) < lh && a.x < p.x + p.w && p.x < a.x + w)) a.y += lh;
      placed.push({ x: a.x, y: a.y, w });
    }
  }

  const fixHashAt = (r: number, a: number, k = 1) => {
    const cq = P(r, a + 15);
    const n: Pt = [Math.cos((r * Math.PI) / 180) * 0.55 * zkO * k, Math.sin((r * Math.PI) / 180) * 0.55 * zkO * k];
    return `M${f2(cq[0] - n[0])} ${f2(cq[1] - n[1])}L${f2(cq[0] + n[0])} ${f2(cq[1] + n[1])}`;
  };

  // ------------------------------------------------ PIM / waypoints
  const pimOverlay = (r: PimShip) => {
    const pr = pic.proj!;
    const col = r.own ? '#7FD1C7' : '#5FB3C9';
    const P = r.pts.map((q) => pr.toScope(q.lat, q.lon));
    const pim = props.mt != null ? pimAt(r.pts, props.mt) : null;
    const leg = pim?.leg ?? 0;
    const pp = pim ? pr.toScope(pim.lat, pim.lon) : null;
    const past = pp && leg > 0 ? [...P.slice(0, leg), pp] : [];
    const future = pp && leg > 0 ? (leg < P.length ? [pp, ...P.slice(leg)] : []) : P;
    const hhmm = (eta: number) => {
      if (props.dayStart == null) return '';
      const s = (((props.dayStart + eta) % 86400) + 86400) % 86400;
      return ` ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
    };
    // leg speed from distance over time (unambiguous, unlike the per-point speed field)
    const legKt = (i: number) => {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const dt = b.eta - a.eta;
      return dt > 0 ? Math.round((distanceNm(a.lat, a.lon, b.lat, b.lon) / dt) * 3600) : null;
    };
    const ship = r.carrierId ? pic.carriers.find((c) => c.track.id === r.carrierId)?.track.p : undefined;
    const txt = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fill: col, fontSize: '0.85px', fontWeight: 500, letterSpacing: '0.04em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round', ...extra });
    return (
      <g key={`pim${r.g}`} style={{ pointerEvents: 'none' }}>
        {past.length > 1 && <path d={pts(past)} fill="none" stroke={col} strokeOpacity={0.35} strokeDasharray="2 3" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />}
        {future.length > 1 && <path d={pts(future)} fill="none" stroke={col} strokeOpacity={0.8} strokeDasharray="7 3" style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} />}
        {ship && pp && len(sub(ship, pp)) > 0.05 && (
          <line x1={f2(ship[0])} y1={f2(ship[1])} x2={f2(pp[0])} y2={f2(pp[1])} stroke={col} strokeOpacity={0.55} strokeDasharray="1 2" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />
        )}
        {P.map((q, i) => {
          const done = i < leg;
          const next = i + 1 < r.pts.length ? r.pts[i + 1] : null;
          const out = next ? r3(bearingOf(sub(P[i + 1], q))) : null;
          return (
            <g key={i} className="zs" transform={zs(q, zkO)} opacity={done ? 0.4 : 1}>
              <circle cx={f2(q[0])} cy={f2(q[1])} r="0.42" fill="#0B0E12" stroke={col} style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} />
              {!done && !(pp && len(sub(q, pp)) < 1.6 * zkO) && (
                <text className="nr" transform={upT(q)} x={f2(q[0] + 0.75)} y={f2(q[1] + 0.3)} stroke="#0B0E12" style={txt()}>
                  {`${r.own ? '' : `${r.label} `}WP${i}${hhmm(r.pts[i].eta)}${out ? ` → ${out}` : ''}`}
                </text>
              )}
            </g>
          );
        })}
        {/* the PIM box: where the ship is to keep about its PIM */}
        {pp && r.own && props.pimBoxNm && (
          <rect x={f2(pp[0] - props.pimBoxNm)} y={f2(pp[1] - props.pimBoxNm)} width={f2(2 * props.pimBoxNm)} height={f2(2 * props.pimBoxNm)} fill={col} fillOpacity={0.04} stroke={col} strokeOpacity={0.6} style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} />
        )}
        {pp && pim && (
          <g className="zs" transform={zs(pp, zkO)}>
            {!(ship && len(sub(ship, pp)) < 1.6 * zkH) && <path d={`M${f2(pp[0])} ${f2(pp[1] - 0.7)}L${f2(pp[0] + 0.7)} ${f2(pp[1])}L${f2(pp[0])} ${f2(pp[1] + 0.7)}L${f2(pp[0] - 0.7)} ${f2(pp[1])}Z`} fill="#0B0E12" stroke={col} style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} />}
            {!(ship && len(sub(ship, pp)) < 1.6 * zkH) && <circle cx={f2(pp[0])} cy={f2(pp[1])} r="0.14" fill={col} />}
            <text className="nr" transform={upT(pp)} x={f2(pp[0] + 0.95)} y={f2(pp[1] - 0.55)} stroke="#0B0E12" style={txt({ fontWeight: 600 })}>
              {`${r.label} PIM${pim.crs != null ? ` ${r3(pim.crs)}` : ''}${pim.leg > 0 && pim.leg < r.pts.length && legKt(pim.leg) != null ? `/${legKt(pim.leg)} KT` : ''}${ship ? ` · ${Math.max(0, len(sub(ship, pp))).toFixed(1)} NM` : ''}`}
            </text>
          </g>
        )}
      </g>
    );
  };

  // ------------------------------------------------ render
  const cursorReadout = cur && pic.proj
    ? (() => {
        const ll = pic.proj!.toLatLon(cur);
        const f = (x: number, w: number, pos: string, neg: string) => {
          const a = Math.abs(x);
          const dg = Math.floor(a);
          return `${String(dg).padStart(w, '0')}°${((a - dg) * 60).toFixed(1).padStart(4, '0')}'${x >= 0 ? pos : neg}`;
        };
        // own-coalition bullseye (RadarView passes only the focus carrier's side)
        const be = props.bulls?.[0];
        const bp = be ? pic.proj!.toScope(be.lat, be.lon) : null;
        return (
          <>
            <div>{`CURSOR ${r3(bearingOf(cur))}° / ${len(cur).toFixed(1)} NM · ${f(ll.lat, 2, 'N', 'S')} ${f(ll.lon, 3, 'E', 'W')}`}</div>
            {bp && <div style={{ color: be!.side === 'blue' ? '#6FB6E6' : '#FF8A85' }}>{`BULLSEYE ${r3(bearingOf(sub(cur, bp)))}° / ${len(sub(cur, bp)).toFixed(1)} NM`}</div>}
          </>
        );
      })()
    : null;
  const toolDefs: [Tool, string, React.ReactNode][] = [
    ['select', 'Select / hook', <IcSelect key="s" />],
    ['bra', 'BRA ruler', <IcBra key="b" />],
    ['marshal', 'Assign marshal level / EAT', <IcMarshal key="m" />],
    ['cpa', 'CPA probe', <IcCpa key="c" />],
    ['vec', 'Vector / heading line', <IcVec key="v" />],
    ['int', 'Intercept: hook the interceptor, hover a contact (scroll = speed)', <IcIntercept key="i" />],
    ['wp', 'Plot waypoint: click the chart to add one to the route', <IcWp key="w" />],
  ];
  const fitDefs: [Exclude<Fit, null>, string, string][] = [
    // the widest range (the scope stops at MAX_RANGE_NM); the whole theatre only where it is smaller than that
    ['thr', `${MAX_RANGE_NM}NM`, `Widest range: ${MAX_RANGE_NM} NM`],
    ['fit', 'FIT', 'Fit all contacts, carriers and ships'],
    ['bulls', 'BULLS', 'The bullseye, 100 NM around it'],
    ['r50', '50NM', 'Default range: 50 NM around the carrier'],
    ['r5', '5NM', '5 NM around the carrier'],
    ['csg', 'CSG', 'Fit the carrier and its escorts'],
    ['cca', 'CCA', 'Fit CCA + 20 NM'],
    ['dep', 'DEP', 'Fit carrier and departure radials'],
    ['app', 'APP', 'Fit carrier, bolter pattern and marshal stacks'],
  ];
  const trailPx = (0.32 * KX * zkH).toFixed(2);
  // trail dots are square caps on a tiny segment: run it along the screen's x axis (turned back by ROT in track up)
  const dotSeg = ROT ? `l${(0.001 * Math.cos((ROT * Math.PI) / 180)).toFixed(6)} ${(0.001 * Math.sin((ROT * Math.PI) / 180)).toFixed(6)}` : 'h0.001';
  const vb = `${f2(SV.x)} ${f2(SV.y)} ${f2(SV.w)} ${f2(SV.h)}`;
  // marine layer snapshot (see MarineLayer): view top-left in the layer's origin frame
  const MO = 0.2;
  const oM = marine && pic.proj ? pic.proj.toScope(marine.lat, marine.lon) : null;
  const curM = oM ? { x: SV.x - oM[0], y: SV.y - oM[1] } : null;
  const [mSnap, setMSnap] = useState<{ x: number; y: number; w: number; h: number; m: MarineGeom; kx: number; k: number; rot: number; om: Pt; ux: number; uy: number } | null>(null);
  const offOf = (sn: { x: number; y: number } | null) => (sn && curM ? [(sn.x - curM.x) * KX, (sn.y - curM.y) * KX] : [0, 0]);
  const zooming = performance.now() - zoomedAt.current < 250;
  const scaleChanged = !!mSnap && (Math.abs(mSnap.w - SV.w) > 1e-9 || Math.abs(mSnap.h - SV.h) > 1e-9);
  const stale =
    !!curM &&
    !!marine &&
    (!mSnap ||
      mSnap.m !== marine ||
      (scaleChanged && (!zooming || mSnap.w / SV.w > 4 || mSnap.w / SV.w < 0.25)) ||
      (!scaleChanged && (Math.abs(offOf(mSnap)[0]) > MO * SV.bw * 0.8 || Math.abs(offOf(mSnap)[1]) > MO * SV.bh * 0.8)) ||
      // drawn north-up (track up turns the layer's container), so a turn never redraws it
      mSnap.rot !== 0);
  // the snapshot also freezes the scale-dependent props, so the memoised layer does not re-render mid-zoom
  const snap = stale && curM && marine && oM ? { x: curM.x, y: curM.y, w: SV.w, h: SV.h, m: marine, kx: KX, k: zkO, rot: 0, om: oM, ux: VX - oM[0], uy: VY - oM[1] } : mSnap;
  useEffect(() => {
    if (stale && snap) setMSnap(snap);
  });
  // Map the snapshot onto the current view: scale by snap.w / VW about the layer's top-left corner,
  // then translate so the snapshot's view corner lands where it belongs on screen.
  // level-of-detail paths for this snapshot (only rebuilt when the snapshot changes)
  const mPaths = useMemo(
    () => {
      if (!snap) return null;
      // turned, the drawn region is the view's circumscribed square about its (unturned) centre
      const hr = ((1 + 2 * MO) * Math.hypot(snap.w, snap.h)) / 2;
      const v = snap.rot ? { x0: snap.ux - hr, y0: snap.uy - hr, x1: snap.ux + hr, y1: snap.uy + hr } : { x0: snap.x - MO * snap.w, y0: snap.y - MO * snap.h, x1: snap.x + (1 + MO) * snap.w, y1: snap.y + (1 + MO) * snap.h };
      return buildPaths(snap.m, v, 0.5 / snap.kx);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap?.m, snap?.x, snap?.y, snap?.w, snap?.h, snap?.kx, snap?.rot, snap?.ux, snap?.uy],
  );
  // territorial-limit labels sit at each ring's screen-top point: cheap, so re-found whenever the picture turns
  const mTops = useMemo(
    () => (snap && mPaths ? terrTopsFor(snap.m, { x0: snap.x - MO * snap.w, y0: snap.y - MO * snap.h, x1: snap.x + (1 + MO) * snap.w, y1: snap.y + (1 + MO) * snap.h }, ROT) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mPaths, ROT],
  );
  const mScale = snap ? snap.w / SV.w : 1;
  const mT = snap && curM ? [(snap.x - curM.x - MO * snap.w) * KX + MO * SV.bw, (snap.y - curM.y - MO * snap.h) * KX + MO * SV.bh] : [0, 0];
  const svgStyle = (lw: number, extra: React.CSSProperties = {}) =>
    ({ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', '--z': zkO.toFixed(4), '--lw': lw, ...extra }) as React.CSSProperties;

  return (
    <main style={{ flex: '999 1 560px', minWidth: 0, position: 'relative', background: '#0B0E12', display: 'flex', flexDirection: 'column' }}>
      <div ref={boxRef} data-tu={ROT ? '' : undefined} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', '--tu': `${ROT}deg` } as React.CSSProperties}>
        {ov.sweep && pic.focus && (() => {
          const c = toPx([0, 0]);
          const len = Math.min(8000, Math.ceil(Math.hypot(Math.max(c[0], box.w - c[0]), Math.max(c[1], box.h - c[1]))) + 4);
          return <SweepLine x={c[0]} y={c[1]} w={sL} len={len} rot={ROT} />;
        })()}
        {rotor('rotA', <>
        {marine && snap && snap.m === marine && mPaths && (
          <div style={{ position: 'absolute', left: -MO * SV.bw, top: -MO * SV.bh, width: (1 + 2 * MO) * SV.bw, height: (1 + 2 * MO) * SV.bh, transformOrigin: '0 0', transform: `translate(${mT[0].toFixed(1)}px, ${mT[1].toFixed(1)}px) scale(${mScale.toFixed(5)})`, willChange: 'transform', pointerEvents: 'none' }}>
            <MarineLayer
              marine={mPaths}
              vb={`${(snap.x - MO * snap.w).toFixed(4)} ${(snap.y - MO * snap.h).toFixed(4)} ${((1 + 2 * MO) * snap.w).toFixed(4)} ${((1 + 2 * MO) * snap.h).toFixed(4)}`}
              bathy={!!ov.bathy}
              coast={!!ov.coast}
              places={!!ov.places}
              airports={!!ov.airports}
              terr={!!ov.terr}
              KX={snap.kx}
              VW={snap.w}
              k={snap.k}
              sL={sL}
              rot={ROT}
              tops={mTops}
            />
          </div>
        )}
        {/* ---------------- background */}
        <svg className="scope" viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={svgStyle(sL)}>
          <g>
          {ov.latlon && (
            <g>
              <path style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} d={frame.outline} fill="none" stroke="rgba(147,161,176,.4)" />
              <path style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} d={frame.ticks} stroke="rgba(147,161,176,.6)" fill="none" />
              <g className="geo">
                {frame.labels.map((l, i) => (
                  <text key={`${l.t}${i}`} x={f2(l.x)} y={f2(l.y)} textAnchor={l.anchor} dominantBaseline={ROT ? 'central' : undefined} className="geo nr" transform={upT([l.x, l.y])}>
                    {l.t}
                  </text>
                ))}
              </g>
            </g>
          )}
          {ov.grid && (
            <g className="grid">
              <path style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} d={frame.grid} stroke="rgba(147,161,176,.14)" fill="none" />
            </g>
          )}
          {ov.rings && (() => {
            // CATCC: 10-40 NM. Far rings (CDC): every 10 NM from the carrier out past the theatre's farthest
            // corner; zoomed out (range past 60 NM) the rings between the 50s go faint and unlabelled, and the
            // compass moves out from the 30 NM ring to the 50
            const far = !!props.ringsFar;
            const step = 10;
            const wide = far && VW > 120;
            const minor = (r: number) => wide && r % 50 !== 0;
            const rMax = far ? (tBounds ? Math.max(...[[tBounds.x0, tBounds.y0], [tBounds.x1, tBounds.y0], [tBounds.x0, tBounds.y1], [tBounds.x1, tBounds.y1]].map(([x, y]) => Math.hypot(x, y))) : 500) : 40;
            const rings = Array.from({ length: Math.floor(rMax / step) + (far ? 1 : 0) }, (_, i) => (i + 1) * step);
            const RC0 = wide ? 50 : 30;
            return (
            <g className="rg">
              {rings.map((r) => (
                <circle key={r} cx="0" cy="0" r={r} className={minor(r) ? 'ring ring-f' : 'ring'} />
              ))}
              {rings.filter((r) => !minor(r)).map((r) => {
                // stacked straight up from the carrier (top of the screen), just outside each ring
                // the compass ring's label clears the 000 tick (which spans ±1 ref unit about the ring)
                const q: Pt = rpInv([0, -r - (r === RC0 ? 1.25 : 0.3) * zkO]);
                return (
                  <text key={`rl${r}`} x={f2(q[0])} y={f2(q[1])} textAnchor="middle">
                    {r} NM
                  </text>
                );
              })}
              <g className="tick">
                {Array.from({ length: 12 }, (_, i) => i * 30).map((b) => {
                  const c = P(b, RC0);
                  const a = P(b, RC0 - 1);
                  const e = P(b, RC0 + 1);
                  return (
                    <g key={b} className="zs" transform={zs(c, zkO)}>
                      <line x1={f2(a[0])} y1={f2(a[1])} x2={f2(e[0])} y2={f2(e[1])} />
                    </g>
                  );
                })}
              </g>
              {Array.from({ length: 12 }, (_, i) => i * 30).map((b) => {
                // just inside the tick (tick half-length 1 ref unit), constant gap on screen
                const q = P(b, RC0 - 1.9 * zkO);
                return (
                  <text key={`c${b}`} x={f2(q[0])} y={f2(q[1])} textAnchor="middle" dominantBaseline="central">
                    {r3(b)}
                  </text>
                );
              })}
            </g>
            );
          })()}
          {pic.carriers.map((c) => {
            // "CVN-71 CCA 50NM" on the circle at 12 o'clock, the circle broken under it
            const ccaText = `${c.track.hull ? `${c.track.hull} ` : ''}CCA 50NM`;
            const ccaGap = Math.min(0.5, ((ccaText.length * 0.6 + 1.2) * 0.9 * zkO) / 2 / 50);
            // 12 o'clock on screen: north, or the ship's heading in track up
            const ccaTop = ROT * D2R;
            const ccaAt = (o: Pt, a: number): Pt => [o[0] + 50 * Math.sin(a), o[1] - 50 * Math.cos(a)];
            const ccaArc = (o: Pt) => {
              const a = ccaAt(o, ccaTop + ccaGap);
              const b = ccaAt(o, ccaTop - ccaGap);
              return `M${f2(a[0])} ${f2(a[1])}A50 50 0 1 1 ${f2(b[0])} ${f2(b[1])}`;
            };
            const ccaLabel = (o: Pt, color: string) => {
              const q = ccaAt(o, ccaTop);
              return (
                <g className="zs" transform={zs(q, zkO)} style={{ pointerEvents: 'none' }}>
                  <text x={f2(q[0])} y={f2(q[1])} textAnchor="middle" dominantBaseline="central" stroke="#0B0E12" strokeDasharray="none" style={{ fill: color, fontSize: '0.9px', fontWeight: 600, letterSpacing: '0.06em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                    {`${c.track.hull ? `${c.track.hull} ` : ''}CCA 50NM`}
                  </text>
                </g>
              );
            };
            return c.focus ? (
              ov.cca && (
                <g key={`cca${c.track.id}`} style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} fill="none" strokeDasharray="10 5">
                  <path d={ccaArc([0, 0])} stroke="rgba(64,168,91,.75)" />
                  {ccaLabel([0, 0], 'rgba(110,200,130,.95)')}
                </g>
              )
            ) : (
              <g key={`cca${c.track.id}`}>
                {ov2.cca && (
                  <g style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} fill="none" strokeDasharray="10 5">
                    <path d={ccaArc(c.track.p)} stroke="rgba(62,155,212,.55)" />
                    {ccaLabel(c.track.p, 'rgba(110,182,230,.9)')}
                  </g>
                )}
                {ov2.rings && (
                  <g fill="none" stroke="rgba(62,155,212,.22)" style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }}>
                    {[10, 20, 30, 40].map((r) => (
                      <circle key={r} cx={f2(c.track.p[0])} cy={f2(c.track.p[1])} r={r} />
                    ))}
                  </g>
                )}
              </g>
            );
          })}
        </g>
        </svg>

        {/* ---------------- overlays */}
        <svg className="scope" viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={svgStyle(sL)}>
          <g>
          {ov.coord &&
            pic.carriers
              .filter((c) => !c.focus && c.track.hull)
              .map((c) => {
                const pv = props.coordPreview && props.coordPreview.hull === c.track.hull ? props.coordPreview.g : null;
                const g = pv ?? props.coordLines[c.track.hull!];
                if (!g) return null;
                // clip to the union of the two CCAs
                let t0 = Infinity;
                let t1 = -Infinity;
                for (const C of [[0, 0] as Pt, c.track.p]) {
                  const tc = (C[0] - g.p0[0]) * g.u[0] + (C[1] - g.p0[1]) * g.u[1];
                  const foot = add(g.p0, mul(g.u, tc));
                  const d2 = (foot[0] - C[0]) ** 2 + (foot[1] - C[1]) ** 2;
                  if (d2 >= 2500) continue;
                  const h = Math.sqrt(2500 - d2);
                  t0 = Math.min(t0, tc - h);
                  t1 = Math.max(t1, tc + h);
                }
                if (!Number.isFinite(t0)) return null;
                const p1 = add(g.p0, mul(g.u, t0));
                const p2 = add(g.p0, mul(g.u, t1));
                const mid = mul(c.track.p, 0.5);
                const m = add(g.p0, mul(g.u, (mid[0] - g.p0[0]) * g.u[0] + (mid[1] - g.p0[1]) * g.u[1]));
                let ang = (Math.atan2(g.u[1], g.u[0]) * 180) / Math.PI;
                ang = upAng(ang);
                const label = `COORD · ${hull} │ ${c.track.hull}${g.auto && !pv ? ' · AUTO' : ''}`;
                const w = label.length * 0.54 + 0.6;
                const stroke = pv ? '#FFB08F' : 'rgba(111,182,230,.8)';
                return (
                  <g key={`coord${c.track.id}`}>
                    {pv && <line style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x1="0" y1="0" x2={f2(g.p0[0])} y2={f2(g.p0[1])} stroke="#FFB08F" strokeDasharray="2 3" />}
                    <line style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} x1={f2(p1[0])} y1={f2(p1[1])} x2={f2(p2[0])} y2={f2(p2[1])} stroke={stroke} strokeDasharray={pv ? '6 4' : '2 3'} />
                    <g className="zs nr" transform={`${zs(m, zkT)} rotate(${f2(ang)} ${f2(m[0])} ${f2(m[1])})`}>
                      <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x={f2(m[0] - w / 2)} y={f2(m[1] - 0.72)} width={f2(w)} height="1.44" rx="0.72" fill="#0F1A24" stroke={pv ? '#FFB08F' : 'rgba(111,182,230,.9)'} />
                      <text x={f2(m[0])} y={f2(m[1] + 0.3)} textAnchor="middle" className="tg tgb" style={pv ? { fill: '#FFB08F' } : undefined}>
                        {pv ? `${r3(bearingOf(g.p0))}° · ${Math.abs(g.off).toFixed(1)} NM` : label}
                      </text>
                    </g>
                  </g>
                );
              })}
          {pic.proj && (props.pimRoutes ?? []).map((r) => pimOverlay(r))}
          {pic.proj && pic.focus && props.navRoute && props.navRoute.pts.length > 0 && (() => {
            // the bridge's plotted route: dashed while planned, solid while the ship follows it
            const nr = props.navRoute!;
            const P = [pic.focus!.track.p, ...nr.pts.map((q) => pic.proj!.toScope(q.lat, q.lon))];
            return (
              <g style={{ pointerEvents: 'none' }}>
                <path d={pts(P)} fill="none" stroke="#E6EDF3" strokeOpacity={nr.active ? 0.9 : 0.7} strokeDasharray={nr.active ? undefined : '5 4'} style={{ strokeWidth: `calc(${nr.active ? 1.6 : 1.2}px * var(--lw, 1))` }} />
                {P.slice(1).map((q, i) => (
                  <g key={i} className="zs" transform={zs(q, zkO)}>
                    <circle cx={f2(q[0])} cy={f2(q[1])} r="0.45" fill="#0B0E12" stroke="#E6EDF3" style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} />
                    <text className="nr" transform={upT(q)} x={f2(q[0] + 0.8)} y={f2(q[1] + 0.3)} stroke="#0B0E12" style={{ fill: '#E6EDF3', fontSize: '0.85px', fontWeight: 500, letterSpacing: '0.04em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                      {nr.pts[i].label}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
          {ov.csg && pic.focus && csgOverlay(pic.focus)}
          {pic.carriers.filter((c) => (c.focus ? ov.port : ov2.port)).map(portHold)}
          {pic.carriers.map(carrierOverlays)}
          {focusExtras()}
          {ov.blind &&
            (() => {
              // everything in view outside every donor's coverage circle, tinted; the union's edge drawn
              const ds = props.donors ?? [];
              // the tint covers just the view (a square about its centre, so a turned view is covered too).
              // No masks: the blind area is the view square plus the outline of the union of coverage
              // circles, filled even-odd (a mask is re-rasterised over the whole view on every pan frame)
              const hv = 0.55 * Math.hypot(VW, VH);
              const box = { x: f2(VX - hv), y: f2(VY - hv), w: f2(2 * hv), h: f2(2 * hv) };
              // only the visible part of a coverage edge is stroked: a whole dashed 200 NM circle at close
              // zoom is tens of thousands of dashes. 'full': the circle is small next to the view; null:
              // no part of it is in view; else the angular window (SVG angles) that is
              const win = (c: Pt, r: number): [number, number] | 'full' | null => {
                const d = Math.hypot(VX - c[0], VY - c[1]);
                if (d + hv < r || d - hv > r) return null;
                const a0 = Math.atan2(VY - c[1], VX - c[0]);
                const span = d > hv ? Math.asin(Math.min(1, hv / d)) * 1.2 : Math.PI;
                if (span >= Math.PI / 2) return 'full';
                return [a0 - span, a0 + span];
              };
              const alt = props.blindAlt ?? 1000;
              // one blind-spot picture: the view outside every donor's circle, tinted, the union's edge dashed
              // labels on the edge at NE / SE / SW / NW of each circle, where that point is on the
              // union's edge (not inside another donor's coverage), in view, and clear of other labels
              type Lab = { key: string; q: Pt; ang: number; text: string; op: number };
              const labs: Lab[] = [];
              const addLabels = (r: (d: RadarDonor) => number, text: string, op: number, skip?: (d: RadarDonor, q: Pt) => boolean) => {
                for (const d of ds)
                  for (const b of [45, 135, 225, 315]) {
                    const q: Pt = [d.p[0] + r(d) * Math.sin(b * D2R), d.p[1] - r(d) * Math.cos(b * D2R)];
                    if (!inView(q, -4 * zkO) || skip?.(d, q)) continue;
                    if (ds.some((o) => o !== d && Math.hypot(q[0] - o.p[0], q[1] - o.p[1]) < r(o) - 0.05)) continue;
                    if (labs.some((l) => Math.hypot(q[0] - l.q[0], q[1] - l.q[1]) < 6 * zkO)) continue;
                    // along the perimeter (tangent), kept upright
                    labs.push({ key: `${d.id}${b}${text}`, q, ang: upAng(b), text, op });
                  }
              };
              // a point of the lowest-altitude edge that is also on the selected altitude's edge (the two
              // coincide where a radar is range-limited at both): labelled once, as the selected altitude
              const onSelEdge = (d: RadarDonor, q: Pt) => Math.abs(d.covLow - d.cov) < 0.5 && !ds.some((o) => o !== d && Math.hypot(q[0] - o.p[0], q[1] - o.p[1]) < o.cov - 0.05);
              const altTxt = (a: number) => `< ${a >= 1000 ? `${a / 1000}K` : a} FT`;
              addLabels((d) => d.cov, altTxt(alt), 0.95);
              if (alt !== BLIND_ALTS[0]) addLabels((d) => d.covLow, altTxt(BLIND_ALTS[0]), 0.6, onSelEdge);
              const FS = 0.72;
              // `within`: only inside that coverage (the lowest altitude's band, so it isn't painted again
              // under the selected altitude's blind area, which lies inside it)
              const layer = (key: string, r: (d: RadarDonor) => number, fillOp: number, strokeOp: number, sw: number, within?: (d: RadarDonor) => number) => {
                const arcs = unionArcs(ds.map((d) => ({ c: d.p, r: r(d) })));
                const outer = within ? unionLoopsPath(unionArcs(ds.map((d) => ({ c: d.p, r: within(d) })))) : `M${box.x} ${box.y}H${f2(VX + hv)}V${f2(VY + hv)}H${box.x}Z`;
                const edges = arcs
                  .flatMap((a) => {
                    const w = win(a.c, a.r);
                    return w === null ? [] : w === 'full' ? [a] : clipArc(a, w[0], w[1]);
                  })
                  .map((a) => arcPath(a))
                  .join('');
                return (
                  <g key={key}>
                    <path d={outer + unionLoopsPath(arcs)} fillRule="evenodd" fill="#FF8A85" fillOpacity={fillOp} />
                    {edges && <path d={edges} fill="none" stroke="#FF8A85" strokeOpacity={strokeOp} strokeDasharray="8 5" style={{ strokeWidth: `calc(${sw}px * var(--lw, 1))` }} />}
                  </g>
                );
              };
              return (
                <g style={{ pointerEvents: 'none' }}>
                  {/* the lowest altitude's blind spots are always shown, faintly, under the selected one */}
                  {alt !== BLIND_ALTS[0] && layer('low', (d) => d.covLow, 0.03, 0.28, 1.2, (d) => d.cov + 0.05)}
                  {layer('sel', (d) => d.cov, 0.06, 0.7, 2)}
                  {labs.map((l) => (
                    <g key={l.key} className="zs nr" transform={`${zs(l.q, zkO)} rotate(${l.ang} ${f2(l.q[0])} ${f2(l.q[1])})`}>
                      <text x={f2(l.q[0])} y={f2(l.q[1])} textAnchor="middle" dominantBaseline="central" stroke="#0B0E12" style={{ fill: '#FF8A85', fillOpacity: l.op, fontSize: `${FS}px`, fontWeight: 600, letterSpacing: '0.05em', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                        {l.text}
                      </text>
                    </g>
                  ))}
                  {ds.length === 0 && (
                    <text x={f2(rpInv([vx + VW / 2, vy + VH - 3 * zkO])[0])} y={f2(rpInv([vx + VW / 2, vy + VH - 3 * zkO])[1])} textAnchor="middle" style={{ fill: '#FF8A85', fontSize: `${(0.9 * zkO).toFixed(3)}px`, fontWeight: 600 }}>
                      {`NO FRIENDLY RADAR · ALL BLIND BELOW ${alt} FT`}
                    </text>
                  )}
                </g>
              );
            })()}
          {ov.dl &&
            (props.donors ?? []).map((d) => {
              // a yellow ring round the donor's hit, with its beam turning at the radar's scan rate (in phase with the
              // hit painter). The radar is on the track's tag (ships, AEW aircraft); our carrier has no tag, so its
              // label sits beside the ring
              const c = d.p;
              const r = d.sym ? 1.55 : 1.3;
              const tagged = d.sym ? d.kind === 'aew' : true;
              return (
                <g key={`dl${d.id}`} className="zs" transform={zs(c, zkO)} style={{ pointerEvents: 'none' }}>
                  <title>{`${d.name} · ${d.radar}`}</title>
                  <DonorBeam x={c[0]} y={c[1]} r={r} scanS={d.scanS} phase={d.phase} />
                  <circle cx={f2(c[0])} cy={f2(c[1])} r={r} fill="none" stroke="#E7C66B" strokeOpacity={0.6} style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} />
                  {!tagged && (
                    <text className="nr" transform={upT(c)} x={f2(c[0] + r + 0.4)} y={f2(c[1] + 0.3)} stroke="#0B0E12" style={{ fill: '#E7C66B', fontSize: '0.78px', fontWeight: 600, letterSpacing: '0.04em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                      {`${d.name.toUpperCase()} · ${d.radar}`}
                    </text>
                  )}
                </g>
              );
            })}
          {ov.bulls &&
            pic.proj &&
            (props.bulls ?? []).map((b) => {
              const p = pic.proj!.toScope(b.lat, b.lon);
              const c = b.side === 'blue' ? '#6FB6E6' : '#FF8A85';
              // compass rose: 30° spokes and range rings every 10 NM out to 100 NM, bearings at the ends; zoomed out
              // (range past 60 NM) the rings between the 50s go faint, as the range rings do
              const at = (brg: number, r: number): Pt => [p[0] + r * Math.sin(brg * D2R), p[1] - r * Math.cos(brg * D2R)];
              const spokes = Array.from({ length: 12 }, (_, i) => i * 30);
              return (
                <g key={b.side}>
                <g stroke={c} fill="none" style={{ pointerEvents: 'none', strokeWidth: 'calc(1px * var(--lw, 1))' }}>
                  {Array.from({ length: 10 }, (_, i) => (i + 1) * 10).map((r) => (
                    <circle key={`r${r}`} cx={f2(p[0])} cy={f2(p[1])} r={r} strokeOpacity={r % 50 === 0 || VW <= 120 ? 0.3 : 0.1} />
                  ))}
                  {spokes.map((brg) => {
                    const a = at(brg, 2.3 * zkO);
                    const e = at(brg, 100);
                    return <path key={brg} d={`M${f2(a[0])} ${f2(a[1])}L${f2(e[0])} ${f2(e[1])}`} strokeOpacity={brg % 90 === 0 ? 0.34 : 0.22} />;
                  })}
                </g>
                {spokes.map((brg) => {
                  const q = at(brg, 100 + 1.1 * zkO);
                  return (
                    <g key={`bl${brg}`} className="zs" transform={zs(q, zkO)} style={{ pointerEvents: 'none' }}>
                      <text x={f2(q[0])} y={f2(q[1] + 0.32)} textAnchor="middle" stroke="#0B0E12" style={{ fill: c, fillOpacity: 0.75, fontSize: '0.8px', fontWeight: 600, strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                        {String(brg).padStart(3, '0')}
                      </text>
                    </g>
                  );
                })}
                <g className="zs" transform={zs(p, zkO)} stroke={c} fill="none" style={{ pointerEvents: 'none', strokeWidth: 'calc(1.1px * var(--lw, 1))' }}>
                  {[0.55, 1.1, 1.65].map((r) => (
                    <circle key={r} cx={f2(p[0])} cy={f2(p[1])} r={r} strokeOpacity={r === 0.55 ? 0.95 : 0.6} />
                  ))}
                  <path d={`M${f2(p[0] - 2.3)} ${f2(p[1])}h4.6M${f2(p[0])} ${f2(p[1] - 2.3)}v4.6`} strokeOpacity="0.6" />
                  <text className="nr" transform={upT(p)} x={f2(p[0] + 1.95)} y={f2(p[1] - 1.75)} stroke="#0B0E12" style={{ fill: c, fontSize: '0.9px', fontWeight: 600, letterSpacing: '0.06em', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>
                    BULLSEYE
                  </text>
                </g>
                </g>
              );
            })}
          <g style={{ '--lw': 1 } as React.CSSProperties}>
            {cpaList.map(({ a, b, cpa, probe: pr }) => {
              const ext = (t: ScopeTrack) => add(t.p, mul(dir(t.crs ?? t.hdg ?? 0), ((t.gs ?? 0) * (cpa.tS + 10)) / 3600));
              const col = pr ? '#FFD7A8' : '#E0524E';
              return (
                <g key={`cpa${a.id}${b.id}`}>
                  <line style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} x1={f2(a.p[0])} y1={f2(a.p[1])} x2={f2(ext(a)[0])} y2={f2(ext(a)[1])} stroke={col} strokeDasharray="3 2" />
                  <line style={{ strokeWidth: 'calc(1.1px * var(--lw, 1))' }} x1={f2(b.p[0])} y1={f2(b.p[1])} x2={f2(ext(b)[0])} y2={f2(ext(b)[1])} stroke={col} strokeDasharray="3 2" />
                  <line style={{ strokeWidth: 'calc(1.5px * var(--lw, 1))' }} x1={f2(cpa.a[0])} y1={f2(cpa.a[1])} x2={f2(cpa.b[0])} y2={f2(cpa.b[1])} stroke={pr ? '#FFD7A8' : '#FF8A85'} />
                  {[cpa.a, cpa.b].map((q, i) => (
                    <g key={i} className="zs" transform={zs(q, zkH)}>
                      <circle cx={f2(q[0])} cy={f2(q[1])} r="0.3" fill={pr ? '#FFD7A8' : '#FF8A85'} />
                    </g>
                  ))}
                  {!pr &&
                    [a.p, b.p].map((q, i) => (
                      <g key={`r${i}`} className="zs" transform={zs(q, zkH)}>
                        <circle style={{ strokeWidth: 'calc(1.5px * var(--lw, 1))' }} cx={f2(q[0])} cy={f2(q[1])} r="1.3" fill="none" stroke="#E0524E" className="blink" />
                      </g>
                    ))}
                </g>
              );
            })}
          </g>
        </g>
        </svg>
        </>)}

        {/* ---------------- HTML labels: flags, edge markers, pinned CPA */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {flags.map((g, i) => (
            <div key={i} style={{ position: 'absolute', left: g.x, top: g.y, width: g.w, height: 16, marginLeft: g.ml, marginTop: -8, transformOrigin: '50% 50%', transform: `rotate(${g.rot}deg) scale(${sFl.toFixed(3)})` }}>
              <svg width={g.w} height="16" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <path style={{ strokeWidth: `${sL}px` }} d={g.d} fill="#151A21" stroke={g.sc} />
              </svg>
              <span style={{ position: 'absolute', left: 0, top: 0, width: g.tw, height: 16, lineHeight: '16px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: g.tc, transform: `rotate(${g.tr}deg)` }}>
                {g.t}
              </span>
            </div>
          ))}
          {offs.map((o) => (
            <svg key={`off${o.id}`} width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', left: o.x, top: o.y, margin: '-6px 0 0 -6px', transform: `rotate(${o.rot}deg) scale(${sH})`, overflow: 'visible' }}>
              <path d="M11 6 L1.5 0.8 L1.5 11.2 Z" fill={o.c} />
              {o.ring && <circle style={{ strokeWidth: '1.5px' }} cx="5.5" cy="6" r="11" fill="none" stroke="#E0524E" className="blink" />}
            </svg>
          ))}
          {pinned.map((p) => (
            <div key={p.key} style={{ transform: `scale(${sTg.toFixed(3)})`, transformOrigin: '0 0', position: 'absolute', left: p.x, top: p.y, height: 20, lineHeight: '18px', padding: '0 8px', background: '#0E1116', border: '1px solid #E0524E', borderRadius: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#FF8A85', whiteSpace: 'nowrap' }}>
              {p.t}
            </div>
          ))}
        </div>

        {/* ---------------- traffic */}
        {rotor('rotB', <svg
          ref={svgRef}
          className="scope"
          viewBox={vb}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Radar scope centred on ${hull || 'the carrier'}`}
          onClick={onClick}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onContextMenu={(e) => {
            e.preventDefault();
            // intercept: first right click releases the target lock, the next drops the interceptor hook
            if (tool === 'int' && hookedId && props.locks[hookedId]) {
              props.onUnlock(hookedId);
              return;
            }
            onHook(null);
            if (placement.placing) props.onCancelPlacement();
            setBra(null);
            setProbe(null);
          }}
          style={
            {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'auto',
              cursor: panning ? 'grabbing' : placement.placing || (hooked && toolActive) || tool === 'bra' || tool === 'cpa' || tool === 'wp' ? 'crosshair' : 'default',
              '--z': zkO.toFixed(4),
              '--lw': 1,
              '--tagc': TRK,
            } as React.CSSProperties
          }
        >
          <g>
          {/* trails */}
          <g fill="none" strokeLinecap="square" strokeWidth={trailPx}>
            {pic.air
              .filter((t) => !hidden.has(t.id))
              .map((t) => {
                const c = dimC(t.id, conflictIds.has(t.id) ? '#B8433F' : isBlue(t) ? BLUE_TRAIL : TRK_TRAIL);
                return t.trail.map((q, i) => <path key={`${t.id}t${i}`} d={`M${f2(q[0])} ${f2(q[1])}${dotSeg}`} stroke={c} opacity={[0.8, 0.6, 0.45, 0.3, 0.2][i] ?? 0.2} />);
              })}
          </g>
          {/* velocity vectors */}
          <g style={{ strokeWidth: 'calc(1.8px * var(--lw, 1))' }} strokeLinecap="round">
            {pic.air
              .filter((t) => !hidden.has(t.id))
              .map((t) => {
                const e = velocityEnd(t);
                if (!e) return null;
                const c = dimC(t.id, conflictIds.has(t.id) ? '#FF8A85' : isBlue(t) ? BLUE_TAG : TRK);
                return <line key={`v${t.id}`} x1={f2(t.p[0])} y1={f2(t.p[1])} x2={f2(e[0])} y2={f2(e[1])} stroke={c} />;
              })}
          </g>
          {/* turn trend ahead of our carrier (the conning seat): green, where the helm order takes the ship;
              white in three segments, where it goes holding its present rate of turn */}
          {props.trend &&
            fTrack &&
            ((fTrack.gs ?? 0) >= 1 || !!props.helm?.kt) &&
            (() => {
              const kt = fTrack.gs ?? 0;
              const hdg = fTrack.hdg ?? fTrack.crs ?? 0;
              // a time ahead whose run is about a fifth of the view: three equal segments of it
              const T = [90, 180, 360, 720, 1200].reduce((best, s) => (Math.abs((kt * s) / 3600 - 0.2 * VW) < Math.abs((kt * best) / 3600 - 0.2 * VW) ? s : best), 90);
              const dt = T / 36;
              const pts = (q: Pt[]) => q.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])} ${f2(p[1])}`).join('');
              // the present turn, stopped where the ship would steady (the ordered course, else 90° on)
              const white = kt >= 1 ? trendPath(fTrack.p, hdg, kt, turnRateNow, T, dt, trendTurnLimit(hdg, turnRateNow, props.helm?.crs)) : null;
              const green = props.helm ? orderedPath(fTrack.p, hdg, kt, props.helm.crs, T, dt, props.helm.kt) : null;
              return (
                <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                  <title>{`Turn trend: the next ${T / 60} min in three segments; green is the helm order`}</title>
                  {green && <path d={pts(green)} stroke="#5FD068" style={{ strokeWidth: 'calc(1.6px * var(--lw, 1))' }} />}
                  {/* three segments with a short gap between them (one step of twelve left out) */}
                  {white && <path d={[0, 12, 24].map((k) => pts(white.slice(k, k + 12))).join('')} stroke="#E6EDF3" style={{ strokeWidth: 'calc(1.8px * var(--lw, 1))' }} />}
                </g>
              );
            })()}
          {/* ships */}
          {/* the symbol's keel (its hull centreline, x = CV_KEEL_X; the angled deck widens it to port) sits on the
              ship's position, so lines drawn from the carrier start at the keel */}
          {pic.carriers.map((c) => (
            <g key={`ship${c.track.id}`}>
              <g transform={`translate(${f2(c.track.p[0])} ${f2(c.track.p[1])}) scale(${zkH.toFixed(4)}) rotate(${f2(c.ship.brc)})${c.focus ? '' : ' scale(0.9)'} translate(${-CV_KEEL_X} 0)`}>
                <path
                  style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }}
                  d="M0.287 -1.4 L0.06 -1.4 L-0.011 -0.703 L-0.178 -0.488 L-0.166 1.06 L-0.029 1.102 L0.001 1.4 L0.316 1.4 L0.465 1.013 L0.477 -0.429 L0.328 -0.727 Z"
                  fill="#0B0E12"
                  stroke={c.focus ? '#E6EDF3' : '#3E9BD4'}
                  strokeLinejoin="miter"
                />
              </g>
              {!c.focus && (
                <text x={f2(c.track.p[0] + 1.3 * zkH)} y={f2(c.track.p[1] + 0.68 * zkH)} className="tg tgb nr" transform={upT(c.track.p)}>
                  {c.track.hull}
                </text>
              )}
            </g>
          ))}
          {/* surface contacts (escorts and other ships): a hull (square stern, pointed bow) along the course, coloured by side; trail dots at earlier surface-radar updates ~30 s apart; no vector; the type */}
          {(pic.ships ?? [])
            .filter((s) => !hidden.has(s.id))
            .map((s) => {
              const col = s.sd === 'red' ? '#FF8A85' : s.sd === 'blue' ? BLUE_HIT : '#E7C66B';
              const tc = s.sd === 'red' ? 'tg tgr' : s.sd === 'blue' ? 'tg tgb' : 'tg';
              const h = s.crs ?? s.hdg ?? 0;
              const name = shipClassName(s.ty, s.dn);
              // a radar donor with the datalink overlay on: its radar on the tag's second line
              const dn = ov.dl ? props.donors?.find((d) => d.id === s.id) : undefined;
              return (
                <g key={`sfc${s.id}`} style={{ pointerEvents: 'none' }}>
                  {s.trail.map((q, i) => (
                    <path key={i} d={`M${f2(q[0])} ${f2(q[1])}${dotSeg}`} fill="none" stroke={col} strokeLinecap="square" strokeWidth={trailPx} opacity={[0.8, 0.65, 0.5, 0.38, 0.27, 0.18][i] ?? 0.18} />
                  ))}
                  <g transform={`translate(${f2(s.p[0])} ${f2(s.p[1])}) scale(${zkH.toFixed(4)}) rotate(${f2(h)})`}>
                    <path d="M0 -0.8 Q0.3 -0.5 0.3 -0.1 L0.3 0.62 L-0.3 0.62 L-0.3 -0.1 Q-0.3 -0.5 0 -0.8 Z" fill="#0B0E12" stroke={col} strokeLinejoin="miter" style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} />
                  </g>
                  <g className="zs nr" transform={`translate(${f2(s.p[0])} ${f2(s.p[1])})${ROT ? ` rotate(${ROT})` : ''} scale(${zkT.toFixed(4)})`}>
                    <text x="0.9" y="1.2" className={tc}>
                      {name}
                    </text>
                    {dn && (
                      <text x="0.9" y="2.35" className="tg" style={{ fill: '#E7C66B' }}>
                        {dn.radar}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          {/* hits */}
          {pic.air
            .filter((t) => !hidden.has(t.id))
            .map((t) => {
              const red = conflictIds.has(t.id);
              const col = dimC(t.id, red ? '#FF8A85' : isBlue(t) ? BLUE_HIT : TRK);
              const fi = fmInfo.get(t.id);
              const shape = /tanker|^KC|S-3B/i.test(t.ty) ? (
                <circle cx="0" cy="0" r="0.45" fill={col} className="hit" />
              ) : t.k === 'rotary' ? (
                <path d="M0 -0.6 L0.6 0 L0 0.6 L-0.6 0 Z" fill={col} className="hit" />
              ) : (
                <rect x="-0.4" y="-0.4" width="0.8" height="0.8" fill={col} className="hit" />
              );
              return (
                <g key={`h${t.id}`} className="zs" transform={`translate(${f2(t.p[0])} ${f2(t.p[1])}) scale(${zkH.toFixed(4)})${ROT ? ` rotate(${ROT})` : ''}`} opacity={isBlue(t) ? 0.85 : 1}>
                  {fi && !fi.sel ? (
                    <>
                      {shape}
                      <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x="-0.75" y="-0.75" width="1.5" height="1.5" fill="none" stroke={col} strokeDasharray="2 2" />
                    </>
                  ) : (
                    shape
                  )}
                  {fi && fi.sel > 0 && fi.f.members[fi.sel - 1]?.id === t.id && <rect style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} x="-0.7" y="-0.7" width="1.4" height="1.4" fill="none" stroke="#E6EDF3" />}
                  {fi && fmHov === fi.f.id && <circle style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} cx="0" cy="0" r="1.6" fill="none" stroke="rgba(230,237,243,.5)" strokeDasharray="3 3" />}
                  {t.id === hookedId && <rect style={{ strokeWidth: 'calc(1.4px * var(--lw, 1))' }} x="-0.9" y="-0.9" width="1.8" height="1.8" fill="none" stroke="#E45BEA" />}
                </g>
              );
            })}
          {/* expanded formation members (selected member boxed) */}
          {[...fmInfo.values()]
            .filter((x) => x.sel > 0)
            .flatMap(({ f, sel }) =>
              f.members
                .filter((m) => m !== f.lead && f.members[sel - 1] === m)
                .map((m) => (
                  <g key={`fs${m.id}`} className="zs" transform={`translate(${f2(m.p[0])} ${f2(m.p[1])}) scale(${zkH.toFixed(4)})${ROT ? ` rotate(${ROT})` : ''}`}>
                    <rect style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} x="-0.7" y="-0.7" width="1.4" height="1.4" fill="none" stroke="#E6EDF3" />
                  </g>
                )),
            )}
          {/* tags (deconflicted) */}
          {tagItems.map(renderTag)}
          {/* hooked tools */}
          {hk && hk.kind === 'marshal' && (
            <g fill="none" stroke="#E45BEA" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path
                style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }}
                d={Array.from({ length: 13 }, (_, i) => hk.st.base + i)
                  .filter((a) => a !== hk.ang)
                  .map((a) => fixHashAt(hk.st.r, a, 0.7))
                  .join('')}
                stroke="rgba(228,91,234,.5)"
              />
              <path style={{ strokeWidth: 'calc(1.4px * var(--lw, 1))' }} d={pts(holdPattern(hk.st.r, fixDme(hk.ang), hk.st.rh ? 'right' : 'left', hk.spec), true)} strokeDasharray="6 4" />
              <path style={{ strokeWidth: 'calc(2.2px * var(--lw, 1))' }} d={fixHashAt(hk.st.r, hk.ang)} />
              <path style={{ strokeWidth: 'calc(1.6px * var(--lw, 1))' }} d={pts(hk.route.path)} />
            </g>
          )}
          {hk && hk.kind === 'vec' && (
            <g fill="none" stroke="#E45BEA" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path style={{ strokeWidth: 'calc(1.6px * var(--lw, 1))' }} d={pts(hk.fl.path)} strokeDasharray="6 4" />
            </g>
          )}
          {tool === 'int' && (
            <>
              {intList.map((item) => renderIntercept(item.ic, { full: item.key === hookedId, dim: item.committed && item.key !== hookedId, key: item.key }))}
              {hk && hk.kind === 'int' && !hk.locked && renderIntercept(hk, { full: true, dim: false, key: 'active' })}
            </>
          )}
          {adTags.map((a) => (
            <g key={`ad${a.id}`} fill="none" stroke="rgba(228,91,234,.6)" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path style={{ strokeWidth: 'calc(2px * var(--lw, 1))' }} d={fixHashAt(a.st.r, a.a.angels)} />
              <path style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} d={pts(a.route.path)} strokeDasharray="4 3" />
            </g>
          ))}
          {/* CPA labels (top layer) */}
          {cpaList.map(({ a, b, cpa, probe: pr }) => {
            const mid = mul(add(cpa.a, cpa.b), 0.5);
            if (!inView(mid)) return null;
            const label = cpaLabel(cpa);
            const w = label.length * 0.54 + 0.6;
            return (
              <g key={`cl${a.id}${b.id}`} className="zs nr" transform={`translate(${f2(mid[0])} ${f2(mid[1])})${ROT ? ` rotate(${ROT})` : ''} scale(${zkT.toFixed(4)})`} style={{ pointerEvents: 'none' }}>
                <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x={f2(-w / 2)} y="-3.2" width={f2(w)} height="1.45" rx="0.2" fill="#0E1116" stroke={pr ? '#FFD7A8' : '#E0524E'} />
                <text x="0" y="-2.2" textAnchor="middle" className="tgr" style={pr ? { fill: '#FFD7A8' } : undefined}>
                  {label}
                </text>
              </g>
            );
          })}
          {/* BRA ruler + tag — drawn last, so it is always on top and never obscured */}
          {tool === 'bra' && braA && (braB || cur) && (() => {
            const b = braB ?? (cur ? { p: cur } : null);
            if (!b) return null;
            const d = sub(b.p, braA.p);
            const rng = Math.round(len(d));
            const fwd = bearingOf(d);
            const toStart = `${r3((fwd + 180) % 360)}° / ${rng} NM`; // end → start (reciprocal)
            const toEnd = `${r3(fwd)}° / ${rng} NM`; // start → end
            const w = Math.max(toStart.length, toEnd.length) * 0.54 + 1.1;
            // the tag runs along the ruler at its midpoint (like the coordination line) and is
            // double-pointed: the top line's triangle juts toward the start, the bottom line's toward the
            // end. When the ruler points south-ish the tag is rotated 180° to keep the text upright, which
            // reverses the tag relative to the (unflipped) ruler line — so swap the two bearings then, to
            // keep each one beside the triangle that points its way. No obstacle avoidance.
            const mid = mul(add(braA.p, b.p), 0.5);
            const rawAng = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
            const ang = upAng(rawAng);
            const flipped = ang !== rawAng;
            const top = flipped ? toEnd : toStart;
            const bot = flipped ? toStart : toEnd;
            const xl = mid[0] - w / 2;
            const xr = mid[0] + w / 2;
            const yt = mid[1] - 0.5;
            const yb = mid[1] + 0.5;
            return (
              <g>
                <g className="zs nr" transform={`${zs(mid, zkT)} rotate(${f2(ang)} ${f2(mid[0])} ${f2(mid[1])})`}>
                  <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x={f2(xl)} y={f2(mid[1] - 1.1)} width={f2(w)} height="2.2" rx="0.25" fill="#151A21" stroke="#FFD7A8" />
                  <path d={`M${f2(xl)} ${f2(yt - 0.55)}L${f2(xl - 0.9)} ${f2(yt)}L${f2(xl)} ${f2(yt + 0.55)}Z`} fill="#FFD7A8" />
                  <path d={`M${f2(xr)} ${f2(yb - 0.55)}L${f2(xr + 0.9)} ${f2(yb)}L${f2(xr)} ${f2(yb + 0.55)}Z`} fill="#FFD7A8" />
                  <text x={f2(mid[0])} y={f2(mid[1] - 0.25)} textAnchor="middle" className="tg" style={{ fill: '#FFD7A8' }}>{top}</text>
                  <text x={f2(mid[0])} y={f2(mid[1] + 0.95)} textAnchor="middle" className="tg" style={{ fill: '#FFD7A8' }}>{bot}</text>
                </g>
                {/* the ruler drawn last, over the tag, so it runs between the two lines */}
                <line style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} x1={f2(braA.p[0])} y1={f2(braA.p[1])} x2={f2(b.p[0])} y2={f2(b.p[1])} stroke="#FFD7A8" />
                <g className="zs" transform={zs(braA.p, zkH)}>
                  <circle cx={f2(braA.p[0])} cy={f2(braA.p[1])} r="0.3" fill="#FFD7A8" />
                </g>
                <g className="zs" transform={zs(b.p, zkH)}>
                  <circle cx={f2(b.p[0])} cy={f2(b.p[1])} r="0.3" fill="#FFD7A8" />
                </g>
              </g>
            );
          })()}
        </g>
        </svg>)}

        {/* ---------------- HTML helper tags */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {hkTag && (
            <div style={{ transform: `scale(${sTg.toFixed(3)})`, transformOrigin: '0 0', position: 'absolute', left: hkTag.x, top: hkTag.y, background: 'rgba(11,14,18,.9)', border: '1px solid #E45BEA', borderRadius: 2, padding: '3px 7px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: '15px', color: '#F2B3F5', whiteSpace: 'nowrap' }}>
              {hkTag.rows.map((r, i) => (
                <div key={i} style={{ color: i === 0 ? '#FFFFFF' : undefined, marginTop: /^(VISUAL|INTERCEPT)/.test(r) ? (/^VISUAL/.test(r) ? 3 : 0) : 0, letterSpacing: /^(VISUAL|INTERCEPT)/.test(r) ? '.04em' : undefined }}>
                  {r}
                </div>
              ))}
            </div>
          )}
          {adTags.map((a) => (
            <div key={`adt${a.id}`} style={{ transform: `scale(${sTg.toFixed(3)})`, transformOrigin: '0 0', position: 'absolute', left: a.x, top: a.y, background: 'rgba(11,14,18,.85)', border: '1px solid rgba(228,91,234,.6)', borderRadius: 2, padding: '1px 6px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, lineHeight: '15px', color: '#F2B3F5', whiteSpace: 'nowrap' }}>
              {a.t}
            </div>
          ))}
        </div>

        {/* ---------------- frequencies */}
        {/* above the altitude filter, which it overlaps when open */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, zIndex: props.freqOpen ? 5 : undefined }}>
          <button className="tbtn" onClick={props.onToggleFreq} aria-expanded={props.freqOpen} aria-label="Frequencies" title="Frequencies" style={{ background: props.freqOpen ? '#3D2521' : 'rgba(21,26,33,.96)', color: props.freqOpen ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' }}>
            <IcRadio />
          </button>
          {props.freqOpen && props.freqPanel}
        </div>

        {/* ---------------- altitude filter (left edge, vertically centred) */}
        {props.onAltFilter && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <AltSlider value={af ?? null} onChange={props.onAltFilter} />
          </div>
        )}

        {/* ---------------- toolbar */}
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div role="toolbar" aria-label="Radar tools" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'rgba(21,26,33,.96)', border: '1px solid #374250', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.45)' }}>
            {toolDefs.filter(([k]) => !props.tools || props.tools.includes(k)).map(([k, l, ic]) => (
              <button key={k} className="tbtn" aria-label={l} title={l} onClick={() => props.onTool(k)} style={{ background: tool === k ? 'rgba(241,88,34,.18)' : 'transparent', color: tool === k ? '#FFB08F' : '#E6EDF3' }}>
                {ic}
              </button>
            ))}
            {props.comms !== false && (
              <>
                <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
                <button className="tbtn" aria-label="Comms scripts" title="Comms scripts" onClick={props.onOpenComms} style={{ color: '#E6EDF3' }}>
                  <IcComms />
                </button>
              </>
            )}
            <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
            <button className="tbtn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1.4)} style={{ color: '#E6EDF3' }}>
              <IcZoomOut />
            </button>
            <span className="mono" title="Range (NM, edge to centre)" style={{ fontSize: 11, color: '#93A1B0', minWidth: 44, textAlign: 'center' }}>
              RNG <span style={{ color: '#E6EDF3', fontSize: 13 }}>{Math.round(VW / 2)}</span>
            </span>
            <button className="tbtn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1 / 1.4)} style={{ color: '#E6EDF3' }}>
              <IcZoomIn />
            </button>
            <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
            {props.onCsg && (
              <>
                <button
                  className="tbtn"
                  aria-pressed={!!props.csgOn}
                  aria-label="CSG formation"
                  title="CSG formation: stations and off-station labels"
                  onClick={() => props.onCsg!(!props.csgOn)}
                  style={{ background: props.csgOn ? 'rgba(241,88,34,.18)' : 'transparent', color: props.csgOn ? '#FFB08F' : '#E6EDF3' }}
                >
                  {/* a station sector ahead of the carrier, an escort in it */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4.2 9.2A11 11 0 0 1 19.8 9.2L16.3 12.7A6 6 0 0 0 7.7 12.7Z" strokeDasharray="2.4 1.8" />
                    <circle cx="12" cy="9.3" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M12 16.2 Q13.4 17.6 13.4 19.2 L13.4 22 L10.6 22 L10.6 19.2 Q10.6 17.6 12 16.2 Z" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
              </>
            )}
            {props.onConflicts && (
              <>
                <button
                  className="tbtn"
                  aria-pressed={!!props.conflictsOn}
                  aria-label="Conflict alerts"
                  title="Conflict alerts"
                  onClick={() => props.onConflicts!(!props.conflictsOn)}
                  style={{ background: props.conflictsOn ? 'rgba(241,88,34,.18)' : 'transparent', color: props.conflictsOn ? '#FFB08F' : '#E6EDF3' }}
                >
                  {/* two tracks converging on a point */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 5l7.5 6.2M21 5l-7.5 6.2" strokeDasharray="2.2 2" />
                    <circle cx="3.5" cy="5" r="1.6" fill="currentColor" />
                    <circle cx="20.5" cy="5" r="1.6" fill="currentColor" />
                    <path d="M12 12.5l-5 8.5h10z" />
                    <path d="M12 15.6v2.4" />
                  </svg>
                </button>
                <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
              </>
            )}
            {props.onTrackUp && (
              <>
                <div role="radiogroup" aria-label="Display orientation" style={{ display: 'flex', gap: 2 }}>
                  {([
                    [false, 'North up', (
                      // shaded disc with an N and the north arrowhead on its rim
                      <svg key="n" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="13.6" r="8.6" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M12 1 L15.4 6.4 L8.6 6.4 Z" fill="currentColor" />
                        <text x="12" y="17.6" textAnchor="middle" fill="currentColor" style={{ font: "700 11px 'IBM Plex Sans', sans-serif" }}>N</text>
                      </svg>
                    )],
                    [true, "Track up: the ship's heading at the top", (
                      // the radar's carrier silhouette, bow up, full height, with the heading arrow beside it
                      <svg key="t" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18.5 1.5 L21.7 7 L15.3 7 Z" fill="currentColor" />
                        <path d="M18.5 6.5V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M10.57 1.08 L8.80 1.08 L8.25 6.52 L6.95 8.19 L7.04 20.27 L8.11 20.60 L8.34 22.92 L10.80 22.92 L11.96 19.90 L12.05 8.65 L10.89 6.33 Z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
                      </svg>
                    )],
                  ] as const).map(([v, t, ic]) => {
                    const on = !!props.trackUp === v;
                    return (
                      <button key={t} role="radio" aria-checked={on} aria-label={v ? 'Track up' : 'North up'} title={t} className="tbtn" onClick={() => props.onTrackUp!(v)} style={{ background: on ? 'rgba(241,88,34,.18)' : 'transparent', color: on ? '#FFB08F' : '#E6EDF3' }}>
                        {ic}
                      </button>
                    );
                  })}
                </div>
                <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />
              </>
            )}
            <button
              className="tbtn"
              aria-label="Centre on carrier"
              aria-pressed={lock}
              title={lock ? 'Following the carrier · click (or pan) to unlock' : 'Centre on the carrier and follow it'}
              onClick={() => {
                if (lock && !fit) {
                  // toggle off: pin the current view to where it is on the map
                  setView({ zw: VW, zx: VX, zy: VY });
                  unlockAt(VX, VY);
                  return;
                }
                setView({ zw: VW, zx: 0, zy: 0 });
                anchor.current = null;
                setLock(true);
                onFit(null);
              }}
              style={{ color: lock ? '#FFB08F' : '#E6EDF3', background: lock ? 'rgba(241,88,34,.18)' : undefined }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="6.5" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
              </svg>
            </button>
            {/* in the seat's own order (narrowest to widest), else all of them */}
            {(props.fits ? props.fits.map((k) => fitDefs.find((d) => d[0] === k)!).filter(Boolean) : fitDefs).map(([k, l, t]) => (
              <button
                key={k}
                onClick={() => {
                  anchor.current = null;
                  setLock(true);
                  onFit(k);
                }}
                title={t}
                style={{ height: 32, padding: '0 9px', borderRadius: 5, border: `1px solid ${fit === k ? '#F15822' : '#374250'}`, background: fit === k ? 'rgba(241,88,34,.18)' : 'transparent', color: fit === k ? '#FFB08F' : '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, cursor: 'pointer' }}
              >
                {l}
              </button>
            ))}
          </div>
          {af && (
            <div role="status" className="mono" style={{ alignSelf: 'center', padding: '4px 12px', borderRadius: 5, background: '#F15822', color: '#0E1116', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', boxShadow: '0 4px 14px rgba(0,0,0,.45)' }}>
              {`Altitude Filter Applied · A${af.lo / 1000}–A${af.hi / 1000} · ${dim.size} ${dim.size === 1 ? 'Contact' : 'Contacts'} Dimmed`}
            </div>
          )}
          {!!ROT && (
            // north pointer while the picture is turned
            <div aria-label={`North is ${Math.round(norm360(-ROT))}° from up`} title="North" style={{ alignSelf: 'center', width: 34, height: 34, borderRadius: '50%', background: 'rgba(21,26,33,.96)', border: '1px solid #374250', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="-13 -13 26 26" style={{ transform: `rotate(${-ROT}deg)` }} aria-hidden="true">
                <path d="M0 -10 L4 2 L0 0 L-4 2 Z" fill="#E6EDF3" />
                <text x="0" y="9.5" textAnchor="middle" style={{ fill: '#93A1B0', fontSize: 7, fontFamily: "'IBM Plex Mono', monospace" }} transform={`rotate(${ROT} 0 7)`}>N</text>
              </svg>
            </div>
          )}
        </div>

        {/* ---------------- layers (top right, mirrors the frequencies button) */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="tbtn" aria-label="Bullseye" title={ov.bulls ? 'Hide the bullseye' : 'Show the bullseye'} aria-pressed={!!ov.bulls} onClick={props.onToggleBulls} style={{ background: ov.bulls ? '#3D2521' : 'rgba(21,26,33,.96)', color: ov.bulls ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' }}>
              <IcBulls />
            </button>
            {props.onOpenDisplay && (
              <button className="tbtn" aria-label="Display settings" title="Display settings: sizes, conflict detection" onClick={props.onOpenDisplay} style={{ background: 'rgba(21,26,33,.96)', color: '#E6EDF3', borderColor: '#374250' }}>
                <IcSliders />
              </button>
            )}
            <button className="tbtn" aria-label="Layers" title="Layers" aria-expanded={props.layersOpen} onClick={props.onToggleLayers} style={{ background: props.layersOpen ? '#3D2521' : 'rgba(21,26,33,.96)', color: props.layersOpen ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' }}>
              <IcLayers />
            </button>
          </div>
          {props.layersOpen && <div style={{ maxHeight: 'calc(100vh - 170px)', overflowY: 'auto' }}>{props.layersPanel}</div>}
        </div>

        {/* bottom-left: magnetic variation at the view centre and the range scale, inside the lat/lon frame (its labels keep clear) */}
        <div className="mono" style={{ position: 'absolute', left: cornerPx, bottom: cornerPx, height: cornerH, boxSizing: 'border-box', fontSize: 11, color: '#93A1B0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8, padding: '6px 10px 8px', background: 'rgba(21,26,33,.94)', border: '1px solid #262F3A', borderRadius: 4, pointerEvents: 'none' }}>
          {mv != null && (() => {
            // true north (full arrowhead) and magnetic north (half arrowhead) from one foot, turned with the picture
            const up = -ROT;
            const L = 46;
            // drawn north-up about the arrows' middle, then turned with the picture, so any heading fits the box
            const tip = (a: number, l: number): Pt => [l * Math.sin(a * D2R), L / 2 - l * Math.cos(a * D2R)];
            const tn = tip(0, L);
            const mn = tip(mv, L * 0.86);
            const txtA = ((((up + mv) % 360) + 360) % 360);
            const flip = txtA > 180;
            const lab = `VAR ${Math.abs(mv).toFixed(1)}°${mv >= 0 ? 'E' : 'W'}`;
            const mid = tip(mv, L * 0.43);
            const off: Pt = [7 * Math.cos(mv * D2R), 7 * Math.sin(mv * D2R)];
            return (
              <svg width="58" height="58" viewBox="-29 -29 58 58" aria-label={`Magnetic variation ${lab}`} style={{ overflow: 'visible' }}>
                <g transform={`rotate(${f2(up)})`}>
                  <g stroke="#C9D3DD" strokeWidth="1.2" fill="#C9D3DD" strokeLinejoin="round">
                    <line x1="0" y1={f2(L / 2)} x2={f2(tn[0])} y2={f2(tn[1])} />
                    <path d="M0 0 L-3 8 L0 6 L3 8 Z" transform={`translate(${f2(tn[0])} ${f2(tn[1])})`} />
                    <line x1="0" y1={f2(L / 2)} x2={f2(mn[0])} y2={f2(mn[1])} />
                    <path d="M0 0 L3.2 8 L0 6.5 Z" transform={`translate(${f2(mn[0])} ${f2(mn[1])}) rotate(${f2(mv)})`} />
                  </g>
                  <text x="0" y="0" textAnchor="middle" dominantBaseline="central" transform={`translate(${f2(mid[0] + off[0])} ${f2(mid[1] + off[1])}) rotate(${f2(mv - 90 + (flip ? 180 : 0))})`} style={{ fill: '#C9D3DD', fontSize: 8.5, letterSpacing: '.04em' }}>
                    {lab}
                  </text>
                </g>
              </svg>
            );
          })()}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: Math.round(scaleNm * KX), height: 6, border: '1px solid #93A1B0', borderTop: 0 }} />
            {scaleNm} NM
          </div>
        </div>
        {cursorReadout && (
          <div className="mono" style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 11.5, color: '#E6EDF3', background: 'rgba(21,26,33,.94)', border: '1px solid #262F3A', borderRadius: 4, padding: '4px 8px', pointerEvents: 'none' }}>
            {cursorReadout}
          </div>
        )}
        {!focus && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5E6A78', pointerEvents: 'none' }}>No carrier in the picture</div>
        )}
      </div>
    </main>
  );
};

export default Scope;
