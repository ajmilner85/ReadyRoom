import React, { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, CheckSquare, Plus } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { getActiveQualifications, Qualification } from '../../../utils/qualificationService';
import type { EventActivity, EventActivityKind, AdHocObjective, TrainingSyllabusMission } from '../../../types/EventTypes';

interface EventActivitiesEditorProps {
  activities: EventActivity[];
  onChange: (activities: EventActivity[]) => void;
  /** Lesson source: the cycle's syllabus missions (pools/modules become selectable in a later phase) */
  syllabusMissions: TrainingSyllabusMission[];
}

const KIND_LABELS: Record<EventActivityKind, string> = {
  lesson: 'Syllabus Lesson',
  objectives: 'Ad-hoc Objectives',
  qualification: 'Qualification Pursuit'
};

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

/** Read-only DLO preview for a selected lesson (mirrors the legacy training step) */
const LessonObjectivesPreview: React.FC<{ syllabusMissionId: string }> = ({ syllabusMissionId }) => {
  const [objectives, setObjectives] = useState<Array<{
    id: string;
    objective_text: string;
    scope_level: string;
    display_order: number;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('syllabus_training_objectives')
        .select('id, objective_text, scope_level, display_order')
        .eq('syllabus_mission_id', syllabusMissionId)
        .order('display_order');
      if (!cancelled && !error && data) {
        setObjectives(data as any);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [syllabusMissionId]);

  if (objectives.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {objectives.map((objective) => (
        <div
          key={objective.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
          }}
        >
          <CheckSquare
            size={20}
            style={{ color: '#64748B', flexShrink: 0, marginTop: '2px' }}
          />
          <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: 0 }}>
            {objective.objective_text}
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * Reorderable list of event activities (developer-flagged feature).
 * Each activity is defined by what it references: a syllabus lesson, an ad-hoc
 * objective list, or a qualification pursuit. Array order is the display order
 * in the attendance section (and, later, Discord posts).
 * Modeled on SupportRoleRequirementsEditor.
 */
const EventActivitiesEditor: React.FC<EventActivitiesEditorProps> = ({
  activities,
  onChange,
  syllabusMissions
}) => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await getActiveQualifications();
      if (!cancelled) setQualifications(data || []);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const updateActivity = (index: number, updates: Partial<EventActivity>) => {
    const next = activities.map((activity, i) => (i === index ? { ...activity, ...updates } : activity));
    onChange(next);
  };

  const moveActivity = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= activities.length) return;
    const next = [...activities];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((a, i) => ({ ...a, displayOrder: i })));
  };

  const removeActivity = (index: number) => {
    onChange(activities.filter((_, i) => i !== index).map((a, i) => ({ ...a, displayOrder: i })));
  };

  const addActivity = () => {
    const kind: EventActivityKind = syllabusMissions.length > 0 ? 'lesson' : 'objectives';
    onChange([
      ...activities,
      {
        kind,
        displayOrder: activities.length,
        syllabusMissionId: undefined,
        adHocObjectives: kind === 'objectives' ? [] : undefined
      }
    ]);
  };

  const changeKind = (index: number, kind: EventActivityKind) => {
    // Reset kind-specific payload when switching
    updateActivity(index, {
      kind,
      syllabusMissionId: undefined,
      qualificationId: undefined,
      adHocObjectives: kind === 'objectives' ? (activities[index].adHocObjectives || []) : undefined
    });
  };

  const addAdHocObjective = (index: number) => {
    const current = activities[index].adHocObjectives || [];
    const objective: AdHocObjective = {
      id: crypto.randomUUID(),
      text: '',
      scope_level: 'Individual',
      display_order: current.length
    };
    updateActivity(index, { adHocObjectives: [...current, objective] });
  };

  const updateAdHocObjective = (activityIndex: number, objectiveIndex: number, updates: Partial<AdHocObjective>) => {
    const current = activities[activityIndex].adHocObjectives || [];
    const next = current.map((o, i) => (i === objectiveIndex ? { ...o, ...updates } : o));
    updateActivity(activityIndex, { adHocObjectives: next });
  };

  const removeAdHocObjective = (activityIndex: number, objectiveIndex: number) => {
    const current = activities[activityIndex].adHocObjectives || [];
    updateActivity(activityIndex, {
      adHocObjectives: current
        .filter((_, i) => i !== objectiveIndex)
        .map((o, i) => ({ ...o, display_order: i }))
    });
  };

  const arrowButtonStyle = (disabled: boolean): React.CSSProperties => ({
    width: '22px',
    height: '17px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    color: disabled ? '#D1D5DB' : '#64748B',
    cursor: disabled ? 'default' : 'pointer',
    padding: 0
  });

  return (
    <div>
      {activities.map((activity, index) => (
        <div
          key={activity.id || `new-${index}`}
          style={{
            marginBottom: '12px',
            padding: '12px',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF'
          }}
        >
          {/* Row header: reorder, kind, remove */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => moveActivity(index, -1)}
                disabled={index === 0}
                style={{ ...arrowButtonStyle(index === 0), borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
                title="Move up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => moveActivity(index, 1)}
                disabled={index === activities.length - 1}
                style={{ ...arrowButtonStyle(index === activities.length - 1), borderRadius: '0 0 4px 4px' }}
                title="Move down"
              >
                <ChevronDown size={12} />
              </button>
            </div>
            <select
              value={activity.kind}
              onChange={(e) => changeKind(index, e.target.value as EventActivityKind)}
              style={{ ...selectStyle, width: '200px', flex: 'none' }}
            >
              {(Object.keys(KIND_LABELS) as EventActivityKind[]).map(kind => (
                <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => removeActivity(index)}
              style={{
                padding: '8px 12px',
                border: 'none',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'Inter',
                fontWeight: 500
              }}
            >
              Remove
            </button>
          </div>

          {/* Kind-specific inputs */}
          {activity.kind === 'lesson' && (
            <div>
              <select
                value={activity.syllabusMissionId || ''}
                onChange={(e) => updateActivity(index, { syllabusMissionId: e.target.value || undefined })}
                style={selectStyle}
              >
                <option value="">Select a mission...</option>
                {syllabusMissions.map(mission => (
                  <option key={mission.id} value={mission.id}>
                    Mission {mission.mission_number}: {mission.mission_name}
                  </option>
                ))}
              </select>
              {syllabusMissions.length === 0 && (
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                  No syllabus missions available. Lessons come from the cycle's training syllabus.
                </p>
              )}
              {activity.syllabusMissionId && (
                <LessonObjectivesPreview syllabusMissionId={activity.syllabusMissionId} />
              )}
            </div>
          )}

          {activity.kind === 'objectives' && (
            <div>
              <input
                type="text"
                value={activity.label || ''}
                onChange={(e) => updateActivity(index, { label: e.target.value || undefined })}
                placeholder="Activity title (e.g. Cadre BFM Practice)"
                style={{ ...inputStyle, marginBottom: '8px' }}
              />
              {(activity.adHocObjectives || []).map((objective, objectiveIndex) => (
                <div key={objective.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <select
                    value={objective.scope_level}
                    onChange={(e) => updateAdHocObjective(index, objectiveIndex, { scope_level: e.target.value })}
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
                    onChange={(e) => updateAdHocObjective(index, objectiveIndex, { text: e.target.value })}
                    placeholder="Objective text"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => removeAdHocObjective(index, objectiveIndex)}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      backgroundColor: '#FEE2E2',
                      color: '#DC2626',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontFamily: 'Inter',
                      fontWeight: 500
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() => addAdHocObjective(index)}
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
            </div>
          )}

          {activity.kind === 'qualification' && (
            <div>
              <select
                value={activity.qualificationId || ''}
                onChange={(e) => updateActivity(index, { qualificationId: e.target.value || undefined })}
                style={selectStyle}
              >
                <option value="">Select a qualification...</option>
                {qualifications.map(qualification => (
                  <option key={qualification.id} value={qualification.id}>{qualification.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}

      {activities.length === 0 && (
        <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
          No activities. Add one to organize this event's roster by what attendees are doing (a syllabus lesson, separate cadre training, a qualification checkride, ...).
        </p>
      )}

      <button
        onClick={addActivity}
        style={{
          padding: '8px 16px',
          border: '1px solid #3B82F6',
          backgroundColor: '#EFF6FF',
          color: '#3B82F6',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontFamily: 'Inter',
          fontWeight: 500,
          marginTop: '8px'
        }}
      >
        + Add Activity
      </button>
    </div>
  );
};

export default EventActivitiesEditor;
