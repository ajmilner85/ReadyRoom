import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Info } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { getActiveQualifications, Qualification } from '../../../utils/qualificationService';
import SupportRoleRequirementsEditor from './SupportRoleRequirementsEditor';
import ReferenceMaterialsInput from './ReferenceMaterialsInput';
import CriteriaBlockEditor from '../../training/CriteriaBlockEditor';
import { CollapsibleSection } from './EventActivitiesEditor';
import type {
  CycleActivity,
  EventActivitySettings,
  AdHocObjective,
  ReferenceMaterial
} from '../../../types/EventTypes';

interface SyllabusOption {
  id: string;
  name: string;
  kind: string; // 'linear' | 'pool' | 'module' | 'advanced_qualification'
}

interface EnrollablePilot {
  pilot_id: string;
  callsign: string;
  board_number?: string | null;
  enrollment_id?: string;
}

/** Enrollment wiring passed down from CycleDialog for syllabus-kind activities */
export interface ActivityEnrollmentContext {
  /** The saved cycle_activities id; undefined until the cycle has been saved */
  activityId?: string;
  students: EnrollablePilot[];
  instructors: EnrollablePilot[];
  availableStudents: EnrollablePilot[];
  availableInstructors: EnrollablePilot[];
  onEnrollStudent: (pilotId: string) => void;
  onRemoveStudent: (enrollmentId: string) => void;
  onEnrollInstructor: (pilotId: string) => void;
  onRemoveInstructor: (enrollmentId: string) => void;
}

interface CycleActivityConfigPanelProps {
  activity: CycleActivity;
  onChange: (updates: Partial<CycleActivity>) => void;
  squadrons: Array<{ id: string; name: string; designation?: string; insignia_url?: string | null }>;
  enrollment?: ActivityEnrollmentContext;
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
 * Configuration panel for the cycle activity selected in the builder.
 * A cycle activity references a whole syllabus (events pick the specific lesson
 * for their week) or carries ad-hoc objectives, plus the same per-activity
 * settings as event activities: support roles, reference materials,
 * participant criteria, and the AAR opt-in.
 */
/** One enrollment list (students or instructors) inside an activity */
const ActivityEnrollmentSection: React.FC<{
  people: EnrollablePilot[];
  available: EnrollablePilot[];
  addLabel: string;
  onEnroll: (pilotId: string) => void;
  onRemove: (enrollmentId: string) => void;
}> = ({ people, available, addLabel, onEnroll, onRemove }) => (
  <div>
    {people.map(person => (
      <div key={person.pilot_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
        <span style={{ fontSize: '13px', color: '#646F7E', width: '46px', textAlign: 'center', fontFamily: 'Inter' }}>
          {person.board_number || ''}
        </span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
          {person.callsign}
        </span>
        <button
          type="button"
          onClick={() => person.enrollment_id && onRemove(person.enrollment_id)}
          style={{
            marginLeft: 'auto',
            padding: '4px',
            backgroundColor: 'transparent',
            color: '#9CA3AF',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; }}
          title="Remove"
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
    {people.length === 0 && (
      <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
        No one enrolled in this activity yet.
      </p>
    )}
    <select
      value=""
      onChange={(e) => { if (e.target.value) onEnroll(e.target.value); }}
      style={{ ...selectStyle, marginTop: '8px' }}
    >
      <option value="">{addLabel}</option>
      {available.map(person => (
        <option key={person.pilot_id} value={person.pilot_id}>
          {person.board_number ? `${person.board_number} ` : ''}{person.callsign}
        </option>
      ))}
    </select>
  </div>
);

const CycleActivityConfigPanel: React.FC<CycleActivityConfigPanelProps> = ({
  activity,
  onChange,
  squadrons,
  enrollment
}) => {
  const [syllabi, setSyllabi] = useState<SyllabusOption[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string }>>([]);
  const [inheritedRefs, setInheritedRefs] = useState<ReferenceMaterial[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAarTooltip, setShowAarTooltip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [syllabiResult, { data: quals }, standingsData, statusesData] = await Promise.all([
        (supabase as any).from('training_syllabi').select('id, name, kind').order('name'),
        getActiveQualifications(),
        supabase.from('standings').select('id, name').order('name'),
        supabase.from('statuses').select('id, name').order('name')
      ]);
      if (cancelled) return;
      setSyllabi(((syllabiResult.data as any[]) || []).map(s => ({ id: s.id, name: s.name, kind: s.kind || 'linear' })));
      setQualifications(quals || []);
      setStandings(standingsData.data || []);
      setStatuses(statusesData.data || []);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Inherited reference materials come from the selected syllabus
  useEffect(() => {
    if (!activity.syllabusId) {
      setInheritedRefs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('training_syllabi')
        .select('reference_materials')
        .eq('id', activity.syllabusId!)
        .single();
      if (!cancelled) {
        setInheritedRefs(Array.isArray((data as any)?.reference_materials) ? (data as any).reference_materials : []);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activity.syllabusId]);

  const settings = activity.settings || {};
  const updateSettings = (updates: Partial<EventActivitySettings>) => {
    onChange({ settings: { ...settings, ...updates } });
  };

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
      {/* Kind + source */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <select
          value={activity.kind === 'objectives' ? 'objectives' : (activity.syllabusId || '')}
          onChange={(e) => {
            if (e.target.value === 'objectives') {
              onChange({ kind: 'objectives', syllabusId: undefined, adHocObjectives: activity.adHocObjectives || [] });
            } else {
              onChange({ kind: 'syllabus', syllabusId: e.target.value || undefined });
            }
          }}
          style={selectStyle}
        >
          <option value="">Select a syllabus...</option>
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
        <input
          type="text"
          value={activity.label || ''}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
          placeholder={activity.kind === 'objectives' ? 'Activity title (e.g. Cadre Free Night)' : 'Display label (optional)'}
          style={{ ...inputStyle, width: '260px', flex: 'none' }}
        />
      </div>

      {/* Ad-hoc objectives editor */}
      {activity.kind === 'objectives' && (
        <CollapsibleSection
          title="Training Objectives"
          summary={`${adHocObjectives.length}`}
          expanded={expanded.has('objectives')}
          onToggle={() => toggle('objectives')}
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
              <button type="button"
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
          <button type="button"
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
      )}

      {/* Students / Instructors enrollment, per activity (syllabus kind only) */}
      {activity.kind === 'syllabus' && enrollment && (
        !enrollment.activityId ? (
          <p style={{ fontSize: '12px', color: '#94A3B8', margin: '8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
            Save the cycle, then reopen it to enroll students and instructors for this activity.
          </p>
        ) : (
          <>
            <CollapsibleSection
              title="Students"
              summary={`${enrollment.students.length}`}
              expanded={expanded.has('students')}
              onToggle={() => toggle('students')}
            >
              <ActivityEnrollmentSection
                people={enrollment.students}
                available={enrollment.availableStudents}
                addLabel="Add student..."
                onEnroll={enrollment.onEnrollStudent}
                onRemove={enrollment.onRemoveStudent}
              />
            </CollapsibleSection>
            <CollapsibleSection
              title="Instructors"
              summary={`${enrollment.instructors.length}`}
              expanded={expanded.has('instructors')}
              onToggle={() => toggle('instructors')}
            >
              <ActivityEnrollmentSection
                people={enrollment.instructors}
                available={enrollment.availableInstructors}
                addLabel="Add instructor..."
                onEnroll={enrollment.onEnrollInstructor}
                onRemove={enrollment.onRemoveInstructor}
              />
            </CollapsibleSection>
          </>
        )
      )}

      <CollapsibleSection
        title="Mission Support Roles"
        summary={`${(settings.supportRoleRequirements || []).length}`}
        expanded={expanded.has('support')}
        onToggle={() => toggle('support')}
      >
        <SupportRoleRequirementsEditor
          requirements={settings.supportRoleRequirements || []}
          onChange={(requirements) => updateSettings({ supportRoleRequirements: requirements })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Reference Materials"
        summary={`${inheritedRefs.length + (settings.referenceMaterials || []).length}`}
        expanded={expanded.has('references')}
        onToggle={() => toggle('references')}
      >
        <ReferenceMaterialsInput
          value={settings.referenceMaterials || []}
          onChange={(materials) => updateSettings({ referenceMaterials: materials })}
          inheritedMaterials={inheritedRefs}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Participants"
        summary={`${(settings.participantCriteria || []).length}`}
        expanded={expanded.has('participants')}
        onToggle={() => toggle('participants')}
      >
        <CriteriaBlockEditor
          blocks={(settings.participantCriteria || []) as any}
          onChange={(blocks) => updateSettings({ participantCriteria: blocks as any })}
          standings={standings}
          statuses={statuses}
          qualifications={qualifications}
          squadrons={squadrons}
          addBlockLabel="Add Participant Block"
          compact
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Debriefing"
        summary={settings.requiresAar ? 'AAR required' : ''}
        expanded={expanded.has('debriefing')}
        onToggle={() => toggle('debriefing')}
      >
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
                  from â€” and in addition to â€” training grades: DLOs are still
                  graded through the Pilot Training Records grid regardless of
                  this setting.
                </div>
              )}
            </div>
          </div>
          <div
            onClick={() => updateSettings({ requiresAar: !settings.requiresAar })}
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
  );
};

export default CycleActivityConfigPanel;
