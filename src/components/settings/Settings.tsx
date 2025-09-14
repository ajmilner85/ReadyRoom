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
import PermissionsSettings from './PermissionsSettings';
import DeveloperSettings from './DeveloperSettings';

// Define the types of settings pages
type SettingsPage = 'roster' | 'organization' | 'events' | 'permissions' | 'appearance' | 'accounts' | 'developer';

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
        label: 'Roster Settings'
      },
      {
        id: 'events',
        icon: <Calendar size={20} />,
        label: 'Events'
      }
    ]
  }
];

const Settings: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('roster');
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
    switch (activeSettingsPage) {
      case 'roster':
        return <RosterSettings error={error} setError={setError} />;
      case 'organization':
        return <OrganizationSettings error={error} setError={setError} />;
      case 'events':
        return <EventSettings error={error} setError={setError} />;
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
    return (
      <div 
        className={`flex items-center px-4 py-3 mb-2 cursor-pointer rounded-md ${
          active ? 'bg-[#82728C] text-white' : 'hover:bg-slate-100 text-[#64748B]'
        }`}
        onClick={onClick}
        style={{
          fontFamily: 'Inter',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease'
        }}
      >
        <div className="mr-3">{item.icon}</div>
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
        padding: '20px 0',
        boxSizing: 'border-box',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{
        maxWidth: '1350px',
        width: '100%',
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {/* Main settings card with navigation and content */}
        <Card 
          className="bg-white rounded-lg shadow-md overflow-hidden"
          style={{
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF'
          }}
        >
          <div style={{ padding: '24px' }}>
            <h1 style={{
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 300,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '24px'
            }}>
              Settings
            </h1>
            
            <div className="flex" style={{ height: 'calc(100vh - 170px)', maxHeight: 'calc(100vh - 170px)', overflow: 'hidden' }}>
              {/* Settings navigation sidebar */}
              <div
                className="w-64 p-6"
                style={{
                  borderRight: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  paddingRight: '16px',
                  paddingTop: '16px',
                }}
              >
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

              {/* Main content area */}
              <div 
                className="flex-1 p-6 overflow-auto" 
                style={{ 
                  padding: '16px 24px',
                  fontFamily: 'Inter'
                }}
              >
                {renderSettingsContent()}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;