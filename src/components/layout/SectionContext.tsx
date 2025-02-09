import React, { createContext, useContext, useState } from 'react';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';
import type { TankerDivisionData } from './TankerDivisionDialog';

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
    divisions: [
      { id: 'recovery-7', label: "Angels 16" },
      { id: 'recovery-6', label: "Angels 14" },
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
    divisions: []  // Start with empty tanker section
  }
];

const SectionContext = createContext<SectionContextType | undefined>(undefined);

export const SectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sections, setSections] = useState<Section[]>(defaultSections);

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
              label: data.label,
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

            // Sort each group by altitude (ascending - lower altitudes at bottom)
            missionTankers.sort((a, b) => (a.altitude || 0) - (b.altitude || 0));
            recoveryTankers.sort((a, b) => (a.altitude || 0) - (b.altitude || 0));

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
          return {
            ...section,
            divisions: section.divisions.map(div => {
              if (div.id === divisionId) {
                if (section.type === 'launch' && additionalData && 'stepTime' in additionalData) {
                  const updatedDiv = {
                    ...div,
                    label: newLabel,
                    stepTime: (additionalData as { stepTime: number }).stepTime
                  };

                  // Remove the current division from the list
                  const otherDivisions = section.divisions.filter(d => d.id !== div.id);

                  // Insert the updated division in the correct sorted position
                  const sortedDivisions = [...otherDivisions, updatedDiv]
                    .sort((a, b) => (a.stepTime ?? 0) - (b.stepTime ?? 0));

                  // Return the division in its new sorted position
                  return sortedDivisions.find(d => d.id === div.id) || updatedDiv;
                } else if (section.title === "En Route/Tasking" && additionalData) {
                  const enRouteData = additionalData as EnRouteDivisionData;
                  return {
                    ...div,
                    label: newLabel,
                    blockFloor: enRouteData.blockFloor,
                    blockCeiling: enRouteData.blockCeiling,
                    missionType: enRouteData.missionType
                  };
                } else if (section.type === 'tanker' && additionalData) {
                  const tankerData = additionalData as TankerDivisionData;
                  // First update the current division
                  const updatedDiv = {
                    ...div,
                    label: newLabel,
                    callsign: tankerData.callsign,
                    altitude: tankerData.altitude,
                    aircraftType: tankerData.aircraftType,
                    groupType: tankerData.role
                  };

                  // Get all divisions except the current one
                  const otherDivisions = section.divisions.filter(d => d.id !== div.id);
                  
                  // Split by role and add updated division to appropriate group
                  const missionTankers = otherDivisions
                    .filter(d => d.groupType === 'mission-tankers')
                    .concat(updatedDiv.groupType === 'mission-tankers' ? [updatedDiv] : []);
                  
                  const recoveryTankers = otherDivisions
                    .filter(d => d.groupType === 'recovery-tankers')
                    .concat(updatedDiv.groupType === 'recovery-tankers' ? [updatedDiv] : []);

                  // Sort each group by altitude (ascending - lower altitudes at bottom)
                  missionTankers.sort((a, b) => (a.altitude || 0) - (b.altitude || 0));
                  recoveryTankers.sort((a, b) => (a.altitude || 0) - (b.altitude || 0));

                  // Combine the groups, ensuring the updated division is in the correct group
                  const sortedDivisions = [...missionTankers, ...recoveryTankers];
                  
                  // Return the state with the sorted divisions
                  return sortedDivisions.find(d => d.id === div.id) || div;
                }
                return { ...div, label: newLabel };
              }
              return div;
            })
          };
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
      reorderDivisions
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