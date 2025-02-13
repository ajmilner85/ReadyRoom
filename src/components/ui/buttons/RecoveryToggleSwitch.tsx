import React from 'react';
import { useSections } from '../../layout/SectionContext';

interface RecoveryDivision {
  id: string;
  label: string;
}

const generateCaseIDivisions = (): RecoveryDivision[] => [
  { id: 'recovery-inbound', label: 'INBOUND' },
  { id: 'recovery-6', label: 'ANGELS 6' },
  { id: 'recovery-5', label: 'ANGELS 5' },
  { id: 'recovery-4', label: 'ANGELS 4' },
  { id: 'recovery-3', label: 'ANGELS 3' },
  { id: 'recovery-2', label: 'ANGELS 2' },
  { id: 'recovery-spin', label: 'SPIN' },
  { id: 'recovery-charlie', label: 'CHARLIE' }
];

const generateCaseIIIIIDivisions = (): RecoveryDivision[] => {
  const divisions: RecoveryDivision[] = [
    { id: 'recovery-inbound', label: 'INBOUND' }
  ];
  
  // Add divisions from Angels 16 down to Angels 6
  for (let altitude = 16; altitude >= 6; altitude--) {
    const dme = altitude + 15; // DME = ANGELS + 15
    divisions.push({
      id: `recovery-${altitude}`,
      label: `DME ${dme} - ANGELS ${altitude}`
    });
  }
  
  return divisions;
};

export const RecoveryToggleSwitch: React.FC = () => {
  const { sections, updateSectionProperty } = useSections();
  
  // Find the Recovery section
  const recoverySection = sections.find(s => s.title === 'Recovery');
  
  // Determine current state (default to 0 if not set)
  const currentMode = recoverySection?.mode || 0;

  const handleToggle = () => {
    // Cycle through modes: 0 (Case I) -> 1 (Case II) -> 2 (Case III) -> 0
    const newMode = (currentMode + 1) % 3;
    
    // Update the mode
    updateSectionProperty('Recovery', 'mode', newMode);
    
    // Update the divisions based on the new mode
    const newDivisions = newMode === 0 
      ? generateCaseIDivisions() 
      : generateCaseIIIIIDivisions(); // Same for both Case II and III for now
    
    updateSectionProperty('Recovery', 'divisions', newDivisions);
  };

  // Define labels and styles for each mode
  const modes = [
    { label: 'CASE I', color: '#10B981', hover: '#059669' },
    { label: 'CASE II', color: '#F59E0B', hover: '#D97706' },
    { label: 'CASE III', color: '#EF4444', hover: '#DC2626' }
  ];

  return (
    <div 
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5
      }}
    >
      <button
        onClick={handleToggle}
        style={{
          width: '200px',
          height: '30px',
          background: modes[currentMode].color,
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '14px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = modes[currentMode].hover;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = modes[currentMode].color;
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {modes[currentMode].label}
      </button>
    </div>
  );
};