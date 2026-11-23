/**
 * The taxi network on the PriFly deck drawing (taxiNet.ts): the roads, the destinations with their short
 * ids (buttons while an aircraft is being sent: hover to see the route, click to send it), the taxi routes
 * themselves, and the catapult queues' ghosts (catQueue.ts).
 * A route is a thick green line as far as it is clear; beyond the first aircraft in its way it carries
 * on as a thinner dashed amber line.
 */
import React from 'react';
import { CATS, FOLDED, SPREAD, jetShape, line } from './deck.ts';
import { destName, type QueueGhost } from './catQueue.ts';
import { ROADS, TAXI_COL, TAXI_DESTS, destCat, type TaxiDest, type TaxiPlan } from './taxiNet.ts';

/** The road system, drawn faintly under the aircraft. Its destinations are TaxiSpots (or TaxiDests while an aircraft is being sent). */
export const TaxiNet: React.FC = () => (
  <g fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
    {ROADS.map((r) => (
      <path key={r.id} d={line(r.pts)} stroke={TAXI_COL.road} strokeOpacity={r.kind === 'feeder' ? 0.65 : 0.9} strokeWidth={r.kind === 'artery' ? 1.1 : 0.6} strokeDasharray={r.kind === 'cat' ? '1.6 1.2' : undefined} />
    ))}
  </g>
);

/** A destination's marker: a disc with its short id ("BS1", "E22", "C2"); `on` while hovered, `cur` when it is the aircraft in hand's destination. */
const DestMark: React.FC<{ d: TaxiDest; on?: boolean; cur?: boolean }> = ({ d, on = false, cur = false }) => (
  <>
    <circle cx={d.p[0]} cy={-d.p[1]} r={on ? 3.1 : 2.7} fill={on ? '#1F4A2B' : '#0B0E12'} stroke={TAXI_COL.clear} strokeOpacity={on || cur ? 1 : 0.7} strokeWidth={on || cur ? 0.6 : 0.35} />
    <text x={d.p[0]} y={-d.p[1]} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 1.75, fontWeight: 600, fill: on ? '#E6EDF3' : '#7FD397', pointerEvents: 'none' }}>
      {d.short}
    </text>
  </>
);

/** Every destination of the network with its short id, as when an aircraft is being sent, but not buttons: the Taxi Network layer.
 * Hovering one names it (`onHover`: its id, null when the pointer leaves). */
export const TaxiSpots: React.FC<{ hover?: string | null; onHover?: (id: string | null) => void }> = ({ hover = null, onHover }) => (
  <g>
    {TAXI_DESTS.map((d) => (
      <g key={d.id} onMouseEnter={() => onHover?.(d.id)} onMouseLeave={() => onHover?.(null)}>
        <DestMark d={d} on={hover === d.id} />
      </g>
    ))}
  </g>
);

/** Where the selected aircraft can be sent: every catapult and parking spot, as buttons on the deck. */
export const TaxiDests: React.FC<{
  /** the aircraft being sent, for the buttons' names */
  who: string;
  /** its present destination, if it has one */
  current: string | null;
  hover: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}> = ({ who, current, hover, onHover, onPick }) => {
  const marker = (d: TaxiDest) => {
    const on = hover === d.id;
    const k = destCat(d.id);
    const cur = current === d.id;
    return (
      <g
        key={d.id}
        role="button"
        tabIndex={0}
        aria-label={`Taxi ${who} to ${destName(d.id)}`}
        aria-pressed={cur}
        style={{ cursor: 'pointer', outline: 'none' }}
        onMouseEnter={() => onHover(d.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(d.id)}
        onBlur={() => onHover(null)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onPick(d.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick(d.id);
          }
        }}
      >
        <title>{destName(d.id)}</title>
        {k && (
          <>
            {/* the whole catapult is the target: a wide invisible stroke along its track, lit when hovered */}
            <path d={line(CATS[k])} stroke="#000" strokeOpacity={0} strokeWidth={8} strokeLinecap="butt" fill="none" style={{ pointerEvents: 'stroke' }} />
            <path d={line(CATS[k])} stroke={TAXI_COL.clear} strokeOpacity={on ? 0.45 : cur ? 0.25 : 0} strokeWidth={2.6} strokeLinecap="butt" fill="none" style={{ pointerEvents: 'none' }} />
          </>
        )}
        <circle cx={d.p[0]} cy={-d.p[1]} r={5} fill="#000" fillOpacity={0} />
        <DestMark d={d} on={on} cur={cur} />
      </g>
    );
  };
  // catapults first so a spot marker lying on a track's hit area stays on top
  return <g>{[...TAXI_DESTS.filter((d) => d.kind === 'cat'), ...TAXI_DESTS.filter((d) => d.kind !== 'cat')].map(marker)}</g>;
};

/** One taxi route: clear part, blocked part, where it is blocked, and (for the aircraft in hand) where it ends up. */
export const TaxiRoute: React.FC<{
  plan: TaxiPlan;
  /** the selected aircraft's route, or the one being previewed: drawn heavier, with the hold or parked outline, and a ring where the aircraft in its way is (or will be) */
  strong: boolean;
}> = ({ plan, strong }) => {
  if (plan.arrived) return null;
  const at = plan.blocked[0];
  return (
    <g fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
      {plan.blocked.length > 1 && <path d={line(plan.blocked)} stroke={TAXI_COL.blocked} strokeWidth={strong ? 0.8 : 0.6} strokeOpacity={strong ? 1 : 0.75} strokeDasharray="2.4 1.8" strokeLinecap="butt" />}
      {plan.clear.length > 1 && <path d={line(plan.clear)} stroke={TAXI_COL.clear} strokeWidth={strong ? 1.8 : 1.1} strokeOpacity={strong ? 1 : 0.7} />}
      {at && <circle cx={at[0]} cy={-at[1]} r={strong ? 1.5 : 1.1} fill={TAXI_COL.blocked} stroke="#0B0E12" strokeWidth={0.3} />}
      {strong && (
        <>
          <path d={jetShape(FOLDED, plan.stop.x, plan.stop.y, plan.stop.a)} stroke={plan.blockedBy ? TAXI_COL.blocked : TAXI_COL.clear} strokeWidth={0.3} strokeDasharray="1 0.7" strokeLinecap="butt" />
          {plan.blockedAt && <circle cx={plan.blockedAt[0]} cy={-plan.blockedAt[1]} r={10.5} stroke={TAXI_COL.blocked} strokeWidth={0.5} strokeDasharray="2 1.4" strokeLinecap="butt" />}
        </>
      )}
    </g>
  );
};

/** a ghost's outline, metres: drawn twice as wide, the inner half masked off */
const GHOST_W = 0.3;

/**
 * The catapult queues: a ghost aircraft where each queued aircraft stands in its catapult's queue. Amber
 * (the deck's TAXI_COL.blocked), dashed, no fill; the ghost of the aircraft under the pointer is brighter.
 * The planform is several overlapping polygons (fuselage, wings, stabilators): each is stroked at twice
 * the width through a mask that blacks out the inside of all of them, so only the outer half of the
 * strokes on the aircraft's perimeter shows, one outline round the whole aircraft.
 */
export const QueueGhosts: React.FC<{ ghosts: QueueGhost[]; hover: string | null }> = ({ ghosts, hover }) => {
  const id = `ghost${React.useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  if (!ghosts.length) return null;
  const shapes = ghosts.map((g) => ({ g, d: jetShape(SPREAD, g.x, g.y, g.a) }));
  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={-200} y={-80} width={400} height={160}>
          <rect x={-200} y={-80} width={400} height={160} fill="#fff" />
          {shapes.map(({ g, d }) => (
            <path key={g.id} d={d} fill="#000" />
          ))}
        </mask>
      </defs>
      <g fill="none" strokeLinejoin="round" strokeLinecap="butt" mask={`url(#${id})`}>
        {shapes.map(({ g, d }) => (
          <path key={g.id} d={d} stroke={TAXI_COL.blocked} strokeWidth={GHOST_W * 2} strokeOpacity={g.id === hover ? 0.9 : 0.4} strokeDasharray="1 0.7" />
        ))}
      </g>
    </g>
  );
};
