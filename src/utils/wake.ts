import { getSupabase } from './supabaseClient'
import { permissionCache } from './permissionCache'

/** Refresh auth and permission cache (cheap if already fresh) */
export async function wake() {
  const supabase = getSupabase()

  // Ensure fresh JWT
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))

  // If user is authenticated, ensure permission cache is fresh
  if (session?.user?.id) {
    try {
      const wasRefreshed = await permissionCache.refreshIfNeeded(session.user.id)
      if (wasRefreshed) {
        console.log('[WAKE] Permission cache was refreshed after idle')
      }
    } catch (err) {
      console.warn('[WAKE] Failed to refresh permission cache:', err)
    }
  }
}

export function registerWakeHandlers() {
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      wake()
    }
  }
  
  const onPageShow = (e: PageTransitionEvent) => {
    // BFCache restores can bring back stale sockets/timers
    if (e.persisted || document.visibilityState === 'visible') {
      wake()
    }
  }
  
  window.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', wake)
  window.addEventListener('online', wake)
  window.addEventListener('pageshow', onPageShow)
  
  // Return cleanup function
  return () => {
    window.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', wake)
    window.removeEventListener('online', wake)
    window.removeEventListener('pageshow', onPageShow)
  }
}