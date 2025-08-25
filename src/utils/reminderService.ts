import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';

type Event = Database['public']['Tables']['events']['Row'];
type ReminderSettings = {
  firstReminder?: {
    enabled: boolean;
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  secondReminder?: {
    enabled: boolean;
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
};

interface ScheduledReminder {
  id: string;
  event_id: string;
  reminder_type: 'first' | 'second';
  scheduled_time: string;
  sent: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Convert reminder time settings to milliseconds
 */
function reminderTimeToMilliseconds(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
}

/**
 * Calculate when a reminder should be sent
 */
function calculateReminderTime(eventStartTime: string, value: number, unit: 'minutes' | 'hours' | 'days'): Date {
  const eventStart = new Date(eventStartTime);
  const reminderOffset = reminderTimeToMilliseconds(value, unit);
  return new Date(eventStart.getTime() - reminderOffset);
}

/**
 * Schedule reminders for an event
 */
export async function scheduleEventReminders(
  eventId: string,
  eventStartTime: string,
  reminderSettings: ReminderSettings
): Promise<{ success: boolean; error?: any }> {
  try {
    const remindersToSchedule = [];

    // Schedule first reminder if enabled
    if (reminderSettings.firstReminder?.enabled) {
      const reminderTime = calculateReminderTime(
        eventStartTime,
        reminderSettings.firstReminder.value,
        reminderSettings.firstReminder.unit
      );
      
      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        remindersToSchedule.push({
          event_id: eventId,
          reminder_type: 'first' as const,
          scheduled_time: reminderTime.toISOString(),
          sent: false
        });
      }
    }

    // Schedule second reminder if enabled
    if (reminderSettings.secondReminder?.enabled) {
      const reminderTime = calculateReminderTime(
        eventStartTime,
        reminderSettings.secondReminder.value,
        reminderSettings.secondReminder.unit
      );
      
      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        remindersToSchedule.push({
          event_id: eventId,
          reminder_type: 'second' as const,
          scheduled_time: reminderTime.toISOString(),
          sent: false
        });
      }
    }

    if (remindersToSchedule.length > 0) {
      const { error } = await supabase
        .from('event_reminders')
        .insert(remindersToSchedule);

      if (error) {
        throw error;
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error scheduling event reminders:', error);
    return { success: false, error };
  }
}

/**
 * Cancel existing reminders for an event
 */
export async function cancelEventReminders(eventId: string): Promise<{ success: boolean; error?: any }> {
  try {
    const { error } = await supabase
      .from('event_reminders')
      .delete()
      .eq('event_id', eventId)
      .eq('sent', false);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling event reminders:', error);
    return { success: false, error };
  }
}

/**
 * Get pending reminders that should be sent now
 */
export async function getPendingReminders(): Promise<{ 
  data: ScheduledReminder[] | null; 
  error: any 
}> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('event_reminders')
    .select('*')
    .eq('sent', false)
    .lte('scheduled_time', now)
    .order('scheduled_time', { ascending: true });

  return { data, error };
}

/**
 * Mark a reminder as sent
 */
export async function markReminderAsSent(reminderId: string): Promise<{ success: boolean; error?: any }> {
  try {
    const { error } = await supabase
      .from('event_reminders')
      .update({ 
        sent: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', reminderId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    return { success: false, error };
  }
}

/**
 * Get event details with attendance for reminder
 */
export async function getEventWithAttendanceForReminder(eventId: string): Promise<{
  event: Event | null;
  attendance: {
    accepted: Array<{ discord_id: string; discord_username: string }>;
    tentative: Array<{ discord_id: string; discord_username: string }>;
  };
  error: any;
}> {
  try {
    // Get event details
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError) {
      throw eventError;
    }

    if (!eventData?.discord_event_id) {
      return {
        event: eventData,
        attendance: { accepted: [], tentative: [] },
        error: null
      };
    }

    // Get attendance data
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response')
      .eq('discord_event_id', eventData.discord_event_id)
      .in('user_response', ['accepted', 'tentative']);

    if (attendanceError) {
      throw attendanceError;
    }

    const attendance = {
      accepted: [] as Array<{ discord_id: string; discord_username: string }>,
      tentative: [] as Array<{ discord_id: string; discord_username: string }>
    };

    attendanceData?.forEach(record => {
      if (record.user_response === 'accepted') {
        attendance.accepted.push({
          discord_id: record.discord_id,
          discord_username: record.discord_username || 'Unknown User'
        });
      } else if (record.user_response === 'tentative') {
        attendance.tentative.push({
          discord_id: record.discord_id,
          discord_username: record.discord_username || 'Unknown User'
        });
      }
    });

    return {
      event: eventData,
      attendance,
      error: null
    };
  } catch (error) {
    console.error('Error getting event for reminder:', error);
    return {
      event: null,
      attendance: { accepted: [], tentative: [] },
      error
    };
  }
}

/**
 * Format reminder message
 */
export function formatReminderMessage(
  event: Event,
  timeUntilEvent: string
): string {
  const eventDate = new Date(event.datetime);
  const easternTime = eventDate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `REMINDER: Event starting in ${timeUntilEvent}!
${event.title}
${easternTime} EST`;
}

/**
 * Calculate time until event for display
 */
export function calculateTimeUntilEvent(eventStartTime: string): string {
  const now = new Date();
  const eventStart = new Date(eventStartTime);
  const diffMs = eventStart.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return 'now';
  }
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}${remainingHours > 0 ? ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` : ''}`;
  } else if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''}${remainingMinutes > 0 ? ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}` : ''}`;
  } else {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
}

/**
 * Update reminders when event is modified
 */
export async function updateEventReminders(
  eventId: string,
  newEventStartTime: string,
  newReminderSettings: ReminderSettings
): Promise<{ success: boolean; error?: any }> {
  try {
    // Cancel existing reminders
    await cancelEventReminders(eventId);
    
    // Schedule new reminders
    const result = await scheduleEventReminders(eventId, newEventStartTime, newReminderSettings);
    
    return result;
  } catch (error) {
    console.error('Error updating event reminders:', error);
    return { success: false, error };
  }
}