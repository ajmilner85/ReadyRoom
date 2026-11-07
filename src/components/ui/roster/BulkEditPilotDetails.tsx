import React, { useState, useEffect, useMemo } from 'react';
import type { Pilot } from '../../../utils/pilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Squadron } from '../../../utils/squadronService';
import { Qualification } from '../../../utils/qualificationService';
import type { Team, PilotTeam } from '../../../types/TeamTypes';
import { UNASSIGN_SQUADRON } from './rosterConstants';
import { Button, Chip, Dialog, EmptyState, Field, IconButton, SectionCard, Select, SquadronInsignia, TextInput, controlClass } from '../primitives';
import QualificationBadge from '../QualificationBadge';

interface BulkEditPilotDetailsProps {
  selectedPilots: Pilot[];
  statuses: Status[];
  standings: Standing[];
  squadrons: Squadron[];
  availableQualifications: Qualification[];
  allPilotQualifications: Record<string, any[]>;
  availableTeams: Team[];
  allPilotTeams: Record<string, PilotTeam[]>;
  onBulkStatusChange: (statusId: string) => Promise<void>;
  onBulkStandingChange: (standingId: string) => Promise<void>;
  onBulkSquadronChange: (squadronId: string) => Promise<void>;
  onBulkAddQualification: (qualificationId: string, achievedDate: string) => Promise<void>;
  onBulkRemoveQualification: (qualificationId: string) => Promise<void>;
  onBulkAddTeam: (teamId: string, startDate: string) => Promise<void>;
  onBulkRemoveTeam: (teamId: string) => Promise<void>;
  onBulkAddEnrollment?: (cycleId: string) => Promise<void>;
  onBulkRemoveEnrollment?: (enrollmentId: string) => Promise<void>;
  allPilotEnrollments?: Record<string, any[]>;
  availableTrainingCycles?: any[];
  onBulkDeletePilots: () => Promise<void>;
  onBulkClearDiscord: () => Promise<void>;
}

interface CommonQualification {
  id: string;
  name: string;
  code?: string;
  color?: string;
  earliestAchieved: string;
  latestAchieved: string;
  earliestExpiry?: string;
  latestExpiry?: string;
}

interface CommonTeam {
  id: string;
  name: string;
  scope: 'global' | 'wing' | 'squadron';
  earliestJoined: string;
  latestJoined: string;
}

interface CommonEnrollment {
  enrollmentId: string;
  cycleId: string;
  cycleName: string;
  status: 'active' | 'completed' | 'dropped' | 'graduated';
  earliestEnrolled: string;
  latestEnrolled: string;
}

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  onConfirm,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!isOpen) setInputValue('');
  }, [isOpen]);

  const isConfirmEnabled = inputValue.toLowerCase() === 'yes';

  return (
    <Dialog
      open={isOpen}
      onClose={onCancel}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => { if (isConfirmEnabled) onConfirm(); }} disabled={!isConfirmEnabled}>{confirmText}</Button>
        </>
      }
    >
      <p className="m-0 mb-[14px] text-[13px] text-text2 leading-[1.55]">{message}</p>
      <Field label={<>Type <span className="text-text">yes</span> to confirm</>}>
        <TextInput
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="yes"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && isConfirmEnabled) onConfirm(); }}
        />
      </Field>
    </Dialog>
  );
};

const BulkEditPilotDetails: React.FC<BulkEditPilotDetailsProps> = ({
  selectedPilots,
  statuses,
  standings,
  squadrons,
  availableQualifications,
  allPilotQualifications,
  availableTeams,
  allPilotTeams,
  onBulkStatusChange,
  onBulkStandingChange,
  onBulkSquadronChange,
  onBulkAddQualification,
  onBulkRemoveQualification,
  onBulkAddTeam,
  onBulkRemoveTeam,
  onBulkAddEnrollment,
  onBulkRemoveEnrollment,
  allPilotEnrollments = {},
  availableTrainingCycles = [],
  onBulkDeletePilots,
  onBulkClearDiscord
}) => {
  const [showAddQualDialog, setShowAddQualDialog] = useState(false);
  const [showAddTeamDialog, setShowAddTeamDialog] = useState(false);
  const [showAddEnrollmentDialog, setShowAddEnrollmentDialog] = useState(false);

  // Track pending changes
  const [pendingStatusId, setPendingStatusId] = useState<string>('');
  const [pendingStandingId, setPendingStandingId] = useState<string>('');
  const [pendingSquadronId, setPendingSquadronId] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedQualification, setSelectedQualification] = useState('');
  const [achievedDate, setAchievedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamStartDate, setTeamStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete_pilots' | 'clear_discord' | 'remove_qualification' | 'remove_team' | 'remove_enrollment';
    qualificationId?: string;
    teamId?: string;
    enrollmentId?: string;
  } | null>(null);

  // Calculate common qualifications across all selected pilots
  const commonQualifications = useMemo((): CommonQualification[] => {
    if (selectedPilots.length === 0) return [];

    // Get qualifications for first pilot
    const firstPilotQuals = allPilotQualifications[selectedPilots[0].id] || [];
    const qualMap = new Map<string, CommonQualification>();

    firstPilotQuals.forEach((pq: any) => {
      const qual = pq.qualification;
      qualMap.set(qual.id, {
        id: qual.id,
        name: qual.name,
        code: qual.code,
        color: qual.color,
        earliestAchieved: pq.achieved_date,
        latestAchieved: pq.achieved_date,
        earliestExpiry: pq.expiry_date,
        latestExpiry: pq.expiry_date
      });
    });

    // Check each other pilot to find common qualifications
    for (let i = 1; i < selectedPilots.length; i++) {
      const pilotQuals = allPilotQualifications[selectedPilots[i].id] || [];
      const pilotQualIds = new Set(pilotQuals.map((pq: any) => pq.qualification.id));

      // Remove qualifications not present in this pilot
      for (const [qualId, commonQual] of qualMap.entries()) {
        if (!pilotQualIds.has(qualId)) {
          qualMap.delete(qualId);
        } else {
          // Update date ranges
          const pilotQual = pilotQuals.find((pq: any) => pq.qualification.id === qualId);
          if (pilotQual) {
            if (pilotQual.achieved_date < commonQual.earliestAchieved) {
              commonQual.earliestAchieved = pilotQual.achieved_date;
            }
            if (pilotQual.achieved_date > commonQual.latestAchieved) {
              commonQual.latestAchieved = pilotQual.achieved_date;
            }
            if (pilotQual.expiry_date) {
              if (!commonQual.earliestExpiry || pilotQual.expiry_date < commonQual.earliestExpiry) {
                commonQual.earliestExpiry = pilotQual.expiry_date;
              }
              if (!commonQual.latestExpiry || pilotQual.expiry_date > commonQual.latestExpiry) {
                commonQual.latestExpiry = pilotQual.expiry_date;
              }
            }
          }
        }
      }
    }

    return Array.from(qualMap.values());
  }, [selectedPilots, allPilotQualifications]);

  // Calculate common teams across all selected pilots
  const commonTeams = useMemo((): CommonTeam[] => {
    if (selectedPilots.length === 0) return [];

    // Get teams for first pilot
    const firstPilotTeams = allPilotTeams[selectedPilots[0].id] || [];
    const teamMap = new Map<string, CommonTeam>();

    // Only consider active team memberships (no end_date)
    firstPilotTeams
      .filter(pt => !pt.end_date)
      .forEach((pt: PilotTeam) => {
        if (pt.team) {
          teamMap.set(pt.team.id, {
            id: pt.team.id,
            name: pt.team.name,
            scope: pt.team.scope,
            earliestJoined: pt.start_date,
            latestJoined: pt.start_date
          });
        }
      });

    // Check each other pilot to find common teams
    for (let i = 1; i < selectedPilots.length; i++) {
      const pilotTeams = allPilotTeams[selectedPilots[i].id] || [];
      const pilotActiveTeamIds = new Set(
        pilotTeams.filter(pt => !pt.end_date).map(pt => pt.team_id)
      );

      // Remove teams not present in this pilot
      for (const [teamId, commonTeam] of teamMap.entries()) {
        if (!pilotActiveTeamIds.has(teamId)) {
          teamMap.delete(teamId);
        } else {
          // Update date ranges
          const pilotTeam = pilotTeams.find(pt => pt.team_id === teamId && !pt.end_date);
          if (pilotTeam) {
            if (pilotTeam.start_date < commonTeam.earliestJoined) {
              commonTeam.earliestJoined = pilotTeam.start_date;
            }
            if (pilotTeam.start_date > commonTeam.latestJoined) {
              commonTeam.latestJoined = pilotTeam.start_date;
            }
          }
        }
      }
    }

    return Array.from(teamMap.values());
  }, [selectedPilots, allPilotTeams]);

  // Calculate common training enrollments
  const commonEnrollments = useMemo((): CommonEnrollment[] => {
    if (selectedPilots.length === 0) return [];

    // Get enrollments for first pilot
    const firstPilotEnrollments = allPilotEnrollments[selectedPilots[0].id] || [];
    const enrollmentMap = new Map<string, CommonEnrollment>();

    // Only consider active enrollments
    firstPilotEnrollments
      .filter((e: any) => e.status === 'active')
      .forEach((e: any) => {
        if (e.cycle_id) {
          enrollmentMap.set(e.cycle_id, {
            enrollmentId: e.id,
            cycleId: e.cycle_id,
            cycleName: e.cycles?.name || 'Unknown Cycle',
            status: e.status,
            earliestEnrolled: e.enrolled_at,
            latestEnrolled: e.enrolled_at
          });
        }
      });

    // Check each other pilot to find common enrollments
    for (let i = 1; i < selectedPilots.length; i++) {
      const pilotEnrollments = allPilotEnrollments[selectedPilots[i].id] || [];
      const pilotActiveCycleIds = new Set(
        pilotEnrollments.filter((e: any) => e.status === 'active').map((e: any) => e.cycle_id)
      );

      // Remove cycles not present in this pilot
      for (const [cycleId, commonEnrollment] of enrollmentMap.entries()) {
        if (!pilotActiveCycleIds.has(cycleId)) {
          enrollmentMap.delete(cycleId);
        } else {
          // Update date ranges
          const pilotEnrollment = pilotEnrollments.find((e: any) => e.cycle_id === cycleId && e.status === 'active');
          if (pilotEnrollment) {
            if (pilotEnrollment.enrolled_at < commonEnrollment.earliestEnrolled) {
              commonEnrollment.earliestEnrolled = pilotEnrollment.enrolled_at;
            }
            if (pilotEnrollment.enrolled_at > commonEnrollment.latestEnrolled) {
              commonEnrollment.latestEnrolled = pilotEnrollment.enrolled_at;
            }
          }
        }
      }
    }

    return Array.from(enrollmentMap.values());
  }, [selectedPilots, allPilotEnrollments]);


  const handleAddQualification = async () => {
    console.log('[BulkEditPilotDetails] handleAddQualification called with:', { selectedQualification, achievedDate });

    if (!selectedQualification) {
      console.log('[BulkEditPilotDetails] No qualification selected, returning early');
      return;
    }

    console.log('[BulkEditPilotDetails] Calling onBulkAddQualification...');
    await onBulkAddQualification(selectedQualification, achievedDate);
    console.log('[BulkEditPilotDetails] onBulkAddQualification completed, cleaning up dialog');

    setShowAddQualDialog(false);
    setSelectedQualification('');
    setAchievedDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddTeam = async () => {
    if (!selectedTeam) return;

    await onBulkAddTeam(selectedTeam, teamStartDate);

    setShowAddTeamDialog(false);
    setSelectedTeam('');
    setTeamStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddEnrollment = async () => {
    if (!selectedCycle || !onBulkAddEnrollment) return;

    await onBulkAddEnrollment(selectedCycle);

    setShowAddEnrollmentDialog(false);
    setSelectedCycle('');
  };

  const handleStatusChange = (statusId: string) => {
    setPendingStatusId(statusId);
    setHasUnsavedChanges(true);
  };

  const handleStandingChange = (standingId: string) => {
    setPendingStandingId(standingId);
    setHasUnsavedChanges(true);
  };

  const handleSquadronChange = (squadronId: string) => {
    setPendingSquadronId(squadronId);
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    try {
      if (pendingStatusId) {
        await onBulkStatusChange(pendingStatusId);
      }
      if (pendingStandingId) {
        await onBulkStandingChange(pendingStandingId);
      }
      if (pendingSquadronId) {
        await onBulkSquadronChange(pendingSquadronId);
      }

      // Reset pending changes
      setPendingStatusId('');
      setPendingStandingId('');
      setPendingSquadronId('');
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving bulk changes:', error);
    }
  };

  const handleCancelChanges = () => {
    setPendingStatusId('');
    setPendingStandingId('');
    setPendingSquadronId('');
    setHasUnsavedChanges(false);
  };

  // ---- View -----------------------------------------------------------------------------------
  const n = selectedPilots.length;
  const plural = (word: string) => `${word}${n === 1 ? '' : 's'}`;
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');
  const range = (a?: string, b?: string) => (!a ? '—' : !b || a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);

  const statusOptions = [...statuses].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.name }));
  const standingOptions = [...standings].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.name }));
  const squadronOptions = [
    { value: UNASSIGN_SQUADRON, label: 'Unassigned', description: 'Remove squadron affiliation', searchText: 'Unassigned' },
    ...[...squadrons]
      .filter(sq => !sq.deactivated_date)
      .sort((a, b) => a.designation.localeCompare(b.designation))
      .map(sq => ({ value: sq.id, label: sq.designation, description: sq.name, searchText: `${sq.designation} ${sq.name}`, icon: <SquadronInsignia squadron={sq as any} size={18} /> })),
  ];
  const linkedCount = selectedPilots.filter(p => p.discord_username).length;
  const COL = 'grid items-center gap-x-3 px-[14px]';
  const headCls = 'py-[7px] bg-panel2 border-b border-border font-mono text-[9.5px] tracking-[.1em] uppercase text-text2';
  const removeBtn = (label: string, onClick: () => void) => (
    <IconButton icon="close" size={24} iconSize={12} label={label} className="hover:!text-bad" onClick={onClick} />
  );
  const dateInput = (value: string, onChange: (v: string) => void) => (
    <input type="date" value={value} onChange={e => onChange(e.target.value)} className={`${controlClass} px-3 h-[36px]`} />
  );

  const confirmProps = (() => {
    switch (confirmDialog?.type) {
      case 'delete_pilots':
        return { title: `Delete ${n} ${plural('pilot')}`, message: `Delete ${n} pilot ${plural('record')}? This can't be undone.`, confirmText: 'Delete', run: onBulkDeletePilots };
      case 'clear_discord':
        return { title: 'Unlink Discord accounts', message: `Clear the linked Discord account from ${n} ${plural('pilot')}?`, confirmText: 'Unlink', run: onBulkClearDiscord };
      case 'remove_qualification':
        return { title: 'Remove qualification', message: `Remove this qualification from all ${n} selected ${plural('pilot')}?`, confirmText: 'Remove', run: async () => { if (confirmDialog.qualificationId) await onBulkRemoveQualification(confirmDialog.qualificationId); } };
      case 'remove_team':
        return { title: 'Remove from team', message: `Remove all ${n} selected ${plural('pilot')} from this team?`, confirmText: 'Remove', run: async () => { if (confirmDialog.teamId) await onBulkRemoveTeam(confirmDialog.teamId); } };
      case 'remove_enrollment':
        return { title: 'Remove training enrollment', message: `Remove this training enrollment from all ${n} selected ${plural('pilot')}?`, confirmText: 'Remove', run: async () => { if (confirmDialog.enrollmentId && onBulkRemoveEnrollment) await onBulkRemoveEnrollment(confirmDialog.enrollmentId); } };
      default:
        return null;
    }
  })();

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden">
      {/* Header: count + who is selected */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className="w-10 h-10 flex-none rounded-rr-lg bg-accent-weak text-accent-text flex items-center justify-center font-mono text-[15px] font-bold">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-semibold">Editing {n} {plural('pilot')}</div>
          <div className="text-[12px] text-text2 truncate" title={selectedPilots.map(p => `${p.boardNumber} ${p.callsign}`).join(', ')}>
            {selectedPilots.slice(0, 8).map(p => p.callsign).join(', ')}{n > 8 ? ` +${n - 8} more` : ''}
          </div>
        </div>
        <IconButton icon="trash" size={30} iconSize={14} label={`Delete ${n} ${plural('pilot')}`} className="hover:!text-bad" onClick={() => setConfirmDialog({ type: 'delete_pilots' })} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid gap-[14px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))' }}>
          {/* Assignment changes (staged; applied with Save) */}
          <SectionCard title="Set for all" footer="Leave a field empty to keep each pilot's current value.">
            <div className="grid grid-cols-2 gap-[14px] p-[14px] max-[560px]:grid-cols-1">
              <Field label="Status">
                <Select value={pendingStatusId} onChange={handleStatusChange} options={statusOptions} placeholder="Keep current" />
              </Field>
              <Field label="Standing">
                <Select value={pendingStandingId} onChange={handleStandingChange} options={standingOptions} placeholder="Keep current" />
              </Field>
              <Field label="Squadron" className="col-span-2 max-[560px]:col-span-1">
                <Select value={pendingSquadronId} onChange={handleSquadronChange} options={squadronOptions} placeholder="Keep current" searchable={squadronOptions.length > 8} />
              </Field>
            </div>
          </SectionCard>

          {/* Discord */}
          <SectionCard title="Discord">
            <div className="p-[14px] flex items-center gap-3">
              <span className="flex-1 text-[13px] text-text2">
                <span className="font-mono font-semibold text-text">{linkedCount}</span> of {n} selected {plural('pilot')} have a Discord account linked.
              </span>
              <Button size="sm" variant="danger" icon="close" disabled={linkedCount === 0} onClick={() => setConfirmDialog({ type: 'clear_discord' })}>Unlink all</Button>
            </div>
          </SectionCard>

          {/* Common qualifications */}
          <div className="col-span-full">
            <SectionCard
              title="Qualifications in common"
              count={commonQualifications.length}
              action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setShowAddQualDialog(true)}>Add to all</Button>}
            >
              {commonQualifications.length === 0 ? (
                <EmptyState compact icon="award" title="None in common" message="No qualification is held by every selected pilot." />
              ) : (
                <>
                  <div className={`${COL} grid-cols-[52px_minmax(0,1fr)_minmax(0,170px)_minmax(0,170px)_28px] ${headCls}`}>
                    <span /><span>Qualification</span><span>Achieved</span><span>Expires</span><span />
                  </div>
                  <div className="divide-y divide-border">
                    {commonQualifications.map(q => (
                      <div key={q.id} className={`${COL} grid-cols-[52px_minmax(0,1fr)_minmax(0,170px)_minmax(0,170px)_28px] min-h-[40px] py-[5px]`}>
                        <span className="flex justify-center"><QualificationBadge type={q.name} code={q.code} color={q.color} size="normal" /></span>
                        <span className="text-[13px] font-medium text-text truncate">{q.name}</span>
                        <span className="font-mono text-[11.5px] text-text2">{range(q.earliestAchieved, q.latestAchieved)}</span>
                        <span className="font-mono text-[11.5px] text-text2">{range(q.earliestExpiry, q.latestExpiry)}</span>
                        {removeBtn('Remove from all', () => setConfirmDialog({ type: 'remove_qualification', qualificationId: q.id }))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          {/* Common enrollments */}
          <SectionCard
            title="Enrollments in common"
            count={commonEnrollments.length}
            action={onBulkAddEnrollment ? <Button size="sm" variant="ghost" icon="plus" onClick={() => setShowAddEnrollmentDialog(true)}>Enroll all</Button> : null}
          >
            {commonEnrollments.length === 0 ? (
              <EmptyState compact icon="training" title="None in common" message="No active enrollment shared by every selected pilot." />
            ) : (
              <>
                <div className={`${COL} grid-cols-[minmax(0,1fr)_minmax(0,160px)_28px] ${headCls}`}>
                  <span>Cycle</span><span>Enrolled</span><span />
                </div>
                <div className="divide-y divide-border">
                  {commonEnrollments.map(e => (
                    <div key={e.cycleId} className={`${COL} grid-cols-[minmax(0,1fr)_minmax(0,160px)_28px] min-h-[40px] py-[5px]`}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium text-text truncate">{e.cycleName}</span>
                        <Chip size="sm" tone="good">Active</Chip>
                      </span>
                      <span className="font-mono text-[11.5px] text-text2">{range(e.earliestEnrolled, e.latestEnrolled)}</span>
                      {removeBtn('Remove from all', () => setConfirmDialog({ type: 'remove_enrollment', enrollmentId: e.enrollmentId }))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          {/* Common teams */}
          <SectionCard
            title="Teams in common"
            count={commonTeams.length}
            action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setShowAddTeamDialog(true)}>Add all to team</Button>}
          >
            {commonTeams.length === 0 ? (
              <EmptyState compact icon="layers" title="None in common" message="No team includes every selected pilot." />
            ) : (
              <>
                <div className={`${COL} grid-cols-[minmax(0,1fr)_80px_minmax(0,150px)_28px] ${headCls}`}>
                  <span>Team</span><span>Scope</span><span>Joined</span><span />
                </div>
                <div className="divide-y divide-border">
                  {commonTeams.map(t => (
                    <div key={t.id} className={`${COL} grid-cols-[minmax(0,1fr)_80px_minmax(0,150px)_28px] min-h-[40px] py-[5px]`}>
                      <span className="text-[13px] font-medium text-text truncate">{t.name}</span>
                      <span className="text-[12px] text-text2">{t.scope.charAt(0).toUpperCase() + t.scope.slice(1)}</span>
                      <span className="font-mono text-[11.5px] text-text2">{range(t.earliestJoined, t.latestJoined)}</span>
                      {removeBtn('Remove all from team', () => setConfirmDialog({ type: 'remove_team', teamId: t.id }))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Save bar (always present so the body never resizes) */}
      <div className="flex-none flex items-center gap-[10px] px-4 py-[10px] border-t border-border bg-panel2">
        <span className="flex items-center gap-[7px] flex-1 min-w-0 text-[12px] text-text2 whitespace-nowrap" title="Qualifications, enrollments and teams apply as soon as you add or remove them.">
          <span className="flex-none w-[7px] h-[7px] rounded-full" style={hasUnsavedChanges ? { background: 'var(--rr-warn)' } : { boxShadow: 'inset 0 0 0 1.5px var(--rr-text3)' }} />
          <span className="truncate">{hasUnsavedChanges ? `Unsaved changes for ${n} ${plural('pilot')}` : 'No unsaved changes'}</span>
        </span>
        <Button variant="secondary" onClick={handleCancelChanges} disabled={!hasUnsavedChanges}>Discard</Button>
        <Button variant="primary" icon="save" onClick={handleSaveChanges} disabled={!hasUnsavedChanges}>Apply to {n}</Button>
      </div>

      {/* Add qualification to all */}
      <Dialog
        open={showAddQualDialog}
        onClose={() => setShowAddQualDialog(false)}
        title={`Add qualification to ${n} ${plural('pilot')}`}
        width={500}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddQualDialog(false)}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={handleAddQualification} disabled={!selectedQualification}>Add to all</Button>
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
          <Field label="Achieved">{dateInput(achievedDate, setAchievedDate)}</Field>
        </div>
      </Dialog>

      {/* Add all to team */}
      <Dialog
        open={showAddTeamDialog}
        onClose={() => setShowAddTeamDialog(false)}
        title={`Add ${n} ${plural('pilot')} to a team`}
        width={500}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddTeamDialog(false)}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={handleAddTeam} disabled={!selectedTeam}>Add to team</Button>
          </>
        }
      >
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px' }}>
          <Field label="Team" required>
            <Select
              value={selectedTeam}
              onChange={setSelectedTeam}
              placeholder="Select team"
              options={availableTeams.filter(t => t.active).map(t => ({ value: t.id, label: t.name, description: t.scope.charAt(0).toUpperCase() + t.scope.slice(1), searchText: t.name }))}
            />
          </Field>
          <Field label="Start date">{dateInput(teamStartDate, setTeamStartDate)}</Field>
        </div>
      </Dialog>

      {/* Enroll all */}
      <Dialog
        open={showAddEnrollmentDialog}
        onClose={() => setShowAddEnrollmentDialog(false)}
        title={`Enroll ${n} ${plural('pilot')}`}
        width={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddEnrollmentDialog(false)}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={handleAddEnrollment} disabled={!selectedCycle}>Enroll all</Button>
          </>
        }
      >
        <Field label="Training cycle" required>
          <Select
            value={selectedCycle}
            onChange={setSelectedCycle}
            placeholder="Choose a cycle…"
            options={availableTrainingCycles.filter((c: any) => c.type === 'Training').map((c: any) => ({ value: c.id, label: c.name, description: c.status, searchText: c.name }))}
          />
        </Field>
      </Dialog>

      {/* Type-"yes" confirmation for destructive bulk actions */}
      <ConfirmationDialog
        isOpen={Boolean(confirmProps)}
        title={confirmProps?.title || ''}
        message={confirmProps?.message || ''}
        confirmText={confirmProps?.confirmText || 'Confirm'}
        onConfirm={async () => {
          await confirmProps?.run();
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
};

export default BulkEditPilotDetails;
