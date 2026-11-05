import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit, Trash } from 'lucide-react';
import { Status } from '../../../utils/statusService';

interface SortableStatusRowProps {
  status: Status;
  onEditClick: () => void;
  onDeleteClick: () => void;
  onToggleActive: () => void;
  statusUsage: Record<string, number>;
}

export const SortableStatusRow: React.FC<SortableStatusRowProps> = ({
  status,
  onEditClick,
  onDeleteClick,
  onToggleActive,
  statusUsage
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });
  const [isHovered, setIsHovered] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
    backgroundColor: isDragging ? 'var(--rr-panel2)' : 'var(--rr-panel)',
    boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
  };

  const renderToggle = (enabled: boolean, onChange: () => void) => (
    <div
      onClick={onChange}
      style={{
        width: '44px',
        height: '24px',
        backgroundColor: enabled ? 'var(--rr-accent)' : 'var(--rr-panel3)',
        borderRadius: '12px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: 'var(--rr-panel)',
          borderRadius: '50%',
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          transition: 'left 0.2s ease',
          boxShadow: 'var(--rr-shadow)'
        }}
      />
    </div>
  );

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
        <GripVertical size={16} style={{ color: 'var(--rr-text2)' }} />
      </div>

      {/* Status Name Column */}
      <div style={{
        width: '300px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: 'var(--rr-text)',
        fontWeight: 500,
        fontFamily: 'inherit'
      }}>
        {status.name}
      </div>

      {/* Active Toggle Column */}
      <div style={{
        width: '150px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {renderToggle(status.isActive, onToggleActive)}
      </div>

      {/* Actions Column */}
      <div style={{
        width: '120px',
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
              title="Edit status"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = 'var(--rr-panel2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'var(--rr-panel)';
              }}
            >
              <Edit size={14} color="#64748B" />
            </button>
            <button
              onClick={onDeleteClick}
              disabled={statusUsage[status.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: statusUsage[status.id] > 0 ? 'not-allowed' : 'pointer',
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
                opacity: statusUsage[status.id] > 0 ? 0.5 : 1
              }}
              title={statusUsage[status.id] > 0 ? "Cannot delete a status in use" : "Delete status"}
              onMouseEnter={(e) => {
                if (statusUsage[status.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = 'var(--rr-panel2)';
                }
              }}
              onMouseLeave={(e) => {
                if (statusUsage[status.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'var(--rr-panel)';
                }
              }}
            >
              <Trash size={14} color={statusUsage[status.id] > 0 ? "#9CA3AF" : "#64748B"} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
