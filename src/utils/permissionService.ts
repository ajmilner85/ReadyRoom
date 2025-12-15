import { permissionCache } from './permissionCache';
import { permissionCalculator } from './permissionCalculator';
import type { 
  UserPermissions, 
  PermissionCheckContext, 
  PermissionCheckResponse,
  BulkPermissionCheckResponse,
  PermissionRule,
  AppPermission,
  GroupedPermissions,
  BasisOption,
  BasisType
} from '../types/PermissionTypes';
import { BASIS_TYPE_LABELS } from '../types/PermissionTypes';
import { supabase } from './supabaseClient';

export class PermissionService {
  
  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, permission: string, context?: PermissionCheckContext): Promise<boolean> {
    try {
      const permissions = await permissionCache.getUserPermissions(userId);
      return permissionCalculator.checkPermission(permissions, permission, context);
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }
  
  /**
   * Get detailed permission check result
   */
  async checkPermission(userId: string, permission: string, context?: PermissionCheckContext): Promise<PermissionCheckResponse> {
    try {
      const permissions = await permissionCache.getUserPermissions(userId);
      const hasAccess = permissionCalculator.checkPermission(permissions, permission, context);
      
      const permissionValue = permissions[permission as keyof UserPermissions];
      const matchingScopes = Array.isArray(permissionValue) ? permissionValue as any[] : undefined;
      
      return {
        hasPermission: hasAccess,
        matchingScopes,
        reason: hasAccess ? 'Granted' : 'Insufficient permissions'
      };
      
    } catch (error) {
      console.error('Error in detailed permission check:', error);
      return {
        hasPermission: false,
        reason: 'Permission check failed'
      };
    }
  }
  
  /**
   * Check multiple permissions efficiently
   */
  async checkMultiplePermissions(userId: string, permissionList: string[], context?: PermissionCheckContext): Promise<BulkPermissionCheckResponse> {
    try {
      const permissions = await permissionCache.getUserPermissions(userId);
      const results: Record<string, boolean> = {};
      const details: Record<string, PermissionCheckResponse> = {};
      
      for (const permission of permissionList) {
        const hasAccess = permissionCalculator.checkPermission(permissions, permission, context);
        results[permission] = hasAccess;
        
        const permissionValue = permissions[permission as keyof UserPermissions];
        details[permission] = {
          hasPermission: hasAccess,
          matchingScopes: Array.isArray(permissionValue) ? permissionValue as any[] : undefined,
          reason: hasAccess ? 'Granted' : 'Insufficient permissions'
        };
      }
      
      return { permissions: results, details };
      
    } catch (error) {
      console.error('Error in bulk permission check:', error);
      const errorResults: Record<string, boolean> = {};
      permissionList.forEach(p => errorResults[p] = false);
      return { permissions: errorResults };
    }
  }
  
  /**
   * Get user's full permission set
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    return await permissionCache.getUserPermissions(userId);
  }
  
  /**
   * Force recalculation of user permissions (bypasses cache)
   */
  async refreshUserPermissions(userId: string): Promise<UserPermissions> {
    await permissionCache.invalidateUserPermissions(userId);
    return await permissionCache.getUserPermissions(userId);
  }
  
  /**
   * Invalidate user permission cache
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    await permissionCache.invalidateUserPermissions(userId);
  }
  
  /**
   * Invalidate all permission caches (when rules change)
   */
  async invalidateAllPermissions(): Promise<void> {
    await permissionCache.invalidateAllPermissions();
  }
  
  // ============================================================================
  // PERMISSION MANAGEMENT API (for admin interface)
  // ============================================================================
  
  /**
   * Get all available permissions grouped by category
   */
  async getGroupedPermissions(): Promise<GroupedPermissions> {
    const { data, error } = await supabase
      .from('app_permissions' as any)
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) {
      throw new Error(`Failed to fetch permissions: ${error.message}`);
    }
    
    const grouped: GroupedPermissions = {
      navigation: [],
      roster: [],
      events: [],
      settings: [],
      missionPrep: [],
      debriefing: [],
      other: []
    };

    for (const perm of data || []) {
      const permission: AppPermission = {
        id: (perm as any).id,
        name: (perm as any).name,
        displayName: (perm as any).display_name,
        description: (perm as any).description,
        category: (perm as any).category,
        scopeType: (perm as any).scope_type,
        availableScopes: (perm as any).available_scopes,
        createdAt: (perm as any).created_at,
        updatedAt: (perm as any).updated_at
      };

      switch ((perm as any).category) {
        case 'navigation':
          grouped.navigation.push(permission);
          break;
        case 'roster':
          grouped.roster.push(permission);
          break;
        case 'events':
          grouped.events.push(permission);
          break;
        case 'settings':
          grouped.settings.push(permission);
          break;
        case 'mission_prep':
          grouped.missionPrep.push(permission);
          break;
        case 'debriefing':
          grouped.debriefing.push(permission);
          break;
        default:
          grouped.other.push(permission);
      }
    }
    
    return grouped;
  }
  
  /**
   * Get basis options for a specific basis type
   */
  async getBasisOptions(basisType: BasisType): Promise<BasisOption[]> {
    switch (basisType) {
      case 'standing':
        return await this.getStandingOptions();
      case 'qualification':
        return await this.getQualificationOptions();
      case 'billet':
        return await this.getBilletOptions();
      case 'team':
        return await this.getTeamOptions();
      case 'squadron':
        return await this.getSquadronOptions();
      case 'wing':
        return await this.getWingOptions();
      case 'authenticated_user':
        return [{ id: 'authenticated_user', name: 'All Authenticated Users', type: 'authenticated_user' }];
      case 'manual_override':
        return [{ id: 'manual_override', name: 'Manual Override', type: 'manual_override' }];
      default:
        return [];
    }
  }
  
  private async getStandingOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('standings')
      .select('id, name')
      .order('name');
    
    if (error) throw new Error(`Failed to fetch standings: ${error.message}`);
    
    return data?.map(s => ({
      id: s.id,
      name: s.name,
      type: 'standing' as BasisType
    })) || [];
  }
  
  private async getQualificationOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('qualifications')
      .select('id, name')
      .eq('active', true)
      .order('name');
    
    if (error) throw new Error(`Failed to fetch qualifications: ${error.message}`);
    
    return data?.map(q => ({
      id: q.id,
      name: q.name,
      type: 'qualification' as BasisType
    })) || [];
  }
  
  private async getBilletOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, order')
      .order('order', { ascending: true, nullsFirst: false })
      .order('name'); // Secondary sort by name for roles without order
    
    if (error) throw new Error(`Failed to fetch roles: ${error.message}`);
    
    return data?.map(r => ({
      id: r.id,
      name: r.name,
      type: 'billet' as BasisType
    })) || [];
  }
  
  private async getSquadronOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('org_squadrons')
      .select('id, name, designation')
      .order('name');
    
    if (error) throw new Error(`Failed to fetch squadrons: ${error.message}`);
    
    return data?.map(s => ({
      id: s.id,
      name: `${s.designation} ${s.name}`,
      type: 'squadron' as BasisType
    })) || [];
  }
  
  private async getWingOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('org_wings')
      .select('id, name, designation')
      .order('name');

    if (error) {
      console.warn('No wings table found, returning empty options');
      return [];
    }

    return data?.map(w => ({
      id: w.id,
      name: `${w.designation} ${w.name}`,
      type: 'wing' as BasisType
    })) || [];
  }

  private async getTeamOptions(): Promise<BasisOption[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, description, scope')
      .eq('active', true)
      .order('scope', { ascending: true })
      .order('name');

    if (error) {
      console.warn('Error fetching teams, returning empty options:', error);
      return [];
    }

    return data?.map(t => ({
      id: t.id,
      name: t.scope !== 'global' ? `${t.name} (${t.scope})` : t.name,
      type: 'team' as BasisType,
      description: t.description || undefined
    })) || [];
  }
  
  /**
   * Get all permission rules for a basis type with basis names resolved
   */
  async getPermissionRules(basisType?: BasisType): Promise<PermissionRule[]> {
    let query = supabase
      .from('permission_rules' as any)
      .select(`
        id,
        permission_id,
        basis_type,
        basis_id,
        scope,
        active,
        created_at,
        updated_at,
        created_by,
        app_permissions!inner (
          id,
          name,
          display_name,
          description
        )
      `)
      .order('created_at', { ascending: false });
    
    if (basisType) {
      query = query.eq('basis_type', basisType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch permission rules: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Resolve basis names for each rule
    const enrichedRules = await Promise.all(data.map(async (rule) => {
      let basisName: string | undefined;
      
      if ((rule as any).basis_id) {
        try {
          basisName = await this.resolveBasisName((rule as any).basis_type as BasisType, (rule as any).basis_id);
        } catch (error) {
          console.warn(`Failed to resolve basis name for ${(rule as any).basis_type}:${(rule as any).basis_id}`, error);
          basisName = `Unknown ${(rule as any).basis_type}`;
        }
      } else {
        basisName = BASIS_TYPE_LABELS[(rule as any).basis_type as BasisType] || (rule as any).basis_type;
      }
      
      return {
        id: (rule as any).id,
        permissionId: (rule as any).permission_id,
        permissionName: (rule as any).app_permissions.name,
        permissionDisplayName: (rule as any).app_permissions.display_name,
        permissionDescription: (rule as any).app_permissions.description,
        basisType: (rule as any).basis_type as BasisType,
        basisId: (rule as any).basis_id,
        basisName,
        scope: (rule as any).scope,
        active: (rule as any).active,
        createdAt: (rule as any).created_at,
        updatedAt: (rule as any).updated_at,
        createdBy: (rule as any).created_by
      };
    }));
    
    return enrichedRules;
  }
  
  /**
   * Create a new permission rule
   */
  async createPermissionRule(rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>, createdBy: string): Promise<PermissionRule> {
    console.log('Creating permission rule with data:', {
      permission_id: rule.permissionId,
      basis_type: rule.basisType,
      basis_id: rule.basisId,
      scope: rule.scope,
      active: rule.active,
      created_by: createdBy
    });
    
    const { data, error } = await supabase
      .from('permission_rules' as any)
      .insert({
        permission_id: rule.permissionId,
        basis_type: rule.basisType,
        basis_id: rule.basisId,
        scope: rule.scope,
        active: rule.active,
        created_by: createdBy
      })
      .select()
      .single();
    
    if (error) {
      console.error('Full error details:', error);
      throw new Error(`Failed to create permission rule: ${error.message}`);
    }
    
    // TODO: Temporarily disabled cache invalidation due to DELETE WHERE clause issue
    // try {
    //   await this.invalidateAllPermissions();
    // } catch (cacheError) {
    //   console.warn('Cache invalidation failed, but permission rule was created:', cacheError);
    // }
    
    return {
      id: (data as any).id,
      permissionId: (data as any).permission_id,
      basisType: (data as any).basis_type as BasisType,
      basisId: (data as any).basis_id,
      scope: (data as any).scope,
      active: (data as any).active,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
      createdBy: (data as any).created_by
    };
  }
  
  /**
   * Update an existing permission rule
   */
  async updatePermissionRule(ruleId: string, updates: Partial<Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PermissionRule> {
    const updateData: any = {};
    
    if (updates.permissionId) updateData.permission_id = updates.permissionId;
    if (updates.basisType) updateData.basis_type = updates.basisType;
    if (updates.basisId !== undefined) updateData.basis_id = updates.basisId;
    if (updates.scope) updateData.scope = updates.scope;
    if (updates.active !== undefined) updateData.active = updates.active;
    
    const { data, error } = await supabase
      .from('permission_rules' as any)
      .update(updateData)
      .eq('id', ruleId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update permission rule: ${error.message}`);
    }
    
    // Invalidate all caches since rules changed
    await this.invalidateAllPermissions();
    
    return {
      id: (data as any).id,
      permissionId: (data as any).permission_id,
      basisType: (data as any).basis_type as BasisType,
      basisId: (data as any).basis_id,
      scope: (data as any).scope,
      active: (data as any).active,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
      createdBy: (data as any).created_by
    };
  }
  
  /**
   * Delete a permission rule
   */
  async deletePermissionRule(ruleId: string): Promise<void> {
    const { error } = await supabase
      .from('permission_rules' as any)
      .delete()
      .eq('id', ruleId);
    
    if (error) {
      throw new Error(`Failed to delete permission rule: ${error.message}`);
    }
    
    // Invalidate all caches since rules changed
    await this.invalidateAllPermissions();
  }
  
  /**
   * Create multiple permission rules in bulk
   */
  async bulkCreatePermissionRules(rules: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>[], createdBy: string): Promise<PermissionRule[]> {
    const insertData = rules.map(rule => ({
      permission_id: rule.permissionId,
      basis_type: rule.basisType,
      basis_id: rule.basisId,
      scope: rule.scope,
      active: rule.active,
      created_by: createdBy
    }));
    
    const { data, error } = await supabase
      .from('permission_rules' as any)
      .insert(insertData)
      .select();
    
    if (error) {
      throw new Error(`Failed to bulk create permission rules: ${error.message}`);
    }
    
    // Invalidate all caches since rules changed
    await this.invalidateAllPermissions();
    
    return data?.map(rule => ({
      id: (rule as any).id,
      permissionId: (rule as any).permission_id,
      basisType: (rule as any).basis_type as BasisType,
      basisId: (rule as any).basis_id,
      scope: (rule as any).scope,
      active: (rule as any).active,
      createdAt: (rule as any).created_at,
      updatedAt: (rule as any).updated_at,
      createdBy: (rule as any).created_by
    })) || [];
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    return permissionCache.getCacheStats();
  }
  
  /**
   * Resolve human-readable name for a basis entry
   */
  private async resolveBasisName(basisType: BasisType, basisId: string): Promise<string> {
    switch (basisType) {
      case 'standing': {
        const { data, error } = await supabase
          .from('standings')
          .select('name')
          .eq('id', basisId)
          .single();
        
        if (error) throw error;
        return data?.name || 'Unknown Standing';
      }
      
      case 'qualification': {
        const { data, error } = await supabase
          .from('qualifications')
          .select('name')
          .eq('id', basisId)
          .single();
        
        if (error) throw error;
        return data?.name || 'Unknown Qualification';
      }
      
      case 'billet': {
        const { data, error } = await supabase
          .from('roles')
          .select('name')
          .eq('id', basisId)
          .single();
        
        if (error) throw error;
        return data?.name || 'Unknown Role';
      }
      
      case 'squadron': {
        const { data, error } = await supabase
          .from('org_squadrons')
          .select('name, designation')
          .eq('id', basisId)
          .single();
        
        if (error) throw error;
        return data ? `${data.designation} ${data.name}` : 'Unknown Squadron';
      }
      
      case 'wing': {
        const { data, error } = await supabase
          .from('org_wings')
          .select('name, designation')
          .eq('id', basisId)
          .single();

        if (error) throw error;
        return data ? `${data.designation} ${data.name}` : 'Unknown Wing';
      }

      case 'team': {
        const { data, error } = await supabase
          .from('teams')
          .select('name, scope')
          .eq('id', basisId)
          .single();

        if (error) throw error;
        return data ? (data.scope !== 'global' ? `${data.name} (${data.scope})` : data.name) : 'Unknown Team';
      }

      case 'authenticated_user':
        return 'All Authenticated Users';

      case 'manual_override':
        return 'Manual Override';

      default:
        return 'Unknown Basis';
    }
  }
  
  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(): Promise<number> {
    try {
      // Note: Temporarily disabled cache cleanup due to type issues
      // const { data, error } = await supabase.rpc('clean_expired_permission_cache');
      
      // if (error) {
      //   console.warn('Error cleaning expired cache:', error);
      //   return 0;
      // }
      
      return 0;
    } catch (error) {
      console.warn('Error calling cache cleanup function:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const permissionService = new PermissionService();

// Convenience functions for common permission checks
export async function hasPermission(userId: string, permission: string, context?: PermissionCheckContext): Promise<boolean> {
  return await permissionService.hasPermission(userId, permission, context);
}

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  return await permissionService.getUserPermissions(userId);
}

export async function requirePermission(userId: string, permission: string, context?: PermissionCheckContext): Promise<void> {
  const hasAccess = await permissionService.hasPermission(userId, permission, context);
  if (!hasAccess) {
    throw new Error(`Insufficient permissions: ${permission}`);
  }
}