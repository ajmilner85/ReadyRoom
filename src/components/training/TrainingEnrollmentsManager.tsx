import React, { useState } from 'react';
import { Cycle } from '../../types/EventTypes';

// Enrollment with cycle data from getPilotEnrollmentHistory
interface EnrollmentWithCycle {
  id: string;
  cycle_id: string;
  pilot_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  status: 'active' | 'completed' | 'dropped' | 'graduated';
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_at: string;
  updated_at: string;
  cycles?: {
    name: string;
    start_date: string;
    end_date: string;
  };
}

interface TrainingEnrollmentsManagerProps {
  pilotEnrollments: EnrollmentWithCycle[];
  availableTrainingCycles: Cycle[];
  onAddEnrollment: (cycleId: string) => Promise<void>;
  onRemoveEnrollment: (enrollmentId: string) => Promise<void>;
  isLoading?: boolean;
  isUpdating?: boolean;
}

const TrainingEnrollmentsManager: React.FC<TrainingEnrollmentsManagerProps> = ({
  pilotEnrollments,
  availableTrainingCycles,
  onAddEnrollment,
  onRemoveEnrollment,
  isLoading = false,
  isUpdating = false,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddClick = () => {
    setShowAddDialog(true);
    setSelectedCycleId('');
  };

  const handleCancelAdd = () => {
    setShowAddDialog(false);
    setSelectedCycleId('');
  };

  const handleConfirmAdd = async () => {
    if (!selectedCycleId) return;

    setIsAdding(true);
    try {
      await onAddEnrollment(selectedCycleId);
      setShowAddDialog(false);
      setSelectedCycleId('');
    } catch (error) {
      console.error('Failed to add enrollment:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try {
      await onRemoveEnrollment(enrollmentId);
    } catch (error) {
      console.error('Failed to remove enrollment:', error);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10B981'; // green
      case 'completed':
      case 'graduated':
        return '#3B82F6'; // blue
      case 'dropped':
        return '#EF4444'; // red
      case 'upcoming':
        return '#F59E0B'; // amber/orange
      default:
        return '#6B7280'; // gray
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get cycle name for an enrollment
  const getCycleName = (enrollment: EnrollmentWithCycle) => {
    return enrollment.cycles?.name || 'Unknown Cycle';
  };

  // Compute enrollment status based on cycle dates and stored status
  const getComputedStatus = (enrollment: EnrollmentWithCycle): 'active' | 'completed' | 'dropped' | 'graduated' | 'upcoming' => {
    // If manually set to dropped or graduated, keep that status
    if (enrollment.status === 'dropped' || enrollment.status === 'graduated') {
      return enrollment.status;
    }

    // Otherwise compute based on cycle dates
    if (!enrollment.cycles) {
      return enrollment.status; // Fallback to stored status
    }

    const now = new Date();
    const startDate = new Date(enrollment.cycles.start_date);
    const endDate = new Date(enrollment.cycles.end_date);

    if (now < startDate) {
      return 'upcoming' as any; // Cycle hasn't started yet
    } else if (now > endDate) {
      // Cycle has concluded - check if they completed or just ended
      return enrollment.status === 'completed' ? 'completed' : 'completed';
    } else {
      return 'active'; // Cycle is currently running
    }
  };

  return (
    <div>
      {/* Table and Add Button Container */}
      <div style={{
        width: 'fit-content'
      }}>
        {/* Enrollments Table */}
        <div style={{
          border: '1px solid #E5E7EB',
          borderRadius: '6px',
          backgroundColor: '#FFFFFF'
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
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            textTransform: 'uppercase',
            width: '300px',
            borderRight: '1px solid #E5E7EB'
          }}>
            Cycle / Training
          </div>
          <div style={{
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            textTransform: 'uppercase',
            width: '100px',
            borderRight: '1px solid #E5E7EB'
          }}>
            Status
          </div>
          <div style={{
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            textTransform: 'uppercase',
            width: '120px',
            borderRight: '1px solid #E5E7EB'
          }}>
            Enrolled
          </div>
          <div style={{
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            textTransform: 'uppercase',
            width: '60px',
            textAlign: 'center'
          }}>
            {/* Empty header for action column */}
          </div>
        </div>

        {/* Table Body */}
        {isLoading ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#6B7280',
            fontSize: '14px'
          }}>
            Loading enrollments...
          </div>
        ) : pilotEnrollments.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#6B7280',
            fontSize: '14px'
          }}>
            No training enrollments
          </div>
        ) : (
          <>
            {pilotEnrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #E5E7EB'
                }}
              >
                <div style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: '#374151',
                  width: '300px',
                  borderRight: '1px solid #E5E7EB'
                }}>
                  {getCycleName(enrollment)}
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  width: '100px',
                  borderRight: '1px solid #E5E7EB'
                }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#FFFFFF',
                    backgroundColor: getStatusBadgeColor(getComputedStatus(enrollment))
                  }}>
                    {formatStatus(getComputedStatus(enrollment))}
                  </span>
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: '#6B7280',
                  width: '120px',
                  borderRight: '1px solid #E5E7EB'
                }}>
                  {formatDate(enrollment.enrolled_at)}
                </div>
                <div style={{
                  padding: '8px 12px',
                  width: '60px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  <button
                    onClick={() => handleRemoveEnrollment(enrollment.id)}
                    disabled={isUpdating}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: isUpdating ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      color: '#EF4444',
                      fontSize: '16px',
                      opacity: isUpdating ? 0.5 : 1
                    }}
                    title="Remove enrollment"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8px 0'
      }}>
        <button
          onClick={handleAddClick}
          disabled={isUpdating || availableTrainingCycles.length === 0}
          style={{
            width: '119px',
            height: '30px',
            background: '#FFFFFF',
            borderRadius: '8px',
            border: 'none',
            cursor: isUpdating || availableTrainingCycles.length === 0 ? 'not-allowed' : 'pointer',
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
            opacity: isUpdating || availableTrainingCycles.length === 0 ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (!isUpdating && availableTrainingCycles.length > 0) {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isUpdating && availableTrainingCycles.length > 0) {
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          +
        </button>
      </div>
      </div>

      {/* Add Enrollment Dialog */}
      {showAddDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '20px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 600,
              marginBottom: '16px',
              color: '#111827'
            }}>
              Add Training Enrollment
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '6px',
                color: '#374151'
              }}>
                Select Training Cycle
              </label>
              <select
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                disabled={isAdding}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: '#FFFFFF',
                  cursor: isAdding ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="">Choose a cycle...</option>
                {availableTrainingCycles
                  .filter(cycle => cycle.type === 'Training')
                  .map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name} ({cycle.status})
                    </option>
                  ))}
              </select>
            </div>

            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleCancelAdd}
                disabled={isAdding}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: isAdding ? 'not-allowed' : 'pointer',
                  opacity: isAdding ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={!selectedCycleId || isAdding}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !selectedCycleId || isAdding ? '#9CA3AF' : '#3B82F6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: !selectedCycleId || isAdding ? 'not-allowed' : 'pointer'
                }}
              >
                {isAdding ? 'Adding...' : 'Add Enrollment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingEnrollmentsManager;
