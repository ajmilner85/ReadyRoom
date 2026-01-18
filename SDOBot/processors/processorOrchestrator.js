/**
 * PROCESSOR ORCHESTRATOR
 *
 * PURPOSE: Coordinate all background processors on a unified schedule
 *
 * RESPONSIBILITIES:
 * - Start all processors on server initialization
 * - Run processors immediately on startup
 * - Schedule processors to run every 60 seconds
 * - Handle errors from individual processors gracefully
 *
 * PROCESSORS MANAGED:
 * - processReminders: Event reminder notifications
 * - processScheduledPublications: Scheduled event publishing
 * - processConcludedEvents: Mark finished events for cleanup
 * - processMissionStatusUpdates: Update mission status based on timing
 *
 * USAGE:
 * Called once from server startup: startProcessorOrchestrator()
 */

const { processReminders } = require('./reminderProcessor');
const { processScheduledPublications } = require('./scheduledPublicationProcessor');
const { processConcludedEvents } = require('./concludedEventsProcessor');
const { processMissionStatusUpdates } = require('./missionStatusProcessor');

let processorIntervalId = null;

function startProcessorOrchestrator() {
  console.log('Starting server-side processor orchestrator...');

  // Process reminders immediately
  processReminders().catch(error => {
    console.error('Error in initial reminder processing:', error);
  });

  // Process scheduled publications immediately
  processScheduledPublications().catch(error => {
    console.error('Error in initial scheduled publications processing:', error);
  });

  // Process concluded events immediately
  processConcludedEvents().catch(error => {
    console.error('Error in initial concluded events processing:', error);
  });

  // Process mission status updates immediately
  processMissionStatusUpdates().catch(error => {
    console.error('Error in initial mission status updates processing:', error);
  });

  // Then process every 1 minute
  processorIntervalId = setInterval(() => {
    processReminders().catch(error => {
      console.error('Error in scheduled reminder processing:', error);
    });
    processScheduledPublications().catch(error => {
      console.error('Error in scheduled publications processing:', error);
    });
    processConcludedEvents().catch(error => {
      console.error('Error in scheduled concluded events processing:', error);
    });
    processMissionStatusUpdates().catch(error => {
      console.error('Error in scheduled mission status updates processing:', error);
    });
  }, 60000); // 1 minute = 60000ms

  console.log('Processor orchestrator started (checking every 1 minute)');
}

function stopProcessorOrchestrator() {
  if (processorIntervalId) {
    clearInterval(processorIntervalId);
    processorIntervalId = null;
    console.log('Processor orchestrator stopped');
  }
}

module.exports = {
  startProcessorOrchestrator,
  stopProcessorOrchestrator
};
