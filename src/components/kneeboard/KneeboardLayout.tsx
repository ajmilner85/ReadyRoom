import React, { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Menu, X, ChevronDown, ChevronLeft, ChevronRight, Home, LogOut } from 'lucide-react';
import FlightAssignmentsKneeboard from './FlightAssignmentsKneeboard';
import CommsPlanKneeboard from './CommsPlanKneeboard';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../utils/supabaseClient';
import type { Cycle } from '../../types/EventTypes';
import type { CommsPlanEntry } from '../../types/CommsTypes';
import { generateInitialCommsData } from '../../types/CommsTypes';

// Extend Window interface for OpenKneeboard API
interface OpenKneeboardPage {
  guid: string;
  pixelSize: { width: number; height: number };
  extraData?: any;
}

interface OpenKneeboardAPI {
  SetPreferredPixelSize: (width: number, height: number) => void;
  EnableExperimentalFeatures: (features: Array<{ name: string; version: number }>) => Promise<void>;
  GetPages: () => Promise<{ havePages: boolean; pages: OpenKneeboardPage[] }>;
  SetPages: (pages: OpenKneeboardPage[]) => Promise<void>;
  addEventListener: (event: string, callback: (ev: any) => void) => void;
  removeEventListener: (event: string, callback: (ev: any) => void) => void;
}

declare global {
  interface Window {
    OpenKneeboard?: OpenKneeboardAPI;
  }
}

type ThemeMode = 'light' | 'dark';

const KNEEBOARD_WIDTH = 1358;
const KNEEBOARD_HEIGHT = 2048;

const KneeboardLayout: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // Load theme preference from localStorage (per-user)
    const userId = userProfile?.id;
    if (userId) {
      const saved = localStorage.getItem(`kneeboard-theme-${userId}`);
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark'; // Default to dark for cockpit visibility
  });
  const [showMenu, setShowMenu] = useState(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [showCycleDropdown, setShowCycleDropdown] = useState(false);
  const [showMissionDropdown, setShowMissionDropdown] = useState(false);
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(generateInitialCommsData());

  // Page navigation state
  const [currentPageGuid, setCurrentPageGuid] = useState<string | null>(null);
  const [pageGuids, setPageGuids] = useState<string[]>([]);
  const [isOpenKneeboard, setIsOpenKneeboard] = useState(false);

  // Define page GUIDs (must be consistent across sessions)
  const PAGE_1_GUID = 'f8a8b3c1-4d2e-4f5a-9b1c-2d3e4f5a6b7c'; // Flight Assignments
  const PAGE_2_GUID = 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d'; // Test Page

  // Initialize OpenKneeboard page-based content
  useEffect(() => {
    const initializeOpenKneeboard = async () => {
      if (!window.OpenKneeboard) {
        console.log('[KNEEBOARD] Not running in OpenKneeboard context');
        // Default to page 1 when not in OpenKneeboard
        setPageGuids([PAGE_1_GUID, PAGE_2_GUID]);
        setCurrentPageGuid(PAGE_1_GUID);
        return;
      }

      try {
        setIsOpenKneeboard(true);
        console.log('[KNEEBOARD] Initializing OpenKneeboard page-based content');

        // Enable experimental feature
        await window.OpenKneeboard.EnableExperimentalFeatures([
          { name: 'PageBasedContent', version: 2024073001 }
        ]);

        // Set up event listeners BEFORE GetPages/SetPages
        const handlePageChanged = (ev: CustomEvent) => {
          const guid = ev.detail?.page?.guid;
          if (guid) {
            console.log('[KNEEBOARD] Page changed to:', guid);
            setCurrentPageGuid(guid);
          }
        };

        window.OpenKneeboard.addEventListener('pageChanged', handlePageChanged);

        // Check if pages already exist
        const existingPages = await window.OpenKneeboard.GetPages();

        if (existingPages.havePages && existingPages.pages.length > 0) {
          console.log('[KNEEBOARD] Using existing pages:', existingPages.pages);
          const guids = existingPages.pages.map(p => p.guid);
          setPageGuids(guids);
          setCurrentPageGuid(guids[0]);
        } else {
          // Define pages for the first time
          const pages: OpenKneeboardPage[] = [
            {
              guid: PAGE_1_GUID,
              pixelSize: { width: KNEEBOARD_WIDTH, height: KNEEBOARD_HEIGHT },
              extraData: { title: 'Flight Assignments' }
            },
            {
              guid: PAGE_2_GUID,
              pixelSize: { width: KNEEBOARD_WIDTH, height: KNEEBOARD_HEIGHT },
              extraData: { title: 'Comms Plan' }
            }
          ];

          await window.OpenKneeboard.SetPages(pages);
          console.log('[KNEEBOARD] Pages initialized:', pages);
          setPageGuids([PAGE_1_GUID, PAGE_2_GUID]);
          setCurrentPageGuid(PAGE_1_GUID);
        }

        // Cleanup event listener on unmount
        return () => {
          if (window.OpenKneeboard) {
            window.OpenKneeboard.removeEventListener('pageChanged', handlePageChanged);
          }
        };
      } catch (error) {
        console.error('[KNEEBOARD] Error initializing OpenKneeboard:', error);
        // Fallback to page 1
        setPageGuids([PAGE_1_GUID, PAGE_2_GUID]);
        setCurrentPageGuid(PAGE_1_GUID);
      }
    };

    initializeOpenKneeboard();
  }, []);

  // Set OpenKneeboard preferred pixel size and viewport for 1:1 rendering
  useEffect(() => {
    // Set viewport meta tag for 1:1 pixel rendering (no scaling)
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    const originalContent = viewportMeta?.getAttribute('content');

    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    // Force body to exact dimensions with no margins/padding
    const originalBodyStyle = {
      margin: document.body.style.margin,
      padding: document.body.style.padding,
      overflow: document.body.style.overflow,
      width: document.body.style.width,
      height: document.body.style.height
    };

    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = `${KNEEBOARD_WIDTH}px`;
    document.body.style.height = `${KNEEBOARD_HEIGHT}px`;

    // Tell OpenKneeboard our preferred size
    if (window.OpenKneeboard?.SetPreferredPixelSize) {
      window.OpenKneeboard.SetPreferredPixelSize(KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT);
      console.log('[KNEEBOARD] Set preferred pixel size:', KNEEBOARD_WIDTH, 'x', KNEEBOARD_HEIGHT);
    }

    // Cleanup: restore original styles on unmount
    return () => {
      if (viewportMeta && originalContent) {
        viewportMeta.setAttribute('content', originalContent);
      }
      document.body.style.margin = originalBodyStyle.margin;
      document.body.style.padding = originalBodyStyle.padding;
      document.body.style.overflow = originalBodyStyle.overflow;
      document.body.style.width = originalBodyStyle.width;
      document.body.style.height = originalBodyStyle.height;
    };
  }, []);

  // Save theme preference when it changes
  useEffect(() => {
    if (userProfile?.id) {
      localStorage.setItem(`kneeboard-theme-${userProfile.id}`, theme);
    }
  }, [theme, userProfile?.id]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Get current page index (1-based)
  const getCurrentPageIndex = (): number => {
    if (!currentPageGuid) return 1;
    const index = pageGuids.indexOf(currentPageGuid);
    return index >= 0 ? index + 1 : 1;
  };

  // Navigate to a specific page by index (1-based)
  const navigateToPage = (pageIndex: number) => {
    if (pageIndex < 1 || pageIndex > pageGuids.length) return;
    const guid = pageGuids[pageIndex - 1];
    setCurrentPageGuid(guid);
  };

  // Fetch cycles
  const fetchCycles = useCallback(async () => {
    try {
      const { data: cyclesData, error: cyclesError } = await supabase
        .from('cycles')
        .select('*')
        .order('start_date', { ascending: false });

      if (cyclesError) {
        console.error('[KNEEBOARD] Error fetching cycles:', cyclesError);
        return;
      }

      const transformedCycles = (cyclesData || []).map(cycle => ({
        id: cycle.id,
        name: cycle.name,
        description: cycle.description || '',
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        type: cycle.type,
        status: cycle.status,
        creator: { boardNumber: '', callsign: '', billet: '' }, // Creator details not needed for kneeboard
        restrictedTo: cycle.restricted_to,
        participants: cycle.participants,
        discordGuildId: cycle.discord_guild_id,
        syllabusId: cycle.syllabus_id
      })) as Cycle[];

      setCycles(transformedCycles);

      // Auto-select current cycle if none selected
      if (!selectedCycleId && transformedCycles.length > 0) {
        const now = new Date();
        const currentCycle = transformedCycles.find(c => {
          const start = new Date(c.startDate);
          const end = new Date(c.endDate);
          return now >= start && now <= end;
        });

        if (currentCycle) {
          setSelectedCycleId(currentCycle.id);
        } else {
          // Default to most recent cycle
          setSelectedCycleId(transformedCycles[0].id);
        }
      }
    } catch (err) {
      console.error('[KNEEBOARD] Error in fetchCycles:', err);
    } finally {
      setLoadingCycles(false);
    }
  }, [selectedCycleId]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  // Fetch comms data when mission changes
  const fetchCommsData = useCallback(async () => {
    if (!selectedMissionId) {
      setCommsData(generateInitialCommsData());
      return;
    }

    try {
      const { data: missionData, error } = await supabase
        .from('missions')
        .select('mission_settings')
        .eq('id', selectedMissionId)
        .single();

      if (error) {
        console.error('[KNEEBOARD] Error fetching mission settings:', error);
        setCommsData(generateInitialCommsData());
        return;
      }

      // Extract comms_plan from mission_settings
      const settings = missionData?.mission_settings as any;
      const comms_plan = settings?.comms_plan;
      if (comms_plan && Array.isArray(comms_plan)) {
        setCommsData(comms_plan);
      } else {
        setCommsData(generateInitialCommsData());
      }
    } catch (err) {
      console.error('[KNEEBOARD] Error in fetchCommsData:', err);
      setCommsData(generateInitialCommsData());
    }
  }, [selectedMissionId]);

  // Initial fetch
  useEffect(() => {
    fetchCommsData();
  }, [fetchCommsData]);

  // Poll for comms data updates (every 5 seconds to match flight assignments)
  useEffect(() => {
    const interval = setInterval(fetchCommsData, 5000);
    return () => clearInterval(interval);
  }, [fetchCommsData]);

  // Theme styles
  const themeStyles = {
    dark: {
      background: '#1a1a2e',
      backgroundSecondary: '#16213e',
      text: '#e5e5e5',
      textSecondary: '#a0a0a0',
      border: '#2d2d44',
      accent: '#7C3AED',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444'
    },
    light: {
      background: '#f8f9fa',
      backgroundSecondary: '#ffffff',
      text: '#1a1a2e',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#7C3AED',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444'
    }
  };

  const colors = themeStyles[theme];

  // Loading state
  if (authLoading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.text,
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: `3px solid ${colors.border}`,
            borderTopColor: colors.accent,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ fontSize: '18px', margin: 0 }}>Loading...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Main kneeboard view
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: isOpenKneeboard ? `${KNEEBOARD_WIDTH}px` : '100vw',
      height: isOpenKneeboard ? `${KNEEBOARD_HEIGHT}px` : '100vh',
      backgroundColor: colors.background,
      color: colors.text,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      // Force crisp text rendering at 1:1 pixels
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale'
    } as React.CSSProperties}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        backgroundColor: colors.backgroundSecondary,
        borderBottom: `1px solid ${colors.border}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            padding: '8px',
            backgroundColor: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text
          }}
          title="Menu"
        >
          <Menu size={20} />
        </button>

        {/* Page Navigation - only show if not in OpenKneeboard (which has its own navigation) */}
        {!isOpenKneeboard && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button
              onClick={() => navigateToPage(getCurrentPageIndex() - 1)}
              disabled={getCurrentPageIndex() === 1}
              style={{
                padding: '8px',
                backgroundColor: getCurrentPageIndex() === 1 ? colors.background : 'transparent',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: getCurrentPageIndex() === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getCurrentPageIndex() === 1 ? colors.textSecondary : colors.text,
                opacity: getCurrentPageIndex() === 1 ? 0.5 : 1
              }}
              title="Previous page"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              onClick={() => navigateToPage(1)}
              style={{
                padding: '8px',
                backgroundColor: 'transparent',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.text
              }}
              title="Home (Page 1)"
            >
              <Home size={20} />
            </button>

            <span style={{
              padding: '8px 12px',
              fontSize: '14px',
              fontWeight: 500,
              color: colors.text
            }}>
              {getCurrentPageIndex()} / {pageGuids.length}
            </span>

            <button
              onClick={() => navigateToPage(getCurrentPageIndex() + 1)}
              disabled={getCurrentPageIndex() === pageGuids.length}
              style={{
                padding: '8px',
                backgroundColor: getCurrentPageIndex() === pageGuids.length ? colors.background : 'transparent',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: getCurrentPageIndex() === pageGuids.length ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getCurrentPageIndex() === pageGuids.length ? colors.textSecondary : colors.text,
                opacity: getCurrentPageIndex() === pageGuids.length ? 0.5 : 1
              }}
              title="Next page"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        <button
          onClick={toggleTheme}
          style={{
            padding: '8px',
            backgroundColor: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text
          }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Menu Sidebar */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 99
            }}
          />

          {/* Menu Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '400px',
            height: '100%',
            backgroundColor: colors.backgroundSecondary,
            borderRight: `1px solid ${colors.border}`,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '4px 0 12px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Menu Header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                margin: 0,
                color: colors.text
              }}>
                Settings
              </h2>
              <button
                onClick={() => setShowMenu(false)}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: colors.textSecondary
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Menu Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px'
            }}>
              {/* Cycle Selector */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: colors.textSecondary,
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Cycle
                </label>
                {loadingCycles ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: colors.textSecondary,
                    fontSize: '14px'
                  }}>
                    Loading cycles...
                  </div>
                ) : cycles.length === 0 ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: colors.textSecondary,
                    fontSize: '14px',
                    backgroundColor: colors.background,
                    borderRadius: '6px'
                  }}>
                    No cycles available
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowCycleDropdown(!showCycleDropdown)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: colors.background,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        color: colors.text,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cycles.find(c => c.id === selectedCycleId)?.name || 'Select cycle'}
                      </span>
                      <ChevronDown size={16} style={{
                        transform: showCycleDropdown ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                        marginLeft: '8px'
                      }} />
                    </button>

                    {showCycleDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: colors.background,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}>
                        {cycles.map(cycle => (
                          <button
                            key={cycle.id}
                            onClick={() => {
                              setSelectedCycleId(cycle.id);
                              setShowCycleDropdown(false);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              backgroundColor: cycle.id === selectedCycleId
                                ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)')
                                : 'transparent',
                              border: 'none',
                              borderBottom: `1px solid ${colors.border}`,
                              color: colors.text,
                              fontSize: '14px',
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            {cycle.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mission Selector */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: colors.textSecondary,
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Mission
                </label>
                {missions.length === 0 ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: colors.textSecondary,
                    fontSize: '14px',
                    backgroundColor: colors.background,
                    borderRadius: '6px'
                  }}>
                    No missions available
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowMissionDropdown(!showMissionDropdown)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: colors.background,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        color: colors.text,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {missions.find(m => m.id === selectedMissionId)?.event_name || 'Select mission'}
                      </span>
                      <ChevronDown size={16} style={{
                        transform: showMissionDropdown ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                        marginLeft: '8px'
                      }} />
                    </button>

                    {showMissionDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: colors.background,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}>
                        {missions.map(mission => (
                          <button
                            key={mission.id}
                            onClick={() => {
                              setSelectedMissionId(mission.id);
                              setShowMissionDropdown(false);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              backgroundColor: mission.id === selectedMissionId
                                ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)')
                                : 'transparent',
                              border: 'none',
                              borderBottom: `1px solid ${colors.border}`,
                              color: colors.text,
                              fontSize: '14px',
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            {mission.event_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${colors.border}` }}>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = '/';
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    color: colors.text,
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Content - scrollable area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px'
      }}>
        {currentPageGuid === PAGE_1_GUID && (
          <FlightAssignmentsKneeboard
            pilotId={userProfile?.pilotId || null}
            cycleId={selectedCycleId}
            theme={theme}
            colors={colors}
            selectedMissionId={selectedMissionId}
            onMissionChange={setSelectedMissionId}
            missions={missions}
            onMissionsLoad={setMissions}
          />
        )}
        {currentPageGuid === PAGE_2_GUID && (
          <CommsPlanKneeboard
            theme={theme}
            colors={colors}
            commsData={commsData}
          />
        )}
      </div>
    </div>
  );
};

export default KneeboardLayout;
