import React, { useEffect, useState } from 'react';
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
  // Track the current selected value internally to handle "No role" properly
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  
  // Update the internal state when pilotRoles changes
  useEffect(() => {
    if (pilotRoles.length > 0) {
      setSelectedRoleId(pilotRoles[0].id);
    } else {
      setSelectedRoleId('');
    }
  }, [pilotRoles]);
  
  // Handle selection change
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedRoleId(newValue);
    handleRoleChange(newValue);
  };
  
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={pilotDetailsStyles.fieldLabel}>
        Role
      </label>
      <div style={{...pilotDetailsStyles.selectorContainer, width: '450px'}}>
        <select
          value={selectedRoleId}
          onChange={handleChange}
          disabled={updatingRoles || loadingRoles}
          style={{...pilotDetailsStyles.selector, width: '450px', appearance: 'none' as const}}
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