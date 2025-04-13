import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../card';
import { Check, Send, RefreshCw } from 'lucide-react';
import type { Event } from '../../../types/EventTypes';
import { publishEventToDiscord } from '../../../utils/discordService';
import { fetchEvents } from '../../../utils/supabaseClient';

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
  }, [event]);

  const handlePublishToDiscord = async () => {
    if (!event) return;
    
    console.log('[DEBUG] Publish button clicked for event:', { 
      id: event.id,
      title: event.title,
      discordMessageId: event.discordMessageId,
      discordEventId: event.discordEventId 
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
      const response = await publishEventToDiscord(event);
      
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