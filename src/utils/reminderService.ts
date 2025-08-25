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
    console.log('[SCHEDULE-REMINDERS-DEBUG] Scheduling reminders for event:', eventId);
    console.log('[SCHEDULE-REMINDERS-DEBUG] Event start time:', eventStartTime);
    console.log('[SCHEDULE-REMINDERS-DEBUG] Reminder settings:', reminderSettings);
    
    const remindersToSchedule = [];

    // Schedule first reminder if enabled
    if (reminderSettings.firstReminder?.enabled) {
      const reminderTime = calculateReminderTime(
        eventStartTime,
        reminderSettings.firstReminder.value,
        reminderSettings.firstReminder.unit
      );
      
      console.log('[SCHEDULE-REMINDERS-DEBUG] First reminder time calculated:', reminderTime.toISOString());
      console.log('[SCHEDULE-REMINDERS-DEBUG] Current time:', new Date().toISOString());
      console.log('[SCHEDULE-REMINDERS-DEBUG] Is first reminder in future?', reminderTime > new Date());
      
      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        remindersToSchedule.push({
          event_id: eventId,
          reminder_type: 'first' as const,
          scheduled_time: reminderTime.toISOString(),
          sent: false
        });
        console.log('[SCHEDULE-REMINDERS-DEBUG] Added first reminder to schedule');
      }
    }

    // Schedule second reminder if enabled
    if (reminderSettings.secondReminder?.enabled) {
      const reminderTime = calculateReminderTime(
        eventStartTime,
        reminderSettings.secondReminder.value,
        reminderSettings.secondReminder.unit
      );
      
      console.log('[SCHEDULE-REMINDERS-DEBUG] Second reminder time calculated:', reminderTime.toISOString());
      console.log('[SCHEDULE-REMINDERS-DEBUG] Is second reminder in future?', reminderTime > new Date());
      
      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        remindersToSchedule.push({
          event_id: eventId,
          reminder_type: 'second' as const,
          scheduled_time: reminderTime.toISOString(),
          sent: false
        });
        console.log('[SCHEDULE-REMINDERS-DEBUG] Added second reminder to schedule');
      }
    }

    console.log('[SCHEDULE-REMINDERS-DEBUG] Total reminders to schedule:', remindersToSchedule.length);
    console.log('[SCHEDULE-REMINDERS-DEBUG] Reminders data:', remindersToSchedule);

    if (remindersToSchedule.length > 0) {
      console.log('[SCHEDULE-REMINDERS-DEBUG] Inserting reminders into database...');
      const { error, data } = await supabase
        .from('event_reminders')
        .insert(remindersToSchedule)
        .select();

      if (error) {
        console.error('[SCHEDULE-REMINDERS-DEBUG] Database insert error:', error);
        throw error;
      }

      console.log('[SCHEDULE-REMINDERS-DEBUG] Successfully inserted reminders:', data);
    } else {
      console.log('[SCHEDULE-REMINDERS-DEBUG] No reminders to schedule (all were in the past)');
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
    console.log('[CANCEL-REMINDERS-DEBUG] Cancelling reminders for event:', eventId);
    
    // First check what reminders exist
    const { data: existingReminders } = await supabase
      .from('event_reminders')
      .select('*')
      .eq('event_id', eventId);
    
    console.log('[CANCEL-REMINDERS-DEBUG] Found existing reminders:', existingReminders);

    const { error, count } = await supabase
      .from('event_reminders')
      .delete({ count: 'exact' })
      .eq('event_id', eventId);

    if (error) {
      console.error('[CANCEL-REMINDERS-DEBUG] Delete error:', error);
      throw error;
    }

    console.log('[CANCEL-REMINDERS-DEBUG] Deleted', count, 'reminders (sent and unsent)');
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
    accepted: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>;
    tentative: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>;
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

    let discordEventIds = [];
    
    // Handle both single event ID and multi-channel array format
    if (Array.isArray(eventData.discord_event_id)) {
      discordEventIds = eventData.discord_event_id.map(pub => pub.messageId);
    } else {
      discordEventIds = [eventData.discord_event_id];
    }

    // First get basic attendance data from all channels
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response')
      .in('discord_event_id', discordEventIds)
      .in('user_response', ['accepted', 'tentative']);

    if (attendanceError) {
      throw attendanceError;
    }

    if (!attendanceData || attendanceData.length === 0) {
      return {
        event: eventData,
        attendance: { accepted: [], tentative: [] },
        error: null
      };
    }

    // Get all Discord IDs to look up pilot information
    const discordIds = attendanceData.map(record => record.discord_id);
    
    // Try to get pilot information for these Discord IDs
    const { data: pilotData, error: pilotError } = await supabase
      .from('pilots')
      .select('discord_id, board_number, call_sign')
      .in('discord_id', discordIds);

    // Create a map for quick pilot lookup
    const pilotMap = new Map();
    if (pilotData && !pilotError) {
      pilotData.forEach(pilot => {
        pilotMap.set(pilot.discord_id, {
          board_number: pilot.board_number,
          call_sign: pilot.call_sign
        });
      });
    }

    const attendance = {
      accepted: [] as Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>,
      tentative: [] as Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>
    };

    // Deduplicate users and prioritize 'accepted' over 'tentative' responses
    const userResponseMap = new Map();
    
    attendanceData.forEach(record => {
      const existingResponse = userResponseMap.get(record.discord_id);
      
      // If user doesn't exist or this is a more definitive response (accepted > tentative)
      if (!existingResponse || 
          (record.user_response === 'accepted' && existingResponse.user_response === 'tentative')) {
        userResponseMap.set(record.discord_id, record);
      }
    });

    // Convert deduplicated responses to attendance records
    Array.from(userResponseMap.values()).forEach(record => {
      const pilotInfo = pilotMap.get(record.discord_id);
      const userRecord = {
        discord_id: record.discord_id,
        discord_username: record.discord_username || 'Unknown User',
        board_number: pilotInfo?.board_number,
        call_sign: pilotInfo?.call_sign
      };

      if (record.user_response === 'accepted') {
        attendance.accepted.push(userRecord);
      } else if (record.user_response === 'tentative') {
        attendance.tentative.push(userRecord);
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
 * Format reminder message with user mentions
 */
export function formatReminderMessage(
  event: Event,
  timeUntilEvent: string,
  usersToMention?: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>
): string {
  console.log('[FORMAT-REMINDER-DEBUG] Event data:', event);
  console.log('[FORMAT-REMINDER-DEBUG] Time until event:', timeUntilEvent);
  console.log('[FORMAT-REMINDER-DEBUG] Users to mention:', usersToMention);
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

  return `REMINDER: Event starting ${timeUntilEvent}!
${event.name}
${easternTime}`;
}

/**
 * Calculate time until event for display
 */
export function calculateTimeUntilEvent(eventStartTime: string): string {
  console.log('[TIME-CALC-DEBUG] Event start time string:', eventStartTime);
  const now = new Date();
  const eventStart = new Date(eventStartTime);
  console.log('[TIME-CALC-DEBUG] Current time:', now.toISOString());
  console.log('[TIME-CALC-DEBUG] Event start parsed:', eventStart.toISOString());
  console.log('[TIME-CALC-DEBUG] Event start is valid date:', !isNaN(eventStart.getTime()));
  const diffMs = eventStart.getTime() - now.getTime();
  console.log('[TIME-CALC-DEBUG] Difference in ms:', diffMs);
  
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
    console.log('[UPDATE-REMINDERS-DEBUG] Starting reminder update for event:', eventId);
    console.log('[UPDATE-REMINDERS-DEBUG] New start time:', newEventStartTime);
    console.log('[UPDATE-REMINDERS-DEBUG] New reminder settings:', newReminderSettings);
    
    // Cancel existing reminders
    console.log('[UPDATE-REMINDERS-DEBUG] Cancelling existing reminders...');
    const cancelResult = await cancelEventReminders(eventId);
    console.log('[UPDATE-REMINDERS-DEBUG] Cancel result:', cancelResult);
    
    // Schedule new reminders
    console.log('[UPDATE-REMINDERS-DEBUG] Scheduling new reminders...');
    const result = await scheduleEventReminders(eventId, newEventStartTime, newReminderSettings);
    console.log('[UPDATE-REMINDERS-DEBUG] Schedule result:', result);
    
    return result;
  } catch (error) {
    console.error('Error updating event reminders:', error);
    return { success: false, error };
  }
}

/**
 * Send a manual event reminder immediately
 */
export async function sendEventReminder(eventId: string): Promise<{ success: boolean; error?: any; recipientCount?: number }> {
  try {
    console.log('[MANUAL-REMINDER-DEBUG] Sending manual reminder for event:', eventId);
    
    // Get event details with attendance
    const { event, attendance, error: fetchError } = await getEventWithAttendanceForReminder(eventId);
    
    if (fetchError || !event) {
      throw new Error(fetchError?.message || 'Event not found');
    }
    
    // Check if event has Discord message IDs
    if (!event.discord_event_id) {
      throw new Error('Event is not published to Discord');
    }
    
    // Calculate time until event
    const timeUntil = getTimeUntilEvent(event.start_datetime);
    
    // Determine recipients (accepted + tentative by default)
    const recipients = [...attendance.accepted, ...attendance.tentative];
    
    if (recipients.length === 0) {
      throw new Error('No recipients found for reminder');
    }
    
    // Format the reminder message
    const message = formatReminderMessage(event, timeUntil, recipients);
    
    // Send to Discord bot for processing
    const response = await fetch('http://localhost:3001/api/send-reminder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventId: event.id,
        message: message,
        recipients: recipients.map(r => r.discord_id),
        discordEventIds: Array.isArray(event.discord_event_id) 
          ? event.discord_event_id.map(pub => pub.messageId)
          : [event.discord_event_id]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Discord bot responded with status ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to send reminder via Discord bot');
    }
    
    console.log('[MANUAL-REMINDER-DEBUG] Manual reminder sent successfully');
    
    return {
      success: true,
      recipientCount: recipients.length
    };
    
  } catch (error) {
    console.error('Error sending manual event reminder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}