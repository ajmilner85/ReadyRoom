import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';

interface BasicPilotInfoProps {
  pilot: Pilot;
}

const BasicPilotInfo: React.FC<BasicPilotInfoProps> = ({ pilot }) => {
  return (
    <>
      <div style={pilotDetailsStyles.header}>
        <h1 style={pilotDetailsStyles.headerTitle}>
          <span style={pilotDetailsStyles.boardNumber}>{pilot.boardNumber}</span>
          {pilot.callsign}
          <span style={pilotDetailsStyles.roleText}>
            {pilot.role || ''}
          </span>
        </h1>
      </div>

      <div style={pilotDetailsStyles.fieldContainer}>
        <label style={pilotDetailsStyles.fieldLabel}>
          Board Number
        </label>
        <div style={pilotDetailsStyles.fieldValue}>
          {pilot.boardNumber}
        </div>
      </div>
      
      <div style={pilotDetailsStyles.fieldContainer}>
        <label style={pilotDetailsStyles.fieldLabel}>
          Callsign
        </label>
        <div style={pilotDetailsStyles.fieldValue}>
          {pilot.callsign}
        </div>
      </div>
      
      <div>
        <label style={pilotDetailsStyles.fieldLabel}>
          Discord Username
        </label>
        <div style={pilotDetailsStyles.fieldValue}>
          {pilot.discordUsername}
        </div>
      </div>
    </>
  );
};

export default BasicPilotInfo;