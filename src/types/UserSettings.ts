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
    }
  }
};