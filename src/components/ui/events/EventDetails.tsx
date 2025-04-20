import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../card';
import { Check, Send, RefreshCw, ImageIcon, X, Upload } from 'lucide-react';
import type { Event } from '../../../types/EventTypes';
import { publishEventToDiscord } from '../../../utils/discordService';
import { fetchEvents, supabase } from '../../../utils/supabaseClient';
import { uploadEventImage, deleteEventImage } from '../../../utils/eventImageService';

/**
 * Check if the server is available before attempting to publish
 * @returns A promise that resolves to a boolean indicating if the server is available
 */
async function checkServerAvailability(): Promise<boolean> {
  try {
    // Use a simple HEAD request to check if the server is responding
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('http://localhost:3001/api/health', {
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
}

const EventDetails: React.FC<EventDetailsProps> = ({ event }) => {
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
    // Set initial image preview from event data
  useEffect(() => {
    // Add debugging to understand the image URL handling
    console.log('Event details: ', {
      eventId: event?.id,
      imageUrl: event?.imageUrl,
      image_url: event?.image_url, // Check for DB field naming
      eventObject: event
    });

    if (event?.imageUrl) {
      console.log('Using event.imageUrl for preview:', event.imageUrl);
      setImagePreview(event.imageUrl);
    } else if (event?.image_url) {
      // Check if the image URL might be in a different property (DB naming convention)
      console.log('Using event.image_url for preview:', event.image_url);
      setImagePreview(event.image_url);
    } else {
      console.log('No image URL found in event object');
      setImagePreview(null);
    }
  }, [event?.imageUrl, event?.image_url, event?.id]);

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
  
  // Handle image removal
  const handleRemoveImage = async () => {
    if (!event || !event.imageUrl) return;
    
    setImageLoading(true);
    
    try {
      const { error } = await deleteEventImage(event.imageUrl);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setImagePreview(null);
    } catch (error) {
      console.error('Error removing image:', error);
      setImageError(error instanceof Error ? error.message : 'Failed to remove image');
    } finally {
      setImageLoading(false);
    }
  };
  
  // Function to trigger file input click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Function to refresh event data from database
  const refreshEventData = useCallback(async () => {
    if (!event) return;
    
    try {
      setRefreshing(true);
      
      // Get latest event data from database
      const { events: fetchedEvents } = await fetchEvents(event.cycleId);
      
      // Find this event in the results
      const updatedEvent = fetchedEvents.find(e => e.id === event.id);
      
      if (updatedEvent) {
        // Manually trigger a re-render by updating the DOM
        // This allows parent component to handle the actual event state
        const discordCard = document.querySelector('#discord-integration-card');
        if (discordCard) {
          if (updatedEvent.discordEventId || updatedEvent.discordMessageId) {
            discordCard.classList.remove('hidden');
          } else {
            discordCard.classList.add('hidden');
          }
        }
        
        // Update button state
        const publishBtn = document.querySelector('#publish-discord-btn');
        if (publishBtn && (updatedEvent.discordEventId || updatedEvent.discordMessageId)) {
          publishBtn.setAttribute('disabled', 'true');
          publishBtn.classList.add('published');
          publishBtn.querySelector('span').textContent = 'Published to Discord';
        }
      }
    } catch (error) {
      // Silent failure for refresh operations
    } finally {
      setRefreshing(false);
    }
  }, [event]);  const handlePublishToDiscord = async () => {
    if (!event) return;
    
    // More detailed debugging about the event being published and its image
    const eventObj = event as any;
    console.log('[DEBUG] Publish button clicked for event:', { 
      id: event.id,
      title: event.title,
      discordMessageId: event.discordMessageId,
      discordEventId: event.discordEventId,
      // Add detailed debugging for ALL image-related properties
      imageUrl: event.imageUrl,
      image_url: eventObj.image_url,
      eventRawProps: Object.keys(eventObj),
      imagePreviewState: imagePreview,
      hasImage: Boolean(event.imageUrl || eventObj.image_url || imagePreview)
    });
    
    // Check if the event already has a discord message ID (already published)
    if (event.discordMessageId) {
      console.log('[DEBUG] Publish canceled - event already has discordMessageId:', event.discordMessageId);
      return;
    } else if (event.discordEventId) {
      console.log('[DEBUG] Publish canceled - event already has discordEventId:', event.discordEventId);
      return;
    }
    
    // Check if server is available before attempting to publish
    setPublishing(true);
    setPublishMessage(null);
    
    try {
      // First check if the server is available
      console.log('[DEBUG] Checking server availability...');
      const isServerAvailable = await checkServerAvailability();
      
      if (!isServerAvailable) {
        console.log('[DEBUG] Server unavailable, cannot publish');
        throw new Error('Cannot connect to the server. Please check if the server is running and try again.');
      }
        console.log('[DEBUG] Server available, publishing event to Discord...');
      
      // Check database directly for the image_url for this event
      console.log(`[DEBUG] Querying database directly for event ${event.id} image_url...`);
      const { data: dbEvent, error: dbError } = await supabase
        .from('events')
        .select('image_url')
        .eq('id', event.id)
        .single();
        
      console.log('[DEBUG] Database query result:', {
        dbEvent,
        dbError,
        hasImageUrlInDB: dbEvent && Boolean(dbEvent.image_url),
        imageUrlValue: dbEvent?.image_url
      });
      
      // Create an enhanced version of the event with guaranteed image URL
      const publishableEvent = {
        ...event,
        // Force set the image URL from multiple possible sources, prioritizing DB value
        imageUrl: dbEvent?.image_url || imagePreview || event.imageUrl || (event as any).image_url
      };
      
      console.log('[DEBUG] Publishing event with enhanced image data:', { 
        originalImageUrl: event.imageUrl,
        dbImageUrl: dbEvent?.image_url,
        componentImagePreview: imagePreview,
        finalImageUrl: publishableEvent.imageUrl,
        hasImage: Boolean(publishableEvent.imageUrl)
      });
      
      const response = await publishEventToDiscord(publishableEvent);
      
      console.log('[DEBUG] Publish response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to publish event to Discord');
      }
      
      setPublishMessage({
        type: 'success',
        text: 'Event successfully published to Discord!'
      });
      
      // Refresh data from database to get updated Discord ID
      console.log('[DEBUG] Refreshing event data from database...');
      await refreshEventData();
      
      // Clear the success message after 5 seconds
      setTimeout(() => {
        setPublishMessage(null);
      }, 5000);
    } catch (error) {
      // Provide more helpful error messages
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to reach the server. Make sure the server is running at http://localhost:3001';
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

  if (!event) {
    return (
      <div
        style={{
          width: '550px',
          maxWidth: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
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
  const isPublished = Boolean(event.discordMessageId) || Boolean(event.discordEventId);

  return (
    <div
      style={{
        width: '550px',
        maxWidth: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#0F172A',
          marginBottom: '8px'
        }}>
          {event.title}
        </h1>
        <div style={{
          fontSize: '16px',
          color: '#64748B'
        }}>
          Created by {event.creator.callsign} ({event.creator.boardNumber})
          {event.creator.billet && ` - ${event.creator.billet}`}
        </div>
      </div>

      <Card className="p-4 mb-6">
        <h2 className="text-lg font-semibold mb-2">Event Details</h2>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-500">Start Date & Time</div>
            <div className="font-medium">
              {new Date(event.datetime).toLocaleString()}
            </div>
          </div>
          
          {event.endDatetime && (
            <>
              <div>
                <div className="text-sm text-slate-500">End Date & Time</div>
                <div className="font-medium">
                  {new Date(event.endDatetime).toLocaleString()}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-slate-500">Duration</div>
                <div className="font-medium">
                  {formatDuration(event.datetime, event.endDatetime)}
                </div>
              </div>
            </>
          )}
          
          {event.restrictedTo && event.restrictedTo.length > 0 && (
            <div>
              <div className="text-sm text-slate-500">Restricted To</div>
              <div className="font-medium">{event.restrictedTo.join(', ')}</div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <h2 className="text-lg font-semibold mb-2">Description</h2>
        <div className="whitespace-pre-wrap text-slate-600">
          {event.description}
        </div>
      </Card>
      
      {/* Event Image Section */}
      <Card className="p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Event Image</h2>
          {imageLoading && (
            <div className="text-sm text-slate-500 flex items-center">
              <div className="w-4 h-4 mr-2 border-2 border-t-transparent border-slate-500 rounded-full animate-spin" />
              Processing...
            </div>
          )}
        </div>
        
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
        
        {imagePreview ? (
          <div className="relative">
            <div className="relative aspect-video w-full rounded-md overflow-hidden bg-slate-100 mb-3">
              <img 
                src={imagePreview}
                alt="Event preview" 
                className="w-full h-full object-cover"
              />
              
              <button
                onClick={handleRemoveImage}
                disabled={imageLoading || publishing}
                className="absolute top-2 right-2 bg-white bg-opacity-70 hover:bg-opacity-100 p-1.5 rounded-full text-red-500 hover:text-red-700 transition-colors"
                title="Remove image"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              This image will appear in Discord when the event is published
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-md bg-slate-50">
            <ImageIcon size={42} className="text-slate-300 mb-3" />
            <p className="mb-3 text-slate-500 text-center">
              Add an image to be shown with this event when published to Discord
            </p>
            <button
              onClick={triggerFileInput}
              disabled={imageLoading || publishing}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Upload size={16} />
              <span>Upload Image</span>
            </button>
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <p className="mt-3 text-xs text-slate-400">
              Supported formats: JPG, PNG, GIF (max 5MB)
            </p>
          </div>
        )}
      </Card>
      
      {/* Discord Integration Status */}
      <Card 
        id="discord-integration-card" 
        className={`p-4 mb-6 ${isPublished ? '' : 'hidden'}`}
      >
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Discord Integration</h2>
          <button 
            onClick={refreshEventData}
            disabled={refreshing}
            className="p-1 rounded hover:bg-slate-100 transition-colors"
            title="Refresh Discord status"
          >
            <RefreshCw size={16} 
              className={`text-slate-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="space-y-2">
          <div className="text-sm text-green-600 flex items-center">
            <Check size={16} className="mr-2" />
            This event has been published to Discord
          </div>
          <div className="text-xs text-slate-500">
            Discord attendance updates will appear in real-time
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Discord ID: {event.discordMessageId || event.discordEventId}
          </div>
        </div>
      </Card>
      
      {/* Publish to Discord Button */}
      <div className="mt-auto">
        {publishMessage && (
          <div 
            className={`p-3 mb-4 rounded-md ${publishMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {publishMessage.text}
          </div>
        )}
        
        <button
          id="publish-discord-btn"
          onClick={handlePublishToDiscord}
          disabled={publishing || isPublished}
          className={isPublished ? "published" : ""}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: isPublished ? '#2563EB' : 'rgb(255, 255, 255)',
            color: isPublished ? 'white' : 'rgb(100, 116, 139)',
            borderRadius: '8px',
            border: isPublished ? 'none' : '1px solid rgb(203, 213, 225)',
            cursor: isPublished ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            fontFamily: 'Inter',
            fontSize: '14px',
            fontWeight: 400,
            flex: '1 1 0%',
            margin: '0px 16px',
            whiteSpace: 'nowrap',
            minWidth: '150px',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            if (!isPublished && !publishing) {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }
          }}
          onMouseLeave={(e) => {
            if (!isPublished && !publishing) {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }
          }}
        >
          {publishing ? (
            <>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" 
                   style={{ borderColor: isPublished ? 'white' : 'rgb(100, 116, 139)', borderTopColor: 'transparent' }} />
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