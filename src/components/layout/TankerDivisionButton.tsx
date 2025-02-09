import React, { useState } from 'react';
import { useSections } from './SectionContext';
import { TankerDivisionDialog } from './TankerDivisionDialog';
import type { TankerDivisionData } from '../../types/TankerTypes';

export const TankerDivisionButton: React.FC<{
  sectionTitle: string;
  position: 'top' | 'bottom';
}> = ({ sectionTitle, position }) => {
  const { addDivision } = useSections();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSave = (dialogData: Omit<TankerDivisionData, 'label'>) => {
    const label = `${dialogData.callsign} - Angels ${dialogData.altitude}`;
    const fullData: TankerDivisionData = {
      ...dialogData,
      label
    };
    addDivision(sectionTitle, fullData, position);
    setIsDialogOpen(false);
  };

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5
      }}>
        <button
          onClick={() => setIsDialogOpen(true)}
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
            justifyContent: 'center'
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
      </div>
      {isDialogOpen && (
        <>
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }} onClick={() => setIsDialogOpen(false)} />
          <TankerDivisionDialog
            onSave={handleSave}
            onCancel={() => setIsDialogOpen(false)}
          />
        </>
      )}
    </>
  );
};