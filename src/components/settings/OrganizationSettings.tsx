import React, { useState, useEffect } from 'react';
import { Icon, Button } from '../ui/primitives';
import {
  Command,
  Group,
  Wing,
  Squadron,
  NewCommand,
  NewGroup,
  NewWing,
  NewSquadron
} from '../../types/OrganizationTypes';
import type { Team, NewTeam } from '../../types/TeamTypes';
import {
  getAllCommands,
  getAllGroups,
  getAllWings,
  getAllSquadrons,
  createCommand,
  createGroup,
  createWing,
  createSquadron,
  updateCommand,
  updateGroup,
  updateWing,
  updateSquadron,
  deleteCommand,
  deleteGroup,
  deleteWing,
  deleteSquadron,
  getAllTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  isEntityActive
} from '../../utils/organizationService';
import OrgEntityModal from './OrgEntityModal';
import { deleteStorageFileByUrl } from '../../utils/r2StorageService';

interface OrganizationSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const OrganizationSettings: React.FC<OrganizationSettingsProps> = ({ error, setError }) => {
  // State for all organizational entities
  const [commands, setCommands] = useState<Command[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    entityType: 'command' | 'group' | 'wing' | 'squadron' | 'team';
    entity?: Command | Group | Wing | Squadron | Team;
  }>({
    isOpen: false,
    mode: 'create',
    entityType: 'command'
  });

  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    entity?: Command | Group | Wing | Squadron | Team;
    entityType?: 'command' | 'group' | 'wing' | 'squadron' | 'team';
    confirmText: string;
  }>({
    isOpen: false,
    confirmText: ''
  });

  // Helper to set errors with parent component if available
  const setErrorMessage = (message: string | null) => {
    setLocalError(message);
    if (setError) {
      setError(message);
    }
  };

  // Load all organizational data
  const loadOrganizationData = async () => {
    setLoading(true);
    try {
      const [commandsResult, groupsResult, wingsResult, squadronsResult, teamsResult] = await Promise.all([
        getAllCommands(),
        getAllGroups(),
        getAllWings(),
        getAllSquadrons(),
        getAllTeams()
      ]);

      if (commandsResult.error) {
        console.error('Error loading commands:', commandsResult.error);
      } else if (commandsResult.data) {
        setCommands(commandsResult.data);
      }

      if (groupsResult.error) {
        console.error('Error loading groups:', groupsResult.error);
      } else if (groupsResult.data) {
        setGroups(groupsResult.data);
      }

      if (wingsResult.error) {
        console.error('Error loading wings:', wingsResult.error);
      } else if (wingsResult.data) {
        console.log('Wings loaded from database:', wingsResult.data);
        console.log('Wings data length:', wingsResult.data.length);
        if (wingsResult.data.length > 0) {
          console.log('First wing structure:', wingsResult.data[0]);
          console.log('First wing deactivated_date:', wingsResult.data[0].deactivated_date);
        }
        setWings(wingsResult.data);
      } else {
        console.log('No wings data returned from database');
      }

      if (squadronsResult.error) {
        console.error('Error loading squadrons:', squadronsResult.error);
      } else if (squadronsResult.data) {
        setSquadrons(squadronsResult.data);
      }

      if (teamsResult.error) {
        console.error('Error loading teams:', teamsResult.error);
      } else if (teamsResult.data) {
        setTeams(teamsResult.data);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      console.error('Error loading organization data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizationData();
  }, []);

  // Filter entities based on active status
  const filterEntities = <T extends { deactivated_date?: string | null; active?: boolean }>(entities: T[]): T[] => {
    if (showInactive) return entities;
    // For teams (have active field), filter by active status
    if (entities.length > 0 && 'active' in entities[0]) {
      return entities.filter((e: any) => e.active);
    }
    // For other entities (have deactivated_date field), use isEntityActive
    return entities.filter((e: any) => isEntityActive(e));
  };

  // Handle opening create modal
  const handleCreateEntity = (entityType: 'command' | 'group' | 'wing' | 'squadron' | 'team') => {
    console.log('handleCreateEntity called with:', entityType);
    setModalState({
      isOpen: true,
      mode: 'create',
      entityType,
      entity: undefined
    });
    console.log('Modal state set to:', { isOpen: true, mode: 'create', entityType });
  };

  // Handle opening edit modal
  const handleEditEntity = (entity: Command | Group | Wing | Squadron | Team, entityType: 'command' | 'group' | 'wing' | 'squadron' | 'team') => {
    setModalState({
      isOpen: true,
      mode: 'edit',
      entityType,
      entity
    });
  };

  // Handle modal save
  const handleModalSave = async (data: NewCommand | NewGroup | NewWing | NewSquadron | NewTeam) => {
    console.log('handleModalSave called');
    setLoading(true);
    try {
      if (modalState.mode === 'create') {
        let result: any;
        switch (modalState.entityType) {
          case 'command':
            result = await createCommand(data as NewCommand);
            if (result.data) setCommands([...commands, result.data]);
            break;
          case 'group':
            result = await createGroup(data as NewGroup);
            if (result.data) setGroups([...groups, result.data]);
            break;
          case 'wing':
            result = await createWing(data as NewWing);
            if (result.data) setWings([...wings, result.data]);
            break;
          case 'squadron':
            result = await createSquadron(data as NewSquadron);
            if (result.data) setSquadrons([...squadrons, result.data]);
            break;
          case 'team':
            result = await createTeam(data as NewTeam);
            if (result.data) setTeams([...teams, result.data]);
            break;
        }
        
        if (result?.error) {
          console.error('Creation failed with error:', result.error);
          throw new Error(result.error.message || `Failed to create ${modalState.entityType}`);
        }
        
        console.log('Entity created successfully:', result);
      } else {
        // Edit mode
        if (!modalState.entity) return;
        
        let result: any;
        switch (modalState.entityType) {
          case 'command':
            result = await updateCommand(modalState.entity.id, data as NewCommand);
            if (result.data) {
              setCommands(commands.map(c => c.id === modalState.entity!.id ? result.data! : c));
            }
            break;
          case 'group':
            result = await updateGroup(modalState.entity.id, data as NewGroup);
            if (result.data) {
              setGroups(groups.map(g => g.id === modalState.entity!.id ? result.data! : g));
            }
            break;
          case 'wing':
            console.log('About to call updateWing with:', modalState.entity.id, data);
            result = await updateWing(modalState.entity.id, data as NewWing);
            console.log('updateWing returned:', result);
            if (result.data) {
              setWings(wings.map(w => w.id === modalState.entity!.id ? result.data! : w));
            }
            break;
          case 'squadron':
            result = await updateSquadron(modalState.entity.id, data as NewSquadron);
            if (result.data) {
              setSquadrons(squadrons.map(s => s.id === modalState.entity!.id ? result.data! : s));
            }
            break;
          case 'team':
            result = await updateTeam(modalState.entity.id, data as Partial<NewTeam>);
            if (result.data) {
              setTeams(teams.map(t => t.id === modalState.entity!.id ? result.data! : t));
            }
            break;
        }
        
        if (result?.error) {
          throw new Error(result.error.message || `Failed to update ${modalState.entityType}`);
        }
      }
      
      setModalState({ ...modalState, isOpen: false });
    } catch (err: any) {
      console.error('handleModalSave error:', err);
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete entity
  const handleDeleteEntity = (entity: Command | Group | Wing | Squadron | Team, entityType: 'command' | 'group' | 'wing' | 'squadron' | 'team') => {
    setDeleteConfirmation({
      isOpen: true,
      entity,
      entityType,
      confirmText: ''
    });
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deleteConfirmation.entity || !deleteConfirmation.entityType) return;
    if (deleteConfirmation.confirmText.toLowerCase() !== 'yes') {
      setErrorMessage('Please type "yes" to confirm deletion');
      return;
    }

    setLoading(true);
    try {
      let result: any;
      const entityId = deleteConfirmation.entity.id;
      
      switch (deleteConfirmation.entityType) {
        case 'command':
          result = await deleteCommand(entityId);
          if (result.success) {
            setCommands(commands.filter(c => c.id !== entityId));
          }
          break;
        case 'group':
          result = await deleteGroup(entityId);
          if (result.success) {
            setGroups(groups.filter(g => g.id !== entityId));
          }
          break;
        case 'wing':
          result = await deleteWing(entityId);
          if (result.success) {
            setWings(wings.filter(w => w.id !== entityId));
          }
          break;
        case 'squadron': {
          const sq = deleteConfirmation.entity as Squadron;
          if (sq.insignia_url) {
            await deleteStorageFileByUrl(sq.insignia_url).catch(err =>
              console.warn('[GC] Failed to delete squadron insignia:', err)
            );
          }
          result = await deleteSquadron(entityId);
          if (result.success) {
            setSquadrons(squadrons.filter(s => s.id !== entityId));
          }
          break;
        }
        case 'team':
          result = await deleteTeam(entityId);
          if (!result.error) {
            setTeams(teams.filter(t => t.id !== entityId));
          }
          break;
      }
      
      if (result?.error) {
        throw new Error(result.error.message || `Failed to delete ${deleteConfirmation.entityType}`);
      }
      
      setDeleteConfirmation({ isOpen: false, confirmText: '' });
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };


  // Dividers are drawn between sections only (.rr-org-section + .rr-org-section), so a hidden
  // first section (e.g. no Commands) doesn't leave an empty band at the top.
  const sectionStyle = { paddingBottom: '32px' };
  const firstSectionStyle = sectionStyle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--rr-panel)' }}>
      {/* Fixed Header */}
      <div style={{ padding: 0, flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--rr-border)' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--rr-text)' }}>
                Organization
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--rr-text2)', margin: '1px 0 0 0', fontFamily: 'inherit' }}>
                Configure your organizational hierarchy and entities.
              </p>
            </div>

            <Button
              size="sm"
              variant="secondary"
              icon={showInactive ? 'eyeOff' : 'eye'}
              title={showInactive ? 'Hide inactive entities' : 'Show inactive entities'}
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{ maxWidth: '960px' }}>
          {(error || localError) && (
            <div style={{
              padding: '16px',
              marginBottom: '24px',
              backgroundColor: 'rgba(224,82,78,.12)',
              border: '1px solid var(--rr-bad)',
              color: 'var(--rr-bad)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'inherit',
              fontSize: '14px'
            }} role="alert">
              <Icon name="alertCircle" size={18} style={{ marginRight: '8px' }} />
              <span>{error || localError}</span>
              <button onClick={() => setErrorMessage(null)} style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px'
              }}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          {loading && (
            <div style={{
              textAlign: 'center',
              padding: '32px 0',
              color: 'var(--rr-text2)',
              fontFamily: 'inherit',
              fontSize: '14px'
            }}>
              Loading organization data...
            </div>
          )}

          {!loading && (
          <>
            {/* Commands Level */}
            {(showInactive || filterEntities(commands).length > 0) && (
            <div className="rr-org-section" style={firstSectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: 0 }}>
                  Commands
                </h3>
                <span style={{ fontSize: '14px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                  {filterEntities(commands).length} active
                </span>
              </div>

            {filterEntities(commands).length === 0 ? (
              <div className="text-center py-8 text-text2">
                <p className="mb-4">No commands configured</p>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('command')}>Add command</Button></div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(commands).map(command => (
                    <div
                      key={command.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(command) ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                        opacity: !isEntityActive(command) ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--rr-text)', fontFamily: 'inherit' }}>
                            {command.name}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <button
                            onClick={() => handleEditEntity(command, 'command')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'var(--rr-panel2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                            }}
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(command, 'command')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'rgba(224,82,78,.12)';
                              e.currentTarget.style.color = 'var(--rr-bad)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                              e.currentTarget.style.color = 'var(--rr-text2)';
                            }}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                      {command.established_date && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', fontStyle: 'italic' }}>
                          Est. {new Date(command.established_date).getFullYear()}
                        </div>
                      )}
                      {!isEntityActive(command) && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-bad)', fontFamily: 'inherit', marginTop: '4px' }}>
                          Deactivated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('command')}>Add command</Button></div>
              </>
            )}
            </div>
            )}

            {/* Groups Level */}
            {(showInactive || filterEntities(groups).length > 0) && (
            <div className="rr-org-section" style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: 0 }}>
                  Groups
                </h3>
                <span style={{ fontSize: '14px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                  {filterEntities(groups).length} active
                </span>
              </div>

            {filterEntities(groups).length === 0 ? (
              <div className="text-center py-8 text-text2">
                <p className="mb-4">No groups configured</p>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('group')}>Add group</Button></div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(groups).map(group => (
                    <div
                      key={group.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(group) ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                        opacity: !isEntityActive(group) ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--rr-text)', fontFamily: 'inherit' }}>
                            {group.name}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <button
                            onClick={() => handleEditEntity(group, 'group')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'var(--rr-panel2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                            }}
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(group, 'group')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'rgba(224,82,78,.12)';
                              e.currentTarget.style.color = 'var(--rr-bad)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                              e.currentTarget.style.color = 'var(--rr-text2)';
                            }}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                      {group.command && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginBottom: '4px' }}>
                          {group.command.name}
                        </div>
                      )}
                      {group.established_date && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', fontStyle: 'italic' }}>
                          Est. {new Date(group.established_date).getFullYear()}
                        </div>
                      )}
                      {!isEntityActive(group) && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-bad)', fontFamily: 'inherit', marginTop: '4px' }}>
                          Deactivated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('group')}>Add group</Button></div>
              </>
            )}
            </div>
            )}

            {/* Wings Level */}
            <div className="rr-org-section" style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: 0 }}>
                  Wings
                </h3>
                <span style={{ fontSize: '14px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                  {filterEntities(wings).length} active
                </span>
              </div>

            {filterEntities(wings).length === 0 ? (
              <div className="text-center py-8 text-text2">
                <p className="mb-4">No wings configured</p>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('wing')}>Add wing</Button></div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(wings).map(wing => (
                    <div
                      key={wing.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(wing) ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                        opacity: !isEntityActive(wing) ? 0.6 : 1,
                        position: 'relative',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start'
                      }}
                    >
                      {/* Wing Insignia */}
                      {wing.insignia_url ? (
                        <div style={{
                          width: '48px',
                          height: '48px',
                          backgroundImage: `url(${wing.insignia_url})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          flexShrink: 0
                        }} />
                      ) : (
                        <div style={{
                          width: '48px',
                          height: '48px',
                          backgroundColor: 'var(--rr-panel3)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '20px', color: 'var(--rr-text3)' }}>?</span>
                        </div>
                      )}

                      {/* Wing Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--rr-text)', fontFamily: 'inherit', marginBottom: '2px' }}>
                          {wing.designation}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--rr-text2)', fontFamily: 'inherit', marginBottom: '8px' }}>
                          {wing.name}
                        </div>
                        {wing.group && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginBottom: '4px' }}>
                            {wing.group.command?.name ? `${wing.group.command.name} > ` : ''}{wing.group.name}
                          </div>
                        )}
                        {wing.tail_code && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginBottom: '4px' }}>
                            Tail Code: {wing.tail_code}
                          </div>
                        )}
                        {wing.established_date && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', fontStyle: 'italic' }}>
                            Est. {new Date(wing.established_date).getFullYear()}
                          </div>
                        )}
                        {!isEntityActive(wing) && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-bad)', fontFamily: 'inherit', marginTop: '4px' }}>
                            Deactivated
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                        <button
                          onClick={() => handleEditEntity(wing, 'wing')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'var(--rr-panel)',
                            boxShadow: 'var(--rr-shadow)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: 'var(--rr-text2)',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Edit"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = 'var(--rr-panel2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'var(--rr-panel)';
                          }}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteEntity(wing, 'wing')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'var(--rr-panel)',
                            boxShadow: 'var(--rr-shadow)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: 'var(--rr-text2)',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Delete"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = 'rgba(224,82,78,.12)';
                            e.currentTarget.style.color = 'var(--rr-bad)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'var(--rr-panel)';
                            e.currentTarget.style.color = 'var(--rr-text2)';
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('wing')}>Add wing</Button></div>
              </>
            )}
            </div>

            {/* Squadrons Level */}
            <div className="rr-org-section" style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: 0 }}>
                  Squadrons
                </h3>
                <span style={{ fontSize: '14px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                  {filterEntities(squadrons).length} active
                </span>
              </div>

            {filterEntities(squadrons).length === 0 ? (
              <div className="text-center py-8 text-text2">
                <p className="mb-4">No squadrons configured</p>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('squadron')}>Add squadron</Button></div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(squadrons).map(squadron => (
                    <div
                      key={squadron.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(squadron) ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                        opacity: !isEntityActive(squadron) ? 0.6 : 1,
                        position: 'relative',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start'
                      }}
                    >
                      {/* Squadron Insignia */}
                      {squadron.insignia_url ? (
                        <div style={{
                          width: '48px',
                          height: '48px',
                          backgroundImage: `url(${squadron.insignia_url})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          flexShrink: 0
                        }} />
                      ) : (
                        <div style={{
                          width: '48px',
                          height: '48px',
                          backgroundColor: 'var(--rr-panel3)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '20px', color: 'var(--rr-text3)' }}>?</span>
                        </div>
                      )}

                      {/* Squadron Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--rr-text)', fontFamily: 'inherit', marginBottom: '2px' }}>
                          {squadron.designation}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--rr-text2)', fontFamily: 'inherit', marginBottom: '8px' }}>
                          {squadron.name}
                        </div>
                        {squadron.wing && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginBottom: '4px' }}>
                            {squadron.wing.group?.command?.name ? `${squadron.wing.group.command.name} > ` : ''}
                            {squadron.wing.group ? `${squadron.wing.group.name} > ` : ''}
                            {squadron.wing.name}
                          </div>
                        )}
                        {squadron.tail_code && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginBottom: '4px' }}>
                            Tail Code: {squadron.tail_code}
                          </div>
                        )}
                        {squadron.established_date && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', fontStyle: 'italic' }}>
                            Est. {new Date(squadron.established_date).getFullYear()}
                          </div>
                        )}
                        {!isEntityActive(squadron) && (
                          <div style={{ fontSize: '11px', color: 'var(--rr-bad)', fontFamily: 'inherit', marginTop: '4px' }}>
                            Deactivated
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleEditEntity(squadron, 'squadron')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'var(--rr-panel)',
                            boxShadow: 'var(--rr-shadow)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: 'var(--rr-text2)',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Edit"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = 'var(--rr-panel2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'var(--rr-panel)';
                          }}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteEntity(squadron, 'squadron')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'var(--rr-panel)',
                            boxShadow: 'var(--rr-shadow)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: 'var(--rr-text2)',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Delete"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = 'rgba(224,82,78,.12)';
                            e.currentTarget.style.color = 'var(--rr-bad)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'var(--rr-panel)';
                            e.currentTarget.style.color = 'var(--rr-text2)';
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('squadron')}>Add squadron</Button></div>
              </>
            )}
            </div>

            {/* Teams Section */}
            <div className="rr-org-section" style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: 0 }}>
                  Teams
                </h3>
                <span style={{ fontSize: '14px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                  {filterEntities(teams).length} active
                </span>
              </div>

            {filterEntities(teams).length === 0 ? (
              <div className="text-center py-8 text-text2">
                <p className="mb-4">No teams configured</p>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('team')}>Add team</Button></div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(teams).map(team => (
                    <div
                      key={team.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '8px',
                        backgroundColor: !team.active ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                        opacity: !team.active ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--rr-text)', fontFamily: 'inherit', marginBottom: '2px' }}>
                            {team.name}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--rr-text2)', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                            {team.scope} Team
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <button
                            onClick={() => handleEditEntity(team, 'team')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'var(--rr-panel2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                            }}
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(team, 'team')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'var(--rr-panel)',
                              boxShadow: 'var(--rr-shadow)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: 'var(--rr-text2)',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = 'rgba(224,82,78,.12)';
                              e.currentTarget.style.color = 'var(--rr-bad)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'var(--rr-panel)';
                              e.currentTarget.style.color = 'var(--rr-text2)';
                            }}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                      {team.description && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginTop: '8px' }}>
                          {team.description}
                        </div>
                      )}
                      {!team.active && (
                        <div style={{ fontSize: '11px', color: 'var(--rr-bad)', fontFamily: 'inherit', marginTop: '4px' }}>
                          Inactive
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-[10px]"><Button size="sm" variant="ghost" icon="plus" onClick={() => handleCreateEntity('team')}>Add team</Button></div>
              </>
            )}
            </div>
          </>
          )}
        </div>
      </div>

      {/* Modal for creating/editing entities */}
      <OrgEntityModal
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        entityType={modalState.entityType}
        entity={modalState.entity}
        commands={commands}
        groups={groups}
        wings={wings}
        squadrons={squadrons}
        onSave={handleModalSave}
        onClose={() => {
          console.log('Modal onClose called');
          setModalState({ ...modalState, isOpen: false });
        }}
      />

      {/* Delete confirmation modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-panel p-6 rounded-lg w-96">
            <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
            <p className="text-text2 mb-4">
              Are you sure you want to delete this {deleteConfirmation.entityType}? This action cannot be undone.
            </p>
            <p className="text-sm text-text2 mb-4">
              Type "yes" to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmation.confirmText}
              onChange={(e) => setDeleteConfirmation({
                ...deleteConfirmation,
                confirmText: e.target.value
              })}
              className="w-full px-3 py-2 border border-border2 rounded mb-4"
              placeholder="Type 'yes' to confirm"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmation({ isOpen: false, confirmText: '' })}
                className="px-4 py-2 bg-panel3 text-text rounded hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmation.confirmText.toLowerCase() !== 'yes'}
                className="px-4 py-2 bg-bad text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationSettings;