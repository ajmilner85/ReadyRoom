import { supabase } from './supabaseClient';
import { fetchDiscordGuildMembers, type DiscordMember } from './discordPilotService';
import { getUserProfile, createOrUpdateUserProfile } from './userProfileService';

export interface AuthDiscordSyncResult {
  authenticatedUsersUpdated: number;
  newPilotsSuggested: number;
  existingPilotsLinked: number;
  errors: string[];
}

/**
 * Sync Discord server members with authenticated user profiles
 * This function bridges the gap between Discord OAuth users and Discord server members
 */
export async function syncAuthenticatedUsersWithDiscord(): Promise<AuthDiscordSyncResult> {
  const result: AuthDiscordSyncResult = {
    authenticatedUsersUpdated: 0,
    newPilotsSuggested: 0,
    existingPilotsLinked: 0,
    errors: []
  };

  try {
    // Get all authenticated user profiles
    const { data: userProfiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*');

    if (profilesError) {
      throw new Error(`Failed to fetch user profiles: ${profilesError.message}`);
    }

    // Get Discord server members
    const discordMembers = await fetchDiscordGuildMembers();

    // Create a map of Discord members by ID for quick lookup
    const discordMemberMap = new Map<string, DiscordMember>();
    discordMembers.forEach(member => {
      discordMemberMap.set(member.id, member);
    });

    // Process each authenticated user profile
    for (const profile of userProfiles || []) {
      try {
        let updated = false;

        // If user has a Discord ID, check if they're in the server
        if (profile.discord_id) {
          const discordMember = discordMemberMap.get(profile.discord_id);
          
          if (discordMember) {
            // User is in Discord server, update their profile with latest Discord info
            const updates: any = {};

            // Update Discord username if changed
            if (discordMember.username !== profile.discord_username) {
              updates.discord_username = discordMember.username;
              updated = true;
            }

            // Update callsign/board number from Discord display name if not already set
            if (!profile.pilot?.callsign && discordMember.callsign) {
              // Note: updating pilot data would need to be done through pilot table, not user_profiles
              // updates.callsign = discordMember.callsign;
              // updated = true;
            }

            if (!profile.pilot?.boardNumber && discordMember.boardNumber) {
              // Note: updating pilot data would need to be done through pilot table, not user_profiles
              // updates.board_number = discordMember.boardNumber;
              // updated = true;
            }

            // If user doesn't have a linked pilot but Discord member suggests one
            if (!profile.pilot_id && discordMember.boardNumber && discordMember.callsign) {
              const matchingPilot = await findPilotByBoardNumberAndCallsign(
                discordMember.boardNumber, 
                discordMember.callsign
              );
              
              if (matchingPilot) {
                updates.pilot_id = matchingPilot.id;
                updated = true;
                result.existingPilotsLinked++;
              }
            }

            // Apply updates if any
            if (updated) {
              updates.updated_at = new Date().toISOString();
              
              const { error: updateError } = await supabase
                .from('user_profiles')
                .update(updates)
                .eq('id', profile.id);

              if (updateError) {
                result.errors.push(`Failed to update profile for ${profile.discord_username}: ${updateError.message}`);
              } else {
                result.authenticatedUsersUpdated++;
              }
            }
          }
        }
      } catch (error: any) {
        result.errors.push(`Error processing profile ${profile.id}: ${error.message}`);
      }
    }

    // Check for Discord members who might need pilot records but aren't authenticated yet
    for (const [discordId, member] of discordMemberMap) {
      const hasAuthenticatedUser = userProfiles?.some(profile => profile.discord_id === discordId);
      
      if (!hasAuthenticatedUser && member.boardNumber && member.callsign) {
        // This Discord member could be a pilot but isn't authenticated yet
        const existingPilot = await findPilotByBoardNumberAndCallsign(
          member.boardNumber, 
          member.callsign
        );
        
        if (!existingPilot) {
          // Suggest creating a new pilot record
          result.newPilotsSuggested++;
        }
      }
    }

    return result;

  } catch (error: any) {
    result.errors.push(`Sync failed: ${error.message}`);
    return result;
  }
}

/**
 * Find pilot by board number and callsign
 */
async function findPilotByBoardNumberAndCallsign(boardNumber: string, callsign: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select('*')
      .eq('boardNumber', parseInt(boardNumber))
      .ilike('callsign', callsign)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error finding pilot:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in findPilotByBoardNumberAndCallsign:', error);
    return null;
  }
}

/**
 * Link an authenticated user with a pilot record
 */
export async function linkUserToPilot(authUserId: string, pilotId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        pilot_id: pilotId,
        updated_at: new Date().toISOString()
      })
      .eq('auth_user_id', authUserId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get Discord server membership status for authenticated users
 */
export async function getDiscordMembershipStatus(): Promise<{
  totalAuthenticatedUsers: number;
  usersInDiscordServer: number;
  usersWithLinkedPilots: number;
  usersNeedingPilotLinks: number;
}> {
  try {
    // Get all user profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('discord_id, pilot_id');

    if (profilesError) {
      throw profilesError;
    }

    // Get Discord server members
    const discordMembers = await fetchDiscordGuildMembers();
    const discordMemberIds = new Set(discordMembers.map(m => m.id));

    const totalAuthenticatedUsers = profiles?.length || 0;
    const usersInDiscordServer = profiles?.filter(p => p.discord_id && discordMemberIds.has(p.discord_id)).length || 0;
    const usersWithLinkedPilots = profiles?.filter(p => p.pilot_id).length || 0;
    const usersNeedingPilotLinks = profiles?.filter(p => p.discord_id && discordMemberIds.has(p.discord_id) && !p.pilot_id).length || 0;

    return {
      totalAuthenticatedUsers,
      usersInDiscordServer,
      usersWithLinkedPilots,
      usersNeedingPilotLinks
    };

  } catch (error: any) {
    console.error('Error getting Discord membership status:', error);
    return {
      totalAuthenticatedUsers: 0,
      usersInDiscordServer: 0,
      usersWithLinkedPilots: 0,
      usersNeedingPilotLinks: 0
    };
  }
}