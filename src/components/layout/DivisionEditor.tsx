import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Trash2 } from 'lucide-react';
import { useSections, Division } from './SectionContext';
import { LaunchDivisionDialog } from './LaunchDivisionDialog';
import { EnRouteDivisionDialog } from './EnRouteDivisionDialog';
import { TankerDivisionDialog } from './TankerDivisionDialog';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';
import type { TankerDivisionData } from '../../types/TankerTypes';

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
  // Disable editing for Recovery section
  if (sectionTitle === "Recovery") {
    return null;
  }

  const { updateDivisionLabel, removeDivision } = useSections();
  const [isEditing, setIsEditing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeDivision(sectionTitle, division.id);
  };

  const handleSave = (data: number | Omit<EnRouteDivisionData, 'label'> | Omit<TankerDivisionData, 'label'>) => {
    let label = '';
    let additionalData;

    if (sectionTitle === "Launch") {
      const stepTime = data as number;
      label = `STEP +${stepTime}min`;
      additionalData = { stepTime };
    } else if (sectionTitle === "En Route/Tasking") {
      const enRouteData = data as Omit<EnRouteDivisionData, 'label'>;
      label = `Angels ${enRouteData.blockFloor}-${enRouteData.blockCeiling} ${enRouteData.missionType}`;
      additionalData = enRouteData;
    } else if (sectionTitle === "Tanker") {
      const tankerData = data as Omit<TankerDivisionData, 'label'>;
      label = `${tankerData.callsign} - Angels ${tankerData.altitude}`;
      additionalData = tankerData;
    }

    updateDivisionLabel(sectionTitle, division.id, label, additionalData);
    setIsEditing(false);
  };

  const renderDialog = () => {
    if (sectionTitle === "Launch") {
      return (
        <LaunchDivisionDialog
          initialStepTime={division.stepTime}
          onSave={(stepTime) => handleSave(stepTime)}
          onCancel={() => setIsEditing(false)}
          sectionRef={editButtonRef}
        />
      );
    } else if (sectionTitle === "En Route/Tasking") {
      return (
        <EnRouteDivisionDialog
          initialData={{
            blockFloor: division.blockFloor,
            blockCeiling: division.blockCeiling,
            missionType: division.missionType
          }}
          onSave={(data) => handleSave(data)}
          onCancel={() => setIsEditing(false)}
          sectionRef={editButtonRef}
        />
      );
    } else if (sectionTitle === "Tanker") {
      return (
        <TankerDivisionDialog
          initialData={{
            callsign: division.callsign,
            altitude: division.altitude,
            aircraftType: division.aircraftType,
            role: division.groupType
          }}
          onSave={(data) => handleSave(data)}
          onCancel={() => setIsEditing(false)}
          sectionRef={editButtonRef}
        />
      );
    }
    return null;
  };

  return (
    <div 
      style={{
        position: 'absolute',
        left: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 5,
        width: '40px', 
        height: '100%', 
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div style={{
        position: 'absolute',
        left: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 5,
        opacity: isHovering ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        pointerEvents: isHovering ? 'auto' : 'none',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <button
            ref={editButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.1s ease',
            }}
            title="Edit division"
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }}
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={handleRemove}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.1s ease',
            }}
            title="Remove division"
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isEditing && createPortal(
        <>
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={() => setIsEditing(false)} />
          {renderDialog()}
        </>,
        document.body
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
      zIndex: 5
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
            zIndex: 5
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