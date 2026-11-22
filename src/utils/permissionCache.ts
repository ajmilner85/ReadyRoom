import { supabase } from './supabaseClient';
import type { UserPermissions } from '../types/PermissionTypes';
import { PERMISSION_CACHE_CONFIG } from '../types/PermissionTypes';
import { emptyPermissions, withPermissionDefaults } from './permissionDefaults';

/**
 * Permissions are computed by the database (compute_user_permissions) and
 * stored in user_permission_cache. The client only reads its own row and asks
 * the database to recompute it (refresh_my_permissions); it never writes
 * permissions. The database recomputes the row itself whenever a rule, the
 * permission map or one of the user's standings, qualifications, billets,
 * teams or squadron assignments changes.
 */

interface CachedEntry {
  permissions: UserPermissions;
  expiresAt: Date;
  fetchedAt: number;
}

/** What refresh_my_permissions returns. */
interface RefreshResult {
  permissions: unknown;
  expires_at: string;
  stored: boolean;
}

/** How long a fetched row is trusted in memory before the database row is read again. */
const MEMORY_TTL_MS = 60 * 1000;

export class PermissionCacheService {
  private memoryCache = new Map<string, CachedEntry>();
  private inflight = new Map<string, Promise<UserPermissions>>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Permissions of the signed-in user. `userId` is the auth user id; the
   * database only computes and returns the caller's own permissions, so any
   * other id gets no permissions.
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const cached = this.memoryCache.get(userId);
    if (cached && this.isFresh(cached, 0) && Date.now() - cached.fetchedAt < MEMORY_TTL_MS) {
      return cached.permissions;
    }

    const running = this.inflight.get(userId);
    if (running) return running;

    const load = this.load(userId).finally(() => this.inflight.delete(userId));
    this.inflight.set(userId, load);
    return load;
  }

  /**
   * Refresh if the cached permissions expire within the safety margin.
   * Returns true if they were refreshed.
   */
  async refreshIfNeeded(userId: string, safetyMarginMs: number = PERMISSION_CACHE_CONFIG.REFRESH_MARGIN_MS): Promise<boolean> {
    const cached = this.memoryCache.get(userId);
    if (cached && this.isFresh(cached, safetyMarginMs)) return false;
    await this.refresh(userId);
    return true;
  }

  getCacheExpiry(userId: string): Date | null {
    return this.memoryCache.get(userId)?.expiresAt || null;
  }

  /** Drop the in-memory copy and have the database recompute the user's row. */
  async invalidateUserPermissions(userId: string): Promise<void> {
    this.memoryCache.delete(userId);
    try {
      await this.refresh(userId);
    } catch (error) {
      console.warn('Error refreshing user permissions:', error);
    }
  }

  /**
   * Rule changes are recomputed for every user by the database. This only
   * clears what this browser holds and recomputes the current user.
   */
  async invalidateAllPermissions(): Promise<void> {
    this.memoryCache.clear();
    const userId = await this.currentUserId();
    if (userId) await this.invalidateUserPermissions(userId);
  }

  private isFresh(entry: CachedEntry, marginMs: number): boolean {
    return entry.expiresAt.getTime() - Date.now() > marginMs;
  }

  private async load(userId: string): Promise<UserPermissions> {
    try {
      if (userId !== await this.currentUserId()) {
        console.warn('Permissions requested for a user other than the signed-in user');
        return emptyPermissions();
      }

      // RLS returns only the caller's own row.
      const { data, error } = await supabase
        .from('user_permission_cache')
        .select('permissions, expires_at')
        .maybeSingle();
      if (!error && data) {
        const entry = this.toEntry(data.permissions, data.expires_at);
        if (this.isFresh(entry, PERMISSION_CACHE_CONFIG.REFRESH_MARGIN_MS)) {
          this.memoryCache.set(userId, entry);
          return entry.permissions;
        }
      }
      return await this.refresh(userId);
    } catch (error) {
      console.error('Error loading permissions for user:', userId, error);
      return { ...emptyPermissions(), canViewOwnProfile: true };
    }
  }

  private async refresh(userId: string): Promise<UserPermissions> {
    if (userId !== await this.currentUserId()) return emptyPermissions();
    const rpc = supabase.rpc.bind(supabase) as unknown as (fn: 'refresh_my_permissions') => Promise<{ data: RefreshResult | null; error: unknown }>;
    const { data, error } = await rpc('refresh_my_permissions');
    if (error || !data) {
      throw error || new Error('refresh_my_permissions returned nothing');
    }
    const entry = this.toEntry(data.permissions, data.expires_at);
    this.storeInMemoryCache(userId, entry);
    return entry.permissions;
  }

  private toEntry(rawPermissions: unknown, rawExpiresAt: unknown): CachedEntry {
    const permissions = withPermissionDefaults(rawPermissions);
    const expiresAt = new Date(rawExpiresAt as string);
    return {
      permissions,
      expiresAt: Number.isNaN(expiresAt.getTime()) ? new Date(0) : expiresAt,
      fetchedAt: Date.now(),
    };
  }

  private async currentUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  private storeInMemoryCache(userId: string, entry: CachedEntry): void {
    if (this.memoryCache.size >= PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE) {
      this.cleanupMemoryCache();
    }
    this.memoryCache.set(userId, entry);
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [userId, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt.getTime()) this.memoryCache.delete(userId);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupMemoryCache(),
      PERMISSION_CACHE_CONFIG.CLEANUP_INTERVAL_MS
    );
  }

  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      maxCacheSize: PERMISSION_CACHE_CONFIG.MAX_CACHE_SIZE,
      cacheDurationMs: PERMISSION_CACHE_CONFIG.DURATION_MS,
      cleanupIntervalMs: PERMISSION_CACHE_CONFIG.CLEANUP_INTERVAL_MS
    };
  }
}

export const permissionCache = new PermissionCacheService();
