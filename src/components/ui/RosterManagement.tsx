import React, { useState, useEffect, useRef } from 'react';
import { Card } from './card';
import QualificationBadge from './QualificationBadge';
import { Pilot, convertSupabasePilotToLegacy } from '../../types/PilotTypes';
import { 
  getAllPilots, 
  getPilotByDiscordOriginalId, 
  updatePilotStatus, 
  getPilotAssignedRoles,
  canAssignRoleToPilot
} from '../../utils/pilotService';
import { supabase } from '../../utils/supabaseClient';
import { subscribeToTable } from '../../utils/supabaseClient';
import { getAllStatuses, Status } from '../../utils/statusService';
import { getAllRoles, Role } from '../../utils/roleService';
import { 
  Qualification, 
  getAllQualifications, 
  assignQualificationToPilot,
  removeQualificationFromPilot,
  getPilotQualifications,
  getBatchPilotQualifications
} from '../../utils/qualificationService';

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
  
  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [pilotRoles, setPilotRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [updatingRoles, setUpdatingRoles] = useState(false);
  
  // New state to track which roles are already assigned and should be disabled
  const [disabledRoles, setDisabledRoles] = useState<Record<string, boolean>>({});
  
  // Qualification management state
  const [availableQualifications, setAvailableQualifications] = useState<Qualification[]>([]);
  const [pilotQualifications, setPilotQualifications] = useState<any[]>([]);
  const [loadingQualifications, setLoadingQualifications] = useState(false);
  const [selectedQualification, setSelectedQualification] = useState<string>('');
  const [qualificationAchievedDate, setQualificationAchievedDate] = useState<string>(
    new Date().toISOString().split('T')[0] // Default to today's date
  );
  const [isAddingQualification, setIsAddingQualification] = useState(false);
  const [updatingQualifications, setUpdatingQualifications] = useState(false);
  
  // Add a state variable to store qualifications for all pilots
  const [allPilotQualifications, setAllPilotQualifications] = useState<Record<string, any[]>>({});

  const rosterListRef = useRef<HTMLDivElement>(null);
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const rosterContentRef = useRef<HTMLDivElement>(null);

  // Function to handle pilot status change
  const handleStatusChange = async (statusId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingStatus(true);
    
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
      }
    } catch (err: any) {
      console.error('Error updating pilot status:', err);
    } finally {
      setUpdatingStatus(false);
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
      
      // Fetch the pilot to get their role_id
      const { data: pilotData, error: pilotError } = await supabase
        .from('pilots')
        .select('role_id')
        .eq('id', actualPilotId)
        .single();
      
      if (pilotError) {
        throw new Error(pilotError.message);
      }
      
      // If the pilot has a role assigned, find the role details
      if (pilotData && pilotData.role_id) {
        const { data: roleData, error: roleError } = await supabase
          .from('roles')
          .select('*')
          .eq('id', pilotData.role_id)
          .single();
          
        if (roleError) {
          throw new Error(roleError.message);
        }
        
        if (roleData) {
          setPilotRoles([roleData]);
        } else {
          setPilotRoles([]);
        }
      } else {
        setPilotRoles([]);
      }
    } catch (err: any) {
      console.error('Error fetching pilot roles:', err);
      setPilotRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  };

  // Check if a role is exclusive and already assigned to another pilot
  const isRoleExclusiveAndAssigned = async (roleId: string, currentPilotId: string): Promise<boolean> => {
    try {
      if (!roleId) return false;
      
      // Get role details
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('isExclusive')
        .eq('id', roleId)
        .single();
      
      if (roleError) {
        console.error('Error fetching role details:', roleError);
        return false;
      }
      
      // If role is not exclusive, it can be assigned
      if (!role || !role.isExclusive) {
        return false;
      }
      
      // For exclusive roles, check if any pilot already has this role
      const { data: existingAssignments, error: assignmentError } = await supabase
        .from('pilots')
        .select('id')
        .eq('role_id', roleId);
      
      if (assignmentError) {
        console.error('Error checking role assignments:', assignmentError);
        return false;
      }
      
      // No assignments or only assigned to current pilot is OK
      if (!existingAssignments || existingAssignments.length === 0) {
        return false;
      }
      
      // If there's only one assignment and it's to the current pilot, that's fine
      if (existingAssignments.length === 1 && 
          existingAssignments[0].id === currentPilotId) {
        return false;
      }
      
      // Otherwise, the role is already assigned to someone else
      return true;
    } catch (err) {
      console.error('Error checking exclusive role:', err);
      return false;
    }
  };

  // Get the actual UUID from a pilot ID that might be a Discord ID
  const getActualPilotId = async (pilotId: string): Promise<string> => {
    // Discord IDs are typically long numeric strings
    const isDiscordId = /^\d+$/.test(pilotId) && pilotId.length > 10;
    
    if (!isDiscordId) {
      return pilotId;
    }
    
    // If it's a Discord ID, get the corresponding UUID
    try {
      const { data, error } = await getPilotByDiscordOriginalId(pilotId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (!data) {
        throw new Error('Could not find pilot with the provided Discord ID');
      }
      
      return data.id;
    } catch (err) {
      console.error('Error getting actual pilot ID:', err);
      return pilotId;
    }
  };

  // Fetch all exclusive roles that are already assigned
  const fetchExclusiveRoleAssignments = async () => {
    try {
      // Get all exclusive roles
      const exclusiveRoles = roles.filter(role => role.isExclusive);
      
      if (!exclusiveRoles.length) return;
      
      // Create a map to track which roles are already assigned
      const newDisabledRoles: Record<string, boolean> = {};
      
      // Get the actual UUID of the selected pilot if available
      let currentPilotId = null;
      if (selectedPilot) {
        currentPilotId = await getActualPilotId(selectedPilot.id);
      }

      // For each exclusive role, check if it's already assigned to any pilot
      for (const role of exclusiveRoles) {
        // Query for all pilots with this role assigned
        const { data, error } = await supabase
          .from('pilots')
          .select('id')
          .eq('role_id', role.id);
          
        if (error) {
          console.error('Error checking role assignments:', error);
          continue;
        }
        
        // If there are assignments and none of them are to the current pilot,
        // disable the role for the current pilot
        if (data && data.length > 0) {
          // Check if the role is assigned to the current pilot
          const isAssignedToCurrentPilot = currentPilotId && 
            data.some(pilot => pilot.id === currentPilotId);
          
          // If the role is not assigned to the current pilot, disable it
          if (!isAssignedToCurrentPilot) {
            newDisabledRoles[role.id] = true;
          }
        }
      }
      
      setDisabledRoles(newDisabledRoles);
    } catch (err) {
      console.error('Error fetching exclusive role assignments:', err);
    }
  };

  // Add useEffect to fetch disabled roles whenever pilots or roles change
  useEffect(() => {
    if (roles.length > 0) {
      fetchExclusiveRoleAssignments();
    }
  }, [roles, selectedPilot]);

  // Handle role change with improved exclusive role checking
  const handleRoleChange = async (roleId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingRoles(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(selectedPilot.id);
      
      // If empty selection, remove the role
      if (!roleId) {
        // Update the pilot's role to null
        const { error } = await supabase
          .from('pilots')
          .update({ role_id: null })
          .eq('id', actualPilotId);
        
        if (error) {
          throw new Error(error.message);
        }
        
        // Update local state
        setPilotRoles([]);
        updatePilotRoleInList(selectedPilot.id, null);
        
        // Refresh exclusive role assignments after removing a role
        fetchExclusiveRoleAssignments();
        return;
      }
      
      // Check if the role is exclusive
      const selectedRole = roles.find(r => r.id === roleId);
      
      if (selectedRole?.isExclusive) {
        // For exclusive roles, check if it's already assigned to someone else
        const { data, error } = await supabase
          .from('pilots')
          .select('id')
          .eq('role_id', roleId);
          
        if (error) {
          throw new Error(`Error checking role assignments: ${error.message}`);
        }
        
        // If assigned to someone other than the current pilot, prevent assignment
        if (data && data.length > 0) {
          const assignedToOthers = data.some(pilot => pilot.id !== actualPilotId);
          
          if (assignedToOthers) {
            alert(`Cannot assign this role. It is exclusive and already assigned to another pilot.`);
            return;
          }
        }
      }
      
      // Get the role name to update the UI immediately
      const roleToAssign = roles.find(r => r.id === roleId);
      
      // Update the pilot's role directly
      const { error } = await supabase
        .from('pilots')
        .update({ role_id: roleId })
        .eq('id', actualPilotId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // If successful, update local state
      if (roleToAssign) {
        setPilotRoles([roleToAssign]);
        updatePilotRoleInList(selectedPilot.id, roleToAssign.name || null);
      }
      
      // Refresh exclusive role assignments after making an assignment
      fetchExclusiveRoleAssignments();
    } catch (err: any) {
      console.error('Error changing role:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingRoles(false);
    }
  };

  // Update the role displayed in the pilot list
  const updatePilotRoleInList = (pilotId: string, roleName: string | null) => {
    setPilots(prevPilots => prevPilots.map(p => {
      if (p.id === pilotId) {
        return { ...p, role: roleName || '' };
      }
      return p;
    }));
    
    // Also update selected pilot if it's the one being changed
    if (selectedPilot && selectedPilot.id === pilotId) {
      setSelectedPilot(prev => prev ? { ...prev, role: roleName || '' } : null);
    }
    
    // Refresh the exclusive role assignments to reflect the change
    fetchExclusiveRoleAssignments();
  };

  // Function to fetch all available qualifications
  const fetchAvailableQualifications = async () => {
    try {
      const { data, error } = await getAllQualifications();
      if (error) {
        throw new Error(error.message);
      }
      if (data) {
        setAvailableQualifications(data);
      }
    } catch (err: any) {
      console.error('Error fetching qualifications:', err);
    }
  };

  // Function to fetch a pilot's qualifications
  const fetchPilotQualifications = async (pilotId: string) => {
    setLoadingQualifications(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(pilotId);
      
      // Fetch qualifications
      const { data, error } = await getPilotQualifications(actualPilotId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setPilotQualifications(data || []);
    } catch (err: any) {
      console.error('Error fetching pilot qualifications:', err);
      setPilotQualifications([]);
    } finally {
      setLoadingQualifications(false);
    }
  };

  // Function to fetch qualifications for all pilots
  const fetchAllPilotQualifications = async () => {
    if (pilots.length === 0) return;
    
    setLoading(true);
    try {
      // Get all pilot IDs
      const pilotIds = pilots.map(pilot => pilot.id);
      
      // Use batch loading instead of individual fetches
      const qualMap = await getBatchPilotQualifications(pilotIds);
      
      // Update the state with the batch-loaded qualifications
      setAllPilotQualifications(qualMap);
    } catch (err: any) {
      console.error('Error fetching all pilot qualifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to add a qualification to a pilot
  const handleAddQualification = async () => {
    if (!selectedPilot || !selectedQualification) return;
    
    setUpdatingQualifications(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(selectedPilot.id);
      
      // Convert achieved date string to Date object
      const achievedDate = qualificationAchievedDate ? new Date(qualificationAchievedDate) : null;
      
      // Find the qualification object to include in optimistic update
      const qualToAdd = availableQualifications.find(q => q.id === selectedQualification);
      
      // Optimistic update for UI responsiveness
      if (qualToAdd) {
        const optimisticQual = {
          id: `temp-${Date.now()}`,
          pilot_id: actualPilotId,
          qualification_id: selectedQualification,
          qualification: qualToAdd,
          achieved_date: achievedDate?.toISOString()
        };
        
        // Update pilotQualifications state immediately
        setPilotQualifications(prev => [...prev, optimisticQual]);
        
        // Also update allPilotQualifications for badge rendering
        setAllPilotQualifications(prev => ({
          ...prev,
          [selectedPilot.id]: [...(prev[selectedPilot.id] || []), optimisticQual]
        }));
      }
      
      // Assign qualification
      const { data, error } = await assignQualificationToPilot(
        actualPilotId,
        selectedQualification,
        null, // No expiry date initially
        achievedDate
      );
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Refresh qualifications for the selected pilot
      const { data: updatedQuals, error: fetchError } = await getPilotQualifications(actualPilotId);
      
      if (fetchError) {
        throw new Error(fetchError.message);
      }
      
      if (updatedQuals) {
        // Update local state for the selected pilot
        setPilotQualifications(updatedQuals);
        
        // Also update allPilotQualifications
        setAllPilotQualifications(prev => ({
          ...prev,
          [selectedPilot.id]: updatedQuals,
          [actualPilotId]: updatedQuals // Also store under the actual UUID
        }));
      }
      
      // Reset form
      setSelectedQualification('');
      setIsAddingQualification(false);
    } catch (err: any) {
      console.error('Error adding qualification:', err);
      alert(`Error adding qualification: ${err.message}`);
      
      // Revert the optimistic update on error
      fetchPilotQualifications(selectedPilot.id);
    } finally {
      setUpdatingQualifications(false);
    }
  };

  // Function to remove a qualification from a pilot
  const handleRemoveQualification = async (qualificationId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingQualifications(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(selectedPilot.id);
      
      // Optimistic update - remove from UI immediately
      const updatedQuals = pilotQualifications.filter(
        pq => pq.qualification_id !== qualificationId
      );
      setPilotQualifications(updatedQuals);
      
      // Also update allPilotQualifications for badge rendering
      setAllPilotQualifications(prev => ({
        ...prev,
        [selectedPilot.id]: updatedQuals,
        [actualPilotId]: updatedQuals
      }));
      
      // Remove qualification
      const { success, error } = await removeQualificationFromPilot(actualPilotId, qualificationId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (!success) {
        throw new Error('Failed to remove qualification');
      }
    } catch (err: any) {
      console.error('Error removing qualification:', err);
      alert(`Error removing qualification: ${err.message}`);
      
      // Revert the optimistic update on error
      fetchPilotQualifications(selectedPilot.id);
    } finally {
      setUpdatingQualifications(false);
    }
  };

  useEffect(() => {
    // Fetch all statuses, roles and qualifications
    const fetchStatusesRolesAndQuals = async () => {
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

      // Fetch qualifications
      await fetchAvailableQualifications();
    };

    fetchStatusesRolesAndQuals();
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
            const legacyPilot = convertSupabasePilotToLegacy(pilot as any);
            if (pilot.discord_original_id) {
              legacyPilot.id = pilot.discord_original_id;
            }

            // Set status based on status_id if available
            if (pilot.status_id && statusMap[pilot.status_id]) {
              legacyPilot.status = statusMap[pilot.status_id].name as any;
              legacyPilot.status_id = pilot.status_id;
            } else {
              // Fallback to role-based status for backward compatibility
              const role = pilot.roles ? (pilot.roles as any).squadron?.toLowerCase() || '' : '';
              if (role.includes('co') || role.includes('xo')) {
                legacyPilot.status = 'Command';
              } else if (role.includes('oic')) {
                legacyPilot.status = 'Staff';
              } else if (role.includes('ret')) {
                legacyPilot.status = 'Retired';
              }
            }
            
            // Set role if available from the join
            if (pilot.role_name) {
              legacyPilot.role = pilot.role_name;
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
    const subscription = subscribeToTable('pilots', () => {
      // Update the pilots list when changes occur
      if (Object.keys(statusMap).length > 0) {
        fetchPilots();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [statusMap]); // Depend on statusMap to re-run when statuses are loaded

  useEffect(() => {
    // When pilots are loaded, fetch qualifications for all pilots
    if (pilots.length > 0) {
      fetchAllPilotQualifications();
    }
  }, [pilots]);

  // When a pilot is selected, fetch their roles and qualifications
  useEffect(() => {
    if (selectedPilot) {
      fetchPilotRoles(selectedPilot.id);
      fetchPilotQualifications(selectedPilot.id);
    } else {
      setPilotRoles([]);
      setPilotQualifications([]);
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

  // Sort pilots within each status group by role order
  Object.keys(groupedPilots).forEach(status => {
    groupedPilots[status].sort((a, b) => {
      // Find role objects for both pilots
      const roleA = roles.find(role => role.name === a.role);
      const roleB = roles.find(role => role.name === b.role);
      
      // If both have roles, sort by role order
      if (roleA && roleB) {
        return roleA.order - roleB.order;
      }
      
      // Put pilots with roles at the top
      if (roleA) return -1;
      if (roleB) return 1;
      
      // Otherwise sort by callsign alphabetically
      return a.callsign.localeCompare(b.callsign);
    });
  });

  // Optimize renderQualificationBadges function with memoization
  const renderQualificationBadges = React.useCallback((pilot: Pilot) => {
    // Use the pilot ID to get qualifications directly from allPilotQualifications state
    const pilotId = pilot.id;
    const pilotQuals = allPilotQualifications[pilotId] || [];
    
    if (pilotQuals.length === 0) {
      return null;
    }
    
    // Use a Map for efficient deduplication
    const qualMap = new Map();
    pilotQuals.forEach((pq: any) => {
      if (!qualMap.has(pq.qualification.id)) {
        qualMap.set(pq.qualification.id, pq);
      }
    });
    
    // Convert map back to array for rendering
    const uniqueQuals = Array.from(qualMap.values());
    
    return uniqueQuals.map((pq: any) => (
      <QualificationBadge 
        key={`${pilotId}-${pq.qualification.id}`}
        type={pq.qualification.name}
        code={pq.qualification.code}
        color={pq.qualification.color}
      />
    ));
  }, [allPilotQualifications]);

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
        boxSizing: 'border-box',
        overflowY: 'hidden' // Prevent overall page scroll
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
            height: 'calc(100vh - 40px)', // Subtract top and bottom padding
            position: 'relative',
            zIndex: 1,
            maxWidth: `${baseWidth * 3 + 20}px`,
            margin: '0 auto',
            width: '100%'
          }}
        >
          <div 
            style={{
              display: 'flex',
              gap: '20px',
              flex: 1,
              maxHeight: 'calc(100vh - 40px)', // Ensure it doesn't go beyond the viewport
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
                overflow: 'hidden', // Contain the scrollbar
                maxHeight: 'calc(100vh - 60px)' // Stay 20px from bottom of viewport
              }}
            >
              {/* Status filter tabs - now inside the card */}
              <div className="flex p-4" style={{ padding: '5px' }}>
                <div 
                  className="cursor-pointer px-3 py-2 mr-2 rounded-md"
                  style={{
                    backgroundColor: activeStatusFilter === null ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                    color: activeStatusFilter === null ? '#F97316' : '#646F7E'
                  }}
                  onClick={() => setActiveStatusFilter(null)}
                >
                  All
                </div>
                <div 
                  className="cursor-pointer px-3 py-2 mr-2 rounded-md"
                  style={{
                    backgroundColor: activeStatusFilter === true ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                    color: activeStatusFilter === true ? '#F97316' : '#646F7E'
                  }}
                  onClick={() => setActiveStatusFilter(true)}
                >
                  Active
                </div>
                <div 
                  className="cursor-pointer px-3 py-2 rounded-md"
                  style={{
                    backgroundColor: activeStatusFilter === false ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                    color: activeStatusFilter === false ? '#F97316' : '#646F7E'
                  }}
                  onClick={() => setActiveStatusFilter(false)}
                >
                  Inactive
                </div>
              </div>
              
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
                            {/* Display role */}
                            {pilot.role || ''}
                          </span>
                          
                          {/* Qualification badges */}
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginLeft: 'auto',
                            height: '24px'
                          }}>
                            {renderQualificationBadges(pilot)}
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
                overflowY: 'auto', // Add scrollbar if content overflows
                maxHeight: 'calc(100vh - 60px)' // Stay 20px from bottom of viewport
              }}
            >
              {selectedPilot ? (
                <div>
                  {/* Header with board number, callsign, and role */}
                  <div style={{
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'baseline', // Align text baselines
                    gap: '12px'
                  }}>
                    <h1 style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: '#0F172A',
                      display: 'flex',
                      alignItems: 'baseline', // Align text baselines
                      gap: '12px',
                      margin: 0 // Remove default margin
                    }}>
                      <span style={{ fontWeight: 400, color: '#64748B' }}>{selectedPilot.boardNumber}</span>
                      {selectedPilot.callsign}
                      <span style={{ 
                        fontSize: '18px', 
                        fontWeight: 400, 
                        color: '#64748B',
                        fontStyle: 'normal'
                      }}>
                        {selectedPilot.role || ''}
                      </span>
                    </h1>
                  </div>

                  <div style={{ display: 'grid', gap: '24px' }}>
                    {/* Section 1: Basic Information */}
                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-4" style={{
                        borderBottom: '1px solid #E2E8F0',
                        paddingBottom: '8px'
                      }}>Basic Information</h2>
                      
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Board Number
                        </label>
                        <div style={{
                          padding: '8px 12px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          fontSize: '14px',
                          width: '33%'
                        }}>
                          {selectedPilot.boardNumber}
                        </div>
                      </div>
                      
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Callsign
                        </label>
                        <div style={{
                          padding: '8px 12px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          fontSize: '14px',
                          width: '33%'
                        }}>
                          {selectedPilot.callsign}
                        </div>
                      </div>
                      
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Discord Username
                        </label>
                        <div style={{
                          padding: '8px 12px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          fontSize: '14px',
                          width: '33%'
                        }}>
                          {selectedPilot.discordUsername}
                        </div>
                      </div>
                    </Card>
                    
                    {/* Section 2: Status, Roles, and Qualifications */}
                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-4" style={{
                        borderBottom: '1px solid #E2E8F0',
                        paddingBottom: '8px'
                      }}>Status, Role and Qualifications</h2>
                      
                      {/* Status */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Status
                        </label>
                        <div style={{
                          position: 'relative',
                          width: '450px'
                        }}>
                          <select
                            value={selectedPilot.status_id || ''}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            disabled={updatingStatus}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              paddingRight: '32px',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              backgroundColor: '#F8FAFC',
                              fontSize: '14px',
                              appearance: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            {statuses.sort((a, b) => a.order - b.order).map(status => (
                              <option key={status.id} value={status.id}>
                                {status.name}
                              </option>
                            ))}
                            {!selectedPilot.status_id && <option value="">-- Select status --</option>}
                          </select>
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            right: '12px',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 8.5L2 4.5H10L6 8.5Z" fill="#64748B"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Role dropdown */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Role
                        </label>
                        <div style={{
                          position: 'relative',
                          width: '450px'
                        }}>
                          <select
                            value={pilotRoles.length > 0 ? pilotRoles[0].id : ''}
                            onChange={(e) => handleRoleChange(e.target.value)}
                            disabled={updatingRoles || loadingRoles}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              paddingRight: '32px',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              backgroundColor: '#F8FAFC',
                              fontSize: '14px',
                              appearance: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">No Role</option>
                            {roles
                              .sort((a, b) => a.order - b.order)
                              .map(role => (
                                <option 
                                  key={role.id} 
                                  value={role.id}
                                  disabled={disabledRoles[role.id]}
                                >
                                  {role.name}
                                </option>
                              ))}
                          </select>
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            right: '12px',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 8.5L2 4.5H10L6 8.5Z" fill="#64748B"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Qualifications */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#64748B'
                        }}>
                          Qualifications
                        </label>

                        {/* Show loading state if loading qualifications */}
                        {loadingQualifications ? (
                          <div className="text-center p-4 text-slate-500">
                            Loading qualifications...
                          </div>
                        ) : pilotQualifications.length > 0 ? (
                          <div className="space-y-2 p-4 border border-gray-200 rounded-md bg-slate-50" style={{ width: '450px' }}>
                            {pilotQualifications.map((pilotQual) => (
                              <div 
                                key={pilotQual.id} 
                                className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0 relative group"
                              >
                                <div className="flex-1">
                                  <div className="font-medium">{pilotQual.qualification.name}</div>
                                  {pilotQual.achieved_date && (
                                    <div className="text-xs text-slate-500">
                                      {new Date(pilotQual.achieved_date).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleRemoveQualification(pilotQual.qualification_id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  disabled={updatingQualifications}
                                  title="Remove qualification"
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    background: 'white',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#64748B'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                                    e.currentTarget.style.background = '#F8FAFC';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                    e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-md" style={{ width: '450px' }}>
                            No qualifications added
                          </div>
                        )}

                        {/* Add qualification section */}
                        <div className="mt-4" style={{ width: '450px' }}>
                          <div className="flex space-x-2 mb-2">
                            <div className="flex-1">
                              <select
                                value={selectedQualification}
                                onChange={(e) => setSelectedQualification(e.target.value)}
                                disabled={isAddingQualification || updatingQualifications}
                                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">-- Select qualification --</option>
                                {availableQualifications
                                  .filter(qual => !pilotQualifications.some(pq => pq.qualification_id === qual.id))
                                  .map(qual => (
                                    <option key={qual.id} value={qual.id}>
                                      {qual.name}
                                    </option>
                                  ))
                                }
                              </select>
                            </div>
                            <input
                              type="date"
                              value={qualificationAchievedDate}
                              onChange={(e) => setQualificationAchievedDate(e.target.value)}
                              disabled={isAddingQualification || updatingQualifications || !selectedQualification}
                              className="px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex justify-center">
                            <button
                              onClick={handleAddQualification}
                              disabled={!selectedQualification || isAddingQualification || updatingQualifications}
                              className={`mt-2 px-4 py-1 text-sm font-medium rounded-md ${
                                !selectedQualification || isAddingQualification || updatingQualifications
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                              }`}
                            >
                              {isAddingQualification ? 'Adding...' : 'Add'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Section 3: Attendance and Service Record */}
                    <Card className="p-4">
                      <h2 className="text-lg font-semibold mb-4" style={{
                        borderBottom: '1px solid #E2E8F0',
                        paddingBottom: '8px'
                      }}>Attendance and Service Record</h2>
                      
                      <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: '#94A3B8',
                        fontStyle: 'italic'
                      }}>
                        Service record information will be available in a future update
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