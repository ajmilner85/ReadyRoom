import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { PermissionGate } from '../ui/PermissionGate';
import { User, Users, PaintBucket, Calendar, Network, Shield, Code } from 'lucide-react';

// Import settings subpages
import Appearance from './Appearance';
import UserAccounts from './UserAccounts';
import RosterSettings from './RosterSettings';
import OrganizationSettings from './OrganizationSettings';
import EventSettings from './EventSettings';
import MissionDebriefingSettings from './MissionDebriefingSettings';
import PermissionsSettings from './PermissionsSettings';
import DeveloperSettings from './DeveloperSettings';

// Define the types of settings pages
type SettingsPage = 'roster' | 'organization' | 'events' | 'mission-debriefing' | 'permissions' | 'appearance' | 'accounts' | 'developer';

interface SettingsNavItem {
  id: SettingsPage;
  icon: React.ReactNode;
  label: string;
}

interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

// Navigation sections for the settings sidebar
const settingsNavSections: SettingsNavSection[] = [
  {
    title: 'Account Preferences',
    items: [
      {
        id: 'appearance',
        icon: <PaintBucket size={20} />,
        label: 'Appearance'
      },
      {
        id: 'accounts',
        icon: <User size={20} />,
        label: 'Account'
      },
      {
        id: 'developer',
        icon: <Code size={20} />,
        label: 'Developer Settings'
      }
    ]
  },
  {
    title: 'Organization Settings',
    items: [
      {
        id: 'permissions',
        icon: <Shield size={20} />,
        label: 'Permissions'
      },
      {
        id: 'organization',
        icon: <Network size={20} />,
        label: 'Organization Structure'
      },
      {
        id: 'roster',
        icon: <Users size={20} />,
        label: 'Roster'
      },
      {
        id: 'events',
        icon: <Calendar size={20} />,
        label: 'Events'
      },
      {
        id: 'mission-debriefing',
        icon: <Calendar size={20} />,
        label: 'Mission Debriefing'
      }
    ]
  }
];

const Settings: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear page loading immediately since settings load fast
  useEffect(() => {
    setPageLoading('admin', false);
  }, [setPageLoading]);

  // Navigate between settings pages
  const handleSettingsNavigate = (page: SettingsPage) => {
    setActiveSettingsPage(page);
  };

  // Render content based on active settings page
  const renderSettingsContent = () => {
    if (!activeSettingsPage) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#94A3B8',
          fontSize: '14px',
          fontFamily: 'Inter'
        }}>
          Select a settings page from the sidebar
        </div>
      );
    }

    switch (activeSettingsPage) {
      case 'roster':
        return <RosterSettings error={error} setError={setError} />;
      case 'organization':
        return <OrganizationSettings error={error} setError={setError} />;
      case 'events':
        return <EventSettings error={error} setError={setError} />;
      case 'mission-debriefing':
        return <MissionDebriefingSettings error={error} setError={setError} />;
      case 'permissions':
        return <PermissionsSettings />;
      case 'developer':
        return <DeveloperSettings error={error} setError={setError} />;
      case 'appearance':
        return <Appearance error={error} setError={setError} />;
      case 'accounts':
        return <UserAccounts error={error} setError={setError} />;
      default:
        return <div>Select a settings page</div>;
    }
  };

  // Settings navigation item
  const SettingsNavItem: React.FC<{ item: SettingsNavItem; active: boolean; onClick: () => void }> = ({
    item,
    active,
    onClick
  }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '16px',
          paddingRight: '16px',
          cursor: 'pointer',
          fontFamily: 'Inter',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease',
          borderRadius: '6px',
          marginBottom: '5px',
          height: '32px',
          gap: '5px',
          backgroundColor: active ? '#82728C' : isHovered ? '#F1F5F9' : 'transparent',
          color: active ? 'white' : '#64748B'
        }}
      >
        <div>{item.icon}</div>
        <div>{item.label}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: '#F0F4F8',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 20px 20px 20px',
        boxSizing: 'border-box',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{
        maxWidth: '1350px',
        width: '100%',
        margin: '0 auto',
        height: 'calc(100vh - 40px)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Main settings card with navigation and content */}
        <Card
          className="bg-white rounded-lg shadow-md overflow-hidden"
          style={{
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div className="flex" style={{ flex: 1, overflow: 'hidden' }}>
            {/* Settings navigation sidebar */}
            <div
              className="w-64"
              style={{
                backgroundColor: '#FFFFFF',
                padding: '40px 24px 24px 24px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {settingsNavSections.map((section) => (
                  <div key={section.title} style={{ marginBottom: '32px' }}>
                    {/* Section Title */}
                    <h3 style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#9CA3AF',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '12px',
                      fontFamily: 'Inter'
                    }}>
                      {section.title}
                    </h3>

                    {/* Section Items */}
                    {section.items.map((item) => {
                      // Apply permission guard for developer settings
                      if (item.id === 'developer') {
                        return (
                          <PermissionGate key={item.id} permission="access_developer_settings" mode="hide">
                            <SettingsNavItem
                              item={item}
                              active={activeSettingsPage === item.id}
                              onClick={() => handleSettingsNavigate(item.id)}
                            />
                          </PermissionGate>
                        );
                      }

                      // Render other items normally
                      return (
                        <SettingsNavItem
                          key={item.id}
                          item={item}
                          active={activeSettingsPage === item.id}
                          onClick={() => handleSettingsNavigate(item.id)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Main content area */}
            <div
              className="flex-1 overflow-auto"
              style={{
                fontFamily: 'Inter'
              }}
            >
              {renderSettingsContent()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;