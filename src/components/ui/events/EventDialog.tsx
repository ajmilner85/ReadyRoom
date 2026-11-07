import React, { useState, useEffect, useRef } from 'react';
import { Button, Chip, CloseButton, Field, FieldLabel, Icon, NumberStepper, SegmentedControl, Select, Textarea, TextInput, Toast, Toggle, controlClass } from '../primitives';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { fetchDiscordGuildRoles } from '../../../utils/discordService';
import { supabase, getEventActivities, getCycleActivities } from '../../../utils/supabaseClient';
import { getUserSettings } from '../../../utils/userSettingsService';
import ReferenceMaterialsInput from './ReferenceMaterialsInput';
import SupportRoleRequirementsEditor from './SupportRoleRequirementsEditor';
import EventActivitiesEditor from './EventActivitiesEditor';
import { DialogShell, DlgCard, RolePicker, SettingRow, SquadronToggleTile, StepIntro, UNIT_OPTIONS, unitWord, type ReminderUnit } from './dialogParts';
import type { ReferenceMaterial, TrainingSyllabusMission, EventActivity, CycleActivity, CycleSettings } from '../../../types/EventTypes';
import type { SupportRoleRequirement } from '../../../utils/supabaseClient';

interface EventDialogProps {
  onSave: (eventData: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    duration?: {
      hours: number;
      minutes: number;
    };
    participants?: string[];
    headerImage?: File | string | null;
    additionalImages?: (File | string | null)[];
    trackQualifications?: boolean;
    groupBySquadron?: boolean;
    showNoResponse?: boolean;
    aarOperationalOnly?: boolean;
    supportRoleRequirements?: SupportRoleRequirement[];
    timezone?: string;
    reminders?: {
      firstReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      secondReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      initialNotificationRoles?: Array<{ id: string; name: string }>;
    };
    scheduledPublication?: {
      enabled: boolean;
      scheduledTime?: string;
    };
    referenceMaterials?: ReferenceMaterial[];
    syllabusMissionId?: string;
    activities?: EventActivity[]; // developer-flagged; only present when the Event Activities flag is on
    includeInAttendanceReport?: boolean;
  }, shouldPublish?: boolean) => Promise<void>;
  onCancel: () => void;
  initialData?: {
    id?: string;
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    participants?: string[];
    isPublished?: boolean;
    imageUrl?: string;
    headerImageUrl?: string;
    additionalImageUrls?: string[];
    trackQualifications?: boolean;
    eventSettings?: {
      timezone?: string;
      groupResponsesByQualification?: boolean;
      groupBySquadron?: boolean;
      showNoResponse?: boolean;
      allowTentativeResponse?: boolean;
      aarOperationalOnly?: boolean;
      supportRoleRequirements?: SupportRoleRequirement[];
      firstReminderEnabled?: boolean;
      firstReminderTime?: {
        value: number;
        unit: 'minutes' | 'hours' | 'days';
      };
      firstReminderRecipients?: {
        accepted: boolean;
        tentative: boolean;
        declined: boolean;
        noResponse: boolean;
      };
      secondReminderEnabled?: boolean;
      secondReminderTime?: {
        value: number;
        unit: 'minutes' | 'hours' | 'days';
      };
      secondReminderRecipients?: {
        accepted: boolean;
        tentative: boolean;
        declined: boolean;
        noResponse: boolean;
      };
      initialNotificationRoles?: Array<{ id: string; name: string }>;
      // Legacy fields (deprecated)
      sendRemindersToAccepted?: boolean;
      sendRemindersToTentative?: boolean;
    };
    referenceMaterials?: ReferenceMaterial[];
    syllabusMissionId?: string;
    cycleId?: string;
    includeInAttendanceReport?: boolean;
  };
  squadrons?: Array<{ id: string; name: string; designation: string; insignia_url?: string | null }>;
  selectedCycle?: {
    id?: string;
    participants?: string[];
    syllabusId?: string;
    type?: string;
  };
  cycles?: Array<{ id: string; name: string; type: string }>;
  /** Open on the step that edits this part of the event (Edit icons on Event Details cards). */
  initialSection?: EventDialogSection;
}

export type EventDialogSection = 'details' | 'activities' | 'support' | 'references' | 'options' | 'notifications' | 'publish';

type WorkflowStep = 'details' | 'training' | 'mission' | 'participants' | 'reminders' | 'publish';

// Helper function to convert reminder time to milliseconds
const reminderTimeToMilliseconds = (value: number, unit: 'minutes' | 'hours' | 'days'): number => {
  switch (unit) {
    case 'minutes':
      return value * 60 * 1000;
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
};

export const EventDialog: React.FC<EventDialogProps> = ({
  onSave,
  onCancel,
  initialData,
  squadrons = [],
  selectedCycle,
  cycles = [],
  initialSection
}) => {
  const { settings } = useAppSettings();

  // Ref to track if we've loaded default notification roles (prevents re-loading when user removes roles)
  const hasLoadedDefaultsRef = React.useRef(false);

  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('details');
  const userNavigatedRef = React.useRef(false);
  const [sectionResolved, setSectionResolved] = useState(!initialSection);
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());

  // Form data state
  const [title, setTitle] = useState(initialData?.title || '');
  const [cycleId, setCycleId] = useState<string | undefined>(initialData?.cycleId || selectedCycle?.id);
  const [description, setDescription] = useState(initialData?.description || '');
  const [datetime, setDatetime] = useState('');
  const [timezone, setTimezone] = useState(
    initialData?.eventSettings?.timezone || settings.eventDefaults.referenceTimezone || 'America/New_York'
  );
  const [durationHours, setDurationHours] = useState(settings.eventDefaults.defaultDurationHours);
  const [durationMinutes, setDurationMinutes] = useState(settings.eventDefaults.defaultDurationMinutes);
  const [endDatetime, setEndDatetime] = useState('');
  const [participants, setParticipatingSquadrons] = useState<string[]>(
    initialData?.participants !== undefined ? initialData.participants : (selectedCycle?.participants || [])
  );
  
  const [trackQualifications, setTrackQualifications] = useState(
    initialData?.eventSettings?.groupResponsesByQualification !== undefined
      ? initialData.eventSettings.groupResponsesByQualification
      : (initialData?.trackQualifications !== undefined
        ? initialData.trackQualifications
        : settings.eventDefaults.groupResponsesByQualification)
  );

  const [groupBySquadron, setGroupBySquadron] = useState(
    initialData?.eventSettings?.groupBySquadron !== undefined
      ? initialData.eventSettings.groupBySquadron
      : settings.eventDefaults.groupBySquadron
  );

  const [showNoResponse, setShowNoResponse] = useState(
    initialData?.eventSettings?.showNoResponse !== undefined
      ? initialData.eventSettings.showNoResponse
      : settings.eventDefaults.showNoResponse
  );

  const [allowTentativeResponse, setAllowTentativeResponse] = useState(
    initialData?.eventSettings?.allowTentativeResponse !== undefined
      ? initialData.eventSettings.allowTentativeResponse
      : settings.eventDefaults.allowTentativeResponse ?? true
  );

  const [aarOperationalOnly, setAarOperationalOnly] = useState(
    initialData?.eventSettings?.aarOperationalOnly !== undefined
      ? initialData.eventSettings.aarOperationalOnly
      : settings.eventDefaults.aarOperationalOnlyByDefault
  );

  // Mission Support role requirements - editing an event keeps its saved list
  // (even if empty); new events start from the Settings > Events defaults
  const [supportRoleRequirements, setSupportRoleRequirements] = useState<SupportRoleRequirement[]>(
    initialData?.id
      ? (initialData?.eventSettings?.supportRoleRequirements || [])
      : (settings.eventDefaults.defaultSupportRoleRequirements || [])
  );

  // Include in attendance report setting - defaults to true, only relevant for cycle events
  const [includeInAttendanceReport, setIncludeInAttendanceReport] = useState(
    initialData?.includeInAttendanceReport !== undefined
      ? initialData.includeInAttendanceReport
      : true
  );

  // Reminder settings state - prioritize event settings over app defaults
  const [firstReminderEnabled, setFirstReminderEnabled] = useState(
    initialData?.eventSettings?.firstReminderEnabled !== undefined 
      ? initialData.eventSettings.firstReminderEnabled 
      : settings.eventDefaults.firstReminderEnabled
  );
  const [firstReminderValue, setFirstReminderValue] = useState(
    initialData?.eventSettings?.firstReminderTime?.value !== undefined 
      ? initialData.eventSettings.firstReminderTime.value 
      : settings.eventDefaults.firstReminderTime.value
  );
  const [firstReminderUnit, setFirstReminderUnit] = useState(
    initialData?.eventSettings?.firstReminderTime?.unit || settings.eventDefaults.firstReminderTime.unit
  );
  const [secondReminderEnabled, setSecondReminderEnabled] = useState(
    initialData?.eventSettings?.secondReminderEnabled !== undefined 
      ? initialData.eventSettings.secondReminderEnabled 
      : settings.eventDefaults.secondReminderEnabled
  );
  const [secondReminderValue, setSecondReminderValue] = useState(
    initialData?.eventSettings?.secondReminderTime?.value !== undefined 
      ? initialData.eventSettings.secondReminderTime.value 
      : settings.eventDefaults.secondReminderTime.value
  );
  const [secondReminderUnit, setSecondReminderUnit] = useState(
    initialData?.eventSettings?.secondReminderTime?.unit || settings.eventDefaults.secondReminderTime.unit
  );
  
  // First reminder recipients state
  const [firstReminderAccepted, setFirstReminderAccepted] = useState(
    initialData?.eventSettings?.firstReminderRecipients?.accepted !== undefined
      ? initialData.eventSettings.firstReminderRecipients.accepted
      : (initialData?.eventSettings?.sendRemindersToAccepted ?? settings.eventDefaults.firstReminderRecipients?.accepted ?? settings.eventDefaults.sendRemindersToAccepted)
  );
  const [firstReminderTentative, setFirstReminderTentative] = useState(
    initialData?.eventSettings?.firstReminderRecipients?.tentative !== undefined
      ? initialData.eventSettings.firstReminderRecipients.tentative
      : (initialData?.eventSettings?.sendRemindersToTentative ?? settings.eventDefaults.firstReminderRecipients?.tentative ?? settings.eventDefaults.sendRemindersToTentative)
  );
  const [firstReminderDeclined, setFirstReminderDeclined] = useState(
    initialData?.eventSettings?.firstReminderRecipients?.declined ?? settings.eventDefaults.firstReminderRecipients?.declined ?? false
  );
  const [firstReminderNoResponse, setFirstReminderNoResponse] = useState(
    initialData?.eventSettings?.firstReminderRecipients?.noResponse ?? settings.eventDefaults.firstReminderRecipients?.noResponse ?? false
  );

  // Second reminder recipients state
  const [secondReminderAccepted, setSecondReminderAccepted] = useState(
    initialData?.eventSettings?.secondReminderRecipients?.accepted !== undefined
      ? initialData.eventSettings.secondReminderRecipients.accepted
      : (initialData?.eventSettings?.sendRemindersToAccepted ?? settings.eventDefaults.secondReminderRecipients?.accepted ?? settings.eventDefaults.sendRemindersToAccepted)
  );
  const [secondReminderTentative, setSecondReminderTentative] = useState(
    initialData?.eventSettings?.secondReminderRecipients?.tentative !== undefined
      ? initialData.eventSettings.secondReminderRecipients.tentative
      : (initialData?.eventSettings?.sendRemindersToTentative ?? settings.eventDefaults.secondReminderRecipients?.tentative ?? settings.eventDefaults.sendRemindersToTentative)
  );
  const [secondReminderDeclined, setSecondReminderDeclined] = useState(
    initialData?.eventSettings?.secondReminderRecipients?.declined ?? settings.eventDefaults.secondReminderRecipients?.declined ?? false
  );
  const [secondReminderNoResponse, setSecondReminderNoResponse] = useState(
    initialData?.eventSettings?.secondReminderRecipients?.noResponse ?? settings.eventDefaults.secondReminderRecipients?.noResponse ?? false
  );
  
  // Discord role notifications state
  const [availableDiscordRoles, setAvailableDiscordRoles] = useState<Array<{ id: string; name: string; mentionable: boolean }>>([]);
  const [selectedNotificationRoles, setSelectedNotificationRoles] = useState<Array<{ id: string; name: string }>>(
    initialData?.eventSettings?.initialNotificationRoles || settings.eventDefaults.initialNotificationRoles || []
  );
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Scheduled publication state - use default setting only for new events (not editing)
  const [scheduledPublicationEnabled, setScheduledPublicationEnabled] = useState(
    initialData?.id ? false : settings.eventDefaults.scheduledPublicationEnabledByDefault
  );
  const [scheduledPublicationDatetime, setScheduledPublicationDatetime] = useState('');
  const [scheduledPublicationOffset, setScheduledPublicationOffset] = useState(
    settings.eventDefaults.scheduledPublicationOffset
  );

  // Event Activities state (developer-flagged feature). When the flag is off,
  // none of this is read and the dialog behaves exactly as before.
  const [activitiesEnabled, setActivitiesEnabled] = useState(false);
  const [flagChecked, setFlagChecked] = useState(false); // the flag decides the step list
  const [eventActivities, setEventActivities] = useState<EventActivity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const activitiesPrefilledRef = useRef(false);
  // Cycle-level activities + event defaults (developer-flagged)
  const [cycleData, setCycleData] = useState<{
    startDate?: string;
    settings: CycleSettings | null;
    activities: CycleActivity[];
  } | null>(null);
  const cycleDefaultsAppliedRef = useRef(false);

  // Training syllabus state
  const [syllabusMissions, setSyllabusMissions] = useState<TrainingSyllabusMission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>(initialData?.syllabusMissionId || '');
  const [inheritedReferences, setInheritedReferences] = useState<ReferenceMaterial[]>([]);
  const [trainingObjectives, setTrainingObjectives] = useState<Array<{
    id: string;
    objective_text: string;
    scope_level: string;
    display_order: number;
  }>>([]);

  // Reference materials state (for training events)
  const [referenceMaterials, setReferenceMaterials] = useState<ReferenceMaterial[]>(
    initialData?.referenceMaterials || []
  );

  // Image state
  const [images, setImages] = useState<(File | null)[]>([null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [dragOverStates, setDragOverStates] = useState<boolean[]>([false, false, false, false]);
  
  // UI state
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Helper function to convert UTC datetime to timezone-local datetime string for input
  const utcToTimezoneLocal = (utcDateString: string, timezone: string): string => {
    try {
      const utcDate = new Date(utcDateString);
      // Get the timezone offset at this specific date (handles DST)
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(utcDate);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      
      return `${year}-${month}-${day}T${hour}:${minute}`;
    } catch (error) {
      console.warn('Error converting UTC to timezone local:', error);
      return new Date(utcDateString).toISOString().slice(0, 16);
    }
  };

  // Helper function to convert timezone-local datetime string to UTC for storage
  const timezoneLocalToUtc = (localDateString: string, timezone: string): string => {
    try {
      // This is the most reliable approach: use the Intl.DateTimeFormat to find what UTC time
      // corresponds to the given local time in the specified timezone
      
      // Parse the input datetime
      const [datePart, timePart] = localDateString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // We need to find what UTC time, when converted to the target timezone, gives us our desired local time
      // Start with a guess (the local time interpreted as UTC)
      let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
      
      // Convert this guess to the target timezone and see what local time it produces
      const formatter = new Intl.DateTimeFormat('sv-SE', { 
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(guess);
      const resultYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const resultMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
      const resultDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
      const resultHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const resultMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      
      // Calculate the difference and adjust
      const targetTime = new Date(year, month - 1, day, hour, minute);
      const resultTime = new Date(resultYear, resultMonth - 1, resultDay, resultHour, resultMinute);
      const diff = targetTime.getTime() - resultTime.getTime();
      
      // Apply the correction
      const correctedUtc = new Date(guess.getTime() + diff);
      
      // console.log(`[TIMEZONE-DEBUG] Converting ${localDateString} in ${timezone} to UTC: ${correctedUtc.toISOString()}`);
      // console.log(`[TIMEZONE-DEBUG] Expected: 15:30 EDT -> 19:30 UTC, Got: ${correctedUtc.toISOString()}`);
      
      return correctedUtc.toISOString();
    } catch (error) {
      console.warn('Error converting timezone local to UTC:', error);
      return new Date(localDateString).toISOString();
    }
  };

  // Initialize datetime with default values based on settings
  useEffect(() => {
    if (!initialData?.datetime) {
      // The datetime-local input + timezone dropdown work together:
      // The input shows a time that is INTERPRETED as being in the selected timezone
      // So we just need to show "8:30 PM" and let the timezone dropdown indicate it's Eastern
      
      const targetDay = settings.eventDefaults.defaultStartDayOfWeek;
      const targetTime = settings.eventDefaults.defaultStartTime;
      const [hours, minutes] = targetTime.split(':').map(Number);
      
      // Get current date/time in the reference timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long'
      });
      
      const now = new Date();
      const parts = formatter.formatToParts(now);
      const currentYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const currentMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
      const currentDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
      const currentWeekday = parts.find(p => p.type === 'weekday')?.value || '';
      
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIndex = daysOfWeek.indexOf(targetDay);
      const currentDayIndex = daysOfWeek.indexOf(currentWeekday);
      
      let daysToAdd = targetDayIndex - currentDayIndex;
      if (daysToAdd <= 0) {
        daysToAdd += 7; // Next week
      }
      
      // Calculate the target date
      const tempDate = new Date(currentYear, currentMonth - 1, currentDay + daysToAdd);
      const finalYear = tempDate.getFullYear();
      const finalMonth = String(tempDate.getMonth() + 1).padStart(2, '0');
      const finalDay = String(tempDate.getDate()).padStart(2, '0');
      const hourStr = String(hours).padStart(2, '0');
      const minuteStr = String(minutes).padStart(2, '0');
      
      // Set the time directly - it will be interpreted as being in the selected timezone
      const datetimeValue = `${finalYear}-${finalMonth}-${finalDay}T${hourStr}:${minuteStr}`;
      setDatetime(datetimeValue);
    } else {
      // Convert UTC datetime from database to timezone-local for editing
      const timezoneLocalString = utcToTimezoneLocal(initialData.datetime, timezone);
      setDatetime(timezoneLocalString);
      
      // Also set end datetime if provided
      if (initialData.endDatetime) {
        const endTimezoneLocalString = utcToTimezoneLocal(initialData.endDatetime, timezone);
        setEndDatetime(endTimezoneLocalString);
      }
    }
  }, [initialData?.datetime, initialData?.endDatetime, settings.eventDefaults.defaultStartDayOfWeek, settings.eventDefaults.defaultStartTime, timezone]);

  // Update participants when selectedCycle changes
  useEffect(() => {
    if (!initialData?.participants && selectedCycle?.participants) {
      setParticipatingSquadrons(selectedCycle.participants);
    }
  }, [selectedCycle?.participants, initialData?.participants]);

  // Event Activities: read the developer feature flag once on mount
  useEffect(() => {
    let cancelled = false;
    getUserSettings().then(result => {
      if (!cancelled && result.success && result.data?.developer?.enableEventActivities) {
        setActivitiesEnabled(true);
      }
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setFlagChecked(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Event Activities: load persisted activities when editing (flag on only).
  // A legacy event with no activity rows surfaces its single syllabus mission as
  // one lesson activity so saving can't silently null events.syllabus_mission_id.
  useEffect(() => {
    if (!activitiesEnabled || !initialData?.id || activitiesLoaded) return;
    let cancelled = false;
    getEventActivities(initialData.id).then(({ activities, error }) => {
      if (cancelled) return;
      if (!error) {
        if (activities.length === 0 && initialData.syllabusMissionId) {
          // Legacy event: surface its single mission as one lesson activity and
          // seed it with the event-level support roles / reference materials so
          // the save-time aggregation reproduces them exactly
          setEventActivities([{
            kind: 'lesson',
            displayOrder: 0,
            syllabusMissionId: initialData.syllabusMissionId,
            settings: {
              supportRoleRequirements: initialData.eventSettings?.supportRoleRequirements || [],
              referenceMaterials: initialData.referenceMaterials || []
            }
          }]);
        } else {
          setEventActivities(activities);
        }
        setActivitiesLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [activitiesEnabled, initialData?.id, initialData?.syllabusMissionId, activitiesLoaded]);

  // Cycle Activities: load the cycle's blocked-out activities + event defaults
  useEffect(() => {
    if (!activitiesEnabled || !cycleId) {
      setCycleData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [cycleResult, { activities }] = await Promise.all([
        (supabase as any).from('cycles').select('start_date, settings').eq('id', cycleId).single(),
        getCycleActivities(cycleId)
      ]);
      if (!cancelled) {
        setCycleData({
          startDate: cycleResult.data?.start_date || undefined,
          settings: cycleResult.data?.settings || null,
          activities
        });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activitiesEnabled, cycleId]);

  // Cycle settings act as defaults for NEW events in the cycle (precedence:
  // event's own values > cycle settings > user settings). Applied once.
  useEffect(() => {
    if (!activitiesEnabled || initialData?.id || cycleDefaultsAppliedRef.current) return;
    const cycleSettings = cycleData?.settings;
    if (!cycleSettings) return;
    cycleDefaultsAppliedRef.current = true;

    if (cycleSettings.trackQualifications !== undefined) setTrackQualifications(cycleSettings.trackQualifications);
    if (cycleSettings.groupBySquadron !== undefined) setGroupBySquadron(cycleSettings.groupBySquadron);
    if (cycleSettings.showNoResponse !== undefined) setShowNoResponse(cycleSettings.showNoResponse);
    if (cycleSettings.allowTentativeResponse !== undefined) setAllowTentativeResponse(cycleSettings.allowTentativeResponse);
    if (cycleSettings.firstReminderEnabled !== undefined) setFirstReminderEnabled(cycleSettings.firstReminderEnabled);
    if (cycleSettings.firstReminderTime) {
      setFirstReminderValue(cycleSettings.firstReminderTime.value);
      setFirstReminderUnit(cycleSettings.firstReminderTime.unit);
    }
    if (cycleSettings.secondReminderEnabled !== undefined) setSecondReminderEnabled(cycleSettings.secondReminderEnabled);
    if (cycleSettings.secondReminderTime) {
      setSecondReminderValue(cycleSettings.secondReminderTime.value);
      setSecondReminderUnit(cycleSettings.secondReminderTime.unit);
    }
    if (cycleSettings.scheduledPublicationEnabled !== undefined) setScheduledPublicationEnabled(cycleSettings.scheduledPublicationEnabled);
    if (cycleSettings.scheduledPublicationOffset) setScheduledPublicationOffset(cycleSettings.scheduledPublicationOffset);
  }, [activitiesEnabled, cycleData, initialData?.id]);

  // Map a cycle activity to an event activity (shared by prefill and merge):
  // syllabus-kind picks the next unused lesson of its syllabus in this cycle
  const cycleActivityToEventActivity = async (
    cycleActivity: CycleActivity,
    displayOrder: number,
    usedMissionIds: Set<string | null>
  ): Promise<EventActivity> => {
    if (cycleActivity.kind === 'objectives') {
      return {
        kind: 'objectives',
        displayOrder,
        cycleActivityId: cycleActivity.id,
        label: cycleActivity.label,
        adHocObjectives: cycleActivity.adHocObjectives || [],
        settings: cycleActivity.settings || {}
      };
    }
    let missionId: string | undefined;
    if (cycleActivity.syllabusId) {
      // week_number is missing from the stale generated types - cast
      const { data: missions } = await (supabase as any)
        .from('training_syllabus_missions')
        .select('id, week_number, mission_number')
        .eq('syllabus_id', cycleActivity.syllabusId)
        .order('week_number');
      missionId = ((missions || []) as Array<{ id: string }>).find(m => !usedMissionIds.has(m.id))?.id;
    }
    return {
      kind: 'lesson',
      displayOrder,
      cycleActivityId: cycleActivity.id,
      syllabusMissionId: missionId,
      label: cycleActivity.label,
      settings: cycleActivity.settings || {}
    };
  };

  // Cycle Activities: prefill a NEW event's activities from the cycle
  // activities covering the event's week. Syllabus-kind activities pick the
  // next unused lesson of their syllabus within this cycle.
  useEffect(() => {
    if (!activitiesEnabled || activitiesPrefilledRef.current || initialData?.id) return;
    if (!cycleData || cycleData.activities.length === 0 || eventActivities.length > 0) return;
    if (!datetime || !cycleData.startDate || !cycleId) return;

    activitiesPrefilledRef.current = true;
    let cancelled = false;

    const prefill = async () => {
      // Event week within the cycle (week 1 = the cycle's first 7 days)
      const cycleStart = new Date(cycleData.startDate as string);
      const eventDate = new Date(datetime);
      const week = Math.max(1, Math.floor((eventDate.getTime() - cycleStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);

      const covering = cycleData.activities.filter(a => a.startWeek <= week && week <= a.endWeek);
      if (covering.length === 0) return;

      // Missions already used by events in this cycle (for next-lesson picking)
      const { data: cycleEvents } = await supabase
        .from('events')
        .select('syllabus_mission_id')
        .eq('cycle_id', cycleId)
        .not('syllabus_mission_id', 'is', null);
      const usedMissionIds = new Set((cycleEvents || []).map(e => e.syllabus_mission_id));

      const prefilled: EventActivity[] = [];
      for (const cycleActivity of covering) {
        prefilled.push(await cycleActivityToEventActivity(cycleActivity, prefilled.length, usedMissionIds));
      }

      if (!cancelled && prefilled.length > 0) {
        setEventActivities(prefilled);
      }
    };
    prefill();
    return () => { cancelled = true; };
  }, [activitiesEnabled, cycleData, eventActivities.length, initialData?.id, datetime, cycleId]);

  // Cycle Activities: when EDITING an event, merge in any cycle activities that
  // cover its week but aren't represented yet (added to the cycle after this
  // event was created). Linked via cycleActivityId, so nothing duplicates.
  const cycleMergeAppliedRef = useRef(false);
  useEffect(() => {
    if (!activitiesEnabled || !initialData?.id || !activitiesLoaded || cycleMergeAppliedRef.current) return;
    if (!cycleData || cycleData.activities.length === 0 || !cycleData.startDate || !cycleId) return;
    if (!initialData.datetime) return;

    cycleMergeAppliedRef.current = true;
    let cancelled = false;

    const merge = async () => {
      const cycleStart = new Date(cycleData.startDate as string);
      const eventDate = new Date(initialData.datetime);
      const week = Math.max(1, Math.floor((eventDate.getTime() - cycleStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);

      const representedCycleActivityIds = new Set(eventActivities.map(a => a.cycleActivityId).filter(Boolean));
      const missing = cycleData.activities.filter(a =>
        a.id && a.startWeek <= week && week <= a.endWeek && !representedCycleActivityIds.has(a.id)
      );
      if (missing.length === 0) return;

      const { data: cycleEvents } = await supabase
        .from('events')
        .select('syllabus_mission_id')
        .eq('cycle_id', cycleId)
        .not('syllabus_mission_id', 'is', null);
      const usedMissionIds = new Set((cycleEvents || []).map(e => e.syllabus_mission_id));

      const appended: EventActivity[] = [];
      for (const cycleActivity of missing) {
        appended.push(await cycleActivityToEventActivity(cycleActivity, eventActivities.length + appended.length, usedMissionIds));
      }

      if (!cancelled && appended.length > 0) {
        setEventActivities(prev => [...prev, ...appended]);
      }
    };
    merge();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesEnabled, activitiesLoaded, cycleData, initialData?.id, cycleId]);

  // Event Activities: prefill one lesson activity for new Training-cycle events
  // using the auto-selected next mission (legacy behavior; skipped when the
  // cycle defines activities - the cycle-driven prefill above handles those)
  useEffect(() => {
    if (!activitiesEnabled || activitiesPrefilledRef.current || initialData?.id) return;
    if (!selectedMissionId || eventActivities.length > 0) return;
    if (cycleId && (!cycleData || cycleData.activities.length > 0)) return; // wait for / defer to cycle activities
    activitiesPrefilledRef.current = true;
    setEventActivities([{ kind: 'lesson', displayOrder: 0, syllabusMissionId: selectedMissionId }]);
  }, [activitiesEnabled, selectedMissionId, eventActivities.length, initialData?.id, cycleId, cycleData]);

  // Event Activities: keep the legacy selectedMissionId in sync with the first
  // lesson activity so inherited reference materials keep working (flag on only)
  useEffect(() => {
    if (!activitiesEnabled) return;
    if (initialData?.id && !activitiesLoaded) return; // don't clobber while loading
    const firstLesson = eventActivities.find(a => a.kind === 'lesson' && a.syllabusMissionId);
    const target = firstLesson?.syllabusMissionId || '';
    setSelectedMissionId(prev => (prev === target ? prev : target));
  }, [activitiesEnabled, activitiesLoaded, eventActivities, initialData?.id]);

  // Load syllabus missions when cycle has a syllabus
  useEffect(() => {
    const currentEventCycle = selectedCycle || (cycleId ? cycles?.find(c => c.id === cycleId) : null);

    if (currentEventCycle && 'syllabusId' in currentEventCycle && currentEventCycle.syllabusId && currentEventCycle.type === 'Training') {
      const loadMissions = async () => {
        const { data, error } = await supabase
          .from('training_syllabus_missions')
          .select('*')
          .eq('syllabus_id', currentEventCycle.syllabusId ?? '')
          .order('mission_number') as any;

        if (!error && data) {
          setSyllabusMissions(data);

          // Auto-select next mission for new events (not editing)
          if (!initialData?.id && currentEventCycle.id) {
            // Find the highest mission number already used in this cycle
            const { data: cycleEvents } = await supabase
              .from('events')
              .select('syllabus_mission_id')
              .eq('cycle_id', currentEventCycle.id)
              .not('syllabus_mission_id', 'is', null);

            if (cycleEvents && data.length > 0) {
              // Get mission numbers for all used missions
              const usedMissionIds = new Set(cycleEvents.map(e => e.syllabus_mission_id));

              // Find the first unused mission
              const nextMission = data.find((m: any) => !usedMissionIds.has(m.id));

              if (nextMission) {
                setSelectedMissionId(nextMission.id);
              }
            } else if (data.length > 0) {
              // No events yet, select first mission
              setSelectedMissionId(data[0].id);
            }
          }
        }
      };
      loadMissions();
    } else {
      setSyllabusMissions([]);
      setSelectedMissionId('');
    }
  }, [selectedCycle?.syllabusId, selectedCycle?.type, selectedCycle?.id, initialData?.id, cycleId, cycles]);

  // Load inherited references when mission is selected
  useEffect(() => {
    const currentEventCycle = selectedCycle || (cycleId ? cycles?.find(c => c.id === cycleId) : null);

    if (selectedMissionId && currentEventCycle && 'syllabusId' in currentEventCycle && currentEventCycle.syllabusId) {
      const loadInheritedRefs = async () => {
        const { data, error} = await supabase
          .from('training_syllabus_missions')
          .select('reference_materials, training_syllabi(reference_materials)')
          .eq('id', selectedMissionId)
          .single();

        if (!error && data) {
          const syllabusRefs = (data.training_syllabi as any)?.reference_materials || [];
          const missionRefs = Array.isArray(data.reference_materials) ? data.reference_materials : [];

          // Merge and deduplicate by URL
          const merged = [...syllabusRefs, ...missionRefs];
          const unique = merged.filter((ref, index, self) =>
            index === self.findIndex((r) => r.url === ref.url)
          );

          setInheritedReferences(unique);
        }
      };
      loadInheritedRefs();
    } else {
      setInheritedReferences([]);
    }
  }, [selectedMissionId, selectedCycle?.syllabusId, cycleId, cycles]);

  // Load training objectives when mission is selected
  useEffect(() => {
    if (selectedMissionId) {
      const loadObjectives = async () => {
        const { data, error } = await supabase
          .from('syllabus_training_objectives')
          .select('id, objective_text, scope_level, display_order')
          .eq('syllabus_mission_id', selectedMissionId)
          .order('display_order');

        if (!error && data) {
          setTrainingObjectives(data as any);
        }
      };
      loadObjectives();
    } else {
      setTrainingObjectives([]);
    }
  }, [selectedMissionId]);

  // Initialize and sync scheduled publication datetime when event datetime changes
  useEffect(() => {
    if (datetime && scheduledPublicationEnabled) {
      // If offset is set but datetime isn't, or if event datetime changed, recalculate
      const calculatedDatetime = offsetToDatetime(scheduledPublicationOffset, datetime, timezone);
      if (calculatedDatetime && calculatedDatetime !== scheduledPublicationDatetime) {
        setScheduledPublicationDatetime(calculatedDatetime);
      }
    }
  }, [datetime, timezone, scheduledPublicationEnabled, scheduledPublicationOffset]);

  // Load existing images when editing
  useEffect(() => {
    if (initialData) {
      // console.log('[EDIT-DIALOG-DEBUG] Loading initial data:', {
      //   headerImageUrl: initialData.headerImageUrl,
      //   additionalImageUrls: initialData.additionalImageUrls,
      //   imageUrl: initialData.imageUrl
      // });
      
      const newPreviews: (string | null)[] = [null, null, null, null];
      
      // Load header image from legacy imageUrl or new headerImageUrl as first image
      const headerUrl = initialData.headerImageUrl || initialData.imageUrl;
      if (headerUrl) {
        newPreviews[0] = headerUrl;
      }

      // Load additional images into remaining slots
      if (initialData.additionalImageUrls) {
        initialData.additionalImageUrls.forEach((url, index) => {
          if (url && index < 3) {
            newPreviews[index + 1] = url;
          }
        });
      }
      
      // console.log('[EDIT-DIALOG-DEBUG] Final image previews:', newPreviews);
      setImagePreviews(newPreviews);
    }
  }, [initialData]);

  // Image handling functions
  const handleImageSelect = (file: File, imageIndex: number) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        
        const newImages = [...images];
        const newPreviews = [...imagePreviews];
        newImages[imageIndex] = file;
        newPreviews[imageIndex] = result;
        setImages(newImages);
        setImagePreviews(newPreviews);
      };
      reader.readAsDataURL(file);
      setError('');
    } else {
      setError('Please select a valid image file');
    }
  };

  const handleDragOver = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = true;
    setDragOverStates(newStates);
  };

  const handleDragLeave = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = false;
    setDragOverStates(newStates);
  };

  const handleDrop = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = false;
    setDragOverStates(newStates);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleImageSelect(files[0], imageIndex);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, imageIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file, imageIndex);
    }
  };

  const removeImage = (imageIndex: number) => {
    const newImages = [...images];
    const newPreviews = [...imagePreviews];
    newImages[imageIndex] = null;
    newPreviews[imageIndex] = null;
    setImages(newImages);
    setImagePreviews(newPreviews);
  };
  
  useEffect(() => {
    if (initialData?.datetime && initialData?.endDatetime) {
      // Calculate duration from UTC times directly (this is timezone-independent)
      const start = new Date(initialData.datetime);
      const end = new Date(initialData.endDatetime);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const durationMs = end.getTime() - start.getTime();
        const totalMinutes = Math.round(durationMs / (1000 * 60));
        
        // console.log(`[DURATION-DEBUG] Calculating duration from UTC times: ${initialData.datetime} to ${initialData.endDatetime}`);
        // console.log(`[DURATION-DEBUG] Duration: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`);
        
        setDurationHours(Math.floor(totalMinutes / 60));
        setDurationMinutes(totalMinutes % 60);
      }
    }
  }, [initialData]);

  // Load scheduled publication data when editing an event
  useEffect(() => {
    const loadScheduledPublication = async () => {
      if (!initialData?.id) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('scheduled_event_publications')
          .select('scheduled_time')
          .eq('event_id', initialData.id)
          .eq('sent', false)
          .single();

        if (data && !error) {
          setScheduledPublicationEnabled(true);
          // Convert UTC scheduled time to local timezone for the input field
          const localTime = utcToTimezoneLocal(data.scheduled_time, timezone);
          setScheduledPublicationDatetime(localTime);

          // Calculate offset from scheduled time and event start time
          if (datetime) {
            const offset = datetimeToOffset(localTime, datetime, timezone);
            setScheduledPublicationOffset(offset);
          }
        }
      } catch (error) {
        console.error('Failed to load scheduled publication:', error);
      }
    };

    loadScheduledPublication();
  }, [initialData?.id, timezone, datetime]);

  useEffect(() => {
    if (datetime) {
      // The datetime is in local format for the input field (e.g., "2024-08-24T15:30")
      // We need to calculate the end time in the same local format, then both will be 
      // converted to UTC together, preserving the duration
      
      // Parse the datetime string directly (don't use Date constructor which assumes local timezone)
      const [datePart, timePart] = datetime.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // Add duration to get end time
      const totalMinutes = hour * 60 + minute + durationHours * 60 + durationMinutes;
      const endHour = Math.floor(totalMinutes / 60) % 24;
      const endMinute = totalMinutes % 60;
      
      // Handle day rollover
      let endDay = day;
      if (totalMinutes >= 24 * 60) {
        endDay += Math.floor(totalMinutes / (24 * 60));
      }
      
      // Format end time in the same local format
      const formattedEndDate = `${year}-${month.toString().padStart(2, '0')}-${endDay.toString().padStart(2, '0')}T${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      // console.log(`[END-TIME-DEBUG] Calculated end time: start=${datetime}, duration=${durationHours}h${durationMinutes}m, end=${formattedEndDate}`);
      setEndDatetime(formattedEndDate);
    }
  }, [datetime, durationHours, durationMinutes]);

  // Fetch Discord roles when squadrons are available
  useEffect(() => {
    const fetchRoles = async () => {
      // Get the guild ID from the first squadron with Discord integration
      let guildId: string | null = null;
      
      if (squadrons && squadrons.length > 0) {
        for (const squadron of squadrons) {
          const squadronData = squadron as any;
          const discordIntegration = squadronData.discord_integration;
          if (discordIntegration && discordIntegration.selectedGuildId) {
            guildId = discordIntegration.selectedGuildId;
            break;
          }
        }
      }
      
      if (!guildId) {
        setAvailableDiscordRoles([]);
        return;
      }
      
      setLoadingRoles(true);
      try {
        const result = await fetchDiscordGuildRoles(guildId);
        if (!result.error && result.roles) {
          // Filter to only mentionable roles
          const mentionableRoles = result.roles
            .filter(role => role.mentionable && role.name !== '@everyone')
            .map(role => ({ id: role.id, name: role.name, mentionable: role.mentionable }));
          setAvailableDiscordRoles(mentionableRoles);
        }
      } catch (error) {
        console.error('Error fetching Discord roles:', error);
      } finally {
        setLoadingRoles(false);
      }
    };
    
    fetchRoles();
  }, [squadrons]);

  // Load default notification roles from squadron settings when creating a new event
  // Only run once on mount, not when roles change
  useEffect(() => {
    // Only load defaults if this is a new event (no initialData) and we haven't loaded defaults yet
    if (initialData) {
      return;
    }
    
    if (hasLoadedDefaultsRef.current) {
      return;
    }

    // Find the squadron's default notification roles - use the first squadron with defaults
    if (squadrons && squadrons.length > 0) {
      for (const squadron of squadrons) {
        const squadronData = squadron as any;
        const discordIntegration = squadronData.discord_integration;
        if (discordIntegration?.defaultNotificationRoles && Array.isArray(discordIntegration.defaultNotificationRoles) && discordIntegration.defaultNotificationRoles.length > 0) {
          setSelectedNotificationRoles(discordIntegration.defaultNotificationRoles);
          hasLoadedDefaultsRef.current = true;
          break;
        }
      }
    }
  }, [initialData, squadrons]);

  const handleDatetimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDatetime(e.target.value);
  };

  const handleDurationHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setDurationHours(isNaN(value) || value < 0 ? 0 : value);
  };

  const handleDurationMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const clamped = isNaN(value) ? 0 : Math.min(59, Math.max(0, value));
    setDurationMinutes(clamped);
  };

  // Determine if this event is a training event based on its cycle type
  // Check selectedCycle first (for new events or when cycle is already selected)
  // Otherwise, look up the event's cycle from the cycles array (for editing events from All Events view)
  const eventCycle = selectedCycle || (cycleId ? cycles?.find(c => c.id === cycleId) : null);
  const isTrainingEvent = eventCycle?.type === 'Training';

  // Workflow navigation and validation. With the Event Activities flag on, the
  // training step becomes an "Activities" step, is available on all events, and
  // replaces the Mission step (support roles are per-activity; the remaining
  // AAR option moves to Options); Participants becomes "Options" (participants
  // are per-activity, the tab keeps event-wide squadron routing and options).
  const steps: Array<{ key: WorkflowStep; title: string; description: string }> = activitiesEnabled
    ? [
        { key: 'details', title: 'Event Details', description: 'Basic event information' },
        { key: 'training', title: 'Activities', description: 'Event activities' },
        { key: 'participants', title: 'Options', description: 'Event-wide options' },
        { key: 'reminders', title: 'Reminders', description: 'Notification settings' },
        { key: 'publish', title: 'Publish', description: 'Publication settings' }
      ]
    : isTrainingEvent
    ? [
        { key: 'details', title: 'Event Details', description: 'Basic event information' },
        { key: 'mission', title: 'Mission', description: 'Mission requirements' },
        { key: 'training', title: 'Training', description: 'Mission and objectives' },
        { key: 'participants', title: 'Participants', description: 'Who can participate' },
        { key: 'reminders', title: 'Reminders', description: 'Notification settings' },
        { key: 'publish', title: 'Publish', description: 'Publication settings' }
      ]
    : [
        { key: 'details', title: 'Event Details', description: 'Basic event information' },
        { key: 'mission', title: 'Mission', description: 'Mission requirements' },
        { key: 'participants', title: 'Participants', description: 'Who can participate' },
        { key: 'reminders', title: 'Reminders', description: 'Notification settings' },
        { key: 'publish', title: 'Publish', description: 'Publication settings' }
      ];

  // Jump to the step that holds the requested section. Re-resolved once the activities flag
  // loads (it changes which step holds activities/support roles) until the user navigates.
  useEffect(() => {
    if (!initialSection || sectionResolved || !flagChecked || userNavigatedRef.current) return;
    const stepFor: Record<EventDialogSection, WorkflowStep> = {
      details: 'details',
      activities: activitiesEnabled || isTrainingEvent ? 'training' : 'details',
      references: activitiesEnabled || isTrainingEvent ? 'training' : 'details',
      support: activitiesEnabled ? 'training' : 'mission',
      options: 'participants',
      notifications: 'reminders',
      publish: 'publish',
    };
    setCurrentStep(stepFor[initialSection]);
    setSectionResolved(true);
  }, [initialSection, sectionResolved, flagChecked, activitiesEnabled, isTrainingEvent]);

  // Deep-linking into activity content while editing: also wait for the saved activities
  const activitiesPending = Boolean(
    initialSection && ['activities', 'support', 'references'].includes(initialSection) &&
    activitiesEnabled && initialData?.id && !activitiesLoaded
  );
  // Safety net so a failed load can never keep the dialog hidden
  const [readyTimedOut, setReadyTimedOut] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReadyTimedOut(true), 2000);
    return () => window.clearTimeout(t);
  }, []);
  const dialogReady = readyTimedOut || (flagChecked && sectionResolved && !activitiesPending);

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const validateStep = (step: WorkflowStep): { isValid: boolean; errorMessage?: string } => {
    switch (step) {
      case 'details':
        if (!title.trim()) {
          return { isValid: false, errorMessage: 'Please enter an event title' };
        }
        if (!datetime) {
          return { isValid: false, errorMessage: 'Please select a start date and time' };
        }
        if (durationHours === 0 && durationMinutes === 0) {
          return { isValid: false, errorMessage: 'Please specify an event duration' };
        }
        const start = new Date(datetime);
        const end = new Date(endDatetime);
        if (end <= start) {
          return { isValid: false, errorMessage: 'End time must be after start time' };
        }
        return { isValid: true };

      case 'training':
        // Legacy training step has no required fields. With the Event Activities
        // flag on, every activity must satisfy its kind's payload requirement
        // (mirrors the event_activities CHECK constraint).
        if (activitiesEnabled) {
          for (const activity of eventActivities) {
            if (activity.kind === 'lesson' && !activity.syllabusMissionId) {
              return { isValid: false, errorMessage: 'Each training activity needs a lesson selected' };
            }
            if (activity.kind === 'objectives') {
              const objectives = activity.adHocObjectives || [];
              if (objectives.length === 0) {
                return { isValid: false, errorMessage: 'Each Other Training Exercise activity needs at least one objective' };
              }
              if (objectives.some(o => !o.text.trim())) {
                return { isValid: false, errorMessage: 'Training objectives cannot be empty' };
              }
            }
            if (activity.kind === 'qualification' && !activity.qualificationId) {
              return { isValid: false, errorMessage: 'Each Advanced Qualifications activity needs a qualification selected' };
            }
          }
        }
        return { isValid: true };

      case 'mission':
        // No specific validation required for mission step
        return { isValid: true };

      case 'participants':
        // No specific validation required for participants step
        return { isValid: true };
        
      case 'reminders':
        // Validate that reminders are chronologically ordered
        if (firstReminderEnabled && secondReminderEnabled) {
          // Convert both reminders to milliseconds for comparison
          const firstReminderMs = reminderTimeToMilliseconds(firstReminderValue, firstReminderUnit);
          const secondReminderMs = reminderTimeToMilliseconds(secondReminderValue, secondReminderUnit);

          console.log('[REMINDER-VALIDATION] First reminder:', firstReminderValue, firstReminderUnit, '=', firstReminderMs, 'ms');
          console.log('[REMINDER-VALIDATION] Second reminder:', secondReminderValue, secondReminderUnit, '=', secondReminderMs, 'ms');
          console.log('[REMINDER-VALIDATION] Checking if first (', firstReminderMs, ') <= second (', secondReminderMs, ')');

          // First reminder should be FURTHER from event (larger value) than second reminder
          // Example: First = 3 days (259200000ms), Second = 15 minutes (900000ms) is CORRECT
          // Example: First = 15 minutes (900000ms), Second = 3 days (259200000ms) is WRONG
          if (firstReminderMs <= secondReminderMs) {
            console.log('[REMINDER-VALIDATION] VALIDATION FAILED - First reminder must be further from event than second reminder');
            return { isValid: false, errorMessage: 'First reminder must be scheduled before (further from event) the second reminder' };
          }
          console.log('[REMINDER-VALIDATION] Validation passed');
        }
        return { isValid: true };

      case 'publish':
        // Validate scheduled publication if enabled
        if (scheduledPublicationEnabled) {
          if (!scheduledPublicationDatetime) {
            return { isValid: false, errorMessage: 'Please specify a publication time' };
          }

          // Convert both to UTC for comparison
          const pubTimeUtc = timezoneLocalToUtc(scheduledPublicationDatetime, timezone);
          const eventTimeUtc = timezoneLocalToUtc(datetime, timezone);
          const nowUtc = new Date().toISOString();

          // Check if publication time is in the past
          if (pubTimeUtc < nowUtc) {
            return { isValid: false, errorMessage: 'Publication time must be in the future' };
          }

          // Check if publication time is after event start
          if (pubTimeUtc >= eventTimeUtc) {
            return { isValid: false, errorMessage: 'Publication time must be before event start time' };
          }
        }
        return { isValid: true };

      default:
        return { isValid: true };
    }
  };

  const validateCurrentStep = (): boolean => {
    setError('');
    const validation = validateStep(currentStep);
    if (!validation.isValid && validation.errorMessage) {
      setError(validation.errorMessage);
    }
    return validation.isValid;
  };

  const handleNextStep = () => {
    userNavigatedRef.current = true;
    if (validateCurrentStep()) {
      const newCompleted = new Set(completedSteps);
      newCompleted.add(currentStep);
      setCompletedSteps(newCompleted);
      
      if (!isLastStep) {
        setCurrentStep(steps[currentStepIndex + 1].key);
      }
    }
  };

  const handlePreviousStep = () => {
    userNavigatedRef.current = true;
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1].key);
    }
  };

  const handleStepClick = (stepKey: WorkflowStep) => {
    userNavigatedRef.current = true;
    // Allow clicking on previous steps or current step
    const stepIndex = steps.findIndex(step => step.key === stepKey);
    // Editing an existing event: every step already holds valid data, so allow jumping anywhere
    if (initialData || stepIndex <= currentStepIndex || completedSteps.has(stepKey)) {
      setCurrentStep(stepKey);
    }
  };

  const handleAddNotificationRole = () => {
    if (!selectedRoleId) return;
    
    const role = availableDiscordRoles.find(r => r.id === selectedRoleId);
    if (!role) return;
    
    // Check if role is already added
    if (selectedNotificationRoles.some(r => r.id === role.id)) {
      setError('This role has already been added');
      setTimeout(() => setError(''), 3000);
      return;
    }
    
    setSelectedNotificationRoles([...selectedNotificationRoles, { id: role.id, name: role.name }]);
    setSelectedRoleId('');
  };

  const handleRemoveNotificationRole = (roleId: string) => {
    setSelectedNotificationRoles(selectedNotificationRoles.filter(r => r.id !== roleId));
  };

  // Helper functions for scheduled publication datetime/offset conversion
  const offsetToDatetime = (
    offset: { value: number; unit: 'minutes' | 'hours' | 'days' },
    eventStartTime: string,
    tz: string
  ): string => {
    if (!eventStartTime) return '';

    try {
      // Parse event start time in the specified timezone
      const eventUtc = timezoneLocalToUtc(eventStartTime, tz);
      const eventDate = new Date(eventUtc);

      // Calculate offset in milliseconds
      let offsetMs = 0;
      switch (offset.unit) {
        case 'days':
          offsetMs = offset.value * 24 * 60 * 60 * 1000;
          break;
        case 'hours':
          offsetMs = offset.value * 60 * 60 * 1000;
          break;
        case 'minutes':
          offsetMs = offset.value * 60 * 1000;
          break;
      }

      // Subtract offset from event time (publication is BEFORE event)
      const pubDateUtc = new Date(eventDate.getTime() - offsetMs);

      // Convert back to timezone-local for display
      return utcToTimezoneLocal(pubDateUtc.toISOString(), tz);
    } catch (error) {
      console.warn('Error converting offset to datetime:', error);
      return '';
    }
  };

  const datetimeToOffset = (
    publicationTime: string,
    eventStartTime: string,
    tz: string
  ): { value: number; unit: 'minutes' | 'hours' | 'days' } => {
    if (!publicationTime || !eventStartTime) {
      return { value: 3, unit: 'days' };
    }

    try {
      // Convert both to UTC for accurate comparison
      const pubUtc = timezoneLocalToUtc(publicationTime, tz);
      const eventUtc = timezoneLocalToUtc(eventStartTime, tz);

      const pubDate = new Date(pubUtc);
      const eventDate = new Date(eventUtc);

      // Calculate difference in milliseconds
      const diffMs = eventDate.getTime() - pubDate.getTime();
      const diffMinutes = Math.round(diffMs / (60 * 1000));

      // Choose best unit representation
      if (diffMinutes % (24 * 60) === 0) {
        return { value: diffMinutes / (24 * 60), unit: 'days' };
      } else if (diffMinutes % 60 === 0) {
        return { value: diffMinutes / 60, unit: 'hours' };
      } else {
        return { value: diffMinutes, unit: 'minutes' };
      }
    } catch (error) {
      console.warn('Error converting datetime to offset:', error);
      return { value: 3, unit: 'days' };
    }
  };

  // Handler for scheduled publication datetime change (updates offset)
  const handleScheduledPublicationDatetimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDatetime = e.target.value;
    setScheduledPublicationDatetime(newDatetime);

    // Update offset based on new datetime
    if (newDatetime && datetime) {
      const newOffset = datetimeToOffset(newDatetime, datetime, timezone);
      setScheduledPublicationOffset(newOffset);
    }
  };

  // Handler for scheduled publication offset change (updates datetime)
  const handleScheduledPublicationOffsetChange = (field: 'value' | 'unit', value: number | string) => {
    const newOffset = {
      ...scheduledPublicationOffset,
      [field]: field === 'value' ? Math.max(1, parseInt(value as string) || 1) : value
    };
    setScheduledPublicationOffset(newOffset);

    // Update datetime based on new offset
    if (datetime) {
      const newDatetime = offsetToDatetime(newOffset, datetime, timezone);
      setScheduledPublicationDatetime(newDatetime);
    }
  };

  // Event Activities: aggregate per-activity values up to the legacy event-level
  // fields so the Discord bot and flag-off views keep working unchanged.
  // Required counts are summed per qualification - concurrent activities each
  // need their own support pilots.
  const aggregateActivitySupportRoles = (): SupportRoleRequirement[] => {
    const byQualification = new Map<string, SupportRoleRequirement>();
    eventActivities.forEach(activity => {
      (activity.settings?.supportRoleRequirements || []).forEach(req => {
        const existing = byQualification.get(req.qualificationId);
        if (existing) {
          existing.required += req.required;
        } else {
          byQualification.set(req.qualificationId, { ...req });
        }
      });
    });
    return Array.from(byQualification.values());
  };

  const aggregateActivityReferenceMaterials = (): ReferenceMaterial[] => {
    const merged: ReferenceMaterial[] = [];
    eventActivities.forEach(activity => {
      (activity.settings?.referenceMaterials || []).forEach(ref => {
        if (!merged.some(existing => existing.url === ref.url)) {
          merged.push(ref);
        }
      });
    });
    return merged;
  };

  // Derive participating squadrons from a set of activities' participant
  // criteria. Squadron rules contribute their squadrons; a completed block with
  // no squadron rule matches pilots of any squadron, so it implies all
  // squadrons. Returns undefined when no activity in the set has criteria.
  const deriveSquadronsFromCriteria = (activitiesSubset: EventActivity[]): string[] | undefined => {
    let anyCriteria = false;
    let matchesAllSquadrons = false;
    const squadronIds = new Set<string>();

    activitiesSubset.forEach(activity => {
      (activity.settings?.participantCriteria || []).forEach(block => {
        const completedCriteria = block.criteria.filter(c => c.value || (c.values && c.values.length > 0));
        if (completedCriteria.length === 0) return; // ignore incomplete blocks
        anyCriteria = true;
        const squadronRules = completedCriteria.filter(c => c.type === 'squadron');
        if (squadronRules.length === 0) {
          matchesAllSquadrons = true;
        } else {
          squadronRules.forEach(rule => {
            (rule.values ?? (rule.value ? [rule.value] : [])).forEach(id => squadronIds.add(id));
          });
        }
      });
    });

    if (!anyCriteria) return undefined;
    if (matchesAllSquadrons) return (squadrons || []).map(s => s.id);
    return Array.from(squadronIds);
  };

  // events.participants (squadron routing for Discord publish / Mission Prep):
  // undefined keeps the legacy behavior (existing selection / cycle inheritance)
  const deriveParticipantsFromActivities = (): string[] | undefined =>
    deriveSquadronsFromCriteria(eventActivities);

  // AAR requirement: any activity opting in makes the event require AARs, and
  // the AAR section in Mission Debriefing filters to those activities'
  // squadrons (an AAR activity without criteria means all squadrons)
  const deriveAarFromActivities = (): { aarRequired: boolean; aarSquadronIds: string[] } => {
    const aarActivities = eventActivities.filter(a => a.settings?.requiresAar);
    if (aarActivities.length === 0) return { aarRequired: false, aarSquadronIds: [] };
    const squadronIds = deriveSquadronsFromCriteria(aarActivities);
    return { aarRequired: true, aarSquadronIds: squadronIds ?? [] }; // [] = all squadrons
  };

  const handleSubmit = async (shouldPublish: boolean = false) => {
    if (isSubmitting) return; // Prevent multiple submissions
    
    console.log('[SUBMIT-DEBUG] Starting validation...');
    console.log('[SUBMIT-DEBUG] First reminder enabled:', firstReminderEnabled, 'value:', firstReminderValue, 'unit:', firstReminderUnit);
    console.log('[SUBMIT-DEBUG] Second reminder enabled:', secondReminderEnabled, 'value:', secondReminderValue, 'unit:', secondReminderUnit);
    
    // Validate ALL steps before submission
    const stepsToValidate: WorkflowStep[] = ['details', 'mission', 'training', 'participants', 'reminders', 'publish'];
    for (const step of stepsToValidate) {
      console.log('[SUBMIT-DEBUG] Validating step:', step);
      const validation = validateStep(step);
      console.log('[SUBMIT-DEBUG] Step', step, 'validation result:', validation);
      if (!validation.isValid) {
        // Navigate to the step that failed validation and show error
        setCurrentStep(step);
        if (validation.errorMessage) {
          setError(validation.errorMessage);
        }
        return;
      }
    }
    
    console.log('[SUBMIT-DEBUG] All validations passed, proceeding with save...');
    setIsSubmitting(true);
    setError('');

    try {
      // Convert datetime to UTC for storage
      const utcDatetime = timezoneLocalToUtc(datetime, timezone);
      const utcEndDatetime = endDatetime ? timezoneLocalToUtc(endDatetime, timezone) : undefined;
      
      // Create combined image data: new files OR existing URLs, but not null
      const getImageForSubmission = (index: number) => {
        // If there's a new file, use it
        if (images[index]) return images[index];
        // Otherwise, if there's a preview URL and it's not a data URL (existing image), use it
        if (imagePreviews[index] && !imagePreviews[index]?.startsWith('data:')) {
          return imagePreviews[index];
        }
        return null;
      };
      
      const headerImageForSubmit = getImageForSubmission(0);
      const additionalImagesForSubmit = [1, 2, 3]
        .map(index => getImageForSubmission(index))
        .filter(img => img !== null);
      
      // console.log('[SUBMIT-IMAGE-DEBUG] Header image type:', typeof headerImageForSubmit, !!headerImageForSubmit);
      // console.log('[SUBMIT-IMAGE-DEBUG] Additional images:', additionalImagesForSubmit.map(img => typeof img));

      // console.log('[EVENT-DIALOG-DEBUG] About to save event with participants:', participants);
      // console.log('[EVENT-DIALOG-DEBUG] Participants length:', participants.length);
      // console.log('[EVENT-DIALOG-DEBUG] Selected cycle participants:', selectedCycle?.participants);
      console.log('[EVENT-DIALOG-SAVE] allowTentativeResponse state value:', allowTentativeResponse);

      // Per-activity values drive the event-level fields only when activities
      // exist; an activity-less event keeps legacy behavior even with flag on
      const useActivityAggregates = activitiesEnabled
        && (!initialData?.id || activitiesLoaded)
        && eventActivities.length > 0;

      await onSave({
        title: title.trim(),
        description: description.trim(),
        datetime: utcDatetime,
        endDatetime: utcEndDatetime,
        duration: {
          hours: durationHours,
          minutes: durationMinutes
        },
        participants: useActivityAggregates
          ? (deriveParticipantsFromActivities() ?? (participants.length > 0 ? participants : undefined))
          : (participants.length > 0 ? participants : undefined),
        headerImage: headerImageForSubmit as File | string | null,
        additionalImages: additionalImagesForSubmit as (File | string)[],
        trackQualifications,
        groupBySquadron,
        showNoResponse,
        allowTentativeResponse,
        aarOperationalOnly,
        supportRoleRequirements: useActivityAggregates ? aggregateActivitySupportRoles() : supportRoleRequirements,
        timezone,
        reminders: {
          firstReminder: {
            enabled: firstReminderEnabled,
            value: firstReminderValue,
            unit: firstReminderUnit,
            recipients: {
              accepted: firstReminderAccepted,
              tentative: firstReminderTentative,
              declined: firstReminderDeclined,
              noResponse: firstReminderNoResponse
            }
          },
          secondReminder: {
            enabled: secondReminderEnabled,
            value: secondReminderValue,
            unit: secondReminderUnit,
            recipients: {
              accepted: secondReminderAccepted,
              tentative: secondReminderTentative,
              declined: secondReminderDeclined,
              noResponse: secondReminderNoResponse
            }
          },
          initialNotificationRoles: selectedNotificationRoles
        },
        scheduledPublication: scheduledPublicationEnabled ? {
          enabled: true,
          scheduledTime: timezoneLocalToUtc(scheduledPublicationDatetime, timezone)
        } : {
          enabled: false
        },
        // Training workflow fields (Phase 2-3)
        // Always pass an array, even if empty, to allow deletion
        referenceMaterials: useActivityAggregates ? aggregateActivityReferenceMaterials() : referenceMaterials,
        syllabusMissionId: selectedMissionId || undefined,
        // Event activities (developer-flagged): omit entirely when flag is off,
        // or while editing before the persisted activities finished loading
        ...(activitiesEnabled && (!initialData?.id || activitiesLoaded)
          ? { activities: eventActivities }
          : {}),
        // Per-activity AAR flags roll up to event_settings for Mission Debriefing
        ...(useActivityAggregates ? deriveAarFromActivities() : {}),
        cycleId,
        // Only include if part of a cycle
        includeInAttendanceReport: cycleId ? includeInAttendanceReport : undefined
      } as any, shouldPublish);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred while saving the event');
    } finally {
      setIsSubmitting(false);
    }
  };


  // ---------------------------------------------------------------- view
  // End time readout: datetime is a naive local string in the event's time zone
  const endReadout = (() => {
    if (!datetime) return null;
    const m = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    d.setMinutes(d.getMinutes() + durationHours * 60 + durationMinutes);
    const sameDay = d.getDate() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1;
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  })();

  const startReadout = (() => {
    const m = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  })();
  const tzLabel = TZ_OPTIONS.find(t => t.value === timezone)?.label || timezone.replace(/_/g, ' ');
  const isPublishedEvent = Boolean(initialData?.isPublished);
  const imageCount = imagePreviews.filter(Boolean).length;

  const dialogTitle = isTrainingEvent
    ? (initialData ? 'Edit Training Event' : 'Create Training Event')
    : (initialData ? 'Edit Event' : 'Create Event');

  const renderImageSlot = (index: number) => {
    const preview = imagePreviews[index];
    const over = dragOverStates[index];
    return (
      <div key={index} className="min-w-0 flex flex-col gap-[6px]">
        <div
          role="button"
          tabIndex={0}
          aria-label={preview ? `Replace image ${index + 1}` : `Add image ${index + 1}`}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={(e) => handleDragLeave(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onClick={() => document.getElementById(`image-upload-${index}`)?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById(`image-upload-${index}`)?.click(); } }}
          className={`group/img relative w-full rounded-rr-md overflow-hidden cursor-pointer transition-colors ${preview ? 'border border-border2' : 'border-2 border-dashed'} ${over ? '!border-accent bg-accent-weak' : preview ? '' : 'border-border2 bg-panel2 hover:border-accent'}`}
          style={{ aspectRatio: '16 / 9' }}
        >
          {preview ? (
            <>
              <img src={preview} alt={`Event image ${index + 1}`} className="absolute inset-0 w-full h-full object-cover block" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-[11.5px] font-semibold opacity-0 group-hover/img:opacity-100 transition-opacity">
                Replace
              </span>
              <button
                type="button"
                aria-label={`Remove image ${index + 1}`}
                title="Remove image"
                onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                className="absolute top-[6px] right-[6px] w-[24px] h-[24px] rounded-full flex items-center justify-center border-0 cursor-pointer text-white bg-black/65 hover:bg-bad"
              >
                <Icon name="close" size={12} />
              </button>
            </>
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] text-text3">
              <Icon name="image" size={18} />
              <span className="text-[11px]">{over ? 'Drop to add' : 'Drop or click'}</span>
            </span>
          )}
        </div>
        <span className="text-[11px] text-text3">{index === 0 ? 'Header image' : `Image ${index + 1}`}</span>
        <input id={`image-upload-${index}`} type="file" accept="image/*" onChange={(e) => handleFileInputChange(e, index)} className="hidden" />
      </div>
    );
  };

  const stepContent = (
    <>
      {currentStep === 'details' && (
        <div className="flex flex-col gap-[18px]">
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
            <Field label="Event title" required>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cruise 26-2 Wk VI: Operation Alamo" autoFocus={!initialSection} />
            </Field>
            <Field label="Cycle">
              <Select
                value={cycleId || ''}
                onChange={(v) => setCycleId(v || undefined)}
                options={[{ value: '', label: 'Standalone (no cycle)' }, ...cycles.map(c => ({ value: c.id, label: c.name, description: c.type }))]}
              />
            </Field>
          </div>

          <DlgCard title="When">
            <div className="grid gap-[14px] items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <Field label="Start" required>
                <input type="datetime-local" value={datetime} onChange={handleDatetimeChange} className={`${controlClass} px-3 py-[7px] min-h-[36px]`} style={{ colorScheme: 'inherit' }} />
              </Field>
              <Field label="Time zone">
                <Select value={timezone} onChange={(v) => setTimezone(v)} options={TZ_OPTIONS} />
              </Field>
              <Field label="Duration">
                <div className="flex items-center gap-[8px]">
                  <NumberStepper value={durationHours} min={0} max={48} onChange={(n) => handleDurationHoursChange({ target: { value: String(n) } } as any)} suffix="h" width={40} />
                  <NumberStepper value={durationMinutes} min={0} max={59} step={15} onChange={(n) => handleDurationMinutesChange({ target: { value: String(n) } } as any)} suffix="m" width={40} />
                </div>
              </Field>
            </div>
            {endReadout ? (
              <div className="mt-[10px] flex items-center gap-[6px] text-[12px] text-text2">
                <Icon name="clock" size={13} style={{ color: 'var(--rr-text3)' }} />
                Ends <span className="font-semibold text-text">{endReadout}</span> <span className="text-text3">· {tzLabel}</span>
              </div>
            ) : null}
          </DlgCard>

          <Field label="Description" hint="Shown in the Discord event post.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Briefing text for the event post" />
          </Field>

          <div>
            <FieldLabel>Images{imageCount > 0 ? ` · ${imageCount}` : ''}</FieldLabel>
            <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {[0, 1, 2, 3].map(renderImageSlot)}
            </div>
            <div className="mt-[6px] text-[11.5px] text-text2">16:9 works best. The header image leads the Discord post; the others follow it.</div>
          </div>
        </div>
      )}

      {currentStep === 'training' && activitiesEnabled && (
        <div className="flex flex-col gap-[12px]">
          <StepIntro title="Activities" text="What happens at this event. Each activity carries its own participants, support roles, objectives and reference materials." />
          <EventActivitiesEditor
            activities={eventActivities}
            onChange={setEventActivities}
            syllabusMissions={syllabusMissions}
            squadrons={squadrons || []}
          />
        </div>
      )}

      {currentStep === 'training' && !activitiesEnabled && (
        <div className="flex flex-col gap-[16px]">
          <StepIntro title="Training" text="Link a syllabus mission to pull in its objectives and reference materials." />
          {syllabusMissions.length > 0 && (
            <Field label="Syllabus mission">
              <Select
                value={selectedMissionId}
                onChange={(v) => setSelectedMissionId(v)}
                options={[{ value: '', label: 'No mission' }, ...syllabusMissions.map(m => ({ value: m.id, label: `Mission ${m.mission_number}: ${m.mission_name}` }))]}
              />
            </Field>
          )}
          {selectedMissionId && trainingObjectives.length > 0 && (
            <DlgCard title="Training objectives (DLOs)" count={trainingObjectives.length}>
              <ul className="m-0 p-0 list-none flex flex-col gap-[5px]">
                {trainingObjectives.map((objective) => (
                  <li key={objective.id} className="flex items-start gap-[7px] text-[13px] leading-[1.5] text-text">
                    <Icon name="checkCircle" size={13} style={{ color: 'var(--rr-text3)', flexShrink: 0, marginTop: 3 }} />
                    <span>{objective.objective_text}</span>
                  </li>
                ))}
              </ul>
            </DlgCard>
          )}
          <ReferenceMaterialsInput value={referenceMaterials} onChange={setReferenceMaterials} inheritedMaterials={inheritedReferences} />
        </div>
      )}

      {/* Mission step only exists when the Activities flag is off */}
      {currentStep === 'mission' && (
        <div className="flex flex-col gap-[16px]">
          <StepIntro title="Mission" text="Support roles and debrief requirements for this event." />
          <DlgCard
            title="Mission support roles"
            description="Each role shows in the Discord post as available/required, e.g. JTAC (1/3). Set required to 0 to list a role without requiring it. Roles appear in this order."
          >
            <SupportRoleRequirementsEditor requirements={supportRoleRequirements} onChange={setSupportRoleRequirements} />
          </DlgCard>
          <DlgCard flush>
            <SettingRow
              label="After Action Reports for operational squadrons only"
              description="Only flights from operational (non-training) squadrons appear in the AAR section on Mission Debriefing."
              checked={aarOperationalOnly}
              onChange={setAarOperationalOnly}
            />
          </DlgCard>
        </div>
      )}

      {currentStep === 'participants' && (
        <div className="flex flex-col gap-[16px]">
          <StepIntro
            title={activitiesEnabled ? 'Options' : 'Participants & options'}
            text={activitiesEnabled
              ? 'Event-wide settings for the Discord post and reports. Who takes part is set per activity.'
              : 'Who the event is for, and how the Discord post is laid out.'}
          />

          {!activitiesEnabled && (
            <DlgCard
              title="Participating squadrons"
              count={participants.length || undefined}
              right={
                <div className="flex items-center gap-[2px]">
                  <Button size="sm" variant="ghost" onClick={() => setParticipatingSquadrons(squadrons.map(s => s.id))}>All</Button>
                  <Button size="sm" variant="ghost" onClick={() => setParticipatingSquadrons([])}>None</Button>
                  {selectedCycle?.participants ? (
                    <Button size="sm" variant="ghost" icon="refresh" onClick={() => setParticipatingSquadrons(selectedCycle.participants || [])}>Cycle</Button>
                  ) : null}
                </div>
              }
              footer={participants.length === 0 ? 'None selected: the event inherits the cycle’s squadrons.' : `${participants.length} squadron${participants.length !== 1 ? 's' : ''} selected.`}
            >
              <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {squadrons.map(squadron => {
                  const on = participants.includes(squadron.id);
                  return (
                    <SquadronToggleTile
                      key={squadron.id}
                      squadron={squadron}
                      selected={on}
                      onToggle={() => setParticipatingSquadrons(prev => on ? prev.filter(id => id !== squadron.id) : [...prev, squadron.id])}
                    />
                  );
                })}
              </div>
            </DlgCard>
          )}

          <DlgCard title="Discord post" flush>
            <SettingRow label="Group responses by qualification" description="Organise the response lists in the post by pilot qualification." checked={trackQualifications} onChange={setTrackQualifications} />
            <SettingRow label="Group by squadron" description="Divide attendance in the post by squadron." checked={groupBySquadron} onChange={setGroupBySquadron} />
            <SettingRow label={'Show “No Response” users'} description="List active users who haven't responded yet." checked={showNoResponse} onChange={setShowNoResponse} />
            <SettingRow label="Allow tentative responses" description={'Users can pick “Tentative” as well as Accept or Decline.'} checked={allowTentativeResponse} onChange={setAllowTentativeResponse} />
          </DlgCard>

          {cycleId && (
            <DlgCard title="Reporting" flush>
              <SettingRow label="Include in Cycle Attendance Report" description="When off, this event is left out of attendance statistics on the Reports page." checked={includeInAttendanceReport} onChange={setIncludeInAttendanceReport} />
            </DlgCard>
          )}
        </div>
      )}

      {currentStep === 'reminders' && (
        <div className="flex flex-col gap-[16px]">
          <StepIntro title="Reminders" text="Automatic Discord reminders before the event starts. Only active users are notified." />
          <ReminderCard
            title="First reminder"
            enabled={firstReminderEnabled}
            onEnabled={setFirstReminderEnabled}
            value={firstReminderValue}
            onValue={setFirstReminderValue}
            unit={firstReminderUnit}
            onUnit={setFirstReminderUnit}
            recipients={{ accepted: firstReminderAccepted, tentative: firstReminderTentative, declined: firstReminderDeclined, noResponse: firstReminderNoResponse }}
            onRecipient={(k, v) => ({ accepted: setFirstReminderAccepted, tentative: setFirstReminderTentative, declined: setFirstReminderDeclined, noResponse: setFirstReminderNoResponse })[k](v)}
          />
          <ReminderCard
            title="Second reminder"
            enabled={secondReminderEnabled}
            onEnabled={setSecondReminderEnabled}
            value={secondReminderValue}
            onValue={setSecondReminderValue}
            unit={secondReminderUnit}
            onUnit={setSecondReminderUnit}
            recipients={{ accepted: secondReminderAccepted, tentative: secondReminderTentative, declined: secondReminderDeclined, noResponse: secondReminderNoResponse }}
            onRecipient={(k, v) => ({ accepted: setSecondReminderAccepted, tentative: setSecondReminderTentative, declined: setSecondReminderDeclined, noResponse: setSecondReminderNoResponse })[k](v)}
          />
        </div>
      )}

      {currentStep === 'publish' && (
        <div className="flex flex-col gap-[16px]">
          <StepIntro title="Publish" text={isPublishedEvent ? 'This event is already on Discord. Saving with “Update Discord” refreshes the post.' : 'Publish now, schedule it, or save it as a draft.'} />

          {/* Review */}
          <div className="grid gap-x-5 gap-y-[12px] p-[14px] rounded-rr-lg border border-border bg-panel2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {[
              { k: 'Event', v: title || '—' },
              { k: 'Starts', v: startReadout || '—', sub: tzLabel },
              { k: 'Duration', v: `${durationHours}h${durationMinutes ? ` ${durationMinutes}m` : ''}`, mono: true },
              { k: 'Cycle', v: cycles.find(c => c.id === cycleId)?.name || 'Standalone' },
              ...(activitiesEnabled ? [{ k: 'Activities', v: String(eventActivities.length), mono: true }] : []),
              { k: 'Reminders', v: [firstReminderEnabled, secondReminderEnabled].filter(Boolean).length ? `${[firstReminderEnabled, secondReminderEnabled].filter(Boolean).length} on` : 'Off' },
              { k: 'Images', v: String(imageCount), mono: true },
            ].map((m: { k: string; v: string; sub?: string; mono?: boolean }) => (
              <div key={m.k} className="min-w-0">
                <div className="rr-label mb-[3px]">{m.k}</div>
                <div className={`text-[13px] font-semibold text-text leading-[1.3] ${m.mono ? 'font-mono text-[12.5px]' : ''}`} style={{ overflowWrap: 'anywhere' }}>{m.v}</div>
                {m.sub ? <div className="text-[11.5px] text-text2">{m.sub}</div> : null}
              </div>
            ))}
          </div>

          <DlgCard title="Initial notification" description="Discord roles to mention when the event is first published.">
            <RolePicker
              available={availableDiscordRoles}
              selected={selectedNotificationRoles}
              loading={loadingRoles}
              pendingId={selectedRoleId}
              onPendingChange={setSelectedRoleId}
              onAdd={handleAddNotificationRole}
              onRemove={handleRemoveNotificationRole}
            />
          </DlgCard>

          <DlgCard
            title="Schedule publication"
            description={isPublishedEvent ? 'Already published, so scheduling isn’t available.' : 'Publish automatically at a set time instead of right away.'}
            right={<Toggle checked={scheduledPublicationEnabled} onChange={(v) => !isPublishedEvent && setScheduledPublicationEnabled(v)} disabled={isPublishedEvent} />}
          >
            {scheduledPublicationEnabled ? (
              <div className="grid gap-[14px] items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <Field label="Publish at" hint={`In the event's time zone (${tzLabel}).`}>
                  <input type="datetime-local" value={scheduledPublicationDatetime} onChange={handleScheduledPublicationDatetimeChange} className={`${controlClass} px-3 py-[7px] min-h-[36px]`} />
                </Field>
                <Field label="Or, before event start" hint="Both stay in sync.">
                  <div className="flex items-center gap-[8px] flex-wrap">
                    <NumberStepper value={scheduledPublicationOffset.value} min={1} max={999} onChange={(n) => handleScheduledPublicationOffsetChange('value', String(n))} width={44} />
                    <SegmentedControl size="sm" value={scheduledPublicationOffset.unit} onChange={(u) => handleScheduledPublicationOffsetChange('unit', u)} options={UNIT_OPTIONS} />
                  </div>
                </Field>
              </div>
            ) : null}
          </DlgCard>
        </div>
      )}
    </>
  );

  // Footer actions. Editing: save from any step. Creating: walk the steps, finish on the last one.
  const publishLabel = initialData
    ? (scheduledPublicationEnabled ? 'Save & Schedule' : isPublishedEvent ? 'Save & Update Discord' : 'Save & Publish')
    : (scheduledPublicationEnabled ? 'Create & Schedule' : 'Create & Publish');
  const showSave = Boolean(initialData) || isLastStep;

  // Stay hidden until the step list (feature flag) and any deep-linked step are resolved, so the
  // dialog opens on the right step instead of flashing Event Details first.
  if (!dialogReady) return null;

  return (
    <DialogShell label={dialogTitle} onClose={onCancel} width="1040px" height="900px">
        {/* Header */}
        <div className="flex-none flex items-center gap-3 pl-[20px] pr-[14px] py-[14px] border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold leading-[1.25] truncate">{dialogTitle}</div>
            <div className="text-[12px] text-text2 truncate">
              {initialData ? (title || 'Untitled event') : 'New event'}
              {cycleId ? ` · ${cycles.find(c => c.id === cycleId)?.name || ''}` : ' · Standalone'}
            </div>
          </div>
          {isPublishedEvent ? <Chip tone="good" size="sm">Published</Chip> : null}
          <CloseButton onClick={onCancel} />
        </div>

        <div className="flex-1 min-h-0 flex max-[760px]:flex-col">
          {/* Step rail */}
          <nav aria-label="Steps" className="flex-none w-[212px] border-r border-border bg-panel2 p-[10px] flex flex-col gap-[2px] overflow-y-auto max-[760px]:w-auto max-[760px]:flex-row max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:overflow-x-auto">
            {steps.map((step, index) => {
              const isCompleted = completedSteps.has(step.key) && currentStep !== step.key;
              const isCurrent = currentStep === step.key;
              const isClickable = Boolean(initialData) || index <= currentStepIndex || completedSteps.has(step.key);
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => isClickable && handleStepClick(step.key)}
                  disabled={!isClickable}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-[10px] px-[10px] py-[9px] rounded-rr-md border-0 text-left transition-colors max-[760px]:flex-none ${isCurrent ? 'bg-panel shadow-rr' : isClickable ? 'bg-transparent hover:bg-panel cursor-pointer' : 'bg-transparent cursor-default opacity-55'}`}
                  style={isCurrent ? { boxShadow: 'inset 2px 0 0 var(--rr-accent), var(--rr-shadow)' } : undefined}
                >
                  <span
                    className="flex-none w-[24px] h-[24px] rounded-[8px] flex items-center justify-center font-mono text-[11.5px] font-semibold"
                    style={isCurrent
                      ? { background: 'var(--rr-accent)', color: '#fff' }
                      : isCompleted
                        ? { background: 'color-mix(in srgb, var(--rr-good) 18%, transparent)', color: 'var(--rr-good)' }
                        : { background: 'var(--rr-panel3)', color: 'var(--rr-text2)' }}
                  >
                    {isCompleted ? <Icon name="check" size={13} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex flex-col max-[760px]:hidden">
                    <span className={`text-[13px] leading-[1.25] ${isCurrent ? 'font-semibold text-text' : 'font-medium text-text'}`}>{step.title}</span>
                    <span className="text-[11px] text-text3 leading-[1.3] truncate">{step.description}</span>
                  </span>
                  <span className="hidden max-[760px]:inline text-[12.5px] font-semibold whitespace-nowrap">{step.title}</span>
                </button>
              );
            })}
          </nav>

          {/* Step content */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            <div className="max-w-[760px] mx-auto px-[24px] py-[20px] max-[760px]:px-[14px]">
              {error ? <div className="mb-[14px]"><Toast tone="bad" onDismiss={() => setError('')}>{error}</Toast></div> : null}
              {stepContent}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none flex items-center gap-[10px] px-[18px] py-[12px] border-t border-border flex-wrap">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <span className="flex-1" />
          {!isFirstStep ? <Button variant="secondary" icon="chevronLeft" onClick={handlePreviousStep}>Back</Button> : null}
          {!isLastStep ? (
            <Button variant={initialData ? 'secondary' : 'primary'} iconRight="chevronRight" onClick={handleNextStep}>Next</Button>
          ) : null}
          {showSave ? (
            <>
              <span className="w-px h-[22px] bg-border mx-[2px]" />
              <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
                {initialData ? 'Save' : 'Create draft'}
              </Button>
              <Button variant="primary" icon={scheduledPublicationEnabled ? 'clock' : 'send'} onClick={() => handleSubmit(!scheduledPublicationEnabled)} loading={isSubmitting} disabled={isSubmitting}>
                {isSubmitting ? (scheduledPublicationEnabled ? 'Scheduling…' : 'Saving…') : publishLabel}
              </Button>
            </>
          ) : null}
        </div>
    </DialogShell>
  );
};

/* ------------------------------------------------------------------ */
/* Dialog building blocks                                              */
/* ------------------------------------------------------------------ */

const TZ_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'British Time' },
  { value: 'Europe/Berlin', label: 'Central European' },
  { value: 'Europe/Athens', label: 'Eastern European' },
  { value: 'Asia/Tokyo', label: 'Japan Time' },
  { value: 'Australia/Sydney', label: 'Australian Eastern' },
];

type RecipientKey = 'accepted' | 'tentative' | 'declined' | 'noResponse';
const RECIPIENTS: Array<{ key: RecipientKey; label: string; color: string }> = [
  { key: 'accepted', label: 'Accepted', color: 'var(--rr-good)' },
  { key: 'tentative', label: 'Tentative', color: 'var(--rr-warn)' },
  { key: 'declined', label: 'Declined', color: 'var(--rr-bad)' },
  { key: 'noResponse', label: 'No response', color: 'var(--rr-text3)' },
];

const ReminderCard: React.FC<{
  title: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: number;
  onValue: (v: number) => void;
  unit: ReminderUnit;
  onUnit: (u: ReminderUnit) => void;
  recipients: Record<RecipientKey, boolean>;
  onRecipient: (k: RecipientKey, v: boolean) => void;
}> = ({ title, enabled, onEnabled, value, onValue, unit, onUnit, recipients, onRecipient }) => {
  const unitLabel = unitWord(value, unit);
  const chosen = RECIPIENTS.filter(r => recipients[r.key]);
  return (
    <section className={`rounded-rr-lg border bg-panel overflow-hidden transition-colors ${enabled ? 'border-border2' : 'border-border'}`}>
      <div className="flex items-center gap-3 px-[14px] py-[12px] cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onEnabled(!enabled); }}>
        <Toggle checked={enabled} onChange={onEnabled} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-semibold ${enabled ? 'text-text' : 'text-text2'}`}>{title}</div>
          <div className="text-[12px] text-text2">
            {enabled
              ? <>{value} {unitLabel} before start{chosen.length ? <> &middot; {chosen.map(c => c.label).join(', ')}</> : <span className="text-warn"> &middot; no recipients selected</span>}</>
              : 'Off'}
          </div>
        </div>
      </div>
      {enabled ? (
        <div className="border-t border-border px-[14px] py-[12px] flex flex-col gap-[12px] bg-panel2">
          <div className="flex items-center gap-[10px] flex-wrap">
            <span className="rr-label w-[78px]">Send</span>
            <NumberStepper value={value} min={1} max={999} onChange={onValue} width={44} />
            <SegmentedControl size="sm" value={unit} onChange={onUnit} options={UNIT_OPTIONS} />
            <span className="text-[12.5px] text-text2">before event start</span>
          </div>
          <div className="flex items-center gap-[10px] flex-wrap">
            <span className="rr-label w-[78px]">Recipients</span>
            <div className="flex flex-wrap gap-[6px]">
              {RECIPIENTS.map(r => {
                const on = recipients[r.key];
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onRecipient(r.key, !on)}
                    className={`inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-rr-ctl border text-[12.5px] font-semibold cursor-pointer transition-colors ${on ? 'text-text' : 'text-text3 border-border2 bg-transparent hover:border-accent hover:text-text2'}`}
                    style={on ? { background: `color-mix(in srgb, ${r.color} 16%, transparent)`, borderColor: `color-mix(in srgb, ${r.color} 55%, transparent)` } : undefined}
                  >
                    <span className="w-[7px] h-[7px] rounded-full" style={on ? { background: r.color } : { boxShadow: `inset 0 0 0 1.5px ${r.color}` }} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default EventDialog;
