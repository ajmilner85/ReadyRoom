import React, { useState, useEffect } from 'react';
import { X, Search, Plus } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

interface DCSUnitType {
  id: string;
  type_name: string;
  display_name: string;
  category: 'AIRPLANE' | 'HELICOPTER' | 'GROUND_UNIT' | 'SHIP' | 'STRUCTURE';
  sub_category: string | null;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  is_active: boolean;
}

interface AddUnitTypesDialogProps {
  killCategory: 'A2A' | 'A2G' | 'A2S';
  existingUnitIds: string[];
  onClose: () => void;
  onAdd: (unitIds: string[]) => void;
}

const AddUnitTypesDialog: React.FC<AddUnitTypesDialogProps> = ({
  killCategory,
  existingUnitIds,
  onClose,
  onAdd
}) => {
  const [units, setUnits] = useState<DCSUnitType[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<DCSUnitType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUnits();
  }, [killCategory]);

  useEffect(() => {
    filterUnits();
  }, [units, searchQuery]);

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

      // Filter out units already in the pool
      const availableUnits = (data || []).filter(
        (unit: any) => !existingUnitIds.includes(unit.id)
      );

      setUnits(availableUnits as DCSUnitType[]);
    } catch (err: any) {
      console.error('Failed to load units:', err);
      setError(err.message || 'Failed to load unit types');
    } finally {
      setLoading(false);
    }
  };

  const filterUnits = () => {
    if (!searchQuery.trim()) {
      setFilteredUnits(units);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = units.filter(
      (u) =>
        u.display_name.toLowerCase().includes(query) ||
        u.type_name.toLowerCase().includes(query) ||
        u.sub_category?.toLowerCase().includes(query)
    );
    setFilteredUnits(filtered);
  };

  const toggleUnit = (unitId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(unitId)) {
      newSelected.delete(unitId);
    } else {
      newSelected.add(unitId);
    }
    setSelectedIds(newSelected);
  };

  const handleAdd = () => {
    onAdd(Array.from(selectedIds));
  };

  const getCategoryLabel = () => {
    switch (killCategory) {
      case 'A2A':
        return 'Air-to-Air';
      case 'A2G':
        return 'Air-to-Ground';
      case 'A2S':
        return 'Air-to-Surface';
    }
  };

  const getCategoryBadgeColor = () => {
    switch (killCategory) {
      case 'A2A':
        return { bg: '#DBEAFE', text: '#1E40AF' }; // Blue
      case 'A2G':
        return { bg: '#FEE2E2', text: '#991B1B' }; // Red
      case 'A2S':
        return { bg: '#D1FAE5', text: '#065F46' }; // Green
    }
  };

  const badgeColor = getCategoryBadgeColor();

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
        zIndex: 1100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '80vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)',
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
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1E293B', margin: '0 0 4px 0' }}>
              Add Unit Types
            </h3>
            <div style={{ fontSize: '14px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: badgeColor.bg,
                  color: badgeColor.text
                }}
              >
                {getCategoryLabel()}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F1F5F9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={18}
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
              placeholder="Search units..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                paddingLeft: '40px',
                paddingRight: '12px',
                fontSize: '14px',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Unit List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              Loading units...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#DC2626' }}>
              {error}
            </div>
          ) : filteredUnits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              {searchQuery ? 'No units found matching your search' : 'No units available'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredUnits.map((unit) => {
                const isSelected = selectedIds.has(unit.id);
                return (
                  <div
                    key={unit.id}
                    onClick={() => toggleUnit(unit.id)}
                    style={{
                      padding: '12px 16px',
                      border: `2px solid ${isSelected ? '#3B82F6' : '#E2E8F0'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', marginBottom: '2px' }}>
                          {unit.display_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          {unit.sub_category || unit.category}
                        </div>
                      </div>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          border: `2px solid ${isSelected ? '#3B82F6' : '#CBD5E1'}`,
                          backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected && (
                          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                            <path
                              d="M1 5L4.5 8.5L11 1.5"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC'
          }}
        >
          <div style={{ fontSize: '14px', color: '#64748B' }}>
            {selectedIds.size} {selectedIds.size === 1 ? 'unit' : 'units'} selected
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#FFFFFF',
                backgroundColor: selectedIds.size > 0 ? '#3B82F6' : '#CBD5E1',
                border: 'none',
                borderRadius: '6px',
                cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} />
              Add Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddUnitTypesDialog;
