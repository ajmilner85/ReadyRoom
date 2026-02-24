import React from 'react';
import { COMMENT_BUTTONS } from './data/padConfig';

interface LSOCommentsRowProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  comments: Record<string, number>;
  onToggle: (key: string, hasTwoStates: boolean) => void;
  cellSize: number;
}

const GAP = 6;

const LSOCommentsRow: React.FC<LSOCommentsRowProps> = ({
  theme,
  colors,
  comments,
  onToggle,
  cellSize,
}) => {
  return (
    <div style={{
      display: 'flex',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* Category label */}
      <div style={{
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
      }}>
        REMARKS
      </div>

      {COMMENT_BUTTONS.map(btn => {
        const state = comments[btn.key] ?? 0;
        const hasTwoStates = !!btn.label2;
        const isActive = state > 0;
        const isState2 = state === 2;
        const displayLabel = isState2 && btn.label2 ? btn.label2 : btn.label1;

        const bgColor = isState2
          ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)')
          : isActive
            ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)')
            : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb');

        const border = isState2
          ? `2px solid ${colors.warning}`
          : isActive
            ? `2px solid ${colors.success}`
            : `1px solid ${colors.border}`;

        const fontSize = displayLabel.length > 5 ? '22px' : displayLabel.length > 3 ? '26px' : '30px';

        return (
          <button
            key={btn.key}
            onClick={() => onToggle(btn.key, hasTwoStates)}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: bgColor,
              border,
              borderRadius: '8px',
              cursor: 'pointer',
              color: isActive ? colors.text : colors.textSecondary,
              fontSize,
              fontWeight: isActive ? 700 : 500,
              padding: '4px',
            }}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
};

export default LSOCommentsRow;
