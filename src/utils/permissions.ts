import { UserProfile } from './userProfileService';

// Legacy permission types (kept for backward compatibility)
export type AppPermission = 'developer' | 'admin' | 'flight_lead' | 'member' | 'guest';

// Legacy interface (kept for backward compatibility)
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

// New permission system imports (will be available after migration)
let newPermissionService: any = null;
try {
  // Dynamically import the new permission service to avoid circular dependencies
  import('./permissionService').then(module => {
    newPermissionService = module.permissionService;
  }).catch(() => {
    // New system not available yet, fall back to legacy
  });
} catch {
  // New system not available yet, fall back to legacy
}

// Feature flag to enable new permission system
const USE_NEW_PERMISSION_SYSTEM = true; // New permission system is now fully operational

/**
 * Determine user permissions based on their profile and role assignments
 * This function now supports both legacy and new permission systems
 */
export async function getUserPermissions(userProfile: UserProfile | null): Promise<UserPermissions> {
  // If new permission system is enabled and available, use it
  if (USE_NEW_PERMISSION_SYSTEM && newPermissionService && userProfile?.authUserId) {
    try {
      const newPermissions = await newPermissionService.getUserPermissions(userProfile.authUserId);
      return mapNewPermissionsToLegacy(newPermissions);
    } catch (error) {
      console.warn('New permission system failed, falling back to legacy:', error);
      // Fall through to legacy system
    }
  }
  
  // Legacy permission system (original logic)
  return getLegacyUserPermissions(userProfile);
}

/**
 * Legacy permission calculation (original implementation)
 */
function getLegacyUserPermissions(userProfile: UserProfile | null): UserPermissions {
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
  let permission: AppPermission = userProfile.appPermission || 'flight_lead';
  
  // TEMPORARY: Grant broader access to all authenticated users until proper permissions system is implemented
  // This allows testers to access all areas of the application
  if (!userProfile.appPermission) {
    // Default to flight_lead permissions for all authenticated users
    permission = 'flight_lead';
    
    // If user has a linked pilot record, they're at least a member
    if (userProfile.pilot) {
      permission = 'flight_lead';
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
 * Map new permission system to legacy interface for backward compatibility
 */
function mapNewPermissionsToLegacy(newPermissions: any): UserPermissions {
  // Determine legacy level based on permissions
  let level: AppPermission = 'guest';
  
  if (newPermissions.canAccessAdminTools) {
    level = 'developer';
  } else if (newPermissions.canEditOrganizationSettings || newPermissions.canManageUserAccounts) {
    level = 'admin';
  } else if (newPermissions.canManageRoster?.length > 0 || newPermissions.canManageEvents?.length > 0) {
    level = 'flight_lead';
  } else if (newPermissions.canAccessMissionPrep) {
    level = 'member';
  }
  
  return {
    canAccessSettings: newPermissions.canAccessSettings || false,
    canManageRoster: (newPermissions.canManageRoster?.length > 0) || false,
    canManageFlights: newPermissions.canAccessFlights || false,
    canManageEvents: (newPermissions.canManageEvents?.length > 0) || false,
    canAccessMissionPrep: newPermissions.canAccessMissionPrep || false,
    canEditSquadrons: (newPermissions.canManageSquadronSettings?.length > 0) || false,
    canViewAdminTools: newPermissions.canAccessAdminTools || false,
    level
  };
}

/**
 * Check if user has specific permission (legacy interface)
 */
export async function hasPermission(
  userProfile: UserProfile | null, 
  permission: keyof Omit<UserPermissions, 'level'>
): Promise<boolean> {
  const permissions = await getUserPermissions(userProfile);
  return permissions[permission];
}

/**
 * Get user's permission level (legacy interface)
 */
export async function getUserLevel(userProfile: UserProfile | null): Promise<AppPermission> {
  const permissions = await getUserPermissions(userProfile);
  return permissions.level;
}

// Deprecated sync methods have been removed - use async getUserPermissions and hasPermission instead