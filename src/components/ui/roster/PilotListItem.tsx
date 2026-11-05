import React, { useEffect, useRef, useState } from 'react';
import type { Pilot } from '../../../utils/pilotTypes';
import QualificationBadge from '../QualificationBadge';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { Checkbox, Icon, StatusChip, Tooltip, legibleColor } from '../primitives';

interface PilotListItemProps {
  pilot: Pilot;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (event?: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  pilotQualifications: any[];
  isDisabled?: boolean;
  /** Toggle this row in the multi-selection (row checkbox). */
  onToggleSelect?: () => void;
  /** Multiple rows are selected (shows the checkbox state for all rows). */
  multiSelect?: boolean;
}

/** Column widths shared with the PilotList header. */
export const ROSTER_COLS = { check: 16, board: 52, callsign: 150, status: 104, billet: 190 };

const MAX_VISIBLE_BADGES = 7;
const BADGE_GAP = 4;
const MORE_CHIP_W = 28;
/** Approximate rendered width of a small QualTag (mono 9.5px, 5px padding, 24px min). */
const badgeWidth = (code: string) => Math.max(24, 10 + (code || '').length * 6);

/** How many badges fit in `width`, leaving room for a "+N" chip when some don't. */
function fitBadges(codes: string[], width: number): number {
  if (!width) return Math.min(codes.length, MAX_VISIBLE_BADGES);
  const widths = codes.map(c => badgeWidth(c) + BADGE_GAP);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= width && codes.length <= MAX_VISIBLE_BADGES) return codes.length;
  let used = MORE_CHIP_W;
  let n = 0;
  while (n < widths.length && n < MAX_VISIBLE_BADGES - 1 && used + widths[n] <= width) { used += widths[n]; n++; }
  return n;
}

/** Roster table row: checkbox · board # · callsign · status · billet · qualifications · chevron. */
const PilotListItem: React.FC<PilotListItemProps> = ({
  pilot,
  isSelected,
  isHovered,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  pilotQualifications,
  isDisabled = false,
  onToggleSelect,
}) => {
  const { settings } = useAppSettings();

  const squadronColor = settings.displayPilotsWithSquadronColors
    ? legibleColor((pilot.currentSquadron as any)?.color_palette?.primary, 'var(--rr-text2)')
    : 'var(--rr-text2)';

  // Deduplicate qualifications and sort by configured order
  const qualMap = new Map<string, any>();
  (pilotQualifications || []).forEach((pq: any) => {
    if (pq?.qualification && !qualMap.has(pq.qualification.id)) qualMap.set(pq.qualification.id, pq);
  });
  const uniqueQuals = Array.from(qualMap.values()).sort((a, b) => (a.qualification.order ?? 0) - (b.qualification.order ?? 0));
  // Show as many badges as fit the cell; the rest go into the "+N" tooltip.
  const qualCellRef = useRef<HTMLSpanElement>(null);
  const [qualCellW, setQualCellW] = useState(0);
  useEffect(() => {
    const el = qualCellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setQualCellW(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = fitBadges(uniqueQuals.map((pq: any) => pq.qualification.code || ''), qualCellW);
  const visible = uniqueQuals.slice(0, fit);
  const overflow = uniqueQuals.slice(fit);

  const billet = pilot.roles?.[0]?.role?.name || '';

  return (
    <div
      role="row"
      aria-selected={isSelected}
      className={`flex items-center gap-3 px-3 py-[8px] border-b border-border select-none transition-colors duration-150 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-accent-weak' : isHovered ? 'bg-panel2' : ''}`}
      style={isSelected ? { boxShadow: 'inset 3px 0 0 var(--rr-accent)' } : undefined}
      onClick={isDisabled ? undefined : (e) => onSelect(e as React.MouseEvent)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span style={{ width: ROSTER_COLS.check }} className="flex-none flex" onClick={(e) => e.stopPropagation()}>
        <Checkbox size={16} checked={isSelected} disabled={isDisabled} onChange={() => onToggleSelect?.()} />
      </span>
      <span className="flex-none font-mono text-[12.5px] font-semibold" style={{ width: ROSTER_COLS.board, color: squadronColor }}>
        {pilot.boardNumber || '—'}
      </span>
      <span className="flex-none text-[13.5px] font-semibold truncate text-text" style={{ width: ROSTER_COLS.callsign }}>
        {pilot.callsign}
      </span>
      <span className="flex-none" style={{ width: ROSTER_COLS.status }}>
        {pilot.currentStatus ? <StatusChip status={pilot.currentStatus.name} /> : <span className="text-[11px] text-bad">No status</span>}
      </span>
      <span className="flex-none text-[12.5px] text-text2 truncate rr-col-billet" style={{ width: ROSTER_COLS.billet }} title={billet}>
        {billet || <span className="text-text3">—</span>}
      </span>
      <span ref={qualCellRef} className="flex-1 min-w-0 flex items-center justify-end gap-[4px] overflow-hidden">
        {visible.map((pq: any) => (
          <QualificationBadge
            key={`${pilot.id}-${pq.qualification.id}`}
            type={pq.qualification.name}
            code={pq.qualification.code}
            color={pq.qualification.color}
            size="small"
          />
        ))}
        {overflow.length ? (
          <Tooltip
            content={
              <span className="flex flex-wrap gap-1">
                {overflow.map((pq: any) => pq.qualification.code).join(' · ')}
              </span>
            }
          >
            <span className="inline-flex items-center h-4 px-[5px] rounded-rr-sm bg-panel3 text-text2 font-mono text-[9.5px] font-semibold cursor-default">
              +{overflow.length}
            </span>
          </Tooltip>
        ) : null}
      </span>
      <span className="flex-none w-4 flex justify-center text-text3">
        <Icon name="chevronRight" size={14} />
      </span>
    </div>
  );
};

export default PilotListItem;
