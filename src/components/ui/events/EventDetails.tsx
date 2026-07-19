import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../card';
import { Check, Send, Users, Bell, Clock, CheckCircle2, Layers, Link2, ClipboardList } from 'lucide-react';
import type { Event, EventActivity, EventActivityParticipantBlock, ReferenceMaterial } from '../../../types/EventTypes';
import { publishEventFromCycle, updateEventMultipleDiscordIds } from '../../../utils/discordService';
import { fetchEvents, supabase, getEventActivities } from '../../../utils/supabaseClient';
import type { SupportRoleRequirement } from '../../../utils/supabaseClient';
import { uploadEventImage } from '../../../utils/eventImageService';
import { getAllSquadrons } from '../../../utils/organizationService';
import type { Squadron } from '../../../types/OrganizationTypes';
import { SendReminderDialog, type ReminderRecipientTypes } from './SendReminderDialog';
import { ParticipantCriteriaBubbles } from './ParticipantBlocksEditor';

/**
 * Check if the server is available before attempting to publish
 * @returns A promise that resolves to a boolean indicating if the server is available
 */
async function checkServerAvailability(): Promise<boolean> {
  try {
    // Use a simple HEAD request to check if the server is responding
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/health`, {
      method: 'HEAD',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

interface EventDetailsProps {
  event: Event | null;
  onEventUpdated?: () => void;
}

// A fully-resolved activity ready for display: lesson names, objectives and
// reference materials looked up, ad-hoc payloads normalized to the same shape
interface ActivityDisplay {
  key: string;
  name: string;
  context?: string; // e.g. "Fleet Replacement Syllabus · Week 3"
  kindLabel: string; // chip text: Syllabus Mission / Standalone / Advanced Qualification / Exercise
  objectives: Array<{ id: string; text: string }>;
  references: ReferenceMaterial[];
  supportRoles: SupportRoleRequirement[];
  participantBlocks: EventActivityParticipantBlock[];
  requiresAar: boolean;
}

// Shared small-caps section label used by every card in this pane
const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '10px'
};

const dedupeRefs = (refs: ReferenceMaterial[]): ReferenceMaterial[] =>
  refs.filter((ref, i, self) => i === self.findIndex(r => r.url === ref.url));

// Row shapes for the activity-resolution queries (training tables are absent
// from the stale generated Supabase types, so results are cast to these)
interface MissionRow {
  id: string;
  mission_name: string;
  week_number: number | null;
  reference_materials?: ReferenceMaterial[] | null;
  training_syllabi?: {
    name: string;
    kind?: string | null;
    reference_materials?: ReferenceMaterial[] | null;
  } | null;
}

interface ObjectiveRow {
  id: string;
  objective_text: string;
  syllabus_mission_id: string;
}

const EventDetails: React.FC<EventDetailsProps> = ({
  event,
  onEventUpdated
}) => {
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [scheduledReminders, setScheduledReminders] = useState<any[]>([]);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [scheduledPublication, setScheduledPublication] = useState<{scheduled_time: string} | null>(null);
  const [activityDisplays, setActivityDisplays] = useState<ActivityDisplay[]>([]);
  // Legacy fallback for events without activity rows: the event-level syllabus
  // mission's objectives (pre-Activities behavior)
  const [trainingObjectives, setTrainingObjectives] = useState<Array<{
    id: string;
    objective_text: string;
    scope_level: string;
    display_order: number;
  }>>([]);

  // Set initial image preview from event data
  useEffect(() => {
    const eventObj = event as any; // Cast to access non-standard properties

    if (event?.imageUrl) {
      setImagePreview(event.imageUrl);
    } else if (eventObj?.image_url) {
      setImagePreview(eventObj.image_url);
    } else {
      setImagePreview(null);
    }
  }, [event]);

  // Load squadrons and reminder data when event changes
  useEffect(() => {
    if (!event) {
      setSquadrons([]);
      setScheduledReminders([]);
      setScheduledPublication(null);
      return;
    }

    // Load squadrons
    const loadSquadrons = async () => {
      try {
        const { data } = await getAllSquadrons();
        if (data) {
          setSquadrons(data);
        }
      } catch (error) {
        console.error('Failed to load squadrons:', error);
      }
    };

    // Load scheduled reminders
    const loadReminders = async () => {
      try {
        const { data, error } = await supabase
          .from('event_reminders')
          .select('*')
          .eq('event_id', event.id)
          .eq('sent', false)
          .order('scheduled_time', { ascending: true });

        if (data && !error) {
          setScheduledReminders(data);
        }
      } catch (error) {
        console.error('Failed to load reminders:', error);
      }
    };

    // Use scheduled publication data from event prop if available, otherwise fetch
    const eventObj = event as any;
    if (eventObj.scheduledPublicationTime) {
      setScheduledPublication({ scheduled_time: eventObj.scheduledPublicationTime });
    } else {
      // Fallback to fetching if not included in event prop
      const loadScheduledPublication = async () => {
        try {
          const { data, error } = await supabase
            .from('scheduled_event_publications')
            .select('scheduled_time')
            .eq('event_id', event.id)
            .eq('sent', false)
            .single();

          if (data && !error) {
            setScheduledPublication(data);
          } else {
            setScheduledPublication(null);
          }
        } catch (error) {
          console.error('Failed to load scheduled publication:', error);
          setScheduledPublication(null);
        }
      };
      loadScheduledPublication();
    }

    loadSquadrons();
    loadReminders();
  }, [event]);

  // Load and resolve this event's activities. Events without activity rows fall
  // back to the legacy event-level syllabus mission objectives.
  useEffect(() => {
    if (!event) {
      setActivityDisplays([]);
      setTrainingObjectives([]);
      return;
    }

    let cancelled = false;

    const loadLegacyObjectives = async () => {
      const eventObj = event as any;
      const syllabusMissionId = event.syllabusMissionId || eventObj.syllabus_mission_id;
      if (!syllabusMissionId) {
        setTrainingObjectives([]);
        return;
      }
      const { data, error } = await supabase
        .from('syllabus_training_objectives')
        .select('id, objective_text, scope_level, display_order')
        .eq('syllabus_mission_id', syllabusMissionId)
        .order('display_order');
      if (!cancelled) setTrainingObjectives(!error && data ? (data as any) : []);
    };

    const load = async () => {
      try {
        const { activities } = await getEventActivities(event.id);
        if (cancelled) return;

        if (activities.length === 0) {
          setActivityDisplays([]);
          await loadLegacyObjectives();
          return;
        }

        const missionIds = [...new Set(activities.map(a => a.syllabusMissionId).filter(Boolean))] as string[];
        const qualIds = [...new Set(activities.map(a => a.qualificationId).filter(Boolean))] as string[];

        const [missionsResult, objectivesResult, qualsResult] = await Promise.all([
          missionIds.length > 0
            ? (supabase as any)
                .from('training_syllabus_missions')
                .select('id, mission_name, week_number, reference_materials, training_syllabi(name, kind, reference_materials)')
                .in('id', missionIds)
            : Promise.resolve({ data: [] }),
          missionIds.length > 0
            ? supabase
                .from('syllabus_training_objectives')
                .select('id, objective_text, display_order, syllabus_mission_id')
                .in('syllabus_mission_id', missionIds)
                .order('display_order')
            : Promise.resolve({ data: [] }),
          qualIds.length > 0
            ? supabase.from('qualifications').select('id, name').in('id', qualIds)
            : Promise.resolve({ data: [] })
        ]);
        if (cancelled) return;

        const missionRows = (missionsResult.data || []) as unknown as MissionRow[];
        const qualRows = (qualsResult.data || []) as unknown as Array<{ id: string; name: string }>;
        const objectiveRows = (objectivesResult.data || []) as unknown as ObjectiveRow[];

        const missionsById = new Map(missionRows.map(m => [m.id, m]));
        const qualNamesById = new Map(qualRows.map(q => [q.id, q.name]));
        const objectivesByMission = new Map<string, Array<{ id: string; text: string }>>();
        objectiveRows.forEach(o => {
          const list = objectivesByMission.get(o.syllabus_mission_id) || [];
          list.push({ id: o.id, text: o.objective_text });
          objectivesByMission.set(o.syllabus_mission_id, list);
        });

        const displays: ActivityDisplay[] = [...activities]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((activity: EventActivity, index) => {
            const settings = activity.settings || {};
            const base = {
              key: activity.id || `activity-${index}`,
              references: dedupeRefs(settings.referenceMaterials || []),
              supportRoles: settings.supportRoleRequirements || [],
              participantBlocks: settings.participantCriteria || [],
              requiresAar: Boolean(settings.requiresAar)
            };

            if (activity.kind === 'objectives') {
              return {
                ...base,
                name: activity.label || 'Training Exercise',
                kindLabel: 'Exercise',
                objectives: (activity.adHocObjectives || []).map(o => ({ id: o.id, text: o.text }))
              };
            }

            if (activity.kind === 'qualification') {
              return {
                ...base,
                name: qualNamesById.get(activity.qualificationId || '') || 'Qualification',
                kindLabel: 'Advanced Qualification',
                objectives: []
              };
            }

            // 'lesson' - resolve mission, source syllabus and inherited references
            const mission = activity.syllabusMissionId ? missionsById.get(activity.syllabusMissionId) : undefined;
            const syllabus = mission?.training_syllabi;
            const kindLabel = syllabus?.kind === 'pool'
              ? 'Standalone'
              : syllabus?.kind === 'advanced_qualification'
                ? 'Advanced Qualification'
                : 'Syllabus Mission';
            const inheritedRefs = [
              ...(syllabus?.reference_materials || []),
              ...(mission?.reference_materials || [])
            ];
            return {
              ...base,
              name: mission?.mission_name || activity.label || 'Lesson',
              context: syllabus
                ? `${syllabus.name}${mission?.week_number != null ? ` · Week ${mission.week_number}` : ''}`
                : undefined,
              kindLabel,
              objectives: activity.syllabusMissionId
                ? (objectivesByMission.get(activity.syllabusMissionId) || [])
                : [],
              references: dedupeRefs([...inheritedRefs, ...(settings.referenceMaterials || [])])
            };
          });

        setActivityDisplays(displays);
        setTrainingObjectives([]);
      } catch (error) {
        console.error('Failed to load event activities:', error);
        if (!cancelled) {
          setActivityDisplays([]);
          await loadLegacyObjectives();
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [event]);

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!event || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image size should be less than 5MB');
      return;
    }

    setImageLoading(true);
    setImageError(null);

    try {
      // Create object URL for preview
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);

      // Upload to Supabase
      const { url, error } = await uploadEventImage(event.id, file);

      if (error) {
        throw new Error(error.message);
      }

      // Update local state with the Supabase URL
      if (url) {
        setImagePreview(url);
        // Release the object URL since we now have the Supabase URL
        URL.revokeObjectURL(previewUrl);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setImageError(error instanceof Error ? error.message : 'Failed to upload image');
      setImagePreview(null);
    } finally {
      setImageLoading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  // Function to refresh event data from database
  const refreshEventData = useCallback(async () => {
    if (!event) return;

    try {

      // Get latest event data from database
      const { events: fetchedEvents } = await fetchEvents(event.cycleId);

      // Find this event in the results
      const updatedEvent = fetchedEvents.find(e => e.id === event.id);

      if (updatedEvent) {
        // Manually trigger a re-render by updating the DOM
        // This allows parent component to handle the actual event state
        const discordCard = document.querySelector('#discord-integration-card');
        if (discordCard) {
          if (updatedEvent.discordEventId || updatedEvent.discord_event_id) {
            discordCard.classList.remove('hidden');
          } else {
            discordCard.classList.add('hidden');
          }
        }
          // Update button state
        const publishBtn = document.querySelector('#publish-discord-btn');
        if (publishBtn && (updatedEvent.discordEventId || updatedEvent.discord_event_id)) {
          publishBtn.setAttribute('disabled', 'true');
          publishBtn.classList.add('published');
          const spanElement = publishBtn.querySelector('span');
          if (spanElement) {
            spanElement.textContent = 'Published to Discord';
          }
        }
      }
    } catch (error) {
      // Silent failure for refresh operations
    } finally {
    }
  }, [event]);

  const handlePublishToDiscord = async () => {
    if (!event) {
      return;
    }

    // Check if the event already has a discord message ID (already published)
    if (event.discordEventId || event.discord_event_id) {
      return;
    }

    // Check if server is available before attempting to publish
    setPublishing(true);
    setPublishMessage(null);

    let timeoutId: NodeJS.Timeout | undefined;
    let publishTimeoutId: NodeJS.Timeout | undefined;

    try {
      // First check if the server is available
      const isServerAvailable = await checkServerAvailability();

      if (!isServerAvailable) {
        throw new Error('Cannot connect to the server. Please check if the server is running and try again.');
      }

      // Check database directly for the image_url and participants for this event
      const dbEventPromise = supabase
        .from('events')
        .select('image_url, participants')
        .eq('id', event.id)
        .single();

      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Database query timed out')), 10000);
      });

      const { data: dbEvent } = await Promise.race([dbEventPromise, timeoutPromise]) as any;
      if (timeoutId) clearTimeout(timeoutId);

      // Create an enhanced version of the event with guaranteed image URL
      const publishableEvent = {
        ...event,
        // Handle JSONB image_url structure for multiple images
        imageUrl: typeof dbEvent?.image_url === 'object' && dbEvent.image_url?.headerImage
          ? dbEvent.image_url.headerImage
          : dbEvent?.image_url || imagePreview || event.imageUrl || (event as any).image_url,
        // Also pass the full JSONB structure for multi-image support
        images: typeof dbEvent?.image_url === 'object' ? dbEvent.image_url : undefined,
        // Ensure participants is included from database
        participants: dbEvent?.participants || event.participants
      };

      // Add timeout to the publish call
      const publishPromise = publishEventFromCycle(publishableEvent);
      let publishTimeoutId: NodeJS.Timeout | undefined;
      const publishTimeoutPromise = new Promise((_, reject) => {
        publishTimeoutId = setTimeout(() => reject(new Error('Publish request timed out')), 30000);
      });

      const response = await Promise.race([publishPromise, publishTimeoutPromise]) as any;
      if (publishTimeoutId) clearTimeout(publishTimeoutId);

      if (!response.success) {
        if (response.errors.length > 0) {
          const errorMessages = response.errors.map((err: any) =>
            `Squadron ${err.squadronId}: ${err.error}`
          ).join('; ');
          throw new Error(`Failed to publish to some squadrons: ${errorMessages}`);
        } else {
          throw new Error('Failed to publish event to Discord');
        }
      }

      // Update event with multiple Discord message IDs
      if (response.publishedChannels.length > 0) {
        await updateEventMultipleDiscordIds(event.id, response.publishedChannels);

        // Schedule reminders if the event has reminder settings
        if (event.eventSettings?.firstReminderEnabled || event.eventSettings?.secondReminderEnabled) {
          try {
            const reminderSettings = {
              firstReminder: {
                enabled: Boolean(event.eventSettings.firstReminderEnabled),
                value: event.eventSettings.firstReminderTime?.value || 15,
                unit: (event.eventSettings.firstReminderTime?.unit || 'minutes') as 'minutes' | 'hours' | 'days',
                recipients: {
                  accepted: event.eventSettings.firstReminderRecipients?.accepted ?? false,
                  tentative: event.eventSettings.firstReminderRecipients?.tentative ?? true,
                  declined: event.eventSettings.firstReminderRecipients?.declined ?? false,
                  noResponse: event.eventSettings.firstReminderRecipients?.noResponse ?? true
                }
              },
              secondReminder: {
                enabled: Boolean(event.eventSettings.secondReminderEnabled),
                value: event.eventSettings.secondReminderTime?.value || 3,
                unit: (event.eventSettings.secondReminderTime?.unit || 'days') as 'minutes' | 'hours' | 'days',
                recipients: {
                  accepted: event.eventSettings.secondReminderRecipients?.accepted ?? true,
                  tentative: event.eventSettings.secondReminderRecipients?.tentative ?? true,
                  declined: event.eventSettings.secondReminderRecipients?.declined ?? false,
                  noResponse: event.eventSettings.secondReminderRecipients?.noResponse ?? false
                }
              }
            };

            const { scheduleEventReminders } = await import('../../../utils/reminderService');
            const reminderResult = await scheduleEventReminders(
              event.id,
              event.datetime,
              reminderSettings
            );

            if (!reminderResult.success) {
              console.warn('[PUBLISH-REMINDER-DEBUG] Failed to schedule reminders for published event:', reminderResult.error);
            }
          } catch (reminderError) {
            console.error('[PUBLISH-REMINDER-DEBUG] Error scheduling reminders for published event:', reminderError);
          }
        }
      }

      const publishedCount = response.publishedChannels.length;
      const errorCount = response.errors.length;

      // Only show error messages, not success messages (button state serves as confirmation)
      if (publishedCount === 0) {
        setPublishMessage({
          type: 'error',
          text: 'Failed to publish to any squadrons'
        });
      } else if (errorCount > 0) {
        setPublishMessage({
          type: 'error',
          text: `Published to ${publishedCount} squadron${publishedCount !== 1 ? 's' : ''}, but ${errorCount} failed`
        });
      } else {
        // Clear any existing messages on successful publish
        setPublishMessage(null);
      }

      // Refresh data from database to get updated Discord IDs
      await refreshEventData();

      // Notify parent component to refresh events list
      if (onEventUpdated) {
        onEventUpdated();
      }

      // Clear the message after 5 seconds
      setTimeout(() => {
        setPublishMessage(null);
      }, 5000);
    } catch (error) {
      // Provide more helpful error messages
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorMessage = `Network error: Unable to reach the server. Make sure the server is running at ${import.meta.env.VITE_API_URL}`;
        } else if (error.message.includes('timed out')) {
          errorMessage = 'Request timed out. The server might be busy or slow to respond.';
        } else {
          errorMessage = error.message;
        }
      }

      setPublishMessage({
        type: 'error',
        text: errorMessage
      });
    } finally {
      // Clean up any remaining timeouts
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (publishTimeoutId !== undefined) clearTimeout(publishTimeoutId);

      setPublishing(false);
    }
  };

  // Compact duration, e.g. "1h 30m"
  const formatDuration = (startTime: string, endTime?: string) => {
    if (!endTime) return null;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const diffMs = end.getTime() - start.getTime();
    const totalMinutes = Math.round(diffMs / (1000 * 60));

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  // Get timezone display with UTC offset
  const getTimezoneDisplay = (timezone?: string) => {
    if (!timezone) return null;

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
      });

      const parts = formatter.formatToParts(now);
      const offsetPart = parts.find(part => part.type === 'timeZoneName');
      const offset = offsetPart?.value || '';

      return `${timezone} ${offset}`;
    } catch (error) {
      return timezone;
    }
  };

  // Discord icon component
  const DiscordIcon = ({ size = 18, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.246.195.373.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.438a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.201 0 2.176 1.068 2.157 2.38 0 1.311-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.201 0 2.176 1.068 2.157 2.38 0 1.311-.956 2.38-2.157 2.38z"/>
    </svg>
  );

  // Handle manual reminder send - opens dialog
  const handleSendReminder = () => {
    if (!event || sendingReminder) return;
    setShowReminderDialog(true);
  };

  // Handle confirmed reminder send from dialog
  const handleConfirmSendReminder = async (recipientTypes: ReminderRecipientTypes) => {
    if (!event || sendingReminder) return;

    setSendingReminder(true);
    setShowReminderDialog(false);

    try {
      // Import the reminder service function
      const { sendEventReminder } = await import('../../../utils/reminderService');

      const result = await sendEventReminder(event.id, recipientTypes);

      if (result.success) {
        setPublishMessage({
          type: 'success',
          text: `Reminder sent successfully to ${result.recipientCount || 0} recipients`
        });
      } else {
        throw new Error(result.error || 'Failed to send reminder');
      }
    } catch (error) {
      console.error('Error sending manual reminder:', error);
      setPublishMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send reminder'
      });
    } finally {
      setSendingReminder(false);

      // Clear message after 5 seconds
      setTimeout(() => {
        setPublishMessage(null);
      }, 5000);
    }
  };

  if (!event) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
          Select an event to view details
        </div>
      </div>
    );
  }

  // Check which Discord ID field is actually populated
  const isPublished = Boolean(event.discordEventId) || Boolean(event.discord_event_id);
  const isScheduled = !isPublished && scheduledPublication !== null;
  const publishedChannelCount = Array.isArray(event.discord_event_id) ? event.discord_event_id.length : 0;

  // Format scheduled publication time
  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDatePart = (isoString: string) =>
    new Date(isoString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTimePart = (isoString: string) =>
    new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const participatingSquadrons = (event.participants || [])
    .map(id => squadrons.find(s => s.id === id))
    .filter(Boolean) as Squadron[];

  const duration = formatDuration(event.datetime, event.endDatetime || undefined);

  const reminderSummary = (
    enabled?: boolean,
    time?: { value: number; unit: string }
  ) => (enabled && time ? `${time.value} ${time.unit} before start` : 'Disabled');

  // One column of the Start / End / Duration strip
  const scheduleStat = (label: string, primary: string, secondary?: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 500,
        color: '#94A3B8',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '2px'
      }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', lineHeight: 1.3 }}>{primary}</div>
      {secondary && (
        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.3 }}>{secondary}</div>
      )}
    </div>
  );

  const renderObjectives = (objectives: Array<{ id: string; text: string }>) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {objectives.map(objective => (
        <div key={objective.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <CheckCircle2 size={13} style={{ color: '#94A3B8', flexShrink: 0, marginTop: '3px' }} />
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{objective.text}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {/* Scrollable content area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 16px 0 16px'
        }}
      >
      {/* Title + creator */}
      <div style={{ marginBottom: '10px' }}>
        <h1 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#0F172A',
          marginBottom: '4px'
        }}>
          {event.title}
        </h1>
        <div style={{ fontSize: '13px', color: '#64748B' }}>
          Created by{' '}
          <span style={{ fontWeight: 500, color: '#475569' }}>
            {event.creator && (event.creator.callsign || event.creator.boardNumber)
              ? `${event.creator.boardNumber ? `${event.creator.boardNumber} ` : ''}${event.creator.callsign || 'Unknown'}`
              : event.creator ? 'Unknown User' : 'System'}
          </span>
          {event.creator?.billet && <span> · {event.creator.billet}</span>}
        </div>
      </div>

      {/* Schedule: compact Start / End / Duration strip */}
      <Card className="p-4" style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          {scheduleStat('Start', formatDatePart(event.datetime), formatTimePart(event.datetime))}
          {event.endDatetime && scheduleStat('End', formatDatePart(event.endDatetime), formatTimePart(event.endDatetime))}
          {duration && scheduleStat('Duration', duration)}
        </div>
        {event.eventSettings?.timezone && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #F1F5F9',
            fontSize: '12px',
            color: '#6B7280',
            fontFamily: 'monospace'
          }}>
            <Clock size={12} />
            <span>{getTimezoneDisplay(event.eventSettings.timezone)}</span>
          </div>
        )}
        {event.restrictedTo && event.restrictedTo.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#B45309',
              backgroundColor: '#FEF3C7',
              padding: '3px 8px',
              borderRadius: '4px'
            }}>
              Restricted: {event.restrictedTo.join(', ')}
            </span>
          </div>
        )}
      </Card>

      {/* Description */}
      {event.description && (
        <Card className="p-4" style={{ marginBottom: '10px' }}>
          <div style={sectionLabelStyle}>
            <ClipboardList size={14} />
            Description
          </div>
          <div style={{
            fontSize: '13px',
            color: '#374151',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.5'
          }}>
            {event.description}
          </div>
        </Card>
      )}

      {/* Activities: what's happening at this event, who each activity is for,
          and its objectives / support roles / references */}
      {activityDisplays.length > 0 && (
        <Card className="p-4" style={{ marginBottom: '10px' }}>
          <div style={sectionLabelStyle}>
            <Layers size={14} />
            Activities
            <span style={{ fontWeight: 400, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 }}>
              ({activityDisplays.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activityDisplays.map((display, index) => (
              <div
                key={display.key}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                {/* Activity header: number, name, source context, kind chip */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  backgroundColor: '#F8FAFC',
                  borderBottom: '1px solid #F1F5F9'
                }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#64748B',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                    flexShrink: 0
                  }}>
                    {index + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1E293B',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {display.name}
                    </div>
                    {display.context && (
                      <div style={{
                        fontSize: '11px',
                        color: '#64748B',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {display.context}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#475569',
                    backgroundColor: '#E2E8F0',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {display.kindLabel}
                  </span>
                </div>

                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Who this activity is for */}
                  <ParticipantCriteriaBubbles blocks={display.participantBlocks} squadrons={squadrons} />

                  {display.objectives.length > 0 && renderObjectives(display.objectives)}

                  {display.supportRoles.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <Users size={13} style={{ color: '#94A3B8', flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                        Support:{' '}
                        {display.supportRoles
                          .map(role => `${role.name}${role.required > 0 ? ` ×${role.required}` : ' (optional)'}`)
                          .join(', ')}
                      </span>
                    </div>
                  )}

                  {display.references.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {display.references.map((ref, refIndex) => (
                        <a
                          key={`${ref.url}-${refIndex}`}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#2563EB',
                            backgroundColor: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            textDecoration: 'none',
                            maxWidth: '220px'
                          }}
                        >
                          <Link2 size={10} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ref.name || ref.url}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {display.requiresAar && (
                    <div>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#B45309',
                        backgroundColor: '#FEF3C7',
                        padding: '2px 8px',
                        borderRadius: '9999px'
                      }}>
                        AAR required
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Legacy fallback: events without activity rows show the event-level
          syllabus mission's objectives (pre-Activities behavior) */}
      {activityDisplays.length === 0 && trainingObjectives.length > 0 && (
        <Card className="p-4" style={{ marginBottom: '10px' }}>
          <div style={sectionLabelStyle}>
            <CheckCircle2 size={14} />
            Training Objectives (DLOs)
          </div>
          {renderObjectives(trainingObjectives.map(o => ({ id: o.id, text: o.objective_text })))}
        </Card>
      )}

      {/* Discord & Reminders: publication status, publish targets, reminder plan */}
      <Card className="p-4" style={{ marginBottom: '10px' }}>
        <div style={sectionLabelStyle}>
          <DiscordIcon size={14} className="text-indigo-500" />
          Discord & Reminders
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Publication status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isScheduled ? (
              <Clock size={14} style={{ color: '#5865F2', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isPublished ? '#10B981' : '#CBD5E1',
                flexShrink: 0
              }} />
            )}
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
              {isScheduled
                ? `Scheduled for publication on ${formatScheduledTime(scheduledPublication!.scheduled_time)}`
                : isPublished
                  ? `Published to Discord${publishedChannelCount > 1 ? ` (${publishedChannelCount} squadrons)` : ''}`
                  : 'Not yet published'}
            </span>
          </div>

          {/* Publish targets (participating squadrons) */}
          {participatingSquadrons.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Publishes to:</span>
              {participatingSquadrons.map(squadron => (
                <span
                  key={squadron.id}
                  title={squadron.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    borderRadius: '9999px',
                    padding: '2px 8px 2px 4px'
                  }}
                >
                  {squadron.insignia_url && (
                    <span style={{
                      width: '18px',
                      height: '18px',
                      backgroundImage: `url(${squadron.insignia_url})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      flexShrink: 0
                    }} />
                  )}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                    {squadron.designation || squadron.name}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Reminder plan */}
          {event.eventSettings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Bell size={12} style={{ color: '#94A3B8', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  First reminder · {reminderSummary(event.eventSettings.firstReminderEnabled, event.eventSettings.firstReminderTime)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Bell size={12} style={{ color: '#94A3B8', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Second reminder · {reminderSummary(event.eventSettings.secondReminderEnabled, event.eventSettings.secondReminderTime)}
                </span>
              </div>
            </div>
          )}

          {/* Next scheduled reminder + manual send */}
          {scheduledReminders.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '6px 10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <Clock size={12} style={{ color: '#94A3B8', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Next reminder: {new Date(scheduledReminders[0].scheduled_time).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              </div>
              <button
                onClick={handleSendReminder}
                disabled={sendingReminder}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: sendingReminder ? 'not-allowed' : 'pointer',
                  opacity: sendingReminder ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  if (!sendingReminder) {
                    e.currentTarget.style.backgroundColor = '#2563EB';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!sendingReminder) {
                    e.currentTarget.style.backgroundColor = '#3B82F6';
                  }
                }}
              >
                {sendingReminder ? (
                  <>
                    <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                         style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Bell size={12} />
                    <span>Send Now</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Event Image Section */}
      {(imagePreview || imageLoading) && (
        <Card className="p-4" style={{ marginBottom: '10px' }}>
          {imageLoading && (
            <div className="text-sm text-slate-500 flex items-center justify-center mb-3">
              <div className="w-4 h-4 mr-2 border-2 border-t-transparent border-slate-500 rounded-full animate-spin" />
              Processing image...
            </div>
          )}

          {imageError && (
            <div className="p-2 mb-3 bg-red-50 text-red-700 text-sm rounded-md">
              {imageError}
              <button
                className="ml-2 text-red-500 hover:text-red-700"
                onClick={() => setImageError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {imagePreview && (
            <div className="relative">
              <div className="relative rounded-lg overflow-hidden bg-slate-100" style={{
                maxWidth: '100%',
                maxHeight: '300px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '10px'
              }}>
                <img
                  src={imagePreview}
                  alt="Event image"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '8px'
                  }}
                />

              </div>
            </div>
          )}

          {/* Hidden file input for image replacement */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
        </Card>
      )}
      </div>

      {/* Fixed Publish to Discord Button Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          borderTop: '1px solid #E2E8F0',
          padding: '12px',
          backgroundColor: '#FFFFFF',
          borderRadius: '0 0 8px 8px',
          position: 'relative',
          zIndex: 5,
          maxHeight: '103px'
        }}
      >
        {/* Created and Updated timestamps */}
        <div style={{
          fontSize: '11px',
          color: '#94A3B8',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          {(event as any).created_at && (
            <span>
              Created: {new Date((event as any).created_at).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
          {(event as any).updated_at && (
            <span>
              Updated: {new Date((event as any).updated_at).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>

        {publishMessage && (
          <div
            className={`p-3 mb-4 rounded-md ${publishMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {publishMessage.text}
          </div>
        )}

{isScheduled ? (
          <div style={{
            display: 'flex',
            width: '100%',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {/* Left side - Scheduled status */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: '#5865F2',
              color: 'white',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              justifyContent: 'center',
              opacity: 0.7
            }}>
              <Clock size={18} />
              <span>Scheduled for Publication</span>
            </div>

            {/* Right side - Publish Now button */}
            <button
              onClick={async () => {
                if (publishing || !event) return;

                setPublishing(true);
                try {
                  // First, publish the event
                  await handlePublishToDiscord();

                  // Then delete the scheduled publication record
                  if (scheduledPublication) {
                    const { error: deleteError } = await supabase
                      .from('scheduled_event_publications')
                      .delete()
                      .eq('event_id', event.id);

                    if (deleteError) {
                      console.error('Failed to delete scheduled publication:', deleteError);
                    } else {
                      setScheduledPublication(null);
                    }
                  }
                } catch (error) {
                  console.error('Failed to publish now:', error);
                } finally {
                  setPublishing(false);
                }
              }}
              disabled={publishing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 16px',
                backgroundColor: '#4C51BF',
                color: 'white',
                border: 'none',
                borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: publishing ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter',
                fontSize: '13px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!publishing) {
                  e.currentTarget.style.backgroundColor = '#4338CA';
                }
              }}
              onMouseLeave={(e) => {
                if (!publishing) {
                  e.currentTarget.style.backgroundColor = '#4C51BF';
                }
              }}
            >
              {publishing ? (
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                     style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
              ) : (
                <>
                  <Send size={16} />
                  <span>Publish Now</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handlePublishToDiscord}
            disabled={publishing || isPublished}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: isPublished ? '#10B981' : '#3B82F6',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              cursor: isPublished ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              width: '100%',
              justifyContent: 'center',
              opacity: isPublished ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!isPublished && !publishing) {
                e.currentTarget.style.backgroundColor = '#2563EB';
              }
            }}
            onMouseLeave={(e) => {
              if (!isPublished && !publishing) {
                e.currentTarget.style.backgroundColor = '#3B82F6';
              }
            }}
          >
            {publishing ? (
              <>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                     style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                <span>Publishing...</span>
              </>
            ) : isPublished ? (
              <>
                <Check size={18} />
                <span>Published to Discord</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span>Publish to Discord</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Send Reminder Dialog */}
      {event && (
        <SendReminderDialog
          open={showReminderDialog}
          onClose={() => setShowReminderDialog(false)}
          event={{ id: event.id, name: event.title }}
          onSend={handleConfirmSendReminder}
        />
      )}
    </div>
  );
};

export default EventDetails;
