import React, { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronRight, CheckSquare, Plus, X, Trash2, Info } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { getActiveQualifications, Qualification } from '../../../utils/qualificationService';
import SupportRoleRequirementsEditor from './SupportRoleRequirementsEditor';
import ReferenceMaterialsInput from './ReferenceMaterialsInput';
import ParticipantBlocksEditor from './ParticipantBlocksEditor';
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
  /** Squadrons for participant criteria (id = squadron UUID; designation/insignia for display) */
  squadrons: Array<{ id: string; name: string; designation?: string; insignia_url?: string | null }>;
}

/**
 * UI-level activity types. The first three all persist as DB kind 'lesson'
 * (an activity is defined by what it references); which one shows on reload is
 * derived from the selected lesson's source syllabus kind:
 *  - syllabus   -> lesson from a linear syllabus (or module)
 *  - standalone -> lesson from a lesson pool
 *  - advanced   -> lesson from an advanced-qualification syllabus
 *  - other      -> 'objectives' (ad-hoc objective list)
 */
type ActivityUiKind = 'syllabus' | 'standalone' | 'advanced' | 'other';

const UI_KIND_LABELS: Record<ActivityUiKind, string> = {
  syllabus: 'Training Syllabus Mission',
  standalone: 'Standalone Training Event',
  advanced: 'Advanced Qualifications',
  other: 'Other Training Exercise'
};

interface LessonSourceMission {
  id: string;
  mission_name: string;
  week_number: number | null;
}

interface LessonSource {
  syllabusId: string;
  syllabusName: string;
  kind: string; // 'linear' | 'pool' | 'module'
  missions: LessonSourceMission[];
}

interface SyllabusObjective {
  id: string;
  objective_text: string;
  scope_level: string;
  display_order: number;
}

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

const lessonShortLabel = (mission: LessonSourceMission) =>
  mission.week_number != null ? `Week ${mission.week_number} - ${mission.mission_name}` : mission.mission_name;

const lessonFullLabel = (source: LessonSource, mission: LessonSourceMission) =>
  `${source.syllabusName} - ${lessonShortLabel(mission)}`;

/**
 * Lesson picker: grouped by syllabus in the open list (short labels), but the
 * closed control shows the full "Syllabus - Week N - Mission" context via a
 * hidden option that shares the selected value and wins the display match.
 */
const LessonSelect: React.FC<{
  value?: string;
  onChange: (missionId: string | undefined) => void;
  sources: LessonSource[];
  placeholder?: string;
}> = ({ value, onChange, sources, placeholder = 'Select a lesson...' }) => {
  let selectedFullLabel: string | null = null;
  for (const source of sources) {
    const mission = source.missions.find(m => m.id === value);
    if (mission) {
      selectedFullLabel = lessonFullLabel(source, mission);
      break;
    }
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={selectStyle}
    >
      <option value="">{placeholder}</option>
      {value && selectedFullLabel && (
        <option value={value} hidden>{selectedFullLabel}</option>
      )}
      {sources.map(source => (
        <optgroup
          key={source.syllabusId}
          label={source.kind === 'linear' ? source.syllabusName : `${source.syllabusName} (${source.kind})`}
        >
          {source.missions.map(mission => (
            <option key={mission.id} value={mission.id}>{lessonShortLabel(mission)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

/** Uniform collapsible section used for the per-activity config groups
    (shared with the cycle activity config panel) */
export const CollapsibleSection: React.FC<{
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, summary, expanded, onToggle, children }) => (
  <div style={{ border: '1px solid #E5E7EB', borderRadius: '6px', marginTop: '8px', backgroundColor: '#FFFFFF' }}>
    <button type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: '#374151',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'left'
      }}
    >
      <ChevronRight
        size={14}
        style={{ color: '#94A3B8', flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
      />
      <span>{title}</span>
      {summary && (
        <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 400, color: '#94A3B8' }}>{summary}</span>
      )}
    </button>
    {expanded && (
      <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
        {children}
      </div>
    )}
  </div>
);

const EventActivitiesEditor: React.FC<EventActivitiesEditorProps> = ({
  activities,
  onChange,
  syllabusMissions,
  squadrons
}) => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string }>>([]);
  const [lessonSources, setLessonSources] = useState<LessonSource[]>([]);
  // UI kind chosen before a lesson is picked (both 'syllabus' and 'standalone'
  // persist as DB kind 'lesson'; the source syllabus disambiguates after selection)
  const [uiKindOverrides, setUiKindOverrides] = useState<Record<string, ActivityUiKind>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

  // Load all lesson sources (cycle's syllabus first, then linear, pools, modules)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [syllabiResult, missionsResult] = await Promise.all([
        (supabase as any).from('training_syllabi').select('id, name, kind').order('name'),
        (supabase as any).from('training_syllabus_missions').select('id, syllabus_id, mission_name, week_number').order('week_number')
      ]);
      if (cancelled || !syllabiResult.data || !missionsResult.data) return;

      const cycleSyllabusId = syllabusMissions[0]?.syllabus_id;
      const kindOrder: Record<string, number> = { linear: 0, pool: 1, advanced_qualification: 2, module: 3 };
      const sources: LessonSource[] = (syllabiResult.data as any[])
        .map(s => ({
          syllabusId: s.id,
          syllabusName: s.name,
          kind: s.kind || 'linear',
          missions: (missionsResult.data as any[])
            .filter(m => m.syllabus_id === s.id)
            .map(m => ({ id: m.id, mission_name: m.mission_name, week_number: m.week_number }))
        }))
        .filter(s => s.missions.length > 0)
        .sort((a, b) => {
          if (a.syllabusId === cycleSyllabusId) return -1;
          if (b.syllabusId === cycleSyllabusId) return 1;
          const kindDiff = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
          return kindDiff !== 0 ? kindDiff : a.syllabusName.localeCompare(b.syllabusName);
        });
      if (!cancelled) setLessonSources(sources);
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syllabusMissions.length]);

  const activityKey = (activity: EventActivity, index: number) => activity.id || `new-${index}`;

  const missionSourceKind = (missionId?: string): string | undefined => {
    if (!missionId) return undefined;
    return lessonSources.find(s => s.missions.some(m => m.id === missionId))?.kind;
  };

  // Derive the UI kind: explicit user choice wins, then the selected lesson's
  // source syllabus kind, then the DB kind's natural mapping
  const deriveUiKind = (activity: EventActivity, index: number): ActivityUiKind => {
    const override = uiKindOverrides[activityKey(activity, index)];
    if (override) return override;
    if (activity.kind === 'objectives') return 'other';
    if (activity.kind === 'qualification') return 'advanced'; // legacy rows from before adv-qual syllabi
    const sourceKind = missionSourceKind(activity.syllabusMissionId);
    if (sourceKind === 'pool') return 'standalone';
    if (sourceKind === 'advanced_qualification') return 'advanced';
    return 'syllabus';
  };

  const sourcesForUiKind = (uiKind: ActivityUiKind): LessonSource[] => {
    if (uiKind === 'syllabus') return lessonSources.filter(s => s.kind === 'linear' || s.kind === 'module');
    if (uiKind === 'standalone') return lessonSources.filter(s => s.kind === 'pool');
    if (uiKind === 'advanced') return lessonSources.filter(s => s.kind === 'advanced_qualification');
    return [];
  };

  const updateActivity = (index: number, updates: Partial<EventActivity>) => {
    onChange(activities.map((activity, i) => (i === index ? { ...activity, ...updates } : activity)));
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
    onChange([
      ...activities,
      { kind: 'lesson', displayOrder: activities.length, settings: {} }
    ]);
  };

  const changeUiKind = (index: number, uiKind: ActivityUiKind) => {
    const dbKind: EventActivityKind = uiKind === 'other' ? 'objectives' : 'lesson';
    setUiKindOverrides(prev => ({ ...prev, [activityKey(activities[index], index)]: uiKind }));
    // Reset kind-specific payload when switching; per-activity settings persist
    updateActivity(index, {
      kind: dbKind,
      syllabusMissionId: undefined,
      qualificationId: undefined,
      adHocObjectives: dbKind === 'objectives' ? (activities[index].adHocObjectives || []) : undefined
    });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
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
    updateActivity(activityIndex, {
      adHocObjectives: current.map((o, i) => (i === objectiveIndex ? { ...o, ...updates } : o))
    });
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
      <button type="button"
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
          No activities. Add one to organize this event's roster by what attendees are doing (a syllabus mission, standalone training, an advanced qualification, ...).
        </p>
      )}

      {activities.map((activity, index) => (
        <ActivityCard
          key={activityKey(activity, index)}
          activity={activity}
          index={index}
          total={activities.length}
          uiKind={deriveUiKind(activity, index)}
          sources={sourcesForUiKind(deriveUiKind(activity, index))}
          qualifications={qualifications}
          standings={standings}
          statuses={statuses}
          squadrons={squadrons}
          sectionKeyPrefix={activityKey(activity, index)}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          onChangeUiKind={(uiKind) => changeUiKind(index, uiKind)}
          onUpdate={(updates) => updateActivity(index, updates)}
          onUpdateSettings={(updates) => updateActivitySettings(index, updates)}
          onMove={(direction) => moveActivity(index, direction)}
          onRemove={() => removeActivity(index)}
          onAddObjective={() => addAdHocObjective(index)}
          onUpdateObjective={(objectiveIndex, updates) => updateAdHocObjective(index, objectiveIndex, updates)}
          onRemoveObjective={(objectiveIndex) => removeAdHocObjective(index, objectiveIndex)}
          arrowButtonStyle={arrowButtonStyle}
        />
      ))}
    </div>
  );
};

const ActivityCard: React.FC<{
  activity: EventActivity;
  index: number;
  total: number;
  uiKind: ActivityUiKind;
  sources: LessonSource[];
  qualifications: Qualification[];
  standings: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string }>;
  squadrons: Array<{ id: string; name: string; designation?: string; insignia_url?: string | null }>;
  sectionKeyPrefix: string;
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
  onChangeUiKind: (uiKind: ActivityUiKind) => void;
  onUpdate: (updates: Partial<EventActivity>) => void;
  onUpdateSettings: (updates: Partial<EventActivitySettings>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddObjective: () => void;
  onUpdateObjective: (objectiveIndex: number, updates: Partial<AdHocObjective>) => void;
  onRemoveObjective: (objectiveIndex: number) => void;
  arrowButtonStyle: (disabled: boolean) => React.CSSProperties;
}> = ({
  activity,
  index,
  total,
  uiKind,
  sources,
  qualifications,
  standings,
  statuses,
  squadrons,
  sectionKeyPrefix,
  expandedSections,
  onToggleSection,
  onChangeUiKind,
  onUpdate,
  onUpdateSettings,
  onMove,
  onRemove,
  onAddObjective,
  onUpdateObjective,
  onRemoveObjective,
  arrowButtonStyle
}) => {
  const settings = activity.settings || {};
  const [syllabusObjectives, setSyllabusObjectives] = useState<SyllabusObjective[]>([]);
  const [inheritedRefs, setInheritedRefs] = useState<ReferenceMaterial[]>([]);
  const [showAarTooltip, setShowAarTooltip] = useState(false);

  // Load the selected lesson's DLOs and inherited reference materials
  // (mission + syllabus) whenever the lesson changes
  useEffect(() => {
    if (!activity.syllabusMissionId) {
      setSyllabusObjectives([]);
      setInheritedRefs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [objectivesResult, missionResult] = await Promise.all([
        supabase
          .from('syllabus_training_objectives')
          .select('id, objective_text, scope_level, display_order')
          .eq('syllabus_mission_id', activity.syllabusMissionId!)
          .order('display_order'),
        supabase
          .from('training_syllabus_missions')
          .select('reference_materials, training_syllabi(reference_materials)')
          .eq('id', activity.syllabusMissionId!)
          .single()
      ]);
      if (cancelled) return;

      setSyllabusObjectives((objectivesResult.data as any) || []);

      const missionData = missionResult.data as any;
      if (missionData) {
        const syllabusRefs = missionData.training_syllabi?.reference_materials || [];
        const missionRefs = Array.isArray(missionData.reference_materials) ? missionData.reference_materials : [];
        const merged = [...syllabusRefs, ...missionRefs];
        setInheritedRefs(merged.filter((ref: ReferenceMaterial, i: number, self: ReferenceMaterial[]) =>
          i === self.findIndex(r => r.url === ref.url)
        ));
      } else {
        setInheritedRefs([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activity.syllabusMissionId]);

  const sectionKey = (section: string) => `${sectionKeyPrefix}:${section}`;
  const isExpanded = (section: string) => expandedSections.has(sectionKey(section));

  const usesLessonPicker = uiKind === 'syllabus' || uiKind === 'standalone' || uiKind === 'advanced';
  const localRefs = settings.referenceMaterials || [];
  const supportRoles = settings.supportRoleRequirements || [];
  const participantBlocks = settings.participantCriteria || [];
  const adHocObjectives = activity.adHocObjectives || [];

  const objectivesSummary = uiKind === 'other'
    ? `${adHocObjectives.length}`
    : `${syllabusObjectives.length}`;

  return (
    <div
      style={{
        marginBottom: '16px',
        border: '1px solid #CBD5E1',
        borderRadius: '8px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        overflow: 'visible'
      }}
    >
      {/* Distinct numbered header strip */}
      <div style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '10px 12px',
        backgroundColor: '#F1F5F9',
        borderBottom: '1px solid #E2E8F0',
        borderRadius: '8px 8px 0 0'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            style={{ ...arrowButtonStyle(index === 0), borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
            title="Move up"
          >
            <ChevronUp size={12} />
          </button>
          <button type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            style={{ ...arrowButtonStyle(index === total - 1), borderRadius: '0 0 4px 4px' }}
            title="Move down"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: '#64748B',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 600,
          flexShrink: 0,
          fontFamily: 'Inter'
        }}>
          {index + 1}
        </div>
        <select
          value={uiKind}
          onChange={(e) => onChangeUiKind(e.target.value as ActivityUiKind)}
          style={{ ...selectStyle, width: '240px', flex: 'none' }}
        >
          {(Object.keys(UI_KIND_LABELS) as ActivityUiKind[]).map(kind => (
            <option key={kind} value={kind}>{UI_KIND_LABELS[kind]}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button type="button"
          onClick={onRemove}
          title="Remove activity"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} color="#64748B" />
        </button>
      </div>

      {/* Body: kind-specific pickers */}
      <div style={{ padding: '12px' }}>
        {usesLessonPicker && (
          <div>
            <LessonSelect
              value={activity.syllabusMissionId}
              onChange={(missionId) => onUpdate({ syllabusMissionId: missionId })}
              sources={sources}
            />
            {sources.length === 0 && (
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                {uiKind === 'standalone'
                  ? 'No lesson pools exist yet. Create one on the Training page (Syllabus Management > Type: Lesson Pool).'
                  : uiKind === 'advanced'
                    ? 'No Advanced Qualification syllabi exist yet. Create one on the Training page (Syllabus Management > Type: Advanced Qualification).'
                    : 'No lessons available. Lessons come from training syllabi on the Training page.'}
              </p>
            )}
          </div>
        )}

        {uiKind === 'other' && (
          <input
            type="text"
            value={activity.label || ''}
            onChange={(e) => onUpdate({ label: e.target.value || undefined })}
            placeholder="Activity title (e.g. Cadre BFM Practice)"
            style={inputStyle}
          />
        )}

        {/* Four uniform collapsible config sections */}
        <CollapsibleSection
          title="Training Objectives"
          summary={objectivesSummary}
          expanded={isExpanded('objectives')}
          onToggle={() => onToggleSection(sectionKey('objectives'))}
        >
          {uiKind === 'other' ? (
            <div>
              {adHocObjectives.map((objective, objectiveIndex) => (
                <div key={objective.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <select
                    value={objective.scope_level}
                    onChange={(e) => onUpdateObjective(objectiveIndex, { scope_level: e.target.value })}
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
                    onChange={(e) => onUpdateObjective(objectiveIndex, { text: e.target.value })}
                    placeholder="Objective text"
                    style={inputStyle}
                  />
                  <button type="button"
                    onClick={() => onRemoveObjective(objectiveIndex)}
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
              <button type="button"
                onClick={onAddObjective}
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
          ) : syllabusObjectives.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {syllabusObjectives.map((objective) => (
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
          ) : (
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0, fontFamily: 'Inter', fontStyle: 'italic' }}>
              {activity.syllabusMissionId ? 'The selected lesson has no training objectives.' : 'Select a lesson to see its training objectives.'}
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Mission Support Roles"
          summary={`${supportRoles.length}`}
          expanded={isExpanded('support')}
          onToggle={() => onToggleSection(sectionKey('support'))}
        >
          <SupportRoleRequirementsEditor
            requirements={supportRoles}
            onChange={(requirements) => onUpdateSettings({ supportRoleRequirements: requirements })}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Reference Materials"
          summary={`${inheritedRefs.length + localRefs.length}`}
          expanded={isExpanded('references')}
          onToggle={() => onToggleSection(sectionKey('references'))}
        >
          <ReferenceMaterialsInput
            value={localRefs}
            onChange={(materials) => onUpdateSettings({ referenceMaterials: materials })}
            inheritedMaterials={inheritedRefs}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Participants"
          summary={`${participantBlocks.length}`}
          expanded={isExpanded('participants')}
          onToggle={() => onToggleSection(sectionKey('participants'))}
        >
          <ParticipantBlocksEditor
            blocks={participantBlocks}
            onChange={(blocks) => onUpdateSettings({ participantCriteria: blocks })}
            standings={standings}
            statuses={statuses}
            qualifications={qualifications}
            squadrons={squadrons}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Debriefing"
          summary={settings.requiresAar ? 'AAR required' : ''}
          expanded={isExpanded('debriefing')}
          onToggle={() => onToggleSection(sectionKey('debriefing'))}
        >
          {/* AAR opt-in: training needs no AAR, so this defaults off. Flights
              from this activity's participating squadrons appear in the AAR
              section of the Mission Debriefing page */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', fontFamily: 'Inter' }}>
                Require After Action Reports
              </label>
              <div
                style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
                onMouseEnter={() => setShowAarTooltip(true)}
                onMouseLeave={() => setShowAarTooltip(false)}
              >
                <Info size={14} style={{ color: '#94A3B8', cursor: 'help' }} />
                {showAarTooltip && (
                  <div style={{
                    position: 'absolute',
                    left: '22px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: '#1E293B',
                    color: 'white',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    width: '280px',
                    zIndex: 1003,
                    pointerEvents: 'none'
                  }}>
                    After Action Reports capture mission outcomes (kills, losses,
                    narrative) on the Mission Debriefing page. They are separate
                    from — and in addition to — training grades: DLOs are still
                    graded through the Pilot Training Records grid regardless of
                    this setting.
                  </div>
                )}
              </div>
            </div>
            <div
              onClick={() => onUpdateSettings({ requiresAar: !settings.requiresAar })}
              style={{
                width: '44px',
                height: '24px',
                backgroundColor: settings.requiresAar ? '#3B82F6' : '#E5E7EB',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                flexShrink: 0
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: settings.requiresAar ? '22px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default EventActivitiesEditor;
