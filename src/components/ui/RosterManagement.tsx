import React, { useState, useEffect, useRef } from 'react';
import { Pilot, convertSupabasePilotToLegacy } from '../../types/PilotTypes';
import { 
  getAllPilots, 
  getPilotByDiscordOriginalId, 
  updatePilotStatus,
  createPilot,
  deletePilot, // Added import for deletePilot
  updatePilot,
  updatePilotRole,
  clearDiscordCredentials // Added import for clearDiscordCredentials
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
import { rosterStyles } from '../../styles/RosterManagementStyles';
import PilotList from './roster/PilotList';
import PilotDetails from './roster/PilotDetails';
import { DiscordPilotsDialog } from './dialogs/DiscordPilotsDialog';
import { v4 as uuidv4 } from 'uuid';

const RosterManagement: React.FC = () => {
  // State for pilots and filtering
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [hoveredPilot, setHoveredPilot] = useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<boolean | null>(null); // null means show all
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isAddingNewPilot, setIsAddingNewPilot] = useState(false);
  const [newPilot, setNewPilot] = useState<Partial<Pilot>>({
    id: '',
    callsign: '',
    boardNumber: '',
    discordUsername: '',
    status_id: '',
    qualifications: []
  });
  const [isSavingNewPilot, setIsSavingNewPilot] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Discord integration state
  const [isDiscordImportOpen, setIsDiscordImportOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ 
    type: 'success' | 'error'; 
    text: string 
  } | null>(null);
  
  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [pilotRoles, setPilotRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [updatingRoles, setUpdatingRoles] = useState(false);
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

  // Handle Discord sync completion
  const handleDiscordSyncComplete = (result: {
    updated: number;
    created: number;
    unchanged: number;
    errors: string[];
  }) => {
    // Show success message
    let message = `Discord sync complete: ${result.updated} pilots updated, ${result.created} pilots created`;
    
    if (result.errors.length) {
      message += `, ${result.errors.length} errors`;
      setSyncMessage({
        type: 'error',
        text: message
      });
    } else {
      setSyncMessage({
        type: 'success',
        text: message
      });
    }
    
    // Refresh pilots list
    if (result.updated > 0 || result.created > 0) {
      refreshPilots();
      
      // If there's a selected pilot, refresh it to show possible Discord updates
      if (selectedPilot) {
        refreshSelectedPilot(selectedPilot.id);
      }
    }
    
    // Clear message after 8 seconds
    setTimeout(() => {
      setSyncMessage(null);
    }, 8000);
  };

  // Function to refresh a specific pilot's details
  const refreshSelectedPilot = async (pilotId: string) => {
    try {
      // Get the actual UUID if this is a Discord ID
      const actualPilotId = await getActualPilotId(pilotId);
      
      // Get the pilot's updated details
      const { data, error } = await supabase
        .from('pilots')
        .select(`
          *,
          roles:role_id (
            id,
            name
          )
        `)
        .eq('id', actualPilotId)
        .single();
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data) {
        // Convert to our UI format
        const updatedPilot = convertSupabasePilotToLegacy(data as any);
        
        // Use the discord_original_id as the main ID if available (for backwards compatibility)
        if (data.discord_original_id) {
          updatedPilot.id = data.discord_original_id;
        }
        
        // Set status based on status_id
        if (data.status_id && statusMap[data.status_id]) {
          updatedPilot.status = statusMap[data.status_id].name as any;
          updatedPilot.status_id = data.status_id;
        }
        
        // Set role if available
        if (data.roles?.name) {
          updatedPilot.role = data.roles.name;
        }
        
        // Update the pilot in our state
        setPilots(prevPilots => prevPilots.map(p => 
          p.id === pilotId ? updatedPilot : p
        ));
        
        // Update selected pilot state
        setSelectedPilot(updatedPilot);
        
        // Also update role and qualification states
        if (updatedPilot) {
          fetchPilotRoles(updatedPilot.id);
          fetchPilotQualifications(updatedPilot.id);
        }
      }
    } catch (err: any) {
      console.error('Error refreshing selected pilot:', err);
    }
  };

  // Function to clear a pilot's Discord credentials
  const handleClearDiscord = async (pilotId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { success, error } = await clearDiscordCredentials(pilotId);
      
      if (error) {
        throw new Error(error.message || 'Failed to clear Discord credentials');
      }

      if (success) {
        // Update the pilot in local state to reflect changes immediately
        setPilots(prevPilots => 
          prevPilots.map(pilot => 
            pilot.id === pilotId 
              ? { ...pilot, discordUsername: '', discordID: null, discord_original_id: null } 
              : pilot
          )
        );
        
        // If this was the selected pilot, update that too
        if (selectedPilot && selectedPilot.id === pilotId) {
          setSelectedPilot({
            ...selectedPilot,
            discordUsername: '',
            discordID: null,
            discord_original_id: null
          });
        }

        // Show success message
        setSyncMessage({
          type: 'success',
          text: 'Discord credentials cleared successfully'
        });
        
        // Clear message after 5 seconds
        setTimeout(() => {
          setSyncMessage(null);
        }, 5000);
      }
      
      return { success };
    } catch (err: any) {
      console.error('Error clearing Discord credentials:', err);
      
      setSyncMessage({
        type: 'error',
        text: `Error clearing Discord credentials: ${err.message || 'Unknown error'}`
      });
      
      // Clear error message after 8 seconds
      setTimeout(() => {
        setSyncMessage(null);
      }, 8000);
      
      return { success: false, error: err.message || 'Unknown error occurred' };
    }
  };

  // Function to refresh the pilots list
  const refreshPilots = async () => {
    setLoading(true);
    try {
      const { data, error } = await getAllPilots();
      
      if (error) {
        throw new Error(error.message);
      }

      if (data && data.length > 0) {
        // Convert Supabase format to the format our UI expects
        const convertedPilots = data.map(pilot => {
          // Use the discord_original_id as the main ID if available
          const legacyPilot = convertSupabasePilotToLegacy(pilot as any);
          if (pilot.discord_original_id) {
            legacyPilot.id = pilot.discord_original_id;
          }

          // Set status based on status_id if available
          if (pilot.status_id && statusMap[pilot.status_id]) {
            legacyPilot.status = statusMap[pilot.status_id].name as any;
            legacyPilot.status_id = pilot.status_id;
          }
          return legacyPilot;
        });
        setPilots(convertedPilots);
      }
    } catch (err: any) {
      console.error('Error refreshing pilots:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to handle adding a new pilot
  const handleAddPilot = () => {
    // Create a temporary blank pilot
    const tempId = uuidv4();
    const blankPilot: Pilot = {
      id: tempId,
      callsign: '',
      boardNumber: '',
      billet: '', // Add missing billet property
      status: 'Provisional',
      status_id: statuses.find(s => s.name === 'Provisional')?.id || '',
      qualifications: [],
      discordUsername: ''
    };
    
    setIsAddingNewPilot(true);
    setNewPilot(blankPilot);
    setSelectedPilot(blankPilot);
  };

  // Update new pilot field
  const handleNewPilotChange = (field: string, value: string) => {
    setNewPilot(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Also update the selected pilot for real-time preview
    setSelectedPilot(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Save new pilot
  const handleSaveNewPilot = async () => {
    if (!newPilot.callsign || !newPilot.boardNumber || !newPilot.status_id) {
      setSaveError('Board Number, Callsign, and Status are required.');
      return;
    }
    
    setIsSavingNewPilot(true);
    setSaveError(null);
    
    try {
      // Format the pilot data for the API - using the correct field structure
      const pilotData = {
        boardNumber: parseInt(newPilot.boardNumber),
        callsign: newPilot.callsign,
        discordId: newPilot.discordUsername || undefined, // Changed null to undefined
        status_id: newPilot.status_id,
        // Don't include roles directly - it was causing the schema error
      };
      
      // Create the pilot in the database
      const { data, error } = await createPilot(pilotData);
      
      if (error) {
        throw new Error(error.message || 'Failed to create pilot');
      }
      
      // Create a new converted pilot object to immediately add to the UI
      if (data) {
        const newConvertedPilot = convertSupabasePilotToLegacy(data as any);
        
        // Add status name from the status_id
        if (newConvertedPilot.status_id && statusMap[newConvertedPilot.status_id]) {
          newConvertedPilot.status = statusMap[newConvertedPilot.status_id].name as any;
        }
        
        // Immediately update the pilots list in state with the new pilot
        setPilots(prevPilots => [...prevPilots, newConvertedPilot]);
        
        // Reset states
        setIsAddingNewPilot(false);
        setNewPilot({
          id: '',
          callsign: '',
          boardNumber: '',
          discordUsername: '',
          status_id: '',
          qualifications: []
        });
        
        // Select the newly created pilot
        setSelectedPilot(newConvertedPilot);
      } else {
        // If no data returned, just refresh the full list
        const fetchPilotsData = async () => {
          setLoading(true);
          try {
            const { data, error } = await getAllPilots();
            if (error) {
              throw new Error(error.message);
            }
            if (data) {
              const convertedPilots = data.map(pilot => {
                const legacyPilot = convertSupabasePilotToLegacy(pilot as any);
                if (pilot.discord_original_id) {
                  legacyPilot.id = pilot.discord_original_id;
                }
                if (pilot.status_id && statusMap[pilot.status_id]) {
                  legacyPilot.status = statusMap[pilot.status_id].name as any;
                  legacyPilot.status_id = pilot.status_id;
                }
                return legacyPilot;
              });
              setPilots(convertedPilots);
            }
          } catch (err: any) {
            console.error('Error refreshing pilots:', err);
          } finally {
            setLoading(false);
          }
        };
        
        await fetchPilotsData();
        setIsAddingNewPilot(false);
        setNewPilot({
          id: '',
          callsign: '',
          boardNumber: '',
          discordUsername: '',
          status_id: '',
          qualifications: []
        });
        setSelectedPilot(null);
      }
    } catch (err: any) {
      setSaveError(err.message || 'An error occurred while saving the pilot');
      console.error('Error saving new pilot:', err);
    } finally {
      setIsSavingNewPilot(false);
    }
  };

  // Cancel adding new pilot
  const handleCancelAddPilot = () => {
    setIsAddingNewPilot(false);
    setNewPilot({
      id: '',
      callsign: '',
      boardNumber: '',
      discordUsername: '',
      status_id: '',
      qualifications: []
    });
    setSelectedPilot(null);
    setSaveError(null);
  };

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

  // Get the actual UUID from a pilot ID that might be a Discord ID
  const getActualPilotId = async (pilotId: string): Promise<string> => {
    // Discord IDs are typically long numeric strings
    const isDiscordId = /^\d+$/.test(pilotId) && pilotId.length > 10;
    
    if (!isDiscordId) {
      return pilotId; // Return as is if it's not a Discord ID
    }
    
    // If it's a Discord ID, get the corresponding UUID
    try {
      // Look up the pilot by Discord ID - don't use .single() as it will fail if multiple entries exist
      const { data, error } = await supabase
        .from('pilots')
        .select('id')
        .eq('discord_original_id', pilotId);
      
      if (error) {
        console.error('Error getting actual pilot ID:', error);
        throw new Error(`Error getting actual pilot ID: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Could not find pilot with the provided Discord ID');
      }
      
      // If multiple entries exist with this Discord ID, log the issue and use the first one
      if (data.length > 1) {
        console.warn(`Multiple pilots (${data.length}) found with Discord ID ${pilotId}. Using the first one:`, data);
      }
      
      // Use the first entry found
      const actualId = data[0].id;
      console.log(`Translated Discord ID ${pilotId} to UUID ${actualId}`);
      return actualId;
    } catch (err: any) {
      console.error('Error getting actual pilot ID:', err);
      throw err; // Re-throw to be handled by the caller
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

  // Handle role change with improved exclusive role checking
  const handleRoleChange = async (roleId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingRoles(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(selectedPilot.id);
      
      // If empty selection, remove the role
      if (!roleId || roleId === "") {
        console.log("Removing role (empty selection)");
        
        // Update the pilot's role to null - using explicit null value
        const { error } = await supabase
          .from('pilots')
          .update({ role_id: null })
          .eq('id', actualPilotId);
        
        if (error) {
          console.error("Error setting role to null:", error);
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
      const { error } = await assignQualificationToPilot(
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

  // Function to handle pilot deletion
  const handleDeletePilot = async (pilotId: string) => {
    try {
      // Get the actual UUID if this is a Discord ID
      const actualPilotId = await getActualPilotId(pilotId);
      
      // Delete the pilot from the database
      const { success, error } = await deletePilot(actualPilotId);
      
      if (error) {
        throw new Error(error.message || 'Failed to delete pilot');
      }
      
      if (success) {
        // Update the pilots list by removing the deleted pilot
        setPilots(prevPilots => prevPilots.filter(p => p.id !== pilotId));
        
        // Clear the selected pilot if it was the one deleted
        if (selectedPilot && selectedPilot.id === pilotId) {
          setSelectedPilot(null);
        }

        // Remove from qualifications cache
        setAllPilotQualifications(prev => {
          const updated = { ...prev };
          delete updated[pilotId];
          delete updated[actualPilotId];
          return updated;
        });
      }
    } catch (err: any) {
      console.error('Error deleting pilot:', err);
      alert(`Error deleting pilot: ${err.message}`);
    }
  };

  // Function to handle saving pilot changes
  const handleSavePilotChanges = async (updatedPilot: Pilot): Promise<{ success: boolean; error?: string }> => {
    if (!updatedPilot) return { success: false, error: 'No pilot data provided' };
    
    try {
      // Get actual pilot ID if this is a discord ID
      const actualPilotId = await getActualPilotId(updatedPilot.id);
      
      // Prepare update payload - only include fields that can be updated directly
      const updatePayload: any = {
        callsign: updatedPilot.callsign,
        boardNumber: parseInt(updatedPilot.boardNumber),
        discordId: updatedPilot.discordUsername || undefined,
        status_id: updatedPilot.status_id
        // Note: role is handled separately
      };
      
      // Update pilot basic info
      const { data, error } = await updatePilot(actualPilotId, updatePayload);
      
      if (error) {
        throw new Error(error.message || 'Failed to update pilot');
      }
      
      // Handle role updates - including removal case
      if (!updatedPilot.role || updatedPilot.role === '') {
        // If no role is selected, explicitly set role_id to null
        console.log("Save changes: Removing role for pilot", actualPilotId);
        const { error: nullRoleError } = await supabase
          .from('pilots')
          .update({ role_id: null })
          .eq('id', actualPilotId);
        
        if (nullRoleError) {
          console.error("Error setting role to null during save:", nullRoleError);
          throw new Error(nullRoleError.message || 'Failed to remove pilot role');
        }
      } else {
        // Find the role ID based on the role name
        const matchingRole = roles.find(r => r.name === updatedPilot.role);
        const roleId = matchingRole?.id || null;
        
        if (roleId) {
          // Update to a specific role
          const { error: roleError } = await updatePilotRole(actualPilotId, roleId);
          
          if (roleError) {
            throw new Error(roleError.message || 'Failed to update pilot role');
          }
        }
      }
      
      // Update the pilot in the local state
      setPilots(prevPilots => prevPilots.map(p => {
        if (p.id === updatedPilot.id) {
          return updatedPilot;
        }
        return p;
      }));
      
      // Update selected pilot
      setSelectedPilot(updatedPilot);
      
      // Refresh exclusive role assignments
      fetchExclusiveRoleAssignments();
      
      return { success: true };
    } catch (err: any) {
      console.error('Error saving pilot changes:', err);
      return { success: false, error: err.message || 'An error occurred while saving changes' };
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

  // Add useEffect to fetch disabled roles whenever pilots or roles change
  useEffect(() => {
    if (roles.length > 0) {
      fetchExclusiveRoleAssignments();
    }
  }, [roles, selectedPilot]);

  useEffect(() => {
    // Synchronize heights of both columns
    if (rosterListRef.current && pilotDetailsRef.current && rosterContentRef.current) {
      // Ensure both columns have the same height
      const rosterHeight = rosterListRef.current.clientHeight;
      pilotDetailsRef.current.style.height = `${rosterHeight}px`;
    }
  }, [selectedPilot]);

  return (
    <div style={rosterStyles.container}>
      {/* Discord import modal */}
      <DiscordPilotsDialog 
        isOpen={isDiscordImportOpen} 
        onClose={() => setIsDiscordImportOpen(false)}
        onComplete={handleDiscordSyncComplete}
        selectedPilotId={selectedPilot?.id} // Pass the selectedPilotId to track
      />
      
      {loading && !pilots.length ? (
        <div style={rosterStyles.loading}>
          <div>Loading roster data...</div>
        </div>
      ) : error ? (
        <div style={rosterStyles.error}>
          Error loading roster data: {error}
        </div>
      ) : (
        <div style={rosterStyles.contentWrapper}>
          {/* Admin toolbar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px', 
            padding: '0 16px' 
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Squadron Roster</h2>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setIsDiscordImportOpen(true)}
                style={{
                  backgroundColor: '#7289da', // Discord color
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
                Sync with Discord
              </button>
            </div>
          </div>
          
          {/* Sync message */}
          {syncMessage && (
            <div 
              style={{
                padding: '10px 16px',
                marginBottom: '16px',
                borderRadius: '4px',
                backgroundColor: syncMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
                color: syncMessage.type === 'success' ? '#065f46' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>{syncMessage.text}</span>
              <button 
                onClick={() => setSyncMessage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '0 5px'
                }}
              >
                ×
              </button>
            </div>
          )}
          
          <div style={rosterStyles.columnsContainer}>
            {/* Left column - Squadron Roster List */}
            <PilotList
              pilots={pilots}
              statuses={statuses}
              statusMap={statusMap}
              selectedPilot={selectedPilot}
              hoveredPilot={hoveredPilot}
              activeStatusFilter={activeStatusFilter}
              allPilotQualifications={allPilotQualifications}
              setSelectedPilot={isAddingNewPilot ? undefined : setSelectedPilot}
              setHoveredPilot={setHoveredPilot}
              setActiveStatusFilter={setActiveStatusFilter}
              onAddPilot={handleAddPilot}
              isAddingNewPilot={isAddingNewPilot}
            />

            {/* Right column - Pilot Details */}
            {isAddingNewPilot ? (
              <PilotDetails
                selectedPilot={selectedPilot}
                statuses={statuses}
                roles={roles}
                pilotRoles={pilotRoles}
                availableQualifications={availableQualifications}
                pilotQualifications={pilotQualifications}
                loadingRoles={loadingRoles}
                updatingRoles={updatingRoles}
                updatingStatus={updatingStatus}
                loadingQualifications={loadingQualifications}
                disabledRoles={disabledRoles}
                selectedQualification={selectedQualification}
                qualificationAchievedDate={qualificationAchievedDate}
                isAddingQualification={isAddingQualification}
                updatingQualifications={updatingQualifications}
                setSelectedQualification={setSelectedQualification}
                setQualificationAchievedDate={setQualificationAchievedDate}
                handleStatusChange={(statusId) => handleNewPilotChange('status_id', statusId)}
                handleRoleChange={handleRoleChange}
                handleAddQualification={handleAddQualification}
                handleRemoveQualification={handleRemoveQualification}
                handleDeletePilot={handleDeletePilot}
                handleSavePilotChanges={handleSavePilotChanges}
                handleClearDiscord={handleClearDiscord}
                isNewPilot={true}
                onPilotFieldChange={handleNewPilotChange}
                onSaveNewPilot={handleSaveNewPilot}
                onCancelAddPilot={handleCancelAddPilot}
                isSavingNewPilot={isSavingNewPilot}
                saveError={saveError}
              />
            ) : (
              <PilotDetails
                selectedPilot={selectedPilot}
                statuses={statuses}
                roles={roles}
                pilotRoles={pilotRoles}
                availableQualifications={availableQualifications}
                pilotQualifications={pilotQualifications}
                loadingRoles={loadingRoles}
                updatingRoles={updatingRoles}
                updatingStatus={updatingStatus}
                loadingQualifications={loadingQualifications}
                disabledRoles={disabledRoles}
                selectedQualification={selectedQualification}
                qualificationAchievedDate={qualificationAchievedDate}
                isAddingQualification={isAddingQualification}
                updatingQualifications={updatingQualifications}
                setSelectedQualification={setSelectedQualification}
                setQualificationAchievedDate={setQualificationAchievedDate}
                handleStatusChange={handleStatusChange}
                handleRoleChange={handleRoleChange}
                handleAddQualification={handleAddQualification}
                handleRemoveQualification={handleRemoveQualification}
                handleDeletePilot={handleDeletePilot}
                handleSavePilotChanges={handleSavePilotChanges}
                handleClearDiscord={handleClearDiscord}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RosterManagement;