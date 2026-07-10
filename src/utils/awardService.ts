import { supabase } from './supabaseClient';
import { uploadToR2, getAccessToken } from './r2StorageService';
import { renderPdfFirstPageToImage } from './pdfUtils';
import {
  repeatVariantKey,
  tierVariantKey,
  repeatDeviceCounts,
  REPEAT_VARIANT_HARD_CAP,
  type AwardEligibilityRules,
  type AwardDeviceConfig
} from './awardRules';
import { generateAwardVariants } from './awardImageComposer';

// The awards tables are newer than the generated supabase types, hence the casts.
const sb = supabase as any;

// ---------- Types ----------

export interface AwardCategory {
  id: string;
  name: string;
  order: number;
  // Fallback image for awards in this category that have no image of their own
  default_image_url?: string | null;
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
  // Structured eligibility + device decorations (null = manual-only award)
  eligibility_rules: AwardEligibilityRules | null;
  device_config: AwardDeviceConfig | null;
  // Cache of composited base+device images, keyed by variant (see awardRules)
  variant_images: Record<string, string> | null;
}

export interface NewAward {
  name: string;
  description?: string | null;
  criteria?: string | null;
  image_url?: string | null;
  category_id: string;
  is_repeatable: boolean;
  eligibility_rules?: AwardEligibilityRules | null;
  device_config?: AwardDeviceConfig | null;
  variant_images?: Record<string, string> | null;
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
  device_tier: string | null;
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
  /** Device tier earned per pilot (tier-mode awards); pilots not in the map get none */
  deviceTierByPilot?: Record<string, string | null>;
}

// ---------- Categories ----------

export async function getAwardCategories(): Promise<{ data: AwardCategory[] | null; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .select('id, name, order, default_image_url')
    .order('order')
    .order('name');
  return { data, error };
}

/** Set or clear (pass null) a category's default award image */
export async function updateAwardCategoryImage(id: string, imageUrl: string | null): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('award_categories')
    .update({ default_image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('Category image was not updated. You may not have permission to manage awards.') };
  }
  return { success: true, error: null };
}

/** Display image for an award: its own image, else its category's default */
export function awardDisplayImage(award: Award | null | undefined): string | null {
  return award?.image_url || award?.category?.default_image_url || null;
}

// ---------- Device-aware display helpers ----------

/**
 * One display tile in the dossier awards rail. Repeat-mode awards collapse
 * to a single tile whose image variant reflects the issuance count (bronze /
 * silver star devices); everything else is one tile per issuance.
 */
export interface PilotAwardDisplayGroup {
  /** Representative issuance (most recent) — drives viewer, certificate, dates */
  pilotAward: PilotAward;
  /** All issuances in the group, most recent first */
  issuances: PilotAward[];
  /** Total times this pilot holds the award (repeat groups only, else 1) */
  count: number;
  /** Composited variant image (devices applied) or the plain award image */
  imageUrl: string | null;
}

/**
 * Image for a single issuance with its device applied:
 *  - repeat-mode awards use the variant for the pilot's total award count
 *  - tier-mode issuances use their earned tier's variant
 *  - falls back to the plain award image / category default
 */
export function pilotAwardVariantImage(pilotAward: PilotAward, repeatCount: number = 1): string | null {
  const award = pilotAward.award;
  const baseImage = awardDisplayImage(award);
  const variants = award?.variant_images || null;
  const config = award?.device_config || null;
  if (!award || !variants || !config) return baseImage;

  if (config.mode === 'repeat' && config.repeat && repeatCount >= 2) {
    // Counts past the generated coverage reuse the largest generated variant
    // (ensureRepeatVariantCoverage tops the cache up after issuances)
    const capped = Math.min(repeatCount, REPEAT_VARIANT_HARD_CAP);
    for (let n = capped; n >= 2; n--) {
      const url = variants[repeatVariantKey(n)];
      if (url) return url;
    }
    return baseImage;
  }

  if (config.mode === 'tier' && pilotAward.device_tier) {
    return variants[tierVariantKey(pilotAward.device_tier)] || baseImage;
  }

  return baseImage;
}

/** Human-readable device summary, e.g. "3rd award — 2 bronze stars" */
export function pilotAwardDeviceLabel(pilotAward: PilotAward, repeatCount: number = 1): string | null {
  const config = pilotAward.award?.device_config;
  if (!config) return null;

  if (config.mode === 'repeat' && config.repeat && repeatCount >= 2) {
    const counts = repeatDeviceCounts(repeatCount, config.repeat);
    const parts: string[] = [];
    if (counts.silver > 0) parts.push(`${counts.silver} silver device${counts.silver > 1 ? 's' : ''}`);
    if (counts.bronze > 0) parts.push(`${counts.bronze} bronze device${counts.bronze > 1 ? 's' : ''}`);
    const ordinal = repeatCount === 2 ? '2nd' : repeatCount === 3 ? '3rd' : `${repeatCount}th`;
    return parts.length > 0 ? `${ordinal} award — ${parts.join(', ')}` : `${ordinal} award`;
  }

  if (config.mode === 'tier' && pilotAward.device_tier && config.tiers) {
    const tier = config.tiers.find(t => t.id === pilotAward.device_tier);
    return tier ? `With device: ${tier.name}` : null;
  }

  return null;
}

/**
 * Groups a pilot's issuances (most recent first) into display tiles,
 * collapsing repeat-mode awards into one tile with the correct device variant.
 */
export function groupPilotAwardsForDisplay(pilotAwards: PilotAward[]): PilotAwardDisplayGroup[] {
  const groups: PilotAwardDisplayGroup[] = [];
  const repeatGroupByAward: Record<string, PilotAwardDisplayGroup> = {};

  pilotAwards.forEach(pilotAward => {
    const isRepeatMode = pilotAward.award?.device_config?.mode === 'repeat';
    if (!isRepeatMode) {
      groups.push({
        pilotAward,
        issuances: [pilotAward],
        count: 1,
        imageUrl: pilotAwardVariantImage(pilotAward, 1)
      });
      return;
    }

    const existing = repeatGroupByAward[pilotAward.award_id];
    if (existing) {
      existing.issuances.push(pilotAward);
      existing.count += 1;
    } else {
      const group: PilotAwardDisplayGroup = {
        pilotAward,
        issuances: [pilotAward],
        count: 1,
        imageUrl: null
      };
      repeatGroupByAward[pilotAward.award_id] = group;
      groups.push(group);
    }
  });

  // Resolve repeat variants once the counts are known
  groups.forEach(group => {
    if (group.pilotAward.award?.device_config?.mode === 'repeat') {
      group.imageUrl = pilotAwardVariantImage(group.pilotAward, group.count);
    }
  });

  return groups;
}

/**
 * Tops up a repeat-mode award's composited variant cache when a pilot's
 * issuance count exceeds the generated coverage (e.g. a 12th award needing
 * 2 silver + 1 bronze). Call after issuing; best-effort — the display falls
 * back to the largest generated variant until coverage catches up, and the
 * awards-table update silently no-ops for users without manage_awards.
 */
export async function ensureRepeatVariantCoverage(awardId: string): Promise<void> {
  try {
    const [awardRes, issuancesRes] = await Promise.all([
      sb.from('awards')
        .select('id, image_url, device_config, variant_images, category:category_id (default_image_url)')
        .eq('id', awardId)
        .single(),
      sb.from('pilot_awards').select('pilot_id').eq('award_id', awardId)
    ]);

    const award = awardRes.data;
    const config = award?.device_config as AwardDeviceConfig | null;
    if (!award || config?.mode !== 'repeat' || !config.repeat?.bronzeImageUrl) return;

    // Highest issuance count any pilot holds for this award
    const countsByPilot: Record<string, number> = {};
    let needed = 0;
    ((issuancesRes.data || []) as Array<{ pilot_id: string }>).forEach(row => {
      countsByPilot[row.pilot_id] = (countsByPilot[row.pilot_id] || 0) + 1;
      needed = Math.max(needed, countsByPilot[row.pilot_id]);
    });
    if (needed < 2) return;

    // Highest variant already generated
    const variants: Record<string, string> = award.variant_images || {};
    let covered = 1;
    for (let n = 2; n <= REPEAT_VARIANT_HARD_CAP; n++) {
      if (variants[repeatVariantKey(n)]) covered = n;
    }
    if (needed <= covered) return;

    const baseImage = award.image_url || award.category?.default_image_url || null;
    if (!baseImage) return;

    const { variants: newVariants, error } = await generateAwardVariants(baseImage, config, {
      startAt: covered + 1,
      minRepeatAwards: needed
    });
    if (error || !newVariants || Object.keys(newVariants).length === 0) {
      if (error) console.warn('Repeat variant top-up failed:', error);
      return;
    }

    await sb
      .from('awards')
      .update({ variant_images: { ...variants, ...newVariants }, updated_at: new Date().toISOString() })
      .eq('id', awardId);
  } catch (err) {
    console.warn('Repeat variant top-up failed:', err);
  }
}

// ---------- Decoration image pool ----------

export interface AwardDecorationImage {
  id: string;
  name: string;
  image_url: string;
  created_at: string;
}

export async function getDecorationImages(): Promise<{ data: AwardDecorationImage[] | null; error: any }> {
  const { data, error } = await sb
    .from('award_decoration_images')
    .select('id, name, image_url, created_at')
    .order('name');
  return { data, error };
}

/** Uploads a transparent decoration overlay (e.g. a bronze star) into the reusable pool */
export async function createDecorationImage(name: string, file: File): Promise<{ data: AwardDecorationImage | null; error: any }> {
  const { url, error: uploadError } = await uploadAwardImage(file, 'decoration');
  if (uploadError || !url) {
    return { data: null, error: uploadError || new Error('Upload failed') };
  }

  const { data, error } = await sb
    .from('award_decoration_images')
    .insert({ name: name.trim() || file.name.replace(/\.[^.]+$/, ''), image_url: url })
    .select()
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('The decoration was not saved. You may not have permission to manage awards.') };
  return { data, error: null };
}

export async function deleteDecorationImage(id: string): Promise<{ success: boolean; error: any }> {
  const { data, error } = await sb
    .from('award_decoration_images')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('The decoration was not deleted. You may not have permission to manage awards.') };
  }
  return { success: true, error: null };
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
    .select('*, category:category_id (id, name, order, default_image_url)')
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
    .select('*, award:award_id (*, category:category_id (id, name, order, default_image_url))')
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
    issued_by: params.issuedByProfileId || null,
    device_tier: params.deviceTierByPilot?.[pilotId] || null
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

/** Edits the details of an existing issuance (awarded date, citation, device tier) */
export async function updateIssuance(
  pilotAwardId: string,
  updates: { awardedDate?: string; citation?: string | null; deviceTier?: string | null }
): Promise<{ success: boolean; error: any }> {
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.awardedDate !== undefined) payload.awarded_date = updates.awardedDate;
  if (updates.citation !== undefined) payload.citation = updates.citation;
  if (updates.deviceTier !== undefined) payload.device_tier = updates.deviceTier;

  const { data, error } = await sb
    .from('pilot_awards')
    .update(payload)
    .eq('id', pilotAwardId)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return { success: false, error: new Error('The issuance was not updated. You may not have permission to edit it.') };
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
  kind: 'insignia' | 'certificate' | 'decoration' = 'insignia'
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
