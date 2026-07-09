import React, { useState } from 'react';
import type { Award, AwardCategory } from '../../utils/awardService';
import type { DossierCycle, DossierEventOption } from '../../utils/dossierService';

// Filter drawer for the Award Library — pattern and styling copied from the
// roster management FilterDrawer (three-way include/exclude toggles, All/None
// buttons, ON/OFF + Clear All header controls).

export type CategoryFilterMode = 'include' | 'exclude';

export interface AwardLibraryFilters {
  categoryModes: Record<string, CategoryFilterMode>;
  uniqueness: 'all' | 'unique' | 'repeatable';
  issued: 'all' | 'issued' | 'not-issued';
  issuedFrom: string; // YYYY-MM-DD or ''
  issuedTo: string;
  cycleId: string;
  eventId: string;
}

export const EMPTY_AWARD_FILTERS: AwardLibraryFilters = {
  categoryModes: {},
  uniqueness: 'all',
  issued: 'all',
  issuedFrom: '',
  issuedTo: '',
  cycleId: '',
  eventId: ''
};

export function hasActiveAwardFilters(filters: AwardLibraryFilters): boolean {
  return Object.keys(filters.categoryModes).length > 0
    || filters.uniqueness !== 'all'
    || filters.issued !== 'all'
    || !!filters.issuedFrom
    || !!filters.issuedTo
    || !!filters.cycleId;
}

interface AwardFilterDrawerProps {
  categories: AwardCategory[];
  awards: Award[];
  cycles: DossierCycle[];
  cycleEvents: DossierEventOption[]; // events of filters.cycleId
  filters: AwardLibraryFilters;
  filtersEnabled: boolean;
  setFilters: (filters: AwardLibraryFilters) => void;
  setFiltersEnabled: (enabled: boolean) => void;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  backgroundColor: '#F8FAFC',
  fontSize: '12px',
  fontFamily: 'Inter',
  boxSizing: 'border-box'
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter',
  color: '#374151',
  margin: 0
};

// Custom single-select dropdown — same look as the roster FilterDrawer's
// MultiSelectDropdown (native <select> option lists can't be font-styled).
interface StyledSelectOption {
  value: string;
  label: string;
}

const StyledSelect: React.FC<{
  value: string;
  options: StyledSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <div style={{ position: 'relative', overflow: 'visible', opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
        style={{
          padding: '8px 12px',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          backgroundColor: '#F8FAFC',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontFamily: 'Inter'
        }}
      >
        <span>{selected?.label || options[0]?.label || ''}</span>
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
          {options.map(option => (
            <div
              key={option.value}
              onClick={() => { onChange(option.value); setIsOpen(false); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: option.value === value ? '#EFF6FF' : 'transparent',
                transition: 'background-color 0.2s',
                fontSize: '12px',
                fontFamily: 'Inter'
              }}
              onMouseEnter={e => {
                if (option.value !== value) e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={e => {
                if (option.value !== value) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Three-way toggle indicator (unfiltered / include / exclude)
const ThreeWayToggle: React.FC<{ mode: CategoryFilterMode | undefined }> = ({ mode }) => {
  if (!mode) {
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
      {mode === 'include' ? (
        <span style={{ color: '#3B82F6', fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>
      ) : (
        <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✕</span>
      )}
    </div>
  );
};

const AwardFilterDrawer: React.FC<AwardFilterDrawerProps> = ({
  categories,
  awards,
  cycles,
  cycleEvents,
  filters,
  filtersEnabled,
  setFilters,
  setFiltersEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActive = hasActiveAwardFilters(filters);

  const getCategoryAwardCount = (categoryId: string) =>
    awards.filter(a => a.category_id === categoryId).length;

  const toggleCategory = (id: string) => {
    const currentMode = filters.categoryModes[id];
    const newModes = { ...filters.categoryModes };
    if (!currentMode) {
      newModes[id] = 'include';
    } else if (currentMode === 'include') {
      newModes[id] = 'exclude';
    } else {
      delete newModes[id];
    }
    setFilters({ ...filters, categoryModes: newModes });
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      overflow: 'visible',
      marginBottom: '16px'
    }}>
      {/* Drawer header */}
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
            <div style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
              </svg>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {hasActive && (
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
                      setFilters(EMPTY_AWARD_FILTERS);
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

      {/* Expandable content — three columns to favor horizontal space */}
      {isExpanded && (
        <div style={{ padding: '16px', overflow: 'visible' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '24px', overflow: 'visible' }}>
            {/* Left: category three-way filter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={sectionTitleStyle}>Category</h4>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      const newModes: Record<string, CategoryFilterMode> = {};
                      categories.forEach(c => { newModes[c.id] = 'include'; });
                      setFilters({ ...filters, categoryModes: newModes });
                    }}
                    style={{
                      padding: '2px 6px', backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE',
                      borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter', color: '#1E40AF'
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilters({ ...filters, categoryModes: {} })}
                    style={{
                      padding: '2px 6px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
                      borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter', color: '#DC2626'
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: '4px',
                padding: '4px'
              }}>
                {categories.map(category => {
                  const mode = filters.categoryModes[category.id];
                  const isActive = mode !== undefined;
                  return (
                    <div
                      key={category.id}
                      onClick={() => toggleCategory(category.id)}
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
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <ThreeWayToggle mode={mode} />
                      <span style={{ fontSize: '12px', fontFamily: 'Inter', flex: 1 }}>
                        {category.name}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'Inter', marginLeft: 'auto' }}>
                        ({getCategoryAwardCount(category.id)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Middle: uniqueness, issued state, date range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'visible' }}>
              <div style={{ overflow: 'visible' }}>
                <h4 style={{ ...sectionTitleStyle, marginBottom: '8px' }}>Type</h4>
                <StyledSelect
                  value={filters.uniqueness}
                  onChange={(value) => setFilters({ ...filters, uniqueness: value as AwardLibraryFilters['uniqueness'] })}
                  options={[
                    { value: 'all', label: 'All awards' },
                    { value: 'unique', label: 'Unique only' },
                    { value: 'repeatable', label: 'Repeatable only' }
                  ]}
                />
              </div>

              <div style={{ overflow: 'visible' }}>
                <h4 style={{ ...sectionTitleStyle, marginBottom: '8px' }}>Issued</h4>
                <StyledSelect
                  value={filters.issued}
                  onChange={(value) => setFilters({ ...filters, issued: value as AwardLibraryFilters['issued'] })}
                  options={[
                    { value: 'all', label: 'Issued & not issued' },
                    { value: 'issued', label: 'Issued at least once' },
                    { value: 'not-issued', label: 'Never issued' }
                  ]}
                />
              </div>

              <div>
                <h4 style={{ ...sectionTitleStyle, marginBottom: '8px' }}>Issued Between</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="date"
                    value={filters.issuedFrom}
                    onChange={(e) => setFilters({ ...filters, issuedFrom: e.target.value })}
                    style={selectStyle}
                  />
                  <input
                    type="date"
                    value={filters.issuedTo}
                    onChange={(e) => setFilters({ ...filters, issuedTo: e.target.value })}
                    style={selectStyle}
                  />
                </div>
              </div>
            </div>

            {/* Right: cycle / event linkage */}
            <div style={{ overflow: 'visible' }}>
              <h4 style={{ ...sectionTitleStyle, marginBottom: '8px' }}>Issued During</h4>
              <StyledSelect
                value={filters.cycleId}
                onChange={(value) => setFilters({ ...filters, cycleId: value, eventId: '' })}
                options={[
                  { value: '', label: 'Any cycle' },
                  ...cycles.map(cycle => ({ value: cycle.id, label: cycle.name }))
                ]}
              />
              <div style={{ marginTop: '8px', overflow: 'visible' }}>
                <StyledSelect
                  value={filters.eventId}
                  onChange={(value) => setFilters({ ...filters, eventId: value })}
                  disabled={!filters.cycleId}
                  options={[
                    { value: '', label: 'Any event in cycle' },
                    ...cycleEvents.map(event => ({ value: event.id, label: event.name || 'Unnamed event' }))
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AwardFilterDrawer;
