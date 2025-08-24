import { startReminderProcessor } from './reminderProcessor';

let reminderIntervalId: NodeJS.Timeout | null = null;

/**
 * Initialize the application services
 */
export function initializeApp() {
  console.log('Initializing ReadyRoom application services...');
  
  // Start the reminder processor to check for and send event reminders
  // Check every 5 minutes for reminders
  reminderIntervalId = startReminderProcessor(5);
  
  console.log('Application services initialized successfully');
}

/**
 * Cleanup application services
 */
export function cleanupApp() {
  console.log('Cleaning up ReadyRoom application services...');
  
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
  }
  
  console.log('Application services cleaned up successfully');
}