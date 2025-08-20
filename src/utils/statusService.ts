import { supabase } from './supabaseClient';

// Define the Status interface
export interface Status {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
  created_at?: string;
}

/**
 * Fetch all pilot statuses
 */
export async function getAllStatuses(): Promise<{ data: Status[] | null; error: any }> {
  const { data, error } = await supabase
    .from('statuses')
    .select('*')
    .order('order', { ascending: true });

  return { data, error };
}

/**
 * Add a new status
 */
export async function createStatus(status: Omit<Status, 'id' | 'created_at'>): Promise<{ data: Status | null; error: any }> {
  const { data, error } = await supabase
    .from('statuses')
    .insert(status)
    .select()
    .single();

  return { data, error };
}

/**
 * Update an existing status
 */
export async function updateStatus(id: string, updates: Partial<Omit<Status, 'id' | 'created_at'>>): Promise<{ data: Status | null; error: any }> {
  const { data, error } = await supabase
    .from('statuses')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a status
 */
export async function deleteStatus(id: string): Promise<{ success: boolean; error: any }> {
  const { error } = await supabase
    .from('statuses')
    .delete()
    .eq('id', id);

  return { success: !error, error };
}

/**
 * Get the usage count of a status
 * Returns the number of pilots currently using this status ID
 */
export async function getStatusUsageCount(statusId: string): Promise<{ count: number; error: any }> {
  const { error, count } = await supabase
    .from('pilot_statuses')
    .select('id', { count: 'exact' })
    .eq('status_id', statusId)
    .is('end_date', null); // Only count active assignments

  return { count: count || 0, error };
}

/**
 * Initialize default statuses if none exist
 */
export async function initializeDefaultStatuses(): Promise<void> {
  // Check if statuses table exists first
  const { count, error: countError } = await supabase
    .from('statuses')
    .select('id', { count: 'exact' });
  
  // If error, the table might not exist yet
  if (countError) {
    console.error('Error checking statuses table:', countError);
    return;
  }

  // If we have statuses, don't initialize
  if (count && count > 0) {
    return;
  }

  // Default statuses for activity level (not organizational standing)
  const defaultStatuses = [
    { name: 'Active', isActive: true, order: 10 },
    { name: 'On Leave', isActive: false, order: 20 },
    { name: 'AWOL', isActive: false, order: 30 },
    { name: 'Retired', isActive: false, order: 40 },
    { name: 'Removed', isActive: false, order: 50 }
  ];

  try {
    await supabase.from('statuses').insert(defaultStatuses);
    console.log('Default statuses initialized');
  } catch (error) {
    console.error('Failed to initialize default statuses:', error);
  }
}