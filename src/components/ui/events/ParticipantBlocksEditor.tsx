import React from 'react';
import { Icon } from '../primitives';
import type { EventActivityParticipantBlock, EventActivityParticipantRule } from '../../../types/EventTypes';

interface NamedOption {
  id: string;
  name: string;
}

interface SquadronOption extends NamedOption {
  designation?: string;
  insignia_url?: string | null;
}

interface ParticipantBlocksEditorProps {
  blocks: EventActivityParticipantBlock[];
  onChange: (blocks: EventActivityParticipantBlock[]) => void;
  squadrons: SquadronOption[];
  standings: NamedOption[];
  qualifications: NamedOption[];
}

type RuleType = EventActivityParticipantRule['type'];

/**
 * Read-only participant summary: one bubble per criteria block, containing the
 * block's squadron insignias together with its other criteria names. Shared by
 * the cycle builder row headers and the event dialog activity cards.
 */
export const ParticipantCriteriaBubbles: React.FC<{
  blocks: EventActivityParticipantBlock[];
  squadrons: SquadronOption[];
  maxWidth?: number;
}> = ({ blocks, squadrons, maxWidth }) => {
  const completedBlocks = blocks
    .map(block => {
      const squadronIds = new Set<string>();
      const otherCriteria: string[] = [];
      block.criteria.forEach(criterion => {
        const values = criterion.values ?? (criterion.value ? [criterion.value] : []);
        if (criterion.type === 'squadron') {
          values.forEach(id => squadronIds.add(id));
        } else {
          values.forEach(v => otherCriteria.push(v));
        }
      });
      return { squadrons: squadrons.filter(s => squadronIds.has(s.id)), otherCriteria };
    })
    .filter(block => block.squadrons.length > 0 || block.otherCriteria.length > 0);

  if (completedBlocks.length === 0) {
    return (
      <span style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', fontStyle: 'italic' }}>
        All participants
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      {completedBlocks.map((block, blockIndex) => (
        <span
          key={blockIndex}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--rr-panel2)',
            border: '1px solid var(--rr-border)',
            borderRadius: '9999px',
            padding: '2px 8px 2px 4px',
            maxWidth: maxWidth ? `${maxWidth}px` : undefined
          }}
        >
          {block.squadrons.map(squadron => (
            squadron.insignia_url ? (
              <span
                key={squadron.id}
                title={squadron.designation || squadron.name}
                style={{
                  width: '18px',
                  height: '18px',
                  backgroundImage: `url(${squadron.insignia_url})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  flexShrink: 0
                }}
              />
            ) : (
              <span key={squadron.id} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--rr-text2)' }}>
                {squadron.designation || squadron.name}
              </span>
            )
          ))}
          {block.otherCriteria.length > 0 && (
            <span style={{
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--rr-accent-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {block.otherCriteria.join(', ')}
            </span>
          )}
        </span>
      ))}
    </div>
  );
};

/** Selected values for a rule type within a block (squadron stores ids, others names) */
const selectedValues = (block: EventActivityParticipantBlock, type: RuleType): string[] => {
  const rule = block.criteria.find(c => c.type === type);
  if (!rule) return [];
  return rule.values ?? (rule.value ? [rule.value] : []);
};

const withToggledValue = (
  block: EventActivityParticipantBlock,
  type: RuleType,
  value: string
): EventActivityParticipantBlock => {
  const current = selectedValues(block, type);
  const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
  const otherRules = block.criteria.filter(c => c.type !== type);
  return {
    criteria: next.length > 0
      ? [...otherRules, { type, value: next[0], values: next }]
      : otherRules
  };
};

/**
 * Participant group editor: every group shows all four criteria as always-open
 * multi-selects (pick any / none) - a pilot matches a group when they satisfy
 * every criterion that has selections (multiple selections within a criterion
 * are OR'd). Groups themselves are OR'd together.
 */
const ParticipantBlocksEditor: React.FC<ParticipantBlocksEditorProps> = ({
  blocks,
  onChange,
  squadrons,
  standings,
  qualifications
}) => {
  // Always present at least one (possibly empty) group to fill in - no extra
  // "add block" click needed for the common case
  const displayBlocks: EventActivityParticipantBlock[] = blocks.length > 0 ? blocks : [{ criteria: [] }];

  const commitBlock = (blockIndex: number, updated: EventActivityParticipantBlock) => {
    const next = displayBlocks.map((b, i) => (i === blockIndex ? updated : b));
    onChange(next);
  };

  const removeBlock = (blockIndex: number) => {
    onChange(displayBlocks.filter((_, i) => i !== blockIndex));
  };

  const addBlock = () => {
    onChange([...displayBlocks, { criteria: [] }]);
  };

  const renderOptionList = (
    block: EventActivityParticipantBlock,
    blockIndex: number,
    type: RuleType,
    label: string,
    options: NamedOption[] | SquadronOption[],
    useIdValues: boolean
  ) => {
    const selected = selectedValues(block, type);
    return (
      <div style={{ flex: '1 1 170px', minWidth: '150px' }}>
        <label style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--rr-text2)',
          marginBottom: '4px',
          fontFamily: 'inherit',
          textTransform: 'uppercase'
        }}>
          {label}
        </label>
        <div style={{
          border: '1px solid var(--rr-border)',
          borderRadius: '4px',
          padding: '4px',
          backgroundColor: 'var(--rr-panel)',
          // Uniform height across all four lists: exactly five rows visible
          height: '148px',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}>
          {options.map(option => {
            const value = useIdValues ? option.id : option.name;
            const isSelected = selected.includes(value);
            const squadron = option as SquadronOption;
            return (
              <div
                key={option.id}
                onClick={() => commitBlock(blockIndex, withToggledValue(block, type, value))}
                style={{
                  height: '26px',
                  padding: '0 6px',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isSelected ? 'var(--rr-accent-weak)' : 'transparent',
                  borderRadius: '3px',
                  transition: 'background-color 0.2s',
                  marginBottom: '2px'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{
                  width: '14px',
                  height: '14px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '3px',
                  backgroundColor: isSelected ? 'var(--rr-accent)' : 'var(--rr-panel)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {type === 'squadron' && (
                  squadron.insignia_url ? (
                    <div style={{
                      width: '18px',
                      height: '18px',
                      backgroundImage: `url(${squadron.insignia_url})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      flexShrink: 0
                    }} />
                  ) : (
                    <div style={{
                      width: '18px',
                      height: '18px',
                      backgroundColor: 'var(--rr-panel3)',
                      borderRadius: '3px',
                      flexShrink: 0
                    }} />
                  )
                )}
                <span style={{
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 400,
                  color: 'var(--rr-text)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {type === 'squadron' ? (squadron.designation || squadron.name) : option.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {displayBlocks.map((block, blockIndex) => (
          <React.Fragment key={blockIndex}>
            {blockIndex > 0 && (
              <span style={{
                alignSelf: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--rr-text3)',
                padding: '4px 10px',
                backgroundColor: 'var(--rr-panel2)',
                borderRadius: '12px',
                flexShrink: 0
              }}>
                OR
              </span>
            )}
            <div style={{
              backgroundColor: 'var(--rr-panel2)',
              border: '1px solid var(--rr-border)',
              borderRadius: '8px',
              padding: '12px 32px 12px 12px',
              position: 'relative',
              boxSizing: 'border-box'
            }}>
              {displayBlocks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBlock(blockIndex)}
                  title="Remove this group"
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    padding: '4px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1
                  }}
                >
                  <Icon name="close" size={16} color="#64748B" />
                </button>
              )}
              {/* Status is deliberately absent - On Leave/Retired/AWOL/Removed
                  members aren't participating in anything */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {renderOptionList(block, blockIndex, 'squadron', 'Squadron', squadrons, true)}
                {renderOptionList(block, blockIndex, 'standing', 'Standing', standings, false)}
                {renderOptionList(block, blockIndex, 'qualification', 'Qualification', qualifications, false)}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        onClick={addBlock}
        style={{
          marginTop: '10px',
          padding: '6px 14px',
          backgroundColor: 'var(--rr-accent-weak)',
          color: 'var(--rr-accent-text)',
          border: '1px solid var(--rr-accent)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontFamily: 'inherit',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <Icon name="plus" size={14} />
        OR
      </button>
    </div>
  );
};

export default ParticipantBlocksEditor;
