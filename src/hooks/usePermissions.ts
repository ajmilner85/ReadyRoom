import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { permissionService } from '../utils/permissionService';
import type { 
  UserPermissions, 
  PermissionCheckContext, 
  PermissionScopeContext 
} from '../types/PermissionTypes';

// Hook state interface
interface PermissionHookState {
  permissions: UserPermissions | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

/**
 * Primary hook for accessing the new permission system
 * Provides comprehensive permission checking with scope awareness
 */
export function usePermissions() {
  const { userProfile } = useAuth();
  const [state, setState] = useState<PermissionHookState>({
    permissions: null,
    loading: true,
    error: null,
    lastUpdated: null
  });

  // Load permissions when user profile changes
  useEffect(() => {
    if (!userProfile?.authUserId) {
      setState({
        permissions: null,
        loading: false,
        error: null,
        lastUpdated: null
      });
      return;
    }
    
    let isMounted = true;
    
    const loadPermissions = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        const permissions = await permissionService.getUserPermissions(userProfile.authUserId);
        
        if (isMounted) {
          setState({
            permissions,
            loading: false,
            error: null,
            lastUpdated: new Date()
          });
        }
      } catch (error: any) {
        console.error('Error loading permissions:', error);
        if (isMounted) {
          setState({
            permissions: null,
            loading: false,
            error: error.message || 'Failed to load permissions',
            lastUpdated: null
          });
        }
      }
    };

    loadPermissions();

    return () => {
      isMounted = false;
    };
  }, [userProfile?.authUserId]);

  /**
   * Check if user has a specific permission with optional context
   */
  const hasPermission = useCallback((
    permission: string, 
    context?: PermissionCheckContext
  ): boolean => {
    if (!state.permissions) return false;
    
    const permissionValue = state.permissions[permission as keyof UserPermissions];
    
    // Boolean permissions
    if (typeof permissionValue === 'boolean') {
      return permissionValue;
    }
    
    // Scoped permissions
    if (Array.isArray(permissionValue)) {
      // Check if it's PermissionScopeContext[] or PermissionBasis[]
      if (permissionValue.length > 0 && 'type' in permissionValue[0] && 'squadronId' in permissionValue[0]) {
        return checkScopedPermission(permissionValue as PermissionScopeContext[], context);
      }
      // If it's PermissionBasis[], return true if user has any bases
      return permissionValue.length > 0;
    }
    
    return false;
  }, [state.permissions]);

  /**
   * Check multiple permissions efficiently (OR logic)
   */
  const hasAnyPermission = useCallback((permissions: string[], context?: PermissionCheckContext): boolean => {
    return permissions.some(permission => hasPermission(permission, context));
  }, [hasPermission]);

  /**
   * Check multiple permissions (AND logic)
   */
  const hasAllPermissions = useCallback((permissions: string[], context?: PermissionCheckContext): boolean => {
    return permissions.every(permission => hasPermission(permission, context));
  }, [hasPermission]);



  /**
   * Refresh permissions from server (bypass cache)
   */
  const refreshPermissions = useCallback(async () => {
    if (!userProfile?.authUserId) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const permissions = await permissionService.refreshUserPermissions(userProfile.authUserId);
      
      setState({
        permissions,
        loading: false,
        error: null,
        lastUpdated: new Date()
      });
    } catch (error: any) {
      console.error('Error refreshing permissions:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to refresh permissions'
      }));
    }
  }, [userProfile?.authUserId]);

  /**
   * Get user's current squadron and wing for context
   */
  const userContext = useMemo((): PermissionCheckContext | undefined => {
    if (!userProfile?.pilot?.currentSquadron) return undefined;
    
    return {
      squadronId: userProfile.pilot.currentSquadron.id,
      wingId: userProfile.pilot.currentSquadron.wing_id,
      userId: userProfile.authUserId
    };
  }, [userProfile]);

  return {
    // State
    permissions: state.permissions,
    loading: state.loading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    
    // Permission checks
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    
    // Utilities
    refreshPermissions,
    userContext,
    
    // Convenience getters
    canAccessHome: state.permissions?.canAccessHome || false,
    canAccessRoster: state.permissions?.canAccessRoster || false,
    canAccessEvents: state.permissions?.canAccessEvents || false,
    canAccessMissionPrep: state.permissions?.canAccessMissionPrep || false,
    canAccessFlights: state.permissions?.canAccessFlights || false,
    canAccessSettings: state.permissions?.canAccessSettings || false,
    canAccessReports: state.permissions?.canAccessReports || false,
    canAccessMissionDebriefing: state.permissions?.canAccessMissionDebriefing || false,

    // Training permissions
    manage_training_syllabi: state.permissions?.manage_training_syllabi || false,
    manage_training_debriefs: state.permissions?.manage_training_debriefs || false,
    view_all_training_progress: state.permissions?.view_all_training_progress || false,
    lock_unlock_missions: state.permissions?.lock_unlock_missions || false,
    access_my_training: state.permissions?.access_my_training || false,
    access_training_management: state.permissions?.access_training_management || false
  };
}

/**
 * Helper function to check scoped permissions against context
 */
function checkScopedPermission(scopes: PermissionScopeContext[], context?: PermissionCheckContext): boolean {
  if (!context) {
    // No context provided, check if user has any scope for this permission
    return scopes.length > 0;
  }
  
  return scopes.some(scope => {
    switch (scope.type) {
      case 'global':
        return true;
        
      case 'all_squadrons':
        return true;
        
      case 'all_wings':
        return true;
        
      case 'own_squadron':
        return context.squadronId === scope.squadronId;
        
      case 'own_wing':
        return context.wingId === scope.wingId;
        
      default:
        return false;
    }
  });
}

/**
 * Simplified hook for basic permission checking
 * Useful for simple yes/no permission checks without scope awareness
 */
export function useSimplePermissions() {
  const {
    hasPermission,
    loading,
    error,
    canAccessHome,
    canAccessRoster,
    canAccessEvents,
    canAccessMissionPrep,
    canAccessFlights,
    canAccessSettings,
    canAccessReports,
    canAccessMissionDebriefing,
    access_my_training,
    access_training_management
  } = usePermissions();

  return {
    // Basic checks (always boolean)
    canAccessHome,
    canAccessRoster,
    canAccessEvents,
    canAccessMissionPrep,
    canAccessFlights,
    canAccessSettings,
    canAccessReports,
    canAccessMissionDebriefing,
    access_my_training,
    access_training_management,

    // Generic permission check
    hasPermission,

    // State
    loading,
    error
  };
}

/**
 * Hook for component-level permission checks
 * Returns functions optimized for UI component visibility/disabling
 */
export function useComponentPermissions() {
  const { hasPermission, hasAnyPermission, userContext, loading } = usePermissions();

  /**
   * Check if component should be visible
   */
  const isVisible = useCallback((permission: string, context?: PermissionCheckContext): boolean => {
    if (loading) return false; // Hide while loading
    return hasPermission(permission, context || userContext);
  }, [hasPermission, userContext, loading]);

  /**
   * Check if component should be enabled
   */
  const isEnabled = useCallback((permission: string, context?: PermissionCheckContext): boolean => {
    if (loading) return false; // Disable while loading
    return hasPermission(permission, context || userContext);
  }, [hasPermission, userContext, loading]);

  /**
   * Get CSS classes for permission-based styling
   */
  const getPermissionClasses = useCallback((
    permission: string, 
    context?: PermissionCheckContext,
    classes: { allowed?: string; denied?: string; loading?: string } = {}
  ): string => {
    if (loading) return classes.loading || 'opacity-50';
    
    const hasAccess = hasPermission(permission, context || userContext);
    
    if (hasAccess) {
      return classes.allowed || '';
    } else {
      return classes.denied || 'opacity-50 cursor-not-allowed';
    }
  }, [hasPermission, userContext, loading]);

  return {
    isVisible,
    isEnabled,
    hasPermission,
    hasAnyPermission,
    getPermissionClasses,
    loading,
    userContext
  };
}

/**
 * Hook for squadron-specific permission checks
 * Provides convenience methods for common squadron-based operations
 */
export function useSquadronPermissions(squadronId?: string) {
  const { hasPermission, userContext } = usePermissions();

  const context: PermissionCheckContext | undefined = useMemo(() => {
    if (squadronId) {
      return { squadronId };
    }
    return userContext;
  }, [squadronId, userContext]);

  const canManageRoster = useCallback(() => 
    hasPermission('manage_roster', context), [hasPermission, context]);
    
  const canManageEvents = useCallback(() => 
    hasPermission('manage_events', context), [hasPermission, context]);
    
  const canEditSettings = useCallback(() => 
    hasPermission('manage_squadron_settings', context), [hasPermission, context]);
    
  const canPublishToDiscord = useCallback(() => 
    hasPermission('publish_to_discord', context), [hasPermission, context]);

  return {
    canManageRoster,
    canManageEvents,
    canEditSettings,
    canPublishToDiscord,
    hasPermission: (permission: string) => hasPermission(permission, context),
    squadronContext: context
  };
}