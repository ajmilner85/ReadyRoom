import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

interface DCSUnitType {
  id?: string;
  type_name: string;
  display_name: string;
  category: 'AIRPLANE' | 'HELICOPTER' | 'GROUND_UNIT' | 'SHIP' | 'STRUCTURE' | 'HELIPORT' | 'CARGO' | 'UNKNOWN';
  kill_category: 'A2A' | 'A2G' | 'A2S';
  source: 'DCS' | 'Manual';
  is_active: boolean;
}

interface AddEditUnitDialogProps {
  unit: DCSUnitType | null;
  onClose: () => void;
  onSave: () => void;
}

// Helper function to determine kill category from unit category
function mapCategoryToKillCategory(category: DCSUnitType['category']): 'A2A' | 'A2G' | 'A2S' {
  switch (category) {
    case 'AIRPLANE':
    case 'HELICOPTER':
      return 'A2A';
    case 'SHIP':
      return 'A2S';
    case 'GROUND_UNIT':
    case 'STRUCTURE':
    case 'HELIPORT':
    case 'CARGO':
    case 'UNKNOWN':
    default:
      return 'A2G';
  }
}

const AddEditUnitDialog: React.FC<AddEditUnitDialogProps> = ({ unit, onClose, onSave }) => {
  const [formData, setFormData] = useState<Omit<DCSUnitType, 'id' | 'source'>>({
    type_name: '',
    display_name: '',
    category: 'AIRPLANE',
    kill_category: 'A2A',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (unit) {
      setFormData({
        type_name: unit.type_name,
        display_name: unit.display_name,
        category: unit.category,
        kill_category: unit.kill_category,
        is_active: unit.is_active
      });
    }
  }, [unit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.type_name.trim()) {
      setError('Type name is required');
      return;
    }
    if (!formData.display_name.trim()) {
      setError('Display name is required');
      return;
    }

    try {
      setSaving(true);

      if (unit?.id) {
        // Update existing unit
        const { error: updateError } = await supabase
          .from('dcs_unit_types')
          .update({
            type_name: formData.type_name.trim(),
            display_name: formData.display_name.trim(),
            category: formData.category,
            kill_category: formData.kill_category,
            is_active: formData.is_active
          })
          .eq('id', unit.id);

        if (updateError) throw updateError;
      } else {
        // Create new unit
        const { error: insertError } = await supabase
          .from('dcs_unit_types')
          .insert({
            type_name: formData.type_name.trim(),
            display_name: formData.display_name.trim(),
            category: formData.category,
            kill_category: formData.kill_category,
            source: 'Manual',
            is_active: formData.is_active
          });

        if (insertError) throw insertError;
      }

      onSave();
    } catch (err: any) {
      console.error('Failed to save unit:', err);
      setError(err.message || 'Failed to save unit');
    } finally {
      setSaving(false);
    }
  };

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
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
            {unit ? 'Edit Unit Type' : 'Add Unit Type'}
          </h3>
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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Type Name */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#0F172A', marginBottom: '8px' }}>
                Type Name <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.type_name}
                onChange={(e) => setFormData({ ...formData, type_name: e.target.value })}
                placeholder="e.g., F-16C_50"
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', margin: '6px 0 0 0' }}>
                Internal identifier (must be unique)
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#0F172A', marginBottom: '8px' }}>
                Display Name <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="e.g., F-16C"
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', margin: '6px 0 0 0' }}>
                Human-readable name shown in UI
              </p>
            </div>

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#0F172A', marginBottom: '8px' }}>
                Category <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => {
                  const category = e.target.value as DCSUnitType['category'];
                  const kill_category = mapCategoryToKillCategory(category);
                  setFormData({ ...formData, category, kill_category });
                }}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="AIRPLANE">Airplane</option>
                <option value="HELICOPTER">Helicopter</option>
                <option value="GROUND_UNIT">Ground Unit</option>
                <option value="SHIP">Ship</option>
                <option value="STRUCTURE">Structure</option>
                <option value="HELIPORT">Heliport</option>
                <option value="CARGO">Cargo</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>

            {/* Active Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                disabled={saving}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="is_active" style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A', cursor: 'pointer' }}>
                Active (visible in unit selection)
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#991B1B'
                }}
              >
                {error}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: '#F8FAFC',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              backgroundColor: saving ? '#94A3B8' : '#3B82F6',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Unit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddEditUnitDialog;
