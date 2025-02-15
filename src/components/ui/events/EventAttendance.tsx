import React from 'react';
import type { Event } from '../../../types/EventTypes';

interface EventAttendanceProps {
  event: Event | null;
}

const EventAttendance: React.FC<EventAttendanceProps> = ({ event }) => {
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
          Select an event to view attendance
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
      <h2 style={{
        fontSize: '20px',
        fontWeight: 600,
        color: '#0F172A',
        marginBottom: '16px'
      }}>
        Attendance
      </h2>

      {/* Accepted */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#16A34A',
          marginBottom: '8px'
        }}>
          Accepted ({event.attendance.accepted.length})
        </div>
        {event.attendance.accepted.map(pilot => (
          <div
            key={pilot.boardNumber}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px'
            }}
          >
            <span style={{ width: '62px', color: '#64748B' }}>
              {pilot.boardNumber}
            </span>
            <span style={{ fontWeight: 500 }}>
              {pilot.callsign}
            </span>
            {pilot.billet && (
              <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                {pilot.billet}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Declined */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#DC2626',
          marginBottom: '8px'
        }}>
          Declined ({event.attendance.declined.length})
        </div>
        {event.attendance.declined.map(pilot => (
          <div
            key={pilot.boardNumber}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px'
            }}
          >
            <span style={{ width: '62px', color: '#64748B' }}>
              {pilot.boardNumber}
            </span>
            <span style={{ fontWeight: 500 }}>
              {pilot.callsign}
            </span>
            {pilot.billet && (
              <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                {pilot.billet}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Tentative */}
      {event.attendance.tentative.length > 0 && (
        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: 500,
            color: '#F59E0B',
            marginBottom: '8px'
          }}>
            Tentative ({event.attendance.tentative.length})
          </div>
          {event.attendance.tentative.map(pilot => (
            <div
              key={pilot.boardNumber}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                borderRadius: '4px'
              }}
            >
              <span style={{ width: '62px', color: '#64748B' }}>
                {pilot.boardNumber}
              </span>
              <span style={{ fontWeight: 500 }}>
                {pilot.callsign}
              </span>
              {pilot.billet && (
                <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                  {pilot.billet}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventAttendance;