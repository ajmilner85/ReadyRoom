import React from 'react';
import { Pilot } from '../../../types/PilotTypes';
import QualificationBadge from '../QualificationBadge';
import { pilotListStyles } from '../../../styles/RosterManagementStyles';

interface PilotListItemProps {
  pilot: Pilot;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  pilotQualifications: any[];
  isDisabled?: boolean;
}

const PilotListItem: React.FC<PilotListItemProps> = ({
  pilot,
  isSelected,
  isHovered,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  pilotQualifications,
  isDisabled = false
}) => {
  // Render qualification badges for the pilot
  const renderQualificationBadges = () => {
    if (!pilotQualifications || pilotQualifications.length === 0) {
      return null;
    }
    
    // Use a Map for efficient deduplication
    const qualMap = new Map();
    pilotQualifications.forEach((pq: any) => {
      if (!qualMap.has(pq.qualification.id)) {
        qualMap.set(pq.qualification.id, pq);
      }
    });
    
    // Convert map back to array for rendering
    const uniqueQuals = Array.from(qualMap.values());
    
    return uniqueQuals.map((pq: any) => (
      <QualificationBadge 
        key={`${pilot.id}-${pq.qualification.id}`}
        type={pq.qualification.name}
        code={pq.qualification.code}
        color={pq.qualification.color}
      />
    ));
  };

  return (
    <div
      style={pilotListStyles.pilotRow(isSelected, isHovered)}
      onClick={isDisabled ? undefined : onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    >
      <span style={pilotListStyles.boardNumber}>
        {pilot.boardNumber}
      </span>
      <span style={pilotListStyles.callsign}>
        {pilot.callsign}
      </span>
      <span style={pilotListStyles.role}>
        {pilot.role || ''}
      </span>
      
      <div style={pilotListStyles.badgeContainer}>
        {renderQualificationBadges()}
      </div>
    </div>
  );
};

export default PilotListItem;