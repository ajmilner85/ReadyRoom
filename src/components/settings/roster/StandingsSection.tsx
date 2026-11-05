import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Standing } from '../../../utils/standingService';
import { SortableStandingRow } from './SortableStandingRow';

interface StandingsSectionProps {
  standings: Standing[];
  loading: boolean;
  isAddingStanding: boolean;
  setIsAddingStanding: (value: boolean) => void;
  newStandingName: string;
  setNewStandingName: (value: string) => void;
  handleAddStanding: () => Promise<void>;
  editingStandingId: string | null;
  setEditingStandingId: (value: string | null) => void;
  editingStandingName: string;
  setEditingStandingName: (value: string) => void;
  handleSaveStanding: () => Promise<void>;
  handleDeleteStanding: (standingId: string) => Promise<void>;
  standingUsage: Record<string, number>;
  handleStandingDragEnd: (event: DragEndEvent) => Promise<void>;
  sectionStyle: React.CSSProperties;
}

export const StandingsSection: React.FC<StandingsSectionProps> = ({
  standings,
  loading,
  isAddingStanding,
  setIsAddingStanding,
  newStandingName,
  setNewStandingName,
  handleAddStanding,
  editingStandingId,
  setEditingStandingId,
  editingStandingName,
  setEditingStandingName,
  handleSaveStanding,
  handleDeleteStanding,
  standingUsage,
  handleStandingDragEnd,
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

  const handleStartEditStanding = (standing: Standing) => {
    setEditingStandingId(standing.id);
    setEditingStandingName(standing.name);
  };

  return (
    <>
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0' }}>
          Standings
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 24px 0', fontFamily: 'inherit' }}>
          Define the organizational hierarchy standings available for pilots.
        </p>

        {/* Standings Table and Add Button Container */}
        <div style={{
          width: 'fit-content'
        }}>
          {/* Standings Table */}
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
              width: '400px',
              borderRight: '1px solid var(--rr-border)'
            }}>
              Standing Name
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
          {standings.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleStandingDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={standings.map(standing => standing.id)}
                strategy={verticalListSortingStrategy}
              >
                {standings.sort((a, b) => a.order - b.order).map((standing) => (
                  <SortableStandingRow
                    key={standing.id}
                    standing={standing}
                    onEditClick={() => handleStartEditStanding(standing)}
                    onDeleteClick={() => handleDeleteStanding(standing.id)}
                    standingUsage={standingUsage}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--rr-text2)',
              fontSize: '14px'
            }}>
              No standings found
            </div>
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
            onClick={() => setIsAddingStanding(true)}
            disabled={loading}
            style={{
              width: '119px',
              height: '30px',
              background: 'var(--rr-panel)',
              borderRadius: '8px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'inherit',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: 'var(--rr-text2)',
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

      {/* Add Standing Modal */}
      {isAddingStanding && (
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
            setIsAddingStanding(false);
            setNewStandingName('');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: 'var(--rr-shadow-lg)',
              width: '400px',
              maxWidth: '90vw',
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
              Add New Standing
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
                  Standing Name *
                </label>
                <input
                  type="text"
                  value={newStandingName}
                  onChange={(e) => setNewStandingName(e.target.value)}
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
                  placeholder="Enter standing name"
                  autoFocus
                />
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
                  setIsAddingStanding(false);
                  setNewStandingName('');
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
                onClick={handleAddStanding}
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
                Add Standing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Standing Modal */}
      {editingStandingId && (
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
            setEditingStandingId(null);
            setEditingStandingName('');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: 'var(--rr-shadow-lg)',
              width: '400px',
              maxWidth: '90vw',
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
              Edit Standing
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
                  Standing Name *
                </label>
                <input
                  type="text"
                  value={editingStandingName}
                  onChange={(e) => setEditingStandingName(e.target.value)}
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
                  placeholder="Enter standing name"
                  autoFocus
                />
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
                  setEditingStandingId(null);
                  setEditingStandingName('');
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
                onClick={handleSaveStanding}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-accent)',
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
                  e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
                }}
              >
                Update Standing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
