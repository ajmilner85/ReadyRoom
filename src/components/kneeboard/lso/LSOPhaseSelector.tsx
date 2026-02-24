import React from 'react';
import { Timer, TimerReset } from 'lucide-react';
import type { ApproachPhase } from './types/lsoTypes';
import { PHASE_ORDER } from './types/lsoTypes';

interface LSOPhaseSelectorProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  currentPhase: ApproachPhase | null;
  onPhaseSelect: (phase: ApproachPhase) => void;
  timerRunning: boolean;
  onTimerToggle: () => void;
  cellSize: number;
}

const GAP = 6;

const LSOPhaseSelector: React.FC<LSOPhaseSelectorProps> = ({
  theme,
  colors,
  currentPhase,
  onPhaseSelect,
  timerRunning,
  onTimerToggle,
  cellSize,
}) => {
  const sq = (isActive: boolean): React.CSSProperties => ({
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isActive
      ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: isActive ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: isActive ? colors.text : colors.textSecondary,
    fontSize: '36px',
    fontWeight: isActive ? 700 : 500,
    letterSpacing: '0.5px',
  });

  return (
    <div style={{
      display: 'flex',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* Timer button */}
      <button onClick={onTimerToggle} style={sq(timerRunning)}>
        {timerRunning ? <TimerReset size={48} strokeWidth={2.5} /> : <Timer size={48} strokeWidth={2.5} />}
      </button>

      {/* Phase buttons */}
      {PHASE_ORDER.map(phase => (
        <button key={phase} onClick={() => onPhaseSelect(phase)} style={sq(currentPhase === phase)}>
          {phase}
        </button>
      ))}
    </div>
  );
};

export default LSOPhaseSelector;
