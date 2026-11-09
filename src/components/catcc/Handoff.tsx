/**
 * Owner chip and handoff controls for one flight, shared by the radar strips, the Approach/Final
 * sequence and PriFly. The receiving seat accepts; the sender can recall until then.
 */
import React from 'react';
import type { SeatRole } from '../../catcc/core/room/protocol.ts';
import { handoffState, nextRole, OWNER_LABEL, type HandoffCtx, type OwnerView } from './ownership.ts';
import { seatsIn } from './seats.ts';

const chip = (role: SeatRole, mine: boolean) => (
  <span
    className="mono"
    title={mine ? 'Yours' : `Owned by ${OWNER_LABEL[role]}`}
    style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', padding: '1px 6px', borderRadius: 3, border: `1px solid ${mine ? '#F15822' : '#374250'}`, color: mine ? '#FFB08F' : '#93A1B0', background: mine ? 'rgba(241,88,34,.1)' : 'transparent', whiteSpace: 'nowrap' }}
  >
    {OWNER_LABEL[role]}
  </span>
);

const btn = (label: string, onClick: () => void, tone: 'amber' | 'plain' = 'plain', title?: string) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={title}
    style={{ height: 22, padding: '0 8px', borderRadius: 4, border: `1px solid ${tone === 'amber' ? '#E7B04F' : '#374250'}`, background: tone === 'amber' ? 'rgba(231,176,79,.12)' : 'transparent', color: tone === 'amber' ? '#E7B04F' : '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
  >
    {label}
  </button>
);

/** One row: owner chip, then the handoff state with its action. */
export const HandoffRow: React.FC<{ v: OwnerView; ctx: HandoffCtx; compact?: boolean }> = ({ v, ctx, compact }) => {
  const st = handoffState(v, ctx);
  const nxt = nextRole(v.owner.role, ctx.layout);
  // other seats this one could hand to (same carrier, this layout)
  const others = seatsIn(ctx.layout).filter((s) => s.id !== v.owner.role && s.id !== 'mission_commander' && s.id !== 'boss' && s.id !== 'miniboss' && s.id !== 'ood' && s.id !== 'writer' && s.id !== 'blso');
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: compact ? 0 : '4px 2px 0', minHeight: 22, flexWrap: 'wrap' }}>
      {chip(v.owner.role, st.mine)}
      {v.pending ? (
        st.incoming ? (
          <>
            <span className="mono" style={{ fontSize: 11, color: '#E7B04F', fontWeight: 600 }}>HANDOFF ← {OWNER_LABEL[v.owner.role]}</span>
            <span style={{ flex: 1 }} />
            {btn('Accept', () => ctx.onAccept(v.key), 'amber', `Take ${v.key} from ${OWNER_LABEL[v.owner.role]}`)}
          </>
        ) : st.outgoing ? (
          <>
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>HANDOFF → {OWNER_LABEL[v.pending.to.role]} · PENDING</span>
            <span style={{ flex: 1 }} />
            {btn('Recall', () => ctx.onHandoff(v.key, v.owner, null), 'plain', 'Take the handoff back')}
          </>
        ) : (
          <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>
            → {OWNER_LABEL[v.pending.to.role]} · PENDING
          </span>
        )
      ) : st.mine ? (
        <>
          <span style={{ flex: 1 }} />
          {nxt && btn(`Handoff ${OWNER_LABEL[nxt]}`, () => ctx.onHandoff(v.key, v.owner, { carrier: v.owner.carrier, role: nxt }), 'plain', `Offer ${v.key} to ${OWNER_LABEL[nxt]}`)}
          <select
            aria-label={`Hand ${v.key} to another seat`}
            value=""
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => e.target.value && ctx.onHandoff(v.key, v.owner, { carrier: v.owner.carrier, role: e.target.value as SeatRole })}
            style={{ height: 22, maxWidth: 30, background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, fontSize: 11, padding: 0 }}
            title="Hand off to another seat"
          >
            <option value="">…</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {OWNER_LABEL[s.id]} · {s.label}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
};
