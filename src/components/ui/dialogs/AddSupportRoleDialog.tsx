import React, { useState, useEffect } from 'react';
import { supabase, fetchCarriers } from '../../../utils/supabaseClient';
import { SupportRoleType, DEFAULT_CARRIER_POSITIONS } from '../../../types/SupportRoleTypes';
import { AddSupportRoleDialogData } from '../../../types/DialogTypes';

interface CarrierOption {
  id: string;
  name: string;
  hull: string;
  callsign: string;
}

interface AddSupportRoleDialogProps {
  onSave: (data: AddSupportRoleDialogData) => void;
  onCancel: () => void;
  existingCallsigns?: string[];
  initialCallsign?: string;
  title?: string;
}

const AddSupportRoleDialog: React.FC<AddSupportRoleDialogProps> = ({
  onSave,
  onCancel,
  existingCallsigns = [],
  initialCallsign = '',
  title = 'Add Support Role'
}) => {
  const [roleType, setRoleType] = useState<SupportRoleType>(SupportRoleType.CUSTOM);
  const [callsign, setCallsign] = useState(initialCallsign);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('');
  const [error, setError] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  
  // Example support role callsign suggestions for custom roles
  const callsignSuggestions = [
    'MARSHALL', 'TOWER', 'LSO', 'AWACS', 'OLYMPUS', 'GCI'
  ];
  
  // Fetch carriers on component mount
  useEffect(() => {
    const getCarriers = async () => {
      try {
        const carrierData = await fetchCarriers();
        setCarriers(carrierData);
        if (carrierData.length > 0) {
          setSelectedCarrierId(carrierData[0].id);
        }
      } catch (error) {
        console.error('Error fetching carriers:', error);
      }
    };
    
    getCarriers();
  }, []);
  
  // Update filtered suggestions when callsign input changes (for custom roles)
  useEffect(() => {
    if (roleType !== SupportRoleType.CUSTOM) {
      setFilteredSuggestions([]);
      return;
    }
    
    // Calculate suggestions inside the effect to avoid dependency issues
    const allSuggestions = [...new Set([
      ...existingCallsigns,
      ...callsignSuggestions
    ])].sort();
    
    if (!callsign.trim()) {
      setFilteredSuggestions([]);
    } else {
      const filtered = allSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(callsign.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
    }
    setActiveIndex(-1);
  }, [callsign, existingCallsigns, roleType]);

  // Initialize callsign from initialCallsign prop when component mounts
  useEffect(() => {
    if (initialCallsign) {
      setCallsign(initialCallsign);
    }
  }, [initialCallsign]);
  const validateAndSave = () => {
    try {
      if (roleType === SupportRoleType.CARRIER_AIR_OPS) {
        if (!selectedCarrierId) {
          setError('Please select a carrier');
          return false;
        }
          const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);
        if (!selectedCarrier) {
          setError('Selected carrier not found');
          return false;
        }        
        onSave({
          type: SupportRoleType.CARRIER_AIR_OPS,
          callsign: `${selectedCarrier.hull} ${selectedCarrier.name}`,
          carrierId: selectedCarrierId,
          positions: DEFAULT_CARRIER_POSITIONS
        });
        return true;
      } else {
        // Custom role type
        const trimmedCallsign = callsign.trim().toUpperCase();
        
        if (!trimmedCallsign) {
          setError('Please enter a callsign');
          return false;
        }

        if (trimmedCallsign.length > 15) {
          setError('Callsign must be 15 characters or less');
          return false;
        }

        onSave({ 
          type: SupportRoleType.CUSTOM,
          callsign: trimmedCallsign 
        });
        return true;
      }
    } catch (err) {
      console.error('Error adding support role:', err);
      setError('An unexpected error occurred');
      return false;
    }
  };
  const handleSubmit = (e: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    validateAndSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only handle keyboard navigation for custom role suggestions
    if (roleType === SupportRoleType.CUSTOM && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % filteredSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev <= 0 ? filteredSuggestions.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        setCallsign(filteredSuggestions[activeIndex]);
        setFilteredSuggestions([]);
        return;
      }
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      validateAndSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Limit input to 15 characters
    const value = e.target.value;
    if (value.length <= 15) {
      setCallsign(value);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    if (suggestion.length <= 15) {
      setCallsign(suggestion);
      setFilteredSuggestions([]);
    }
  };

  const handleRoleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as SupportRoleType;
    setRoleType(newType);
    // Reset any errors
    setError('');
  };

  const handleCarrierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCarrierId(e.target.value);
    // Reset any errors
    setError('');
  };
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      width: '300px',
      zIndex: 1001,
      pointerEvents: 'auto'
    }}>
      <h2 style={{
        fontFamily: 'Inter',
        fontSize: '18px',
        fontWeight: 500,
        marginBottom: '16px',
        color: '#1E293B'
      }}>
        {title}
      </h2>
      <form onSubmit={handleSubmit}>
        {/* Support Role Type Selection */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'Inter',
            fontSize: '14px',
            color: '#64748B'
          }}>
            Support Role Type
          </label>
          <select
            value={roleType}
            onChange={handleRoleTypeChange}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          >
            {Object.values(SupportRoleType).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Carrier Selection for Carrier Air Ops */}
        {roleType === SupportRoleType.CARRIER_AIR_OPS && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontFamily: 'Inter',
              fontSize: '14px',
              color: '#64748B'
            }}>
              Select Carrier
            </label>
            <select
              value={selectedCarrierId}
              onChange={handleCarrierChange}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >              {carriers.length === 0 ? (
                <option value="">Loading carriers...</option>
              ) : (
                carriers.map(carrier => (
                  <option key={carrier.id} value={carrier.id}>
                    {carrier.hull} {carrier.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Custom Role Callsign Input */}
        {roleType === SupportRoleType.CUSTOM && (
          <div style={{ 
            marginBottom: '16px', 
            position: 'relative',
            boxSizing: 'border-box',
            paddingRight: '0'
          }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontFamily: 'Inter',
              fontSize: '14px',
              color: '#64748B'
            }}>
              Support Role (max 15 characters)
            </label>
            <input
              type="text"
              value={callsign}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter support role callsign"
              maxLength={15}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            {filteredSuggestions.length > 0 && (
              <ul style={{
                position: 'absolute',
                width: '100%',
                backgroundColor: 'white',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                marginTop: '4px',
                padding: '0',
                maxHeight: '200px',
                overflowY: 'auto',
                listStyle: 'none',
                zIndex: 10,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {filteredSuggestions.map((suggestion, index) => (
                  <li
                    key={suggestion}
                    onClick={() => selectSuggestion(suggestion)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: index === activeIndex ? '#EFF6FF' : 'transparent',
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <p style={{ 
            color: '#DC2626', 
            fontSize: '12px', 
            marginTop: '4px',
            marginBottom: '16px'
          }}>
            {error}
          </p>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              backgroundColor: '#2563EB',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddSupportRoleDialog;
