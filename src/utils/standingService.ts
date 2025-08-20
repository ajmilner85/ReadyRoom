import { supabase } from './supabaseClient';

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
  const { data, error } = await supabase
    .from('standings')
    .insert(standing)
    .select()
    .single();

  return { data, error };
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
  const { error, count } = await supabase
    .from('pilot_standings')
    .select('id', { count: 'exact' })
    .eq('standing_id', standingId)
    .is('end_date', null); // Only count active standings

  return { count: count || 0, error };
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
