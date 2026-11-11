/**
 * The Nimitz flight deck, to scale (1 SVG unit = 1 m), bow right and port up, from the trace over the DCS
 * model (nimitzDeck.gen.ts). Markings are drawn at their painted widths and in the model's colours
 * (white paint, amber-and-red elevator lines, red-and-white foul lines, tan jet blast deflectors), darkened so aircraft,
 * routes and alerts stand out. Base labels (catapults, elevators, island) always show; the rest are
 * layers the boss turns on.
 */
import React from 'react';
import { CATS, NIMITZ as G, TAXI_ROUTES, areaCentroid, centroid, line, ring, roundRing, type DeckLayer, type V } from './deck.ts';

const C = {
  deck: '#1D2228',
  edge: '#4A5562',
  paint: '#838C95', // deck white, darkened
  paintDim: '#6C757E',
  yellow: '#A98A35',
  red: '#A2453D',
  elevLine: '#B9923A', // elevator edge and safety line: amber, dashed with red on the model
  foulWhite: '#8A939B',
  jbdFill: '#4A4536',
  jbdEdge: '#A98A35',
  catTrack: '#4C545D',
  catStart: '#6A737C',
  struct: '#3E4854',
  structEdge: '#6E7A88',
  label: '#93A1B0',
};

const NAMES: Record<string, string> = { Crotch: 'CROTCH', Point: 'POINT', Corral: 'CORRAL', 'Junk Yard': 'JUNK YARD', Patio: 'PATIO', Finger: 'FINGER', Box: 'BOX', Street: 'STREET', Sixpack: 'SIX-PACK' };

const T: React.FC<{ p: V; children: React.ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; rot?: number; weight?: number; opacity?: number; font?: string }> = ({ p, children, size = 3.4, fill = C.label, anchor = 'middle', rot, weight, opacity, font }) => (
  <text x={p[0]} y={-p[1]} textAnchor={anchor} dominantBaseline="central" transform={rot ? `rotate(${rot} ${p[0]} ${-p[1]})` : undefined} style={{ fontSize: size, fill, fontWeight: weight, opacity, letterSpacing: '.04em', ...(font ? { fontFamily: font, letterSpacing: 0 } : {}) }}>
    {children}
  </text>
);

// ---------------------------------------------------------------- catapult labels: along each track, just off it

/** a point `s` metres along catapult k from its shuttle start, `o` metres to port of the track */
const onCatTrack = (k: string, s: number, o: number): V => {
  const [a, b] = CATS[k];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return [a[0] + u[0] * s - u[1] * o, a[1] + u[1] * s + u[0] * o];
};
const catDeg = (k: string) => {
  const [a, b] = CATS[k];
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
};
// the side away from the neighbouring catapult: 1 starboard, 2 port, 3 starboard, 4 starboard (port of 4 is the deck edge)
const CAT_SIDE: Record<string, number> = { '1': -1, '2': 1, '3': -1, '4': -1 };
const CAT_LABEL = Object.fromEntries(Object.keys(CATS).map((k) => [k, { p: onCatTrack(k, 5, CAT_SIDE[k] * 3.1), rot: -catDeg(k) }]));

// ---------------------------------------------------------------- elevator and island labels: area centres, on one line

const STBD = ['1', '2', '3'];
const islandC = areaCentroid(G.struct['Island']);
const stbdY = (STBD.reduce((s, k) => s + areaCentroid(G.elev[k].poly)[1], 0) + islandC[1]) / (STBD.length + 1);
const EL_LABEL: Record<string, V> = Object.fromEntries(
  Object.entries(G.elev).map(([k, e]) => {
    const c = areaCentroid(e.poly);
    return [k, STBD.includes(k) ? [c[0], stbdY] : c];
  }),
);
const ISLAND_LABEL: V = [islandC[0], stbdY];

// ---------------------------------------------------------------- hull number: hollow block glyphs, tops to the bow

/**
 * Glyph centrelines in a 4 x 10.2 m box (u right, v up), the model's painted style: the 7 and 1 are
 * measured from it (a bar-and-diagonal 7, a plain bar 1); the other digits are drawn to match.
 */
const DIGITS: Record<string, [number, number][][]> = {
  '0': [[[0, 0], [4, 0], [4, 10.2], [0, 10.2], [0, 0]]],
  '1': [[[2, 0.2], [2, 10.2]]],
  '2': [[[0, 10.2], [4, 10.2], [4, 5.1], [0, 5.1], [0, 0], [4, 0]]],
  '3': [[[0, 10.2], [4, 10.2], [4, 0], [0, 0]], [[0.8, 5.1], [4, 5.1]]],
  '4': [[[0, 10.2], [0, 4], [4, 4]], [[3, 10.2], [3, 0]]],
  '5': [[[4, 10.2], [0, 10.2], [0, 5.1], [4, 5.1], [4, 0], [0, 0]]],
  '6': [[[4, 10.2], [0, 10.2], [0, 0], [4, 0], [4, 5.1], [0, 5.1]]],
  '7': [[[0, 10.2], [4, 10.2], [4, 9.45], [0.5, 0]]],
  '8': [[[0, 0], [4, 0], [4, 10.2], [0, 10.2], [0, 0]], [[0, 5.1], [4, 5.1]]],
  '9': [[[4, 5.1], [0, 5.1], [0, 10.2], [4, 10.2], [4, 0], [0, 0]]],
};
/** the measured 7's box: its bottom-left corner on the deck (v runs to the bow, u to starboard) */
const BOW_O: V = [G.bow.seven[0][0], Math.max(...G.bow.seven.map((p) => p[1]))];
const BOW_ADV = 6.2; // glyph advance: the 1's bar sits 8.2 m from the 7's port edge
const bowGlyphs = (digits: string): string =>
  [...digits].flatMap((ch, i) => (DIGITS[ch] ?? []).map((q) => line(q.map(([u, v]) => [BOW_O[0] + v, BOW_O[1] - (u + i * BOW_ADV)] as V)))).join('');

// ---------------------------------------------------------------- helo spot numbers: in their painted box, tops to the bow

const heloNum = (q: V[]) => {
  const sides: [V, V][] = q.map((p, i) => [p, q[(i + 1) % q.length]]);
  const len = (s: [V, V]) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
  const [p0, p1] = sides.reduce((best, s) => (len(s) > len(best) ? s : best));
  const fwd: V = p1[0] >= p0[0] ? [p1[0] - p0[0], p1[1] - p0[1]] : [p0[0] - p1[0], p0[1] - p1[1]];
  return { c: centroid(q), rot: 90 - (Math.atan2(fwd[1], fwd[0]) * 180) / Math.PI, h: Math.hypot(fwd[0], fwd[1]) };
};

export const DeckDrawing: React.FC<{
  layers: Set<DeckLayer>;
  /** hull number painted on the bow (CVN-71 -> 71) */
  hull?: string;
  /** JBDs raised (a jet spotted on that catapult) */
  jbdUp?: Record<string, boolean>;
}> = ({ layers, hull, jbdUp = {} }) => {
  const L = G.la;
  const num = /(\d{2})$/.exec(hull ?? '')?.[1];
  const bw = G.bow.stroke;
  return (
    <g>
      {/* hull, elevators, island */}
      <path d={ring(G.outline)} fill={C.deck} stroke={C.edge} strokeWidth={0.5} strokeLinejoin="round" />
      {/* elevator edge and safety line: alternating amber and red, ~0.4 m each on the model (drawn 0.5 m to stay legible) */}
      <path d={Object.values(G.elev).map((e) => ring(e.poly) + line(e.safety)).join('')} fill="none" stroke={C.elevLine} strokeWidth={0.36} strokeLinejoin="round" />
      <path d={Object.values(G.elev).map((e) => ring(e.poly) + line(e.safety)).join('')} fill="none" stroke={C.red} strokeWidth={0.36} strokeLinejoin="round" strokeDasharray="0.5 0.5" />
      <path d={roundRing(G.struct['Island'], 1.6)} fill={C.struct} stroke={C.structEdge} strokeWidth={0.35} />
      <path d={roundRing(G.struct['Radar Mast'], 0.8)} fill={C.struct} stroke={C.structEdge} strokeWidth={0.3} />

      {/* helo spots (optional): painted under the landing-area markings and the catapult tracks, as on the model */}
      {layers.has('helo') && (
        <g>
          <path d={G.helo.map((h) => ring(h.t) + h.sq.map(ring).join('') + (h.ext ? ring(h.ext) : '')).join('')} fill="none" stroke={C.paint} strokeWidth={0.22} strokeLinejoin="miter" />
          {G.helo
            .filter((h) => h.num)
            .map((h) => {
              const n = heloNum(h.num!);
              return (
                <T key={h.n} p={n.c} size={n.h * 1.38} rot={n.rot} fill={C.paint} weight={700} font="Arial, Helvetica, sans-serif">
                  {h.n}
                </T>
              );
            })}
        </g>
      )}
      {/* landing area: thin outer and wide inner borders joined by blocks, centreline with yellow dashes */}
      <path d={ring(L.sternRd)} fill={C.paintDim} opacity={0.5} />
      <path d={ring(L.launchRd)} fill={C.paintDim} opacity={0.7} />
      <path d={ring(L.outer)} fill="none" stroke={C.paintDim} strokeWidth={0.5} />
      <path d={line(L.li) + line(L.ri)} fill="none" stroke={C.paintDim} strokeWidth={0.93} />
      <path d={L.hash.map(ring).join('')} fill={C.paintDim} />
      <path d={line(L.c)} fill="none" stroke={C.paintDim} strokeWidth={0.9} />
      <path d={L.yellow.map(line).join('')} fill="none" stroke={C.yellow} strokeWidth={0.9} />
      <path d={line(L.rdMark)} fill="none" stroke={C.yellow} strokeWidth={1.1} />
      {/* foul lines (landing area and catapults): alternating white and red, ~1.7 m each */}
      <path d={G.safety.map(line).join('')} fill="none" stroke={C.foulWhite} strokeWidth={0.3} />
      <path d={G.safety.map(line).join('')} fill="none" stroke={C.red} strokeWidth={0.3} strokeDasharray="1.7 1.7" />
      {/* arresting gear */}
      <path d={G.wires.map(line).join('')} fill="none" stroke="#6E7882" strokeWidth={0.4} strokeDasharray="0.8 0.6" />

      {/* catapults: track with lighter end blocks, jet blast deflector behind it */}
      {Object.entries(CATS).map(([k, [a, b]]) => (
        <g key={k}>
          <path d={line([a, b])} stroke={C.catTrack} strokeWidth={1.56} strokeLinecap="butt" />
          {/* both ends of the track are lighter grey blocks on the model, ~3 m long, track width */}
          <path d={line([a, onCatTrack(k, 3, 0)]) + line([onCatTrack(k, Math.hypot(b[0] - a[0], b[1] - a[1]) - 3, 0), b])} stroke={C.catStart} strokeWidth={1.56} strokeLinecap="butt" />
          <path d={ring(G.jbd[k])} fill={jbdUp[k] ? 'rgba(222,154,31,.4)' : C.jbdFill} stroke={jbdUp[k] ? '#E7B04F' : C.jbdEdge} strokeWidth={jbdUp[k] ? 0.6 : 0.35} />
        </g>
      ))}

      {/* hull number: hollow glyphs (paint stroke, then the deck through the middle) */}
      {num && (
        <g fill="none" strokeLinejoin="miter" strokeLinecap="square">
          <path d={bowGlyphs(num)} stroke={C.paint} strokeWidth={bw} />
          <path d={bowGlyphs(num)} stroke={C.deck} strokeWidth={bw - 0.3} />
        </g>
      )}

      {/* optional layers */}
      {layers.has('gear') && (
        <g fill="none" stroke={C.structEdge} strokeWidth={0.3}>
          <path d={ring(G.struct['LSO Platform'])} />
          <path d={ring(G.struct['IFLOLS Platform'])} />
          <path d={line(G.struct['IFLOLS Datum Lights'])} stroke={C.red} strokeWidth={0.5} />
          <path d={ring(G.struct['Cats 1 & 2 Shooter Bubble'])} stroke={C.elevLine} />
          <path d={G.ordnance.map(ring).join('')} stroke={C.elevLine} />
          <path d={G.barricade.map(ring).join('')} />
        </g>
      )}
      {layers.has('areas') && <path d={G.parking.map((a) => ring(a.poly)).join('')} fill="rgba(111,182,230,.05)" stroke="#6FB6E6" strokeOpacity={0.45} strokeWidth={0.35} strokeDasharray="2 1.2" />}
      {layers.has('routes') && (
        <g fill="none" strokeWidth={0.35} strokeLinejoin="round">
          {TAXI_ROUTES.map((r) => (
            <path key={`${r.kind}${r.spot}`} d={line(r.pts)} stroke={r.kind === 'to' ? '#5FD068' : '#6FB6E6'} strokeOpacity={0.45} />
          ))}
        </g>
      )}

      {/* labels */}
      <g style={{ pointerEvents: 'none' }}>
        {Object.keys(CATS).map((k) => (
          <g key={k} transform={`rotate(${CAT_LABEL[k].rot} ${CAT_LABEL[k].p[0]} ${-CAT_LABEL[k].p[1]})`}>
            <rect x={CAT_LABEL[k].p[0] - 0.9} y={-CAT_LABEL[k].p[1] - 1.85} width={10.8} height={3.7} rx={0.5} fill="#0B0E12" stroke="#7D8896" strokeWidth={0.3} />
            <T p={CAT_LABEL[k].p} anchor="start" size={2.6} fill="#C9D3DD">{`CAT ${k}`}</T>
          </g>
        ))}
        {Object.keys(G.elev).map((k) => (
          <T key={k} p={EL_LABEL[k]} fill={C.elevLine}>{`EL ${k}`}</T>
        ))}
        <T p={ISLAND_LABEL} fill="#C9D3DD" size={3}>ISLAND</T>
        {layers.has('areas') &&
          G.parking.map((a) => (
            <T key={a.name} p={areaCentroid(a.poly)} fill="#6FB6E6" size={2.8} opacity={0.85}>
              {NAMES[a.name] ?? a.name.toUpperCase()}
            </T>
          ))}
        {layers.has('wires') &&
          G.wires.flatMap((w, i) => {
            // a numbered disc just beyond each end of the wire, along its line; the number squared to the landing area
            const [a, b] = w;
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
            const R = 1.6;
            return [
              [a[0] - u[0] * (R + 0.3), a[1] - u[1] * (R + 0.3)] as V,
              [b[0] + u[0] * (R + 0.3), b[1] + u[1] * (R + 0.3)] as V,
            ].map((p, j) => (
              <g key={`${i}${j}`}>
                <circle cx={p[0]} cy={-p[1]} r={R} fill="#0B0E12" stroke="#9AA4AE" strokeWidth={0.3} />
                <T p={p} size={2.1} fill="#C9D3DD" weight={600} rot={-G.laDeg}>
                  {i + 1}
                </T>
              </g>
            ));
          })}
        {layers.has('gear') && (
          <>
            {/* both off the port deck edge, clear of their platforms: LSO outboard of its platform, IFLOLS aft of the lens */}
            <T p={[centroid(G.struct['LSO Platform'])[0], Math.max(...G.struct['LSO Platform'].map((q) => q[1])) + 2.2]} size={2.4}>LSO</T>
            <T p={[Math.min(...G.struct['IFLOLS Platform'].map((q) => q[0])) - 1.5, centroid(G.struct['IFLOLS Platform'])[1] + 1]} size={2.4} anchor="end">IFLOLS</T>
          </>
        )}
        {layers.has('spots') &&
          TAXI_ROUTES.filter((r) => r.kind === 'park').map((r) => {
            const p = r.pts[r.pts.length - 1];
            return (
              <g key={r.spot}>
                <circle cx={p[0]} cy={-p[1]} r={1.9} fill="#0B0E12" stroke="#6FB6E6" strokeWidth={0.3} />
                <T p={p} size={2} fill="#6FB6E6" weight={600}>
                  {r.spot}
                </T>
              </g>
            );
          })}
      </g>

      {/* scale and orientation */}
      <g style={{ pointerEvents: 'none' }}>
        <path d="M110 45H160M110 43.5V46.5M160 43.5V46.5" stroke="#6B7683" strokeWidth={0.4} />
        <T p={[135, -41.6]} size={2.6} fill="#6B7683">50 M</T>
        <T p={[172, -45]} size={2.6} fill="#6B7683" anchor="end">BOW →</T>
      </g>
    </g>
  );
};
