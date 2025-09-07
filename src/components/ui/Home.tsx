import React, { useEffect, useState } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import PollCard from './polls/PollCard';
import ChangeLogCard from './change-log/ChangeLogCard';
import CreatePollDialog from './polls/CreatePollDialog';
import PollManagementDialog from './polls/PollManagementDialog';

const Home: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const { settings } = useAppSettings();
  const [showCreatePollDialog, setShowCreatePollDialog] = useState(false);
  const [showManagePollsDialog, setShowManagePollsDialog] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Squadron color theming
  const useSquadronColors = settings.interfaceThemeUsesSquadronColors;
  const primaryColor = useSquadronColors ? '#3B82F6' : '#3B82F6'; // TODO: Get actual squadron color

  const handlePollCreated = () => {
    // Refresh polls by triggering a re-render
    setRefreshTrigger(prev => prev + 1);
    setShowCreatePollDialog(false);
  };

  const handlePollDeleted = () => {
    // Refresh polls by triggering a re-render
    setRefreshTrigger(prev => prev + 1);
    setShowManagePollsDialog(false);
  };

  // Clear page loading immediately since home loads fast
  useEffect(() => {
    setPageLoading('home', false);
  }, [setPageLoading]);

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#F0F4F8',
    minHeight: '100vh',
    padding: '24px',
    boxSizing: 'border-box',
  };

  const contentStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'start',
  };

  // Responsive breakpoint for mobile
  const mobileContentStyle: React.CSSProperties = {
    ...contentStyle,
    gridTemplateColumns: '1fr',
    gap: '16px',
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={containerStyle}>
      <div style={isMobile ? mobileContentStyle : contentStyle}>
        {/* Poll Card */}
        <PollCard
          onCreatePoll={() => setShowCreatePollDialog(true)}
          onManagePolls={() => setShowManagePollsDialog(true)}
          refreshTrigger={refreshTrigger}
        />

        {/* Change Log Card */}
        <ChangeLogCard />
      </div>

      {/* Poll Admin Dialogs */}
      <CreatePollDialog
        isOpen={showCreatePollDialog}
        onClose={() => setShowCreatePollDialog(false)}
        onPollCreated={handlePollCreated}
        primaryColor={primaryColor}
      />

      <PollManagementDialog
        isOpen={showManagePollsDialog}
        onClose={() => setShowManagePollsDialog(false)}
        onPollDeleted={handlePollDeleted}
        primaryColor={primaryColor}
      />

    </div>
  );
};

export default Home;