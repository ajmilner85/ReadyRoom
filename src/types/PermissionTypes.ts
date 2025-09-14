// Enhanced Permission System Types
// This file defines all types for the new inheritance-based permission system

export type PermissionCategory = 'navigation' | 'roster' | 'events' | 'settings' | 'mission_prep' | 'other';

export type ScopeType = 'global' | 'squadron' | 'wing';

export type BasisType = 'standing' | 'qualification' | 'billet' | 'squadron' | 'wing' | 'authenticated_user' | 'manual_override';

export type PermissionScope = 'global' | 'own_squadron' | 'all_squadrons' | 'own_wing' | 'all_wings';

export interface AppPermission {
  id: string;
  name: string;                // Technical name: 'manage_roster'
  displayName: string;         // User-friendly: 'Manage Squadron Roster'  
  description?: string;        // What this permission allows
  category: PermissionCategory;
  scopeType: ScopeType;       // What level this permission operates at
  createdAt: string;
  updatedAt: string;
}

export interface PermissionRule {
  id: string;
  permissionId: string;
  permissionName?: string;    // Permission name (e.g., 'access_events')
  permissionDisplayName?: string; // Display name (e.g., 'Access Events')
  permissionDescription?: string; // Description for UI
  basisType: BasisType;
  basisId?: string;           // NULL for authenticated_user basis
  basisName?: string;         // Human-readable basis name
  scope: PermissionScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface PermissionBasis {
  type: BasisType;
  id: string;
  name: string;
  priority: number;           // For display/debugging purposes
}

export interface PermissionScopeContext {
  type: PermissionScope;
  squadronId?: string;        // User's current squadron
  wingId?: string;            // User's current wing
}

// Core permissions interface with scope-aware permissions
export interface UserPermissions {
  // Navigation permissions (always boolean)
  canAccessHome: boolean;
  canAccessRoster: boolean;
  canAccessEvents: boolean;
  canAccessMissionPrep: boolean;
  canAccessFlights: boolean;
  canAccessSettings: boolean;
  
  // Roster Management (scope-aware)
  canManageRoster: PermissionScopeContext[];
  canEditPilotQualifications: PermissionScopeContext[];
  canDeletePilots: PermissionScopeContext[];
  canManageStandings: PermissionScopeContext[];
  canViewPublicRoster: boolean;
  
  // Events Management (scope-aware)
  canManageEvents: PermissionScopeContext[];
  canCreateTrainingCycles: PermissionScopeContext[];
  canManageEventAttendance: PermissionScopeContext[];
  canOverrideEventSettings: PermissionScopeContext[];
  
  // Settings (mixed scope types)
  canEditOrganizationSettings: boolean;          // Global only
  canManageSquadronSettings: PermissionScopeContext[];
  canManageUserAccounts: boolean;                // Global only
  canEditDiscordIntegration: PermissionScopeContext[];
  
  // Mission Preparation (scope-aware)
  canEditFlightAssignments: PermissionScopeContext[];
  canAssignMissionRoles: PermissionScopeContext[];
  canPublishToDiscord: PermissionScopeContext[];
  
  // Component-level permissions (mixed)
  canSyncWithDiscord: PermissionScopeContext[];
  canViewOwnProfile: boolean;                    // Global only
  
  // Developer permissions (global only)
  access_developer_settings: boolean;           // Global only
  
  // Polls and Change Log (global only)
  canManagePolls: boolean;                       // Global only
  canVoteInPolls: boolean;                       // Global only
  canManageChangeLog: boolean;                   // Global only
  canReactToPosts: boolean;                      // Global only
  
  // Meta information
  bases: PermissionBasis[];
  calculatedAt: Date;
  expiresAt: Date;
}

// Cache storage format
export interface UserPermissionCache {
  userId: string;
  permissions: UserPermissions;
  basesHash: string;
  calculatedAt: Date;
  expiresAt: Date;
}

// Permission check context for scope validation
export interface PermissionCheckContext {
  squadronId?: string;
  wingId?: string;
  userId?: string;           // For self-context checks
}

// Permission calculation input
export interface UserBases {
  userId: string;
  pilotId?: string;
  squadronId?: string;
  wingId?: string;
  standings: Array<{ id: string; name: string; startDate: string; endDate?: string }>;
  qualifications: Array<{ id: string; name: string; achievedDate: string; expiryDate?: string }>;
  billets: Array<{ id: string; name: string; effectiveDate: string; endDate?: string }>;
  squadronAssignments: Array<{ id: string; name: string; startDate: string; endDate?: string }>;
}

// Permission rule configuration for admin interface
export interface PermissionRuleConfig {
  permissionId: string;
  permissionName: string;
  basisType: BasisType;
  basisId?: string;
  basisName?: string;
  scope: PermissionScope;
  active: boolean;
}

// Grouped permissions for admin UI
export interface GroupedPermissions {
  navigation: AppPermission[];
  roster: AppPermission[];
  events: AppPermission[];
  settings: AppPermission[];
  missionPrep: AppPermission[];
  other: AppPermission[];
}

// Basis options for admin interface dropdowns
export interface BasisOption {
  id: string;
  name: string;
  type: BasisType;
  description?: string;
}

// Permission template for bulk rule creation
export interface PermissionTemplate {
  name: string;
  description: string;
  rules: PermissionRuleConfig[];
}

// API request/response types
export interface CreatePermissionRuleRequest {
  permissionId: string;
  basisType: BasisType;
  basisId?: string;
  scope: PermissionScope;
}

export interface UpdatePermissionRuleRequest extends CreatePermissionRuleRequest {
  active?: boolean;
}

export interface PermissionCheckRequest {
  permission: string;
  context?: PermissionCheckContext;
}

export interface PermissionCheckResponse {
  hasPermission: boolean;
  matchingScopes?: PermissionScopeContext[];
  reason?: string;
}

export interface BulkPermissionCheckRequest {
  permissions: string[];
  context?: PermissionCheckContext;
}

export interface BulkPermissionCheckResponse {
  permissions: Record<string, boolean>;
  details?: Record<string, PermissionCheckResponse>;
}

// Error types for permission system
export interface PermissionError {
  code: 'INSUFFICIENT_PERMISSIONS' | 'INVALID_SCOPE' | 'PERMISSION_NOT_FOUND' | 'BASIS_NOT_FOUND';
  message: string;
  required?: string;
  context?: PermissionCheckContext;
}

// Legacy permission mapping for migration
export interface LegacyPermissionMapping {
  oldLevel: 'developer' | 'admin' | 'flight_lead' | 'member' | 'guest';
  newPermissions: string[];
  defaultScope: PermissionScope;
}

// Permission audit log entry
export interface PermissionAuditEntry {
  id: string;
  userId: string;
  action: 'grant' | 'revoke' | 'override' | 'calculate';
  permission: string;
  oldValue?: boolean | PermissionScopeContext[];
  newValue?: boolean | PermissionScopeContext[];
  changedBy: string;
  reason?: string;
  createdAt: string;
}

// Constants for permission system
export const PERMISSION_CATEGORIES: Record<PermissionCategory, string> = {
  navigation: 'Navigation',
  roster: 'Roster Management', 
  events: 'Events Management',
  settings: 'Settings',
  mission_prep: 'Mission Preparation',
  other: 'Other'
};

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  global: 'Global',
  own_squadron: 'Own Squadron',
  all_squadrons: 'All Squadrons', 
  own_wing: 'Own Wing',
  all_wings: 'All Wings'
};

export const BASIS_TYPE_LABELS: Record<BasisType, string> = {
  standing: 'Standing',
  qualification: 'Qualification',
  billet: 'Billet',
  squadron: 'Squadron Affiliation',
  wing: 'Wing Affiliation',
  authenticated_user: 'Authenticated User',
  manual_override: 'Manual Override'
};

// Permission calculation priorities (higher = takes precedence)
export const BASIS_PRIORITIES: Record<BasisType, number> = {
  manual_override: 1000,
  standing: 900,
  billet: 800,
  qualification: 700,
  wing: 600,
  squadron: 500,
  authenticated_user: 100
};

// Cache configuration
export const PERMISSION_CACHE_CONFIG = {
  DURATION_MS: 30 * 60 * 1000,  // 30 minutes
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  MAX_CACHE_SIZE: 10000  // Maximum cached users
};

// Default permissions for all authenticated users
export const BASE_AUTHENTICATED_PERMISSIONS = [
  'view_own_profile',
  'access_settings',
  'view_public_roster', 
  'access_home',
  'vote_in_polls',
  'react_to_posts'
];