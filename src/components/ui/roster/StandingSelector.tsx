import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Standing } from '../../../utils/standingService';

interface StandingSelectorProps {
  standings: Standing[];
  selectedStandingId: string;
  updatingStanding: boolean;
  handleStandingChange: (standingId: string) => void;
  placeholder?: string;
}

const StandingSelector: React.FC<StandingSelectorProps> = ({
  standings,
  selectedStandingId,
  updatingStanding,
  handleStandingChange,
  placeholder
}) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={pilotDetailsStyles.fieldLabel}>
        Standing
      </label>
      <div style={{...pilotDetailsStyles.selectorContainer, width: '450px'}}>
        <select
          value={selectedStandingId || ''}
          onChange={(e) => handleStandingChange(e.target.value)}
          disabled={updatingStanding}
          style={{...pilotDetailsStyles.selector, width: '450px', appearance: 'none' as const}}
        >
          {!selectedStandingId && <option value="">{placeholder || '-- Select standing --'}</option>}
          {standings.sort((a, b) => a.order - b.order).map(standing => (
            <option key={standing.id} value={standing.id}>
              {standing.name}
            </option>
          ))}
        </select>
        <div style={pilotDetailsStyles.selectorArrow}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 8.5L2 4.5H10L6 8.5Z" fill="#64748B"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default StandingSelector;
