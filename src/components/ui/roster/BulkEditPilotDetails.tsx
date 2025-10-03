import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../card';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Squadron } from '../../../utils/squadronService';
import { Qualification } from '../../../utils/qualificationService';
import StatusSelector from './StatusSelector';
import StandingSelector from './StandingSelector';
import SquadronSelector from './SquadronSelector';
import { Trash2, Plus, X } from 'lucide-react';
import QualificationBadge from '../QualificationBadge';

interface BulkEditPilotDetailsProps {
  selectedPilots: Pilot[];
  statuses: Status[];
  standings: Standing[];
  squadrons: Squadron[];
  availableQualifications: Qualification[];
  allPilotQualifications: Record<string, any[]>;
  onBulkStatusChange: (statusId: string) => Promise<void>;
  onBulkStandingChange: (standingId: string) => Promise<void>;
  onBulkSquadronChange: (squadronId: string) => Promise<void>;
  onBulkAddQualification: (qualificationId: string, achievedDate: string) => Promise<void>;
  onBulkRemoveQualification: (qualificationId: string) => Promise<void>;
  onBulkDeletePilots: () => Promise<void>;
  onBulkClearDiscord: () => Promise<void>;
}

interface CommonQualification {
  id: string;
  name: string;
  code?: string;
  color?: string;
  earliestAchieved: string;
  latestAchieved: string;
  earliestExpiry?: string;
  latestExpiry?: string;
}

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  onConfirm,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmEnabled = inputValue.toLowerCase() === 'yes';

  return (
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
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1F2937' }}>
          {title}
        </h2>
        <p style={{ marginBottom: '16px', color: '#6B7280', fontSize: '14px' }}>
          {message}
        </p>
        <p style={{ marginBottom: '8px', color: '#374151', fontSize: '14px', fontWeight: 500 }}>
          Type "yes" to confirm:
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type yes"
          autoFocus
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
            marginBottom: '20px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#FFFFFF',
              color: '#6B7280',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (isConfirmEnabled) {
                onConfirm();
              }
            }}
            disabled={!isConfirmEnabled}
            style={{
              padding: '8px 16px',
              backgroundColor: isConfirmEnabled ? '#EF4444' : '#FCA5A5',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: isConfirmEnabled ? 'pointer' : 'not-allowed',
              opacity: isConfirmEnabled ? 1 : 0.6
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const BulkEditPilotDetails: React.FC<BulkEditPilotDetailsProps> = ({
  selectedPilots,
  statuses,
  standings,
  squadrons,
  availableQualifications,
  allPilotQualifications,
  onBulkStatusChange,
  onBulkStandingChange,
  onBulkSquadronChange,
  onBulkAddQualification,
  onBulkRemoveQualification,
  onBulkDeletePilots,
  onBulkClearDiscord
}) => {
  const [showAddQualDialog, setShowAddQualDialog] = useState(false);

  // Track pending changes
  const [pendingStatusId, setPendingStatusId] = useState<string>('');
  const [pendingStandingId, setPendingStandingId] = useState<string>('');
  const [pendingSquadronId, setPendingSquadronId] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedQualification, setSelectedQualification] = useState('');
  const [achievedDate, setAchievedDate] = useState(new Date().toISOString().split('T')[0]);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete_pilots' | 'clear_discord' | 'remove_qualification';
    qualificationId?: string;
  } | null>(null);

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

  // Calculate common qualifications across all selected pilots
  const commonQualifications = useMemo((): CommonQualification[] => {
    if (selectedPilots.length === 0) return [];

    // Get qualifications for first pilot
    const firstPilotQuals = allPilotQualifications[selectedPilots[0].id] || [];
    const qualMap = new Map<string, CommonQualification>();

    firstPilotQuals.forEach((pq: any) => {
      const qual = pq.qualification;
      qualMap.set(qual.id, {
        id: qual.id,
        name: qual.name,
        code: qual.code,
        color: qual.color,
        earliestAchieved: pq.achieved_date,
        latestAchieved: pq.achieved_date,
        earliestExpiry: pq.expiry_date,
        latestExpiry: pq.expiry_date
      });
    });

    // Check each other pilot to find common qualifications
    for (let i = 1; i < selectedPilots.length; i++) {
      const pilotQuals = allPilotQualifications[selectedPilots[i].id] || [];
      const pilotQualIds = new Set(pilotQuals.map((pq: any) => pq.qualification.id));

      // Remove qualifications not present in this pilot
      for (const [qualId, commonQual] of qualMap.entries()) {
        if (!pilotQualIds.has(qualId)) {
          qualMap.delete(qualId);
        } else {
          // Update date ranges
          const pilotQual = pilotQuals.find((pq: any) => pq.qualification.id === qualId);
          if (pilotQual) {
            if (pilotQual.achieved_date < commonQual.earliestAchieved) {
              commonQual.earliestAchieved = pilotQual.achieved_date;
            }
            if (pilotQual.achieved_date > commonQual.latestAchieved) {
              commonQual.latestAchieved = pilotQual.achieved_date;
            }
            if (pilotQual.expiry_date) {
              if (!commonQual.earliestExpiry || pilotQual.expiry_date < commonQual.earliestExpiry) {
                commonQual.earliestExpiry = pilotQual.expiry_date;
              }
              if (!commonQual.latestExpiry || pilotQual.expiry_date > commonQual.latestExpiry) {
                commonQual.latestExpiry = pilotQual.expiry_date;
              }
            }
          }
        }
      }
    }

    return Array.from(qualMap.values());
  }, [selectedPilots, allPilotQualifications]);

  // Calculate common Discord roles
  const hasDiscordLinked = selectedPilots.every(p => p.discordUsername);

  const handleAddQualification = async () => {
    console.log('[BulkEditPilotDetails] handleAddQualification called with:', { selectedQualification, achievedDate });

    if (!selectedQualification) {
      console.log('[BulkEditPilotDetails] No qualification selected, returning early');
      return;
    }

    console.log('[BulkEditPilotDetails] Calling onBulkAddQualification...');
    await onBulkAddQualification(selectedQualification, achievedDate);
    console.log('[BulkEditPilotDetails] onBulkAddQualification completed, cleaning up dialog');

    setShowAddQualDialog(false);
    setSelectedQualification('');
    setAchievedDate(new Date().toISOString().split('T')[0]);
  };

  const handleStatusChange = (statusId: string) => {
    setPendingStatusId(statusId);
    setHasUnsavedChanges(true);
  };

  const handleStandingChange = (standingId: string) => {
    setPendingStandingId(standingId);
    setHasUnsavedChanges(true);
  };

  const handleSquadronChange = (squadronId: string) => {
    setPendingSquadronId(squadronId);
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    try {
      if (pendingStatusId) {
        await onBulkStatusChange(pendingStatusId);
      }
      if (pendingStandingId) {
        await onBulkStandingChange(pendingStandingId);
      }
      if (pendingSquadronId) {
        await onBulkSquadronChange(pendingSquadronId);
      }

      // Reset pending changes
      setPendingStatusId('');
      setPendingStandingId('');
      setPendingSquadronId('');
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving bulk changes:', error);
    }
  };

  const handleCancelChanges = () => {
    setPendingStatusId('');
    setPendingStandingId('');
    setPendingSquadronId('');
    setHasUnsavedChanges(false);
  };

  return (
    <div style={{
      ...pilotDetailsStyles.container,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: 0
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px'
      }}>
        <div style={pilotDetailsStyles.header}>
          <h1 style={pilotDetailsStyles.headerTitle}>
            Bulk Editing {selectedPilots.length} Pilots
          </h1>
        </div>

        {/* Basic Information Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
            Bulk Actions
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
            <div>
              <div style={{ marginBottom: '24px' }}>
                <StatusSelector
                  statuses={statuses}
                  selectedStatusId={pendingStatusId}
                  updatingStatus={false}
                  handleStatusChange={handleStatusChange}
                  placeholder="Change Status..."
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <StandingSelector
                  standings={standings}
                  selectedStandingId={pendingStandingId}
                  updatingStanding={false}
                  handleStandingChange={handleStandingChange}
                  placeholder="Change Standing..."
                />
              </div>
            </div>

            <div>
              <div style={{ marginBottom: '24px' }}>
                <SquadronSelector
                  squadrons={squadrons}
                  selectedSquadronId={pendingSquadronId}
                  updatingSquadron={false}
                  handleSquadronChange={handleSquadronChange}
                  placeholder="Change Squadron..."
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Discord Section */}
        <Card className="p-4" style={{ marginTop: '24px' }}>
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
            Discord Information
          </h2>
          <div style={{ marginBottom: '16px', color: '#64748B', fontSize: '14px' }}>
            {hasDiscordLinked
              ? `All ${selectedPilots.length} selected pilots have Discord accounts linked`
              : `Some selected pilots do not have Discord accounts linked`}
          </div>
          {hasDiscordLinked && (
            <button
              onClick={() => setConfirmDialog({ type: 'clear_discord' })}
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
              Clear Discord Usernames
            </button>
          )}
        </Card>

        {/* Qualifications Card */}
        <Card className="p-4" style={{ marginTop: '24px' }}>
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
            Common Qualifications
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => setShowAddQualDialog(true)}
              style={{
                ...exportButtonStyle,
                backgroundColor: '#3B82F6',
                color: '#FFFFFF',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563EB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3B82F6';
              }}
            >
              <Plus size={16} />
              Bulk Add Qualification
            </button>
          </div>

          {commonQualifications.length > 0 ? (
            <div style={{
              marginTop: '16px',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              width: 'fit-content'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'flex',
                backgroundColor: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
                borderRadius: '6px 6px 0 0'
              }}>
                <div style={{
                  padding: '8px 12px',
                  width: '50px',
                  borderRight: '1px solid #E5E7EB'
                }}>
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  minWidth: '250px',
                  borderRight: '1px solid #E5E7EB'
                }}>
                  Qualification
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  minWidth: '200px',
                  borderRight: '1px solid #E5E7EB',
                  textAlign: 'center'
                }}>
                  Achieved
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  minWidth: '200px',
                  borderRight: '1px solid #E5E7EB',
                  textAlign: 'center'
                }}>
                  Expires
                </div>
                <div style={{
                  width: '30px',
                  padding: '8px 12px'
                }}>
                </div>
              </div>

              {/* Table Body */}
              {commonQualifications.map((qual, index) => {
                const achievedRange = qual.earliestAchieved === qual.latestAchieved
                  ? new Date(qual.earliestAchieved).toLocaleDateString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric'
                    })
                  : `${new Date(qual.earliestAchieved).toLocaleDateString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric'
                    })} - ${new Date(qual.latestAchieved).toLocaleDateString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric'
                    })}`;

                const expiryRange = qual.earliestExpiry && qual.latestExpiry
                  ? (qual.earliestExpiry === qual.latestExpiry
                    ? new Date(qual.earliestExpiry).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                      })
                    : `${new Date(qual.earliestExpiry).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                      })} - ${new Date(qual.latestExpiry).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                      })}`)
                  : '-';

                return (
                  <div
                    key={qual.id}
                    style={{
                      display: 'flex',
                      borderBottom: index < commonQualifications.length - 1 ? '1px solid #F3F4F6' : 'none',
                      backgroundColor: '#FFFFFF',
                      height: '34px'
                    }}
                  >
                    {/* Badge Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '50px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <QualificationBadge
                        type={qual.name as any}
                        qualifications={availableQualifications}
                        size="normal"
                      />
                    </div>

                    {/* Qualification Name Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      minWidth: '250px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827'
                      }}>
                        {qual.name}
                      </span>
                    </div>

                    {/* Achieved Date Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '200px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: '#6B7280'
                      }}>
                        {achievedRange}
                      </span>
                    </div>

                    {/* Expires Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '200px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: '#6B7280'
                      }}>
                        {expiryRange}
                      </span>
                    </div>

                    {/* Actions Column */}
                    <div style={{
                      width: '30px',
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <button
                        onClick={() => setConfirmDialog({ type: 'remove_qualification', qualificationId: qual.id })}
                        title="Remove qualification from all selected pilots"
                        style={{
                          width: '16px',
                          height: '16px',
                          padding: '0',
                          borderRadius: '4px',
                          background: 'none',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#9CA3AF'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#DC2626';
                          e.currentTarget.style.backgroundColor = '#FEE2E2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#9CA3AF';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#9CA3AF', fontSize: '14px', textAlign: 'center', padding: '16px' }}>
              No qualifications common to all selected pilots
            </div>
          )}
        </Card>
      </div>

      {/* Footer with action buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px',
        borderTop: '1px solid #E2E8F0'
      }}>
        <button
          onClick={() => setConfirmDialog({ type: 'delete_pilots' })}
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
          <Trash2 size={16} />
          Delete {selectedPilots.length} Pilot{selectedPilots.length > 1 ? 's' : ''}
        </button>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleCancelChanges}
            disabled={!hasUnsavedChanges}
            style={{
              ...exportButtonStyle,
              backgroundColor: '#FFFFFF',
              color: hasUnsavedChanges ? '#6B7280' : '#9CA3AF',
              border: '1px solid #D1D5DB',
              cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
              opacity: hasUnsavedChanges ? 1 : 0.6
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={!hasUnsavedChanges}
            style={{
              ...exportButtonStyle,
              backgroundColor: hasUnsavedChanges ? '#3B82F6' : '#93C5FD',
              color: '#FFFFFF',
              border: 'none',
              cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={(e) => {
              if (hasUnsavedChanges) {
                e.currentTarget.style.backgroundColor = '#2563EB';
              }
            }}
            onMouseLeave={(e) => {
              if (hasUnsavedChanges) {
                e.currentTarget.style.backgroundColor = '#3B82F6';
              }
            }}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Add Qualification Dialog */}
      {showAddQualDialog && (
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
            onClick={() => setShowAddQualDialog(false)}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                padding: '24px',
                minWidth: '400px',
                maxWidth: '500px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1F2937' }}>
                Bulk Add Qualification
              </h2>
              <p style={{ marginBottom: '16px', color: '#6B7280', fontSize: '14px' }}>
                Add a qualification to all {selectedPilots.length} selected pilots
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Qualification
                </label>
                <select
                  value={selectedQualification}
                  onChange={(e) => setSelectedQualification(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">Select qualification...</option>
                  {availableQualifications.map(qual => (
                    <option key={qual.id} value={qual.id}>
                      {qual.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Achieved Date
                </label>
                <input
                  type="date"
                  value={achievedDate}
                  onChange={(e) => setAchievedDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowAddQualDialog(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#FFFFFF',
                    color: '#6B7280',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddQualification}
                  disabled={!selectedQualification}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: selectedQualification ? '#3B82F6' : '#93C5FD',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: selectedQualification ? 'pointer' : 'not-allowed'
                  }}
                >
                  Add to All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialogs */}
        <ConfirmationDialog
          isOpen={confirmDialog?.type === 'delete_pilots'}
          title="Delete Multiple Pilots"
          message={`Are you sure you want to delete ${selectedPilots.length} pilot record${selectedPilots.length > 1 ? 's' : ''}? This action cannot be undone.`}
          confirmText="Delete"
          onConfirm={async () => {
            await onBulkDeletePilots();
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />

        <ConfirmationDialog
          isOpen={confirmDialog?.type === 'clear_discord'}
          title="Clear Discord Usernames"
          message={`Are you sure you want to clear Discord usernames from ${selectedPilots.length} pilot${selectedPilots.length > 1 ? 's' : ''}?`}
          confirmText="Clear"
          onConfirm={async () => {
            await onBulkClearDiscord();
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />

        <ConfirmationDialog
          isOpen={confirmDialog?.type === 'remove_qualification'}
          title="Remove Qualification"
          message={`Are you sure you want to remove this qualification from all ${selectedPilots.length} selected pilot${selectedPilots.length > 1 ? 's' : ''}?`}
          confirmText="Remove"
          onConfirm={async () => {
            if (confirmDialog?.qualificationId) {
              await onBulkRemoveQualification(confirmDialog.qualificationId);
            }
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />
    </div>
  );
};

export default BulkEditPilotDetails;
