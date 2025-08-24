import React, { createContext, useContext, useState } from 'react';

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
    
    // Reminder defaults
    firstReminderTime: { value: 15, unit: 'minutes' },
    firstReminderEnabled: true,
    secondReminderTime: { value: 3, unit: 'days' },
    secondReminderEnabled: true,
    sendRemindersToAccepted: true,
    sendRemindersToTentative: true,
    
    // Response grouping default
    groupResponsesByQualification: false
  }
};

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
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