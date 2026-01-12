// import { supabase } from './supabaseClient';
import { UserProfile } from './userProfileService';
import { getUserSettings } from './userSettingsService';

export interface DiscordRoleMapping {
  id: string;
  squadronId: string;
  discordRoleId: string;
  discordRoleName: string;
  appPermission: 'admin' | 'flight_lead' | 'member' | 'guest';
  priority: number;
}

export interface UserDiscordRole {
  id: string;
  name: string;
  permissions: string;
}

// Helper function to get the Discord bot environment from user settings
async function getDiscordEnvironment(): Promise<'development' | 'production'> {
  try {
    const settingsResult = await getUserSettings();
    if (settingsResult.success && settingsResult.data?.developer?.discordBotToken) {
      return settingsResult.data.developer.discordBotToken;
    }
  } catch (error) {
    console.warn('Failed to get user Discord environment setting:', error);
  }
  
  return 'development';
}

// Helper function to get the appropriate API base URL
// This should ALWAYS use VITE_API_URL - backend and bot connections are decoupled
function getDiscordApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

// Helper function to add Discord environment to API request headers
async function getDiscordHeaders(): Promise<Record<string, string>> {
  const environment = await getDiscordEnvironment();
  return {
    'Content-Type': 'application/json',
    'X-Discord-Environment': environment
  };
}

/**
 * Sync user's Discord roles with application permissions
 */
export async function syncUserDiscordRoles(
  userProfile: UserProfile,
  userDiscordRoles: UserDiscordRole[]
): Promise<{ success: boolean; error?: string; updatedPermission?: string }> {
  try {
    if (!userProfile.discordId) {
      return { success: false, error: 'User does not have Discord linked' };
    }

    // Get squadron role mappings for the user's squadron(s)
    // TODO: In the future, we might need to determine which squadron the user belongs to
    // For now, we'll get all role mappings and find the highest priority match
    
    // TODO: Fix table name - squadron_discord_role_mappings doesn't exist in current schema
    // const { data: roleMappings, error: mappingsError } = await supabase
    //   .from('squadron_discord_role_mappings')
    //   .select('*')
    //   .order('priority', { ascending: true }); // Lower priority number = higher priority

    // if (mappingsError) {
    //   console.error('Error fetching role mappings:', mappingsError);
    //   return { success: false, error: 'Failed to fetch role mappings' };
    // }
    
    const roleMappings: any[] = []; // Temporary fix - empty array

    if (!roleMappings || roleMappings.length === 0) {
      // No role mappings configured, user keeps current permissions
      return { success: true };
    }

    // Find the highest priority role mapping that matches user's Discord roles
    let bestMatch: DiscordRoleMapping | null = null;
    
    for (const mapping of roleMappings) {
      const hasRole = userDiscordRoles.some(role => role.id === mapping.discord_role_id);
      if (hasRole) {
        if (!bestMatch || mapping.priority < bestMatch.priority) {
          bestMatch = mapping;
        }
      }
    }

    // Determine the permission level
    let newPermission: 'admin' | 'flight_lead' | 'member' | 'guest' = 'guest';
    
    if (bestMatch) {
      newPermission = bestMatch.appPermission;
    } else if (userProfile.pilot) {
      // User has pilot record but no matching Discord roles - they're at least a member
      newPermission = 'member';
    }

    // Update user's permission level in the database
    // TODO: Verify correct column name for app_permission in user_profiles table
    // const { error: updateError } = await supabase
    //   .from('user_profiles')
    //   .update({ 
    //     app_permission: newPermission,
    //     last_role_sync: new Date().toISOString()
    //   })
    //   .eq('id', userProfile.id);

    // if (updateError) {
    //   console.error('Error updating user permissions:', updateError);
    //   return { success: false, error: 'Failed to update user permissions' };
    // }
    
    console.log(`[ROLE-SYNC] Would update user ${userProfile.id} permission to ${newPermission}`);

    return { 
      success: true, 
      updatedPermission: newPermission 
    };

  } catch (error: any) {
    console.error('Error syncing Discord roles:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch user's current Discord roles from Discord API
 * This would be called periodically or when user logs in
 */
export async function fetchUserDiscordRoles(
  discordId: string,
  guildId: string
): Promise<{ roles: UserDiscordRole[]; error?: string }> {
  try {
    const baseUrl = getDiscordApiBaseUrl();
    const headers = await getDiscordHeaders();
    
    // Get user's member data from backend API
    const memberResponse = await fetch(
      `${baseUrl}/api/discord/guild/${guildId}/member/${discordId}`,
      { headers }
    );

    if (!memberResponse.ok) {
      const errorData = await memberResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Member API error: ${memberResponse.status}`);
    }

    const memberData = await memberResponse.json();
    
    // Get all guild roles from backend API
    const rolesResponse = await fetch(
      `${baseUrl}/api/discord/guild/${guildId}/roles`,
      { headers }
    );

    if (!rolesResponse.ok) {
      const errorData = await rolesResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Roles API error: ${rolesResponse.status}`);
    }

    const rolesData = await rolesResponse.json();
    const allRoles = rolesData.roles || [];
    
    // Filter to get only the roles this user has
    const userRoleIds = memberData.member?.roles || [];
    const userRoles = allRoles.filter((role: any) => 
      userRoleIds.includes(role.id)
    ).map((role: any) => ({
      id: role.id,
      name: role.name,
      permissions: role.permissions
    }));

    return { roles: userRoles };

  } catch (error: any) {
    console.error('Error fetching Discord roles:', error);
    return { roles: [], error: error.message };
  }
}

/**
 * Check if role sync should be performed
 * This prevents excessive API calls by checking when last sync occurred
 */
export function shouldSyncRoles(userProfile: UserProfile): boolean {
  if (!userProfile.lastRoleSync) {
    return true; // Never synced before
  }

  const lastSync = new Date(userProfile.lastRoleSync);
  const now = new Date();
  const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

  // Sync if it's been more than 1 hour since last sync
  return hoursSinceLastSync > 1;
}

/**
 * Trigger role sync for a user
 * This would be called during login or periodically
 */
export async function triggerRoleSync(userProfile: UserProfile): Promise<boolean> {
  if (!shouldSyncRoles(userProfile)) {
    return true; // No sync needed
  }

  if (!userProfile.discordId) {
    return true; // No Discord account to sync
  }

  try {
    const baseUrl = getDiscordApiBaseUrl();
    const headers = await getDiscordHeaders();

    // Get all Discord servers this user has access to
    const serversResponse = await fetch(`${baseUrl}/api/discord/servers`, { headers });
    
    if (!serversResponse.ok) {
      console.error('Failed to fetch Discord servers for role sync');
      return false;
    }

    const serversData = await serversResponse.json();
    const servers = serversData.guilds || [];

    if (servers.length === 0) {
      console.log('No Discord servers found for role sync');
      return true; // No servers to sync, but not an error
    }

    // Sync roles for each server the user has access to
    let overallSuccess = true;
    for (const server of servers) {
      try {
        const { roles, error: fetchError } = await fetchUserDiscordRoles(
          userProfile.discordId,
          server.id
        );

        if (fetchError) {
          console.error(`Failed to fetch Discord roles for server ${server.name}:`, fetchError);
          overallSuccess = false;
          continue;
        }

        const { success, error: syncError } = await syncUserDiscordRoles(userProfile, roles);
        
        if (!success) {
          console.error(`Failed to sync Discord roles for server ${server.name}:`, syncError);
          overallSuccess = false;
        }
      } catch (serverError) {
        console.error(`Error syncing roles for server ${server.name}:`, serverError);
        overallSuccess = false;
      }
    }

    return overallSuccess;
  } catch (error) {
    console.error('Error during role sync:', error);
    return false;
  }
}