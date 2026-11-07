import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '../../ui/primitives';
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
    backgroundColor: isDragging ? 'var(--rr-panel2)' : 'var(--rr-panel)',
    boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        borderBottom: '1px solid var(--rr-border)',
        backgroundColor: isDragging ? 'var(--rr-panel2)' : 'var(--rr-panel)',
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
        <Icon name="grip" size={16} style={{ color: 'var(--rr-text2)' }} />
      </div>

      {/* Role Name Column */}
      <div style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: 'var(--rr-text)',
        fontWeight: 500,
        fontFamily: 'inherit'
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
                return { color: 'var(--rr-accent-text)', backgroundColor: 'var(--rr-accent-weak)', hoverColor: '#1D4ED8' };
              case 'squadron':
                return { color: 'var(--rr-good)', backgroundColor: 'rgba(64,168,91,.14)', hoverColor: '#047857' };
              default:
                return { color: 'var(--rr-text3)', backgroundColor: 'transparent', hoverColor: '#6B7280' };
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
                fontFamily: 'inherit'
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
              title="Edit role"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = 'var(--rr-panel2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'var(--rr-panel)';
              }}
            >
              <Icon name="edit" size={14} color={'var(--rr-text2)'} />
            </button>
            <button
              onClick={onDeleteClick}
              disabled={roleUsage[role.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: roleUsage[role.id] > 0 ? 'not-allowed' : 'pointer',
                background: 'var(--rr-panel)',
                boxShadow: 'var(--rr-shadow)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease',
                color: 'var(--rr-text2)',
                width: '24px',
                height: '24px',
                opacity: roleUsage[role.id] > 0 ? 0.5 : 1
              }}
              title={roleUsage[role.id] > 0 ? "Cannot delete a role in use" : "Delete role"}
              onMouseEnter={(e) => {
                if (roleUsage[role.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = 'var(--rr-panel2)';
                }
              }}
              onMouseLeave={(e) => {
                if (roleUsage[role.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'var(--rr-panel)';
                }
              }}
            >
              <Icon name="trash" size={14} color={roleUsage[role.id] > 0 ? "#9CA3AF" : "#64748B"} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
