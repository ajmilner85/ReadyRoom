import { supabase } from './supabaseClient';
import { getPilotByDiscordOriginalId } from './pilotService';

// Define the Qualification interface
export interface Qualification {
  id: string;
  name: string;
  code: string;
  color?: string | null; // Color for the qualification badge
  requirements: any; // JSON data for requirements
  category: string | null;
  is_expirable: boolean;
  validity_period: number | null; // In days
  active: boolean;
  order?: number; // Sort order for display
  created_at?: string;
  updated_at?: string | null;
}

// Cache for storing pilot qualification data to avoid duplicate requests
const qualificationsCache: Record<string, any[]> = {};
const pendingRequests: Record<string, Promise<{ data: any[] | null; error: any }>> = {};

/**
 * Fetch all squadron qualifications
 */
export async function getAllQualifications(): Promise<{ data: Qualification[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('qualifications')
      .select('*')
      .order('order', { ascending: true });

    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Fetch all active squadron qualifications
 */
export async function getActiveQualifications(): Promise<{ data: Qualification[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('qualifications')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });
    
    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Get a single qualification by ID
 */
export async function getQualificationById(id: string): Promise<{ data: Qualification | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('qualifications')
      .select('*')
      .eq('id', id)
      .single();
    
    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Add a new qualification
 */
export async function createQualification(qualification: Omit<Qualification, 'id' | 'created_at' | 'updated_at'>): Promise<{ data: Qualification | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('qualifications')
      .insert(qualification)
      .select('*')
      .single();
    
    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Update an existing qualification
 */
export async function updateQualification(id: string, updates: Partial<Omit<Qualification, 'id' | 'created_at' | 'updated_at'>>): Promise<{ data: Qualification | null; error: any }> {
  try {
    // Add the updated_at timestamp
    const updatesWithTimestamp = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Log the update operation for debugging
    console.log('Updating qualification:', id, updatesWithTimestamp);

    const { data, error } = await supabase
      .from('qualifications')
      .update(updatesWithTimestamp)
      .eq('id', id)
      .select('*');

    if (error) {
      console.error('Qualification update error:', error);
    }

    console.log('Qualification update raw response:', { data, error, originalId: id, updates: updatesWithTimestamp });

    return { data: data ? data[0] : null, error };
  } catch (e) {
    console.error('Exception in updateQualification:', e);
    return { data: null, error: e };
  }
}

/**
 * Delete a qualification (hard delete)
 */
export async function deleteQualification(id: string): Promise<{ success: boolean; error: any }> {
  try {
    // First check if any pilots have this qualification
    const { data: pilotsWithQual, error: checkError } = await supabase
      .from('pilot_qualifications')
      .select('id')
      .eq('qualification_id', id);
    
    if (checkError) {
      throw checkError;
    }
    
    // If pilots have this qualification, prevent deletion
    if (pilotsWithQual && pilotsWithQual.length > 0) {
      return { 
        success: false, 
        error: {
          message: `Cannot delete qualification: It is assigned to ${pilotsWithQual.length} pilots`,
          code: "foreign_key_violation"
        } 
      };
    }
    
    const { error } = await supabase
      .from('qualifications')
      .delete()
      .eq('id', id);
    
    return { success: !error, error };
  } catch (e) {
    return { success: false, error: e };
  }
}

/**
 * Soft delete a qualification by setting active to false
 */
export async function archiveQualification(id: string): Promise<{ data: Qualification | null; error: any }> {
  return updateQualification(id, { active: false });
}

/**
 * Get the usage count of a qualification
 * Returns the number of pilots currently assigned this qualification
 */
export async function getQualificationUsageCount(qualificationId: string): Promise<{ count: number; error: any }> {
  try {
    const { error, count } = await supabase
      .from('pilot_qualifications')
      .select('id', { count: 'exact' })
      .eq('qualification_id', qualificationId);
    
    return { count: count || 0, error };
  } catch (e) {
    return { count: 0, error: e };
  }
}

/**
 * Assign a qualification to a pilot
 */
export async function assignQualificationToPilot(
  pilotId: string,
  qualificationId: string,
  expiryDate?: Date | null,
  achieved_date?: Date | null,
  notes?: string | null
): Promise<{ data: any; error: any }> {
  try {
    const insertData: any = {
      pilot_id: pilotId,
      qualification_id: qualificationId,
    };

    if (expiryDate) {
      insertData.expiry_date = expiryDate.toISOString();
    }

    if (achieved_date) {
      insertData.achieved_date = achieved_date.toISOString();
    }

    if (notes) {
      insertData.notes = notes;
    }

    const { data, error } = await supabase
      .from('pilot_qualifications')
      .insert(insertData)
      .select()
      .single();
      
    // Force clear cache for the pilot
    clearPilotQualificationsCache(pilotId);
    // Clear entire cache for batch consistency
    clearAllQualificationsCache();
    
    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Remove a qualification from a pilot
 */
export async function removeQualificationFromPilot(pilotId: string, qualificationId: string): Promise<{ success: boolean; error: any }> {
  try {
    console.log('Attempting to remove qualification:', { pilotId, qualificationId });

    const { data, error, count } = await supabase
      .from('pilot_qualifications')
      .delete()
      .eq('pilot_id', pilotId)
      .eq('qualification_id', qualificationId)
      .select();

    console.log('Delete result:', { data, error, count, deletedRows: data?.length });

    if (error) {
      console.error('Supabase delete error:', error);
      return { success: false, error };
    }

    // Check if any rows were actually deleted
    if (!data || data.length === 0) {
      console.warn('No rows were deleted - qualification may not exist');
      return { success: false, error: { message: 'Qualification not found or already removed' } };
    }

    // Force clear cache for the pilot
    clearPilotQualificationsCache(pilotId);
    // Clear entire cache for batch consistency
    clearAllQualificationsCache();

    console.log('Qualification removed successfully');
    return { success: true, error: null };
  } catch (e) {
    console.error('Exception in removeQualificationFromPilot:', e);
    return { success: false, error: e };
  }
}

/**
 * Clear the qualifications cache for a specific pilot
 * Call this after adding/removing qualifications to ensure fresh data
 */
export function clearPilotQualificationsCache(pilotId: string): void {
  // Delete from cache using exact ID
  delete qualificationsCache[pilotId];

  // Also clear any cached data under Discord ID or Supabase ID
  Object.keys(qualificationsCache).forEach(key => {
    if (key.includes(pilotId)) {
      delete qualificationsCache[key];
    }
  });

  // Clear any pending requests for this pilot
  delete pendingRequests[pilotId];
}

/**
 * Clear the entire qualifications cache
 * Call this after bulk operations that might affect many pilots
 */
export function clearAllQualificationsCache(): void {
  Object.keys(qualificationsCache).forEach(key => {
    delete qualificationsCache[key];
  });
  
  // Clear all pending requests
  Object.keys(pendingRequests).forEach(key => {
    delete pendingRequests[key];
  });
}

// Helper to convert Discord ID to UUID if needed
async function getActualPilotId(pilotId: string): Promise<string> {
  // Check if the ID looks like a Discord ID (numeric and long)
  const isDiscordId = /^\d+$/.test(pilotId) && pilotId.length > 10;
  
  if (!isDiscordId) {
    return pilotId; // Already a UUID or other ID format
  }
  
  // Try to get the UUID from the Discord ID
  try {
    const { data, error } = await getPilotByDiscordOriginalId(pilotId);
    
    if (error) {
      return pilotId; // Return original if conversion fails
    }
    
    if (!data) {
      return pilotId; // Return original if no pilot found
    }
    
    return data.id;
  } catch (err) {
    return pilotId;
  }
}

/**
 * Get all qualifications assigned to a pilot
 */
export async function getPilotQualifications(pilotId: string): Promise<{ data: any[] | null; error: any }> {
  try {
    // If there's already a pending request for this pilotId, return that promise
    if (Object.prototype.hasOwnProperty.call(pendingRequests, pilotId)) {
      return pendingRequests[pilotId];
    }
    
    // Return cached results if available
    if (qualificationsCache[pilotId]) {
      return { data: qualificationsCache[pilotId], error: null };
    }
    
    // Create the request promise
    const requestPromise = (async () => {
      // Convert Discord ID to UUID if necessary
      const actualPilotId = await getActualPilotId(pilotId);
      
      // If we converted the ID and have a cache hit for the actual ID, use that
      if (actualPilotId !== pilotId && qualificationsCache[actualPilotId]) {
        qualificationsCache[pilotId] = qualificationsCache[actualPilotId]; // Cache under both IDs
        return { data: qualificationsCache[actualPilotId], error: null };
      }
      
      // Get the qualifications using the actual UUID
      const { data, error } = await supabase
        .from('pilot_qualifications')
        .select(`
          *,
          qualification:qualifications(*)
        `)
        .eq('pilot_id', actualPilotId);

      if (error) {
        return { data: null, error };
      }

      // Cache and return the results
      if (data) {
        qualificationsCache[pilotId] = data; // Cache under requested ID
        qualificationsCache[actualPilotId] = data; // Also cache under actual ID
        return { data, error: null };
      }
      
      // Empty results are still valid
      qualificationsCache[pilotId] = [];
      qualificationsCache[actualPilotId] = [];
      return { data: [], error: null };
    })();
    
    // Store the promise in pendingRequests
    pendingRequests[pilotId] = requestPromise;
    
    // Once the request completes, remove it from pendingRequests
    requestPromise.then(() => {
      delete pendingRequests[pilotId];
    }).catch(() => {
      delete pendingRequests[pilotId];
    });
    
    return requestPromise;
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Fetch qualifications for multiple pilots in a single batch operation
 * This is much more efficient than calling getPilotQualifications for each pilot
 */
export async function getBatchPilotQualifications(pilotIds: string[]): Promise<Record<string, any[]>> {
  if (!pilotIds.length) return {};
  
  try {
    // Filter out IDs that are already in the cache
    const uncachedPilotIds = pilotIds.filter(id => !qualificationsCache[id]);
    
    if (uncachedPilotIds.length === 0) {
      // All pilots are already cached, return from cache
      const result: Record<string, any[]> = {};
      pilotIds.forEach(id => {
        result[id] = qualificationsCache[id] || [];
      });
      return result;
    }
    
    // Convert any Discord IDs to UUIDs - but do it in parallel for efficiency
    const idMappingPromises = uncachedPilotIds.map(async (pilotId) => {
      const actualId = await getActualPilotId(pilotId);
      return { originalId: pilotId, actualId };
    });
    
    const idMappings = await Promise.all(idMappingPromises);
    const actualPilotIds = idMappings.map(mapping => mapping.actualId);
    
    // Create a map for reverse lookup
    const idMapping: Record<string, string> = {};
    idMappings.forEach(mapping => {
      idMapping[mapping.actualId] = mapping.originalId;
    });
    
    // Fetch qualifications for all uncached pilots in one query
    // Use a chunking approach to avoid query string length limits for large pilot lists
    const chunkSize = 200; // Increased chunk size for better performance
    const chunks = [];
    
    for (let i = 0; i < actualPilotIds.length; i += chunkSize) {
      chunks.push(actualPilotIds.slice(i, i + chunkSize));
    }
    
    const qualificationsByPilot: Record<string, any[]> = {};
    
    // Process each chunk
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('pilot_qualifications')
        .select(`
          *,
          qualification:qualifications(*),
          pilot_id
        `)
        .in('pilot_id', chunk);
        
      if (error) {
        continue; // Skip this chunk but continue with others
      }
      
      // Group by pilot_id
      if (data) {
        data.forEach(item => {
          const pilotId = item.pilot_id;
          if (!qualificationsByPilot[pilotId]) {
            qualificationsByPilot[pilotId] = [];
          }
          qualificationsByPilot[pilotId].push(item);
        });
      }
    }
    
    // Add to cache and prepare return object
    const result: Record<string, any[]> = {};
    
    // First handle the pilots we fetched data for
    idMappings.forEach(({ originalId, actualId }) => {
      const quals = qualificationsByPilot[actualId] || [];
      qualificationsCache[originalId] = quals;
      qualificationsCache[actualId] = quals;
      result[originalId] = quals;
    });
    
    // Then add the already cached pilots
    pilotIds.forEach(id => {
      if (!result[id] && qualificationsCache[id]) {
        result[id] = qualificationsCache[id];
      } else if (!result[id]) {
        // If we still don't have results, set empty array
        result[id] = [];
        qualificationsCache[id] = [];
      }
    });
    
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * Initialize default qualifications if none exist
 */
export async function initializeDefaultQualifications(): Promise<void> {
  // Check if qualifications table exists and has data
  const { count, error: countError } = await supabase
    .from('qualifications')
    .select('id', { count: 'exact' });
  
  // If error, the table might not exist yet
  if (countError) {
    return;
  }

  // If we have qualifications, don't initialize
  if (count && count > 0) {
    return;
  }

  try {
    // Default qualifications
    const defaultQualifications = [
      {
        name: 'Section Lead',
        code: 'SL',
        requirements: {
          description: 'Qualified to lead a section of aircraft',
          prerequisites: ['Flight Lead'],
          minimumHours: 500
        },
        category: 'Leadership',
        is_expirable: false,
        active: true,
        color: '#5B4E61', // Medium Purple color
        order: 1
      },
      {
        name: 'Flight Lead',
        code: 'FL',
        requirements: {
          description: 'Qualified to lead a flight of aircraft',
          prerequisites: [],
          minimumHours: 250
        },
        category: 'Leadership',
        is_expirable: false,
        active: true,
        color: '#732103', // Dark Orange color
        order: 2
      },
      {
        name: 'Mission Commander',
        code: 'MC',
        requirements: {
          description: 'Qualified to lead a mission',
          prerequisites: ['Section Lead'],
          minimumHours: 750
        },
        category: 'Leadership',
        is_expirable: false,
        active: true,
        color: '#3D4451', // Dark Grey color
        order: 3
      },
      {
        name: 'Landing Signals Officer',
        code: 'LSO',
        requirements: {
          description: 'Qualified to direct carrier landing operations',
          prerequisites: [],
          minimumHours: 400
        },
        category: 'Ship Operations',
        is_expirable: true,
        validity_period: 365, // 1 year in days
        active: true,
        color: '#0D4A3E', // Dark Green color
        order: 4
      },
      {
        name: 'Night Vision Devices',
        code: 'NVD',
        requirements: {
          description: 'Qualified for night operations using NVDs',
          prerequisites: [],
          minimumHours: 100
        },
        category: 'Special Operations',
        is_expirable: true,
        validity_period: 180, // 6 months in days
        active: true,
        color: '#222A35', // Dark Blue color
        order: 5
      },
    ];

    const { error: insertError } = await supabase
      .from('qualifications')
      .insert(defaultQualifications);
      
    if (insertError) {
      throw insertError;
    }
  } catch (error) {
    return;
  }
}