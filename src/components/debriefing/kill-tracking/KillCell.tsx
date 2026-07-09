import React, { useState } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface KillCellProps {
  killCount: number;
  unitDisplayName: string;
  isFriendly?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}

const KillCell: React.FC<KillCellProps> = ({
  killCount,
  unitDisplayName,
  isFriendly = false,
  onIncrement,
  onDecrement
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '32px',
        width: '120px'
      }}
    >
      {/* Decrement/Delete button - appears on left on hover */}
      {isHovered && (
        <button
          type="button"
          onClick={onDecrement}
          style={{
            position: 'absolute',
            left: '-12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#64748B',
            cursor: 'pointer',
            padding: 0
          }}
        >
          {killCount === 1 ? <Trash2 size={14} strokeWidth={2} /> : <Minus size={14} strokeWidth={2.5} />}
        </button>
      )}

      {/* Unit name and count - centered, fixed width.
          Friendly-fire kills render inside a blue bubble; regular kills have no bubble */}
      <div style={{
        width: '92px',
        backgroundColor: isFriendly ? '#EFF6FF' : '#FFFFFF',
        // Painted as an inset shadow rather than a real border so it doesn't
        // grow the box beyond the plain (borderless) cell's footprint
        boxShadow: isFriendly ? 'inset 0 0 0 1px #93C5FD' : 'none',
        borderRadius: isFriendly ? '8px' : 0,
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        minHeight: '32px'
      }}
      title={isFriendly ? `${unitDisplayName} (friendly fire)` : unitDisplayName}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: isFriendly ? '#2563EB' : '#64748B',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.2',
            maxHeight: '26.4px',
            width: '100%'
          }}
        >
          {unitDisplayName}
        </div>
        {killCount > 1 && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: isFriendly ? '#2563EB' : '#000000' }}>
            x{killCount}
          </span>
        )}
      </div>

      {/* Increment button - appears on right on hover */}
      {isHovered && (
        <button
          type="button"
          onClick={onIncrement}
          style={{
            position: 'absolute',
            right: '-12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#64748B',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export default KillCell;
