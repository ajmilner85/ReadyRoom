import React, { useRef, useState, useEffect } from 'react';
import { Card } from '../card';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import BasicPilotInfo from './BasicPilotInfo';
import StatusSelector from './StatusSelector';
import RoleSelector from './RoleSelector';
import QualificationsManager from './QualificationsManager';
import { Save, X, Trash2 } from 'lucide-react';

interface PilotDetailsProps {
  selectedPilot: Pilot | null;
  statuses: Status[];
  roles: Role[];
  pilotRoles: Role[];
  availableQualifications: Qualification[];
  pilotQualifications: any[];
  loadingRoles: boolean;
  updatingRoles: boolean;
  updatingStatus: boolean;
  loadingQualifications: boolean;
  disabledRoles: Record<string, boolean>;
  selectedQualification: string;
  qualificationAchievedDate: string;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleStatusChange: (statusId: string) => void;
  handleRoleChange: (roleId: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (id: string) => void;
  handleDeletePilot?: (pilotId: string) => void;
  handleSavePilotChanges?: (pilot: Pilot) => Promise<{ success: boolean; error?: string }>;
  isNewPilot?: boolean;
  onPilotFieldChange?: (field: string, value: string) => void;
  onSaveNewPilot?: () => void;
  onCancelAddPilot?: () => void;
  isSavingNewPilot?: boolean;
  saveError?: string | null;
}

const PilotDetails: React.FC<PilotDetailsProps> = ({
  selectedPilot,
  statuses,
  roles,
  pilotRoles,
  availableQualifications,
  pilotQualifications,
  loadingRoles,
  updatingRoles,
  updatingStatus,
  loadingQualifications,
  disabledRoles,
  selectedQualification,
  qualificationAchievedDate,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleStatusChange,
  handleRoleChange,
  handleAddQualification,
  handleRemoveQualification,
  handleDeletePilot,
  handleSavePilotChanges,
  isNewPilot = false,
  onPilotFieldChange,
  onSaveNewPilot,
  onCancelAddPilot,
  isSavingNewPilot = false,
  saveError = null,
}) => {
  const pilotDetailsRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [editedPilot, setEditedPilot] = useState<Pilot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
      setIsEdited(false);
    } else {
      setEditedPilot(null);
    }
    setEditError(null);
  }, [selectedPilot]);

  const handleFieldChange = (field: string, value: string) => {
    if (!editedPilot) return;

    setEditedPilot({
      ...editedPilot,
      [field]: value,
    });

    setIsEdited(true);
  };

  const handleSaveChanges = async () => {
    if (!editedPilot || !handleSavePilotChanges) return;

    setIsSaving(true);
    setEditError(null);

    try {
      const result = await handleSavePilotChanges(editedPilot);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save pilot changes');
      }

      setIsEdited(false);
    } catch (err: any) {
      setEditError(err.message || 'An error occurred while saving changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelChanges = () => {
    if (selectedPilot) {
      setEditedPilot({ ...selectedPilot });
    }

    setIsEdited(false);
    setEditError(null);
  };

  const handleEditStatusChange = (statusId: string) => {
    if (!editedPilot) return;

    const status = statuses.find((s) => s.id === statusId);

    setEditedPilot({
      ...editedPilot,
      status_id: statusId,
      status: status?.name as any,
    });

    setIsEdited(true);
  };

  const handleEditRoleChange = (roleId: string) => {
    if (!editedPilot) return;

    const role = roles.find((r) => r.id === roleId);

    setEditedPilot({
      ...editedPilot,
      role: role?.name || '',
    });

    setIsEdited(true);
  };

  const inputFieldStyle = {
    ...pilotDetailsStyles.fieldValue,
    width: '450px',
    minHeight: '35px',
    padding: '8px',
    boxSizing: 'border-box' as const,
  };

  const sectionSpacingStyle = {
    marginBottom: '24px',
  };

  if (!selectedPilot) {
    return (
      <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
        <div style={pilotDetailsStyles.emptyState}>Select a pilot to view their details</div>
      </div>
    );
  }

  const exportButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#FFFFFF',
    color: '#64748B',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    fontFamily: 'Inter',
    fontSize: '14px',
    fontWeight: 400,
    minWidth: '120px',
    justifyContent: 'center',
    height: '35px',
  };

  const renderEditableBasicInfo = () => {
    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Board Number *</label>
          <input
            type="text"
            value={selectedPilot.boardNumber || ''}
            onChange={(e) =>
              onPilotFieldChange &&
              onPilotFieldChange('boardNumber', e.target.value.replace(/[^0-9]/g, ''))
            }
            style={inputFieldStyle}
            placeholder="Enter board number"
          />
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Callsign *</label>
          <input
            type="text"
            value={selectedPilot.callsign || ''}
            onChange={(e) => onPilotFieldChange && onPilotFieldChange('callsign', e.target.value)}
            style={inputFieldStyle}
            placeholder="Enter callsign"
          />
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Username</label>
          <input
            type="text"
            value={selectedPilot.discordUsername || ''}
            onChange={(e) =>
              onPilotFieldChange && onPilotFieldChange('discordUsername', e.target.value)
            }
            style={inputFieldStyle}
            placeholder="Enter Discord username (optional)"
          />
        </div>

        <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
          <StatusSelector
            statuses={statuses}
            selectedStatusId={selectedPilot.status_id || ''}
            updatingStatus={updatingStatus}
            handleStatusChange={handleStatusChange}
          />
        </div>

        <div style={{ ...sectionSpacingStyle, marginTop: '12px' }}>
          <RoleSelector
            roles={roles}
            pilotRoles={pilotRoles}
            updatingRoles={updatingRoles}
            loadingRoles={loadingRoles}
            disabledRoles={disabledRoles}
            handleRoleChange={handleRoleChange}
          />
        </div>

        <div style={{ marginTop: '16px', color: '#64748B', fontSize: '14px' }}>* Required fields</div>
      </>
    );
  };

  const renderEditableExistingPilotInfo = () => {
    if (!editedPilot) return null;

    return (
      <>
        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Board Number</label>
          <input
            type="text"
            value={editedPilot.boardNumber || ''}
            onChange={(e) =>
              handleFieldChange('boardNumber', e.target.value.replace(/[^0-9]/g, ''))
            }
            style={inputFieldStyle}
            placeholder="Enter board number"
          />
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Callsign</label>
          <input
            type="text"
            value={editedPilot.callsign || ''}
            onChange={(e) => handleFieldChange('callsign', e.target.value)}
            style={inputFieldStyle}
            placeholder="Enter callsign"
          />
        </div>

        <div style={{ ...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle }}>
          <label style={pilotDetailsStyles.fieldLabel}>Discord Username</label>
          <input
            type="text"
            value={editedPilot.discordUsername || ''}
            onChange={(e) => handleFieldChange('discordUsername', e.target.value)}
            style={inputFieldStyle}
            placeholder="Enter Discord username (optional)"
          />
        </div>

        <div style={{ ...sectionSpacingStyle, marginTop: '20px' }}>
          <StatusSelector
            statuses={statuses}
            selectedStatusId={editedPilot.status_id || ''}
            updatingStatus={false}
            handleStatusChange={handleEditStatusChange}
          />
        </div>

        <div style={{ ...sectionSpacingStyle, marginTop: '20px' }}>
          <RoleSelector
            roles={roles}
            pilotRoles={pilotRoles}
            updatingRoles={false}
            loadingRoles={loadingRoles}
            disabledRoles={disabledRoles}
            handleRoleChange={handleEditRoleChange}
          />
        </div>
      </>
    );
  };

  return (
    <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
      <div>
        {isNewPilot && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600 }}>Add New Pilot</h1>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={onSaveNewPilot}
                disabled={
                  isSavingNewPilot ||
                  !selectedPilot.callsign ||
                  !selectedPilot.boardNumber ||
                  !selectedPilot.status_id
                }
                style={{
                  ...exportButtonStyle,
                  cursor:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isSavingNewPilot ||
                    !selectedPilot.callsign ||
                    !selectedPilot.boardNumber ||
                    !selectedPilot.status_id
                      ? 0.7
                      : 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    !isSavingNewPilot &&
                    selectedPilot.callsign &&
                    selectedPilot.boardNumber &&
                    selectedPilot.status_id
                  ) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    !isSavingNewPilot &&
                    selectedPilot.callsign &&
                    selectedPilot.boardNumber &&
                    selectedPilot.status_id
                  ) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <Save size={16} style={{ marginRight: '4px' }} />
                {isSavingNewPilot ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancelAddPilot}
                disabled={isSavingNewPilot}
                style={{
                  ...exportButtonStyle,
                  cursor: isSavingNewPilot ? 'not-allowed' : 'pointer',
                  opacity: isSavingNewPilot ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSavingNewPilot) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingNewPilot) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                <X size={16} style={{ marginRight: '4px' }} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {saveError && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              borderRadius: '6px',
              marginBottom: '16px',
            }}
          >
            {saveError}
          </div>
        )}

        {!isNewPilot && (
          <div style={pilotDetailsStyles.header}>
            <h1 style={pilotDetailsStyles.headerTitle}>
              <span style={pilotDetailsStyles.boardNumber}>{selectedPilot.boardNumber}</span>
              {selectedPilot.callsign}
              <span style={pilotDetailsStyles.roleText}>{selectedPilot.role || ''}</span>
            </h1>
          </div>
        )}

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
            Basic Information
          </h2>
          {isNewPilot ? (
            renderEditableBasicInfo()
          ) : (
            renderEditableExistingPilotInfo()
          )}
        </Card>

        {editError && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              borderRadius: '6px',
              marginBottom: '16px',
              marginTop: '16px'
            }}
          >
            {editError}
          </div>
        )}

        <div style={{ display: 'grid', gap: '24px', marginTop: '24px' }}>
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
              Qualifications
            </h2>

            {!isNewPilot && (
              <QualificationsManager
                pilotQualifications={pilotQualifications}
                availableQualifications={availableQualifications}
                selectedQualification={selectedQualification}
                qualificationAchievedDate={qualificationAchievedDate}
                loadingQualifications={loadingQualifications}
                isAddingQualification={isAddingQualification}
                updatingQualifications={updatingQualifications}
                setSelectedQualification={setSelectedQualification}
                setQualificationAchievedDate={setQualificationAchievedDate}
                handleAddQualification={handleAddQualification}
                handleRemoveQualification={handleRemoveQualification}
              />
            )}
            {isNewPilot && (
              <div style={{ marginTop: '20px', color: '#64748B', fontSize: '14px' }}>
                Qualifications can be added after creating the pilot.
              </div>
            )}
          </Card>

          {!isNewPilot && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
                Attendance and Service Record
              </h2>

              <div style={pilotDetailsStyles.emptyQualMessage}>
                Service record information will be available in a future update
              </div>
            </Card>
          )}
        </div>

        {isEdited && (
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              style={{
                ...exportButtonStyle,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }
              }}
            >
              <Save size={16} style={{ marginRight: '4px' }} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleCancelChanges}
              disabled={isSaving}
              style={{
                ...exportButtonStyle,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }
              }}
            >
              <X size={16} style={{ marginRight: '4px' }} />
              Cancel
            </button>
          </div>
        )}

        {!isNewPilot && handleDeletePilot && (
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowDeleteConfirmation(true)}
              style={{
                ...exportButtonStyle,
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FECACA';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FEE2E2';
              }}
            >
              <Trash2 size={16} style={{ marginRight: '4px' }} />
              Delete Pilot
            </button>
          </div>
        )}

        {showDeleteConfirmation && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                padding: '24px',
                borderRadius: '8px',
                width: '400px',
                textAlign: 'center',
              }}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Confirm Deletion
              </h2>
              <p style={{ marginBottom: '24px', color: '#64748B' }}>
                Are you sure you want to delete this pilot? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setShowDeleteConfirmation(false)}
                  style={{
                    ...exportButtonStyle,
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    border: '1px solid #D1D5DB',
                    width: '45%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#D1D5DB';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#E5E7EB';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (handleDeletePilot) {
                      handleDeletePilot(selectedPilot.id);
                    }
                    setShowDeleteConfirmation(false);
                  }}
                  style={{
                    ...exportButtonStyle,
                    backgroundColor: '#FEE2E2',
                    color: '#B91C1C',
                    border: '1px solid #FCA5A5',
                    width: '45%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#FECACA';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PilotDetails;