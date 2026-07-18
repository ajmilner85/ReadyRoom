import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { CollapsibleSection } from './EventActivitiesEditor';
import type { CycleActivity, AdHocObjective } from '../../../types/EventTypes';

interface SyllabusOption {
  id: string;
  name: string;
  kind: string; // 'linear' | 'pool' | 'module' | 'advanced_qualification'
}

interface CycleActivityConfigPanelProps {
  activity: CycleActivity;
  onChange: (updates: Partial<CycleActivity>) => void;
  /** Cycle length - selecting a syllabus resizes the block to its lesson count */
  weekCount?: number;
  /** Called when the resized block needs more weeks than the cycle currently has */
  onRequireWeeks?: (weeks: number) => void;
}

const KIND_GROUPS: Array<{ title: string; kinds: string[] }> = [
  { title: 'Training Syllabi', kinds: ['linear', 'module'] },
  { title: 'Lesson Pools', kinds: ['pool'] },
  { title: 'Advanced Qualifications', kinds: ['advanced_qualification'] }
];

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  border: '1px solid #CBD5E1',
  borderRadius: '4px',
  fontSize: '14px',
  boxSizing: 'border-box',
  height: '35px',
  appearance: 'menulist',
  backgroundColor: '#FFFFFF',
  color: '#374151',
  fontFamily: "'Inter', sans-serif"
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  border: '1px solid #CBD5E1',
  borderRadius: '4px',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: "'Inter', sans-serif"
};

/**
 * Configuration for the cycle activity selected in the builder: what the
 * activity is (a syllabus / pool / advanced qualification, or an ad-hoc
 * exercise with its objectives). Event-level concerns (support roles,
 * reference materials, debriefing) are configured on the generated events;
 * student/instructor enrollment renders separately in CycleDialog.
 */
const CycleActivityConfigPanel: React.FC<CycleActivityConfigPanelProps> = ({
  activity,
  onChange,
  weekCount,
  onRequireWeeks
}) => {
  const [syllabi, setSyllabi] = useState<SyllabusOption[]>([]);
  const [objectivesExpanded, setObjectivesExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const syllabiResult = await (supabase as any).from('training_syllabi').select('id, name, kind').order('name');
      if (cancelled) return;
      setSyllabi(((syllabiResult.data as any[]) || []).map(s => ({ id: s.id, name: s.name, kind: s.kind || 'linear' })));
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const adHocObjectives = activity.adHocObjectives || [];

  const addObjective = () => {
    const objective: AdHocObjective = {
      id: crypto.randomUUID(),
      text: '',
      scope_level: 'Individual',
      display_order: adHocObjectives.length
    };
    onChange({ adHocObjectives: [...adHocObjectives, objective] });
  };

  return (
    <div style={{ marginTop: '12px', padding: '12px', border: '1px solid #CBD5E1', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
      {/* What this activity is */}
      <select
        value={activity.kind === 'objectives' ? 'objectives' : (activity.syllabusId || '')}
        onChange={async (e) => {
          if (e.target.value === 'objectives') {
            onChange({ kind: 'objectives', syllabusId: undefined, adHocObjectives: activity.adHocObjectives || [] });
            return;
          }
          const syllabusId = e.target.value || undefined;
          onChange({ kind: 'syllabus', syllabusId });
          // Resize the block to span one week per lesson of the selected
          // syllabus, growing the cycle's week count if it doesn't fit
          if (syllabusId) {
            const { count } = await (supabase as any)
              .from('training_syllabus_missions')
              .select('id', { count: 'exact', head: true })
              .eq('syllabus_id', syllabusId);
            if (count && count > 0) {
              const endWeek = activity.startWeek + count - 1;
              if (weekCount !== undefined && endWeek > weekCount) {
                onRequireWeeks?.(endWeek);
              }
              onChange({ kind: 'syllabus', syllabusId, endWeek });
            }
          }
        }}
        style={selectStyle}
      >
        <option value="">Select a Training Activity...</option>
        {KIND_GROUPS.map(group => {
          const groupSyllabi = syllabi.filter(s => group.kinds.includes(s.kind));
          if (groupSyllabi.length === 0) return null;
          return (
            <optgroup key={group.title} label={group.title}>
              {groupSyllabi.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          );
        })}
        <optgroup label="Ad-hoc">
          <option value="objectives">Other Training Exercise (ad-hoc objectives)</option>
        </optgroup>
      </select>

      {/* Ad-hoc exercises: a title and their objectives */}
      {activity.kind === 'objectives' && (
        <>
          <input
            type="text"
            value={activity.label || ''}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
            placeholder="Activity title (e.g. Cadre Free Night)"
            style={{ ...inputStyle, marginTop: '8px' }}
          />
          <CollapsibleSection
            title="Training Objectives"
            summary={`${adHocObjectives.length}`}
            expanded={objectivesExpanded}
            onToggle={() => setObjectivesExpanded(prev => !prev)}
          >
            {adHocObjectives.map((objective, objectiveIndex) => (
              <div key={objective.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <select
                  value={objective.scope_level}
                  onChange={(e) => onChange({
                    adHocObjectives: adHocObjectives.map((o, i) => i === objectiveIndex ? { ...o, scope_level: e.target.value } : o)
                  })}
                  style={{ ...selectStyle, width: '120px', flex: 'none' }}
                >
                  <option value="Individual">Individual</option>
                  <option value="Element">Element</option>
                  <option value="Flight">Flight</option>
                  <option value="Mission">Mission</option>
                </select>
                <input
                  type="text"
                  value={objective.text}
                  onChange={(e) => onChange({
                    adHocObjectives: adHocObjectives.map((o, i) => i === objectiveIndex ? { ...o, text: e.target.value } : o)
                  })}
                  placeholder="Objective text"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => onChange({
                    adHocObjectives: adHocObjectives
                      .filter((_, i) => i !== objectiveIndex)
                      .map((o, i) => ({ ...o, display_order: i }))
                  })}
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
                  title="Remove objective"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addObjective}
              style={{
                padding: '6px 12px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#64748B',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontFamily: 'Inter',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Plus size={14} />
              Add Objective
            </button>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
};

export default CycleActivityConfigPanel;
