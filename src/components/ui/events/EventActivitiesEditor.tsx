import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronRight, CheckSquare, Plus, BookOpen, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { getActiveQualifications, Qualification } from '../../../utils/qualificationService';
import SupportRoleRequirementsEditor from './SupportRoleRequirementsEditor';
import ReferenceMaterialsInput from './ReferenceMaterialsInput';
import CriteriaBlockEditor from '../../training/CriteriaBlockEditor';
import type {
  EventActivity,
  EventActivityKind,
  EventActivitySettings,
  AdHocObjective,
  TrainingSyllabusMission,
  ReferenceMaterial
} from '../../../types/EventTypes';

interface EventActivitiesEditorProps {
  activities: EventActivity[];
  onChange: (activities: EventActivity[]) => void;
  /** The cycle's syllabus missions - used to order the cycle's syllabus first in the lesson picker */
  syllabusMissions: TrainingSyllabusMission[];
  /** Squadrons for participant criteria (name should be the designation, id the squadron UUID) */
  squadrons: Array<{ id: string; name: string }>;
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#64748B',
  marginBottom: '6px',
  display: 'block'
};

interface LessonOption {
  id: string;
  label: string; // "Syllabus - Week N - Mission Name"
}

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
    <div style={{ marginTop: '12px' }}>
      <label style={sectionLabelStyle}>Training Objectives (DLOs)</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
    </div>
  );
};

/**
 * Compact per-activity reference materials: a button showing the count that
 * opens a popup editor (PTR-grid-style popup, click-outside to close).
 * Inherited materials come from the lesson's mission + syllabus.
 */
const ActivityReferenceMaterials: React.FC<{
  materials: ReferenceMaterial[];
  onChange: (materials: ReferenceMaterial[]) => void;
  syllabusMissionId?: string;
}> = ({ materials, onChange, syllabusMissionId }) => {
  const [open, setOpen] = useState(false);
  const [inherited, setInherited] = useState<ReferenceMaterial[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Load inherited references (mission + syllabus) for lesson activities
  useEffect(() => {
    if (!open || !syllabusMissionId) {
      setInherited([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('training_syllabus_missions')
        .select('reference_materials, training_syllabi(reference_materials)')
        .eq('id', syllabusMissionId)
        .single();

      if (!cancelled && !error && data) {
        const syllabusRefs = (data.training_syllabi as any)?.reference_materials || [];
        const missionRefs = Array.isArray(data.reference_materials) ? data.reference_materials : [];
        const merged = [...syllabusRefs, ...missionRefs];
        const unique = merged.filter((ref, index, self) =>
          index === self.findIndex((r) => r.url === ref.url)
        );
        setInherited(unique);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, syllabusMissionId]);

  const count = materials.length;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          padding: '6px 12px',
          border: '1px solid #CBD5E1',
          backgroundColor: open ? '#EFF6FF' : '#F8FAFC',
          color: '#64748B',
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
        <BookOpen size={14} />
        Reference Materials ({count})
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            width: '440px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '12px',
            zIndex: 1003,
            maxHeight: '360px',
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ReferenceMaterialsInput
            value={materials}
            onChange={onChange}
            inheritedMaterials={inherited}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Reorderable list of event activities (developer-flagged feature).
 * Each activity is defined by what it references (a syllabus lesson, an ad-hoc
 * objective list, or a qualification pursuit) and carries its own support role
 * requirements, reference materials, and participant eligibility criteria.
 * Array order is the display order in the attendance section and Discord post.
 */
const EventActivitiesEditor: React.FC<EventActivitiesEditorProps> = ({
  activities,
  onChange,
  syllabusMissions,
  squadrons
}) => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string }>>([]);
  const [lessonOptions, setLessonOptions] = useState<LessonOption[]>([]);
  const [expandedParticipants, setExpandedParticipants] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: quals }, standingsData, statusesData] = await Promise.all([
        getActiveQualifications(),
        supabase.from('standings').select('id, name').order('name'),
        supabase.from('statuses').select('id, name').order('name')
      ]);
      if (cancelled) return;
      setQualifications(quals || []);
      setStandings(standingsData.data || []);
      setStatuses(statusesData.data || []);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Lessons can come from any syllabus: the cycle's syllabus first, then other
  // linear syllabi, pools, and modules. Option labels carry the full context
  // ("Syllabus - Week N - Mission") so the selection reads correctly when closed.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [syllabiResult, missionsResult] = await Promise.all([
        (supabase as any).from('training_syllabi').select('id, name, kind').order('name'),
        (supabase as any).from('training_syllabus_missions').select('id, syllabus_id, mission_number, mission_name, week_number').order('mission_number')
      ]);
      if (cancelled || !syllabiResult.data || !missionsResult.data) return;

      const cycleSyllabusId = syllabusMissions[0]?.syllabus_id;
      const kindOrder: Record<string, number> = { linear: 0, pool: 1, module: 2 };
      const orderedSyllabi = (syllabiResult.data as any[])
        .sort((a, b) => {
          if (a.id === cycleSyllabusId) return -1;
          if (b.id === cycleSyllabusId) return 1;
          const kindDiff = (kindOrder[a.kind || 'linear'] ?? 9) - (kindOrder[b.kind || 'linear'] ?? 9);
          return kindDiff !== 0 ? kindDiff : a.name.localeCompare(b.name);
        });

      const options: LessonOption[] = [];
      orderedSyllabi.forEach(syllabus => {
        (missionsResult.data as any[])
          .filter(m => m.syllabus_id === syllabus.id)
          .forEach(mission => {
            const weekPart = mission.week_number != null ? `Week ${mission.week_number} - ` : '';
            options.push({
              id: mission.id,
              label: `${syllabus.name} - ${weekPart}${mission.mission_name}`
            });
          });
      });
      if (!cancelled) setLessonOptions(options);
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syllabusMissions.length]);

  const updateActivity = (index: number, updates: Partial<EventActivity>) => {
    const next = activities.map((activity, i) => (i === index ? { ...activity, ...updates } : activity));
    onChange(next);
  };

  const updateActivitySettings = (index: number, updates: Partial<EventActivitySettings>) => {
    updateActivity(index, { settings: { ...(activities[index].settings || {}), ...updates } });
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
    const kind: EventActivityKind = (syllabusMissions.length > 0 || lessonOptions.length > 0) ? 'lesson' : 'objectives';
    onChange([
      ...activities,
      {
        kind,
        displayOrder: activities.length,
        syllabusMissionId: undefined,
        adHocObjectives: kind === 'objectives' ? [] : undefined,
        settings: {}
      }
    ]);
  };

  const changeKind = (index: number, kind: EventActivityKind) => {
    // Reset kind-specific payload when switching; per-activity settings persist
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

  const toggleParticipants = (index: number) => {
    setExpandedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
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
          marginBottom: '12px'
        }}
      >
        + Add Activity
      </button>

      {activities.length === 0 && (
        <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
          No activities. Add one to organize this event's roster by what attendees are doing (a syllabus lesson, separate cadre training, a qualification checkride, ...).
        </p>
      )}

      {activities.map((activity, index) => {
        const settings = activity.settings || {};
        const participantBlocks = settings.participantCriteria || [];
        const participantsExpanded = expandedParticipants.has(index);

        return (
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
                  <option value="">Select a lesson...</option>
                  {lessonOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                {lessonOptions.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                    No lessons available. Lessons come from training syllabi, lesson pools, and modules (Training page).
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

            {/* Per-activity Mission Support roles */}
            <div style={{ marginTop: '12px' }}>
              <label style={sectionLabelStyle}>Mission Support roles</label>
              <SupportRoleRequirementsEditor
                requirements={settings.supportRoleRequirements || []}
                onChange={(requirements) => updateActivitySettings(index, { supportRoleRequirements: requirements })}
              />
            </div>

            {/* Per-activity Reference Materials (popup) + Participants toggle */}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ActivityReferenceMaterials
                materials={settings.referenceMaterials || []}
                onChange={(materials) => updateActivitySettings(index, { referenceMaterials: materials })}
                syllabusMissionId={activity.kind === 'lesson' ? activity.syllabusMissionId : undefined}
              />
              <button
                onClick={() => toggleParticipants(index)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: participantsExpanded ? '#EFF6FF' : '#F8FAFC',
                  color: '#64748B',
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
                <Users size={14} />
                Participants ({participantBlocks.length} {participantBlocks.length === 1 ? 'rule' : 'rules'})
                <ChevronRight
                  size={14}
                  style={{ transform: participantsExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                />
              </button>
            </div>

            {/* Per-activity participant eligibility criteria */}
            {participantsExpanded && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                <CriteriaBlockEditor
                  blocks={participantBlocks as any}
                  onChange={(blocks) => updateActivitySettings(index, { participantCriteria: blocks as any })}
                  standings={standings}
                  statuses={statuses}
                  qualifications={qualifications}
                  squadrons={squadrons}
                  title="Participants"
                  description="Who this activity is for. Criteria within a block use AND logic; blocks use OR logic (e.g. FRS AND Provisional, OR operational squadrons AND Instructor Pilot)."
                  blockLabel="Participant Block"
                  addBlockLabel="Add Participant Block"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EventActivitiesEditor;
