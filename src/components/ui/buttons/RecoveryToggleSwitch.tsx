import React from 'react';
import { useSections } from '../../layout/SectionContext';

export const RecoveryToggleSwitch: React.FC = () => {
  const { sections, updateSectionProperty } = useSections();
  
  // Find the Recovery section
  const recoverySection = sections.find(s => s.title === 'Recovery');
  
  // Determine current state (default to 0 if not set)
  const currentMode = recoverySection?.mode || 0;

  const handleToggle = () => {
    // Cycle through modes: 0 -> 1 -> 2 -> 0
    const newMode = (currentMode + 1) % 3;
    
    updateSectionProperty('Recovery', 'mode', newMode);
  };

  // Define labels and styles for each mode
  const modes = [
    { label: 'CASE I', color: '#10B981' },
    { label: 'CASE II', color: '#F59E0B' },
    { label: 'CASE III', color: '#EF4444' }
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
          transition: 'background-color 0.3s ease'
        }}
      >
        {modes[currentMode].label}
      </button>
    </div>
  );
};