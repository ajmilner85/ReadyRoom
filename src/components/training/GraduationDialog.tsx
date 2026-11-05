// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../ui/primitives';
import { supabase } from '../../utils/supabaseClient';
import QualificationBadge from '../ui/QualificationBadge';
import type { GraduationOutcome, AppliedOutcome } from '../../types/TrainingTypes';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';

interface StudentInfo {
  id: string;
  callsign: string;
  board_number: string;
  squadron?: {
    tail_code: string;
    insignia_url: string;
    primary_color: string;
  };
}

interface GraduationDialogProps {
  studentIds: string[];
  students: StudentInfo[];
  cycleId: string;
  syllabusId: string;
  cycleStartDate: string;
  outcomes: GraduationOutcome[];
  onClose: () => void;
  onConfirm: (graduationData: GraduationSubmission[], graduationDate: string) => void;
  saving?: boolean;
}

export interface GraduationSubmission {
  studentId: string;
  outcomes: AppliedOutcome[];
}

function resolveEffectiveDate(
  outcome: GraduationOutcome,
  cycleStartDate: string,
): string {
  if (outcome.effectiveDate.mode === 'graduation') {
    return new Date().toISOString().split('T')[0];
  }
  const weekNum = outcome.effectiveDate.weekNumber ?? 0;
  const start = new Date(cycleStartDate);
  start.setDate(start.getDate() + weekNum * 7);
  return start.toISOString().split('T')[0];
}

const GraduationDialog: React.FC<GraduationDialogProps> = ({
  studentIds,
  students,
  cycleId,
  syllabusId,
  cycleStartDate,
  outcomes,
  onClose,
  onConfirm,
  saving = false,
}) => {
  const enabledOutcomes = useMemo(
    () => outcomes.filter(o => o.enabled),
    [outcomes]
  );

  const isBatch = studentIds.length > 1;

  // Standings and qualifications options
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [qualifications, setQualifications] = useState<Array<{ id: string; name: string; code: string | null; color: string | null }>>([]);
  const [squadrons, setSquadrons] = useState<Array<{ id: string; designation: string }>>([]);

  // Form state: shared defaults for batch, or per-student for single
  const [standingValue, setStandingValue] = useState<string>('');
  const [squadronValue, setSquadronValue] = useState<string>('');
  // Per-qualification entries with individual effective dates
  const [qualEntries, setQualEntries] = useState<Array<{ id: string; effectiveDate: string }>>([]);
  const [qualDropdownOpen, setQualDropdownOpen] = useState(false);
  // Callsign: per-student (keyed by student id)
  const [callsignValues, setCallsignValues] = useState<Record<string, string>>({});
  // Effective date overrides (keyed by outcome type, not qualifications)
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});
  // Date recorded on the graduation itself (dossier timeline, award criteria);
  // backdate it when graduating students retroactively
  const [graduationDate, setGraduationDate] = useState(new Date().toISOString().split('T')[0]);
  // Outcomes explicitly skipped (e.g. already applied manually in the past) —
  // skipped outcomes bypass validation and are not applied
  const [skippedOutcomes, setSkippedOutcomes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadOptions();
    initDefaults();
  }, []);

  const loadOptions = async () => {
    const [standingsRes, qualsRes, squadronsRes] = await Promise.all([
      supabase.from('standings').select('id, name').order('order'),
      supabase.from('qualifications').select('id, name, code, color').eq('active', true).order('name'),
      supabase.from('org_squadrons').select('id, designation').order('designation'),
    ]);
    if (standingsRes.data) setStandings(standingsRes.data);
    if (qualsRes.data) setQualifications(qualsRes.data);
    if (squadronsRes.data) setSquadrons(squadronsRes.data);
  };

  const initDefaults = () => {
    const standingOutcome = enabledOutcomes.find(o => o.type === 'standing');
    if (standingOutcome?.defaultValue && typeof standingOutcome.defaultValue === 'string') {
      setStandingValue(standingOutcome.defaultValue);
    }

    const qualOutcome = enabledOutcomes.find(o => o.type === 'qualifications');
    if (qualOutcome?.defaultValue && Array.isArray(qualOutcome.defaultValue)) {
      const today = new Date().toISOString().split('T')[0];
      const entries = (qualOutcome.defaultValue as any[]).map(item => {
        if (typeof item === 'string') return { id: item, effectiveDate: today };
        // GraduationQualEntry: { id, effectiveDate: { mode, weekNumber? } }
        if (item?.id && item?.effectiveDate?.mode) {
          const ed = item.effectiveDate;
          if (ed.mode === 'graduation') return { id: item.id, effectiveDate: today };
          const weekNum = ed.weekNumber ?? 0;
          const start = new Date(cycleStartDate);
          start.setDate(start.getDate() + weekNum * 7);
          return { id: item.id, effectiveDate: start.toISOString().split('T')[0] };
        }
        return null;
      }).filter(Boolean);
      setQualEntries(entries);
    }

    // Initialize effective dates
    const overrides: Record<string, string> = {};
    enabledOutcomes.forEach(o => {
      overrides[o.type] = resolveEffectiveDate(o, cycleStartDate);
    });
    setDateOverrides(overrides);
  };

  const toggleSkipOutcome = (type: string) => {
    setSkippedOutcomes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Validation (skipped outcomes are exempt)
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    enabledOutcomes.forEach(outcome => {
      if (!outcome.required || skippedOutcomes.has(outcome.type)) return;
      switch (outcome.type) {
        case 'callsign':
          if (isBatch) {
            const missing = studentIds.filter(id => !callsignValues[id]?.trim());
            if (missing.length > 0) {
              errors.push(`Callsign is required for ${missing.length} student(s)`);
            }
          } else {
            if (!callsignValues[studentIds[0]]?.trim()) {
              errors.push('Callsign is required');
            }
          }
          break;
        case 'standing':
          if (!standingValue) errors.push('Standing is required');
          break;
        case 'squadron_assignment':
          if (!squadronValue) errors.push('Squadron assignment is required');
          break;
        case 'qualifications':
          if (qualEntries.length === 0) errors.push('At least one qualification is required');
          break;
      }
    });
    return errors;
  }, [enabledOutcomes, skippedOutcomes, callsignValues, standingValue, squadronValue, qualEntries, studentIds, isBatch]);

  const canSubmit = validationErrors.length === 0 && !saving && !!graduationDate;

  const handleConfirm = () => {
    if (!canSubmit) return;

    const submissions: GraduationSubmission[] = studentIds.map(studentId => {
      const appliedOutcomes: AppliedOutcome[] = enabledOutcomes.filter(o => !skippedOutcomes.has(o.type)).map(outcome => {
        let value: string | string[] | null = null;
        switch (outcome.type) {
          case 'callsign':
            value = callsignValues[studentId]?.trim() || null;
            break;
          case 'standing':
            value = standingValue || null;
            break;
          case 'squadron_assignment':
            value = squadronValue || null;
            break;
          case 'qualifications':
            value = qualEntries.length > 0 ? qualEntries : null;
            break;
        }
        return {
          type: outcome.type,
          effectiveDate: dateOverrides[outcome.type] || resolveEffectiveDate(outcome, cycleStartDate),
          value,
        };
      });
      return { studentId, outcomes: appliedOutcomes };
    });

    onConfirm(submissions, graduationDate);
  };

  const addQualEntry = (qualId: string) => {
    const today = new Date().toISOString().split('T')[0];
    setQualEntries(prev => prev.find(e => e.id === qualId) ? prev : [...prev, { id: qualId, effectiveDate: today }]);
  };

  const removeQualEntry = (qualId: string) => {
    setQualEntries(prev => prev.filter(e => e.id !== qualId));
  };

  const updateQualEntryDate = (qualId: string, date: string) => {
    setQualEntries(prev => prev.map(e => e.id === qualId ? { ...e, effectiveDate: date } : e));
  };

  const selectedStudents = students.filter(s => studentIds.includes(s.id));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '12px',
        width: '560px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--rr-shadow-lg)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--rr-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)' }}>
              {isBatch ? `Graduate ${studentIds.length} Students` : 'Graduate Student'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              color: 'var(--rr-text2)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--rr-panel2)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Trainee */}
          {!isBatch && selectedStudents[0] && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text2)', marginBottom: '8px' }}>Trainee</div>
              <div style={{
                backgroundColor: 'var(--rr-panel2)',
                borderRadius: '6px',
                border: '1px solid var(--rr-border)',
                padding: '10px 16px 10px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <PilotIDBadgeSm
                  boardNumber={selectedStudents[0].board_number}
                  squadronTailCode={selectedStudents[0].squadron?.tail_code}
                  squadronInsigniaUrl={selectedStudents[0].squadron?.insignia_url}
                />
                <span style={{ fontSize: '16px', fontWeight: 700, color: selectedStudents[0].squadron?.primary_color || 'var(--rr-text)' }}>
                  {selectedStudents[0].callsign}
                </span>
              </div>
            </div>
          )}
          {/* Graduation date — drives the graduation record / dossier timeline */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text2)', marginBottom: '8px' }}>Graduation Date</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="date"
                value={graduationDate}
                onChange={(e) => setGraduationDate(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--rr-border2)', borderRadius: '6px', fontSize: '14px', color: 'var(--rr-text)' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--rr-text2)' }}>
                Backdate this when recording a graduation retroactively (e.g. the end of the cycle).
              </span>
            </div>
          </div>

          {enabledOutcomes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--rr-text2)' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>
                No graduation outcomes configured for this syllabus.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                Confirming will mark the student(s) as graduated without additional changes.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {enabledOutcomes.map(outcome => {
                const isSkipped = skippedOutcomes.has(outcome.type);
                return (
                <div key={outcome.type} style={{
                  border: '1px solid var(--rr-border)',
                  borderRadius: '8px',
                  padding: '16px',
                  backgroundColor: isSkipped ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                }}>
                  {/* Outcome Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isSkipped ? 0 : '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: isSkipped ? 'var(--rr-text3)' : 'var(--rr-text)' }}>
                        {outcome.type === 'callsign' && 'Callsign'}
                        {outcome.type === 'standing' && 'Standing'}
                        {outcome.type === 'squadron_assignment' && 'Squadron Assignment'}
                        {outcome.type === 'qualifications' && 'Qualifications'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: isSkipped ? 'var(--rr-panel2)' : outcome.required ? 'rgba(224,82,78,.12)' : 'var(--rr-panel2)',
                        color: isSkipped ? 'var(--rr-text2)' : outcome.required ? 'var(--rr-bad)' : 'var(--rr-text2)',
                      }}>
                        {isSkipped ? 'Skipped' : outcome.required ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <label
                      title="Skip this outcome — nothing is changed for it (use when it was already applied in the past)"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--rr-text2)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSkipped}
                        onChange={() => toggleSkipOutcome(outcome.type)}
                      />
                      Skip — already applied
                    </label>
                  </div>
                  {!isSkipped && (
                  <>

                  {/* Callsign Input */}
                  {outcome.type === 'callsign' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedStudents.map(student => (
                        <div key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isBatch && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '120px' }}>
                              <PilotIDBadgeSm
                                squadronTailCode={student.squadron?.tail_code}
                                boardNumber={student.board_number}
                                squadronInsigniaUrl={student.squadron?.insignia_url}
                              />
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)' }}>
                                {student.callsign}
                              </span>
                            </div>
                          )}
                          <input
                            type="text"
                            placeholder="New callsign"
                            value={callsignValues[student.id] || ''}
                            onChange={(e) => setCallsignValues(prev => ({ ...prev, [student.id]: e.target.value }))}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              border: '1px solid var(--rr-border2)',
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                          {!isBatch && (
                            <>
                              <span style={{ fontSize: '12px', color: 'var(--rr-text2)', whiteSpace: 'nowrap' }}>Effective:</span>
                              <input
                                type="date"
                                value={dateOverrides['callsign'] || ''}
                                onChange={(e) => setDateOverrides(prev => ({ ...prev, callsign: e.target.value }))}
                                style={{ padding: '6px 8px', border: '1px solid var(--rr-border2)', borderRadius: '4px', fontSize: '12px', color: 'var(--rr-text)' }}
                              />
                            </>
                          )}
                        </div>
                      ))}
                      {isBatch && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--rr-text2)', whiteSpace: 'nowrap' }}>Effective:</span>
                          <input
                            type="date"
                            value={dateOverrides['callsign'] || ''}
                            onChange={(e) => setDateOverrides(prev => ({ ...prev, callsign: e.target.value }))}
                            style={{ padding: '6px 8px', border: '1px solid var(--rr-border2)', borderRadius: '4px', fontSize: '12px', color: 'var(--rr-text)' }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Standing Selector */}
                  {outcome.type === 'standing' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select
                        value={standingValue}
                        onChange={(e) => setStandingValue(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--rr-border2)',
                          borderRadius: '6px',
                          fontSize: '14px',
                          backgroundColor: 'var(--rr-panel)',
                        }}
                      >
                        <option value="">Select standing...</option>
                        {standings.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: '12px', color: 'var(--rr-text2)', whiteSpace: 'nowrap' }}>Effective:</span>
                      <input
                        type="date"
                        value={dateOverrides['standing'] || ''}
                        onChange={(e) => setDateOverrides(prev => ({ ...prev, standing: e.target.value }))}
                        style={{ padding: '6px 8px', border: '1px solid var(--rr-border2)', borderRadius: '4px', fontSize: '12px', color: 'var(--rr-text)' }}
                      />
                    </div>
                  )}

                  {/* Squadron Selector */}
                  {outcome.type === 'squadron_assignment' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select
                        value={squadronValue}
                        onChange={(e) => setSquadronValue(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--rr-border2)',
                          borderRadius: '6px',
                          fontSize: '14px',
                          backgroundColor: 'var(--rr-panel)',
                        }}
                      >
                        <option value="">Select squadron...</option>
                        {squadrons.map(s => (
                          <option key={s.id} value={s.id}>{s.designation}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: '12px', color: 'var(--rr-text2)', whiteSpace: 'nowrap' }}>Effective:</span>
                      <input
                        type="date"
                        value={dateOverrides['squadron_assignment'] || ''}
                        onChange={(e) => setDateOverrides(prev => ({ ...prev, squadron_assignment: e.target.value }))}
                        style={{ padding: '6px 8px', border: '1px solid var(--rr-border2)', borderRadius: '4px', fontSize: '12px', color: 'var(--rr-text)' }}
                      />
                    </div>
                  )}

                  {/* Qualifications Badge Dropdown */}
                  {outcome.type === 'qualifications' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {qualifications.filter(q => !qualEntries.find(e => e.id === q.id)).length > 0 && (
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={() => setQualDropdownOpen(o => !o)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid var(--rr-border2)',
                              borderRadius: '6px',
                              backgroundColor: 'var(--rr-panel)',
                              fontSize: '13px',
                              color: 'var(--rr-text2)',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span>Add a qualification...</span>
                            <Icon name="chevronDown" size={14} />
                          </button>
                          {qualDropdownOpen && (
                            <div style={{
                              position: 'absolute',
                              bottom: 'calc(100% + 4px)',
                              left: 0,
                              right: 0,
                              zIndex: 20,
                              backgroundColor: 'var(--rr-panel)',
                              border: '1px solid var(--rr-border2)',
                              borderRadius: '6px',
                              boxShadow: 'var(--rr-shadow)',
                              maxHeight: '200px',
                              overflowY: 'auto',
                            }}>
                              {qualifications.filter(q => !qualEntries.find(e => e.id === q.id)).map(q => (
                                <div
                                  key={q.id}
                                  onClick={() => { addQualEntry(q.id); setQualDropdownOpen(false); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--rr-border)',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--rr-panel2)'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                                >
                                  <QualificationBadge
                                    type={q.name}
                                    code={q.code || undefined}
                                    color={q.color || undefined}
                                    size="small"
                                  />
                                  <span style={{ fontSize: '13px', color: 'var(--rr-text)' }}>{q.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {qualEntries.map(entry => {
                        const qual = qualifications.find(q => q.id === entry.id);
                        if (!qual) return null;
                        return (
                          <div
                            key={entry.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '7px 10px',
                              border: '1px solid var(--rr-border)',
                              borderRadius: '6px',
                              backgroundColor: 'var(--rr-panel)',
                            }}
                          >
                            <QualificationBadge
                              type={qual.name}
                              code={qual.code || undefined}
                              color={qual.color || undefined}
                              size="small"
                            />
                            <span style={{ flex: 1, fontSize: '13px', color: 'var(--rr-text)' }}>{qual.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--rr-text2)', whiteSpace: 'nowrap' }}>Effective:</span>
                            <input
                              type="date"
                              value={entry.effectiveDate}
                              onChange={(e) => updateQualEntryDate(entry.id, e.target.value)}
                              style={{ padding: '4px 8px', border: '1px solid var(--rr-border2)', borderRadius: '4px', fontSize: '12px', color: 'var(--rr-text)' }}
                            />
                            <button
                              onClick={() => removeQualEntry(entry.id)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '22px', height: '22px', border: 'none', borderRadius: '4px',
                                backgroundColor: 'transparent', color: 'var(--rr-text3)', cursor: 'pointer', padding: 0, flexShrink: 0,
                              }}
                            >
                              <Icon name="close" size={13} />
                            </button>
                          </div>
                        );
                      })}
                      {qualEntries.length === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--rr-text3)', fontStyle: 'italic' }}>No qualifications added</div>
                      )}
                    </div>
                  )}
                  </>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: 'rgba(224,82,78,.12)',
              border: '1px solid var(--rr-bad)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}>
              <Icon name="alertCircle" size={16} style={{ color: 'var(--rr-bad)', marginTop: '1px', flexShrink: 0 }} />
              <div>
                {validationErrors.map((err, i) => (
                  <div key={i} style={{ fontSize: '13px', color: 'var(--rr-bad)' }}>{err}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--rr-border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--rr-border2)',
              borderRadius: '6px',
              backgroundColor: 'var(--rr-panel)',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--rr-text)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: canSubmit ? 'var(--rr-accent)' : '#93C5FD',
              color: 'white',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Icon name="training" size={16} />
            {saving ? 'Graduating...' : isBatch ? `Graduate ${studentIds.length} Students` : 'Graduate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GraduationDialog;
