import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { PermissionGate } from '../ui/PermissionGate';
import { User, Users, PaintBucket, Calendar, Network, Shield, Code, Database, Radio } from 'lucide-react';

// Import settings subpages
import Appearance from './Appearance';
import UserAccounts from './UserAccounts';
import RosterSettings from './RosterSettings';
import OrganizationSettings from './OrganizationSettings';
import EventSettings from './EventSettings';
import MissionDebriefingSettings from './MissionDebriefingSettings';
import MissionPrepSettings from './MissionPrepSettings';
import PermissionsSettings from './PermissionsSettings';
import DeveloperSettings from './DeveloperSettings';
import DCSReferenceSettings from './DCSReferenceSettings';

// Define the types of settings pages
type SettingsPage = 'roster' | 'organization' | 'events' | 'mission-prep' | 'mission-debriefing' | 'dcs-reference' | 'permissions' | 'appearance' | 'accounts' | 'developer';

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
        id: 'mission-prep',
        icon: <Radio size={20} />,
        label: 'Mission Preparation'
      },
      {
        id: 'mission-debriefing',
        icon: <Calendar size={20} />,
        label: 'Mission Debriefing'
      },
      {
        id: 'dcs-reference',
        icon: <Database size={20} />,
        label: 'DCS Reference Data'
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
          color: 'var(--rr-text3)',
          fontSize: '14px',
          fontFamily: 'inherit'
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
      case 'mission-prep':
        return <MissionPrepSettings error={error} setError={setError} />;
      case 'mission-debriefing':
        return <MissionDebriefingSettings error={error} setError={setError} />;
      case 'dcs-reference':
        return <DCSReferenceSettings error={error} setError={setError} />;
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
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease',
          borderRadius: '6px',
          marginBottom: '5px',
          height: '32px',
          gap: '5px',
          backgroundColor: active ? '#82728C' : isHovered ? 'var(--rr-panel2)' : 'transparent',
          color: active ? 'white' : 'var(--rr-text2)'
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
        backgroundColor: 'var(--rr-panel2)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 20px 20px 20px',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
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
          className="bg-panel rounded-lg shadow-rr overflow-hidden"
          style={{
            boxShadow: 'var(--rr-shadow)',
            borderRadius: '8px',
            backgroundColor: 'var(--rr-panel)',
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
                backgroundColor: 'var(--rr-panel)',
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
                      color: 'var(--rr-text3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '12px',
                      fontFamily: 'inherit'
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
                fontFamily: 'inherit'
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