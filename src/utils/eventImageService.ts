import { supabase } from './supabaseClient';
import { uploadToR2, deleteFromR2, getAccessToken, deleteStorageFileByUrl } from './r2StorageService';

/**
 * Compress an image file to WebP format with quality reduction
 * @param file The image file to compress
 * @param maxWidth Maximum width in pixels (default 1920)
 * @param quality Quality setting 0-1 (default 0.8)
 * @returns Compressed image as File
 */
async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<File> {
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

      // Resize if too large
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
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
            type: 'image/webp',
            lastModified: Date.now()
          });
          resolve(compressedFile);
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
 * Upload an event image to Supabase storage and return the public URL
 * @param eventId The event ID to associate with the image
 * @param file The image file to upload
 * @returns The URL to the uploaded image or error
 */
export const uploadEventImage = async (eventId: string, file: File) => {
  try {
    console.log(`Uploading image for event ${eventId}, original size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

    // Compress image before upload
    const compressedFile = await compressImage(file);
    console.log(`Compressed to: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB (${((1 - compressedFile.size / file.size) * 100).toFixed(1)}% reduction)`);

    // Create a unique file path for the event image
    const fileExt = compressedFile.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${eventId}/${fileName}`;

    console.log(`Upload path: ${filePath}`);

    let storedUrl: string;
    let publicUrl: string;

    if (import.meta.env.VITE_USE_R2 === 'true') {
      const accessToken = await getAccessToken();
      if (!accessToken) return { url: null, error: new Error('Not authenticated') };
      const r2Path = `event-images/${filePath}`;
      const { url, error: r2Error } = await uploadToR2(compressedFile, r2Path, accessToken);
      if (r2Error || !url) {
        console.error('Error uploading event image to R2:', r2Error);
        return { url: null, error: new Error(r2Error || 'Upload failed') };
      }
      storedUrl = url;
      publicUrl = url + '?cache=' + Date.now();
    } else {
      // Upload the compressed file to the 'event-images' bucket with upsert=true
      const { data: _data, error } = await supabase.storage
        .from('event-images')
        .upload(filePath, compressedFile, {
          cacheControl: '2592000', // 30 days
          upsert: true // Use upsert to override existing files
        });

      if (error) {
        console.error('Error uploading event image:', error);
        return { url: null, error };
      }
      const { data: publicUrlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);
      storedUrl = publicUrlData.publicUrl;
      publicUrl = storedUrl + '?cache=' + Date.now();
    }

    console.log(`Generated URL: ${publicUrl}`);
    console.log(`Storing URL: ${storedUrl}`);

    // Update the event with the clean image URL (without cache parameter)
    const { error: updateError } = await supabase
      .from('events')
      .update({ image_url: storedUrl })
      .eq('id', eventId);
    
    if (updateError) {
      console.error('Error updating event with image URL:', updateError);
      return { url: null, error: updateError };
    }
    
    console.log('Image upload and database update successful');
    return { url: publicUrl, error: null };
  } catch (err) {
    console.error('Unexpected error in uploadEventImage:', err);
    return { url: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
};

/**
 * Delete an event image from Supabase storage
 * @param imageUrl The URL of the image to delete
 * @returns Success status
 */
export const deleteEventImage = async (imageUrl: string) => {
  if (!imageUrl) return { error: null };
  
  try {
    console.log(`Attempting to delete image: ${imageUrl}`);

    const cleanUrl = imageUrl.split('?')[0];
    const isR2Url = !cleanUrl.includes('supabase.co');

    if (isR2Url) {
      // R2 URL: https://pub-xxx.r2.dev/event-images/evt-id/file.webp
      // R2 key:                                      event-images/evt-id/file.webp
      const r2Path = new URL(cleanUrl).pathname.slice(1);
      console.log(`Extracted R2 path to delete: ${r2Path}`);
      const accessToken = await getAccessToken();
      if (!accessToken) return { error: new Error('Not authenticated') };
      const { error: r2Error } = await deleteFromR2(r2Path, accessToken);
      if (r2Error) {
        console.error('Error deleting image from R2:', r2Error);
        return { error: new Error(r2Error) };
      }
    } else {
      // Supabase URL: extract path relative to bucket
      const urlParts = cleanUrl.split('/');
      const bucketName = 'event-images';
      const bucketIndex = urlParts.findIndex(part => part === bucketName);
      if (bucketIndex === -1) {
        console.error('Invalid image URL format:', imageUrl);
        return { error: new Error('Invalid image URL') };
      }
      const path = urlParts.slice(bucketIndex + 1).join('/');
      console.log(`Extracted Supabase path to delete: ${path}`);
      const { error } = await supabase.storage.from(bucketName).remove([path]);
      if (error) {
        console.error('Error deleting image:', error);
        return { error };
      }
    }

    // Update the event to remove the image URL
    const { error: updateError } = await supabase
      .from('events')
      .update({ image_url: null })
      .eq('image_url', imageUrl);
      
    if (updateError) {
      console.error('Error updating event after image deletion:', updateError);
    }
    
    console.log('Successfully deleted image and updated event');
    return { error: null };
  } catch (err) {
    console.error('Unexpected error in deleteEventImage:', err);
    return { error: err instanceof Error ? err : new Error('Unknown error') };
  }
};

/**
 * Delete all storage files associated with an event's image data.
 * Accepts the raw image_url value from the DB or the mapped Event fields.
 * Best-effort — does not throw.
 */
export async function deleteEventImageFiles(imageData: {
  imageUrl?: string | null;
  headerImageUrl?: string | null;
  additionalImageUrls?: (string | null)[];
} | string | null | undefined): Promise<void> {
  const urls: string[] = [];

  if (!imageData) return;

  if (typeof imageData === 'string') {
    urls.push(imageData);
  } else {
    if (imageData.imageUrl) urls.push(imageData.imageUrl);
    if (imageData.headerImageUrl) urls.push(imageData.headerImageUrl);
    if (imageData.additionalImageUrls) {
      urls.push(...imageData.additionalImageUrls.filter((u): u is string => !!u));
    }
  }

  await Promise.all(urls.map(url => deleteStorageFileByUrl(url)));
}

/**
 * Upload multiple event images and store in JSONB format
 * @param eventId The event ID to associate with the images
 * @param images Object containing header and additional images
 * @returns The URLs of uploaded images or error
 */
export const uploadMultipleEventImages = async (eventId: string, images: {
  headerImage?: File | string | null;
  additionalImages?: (File | string | null)[];
}, replaceExisting: boolean = false) => {
  try {
    console.log(`Uploading multiple images for event ${eventId}, replaceExisting:`, replaceExisting);

    let imageUrls: { headerImage?: string; additionalImages: string[] } = {
      additionalImages: []
    };

    // Always fetch existing images — needed for merge mode init and orphan GC
    const { data: existingEvent, error: fetchError } = await supabase
      .from('events')
      .select('image_url')
      .eq('id', eventId)
      .single();

    if (fetchError) {
      console.error('Error fetching existing images:', fetchError);
      return { urls: null, error: fetchError };
    }

    const existingImageUrl = existingEvent?.image_url;
    const existingUrls = (typeof existingImageUrl === 'object' && existingImageUrl)
      ? existingImageUrl as any
      : { additionalImages: [] };

    // Collect old URLs now for orphan GC after DB update
    const oldUrlSet = new Set<string>();
    if (existingUrls?.headerImage) oldUrlSet.add(existingUrls.headerImage.split('?')[0]);
    if (Array.isArray(existingUrls?.additionalImages)) {
      existingUrls.additionalImages.filter(Boolean).forEach((u: string) => oldUrlSet.add(u.split('?')[0]));
    }

    if (!replaceExisting) {
      // Merge mode: initialize with existing images
      imageUrls = {
        headerImage: existingUrls?.headerImage,
        additionalImages: [...(existingUrls?.additionalImages || [])]
      };
    }
    
    // Handle header image (File = new upload, string = existing URL)
    if (images.headerImage) {
      if (typeof images.headerImage === 'string') {
        // Existing image URL, keep it
        imageUrls.headerImage = images.headerImage;
      } else {
        // New file upload
        const result = await uploadSingleImageFile(eventId, images.headerImage, 'header');
        if (result.error) {
          console.error('Failed to upload header image:', result.error);
          return { urls: null, error: result.error };
        }
        imageUrls.headerImage = result.url;
      }
    } else if (replaceExisting) {
      // Explicitly remove header image
      imageUrls.headerImage = undefined;
    }
    
    // Handle additional images (File = new upload, string = existing URL)
    if (images.additionalImages) {
      if (replaceExisting) {
        // Replace mode: start with empty array
        imageUrls.additionalImages = [];
      }
      
      for (let i = 0; i < images.additionalImages.length; i++) {
        const additionalImage = images.additionalImages[i];
        if (additionalImage) {
          if (typeof additionalImage === 'string') {
            // Existing image URL, keep it
            imageUrls.additionalImages.push(additionalImage);
          } else {
            // New file upload
            const totalImageIndex = imageUrls.additionalImages.length;
            const result = await uploadSingleImageFile(eventId, additionalImage, `additional-${totalImageIndex}`);
            if (result.error) {
              console.error(`Failed to upload additional image ${i}:`, result.error);
              // Continue with other images even if one fails
            } else if (result.url) {
              imageUrls.additionalImages.push(result.url);
            }
          }
        }
      }
    } else if (replaceExisting) {
      // If replaceExisting is true and no additional images provided, clear them
      imageUrls.additionalImages = [];
    }
    
    // Update the event with JSONB image URLs
    const { error: updateError } = await supabase
      .from('events')
      .update({ image_url: imageUrls })
      .eq('id', eventId);
    
    if (updateError) {
      console.error('Error updating event with multiple image URLs:', updateError);
      return { urls: null, error: updateError };
    }
    
    console.log('Multiple image upload and database update successful:', imageUrls);

    // GC: delete storage files that are no longer referenced
    const newUrlSet = new Set<string>();
    if (imageUrls.headerImage) newUrlSet.add(imageUrls.headerImage.split('?')[0]);
    imageUrls.additionalImages.filter(Boolean).forEach(u => newUrlSet.add(u.split('?')[0]));

    const orphanUrls = [...oldUrlSet].filter(u => !newUrlSet.has(u));
    if (orphanUrls.length > 0) {
      console.log(`[GC] Deleting ${orphanUrls.length} orphaned image file(s)`);
      await Promise.all(orphanUrls.map(url => deleteStorageFileByUrl(url)));
    }

    return { urls: imageUrls, error: null };
  } catch (err) {
    console.error('Unexpected error in uploadMultipleEventImages:', err);
    return { urls: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
};

/**
 * Helper function to upload a single image file
 */
const uploadSingleImageFile = async (eventId: string, file: File, imageType: string) => {
  console.log(`Compressing ${imageType} image, original size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

  // Compress image before upload
  const compressedFile = await compressImage(file);
  console.log(`Compressed to: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB (${((1 - compressedFile.size / file.size) * 100).toFixed(1)}% reduction)`);

  const fileExt = compressedFile.name.split('.').pop();
  const fileName = `${imageType}-${Date.now()}.${fileExt}`;
  const filePath = `${eventId}/${fileName}`;

  console.log(`Upload path for ${imageType}: ${filePath}`);

  if (import.meta.env.VITE_USE_R2 === 'true') {
    const accessToken = await getAccessToken();
    if (!accessToken) return { url: null, error: new Error('Not authenticated') };
    const r2Path = `event-images/${filePath}`;
    const { url, error: r2Error } = await uploadToR2(compressedFile, r2Path, accessToken);
    if (r2Error || !url) {
      console.error(`Error uploading ${imageType} image to R2:`, r2Error);
      return { url: null, error: new Error(r2Error || 'Upload failed') };
    }
    const displayUrl = url + '?cache=' + Date.now();
    console.log(`Generated R2 URL for ${imageType}: ${displayUrl}`);
    return { url: displayUrl, error: null };
  }

  // Upload the compressed file to the 'event-images' bucket with upsert=true
  const { data: _data, error } = await supabase.storage
    .from('event-images')
    .upload(filePath, compressedFile, {
      cacheControl: '2592000', // 30 days
      upsert: true
    });

  if (error) {
    console.error(`Error uploading ${imageType} image:`, error);
    return { url: null, error };
  }

  // Get the public URL for the uploaded file
  const { data: publicUrlData } = supabase.storage
    .from('event-images')
    .getPublicUrl(filePath);

  const storedUrl = publicUrlData.publicUrl;
  const displayUrl = storedUrl + '?cache=' + Date.now();

  console.log(`Generated URL for ${imageType}: ${displayUrl}`);
  return { url: displayUrl, error: null };
};

/**
 * Update the Discord publish function to include images (legacy single image support)
 * @param eventId The event ID
 * @param imageUrl The URL of the image to include
 * @returns Response with success status
 */
export const updateEventImageUrl = async (eventId: string, imageUrl: string | null) => {
  console.log('REACHED UPDATE EVENT IMAGE URL FUNCTION');
  try {
    const { error } = await supabase
      .from('events')
      .update({ image_url: imageUrl })
      .eq('id', eventId);
    
    return { error };
  } catch (err) {
    console.error('Unexpected error in updateEventImageUrl:', err);
    return { error: err instanceof Error ? err : new Error('Unknown error') };
  }
};
