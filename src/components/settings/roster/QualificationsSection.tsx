import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Qualification } from '../../../utils/qualificationService';
import { SortableQualificationRow } from './SortableQualificationRow';

interface QualificationsSectionProps {
  qualifications: Qualification[];
  loading: boolean;
  isAddingQualification: boolean;
  setIsAddingQualification: (value: boolean) => void;
  newQualificationName: string;
  setNewQualificationName: (value: string) => void;
  newQualificationCode: string;
  setNewQualificationCode: (value: string) => void;
  newQualificationCategory: string;
  setNewQualificationCategory: (value: string) => void;
  newQualificationRequirements: string;
  setNewQualificationRequirements: (value: string) => void;
  newQualificationIsExpirable: boolean;
  setNewQualificationIsExpirable: (value: boolean) => void;
  newQualificationValidityPeriod: number | null;
  setNewQualificationValidityPeriod: (value: number | null) => void;
  newQualificationActive: boolean;
  setNewQualificationActive: (value: boolean) => void;
  newQualificationIsSupportRole: boolean;
  setNewQualificationIsSupportRole: (value: boolean) => void;
  newQualificationColor: string;
  setNewQualificationColor: (value: string) => void;
  handleAddQualification: () => Promise<void>;
  editingQualificationId: string | null;
  setEditingQualificationId: (value: string | null) => void;
  editingQualificationName: string;
  setEditingQualificationName: (value: string) => void;
  editingQualificationCode: string;
  setEditingQualificationCode: (value: string) => void;
  editingQualificationCategory: string;
  setEditingQualificationCategory: (value: string) => void;
  editingQualificationRequirements: string;
  setEditingQualificationRequirements: (value: string) => void;
  editingQualificationIsExpirable: boolean;
  setEditingQualificationIsExpirable: (value: boolean) => void;
  editingQualificationValidityPeriod: number | null;
  setEditingQualificationValidityPeriod: (value: number | null) => void;
  editingQualificationActive: boolean;
  setEditingQualificationActive: (value: boolean) => void;
  editingQualificationIsSupportRole: boolean;
  setEditingQualificationIsSupportRole: (value: boolean) => void;
  editingQualificationColor: string;
  setEditingQualificationColor: (value: string) => void;
  handleCancelEditQualification: () => void;
  handleSaveQualification: () => Promise<void>;
  handleDeleteQualification: (qualification: Qualification) => Promise<void>;
  qualificationUsage: Record<string, number>;
  handleQualificationDragEnd: (event: DragEndEvent) => Promise<void>;
  setErrorMessage: (message: string | null) => void;
  sectionStyle: React.CSSProperties;
}

export const QualificationsSection: React.FC<QualificationsSectionProps> = ({
  qualifications,
  loading,
  isAddingQualification,
  setIsAddingQualification,
  newQualificationName,
  setNewQualificationName,
  newQualificationCode,
  setNewQualificationCode,
  newQualificationCategory,
  setNewQualificationCategory,
  newQualificationRequirements,
  setNewQualificationRequirements,
  newQualificationIsExpirable,
  setNewQualificationIsExpirable,
  newQualificationValidityPeriod,
  setNewQualificationValidityPeriod,
  newQualificationActive,
  setNewQualificationActive,
  newQualificationIsSupportRole,
  setNewQualificationIsSupportRole,
  newQualificationColor,
  setNewQualificationColor,
  handleAddQualification,
  editingQualificationId,
  setEditingQualificationId,
  editingQualificationName,
  setEditingQualificationName,
  editingQualificationCode,
  setEditingQualificationCode,
  editingQualificationCategory,
  setEditingQualificationCategory,
  editingQualificationRequirements,
  setEditingQualificationRequirements,
  editingQualificationIsExpirable,
  setEditingQualificationIsExpirable,
  editingQualificationValidityPeriod,
  setEditingQualificationValidityPeriod,
  editingQualificationActive,
  setEditingQualificationActive,
  editingQualificationIsSupportRole,
  setEditingQualificationIsSupportRole,
  editingQualificationColor,
  setEditingQualificationColor,
  handleCancelEditQualification,
  handleSaveQualification,
  handleDeleteQualification,
  qualificationUsage,
  handleQualificationDragEnd,
  setErrorMessage,
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

  const handleStartEditQualification = (qualification: Qualification) => {
    setEditingQualificationId(qualification.id);
    setEditingQualificationName(qualification.name);
    setEditingQualificationCode(qualification.code);
    setEditingQualificationCategory(qualification.category || '');
    setEditingQualificationRequirements(
      typeof qualification.requirements === 'string'
        ? qualification.requirements
        : JSON.stringify(qualification.requirements || {}, null, 2)
    );
    setEditingQualificationIsExpirable(qualification.is_expirable || false);
    setEditingQualificationValidityPeriod(qualification.validity_period || null);
    setEditingQualificationActive(qualification.active !== undefined ? qualification.active : true);
    setEditingQualificationIsSupportRole(qualification.is_support_role || false);
    setEditingQualificationColor(qualification.color || '#646F7E');
  };

  return (
    <>
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0' }}>
          Qualifications
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 24px 0', fontFamily: 'inherit' }}>
          Define the qualifications that can be assigned to pilots.
        </p>

        {/* Qualifications Table and Add Button Container */}
        <div>
          {/* Qualifications Table */}
          <div style={{
            border: '1px solid var(--rr-border)',
            borderRadius: '6px',
            backgroundColor: 'var(--rr-panel)',
            width: '100%',
            maxWidth: '100%'
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
              flex: '1 1 auto',
              minWidth: '200px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: 'inherit',
              borderRight: '1px solid var(--rr-border)'
            }}>
              Qualification
            </div>
            <div style={{
              width: '150px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: 'inherit',
              textAlign: 'center',
              borderRight: '1px solid var(--rr-border)'
            }}>
              Expires After
            </div>
            <div style={{
              width: '100px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: 'inherit',
              textAlign: 'center'
            }}>
              Actions
            </div>
          </div>

          {/* Table Body */}
          {!loading && qualifications.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleQualificationDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={qualifications.map(qualification => qualification.id)}
                strategy={verticalListSortingStrategy}
              >
                {qualifications.map((qualification) => (
                  <SortableQualificationRow
                    key={qualification.id}
                    qualification={qualification}
                    onEditClick={() => handleStartEditQualification(qualification)}
                    onDeleteClick={() => handleDeleteQualification(qualification)}
                    qualificationUsage={qualificationUsage}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            loading ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--rr-text2)',
                fontSize: '14px'
              }}>
                Loading qualifications...
              </div>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--rr-text2)',
                fontSize: '14px'
              }}>
                No qualifications found
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
            onClick={() => {
              // Reset form fields when opening modal
              setNewQualificationName('');
              setNewQualificationCode('');
              setNewQualificationCategory('');
              setNewQualificationRequirements('{}');
              setNewQualificationIsExpirable(false);
              setNewQualificationValidityPeriod(null);
              setNewQualificationActive(true);
              setNewQualificationIsSupportRole(false);
              setNewQualificationColor('#646F7E');
              setErrorMessage('');
              setIsAddingQualification(true);
            }}
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

      {/* Add Qualification Modal */}
      {isAddingQualification && (
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
            setIsAddingQualification(false);
            setNewQualificationName('');
            setNewQualificationCode('');
            setNewQualificationCategory('');
            setNewQualificationRequirements('{}');
            setNewQualificationIsExpirable(false);
            setNewQualificationValidityPeriod(null);
            setNewQualificationActive(true);
            setNewQualificationIsSupportRole(false);
            setNewQualificationColor('#646F7E');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: 'var(--rr-shadow-lg)',
              width: '600px',
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
              color: 'var(--rr-text)',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'inherit'
            }}>
              Add New Qualification
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newQualificationName}
                    onChange={(e) => setNewQualificationName(e.target.value)}
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
                    placeholder="Qualification name"
                    autoFocus
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    value={newQualificationCode}
                    onChange={(e) => setNewQualificationCode(e.target.value)}
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
                    placeholder="FL, SL, etc."
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '6px',
                  fontFamily: 'inherit'
                }}>
                  Category
                </label>
                <input
                  type="text"
                  value={newQualificationCategory}
                  onChange={(e) => setNewQualificationCategory(e.target.value)}
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
                  placeholder="Leadership, Carrier Ops, etc."
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '6px',
                  fontFamily: 'inherit'
                }}>
                  Requirements (JSON)
                </label>
                <textarea
                  value={newQualificationRequirements}
                  onChange={(e) => setNewQualificationRequirements(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'var(--rr-panel)',
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="{}"
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={newQualificationColor}
                    onChange={(e) => setNewQualificationColor(e.target.value)}
                    style={{
                      width: '60px',
                      height: '38px',
                      padding: '0',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--rr-panel)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="new-qual-active-modal"
                      checked={newQualificationActive}
                      onChange={() => setNewQualificationActive(!newQualificationActive)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="new-qual-active-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Active
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="new-qual-expiry-modal"
                      checked={newQualificationIsExpirable}
                      onChange={() => setNewQualificationIsExpirable(!newQualificationIsExpirable)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="new-qual-expiry-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Expires
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="new-qual-support-role-modal"
                      checked={newQualificationIsSupportRole}
                      onChange={() => setNewQualificationIsSupportRole(!newQualificationIsSupportRole)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="new-qual-support-role-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Mission Support role
                    </label>
                  </div>
                </div>
              </div>

              {newQualificationIsExpirable && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Days Valid
                  </label>
                  <input
                    type="number"
                    value={newQualificationValidityPeriod || ''}
                    onChange={(e) => setNewQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                    style={{
                      width: '120px',
                      padding: '8px 12px',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'var(--rr-panel)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                    placeholder="365"
                    min="1"
                  />
                </div>
              )}
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
                  setIsAddingQualification(false);
                  setNewQualificationName('');
                  setNewQualificationCode('');
                  setNewQualificationCategory('');
                  setNewQualificationRequirements('{}');
                  setNewQualificationIsExpirable(false);
                  setNewQualificationValidityPeriod(null);
                  setNewQualificationActive(true);
                  setNewQualificationIsSupportRole(false);
                  setNewQualificationColor('#646F7E');
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
                onClick={handleAddQualification}
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
                Add Qualification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Qualification Modal */}
      {editingQualificationId && (
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
          onClick={handleCancelEditQualification}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: 'var(--rr-shadow-lg)',
              width: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--rr-text)',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'inherit'
            }}>
              Edit Qualification
            </h2>

            {/* Form Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name and Code Row */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={editingQualificationName}
                    onChange={(e) => setEditingQualificationName(e.target.value)}
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
                    placeholder="Qualification name"
                    autoFocus
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    value={editingQualificationCode}
                    onChange={(e) => setEditingQualificationCode(e.target.value)}
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
                    placeholder="FL, SL, etc."
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '6px',
                  fontFamily: 'inherit'
                }}>
                  Category
                </label>
                <input
                  type="text"
                  value={editingQualificationCategory}
                  onChange={(e) => setEditingQualificationCategory(e.target.value)}
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
                  placeholder="Leadership, Carrier Ops, etc."
                />
              </div>

              {/* Requirements */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '6px',
                  fontFamily: 'inherit'
                }}>
                  Requirements (JSON)
                </label>
                <textarea
                  value={editingQualificationRequirements}
                  onChange={(e) => setEditingQualificationRequirements(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'var(--rr-panel)',
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="{}"
                />
              </div>

              {/* Color and Settings Row */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={editingQualificationColor}
                    onChange={(e) => setEditingQualificationColor(e.target.value)}
                    style={{
                      width: '60px',
                      height: '38px',
                      padding: '0',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--rr-panel)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Active Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="edit-qual-active-modal"
                      checked={editingQualificationActive}
                      onChange={() => setEditingQualificationActive(!editingQualificationActive)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="edit-qual-active-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Active
                    </label>
                  </div>

                  {/* Expires Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="edit-qual-expiry-modal"
                      checked={editingQualificationIsExpirable}
                      onChange={() => setEditingQualificationIsExpirable(!editingQualificationIsExpirable)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="edit-qual-expiry-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Expires
                    </label>
                  </div>

                  {/* Mission Support Role Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="edit-qual-support-role-modal"
                      checked={editingQualificationIsSupportRole}
                      onChange={() => setEditingQualificationIsSupportRole(!editingQualificationIsSupportRole)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="edit-qual-support-role-modal" style={{
                      fontSize: '14px',
                      color: 'var(--rr-text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer'
                    }}>
                      Mission Support role
                    </label>
                  </div>
                </div>
              </div>

              {/* Validity Period */}
              {editingQualificationIsExpirable && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginBottom: '6px',
                    fontFamily: 'inherit'
                  }}>
                    Days Valid
                  </label>
                  <input
                    type="number"
                    value={editingQualificationValidityPeriod || ''}
                    onChange={(e) => setEditingQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                    style={{
                      width: '120px',
                      padding: '8px 12px',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'var(--rr-panel)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                    placeholder="365"
                    min="1"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--rr-border)'
            }}>
              <button
                onClick={handleCancelEditQualification}
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
                onClick={handleSaveQualification}
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
                Update Qualification
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
