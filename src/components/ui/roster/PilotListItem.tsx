import React, { useState, useRef } from 'react';
import { Pilot } from '../../../types/PilotTypes';
import QualificationBadge from '../QualificationBadge';
import PilotIDBadgeSm from '../PilotIDBadgeSm';
import { pilotListStyles } from '../../../styles/RosterManagementStyles';
import { useAppSettings } from '../../../context/AppSettingsContext';

interface PilotListItemProps {
  pilot: Pilot;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (event?: React.MouseEvent) => void;
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
  const { settings } = useAppSettings();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get squadron primary color for callsign styling
  const getSquadronPrimaryColor = () => {
    // When setting is disabled, use black for assigned pilots, dark gray for unassigned
    if (!settings.displayPilotsWithSquadronColors) {
      return pilot.currentSquadron ? '#000000' : '#374151';
    }
    // Use squadron primary color from color_palette.primary if available, otherwise dark gray
    const squadronData = pilot.currentSquadron as any;
    const colorPalette = squadronData?.color_palette as { primary?: string } | null;
    return colorPalette?.primary || '#374151';
  };

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

    // Convert map back to array and sort by qualification order
    const uniqueQuals = Array.from(qualMap.values())
      .sort((a, b) => a.qualification.order - b.qualification.order);

    // Each badge is 37px wide with 4px gap = 41px per badge
    // With the increased width, we can show up to 8 badges before overflow
    const MAX_VISIBLE_BADGES = 8;

    if (uniqueQuals.length <= MAX_VISIBLE_BADGES) {
      // Show all badges normally
      return uniqueQuals.map((pq: any) => (
        <QualificationBadge
          key={`${pilot.id}-${pq.qualification.id}`}
          type={pq.qualification.name}
          code={pq.qualification.code}
          color={pq.qualification.color}
        />
      ));
    }

    // Show first (MAX_VISIBLE_BADGES - 1) badges plus overflow indicator
    const visibleQuals = uniqueQuals.slice(0, MAX_VISIBLE_BADGES - 1);
    const overflowQuals = uniqueQuals.slice(MAX_VISIBLE_BADGES - 1);

    return (
      <>
        {visibleQuals.map((pq: any) => (
          <QualificationBadge
            key={`${pilot.id}-${pq.qualification.id}`}
            type={pq.qualification.name}
            code={pq.qualification.code}
            color={pq.qualification.color}
          />
        ))}
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div
            style={{
              backgroundColor: '#9CA3AF',
              borderRadius: '8px',
              width: '37px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F9FAFB',
              fontSize: '12px',
              fontWeight: 400,
              cursor: 'pointer'
            }}
          >
            +{overflowQuals.length}
          </div>
          {showTooltip && (
            <div
              ref={tooltipRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: '#1F2937',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                maxWidth: '200px',
                zIndex: 1000,
                boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
            >
              {overflowQuals.map((pq: any) => (
                <QualificationBadge
                  key={`${pilot.id}-${pq.qualification.id}-tooltip`}
                  type={pq.qualification.name}
                  code={pq.qualification.code}
                  color={pq.qualification.color}
                />
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div
      style={{
        ...pilotListStyles.pilotRow(isSelected, isHovered),
        userSelect: 'none', // Prevent text selection during multi-select
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
      onClick={isDisabled ? undefined : (e) => onSelect(e as React.MouseEvent)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    >
      <div style={{ marginLeft: '-20px' }}>
        <PilotIDBadgeSm 
          squadronTailCode={pilot.currentSquadron?.tail_code || undefined}
          boardNumber={pilot.boardNumber}
          squadronInsigniaUrl={pilot.currentSquadron?.insignia_url || undefined}
        />
      </div>
      <span style={{
        ...pilotListStyles.callsign,
        color: getSquadronPrimaryColor()
      }}>
        {pilot.callsign}
      </span>
      <span style={pilotListStyles.role}>
        {pilot.roles?.[0]?.role?.name || ''}
      </span>
      
      <div style={{...pilotListStyles.badgeContainer, marginRight: '-10px'}}>
        {renderQualificationBadges()}
      </div>
    </div>
  );
};

export default PilotListItem;