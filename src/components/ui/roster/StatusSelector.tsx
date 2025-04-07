import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Status } from '../../../utils/statusService';

interface StatusSelectorProps {
  statuses: Status[];
  selectedStatusId: string;
  updatingStatus: boolean;
  handleStatusChange: (statusId: string) => void;
}

const StatusSelector: React.FC<StatusSelectorProps> = ({
  statuses,
  selectedStatusId,
  updatingStatus,
  handleStatusChange
}) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={pilotDetailsStyles.fieldLabel}>
        Status
      </label>
      <div style={pilotDetailsStyles.selectorContainer}>
        <select
          value={selectedStatusId || ''}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={updatingStatus}
          style={pilotDetailsStyles.selector}
        >
          {statuses.sort((a, b) => a.order - b.order).map(status => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
          {!selectedStatusId && <option value="">-- Select status --</option>}
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

export default StatusSelector;