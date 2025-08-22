import React from 'react';
import { Users, Layout, Calendar, FileText, Settings, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { signOut } from '../../utils/supabaseClient';

interface NavigationButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  view: 'roster' | 'flights' | 'events' | 'mission-prep' | 'admin';
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
  },
  {
    id: 'admin',
    icon: <Settings size={24} />,
    label: 'Settings',
    view: 'admin'
  }
];

interface NavigationBarProps {
  onNavigate: (view: 'roster' | 'flights' | 'events' | 'mission-prep' | 'admin') => void;
  activeButton: string;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ onNavigate, activeButton }) => {
  const [tooltipVisible, setTooltipVisible] = React.useState<string | null>(null);
  const { user, userProfile } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      // The auth context will handle the state change
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };
  
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
  
  const tooltipStyle = {
    position: 'absolute' as const,
    left: '70px',
    backgroundColor: '#1E293B',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
    zIndex: 100,
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
              onMouseEnter={() => setTooltipVisible(button.id)}
              onMouseLeave={() => setTooltipVisible(null)}
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
              
              {/* Tooltip */}
              {tooltipVisible === button.id && (
                <div style={tooltipStyle}>
                  {button.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-[10px] border-t border-[#E2E8F0]">
        <div className="relative">
          {/* User Avatar/Info */}
          <div 
            className="flex flex-col items-center space-y-2 p-2 rounded-lg bg-white border border-gray-200 mb-2"
            onMouseEnter={() => setTooltipVisible('user-profile')}
            onMouseLeave={() => setTooltipVisible(null)}
          >
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              {userProfile?.discordId ? (
                <span className="text-xs font-medium text-indigo-600">
                  {userProfile.pilot?.callsign?.charAt(0) || userProfile.discordUsername?.charAt(0) || 'U'}
                </span>
              ) : (
                <User size={16} className="text-indigo-600" />
              )}
            </div>
            <div className="text-xs text-center text-gray-600 leading-tight max-w-[70px]">
              {userProfile?.pilot?.callsign || userProfile?.discordUsername || 'User'}
            </div>
          </div>

          {/* User Profile Tooltip */}
          {tooltipVisible === 'user-profile' && (
            <div style={{
              ...tooltipStyle,
              top: '0px',
              width: '200px',
              whiteSpace: 'normal' as const
            }}>
              <div className="font-medium">
                {userProfile?.pilot?.callsign || userProfile?.discordUsername || 'Unknown User'}
              </div>
              {userProfile?.pilot?.boardNumber && (
                <div className="text-xs opacity-80">
                  Board #{userProfile.pilot.boardNumber}
                </div>
              )}
              <div className="text-xs opacity-80">
                Discord: {userProfile?.discordUsername || 'Not connected'}
              </div>
              {!userProfile?.pilot && (
                <div className="text-xs opacity-80 text-yellow-600">
                  Not linked to pilot record
                </div>
              )}
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
            onMouseEnter={() => setTooltipVisible('logout')}
            onMouseLeave={() => setTooltipVisible(null)}
          >
            <LogOut size={16} className="text-red-600" />
          </button>

          {/* Logout Tooltip */}
          {tooltipVisible === 'logout' && (
            <div style={{
              ...tooltipStyle,
              bottom: '0px',
              left: '90px'
            }}>
              Sign Out
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;