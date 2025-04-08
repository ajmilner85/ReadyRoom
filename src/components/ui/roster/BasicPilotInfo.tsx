import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';

interface BasicPilotInfoProps {
  pilot: Pilot;
}

const BasicPilotInfo: React.FC<BasicPilotInfoProps> = ({ pilot }) => {
  // Define consistent field style with explicit height
  const fieldValueStyle = {
    ...pilotDetailsStyles.fieldValue,
    minHeight: '35px', // Ensure consistent height
    width: '450px', // Match the width of input fields
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center'
  };

  // Define consistent section spacing
  const sectionSpacingStyle = {
    marginBottom: '24px' // Consistent spacing between sections
  };

  return (
    <>
      <div style={{...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle}}>
        <label style={pilotDetailsStyles.fieldLabel}>
          Board Number
        </label>
        <div style={fieldValueStyle}>
          {pilot.boardNumber}
        </div>
      </div>
      
      <div style={{...pilotDetailsStyles.fieldContainer, ...sectionSpacingStyle}}>
        <label style={pilotDetailsStyles.fieldLabel}>
          Callsign
        </label>
        <div style={fieldValueStyle}>
          {pilot.callsign}
        </div>
      </div>
      
      <div style={sectionSpacingStyle}>
        <label style={pilotDetailsStyles.fieldLabel}>
          Discord Username
        </label>
        <div style={fieldValueStyle}>
          {pilot.discordUsername || '\u00A0'}
        </div>
      </div>
    </>
  );
};

export default BasicPilotInfo;