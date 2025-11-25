import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit, Trash } from 'lucide-react';
import { Role, ExclusivityScope } from '../../../utils/roleService';

interface SortableRoleItemProps {
  role: Role;
  onEditClick: () => void;
  onDeleteClick: () => void;
  onChangeScope: (newScope: ExclusivityScope) => void;
  roleUsage: Record<string, number>;
}

export const SortableRoleItem: React.FC<SortableRoleItemProps> = ({
  role,
  onEditClick,
  onDeleteClick,
  onChangeScope,
  roleUsage
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id });
  const [isHovered, setIsHovered] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
    backgroundColor: isDragging ? '#F8FAFC' : 'white',
    boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        borderBottom: '1px solid #F3F4F6',
        backgroundColor: isDragging ? '#F8FAFC' : '#FFFFFF',
        boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
        height: 'auto',
        minHeight: '48px'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag Handle */}
      <div style={{
        width: '24px',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab'
      }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} style={{ color: '#64748B' }} />
      </div>

      {/* Role Name Column */}
      <div style={{
        flex: '0 0 300px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: '#1F2937',
        fontWeight: 500,
        fontFamily: 'Inter'
      }}>
        {role.name}
      </div>

      {/* Exclusivity Scope Toggle Column */}
      <div style={{
        flex: '0 0 200px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {(() => {
          const getScopeColors = (scope: ExclusivityScope) => {
            switch (scope) {
              case 'wing':
                return { color: '#2563EB', backgroundColor: '#EFF6FF', hoverColor: '#1D4ED8' };
              case 'squadron':
                return { color: '#059669', backgroundColor: '#ECFDF5', hoverColor: '#047857' };
              default:
                return { color: '#9CA3AF', backgroundColor: 'transparent', hoverColor: '#6B7280' };
            }
          };

          const getScopeLabel = (scope: ExclusivityScope) => {
            switch (scope) {
              case 'wing': return 'Wing';
              case 'squadron': return 'Squadron';
              default: return 'None';
            }
          };

          const handleCycle = () => {
            let nextScope: ExclusivityScope;
            switch (role.exclusivity_scope) {
              case 'none':
                nextScope = 'squadron';
                break;
              case 'squadron':
                nextScope = 'wing';
                break;
              case 'wing':
                nextScope = 'none';
                break;
              default:
                nextScope = 'squadron';
            }
            onChangeScope(nextScope);
          };

          const colors = getScopeColors(role.exclusivity_scope);

          return (
            <span
              onClick={handleCycle}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 500,
                color: colors.color,
                backgroundColor: colors.backgroundColor,
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                minWidth: '80px',
                textAlign: 'center',
                display: 'inline-block',
                fontFamily: 'Inter'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = colors.hoverColor;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = colors.color;
              }}
            >
              {getScopeLabel(role.exclusivity_scope)}
            </span>
          );
        })()}
      </div>

      {/* Actions Column */}
      <div style={{
        flex: '0 0 120px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px'
      }}>
        {isHovered && (
          <>
            <button
              onClick={onEditClick}
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
              title="Edit role"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'white';
              }}
            >
              <Edit size={14} color="#64748B" />
            </button>
            <button
              onClick={onDeleteClick}
              disabled={roleUsage[role.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: roleUsage[role.id] > 0 ? 'not-allowed' : 'pointer',
                background: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease',
                color: '#64748B',
                width: '24px',
                height: '24px',
                opacity: roleUsage[role.id] > 0 ? 0.5 : 1
              }}
              title={roleUsage[role.id] > 0 ? "Cannot delete a role in use" : "Delete role"}
              onMouseEnter={(e) => {
                if (roleUsage[role.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (roleUsage[role.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }
              }}
            >
              <Trash size={14} color={roleUsage[role.id] > 0 ? "#9CA3AF" : "#64748B"} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
