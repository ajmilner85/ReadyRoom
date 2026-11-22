import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  sessionUser: 'auth-1' as string | null,
  row: null as null | { permissions: unknown; expires_at: string },
  rpcResult: null as null | { data: unknown; error: unknown },
  calls: [] as string[],
}));

vi.mock('./supabaseClient', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal query-builder stub
  const query: any = {
    select: () => query,
    maybeSingle: async () => {
      state.calls.push('select');
      return { data: state.row, error: null };
    },
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: state.sessionUser ? { user: { id: state.sessionUser } } : null } }),
      },
      from: (table: string) => {
        state.calls.push(`from:${table}`);
        return {
          ...query,
          insert: () => { throw new Error('client must not write the cache'); },
          upsert: () => { throw new Error('client must not write the cache'); },
          update: () => { throw new Error('client must not write the cache'); },
          delete: () => { throw new Error('client must not write the cache'); },
        };
      },
      rpc: async (name: string) => {
        state.calls.push(`rpc:${name}`);
        return state.rpcResult ?? { data: null, error: new Error('no rpc result') };
      },
    },
  };
});

import { PermissionCacheService } from './permissionCache';
import { withPermissionDefaults, emptyPermissions } from './permissionDefaults';

const inOneHour = () => new Date(Date.now() + 3600e3).toISOString();

describe('PermissionCacheService (server-computed cache)', () => {
  let service: PermissionCacheService;
  beforeEach(() => {
    state.sessionUser = 'auth-1';
    state.row = null;
    state.rpcResult = null;
    state.calls = [];
    service = new PermissionCacheService();
    service.stopCleanupTimer();
  });

  it('uses a valid database row without recomputing', async () => {
    state.row = { permissions: { canAccessHome: true, canManageRoster: [{ type: 'global' }] }, expires_at: inOneHour() };
    const p = await service.getUserPermissions('auth-1');
    expect(p.canAccessHome).toBe(true);
    expect(p.canManageRoster).toEqual([{ type: 'global' }]);
    expect(state.calls).not.toContain('rpc:refresh_my_permissions');
  });

  it('asks the database to recompute when the row is missing or expiring', async () => {
    state.row = { permissions: { canAccessHome: false }, expires_at: new Date(Date.now() + 60e3).toISOString() };
    state.rpcResult = { data: { permissions: { canAccessHome: true }, expires_at: inOneHour(), stored: true }, error: null };
    const p = await service.getUserPermissions('auth-1');
    expect(state.calls).toContain('rpc:refresh_my_permissions');
    expect(p.canAccessHome).toBe(true);
  });

  it('serves repeat calls from memory', async () => {
    state.rpcResult = { data: { permissions: { canAccessHome: true }, expires_at: inOneHour() }, error: null };
    await service.getUserPermissions('auth-1');
    state.calls = [];
    await service.getUserPermissions('auth-1');
    expect(state.calls).toEqual([]);
  });

  it('gives no permissions for a user other than the signed-in one', async () => {
    state.row = { permissions: { canAccessHome: true }, expires_at: inOneHour() };
    const p = await service.getUserPermissions('someone-else');
    expect(p.canAccessHome).toBe(false);
    expect(state.calls).toEqual([]);
  });

  it('invalidate recomputes through the database, never writes', async () => {
    state.rpcResult = { data: { permissions: { canManagePolls: true }, expires_at: inOneHour() }, error: null };
    await service.invalidateUserPermissions('auth-1');
    expect(state.calls).toEqual(['rpc:refresh_my_permissions']);
    expect((await service.getUserPermissions('auth-1')).canManagePolls).toBe(true);
  });

  it('refreshIfNeeded only refreshes near expiry', async () => {
    state.rpcResult = { data: { permissions: {}, expires_at: inOneHour() }, error: null };
    expect(await service.refreshIfNeeded('auth-1')).toBe(true);
    expect(await service.refreshIfNeeded('auth-1')).toBe(false);
  });

  it('falls back to view-own-profile only when the database fails', async () => {
    state.rpcResult = { data: null, error: new Error('down') };
    const p = await service.getUserPermissions('auth-1');
    expect(p.canViewOwnProfile).toBe(true);
    expect(p.canAccessHome).toBe(false);
  });
});

describe('withPermissionDefaults', () => {
  it('fills missing keys and ignores wrong types and unknown keys', () => {
    const p = withPermissionDefaults({
      canAccessHome: true,
      canManageRoster: 'global',
      canEditOrganizationSettings: 'true',
      view_all_training_progress: 'global',
      somethingElse: true,
      calculatedAt: '2026-11-22T10:00:00.000Z',
    });
    expect(p.canAccessHome).toBe(true);
    expect(p.canManageRoster).toEqual([]);
    expect(p.canEditOrganizationSettings).toBe(false);
    expect(p.view_all_training_progress).toBe('all_cycles');
    expect(p.delegate_debriefs).toEqual([]);
    expect((p as unknown as Record<string, unknown>).somethingElse).toBeUndefined();
    expect(p.calculatedAt).toBeInstanceOf(Date);
    expect(Object.keys(p).sort()).toEqual(Object.keys(emptyPermissions()).sort());
  });

  it('handles null', () => {
    expect(withPermissionDefaults(null).canAccessHome).toBe(false);
  });
});
