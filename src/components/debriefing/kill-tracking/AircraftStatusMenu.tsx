import React from 'react';
import { PlaneLanding, Wrench, Flame } from 'lucide-react';

type AircraftStatus = 'recovered' | 'damaged' | 'destroyed';

interface AircraftStatusMenuProps {
  currentStatus: AircraftStatus;
  onSelect: (status: AircraftStatus) => void;
  position: { top: number; left: number };
}

const AircraftStatusMenu: React.FC<AircraftStatusMenuProps> = ({
  currentStatus,
  onSelect,
  position
}) => {
  const statuses: Array<{ value: AircraftStatus; label: string; color: string; icon: React.ComponentType<any> }> = [
    { value: 'recovered', label: 'Recovered', color: '#10B981', icon: PlaneLanding }, // Green
    { value: 'damaged', label: 'Damaged', color: '#F59E0B', icon: Wrench },     // Amber
    { value: 'destroyed', label: 'Destroyed', color: '#EF4444', icon: Flame }  // Red
  ];

  return (
    <div
      data-status-menu="aircraft"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
        padding: '4px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}
      onClick={(e) => e.stopPropagation()} // Prevent click from bubbling
    >
      {statuses.map((status) => {
        const Icon = status.icon;
        return (
          <button
            key={status.value}
            type="button"
            onClick={() => onSelect(status.value)}
            style={{
              width: '32px',
              height: '32px',
              padding: '0',
              backgroundColor: currentStatus === status.value ? status.color : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              if (currentStatus !== status.value) {
                e.currentTarget.style.backgroundColor = '#F3F4F6';
              }
            }}
            onMouseLeave={(e) => {
              if (currentStatus !== status.value) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Icon
              size={20}
              style={{
                color: currentStatus === status.value ? '#FFFFFF' : status.color
              }}
            />
          </button>
        );
      })}
    </div>
  );
};

export default AircraftStatusMenu;
