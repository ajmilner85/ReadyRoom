import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card } from '../card';
import AddSupportRoleDialog from '../dialogs/AddSupportRoleDialog';
import SupportRoleAssignmentCard from '../flight cards/SupportRoleAssignmentCard';
import type { Pilot } from '../../../types/PilotTypes';
import { cleanRoleId } from '../../../utils/dragDropUtils';
import { SupportRoleType } from '../../../types/SupportRoleTypes';
import { AddSupportRoleDialogData } from '../../../types/DialogTypes';
import { fetchCarriers } from '../../../utils/supabaseClient';
import { SupportRole, ensureSupportRolesInAssignedPilots } from '../../../utils/supportRoleUtils';
import type { Mission, SupportRoleAssignment } from '../../../types/MissionTypes';

// Interface for fetched carrier data
interface CarrierData {
  id: string;
  name: string;
  hull: string;
}

// Extended Pilot type with additional properties for assignment
interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative' | 'declined';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
}

interface MissionSupportAssignmentsProps {
  width: string;
  assignedPilots?: Record<string, AssignedPilot[]> | null;
  setAssignedPilots?: (value: React.SetStateAction<Record<string, AssignedPilot[]>>) => void;
  mission?: Mission | null;
  updateSupportRoles?: (roles: SupportRoleAssignment[]) => Promise<boolean>;
  activePilots?: Pilot[];
  selectedEventId?: string; // Used to validate mission belongs to correct event
}

const MissionSupportAssignments: React.FC<MissionSupportAssignmentsProps> = ({
  width,
  assignedPilots = {},
  setAssignedPilots,
  mission,
  updateSupportRoles,
  activePilots,
  selectedEventId
}) => {
  const [supportRoles, setSupportRoles] = useState<SupportRole[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  const [allCarriers, setAllCarriers] = useState<CarrierData[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const lastLoadedMissionIdRef = useRef<string | null>(null);

  // Load supportRoles from mission database
  useEffect(() => {
    // If no mission, clear support roles
    if (!mission) {
      console.log('[MISSION-SUPPORT] No mission, clearing support roles');
      setSupportRoles([]);
      setCreationOrderCounter(0);
      lastLoadedMissionIdRef.current = null;
      return;
    }

    // CRITICAL: Validate mission belongs to the currently selected event
    // This prevents loading stale mission data during rapid event switching
    if (selectedEventId && mission.event_id && mission.event_id !== selectedEventId) {
      console.warn('[MISSION-SUPPORT] Skipping load - mission belongs to different event:', {
        missionEventId: mission.event_id,
        selectedEventId: selectedEventId,
        missionId: mission.id
      });
      return;
    }

    // Skip if we've already loaded this mission
    if (mission.id === lastLoadedMissionIdRef.current) {
      return;
    }

    console.log('[MISSION-SUPPORT] Loading support roles from mission:', mission.id);
    lastLoadedMissionIdRef.current = mission.id;

    // Convert database support_role_assignments to UI format
    if (mission.support_role_assignments && Array.isArray(mission.support_role_assignments)) {
      // Get pilot assignments to enrich support role pilot data
      const pilotAssignmentsMap = mission.pilot_assignments as Record<string, any[]> || {};
      
      const roles: SupportRole[] = mission.support_role_assignments
        .filter(role => role.role_type !== 'mission_commander') // Filter out mission commander
        .map((role, index) => {
          const roleData = role as any;
          const roleId = roleData.id || `support-${role.role_type}-${Date.now()}-${index}`;
          
          // Get pilot assignments for this support role to get full pilot data
          const rolePilotAssignments = pilotAssignmentsMap[roleId] || [];
          
          // Merge pilot data from support_role_assignments with actual assignments
          const enrichedPilots = (roleData.pilots || []).map((pilot: any, _pilotIndex: number) => {
            // Find the corresponding pilot assignment by dash number
            const assignment = rolePilotAssignments.find((a: any) => a.dash_number === pilot.dashNumber);
            
            if (assignment && assignment.pilot_id) {
              // Look up the full pilot data from assignedPilots first (has fresh attendance/rollCall status)
              const assignedPilot = assignedPilots?.[roleId]?.find(p => p.dashNumber === pilot.dashNumber);
              
              if (assignedPilot) {
                // Use pilot from assignedPilots which has current attendance/rollCall status
                return assignedPilot;
              }
              
              // Fallback to activePilots if not in assignedPilots yet
              if (activePilots) {
                const fullPilot = activePilots.find(p => p.id === assignment.pilot_id);
                if (fullPilot) {
                  return {
                    ...fullPilot,
                    dashNumber: pilot.dashNumber,
                    attendanceStatus: fullPilot.attendanceStatus,
                    rollCallStatus: fullPilot.rollCallStatus
                  };
                }
              }
            }
            
            // Fallback to basic pilot data from support_role_assignments
            return pilot;
          });
          
          return {
            id: roleId,
            callsign: roleData.callsign || 'UNKNOWN',
            pilots: enrichedPilots,
            creationOrder: roleData.creationOrder ?? index,
            carrier: roleData.carrier,
            slots: roleData.slots
          };
        });

      console.log('[MISSION-SUPPORT] Loaded roles from database:', roles);
      setSupportRoles(roles);

      // Update counter
      const maxOrder = Math.max(...roles.map(r => r.creationOrder), -1);
      setCreationOrderCounter(maxOrder + 1);
    } else {
      // No roles in database, start fresh
      console.log('[MISSION-SUPPORT] No support roles in database');
      setSupportRoles([]);
      setCreationOrderCounter(0);
    }
  }, [mission?.id]);

  // Sync assignedPilots changes back to supportRoles display
  useEffect(() => {
    if (!assignedPilots || supportRoles.length === 0) return;

    console.log('[SUPPORT-SYNC] Syncing assignedPilots to supportRoles');

    // Update each support role with fresh pilot data from assignedPilots
    const updatedRoles = supportRoles.map(role => {
      const assignedPilotsForRole = assignedPilots[role.id] || [];
      
      // Filter out empty pilots (placeholder slots)
      const realPilots = assignedPilotsForRole.filter(p => p.callsign && p.boardNumber);
      
      if (realPilots.length === 0) {
        // No real pilots for this role
        return role;
      }

      console.log('[SUPPORT-SYNC] Updating role:', {
        roleId: role.id,
        callsign: role.callsign,
        realPilotsCount: realPilots.length,
        currentPilotsCount: role.pilots.length
      });

      // Merge assigned pilots into role.pilots, preserving slot positions
      const updatedPilots = role.pilots.map(existingPilot => {
        const freshPilot = realPilots.find(p => p.dashNumber === existingPilot.dashNumber);
        if (freshPilot) {
          console.log('[SUPPORT-SYNC] Updated pilot in slot:', {
            dashNumber: existingPilot.dashNumber,
            callsign: freshPilot.callsign,
            attendanceStatus: freshPilot.attendanceStatus,
            rollCallStatus: freshPilot.rollCallStatus
          });
          return freshPilot;
        }
        return existingPilot;
      });

      // Add any new pilots that aren't in existing slots
      realPilots.forEach(assignedPilot => {
        if (!updatedPilots.some(p => p.dashNumber === assignedPilot.dashNumber)) {
          console.log('[SUPPORT-SYNC] Adding new pilot:', {
            dashNumber: assignedPilot.dashNumber,
            callsign: assignedPilot.callsign,
            attendanceStatus: assignedPilot.attendanceStatus
          });
          updatedPilots.push(assignedPilot);
        }
      });

      return {
        ...role,
        pilots: updatedPilots
      };
    });

    // Only update if there were actual changes
    if (JSON.stringify(updatedRoles) !== JSON.stringify(supportRoles)) {
      console.log('[SUPPORT-SYNC] Updating supportRoles state');
      setSupportRoles(updatedRoles);
    }
  }, [assignedPilots]);  // Whenever supportRoles change and assignedPilots exists, ensure empty support roles are preserved
  useEffect(() => {
    // Skip if no support roles or assigned pilots is external and can't be modified
    if (supportRoles.length === 0 || !assignedPilots || !setAssignedPilots) return;
    
    // Use our utility to ensure empty support roles are preserved in assignedPilots
    const assignedPilotsWithRoles = ensureSupportRolesInAssignedPilots(supportRoles, assignedPilots);

    // If there were changes, update the parent component's state
    if (Object.keys(assignedPilotsWithRoles).length !== Object.keys(assignedPilots).length) {
      setAssignedPilots((prev) => {
        return { ...prev, ...assignedPilotsWithRoles };
      });
    }
  }, [supportRoles, assignedPilots, setAssignedPilots]);

  // Fetch all carriers on component mount
  useEffect(() => {
    const loadCarriers = async () => {
      setCarriersLoading(true);
      try {
        const data = await fetchCarriers();
        setAllCarriers(data);
      } catch (error) {
        console.error("[CARRIER_FETCH] Error fetching carriers:", error);
      } finally { // Use finally to ensure loading state is set
        setCarriersLoading(false);
      }
    };
    loadCarriers();
  }, []);

  // Memoized map for quick carrier lookup by ID
  const carrierMap = useMemo(() => {
    const map = new Map<string, { hull: string; name: string }>();
    allCarriers.forEach(carrier => {
      map.set(carrier.id, { hull: carrier.hull, name: carrier.name });
    });
    return map;
  }, [allCarriers]); // Depends only on allCarriers

  // Save support roles to database
  const saveSupportRolesToDatabase = useCallback(async (roles: SupportRole[], missionIdToSave: string) => {
    if (!mission || !updateSupportRoles) {
      return;
    }
    
    // CRITICAL: Only save if the mission ID matches what we intend to save
    // This prevents cross-mission contamination during rapid switching
    if (mission.id !== missionIdToSave) {
      console.warn('[MISSION-SUPPORT] Skipping save - mission ID mismatch:', {
        currentMissionId: mission.id,
        intendedMissionId: missionIdToSave
      });
      return;
    }

    // Convert UI format to database format
    const dbRoles: SupportRoleAssignment[] = roles.map(role => ({
      role_type: role.id.includes('carrier') ? 'carrier_air_ops' : 'command_control',
      pilot_id: '', // Not used for these multi-slot roles
      // Store full role data as additional fields
      id: role.id,
      callsign: role.callsign,
      pilots: role.pilots,
      creationOrder: role.creationOrder,
      carrier: role.carrier,
      slots: role.slots
    } as any));

    try {
      await updateSupportRoles(dbRoles);
    } catch (error) {
      console.error('[MISSION-SUPPORT] Error saving support roles:', error);
    }
  }, [mission, updateSupportRoles]);

  // Save support roles to database whenever they change
  useEffect(() => {
    // Skip if no mission
    if (!mission) {
      return;
    }
    
    // Skip if roles are empty and we haven't loaded this mission's roles yet
    // (to avoid saving empty roles during initial load)
    if (supportRoles.length === 0 && lastLoadedMissionIdRef.current !== mission.id) {
      return;
    }

    // Capture the mission ID at the time this effect runs
    // This ensures we save to the correct mission even if the mission changes during the timeout
    const missionIdAtEffectTime = mission.id;

    // Debounce the save to avoid excessive database calls
    const timeoutId = setTimeout(() => {
      saveSupportRolesToDatabase(supportRoles, missionIdAtEffectTime);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [supportRoles, mission?.id, saveSupportRolesToDatabase]);

  // Function to handle adding or updating a support role
  const handleAddOrUpdateSupportRole = useCallback((data: AddSupportRoleDialogData) => {
    if (data.type === SupportRoleType.CARRIER_AIR_OPS) {
      const { hull, name, carrierId } = data;
      const displayCallsign = `${hull} ${name}`.toUpperCase();

      if (editRoleId) {
        // Update an existing role
        setSupportRoles(prevRoles => {
          const updatedRoles = prevRoles.map(role => {
            if (role.id === editRoleId) {
              return {
                ...role,
                callsign: displayCallsign,
                carrier: { hull, name, carrierId } // Update carrier info
              };
            }
            return role;
          });
          return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
        });
        setEditRoleId(null);
      } else {
        // Add a new support role
        const timestamp = Date.now().toString();
        const newRoleId = `support-carrier-${carrierId}-${timestamp}`;

        const newRole: SupportRole = {
          id: newRoleId,
          callsign: displayCallsign,
          pilots: [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ],
          creationOrder: creationOrderCounter,
          carrier: { hull, name, carrierId }
        };

        setSupportRoles(prev => {
          const updatedRoles = [...prev, newRole];
          return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
        });
      }
    } else if (data.type === SupportRoleType.COMMAND_CONTROL) {
      const { callsign, slots } = data;
      
      if (editRoleId) {
        // Update an existing Command & Control role
        setSupportRoles(prevRoles => {
          const updatedRoles = prevRoles.map(role => {
            if (role.id === editRoleId) {
              // Get the existing role's pilots to determine if we need to resize
              const existingPilots = role.pilots || [];
              const newSlots = slots || [];
              
              // Create a new pilots array matching the slots length
              // This ensures the number of pilots matches exactly the number of slots
              let updatedPilots = [...existingPilots];
              
              // Resize pilots array if needed
              if (newSlots.length !== existingPilots.length) {
                if (newSlots.length > existingPilots.length) {
                  // Add empty slots if needed
                  while (updatedPilots.length < newSlots.length) {
                    updatedPilots.push({
                      boardNumber: "",
                      callsign: "",
                      dashNumber: (updatedPilots.length + 1).toString()
                    });
                  }
                } else {
                  // Truncate if reducing slots
                  updatedPilots = updatedPilots.slice(0, newSlots.length);
                }
              }
              
              return {
                ...role,
                callsign: callsign || 'COMMAND & CONTROL',
                pilots: updatedPilots,
                slots: newSlots // Now safe to store slots
              };
            }
            return role;
          });
          return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
        });
        setEditRoleId(null);
      } else {
        // Add a new Command & Control role
        const timestamp = Date.now().toString();
        const newRoleId = `support-command-control-${timestamp}`;

        // Create pilots array based on number of slots - exactly matching slots
        const newSlots = slots || [];
        const pilotCount = newSlots.length || 1; // Ensure at least one slot
        const pilots = Array(pilotCount).fill(0).map((_, i) => ({ 
          boardNumber: "", 
          callsign: "", 
          dashNumber: (i + 1).toString() 
        }));

        const newRole: SupportRole = {
          id: newRoleId,
          callsign: callsign || 'COMMAND & CONTROL',
          pilots: pilots,
          slots: newSlots, // Store the slots
          creationOrder: creationOrderCounter
        };

        setSupportRoles(prev => {
          const updatedRoles = [...prev, newRole];
          return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
        });
      }
    }

    setCreationOrderCounter(counter => counter + 1);
    setShowAddDialog(false);
  }, [creationOrderCounter, editRoleId]);

  // Close the dialog without saving
  const handleCancelAddRole = useCallback(() => {
    setShowAddDialog(false);
    setEditRoleId(null);
  }, []);
  // Handle deleting a support role
  const handleDeleteRole = useCallback((id: string) => {
    setSupportRoles(prevRoles => {
      const updatedRoles = prevRoles.filter(role => role.id !== id);
      return updatedRoles;
    });

    // Also remove from assignedPilots to prevent the role from reappearing
    if (setAssignedPilots) {
      setAssignedPilots(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    }
  }, [setAssignedPilots]);
  // Handle initiating the edit of a support role
  const handleEditRole = useCallback((id: string) => {
    setEditRoleId(id);
    // Set appropriate dialog title based on role type
    setShowAddDialog(true);
  }, []);


  // Convert assignedPilots to supportRoles format, using fetched carrier data
  useEffect(() => {    // Explicitly wait for carriers to finish loading AND map to have entries if carriers exist
    if (carriersLoading || (allCarriers.length > 0 && carrierMap.size === 0)) {
      return; 
    }
    
    // If assignedPilots is empty, just clear the pilots in existing support roles without removing the roles
    if (!assignedPilots || Object.keys(assignedPilots).length === 0) {
      setSupportRoles(prev => {
        // Only keep roles if they belong to the current mission
        // If mission changed, prev roles are from the old mission - clear them
        if (prev.length > 0) {
          return prev.map(role => {
            const isCommandControl = role.id.includes('command-control');
            
            if (isCommandControl) {
              // Use the role's slots length if available, otherwise default to a reasonable length
              const slotsLength = role.slots?.length || 1;
              return {
                ...role,
                pilots: Array(slotsLength).fill(0).map((_, i) => ({
                  boardNumber: "",
                  callsign: "",
                  dashNumber: (i + 1).toString()
                }))
              };
            } else {
              // Standard 4 slots for Carrier Air Ops
              return {
                ...role,
                pilots: [
                  { boardNumber: "", callsign: "", dashNumber: "1" },
                  { boardNumber: "", callsign: "", dashNumber: "2" },
                  { boardNumber: "", callsign: "", dashNumber: "3" },
                  { boardNumber: "", callsign: "", dashNumber: "4" }
                ]
              };
            }
          });
        }
        return prev;
      });
      return;
    }
    
    setSupportRoles(prevRoles => {
        const updatedRoles: SupportRole[] = [];
        const processedRoleIds = new Set<string>(); 
        let maxOrder = -1;// Process roles from assignedPilots
      for (const [roleId, rolePilots] of Object.entries(assignedPilots)) {
        if (!roleId.startsWith('support-')) continue; 

        let existingRole = prevRoles.find(r => r.id === roleId);
        let targetRole: SupportRole;

        if (existingRole) {
          // Update existing role - Ensure carrier info is preserved or updated if needed
          targetRole = { ...existingRole }; 
          
          // If existing role somehow lacks carrier info but should have it, try reconstructing
          if (roleId.startsWith('support-carrier-') && !targetRole.carrier?.carrierId) {
             const idPart = cleanRoleId(targetRole.id).substring(16);
             const lastHyphenIndex = idPart.lastIndexOf('-');
             if (lastHyphenIndex > 0 && lastHyphenIndex === 36 && idPart.length > 37) {
                const extractedCarrierId = idPart.substring(0, lastHyphenIndex);
                const foundCarrier = carrierMap.get(extractedCarrierId);
                if (foundCarrier) {
                   targetRole.carrier = { ...foundCarrier, carrierId: extractedCarrierId };
                   targetRole.callsign = `${foundCarrier.hull} ${foundCarrier.name}`.toUpperCase();
                }
             }
          }
          maxOrder = Math.max(maxOrder, targetRole.creationOrder);
        } else {
          // Role exists in assignedPilots but not in current state - reconstruct it
          const cleanedRoleId = cleanRoleId(roleId);
          let callsign = 'SUPPORT ROLE'; 
          let carrierInfo: SupportRole['carrier'] = {};
          maxOrder++; 
          let creationOrder = maxOrder;

          if (cleanedRoleId.startsWith('support-carrier-')) {
            const idPart = cleanedRoleId.substring(16); 
            const lastHyphenIndex = idPart.lastIndexOf('-'); 

            // Check if the format looks like UUID-timestamp
            if (lastHyphenIndex > 0 && lastHyphenIndex === 36 && idPart.length > 37) { 
              const extractedCarrierId = idPart.substring(0, lastHyphenIndex); 

              const foundCarrier = carrierMap.get(extractedCarrierId); 
              
              if (foundCarrier) {
 
                callsign = `${foundCarrier.hull} ${foundCarrier.name}`.toUpperCase();
                carrierInfo = { ...foundCarrier, carrierId: extractedCarrierId }; 
              } else {
                console.warn(`[SYNC_EFFECT] Carrier ID "${extractedCarrierId}" not found in carrierMap for role ${roleId}.`); 
                callsign = `UNKNOWN CARRIER (ID: ${extractedCarrierId})`; 
                carrierInfo = { carrierId: extractedCarrierId };
              }
            } else {
               console.error(`[SYNC_EFFECT] Invalid roleId format or unable to extract UUID for carrier: ${roleId}`);
               callsign = 'INVALID CARRIER ROLE ID FORMAT';
               const potentialId = idPart.split('-')[0]; 
               carrierInfo = { carrierId: potentialId }; 
            }
          } else if (cleanedRoleId.startsWith('support-command-control-')) {
            // Handle Command & Control roles
            callsign = 'COMMAND & CONTROL';
          } else {
            // Handle legacy formats (best effort, might need adjustment)
            const parts = cleanedRoleId.substring(8).split('-');
            if (parts.length > 1 && parts[0].startsWith('CVN')) {
              const potentialHull = parts[0];
              const potentialName = parts.slice(1, -1).join(' ');
              if (potentialHull && potentialName) {
                callsign = `${potentialHull} ${potentialName}`.toUpperCase();
                carrierInfo = { hull: potentialHull, name: potentialName };
              } else if (potentialHull) {
                callsign = potentialHull.toUpperCase();
                carrierInfo = { hull: potentialHull };
              }
            } else if (parts.length > 1 && parts[0]) {
              callsign = parts[0].toUpperCase();
            }
          }
          
          // Create the appropriate pilots array based on role type
          const pilotSlots = cleanedRoleId.startsWith('support-command-control-') ? 2 : 4;

          const defaultPilots = Array(pilotSlots).fill(0).map((_, i) => ({ 
            boardNumber: "", 
            callsign: "", 
            dashNumber: (i + 1).toString() 
          }));
          
          targetRole = {
            id: roleId,
            callsign: callsign,
            pilots: defaultPilots,
            creationOrder: creationOrder,
            carrier: carrierInfo
          };
        }
        
        // Update pilots for the target role
        const sortedPilots = [...rolePilots]
          .filter(p => p.boardNumber && p.boardNumber.trim() !== "")
          .sort((a, b) => {
            const aNum = parseInt(a.dashNumber) || 999;
            const bNum = parseInt(b.dashNumber) || 999;
            return aNum - bNum;
          });       // Ensure type matches
        const isCommandControl = roleId.includes('command-control');
        let newPilots;

        if (isCommandControl) {
          // For Command & Control, use the exact number of slots from the role's configuration
          // or default to 1 if no slots are defined
          const numSlots = targetRole.slots?.length || 1;
          newPilots = Array(numSlots).fill(0).map((_, i) => ({
            boardNumber: "",
            callsign: "",
            dashNumber: (i + 1).toString()
          }));
        } else {
          // For Carrier Air Ops, always use 4 slots
          newPilots = [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ];
        }

        sortedPilots.forEach(pilot => {
          const posIndex = parseInt(pilot.dashNumber) - 1;
          if (posIndex >= 0 && posIndex < newPilots.length) {
            newPilots[posIndex] = {
              boardNumber: pilot.boardNumber || "",
              callsign: pilot.callsign || "",
              dashNumber: pilot.dashNumber || (posIndex + 1).toString()
            };
          }
        });
        targetRole.pilots = newPilots;


        updatedRoles.push(targetRole);
        processedRoleIds.add(roleId); 
      }

      // Don't add back roles from previous state - they should come from the database or assignedPilots
      // This prevents roles from previous missions appearing when switching missions

      setCreationOrderCounter(maxOrder + 1);
      return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
    });
  // Add allCarriers explicitly to dependencies to ensure effect re-runs when carriers are fetched
  }, [assignedPilots, carriersLoading, carrierMap, allCarriers]); // Added allCarriers

  return (
    <div style={{
      width,
      position: 'relative',
      flex: '1 1 auto', // Allow element to grow and shrink
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease-in-out',
          backgroundColor: '#FFFFFF'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={{
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textTransform: 'uppercase'
          }}>
            Mission Support Assignments
          </span>
        </div>
        <div className="flex-1" style={{ 
          overflowY: 'auto',
          flexGrow: 1 // Ensure it takes available space
        }}>
          {carriersLoading ? (
             <p>Loading support assignments...</p> // Show loading indicator
          ) : (
            <div className="space-y-4">
              {supportRoles.map(role => {
                // Generate a stable key that correctly reflects current state including attendance
                const pilotsKey = role.pilots
                  .filter(p => p.boardNumber?.trim())
                  .map(p => `${p.boardNumber}:${p.dashNumber}:${p.attendanceStatus || 'none'}:${p.rollCallStatus || 'none'}`)
                  .join('-');

                return (
                  <SupportRoleAssignmentCard
                    key={`${role.id}:${pilotsKey}`}
                    id={role.id}
                    callsign={role.callsign}
                    pilots={role.pilots}
                    carrier={role.carrier}
                    slots={role.slots}
                    assignedPilots={assignedPilots || {}}
                    onDeleteRole={handleDeleteRole}
                    onEditRole={handleEditRole}
                  />
                );
              })}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 'auto',
          padding: '24px 0 0 0',
          borderTop: '1px solid #E2E8F0'
        }}>
          <button
            onClick={() => { setEditRoleId(null); setShowAddDialog(true); }}
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
            disabled={carriersLoading} // Disable add button while loading carriers
          >
            +
          </button>
        </div>
      </Card>

      {/* Add/Edit Support Role Dialog */}
      {showAddDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={handleCancelAddRole} />
            {/* Dialog - Set title based on whether editing and role type */}
          <AddSupportRoleDialog
            onSave={handleAddOrUpdateSupportRole}
            onCancel={handleCancelAddRole}
            existingSupportRoles={supportRoles}
            editingRoleId={editRoleId || undefined}
            title={editRoleId 
              ? (editRoleId.includes('command-control') 
                 ? "Edit Command & Control Role" 
                 : "Edit Carrier Air Ops Role")
              : "Add Support Role"}
          />
        </>      )}
    </div>
  );
};

export default MissionSupportAssignments;
