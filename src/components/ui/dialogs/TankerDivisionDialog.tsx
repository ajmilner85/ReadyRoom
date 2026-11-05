import React, { useState } from 'react';
import type { TankerDivisionData, TankerType, TankerRole } from '../../../types/TankerTypes';

const AIRCRAFT_TYPES: TankerType[] = ['S-3B', 'KC-135 MPRS', 'KC-130'];

interface TankerDivisionDialogProps {
  initialData?: Omit<TankerDivisionData, 'label'>;
  onSave: (data: Omit<TankerDivisionData, 'label'>) => void;
  onCancel: () => void;
}

export const TankerDivisionDialog: React.FC<TankerDivisionDialogProps> = ({
  initialData,
  onSave,
  onCancel
}) => {
  const [callsign, setCallsign] = useState(initialData?.callsign || '');
  const [altitude, setAltitude] = useState(initialData?.altitude?.toString() || '');
  const [aircraftType, setAircraftType] = useState<TankerType>(initialData?.aircraftType || 'S-3B');
  const [role, setRole] = useState<TankerRole>(initialData?.role || 'mission-tankers');
  const [error, setError] = useState('');

  const handleAltitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setAltitude(value);
      setError('');
    }
  };

  const validateAndSave = () => {
    try {
      if (!callsign.trim()) {
        setError('Please enter a callsign');
        return false;
      }

      const altitudeNum = parseInt(altitude);
      if (!altitudeNum || altitudeNum < 1 || altitudeNum > 99) {
        setError('Altitude must be between 1 and 99');
        return false;
      }

      onSave({
        callsign: callsign.trim(),
        altitude: altitudeNum,
        aircraftType,
        role
      });

      return true;
    } catch (err) {
      console.error('Error saving tanker division:', err);
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
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'inherit',
            fontSize: '14px',
            color: 'var(--rr-text2)'
          }}>
            Callsign
          </label>
          <input
            type="text"
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter callsign"
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

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'inherit',
            fontSize: '14px',
            color: 'var(--rr-text2)'
          }}>
            Altitude (Angels)
          </label>
          <input
            type="text"
            value={altitude}
            onChange={handleAltitudeChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter altitude"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--rr-border2)',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'inherit',
            fontSize: '14px',
            color: 'var(--rr-text2)'
          }}>
            Aircraft Type
          </label>
          <select
            value={aircraftType}
            onChange={(e) => setAircraftType(e.target.value as TankerType)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--rr-border2)',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: 'var(--rr-panel)'
            }}
          >
            {AIRCRAFT_TYPES.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontFamily: 'inherit',
            fontSize: '14px',
            color: 'var(--rr-text2)'
          }}>
            Tanker Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TankerRole)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--rr-border2)',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: 'var(--rr-panel)'
            }}
          >
            <option value="mission-tankers">Mission Tanker</option>
            <option value="recovery-tankers">Recovery Tanker</option>
          </select>
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
            type="button"
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
            type="submit"
            disabled={!callsign || !altitude || !!error}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: !callsign || !altitude || !!error ? 'var(--rr-panel3)' : 'var(--rr-accent)',
              color: 'white',
              cursor: !callsign || !altitude || !!error ? 'not-allowed' : 'pointer'
            }}
          >
            {initialData ? 'Update' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
};