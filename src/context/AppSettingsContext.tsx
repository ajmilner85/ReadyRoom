import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserSettings, updateUserSettings } from '../utils/userSettingsService';
import type { SupportRoleRequirement } from '../utils/supabaseClient';

export type ThemeMode = 'dark' | 'light';
export type NavLayout = 'rail' | 'compact' | 'bar';

const THEME_STORAGE_KEY = 'rr-theme';
const NAV_STORAGE_KEY = 'rr-nav-layout';

function readLocal<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export interface AppSettings {
  displayPilotsWithSquadronColors: boolean;
  interfaceThemeUsesSquadronColors: boolean;
  /** Per-user colour theme (stored in preferences.appearance.theme). */
  theme: ThemeMode;
  /** Per-user navigation layout (stored in preferences.appearance.navLayout). */
  navLayout: NavLayout;
  /** Personal accent override (hex); null = use squadron colour. */
  accentColor: string | null;
  
  // Event Settings
  eventDefaults: {
    // Timing and Duration
    defaultStartDayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    defaultStartTime: string; // HH:MM format
    defaultDurationHours: number;
    defaultDurationMinutes: number;
    referenceTimezone: string; // IANA timezone identifier

    // Reminders
    firstReminderTime: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    firstReminderEnabled: boolean;
    secondReminderTime: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    secondReminderEnabled: boolean;

    // Granular reminder recipients
    firstReminderRecipients: {
      accepted: boolean;
      tentative: boolean;
      declined: boolean;
      noResponse: boolean;
    };
    secondReminderRecipients: {
      accepted: boolean;
      tentative: boolean;
      declined: boolean;
      noResponse: boolean;
    };
    
    // Initial notification roles
    initialNotificationRoles: Array<{ id: string; name: string }>;

    // Legacy reminder recipient settings (kept for backwards compatibility)
    sendRemindersToAccepted: boolean;
    sendRemindersToTentative: boolean;

    // Response Options
    allowTentativeResponse: boolean;

    // Response Grouping
    groupResponsesByQualification: boolean;
    groupBySquadron: boolean;
    showNoResponse: boolean;

    // Mission Support role requirements (array order = display order)
    defaultSupportRoleRequirements: SupportRoleRequirement[];

    // Reference Materials
    defaultReferenceMaterialTypes: string[];

    // Scheduled Publication
    scheduledPublicationEnabledByDefault: boolean;
    scheduledPublicationOffset: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };

    // Mission Debriefing
    aarOperationalOnlyByDefault: boolean; // Whether AAR should show only operational squadron flights by default
  };
}

interface AppSettingsContextType {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const defaultSettings: AppSettings = {
  displayPilotsWithSquadronColors: true,
  interfaceThemeUsesSquadronColors: true,
  theme: 'dark',
  navLayout: 'rail',
  accentColor: null,

  eventDefaults: {
    // Timing and Duration defaults
    defaultStartDayOfWeek: 'Thursday',
    defaultStartTime: '20:30',
    defaultDurationHours: 2,
    defaultDurationMinutes: 0,
    referenceTimezone: 'America/New_York',

    // Reminder defaults
    firstReminderTime: { value: 3, unit: 'days' },
    firstReminderEnabled: true,
    secondReminderTime: { value: 15, unit: 'minutes' },
    secondReminderEnabled: true,

    // Granular reminder recipients defaults
    firstReminderRecipients: {
      accepted: false,
      tentative: true,
      declined: false,
      noResponse: true
    },
    secondReminderRecipients: {
      accepted: true,
      tentative: true,
      declined: false,
      noResponse: false
    },

    // Initial notification roles default
    initialNotificationRoles: [{ id: '994833914516475984', name: 'Cadre' }],

    // Legacy reminder recipient settings (for backwards compatibility)
    sendRemindersToAccepted: true,
    sendRemindersToTentative: true,

    // Response options default
    allowTentativeResponse: false,

    // Response grouping default (ALL ENABLED by default)
    groupResponsesByQualification: true,
    groupBySquadron: true,
    showNoResponse: true,

    // Mission Support role requirements default
    defaultSupportRoleRequirements: [],

    // Reference materials default
    defaultReferenceMaterialTypes: [
      'Student Reference Sheet',
      'Briefing Slides',
      'Video',
      'Document'
    ],

    // Scheduled publication defaults
    scheduledPublicationEnabledByDefault: false,
    scheduledPublicationOffset: { value: 15, unit: 'minutes' },

    // Mission debriefing defaults
    aarOperationalOnlyByDefault: true // Show only operational squadron AARs by default
  }
};

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme/nav are cached locally so the first paint matches the user's last choice;
  // the database preference is authoritative once loaded.
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...defaultSettings,
    theme: readLocal<ThemeMode>(THEME_STORAGE_KEY, ['dark', 'light'], defaultSettings.theme),
    navLayout: readLocal<NavLayout>(NAV_STORAGE_KEY, ['rail', 'compact', 'bar'], defaultSettings.navLayout),
  }));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    writeLocal(THEME_STORAGE_KEY, settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    writeLocal(NAV_STORAGE_KEY, settings.navLayout);
  }, [settings.navLayout]);

  // Load settings from user preferences on initialization
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const settingsResult = await getUserSettings();
        if (settingsResult.success && settingsResult.data?.preferences) {
          const prefs = settingsResult.data.preferences;
          
          setSettings(prev => ({
            ...prev,
            displayPilotsWithSquadronColors:
              prefs.appearance?.displayPilotsWithSquadronColors ?? prev.displayPilotsWithSquadronColors,
            interfaceThemeUsesSquadronColors:
              prefs.appearance?.interfaceThemeUsesSquadronColors ?? prev.interfaceThemeUsesSquadronColors,
            theme: prefs.appearance?.theme ?? prev.theme,
            navLayout: prefs.appearance?.navLayout ?? prev.navLayout,
            accentColor: prefs.appearance?.accentColor ?? prev.accentColor,
            eventDefaults: {
              ...prev.eventDefaults,
              ...(prefs.eventDefaults || {})
            }
          }));
        }
      } catch (error) {
        console.warn('Failed to load settings from user preferences:', error);
      }
    };

    loadUserPreferences();
  }, []);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    // Update local state immediately
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));

    // Save to user preferences based on setting type
    if (
      key === 'displayPilotsWithSquadronColors' ||
      key === 'interfaceThemeUsesSquadronColors' ||
      key === 'theme' ||
      key === 'navLayout' ||
      key === 'accentColor'
    ) {
      try {
        await updateUserSettings({
          preferences: {
            appearance: {
              [key]: value
            }
          }
        });
      } catch (error) {
        console.warn(`Failed to save ${key} to user preferences:`, error);
      }
    } else if (key === 'eventDefaults') {
      try {
        await updateUserSettings({
          preferences: {
            eventDefaults: value as any
          }
        });
      } catch (error) {
        console.warn('Failed to save eventDefaults to user preferences:', error);
      }
    }
  };

  return (
    <AppSettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return context;
};