/**
 * CriteriaBlockEditor Component
 * 
 * A reusable component for editing block-based enrollment/qualification criteria.
 * Supports OR logic between blocks and AND logic within blocks.
 * 
 * Used for both student auto-enrollment rules and instructor qualification rules.
 */

import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';

// Types
export interface EnrollmentRule {
  type: 'standing' | 'status' | 'qualification';
  value: string;
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
  title?: string;
  description?: string;
  blockLabel?: string;
  addBlockLabel?: string;
}

const CriteriaBlockEditor: React.FC<CriteriaBlockEditorProps> = ({
  blocks,
  onChange,
  standings,
  statuses,
  qualifications,
  title = 'Criteria Rules',
  description = 'Define criteria for matching pilots. Criteria within a block use AND logic. Multiple blocks use OR logic.',
  blockLabel = 'Criteria Block',
  addBlockLabel = 'Add Criteria Block'
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
  const handleTypeChange = (blockIndex: number, criterionIndex: number, type: 'standing' | 'status' | 'qualification') => {
    const updated = [...blocks];
    updated[blockIndex] = {
      ...updated[blockIndex],
      criteria: updated[blockIndex].criteria.map((c, i) => 
        i === criterionIndex ? { type, value: '' } : c
      )
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
  const getOptions = (type: 'standing' | 'status' | 'qualification') => {
    switch (type) {
      case 'standing':
        return standings;
      case 'status':
        return statuses;
      case 'qualification':
        return qualifications;
      default:
        return [];
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: 600, 
          marginBottom: '8px', 
          color: '#6B7280', 
          textTransform: 'uppercase' 
        }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
          {description}
        </p>
      </div>

      {/* Blocks */}
      {blocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          {blocks.map((block, blockIndex) => (
            <div key={blockIndex}>
              {/* OR separator between blocks */}
              {blockIndex > 0 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  marginBottom: '16px' 
                }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#9CA3AF',
                    padding: '4px 12px',
                    backgroundColor: '#F3F4F6',
                    borderRadius: '12px'
                  }}>
                    OR
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
                </div>
              )}

              {/* Block container */}
              <div style={{ 
                backgroundColor: '#F9FAFB', 
                border: '1px solid #E5E7EB', 
                borderRadius: '8px',
                padding: '16px'
              }}>
                {/* Block header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: 500, 
                    color: '#374151' 
                  }}>
                    {blockLabel} {blockIndex + 1}
                  </span>
                  <button
                    onClick={() => handleRemoveBlock(blockIndex)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      color: '#9CA3AF',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#DC2626';
                      e.currentTarget.style.backgroundColor = '#FEE2E2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#9CA3AF';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="Remove block"
                  >
                    <X size={14} />
                    Remove Block
                  </button>
                </div>

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
                            color: '#2563EB',
                            padding: '2px 8px',
                            backgroundColor: '#EFF6FF',
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
                          onChange={(e) => handleTypeChange(blockIndex, criterionIndex, e.target.value as 'standing' | 'status' | 'qualification')}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: 'white',
                            width: '140px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="standing">Standing</option>
                          <option value="status">Status</option>
                          <option value="qualification">Qualification</option>
                        </select>

                        {/* Value selector */}
                        <select
                          value={criterion.value}
                          onChange={(e) => handleValueChange(blockIndex, criterionIndex, e.target.value)}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: 'white',
                            flex: 1,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select {criterion.type}...</option>
                          {getOptions(criterion.type).map(option => (
                            <option key={option.id} value={option.name}>
                              {option.name}
                            </option>
                          ))}
                        </select>

                        {/* Remove criterion button */}
                        <button
                          onClick={() => handleRemoveCriterion(blockIndex, criterionIndex)}
                          style={{
                            padding: '8px',
                            backgroundColor: 'white',
                            color: '#9CA3AF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#FEE2E2';
                            e.currentTarget.style.color = '#DC2626';
                            e.currentTarget.style.borderColor = '#FECACA';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.color = '#9CA3AF';
                            e.currentTarget.style.borderColor = '#E5E7EB';
                          }}
                          title="Remove criterion"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add criterion button */}
                  <button
                    onClick={() => handleAddCriterion(blockIndex)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      color: '#2563EB',
                      border: '1px dashed #BFDBFE',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#EFF6FF';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    <Plus size={14} />
                    Add AND Criterion
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add block button */}
      <button
        onClick={handleAddBlock}
        style={{
          padding: '10px 16px',
          backgroundColor: '#EFF6FF',
          color: '#2563EB',
          border: '1px solid #BFDBFE',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#DBEAFE';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#EFF6FF';
        }}
      >
        <Plus size={16} />
        {addBlockLabel}
      </button>

      {/* Summary of rules */}
      {blocks.length > 0 && (
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#F9FAFB', 
          borderRadius: '6px',
          border: '1px solid #E5E7EB'
        }}>
          <p style={{ 
            fontSize: '12px', 
            color: '#6B7280', 
            margin: 0,
            fontStyle: 'italic'
          }}>
            <strong>Summary:</strong>{' '}
            {blocks.map((block) => {
              const blockDesc = block.criteria
                .filter(c => c.value)
                .map(c => `${c.type}: ${c.value}`)
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
