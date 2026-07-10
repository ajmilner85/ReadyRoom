import React from 'react';
import { Plus, X } from 'lucide-react';
import StyledSelect from './StyledSelect';
import {
  AWARD_METRICS,
  AWARD_COMPARATORS,
  awardMetricDefinition,
  emptyRuleGroup,
  newRuleCondition,
  type AwardRuleGroup,
  type AwardRuleNode,
  type AwardRuleCondition,
  type AwardMetricId
} from '../../utils/awardRules';
import type { DossierCycle } from '../../utils/dossierService';

// Visual editor for an award eligibility rule tree. Conditions are evaluated
// per (pilot, cycle); groups combine them with ALL (and) / ANY (or). One
// level of sub-grouping keeps the UI manageable while covering e.g.
// "active member AND (attendance >= 50% OR events attended >= 3)".
//
// Each condition can be measured against "the cycle being issued for"
// (default — right for reusable awards like a deployment ribbon) or pinned
// to a specific cycle (right for campaign medals tied to one operation).

interface AwardRuleBuilderProps {
  group: AwardRuleGroup;
  onChange: (group: AwardRuleGroup) => void;
  /** Cycles offered for pinning a condition to a specific cycle */
  cycles: DossierCycle[];
  depth?: number;
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  backgroundColor: '#FFFFFF',
  fontSize: '13px',
  fontFamily: 'Inter'
};

const smallButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 10px',
  backgroundColor: '#FFFFFF',
  color: '#64748B',
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  cursor: 'pointer',
  fontFamily: 'Inter',
  fontSize: '12px'
};

const AwardRuleBuilder: React.FC<AwardRuleBuilderProps> = ({ group, onChange, cycles, depth = 0 }) => {
  const updateChild = (index: number, child: AwardRuleNode) => {
    const children = [...group.children];
    children[index] = child;
    onChange({ ...group, children });
  };

  const removeChild = (index: number) => {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) });
  };

  const addCondition = () => {
    onChange({ ...group, children: [...group.children, newRuleCondition()] });
  };

  const addGroup = () => {
    const sub = emptyRuleGroup('or');
    sub.children = [newRuleCondition()];
    onChange({ ...group, children: [...group.children, sub] });
  };

  const renderCondition = (condition: AwardRuleCondition, index: number) => {
    const metric = awardMetricDefinition(condition.metric);
    return (
      <div key={condition.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ width: '230px' }}>
          <StyledSelect
            value={condition.metric}
            onChange={(metricId) => {
              const nextMetric = metricId as AwardMetricId;
              const nextIsBoolean = awardMetricDefinition(nextMetric).isBoolean;
              updateChild(index, {
                ...condition,
                metric: nextMetric,
                // Booleans always use "equals 1/0"
                comparator: nextIsBoolean ? 'eq' : condition.comparator,
                value: nextIsBoolean ? 1 : condition.value
              });
            }}
            options={AWARD_METRICS.map(m => ({ value: m.id, label: m.label }))}
          />
        </div>

        <span style={{ fontSize: '12px', color: '#94A3B8' }}>in</span>
        <div style={{ width: '190px' }}>
          <StyledSelect
            value={condition.cycleId || ''}
            onChange={(selectedCycleId) => updateChild(index, { ...condition, cycleId: selectedCycleId || null })}
            options={[
              { value: '', label: 'Cycle being issued for' },
              ...cycles.map(cycle => ({ value: cycle.id, label: cycle.name }))
            ]}
          />
        </div>

        {metric.isBoolean ? (
          <div style={{ width: '90px' }}>
            <StyledSelect
              value={condition.value >= 1 ? 'yes' : 'no'}
              onChange={(answer) => updateChild(index, { ...condition, comparator: 'eq', value: answer === 'yes' ? 1 : 0 })}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' }
              ]}
            />
          </div>
        ) : (
          <>
            <div style={{ width: '130px' }}>
              <StyledSelect
                value={condition.comparator}
                onChange={(comparator) => updateChild(index, { ...condition, comparator: comparator as AwardRuleCondition['comparator'] })}
                options={AWARD_COMPARATORS.map(c => ({ value: c.id, label: c.label }))}
              />
            </div>
            <input
              type="number"
              min={0}
              value={condition.value}
              onChange={(e) => updateChild(index, { ...condition, value: Number(e.target.value) || 0 })}
              style={{ ...selectStyle, width: '72px' }}
            />
            {metric.unit && <span style={{ fontSize: '13px', color: '#64748B' }}>{metric.unit}</span>}
          </>
        )}

        <button
          onClick={() => removeChild(index)}
          title="Remove condition"
          style={{ ...smallButtonStyle, padding: '5px 6px', color: '#DC2626', borderColor: '#FCA5A5' }}
        >
          <X size={12} />
        </button>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: depth > 0 ? '10px 12px' : 0,
      border: depth > 0 ? '1px dashed #CBD5E1' : 'none',
      borderRadius: depth > 0 ? '8px' : 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '200px' }}>
          <StyledSelect
            value={group.op}
            onChange={(op) => onChange({ ...group, op: op as 'and' | 'or' })}
            options={[
              { value: 'and', label: 'All of the following' },
              { value: 'or', label: 'Any of the following' }
            ]}
          />
        </div>
        {depth > 0 && (
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>(sub-group)</span>
        )}
      </div>

      {group.children.map((child, index) => (
        child.kind === 'condition' ? (
          renderCondition(child, index)
        ) : (
          <div key={child.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <AwardRuleBuilder group={child} onChange={(sub) => updateChild(index, sub)} cycles={cycles} depth={depth + 1} />
            </div>
            <button
              onClick={() => removeChild(index)}
              title="Remove sub-group"
              style={{ ...smallButtonStyle, padding: '5px 6px', color: '#DC2626', borderColor: '#FCA5A5' }}
            >
              <X size={12} />
            </button>
          </div>
        )
      ))}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={addCondition} style={smallButtonStyle}>
          <Plus size={12} /> Condition
        </button>
        {depth === 0 && (
          <button onClick={addGroup} style={smallButtonStyle}>
            <Plus size={12} /> Sub-group
          </button>
        )}
      </div>
    </div>
  );
};

export default AwardRuleBuilder;
