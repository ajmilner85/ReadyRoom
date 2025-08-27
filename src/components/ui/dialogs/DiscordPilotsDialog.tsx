import React, { useState, useEffect } from 'react';
import { 
  DiscordPilotMatch, 
  fetchDiscordGuildMembers, 
  matchDiscordMembersWithPilots,
  processPilotMatches
} from '../../../utils/discordPilotService';
import { syncUserDiscordRoles } from '../../../utils/discordRoleSync';
import { X, Shield } from 'lucide-react';
import { Pilot } from '../../../types/PilotTypes';
import { supabase } from '../../../utils/supabaseClient';
import { Status } from '../../../utils/statusService';
import { Role } from '../../../utils/roleService';

interface DiscordPilotsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: {
    updated: number;
    created: number;
    unchanged: number;
    errors: string[];
  }) => void;
}

export const DiscordPilotsDialog: React.FC<DiscordPilotsDialogProps> = ({ 
  isOpen, 
  onClose,
  onComplete
}) => {
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<DiscordPilotMatch[]>([]);
  const [allPilots, setAllPilots] = useState<Pilot[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [disabledRoles, setDisabledRoles] = useState<Record<string, boolean>>({});
  const [enableRoleSync, setEnableRoleSync] = useState(true);
  const [roleSyncResults, setRoleSyncResults] = useState<{
    synced: number;
    failed: number;
    errors: string[];
  }>({ synced: 0, failed: 0, errors: [] });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Load Discord members and existing pilots
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch roles and statuses for dropdowns
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('order', { ascending: true });
        
      if (rolesError) throw rolesError;
      setRoles(rolesData || []);
      
      const { data: statusesData, error: statusesError } = await supabase
        .from('statuses')
        .select('*')
        .order('order', { ascending: true });
        
      if (statusesError) throw statusesError;
      setStatuses(statusesData || []);
      
      // First fetch exclusive role assignments since we need this before showing the UI
      // This ensures the role restrictions are shown on first open
      if (rolesData && rolesData.length > 0) {
        await fetchExclusiveRoleAssignments(rolesData);
      }
      
      // Fetch Discord guild members
      const discordMembers = await fetchDiscordGuildMembers();
      
      // Fetch squadron role mappings to filter out ignored users
      const { data: squadronsData } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .not('discord_integration', 'is', null);
      
      // Collect all "ignore user" role IDs from all squadrons
      const ignoreRoleIds: string[] = [];
      console.log('DEBUG: Squadron discord_integration data:', squadronsData);
      
      if (squadronsData) {
        squadronsData.forEach((squadron, index) => {
          console.log(`DEBUG: Squadron ${index} discord_integration:`, squadron.discord_integration);
          
          // Try different possible data structures
          const discordIntegration = squadron.discord_integration;
          let roleMappings = [];
          
          if (discordIntegration) {
            // Try direct roleMappings
            if (discordIntegration.roleMappings) {
              roleMappings = discordIntegration.roleMappings;
            }
            // Try isIgnoreUsers directly in discord_integration
            else if (discordIntegration.isIgnoreUsers) {
              // Handle if isIgnoreUsers is stored differently
              console.log('DEBUG: Found isIgnoreUsers directly in discord_integration');
            }
            // Try if the structure is different
            else {
              console.log('DEBUG: discord_integration structure:', Object.keys(discordIntegration));
            }
          }
          
          console.log(`DEBUG: Squadron ${index} roleMappings:`, roleMappings);
          
          roleMappings.forEach((mapping: any) => {
            console.log(`DEBUG: Checking mapping:`, mapping);
            if (mapping.isIgnoreUsers) {
              console.log(`DEBUG: Found ignore role: ${mapping.discordRoleId}`);
              ignoreRoleIds.push(mapping.discordRoleId);
            }
          });
        });
      }
      
      console.log('DEBUG: Final ignoreRoleIds:', ignoreRoleIds);
      
      // Filter out Discord members who have ignore roles
      const filteredDiscordMembers = discordMembers.filter(member => {
        // If member has any ignore role, exclude them
        return !member.roles?.some(roleId => ignoreRoleIds.includes(roleId));
      });
      
      console.log(`Filtered ${discordMembers.length - filteredDiscordMembers.length} ignored users from Discord sync`);
      
      // Match the filtered members with existing pilots
      const matches = await matchDiscordMembersWithPilots(filteredDiscordMembers);
      
      // Get all pilots for the dropdowns
      const { data: pilotsData } = await supabase
        .from('pilots')
        .select('*');
      
      if (pilotsData) {
        // Convert Supabase pilots to legacy format
        const pilots = pilotsData.map(p => ({
          id: p.id,
          callsign: p.callsign,
          boardNumber: p.boardNumber.toString(),
          status: 'Unknown',
          billet: '',
          qualifications: [],
          discordUsername: p.discord_original_id || ''
        }));
        
        setAllPilots(pilots);
        
        // Log all pilots for debugging
        console.log('Available pilots for dropdown:', pilots.map(p => ({
          id: p.id, 
          callsign: p.callsign, 
          boardNumber: p.boardNumber
        })));
      }
      
      // Log matches after they're created
      console.log('Final matches for UI rendering:', matches.map(m => ({
        discord: m.discordMember.displayName,
        matchedPilot: m.matchedPilot ? `${m.matchedPilot.callsign} (${m.matchedPilot.id})` : 'none',
        action: m.action,
        selectedPilotId: m.selectedPilotId,
        roleId: m.roleId,
        statusId: m.statusId
      })));
      
      setMatches(matches);
    } catch (err: any) {
      setError(err.message || 'Failed to load Discord members');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch all exclusive roles that are already assigned
  const fetchExclusiveRoleAssignments = async (rolesList = roles) => {
    try {
      // Get all exclusive roles
      const exclusiveRoles = rolesList.filter(role => role.isExclusive);
      
      if (!exclusiveRoles.length) return;
      
      // Create a map to track which roles are already assigned
      const newDisabledRoles: Record<string, boolean> = {};
      
      // For each exclusive role, check if it's already assigned to any pilot
      for (const role of exclusiveRoles) {
        // Query for all pilots with this role assigned
        const { data, error } = await supabase
          .from('pilots')
          .select('id, role_id')
          .eq('role_id', role.id);
          
        if (error) {
          console.error('Error checking role assignments:', error);
          continue;
        }
        
        // If this role is assigned to any pilot, mark it as disabled
        if (data && data.length > 0) {
          console.log(`Role ${role.name} is assigned to ${data.length} pilots`);
          newDisabledRoles[role.id] = true;
        }
      }
      
      console.log('Disabled roles:', newDisabledRoles);
      setDisabledRoles(newDisabledRoles);
    } catch (err) {
      console.error('Error fetching exclusive role assignments:', err);
    }
  };

  // Handle action selection for a match
  const handleActionChange = (index: number, action: 'do-nothing' | 'create-new' | 'update-existing') => {
    setMatches(prevMatches => {
      const updatedMatches = [...prevMatches];
      updatedMatches[index].action = action;
      
      // If switching to 'create-new', ensure selectedPilotId is null
      if (action === 'create-new') {
        updatedMatches[index].selectedPilotId = null;
      }
      
      return updatedMatches;
    });
  };

  // Handle pilot selection from dropdown
  const handlePilotChange = (index: number, pilotId: string | null) => {
    setMatches(prevMatches => {
      const updatedMatches = [...prevMatches];
      updatedMatches[index].selectedPilotId = pilotId;
      
      // Only change the action if it's not already 'create-new'
      if (updatedMatches[index].action !== 'create-new') {
        updatedMatches[index].action = pilotId ? 'update-existing' : 'do-nothing';
      }
      
      return updatedMatches;
    });
  };
  
  // Handle role selection from dropdown
  const handleRoleChange = (index: number, roleId: string | null) => {
    setMatches(prevMatches => {
      const updatedMatches = [...prevMatches];
      updatedMatches[index].roleId = roleId;
      return updatedMatches;
    });
  };
  
  // Handle status selection from dropdown
  const handleStatusChange = (index: number, statusId: string | null) => {
    setMatches(prevMatches => {
      const updatedMatches = [...prevMatches];
      updatedMatches[index].statusId = statusId;
      return updatedMatches;
    });
  };
  
  // Check if a role should be disabled for a specific pilot
  const isRoleDisabled = (roleId: string, pilotId: string | null) => {
    // If the role is not in the disabled map, it's available to everyone
    if (!disabledRoles[roleId]) {
      return false;
    }
    
    // If no pilot is selected or it's a new pilot, the role is disabled if it's exclusive and already assigned
    if (!pilotId) {
      return true;
    }
    
    // For existing pilots, check if they currently have this role assigned
    // This requires checking the database or the current pilot role assignments
    // Check with supabase if this pilot already has this role
    const role = roles.find(r => r.id === roleId);
    if (!role || !role.isExclusive) {
      return false;
    }
    
    // For existing pilots, check matches to see if they have this role already assigned
    const hasRole = matches.some(m => 
      m.selectedPilotId === pilotId && m.roleId === roleId
    );
    
    return !hasRole;
  };

  // Save changes and process matches
  const handleSave = async () => {
    setProcessing(true);
    setError(null);
    
    try {
      const result = await processPilotMatches(matches);
      
      // Sync Discord roles if enabled
      if (enableRoleSync) {
        await syncDiscordRoles();
      }
      
      if (onComplete) {
        onComplete(result);
      }
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process pilot matches');
    } finally {
      setProcessing(false);
    }
  };

  // Sync Discord roles for processed users
  const syncDiscordRoles = async () => {
    const syncResults = { synced: 0, failed: 0, errors: [] as string[] };
    
    try {
      // Get all users who have Discord IDs and need role sync
      const { data: userProfiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('*')
        .not('discord_id', 'is', null);

      if (profilesError) {
        throw new Error(`Failed to fetch user profiles: ${profilesError.message}`);
      }

      if (!userProfiles || userProfiles.length === 0) {
        return;
      }

      // Sync roles for each user
      for (const profile of userProfiles) {
        try {
          // Find matching Discord member from our loaded data
          const discordMember = matches.find(match => 
            match.discordMember?.user?.id === profile.discord_id
          )?.discordMember;

          if (!discordMember || !discordMember.roles) {
            continue;
          }

          // Convert Discord roles to the format expected by syncUserDiscordRoles
          const userRoles = discordMember.roles.map(roleId => {
            // In a real implementation, you'd map role IDs to role details
            // For now, we'll create a basic structure
            return {
              id: roleId,
              name: `Role_${roleId}`,
              permissions: '0'
            };
          });

          const { success, error } = await syncUserDiscordRoles(profile, userRoles);
          
          if (success) {
            syncResults.synced++;
          } else {
            syncResults.failed++;
            if (error) {
              syncResults.errors.push(`${profile.discord_username}: ${error}`);
            }
          }
        } catch (roleError: any) {
          syncResults.failed++;
          syncResults.errors.push(`${profile.discord_username}: ${roleError.message}`);
        }
      }

      setRoleSyncResults(syncResults);
      
    } catch (error: any) {
      console.error('Error syncing Discord roles:', error);
      setRoleSyncResults({
        synced: 0,
        failed: 0,
        errors: [`Role sync failed: ${error.message}`]
      });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Fixed overlay that covers entire screen */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onClose}
      />

      {/* Dialog card */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '1270px', // Increased width to accommodate fixed-width Role and Status columns
        maxWidth: '95%',
        maxHeight: '90vh',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A',
            margin: 0
          }}>
            Discord Pilots Integration
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            disabled={processing}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          padding: '24px', 
          overflowY: 'auto',
          flexGrow: 1
        }}>
          {error && (
            <div style={{
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              padding: '12px 16px',
              borderRadius: '4px',
              marginBottom: '16px',
              border: '1px solid #FCA5A5'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {loading ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 0'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #E2E8F0',
                borderTopColor: '#3B82F6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '16px'
              }} />
              <style>
                {`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}
              </style>
              <p style={{ color: '#64748B' }}>Loading Discord users...</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: '#374151', margin: '0 0 12px 0' }}>
                  Found {matches.length} users from Discord. Review and confirm the matches below.
                </p>
                <p style={{ color: '#4B5563', margin: '0', fontSize: '14px' }}>
                  Role assignment rules: Roles can only be assigned to pilots with Command or Staff status, and exclusive roles can only be assigned to one pilot at a time.
                </p>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase' }}>Board #</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '160px' }}>Callsign</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '160px' }}>Discord Username</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase' }}>Discord Display</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '160px' }}>Role</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '160px' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '280px' }}>Pilot Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match, index) => {
                      const isEditable = match.action === 'create-new' || match.action === 'update-existing';
                      const isDisabled = match.action === 'do-nothing';
                      
                      return (
                        <tr 
                          key={match.discordMember.id} 
                          style={{ 
                            borderBottom: '1px solid #E5E7EB',
                            backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
                          }}
                        >
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              {!isEditable && match.discordMember.boardNumber ? (
                                <div style={{ padding: '6px 0' }}>{match.discordMember.boardNumber}</div>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="###"
                                  disabled={isDisabled}
                                  value={match.discordMember.boardNumber || ''}
                                  onChange={(e) => {
                                    const updatedMatches = [...matches];
                                    updatedMatches[index].discordMember.boardNumber = e.target.value;
                                    setMatches(updatedMatches);
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '6px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                  }}
                                />
                              )}
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              {!isEditable && match.discordMember.callsign ? (
                                <div style={{ padding: '6px 0' }}>{match.discordMember.callsign}</div>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Callsign"
                                  disabled={isDisabled}
                                  value={match.discordMember.callsign || ''}
                                  onChange={(e) => {
                                    const updatedMatches = [...matches];
                                    updatedMatches[index].discordMember.callsign = e.target.value;
                                    setMatches(updatedMatches);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              )}
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <div style={{ padding: '6px 0' }}>{match.discordMember.username}</div>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div>
                              <div style={{ padding: '6px 0' }}>{match.discordMember.displayName}</div>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select
                                disabled={isDisabled}
                                value={match.roleId || ''}
                                onChange={(e) => handleRoleChange(index, e.target.value || null)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">No Role</option>
                                {roles.map(role => {
                                  // Check if this role should be disabled for this pilot
                                  const isDisabled = isRoleDisabled(role.id, match.selectedPilotId);
                                  
                                  return (
                                    <option 
                                      key={role.id} 
                                      value={role.id}
                                      disabled={isDisabled}
                                      style={{ color: isDisabled ? '#9CA3AF' : 'inherit' }}
                                    >
                                      {role.name}{isDisabled ? ' (Already Assigned)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              {match.discordMember.role && !match.roleId && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#9CA3AF', 
                                    marginTop: '4px' 
                                  }}>
                                    Detected: {match.discordMember.role}
                                  </span>
                                </div>
                              )}
                              {!(match.discordMember.role && !match.roleId) && (
                                <div style={{ height: '20px' }}></div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select
                                disabled={isDisabled}
                                value={match.statusId || ''}
                                onChange={(e) => handleStatusChange(index, e.target.value || null)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">Select Status</option>
                                {statuses.map(status => (
                                  <option key={status.id} value={status.id}>
                                    {status.name}
                                  </option>
                                ))}
                              </select>
                              {match.discordMember.status && !match.statusId && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#9CA3AF', 
                                    marginTop: '4px' 
                                  }}>
                                    Detected: {match.discordMember.status}
                                  </span>
                                </div>
                              )}
                              {!(match.discordMember.status && !match.statusId) && (
                                <div style={{ height: '20px' }}></div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select 
                                value={match.selectedPilotId || (match.action === 'create-new' ? 'create-new' : 'do-nothing')}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  
                                  // Handle dropdown selection
                                  if (value === 'create-new') {
                                    // Set action to create-new, clear pilot selection
                                    handleActionChange(index, 'create-new');
                                  } else if (value === 'do-nothing') {
                                    // Set action to do-nothing, clear pilot selection
                                    handleActionChange(index, 'do-nothing');
                                    handlePilotChange(index, null);
                                  } else {
                                    // Set action to update-existing with the selected pilot ID
                                    handleActionChange(index, 'update-existing');
                                    handlePilotChange(index, value);
                                    
                                    // Set role and status to match the selected pilot's current values
                                    const selectedPilot = allPilots.find(p => p.id === value);
                                    if (selectedPilot) {
                                      // Find the pilot's current role and status in the database
                                      (async () => {
                                        try {
                                          const { data } = await supabase
                                            .from('pilots')
                                            .select('role_id, status_id')
                                            .eq('id', value)
                                            .single();
                                            
                                          if (data) {
                                            // Update the match with the current role and status
                                            setMatches(prevMatches => {
                                              const updatedMatches = [...prevMatches];
                                              updatedMatches[index].roleId = data.role_id;
                                              updatedMatches[index].statusId = data.status_id;
                                              return updatedMatches;
                                            });
                                          }
                                        } catch (err) {
                                          console.error('Error fetching pilot roles and status:', err);
                                        }
                                      })();
                                    }
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px',
                                  backgroundColor: match.selectedPilotId ? '#EFF6FF' : '#FFFFFF'
                                }}
                              >
                                <option value="do-nothing">Do nothing</option>
                                <option value="create-new">Create new pilot</option>
                                {allPilots.map(pilot => (
                                  <option 
                                    key={pilot.id} 
                                    value={pilot.id}
                                  >
                                    {pilot.boardNumber} {pilot.callsign}
                                  </option>
                                ))}
                              </select>
                              
                              {match.action === 'create-new' && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#047857', 
                                    marginTop: '4px' 
                                  }}>
                                    Create new pilot record
                                  </span>
                                </div>
                              )}
                              
                              {match.action === 'update-existing' && match.selectedPilotId && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#3B82F6', 
                                    marginTop: '4px' 
                                  }}>
                                    Update existing pilot record
                                  </span>
                                </div>
                              )}
                              
                              {!(match.action === 'create-new' || (match.action === 'update-existing' && match.selectedPilotId)) && (
                                <div style={{ height: '20px' }}></div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #E2E8F0',
          padding: '16px 24px'
        }}>
          {/* Role Sync Options */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} className="text-blue-600" />
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#374151',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={enableRoleSync}
                  onChange={(e) => setEnableRoleSync(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Sync Discord role permissions
              </label>
            </div>
            
            {roleSyncResults.synced > 0 || roleSyncResults.failed > 0 ? (
              <div style={{
                fontSize: '12px',
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="text-green-600">✓ {roleSyncResults.synced} synced</span>
                {roleSyncResults.failed > 0 && (
                  <span className="text-red-600">✗ {roleSyncResults.failed} failed</span>
                )}
              </div>
            ) : enableRoleSync && (
              <span style={{
                fontSize: '12px',
                color: '#6B7280',
                fontStyle: 'italic'
              }}>
                Will update user permissions based on Discord roles
              </span>
            )}
          </div>
          
          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}>
          <button
            onClick={onClose}
            disabled={processing}
            style={{
              padding: '8px 16px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={processing || loading}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2563EB',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {processing && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#FFFFFF',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            Accept
          </button>
          </div>
        </div>
      </div>
    </>
  );
};