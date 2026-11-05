import React, { useState } from 'react';
import type { Squadron } from '../../utils/squadronService';

interface MissionFilterDrawerProps {
  cycles: Array<{ id: string; name: string }>;
  squadrons: Squadron[];
  missions: Array<any>; // Add missions to calculate counts
  selectedCycleId: string;
  selectedSquadronIds: string[];
  selectedStatus: string;
  startDate: string;
  endDate: string;
  filtersEnabled: boolean;
  setSelectedCycleId: (id: string) => void;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatus: (status: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setFiltersEnabled: (enabled: boolean) => void;
}

const MISSION_OUTCOMES = [
  { value: '', label: 'All Outcomes' },
  { value: 'pending', label: 'Pending' },
  { value: 'success', label: 'Success' },
  { value: 'partial_success', label: 'Partial Success' },
  { value: 'failure', label: 'Failure' }
];

const MissionFilterDrawer: React.FC<MissionFilterDrawerProps> = ({
  cycles,
  squadrons,
  missions,
  selectedCycleId,
  selectedSquadronIds,
  selectedStatus,
  startDate,
  endDate,
  filtersEnabled,
  setSelectedCycleId,
  setSelectedSquadronIds,
  setSelectedStatus,
  setStartDate,
  setEndDate,
  setFiltersEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Ensure squadrons and cycles are always arrays
  const safeSquadrons = Array.isArray(squadrons) ? squadrons : [];
  const safeCycles = Array.isArray(cycles) ? cycles : [];
  const safeMissions = Array.isArray(missions) ? missions : [];

  const toggleSquadron = (id: string) => {
    if (selectedSquadronIds.includes(id)) {
      setSelectedSquadronIds(selectedSquadronIds.filter(i => i !== id));
    } else {
      setSelectedSquadronIds([...selectedSquadronIds, id]);
    }
  };

  // Count missions per squadron
  const getSquadronMissionCount = (squadronId: string) => {
    const count = safeMissions.filter(m => {
      // Check if squadron is in the participating_squadron_ids array
      const participating = (m as any).participating_squadron_ids || [];
      const isParticipating = participating.includes(squadronId);
      return isParticipating;
    }).length;
    return count;
  };

  // Count missions per cycle
  const getCycleMissionCount = (cycleId: string) => {
    if (cycleId === 'standalone') {
      // Count missions without a cycle
      return safeMissions.filter(m => !m.cycle_id).length;
    }
    return safeMissions.filter(m => m.cycle_id === cycleId).length;
  };

  // Count missions per outcome - use mission outcome from mission_debriefings table
  const getOutcomeMissionCount = (outcome: string) => {
    if (!outcome) return safeMissions.length;
    return safeMissions.filter(m => {
      const debriefing = Array.isArray(m.mission_debriefings)
        ? m.mission_debriefings[0]
        : m.mission_debriefings;
      const missionOutcome = debriefing?.mission_outcome || 'pending'; // Treat NULL as pending
      return missionOutcome === outcome;
    }).length;
  };

  const hasActiveFilters =
    selectedCycleId !== '' ||
    selectedSquadronIds.length > 0 ||
    selectedStatus !== '' ||
    startDate !== '' ||
    endDate !== '';

  const clearAllFilters = () => {
    setSelectedCycleId('');
    setSelectedSquadronIds([]);
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div style={{ backgroundColor: 'var(--rr-panel)' }}>
      {/* Drawer header with active filters */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid var(--rr-border)' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasActiveFilters ? '8px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Filter icon */}
            <div style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
              </svg>
            </div>

            {/* Toggle and Clear buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {hasActiveFilters && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiltersEnabled(!filtersEnabled);
                    }}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: filtersEnabled ? 'var(--rr-accent-weak)' : 'var(--rr-panel2)',
                      border: '1px solid ' + (filtersEnabled ? 'var(--rr-accent)' : 'var(--rr-border2)'),
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: filtersEnabled ? 'var(--rr-accent-text)' : 'var(--rr-text2)'
                    }}
                  >
                    {filtersEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAllFilters();
                    }}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'rgba(224,82,78,.12)',
                      border: '1px solid var(--rr-bad)',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--rr-bad)'
                    }}
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div style={{ padding: '16px' }}>
          {/* Two column layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px'
          }}>
            {/* Left Column - Squadron */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Squadron Filter */}
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <h4 style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    color: 'var(--rr-text)',
                    margin: 0
                  }}>
                    Squadron
                  </h4>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setSelectedSquadronIds(safeSquadrons.map(s => s.id))}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'var(--rr-accent-weak)',
                        border: '1px solid var(--rr-accent)',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: 'var(--rr-accent-text)'
                      }}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedSquadronIds([])}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(224,82,78,.12)',
                        border: '1px solid var(--rr-bad)',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: 'var(--rr-bad)'
                      }}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--rr-border)',
                  borderRadius: '4px',
                  padding: '4px'
                }}>
                  {safeSquadrons.map(squadron => {
                    const isSelected = selectedSquadronIds.includes(squadron.id);
                    return (
                      <div
                        key={squadron.id}
                        onClick={() => toggleSquadron(squadron.id)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: isSelected ? 'var(--rr-accent-weak)' : 'transparent',
                          transition: 'background-color 0.2s',
                          fontSize: '12px',
                          fontFamily: 'inherit'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Checkbox isSelected={isSelected} />
                        {squadron.insignia_url ? (
                          <div style={{
                            width: '20px',
                            height: '20px',
                            backgroundImage: `url(${squadron.insignia_url})`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                            flexShrink: 0
                          }} />
                        ) : (
                          <div style={{
                            width: '20px',
                            height: '20px',
                            backgroundColor: 'var(--rr-panel3)',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '10px', color: 'var(--rr-text2)' }}>?</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'inherit' }}>
                            {squadron.designation}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--rr-text2)', fontFamily: 'inherit' }}>
                            {squadron.name}
                          </span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--rr-text3)', fontFamily: 'inherit', marginLeft: 'auto' }}>
                          ({getSquadronMissionCount(squadron.id)})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column - Cycle, Date Range, Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Cycle Filter */}
              <SingleSelectDropdown
                title="Cycle"
                options={[
                  { value: '', label: 'All Cycles' },
                  { value: 'standalone', label: 'Standalone Events' },
                  ...safeCycles.map(cycle => ({
                    value: cycle.id,
                    label: cycle.name
                  }))
                ]}
                selectedValue={selectedCycleId}
                setSelectedValue={setSelectedCycleId}
                getCount={getCycleMissionCount}
              />

              {/* Date Range */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Date Range
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--rr-text)',
                      backgroundColor: 'var(--rr-panel2)',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                  <span style={{ color: 'var(--rr-text3)', fontSize: '12px', fontFamily: 'inherit' }}>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--rr-text)',
                      backgroundColor: 'var(--rr-panel2)',
                      border: '1px solid var(--rr-border2)',
                      borderRadius: '6px',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>

              {/* Mission Outcome Filter */}
              <SingleSelectDropdown
                title="Mission Outcome"
                options={MISSION_OUTCOMES}
                selectedValue={selectedStatus}
                setSelectedValue={setSelectedStatus}
                getCount={getOutcomeMissionCount}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Single Select Dropdown component - matches Pilot List filter styling
const SingleSelectDropdown: React.FC<{
  title: string;
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  setSelectedValue: (value: string) => void;
  getCount: (value: string) => number;
}> = ({ title, options, selectedValue, setSelectedValue, getCount }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getDisplayText = () => {
    const option = options.find(o => o.value === selectedValue);
    return option ? option.label : options[0].label;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <h4 style={{
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: 'inherit',
          color: 'var(--rr-text)',
          margin: 0
        }}>
          {title}
        </h4>
      </div>

      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 12px',
          border: '1px solid var(--rr-border2)',
          borderRadius: '6px',
          backgroundColor: 'var(--rr-panel2)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontFamily: 'inherit'
        }}
      >
        <span>{getDisplayText()}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'var(--rr-panel)',
          border: '1px solid var(--rr-border2)',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: 'var(--rr-shadow)',
          marginTop: '4px'
        }}>
          {options.map(option => (
            <div
              key={option.value}
              onClick={() => {
                setSelectedValue(option.value);
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: selectedValue === option.value ? 'var(--rr-accent-weak)' : 'transparent',
                fontSize: '12px',
                fontFamily: 'inherit',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                if (selectedValue !== option.value) {
                  e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedValue !== option.value) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span>{option.label}</span>
              <span style={{ fontSize: '10px', color: 'var(--rr-text3)', fontFamily: 'inherit' }}>
                ({getCount(option.value)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Checkbox component
const Checkbox: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
  <div style={{
    width: '14px',
    height: '14px',
    border: '1px solid var(--rr-border2)',
    borderRadius: '3px',
    backgroundColor: isSelected ? 'var(--rr-accent)' : 'var(--rr-panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }}>
    {isSelected && (
      <span style={{ color: '#FFFFFF', fontSize: '10px' }}>✓</span>
    )}
  </div>
);

// Filter badge component

export default MissionFilterDrawer;
