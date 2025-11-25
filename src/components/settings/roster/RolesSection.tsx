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
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
          Billets
        </h3>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
          Define the billet options available for pilots in the squadron roster. Drag billets to reorder them.
        </p>

        {/* Roles Table and Add Button Container */}
        <div style={{
          width: 'fit-content'
        }}>
          {/* Roles Table */}
          <div style={{
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            backgroundColor: '#FFFFFF'
          }}>
          {/* Table Header */}
          <div style={{
            display: 'flex',
            backgroundColor: '#F9FAFB',
            borderBottom: '1px solid #E5E7EB',
            borderRadius: '6px 6px 0 0'
          }}>
            <div style={{
              padding: '4px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#6B7280',
              textTransform: 'uppercase',
              width: '24px',
              textAlign: 'center'
            }}>

            </div>
            <div style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#6B7280',
              textTransform: 'uppercase',
              width: '300px',
              borderRight: '1px solid #E5E7EB'
            }}>
              Role Name
            </div>
            <div style={{
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#6B7280',
              textTransform: 'uppercase',
              width: '200px',
              borderRight: '1px solid #E5E7EB',
              textAlign: 'center'
            }}>
              Exclusivity Scope
            </div>
            <div style={{
              width: '120px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#6B7280',
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
                color: '#6B7280',
                fontSize: '14px'
              }}>
                Loading roles...
              </div>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#6B7280',
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
          <button
            onClick={() => setIsAddingRole(true)}
            disabled={loading}
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
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
              opacity: loading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            +
          </button>
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
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
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
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Add New Role
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
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
                  color: '#374151',
                  marginBottom: '8px',
                  fontFamily: 'Inter'
                }}>
                  Exclusivity Scope
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['none', 'squadron', 'wing'] as ExclusivityScope[]).map((scope) => {
                    const getScopeColors = (s: ExclusivityScope) => {
                      switch (s) {
                        case 'wing':
                          return { color: '#2563EB', backgroundColor: '#EFF6FF', border: '#BFDBFE' };
                        case 'squadron':
                          return { color: '#059669', backgroundColor: '#ECFDF5', border: '#A7F3D0' };
                        default:
                          return { color: '#6B7280', backgroundColor: '#F9FAFB', border: '#E5E7EB' };
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
                          color: isSelected ? colors.color : '#6B7280',
                          backgroundColor: isSelected ? colors.backgroundColor : '#F9FAFB',
                          border: `1px solid ${isSelected ? colors.border : '#E5E7EB'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontFamily: 'Inter'
                        }}
                      >
                        {getScopeLabel(scope)}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
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
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setIsAddingRole(false);
                  setNewRoleName('');
                  setNewRoleExclusivityScope('none');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRole}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16A34A';
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
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1F2937'
              }}>
                Edit Billet
              </h3>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '6px',
                fontFamily: 'Inter'
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
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF',
                  fontFamily: 'Inter',
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
                color: '#374151',
                marginBottom: '8px',
                fontFamily: 'Inter'
              }}>
                Exclusivity Scope
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['none', 'squadron', 'wing'] as ExclusivityScope[]).map((scope) => {
                  const getScopeColors = (s: ExclusivityScope) => {
                    switch (s) {
                      case 'wing':
                        return { color: '#2563EB', backgroundColor: '#EFF6FF', border: '#BFDBFE' };
                      case 'squadron':
                        return { color: '#059669', backgroundColor: '#ECFDF5', border: '#A7F3D0' };
                      default:
                        return { color: '#6B7280', backgroundColor: '#F9FAFB', border: '#E5E7EB' };
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
                        color: isSelected ? colors.color : '#6B7280',
                        backgroundColor: isSelected ? colors.backgroundColor : '#F9FAFB',
                        border: `1px solid ${isSelected ? colors.border : '#E5E7EB'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'Inter'
                      }}
                    >
                      {getScopeLabel(scope)}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '12px', color: '#6B7280', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
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
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'Inter'
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
                  backgroundColor: !editingRoleName.trim() ? '#9CA3AF' : '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !editingRoleName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter'
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
