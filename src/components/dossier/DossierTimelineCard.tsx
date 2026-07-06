import React from 'react';
import { Users, Award, Star, Anchor, GraduationCap, Activity, Briefcase } from 'lucide-react';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import type { TimelineEvent, TimelineEventType } from '../../utils/dossierService';

interface DossierTimelineCardProps {
  timeline: TimelineEvent[];
  loading: boolean;
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

const DossierTimelineCard: React.FC<DossierTimelineCardProps> = ({ timeline, loading }) => {
  return (
    <div style={{ ...dossierStyles.card, width: '420px', flexShrink: 0, height: '100%' }}>
      <div style={dossierStyles.cardHeader}>
        <span style={dossierStyles.cardHeaderText}>Timeline</span>
      </div>
      <div style={dossierStyles.cardContent}>
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
              top: '4px',
              bottom: '4px',
              width: '2px',
              backgroundColor: '#E2E8F0'
            }} />
            {timeline.map(event => {
              const appearance = EVENT_APPEARANCE[event.type] || EVENT_APPEARANCE.status;
              return (
                <div key={event.id} style={{ position: 'relative', paddingBottom: '20px' }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute',
                    left: '-36px',
                    top: '0px',
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
                  <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '16px' }}>
                    {formatDossierDate(event.date)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 500, lineHeight: '20px' }}>
                    {event.title}
                  </div>
                  {event.subtitle && (
                    <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '16px' }}>
                      {event.subtitle}
                    </div>
                  )}
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
