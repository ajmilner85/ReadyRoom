import { supabase } from './supabaseClient';

/**
 * Fetch wrapper that automatically refreshes auth session on 401/403 errors
 * Similar to sb() wrapper but for backend API calls instead of Supabase queries
 *
 * This solves the issue where users leave tabs open for 30+ minutes,
 * their auth session expires, and fetch() calls to the backend fail silently.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();

  // Add auth header if session exists
  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  // Make initial request
  let response = await fetch(url, { ...options, headers });

  // If auth error, try to refresh session and retry
  if (response.status === 401 || response.status === 403) {
    console.log('[authFetch] Got auth error, refreshing session...');

    // Refresh the session
    const { data: { session: newSession }, error } = await supabase.auth.refreshSession();

    if (error || !newSession) {
      console.error('[authFetch] Session refresh failed:', error);
      throw new Error('Authentication session expired. Please refresh the page and try again.');
    }

    console.log('[authFetch] Session refreshed, retrying request...');

    // Update auth header with new token
    headers.set('Authorization', `Bearer ${newSession.access_token}`);

    // Retry the request with new auth
    response = await fetch(url, { ...options, headers });
  }

  return response;
}
