import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { useSections, Division } from './SectionContext';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';

const MISSION_TYPES = [
  'SEAD', 'DEAD', 'BARCAP', 'DCA', 'FIGHTER SWEEP', 'STRIKE', 'INTERDICTION',
  'RECONNAISSANCE', 'CAS', 'SCAR', 'OCA', 'FAC(A)', 'HVAAE', 'TASMO', 'CSAR',
  'SSC', 'SSSC', 'MIW', 'EW', 'QRA', 'SHOW OF FORCE', 'MARITIME ESCORT',
  'AIR INTERDICTION'
].sort();

interface DivisionEditorProps {
  sectionTitle: string;
  division: Division;
}

const DivisionEditor: React.FC<DivisionEditorProps> = ({ sectionTitle, division }) => {
  const { updateDivisionLabel, removeDivision } = useSections();
  const [isEditing, setIsEditing] = useState(false);
  const [stepTime, setStepTime] = useState(division.stepTime?.toString() ?? '');
  const [altitudeBlock, setAltitudeBlock] = useState(
    division.blockFloor && division.blockCeiling 
      ? `${division.blockFloor}-${division.blockCeiling}`
      : ''
  );
  const [missionType, setMissionType] = useState(division.missionType ?? MISSION_TYPES[0]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSave = () => {
    if (sectionTitle === "Launch") {
      const time = parseInt(stepTime);
      if (!isNaN(time) && time >= 0) {
        updateDivisionLabel(sectionTitle, division.id, `STEP +${time}min`, { stepTime: time });
      }
    } else if (sectionTitle === "En Route/Tasking") {
      const [floor, ceiling] = altitudeBlock.split('-').map(num => parseInt(num));
      if (!isNaN(floor) && !isNaN(ceiling) && floor < ceiling) {
        const data: EnRouteDivisionData = {
          label: "test", 
          blockFloor: floor,
          blockCeiling: ceiling,
          missionType
        };
        updateDivisionLabel(
          sectionTitle, 
          division.id, 
          `Angels ${floor}-${ceiling} ${missionType}`,
          data
        );
      }
    } else {
      // Regular text editing for other sections
      updateDivisionLabel(sectionTitle, division.id, division.label);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setStepTime(division.stepTime?.toString() ?? '');
      setAltitudeBlock(
        division.blockFloor && division.blockCeiling 
          ? `${division.blockFloor}-${division.blockCeiling}`
          : ''
      );
      setMissionType(division.missionType ?? MISSION_TYPES[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeDivision(sectionTitle, division.id);
  };

  const renderEditContent = () => {
    if (sectionTitle === "Launch") {
      return (
        <input
          type="text"
          value={stepTime}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '' || /^\d+$/.test(value)) {
              setStepTime(value);
            }
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          style={{
            padding: '4px 8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            width: '60px'
          }}
          placeholder="Time"
          autoFocus
        />
      );
    } else if (sectionTitle === "En Route/Tasking") {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={altitudeBlock}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || /^\d*-?\d*$/.test(value)) {
                setAltitudeBlock(value);
              }
            }}
            onKeyDown={handleKeyDown}
            style={{
              padding: '4px 8px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '14px',
              width: '80px'
            }}
            placeholder="10-13"
            autoFocus
          />
          <select
            value={missionType}
            onChange={(e) => setMissionType(e.target.value)}
            onBlur={handleSave}
            style={{
              padding: '4px 8px',
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
      );
    }
    return null;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 5
    }}>
      {isEditing ? (
        renderEditContent()
      ) : (
        <>
          <button
            onClick={handleEditClick}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title="Edit division"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={handleRemove}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title="Remove division"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
};

export const AddDivisionButton: React.FC<{
    sectionTitle: string;
    position: 'top' | 'bottom';
  }> = ({ sectionTitle, position }) => {
    const { addDivision } = useSections();
    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState('');
  
    const handleAdd = () => {
      if (newLabel.trim()) {
        addDivision(sectionTitle, newLabel.trim(), position);
        setNewLabel('');
      }
      setIsAdding(false);
    };
  
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleAdd();
      } else if (e.key === 'Escape') {
        setIsAdding(false);
        setNewLabel('');
      }
    };
  
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5 // Added explicit z-index
      }}>
        {isAdding ? (
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={handleKeyDown}
            placeholder="Enter division label"
            style={{
              width: '119px',
              height: '30px',
              padding: '4px 8px',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '14px'
            }}
            autoFocus
          />
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              position: 'absolute',
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5 // Added explicit z-index
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
        )}
      </div>
    );
  };

export default DivisionEditor;