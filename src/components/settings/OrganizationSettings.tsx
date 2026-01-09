import React, { useState, useEffect } from 'react';
import { AlertCircle, Edit, Trash, X, Eye, EyeOff } from 'lucide-react';
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
        case 'squadron':
          result = await deleteSquadron(entityId);
          if (result.success) {
            setSquadrons(squadrons.filter(s => s.id !== entityId));
          }
          break;
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

  const addButtonStyle = {
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
    justifyContent: 'center',
    marginTop: '10px',
    marginLeft: 'auto',
    marginRight: 'auto'
  };

  const sectionStyle = {
    paddingTop: '32px',
    paddingBottom: '32px',
    borderTop: '1px solid #E5E7EB',
    marginTop: '32px'
  };

  const firstSectionStyle = {
    paddingTop: '0',
    paddingBottom: '32px',
    marginTop: '0',
    borderTop: 'none'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
                Organization
              </h2>
              <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
                Configure your organizational hierarchy and entities.
              </p>
            </div>

            <button
              onClick={() => setShowInactive(!showInactive)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'Inter',
                color: '#374151',
                transition: 'background-color 0.2s ease'
              }}
              title={showInactive ? "Hide inactive entities" : "Show inactive entities"}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
            >
              {showInactive ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {(error || localError) && (
            <div style={{
              padding: '16px',
              marginBottom: '24px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'Inter',
              fontSize: '14px'
            }} role="alert">
              <AlertCircle size={18} style={{ marginRight: '8px' }} />
              <span>{error || localError}</span>
              <button onClick={() => setErrorMessage(null)} style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px'
              }}>
                <X size={16} />
              </button>
            </div>
          )}

          {loading && (
            <div style={{
              textAlign: 'center',
              padding: '32px 0',
              color: '#64748B',
              fontFamily: 'Inter',
              fontSize: '14px'
            }}>
              Loading organization data...
            </div>
          )}

          {!loading && (
          <>
            {/* Commands Level */}
            {(showInactive || filterEntities(commands).length > 0) && (
            <div style={firstSectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Commands
                </h3>
                <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>
                  {filterEntities(commands).length} active
                </span>
              </div>

            {filterEntities(commands).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No commands configured</p>
                <button
                  onClick={() => handleCreateEntity('command')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(commands).map(command => (
                    <div
                      key={command.id}
                      style={{
                        padding: '16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(command) ? '#F8FAFC' : '#FFFFFF',
                        opacity: !isEntityActive(command) ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px', color: '#0F172A', fontFamily: 'Inter' }}>
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
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#F8FAFC';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                            }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(command, 'command')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#FEF2F2';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.color = '#64748B';
                            }}
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                      {command.established_date && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
                          Est. {new Date(command.established_date).getFullYear()}
                        </div>
                      )}
                      {!isEntityActive(command) && (
                        <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'Inter', marginTop: '4px' }}>
                          Deactivated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCreateEntity('command')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </>
            )}
            </div>
            )}

            {/* Groups Level */}
            {(showInactive || filterEntities(groups).length > 0) && (
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Groups
                </h3>
                <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>
                  {filterEntities(groups).length} active
                </span>
              </div>

            {filterEntities(groups).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No groups configured</p>
                <button
                  onClick={() => handleCreateEntity('group')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(groups).map(group => (
                    <div
                      key={group.id}
                      style={{
                        padding: '16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(group) ? '#F8FAFC' : '#FFFFFF',
                        opacity: !isEntityActive(group) ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px', color: '#0F172A', fontFamily: 'Inter' }}>
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
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#F8FAFC';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                            }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(group, 'group')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#FEF2F2';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.color = '#64748B';
                            }}
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                      {group.command && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginBottom: '4px' }}>
                          {group.command.name}
                        </div>
                      )}
                      {group.established_date && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
                          Est. {new Date(group.established_date).getFullYear()}
                        </div>
                      )}
                      {!isEntityActive(group) && (
                        <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'Inter', marginTop: '4px' }}>
                          Deactivated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCreateEntity('group')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </>
            )}
            </div>
            )}

            {/* Wings Level */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Wings
                </h3>
                <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>
                  {filterEntities(wings).length} active
                </span>
              </div>

            {filterEntities(wings).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No wings configured</p>
                <button
                  onClick={() => handleCreateEntity('wing')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(wings).map(wing => (
                    <div
                      key={wing.id}
                      style={{
                        padding: '16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(wing) ? '#F8FAFC' : '#FFFFFF',
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
                          backgroundColor: '#E5E7EB',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '20px', color: '#9CA3AF' }}>?</span>
                        </div>
                      )}

                      {/* Wing Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A', fontFamily: 'Inter', marginBottom: '2px' }}>
                          {wing.designation}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter', marginBottom: '8px' }}>
                          {wing.name}
                        </div>
                        {wing.group && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginBottom: '4px' }}>
                            {wing.group.command?.name ? `${wing.group.command.name} > ` : ''}{wing.group.name}
                          </div>
                        )}
                        {wing.tail_code && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginBottom: '4px' }}>
                            Tail Code: {wing.tail_code}
                          </div>
                        )}
                        {wing.established_date && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
                            Est. {new Date(wing.established_date).getFullYear()}
                          </div>
                        )}
                        {!isEntityActive(wing) && (
                          <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'Inter', marginTop: '4px' }}>
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
                            background: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: '#64748B',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Edit"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = '#F8FAFC';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'white';
                          }}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteEntity(wing, 'wing')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: '#64748B',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Delete"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = '#FEF2F2';
                            e.currentTarget.style.color = '#DC2626';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'white';
                            e.currentTarget.style.color = '#64748B';
                          }}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCreateEntity('wing')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </>
            )}
            </div>

            {/* Squadrons Level */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Squadrons
                </h3>
                <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>
                  {filterEntities(squadrons).length} active
                </span>
              </div>

            {filterEntities(squadrons).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No squadrons configured</p>
                <button
                  onClick={() => handleCreateEntity('squadron')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(squadrons).map(squadron => (
                    <div
                      key={squadron.id}
                      style={{
                        padding: '16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: !isEntityActive(squadron) ? '#F8FAFC' : '#FFFFFF',
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
                          backgroundColor: '#E5E7EB',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '20px', color: '#9CA3AF' }}>?</span>
                        </div>
                      )}

                      {/* Squadron Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A', fontFamily: 'Inter', marginBottom: '2px' }}>
                          {squadron.designation}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter', marginBottom: '8px' }}>
                          {squadron.name}
                        </div>
                        {squadron.wing && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginBottom: '4px' }}>
                            {squadron.wing.group?.command?.name ? `${squadron.wing.group.command.name} > ` : ''}
                            {squadron.wing.group ? `${squadron.wing.group.name} > ` : ''}
                            {squadron.wing.name}
                          </div>
                        )}
                        {squadron.tail_code && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginBottom: '4px' }}>
                            Tail Code: {squadron.tail_code}
                          </div>
                        )}
                        {squadron.established_date && (
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic' }}>
                            Est. {new Date(squadron.established_date).getFullYear()}
                          </div>
                        )}
                        {!isEntityActive(squadron) && (
                          <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'Inter', marginTop: '4px' }}>
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
                            background: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: '#64748B',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Edit"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = '#F8FAFC';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'white';
                          }}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteEntity(squadron, 'squadron')}
                          style={{
                            padding: '4px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s ease',
                            color: '#64748B',
                            width: '24px',
                            height: '24px'
                          }}
                          title="Delete"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                            e.currentTarget.style.background = '#FEF2F2';
                            e.currentTarget.style.color = '#DC2626';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                            e.currentTarget.style.background = 'white';
                            e.currentTarget.style.color = '#64748B';
                          }}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCreateEntity('squadron')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </>
            )}
            </div>

            {/* Teams Section */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  Teams
                </h3>
                <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>
                  {filterEntities(teams).length} active
                </span>
              </div>

            {filterEntities(teams).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No teams configured</p>
                <button
                  onClick={() => handleCreateEntity('team')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  {filterEntities(teams).map(team => (
                    <div
                      key={team.id}
                      style={{
                        padding: '16px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: !team.active ? '#F8FAFC' : '#FFFFFF',
                        opacity: !team.active ? 0.6 : 1,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A', fontFamily: 'Inter', marginBottom: '2px' }}>
                            {team.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter', textTransform: 'capitalize' }}>
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
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Edit"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#F8FAFC';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                            }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(team, 'team')}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              color: '#64748B',
                              width: '24px',
                              height: '24px'
                            }}
                            title="Delete"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                              e.currentTarget.style.background = '#FEF2F2';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.color = '#64748B';
                            }}
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                      {team.description && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'Inter', marginTop: '8px' }}>
                          {team.description}
                        </div>
                      )}
                      {!team.active && (
                        <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'Inter', marginTop: '4px' }}>
                          Inactive
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCreateEntity('team')}
                  style={addButtonStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  +
                </button>
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
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
            <p className="text-slate-600 mb-4">
              Are you sure you want to delete this {deleteConfirmation.entityType}? This action cannot be undone.
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Type "yes" to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmation.confirmText}
              onChange={(e) => setDeleteConfirmation({
                ...deleteConfirmation,
                confirmText: e.target.value
              })}
              className="w-full px-3 py-2 border border-slate-300 rounded mb-4"
              placeholder="Type 'yes' to confirm"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmation({ isOpen: false, confirmText: '' })}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmation.confirmText.toLowerCase() !== 'yes'}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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