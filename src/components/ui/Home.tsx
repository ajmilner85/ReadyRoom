import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useAuth } from '../../context/AuthContext';
import { usePageHeader } from '../../context/ShellContext';
import PollCard from './polls/PollCard';
import ChangeLogCard from './change-log/ChangeLogCard';
import CreatePollDialog from './polls/CreatePollDialog';
import PollManagementDialog from './polls/PollManagementDialog';
import { Chip, EmptyState, Icon, QualTag, StatTile, Tone } from './primitives';
import {
  ExpiringQual, LastMissionInfo, NextEventInfo, RsvpState,
  fetchLastMission, fetchMyExpiringQuals, fetchMyResponses, fetchUpcomingEvents,
} from '../home/homeService';

const relDays = (iso: string) => {
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};
const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const RSVP_LABEL: Record<Exclude<RsvpState, null>, { label: string; tone: Tone }> = {
  accepted: { label: 'Accepted', tone: 'good' },
  tentative: { label: 'Tentative', tone: 'warn' },
  declined: { label: 'Declined', tone: 'bad' },
};
const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  success: { label: 'Success', tone: 'good' },
  partial_success: { label: 'Partial', tone: 'warn' },
  failure: { label: 'Failure', tone: 'bad' },
  pending: { label: 'Pending', tone: 'muted' },
};

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-panel border border-border rounded-rr-xl shadow-rr flex flex-col min-w-0 ${className}`}>{children}</div>
);
const CardLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="mt-auto flex items-center gap-1 px-4 py-[10px] border-t border-border text-[12px] font-semibold text-accent bg-transparent border-x-0 border-b-0 cursor-pointer hover:brightness-125 text-left">
    {children} <Icon name="arrowRight" size={13} />
  </button>
);

/** Home: Next Event + Last Mission, Pending Tasks, then polls and changelog. */
const Home: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [showCreatePollDialog, setShowCreatePollDialog] = useState(false);
  const [showManagePollsDialog, setShowManagePollsDialog] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [upcoming, setUpcoming] = useState<NextEventInfo[] | null>(null);
  const [responses, setResponses] = useState<Record<string, RsvpState>>({});
  const [lastMission, setLastMission] = useState<LastMissionInfo | null | undefined>(undefined);
  const [quals, setQuals] = useState<ExpiringQual[]>([]);

  const sq = userProfile?.pilot?.currentSquadron;
  usePageHeader({ code: 'OVERVIEW', title: 'Ready Room', meta: sq ? `· ${sq.designation} ${sq.name}` : undefined });

  useEffect(() => { setPageLoading('home', false); }, [setPageLoading]);

  useEffect(() => {
    let alive = true;
    fetchUpcomingEvents(10).then(async evs => {
      if (!alive) return;
      setUpcoming(evs);
      const ids = evs.flatMap(e => e.messageIds);
      const r = await fetchMyResponses(userProfile?.discordId, ids);
      if (alive) setResponses(r);
    });
    fetchLastMission().then(m => { if (alive) setLastMission(m); });
    fetchMyExpiringQuals(userProfile?.pilot?.id).then(q => { if (alive) setQuals(q); });
    return () => { alive = false; };
  }, [userProfile?.discordId, userProfile?.pilot?.id]);

  const next = upcoming?.[0];
  const responseFor = (e: NextEventInfo): RsvpState => {
    for (const id of e.messageIds) if (responses[id]) return responses[id];
    return null;
  };

  // Pending tasks from data the app has today: unanswered RSVPs (published events in the next
  // 14 days) and qualifications expiring within 30 days.
  const tasks = useMemo(() => {
    const out: { key: string; kind: 'RSVP' | 'QUAL'; title: React.ReactNode; due: string; dueTone: 'bad' | 'warn' | 'muted'; go: () => void }[] = [];
    (upcoming || []).forEach(e => {
      const days = (new Date(e.start).getTime() - Date.now()) / 864e5;
      if (days <= 14 && e.messageIds.length && !responseFor(e) && userProfile?.discordId) {
        out.push({ key: `rsvp-${e.id}`, kind: 'RSVP', title: <>RSVP — {e.name}</>, due: relDays(e.start), dueTone: days < 1 ? 'warn' : 'muted', go: () => navigate('/events') });
      }
    });
    quals.forEach(q => {
      const past = new Date(q.expiry).getTime() < Date.now();
      out.push({
        key: `qual-${q.id}`, kind: 'QUAL',
        title: <span className="inline-flex items-center gap-2">{past ? 'Expired' : 'Expiring'} <QualTag code={q.code} color={q.color} size="sm" /> {q.name}</span>,
        due: past ? 'Overdue' : relDays(q.expiry), dueTone: past ? 'bad' : 'warn', go: () => navigate('/dossier'),
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, responses, quals, userProfile?.discordId]);

  const rsvp = next ? responseFor(next) : null;
  const outcome = lastMission?.outcome ? OUTCOME[lastMission.outcome] : undefined;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-[14px] flex flex-col">
      <div className="rr-page flex-1 min-h-0 flex flex-col gap-[14px]">
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          {/* Next Event */}
          <Card className="md:col-span-1" >
            <div className="flex items-center gap-2 px-4 py-[10px] border-b border-border">
              <Chip tone="accent" size="sm" mono>NEXT EVENT</Chip>
              <span className="flex-1" />
              {next ? <span className="font-mono text-[11px] text-text2">{relDays(next.start)}</span> : null}
            </div>
            {upcoming === null ? (
              <div className="p-4 text-[12.5px] text-text2">Loading…</div>
            ) : !next ? (
              <EmptyState compact icon="events" title="No upcoming events" message="New events will appear here once scheduled." />
            ) : (
              <div className="p-4 flex flex-col gap-[6px]">
                <div className="text-[19px] font-bold leading-tight">{next.name}</div>
                <div className="font-mono text-[11px] text-text2">{fmtDate(next.start)}{next.cycleName ? ` · ${next.cycleName}` : ''}</div>
                {next.description ? <p className="text-[13px] text-text2 leading-[1.5] line-clamp-3 m-0 mt-1">{next.description}</p> : null}
                <div className="flex items-center gap-2 mt-2">
                  <span className="rr-label">Your RSVP</span>
                  {rsvp ? <Chip tone={RSVP_LABEL[rsvp].tone}>{RSVP_LABEL[rsvp].label}</Chip> : <span className="text-[12px] text-text2">{next.messageIds.length ? 'Not yet responded — respond in Discord' : 'Not published to Discord yet'}</span>}
                </div>
              </div>
            )}
            <CardLink onClick={() => navigate('/events')}>Open in Events</CardLink>
          </Card>

          {/* Last Mission */}
          <Card>
            <div className="flex items-center gap-2 px-4 py-[10px] border-b border-border">
              <span className="rr-pane-title">Last Mission</span>
              <span className="flex-1" />
              {outcome ? <Chip tone={outcome.tone} size="sm">{outcome.label}</Chip> : null}
            </div>
            {lastMission === undefined ? (
              <div className="p-4 text-[12.5px] text-text2">Loading…</div>
            ) : !lastMission ? (
              <EmptyState compact title="No debriefs yet" message="Completed missions show their results here." />
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <div className="text-[17px] font-bold leading-tight truncate">{lastMission.name}</div>
                  <div className="font-mono text-[11px] text-text2">{fmtDate(lastMission.date)} · {lastMission.flights} flights</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile value={lastMission.a2a} label="A2A" />
                  <StatTile value={lastMission.a2g} label="A2G" />
                  <StatTile value={lastMission.losses} label="Losses" color={lastMission.losses ? 'var(--rr-bad)' : undefined} />
                </div>
              </div>
            )}
            <CardLink onClick={() => navigate('/debriefing')}>Open debrief</CardLink>
          </Card>
        </div>

        {/* Pending tasks */}
        <Card>
          <div className="flex items-center gap-2 px-4 py-[10px] border-b border-border">
            <span className="rr-pane-title">Pending Tasks</span>
            <span className="font-mono text-[11px] px-[6px] rounded-rr-sm bg-panel3 text-text2">{tasks.length}</span>
          </div>
          {tasks.length === 0 ? (
            <div className="px-4 py-3 text-[12.5px] text-text2">Nothing needs your attention right now.</div>
          ) : (
            tasks.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={t.go}
                className="flex items-center gap-3 px-4 py-[9px] border-b border-border last:border-b-0 bg-transparent border-x-0 border-t-0 text-left cursor-pointer hover:bg-panel2 transition-colors"
              >
                <Chip tone={t.kind === 'RSVP' ? 'good' : 'purple'} size="sm" mono className="w-[46px] justify-center">{t.kind}</Chip>
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-text truncate">{t.title}</span>
                <span className={`font-mono text-[11px] ${t.dueTone === 'bad' ? 'text-bad' : t.dueTone === 'warn' ? 'text-warn' : 'text-text2'}`}>{t.due}</span>
                <span className="text-text3 flex"><Icon name="arrowRight" size={14} /></span>
              </button>
            ))
          )}
        </Card>

        {/* Polls + changelog (secondary) */}
        {/* Fills the rest of the viewport; each card scrolls internally (min 360px so small screens scroll the page) */}
        <div className="flex-1 min-h-0 grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gridAutoRows: 'minmax(360px, 1fr)' }}>
          <PollCard
            onCreatePoll={() => setShowCreatePollDialog(true)}
            onManagePolls={() => setShowManagePollsDialog(true)}
            refreshTrigger={refreshTrigger}
          />
          <ChangeLogCard />
        </div>
      </div>

      <CreatePollDialog
        isOpen={showCreatePollDialog}
        onClose={() => setShowCreatePollDialog(false)}
        onPollCreated={() => { setRefreshTrigger(p => p + 1); setShowCreatePollDialog(false); }}
        primaryColor="var(--rr-accent)"
      />
      <PollManagementDialog
        isOpen={showManagePollsDialog}
        onClose={() => setShowManagePollsDialog(false)}
        onPollDeleted={() => { setRefreshTrigger(p => p + 1); setShowManagePollsDialog(false); }}
        primaryColor="var(--rr-accent)"
      />
    </div>
  );
};

export default Home;
