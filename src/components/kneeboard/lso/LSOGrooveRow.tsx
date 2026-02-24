import React from 'react';
import { Timer, TimerOff } from 'lucide-react';
import type { DeviationSeverity } from './types/lsoTypes';

interface LSOGrooveRowProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  formattedTime: string;
  isTimerRunning: boolean;
  nesaState: DeviationSeverity | null;
  ligState: DeviationSeverity | null;
  isNoHook: boolean;
  onToggleNESA: () => void;
  onToggleLIG: () => void;
  onNoHook: () => void;
  getDeviationState: (symbol: string) => DeviationSeverity | null;
  onToggleDeviation: (symbol: string) => void;
  cellSize: number;
}

const GAP = 6;

const WAVE_OFF_BUTTONS = [
  { symbol: 'WO',   label: 'WO' },
  { symbol: 'WOFD', label: 'WOFD' },
  { symbol: 'OWO',  label: 'OWO' },
];

function getLabel(base: string, severity: DeviationSeverity | null): string {
  switch (severity) {
    case 'a_little': return `(${base})`;
    case 'reasonable': return base;
    case 'gross': return base;
    default: return base;
  }
}

const LSOGrooveRow: React.FC<LSOGrooveRowProps> = ({
  theme,
  colors,
  formattedTime,
  isTimerRunning,
  nesaState,
  ligState,
  isNoHook,
  onToggleNESA,
  onToggleLIG,
  onNoHook,
  getDeviationState,
  onToggleDeviation,
  cellSize,
}) => {
  const DOUBLE_W = cellSize * 2 + GAP;

  const buttonStyle = (isActive: boolean, severity?: DeviationSeverity | null): React.CSSProperties => ({
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isActive
      ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: isActive ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: isActive ? colors.text : colors.textSecondary,
    fontSize: '32px',
    fontWeight: isActive ? 700 : 500,
    textDecoration: severity === 'gross' ? 'underline' : 'none',
  });

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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* No-hook / stop timer button (occupies former label slot) */}
      <button onClick={onNoHook} style={buttonStyle(isNoHook)}>
        <TimerOff size={48} strokeWidth={2.5} />
      </button>

      {/* NESA button */}
      <button onClick={onToggleNESA} style={buttonStyle(!!nesaState, nesaState)}>
        {getLabel('NESA', nesaState)}
      </button>

      {/* LIG button */}
      <button onClick={onToggleLIG} style={buttonStyle(!!ligState, ligState)}>
        {getLabel('LIG', ligState)}
      </button>

      {/* Timer display */}
      <div style={{
        width: `${DOUBLE_W}px`,
        height: `${cellSize}px`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        backgroundColor: theme === 'dark' ? '#1a1a2e' : '#f8f9fa',
        borderRadius: '8px',
        color: isTimerRunning ? colors.text : colors.textSecondary,
        fontSize: '44px',
        fontWeight: 700,
      }}>
        <Timer size={44} strokeWidth={2.5} />
        {formattedTime}
      </div>

      {/* WAVE OFF label */}
      <div style={labelStyle}>
        {'WAVE\nOFF'.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
        ))}
      </div>

      {/* WAVE OFF buttons: WO, WOFD, OWO */}
      {WAVE_OFF_BUTTONS.map(btn => {
        const isActive = !!getDeviationState(btn.symbol);
        return (
          <button
            key={btn.symbol}
            onClick={() => onToggleDeviation(btn.symbol)}
            style={buttonStyle(isActive)}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
};

export default LSOGrooveRow;
