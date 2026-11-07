import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Pilot } from '../../../utils/pilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification, getAllQualifications, getPilotQualifications, clearPilotQualificationsCache } from '../../../utils/qualificationService';
import { dateInputToLocalDate } from '../../../utils/dateUtils';
import { Squadron } from '../../../utils/squadronService';
import QualificationsManager from './QualificationsManager';
import TeamsManager from './TeamsManager';
import TrainingEnrollmentsManager from '../../training/TrainingEnrollmentsManager';
import QualificationBadge from '../QualificationBadge';
import { Button, Chip, Dialog, EmptyState, Field, FieldLabel, Icon, IconButton, SectionCard, Select, SquadronInsignia, StatusChip, TextInput, Toast, controlClass, legibleColor } from '../primitives';
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
  pilotEnrollments?: any[];
  availableTrainingCycles?: any[];
  loadingEnrollments?: boolean;
  updatingEnrollments?: boolean;
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
  handleAddEnrollment?: (cycleId: string) => Promise<void>;
  handleRemoveEnrollment?: (enrollmentId: string) => Promise<void>;
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

const PANE = 'flex-1 min-w-0 min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden';

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
  pilotEnrollments = [],
  availableTrainingCycles = [],
  loadingEnrollments = false,
  updatingEnrollments = false,
  setSelectedQualification,
  setQualificationAchievedDate,
  setSelectedTeam,
  setTeamStartDate,
  handleAddQualification,
  handleRemoveQualification,
  handleAddTeam,
  handleRemoveTeam,
  handleAddEnrollment,
  handleRemoveEnrollment,
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
  const navigate = useNavigate();
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

  // Update edited pilot whenever selectedPilot changes (for real-time preview)
  useEffect(() => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
    } else {
      setEditedPilot(null);
    }
  }, [selectedPilot]);

  // Load Discord data only when pilot ID changes, not on every field update
  useEffect(() => {
    if (selectedPilot) {
      setIsEdited(false);
      setSelectedDiscordId(selectedPilot.discord_id || '');
      loadDiscordRoles();
      loadDiscordMembers();

      // Load qualifications data for caching
      if (cachedQualifications.length === 0) {
        loadQualificationsCache();
      }
    } else {
      setDiscordMember(null);
      setDiscordRoles([]);
      setSelectedDiscordId('');
    }
    setEditError(null);
  }, [selectedPilot?.id]); // Only re-run when pilot ID changes
  
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
      // Check if qualification is currently held (historical records don't block re-adding)
      const { data: existingQualifications, error: checkError } = await supabase
        .from('pilot_qualifications')
        .select('id')
        .eq('pilot_id', selectedPilot.id)
        .eq('qualification_id', repairDialogData.selectedQualificationId)
        .eq('is_current', true);

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
          order: role.order,
          created_at: null
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
        created_at: new Date().toISOString()
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
      discord_id: discordId || null,
      discord_username: selectedMember?.username || null
    });

    setSelectedDiscordId(discordId);
    setIsEdited(true);
  };

  const handleClearDiscordSelection = () => {
    if (!editedPilot) return;

    // Clear Discord selection locally (doesn't save immediately)
    setEditedPilot({
      ...editedPilot,
      discord_id: null,
      discord_username: null
    });

    setSelectedDiscordId('');
    setIsEdited(true);
  };

  if (!selectedPilot) {
    return (
      <div ref={pilotDetailsRef} className={PANE}>
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState icon="roster" title="No pilot selected" message="Pick a pilot from the roster to see and edit their record." />
        </div>
      </div>
    );
  }

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
      onPilotFieldChange('currentStanding', standing ? JSON.stringify(standing) : '');
    }
  };

  const handleNewPilotSquadronChange = (squadronId: string) => {
    if (onPilotFieldChange) {
      const squadron = squadrons.find(s => s.id === squadronId);
      onPilotFieldChange('squadron_id', squadronId);
      onPilotFieldChange('currentSquadron', squadron ? JSON.stringify(squadron) : '');
    }
  };

  const handleNewPilotRoleChange = (roleId: string) => {
    if (onPilotFieldChange) {
      const role = roles.find(r => r.id === roleId);
      onPilotFieldChange('role_id', roleId);
      onPilotFieldChange('currentRole', role ? JSON.stringify(role) : '');
    }
  };

  // ---- Option lists (copies: never sort the props in place) ---------------------------------
  const statusOptions = [...statuses].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.name }));
  const standingOptions = [...standings].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.name }));
  const squadronOptions = [
    { value: '', label: 'Unassigned', searchText: 'Unassigned' },
    ...[...squadrons]
      .filter(sq => !sq.deactivated_date) // active squadrons only
      .sort((a, b) => a.designation.localeCompare(b.designation))
      .map(sq => ({
        value: sq.id,
        label: sq.designation,
        description: sq.name,
        searchText: `${sq.designation} ${sq.name}`,
        icon: <SquadronInsignia squadron={sq as any} size={18} />,
      })),
  ];
  const roleOptions = [
    { value: '', label: 'No billet' },
    ...[...roles].sort((a, b) => a.order - b.order).map(r => ({ value: r.id, label: r.name, disabled: Boolean(disabledRoles[r.id]) })),
  ];
  const discordOptions = (members: DiscordMember[]) =>
    members.map(m => ({
      value: m.id,
      label: m.displayName || m.username,
      description: m.displayName && m.displayName !== m.username ? `@${m.username}` : undefined,
      searchText: `${m.displayName} ${m.username}`,
    }));

  // ---- Shared field blocks --------------------------------------------------------------------
  const assignmentFields = (p: {
    statusId: string; standingId: string; squadronId: string; roleId: string;
    onStatus: (v: string) => void; onStanding: (v: string) => void; onSquadron: (v: string) => void; onRole: (v: string) => void;
    required?: boolean; roleDisabled?: boolean;
  }) => (
    <>
      <Field label="Status" required={p.required}>
        <Select value={p.statusId} onChange={p.onStatus} options={statusOptions} placeholder="Select status" />
      </Field>
      <Field label="Standing" required={p.required}>
        <Select value={p.standingId} onChange={p.onStanding} options={standingOptions} placeholder="Select standing" />
      </Field>
      <Field label="Squadron">
        <Select value={p.squadronId} onChange={p.onSquadron} options={squadronOptions} searchable={squadronOptions.length > 8} />
      </Field>
      <Field label="Billet">
        <Select value={p.roleId} onChange={p.onRole} options={roleOptions} disabled={p.roleDisabled} />
      </Field>
    </>
  );

  const discordPicker = (value: string, members: DiscordMember[], onChange: (id: string) => void) => (
    <Field label="Discord account" hint={isLoadingDiscordMembers ? 'Loading server members…' : 'Members already linked to another pilot are hidden.'}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Select
            value={value}
            onChange={onChange}
            options={discordOptions(members)}
            placeholder="No Discord account linked"
            disabled={isLoadingDiscordMembers}
            searchable
          />
        </div>
        <Button variant="ghost" icon="close" onClick={() => onChange('')} disabled={!value || isLoadingDiscordMembers}>Unlink</Button>
      </div>
    </Field>
  );

  // ---- Discord server roles (mapping state per role) ------------------------------------------
  const hasMappedQualification = (mapping: RoleMapping) =>
    localPilotQualifications?.some((pq: any) => {
      const q = pq.qualification;
      if (!q) return false;
      return q.name === mapping.qualificationName || q.id === mapping.qualification || q.name === mapping.qualification || pq.qualification_id === mapping.qualification;
    });
  const hasMappedTeam = (mapping: RoleMapping) => pilotTeams?.some((pt: PilotTeam) => pt.team_id === mapping.teamId && !pt.end_date);

  type RoleState = 'synced' | 'missingQual' | 'team' | 'missingTeam' | 'permission' | 'unmapped';
  const roleState = (role: DiscordRole): RoleState => {
    const mapping = roleMappings.find(m => m.discordRoleId === role.id);
    if (!mapping || mapping.isIgnoreUsers) return 'unmapped';
    if (mapping.qualification) return hasMappedQualification(mapping) ? 'synced' : 'missingQual';
    if (mapping.teamId) return hasMappedTeam(mapping) ? 'team' : 'missingTeam';
    if (mapping.appPermission) return 'permission';
    return 'unmapped';
  };
  const ROLE_TONE: Record<RoleState, string | null> = {
    synced: 'var(--rr-accent-text)', team: 'var(--rr-good)', permission: 'var(--rr-warn)',
    missingQual: 'var(--rr-bad)', missingTeam: 'var(--rr-bad)', unmapped: null,
  };

  const renderDiscordRoles = () => {
    if (isLoadingDiscordRoles) return <div className="text-[12.5px] text-text2">Loading Discord roles…</div>;
    if (discordRoleError) return <div className="text-[12.5px] text-bad">{discordRoleError}</div>;
    if (!discordMember || !discordRoles.length) return <div className="text-[12.5px] text-text3">No Discord roles found.</div>;
    const sorted = discordRoles
      .filter(r => discordMember.roles.includes(r.id) && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position);
    if (!sorted.length) return <div className="text-[12.5px] text-text3">No roles assigned.</div>;
    return (
      <div className="flex flex-wrap gap-[6px]">
        {sorted.map(role => {
          const st = roleState(role);
          const tone = ROLE_TONE[st];
          const mapping = roleMappings.find(m => m.discordRoleId === role.id);
          return (
            <span
              key={role.id}
              className="inline-flex items-center gap-[5px] h-[24px] pl-[9px] pr-[7px] rounded-full border text-[11.5px] font-semibold whitespace-nowrap"
              style={tone
                ? { color: tone, borderColor: `color-mix(in srgb, ${tone} 55%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, transparent)` }
                : { color: 'var(--rr-text2)', borderColor: 'var(--rr-border2)', background: 'var(--rr-panel2)' }}
            >
              {role.name}
              {st === 'synced' ? <span className="flex" title="In sync with a qualification"><Icon name="refresh" size={11} /></span> : null}
              {(st === 'missingQual' || st === 'missingTeam') && mapping ? (
                <button
                  type="button"
                  title={st === 'missingQual' ? `Add missing qualification: ${mapping.qualificationName}` : `Add to team: ${mapping.teamName}`}
                  onClick={() => (st === 'missingQual' ? handleAddMissingQualification(role, mapping) : handleAddMissingTeam(role, mapping))}
                  className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-transparent border-0 cursor-pointer hover:bg-panel3"
                  style={{ color: 'inherit' }}
                >
                  <Icon name="wrench" size={11} />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
    );
  };

  const roleLegend = (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {([['var(--rr-accent-text)', 'Qualification in sync'], ['var(--rr-good)', 'Team'], ['var(--rr-warn)', 'Permission'], ['var(--rr-bad)', 'Missing in ReadyRoom (wrench adds it)']] as const).map(([c, t]) => (
        <span key={t} className="inline-flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: c }} />{t}</span>
      ))}
    </span>
  );

  // ---- Header ---------------------------------------------------------------------------------
  const pilot = isNewPilot ? selectedPilot : (editedPilot || selectedPilot);
  const sq = pilot.currentSquadron as any;
  const sqColor = legibleColor(sq?.color_palette?.primary, 'var(--rr-text2)');
  const billet = pilot.roles?.[0]?.role?.name;
  const newPilotIncomplete =
    !selectedPilot.callsign || !selectedPilot.boardNumber || !selectedPilot.status_id || !selectedPilot.standing_id || !!boardNumberError;

  const header = (
    <div className="flex-none flex items-center gap-3 px-4 py-3 flex-wrap border-b border-border">
      {isNewPilot ? (
        <span className="w-10 h-10 flex-none rounded-rr-lg bg-panel2 border border-border2 flex items-center justify-center text-text3"><Icon name="userPlus" size={18} /></span>
      ) : (
        <SquadronInsignia squadron={sq} size={40} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[10px] min-w-0">
          {pilot.boardNumber ? <span className="font-mono text-[18px] font-semibold" style={{ color: sqColor }}>{pilot.boardNumber}</span> : null}
          <span className="text-[18px] font-semibold truncate">{isNewPilot ? (pilot.callsign || 'New pilot') : pilot.callsign}</span>
        </div>
        <div className="text-[12px] text-text2 truncate">
          {isNewPilot
            ? 'Board number, callsign, status and standing are required.'
            : [billet, sq ? `${sq.designation} ${sq.name || ''}`.trim() : 'Unassigned'].filter(Boolean).join(' · ')}
        </div>
      </div>
      {!isNewPilot ? (
        <span className="flex items-center gap-[6px] flex-wrap">
          {pilot.currentStatus ? <StatusChip status={pilot.currentStatus.name} /> : <Chip tone="bad">No status</Chip>}
          {pilot.currentStanding ? <Chip tone="neutral">{pilot.currentStanding.name}</Chip> : <Chip tone="bad">No standing</Chip>}
        </span>
      ) : null}
      {!isNewPilot ? (
        <Button size="sm" variant="secondary" icon="dossier" onClick={() => navigate(`/dossier?pilot=${selectedPilot.id}`)}>Dossier</Button>
      ) : null}
      {!isNewPilot && handleDeletePilot ? (
        <IconButton icon="trash" size={30} iconSize={14} label="Delete pilot" className="hover:!text-bad" onClick={() => setShowDeleteConfirmation(true)} />
      ) : null}
    </div>
  );

  // ---- Cards ----------------------------------------------------------------------------------
  const profileCard = isNewPilot ? (
    <SectionCard title="Profile">
      <div className="grid grid-cols-2 gap-[14px] p-[14px] max-[560px]:grid-cols-1">
        <Field label="Board number" required error={boardNumberError || undefined} hint="Starts with 5, 6 or 7; no 8, 9 or 0.">
          <div className="flex items-center gap-2">
            <TextInput
              mono
              value={selectedPilot.boardNumber || ''}
              invalid={!!boardNumberError}
              maxLength={3}
              placeholder="e.g. 512"
              onChange={e => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                if (value.length <= 3) onPilotFieldChange?.('boardNumber', value);
              }}
              className="flex-1"
            />
            <IconButton icon="list" size={36} iconSize={15} variant="outline" label="Pick an available board number" onClick={() => setShowBoardNumberModal(true)} />
          </div>
        </Field>
        <Field label="Callsign" required>
          <TextInput value={selectedPilot.callsign || ''} placeholder="Callsign" onChange={e => onPilotFieldChange?.('callsign', e.target.value)} />
        </Field>
        {assignmentFields({
          required: true,
          statusId: selectedPilot.currentStatus?.id || selectedPilot.status_id || '',
          standingId: selectedPilot.currentStanding?.id || selectedPilot.standing_id || '',
          squadronId: (selectedPilot as any)?.squadron_id || '',
          roleId: (selectedPilot as any)?.role_id || selectedPilot.roles?.[0]?.role?.id || '',
          onStatus: handleNewPilotStatusChange,
          onStanding: handleNewPilotStandingChange,
          onSquadron: handleNewPilotSquadronChange,
          onRole: handleNewPilotRoleChange,
        })}
      </div>
    </SectionCard>
  ) : editedPilot ? (
    <SectionCard title="Profile">
      <div className="grid grid-cols-2 gap-[14px] p-[14px] max-[560px]:grid-cols-1">
        <Field label="Board number">
          <TextInput mono value={editedPilot.boardNumber || ''} placeholder="Board number" onChange={e => handleFieldChange('boardNumber', e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="Callsign">
          <TextInput value={editedPilot.callsign || ''} placeholder="Callsign" onChange={e => handleFieldChange('callsign', e.target.value)} />
        </Field>
        {assignmentFields({
          statusId: editedPilot.currentStatus?.id || '',
          standingId: editedPilot.currentStanding?.id || '',
          squadronId: editedPilot.currentSquadron?.id || '',
          // editedPilot.roles reflects local edits (incl. a cleared billet); pilotRoles only when roles weren't loaded on the record
          roleId: editedPilot.roles != null ? (editedPilot.roles[0]?.role?.id || '') : (pilotRoles[0]?.id || ''),
          onStatus: handleEditStatusChange,
          onStanding: handleEditStandingChange,
          onSquadron: handleEditSquadronChange,
          onRole: handleEditRoleChange,
          roleDisabled: loadingRoles,
        })}
      </div>
    </SectionCard>
  ) : null;

  const discordCard = isNewPilot ? (
    <SectionCard title="Discord">
      <div className="p-[14px]">
        {discordPicker((selectedPilot as any)?.discord_id || '', availableDiscordMembers, id => {
          const m = allDiscordMembers.find(x => x.id === id);
          onPilotFieldChange?.('discord_id', id);
          onPilotFieldChange?.('discordUsername', m?.username || '');
        })}
      </div>
    </SectionCard>
  ) : (() => {
    // Current selection stays selectable even when it's filtered out as "linked"
    const selectedMember = allDiscordMembers.find(m => m.id === selectedDiscordId);
    const members = [...availableDiscordMembers];
    if (selectedDiscordId && selectedMember && !members.find(m => m.id === selectedDiscordId)) members.unshift(selectedMember);
    return (
      <SectionCard title="Discord" footer={roleLegend}>
        <div className="p-[14px] flex flex-col gap-[14px]">
          {discordPicker(selectedDiscordId, members, id => (id ? handleDiscordSelectionChange(id) : handleClearDiscordSelection()))}
          <div>
            <FieldLabel>Server roles</FieldLabel>
            {renderDiscordRoles()}
          </div>
        </div>
      </SectionCard>
    );
  })();

  const enrollmentsCard = (
    <TrainingEnrollmentsManager
      pilotEnrollments={pilotEnrollments}
      availableTrainingCycles={availableTrainingCycles}
      onAddEnrollment={handleAddEnrollment || (async () => {})}
      onRemoveEnrollment={handleRemoveEnrollment || (async () => {})}
      isLoading={loadingEnrollments}
      isUpdating={updatingEnrollments}
    />
  );

  const error = saveError || editError;

  return (
    <div ref={pilotDetailsRef} className={PANE}>
      {header}

      {error ? (
        <div className="flex-none px-4 pt-3">
          <Toast tone="bad" onDismiss={editError ? () => setEditError(null) : undefined}>{error}</Toast>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid gap-[14px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))' }}>
          {profileCard}
          {discordCard}
          {isNewPilot ? (
            <div className="col-span-full">{enrollmentsCard}</div>
          ) : (
            <>
              <div className="col-span-full">
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
              </div>
              {enrollmentsCard}
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
            </>
          )}
        </div>
      </div>

      {/* Save bar: always present (buttons enable on change) so the body never resizes */}
      <div className="flex-none flex items-center gap-[10px] px-4 py-[10px] border-t border-border bg-panel2">
        {isNewPilot ? (
          <>
            <span className="text-[12px] text-text2 flex-1">{newPilotIncomplete ? 'Fill in the required fields to create the pilot.' : 'Ready to create.'}</span>
            <Button variant="secondary" icon="close" onClick={onCancelAddPilot} disabled={isSavingNewPilot}>Cancel</Button>
            <Button variant="primary" icon="save" onClick={onSaveNewPilot} disabled={isSavingNewPilot || newPilotIncomplete} loading={isSavingNewPilot}>
              Create pilot
            </Button>
          </>
        ) : (
          <>
            <span
              className="flex items-center gap-[7px] flex-1 min-w-0 text-[12px] text-text2 whitespace-nowrap"
              title="Qualifications, enrollments and teams save as soon as you change them."
            >
              <span className="flex-none w-[7px] h-[7px] rounded-full" style={isEdited ? { background: 'var(--rr-warn)' } : { boxShadow: 'inset 0 0 0 1.5px var(--rr-text3)' }} />
              <span className="truncate">{isEdited ? 'Unsaved profile changes' : 'No unsaved changes'}</span>
            </span>
            <Button variant="secondary" onClick={handleCancelChanges} disabled={!isEdited || isSaving}>Discard</Button>
            <Button variant="primary" icon="save" onClick={handleSaveChanges} disabled={!isEdited || isSaving} loading={isSaving}>Save changes</Button>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        title="Delete pilot"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteConfirmation(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                handleDeletePilot?.(selectedPilot.id);
                setShowDeleteConfirmation(false);
              }}
            >
              Delete pilot
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text2 leading-[1.55] m-0">
          Delete <strong className="text-text">{selectedPilot.boardNumber} {selectedPilot.callsign}</strong>? This can't be undone.
        </p>
      </Dialog>

      {/* Repair: add the qualification a mapped Discord role implies */}
      <Dialog
        open={Boolean(showRepairDialog && repairDialogData)}
        onClose={handleRepairDialogCancel}
        title="Add missing qualification"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={handleRepairDialogCancel}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={handleRepairDialogConfirm} disabled={!repairDialogData?.selectedQualificationId}>Add qualification</Button>
          </>
        }
      >
        {repairDialogData ? (
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[10px] p-3 rounded-rr-lg bg-panel2 border border-border text-[13px]">
              <Icon name="discord" size={16} style={{ color: '#5865F2' }} />
              <span className="font-semibold">{repairDialogData.discordRole.name}</span>
              <Icon name="arrowRight" size={14} style={{ color: 'var(--rr-text3)' }} />
              <span className="text-text2">ReadyRoom qualification</span>
            </div>
            <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px' }}>
              <Field label="Qualification" required>
                <Select
                  value={repairDialogData.selectedQualificationId}
                  onChange={id => setRepairDialogData(prev => (prev ? { ...prev, selectedQualificationId: id } : null))}
                  placeholder="Select qualification"
                  searchable
                  options={availableQualifications.map(q => ({
                    value: q.id,
                    label: q.name,
                    searchText: q.name,
                    icon: <QualificationBadge type={q.name as any} qualifications={cachedQualifications} size="small" />,
                  }))}
                />
              </Field>
              <Field label="Effective date">
                <input
                  type="date"
                  value={repairDialogData.earnedDate}
                  onChange={e => setRepairDialogData(prev => (prev ? { ...prev, earnedDate: e.target.value } : null))}
                  className={`${controlClass} px-3 h-[36px]`}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Repair: add to the team a mapped Discord role implies */}
      <Dialog
        open={Boolean(showTeamRepairDialog && teamRepairDialogData)}
        onClose={handleTeamRepairDialogCancel}
        title="Add to team"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={handleTeamRepairDialogCancel}>Cancel</Button>
            <Button variant="primary" icon="plus" onClick={handleTeamRepairDialogConfirm}>Add to team</Button>
          </>
        }
      >
        {teamRepairDialogData ? (
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[10px] p-3 rounded-rr-lg bg-panel2 border border-border text-[13px] flex-wrap">
              <Icon name="discord" size={16} style={{ color: '#5865F2' }} />
              <span className="font-semibold">{teamRepairDialogData.discordRole.name}</span>
              <Icon name="arrowRight" size={14} style={{ color: 'var(--rr-text3)' }} />
              <Chip tone="good">{teamRepairDialogData.mapping.teamName}</Chip>
            </div>
            <Field label="Start date">
              <input
                type="date"
                value={teamRepairDialogData.startDate}
                onChange={e => {
                  setTeamRepairDialogData({ ...teamRepairDialogData, startDate: e.target.value });
                  setTeamStartDate(e.target.value);
                }}
                className={`${controlClass} px-3 h-[36px] max-w-[200px]`}
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

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
