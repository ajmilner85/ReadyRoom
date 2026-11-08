/**
 * Nimitz flight deck geometry and the F/A-18C planform, copied from catcc-handoff/mockup/Boss.dc.html
 * (blueprint-traced, metres; X forward, Y port; origin = 3-wire touchdown point), plus helpers to
 * place live aircraft on the deck.
 */
import type { ScopeTrack, Carrier } from '../scopeModel.ts';

type V = [number, number];
const G = {
  outline: [[260.82,-6.51],[257.91,-3.92],[257.55,6.09],[259.0,7.94],[256.09,10.91],[189.27,20.17],[186.36,21.28],[185.64,20.91],[183.82,22.77],[182.37,23.14],[178.37,26.1],[178.37,31.29],[176.2,33.51],[168.57,33.88],[158.04,41.67],[120.99,42.04],[100.65,37.59],[1.51,38.7],[0.42,39.81],[-25.0,40.18],[-26.09,39.07],[-27.55,39.07],[-30.09,36.48],[-35.54,21.65],[-70.4,18.32],[-72.94,15.35],[-74.76,7.57],[-71.85,-19.85],[-69.68,-22.08],[-59.87,-21.34],[-52.24,-27.26],[-32.27,-29.49],[-31.18,-32.45],[-29.0,-34.68],[-24.64,-35.05],[-22.46,-33.19],[-19.92,-35.79],[11.68,-35.42],[50.17,-35.79],[55.26,-36.53],[79.59,-36.9],[80.32,-36.16],[103.2,-36.9],[146.78,-36.9],[185.64,-18.0],[242.66,-13.55],[246.65,-13.92],[255.73,-12.07],[260.82,-6.51]] as V[],
  LA: { c: [[-73.451,-4.767],[170.093,33.806]] as V[], pi: [[-74.317,3.398],[159.677,40.459]] as V[], po: [[-74.655,6.584],[147.532,41.775]] as V[], si: [[-72.584,-12.932],[178.37,26.815]] as V[], so: [[-72.246,-16.119],[181.181,24.02]] as V[] },
  wires: [[[-18.793,-12.816],[-23.956,19.777]],[[-6.774,-10.913],[-11.936,21.681]],[[4.643,-9.104],[-0.519,23.489]],[[16.612,-7.209],[11.45,25.385]]] as V[][],
  cats: { '1': [[142.074,-13.438],[249.92,-7.18]], '2': [[138.396,6.273],[249.92,8.88]], '3': [[45.153,20.475],[157.67,29.25]], '4': [[27.6,32.269],[141.69,31.7]] } as Record<string, V[]>,
  island: [[19.478,-24.159],[46.599,-35.603]] as V[],
  elev: [[[-26.09,36.48],[-25.73,23.51],[-24.28,22.02],[-2.49,21.65],[-1.03,23.14],[-1.4,27.21],[1.14,33.51],[1.14,36.11],[-0.31,37.59],[-24.64,37.96]],[[54.17,-19.85],[54.53,-32.82],[55.98,-34.31],[78.14,-34.68],[79.59,-33.19],[77.05,-26.52],[77.05,-20.59],[75.6,-19.11],[55.62,-18.37]],[[100.29,-20.22],[100.65,-32.82],[102.11,-34.31],[123.53,-34.68],[124.99,-33.19],[124.99,-30.97],[121.72,-25.04],[121.72,-20.22],[120.27,-18.74],[101.74,-18.74]],[[-19.92,-20.59],[-20.28,-31.34],[-18.47,-33.56],[3.69,-33.19],[5.14,-31.71],[2.23,-23.93],[2.23,-20.59],[0.78,-19.11],[-18.47,-19.11]]] as V[][],
  bars: { p: [-56.78,-33.952,-11.123,11.705,34.534,57.363,80.191,103.02,125.848,148.677], s: [-56.78,-33.952,-11.123,11.705,34.534,57.363,80.191,103.02,125.848,148.677,171.506], in: 8.2, out: 11.4 },
  rd: [[-72.246,-16.119],[-74.655,6.584],[-71.655,7.059],[-69.246,-15.644]] as V[],
  jbd: { '1': [[126.7,-14.33],3.321], '2': [[123.0,5.913],1.339], '3': [[29.8,19.278],4.459], '4': [[12.2,32.346],-0.286] } as Record<string, [V, number]>,
};
export const CATS = G.cats;

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const P = (p: V) => `${f(p[0])},${f(-p[1])}`;
const seg = (a: V, b: V) => `M${P(a)}L${P(b)}`;
const ring = (q: V[]) => `M${q.map(P).join('L')}Z`;

export const DECK = (() => {
  const TY = 6.866;
  const r9 = (9 * Math.PI) / 180;
  const LU: V = [Math.cos(r9), Math.sin(r9)];
  const LN: V = [-LU[1], LU[0]];
  const laP = (s: number, o: number): V => [LU[0] * s + LN[0] * o, TY + LU[1] * s + LN[1] * o];
  const B = G.bars;
  const bars = B.p.map((s) => seg(laP(s, B.in), laP(s, B.out))).concat(B.s.map((s) => seg(laP(s, -B.in), laP(s, -B.out)))).join('');
  let rails = '';
  let shuttles = '';
  Object.values(G.cats).forEach(([a, b]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const n: V = [-u[1] * 0.7, u[0] * 0.7];
    rails += seg([a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]]) + seg([a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]]);
    shuttles += seg(a, [a[0] + u[0] * 2, a[1] + u[1] * 2]);
  });
  const jbdPoly = ([c, ang]: [V, number]) => {
    const r = (ang * Math.PI) / 180;
    const fw: V = [Math.cos(r), Math.sin(r)];
    const pp: V = [-fw[1], fw[0]];
    const W = 4.85;
    const D = 1.6;
    const q = (i: number, j: number): V => [c[0] + fw[0] * D * i + pp[0] * W * j, c[1] + fw[1] * D * i + pp[1] * W * j];
    return ring([q(-1, -1), q(1, -1), q(1, 1), q(-1, 1)]);
  };
  const J = G.jbd;
  const [i0, i1] = G.island;
  const catLbl = (k: string, dx: number, dy: number) => {
    const b = G.cats[k][1];
    return { x: f(b[0] + dx), y: f(-b[1] + dy) };
  };
  return {
    outline: G.outline.map(P).join(' '),
    rd: G.rd.map(P).join(' '),
    elev: G.elev.map(ring).join(''),
    edgeIn: seg(G.LA.pi[0], G.LA.pi[1]) + seg(G.LA.si[0], G.LA.si[1]),
    edgeOut: seg(G.LA.po[0], G.LA.po[1]) + seg(G.LA.so[0], G.LA.so[1]),
    cl: seg(G.LA.c[0], G.LA.c[1]),
    bars,
    rails,
    shuttles,
    wires: G.wires.map((w) => seg(w[0], w[1])).join(''),
    jbd: (k: string) => jbdPoly(J[k]),
    isl: { x: f(i0[0]), y: f(-i0[1]), w: f(i1[0] - i0[0]), h: f(i0[1] - i1[1]), cx: f((i0[0] + i1[0]) / 2), cy: f(-(i0[1] + i1[1]) / 2 + 1.3) },
    c1l: catLbl('1', 1.5, 5.5),
    c2l: catLbl('2', -10, -3),
    c3l: catLbl('3', -14, -3),
    c4l: catLbl('4', -14, -3),
  };
})();

// ---------------------------------------------------------------- F/A-18C planform
const mir = (p: V[]): V[] => p.concat(p.slice().reverse().map((q) => [-q[0], q[1]] as V));
const ST: V[] = [[0.5,0.001],[0.485,0.008],[0.46,0.015],[0.43,0.021],[0.40,0.025],[0.36,0.027],[0.30,0.03],[0.22,0.038],[0.12,0.046],[0,0.054],[-0.12,0.068],[-0.22,0.082],[-0.30,0.084],[-0.38,0.078],[-0.44,0.066],[-0.48,0.056]];
const W0: V[] = [[0.027,0.30],[0.036,0.277],[0.043,0.255],[0.048,0.23],[0.052,0.2],[0.057,0.165],[0.063,0.13],[0.069,0.1],[0.074,0.07],[0.079,0.04],[0.082,0.015],[0.084,-0.02]];
const WS: V[] = W0.concat([[0.352,-0.143],[0.352,-0.255],[0.086,-0.262],[0.07,-0.265]]);
const WF: V[] = W0.concat([[0.245,-0.094],[0.245,-0.258],[0.086,-0.262],[0.07,-0.265]]);
const STAB: V[] = [[0.05,-0.31],[0.198,-0.462],[0.206,-0.476],[0.207,-0.5],[0.2,-0.522],[0.19,-0.527],[0.058,-0.476]];
const area = (q: V[]) => q.reduce((a, p, i) => { const n = q[(i + 1) % q.length]; return a + p[0] * n[1] - n[0] * p[1]; }, 0);
const norm = (q: V[]) => (area(q) < 0 ? q.slice().reverse() : q);
const FUS = mir(ST.map((s) => [s[1], s[0]] as V));
export const SPREAD = [FUS, mir(WS), mir(STAB)].map(norm);
export const FOLDED = [FUS, mir(WF), mir(STAB)].map(norm);

/** Planform on the deck (metres): x forward, y port, angle a (deg, CCW from bow). */
export function jetShape(polys: V[][], x: number, y: number, a: number, L = 17.07): string {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return polys.map((q) => 'M' + q.map((p) => { const fx = p[1] * L; const py = p[0] * L; return f(x + c * fx - s * py) + ',' + f(-(y + s * fx + c * py)); }).join('L') + 'Z').join('');
}

/** Planform as an icon (px, nose up) for the LSO pattern view. */
export function hornetIcon(IL = 30): string {
  return [FUS, mir(WS), mir(STAB)].map(norm).map((q) => 'M' + q.map((p) => f(p[0] * IL) + ' ' + f(-p[1] * IL)).join('L') + 'Z').join('');
}

// ---------------------------------------------------------------- live aircraft on deck

/** DCS places a carrier's reference point near mid-ships; the deck model's origin is the 3-wire. */
export const DCS_ORIGIN_X = 94;
const M_PER_NM = 1852;

export interface DeckJet {
  t: ScopeTrack;
  x: number;
  y: number;
  /** heading relative to the bow, deg CCW (deck drawing convention) */
  a: number;
  moving: boolean;
}

export function onDeck(c: Carrier, air: ScopeTrack[]): DeckJet[] {
  const D = Math.PI / 180;
  const h = c.ship.brc * D;
  const fwd: V = [Math.sin(h), -Math.cos(h)];
  const port: V = [fwd[1], -fwd[0]]; // left of the bow (heading − 90°) in scope coords
  const out: DeckJet[] = [];
  for (const t of air) {
    const dx = (t.p[0] - c.track.p[0]) * M_PER_NM;
    const dy = (t.p[1] - c.track.p[1]) * M_PER_NM;
    if (Math.hypot(dx, dy) > 260) continue;
    if (t.air === true || t.alt > 200) continue;
    const x = dx * fwd[0] + dy * fwd[1] + DCS_ORIGIN_X;
    const y = dx * port[0] + dy * port[1];
    const rel = (((t.hdg ?? c.ship.brc) - c.ship.brc + 540) % 360) - 180;
    const relSpeed = Math.abs((t.gs ?? 0) - (c.track.gs ?? 0));
    out.push({ t, x, y, a: -rel, moving: relSpeed > 3 });
  }
  return out;
}

/** Inside the landing area strip (around the angled-deck centreline, ±12 m)? */
export function inLandingArea(x: number, y: number): boolean {
  const [a, b] = G.LA.c;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = (x - a[0]) * u[0] + (y - a[1]) * u[1];
  const o = Math.abs((x - a[0]) * -u[1] + (y - a[1]) * u[0]);
  return s > 0 && s < 200 && o < 12;
}

/** Board number of the jet spotted on a catapult (within 12 m of its start), if any. */
export function onCat(jets: DeckJet[], k: string): DeckJet | undefined {
  const a = G.cats[k][0];
  return jets.find((j) => Math.hypot(j.x - a[0], j.y - a[1]) < 12);
}
