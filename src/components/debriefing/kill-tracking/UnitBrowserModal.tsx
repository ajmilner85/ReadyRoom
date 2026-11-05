import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../../ui/primitives';
import { supabase } from '../../../utils/supabaseClient';

interface DCSUnitType {
  id: string;
  type_name: string;
  display_name: string;
  category: 'AIRPLANE' | 'HELICOPTER' | 'GROUND_UNIT' | 'SHIP' | 'STRUCTURE' | 'HELIPORT' | 'CARGO' | 'UNKNOWN';
  sub_category?: string | null;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  source: 'DCS' | 'Manual';
  is_active: boolean;
}

interface UnitBrowserModalProps {
  killCategory: 'A2A' | 'A2G' | 'A2S';
  onSelectUnit: (unitId: string) => void;
  onClose: () => void;
}

/**
 * Full DCS reference browser modal
 * Based on DCSReferenceSettings but streamlined for unit selection
 * Pre-filtered by kill category, no kill category filter/column
 */
const UnitBrowserModal: React.FC<UnitBrowserModalProps> = ({
  killCategory,
  onSelectUnit,
  onClose
}) => {
  const [units, setUnits] = useState<DCSUnitType[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<DCSUnitType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [subCategoryFilter, setSubCategoryFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [sortColumn, setSortColumn] = useState<'display_name' | 'type_name'>('display_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showSubCategoryFilter, setShowSubCategoryFilter] = useState(false);
  const [showSourceFilter, setShowSourceFilter] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Calculate items per page based on available height
  useEffect(() => {
    const calculateItemsPerPage = () => {
      const rowHeight = 48;
      const headerHeight = 45;
      const paginationHeight = 48;
      const modalPadding = 48;
      const headerRowHeight = 70;
      const titleHeight = 60;
      const margins = 24;

      const viewportHeight = window.innerHeight;
      const usedHeight = titleHeight + modalPadding + headerRowHeight + headerHeight + paginationHeight + margins;
      const availableHeight = viewportHeight * 0.85 - usedHeight;

      const calculatedItems = Math.floor(availableHeight / rowHeight);
      const items = Math.max(5, Math.min(calculatedItems, 20));

      setItemsPerPage(items);
    };

    calculateItemsPerPage();
    window.addEventListener('resize', calculateItemsPerPage);
    return () => window.removeEventListener('resize', calculateItemsPerPage);
  }, []);

  // Load units
  useEffect(() => {
    loadUnits();
  }, [killCategory]);

  // Filter units
  useEffect(() => {
    filterUnits();
  }, [units, searchQuery, categoryFilter, subCategoryFilter, sourceFilter]);

  const loadUnits = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('dcs_unit_types')
        .select('*')
        .eq('kill_category', killCategory)
        .eq('is_active', true)
        .order('display_name');

      if (error) throw error;

      setUnits(data as DCSUnitType[] || []);
    } catch (err) {
      console.error('Failed to load units:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterUnits = () => {
    let filtered = [...units];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        u =>
          u.display_name.toLowerCase().includes(query) ||
          u.type_name.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter.length > 0) {
      filtered = filtered.filter(u => categoryFilter.includes(u.category));
    }

    // Sub-category filter
    if (subCategoryFilter.length > 0) {
      filtered = filtered.filter(u => {
        if (subCategoryFilter.includes('none')) {
          return !u.sub_category || subCategoryFilter.includes(u.sub_category || '');
        }
        return u.sub_category && subCategoryFilter.includes(u.sub_category);
      });
    }

    // Source filter
    if (sourceFilter.length > 0) {
      filtered = filtered.filter(u => sourceFilter.includes(u.source));
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = sortColumn === 'display_name' ? a.display_name : a.type_name;
        const bVal = sortColumn === 'display_name' ? b.display_name : b.type_name;
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    setFilteredUnits(filtered);
    setCurrentPage(1);
  };

  const toggleFilter = (filterType: 'category' | 'subCategory' | 'source') => {
    if (filterType === 'category') {
      setShowCategoryFilter(!showCategoryFilter);
      setShowSubCategoryFilter(false);
      setShowSourceFilter(false);
    } else if (filterType === 'subCategory') {
      setShowSubCategoryFilter(!showSubCategoryFilter);
      setShowCategoryFilter(false);
      setShowSourceFilter(false);
    } else if (filterType === 'source') {
      setShowSourceFilter(!showSourceFilter);
      setShowCategoryFilter(false);
      setShowSubCategoryFilter(false);
    }
  };

  const handleFilterChange = (
    filterType: 'category' | 'subCategory' | 'source',
    value: string
  ) => {
    if (filterType === 'category') {
      setCategoryFilter(prev =>
        prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
      );
    } else if (filterType === 'subCategory') {
      setSubCategoryFilter(prev =>
        prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
      );
    } else if (filterType === 'source') {
      setSourceFilter(prev =>
        prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
      );
    }
  };

  const handleSort = (column: 'display_name' | 'type_name') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Pagination
  const totalPages = Math.ceil(filteredUnits.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUnits = filteredUnits.slice(startIndex, startIndex + itemsPerPage);

  // Get unique values for filters
  const uniqueCategories = Array.from(new Set(units.map(u => u.category)));
  const uniqueSubCategories = Array.from(new Set(units.map(u => u.sub_category).filter(Boolean))) as string[];
  const uniqueSources = Array.from(new Set(units.map(u => u.source)));

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
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '85vh',
          backgroundColor: 'var(--rr-panel)',
          borderRadius: '10px',
          boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--rr-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--rr-text)'
            }}
          >
            Select {killCategory} Unit
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--rr-text2)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--rr-border)'
          }}
        >
          <div style={{ position: 'relative' }}>
            <Icon name="search"
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--rr-text2)'
              }}
            />
            <input
              type="text"
              placeholder="Search by name or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                border: '1px solid var(--rr-border2)',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--rr-accent)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--rr-border2)';
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div
          ref={tableContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 24px'
          }}
        >
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--rr-text2)' }}>
              Loading units...
            </div>
          ) : filteredUnits.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--rr-text2)' }}>
              No units found matching your filters
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--rr-panel)', zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid var(--rr-border)' }}>
                  {/* Display Name - Sortable */}
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'var(--rr-text2)', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', backgroundColor: 'var(--rr-panel)' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('display_name')}
                    >
                      Display Name
                      {sortColumn === 'display_name' && (
                        sortDirection === 'asc' ? <Icon name="chevronUp" size={12} /> : <Icon name="chevronDown" size={12} />
                      )}
                    </div>
                  </th>

                  {/* Type Name - Sortable */}
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'var(--rr-text2)', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', backgroundColor: 'var(--rr-panel)' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('type_name')}
                    >
                      Type Name
                      {sortColumn === 'type_name' && (
                        sortDirection === 'asc' ? <Icon name="chevronUp" size={12} /> : <Icon name="chevronDown" size={12} />
                      )}
                    </div>
                  </th>

                  {/* Category - Filterable */}
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'var(--rr-text2)', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', backgroundColor: 'var(--rr-panel)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Category
                      <button
                        onClick={() => toggleFilter('category')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          color: categoryFilter.length > 0 ? 'var(--rr-accent-text)' : 'var(--rr-text2)'
                        }}
                      >
                        <Icon name="filter" size={12} />
                      </button>
                    </div>
                    {showCategoryFilter && (
                      <div data-filter-dropdown="category" style={{
                        position: 'absolute',
                        top: '100%',
                        left: '0',
                        minWidth: '200px',
                        backgroundColor: 'var(--rr-panel)',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '4px',
                        boxShadow: 'var(--rr-shadow)',
                        zIndex: 1000,
                        maxHeight: '300px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                          {uniqueCategories.map(category => (
                            <div key={category} style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid var(--rr-border)',
                              fontSize: '12px',
                              cursor: 'pointer',
                              backgroundColor: categoryFilter.includes(category) ? 'var(--rr-accent-weak)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={() => handleFilterChange('category', category)}>
                              <input
                                type="checkbox"
                                checked={categoryFilter.includes(category)}
                                onChange={() => {}}
                                style={{ pointerEvents: 'none' }}
                              />
                              {category}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Sub-Category - Filterable */}
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'var(--rr-text2)', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', backgroundColor: 'var(--rr-panel)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Sub-Category
                      <button
                        onClick={() => toggleFilter('subCategory')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          color: subCategoryFilter.length > 0 ? 'var(--rr-accent-text)' : 'var(--rr-text2)'
                        }}
                      >
                        <Icon name="filter" size={12} />
                      </button>
                    </div>
                    {showSubCategoryFilter && (
                      <div data-filter-dropdown="sub-category" style={{
                        position: 'absolute',
                        top: '100%',
                        left: '0',
                        minWidth: '200px',
                        backgroundColor: 'var(--rr-panel)',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '4px',
                        boxShadow: 'var(--rr-shadow)',
                        zIndex: 1000,
                        maxHeight: '300px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                          <div style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--rr-border)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            backgroundColor: subCategoryFilter.includes('none') ? 'var(--rr-accent-weak)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onClick={() => handleFilterChange('subCategory', 'none')}>
                            <input
                              type="checkbox"
                              checked={subCategoryFilter.includes('none')}
                              onChange={() => {}}
                              style={{ pointerEvents: 'none' }}
                            />
                            (None)
                          </div>
                          {uniqueSubCategories.map(subCat => (
                            <div key={subCat} style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid var(--rr-border)',
                              fontSize: '12px',
                              cursor: 'pointer',
                              backgroundColor: subCategoryFilter.includes(subCat) ? 'var(--rr-accent-weak)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={() => handleFilterChange('subCategory', subCat)}>
                              <input
                                type="checkbox"
                                checked={subCategoryFilter.includes(subCat)}
                                onChange={() => {}}
                                style={{ pointerEvents: 'none' }}
                              />
                              {subCat}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>

                  {/* Source - Filterable */}
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: 'var(--rr-text2)', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', backgroundColor: 'var(--rr-panel)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Source
                      <button
                        onClick={() => toggleFilter('source')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          color: sourceFilter.length > 0 ? 'var(--rr-accent-text)' : 'var(--rr-text2)'
                        }}
                      >
                        <Icon name="filter" size={12} />
                      </button>
                    </div>
                    {showSourceFilter && (
                      <div data-filter-dropdown="source" style={{
                        position: 'absolute',
                        top: '100%',
                        left: '0',
                        minWidth: '150px',
                        backgroundColor: 'var(--rr-panel)',
                        border: '1px solid var(--rr-border)',
                        borderRadius: '4px',
                        boxShadow: 'var(--rr-shadow)',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <div style={{ flex: 1 }}>
                          {uniqueSources.map(source => (
                            <div key={source} style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid var(--rr-border)',
                              fontSize: '12px',
                              cursor: 'pointer',
                              backgroundColor: sourceFilter.includes(source) ? 'var(--rr-accent-weak)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={() => handleFilterChange('source', source)}>
                              <input
                                type="checkbox"
                                checked={sourceFilter.includes(source)}
                                onChange={() => {}}
                                style={{ pointerEvents: 'none' }}
                              />
                              {source}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedUnits.map((unit) => (
                  <tr
                    key={unit.id}
                    onClick={() => onSelectUnit(unit.id)}
                    style={{
                      borderBottom: '1px solid var(--rr-border)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--rr-text)' }}>
                      {unit.display_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--rr-text2)', fontFamily: 'monospace' }}>
                      {unit.type_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--rr-text2)' }}>
                      {unit.category}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--rr-text2)' }}>
                      {unit.sub_category || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--rr-text2)' }}>
                      {unit.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredUnits.length > 0 && (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--rr-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ fontSize: '14px', color: 'var(--rr-text2)' }}>
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredUnits.length)} of {filteredUnits.length}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === 1 ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: currentPage === 1 ? 'var(--rr-text3)' : 'var(--rr-text2)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              <div style={{ padding: '6px 12px', fontSize: '14px', color: 'var(--rr-text2)' }}>
                Page {currentPage} of {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === totalPages ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: currentPage === totalPages ? 'var(--rr-text3)' : 'var(--rr-text2)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnitBrowserModal;
