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

    // Legacy reminder recipient settings (kept for backwards compatibility)
    sendRemindersToAccepted: boolean;
    sendRemindersToTentative: boolean;

    // Response Grouping
    groupResponsesByQualification: boolean;
  };
}

interface AppSettingsContextType {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const defaultSettings: AppSettings = {
  displayPilotsWithSquadronColors: true,
  interfaceThemeUsesSquadronColors: false,
  
  eventDefaults: {
    // Timing and Duration defaults
    defaultStartDayOfWeek: 'Friday',
    defaultStartTime: '20:00',
    defaultDurationHours: 2,
    defaultDurationMinutes: 0,
    referenceTimezone: 'America/New_York',

    // Reminder defaults
    firstReminderTime: { value: 15, unit: 'minutes' },
    firstReminderEnabled: true,
    secondReminderTime: { value: 3, unit: 'days' },
    secondReminderEnabled: true,

    // Granular reminder recipients defaults
    firstReminderRecipients: {
      accepted: true,
      tentative: true,
      declined: false,
      noResponse: false
    },
    secondReminderRecipients: {
      accepted: true,
      tentative: true,
      declined: false,
      noResponse: false
    },

    // Legacy reminder recipient settings (for backwards compatibility)
    sendRemindersToAccepted: true,
    sendRemindersToTentative: true,

    // Response grouping default
    groupResponsesByQualification: false
  }
};

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  // Load appearance settings from user preferences on initialization
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const settingsResult = await getUserSettings();
        if (settingsResult.success && settingsResult.data?.preferences?.appearance) {
          setSettings(prev => ({
            ...prev,
            displayPilotsWithSquadronColors:
              settingsResult.data?.preferences?.appearance?.displayPilotsWithSquadronColors ?? prev.displayPilotsWithSquadronColors,
            interfaceThemeUsesSquadronColors:
              settingsResult.data?.preferences?.appearance?.interfaceThemeUsesSquadronColors ?? prev.interfaceThemeUsesSquadronColors,
          }));
        }
      } catch (error) {
        console.warn('Failed to load appearance settings from user preferences:', error);
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

    // Save to user preferences if it's an appearance setting
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