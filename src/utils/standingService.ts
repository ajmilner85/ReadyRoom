import { supabase, getCurrentUser } from './supabaseClient';
import { permissionCache } from './permissionCache';

// Define the Standing interface
export interface Standing {
  id: string;
  name: string;
  order: number;
  created_at?: string;
}

/**
 * Fetch all pilot standings
 */
export async function getAllStandings(): Promise<{ data: Standing[] | null; error: any }> {
  const { data, error } = await supabase
    .from('standings')
    .select('*')
    .order('order', { ascending: true });

  return { data, error };
}

/**
 * Add a new standing
 */
export async function createStanding(standing: Omit<Standing, 'id' | 'created_at'>): Promise<{ data: Standing | null; error: any }> {
  try {
    // Get current user for RLS context
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      return { data: null, error: userError || new Error('User not authenticated') };
    }

    console.log('Creating standing with user context:', {
      standing,
      userId: user.id
    });

    // Ensure user permissions are calculated and cached in the correct format for RLS
    try {
      await permissionCache.getUserPermissions(user.id);
      console.log('User permissions cached for RLS compliance');
    } catch (permError) {
      console.warn('Could not cache permissions, proceeding anyway:', permError);
    }

    const { data, error } = await supabase
      .from('standings')
      .insert(standing)
      .select()
      .single();

    console.log('Standing creation result:', { data, error });

    return { data, error };
  } catch (e) {
    console.error('Exception in createStanding:', e);
    return { data: null, error: e };
  }
}

/**
 * Update an existing standing
 */
export async function updateStanding(id: string, updates: Partial<Omit<Standing, 'id' | 'created_at'>>): Promise<{ data: Standing | null; error: any }> {
  const { data, error } = await supabase
    .from('standings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a standing
 */
export async function deleteStanding(id: string): Promise<{ success: boolean; error: any }> {
  const { error } = await supabase
    .from('standings')
    .delete()
    .eq('id', id);

  return { success: !error, error };
}

/**
 * Get the usage count of a standing
 * Returns the number of pilots currently using this standing ID
 */
export async function getStandingUsageCount(standingId: string): Promise<{ count: number; error: any }> {
  try {
    // Get current user for RLS context
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      console.warn('No user context for getStandingUsageCount, proceeding anyway');
    } else {
      // Ensure user permissions are calculated and cached for RLS compliance
      try {
        await permissionCache.getUserPermissions(user.id);
        console.log('User permissions cached for usage count RLS compliance');
      } catch (permError) {
        console.warn('Could not cache permissions for usage count, proceeding anyway:', permError);
      }
    }

    const { error, count } = await supabase
      .from('pilot_standings')
      .select('id', { count: 'exact' })
      .eq('standing_id', standingId)
      .is('end_date', null); // Only count active standings

    if (error) {
      console.error('Error getting standing usage count:', error);
      console.error('Error details:', { error, standingId });
    } else {
      console.log('Successfully got usage count for standing:', { standingId, count });
    }

    return { count: count || 0, error };
  } catch (e) {
    console.error('Exception in getStandingUsageCount:', e);
    return { count: 0, error: e };
  }
}

/**
 * Initialize default standings if none exist
 */
export async function initializeDefaultStandings(): Promise<void> {
  // Check if standings table exists first
  const { count, error: countError } = await supabase
    .from('standings')
    .select('id', { count: 'exact' });
  
  // If error, the table might not exist yet
  if (countError) {
    console.error('Error checking standings table:', countError);
    return;
  }

  // If we have standings, don't initialize
  if (count && count > 0) {
    return;
  }

  // Default standings for organization hierarchy
  const defaultStandings = [
    { name: 'Command', order: 10 },
    { name: 'Staff', order: 20 },
    { name: 'Cadre', order: 30 },
    { name: 'Provisional', order: 40 }
  ];

  try {
    await supabase.from('standings').insert(defaultStandings);
    console.log('Default standings initialized');
  } catch (error) {
    console.error('Failed to initialize default standings:', error);
  }
}
