import React, { useState } from 'react';
import { Squadron } from '../../../utils/squadronService';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import { Pilot } from '../../../types/PilotTypes';

interface FilterDrawerProps {
  squadrons: Squadron[];
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  qualifications: Qualification[];
  pilots: Pilot[];
  allPilotQualifications: Record<string, any[]>;
  selectedSquadronIds: string[];
  selectedStatusIds: string[];
  selectedStandingIds: string[];
  selectedRoleIds: string[];
  selectedQualificationIds: string[];
  filtersEnabled: boolean;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatusIds: (ids: string[]) => void;
  setSelectedStandingIds: (ids: string[]) => void;
  setSelectedRoleIds: (ids: string[]) => void;
  setSelectedQualificationIds: (ids: string[]) => void;
  setFiltersEnabled: (enabled: boolean) => void;
}

const FilterDrawer: React.FC<FilterDrawerProps> = ({
  squadrons,
  statuses,
  standings,
  roles,
  qualifications,
  pilots,
  allPilotQualifications,
  selectedSquadronIds,
  selectedStatusIds,
  selectedStandingIds,
  selectedRoleIds,
  selectedQualificationIds,
  filtersEnabled,
  setSelectedSquadronIds,
  setSelectedStatusIds,
  setSelectedStandingIds,
  setSelectedRoleIds,
  setSelectedQualificationIds,
  setFiltersEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper functions for getting active filter data
  const getActiveSquadrons = () => squadrons.filter(s => selectedSquadronIds.includes(s.id));
  const getActiveStatuses = () => statuses.filter(s => selectedStatusIds.includes(s.id));
  const getActiveStandings = () => standings.filter(s => selectedStandingIds.includes(s.id));
  const getActiveRoles = () => roles.filter(r => selectedRoleIds.includes(r.id));
  const getActiveQualifications = () => qualifications.filter(q => selectedQualificationIds.includes(q.id));

  // Helper functions for calculating pilot counts
  const getSquadronPilotCount = (squadronId: string) => {
    return pilots.filter(pilot => pilot.currentSquadron?.id === squadronId).length;
  };

  const getStatusPilotCount = (statusId: string) => {
    return pilots.filter(pilot => pilot.currentStatus?.id === statusId).length;
  };

  const getStandingPilotCount = (standingId: string) => {
    return pilots.filter(pilot => pilot.currentStanding?.id === standingId).length;
  };

  const getRolePilotCount = (roleId: string) => {
    return pilots.filter(pilot => 
      pilot.roles?.some(role => role.role?.id === roleId)
    ).length;
  };

  const getQualificationPilotCount = (qualificationId: string) => {
    return pilots.filter(pilot => 
      allPilotQualifications[pilot.id]?.some(pq => pq.qualification?.id === qualificationId)
    ).length;
  };

  const removeSquadron = (id: string) => {
    setSelectedSquadronIds(selectedSquadronIds.filter(i => i !== id));
  };

  const removeStatus = (id: string) => {
    setSelectedStatusIds(selectedStatusIds.filter(i => i !== id));
  };

  const removeStanding = (id: string) => {
    setSelectedStandingIds(selectedStandingIds.filter(i => i !== id));
  };

  const removeRole = (id: string) => {
    setSelectedRoleIds(selectedRoleIds.filter(i => i !== id));
  };

  const removeQualification = (id: string) => {
    setSelectedQualificationIds(selectedQualificationIds.filter(i => i !== id));
  };

  const clearAllFilters = () => {
    setSelectedSquadronIds([]);
    setSelectedStatusIds([]);
    setSelectedStandingIds([]);
    setSelectedRoleIds([]);
    setSelectedQualificationIds([]);
  };

  const toggleSquadron = (id: string) => {
    if (selectedSquadronIds.includes(id)) {
      setSelectedSquadronIds(selectedSquadronIds.filter(i => i !== id));
    } else {
      setSelectedSquadronIds([...selectedSquadronIds, id]);
    }
  };

  const toggleQualification = (id: string) => {
    if (selectedQualificationIds.includes(id)) {
      setSelectedQualificationIds(selectedQualificationIds.filter(i => i !== id));
    } else {
      setSelectedQualificationIds([...selectedQualificationIds, id]);
    }
  };

  const hasActiveFilters = selectedSquadronIds.length > 0 || 
    selectedStatusIds.length > 0 || 
    selectedStandingIds.length > 0 || 
    selectedRoleIds.length > 0 || 
    selectedQualificationIds.length > 0;

  return (
    <div style={{
      backgroundColor: '#FFFFFF'
    }}>
      {/* Drawer header with active filters */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
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
                      backgroundColor: filtersEnabled ? '#EFF6FF' : '#F3F4F6',
                      border: '1px solid ' + (filtersEnabled ? '#DBEAFE' : '#D1D5DB'),
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: filtersEnabled ? '#1E40AF' : '#6B7280'
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
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#DC2626'
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

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {getActiveSquadrons().map(squadron => (
              <FilterBadge
                key={`squadron-${squadron.id}`}
                label={squadron.designation}
                onRemove={() => removeSquadron(squadron.id)}
                color="#3B82F6"
              />
            ))}
            {getActiveStatuses().map(status => (
              <FilterBadge
                key={`status-${status.id}`}
                label={status.name}
                onRemove={() => removeStatus(status.id)}
                color={status.isActive ? '#10B981' : '#EF4444'}
              />
            ))}
            {getActiveStandings().map(standing => (
              <FilterBadge
                key={`standing-${standing.id}`}
                label={standing.name}
                onRemove={() => removeStanding(standing.id)}
                color="#8B5CF6"
              />
            ))}
            {getActiveRoles().map(role => (
              <FilterBadge
                key={`role-${role.id}`}
                label={role.name}
                onRemove={() => removeRole(role.id)}
                color={role.isExclusive ? '#F59E0B' : '#6B7280'}
              />
            ))}
            {getActiveQualifications().map(qual => (
              <FilterBadge
                key={`qual-${qual.id}`}
                label={qual.code}
                onRemove={() => removeQualification(qual.id)}
                color={qual.color || '#6B7280'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div style={{
          padding: '16px',
          animation: 'slideDown 0.2s ease-out'
        }}>
          {/* Two column layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px'
          }}>
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Squadron Filter */}
              <FilterSection 
                title="Squadron"
                items={squadrons}
                selectedIds={selectedSquadronIds}
                onToggle={toggleSquadron}
                onSelectAll={() => setSelectedSquadronIds(squadrons.map(s => s.id))}
                onClearAll={() => setSelectedSquadronIds([])}
                renderItem={(squadron, isSelected) => (
                  <>
                    <Checkbox isSelected={isSelected} />
                    {squadron.insignia_url && (
                      <div style={{
                        width: '20px',
                        height: '20px',
                        backgroundImage: `url(${squadron.insignia_url})`,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        flexShrink: 0
                      }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'Inter' }}>
                        {squadron.designation}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'Inter' }}>
                        {squadron.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter', marginLeft: 'auto' }}>
                      ({getSquadronPilotCount(squadron.id)})
                    </span>
                  </>
                )}
              />
              
              {/* Status Dropdown */}
              <MultiSelectDropdown
                title="Status"
                items={statuses}
                selectedIds={selectedStatusIds}
                setSelectedIds={setSelectedStatusIds}
                getDisplayName={(status) => status.name}
                renderItem={(status) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: status.isActive ? '#10B981' : '#EF4444',
                      flexShrink: 0
                    }} />
                    <span style={{ flex: 1 }}>{status.name}</span>
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter' }}>
                      ({getStatusPilotCount(status.id)})
                    </span>
                  </div>
                )}
              />
              
              {/* Standing Dropdown */}
              <MultiSelectDropdown
                title="Standing"
                items={standings}
                selectedIds={selectedStandingIds}
                setSelectedIds={setSelectedStandingIds}
                getDisplayName={(standing) => standing.name}
                renderItem={(standing) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>{standing.name}</span>
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter' }}>
                      ({getStandingPilotCount(standing.id)})
                    </span>
                  </div>
                )}
              />
              
              {/* Role Dropdown */}
              <MultiSelectDropdown
                title="Role"
                items={roles}
                selectedIds={selectedRoleIds}
                setSelectedIds={setSelectedRoleIds}
                getDisplayName={(role) => role.name}
                renderItem={(role) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      backgroundColor: role.isExclusive ? '#F59E0B' : '#6B7280',
                      flexShrink: 0
                    }} />
                    <span style={{ flex: 1 }}>{role.name}</span>
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter' }}>
                      ({getRolePilotCount(role.id)})
                    </span>
                  </div>
                )}
              />
            </div>
            
            {/* Right Column */}
            <div>
              {/* Qualification Filter */}
              <FilterSection 
                title="Qualification"
                items={qualifications}
                selectedIds={selectedQualificationIds}
                onToggle={toggleQualification}
                onSelectAll={() => setSelectedQualificationIds(qualifications.map(q => q.id))}
                onClearAll={() => setSelectedQualificationIds([])}
                renderItem={(qual, isSelected) => (
                  <>
                    <Checkbox isSelected={isSelected} />
                    <div style={{
                      minWidth: '20px',
                      height: '14px',
                      backgroundColor: qual.color || '#6B7280',
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: '0 2px'
                    }}>
                      <span style={{ fontSize: '8px', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 500 }}>
                        {qual.code}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', fontFamily: 'Inter', flex: 1 }}>
                      {qual.name}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter', marginLeft: 'auto' }}>
                      ({getQualificationPilotCount(qual.id)})
                    </span>
                  </>
                )}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 400px;
          }
        }
      `}</style>
    </div>
  );
};

// Filter badge component with removal
const FilterBadge: React.FC<{
  label: string;
  onRemove: () => void;
  color: string;
}> = ({ label, onRemove, color }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    backgroundColor: color + '20',
    border: '1px solid ' + color + '40',
    borderRadius: '12px',
    padding: '2px 6px',
    gap: '4px',
    fontSize: '11px',
    fontFamily: 'Inter'
  }}>
    <span style={{ color: color, fontWeight: 500 }}>{label}</span>
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      style={{
        background: 'none',
        border: 'none',
        color: color,
        cursor: 'pointer',
        fontSize: '10px',
        padding: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '12px',
        height: '12px'
      }}
    >
      ×
    </button>
  </div>
);

// Multi-select dropdown component
const MultiSelectDropdown: React.FC<{
  title: string;
  items: any[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  getDisplayName: (item: any) => string;
  renderItem: (item: any) => React.ReactNode;
}> = ({ title, items, selectedIds, setSelectedIds, getDisplayName, renderItem }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => setSelectedIds(items.map(i => i.id));
  const clearAll = () => setSelectedIds([]);

  const getDisplayText = () => {
    if (selectedIds.length === 0) return `No ${title.toLowerCase()} selected`;
    if (selectedIds.length === items.length) return `All ${title.toLowerCase()}`;
    if (selectedIds.length === 1) {
      const item = items.find(i => i.id === selectedIds[0]);
      return item ? getDisplayName(item) : '1 selected';
    }
    return `${selectedIds.length} selected`;
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <h4 style={{
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: 'Inter',
          color: '#374151',
          margin: 0
        }}>
          {title}
        </h4>
      </div>
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 12px',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          backgroundColor: '#F8FAFC',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontFamily: 'Inter'
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
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ padding: '8px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '8px' }}>
            <button onClick={selectAll} style={{
              padding: '4px 8px', backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE',
              borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter', color: '#1E40AF'
            }}>
              All
            </button>
            <button onClick={clearAll} style={{
              padding: '4px 8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter', color: '#DC2626'
            }}>
              None
            </button>
          </div>
          
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: selectedIds.includes(item.id) ? '#EFF6FF' : 'transparent',
                transition: 'background-color 0.2s',
                fontSize: '12px',
                fontFamily: 'Inter'
              }}
              onMouseEnter={e => {
                if (!selectedIds.includes(item.id)) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }
              }}
              onMouseLeave={e => {
                if (!selectedIds.includes(item.id)) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <Checkbox isSelected={selectedIds.includes(item.id)} />
              {renderItem(item)}
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
    border: '1px solid #CBD5E1',
    borderRadius: '3px',
    backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
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

// Filter section component (for Squadron and Qualification)
const FilterSection: React.FC<{
  title: string;
  items: any[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  renderItem: (item: any, isSelected: boolean) => React.ReactNode;
}> = ({ title, items, selectedIds, onToggle, onSelectAll, onClearAll, renderItem }) => (
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
        fontFamily: 'Inter',
        color: '#374151',
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onSelectAll} style={{
          padding: '2px 6px', backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE',
          borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter', color: '#1E40AF'
        }}>
          All
        </button>
        <button onClick={onClearAll} style={{
          padding: '2px 6px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter', color: '#DC2626'
        }}>
          None
        </button>
      </div>
    </div>
    <div style={{
      maxHeight: '200px',
      overflowY: 'auto',
      border: '1px solid #E5E7EB',
      borderRadius: '4px',
      padding: '4px'
    }}>
      {items.map(item => (
        <div
          key={item.id}
          onClick={() => onToggle(item.id)}
          style={{
            padding: '6px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: selectedIds.includes(item.id) ? '#EFF6FF' : 'transparent',
            borderRadius: '3px',
            transition: 'background-color 0.2s',
            marginBottom: '2px'
          }}
          onMouseEnter={e => {
            if (!selectedIds.includes(item.id)) {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }
          }}
          onMouseLeave={e => {
            if (!selectedIds.includes(item.id)) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          {renderItem(item, selectedIds.includes(item.id))}
        </div>
      ))}
    </div>
  </div>
);

export default FilterDrawer;