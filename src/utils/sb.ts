import { getSupabase } from './supabaseClient'
import type { Database } from '../types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function sb<T>(fn: (c: SupabaseClient<Database>) => Promise<T>): Promise<T> {
  const supabase = getSupabase()
  await supabase.auth.getSession() // proactively ensure freshness

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
      await supabase.auth.refreshSession().catch(() => {})
      return await fn(supabase)
    }
    throw err
  }
}