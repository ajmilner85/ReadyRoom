import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import {
  Command,
  Group,
  Wing,
  Squadron,
  NewCommand,
  NewGroup,
  NewWing,
  NewSquadron
} from '../../types/OrganizationTypes';

interface OrgEntityModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  entityType: 'command' | 'group' | 'wing' | 'squadron';
  entity?: Command | Group | Wing | Squadron;
  commands: Command[];
  groups: Group[];
  wings: Wing[];
  onSave: (data: NewCommand | NewGroup | NewWing | NewSquadron) => void;
  onClose: () => void;
}

const OrgEntityModal: React.FC<OrgEntityModalProps> = ({
  isOpen,
  mode,
  entityType,
  entity,
  commands,
  groups,
  wings,
  onSave,
  onClose
}) => {
  const [formData, setFormData] = useState<{
    name: string;
    designation: string;
    established_date: string;
    deactivated_date: string;
    insignia_url: string;
    tail_code: string;
    command_id: string;
    group_id: string;
    wing_id: string;
    carrier_id: string;
    callsigns: string;
  }>({
    name: '',
    designation: '',
    established_date: '',
    deactivated_date: '',
    insignia_url: '',
    tail_code: '',
    command_id: '',
    group_id: '',
    wing_id: '',
    carrier_id: '',
    callsigns: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when modal opens or entity changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && entity) {
        setFormData({
          name: entity.name || '',
          designation: ('designation' in entity ? entity.designation : '') || '',
          established_date: entity.established_date || '',
          deactivated_date: entity.deactivated_date || '',
          insignia_url: entity.insignia_url || '',
          tail_code: ('tail_code' in entity ? entity.tail_code : '') || '',
          command_id: ('command_id' in entity ? entity.command_id : '') || '',
          group_id: ('group_id' in entity ? entity.group_id : '') || '',
          wing_id: ('wing_id' in entity ? entity.wing_id : '') || '',
          carrier_id: ('carrier_id' in entity ? entity.carrier_id : '') || '',
          callsigns: ('callsigns' in entity ? JSON.stringify(entity.callsigns || {}) : '') || '{}'
        });
      } else {
        // Reset form for create mode
        setFormData({
          name: '',
          designation: '',
          established_date: '',
          deactivated_date: '',
          insignia_url: '',
          tail_code: '',
          command_id: '',
          group_id: '',
          wing_id: '',
          carrier_id: '',
          callsigns: '{}'
        });
      }
      setErrors({});
    }
  }, [isOpen, mode, entity]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name is required for all entities
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    // Entity-specific validation
    switch (entityType) {
      case 'group':
        if (!formData.command_id) {
          newErrors.command_id = 'Command is required for groups';
        }
        break;
      case 'wing':
        // Group is optional for wings (detached units)
        break;
      case 'squadron':
        if (!formData.designation.trim()) {
          newErrors.designation = 'Designation is required for squadrons';
        }
        if (!formData.wing_id) {
          newErrors.wing_id = 'Wing is required for squadrons';
        }
        break;
    }

    // Validate tail code format if provided
    if (formData.tail_code && formData.tail_code.length !== 2) {
      newErrors.tail_code = 'Tail code must be exactly 2 characters';
    }

    // Validate dates
    if (formData.established_date && formData.deactivated_date) {
      const estDate = new Date(formData.established_date);
      const deactDate = new Date(formData.deactivated_date);
      if (deactDate <= estDate) {
        newErrors.deactivated_date = 'Deactivation date must be after establishment date';
      }
    }

    // Validate callsigns JSON for squadrons
    if (entityType === 'squadron' && formData.callsigns) {
      try {
        JSON.parse(formData.callsigns);
      } catch {
        newErrors.callsigns = 'Callsigns must be valid JSON';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const baseData = {
      name: formData.name.trim(),
      established_date: formData.established_date || null,
      deactivated_date: formData.deactivated_date || null,
      insignia_url: formData.insignia_url || null
    };

    let saveData: NewCommand | NewGroup | NewWing | NewSquadron;

    switch (entityType) {
      case 'command':
        saveData = baseData as NewCommand;
        break;
      case 'group':
        saveData = {
          ...baseData,
          command_id: formData.command_id
        } as NewGroup;
        break;
      case 'wing':
        saveData = {
          ...baseData,
          group_id: formData.group_id || null,
          designation: formData.designation || null,
          tail_code: formData.tail_code || null,
          carrier_id: formData.carrier_id || null
        } as NewWing;
        break;
      case 'squadron':
        saveData = {
          ...baseData,
          wing_id: formData.wing_id,
          designation: formData.designation.trim(),
          tail_code: formData.tail_code || null,
          carrier_id: formData.carrier_id || null,
          callsigns: formData.callsigns ? JSON.parse(formData.callsigns) : null
        } as NewSquadron;
        break;
      default:
        return;
    }

    onSave(saveData);
  };

  if (!isOpen) return null;

  const title = `${mode === 'create' ? 'Create' : 'Edit'} ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;
  
  const modalContent = (
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
        zIndex: 999999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          zIndex: 1001,
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        <div style={{ 
          padding: '24px',
          maxHeight: 'calc(90vh - 120px)',
          overflowY: 'auto'
        }}>
          {/* Name Field */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${errors.name ? '#EF4444' : '#CBD5E1'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                height: '35px',
                lineHeight: '19px'
              }}
              placeholder={`Enter ${entityType} name`}
            />
            {errors.name && (
              <div style={{
                color: '#EF4444',
                fontSize: '12px',
                marginTop: '4px'
              }}>
                {errors.name}
              </div>
            )}
          </div>

          {/* Designation Field (Wings and Squadrons) */}
          {(entityType === 'wing' || entityType === 'squadron') && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Designation {entityType === 'squadron' ? '*' : ''}
              </label>
              <input
                type="text"
                value={formData.designation}
                onChange={(e) => handleInputChange('designation', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.designation ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  lineHeight: '19px'
                }}
                placeholder={`Enter ${entityType} designation`}
              />
              {errors.designation && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.designation}
                </div>
              )}
            </div>
          )}

          {/* Parent Entity Selection */}
          {entityType === 'group' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Command *
              </label>
              <select
                value={formData.command_id}
                onChange={(e) => handleInputChange('command_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.command_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a command</option>
                {commands.map(command => (
                  <option key={command.id} value={command.id}>
                    {command.name}
                  </option>
                ))}
              </select>
              {errors.command_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.command_id}
                </div>
              )}
            </div>
          )}

          {entityType === 'wing' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Group (Optional)
              </label>
              <select
                value={formData.group_id}
                onChange={(e) => handleInputChange('group_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">No group (detached unit)</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.command?.name || 'No command'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {entityType === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Wing *
              </label>
              <select
                value={formData.wing_id}
                onChange={(e) => handleInputChange('wing_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.wing_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a wing</option>
                {wings.map(wing => (
                  <option key={wing.id} value={wing.id}>
                    {wing.name} {wing.designation ? `(${wing.designation})` : ''}
                  </option>
                ))}
              </select>
              {errors.wing_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.wing_id}
                </div>
              )}
            </div>
          )}

          {/* Tail Code (Wings and Squadrons) */}
          {(entityType === 'wing' || entityType === 'squadron') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tail Code
              </label>
              <input
                type="text"
                value={formData.tail_code}
                onChange={(e) => handleInputChange('tail_code', e.target.value.toUpperCase())}
                className={`w-full px-3 py-2 border rounded-md ${errors.tail_code ? 'border-red-500' : 'border-slate-300'}`}
                placeholder="e.g., NK, AG"
                maxLength={2}
              />
              {errors.tail_code && <p className="text-red-500 text-sm mt-1">{errors.tail_code}</p>}
              <p className="text-sm text-slate-500 mt-1">2-character tail code for aircraft identification</p>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Established Date
              </label>
              <input
                type="date"
                value={formData.established_date}
                onChange={(e) => handleInputChange('established_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deactivated Date
              </label>
              <input
                type="date"
                value={formData.deactivated_date}
                onChange={(e) => handleInputChange('deactivated_date', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${errors.deactivated_date ? 'border-red-500' : 'border-slate-300'}`}
              />
              {errors.deactivated_date && <p className="text-red-500 text-sm mt-1">{errors.deactivated_date}</p>}
            </div>
          </div>

          {/* Insignia URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Insignia URL
            </label>
            <input
              type="url"
              value={formData.insignia_url}
              onChange={(e) => handleInputChange('insignia_url', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
              placeholder="https://example.com/insignia.png"
            />
            <p className="text-sm text-slate-500 mt-1">URL to the unit's insignia image</p>
          </div>

          {/* Squadron Callsigns */}
          {entityType === 'squadron' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Callsigns (JSON)
              </label>
              <textarea
                value={formData.callsigns}
                onChange={(e) => handleInputChange('callsigns', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md font-mono text-sm ${errors.callsigns ? 'border-red-500' : 'border-slate-300'}`}
                rows={4}
                placeholder='{"flight1": ["Alpha", "Bravo"], "flight2": ["Charlie", "Delta"]}'
              />
              {errors.callsigns && <p className="text-red-500 text-sm mt-1">{errors.callsigns}</p>}
              <p className="text-sm text-slate-500 mt-1">JSON object containing squadron callsigns</p>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          padding: '16px 24px',
          borderTop: '1px solid #E2E8F0'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#2563EB',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Save size={16} />
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default OrgEntityModal;