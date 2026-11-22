import type {
  UserPermissions,
  PermissionScopeContext,
  PermissionCheckContext
} from '../types/PermissionTypes';

/**
 * Checks permissions the database computed. The computation itself lives in
 * the database (compute_user_permissions, driven by app_permissions.cache_key
 * and cache_kind); the client never calculates or writes permissions.
 */
export class PermissionCalculator {

  /**
   * Check if user has a specific permission with optional context
   */
  checkPermission(permissions: UserPermissions, permission: string, context?: PermissionCheckContext): boolean {
    const permissionValue = permissions[permission as keyof UserPermissions];
    
    // Boolean permissions
    if (typeof permissionValue === 'boolean') {
      return permissionValue;
    }
    
    // Scoped permissions  
    if (Array.isArray(permissionValue)) {
      return this.checkScopedPermission(permissionValue as PermissionScopeContext[], context);
    }
    
    return false;
  }
  
  /**
   * Check scoped permission against context
   */
  private checkScopedPermission(scopes: PermissionScopeContext[], context?: PermissionCheckContext): boolean {
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
}

// Export singleton instance
export const permissionCalculator = new PermissionCalculator();