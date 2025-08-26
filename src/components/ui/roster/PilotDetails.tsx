import React, { useRef, useState, useEffect } from 'react';
import { Card } from '../card';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import StatusSelector from './StatusSelector';
import StandingSelector from './StandingSelector';
import RoleSelector from './RoleSelector';
import SquadronSelector from './SquadronSelector';
import { Squadron } from '../../../utils/squadronService';
import QualificationsManager from './QualificationsManager';
import { Save, X, Trash2, Sync } from 'lucide-react';
import { fetchDiscordGuildMember, fetchDiscordGuildRoles } from '../../../utils/discordService';

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

interface PilotDetailsProps {
  selectedPilot: Pilot | null;
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  pilotRoles: Role[];
  squadrons: Squadron[];
  availableQualifications: Qualification[];
  pilotQualifications: any[];
  loadingRoles: boolean;
  updatingRoles: boolean;
  updatingStatus: boolean;
  updatingStanding: boolean;
  updatingSquadron: boolean;
  loadingQualifications: boolean;
  disabledRoles: Record<string, boolean>;
  selectedQualification: string;
  qualificationAchievedDate: string;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleStatusChange: (statusId: string) => void;
  handleStandingChange: (standingId: string) => void;
  handleRoleChange: (roleId: string) => void;
  handleSquadronChange: (squadronId: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (id: string) => void;
  handleDeletePilot?: (pilotId: string) => void;
  handleSavePilotChanges?: (pilot: Pilot) => Promise<{ success: boolean; error?: string }>;
  handleClearDiscord?: (pilotId: string) => Promise<{ success: boolean; error?: string }>;
  isNewPilot?: boolean;
  onPilotFieldChange?: (field: string, value: string) => void;
  onSaveNewPilot?: () => void;
  onCancelAddPilot?: () => void;
  isSavingNewPilot?: boolean;
  saveError?: string | null;
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
  loadingRoles,
  updatingRoles,
  updatingStatus,
  updatingStanding,
  updatingSquadron,
  loadingQualifications,
  disabledRoles,
  selectedQualification,
  qualificationAchievedDate,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleStatusChange,
  handleStandingChange,
  handleRoleChange,
  handleSquadronChange,
  handleAddQualification,
  handleRemoveQualification,
  handleDeletePilot,
  handleSavePilotChanges,
  handleClearDiscord,
  isNewPilot = false,
  onPilotFieldChange,
  onSaveNewPilot,
  onCancelAddPilot,
  isSavingNewPilot = false,
  saveError = null,
}) => {
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [editedPilot, setEditedPilot] = useState<Pilot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isClearingDiscord, setIsClearingDiscord] = useState(false);
  const [discordMember, setDiscordMember] = useState<DiscordGuildMember | null>(null);
  const [discordRoles, setDiscordRoles] = useState<DiscordRole[]>([]);
  const [isLoadingDiscordRoles, setIsLoadingDiscordRoles] = useState(false);
  const [discordRoleError, setDiscordRoleError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
      setIsEdited(false);
      loadDiscordRoles();
    } else {
      setEditedPilot(null);
      setDiscordMember(null);
      setDiscordRoles([]);
    }
    setEditError(null);
  }, [selectedPilot]);

  const loadDiscordRoles = async () => {
    if (!selectedPilot?.discordId || !selectedPilot?.currentSquadron) {
      setDiscordMember(null);
      setDiscordRoles([]);
      return;
    }

    setIsLoadingDiscordRoles(true);
    setDiscordRoleError(null);

    try {
      // Get the guild ID from squadron Discord integration settings
      const guildId = selectedPilot.currentSquadron?.discord_integration?.selectedGuildId || '';
      
      if (!guildId) {
        setDiscordRoleError('No Discord server configured for this squadron');
        return;
      }

      const result = await fetchDiscordGuildMember(guildId, selectedPilot.discordId);
      
      if (result.error) {
        setDiscordRoleError(result.error);
        setDiscordMember(null);
        setDiscordRoles([]);
      } else {
        setDiscordMember(result.member);
        setDiscordRoles(result.roles);
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
        role: role
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

  const handleClearDiscordCredentials = async () => {
    console.log('Clear Discord button clicked'); // Debug log
    if (!editedPilot || !handleClearDiscord) {
      console.log('Cannot clear Discord credentials:', { 
        hasEditedPilot: !!editedPilot, 
        hasHandlerFunction: !!handleClearDiscord 
      }); // Debug log for why it's not working
      return;
    }

    setIsClearingDiscord(true);
    setEditError(null);

    try {
      console.log('Calling handleClearDiscord with pilot ID:', editedPilot.id); // Debug log
      const result = await handleClearDiscord(editedPilot.id);
      console.log('Clear Discord result:', result); // Debug log

      if (!result.success) {
        throw new Error(result.error || 'Failed to clear Discord credentials');
      }

      // Update locally to reflect changes immediately
      setEditedPilot({
        ...editedPilot,
        discordUsername: '',
        discordId: undefined
      });
      console.log('Discord credentials cleared locally'); // Debug log
      
    } catch (err: any) {
      console.error('Error clearing Discord credentials:', err); // Log the full error
      setEditError(err.message || 'An error occurred while clearing Discord credentials');
    } finally {
      setIsClearingDiscord(false);
    }
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

  const renderEditableBasicInfo = () => {
    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Board Number *</label>
          <input
            type="text"
            value={selectedPilot.boardNumber || ''}
            onChange={(e) =>
              onPilotFieldChange &&
              onPilotFieldChange('boardNumber', e.target.value.replace(/[^0-9]/g, ''))
            }
            style={inputFieldStyle}
            placeholder="Enter board number"
          />
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
                selectedStatusId={selectedPilot.currentStatus?.id || ''}
                updatingStatus={updatingStatus}
                handleStatusChange={handleStatusChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <StandingSelector
                standings={standings}
                selectedStandingId={selectedPilot.currentStanding?.id || ''}
                updatingStanding={updatingStanding}
                handleStandingChange={handleStandingChange}
              />
            </div>
          </div>

          <div>
            <div style={{ ...sectionSpacingStyle }}>
              <SquadronSelector
                squadrons={squadrons}
                selectedSquadronId={selectedPilot.currentSquadron?.id || ''}
                updatingSquadron={updatingSquadron}
                handleSquadronChange={handleSquadronChange}
              />
            </div>

            <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
              <RoleSelector
                roles={roles}
                pilotRoles={pilotRoles}
                updatingRoles={updatingRoles}
                loadingRoles={loadingRoles}
                disabledRoles={disabledRoles}
                handleRoleChange={handleRoleChange}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', color: '#64748B', fontSize: '14px' }}>* Board Number, Callsign, Status, and Standing are required</div>
      </>
    );
  };

  const renderDiscordUserInfo = () => {
    const pilot = editedPilot || selectedPilot;
    if (!pilot) return null;

    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Username</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              value={pilot.discordUsername || ''}
              style={{
                ...inputFieldStyle,
                backgroundColor: '#f1f5f9',
                cursor: 'not-allowed'
              }}
              placeholder="No Discord account linked"
              disabled
            />
            <button
              onClick={handleClearDiscordCredentials}
              disabled={!pilot.discordUsername || isClearingDiscord}
              style={{
                ...exportButtonStyle,
                cursor: !pilot.discordUsername || isClearingDiscord ? 'not-allowed' : 'pointer',
                opacity: !pilot.discordUsername || isClearingDiscord ? 0.7 : 1,
                minWidth: '80px',
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
              }}
              onMouseEnter={(e) => {
                if (pilot.discordUsername && !isClearingDiscord) {
                  e.currentTarget.style.backgroundColor = '#FECACA';
                }
              }}
              onMouseLeave={(e) => {
                if (pilot.discordUsername && !isClearingDiscord) {
                  e.currentTarget.style.backgroundColor = '#FEE2E2';
                }
              }}
            >
              {isClearingDiscord ? 'Clearing...' : 'Clear'}
            </button>
          </div>
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Server Roles</label>
          <div style={{ minHeight: '40px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
            {renderDiscordRoles()}
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

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px' }}>
        {sortedRoles.map((role) => {
          // Convert Discord color integer to hex
          const colorHex = role.color === 0 ? '#99AAB5' : `#${role.color.toString(16).padStart(6, '0')}`;
          
          return (
            <div
              key={role.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                backgroundColor: `${colorHex}20`, // 20% opacity background
                color: colorHex,
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500',
                border: `1px solid ${colorHex}40`,
                minHeight: '24px',
              }}
            >
              {role.name}
            </div>
          );
        })}
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
    <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
      <div>
        {isNewPilot && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600 }}>Add New Pilot</h1>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={onSaveNewPilot}
                disabled={
                  isSavingNewPilot ||
                  !selectedPilot.callsign ||
                  !selectedPilot.boardNumber ||
                  !selectedPilot.status_id ||
                  !selectedPilot.standing_id
                }
                style={{
                  ...exportButtonStyle,
                  cursor:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id ||
                    !selectedPilot.standing_id
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id ||
                    !selectedPilot.standing_id
                      ? 0.7
                      : 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    !isSavingNewPilot &&
                    selectedPilot.callsign &&
                    selectedPilot.boardNumber &&
                    selectedPilot.status_id &&
                    selectedPilot.standing_id
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
                    selectedPilot.standing_id
                  ) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <Save size={16} style={{ marginRight: '4px' }} />
                {isSavingNewPilot ? 'Saving...' : 'Save'}
              </button>
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
            </div>
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

        <div style={{ display: 'grid', gap: '24px', marginTop: '24px' }}>
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
              Qualifications
            </h2>

            {!isNewPilot && (
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
            )}
            {isNewPilot && (
              <div style={{ marginTop: '20px', color: '#64748B', fontSize: '14px' }}>
                Qualifications can be added after creating the pilot.
              </div>
            )}
          </Card>

          {!isNewPilot && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
                Attendance and Service Record
              </h2>

              <div style={pilotDetailsStyles.emptyQualMessage}>
                Service record information will be available in a future update
              </div>
            </Card>
          )}
        </div>

        {isEdited && (
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
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
          </div>
        )}

        {!isNewPilot && handleDeletePilot && (
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
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
          </div>
        )}

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
      </div>
    </div>
  );
};

export default PilotDetails;