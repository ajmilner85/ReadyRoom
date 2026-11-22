/**
 * Kneeboard page: the flight deck, bow up, live from the CATCC room. The pilot's taxi clearance from
 * PriFly is drawn in magenta as far as it is clear (dashed amber beyond the first aircraft in the way,
 * with a hold bar where to stop), with the pilot's place in the line for their catapult. Other aircraft
 * show their own instructions faintly; the rest of the pilot's flight carry a coloured tail.
 *
 * The pilot's aircraft is found by board number (their ReadyRoom pilot record), or picked from the list.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildPicture, shortType } from '../catcc/scopeModel.ts';
import { useCatccRoom, type RoomState } from '../catcc/useCatccRoom.ts';
import type { Trail } from '../catcc/scopeModel.ts';
import { DeckDrawing } from '../catcc/prifly/DeckDrawing.tsx';
import { FOLDED, NIMITZ, SPREAD, TAIL, deckStatus, jetShape, line, onCat, onDeck, type DeckJet, type DeckLayer, type V } from '../catcc/prifly/deck.ts';
import { taxiOrders } from '../catcc/prifly/launch.ts';
import { TAXI_COL, destCat, planTaxi, taxiDest, type TaxiPlan } from '../catcc/prifly/taxiNet.ts';
import { catLine, clearanceText, findMe, flightKey } from '../catcc/prifly/kneeboardDeck.ts';

/** the pilot's own clearance and aircraft */
const MAGENTA = '#FF4FD8';
/** the tail colour of the rest of the pilot's flight */
const FLIGHT = '#3FC8F4';
const BODY = { me: MAGENTA, mate: '#B7C1CC', other: '#6E7A88' };
const OTHER_ROUTE = '#A9B6C4';

const LAYERS = new Set<DeckLayer>(['gear']);
const PICK_KEY = 'kneeboard.deck.pick';

// bow up: deck (x fwd, y port) -> screen (right, down) = (-y, -x)
const S = (x: number, y: number): V => [-y, -x];
/** margin (m) round the drawing: the deck and the labels off its edges */
const PAD = 2.4;
/** until the drawing is measured: the deck outline with room for the labels off its edges */
const VIEWBOX = (() => {
  const xs = NIMITZ.outline.map((p) => p[0]);
  const ys = NIMITZ.outline.map((p) => p[1]);
  const side = 10;
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return `${-y1 - side} ${-x1 - PAD} ${y1 - y0 + 2 * side} ${x1 - x0 + 2 * PAD}`;
})();

interface Props {
  /** the pilot's board number, from their ReadyRoom pilot record */
  board?: number;
  colors: { background: string; backgroundSecondary: string; text: string; textSecondary: string; border: string; accent: string; success: string; warning: string; error: string };
}

/** The page: joins the CATCC room (only while the page is shown). */
const DeckKneeboard: React.FC<Props> = (props) => {
  const { state, history } = useCatccRoom();
  return <DeckKneeboardView {...props} state={state} history={history} />;
};

export const DeckKneeboardView: React.FC<Props & { state: RoomState; history: Map<string, Trail[]> }> = ({ board, colors, state, history }) => {
  const [hull, setHull] = useState<string | undefined>(undefined);
  const [pick, setPickState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PICK_KEY);
    } catch {
      return null;
    }
  });
  const [picking, setPicking] = useState(false);
  const setPick = (id: string | null) => {
    setPickState(id);
    setPicking(false);
    try {
      if (id) sessionStorage.setItem(PICK_KEY, id);
      else sessionStorage.removeItem(PICK_KEY);
    } catch {
      /* private window */
    }
  };
  const myBoard = board ?? state.user?.board;
  // the frame hugs the drawing: measured once it is drawn (deck and labels), PAD all round
  const drawingRef = useRef<SVGGElement>(null);
  const [viewBox, setViewBox] = useState(VIEWBOX);
  useLayoutEffect(() => {
    const b = drawingRef.current?.getBBox();
    if (b && b.width > 0) setViewBox(`${b.x - PAD} ${b.y - PAD} ${b.width + 2 * PAD} ${b.height + 2 * PAD}`);
  }, []);

  const pic = useMemo(() => buildPicture(state.tracks, hull, history, state.mt), [state.tracks, hull, history, state.mt]);

  // the carrier the pilot is aboard becomes the one drawn
  const aboard = useMemo(() => {
    const all = [...pic.air, ...(pic.ground ?? [])];
    for (const c of pic.carriers) if (findMe(onDeck(c, all), myBoard, pick)) return c.track.hull;
    return undefined;
  }, [pic, myBoard, pick]);
  useEffect(() => {
    if (aboard && aboard !== hull) setHull(aboard);
  }, [aboard, hull]);

  const st = deckStatus(pic);
  const jets = useMemo(() => st?.jets ?? [], [st]);
  const focusHull = pic.focus?.track.hull;
  const ops = focusHull ? state.ops[focusHull] : undefined;
  const plans = useMemo(() => {
    const ids = jets.map((j) => ({ id: j.t.id, key: flightKey(j.t) }));
    return planTaxi(
      jets.map((j) => ({ id: j.t.id, x: j.x, y: j.y, a: j.a })),
      taxiOrders(ops, ids),
    );
  }, [jets, ops]);

  const me = findMe(jets, myBoard, pick);
  const myKey = me ? flightKey(me.t) : null;
  const myPlan = me ? plans.get(me.t.id) : undefined;
  const nameOf = (id: string) => {
    const t = jets.find((j) => j.t.id === id)?.t;
    return t ? (t.bd ?? t.cs ?? t.id) : '';
  };
  const clr = clearanceText(myPlan, nameOf);
  const myCat = destCat(myPlan?.to);
  const lineUp = myCat ? catLine(jets, plans, myCat) : [];
  const myPlace = me ? lineUp.findIndex((r) => r.id === me.t.id) : -1;
  const mates = me ? jets.filter((j) => j.t.id !== me.t.id && flightKey(j.t) === myKey) : [];
  const players = jets.filter((j) => j.t.ip);

  const role = (j: DeckJet): 'me' | 'mate' | 'other' => (j.t.id === me?.t.id ? 'me' : myKey && flightKey(j.t) === myKey ? 'mate' : 'other');
  const shapeOf = (j: DeckJet) => {
    const p = plans.get(j.t.id);
    const spread = j.moving || ['1', '2', '3', '4'].some((k) => onCat([j], k)) || (p && !p.arrived);
    return jetShape(spread ? SPREAD : FOLDED, j.x, j.y, j.a);
  };

  const live = state.lastFrameAt !== undefined && Date.now() - state.lastFrameAt < 5000;
  const feed =
    state.conn === 'forbidden'
      ? `Access denied · ${state.refused ?? ''}`
      : state.conn === 'denied'
      ? 'CATCC room refused the sign-in'
      : state.conn !== 'open'
        ? 'Connecting to the CATCC room…'
        : !state.sources.length
          ? 'No DCS feed in the room'
          : !live
            ? 'Waiting for the DCS feed'
            : !pic.focus
              ? 'No carrier in the mission'
              : null;

  // the clearance itself is magenta (as drawn); holding short shows in the detail line
  const toneCol = { clear: MAGENTA, hold: MAGENTA, none: colors.textSecondary, there: colors.success }[clr.tone];
  const mono: React.CSSProperties = { fontFamily: 'var(--rr-font-mono)' };
  const lbl: React.CSSProperties = { ...mono, fontSize: 18, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: colors.textSecondary };
  const card: React.CSSProperties = { background: colors.backgroundSecondary, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 };
  const row = (j: DeckJet | undefined, id: string, right: React.ReactNode, i?: number) => {
    const t = j?.t;
    const r = j ? role(j) : 'other';
    return (
      <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: 24 }}>
        {i !== undefined && <span style={{ ...mono, width: 34, color: colors.textSecondary }}>{i + 1}</span>}
        <span style={{ ...mono, fontWeight: 700, minWidth: 64, color: r === 'me' ? MAGENTA : r === 'mate' ? FLIGHT : colors.text }}>{t ? (t.bd ?? '—') : '—'}</span>
        <span style={{ flex: 1, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r === 'me' ? 'You' : (t?.cs ?? t?.pl ?? '')} {t ? `· ${shortType(t.ty)}` : ''}
        </span>
        <span style={{ ...mono, color: colors.text }}>{right}</span>
      </div>
    );
  };
  const planWords = (p: TaxiPlan | undefined) => {
    if (!p) return 'no instruction';
    const d = taxiDest(p.to)?.short ?? p.to;
    return p.arrived ? `at ${d}` : p.blockedBy ? `→ ${d} · holding` : `→ ${d}`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', gap: 16, minHeight: 0 }}>
      {/* ---------------- the deck, bow up */}
      <div style={{ flex: 'none', height: '100%', background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 10, padding: 4, boxSizing: 'border-box' }}>
        <svg viewBox={viewBox} style={{ height: '100%', width: 'auto', display: 'block' }} role="img" aria-label="Flight deck, bow up, with your taxi clearance">
          <g ref={drawingRef}>
            <g transform="rotate(-90)">
              <DeckDrawing layers={LAYERS} hull={focusHull} bowUp jbdUp={Object.fromEntries(Object.entries(st?.cats ?? {}).map(([k, j]) => [k, !!j]))} />
            </g>
          </g>
          <g transform="rotate(-90)">
            {/* everyone else's instructions, faint */}
            <g fill="none" strokeLinejoin="round" strokeLinecap="round">
              {[...plans.values()]
                .filter((p) => p.id !== me?.t.id && !p.arrived)
                .map((p) => (
                  <g key={p.id}>
                    {p.blocked.length > 1 && <path d={line(p.blocked)} stroke={TAXI_COL.blocked} strokeOpacity={0.8} strokeWidth={0.55} strokeDasharray="2.4 1.8" strokeLinecap="butt" />}
                    {p.clear.length > 1 && <path d={line(p.clear)} stroke={OTHER_ROUTE} strokeOpacity={0.85} strokeWidth={1.1} />}
                  </g>
                ))}
            </g>
            {/* the pilot's clearance */}
            {myPlan && !myPlan.arrived && <MyRoute plan={myPlan} />}
            {/* aircraft: body, then the tail in the flight's colour */}
            {jets.map((j) => {
              const r = role(j);
              return (
                <g key={j.t.id}>
                  <path d={shapeOf(j)} fill={BODY[r]} stroke={r === 'me' ? '#FFFFFF' : '#0B0E12'} strokeWidth={r === 'me' ? 0.35 : 0.2} />
                  {r === 'mate' && <path d={jetShape(TAIL, j.x, j.y, j.a)} fill={FLIGHT} />}
                </g>
              );
            })}
          </g>
          {/* board numbers, level */}
          <g style={{ pointerEvents: 'none' }}>
            {jets.map((j) => {
              const [sx, sy] = S(j.x, j.y);
              const r = role(j);
              const p = plans.get(j.t.id);
              return (
                <g key={j.t.id}>
                  <text x={sx} y={sy} textAnchor="middle" dominantBaseline="central" style={{ ...mono, fontSize: 4, fontWeight: 700, fill: r === 'me' ? '#FFFFFF' : r === 'mate' ? '#DFF6FF' : '#E6EDF3', stroke: '#0B0E12', strokeWidth: 0.9, paintOrder: 'stroke' }}>
                    {j.t.bd ?? j.t.cs ?? ''}
                  </text>
                  {r !== 'me' && p && !p.arrived && (
                    <text x={sx} y={sy + 4.4} textAnchor="middle" dominantBaseline="central" style={{ ...mono, fontSize: 2.8, fill: p.blockedBy ? TAXI_COL.blocked : OTHER_ROUTE, stroke: '#0B0E12', strokeWidth: 0.7, paintOrder: 'stroke' }}>
                      {`▸${taxiDest(p.to)?.short ?? ''}`}
                    </text>
                  )}
                </g>
              );
            })}
            {myPlan && !myPlan.arrived && (() => {
              const d = taxiDest(myPlan.to);
              if (!d) return null;
              const [sx, sy] = S(d.p[0], d.p[1]);
              return (
                <text x={sx + 5} y={sy} dominantBaseline="central" style={{ ...mono, fontSize: 4, fontWeight: 700, fill: MAGENTA, stroke: '#0B0E12', strokeWidth: 0.9, paintOrder: 'stroke' }}>
                  {d.short}
                </text>
              );
            })()}
          </g>
        </svg>
      </div>

      {/* ---------------- the clearance, the line for the catapult, the flight */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '.08em' }}>FLIGHT DECK</span>
          <span style={{ ...mono, fontSize: 20, color: colors.textSecondary }}>{focusHull ?? ''}</span>
        </div>
        {feed && <div style={{ ...card, ...mono, fontSize: 22, color: colors.warning }}>{feed}</div>}

        {!feed && (!me || picking) && (
          <div style={card}>
            <div style={lbl}>Your aircraft</div>
            <div style={{ fontSize: 22, color: colors.textSecondary, margin: '10px 0 6px' }}>
              {me ? 'Pick your aircraft:' : myBoard ? `No aircraft with board ${myBoard} on deck. Pick yours:` : 'Pick your aircraft:'}
            </div>
            {players.map((j) =>
              <button key={j.t.id} onClick={() => setPick(j.t.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>
                {row(j, j.t.id, 'select')}
              </button>,
            )}
            {!players.length && <div style={{ fontSize: 22, color: colors.textSecondary }}>No player aircraft on this deck.</div>}
            {pick && (
              <button onClick={() => setPick(null)} style={{ marginTop: 12, fontSize: 20, padding: '8px 14px', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, cursor: 'pointer' }}>
                Use my board number
              </button>
            )}
          </div>
        )}

        {me && (
          <>
            <div style={{ ...card, borderColor: clr.tone === 'clear' || clr.tone === 'hold' ? MAGENTA : colors.border, borderWidth: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={lbl}>Taxi clearance</span>
                <button onClick={() => setPicking((v) => !v)} style={{ ...mono, fontSize: 18, background: 'transparent', border: 0, color: colors.textSecondary, cursor: 'pointer', padding: 0 }}>
                  {me.t.bd ?? me.t.cs ?? ''} · {shortType(me.t.ty)} ▾
                </button>
              </div>
              <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '.04em', color: toneCol, marginTop: 6 }}>{clr.head}</div>
              <div style={{ fontSize: 26, color: clr.tone === 'hold' ? TAXI_COL.blocked : colors.text, marginTop: 4 }}>{clr.sub}</div>
              {myCat && myPlace >= 0 && (
                <div style={{ ...mono, fontSize: 30, fontWeight: 600, marginTop: 14, color: colors.text }}>
                  {lineUp[myPlace].spotted ? `ON CAT ${myCat}` : `#${myPlace + 1} FOR CAT ${myCat}`}
                  {myPlace > 0 && <span style={{ color: colors.textSecondary, fontWeight: 400 }}>{` · behind ${nameOf(lineUp[myPlace - 1].id)}`}</span>}
                </div>
              )}
            </div>

            {myCat && lineUp.length > 1 && (
              <div style={card}>
                <div style={lbl}>Cat {myCat} line</div>
                <div style={{ marginTop: 8 }}>
                  {lineUp.map((r, i) =>
                    row(
                      jets.find((j) => j.t.id === r.id),
                      r.id,
                      r.spotted ? 'spotted' : r.plan?.blockedBy ? 'holding' : 'taxiing',
                      i,
                    ),
                  )}
                </div>
              </div>
            )}

            {mates.length > 0 && (
              <div style={card}>
                <div style={lbl}>Your flight</div>
                <div style={{ marginTop: 8 }}>{[me, ...mates].map((j) => row(j, j.t.id, planWords(plans.get(j.t.id))))}</div>
              </div>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ ...mono, fontSize: 18, color: colors.textSecondary, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><span style={{ color: MAGENTA, fontWeight: 700 }}>━━</span> your clearance · <span style={{ color: MAGENTA }}>┃</span> hold here</span>
          <span><span style={{ color: TAXI_COL.blocked }}>- - -</span> beyond the aircraft in your way</span>
          <span><span style={{ color: FLIGHT }}>■</span> tail: your flight · <span style={{ color: OTHER_ROUTE }}>━━</span> other aircraft's instructions</span>
        </div>
      </div>
    </div>
  );
};

/** The pilot's route (deck coordinates, inside the rotated group): clear part, the rest, where to hold, where it ends. */
const MyRoute: React.FC<{ plan: TaxiPlan }> = ({ plan }) => {
  const d = taxiDest(plan.to);
  const s = plan.stop;
  const r = (s.a * Math.PI) / 180;
  const n: V = [-Math.sin(r), Math.cos(r)];
  const bar: V[] = [
    [s.x + n[0] * 5, s.y + n[1] * 5],
    [s.x - n[0] * 5, s.y - n[1] * 5],
  ];
  // the hold bar sits just ahead of the nose
  const nose: V = [Math.cos(r) * 9.5, Math.sin(r) * 9.5];
  const held = bar.map((p): V => [p[0] + nose[0], p[1] + nose[1]]);
  return (
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      {plan.blocked.length > 1 && <path d={line(plan.blocked)} stroke={TAXI_COL.blocked} strokeWidth={0.8} strokeDasharray="2.4 1.8" strokeLinecap="butt" />}
      {plan.clear.length > 1 && (
        <>
          <path d={line(plan.clear)} stroke="#0B0E12" strokeWidth={3} strokeOpacity={0.6} />
          <path d={line(plan.clear)} stroke={MAGENTA} strokeWidth={2} />
        </>
      )}
      {plan.blockedBy ? (
        <>
          <path d={line(held)} stroke={MAGENTA} strokeWidth={1.4} strokeLinecap="butt" />
          {plan.blockedAt && <circle cx={plan.blockedAt[0]} cy={-plan.blockedAt[1]} r={10.5} stroke={TAXI_COL.blocked} strokeWidth={0.6} strokeDasharray="2 1.4" strokeLinecap="butt" />}
        </>
      ) : (
        d && <circle cx={d.p[0]} cy={-d.p[1]} r={3.2} stroke={MAGENTA} strokeWidth={0.9} fill="#0B0E12" fillOpacity={0.5} />
      )}
    </g>
  );
};

export default DeckKneeboard;
