import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { eat as eatOf, fly, turnRadiusNm } from '../../catcc/core/geometry/maneuver.ts';
import {
  arrivalPath,
  departurePath,
  emergencyMarshalRadial,
  fixDme,
  heloMarshalRadial,
  holdPattern,
  type HoldSpec,
  type ShipRef,
} from '../../catcc/core/geometry/procedures.ts';
import { add, bearingOf, dir, len, mul, P, rot, sub, type Pt } from '../../catcc/core/geometry/vec.ts';
import { norm360 } from '../../catcc/core/geo.ts';
import { DEFAULT_SCALE, tagRows, velocityEnd, type Carrier, type Picture, type ScopeScale, type ScopeTrack } from './scopeModel.ts';

// ---------------------------------------------------------------- types

export interface Stack {
  id: string;
  r: number;
  base: number;
  /** right-hand pattern (emergency) */
  rh?: boolean;
}

export interface Assignment {
  stackId: string;
  angels: number;
  /** EAT and fix time, seconds of the UTC day */
  eatS: number;
  fixS: number;
}

export type Fit = 'r50' | 'cca' | 'dep' | 'app' | null;


export interface ScopeProps {
  pic: Picture;
  utc?: Date;
  hookedId: string | null;
  onHook: (id: string | null) => void;
  deps: number[];
  stacks: Stack[];
  assignments: Map<string, Assignment>;
  onAssign: (trackId: string, a: Assignment) => void;
  /** centre request from the sidebars (go-to); nonce re-triggers */
  goTo?: { p: Pt; nonce: number };
  scale?: ScopeScale;
  fit: Fit;
  onFit: (f: Fit) => void;
}

// ---------------------------------------------------------------- palette (handoff §4)

const C = {
  scope: '#0B0E12',
  own: '#5FD068',
  ownTrail: '#3E9A4C',
  white: '#E6EDF3',
  whiteTrail: '#93A1B0',
  conflict: '#FF8A85',
  conflictLine: '#E0524E',
  conflictTrail: '#B8433F',
  other: '#3E9BD4',
  other2: '#6FB6E6',
  hook: '#E45BEA',
  hookText: '#F2B3F5',
  warn: '#E7B04F',
  ring: 'rgba(64,168,91,.22)',
  ringText: 'rgba(120,200,140,.55)',
  overlay: 'rgba(147,161,176,.55)',
  overlayDim: 'rgba(147,161,176,.30)',
  text2: '#93A1B0',
};

const CARRIER_OUTLINE =
  'M0.287 -1.4 L0.06 -1.4 L-0.011 -0.703 L-0.178 -0.488 L-0.166 1.06 L-0.029 1.102 L0.001 1.4 L0.316 1.4 L0.465 1.013 L0.477 -0.429 L0.328 -0.727 Z';

const HELO_HOLD: HoldSpec = { legNm: 2, turnNm: 0.5 };

// ---------------------------------------------------------------- helpers

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const d = (pts: Pt[], close = false) => (pts.length ? 'M' + pts.map((q) => `${f2(q[0])} ${f2(q[1])}`).join('L') + (close ? 'Z' : '') : '');
const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const hms = (t: number) => {
  const s = Math.round(t);
  return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};
const ms = (t: number) => {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const NS = { vectorEffect: 'non-scaling-stroke' } as React.CSSProperties;

function fitRadius(fit: Fit, deps: number[], stacks: Stack[]): number {
  switch (fit) {
    case 'cca':
      return 70;
    case 'dep':
      return deps.length ? 52 : 50;
    case 'app':
      return Math.max(16, ...stacks.map((s) => fixDme(s.base) + 4.2 + 6));
    default:
      return 50;
  }
}

/** Is q inside a stack's protected box (fix to 12 levels up, plus the hold width)? (mockup hitStack) */
function stackAt(q: Pt, stacks: Stack[]): Stack | null {
  for (const st of stacks) {
    const l = rot(q, -st.r);
    const al = -l[1];
    const x = st.rh ? -l[0] : l[0];
    if (al >= st.base + 13 && al <= st.base + 15 + 12 + 6.5 && x >= -1.5 && x <= 6.8) return st;
  }
  return null;
}

// ---------------------------------------------------------------- component

export const Scope: React.FC<ScopeProps> = (props) => {
  const { pic, hookedId, onHook, deps, stacks, assignments, onAssign, goTo, fit, onFit } = props;
  const scale = props.scale ?? DEFAULT_SCALE;
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 860, h: 700 });
  const [view, setView] = useState({ cx: 0, cy: 0, W: 110 });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hookSpeed, setHookSpeed] = useState<number | null>(null);
  const [hookLevel, setHookLevel] = useState<{ stackId: string; angels: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const asp = size.h / size.w;
  // A selected fit stays live: recomputed every render (handoff §3.2).
  const v = useMemo(() => {
    if (!fit) return view;
    const R = fitRadius(fit, deps, stacks);
    return { cx: 0, cy: 0, W: 2 * R * 1.04 * Math.max(1, 1 / asp) };
  }, [fit, view, deps, stacks, asp]);
  const W = v.W;
  const H = W * asp;
  const vx = v.cx - W / 2;
  const vy = v.cy - H / 2;
  const z = (W / 97) * (860 / Math.max(300, size.w));
  const kH = z * scale.hits;
  const kT = z * scale.tags;
  const kX = z * scale.text;
  const lw = scale.lines;

  const toScope = (cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [vx + ((cx - r.left) / r.width) * W, vy + ((cy - r.top) / r.height) * H];
  };
  const clampCentre = (c: Pt): Pt => {
    const l = len(c);
    return l > 100 ? mul(c, 100 / l) : c;
  };

  // go-to from sidebars
  useEffect(() => {
    if (!goTo) return;
    onFit(null);
    setView((s) => ({ ...s, cx: goTo.p[0], cy: goTo.p[1] }));
  }, [goTo, onFit]);

  const focus = pic.focus;
  const ship: ShipRef | undefined = focus?.ship;
  const hooked = hookedId ? pic.air.find((t) => t.id === hookedId) : undefined;

  useEffect(() => {
    setHookSpeed(null);
    setHookLevel(null);
  }, [hookedId]);

  const allStacks: Stack[] = useMemo(
    () => (ship ? [...stacks, { id: 'E', r: Math.round(emergencyMarshalRadial(ship)), base: 6, rh: true }] : stacks),
    [stacks, ship],
  );

  // ---------------------------------------------------------------- hooked tools
  const nowS = props.utc ? props.utc.getUTCHours() * 3600 + props.utc.getUTCMinutes() * 60 + props.utc.getUTCSeconds() : 0;
  const tool = useMemo(() => {
    if (!hooked || !cursor) return null;
    const spd = hookSpeed ?? Math.max(150, Math.round((hooked.gs ?? 300) / 10) * 10);
    const R = turnRadiusNm(spd);
    const hdg = hooked.crs ?? hooked.hdg ?? 0;
    const st = stackAt(cursor, allStacks);
    if (st) {
      const prevEats = [...assignments.entries()].filter(([id, a]) => a.stackId === st.id && id !== hooked.id).map(([, a]) => a.eatS);
      const used = new Set([...assignments.entries()].filter(([id, a]) => a.stackId === st.id && id !== hooked.id).map(([, a]) => a.angels));
      let angels = hookLevel?.stackId === st.id ? hookLevel.angels : st.base;
      if (hookLevel?.stackId !== st.id) while (used.has(angels) && angels < st.base + 12) angels++;
      const fx = P(st.r, fixDme(angels));
      const fl = fly(hooked.p, hdg, fx, R);
      const fixS = nowS + (fl.dist / spd) * 3600;
      const eatS = eatOf(fixS, prevEats.length ? Math.max(...prevEats) : undefined);
      return { kind: 'marshal' as const, st, angels, fx, fl, fixS, eatS, spd };
    }
    const fl = fly(hooked.p, hdg, cursor, R);
    return { kind: 'vector' as const, fl, spd, brg: bearingOf(sub(cursor, hooked.p)), rng: len(sub(cursor, hooked.p)) };
  }, [hooked, cursor, hookSpeed, hookLevel, allStacks, assignments, nowS]);

  // ---------------------------------------------------------------- input
  const latest = useRef({ v, fit, tool, hooked, pic, expanded });
  latest.current = { v, fit, tool, hooked, pic, expanded };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { v: cv, tool: t } = latest.current;
      const up = e.deltaY < 0;
      if (t?.kind === 'marshal') {
        setHookLevel({ stackId: t.st.id, angels: Math.max(t.st.base, Math.min(t.st.base + 12, t.angels + (up ? 1 : -1))) });
        return;
      }
      if (t?.kind === 'vector') {
        setHookSpeed(Math.max(150, Math.min(650, t.spd + (up ? 10 : -10))));
        return;
      }
      const r = el.getBoundingClientRect();
      const Wc = cv.W;
      const Hc = Wc * (r.height / r.width);
      const mx = cv.cx - Wc / 2 + ((e.clientX - r.left) / r.width) * Wc;
      const my = cv.cy - Hc / 2 + ((e.clientY - r.top) / r.height) * Hc;
      const k = up ? 1 / 1.15 : 1.15;
      const W2 = Math.max(4, Math.min(400, Wc * k));
      const c = clampCentre([mx + (cv.cx - mx) * (W2 / Wc), my + (cv.cy - my) * (W2 / Wc)]);
      onFit(null);
      setView({ cx: c[0], cy: c[1], W: W2 });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onFit]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    setCursor(toScope(e.clientX, e.clientY));
    const dg = drag.current;
    if (!dg) return;
    const dx = e.clientX - dg.x;
    const dy = e.clientY - dg.y;
    if (!dg.moved && Math.hypot(dx, dy) > 3) dg.moved = true;
    if (dg.moved) {
      const r = svgRef.current!.getBoundingClientRect();
      const c = clampCentre([dg.cx - (dx / r.width) * W, dg.cy - (dy / r.height) * H]);
      onFit(null);
      setView({ cx: c[0], cy: c[1], W });
    }
  };
  const onMouseUp = () => {
    const dg = drag.current;
    drag.current = null;
    if (dg?.moved) return;
    // background click
    if (tool?.kind === 'marshal' && hooked) {
      onAssign(hooked.id, { stackId: tool.st.id, angels: tool.angels, eatS: tool.eatS, fixS: tool.fixS });
      onHook(null);
    } else if (hooked) onHook(null);
  };
  const clickTrack = (e: React.MouseEvent, t: ScopeTrack, formationId?: string, collapsed?: boolean) => {
    e.stopPropagation();
    if (formationId && collapsed) {
      setExpanded((s) => new Set(s).add(formationId));
      onHook(t.id);
      return;
    }
    onHook(hookedId === t.id ? null : t.id);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onHook(null);
        setExpanded(new Set());
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onHook]);

  // ---------------------------------------------------------------- derived drawing data
  const conflictIds = new Set(pic.conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const hidden = new Set<string>();
  const collapsedLead = new Map<string, { fid: string; n: number }>();
  for (const f of pic.formations) {
    if (!f.collapsible || expanded.has(f.id)) continue;
    if (f.members.some((m) => conflictIds.has(m.id) || m.id === hookedId)) continue;
    collapsedLead.set(f.lead.id, { fid: f.id, n: f.members.length });
    for (const m of f.members) if (m !== f.lead) hidden.add(m.id);
  }
  const formationOf = new Map(pic.formations.flatMap((f) => f.members.map((m) => [m.id, f] as const)));

  const inView = (q: Pt, pad = 0) => q[0] >= vx + pad && q[0] <= vx + W - pad && q[1] >= vy + pad && q[1] <= vy + H - pad;

  // ---------------------------------------------------------------- render pieces
  const sym = (q: Pt, k: number) => `translate(${f2(q[0])} ${f2(q[1])}) scale(${k})`;

  const renderCarrier = (c: Carrier) => {
    const col = c.focus ? C.white : C.other;
    return (
      <g key={c.track.id}>
        <g transform={`${sym(c.track.p, kH * 1.6)} rotate(${f2(c.ship.brc)})`}>
          <path d={CARRIER_OUTLINE} fill={C.scope} stroke={col} strokeWidth={1.3} strokeLinejoin="miter" style={NS} />
        </g>
        {!c.focus && (
          <text x={c.track.p[0] + 1.6 * kX} y={c.track.p[1] + 0.3 * kX} fontSize={0.8 * kX} fill={C.other2} className="cc-mono">
            {c.track.hull}
          </text>
        )}
      </g>
    );
  };

  const overlays = () => {
    if (!ship) return null;
    const out: React.ReactNode[] = [];
    const REC = norm360(ship.fb + 180);
    // range rings + compass
    for (const r of [10, 20, 30, 40]) {
      out.push(<circle key={`ring${r}`} r={r} fill="none" stroke={C.ring} strokeWidth={1 * lw} style={NS} />);
      out.push(
        <text key={`ringt${r}`} x={0.3 * kX} y={-r - 0.3 * kX} fontSize={0.8 * kX} fill={C.ringText} className="cc-mono">
          {r}NM
        </text>,
      );
    }
    let ticks = '';
    for (let b = 0; b < 360; b += 10) {
      const a = P(b, 40);
      const i = P(b, b % 30 === 0 ? 38.6 : 39.3);
      ticks += `M${f2(i[0])} ${f2(i[1])}L${f2(a[0])} ${f2(a[1])}`;
      if (b % 30 === 0) {
        const t = P(b, 41.4);
        out.push(
          <text key={`cmp${b}`} x={t[0]} y={t[1] + 0.3 * kX} fontSize={0.8 * kX} fill={C.ringText} textAnchor="middle" className="cc-mono">
            {r3(b)}
          </text>,
        );
      }
    }
    out.push(<path key="ticks" d={ticks} stroke={C.ring} strokeWidth={1 * lw} style={NS} />);
    // CCAs: focus green, other carriers blue (always shown)
    for (const c of pic.carriers) {
      out.push(
        <circle
          key={`cca${c.track.id}`}
          cx={c.track.p[0]}
          cy={c.track.p[1]}
          r={50}
          fill="none"
          stroke={c.focus ? 'rgba(95,208,104,.45)' : 'rgba(62,155,212,.55)'}
          strokeWidth={1.2 * lw}
          strokeDasharray="8 6"
          style={NS}
        />,
      );
    }
    // coordination line: chord through the intersections of the two CCAs
    for (const c of pic.carriers) {
      if (c.focus) continue;
      const D = len(c.track.p);
      if (D <= 0 || D >= 100) continue;
      const a = D / 2;
      const h = Math.sqrt(50 * 50 - a * a);
      const u = mul(c.track.p, 1 / D);
      const m = mul(u, a);
      const n: Pt = [-u[1], u[0]];
      const p1 = add(m, mul(n, h));
      const p2 = add(m, mul(n, -h));
      out.push(<path key={`coord${c.track.id}`} d={d([p1, p2])} stroke={C.other2} strokeWidth={1.2 * lw} strokeDasharray="2 4" style={NS} />);
      out.push(
        <g key={`coordl${c.track.id}`} transform={sym(m, kX)}>
          <rect x={-6.2} y={-0.75} width={12.4} height={1.4} rx={0.7} fill="rgba(11,14,18,.85)" stroke={C.other} strokeWidth={1} style={NS} />
          <text y={0.25} fontSize={0.72} fill={C.other2} textAnchor="middle" className="cc-mono">
            COORD · {focus?.track.hull} │ {c.track.hull}
          </text>
        </g>,
      );
    }
    // BRC chevron and FB with 3/6/10 ticks
    const b6 = P(ship.brc, 6);
    const chev = [add(b6, mul(dir(ship.brc + 150), 0.8 * kX)), b6, add(b6, mul(dir(ship.brc - 150), 0.8 * kX))];
    out.push(<path key="brc" d={d([[0, 0], b6]) + d(chev)} stroke={C.overlay} strokeWidth={1 * lw} fill="none" style={NS} />);
    let fbt = d([[0, 0], P(REC, 10)]);
    for (const n of [3, 6, 10]) {
      const q = P(REC, n);
      const s = mul(dir(REC + 90), 0.5 * kX);
      fbt += d([sub(q, s), add(q, s)]);
    }
    out.push(<path key="fb" d={fbt} stroke={C.overlay} strokeWidth={1 * lw} fill="none" style={NS} />);
    out.push(
      <text key="brct" x={b6[0] + 0.6 * kX} y={b6[1]} fontSize={0.8 * kX} fill={C.text2} className="cc-mono">
        BRC {r3(ship.brc)}
      </text>,
    );
    // departure radials with flags at 35 DME
    for (const r of deps) {
      out.push(<path key={`dep${r}`} d={d(departurePath(r, ship))} stroke={C.overlay} strokeWidth={1.1 * lw} fill="none" style={NS} />);
      const fq = P(r, 35);
      out.push(
        <g key={`depf${r}`} transform={sym(fq, kX)}>
          <rect x={-2.1} y={-0.62} width={4.2} height={1.2} fill="rgba(11,14,18,.85)" stroke={C.overlayDim} strokeWidth={1} style={NS} />
          <text y={0.3} fontSize={0.8} textAnchor="middle" fill={C.text2} className="cc-mono">
            DR {r3(r)}
          </text>
        </g>,
      );
    }
    // marshal stacks: lowest hold, fix hash, arrival path, flag on the inbound leg
    for (const st of allStacks) {
      const fixNm = fixDme(st.base);
      const hold = holdPattern(st.r, fixNm, st.rh ? 'right' : 'left');
      const fx = P(st.r, fixNm);
      const nrm = mul(dir(st.r + 90), 0.55 * kX);
      out.push(<path key={`hold${st.id}`} d={d(hold, true) + d([sub(fx, nrm), add(fx, nrm)])} stroke={st.rh ? C.warn : C.overlay} strokeWidth={1.1 * lw} fill="none" style={NS} />);
      if (!st.rh) {
        const arr = arrivalPath(st.r, fixNm, ship);
        out.push(<path key={`arr${st.id}`} d={d(arr.path)} stroke={C.overlayDim} strokeWidth={1 * lw} strokeDasharray="4 4" fill="none" style={NS} />);
      }
      const lq = P(st.r, fixNm + 2.1);
      out.push(
        <g key={`stf${st.id}`} transform={sym(lq, kX)}>
          <rect x={-2.3} y={-0.62} width={4.6} height={1.2} fill="rgba(11,14,18,.85)" stroke={C.overlayDim} strokeWidth={1} style={NS} />
          <text y={0.3} fontSize={0.8} textAnchor="middle" fill={st.rh ? C.warn : C.text2} className="cc-mono">
            {st.id} {r3(st.r)}
          </text>
        </g>,
      );
    }
    // helo marshal (110° relative to FB, 5 NM, right-hand, 2 NM legs)
    const hr = heloMarshalRadial(ship);
    out.push(<path key="helo" d={d(holdPattern(hr, 5, 'right', HELO_HOLD), true)} stroke={C.overlayDim} strokeWidth={1 * lw} fill="none" style={NS} />);
    return out;
  };

  const trackColor = (t: ScopeTrack) => (conflictIds.has(t.id) ? C.conflict : t.sd === 'blue' ? C.own : C.white);
  const trailColor = (t: ScopeTrack) => (conflictIds.has(t.id) ? C.conflictTrail : t.sd === 'blue' ? C.ownTrail : C.whiteTrail);

  const renderTrack = (t: ScopeTrack) => {
    if (hidden.has(t.id)) return null;
    const col = trackColor(t);
    const fm = formationOf.get(t.id);
    const coll = collapsedLead.get(t.id);
    const ve = velocityEnd(t);
    const flipW = t.p[0] > vx + W - 14 * kT;
    const leaderDir: Pt = flipW ? [-Math.SQRT1_2, -Math.SQRT1_2] : [Math.SQRT1_2, -Math.SQRT1_2];
    const L0 = mul(leaderDir, 0.7);
    const L1 = mul(leaderDir, 2.4);
    const rows = tagRows(t, fm, !!coll);
    const wch = Math.max(...rows.map((r) => r.length)) * 0.9 * 0.6 + 0.5;
    const boxX = flipW ? L1[0] - wch : L1[0];
    const conflict = conflictIds.has(t.id);
    const shape =
      t.k === 'rotary' ? (
        <path d="M0 -0.5L0.5 0L0 0.5L-0.5 0Z" fill={col} stroke="rgba(0,0,0,.5)" strokeWidth={1} style={NS} />
      ) : /tanker/i.test(t.ty) ? (
        <circle r={0.45} fill={col} stroke="rgba(0,0,0,.5)" strokeWidth={1} style={NS} />
      ) : (
        <rect x={-0.4} y={-0.4} width={0.8} height={0.8} fill={col} stroke="rgba(0,0,0,.5)" strokeWidth={1} style={NS} />
      );
    return (
      <g key={t.id}>
        {t.trail.map((q, i) => (
          <rect
            key={i}
            x={q[0] - 0.16 * kH}
            y={q[1] - 0.16 * kH}
            width={0.32 * kH}
            height={0.32 * kH}
            fill={trailColor(t)}
            opacity={[0.8, 0.6, 0.45, 0.3, 0.2][i] ?? 0.2}
          />
        ))}
        {ve && <path d={d([t.p, ve])} stroke={col} strokeWidth={1.8} style={NS} />}
        <g transform={sym(t.p, kH)}>
          {shape}
          {coll && <rect x={-1.1} y={-1.1} width={2.2} height={2.2} fill="none" stroke={col} strokeWidth={1} strokeDasharray="3 2" style={NS} />}
          {conflict && <circle r={1.3} fill="none" stroke={C.conflictLine} strokeWidth={1.4} className="cc-blink" style={NS} />}
          {t.id === hookedId && <rect x={-0.9} y={-0.9} width={1.8} height={1.8} fill="none" stroke={C.hook} strokeWidth={1.4} style={NS} />}
          <rect
            x={-0.9}
            y={-0.9}
            width={1.8}
            height={1.8}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => clickTrack(e, t, fm?.id, !!coll)}
          />
        </g>
        <g transform={sym(t.p, kT)} style={{ pointerEvents: 'none' }}>
          <path d={d([L0, L1])} stroke={col} strokeWidth={1} style={NS} />
          <rect
            x={boxX - 0.2}
            y={L1[1] - 0.75}
            width={wch}
            height={rows.length * 1.0 + 0.35}
            fill="rgba(11,14,18,.72)"
            stroke={conflict ? C.conflictLine : 'none'}
            strokeWidth={1}
            style={NS}
          />
          {rows.map((r, i) => (
            <text key={i} x={boxX + 0.05} y={L1[1] + 0.3 + i} fontSize={0.9} fill={col} className="cc-mono">
              {r}
            </text>
          ))}
        </g>
      </g>
    );
  };

  const renderConflicts = () =>
    pic.conflicts.map((c) => {
      const mid = mul(add(c.cpa.a, c.cpa.b), 0.5);
      const label = `CPA ${c.cpa.latNm.toFixed(1)} NM / ${Math.round(c.cpa.vertFt / 100) * 100} FT · ${ms(c.cpa.tS)}`;
      const pin = inView(mid, 3 * kT) ? mid : add([v.cx, v.cy], mul(dir(bearingOf(sub(mid, [v.cx, v.cy]))), Math.min(W, H) / 2 - 5 * kT));
      return (
        <g key={`${c.a.id}-${c.b.id}`}>
          <path d={d([c.a.p, c.cpa.a]) + d([c.b.p, c.cpa.b])} stroke={C.conflictLine} strokeWidth={1.2} strokeDasharray="5 4" style={NS} />
          <path d={d([c.cpa.a, c.cpa.b])} stroke={C.conflictLine} strokeWidth={1.6} style={NS} />
          <g transform={sym(pin, kT)}>
            <rect x={-label.length * 0.27 - 0.3} y={-2.35} width={label.length * 0.54 + 0.6} height={1.25} fill="rgba(11,14,18,.9)" stroke={C.conflictLine} strokeWidth={1} style={NS} />
            <text y={-1.45} fontSize={0.9} textAnchor="middle" fill={C.conflict} className="cc-mono">
              {label}
            </text>
          </g>
        </g>
      );
    });

  const renderEdges = () => {
    const inset = (24 / size.w) * W;
    return pic.air
      .filter((t) => !hidden.has(t.id) && t.rng <= 60 && !inView(t.p))
      .map((t) => {
        const c: Pt = [v.cx, v.cy];
        const u = sub(t.p, c);
        const hw = W / 2 - inset;
        const hh = H / 2 - inset;
        const s = Math.min(Math.abs(hw / (u[0] || 1e-9)), Math.abs(hh / (u[1] || 1e-9)));
        const q = add(c, mul(u, s));
        return (
          <g key={`edge${t.id}`} transform={`${sym(q, kH)} rotate(${f2(bearingOf(u))})`}>
            <path d="M0 -0.6L0.5 0.4L-0.5 0.4Z" fill={trackColor(t)} />
            {conflictIds.has(t.id) && <circle r={1.1} fill="none" stroke={C.conflictLine} strokeWidth={1.4} className="cc-blink" style={NS} />}
          </g>
        );
      });
  };

  const renderTool = () => {
    if (!tool || !hooked) return null;
    if (tool.kind === 'marshal') {
      const fixNm = fixDme(tool.angels);
      const hold = holdPattern(tool.st.r, fixNm, tool.st.rh ? 'right' : 'left');
      let lv = '';
      for (let a = tool.st.base; a <= tool.st.base + 12; a++) {
        if (a === tool.angels) continue;
        const q = P(tool.st.r, fixDme(a));
        const n = mul(dir(tool.st.r + 90), 0.4 * kX);
        lv += d([sub(q, n), add(q, n)]);
      }
      const rows = [
        `${hooked.bd ?? hooked.cs ?? hooked.pi ?? hooked.id} → ${tool.st.id}${tool.angels} · ${fixNm} DME`,
        `ANGELS ${tool.angels} · FIX ${hms(tool.fixS)}Z`,
        `EAT ${hms(tool.eatS).slice(0, 5)}Z · ${tool.spd} KT`,
      ];
      return (
        <g style={{ pointerEvents: 'none' }}>
          <path d={d(tool.fl.path)} stroke={C.hook} strokeWidth={1.6} fill="none" style={NS} />
          <path d={d(hold, true)} stroke={C.hook} strokeWidth={1.4} fill="none" style={NS} />
          <path d={lv} stroke={C.hook} strokeWidth={1} opacity={0.6} style={NS} />
          {helperTag(tool.fx, rows)}
        </g>
      );
    }
    const rows = [
      `BRG ${r3(tool.brg)} · RNG ${tool.rng.toFixed(1)}`,
      `HDG ${r3(tool.fl.hdg)} · TRK DIST ${tool.fl.dist.toFixed(1)}`,
      `ETE ${ms((tool.fl.dist / tool.spd) * 3600)} · ${tool.spd} KT`,
    ];
    return (
      <g style={{ pointerEvents: 'none' }}>
        <path d={d(tool.fl.path)} stroke={C.hook} strokeWidth={1.4} strokeDasharray="6 4" fill="none" style={NS} />
        {cursor && helperTag(cursor, rows)}
      </g>
    );
  };

  const helperTag = (at: Pt, rows: string[]) => {
    const wch = Math.max(...rows.map((r) => r.length)) * 0.54 + 0.6;
    return (
      <g transform={sym(at, kT)}>
        <rect x={1} y={-0.9} width={wch} height={rows.length + 0.4} fill="rgba(11,14,18,.9)" stroke={C.hook} strokeWidth={1} style={NS} />
        {rows.map((r, i) => (
          <text key={i} x={1.3} y={0.15 + i} fontSize={0.9} fill={C.hookText} className="cc-mono">
            {r}
          </text>
        ))}
      </g>
    );
  };

  const renderAssignments = () =>
    [...assignments.entries()].map(([id, a]) => {
      const st = allStacks.find((s) => s.id === a.stackId);
      const t = pic.air.find((x) => x.id === id);
      if (!st || !t) return null;
      const fx = P(st.r, fixDme(a.angels));
      const label = `${t.bd ?? t.cs ?? t.pi ?? id} · ${st.id}${a.angels} · EAT ${hms(a.eatS).slice(0, 5)}`;
      return (
        <g key={`asg${id}`} style={{ pointerEvents: 'none' }} opacity={0.6}>
          <path d={d([t.p, fx])} stroke={C.hook} strokeWidth={1} strokeDasharray="2 3" style={NS} />
          <g transform={sym(fx, kT)}>
            <text x={1} y={0.3} fontSize={0.8} fill={C.hookText} className="cc-mono">
              {label}
            </text>
          </g>
        </g>
      );
    });

  // bottom readouts
  const cur = cursor && pic.proj ? { brg: bearingOf(cursor), rng: len(cursor), ll: pic.proj.toLatLon(cursor) } : null;
  const fmtLL = (x: number, pos: string, neg: string, w: number) => {
    const a = Math.abs(x);
    const dg = Math.floor(a);
    const mn = (a - dg) * 60;
    return `${String(dg).padStart(w, '0')}°${mn.toFixed(2).padStart(5, '0')}'${x >= 0 ? pos : neg}`;
  };
  const scaleBarPx = (10 / W) * size.w;

  return (
    <div ref={boxRef} className="cc-scope" onMouseLeave={() => setCursor(null)}>
      <svg
        ref={svgRef}
        viewBox={`${f2(vx)} ${f2(vy)} ${f2(W)} ${f2(H)}`}
        preserveAspectRatio="none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={{ cursor: hooked ? 'crosshair' : drag.current?.moved ? 'grabbing' : 'default' }}
      >
        <g>{overlays()}</g>
        <g>{pic.carriers.map(renderCarrier)}</g>
        <g>{renderAssignments()}</g>
        <g>{renderConflicts()}</g>
        <g>{pic.air.map(renderTrack)}</g>
        <g>{renderEdges()}</g>
        <g>{renderTool()}</g>
      </svg>

      <div className="cc-scope-toolbar">
        {(['r50', 'cca', 'dep', 'app'] as const).map((k) => (
          <button key={k} className={fit === k ? 'on' : ''} onClick={() => onFit(k)}>
            {k === 'r50' ? '50NM' : k.toUpperCase()}
          </button>
        ))}
        <span className="sep" />
        <button
          onClick={() => {
            onFit(null);
            setView({ cx: v.cx, cy: v.cy, W: Math.min(400, W * 1.15) });
          }}
        >
          −
        </button>
        <span className="cc-mono rng">RNG {Math.round(W / 2)}</span>
        <button
          onClick={() => {
            onFit(null);
            setView({ cx: v.cx, cy: v.cy, W: Math.max(4, W / 1.15) });
          }}
        >
          +
        </button>
      </div>

      <div className="cc-scope-bottom cc-mono">
        <span className="scalebar" style={{ width: scaleBarPx }} />
        <span>10 NM</span>
        <span className="flex" />
        {cur && (
          <span>
            {r3(cur.brg)}° {cur.rng.toFixed(1)} NM · {fmtLL(cur.ll.lat, 'N', 'S', 2)} {fmtLL(cur.ll.lon, 'E', 'W', 3)}
          </span>
        )}
      </div>
      {!focus && <div className="cc-scope-empty">No carrier in the picture</div>}
    </div>
  );
};

export default Scope;
