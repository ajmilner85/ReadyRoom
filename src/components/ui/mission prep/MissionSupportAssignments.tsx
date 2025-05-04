import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card } from '../card';
import AddSupportRoleDialog from '../dialogs/AddSupportRoleDialog';
import SupportRoleAssignmentCard from '../flight cards/SupportRoleAssignmentCard';
import type { Pilot } from '../../../types/PilotTypes';
import { cleanRoleId } from '../../../utils/dragDropUtils';
import { SupportRoleType } from '../../../types/SupportRoleTypes';
import { AddSupportRoleDialogData } from '../../../types/DialogTypes';
import { fetchCarriers } from '../../../utils/supabaseClient'; 

// Interface for fetched carrier data
interface CarrierData {
  id: string;
  name: string;
  hull: string;
}

interface SupportRole {
  id: string;
  callsign: string; 
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    // Added missing optional properties
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  creationOrder: number;
  carrier?: {
    hull?: string;
    name?: string;
    carrierId?: string; 
  };
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
}

const MissionSupportAssignments: React.FC<MissionSupportAssignmentsProps> = ({ 
  width,
  assignedPilots = {}
}) => {
  const [supportRoles, setSupportRoles] = useState<SupportRole[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  const [allCarriers, setAllCarriers] = useState<CarrierData[]>([]); 
  const [carriersLoading, setCarriersLoading] = useState(true); 

  // Fetch all carriers on component mount
  useEffect(() => {
    const loadCarriers = async () => {
      setCarriersLoading(true);
      try {
        const data = await fetchCarriers();
        console.log("[CARRIER_FETCH] Fetched carriers:", data); // Log fetched data
        setAllCarriers(data);
      } catch (error) {
        console.error("[CARRIER_FETCH] Error fetching carriers:", error);
      } finally { // Use finally to ensure loading state is set
        setCarriersLoading(false);
        console.log("[CARRIER_FETCH] Carriers loading finished.");
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
    console.log("[CARRIER_MAP] Memoized carrierMap updated. Size:", map.size, "Keys:", Array.from(map.keys())); // Log map update
    return map;
  }, [allCarriers]); // Depends only on allCarriers

  // Function to handle adding or updating a support role
  const handleAddOrUpdateSupportRole = useCallback((data: AddSupportRoleDialogData) => {
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

      setCreationOrderCounter(counter => counter + 1);
    }

    setShowAddDialog(false);
  }, [creationOrderCounter, editRoleId]);

  // Close the dialog without saving
  const handleCancelAddRole = useCallback(() => {
    setShowAddDialog(false);
    setEditRoleId(null);
  }, []);

  // Handle deleting a support role
  const handleDeleteRole = useCallback((id: string) => {
    setSupportRoles(prevRoles => prevRoles.filter(role => role.id !== id));
  }, []);

  // Handle initiating the edit of a support role
  const handleEditRole = useCallback((id: string) => {
    setEditRoleId(id);
    // We don't need to pass the callsign anymore
    setShowAddDialog(true);
  }, []);


  // Convert assignedPilots to supportRoles format, using fetched carrier data
  useEffect(() => {
    // Explicitly wait for carriers to finish loading AND map to have entries if carriers exist
    if (carriersLoading || (allCarriers.length > 0 && carrierMap.size === 0)) {
      console.log(`[SYNC_EFFECT] Skipping sync: carriersLoading=${carriersLoading}, allCarriers.length=${allCarriers.length}, carrierMap.size=${carrierMap.size}`);
      return; 
    }
    // Also wait if assignedPilots is empty
    if (!assignedPilots || Object.keys(assignedPilots).length === 0) {
       console.log("[SYNC_EFFECT] Skipping sync: assignedPilots is empty or null.");
       // Ensure roles are cleared if assignedPilots becomes empty after initial load
       setSupportRoles(prev => (prev.length > 0 ? [] : prev));
       return;
    }
    
    console.log("[SYNC_EFFECT] Running sync. Current carrierMap keys:", Array.from(carrierMap.keys())); 

    setSupportRoles(prevRoles => {
      const updatedRoles: SupportRole[] = [];
      const processedRoleIds = new Set<string>(); 
      let maxOrder = -1; 

      // Process roles from assignedPilots
      for (const [roleId, rolePilots] of Object.entries(assignedPilots)) {
        if (!roleId.startsWith('support-')) continue; 

        let existingRole = prevRoles.find(r => r.id === roleId);
        let targetRole: SupportRole;

        if (existingRole) {
          // Update existing role - Ensure carrier info is preserved or updated if needed
          targetRole = { ...existingRole }; 
          // If existing role somehow lacks carrier info but should have it, try reconstructing
          if (!targetRole.carrier?.carrierId && targetRole.id.startsWith('support-carrier-')) {
             const idPart = cleanRoleId(targetRole.id).substring(16);
             const lastHyphenIndex = idPart.lastIndexOf('-');
             if (lastHyphenIndex > 0 && lastHyphenIndex === 36 && idPart.length > 37) {
                const extractedCarrierId = idPart.substring(0, lastHyphenIndex);
                const foundCarrier = carrierMap.get(extractedCarrierId);
                if (foundCarrier) {
                   targetRole.carrier = { ...foundCarrier, carrierId: extractedCarrierId };
                   targetRole.callsign = `${foundCarrier.hull} ${foundCarrier.name}`.toUpperCase();
                   console.log(`[SYNC_EFFECT] Rehydrated missing carrier info for existing role ${targetRole.id}`);
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

              console.log(`[SYNC_EFFECT] Reconstructing role ${roleId}. Extracted full carrierId: "${extractedCarrierId}" (length ${extractedCarrierId.length})`); 
              
              // *** Log right before lookup ***
              console.log(`[SYNC_EFFECT] Attempting lookup in carrierMap with key: "${extractedCarrierId}"`);
              const foundCarrier = carrierMap.get(extractedCarrierId); 
              
              if (foundCarrier) {
                console.log(`[SYNC_EFFECT] Found carrier in map: ${foundCarrier.hull} ${foundCarrier.name}`); 
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
          
          targetRole = {
            id: roleId,
            callsign: callsign,
            pilots: [
              { boardNumber: "", callsign: "", dashNumber: "1" },
              { boardNumber: "", callsign: "", dashNumber: "2" },
              { boardNumber: "", callsign: "", dashNumber: "3" },
              { boardNumber: "", callsign: "", dashNumber: "4" }
            ],
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
          });

        const newPilots: SupportRole['pilots'] = [ // Ensure type matches
          { boardNumber: "", callsign: "", dashNumber: "1" },
          { boardNumber: "", callsign: "", dashNumber: "2" },
          { boardNumber: "", callsign: "", dashNumber: "3" },
          { boardNumber: "", callsign: "", dashNumber: "4" }
        ];

        sortedPilots.forEach(pilot => {
          const posIndex = parseInt(pilot.dashNumber) - 1;
          if (posIndex >= 0 && posIndex < 4) {
            newPilots[posIndex] = {
              boardNumber: pilot.boardNumber || "",
              callsign: pilot.callsign || "",
              dashNumber: pilot.dashNumber || (posIndex + 1).toString(),
              attendanceStatus: pilot.attendanceStatus,
              rollCallStatus: pilot.rollCallStatus
            };
          }
        });
        targetRole.pilots = newPilots;


        updatedRoles.push(targetRole);
        processedRoleIds.add(roleId); 
      }

      // Add back roles from previous state not in assignedPilots (e.g., newly added, not saved yet)
      prevRoles.forEach(role => {
        if (!processedRoleIds.has(role.id)) {
           const roleToKeep = { ...role };
           roleToKeep.pilots = [
             { boardNumber: "", callsign: "", dashNumber: "1" },
             { boardNumber: "", callsign: "", dashNumber: "2" },
             { boardNumber: "", callsign: "", dashNumber: "3" },
             { boardNumber: "", callsign: "", dashNumber: "4" }
           ];
          updatedRoles.push(roleToKeep);
          maxOrder = Math.max(maxOrder, roleToKeep.creationOrder); 
        }
      });


      setCreationOrderCounter(maxOrder + 1);
      console.log("[SYNC_EFFECT] Sync finished. Updated roles:", updatedRoles);
      return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
    });
  // Add allCarriers explicitly to dependencies to ensure effect re-runs when carriers are fetched
  }, [assignedPilots, carriersLoading, carrierMap, allCarriers]); // Added allCarriers

  return (
    <div style={{ 
      width, 
      position: 'relative',
      padding: '10px',
      margin: '-10px',
      paddingBottom: '0',
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
                    callsign={role.callsign} // Should now be correct
                    pilots={role.pilots}
                    carrier={role.carrier}
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
          
          {/* Dialog - Props updated */} 
          <AddSupportRoleDialog
            onSave={handleAddOrUpdateSupportRole} // Use the combined handler
            onCancel={handleCancelAddRole}
            title={editRoleId ? "Edit Carrier Air Ops Role" : "Add Carrier Air Ops Role"}
          />
        </>      )}
    </div>
  );
};

export default MissionSupportAssignments;
