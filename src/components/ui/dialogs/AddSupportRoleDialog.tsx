import React, { useState, useEffect } from 'react';
import { supabase, fetchCarriers } from '../../../utils/supabaseClient';
import { SupportRoleType } from '../../../types/SupportRoleTypes'; // Keep type for consistency
import { AddSupportRoleDialogData } from '../../../types/DialogTypes';

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

const AddSupportRoleDialog: React.FC<AddSupportRoleDialogProps> = ({
  onSave,
  onCancel,
  title = 'Add Carrier Air Ops Role' // Default title reflects the specific purpose
}) => {
  // Removed roleType state - implicitly CARRIER_AIR_OPS
  // Removed callsign state and related logic (suggestions, input handling)
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('');
  const [error, setError] = useState('');
  // Removed filteredSuggestions and activeIndex state

  // Fetch carriers on component mount
  useEffect(() => {
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
  }, []);

  // Removed useEffect for callsign suggestions

  // Removed useEffect for initializing callsign

  const validateAndSave = () => {
    // Simplified validation: just check if a carrier is selected
    if (!selectedCarrierId) {
      setError('Please select a carrier');
      return false;
    }

    const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);
    if (!selectedCarrier) {
      setError('Selected carrier not found. Please refresh or try again.');
      return false;
    }

    // Pass structured data back
    onSave({
      type: SupportRoleType.CARRIER_AIR_OPS, // Explicitly set type
      hull: selectedCarrier.hull,
      name: selectedCarrier.name,
      carrierId: selectedCarrier.id,
    });
    return true; // Indicate success
  };

  const handleSubmit = (e?: React.FormEvent) => { // Made event optional
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    validateAndSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Simplified keydown handler
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Attempt to save only if a carrier is selected
      if (selectedCarrierId) {
        validateAndSave();
      } else {
         setError('Please select a carrier first.');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
    // Removed arrow key navigation for suggestions
  };

  // Removed handleInputChange and selectSuggestion

  // Removed handleRoleTypeChange

  const handleCarrierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCarrierId(e.target.value);
    setError(''); // Clear error on change
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
            marginBottom: '16px',
            color: '#1E293B'
          }}>
            {title}
          </h2>

          {/* Carrier Selection */}
          <div style={{ marginBottom: '15px', width: '100%' }}>
            <label htmlFor="carrierSelect" style={{ display: 'block', marginBottom: '5px', color: '#4A5568', fontSize: '14px' }}>
              Select Carrier:
            </label>
            <select
              id="carrierSelect"
              value={selectedCarrierId}
              onChange={handleCarrierChange}
              onKeyDown={handleKeyDown} // Allow Enter/Escape on select
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              disabled={carriers.length === 0} // Disable if no carriers loaded
            >
              {carriers.length === 0 && !error && <option>Loading carriers...</option>}
              {carriers.map(carrier => (
                <option key={carrier.id} value={carrier.id}>
                  {`${carrier.hull} ${carrier.name}`}
                </option>
              ))}
            </select>
          </div>

          {error && <p style={{ color: 'red', fontSize: '12px', marginTop: '10px' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={onCancel} style={{
              padding: '8px 16px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: '14px'
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
            }} disabled={!selectedCarrierId}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSupportRoleDialog;
