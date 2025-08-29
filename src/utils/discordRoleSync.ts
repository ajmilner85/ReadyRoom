// import { supabase } from './supabaseClient';
import { UserProfile } from './userProfileService';

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
  guildId: string,
  botToken: string
): Promise<{ roles: UserDiscordRole[]; error?: string }> {
  try {
    // Note: This requires a Discord bot token and would typically be done server-side
    // For now, this is a placeholder that would need to be implemented with your Discord bot
    
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    const memberData = await response.json();
    
    // Get role details
    const guildResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!guildResponse.ok) {
      throw new Error(`Discord API error: ${guildResponse.status}`);
    }

    const allRoles = await guildResponse.json();
    
    // Filter to get only the roles this user has
    const userRoles = allRoles.filter((role: any) => 
      memberData.roles.includes(role.id)
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

  // TODO: Get Discord guild ID and bot token from environment/config
  const guildId = import.meta.env.VITE_DISCORD_GUILD_ID;
  const botToken = import.meta.env.VITE_DISCORD_BOT_TOKEN;

  if (!guildId || !botToken) {
    // Discord role sync is optional - no need to warn about this
    return false;
  }

  try {
    const { roles, error: fetchError } = await fetchUserDiscordRoles(
      userProfile.discordId,
      guildId,
      botToken
    );

    if (fetchError) {
      console.error('Failed to fetch Discord roles:', fetchError);
      return false;
    }

    const { success, error: syncError } = await syncUserDiscordRoles(userProfile, roles);
    
    if (!success) {
      console.error('Failed to sync Discord roles:', syncError);
      return false;
    }

    return true;

  } catch (error) {
    console.error('Error during role sync:', error);
    return false;
  }
}