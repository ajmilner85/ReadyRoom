import { supabase } from './supabaseClient';

/**
 * Upload an event image to Supabase storage and return the public URL
 * @param eventId The event ID to associate with the image
 * @param file The image file to upload
 * @returns The URL to the uploaded image or error
 */
export const uploadEventImage = async (eventId: string, file: File) => {
  try {
    console.log(`Uploading image for event ${eventId}...`);
    
    // Create a unique file path for the event image
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${eventId}/${fileName}`;
    
    console.log(`Upload path: ${filePath}`);
    
    // Upload the file to the 'event-images' bucket with upsert=true
    const { data: _data, error } = await supabase.storage
      .from('event-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true // Use upsert to override existing files
      });
    
    if (error) {
      console.error('Error uploading event image:', error);
      return { url: null, error };
    }    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from('event-images')
      .getPublicUrl(filePath);
    
    // Ensure the URL has the correct format
    let publicUrl = publicUrlData.publicUrl;
    
    // Store clean URL in database without cache parameter
    const storedUrl = publicUrl;
    
    // Add cache-busting parameter for immediate display only
    publicUrl = publicUrl + '?cache=' + Date.now();
    
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
    
    // Extract the path from the full URL
    const urlParts = imageUrl.split('/');
    const bucketName = 'event-images';
    
    // The path will be everything after the bucket name in the URL
    const bucketIndex = urlParts.findIndex(part => part === bucketName);
    if (bucketIndex === -1) {
      console.error('Invalid image URL format:', imageUrl);
      return { error: new Error('Invalid image URL') };
    }
    
    // Get path components after the bucket name
    const pathParts = urlParts.slice(bucketIndex + 1);
    const path = pathParts.join('/');
    
    console.log(`Extracted path to delete: ${path}`);
    
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([path]);
    
    if (error) {
      console.error('Error deleting image:', error);
      return { error };
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
    
    if (!replaceExisting) {
      // Merge mode: fetch existing images to merge with new uploads
      const { data: existingEvent, error: fetchError } = await supabase
        .from('events')
        .select('image_url')
        .eq('id', eventId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching existing images:', fetchError);
        return { urls: null, error: fetchError };
      }
      
      // Initialize with existing images or empty structure
      const existingImageUrls = (typeof existingEvent?.image_url === 'object' && existingEvent.image_url) 
        ? existingEvent.image_url 
        : { additionalImages: [] };
      
      const existingUrls = existingImageUrls as any;
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
  const fileExt = file.name.split('.').pop();
  const fileName = `${imageType}-${Date.now()}.${fileExt}`;
  const filePath = `${eventId}/${fileName}`;
  
  console.log(`Upload path for ${imageType}: ${filePath}`);
  
  // Upload the file to the 'event-images' bucket with upsert=true
  const { data: _data, error } = await supabase.storage
    .from('event-images')
    .upload(filePath, file, {
      cacheControl: '3600',
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
