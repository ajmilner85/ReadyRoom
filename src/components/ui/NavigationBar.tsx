import React from 'react';
import { Users, Layout, Calendar, FileText, Settings, LogOut, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { signOut } from '../../utils/supabaseClient';
// Removed deprecated getUserPermissionsSync import - using new permission system
import { useSimplePermissions } from '../../hooks/usePermissions';
import { useAppSettings } from '../../context/AppSettingsContext';
import { usePageLoading } from '../../context/PageLoadingContext';

interface NavigationButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  route: string;
  // Updated to use new permission names
  requiresPermission: 'access_home' | 'access_roster' | 'access_events' | 'access_mission_prep' | 'access_flights' | 'access_settings';
  // Legacy permission for backward compatibility during migration
  legacyPermission?: 'canManageRoster' | 'canManageFlights' | 'canManageEvents' | 'canAccessMissionPrep' | 'canAccessSettings';
}

const buttons: NavigationButton[] = [
  {
    id: 'home',
    icon: <Home size={24} />,
    label: 'Home',
    route: '/',
    requiresPermission: 'access_home',
    // No legacy permission - home should always be accessible
  },
  {
    id: 'roster',
    icon: <Users size={24} />,
    label: 'Squadron Roster',
    route: '/roster',
    requiresPermission: 'access_roster',
    legacyPermission: 'canManageRoster'
  },
  {
    id: 'events',
    icon: <Calendar size={24} />,
    label: 'Squadron Events',
    route: '/events',
    requiresPermission: 'access_events',
    legacyPermission: 'canManageEvents'
  },
  {
    id: 'mission-prep',
    icon: <FileText size={24} />,
    label: 'Mission Preparation',
    route: '/mission-prep',
    requiresPermission: 'access_mission_prep',
    legacyPermission: 'canAccessMissionPrep'
  },
  {
    id: 'flights',
    icon: <Layout size={24} />,
    label: 'Flight Management',
    route: '/mission-coordination',
    requiresPermission: 'access_flights',
    legacyPermission: 'canManageFlights'
  },
  {
    id: 'admin',
    icon: <Settings size={24} />,
    label: 'Settings',
    route: '/settings',
    requiresPermission: 'access_settings',
    legacyPermission: 'canManageEvents' // Temporary: use a permission you have
  }
];

interface NavigationBarProps {
  activeButton: string;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ activeButton }) => {
  const [tooltipVisible, setTooltipVisible] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { settings } = useAppSettings();
  const { setPageLoading, isPageLoading, loadingPage } = usePageLoading();
  
  // Use the new permission system
  const activePermissions = useSimplePermissions();
  

  // Add pulsing animation CSS if not already present
  React.useEffect(() => {
    const styleId = 'nav-button-pulse-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes navButtonPulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const handleNavigation = (route: string, buttonId: string) => {
    setPageLoading(buttonId, true);
    navigate(route);
  };

  const handleLogout = async () => {
    try {
      console.log('Logout initiated...');
      const { error } = await signOut();
      
      if (error) {
        console.error('Supabase signOut error:', error);
      } else {
        console.log('Supabase signOut successful');
      }
      
      // Force clear any remaining auth storage
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key);
          }
        });
        console.log('Cleared auth storage');
      } catch (storageError) {
        console.error('Error clearing storage:', storageError);
      }
      
      // Force reload to ensure clean state
      window.location.href = '/';
      
    } catch (error) {
      console.error('Error logging out:', error);
      // Force reload as fallback
      window.location.href = '/';
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
    top: '50%',
    transform: 'translateY(-50%)',
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
        {userProfile?.pilot?.currentSquadron?.insignia_url ? (
          <div
            style={{
              width: '80px',
              height: '80px',
              backgroundImage: `url(${userProfile.pilot.currentSquadron.insignia_url})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center'
            }}
            title={userProfile.pilot.currentSquadron.name || 'Squadron Insignia'}
          />
        ) : null}
      </div>
      
      {/* Navigation buttons - centered vertically */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center">
          {buttons
            .filter((button) => {
              // Check permissions using new permission system
              if (activePermissions.loading) return false; // Hide all while loading (secure by default)
              
              switch (button.requiresPermission) {
                case 'access_home': return activePermissions.canAccessHome;
                case 'access_roster': return activePermissions.canAccessRoster;
                case 'access_events': return activePermissions.canAccessEvents;
                case 'access_mission_prep': return activePermissions.canAccessMissionPrep;
                case 'access_flights': return activePermissions.canAccessFlights;
                case 'access_settings': return activePermissions.canAccessSettings;
                default: return false;
              }
            })
            .map((button) => (
            <div 
              key={button.id} 
              style={buttonStyle}
              onClick={() => handleNavigation(button.route, button.id)}
              onMouseEnter={() => setTooltipVisible(button.id)}
              onMouseLeave={() => setTooltipVisible(null)}
            >
              <div 
                style={{
                  ...buttonBackgroundStyle,
                  background: activeButton === button.id 
                    ? (settings.interfaceThemeUsesSquadronColors && userProfile?.pilot?.currentSquadron?.color_palette?.accent
                      ? userProfile.pilot.currentSquadron.color_palette.accent
                      : '#82728C')
                    : '#E0E4E9',
                  animation: isPageLoading && loadingPage === button.id 
                    ? 'navButtonPulse 1.5s ease-in-out infinite' 
                    : 'none',
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
      <div className="p-[10px]" style={{ paddingBottom: '20px' }}>
        <div className="relative flex flex-col items-center">
          {/* User Avatar/Info */}
          <div 
            className="flex flex-col items-center p-2 rounded-lg relative"
            style={{
              backgroundColor: '#9DA6AA',
              borderRadius: '8px',
              width: '60px',
              height: userProfile?.pilot ? 'auto' : '60px',
              minHeight: userProfile?.pilot ? '90px' : '60px',
              marginBottom: '16px'
            }}
            onMouseEnter={() => setTooltipVisible('user-profile')}
            onMouseLeave={() => setTooltipVisible(null)}
          >
            {userProfile?.pilot ? (
              // Pilot Record Display - Vertical layout with Board Number, Callsign, and Squadron insignia
              <>
                <div 
                  style={{
                    fontFamily: 'USN Stencil',
                    fontSize: '18px',
                    fontWeight: 400,
                    color: '#575A58',
                    lineHeight: '1',
                    marginTop: '4px'
                  }}
                >
                  {userProfile.pilot.boardNumber}
                </div>
                <div 
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: (() => {
                      const squadron = userProfile?.pilot?.currentSquadron;
                      const colorSetting = settings.displayPilotsWithSquadronColors;
                      
                      if (!colorSetting) {
                        return squadron ? '#000000' : '#374151';
                      }
                      
                      // When squadron colors are enabled, try primary color first
                      const primaryColor = squadron?.color_palette?.primary;
                      if (primaryColor) {
                        return primaryColor;
                      }
                      
                      // Fallback when no color_palette data
                      return squadron ? '#000000' : '#374151';
                    })(),
                    fontFamily: 'Inter',
                    lineHeight: '1',
                    marginTop: '2px',
                    textAlign: 'center'
                  }}
                >
                  {userProfile.pilot.callsign}
                </div>
{/* Discord Avatar */}
                {userProfile.discordAvatarUrl ? (
                  <div 
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundImage: `url(${userProfile.discordAvatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      marginTop: '4px'
                    }} 
                  />
                ) : (
                  <div 
                    style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#575A58',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '4px'
                    }}
                  >
                    <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>
                      {userProfile.pilot.callsign?.charAt(0).toUpperCase() || userProfile.discordUsername?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              // Non-pilot Discord Avatar Display
              <>
                {userProfile?.discordAvatarUrl ? (
                  <div 
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundImage: `url(${userProfile.discordAvatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center'
                    }} 
                  />
                ) : (
                  <div 
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <span style={{
                      fontSize: '18px',
                      fontWeight: 500,
                      color: '#6366f1'
                    }}>
                      {userProfile?.discordUsername?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
                <div style={{
                  fontSize: '10px',
                  textAlign: 'center',
                  color: '#575A58',
                  lineHeight: '1',
                  maxWidth: '50px',
                  marginTop: '4px',
                  fontFamily: 'Inter'
                }}>
                  {userProfile?.discordUsername || 'User'}
                </div>
              </>
            )}

            {/* User Profile Tooltip */}
            {tooltipVisible === 'user-profile' && (
              <div style={{
                position: 'absolute' as const,
                left: '70px',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: '#1E293B',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                width: '200px',
                whiteSpace: 'normal' as const,
                zIndex: 100,
                pointerEvents: 'none' as const
              }}>
                <div className="font-medium">
                  {userProfile?.pilot?.callsign || userProfile?.discordUsername || 'Unknown User'}
                </div>
                {userProfile?.pilot?.boardNumber && (
                  <div className="text-xs opacity-80">
                    Board {userProfile.pilot.boardNumber}
                  </div>
                )}
                <div className="text-xs opacity-80">
                  Discord: {userProfile?.discordUsername || 'Not connected'}
                </div>
                {(userProfile?.pilot?.billet || userProfile?.pilot?.currentSquadron?.designation) && (
                  <div className="text-xs opacity-80">
                    {userProfile.pilot.billet && userProfile.pilot.currentSquadron?.designation
                      ? `${userProfile.pilot.billet}, ${userProfile.pilot.currentSquadron.designation} ${userProfile.pilot.currentSquadron.name}`
                      : userProfile.pilot.billet || userProfile.pilot.currentSquadron?.designation
                    }
                  </div>
                )}
                {(userProfile?.pilot?.currentStanding?.name || userProfile?.pilot?.currentStatus?.name) && (
                  <div className="text-xs opacity-80">
                    {userProfile.pilot.currentStanding?.name && userProfile.pilot.currentStatus?.name
                      ? `${userProfile.pilot.currentStanding.name} - ${userProfile.pilot.currentStatus.name}`
                      : userProfile.pilot.currentStanding?.name || userProfile.pilot.currentStatus?.name
                    }
                  </div>
                )}
                {!userProfile?.pilot && (
                  <div className="text-xs opacity-80 text-yellow-600">
                    Not linked to pilot record
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Logout Button */}
          <div 
            style={{ display: 'flex', justifyContent: 'center', width: '100%', position: 'relative' }}
            onMouseEnter={() => setTooltipVisible('logout')}
            onMouseLeave={() => setTooltipVisible(null)}
          >
            <div 
              style={{
                ...buttonStyle,
                marginBottom: '0'
              }}
              onClick={handleLogout}
            >
              <div 
                style={{
                  ...buttonBackgroundStyle,
                  background: '#E0E4E9'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#5B4E61';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#E0E4E9';
                }}
              />
              <div 
                style={{
                  ...buttonIconStyle,
                  color: '#000000'
                }}
              >
                <LogOut size={24} />
              </div>
            </div>
            
            {/* Logout Tooltip */}
            {tooltipVisible === 'logout' && (
              <div style={{
                position: 'absolute' as const,
                left: '70px',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: '#1E293B',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'nowrap' as const,
                zIndex: 100,
                pointerEvents: 'none' as const
              }}>
                Sign Out
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;