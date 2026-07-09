import React, { useState } from 'react';
import { dossierStyles } from './dossierStyles';
import DossierAttendanceTab from './DossierAttendanceTab';
import DossierKillsTab from './DossierKillsTab';
import DossierTrapSheetTab from './DossierTrapSheetTab';
import type {
  DossierAttendance,
  DossierMissionKills,
  TrapRecord
} from '../../utils/dossierService';

type DossierTabId = 'attendance' | 'kills' | 'trapsheet';

interface DossierMainTabsProps {
  attendance: DossierAttendance | null;
  attendanceLoading: boolean;
  kills: DossierMissionKills[];
  killsLoading: boolean;
  traps: TrapRecord[];
  trapsLoading: boolean;
  scopeMissionIds: string[] | null;
}

// Tab pill styling copied from AwardsManagerDialog
const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  padding: '5px 12px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '14px',
  fontFamily: 'Inter',
  backgroundColor: active ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
  color: active ? '#F97316' : '#646F7E'
});

const TABS: Array<{ id: DossierTabId; label: string }> = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'kills', label: 'Kills' },
  { id: 'trapsheet', label: 'Trap Sheet' }
];

/**
 * The dossier's main content area: fills the height between the frozen scope
 * and awards sections, with the active tab's content scrolling internally.
 */
const DossierMainTabs: React.FC<DossierMainTabsProps> = ({
  attendance,
  attendanceLoading,
  kills,
  killsLoading,
  traps,
  trapsLoading,
  scopeMissionIds
}) => {
  const [activeTab, setActiveTab] = useState<DossierTabId>('attendance');

  return (
    <div style={{ ...dossierStyles.card, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '8px', padding: '16px 24px 0', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={tabButtonStyle(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="dossier-scroll-column"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '16px 24px 24px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {activeTab === 'attendance' && (
          <DossierAttendanceTab attendance={attendance} loading={attendanceLoading} />
        )}
        {activeTab === 'kills' && (
          <DossierKillsTab kills={kills} loading={killsLoading} />
        )}
        {activeTab === 'trapsheet' && (
          <DossierTrapSheetTab traps={traps} loading={trapsLoading} scopeMissionIds={scopeMissionIds} />
        )}
      </div>
    </div>
  );
};

export default DossierMainTabs;
