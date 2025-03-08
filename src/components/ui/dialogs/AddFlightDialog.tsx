import React, { useState, useEffect } from 'react';

interface AddFlightDialogProps {
  onSave: (data: { callsign: string }) => void;
  onCancel: () => void;
  existingCallsigns: string[];
  initialCallsign?: string;
  title?: string;
}

export const AddFlightDialog: React.FC<AddFlightDialogProps> = ({
  onSave,
  onCancel,
  existingCallsigns = [],
  initialCallsign = '',
  title = 'Add Flight'
}) => {
  const [callsign, setCallsign] = useState(initialCallsign);
  const [error, setError] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  
  // Example callsign suggestions - these would eventually come from configuration
  const callsignSuggestions = [
    'STING', 'DODGE', 'VENOM', 'KNIFE', 'EAGLE', 'VIPER', 'COBRA', 'WIDOW', 'HAMMER',
    'BOLT', 'THUNDER', 'JACKAL', 'REAPER', 'SABRE', 'KNIGHT', 'LANCE', 'DRAGON', 'STEEL'
  ];
  
  // Combine existing callsigns, recent callsigns and default callsigns
  // Remove duplicates and sort alphabetically
  const allSuggestions = [...new Set([
    ...existingCallsigns,
    ...callsignSuggestions
  ])].sort();

  // Update filtered suggestions when callsign input changes
  useEffect(() => {
    if (!callsign.trim()) {
      setFilteredSuggestions([]);
    } else {
      const filtered = allSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(callsign.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
    }
    setActiveIndex(-1);
  }, [callsign]);

  // Initialize callsign from initialCallsign prop when component mounts
  useEffect(() => {
    if (initialCallsign) {
      setCallsign(initialCallsign);
    }
  }, [initialCallsign]);

  const validateAndSave = () => {
    try {
      const trimmedCallsign = callsign.trim().toUpperCase();
      
      if (!trimmedCallsign) {
        setError('Please enter a callsign');
        return false;
      }

      if (trimmedCallsign.length > 10) {
        setError('Callsign must be 10 characters or less');
        return false;
      }

      onSave({ callsign: trimmedCallsign });
      return true;
    } catch (err) {
      console.error('Error adding flight:', err);
      setError('An unexpected error occurred');
      return false;
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    validateAndSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle keyboard navigation for suggestions
    if (filteredSuggestions.length > 0) {
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
    // Limit input to 10 characters
    const value = e.target.value;
    if (value.length <= 10) {
      setCallsign(value);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    if (suggestion.length <= 10) {
      setCallsign(suggestion);
      setFilteredSuggestions([]);
    }
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
        <div style={{ 
          marginBottom: '16px', 
          position: 'relative',
          boxSizing: 'border-box',
          paddingRight: '0' // Ensure no extra padding
        }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'Inter',
            fontSize: '14px',
            color: '#64748B'
          }}>
            Callsign (max 10 characters)
          </label>
          <input
            type="text"
            value={callsign}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter callsign"
            maxLength={10}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box' // Include padding and border in width calculation
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

        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: '12px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#64748B',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!callsign.trim()}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: !callsign.trim() ? '#CBD5E1' : '#2563EB',
              color: 'white',
              cursor: !callsign.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {initialCallsign ? 'Update' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddFlightDialog;