import React from 'react';
import { Card } from '../card';
import type { Event } from '../../../types/EventTypes';

interface MissionDetailsProps {
  width: string;
}

const MissionDetails: React.FC<MissionDetailsProps> = ({ width }) => {
  // TODO: Get events from context/API
  const events: Event[] = [];

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px',
      width
    }}>
      {/* Mission Details Card */}
      <Card 
        style={{
          flex: 1,
          width: '100%',
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
        <h2 className="text-lg font-semibold mb-4">Mission Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-500 block mb-1">Event</label>
            <select 
              className="w-full p-2 border rounded-md"
              defaultValue=""
            >
              <option value="" disabled>Select an event</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-500 block mb-1">Mission Objective</label>
            <textarea 
              className="w-full p-2 border rounded-md h-24" 
              placeholder="Enter mission objective"
            />
          </div>
          <div>
            <label className="text-sm text-slate-500 block mb-1">Available Assets</label>
            <textarea 
              className="w-full p-2 border rounded-md h-24" 
              placeholder="List available assets"
            />
          </div>
        </div>
      </Card>

      {/* Tasking & Roles Card */}
      <Card 
        style={{
          flex: 1,
          width: '100%',
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
        <h2 className="text-lg font-semibold mb-4">Tasking & Roles</h2>
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          {/* Task list will go here - styled like squadron roster list */}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '18px',
          position: 'relative',
          zIndex: 5
        }}>
          <button
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
        </div>
      </Card>
    </div>
  );
};

export default MissionDetails;