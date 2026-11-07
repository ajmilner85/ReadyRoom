// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Field, Icon, ProgressBar, Select } from '../ui/primitives';
import type { TrainingProgressSummary, TrainingRoadmapMission } from '../../types/TrainingTypes';


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
      <div style={{ minHeight: '100%', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'var(--rr-panel)', boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)', borderRadius: '10px', padding: '40px 80px' }}>
          Loading training data...
        </div>
      </div>
    );
  }

  if (!userProfile?.pilot) {
    return (
      <div style={{ minHeight: '100%', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'var(--rr-panel)', boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)', borderRadius: '10px', padding: '40px', maxWidth: '600px' }}>
          <div style={{ backgroundColor: 'rgba(222,154,31,.14)', padding: '16px', borderRadius: '8px', border: '1px solid var(--rr-warn)' }}>
            You must be linked to a pilot record to access training.
          </div>
        </div>
      </div>
    );
  }

  // Unnumbered lessons (e.g. an introduction) lead the roadmap, then by mission number
  const orderedMissions = [...roadmapMissions].sort((a, b) => {
    const an = a.missionNumber ?? -Infinity;
    const bn = b.missionNumber ?? -Infinity;
    return an === bn ? 0 : an < bn ? -1 : 1;
  });
  const STATUS = {
    completed: { label: 'Complete', fg: 'var(--rr-good)', bg: 'color-mix(in srgb, var(--rr-good) 15%, transparent)' },
    in_progress: { label: 'In progress', fg: 'var(--rr-warn)', bg: 'color-mix(in srgb, var(--rr-warn) 15%, transparent)' },
    not_started: { label: 'Not started', fg: 'var(--rr-text2)', bg: 'var(--rr-panel3)' },
  } as const;
  const doneCount = orderedMissions.filter(m => m.status === 'completed').length;

  return (
    <div className="min-h-full box-border p-[14px] flex flex-col items-center">
      <div className="rr-page flex gap-[14px] items-start max-[900px]:flex-col">

        {/* Progress */}
        <section className="flex-none w-[360px] max-[900px]:w-full rounded-rr-xl border border-border bg-panel shadow-rr overflow-hidden">
          <div className="flex items-center px-[16px] min-h-[46px] border-b border-border">
            <span className="rr-pane-title">Progress</span>
          </div>
          <div className="p-[16px] flex flex-col gap-[14px]">
            {syllabi.length > 0 ? (
              <Field label="Training syllabus">
                <Select
                  value={selectedSyllabusId || ''}
                  onChange={(v) => setSelectedSyllabusId(v)}
                  options={syllabi.map(s => ({ value: s.id, label: s.name }))}
                />
              </Field>
            ) : (
              <EmptyState icon="bookOpen" title="No training syllabi" message="You aren't enrolled in a syllabus yet." />
            )}

            {syllabi.length > 0 && progressSummary ? (
              <>
                <div className="rounded-rr-lg bg-panel2 border border-border p-[14px]">
                  <div className="flex items-baseline gap-[8px] mb-[8px]">
                    <span className="font-mono text-[30px] font-semibold leading-none" style={{ color: "var(--rr-accent-text)" }}>{Math.round(progressSummary.percentComplete)}%</span>
                    <span className="text-[12px] text-text2">complete</span>
                  </div>
                  <ProgressBar value={progressSummary.completedObjectives} max={progressSummary.totalObjectives || 1} showValue={false} />
                  <div className="mt-[8px] text-[12px] text-text2">
                    {progressSummary.totalObjectives > 0
                      ? `${progressSummary.completedObjectives} of ${progressSummary.totalObjectives} objectives graded`
                      : 'This syllabus has no graded objectives yet.'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-[8px]">
                  {[
                    { k: 'SAT rate', v: progressSummary.completedObjectives ? `${Math.round(progressSummary.percentSatisfactory)}%` : '—', c: 'var(--rr-good)' },
                    { k: 'SAT', v: String(progressSummary.satisfactoryObjectives), c: 'var(--rr-text)' },
                    { k: 'UNSAT', v: String(progressSummary.unsatisfactoryObjectives), c: progressSummary.unsatisfactoryObjectives ? 'var(--rr-bad)' : 'var(--rr-text)' },
                  ].map(t => (
                    <div key={t.k} className="rounded-rr-md bg-panel2 border border-border px-[10px] py-[9px]">
                      <div className="font-mono text-[17px] font-semibold leading-[1.2]" style={{ color: t.c }}>{t.v}</div>
                      <div className="rr-label mt-[3px]">{t.k}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[12px] text-text2">
                  <span className="font-semibold text-text">{doneCount}</span> of {orderedMissions.length} lessons complete
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* Roadmap */}
        <section className="flex-1 min-w-0 max-[900px]:w-full rounded-rr-xl border border-border bg-panel shadow-rr overflow-hidden">
          <div className="flex items-center gap-2 px-[16px] min-h-[46px] border-b border-border">
            <span className="rr-pane-title">Roadmap</span>
            <span className="font-mono text-[11px] text-text3">{orderedMissions.length}</span>
          </div>
          {orderedMissions.length === 0 ? (
            <div className="p-[16px]"><EmptyState compact icon="training" title="No lessons in this syllabus" /></div>
          ) : (
            <ol className="m-0 list-none p-[16px] flex flex-col">
              {orderedMissions.map((mission, i) => {
                const st = STATUS[mission.status];
                const last = i === orderedMissions.length - 1;
                return (
                  <li key={mission.missionId} className="relative flex gap-[14px]">
                    {/* Marker + connector */}
                    <div className="flex-none flex flex-col items-center">
                      <span
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-mono text-[12px] font-semibold border-2"
                        style={mission.status === 'completed'
                          ? { background: 'var(--rr-good)', borderColor: 'var(--rr-good)', color: '#fff' }
                          : mission.status === 'in_progress'
                            ? { background: 'var(--rr-panel)', borderColor: 'var(--rr-warn)', color: 'var(--rr-warn)' }
                            : { background: 'var(--rr-panel2)', borderColor: 'var(--rr-border2)', color: 'var(--rr-text2)' }}
                      >
                        {mission.status === 'completed' ? <Icon name="check" size={14} /> : (mission.missionNumber ?? '•')}
                      </span>
                      {!last ? <span className="flex-1 w-[2px] my-[4px] rounded-full" style={{ background: mission.status === 'completed' ? 'var(--rr-good)' : 'var(--rr-border)' }} /> : null}
                    </div>
                    <div className={`flex-1 min-w-0 ${last ? '' : 'pb-[16px]'}`}>
                      <div className="flex items-start gap-[10px]">
                        <div className="flex-1 min-w-0 pt-[4px]">
                          <div className="text-[14px] font-semibold text-text leading-[1.3]">{mission.missionName}</div>
                          {mission.description ? <div className="text-[12.5px] text-text2 leading-[1.45] mt-[3px]">{mission.description}</div> : null}
                        </div>
                        <span className="flex-none mt-[4px] inline-flex items-center h-[22px] px-[8px] rounded-[5px] text-[11px] font-semibold" style={{ color: st.fg, background: st.bg }}>{st.label}</span>
                      </div>
                      {mission.totalObjectives > 0 ? (
                        <div className="mt-[8px] flex items-center gap-[10px] max-w-[420px]">
                          <ProgressBar className="flex-1" value={mission.completedObjectives} max={mission.totalObjectives} showValue={false} height={5} color={mission.status === 'completed' ? 'var(--rr-good)' : 'var(--rr-accent)'} />
                          <span className="font-mono text-[11px] text-text3 whitespace-nowrap">{mission.completedObjectives}/{mission.totalObjectives} objectives</span>
                        </div>
                      ) : (
                        <div className="mt-[6px] text-[11.5px] text-text3">No graded objectives</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

      </div>
    </div>
  );
};

export default MyTraining;
