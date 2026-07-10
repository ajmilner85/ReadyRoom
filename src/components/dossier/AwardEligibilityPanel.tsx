import React, { useEffect, useMemo, useState } from 'react';
import { Check, Medal, RefreshCw, X } from 'lucide-react';
import StyledSelect from './StyledSelect';
import { describeRuleNode } from '../../utils/awardRules';
import { computeEligibleRecipients, type EligibilityCandidate } from '../../utils/awardEligibilityService';
import { issueAward, ensureRepeatVariantCoverage, type Award } from '../../utils/awardService';
import type { DossierCycle, DossierPilotOption } from '../../utils/dossierService';

// Eligibility checker embedded in the Issue Award tab for awards that define
// structured criteria: pick a cycle, compute who qualifies from
// attendance/roster data, review the list and grant the award en masse (or
// adjust the selection first).

interface AwardEligibilityPanelProps {
  award: Award; // must have eligibility_rules
  cycles: DossierCycle[];
  pilots: DossierPilotOption[];
  issuedByProfileId: string | null;
  onIssued: () => Promise<void> | void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/**
 * Timing suffix for a cycle option, derived from its dates — the stored
 * cycles.status field is set manually and routinely goes stale (e.g. a
 * finished cruise still marked "upcoming").
 */
function cycleTimingSuffix(cycle: DossierCycle): string {
  const now = Date.now();
  const start = cycle.start_date ? Date.parse(cycle.start_date) : null;
  const end = cycle.end_date ? Date.parse(cycle.end_date) : null;
  if (end !== null && end < now) return ''; // completed — the normal case for granting
  if (start !== null && start > now) return ' (upcoming)';
  return ' (in progress)';
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#64748B'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  backgroundColor: '#F8FAFC',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: 'Inter'
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  backgroundColor: '#3B82F6',
  color: '#FFFFFF',
  borderRadius: '6px',
  border: '1px solid #3B82F6',
  cursor: 'pointer',
  fontFamily: 'Inter',
  fontSize: '14px',
  fontWeight: 500,
  justifyContent: 'center'
};

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '13px',
  color: '#0F172A',
  borderBottom: '1px solid #F1F5F9',
  textAlign: 'left'
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontSize: '12px',
  fontWeight: 500,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #E2E8F0'
};

const AwardEligibilityPanel: React.FC<AwardEligibilityPanelProps> = ({
  award,
  cycles,
  pilots,
  issuedByProfileId,
  onIssued,
  onError,
  onNotice
}) => {
  const [cycleId, setCycleId] = useState('');
  const [candidates, setCandidates] = useState<EligibilityCandidate[] | null>(null);
  const [eventsConsidered, setEventsConsidered] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [awardedDate, setAwardedDate] = useState('');
  const [citation, setCitation] = useState('');
  const [checking, setChecking] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const selectedAward = award;

  // Reset when a different award is picked in the Issue tab
  useEffect(() => {
    setCycleId('');
    setCandidates(null);
    setSelected(new Set());
  }, [award.id]);

  // Cycles offered are constrained to the award's qualifying cycle types
  const eligibleCycles = useMemo(() => {
    const types = selectedAward?.eligibility_rules?.cycleTypes || [];
    if (types.length === 0) return cycles;
    return cycles.filter(c => c.type && types.includes(c.type));
  }, [cycles, selectedAward]);

  // For rendering "[cycle name]" on conditions pinned to a specific cycle
  const cycleNameById = useMemo(() => {
    const map: Record<string, string> = {};
    cycles.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [cycles]);

  const handleCycleChange = (id: string) => {
    setCycleId(id);
    setCandidates(null);
    const cycle = cycles.find(c => c.id === id);
    const today = new Date().toISOString().split('T')[0];
    const cycleEnd = cycle?.end_date ? cycle.end_date.split('T')[0] : null;
    setAwardedDate(cycleEnd && cycleEnd <= today ? cycleEnd : today);
  };

  const handleCheck = async () => {
    if (!selectedAward?.eligibility_rules || !cycleId) return;
    setChecking(true);
    setCandidates(null);
    try {
      const { data, error } = await computeEligibleRecipients(
        selectedAward.id,
        selectedAward.eligibility_rules,
        selectedAward.device_config || null,
        cycleId,
        pilots.map(p => ({
          id: p.id,
          callsign: p.callsign,
          boardNumber: p.boardNumber,
          squadronDesignation: p.squadronDesignation
        }))
      );
      if (error || !data) {
        onError(`Eligibility check failed: ${error?.message || 'unknown error'}`);
        return;
      }
      setCandidates(data.candidates);
      setEventsConsidered(data.eventsConsidered);
      setSelected(new Set(
        data.candidates.filter(c => c.eligible && !c.alreadyIssued).map(c => c.pilotId)
      ));
    } finally {
      setChecking(false);
    }
  };

  const handleIssue = async () => {
    if (!selectedAward || selected.size === 0 || !awardedDate) return;
    setIssuing(true);
    try {
      const deviceTierByPilot: Record<string, string | null> = {};
      (candidates || []).forEach(c => {
        if (selected.has(c.pilotId)) deviceTierByPilot[c.pilotId] = c.earnedTier?.id || null;
      });

      const { success, error } = await issueAward({
        awardId: selectedAward.id,
        pilotIds: Array.from(selected),
        awardedDate,
        citation: citation.trim() || null,
        cycleId,
        issuedByProfileId,
        deviceTierByPilot
      });

      if (!success) {
        onError(error?.message || 'Failed to issue the award');
        return;
      }

      // Repeat-device awards: generate any newly-needed star variants
      await ensureRepeatVariantCoverage(selectedAward.id);

      onNotice(`Issued "${selectedAward.name}" to ${selected.size} pilot${selected.size > 1 ? 's' : ''}`);
      setCitation('');
      await onIssued();
      // Re-run so "already issued" flags update in place
      await handleCheck();
    } finally {
      setIssuing(false);
    }
  };

  const toggle = (pilotId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(pilotId);
    else next.delete(pilotId);
    setSelected(next);
  };

  const eligibleCount = (candidates || []).filter(c => c.eligible).length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Cycle *</label>
          <StyledSelect
            value={cycleId}
            onChange={handleCycleChange}
            options={[
              { value: '', label: 'Select a cycle...' },
              ...eligibleCycles.map(cycle => ({
                value: cycle.id,
                label: `${cycle.name}${cycleTimingSuffix(cycle)}`
              }))
            ]}
          />
        </div>
        <button
          onClick={handleCheck}
          disabled={!cycleId || checking}
          style={{ ...primaryButtonStyle, opacity: !cycleId || checking ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          <RefreshCw size={14} /> {checking ? 'Checking...' : 'Check Eligibility'}
        </button>
      </div>

      {selectedAward?.eligibility_rules && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#64748B'
        }}>
          <span style={{ fontWeight: 500 }}>Criteria: </span>
          {describeRuleNode(selectedAward.eligibility_rules.rules, cycleNameById)}
          {candidates && (
            <span> · Evaluated over {eventsConsidered} published event{eventsConsidered === 1 ? '' : 's'} in the cycle</span>
          )}
        </div>
      )}

      {candidates && (
        <>
          <div style={{ marginTop: '16px', maxHeight: '320px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, width: '32px' }}></th>
                  <th style={headerCellStyle}>Pilot</th>
                  <th style={headerCellStyle}>Squadron</th>
                  <th style={headerCellStyle}>Attended</th>
                  <th style={headerCellStyle}>Active</th>
                  {selectedAward?.device_config?.mode === 'tier' && <th style={headerCellStyle}>Device</th>}
                  <th style={headerCellStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => (
                  <tr key={candidate.pilotId} style={{ opacity: candidate.eligible || candidate.alreadyIssued ? 1 : 0.55 }}>
                    <td style={cellStyle}>
                      <input
                        type="checkbox"
                        checked={selected.has(candidate.pilotId)}
                        onChange={(e) => toggle(candidate.pilotId, e.target.checked)}
                      />
                    </td>
                    <td style={cellStyle}>
                      <span style={{ color: '#646F7E', marginRight: '6px' }}>{candidate.boardNumber}</span>
                      <span style={{ fontWeight: 500 }}>{candidate.callsign}</span>
                    </td>
                    <td style={{ ...cellStyle, color: '#64748B' }}>{candidate.squadronDesignation || '—'}</td>
                    <td style={cellStyle}>
                      {candidate.metrics.events_attended}/{candidate.metrics.events_total}
                      <span style={{ color: '#94A3B8', marginLeft: '6px' }}>({candidate.metrics.attendance_pct}%)</span>
                    </td>
                    <td style={cellStyle}>
                      {candidate.metrics.active_member
                        ? <Check size={14} style={{ color: '#16A34A' }} />
                        : <X size={14} style={{ color: '#CBD5E1' }} />}
                    </td>
                    {selectedAward?.device_config?.mode === 'tier' && (
                      <td style={{ ...cellStyle, color: '#64748B' }}>{candidate.earnedTier?.name || '—'}</td>
                    )}
                    <td style={cellStyle}>
                      {candidate.alreadyIssued ? (
                        <span style={{ padding: '1px 6px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: 600 }}>
                          ISSUED
                        </span>
                      ) : candidate.eligible ? (
                        <span style={{ padding: '1px 6px', borderRadius: '6px', backgroundColor: '#F0FDF4', color: '#16A34A', fontSize: '11px', fontWeight: 600 }}>
                          ELIGIBLE
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '11px' }}>Not eligible</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '6px', fontSize: '12px', color: '#94A3B8' }}>
            {eligibleCount} eligible · {selected.size} selected. Deselect anyone you don't want to include, or
            manually select ineligible pilots to override the criteria.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '16px', marginTop: '12px' }}>
            <div>
              <label style={labelStyle}>Date Awarded *</label>
              <input type="date" value={awardedDate} onChange={(e) => setAwardedDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Citation / Notes</label>
              <input
                type="text"
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                style={inputStyle}
                placeholder="Applied to every issuance, e.g. the cruise name"
              />
            </div>
          </div>

          <button
            onClick={handleIssue}
            disabled={issuing || selected.size === 0 || !awardedDate}
            style={{ ...primaryButtonStyle, marginTop: '16px', opacity: issuing || selected.size === 0 || !awardedDate ? 0.6 : 1 }}
          >
            <Medal size={14} /> {issuing ? 'Issuing...' : `Issue to ${selected.size} Pilot${selected.size === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  );
};

export default AwardEligibilityPanel;
