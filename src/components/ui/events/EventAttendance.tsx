import React, { useEffect, useState } from 'react';
import type { Event, Cycle } from '../../../types/EventTypes';
import QualificationBadge from '../QualificationBadge';
import { getPilotByDiscordOriginalId } from '../../../utils/pilotService';
import type { Pilot } from '../../../utils/pilotService';
import { fetchCycles } from '../../../utils/supabaseClient';
import { getPilotQualifications } from '../../../utils/qualificationService';

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
  pilotRecord?: Pilot | null;
}

// Enhanced pilot type with role information
interface EnhancedPilot extends Pilot {
  displayRole?: string;
}

const EventAttendance: React.FC<EventAttendanceProps> = ({ event }) => {
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);

  // Function to fetch attendance data from API
  const fetchAttendance = async (eventId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Show the header spinner
      const spinner = document.getElementById('attendance-loading-spinner');
      if (spinner) {
        spinner.style.opacity = '1';
      }
      
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

      // Fetch pilot records for each attendee with a discord_id
      const attendeeWithPilots = await Promise.all(
        formattedAttendance.map(async (attendee) => {
          if (attendee.discord_id) {
            const { data: pilotData } = await getPilotByDiscordOriginalId(attendee.discord_id);
            
            // Extract role information and fetch qualifications
            let enhancedPilot: EnhancedPilot | null = pilotData;
            if (enhancedPilot) {
              // Try to extract role name from joined role data or use billet as fallback
              const roleObject = enhancedPilot.roles as any;
              if (roleObject && typeof roleObject === 'object' && roleObject.name) {
                enhancedPilot.displayRole = roleObject.name;
              } else if (attendee.billet) {
                enhancedPilot.displayRole = attendee.billet;
              }
              
              // Fetch qualifications for this pilot
              const { data: qualificationsData } = await getPilotQualifications(enhancedPilot.id);
              if (qualificationsData) {
                // Map the qualification data to the expected format
                enhancedPilot.qualifications = qualificationsData.map((pq: any) => ({
                  id: pq.qualification?.id || '',
                  type: pq.qualification?.name || '',
                  dateAchieved: pq.date_achieved || ''
                }));
              } else {
                enhancedPilot.qualifications = [];
              }
            }
            
            return { ...attendee, pilotRecord: enhancedPilot };
          }
          return attendee;
        })
      );
      
      setAttendance(attendeeWithPilots);
    } catch (err) {
      console.error('Error fetching event attendance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch attendance');
      setAttendance([]);
    } finally {
      setLoading(false);
      
      // Hide the header spinner
      const spinner = document.getElementById('attendance-loading-spinner');
      if (spinner) {
        spinner.style.opacity = '0';
      }
    }
  };

  // Load cycles on component mount
  useEffect(() => {
    const loadCycles = async () => {
      try {
        const { cycles: fetchedCycles } = await fetchCycles();
        if (fetchedCycles) {
          setCycles(fetchedCycles);
        }
      } catch (error) {
        console.error('Failed to load cycles for qualification grouping:', error);
      }
    };
    loadCycles();
  }, []);

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

  // Separate attendees with and without pilot records, with qualification grouping
  const getAttendeesByStatus = (status: 'accepted' | 'declined' | 'tentative'): {
    attendeesWithPilots: AttendanceData[];
    attendeesWithoutPilots: AttendanceData[];
    qualificationGroups?: Record<string, AttendanceData[]>;
  } => {
    const attendeesWithPilots = attendance
      .filter(a => a.status === status && a.pilotRecord)
      .sort((a, b) => (a.pilotRecord?.boardNumber || 0) - (b.pilotRecord?.boardNumber || 0));
    
    const attendeesWithoutPilots = attendance
      .filter(a => a.status === status && !a.pilotRecord);

    // Check if qualification grouping is enabled
    const shouldGroupByQualifications = event?.eventSettings?.groupResponsesByQualification || 
                                        event?.trackQualifications || 
                                        (event?.eventType === 'Hop' || event?.cycleId && cycles.find(c => c.id === event.cycleId)?.type === 'Training');

    if (shouldGroupByQualifications && attendeesWithPilots.length > 0) {
      // Group by qualification based on event/cycle type
      const isTrainingEvent = event?.eventType === 'Hop' || 
                              (event?.cycleId && cycles.find(c => c.id === event.cycleId)?.type === 'Training');
      
      if (isTrainingEvent) {
        // Training events: Group by IP and Trainee
        const instructorPilots = attendeesWithPilots.filter(a => 
          a.pilotRecord?.qualifications?.some(q => q.type === 'Instructor Pilot')
        );
        
        const trainees = attendeesWithPilots.filter(a => 
          !a.pilotRecord?.qualifications?.some(q => q.type === 'Instructor Pilot')
        );

        return { 
          attendeesWithPilots: [], // Empty for standard display
          attendeesWithoutPilots,
          qualificationGroups: {
            'Instructor Pilots': instructorPilots,
            'Trainees': trainees
          }
        };
      } else {
        // Non-training events: Group by highest qualification
        const groupedByQual: Record<string, AttendanceData[]> = {};
        
        attendeesWithPilots.forEach(a => {
          if (!a.pilotRecord?.qualifications || a.pilotRecord.qualifications.length === 0) {
            if (!groupedByQual['No Qualifications']) groupedByQual['No Qualifications'] = [];
            groupedByQual['No Qualifications'].push(a);
            return;
          }
          
          // Priority order for grouping (highest to lowest) - excluding IP for non-training events
          const qualPriority = [
            'Mission Commander', 'Flight Lead', 'Section Lead', 'Wingman'
          ];
          
          // Find the highest priority qualification this pilot has (excluding Instructor Pilot)
          let highestQual = 'Wingman'; // Default to Wingman if no other qualifications found
          for (const qual of qualPriority) {
            if (a.pilotRecord.qualifications.some(q => q.type === qual)) {
              highestQual = qual;
              break;
            }
          }
          
          if (!groupedByQual[highestQual]) groupedByQual[highestQual] = [];
          groupedByQual[highestQual].push(a);
        });

        return { 
          attendeesWithPilots: [], // Empty for standard display
          attendeesWithoutPilots,
          qualificationGroups: groupedByQual
        };
      }
    }

    return { attendeesWithPilots, attendeesWithoutPilots };
  };

  // Render qualification group
  const renderQualificationGroup = (pilots: AttendanceData[], groupName: string, index: number) => {
    if (pilots.length === 0) return null;

    return (
      <div key={`${groupName}-${index}`} style={{ marginBottom: '16px' }}>
        <div style={{ 
          fontSize: '14px', 
          fontWeight: 500, 
          color: '#64748B',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '4px',
          marginBottom: '8px'
        }}>
          {groupName} ({pilots.length})
        </div>
        
        {pilots.map((pilot, pilotIndex) => (
          <div
            key={`${groupName}-${pilot.discord_id || pilotIndex}-${pilot.callsign}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '24px',
              marginBottom: '10px',
              borderRadius: '8px',
              padding: '0 10px',
              backgroundColor: pilotIndex % 2 === 0 ? '#F8FAFC' : 'transparent',
            }}
          >
            <span style={{
              width: '62px',
              textAlign: 'center',
              fontSize: '16px',
              fontWeight: 400,
              color: '#646F7E'
            }}>
              {pilot.pilotRecord?.boardNumber}
            </span>
            <span style={{
              width: '120px',
              fontSize: '16px',
              fontWeight: 700
            }}>
              {pilot.pilotRecord?.callsign || pilot.callsign}
            </span>
            <span style={{
              fontSize: '16px',
              fontWeight: 300,
              color: '#646F7E'
            }}>
              {(pilot.pilotRecord as EnhancedPilot)?.displayRole || ''}
            </span>
            
            {/* Qualification badges */}
            <div style={{
              display: 'flex',
              gap: '4px',
              marginLeft: 'auto',
              height: '24px'
            }}>
              {pilot.pilotRecord?.qualifications?.map((qual, qualIndex) => (
                <QualificationBadge 
                  key={`${qual.type}-${qualIndex}`} 
                  type={qual.type as any}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // If no event is selected
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
          Select an event to view attendance
        </div>
      </div>
    );
  }

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
      )}      {/* Accepted */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 15px',          backgroundColor: '#ECFDF5',
          borderLeft: '4px solid #57F287',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>          <span style={{ fontWeight: 600, color: '#57F287' }}>Accepted</span>
          <span style={{ 
            backgroundColor: '#57F287', 
            color: 'white', 
            borderRadius: '9999px',
            padding: '2px 8px',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            {attendance.filter(pilot => pilot.status === 'accepted').length}
          </span>
        </div>
        
        {/* Pilots with records - either grouped by qualification or standard list */}
        {(() => {
          const statusData = getAttendeesByStatus('accepted');
          
          // If qualification groups exist, render them
          if (statusData.qualificationGroups) {
            return Object.entries(statusData.qualificationGroups).map(([groupName, pilots], index) =>
              renderQualificationGroup(pilots, groupName, index)
            );
          }
          
          // Otherwise render standard list
          return statusData.attendeesWithPilots.map((pilot, index) => (
            <div
              key={`accepted-${pilot.discord_id || index}-${pilot.callsign}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '24px',
                marginBottom: '10px',
                borderRadius: '8px',
                padding: '0 10px',
                backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
              }}
            >
              <span style={{
                width: '62px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: 400,
                color: '#646F7E'
              }}>
                {pilot.pilotRecord?.boardNumber}
              </span>
              <span style={{
                width: '120px',
                fontSize: '16px',
                fontWeight: 700
              }}>
                {pilot.pilotRecord?.callsign || pilot.callsign}
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 300,
                color: '#646F7E'
              }}>
                {(pilot.pilotRecord as EnhancedPilot)?.displayRole || ''}
              </span>
              
              {/* Qualification badges */}
              <div style={{
                display: 'flex',
                gap: '4px',
                marginLeft: 'auto',
                height: '24px'
              }}>
                {pilot.pilotRecord?.qualifications?.map((qual, index) => (
                  <QualificationBadge 
                    key={`${qual.type}-${index}`} 
                    type={qual.type as any}
                  />
                ))}
              </div>
            </div>
          ));
        })()}

        {/* No matching pilot record section */}
        {getAttendeesByStatus('accepted').attendeesWithoutPilots.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 500, 
              color: '#64748B',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '4px',
              marginBottom: '8px'
            }}>
              No Matching Pilot Record
            </div>
            
            {getAttendeesByStatus('accepted').attendeesWithoutPilots.map((pilot, index) => (
              <div
                key={`accepted-no-record-${pilot.discord_id || index}-${pilot.callsign}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {pilot.callsign}
                </span>
              </div>
            ))}
          </div>
        )}

        {attendance.filter(pilot => pilot.status === 'accepted').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No attendees yet</div>
        )}
      </div>

      {/* Tentative */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 15px',          backgroundColor: '#EDEEFF',
          borderLeft: '4px solid #5865F2',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>          <span style={{ fontWeight: 600, color: '#5865F2' }}>Tentative</span>
          <span style={{ 
            backgroundColor: '#5865F2', 
            color: 'white', 
            borderRadius: '9999px',
            padding: '2px 8px',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            {attendance.filter(pilot => pilot.status === 'tentative').length}
          </span>
        </div>
        
        {/* Pilots with records - either grouped by qualification or standard list */}
        {(() => {
          const statusData = getAttendeesByStatus('tentative');
          
          // If qualification groups exist, render them
          if (statusData.qualificationGroups) {
            return Object.entries(statusData.qualificationGroups).map(([groupName, pilots], index) =>
              renderQualificationGroup(pilots, groupName, index)
            );
          }
          
          // Otherwise render standard list
          return statusData.attendeesWithPilots.map((pilot, index) => (
            <div
              key={`tentative-${pilot.discord_id || index}-${pilot.callsign}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '24px',
                marginBottom: '10px',
                borderRadius: '8px',
                padding: '0 10px',
                backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
              }}
            >
              <span style={{
                width: '62px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: 400,
                color: '#646F7E'
              }}>
                {pilot.pilotRecord?.boardNumber}
              </span>
              <span style={{
                width: '120px',
                fontSize: '16px',
                fontWeight: 700
              }}>
                {pilot.pilotRecord?.callsign || pilot.callsign}
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 300,
                color: '#646F7E'
              }}>
                {(pilot.pilotRecord as EnhancedPilot)?.displayRole || ''}
              </span>
              
              {/* Qualification badges */}
              <div style={{
                display: 'flex',
                gap: '4px',
                marginLeft: 'auto',
                height: '24px'
              }}>
                {pilot.pilotRecord?.qualifications?.map((qual, index) => (
                  <QualificationBadge 
                    key={`${qual.type}-${index}`} 
                    type={qual.type as any}
                  />
                ))}
              </div>
            </div>
          ));
        })()}

        {/* No matching pilot record section */}
        {getAttendeesByStatus('tentative').attendeesWithoutPilots.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 500, 
              color: '#64748B',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '4px',
              marginBottom: '8px'
            }}>
              No Matching Pilot Record
            </div>
            
            {getAttendeesByStatus('tentative').attendeesWithoutPilots.map((pilot, index) => (
              <div
                key={`tentative-no-record-${pilot.discord_id || index}-${pilot.callsign}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {pilot.callsign}
                </span>
              </div>
            ))}
          </div>
        )}

        {attendance.filter(pilot => pilot.status === 'tentative').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No tentative responses</div>
        )}
      </div>

      {/* Declined */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 15px',          backgroundColor: '#FEF2F2',
          borderLeft: '4px solid #ED4245',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>          <span style={{ fontWeight: 600, color: '#ED4245' }}>Declined</span>
          <span style={{ 
            backgroundColor: '#ED4245', 
            color: 'white', 
            borderRadius: '9999px',
            padding: '2px 8px',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            {attendance.filter(pilot => pilot.status === 'declined').length}
          </span>
        </div>
        
        {/* Pilots with records - either grouped by qualification or standard list */}
        {(() => {
          const statusData = getAttendeesByStatus('declined');
          
          // If qualification groups exist, render them
          if (statusData.qualificationGroups) {
            return Object.entries(statusData.qualificationGroups).map(([groupName, pilots], index) =>
              renderQualificationGroup(pilots, groupName, index)
            );
          }
          
          // Otherwise render standard list
          return statusData.attendeesWithPilots.map((pilot, index) => (
            <div
              key={`declined-${pilot.discord_id || index}-${pilot.callsign}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '24px',
                marginBottom: '10px',
                borderRadius: '8px',
                padding: '0 10px',
                backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
              }}
            >
              <span style={{
                width: '62px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: 400,
                color: '#646F7E'
              }}>
                {pilot.pilotRecord?.boardNumber}
              </span>
              <span style={{
                width: '120px',
                fontSize: '16px',
                fontWeight: 700
              }}>
                {pilot.pilotRecord?.callsign || pilot.callsign}
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 300,
                color: '#646F7E'
              }}>
                {(pilot.pilotRecord as EnhancedPilot)?.displayRole || ''}
              </span>
              
              {/* Qualification badges */}
              <div style={{
                display: 'flex',
                gap: '4px',
                marginLeft: 'auto',
                height: '24px'
              }}>
                {pilot.pilotRecord?.qualifications?.map((qual, index) => (
                  <QualificationBadge 
                    key={`${qual.type}-${index}`} 
                    type={qual.type as any}
                  />
                ))}
              </div>
            </div>
          ));
        })()}

        {/* No matching pilot record section */}
        {getAttendeesByStatus('declined').attendeesWithoutPilots.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 500, 
              color: '#64748B',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '4px',
              marginBottom: '8px'
            }}>
              No Matching Pilot Record
            </div>
            
            {getAttendeesByStatus('declined').attendeesWithoutPilots.map((pilot, index) => (
              <div
                key={`declined-no-record-${pilot.discord_id || index}-${pilot.callsign}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {pilot.callsign}
                </span>
              </div>
            ))}
          </div>
        )}

        {attendance.filter(pilot => pilot.status === 'declined').length === 0 && (
          <div style={{ color: '#94A3B8', padding: '8px' }}>No declined responses</div>
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