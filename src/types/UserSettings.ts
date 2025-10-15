// User Settings Types
export interface UserSettings {
  developer?: DeveloperSettings;
  preferences?: UserPreferences;
}

export interface DeveloperSettings {
  discordBotToken?: 'development' | 'production';
}

export interface UserPreferences {
  theme?: 'light' | 'dark';
  notifications?: boolean;

  // Mission Preparation preferences
  missionPrep?: {
    autoAssignConfig?: {
      assignmentScope?: 'clear' | 'fillGaps';
      includeTentative?: boolean;
      flightFillingPriority?: 'breadth' | 'depth';
      squadronCohesion?: 'enforced' | 'prioritized' | 'ignore';
      assignUnqualified?: boolean;
      nonStandardCallsigns?: 'ignore' | 'fillLast' | 'fillInSequence' | 'fillFirst';
    };
  };

  // Appearance preferences
  appearance?: {
    displayPilotsWithSquadronColors?: boolean;
    interfaceThemeUsesSquadronColors?: boolean;
  };

  // Event defaults
  eventDefaults?: {
    defaultStartDayOfWeek?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    defaultStartTime?: string;
    defaultDurationHours?: number;
    defaultDurationMinutes?: number;
    referenceTimezone?: string;
    firstReminderTime?: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    firstReminderEnabled?: boolean;
    secondReminderTime?: {
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    secondReminderEnabled?: boolean;
    firstReminderRecipients?: {
      accepted: boolean;
      tentative: boolean;
      declined: boolean;
      noResponse: boolean;
    };
    secondReminderRecipients?: {
      accepted: boolean;
      tentative: boolean;
      declined: boolean;
      noResponse: boolean;
    };
    initialNotificationRoles?: Array<{ id: string; name: string }>;
    sendRemindersToAccepted?: boolean;
    sendRemindersToTentative?: boolean;
    groupResponsesByQualification?: boolean;
    groupBySquadron?: boolean;
  };
}

// Default settings for new users
export const defaultUserSettings: UserSettings = {
  developer: {
    discordBotToken: 'development'
  },
  preferences: {
    theme: 'light',
    notifications: true,
    missionPrep: {
      autoAssignConfig: {
        assignmentScope: 'clear',
        includeTentative: false,
        flightFillingPriority: 'breadth',
        squadronCohesion: 'enforced',
        assignUnqualified: false,
        nonStandardCallsigns: 'ignore'
      }
    },
    appearance: {
      displayPilotsWithSquadronColors: true,
      interfaceThemeUsesSquadronColors: false
    },
    eventDefaults: {
      defaultStartDayOfWeek: 'Friday',
      defaultStartTime: '20:00',
      defaultDurationHours: 2,
      defaultDurationMinutes: 0,
      referenceTimezone: 'America/New_York',
      firstReminderTime: { value: 15, unit: 'minutes' },
      firstReminderEnabled: true,
      secondReminderTime: { value: 3, unit: 'days' },
      secondReminderEnabled: true,
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
      initialNotificationRoles: [],
      sendRemindersToAccepted: true,
      sendRemindersToTentative: true,
      groupResponsesByQualification: false,
      groupBySquadron: false
    }
  }
};