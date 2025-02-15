import React from 'react';
import { Card } from '../card';
import type { Event } from '../../../types/EventTypes';

interface EventDetailsProps {
  event: Event | null;
}

const EventDetails: React.FC<EventDetailsProps> = ({ event }) => {
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

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Description</h2>
        <div className="whitespace-pre-wrap text-slate-600">
          {event.description}
        </div>
      </Card>
    </div>
  );
};

export default EventDetails;