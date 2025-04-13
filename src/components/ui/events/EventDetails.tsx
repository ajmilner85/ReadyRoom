import React, { useState } from 'react';
import { Card } from '../card';
import type { Event } from '../../../types/EventTypes';
import { publishEventToDiscord } from '../../../utils/discordService';

interface EventDetailsProps {
  event: Event | null;
}

const EventDetails: React.FC<EventDetailsProps> = ({ event }) => {
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handlePublishToDiscord = async () => {
    if (!event) return;
    
    setPublishing(true);
    setPublishMessage(null);
    
    try {
      const response = await publishEventToDiscord(event);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to publish event to Discord');
      }
      
      // The server has already updated the discord_event_id in the database,
      // so we don't need to call updateEventDiscordId here
      
      setPublishMessage({
        type: 'success',
        text: 'Event successfully published to Discord!'
      });
      
      // Clear the success message after 5 seconds
      setTimeout(() => {
        setPublishMessage(null);
      }, 5000);
    } catch (error) {
      console.error('Failed to publish to Discord:', error);
      setPublishMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setPublishing(false);
    }
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
            <div className="text-sm text-slate-500">Date & Time</div>
            <div className="font-medium">
              {new Date(event.datetime).toLocaleString()}
            </div>
          </div>
          {event.restrictedTo && (
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
      {event.discordMessageId && (
        <Card className="p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Discord Integration</h2>
          <div className="space-y-2">
            <div className="text-sm text-green-600 flex items-center">
              ✓ This event has been published to Discord
            </div>
            <div className="text-xs text-slate-500">
              Discord attendance updates will appear in real-time
            </div>
          </div>
        </Card>
      )}
      
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
          onClick={handlePublishToDiscord}
          disabled={publishing || !!event.discordMessageId}
          className={`w-full py-2 px-4 rounded-md transition-colors ${
            publishing 
            ? 'bg-indigo-300 cursor-not-allowed' 
            : event.discordMessageId
              ? 'bg-slate-300 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {publishing 
            ? 'Publishing...' 
            : event.discordMessageId 
              ? 'Already Published' 
              : 'Publish to Discord'}
        </button>
        {event.discordMessageId && (
          <div className="text-center mt-2 text-xs text-slate-500">
            This event has already been published to Discord
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetails;