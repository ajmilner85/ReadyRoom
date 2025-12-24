import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, BookOpen } from 'lucide-react';
import { useAppSettings } from '../../../context/AppSettingsContext';
import type { ReferenceMaterial } from '../../../types/EventTypes';

interface ReferenceMaterialsInputProps {
  value: ReferenceMaterial[];
  onChange: (materials: ReferenceMaterial[]) => void;
  inheritedMaterials?: ReferenceMaterial[];
  maxItems?: number;
}

const ReferenceMaterialsInput: React.FC<ReferenceMaterialsInputProps> = ({
  value,
  onChange,
  inheritedMaterials = [],
  maxItems = 5
}) => {
  const { settings } = useAppSettings();
  const [localMaterials, setLocalMaterials] = useState<ReferenceMaterial[]>(value);
  const [showDialog, setShowDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogData, setDialogData] = useState<ReferenceMaterial>({ type: '', name: '', url: '' });
  const [urlError, setUrlError] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showBookTooltip, setShowBookTooltip] = useState(false);

  // Sync with parent when value changes externally
  useEffect(() => {
    setLocalMaterials(value);
  }, [value]);

  const validateURL = (url: string): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleOpenDialog = (index?: number) => {
    if (index !== undefined) {
      setEditingIndex(index);
      setDialogData(localMaterials[index]);
    } else {
      setEditingIndex(null);
      setDialogData({ type: '', name: '', url: '' });
    }
    setUrlError('');
    setShowDialog(true);
  };

  const handleSaveDialog = () => {
    // Validate
    if (!dialogData.type || !dialogData.name || !dialogData.url) {
      setUrlError('All fields are required');
      return;
    }
    if (!validateURL(dialogData.url)) {
      setUrlError('Please enter a valid URL starting with http:// or https://');
      return;
    }

    let updated: ReferenceMaterial[];
    if (editingIndex !== null) {
      // Edit existing
      updated = [...localMaterials];
      updated[editingIndex] = dialogData;
    } else {
      // Add new
      updated = [...localMaterials, dialogData];
    }

    setLocalMaterials(updated);
    onChange(updated);
    setShowDialog(false);
  };

  const handleRemove = (index: number) => {
    const updated = localMaterials.filter((_, i) => i !== index);
    setLocalMaterials(updated);
    onChange(updated);
  };

  const referenceTypes = [
    ...(settings.eventDefaults?.defaultReferenceMaterialTypes || []),
    'Other'
  ];

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#64748B'
  };

  // Combine inherited and local materials with metadata
  const allMaterials = [
    ...inheritedMaterials.map((m, idx) => ({ material: m, isInherited: true, originalIndex: idx })),
    ...localMaterials.map((m, idx) => ({ material: m, isInherited: false, originalIndex: idx }))
  ];

  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={labelStyle}>
        Reference Materials
      </label>

      {/* Unified list of all references */}
      <div style={{ marginTop: '8px' }}>
        {allMaterials.map((item, index) => (
          <div
            key={`${item.isInherited ? 'inherited' : 'local'}-${item.originalIndex}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              padding: '4px 0'
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Book icon for inherited references */}
            {item.isInherited && (
              <div
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', position: 'relative' }}
                onMouseEnter={() => setShowBookTooltip(true)}
                onMouseLeave={() => setShowBookTooltip(false)}
              >
                <BookOpen size={16} style={{ color: '#6B7280' }} />
                {showBookTooltip && (
                  <div style={{
                    position: 'absolute',
                    left: '24px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: '#1E293B',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    zIndex: 100,
                    pointerEvents: 'none'
                  }}>
                    Inherited from selected syllabus mission
                  </div>
                )}
              </div>
            )}
            {!item.isInherited && (
              <div style={{ width: '16px', flexShrink: 0 }} /> // Spacer for alignment
            )}

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: '#1F2937', marginBottom: '2px' }}>
                {item.material.type}
              </div>
              <a
                href={item.material.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '14px',
                  color: '#3B82F6',
                  textDecoration: 'none',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.material.name}
              </a>
            </div>

            {/* Action buttons - only show on hover and only for non-inherited */}
            {!item.isInherited && hoveredIndex === index && (
              <>
                <button
                  onClick={() => handleOpenDialog(item.originalIndex)}
                  style={{
                    padding: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6B7280',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleRemove(item.originalIndex)}
                  style={{
                    padding: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#EF4444',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add button */}
      {localMaterials.length < maxItems && (
        <button
          onClick={() => handleOpenDialog()}
          style={{
            fontSize: '14px',
            color: '#3B82F6',
            backgroundColor: '#EFF6FF',
            border: '1px solid #3B82F6',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            fontWeight: 500,
            marginTop: localMaterials.length > 0 ? '8px' : '0'
          }}
        >
          + Add Reference Material
        </button>
      )}

      {localMaterials.length >= maxItems && (
        <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px' }}>
          Maximum of {maxItems} event-specific references
        </p>
      )}

      {/* Dialog */}
      {showDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>
              {editingIndex !== null ? 'Edit Reference Material' : 'Add Reference Material'}
            </h3>

            {/* Type Dropdown */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Type
              </label>
              <select
                value={dialogData.type}
                onChange={(e) => setDialogData({ ...dialogData, type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select type...</option>
                {referenceTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Name Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Name
              </label>
              <input
                type="text"
                placeholder="e.g., Week 1 - Airmanship"
                value={dialogData.name}
                onChange={(e) => setDialogData({ ...dialogData, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* URL Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                URL
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={dialogData.url}
                onChange={(e) => {
                  setDialogData({ ...dialogData, url: e.target.value });
                  setUrlError('');
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${urlError ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
              {urlError && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
                  {urlError}
                </p>
              )}
            </div>

            {/* Dialog buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setShowDialog(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDialog}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceMaterialsInput;
