import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Status } from '../../../utils/statusService';
import { SortableStatusRow } from './SortableStatusRow';

interface StatusesSectionProps {
  statuses: Status[];
  loading: boolean;
  isAddingStatus: boolean;
  setIsAddingStatus: (value: boolean) => void;
  newStatusName: string;
  setNewStatusName: (value: string) => void;
  newStatusIsActive: boolean;
  setNewStatusIsActive: (value: boolean) => void;
  handleAddStatus: () => Promise<void>;
  editingStatusId: string | null;
  setEditingStatusId: (value: string | null) => void;
  editingStatusName: string;
  setEditingStatusName: (value: string) => void;
  editingStatusIsActive: boolean;
  setEditingStatusIsActive: (value: boolean) => void;
  handleUpdateStatus: () => Promise<void>;
  handleDeleteStatus: (status: Status) => Promise<void>;
  handleToggleStatusActive: (status: Status) => Promise<void>;
  statusUsage: Record<string, number>;
  handleStatusDragEnd: (event: DragEndEvent) => Promise<void>;
  firstSectionStyle: React.CSSProperties;
}

export const StatusesSection: React.FC<StatusesSectionProps> = ({
  statuses,
  loading,
  isAddingStatus,
  setIsAddingStatus,
  newStatusName,
  setNewStatusName,
  newStatusIsActive,
  setNewStatusIsActive,
  handleAddStatus,
  editingStatusId,
  setEditingStatusId,
  editingStatusName,
  setEditingStatusName,
  editingStatusIsActive,
  setEditingStatusIsActive,
  handleUpdateStatus,
  handleDeleteStatus,
  handleToggleStatusActive,
  statusUsage,
  handleStatusDragEnd,
  firstSectionStyle
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const renderToggle = (enabled: boolean, onChange: () => void, disabled = false) => (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: '44px',
        height: '24px',
        backgroundColor: enabled ? '#3B82F6' : '#E5E7EB',
        borderRadius: '12px',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        opacity: disabled ? 0.5 : 1
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
    <div style={firstSectionStyle}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
        Statuses
      </h3>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
        Define the status options available for pilots in the squadron roster.
      </p>

      <div style={{ width: 'fit-content' }}>
        <div style={{
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'white',
          width: '594px'
        }}>
          {/* Header Row */}
          <div style={{
            display: 'flex',
            backgroundColor: '#F9FAFB',
            borderBottom: '2px solid #E5E7EB',
            fontWeight: 600,
            fontSize: '12px',
            color: '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontFamily: 'Inter'
          }}>
            <div style={{ width: '24px' }}></div>
            <div style={{ width: '300px', padding: '12px' }}>Status Name</div>
            <div style={{ width: '150px', padding: '12px', textAlign: 'center' }}>Active</div>
            <div style={{ width: '120px', padding: '12px', textAlign: 'center' }}>Actions</div>
          </div>

          {/* Sortable Status Rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleStatusDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {statuses.map((status) => (
                <SortableStatusRow
                  key={status.id}
                  status={status}
                  onEditClick={() => {
                    setIsAddingStatus(false);
                    setEditingStatusId(status.id);
                    setEditingStatusName(status.name);
                    setEditingStatusIsActive(status.isActive);
                  }}
                  onDeleteClick={() => handleDeleteStatus(status)}
                  onToggleActive={() => handleToggleStatusActive(status)}
                  statusUsage={statusUsage}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Add Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '4px 0'
        }}>
          <button
            onClick={() => {
              setEditingStatusId(null);
              setIsAddingStatus(true);
            }}
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
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Add Status Form */}
      {isAddingStatus && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          backgroundColor: '#F9FAFB',
          width: '594px',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: '0 0 12px 0' }}>
            Add New Status
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Status Name
              </label>
              <input
                type="text"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                placeholder="e.g., Active, Reserve, Inactive"
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'Inter'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                Pilots with this status are considered active
              </label>
              {renderToggle(newStatusIsActive, () => setNewStatusIsActive(!newStatusIsActive))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={async () => {
                  await handleAddStatus();
                  setIsAddingStatus(false);
                }}
                disabled={!newStatusName.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !newStatusName.trim() ? '#9CA3AF' : '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !newStatusName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter'
                }}
              >
                Add Status
              </button>
              <button
                onClick={() => {
                  setIsAddingStatus(false);
                  setNewStatusName('');
                  setNewStatusIsActive(true);
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
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Form */}
      {editingStatusId && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          backgroundColor: '#F9FAFB',
          width: '594px',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: '0 0 12px 0' }}>
            Edit Status
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Status Name
              </label>
              <input
                type="text"
                value={editingStatusName}
                onChange={(e) => setEditingStatusName(e.target.value)}
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'Inter'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                Pilots with this status are considered active
              </label>
              {renderToggle(editingStatusIsActive, () => setEditingStatusIsActive(!editingStatusIsActive))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={async () => {
                  await handleUpdateStatus();
                  setEditingStatusId(null);
                }}
                disabled={!editingStatusName.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !editingStatusName.trim() ? '#9CA3AF' : '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !editingStatusName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter'
                }}
              >
                Update Status
              </button>
              <button
                onClick={() => {
                  setEditingStatusId(null);
                  setEditingStatusName('');
                  setEditingStatusIsActive(true);
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
