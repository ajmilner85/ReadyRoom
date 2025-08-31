import { getSupabase } from './supabaseClient'

/** Refresh auth (cheap if already fresh) and then revalidate your data layer. */
export async function wake() {
  const supabase = getSupabase()
  await supabase.auth.getSession().catch(() => {}) // ensure fresh JWT
  
  // Note: Since this codebase doesn't use a formal data layer like TanStack Query or SWR,
  // we don't need to add revalidation calls here. The individual components will refresh
  // their data when they detect auth changes through the AuthContext.
  
  console.log('Wake: refreshed session')
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
  
  console.log('Wake: registered event handlers')
  
  // Return cleanup function
  return () => {
    window.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', wake)
    window.removeEventListener('online', wake)
    window.removeEventListener('pageshow', onPageShow)
  }
}