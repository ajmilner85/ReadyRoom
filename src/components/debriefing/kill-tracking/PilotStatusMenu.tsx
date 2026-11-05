import React from 'react';
import { User, UserSearch, Skull, HelpCircle } from 'lucide-react';

type PilotStatus = 'alive' | 'mia' | 'kia' | 'unaccounted';

interface PilotStatusMenuProps {
  currentStatus: PilotStatus;
  onSelect: (status: PilotStatus) => void;
  position: { top: number; left: number };
}

const PilotStatusMenu: React.FC<PilotStatusMenuProps> = ({
  currentStatus,
  onSelect,
  position
}) => {
  const statuses: Array<{ value: PilotStatus; label: string; color: string; icon: React.ComponentType<any> }> = [
    { value: 'alive', label: 'Alive', color: 'var(--rr-good)', icon: User }, // Green
    { value: 'mia', label: 'MIA', color: 'var(--rr-warn)', icon: UserSearch },    // Amber
    { value: 'kia', label: 'KIA', color: 'var(--rr-bad)', icon: Skull },      // Red
    { value: 'unaccounted', label: 'Unaccounted', color: 'var(--rr-text3)', icon: HelpCircle } // Gray
  ];

  return (
    <div
      data-status-menu="pilot"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        backgroundColor: 'var(--rr-panel)',
        border: '1px solid var(--rr-border)',
        borderRadius: '10px',
        boxShadow: 'var(--rr-shadow)',
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
                e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
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

export default PilotStatusMenu;
