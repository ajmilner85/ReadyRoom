import React, { useState, useEffect } from 'react';
import { fetchCarriers } from '../../../utils/supabaseClient';
import { SupportRoleType } from '../../../types/SupportRoleTypes'; // Keep type for consistency
import { AddSupportRoleDialogData, CommandControlSlot } from '../../../types/DialogTypes';

interface CarrierOption {
  id: string;
  name: string;
  hull: string;
  // Removed callsign as it's constructed from hull/name
}

interface AddSupportRoleDialogProps {
  onSave: (data: AddSupportRoleDialogData) => void;
  onCancel: () => void;
  // Removed existingCallsigns and initialCallsign as they are no longer needed
  title?: string; // Keep title for edit/add distinction if needed later
}

const slotTypes = ['AWACS', 'OLYMPUS', 'GCI', 'JTAC'] as const;

const AddSupportRoleDialog: React.FC<AddSupportRoleDialogProps> = ({
  onSave,
  onCancel,
  title = 'Add Support Role' // Updated default title to be more generic
}) => {  
  const [roleType, setRoleType] = useState<SupportRoleType>(SupportRoleType.CARRIER_AIR_OPS);
  const [callsign, setCallsign] = useState<string>('');
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('');
  const [error, setError] = useState('');
  const [slots, setSlots] = useState<CommandControlSlot[]>([
    { type: 'AWACS', name: 'AWACS', id: crypto.randomUUID() }
  ]);

  // Fetch carriers on component mount
  useEffect(() => {
    if (roleType === SupportRoleType.CARRIER_AIR_OPS) {
      const getCarriers = async () => {
        try {
          const carrierData = await fetchCarriers();
          // Map data to CarrierOption, ensuring hull and name are present
          const options = carrierData
            .map(c => ({ id: c.id, name: c.name, hull: c.hull }))
            .filter(c => c.id && c.name && c.hull); // Ensure required fields exist

          setCarriers(options);
          if (options.length > 0) {
            setSelectedCarrierId(options[0].id); // Default to the first carrier
          } else {
            setError('No carriers available to select.'); // Inform user if list is empty
          }
        } catch (error) {
          console.error('Error fetching carriers:', error);
          setError('Failed to load carriers.');
        }
      };

      getCarriers();
    }
  }, [roleType]);
  
  // Toggle between carrier and callsign input based on role type
  useEffect(() => {
    if (roleType === SupportRoleType.COMMAND_CONTROL) {
      setSelectedCarrierId('');
      // Initialize with one AWACS slot when switching to Command & Control
      setSlots([{ type: 'AWACS', name: 'AWACS', id: crypto.randomUUID() }]);
      // Default callsign to "Command & Control"
      setCallsign('COMMAND & CONTROL');
    } else {
      setCallsign('');
      setSlots([]);
    }
  }, [roleType]);

  const validateAndSave = () => {
    if (roleType === SupportRoleType.CARRIER_AIR_OPS) {
      // Validate carrier selection
      if (!selectedCarrierId) {
        setError('Please select a carrier');
        return false;
      }

      const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);
      if (!selectedCarrier) {
        setError('Selected carrier not found. Please refresh or try again.');
        return false;
      }

      // Pass structured data back for Carrier Air Ops
      onSave({
        type: SupportRoleType.CARRIER_AIR_OPS,
        hull: selectedCarrier.hull,
        name: selectedCarrier.name,
        carrierId: selectedCarrier.id,
      });
    } else if (roleType === SupportRoleType.COMMAND_CONTROL) {
      // For Command & Control, validate callsign input
      if (!callsign || callsign.trim() === '') {
        setError('Please enter a callsign');
        return false;
      }
      
      // Validate slots
      if (slots.length === 0) {
        setError('Please add at least one slot');
        return false;
      }
      
      // Check if all slots have valid names
      const invalidSlot = slots.find(slot => !slot.name || slot.name.trim() === '');
      if (invalidSlot) {
        setError('All slots must have names');
        return false;
      }

      // Pass Command & Control data with slots
      onSave({
        type: SupportRoleType.COMMAND_CONTROL,
        callsign: callsign.trim().toUpperCase(),
        slots: slots,
      });
    }
    return true; // Indicate success
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    validateAndSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const handleRoleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleType(e.target.value as SupportRoleType);
    setError(''); // Clear any existing errors
  };

  const handleCarrierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCarrierId(e.target.value);
    setError(''); // Clear error on change
  };

  const handleCallsignChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCallsign(e.target.value);
    setError(''); // Clear error on change
  };
  
  const addSlot = () => {
    if (slots.length < 4) {
      setSlots([...slots, { 
        type: 'AWACS',
        name: 'AWACS',
        id: crypto.randomUUID()
      }]);
    }
  };
  
  const removeSlot = (id: string) => {
    if (slots.length > 1) {
      setSlots(slots.filter(slot => slot.id !== id));
    } else {
      setError('You must have at least one slot');
    }
  };
  
  const updateSlotType = (id: string, type: CommandControlSlot['type']) => {
    setSlots(slots.map(slot => 
      slot.id === id ? { ...slot, type, name: type } : slot
    ));
  };
  
  const updateSlotName = (id: string, name: string) => {
    setSlots(slots.map(slot => 
      slot.id === id ? { ...slot, name } : slot
    ));
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
      width: '350px',
      zIndex: 1001,
      pointerEvents: 'auto'
    }}>
      <div style={{
        maxHeight: '80vh',
        overflowY: 'auto',
        width: '100%'
      }}>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <h2 style={{
            fontFamily: 'Inter',
            fontSize: '18px',
            fontWeight: 500,
            marginBottom: '16px',            color: '#1E293B'
          }}>
            {title}
          </h2>

          {/* Role Type Selection */}
          <div style={{ marginBottom: '15px', width: '100%' }}>
            <label htmlFor="roleTypeSelect" style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
              Role Type:
            </label>
            <select
              id="roleTypeSelect"
              value={roleType}
              onChange={handleRoleTypeChange}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value={SupportRoleType.CARRIER_AIR_OPS}>Carrier Air Ops</option>
              <option value={SupportRoleType.COMMAND_CONTROL}>Command & Control</option>
            </select>
          </div>

          {/* Conditional rendering based on role type */}
          {roleType === SupportRoleType.CARRIER_AIR_OPS && (
            <div style={{ marginBottom: '15px', width: '100%' }}>
              <label htmlFor="carrierSelect" style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
                Select Carrier:
              </label>
              <select
                id="carrierSelect"
                value={selectedCarrierId}
                onChange={handleCarrierChange}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                disabled={carriers.length === 0}
              >
                {carriers.length === 0 && !error && <option>Loading carriers...</option>}
                {carriers.map(carrier => (
                  <option key={carrier.id} value={carrier.id}>
                    {`${carrier.hull} ${carrier.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Command & Control UI */}
          {roleType === SupportRoleType.COMMAND_CONTROL && (
            <>
              {/* Callsign input for Command & Control */}
              <div style={{ marginBottom: '15px', width: '100%' }}>
                <label htmlFor="callsignInput" style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
                  Callsign:
                </label>
                <input
                  id="callsignInput"
                  type="text"
                  value={callsign}
                  onChange={handleCallsignChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter callsign"
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
              
              {/* Slots section title */}
              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: '#4A5568', fontSize: '14px', fontWeight: 'bold' }}>
                  Slots ({slots.length}/4):
                </label>
                <button 
                  type="button" 
                  onClick={addSlot}
                  disabled={slots.length >= 4}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: slots.length >= 4 ? '#E2E8F0' : '#2563EB',
                    border: 'none',
                    borderRadius: '4px',
                    color: slots.length >= 4 ? '#94A3B8' : 'white',
                    cursor: slots.length >= 4 ? 'not-allowed' : 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Add Slot
                </button>
              </div>
              
              {/* Slots */}
              {slots.map((slot, index) => (
                <div key={slot.id} style={{ 
                  marginBottom: '15px', 
                  padding: '10px', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '4px',
                  backgroundColor: '#F8FAFC'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Slot {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      disabled={slots.length <= 1}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: slots.length <= 1 ? '#CBD5E1' : '#EF4444',
                        cursor: slots.length <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  
                  {/* Slot type selection */}
                  <div style={{ marginBottom: '8px' }}>
                    <label htmlFor={`slotType-${slot.id}`} style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
                      Type:
                    </label>
                    <select
                      id={`slotType-${slot.id}`}
                      value={slot.type}
                      onChange={(e) => updateSlotType(slot.id, e.target.value as CommandControlSlot['type'])}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    >
                      {slotTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Slot name input */}
                  <div>
                    <label htmlFor={`slotName-${slot.id}`} style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
                      Name:
                    </label>
                    <input
                      id={`slotName-${slot.id}`}
                      type="text"
                      value={slot.name}
                      onChange={(e) => updateSlotName(slot.id, e.target.value)}
                      placeholder="Enter slot name"
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
                </div>
              ))}
            </>
          )}

          {error && <p style={{ color: 'red', fontSize: '12px', marginTop: '10px' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={onCancel} style={{
              padding: '8px 16px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '8px'
            }}>
              Cancel
            </button>
            <button type="submit" style={{
              padding: '8px 16px',
              backgroundColor: '#2563EB',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }} disabled={
              roleType === SupportRoleType.CARRIER_AIR_OPS 
                ? !selectedCarrierId 
                : !callsign || slots.length === 0
            }>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSupportRoleDialog;
