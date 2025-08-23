import { UserProfile } from './userProfileService';

export type AppPermission = 'developer' | 'admin' | 'flight_lead' | 'member' | 'guest';

export interface UserPermissions {
  canAccessSettings: boolean;
  canManageRoster: boolean;
  canManageFlights: boolean;
  canManageEvents: boolean;
  canAccessMissionPrep: boolean;
  canEditSquadrons: boolean;
  canViewAdminTools: boolean;
  level: AppPermission;
}

/**
 * Determine user permissions based on their profile and role assignments
 */
export function getUserPermissions(userProfile: UserProfile | null): UserPermissions {
  // Default permissions for guests/unauthenticated users
  const guestPermissions: UserPermissions = {
    canAccessSettings: false,
    canManageRoster: false,
    canManageFlights: false,
    canManageEvents: false,
    canAccessMissionPrep: false,
    canEditSquadrons: false,
    canViewAdminTools: false,
    level: 'guest'
  };

  if (!userProfile) {
    return guestPermissions;
  }

  // Check for hardcoded developer access first
  const isDeveloper = userProfile.authUserId === '4418609d-ca5a-49d4-a39e-862f7f5c9407' || 
                      userProfile.id === '4418609d-ca5a-49d4-a39e-862f7f5c9407';
  
  if (isDeveloper) {
    return {
      canAccessSettings: true,
      canManageRoster: true,
      canManageFlights: true,
      canManageEvents: true,
      canAccessMissionPrep: true,
      canEditSquadrons: true,
      canViewAdminTools: true,
      level: 'developer'
    };
  }

  // Use stored permission level from Discord role sync, with fallback logic
  let permission: AppPermission = userProfile.appPermission || 'guest';
  
  // Fallback logic for users without synced permissions
  if (!userProfile.appPermission) {
    // If user has a linked pilot record, they're at least a member
    if (userProfile.pilot) {
      permission = 'member';
    }
    
    // Temporary admin check for development (you can modify this)
    // In production, this would be based on Discord roles or database flags
    const isAdmin = userProfile.discordUsername === 'admin' || 
                    userProfile.pilot?.callsign === 'CAG'; // Example admin callsign
    
    if (isAdmin) {
      permission = 'admin';
    }
  }

  // Define permissions based on role level
  switch (permission) {
    case 'developer':
      return {
        canAccessSettings: true,
        canManageRoster: true,
        canManageFlights: true,
        canManageEvents: true,
        canAccessMissionPrep: true,
        canEditSquadrons: true,
        canViewAdminTools: true,
        level: 'developer'
      };
    
    case 'admin':
      return {
        canAccessSettings: true,
        canManageRoster: true,
        canManageFlights: true,
        canManageEvents: true,
        canAccessMissionPrep: true,
        canEditSquadrons: true,
        canViewAdminTools: true,
        level: 'admin'
      };
    
    case 'flight_lead':
      return {
        canAccessSettings: false,
        canManageRoster: true,
        canManageFlights: true,
        canManageEvents: true,
        canAccessMissionPrep: true,
        canEditSquadrons: false,
        canViewAdminTools: false,
        level: 'flight_lead'
      };
    
    case 'member':
      return {
        canAccessSettings: false,
        canManageRoster: false,
        canManageFlights: false,
        canManageEvents: false,
        canAccessMissionPrep: true,
        canEditSquadrons: false,
        canViewAdminTools: false,
        level: 'member'
      };
    
    default:
      return guestPermissions;
  }
}

/**
 * Check if user has specific permission
 */
export function hasPermission(
  userProfile: UserProfile | null, 
  permission: keyof Omit<UserPermissions, 'level'>
): boolean {
  const permissions = getUserPermissions(userProfile);
  return permissions[permission];
}

/**
 * Get user's permission level
 */
export function getUserLevel(userProfile: UserProfile | null): AppPermission {
  return getUserPermissions(userProfile).level;
}