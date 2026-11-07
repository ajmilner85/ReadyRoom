import React, { useState } from 'react';
import { Cycle } from '../../types/EventTypes';
import { Button, Chip, Dialog, EmptyState, Field, IconButton, SectionCard, Select } from '../ui/primitives';
import type { Tone } from '../ui/primitives';

// Enrollment with cycle data from getPilotEnrollmentHistory
interface EnrollmentWithCycle {
  id: string;
  cycle_id: string;
  pilot_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  status: 'active' | 'completed' | 'dropped' | 'graduated';
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_at: string;
  updated_at: string;
  cycles?: {
    name: string;
    start_date: string;
    end_date: string;
  };
}

interface TrainingEnrollmentsManagerProps {
  pilotEnrollments: EnrollmentWithCycle[];
  availableTrainingCycles: Cycle[];
  onAddEnrollment: (cycleId: string) => Promise<void>;
  onRemoveEnrollment: (enrollmentId: string) => Promise<void>;
  isLoading?: boolean;
  isUpdating?: boolean;
  className?: string;
}

type ComputedStatus = 'active' | 'completed' | 'dropped' | 'graduated' | 'upcoming';
const STATUS_TONE: Record<ComputedStatus, Tone> = { active: 'good', completed: 'info', graduated: 'info', dropped: 'bad', upcoming: 'warn' };

const COLS = 'grid grid-cols-[minmax(0,1fr)_92px_100px_100px_28px] items-center gap-x-3';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Dropped / graduated are manual; otherwise status follows the cycle dates. */
const computedStatus = (e: EnrollmentWithCycle): ComputedStatus => {
  if (e.status === 'dropped' || e.status === 'graduated') return e.status;
  if (!e.cycles) return e.status;
  const now = new Date();
  if (now < new Date(e.cycles.start_date)) return 'upcoming';
  if (now > new Date(e.cycles.end_date)) return 'completed';
  return 'active';
};

const TrainingEnrollmentsManager: React.FC<TrainingEnrollmentsManagerProps> = ({
  pilotEnrollments,
  availableTrainingCycles,
  onAddEnrollment,
  onRemoveEnrollment,
  isLoading = false,
  isUpdating = false,
  className,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  const trainingCycles = availableTrainingCycles.filter(c => c.type === 'Training');

  const closeDialog = () => {
    setShowAddDialog(false);
    setSelectedCycleId('');
  };

  const confirmAdd = async () => {
    if (!selectedCycleId) return;
    setIsAdding(true);
    try {
      await onAddEnrollment(selectedCycleId);
      closeDialog();
    } catch (error) {
      console.error('Failed to add enrollment:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await onRemoveEnrollment(id);
    } catch (error) {
      console.error('Failed to remove enrollment:', error);
    }
  };

  return (
    <>
      <SectionCard
        title="Training enrollments"
        count={isLoading ? undefined : pilotEnrollments.length}
        className={className}
        action={
          <Button size="sm" variant="ghost" icon="plus" onClick={() => { setSelectedCycleId(''); setShowAddDialog(true); }} disabled={isUpdating || availableTrainingCycles.length === 0}>
            Enroll
          </Button>
        }
      >
        {isLoading ? (
          <div className="px-[14px] py-6 text-center text-[12.5px] text-text2">Loading enrollments…</div>
        ) : pilotEnrollments.length === 0 ? (
          <EmptyState compact icon="training" title="No enrollments" message="Not enrolled in any training cycle." />
        ) : (
          <div>
            <div className={`${COLS} px-[14px] py-[7px] bg-panel2 border-b border-border font-mono text-[9.5px] tracking-[.1em] uppercase text-text2`}>
              <span>Cycle</span>
              <span>Status</span>
              <span>Enrolled</span>
              <span>Completed</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {pilotEnrollments.map(e => {
                const st = computedStatus(e);
                return (
                  <div key={e.id} className={`${COLS} px-[14px] min-h-[40px] py-[5px]`}>
                    <span className="text-[13px] font-medium text-text truncate">{e.cycles?.name || 'Unknown cycle'}</span>
                    <span><Chip size="sm" tone={STATUS_TONE[st]}>{st.charAt(0).toUpperCase() + st.slice(1)}</Chip></span>
                    <span className="font-mono text-[11.5px] text-text2">{fmt(e.enrolled_at)}</span>
                    <span className="font-mono text-[11.5px] text-text2">
                      {(e.status === 'graduated' || e.status === 'completed') && e.status_changed_at ? fmt(e.status_changed_at) : '—'}
                    </span>
                    <IconButton
                      icon="close"
                      size={24}
                      iconSize={12}
                      label="Remove enrollment"
                      className="hover:!text-bad"
                      disabled={isUpdating}
                      onClick={() => remove(e.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={showAddDialog}
        onClose={closeDialog}
        title="Add training enrollment"
        width={440}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={isAdding}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={confirmAdd} disabled={!selectedCycleId || isAdding} loading={isAdding}>Add enrollment</Button>
          </>
        }
      >
        <Field label="Training cycle" required hint={trainingCycles.length === 0 ? 'No training cycles available.' : undefined}>
          <Select
            value={selectedCycleId}
            onChange={setSelectedCycleId}
            placeholder="Choose a cycle…"
            disabled={isAdding}
            options={trainingCycles.map(c => ({ value: c.id, label: c.name, description: c.status, searchText: c.name }))}
          />
        </Field>
      </Dialog>
    </>
  );
};

export default TrainingEnrollmentsManager;
