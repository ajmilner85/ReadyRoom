import React from 'react';
import { Users, Layout, Calendar } from 'lucide-react';

interface NavigationButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  view: 'roster' | 'flights' | 'events';
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
    id: 'flights',
    icon: <Layout size={24} />,
    label: 'Flight Management',
    view: 'flights'
  }
];

interface NavigationBarProps {
  onNavigate: (view: 'roster' | 'flights' | 'events') => void;
  activeButton: string;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onNavigate, activeButton }) => {
  const topButtons = buttons.slice(0, 3);
  const bottomButtons = buttons.slice(3);

  const buttonStyle = {
    position: 'relative' as const,
    width: '50px',
    height: '50px',
    marginBottom: '32px', // Reduced to 32px as suggested
    cursor: 'pointer' // Ensure cursor shows it's clickable
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
    zIndex: 2, // Ensure icon is above background
    pointerEvents: 'none' as const // Allow click to pass through to parent
  };

  return (
    <div className="h-full bg-[#F9FAFB] border-r border-[#E2E8F0] flex flex-col">
      {/* Main navigation area */}
      <div className="h-[calc(100vh-160px)] flex flex-col">
        {/* Logo section */}
        <div className="p-[10px]">
          <img 
            src="/src/assets/Stingrays Logo 80x80.png" 
            alt="Stingrays Logo" 
            className="w-20 h-20"
          />
        </div>
        
        {/* Flex container for all buttons */}
        <div className="flex-1 flex flex-col">
          {/* Center container for top buttons */}
          <div className="flex-1 flex flex-col justify-center items-center">
            {topButtons.map((button) => (
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

          {/* Bottom buttons */}
          <div className="pb-5">
            {bottomButtons.map((button) => (
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
      </div>

      {/* Storage area height match */}
      <div className="h-[160px] bg-[#F9FAFB]" />
    </div>
  );
};

export default NavigationBar;