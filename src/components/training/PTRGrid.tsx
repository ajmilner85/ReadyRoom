// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Download, BookOpen, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';
import { PTRCellData } from '../../types/TrainingTypes';
import type { ReferenceMaterial } from '../../types/EventTypes';
import { useNavigate } from 'react-router-dom';

interface PTRGridProps {
  syllabusId: string;
  cycleId: string;
  onCellClick?: (cellData: PTRCellData) => void;
}

interface Student {
  id: string;
  callsign: string;
  board_number: string;
  squadron?: {
    tail_code: string;
    insignia_url: string;
    primary_color: string;
  };
}

interface WeekInfo {
  weekNumber: number;
  missionNumber: number | null;
  syllabusMissionId: string;
  missionName?: string;
  objectives?: Array<{ id: string; objectiveText: string }>;
  referenceMaterials?: Array<{ material: ReferenceMaterial; isInherited: boolean }>;
  eventName?: string;
  eventDate?: string;
  eventId?: string;
}

interface StudentRow {
  student: Student;
  weekCells: Map<number, PTRCellData>;
}

const PTRGrid: React.FC<PTRGridProps> = ({ syllabusId, cycleId, onCellClick }) => {
  const navigate = useNavigate();
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [weekInfo, setWeekInfo] = useState<WeekInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleStartDate, setCycleStartDate] = useState<Date | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'boardNumber' | 'callsign'>('boardNumber');
  const [hoveredWeekPopup, setHoveredWeekPopup] = useState<number | null>(null);
  const [clickedWeekPopup, setClickedWeekPopup] = useState<number | null>(null);

  useEffect(() => {
    loadPTRData();
  }, [syllabusId, cycleId]);

  // Handle click outside for popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clickedWeekPopup === null) return;
      const target = event.target as HTMLElement;
      if (!target.closest('[data-week-popup]') && !target.closest('[data-week-header]')) {
        setClickedWeekPopup(null);
        setHoveredWeekPopup(null);
      }
    };
    if (clickedWeekPopup !== null) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [clickedWeekPopup]);

  const loadPTRData = async () => {
    try {
      setLoading(true);

      // Load cycle to get start date
      const { data: cycleData, error: cycleError} = await supabase
        .from('cycles')
        .select('start_date')
        .eq('id', cycleId)
        .single();

      if (cycleError) throw cycleError;

      const startDate = new Date(cycleData.start_date);
      setCycleStartDate(startDate);

      // Get enrolled pilots for this cycle (only active and graduated students)
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('training_enrollments')
        .select(`
          id,
          pilot_id,
          status,
          pilots!inner(id, callsign, boardNumber)
        `)
        .eq('cycle_id', cycleId)
        .in('status', ['active', 'graduated'])
        .order('enrolled_at');

      if (enrollmentsError) throw enrollmentsError;

      if (!enrollments || enrollments.length === 0) {
        setStudentRows([]);
        setLoading(false);
        return;
      }

      const pilotIds = enrollments.map((e: any) => e.pilot_id);

      // Load squadron assignments for enrolled pilots
      const { data: assignmentsData } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, org_squadrons(tail_code, insignia_url, color_palette)')
        .in('pilot_id', pilotIds)
        .is('end_date', null);

      // Create squadron map
      const squadronMap = new Map();
      (assignmentsData || []).forEach((assignment: any) => {
        if (assignment.org_squadrons) {
          squadronMap.set(assignment.pilot_id, {
            tail_code: assignment.org_squadrons.tail_code,
            insignia_url: assignment.org_squadrons.insignia_url,
            primary_color: assignment.org_squadrons.color_palette?.primary || '#000000'
          });
        }
      });

      // Build enriched pilot data from enrollments
      const enrichedPilotsData = enrollments.map((enrollment: any) => ({
        id: enrollment.pilot_id,
        callsign: enrollment.pilots.callsign,
        boardNumber: enrollment.pilots.boardNumber,
        board_number: enrollment.pilots.boardNumber,
        squadron: squadronMap.get(enrollment.pilot_id) || null,
        enrollment_status: enrollment.status
      }));

      // Load week numbers and mission numbers from syllabus missions with objectives and references
      const { data: missionsData, error: missionsError } = await supabase
        .from('training_syllabus_missions')
        .select('id, week_number, mission_number, mission_name, reference_materials, training_syllabi!inner(reference_materials)')
        .eq('syllabus_id', syllabusId)
        .order('week_number');

      if (missionsError) throw missionsError;

      // Load objectives for all missions
      const missionIds = (missionsData || []).map((m: any) => m.id);
      let objectivesData: any[] = [];
      if (missionIds.length > 0) {
        const { data: objData, error: objError } = await supabase
          .from('syllabus_training_objectives')
          .select('id, syllabus_mission_id, objective_text, scope_level')
          .in('syllabus_mission_id', missionIds)
          .eq('scope_level', 'Individual')
          .order('display_order');

        if (!objError && objData) {
          objectivesData = objData;
        }
      }

      // Build objectives map
      const objectivesMap = new Map<string, Array<{ id: string; objectiveText: string }>>();
      objectivesData.forEach((obj: any) => {
        if (!objectivesMap.has(obj.syllabus_mission_id)) {
          objectivesMap.set(obj.syllabus_mission_id, []);
        }
        objectivesMap.get(obj.syllabus_mission_id)?.push({
          id: obj.id,
          objectiveText: obj.objective_text
        });
      });

      // Build week info with mission IDs, numbers, objectives, and references
      const weekMap = new Map<number, {
        missionNumber: number | null;
        syllabusMissionId: string;
        missionName: string;
        objectives: Array<{ id: string; objectiveText: string }>;
        referenceMaterials: Array<{ material: ReferenceMaterial; isInherited: boolean }>;
      }>();

      (missionsData || []).forEach((mission: any) => {
        if (!weekMap.has(mission.week_number)) {
          // Merge syllabus and mission references - both are inherited (show book icon)
          const syllabusRefs = mission.training_syllabi?.reference_materials || [];
          const missionRefs = mission.reference_materials || [];

          const syllabusRefsWithFlag = syllabusRefs.map((ref: ReferenceMaterial) => ({ material: ref, isInherited: true }));
          const missionRefsWithFlag = missionRefs.map((ref: ReferenceMaterial) => ({ material: ref, isInherited: true }));
          const allRefsWithFlag = [...syllabusRefsWithFlag, ...missionRefsWithFlag];

          // Deduplicate by URL
          const uniqueRefs = allRefsWithFlag.filter((item, index, self) =>
            index === self.findIndex((r) => r.material.url === item.material.url)
          );

          weekMap.set(mission.week_number, {
            missionNumber: mission.mission_number,
            syllabusMissionId: mission.id,
            missionName: mission.mission_name,
            objectives: objectivesMap.get(mission.id) || [],
            referenceMaterials: uniqueRefs
          });
        }
      });

      // Load events for this cycle
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, syllabus_mission_id, name, start_datetime, discord_event_id')
        .eq('cycle_id', cycleId)
        .not('syllabus_mission_id', 'is', null);

      if (eventsError) throw eventsError;

      // Map syllabus mission ID to event
      const missionToEvent = new Map();
      (eventsData || []).forEach((event: any) => {
        missionToEvent.set(event.syllabus_mission_id, event);
      });

      const weeks: WeekInfo[] = Array.from(weekMap.entries())
        .map(([weekNumber, data]) => {
          const event = missionToEvent.get(data.syllabusMissionId);
          return {
            weekNumber,
            missionNumber: data.missionNumber,
            syllabusMissionId: data.syllabusMissionId,
            missionName: data.missionName,
            objectives: data.objectives,
            referenceMaterials: data.referenceMaterials,
            eventName: event?.name,
            eventDate: event?.start_datetime,
            eventId: event?.id
          };
        })
        .sort((a, b) => a.weekNumber - b.weekNumber);

      setWeekInfo(weeks.length > 0 ? weeks : []);

      // Load attendance for all events
      const eventIds = (eventsData || []).map((e: any) => e.id);

      const mapInstanceId = Math.random().toString(36).substring(7);
      let attendanceMap = new Map(); // key: `${eventId}_${pilotId}`, value: { wasPresent, wasAssignedToFlight, assignedIpCallsign }


      if (eventIds.length > 0) {
        // Build list of discord_event_ids to query - includes both published events and manual entries
        const discordEventIdsToQuery: string[] = [];
        const discordToEventMap = new Map();

        (eventsData || []).forEach((e: any) => {
          // discord_event_id can be a JSONB array of objects with structure:
          // [{ guildId, threadId, channelId, messageId, squadronId }, ...]
          // The messageId is what's used as the discord_event_id for attendance tracking
          if (e.discord_event_id) {
            if (Array.isArray(e.discord_event_id)) {
              e.discord_event_id.forEach((item: any) => {
                if (item && item.messageId) {
                  const messageId = String(item.messageId);
                  discordEventIdsToQuery.push(messageId);
                  discordToEventMap.set(messageId, e.id);
                }
              });
            } else if (typeof e.discord_event_id === 'string') {
              // Legacy format: simple string
              discordEventIdsToQuery.push(e.discord_event_id);
              discordToEventMap.set(e.discord_event_id, e.id);
            }
          }
          // Also check for manual attendance (format: "manual-{eventId}")
          const manualId = `manual-${e.id}`;
          discordEventIdsToQuery.push(manualId);
          discordToEventMap.set(manualId, e.id);
        });



        if (discordEventIdsToQuery.length > 0) {
          const { data: attendanceData, error: attendanceError } = await supabase
            .from('discord_event_attendance')
            .select('discord_event_id, discord_id, roll_call_response')
            .in('discord_event_id', discordEventIdsToQuery);

          if (!attendanceError && attendanceData) {
            // Get discord_id to pilot_id mapping
            const discordIds = [...new Set(attendanceData.map((a: any) => a.discord_id))];
            const { data: pilotsData } = await supabase
              .from('pilots')
              .select('id, discord_id')
              .in('discord_id', discordIds)
              .not('discord_id', 'is', null);

            const discordToPilot = new Map();
            (pilotsData || []).forEach((p: any) => {
              discordToPilot.set(p.discord_id, p.id);
            });



            attendanceData.forEach((att: any) => {
              const pilotId = discordToPilot.get(att.discord_id);
              const eventId = discordToEventMap.get(att.discord_event_id);
              if (pilotId && eventId) {
                const key = `${eventId}_${pilotId}`;
                const wasPresent = att.roll_call_response === 'Present';
                
                // Check if there's already an entry - if they were already marked Present, don't overwrite with false
                const existingEntry = attendanceMap.get(key);
                if (existingEntry?.wasPresent && !wasPresent) {
                  // Skip - don't overwrite Present with a non-Present entry
                  // This can happen when an event has multiple Discord threads/messages
                  if (pilotId === '420288b4-d803-4815-a1bb-5b46df18ad03') {

                  }
                  return;
                }
                
                const valueToSet = {
                  wasPresent,
                  wasAssignedToFlight: existingEntry?.wasAssignedToFlight || false,
                  assignedIpCallsign: existingEntry?.assignedIpCallsign || null
                };
                attendanceMap.set(key, valueToSet);
                
                if (wasPresent) {

                }
              }
            });
          }
        }
      }

      // Load flight assignments from missions table
      if (eventIds.length > 0) {

        const { data: missionsWithAssignments, error: missionsAssignError } = await supabase
          .from('missions')
          .select('event_id, pilot_assignments')
          .in('event_id', eventIds);

        if (!missionsAssignError && missionsWithAssignments) {
          missionsWithAssignments.forEach((mission: any) => {
            const assignments = mission.pilot_assignments || {};

            // Find IPs and students
            // Note: Database stores assignments with snake_case fields (pilot_id, dash_number)
            // but some may have camelCase (id, dashNumber) if saved in UI format
            Object.entries(assignments).forEach(([flightId, pilots]: [string, any]) => {
              if (!Array.isArray(pilots)) return;

              // Find flight lead - check both dash_number (db) and dashNumber (UI) formats
              const flightLead = pilots.find((p: any) => p.dash_number === "1" || p.dashNumber === "1");
              const ipCallsign = flightLead?.callsign;

              pilots.forEach((pilot: any) => {
                // Use pilot_id (db format) or id (UI format)
                const pilotId = pilot.pilot_id || pilot.id;
                if (!pilotId) {

                  return; // Skip if no valid pilot ID
                }

                const key = `${mission.event_id}_${pilotId}`;
                const existing = attendanceMap.get(key);
                const existingOrDefault = existing || { wasPresent: false, wasAssignedToFlight: false, assignedIpCallsign: null };
                
                const newValue = {
                  ...existingOrDefault,
                  wasAssignedToFlight: true,
                  assignedIpCallsign: ipCallsign || existingOrDefault.assignedIpCallsign
                };
                attendanceMap.set(key, newValue);
                

              });
            });
          });
        }
      }

      // Load grades for this cycle
      const { data: gradesData, error: gradesError } = await supabase
        .from('training_grades')
        .select('id, student_id, syllabus_mission_id, overall_grade, attempt_number, flight_date')
        .eq('cycle_id', cycleId)
        .in('student_id', pilotIds);

      if (gradesError) console.error('Error loading grades:', gradesError);

      // Build grade map: key = `${studentId}_${syllabusMissionId}`, value = { latestGrade, attemptCount, latestAttemptId }
      const gradeMap = new Map();
      (gradesData || []).forEach((grade: any) => {
        const key = `${grade.student_id}_${grade.syllabus_mission_id}`;
        const existing = gradeMap.get(key);

        if (!existing || grade.attempt_number > existing.attemptCount) {
          gradeMap.set(key, {
            latestGrade: grade.overall_grade,
            attemptCount: grade.attempt_number,
            latestAttemptId: grade.id,
            flightDate: grade.flight_date
          });
        }
      });

      // Build student rows with cell data
      const rows: StudentRow[] = enrichedPilotsData.map((pilot: any) => {
        const weekCells = new Map<number, PTRCellData>();

        weeks.forEach((week) => {
          const event = missionToEvent.get(week.syllabusMissionId);
          const attendanceKey = event ? `${event.id}_${pilot.id}` : null;
          const attendance = attendanceKey ? attendanceMap.get(attendanceKey) : null;

          const gradeKey = `${pilot.id}_${week.syllabusMissionId}`;
          const gradeData = gradeMap.get(gradeKey);

          const cellData: PTRCellData = {
            weekNumber: week.weekNumber,
            missionNumber: week.missionNumber,
            syllabusMissionId: week.syllabusMissionId,
            studentId: pilot.id,
            wasPresent: attendance?.wasPresent || false,
            wasAssignedToFlight: attendance?.wasAssignedToFlight || false,
            hasGrade: !!gradeData,
            latestGrade: gradeData?.latestGrade,
            attemptCount: gradeData?.attemptCount || 0,
            latestAttemptId: gradeData?.latestAttemptId,
            eventId: event?.id,
            eventDate: event?.start_datetime,
            assignedIpCallsign: attendance?.assignedIpCallsign
          };

          weekCells.set(week.weekNumber, cellData);
        });

        return {
          student: {
            id: pilot.id,
            callsign: pilot.callsign,
            board_number: pilot.board_number,
            squadron: pilot.squadron
          },
          weekCells
        };
      });

      setStudentRows(rows);
    } catch (err: any) {
      console.error('Error loading PTR data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = () => {
    setSortBy(prev => prev === 'boardNumber' ? 'callsign' : 'boardNumber');
  };

  const sortedStudentRows = React.useMemo(() => {
    return [...studentRows].sort((a, b) => {
      if (sortBy === 'boardNumber') {
        return parseInt(a.student.board_number) - parseInt(b.student.board_number);
      } else {
        return a.student.callsign.localeCompare(b.student.callsign);
      }
    });
  }, [studentRows, sortBy]);

  const exportToCSV = () => {
    const headers = ['Student', 'Board Number', ...weekInfo.map(w => `Week ${w.weekNumber}`)];
    const csvRows = [headers.join(',')];

    studentRows.forEach(row => {
      const weekResults = weekInfo.map(week => {
        const cellData = row.weekCells.get(week.weekNumber);
        if (!cellData) return '';
        if (cellData.hasGrade) return cellData.latestGrade;
        if (cellData.wasPresent) return 'PRESENT';
        return '';
      });

      const csvRow = [
        row.student.callsign,
        row.student.board_number,
        ...weekResults
      ];
      csvRows.push(csvRow.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ptr_${cycleId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCellClick = (cellData: PTRCellData) => {
    if (onCellClick) {
      onCellClick(cellData);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
        Loading PTR data...
      </div>
    );
  }

  if (studentRows.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
        No students enrolled in this training cycle
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '14px', color: '#6B7280' }}>
          {studentRows.length} student{studentRows.length !== 1 ? 's' : ''}, {weekInfo.length} week{weekInfo.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={exportToCSV}
          style={{
            padding: '8px 12px',
            backgroundColor: 'white',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: '6px', position: 'relative', overflow: 'visible', width: 'fit-content' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '600px', position: 'relative' }}>
          <table style={{ borderCollapse: 'collapse', width: 'auto' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Week Number Row */}
              <tr style={{ backgroundColor: '#F9FAFB' }}>
                <th style={{
                  padding: '12px 8px 2px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  backgroundColor: '#F9FAFB',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  left: 0,
                  zIndex: 11,
                  width: '220px'
                }}>
                  <button
                    onClick={toggleSort}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0',
                      cursor: 'pointer',
                      color: '#6B7280',
                      fontSize: '12px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {sortBy === 'boardNumber' ? 'Board Number' : 'Callsign'}
                    <span style={{ fontSize: '10px' }}>▼</span>
                  </button>
                </th>
                {weekInfo.map((week) => {
                  const hasContent = week.eventId || week.missionName || (week.referenceMaterials && week.referenceMaterials.length > 0);
                  const showPopup = hasContent && (hoveredWeekPopup === week.weekNumber || clickedWeekPopup === week.weekNumber);

                  return (
                    <th
                      key={week.weekNumber}
                      data-week-header
                      style={{
                        padding: '12px 16px 2px',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        backgroundColor: (hoveredCol === week.weekNumber || clickedWeekPopup === week.weekNumber) ? '#E5E7EB' : '#F9FAFB',
                        whiteSpace: 'nowrap',
                        width: '90px',
                        transition: 'background-color 0.1s',
                        position: 'relative',
                        cursor: hasContent ? 'pointer' : 'default'
                      }}
                      onMouseEnter={() => {
                        if (hasContent) {
                          setHoveredCol(week.weekNumber);
                          if (clickedWeekPopup === null) {
                            setHoveredWeekPopup(week.weekNumber);
                          }
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredCol(null);
                        if (clickedWeekPopup === null) {
                          setHoveredWeekPopup(null);
                        }
                      }}
                      onClick={(e) => {
                        if (hasContent) {
                          e.stopPropagation();
                          setClickedWeekPopup(clickedWeekPopup === week.weekNumber ? null : week.weekNumber);
                        }
                      }}
                    >
                      Week {week.weekNumber}

                      {/* Hover area extension */}
                      {showPopup && (
                        <div style={{
                          position: 'absolute',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          top: '100%',
                          width: '8px',
                          height: '30px',
                          pointerEvents: 'auto',
                          zIndex: 1002
                        }} />
                      )}

                      {/* Popup */}
                      {showPopup && (
                        <div
                          data-week-popup
                          style={{
                            position: 'absolute',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: 'calc(100% + 30px)',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            padding: '12px',
                            minWidth: 'max-content',
                            width: 'max-content',
                            zIndex: 1003,
                            pointerEvents: 'auto',
                            textAlign: 'left',
                            textTransform: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Header */}
                          {week.eventName && (
                            <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #E5E7EB' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: '#000000' }}>
                                  {week.eventName}
                                </div>
                                {week.eventId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/events?cycle=${cycleId}&event=${week.eventId}`);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      color: '#9CA3AF'
                                    }}
                                    title="Go to Event"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#6B7280' }}>
                                    {week.missionNumber !== null ? `H${String(week.missionNumber).padStart(2, '0')}` : ''}
                                  </span>
                                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#000000' }}>
                                    {week.missionName}
                                  </span>
                                </div>
                                {week.eventId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/mission-preparation?cycle=${cycleId}&event=${week.eventId}`);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      color: '#9CA3AF'
                                    }}
                                    title="Go to Mission Preparation"
                                  >
                                    <FileText size={16} />
                                  </button>
                                )}
                              </div>
                              {week.eventDate && (
                                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                                  {new Date(week.eventDate).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {week.objectives && week.objectives.length > 0 && (
                            <div style={{ marginBottom: week.referenceMaterials && week.referenceMaterials.length > 0 ? '12px' : '0' }}>
                              <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#1F2937',
                                marginBottom: '8px'
                              }}>
                                Desired Learning Objectives
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {week.objectives.map((obj) => (
                                  <div key={obj.id} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px'
                                  }}>
                                    <CheckCircle2 size={16} style={{ color: '#9CA3AF', marginTop: '2px', flexShrink: 0 }} />
                                    <span style={{
                                      fontSize: '13px',
                                      color: '#6B7280',
                                      lineHeight: '1.4'
                                    }}>
                                      {obj.objectiveText}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {week.referenceMaterials && week.referenceMaterials.length > 0 && (
                            <div>
                              <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#1F2937',
                                marginBottom: '8px'
                              }}>
                                Reference Materials
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {week.referenceMaterials.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flexShrink: 0, width: '16px' }}>
                                      {item.isInherited && (
                                        <BookOpen size={16} style={{ color: '#6B7280' }} />
                                      )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{
                                        fontSize: '12px',
                                        color: '#1F2937',
                                        marginBottom: '2px'
                                      }}>
                                        {item.material.type}
                                      </div>
                                      <a
                                        href={item.material.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          fontSize: '14px',
                                          color: '#3B82F6',
                                          textDecoration: 'none',
                                          display: 'block',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {item.material.name}
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
              {/* Hop Number Row */}
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{
                  padding: '2px 8px 12px 16px',
                  textAlign: 'left',
                  backgroundColor: '#F9FAFB',
                  position: 'sticky',
                  left: 0,
                  zIndex: 11,
                  width: '220px'
                }}>
                </th>
                {weekInfo.map((week) => {
                  return (
                    <th
                      key={week.weekNumber}
                      data-week-header
                      style={{
                        padding: '2px 16px 12px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 400,
                        color: '#4B5563',
                        backgroundColor: (hoveredCol === week.weekNumber || clickedWeekPopup === week.weekNumber) ? '#E5E7EB' : '#F9FAFB',
                        whiteSpace: 'nowrap',
                        width: '90px',
                        transition: 'background-color 0.1s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={() => {
                        setHoveredCol(week.weekNumber);
                        if (clickedWeekPopup === null) {
                          setHoveredWeekPopup(week.weekNumber);
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredCol(null);
                        if (clickedWeekPopup === null) {
                          setHoveredWeekPopup(null);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedWeekPopup(clickedWeekPopup === week.weekNumber ? null : week.weekNumber);
                      }}
                    >
                      {week.missionNumber !== null ? `H${String(week.missionNumber).padStart(2, '0')}` : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedStudentRows.map((row) => (
                <tr key={row.student.id}>
                  <td style={{
                    padding: '12px 8px 12px 16px',
                    borderBottom: '1px solid #E5E7EB',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: hoveredRow === row.student.id ? '#F9FAFB' : 'white',
                    zIndex: 1,
                    width: '220px',
                    transition: 'background-color 0.1s'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '24px',
                      gap: '8px'
                    }}>
                      <div style={{ marginLeft: '-20px' }}>
                        <PilotIDBadgeSm
                          squadronTailCode={row.student.squadron?.tail_code}
                          boardNumber={row.student.board_number}
                          squadronInsigniaUrl={row.student.squadron?.insignia_url}
                        />
                      </div>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: row.student.squadron?.primary_color || '#000000'
                      }}>
                        {row.student.callsign}
                      </span>
                    </div>
                  </td>
                  {weekInfo.map((week) => {
                    const cellData = row.weekCells.get(week.weekNumber);
                    if (!cellData) return null;

                    const isHovered = hoveredRow === row.student.id || hoveredCol === week.weekNumber;
                    const isCellHovered = hoveredRow === row.student.id && hoveredCol === week.weekNumber;

                    // Determine background color
                    let backgroundColor = 'white';
                    if (cellData.hasGrade) {
                      if (cellData.latestGrade === 'UNSAT') {
                        backgroundColor = '#FEF3C7'; // Yellow for UNSAT
                      } else if (cellData.latestGrade === 'SAT') {
                        // SAT with attendance = green, SAT without attendance = white
                        backgroundColor = cellData.wasPresent ? '#ECFDF5' : 'white';
                      }
                    } else if (cellData.wasPresent) {
                      backgroundColor = '#ECFDF5'; // Light green for present
                    }

                    // Hover effects
                    if (isCellHovered) {
                      if (cellData.hasGrade && cellData.latestGrade === 'UNSAT') {
                        backgroundColor = '#FDE68A'; // Darker yellow
                      } else if (cellData.hasGrade && cellData.latestGrade === 'SAT') {
                        backgroundColor = cellData.wasPresent ? '#D1FAE5' : '#E5E7EB';
                      } else if (cellData.wasPresent) {
                        backgroundColor = '#D1FAE5'; // Darker green on hover
                      } else {
                        backgroundColor = '#E5E7EB'; // Darker gray
                      }
                    } else if (isHovered) {
                      if (cellData.hasGrade && cellData.latestGrade === 'UNSAT') {
                        backgroundColor = '#FEF3C7';
                      } else if (cellData.hasGrade && cellData.latestGrade === 'SAT') {
                        backgroundColor = cellData.wasPresent ? '#ECFDF5' : '#F9FAFB';
                      } else if (cellData.wasPresent) {
                        backgroundColor = '#ECFDF5';
                      } else {
                        backgroundColor = '#F9FAFB';
                      }
                    }

                    // Determine text color and content
                    let textColor = '#9CA3AF';
                    let content = '-';
                    let fontWeight = 400;

                    if (cellData.hasGrade) {
                      if (cellData.latestGrade === 'SAT') {
                        textColor = '#065F46'; // Green
                        content = 'SAT';
                        fontWeight = 600;
                      } else if (cellData.latestGrade === 'UNSAT') {
                        textColor = '#92400E'; // Darker yellow
                        content = 'UNSAT';
                        fontWeight = 600;
                      }
                    }

                    return (
                      <td
                        key={week.weekNumber}
                        onMouseEnter={() => {
                          setHoveredRow(row.student.id);
                          setHoveredCol(week.weekNumber);
                        }}
                        onMouseLeave={() => {
                          setHoveredRow(null);
                          setHoveredCol(null);
                        }}
                        onClick={() => handleCellClick(cellData)}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          borderBottom: '1px solid #E5E7EB',
                          width: '90px',
                          backgroundColor,
                          color: textColor,
                          fontWeight,
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'background-color 0.1s'
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PTRGrid;
