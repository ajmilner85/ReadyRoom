import { Button } from '../../ui/primitives';
import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Role, ExclusivityScope } from '../../../utils/roleService';
import { SortableRoleItem } from './SortableRoleItem';

interface RolesSectionProps {
  roles: Role[];
  loading: boolean;
  isAddingRole: boolean;
  setIsAddingRole: (value: boolean) => void;
  newRoleName: string;
  setNewRoleName: (value: string) => void;
  newRoleExclusivityScope: ExclusivityScope;
  setNewRoleExclusivityScope: (value: ExclusivityScope) => void;
  handleAddRole: () => Promise<void>;
  editingRoleId: string | null;
  setEditingRoleId: (value: string | null) => void;
  editingRoleName: string;
  setEditingRoleName: (value: string) => void;
  editingRoleExclusivityScope: ExclusivityScope;
  setEditingRoleExclusivityScope: (value: ExclusivityScope) => void;
  handleDeleteRole: (role: Role) => Promise<void>;
  handleChangeRoleExclusivityScope: (role: Role, newScope: ExclusivityScope) => Promise<void>;
  roleUsage: Record<string, number>;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  refreshRoleUsageCounts: () => Promise<void>;
  setErrorMessage: (message: string | null) => void;
  updateRole: (roleId: string, updates: any) => Promise<any>;
  sectionStyle: React.CSSProperties;
}

export const RolesSection: React.FC<RolesSectionProps> = ({
  roles,
  loading,
  isAddingRole,
  setIsAddingRole,
  newRoleName,
  setNewRoleName,
  newRoleExclusivityScope,
  setNewRoleExclusivityScope,
  handleAddRole,
  editingRoleId,
  setEditingRoleId,
  editingRoleName,
  setEditingRoleName,
  editingRoleExclusivityScope,
  setEditingRoleExclusivityScope,
  handleDeleteRole,
  handleChangeRoleExclusivityScope,
  roleUsage,
  handleDragEnd,
  refreshRoleUsageCounts,
  setErrorMessage,
  updateRole,
  sectionStyle
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleStartEditRole = (role: Role) => {
    setEditingRoleId(role.id);
    setEditingRoleName(role.name);
    setEditingRoleExclusivityScope(role.exclusivity_scope);
  };

  return (
    <>
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0' }}>
          Billets
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 24px 0', fontFamily: 'inherit' }}>
          Define the billet options available for pilots in the squadron roster. Drag billets to reorder them.
        </p>

        {/* Roles Table and Add Button Container */}
        <div style={{
          width: '100%'
        }}>
          {/* Roles Table */}
          <div style={{
            border: '1px solid var(--rr-border)',
            borderRadius: '6px',
            backgroundColor: 'var(--rr-panel)'
          }}>
          {/* Table Header */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--rr-panel2)',
            borderBottom: '1px solid var(--rr-border)',
            borderRadius: '6px 6px 0 0'
          }}>
            <div style={{
              padding: '4px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              width: '24px',
              textAlign: 'center'
            }}>

            </div>
            <div style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              flex: 1,
              minWidth: 0,
              borderRight: '1px solid var(--rr-border)'
            }}>
              Role Name
            </div>
            <div style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              width: '200px',
              borderRight: '1px solid var(--rr-border)',
              textAlign: 'center'
            }}>
              Exclusivity Scope
            </div>
            <div style={{
              width: '120px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              textAlign: 'center'
            }}>
              Actions
            </div>
          </div>

          {/* Table Body */}
          {!loading && roles.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={roles.map(role => role.id)}
                strategy={verticalListSortingStrategy}
              >
                {roles.map((role) => (
                  <SortableRoleItem
                    key={role.id}
                    role={role}
                    onEditClick={() => handleStartEditRole(role)}
                    onDeleteClick={() => handleDeleteRole(role)}
                    onChangeScope={(newScope) => handleChangeRoleExclusivityScope(role, newScope)}
                    roleUsage={roleUsage}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            loading ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--rr-text2)',
                fontSize: '14px'
              }}>
                Loading roles...
              </div>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--rr-text2)',
                fontSize: '14px'
              }}>
                No roles found
              </div>
            )
          )}
          </div>

          {/* Add Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '4px 0'
          }}>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setIsAddingRole(true)} disabled={loading}>Add billet</Button>
          </div>
        </div>
      </div>

      {/* Add Role Modal */}
      {isAddingRole && (
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
          onClick={() => {
            setIsAddingRole(false);
            setNewRoleName('');
            setNewRoleExclusivityScope('none');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: 'var(--rr-shadow-lg)',
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--rr-text)',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'inherit'
            }}>
              Add New Role
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '6px',
                  fontFamily: 'inherit'
                }}>
                  Role Name *
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'var(--rr-panel)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter role name"
                  autoFocus
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Exclusivity Scope
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['none', 'squadron', 'wing'] as ExclusivityScope[]).map((scope) => {
                    const getScopeColors = (s: ExclusivityScope) => {
                      switch (s) {
                        case 'wing':
                          return { color: 'var(--rr-accent-text)', backgroundColor: 'var(--rr-accent-weak)', border: 'var(--rr-accent)' };
                        case 'squadron':
                          return { color: 'var(--rr-good)', backgroundColor: 'rgba(64,168,91,.14)', border: 'var(--rr-good)' };
                        default:
                          return { color: 'var(--rr-text2)', backgroundColor: 'var(--rr-panel2)', border: 'var(--rr-border)' };
                      }
                    };

                    const getScopeLabel = (s: ExclusivityScope) => {
                      switch (s) {
                        case 'wing': return 'Wing';
                        case 'squadron': return 'Squadron';
                        default: return 'None';
                      }
                    };

                    const colors = getScopeColors(scope);
                    const isSelected = newRoleExclusivityScope === scope;

                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setNewRoleExclusivityScope(scope)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: isSelected ? colors.color : 'var(--rr-text2)',
                          backgroundColor: isSelected ? colors.backgroundColor : 'var(--rr-panel2)',
                          border: `1px solid ${isSelected ? colors.border : 'var(--rr-border)'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontFamily: 'inherit'
                        }}
                      >
                        {getScopeLabel(scope)}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--rr-text2)', margin: '8px 0 0 0', fontFamily: 'inherit' }}>
                  {newRoleExclusivityScope === 'none' && 'Any number of pilots can have this role'}
                  {newRoleExclusivityScope === 'squadron' && 'Only one active pilot per squadron can have this role'}
                  {newRoleExclusivityScope === 'wing' && 'Only one active pilot per wing can have this role'}
                </p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--rr-border)'
            }}>
              <button
                onClick={() => {
                  setIsAddingRole(false);
                  setNewRoleName('');
                  setNewRoleExclusivityScope('none');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-panel)',
                  color: 'var(--rr-text2)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRole}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-good)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-good)';
                }}
              >
                Add Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRoleId && (
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
          onClick={() => {
            setEditingRoleId(null);
            setEditingRoleName('');
            setEditingRoleExclusivityScope('none');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '600px',
              boxShadow: 'var(--rr-shadow-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: 'var(--rr-text)'
              }}>
                Edit Billet
              </h3>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--rr-text)',
                marginBottom: '6px',
                fontFamily: 'inherit'
              }}>
                Billet Name
              </label>
              <input
                type="text"
                value={editingRoleName}
                onChange={(e) => setEditingRoleName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--rr-panel)',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter billet name"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--rr-text)',
                marginBottom: '8px',
                fontFamily: 'inherit'
              }}>
                Exclusivity Scope
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['none', 'squadron', 'wing'] as ExclusivityScope[]).map((scope) => {
                  const getScopeColors = (s: ExclusivityScope) => {
                    switch (s) {
                      case 'wing':
                        return { color: 'var(--rr-accent-text)', backgroundColor: 'var(--rr-accent-weak)', border: 'var(--rr-accent)' };
                      case 'squadron':
                        return { color: 'var(--rr-good)', backgroundColor: 'rgba(64,168,91,.14)', border: 'var(--rr-good)' };
                      default:
                        return { color: 'var(--rr-text2)', backgroundColor: 'var(--rr-panel2)', border: 'var(--rr-border)' };
                    }
                  };

                  const getScopeLabel = (s: ExclusivityScope) => {
                    switch (s) {
                      case 'wing': return 'Wing';
                      case 'squadron': return 'Squadron';
                      default: return 'None';
                    }
                  };

                  const colors = getScopeColors(scope);
                  const isSelected = editingRoleExclusivityScope === scope;

                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setEditingRoleExclusivityScope(scope)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: isSelected ? colors.color : 'var(--rr-text2)',
                        backgroundColor: isSelected ? colors.backgroundColor : 'var(--rr-panel2)',
                        border: `1px solid ${isSelected ? colors.border : 'var(--rr-border)'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit'
                      }}
                    >
                      {getScopeLabel(scope)}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--rr-text2)', margin: '8px 0 0 0', fontFamily: 'inherit' }}>
                {editingRoleExclusivityScope === 'none' && 'Any number of pilots can have this role'}
                {editingRoleExclusivityScope === 'squadron' && 'Only one active pilot per squadron can have this role'}
                {editingRoleExclusivityScope === 'wing' && 'Only one active pilot per wing can have this role'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setEditingRoleId(null);
                  setEditingRoleName('');
                  setEditingRoleExclusivityScope('none');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-panel)',
                  color: 'var(--rr-text2)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { data: updateData, error: updateError } = await updateRole(editingRoleId, {
                      name: editingRoleName,
                      exclusivity_scope: editingRoleExclusivityScope
                    });

                    if (updateError) {
                      throw new Error(updateError.message);
                    }

                    if (updateData) {
                      // Update roles state through parent component
                      setEditingRoleId(null);
                      setEditingRoleName('');
                      setEditingRoleExclusivityScope('none');
                      await refreshRoleUsageCounts();
                    }
                  } catch (err) {
                    console.error('Error updating billet:', err);
                    setErrorMessage(err instanceof Error ? err.message : 'Failed to update billet');
                  }
                }}
                disabled={!editingRoleName.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !editingRoleName.trim() ? 'var(--rr-text3)' : 'var(--rr-accent)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !editingRoleName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Update Billet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
