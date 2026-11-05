import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '../../ui/primitives';
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

      {/* Qualification Column with Badge and Name */}
      <div style={{
        flex: '1 1 auto',
        minWidth: '200px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRight: '1px solid var(--rr-border)'
      }}>
        <QualificationBadge type={qualification.code as any} color={qualification.color || undefined} />
        <span style={{
          fontSize: '14px',
          color: 'var(--rr-text)',
          fontWeight: 400,
          fontFamily: 'inherit'
        }}>
          {qualification.name}
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--rr-text3)',
          fontFamily: 'inherit',
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
        borderRight: '1px solid var(--rr-border)'
      }}>
        <span style={{
          fontSize: '13px',
          color: 'var(--rr-text2)',
          fontFamily: 'inherit'
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
              title="Edit qualification"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = 'var(--rr-panel2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'var(--rr-panel)';
              }}
            >
              <Icon name="edit" size={14} color="#64748B" />
            </button>
            <button
              onClick={onDeleteClick}
              disabled={qualificationUsage[qualification.id] > 0}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: qualificationUsage[qualification.id] > 0 ? 'not-allowed' : 'pointer',
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
                opacity: qualificationUsage[qualification.id] > 0 ? 0.5 : 1
              }}
              title={qualificationUsage[qualification.id] > 0 ? "Cannot delete a qualification in use" : "Delete qualification"}
              onMouseEnter={(e) => {
                if (qualificationUsage[qualification.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = 'var(--rr-panel2)';
                }
              }}
              onMouseLeave={(e) => {
                if (qualificationUsage[qualification.id] === 0) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'var(--rr-panel)';
                }
              }}
            >
              <Icon name="trash" size={14} color={qualificationUsage[qualification.id] > 0 ? "#9CA3AF" : "#64748B"} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
