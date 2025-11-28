import React, { useState } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface UnitBadgeProps {
  unitTypeName: string;
  killCount: number;
  killCategory: 'A2A' | 'A2G' | 'A2S';
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  disabled?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

const UnitBadge: React.FC<UnitBadgeProps> = ({
  unitTypeName,
  killCount,
  killCategory,
  onIncrement,
  onDecrement,
  onRemove,
  disabled = false,
  draggable = false,
  onDragStart
}) => {
  const [hovered, setHovered] = useState(false);

  const getCategoryColor = () => {
    switch (killCategory) {
      case 'A2A':
        return { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' };
      case 'A2G':
        return { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' };
      case 'A2S':
        return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' };
    }
  };

  const colors = getCategoryColor();

  return (
    <div
      draggable={draggable && !disabled}
      onDragStart={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 6px 4px 10px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 600,
        color: colors.text,
        cursor: draggable && !disabled ? 'grab' : 'default',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.6 : 1
      }}
    >
      {/* Unit Name */}
      <span style={{ userSelect: 'none' }}>{unitTypeName}</span>

      {/* Kill Count Display */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '20px',
          height: '20px',
          padding: '0 4px',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 700
        }}
      >
        {killCount}
      </span>

      {/* Controls (shown on hover) */}
      {hovered && !disabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            marginLeft: '2px'
          }}
        >
          {/* Decrement Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDecrement();
            }}
            disabled={killCount === 0}
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: 'none',
              borderRadius: '3px',
              cursor: killCount === 0 ? 'not-allowed' : 'pointer',
              color: colors.text,
              opacity: killCount === 0 ? 0.4 : 1,
              padding: 0
            }}
          >
            <Minus size={12} strokeWidth={2.5} />
          </button>

          {/* Increment Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIncrement();
            }}
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              color: colors.text,
              padding: 0
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
          </button>

          {/* Remove Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(239, 68, 68, 0.9)',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              color: '#FFFFFF',
              marginLeft: '2px',
              padding: 0
            }}
          >
            <Trash2 size={11} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
};

export default UnitBadge;
