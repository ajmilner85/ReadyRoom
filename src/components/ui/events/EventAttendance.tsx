import React, { useEffect, useState } from 'react';
import type { Event } from '../../../types/EventTypes';

interface EventAttendanceProps {
  event: Event | null;
}

// Updated structure to match server response format
interface AttendanceResponse {
  accepted: AttendeeInfo[];
  declined: AttendeeInfo[];
  tentative: AttendeeInfo[];
  note?: string;
}

interface AttendeeInfo {
  boardNumber?: string;
  callsign: string;
  discord_id?: string;
  billet?: string;
}

// Formatted type for display with status
interface AttendanceData {
  boardNumber?: string;
  callsign: string;
  status: 'accepted' | 'declined' | 'tentative';
  billet?: string;
  discord_id?: string;
}

const EventAttendance: React.FC<EventAttendanceProps> = ({ event }) => {
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Function to fetch attendance data from API
  const fetchAttendance = async (eventId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`http://localhost:3001/api/events/${eventId}/attendance`);
      if (!response.ok) {
        throw new Error(`Failed to fetch attendance: ${response.statusText}`);
      }
      
      const data: AttendanceResponse = await response.json();
      
      // If there's a note about no Discord message ID, show it as an error
      if (data.note) {
        setError(data.note);
        setAttendance([]);
        return;
      }
      
      // Transform the attendance data into a flat array with status
      const formattedAttendance: AttendanceData[] = [
        ...data.accepted.map(attendee => ({ ...attendee, status: 'accepted' as const })),
        ...data.declined.map(attendee => ({ ...attendee, status: 'declined' as const })),
        ...data.tentative.map(attendee => ({ ...attendee, status: 'tentative' as const }))
      ];
      
      setAttendance(formattedAttendance);
    } catch (err) {
      console.error('Error fetching event attendance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch attendance');
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  // Start polling when event changes
  useEffect(() => {
    // Clear existing interval if any
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    // If there's an event, fetch attendance and set up polling
    if (event?.id) {
      // Fetch attendance immediately
      fetchAttendance(event.id);
      
      // Set up polling every 5 seconds
      const interval = setInterval(() => {
        fetchAttendance(event.id);
      }, 5000); // 5 seconds
      
      setPollInterval(interval);
    }
    
    // Cleanup on unmount or when event changes
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [event?.id]);

  // If no event is selected
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
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center'
      }}>
        Attendance
        {loading && (
          <div style={{ 
            width: '16px', 
            height: '16px', 
            border: '2px solid #E2E8F0', 
            borderTopColor: '#3B82F6', 
            borderRadius: '50%', 
            marginLeft: '8px',
            animation: 'spin 1s linear infinite'
          }} />
        )}
      </h2>
      
      {error && (
        <div style={{ 
          padding: '8px 12px',
          backgroundColor: '#FEE2E2',
          color: '#B91C1C',
          borderRadius: '4px',
          fontSize: '14px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* Accepted */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#16A34A',
          marginBottom: '8px'
        }}>
          Accepted ({attendance.filter(pilot => pilot.status === 'accepted').length})
        </div>
        {attendance.filter(pilot => pilot.status === 'accepted').map((pilot, index) => (
          <div
            key={`accepted-${pilot.discord_id || index}-${pilot.callsign}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
            }}
          >
            <span style={{ width: '62px', color: '#64748B' }}>
              {pilot.boardNumber}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>
                {pilot.callsign}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Discord Username
              </span>
            </div>
            {pilot.billet && (
              <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                {pilot.billet}
              </span>
            )}
          </div>
        ))}
        {attendance.filter(pilot => pilot.status === 'accepted').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No attendees yet</div>
        )}
      </div>

      {/* Declined */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#DC2626',
          marginBottom: '8px'
        }}>
          Declined ({attendance.filter(pilot => pilot.status === 'declined').length})
        </div>
        {attendance.filter(pilot => pilot.status === 'declined').map((pilot, index) => (
          <div
            key={`declined-${pilot.discord_id || index}-${pilot.callsign}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
            }}
          >
            <span style={{ width: '62px', color: '#64748B' }}>
              {pilot.boardNumber}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>
                {pilot.callsign}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Discord Username
              </span>
            </div>
            {pilot.billet && (
              <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                {pilot.billet}
              </span>
            )}
          </div>
        ))}
        {attendance.filter(pilot => pilot.status === 'declined').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No declined responses</div>
        )}
      </div>

      {/* Tentative */}
      <div>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#F59E0B',
          marginBottom: '8px'
        }}>
          Tentative ({attendance.filter(pilot => pilot.status === 'tentative').length})
        </div>
        {attendance.filter(pilot => pilot.status === 'tentative').map((pilot, index) => (
          <div
            key={`tentative-${pilot.discord_id || index}-${pilot.callsign}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
            }}
          >
            <span style={{ width: '62px', color: '#64748B' }}>
              {pilot.boardNumber}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>
                {pilot.callsign}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Discord Username
              </span>
            </div>
            {pilot.billet && (
              <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '14px' }}>
                {pilot.billet}
              </span>
            )}
          </div>
        ))}
        {attendance.filter(pilot => pilot.status === 'tentative').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No tentative responses</div>
        )}
      </div>
      
      {/* Add keyframes for loading spinner animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

export default EventAttendance;