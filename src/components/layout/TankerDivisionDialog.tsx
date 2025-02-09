import React, { useState } from 'react';
import type { TankerDivisionData, TankerType, TankerRole } from '../../types/TankerTypes';

const AIRCRAFT_TYPES: TankerType[] = ['S-3B', 'KC-135 MPRS'];
const TANKER_ROLES: TankerRole[] = ['mission-tankers', 'recovery-tankers'];

interface TankerDivisionDialogProps {
  initialData?: TankerDivisionData;
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

  const handleSubmit = () => {
    if (!callsign.trim()) {
      setError('Please enter a callsign');
      return;
    }

    const altitudeNum = parseInt(altitude);
    if (!altitudeNum || altitudeNum < 1 || altitudeNum > 99) {
      setError('Altitude must be between 1 and 99');
      return;
    }

    onSave({
      callsign: callsign.trim(),
      altitude: altitudeNum,
      aircraftType,
      role
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error && callsign && altitude) {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '200px', // Position relative to top of column
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      width: '300px'
    }}>
      {/* Callsign Input */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
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
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px'
          }}
          autoFocus
        />
      </div>

      {/* Altitude Input */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
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
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* Aircraft Type Dropdown */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
        }}>
          Aircraft Type
        </label>
        <select
          value={aircraftType}
          onChange={(e) => setAircraftType(e.target.value as TankerType)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white'
          }}
        >
          {AIRCRAFT_TYPES.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Tanker Role Dropdown */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
        }}>
          Tanker Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TankerRole)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white'
          }}
        >
          <option value="mission-tankers">Mission Tanker</option>
          <option value="recovery-tankers">Recovery Tanker</option>
        </select>
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

      {/* Action Buttons */}
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
          disabled={!callsign || !altitude || !!error}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: !callsign || !altitude || !!error ? '#CBD5E1' : '#2563EB',
            color: 'white',
            cursor: !callsign || !altitude || !!error ? 'not-allowed' : 'pointer'
          }}
        >
          {initialData ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  );
};

export type { TankerDivisionData };