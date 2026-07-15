import React, { useEffect, useRef, useState } from 'react';
import type { Event, Cycle, EventActivity } from '../../../types/EventTypes';
import QualificationBadge from '../QualificationBadge';
import { getPilotByDiscordId } from '../../../utils/pilotService';
import type { Pilot } from '../../../utils/pilotTypes';
import { supabase, fetchCycles, getEventActivities, getEventActivityParticipantsForEvent, setPilotActivityAssignment } from '../../../utils/supabaseClient';
import { getBatchPilotQualifications, getAllQualifications } from '../../../utils/qualificationService';
import { getCycleEnrollments } from '../../../utils/trainingEnrollmentService';
import { getUserSettings } from '../../../utils/userSettingsService';

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
  pilotRecord?: EnhancedPilot | null;
}

// Enhanced pilot type with role information and qualifications attached at runtime
interface EnhancedPilot extends Pilot {
  displayRole?: string;
  qualifications?: { id: string; type: string; dateAchieved: string }[];
}

const EventAttendance: React.FC<EventAttendanceProps> = ({ event }) => {
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Tracks the currently displayed event so in-flight responses from a
  // previously selected event can't overwrite the list
  const activeEventIdRef = useRef<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [qualificationConfigs, setQualificationConfigs] = useState<any[]>([]);
  const [enrolledTraineePilotIds, setEnrolledTraineePilotIds] = useState<Set<string>>(new Set());

  // Event Activities (developer-flagged). When the flag is off or the event has
  // no activity rows, grouping behaves exactly as before.
  const [activitiesEnabled, setActivitiesEnabled] = useState(false);
  const [eventActivities, setEventActivities] = useState<EventActivity[]>([]);
  const [lessonMissionNames, setLessonMissionNames] = useState<Record<string, string>>({});
  const [activityOverrides, setActivityOverrides] = useState<Record<string, string>>({}); // pilotId -> activityId

  // Load qualification configs once on component mount
  useEffect(() => {
    const loadQualificationConfigs = async () => {
      try {
        const { data } = await getAllQualifications();
        if (data) {
          setQualificationConfigs(data);
        }
      } catch (error) {
        console.error('Failed to load qualification configs:', error);
      }
    };
    
    loadQualificationConfigs();
  }, []);

  // Event Activities: read the developer feature flag once on mount
  useEffect(() => {
    let cancelled = false;
    getUserSettings().then(result => {
      if (!cancelled && result.success && result.data?.developer?.enableEventActivities) {
        setActivitiesEnabled(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Event Activities: load activities + explicit assignments when the event changes
  useEffect(() => {
    if (!activitiesEnabled || !event?.id) {
      setEventActivities([]);
      setActivityOverrides({});
      setLessonMissionNames({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      const eventId = event.id;
      const { activities, error } = await getEventActivities(eventId);
      if (cancelled || error) return;
      setEventActivities(activities);

      // Resolve lesson activity display names
      const missionIds = activities
        .filter(a => a.kind === 'lesson' && a.syllabusMissionId)
        .map(a => a.syllabusMissionId as string);
      if (missionIds.length > 0) {
        const { data: missions } = await supabase
          .from('training_syllabus_missions')
          .select('id, mission_number, mission_name')
          .in('id', missionIds);
        if (!cancelled && missions) {
          const names: Record<string, string> = {};
          missions.forEach((m: any) => {
            names[m.id] = m.mission_number != null
              ? `Mission ${m.mission_number}: ${m.mission_name}`
              : m.mission_name;
          });
          setLessonMissionNames(names);
        }
      } else {
        setLessonMissionNames({});
      }

      const { participants } = await getEventActivityParticipantsForEvent(eventId);
      if (!cancelled) {
        const overrides: Record<string, string> = {};
        participants.forEach(p => { overrides[p.pilotId] = p.eventActivityId; });
        setActivityOverrides(overrides);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activitiesEnabled, event?.id]);

  // Event Activities: display name for a group header
  const getActivityDisplayName = (activity: EventActivity): string => {
    if (activity.label) return activity.label;
    if (activity.kind === 'lesson' && activity.syllabusMissionId) {
      return lessonMissionNames[activity.syllabusMissionId] || 'Syllabus Lesson';
    }
    if (activity.kind === 'qualification' && activity.qualificationId) {
      const qual = qualificationConfigs.find(q => q.id === activity.qualificationId);
      return qual ? `${qual.name} Pursuit` : 'Qualification Pursuit';
    }
    return 'Objectives';
  };

  // Event Activities: change a pilot's explicit assignment ('' = back to Auto)
  const handleAssignPilotToActivity = async (pilotId: string, activityId: string) => {
    if (!event?.id) return;
    const previous = activityOverrides;
    setActivityOverrides(prev => {
      const next = { ...prev };
      if (activityId) next[pilotId] = activityId; else delete next[pilotId];
      return next;
    });
    const { error: assignError } = await setPilotActivityAssignment(event.id, pilotId, activityId || null);
    if (assignError) {
      console.error('Failed to save activity assignment:', assignError);
      setActivityOverrides(previous);
    }
  };

  // Function to fetch attendance data from API
  const fetchAttendance = async (eventId: string) => {
    // Don't clear previous attendance - let it persist while loading new data
    setError(null);
    try {
      setError(null);
      
      // Show the header spinner
      const spinner = document.getElementById('attendance-loading-spinner');
      if (spinner) {
        spinner.style.opacity = '1';
      }
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${eventId}/attendance`);
      if (!response.ok) {
        throw new Error(`Failed to fetch attendance: ${response.statusText}`);
      }
      
      const data: AttendanceResponse = await response.json();

      // Ignore responses that arrive after the user switched to another event
      if (activeEventIdRef.current !== eventId) {
        return;
      }

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

      // First pass: fetch all pilot records
      const attendeeWithPilotRecords = await Promise.all(
        formattedAttendance.map(async (attendee) => {
          if (attendee.discord_id) {
            const { data: pilotData } = await getPilotByDiscordId(attendee.discord_id);
            
            // Extract role information
            let enhancedPilot: EnhancedPilot | null = pilotData as unknown as EnhancedPilot;
            if (enhancedPilot) {
              // Try to extract role name from joined role data or use billet as fallback
              const roleObject = enhancedPilot.roles as any;
              if (roleObject && typeof roleObject === 'object' && roleObject.name) {
                enhancedPilot.displayRole = roleObject.name;
              } else if (attendee.billet) {
                enhancedPilot.displayRole = attendee.billet;
              }
            }
            
            return { ...attendee, pilotRecord: enhancedPilot };
          }
          return attendee;
        })
      );

      // Set attendance immediately without qualifications for fast initial render
      if (activeEventIdRef.current !== eventId) {
        return;
      }
      setAttendance(attendeeWithPilotRecords);

      // Load qualifications in the background and update
      const pilotIds = attendeeWithPilotRecords
        .filter(attendee => attendee.pilotRecord?.id)
        .map(attendee => attendee.pilotRecord!.id);
      
      if (pilotIds.length > 0) {
        try {
          // Try batch loading with a timeout
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Batch qualification fetch timed out')), 3000)
          );
          
          const batchQualifications = await Promise.race([
            getBatchPilotQualifications(pilotIds),
            timeoutPromise
          ]);
          
          // Update attendance with qualification data
          const attendeeWithQualifications = attendeeWithPilotRecords.map(attendee => {
            if (attendee.pilotRecord?.id) {
              const qualificationsData = batchQualifications[attendee.pilotRecord.id] || [];
              attendee.pilotRecord.qualifications = qualificationsData.map((pq: any) => ({
                id: pq.qualification?.id || '',
                type: pq.qualification?.name || '',
                dateAchieved: pq.date_achieved || ''
              }));
            }
            return attendee;
          });

          if (activeEventIdRef.current === eventId) {
            setAttendance(attendeeWithQualifications);
          }
        } catch (error) {
          console.warn('EventAttendance: Batch qualification loading failed:', error);
          // Don't fall back to individual calls to avoid the slow loading issue
          // Just leave qualifications empty rather than showing the progressive loading
        }
      }
    } catch (err) {
      console.error('Error fetching event attendance:', err);
      if (activeEventIdRef.current === eventId) {
        setError(err instanceof Error ? err.message : 'Failed to fetch attendance');
        setAttendance([]);
      }
    } finally {
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

  // Load enrolled trainees when event's cycle changes
  useEffect(() => {
    const loadEnrolledTrainees = async () => {
      if (!event?.cycleId) {
        setEnrolledTraineePilotIds(new Set());
        return;
      }

      const cycle = cycles.find(c => c.id === event.cycleId);
      if (cycle?.type !== 'Training') {
        setEnrolledTraineePilotIds(new Set());
        return;
      }

      try {
        const enrollments = await getCycleEnrollments(event.cycleId);
        const enrolledIds = new Set(enrollments.map(e => e.pilot_id));
        setEnrolledTraineePilotIds(enrolledIds);
      } catch (error) {
        console.error('Failed to load training enrollments:', error);
        setEnrolledTraineePilotIds(new Set());
      }
    };

    loadEnrolledTrainees();
  }, [event?.cycleId, cycles]);

  // Start polling when event changes. The interval handle lives in the effect
  // closure (NOT in state) - storing it in state made the cleanup read a stale
  // value, leaking a poller on every unmount/HMR remount that kept overwriting
  // the list with a previously selected event's attendance.
  useEffect(() => {
    activeEventIdRef.current = event?.id || null;

    if (!event?.id) return;

    const eventId = event.id;

    // Fetch attendance immediately, then poll every 5 seconds
    fetchAttendance(eventId);
    const interval = setInterval(() => {
      fetchAttendance(eventId);
    }, 5000);

    // Cleanup on unmount or when event changes
    return () => clearInterval(interval);
  }, [event?.id]);

  // Sort qualification groups based on event type
  const sortQualificationGroups = (groups: [string, AttendanceData[]][]) => {
    // Activity grouping builds groups already in display order (activity
    // display_order); re-sorting by name/qualification would scramble it
    if (activitiesEnabled && eventActivities.length > 0) {
      return groups;
    }

    const isTrainingEvent = event?.eventType === 'Hop' ||
                            (event?.cycleId && cycles.find(c => c.id === event.cycleId)?.type === 'Training');

    return groups.sort(([nameA], [nameB]) => {
      if (isTrainingEvent) {
        // Custom order: Instructor Pilots → Trainee → Squadron groups (alphabetical)
        if (nameA === 'Instructor Pilots') return -1;
        if (nameB === 'Instructor Pilots') return 1;
        if (nameA === 'Trainee') return -1;
        if (nameB === 'Trainee') return 1;
        // Both are squadron names, sort alphabetically
        return nameA.localeCompare(nameB);
      }

      // For non-training events, sort by qualification order
      const qualA = qualificationConfigs.find(q => q.name === nameA);
      const qualB = qualificationConfigs.find(q => q.name === nameB);
      return (qualA?.order ?? 999) - (qualB?.order ?? 999);
    });
  };

  // Separate attendees with and without pilot records, with qualification grouping
  const getAttendeesByStatus = (status: 'accepted' | 'declined' | 'tentative'): {
    attendeesWithPilots: AttendanceData[];
    attendeesWithoutPilots: AttendanceData[];
    qualificationGroups?: Record<string, AttendanceData[]>;
  } => {
    const attendeesWithPilots = attendance
      .filter(a => a.status === status && a.pilotRecord)
      .sort((a, b) => Number(a.pilotRecord?.boardNumber || 0) - Number(b.pilotRecord?.boardNumber || 0));
    
    const attendeesWithoutPilots = attendance
      .filter(a => a.status === status && !a.pilotRecord);

    // Event Activities (flag-gated): group by what each pilot is doing.
    // Explicit override wins; otherwise IPs group together, cycle enrollees go
    // to the first lesson activity, and everyone else groups by squadron.
    if (activitiesEnabled && eventActivities.length > 0 && attendeesWithPilots.length > 0) {
      const instructorPilots: AttendanceData[] = [];
      const activityGroups: Record<string, AttendanceData[]> = {};
      eventActivities.forEach(a => { if (a.id) activityGroups[a.id] = []; });
      const firstLesson = eventActivities.find(a => a.kind === 'lesson' && a.id);

      const squadronGroups: Record<string, AttendanceData[]> = {};
      const squadronDesignations: Record<string, string> = {};

      attendeesWithPilots.forEach(attendee => {
        const pilotId = attendee.pilotRecord?.id;

        // 1. Explicit organizer override
        const overrideActivityId = pilotId ? activityOverrides[pilotId] : undefined;
        if (overrideActivityId && activityGroups[overrideActivityId]) {
          activityGroups[overrideActivityId].push(attendee);
          return;
        }

        // 2. Instructor Pilots group together
        if (attendee.pilotRecord?.qualifications?.some((q: any) => q.type === 'Instructor Pilot')) {
          instructorPilots.push(attendee);
          return;
        }

        // 3. Cycle enrollees are inferred onto the first lesson activity
        if (pilotId && enrolledTraineePilotIds.has(pilotId) && firstLesson?.id) {
          activityGroups[firstLesson.id].push(attendee);
          return;
        }

        // 4. Everyone else groups by squadron (never key by tail code)
        const squadronId = attendee.pilotRecord?.currentSquadron?.id || 'no-squadron';
        const designation = attendee.pilotRecord?.currentSquadron?.designation || 'No Squadron';
        if (!squadronDesignations[squadronId]) squadronDesignations[squadronId] = designation;
        if (!squadronGroups[squadronId]) squadronGroups[squadronId] = [];
        squadronGroups[squadronId].push(attendee);
      });

      // Assemble in display order: IPs, activities (display_order), squadrons.
      // Suffix duplicate display names so groups can't collide in the record.
      const orderedGroups: Record<string, AttendanceData[]> = {};
      if (instructorPilots.length > 0) orderedGroups['Instructor Pilots'] = instructorPilots;
      eventActivities.forEach(activity => {
        if (!activity.id) return;
        let name = getActivityDisplayName(activity);
        while (name in orderedGroups) name = `${name} •`;
        orderedGroups[name] = activityGroups[activity.id];
      });
      Object.entries(squadronGroups)
        .sort(([idA], [idB]) => squadronDesignations[idA].localeCompare(squadronDesignations[idB]))
        .forEach(([squadronId, pilots]) => {
          let name = squadronDesignations[squadronId];
          while (name in orderedGroups) name = `${name} •`;
          orderedGroups[name] = pilots;
        });

      return {
        attendeesWithPilots: [],
        attendeesWithoutPilots,
        qualificationGroups: orderedGroups
      };
    }

    // Check if qualification grouping is enabled
    const shouldGroupByQualifications = event?.eventSettings?.groupResponsesByQualification ||
                                        event?.trackQualifications ||
                                        (event?.eventType === 'Hop' || event?.cycleId && cycles.find(c => c.id === event.cycleId)?.type === 'Training');

    if (shouldGroupByQualifications && attendeesWithPilots.length > 0) {
      // Group by qualification based on event/cycle type
      const isTrainingEvent = event?.eventType === 'Hop' || 
                              (event?.cycleId && cycles.find(c => c.id === event.cycleId)?.type === 'Training');
      
      if (isTrainingEvent) {
        // Training events: Group by IP, Enrolled Trainees, and Squadron
        const instructorPilots = attendeesWithPilots.filter(a =>
          a.pilotRecord?.qualifications?.some((q: any) => q.type === 'Instructor Pilot')
        );

        const enrolledTrainees = attendeesWithPilots.filter(a =>
          !a.pilotRecord?.qualifications?.some((q: any) => q.type === 'Instructor Pilot') &&
          a.pilotRecord?.id && enrolledTraineePilotIds.has(a.pilotRecord.id)
        );

        // Non-IP, non-enrolled pilots grouped by squadron
        const otherPilots = attendeesWithPilots.filter(a =>
          !a.pilotRecord?.qualifications?.some((q: any) => q.type === 'Instructor Pilot') &&
          (!a.pilotRecord?.id || !enrolledTraineePilotIds.has(a.pilotRecord.id))
        );

        // Group by squadron_id, but use designation as the key for display
        const squadronGroups: Record<string, AttendanceData[]> = {};
        const squadronDesignations: Record<string, string> = {}; // Map squadron_id → designation

        otherPilots.forEach(pilot => {
          const squadronId = pilot.pilotRecord?.currentSquadron?.id || 'no-squadron';
          const designation = pilot.pilotRecord?.currentSquadron?.designation || 'No Squadron';

          // Store the designation for this squadron_id
          if (!squadronDesignations[squadronId]) {
            squadronDesignations[squadronId] = designation;
          }

          if (!squadronGroups[squadronId]) squadronGroups[squadronId] = [];
          squadronGroups[squadronId].push(pilot);
        });

        // Convert squadron groups to use designation as keys for display
        const displayGroups: Record<string, AttendanceData[]> = {};
        Object.entries(squadronGroups).forEach(([squadronId, pilots]) => {
          const designation = squadronDesignations[squadronId];
          displayGroups[designation] = pilots;
        });

        return {
          attendeesWithPilots: [], // Empty for standard display
          attendeesWithoutPilots,
          qualificationGroups: {
            'Instructor Pilots': instructorPilots,
            'Trainee': enrolledTrainees,
            ...displayGroups
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
          
          // Find the highest priority qualification using the qualification order from database
          let highestQual = 'Wingman'; // Default
          let lowestOrder = 999;
          
          a.pilotRecord.qualifications.forEach((q: any) => {
            const qualConfig = qualificationConfigs.find(config => config.name === q.type);
            const qualOrder = qualConfig?.order ?? 999;
            
            if (qualOrder < lowestOrder) {
              lowestOrder = qualOrder;
              highestQual = q.type;
            }
          });
          
          if (!groupedByQual[highestQual]) groupedByQual[highestQual] = [];
          groupedByQual[highestQual].push(a);
        });

        // Sort pilots within each qualification group by standing, then role
        Object.keys(groupedByQual).forEach(qualKey => {
          groupedByQual[qualKey].sort((a, b) => {
            // First sort by standing order (lower order = higher priority)
            const standingA = a.pilotRecord?.currentStanding?.order ?? 999;
            const standingB = b.pilotRecord?.currentStanding?.order ?? 999;
            
            if (standingA !== standingB) {
              return standingA - standingB;
            }
            
            // Then sort by role order (billet)
            // Note: roles[0] is the assignment object, roles[0].roles is the nested role data from SQL join
            const roleA = (a.pilotRecord?.roles?.[0] as any)?.roles?.order ?? 999;
            const roleB = (b.pilotRecord?.roles?.[0] as any)?.roles?.order ?? 999;
            
            if (roleA !== roleB) {
              return roleA - roleB;
            }
            
            // Finally sort by board number as tie-breaker
            return Number(a.pilotRecord?.boardNumber || 0) - Number(b.pilotRecord?.boardNumber || 0);
          });
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

  // Render qualification group. countLabel overrides the "(n)" suffix and, when
  // provided, the group renders even with no pilots (used for Mission Support roles).
  const renderQualificationGroup = (pilots: AttendanceData[], groupName: string, index: number, countLabel?: string) => {
    if (pilots.length === 0 && countLabel === undefined) return null;

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
          {groupName} ({countLabel ?? pilots.length})
        </div>

        {pilots.length === 0 && (
          <div style={{ color: '#94A3B8', padding: '0 10px', fontSize: '14px' }}>
            None
          </div>
        )}

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
              {(() => {
                const hasQuals = pilot.pilotRecord?.qualifications && pilot.pilotRecord.qualifications.length > 0;
                const hasConfigs = qualificationConfigs.length > 0;

                // Only render badges if we have both pilot qualifications AND cached configs
                return hasQuals && hasConfigs && pilot.pilotRecord?.qualifications
                  ?.sort((a: any, b: any) => {
                    const qualA = qualificationConfigs.find(q => q.name === a.type);
                    const qualB = qualificationConfigs.find(q => q.name === b.type);
                    return (qualA?.order || 999) - (qualB?.order || 999);
                  })
                  ?.map((qual: any, qualIndex: number) => {
                  return (
                    <QualificationBadge
                      key={`${qual.type}-${qualIndex}`}
                      type={qual.type as any}
                      qualifications={qualificationConfigs}
                    />
                  );
                });
              })()}
            </div>

            {/* Event Activities: explicit assignment override (flag-gated).
                Hidden on Mission Support groups (countLabel) which are
                orthogonal to activities. */}
            {activitiesEnabled && eventActivities.length > 0 && countLabel === undefined && pilot.pilotRecord?.id && (
              <select
                value={activityOverrides[pilot.pilotRecord.id] || ''}
                onChange={(e) => handleAssignPilotToActivity(pilot.pilotRecord!.id, e.target.value)}
                title="Assign this pilot to an activity (Auto = inferred from enrollment/qualifications)"
                style={{
                  marginLeft: '8px',
                  maxWidth: '110px',
                  padding: '2px 4px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#64748B',
                  backgroundColor: '#FFFFFF',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <option value="">Auto</option>
                {eventActivities.filter(a => a.id).map(activity => (
                  <option key={activity.id} value={activity.id}>
                    {getActivityDisplayName(activity)}
                  </option>
                ))}
              </select>
            )}
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
            const sortedGroups = sortQualificationGroups(Object.entries(statusData.qualificationGroups));

            return sortedGroups.map(([groupName, pilots], index) =>
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
                {(() => {
                  const hasQuals = pilot.pilotRecord?.qualifications && pilot.pilotRecord.qualifications.length > 0;
                  const hasConfigs = qualificationConfigs.length > 0;

                  // Only render badges if we have both pilot qualifications AND cached configs
                  return hasQuals && hasConfigs && pilot.pilotRecord?.qualifications
                    ?.sort((a: any, b: any) => {
                      const qualA = qualificationConfigs.find(q => q.name === a.type);
                      const qualB = qualificationConfigs.find(q => q.name === b.type);
                      return (qualA?.order || 999) - (qualB?.order || 999);
                    })
                    ?.map((qual: any, index: number) => {
                    return (
                      <QualificationBadge
                        key={`${qual.type}-${index}`}
                        type={qual.type as any}
                        qualifications={qualificationConfigs}
                      />
                    );
                  });
                })()}
              </div>
            </div>
          ));
        })()}

        {/* Mission Support roles (accepted pilots only, in the event's configured order) */}
        {(() => {
          const requirements = event?.eventSettings?.supportRoleRequirements || [];
          if (requirements.length === 0) return null;

          const acceptedWithPilots = attendance.filter(a => a.status === 'accepted' && a.pilotRecord);

          let totalAvailable = 0;
          let totalRequired = 0;
          const roleGroups = requirements.map(req => {
            const required = Math.max(0, req.required || 0);
            // Match on qualification ID so renames don't break saved events;
            // fall back to name for records without an ID
            const pilots = acceptedWithPilots
              .filter(a => a.pilotRecord?.qualifications?.some((q: any) =>
                q.id ? q.id === req.qualificationId : q.type === req.name
              ))
              .sort((a, b) => Number(a.pilotRecord?.boardNumber || 0) - Number(b.pilotRecord?.boardNumber || 0));
            // Show the qualification's current name, not the one saved on the event
            const displayName = qualificationConfigs.find(c => c.id === req.qualificationId)?.name || req.name;
            totalAvailable += pilots.length;
            totalRequired += required;
            return { req, required, pilots, displayName };
          });

          return (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 15px',
                backgroundColor: '#F0F9FF',
                borderLeft: '4px solid #0EA5E9',
                borderRadius: '4px',
                marginBottom: '12px'
              }}>
                <span style={{ fontWeight: 600, color: '#0EA5E9' }}>Mission Support</span>
                <span style={{
                  backgroundColor: '#0EA5E9',
                  color: 'white',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  {totalAvailable}/{totalRequired}
                </span>
              </div>

              {roleGroups.map(({ required, pilots, displayName }, index) =>
                renderQualificationGroup(pilots, displayName, index, `${pilots.length}/${required}`)
              )}
            </div>
          );
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
            const sortedGroups = sortQualificationGroups(Object.entries(statusData.qualificationGroups));

            return sortedGroups.map(([groupName, pilots], index) =>
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
                {(() => {
                  const hasQuals = pilot.pilotRecord?.qualifications && pilot.pilotRecord.qualifications.length > 0;
                  const hasConfigs = qualificationConfigs.length > 0;

                  // Only render badges if we have both pilot qualifications AND cached configs
                  return hasQuals && hasConfigs && pilot.pilotRecord?.qualifications
                    ?.sort((a: any, b: any) => {
                      const qualA = qualificationConfigs.find(q => q.name === a.type);
                      const qualB = qualificationConfigs.find(q => q.name === b.type);
                      return (qualA?.order || 999) - (qualB?.order || 999);
                    })
                    ?.map((qual: any, index: number) => {
                    return (
                      <QualificationBadge
                        key={`${qual.type}-${index}`}
                        type={qual.type as any}
                        qualifications={qualificationConfigs}
                      />
                    );
                  });
                })()}
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
            const sortedGroups = sortQualificationGroups(Object.entries(statusData.qualificationGroups));

            return sortedGroups.map(([groupName, pilots], index) =>
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
                {(() => {
                  const hasQuals = pilot.pilotRecord?.qualifications && pilot.pilotRecord.qualifications.length > 0;
                  const hasConfigs = qualificationConfigs.length > 0;

                  // Only render badges if we have both pilot qualifications AND cached configs
                  return hasQuals && hasConfigs && pilot.pilotRecord?.qualifications
                    ?.sort((a: any, b: any) => {
                      const qualA = qualificationConfigs.find(q => q.name === a.type);
                      const qualB = qualificationConfigs.find(q => q.name === b.type);
                      return (qualA?.order || 999) - (qualB?.order || 999);
                    })
                    ?.map((qual: any, index: number) => {
                    return (
                      <QualificationBadge
                        key={`${qual.type}-${index}`}
                        type={qual.type as any}
                        qualifications={qualificationConfigs}
                      />
                    );
                  });
                })()}
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