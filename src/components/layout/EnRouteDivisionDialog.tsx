import React, { useState } from 'react';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';

const MISSION_TYPES = [
  'SEAD', 'DEAD', 'BARCAP', 'DCA', 'FIGHTER SWEEP', 'STRIKE', 'INTERDICTION',
  'RECONNAISSANCE', 'CAS', 'SCAR', 'OCA', 'FAC(A)', 'HVAAE', 'TASMO', 'CSAR',
  'SSC', 'SSSC', 'MIW', 'EW', 'QRA', 'SHOW OF FORCE', 'MARITIME ESCORT',
  'AIR INTERDICTION'
].sort();

interface EnRouteDivisionDialogProps {
  onSave: (data: Omit<EnRouteDivisionData, 'label'>) => void;
  onCancel: () => void;
}

export const EnRouteDivisionDialog: React.FC<EnRouteDivisionDialogProps> = ({
  onSave,
  onCancel
}) => {
  const [altitudeBlock, setAltitudeBlock] = useState('');
  const [missionType, setMissionType] = useState(MISSION_TYPES[0]);
  const [error, setError] = useState('');

  const handleAltitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or format like "10-13"
    if (value === '' || /^\d*-?\d*$/.test(value)) {
      setAltitudeBlock(value);
      setError('');
    }
  };

  const handleSubmit = () => {
    // Parse altitude block
    const [floor, ceiling] = altitudeBlock.split('-').map(num => parseInt(num));
    
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error && altitudeBlock) {
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
          Altitude Block (e.g., 10-13)
        </label>
        <input
          type="text"
          value={altitudeBlock}
          onChange={handleAltitudeChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter altitude block"
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
            backgroundColor: 'white'
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
          disabled={!altitudeBlock || !!error}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: !altitudeBlock || !!error ? '#CBD5E1' : '#2563EB',
            color: 'white',
            cursor: !altitudeBlock || !!error ? 'not-allowed' : 'pointer'
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
};