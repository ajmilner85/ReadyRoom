import React from 'react';
import { Radio } from 'lucide-react';
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
  theme,
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
        <Radio size={48} style={{ margin: '0 auto 16px auto', opacity: 0.3 }} />
        <p style={{ fontSize: '18px', margin: '0 0 8px 0' }}>No Comms Plan Available</p>
        <p style={{ fontSize: '14px', margin: 0 }}>The comms plan will appear here once configured in Mission Preparation.</p>
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
          fontSize: '24px',
          fontWeight: 600,
          color: colors.text,
          textAlign: 'center',
          letterSpacing: '0.5px'
        }}>
          COMMUNICATIONS PLAN
        </h2>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0
        }}>
          <colgroup>
            <col style={{ width: '60px' }} />
            <col />
            <col style={{ width: '100px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '60px' }} />
            <col style={{ width: '85px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Chan
              </th>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'left',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Name
              </th>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'left',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Freq
              </th>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                TACAN
              </th>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                ILS
              </th>
              <th style={{
                padding: '12px 8px',
                backgroundColor: theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)',
                border: `1px solid ${colors.border}`,
                borderBottom: `2px solid ${colors.accent}`,
                borderLeft: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: colors.text,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
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
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: colors.text,
                    textAlign: 'center',
                    fontFamily: 'monospace'
                  }}>
                    {row.chan}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '15px',
                    fontWeight: isBlankRow ? 400 : 500,
                    color: isBlankRow ? colors.textSecondary : colors.text,
                    textAlign: 'left'
                  }}>
                    {row.name}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '15px',
                    fontWeight: row.freq === '——' ? 400 : 600,
                    color: row.freq === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'left',
                    fontFamily: 'monospace'
                  }}>
                    {row.freq}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '15px',
                    fontWeight: row.tacan === '——' ? 400 : 600,
                    color: row.tacan === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'center',
                    fontFamily: 'monospace'
                  }}>
                    {row.tacan}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '15px',
                    fontWeight: row.ils === '——' ? 400 : 600,
                    color: row.ils === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'center',
                    fontFamily: 'monospace'
                  }}>
                    {row.ils}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderLeft: 'none',
                    fontSize: '15px',
                    fontWeight: row.kyFill === '——' ? 400 : 600,
                    color: row.kyFill === '——' ? colors.textSecondary : colors.text,
                    textAlign: 'center',
                    fontFamily: 'monospace'
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
