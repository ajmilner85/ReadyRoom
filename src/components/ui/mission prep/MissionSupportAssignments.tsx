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
import type { SupportRoleCard } from '../../../types/MissionTypes';

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
  setAssignedPilots?: (value: React.SetStateAction<Record<string, AssignedPilot[]>>, skipSave?: boolean) => void;
  // New props for database-backed support role cards
  supportRoleCards?: SupportRoleCard[];
  setSupportRoleCards?: (cards: SupportRoleCard[], skipSave?: boolean) => void;
}

const MissionSupportAssignments: React.FC<MissionSupportAssignmentsProps> = ({ 
  width,
  assignedPilots = {},
  setAssignedPilots,
  supportRoleCards = [],
  setSupportRoleCards
}) => {
  const [supportRoles, setSupportRolesLocal] = useState<SupportRole[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  const [allCarriers, setAllCarriers] = useState<CarrierData[]>([]); 
  const [carriersLoading, setCarriersLoading] = useState(true); 
  
  // Track if we've initialized from props to avoid overwriting
  const initializedFromPropsRef = useRef(false);
  // Track if we've completed initial sync to avoid triggering saves on page load
  const initialSyncCompletedRef = useRef(false);

  // Reset sync flag when supportRoleCards reference changes (mission change)
  const supportRoleCardsRef = useRef(supportRoleCards);
  useEffect(() => {
    if (supportRoleCardsRef.current !== supportRoleCards) {
      console.log('[MISSION-SUPPORT] supportRoleCards reference changed, resetting sync flag');
      initialSyncCompletedRef.current = false;
      supportRoleCardsRef.current = supportRoleCards;
    }
  }, [supportRoleCards]);

  // Initialize supportRoles from props (database) when they load
  useEffect(() => {
    if (supportRoleCards && supportRoleCards.length > 0) {
      console.log('[MISSION-SUPPORT] Initializing from database:', supportRoleCards.length, 'cards');
      // Convert SupportRoleCard to SupportRole (they have the same structure)
      setSupportRolesLocal(supportRoleCards as SupportRole[]);
      // Update the counter to be greater than the maximum order
      const maxOrder = Math.max(...supportRoleCards.map(r => r.creationOrder), -1);
      setCreationOrderCounter(maxOrder + 1);
      initializedFromPropsRef.current = true;
      initialSyncCompletedRef.current = true;
    } else if (supportRoleCards && supportRoleCards.length === 0 && initializedFromPropsRef.current) {
      // Only clear if we had previously initialized - this prevents clearing on initial empty load
      // before the database has loaded
      console.log('[MISSION-SUPPORT] Database returned empty cards, clearing local state');
      setSupportRolesLocal([]);
    } else if (supportRoleCards && supportRoleCards.length === 0 && !initializedFromPropsRef.current) {
      // Initial load with no cards in database - mark sync as complete
      console.log('[MISSION-SUPPORT] Initial load complete, no cards in database');
      initializedFromPropsRef.current = true;
      initialSyncCompletedRef.current = true;
    }
  }, [supportRoleCards]);

  // Wrapper to update local state AND save to database
  // NOTE: We must NOT call setSupportRoleCards from inside setSupportRolesLocal's updater
  // as that causes the React error "Cannot update a component while rendering a different component"
  const setSupportRoles = useCallback((updater: SupportRole[] | ((prev: SupportRole[]) => SupportRole[]), skipSave: boolean = false) => {
    // Calculate new roles first
    setSupportRolesLocal(prevRoles => {
      const newRoles = typeof updater === 'function' ? updater(prevRoles) : updater;

      // Schedule the parent state update for after this setState completes
      // This avoids the React anti-pattern of updating parent state during child render
      if (setSupportRoleCards && !skipSave) {
        // Use queueMicrotask to ensure this runs after the current render cycle
        queueMicrotask(() => {
          console.log('[MISSION-SUPPORT] Saving to database:', newRoles.length, 'cards');
          setSupportRoleCards(newRoles as SupportRoleCard[], false);
        });
      }

      return newRoles;
    });
  }, [setSupportRoleCards]);

  // Whenever supportRoles change and assignedPilots exists, ensure empty support roles are preserved
  useEffect(() => {
    // Skip if no support roles or assigned pilots is external and can't be modified
    if (supportRoles.length === 0 || !assignedPilots || !setAssignedPilots) return;
    
    // Use our utility to ensure empty support roles are preserved in assignedPilots
    const assignedPilotsWithRoles = ensureSupportRolesInAssignedPilots(supportRoles, assignedPilots);

    // If there were changes, update the parent component's state
    // Use skipSave since this is just initializing empty display slots, not user changes
    if (Object.keys(assignedPilotsWithRoles).length !== Object.keys(assignedPilots).length) {
      setAssignedPilots((prev) => {
        return { ...prev, ...assignedPilotsWithRoles };
      }, true); // skipSave = true
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
  }, []);
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
    
    // Wait for initial sync from database before processing
    if (!initialSyncCompletedRef.current) {
      return;
    }
    
    // If assignedPilots is empty, just clear the pilots in existing support roles without removing the roles
    if (!assignedPilots || Object.keys(assignedPilots).length === 0) {
      setSupportRoles(prev => {
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
      }, true); // skipSave during initialization
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
      }      // Add back roles from previous state not in assignedPilots (e.g., newly added, not saved yet)
      prevRoles.forEach(role => {
        if (!processedRoleIds.has(role.id)) {
           const roleToKeep = { ...role };
           // Keep the empty pilots structure but ensure it's never null or undefined
           if (role.id.includes('command-control')) {
             const slotsLength = role.slots?.length || 1;
             roleToKeep.pilots = Array(slotsLength).fill(0).map((_, i) => ({
               boardNumber: "",
               callsign: "",
               dashNumber: (i + 1).toString()
             }));
           } else {
             roleToKeep.pilots = [
               { boardNumber: "", callsign: "", dashNumber: "1" },
               { boardNumber: "", callsign: "", dashNumber: "2" },
               { boardNumber: "", callsign: "", dashNumber: "3" },
               { boardNumber: "", callsign: "", dashNumber: "4" }
             ];
           }
           updatedRoles.push(roleToKeep);
           maxOrder = Math.max(maxOrder, roleToKeep.creationOrder); 
        }
      });


      setCreationOrderCounter(maxOrder + 1);
      return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
    }, true); // skipSave during initialization sync
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
                // Generate a stable key that correctly reflects current state
                const pilotsKey = role.pilots
                  .filter(p => p.boardNumber?.trim())
                  .map(p => `${p.boardNumber}:${p.dashNumber}`)
                  .join('-');

                return (
                  <SupportRoleAssignmentCard
                    key={`${role.id}:${pilotsKey}`}
                    id={role.id}
                    callsign={role.callsign}
                    pilots={role.pilots}
                    carrier={role.carrier}
                    slots={role.slots}
                    assignedPilots={assignedPilots || undefined}
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
            title={editRoleId 
              ? (editRoleId.includes('command-control') 
                 ? "Edit Command & Control Role" 
                 : "Edit Carrier Air Ops Role")
              : "Add Support Role"}
            usedCarrierIds={supportRoles
              .filter(role => role.carrier?.carrierId)
              .map(role => role.carrier!.carrierId!)}
            editingCarrierId={editRoleId ? supportRoles.find(r => r.id === editRoleId)?.carrier?.carrierId : undefined}
          />
        </>      )}
    </div>
  );
};

export default MissionSupportAssignments;
