import { uploadToR2, getAccessToken, toCorsSafeImageUrl } from './r2StorageService';
import {
  repeatDeviceCounts,
  repeatVariantKey,
  tierVariantKey,
  REPEAT_VARIANT_BASELINE,
  REPEAT_VARIANT_HARD_CAP,
  type AwardDeviceConfig
} from './awardRules';

// Composites award base images with transparent decoration overlays (star
// devices) into flat images, so every variant of an award is available as a
// plain image URL for the dossier, PDF exports and Discord embeds.

const MAX_CANVAS_WIDTH = 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = toCorsSafeImageUrl(url);
  });
}

/**
 * Downscales an image in successive halving steps instead of one jump —
 * a single large downscale on canvas skips most source pixels and leaves
 * device edges visibly aliased.
 */
function scaleImageSmoothly(image: HTMLImageElement, targetWidth: number, targetHeight: number): HTMLImageElement | HTMLCanvasElement {
  let current: HTMLImageElement | HTMLCanvasElement = image;
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  while (width / 2 >= targetWidth && height / 2 >= targetHeight) {
    const stepWidth = Math.max(Math.round(width / 2), Math.ceil(targetWidth));
    const stepHeight = Math.max(Math.round(height / 2), Math.ceil(targetHeight));
    const canvas = document.createElement('canvas');
    canvas.width = stepWidth;
    canvas.height = stepHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, stepWidth, stepHeight);
    current = canvas;
    width = stepWidth;
    height = stepHeight;
  }

  return current;
}

interface DeviceSpec {
  image: HTMLImageElement;
  count: number;
}

/**
 * Draws the base image and lays the decoration devices over it.
 *
 * Two overlay styles are supported, chosen per decoration image:
 *  - Full overlay: when the decoration's aspect ratio is within 15% of the
 *    base image's, it is stretched over the whole base (an admin-authored
 *    transparent overlay matching the award art).
 *  - Device glyphs: otherwise the decoration is treated as a single device
 *    (e.g. one bronze star) and the required number of devices is drawn in a
 *    centered horizontal row, as on real ribbon bars.
 */
function composite(base: HTMLImageElement, devices: DeviceSpec[]): Promise<Blob> {
  const scale = Math.min(1, MAX_CANVAS_WIDTH / base.naturalWidth);
  const width = Math.round(base.naturalWidth * scale);
  const height = Math.round(base.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Could not get canvas context'));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scaleImageSmoothly(base, width, height), 0, 0, width, height);

  const baseAspect = width / height;

  // Split into full overlays and glyph devices
  const glyphRow: Array<{ image: HTMLImageElement }> = [];
  devices.forEach(device => {
    const deviceAspect = device.image.naturalWidth / device.image.naturalHeight;
    const isFullOverlay = Math.abs(deviceAspect - baseAspect) / baseAspect <= 0.15;
    if (isFullOverlay) {
      const scaled = scaleImageSmoothly(device.image, width, height);
      for (let i = 0; i < device.count; i++) ctx.drawImage(scaled, 0, 0, width, height);
    } else {
      for (let i = 0; i < device.count; i++) glyphRow.push({ image: device.image });
    }
  });

  if (glyphRow.length > 0) {
    // Regulation proportions: a ribbon bar is 1-3/8" x 3/8" and carries
    // 3/16" devices — half the bar's height. Taller art (medals with
    // suspension ribbons) gets proportionally smaller devices.
    const glyphHeightRatio = baseAspect >= 2 ? 0.5 : 0.16;
    let glyphHeight = height * glyphHeightRatio;

    const widths = glyphRow.map(g => glyphHeight * (g.image.naturalWidth / g.image.naturalHeight));
    // "Evenly spaced and not overlapping" — a small gap keeps the cluster tight
    let gap = glyphHeight * 0.1;
    let totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (glyphRow.length - 1);

    // Shrink to fit when the row would overflow the base image
    const maxRowWidth = width * 0.92;
    if (totalWidth > maxRowWidth) {
      const shrink = maxRowWidth / totalWidth;
      glyphHeight *= shrink;
      gap *= shrink;
      for (let i = 0; i < widths.length; i++) widths[i] *= shrink;
      totalWidth = maxRowWidth;
    }

    let x = (width - totalWidth) / 2;
    const y = (height - glyphHeight) / 2;
    glyphRow.forEach((glyph, i) => {
      const scaled = scaleImageSmoothly(glyph.image, widths[i], glyphHeight);
      ctx.drawImage(scaled, x, y, widths[i], glyphHeight);
      x += widths[i] + gap;
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Compositing failed'));
    }, 'image/webp', 0.9);
  });
}

async function uploadVariant(blob: Blob, accessToken: string): Promise<string> {
  const file = new File([blob], 'variant.webp', { type: 'image/webp' });
  const path = `award-images/variants/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { url, error } = await uploadToR2(file, path, accessToken);
  if (error || !url) throw new Error(error || 'Variant upload failed');
  return url;
}

/**
 * Generates and uploads every composited variant an award's device
 * configuration calls for, returning the variant key → URL map to store in
 * awards.variant_images.
 *
 *  - repeat mode: keys r2..rN (the first award is the bare image). N covers
 *    the baseline (REPEAT_VARIANT_BASELINE) or `minRepeatAwards`, whichever
 *    is higher; pass `startAt` to top up only the missing variants.
 *  - tier mode: one key per tier (tier:<id>)
 */
export async function generateAwardVariants(
  baseImageUrl: string,
  deviceConfig: AwardDeviceConfig,
  options?: { startAt?: number; minRepeatAwards?: number }
): Promise<{ variants: Record<string, string> | null; error: any }> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { variants: null, error: new Error('Not authenticated') };

    const base = await loadImage(baseImageUrl);
    const variants: Record<string, string> = {};

    if (deviceConfig.mode === 'repeat' && deviceConfig.repeat?.bronzeImageUrl) {
      const config = deviceConfig.repeat;
      const bronze = await loadImage(config.bronzeImageUrl);
      const silver = config.silverImageUrl ? await loadImage(config.silverImageUrl) : null;
      const startAt = Math.max(2, options?.startAt ?? 2);
      const maxAwards = Math.min(
        REPEAT_VARIANT_HARD_CAP,
        Math.max(REPEAT_VARIANT_BASELINE, options?.minRepeatAwards ?? 0)
      );

      for (let n = startAt; n <= maxAwards; n++) {
        const counts = repeatDeviceCounts(n, config);
        const devices: DeviceSpec[] = [];
        // Silver devices sit to the wearer's right (drawn first)
        if (silver && counts.silver > 0) devices.push({ image: silver, count: counts.silver });
        if (counts.bronze > 0) devices.push({ image: bronze, count: counts.bronze });
        if (devices.length === 0) continue;
        const blob = await composite(base, devices);
        variants[repeatVariantKey(n)] = await uploadVariant(blob, accessToken);
      }
    }

    if (deviceConfig.mode === 'tier' && deviceConfig.tiers) {
      for (const tier of deviceConfig.tiers) {
        if (!tier.imageUrl) continue;
        const device = await loadImage(tier.imageUrl);
        const blob = await composite(base, [{ image: device, count: 1 }]);
        variants[tierVariantKey(tier.id)] = await uploadVariant(blob, accessToken);
      }
    }

    return { variants, error: null };
  } catch (error) {
    return { variants: null, error };
  }
}
