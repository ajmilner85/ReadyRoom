import { getSupabase } from './supabaseClient'
import { permissionCache } from './permissionCache'
import type { Database } from '../types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function sb<T>(fn: (c: SupabaseClient<Database>) => Promise<T>): Promise<T> {
  const supabase = getSupabase()

  // Proactively ensure JWT is fresh
  const { data: { session } } = await supabase.auth.getSession()

  // NEW: Proactively ensure permission cache is fresh BEFORE the query
  if (session?.user?.id) {
    try {
      await permissionCache.refreshIfNeeded(session.user.id)
    } catch (err) {
      console.warn('[sb] Failed to refresh permission cache:', err)
    }
  }

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
      await supabase.auth.refreshSession().catch(() => {})

      // NEW: Force refresh permission cache on auth errors
      if (session?.user?.id) {
        try {
          await permissionCache.invalidateUserPermissions(session.user.id)
          await permissionCache.getUserPermissions(session.user.id)
        } catch (cacheErr) {
          console.warn('[sb] Failed to refresh permission cache after 403:', cacheErr)
        }
      }

      return await fn(supabase)
    }
    throw err
  }
}