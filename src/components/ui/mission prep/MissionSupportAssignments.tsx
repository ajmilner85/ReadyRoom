import React, { useState, useCallback, useEffect } from 'react';
import { Card } from '../card';
import AddSupportRoleDialog from '../dialogs/AddSupportRoleDialog';
import SupportRoleAssignmentCard from '../flight cards/SupportRoleAssignmentCard';
import type { Pilot } from '../../../types/PilotTypes';
import { cleanRoleId } from '../../../utils/dragDropUtils';
import { SupportRoleType } from '../../../types/SupportRoleTypes';

// Utility function to extract carrier information from roleId or callsign
const extractCarrierInfo = (roleId: string, callsign: string): { hull?: string; name?: string } => {
  // Check if the roleId or callsign contains carrier information
  // Example format: "CVN-72-ABRAHAM-LINCOLN" or "CVN72-ABRAHAM-LINCOLN"
  
  // First, normalize callsign and roleId
  const normalizedCallsign = callsign.toUpperCase();
  const normalizedRoleId = roleId.toUpperCase();
  
  // Try to match carrier pattern in callsign first
  const callsignMatch = normalizedCallsign.match(/^(CVN-?\d+)[\s-]+(.*?)$/);
  if (callsignMatch) {
    return {
      hull: callsignMatch[1].includes('-') ? callsignMatch[1] : `CVN-${callsignMatch[1].substring(3)}`,
      name: callsignMatch[2].replace(/-/g, ' ').trim()
    };
  }
  
  // Try to match in roleId if not found in callsign
  const roleIdParts = normalizedRoleId.split('-');
  for (let i = 0; i < roleIdParts.length - 1; i++) {
    if (roleIdParts[i].startsWith('CVN') && roleIdParts[i].length >= 4) {
      // Found a potential hull number
      const hullPart = roleIdParts[i];
      const hull = hullPart.includes('-') ? hullPart : `CVN-${hullPart.substring(3)}`;
      // Try to extract name from the following parts
      if (i + 1 < roleIdParts.length) {
        const nameParts = roleIdParts.slice(i + 1);
        const name = nameParts.join(' ').trim();
        if (name) {
          return { hull, name };
        }
      }
    }
  }
  
  return {};
};

interface SupportRole {
  id: string;
  callsign: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  creationOrder: number;
  carrier?: {
    hull?: string;
    name?: string;
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
  const [initialEditCallsign, setInitialEditCallsign] = useState("");
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  // Function to handle adding a new support role
  const handleAddSupportRole = useCallback(({ callsign }: { callsign: string }) => {
    if (editRoleId) {
      // Update an existing role's callsign
      setSupportRoles(prevRoles => {
        const updatedRoles = prevRoles.map(role => {          if (role.id === editRoleId) {
            // Preserve carrier info if it exists, or extract from the new callsign
            const updatedCarrier = role.carrier || extractCarrierInfo(role.id, callsign);
            
            return {
              ...role,
              callsign: callsign.toUpperCase(),
              carrier: updatedCarrier
            };
          }
          return role;
        });

        // Re-sort roles by creation order
        return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
      });
        // Reset edit state
      setEditRoleId(null);
      setInitialEditCallsign("");
    } else {// Add a new support role with a clean ID
      // The ID should be support-{callsign}-{timestamp}
      // This makes it easier to identify the role by its callsign
      const cleanCallsign = callsign.toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString();
      let newRoleId = `support-${cleanCallsign}-${timestamp}`;
      
      // Make sure we don't have duplicated prefixes
      if (newRoleId.startsWith('support-support-')) {
        newRoleId = 'support-' + newRoleId.substring(16);
      }      
      const newRole: SupportRole = {
        id: newRoleId,
        callsign: callsign.toUpperCase(),
        pilots: [
          { boardNumber: "", callsign: "", dashNumber: "1" },
          { boardNumber: "", callsign: "", dashNumber: "2" },
          { boardNumber: "", callsign: "", dashNumber: "3" },
          { boardNumber: "", callsign: "", dashNumber: "4" }
        ],
        creationOrder: creationOrderCounter,
        carrier: extractCarrierInfo(newRoleId, callsign)
      };
  
      // Add the new role and sort by creation order
      setSupportRoles(prev => {
        const updatedRoles = [...prev, newRole];
        return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
      });
  
      // Increment the creation order counter for the next role
      setCreationOrderCounter(counter => counter + 1);
    }
    
    setShowAddDialog(false);
  }, [creationOrderCounter, editRoleId]);

  // Close the dialog without adding a role
  const handleCancelAddRole = useCallback(() => {
    setShowAddDialog(false);
    setEditRoleId(null);
    setInitialEditCallsign("");
  }, []);

  // Handle deleting a support role
  const handleDeleteRole = useCallback((id: string) => {
    setSupportRoles(prevRoles => prevRoles.filter(role => role.id !== id));
  }, []);

  // Handle editing a support role
  const handleEditRole = useCallback((id: string, callsign: string) => {
    setEditRoleId(id);
    setInitialEditCallsign(callsign);
    setShowAddDialog(true);
  }, []);
    // Get unique existing callsigns for the dialog suggestions
  const existingCallsigns = supportRoles.map(role => role.callsign);
  // Convert assignedPilots to supportRoles format if needed
  useEffect(() => {
    if (!assignedPilots) return;
      // Update support roles with assigned pilots
    setSupportRoles(prevRoles => {
      const updatedRoles = [...prevRoles];
      const updatedRolesMap = new Map<string, SupportRole>();
      
      // First, collect all existing roles in a map for easy lookup
      updatedRoles.forEach(role => {
        updatedRolesMap.set(role.id, role);
      });
      
      // Update each role with its pilots from assignedPilots
      for (const [roleId, rolePilots] of Object.entries(assignedPilots)) {
        if (roleId.startsWith('support-')) {
          const role = updatedRolesMap.get(roleId);
          
          if (role) {
            // Sort by dashNumber to ensure consistent order 
            const sortedPilots = [...rolePilots]
              .filter(p => p.boardNumber && p.boardNumber.trim() !== "") // Only include pilots with board numbers
              .sort((a, b) => {
                const aNum = parseInt(a.dashNumber) || 999;
                const bNum = parseInt(b.dashNumber) || 999;
                return aNum - bNum;
              });
            
            // Create a new array with empty slots for unused positions
            const newPilots = [
              { boardNumber: "", callsign: "", dashNumber: "1" },
              { boardNumber: "", callsign: "", dashNumber: "2" },
              { boardNumber: "", callsign: "", dashNumber: "3" },
              { boardNumber: "", callsign: "", dashNumber: "4" }
            ];
            
            // Place each pilot in their correct dashNumber position
            sortedPilots.forEach(pilot => {
              const posIndex = parseInt(pilot.dashNumber) - 1;
              if (posIndex >= 0 && posIndex < 4) {
                newPilots[posIndex] = pilot;
              }
            });
                // Update the role with new pilots
            role.pilots = newPilots;
          } else {
            // This is a support role in assignedPilots that doesn't exist in our state
            // Create a new role
            const cleanedRoleId = cleanRoleId(roleId);
            
            // Extract a meaningful callsign
            let callsign = 'SUPPORT';
            const parts = cleanedRoleId.substring(8).split('-');
            if (parts.length > 0 && parts[0]) {
              callsign = parts[0].toUpperCase();
            }
            
            // Sort pilots by dashNumber for consistent display
            const sortedPilots = [...rolePilots].sort((a, b) => {
              const aNum = parseInt(a.dashNumber) || 999;
              const bNum = parseInt(b.dashNumber) || 999;
              return aNum - bNum;
            });
                // Make sure each pilot has a correct dashNumber
            const validatedPilots = sortedPilots.map((pilot, idx) => ({
              ...pilot,
              dashNumber: pilot.dashNumber || (idx + 1).toString()
            }));
            // Create a new role with these pilots
            const newRole: SupportRole = {
              id: roleId,
              callsign: callsign,
              pilots: [
                { boardNumber: "", callsign: "", dashNumber: "1" },
                { boardNumber: "", callsign: "", dashNumber: "2" },
                { boardNumber: "", callsign: "", dashNumber: "3" },
                { boardNumber: "", callsign: "", dashNumber: "4" }
              ],
              creationOrder: creationOrderCounter + updatedRoles.length,
              carrier: extractCarrierInfo(roleId, callsign)
            };
            
            // Place each pilot in their correct dashNumber position
            validatedPilots.forEach(pilot => {
              const posIndex = parseInt(pilot.dashNumber) - 1;
              if (posIndex >= 0 && posIndex < 4) {
                newRole.pilots[posIndex] = pilot;
              }
            });
            
            // Add the new role to our map and array
            updatedRolesMap.set(roleId, newRole);
            updatedRoles.push(newRole);
          }
        }
      }
      
      // Find roles that exist in supportRoles but no longer exist in assignedPilots
      // These need to have their pilots cleared (but we keep the role for now)
      updatedRoles.forEach(role => {
        if (role.id.startsWith('support-') && !assignedPilots[role.id]) {
          // Clear all pilots from this role
          role.pilots = [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ];
        }
      });
      
      // Return the updated roles sorted by creation order
      return updatedRoles.sort((a, b) => a.creationOrder - b.creationOrder);
    });
  }, [assignedPilots, creationOrderCounter]);  // Debug logging to track support role updates has been removed to prevent infinite update loops

  return (<div style={{ 
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
        </div>        <div className="flex-1" style={{ 
          overflowY: 'auto',
          flexGrow: 1 // Ensure it takes available space
        }}>          <div className="space-y-4">            {supportRoles.map(role => {
              // Generate a stable key that correctly reflects current state
              const pilotsKey = role.pilots
                .filter(p => p.boardNumber?.trim())
                .map(p => `${p.boardNumber}:${p.dashNumber}`)
                .join('-');
                
              return (                <SupportRoleAssignmentCard
                  key={`${role.id}:${pilotsKey}`}
                  id={role.id}
                  callsign={role.callsign}
                  pilots={role.pilots}
                  carrier={role.carrier}
                  onDeleteRole={handleDeleteRole}
                  onEditRole={handleEditRole}
                />
              );
            })}
          </div>
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
            onClick={() => setShowAddDialog(true)}
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
          
          {/* Dialog */}
          <AddSupportRoleDialog
            onSave={handleAddSupportRole}
            onCancel={handleCancelAddRole}
            existingCallsigns={existingCallsigns}
            initialCallsign={initialEditCallsign}
            title={editRoleId ? "Edit Support Role" : "Add Support Role"}
          />
        </>      )}
    </div>
  );
};

export default MissionSupportAssignments;
