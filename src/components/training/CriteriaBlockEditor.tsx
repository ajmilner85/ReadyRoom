/**
 * CriteriaBlockEditor Component
 * 
 * A reusable component for editing block-based enrollment/qualification criteria.
 * Supports OR logic between blocks and AND logic within blocks.
 * 
 * Used for both student auto-enrollment rules and instructor qualification rules.
 */

import React from 'react';
import { Icon } from '../ui/primitives';

// Types
// 'squadron' rules store the squadron UUID (tail codes/designations are never
// unique identifiers); the other types store the record's name for backward
// compatibility with existing saved rules.
export type CriterionType = 'standing' | 'status' | 'qualification' | 'squadron';

export interface EnrollmentRule {
  type: CriterionType;
  value: string;
  /** squadron rules are multi-select: pilot matches ANY of these squadron ids
      (value mirrors values[0] so incomplete-criteria checks keep working) */
  values?: string[];
}

export interface CriteriaBlock {
  criteria: EnrollmentRule[];
}

interface CriteriaBlockEditorProps {
  blocks: CriteriaBlock[];
  onChange: (blocks: CriteriaBlock[]) => void;
  standings: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string }>;
  qualifications: Array<{ id: string; name: string }>;
  /** When provided, a Squadron criterion type becomes available (value = squadron id) */
  squadrons?: Array<{ id: string; name: string; designation?: string; insignia_url?: string | null }>;
  title?: string;
  description?: string;
  blockLabel?: string;
  addBlockLabel?: string;
  /** Minimal layout: no header, block labels, or summary; remove-block is a gray X */
  compact?: boolean;
}

const CriteriaBlockEditor: React.FC<CriteriaBlockEditorProps> = ({
  blocks,
  onChange,
  standings,
  statuses,
  qualifications,
  squadrons,
  title = 'Criteria Rules',
  description = 'Define criteria for matching pilots. Criteria within a block use AND logic. Multiple blocks use OR logic.',
  blockLabel = 'Criteria Block',
  addBlockLabel = 'Add Criteria Block',
  compact = false
}) => {
  // Add a new empty block
  const handleAddBlock = () => {
    onChange([...blocks, { criteria: [{ type: 'status', value: '' }] }]);
  };

  // Remove a block
  const handleRemoveBlock = (blockIndex: number) => {
    onChange(blocks.filter((_, i) => i !== blockIndex));
  };

  // Add a criterion to a block
  const handleAddCriterion = (blockIndex: number) => {
    const updated = [...blocks];
    updated[blockIndex] = {
      ...updated[blockIndex],
      criteria: [...updated[blockIndex].criteria, { type: 'status', value: '' }]
    };
    onChange(updated);
  };

  // Remove a criterion from a block
  const handleRemoveCriterion = (blockIndex: number, criterionIndex: number) => {
    const updated = [...blocks];
    const newCriteria = updated[blockIndex].criteria.filter((_, i) => i !== criterionIndex);
    
    // If no criteria left, remove the entire block
    if (newCriteria.length === 0) {
      onChange(blocks.filter((_, i) => i !== blockIndex));
    } else {
      updated[blockIndex] = { ...updated[blockIndex], criteria: newCriteria };
      onChange(updated);
    }
  };

  // Update criterion type
  const handleTypeChange = (blockIndex: number, criterionIndex: number, type: CriterionType) => {
    const updated = [...blocks];
    updated[blockIndex] = {
      ...updated[blockIndex],
      criteria: updated[blockIndex].criteria.map((c, i) =>
        i === criterionIndex ? (type === 'squadron' ? { type, value: '', values: [] } : { type, value: '' }) : c
      )
    };
    onChange(updated);
  };

  // Toggle one squadron in a multi-select squadron criterion
  const handleSquadronToggle = (blockIndex: number, criterionIndex: number, squadronId: string) => {
    const updated = [...blocks];
    updated[blockIndex] = {
      ...updated[blockIndex],
      criteria: updated[blockIndex].criteria.map((c, i) => {
        if (i !== criterionIndex) return c;
        const current = c.values ?? (c.value ? [c.value] : []);
        const next = current.includes(squadronId)
          ? current.filter(id => id !== squadronId)
          : [...current, squadronId];
        return { ...c, values: next, value: next[0] || '' };
      })
    };
    onChange(updated);
  };

  // Update criterion value
  const handleValueChange = (blockIndex: number, criterionIndex: number, value: string) => {
    const updated = [...blocks];
    updated[blockIndex] = {
      ...updated[blockIndex],
      criteria: updated[blockIndex].criteria.map((c, i) => 
        i === criterionIndex ? { ...c, value } : c
      )
    };
    onChange(updated);
  };

  // Get options for a criterion type
  const getOptions = (type: CriterionType) => {
    switch (type) {
      case 'standing':
        return standings;
      case 'status':
        return statuses;
      case 'qualification':
        return qualifications;
      case 'squadron':
        return squadrons || [];
      default:
        return [];
    }
  };

  // Squadron rules store the id; everything else stores the name
  const getOptionValue = (type: CriterionType, option: { id: string; name: string }) =>
    type === 'squadron' ? option.id : option.name;

  const getDisplayValue = (criterion: EnrollmentRule) => {
    if (criterion.type === 'squadron') {
      const ids = criterion.values ?? (criterion.value ? [criterion.value] : []);
      return ids
        .map(id => {
          const squadron = (squadrons || []).find(s => s.id === id);
          return squadron?.designation || squadron?.name || id;
        })
        .join(' or ');
    }
    return criterion.value;
  };

  return (
    <div>
      {/* Header */}
      {!compact && (
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '8px',
          color: 'var(--rr-text2)',
          textTransform: 'uppercase'
        }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--rr-text2)', margin: 0 }}>
          {description}
        </p>
      </div>
      )}

      {/* Blocks: compact mode flows them horizontally (~3 per row) with inline
          OR pills; full mode keeps the stacked layout with divider lines */}
      {blocks.length > 0 && (
        <div style={compact
          ? { display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '12px', marginBottom: '16px' }
          : { display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }
        }>
          {blocks.map((block, blockIndex) => (
            <React.Fragment key={blockIndex}>
              {/* OR separator between blocks */}
              {blockIndex > 0 && (compact ? (
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
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--rr-panel3)' }} />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--rr-text3)',
                    padding: '4px 12px',
                    backgroundColor: 'var(--rr-panel2)',
                    borderRadius: '12px'
                  }}>
                    OR
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--rr-panel3)' }} />
                </div>
              ))}

              {/* Block container */}
              <div style={{
                ...(compact ? { flex: '1 1 280px', minWidth: '250px', maxWidth: '380px', boxSizing: 'border-box' as const } : {}),
                backgroundColor: 'var(--rr-panel2)',
                border: '1px solid var(--rr-border)',
                borderRadius: '8px',
                // Compact mode reserves right padding for the corner remove-X
                padding: compact ? '12px 36px 12px 12px' : '16px',
                position: 'relative'
              }}>
                {/* Block header: compact mode collapses it to a corner X */}
                {compact ? (
                  <button type="button"
                    onClick={() => handleRemoveBlock(blockIndex)}
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
                    title="Remove block"
                  >
                    <Icon name="close" size={16} color="#64748B" />
                  </button>
                ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--rr-text)'
                  }}>
                    {blockLabel} {blockIndex + 1}
                  </span>
                  <button type="button"
                    onClick={() => handleRemoveBlock(blockIndex)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      color: 'var(--rr-text3)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--rr-bad)';
                      e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--rr-text3)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="Remove block"
                  >
                    <Icon name="close" size={14} />
                    Remove Block
                  </button>
                </div>
                )}

                {/* Criteria within block */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {block.criteria.map((criterion, criterionIndex) => (
                    <div key={criterionIndex}>
                      {/* AND separator within block */}
                      {criterionIndex > 0 && (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          paddingLeft: '8px',
                          marginBottom: '8px'
                        }}>
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 600, 
                            color: 'var(--rr-accent-text)',
                            padding: '2px 8px',
                            backgroundColor: 'var(--rr-accent-weak)',
                            borderRadius: '8px'
                          }}>
                            AND
                          </span>
                        </div>
                      )}

                      {/* Criterion row */}
                      <div style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        alignItems: 'center' 
                      }}>
                        {/* Type selector */}
                        <select
                          value={criterion.type}
                          onChange={(e) => handleTypeChange(blockIndex, criterionIndex, e.target.value as CriterionType)}
                          style={{
                            padding: compact ? '8px 6px' : '8px 12px',
                            border: '1px solid var(--rr-border2)',
                            borderRadius: '6px',
                            fontSize: compact ? '13px' : '14px',
                            backgroundColor: 'var(--rr-panel)',
                            width: compact ? '104px' : '140px',
                            flexShrink: 0,
                            cursor: 'pointer'
                          }}
                        >
                          {squadrons && squadrons.length > 0 && (
                            <option value="squadron">Squadron</option>
                          )}
                          <option value="standing">Standing</option>
                          <option value="status">Status</option>
                          <option value="qualification">Qualification</option>
                        </select>

                        {/* Value selector: squadron rules are multi-select
                            (match ANY checked squadron), others single-select.
                            Rows mirror the Participating Squadrons list. */}
                        {criterion.type === 'squadron' ? (
                          <div style={{
                            flex: 1,
                            border: '1px solid var(--rr-border)',
                            borderRadius: '4px',
                            padding: '4px',
                            backgroundColor: 'var(--rr-panel2)'
                          }}>
                            {(squadrons || []).map(squadron => {
                              const selectedIds = criterion.values ?? (criterion.value ? [criterion.value] : []);
                              const isSelected = selectedIds.includes(squadron.id);
                              return (
                                <div
                                  key={squadron.id}
                                  onClick={() => handleSquadronToggle(blockIndex, criterionIndex, squadron.id)}
                                  style={{
                                    padding: '6px 8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    backgroundColor: isSelected ? 'var(--rr-accent-weak)' : 'transparent',
                                    borderRadius: '3px',
                                    transition: 'background-color 0.2s',
                                    marginBottom: '2px'
                                  }}
                                  onMouseEnter={e => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                    }
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

                                  {squadron.insignia_url ? (
                                    <div style={{
                                      width: '20px',
                                      height: '20px',
                                      backgroundImage: `url(${squadron.insignia_url})`,
                                      backgroundSize: 'contain',
                                      backgroundRepeat: 'no-repeat',
                                      backgroundPosition: 'center',
                                      flexShrink: 0
                                    }} />
                                  ) : (
                                    <div style={{
                                      width: '20px',
                                      height: '20px',
                                      backgroundColor: 'var(--rr-panel3)',
                                      borderRadius: '3px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0
                                    }}>
                                      <span style={{ fontSize: '10px', color: 'var(--rr-text2)' }}>?</span>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'inherit' }}>
                                      {squadron.designation || squadron.name}
                                    </span>
                                    {squadron.designation && (
                                      <span style={{ fontSize: '10px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                                        {squadron.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                        <select
                          value={criterion.value}
                          onChange={(e) => handleValueChange(blockIndex, criterionIndex, e.target.value)}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid var(--rr-border2)',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: 'var(--rr-panel)',
                            flex: 1,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select {criterion.type}...</option>
                          {getOptions(criterion.type).map(option => (
                            <option key={option.id} value={getOptionValue(criterion.type, option)}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        )}

                        {/* Remove criterion button */}
                        <button type="button"
                          onClick={() => handleRemoveCriterion(blockIndex, criterionIndex)}
                          style={{
                            padding: '8px',
                            backgroundColor: 'var(--rr-panel)',
                            color: 'var(--rr-text3)',
                            border: '1px solid var(--rr-border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
                            e.currentTarget.style.color = 'var(--rr-bad)';
                            e.currentTarget.style.borderColor = 'var(--rr-bad)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                            e.currentTarget.style.color = 'var(--rr-text3)';
                            e.currentTarget.style.borderColor = 'var(--rr-border)';
                          }}
                          title="Remove criterion"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add criterion button */}
                  <button type="button"
                    onClick={() => handleAddCriterion(blockIndex)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--rr-panel)',
                      color: 'var(--rr-accent-text)',
                      border: '1px dashed var(--rr-accent)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Add AND Criterion
                  </button>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Add block button */}
      <button type="button"
        onClick={handleAddBlock}
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--rr-accent-weak)',
          color: 'var(--rr-accent-text)',
          border: '1px solid var(--rr-accent)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
        }}
      >
        <Icon name="plus" size={16} />
        {addBlockLabel}
      </button>

      {/* Summary of rules */}
      {!compact && blocks.length > 0 && (
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: 'var(--rr-panel2)', 
          borderRadius: '6px',
          border: '1px solid var(--rr-border)'
        }}>
          <p style={{ 
            fontSize: '12px', 
            color: 'var(--rr-text2)', 
            margin: 0,
            fontStyle: 'italic'
          }}>
            <strong>Summary:</strong>{' '}
            {blocks.map((block) => {
              const blockDesc = block.criteria
                .filter(c => c.value)
                .map(c => `${c.type}: ${getDisplayValue(c)}`)
                .join(' AND ');
              return blockDesc || '(incomplete criteria)';
            }).join(' OR ')}
          </p>
        </div>
      )}
    </div>
  );
};

export default CriteriaBlockEditor;
