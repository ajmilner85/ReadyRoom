import React, { useState, useEffect, useRef } from 'react';
import { Upload, Eye, EyeOff, Plus, Edit2, Filter, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { parseLuaUnitDump } from '../../utils/luaParser';
import AddEditUnitDialog from './AddEditUnitDialog';

interface DCSReferenceSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

interface DCSUnitType {
  id?: string;
  type_name: string;
  display_name: string;
  category: 'AIRPLANE' | 'HELICOPTER' | 'GROUND_UNIT' | 'SHIP' | 'STRUCTURE' | 'HELIPORT' | 'CARGO' | 'UNKNOWN';
  sub_category?: string | null;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  source: 'DCS' | 'Manual';
  is_active: boolean;
}

interface SyncStats {
  total: number;
  synced: number;
  errors: number;
  lastSync?: string;
}

const DCSReferenceSettings: React.FC<DCSReferenceSettingsProps> = ({ setError }) => {
  const [units, setUnits] = useState<DCSUnitType[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<DCSUnitType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [subCategoryFilter, setSubCategoryFilter] = useState<string[]>([]);
  const [killCategoryFilter, setKillCategoryFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats>({ total: 0, synced: 0, errors: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddEditDialog, setShowAddEditDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<DCSUnitType | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showSubCategoryFilter, setShowSubCategoryFilter] = useState(false);
  const [showKillCategoryFilter, setShowKillCategoryFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [sortColumn, setSortColumn] = useState<'display_name' | 'type_name' | null>('display_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Calculate items per page based on available height
  useEffect(() => {
    const calculateItemsPerPage = () => {
      const rowHeight = 48; // Height of each table row
      const headerHeight = 45; // Approximate height of table header
      const paginationHeight = 48; // Height of pagination controls
      const containerPadding = 56; // Top and bottom padding of Unit Browser card (24 + 16 + 16)
      const headerRowHeight = 70; // Height of search/filter header row
      const syncSectionHeight = 150; // Approximate height of sync section
      const pageHeaderHeight = 115; // Height of page title section
      const margins = 24; // Margin between sections

      const viewportHeight = window.innerHeight;
      const usedHeight = pageHeaderHeight + syncSectionHeight + margins + containerPadding + headerRowHeight + headerHeight + paginationHeight + 20; // 20px bottom margin
      const availableHeight = viewportHeight - usedHeight;

      const calculatedItems = Math.floor(availableHeight / rowHeight);
      const items = Math.max(5, Math.min(calculatedItems, 20)); // Min 5, max 20 rows

      setItemsPerPage(items);
    };

    // Delay calculation to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      calculateItemsPerPage();
    }, 100);

    window.addEventListener('resize', calculateItemsPerPage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateItemsPerPage);
    };
  }, []);

  useEffect(() => {
    loadUnits();
  }, []);

  useEffect(() => {
    filterUnits();
  }, [units, searchQuery, categoryFilter, subCategoryFilter, killCategoryFilter, statusFilter, sourceFilter]);

  // Click outside handler to close filter dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (componentRef.current && componentRef.current.contains(event.target as Node)) {
        const target = event.target as Element;
        if (!target.closest('[data-filter-dropdown]')) {
          setShowCategoryFilter(false);
          setShowSubCategoryFilter(false);
          setShowKillCategoryFilter(false);
          setShowStatusFilter(false);
          setShowSourceFilter(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadUnits = async () => {
    try {
      setLoading(true);

      // Fetch all units using pagination to bypass the 1000 row limit
      let allUnits: DCSUnitType[] = [];
      let pageSize = 1000;
      let currentPage = 0;
      let hasMore = true;

      while (hasMore) {
        const start = currentPage * pageSize;
        const end = start + pageSize - 1;

        const { data, error } = await supabase
          .from('dcs_unit_types')
          .select('*')
          .order('display_name')
          .range(start, end);

        if (error) throw error;

        if (data && data.length > 0) {
          allUnits = [...allUnits, ...(data as DCSUnitType[])];
          hasMore = data.length === pageSize; // If we got a full page, there might be more
          currentPage++;
        } else {
          hasMore = false;
        }
      }

      console.log(`Loaded ${allUnits.length} units from database across ${currentPage} pages`);

      setUnits(allUnits);

      // Only update total/synced, preserve lastSync from previous sync operation
      setSyncStats(prev => ({
        ...prev,
        total: allUnits.length,
        synced: allUnits.length,
        lastSync: prev.lastSync // Preserve existing lastSync value
      }));
    } catch (err: any) {
      console.error('Failed to load units:', err);
      if (setError) {
        setError(err.message || 'Failed to load unit types');
      }
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

    // Kill category filter
    if (killCategoryFilter.length > 0) {
      filtered = filtered.filter(u => killCategoryFilter.includes(u.kill_category));
    }

    // Status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(u => {
        if (statusFilter.includes('active') && u.is_active) return true;
        if (statusFilter.includes('inactive') && !u.is_active) return true;
        return false;
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

  const processFile = async (file: File) => {
    try {
      setSyncing(true);
      if (setError) setError(null);

      const text = await file.text();
      const parsedUnits = parseLuaUnitDump(text);

      if (parsedUnits.length === 0) {
        throw new Error('No units found in file. Please check the file format.');
      }

      // Sync units to database
      let synced = 0;
      let errors = 0;

      for (const unit of parsedUnits) {
        try {
          const { error } = await supabase.from('dcs_unit_types').upsert(
            {
              type_name: unit.type_name,
              display_name: unit.display_name,
              category: unit.category,
              sub_category: unit.sub_category || null,
              kill_category: unit.kill_category,
              source: 'DCS',
              is_active: unit.is_active
            },
            { onConflict: 'type_name' }
          );

          if (error) {
            console.error(`Failed to sync ${unit.type_name}:`, error);
            errors++;
          } else {
            synced++;
          }
        } catch (err) {
          console.error(`Error syncing ${unit.type_name}:`, err);
          errors++;
        }
      }

      setSyncStats({
        total: parsedUnits.length,
        synced,
        errors,
        lastSync: new Date().toISOString()
      });

      // Reload units
      await loadUnits();

      if (setError) {
        if (errors > 0) {
          setError(`Synced ${synced} units with ${errors} errors. See console for details.`);
        } else {
          setError(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to upload file:', err);
      if (setError) {
        setError(err.message || 'Failed to upload and parse file');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await processFile(file);
    event.target.value = '';
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.endsWith('.lua')) {
      if (setError) setError('Please upload a .lua file');
      return;
    }

    await processFile(file);
  };

  const toggleUnitActive = async (unitId: string, currentActive: boolean) => {
    try {
      const newStatus = !currentActive;

      const { data, error } = await supabase
        .from('dcs_unit_types')
        .update({ is_active: newStatus })
        .eq('id', unitId)
        .select();

      if (error) {
        console.error('Database error toggling unit:', error);
        throw error;
      }

      console.log('Toggle success:', data);

      // Update local state
      setUnits(prev =>
        prev.map(u => (u.id === unitId ? { ...u, is_active: newStatus } : u))
      );
    } catch (err: any) {
      console.error('Failed to toggle unit:', err);
      if (setError) {
        setError(err.message || 'Failed to update unit status');
      }
    }
  };

  const handleAddUnit = () => {
    setEditingUnit(null);
    setShowAddEditDialog(true);
  };

  const handleEditUnit = (unit: DCSUnitType) => {
    if (unit.source === 'DCS') {
      // Don't allow editing DCS units
      return;
    }
    setEditingUnit(unit);
    setShowAddEditDialog(true);
  };

  const handleSaveUnit = async () => {
    await loadUnits();
    setShowAddEditDialog(false);
    setEditingUnit(null);
  };

  // Get unique values for filters
  const uniqueCategories = Array.from(new Set(units.map(u => u.category))).sort();
  const uniqueSubCategories = Array.from(new Set(units.map(u => u.sub_category).filter(Boolean))).sort() as string[];

  // Handle sorting
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
  const endIndex = startIndex + itemsPerPage;
  const currentUnits = filteredUnits.slice(startIndex, endIndex);

  // Pagination controls component (reusable for top and bottom)
  const PaginationControls = () => (
    totalPages > 1 ? (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', paddingTop: '16px' }}>
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          style={{
            padding: '8px 12px',
            backgroundColor: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            color: currentPage === 1 ? '#94A3B8' : '#0F172A'
          }}
        >
          Previous
        </button>
        <span style={{ padding: '8px 12px', fontSize: '14px', color: '#64748B' }}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 12px',
            backgroundColor: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            color: currentPage === totalPages ? '#94A3B8' : '#0F172A'
          }}
        >
          Next
        </button>
      </div>
    ) : null
  );

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'AIRPLANE':
        return { bg: '#DBEAFE', text: '#1D4ED8', border: '#3B82F6' };
      case 'HELICOPTER':
        return { bg: '#E0E7FF', text: '#3730A3', border: '#6366F1' };
      case 'GROUND_UNIT':
        return { bg: '#D1FAE5', text: '#065F46', border: '#10B981' };
      case 'SHIP':
        return { bg: '#CCFBF1', text: '#115E59', border: '#14B8A6' };
      case 'STRUCTURE':
        return { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' };
      case 'HELIPORT':
        return { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' };
      case 'CARGO':
        return { bg: '#FBCFE8', text: '#831843', border: '#EC4899' };
      case 'UNKNOWN':
        return { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' };
      default:
        return { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };
    }
  };

  const getKillCategoryBadgeColor = (killCategory: string) => {
    switch (killCategory) {
      case 'A2A':
        return { bg: '#DBEAFE', text: '#1D4ED8', border: '#3B82F6' };
      case 'A2G':
        return { bg: '#D1FAE5', text: '#065F46', border: '#10B981' };
      case 'A2S':
        return { bg: '#CCFBF1', text: '#115E59', border: '#14B8A6' };
      default:
        return { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };
    }
  };

  return (
    <div ref={componentRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            DCS Reference Data
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Manage DCS World unit database for detailed kill tracking
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Sync Section */}
          <div style={{
            padding: '24px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            marginBottom: '24px',
            width: 'fit-content'
          }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
                  Unit Database Sync
                </h3>

                {/* Stats */}
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Total Units</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{syncStats.total}</div>
                  </div>
                  {syncStats.errors > 0 && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Errors</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>{syncStats.errors}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Drag and drop area on the right */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".lua"
                onChange={handleFileUpload}
                disabled={syncing}
                style={{ display: 'none' }}
              />
              <div
                style={{
                  width: '280px',
                  border: '1px dashed #CBD5E1',
                  borderRadius: '4px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  backgroundColor: '#FFFFFF',
                  transition: 'background-color 0.2s ease'
                }}
                onClick={syncing ? undefined : handleDropZoneClick}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onMouseEnter={(e) => {
                  if (!syncing) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                {syncing ? (
                  <span style={{ fontSize: '14px', color: '#64748B' }}>Syncing...</span>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <Upload size={16} style={{ color: '#64748B' }} />
                      <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 500 }}>
                        Upload unit_dump.lua
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', color: '#64748B', textAlign: 'center' }}>
                      Drag file here or click to browse
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Unit Browser */}
          <div style={{
            padding: '24px 16px 16px 16px',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {/* Header with search, count, and add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px' }}>
              {/* Left side: Title and Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: 0, whiteSpace: 'nowrap' }}>
                  Unit Type Browser
                </h3>
                <div style={{ position: 'relative', width: '250px' }}>
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94A3B8'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Center: Results Count */}
              <div style={{ fontSize: '14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                Showing {filteredUnits.length} of {units.length} units
              </div>

              {/* Right side: Add button */}
              <button
                onClick={handleAddUnit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Plus size={16} />
                Add Unit
              </button>
            </div>

            {/* Unit Table */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                Loading units...
              </div>
            ) : (
              <>
                <div ref={tableContainerRef}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
                      <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                        {/* Status - Filterable (First Column) */}
                        <th style={{ padding: '12px 5px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '40px', backgroundColor: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              onClick={() => setShowStatusFilter(!showStatusFilter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: statusFilter.length > 0 ? '#2563EB' : '#6B7280'
                              }}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                          {showStatusFilter && (
                            <div data-filter-dropdown="status" style={{
                              position: 'absolute',
                              top: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              minWidth: '150px',
                              backgroundColor: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              zIndex: 1000,
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{ flex: 1 }}>
                                {(['active', 'inactive'] as const).map(status => (
                                  <div key={status} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: statusFilter.includes(status) ? '#EFF6FF' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const newSelection = statusFilter.includes(status)
                                      ? statusFilter.filter(s => s !== status)
                                      : [...statusFilter, status];
                                    setStatusFilter(newSelection);
                                  }}
                                  >
                                    <input type="checkbox" checked={statusFilter.includes(status)} readOnly />
                                    <span style={{ textTransform: 'capitalize' }}>{status}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderTop: '1px solid #E5E7EB',
                                backgroundColor: '#F9FAFB',
                                display: 'flex',
                                gap: '8px',
                                justifyContent: 'space-between',
                                flexShrink: 0
                              }}>
                                <button
                                  onClick={() => setStatusFilter(['active', 'inactive'])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setStatusFilter([])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}
                        </th>

                        {/* Display Name - Sortable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '170px', backgroundColor: 'white' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('display_name')}
                          >
                            Display Name
                            {sortColumn === 'display_name' && (
                              sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                            )}
                          </div>
                        </th>

                        {/* Type Name - Sortable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '150px', backgroundColor: 'white' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('type_name')}
                          >
                            Type Name
                            {sortColumn === 'type_name' && (
                              sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                            )}
                          </div>
                        </th>

                        {/* Category - Filterable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '115px', backgroundColor: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Category
                            <button
                              onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: categoryFilter.length > 0 ? '#2563EB' : '#6B7280'
                              }}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                          {showCategoryFilter && (
                            <div data-filter-dropdown="category" style={{
                              position: 'absolute',
                              top: '100%',
                              left: '0',
                              minWidth: '200px',
                              backgroundColor: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              zIndex: 1000,
                              maxHeight: '300px',
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{ flex: 1, overflowY: 'auto' }}>
                                {uniqueCategories.map(category => (
                                  <div key={category} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: categoryFilter.includes(category) ? '#EFF6FF' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const newSelection = categoryFilter.includes(category)
                                      ? categoryFilter.filter(c => c !== category)
                                      : [...categoryFilter, category];
                                    setCategoryFilter(newSelection);
                                  }}
                                  >
                                    <input type="checkbox" checked={categoryFilter.includes(category)} readOnly />
                                    <span>{category}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderTop: '1px solid #E5E7EB',
                                backgroundColor: '#F9FAFB',
                                display: 'flex',
                                gap: '8px',
                                justifyContent: 'space-between',
                                flexShrink: 0
                              }}>
                                <button
                                  onClick={() => setCategoryFilter(uniqueCategories)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setCategoryFilter([])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}
                        </th>

                        {/* Sub-Category - Filterable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '125px', backgroundColor: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Sub-Category
                            <button
                              onClick={() => setShowSubCategoryFilter(!showSubCategoryFilter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: subCategoryFilter.length > 0 ? '#2563EB' : '#6B7280'
                              }}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                          {showSubCategoryFilter && (
                            <div data-filter-dropdown="sub-category" style={{
                              position: 'absolute',
                              top: '100%',
                              left: '0',
                              minWidth: '200px',
                              backgroundColor: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              zIndex: 1000,
                              maxHeight: '300px',
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{ flex: 1, overflowY: 'auto' }}>
                                <div style={{
                                  padding: '8px 12px',
                                  borderBottom: '1px solid #F3F4F6',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  backgroundColor: subCategoryFilter.includes('none') ? '#EFF6FF' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onClick={() => {
                                  const newSelection = subCategoryFilter.includes('none')
                                    ? subCategoryFilter.filter(c => c !== 'none')
                                    : [...subCategoryFilter, 'none'];
                                  setSubCategoryFilter(newSelection);
                                }}
                                >
                                  <input type="checkbox" checked={subCategoryFilter.includes('none')} readOnly />
                                  <span>None</span>
                                </div>
                                {uniqueSubCategories.map(subCat => (
                                  <div key={subCat} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: subCategoryFilter.includes(subCat) ? '#EFF6FF' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const newSelection = subCategoryFilter.includes(subCat)
                                      ? subCategoryFilter.filter(c => c !== subCat)
                                      : [...subCategoryFilter, subCat];
                                    setSubCategoryFilter(newSelection);
                                  }}
                                  >
                                    <input type="checkbox" checked={subCategoryFilter.includes(subCat)} readOnly />
                                    <span>{subCat}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderTop: '1px solid #E5E7EB',
                                backgroundColor: '#F9FAFB',
                                display: 'flex',
                                gap: '8px',
                                justifyContent: 'space-between',
                                flexShrink: 0
                              }}>
                                <button
                                  onClick={() => setSubCategoryFilter(['none', ...uniqueSubCategories])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setSubCategoryFilter([])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}
                        </th>

                        {/* Kill Type - Filterable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '75px', backgroundColor: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Kill Type
                            <button
                              onClick={() => setShowKillCategoryFilter(!showKillCategoryFilter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: killCategoryFilter.length > 0 ? '#2563EB' : '#6B7280'
                              }}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                          {showKillCategoryFilter && (
                            <div data-filter-dropdown="kill-type" style={{
                              position: 'absolute',
                              top: '100%',
                              left: '0',
                              minWidth: '150px',
                              backgroundColor: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              zIndex: 1000,
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{ flex: 1 }}>
                                {(['A2A', 'A2G', 'A2S'] as const).map(killType => (
                                  <div key={killType} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: killCategoryFilter.includes(killType) ? '#EFF6FF' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const newSelection = killCategoryFilter.includes(killType)
                                      ? killCategoryFilter.filter(k => k !== killType)
                                      : [...killCategoryFilter, killType];
                                    setKillCategoryFilter(newSelection);
                                  }}
                                  >
                                    <input type="checkbox" checked={killCategoryFilter.includes(killType)} readOnly />
                                    <span>{killType}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderTop: '1px solid #E5E7EB',
                                backgroundColor: '#F9FAFB',
                                display: 'flex',
                                gap: '8px',
                                justifyContent: 'space-between',
                                flexShrink: 0
                              }}>
                                <button
                                  onClick={() => setKillCategoryFilter(['A2A', 'A2G', 'A2S'])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setKillCategoryFilter([])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}
                        </th>

                        {/* Source - Filterable */}
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', position: 'relative', whiteSpace: 'nowrap', width: '65px', backgroundColor: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Source
                            <button
                              onClick={() => setShowSourceFilter(!showSourceFilter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: sourceFilter.length > 0 ? '#2563EB' : '#6B7280'
                              }}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                          {showSourceFilter && (
                            <div data-filter-dropdown="source" style={{
                              position: 'absolute',
                              top: '100%',
                              left: '0',
                              minWidth: '150px',
                              backgroundColor: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: '4px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              zIndex: 1000,
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{ flex: 1 }}>
                                {(['DCS', 'Manual'] as const).map(source => (
                                  <div key={source} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: sourceFilter.includes(source) ? '#EFF6FF' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => {
                                    const newSelection = sourceFilter.includes(source)
                                      ? sourceFilter.filter(s => s !== source)
                                      : [...sourceFilter, source];
                                    setSourceFilter(newSelection);
                                  }}
                                  >
                                    <input type="checkbox" checked={sourceFilter.includes(source)} readOnly />
                                    <span>{source}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{
                                padding: '8px 12px',
                                borderTop: '1px solid #E5E7EB',
                                backgroundColor: '#F9FAFB',
                                display: 'flex',
                                gap: '8px',
                                justifyContent: 'space-between',
                                flexShrink: 0
                              }}>
                                <button
                                  onClick={() => setSourceFilter(['DCS', 'Manual'])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setSourceFilter([])}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          )}
                        </th>

                        {/* Actions - No filter */}
                        <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: '65px', backgroundColor: 'white' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                            No units found. Upload unit_dump.lua to populate the database.
                          </td>
                        </tr>
                      ) : (
                        currentUnits.map((unit, index) => {
                          const catColors = getCategoryBadgeColor(unit.category);
                          const killColors = getKillCategoryBadgeColor(unit.kill_category);

                          return (
                            <tr
                              key={unit.id || index}
                              style={{
                                borderBottom: '1px solid #F1F5F9',
                                opacity: unit.is_active ? 1 : 0.5,
                                height: '48px'
                              }}
                            >
                              <td style={{ padding: '10px 5px', textAlign: 'center' }}>
                                <button
                                  onClick={() => unit.id && toggleUnitActive(unit.id, unit.is_active)}
                                  style={{
                                    padding: '4px',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    color: unit.is_active ? '#3B82F6' : '#94A3B8'
                                  }}
                                >
                                  {unit.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: '#0F172A', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={unit.display_name}>
                                {unit.display_name}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748B', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={unit.type_name}>
                                {unit.type_name}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  backgroundColor: catColors.bg,
                                  color: catColors.text,
                                  border: `1px solid ${catColors.border}`
                                }}>
                                  {unit.category}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748B' }}>
                                {unit.sub_category || '—'}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  backgroundColor: killColors.bg,
                                  color: killColors.text,
                                  border: `1px solid ${killColors.border}`
                                }}>
                                  {unit.kill_category}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748B' }}>
                                {unit.source}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {unit.source === 'Manual' && (
                                  <button
                                    onClick={() => handleEditUnit(unit)}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      color: '#3B82F6',
                                      fontSize: '12px',
                                      fontWeight: 500
                                    }}
                                  >
                                    <Edit2 size={14} />
                                    Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination controls below table */}
                <PaginationControls />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      {showAddEditDialog && (
        <AddEditUnitDialog
          unit={editingUnit}
          onClose={() => {
            setShowAddEditDialog(false);
            setEditingUnit(null);
          }}
          onSave={handleSaveUnit}
        />
      )}
    </div>
  );
};

export default DCSReferenceSettings;
