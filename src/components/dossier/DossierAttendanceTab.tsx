import React from 'react';
import { formatDossierDate } from './dossierStyles';
import type { DossierAttendance } from '../../utils/dossierService';

interface DossierAttendanceTabProps {
  attendance: DossierAttendance | null;
  loading: boolean;
}

const RESPONSE_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  'present': { label: 'Present', bg: '#D1FAE5', fg: '#065F46' },
  'absent': { label: 'Absent', bg: '#FEE2E2', fg: '#DC2626' },
  'unknown': { label: 'Unknown', bg: '#F3F4F6', fg: '#4B5563' }
};

const summaryStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  textAlign: 'center',
  flex: 1
};

const DossierAttendanceTab: React.FC<DossierAttendanceTabProps> = ({ attendance, loading }) => {
  const rate = attendance?.attendanceRate;

  if (loading) {
    return (
      <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
        Loading attendance...
      </div>
    );
  }

  if (!attendance || attendance.totalEvents === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748B',
        fontSize: '14px',
        textAlign: 'center'
      }}>
        No published events in the selected scope
      </div>
    );
  }

  return (
    <>
      {/* Roll call summary */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexShrink: 0 }}>
        {[
          { label: 'Events Held', value: `${attendance.totalEvents}` },
          { label: 'Attended', value: `${attendance.attended}` },
          { label: 'Attendance Rate', value: rate != null ? `${Math.round(rate * 100)}%` : '—' }
        ].map(tile => (
          <div key={tile.label} style={summaryStyle}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', lineHeight: '28px' }}>
              {tile.value}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
              {tile.label}
            </div>
          </div>
        ))}
      </div>

      {/* Recent events with roll call result */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {attendance.recent.map(item => {
          const chip = RESPONSE_CHIP[item.response] || RESPONSE_CHIP['unknown'];
          return (
            <div
              key={item.eventId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 0',
                borderBottom: '1px solid #F1F5F9'
              }}
            >
              <span style={{ fontSize: '12px', color: '#94A3B8', width: '90px', flexShrink: 0 }}>
                {formatDossierDate(item.date)}
              </span>
              <span style={{
                fontSize: '13px',
                color: '#0F172A',
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {item.name}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 8px',
                height: '20px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 500,
                backgroundColor: chip.bg,
                color: chip.fg,
                flexShrink: 0
              }}>
                {chip.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default DossierAttendanceTab;
