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
    backgroundColor: isDragging ? '#F8FAFC' : 'white',
    boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
  };

  const renderToggle = (enabled: boolean, onChange: () => void) => (
    <div
      onClick={onChange}
      style={{
        width: '44px',
        height: '24px',
        backgroundColor: enabled ? '#3B82F6' : '#E5E7EB',
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
          backgroundColor: 'white',
          borderRadius: '50%',
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          transition: 'left 0.2s ease',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
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

      {/* Status Name Column */}
      <div style={{
        width: '300px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: '#1F2937',
        fontWeight: 500,
        fontFamily: 'Inter'
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
              title="Edit status"
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
              disabled={statusUsage[status.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: statusUsage[status.id] > 0 ? 'not-allowed' : 'pointer',
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
                opacity: statusUsage[status.id] > 0 ? 0.5 : 1
              }}
              title={statusUsage[status.id] > 0 ? "Cannot delete a status in use" : "Delete status"}
              onMouseEnter={(e) => {
                if (statusUsage[status.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (statusUsage[status.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
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
