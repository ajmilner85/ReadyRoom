import React, { useState, useRef, useEffect } from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Team } from '../../../types/TeamTypes';
import { X } from 'lucide-react';
import { utcTimestampToLocalDateString } from '../../../utils/dateUtils';

interface TeamsManagerProps {
  pilotTeams: any[];
  availableTeams: Team[];
  selectedTeam: string;
  teamStartDate: string;
  loadingTeams: boolean;
  isAddingTeam: boolean;
  updatingTeams: boolean;
  setSelectedTeam: (id: string) => void;
  setTeamStartDate: (date: string) => void;
  handleAddTeam: () => void;
  handleRemoveTeam: (recordId: string) => void;
}

const TeamsManager: React.FC<TeamsManagerProps> = ({
  pilotTeams,
  availableTeams,
  selectedTeam,
  teamStartDate,
  loadingTeams,
  isAddingTeam,
  updatingTeams,
  setSelectedTeam,
  setTeamStartDate,
  handleAddTeam,
  handleRemoveTeam
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleAddClick = () => {
    setShowAddDialog(true);
  };

  const handleAddDialogSave = () => {
    handleAddTeam();
    setShowAddDialog(false);
    setShowTeamDropdown(false);
    setSelectedTeam('');
  };

  const handleAddDialogCancel = () => {
    setShowAddDialog(false);
    setShowTeamDropdown(false);
    setSelectedTeam('');
  };

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTeamDropdown(false);
      }
    };

    if (showTeamDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTeamDropdown]);

  // Helper to get team scope display
  const getTeamScopeLabel = (team: Team) => {
    if (team.scope === 'global') return 'Global';
    return team.scope.charAt(0).toUpperCase() + team.scope.slice(1);
  };

  return (
    <div>
      <label style={pilotDetailsStyles.fieldLabel}>
        Teams
      </label>

      {/* Show loading state if loading teams */}
      {loadingTeams ? (
        <div style={{
          textAlign: 'center',
          padding: '24px',
          color: '#64748B',
          fontSize: '14px'
        }}>
          Loading teams...
        </div>
      ) : (
        <>
          {/* Teams Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Teams Table */}
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
                  Team
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  width: '100px',
                  borderRight: '1px solid #E5E7EB',
                  textAlign: 'center'
                }}>
                  Scope
                </div>
                <div style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  width: '80px',
                  borderRight: '1px solid #E5E7EB',
                  textAlign: 'center'
                }}>
                  Joined
                </div>
                <div style={{
                  width: '30px',
                  padding: '8px 12px'
                }}>
                </div>
              </div>

              {/* Table Body */}
              {pilotTeams.length > 0 ? (
                pilotTeams
                  .filter(pt => !pt.end_date) // Only show active team memberships
                  .sort((a, b) => {
                    // Sort by team name
                    const nameA = a.team?.name || '';
                    const nameB = b.team?.name || '';
                    return nameA.localeCompare(nameB);
                  })
                  .map((pilotTeam, index, filteredArray) => (
                  <div
                    key={pilotTeam.id}
                    style={{
                      display: 'flex',
                      borderBottom: index < filteredArray.length - 1 ? '1px solid #F3F4F6' : 'none',
                      backgroundColor: '#FFFFFF',
                      height: '34px'
                    }}
                  >
                    {/* Team Name Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      width: '300px',
                      borderRight: '1px solid #F3F4F6',
                      gap: '8px'
                    }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827'
                      }}>
                        {pilotTeam.team?.name || 'Unknown Team'}
                      </span>
                      {!pilotTeam.team?.active && (
                        <span style={{
                          fontSize: '11px',
                          color: '#DC2626',
                          backgroundColor: '#FEE2E2',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 400
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Scope Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: '#6B7280'
                      }}>
                        {pilotTeam.team ? getTeamScopeLabel(pilotTeam.team) : '-'}
                      </span>
                    </div>

                    {/* Start Date Column */}
                    <div style={{
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '80px',
                      borderRight: '1px solid #F3F4F6'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: '#6B7280'
                      }}>
                        {pilotTeam.start_date ?
                          new Date(pilotTeam.start_date + 'T00:00:00').toLocaleDateString() :
                          '-'
                        }
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
                        onClick={() => handleRemoveTeam(pilotTeam.id)}
                        disabled={updatingTeams}
                        title="Remove from team"
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
                          cursor: updatingTeams ? 'not-allowed' : 'pointer',
                          color: '#9CA3AF',
                          opacity: updatingTeams ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!updatingTeams) {
                            e.currentTarget.style.color = '#EF4444';
                            e.currentTarget.style.backgroundColor = '#FEF2F2';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!updatingTeams) {
                            e.currentTarget.style.color = '#9CA3AF';
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
                  color: '#9CA3AF'
                }}>
                  Not a member of any teams
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
                disabled={isAddingTeam || updatingTeams}
                style={{
                  width: '119px',
                  height: '30px',
                  background: '#FFFFFF',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: isAddingTeam || updatingTeams ? 'not-allowed' : 'pointer',
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
                  opacity: isAddingTeam || updatingTeams ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isAddingTeam && !updatingTeams) {
                    e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAddingTeam && !updatingTeams) {
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

      {/* Add Team Dialog */}
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
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '600px',
              maxWidth: '700px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
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
                color: '#1F2937'
              }}>
                Add to Team
              </h3>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0'
            }}>
              {/* Team Selector */}
              <div ref={dropdownRef} style={{ flex: '1', minWidth: '200px', position: 'relative' }}>
                <button
                  onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                  disabled={isAddingTeam}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    cursor: isAddingTeam ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '40px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>
                      {availableTeams.find(t => t.id === selectedTeam)?.name || 'Select team'}
                    </span>
                    {availableTeams.find(t => t.id === selectedTeam) && (
                      <span style={{
                        fontSize: '11px',
                        color: '#6B7280',
                        backgroundColor: '#F3F4F6',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {getTeamScopeLabel(availableTeams.find(t => t.id === selectedTeam)!)}
                      </span>
                    )}
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showTeamDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {availableTeams
                      .filter(team => team.active) // Only show active teams
                      .map(team => (
                        <button
                          key={team.id}
                          onClick={() => {
                            setSelectedTeam(team.id);
                            setShowTeamDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: selectedTeam === team.id ? '#F3F4F6' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '14px',
                            textAlign: 'left',
                            height: '32px',
                            justifyContent: 'space-between'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedTeam !== team.id) {
                              e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedTeam !== team.id) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <span>{team.name}</span>
                          <span style={{
                            fontSize: '11px',
                            color: '#6B7280',
                            backgroundColor: '#F3F4F6',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {getTeamScopeLabel(team)}
                          </span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* Date Input */}
              <input
                type="date"
                title="Start date"
                value={teamStartDate}
                onChange={(e) => setTeamStartDate(e.target.value)}
                disabled={isAddingTeam}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF',
                  width: '140px',
                  height: '40px',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  cursor: isAddingTeam ? 'not-allowed' : 'pointer'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleAddDialogCancel}
                disabled={isAddingTeam}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: isAddingTeam ? 'not-allowed' : 'pointer',
                  opacity: isAddingTeam ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDialogSave}
                disabled={!selectedTeam || isAddingTeam}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !selectedTeam || isAddingTeam ? '#9CA3AF' : '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !selectedTeam || isAddingTeam ? 'not-allowed' : 'pointer'
                }}
              >
                {isAddingTeam ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsManager;
