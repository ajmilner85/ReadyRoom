import React from 'react';
import { statusFilterStyles, pilotDetailsStyles } from '../../../styles/RosterManagementStyles';

interface StatusFilterProps {
  activeStatusFilter: boolean | null;
  setActiveStatusFilter: (status: boolean | null) => void;
}

const StatusFilter: React.FC<StatusFilterProps> = ({ activeStatusFilter, setActiveStatusFilter }) => {
  return (
    <div style={statusFilterStyles.container}>
      <div 
        style={pilotDetailsStyles.filterTab(activeStatusFilter === null)}
        onClick={() => setActiveStatusFilter(null)}
      >
        All
      </div>
      <div 
        style={pilotDetailsStyles.filterTab(activeStatusFilter === true)}
        onClick={() => setActiveStatusFilter(true)}
      >
        Active
      </div>
      <div 
        style={pilotDetailsStyles.filterTab(activeStatusFilter === false)}
        onClick={() => setActiveStatusFilter(false)}
      >
        Inactive
      </div>
    </div>
  );
};

export default StatusFilter;