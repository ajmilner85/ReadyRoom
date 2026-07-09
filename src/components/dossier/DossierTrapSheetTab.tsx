import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import type { TrapRecord } from '../../utils/dossierService';

interface DossierTrapSheetTabProps {
  traps: TrapRecord[];
  loading: boolean;
  // Mission IDs covered by the page-level scope; null = career (no filtering)
  scopeMissionIds: string[] | null;
}

// Greenie-board color conventions per LSO NATOPS grading
const GRADE_COLORS: Record<string, string> = {
  '_OK_': '#15803D',
  'OK': '#22C55E',
  '(OK)': '#EAB308',
  'B': '#3B82F6',
  'BOLTER': '#3B82F6',
  '--': '#B45309',
  'NG': '#B45309',
  'NO GRADE': '#B45309',
  'C': '#DC2626',
  'CUT': '#DC2626',
  'WO': '#7F1D1D',
  'OWO': '#7F1D1D',
  'WOFD': '#7F1D1D'
};

const GRADE_OPTIONS = ['_OK_', 'OK', '(OK)', 'B', 'NG', 'C', 'WO'];

function gradeColor(grade: string | null): string {
  if (!grade) return '#94A3B8';
  return GRADE_COLORS[grade.toUpperCase()] || GRADE_COLORS[grade] || '#94A3B8';
}

function formatDeviations(deviations: any): string {
  if (!deviations) return '—';
  if (Array.isArray(deviations)) {
    return deviations
      .map((d: any) => (typeof d === 'string' ? d : d?.code || d?.name || JSON.stringify(d)))
      .join(' ');
  }
  if (typeof deviations === 'string') return deviations;
  return JSON.stringify(deviations);
}

const filterSelectStyle: React.CSSProperties = {
  ...dossierStyles.selector,
  width: 'auto',
  minWidth: '150px'
};

const headerCellStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 500,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  textAlign: 'left',
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap'
};

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '13px',
  color: '#0F172A',
  borderBottom: '1px solid #F1F5F9',
  whiteSpace: 'nowrap'
};

const DossierTrapSheetTab: React.FC<DossierTrapSheetTabProps> = ({ traps, loading, scopeMissionIds }) => {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'lso' | 'tactical-paddles'>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'day' | 'night'>('all');

  const filteredTraps = useMemo(() => {
    const scopeSet = scopeMissionIds === null ? null : new Set(scopeMissionIds);
    return traps.filter(trap => {
      if (scopeSet && (!trap.mission_id || !scopeSet.has(trap.mission_id))) return false;
      // Passes graded by a human LSO carry a grading_lso_id; app-sourced
      // passes (Tactical Paddles) do not.
      if (sourceFilter === 'lso' && !trap.grading_lso_id) return false;
      if (sourceFilter === 'tactical-paddles' && trap.grading_lso_id) return false;
      if (gradeFilter !== 'all' && (trap.overall_grade || '').toUpperCase() !== gradeFilter.toUpperCase()) return false;
      if (timeFilter === 'day' && trap.is_night) return false;
      if (timeFilter === 'night' && !trap.is_night) return false;
      return true;
    });
  }, [traps, sourceFilter, gradeFilter, timeFilter, scopeMissionIds]);

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', flexShrink: 0 }}>
        {[
          {
            value: sourceFilter,
            onChange: (v: string) => setSourceFilter(v as any),
            options: [
              { value: 'all', label: 'All Sources' },
              { value: 'lso', label: 'Human LSO' },
              { value: 'tactical-paddles', label: 'Tactical Paddles' }
            ]
          },
          {
            value: gradeFilter,
            onChange: (v: string) => setGradeFilter(v),
            options: [
              { value: 'all', label: 'All Grades' },
              ...GRADE_OPTIONS.map(g => ({ value: g, label: g }))
            ]
          },
          {
            value: timeFilter,
            onChange: (v: string) => setTimeFilter(v as any),
            options: [
              { value: 'all', label: 'Day & Night' },
              { value: 'day', label: 'Day Only' },
              { value: 'night', label: 'Night Only' }
            ]
          }
        ].map((filter, index) => (
          <div key={index} style={{ position: 'relative' }}>
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              style={filterSelectStyle}
            >
              {filter.options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div style={{
              position: 'absolute',
              top: '50%',
              right: '12px',
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }}>
              <ChevronDown size={16} color="#64748B" />
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ ...dossierStyles.emptyState, flex: 1 }}>Loading trap records...</div>
      ) : filteredTraps.length === 0 ? (
        <div style={{ ...dossierStyles.emptyState, flex: 1, flexDirection: 'column', gap: '8px' }}>
          <div>{traps.length === 0 ? 'No trap records yet' : 'No passes match the selected filters'}</div>
          {traps.length === 0 && (
            <div style={{ fontSize: '12px', color: '#94A3B8', maxWidth: '360px' }}>
              Passes graded by squadron LSOs or imported from the Tactical Paddles app will appear here.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Greenie board strip — most recent passes, oldest to newest */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[...filteredTraps].reverse().map(trap => (
              <div
                key={`chip-${trap.id}`}
                title={`${formatDossierDate(trap.pass_time)} — ${trap.overall_grade || 'Ungraded'}${trap.wire_number ? ` ${trap.wire_number}-wire` : ''}`}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '4px',
                  backgroundColor: gradeColor(trap.overall_grade),
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  position: 'relative'
                }}
              >
                {trap.wire_number ?? ''}
                {trap.is_night && (
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#0F172A',
                    border: '1px solid #FFFFFF'
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* Pass table — scrolls with the tab body */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Date</th>
                <th style={headerCellStyle}>Grade</th>
                <th style={headerCellStyle}>Wire</th>
                <th style={headerCellStyle}>D/N</th>
                <th style={headerCellStyle}>Groove</th>
                <th style={headerCellStyle}>Deviations</th>
                <th style={{ ...headerCellStyle, whiteSpace: 'normal' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filteredTraps.map(trap => (
                <tr key={trap.id}>
                  <td style={cellStyle}>{formatDossierDate(trap.pass_time || trap.created_at)}</td>
                  <td style={cellStyle}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 8px',
                      height: '22px',
                      borderRadius: '4px',
                      backgroundColor: gradeColor(trap.overall_grade),
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      {trap.overall_grade || '—'}
                    </span>
                  </td>
                  <td style={cellStyle}>{trap.wire_number ?? '—'}</td>
                  <td style={cellStyle}>{trap.is_night ? 'Night' : 'Day'}</td>
                  <td style={cellStyle}>
                    {trap.groove_time_seconds != null ? `${trap.groove_time_seconds}s` : '—'}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                    {formatDeviations(trap.deviations)}
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'normal', color: '#64748B', fontSize: '12px' }}>
                    {trap.lso_comment || trap.remarks || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
};

export default DossierTrapSheetTab;
