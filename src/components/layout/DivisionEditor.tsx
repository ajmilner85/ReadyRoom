import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Edit2, Trash2 } from 'lucide-react';
import { useSections, Division } from './SectionContext';
import { LaunchDivisionDialog } from './LaunchDivisionDialog';
import { EnRouteDivisionDialog } from './EnRouteDivisionDialog';
import { TankerDivisionDialog } from './TankerDivisionDialog';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';
import type { TankerDivisionData } from '../../types/TankerTypes';

interface DivisionEditorProps {
  sectionTitle: string;
  division: Division;
  sectionRef?: { current: HTMLDivElement | null };
}

const ConfirmDeleteDialog: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  sectionTitle: string;
  divisionLabel: string;
}> = ({ onConfirm, onCancel, sectionTitle, divisionLabel }) => {
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
        marginBottom: '16px',
        fontFamily: 'Inter',
        fontSize: '14px',
        color: '#64748B',
        textAlign: 'center'
      }}>
        Are you sure you want to delete the {sectionTitle} division "{divisionLabel}"?
      </div>

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
          onClick={onConfirm}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#EF4444',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

const DivisionEditor: React.FC<DivisionEditorProps> = ({ 
  sectionTitle, 
  division, 
  sectionRef 
}) => {
  // Disable editing for Recovery section
  if (sectionTitle === "Recovery") {
    return null;
  }

  const { updateDivisionLabel, removeDivision } = useSections();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmingDelete(true);
  };

  const confirmRemove = () => {
    try {
      removeDivision(sectionTitle, division.id);
    } catch (error) {
      console.error('Error removing division:', error);
    }
    setIsConfirmingDelete(false);
  };

  const handleSave = (data: number | Omit<EnRouteDivisionData, 'label'> | Omit<TankerDivisionData, 'label'>) => {
    let label = '';
    let additionalData;

    try {
      if (sectionTitle === "Launch") {
        const stepTime = data as number;
        label = `STEP +${stepTime}min`;
        additionalData = { stepTime };
      } else if (sectionTitle === "En Route/Tasking") {
        const enRouteData = data as Omit<EnRouteDivisionData, 'label'>;
        label = `Angels ${enRouteData.blockFloor}-${enRouteData.blockCeiling} ${enRouteData.missionType}`;
        additionalData = { ...enRouteData, label };
      } else if (sectionTitle === "Tanker") {
        const tankerData = data as Omit<TankerDivisionData, 'label'>;
        label = `${tankerData.callsign} - Angels ${tankerData.altitude}`;
        additionalData = { ...tankerData, label };
      }

      updateDivisionLabel(sectionTitle, division.id, label, additionalData);
    } catch (error) {
      console.error('Error updating division label:', error);
    }
    
    setIsEditing(false);
  };

  const renderDialogPortal = (dialogComponent: React.ReactNode) => {
    const targetElement = sectionRef?.current || document.body;

    return ReactDOM.createPortal(
      <>
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          pointerEvents: 'auto'
        }} onClick={() => {
          setIsEditing(false);
          setIsConfirmingDelete(false);
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 10000
        }}>
          <div style={{
            pointerEvents: 'auto',
            zIndex: 10001
          }}>
            {dialogComponent}
          </div>
        </div>
      </>,
      targetElement
    );
  };

  const renderEditDialog = () => {
    try {
      let dialogComponent = null;
      if (sectionTitle === "Launch") {
        dialogComponent = (
          <LaunchDivisionDialog
            initialStepTime={division.stepTime}
            onSave={(stepTime) => handleSave(stepTime)}
            onCancel={() => setIsEditing(false)}
          />
        );
      } else if (sectionTitle === "En Route/Tasking") {
        dialogComponent = (
          <EnRouteDivisionDialog
            onSave={(data) => handleSave(data)}
            onCancel={() => setIsEditing(false)}
            initialData={{
              blockFloor: division.blockFloor || 0,
              blockCeiling: division.blockCeiling || 0,
              missionType: division.missionType || ''
            }}
          />
        );
      } else if (sectionTitle === "Tanker") {
        dialogComponent = (
          <TankerDivisionDialog
            onSave={(data) => handleSave(data)}
            onCancel={() => setIsEditing(false)}
            initialData={{
              callsign: division.callsign || '',
              altitude: division.altitude || 0,
              aircraftType: division.aircraftType as any || 'S-3B',
              role: division.groupType as any || 'mission-tankers'
            }}
          />
        );
      }

      return renderDialogPortal(dialogComponent);
    } catch (error) {
      console.error('Error rendering edit dialog:', error);
      return null;
    }
  };

  const renderConfirmDeleteDialog = () => {
    return renderDialogPortal(
      <ConfirmDeleteDialog
        onConfirm={confirmRemove}
        onCancel={() => setIsConfirmingDelete(false)}
        sectionTitle={sectionTitle}
        divisionLabel={division.label}
      />
    );
  };

  return (
    <>
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
      </div>

      {isConfirmingDelete && renderConfirmDeleteDialog()}
      {isEditing && renderEditDialog()}
    </>
  );
};

const AddDivisionButton: React.FC<{
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

export { DivisionEditor as default, AddDivisionButton, ConfirmDeleteDialog };