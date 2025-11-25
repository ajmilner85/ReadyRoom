import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit, Trash } from 'lucide-react';
import QualificationBadge from '../../ui/QualificationBadge';
import { Qualification } from '../../../utils/qualificationService';

interface SortableQualificationRowProps {
  qualification: Qualification;
  onEditClick: () => void;
  onDeleteClick: () => void;
  qualificationUsage: Record<string, number>;
}

export const SortableQualificationRow: React.FC<SortableQualificationRowProps> = ({
  qualification,
  onEditClick,
  onDeleteClick,
  qualificationUsage
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: qualification.id });
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

      {/* Qualification Column with Badge and Name */}
      <div style={{
        flex: '1 1 auto',
        minWidth: '200px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRight: '1px solid #F3F4F6'
      }}>
        <QualificationBadge type={qualification.code as any} color={qualification.color || undefined} />
        <span style={{
          fontSize: '14px',
          color: '#1F2937',
          fontWeight: 400,
          fontFamily: 'Inter'
        }}>
          {qualification.name}
        </span>
        <span style={{
          fontSize: '11px',
          color: '#9CA3AF',
          fontFamily: 'Inter',
          marginLeft: 'auto'
        }}>
          {qualification.category ? `(${qualificationUsage[qualification.id] || 0})` : `(${qualificationUsage[qualification.id] || 0})`}
        </span>
      </div>

      {/* Expires After Column */}
      <div style={{
        width: '150px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRight: '1px solid #F3F4F6'
      }}>
        <span style={{
          fontSize: '13px',
          color: '#6B7280',
          fontFamily: 'Inter'
        }}>
          {qualification.is_expirable && qualification.validity_period ?
            `${qualification.validity_period} days` :
            '-'
          }
        </span>
      </div>

      {/* Actions Column */}
      <div style={{
        width: '100px',
        padding: '8px 12px',
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
              title="Edit qualification"
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
              disabled={qualificationUsage[qualification.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: qualificationUsage[qualification.id] > 0 ? 'not-allowed' : 'pointer',
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
                opacity: qualificationUsage[qualification.id] > 0 ? 0.5 : 1
              }}
              title={qualificationUsage[qualification.id] > 0 ? "Cannot delete a qualification in use" : "Delete qualification"}
              onMouseEnter={(e) => {
                if (qualificationUsage[qualification.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (qualificationUsage[qualification.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }
              }}
            >
              <Trash size={14} color={qualificationUsage[qualification.id] > 0 ? "#9CA3AF" : "#64748B"} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
