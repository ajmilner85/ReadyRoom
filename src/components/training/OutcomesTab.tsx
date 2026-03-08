// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { GraduationCap, Check, X, ChevronDown } from 'lucide-react';
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

/** Reusable effective date segmented control */
const EffectiveDateControl: React.FC<{
  effectiveDate: GraduationEffectiveDate;
  weekOptions: number[];
  onChange: (ed: GraduationEffectiveDate) => void;
}> = ({ effectiveDate, weekOptions, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #D1D5DB' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onChange({ mode: 'graduation' }); }}
        style={{
          padding: '4px 10px',
          border: 'none',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          backgroundColor: effectiveDate.mode === 'graduation' ? '#2563EB' : 'white',
          color: effectiveDate.mode === 'graduation' ? 'white' : '#6B7280',
          transition: 'all 0.15s',
        }}
      >
        Graduation
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChange({ mode: 'week', weekNumber: effectiveDate.weekNumber ?? 1 });
        }}
        style={{
          padding: '4px 10px',
          border: 'none',
          borderLeft: '1px solid #D1D5DB',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          backgroundColor: effectiveDate.mode === 'week' ? '#2563EB' : 'white',
          color: effectiveDate.mode === 'week' ? 'white' : '#6B7280',
          transition: 'all 0.15s',
        }}
      >
        Week
      </button>
    </div>
    {effectiveDate.mode === 'week' && (
      <select
        value={effectiveDate.weekNumber ?? 1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onChange({ mode: 'week', weekNumber: parseInt(e.target.value, 10) });
        }}
        style={{
          padding: '4px 8px',
          border: '1px solid #D1D5DB',
          borderRadius: '6px',
          fontSize: '12px',
          backgroundColor: 'white',
        }}
      >
        {weekOptions.map(w => (
          <option key={w} value={w}>Week {w}</option>
        ))}
      </select>
    )}
  </div>
);

const OutcomesTab: React.FC<OutcomesTabProps> = ({ outcomes, onChange, maxWeekNumber }) => {
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [qualOptions, setQualOptions] = useState<QualOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [qualDropdownOpen, setQualDropdownOpen] = useState(false);

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
    return (
      <div style={{ padding: '24px', color: '#6B7280', fontSize: '14px' }}>
        Loading options...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <GraduationCap size={20} style={{ color: '#2563EB' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>
            Graduation Outcomes
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>
          Configure what changes apply to a student upon graduation. Enabled outcomes will appear in the graduation dialog
          with their default values pre-filled. Required outcomes must be completed before graduation can be confirmed.
        </p>
      </div>

      {/* Outcome Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {OUTCOME_TYPES.map(({ type, label }) => {
          const outcome = merged.find(o => o.type === type)!;
          const qualEntries = type === 'qualifications' ? getQualEntries(outcome) : [];
          const availableQuals = qualOptions.filter(q => !qualEntries.find(e => e.id === q.id));

          return (
            <div
              key={type}
              style={{
                border: `1px solid ${outcome.enabled ? '#BFDBFE' : '#E5E7EB'}`,
                borderRadius: '8px',
                backgroundColor: outcome.enabled ? '#F0F7FF' : '#FAFAFA',
                transition: 'all 0.15s',
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  cursor: 'pointer',
                }}
                onClick={() => toggleEnabled(type)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: outcome.enabled ? '2px solid #2563EB' : '2px solid #D1D5DB',
                      backgroundColor: outcome.enabled ? '#2563EB' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    {outcome.enabled && <Check size={14} color="white" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{label}</span>
                </div>
                {outcome.enabled && (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: '12px', color: '#6B7280' }}>Required</span>
                    <button
                      onClick={() => updateOutcome(type, { required: !outcome.required })}
                      style={{
                        position: 'relative',
                        width: '44px',
                        height: '24px',
                        backgroundColor: outcome.required ? '#2563EB' : '#D1D5DB',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: outcome.required ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded Settings */}
              {outcome.enabled && (
                <div style={{
                  padding: '14px 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  borderTop: '1px solid #DBEAFE',
                }}>
                  {/* Effective Date — not shown for qualifications (per-qual dates instead) */}
                  {type !== 'qualifications' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', minWidth: '90px' }}>
                        Effective date:
                      </span>
                      <EffectiveDateControl
                        effectiveDate={outcome.effectiveDate}
                        weekOptions={weekOptions}
                        onChange={(ed) => setEffectiveDate(type, ed)}
                      />
                    </div>
                  )}

                  {/* Standing default */}
                  {type === 'standing' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', minWidth: '90px' }}>
                        Default value:
                      </span>
                      <select
                        value={(outcome.defaultValue as string) || ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); setDefaultValue(type, e.target.value || null); }}
                        style={{
                          padding: '6px 10px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '13px',
                          backgroundColor: 'white',
                          minWidth: '200px',
                        }}
                      >
                        <option value="">No default (select at graduation)</option>
                        {standings.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Qualifications — custom badge dropdown + list with per-qual effective dates */}
                  {type === 'qualifications' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Custom badge dropdown */}
                      {availableQuals.length > 0 && (
                        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setQualDropdownOpen(o => !o)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #D1D5DB',
                              borderRadius: '6px',
                              backgroundColor: 'white',
                              fontSize: '13px',
                              color: '#6B7280',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span>Add a qualification...</span>
                            <ChevronDown size={14} />
                          </button>
                          {qualDropdownOpen && (
                            <div style={{
                              position: 'absolute',
                              top: 'calc(100% + 4px)',
                              left: 0,
                              right: 0,
                              zIndex: 20,
                              backgroundColor: 'white',
                              border: '1px solid #D1D5DB',
                              borderRadius: '6px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                              maxHeight: '240px',
                              overflowY: 'auto',
                            }}>
                              {availableQuals.map(q => (
                                <div
                                  key={q.id}
                                  onClick={() => { addQualEntry(type, q.id); setQualDropdownOpen(false); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #F3F4F6',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F3F4F6'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                                >
                                  <QualificationBadge
                                    type={q.name}
                                    code={q.code || undefined}
                                    color={q.color || undefined}
                                    size="small"
                                  />
                                  <span style={{ fontSize: '13px', color: '#111827' }}>{q.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Selected qualifications list */}
                      {qualEntries.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {qualEntries.map(entry => {
                            const qual = qualOptions.find(q => q.id === entry.id);
                            if (!qual) return null;
                            return (
                              <div
                                key={entry.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 10px',
                                  backgroundColor: 'white',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <QualificationBadge
                                  type={qual.name}
                                  code={qual.code || undefined}
                                  color={qual.color || undefined}
                                  size="small"
                                />
                                <span style={{ fontSize: '13px', color: '#374151', flex: 1, minWidth: '100px' }}>
                                  {qual.name}
                                </span>
                                <EffectiveDateControl
                                  effectiveDate={entry.effectiveDate}
                                  weekOptions={weekOptions}
                                  onChange={(ed) => updateQualEntryDate(type, entry.id, ed)}
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeQualEntry(type, entry.id); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: 'transparent',
                                    color: '#9CA3AF',
                                    cursor: 'pointer',
                                    padding: 0,
                                    flexShrink: 0,
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic' }}>
                          No qualifications added yet
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OutcomesTab;
