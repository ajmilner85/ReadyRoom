import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../../context/ShellContext';
import { EmptyState, Icon, IconName, Toast } from '../ui/primitives';
import { PermissionGate } from '../ui/PermissionGate';

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
  icon: IconName;
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
        icon: 'appearance',
        label: 'Appearance'
      },
      {
        id: 'accounts',
        icon: 'user',
        label: 'Account'
      },
      {
        id: 'developer',
        icon: 'code',
        label: 'Developer Settings'
      }
    ]
  },
  {
    title: 'Organization',
    items: [
      {
        id: 'permissions',
        icon: 'shieldCheck',
        label: 'Permissions'
      },
      {
        id: 'organization',
        icon: 'orgStructure',
        label: 'Organization Structure'
      },
      {
        id: 'roster',
        icon: 'userSingle',
        label: 'Roster'
      },
      {
        id: 'events',
        icon: 'events',
        label: 'Events'
      },
      {
        id: 'mission-prep',
        icon: 'radio',
        label: 'Mission Preparation'
      },
      {
        id: 'mission-debriefing',
        icon: 'message',
        label: 'Mission Debriefing'
      },
      {
        id: 'dcs-reference',
        icon: 'table',
        label: 'DCS Reference Data'
      }
    ]
  }
];

const Settings: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const ALL_PAGES = settingsNavSections.flatMap(sec => sec.items);
  const sectionParam = searchParams.get('section') as SettingsPage | null;
  const activeSettingsPage: SettingsPage | null = ALL_PAGES.some(i => i.id === sectionParam) ? sectionParam : null;
  const activeItem = ALL_PAGES.find(i => i.id === activeSettingsPage);
  usePageHeader({ code: 'ADMIN', title: 'Settings', meta: activeItem ? `· ${activeItem.label}` : undefined });
  const [error, setError] = useState<string | null>(null);

  // Clear page loading immediately since settings load fast
  useEffect(() => {
    setPageLoading('admin', false);
  }, [setPageLoading]);

  // Navigate between settings pages
  const handleSettingsNavigate = (page: SettingsPage) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', page);
    setSearchParams(next, { replace: true });
  };

  // Render content based on active settings page
  const renderSettingsContent = () => {
    if (!activeSettingsPage) {
      return (
        <div className="h-full flex items-center justify-center">
          <EmptyState icon="settings" title="Settings" message="Choose a section on the left." />
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

  // Settings navigation item (kit rail row: icon + label, active = accent-weak + 3px accent border)
  const SettingsNavItem: React.FC<{ item: SettingsNavItem; active: boolean; onClick: () => void }> = ({ item, active, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-[10px] px-[9px] py-2 mb-[2px] rounded-rr-ctl border-0 cursor-pointer text-left transition-colors ${active ? 'bg-accent-weak' : 'bg-transparent hover:bg-panel2'}`}
      style={{ borderLeft: `3px solid ${active ? 'var(--rr-accent-text)' : 'transparent'}` }}
    >
      <span className="w-5 h-5 flex items-center justify-center flex-none" style={{ color: active ? 'var(--rr-accent-text)' : 'var(--rr-text3)' }}>
        <Icon name={item.icon} size={17} />
      </span>
      <span className="text-[13px]" style={{ fontWeight: active ? 600 : 500, color: active ? 'var(--rr-text)' : 'var(--rr-text2)' }}>{item.label}</span>
    </button>
  );

  return (
    <div data-m="row" className="flex-1 min-h-0 flex gap-[14px] p-[14px]">
      {error ? (
        <div className="fixed top-16 right-5 z-[1000] max-w-[420px]">
          <Toast tone="bad" onDismiss={() => setError(null)}>{error}</Toast>
        </div>
      ) : null}
      <aside className="flex-none w-[230px] bg-panel border border-border rounded-rr-xl shadow-rr flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-[10px]">
          {settingsNavSections.map((section) => (
            <div key={section.title}>
              <div className="px-2 pt-3 pb-[6px] font-mono text-[9.5px] tracking-[.14em] uppercase text-text3">{section.title}</div>
              {section.items.map((item) => {
                const row = (
                  <SettingsNavItem
                    key={item.id}
                    item={item}
                    active={activeSettingsPage === item.id}
                    onClick={() => handleSettingsNavigate(item.id)}
                  />
                );
                // Developer settings stay permission-gated
                return item.id === 'developer' ? (
                  <PermissionGate key={item.id} permission="access_developer_settings" mode="hide">{row}</PermissionGate>
                ) : row;
              })}
            </div>
          ))}
        </div>
      </aside>
      <section className="flex-1 min-w-0 bg-panel border border-border rounded-rr-xl shadow-rr flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {renderSettingsContent()}
        </div>
      </section>
    </div>
  );
};

export default Settings;