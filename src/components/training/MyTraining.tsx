// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { BookOpen } from 'lucide-react';
import type { TrainingProgressSummary, TrainingRoadmapMission } from '../../types/TrainingTypes';

const CARD_WIDTH = '550px';

const MyTraining: React.FC = () => {
  const { userProfile } = useAuth();
  const [syllabi, setSyllabi] = useState<any[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | undefined>();
  const [progressSummary, setProgressSummary] = useState<TrainingProgressSummary | null>(null);
  const [roadmapMissions, setRoadmapMissions] = useState<TrainingRoadmapMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSyllabi();
  }, [userProfile]);

  useEffect(() => {
    if (selectedSyllabusId && userProfile?.pilot?.id) {
      loadProgressSummary();
      loadRoadmap();
    }
  }, [selectedSyllabusId, userProfile]);

  const loadSyllabi = async () => {
    if (!userProfile?.pilot?.id) return;

    try {
      setLoading(true);
      const { data, error: syllabusError } = await supabase
        .from('training_syllabi')
        .select('*')
        .order('name');

      if (syllabusError) throw syllabusError;

      setSyllabi(data || []);
      if (data && data.length > 0 && !selectedSyllabusId) {
        setSelectedSyllabusId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProgressSummary = async () => {
    if (!selectedSyllabusId || !userProfile?.pilot?.id) return;

    try {
      // First get mission IDs for this syllabus
      const { data: missions } = await supabase
        .from('training_syllabus_missions')
        .select('id')
        .eq('syllabus_id', selectedSyllabusId);

      const missionIds = (missions || []).map(m => m.id);

      if (missionIds.length === 0) {
        setProgressSummary({
          studentId: userProfile.pilot.id,
          syllabusId: selectedSyllabusId,
          syllabusName: syllabi.find(s => s.id === selectedSyllabusId)?.name || '',
          totalObjectives: 0,
          completedObjectives: 0,
          satisfactoryObjectives: 0,
          unsatisfactoryObjectives: 0,
          percentComplete: 0,
          percentSatisfactory: 0
        });
        return;
      }

      const { count: totalObjectives } = await supabase
        .from('syllabus_training_objectives')
        .select('*', { count: 'exact', head: true })
        .in('mission_id', missionIds);

      const { data: scores } = await supabase
        .from('training_objective_scores')
        .select(`
          result,
          objective:syllabus_training_objectives!inner(mission_id)
        `)
        .eq('student_id', userProfile.pilot.id)
        .in('objective_id',
          (await supabase
            .from('syllabus_training_objectives')
            .select('id')
            .in('mission_id', missionIds)
          ).data?.map(o => o.id) || []
        );

      const satisfactory = scores?.filter(s => s.result === 'SAT').length || 0;
      const unsatisfactory = scores?.filter(s => s.result === 'UNSAT').length || 0;
      const completed = satisfactory + unsatisfactory;

      const syllabus = syllabi.find(s => s.id === selectedSyllabusId);

      setProgressSummary({
        studentId: userProfile.pilot.id,
        syllabusId: selectedSyllabusId,
        syllabusName: syllabus?.name || '',
        totalObjectives: totalObjectives || 0,
        completedObjectives: completed,
        satisfactoryObjectives: satisfactory,
        unsatisfactoryObjectives: unsatisfactory,
        percentComplete: totalObjectives ? (completed / totalObjectives) * 100 : 0,
        percentSatisfactory: completed ? (satisfactory / completed) * 100 : 0
      });
    } catch (err: any) {
      console.error('Error loading progress:', err);
    }
  };

  const loadRoadmap = async () => {
    if (!selectedSyllabusId || !userProfile?.pilot?.id) return;

    try {
      const { data: missions, error: missionsError } = await supabase
        .from('training_syllabus_missions')
        .select(`
          id,
          mission_number,
          mission_name,
          description
        `)
        .eq('syllabus_id', selectedSyllabusId)
        .order('mission_number');

      if (missionsError) throw missionsError;

      const roadmap: TrainingRoadmapMission[] = await Promise.all((missions || []).map(async (mission) => {
        // Get objectives for this mission
        const { data: objectives, count: totalObjectives } = await supabase
          .from('syllabus_training_objectives')
          .select('id', { count: 'exact' })
          .eq('mission_id', mission.id);

        const objectiveIds = (objectives || []).map(o => o.id);

        let scores: any[] = [];
        if (objectiveIds.length > 0) {
          const { data: scoresData } = await supabase
            .from('training_objective_scores')
            .select('result')
            .eq('student_id', userProfile.pilot!.id)
            .in('objective_id', objectiveIds);
          scores = scoresData || [];
        }

        const completedCount = scores.length;
        const satCount = scores.filter(s => s.result === 'SAT').length;

        let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
        if (completedCount === 0) {
          status = 'not_started';
        } else if (completedCount < (totalObjectives || 0)) {
          status = 'in_progress';
        } else {
          status = 'completed';
        }

        return {
          missionId: mission.id,
          missionNumber: mission.mission_number,
          missionName: mission.mission_name,
          description: mission.description,
          sortOrder: mission.mission_number,
          totalObjectives: totalObjectives || 0,
          completedObjectives: completedCount,
          status
        };
      }));

      setRoadmapMissions(roadmap);
    } catch (err: any) {
      console.error('Error loading roadmap:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: '#F0F4F8', minHeight: '100vh', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)', borderRadius: '8px', padding: '40px 80px' }}>
          Loading training data...
        </div>
      </div>
    );
  }

  if (!userProfile?.pilot) {
    return (
      <div style={{ backgroundColor: '#F0F4F8', minHeight: '100vh', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)', borderRadius: '8px', padding: '40px', maxWidth: '600px' }}>
          <div style={{ backgroundColor: '#FEF3C7', padding: '16px', borderRadius: '8px', border: '1px solid #F59E0B' }}>
            You must be linked to a pilot record to access training.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#F0F4F8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box', padding: '20px', overflow: 'visible' }}>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', minHeight: 'calc(100vh - 40px)', position: 'relative', zIndex: 1, maxWidth: '2240px', width: 'min(100%, 2240px)', boxSizing: 'border-box', overflow: 'visible', padding: '15px', margin: '-15px' }}>

        {/* Progress Summary Card */}
        <div style={{ width: CARD_WIDTH, minWidth: '350px', height: 'calc(100vh - 40px)', boxSizing: 'border-box', overflowY: 'visible' }}>
          <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 8px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 300, fontSize: '20px', lineHeight: '24px', color: '#64748B', textTransform: 'uppercase', display: 'block', textAlign: 'center' }}>
                PROGRESS SUMMARY
              </span>
            </div>
            <div style={{ padding: '24px', flex: 1 }}>
              {syllabi.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                    Training Syllabus
                  </label>
                  <select
                    value={selectedSyllabusId || ''}
                    onChange={(e) => setSelectedSyllabusId(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      width: '100%'
                    }}
                  >
                    {syllabi.map(syllabus => (
                      <option key={syllabus.id} value={syllabus.id}>
                        {syllabus.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {progressSummary && (
                <div>
                  <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
                    <div style={{ fontSize: '48px', fontWeight: 700, color: '#2563EB', marginBottom: '8px', textAlign: 'center' }}>
                      {Math.round(progressSummary.percentComplete)}%
                    </div>
                    <div style={{ fontSize: '14px', color: '#6B7280', textAlign: 'center' }}>
                      {progressSummary.completedObjectives} of {progressSummary.totalObjectives} objectives completed
                    </div>
                  </div>

                  <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
                    <div style={{ fontSize: '36px', fontWeight: 700, color: '#10B981', marginBottom: '8px', textAlign: 'center' }}>
                      {Math.round(progressSummary.percentSatisfactory)}%
                    </div>
                    <div style={{ fontSize: '14px', color: '#6B7280', textAlign: 'center' }}>
                      Satisfactory Rate
                    </div>
                    <div style={{ fontSize: '13px', color: '#9CA3AF', textAlign: 'center', marginTop: '4px' }}>
                      {progressSummary.satisfactoryObjectives} SAT, {progressSummary.unsatisfactoryObjectives} UNSAT
                    </div>
                  </div>
                </div>
              )}

              {syllabi.length === 0 && (
                <div style={{ textAlign: 'center', color: '#6B7280', padding: '40px 20px' }}>
                  <BookOpen size={48} style={{ margin: '0 auto 16px', color: '#9CA3AF' }} />
                  <p>No training syllabi available</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Training Roadmap Card */}
        <div style={{ width: CARD_WIDTH, minWidth: '350px', height: 'calc(100vh - 40px)', boxSizing: 'border-box', overflowY: 'visible' }}>
          <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 8px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 300, fontSize: '20px', lineHeight: '24px', color: '#64748B', textTransform: 'uppercase', display: 'block', textAlign: 'center' }}>
                TRAINING ROADMAP
              </span>
            </div>
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {roadmapMissions.map((mission) => (
                <div
                  key={mission.missionId}
                  style={{
                    padding: '16px',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    borderLeft: `4px solid ${
                      mission.status === 'completed' ? '#10B981' :
                      mission.status === 'in_progress' ? '#F59E0B' :
                      '#9CA3AF'
                    }`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                        {mission.missionNumber}: {mission.missionName}
                      </div>
                      {mission.description && (
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
                          {mission.description}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        {mission.completedObjectives} of {mission.totalObjectives} objectives
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor:
                        mission.status === 'completed' ? '#D1FAE5' :
                        mission.status === 'in_progress' ? '#FEF3C7' :
                        '#F3F4F6',
                      color:
                        mission.status === 'completed' ? '#065F46' :
                        mission.status === 'in_progress' ? '#92400E' :
                        '#374151'
                    }}>
                      {mission.status === 'completed' ? 'Complete' :
                       mission.status === 'in_progress' ? 'In Progress' :
                       'Not Started'}
                    </div>
                  </div>
                </div>
              ))}

              {roadmapMissions.length === 0 && (
                <div style={{ textAlign: 'center', color: '#6B7280', padding: '40px 20px' }}>
                  No missions in this syllabus
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MyTraining;
