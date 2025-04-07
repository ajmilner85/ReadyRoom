import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Role } from '../../../utils/roleService';

interface RoleSelectorProps {
  roles: Role[];
  pilotRoles: Role[];
  updatingRoles: boolean;
  loadingRoles: boolean;
  disabledRoles: Record<string, boolean>;
  handleRoleChange: (roleId: string) => void;
}

const RoleSelector: React.FC<RoleSelectorProps> = ({
  roles,
  pilotRoles,
  updatingRoles,
  loadingRoles,
  disabledRoles,
  handleRoleChange
}) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={pilotDetailsStyles.fieldLabel}>
        Role
      </label>
      <div style={pilotDetailsStyles.selectorContainer}>
        <select
          value={pilotRoles.length > 0 ? pilotRoles[0].id : ''}
          onChange={(e) => handleRoleChange(e.target.value)}
          disabled={updatingRoles || loadingRoles}
          style={pilotDetailsStyles.selector}
        >
          <option value="">No Role</option>
          {roles
            .sort((a, b) => a.order - b.order)
            .map(role => (
              <option 
                key={role.id} 
                value={role.id}
                disabled={disabledRoles[role.id]}
              >
                {role.name}
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

export default RoleSelector;