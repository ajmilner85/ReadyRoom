import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, X, RotateCcw } from 'lucide-react';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import { ParticipantCriteriaBubbles } from './ParticipantBlocksEditor';
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

/** A cycle event linked to a cycle activity, shown as a cell inside its bar */
export interface CycleBuilderEvent {
  id: string;
  name: string;
  startDatetime: string;
  endDatetime?: string | null;
  cycleActivityId: string;
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
  /** Ordered lesson names per syllabus id - previews an unsaved syllabus
      activity's per-week cells before saving creates the real events */
  syllabusMissionNames: Record<string, string[]>;
  selection: BuilderSelection;
  onSelect: (selection: BuilderSelection) => void;
  /** Ordered participant rows (the authoritative row order; may include rows
      with no activities yet) */
  participantRows: PendingParticipantRow[];
  onAddParticipantRow: () => void;
  /** Explicitly delete a participant row (and any activities still in it) */
  onRemoveParticipantRow: (rowKey: string) => void;
  onAddActivityInRow: (criteria: EventActivityParticipantBlock[], week: number) => void;
  onRemoveActivity: (index: number) => void;
  /** The cycle's events, linked to their activities (shown as cells in the bars) */
  cycleEvents: CycleBuilderEvent[];
  /** Move/reorder an event to another week within its activity's span */
  onMoveEvent: (eventId: string, targetWeek: number, cycleActivityId: string) => void;
  /** Restore a syllabus activity to its syllabus's length, order, and events */
  onResetActivity: (index: number) => void;
  /** Remove one event from an activity (deletes the event if nothing else uses it) */
  onDeleteEvent: (event: CycleBuilderEvent) => void;
  /** Click on an empty week inside an activity - add an event there */
  onAddEventInWeek: (activityIndex: number, week: number, position: { x: number; y: number }) => void;
}

const ROW_HEIGHT = 84; // tall rows: activity title strip + per-week event cells
const BAR_TITLE_HEIGHT = 20;
const HEADER_COL_WIDTH = 170;
const MIN_WEEK_COL_WIDTH = 56;

type DragMode = 'move' | 'resize-left' | 'resize-right' | 'event-move';

interface DragState {
  mode: DragMode;
  activityIndex: number;
  startClientX: number;
  startClientY: number;
  originalStartWeek: number;
  originalEndWeek: number;
  originRowIndex: number;
  // event-move only
  eventId?: string;
  eventCycleActivityId?: string;
  eventOriginWeek?: number;
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
  syllabusMissionNames,
  selection,
  onSelect,
  participantRows,
  onAddParticipantRow,
  onRemoveParticipantRow,
  onAddActivityInRow,
  onRemoveActivity,
  cycleEvents,
  onMoveEvent,
  onResetActivity,
  onDeleteEvent,
  onAddEventInWeek
}) => {
  const dragStateRef = useRef<DragState | null>(null);
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;
  const [dragging, setDragging] = useState(false);
  const [hoverRowIndex, setHoverRowIndex] = useState<number | null>(null);
  const [hoveredActivityIndex, setHoveredActivityIndex] = useState<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [confirmResetIndex, setConfirmResetIndex] = useState<number | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<CycleBuilderEvent | null>(null);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<BuilderRow | null>(null);
  // Composite key (activityId:eventId) - an event linked to two activities
  // renders in both bars and must not pop details in both at once. The popup
  // itself portals to document.body (fixed) so the gantt's scroll container
  // can't clip it on the bottom rows.
  const [hoveredEventKey, setHoveredEventKey] = useState<string | null>(null);
  const [hoveredEventPopup, setHoveredEventPopup] = useState<{
    event: CycleBuilderEvent;
    x: number;
    y: number;
    openUpward: boolean;
  } | null>(null);
  // Live target-week highlight while dragging an event cell
  const [eventDragTargetWeek, setEventDragTargetWeek] = useState<number | null>(null);
  // A drag's mouseup is followed by a click event - this flag stops that click
  // from being treated as a click-to-add on the track (phantom activities)
  const justDraggedRef = useRef(false);

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

  // Rows come from the parent's ordered row list (so moving an activity
  // between rows never reshuffles the rows themselves); activities join their
  // row by criteria signature, orphans append a derived row as a fallback
  const rows = useMemo<BuilderRow[]>(() => {
    const map = new Map<string, BuilderRow>();
    participantRows.forEach(row => {
      map.set(row.rowKey, { rowKey: row.rowKey, criteria: row.criteria, activityIndices: [] });
    });
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
    return Array.from(map.values());
  }, [activities, participantRows]);
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

      if (drag.mode === 'event-move') {
        // Reordering an event cell within its activity's span
        const target = Math.max(
          drag.originalStartWeek,
          Math.min(drag.originalEndWeek, (drag.eventOriginWeek || drag.originalStartWeek) + deltaWeeks)
        );
        setEventDragTargetWeek(target);
        return;
      }

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
      if (drag && drag.mode === 'event-move') {
        const colWidth = weekColWidthRef.current;
        const deltaWeeks = Math.round((e.clientX - drag.startClientX) / colWidth);
        const targetWeek = Math.max(
          drag.originalStartWeek,
          Math.min(drag.originalEndWeek, (drag.eventOriginWeek || drag.originalStartWeek) + deltaWeeks)
        );
        if (drag.eventId && drag.eventCycleActivityId && targetWeek !== drag.eventOriginWeek) {
          onMoveEvent(drag.eventId, targetWeek, drag.eventCycleActivityId);
        }
      } else if (drag && drag.mode === 'move') {
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
      setEventDragTargetWeek(null);
      // Swallow the click event this mouseup produces; reset right after so
      // the next real click works even if this one lands outside a track
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, weekCount, onChange, onMoveEvent]);

  const beginEventDrag = (
    e: React.MouseEvent,
    eventItem: CycleBuilderEvent,
    originWeek: number,
    activity: CycleActivity,
    activityIndex: number,
    rowIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      mode: 'event-move',
      activityIndex,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalStartWeek: activity.startWeek,
      originalEndWeek: activity.endWeek,
      originRowIndex: rowIndex,
      eventId: eventItem.id,
      eventCycleActivityId: eventItem.cycleActivityId,
      eventOriginWeek: originWeek
    };
    setEventDragTargetWeek(originWeek);
    setDragging(true);
  };

  // Week of a cycle event (week 1 = the cycle's first 7 days)
  const weekOfEvent = (eventItem: CycleBuilderEvent): number | null => {
    if (!startDate) return null;
    const base = new Date(startDate);
    const date = new Date(eventItem.startDatetime);
    if (isNaN(base.getTime()) || isNaN(date.getTime())) return null;
    return Math.max(1, Math.floor((date.getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  };

  // cycleActivityId -> week -> events in that week
  const eventsByActivityWeek = useMemo(() => {
    const map = new Map<string, Map<number, CycleBuilderEvent[]>>();
    cycleEvents.forEach(eventItem => {
      const week = weekOfEvent(eventItem);
      if (week === null) return;
      if (!map.has(eventItem.cycleActivityId)) map.set(eventItem.cycleActivityId, new Map());
      const byWeek = map.get(eventItem.cycleActivityId)!;
      if (!byWeek.has(week)) byWeek.set(week, []);
      byWeek.get(week)!.push(eventItem);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleEvents, startDate]);

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

  // Bar strip title: syllabus/course name for training activities; blank for
  // ad-hoc exercises (their title lives inside the event boxes instead)
  const activityBarTitle = (activity: CycleActivity): string =>
    activity.kind === 'objectives' ? '' : activityTitle(activity);

  // Cell/popup label: ad-hoc exercises show the Activity Title, training
  // activities show the event's own title
  const eventCellLabel = (activity: CycleActivity, eventItem: CycleBuilderEvent): string =>
    activity.kind === 'objectives' ? (activity.label || 'Training Exercise') : eventItem.name;

  // Row header: one bubble per criteria block (shared renderer)
  const renderParticipantHeader = (row: BuilderRow) => (
    <ParticipantCriteriaBubbles
      blocks={row.criteria}
      squadrons={squadrons}
      maxWidth={HEADER_COL_WIDTH - 14}
    />
  );

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
                  onMouseEnter={() => setHoveredRowKey(row.rowKey)}
                  onMouseLeave={() => setHoveredRowKey(prev => (prev === row.rowKey ? null : prev))}
                  title="Edit participants"
                  style={{
                    position: 'relative',
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
                  {/* Hover delete: the only way a participant row leaves the cycle */}
                  {hoveredRowKey === row.rowKey && !dragging && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteRow(row);
                      }}
                      title="Delete participant row"
                      style={{
                        position: 'absolute',
                        right: '4px',
                        top: '4px',
                        padding: '2px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1
                      }}
                    >
                      <X size={14} color="#64748B" />
                    </button>
                  )}
                </div>
                {/* Track - click an empty spot to add an activity at that week */}
                <div
                  style={{
                    position: 'relative',
                    // Stretch with the row (participant headers can be taller
                    // than one line) so the gridlines always span full height
                    minHeight: `${ROW_HEIGHT}px`,
                    alignSelf: 'stretch',
                    width: `${weekCount * weekColWidth}px`,
                    flexShrink: 0,
                    backgroundImage: 'linear-gradient(to right, #E2E8F0 1px, transparent 1px)',
                    backgroundSize: `${weekColWidth}px 100%`,
                    cursor: 'copy'
                  }}
                  onClick={(e) => {
                    if (justDraggedRef.current) return; // drag release, not an add
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const week = Math.min(weekCount, Math.max(1, Math.floor((e.clientX - rect.left) / weekColWidth) + 1));
                    onAddActivityInRow(row.criteria, week);
                  }}
                >
                  {row.activityIndices.map(activityIndex => {
                    const activity = activities[activityIndex];
                    const isSelected = selection?.type === 'activity' && selection.index === activityIndex;
                    const left = (activity.startWeek - 1) * weekColWidth;
                    const width = (activity.endWeek - activity.startWeek + 1) * weekColWidth;
    const activityEventsByWeek = activity.id ? eventsByActivityWeek.get(activity.id) : undefined;
                    const isEventDragOnThisActivity = dragging
                      && dragStateRef.current?.mode === 'event-move'
                      && dragStateRef.current?.eventCycleActivityId === activity.id;
                    // Live drag preview: the dragged event renders in the
                    // hovered target week, and the week's current occupant
                    // previews in the origin week (the swap that will happen)
                    const dragOrigin = dragStateRef.current?.eventOriginWeek;
                    const draggedEvent = isEventDragOnThisActivity
                      ? cycleEvents.find(ev => ev.id === dragStateRef.current?.eventId && ev.cycleActivityId === activity.id)
                      : undefined;
                    const occupantEvent = (isEventDragOnThisActivity && eventDragTargetWeek != null && eventDragTargetWeek !== dragOrigin && draggedEvent)
                      ? (activityEventsByWeek?.get(eventDragTargetWeek) || []).find(ev => ev.id !== draggedEvent.id)
                      : undefined;
                    const displayedEventsForWeek = (week: number): CycleBuilderEvent[] => {
                      const base = activityEventsByWeek?.get(week) || [];
                      if (!isEventDragOnThisActivity || eventDragTargetWeek == null || eventDragTargetWeek === dragOrigin || !draggedEvent) {
                        return base;
                      }
                      let list = base.filter(ev => ev.id !== draggedEvent.id && ev.id !== occupantEvent?.id);
                      if (week === eventDragTargetWeek) list = [draggedEvent, ...list];
                      if (week === dragOrigin && occupantEvent) list = [occupantEvent, ...list];
                      return list;
                    };
                    const spanWeeks = activity.endWeek - activity.startWeek + 1;
                    return (
                      <div
                        key={activity.id || `new-${activityIndex}`}
                        onMouseDown={(e) => beginDrag(e, activityIndex, rowIndex, 'move')}
                        onClick={(e) => { e.stopPropagation(); onSelect({ type: 'activity', index: activityIndex }); }}
                        onMouseEnter={() => setHoveredActivityIndex(activityIndex)}
                        onMouseLeave={() => setHoveredActivityIndex(prev => (prev === activityIndex ? null : prev))}
                        style={{
                          position: 'absolute',
                          left: `${left + 3}px`,
                          width: `${width - 6}px`,
                          top: '6px',
                          height: `${ROW_HEIGHT - 12}px`,
                          border: `2px solid ${isSelected ? '#1D4ED8' : '#38BDF8'}`,
                          backgroundColor: isSelected ? '#DBEAFE' : '#F0F9FF',
                          borderRadius: '4px',
                          cursor: dragging ? 'grabbing' : 'grab',
                          boxSizing: 'border-box'
                        }}
                      >
                        {/* Title strip: top-aligned, centered - also the grab
                            area for moving the whole activity */}
                        <div style={{
                          height: `${BAR_TITLE_HEIGHT}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 22px',
                          overflow: 'hidden'
                        }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#0C4A6E',
                            fontFamily: 'Inter',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            pointerEvents: 'none'
                          }}>
                            {activityBarTitle(activity)}
                          </span>
                        </div>

                        {/* Per-week event cells */}
                        <div style={{ position: 'absolute', left: 0, right: 0, top: `${BAR_TITLE_HEIGHT}px`, bottom: '4px', pointerEvents: 'none' }}>
                          {Array.from({ length: spanWeeks }, (_, offset) => {
                            const week = activity.startWeek + offset;
                            const weekEvents = displayedEventsForWeek(week);
                            const isDropTargetWeek = isEventDragOnThisActivity && eventDragTargetWeek === week;
                            // Cells sit 4px off the week dividers, and the
                            // outermost cells also 4px off the bar's own inner
                            // edges (bar inner edge = grid + 5 in content coords)
                            const cellLeft = offset === 0 ? 4 : offset * weekColWidth - 1;
                            const cellRight = offset === spanWeeks - 1
                              ? spanWeeks * weekColWidth - 14
                              : (offset + 1) * weekColWidth - 9;
                            return (
                              <div
                                key={week}
                                onMouseDown={weekEvents.length === 0 && activity.id ? (e) => e.stopPropagation() : undefined}
                                onClick={weekEvents.length === 0 ? (e) => {
                                  e.stopPropagation();
                                  if (justDraggedRef.current || !activity.id) return;
                                  onAddEventInWeek(activityIndex, week, { x: e.clientX, y: e.clientY });
                                } : undefined}
                                title={weekEvents.length === 0 && activity.id ? 'Add an event this week' : undefined}
                                style={{
                                  position: 'absolute',
                                  left: `${cellLeft}px`,
                                  width: `${Math.max(20, cellRight - cellLeft)}px`,
                                  top: 0,
                                  bottom: 0,
                                  borderRadius: '3px',
                                  border: isDropTargetWeek ? '1px dashed #1D4ED8' : undefined,
                                  boxSizing: 'border-box',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  pointerEvents: weekEvents.length === 0 && activity.id ? 'auto' : 'none',
                                  cursor: weekEvents.length === 0 && activity.id ? 'copy' : undefined
                                }}
                              >
                                {weekEvents.map(eventItem => (
                                  <div
                                    key={eventItem.id}
                                    onMouseDown={(e) => beginEventDrag(e, eventItem, week, activity, activityIndex, rowIndex)}
                                    onMouseEnter={(e) => {
                                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                      const openUpward = rect.bottom + 110 > window.innerHeight;
                                      setHoveredEventKey(`${activity.id}:${eventItem.id}`);
                                      setHoveredEventPopup({
                                        event: { ...eventItem, name: eventCellLabel(activity, eventItem) },
                                        x: rect.left + rect.width / 2,
                                        y: openUpward ? rect.top - 6 : rect.bottom + 6,
                                        openUpward
                                      });
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredEventKey(prev => (prev === `${activity.id}:${eventItem.id}` ? null : prev));
                                      setHoveredEventPopup(null);
                                    }}
                                    style={{
                                      position: 'relative',
                                      pointerEvents: 'auto',
                                      flex: 1,
                                      minHeight: 0,
                                      padding: '3px 5px',
                                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                      border: '1px solid #BAE6FD',
                                      borderRadius: '3px',
                                      cursor: dragging ? 'grabbing' : 'grab',
                                      overflow: 'visible',
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    <div style={{
                                      fontSize: '10px',
                                      fontWeight: 500,
                                      color: '#334155',
                                      fontFamily: 'Inter',
                                      lineHeight: 1.25,
                                      whiteSpace: 'normal',
                                      wordBreak: 'break-word',
                                      overflow: 'hidden',
                                      maxHeight: '100%',
                                      pointerEvents: 'none',
                                      paddingRight: hoveredEventKey === `${activity.id}:${eventItem.id}` && !dragging ? '12px' : 0
                                    }}>
                                      {eventCellLabel(activity, eventItem)}
                                    </div>
                                    {/* Hover delete for this event (confirmed) */}
                                    {hoveredEventKey === `${activity.id}:${eventItem.id}` && !dragging && (
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmDeleteEvent(eventItem);
                                          setHoveredEventPopup(null);
                                        }}
                                        title="Remove this event"
                                        style={{
                                          position: 'absolute',
                                          right: '2px',
                                          top: '2px',
                                          padding: '1px',
                                          backgroundColor: 'transparent',
                                          border: 'none',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}
                                      >
                                        <X size={11} color="#64748B" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {/* Unsaved activity: preview the event cells
                                    that saving will create - the live-typed
                                    Activity Title for ad-hoc exercises, or the
                                    week's lesson name for syllabus activities */}
                                {weekEvents.length === 0 && !activity.id && (() => {
                                  const previewLabel = activity.kind === 'objectives'
                                    ? (activity.label || '')
                                    : activity.syllabusId
                                      ? (syllabusMissionNames[activity.syllabusId] || [])[week - activity.startWeek]
                                      : undefined;
                                  if (previewLabel === undefined) return null; // no syllabus picked / span outruns the lessons
                                  return (
                                    <div style={{
                                      flex: 1,
                                      minHeight: 0,
                                      padding: '3px 5px',
                                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                      border: '1px solid #BAE6FD',
                                      borderRadius: '3px',
                                      boxSizing: 'border-box'
                                    }}>
                                      <div style={{
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        color: '#334155',
                                        fontFamily: 'Inter',
                                        lineHeight: 1.25,
                                        whiteSpace: 'normal',
                                        wordBreak: 'break-word',
                                        overflow: 'hidden',
                                        maxHeight: '100%'
                                      }}>
                                        {previewLabel}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>

                        {/* Hover controls: reset-to-syllabus + delete (both confirmed) */}
                        {hoveredActivityIndex === activityIndex && !dragging && (
                          <div style={{ position: 'absolute', right: '6px', top: '2px', display: 'flex', gap: '2px', zIndex: 1 }}>
                            {activity.kind === 'syllabus' && activity.id && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmResetIndex(activityIndex);
                                }}
                                title="Reset to syllabus (length, order, and events)"
                                style={{
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
                                <RotateCcw size={13} color="#64748B" />
                              </button>
                            )}
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteIndex(activityIndex);
                              }}
                              title="Delete activity"
                              style={{
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
                          </div>
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

      {/* Event details popup - portaled to the body so the gantt's scroll
          container and the dialog's transform can't clip or offset it */}
      {hoveredEventPopup && hoveredEventKey && !dragging && createPortal(
        <div style={{
          position: 'fixed',
          left: `${hoveredEventPopup.x}px`,
          top: `${hoveredEventPopup.y}px`,
          transform: hoveredEventPopup.openUpward ? 'translate(-50%, -100%)' : 'translateX(-50%)',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '10px 12px',
          minWidth: 'max-content',
          zIndex: 3000,
          pointerEvents: 'none',
          textAlign: 'left'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', fontFamily: 'Inter', marginBottom: '2px' }}>
            {hoveredEventPopup.event.name}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', fontFamily: 'Inter' }}>
            {new Date(hoveredEventPopup.event.startDatetime).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit'
            })}
          </div>
          <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter', marginTop: '4px' }}>
            Drag to another week to reschedule
          </div>
        </div>,
        document.body
      )}

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

      <ConfirmationDialog
        isOpen={confirmResetIndex !== null}
        title="Reset Activity to Syllabus"
        message={confirmResetIndex !== null && activities[confirmResetIndex]
          ? `Reset "${activityTitle(activities[confirmResetIndex])}" to its syllabus's original length and lesson order? Reordered, changed, or missing events will be restored to match the syllabus.`
          : ''}
        confirmText="Reset"
        type="warning"
        icon="warning"
        onConfirm={() => {
          if (confirmResetIndex !== null) onResetActivity(confirmResetIndex);
          setConfirmResetIndex(null);
          setHoveredActivityIndex(null);
        }}
        onCancel={() => setConfirmResetIndex(null)}
      />

      <ConfirmationDialog
        isOpen={confirmDeleteRow !== null}
        title="Delete Participant Row"
        message={confirmDeleteRow
          ? (confirmDeleteRow.activityIndices.length > 0
            ? `Delete this participant row and its ${confirmDeleteRow.activityIndices.length} ${confirmDeleteRow.activityIndices.length === 1 ? 'activity' : 'activities'} from the cycle?`
            : 'Delete this participant row from the cycle?')
          : ''}
        confirmText="Delete"
        type="danger"
        icon="trash"
        onConfirm={() => {
          if (confirmDeleteRow) onRemoveParticipantRow(confirmDeleteRow.rowKey);
          setConfirmDeleteRow(null);
          setHoveredRowKey(null);
        }}
        onCancel={() => setConfirmDeleteRow(null)}
      />

      <ConfirmationDialog
        isOpen={confirmDeleteEvent !== null}
        title="Remove Event"
        message={confirmDeleteEvent
          ? `Remove "${confirmDeleteEvent.name}" from this activity? If nothing else uses the event, it will be removed from the schedule. Published or past events are archived (recoverable by an administrator); unpublished future events are permanently deleted.`
          : ''}
        confirmText="Remove"
        type="danger"
        icon="trash"
        onConfirm={() => {
          if (confirmDeleteEvent) onDeleteEvent(confirmDeleteEvent);
          setConfirmDeleteEvent(null);
        }}
        onCancel={() => setConfirmDeleteEvent(null)}
      />
    </div>
  );
};

export default CycleActivitiesBuilder;
