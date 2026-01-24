import { getSupabase } from './supabaseClient'
import { permissionCache } from './permissionCache'
import type { Database } from '../types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function sb<T>(fn: (c: SupabaseClient<Database>) => Promise<T>): Promise<T> {
  const supabase = getSupabase()
  await supabase.auth.getSession() // proactively ensure JWT freshness

  try {
    return await fn(supabase)
  } catch (err: any) {
    const status = err?.status
    const transient = err?.name === 'TypeError' || [408, 425, 429, 500, 502, 503, 504].includes(status)
    const authy = [401, 403].includes(status)

    if (transient) {
      await new Promise(r => setTimeout(r, 300)) // tiny backoff
      return await fn(supabase)
    }

    if (authy) {
      // Refresh session
      const { data: { session } } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }))

      // Force refresh permission cache on auth errors (likely stale cache causing RLS failure)
      if (session?.user?.id) {
        try {
          await permissionCache.invalidateUserPermissions(session.user.id)
          await permissionCache.getUserPermissions(session.user.id)
          console.log('[sb] Permission cache forcibly refreshed after 403 error')
        } catch (cacheErr) {
          console.warn('[sb] Failed to refresh permission cache after 403:', cacheErr)
        }
      }

      return await fn(supabase)
    }
    throw err
  }
}