import { supabase } from './supabaseClient';
import type { Pilot } from '../types/PilotTypes';
import { adaptSupabasePilots } from './pilotDataUtils';
import { updatePilotRole } from './pilotService';
import { getUserSettings } from './userSettingsService';

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
  
  // Default to development if we can't get the setting
  return 'development';
}

// Helper function to detect if we're running in local development
// function isLocalDevelopment(): boolean {
//   // Check if we're running on localhost or if VITE_API_URL points to localhost
//   return window.location.hostname === 'localhost' ||
//          window.location.hostname === '127.0.0.1' ||
//          import.meta.env.VITE_API_URL?.includes('localhost');
// }

// Helper function to get the appropriate API base URL based on Discord environment
async function getDiscordApiBaseUrl(): Promise<string> {
  const environment = await getDiscordEnvironment();

  // If using production Discord bot, connect to production server
  // If using development Discord bot, connect to local development server
  if (environment === 'production') {
    return 'https://readyroom.fly.dev';
  } else {
    return import.meta.env.VITE_API_URL || 'http://localhost:3001';
  }
}

// Helper function to add Discord environment to API request headers
async function getDiscordHeaders(): Promise<Record<string, string>> {
  const environment = await getDiscordEnvironment();
  return {
    'Content-Type': 'application/json',
    'X-Discord-Environment': environment
  };
}

export interface DiscordMember {
  id: string;
  username: string;
  displayName: string; // Added display name field
  roles: string[];
  boardNumber: string | null;
  callsign: string | null;
  status: string | null;
  role: string | null; // Added role field
  isBot: boolean;
}

export interface DiscordPilotMatch {
  discordMember: DiscordMember;
  matchedPilot: Pilot | null;
  potentialMatches: Pilot[];
  action: 'do-nothing' | 'create-new' | 'update-existing';
  selectedPilotId: string | null;
  roleId: string | null; // Added roleId field
  statusId: string | null; // Added statusId field
  squadronId: string | null; // Added squadronId field
}

/**
 * Get guild members from Discord API for the selected guild
 * @param squadronId Optional squadron ID to get Discord config from. If not provided, uses first squadron with Discord integration.
 * @returns List of Discord members
 */
export async function fetchDiscordGuildMembers(squadronId?: string): Promise<DiscordMember[]> {
  try {
    let guildId: string | null = null;
    
    if (squadronId) {
      // Get guild ID from specific squadron
      const { data: squadronData, error: squadronError } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .eq('id', squadronId)
        .single();
        
      if (!squadronError && squadronData?.discord_integration) {
        const integration = squadronData.discord_integration as { selectedGuildId?: string };
        if (integration?.selectedGuildId) {
          guildId = integration.selectedGuildId;
        }
      }
    } else {
      // Get guild ID from first squadron with Discord integration
      const { data: squadronsData, error: squadronsError } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .not('discord_integration->selectedGuildId', 'is', null)
        .limit(1);
        
      if (!squadronsError && squadronsData?.length > 0 && squadronsData[0]?.discord_integration) {
        const integration = squadronsData[0].discord_integration as { selectedGuildId?: string };
        if (integration?.selectedGuildId) {
          guildId = integration.selectedGuildId;
        }
      }
    }
    
    // If no guild ID is configured, throw an error
    if (!guildId) {
      throw new Error('Discord server not configured. Please set up Discord integration in settings first.');
    }
    
    // Get dynamic API base URL and headers based on Discord environment setting
    const baseUrl = await getDiscordApiBaseUrl();
    const headers = await getDiscordHeaders();
    
    // Call the server endpoint that will use the Discord API with the specific guild ID
    const response = await fetch(`${baseUrl}/api/discord/guild-members?guildId=${guildId}`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to fetch Discord guild members');
    }

    const data = await response.json();
    
    if (!data.members) {
      return [];
    }

  // Process the discord members to extract board numbers, callsigns, and roles
    const members = data.members.map((member: {
      id: string;
      username: string;
      displayName: string;
      roles?: string[];
      isBot?: boolean;
    }) => {
      // Extract board number and callsign from display name
      // Example formats: "123 Callsign", "123/Callsign", "123 | Callsign", etc.
      const boardNumberMatch = member.displayName.match(/^(\d{3})[\s|\/\-_]+(.+)$/);
      return {
        id: member.id,
        username: member.username,
        displayName: member.displayName,
        roles: member.roles || [],
        boardNumber: boardNumberMatch ? boardNumberMatch[1] : null,
        callsign: boardNumberMatch ? boardNumberMatch[2] : null,
        status: null,
        role: null,
        isBot: member.isBot || false
      };
    });
    
    // Filter out bot users
    return members.filter((member: DiscordMember) => !member.isBot);
  } catch (error) {
    console.error('Error fetching Discord guild members:', error);
    throw error;
  }
}


/**
 * Helper function to get status ID by name
 */
async function getStatusIdByName(statusName: string): Promise<string> {
  const { data, error } = await supabase
    .from('statuses')
    .select('id')
    .eq('name', statusName)
    .single();
    
  if (error || !data) {
    // Fallback to the first status in the database if not found
    const { data: firstStatus } = await supabase
      .from('statuses')
      .select('id')
      .limit(1)
      .single();
      
    return firstStatus?.id || '';
  }
  
  return data.id;
}

/**
 * Check if a role can be assigned to a pilot based on status and exclusivity
 */
async function canAssignRole(
  roleId: string,
  statusId: string,
  pilotId?: string
): Promise<boolean> {
  try {
    // First check if the role is exclusive
    const { data: role } = await supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .single();
      
    if (!role) return false;
    
    // Get the status to check compatibility
    const { data: status } = await supabase
      .from('statuses')
      .select('name')
      .eq('id', statusId)
      .single();
      
    if (!status) return false;
    
    // Check status compatibility - roles can only be assigned to Command and Staff
    if (status.name !== 'Command' && status.name !== 'Staff') {
      return false;
    }
    
    // If role is exclusive, check if it's already assigned to someone else
    if (role.isExclusive) {
      const { data: assignedRoles } = await supabase
        .from('pilot_roles')
        .select('pilot_id')
        .eq('role_id', roleId)
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
        
      if (assignedRoles && assignedRoles.length > 0) {
        // If no pilotId provided or if assigned to someone else
        if (!pilotId || !assignedRoles.some(pr => pr.pilot_id === pilotId)) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking role assignment:', error);
    return false;
  }
}

/**
 * Find matching pilots in database
 * @param discordMembers Discord guild members
 */
export async function matchDiscordMembersWithPilots(discordMembers: DiscordMember[]): Promise<DiscordPilotMatch[]> {
  // Get all existing pilots from the database
  const { data: existingPilots, error } = await supabase
    .from('pilots')
    .select('*');

  if (error || !existingPilots) {
    console.error('Error fetching existing pilots:', error);
    throw error;
  }
  
  // Get available roles and statuses for matching
  const { data: availableRoles } = await supabase
    .from('roles')
    .select('*');
    
  const { data: availableStatuses } = await supabase
    .from('statuses')
    .select('*');
  
  
  // Get properly typed SupabasePilot objects
  const pilots = adaptSupabasePilots(existingPilots);
  
  const matches = await Promise.all(discordMembers.map(async member => {
    
    // Try to find an exact match by Discord Username first (this is the primary matching criteria now)
    const exactMatchByUsername = pilots.find(p => p.discordUsername === member.username);
    if (exactMatchByUsername) {
    }
    
    // Only proceed with fallback matching if Discord Username is empty/null for this member
    // This prevents false matches for users with usernames like "mrs.zapp" or "zapp0651"
    let potentialMatches: Pilot[] = [];
    let bestMatch: Pilot | null = null;
    
    if (!exactMatchByUsername && !member.username && member.boardNumber) {
      // Try to find matches by board number
      const boardMatches = pilots.filter(p => p.boardNumber === member.boardNumber);
      
      if (boardMatches.length > 0) {
        potentialMatches = boardMatches;
        
        // If we have a single board match, consider it the best match
        if (boardMatches.length === 1) {
          bestMatch = boardMatches[0];
        } 
        // If multiple board matches, try to narrow down by callsign
        else if (member.callsign) {
          const callsignMatch = boardMatches.find(p => 
            p.callsign.toLowerCase() === member.callsign!.toLowerCase()
          );
          if (callsignMatch) {
            bestMatch = callsignMatch;
          }
        }
      }
      // If no board matches but we have callsign, try matching by callsign
      else if (member.callsign) {
        const callsignMatches = pilots.filter(p => 
          p.callsign.toLowerCase() === member.callsign!.toLowerCase()
        );
        if (callsignMatches.length > 0) {
          potentialMatches = [...potentialMatches, ...callsignMatches];
          // If single callsign match, consider it the best match
          if (callsignMatches.length === 1) {
            bestMatch = callsignMatches[0];
          }
        }
      }
    } else if (!exactMatchByUsername && member.username) {
    }
    
    // Determine the matched pilot (exact match by Discord Username takes precedence)
    const matchedPilot = exactMatchByUsername || bestMatch;
    
    // Set appropriate action and selectedPilotId based on matching results
    let action: 'do-nothing' | 'create-new' | 'update-existing' = 'do-nothing';
    let selectedPilotId: string | null = null;
    
    if (matchedPilot) {
      action = 'update-existing';
      // Use the pilot's UUID (not the Discord ID)
      selectedPilotId = matchedPilot.id;
    } else if (member.boardNumber && member.callsign) {
      // If we have both board number and callsign but no match, suggest creating new
      action = 'create-new';
      selectedPilotId = null;
    } else {
    }
    
    // Find role ID and status ID
    let roleId: string | null = null;
    let statusId: string | null = null;
    
    // Find roleId if member.role matches any of the available roles
    if (member.role && availableRoles) {
      const matchingRole = availableRoles.find(r => 
        member.role && r.name.toLowerCase() === member.role.toLowerCase()
      );
      
      if (matchingRole) {
        roleId = matchingRole.id;
      } else {
        // Try partial match - check if member.role contains any role name
        for (const role of availableRoles) {
          if (member.role.toLowerCase().includes(role.name.toLowerCase())) {
            roleId = role.id;
            break;
          }
        }
      }
    }
    
    // Find statusId based on member.status
    if (member.status && availableStatuses) {
      const matchingStatus = availableStatuses.find(s => 
        s.name === member.status
      );
      
      if (matchingStatus) {
        statusId = matchingStatus.id;
      }
    }
    
    return {
      discordMember: member,
      matchedPilot: matchedPilot,
      potentialMatches: matchedPilot ? [] : potentialMatches,
      action: action,
      selectedPilotId: selectedPilotId,
      roleId: roleId,
      statusId: statusId,
      squadronId: null // Default to no squadron assignment
    };
  }));
  
  
  return matches;
}

/**
 * Process the matched pilot data and update the database
 * @param matches The final Discord-pilot matches after user review
 */
export async function processPilotMatches(matches: DiscordPilotMatch[]): Promise<{
  updated: number;
  created: number;
  unchanged: number;
  errors: string[];
}> {
  const result = {
    updated: 0,
    created: 0,
    unchanged: 0,
    errors: [] as string[]
  };

  for (const match of matches) {
    try {
      if (match.action === 'do-nothing') {
        result.unchanged++;
        continue;
      }
      
      // If updating an existing pilot
      if (match.action === 'update-existing' && match.selectedPilotId) {
        // We're now using the actual pilot UUID as selectedPilotId, so no need to fetch it again
        const pilotId = match.selectedPilotId;

        // First get the current pilot data with status and standing information
        const { data: pilotsWithStatus } = await supabase
          .from('pilots')
          .select(`
            *,
            pilot_statuses!pilot_statuses_pilot_id_fkey(
              status_id,
              statuses:status_id(id, name, isActive)
            )
          `)
          .eq('id', pilotId)
          .single();
          
        // Check if we have a valid pilot
        if (!pilotsWithStatus) {
          throw new Error(`Pilot with ID ${pilotId} not found`);
        }
        
        const currentPilot = pilotsWithStatus;
        const currentStatusId = currentPilot.pilot_statuses?.[0]?.status_id;
        
        // Prepare updates object for basic pilot information
        const updates: any = {
          discord_original_id: match.discordMember.id,
          discordId: match.discordMember.username
        };


        // Handle status update separately using join table if status has changed
        if (match.statusId && match.statusId !== currentStatusId) {
          // Import and use the join table service to update status
          const { assignPilotStatus } = await import('./pilotStatusStandingService');
          await assignPilotStatus(pilotId, match.statusId);
        }
        
        // Update role if available and status is compatible
        if (match.roleId) {
          // Check if the role can be assigned based on status rules
          const statusToCheck = match.statusId || currentStatusId;
          
          // Make sure both roleId and statusToCheck are strings before calling canAssignRole
          if (typeof match.roleId === 'string' && typeof statusToCheck === 'string') {
            const roleAssignable = await canAssignRole(match.roleId, statusToCheck, pilotId);
            
            if (roleAssignable) {
              // Use the new pilot_roles system instead of direct role_id
              const { success } = await updatePilotRole(pilotId, match.roleId);
              if (!success) {
              }
            } else {
            }
          }
        }
        
        // Update the pilot in the database
        const { error: updateError } = await supabase
          .from('pilots')
          .update(updates)
          .eq('id', pilotId);

        if (updateError) {
          throw updateError;
        }
        
        // Handle squadron assignment if specified
        if (match.squadronId) {
          const { assignPilotToSquadron } = await import('./squadronService');
          await assignPilotToSquadron(pilotId, match.squadronId);
        }
        
        result.updated++;
      } 
      // If creating a new pilot
      else if (match.action === 'create-new') {
        // Ensure we have the required fields
        if (!match.discordMember.callsign) {
          throw new Error('Callsign is required when creating a new pilot');
        }
        
        if (!match.discordMember.boardNumber) {
          throw new Error('Board number is required when creating a new pilot');
        }
        
        
        // Create new pilot record - start with basic details
        const newPilot: any = {
          callsign: match.discordMember.callsign,
          boardNumber: parseInt(match.discordMember.boardNumber),
          discord_original_id: match.discordMember.id,  // Discord numeric ID
          discordId: match.discordMember.username      // Discord Username
        };
        
        // Add status - use selected status or default to Provisional
        const statusId = match.statusId || await getStatusIdByName('Provisional');
        newPilot.status_id = statusId;
        
        let shouldAssignRole = false;
        
        // Handle role assignment separately after checking compatibility
        // Only add role if one is selected and the status is compatible
        if (match.roleId) {
          try {
            // Get role data to check exclusivity
            const { data: roleData } = await supabase
              .from('roles')
              .select('*')
              .eq('id', match.roleId)
              .single();
              
            // Get status name to check compatibility
            const { data: statusData } = await supabase
              .from('statuses')
              .select('name')
              .eq('id', statusId)
              .single();
              
            // Check if this status can have roles (Command or Staff only)
            if (statusData && (statusData.name === 'Command' || statusData.name === 'Staff')) {
              // Check if this role is exclusive and already assigned
              if (roleData && roleData.isExclusive) {
                const { data: assignedRoles } = await supabase
                  .from('pilot_roles')
                  .select('pilot_id')
                  .eq('role_id', match.roleId)
                  .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
                  
                // If no one has this role yet, we can assign it later
                if (!assignedRoles || assignedRoles.length === 0) {
                  // We'll assign the role after creating the pilot
                  shouldAssignRole = true;
                } else {
                }
              } else if (roleData) {
                // Non-exclusive role can be assigned
                shouldAssignRole = true;
              }
            } else {
            }
          } catch (roleError) {
            console.error('Error checking role assignment:', roleError);
            // Continue without assigning role
          }
        }
        
        // Create the pilot
        const { data: createdPilot, error: createError } = await supabase
          .from('pilots')
          .insert(newPilot)
          .select()
          .single();
          
        if (createError) {
          throw createError;
        }
        
        // Assign role if determined it should be assigned
        if (shouldAssignRole && match.roleId && createdPilot) {
          const { success } = await updatePilotRole(createdPilot.id, match.roleId);
          if (!success) {
          }
        }
        
        // Handle squadron assignment if specified
        if (match.squadronId && createdPilot) {
          const { assignPilotToSquadron } = await import('./squadronService');
          await assignPilotToSquadron(createdPilot.id, match.squadronId);
        }
        
        result.created++;
      }
    } catch (error: any) {
      console.error(`Error processing pilot match for ${match.discordMember.username}:`, error);
      result.errors.push(`${match.discordMember.username}: ${error.message}`);
    }
  }
  
  return result;
}