import React, { useState } from 'react';
import { dossierStyles } from './dossierStyles';
import { Tabs } from '../ui/primitives';
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
    <div style={{ ...dossierStyles.card, flex: '1 0 380px', minHeight: '380px' }}>
      <Tabs variant="inline" value={activeTab} onChange={setActiveTab} items={TABS.map(t => ({ value: t.id, label: t.label }))} className="flex-none px-[6px]" />
      <div
        className="dossier-scroll-column"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px',
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
