import { supabase } from './supabaseClient';
import { permissionCalculator } from './permissionCalculator';
import type { UserPermissions, UserPermissionCache } from '../types/PermissionTypes';
import { PERMISSION_CACHE_CONFIG } from '../types/PermissionTypes';
import crypto from 'crypto';

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
      // Use database function if available, otherwise calculate here
      const { data, error } = await supabase
        .rpc('get_user_bases_hash', { p_user_id: userId });
      
      if (error || !data) {
        console.warn('Could not get bases hash from DB function, calculating manually:', error);
        return await this.calculateBasesHashManually(userId);
      }
      
      return data;
      
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
      
      return crypto.createHash('sha256').update(basesData).digest('hex');
      
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
        return null;
      }

      const { data, error } = await supabase
        .from('user_permission_cache')
        .select('*')
        .eq('user_id', userProfileId)
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return {
        userId: userId, // Return the original auth_user_id for consistency
        permissions: data.permissions as UserPermissions,
        basesHash: data.bases_hash,
        calculatedAt: new Date(data.calculated_at),
        expiresAt: new Date(data.expires_at)
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
        console.warn('Cannot store cache: user profile not found for auth_user_id:', cacheEntry.userId);
        return;
      }

      const { error } = await supabase
        .from('user_permission_cache')
        .upsert({
          user_id: userProfileId, // Use user_profiles.id instead of auth_user_id
          permissions: cacheEntry.permissions,
          bases_hash: cacheEntry.basesHash,
          calculated_at: cacheEntry.calculatedAt.toISOString(),
          expires_at: cacheEntry.expiresAt.toISOString()
        });
      
      if (error) {
        console.warn('Error storing database cache:', error);
      }
      
    } catch (error) {
      console.warn('Error storing database cache:', error);
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
          .from('user_permission_cache')
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
        .from('user_permission_cache')
        .select('*', { count: 'exact', head: true });
      
      if (count && count > 0) {
        // Only delete if there are records
        const { error } = await supabase
          .from('user_permission_cache')
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
      
      // All scoped permissions empty
      canManageRoster: [],
      canEditPilotQualifications: [],
      canDeletePilots: [],
      canManageStandings: [],
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
      
      canSyncWithDiscord: [],
      canAccessAdminTools: false,
      canViewOwnProfile: true, // Always allow viewing own profile
      
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