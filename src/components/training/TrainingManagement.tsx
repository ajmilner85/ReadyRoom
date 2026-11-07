import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageLoading } from '../../context/PageLoadingContext';
import { usePageHeader } from '../../context/ShellContext';
import { Tabs, Toast } from '../ui/primitives';

// Training subpages
import SyllabusManagement from './SyllabusManagement';
import PilotTrainingRecords from './PilotTrainingRecords';

type TrainingPage = 'records' | 'syllabi';

const PAGE_TITLES: Record<TrainingPage, string> = {
  records: 'Pilot Training Records',
  syllabi: 'Syllabus Management',
};

/** Training: horizontal sub-page tabs (Pilot Training Records · Syllabus Management). */
const TrainingManagement: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TrainingPage | null;
  const activeTrainingPage: TrainingPage = tabParam === 'syllabi' ? 'syllabi' : 'records';
  const [error, setError] = useState<string | null>(null);

  usePageHeader({ code: 'TRAINING', title: PAGE_TITLES[activeTrainingPage] });

  // Clear page loading immediately since training loads fast
  useEffect(() => {
    setPageLoading('training', false);
    setPageLoading('training-management', false);
  }, [setPageLoading]);

  const setTab = (t: TrainingPage) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Tabs
        value={activeTrainingPage}
        onChange={setTab}
        items={[
          { value: 'records', label: 'Pilot Training Records' },
          { value: 'syllabi', label: 'Syllabus Management' },
        ]}
      />
      {error ? (
        <div className="fixed top-16 right-5 z-[1000] max-w-[420px]">
          <Toast tone="bad" onDismiss={() => setError(null)}>{error}</Toast>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 p-[14px] flex flex-col">
        {activeTrainingPage === 'syllabi' ? (
          // Syllabi: navigator + editor panes (Events layout), so no outer card
          <div className="rr-page flex-1 min-w-0 min-h-0 flex">
            <SyllabusManagement error={error} setError={setError} />
          </div>
        ) : (
          // Records: cycle navigator + records pane (Events layout), so no outer card
          <div className="rr-page flex-1 min-w-0 min-h-0 flex">
            <PilotTrainingRecords error={error} setError={setError} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingManagement;
