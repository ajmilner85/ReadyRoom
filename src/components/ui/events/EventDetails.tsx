import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../card';
import { Check, Send, Users, Bell, Clock, Calendar, Settings } from 'lucide-react';
import type { Event } from '../../../types/EventTypes';
import { publishEventFromCycle, updateEventMultipleDiscordIds } from '../../../utils/discordService';
import { fetchEvents, supabase } from '../../../utils/supabaseClient';
import { uploadEventImage } from '../../../utils/eventImageService';
import { getAllSquadrons } from '../../../utils/organizationService';
import type { Squadron } from '../../../types/OrganizationTypes';

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

const EventDetails: React.FC<EventDetailsProps> = ({ event, onEventUpdated }) => {
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [scheduledReminders, setScheduledReminders] = useState<any[]>([]);
  const [serverConnectivity, ] = useState<'connected' | 'pending' | 'error'>('connected');
  const [sendingReminder, setSendingReminder] = useState(false);
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

    loadSquadrons();
    loadReminders();
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
    // console.log('[PUBLISH-BUTTON-DEBUG] Publish button clicked for event:', event?.id);
    if (!event) {
      // console.log('[PUBLISH-BUTTON-DEBUG] No event available');
      return;
    }
    
    // Check if the event already has a discord message ID (already published)
    if (event.discordEventId || event.discord_event_id) {
      // console.log('[PUBLISH-BUTTON-DEBUG] Event already published, exiting');
      return;
    }
    
    // console.log('[PUBLISH-BUTTON-DEBUG] Starting publish process, setting publishing state to true');
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
      // console.log('[PUBLISH-DEBUG] Raw dbEvent.image_url:', dbEvent?.image_url);
      // console.log('[PUBLISH-DEBUG] Raw dbEvent.participants:', dbEvent?.participants);
      // console.log('[PUBLISH-DEBUG] Type of image_url:', typeof dbEvent?.image_url);
      
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
      
      // console.log('[PUBLISH-DEBUG] publishableEvent:', publishableEvent);
      
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
                unit: (event.eventSettings.firstReminderTime?.unit || 'minutes') as 'minutes' | 'hours' | 'days'
              },
              secondReminder: {
                enabled: Boolean(event.eventSettings.secondReminderEnabled),
                value: event.eventSettings.secondReminderTime?.value || 3,
                unit: (event.eventSettings.secondReminderTime?.unit || 'days') as 'minutes' | 'hours' | 'days'
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
            } else {
              // console.log('[PUBLISH-REMINDER-DEBUG] Successfully scheduled reminders for published event:', event.id);
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
      
      // console.log('[PUBLISH-BUTTON-DEBUG] Setting publishing state to false');
      setPublishing(false);
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    if (!endTime) return null;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    
    // Calculate duration in minutes
    const diffMs = end.getTime() - start.getTime();
    const totalMinutes = Math.round(diffMs / (1000 * 60));
    
    // Format as hours and minutes
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    let durationStr = '';
    if (hours > 0) {
      durationStr += `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
      durationStr += `${durationStr ? ' ' : ''}${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    
    return durationStr || '0 minutes';
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

  // Handle manual reminder send
  const handleSendReminder = async () => {
    if (!event || sendingReminder) return;
    
    setSendingReminder(true);
    
    try {
      // Import the reminder service function
      const { sendEventReminder } = await import('../../../utils/reminderService');
      
      const result = await sendEventReminder(event.id);
      
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
      <div style={{ marginBottom: '10px' }}>
        <h1 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#0F172A',
          marginBottom: '8px'
        }}>
          {event.title}
        </h1>
        <div style={{
          fontSize: '14px',
          color: '#64748B',
          marginBottom: '4px'
        }}>
          Created by <span style={{ fontWeight: 500, color: '#475569' }}>{event.creator.callsign} ({event.creator.boardNumber})</span>
          {event.creator.billet && <span style={{ color: '#64748B' }}> - {event.creator.billet}</span>}
        </div>
      </div>

      <Card className="p-4" style={{ marginBottom: '10px' }}>
        {/* Timezone Display */}
        {event.eventSettings?.timezone && (
          <div style={{
            fontSize: '12px',
            color: '#6B7280',
            fontFamily: 'monospace',
            backgroundColor: '#F9FAFB',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Clock size={12} />
            <span>Timezone: {getTimezoneDisplay(event.eventSettings.timezone)}</span>
          </div>
        )}
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Start Date & Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '100px'
            }}>Start</div>
            <div style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#334155',
              flex: 1
            }}>
              {new Date(event.datetime).toLocaleString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
          
          {event.endDatetime && (
            <>
              {/* End Date & Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  minWidth: '100px'
                }}>End</div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#334155',
                  flex: 1
                }}>
                  {new Date(event.endDatetime).toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              
              {/* Duration */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  minWidth: '100px'
                }}>Duration</div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#334155'
                }}>
                  {formatDuration(event.datetime, event.endDatetime)}
                </div>
              </div>
            </>
          )}
          
          {event.restrictedTo && event.restrictedTo.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                minWidth: '100px'
              }}>Restricted</div>
              <div style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#B45309',
                backgroundColor: '#FEF3C7',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'inline-block'
              }}>{event.restrictedTo.join(', ')}</div>
            </div>
          )}
        </div>
      </Card>


      <Card className="p-4" style={{ marginBottom: '10px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1E293B', marginBottom: '16px' }}>Description</h2>
        <div style={{
          fontSize: '14px',
          color: '#374151',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.5'
        }}>
          {event.description || 'No description provided'}
        </div>
      </Card>

      {/* Event Settings */}
      <Card className="p-4" style={{ marginBottom: '10px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1E293B', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Calendar size={18} className="text-slate-500" />
            <Settings size={10} style={{ 
              position: 'absolute', 
              bottom: -2, 
              right: -2, 
              color: '#64748B',
              backgroundColor: 'white',
              borderRadius: '50%',
              padding: '1px'
            }} />
          </div>
          Event Settings
        </h2>
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Participating Squadrons */}
          {event.participants && event.participants.length > 0 && (
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Users size={14} />
                Participating Squadrons
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '8px'
              }}>
                {event.participants.map((squadronId) => {
                  const squadron = squadrons.find(s => s.id === squadronId);
                  return (
                    <div key={squadronId} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      backgroundColor: '#FAFAFA'
                    }}>
                      {squadron?.insignia_url && (
                        <img 
                          src={squadron.insignia_url} 
                          alt={`${squadron.designation} insignia`}
                          style={{
                            width: '24px',
                            height: '24px',
                            objectFit: 'contain',
                            flexShrink: 0
                          }}
                        />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#000000',
                          lineHeight: 1.2
                        }}>
                          {squadron?.designation || 'Unknown'}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6B7280',
                          lineHeight: 1.2
                        }}>
                          {squadron?.name || `Squadron ${squadronId}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reminder Settings */}
          {event.eventSettings && (
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Bell size={14} />
                Reminder Settings
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{
                  fontSize: '13px',
                  color: '#475569',
                  backgroundColor: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0'
                }}>
                  First reminder: {event.eventSettings.firstReminderEnabled && event.eventSettings.firstReminderTime ? 
                    `${event.eventSettings.firstReminderTime.value} ${event.eventSettings.firstReminderTime.unit} before start` : 
                    'Disabled'}
                </div>
                <div style={{
                  fontSize: '13px',
                  color: '#475569',
                  backgroundColor: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0'
                }}>
                  Second reminder: {event.eventSettings.secondReminderEnabled && event.eventSettings.secondReminderTime ? 
                    `${event.eventSettings.secondReminderTime.value} ${event.eventSettings.secondReminderTime.unit} before start` : 
                    'Disabled'}
                </div>
              </div>
            </div>
          )}

          {/* Next Scheduled Reminder */}
          {scheduledReminders.length > 0 && (
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Clock size={14} />
                Next Reminder
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{
                  fontSize: '13px',
                  color: '#475569',
                  backgroundColor: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0'
                }}>
                  Next reminder: {new Date(scheduledReminders[0].scheduled_time).toLocaleString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </div>
                <button
                  onClick={handleSendReminder}
                  disabled={sendingReminder}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: sendingReminder ? 'not-allowed' : 'pointer',
                    opacity: sendingReminder ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    alignSelf: 'flex-start'
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
                      <span>Send Reminder Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
      
      {/* Event Image Section */}
      {(imagePreview || imageLoading) && (
        <Card className="p-6" style={{ marginBottom: '10px' }}>
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
      
      {/* Discord Integration Status */}
      {isPublished && (
        <Card className="p-4" style={{ marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1E293B', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DiscordIcon size={18} className="text-indigo-500" />
            Discord Integration
          </h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {/* Publication Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981', // Green for published/active
                flexShrink: 0
              }} />
              <div style={{
                fontSize: '13px',
                color: '#374151',
                fontWeight: 500
              }}>
                Published to Discord
              </div>
            </div>
            
            {/* Connectivity Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: serverConnectivity === 'connected' ? '#10B981' : 
                                serverConnectivity === 'pending' ? '#6B7280' : '#EF4444',
                flexShrink: 0
              }} />
              <div style={{
                fontSize: '13px',
                color: '#374151',
                fontWeight: 500
              }}>
                Server monitoring {serverConnectivity === 'connected' ? 'active' : 
                                  serverConnectivity === 'pending' ? 'pending' : 'error'}
              </div>
            </div>
            
            {/* Features List */}
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Check size={12} style={{ color: '#10B981' }} />
                <span style={{ fontSize: '12px', color: '#6B7280' }}>Real-time attendance tracking</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Check size={12} style={{ color: '#10B981' }} />
                <span style={{ fontSize: '12px', color: '#6B7280' }}>Event countdown updates</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={12} style={{ color: '#10B981' }} />
                <span style={{ fontSize: '12px', color: '#6B7280' }}>Event reminder messages</span>
              </div>
            </div>
          </div>
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
      </div>
    </div>
  );
};

export default EventDetails;