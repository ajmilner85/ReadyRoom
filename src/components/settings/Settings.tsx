import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { User, Users, Building, Plane, PaintBucket, Calendar, Network, Shield } from 'lucide-react';

// Import settings subpages
import SquadronSettings from './SquadronSettings';
import MissionDefaults from './MissionDefaults';
import Appearance from './Appearance';
import UserAccounts from './UserAccounts';
import RosterSettings from './RosterSettings';
import OrganizationSettings from './OrganizationSettings';
import EventSettings from './EventSettings';
import PermissionsSettings from './PermissionsSettings';

// Define the types of settings pages
type SettingsPage = 'roster' | 'squadron' | 'organization' | 'mission' | 'events' | 'permissions' | 'appearance' | 'accounts';

interface SettingsNavItem {
  id: SettingsPage;
  icon: React.ReactNode;
  label: string;
}

// Navigation items for the settings sidebar
const settingsNavItems: SettingsNavItem[] = [
  {
    id: 'roster',
    icon: <Users size={20} />,
    label: 'Roster Settings'
  },
  {
    id: 'squadron',
    icon: <Building size={20} />,
    label: 'Squadron Administration'
  },
  {
    id: 'organization',
    icon: <Network size={20} />,
    label: 'Organization'
  },
  {
    id: 'mission',
    icon: <Plane size={20} />,
    label: 'Mission Defaults'
  },
  {
    id: 'events',
    icon: <Calendar size={20} />,
    label: 'Events'
  },
  {
    id: 'permissions',
    icon: <Shield size={20} />,
    label: 'Permissions'
  },
  {
    id: 'appearance',
    icon: <PaintBucket size={20} />,
    label: 'Appearance'
  },
  {
    id: 'accounts',
    icon: <User size={20} />,
    label: 'Account'
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
      case 'squadron':
        return <SquadronSettings error={error} setError={setError} />;
      case 'organization':
        return <OrganizationSettings error={error} setError={setError} />;
      case 'mission':
        return <MissionDefaults error={error} setError={setError} />;
      case 'events':
        return <EventSettings error={error} setError={setError} />;
      case 'permissions':
        return <PermissionsSettings />;
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
                {settingsNavItems.map((item) => (
                  <SettingsNavItem 
                    key={item.id}
                    item={item}
                    active={activeSettingsPage === item.id}
                    onClick={() => handleSettingsNavigate(item.id)}
                  />
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