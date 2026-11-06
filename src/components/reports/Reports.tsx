import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageLoading } from '../../context/PageLoadingContext';
import { usePageHeader } from '../../context/ShellContext';
import { Tabs, Toast } from '../ui/primitives';
import CycleAttendanceReport from './CycleAttendanceReport';
import DiscordRoleVerificationReport from './DiscordRoleVerificationReport';

type ReportType = 'cycle-attendance' | 'discord-role-verification';

const REPORT_TITLES: Record<ReportType, string> = {
  'cycle-attendance': 'Cycle Attendance',
  'discord-role-verification': 'Discord Role Verification',
};

/** Reports: horizontal sub-page tabs (Cycle Attendance · Discord Role Verification). */
const Reports: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('report') as ReportType | null;
  const activeReport: ReportType = param === 'discord-role-verification' ? 'discord-role-verification' : 'cycle-attendance';
  const [error, setError] = useState<string | null>(null);

  usePageHeader({ code: 'RECORDS', title: 'Reports', meta: `· ${REPORT_TITLES[activeReport]}` });

  // Clear page loading immediately since reports load fast
  useEffect(() => {
    setPageLoading('reports', false);
  }, [setPageLoading]);

  const setReport = (r: ReportType) => {
    const next = new URLSearchParams(searchParams);
    next.set('report', r);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Tabs
        value={activeReport}
        onChange={setReport}
        items={[
          { value: 'cycle-attendance', label: 'Cycle Attendance' },
          { value: 'discord-role-verification', label: 'Discord Role Verification' },
        ]}
      />
      {error ? (
        <div className="fixed top-16 right-5 z-[1000] max-w-[420px]">
          <Toast tone="bad" onDismiss={() => setError(null)}>{error}</Toast>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 p-[14px] flex flex-col">
        <div className="rr-page flex-initial min-h-0 bg-panel border border-border rounded-rr-xl shadow-rr overflow-auto p-4">
          {activeReport === 'cycle-attendance'
            ? <CycleAttendanceReport error={error} setError={setError} />
            : <DiscordRoleVerificationReport error={error} setError={setError} />}
        </div>
      </div>
    </div>
  );
};

export default Reports;
