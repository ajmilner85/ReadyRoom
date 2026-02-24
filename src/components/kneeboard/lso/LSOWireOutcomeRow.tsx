import React from 'react';
import type { DeviationSeverity } from './types/lsoTypes';

interface LSOWireOutcomeRowProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  wireNumber: number | null;
  onWireSelect: (wire: number) => void;
  getDeviationState: (symbol: string) => DeviationSeverity | null;
  onToggleDeviation: (symbol: string) => void;
  cellSize: number;
}

const GAP = 6;

const ARRESTMENT_BUTTONS = [
  { symbol: 'BLTR', label: 'B' },
  { symbol: 'HS',   label: 'HS' },
  { symbol: 'T&G',  label: 'T&G' },
];

const LSOWireOutcomeRow: React.FC<LSOWireOutcomeRowProps> = ({
  theme,
  colors,
  wireNumber,
  onWireSelect,
  getDeviationState,
  onToggleDeviation,
  cellSize,
}) => {
  const labelStyle: React.CSSProperties = {
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    lineHeight: '1.3',
    textAlign: 'center',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  };

  const wireButtonStyle = (isActive: boolean): React.CSSProperties => ({
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isActive
      ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: isActive
      ? `2px solid ${colors.accent}`
      : `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: isActive ? colors.text : colors.textSecondary,
    fontSize: '36px',
    fontWeight: isActive ? 700 : 500,
  });

  const arrestmentButtonStyle = (isActive: boolean): React.CSSProperties => ({
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isActive
      ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: isActive
      ? `2px solid ${colors.success}`
      : `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: isActive ? colors.text : colors.textSecondary,
    fontSize: '32px',
    fontWeight: isActive ? 700 : 500,
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* WIRE label */}
      <div style={labelStyle}>WIRE</div>

      {/* Wire buttons 1–4 */}
      {[1, 2, 3, 4].map(wire => (
        <button
          key={wire}
          onClick={() => onWireSelect(wire)}
          style={wireButtonStyle(wireNumber === wire)}
        >
          {wire}
        </button>
      ))}

      {/* ARRESTMENT label */}
      <div style={labelStyle}>
        {'NO\nWIRE'.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
        ))}
      </div>

      {/* ARRESTMENT buttons: B, HS, T&G */}
      {ARRESTMENT_BUTTONS.map(btn => {
        const isActive = !!getDeviationState(btn.symbol);
        return (
          <button
            key={btn.symbol}
            onClick={() => onToggleDeviation(btn.symbol)}
            style={arrestmentButtonStyle(isActive)}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
};

export default LSOWireOutcomeRow;
