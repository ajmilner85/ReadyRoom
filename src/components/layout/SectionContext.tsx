import React, { createContext, useContext, useState } from 'react';

export interface Division {
  id: string;
  label: string;
  groupType?: 'mission-tankers' | 'recovery-tankers';
}

export interface Section {
  title: string;
  type: 'launch' | 'altitude' | 'tanker';
  divisions: Division[];
}

interface SectionContextType {
  sections: Section[];
  addDivision: (sectionTitle: string, label: string, position: 'top' | 'bottom') => void;
  removeDivision: (sectionTitle: string, divisionId: string) => void;
  updateDivisionLabel: (sectionTitle: string, divisionId: string, newLabel: string) => void;
  reorderDivisions: (sectionTitle: string, startIndex: number, endIndex: number) => void;
}

const defaultSections: Section[] = [
  {
    title: "Launch",
    type: 'launch',
    divisions: [
      { id: 'launch-5', label: "STEP +25min" },
      { id: 'launch-4', label: "STEP +20min" },
      { id: 'launch-3', label: "STEP +15min" },
      { id: 'launch-2', label: "STEP +10min" },
      { id: 'launch-1', label: "STEP +5min" },
      { id: 'launch-0', label: "STEP +0min" }
    ]
  },
  {
    title: "En Route/Tasking",
    type: 'altitude',
    divisions: [
      { id: 'enroute-9', label: "Angels 28-30" },
      { id: 'enroute-8', label: "Angels 25-27" },
      { id: 'enroute-7', label: "Angels 22-24" },
      { id: 'enroute-6', label: "Angels 19-21" },
      { id: 'enroute-5', label: "Angels 16-18" },
      { id: 'enroute-4', label: "Angels 13-15" },
      { id: 'enroute-3', label: "Angels 10-12" },
      { id: 'enroute-2', label: "Angels 7-9" },
      { id: 'enroute-1', label: "Angels 4-6" },
      { id: 'enroute-0', label: "Angels 1-3" }
    ]
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
    divisions: [
      { id: 'tanker-0', label: "Shell - Angels 22", groupType: 'mission-tankers' },
      { id: 'tanker-1', label: "Texaco - Angels 20", groupType: 'mission-tankers' },
      { id: 'tanker-2', label: "Arco - Angels 18", groupType: 'mission-tankers' },
      { id: 'tanker-3', label: "Bloodhound - Angels 16", groupType: 'mission-tankers' },
      { id: 'tanker-4', label: "Recovery Tanker 1 - Angels 4", groupType: 'recovery-tankers' },
      { id: 'tanker-5', label: "Recovery Tanker 2 - Angels 4", groupType: 'recovery-tankers' }
    ]
  }
];

const SectionContext = createContext<SectionContextType | undefined>(undefined);

export const SectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sections, setSections] = useState<Section[]>(defaultSections);

  const addDivision = (sectionTitle: string, label: string, position: 'top' | 'bottom') => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
          const newDivisions = [...section.divisions];
          const newId = `${section.type.toLowerCase()}-${newDivisions.length}`;
          const newDivision = { id: newId, label };
          
          if (position === 'top') {
            newDivisions.unshift(newDivision);
          } else {
            newDivisions.push(newDivision);
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

  const updateDivisionLabel = (sectionTitle: string, divisionId: string, newLabel: string) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
          return {
            ...section,
            divisions: section.divisions.map(div =>
              div.id === divisionId ? { ...div, label: newLabel } : div
            )
          };
        }
        return section;
      });
    });
  };

  const reorderDivisions = (sectionTitle: string, startIndex: number, endIndex: number) => {
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.title === sectionTitle) {
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