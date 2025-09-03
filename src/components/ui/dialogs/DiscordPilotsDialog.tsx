import React, { useState, useEffect, useRef } from 'react';
import { 
  DiscordPilotMatch, 
  fetchDiscordGuildMembers, 
  matchDiscordMembersWithPilots,
  processPilotMatches
} from '../../../utils/discordPilotService';
import { syncUserDiscordRoles } from '../../../utils/discordRoleSync';
import { X, Shield, Filter, Eye, EyeOff } from 'lucide-react';
import { Pilot, PilotStatus } from '../../../types/PilotTypes';
import { supabase } from '../../../utils/supabaseClient';
import { Status } from '../../../utils/statusService';
import { Role } from '../../../utils/roleService';

// Add custom styles for optgroup indentation to match Squadron Discord dialog
const optgroupStyles = `
  .custom-pilot-select optgroup {
    padding-left: 0px !important;
    margin-left: 0px !important;
    text-indent: 0px !important;
    font-style: normal !important;
    font-weight: bold !important;
  }
  .custom-pilot-select option {
    padding-left: 20px !important;
    text-indent: 0px !important;
  }
  
  /* Target specific browsers */
  .custom-pilot-select optgroup:before {
    content: none !important;
  }
  
  /* WebKit specific */
  .custom-pilot-select optgroup[label]:before {
    content: none !important;
  }
  
  /* Firefox specific */
  @-moz-document url-prefix() {
    .custom-pilot-select optgroup {
      padding-inline-start: 0px !important;
    }
    .custom-pilot-select option {
      padding-inline-start: 20px !important;
    }
  }
`;

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
  // const [disabledRoles, setDisabledRoles] = useState<Record<string, boolean>>({});
  const [enableRoleSync, setEnableRoleSync] = useState(true);
  const [roleSyncResults, setRoleSyncResults] = useState<{
    synced: number;
    failed: number;
    errors: string[];
  }>({ synced: 0, failed: 0, errors: [] });
  const [squadrons, setSquadrons] = useState<any[]>([]);
  const [showSquadronFilter, setShowSquadronFilter] = useState(false);
  const [showStandingFilter, setShowStandingFilter] = useState(false);
  const [showDiscordRolesFilter, setShowDiscordRolesFilter] = useState(false);
  const [filterSquadronIds, setFilterSquadronIds] = useState<string[]>([]);
  const [filterStandingIds, setFilterStandingIds] = useState<string[]>([]);
  const [filterDiscordRoles, setFilterDiscordRoles] = useState<string[]>([]);
  const [roleFilterMode, setRoleFilterMode] = useState<Record<string, 'none' | 'include' | 'exclude'>>({});
  const [showRolesPopup, setShowRolesPopup] = useState<string | null>(null); // Store the Discord member ID
  const [popupPosition, setPopupPosition] = useState<{ top: number; shouldFlipUp: boolean } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Close popups and dropdowns when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && dialogRef.current.contains(event.target as Node)) {
        // Click is inside the dialog, check if it's outside the popups
        const target = event.target as Element;
        if (!target.closest('[data-popup]') && !target.closest('[data-filter-dropdown]')) {
          setShowRolesPopup(null);
          setPopupPosition(null);
          setShowSquadronFilter(false);
          setShowStandingFilter(false);
          setShowDiscordRolesFilter(false);
        }
      }
    };

    const handleScroll = () => {
      // Close popup when user scrolls
      setShowRolesPopup(null);
      setPopupPosition(null);
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    // Add scroll event listener to the table container
    if (tableContainerRef.current) {
      tableContainerRef.current.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (tableContainerRef.current) {
        tableContainerRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Load Discord members and existing pilots
  const loadData = async () => {
    setLoading(true);
    setError(null);
    console.log('Starting Discord Pilots Dialog load...');
    
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
      
      // Fetch squadrons for dropdown
      const { data: squadronsData, error: squadronsError } = await supabase
        .from('org_squadrons')
        .select('*')
        .order('name', { ascending: true });
        
      if (squadronsError) throw squadronsError;
      setSquadrons(squadronsData || []);
      
      // First fetch exclusive role assignments since we need this before showing the UI
      // This ensures the role restrictions are shown on first open
      if (rolesData && rolesData.length > 0) {
        await fetchExclusiveRoleAssignments(rolesData);
      }
      
      // Fetch Discord guild members
      const discordMembers = await fetchDiscordGuildMembers();
      
      // Fetch squadron role mappings to filter out ignored users
      const { data: squadronRoleData } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .not('discord_integration', 'is', null);
      
      // Collect all "ignore user" role IDs from all squadrons
      const ignoreRoleIds: string[] = [];
      console.log('DEBUG: Squadron discord_integration data:', squadronRoleData);
      
      if (squadronRoleData) {
        squadronRoleData.forEach((squadron, index) => {
          console.log(`DEBUG: Squadron ${index} discord_integration:`, squadron.discord_integration);
          
          // Try different possible data structures
          const discordIntegration = squadron.discord_integration;
          let roleMappings = [];
          
          if (discordIntegration && typeof discordIntegration === 'object') {
            // Try direct roleMappings
            const integrationObj = discordIntegration as any;
            if (integrationObj.roleMappings) {
              roleMappings = integrationObj.roleMappings;
            }
            // Try isIgnoreUsers directly in discord_integration
            else if (integrationObj.isIgnoreUsers) {
              // Handle if isIgnoreUsers is stored differently
              console.log('DEBUG: Found isIgnoreUsers directly in discord_integration');
            }
            // Try if the structure is different
            else {
              console.log('DEBUG: discord_integration structure:', Object.keys(integrationObj));
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
      const initialMatches = await matchDiscordMembersWithPilots(filteredDiscordMembers);
      
      // Set default action - matched pilots selected, unmatched clear fields
      const matches = initialMatches.map(match => {
        if (match.matchedPilot) {
          // Matched pilot - select them by default for update
          return {
            ...match,
            action: 'update-existing' as 'do-nothing' | 'create-new' | 'update-existing',
            selectedPilotId: match.matchedPilot.id
          };
        } else {
          // Unmatched pilot - clear board number and callsign, keep role mappings
          return {
            ...match,
            action: 'do-nothing' as 'do-nothing' | 'create-new' | 'update-existing',
            selectedPilotId: null,
            discordMember: {
              ...match.discordMember,
              boardNumber: null, // Clear board number for unmatched
              callsign: null     // Clear callsign for unmatched
            }
          };
        }
      });
      
      // Get first 15 pilots for the dropdowns to speed up initial load
      const { data: initialPilotsData } = await supabase
        .from('pilots')
        .select('*')
        .limit(15);
      
      if (initialPilotsData) {
        // Convert initial Supabase pilots to legacy format
        const initialPilots = initialPilotsData.map(p => ({
          id: p.id,
          callsign: p.callsign,
          boardNumber: p.boardNumber.toString(),
          status: 'Provisional' as PilotStatus,
          billet: '',
          qualifications: [],
          discordUsername: p.discord_original_id || ''
        }));
        
        setAllPilots(initialPilots);
        console.log('Initial pilots loaded for dropdown:', initialPilots.length);
      }
      
      // Load remaining pilots immediately after dialog is shown (non-blocking)
      setTimeout(async () => {
        try {
          const { data: allPilotsData } = await supabase
            .from('pilots')
            .select('*');
          
          if (allPilotsData) {
            // Convert all Supabase pilots to legacy format
            const allPilots = allPilotsData.map(p => ({
              id: p.id,
              callsign: p.callsign,
              boardNumber: p.boardNumber.toString(),
              status: 'Provisional' as PilotStatus,
              billet: '',
              qualifications: [],
              discordUsername: p.discord_original_id || ''
            }));
            
            setAllPilots(allPilots);
            console.log('All pilots loaded for dropdown:', allPilots.length);
          }
        } catch (error) {
          console.warn('Failed to load remaining pilots:', error);
        }
      }, 50);
      
      // Now populate current squadron, status, and role for matched pilots
      const enrichedMatches = await Promise.all(matches.map(async (match) => {
        // Check if we have a matched pilot regardless of selectedPilotId since we cleared it
        if (match.matchedPilot) {
          try {
            console.log(`DEBUG: Loading assignments for pilot ${match.matchedPilot.id} (${match.matchedPilot.callsign})`);
            
            // Get current squadron assignment
            const { data: squadronAssignment, error: squadronError } = await supabase
              .from('pilot_assignments')
              .select('squadron_id')
              .eq('pilot_id', match.matchedPilot.id)
              .is('end_date', null)
              .single();
            
            console.log(`DEBUG: Squadron query result:`, squadronAssignment, squadronError);
            
            // Also check if the pilot has a direct squadron reference in pilots table
            const { data: pilotData } = await supabase
              .from('pilots')
              .select('*')
              .eq('id', match.matchedPilot.id)
              .single();
              
            console.log(`DEBUG: Pilot data:`, pilotData);
            
            // Get current status
            const { data: statusAssignment, error: statusError } = await supabase
              .from('pilot_statuses')
              .select('status_id, statuses(id, name)')
              .eq('pilot_id', match.matchedPilot.id)
              .is('end_date', null)
              .single();
            
            console.log(`DEBUG: Status query result:`, statusAssignment, statusError);
            
            // Get current role
            const { data: roleAssignment, error: roleError } = await supabase
              .from('pilot_roles')
              .select('role_id, roles(id, name)')
              .eq('pilot_id', match.matchedPilot.id)
              .is('end_date', null)
              .single();
            
            console.log(`DEBUG: Role query result:`, roleAssignment, roleError);
            
            // Update the match with current values
            const updatedMatch = {
              ...match,
              squadronId: squadronAssignment?.squadron_id || match.squadronId,
              statusId: statusAssignment?.status_id || match.statusId,
              roleId: roleAssignment?.role_id || match.roleId
            };
            
            console.log(`DEBUG: Updated match for ${match.matchedPilot.callsign}:`, {
              squadronId: updatedMatch.squadronId,
              statusId: updatedMatch.statusId,
              roleId: updatedMatch.roleId
            });
            
            return updatedMatch;
          } catch (error) {
            console.error('Error fetching current pilot assignments:', error);
            return match;
          }
        }
        return match;
      }));
      
      // Log matches after they're created
      console.log('Final matches for UI rendering:', enrichedMatches.map(m => ({
        discord: m.discordMember.displayName,
        matchedPilot: m.matchedPilot ? `${m.matchedPilot.callsign} (${m.matchedPilot.id})` : 'none',
        action: m.action,
        selectedPilotId: m.selectedPilotId,
        roleId: m.roleId,
        statusId: m.statusId,
        squadronId: m.squadronId
      })));
      
      
      setMatches(enrichedMatches);
      
      // Set default Discord Roles filter to exclude ignore roles
      if (ignoreRoleIds.length > 0) {
        // Get all unique Discord roles from matches
        const allDiscordRoles = Array.from(new Set(enrichedMatches.flatMap(m => m.discordMember.roles || [])));
        // Filter out ignore roles by default
        const nonIgnoreRoles = allDiscordRoles.filter(role => !ignoreRoleIds.includes(role));
        setFilterDiscordRoles(nonIgnoreRoles);
      }
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
      // setDisabledRoles(newDisabledRoles);
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
  // Calculate popup position to avoid clipping
  const calculatePopupPosition = (buttonElement: HTMLElement) => {
    if (!tableContainerRef.current) return { top: -20, shouldFlipUp: false };
    
    const containerRect = tableContainerRef.current.getBoundingClientRect();
    const buttonRect = buttonElement.getBoundingClientRect();
    
    // Estimate popup height (approximately 250px based on content)
    const popupHeight = 250;
    
    // Calculate available space below the button within the container
    const spaceBelow = containerRect.bottom - buttonRect.bottom;
    
    // If there's enough space below, position normally (slightly above button)
    if (spaceBelow >= popupHeight + 20) { // 20px buffer
      return { top: -20, shouldFlipUp: false };
    }
    
    // If not enough space below, position so bottom of popup aligns with bottom of container
    // Calculate how much we need to shift up from the normal position
    const normalBottom = buttonRect.top + popupHeight - 20; // Where bottom would be in normal position
    const maxBottom = containerRect.bottom - 10; // 10px margin from container bottom
    const shiftUp = normalBottom - maxBottom;
    
    return { top: -20 - Math.max(0, shiftUp), shouldFlipUp: false };
  };

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
  
  // Handle squadron selection from dropdown
  const handleSquadronChange = (index: number, squadronId: string | null) => {
    setMatches(prevMatches => {
      const updatedMatches = [...prevMatches];
      updatedMatches[index].squadronId = squadronId;
      return updatedMatches;
    });
  };
  
  // Check if a role should be disabled for a specific pilot
  // const isRoleDisabled = (roleId: string, pilotId: string | null) => {
  //   // If the role is not in the disabled map, it's available to everyone
  //   if (!disabledRoles[roleId]) {
  //     return false;
  //   }
  //   
  //   // If no pilot is selected or it's a new pilot, the role is disabled if it's exclusive and already assigned
  //   if (!pilotId) {
  //     return true;
  //   }
  //   
  //   // For existing pilots, check if they currently have this role assigned
  //   // This requires checking the database or the current pilot role assignments
  //   // Check with supabase if this pilot already has this role
  //   const role = roles.find(r => r.id === roleId);
  //   if (!role || !role.isExclusive) {
  //     return false;
  //   }
  //   
  //   // For existing pilots, check matches to see if they have this role already assigned
  //   const hasRole = matches.some(m => 
  //     m.selectedPilotId === pilotId && m.roleId === roleId
  //   );
  //   
  //   return !hasRole;
  // };

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
            match.discordMember?.id === profile.discord_id
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

          // Transform database profile to UserProfile interface format
          const userProfile = {
            ...profile,
            authUserId: profile.auth_user_id,
            createdAt: profile.created_at || new Date().toISOString(),
            updatedAt: profile.updated_at || new Date().toISOString()
          };
          
          const { success, error } = await syncUserDiscordRoles(userProfile, userRoles);
          
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

  // Filter matches based on column filter selections
  const filteredMatches = matches.filter(match => {
    // Squadron filter
    if (filterSquadronIds.length > 0) {
      const matchSquadronId = match.squadronId || 'unassigned';
      if (!filterSquadronIds.includes(matchSquadronId)) {
        return false;
      }
    }
    
    // Standing filter
    if (filterStandingIds.length > 0 && !filterStandingIds.includes(match.statusId || '')) {
      return false;
    }
    
    // Discord Roles filter - 3-way toggle system
    const memberRoles = match.discordMember.roles || [];
    const activeFilters = Object.entries(roleFilterMode).filter(([_, mode]) => mode !== 'none');
    
    if (activeFilters.length > 0) {
      for (const [role, mode] of activeFilters) {
        const hasRole = memberRoles.includes(role);
        
        if (mode === 'include' && !hasRole) {
          return false; // Member must have this role
        }
        if (mode === 'exclude' && hasRole) {
          return false; // Member must NOT have this role
        }
      }
    }
    
    return true;
  });

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
        width: '1700px', // Further increased width to accommodate Discord Roles column
        maxWidth: '95%',
        maxHeight: '90vh',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column'
      }} ref={dialogRef}>
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
          {/* Inject custom styles */}
          <style dangerouslySetInnerHTML={{ __html: optgroupStyles }} />
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
                  Found {matches.length} users from Discord. {filteredMatches.length < matches.length ? `Showing ${filteredMatches.length} of ${matches.length} after filtering.` : 'Review and confirm the matches below.'}
                </p>
                <p style={{ color: '#4B5563', margin: '0', fontSize: '14px' }}>
                  Role assignment rules: Roles can only be assigned to pilots with Command or Staff status, and exclusive roles can only be assigned to one pilot at a time.
                </p>
              </div>
              
                    
              <div ref={tableContainerRef} style={{ height: '800px', border: '1px solid #E5E7EB', borderRadius: '6px', position: 'relative', overflow: 'visible' }}>
                <div style={{ overflowX: 'auto', overflowY: 'auto', height: '100%', position: 'relative' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '168px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Pilot Record</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '80px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Board #</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '120px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Callsign</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '140px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Discord Username</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '180px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Discord Display Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '140px', position: 'relative', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Discord Roles
                          <button
                            onClick={() => setShowDiscordRolesFilter(!showDiscordRolesFilter)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px',
                              cursor: 'pointer',
                              color: filterDiscordRoles.length > 0 ? '#2563EB' : '#6B7280'
                            }}
                          >
                            <Filter size={12} />
                          </button>
                        </div>
                        {showDiscordRolesFilter && (
                          <div data-filter-dropdown="discord-roles" style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            minWidth: '200px',
                            backgroundColor: 'white',
                            border: '1px solid #E5E7EB',
                            borderRadius: '4px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000,
                            maxHeight: '400px', // Half of dialog height (~800px)
                            display: 'flex',
                            flexDirection: 'column'
                          }}>
                            <div style={{
                              flex: 1,
                              overflowY: 'auto',
                              minHeight: 'fit-content'
                            }}>
                              {Array.from(new Set(matches.flatMap(m => m.discordMember.roles || []))).map(role => {
                                const mode = roleFilterMode[role] || 'none';
                                let backgroundColor = 'transparent';
                                let icon = null;
                                
                                if (mode === 'include') {
                                  backgroundColor = '#EFF6FF';
                                  icon = <Eye size={12} style={{ color: '#3B82F6' }} />;
                                } else if (mode === 'exclude') {
                                  backgroundColor = '#FEF2F2';
                                  icon = <EyeOff size={12} style={{ color: '#EF4444' }} />;
                                }
                                
                                return (
                                  <div key={role} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: backgroundColor,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const currentMode = roleFilterMode[role] || 'none';
                                    let newMode: 'none' | 'include' | 'exclude' = 'none';
                                    
                                    if (currentMode === 'none') {
                                      newMode = 'include';
                                    } else if (currentMode === 'include') {
                                      newMode = 'exclude';
                                    } else {
                                      newMode = 'none';
                                    }
                                    
                                    setRoleFilterMode(prev => ({
                                      ...prev,
                                      [role]: newMode
                                    }));
                                  }}
                                  >
                                    {icon || <div style={{ width: '12px', height: '12px' }} />}
                                    <span>{role}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{
                              padding: '8px 12px',
                              borderTop: '1px solid #E5E7EB',
                              backgroundColor: '#F9FAFB',
                              display: 'flex',
                              gap: '8px',
                              justifyContent: 'space-between',
                              flexShrink: 0
                            }}>
                              <button
                                onClick={() => {
                                  const allRoles = Array.from(new Set(matches.flatMap(m => m.discordMember.roles || [])));
                                  const newMode: Record<string, 'none' | 'include' | 'exclude'> = {};
                                  allRoles.forEach(role => {
                                    newMode[role] = 'include';
                                  });
                                  setRoleFilterMode(newMode);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Include All
                              </button>
                              <button
                                onClick={() => setRoleFilterMode({})}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                        )}
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '120px', position: 'relative', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Standing
                          <button
                            onClick={() => setShowStandingFilter(!showStandingFilter)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px',
                              cursor: 'pointer',
                              color: filterStandingIds.length > 0 ? '#2563EB' : '#6B7280'
                            }}
                          >
                            <Filter size={12} />
                          </button>
                        </div>
                        {showStandingFilter && (
                          <div data-filter-dropdown="standing" style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            minWidth: '200px',
                            backgroundColor: 'white',
                            border: '1px solid #E5E7EB',
                            borderRadius: '4px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000,
                            maxHeight: `${Math.min(statuses.length * 32 + 80, 300)}px`,
                            display: 'flex',
                            flexDirection: 'column'
                          }}>
                            <div style={{
                              flex: 1,
                              overflowY: 'auto',
                              paddingRight: '20px'
                            }}>
                              {statuses.map(status => (
                                <div key={status.id} style={{
                                  padding: '8px 12px',
                                  borderBottom: '1px solid #F3F4F6',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  backgroundColor: filterStandingIds.includes(status.id) ? '#EFF6FF' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onClick={() => {
                                  const newSelection = filterStandingIds.includes(status.id) 
                                    ? filterStandingIds.filter(id => id !== status.id)
                                    : [...filterStandingIds, status.id];
                                  setFilterStandingIds(newSelection);
                                }}
                                >
                                  <input type="checkbox" checked={filterStandingIds.includes(status.id)} readOnly />
                                  <span>{status.name}</span>
                                </div>
                              ))}
                            </div>
                            <div style={{
                              padding: '8px 12px',
                              borderTop: '1px solid #E5E7EB',
                              backgroundColor: '#F9FAFB',
                              display: 'flex',
                              gap: '8px',
                              justifyContent: 'space-between',
                              flexShrink: 0
                            }}>
                              <button
                                onClick={() => setFilterStandingIds(statuses.map(s => s.id))}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Select All
                              </button>
                              <button
                                onClick={() => setFilterStandingIds([])}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                        )}
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '150px', position: 'relative', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Squadron
                          <button
                            onClick={() => setShowSquadronFilter(!showSquadronFilter)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px',
                              cursor: 'pointer',
                              color: filterSquadronIds.length > 0 ? '#2563EB' : '#6B7280'
                            }}
                          >
                            <Filter size={12} />
                          </button>
                        </div>
                        {showSquadronFilter && (
                          <div data-filter-dropdown="squadron" style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            minWidth: '270px',
                            backgroundColor: 'white',
                            border: '1px solid #E5E7EB',
                            borderRadius: '4px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000,
                            maxHeight: `${Math.min((squadrons.length + 1) * 48 + 80, 350)}px`,
                            display: 'flex',
                            flexDirection: 'column'
                          }}>
                            <div style={{
                              flex: 1,
                              overflowY: 'auto',
                              paddingRight: '20px'
                            }}>
                              <div style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #F3F4F6',
                                fontSize: '12px',
                                cursor: 'pointer',
                                backgroundColor: filterSquadronIds.includes('unassigned') ? '#EFF6FF' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              onClick={() => {
                                const newSelection = filterSquadronIds.includes('unassigned') 
                                  ? filterSquadronIds.filter(id => id !== 'unassigned')
                                  : [...filterSquadronIds, 'unassigned'];
                                setFilterSquadronIds(newSelection);
                              }}
                              >
                                <input type="checkbox" checked={filterSquadronIds.includes('unassigned')} readOnly />
                                <span>Unassigned</span>
                              </div>
                              {squadrons.map(squadron => (
                                <div key={squadron.id} style={{
                                  padding: '8px 12px',
                                  borderBottom: '1px solid #F3F4F6',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  backgroundColor: filterSquadronIds.includes(squadron.id) ? '#EFF6FF' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onClick={() => {
                                  const newSelection = filterSquadronIds.includes(squadron.id) 
                                    ? filterSquadronIds.filter(id => id !== squadron.id)
                                    : [...filterSquadronIds, squadron.id];
                                  setFilterSquadronIds(newSelection);
                                }}
                                >
                                  <input type="checkbox" checked={filterSquadronIds.includes(squadron.id)} readOnly />
                                  {squadron.insignia_url ? (
                                    <div style={{
                                      width: '16px',
                                      height: '16px',
                                      backgroundImage: `url(${squadron.insignia_url})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      borderRadius: '2px',
                                      flexShrink: 0
                                    }} />
                                  ) : (
                                    <div style={{
                                      width: '16px',
                                      height: '16px',
                                      backgroundColor: '#F3F4F6',
                                      borderRadius: '2px',
                                      flexShrink: 0
                                    }} />
                                  )}
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ fontWeight: 500 }}>{squadron.designation}</div>
                                    <div style={{ color: '#6B7280', fontSize: '10px' }}>{squadron.name}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{
                              padding: '8px 12px',
                              borderTop: '1px solid #E5E7EB',
                              backgroundColor: '#F9FAFB',
                              display: 'flex',
                              gap: '8px',
                              justifyContent: 'space-between',
                              flexShrink: 0
                            }}>
                              <button
                                onClick={() => {
                                  const allIds = ['unassigned', ...squadrons.map(s => s.id)];
                                  setFilterSquadronIds(allIds);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Select All
                              </button>
                              <button
                                onClick={() => setFilterSquadronIds([])}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: '#6B7280',
                                  cursor: 'pointer'
                                }}
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                        )}
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '120px', backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>Billet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.map((match, filteredIndex) => {
                      // Find the original index in the matches array
                      const originalIndex = matches.findIndex(m => m.discordMember.id === match.discordMember.id);
                      const isEditable = match.action === 'create-new' || match.action === 'update-existing';
                      const isDisabled = match.action === 'do-nothing';
                      
                      return (
                        <tr 
                          key={match.discordMember.id} 
                          style={{ 
                            borderBottom: '1px solid #E5E7EB',
                            backgroundColor: filteredIndex % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                            height: '60px'
                          }}
                        >
                          {/* 1. Pilot Record Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px', width: '168px' }}>
                            <div>
                              <select 
                                className="custom-pilot-select"
                                value={match.selectedPilotId || (match.action === 'create-new' ? 'create-new' : 'do-nothing')}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  
                                  // Handle dropdown selection
                                  if (value === 'create-new') {
                                    // Set action to create-new, clear pilot selection
                                    handleActionChange(originalIndex, 'create-new');
                                  } else if (value === 'do-nothing') {
                                    // Set action to do-nothing, clear pilot selection
                                    handleActionChange(originalIndex, 'do-nothing');
                                    handlePilotChange(originalIndex, null);
                                  } else {
                                    // Set action to update-existing with the selected pilot ID
                                    handleActionChange(originalIndex, 'update-existing');
                                    handlePilotChange(originalIndex, value);
                                    
                                    // Set role and status to match the selected pilot's current values
                                    const selectedPilot = allPilots.find(p => p.id === value);
                                    if (selectedPilot) {
                                      // Find the pilot's current role and status in the database
                                      (async () => {
                                        try {
                                          // Note: role_id and status_id columns don't exist in pilots table
                                          // Roles are stored in separate tables with joins
                                          const pilotData = { role: 'Unknown', status: 'Unknown' };
                                          
                                          if (pilotData) {
                                            // Update the match with the current role and status
                                            setMatches(prevMatches => {
                                              const updatedMatches = [...prevMatches];
                                              updatedMatches[originalIndex].roleId = null; // Role system needs proper implementation
                                              updatedMatches[originalIndex].statusId = null; // Status system needs proper implementation
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
                                disabled={loading}
                                style={{
                                  width: '152px',
                                  maxWidth: '152px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  padding: '4px 8px',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">Select pilot action</option>
                                <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                                  Actions
                                </option>
                                <option value="do-nothing" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Do Nothing</option>
                                <option value="create-new" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Create New Pilot</option>
                                <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                                  Update Existing Pilot
                                </option>
                                {allPilots
                                  .sort((a, b) => parseInt(a.boardNumber) - parseInt(b.boardNumber))
                                  .map(pilot => (
                                    <option key={pilot.id} value={pilot.id} style={{ paddingLeft: '20px' }}>
                                      &nbsp;&nbsp;{pilot.boardNumber} {pilot.callsign}
                                    </option>
                                  ))}
                              </select>
                              
                              {match.action === 'create-new' && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#059669', 
                                    marginTop: '4px' 
                                  }}>
                                    Create New Record
                                  </span>
                                </div>
                              )}
                              
                              {match.action === 'update-existing' && match.selectedPilotId && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#0284C7', 
                                    marginTop: '4px' 
                                  }}>
                                    Update Existing Record
                                  </span>
                                </div>
                              )}
                              
                              {match.action === 'do-nothing' && (
                                <div style={{ height: '20px' }}>
                                  <span style={{ 
                                    display: 'block', 
                                    fontSize: '12px', 
                                    color: '#9CA3AF', 
                                    marginTop: '4px' 
                                  }}>
                                    Do Nothing
                                  </span>
                                </div>
                              )}
                              
                              {!(match.action === 'create-new' || (match.action === 'update-existing' && match.selectedPilotId) || match.action === 'do-nothing') && (
                                <div style={{ height: '20px' }}></div>
                              )}
                            </div>
                          </td>

                          {/* 2. Board Number Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              {!isEditable && (match.matchedPilot?.boardNumber || match.discordMember.boardNumber) ? (
                                <div style={{ padding: '6px 0' }}>{match.matchedPilot?.boardNumber || match.discordMember.boardNumber}</div>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="###"
                                  disabled={isDisabled}
                                  value={match.matchedPilot?.boardNumber || match.discordMember.boardNumber || ''}
                                  onChange={(e) => {
                                    const updatedMatches = [...matches];
                                    if (updatedMatches[originalIndex].matchedPilot) {
                                      // Don't modify matched pilot's board number directly
                                      updatedMatches[originalIndex].discordMember.boardNumber = e.target.value;
                                    } else {
                                      updatedMatches[originalIndex].discordMember.boardNumber = e.target.value;
                                    }
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
                          {/* 3. Callsign Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              {!isEditable && (match.matchedPilot?.callsign || match.discordMember.callsign) ? (
                                <div style={{ padding: '6px 0' }}>{match.matchedPilot?.callsign || match.discordMember.callsign}</div>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Callsign"
                                  disabled={isDisabled}
                                  value={match.matchedPilot?.callsign || match.discordMember.callsign || ''}
                                  onChange={(e) => {
                                    const updatedMatches = [...matches];
                                    if (updatedMatches[originalIndex].matchedPilot) {
                                      // Don't modify matched pilot's callsign directly
                                      updatedMatches[originalIndex].discordMember.callsign = e.target.value;
                                    } else {
                                      updatedMatches[originalIndex].discordMember.callsign = e.target.value;
                                    }
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

                          {/* 4. Discord Username Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <div style={{ padding: '6px 0' }}>{match.discordMember.username}</div>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>

                          {/* 5. Discord Display Name Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div>
                              <div style={{ padding: '6px 0' }}>{match.discordMember.displayName}</div>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>

                          {/* 6. Discord Roles Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px', verticalAlign: 'top' }}>
                            <div style={{ padding: '6px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px', color: '#374151' }}>
                                {match.discordMember.roles?.length || 0}
                              </span>
                              {(match.discordMember.roles?.length || 0) > 0 && (
                                <div style={{ position: 'relative' }}>
                                  <button
                                    onClick={(e) => {
                                      const isOpening = showRolesPopup !== match.discordMember.id;
                                      if (isOpening) {
                                        const position = calculatePopupPosition(e.currentTarget);
                                        setPopupPosition(position);
                                        setShowRolesPopup(match.discordMember.id);
                                      } else {
                                        setShowRolesPopup(null);
                                        setPopupPosition(null);
                                      }
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '2px',
                                      cursor: 'pointer',
                                      color: '#6B7280',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Eye size={14} />
                                  </button>
                                  
                                  {showRolesPopup === match.discordMember.id && popupPosition && (
                                    <div 
                                      data-popup="roles" 
                                      style={{
                                        position: 'absolute',
                                        top: `${popupPosition.top}px`,
                                        left: 'calc(100% + 8px)',
                                        backgroundColor: 'white',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '8px',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                        zIndex: 99999,
                                        padding: '12px',
                                        minWidth: '200px',
                                        maxWidth: '300px'
                                      }}>
                                      <div style={{
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        color: '#374151',
                                        marginBottom: '8px',
                                        textAlign: 'center'
                                      }}>
                                        Discord Roles
                                      </div>
                                      <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '4px'
                                      }}>
                                        {match.discordMember.roles?.map((role) => {
                                          return (
                                            <div
                                              key={role}
                                              style={{
                                                padding: '8px 12px',
                                                backgroundColor: '#F3F4F6',
                                                color: '#4B5563',
                                                border: '1px solid #D1D5DB',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                height: '24px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                whiteSpace: 'nowrap',
                                                width: 'fit-content',
                                                boxSizing: 'border-box',
                                                textAlign: 'left',
                                                justifyContent: 'flex-start'
                                              }}
                                            >
                                              {role}
                                            </div>
                                          );
                                        }) || []}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              </div>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>

                          {/* 7. Standing Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select
                                disabled={isDisabled}
                                value={match.statusId || ''}
                                onChange={(e) => handleStatusChange(originalIndex, e.target.value || null)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">Select Standing</option>
                                {statuses.map(status => (
                                  <option key={status.id} value={status.id}>
                                    {status.name}
                                  </option>
                                ))}
                              </select>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>

                          {/* 8. Squadron Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select
                                disabled={isDisabled}
                                value={match.squadronId || ''}
                                onChange={(e) => handleSquadronChange(originalIndex, e.target.value || null)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">No Squadron</option>
                                {squadrons.map(squadron => (
                                  <option key={squadron.id} value={squadron.id}>
                                    {squadron.designation} - {squadron.name}
                                  </option>
                                ))}
                              </select>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>

                          {/* 9. Billet Column */}
                          <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div>
                              <select
                                disabled={isDisabled}
                                value={match.roleId || ''}
                                onChange={(e) => handleRoleChange(originalIndex, e.target.value || null)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  border: '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="">Select Billet</option>
                                {roles.map(role => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                              <div style={{ height: '20px' }}></div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
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