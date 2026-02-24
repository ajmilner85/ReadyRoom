import React from 'react';
import type { GradeType } from './types/lsoTypes';
import { GRADE_DISPLAY } from './types/lsoTypes';

interface LSOGradeRowProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  selectedGrade: GradeType | null;
  onGradeSelect: (grade: GradeType) => void;
  cellSize: number;
}

const GAP = 6;

// Grade buttons in display order matching the sketch
const GRADE_ORDER: GradeType[] = [
  'NO_COUNT',
  'CUT',
  'NO_GRADE',
  'FAIR',
  'OK',
  'OK_UNDERLINE',
];

// Color coding for grades
function getGradeColor(grade: GradeType, isActive: boolean, theme: 'light' | 'dark'): string {
  if (!isActive) return theme === 'dark' ? '#2a2a4e' : '#e5e7eb';
  switch (grade) {
    case 'OK_UNDERLINE':
    case 'OK':
      return theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)';
    case 'FAIR':
      return theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)';
    case 'NO_GRADE':
      return theme === 'dark' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)';
    case 'CUT':
      return theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)';
    case 'NO_COUNT':
      return theme === 'dark' ? 'rgba(107, 114, 128, 0.3)' : 'rgba(107, 114, 128, 0.15)';
    default:
      return theme === 'dark' ? '#2a2a4e' : '#e5e7eb';
  }
}

function getGradeBorder(grade: GradeType, isActive: boolean, colors: Record<string, string>): string {
  if (!isActive) return `1px solid ${colors.border}`;
  switch (grade) {
    case 'OK_UNDERLINE':
    case 'OK':
      return `2px solid ${colors.success}`;
    case 'FAIR':
      return `2px solid ${colors.accent}`;
    case 'NO_GRADE':
      return `2px solid ${colors.warning}`;
    case 'CUT':
      return `2px solid ${colors.error}`;
    case 'NO_COUNT':
      return `2px solid ${colors.textSecondary}`;
    default:
      return `1px solid ${colors.border}`;
  }
}

const LSOGradeRow: React.FC<LSOGradeRowProps> = ({
  theme,
  colors,
  selectedGrade,
  onGradeSelect,
  cellSize,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
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
        GRADE
      </div>

      {/* Grade buttons */}
      {GRADE_ORDER.map(grade => {
        const isActive = selectedGrade === grade;
        return (
          <button
            key={grade}
            onClick={() => onGradeSelect(grade)}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: getGradeColor(grade, isActive, theme),
              border: getGradeBorder(grade, isActive, colors),
              borderRadius: '8px',
              cursor: 'pointer',
              color: isActive ? colors.text : colors.textSecondary,
              fontSize: '36px',
              fontWeight: isActive ? 700 : 500,
              textDecoration: grade === 'OK_UNDERLINE' ? 'underline' : 'none',
              textUnderlineOffset: '4px',
            }}
          >
            {grade === 'OK_UNDERLINE' ? 'OK' : GRADE_DISPLAY[grade]}
          </button>
        );
      })}
    </div>
  );
};

export default LSOGradeRow;
