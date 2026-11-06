import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';

import { Squadron } from '../../../utils/squadronService';

interface SquadronSelectorProps {
  squadrons: Squadron[];
  selectedSquadronId: string;
  updatingSquadron: boolean;
  handleSquadronChange: (squadronId: string) => void;
  placeholder?: string;
  /** Bulk edit: the empty option means "no change", so offer an explicit unassign choice. */
  showUnassignOption?: boolean;
}

/** Sentinel value for "remove squadron affiliation" in bulk edit (distinct from "" = no change). */
export const UNASSIGN_SQUADRON = '__unassign__';

const SquadronSelector: React.FC<SquadronSelectorProps> = ({
  squadrons,
  selectedSquadronId,
  updatingSquadron,
  handleSquadronChange,
  placeholder,
  showUnassignOption = false
}) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={pilotDetailsStyles.fieldLabel}>
        Squadron
      </label>
      <div style={{...pilotDetailsStyles.selectorContainer, width: '100%', maxWidth: '450px'}}>
        <select
          value={selectedSquadronId || ''}
          onChange={(e) => handleSquadronChange(e.target.value)}
          disabled={updatingSquadron}
          style={{...pilotDetailsStyles.selector, width: '100%', appearance: 'none' as any}}
        >
          <option value="">{placeholder || '-- Unassigned --'}</option>
          {showUnassignOption ? <option value={UNASSIGN_SQUADRON}>-- Unassigned (remove squadron) --</option> : null}
          {squadrons
            .filter(squadron => !squadron.deactivated_date) // Only show active squadrons
            .sort((a, b) => a.designation.localeCompare(b.designation))
            .map(squadron => (
            <option key={squadron.id} value={squadron.id}>
              {squadron.designation} - {squadron.name}
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

export default SquadronSelector;