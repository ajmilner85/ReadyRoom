import React from 'react';
import type { PerformanceCategoryKey, PerformanceRatingsFormState } from '../../types/DebriefingTypes';

interface PerformanceCategoriesProps {
  ratings: PerformanceRatingsFormState;
  onChange: (ratings: PerformanceRatingsFormState) => void;
  disabled?: boolean;
  comments?: Record<string, string>;
  onCommentsChange?: (comments: Record<string, string>) => void;
}

const CATEGORIES: Array<{ key: PerformanceCategoryKey; label: string }> = [
  { key: 'mission_planning', label: 'Mission Planning & Brief Execution' },
  { key: 'flight_discipline', label: 'Flight Discipline & Communication' },
  { key: 'formation_navigation', label: 'Formation & Navigation' },
  { key: 'tactical_execution', label: 'Tactical Execution' },
  { key: 'situational_awareness', label: 'Situational Awareness' },
  { key: 'weapons_employment', label: 'Weapons Employment' },
  { key: 'survivability_safety', label: 'Survivability & Safety' },
  { key: 'debrief_participation', label: 'Debrief & Reflection Participation' }
];

const PerformanceCategories: React.FC<PerformanceCategoriesProps> = ({
  ratings,
  onChange,
  disabled = false,
  comments = {},
  onCommentsChange
}) => {
  const handleRatingChange = (category: string, value: boolean) => {
    onChange({
      ...ratings,
      [category]: value
    });
  };

  const handleCommentChange = (category: string, value: string) => {
    if (onCommentsChange) {
      onCommentsChange({
        ...comments,
        [category]: value
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Single light gray container for all categories */}
      <div style={{
        backgroundColor: '#F8FAFC',
        borderRadius: '6px',
        border: '1px solid #E2E8F0',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {CATEGORIES.map((category) => (
          <div key={category.key} style={{ display: 'flex', gap: '12px' }}>
            {/* Right side: heading and textarea */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#1E293B'
              }}>
                {category.label}
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                {/* Left side: SAT/UNSAT buttons stacked */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '1px' }}>
                  <button
                    type="button"
                    onClick={() => handleRatingChange(category.key, true)}
                    disabled={disabled}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 10px',
                      height: '32px',
                      backgroundColor:
                        ratings[category.key] === true ? '#10B981' : '#FFFFFF',
                      color: ratings[category.key] === true ? '#FFFFFF' : '#64748B',
                      border: `1px solid ${
                        ratings[category.key] === true ? '#10B981' : '#CBD5E1'
                      }`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    SAT
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRatingChange(category.key, false)}
                    disabled={disabled}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 10px',
                      height: '32px',
                      backgroundColor:
                        ratings[category.key] === false ? '#94A3B8' : '#FFFFFF',
                      color: ratings[category.key] === false ? '#1E293B' : '#64748B',
                      border: `1px solid ${
                        ratings[category.key] === false ? '#94A3B8' : '#CBD5E1'
                      }`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    UNSAT
                  </button>
                </div>

                <textarea
                  value={comments[category.key] || ''}
                  onChange={(e) => handleCommentChange(category.key, e.target.value)}
                  disabled={disabled}
                  placeholder=""
                  style={{
                    flex: 1,
                    height: '69px',
                    padding: '4px 8px 8px 8px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: '#1E293B',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PerformanceCategories;
