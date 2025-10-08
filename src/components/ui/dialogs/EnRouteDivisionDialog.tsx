import React, { useState } from 'react';
import type { EnRouteDivisionData } from '../../../types/EnRouteTypes';

const MISSION_TYPES = [
  'SEAD', 'DEAD', 'BARCAP', 'DCA', 'FIGHTER SWEEP', 'STRIKE', 'INTERDICTION',
  'RECONNAISSANCE', 'CAS', 'SCAR', 'OCA', 'FAC(A)', 'HVAAE', 'TASMO', 'CSAR',
  'SSC', 'SSSC', 'MIW', 'EW', 'QRA', 'SHOW OF FORCE', 'MARITIME ESCORT',
  'AIR INTERDICTION', 'TRAINING', 'FAMILIARIZATION', 'NAVIGATION', 'FERRY',
  'QUALIFICATION', 'RANGE', 'EVALUATION'
].sort();

interface EnRouteDivisionDialogProps {
  onSave: (data: Omit<EnRouteDivisionData, 'label'>) => void;
  onCancel: () => void;
  initialData?: Omit<EnRouteDivisionData, 'label'>;
}

export const EnRouteDivisionDialog: React.FC<EnRouteDivisionDialogProps> = ({
  onSave,
  onCancel,
  initialData
}) => {
  const [altitude, setAltitude] = useState(
    initialData ? (initialData.blockCeiling ? `${initialData.blockFloor}-${initialData.blockCeiling}` : `${initialData.blockFloor}`) : ''
  );
  const [missionType, setMissionType] = useState(initialData?.missionType || MISSION_TYPES[0]);
  const [error, setError] = useState('');

  const handleAltitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, single numbers, or format like "10-13"
    if (value === '' || /^\d*-?\d*$/.test(value)) {
      setAltitude(value);
      setError('');
    }
  };

  const handleSubmit = () => {
    const isAltitudeBlock = altitude.includes('-');
    
    if (isAltitudeBlock) {
      const [floor, ceiling] = altitude.split('-').map(num => parseInt(num));
      
      if (!floor || !ceiling) {
        setError('Please enter valid altitude block (e.g., 10-13)');
        return;
      }

      if (floor >= ceiling) {
        setError('Block ceiling must be higher than floor');
        return;
      }

      if (floor < 1 || ceiling > 99) {
        setError('Altitude must be between 1 and 99');
        return;
      }

      onSave({
        blockFloor: floor,
        blockCeiling: ceiling,
        missionType
      });
    } else {
      const specificAltitude = parseInt(altitude);
      
      if (!specificAltitude || specificAltitude < 1 || specificAltitude > 99) {
        setError('Altitude must be between 1 and 99');
        return;
      }

      onSave({
        blockFloor: specificAltitude,
        blockCeiling: specificAltitude,
        missionType: '',  // Don't include mission type for single altitudes
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error && altitude) {
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
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#64748B'
        }}>
          Altitude (e.g., 15 or 10-13)
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
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
          autoFocus
        />
      </div>

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
          Mission Type
        </label>
        <select
          value={missionType}
          onChange={(e) => setMissionType(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white',
            boxSizing: 'border-box'
          }}
        >
          {MISSION_TYPES.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
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
          disabled={!altitude || !!error}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: !altitude || !!error ? '#CBD5E1' : '#2563EB',
            color: 'white',
            cursor: !altitude || !!error ? 'not-allowed' : 'pointer'
          }}
        >
          {initialData ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  );
};