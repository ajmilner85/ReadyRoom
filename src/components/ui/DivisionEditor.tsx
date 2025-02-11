import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Edit2, Trash2 } from 'lucide-react';
import { useSections } from '../layout/SectionContext';
import { LaunchDivisionDialog } from './dialogs/LaunchDivisionDialog';
import { EnRouteDivisionDialog } from './dialogs/EnRouteDivisionDialog';
import { TankerDivisionDialog } from '../ui/dialogs/TankerDivisionDialog';
import { DeleteDivisionDialog } from './dialogs/DeleteDivisionDialog';
import { styles } from '../../styles/DivisionEditor';
import type { Division } from '../layout/SectionContext';
import type { Flight } from '../../types/FlightData';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';
import type { TankerDivisionData } from '../../types/TankerTypes';

interface DivisionEditorProps {
  sectionTitle: string;
  division: Division;
  sectionRef?: { current: HTMLDivElement | null };
  flights?: Flight[];
}

const DivisionEditor: React.FC<DivisionEditorProps> = ({ 
  sectionTitle, 
  division, 
  sectionRef,
  flights = []
}) => {
  if (sectionTitle === "Recovery") return null;

  const { updateDivisionLabel, removeDivision } = useSections();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const hasFlights = flights.some(flight => {
    const divisionId = division.id.split('-')[1];
    return flight.currentSection === sectionTitle && 
           (divisionId === 'spin' ? flight.currentDivision === -1 :
            divisionId === 'charlie' ? flight.currentDivision === -2 :
            flight.currentDivision === parseInt(divisionId));
  });

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
        label = enRouteData.blockFloor === enRouteData.blockCeiling
          ? `ANGELS ${enRouteData.blockFloor}`
          : `ANGELS ${enRouteData.blockFloor}-${enRouteData.blockCeiling} ${enRouteData.missionType}`;
        additionalData = { ...enRouteData };
        additionalData = { ...enRouteData, label };
      } else if (sectionTitle === "Tanker") {
        const tankerData = data as Omit<TankerDivisionData, 'label'>;
        label = `${tankerData.callsign} - ANGELS ${tankerData.altitude}`;
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
        <div 
          style={styles.modalOverlay} 
          onClick={() => {
            setIsEditing(false);
            setIsConfirmingDelete(false);
          }} 
        />
        <div style={styles.modalContainer}>
          <div style={styles.modalContent}>
            {dialogComponent}
          </div>
        </div>
      </>,
      targetElement
    );
  };

  const renderEditDialog = () => {
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

    return dialogComponent ? renderDialogPortal(dialogComponent) : null;
  };

  return (
    <>
      <div 
        style={styles.editorContainer}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div style={{
          ...styles.buttonContainer,
          opacity: isHovering ? 1 : 0,
          pointerEvents: isHovering ? 'auto' : 'none',
        }}>
          <div style={styles.buttonGroup}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              style={styles.actionButton}
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
            {!hasFlights && (
              <button
                onClick={() => setIsConfirmingDelete(true)}
                style={styles.actionButton}
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
            )}
          </div>
        </div>
      </div>

      {isConfirmingDelete && renderDialogPortal(
        <DeleteDivisionDialog
          onConfirm={() => {
            removeDivision(sectionTitle, division.id);
            setIsConfirmingDelete(false);
          }}
          onCancel={() => setIsConfirmingDelete(false)}
          sectionTitle={sectionTitle}
          divisionLabel={division.label}
        />
      )}
      {isEditing && renderEditDialog()}
    </>
  );
};

export default DivisionEditor;