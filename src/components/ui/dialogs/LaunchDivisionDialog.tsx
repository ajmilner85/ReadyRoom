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
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'var(--rr-panel)',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: 'var(--rr-shadow)',
      width: '300px',
      zIndex: 1001,
      pointerEvents: 'auto'
    }}>
      <div style={{
        marginBottom: '16px'
      }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'inherit',
          fontSize: '14px',
          color: 'var(--rr-text2)'
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
            border: '1px solid var(--rr-border2)',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
          autoFocus
        />
      </div>

      {error && (
        <div style={{
          color: 'var(--rr-bad)',
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
            border: '1px solid var(--rr-border2)',
            borderRadius: '4px',
            backgroundColor: 'var(--rr-panel)',
            color: 'var(--rr-text2)',
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
            backgroundColor: !stepTime || !!error ? 'var(--rr-panel3)' : 'var(--rr-accent)',
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