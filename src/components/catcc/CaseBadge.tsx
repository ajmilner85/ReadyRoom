/** Recovery case and approach type (e.g. "CASE III · CV-1"), at the top of a view's right sidebar. */
import React from 'react';

/** The approach type is not in the room's data yet: CV-1 for every case. */
export const APPROACH_TYPE = 'CV-1';

export const CaseBadge: React.FC<{ kase?: string | number | null; style?: React.CSSProperties }> = ({ kase, style }) => (
  <div aria-label="Recovery case and approach type" style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(241,88,34,.15)', border: '1px solid #F15822', color: '#FFB08F', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: '.1em', alignSelf: 'flex-start', flex: 'none', ...style }}>
    {`CASE ${kase ?? 'III'} · ${APPROACH_TYPE}`}
  </div>
);
