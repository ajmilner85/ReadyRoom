import React, { useRef, useState, useEffect } from 'react';
import { Card } from '../card';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification, getAllQualifications, getPilotQualifications, clearPilotQualificationsCache } from '../../../utils/qualificationService';
import { dateInputToLocalDate } from '../../../utils/dateUtils';
import StatusSelector from './StatusSelector';
import StandingSelector from './StandingSelector';
import RoleSelector from './RoleSelector';
import SquadronSelector from './SquadronSelector';
import { Squadron } from '../../../utils/squadronService';
import QualificationsManager from './QualificationsManager';
import TeamsManager from './TeamsManager';
import QualificationBadge from '../QualificationBadge';
import { Save, X, Trash2, Wrench, List } from 'lucide-react';
import type { Team, PilotTeam } from '../../../types/TeamTypes';
import { fetchDiscordGuildMember, fetchDiscordGuildRoles } from '../../../utils/discordService';
import { fetchDiscordGuildMembers, DiscordMember } from '../../../utils/discordPilotService';
import { supabase } from '../../../utils/supabaseClient';
import BoardNumberModal from './BoardNumberModal';

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

interface DiscordGuildMember {
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  };
  nick?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
}

interface RoleMapping {
  id: string;
  discordRoleId: string;
  discordRoleName: string;
  appPermission?: 'admin' | 'flight_lead' | 'member' | 'guest';
  qualification?: string; // Qualification ID
  qualificationName?: string; // Human readable qualification name
  teamId?: string; // Team ID
  teamName?: string; // Human readable team name
  isIgnoreUsers?: boolean; // Special flag for "Ignore Users" mapping
  priority: number;
}

interface PilotDetailsProps {
  selectedPilot: Pilot | null;
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  pilotRoles: Role[];
  squadrons: Squadron[];
  availableQualifications: Qualification[];
  pilotQualifications: any[];
  availableTeams: Team[];
  pilotTeams: PilotTeam[];
  loadingRoles: boolean;
  updatingRoles: boolean;
  updatingStatus: boolean;
  updatingStanding: boolean;
  updatingSquadron: boolean;
  loadingQualifications: boolean;
  loadingTeams: boolean;
  disabledRoles: Record<string, boolean>;
  selectedQualification: string;
  qualificationAchievedDate: string;
  selectedTeam: string;
  teamStartDate: string;
  isAddingQualification: boolean;
  isAddingTeam: boolean;
  updatingQualifications: boolean;
  updatingTeams: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  setSelectedTeam: (id: string) => void;
  setTeamStartDate: (date: string) => void;
  handleStatusChange: (statusId: string) => void;
  handleStandingChange: (standingId: string) => void;
  handleRoleChange: (roleId: string) => void;
  handleSquadronChange: (squadronId: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (id: string) => void;
  handleAddTeam: () => void;
  handleRemoveTeam: (id: string) => void;
  handleDeletePilot?: (pilotId: string) => void;
  handleSavePilotChanges?: (pilot: Pilot) => Promise<{ success: boolean; error?: string }>;
  onQualificationAdded?: (pilotId: string, qualificationData: any[]) => void;
  onTeamAdded?: (pilotId: string) => void;
  isNewPilot?: boolean;
  onPilotFieldChange?: (field: string, value: string) => void;
  onSaveNewPilot?: () => void;
  onCancelAddPilot?: () => void;
  isSavingNewPilot?: boolean;
  saveError?: string | null;
  boardNumberError?: string | null;
}

const PilotDetails: React.FC<PilotDetailsProps> = ({
  selectedPilot,
  statuses,
  standings,
  roles,
  pilotRoles,
  squadrons,
  availableQualifications,
  pilotQualifications,
  availableTeams,
  pilotTeams,
  loadingRoles,
  loadingQualifications,
  loadingTeams,
  disabledRoles,
  selectedQualification,
  qualificationAchievedDate,
  selectedTeam,
  teamStartDate,
  isAddingQualification,
  isAddingTeam,
  updatingQualifications,
  updatingTeams,
  setSelectedQualification,
  setQualificationAchievedDate,
  setSelectedTeam,
  setTeamStartDate,
  handleAddQualification,
  handleRemoveQualification,
  handleAddTeam,
  handleRemoveTeam,
  handleDeletePilot,
  handleSavePilotChanges,
  onQualificationAdded,
  onTeamAdded,
  isNewPilot = false,
  onPilotFieldChange,
  onSaveNewPilot,
  onCancelAddPilot,
  isSavingNewPilot = false,
  saveError = null,
  boardNumberError = null,
}) => {
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [editedPilot, setEditedPilot] = useState<Pilot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [discordMember, setDiscordMember] = useState<DiscordGuildMember | null>(null);
  const [discordRoles, setDiscordRoles] = useState<DiscordRole[]>([]);
  const [isLoadingDiscordRoles, setIsLoadingDiscordRoles] = useState(false);
  const [discordRoleError, setDiscordRoleError] = useState<string | null>(null);
  const [roleMappings, setRoleMappings] = useState<RoleMapping[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showRepairDialog, setShowRepairDialog] = useState(false);
  const [repairDialogData, setRepairDialogData] = useState<{
    discordRole: DiscordRole;
    mapping: RoleMapping;
    selectedQualificationId: string;
    earnedDate: string;
  } | null>(null);
  const [showTeamRepairDialog, setShowTeamRepairDialog] = useState(false);
  const [teamRepairDialogData, setTeamRepairDialogData] = useState<{
    discordRole: DiscordRole;
    mapping: RoleMapping;
    startDate: string;
  } | null>(null);
  const [showQualificationDropdown, setShowQualificationDropdown] = useState(false);
  const [cachedQualifications, setCachedQualifications] = useState<any[]>([]);
  const [localPilotQualifications, setLocalPilotQualifications] = useState<any[]>(pilotQualifications);
  const [showBoardNumberModal, setShowBoardNumberModal] = useState(false);
  const [allDiscordMembers, setAllDiscordMembers] = useState<DiscordMember[]>([]);
  const [availableDiscordMembers, setAvailableDiscordMembers] = useState<DiscordMember[]>([]);
  const [isLoadingDiscordMembers, setIsLoadingDiscordMembers] = useState(false);
  const [selectedDiscordId, setSelectedDiscordId] = useState<string>('');

  // Sync local qualifications with prop changes
  useEffect(() => {
    setLocalPilotQualifications(pilotQualifications);
  }, [pilotQualifications]);

  useEffect(() => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
      setIsEdited(false);
      setSelectedDiscordId(selectedPilot.discord_id || '');
      loadDiscordRoles();
      loadDiscordMembers();

      // Load qualifications data for caching
      if (cachedQualifications.length === 0) {
        loadQualificationsCache();
      }
    } else {
      setEditedPilot(null);
      setDiscordMember(null);
      setDiscordRoles([]);
      setSelectedDiscordId('');
    }
    setEditError(null);
  }, [selectedPilot]);
  
  const loadQualificationsCache = async () => {
    try {
      const { data } = await getAllQualifications();
      if (data) {
        setCachedQualifications(data);
      }
    } catch (error) {
      console.error('Error loading qualifications cache:', error);
    }
  };

  // Add resize observer for responsive columns
  useEffect(() => {
    const observeContainer = () => {
      if (pilotDetailsRef.current) {
        const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
            setContainerWidth(entry.contentRect.width);
          }
        });
        
        resizeObserver.observe(pilotDetailsRef.current);
        return () => resizeObserver.disconnect();
      }
    };

    return observeContainer();
  }, []);

  const loadRoleMappings = async (squadronId: string) => {
    try {
      const { data, error } = await supabase
        .from('org_squadrons')
        .select('discord_integration')
        .eq('id', squadronId)
        .single();

      if (error) {
        console.error('Error fetching squadron Discord integration:', error);
        return;
      }

      // Extract role mappings from discord_integration
      const discordIntegration = data?.discord_integration;
      const roleMappingsData = (discordIntegration && typeof discordIntegration === 'object' && discordIntegration !== null && !Array.isArray(discordIntegration))
        ? (discordIntegration as any).roleMappings || []
        : [];
      setRoleMappings(roleMappingsData);
    } catch (error) {
      console.error('Error loading role mappings:', error);
      setRoleMappings([]);
    }
  };

  const loadDiscordMembers = async () => {
    setIsLoadingDiscordMembers(true);
    try {
      // Fetch all Discord members
      const members = await fetchDiscordGuildMembers();
      setAllDiscordMembers(members);

      // Fetch all pilots with Discord IDs to filter out already-linked accounts
      const { data: pilotsData, error } = await supabase
        .from('pilots')
        .select('discord_id')
        .not('discord_id', 'is', null);

      if (error) {
        console.error('Error fetching pilots with Discord IDs:', error);
        setAvailableDiscordMembers(members);
        return;
      }

      // Create a set of already-linked Discord IDs (excluding current pilot if editing)
      const linkedDiscordIds = new Set(
        pilotsData
          .map(p => p.discord_id)
          .filter(id => id && id !== selectedPilot?.discord_id) // Exclude current pilot's Discord ID
      );

      // Filter out already-linked members
      const available = members.filter(member => !linkedDiscordIds.has(member.id));
      setAvailableDiscordMembers(available);
    } catch (error) {
      console.error('Error loading Discord members:', error);
      setAllDiscordMembers([]);
      setAvailableDiscordMembers([]);
    } finally {
      setIsLoadingDiscordMembers(false);
    }
  };

  const handleAddMissingQualification = (role: DiscordRole, mapping: RoleMapping) => {
    if (!selectedPilot) return;
    
    // Set up dialog data - use mapping qualification as default, or first available qualification
    const defaultQualId = mapping.qualification || (availableQualifications.length > 0 ? availableQualifications[0].id : '');
    setRepairDialogData({
      discordRole: role,
      mapping,
      selectedQualificationId: defaultQualId,
      earnedDate: new Date().toISOString().split('T')[0] // Default to today
    });
    setShowRepairDialog(true);
  };

  const handleRepairDialogConfirm = async () => {
    if (!repairDialogData || !selectedPilot) return;
    
    try {
      // Check if qualification already exists to prevent duplicate key error
      const { data: existingQualifications, error: checkError } = await supabase
        .from('pilot_qualifications')
        .select('id')
        .eq('pilot_id', selectedPilot.id)
        .eq('qualification_id', repairDialogData.selectedQualificationId);

      if (checkError) {
        console.error('Error checking existing qualifications:', checkError);
        alert(`Failed to check existing qualifications: ${checkError.message}`);
        return;
      }

      if (existingQualifications && existingQualifications.length > 0) {
        console.log('Qualification already exists for this pilot');
        alert('This qualification has already been added to the pilot.');
        return;
      }

      // Add qualification to pilot_qualifications table
      const { error } = await supabase
        .from('pilot_qualifications')
        .insert({
          pilot_id: selectedPilot.id,
          qualification_id: repairDialogData.selectedQualificationId,
          achieved_date: dateInputToLocalDate(repairDialogData.earnedDate).toISOString(),
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error adding qualification:', error);
        alert(`Failed to add qualification: ${error.message}`);
        return;
      }

      // Close dialog
      setShowRepairDialog(false);
      setRepairDialogData(null);
      
      // Clear the qualifications cache for this pilot to force fresh data fetch
      clearPilotQualificationsCache(selectedPilot.id);
      
      // Force refresh the local qualifications by re-fetching them directly
      try {
        const result = await getPilotQualifications(selectedPilot.id);
        
        // Update local state with fresh qualification data - extract the data array from the result
        setLocalPilotQualifications(result?.data || []);
        
        // Call the parent callback to update parent component states
        if (onQualificationAdded && result?.data) {
          onQualificationAdded(selectedPilot.id, result.data);
        }
      } catch (error) {
        console.error('Error re-fetching qualifications:', error);
      }
      
      console.log('Qualification added successfully');
      
    } catch (error: any) {
      console.error('Error adding qualification:', error);
      alert(`Failed to add qualification: ${error.message}`);
    }
  };

  const handleRepairDialogCancel = () => {
    setShowRepairDialog(false);
    setRepairDialogData(null);
    setShowQualificationDropdown(false);
  };

  const handleAddMissingTeam = (role: DiscordRole, mapping: RoleMapping) => {
    if (!selectedPilot || !mapping.teamId) return;

    setTeamRepairDialogData({
      discordRole: role,
      mapping,
      startDate: new Date().toISOString().split('T')[0] // Default to today
    });
    setShowTeamRepairDialog(true);
  };

  const handleTeamRepairDialogConfirm = async () => {
    if (!teamRepairDialogData || !selectedPilot || !teamRepairDialogData.mapping.teamId) return;

    try {
      // Check if team membership already exists to prevent duplicate key error
      const { data: existingMemberships, error: checkError } = await supabase
        .from('pilot_teams')
        .select('id')
        .eq('pilot_id', selectedPilot.id)
        .eq('team_id', teamRepairDialogData.mapping.teamId)
        .is('end_date', null);

      if (checkError) {
        console.error('Error checking existing team memberships:', checkError);
        alert(`Failed to check existing team memberships: ${checkError.message}`);
        return;
      }

      if (existingMemberships && existingMemberships.length > 0) {
        console.log('Pilot is already a member of this team');
        alert('This pilot is already a member of this team.');
        return;
      }

      // Add pilot to team in pilot_teams table
      const { error } = await supabase
        .from('pilot_teams')
        .insert({
          pilot_id: selectedPilot.id,
          team_id: teamRepairDialogData.mapping.teamId,
          start_date: dateInputToLocalDate(teamRepairDialogData.startDate).toISOString(),
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error adding pilot to team:', error);
        alert(`Failed to add pilot to team: ${error.message}`);
        return;
      }

      // Close dialog
      setShowTeamRepairDialog(false);
      setTeamRepairDialogData(null);

      // Call the parent callback to refresh team data
      if (onTeamAdded) {
        onTeamAdded(selectedPilot.id);
      }

      console.log('Team added successfully');
    } catch (error: any) {
      console.error('Error adding team:', error);
      alert(`Failed to add team: ${error.message}`);
    }
  };

  const handleTeamRepairDialogCancel = () => {
    setShowTeamRepairDialog(false);
    setTeamRepairDialogData(null);
  };

  const loadDiscordRoles = async () => {
    
    if (!selectedPilot?.currentSquadron) {
      setDiscordMember(null);
      setDiscordRoles([]);
      setRoleMappings([]);
      return;
    }
    
    // Check if we have the numeric Discord ID needed for API lookups
    if (!selectedPilot.discord_id) {
      setDiscordMember(null);
      setDiscordRoles([]);
      setRoleMappings([]);
      return;
    }

    setIsLoadingDiscordRoles(true);
    setDiscordRoleError(null);

    try {
      // Get the guild ID from squadron Discord integration settings
      const squadronData = selectedPilot.currentSquadron as any;
      const discordIntegration = squadronData?.discord_integration as { selectedGuildId?: string } | null;
      const guildId = discordIntegration?.selectedGuildId || '';

      if (!guildId) {
        setDiscordRoleError('No Discord server configured for this squadron');
        return;
      }

      // Use discord_id for API lookup since Discord API expects numeric ID
      const discordIdForLookup = selectedPilot.discord_id;

      if (!discordIdForLookup) {
        setDiscordRoleError('No numeric Discord ID found for this pilot. The pilot may need to be re-synced with Discord.');
        return;
      }

      // Fetch member data, guild roles, and role mappings
      const [memberResult, rolesResult] = await Promise.all([
        fetchDiscordGuildMember(guildId, discordIdForLookup),
        fetchDiscordGuildRoles(guildId),
        loadRoleMappings(selectedPilot.currentSquadron.id)
      ]);
      
      if (memberResult.error) {
        setDiscordRoleError(memberResult.error);
        setDiscordMember(null);
        setDiscordRoles([]);
      } else if (rolesResult.error) {
        setDiscordRoleError(`Failed to fetch guild roles: ${rolesResult.error}`);
        setDiscordMember(null);
        setDiscordRoles([]);
      } else {
        setDiscordMember(memberResult.member);
        setDiscordRoles(rolesResult.roles);
        setDiscordRoleError(null);
        
      }
    } catch (error) {
      console.error('Error loading Discord roles:', error);
      setDiscordRoleError('Failed to load Discord roles');
      setDiscordMember(null);
      setDiscordRoles([]);
    } finally {
      setIsLoadingDiscordRoles(false);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    if (!editedPilot) return;

    setEditedPilot({
      ...editedPilot,
      [field]: value,
    });

    setIsEdited(true);
  };

  const handleSaveChanges = async () => {
    if (!editedPilot || !handleSavePilotChanges) return;

    setIsSaving(true);
    setEditError(null);

    try {
      const result = await handleSavePilotChanges(editedPilot);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save pilot changes');
      }

      setIsEdited(false);
    } catch (err: any) {
      setEditError(err.message || 'An error occurred while saving changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelChanges = () => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
      
      // Reset Discord account selection to match the original pilot data
      setSelectedDiscordId(selectedPilot.discord_id || '');
    }

    setIsEdited(false);
    setEditError(null);
  };

  const handleEditStandingChange = (standingId: string) => {
    if (!editedPilot) return;

    const standing = standings.find((s) => s.id === standingId);

    setEditedPilot({
      ...editedPilot,
      currentStanding: standing || undefined,
    });

    setIsEdited(true);
  };

  const handleEditStatusChange = (statusId: string) => {
    if (!editedPilot) return;

    const status = statuses.find((s) => s.id === statusId);

    setEditedPilot({
      ...editedPilot,
      currentStatus: status || undefined,
      status: status?.name as any,
    });

    setIsEdited(true);
  };

  const handleEditRoleChange = (roleId: string) => {
    if (!editedPilot) return;

    const role = roles.find((r) => r.id === roleId);

    // Update the roles array instead of the role field
    setEditedPilot({
      ...editedPilot,
      roles: role ? [{
        id: '', // Will be generated by database
        pilot_id: editedPilot.id,
        role_id: role.id,
        effective_date: new Date().toISOString(),
        is_acting: false,
        end_date: null,
        created_at: new Date().toISOString(),
        updated_at: null,
        role: {
          id: role.id,
          name: role.name,
          exclusivity_scope: role.exclusivity_scope,
          order: role.order
        }
      }] : []
    });

    setIsEdited(true);
  };

  const handleEditSquadronChange = (squadronId: string) => {
    if (!editedPilot) return;

    const squadron = squadrons.find((s) => s.id === squadronId);

    setEditedPilot({
      ...editedPilot,
      currentSquadron: squadron || undefined,
      squadronAssignment: squadron ? {
        id: '', // Will be generated by database
        pilot_id: editedPilot.id,
        squadron_id: squadron.id,
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        created_at: new Date().toISOString(),
        updated_at: null
      } : undefined
    });

    setIsEdited(true);
  };

  const handleDiscordSelectionChange = (discordId: string) => {
    if (!editedPilot) return;

    // Find the selected Discord member
    const selectedMember = allDiscordMembers.find(m => m.id === discordId);

    // Update edited pilot with new Discord info
    setEditedPilot({
      ...editedPilot,
      discord_id: discordId || undefined,
      discordUsername: selectedMember?.username || ''
    });

    setSelectedDiscordId(discordId);
    setIsEdited(true);
  };

  const handleClearDiscordSelection = () => {
    if (!editedPilot) return;

    // Clear Discord selection locally (doesn't save immediately)
    setEditedPilot({
      ...editedPilot,
      discord_id: undefined,
      discordUsername: ''
    });

    setSelectedDiscordId('');
    setIsEdited(true);
  };

  const inputFieldStyle = {
    ...pilotDetailsStyles.fieldValue,
    width: '450px',
    minHeight: '35px',
    padding: '8px',
    boxSizing: 'border-box' as const,
  };

  const sectionSpacingStyle = {
    marginBottom: '24px',
  };

  if (!selectedPilot) {
    return (
      <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
        <div style={pilotDetailsStyles.emptyState}>Select a pilot to view their details</div>
      </div>
    );
  }

  const exportButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#FFFFFF',
    color: '#64748B',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    fontFamily: 'Inter',
    fontSize: '14px',
    fontWeight: 400,
    minWidth: '120px',
    justifyContent: 'center',
    height: '35px',
  };

  // Create local handlers for new pilots that only update state, don't save to DB
  const handleNewPilotStatusChange = (statusId: string) => {
    if (onPilotFieldChange) {
      const status = statuses.find(s => s.id === statusId);
      onPilotFieldChange('status_id', statusId);
      // Store the status object as a string representation for consistency with onPilotFieldChange
      onPilotFieldChange('currentStatus', status ? JSON.stringify(status) : '');
    }
  };

  const handleNewPilotStandingChange = (standingId: string) => {
    if (onPilotFieldChange) {
      const standing = standings.find(s => s.id === standingId);
      onPilotFieldChange('standing_id', standingId);
      // Store the standing object as a string representation for consistency with onPilotFieldChange
      onPilotFieldChange('currentStanding', standing ? JSON.stringify(standing) : '');
    }
  };

  const handleNewPilotSquadronChange = (squadronId: string) => {
    if (onPilotFieldChange) {
      const squadron = squadrons.find(s => s.id === squadronId);
      onPilotFieldChange('squadron_id', squadronId);
      // Store the squadron object as a string representation for consistency with onPilotFieldChange
      onPilotFieldChange('currentSquadron', squadron ? JSON.stringify(squadron) : '');
    }
  };

  const handleNewPilotRoleChange = (roleId: string) => {
    if (onPilotFieldChange) {
      const role = roles.find(r => r.id === roleId);
      onPilotFieldChange('role_id', roleId);
      // Store the role object as a string representation for consistency with onPilotFieldChange
      onPilotFieldChange('currentRole', role ? JSON.stringify(role) : '');
    }
  };

  const renderEditableBasicInfo = () => {
    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Board Number *</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
              type="text"
              value={selectedPilot.boardNumber || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                // Limit to 3 digits
                if (value.length <= 3) {
                  onPilotFieldChange && onPilotFieldChange('boardNumber', value);
                }
              }}
              style={{
                ...inputFieldStyle,
                ...(boardNumberError && { borderColor: '#EF4444' }),
              }}
              placeholder="Enter board number"
              maxLength={3}
            />
            <button
              type="button"
              onClick={() => setShowBoardNumberModal(true)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '14px',
                color: '#64748B',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <List size={16} />
            </button>
          </div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#94A3B8' }}>
            Must start with 5, 6, or 7. Cannot contain 8, 9, or 0.
          </div>
          {boardNumberError && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#EF4444' }}>
              {boardNumberError}
            </div>
          )}
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Callsign *</label>
          <input
            type="text"
            value={selectedPilot.callsign || ''}
            onChange={(e) => onPilotFieldChange && onPilotFieldChange('callsign', e.target.value)}
            style={inputFieldStyle}
            placeholder="Enter callsign"
          />
        </div>


        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
          <div>
            <div style={{ ...sectionSpacingStyle }}>
              <StatusSelector
                statuses={statuses}
                selectedStatusId={selectedPilot.currentStatus?.id || selectedPilot.status_id || ''}
                updatingStatus={false}
                handleStatusChange={handleNewPilotStatusChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <StandingSelector
                standings={standings}
                selectedStandingId={selectedPilot.currentStanding?.id || selectedPilot.standing_id || ''}
                updatingStanding={false}
                handleStandingChange={handleNewPilotStandingChange}
              />
            </div>
          </div>

          <div>
            <div style={{ ...sectionSpacingStyle }}>
              <SquadronSelector
                squadrons={squadrons}
                selectedSquadronId={(selectedPilot as any)?.squadron_id || ''}
                updatingSquadron={false}
                handleSquadronChange={handleNewPilotSquadronChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <RoleSelector
                roles={roles}
                pilotRoles={selectedPilot?.roles && selectedPilot.roles.length > 0 && selectedPilot.roles[0].role ? [{
                  id: selectedPilot.roles[0].role.id,
                  name: selectedPilot.roles[0].role.name,
                  exclusivity_scope: selectedPilot.roles[0].role.exclusivity_scope,
                  order: selectedPilot.roles[0].role.order
                }] : []}
                updatingRoles={false}
                loadingRoles={false}
                disabledRoles={{}}
                handleRoleChange={handleNewPilotRoleChange}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', color: '#64748B', fontSize: '14px' }}>* Board Number, Callsign, Status, and Standing are required</div>

        {/* Discord User Information for New Pilot */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1E293B' }}>
            Discord User Information
          </h3>
          <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
            <label style={pilotDetailsStyles.fieldLabel}>Discord Username</label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              {/* Discord Username Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <select
                  value={(selectedPilot as any)?.discord_id || ''}
                  onChange={(e) => {
                    const discordId = e.target.value;
                    const selectedMember = allDiscordMembers.find(m => m.id === discordId);
                    if (onPilotFieldChange) {
                      onPilotFieldChange('discord_id', discordId);
                      onPilotFieldChange('discordUsername', selectedMember?.username || '');
                    }
                  }}
                  disabled={isLoadingDiscordMembers}
                  style={{
                    ...inputFieldStyle,
                    width: '221px',
                    backgroundColor: isLoadingDiscordMembers ? '#f1f5f9' : '#ffffff'
                  }}
                >
                  <option value="">No Discord account linked</option>
                  {availableDiscordMembers.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* Discord Display Name Dropdown (synchronized) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ ...pilotDetailsStyles.fieldLabel, marginBottom: '0' }}>Discord Display Name</label>
                <select
                  value={(selectedPilot as any)?.discord_id || ''}
                  onChange={(e) => {
                    const discordId = e.target.value;
                    const selectedMember = allDiscordMembers.find(m => m.id === discordId);
                    if (onPilotFieldChange) {
                      onPilotFieldChange('discord_id', discordId);
                      onPilotFieldChange('discordUsername', selectedMember?.username || '');
                    }
                  }}
                  disabled={isLoadingDiscordMembers}
                  style={{
                    ...inputFieldStyle,
                    width: '221px',
                    backgroundColor: isLoadingDiscordMembers ? '#f1f5f9' : '#ffffff'
                  }}
                >
                  <option value="">No Discord account linked</option>
                  {availableDiscordMembers.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Button */}
              <button
                onClick={() => {
                  if (onPilotFieldChange) {
                    onPilotFieldChange('discord_id', '');
                    onPilotFieldChange('discordUsername', '');
                  }
                }}
                disabled={!(selectedPilot as any)?.discord_id || isLoadingDiscordMembers}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  cursor: !(selectedPilot as any)?.discord_id || isLoadingDiscordMembers ? 'not-allowed' : 'pointer',
                  opacity: !(selectedPilot as any)?.discord_id || isLoadingDiscordMembers ? 0.7 : 1,
                  minWidth: '80px',
                  backgroundColor: '#FEE2E2',
                  color: '#B91C1C',
                  border: '1px solid #FCA5A5',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
                onMouseEnter={(e) => {
                  if ((selectedPilot as any)?.discord_id && !isLoadingDiscordMembers) {
                    e.currentTarget.style.backgroundColor = '#FECACA';
                  }
                }}
                onMouseLeave={(e) => {
                  if ((selectedPilot as any)?.discord_id && !isLoadingDiscordMembers) {
                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                  }
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderDiscordUserInfo = () => {
    const pilot = editedPilot || selectedPilot;
    if (!pilot) return null;

    // Find the selected Discord member for display name
    const selectedMember = allDiscordMembers.find(m => m.id === selectedDiscordId);

    // Prepare dropdown options (available members + current selection if it exists)
    const dropdownMembers = [...availableDiscordMembers];
    if (selectedDiscordId && selectedMember && !dropdownMembers.find(m => m.id === selectedDiscordId)) {
      dropdownMembers.unshift(selectedMember);
    }

    const dropdownStyle = {
      ...inputFieldStyle,
      width: '221px', // Half the width minus gap
      backgroundColor: isLoadingDiscordMembers ? '#f1f5f9' : '#ffffff'
    };

    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Username</label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            {/* Discord Username Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <select
                value={selectedDiscordId}
                onChange={(e) => handleDiscordSelectionChange(e.target.value)}
                disabled={isLoadingDiscordMembers}
                style={dropdownStyle}
              >
                <option value="">No Discord account linked</option>
                {dropdownMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Discord Display Name Dropdown (synchronized) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ ...pilotDetailsStyles.fieldLabel, marginBottom: '0' }}>Discord Display Name</label>
              <select
                value={selectedDiscordId}
                onChange={(e) => handleDiscordSelectionChange(e.target.value)}
                disabled={isLoadingDiscordMembers}
                style={dropdownStyle}
              >
                <option value="">No Discord account linked</option>
                {dropdownMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Button */}
            <button
              onClick={handleClearDiscordSelection}
              disabled={!selectedDiscordId || isLoadingDiscordMembers}
              style={{
                ...exportButtonStyle,
                cursor: !selectedDiscordId || isLoadingDiscordMembers ? 'not-allowed' : 'pointer',
                opacity: !selectedDiscordId || isLoadingDiscordMembers ? 0.7 : 1,
                minWidth: '80px',
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
              }}
              onMouseEnter={(e) => {
                if (selectedDiscordId && !isLoadingDiscordMembers) {
                  e.currentTarget.style.backgroundColor = '#FECACA';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedDiscordId && !isLoadingDiscordMembers) {
                  e.currentTarget.style.backgroundColor = '#FEE2E2';
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Server Roles</label>
          <div style={{
            display: 'inline-block'
          }}>
            <div style={{
              minHeight: '40px',
              padding: '8px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'flex-start'
            }}>
              {renderDiscordRoles()}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderDiscordRoles = () => {
    if (isLoadingDiscordRoles) {
      return (
        <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '8px' }}>
          Loading Discord roles...
        </div>
      );
    }

    if (discordRoleError) {
      return (
        <div style={{ color: '#DC2626', fontSize: '14px', textAlign: 'center', padding: '8px' }}>
          {discordRoleError}
        </div>
      );
    }

    if (!discordMember || !discordRoles.length) {
      return (
        <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '8px' }}>
          No Discord roles found
        </div>
      );
    }

    // Get user's roles by filtering the roles array based on member's role IDs
    const userRoles = discordRoles.filter(role => discordMember.roles.includes(role.id));

    if (!userRoles.length) {
      return (
        <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '8px' }}>
          No roles assigned
        </div>
      );
    }

    // Sort roles by position (higher position = higher rank)
    const sortedRoles = userRoles
      .filter(role => role.name !== '@everyone') // Filter out @everyone role
      .sort((a, b) => b.position - a.position);

    // Helper function to determine badge color and style
    const getBadgeStyle = (role: DiscordRole) => {
      // Find if this role has a mapping
      const mapping = roleMappings.find(m => m.discordRoleId === role.id);
      
      if (!mapping || mapping.isIgnoreUsers) {
        // No mapping or ignore mapping - light gray
        return {
          backgroundColor: '#F3F4F6',
          color: '#4B5563',
          border: '1px solid #D1D5DB'
        };
      }

      // Check if it's a qualification mapping
      if (mapping.qualification) {
        // Check if pilot has this qualification using the local pilotQualifications state
        const hasQualification = localPilotQualifications?.some((pq: any) => {
          // pilotQualifications contains pilot_qualifications records with nested qualification objects
          const qualification = pq.qualification;
          if (!qualification) return false;
          
          // Check multiple possible formats for qualification matching
          return (
            qualification.name === mapping.qualificationName ||
            qualification.id === mapping.qualification ||
            qualification.name === mapping.qualification ||
            pq.qualification_id === mapping.qualification
          );
        });
        
        
        
        if (hasQualification) {
          // Has qualification - blue
          return {
            backgroundColor: '#DBEAFE',
            color: '#1D4ED8',
            border: '1px solid #3B82F6'
          };
        } else {
          // Missing qualification - red
          return {
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            border: '1px solid #EF4444'
          };
        }
      }

      // Check if it's a team mapping
      if (mapping.teamId) {
        // Check if pilot is a member of this team
        const hasTeam = pilotTeams?.some((pt: PilotTeam) => {
          // Check if pilot is active member of this team (no end_date)
          return pt.team_id === mapping.teamId && !pt.end_date;
        });

        if (hasTeam) {
          // Has team membership - green
          return {
            backgroundColor: '#D1FAE5',
            color: '#065F46',
            border: '1px solid #10B981'
          };
        } else {
          // Missing team membership - red
          return {
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            border: '1px solid #EF4444'
          };
        }
      }

      // Check if it's a permission mapping
      if (mapping.appPermission) {
        // Check if pilot has the corresponding site permission (this would need actual implementation)
        // For now, assuming they have permission - yellow
        return {
          backgroundColor: '#FEF3C7',
          color: '#D97706',
          border: '1px solid #F59E0B'
        };
      }

      // Default - light gray
      return {
        backgroundColor: '#F3F4F6',
        color: '#4B5563',
        border: '1px solid #D1D5DB'
      };
    };

    // Helper function to render qualification/team fix button
    const renderFixButton = (role: DiscordRole) => {
      const mapping = roleMappings.find(m => m.discordRoleId === role.id);

      if (!mapping) return null;

      // Check for missing qualification
      if (mapping.qualification) {
        // Check if pilot is missing this qualification using the local pilotQualifications state
        const hasQualification = localPilotQualifications?.some((pq: any) => {
          const qualification = pq.qualification;
          if (!qualification) return false;

          return (
            qualification.name === mapping.qualificationName ||
            qualification.id === mapping.qualification ||
            qualification.name === mapping.qualification ||
            pq.qualification_id === mapping.qualification
          );
        });

        if (hasQualification) return null;

        return (
          <button
            onClick={() => handleAddMissingQualification(role, mapping)}
            style={{
              marginLeft: '6px',
              padding: '2px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              color: '#DC2626'
            }}
            title={`Quick Add Qualification: ${mapping.qualificationName}`}
          >
            <Wrench size={12} />
          </button>
        );
      }

      // Check for missing team
      if (mapping.teamId) {
        // Check if pilot is missing this team
        const hasTeam = pilotTeams?.some((pt: PilotTeam) => {
          return pt.team_id === mapping.teamId && !pt.end_date;
        });

        if (hasTeam) return null;

        return (
          <button
            onClick={() => handleAddMissingTeam(role, mapping)}
            style={{
              marginLeft: '6px',
              padding: '2px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              color: '#DC2626'
            }}
            title={`Quick Add to Team: ${mapping.teamName}`}
          >
            <Wrench size={12} />
          </button>
        );
      }

      return null;
    };

    // Create responsive column layout
    const getColumnCount = () => {
      if (containerWidth >= 600) {
        return 3; // Wide screens: 3 columns, up to 6 badges per column
      } else if (containerWidth >= 400) {
        return 2; // Medium screens: 2 columns, up to 9 badges per column
      } else {
        return 1; // Narrow screens: 1 column, all badges in one column
      }
    };

    const columnCount = getColumnCount();
    const itemsPerColumn = Math.ceil(sortedRoles.length / columnCount);

    return (
      <div style={{ 
        display: 'inline-flex',
        gap: '8px',
        padding: '4px'
      }}>
        {Array.from({ length: columnCount }, (_, colIndex) => (
          <div key={colIndex} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
              {sortedRoles
                .slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn)
                .map((role) => {
                  const badgeStyle = getBadgeStyle(role);
                  const mapping = roleMappings.find(m => m.discordRoleId === role.id);
                  
                  // Check if this is a blue badge (in sync)
                  const isInSync = mapping?.qualification && localPilotQualifications?.some((pq: any) => {
                    const qualification = pq.qualification;
                    if (!qualification) return false;
                    
                    return (
                      qualification.name === mapping.qualificationName ||
                      qualification.id === mapping.qualification ||
                      qualification.name === mapping.qualification ||
                      pq.qualification_id === mapping.qualification
                    );
                  });
                  
                  return (
                    <div
                      key={role.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '500',
                        height: '24px',
                        boxSizing: 'border-box',
                        whiteSpace: 'nowrap',
                        ...badgeStyle
                      }}
                    >
                      <span>{role.name}</span>
                      {isInSync && (
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          style={{ marginLeft: '4px' }}
                        >
                          <path 
                            d="M16 3L21 8L16 13M8 21L3 16L8 11M21 8H3M3 16H21" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {renderFixButton(role)}
                    </div>
                  );
                })
              }
            </div>
          ))}
      </div>
    );
  };

  const renderEditableExistingPilotInfo = () => {
    if (!editedPilot) return null;

    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Board Number</label>
          <input
            type="text"
            value={editedPilot.boardNumber || ''}
            onChange={(e) =>
              handleFieldChange('boardNumber', e.target.value.replace(/[^0-9]/g, ''))
            }
            style={inputFieldStyle}
            placeholder="Enter board number"
          />
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Callsign</label>
          <input
            type="text"
            value={editedPilot.callsign || ''}
            onChange={(e) => handleFieldChange('callsign', e.target.value)}
            style={inputFieldStyle}
            placeholder="Enter callsign"
          />
        </div>


        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
          <div>
            <div style={{ ...sectionSpacingStyle }}>
              <StatusSelector
                statuses={statuses}
                selectedStatusId={editedPilot.currentStatus?.id || ''}
                updatingStatus={false}
                handleStatusChange={handleEditStatusChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <StandingSelector
                standings={standings}
                selectedStandingId={editedPilot.currentStanding?.id || ''}
                updatingStanding={false}
                handleStandingChange={handleEditStandingChange}
              />
            </div>
          </div>

          <div>
            <div style={{ ...sectionSpacingStyle }}>
              <SquadronSelector
                squadrons={squadrons}
                selectedSquadronId={editedPilot.currentSquadron?.id || ''}
                updatingSquadron={false}
                handleSquadronChange={handleEditSquadronChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <RoleSelector
                roles={roles}
                pilotRoles={pilotRoles}
                updatingRoles={false}
                loadingRoles={loadingRoles}
                disabledRoles={disabledRoles}
                handleRoleChange={handleEditRoleChange}
              />
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div ref={pilotDetailsRef} style={{
      ...pilotDetailsStyles.container,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: 0
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px'
      }}>
        {isNewPilot && (
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600 }}>Add New Pilot</h1>
          </div>
        )}

        {saveError && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              borderRadius: '6px',
              marginBottom: '16px',
            }}
          >
            {saveError}
          </div>
        )}

        {!isNewPilot && (
          <div style={pilotDetailsStyles.header}>
            <h1 style={pilotDetailsStyles.headerTitle}>
              <span style={pilotDetailsStyles.boardNumber}>{selectedPilot.boardNumber}</span>
              {selectedPilot.callsign}
              <span style={pilotDetailsStyles.roleText}>
                {selectedPilot.roles?.[0]?.role?.name && ` ${selectedPilot.roles?.[0]?.role?.name}`}
                {selectedPilot.currentSquadron && ` - ${selectedPilot.currentSquadron.designation} ${selectedPilot.currentSquadron.name}`}
              </span>
            </h1>
          </div>
        )}

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
            Basic Information
          </h2>
          {isNewPilot ? (
            renderEditableBasicInfo()
          ) : (
            renderEditableExistingPilotInfo()
          )}
        </Card>

        {editError && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              borderRadius: '6px',
              marginBottom: '16px',
              marginTop: '16px'
            }}
          >
            {editError}
          </div>
        )}

        {!isNewPilot && (
          <Card className="p-4" style={{ marginTop: '24px' }}>
            <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
              Discord User Information
            </h2>
            {renderDiscordUserInfo()}
          </Card>
        )}

        {!isNewPilot && (
          <div style={{ display: 'grid', gap: '24px', marginTop: '24px' }}>
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
                Qualifications
              </h2>

              <QualificationsManager
                pilotQualifications={pilotQualifications}
                availableQualifications={availableQualifications}
                selectedQualification={selectedQualification}
                qualificationAchievedDate={qualificationAchievedDate}
                loadingQualifications={loadingQualifications}
                isAddingQualification={isAddingQualification}
                updatingQualifications={updatingQualifications}
                setSelectedQualification={setSelectedQualification}
                setQualificationAchievedDate={setQualificationAchievedDate}
                handleAddQualification={handleAddQualification}
                handleRemoveQualification={handleRemoveQualification}
              />
            </Card>

            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
                Teams
              </h2>

              <TeamsManager
                pilotTeams={pilotTeams}
                availableTeams={availableTeams}
                selectedTeam={selectedTeam}
                teamStartDate={teamStartDate}
                loadingTeams={loadingTeams}
                isAddingTeam={isAddingTeam}
                updatingTeams={updatingTeams}
                setSelectedTeam={setSelectedTeam}
                setTeamStartDate={setTeamStartDate}
                handleAddTeam={handleAddTeam}
                handleRemoveTeam={handleRemoveTeam}
              />
            </Card>
          </div>
        )}

      </div>

      {/* Footer with action buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px',
        borderTop: '1px solid #E2E8F0'
      }}>
        {/* Delete button on the left (only for existing pilots) */}
        <div>
          {!isNewPilot && handleDeletePilot && (
            <button
              onClick={() => setShowDeleteConfirmation(true)}
              style={{
                ...exportButtonStyle,
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FECACA';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FEE2E2';
              }}
            >
              <Trash2 size={16} style={{ marginRight: '4px' }} />
              Delete Pilot
            </button>
          )}
        </div>

        {/* Save/Cancel buttons on the right */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {isNewPilot ? (
            <>
              <button
                onClick={onCancelAddPilot}
                disabled={isSavingNewPilot}
                style={{
                  ...exportButtonStyle,
                  cursor: isSavingNewPilot ? 'not-allowed' : 'pointer',
                  opacity: isSavingNewPilot ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSavingNewPilot) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingNewPilot) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <X size={16} style={{ marginRight: '4px' }} />
                Cancel
              </button>
              <button
                onClick={onSaveNewPilot}
                disabled={
                  isSavingNewPilot ||
                  !selectedPilot.callsign ||
                  !selectedPilot.boardNumber ||
                  !selectedPilot.status_id ||
                  !selectedPilot.standing_id ||
                  !!boardNumberError
                }
                style={{
                  ...exportButtonStyle,
                  cursor:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id ||
                    !selectedPilot.standing_id ||
                    !!boardNumberError
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id ||
                    !selectedPilot.standing_id ||
                    !!boardNumberError
                      ? 0.7
                      : 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    !isSavingNewPilot &&
                    selectedPilot.callsign &&
                    selectedPilot.boardNumber &&
                    selectedPilot.status_id &&
                    selectedPilot.standing_id &&
                    !boardNumberError
                  ) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    !isSavingNewPilot &&
                    selectedPilot.callsign &&
                    selectedPilot.boardNumber &&
                    selectedPilot.status_id &&
                    selectedPilot.standing_id &&
                    !boardNumberError
                  ) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <Save size={16} style={{ marginRight: '4px' }} />
                {isSavingNewPilot ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : isEdited && (
            <>
              <button
                onClick={handleCancelChanges}
                disabled={isSaving}
                style={{
                  ...exportButtonStyle,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSaving) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaving) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <X size={16} style={{ marginRight: '4px' }} />
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                style={{
                  ...exportButtonStyle,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSaving) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaving) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <Save size={16} style={{ marginRight: '4px' }} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirmation && (
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
                width: '400px',
                textAlign: 'center',
              }}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Confirm Deletion
              </h2>
              <p style={{ marginBottom: '24px', color: '#64748B' }}>
                Are you sure you want to delete this pilot? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setShowDeleteConfirmation(false)}
                  style={{
                    ...exportButtonStyle,
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    border: '1px solid #D1D5DB',
                    width: '45%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#D1D5DB';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#E5E7EB';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (handleDeletePilot) {
                      handleDeletePilot(selectedPilot.id);
                    }
                    setShowDeleteConfirmation(false);
                  }}
                  style={{
                    ...exportButtonStyle,
                    backgroundColor: '#FEE2E2',
                    color: '#B91C1C',
                    border: '1px solid #FCA5A5',
                    width: '45%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#FECACA';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Repair Qualification Dialog */}
      {showRepairDialog && repairDialogData && (
        <div
          style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={handleRepairDialogCancel}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                padding: '24px',
                minWidth: '600px',
                maxWidth: '700px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  marginRight: '8px'
                }}>
                  <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                    <path 
                      fill="#5865F2" 
                      d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                    />
                  </svg>
                </div>
                <h3 style={{ 
                  margin: '0', 
                  fontSize: '18px', 
                  fontWeight: '600',
                  color: '#1F2937'
                }}>
                  Add Missing Qualification
                </h3>
              </div>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0'
              }}>
                {/* Discord Logo */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  flexShrink: 0
                }}>
                  <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                    <path 
                      fill="#5865F2" 
                      d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                    />
                  </svg>
                </div>

                {/* Discord Role Name */}
                <span style={{ 
                  fontSize: '14px', 
                  color: '#1F2937',
                  fontWeight: '500',
                  flexShrink: 0
                }}>
                  {repairDialogData.discordRole.name}
                </span>
                
                {/* Arrow */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M13.5 6L20.5 12L13.5 18M19.5 12H3" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                
                {/* Qualification Selector */}
                <div style={{ flex: '1', minWidth: '200px', position: 'relative' }}>
                  <button
                    onClick={() => setShowQualificationDropdown(!showQualificationDropdown)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: '40px', // Same height as date selector
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {availableQualifications.find(q => q.id === repairDialogData.selectedQualificationId) && (
                        <QualificationBadge 
                          type={availableQualifications.find(q => q.id === repairDialogData.selectedQualificationId)!.name as any}
                          qualifications={cachedQualifications}
                          size="small"
                        />
                      )}
                      <span>
                        {availableQualifications.find(q => q.id === repairDialogData.selectedQualificationId)?.name || 'Select qualification'}
                      </span>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {showQualificationDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                      zIndex: 1000,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {availableQualifications.map(qual => (
                        <button
                          key={qual.id}
                          onClick={() => {
                            setRepairDialogData(prev => prev ? {
                              ...prev,
                              selectedQualificationId: qual.id
                            } : null);
                            setShowQualificationDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: repairDialogData.selectedQualificationId === qual.id ? '#F3F4F6' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '14px',
                            textAlign: 'left',
                            height: '32px' // Shorter dropdown options
                          }}
                          onMouseEnter={(e) => {
                            if (repairDialogData.selectedQualificationId !== qual.id) {
                              e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (repairDialogData.selectedQualificationId !== qual.id) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <QualificationBadge type={qual.name as any} qualifications={cachedQualifications} size="small" />
                          <span>{qual.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Date Input */}
                <input
                  type="date"
                  title="Effective date"
                  value={repairDialogData.earnedDate}
                  onChange={(e) => setRepairDialogData(prev => prev ? {
                    ...prev,
                    earnedDate: e.target.value
                  } : null)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    width: '140px',
                    height: '40px', // Same height as qualification selector
                    boxSizing: 'border-box',
                    flexShrink: 0
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleRepairDialogCancel}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#FFFFFF',
                    color: '#6B7280',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRepairDialogConfirm}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Team Repair Dialog */}
      {showTeamRepairDialog && teamRepairDialogData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={handleTeamRepairDialogCancel}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '600px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                marginRight: '8px'
              }}>
                <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                  <path
                    fill="#5865F2"
                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                  />
                </svg>
              </div>
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1F2937'
              }}>
                Add to Team
              </h3>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0'
            }}>
              {/* Discord Logo */}
              <div style={{
                width: '20px',
                height: '20px',
                flexShrink: 0
              }}>
                <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                  <path
                    fill="#5865F2"
                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                  />
                </svg>
              </div>

              {/* Discord Role Name */}
              <span style={{
                fontSize: '14px',
                color: '#1F2937',
                fontWeight: '500',
                flexShrink: 0
              }}>
                {teamRepairDialogData.discordRole.name}
              </span>

              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M13.5 6L20.5 12L13.5 18M19.5 12H3" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>

              {/* Team Name */}
              <span style={{
                fontSize: '14px',
                fontWeight: '600',
                backgroundColor: '#D1FAE5',
                color: '#065F46',
                border: '1px solid #10B981',
                padding: '4px 12px',
                borderRadius: '4px'
              }}>
                {teamRepairDialogData.mapping.teamName}
              </span>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Start Date
              </label>
              <input
                type="date"
                value={teamRepairDialogData.startDate}
                onChange={(e) => {
                  setTeamRepairDialogData({
                    ...teamRepairDialogData,
                    startDate: e.target.value
                  });
                  setTeamStartDate(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleTeamRepairDialogCancel}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleTeamRepairDialogConfirm}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Add to Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board Number Selection Modal */}
      <BoardNumberModal
        isOpen={showBoardNumberModal}
        onClose={() => setShowBoardNumberModal(false)}
        onSelect={(boardNumber) => {
          if (onPilotFieldChange) {
            onPilotFieldChange('boardNumber', boardNumber);
          }
        }}
      />
    </div>
  );
};

export default PilotDetails;