import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, X } from 'lucide-react';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import type { CycleActivity, EventActivityParticipantBlock } from '../../../types/EventTypes';

interface SquadronInfo {
  id: string;
  name: string;
  designation?: string;
  insignia_url?: string | null;
}

export type BuilderSelection =
  | { type: 'activity'; index: number }
  | { type: 'row'; rowKey: string }
  | null;

export interface PendingParticipantRow {
  rowKey: string;
  criteria: EventActivityParticipantBlock[];
}

/** Stable signature for a participant criteria set - activities sharing it share a row */
export const criteriaRowKey = (blocks: EventActivityParticipantBlock[] | undefined): string =>
  JSON.stringify((blocks || []).map(block =>
    block.criteria
      .map(c => `${c.type}:${(c.values ?? (c.value ? [c.value] : [])).slice().sort().join('|')}`)
      .sort()
  ));

interface BuilderRow {
  rowKey: string;
  criteria: EventActivityParticipantBlock[];
  activityIndices: number[];
}

interface CycleActivitiesBuilderProps {
  activities: CycleActivity[];
  onChange: (activities: CycleActivity[]) => void;
  weekCount: number;
  onWeekCountChange: (weeks: number) => void;
  /** Cycle start date (ISO / YYYY-MM-DD) used for the week header dates */
  startDate?: string;
  squadrons: SquadronInfo[];
  /** Names for syllabus-kind blocks, keyed by syllabus id */
  syllabusNames: Record<string, string>;
  selection: BuilderSelection;
  onSelect: (selection: BuilderSelection) => void;
  /** Participant rows that exist before any activity has been added to them */
  pendingRows: PendingParticipantRow[];
  onAddParticipantRow: () => void;
  onAddActivityInRow: (criteria: EventActivityParticipantBlock[], week: number) => void;
  onRemoveActivity: (index: number) => void;
}

const ROW_HEIGHT = 48;
const HEADER_COL_WIDTH = 170;
const MIN_WEEK_COL_WIDTH = 56;

type DragMode = 'move' | 'resize-left' | 'resize-right';

interface DragState {
  mode: DragMode;
  activityIndex: number;
  startClientX: number;
  startClientY: number;
  originalStartWeek: number;
  originalEndWeek: number;
  originRowIndex: number;
}

/**
 * Visual cycle builder. Rows are participant groups (defined by their criteria
 * blocks); activities live in their group's row. Add a participant group with
 * the button in the first empty row, then click inside the group's row to add
 * an activity for it. Blocks drag horizontally to re-sequence, vertically to
 * move to another participant group, and resize from either edge. Week columns
 * stretch to fit the available width, scrolling only when they'd drop below a
 * minimum width.
 */
const CycleActivitiesBuilder: React.FC<CycleActivitiesBuilderProps> = ({
  activities,
  onChange,
  weekCount,
  onWeekCountChange,
  startDate,
  squadrons,
  syllabusNames,
  selection,
  onSelect,
  pendingRows,
  onAddParticipantRow,
  onAddActivityInRow,
  onRemoveActivity
}) => {
  const dragStateRef = useRef<DragState | null>(null);
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;
  const [dragging, setDragging] = useState(false);
  const [hoverRowIndex, setHoverRowIndex] = useState<number | null>(null);
  const [hoveredActivityIndex, setHoveredActivityIndex] = useState<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // Dynamic week column width: stretch to fill, scroll only under the minimum
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setContainerWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const weekColWidth = Math.max(
    MIN_WEEK_COL_WIDTH,
    containerWidth > 0 ? Math.floor((containerWidth - HEADER_COL_WIDTH - 2) / Math.max(1, weekCount)) : 96
  );
  const weekColWidthRef = useRef(weekColWidth);
  weekColWidthRef.current = weekColWidth;

  // Rows: activities grouped by participant-criteria signature, then pending
  // (still-empty) participant rows
  const rows = useMemo<BuilderRow[]>(() => {
    const map = new Map<string, BuilderRow>();
    activities.forEach((activity, index) => {
      const key = criteriaRowKey(activity.settings?.participantCriteria);
      const existing = map.get(key);
      if (existing) {
        existing.activityIndices.push(index);
      } else {
        map.set(key, {
          rowKey: key,
          criteria: activity.settings?.participantCriteria || [],
          activityIndices: [index]
        });
      }
    });
    pendingRows.forEach(pending => {
      if (!map.has(pending.rowKey)) {
        map.set(pending.rowKey, { rowKey: pending.rowKey, criteria: pending.criteria, activityIndices: [] });
      }
    });
    return Array.from(map.values());
  }, [activities, pendingRows]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Window-level listeners while a drag is in progress
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const colWidth = weekColWidthRef.current;
      const deltaWeeks = Math.round((e.clientX - drag.startClientX) / colWidth);

      const current = activitiesRef.current;
      const activity = current[drag.activityIndex];
      if (!activity) return;

      let startWeek = drag.originalStartWeek;
      let endWeek = drag.originalEndWeek;
      const span = drag.originalEndWeek - drag.originalStartWeek;

      if (drag.mode === 'move') {
        startWeek = Math.max(1, Math.min(weekCount - span, drag.originalStartWeek + deltaWeeks));
        endWeek = startWeek + span;
        // Track the hovered participant row for vertical moves
        const deltaRows = Math.round((e.clientY - drag.startClientY) / ROW_HEIGHT);
        const targetRow = drag.originRowIndex + deltaRows;
        setHoverRowIndex(targetRow >= 0 && targetRow < rowsRef.current.length ? targetRow : null);
      } else if (drag.mode === 'resize-left') {
        startWeek = Math.max(1, Math.min(drag.originalEndWeek, drag.originalStartWeek + deltaWeeks));
      } else {
        endWeek = Math.min(weekCount, Math.max(drag.originalStartWeek, drag.originalEndWeek + deltaWeeks));
      }

      if (startWeek !== activity.startWeek || endWeek !== activity.endWeek) {
        onChange(current.map((a, i) => (i === drag.activityIndex ? { ...a, startWeek, endWeek } : a)));
      }
    };

    const handleUp = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (drag && drag.mode === 'move') {
        // Vertical drop: adopt the target participant row's criteria
        const deltaRows = Math.round((e.clientY - drag.startClientY) / ROW_HEIGHT);
        const targetRowIndex = drag.originRowIndex + deltaRows;
        const currentRows = rowsRef.current;
        if (deltaRows !== 0 && targetRowIndex >= 0 && targetRowIndex < currentRows.length) {
          const targetRow = currentRows[targetRowIndex];
          const current = activitiesRef.current;
          onChange(current.map((a, i) => (
            i === drag.activityIndex
              ? { ...a, settings: { ...(a.settings || {}), participantCriteria: targetRow.criteria } }
              : a
          )));
        }
      }
      dragStateRef.current = null;
      setDragging(false);
      setHoverRowIndex(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, weekCount, onChange]);

  const beginDrag = (e: React.MouseEvent, activityIndex: number, rowIndex: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const activity = activities[activityIndex];
    dragStateRef.current = {
      mode,
      activityIndex,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalStartWeek: activity.startWeek,
      originalEndWeek: activity.endWeek,
      originRowIndex: rowIndex
    };
    setDragging(true);
    onSelect({ type: 'activity', index: activityIndex });
  };

  // Week header dates: week n starts at cycle start + 7*(n-1) days
  const weekDates = useMemo(() => {
    if (!startDate) return Array(weekCount).fill('');
    const base = new Date(startDate);
    if (isNaN(base.getTime())) return Array(weekCount).fill('');
    return Array.from({ length: weekCount }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    });
  }, [startDate, weekCount]);

  const activityTitle = (activity: CycleActivity): string => {
    if (activity.label) return activity.label;
    if (activity.kind === 'syllabus' && activity.syllabusId) {
      return syllabusNames[activity.syllabusId] || 'Syllabus';
    }
    return activity.kind === 'objectives' ? 'Training Exercise' : 'New Activity';
  };

  // Row header: one bubble per criteria block - the block's squadron insignias
  // together with its non-squadron criteria names
  const renderParticipantHeader = (row: BuilderRow) => {
    const completedBlocks = row.criteria
      .map(block => {
        const squadronIds = new Set<string>();
        const otherCriteria: string[] = [];
        block.criteria.forEach(criterion => {
          const values = criterion.values ?? (criterion.value ? [criterion.value] : []);
          if (criterion.type === 'squadron') {
            values.forEach(id => squadronIds.add(id));
          } else {
            values.forEach(v => otherCriteria.push(v));
          }
        });
        return { squadrons: squadrons.filter(s => squadronIds.has(s.id)), otherCriteria };
      })
      .filter(block => block.squadrons.length > 0 || block.otherCriteria.length > 0);

    if (completedBlocks.length === 0) {
      return (
        <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
          All participants
        </span>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {completedBlocks.map((block, blockIndex) => (
          <span
            key={blockIndex}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: '9999px',
              padding: '2px 8px 2px 4px',
              maxWidth: `${HEADER_COL_WIDTH - 14}px`
            }}
          >
            {block.squadrons.map(squadron => (
              squadron.insignia_url ? (
                <span
                  key={squadron.id}
                  title={squadron.designation || squadron.name}
                  style={{
                    width: '18px',
                    height: '18px',
                    backgroundImage: `url(${squadron.insignia_url})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    flexShrink: 0
                  }}
                />
              ) : (
                <span key={squadron.id} style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>
                  {squadron.designation || squadron.name}
                </span>
              )
            ))}
            {block.otherCriteria.length > 0 && (
              <span style={{
                fontSize: '10px',
                fontWeight: 500,
                color: '#1E40AF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {block.otherCriteria.join(', ')}
              </span>
            )}
          </span>
        ))}
      </div>
    );
  };

  const gridWidth = HEADER_COL_WIDTH + weekCount * weekColWidth;

  return (
    <div>
      {/* Toolbar: week count only - activities are added inside participant rows */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter' }}>
          Weeks: {weekCount}
        </span>
        <button
          type="button"
          onClick={() => onWeekCountChange(Math.max(1, weekCount - 1))}
          disabled={weekCount <= 1 || activities.some(a => a.endWeek >= weekCount)}
          title={activities.some(a => a.endWeek >= weekCount) ? 'An activity occupies the last week' : 'Remove a week'}
          style={{
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #CBD5E1',
            backgroundColor: '#FFFFFF',
            color: (weekCount <= 1 || activities.some(a => a.endWeek >= weekCount)) ? '#D1D5DB' : '#64748B',
            borderRadius: '6px',
            cursor: (weekCount <= 1 || activities.some(a => a.endWeek >= weekCount)) ? 'default' : 'pointer'
          }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => onWeekCountChange(weekCount + 1)}
          title="Add a week"
          style={{
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #CBD5E1',
            backgroundColor: '#FFFFFF',
            color: '#64748B',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Gantt grid */}
      <div
        ref={containerRef}
        style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FFFFFF' }}
      >
        <div style={{ width: `${gridWidth}px`, minWidth: '100%', userSelect: dragging ? 'none' : undefined }}>
          {/* Header row */}
          <div style={{ display: 'flex', borderBottom: '2px solid #CBD5E1' }}>
            <div style={{ width: `${HEADER_COL_WIDTH}px`, flexShrink: 0, padding: '8px', boxSizing: 'border-box', fontSize: '11px', fontWeight: 600, color: '#64748B', fontFamily: 'Inter', textTransform: 'uppercase' }}>
              Participants
            </div>
            {Array.from({ length: weekCount }, (_, i) => (
              <div
                key={i}
                style={{
                  width: `${weekColWidth}px`,
                  flexShrink: 0,
                  padding: '6px 2px',
                  textAlign: 'center',
                  borderLeft: '1px solid #E2E8F0',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
                  Week {i + 1}
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter' }}>
                  {weekDates[i]}
                </div>
              </div>
            ))}
          </div>

          {/* Participant rows */}
          {rows.map((row, rowIndex) => {
            const isRowSelected = selection?.type === 'row' && selection.rowKey === row.rowKey;
            const isDropTarget = dragging && hoverRowIndex === rowIndex;
            return (
              <div key={row.rowKey} style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', backgroundColor: isDropTarget ? '#F0F9FF' : undefined }}>
                {/* Participant header - click to edit the group's criteria */}
                <div
                  onClick={() => onSelect(isRowSelected ? null : { type: 'row', rowKey: row.rowKey })}
                  title="Edit participants"
                  style={{
                    width: `${HEADER_COL_WIDTH}px`,
                    flexShrink: 0,
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: `${ROW_HEIGHT}px`,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    backgroundColor: isRowSelected ? '#EFF6FF' : undefined,
                    borderRight: '1px solid #E2E8F0'
                  }}
                >
                  {renderParticipantHeader(row)}
                </div>
                {/* Track - click an empty spot to add an activity at that week */}
                <div
                  style={{
                    position: 'relative',
                    height: `${ROW_HEIGHT}px`,
                    width: `${weekCount * weekColWidth}px`,
                    flexShrink: 0,
                    backgroundImage: 'linear-gradient(to right, #E2E8F0 1px, transparent 1px)',
                    backgroundSize: `${weekColWidth}px 100%`,
                    cursor: 'copy'
                  }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const week = Math.min(weekCount, Math.max(1, Math.floor((e.clientX - rect.left) / weekColWidth) + 1));
                    onAddActivityInRow(row.criteria, week);
                  }}
                  title="Click to add an activity for this participant group"
                >
                  {row.activityIndices.map(activityIndex => {
                    const activity = activities[activityIndex];
                    const isSelected = selection?.type === 'activity' && selection.index === activityIndex;
                    const left = (activity.startWeek - 1) * weekColWidth;
                    const width = (activity.endWeek - activity.startWeek + 1) * weekColWidth;
                    return (
                      <div
                        key={activity.id || `new-${activityIndex}`}
                        onMouseDown={(e) => beginDrag(e, activityIndex, rowIndex, 'move')}
                        onClick={(e) => { e.stopPropagation(); onSelect({ type: 'activity', index: activityIndex }); }}
                        onMouseEnter={() => setHoveredActivityIndex(activityIndex)}
                        onMouseLeave={() => setHoveredActivityIndex(prev => (prev === activityIndex ? null : prev))}
                        title={activityTitle(activity)}
                        style={{
                          position: 'absolute',
                          left: `${left + 3}px`,
                          width: `${width - 6}px`,
                          top: '7px',
                          height: `${ROW_HEIGHT - 14}px`,
                          border: `2px solid ${isSelected ? '#1D4ED8' : '#38BDF8'}`,
                          backgroundColor: isSelected ? '#DBEAFE' : '#F0F9FF',
                          borderRadius: '4px',
                          cursor: dragging ? 'grabbing' : 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 10px',
                          boxSizing: 'border-box',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#0C4A6E',
                          fontFamily: 'Inter',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          pointerEvents: 'none'
                        }}>
                          {activityTitle(activity)}
                        </span>
                        {/* Hover delete (confirmation required) */}
                        {hoveredActivityIndex === activityIndex && !dragging && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteIndex(activityIndex);
                            }}
                            title="Delete activity"
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              padding: '2px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <X size={14} color="#64748B" />
                          </button>
                        )}
                        <div
                          onMouseDown={(e) => beginDrag(e, activityIndex, rowIndex, 'resize-left')}
                          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize' }}
                        />
                        <div
                          onMouseDown={(e) => beginDrag(e, activityIndex, rowIndex, 'resize-right')}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add-participants row */}
          <div style={{ display: 'flex' }}>
            <div style={{
              width: `${HEADER_COL_WIDTH}px`,
              flexShrink: 0,
              padding: '8px',
              boxSizing: 'border-box',
              borderRight: '1px solid #E2E8F0'
            }}>
              <button
                type="button"
                onClick={onAddParticipantRow}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px dashed #93C5FD',
                  backgroundColor: '#F8FAFC',
                  color: '#3B82F6',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={12} />
                Add Participants
              </button>
            </div>
            <div style={{
              width: `${weekCount * weekColWidth}px`,
              flexShrink: 0,
              backgroundImage: 'linear-gradient(to right, #E2E8F0 1px, transparent 1px)',
              backgroundSize: `${weekColWidth}px 100%`
            }} />
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={confirmDeleteIndex !== null}
        title="Delete Activity"
        message={confirmDeleteIndex !== null && activities[confirmDeleteIndex]
          ? `Delete "${activityTitle(activities[confirmDeleteIndex])}" (Weeks ${activities[confirmDeleteIndex].startWeek}–${activities[confirmDeleteIndex].endWeek}) from this cycle?`
          : ''}
        confirmText="Delete"
        type="danger"
        icon="trash"
        onConfirm={() => {
          if (confirmDeleteIndex !== null) onRemoveActivity(confirmDeleteIndex);
          setConfirmDeleteIndex(null);
          setHoveredActivityIndex(null);
        }}
        onCancel={() => setConfirmDeleteIndex(null)}
      />
    </div>
  );
};

export default CycleActivitiesBuilder;
