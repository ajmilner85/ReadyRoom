import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserSettings, updateUserSettings } from '../utils/userSettingsService';

export interface AppSettings {
  displayPilotsWithSquadronColors: boolean;
  interfaceThemeUsesSquadronColors: boolean;
  
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

    // Response Grouping
    groupResponsesByQualification: boolean;
    groupBySquadron: boolean;
    showNoResponse: boolean;

    // Reference Materials
    defaultReferenceMaterialTypes: string[];

    // Scheduled Publication
    scheduledPublicationEnabledByDefault: boolean;
    scheduledPublicationOffset: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
  };
}

interface AppSettingsContextType {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const defaultSettings: AppSettings = {
  displayPilotsWithSquadronColors: true,
  interfaceThemeUsesSquadronColors: true,

  eventDefaults: {
    // Timing and Duration defaults
    defaultStartDayOfWeek: 'Thursday',
    defaultStartTime: '20:30',
    defaultDurationHours: 2,
    defaultDurationMinutes: 0,
    referenceTimezone: 'America/New_York',

    // Reminder defaults
    firstReminderTime: { value: 2, unit: 'days' },
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
    initialNotificationRoles: [],

    // Legacy reminder recipient settings (for backwards compatibility)
    sendRemindersToAccepted: true,
    sendRemindersToTentative: true,

    // Response grouping default (ALL ENABLED by default)
    groupResponsesByQualification: true,
    groupBySquadron: true,
    showNoResponse: true,

    // Reference materials default
    defaultReferenceMaterialTypes: [
      'Student Reference Sheet',
      'Briefing Slides',
      'Video Tutorial',
      'Syllabus',
      'NATOPS Reference'
    ],

    // Scheduled publication defaults
    scheduledPublicationEnabledByDefault: false,
    scheduledPublicationOffset: { value: 4, unit: 'days' }
  }
};

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

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
    if (key === 'displayPilotsWithSquadronColors' || key === 'interfaceThemeUsesSquadronColors') {
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