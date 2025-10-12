import React, { createContext, useContext, useState } from 'react';
import type { EnRouteDivisionData } from '../../types/EnRouteTypes';

interface TankerDivisionData {
  label: string;
  callsign: string;
  altitude: number;
  aircraftType: string;
  role: 'mission-tankers' | 'recovery-tankers';
}

export interface Division {
  id: string;
  label: string;
  groupType?: 'mission-tankers' | 'recovery-tankers';
  stepTime?: number;
  blockFloor?: number;
  blockCeiling?: number;
  missionType?: string;
  callsign?: string;
  altitude?: number;
  aircraftType?: string;
  approachTime?: number;
}

export interface Section {
  title: string;
  type: 'launch' | 'altitude' | 'tanker';
  divisions: Division[];
  mode?: 0 | 1 | 2;
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
  adjustRecoveryTime: (altitude: number, minutesToAdd: number) => void;
  createLaunchDivisionsFromStepTimes: (stepTimes: number[]) => void;
}

const defaultSections: Section[] = [
  {
    title: "Launch",
    type: 'launch',
    divisions: [
      { id: 'launch-0', label: "STEP +0min", stepTime: 0 }
    ]
  },
  {
    title: "En Route/Tasking",
    type: 'altitude',
    divisions: []
  },
  {
    title: "Recovery",
    type: 'altitude',
    mode: 0,
    divisions: [
      { id: 'recovery-inbound', label: "INBOUND" },
      { id: 'recovery-6', label: "ANGELS 6" },
      { id: 'recovery-5', label: "ANGELS 5" },
      { id: 'recovery-4', label: "ANGELS 4" },
      { id: 'recovery-3', label: "ANGELS 3" },
      { id: 'recovery-2', label: "ANGELS 2" },
      { id: 'recovery-spin', label: "SPIN" },
      { id: 'recovery-charlie', label: "CHARLIE" }
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

          if (section.type === 'launch') {
            updatedDivisions.sort((a, b) => (b.stepTime ?? 0) - (a.stepTime ?? 0));
          } else if (section.title === "En Route/Tasking") {
            updatedDivisions.sort((a, b) => (b.blockCeiling ?? 0) - (a.blockCeiling ?? 0));
          } else if (section.type === 'tanker') {
            const missionTankers = updatedDivisions
              .filter(d => d.groupType === 'mission-tankers')
              .sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));

            const recoveryTankers = updatedDivisions
              .filter(d => d.groupType === 'recovery-tankers')
              .sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));

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
            
            const insertIndex = newDivisions.findIndex(d => (d.stepTime ?? 0) < stepTime);
            if (insertIndex === -1) {
              newDivisions.push(newDivision);
            } else {
              newDivisions.splice(insertIndex, 0, newDivision);
            }
          } else if (section.title === "En Route/Tasking") {
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

            const insertIndex = newDivisions.findIndex(d => (d.blockCeiling ?? 0) < data.blockCeiling);
            if (insertIndex === -1) {
              newDivisions.push(newDivision);
            } else {
              newDivisions.splice(insertIndex, 0, newDivision);
            }
          } else if (section.type === 'tanker') {
            const data = labelOrData as TankerDivisionData;
            newDivision = {
              id: `tanker-${newDivisions.length}`,
              label: data.label,
              callsign: data.callsign,
              altitude: data.altitude,
              aircraftType: data.aircraftType,
              groupType: data.role
            };

            const missionTankers = newDivisions.filter(d => d.groupType === 'mission-tankers');
            const recoveryTankers = newDivisions.filter(d => d.groupType === 'recovery-tankers');

            if (data.role === 'mission-tankers') {
              missionTankers.push(newDivision);
            } else {
              recoveryTankers.push(newDivision);
            }

            missionTankers.sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));
            recoveryTankers.sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0));

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

  const adjustRecoveryTime = (altitude: number, minutesToAdd: number) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === 'Recovery') {
          const numberedDivisions = section.divisions
            .map(div => {
              const match = div.id.match(/recovery-(\d+)/);
              if (!match) return null;
              const divAltitude = parseInt(match[1]);
              if (divAltitude < 6) return null;
              return { div, altitude: divAltitude };
            })
            .filter((item): item is { div: Division; altitude: number } => item !== null)
            .sort((a, b) => a.altitude - b.altitude);

          const adjustingDivIndex = numberedDivisions.findIndex(item => item.altitude === altitude);
          if (adjustingDivIndex === -1) return section;

          const adjustingDiv = numberedDivisions[adjustingDivIndex];
          const newTime = ((adjustingDiv.div.approachTime! + minutesToAdd + 60) % 60);

          // Check if we're decrementing and there's a lower division
          if (minutesToAdd < 0 && adjustingDivIndex > 0) {
            const lowerDiv = numberedDivisions[adjustingDivIndex - 1];
            // If new time would be <= the lower division's time, prevent the change
            if (newTime <= lowerDiv.div.approachTime!) {
              return section;
            }
          }

          const updatedDivisions = [...section.divisions];

          // Update the adjusting division
          const updatedAdjustingDiv = {
            ...adjustingDiv.div,
            approachTime: newTime,
            label: adjustingDiv.div.label.replace(/:\d{2}$/, `:${newTime.toString().padStart(2, '0')}`)
          };

          updatedDivisions[section.divisions.findIndex(d => d.id === adjustingDiv.div.id)] = updatedAdjustingDiv;

          let shouldPropagate = false;
          let currentTime = newTime;

          if (adjustingDivIndex < numberedDivisions.length - 1) {
            const nextDiv = numberedDivisions[adjustingDivIndex + 1];
            shouldPropagate = currentTime >= nextDiv.div.approachTime!;
          }

          if (shouldPropagate) {
            for (let i = adjustingDivIndex + 1; i < numberedDivisions.length; i++) {
              currentTime = (currentTime + 1) % 60;
              const div = numberedDivisions[i];
              const updatedDiv = {
                ...div.div,
                approachTime: currentTime,
                label: div.div.label.replace(/:\d{2}$/, `:${currentTime.toString().padStart(2, '0')}`)
              };
              updatedDivisions[section.divisions.findIndex(d => d.id === div.div.id)] = updatedDiv;
            }
          }

          return {
            ...section,
            divisions: updatedDivisions
          };
        }
        return section;
      });
    });
  };

  const createLaunchDivisionsFromStepTimes = React.useCallback((stepTimes: number[]) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === 'Launch') {
          // Get unique step times and ensure Step +0 is always included
          const uniqueStepTimes = Array.from(new Set([0, ...stepTimes])).sort((a, b) => a - b);

          // Create divisions for each unique step time
          // Use stepTime as the division ID suffix so it matches currentDivision values
          const newDivisions: Division[] = uniqueStepTimes.map((stepTime) => ({
            id: `launch-${stepTime}`,
            label: `STEP +${stepTime}min`,
            stepTime
          }));

          // Sort divisions by step time in descending order (highest first)
          newDivisions.sort((a, b) => (b.stepTime ?? 0) - (a.stepTime ?? 0));

          return { ...section, divisions: newDivisions };
        }
        return section;
      });
    });
  }, []);

  return (
    <SectionContext.Provider value={{
      sections,
      addDivision,
      removeDivision,
      updateDivisionLabel,
      reorderDivisions,
      updateSectionProperty,
      adjustRecoveryTime,
      createLaunchDivisionsFromStepTimes
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