// First, let's fix the width issues in existing columns by using style={{ width: CARD_WIDTH }} in their parent divs

// Then, let's implement the pilot list component:
import React from 'react';
import QualificationBadge from './QualificationBadge';
import type { Pilot, QualificationType } from '../../types/PilotTypes';

interface PilotListProps {
  pilots: Pilot[];
}

const QUALIFICATION_ORDER: QualificationType[] = [
  'Strike Lead',
  'Flight Lead',
  'Section Lead',
  'CQ'
];

const PilotList: React.FC<PilotListProps> = ({ pilots }) => {
  // Group pilots by their highest qualification
  const groupedPilots = pilots.reduce((acc, pilot) => {
    // Find pilot's highest qualification based on QUALIFICATION_ORDER
    let highestQual: QualificationType | null = null;
    for (const qual of QUALIFICATION_ORDER) {
      if (pilot.qualifications.some(q => q.type === qual)) {
        highestQual = qual;
        break;
      }
    }

    // If no matching qualification found, put in "Wingman" group
    const group = highestQual || 'Wingman';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  return (
    <div className="flex-1 overflow-y-auto">
      {QUALIFICATION_ORDER.concat(['Wingman']).map(qualification => {
        const qualPilots = groupedPilots[qualification] || [];
        if (qualPilots.length === 0) return null;

        return (
          <div key={qualification}>
            {/* Qualification group divider */}
            <div 
              style={{
                position: 'relative',
                textAlign: 'center',
                margin: '20px 0'
              }}
            >
              <div 
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: '1px',
                  backgroundColor: '#E2E8F0'
                }}
              />
              <span 
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  padding: '0 16px',
                  color: '#646F7E',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                  fontWeight: 300,
                  textTransform: 'uppercase'
                }}
              >
                {qualification}
              </span>
            </div>

            {/* Pilot entries */}
            {qualPilots.map(pilot => (
              <div
                key={pilot.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '24px',
                  marginBottom: '10px',
                  transition: 'background-color 0.2s ease',
                  borderRadius: '8px',
                  padding: '0 10px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(100, 116, 139, 0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{
                  width: '62px',
                  textAlign: 'center',
                  fontSize: '16px',
                  fontWeight: 400,
                  color: '#646F7E'
                }}>
                  {pilot.boardNumber}
                </span>
                <span style={{
                  width: '120px',
                  fontSize: '16px',
                  fontWeight: 700
                }}>
                  {pilot.callsign}
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 300,
                  color: '#646F7E'
                }}>
                  {pilot.billet}
                </span>
                
                {/* Qualification badges */}
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  marginLeft: 'auto',
                  height: '24px'
                }}>
                  {pilot.qualifications.map((qual, index) => (
                    <QualificationBadge 
                      key={`${qual.type}-${index}`} 
                      type={qual.type}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default PilotList;