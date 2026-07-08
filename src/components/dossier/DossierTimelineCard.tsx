import React, { useState } from 'react';
import { Users, Award, Star, Anchor, GraduationCap, Activity, Briefcase, Pencil, Trash2, X } from 'lucide-react';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import type { TimelineEvent, TimelineEventType } from '../../utils/dossierService';

interface DossierTimelineCardProps {
  timeline: TimelineEvent[];
  loading: boolean;
  canEdit: boolean;
  onDeleteEvent: (event: TimelineEvent) => void;
  onEditEventDate: (event: TimelineEvent, newDate: string) => void;
  busyEventId: string | null;
  errorMessage?: string | null;
}

const EVENT_APPEARANCE: Record<TimelineEventType, { color: string; icon: React.ReactNode }> = {
  squadron: { color: '#3B82F6', icon: <Users size={12} /> },
  billet: { color: '#8B5CF6', icon: <Briefcase size={12} /> },
  qualification: { color: '#F97316', icon: <Award size={12} /> },
  standing: { color: '#10B981', icon: <Star size={12} /> },
  status: { color: '#64748B', icon: <Activity size={12} /> },
  graduation: { color: '#EAB308', icon: <GraduationCap size={12} /> },
  cruise: { color: '#0EA5E9', icon: <Anchor size={12} /> }
};

const DossierTimelineCard: React.FC<DossierTimelineCardProps> = ({
  timeline,
  loading,
  canEdit,
  onDeleteEvent,
  onEditEventDate,
  busyEventId,
  errorMessage = null
}) => {
  const [editMode, setEditMode] = useState(false);

  return (
    <div style={{ ...dossierStyles.card, width: '420px', flexShrink: 0, height: '100%' }}>
      <div style={{ ...dossierStyles.cardHeader, position: 'relative' }}>
        <span style={dossierStyles.cardHeaderText}>Timeline</span>
        {canEdit && (
          <button
            onClick={() => setEditMode(!editMode)}
            title={editMode ? 'Exit edit mode' : 'Edit timeline (remove erroneous records)'}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: editMode ? '#FEE2E2' : '#FFFFFF',
              color: editMode ? '#B91C1C' : '#64748B',
              border: editMode ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {editMode ? <X size={14} /> : <Pencil size={14} />}
          </button>
        )}
      </div>
      <div style={dossierStyles.cardContent}>
        {editMode && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#B91C1C'
          }}>
            Edit mode: change an entry's date with the date picker, or delete it to permanently remove the underlying history record.
          </div>
        )}
        {errorMessage && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#B91C1C',
            fontWeight: 500
          }}>
            {errorMessage}
          </div>
        )}
        {loading ? (
          <div style={dossierStyles.emptyState}>Loading timeline...</div>
        ) : timeline.length === 0 ? (
          <div style={dossierStyles.emptyState}>No milestones recorded yet</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '36px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '11px',
              top: '18px',
              bottom: '24px',
              width: '2px',
              backgroundColor: '#E2E8F0'
            }} />
            {timeline.map(event => {
              const appearance = EVENT_APPEARANCE[event.type] || EVENT_APPEARANCE.status;
              const isBusy = busyEventId === event.id;
              return (
                <div key={event.id} style={{ position: 'relative', paddingBottom: '20px', opacity: isBusy ? 0.4 : 1 }}>
                  {/* Dot — centered on the date + title block (16px + 20px tall) */}
                  <div style={{
                    position: 'absolute',
                    left: '-36px',
                    top: '6px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: appearance.color,
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px #E2E8F0'
                  }}>
                    {appearance.icon}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editMode && event.source ? (
                        <input
                          type="date"
                          defaultValue={(event.date || '').split('T')[0]}
                          disabled={isBusy}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const currentDate = (event.date || '').split('T')[0];
                            if (newDate && newDate !== currentDate) {
                              onEditEventDate(event, newDate);
                            }
                          }}
                          style={{
                            fontSize: '12px',
                            color: '#0F172A',
                            border: '1px solid #CBD5E1',
                            borderRadius: '4px',
                            backgroundColor: '#F8FAFC',
                            padding: '0 4px',
                            height: '18px',
                            fontFamily: 'Inter'
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '16px' }}>
                          {formatDossierDate(event.date)}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 500, lineHeight: '20px' }}>
                        {event.title}
                      </div>
                      {event.subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '16px' }}>
                          {event.subtitle}
                        </div>
                      )}
                    </div>
                    {editMode && event.source && (
                      <button
                        onClick={() => onDeleteEvent(event)}
                        disabled={isBusy}
                        title="Delete this history record"
                        style={{
                          width: '24px',
                          height: '24px',
                          flexShrink: 0,
                          marginTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'transparent',
                          color: '#DC2626',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: isBusy ? 'wait' : 'pointer'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DossierTimelineCard;
