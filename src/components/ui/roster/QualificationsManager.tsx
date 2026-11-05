import React, { useState, useRef, useEffect } from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Qualification } from '../../../utils/qualificationService';
import QualificationBadge from '../QualificationBadge';
import { X } from 'lucide-react';

interface QualificationsManagerProps {
  pilotQualifications: any[];
  availableQualifications: Qualification[];
  selectedQualification: string;
  qualificationAchievedDate: string;
  loadingQualifications: boolean;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (recordId: string) => void; // Changed from qualificationId to recordId
}

const QualificationsManager: React.FC<QualificationsManagerProps> = ({
  pilotQualifications,
  availableQualifications,
  selectedQualification,
  qualificationAchievedDate,
  loadingQualifications,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleAddQualification,
  handleRemoveQualification
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showQualificationDropdown, setShowQualificationDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Function to calculate expiry date based on achieved date + validity period
  const calculateExpiryDate = (achievedDate: string | null, qualification: Qualification) => {
    if (!achievedDate || !qualification?.is_expirable || !qualification?.validity_period) {
      return null;
    }

    // achievedDate comes from database as ISO timestamp string, convert to Date
    const achieved = new Date(achievedDate);
    if (isNaN(achieved.getTime())) {
      return null; // Invalid date
    }
    
    const expiryDate = new Date(achieved);
    expiryDate.setDate(expiryDate.getDate() + qualification.validity_period);
    return expiryDate;
  };

  // Function to check if qualification expires within 30 days
  const isExpiringWithin30Days = (expiryDate: Date | null) => {
    if (!expiryDate) return false;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  };

  // Function to calculate days until expiry
  const getDaysUntilExpiry = (expiryDate: Date | null) => {
    if (!expiryDate) return null;
    const today = new Date();
    const timeDiff = expiryDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return daysDiff;
  };

  // Function to format expiry display
  const formatExpiryDisplay = (expiryDate: Date | null) => {
    if (!expiryDate) return '-';

    const daysUntil = getDaysUntilExpiry(expiryDate);
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });

    if (daysUntil === null) return formattedDate;

    if (daysUntil < 0) {
      return `${formattedDate} (${Math.abs(daysUntil)} days ago)`;
    } else if (daysUntil === 0) {
      return `${formattedDate} (today)`;
    } else {
      return `${formattedDate} (${daysUntil} days)`;
    }
  };

  const handleAddClick = () => {
    setShowAddDialog(true);
  };

  const handleAddDialogSave = () => {
    handleAddQualification();
    setShowAddDialog(false);
    setShowQualificationDropdown(false);
    setSelectedQualification('');
  };

  const handleAddDialogCancel = () => {
    setShowAddDialog(false);
    setShowQualificationDropdown(false);
    setSelectedQualification('');
  };

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowQualificationDropdown(false);
      }
    };

    if (showQualificationDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showQualificationDropdown]);

  return (
    <div>
      <label style={pilotDetailsStyles.fieldLabel}>
        Qualifications
      </label>

      {/* Show loading state if loading qualifications */}
      {loadingQualifications ? (
        <div style={{
          textAlign: 'center',
          padding: '24px',
          color: 'var(--rr-text2)',
          fontSize: '14px'
        }}>
          Loading qualifications...
        </div>
      ) : (
        <>
          {/* Qualifications Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Qualifications Table */}
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
                  padding: '8px 12px',
                  width: '50px',
                  borderRight: '1px solid var(--rr-border)'
                }}>
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--rr-text2)',
                  textTransform: 'uppercase',
                  width: '300px',
                  borderRight: '1px solid var(--rr-border)'
                }}>
                  Qualification
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--rr-text2)',
                  textTransform: 'uppercase',
                  width: '80px',
                  borderRight: '1px solid var(--rr-border)',
                  textAlign: 'center'
                }}>
                  Achieved
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--rr-text2)',
                  textTransform: 'uppercase',
                  width: '150px',
                  borderRight: '1px solid var(--rr-border)',
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
              {pilotQualifications.length > 0 ? (
                pilotQualifications
                  .sort((a, b) => {
                    // First sort by qualification order
                    const orderDiff = a.qualification.order - b.qualification.order;
                    if (orderDiff !== 0) return orderDiff;
                    
                    // Then sort by achieved date (most recent first) for duplicate qualifications
                    const dateA = new Date(a.achieved_date || 0).getTime();
                    const dateB = new Date(b.achieved_date || 0).getTime();
                    return dateB - dateA;
                  })
                  .map((pilotQual, index) => (
                  <div
                    key={pilotQual.id}
                    style={{
                      display: 'flex',
                      borderBottom: index < pilotQualifications.length - 1 ? '1px solid var(--rr-border)' : 'none',
                      backgroundColor: 'var(--rr-panel)',
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
                      borderRight: '1px solid var(--rr-border)'
                    }}>
                      <QualificationBadge
                        type={pilotQual.qualification.name}
                        qualifications={availableQualifications}
                        size="normal"
                      />
                    </div>

                    {/* Qualification Name Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      width: '300px',
                      borderRight: '1px solid var(--rr-border)',
                      gap: '8px'
                    }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--rr-text)'
                      }}>
                        {pilotQual.qualification.name}
                      </span>
                      {/* Show indicator if there are multiple instances of this qualification */}
                      {pilotQualifications.filter(pq => pq.qualification_id === pilotQual.qualification_id).length > 1 && (
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--rr-text2)',
                          backgroundColor: 'var(--rr-panel2)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 400
                        }}>
                          {pilotQualifications
                            .filter(pq => pq.qualification_id === pilotQual.qualification_id)
                            .sort((a, b) => new Date(b.achieved_date || 0).getTime() - new Date(a.achieved_date || 0).getTime())
                            .findIndex(pq => pq.id === pilotQual.id) === 0 ? 'Current' : 'Previous'}
                        </span>
                      )}
                    </div>

                    {/* Achieved Date Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '80px',
                      borderRight: '1px solid var(--rr-border)'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: 'var(--rr-text2)'
                      }}>
                        {pilotQual.achieved_date ?
                          new Date(pilotQual.achieved_date).toLocaleDateString() :
                          '-'
                        }
                      </span>
                    </div>

                    {/* Expiry Date Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '150px',
                      borderRight: '1px solid var(--rr-border)'
                    }}>
                      {(() => {
                        const expiryDate = calculateExpiryDate(pilotQual.achieved_date, pilotQual.qualification);
                        const isExpiringSoon = isExpiringWithin30Days(expiryDate);
                        const daysUntil = getDaysUntilExpiry(expiryDate);
                        const isExpired = daysUntil !== null && daysUntil < 0;

                        return (
                          <span style={{
                            fontSize: '13px',
                            color: isExpired ? 'var(--rr-bad)' : isExpiringSoon ? 'var(--rr-warn)' : 'var(--rr-text2)',
                            fontWeight: isExpired || isExpiringSoon ? '500' : 'normal'
                          }}>
                            {formatExpiryDisplay(expiryDate)}
                          </span>
                        );
                      })()}
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
                        onClick={() => handleRemoveQualification(pilotQual.id)}
                        disabled={updatingQualifications}
                        title="Remove qualification"
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
                          cursor: updatingQualifications ? 'not-allowed' : 'pointer',
                          color: 'var(--rr-text3)',
                          opacity: updatingQualifications ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!updatingQualifications) {
                            e.currentTarget.style.color = 'var(--rr-bad)';
                            e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!updatingQualifications) {
                            e.currentTarget.style.color = 'var(--rr-text3)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '14px',
                  color: 'var(--rr-text3)'
                }}>
                  No qualifications added
                </div>
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
                disabled={isAddingQualification || updatingQualifications}
                style={{
                  width: '119px',
                  height: '30px',
                  background: 'var(--rr-panel)',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: isAddingQualification || updatingQualifications ? 'not-allowed' : 'pointer',
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
                  opacity: isAddingQualification || updatingQualifications ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isAddingQualification && !updatingQualifications) {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAddingQualification && !updatingQualifications) {
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                +
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Qualification Dialog */}
      {showAddDialog && (
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
          onClick={handleAddDialogCancel}
        >
          <div
            style={{
              backgroundColor: 'var(--rr-panel)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '600px',
              maxWidth: '700px',
              boxShadow: 'var(--rr-shadow-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: 'var(--rr-text)'
              }}>
                Add Qualification
              </h3>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: 'var(--rr-panel2)',
              borderRadius: '8px',
              border: '1px solid var(--rr-border)'
            }}>
              {/* Qualification Selector */}
              <div ref={dropdownRef} style={{ flex: '1', minWidth: '200px', position: 'relative' }}>
                <button
                  onClick={() => setShowQualificationDropdown(!showQualificationDropdown)}
                  disabled={isAddingQualification}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'var(--rr-panel)',
                    cursor: isAddingQualification ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '40px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {availableQualifications.find(q => q.id === selectedQualification) && (
                      <QualificationBadge
                        type={availableQualifications.find(q => q.id === selectedQualification)!.name as any}
                        qualifications={availableQualifications}
                        size="small"
                      />
                    )}
                    <span>
                      {availableQualifications.find(q => q.id === selectedQualification)?.name || 'Select qualification'}
                    </span>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showQualificationDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--rr-panel)',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '6px',
                    boxShadow: 'var(--rr-shadow)',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {availableQualifications
                      .map(qual => (
                        <button
                          key={qual.id}
                          onClick={() => {
                            setSelectedQualification(qual.id);
                            setShowQualificationDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: selectedQualification === qual.id ? 'var(--rr-panel2)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '14px',
                            textAlign: 'left',
                            height: '32px'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedQualification !== qual.id) {
                              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedQualification !== qual.id) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <QualificationBadge type={qual.name as any} qualifications={availableQualifications} size="small" />
                          <span>{qual.name}</span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* Date Input */}
              <input
                type="date"
                title="Achievement date"
                value={qualificationAchievedDate}
                onChange={(e) => setQualificationAchievedDate(e.target.value)}
                disabled={isAddingQualification}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--rr-panel)',
                  width: '140px',
                  height: '40px',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  cursor: isAddingQualification ? 'not-allowed' : 'pointer'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleAddDialogCancel}
                disabled={isAddingQualification}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-panel)',
                  color: 'var(--rr-text2)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: isAddingQualification ? 'not-allowed' : 'pointer',
                  opacity: isAddingQualification ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDialogSave}
                disabled={!selectedQualification || isAddingQualification}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !selectedQualification || isAddingQualification ? '#9CA3AF' : 'var(--rr-accent)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !selectedQualification || isAddingQualification ? 'not-allowed' : 'pointer'
                }}
              >
                {isAddingQualification ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualificationsManager;