import React, { useState, useEffect } from 'react';
import { X, Clock, Image as ImageIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useAppSettings } from '../../../context/AppSettingsContext';

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
    restrictedTo?: string[];
    participants?: string[];
    headerImage?: File | null;
    additionalImages?: (File | null)[];
    trackQualifications?: boolean;
    groupBySquadron?: boolean;
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
    };
  }, shouldPublish?: boolean) => Promise<void>;
  onCancel: () => void;
  initialData?: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    restrictedTo?: string[];
    participants?: string[];
    imageUrl?: string;
    headerImageUrl?: string;
    additionalImageUrls?: string[];
    trackQualifications?: boolean;
    eventSettings?: {
      timezone?: string;
      groupResponsesByQualification?: boolean;
      groupBySquadron?: boolean;
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
      // Legacy fields (deprecated)
      sendRemindersToAccepted?: boolean;
      sendRemindersToTentative?: boolean;
    };
  };
  squadrons?: Array<{ id: string; name: string; designation: string; insignia_url?: string | null }>;
  selectedCycle?: { participants?: string[] };
}

type WorkflowStep = 'details' | 'participants' | 'reminders';

export const EventDialog: React.FC<EventDialogProps> = ({
  onSave,
  onCancel,
  initialData,
  squadrons = [],
  selectedCycle
}) => {  
  const { settings } = useAppSettings();
  
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('details');
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set());
  
  // Form data state
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [datetime, setDatetime] = useState('');
  const [timezone, setTimezone] = useState(
    initialData?.eventSettings?.timezone || settings.eventDefaults.referenceTimezone || 'America/New_York'
  );
  const [durationHours, setDurationHours] = useState(settings.eventDefaults.defaultDurationHours);
  const [durationMinutes, setDurationMinutes] = useState(settings.eventDefaults.defaultDurationMinutes);
  const [endDatetime, setEndDatetime] = useState('');
  const [restrictedTo, setRestrictedTo] = useState<string[]>(initialData?.restrictedTo || ['All Pilots']);
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
      : false
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
      // Get the next occurrence of the default day of week at the default time in the selected timezone
      const now = new Date();
      const targetDay = settings.eventDefaults.defaultStartDayOfWeek;
      const targetTime = settings.eventDefaults.defaultStartTime;
      
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIndex = daysOfWeek.indexOf(targetDay);
      const currentDayIndex = now.getDay();
      
      let daysToAdd = targetDayIndex - currentDayIndex;
      if (daysToAdd <= 0) {
        daysToAdd += 7; // Next week
      }
      
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + daysToAdd);
      
      // Set the time
      const [hours, minutes] = targetTime.split(':').map(Number);
      targetDate.setHours(hours, minutes, 0, 0);
      
      // Convert to timezone-local for display
      const timezoneLocalString = utcToTimezoneLocal(targetDate.toISOString(), timezone);
      setDatetime(timezoneLocalString);
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

  // Workflow navigation and validation
  const steps: Array<{ key: WorkflowStep; title: string; description: string }> = [
    { key: 'details', title: 'Event Details', description: 'Basic event information' },
    { key: 'participants', title: 'Participants', description: 'Who can participate' },
    { key: 'reminders', title: 'Reminders', description: 'Notification settings' }
  ];

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const validateCurrentStep = (): boolean => {
    setError('');
    
    switch (currentStep) {
      case 'details':
        if (!title.trim()) {
          setError('Please enter an event title');
          return false;
        }
        if (!datetime) {
          setError('Please select a start date and time');
          return false;
        }
        if (durationHours === 0 && durationMinutes === 0) {
          setError('Please specify an event duration');
          return false;
        }
        const start = new Date(datetime);
        const end = new Date(endDatetime);
        if (end <= start) {
          setError('End time must be after start time');
          return false;
        }
        return true;
        
      case 'participants':
        // No specific validation required for participants step
        return true;
        
      case 'reminders':
        // No specific validation required for reminders step
        return true;
        
      default:
        return true;
    }
  };

  const handleNextStep = () => {
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
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1].key);
    }
  };

  const handleStepClick = (stepKey: WorkflowStep) => {
    // Allow clicking on previous steps or current step
    const stepIndex = steps.findIndex(step => step.key === stepKey);
    if (stepIndex <= currentStepIndex || completedSteps.has(stepKey)) {
      setCurrentStep(stepKey);
    }
  };

  const handleSubmit = async (shouldPublish: boolean = false) => {
    if (isSubmitting) return; // Prevent multiple submissions
    
    // Validate all steps
    if (!validateCurrentStep()) {
      return;
    }
    
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

      await onSave({
        title: title.trim(),
        description: description.trim(),
        datetime: utcDatetime,
        endDatetime: utcEndDatetime,
        duration: {
          hours: durationHours,
          minutes: durationMinutes
        },
        restrictedTo: restrictedTo.length > 0 ? restrictedTo : undefined,
        participants: participants.length > 0 ? participants : undefined,
        headerImage: headerImageForSubmit instanceof File ? headerImageForSubmit : undefined,
        additionalImages: additionalImagesForSubmit.filter((img): img is File => img instanceof File),
        trackQualifications,
        groupBySquadron,
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
          }
        }
      }, shouldPublish);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred while saving the event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = ['Cadre', 'Staff', 'All Pilots'];

  // Progress bar component
  const ProgressBar = () => (
    <div style={{ padding: '16px 24px' }}>
      <nav aria-label="Progress">
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          maxWidth: '400px',
          margin: '0 auto'
        }}>
          {/* Connecting lines between squares */}
          {currentStepIndex > 0 && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: 'calc(16.67% + 16px)',
              width: 'calc(33.33% - 32px)',
              height: '2px',
              backgroundColor: '#10B981',
              zIndex: 0
            }} />
          )}
          
          {currentStepIndex > 1 && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: 'calc(50% + 16px)',
              width: 'calc(33.33% - 32px)',
              height: '2px',
              backgroundColor: '#10B981',
              zIndex: 0
            }} />
          )}
          
          {/* Background lines */}
          {currentStepIndex < 1 && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: 'calc(16.67% + 16px)',
              width: 'calc(33.33% - 32px)',
              height: '2px',
              backgroundColor: '#E5E7EB',
              zIndex: 0
            }} />
          )}
          
          {currentStepIndex < 2 && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: 'calc(50% + 16px)',
              width: 'calc(33.33% - 32px)',
              height: '2px',
              backgroundColor: '#E5E7EB',
              zIndex: 0
            }} />
          )}
          
          {steps.map((step, index) => {
            const isCompleted = completedSteps.has(step.key);
            const isCurrent = currentStep === step.key;
            const isClickable = index <= currentStepIndex || isCompleted;
            
            return (
              <div key={step.key} style={{ 
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                zIndex: 1
              }}>
                <button
                  onClick={() => isClickable && handleStepClick(step.key)}
                  disabled={!isClickable}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: isClickable ? 'pointer' : 'default',
                    padding: '0'
                  }}
                >
                  {/* Rounded square */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isCompleted ? '#10B981' : isCurrent ? '#3B82F6' : '#E5E7EB',
                      color: isCompleted || isCurrent ? 'white' : '#6B7280',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '8px'
                    }}
                  >
                    {isCompleted ? <Check size={16} /> : index + 1}
                  </div>
                  
                  {/* Title below */}
                  <div style={{
                    fontSize: '14px',
                    fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? '#1F2937' : isCompleted ? '#374151' : '#6B7280',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    width: '90px',
                    minWidth: '90px'
                  }}>
                    {step.title}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '700px',
        height: '1000px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid #E2E8F0',
          flexShrink: 0
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {initialData ? 'Edit Event' : 'Create New Event'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        {/* Progress Bar */}
        <ProgressBar />

        {/* Step Content */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '8px 24px 24px 24px'
        }}>
          {currentStep === 'details' && (
            <div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Event Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px',
                    lineHeight: '19px'
                  }}
                  placeholder="Enter event title"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Start Date & Time
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="datetime-local"
                    value={datetime}
                    onChange={handleDatetimeChange}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      height: '35px',
                      lineHeight: '19px'
                    }}
                  />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      width: '180px',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      height: '35px',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="America/Anchorage">Alaska Time</option>
                    <option value="Pacific/Honolulu">Hawaii Time</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">British Time</option>
                    <option value="Europe/Berlin">Central European</option>
                    <option value="Europe/Athens">Eastern European</option>
                    <option value="Asia/Tokyo">Japan Time</option>
                    <option value="Australia/Sydney">Australian Eastern</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Duration
                </label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Clock size={16} color="#64748B" style={{ marginRight: '8px' }} />
                  <input
                    type="number"
                    min="0"
                    value={durationHours}
                    onChange={handleDurationHoursChange}
                    style={{
                      width: '70px',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px 0 0 4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      height: '35px',
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ padding: '0 6px', border: '1px solid #CBD5E1', borderLeft: 'none', borderRight: 'none', height: '35px', lineHeight: '35px', backgroundColor: '#F8FAFC' }}>h</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={durationMinutes}
                    onChange={handleDurationMinutesChange}
                    style={{
                      width: '70px',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '0 4px 4px 0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      height: '35px',
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ marginLeft: '6px', height: '35px', lineHeight: '35px' }}>min</span>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    minHeight: '120px',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter event description"
                />
              </div>

              {/* Image Upload Section */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '12px',
                  color: '#64748B',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  Event Images (Optional)
                </label>
                
                <div style={{ 
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gridTemplateRows: '1fr 1fr',
                  gap: '12px'
                  }}>
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={(e) => handleDragLeave(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onClick={() => document.getElementById(`image-upload-${index}`)?.click()}
                        style={{
                          border: `2px dashed ${dragOverStates[index] ? '#3B82F6' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          padding: '12px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          backgroundColor: dragOverStates[index] ? 'rgba(59, 130, 246, 0.05)' : '#FAFAFA',
                          transition: 'all 0.2s ease',
                          minHeight: '100px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {imagePreviews[index] ? (
                          <div style={{ position: 'relative' }}>
                            <img
                              src={imagePreviews[index]!}
                              alt={`Image ${index + 1}`}
                              style={{
                                maxWidth: '120px',
                                maxHeight: '80px',
                                borderRadius: '4px',
                                objectFit: 'cover'
                              }}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(index);
                              }}
                              style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                background: 'rgba(0, 0, 0, 0.7)',
                                border: 'none',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                color: '#fff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <ImageIcon size={20} color="#94A3B8" style={{ margin: '0 auto 4px' }} />
                            <p style={{ color: '#94A3B8', fontSize: '10px', margin: '0' }}>
                              Drop image or click
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {[0, 1, 2, 3].map((index) => (
                      <input
                        key={index}
                        id={`image-upload-${index}`}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileInputChange(e, index)}
                        style={{ display: 'none' }}
                      />
                    ))}
                  </div>
              </div>
            </div>
          )}

          {currentStep === 'participants' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#64748B'
                  }}>
                    Participating Squadrons
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      type="button"
                      onClick={() => setParticipatingSquadrons(squadrons.map(s => s.id))}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'Inter',
                        color: '#1E40AF'
                      }}
                    >
                      All
                    </button>
                    <button 
                      type="button"
                      onClick={() => setParticipatingSquadrons([])}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'Inter',
                        color: '#DC2626'
                      }}
                    >
                      None
                    </button>
                    {selectedCycle?.participants && (
                      <button 
                        type="button"
                        onClick={() => setParticipatingSquadrons(selectedCycle.participants || [])}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: '#F0FDF4',
                          border: '1px solid #BBF7D0',
                          borderRadius: '3px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          fontFamily: 'Inter',
                          color: '#15803D'
                        }}
                      >
                        Reset to Cycle
                      </button>
                    )}
                  </div>
                </div>
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  padding: '4px',
                  backgroundColor: '#FAFAFA'
                }}>
                  {squadrons.map(squadron => {
                    const isSelected = participants.includes(squadron.id);
                    return (
                      <div
                        key={squadron.id}
                        onClick={() => {
                          if (isSelected) {
                            setParticipatingSquadrons(prev => prev.filter(id => id !== squadron.id));
                          } else {
                            setParticipatingSquadrons(prev => [...prev, squadron.id]);
                          }
                        }}
                        style={{
                          padding: '6px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                          borderRadius: '3px',
                          transition: 'background-color 0.2s',
                          marginBottom: '2px'
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = '#F8FAFC';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div style={{
                          width: '14px',
                          height: '14px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '3px',
                          backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {isSelected && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        
                        {squadron.insignia_url ? (
                          <div style={{
                            width: '20px',
                            height: '20px',
                            backgroundImage: `url(${squadron.insignia_url})`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                            flexShrink: 0
                          }} />
                        ) : (
                          <div style={{
                            width: '20px',
                            height: '20px',
                            backgroundColor: '#E5E7EB',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '10px', color: '#6B7280' }}>?</span>
                          </div>
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'Inter' }}>
                            {squadron.designation}
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'Inter' }}>
                            {squadron.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#64748B',
                  marginTop: '4px'
                }}>
                  {participants.length === 0 ? 
                    'No squadrons selected. Event will inherit from cycle.' :
                    `${participants.length} squadron${participants.length !== 1 ? 's' : ''} selected.`
                  }
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Eligibility
                </label>
                <select
                  multiple
                  value={restrictedTo}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, option => option.value);
                    setRestrictedTo(values);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  {roleOptions.map(role => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <div style={{
                  fontSize: '12px',
                  color: '#64748B',
                  marginTop: '4px'
                }}>
                  Hold Ctrl/Cmd to select multiple roles. Leave empty for no restrictions.
                </div>
              </div>

              <div style={{ marginBottom: '16px', marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#64748B',
                      marginBottom: '4px',
                      display: 'block'
                    }}>
                      Group responses by qualification in Discord
                    </label>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '0', fontFamily: 'Inter' }}>
                      When enabled, Discord event responses will be organized by pilot qualifications.
                    </p>
                  </div>
                  <div
                    onClick={() => setTrackQualifications(!trackQualifications)}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: trackQualifications ? '#3B82F6' : '#E5E7EB',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      marginLeft: '16px'
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: trackQualifications ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#64748B',
                      marginBottom: '4px',
                      display: 'block'
                    }}>
                      Group by squadron in Discord
                    </label>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '0', fontFamily: 'Inter' }}>
                      When enabled, Discord event attendance will be divided by squadron.
                    </p>
                  </div>
                  <div
                    onClick={() => setGroupBySquadron(!groupBySquadron)}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: groupBySquadron ? '#3B82F6' : '#E5E7EB',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      marginLeft: '16px'
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: groupBySquadron ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'reminders' && (
            <div>
              <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F8FAFC' }}>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>First Reminder</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={firstReminderValue}
                    onChange={(e) => setFirstReminderValue(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: '80px',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}
                  />
                  <select
                    value={firstReminderUnit}
                    onChange={(e) => setFirstReminderUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                    style={{
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                  <span style={{ fontSize: '14px', color: '#64748B', flex: 1 }}>before event start</span>
                  <div
                    onClick={() => setFirstReminderEnabled(!firstReminderEnabled)}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: firstReminderEnabled ? '#3B82F6' : '#E5E7EB',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      marginLeft: '16px'
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: firstReminderEnabled ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    />
                  </div>
                </div>
                {firstReminderEnabled && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', fontWeight: 500 }}>
                      Send to users with status:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={firstReminderAccepted}
                          onChange={(e) => setFirstReminderAccepted(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Accepted</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={firstReminderTentative}
                          onChange={(e) => setFirstReminderTentative(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Tentative</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={firstReminderDeclined}
                          onChange={(e) => setFirstReminderDeclined(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Declined</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={firstReminderNoResponse}
                          onChange={(e) => setFirstReminderNoResponse(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>No Response</span>
                      </label>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '8px', fontStyle: 'italic' }}>
                      Only active users will be notified
                    </p>
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F8FAFC' }}>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Second Reminder</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={secondReminderValue}
                    onChange={(e) => setSecondReminderValue(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: '80px',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}
                  />
                  <select
                    value={secondReminderUnit}
                    onChange={(e) => setSecondReminderUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                    style={{
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                  <span style={{ fontSize: '14px', color: '#64748B', flex: 1 }}>before event start</span>
                  <div
                    onClick={() => setSecondReminderEnabled(!secondReminderEnabled)}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: secondReminderEnabled ? '#3B82F6' : '#E5E7EB',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      marginLeft: '16px'
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: secondReminderEnabled ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    />
                  </div>
                </div>
                {secondReminderEnabled && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', fontWeight: 500 }}>
                      Send to users with status:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={secondReminderAccepted}
                          onChange={(e) => setSecondReminderAccepted(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Accepted</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={secondReminderTentative}
                          onChange={(e) => setSecondReminderTentative(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Tentative</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={secondReminderDeclined}
                          onChange={(e) => setSecondReminderDeclined(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>Declined</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={secondReminderNoResponse}
                          onChange={(e) => setSecondReminderNoResponse(e.target.checked)}
                          style={{ marginRight: '6px' }}
                        />
                        <span style={{ color: '#4B5563' }}>No Response</span>
                      </label>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '8px', fontStyle: 'italic' }}>
                      Only active users will be notified
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              color: '#EF4444',
              fontSize: '14px',
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '6px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #E2E8F0',
          padding: '12px 24px',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePreviousStep}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  color: '#64748B',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
            )}
            
            {!isLastStep ? (
              <button
                type="button"
                onClick={handleNextStep}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#2563EB',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    color: '#64748B',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: isSubmitting ? 0.6 : 1
                  }}
                >
                  {isSubmitting ? 'Creating...' : (initialData ? 'Update' : 'Create')}
                </button>
                
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#10B981',
                    color: 'white',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: isSubmitting ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {isSubmitting && (
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #ffffff40',
                      borderTopColor: '#ffffff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  )}
                  {isSubmitting 
                    ? (initialData ? 'Publishing...' : 'Creating...') 
                    : (initialData ? 'Update & Publish' : 'Create & Publish')
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default EventDialog;
