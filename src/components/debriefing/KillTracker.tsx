import React from 'react';
import { Minus, Plus } from 'lucide-react';

export interface KillCounts {
  a2a: number;
  a2g: number;
}

interface KillTrackerProps {
  pilotId: string;
  kills: KillCounts;
  onChange: (pilotId: string, kills: KillCounts) => void;
  disabled?: boolean;
  type: 'a2a' | 'a2g';
}

const KillTracker: React.FC<KillTrackerProps> = ({
  pilotId,
  kills,
  onChange,
  disabled = false,
  type
}) => {
  const [minusHovered, setMinusHovered] = React.useState(false);
  const [plusHovered, setPlusHovered] = React.useState(false);
  const value = type === 'a2a' ? kills.a2a : kills.a2g;

  const handleChange = (newValue: string) => {
    const numValue = parseInt(newValue) || 0;
    const sanitized = Math.max(0, numValue);
    if (type === 'a2a') {
      onChange(pilotId, { ...kills, a2a: sanitized });
    } else {
      onChange(pilotId, { ...kills, a2g: sanitized });
    }
  };

  const increment = () => {
    if (type === 'a2a') {
      onChange(pilotId, { ...kills, a2a: kills.a2a + 1 });
    } else {
      onChange(pilotId, { ...kills, a2g: kills.a2g + 1 });
    }
  };

  const decrement = () => {
    if (type === 'a2a') {
      onChange(pilotId, { ...kills, a2a: Math.max(0, kills.a2a - 1) });
    } else {
      onChange(pilotId, { ...kills, a2g: Math.max(0, kills.a2g - 1) });
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || value === 0}
        onMouseEnter={() => setMinusHovered(true)}
        onMouseLeave={() => setMinusHovered(false)}
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: minusHovered && !disabled && value > 0 ? '#F8FAFC' : '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          color: '#64748B',
          cursor: disabled || value === 0 ? 'not-allowed' : 'pointer',
          opacity: disabled || value === 0 ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          padding: 0
        }}
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className="no-spinner"
        style={{
          width: '48px',
          height: '24px',
          boxSizing: 'border-box',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 600,
          color: '#475569',
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          outline: 'none'
        }}
      />
      <button
        type="button"
        onClick={increment}
        disabled={disabled}
        onMouseEnter={() => setPlusHovered(true)}
        onMouseLeave={() => setPlusHovered(false)}
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: plusHovered && !disabled ? '#F8FAFC' : '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          color: '#64748B',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s ease',
          padding: 0
        }}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
};

export default KillTracker;
