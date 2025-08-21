import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
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
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  
  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    entityType: 'command' | 'group' | 'wing' | 'squadron';
    entity?: Command | Group | Wing | Squadron;
  }>({
    isOpen: false,
    mode: 'create',
    entityType: 'command'
  });

  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    entity?: Command | Group | Wing | Squadron;
    entityType?: 'command' | 'group' | 'wing' | 'squadron';
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
      const [commandsResult, groupsResult, wingsResult, squadronsResult] = await Promise.all([
        getAllCommands(),
        getAllGroups(),
        getAllWings(),
        getAllSquadrons()
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
  const filterEntities = <T extends { deactivated_date: string | null }>(entities: T[]): T[] => {
    if (showInactive) return entities;
    return entities.filter(isEntityActive);
  };

  // Handle opening create modal
  const handleCreateEntity = (entityType: 'command' | 'group' | 'wing' | 'squadron') => {
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
  const handleEditEntity = (entity: Command | Group | Wing | Squadron, entityType: 'command' | 'group' | 'wing' | 'squadron') => {
    setModalState({
      isOpen: true,
      mode: 'edit',
      entityType,
      entity
    });
  };

  // Handle modal save
  const handleModalSave = async (data: NewCommand | NewGroup | NewWing | NewSquadron) => {
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
        }
        
        if (result?.error) {
          throw new Error(result.error.message || `Failed to create ${modalState.entityType}`);
        }
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
            result = await updateWing(modalState.entity.id, data as NewWing);
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
        }
        
        if (result?.error) {
          throw new Error(result.error.message || `Failed to update ${modalState.entityType}`);
        }
      }
      
      setModalState({ ...modalState, isOpen: false });
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete entity
  const handleDeleteEntity = (entity: Command | Group | Wing | Squadron, entityType: 'command' | 'group' | 'wing' | 'squadron') => {
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">Organization</h2>
          <p className="text-slate-600">
            Configure your organizational hierarchy and entities.
          </p>
        </div>
        
        <button
          onClick={() => setShowInactive(!showInactive)}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          title={showInactive ? "Hide inactive entities" : "Show inactive entities"}
        >
          {showInactive ? <EyeOff size={16} /> : <Eye size={16} />}
          <span className="text-sm">
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </span>
        </button>
      </div>

      {(error || localError) && (
        <div className="p-4 mb-4 bg-red-100 border border-red-400 text-red-700 rounded relative flex items-center" role="alert">
          <AlertCircle size={18} className="mr-2" />
          <span>{error || localError}</span>
          <button onClick={() => setErrorMessage(null)} className="absolute top-0 right-0 p-2">
            <X size={16} />
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-4 text-slate-500">
          Loading organization data...
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {/* Commands Level */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Commands</h3>
              <span className="text-sm text-slate-500">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {filterEntities(commands).map(command => (
                    <div
                      key={command.id}
                      className={`p-4 border rounded-lg ${!isEntityActive(command) ? 'opacity-60 bg-slate-50' : 'bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-slate-900">{command.name}</h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditEntity(command, 'command')}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Edit"
                          >
                            <Edit size={14} className="text-slate-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(command, 'command')}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Delete"
                          >
                            <Trash size={14} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      {command.established_date && (
                        <p className="text-xs text-slate-500">
                          Est. {new Date(command.established_date).getFullYear()}
                        </p>
                      )}
                      {!isEntityActive(command) && (
                        <p className="text-xs text-red-500 mt-1">Deactivated</p>
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
          </Card>

          {/* Groups Level */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Groups</h3>
              <span className="text-sm text-slate-500">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {filterEntities(groups).map(group => (
                    <div
                      key={group.id}
                      className={`p-4 border rounded-lg ${!isEntityActive(group) ? 'opacity-60 bg-slate-50' : 'bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-slate-900">{group.name}</h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditEntity(group, 'group')}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Edit"
                          >
                            <Edit size={14} className="text-slate-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(group, 'group')}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Delete"
                          >
                            <Trash size={14} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      {group.command && (
                        <p className="text-xs text-slate-600 mb-1">
                          {group.command.name}
                        </p>
                      )}
                      {group.established_date && (
                        <p className="text-xs text-slate-500">
                          Est. {new Date(group.established_date).getFullYear()}
                        </p>
                      )}
                      {!isEntityActive(group) && (
                        <p className="text-xs text-red-500 mt-1">Deactivated</p>
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
          </Card>

          {/* Wings Level */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Wings</h3>
              <span className="text-sm text-slate-500">
                {filterEntities(wings).length} active
              </span>
            </div>
            
            {(() => {
              const filtered = filterEntities(wings);
              console.log('Wings before filter:', wings);
              console.log('Wings after filter:', filtered);
              console.log('showInactive:', showInactive);
              return filtered.length === 0;
            })() ? (
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {filterEntities(wings).map(wing => (
                    <div
                      key={wing.id}
                      className={`p-4 border rounded-lg ${!isEntityActive(wing) ? 'opacity-60 bg-slate-50' : 'bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-slate-900">{wing.name}</h4>
                          {wing.designation && (
                            <p className="text-sm text-slate-600">{wing.designation}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditEntity(wing, 'wing')}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Edit"
                          >
                            <Edit size={14} className="text-slate-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(wing, 'wing')}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Delete"
                          >
                            <Trash size={14} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      {wing.group && (
                        <p className="text-xs text-slate-600 mb-1">
                          {wing.group.command?.name ? `${wing.group.command.name} > ` : ''}{wing.group.name}
                        </p>
                      )}
                      {wing.tail_code && (
                        <p className="text-xs text-slate-600 mb-1">
                          Tail Code: {wing.tail_code}
                        </p>
                      )}
                      {wing.established_date && (
                        <p className="text-xs text-slate-500">
                          Est. {new Date(wing.established_date).getFullYear()}
                        </p>
                      )}
                      {!isEntityActive(wing) && (
                        <p className="text-xs text-red-500 mt-1">Deactivated</p>
                      )}
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
          </Card>

          {/* Squadrons Level */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Squadrons</h3>
              <span className="text-sm text-slate-500">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {filterEntities(squadrons).map(squadron => (
                    <div
                      key={squadron.id}
                      className={`p-4 border rounded-lg ${!isEntityActive(squadron) ? 'opacity-60 bg-slate-50' : 'bg-white'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-slate-900">{squadron.name}</h4>
                          <p className="text-sm text-slate-600">{squadron.designation}</p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditEntity(squadron, 'squadron')}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Edit"
                          >
                            <Edit size={14} className="text-slate-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(squadron, 'squadron')}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Delete"
                          >
                            <Trash size={14} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                      {squadron.wing && (
                        <p className="text-xs text-slate-600 mb-1">
                          {squadron.wing.group?.command?.name ? `${squadron.wing.group.command.name} > ` : ''}
                          {squadron.wing.group ? `${squadron.wing.group.name} > ` : ''}
                          {squadron.wing.name}
                        </p>
                      )}
                      {squadron.tail_code && (
                        <p className="text-xs text-slate-600 mb-1">
                          Tail Code: {squadron.tail_code}
                        </p>
                      )}
                      {squadron.established_date && (
                        <p className="text-xs text-slate-500">
                          Est. {new Date(squadron.established_date).getFullYear()}
                        </p>
                      )}
                      {!isEntityActive(squadron) && (
                        <p className="text-xs text-red-500 mt-1">Deactivated</p>
                      )}
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
          </Card>

        </div>
      )}

      {/* Modal for creating/editing entities */}
      <OrgEntityModal
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        entityType={modalState.entityType}
        entity={modalState.entity}
        commands={commands}
        groups={groups}
        wings={wings}
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