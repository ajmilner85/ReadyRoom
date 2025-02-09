import React, { useState } from 'react';

interface LaunchDivisionDialogProps {
  onSave: (stepTime: number) => void;
  onCancel: () => void;
  initialStepTime?: number;
}

export const LaunchDivisionDialog: React.FC<LaunchDivisionDialogProps> = ({
  onSave,
  onCancel,
  initialStepTime
}) => {
  const [stepTime, setStepTime] = useState(initialStepTime?.toString() || '');
  const [error, setError] = useState('');

  const handleAltitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setStepTime(value);
      setError('');
    }
  };

  const handleSubmit = () => {
    const time = parseInt(stepTime);
    
    if (!stepTime) {
      setError('Please enter a step time');
      return;
    }

    if (isNaN(time) || time < 0) {
      setError('Step time must be a non-negative number');
      return;
    }

    onSave(time);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error && stepTime) {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '200px', 
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      width: '300px',
      zIndex: 1000
    }}>
      <div style={{
        marginBottom: '16px'
      }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
        }}>
          Step Time (minutes)
        </label>
        <input
          type="text"
          value={stepTime}
          onChange={handleAltitudeChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter step time"
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px'
          }}
          autoFocus
        />
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
          onClick={handleSubmit}
          disabled={!stepTime || !!error}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: !stepTime || !!error ? '#CBD5E1' : '#2563EB',
            color: 'white',
            cursor: !stepTime || !!error ? 'not-allowed' : 'pointer'
          }}
        >
          {initialStepTime !== undefined ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  );
};