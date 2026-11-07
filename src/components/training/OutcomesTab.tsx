// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { IconButton, SegmentedControl, Select, Toggle } from '../ui/primitives';
import type { GraduationOutcome, GraduationOutcomeType, GraduationEffectiveDate, GraduationQualEntry } from '../../types/TrainingTypes';
import QualificationBadge from '../ui/QualificationBadge';

interface OutcomesTabProps {
  outcomes: GraduationOutcome[];
  onChange: (outcomes: GraduationOutcome[]) => void;
  maxWeekNumber: number;
}

const OUTCOME_TYPES: { type: GraduationOutcomeType; label: string }[] = [
  { type: 'callsign', label: 'Callsign' },
  { type: 'standing', label: 'Standing' },
  { type: 'squadron_assignment', label: 'Squadron Assignment' },
  { type: 'qualifications', label: 'Qualifications' },
];

const DEFAULT_OUTCOMES: GraduationOutcome[] = OUTCOME_TYPES.map(ot => ({
  type: ot.type,
  enabled: false,
  required: false,
  effectiveDate: { mode: 'graduation' as const },
  defaultValue: ot.type === 'qualifications' ? [] : null,
}));

function mergeWithDefaults(saved: GraduationOutcome[]): GraduationOutcome[] {
  return DEFAULT_OUTCOMES.map(def => {
    const existing = saved.find(s => s.type === def.type);
    return existing || def;
  });
}

interface QualOption {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
}

/** Effective date: on graduation, or a syllabus week */
const EffectiveDateControl: React.FC<{
  effectiveDate: GraduationEffectiveDate;
  weekOptions: number[];
  onChange: (ed: GraduationEffectiveDate) => void;
}> = ({ effectiveDate, weekOptions, onChange }) => (
  <div className="flex items-center gap-2">
    <SegmentedControl
      size="sm"
      value={effectiveDate.mode}
      onChange={(m) => onChange(m === 'graduation' ? { mode: 'graduation' } : { mode: 'week', weekNumber: effectiveDate.weekNumber ?? 1 })}
      options={[{ value: 'graduation', label: 'GRADUATION' }, { value: 'week', label: 'WEEK' }]}
    />
    {effectiveDate.mode === 'week' ? (
      <div className="w-[110px]">
        <Select<number>
          size="sm"
          value={effectiveDate.weekNumber ?? 1}
          onChange={(w) => onChange({ mode: 'week', weekNumber: w })}
          options={weekOptions.map(w => ({ value: w, label: `Week ${w}` }))}
        />
      </div>
    ) : null}
  </div>
);

const OUTCOME_HINT: Record<GraduationOutcomeType, string> = {
  callsign: 'Confirm or change the student\'s callsign at graduation.',
  standing: 'Move the student to a new standing (e.g. from Student to Pilot).',
  squadron_assignment: 'Assign the graduate to a squadron.',
  qualifications: 'Qualifications awarded on graduation, each with its own effective date.',
};

const OutcomesTab: React.FC<OutcomesTabProps> = ({ outcomes, onChange, maxWeekNumber }) => {
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [qualOptions, setQualOptions] = useState<QualOption[]>([]);
  const [loading, setLoading] = useState(true);

  const merged = mergeWithDefaults(outcomes);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const [standingsRes, qualsRes] = await Promise.all([
        supabase.from('standings').select('id, name').order('order'),
        supabase.from('qualifications').select('id, name, code, color').eq('active', true).order('name'),
      ]);
      if (standingsRes.data) setStandings(standingsRes.data);
      if (qualsRes.data) setQualOptions(qualsRes.data);
    } catch (err) {
      console.error('Error loading outcome options:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOutcome = (type: GraduationOutcomeType, patch: Partial<GraduationOutcome>) => {
    const updated = merged.map(o => o.type === type ? { ...o, ...patch } : o);
    onChange(updated);
  };

  const toggleEnabled = (type: GraduationOutcomeType) => {
    const current = merged.find(o => o.type === type)!;
    updateOutcome(type, { enabled: !current.enabled });
  };

  const setEffectiveDate = (type: GraduationOutcomeType, ed: GraduationEffectiveDate) => {
    updateOutcome(type, { effectiveDate: ed });
  };

  const setDefaultValue = (type: GraduationOutcomeType, value: any) => {
    updateOutcome(type, { defaultValue: value });
  };

  const weekOptions: number[] = [];
  for (let i = 0; i <= maxWeekNumber; i++) {
    weekOptions.push(i);
  }

  // Qual entry helpers
  const getQualEntries = (outcome: GraduationOutcome): GraduationQualEntry[] => {
    if (!Array.isArray(outcome.defaultValue)) return [];
    return (outcome.defaultValue as any[]).filter(item => typeof item === 'object' && item !== null && 'id' in item);
  };

  const addQualEntry = (outcomeType: GraduationOutcomeType, qualId: string) => {
    const outcome = merged.find(o => o.type === outcomeType)!;
    const entries = getQualEntries(outcome);
    if (entries.find(e => e.id === qualId)) return;
    const newEntry: GraduationQualEntry = { id: qualId, effectiveDate: { mode: 'graduation' } };
    setDefaultValue(outcomeType, [...entries, newEntry]);
  };

  const removeQualEntry = (outcomeType: GraduationOutcomeType, qualId: string) => {
    const outcome = merged.find(o => o.type === outcomeType)!;
    const entries = getQualEntries(outcome);
    setDefaultValue(outcomeType, entries.filter(e => e.id !== qualId));
  };

  const updateQualEntryDate = (outcomeType: GraduationOutcomeType, qualId: string, ed: GraduationEffectiveDate) => {
    const outcome = merged.find(o => o.type === outcomeType)!;
    const entries = getQualEntries(outcome);
    setDefaultValue(outcomeType, entries.map(e => e.id === qualId ? { ...e, effectiveDate: ed } : e));
  };

  if (loading) {
    return <div className="py-6 text-center text-[12.5px] text-text2">Loading options…</div>;
  }

  const field = (label: string, control: React.ReactNode) => (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="rr-label w-[110px] flex-none">{label}</span>
      {control}
    </div>
  );

  return (
    <div className="flex flex-col gap-[14px]">
      <div>
        <div className="rr-pane-title">Graduation outcomes</div>
        <p className="m-0 mt-1 text-[12.5px] text-text2 leading-[1.5] max-w-[75ch]">
          What changes for a student when they graduate. Enabled outcomes appear in the graduation dialog with their defaults pre-filled; required ones must be completed before graduation can be confirmed.
        </p>
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
        {OUTCOME_TYPES.map(({ type, label }) => {
          const outcome = merged.find(o => o.type === type)!;
          const qualEntries = type === 'qualifications' ? getQualEntries(outcome) : [];
          const availableQuals = qualOptions.filter(q => !qualEntries.find(e => e.id === q.id));
          const on = Boolean(outcome.enabled);
          return (
            <section
              key={type}
              className={`rounded-rr-lg border flex flex-col transition-colors ${on ? 'border-accent bg-panel' : 'border-border bg-panel2'}`}
              style={type === 'qualifications' ? { gridColumn: '1 / -1' } : undefined}
            >
              <div className="flex items-start gap-3 px-[14px] py-[12px]">
                <div className="pt-[1px]"><Toggle checked={on} onChange={() => toggleEnabled(type)} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-text">{label}</div>
                  <div className="text-[12px] text-text2 leading-[1.4]">{OUTCOME_HINT[type]}</div>
                </div>
                {on ? (
                  <label className="flex items-center gap-2 text-[12px] text-text2 flex-none cursor-pointer">
                    Required
                    <Toggle size="sm" checked={Boolean(outcome.required)} onChange={() => updateOutcome(type, { required: !outcome.required })} />
                  </label>
                ) : null}
              </div>

              {on ? (
                <div className="flex flex-col gap-[12px] px-[14px] pb-[14px] pt-[12px] border-t border-border">
                  {type !== 'qualifications'
                    ? field('Effective', <EffectiveDateControl effectiveDate={outcome.effectiveDate} weekOptions={weekOptions} onChange={(ed) => setEffectiveDate(type, ed)} />)
                    : null}

                  {type === 'standing'
                    ? field('Default', (
                        <div className="w-[260px] max-w-full">
                          <Select
                            size="sm"
                            value={(outcome.defaultValue as string) || ''}
                            onChange={(v) => setDefaultValue(type, v || null)}
                            options={[{ value: '', label: 'No default (pick at graduation)' }, ...standings.map(st => ({ value: st.id, label: st.name }))]}
                          />
                        </div>
                      ))
                    : null}

                  {type === 'qualifications' ? (
                    <div className="flex flex-col gap-[8px]">
                      {qualEntries.length > 0 ? (
                        <div className="rounded-rr-lg border border-border divide-y divide-border bg-panel2">
                          {qualEntries.map(entry => {
                            const qual = qualOptions.find(q => q.id === entry.id);
                            if (!qual) return null;
                            return (
                              <div key={entry.id} className="flex items-center gap-[10px] px-[12px] min-h-[44px] py-[6px] flex-wrap">
                                <QualificationBadge type={qual.name} code={qual.code || undefined} color={qual.color || undefined} size="small" />
                                <span className="flex-1 min-w-[120px] text-[13px] text-text">{qual.name}</span>
                                <EffectiveDateControl effectiveDate={entry.effectiveDate} weekOptions={weekOptions} onChange={(ed) => updateQualEntryDate(type, entry.id, ed)} />
                                <IconButton icon="close" size={26} iconSize={12} label="Remove qualification" className="hover:!text-bad" onClick={() => removeQualEntry(type, entry.id)} />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[12.5px] text-text3">No qualifications added yet.</div>
                      )}
                      {availableQuals.length > 0 ? (
                        <div className="w-[320px] max-w-full">
                          <Select
                            size="sm"
                            value=""
                            placeholder="Add a qualification…"
                            searchable
                            onChange={(id) => { if (id) addQualEntry(type, id); }}
                            options={availableQuals.map(q => ({
                              value: q.id,
                              label: q.name,
                              searchText: `${q.name} ${q.code || ''}`,
                              icon: <QualificationBadge type={q.name} code={q.code || undefined} color={q.color || undefined} size="small" />,
                            }))}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default OutcomesTab;
