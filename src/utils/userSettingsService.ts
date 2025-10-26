import { supabase } from './supabaseClient';
import { UserSettings, defaultUserSettings } from '../types/UserSettings';

export interface UserSettingsResponse {
  data?: UserSettings;
  error?: string;
  success: boolean;
}

// Cache for user settings to avoid repeated database calls
const userSettingsCache: Record<string, { data: UserSettings; timestamp: number }> = {};
const CACHE_DURATION = 30000; // 30 seconds

// Get user settings
export const getUserSettings = async (userId?: string): Promise<UserSettingsResponse> => {
  try {
    // If no userId provided, get current user
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      // Get user profile to get the profile ID
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
        
      if (profileError || !profile) {
        return { success: false, error: 'User profile not found' };
      }
      
      targetUserId = profile.id;
    }

    // Check cache first
    const cacheKey = targetUserId;
    const cached = userSettingsCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return { success: true, data: cached.data };
    }

    const { data: userProfile, error } = await supabase
      .from('user_profiles')
      .select('settings')
      .eq('id', targetUserId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Parse settings or use defaults
    const settings = userProfile?.settings as UserSettings || defaultUserSettings;
    
    // Merge with defaults to ensure all properties exist
    const mergedSettings: UserSettings = {
      developer: {
        ...defaultUserSettings.developer,
        ...settings.developer
      },
      preferences: {
        ...defaultUserSettings.preferences,
        ...settings.preferences,
        missionPrep: {
          ...defaultUserSettings.preferences?.missionPrep,
          ...settings.preferences?.missionPrep,
          autoAssignConfig: {
            ...defaultUserSettings.preferences?.missionPrep?.autoAssignConfig,
            ...settings.preferences?.missionPrep?.autoAssignConfig
          }
        },
        appearance: {
          ...defaultUserSettings.preferences?.appearance,
          ...settings.preferences?.appearance
        },
        eventDefaults: {
          ...defaultUserSettings.preferences?.eventDefaults,
          ...settings.preferences?.eventDefaults,
          firstReminderTime: {
            value: settings.preferences?.eventDefaults?.firstReminderTime?.value ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderTime?.value ?? 15,
            unit: settings.preferences?.eventDefaults?.firstReminderTime?.unit ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderTime?.unit ?? 'minutes'
          },
          secondReminderTime: {
            value: settings.preferences?.eventDefaults?.secondReminderTime?.value ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderTime?.value ?? 3,
            unit: settings.preferences?.eventDefaults?.secondReminderTime?.unit ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderTime?.unit ?? 'days'
          },
          firstReminderRecipients: {
            accepted: settings.preferences?.eventDefaults?.firstReminderRecipients?.accepted ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderRecipients?.accepted ?? true,
            tentative: settings.preferences?.eventDefaults?.firstReminderRecipients?.tentative ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderRecipients?.tentative ?? true,
            declined: settings.preferences?.eventDefaults?.firstReminderRecipients?.declined ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderRecipients?.declined ?? false,
            noResponse: settings.preferences?.eventDefaults?.firstReminderRecipients?.noResponse ?? defaultUserSettings.preferences?.eventDefaults?.firstReminderRecipients?.noResponse ?? false
          },
          secondReminderRecipients: {
            accepted: settings.preferences?.eventDefaults?.secondReminderRecipients?.accepted ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderRecipients?.accepted ?? true,
            tentative: settings.preferences?.eventDefaults?.secondReminderRecipients?.tentative ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderRecipients?.tentative ?? true,
            declined: settings.preferences?.eventDefaults?.secondReminderRecipients?.declined ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderRecipients?.declined ?? false,
            noResponse: settings.preferences?.eventDefaults?.secondReminderRecipients?.noResponse ?? defaultUserSettings.preferences?.eventDefaults?.secondReminderRecipients?.noResponse ?? false
          }
        }
      }
    };

    // Cache the result
    userSettingsCache[cacheKey] = {
      data: mergedSettings,
      timestamp: Date.now()
    };

    return { success: true, data: mergedSettings };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// Update user settings
export const updateUserSettings = async (settings: Partial<UserSettings>, userId?: string): Promise<UserSettingsResponse> => {
  try {
    // If no userId provided, get current user
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      // Get user profile to get the profile ID
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
        
      if (profileError || !profile) {
        return { success: false, error: 'User profile not found' };
      }
      
      targetUserId = profile.id;
    }

    // Get current settings
    const currentSettingsResult = await getUserSettings(targetUserId);
    if (!currentSettingsResult.success || !currentSettingsResult.data) {
      return currentSettingsResult;
    }

    // Deep merge the settings
    const updatedSettings: UserSettings = {
      developer: {
        ...currentSettingsResult.data.developer,
        ...settings.developer
      },
      preferences: {
        ...currentSettingsResult.data.preferences,
        ...settings.preferences,
        missionPrep: {
          ...currentSettingsResult.data.preferences?.missionPrep,
          ...settings.preferences?.missionPrep,
          autoAssignConfig: {
            ...currentSettingsResult.data.preferences?.missionPrep?.autoAssignConfig,
            ...settings.preferences?.missionPrep?.autoAssignConfig
          }
        },
        appearance: {
          ...currentSettingsResult.data.preferences?.appearance,
          ...settings.preferences?.appearance
        },
        eventDefaults: {
          ...currentSettingsResult.data.preferences?.eventDefaults,
          ...settings.preferences?.eventDefaults
        }
      }
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({ settings: updatedSettings as any })
      .eq('id', targetUserId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Clear cache for this user since settings were updated
    delete userSettingsCache[targetUserId];

    return { success: true, data: updatedSettings };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// Update only developer settings
export const updateDeveloperSettings = async (developerSettings: Partial<UserSettings['developer']>): Promise<UserSettingsResponse> => {
  // If updating bot token preference, apply globally to all users
  if (developerSettings?.discordBotToken !== undefined) {
    try {
      // Get all user profiles
      const { data: allProfiles, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, settings');

      if (fetchError) {
        console.error('[UPDATE-DEV-SETTINGS] Error fetching user profiles:', fetchError);
        return { success: false, error: fetchError.message };
      }

      if (allProfiles && allProfiles.length > 0) {
        console.log(`[UPDATE-DEV-SETTINGS] Updating bot token preference globally for ${allProfiles.length} users`);

        // Update each profile's bot token setting
        const newBotToken = developerSettings?.discordBotToken!; // Already checked !== undefined above
        const updates = allProfiles.map(async (profile) => {
          const currentSettings = profile.settings as UserSettings || defaultUserSettings;
          const updatedSettings: UserSettings = {
            ...currentSettings,
            developer: {
              ...(currentSettings.developer || {}),
              discordBotToken: newBotToken
            }
          };

          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ settings: updatedSettings as any })
            .eq('id', profile.id);

          if (updateError) {
            console.error(`[UPDATE-DEV-SETTINGS] Error updating profile ${profile.id}:`, updateError);
          }

          return updateError;
        });

        // Wait for all updates to complete
        const results = await Promise.all(updates);
        const failures = results.filter(err => err !== null);

        if (failures.length > 0) {
          console.error(`[UPDATE-DEV-SETTINGS] ${failures.length} profile updates failed`);
          return { success: false, error: `Failed to update ${failures.length} user profiles` };
        }

        console.log('[UPDATE-DEV-SETTINGS] Successfully updated bot token preference for all users');

        // Clear all user settings caches since we updated everyone
        Object.keys(userSettingsCache).forEach(key => delete userSettingsCache[key]);

        // Return the current user's updated settings
        return updateUserSettings({ developer: developerSettings });
      }
    } catch (err: any) {
      console.error('[UPDATE-DEV-SETTINGS] Unexpected error:', err);
      return { success: false, error: err.message };
    }
  }

  // For other developer settings, just update current user
  return updateUserSettings({ developer: developerSettings });
};

// Update only user preferences
export const updateUserPreferences = async (preferences: Partial<UserSettings['preferences']>): Promise<UserSettingsResponse> => {
  return updateUserSettings({ preferences });
};