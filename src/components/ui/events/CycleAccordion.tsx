import React from 'react';
import { Icon } from '../primitives';
import LoadingSpinner from '../LoadingSpinner';

/**
 * Shared cycle accordion (Events page navigator, Mission Debrief navigator).
 * One cycle open at a time; the open cycle's body is supplied by the page.
 * Cycles are grouped Active / Upcoming / Completed; "Standalone" is a pinned pseudo-cycle.
 */

export interface AccordionCycle {
  id: string;
  name: string;
  type?: string | null;
  startDate: string;
  endDate: string;
}

export const STANDALONE_ID = 'standalone';

export const fmtShort = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const fmtRange = (c: AccordionCycle) => (c.startDate ? `${fmtShort(c.startDate)} – ${fmtShort(c.endDate)}` : '');

export function groupCyclesByDate<C extends AccordionCycle>(cycles: C[]) {
  const now = new Date();
  const active: C[] = [], upcoming: C[] = [], completed: C[] = [];
  cycles.forEach(c => {
    const s = new Date(c.startDate), e = new Date(c.endDate);
    if (now >= s && now <= e) active.push(c);
    else if (now < s) upcoming.push(c);
    else completed.push(c);
  });
  active.sort((a, b) => +new Date(a.endDate) - +new Date(b.endDate));
  upcoming.sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  completed.sort((a, b) => +new Date(b.endDate) - +new Date(a.endDate));
  return [
    { label: 'Active', items: active },
    { label: 'Upcoming', items: upcoming },
    { label: 'Completed', items: completed },
  ].filter(g => g.items.length > 0);
}

export const AccordionGroupLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center gap-2 font-mono text-[9.5px] tracking-[.14em] uppercase text-text3 ${className}`}>
    <span>{children}</span>
    <span className="flex-1 h-px bg-border" />
  </div>
);

export const CycleAccordionItem: React.FC<{
  cycle: AccordionCycle;
  open: boolean;
  standalone?: boolean;
  /** Subtitle for the standalone pseudo-cycle. */
  standaloneSubtitle?: string;
  onToggle: () => void;
  /** Shown at the right of the subtitle while open (e.g. "6 EVT"). */
  count?: React.ReactNode;
  /** Header actions (edit/delete); visible on hover, always while open. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ cycle, open, standalone, standaloneSubtitle = 'Not part of a cycle', onToggle, count, actions, children }) => (
  <div className={`rounded-rr-lg border transition-colors ${open ? 'border-border2 bg-panel' : standalone ? 'border-dashed border-border2' : 'border-border'} `}>
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={e => { if (e.key === 'Enter') onToggle(); }}
      className={`group/cy flex items-start gap-[8px] px-[10px] py-[9px] cursor-pointer rounded-rr-lg ${open ? '' : 'hover:bg-panel2'}`}
    >
      <span className="flex-none mt-[2px] text-text3 transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
        <Icon name="chevronRight" size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold leading-[1.3] text-text" style={{ overflowWrap: 'anywhere' }}>{cycle.name}</div>
        <div className="flex items-center gap-[6px] mt-[2px] text-[11px] text-text2">
          {standalone
            ? <span>{standaloneSubtitle}</span>
            : <>
                {cycle.type ? <span className="truncate">{cycle.type}</span> : null}
                {cycle.type ? <span className="text-text3">·</span> : null}
                <span className="font-mono text-[10.5px] whitespace-nowrap">{fmtRange(cycle)}</span>
              </>}
          {open && count != null ? <span className="ml-auto font-mono text-[10.5px] text-text3">{count}</span> : null}
        </div>
      </div>
      {actions ? (
        <span className={`flex-none flex items-center gap-[2px] ${open ? '' : 'invisible group-hover/cy:visible group-focus-within/cy:visible'}`} onClick={e => e.stopPropagation()}>
          {actions}
        </span>
      ) : null}
    </div>
    {open ? <div className="border-t border-border px-[6px] pb-[8px]">{children}</div> : null}
  </div>
);

/** Left pane shell: pane-title header + scrolling accordion (standalone first, then date groups). */
export function CycleAccordionPane<C extends AccordionCycle>({
  title, headerActions, cycles, standalone, selectedId, loading, renderItem, belowHeader,
}: {
  title: React.ReactNode;
  headerActions?: React.ReactNode;
  cycles: C[];
  /** Pinned pseudo-cycle (rendered first). */
  standalone?: AccordionCycle;
  selectedId: string | null | undefined;
  loading?: boolean;
  renderItem: (cycle: C | AccordionCycle, opts: { open: boolean; standalone: boolean }) => React.ReactNode;
  /** Optional strip under the header (filters). */
  belowHeader?: React.ReactNode;
}) {
  const groups = groupCyclesByDate(cycles);
  return (
    <div className="flex-none w-[340px] min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden max-[760px]:w-auto">
      <div className="flex-none flex items-center gap-2 px-[14px] min-h-[46px] border-b border-border">
        <span className="rr-pane-title">{title}</span>
        <span className="flex-1" />
        {headerActions}
      </div>
      {belowHeader}
      <div className="flex-1 min-h-0 overflow-y-auto p-[10px] flex flex-col gap-[8px]">
        {standalone ? renderItem(standalone, { open: selectedId === standalone.id, standalone: true }) : null}
        {loading ? (
          <div className="py-6 flex justify-center"><LoadingSpinner /></div>
        ) : groups.map(g => (
          <React.Fragment key={g.label}>
            <AccordionGroupLabel className="mt-[6px] px-1">{g.label}</AccordionGroupLabel>
            {g.items.map(c => (
              <React.Fragment key={c.id}>{renderItem(c, { open: selectedId === c.id, standalone: false })}</React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
