import { supabase } from './supabaseClient';

function getWorkerUrl(): string {
  return import.meta.env.VITE_WORKER_URL || 'https://readyroom-storage.ajmilner85.workers.dev';
}

/**
 * Rewrites an R2 public URL to the storage worker's CORS proxy
 * (GET /object/<path> responds with Access-Control-Allow-Origin: *) so the
 * image can be drawn onto a canvas without tainting it. Supabase Storage
 * URLs already allow cross-origin reads and pass through unchanged.
 */
export function toCorsSafeImageUrl(url: string): string {
  try {
    const clean = url.split('?')[0];
    if (!clean || clean.includes('supabase.co')) return url;
    const path = new URL(clean).pathname.replace(/^\//, '');
    if (!path) return url;
    return `${getWorkerUrl()}/object/${path}`;
  } catch {
    return url;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function uploadToR2(
  file: File,
  path: string,
  accessToken: string
): Promise<{ url: string | null; error: string | null }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  const response = await fetch(`${getWorkerUrl()}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    return { url: null, error: `Upload failed: ${response.statusText}` };
  }

  const data = await response.json();
  return { url: data.url, error: null };
}

export async function deleteFromR2(
  path: string,
  accessToken: string
): Promise<{ success: boolean; error: string | null }> {
  const response = await fetch(`${getWorkerUrl()}/delete`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    return { success: false, error: `Delete failed: ${response.statusText}` };
  }

  return { success: true, error: null };
}

/**
 * Delete a storage file by its public R2 URL. Best-effort — logs a warning on
 * failure but does not throw. Legacy Supabase Storage URLs are skipped: those
 * buckets were deleted after the R2 migration, so the file no longer exists.
 */
export async function deleteStorageFileByUrl(url: string): Promise<void> {
  if (!url) return;
  const cleanUrl = url.split('?')[0];
  if (!cleanUrl) return;

  if (cleanUrl.includes('supabase.co')) {
    console.log('[GC] Skipping legacy Supabase Storage URL (file already gone):', cleanUrl);
    return;
  }

  try {
    const r2Path = new URL(cleanUrl).pathname.slice(1);
    console.log('[GC] Deleting R2 file, path:', r2Path);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[GC] No access token — skipping R2 delete for:', r2Path);
      return;
    }
    const { success, error: deleteError } = await deleteFromR2(r2Path, accessToken);
    if (!success) {
      console.warn('[GC] R2 delete failed for path:', r2Path, 'error:', deleteError);
    } else {
      console.log('[GC] R2 file deleted successfully:', r2Path);
    }
  } catch (err) {
    console.warn('[GC] Failed to delete storage file:', cleanUrl, err);
  }
}
