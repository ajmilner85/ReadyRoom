import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Chip, EmptyState, Icon, Toast } from '../primitives';
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
  /** Opens the Edit Event dialog (owned by the Events page). */
  onEdit?: (event: Event) => void;
  /** Name of the event's cycle, for the meta grid. */
  cycleName?: string;
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

/** Card used by every section of the details grid (pane-title header, optional count/action/footer). */
const Section: React.FC<{ title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode }> = ({ title, count, action, children, className = '', footer }) => (
  <section className={`rounded-rr-lg border border-border bg-panel overflow-hidden flex flex-col ${className}`}>
    <div className="flex items-center gap-2 px-[14px] min-h-[42px] border-b border-border">
      <span className="rr-pane-title">{title}</span>
      {count != null ? <span className="font-mono text-[11px] text-text3">{count}</span> : null}
      <span className="flex-1" />
      {action}
    </div>
    <div className="flex-1">{children}</div>
    {footer ? <div className="px-[14px] py-[8px] text-[11px] text-text3 border-t border-border">{footer}</div> : null}
  </section>
);


const EventDetails: React.FC<EventDetailsProps> = ({
  event,
  onEventUpdated,
  onEdit,
  cycleName
}) => {
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false); // hide the card when the URL doesn't load
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

    setImageFailed(false);
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

  // Scheduled events: publish immediately, then remove the pending scheduled publication
  const publishNow = async () => {
    if (publishing || !event) return;
    try {
      await handlePublishToDiscord();
      if (scheduledPublication) {
        const { error: deleteError } = await supabase.from('scheduled_event_publications').delete().eq('event_id', event.id);
        if (deleteError) console.error('Failed to delete scheduled publication:', deleteError);
        else setScheduledPublication(null);
      }
    } catch (error) {
      console.error('Failed to publish now:', error);
    }
  };

  const formatScheduledTime = (isoString: string) =>
    new Date(isoString).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState icon="events" title="No event selected" message="Expand a cycle on the left and pick an event." />
      </div>
    );
  }

  const isPublished = Boolean(event.discordEventId) || Boolean(event.discord_event_id);
  const isScheduled = !isPublished && scheduledPublication !== null;
  const publishedChannelCount = Array.isArray(event.discord_event_id) ? event.discord_event_id.length : 0;

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const participatingSquadrons = (event.participants || [])
    .map(id => squadrons.find(s => s.id === id))
    .filter(Boolean) as Squadron[];

  const duration = formatDuration(event.datetime, event.endDatetime || undefined);
  const settings = event.eventSettings;

  // Activity kind -> tint (handoff: syllabus = info, qualification = accent, exercise = good)
  const kindTone = (label: string) =>
    label === 'Advanced Qualification' ? 'var(--rr-accent-text)' : label === 'Exercise' ? 'var(--rr-good)' : 'var(--rr-info)';

  // Mission support roles: event-level requirements, else aggregated from the activities
  const supportRoles: SupportRoleRequirement[] = (() => {
    const own = (settings?.supportRoleRequirements || []) as SupportRoleRequirement[];
    if (own.length) return own;
    const merged = new Map<string, SupportRoleRequirement>();
    activityDisplays.forEach(a => a.supportRoles.forEach(r => {
      const key = (r as any).id || r.name;
      const prev = merged.get(key);
      merged.set(key, prev ? { ...prev, required: Math.max(prev.required, r.required) } : r);
    }));
    return [...merged.values()];
  })();

  // Reference materials: event-level plus every activity's (deduped by URL)
  const references = dedupeRefs([...(event.referenceMaterials || []), ...activityDisplays.flatMap(a => a.references)]);

  const before = (t: { value: number; unit: string }) => `${t.value} ${t.value === 1 ? t.unit.replace(/s$/, '') : t.unit} before`;

  const recipientChips = (r?: { accepted: boolean; tentative: boolean; declined: boolean; noResponse: boolean }) => {
    if (!r) return [];
    return [
      r.accepted && { t: 'Accepted', c: 'var(--rr-good)' },
      r.tentative && { t: 'Tentative', c: 'var(--rr-warn)' },
      r.declined && { t: 'Declined', c: 'var(--rr-bad)' },
      r.noResponse && { t: 'No response', c: 'var(--rr-text3)' },
    ].filter(Boolean) as Array<{ t: string; c: string }>;
  };

  const notifications: Array<{ label: string; when: string; chips: Array<{ t: string; c: string }>; off?: boolean }> = [
    {
      label: 'Initial publication',
      when: isPublished ? 'Sent' : isScheduled ? formatScheduledTime(scheduledPublication!.scheduled_time) : 'Not published',
      chips: (settings?.initialNotificationRoles || []).map(r => ({ t: `@${r.name}`, c: 'var(--rr-purple)' })),
    },
    {
      label: 'First reminder',
      when: settings?.firstReminderEnabled && settings.firstReminderTime ? before(settings.firstReminderTime) : 'Off',
      chips: settings?.firstReminderEnabled ? recipientChips(settings.firstReminderRecipients) : [],
      off: !settings?.firstReminderEnabled,
    },
    {
      label: 'Second reminder',
      when: settings?.secondReminderEnabled && settings.secondReminderTime ? before(settings.secondReminderTime) : 'Off',
      chips: settings?.secondReminderEnabled ? recipientChips(settings.secondReminderRecipients) : [],
      off: !settings?.secondReminderEnabled,
    },
  ];

  const creator = event.creator && (event.creator.callsign || event.creator.boardNumber)
    ? `${event.creator.boardNumber ? `${event.creator.boardNumber} ` : ''}${event.creator.callsign || 'Unknown'}`
    : event.creator ? 'Unknown user' : 'System';

  const meta: Array<{ k: string; v: React.ReactNode; sub?: React.ReactNode; mono?: boolean }> = [
    { k: 'Start', v: fmtDate(event.datetime), sub: fmtTime(event.datetime) },
    ...(event.endDatetime ? [{ k: 'End', v: fmtDate(event.endDatetime), sub: fmtTime(event.endDatetime) }] : []),
    ...(duration ? [{ k: 'Duration', v: duration, mono: true }] : []),
    ...(settings?.timezone ? [{ k: 'Time zone', v: settings.timezone.replace(/_/g, ' '), sub: (getTimezoneDisplay(settings.timezone) || '').replace(settings.timezone, '').trim() || undefined }] : []),
    { k: 'Cycle', v: cycleName || 'Standalone' },
    { k: 'Created by', v: creator, sub: event.creator?.billet || undefined },
  ];

  const objectivesList = (objectives: Array<{ id: string; text: string }>) => (
    <ul className="m-0 p-0 list-none flex flex-col gap-[3px]">
      {objectives.map(o => (
        <li key={o.id} className="flex items-start gap-[6px] text-[12.5px] leading-[1.45] text-text2">
          <Icon name="checkCircle" size={12} style={{ color: 'var(--rr-text3)', flexShrink: 0, marginTop: 3 }} />
          <span>{o.text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Status + actions bar */}
      <div className="flex-none flex items-center gap-[10px] flex-wrap px-4 py-[10px] border-b border-border bg-panel2">
        {isPublished ? (
          <Chip tone="good" size="sm"><span className="inline-block w-[6px] h-[6px] rounded-full bg-good mr-[2px]" />Published to Discord{publishedChannelCount > 1 ? ` · ${publishedChannelCount}` : ''}</Chip>
        ) : isScheduled ? (
          <Chip tone="info" size="sm"><Icon name="clock" size={11} />Scheduled · {formatScheduledTime(scheduledPublication!.scheduled_time)}</Chip>
        ) : (
          <Chip tone="neutral" size="sm">Not published</Chip>
        )}
        {participatingSquadrons.length > 0 ? (
          <span className="flex items-center gap-[6px] min-w-0 flex-wrap">
            <span className="text-[11.5px] text-text3">to</span>
            {participatingSquadrons.map(sq => (
              <span key={sq.id} title={sq.name} className="inline-flex items-center gap-[5px] h-[22px] pl-[3px] pr-[8px] rounded-full bg-panel border border-border text-[11px] font-semibold text-text2">
                {sq.insignia_url ? <img src={sq.insignia_url} alt="" className="w-4 h-4 object-contain" /> : null}
                {sq.designation || sq.name}
              </span>
            ))}
          </span>
        ) : null}
        <span className="flex-1" />
        {isPublished ? (
          <Button size="sm" variant="secondary" icon="bell" onClick={handleSendReminder} loading={sendingReminder}>Send Reminder</Button>
        ) : (
          <Button size="sm" variant="secondary" icon="send" onClick={isScheduled ? publishNow : handlePublishToDiscord} loading={publishing}>
            {isScheduled ? 'Publish Now' : 'Publish to Discord'}
          </Button>
        )}
        {onEdit ? <Button size="sm" variant="secondary" icon="edit" onClick={() => onEdit(event)}>Edit Event</Button> : null}
      </div>

      {publishMessage ? (
        <div className="flex-none px-4 pt-3">
          <Toast tone={publishMessage.type === 'success' ? 'good' : 'bad'} onDismiss={() => setPublishMessage(null)}>{publishMessage.text}</Toast>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid gap-[14px] content-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))' }}>
          {/* Meta grid */}
          <div className="col-span-full grid gap-x-5 gap-y-[14px] p-[14px] rounded-rr-lg border border-border bg-panel2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {meta.map(m => (
              <div key={m.k} className="min-w-0">
                <div className="rr-label mb-[4px]">{m.k}</div>
                <div className={`text-[13.5px] font-semibold text-text leading-[1.3] ${m.mono ? 'font-mono text-[12.5px]' : ''}`} style={{ overflowWrap: 'anywhere' }}>{m.v}</div>
                {m.sub ? <div className="text-[12px] text-text2 leading-[1.3]">{m.sub}</div> : null}
              </div>
            ))}
            {event.restrictedTo && event.restrictedTo.length > 0 ? (
              <div className="col-span-full"><Chip tone="warn" size="sm">Restricted: {event.restrictedTo.join(', ')}</Chip></div>
            ) : null}
          </div>

          {/* Briefing text + image */}
          {event.description ? (
            <Section title="Description" className={imagePreview && !imageFailed ? '' : 'col-span-full'}>
              <div className="px-[14px] py-3 text-[13.5px] leading-[1.6] text-text whitespace-pre-wrap" style={{ maxWidth: '75ch' }}>{event.description}</div>
            </Section>
          ) : null}
          {(imagePreview && !imageFailed) || imageLoading ? (
            <Section title="Image">
              <div className="p-3">
                {imageLoading ? <div className="text-[12.5px] text-text2 py-4 text-center">Processing image…</div> : null}
                {imageError ? <Toast tone="bad" onDismiss={() => setImageError(null)}>{imageError}</Toast> : null}
                {imagePreview ? (
                  <img src={imagePreview} alt="Event" onError={() => setImageFailed(true)} className="block w-full max-h-[320px] object-cover rounded-rr-md" />
                ) : null}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
              </div>
            </Section>
          ) : null}

          {/* Activities at this event */}
          {activityDisplays.length > 0 ? (
            <Section title="Activities at this event" count={activityDisplays.length} className="col-span-full">
              <div className="divide-y divide-border">
                {activityDisplays.map(a => {
                  const tone = kindTone(a.kindLabel);
                  return (
                    <div key={a.key} className="flex gap-3 px-[14px] py-3">
                      <span className="flex-none w-[3px] self-stretch rounded-full" style={{ background: tone }} />
                      <div className="flex-1 min-w-0 flex flex-col gap-[8px]">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold leading-[1.3]">{a.name}</div>
                            {a.context ? <div className="text-[12px] text-text2 mt-[1px]">{a.context}</div> : null}
                          </div>
                          <span className="flex-none font-mono text-[10px] font-semibold tracking-[.06em] uppercase px-2 py-[2px] rounded-[5px] border" style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 55%, transparent)` }}>
                            {a.kindLabel}
                          </span>
                          {a.requiresAar ? <Chip tone="warn" size="sm">AAR</Chip> : null}
                        </div>
                        <ParticipantCriteriaBubbles blocks={a.participantBlocks} squadrons={squadrons} />
                        {a.objectives.length > 0 ? objectivesList(a.objectives) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : trainingObjectives.length > 0 ? (
            <Section title="Training objectives" count={trainingObjectives.length} className="col-span-full">
              <div className="px-[14px] py-3">{objectivesList(trainingObjectives.map(o => ({ id: o.id, text: o.objective_text })))}</div>
            </Section>
          ) : null}

          {/* Mission support roles */}
          {supportRoles.length > 0 ? (
            <Section title="Mission Support Roles" count={supportRoles.length} footer="0 required = optional. Order matches the Discord post and attendance.">
              <div className="divide-y divide-border">
                {supportRoles.map((r, i) => (
                  <div key={`${r.name}-${i}`} className="flex items-center gap-3 px-[14px] py-[9px]">
                    <span className="w-4 font-mono text-[11px] text-text3">{i + 1}</span>
                    <span className="flex-1 min-w-0 text-[13.5px] font-medium truncate">{r.name}</span>
                    <span className={`font-mono text-[12px] font-semibold ${r.required > 0 ? 'text-text' : 'text-text3'}`}>{r.required > 0 ? `×${r.required}` : 'optional'}</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Notifications */}
          <Section
            title="Notifications"
            footer={scheduledReminders.length > 0 ? `Next reminder ${fmtDateTime(scheduledReminders[0].scheduled_time)}` : undefined}
          >
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div key={n.label} className="px-[14px] py-[10px]">
                  <div className="flex items-baseline gap-2">
                    <span className={`flex-1 text-[13.5px] font-semibold ${n.off ? 'text-text3' : 'text-text'}`}>{n.label}</span>
                    <span className="font-mono text-[11.5px] text-text2">{n.when}</span>
                  </div>
                  {n.chips.length > 0 ? (
                    <div className="flex flex-wrap gap-[5px] mt-[6px]">
                      {n.chips.map(c => (
                        <span key={c.t} className="inline-flex items-center gap-[5px] h-[20px] px-2 rounded-[5px] bg-panel2 border border-border2 text-[11px] text-text2">
                          <span className="w-[6px] h-[6px] rounded-full" style={{ background: c.c }} />{c.t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>

          {/* Reference materials */}
          {references.length > 0 ? (
            <Section title="Reference Materials" count={references.length}>
              <div className="divide-y divide-border">
                {references.map((ref, i) => (
                  <a key={`${ref.url}-${i}`} href={ref.url} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-[10px] px-[14px] py-[9px] no-underline hover:bg-panel2">
                    <Icon name="link" size={13} style={{ color: 'var(--rr-text3)', flexShrink: 0 }} />
                    <span className="flex-1 min-w-0 text-[13.5px] font-medium text-accent truncate">{ref.name || ref.url}</span>
                    <span className="flex-none font-mono text-[10.5px] text-text3 truncate max-w-[40%]">{(() => { try { return new URL(ref.url).hostname; } catch { return ''; } })()}</span>
                  </a>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Record */}
          <div className="col-span-full flex gap-4 flex-wrap text-[11px] text-text3 px-1">
            {(event as any).created_at ? <span>Created {fmtDateTime((event as any).created_at)}</span> : null}
            {(event as any).updated_at ? <span>Updated {fmtDateTime((event as any).updated_at)}</span> : null}
          </div>
        </div>
      </div>

      <SendReminderDialog
        open={showReminderDialog}
        onClose={() => setShowReminderDialog(false)}
        event={{ id: event.id, name: event.title }}
        onSend={handleConfirmSendReminder}
      />
    </div>
  );
};

export default EventDetails;
