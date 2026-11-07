import React from 'react';
import { Chip, SectionCard, SectionLabel, Select, SquadronInsignia, StatusChip, legibleColor } from '../ui/primitives';
import type { Tone } from '../ui/primitives';
import QualificationBadge from '../ui/QualificationBadge';
import { formatDossierDate } from './dossierStyles';
import type { DossierProfile, DossierPilotOption } from '../../utils/dossierService';

interface DossierDetailsCardProps {
  callsign: string;
  boardNumber: string | number;
  discordUsername?: string | null;
  profile: DossierProfile | null;
  loading: boolean;
  // Pilot picker — only rendered when the viewer may see more than their own dossier
  viewablePilots: DossierPilotOption[];
  selectedPilotId: string;
  onSelectPilot: (pilotId: string) => void;
}

const ENROLLMENT_TONE: Record<string, Tone> = { active: 'accent', graduated: 'good', completed: 'good', withdrawn: 'muted', dropped: 'bad' };

/** Identity, assignment and current qualifications (Roster detail header pattern). */
const DossierDetailsCard: React.FC<DossierDetailsCardProps> = ({
  callsign,
  boardNumber,
  discordUsername,
  profile,
  loading,
  viewablePilots,
  selectedPilotId,
  onSelectPilot,
}) => {
  // Picker options grouped by squadron designation, board-number order
  const pickerOptions = [...viewablePilots]
    .sort((a, b) =>
      (a.squadronDesignation || 'zz').localeCompare(b.squadronDesignation || 'zz') ||
      String(a.boardNumber).localeCompare(String(b.boardNumber), undefined, { numeric: true }))
    .map(p => ({
      value: p.id,
      label: `${p.boardNumber} ${p.callsign}`,
      group: p.squadronDesignation || 'No squadron',
      searchText: `${p.boardNumber} ${p.callsign} ${p.squadronDesignation || ''}`,
    }));

  const sq = profile?.squadron || null;
  const boardColor = legibleColor(sq?.color_palette?.primary, 'var(--rr-text2)');
  const billet = profile?.roleName ? `${profile.roleName}${profile.roleIsActing ? ' (Acting)' : ''}` : null;

  const meta: Array<{ k: string; v: React.ReactNode }> = [
    { k: 'Status', v: profile?.statusName ? <StatusChip status={profile.statusName} size="sm" /> : '—' },
    { k: 'Standing', v: profile?.standingName ? <Chip size="sm" tone="neutral">{profile.standingName}</Chip> : '—' },
    { k: 'Billet', v: billet || '—' },
    { k: 'Discord', v: discordUsername ? <span className="font-mono text-[12px]">@{discordUsername}</span> : '—' },
  ];

  return (
    <SectionCard
      title="Pilot"
      className="h-full min-h-0"
      action={viewablePilots.length > 1 ? (
        <div className="w-[210px]">
          <Select size="sm" value={selectedPilotId} onChange={onSelectPilot} options={pickerOptions} searchable placeholder="Select pilot" />
        </div>
      ) : null}
    >
      <div className="h-full overflow-y-auto">
        {loading ? (
          <div className="py-6 text-center text-[12.5px] text-text2">Loading pilot details…</div>
        ) : (
          <>
            {/* Identity */}
            <div className="flex items-center gap-3 px-[14px] py-[14px] border-b border-border">
              <SquadronInsignia squadron={sq as any} size={52} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-[10px] min-w-0">
                  <span className="font-mono text-[20px] font-semibold" style={{ color: boardColor }}>{boardNumber}</span>
                  <span className="text-[20px] font-semibold truncate">{callsign}</span>
                </div>
                <div className="text-[12px] text-text2 truncate">
                  {sq ? `${sq.designation} ${sq.name || ''}`.trim() : 'No squadron assignment'}
                </div>
              </div>
            </div>

            {/* Assignment */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-[12px] px-[14px] py-[12px] border-b border-border">
              {meta.map(m => (
                <div key={m.k} className="min-w-0">
                  <div className="rr-label mb-[4px]">{m.k}</div>
                  <div className="text-[13px] font-semibold text-text truncate">{m.v}</div>
                </div>
              ))}
            </div>

            <div className="px-[14px] py-[12px] flex flex-col gap-[16px]">
              <div>
                <SectionLabel right={<span className="font-mono text-[10px] text-text3">{profile?.qualifications.length || 0}</span>}>Qualifications</SectionLabel>
                {profile && profile.qualifications.length > 0 ? (
                  <div className="flex flex-col gap-[6px]">
                    {profile.qualifications.map(q => (
                      <div key={q.id} className="flex items-center gap-[10px] min-w-0">
                        <QualificationBadge type={q.name} code={q.code || undefined} color={q.color || undefined} />
                        <span className="flex-1 min-w-0 truncate text-[13px] text-text">{q.name}</span>
                        <span className="font-mono text-[10.5px] text-text3 whitespace-nowrap">{formatDossierDate(q.achieved_date)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-text3">No qualifications recorded.</div>
                )}
              </div>

              <div>
                <SectionLabel>Training enrollments</SectionLabel>
                {profile && profile.enrollments.length > 0 ? (
                  <div className="flex flex-col gap-[6px]">
                    {profile.enrollments.map(e => (
                      <div key={e.id} className="flex items-center gap-[10px] min-w-0">
                        <span className="flex-1 min-w-0 truncate text-[13px] text-text">{e.cycleName}</span>
                        <Chip size="sm" tone={ENROLLMENT_TONE[(e.status || '').toLowerCase()] || 'muted'} className="capitalize">{e.status || 'Unknown'}</Chip>
                        <span className="font-mono text-[10.5px] text-text3 whitespace-nowrap">{formatDossierDate(e.enrolledAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-text3">No training enrollments.</div>
                )}
              </div>

              <div>
                <SectionLabel>Teams</SectionLabel>
                {profile && profile.teams.length > 0 ? (
                  <div className="flex flex-wrap gap-[6px]">
                    {profile.teams.map(t => <Chip key={t.id} tone="good">{t.name}</Chip>)}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-text3">No team memberships.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
};

export default DossierDetailsCard;
