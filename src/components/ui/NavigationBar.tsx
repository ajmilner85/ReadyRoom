import React from 'react';
import { Users, Layout, Calendar, FileText } from 'lucide-react';

interface NavigationButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  view: 'roster' | 'flights' | 'events' | 'mission-prep';
}

const buttons: NavigationButton[] = [
  {
    id: 'roster',
    icon: <Users size={24} />,
    label: 'Squadron Roster',
    view: 'roster'
  },
  {
    id: 'events',
    icon: <Calendar size={24} />,
    label: 'Squadron Events',
    view: 'events'
  },
  {
    id: 'mission-prep',
    icon: <FileText size={24} />,
    label: 'Mission Preparation',
    view: 'mission-prep'
  },
  {
    id: 'flights',
    icon: <Layout size={24} />,
    label: 'Flight Management',
    view: 'flights'
  }
];

interface NavigationBarProps {
  onNavigate: (view: 'roster' | 'flights' | 'events' | 'mission-prep') => void;
  activeButton: string;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onNavigate, activeButton }) => {
  const buttonStyle = {
    position: 'relative' as const,
    width: '50px',
    height: '50px',
    marginBottom: '32px',
    cursor: 'pointer'
  };

  const buttonBackgroundStyle = {
    position: 'absolute' as const,
    width: '60px',
    height: '60px',
    left: '-5px',
    top: '-5px',
    background: '#E0E4E9',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease'
  };

  const buttonIconStyle = {
    position: 'absolute' as const,
    width: '50px',
    height: '50px',
    left: '0px',
    top: '0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000000',
    zIndex: 2,
    pointerEvents: 'none' as const
  };

  return (
    <div className="h-full bg-[#F9FAFB] border-r border-[#E2E8F0] flex flex-col">
      {/* Logo section */}
      <div className="p-[10px]">
        <img 
          src="/src/assets/Stingrays Logo 80x80.png" 
          alt="Stingrays Logo" 
          className="w-20 h-20"
        />
      </div>
      
      {/* Navigation buttons - centered vertically */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center">
          {buttons.map((button) => (
            <div 
              key={button.id} 
              style={buttonStyle}
              onClick={() => onNavigate(button.view)}
            >
              <div 
                style={{
                  ...buttonBackgroundStyle,
                  background: activeButton === button.id ? '#82728C' : '#E0E4E9',
                }}
                onMouseEnter={(e) => {
                  if (activeButton !== button.id) {
                    e.currentTarget.style.background = '#5B4E61';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeButton !== button.id) {
                    e.currentTarget.style.background = '#E0E4E9';
                  }
                }}
              />
              <div 
                style={{
                  ...buttonIconStyle,
                  color: activeButton === button.id ? '#FFFFFF' : '#000000'
                }}
              >
                {button.icon}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Storage area height match */}
      <div className="h-[160px] bg-[#F9FAFB]" />
    </div>
  );
};

export default NavigationBar;