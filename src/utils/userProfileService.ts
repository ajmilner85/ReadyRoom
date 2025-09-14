import { supabase } from './supabaseClient';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  authUserId: string;
  discordId?: string;
  discordUsername?: string;
  discordAvatarUrl?: string;
  discordGuilds?: string[];
  pilotId?: string;
  appPermission?: 'admin' | 'flight_lead' | 'member' | 'guest';
  lastRoleSync?: string;
  createdAt: string;
  updatedAt: string;
  // Pilot data (when joined)
  pilot?: {
    callsign: string;
    boardNumber: number;
    id: string;
    currentSquadron?: {
      id: string;
      name: string;
      designation: string;
      wing_id: string;
      tail_code?: string | null;
      established_date?: string | null;
      deactivated_date?: string | null;
      insignia_url?: string | null;
      carrier_id?: string | null;
      callsigns?: any;
      color_palette?: {
        primary?: string;
        secondary?: string;
        accent?: string;
      } | null;
      updated_at?: string | null;
    };
    billet?: string;
    currentStanding?: {
      id: string;
      name: string;
      order: number;
    };
    currentStatus?: {
      id: string;
      name: string;
      isActive: boolean;
      order: number;
    };
  };
}

export interface DiscordUserData {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  guilds?: Array<{
    id: string;
    name: string;
    permissions: string;
  }>;
}

/**
 * Create or update user profile after authentication
 */
export async function createOrUpdateUserProfile(user: User): Promise<{ profile: UserProfile | null; error: Error | null }> {
  try {
    // Check if user profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw fetchError;
    }

    // Extract Discord data from user metadata
    const discordData = extractDiscordData(user);
    
    // Try to find matching pilot record
    const { pilotId } = await findMatchingPilot(discordData);

    const profileData = {
      auth_user_id: user.id,
      discord_id: discordData?.id,
      discord_username: discordData?.username,
      discord_avatar_url: discordData?.avatar,
      discord_guilds: discordData?.guilds?.map(g => g.id) || [],
      pilot_id: pilotId,
      updated_at: new Date().toISOString()
    };

    let profile;

    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from('user_profiles')
        .update(profileData)
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (error) throw error;
      profile = data;
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          ...profileData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      profile = data;
    }

    // Update pilot record with Discord info if we found a match
    if (pilotId && discordData) {
      await updatePilotDiscordInfo(pilotId, discordData);
    }

    return { 
      profile: convertToUserProfile(profile), 
      error: null 
    };

  } catch (error: any) {
    console.error('Error creating/updating user profile:', error);
    return { 
      profile: null, 
      error: error 
    };
  }
}

/**
 * Extract Discord data from Supabase user metadata
 */
function extractDiscordData(user: User): DiscordUserData | null {
  // Check if user has Discord identity (either as primary or linked)
  const hasDiscord = user.app_metadata?.providers?.includes('discord') || 
                    user.identities?.some(i => i.provider === 'discord');
  
  if (hasDiscord && user.user_metadata) {
    return {
      id: user.user_metadata.provider_id || user.user_metadata.sub,
      username: user.user_metadata.name || user.user_metadata.user_name,
      discriminator: user.user_metadata.discriminator || '0000',
      avatar: user.user_metadata.avatar_url,
      guilds: user.user_metadata.guilds || []
    };
  }
  
  return null;
}

/**
 * Find matching pilot record based on Discord data
 */
async function findMatchingPilot(discordData: DiscordUserData | null): Promise<{ pilotId: string | null; pilotData: any | null }> {
  if (!discordData) {
    return { pilotId: null, pilotData: null };
  }

  try {
    // First try to match by Discord ID
    const { data: pilotByDiscord, error: discordError } = await supabase
      .from('pilots')
      .select('*')
      .or(`discord_original_id.eq.${discordData.id},discordId.eq.${discordData.username}`)
      .single();

    if (!discordError && pilotByDiscord) {
      return { pilotId: pilotByDiscord.id, pilotData: pilotByDiscord };
    }

    // If no direct match, try to match by username pattern (board number + callsign)
    const usernameMatch = discordData.username.match(/^(\d{3})[\s|\/\-_]+(.+)$/);
    if (usernameMatch) {
      const [, boardNumber, callsign] = usernameMatch;
      
      const { data: pilotByPattern, error: patternError } = await supabase
        .from('pilots')
        .select('*')
        .eq('boardNumber', parseInt(boardNumber))
        .ilike('callsign', callsign)
        .single();

      if (!patternError && pilotByPattern) {
        return { pilotId: pilotByPattern.id, pilotData: pilotByPattern };
      }
    }

    return { pilotId: null, pilotData: null };

  } catch (error) {
    console.error('Error finding matching pilot:', error);
    return { pilotId: null, pilotData: null };
  }
}

/**
 * Update pilot record with Discord information
 */
async function updatePilotDiscordInfo(pilotId: string, discordData: DiscordUserData): Promise<void> {
  try {
    const { error } = await supabase
      .from('pilots')
      .update({
        discord_original_id: discordData.id,
        discordId: discordData.username,
        updated_at: new Date().toISOString()
      })
      .eq('id', pilotId);

    if (error) {
      console.error('Error updating pilot Discord info:', error);
    }
  } catch (error) {
    console.error('Unexpected error updating pilot Discord info:', error);
  }
}

/**
 * Convert database record to UserProfile interface
 */
function convertToUserProfile(dbRecord: any): UserProfile {
  const profile: UserProfile = {
    id: dbRecord.id,
    authUserId: dbRecord.auth_user_id,
    discordId: dbRecord.discord_id,
    discordUsername: dbRecord.discord_username,
    discordAvatarUrl: dbRecord.discord_avatar_url,
    discordGuilds: dbRecord.discord_guilds || [],
    pilotId: dbRecord.pilot_id,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at
  };

  // Add pilot data if it exists in the join
  if (dbRecord.pilots) {
    profile.pilot = {
      id: dbRecord.pilots.id,
      callsign: dbRecord.pilots.callsign,
      boardNumber: dbRecord.pilots.boardNumber
    };

    // Find current squadron assignment (most recent active assignment)
    if (dbRecord.pilots.pilot_assignments && dbRecord.pilots.pilot_assignments.length > 0) {
      const currentAssignment = dbRecord.pilots.pilot_assignments
        .filter((assignment: any) => !assignment.end_date) // Active assignments only
        .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]; // Most recent

      if (currentAssignment && currentAssignment.org_squadrons) {
        profile.pilot.currentSquadron = {
          id: currentAssignment.org_squadrons.id,
          name: currentAssignment.org_squadrons.name,
          designation: currentAssignment.org_squadrons.designation,
          wing_id: currentAssignment.org_squadrons.wing_id,
          tail_code: currentAssignment.org_squadrons.tail_code,
          established_date: currentAssignment.org_squadrons.established_date,
          deactivated_date: currentAssignment.org_squadrons.deactivated_date,
          insignia_url: currentAssignment.org_squadrons.insignia_url,
          carrier_id: currentAssignment.org_squadrons.carrier_id,
          callsigns: currentAssignment.org_squadrons.callsigns,
          color_palette: currentAssignment.org_squadrons.color_palette,
          updated_at: currentAssignment.org_squadrons.updated_at
        };
      }
    }

    // Find current role assignment (for billet/position)
    if (dbRecord.pilots.pilot_roles && dbRecord.pilots.pilot_roles.length > 0) {
      const currentRole = dbRecord.pilots.pilot_roles
        .filter((roleAssignment: any) => !roleAssignment.end_date) // Active roles only
        .sort((a: any, b: any) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime())[0]; // Most recent

      if (currentRole && currentRole.roles) {
        profile.pilot.billet = currentRole.roles.name;
        profile.pilot.currentStatus = {
          id: currentRole.roles.id,
          name: currentRole.roles.name,
          isActive: !currentRole.end_date,
          order: currentRole.roles.order
        };
      }
    }

    // Find current standing
    if (dbRecord.pilots.pilot_standings && dbRecord.pilots.pilot_standings.length > 0) {
      const currentStanding = dbRecord.pilots.pilot_standings
        .filter((standing: any) => !standing.end_date) // Active standings only
        .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]; // Most recent

      if (currentStanding && currentStanding.standings) {
        profile.pilot.currentStanding = {
          id: currentStanding.standings.id,
          name: currentStanding.standings.name,
          order: currentStanding.standings.order
        };
      }
    }
  }

  return profile;
}

/**
 * Get user profile by auth user ID
 */
export async function getUserProfile(authUserId: string): Promise<{ profile: UserProfile | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        pilots:pilot_id (
          id,
          callsign,
          boardNumber,
          pilot_assignments!pilot_assignments_pilot_id_fkey (
            id,
            pilot_id,
            squadron_id,
            start_date,
            end_date,
            created_at,
            updated_at,
            org_squadrons (
              id,
              name,
              designation,
              wing_id,
              tail_code,
              established_date,
              deactivated_date,
              insignia_url,
              carrier_id,
              callsigns,
              color_palette,
              updated_at
            )
          ),
          pilot_roles!pilot_roles_pilot_id_fkey (
            id,
            pilot_id,
            role_id,
            effective_date,
            is_acting,
            end_date,
            created_at,
            updated_at,
            roles:role_id (
              id,
              name,
              isExclusive,
              compatible_statuses,
              order
            )
          ),
          pilot_standings!pilot_standings_pilot_id_fkey (
            id,
            pilot_id,
            standing_id,
            start_date,
            end_date,
            created_at,
            updated_at,
            standings:standing_id (
              id,
              name,
              order
            )
          )
        )
      `)
      .eq('auth_user_id', authUserId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return { profile: null, error: null };
      }
      throw error;
    }

    return { 
      profile: convertToUserProfile(data), 
      error: null 
    };

  } catch (error: any) {
    console.error('Error getting user profile:', error);
    return { 
      profile: null, 
      error: error 
    };
  }
}

/**
 * Sync Discord server members with user profiles
 */
export async function syncDiscordMembers(_guildId: string): Promise<{ synced: number; errors: string[] }> {
  try {
    // This would call your existing Discord member sync functionality
    // but also update user profiles for authenticated users
    
    // For now, return a placeholder
    return { synced: 0, errors: [] };
    
  } catch (error: any) {
    console.error('Error syncing Discord members:', error);
    return { synced: 0, errors: [error.message] };
  }
}