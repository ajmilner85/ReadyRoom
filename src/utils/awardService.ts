import { supabase } from './supabaseClient';
import { uploadToR2, getAccessToken } from './r2StorageService';
import { renderPdfFirstPageToImage } from './pdfUtils';

// The awards tables are newer than the generated supabase types, hence the casts.
const sb = supabase as any;

// ---------- Types ----------

export interface AwardCategory {
  id: string;
  name: string;
  order: number;
}

export interface Award {
  id: string;
  name: string;
  description: string | null;
  criteria: string | null;
  image_url: string | null;
  category_id: string;
  category?: AwardCategory | null; // joined
  is_repeatable: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAward {
  name: string;
  description?: string | null;
  criteria?: string | null;
  image_url?: string | null;
  category_id: string;
  is_repeatable: boolean;
}

export interface PilotAward {
  id: string;
  award_id: string;
  pilot_id: string;
  awarded_date: string;
  citation: string | null;
  certificate_url: string | null;
  certificate_thumbnail_url: string | null;
  cycle_id: string | null;
  event_id: string | null;
  issued_by: string | null;
  created_at: string;
  award?: Award;
}

export interface IssueAwardParams {
  awardId: string;
  pilotIds: string[];
  awardedDate: string; // YYYY-MM-DD
  citation?: string | null;
  certificateUrl?: string | null;
  certificateThumbnailUrl?: string | null;
  cycleId?: string | null;
  eventId?: string | null;
  issuedByProfileId?: string | null;
}

// ---------- Categories ----------

export async function getAwardCategories(): Promise<{ data: AwardCategory[] | null; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .select('id, name, order')
    .order('order')
    .order('name');
  return { data, error };
}

export async function createAwardCategory(name: string, order: number = 0): Promise<{ data: AwardCategory | null; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .insert({ name: name.trim(), order })
    .select()
    .single();
  return { data, error };
}

export async function updateAwardCategory(id: string, name: string): Promise<{ data: AwardCategory | null; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Category was not updated. You may not have permission to manage awards.') };
  return { data, error: null };
}

export async function deleteAwardCategory(id: string): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    // 23503 = foreign key violation — the category still has awards in it
    if (error.code === '23503') {
      return { success: false, error: new Error('This category is in use by one or more awards. Reassign those awards first.') };
    }
    return { success: false, error };
  }
  if (!data || data.length === 0) {
    return { success: false, error: new Error('Category was not deleted. You may not have permission to manage awards.') };
  }
  return { success: true, error: null };
}

// ---------- Award definitions ----------

export async function getAllAwards(): Promise<{ data: Award[] | null; error: any }> {
  const { data, error } = await sb
    .from('awards')
    .select('*, category:category_id (id, name, order)')
    .order('name');
  return { data, error };
}

export async function createAward(award: NewAward): Promise<{ data: Award | null; error: any }> {
  const { data, error } = await sb
    .from('awards')
    .insert(award)
    .select()
    .single();
  return { data, error };
}

export async function updateAward(id: string, updates: Partial<NewAward> & { active?: boolean }): Promise<{ data: Award | null; error: any }> {
  const { data, error } = await sb
    .from('awards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Award was not updated. You may not have permission to manage awards.') };
  return { data, error: null };
}

export async function deleteAward(id: string): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('awards')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('Award was not deleted. You may not have permission to manage awards.') };
  }
  return { success: true, error: null };
}

// ---------- Issuances ----------

export async function getPilotAwards(pilotId: string): Promise<{ data: PilotAward[] | null; error: any }> {
  const { data, error } = await sb
    .from('pilot_awards')
    .select('*, award:award_id (*, category:category_id (id, name, order))')
    .eq('pilot_id', pilotId)
    .order('awarded_date', { ascending: false });
  return { data, error };
}

export async function issueAward(params: IssueAwardParams): Promise<{ success: boolean; error: any }> {
  const rows = params.pilotIds.map(pilotId => ({
    award_id: params.awardId,
    pilot_id: pilotId,
    awarded_date: params.awardedDate,
    citation: params.citation || null,
    certificate_url: params.certificateUrl || null,
    certificate_thumbnail_url: params.certificateThumbnailUrl || null,
    cycle_id: params.cycleId || null,
    event_id: params.eventId || null,
    issued_by: params.issuedByProfileId || null
  }));

  const { data, error } = await sb
    .from('pilot_awards')
    .insert(rows)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('No awards were issued. You may not have permission to issue awards to these pilots.') };
  }
  return { success: true, error: null };
}

/** Attach, replace or remove (pass nulls) the certificate on an existing issuance */
export async function updateIssuanceCertificate(
  pilotAwardId: string,
  certificateUrl: string | null,
  certificateThumbnailUrl: string | null
): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('pilot_awards')
    .update({
      certificate_url: certificateUrl,
      certificate_thumbnail_url: certificateThumbnailUrl,
      updated_at: new Date().toISOString()
    })
    .eq('id', pilotAwardId)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('The certificate was not updated. You may not have permission to edit this issuance.') };
  }
  return { success: true, error: null };
}

export async function revokeAward(pilotAwardId: string): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('pilot_awards')
    .delete()
    .eq('id', pilotAwardId)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('The award was not revoked. You may not have permission to do this.') };
  }
  return { success: true, error: null };
}

// ---------- Image upload ----------

/** Compress to a small WebP suitable for an award insignia/certificate thumbnail */
async function compressAwardImage(file: File, maxWidth: number = 512, quality: number = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
            type: 'image/webp',
            lastModified: Date.now()
          }));
        } else {
          reject(new Error('Compression failed'));
        }
      }, 'image/webp', quality);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload an award image (or certificate) to storage and return its public URL.
 * PDFs are uploaded as-is, plus a first-page WebP preview (thumbnailUrl) so
 * the app can show PDF certificates without embedding a PDF viewer.
 * Images are compressed to WebP first.
 */
export async function uploadAwardImage(
  file: File,
  kind: 'insignia' | 'certificate' = 'insignia'
): Promise<{ url: string | null; thumbnailUrl: string | null; error: any }> {
  try {
    // Some Windows systems report an empty MIME type for PDFs picked from the
    // file dialog, so also check the extension — and normalize the type, since
    // the storage worker validates it
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const uploadFile = isPdf
      ? (file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' }))
      : await compressAwardImage(file);
    const ext = isPdf ? 'pdf' : 'webp';
    const basePath = `award-images/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const accessToken = await getAccessToken();
    if (!accessToken) return { url: null, thumbnailUrl: null, error: new Error('Not authenticated') };

    const { url, error } = await uploadToR2(uploadFile, `${basePath}.${ext}`, accessToken);
    if (error || !url) {
      return { url: null, thumbnailUrl: null, error: new Error(error || 'Upload failed') };
    }

    // Generate and upload a first-page preview for PDFs (best-effort)
    let thumbnailUrl: string | null = null;
    if (isPdf) {
      try {
        const previewFile = await renderPdfFirstPageToImage(file);
        const { url: previewUrl, error: previewError } = await uploadToR2(previewFile, `${basePath}.preview.webp`, accessToken);
        if (!previewError && previewUrl) {
          thumbnailUrl = previewUrl;
        } else {
          console.warn('PDF preview upload failed:', previewError);
        }
      } catch (previewErr) {
        console.warn('PDF preview generation failed:', previewErr);
      }
    }

    return { url, thumbnailUrl, error: null };
  } catch (err) {
    return { url: null, thumbnailUrl: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
}
