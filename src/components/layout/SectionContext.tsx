import React, { createContext, useContext, useState } from 'react';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';
import type { TankerDivisionData } from '../ui/dialogs/TankerDivisionDialog';

export interface Division {
  id: string;
  label: string;
  groupType?: 'mission-tankers' | 'recovery-tankers';
  stepTime?: number;
  blockFloor?: number;
  blockCeiling?: number;
  missionType?: string;
  // Add tanker-specific properties
  callsign?: string;
  altitude?: number;
  aircraftType?: string;
}

export interface Section {
  title: string;
  type: 'launch' | 'altitude' | 'tanker';
  divisions: Division[];
  mode?: 0 | 1 | 2; // For Recovery section
}

interface SectionContextType {
  sections: Section[];
  addDivision: (sectionTitle: string, labelOrData: string | number | EnRouteDivisionData | TankerDivisionData, position: 'top' | 'bottom') => void;
  removeDivision: (sectionTitle: string, divisionId: string) => void;
  updateDivisionLabel: (
    sectionTitle: string, 
    divisionId: string, 
    newLabel: string, 
    additionalData?: { stepTime?: number } | EnRouteDivisionData | TankerDivisionData
  ) => void;
  reorderDivisions: (sectionTitle: string, startIndex: number, endIndex: number) => void;
  updateSectionProperty: (sectionTitle: string, property: string, value: any) => void;
}

const defaultSections: Section[] = [
  {
    title: "Launch",
    type: 'launch',
    divisions: [
      { id: 'launch-5', label: "STEP +25min", stepTime: 25 },
      { id: 'launch-4', label: "STEP +20min", stepTime: 20 },
      { id: 'launch-3', label: "STEP +15min", stepTime: 15 },
      { id: 'launch-2', label: "STEP +10min", stepTime: 10 },
      { id: 'launch-1', label: "STEP +5min", stepTime: 5 },
      { id: 'launch-0', label: "STEP +0min", stepTime: 0 }
    ]
  },
  {
    title: "En Route/Tasking",
    type: 'altitude',
    divisions: []  // Start empty
  },
  {
    title: "Recovery",
    type: 'altitude',
    mode: 0, // Normal mode
    divisions: [
      { id: 'recovery-5', label: "Angels 12" },
      { id: 'recovery-4', label: "Angels 10" },
      { id: 'recovery-3', label: "Angels 8" },
      { id: 'recovery-2', label: "Angels 6" },
      { id: 'recovery-1', label: "Angels 4" },
      { id: 'recovery-0', label: "Angels 2" },
      { id: 'recovery-spin', label: "Spin" },
      { id: 'recovery-charlie', label: "Charlie" }
    ]
  },
  {
    title: "Tanker",
    type: 'tanker',
    divisions: [
      {
        id: 'tanker-0',
        label: 'BLOODHOUND - ANGELS 6',
        callsign: 'BLOODHOUND',
        altitude: 6,
        aircraftType: 'S-3B',
        groupType: 'recovery-tankers'
      }
    ]
  }
];

const SectionContext = createContext<SectionContextType | undefined>(undefined);

export const SectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sections, setSections] = useState<Section[]>(defaultSections);

  const updateSectionProperty = (sectionTitle: string, property: string, value: any) => {
    setSections(prevSections => 
      prevSections.map(section => 
        section.title === sectionTitle 
          ? { ...section, [property]: value } 
          : section
      )
    );
  };

  const removeDivision = (sectionTitle: string, divisionId: string) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
          return {
            ...section,
            divisions: section.divisions.filter(div => div.id !== divisionId)
          };
        }
        return section;
      });
    });
  };

  const updateDivisionLabel = (
    sectionTitle: string, 
    divisionId: string, 
    newLabel: string,
    additionalData?: { stepTime?: number } | EnRouteDivisionData | TankerDivisionData
  ) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
          const updatedDivisions = section.divisions.map(div => {
            if (div.id === divisionId) {
              const updatedDiv = { ...div, label: newLabel };
              if (additionalData) {
                Object.assign(updatedDiv, additionalData);
              }
              return updatedDiv;
            }
            return div;
          });

          // Sort launches by step time
          if (section.type === 'launch') {
            updatedDivisions.sort((a, b) => (b.stepTime ?? 0) - (a.stepTime ?? 0));
          }
          // Sort En Route divisions by block ceiling
          else if (section.title === "En Route/Tasking") {
            updatedDivisions.sort((a, b) => (b.blockCeiling ?? 0) - (a.blockCeiling ?? 0));
          }
          // Sort and group tanker divisions
          else if (section.type === 'tanker') {
            // Split tankers by role
            const missionTankers = updatedDivisions
              .filter(d => d.groupType === 'mission-tankers')
              .sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0)); // Descending order - lower altitudes at bottom

            const recoveryTankers = updatedDivisions
              .filter(d => d.groupType === 'recovery-tankers')
              .sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0)); // Descending order - lower altitudes at bottom

            // Return sorted divisions with mission tankers at top, recovery at bottom
            return { ...section, divisions: [...missionTankers, ...recoveryTankers] };
          }

          return { ...section, divisions: updatedDivisions };
        }
        return section;
      });
    });
  };

  const addDivision = (sectionTitle: string, labelOrData: string | number | EnRouteDivisionData | TankerDivisionData, position: 'top' | 'bottom') => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
          const newDivisions = [...section.divisions];
          let newDivision: Division;

          if (section.type === 'launch') {
            const stepTime = typeof labelOrData === 'number' ? labelOrData : 0;
            newDivision = {
              id: `launch-${newDivisions.length}`,
              label: `STEP +${stepTime}min`,
              stepTime
            };
            
            // Insert the new division in the correct position based on stepTime
            const insertIndex = newDivisions.findIndex(d => (d.stepTime ?? 0) < stepTime);
            if (insertIndex === -1) {
              newDivisions.push(newDivision);
            } else {
              newDivisions.splice(insertIndex, 0, newDivision);
            }
          } else if (section.title === "En Route/Tasking") {
            // Handle En Route division
            const data = labelOrData as EnRouteDivisionData;
            newDivision = {
              id: `enroute-${newDivisions.length}`,
              label: data.blockFloor === data.blockCeiling 
                ? `ANGELS ${data.blockFloor}`
                : `ANGELS ${data.blockFloor}-${data.blockCeiling} ${data.missionType}`,
              blockFloor: data.blockFloor,
              blockCeiling: data.blockCeiling,
              missionType: data.missionType
            };

            // Insert the new division in the correct position based on blockCeiling
            const insertIndex = newDivisions.findIndex(d => (d.blockCeiling ?? 0) < data.blockCeiling);
            if (insertIndex === -1) {
              newDivisions.push(newDivision);
            } else {
              newDivisions.splice(insertIndex, 0, newDivision);
            }
          } else if (section.type === 'tanker') {
            // Handle Tanker division
            const data = labelOrData as TankerDivisionData;
            newDivision = {
              id: `tanker-${newDivisions.length}`,
              label: data.label,
              callsign: data.callsign,
              altitude: data.altitude,
              aircraftType: data.aircraftType,
              groupType: data.role
            };

            // Split existing divisions by role
            const missionTankers = newDivisions.filter(d => d.groupType === 'mission-tankers');
            const recoveryTankers = newDivisions.filter(d => d.groupType === 'recovery-tankers');

            // Add new division to appropriate group
            if (data.role === 'mission-tankers') {
              missionTankers.push(newDivision);
            } else {
              recoveryTankers.push(newDivision);
            }

            // Sort each group by altitude (descending - lower altitudes at bottom)
            missionTankers.sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));
            recoveryTankers.sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));

            // Combine the groups with mission tankers on top
            return { ...section, divisions: [...missionTankers, ...recoveryTankers] };
          } else {
            const label = typeof labelOrData === 'string' ? labelOrData : labelOrData.toString();
            newDivision = {
              id: `${section.type.toLowerCase()}-${newDivisions.length}`,
              label
            };
            
            if (position === 'top') {
              newDivisions.unshift(newDivision);
            } else {
              newDivisions.push(newDivision);
            }
          }

          return { ...section, divisions: newDivisions };
        }
        return section;
      });
    });
  };

  const reorderDivisions = (sectionTitle: string, startIndex: number, endIndex: number) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle && section.type !== 'launch' && section.title !== "En Route/Tasking") {
          const newDivisions = [...section.divisions];
          const [removed] = newDivisions.splice(startIndex, 1);
          newDivisions.splice(endIndex, 0, removed);
          return { ...section, divisions: newDivisions };
        }
        return section;
      });
    });
  };

  return (
    <SectionContext.Provider value={{
      sections,
      addDivision,
      removeDivision,
      updateDivisionLabel,
      reorderDivisions,
      updateSectionProperty
    }}>
      {children}
    </SectionContext.Provider>
  );
};

export const useSections = () => {
  const context = useContext(SectionContext);
  if (context === undefined) {
    throw new Error('useSections must be used within a SectionProvider');
  }
  return context;
};