import { supabase } from './supabaseClient';
import { UserSettings, defaultUserSettings } from '../types/UserSettings';

export interface UserSettingsResponse {
  data?: UserSettings;
  error?: string;
  success: boolean;
}

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
        ...settings.preferences
      }
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
        ...settings.preferences
      }
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({ settings: updatedSettings as any })
      .eq('id', targetUserId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: updatedSettings };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// Update only developer settings
export const updateDeveloperSettings = async (developerSettings: Partial<UserSettings['developer']>): Promise<UserSettingsResponse> => {
  return updateUserSettings({ developer: developerSettings });
};

// Update only user preferences
export const updateUserPreferences = async (preferences: Partial<UserSettings['preferences']>): Promise<UserSettingsResponse> => {
  return updateUserSettings({ preferences });
};