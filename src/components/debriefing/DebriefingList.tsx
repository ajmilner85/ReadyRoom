import React from 'react';
import { Icon } from '../ui/primitives';
import { Card } from '../ui/card';
import type { DebriefStatus } from '../../types/DebriefingTypes';

interface MissionListItem {
  id: string;
  name: string;
  scheduled_time: string;
  mission_debriefings?: Array<{
    id: string;
    status: DebriefStatus;
    created_at: string;
    finalized_at?: string;
  }>;
}

interface DebriefingListProps {
  missions: MissionListItem[];
  onSelectMission: (mission: MissionListItem) => void;
  loading?: boolean;
}

const getStatusInfo = (
  debriefs?: MissionListItem['mission_debriefings']
): {
  status: 'no_debrief' | 'pending' | 'in_progress' | 'finalized';
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
} => {
  if (!debriefs || debriefs.length === 0) {
    return {
      status: 'no_debrief',
      label: 'Not Started',
      color: 'var(--rr-text2)',
      bgColor: 'var(--rr-panel2)',
      icon: <Icon name="dossier" size={14} />
    };
  }

  const debrief = debriefs[0];

  if (!debrief) {
    return {
      status: 'no_debrief',
      label: 'Not Started',
      color: 'var(--rr-text2)',
      bgColor: 'var(--rr-panel2)',
      icon: <Icon name="clock" size={14} />
    };
  }

  switch (debrief.status) {
    case 'finalized':
      return {
        status: 'finalized',
        label: 'Finalized',
        color: 'var(--rr-good)',
        bgColor: 'rgba(64,168,91,.14)',
        icon: <Icon name="checkCircle" size={14} />
      };
    case 'submitted':
    case 'in_progress':
      return {
        status: 'in_progress',
        label: 'In Progress',
        color: 'var(--rr-warn)',
        bgColor: 'rgba(222,154,31,.14)',
        icon: <Icon name="clock" size={14} />
      };
    default:
      return {
        status: 'pending',
        label: 'Pending',
        color: 'var(--rr-text2)',
        bgColor: 'var(--rr-panel2)',
        icon: <Icon name="dossier" size={14} />
      };
  }
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const DebriefingList: React.FC<DebriefingListProps> = ({
  missions,
  onSelectMission,
  loading = false
}) => {
  if (loading) {
    return (
      <Card>
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--rr-text3)',
            fontSize: '14px'
          }}
        >
          Loading missions...
        </div>
      </Card>
    );
  }

  if (missions.length === 0) {
    return (
      <Card>
        <div
          style={{
            padding: '60px 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <Icon name="dossier" size={40} style={{ color: 'var(--rr-text3)' }} />
          <h3
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--rr-text2)',
              marginTop: '8px'
            }}
          >
            No Missions Found
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--rr-text3)', maxWidth: '400px' }}>
            No completed missions are available for debriefing. Missions will appear here after
            they have taken place.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {missions.map((mission) => {
        const statusInfo = getStatusInfo(mission.mission_debriefings);

        return (
          <Card key={mission.id}>
            <div
              onClick={() => onSelectMission(mission)}
              style={{
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {/* Mission Info */}
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--rr-text)',
                    marginBottom: '6px'
                  }}
                >
                  {mission.name}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: 'var(--rr-text2)'
                  }}
                >
                  <Icon name="events" size={14} />
                  {formatDate(mission.scheduled_time)}
                </div>
              </div>

              {/* Status Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: statusInfo.bgColor,
                  color: statusInfo.color,
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {statusInfo.icon}
                {statusInfo.label}
              </div>

              {/* Arrow */}
              <Icon name="chevronRight" size={20} style={{ color: 'var(--rr-text3)' }} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default DebriefingList;
