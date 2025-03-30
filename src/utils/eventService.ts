import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';

export type Event = Database['public']['Tables']['events']['Row'];
export type NewEvent = Database['public']['Tables']['events']['Insert'];
export type UpdateEvent = Database['public']['Tables']['events']['Update'];
export type Attendance = Database['public']['Tables']['attendance']['Row'];
export type NewAttendance = Database['public']['Tables']['attendance']['Insert'];

/**
 * Fetch all events from the database
 */
export async function getAllEvents(): Promise<{ data: Event[] | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });

  return { data, error };
}

/**
 * Fetch a single event by ID
 */
export async function getEventById(id: string): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

/**
 * Add a new event to the database
 * @param event The event data to add
 */
export async function createEvent(event: NewEvent): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();

  return { data, error };
}

/**
 * Update an existing event
 * @param id The ID of the event to update
 * @param updates The event data to update
 */
export async function updateEvent(id: string, updates: UpdateEvent): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete an event by ID
 * @param id The ID of the event to delete
 */
export async function deleteEvent(id: string): Promise<{ success: boolean; error: any }> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  return { success: !error, error };
}

/**
 * Get attendance records for an event
 */
export async function getEventAttendance(eventId: string): Promise<{ data: Attendance[] | null; error: any }> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, pilots(*)')
    .eq('eventId', eventId);

  return { data, error };
}

/**
 * Update or create attendance record for a pilot at an event
 */
export async function updateAttendance(attendance: NewAttendance): Promise<{ data: Attendance | null; error: any }> {
  // First check if an attendance record already exists
  const { data: existingRecord } = await supabase
    .from('attendance')
    .select('id')
    .eq('eventId', attendance.eventId)
    .eq('pilotId', attendance.pilotId)
    .single();

  if (existingRecord) {
    // Update existing record
    const { data, error } = await supabase
      .from('attendance')
      .update({ status: attendance.status, role: attendance.role })
      .eq('id', existingRecord.id)
      .select()
      .single();
    
    return { data, error };
  } else {
    // Create new record
    const { data, error } = await supabase
      .from('attendance')
      .insert(attendance)
      .select()
      .single();
    
    return { data, error };
  }
}