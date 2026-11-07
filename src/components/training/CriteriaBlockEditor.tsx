/**
 * CriteriaBlockEditor Component
 * 
 * A reusable component for editing block-based enrollment/qualification criteria.
 * Supports OR logic between blocks and AND logic within blocks.
 * 
 * Used for both student auto-enrollment rules and instructor qualification rules.
 */

import React from 'react';
import { Button, IconButton, Select } from '../ui/primitives';

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

  const typeOptions = [
    ...(squadrons && squadrons.length > 0 ? [{ value: 'squadron' as CriterionType, label: 'Squadron' }] : []),
    { value: 'standing' as CriterionType, label: 'Standing' },
    { value: 'status' as CriterionType, label: 'Status' },
    { value: 'qualification' as CriterionType, label: 'Qualification' },
  ];

  const summary = blocks.map(block => {
    const parts = block.criteria.filter(c => c.value).map(c => `${c.type}: ${getDisplayValue(c)}`);
    return parts.length ? parts.join(' AND ') : '(incomplete)';
  });

  const orDivider = (key: string) => (
    <div key={key} className={compact ? 'self-center flex-none' : 'flex items-center gap-3'}>
      {compact ? null : <span className="flex-1 h-px bg-border" />}
      <span className="font-mono text-[10px] font-semibold tracking-[.12em] text-text3 px-[10px] h-[22px] inline-flex items-center rounded-full bg-panel2 border border-border">OR</span>
      {compact ? null : <span className="flex-1 h-px bg-border" />}
    </div>
  );

  return (
    <div className="flex flex-col gap-[14px]">
      {!compact ? (
        <div>
          <div className="rr-pane-title">{title}</div>
          <p className="m-0 mt-1 text-[12.5px] text-text2 leading-[1.5] max-w-[75ch]">{description}</p>
        </div>
      ) : null}

      {blocks.length > 0 ? (
        <div className={compact ? 'flex flex-wrap items-stretch gap-3' : 'flex flex-col gap-3'}>
          {blocks.map((block, blockIndex) => (
            <React.Fragment key={blockIndex}>
              {blockIndex > 0 ? orDivider(`or-${blockIndex}`) : null}
              <div
                className="rounded-rr-lg border border-border bg-panel2 flex flex-col"
                style={compact ? { flex: '1 1 280px', minWidth: 250, maxWidth: 380 } : undefined}
              >
                <div className="flex items-center gap-2 pl-[12px] pr-[6px] min-h-[38px] border-b border-border">
                  <span className="font-mono text-[10px] tracking-[.12em] uppercase text-text2">{compact ? `Block ${blockIndex + 1}` : `${blockLabel} ${blockIndex + 1}`}</span>
                  <span className="flex-1" />
                  <IconButton icon="close" size={24} iconSize={12} label="Remove block" className="hover:!text-bad" onClick={() => handleRemoveBlock(blockIndex)} />
                </div>
                <div className="flex flex-col gap-[6px] p-[12px]">
                  {block.criteria.map((criterion, criterionIndex) => {
                    const selectedIds = criterion.values ?? (criterion.value ? [criterion.value] : []);
                    return (
                      <React.Fragment key={criterionIndex}>
                        {criterionIndex > 0 ? (
                          <span className="self-start ml-[6px] font-mono text-[10px] font-semibold tracking-[.12em] px-[8px] h-[20px] inline-flex items-center rounded-full" style={{ background: 'var(--rr-accent-weak)', color: 'var(--rr-accent-text)' }}>AND</span>
                        ) : null}
                        <div className="flex items-start gap-2">
                          <div className={compact ? 'w-[118px] flex-none' : 'w-[150px] flex-none'}>
                            <Select<CriterionType>
                              size="sm"
                              value={criterion.type}
                              onChange={v => handleTypeChange(blockIndex, criterionIndex, v)}
                              options={typeOptions}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            {criterion.type === 'squadron' ? (
                              // Multi-select: pilot matches ANY selected squadron
                              <div className="flex flex-wrap gap-[6px]">
                                {(squadrons || []).map(sq => {
                                  const on = selectedIds.includes(sq.id);
                                  return (
                                    <button
                                      key={sq.id}
                                      type="button"
                                      aria-pressed={on}
                                      title={sq.name}
                                      onClick={() => handleSquadronToggle(blockIndex, criterionIndex, sq.id)}
                                      className={`inline-flex items-center gap-[6px] h-[30px] pl-[5px] pr-[9px] rounded-rr-ctl border text-[12px] font-semibold cursor-pointer transition-colors ${on ? 'border-accent bg-accent-weak text-text' : 'border-border2 bg-panel text-text2 hover:border-accent hover:text-text'}`}
                                    >
                                      {sq.insignia_url ? <img src={sq.insignia_url} alt="" className="w-[18px] h-[18px] object-contain" /> : <span className="w-[18px] h-[18px] rounded-[4px] bg-panel3" />}
                                      {sq.designation || sq.name}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <Select
                                size="sm"
                                value={criterion.value}
                                onChange={v => handleValueChange(blockIndex, criterionIndex, v)}
                                placeholder={`Select ${criterion.type}…`}
                                searchable={getOptions(criterion.type).length > 10}
                                options={getOptions(criterion.type).map(o => ({ value: getOptionValue(criterion.type, o), label: o.name }))}
                              />
                            )}
                          </div>
                          <IconButton icon="trash" size={30} iconSize={13} label="Remove criterion" className="hover:!text-bad flex-none" onClick={() => handleRemoveCriterion(blockIndex, criterionIndex)} />
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div className="pt-[2px]">
                    <Button size="sm" variant="ghost" icon="plus" onClick={() => handleAddCriterion(blockIndex)}>AND criterion</Button>
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      <div>
        <Button size="sm" variant="secondary" icon="plus" onClick={handleAddBlock}>{addBlockLabel}</Button>
      </div>

      {!compact && blocks.length > 0 ? (
        <div className="flex items-start gap-2 px-3 py-[10px] rounded-rr-lg bg-panel2 border border-border text-[12px] text-text2 leading-[1.5]">
          <span className="rr-label pt-[2px] flex-none">Summary</span>
          <span>
            {summary.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <span className="font-mono text-[10.5px] font-semibold text-text3 mx-[6px]">OR</span> : null}
                <span className={t === '(incomplete)' ? 'text-warn' : 'text-text'}>{t}</span>
              </React.Fragment>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default CriteriaBlockEditor;
