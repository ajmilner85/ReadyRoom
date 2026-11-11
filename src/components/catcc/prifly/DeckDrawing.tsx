/**
 * The Nimitz flight deck, to scale (1 SVG unit = 1 m), bow right and port up, from the trace over the DCS
 * model (nimitzDeck.gen.ts). Markings are drawn at their painted widths but toned down so aircraft,
 * routes and alerts stand out. Base labels (catapults, elevators, island) always show; the rest are
 * layers the boss turns on.
 */
import React from 'react';
import { CATS, NIMITZ as G, TAXI_ROUTES, centroid, line, ring, type DeckLayer, type V } from './deck.ts';

const C = {
  deck: '#2A3038',
  edge: '#5E6A78',
  paint: '#B9C2CB', // deck white, toned down
  yellow: '#C9A23A',
  red: '#B4483F',
  elev: '#232930',
  elevEdge: '#A88E45',
  struct: '#4A5562',
  structEdge: '#7C8794',
  label: '#93A1B0',
};

const NAMES: Record<string, string> = { Crotch: 'CROTCH', Point: 'POINT', Corral: 'CORRAL', 'Junk Yard': 'JUNK YARD', Patio: 'PATIO', Finger: 'FINGER', Box: 'BOX', Street: 'STREET', Sixpack: 'SIX-PACK' };

const T: React.FC<{ p: V; children: React.ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; rot?: number; weight?: number; opacity?: number }> = ({ p, children, size = 3.4, fill = C.label, anchor = 'middle', rot, weight, opacity }) => (
  <text x={p[0]} y={-p[1]} textAnchor={anchor} dominantBaseline="central" transform={rot ? `rotate(${rot} ${p[0]} ${-p[1]})` : undefined} style={{ fontSize: size, fill, fontWeight: weight, opacity, letterSpacing: '.04em' }}>
    {children}
  </text>
);

/** a point `s` metres along catapult k from its shuttle start, `o` metres to port of the track */
const onCatTrack = (k: string, s: number, o: number): V => {
  const [a, b] = CATS[k];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return [a[0] + u[0] * s - u[1] * o, a[1] + u[1] * s + u[0] * o];
};
const CAT_LABEL: Record<string, V> = { '1': onCatTrack('1', 12, -5), '2': onCatTrack('2', 12, 5), '3': onCatTrack('3', 12, -5), '4': onCatTrack('4', 12, -5) };

export const DeckDrawing: React.FC<{
  layers: Set<DeckLayer>;
  /** hull number painted on the bow (CVN-71 -> 71) */
  hull?: string;
  /** JBDs raised (a jet spotted on that catapult) */
  jbdUp?: Record<string, boolean>;
}> = ({ layers, hull, jbdUp = {} }) => {
  const L = G.la;
  const num = /(\d+)$/.exec(hull ?? '')?.[1];
  return (
    <g>
      {/* hull, elevators, island */}
      <path d={ring(G.outline)} fill={C.deck} stroke={C.edge} strokeWidth={0.5} strokeLinejoin="round" />
      {Object.entries(G.elev).map(([k, e]) => (
        <g key={k}>
          <path d={ring(e.poly)} fill={C.elev} stroke={C.elevEdge} strokeWidth={0.35} />
          <path d={line(e.safety)} fill="none" stroke={C.elevEdge} strokeWidth={0.3} strokeDasharray="1.6 1.2" opacity={0.7} />
        </g>
      ))}
      <path d={ring(G.struct['Island'])} fill={C.struct} stroke={C.structEdge} strokeWidth={0.35} />
      <path d={ring(G.struct['Radar Mast'])} fill={C.struct} stroke={C.structEdge} strokeWidth={0.3} />

      {/* landing area: thin outer and wide inner borders joined by blocks, centreline with yellow dashes */}
      <path d={ring(L.sternRd)} fill={C.paint} opacity={0.45} />
      <path d={ring(L.launchRd)} fill={C.paint} opacity={0.6} />
      <path d={ring(L.outer)} fill="none" stroke={C.paint} strokeWidth={0.5} />
      <path d={line(L.li) + line(L.ri)} fill="none" stroke={C.paint} strokeWidth={0.93} />
      <path d={L.hash.map(ring).join('')} fill={C.paint} />
      <path d={line(L.c)} fill="none" stroke={C.paint} strokeWidth={0.9} opacity={0.85} />
      <path d={L.yellow.map(line).join('')} fill="none" stroke={C.yellow} strokeWidth={0.9} />
      <path d={line(L.rdMark)} fill="none" stroke={C.yellow} strokeWidth={1.1} />
      {/* foul lines */}
      <path d={G.safety.map(line).join('')} fill="none" stroke={C.red} strokeWidth={0.3} />
      {/* arresting gear */}
      <path d={G.wires.map(line).join('')} fill="none" stroke="#8C969F" strokeWidth={0.4} strokeDasharray="0.8 0.6" />

      {/* catapults: track, shuttle at the aft end, jet blast deflector behind it */}
      {Object.entries(CATS).map(([k, [a, b]]) => (
        <g key={k}>
          <path d={line([a, b])} stroke="#3B434C" strokeWidth={1.6} strokeLinecap="butt" />
          <path d={line([a, b])} stroke="#79838D" strokeWidth={0.3} />
          <path d={line([a, onCatTrack(k, 2.5, 0)])} stroke={C.yellow} strokeWidth={1.6} />
          <path d={ring(G.jbd[k])} fill={jbdUp[k] ? 'rgba(222,154,31,.35)' : '#353C45'} stroke={jbdUp[k] ? '#E7B04F' : C.elevEdge} strokeWidth={jbdUp[k] ? 0.6 : 0.35} />
        </g>
      ))}

      {num && (
        <T p={[160, 2.5]} size={14} rot={90} fill={C.paint} weight={700} opacity={0.22}>
          {num}
        </T>
      )}

      {/* optional layers */}
      {layers.has('gear') && (
        <g fill="none" stroke={C.structEdge} strokeWidth={0.3}>
          <path d={ring(G.struct['LSO Platform'])} />
          <path d={ring(G.struct['IFLOLS Platform'])} />
          <path d={line(G.struct['IFLOLS Datum Lights'])} stroke={C.red} strokeWidth={0.5} />
          <path d={ring(G.struct['Cats 1 & 2 Shooter Bubble'])} stroke={C.yellow} />
          <path d={G.ordnance.map(ring).join('')} stroke={C.yellow} />
          <path d={G.barricade.map(ring).join('')} />
        </g>
      )}
      {layers.has('helo') && <path d={G.helo.flatMap((h) => h.polys).map(ring).join('')} fill="none" stroke="#7D8896" strokeWidth={0.25} />}
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
          <T key={k} p={CAT_LABEL[k]}>{`CAT ${k}`}</T>
        ))}
        {Object.entries(G.elev).map(([k, e]) => (
          <T key={k} p={centroid(e.poly)} fill="#7C8794">{`EL ${k}`}</T>
        ))}
        <T p={centroid(G.struct['Island'])} fill="#C9D3DD" size={3}>ISLAND</T>
        {layers.has('areas') &&
          G.parking.map((a) => (
            <T key={a.name} p={centroid(a.poly)} fill="#6FB6E6" size={2.8} opacity={0.85}>
              {NAMES[a.name] ?? a.name.toUpperCase()}
            </T>
          ))}
        {layers.has('wires') &&
          G.wires.map((w, i) => {
            const p = w[0][1] > w[1][1] ? w[0] : w[1];
            return (
              <T key={i} p={[p[0], p[1] + 2.4]} size={2.6} fill="#9AA4AE">
                {i + 1}
              </T>
            );
          })}
        {layers.has('helo') &&
          G.helo.map((h) => (
            <T key={h.n} p={centroid(h.polys[0])} size={2.6} fill="#9AA4AE">{`H${h.n}`}</T>
          ))}
        {layers.has('gear') && (
          <>
            <T p={[centroid(G.struct['LSO Platform'])[0], centroid(G.struct['LSO Platform'])[1] + 4]} size={2.4}>LSO</T>
            <T p={[centroid(G.struct['IFLOLS Platform'])[0], centroid(G.struct['IFLOLS Platform'])[1] - 6]} size={2.4}>LENS</T>
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
