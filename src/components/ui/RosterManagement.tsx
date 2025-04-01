import React, { useState, useEffect, useRef } from 'react';
import { Card } from './card';
import QualificationBadge from './QualificationBadge';
import { Pilot, convertSupabasePilotToLegacy } from '../../types/PilotTypes';
import { getAllPilots, getPilotByDiscordOriginalId, updatePilotStatus } from '../../utils/pilotService';
import { subscribeToTable } from '../../utils/supabaseClient';
import { getAllStatuses, Status } from '../../utils/statusService';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const RosterManagement: React.FC = () => {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [hoveredPilot, setHoveredPilot] = useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<boolean | null>(null); // null means show all
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<boolean | null>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const rosterContentRef = useRef<HTMLDivElement>(null);

  // Function to handle pilot status change
  const handleStatusChange = async (statusId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingStatus(true);
    setStatusUpdateSuccess(null);
    
    try {
      const { data, error } = await updatePilotStatus(selectedPilot.id, statusId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data) {
        // Update pilot in the local state
        const updatedPilots = pilots.map(p => {
          if (p.id === selectedPilot.id) {
            const updatedPilot = { ...p };
            updatedPilot.status_id = statusId;
            updatedPilot.status = statusMap[statusId].name as any;
            return updatedPilot;
          }
          return p;
        });
        
        setPilots(updatedPilots);
        
        // Update selected pilot
        if (selectedPilot) {
          setSelectedPilot({
            ...selectedPilot,
            status_id: statusId,
            status: statusMap[statusId].name as any
          });
        }
        
        setStatusUpdateSuccess(true);
      }
    } catch (err: any) {
      console.error('Error updating pilot status:', err);
      setStatusUpdateSuccess(false);
    } finally {
      setUpdatingStatus(false);
      
      // Clear success/error message after 3 seconds
      setTimeout(() => {
        setStatusUpdateSuccess(null);
      }, 3000);
    }
  };

  useEffect(() => {
    // Fetch all statuses
    const fetchStatuses = async () => {
      const { data, error } = await getAllStatuses();
      if (error) {
        console.error('Error fetching statuses:', error);
        return;
      }
      if (data) {
        setStatuses(data);
        // Create a map for quick lookup
        const map: Record<string, Status> = {};
        data.forEach(status => {
          map[status.id] = status;
        });
        setStatusMap(map);
      }
    };

    fetchStatuses();
  }, []);

  useEffect(() => {
    // Fetch pilots from Supabase
    const fetchPilots = async () => {
      setLoading(true);
      try {
        const { data, error } = await getAllPilots();
        
        if (error) {
          throw new Error(error.message);
        }

        if (data && data.length > 0) {
          // Convert Supabase format to the format our UI expects
          const convertedPilots = data.map(pilot => {
            // Use the discord_original_id as the main ID if available (for backwards compatibility)
            const legacyPilot = convertSupabasePilotToLegacy(pilot);
            if (pilot.discord_original_id) {
              legacyPilot.id = pilot.discord_original_id;
            }

            // Set status based on status_id if available
            if (pilot.status_id && statusMap[pilot.status_id]) {
              legacyPilot.status = statusMap[pilot.status_id].name as any;
              legacyPilot.status_id = pilot.status_id;
            } else {
              // Fallback to role-based status for backward compatibility
              const role = pilot.roles?.squadron?.toLowerCase() || '';
              if (role.includes('co') || role.includes('xo')) {
                legacyPilot.status = 'Command';
              } else if (role.includes('oic')) {
                legacyPilot.status = 'Staff';
              } else if (role.includes('ret')) {
                legacyPilot.status = 'Retired';
              }
            }
            return legacyPilot;
          });
          setPilots(convertedPilots);
        } else {
          // No pilots in database
          setPilots([]);
          setError('No pilots found in the database');
        }
      } catch (err: any) {
        console.error('Error fetching pilots:', err);
        setError(err.message);
        setPilots([]);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch pilots when we have the status map
    if (Object.keys(statusMap).length > 0) {
      fetchPilots();
    }

    // Subscribe to real-time updates
    const subscription = subscribeToTable('pilots', (payload) => {
      // Update the pilots list when changes occur
      if (Object.keys(statusMap).length > 0) {
        fetchPilots();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [statusMap]); // Depend on statusMap to re-run when statuses are loaded

  // Filter pilots by active status if a filter is selected
  const filteredPilots = activeStatusFilter === null 
    ? pilots 
    : pilots.filter(pilot => {
        const status = pilot.status_id ? statusMap[pilot.status_id] : null;
        return status ? status.isActive === activeStatusFilter : false;
      });

  // Group pilots by status
  const groupedPilots = filteredPilots.reduce((acc, pilot) => {
    const status = pilot.status;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  // Get status display order based on the order in the statuses table
  const statusOrder = statuses
    .sort((a, b) => a.order - b.order)
    .map(status => status.name);

  const renderQualificationBadges = (qualifications: Pilot['qualifications']) => {
    const qualTypes = qualifications.map(q => q.type);
    const uniqueQuals = Array.from(new Set(qualTypes));
    
    return uniqueQuals.map((type, index) => {
      const count = qualTypes.filter(t => t === type).length;
      return (
        <QualificationBadge 
          key={`${type}-${index}`} 
          type={type} 
          count={count > 1 ? count : undefined} 
        />
      );
    });
  };

  useEffect(() => {
    // Synchronize heights of both columns
    if (rosterListRef.current && pilotDetailsRef.current && rosterContentRef.current) {
      // Ensure both columns have the same height
      const rosterHeight = rosterListRef.current.clientHeight;
      pilotDetailsRef.current.style.height = `${rosterHeight}px`;
    }
  }, [selectedPilot]);

  const baseWidth = 663; // Width of roster list tile

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        boxSizing: 'border-box'
      }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <div>Loading roster data...</div>
        </div>
      ) : error ? (
        <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
          Error loading roster data: {error}
        </div>
      ) : (
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100% - 40px)', // Subtract top and bottom padding
            position: 'relative',
            zIndex: 1,
            maxWidth: `${baseWidth * 3 + 20}px`,
            margin: '0 auto',
            width: '100%'
          }}
        >
          {/* Status filter tabs */}
          <div className="flex mb-4">
            <div 
              className={`cursor-pointer px-4 py-2 mr-2 rounded-t-md ${activeStatusFilter === null ? 'bg-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setActiveStatusFilter(null)}
            >
              All
            </div>
            <div 
              className={`cursor-pointer px-4 py-2 mr-2 rounded-t-md ${activeStatusFilter === true ? 'bg-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setActiveStatusFilter(true)}
            >
              Active
            </div>
            <div 
              className={`cursor-pointer px-4 py-2 rounded-t-md ${activeStatusFilter === false ? 'bg-white font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setActiveStatusFilter(false)}
            >
              Inactive
            </div>
          </div>

          <div 
            style={{
              display: 'flex',
              gap: '20px',
              flex: 1,
            }}
          >
            {/* Left column - Squadron Roster List */}
            <div
              ref={rosterListRef}
              style={{
                width: `${baseWidth}px`,
                backgroundColor: '#FFFFFF',
                boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden' // Contain the scrollbar
              }}
            >
              <div 
                ref={rosterContentRef}
                style={{
                  flex: 1,
                  overflowY: 'auto', // Enable vertical scrolling
                  padding: '10px 10px 0 10px', // Reduced bottom padding
                  paddingRight: '20px', // Make room for scrollbar
                }}
              >
                {statusOrder.map(status => {
                  const statusPilots = groupedPilots[status];
                  if (!statusPilots?.length) return null;

                  // Find status object to determine if active/inactive
                  const statusObj = statuses.find(s => s.name === status);
                  const isActive = statusObj ? statusObj.isActive : true;

                  return (
                    <div key={status}>
                      {/* Status group divider */}
                      <div 
                        style={{
                          position: 'relative',
                          textAlign: 'center',
                          margin: '20px 0'
                        }}
                      >
                        <div 
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '50%',
                            height: '1px',
                            backgroundColor: '#E2E8F0'
                          }}
                        />
                        <span 
                          style={{
                            position: 'relative',
                            backgroundColor: '#FFFFFF',
                            padding: '0 16px',
                            color: isActive ? '#646F7E' : '#A0AEC0',
                            fontSize: '12px',
                            fontFamily: 'Inter',
                            fontWeight: 300,
                            textTransform: 'uppercase',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          {status}
                          <span className={`inline-block w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                        </span>
                      </div>

                      {/* Pilot entries */}
                      {statusPilots.map(pilot => (
                        <div
                          key={pilot.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            height: '24px',
                            marginBottom: '10px',
                            cursor: 'pointer',
                            backgroundColor: 
                              selectedPilot?.id === pilot.id ? '#EFF6FF' : 
                              hoveredPilot === pilot.id ? 'rgba(100, 116, 139, 0.1)' : 
                              'transparent',
                            transition: 'background-color 0.2s ease',
                            borderRadius: '8px',
                            padding: '0 10px'
                          }}
                          onClick={() => setSelectedPilot(pilot)}
                          onMouseEnter={() => setHoveredPilot(pilot.id)}
                          onMouseLeave={() => setHoveredPilot(null)}
                        >
                          <span style={{
                            width: '62px',
                            textAlign: 'center',
                            fontSize: '16px',
                            fontWeight: 400,
                            color: '#646F7E'
                          }}>
                            {pilot.boardNumber}
                          </span>
                          <span style={{
                            width: '120px',
                            fontSize: '16px',
                            fontWeight: 700
                          }}>
                            {pilot.callsign}
                          </span>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: 300,
                            color: '#646F7E'
                          }}>
                            {pilot.billet}
                          </span>
                          
                          {/* Qualification badges */}
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginLeft: 'auto',
                            height: '24px'
                          }}>
                            {renderQualificationBadges(pilot.qualifications)}
                          </div>
                        </div>
                      ))}

                      {statusPilots.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#64748B', marginTop: '20px' }}>
                          No pilots found.
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredPilots.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748B', marginTop: '20px' }}>
                    No pilots found.
                  </div>
                )}
              </div>
            </div>

            {/* Right column - Pilot Details */}
            <div
              ref={pilotDetailsRef}
              style={{
                width: `${baseWidth * 2}px`,
                backgroundColor: '#FFFFFF',
                boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflowY: 'auto' // Add scrollbar if content overflows
              }}
            >
              {selectedPilot ? (
                <div>
                  <div style={{ marginBottom: '24px' }}>
                    <h1 style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: '#0F172A'
                    }}>
                      {selectedPilot.callsign}
                    </h1>
                    <div style={{
                      fontSize: '18px',
                      color: '#64748B'
                    }}>
                      Board #{selectedPilot.boardNumber}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '24px' }}>
                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-2">Squadron Information</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-slate-500 mb-1">Status</div>
                          <div className="relative">
                            <select
                              value={selectedPilot.status_id || ''}
                              onChange={(e) => handleStatusChange(e.target.value)}
                              disabled={updatingStatus}
                              className="w-full p-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                              style={{
                                appearance: 'none',
                                paddingRight: '2.5rem'
                              }}
                            >
                              {statuses.sort((a, b) => a.order - b.order).map(status => (
                                <option key={status.id} value={status.id}>
                                  {status.name} {status.isActive ? '(Active)' : '(Inactive)'}
                                </option>
                              ))}
                              {!selectedPilot.status_id && <option value="">-- Select status --</option>}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
                              <svg className="h-4 w-4 fill-current text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                              </svg>
                            </div>
                          </div>
                          
                          {/* Status update indicators */}
                          {statusUpdateSuccess === true && (
                            <div className="mt-2 flex items-center text-sm text-green-600">
                              <CheckCircle2 size={16} className="mr-1" /> 
                              Status updated successfully!
                            </div>
                          )}
                          {statusUpdateSuccess === false && (
                            <div className="mt-2 flex items-center text-sm text-red-600">
                              <AlertTriangle size={16} className="mr-1" />
                              Failed to update status
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-sm text-slate-500">Billet</div>
                          <div className="font-medium">{selectedPilot.billet}</div>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-2">Qualifications</h2>
                      {selectedPilot.qualifications.length > 0 ? (
                        <div className="space-y-2">
                          {selectedPilot.qualifications.map(qual => (
                            <div key={qual.id} className="flex justify-between items-center">
                              <span className="font-medium">{qual.type}</span>
                              <span className="text-sm text-slate-500">
                                {new Date(qual.dateAchieved).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-slate-500">No qualifications</div>
                      )}
                    </Card>

                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-2">Contact Information</h2>
                      <div>
                        <div className="text-sm text-slate-500">Discord</div>
                        <div className="font-medium">{selectedPilot.discordUsername}</div>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B'
                }}>
                  Select a pilot to view their details
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RosterManagement;