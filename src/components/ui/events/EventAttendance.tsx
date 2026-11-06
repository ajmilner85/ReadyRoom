import React, { useEffect, useRef, useState } from 'react';
import type { Event, Cycle, EventActivity } from '../../../types/EventTypes';
import QualificationBadge from '../QualificationBadge';
import { EmptyState, SegmentedControl, Toast } from '../primitives';
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

      // Resolve lesson activity display names using the canonical
      // "Syllabus - Week N - Mission" format (matches the Discord post headers)
      const missionIds = activities
        .filter(a => a.kind === 'lesson' && a.syllabusMissionId)
        .map(a => a.syllabusMissionId as string);
      if (missionIds.length > 0) {
        const { data: missions } = await supabase
          .from('training_syllabus_missions')
          .select('id, mission_name, week_number, training_syllabi(name)')
          .in('id', missionIds);
        if (!cancelled && missions) {
          const names: Record<string, string> = {};
          missions.forEach((m: any) => {
            const syllabusName = m.training_syllabi?.name;
            const weekPart = m.week_number != null ? `Week ${m.week_number} - ` : '';
            names[m.id] = `${syllabusName ? `${syllabusName} - ` : ''}${weekPart}${m.mission_name}`;
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

  const [statusView, setStatusView] = useState<'accepted' | 'tentative' | 'declined'>('accepted');

  // ---- Presentation: one status at a time, groups as cards in a responsive multi-column grid ----
  const renderPilotRow = (pilot: AttendanceData, key: string, showOverride: boolean) => {
    const rec = pilot.pilotRecord as EnhancedPilot | undefined;
    const quals = (rec?.qualifications || []).slice().sort((a: any, b: any) => {
      const qa = qualificationConfigs.find(q => q.name === a.type);
      const qb = qualificationConfigs.find(q => q.name === b.type);
      return (qa?.order || 999) - (qb?.order || 999);
    });
    return (
      <div key={key} className="flex items-center gap-[10px] px-3 py-[7px] hover:bg-panel2">
        <span className="flex-none w-[34px] font-mono text-[12.5px] font-semibold text-text2">{rec?.boardNumber || '—'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-text truncate">{rec?.callsign || pilot.callsign}</div>
          {rec?.displayRole ? <div className="text-[11px] text-text3 truncate">{rec.displayRole}</div> : null}
        </div>
        {qualificationConfigs.length > 0 && quals.length > 0 ? (
          <div className="flex-none flex items-center gap-[3px] flex-wrap justify-end max-w-[55%]">
            {quals.map((qual: any, qi: number) => (
              <QualificationBadge key={`${qual.type}-${qi}`} type={qual.type as any} qualifications={qualificationConfigs} size="small" />
            ))}
          </div>
        ) : null}
        {showOverride && activitiesEnabled && eventActivities.length > 0 && rec?.id ? (
          <select
            value={activityOverrides[rec.id] || ''}
            onChange={(e) => handleAssignPilotToActivity(rec.id!, e.target.value)}
            title="Assign this pilot to an activity (Auto = inferred from enrollment/qualifications)"
            className="flex-none max-w-[110px] h-[26px] px-[6px] rounded-rr-md bg-panel2 border border-border2 text-[11.5px] text-text2"
          >
            <option value="">Auto</option>
            {eventActivities.filter(a => a.id).map(activity => (
              <option key={activity.id} value={activity.id}>{getActivityDisplayName(activity)}</option>
            ))}
          </select>
        ) : null}
      </div>
    );
  };

  const renderGroupCard = (
    title: string,
    pilots: AttendanceData[],
    opts: { key: string; count?: string; showOverride?: boolean; tone?: string; plain?: boolean } = { key: title },
  ) => (
    <section key={opts.key} className="rounded-rr-lg border border-border bg-panel overflow-hidden flex flex-col min-w-0 self-start w-full">
      <div className="flex items-center gap-2 px-3 min-h-[38px] border-b border-border bg-panel2">
        {opts.tone ? <span className="flex-none w-2 h-2 rounded-full" style={{ background: opts.tone }} /> : null}
        <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-text truncate">{title}</span>
        <span className="font-mono text-[11px] text-text3">{opts.count ?? pilots.length}</span>
      </div>
      {pilots.length === 0 ? (
        <div className="px-3 py-[10px] text-[12px] text-text3">None</div>
      ) : opts.plain ? (
        <div className="divide-y divide-border">
          {pilots.map((p, i) => <div key={`${opts.key}-${p.discord_id || i}`} className="px-3 py-[8px] text-[13px] font-medium">{p.callsign}</div>)}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {pilots.map((p, i) => renderPilotRow(p, `${opts.key}-${p.discord_id || i}-${p.callsign}`, !!opts.showOverride))}
        </div>
      )}
    </section>
  );

  if (!event) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState icon="roster" title="No event selected" message="Pick an event on the left to see who's coming." />
      </div>
    );
  }

  const counts = {
    accepted: attendance.filter(a => a.status === 'accepted').length,
    tentative: attendance.filter(a => a.status === 'tentative').length,
    declined: attendance.filter(a => a.status === 'declined').length,
  };
  const statusTone = { accepted: 'var(--rr-good)', tentative: 'var(--rr-warn)', declined: 'var(--rr-bad)' } as const;
  const statusData = getAttendeesByStatus(statusView);

  const groupCards: React.ReactNode[] = statusData.qualificationGroups
    ? sortQualificationGroups(Object.entries(statusData.qualificationGroups))
        .filter(([, pilots]) => pilots.length > 0)
        .map(([groupName, pilots], i) => renderGroupCard(groupName, pilots, { key: `g-${groupName}-${i}`, showOverride: true }))
    : statusData.attendeesWithPilots.length > 0
      ? [renderGroupCard(statusView === 'accepted' ? 'Pilots' : statusView === 'tentative' ? 'Tentative' : 'Declined', statusData.attendeesWithPilots, { key: 'all', showOverride: true })]
      : [];

  // Mission Support roles (accepted pilots only, in the event's configured order)
  const supportCards: React.ReactNode[] = (() => {
    if (statusView !== 'accepted') return [];
    const requirements = event?.eventSettings?.supportRoleRequirements || [];
    if (requirements.length === 0) return [];
    const acceptedWithPilots = attendance.filter(a => a.status === 'accepted' && a.pilotRecord);
    return requirements.map((req, i) => {
      const required = Math.max(0, req.required || 0);
      // Match on qualification ID so renames don't break saved events; fall back to name
      const pilots = acceptedWithPilots
        .filter(a => a.pilotRecord?.qualifications?.some((q: any) => (q.id ? q.id === req.qualificationId : q.type === req.name)))
        .sort((a, b) => Number(a.pilotRecord?.boardNumber || 0) - Number(b.pilotRecord?.boardNumber || 0));
      const displayName = qualificationConfigs.find(c => c.id === req.qualificationId)?.name || req.name;
      return renderGroupCard(displayName, pilots, {
        key: `support-${req.qualificationId || req.name}-${i}`,
        count: `${pilots.length}/${required}`,
        tone: required > 0 && pilots.length < required ? 'var(--rr-warn)' : 'var(--rr-info)',
      });
    });
  })();

  const noRecord = statusData.attendeesWithoutPilots;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Summary + status switch */}
      <div className="flex-none flex items-center gap-3 flex-wrap px-4 py-[10px] border-b border-border bg-panel2">
        <SegmentedControl
          size="sm"
          value={statusView}
          onChange={(v) => setStatusView(v as 'accepted' | 'tentative' | 'declined')}
          options={(['accepted', 'tentative', 'declined'] as const).map(s => ({
            value: s,
            label: `${s === 'accepted' ? 'Accepted' : s === 'tentative' ? 'Tentative' : 'Declined'} · ${counts[s]}`,
          }))}
        />
        <span className="flex-1" />
        {(['accepted', 'tentative', 'declined'] as const).map(s => (
          <span key={s} className="flex items-center gap-[6px] text-[12px] text-text2">
            <span className="w-2 h-2 rounded-full" style={{ background: statusTone[s] }} />{counts[s]} {s === 'accepted' ? 'accepted' : s}
          </span>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {error ? <Toast tone="bad">{error}</Toast> : null}

        {groupCards.length === 0 && noRecord.length === 0 ? (
          <EmptyState
            compact
            icon="roster"
            title={statusView === 'accepted' ? 'No attendees yet' : statusView === 'tentative' ? 'No tentative responses' : 'No declined responses'}
          />
        ) : (
          <div className="grid gap-[14px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
            {groupCards}
            {noRecord.length > 0 ? renderGroupCard('No matching pilot record', noRecord, { key: 'no-record', plain: true, tone: 'var(--rr-text3)' }) : null}
          </div>
        )}

        {supportCards.length > 0 ? (
          <div>
            <div className="rr-label mb-2">Mission Support</div>
            <div className="grid gap-[14px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
              {supportCards}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default EventAttendance;