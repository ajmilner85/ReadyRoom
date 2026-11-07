import React from 'react';
import { Toggle, Button } from '../../ui/primitives';
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
    <Toggle checked={Boolean(enabled)} onChange={() => onChange()} disabled={disabled} />
  );

  return (
    <div style={firstSectionStyle}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0' }}>
        Statuses
      </h3>
      <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 24px 0', fontFamily: 'inherit' }}>
        Define the status options available for pilots in the squadron roster.
      </p>

      <div style={{ width: '100%' }}>
        <div style={{
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--rr-panel)',
          width: '100%'
        }}>
          {/* Header Row */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--rr-panel2)',
            borderBottom: '2px solid var(--rr-border)',
            fontWeight: 600,
            fontSize: '12px',
            color: 'var(--rr-text2)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontFamily: 'inherit'
          }}>
            <div style={{ width: '24px' }}></div>
            <div style={{ flex: 1, minWidth: 0, padding: '12px' }}>Status Name</div>
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
          <Button size="sm" variant="ghost" icon="plus" onClick={() => {
              setEditingStatusId(null);
              setIsAddingStatus(true);
            }} disabled={loading}>Add status</Button>
        </div>
      </div>

      {/* Add Status Form */}
      {isAddingStatus && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          backgroundColor: 'var(--rr-panel2)',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 12px 0' }}>
            Add New Status
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)', marginBottom: '6px' }}>
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
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)' }}>
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
                  backgroundColor: !newStatusName.trim() ? 'var(--rr-text3)' : 'var(--rr-accent)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !newStatusName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
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
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Form */}
      {editingStatusId && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          backgroundColor: 'var(--rr-panel2)',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 12px 0' }}>
            Edit Status
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)', marginBottom: '6px' }}>
                Status Name
              </label>
              <input
                type="text"
                value={editingStatusName}
                onChange={(e) => setEditingStatusName(e.target.value)}
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '8px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)' }}>
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
                  backgroundColor: !editingStatusName.trim() ? 'var(--rr-text3)' : 'var(--rr-accent)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !editingStatusName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
