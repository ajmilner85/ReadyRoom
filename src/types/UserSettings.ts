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
  // Add more preferences as needed
}

// Default settings for new users
export const defaultUserSettings: UserSettings = {
  developer: {
    discordBotToken: 'development'
  },
  preferences: {
    theme: 'light',
    notifications: true
  }
};