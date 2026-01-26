import { supabase } from './supabaseClient';
import { permissionCalculator } from './permissionCalculator';
import type { UserPermissions, UserPermissionCache } from '../types/PermissionTypes';
import { PERMISSION_CACHE_CONFIG } from '../types/PermissionTypes';

export class PermissionCacheService {
  private memoryCache = new Map<string, UserPermissionCache>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startCleanupTimer();
  }
  
  /**
   * Get user permissions with caching
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    // Check memory cache first
    const memoryCached = this.memoryCache.get(userId);
    if (memoryCached && await this.isCacheValid(memoryCached)) {
      return memoryCached.permissions;
    }
    
    // Check database cache
    const dbCached = await this.getFromDatabaseCache(userId);
    if (dbCached && await this.isCacheValid(dbCached)) {
      // Store in memory cache for faster access
      this.memoryCache.set(userId, dbCached);
      return dbCached.permissions;
    }
    
    // Cache miss - calculate fresh permissions
    return await this.calculateAndCache(userId);
  }
  
  /**
   * Proactively refresh cache if expired or near expiry
   * Returns true if cache was refreshed, false if still valid
   */
  async refreshIfNeeded(userId: string, safetyMarginMs: number = 5 * 60 * 1000): Promise<boolean> {
    const cached = this.memoryCache.get(userId);

    // Check memory cache first
    if (cached) {
      const expiresIn = cached.expiresAt.getTime() - Date.now();
      if (expiresIn > safetyMarginMs) {
        return false; // Cache still valid
      }
    }

    // Cache expired or near expiry - regenerate
    await this.calculateAndCache(userId);
    return true;
  }

  /**
   * Get cache expiry time for a user (for UI/monitoring)
   */
  getCacheExpiry(userId: string): Date | null {
    const cached = this.memoryCache.get(userId);
    return cached?.expiresAt || null;
  }

  /**
   * Calculate fresh permissions and cache them
   */
  private async calculateAndCache(userId: string): Promise<UserPermissions> {
    
    try {
      // Calculate new permissions
      const permissions = await permissionCalculator.calculateUserPermissions(userId);
      
      // Generate bases hash for cache validation
      const basesHash = await this.calculateBasesHash(userId);
      
      // Create cache entry
      const cacheEntry: UserPermissionCache = {
        userId,
        permissions,
        basesHash,
        calculatedAt: new Date(),
        expiresAt: new Date(Date.now() + PERMISSION_CACHE_CONFIG.DURATION_MS)
      };
      
      // Store in both memory and database cache
      await Promise.all([
        this.storeInMemoryCache(cacheEntry),
        this.storeDatabaseCache(cacheEntry)
      ]);
      
      return permissions;
      
    } catch (error) {
      console.error('Error calculating permissions for user:', userId, error);
      // Return minimal permissions on error
      return this.getEmptyPermissions();
    }
  }
  
  /**
   * Check if cached permissions are still valid
   */
  private async isCacheValid(cached: UserPermissionCache): Promise<boolean> {
    // Check expiration
    if (Date.now() > cached.expiresAt.getTime()) {
      return false;
    }
    
    // Check if user's bases have changed by comparing hash
    const currentBasesHash = await this.calculateBasesHash(cached.userId);
    return cached.basesHash === currentBasesHash;
  }
  
  /**
   * Calculate hash of user's current permission bases
   */
  private async calculateBasesHash(userId: string): Promise<string> {
    try {
      // Note: Temporarily disabled function call due to type issues
      // const { data, error } = await supabase
      //   .rpc('get_user_bases_hash', { p_user_id: userId });
      
      // if (error || !data) {
      //   console.warn('Could not get bases hash from DB function, calculating manually:', error);
        return await this.calculateBasesHashManually(userId);
      // }
      
      // return data;
      
    } catch (error) {
      console.warn('Error calculating bases hash:', error);
      return await this.calculateBasesHashManually(userId);
    }
  }
  
  /**
   * Manual calculation of bases hash as fallback
   */
  private async calculateBasesHashManually(userId: string): Promise<string> {
    try {
      // Get user profile and pilot info
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('pilot_id')
        .eq('auth_user_id', userId)
        .single();
      
      if (!profile?.pilot_id) {
        return 'no_pilot';
      }
      
      // Get all current bases
      const [standings, qualifications, billets, assignments] = await Promise.all([
        this.getCurrentStandings(profile.pilot_id),
        this.getCurrentQualifications(profile.pilot_id),
        this.getCurrentBillets(profile.pilot_id),
        this.getCurrentAssignments(profile.pilot_id)
      ]);
      
      // Create hash from all bases data
      const basesData = [
        ...standings.map(s => `standing:${s.id}`),
        ...qualifications.map(q => `qualification:${q.id}`),
        ...billets.map(b => `billet:${b.id}`),
        ...assignments.map(a => `squadron:${a.id}`)
      ].sort().join('|');
      
      // Use Web Crypto API for browser compatibility
      const encoder = new TextEncoder();
      const data = encoder.encode(basesData);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
    } catch (error) {
      console.warn('Error in manual bases hash calculation:', error);
      return 'error';
    }
  }
  
  private async getCurrentStandings(pilotId: string) {
    const { data } = await supabase
      .from('pilot_standings')
      .select('standing_id')
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');
    return data?.map(s => ({ id: s.standing_id })) || [];
  }
  
  private async getCurrentQualifications(pilotId: string) {
    const { data } = await supabase
      .from('pilot_qualifications')
      .select('qualification_id')
      .eq('pilot_id', pilotId)
      .or('expiry_date.is.null,expiry_date.gt.now()');
    return data?.map(q => ({ id: q.qualification_id })) || [];
  }
  
  private async getCurrentBillets(pilotId: string) {
    const { data } = await supabase
      .from('pilot_roles')
      .select('role_id')
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');
    return data?.map(r => ({ id: r.role_id })) || [];
  }
  
  private async getCurrentAssignments(pilotId: string) {
    const { data } = await supabase
      .from('pilot_assignments')
      .select('squadron_id')
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');
    return data?.map(a => ({ id: a.squadron_id })) || [];
  }
  
  /**
   * Get cached permissions from database
   */
  private async getFromDatabaseCache(userId: string): Promise<UserPermissionCache | null> {
    try {
      // Convert auth_user_id to user_profiles.id for the lookup
      const userProfileId = await this.getUserProfileId(userId);
      if (!userProfileId) {
        console.log('getFromDatabaseCache: No user profile ID found for auth user:', userId);
        return null;
      }

      console.log('getFromDatabaseCache: Fetching cache for user_id:', userProfileId);

      const { data, error } = await supabase
        .from('user_permission_cache' as any)
        .select('*')
        .eq('user_id', userProfileId)
        .maybeSingle();

      if (error || !data) {
        console.log('getFromDatabaseCache: No cache found or error:', error);
        return null;
      }

      console.log('getFromDatabaseCache: Successfully loaded cache with permissions:', {
        access_my_training: (data as any).permissions?.access_my_training,
        access_training_management: (data as any).permissions?.access_training_management
      });
      
      return {
        userId: userId, // Return the original auth_user_id for consistency
        permissions: (data as any).permissions as UserPermissions,
        basesHash: (data as any).bases_hash,
        calculatedAt: new Date((data as any).calculated_at),
        expiresAt: new Date((data as any).expires_at)
      };
      
    } catch (error) {
      console.warn('Error reading database cache:', error);
      return null;
    }
  }
  
  /**
   * Convert auth_user_id to user_profiles.id
   */
  private async getUserProfileId(authUserId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', authUserId)
        .single();
      
      if (error || !data) {
        console.warn('Could not find user profile for auth_user_id:', authUserId);
        return null;
      }
      
      return data.id;
    } catch (error) {
      console.warn('Error getting user profile ID:', error);
      return null;
    }
  }

  /**
   * Store permissions in database cache
   */
  private async storeDatabaseCache(cacheEntry: UserPermissionCache): Promise<void> {
    try {
      // Convert auth_user_id to user_profiles.id for the foreign key
      const userProfileId = await this.getUserProfileId(cacheEntry.userId);
      if (!userProfileId) {
        console.error('Cannot store cache: user profile not found for auth_user_id:', cacheEntry.userId);
        return;
      }

      console.log('Storing permission cache to database:', {
        userProfileId,
        expiresAt: cacheEntry.expiresAt,
        access_my_training: cacheEntry.permissions.access_my_training,
        access_training_management: cacheEntry.permissions.access_training_management,
        permissionsKeys: Object.keys(cacheEntry.permissions)
      });

      const { data, error } = await supabase
        .from('user_permission_cache' as any)
        .upsert({
          user_id: userProfileId, // Use user_profiles.id instead of auth_user_id
          permissions: cacheEntry.permissions,
          bases_hash: cacheEntry.basesHash,
          calculated_at: cacheEntry.calculatedAt.toISOString(),
          expires_at: cacheEntry.expiresAt.toISOString()
        })
        .select();

      if (error) {
        console.error('Error storing database cache:', error);
      } else {
        console.log('Successfully stored permission cache in database:', data);
      }

    } catch (error) {
      console.error('Error storing database cache:', error);
    }
  }
  
  /**
   * Store permissions in memory cache
   */
  private storeInMemoryCache(cacheEntry: UserPermissionCache): void {
    // Enforce cache size limit
    if (this.memoryCache.size >= PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE) {
      this.cleanupMemoryCache();
    }
    
    this.memoryCache.set(cacheEntry.userId, cacheEntry);
  }
  
  /**
   * Invalidate all cached permissions for a user
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    console.log('Invalidating permissions for user:', userId);
    
    try {
      // Remove from memory cache
      this.memoryCache.delete(userId);
      
      // Convert auth_user_id to user_profiles.id for database cache deletion
      const userProfileId = await this.getUserProfileId(userId);
      if (userProfileId) {
        await supabase
          .from('user_permission_cache' as any)
          .delete()
          .eq('user_id', userProfileId);
      }
        
    } catch (error) {
      console.warn('Error invalidating user permissions:', error);
    }
  }

  /**
   * Invalidate all cached permissions (useful when rules change)
   */
  async invalidateAllPermissions(): Promise<void> {
    console.log('Invalidating all cached permissions');
    
    try {
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear database cache - first check if there are any records
      const { count } = await supabase
        .from('user_permission_cache' as any)
        .select('*', { count: 'exact', head: true });
      
      if (count && count > 0) {
        // Only delete if there are records
        const { error } = await supabase
          .from('user_permission_cache' as any)
          .delete()
          .gte('calculated_at', '1970-01-01'); // Match all records (safe WHERE clause)
        
        if (error) {
          console.warn('Error deleting from database cache:', error);
        }
      } else {
        console.log('No records in cache to delete');
      }
        
    } catch (error) {
      console.warn('Error invalidating all permissions:', error);
    }
  }


  /**
   * Clean up expired entries from memory cache
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [userId, cache] of this.memoryCache.entries()) {
      if (now > cache.expiresAt.getTime()) {
        this.memoryCache.delete(userId);
        removedCount++;
      }
    }
    
    // If still over limit, remove oldest entries
    if (this.memoryCache.size >= PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE) {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort(([,a], [,b]) => a.calculatedAt.getTime() - b.calculatedAt.getTime());
      
      const toRemove = entries.slice(0, Math.floor(PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE * 0.1));
      for (const [userId] of toRemove) {
        this.memoryCache.delete(userId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired/old permission cache entries`);
    }
  }
  
  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupMemoryCache(),
      PERMISSION_CACHE_CONFIG.CLEANUP_INTERVAL_MS
    );
  }
  
  /**
   * Stop cleanup timer (for cleanup/testing)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Get empty permissions for error cases
   */
  private getEmptyPermissions(): UserPermissions {
    return {
      // All navigation permissions false
      canAccessHome: false,
      canAccessRoster: false,
      canAccessEvents: false,
      canAccessMissionPrep: false,
      canAccessFlights: false,
      canAccessSettings: false,
      canAccessReports: false,
      canAccessMissionDebriefing: false,

      // All scoped permissions empty
      canManageRoster: [],
      canEditPilotQualifications: [],
      canDeletePilots: [],
      canManageStandings: [],
      canBulkEditRoster: [],
      canViewPublicRoster: false,
      
      canManageEvents: [],
      canCreateTrainingCycles: [],
      canManageEventAttendance: [],
      canOverrideEventSettings: [],
      
      canEditOrganizationSettings: false,
      canManageSquadronSettings: [],
      canManageUserAccounts: false,
      canEditDiscordIntegration: [],
      
      canEditFlightAssignments: [],
      canAssignMissionRoles: [],
      canPublishToDiscord: [],

      view_debriefs: [],
      edit_debriefs: [],
      finalize_debriefs: [],
      delegate_debriefs: [],
      submit_training_debriefs: false,

      canSyncWithDiscord: [],
      manage_dcs_reference_data: false,
      canViewOwnProfile: true, // Always allow viewing own profile

      // Developer permissions
      access_developer_settings: false,
      
      // New permissions for polls and change log
      canManagePolls: false,
      canVoteInPolls: false,
      canManageChangeLog: false,
      canReactToPosts: false,

      // Training permissions
      manage_training_syllabi: false,
      manage_training_debriefs: false,
      manage_training_enrollments: false,
      view_all_training_progress: false,
      lock_unlock_missions: false,
      access_my_training: false,
      access_training_management: false,

      // Kneeboard permissions
      access_kneeboard: false,

      bases: [],
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + PERMISSION_CACHE_CONFIG.DURATION_MS)
    };
  }
  
  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      maxCacheSize: PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE,
      cacheDurationMs: PERMISSION_CACHE_CONFIG.DURATION_MS,
      cleanupIntervalMs: PERMISSION_CACHE_CONFIG.CLEANUP_INTERVAL_MS
    };
  }
}

// Export singleton instance
export const permissionCache = new PermissionCacheService();