/**
 * The taxi network on the PriFly deck drawing (taxiNet.ts): the roads and spots, the destinations an
 * aircraft can be sent to (hover to see the route, click to send it), and the taxi routes themselves.
 * A route is a thick green line as far as it is clear; beyond the first aircraft in its way it carries
 * on as a thinner dashed amber line.
 */
import React from 'react';
import { CATS, FOLDED, jetShape, line } from './deck.ts';
import { ROADS, TAXI_COL, TAXI_DESTS, destCat, type TaxiDest, type TaxiPlan } from './taxiNet.ts';

/** The road system and its spots, drawn faintly under the aircraft. */
export const TaxiNet: React.FC = () => (
  <g fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
    {ROADS.map((r) => (
      <path key={r.id} d={line(r.pts)} stroke={TAXI_COL.road} strokeOpacity={r.kind === 'feeder' ? 0.65 : 0.9} strokeWidth={r.kind === 'artery' ? 1.1 : 0.6} strokeDasharray={r.kind === 'cat' ? '1.6 1.2' : undefined} />
    ))}
    {TAXI_DESTS.filter((d) => d.kind !== 'cat').map((d) => (
      <circle key={d.id} cx={d.p[0]} cy={-d.p[1]} r={1.6} fill="#0B0E12" stroke={TAXI_COL.road} strokeOpacity={1} strokeWidth={0.45} />
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
        aria-label={`Taxi ${who} to ${d.label}`}
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
        <title>{d.label}</title>
        {k && (
          <>
            {/* the whole catapult is the target: a wide invisible stroke along its track, lit when hovered */}
            <path d={line(CATS[k])} stroke="#000" strokeOpacity={0} strokeWidth={8} strokeLinecap="butt" fill="none" style={{ pointerEvents: 'stroke' }} />
            <path d={line(CATS[k])} stroke={TAXI_COL.clear} strokeOpacity={on ? 0.45 : cur ? 0.25 : 0} strokeWidth={2.6} strokeLinecap="butt" fill="none" style={{ pointerEvents: 'none' }} />
          </>
        )}
        <circle cx={d.p[0]} cy={-d.p[1]} r={5} fill="#000" fillOpacity={0} />
        <circle cx={d.p[0]} cy={-d.p[1]} r={on ? 3.1 : 2.7} fill={on ? '#1F4A2B' : '#0B0E12'} stroke={TAXI_COL.clear} strokeOpacity={on || cur ? 1 : 0.7} strokeWidth={on || cur ? 0.6 : 0.35} />
        <text x={d.p[0]} y={-d.p[1]} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 1.75, fontWeight: 600, fill: on ? '#E6EDF3' : '#7FD397', pointerEvents: 'none' }}>
          {d.short}
        </text>
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
