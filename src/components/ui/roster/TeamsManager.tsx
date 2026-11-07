import React, { useState } from 'react';
import { Team } from '../../../types/TeamTypes';
import { Button, Chip, Dialog, EmptyState, Field, IconButton, SectionCard, Select, controlClass } from '../primitives';

interface TeamsManagerProps {
  pilotTeams: any[];
  availableTeams: Team[];
  selectedTeam: string;
  teamStartDate: string;
  loadingTeams: boolean;
  isAddingTeam: boolean;
  updatingTeams: boolean;
  setSelectedTeam: (id: string) => void;
  setTeamStartDate: (date: string) => void;
  handleAddTeam: () => void;
  handleRemoveTeam: (recordId: string) => void;
  className?: string;
}

const COLS = 'grid grid-cols-[minmax(0,1fr)_90px_92px_28px] items-center gap-x-3';

const scopeLabel = (team: Team) => (team.scope === 'global' ? 'Global' : team.scope.charAt(0).toUpperCase() + team.scope.slice(1));

/** Active team memberships: team · scope · joined. */
const TeamsManager: React.FC<TeamsManagerProps> = ({
  pilotTeams,
  availableTeams,
  selectedTeam,
  teamStartDate,
  loadingTeams,
  isAddingTeam,
  updatingTeams,
  setSelectedTeam,
  setTeamStartDate,
  handleAddTeam,
  handleRemoveTeam,
  className,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const closeDialog = () => {
    setShowAddDialog(false);
    setSelectedTeam('');
  };
  const save = () => {
    handleAddTeam();
    closeDialog();
  };

  const rows = pilotTeams
    .filter(pt => !pt.end_date) // active memberships only
    .sort((a, b) => (a.team?.name || '').localeCompare(b.team?.name || ''));

  return (
    <>
      <SectionCard
        title="Teams"
        count={loadingTeams ? undefined : rows.length}
        className={className}
        action={
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setShowAddDialog(true)} disabled={isAddingTeam || updatingTeams}>
            Add to team
          </Button>
        }
      >
        {loadingTeams ? (
          <div className="px-[14px] py-6 text-center text-[12.5px] text-text2">Loading teams…</div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon="layers" title="No teams" message="Not a member of any teams." />
        ) : (
          <div>
            <div className={`${COLS} px-[14px] py-[7px] bg-panel2 border-b border-border font-mono text-[9.5px] tracking-[.1em] uppercase text-text2`}>
              <span>Team</span>
              <span>Scope</span>
              <span>Joined</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {rows.map(pt => (
                <div key={pt.id} className={`${COLS} px-[14px] min-h-[40px] py-[5px]`}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium text-text truncate">{pt.team?.name || 'Unknown team'}</span>
                    {pt.team && !pt.team.active ? <Chip size="sm" tone="bad">Inactive</Chip> : null}
                  </span>
                  <span className="text-[12px] text-text2">{pt.team ? scopeLabel(pt.team) : '—'}</span>
                  <span className="font-mono text-[11.5px] text-text2">
                    {pt.start_date ? new Date(pt.start_date + 'T00:00:00').toLocaleDateString() : '—'}
                  </span>
                  <IconButton
                    icon="close"
                    size={24}
                    iconSize={12}
                    label="Remove from team"
                    className="hover:!text-bad"
                    disabled={updatingTeams}
                    onClick={() => handleRemoveTeam(pt.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={showAddDialog}
        onClose={closeDialog}
        title="Add to team"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={isAddingTeam}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={save} disabled={!selectedTeam || isAddingTeam} loading={isAddingTeam}>Add</Button>
          </>
        }
      >
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px' }}>
          <Field label="Team" required>
            <Select
              value={selectedTeam}
              onChange={setSelectedTeam}
              placeholder="Select team"
              options={availableTeams
                .filter(t => t.active)
                .map(t => ({ value: t.id, label: t.name, description: scopeLabel(t), searchText: t.name }))}
            />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={teamStartDate}
              onChange={e => setTeamStartDate(e.target.value)}
              disabled={isAddingTeam}
              className={`${controlClass} px-3 h-[36px]`}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
};

export default TeamsManager;
