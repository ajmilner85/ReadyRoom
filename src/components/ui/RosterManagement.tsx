import React, { useState, useEffect, useRef } from 'react';
import { Card } from './card';
import QualificationBadge from './QualificationBadge';
import { Pilot, convertSupabasePilotToLegacy } from '../../types/PilotTypes';
import { 
  getAllPilots, 
  getPilotByDiscordOriginalId, 
  updatePilotStatus, 
  getPilotAssignedRoles,
  updatePilotRoleAssignments,
  canAssignRoleToPilot
} from '../../utils/pilotService';
import { supabase } from '../../utils/supabaseClient';
import { subscribeToTable } from '../../utils/supabaseClient';
import { getAllStatuses, Status } from '../../utils/statusService';
import { getAllRoles, Role } from '../../utils/roleService';
import { CheckCircle2, AlertTriangle, Plus, X, Lock, Unlock } from 'lucide-react';

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
  
  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [pilotRoles, setPilotRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [updatingRoles, setUpdatingRoles] = useState(false);
  const [rolesUpdateSuccess, setRolesUpdateSuccess] = useState<boolean | null>(null);
  const [showAddRoleDropdown, setShowAddRoleDropdown] = useState(false);
  const [roleCompatibilityErrors, setRoleCompatibilityErrors] = useState<Record<string, string>>({});
  
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
          
          // Refresh pilot roles to check compatibility
          fetchPilotRoles(selectedPilot.id);
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
  
  // Function to fetch pilot's assigned roles
  const fetchPilotRoles = async (pilotId: string) => {
    setLoadingRoles(true);
    
    try {
      // First, check if the pilotId is a Discord ID rather than a UUID
      // Discord IDs are typically long numeric strings
      const isDiscordId = /^\d+$/.test(pilotId) && pilotId.length > 10;
      
      let actualPilotId = pilotId;
      if (isDiscordId) {
        // If it's a Discord ID, first get the corresponding UUID from the database
        const { data: pilotData, error: pilotError } = await getPilotByDiscordOriginalId(pilotId);
        
        if (pilotError) {
          throw new Error(pilotError.message);
        }
        
        if (!pilotData) {
          throw new Error('Could not find pilot with the provided Discord ID');
        }
        
        actualPilotId = pilotData.id; // Use the actual UUID from the database
      }
      
      // Now use the actual UUID for fetching roles
      const { data, error } = await getPilotAssignedRoles(actualPilotId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Check role compatibility for all roles
      const compatibilityErrors: Record<string, string> = {};
      for (const role of data) {
        const { canAssign, reason } = await canAssignRoleToPilot(actualPilotId, role.id);
        if (!canAssign && reason) {
          compatibilityErrors[role.id] = reason;
        }
      }
      
      setPilotRoles(data || []);
      setRoleCompatibilityErrors(compatibilityErrors);
    } catch (err: any) {
      console.error('Error fetching pilot roles:', err);
    } finally {
      setLoadingRoles(false);
    }
  };
  
  // Function to assign a role to the selected pilot
  const handleAssignRole = async (roleId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingRoles(true);
    setRolesUpdateSuccess(null);
    
    try {
      // Get the actual UUID if selected pilot has a Discord ID
      const isDiscordId = /^\d+$/.test(selectedPilot.id) && selectedPilot.id.length > 10;
      
      let actualPilotId = selectedPilot.id;
      if (isDiscordId) {
        // If it's a Discord ID, first get the corresponding UUID
        const { data: pilotData, error: pilotError } = await getPilotByDiscordOriginalId(selectedPilot.id);
        
        if (pilotError) {
          throw new Error(pilotError.message);
        }
        
        if (!pilotData) {
          throw new Error('Could not find pilot with the provided Discord ID');
        }
        
        actualPilotId = pilotData.id; // Use the actual UUID
      }
      
      // Get the current status of the pilot directly
      const { data: pilotWithStatus, error: statusError } = await supabase
        .from('pilots')
        .select('status_id')
        .eq('id', actualPilotId)
        .single();
        
      if (statusError) {
        throw new Error(`Error fetching pilot status: ${statusError.message}`);
      }
      
      const pilotStatusId = pilotWithStatus?.status_id;
      if (!pilotStatusId) {
        throw new Error('Pilot has no status assigned');
      }
      
      // Get role details directly
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('id, name, "isExclusive"::boolean, compatible_statuses')
        .eq('id', roleId)
        .single();
        
      if (roleError) {
        throw new Error(`Error fetching role data: ${roleError.message}`);
      }
      
      if (!role) {
        throw new Error('Role not found');
      }
      
      // Manual compatibility check
      const isCompatible = !role.compatible_statuses || 
                          role.compatible_statuses.length === 0 || 
                          role.compatible_statuses.includes(pilotStatusId);
                          
      if (!isCompatible) {
        throw new Error("Pilot's status is not compatible with this role");
      }
      
      // Add the role to the current list of roles
      const newRoleIds = [...pilotRoles.map(r => r.id), roleId];
      
      // Update the pilot's roles using the actual UUID
      const { success, error } = await updatePilotRoleAssignments(actualPilotId, newRoleIds);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (success) {
        // Refresh pilot roles
        fetchPilotRoles(selectedPilot.id);
        setRolesUpdateSuccess(true);
      }
    } catch (err: any) {
      console.error('Error assigning role:', err);
      setRolesUpdateSuccess(false);
      setError(err.message);
    } finally {
      setUpdatingRoles(false);
      setShowAddRoleDropdown(false);
      
      // Clear success/error message after 3 seconds
      setTimeout(() => {
        setRolesUpdateSuccess(null);
        setError(null);
      }, 3000);
    }
  };
  
  // Function to remove a role from the selected pilot
  const handleRemoveRole = async (roleId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingRoles(true);
    setRolesUpdateSuccess(null);
    
    try {
      // Get the actual UUID if selected pilot has a Discord ID
      const isDiscordId = /^\d+$/.test(selectedPilot.id) && selectedPilot.id.length > 10;
      
      let actualPilotId = selectedPilot.id;
      if (isDiscordId) {
        // If it's a Discord ID, get the corresponding UUID
        const { data: pilotData, error: pilotError } = await getPilotByDiscordOriginalId(selectedPilot.id);
        
        if (pilotError) {
          throw new Error(pilotError.message);
        }
        
        if (!pilotData) {
          throw new Error('Could not find pilot with the provided Discord ID');
        }
        
        actualPilotId = pilotData.id; // Use the actual UUID
      }
      
      // Remove the role from the current list of roles
      const newRoleIds = pilotRoles.filter(r => r.id !== roleId).map(r => r.id);
      
      // Update the pilot's roles using the actual UUID
      const { success, error } = await updatePilotRoleAssignments(actualPilotId, newRoleIds);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (success) {
        // Refresh pilot roles
        fetchPilotRoles(selectedPilot.id);
        setRolesUpdateSuccess(true);
      }
    } catch (err: any) {
      console.error('Error removing role:', err);
      setRolesUpdateSuccess(false);
      setError(err.message);
    } finally {
      setUpdatingRoles(false);
      
      // Clear success/error message after 3 seconds
      setTimeout(() => {
        setRolesUpdateSuccess(null);
      }, 3000);
    }
  };

  useEffect(() => {
    // Fetch all statuses and roles
    const fetchStatusesAndRoles = async () => {
      // Fetch statuses
      const { data: statusData, error: statusError } = await getAllStatuses();
      if (statusError) {
        console.error('Error fetching statuses:', statusError);
        return;
      }
      
      if (statusData) {
        setStatuses(statusData);
        // Create a map for quick lookup
        const map: Record<string, Status> = {};
        statusData.forEach(status => {
          map[status.id] = status;
        });
        setStatusMap(map);
      }
      
      // Fetch roles
      const { data: roleData, error: roleError } = await getAllRoles();
      if (roleError) {
        console.error('Error fetching roles:', roleError);
        return;
      }
      
      if (roleData) {
        setRoles(roleData);
      }
    };

    fetchStatusesAndRoles();
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

  // When a pilot is selected, fetch their roles
  useEffect(() => {
    if (selectedPilot) {
      fetchPilotRoles(selectedPilot.id);
    } else {
      setPilotRoles([]);
    }
  }, [selectedPilot]);

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
                            {/* Display role instead of billet */}
                            {pilot.role || pilot.billet}
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
                    
                    {/* Squadron Roles Card */}
                    <Card className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="text-lg font-semibold">Squadron Roles</h2>
                        <div className="relative">
                          {showAddRoleDropdown ? (
                            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded shadow-lg z-10 w-48 py-1">
                              {roles
                                .filter(role => !pilotRoles.some(pr => pr.id === role.id))
                                .sort((a, b) => a.order - b.order)
                                .map(role => (
                                  <div 
                                    key={role.id}
                                    className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                                    onClick={() => handleAssignRole(role.id)}
                                  >
                                    <span>{role.name}</span>
                                    {role.isExclusive && <Lock size={14} className="text-red-600" />}
                                  </div>
                                ))}
                              <div 
                                className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-500 flex items-center"
                                onClick={() => setShowAddRoleDropdown(false)}
                              >
                                <X size={14} className="mr-1" />
                                Cancel
                              </div>
                            </div>
                          ) : (
                            <button
                              className="flex items-center text-sm px-2 py-1 border border-slate-300 rounded hover:bg-slate-50"
                              onClick={() => setShowAddRoleDropdown(true)}
                              disabled={updatingRoles}
                            >
                              <Plus size={14} className="mr-1" />
                              Add Role
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {loadingRoles ? (
                        <div className="text-center py-4 text-slate-500">Loading roles...</div>
                      ) : pilotRoles.length > 0 ? (
                        <div className="space-y-2">
                          {pilotRoles
                            .sort((a, b) => a.order - b.order)
                            .map(role => (
                              <div key={role.id} className="flex justify-between items-center p-2 border border-gray-100 rounded-md bg-slate-50 relative">
                                <div className="flex items-center">
                                  <span className="font-medium mr-2">{role.name}</span>
                                  {role.isExclusive && <Lock size={14} className="text-red-600" title="Exclusive role" />}
                                </div>
                                
                                {roleCompatibilityErrors[role.id] && (
                                  <div className="absolute left-0 -bottom-6 text-xs text-red-600">
                                    {roleCompatibilityErrors[role.id]}
                                  </div>
                                )}
                                
                                <button
                                  className="text-red-600 hover:bg-red-50 p-1 rounded"
                                  onClick={() => handleRemoveRole(role.id)}
                                  disabled={updatingRoles}
                                  title="Remove role"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}

                            {/* Role update indicators */}
                            {rolesUpdateSuccess === true && (
                              <div className="mt-2 flex items-center text-sm text-green-600">
                                <CheckCircle2 size={16} className="mr-1" /> 
                                Roles updated successfully!
                              </div>
                            )}
                            {rolesUpdateSuccess === false && (
                              <div className="mt-2 flex items-center text-sm text-red-600">
                                <AlertTriangle size={16} className="mr-1" />
                                Failed to update roles
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="text-slate-500">No roles assigned</div>
                      )}
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