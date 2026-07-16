import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { CycleActivity } from '../../../types/EventTypes';

interface SquadronInfo {
  id: string;
  name: string;
  designation?: string;
  insignia_url?: string | null;
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
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onAddActivity: () => void;
}

const WEEK_COL_WIDTH = 96;
const ROW_HEIGHT = 44;
const HEADER_COL_WIDTH = 150;

type DragMode = 'move' | 'resize-left' | 'resize-right';

interface DragState {
  mode: DragMode;
  activityIndex: number;
  startClientX: number;
  originalStartWeek: number;
  originalEndWeek: number;
}

/**
 * Visual cycle builder: weeks as columns, one row per activity, blocks spanning
 * the activity's week range. Blocks drag to move and resize from either edge;
 * clicking selects the activity for the config panel below.
 */
const CycleActivitiesBuilder: React.FC<CycleActivitiesBuilderProps> = ({
  activities,
  onChange,
  weekCount,
  onWeekCountChange,
  startDate,
  squadrons,
  syllabusNames,
  selectedIndex,
  onSelect,
  onAddActivity
}) => {
  const dragStateRef = useRef<DragState | null>(null);
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;
  const [dragging, setDragging] = useState(false);

  // Window-level listeners while a drag is in progress
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const deltaWeeks = Math.round((e.clientX - drag.startClientX) / WEEK_COL_WIDTH);
      if (deltaWeeks === 0 && e.type === 'mousemove') {
        // still apply (supports returning to origin after having moved)
      }

      const current = activitiesRef.current;
      const activity = current[drag.activityIndex];
      if (!activity) return;

      let startWeek = drag.originalStartWeek;
      let endWeek = drag.originalEndWeek;
      const span = drag.originalEndWeek - drag.originalStartWeek;

      if (drag.mode === 'move') {
        startWeek = drag.originalStartWeek + deltaWeeks;
        // Clamp the whole block inside [1, weekCount]
        startWeek = Math.max(1, Math.min(weekCount - span, startWeek));
        endWeek = startWeek + span;
      } else if (drag.mode === 'resize-left') {
        startWeek = Math.max(1, Math.min(drag.originalEndWeek, drag.originalStartWeek + deltaWeeks));
      } else {
        endWeek = Math.min(weekCount, Math.max(drag.originalStartWeek, drag.originalEndWeek + deltaWeeks));
      }

      if (startWeek !== activity.startWeek || endWeek !== activity.endWeek) {
        onChange(current.map((a, i) => (i === drag.activityIndex ? { ...a, startWeek, endWeek } : a)));
      }
    };

    const handleUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, weekCount, onChange]);

  const beginDrag = (e: React.MouseEvent, activityIndex: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const activity = activities[activityIndex];
    dragStateRef.current = {
      mode,
      activityIndex,
      startClientX: e.clientX,
      originalStartWeek: activity.startWeek,
      originalEndWeek: activity.endWeek
    };
    setDragging(true);
    onSelect(activityIndex);
  };

  // Week header dates: week n starts at cycle start + 7*(n-1) days
  const weekDates = useMemo(() => {
    if (!startDate) return Array(weekCount).fill('');
    const base = new Date(startDate);
    if (isNaN(base.getTime())) return Array(weekCount).fill('');
    return Array.from({ length: weekCount }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i * 7);
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    });
  }, [startDate, weekCount]);

  const activityTitle = (activity: CycleActivity): string => {
    if (activity.label) return activity.label;
    if (activity.kind === 'syllabus' && activity.syllabusId) {
      return syllabusNames[activity.syllabusId] || 'Syllabus';
    }
    return activity.kind === 'objectives' ? 'Training Exercise' : 'Activity';
  };

  // Row header: squadron insignias from the activity's participant criteria,
  // plus a bubble listing the non-squadron criteria (e.g. "Instructor Pilot")
  const renderParticipantHeader = (activity: CycleActivity) => {
    const blocks = activity.settings?.participantCriteria || [];
    const squadronIds = new Set<string>();
    const otherCriteria = new Set<string>();
    blocks.forEach(block => {
      block.criteria.forEach(criterion => {
        if (criterion.type === 'squadron') {
          (criterion.values ?? (criterion.value ? [criterion.value] : [])).forEach(id => squadronIds.add(id));
        } else if (criterion.value) {
          otherCriteria.add(criterion.value);
        }
      });
    });

    const squadronList = squadrons.filter(s => squadronIds.has(s.id));

    if (squadronList.length === 0 && otherCriteria.size === 0) {
      return (
        <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
          All participants
        </span>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {squadronList.map(squadron => (
          squadron.insignia_url ? (
            <div
              key={squadron.id}
              title={squadron.designation || squadron.name}
              style={{
                width: '22px',
                height: '22px',
                backgroundImage: `url(${squadron.insignia_url})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                flexShrink: 0
              }}
            />
          ) : (
            <span
              key={squadron.id}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                backgroundColor: '#F1F5F9',
                border: '1px solid #E2E8F0',
                borderRadius: '9999px',
                padding: '1px 6px'
              }}
            >
              {squadron.designation || squadron.name}
            </span>
          )
        ))}
        {otherCriteria.size > 0 && (
          <span style={{
            fontSize: '10px',
            fontWeight: 500,
            color: '#1E40AF',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '9999px',
            padding: '1px 6px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: `${HEADER_COL_WIDTH - 16}px`
          }}>
            {Array.from(otherCriteria).join(', ')}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <button
          onClick={onAddActivity}
          style={{
            padding: '8px 16px',
            border: '1px solid #3B82F6',
            backgroundColor: '#EFF6FF',
            color: '#3B82F6',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontFamily: 'Inter',
            fontWeight: 500
          }}
        >
          + Add Activity
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter' }}>
          Weeks: {weekCount}
        </span>
        <button
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
      <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
        <div style={{ minWidth: `${HEADER_COL_WIDTH + weekCount * WEEK_COL_WIDTH}px`, userSelect: dragging ? 'none' : undefined }}>
          {/* Header row */}
          <div style={{ display: 'flex', borderBottom: '2px solid #CBD5E1' }}>
            <div style={{ width: `${HEADER_COL_WIDTH}px`, flexShrink: 0, padding: '8px', fontSize: '11px', fontWeight: 600, color: '#64748B', fontFamily: 'Inter', textTransform: 'uppercase' }}>
              Participants
            </div>
            {Array.from({ length: weekCount }, (_, i) => (
              <div
                key={i}
                style={{
                  width: `${WEEK_COL_WIDTH}px`,
                  flexShrink: 0,
                  padding: '6px 4px',
                  textAlign: 'center',
                  borderLeft: '1px solid #E2E8F0'
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

          {/* Activity rows */}
          {activities.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
              No activities yet. Add one to block out what runs during this cycle.
            </div>
          )}
          {activities.map((activity, index) => {
            const isSelected = selectedIndex === index;
            const left = (activity.startWeek - 1) * WEEK_COL_WIDTH;
            const width = (activity.endWeek - activity.startWeek + 1) * WEEK_COL_WIDTH;
            return (
              <div key={activity.id || `new-${index}`} style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
                {/* Participant header */}
                <div style={{
                  width: `${HEADER_COL_WIDTH}px`,
                  flexShrink: 0,
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: `${ROW_HEIGHT}px`,
                  boxSizing: 'border-box'
                }}>
                  {renderParticipantHeader(activity)}
                </div>
                {/* Track */}
                <div
                  style={{
                    position: 'relative',
                    height: `${ROW_HEIGHT}px`,
                    width: `${weekCount * WEEK_COL_WIDTH}px`,
                    flexShrink: 0,
                    // Week gridlines
                    backgroundImage: 'linear-gradient(to right, #E2E8F0 1px, transparent 1px)',
                    backgroundSize: `${WEEK_COL_WIDTH}px 100%`
                  }}
                  onClick={() => onSelect(isSelected ? null : index)}
                >
                  <div
                    onMouseDown={(e) => beginDrag(e, index, 'move')}
                    onClick={(e) => { e.stopPropagation(); onSelect(index); }}
                    title={activityTitle(activity)}
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
                    {/* Resize handles */}
                    <div
                      onMouseDown={(e) => beginDrag(e, index, 'resize-left')}
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize' }}
                    />
                    <div
                      onMouseDown={(e) => beginDrag(e, index, 'resize-right')}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CycleActivitiesBuilder;
