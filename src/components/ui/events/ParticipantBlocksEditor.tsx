import React from 'react';
import { Plus, X } from 'lucide-react';
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
  statuses: NamedOption[];
  qualifications: NamedOption[];
}

type RuleType = EventActivityParticipantRule['type'];

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
  statuses,
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
          color: '#64748B',
          marginBottom: '4px',
          fontFamily: 'Inter',
          textTransform: 'uppercase'
        }}>
          {label}
        </label>
        <div style={{
          border: '1px solid #E5E7EB',
          borderRadius: '4px',
          padding: '4px',
          backgroundColor: '#FFFFFF',
          maxHeight: '164px',
          overflowY: 'auto'
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
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                  borderRadius: '3px',
                  transition: 'background-color 0.2s',
                  marginBottom: '2px'
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{
                  width: '14px',
                  height: '14px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '3px',
                  backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
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
                      backgroundColor: '#E5E7EB',
                      borderRadius: '3px',
                      flexShrink: 0
                    }} />
                  )
                )}
                <span style={{
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 400,
                  color: '#374151',
                  fontFamily: 'Inter',
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '12px' }}>
        {displayBlocks.map((block, blockIndex) => (
          <React.Fragment key={blockIndex}>
            {blockIndex > 0 && (
              <span style={{
                alignSelf: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: '#9CA3AF',
                padding: '4px 10px',
                backgroundColor: '#F3F4F6',
                borderRadius: '12px',
                flexShrink: 0
              }}>
                OR
              </span>
            )}
            <div style={{
              flex: '1 1 460px',
              minWidth: '380px',
              backgroundColor: '#F9FAFB',
              border: '1px solid #E5E7EB',
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
                  <X size={16} color="#64748B" />
                </button>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {renderOptionList(block, blockIndex, 'squadron', 'Squadron', squadrons, true)}
                {renderOptionList(block, blockIndex, 'qualification', 'Qualification', qualifications, false)}
                {renderOptionList(block, blockIndex, 'standing', 'Standing', standings, false)}
                {renderOptionList(block, blockIndex, 'status', 'Status', statuses, false)}
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
          backgroundColor: '#EFF6FF',
          color: '#2563EB',
          border: '1px solid #BFDBFE',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontFamily: 'Inter',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <Plus size={14} />
        OR
      </button>
    </div>
  );
};

export default ParticipantBlocksEditor;
