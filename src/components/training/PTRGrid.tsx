// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Download } from 'lucide-react';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';

interface PTRGridProps {
  syllabusId: string;
  cycleId: string;
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

interface WeekScore {
  week: number;
  hasSat: boolean;
  hasUnsat: boolean;
}

interface WeekInfo {
  weekNumber: number;
  missionNumber: number | null;
}

interface StudentRow {
  student: Student;
  weekScores: Map<number, WeekScore>;
}

const PTRGrid: React.FC<PTRGridProps> = ({ syllabusId, cycleId }) => {
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [weekInfo, setWeekInfo] = useState<WeekInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleStartDate, setCycleStartDate] = useState<Date | null>(null);

  useEffect(() => {
    loadPTRData();
  }, [syllabusId, cycleId]);

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

      // Load week numbers and mission numbers from syllabus missions
      const { data: missionsData, error: missionsError } = await supabase
        .from('training_syllabus_missions')
        .select('week_number, mission_number')
        .eq('syllabus_id', syllabusId)
        .order('week_number');

      if (missionsError) throw missionsError;

      // Build week info with mission numbers
      // Group by week and take the first mission_number for each week
      const weekMap = new Map<number, number | null>();
      (missionsData || []).forEach((mission: any) => {
        if (!weekMap.has(mission.week_number)) {
          weekMap.set(mission.week_number, mission.mission_number);
        }
      });

      const weeks: WeekInfo[] = Array.from(weekMap.entries())
        .map(([weekNumber, missionNumber]) => ({ weekNumber, missionNumber }))
        .sort((a, b) => a.weekNumber - b.weekNumber);

      setWeekInfo(weeks.length > 0 ? weeks : [1, 2, 3, 4, 5, 6, 7, 8].map(w => ({ weekNumber: w, missionNumber: null })));

      // Build student rows with empty week scores
      const rows: StudentRow[] = enrichedPilotsData.map((pilot: any) => {
        return {
          student: {
            id: pilot.id,
            callsign: pilot.callsign,
            board_number: pilot.board_number,
            squadron: pilot.squadron
          },
          weekScores: new Map()
        };
      });

      setStudentRows(rows);
    } catch (err: any) {
      console.error('Error loading PTR data:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Student', 'Board Number', ...weekInfo.map(w => `Week ${w.weekNumber}`)];
    const csvRows = [headers.join(',')];

    studentRows.forEach(row => {
      const weekResults = weekInfo.map(week => {
        const score = row.weekScores.get(week.weekNumber);
        if (!score) return '';
        if (score.hasUnsat) return 'UNSAT';
        if (score.hasSat) return 'SAT';
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
                </th>
                {weekInfo.map((week) => (
                  <th
                    key={week.weekNumber}
                    style={{
                      padding: '12px 16px 2px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#6B7280',
                      textTransform: 'uppercase',
                      backgroundColor: '#F9FAFB',
                      whiteSpace: 'nowrap',
                      width: '90px'
                    }}
                  >
                    Week {week.weekNumber}
                  </th>
                ))}
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
                {weekInfo.map((week) => (
                  <th
                    key={week.weekNumber}
                    style={{
                      padding: '2px 16px 12px',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 400,
                      color: '#4B5563',
                      backgroundColor: '#F9FAFB',
                      whiteSpace: 'nowrap',
                      width: '90px'
                    }}
                  >
                    {week.missionNumber !== null ? `H${String(week.missionNumber).padStart(2, '0')}` : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studentRows.map((row) => (
                <tr key={row.student.id}>
                  <td style={{
                    padding: '12px 8px 12px 16px',
                    borderBottom: '1px solid #E5E7EB',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: 'white',
                    zIndex: 1,
                    width: '220px'
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
                    const score = row.weekScores.get(week.weekNumber);
                    const hasUnsat = score?.hasUnsat || false;
                    const hasSat = score?.hasSat || false;

                    return (
                      <td
                        key={week.weekNumber}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          borderBottom: '1px solid #E5E7EB',
                          width: '90px',
                          backgroundColor:
                            hasUnsat ? '#FEE2E2' :
                            hasSat ? '#D1FAE5' :
                            'white',
                          color:
                            hasUnsat ? '#991B1B' :
                            hasSat ? '#065F46' :
                            '#9CA3AF',
                          fontWeight: (hasSat || hasUnsat) ? 600 : 400,
                          fontSize: '13px'
                        }}
                      >
                        {hasUnsat ? 'UNSAT' : hasSat ? 'SAT' : '-'}
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
