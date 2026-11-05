import React, { useState } from 'react';
import { Icon } from '../../ui/primitives';

interface UnitKillCellProps {
  unitDisplayName?: string;
  unitTypeName?: string;
  killCount?: number;
  isEmpty: boolean;
  onAdd: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
}

/**
 * Individual cell in kill tracking table
 * Empty: Shows + button on hover
 * Populated: Shows unit name with x## counter, +/- buttons on hover
 */
const UnitKillCell: React.FC<UnitKillCellProps> = ({
  unitDisplayName,
  unitTypeName,
  killCount = 1,
  isEmpty,
  onAdd,
  onIncrement,
  onDecrement
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Truncate text to fit in 2 lines max
  const truncateText = (text: string, maxLength: number = 25) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (isEmpty) {
    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: '100%',
          height: '48px',
          border: '1px solid var(--rr-border)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isHovered ? 'var(--rr-panel2)' : 'var(--rr-panel)',
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
          position: 'relative'
        }}
        onClick={onAdd}
      >
        {isHovered && (
          <button
            type="button"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--rr-accent)',
              border: 'none',
              borderRadius: '4px',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
            }}
          >
            <Icon name="plus" size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  }

  // Populated cell
  const displayText = unitDisplayName || unitTypeName || '';
  const fullText = unitDisplayName || unitTypeName || '';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        height: '48px',
        border: '1px solid var(--rr-border)',
        borderRadius: '4px',
        backgroundColor: 'var(--rr-panel)',
        padding: '8px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        position: 'relative'
      }}
      title={fullText} // Tooltip shows full name
    >
      {/* Left side: Unit name */}
      <div
        style={{
          flex: 1,
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--rr-text)',
          lineHeight: '16px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word'
        }}
      >
        {truncateText(displayText)}
      </div>

      {/* Right side: Kill counter and buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0
        }}
      >
        {/* Decrement button (visible on hover) */}
        {isHovered && onDecrement && (
          <button
            type="button"
            onClick={onDecrement}
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--rr-panel2)',
              border: '1px solid var(--rr-border2)',
              borderRadius: '3px',
              color: 'var(--rr-text2)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
              e.currentTarget.style.borderColor = 'var(--rr-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              e.currentTarget.style.borderColor = 'var(--rr-border2)';
            }}
          >
            <Icon name="minus" size={12} strokeWidth={2.5} />
          </button>
        )}

        {/* Kill count (show if > 1) */}
        {killCount > 1 && (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--rr-text)',
              whiteSpace: 'nowrap'
            }}
          >
            x{killCount}
          </span>
        )}

        {/* Increment button (visible on hover) */}
        {isHovered && onIncrement && (
          <button
            type="button"
            onClick={onIncrement}
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--rr-panel2)',
              border: '1px solid var(--rr-border2)',
              borderRadius: '3px',
              color: 'var(--rr-text2)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              padding: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
              e.currentTarget.style.borderColor = 'var(--rr-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              e.currentTarget.style.borderColor = 'var(--rr-border2)';
            }}
          >
            <Icon name="plus" size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};

export default UnitKillCell;
