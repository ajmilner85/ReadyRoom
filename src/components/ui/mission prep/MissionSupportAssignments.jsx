import React, { useState } from 'react';
import { Card } from '../card';
import AddSupportRoleDialog from '../dialogs/AddSupportRoleDialog.jsx';
import SupportRoleCard from '../flight cards/SupportRoleCard.jsx';

const MissionSupportAssignments = ({ width }) => {
  const [supportRoles, setSupportRoles] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [initialEditCallsign, setInitialEditCallsign] = useState("");
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);

  // Function to handle adding a new support role
  const handleAddSupportRole = ({ callsign }) => {
    if (editRoleId) {
      // Update an existing role's callsign
      setSupportRoles(prevRoles => {
        const updatedRoles = prevRoles.map(role => {
          if (role.id === editRoleId) {
            return {
              ...role,
              callsign: callsign.toUpperCase()
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
    } else {
      // Add a new support role
      const newRole = {
        id: `support-${Date.now().toString()}`,
        callsign: callsign.toUpperCase(),
        assignedPilot: undefined,
        creationOrder: creationOrderCounter
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
  };

  // Close the dialog without adding a role
  const handleCancelAddRole = () => {
    setShowAddDialog(false);
    setEditRoleId(null);
    setInitialEditCallsign("");
  };

  // Handle deleting a support role
  const handleDeleteRole = (id) => {
    setSupportRoles(prevRoles => prevRoles.filter(role => role.id !== id));
  };

  // Handle editing a support role
  const handleEditRole = (id, callsign) => {
    setEditRoleId(id);
    setInitialEditCallsign(callsign);
    setShowAddDialog(true);
  };

  // Get unique existing callsigns for the dialog suggestions
  const existingCallsigns = supportRoles.map(role => role.callsign);

  return (
    <div style={{ 
      width, 
      position: 'relative',
      padding: '10px',
      margin: '-10px',
      paddingBottom: '20px',
      height: '100%',
    }}>
      <Card 
        style={{
          width: '100%',
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
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          <div className="space-y-4">
            {supportRoles.map(role => (
              <SupportRoleCard
                key={role.id}
                id={role.id}
                callsign={role.callsign}
                assignedPilot={role.assignedPilot}
                onDeleteRole={handleDeleteRole}
                onEditRole={handleEditRole}
              />
            ))}
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
        </>
      )}
    </div>
  );
};

export default MissionSupportAssignments;
