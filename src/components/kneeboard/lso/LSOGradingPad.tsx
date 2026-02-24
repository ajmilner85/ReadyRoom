import React from 'react';
import type { ApproachPhase, DeviationSeverity } from './types/lsoTypes';
import { getButtonsForPhase, getCategoriesForPhase, ROW_GROUPS, CATEGORY_LABELS, INLINE_CATEGORIES, type RowGroup } from './data/padConfig';

interface LSOGradingPadProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  currentPhase: ApproachPhase;
  getDeviationState: (symbol: string) => DeviationSeverity | null;
  onToggleDeviation: (symbol: string) => void;
  cellSize: number;
}

const GAP = 6;

// Display label based on severity state
function getButtonLabel(baseLabel: string, severity: DeviationSeverity | null): string {
  switch (severity) {
    case 'a_little': return `(${baseLabel})`;
    case 'reasonable': return baseLabel;
    case 'gross': return baseLabel;
    default: return baseLabel;
  }
}

// Background color based on severity state
function getButtonBg(severity: DeviationSeverity | null, theme: 'light' | 'dark'): string {
  if (!severity) {
    return theme === 'dark' ? '#2a2a4e' : '#e5e7eb';
  }
  switch (severity) {
    case 'a_little':
      return theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)';
    case 'reasonable':
      return theme === 'dark' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)';
    case 'gross':
      return theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)';
    default:
      return theme === 'dark' ? '#2a2a4e' : '#e5e7eb';
  }
}

function getButtonBorder(severity: DeviationSeverity | null, colors: Record<string, string>): string {
  if (!severity) return `1px solid ${colors.border}`;
  switch (severity) {
    case 'a_little': return `2px solid ${colors.success}`;
    case 'reasonable': return `2px solid ${colors.success}`;
    case 'gross': return `2px solid ${colors.warning}`;
    default: return `1px solid ${colors.border}`;
  }
}

const LSOGradingPad: React.FC<LSOGradingPadProps> = ({
  theme,
  colors,
  currentPhase,
  getDeviationState,
  onToggleDeviation,
  cellSize,
}) => {
  const categories = getCategoriesForPhase(currentPhase);
  const allButtons = getButtonsForPhase(currentPhase);

  // Secondary categories rendered inline with their primary — skip as top-level rows
  const secondaryCategories = new Set(Object.values(ROW_GROUPS).map((g: RowGroup) => g.secondary));

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

  const renderButtons = (btns: typeof allButtons) => btns.map(btn => {
    if (btn.isLabel) {
      return (
        <div key={btn.symbol} style={{ ...labelStyle, fontSize: '24px', lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {btn.label}
        </div>
      );
    }
    const severity = getDeviationState(btn.symbol);
    const label = getButtonLabel(btn.label, severity);
    return (
      <button
        key={btn.symbol}
        onClick={() => onToggleDeviation(btn.symbol)}
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: getButtonBg(severity, theme),
          border: getButtonBorder(severity, colors),
          borderRadius: '8px',
          cursor: 'pointer',
          color: severity ? colors.text : colors.textSecondary,
          fontSize: label.length > 5 ? '28px' : '32px',
          fontWeight: severity ? 700 : 500,
          textDecoration: severity === 'gross' ? 'underline' : 'none',
          padding: '4px',
        }}
      >
        {label}
      </button>
    );
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {categories
        .filter(cat => !secondaryCategories.has(cat) && !INLINE_CATEGORIES.has(cat))
        .map(category => {
          const categoryButtons = allButtons.filter(b => b.category === category);
          const rowGroup = ROW_GROUPS[category];
          const secondaryCat = rowGroup?.secondary;
          const secondaryButtons = secondaryCat
            ? allButtons.filter(b => b.category === secondaryCat)
            : [];

          return (
            <div key={category} style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${GAP}px`,
            }}>
              {/* Primary category label */}
              <div style={labelStyle}>
                {(CATEGORY_LABELS[category] ?? category).split('\n').map((line, i, arr) => (
                  <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
                ))}
              </div>

              {/* Primary buttons */}
              {renderButtons(categoryButtons)}

              {/* Secondary section: optional spacer + label + buttons */}
              {secondaryButtons.length > 0 && rowGroup && (
                <>
                  {rowGroup.spacer && <div style={{ width: `${cellSize}px`, height: `${cellSize}px`, flexShrink: 0 }} />}
                  <div style={labelStyle}>
                    {(CATEGORY_LABELS[secondaryCat!] ?? secondaryCat).split('\n').map((line, i, arr) => (
                      <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
                    ))}
                  </div>
                  {renderButtons(secondaryButtons)}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default LSOGradingPad;
