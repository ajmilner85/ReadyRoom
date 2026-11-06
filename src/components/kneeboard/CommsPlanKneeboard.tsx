import React from 'react';
import { Icon } from '../ui/primitives';
import { CommsPlanEntry } from '../../types/CommsTypes';

interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
}

interface CommsPlanKneeboardProps {
  theme: 'light' | 'dark';
  colors: ThemeColors;
  commsData: CommsPlanEntry[];
}

const CommsPlanKneeboard: React.FC<CommsPlanKneeboardProps> = ({
  theme: _theme,
  colors,
  commsData
}) => {
  if (!commsData || commsData.length === 0) {
    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: colors.textSecondary
      }}>
        <Icon name="radio" size={48} style={{ margin: '0 auto 16px auto', opacity: 0.4 }} />
        <p style={{ fontSize: '24px', margin: '0 0 8px 0' }}>No Comms Plan Available</p>
        <p style={{ fontSize: '18px', margin: 0 }}>The comms plan will appear here once configured in Mission Preparation.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Header */}
      <div style={{
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: `2px solid ${colors.border}`
      }}>
        <h2 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: 700,
          color: colors.text,
          textAlign: 'center',
          letterSpacing: '.14em',
          textTransform: 'uppercase'
        }}>
          COMMS PLAN
        </h2>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: `1px solid ${colors.border}` }}>
        <table style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0
        }}>
          <colgroup>
            <col style={{ width: '84px' }} />
            <col />
            <col style={{ width: '128px' }} />
            <col style={{ width: '112px' }} />
            <col style={{ width: '76px' }} />
            <col style={{ width: '128px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                Chan
              </th>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'left',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                Name
              </th>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'left',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                Freq
              </th>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                TACAN
              </th>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                ILS
              </th>
              <th style={{
                padding: '14px 8px',
                backgroundColor: 'var(--rr-panel3)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '24px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rr-font-mono)'
              }}>
                KY Fill
              </th>
            </tr>
          </thead>
          <tbody>
            {commsData.map((row, index) => {
              const isBlankRow = row.name === '——' && row.freq === '——';
              const rowStyle = {
                backgroundColor: index % 2 === 0
                  ? colors.backgroundSecondary
                  : 'transparent'
              };

              return (
                <tr key={index} style={rowStyle}>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    fontSize: '24px',
                    fontWeight: 600,
                    color: colors.text,
                    textAlign: 'center',
                    fontFamily: 'var(--rr-font-mono)'
                  }}>
                    {row.chan}
                  </td>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '24px',
                    fontWeight: isBlankRow ? 400 : 500,
                    color: isBlankRow ? colors.textSecondary : colors.text,
                    textAlign: 'left'
                  }}>
                    {row.name}
                  </td>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '24px',
                    fontWeight: row.freq === '——' ? 400 : 600,
                    color: row.freq === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'left',
                    fontFamily: 'var(--rr-font-mono)'
                  }}>
                    {row.freq}
                  </td>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '24px',
                    fontWeight: row.tacan === '——' ? 400 : 600,
                    color: row.tacan === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'center',
                    fontFamily: 'var(--rr-font-mono)'
                  }}>
                    {row.tacan}
                  </td>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '24px',
                    fontWeight: row.ils === '——' ? 400 : 600,
                    color: row.ils === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'center',
                    fontFamily: 'var(--rr-font-mono)'
                  }}>
                    {row.ils}
                  </td>
                  <td style={{
                    padding: '12px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '24px',
                    fontWeight: row.kyFill === '——' ? 400 : 700,
                    color: row.kyFill === '——' ? colors.textSecondary : 'var(--rr-good)',
                    textAlign: 'center',
                    fontFamily: 'var(--rr-font-mono)'
                  }}>
                    {row.kyFill}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CommsPlanKneeboard;
