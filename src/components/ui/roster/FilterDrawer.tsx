import React, { useState } from 'react';
import { Squadron } from '../../../utils/squadronService';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import { Pilot } from '../../../types/PilotTypes';

export type QualificationFilterMode = 'include' | 'exclude';

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
  qualificationFilters: Record<string, QualificationFilterMode>;
  filtersEnabled: boolean;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatusIds: (ids: string[]) => void;
  setSelectedStandingIds: (ids: string[]) => void;
  setSelectedRoleIds: (ids: string[]) => void;
  setQualificationFilters: (filters: Record<string, QualificationFilterMode>) => void;
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
  qualificationFilters,
  filtersEnabled,
  setSelectedSquadronIds,
  setSelectedStatusIds,
  setSelectedStandingIds,
  setSelectedRoleIds,
  setQualificationFilters,
  setFiltersEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper functions for calculating pilot counts
  const getSquadronPilotCount = (squadronId: string) => {
    if (squadronId === 'unassigned') {
      return pilots.filter(pilot => {
        const squad = (pilot as any).currentSquadron || (pilot as any).squadron;
        return !squad?.id;
      }).length;
    }
    return pilots.filter(pilot => {
      const squad = (pilot as any).currentSquadron || (pilot as any).squadron;
      return squad?.id === squadronId;
    }).length;
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
    return pilots.filter(pilot => {
      const pilotId = (pilot as any).id || (pilot as any).pilot_id;
      // Check in allPilotQualifications map
      if (allPilotQualifications[pilotId]?.some(pq => pq.qualification?.id === qualificationId)) {
        return true;
      }
      // Also check if pilot has qualifications array directly (EnrolledPilot structure)
      return (pilot as any).qualifications?.some((q: any) => q.qualification?.id === qualificationId);
    }).length;
  };

  const clearAllFilters = () => {
    setSelectedSquadronIds([]);
    setSelectedStatusIds([]);
    setSelectedStandingIds([]);
    setSelectedRoleIds([]);
    setQualificationFilters({});
  };

  const toggleSquadron = (id: string) => {
    if (selectedSquadronIds.includes(id)) {
      setSelectedSquadronIds(selectedSquadronIds.filter(i => i !== id));
    } else {
      setSelectedSquadronIds([...selectedSquadronIds, id]);
    }
  };

  const toggleQualification = (id: string) => {
    const currentMode = qualificationFilters[id];
    const newFilters = { ...qualificationFilters };
    
    if (!currentMode) {
      // Not filtered -> include (must have)
      newFilters[id] = 'include';
    } else if (currentMode === 'include') {
      // Include -> exclude (must not have)
      newFilters[id] = 'exclude';
    } else {
      // Exclude -> not filtered (remove)
      delete newFilters[id];
    }
    
    setQualificationFilters(newFilters);
  };

  const hasActiveFilters = selectedSquadronIds.length > 0 || 
    selectedStatusIds.length > 0 || 
    selectedStandingIds.length > 0 || 
    selectedRoleIds.length > 0 || 
    Object.keys(qualificationFilters).length > 0;

  // Create combined squadron list with "Unassigned" option at the bottom
  const squadronsWithUnassigned = [
    ...(Array.isArray(squadrons) ? squadrons : []),
    {
      id: 'unassigned',
      designation: 'Unassigned',
      name: 'Pilots without squadron assignment',
      insignia_url: null
    }
  ];

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      overflow: 'visible'
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div style={{
          padding: '16px',
          overflow: 'visible'
        }}>
          {/* Two column layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            overflow: 'visible'
          }}>
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
              {/* Squadron Filter */}
              <FilterSection 
                title="Squadron"
                items={squadronsWithUnassigned}
                selectedIds={selectedSquadronIds}
                onToggle={toggleSquadron}
                onSelectAll={() => setSelectedSquadronIds(squadronsWithUnassigned.map(s => s.id))}
                onClearAll={() => setSelectedSquadronIds([])}
                renderItem={(squadron, isSelected) => (
                  <>
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
                        backgroundColor: '#E5E7EB',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{ fontSize: '10px', color: '#6B7280' }}>?</span>
                      </div>
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
                      backgroundColor: role.exclusivity_scope && role.exclusivity_scope !== 'none' ? '#F59E0B' : '#6B7280',
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
            <div style={{ overflow: 'visible' }}>
              {/* Qualification Filter */}
              <QualificationFilterSection
                title="Qualification"
                qualifications={Array.isArray(qualifications) ? qualifications : []}
                qualificationFilters={qualificationFilters}
                onToggle={toggleQualification}
                onSelectAll={() => {
                  const newFilters: Record<string, QualificationFilterMode> = {};
                  (Array.isArray(qualifications) ? qualifications : []).forEach(q => newFilters[q.id] = 'include');
                  setQualificationFilters(newFilters);
                }}
                onClearAll={() => setQualificationFilters({})}
                getQualificationPilotCount={getQualificationPilotCount}
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
  const safeItems = Array.isArray(items) ? items : [];

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => setSelectedIds(safeItems.map(i => i.id));
  const clearAll = () => setSelectedIds([]);

  const getDisplayText = () => {
    if (selectedIds.length === 0) return `No ${title.toLowerCase()} selected`;
    if (selectedIds.length === safeItems.length) return `All ${title.toLowerCase()}`;
    if (selectedIds.length === 1) {
      const item = safeItems.find(i => i.id === selectedIds[0]);
      return item ? getDisplayName(item) : '1 selected';
    }
    return `${selectedIds.length} selected`;
  };

  return (
    <div style={{ position: 'relative', overflow: 'visible' }}>
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
          boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1)',
          marginTop: '4px'
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
          
          {safeItems.map(item => (
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

// Three-way toggle component for qualifications
const ThreeWayToggle: React.FC<{ mode: QualificationFilterMode | undefined }> = ({ mode }) => {
  if (!mode) {
    // No filter - show empty checkbox
    return (
      <div style={{
        width: '14px',
        height: '14px',
        border: '1px solid #CBD5E1',
        borderRadius: '3px',
        backgroundColor: '#FFFFFF',
        flexShrink: 0
      }} />
    );
  }
  
  if (mode === 'include') {
    // Include mode - show blue checkmark (transparent border to maintain spacing)
    return (
      <div style={{
        width: '14px',
        height: '14px',
        border: '1px solid transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <span style={{ color: '#3B82F6', fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>
      </div>
    );
  }
  
  // Exclude mode - show red X (transparent border to maintain spacing)
  return (
    <div style={{
      width: '14px',
      height: '14px',
      border: '1px solid transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✕</span>
    </div>
  );
};

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
      maxHeight: '300px',
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

// Qualification filter section with three-way toggle
const QualificationFilterSection: React.FC<{
  title: string;
  qualifications: Qualification[];
  qualificationFilters: Record<string, QualificationFilterMode>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  getQualificationPilotCount: (id: string) => number;
}> = ({ title, qualifications, qualificationFilters, onToggle, onSelectAll, onClearAll, getQualificationPilotCount }) => {
  const safeQualifications = Array.isArray(qualifications) ? qualifications : [];

  return (
  <div style={{ overflow: 'visible' }}>
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
      maxHeight: '300px',
      overflowY: 'auto',
      border: '1px solid #E5E7EB',
      borderRadius: '4px',
      padding: '4px'
    }}>
      {safeQualifications.map(qual => {
        const mode = qualificationFilters[qual.id];
        const isActive = mode !== undefined;
        
        return (
          <div
            key={qual.id}
            onClick={() => onToggle(qual.id)}
            style={{
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: isActive 
                ? (mode === 'include' ? '#EFF6FF' : '#FEF2F2')
                : 'transparent',
              borderRadius: '3px',
              transition: 'background-color 0.2s',
              marginBottom: '2px'
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <ThreeWayToggle mode={mode} />
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
          </div>
        );
      })}
    </div>
  </div>
  );
};

export default FilterDrawer;