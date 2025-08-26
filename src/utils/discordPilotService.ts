import { supabase } from './supabaseClient';
import type { Pilot } from '../types/PilotTypes'; // Removed unused SupabasePilot import
import { convertSupabasePilotToLegacy } from '../types/PilotTypes';
import { updatePilotRole } from './pilotService';

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
        
      if (!squadronError && squadronData?.discord_integration?.selectedGuildId) {
        guildId = squadronData.discord_integration.selectedGuildId;
      }
    } else {
      // Get guild ID from first squadron with Discord integration
      const { data: squadronsData, error: squadronsError } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .not('discord_integration->selectedGuildId', 'is', null)
        .limit(1);
        
      if (!squadronsError && squadronsData?.length > 0 && squadronsData[0]?.discord_integration?.selectedGuildId) {
        guildId = squadronsData[0].discord_integration.selectedGuildId;
      }
    }
    
    // If no guild ID is configured, throw an error
    if (!guildId) {
      throw new Error('Discord server not configured. Please set up Discord integration in settings first.');
    }
    console.log(`Fetching Discord members for guild ID: ${guildId}`);
    
    // Call the server endpoint that will use the Discord API with the specific guild ID
    const response = await fetch(`http://localhost:3001/api/discord/guild-members?guildId=${guildId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });    if (!response.ok) {
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
        status: determineStatusFromRoles(member.roles || []),
        role: determineRoleFromName(member.displayName),
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
 * Determine pilot status from Discord roles
 */
function determineStatusFromRoles(roles: string[]): string | null {
  const roleMap = {
    'Command': ['CO', 'XO', 'Command'],
    'Staff': ['Staff', 'Department Head', 'Officer'],
    'Cadre': ['Cadre', 'Instructor'],
    'Provisional': ['Provisional', 'Student'],
    'Inactive': ['Inactive'],
    'Retired': ['Retired', 'Alumni'],
    'On Leave': ['On Leave', 'LOA']
  };

  for (const [status, keywords] of Object.entries(roleMap)) {
    if (roles.some(role => keywords.some(keyword => 
      role.toLowerCase().includes(keyword.toLowerCase())))) {
      return status;
    }
  }

  return 'Provisional'; // Default status
}

/**
 * Determine pilot role from Discord display name
 * This extracts role strings like "Admin OIC" from the display name
 */
function determineRoleFromName(displayName: string): string | null {
  // We'll extract any potential role strings from the display name
  // Example: "123 Callsign - Admin OIC" would extract "Admin OIC"
  
  // Look for role indicators after separators like "-", "|", etc.
  const roleSeparators = ['-', '|', '/', '–', '—', ':', '('];
  let rolePart = null;
  
  // Check for each separator and extract the part after it
  for (const separator of roleSeparators) {
    if (displayName.includes(separator)) {
      const parts = displayName.split(separator);
      if (parts.length > 1) {
        rolePart = parts[1].trim();
        break;
      }
    }
  }
  
  return rolePart;
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
  
  console.log('Total Discord members:', discordMembers.length);
  console.log('Total existing pilots:', existingPilots.length);
  
  // Convert to legacy format for consistency
  const pilots = existingPilots.map(pilot => convertSupabasePilotToLegacy(pilot as any));
  
  const matches = await Promise.all(discordMembers.map(async member => {
    console.log(`\n---- Processing Discord member: ${member.displayName} (${member.username}) ----`);
    console.log('Board Number:', member.boardNumber);
    console.log('Callsign:', member.callsign);
    console.log('Discord ID:', member.id);
    console.log('Discord Role:', member.role);
    console.log('Discord Status:', member.status);
    
    // Try to find an exact match by Discord ID first
    const exactMatchById = pilots.find(p => p.discordUsername === member.id || p.id === member.id);
    if (exactMatchById) {
      console.log('MATCH FOUND: Exact match by Discord ID:', exactMatchById.callsign, exactMatchById.boardNumber);
      console.log('Matched pilot UUID:', exactMatchById.id);
      console.log('Matched pilot Discord username:', exactMatchById.discordUsername);
    }
    
    // If no exact match by Discord ID, try to match by board number and/or callsign
    let potentialMatches: Pilot[] = [];
    let bestMatch: Pilot | null = null;
    
    if (!exactMatchById && member.boardNumber) {
      // Try to find matches by board number
      const boardMatches = pilots.filter(p => p.boardNumber === member.boardNumber);
      
      if (boardMatches.length > 0) {
        console.log(`MATCH: Found ${boardMatches.length} pilots with board number ${member.boardNumber}`);
        boardMatches.forEach(p => console.log(`  - ${p.callsign} (${p.id})`));
        potentialMatches = boardMatches;
        
        // If we have a single board match, consider it the best match
        if (boardMatches.length === 1) {
          bestMatch = boardMatches[0];
          console.log('BEST MATCH: Single board number match:', bestMatch.callsign);
        } 
        // If multiple board matches, try to narrow down by callsign
        else if (member.callsign) {
          const callsignMatch = boardMatches.find(p => 
            p.callsign.toLowerCase() === member.callsign!.toLowerCase()
          );
          if (callsignMatch) {
            bestMatch = callsignMatch;
            console.log('BEST MATCH: Found by board+callsign match:', bestMatch.callsign);
          }
        }
      }
      // If no board matches but we have callsign, try matching by callsign
      else if (member.callsign) {
        const callsignMatches = pilots.filter(p => 
          p.callsign.toLowerCase() === member.callsign!.toLowerCase()
        );
        if (callsignMatches.length > 0) {
          console.log(`MATCH: Found ${callsignMatches.length} pilots with callsign ${member.callsign}`);
          callsignMatches.forEach(p => console.log(`  - ${p.callsign} (Board #${p.boardNumber})`));
          potentialMatches = [...potentialMatches, ...callsignMatches];
          // If single callsign match, consider it the best match
          if (callsignMatches.length === 1) {
            bestMatch = callsignMatches[0];
            console.log('BEST MATCH: Single callsign match:', bestMatch.callsign);
          }
        }
      }
    }
    
    // Determine the matched pilot (exact match by ID takes precedence)
    const matchedPilot = exactMatchById || bestMatch;
    
    // Set appropriate action and selectedPilotId based on matching results
    let action: 'do-nothing' | 'create-new' | 'update-existing' = 'do-nothing';
    let selectedPilotId: string | null = null;
    
    if (matchedPilot) {
      action = 'update-existing';
      // Use the pilot's UUID (not the Discord ID)
      selectedPilotId = matchedPilot.id;
      console.log('RESULT: Matched with pilot:', matchedPilot.callsign, '(ID:', matchedPilot.id, ')');
      console.log('Action:', action, 'Selected pilot ID (UUID):', selectedPilotId);
    } else if (member.boardNumber && member.callsign) {
      // If we have both board number and callsign but no match, suggest creating new
      action = 'create-new';
      selectedPilotId = null;
      console.log('RESULT: No match found. Suggesting to create new pilot.');
      console.log('Action:', action, 'Selected pilot ID:', selectedPilotId);
    } else {
      console.log('RESULT: No match found and insufficient info to create new pilot.');
      console.log('Action:', action, 'Selected pilot ID:', selectedPilotId);
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
      statusId: statusId
    };
  }));
  
  console.log('\n---- SUMMARY ----');
  console.log(`Total Discord members: ${matches.length}`);
  console.log(`Matched with existing pilots: ${matches.filter(m => m.matchedPilot !== null).length}`);
  console.log(`Suggested for creation: ${matches.filter(m => m.action === 'create-new').length}`);
  console.log(`No action (do-nothing): ${matches.filter(m => m.action === 'do-nothing').length}`);
  
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
        
        console.log(`Updating pilot ${pilotId} with Discord ID ${match.discordMember.id} and Username ${match.discordMember.username}`);
        
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
                console.log(`Failed to assign role to pilot ${pilotId} using pilot_roles table`);
              }
            } else {
              console.log(`Cannot assign role to pilot ${pilotId} due to status constraints or exclusivity rules`);
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
        
        console.log(`Creating new pilot with Discord ID ${match.discordMember.id} and Username ${match.discordMember.username}`);
        
        // Create new pilot record - start with basic details
        const newPilot: any = {
          callsign: match.discordMember.callsign,
          boardNumber: parseInt(match.discordMember.boardNumber),
          discord_original_id: match.discordMember.id,  // Discord numeric ID
          discordId: match.discordMember.username      // Discord Username
        };
        
        // Add status - use selected status or detect from Discord roles
        const statusId = match.statusId || await getStatusIdByName(match.discordMember.status || 'Provisional');
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
                  console.log(`Cannot assign exclusive role ${roleData.name} - it's already assigned to another pilot.`);
                }
              } else if (roleData) {
                // Non-exclusive role can be assigned
                shouldAssignRole = true;
              }
            } else {
              console.log(`Cannot assign role to a pilot with status: ${statusData?.name || 'Unknown'}`);
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
            console.log(`Failed to assign role to newly created pilot ${createdPilot.id}`);
          }
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