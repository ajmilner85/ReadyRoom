import React, { useState } from 'react';
import { Qualification } from '../../../utils/qualificationService';
import QualificationBadge from '../QualificationBadge';
import { Button, Chip, Dialog, EmptyState, Field, IconButton, SectionCard, Select, controlClass } from '../primitives';

interface QualificationsManagerProps {
  pilotQualifications: any[];
  availableQualifications: Qualification[];
  selectedQualification: string;
  qualificationAchievedDate: string;
  loadingQualifications: boolean;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (recordId: string) => void; // pilot_qualifications record id
  className?: string;
}

const COLS = 'grid grid-cols-[52px_minmax(0,1fr)_92px_120px_28px] items-center gap-x-3';

/** Expiry = achieved + validity period (expirable qualifications only). */
const expiryOf = (achievedDate: string | null, q: Qualification): Date | null => {
  if (!achievedDate || !q?.is_expirable || !q?.validity_period) return null;
  const achieved = new Date(achievedDate);
  if (isNaN(achieved.getTime())) return null;
  const d = new Date(achieved);
  d.setDate(d.getDate() + q.validity_period);
  return d;
};
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400000);

/** Pilot qualifications card: badge · name · achieved · expires (warn ≤30 days, bad when expired). */
const QualificationsManager: React.FC<QualificationsManagerProps> = ({
  pilotQualifications,
  availableQualifications,
  selectedQualification,
  qualificationAchievedDate,
  loadingQualifications,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleAddQualification,
  handleRemoveQualification,
  className,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const closeDialog = () => {
    setShowAddDialog(false);
    setSelectedQualification('');
  };
  const save = () => {
    handleAddQualification();
    closeDialog();
  };

  // Order by configured qualification order, newest record first for repeats (copy: props stay untouched)
  const rows = [...pilotQualifications].sort((a, b) => {
    const orderDiff = (a.qualification?.order ?? 0) - (b.qualification?.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.achieved_date || 0).getTime() - new Date(a.achieved_date || 0).getTime();
  });

  const repeatLabel = (pq: any) => {
    const same = rows.filter(r => r.qualification_id === pq.qualification_id);
    if (same.length < 2) return null;
    return same[0].id === pq.id ? 'Current' : 'Previous';
  };

  return (
    <>
      <SectionCard
        title="Qualifications"
        count={loadingQualifications ? undefined : rows.length}
        className={className}
        action={
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setShowAddDialog(true)} disabled={isAddingQualification || updatingQualifications}>
            Add qualification
          </Button>
        }
      >
        {loadingQualifications ? (
          <div className="px-[14px] py-6 text-center text-[12.5px] text-text2">Loading qualifications…</div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon="award" title="No qualifications" message="Add the qualifications this pilot holds." />
        ) : (
          <div>
            <div className={`${COLS} px-[14px] py-[7px] bg-panel2 border-b border-border font-mono text-[9.5px] tracking-[.1em] uppercase text-text2`}>
              <span />
              <span>Qualification</span>
              <span>Achieved</span>
              <span>Expires</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {rows.map(pq => {
                const expiry = expiryOf(pq.achieved_date, pq.qualification);
                const left = expiry ? daysUntil(expiry) : null;
                const tone = left === null ? null : left < 0 ? 'var(--rr-bad)' : left <= 30 ? 'var(--rr-warn)' : null;
                const rep = repeatLabel(pq);
                return (
                  <div key={pq.id} className={`${COLS} px-[14px] min-h-[40px] py-[5px]`}>
                    <span className="flex justify-center">
                      <QualificationBadge type={pq.qualification.name} qualifications={availableQualifications} size="normal" />
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-text truncate">{pq.qualification.name}</span>
                      {rep ? <Chip size="sm" tone={rep === 'Current' ? 'neutral' : 'muted'}>{rep}</Chip> : null}
                    </span>
                    <span className="font-mono text-[11.5px] text-text2">
                      {pq.achieved_date ? new Date(pq.achieved_date).toLocaleDateString() : '—'}
                    </span>
                    <span className="flex flex-col leading-[1.2]" style={tone ? { color: tone } : undefined}>
                      <span className={`font-mono text-[11.5px] ${tone ? 'font-semibold' : 'text-text2'}`}>{expiry ? expiry.toLocaleDateString() : '—'}</span>
                      {left !== null ? (
                        <span className={`text-[10.5px] ${tone ? '' : 'text-text3'}`}>
                          {left < 0 ? `${Math.abs(left)} days ago` : left === 0 ? 'today' : `in ${left} days`}
                        </span>
                      ) : null}
                    </span>
                    <IconButton
                      icon="close"
                      size={24}
                      iconSize={12}
                      label="Remove qualification"
                      className="hover:!text-bad"
                      disabled={updatingQualifications}
                      onClick={() => handleRemoveQualification(pq.id)}
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
        title="Add qualification"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={isAddingQualification}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={save} disabled={!selectedQualification || isAddingQualification} loading={isAddingQualification}>
              Add
            </Button>
          </>
        }
      >
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px' }}>
          <Field label="Qualification" required>
            <Select
              value={selectedQualification}
              onChange={setSelectedQualification}
              placeholder="Select qualification"
              searchable
              options={availableQualifications.map(q => ({
                value: q.id,
                label: q.name,
                searchText: `${q.name} ${(q as any).code || ''}`,
                icon: <QualificationBadge type={q.name as any} qualifications={availableQualifications} size="small" />,
              }))}
            />
          </Field>
          <Field label="Achieved">
            <input
              type="date"
              value={qualificationAchievedDate}
              onChange={e => setQualificationAchievedDate(e.target.value)}
              disabled={isAddingQualification}
              className={`${controlClass} px-3 h-[36px]`}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
};

export default QualificationsManager;
