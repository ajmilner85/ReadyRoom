import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import StandardPageLoader from './StandardPageLoader';
import { Pilot } from '../../types/PilotTypes';
import { 
  getAllPilots, 
  getPilotByDiscordOriginalId, 
  createPilotWithStatusAndStanding,
  deletePilot, // Added import for deletePilot
  updatePilot,
  updatePilotRole,
  updatePilotRoleAllowDuplicates, // Added import for allowing duplicate roles
  clearDiscordCredentials // Added import for clearDiscordCredentials
} from '../../utils/pilotService';
import { supabase } from '../../utils/supabaseClient';
import { subscribeToTable } from '../../utils/supabaseClient';
import { getAllStatuses, Status } from '../../utils/statusService';
import { getAllStandings, Standing } from '../../utils/standingService';
import { assignPilotStatus, assignPilotStanding } from '../../utils/pilotStatusStandingService';
import { getAllRoles, Role } from '../../utils/roleService';
import { getAllSquadrons, assignPilotToSquadron, Squadron } from '../../utils/squadronService';
import { 
  Qualification, 
  getAllQualifications, 
  assignQualificationToPilot,
  removeQualificationFromPilot,
  getPilotQualifications,
  getBatchPilotQualifications,
  clearPilotQualificationsCache
} from '../../utils/qualificationService';
import { rosterStyles } from '../../styles/RosterManagementStyles';
import PilotList from './roster/PilotList';
import PilotDetails from './roster/PilotDetails';
import { DiscordPilotsDialog } from './dialogs/DiscordPilotsDialog';
import { v4 as uuidv4 } from 'uuid';

const RosterManagement: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  
  // State for pilots and filtering
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Clear page loading when component data is loaded
  useEffect(() => {
    if (!loading) {
      setPageLoading('roster', false);
    }
  }, [loading, setPageLoading]);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [hoveredPilot, setHoveredPilot] = useState<string | null>(null);
  const [selectedSquadronIds, setSelectedSquadronIds] = useState<string[]>([]); // empty means show all
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([]);
  const [selectedStandingIds, setSelectedStandingIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedQualificationIds, setSelectedQualificationIds] = useState<string[]>([]);
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingStanding, setUpdatingStanding] = useState(false);
  const [updatingSquadron, setUpdatingSquadron] = useState(false);
  
  // Squadron conflict warning state
  const [squadronConflictWarning, setSquadronConflictWarning] = useState<{
    show: boolean;
    pilotData: any;
    conflictingPilot?: string;
    conflictingRole?: string;
    onAcceptDuplicate?: () => void;
    onReplaceIncumbent?: () => void;
    onCancel?: () => void;
  }>({ show: false, pilotData: null });
  const [isAddingNewPilot, setIsAddingNewPilot] = useState(false);
  // Interface for new pilot creation form data
  interface NewPilotFormData {
    id: string;
    callsign: string;
    boardNumber: string;
    discordUsername: string;
    status_id: string;
    standing_id: string;
    squadron_id: string;
    role_id: string;
    qualifications: any[];
  }

  const [newPilot, setNewPilot] = useState<NewPilotFormData>({
    id: '',
    callsign: '',
    boardNumber: '',
    discordUsername: '',
    status_id: '',
    standing_id: '',
    squadron_id: '',
    role_id: '',
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
      // Refresh all pilots to get latest data
      await refreshPilots();
      
      // Wait for state to update and then find the updated pilot
      // Use a longer timeout and multiple attempts to ensure reliability
      let attempts = 0;
      const maxAttempts = 5;
      
      const findAndUpdatePilot = () => {
        setTimeout(() => {
          const refreshedPilot = pilots.find(p => p.id === (selectedPilot?.id || pilotId));
          
          if (refreshedPilot) {
            setSelectedPilot(refreshedPilot);
            fetchPilotRoles(refreshedPilot.id);
            fetchPilotQualifications(refreshedPilot.id);
          } else if (attempts < maxAttempts) {
            attempts++;
            findAndUpdatePilot();
          } else {
            console.warn('Could not find refreshed pilot after', maxAttempts, 'attempts');
          }
        }, 200 * (attempts + 1)); // Increasing delay with each attempt
      };
      
      findAndUpdatePilot();
      
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
              ? { ...pilot, discordUsername: '' } 
              : pilot
          )
        );
          
        // If this was the selected pilot, update that too
        if (selectedPilot && selectedPilot.id === pilotId) {
          setSelectedPilot({
            ...selectedPilot,
            discordUsername: ''
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
        // Use the pilot data directly from getAllPilots() - it already has the new structure
        const convertedPilots = data.map(pilot => {
          // Create the pilot object with all necessary properties
          const legacyPilot: Pilot = {
            id: pilot.id, // Use the actual pilot UUID as ID
            discord_original_id: (pilot as any).discord_original_id, // Preserve numeric Discord ID
            callsign: pilot.callsign,
            boardNumber: pilot.boardNumber.toString(), // Convert to string for legacy compatibility
            discordId: pilot.discordId || undefined, // Handle null case
            currentStatus: pilot.currentStatus || undefined,
            currentStanding: pilot.currentStanding || undefined,
            qualifications: ((pilot as any).qualifications || []).map((q: any, index: number) => ({
              id: `${pilot.id}-${index}`,
              type: q as any,
              dateAchieved: new Date().toISOString().split('T')[0]
            })), // Convert strings to Qualification objects
            // Set status based on currentStatus if available
            status: pilot.currentStatus?.name || 'Provisional' as any,
            billet: '', // Default empty billet
            discordUsername: pilot.discordId || '', // Use discordId for display
            roles: pilot.roles as any, // KEEP THE ROLES - cast to avoid type conflicts
            // Add squadron assignment information
            currentSquadron: (pilot as any).currentSquadron || undefined,
            squadronAssignment: (pilot as any).squadronAssignment || undefined
          };
          
          
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
    // Create a temporary blank pilot for the form
    const tempId = uuidv4();
    const blankFormData: NewPilotFormData = {
      id: tempId,
      callsign: '',
      boardNumber: '',
      discordUsername: '',
      status_id: statuses.find(s => s.name === 'Provisional')?.id || '',
      standing_id: standings.find(s => s.name === 'Good')?.id || '',
      squadron_id: '',
      role_id: '',
      qualifications: []
    };
    
    // Create a temporary blank pilot for preview display
    const blankPilot: Pilot = {
      id: tempId,
      callsign: '',
      boardNumber: '',
      billet: '',
      status: 'Provisional',
      status_id: blankFormData.status_id,
      standing_id: blankFormData.standing_id,
      qualifications: [],
      discordUsername: ''
    };
    
    setIsAddingNewPilot(true);
    setNewPilot(blankFormData);
    setSelectedPilot(blankPilot);
  };

  // Update new pilot field
  const handleNewPilotChange = (field: string, value: string) => {
    setNewPilot(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Also update the selected pilot for real-time preview with proper field mapping
    setSelectedPilot(prev => {
      if (!prev) return null;
      
      // Handle field mapping for preview display
      const updates: Partial<Pilot> = {};
      
      if (field === 'squadron_id') {
        if (value) {
          const squadron = squadrons.find(s => s.id === value);
          updates.currentSquadron = squadron;
          (updates as any).squadron_id = value;
        } else {
          updates.currentSquadron = undefined;
          (updates as any).squadron_id = '';
        }
      } else if (field === 'role_id') {
        if (value) {
          const role = roles.find(r => r.id === value);
          if (role) {
            updates.roles = [{
              id: '',
              pilot_id: prev.id,
              role_id: role.id,
              effective_date: new Date().toISOString(),
              is_acting: false,
              end_date: null,
              created_at: new Date().toISOString(),
              updated_at: null,
              role: role
            }];
          }
        } else {
          updates.roles = [];
        }
      } else if (field === 'status_id' && value) {
        const status = statuses.find(s => s.id === value);
        updates.currentStatus = status;
        updates.status_id = value;
      } else if (field === 'standing_id' && value) {
        const standing = standings.find(s => s.id === value);
        updates.currentStanding = standing;
        updates.standing_id = value;
      } else {
        // For simple fields, just update directly
        updates[field as keyof Pilot] = value as any;
      }
      
      return { ...prev, ...updates };
    });
  };

  // Save new pilot
  const handleSaveNewPilot = async () => {
    if (!newPilot.callsign || !newPilot.boardNumber || !newPilot.status_id || !newPilot.standing_id) {
      setSaveError('Board Number, Callsign, Status, and Standing are required.');
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
        // Don't include status_id directly - it will be assigned via the join table
      };
      
      // Create the pilot in the database with status and standing
      const { data, error } = await createPilotWithStatusAndStanding(
        pilotData, 
        newPilot.status_id,
        newPilot.standing_id
      );
      
      if (error) {
        throw new Error(error.message || 'Failed to create pilot');
      }
      
      if (!data) {
        throw new Error('No pilot data returned from creation');
      }
      
      
      // Step 2: Assign squadron if selected
      if (newPilot.squadron_id) {
        const squadronResult = await assignPilotToSquadron(data.id, newPilot.squadron_id);
        if (!squadronResult.success) {
          console.error('❌ Failed to assign squadron:', squadronResult.error);
          // Don't throw error - pilot was created successfully, just log the squadron assignment failure
          setSaveError('Pilot created but squadron assignment failed. Please assign manually.');
        } else {
        }
      }
      
      // Step 3: Assign role if selected
      if (newPilot.role_id) {
        const roleResult = await updatePilotRole(data.id, newPilot.role_id);
        if (!roleResult.success) {
          console.error('❌ Failed to assign role:', roleResult.error);
          // Don't throw error - pilot was created successfully, just log the role assignment failure
          setSaveError(prev => prev ? prev + ' Role assignment also failed.' : 'Pilot created but role assignment failed. Please assign manually.');
        } else {
        }
      }
      
      // Refresh pilots to get the new one with correct status and standing data
      if (data) {
        await refreshPilots();
        
        // Find and select the newly created pilot
        setTimeout(() => {
          const createdPilot = pilots.find(p => p.callsign === data.callsign);
          if (createdPilot) {
            setSelectedPilot(createdPilot);
          }
        }, 100);
        
        // Reset states
        setIsAddingNewPilot(false);
        setNewPilot({
          id: '',
          callsign: '',
          boardNumber: '',
          discordUsername: '',
          status_id: '',
          standing_id: '',
          squadron_id: '',
          role_id: '',
          qualifications: []
        });
        
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
              // Just use refreshPilots() instead of manual conversion
              await refreshPilots();
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
          standing_id: '',
          squadron_id: '',
          role_id: '',
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
      standing_id: '',
      squadron_id: '',
      role_id: '',
      qualifications: []
    });
    setSelectedPilot(null);
    setSaveError(null);
  };

  // Function to handle pilot status change
  const handleStatusChange = useCallback(async (statusId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingStatus(true);
    
    try {
      const { data, error } = await assignPilotStatus(selectedPilot.id, statusId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data) {
        // Refresh pilots to get updated status information
        await refreshPilots();
      }
    } catch (err: any) {
      console.error('Error updating pilot status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  }, [selectedPilot]);

  // Function to handle pilot standing change
  const handleStandingChange = useCallback(async (standingId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingStanding(true);
    
    try {
      const { data, error } = await assignPilotStanding(selectedPilot.id, standingId);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data) {
        // Refresh pilots to get updated standing information
        await refreshPilots();
      }
    } catch (err: any) {
      console.error('Error updating pilot standing:', err);
    } finally {
      setUpdatingStanding(false);
    }
  }, [selectedPilot]);

  // Function to check for role conflicts when changing squadrons
  const checkSquadronRoleConflicts = async (pilotId: string, newSquadronId: string): Promise<{
    hasConflict: boolean;
    conflictingPilot?: string;
    conflictingRole?: string;
  }> => {
    if (!newSquadronId) return { hasConflict: false };
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(pilotId);
      
      // Get the pilot's current role
      const pilotRole = selectedPilot?.roles?.[0]?.role;
      if (!pilotRole?.isExclusive) {
        return { hasConflict: false };
      }
      
      // Check if any pilot in the target squadron has the same exclusive role
      const { data: squadronPilots, error } = await supabase
        .from('pilot_assignments')
        .select(`
          pilot_id,
          pilots!inner (
            id,
            callsign,
            discord_original_id
          )
        `)
        .eq('squadron_id', newSquadronId)
        .is('end_date', null);
        
      if (error) {
        console.error('❌ Error checking squadron pilots:', error);
        return { hasConflict: false };
      }
      
      if (!squadronPilots || squadronPilots.length === 0) {
        return { hasConflict: false };
      }
      
      // Get role assignments for all pilots in the target squadron
      const squadronPilotIds = squadronPilots.map(p => p.pilot_id);
      
      const { data: roleAssignments, error: roleError } = await supabase
        .from('pilot_roles')
        .select(`
          pilot_id,
          role_id,
          roles!inner (
            id,
            name,
            isExclusive
          )
        `)
        .in('pilot_id', squadronPilotIds)
        .eq('role_id', pilotRole.id)
        .is('end_date', null);
        
      if (roleError) {
        console.error('❌ Error checking role assignments:', roleError);
        return { hasConflict: false };
      }
      
      // Find conflicts (excluding the current pilot and considering only active pilots)
      const conflictingAssignments = roleAssignments?.filter(assignment => assignment.pilot_id !== actualPilotId) || [];
      
      if (conflictingAssignments.length > 0) {
        // Check if any of the conflicting pilots are active
        const conflictingPilotIds = conflictingAssignments.map(assignment => assignment.pilot_id);
        
        const { data: activeConflictingPilots, error: activeError } = await supabase
          .from('pilot_statuses')
          .select(`
            pilot_id,
            statuses!inner (
              isActive
            )
          `)
          .in('pilot_id', conflictingPilotIds)
          .eq('statuses.isActive', true)
          .is('end_date', null);
          
          
        if (!activeError && activeConflictingPilots && activeConflictingPilots.length > 0) {
          // Find the first active conflicting pilot
          const activeConflictId = activeConflictingPilots[0].pilot_id;
          const conflictingPilot = squadronPilots.find(p => p.pilot_id === activeConflictId);
          
          
          return {
            hasConflict: true,
            conflictingPilot: conflictingPilot?.pilots?.callsign || 'Unknown',
            conflictingRole: pilotRole.name
          };
        } else {
        }
      } else {
      }
      
      return { hasConflict: false };
      
    } catch (error) {
      console.error('Error checking squadron role conflicts:', error);
      return { hasConflict: false };
    }
  };

  // Function to handle pilot squadron change
  const handleSquadronChange = useCallback(async (squadronId: string) => {
    if (!selectedPilot) {
      return;
    }
    
    
    // Check for role conflicts before proceeding
    if (squadronId) {
      const conflict = await checkSquadronRoleConflicts(selectedPilot.id, squadronId);
      
      if (conflict.hasConflict) {
        setSquadronConflictWarning({
          show: true,
          pilotData: { pilotId: selectedPilot.id, squadronId },
          conflictingPilot: conflict.conflictingPilot,
          conflictingRole: conflict.conflictingRole
        });
        return;
      }
    }
    
    // Proceed with the squadron change
    await executeSquadronChange(selectedPilot.id, squadronId);
  }, [selectedPilot]);

  // Function to execute the squadron change
  const executeSquadronChange = async (pilotId: string, squadronId: string) => {
    setUpdatingSquadron(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(pilotId);
      
      // Normalize squadronId - treat empty string, 'null', or null as unassignment
      const normalizedSquadronId = (squadronId && squadronId !== '' && squadronId !== 'null') ? squadronId : null;
      
      console.log('Executing squadron change:', { pilotId, squadronId, normalizedSquadronId });
      
      // Assign pilot to squadron (or unassign if squadronId is null)
      const { success, error } = await assignPilotToSquadron(
        actualPilotId, 
        normalizedSquadronId
      );
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (success) {
        // Immediately update local state to reflect the change
        const updatedSquadron = normalizedSquadronId ? squadrons.find(s => s.id === normalizedSquadronId) : null;
        
        setPilots(prevPilots => 
          prevPilots.map(pilot => {
            if (pilot.id === selectedPilot?.id) {
              return {
                ...pilot,
                currentSquadron: updatedSquadron
              } as Pilot;
            }
            return pilot;
          })
        );
        
        if (selectedPilot) {
          setSelectedPilot(prev => ({
            ...prev!,
            currentSquadron: updatedSquadron
          } as Pilot));
        }
        
        // Also refresh from database to ensure consistency
        setTimeout(async () => {
          await refreshPilots();
          await refreshSelectedPilot(actualPilotId);
        }, 500);
      }
    } catch (err: any) {
      console.error('Error updating pilot squadron:', err);
    } finally {
      setUpdatingSquadron(false);
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
      
      // Get pilot's role assignments from the join table
      const { data: roleAssignments, error: roleError } = await supabase
        .from('pilot_roles')
        .select(`
          *,
          roles:role_id (
            id,
            name,
            isExclusive,
            compatible_statuses,
            order
          )
        `)
        .eq('pilot_id', actualPilotId)
        .is('end_date', null)  // Only active roles
        .order('effective_date', { ascending: false })
        .limit(1);
        
      if (roleError) {
        throw new Error(roleError.message);
      }
      
      if (roleAssignments && roleAssignments.length > 0 && roleAssignments[0].roles) {
        setPilotRoles([roleAssignments[0].roles]);
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

      // Get current pilot's squadron
      const currentPilotSquadronId = (selectedPilot as any)?.currentSquadron?.id;

      // For each exclusive role, check if it's already assigned to any pilot IN THE SAME SQUADRON
      for (const role of exclusiveRoles) {
        // Query for all active role assignments for this role with pilot and squadron info
        const { data, error } = await supabase
          .from('pilot_roles')
          .select(`
            pilot_id,
            pilots!inner (
              id
            )
          `)
          .eq('role_id', role.id)
          .is('end_date', null); // Only active assignments
          
        if (error) {
          console.error('Error checking role assignments:', error);
          continue;
        }
        
        if (data && data.length > 0) {
          // Get squadron assignments for all pilots with this role
          const pilotIds = data.map(assignment => assignment.pilot_id);
          
          const { data: squadronData, error: squadronError } = await supabase
            .from('pilot_assignments')
            .select('pilot_id, squadron_id')
            .in('pilot_id', pilotIds)
            .is('end_date', null);
            
          if (squadronError) {
            console.error('Error checking squadron assignments:', squadronError);
            continue;
          }
          
          // Check if the role is assigned to someone else in the SAME squadron (considering only active pilots)
          let conflictInSameSquadron = false;
          if (squadronData && squadronData.length > 0) {
            // Get pilot IDs that are in the same squadron but not the current pilot
            const sameSquadronOtherPilots = squadronData
              .filter(squadronAssignment => 
                squadronAssignment.squadron_id === currentPilotSquadronId &&
                squadronAssignment.pilot_id !== currentPilotId
              )
              .map(assignment => assignment.pilot_id);
              
            if (sameSquadronOtherPilots.length > 0) {
              // Check if any of these pilots are active
              const { data: activePilots, error: activeError } = await supabase
                .from('pilot_statuses')
                .select(`
                  pilot_id,
                  statuses!inner (
                    isActive
                  )
                `)
                .in('pilot_id', sameSquadronOtherPilots)
                .eq('statuses.isActive', true)
                .is('end_date', null);
                
              if (!activeError && activePilots && activePilots.length > 0) {
                conflictInSameSquadron = true;
              }
            }
          }
          
          // Check if the role is assigned to the current pilot (should remain enabled)
          const isAssignedToCurrentPilot = currentPilotId && 
            data.some(assignment => assignment.pilot_id === currentPilotId);
          
          // Disable the role if it's assigned to someone else in the same squadron
          // OR if current pilot has no squadron and role is assigned to anyone
          if (conflictInSameSquadron || (!currentPilotSquadronId && !isAssignedToCurrentPilot && data.length > 0)) {
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
  const handleRoleChange = useCallback(async (roleId: string) => {
    if (!selectedPilot) return;
    
    setUpdatingRoles(true);
    
    try {
      // Get the actual UUID
      const actualPilotId = await getActualPilotId(selectedPilot.id);
      
      // If empty selection, remove the current role
      if (!roleId || roleId === "") {
        console.log("Removing role (empty selection)");
        
        // Get current pilot roles and end them
        const currentRoles = pilotRoles || [];
        if (currentRoles.length > 0) {
          // End all current role assignments
          const endDate = new Date().toISOString().split('T')[0];
          const { error } = await supabase
            .from('pilot_roles')
            .update({ 
              end_date: endDate,
              updated_at: new Date().toISOString()
            })
            .eq('pilot_id', actualPilotId)
            .is('end_date', null);
          
          if (error) {
            console.error("Error ending role assignments:", error);
            throw new Error(error.message);
          }
        }
        
        // Update local state
        setPilotRoles([]);
        // Refresh pilot data to get updated role information from database
        await refreshPilots();
        
        // Refresh exclusive role assignments after removing a role
        fetchExclusiveRoleAssignments();
        return;
      }
      
      // Check if the role is exclusive
      const selectedRole = roles.find(r => r.id === roleId);
      
      if (selectedRole?.isExclusive) {
        // For exclusive roles, check if it's already assigned to someone else IN THE SAME SQUADRON
        const { data, error } = await supabase
          .from('pilot_roles')
          .select('pilot_id')
          .eq('role_id', roleId)
          .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
          
        if (error) {
          throw new Error(`Error checking role assignments: ${error.message}`);
        }
        
        // If assigned to someone other than the current pilot, check squadron conflicts
        if (data && data.length > 0) {
          const otherAssignments = data.filter(assignment => assignment.pilot_id !== actualPilotId);
          
          if (otherAssignments.length > 0) {
            // Get current pilot's squadron
            const currentPilotSquadronId = (selectedPilot as any)?.currentSquadron?.id;
            
            // Get squadron assignments for pilots with this role
            const otherPilotIds = otherAssignments.map(assignment => assignment.pilot_id);
            
            const { data: squadronData, error: squadronError } = await supabase
              .from('pilot_assignments')
              .select('pilot_id, squadron_id')
              .in('pilot_id', otherPilotIds)
              .is('end_date', null);
              
            if (squadronError) {
              throw new Error(`Error checking squadron assignments: ${squadronError.message}`);
            }
            
            // Check if any ACTIVE pilot with this role is in the same squadron
            let conflictInSameSquadron = false;
            if (squadronData && squadronData.length > 0) {
              const conflictingPilotIds = squadronData
                .filter(squadronAssignment => squadronAssignment.squadron_id === currentPilotSquadronId)
                .map(assignment => assignment.pilot_id);
                
              if (conflictingPilotIds.length > 0) {
                // Check if any of these pilots are active
                const { data: activeConflictingPilots, error: activeConflictError } = await supabase
                  .from('pilot_statuses')
                  .select(`
                    pilot_id,
                    statuses!inner (
                      isActive
                    )
                  `)
                  .in('pilot_id', conflictingPilotIds)
                  .eq('statuses.isActive', true)
                  .is('end_date', null);
                  
                if (!activeConflictError && activeConflictingPilots && activeConflictingPilots.length > 0) {
                  conflictInSameSquadron = true;
                }
              }
            }
            
            if (conflictInSameSquadron) {
              alert(`Cannot assign this role. It is exclusive and already assigned to another pilot in the same squadron.`);
              return;
            } else if (!currentPilotSquadronId) {
              alert(`Cannot assign this role. Pilot must be assigned to a squadron first for exclusive role assignments.`);
              return;
            }
          }
        }
      }
      
      // Get the role name to update the UI immediately
      const roleToAssign = roles.find(r => r.id === roleId);
      
      // Assign the role using the new pilot_roles table
      const { success, error: assignError } = await updatePilotRole(actualPilotId, roleId);
      
      if (!success || assignError) {
        throw new Error(assignError?.message || 'Failed to assign role');
      }
      
      // If successful, refresh pilot data instead of updating local state
      if (roleToAssign) {
        setPilotRoles([roleToAssign]);
        
        // Small delay to ensure database commit before refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh pilot data to get updated role information from database
        await refreshPilots();
      }
      
      // Refresh exclusive role assignments after making an assignment
      fetchExclusiveRoleAssignments();
    } catch (err: any) {
      console.error('Error changing role:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingRoles(false);
    }
  }, [selectedPilot, pilotRoles, roles]);

  // Function to fetch all available qualifications
  const fetchAvailableQualifications = async () => {
    try {
      const { data, error } = await getAllQualifications();
      if (error) {
        throw new Error(error.message);
      }
      if (data) {
        setQualifications(data);
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

  // Callback for when a qualification is added via repair dialog
  const handleQualificationAddedViaRepair = (pilotId: string, qualificationData: any[]) => {
    
    // Update pilotQualifications if this is the selected pilot
    if (selectedPilot && selectedPilot.id === pilotId) {
      setPilotQualifications(qualificationData);
    }
    
    // Update allPilotQualifications for badge rendering
    setAllPilotQualifications(prev => ({
      ...prev,
      [pilotId]: qualificationData
    }));
    
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

      // Find the qualification object
      const qualToAdd = availableQualifications.find(q => q.id === selectedQualification);
      if (!qualToAdd) {
        throw new Error('Selected qualification not found');
      }

      // Check if qualification already exists BEFORE attempting to add
      const existingQual = pilotQualifications.find(pq => pq.qualification_id === selectedQualification);
      if (existingQual) {
        throw new Error(`Pilot already has the "${qualToAdd.name}" qualification`);
      }

      console.log('Adding qualification:', {
        pilotId: actualPilotId,
        qualificationId: selectedQualification,
        qualificationName: qualToAdd.name,
        achievedDate: achievedDate?.toISOString()
      });

      // Assign qualification to database FIRST (no optimistic update)
      const { data, error } = await assignQualificationToPilot(
        actualPilotId,
        selectedQualification,
        null, // No expiry date initially
        achievedDate
      );

      if (error) {
        console.error('Database error adding qualification:', error);

        // Handle specific duplicate key error
        if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
          throw new Error(`This qualification is already assigned to the pilot. Please refresh the page and try again.`);
        }

        throw new Error(error.message || 'Failed to add qualification to database');
      }

      console.log('Qualification added to database successfully:', data);
      
      // Clear cache to ensure we get fresh qualification data
      clearPilotQualificationsCache(selectedPilot.id);
      clearPilotQualificationsCache(actualPilotId);
      
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

      // Store original qualifications for rollback
      const originalQuals = [...pilotQualifications];

      // Remove qualification from database FIRST (no optimistic update)
      const { success, error } = await removeQualificationFromPilot(actualPilotId, qualificationId);

      if (error) {
        console.error('Database error removing qualification:', error);
        throw new Error(error.message || 'Database error occurred');
      }

      if (!success) {
        throw new Error('Failed to remove qualification from database');
      }

      // Only update UI after successful database removal
      const updatedQuals = originalQuals.filter(
        pq => pq.qualification_id !== qualificationId
      );
      setPilotQualifications(updatedQuals);

      // Also update allPilotQualifications for badge rendering
      setAllPilotQualifications(prev => ({
        ...prev,
        [selectedPilot.id]: updatedQuals,
        [actualPilotId]: updatedQuals
      }));

      console.log('Qualification removed successfully');
    } catch (err: any) {
      console.error('Error removing qualification:', err);
      alert(`Error removing qualification: ${err.message}`);

      // Force refresh qualifications from database to ensure UI is in sync
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
      // Get actual pilot ID if this is a discord ID (will be used in extracted function)
      // const actualPilotId = await getActualPilotId(updatedPilot.id);
      
      // Check for squadron conflicts before saving if squadron has changed
      const originalPilot = pilots.find(p => p.id === updatedPilot.id);
      const squadronChanged = (originalPilot as any)?.currentSquadron?.id !== (updatedPilot as any)?.currentSquadron?.id;
      
      if (squadronChanged && (updatedPilot as any)?.currentSquadron?.id && updatedPilot.roles?.[0]?.role?.isExclusive) {
        const conflict = await checkSquadronRoleConflicts(updatedPilot.id, (updatedPilot as any).currentSquadron.id);
        
        if (conflict.hasConflict) {
          
          return new Promise((resolve) => {
            setSquadronConflictWarning({
              show: true,
              pilotData: updatedPilot,
              conflictingPilot: conflict.conflictingPilot,
              conflictingRole: conflict.conflictingRole,
              onCancel: () => {
                setSquadronConflictWarning({ show: false, pilotData: null });
                resolve({ success: false, error: 'Save cancelled by user' });
              },
              onAcceptDuplicate: async () => {
                setSquadronConflictWarning({ show: false, pilotData: null });
                // Proceed with save, allowing duplicate roles
                const result = await executeSavePilotChanges(updatedPilot, true);
                resolve(result);
              },
              onReplaceIncumbent: async () => {
                setSquadronConflictWarning({ show: false, pilotData: null });
                // First remove the role from the conflicting pilot, then save
                await removeRoleFromConflictingPilot((updatedPilot as any).currentSquadron!.id, updatedPilot.roles![0].role!.id);
                const result = await executeSavePilotChanges(updatedPilot, false);
                resolve(result);
              }
            });
          });
        }
      }
      
      // No conflicts, proceed with normal save
      return await executeSavePilotChanges(updatedPilot, false);
    } catch (err: any) {
      console.error('Error in handleSavePilotChanges:', err);
      return { success: false, error: err.message || 'An error occurred while saving changes' };
    }
  };
  
  // Helper function to remove role from conflicting pilot
  const removeRoleFromConflictingPilot = async (squadronId: string, roleId: string) => {
    try {
      // Get pilots in the squadron with this role
      const { data: squadronPilots, error: squadronError } = await supabase
        .from('pilot_assignments')
        .select(`
          pilot_id,
          pilots (
            id,
            callsign
          )
        `)
        .eq('squadron_id', squadronId)
        .is('end_date', null);
      
      if (squadronError || !squadronPilots) return;
      
      const pilotIds = squadronPilots.map(p => p.pilot_id);
      
      // Get role assignments for these pilots
      const { data: roleAssignments, error: roleError } = await supabase
        .from('pilot_roles')
        .select('pilot_id')
        .eq('role_id', roleId)
        .in('pilot_id', pilotIds)
        .is('end_date', null);
      
      if (roleError || !roleAssignments || roleAssignments.length === 0) return;
      
      // End the role assignments for conflicting pilots
      const { error: endError } = await supabase
        .from('pilot_roles')
        .update({ 
          end_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .eq('role_id', roleId)
        .in('pilot_id', roleAssignments.map(r => r.pilot_id))
        .is('end_date', null);
      
      if (endError) {
        console.error('Error removing role from conflicting pilot:', endError);
      }
    } catch (error) {
      console.error('Error in removeRoleFromConflictingPilot:', error);
    }
  };
  
  // Extracted save logic function
  const executeSavePilotChanges = async (updatedPilot: Pilot, _allowDuplicates?: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      const actualPilotId = await getActualPilotId(updatedPilot.id);
      
      // Prepare update payload - only include fields that can be updated directly
      const updatePayload: any = {
        callsign: updatedPilot.callsign,
        boardNumber: parseInt(updatedPilot.boardNumber),
        discordId: updatedPilot.discordUsername || undefined
        // Note: role is handled separately
        // Note: status and standing are now handled via join tables, not direct updates
      };
      
      // Update pilot basic info
      const { error } = await updatePilot(actualPilotId, updatePayload);
      
      if (error) {
        throw new Error(error.message || 'Failed to update pilot');
      }

      // Handle status updates via join table if status has changed
      if (updatedPilot.currentStatus?.id) {
        const { error: statusError } = await assignPilotStatus(actualPilotId, updatedPilot.currentStatus.id);
        if (statusError) {
          console.error('Error updating pilot status during save:', statusError);
          // Don't throw here - pilot was saved, just status update failed
        }
      }

      // Handle standing updates via join table if standing has changed  
      if (updatedPilot.currentStanding?.id) {
        const { error: standingError } = await assignPilotStanding(actualPilotId, updatedPilot.currentStanding.id);
        if (standingError) {
          console.error('Error updating pilot standing during save:', standingError);
          // Don't throw here - pilot was saved, just standing update failed
        }
      }

      // Handle squadron updates via join table if squadron has changed
      const originalPilot = pilots.find(p => p.id === updatedPilot.id);
      const originalSquadronId = (originalPilot as any)?.currentSquadron?.id;
      const newSquadronId = (updatedPilot as any)?.currentSquadron?.id || (updatedPilot as any)?.squadronAssignment?.squadron_id;
      const squadronChanged = originalSquadronId !== newSquadronId;
      
      if (squadronChanged) {
        const { error: squadronError } = await assignPilotToSquadron(actualPilotId, newSquadronId || null);
        if (squadronError) {
          console.error('Error updating pilot squadron during save:', squadronError);
          // Don't throw here - pilot was saved, just squadron update failed
        }
      }

      // Handle role updates - check pilot roles array instead of role field
      const currentRole = updatedPilot.roles?.[0]?.role;
      if (!currentRole || !currentRole.id) {
        // If no role is selected, end any existing role assignments
        const { error: endRoleError } = await supabase
          .from('pilot_roles')
          .update({ 
            end_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          })
          .eq('pilot_id', actualPilotId)
          .is('end_date', null);
        
        if (endRoleError) {
          console.error("Error ending role assignments during save:", endRoleError);
          throw new Error(endRoleError.message || 'Failed to remove pilot role');
        }
      } else {
        // Find the role ID based on the current role
        const currentRoleName = currentRole.name;
        const matchingRole = roles.find(r => r.name === currentRoleName);
        const roleId = matchingRole?.id || null;
        
        if (roleId) {
          // Update to a specific role - use appropriate function based on allowDuplicates
          const { error: roleError } = _allowDuplicates 
            ? await updatePilotRoleAllowDuplicates(actualPilotId, roleId)
            : await updatePilotRole(actualPilotId, roleId);
          
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
    // Fetch all statuses, standings, roles, qualifications, and pilots simultaneously
    const fetchAllData = async () => {
      try {
        
        // Add timeout wrapper for all operations
        const withTimeout = function <T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
          return Promise.race([
            promise,
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
            )
          ]);
        };

        // Start all fetch operations in parallel with timeouts
        const [statusResult, standingResult, roleResult, squadronResult] = await withTimeout(
          Promise.all([
            getAllStatuses(),
            getAllStandings(), 
            getAllRoles(),
            getAllSquadrons()
          ]),
          10000
        );


        // Handle statuses
        if (statusResult.error) {
          console.error('Error fetching statuses:', statusResult.error);
        } else if (statusResult.data) {
          setStatuses(statusResult.data);
        }

        // Handle standings
        if (standingResult.error) {
          console.error('Error fetching standings:', standingResult.error);
        } else if (standingResult.data) {
          setStandings(standingResult.data);
        }
        
        // Handle roles
        if (roleResult.error) {
          console.error('Error fetching roles:', roleResult.error);
        } else if (roleResult.data) {
          setRoles(roleResult.data);
        }

        // Handle squadrons
        if (squadronResult.error) {
          console.error('Error fetching squadrons:', squadronResult.error);
        } else if (squadronResult.data) {
          setSquadrons(squadronResult.data);
        }

        // Fetch qualifications with timeout
        try {
          await withTimeout(fetchAvailableQualifications(), 8000);
        } catch (qualErr) {
          console.error('Error fetching qualifications (continuing anyway):', qualErr);
        }

        // Fetch pilots with timeout
        try {
          await withTimeout(refreshPilots(), 10000);
        } catch (pilotsErr) {
          console.error('Error fetching pilots (stopping loading anyway):', pilotsErr);
          setLoading(false);
        }
        
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setLoading(false); // Ensure loading is stopped even on error
      }
    };

    fetchAllData();
  }, []);

  useEffect(() => {
    // Subscribe to real-time updates for pilots table
    const subscription = subscribeToTable('pilots', () => {
      // Update the pilots list when changes occur
      refreshPilots();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // No dependencies needed since refreshPilots doesn't depend on statusMap anymore

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

  // Memoized PilotDetails components for performance optimization
  const memoizedNewPilotDetails = useMemo(() => (
    <PilotDetails
      selectedPilot={selectedPilot}
      statuses={statuses}
      standings={standings}
      roles={roles}
      pilotRoles={pilotRoles}
      squadrons={squadrons}
      availableQualifications={availableQualifications}
      pilotQualifications={pilotQualifications}
      loadingRoles={loadingRoles}
      updatingRoles={updatingRoles}
      updatingStatus={updatingStatus}
      updatingStanding={updatingStanding}
      updatingSquadron={updatingSquadron}
      loadingQualifications={loadingQualifications}
      disabledRoles={disabledRoles}
      selectedQualification={selectedQualification}
      qualificationAchievedDate={qualificationAchievedDate}
      isAddingQualification={isAddingQualification}
      updatingQualifications={updatingQualifications}
      setSelectedQualification={setSelectedQualification}
      setQualificationAchievedDate={setQualificationAchievedDate}
      handleStatusChange={(statusId) => handleNewPilotChange('status_id', statusId)}
      handleStandingChange={(standingId) => handleNewPilotChange('standing_id', standingId)}
      handleRoleChange={handleRoleChange}
      handleSquadronChange={handleSquadronChange}
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
  ), [selectedPilot, statuses, standings, roles, pilotRoles, squadrons, availableQualifications, pilotQualifications, loadingRoles, updatingRoles, updatingStatus, updatingStanding, updatingSquadron, loadingQualifications, disabledRoles, selectedQualification, qualificationAchievedDate, isAddingQualification, updatingQualifications, handleRoleChange, handleSquadronChange, handleAddQualification, handleRemoveQualification, handleDeletePilot, handleSavePilotChanges, handleClearDiscord, handleNewPilotChange, handleSaveNewPilot, handleCancelAddPilot, isSavingNewPilot, saveError]);

  const memoizedSelectedPilotDetails = useMemo(() => (
    <PilotDetails
      selectedPilot={selectedPilot}
      statuses={statuses}
      standings={standings}
      roles={roles}
      pilotRoles={pilotRoles}
      squadrons={squadrons}
      availableQualifications={availableQualifications}
      pilotQualifications={pilotQualifications}
      loadingRoles={loadingRoles}
      updatingRoles={updatingRoles}
      updatingStatus={updatingStatus}
      updatingStanding={updatingStanding}
      updatingSquadron={updatingSquadron}
      loadingQualifications={loadingQualifications}
      disabledRoles={disabledRoles}
      selectedQualification={selectedQualification}
      qualificationAchievedDate={qualificationAchievedDate}
      isAddingQualification={isAddingQualification}
      updatingQualifications={updatingQualifications}
      setSelectedQualification={setSelectedQualification}
      setQualificationAchievedDate={setQualificationAchievedDate}
      handleStatusChange={handleStatusChange}
      handleStandingChange={handleStandingChange}
      handleRoleChange={handleRoleChange}
      handleSquadronChange={handleSquadronChange}
      handleAddQualification={handleAddQualification}
      handleRemoveQualification={handleRemoveQualification}
      handleDeletePilot={handleDeletePilot}
      handleSavePilotChanges={handleSavePilotChanges}
      handleClearDiscord={handleClearDiscord}
      isNewPilot={false}
      onQualificationAdded={handleQualificationAddedViaRepair}
    />
  ), [selectedPilot, statuses, standings, roles, pilotRoles, squadrons, availableQualifications, pilotQualifications, loadingRoles, updatingRoles, updatingStatus, updatingStanding, updatingSquadron, loadingQualifications, disabledRoles, selectedQualification, qualificationAchievedDate, isAddingQualification, updatingQualifications, handleStatusChange, handleStandingChange, handleRoleChange, handleSquadronChange, handleAddQualification, handleRemoveQualification, handleDeletePilot, handleSavePilotChanges, handleClearDiscord, handleQualificationAddedViaRepair]);

  return (
    <div style={rosterStyles.container}>
      {/* Discord import modal */}
      <DiscordPilotsDialog 
        isOpen={isDiscordImportOpen} 
        onClose={() => setIsDiscordImportOpen(false)}
        onComplete={handleDiscordSyncComplete}
      />
      
      {/* Squadron conflict warning dialog */}
      {squadronConflictWarning.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              padding: '24px',
              borderRadius: '8px',
              width: '500px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#374151' }}>
              Role Conflict Detected
            </h2>
            <p style={{ marginBottom: '16px', color: '#374151', lineHeight: '1.5' }}>
              The pilot <strong>{squadronConflictWarning.conflictingPilot}</strong> already has the{' '}
              <strong>{squadronConflictWarning.conflictingRole}</strong> role in the target squadron.
            </p>
            <p style={{ marginBottom: '24px', color: '#64748B', fontSize: '14px' }}>
              How would you like to proceed?
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <button
                onClick={() => {
                  squadronConflictWarning.onCancel?.();
                  setSquadronConflictWarning({ show: false, pilotData: null });
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: '#F9FAFB',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  squadronConflictWarning.onAcceptDuplicate?.();
                  setSquadronConflictWarning({ show: false, pilotData: null });
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #2563EB',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Accept Duplicate Roles
              </button>
              <button
                onClick={() => {
                  squadronConflictWarning.onReplaceIncumbent?.();
                  setSquadronConflictWarning({ show: false, pilotData: null });
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #DC2626',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Replace Incumbent
              </button>
            </div>
          </div>
        </div>
      )}
      
      {loading && !pilots.length ? (
        <StandardPageLoader message="Loading roster data..." />
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
            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Roster</h2>
            
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
              standings={standings}
              squadrons={squadrons}
              roles={roles}
              qualifications={qualifications}
              selectedPilot={selectedPilot}
              hoveredPilot={hoveredPilot}
              selectedSquadronIds={selectedSquadronIds}
              selectedStatusIds={selectedStatusIds}
              selectedStandingIds={selectedStandingIds}
              selectedRoleIds={selectedRoleIds}
              selectedQualificationIds={selectedQualificationIds}
              filtersEnabled={filtersEnabled}
              allPilotQualifications={allPilotQualifications}
              setSelectedPilot={isAddingNewPilot ? undefined : setSelectedPilot}
              setHoveredPilot={setHoveredPilot}
              setSelectedSquadronIds={setSelectedSquadronIds}
              setSelectedStatusIds={setSelectedStatusIds}
              setSelectedStandingIds={setSelectedStandingIds}
              setSelectedRoleIds={setSelectedRoleIds}
              setSelectedQualificationIds={setSelectedQualificationIds}
              setFiltersEnabled={setFiltersEnabled}
              onAddPilot={handleAddPilot}
              isAddingNewPilot={isAddingNewPilot}
            />

            {/* Right column - Pilot Details */}
            {isAddingNewPilot ? (
              memoizedNewPilotDetails
            ) : (
              memoizedSelectedPilotDetails
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RosterManagement;