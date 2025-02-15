import React from 'react';
import { Card } from '../card';
import QualificationBadge from '../QualificationBadge';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import { pilots } from '../../../types/PilotTypes';

interface AvailablePilotsProps {
  width: string;
}

const QUALIFICATION_ORDER: QualificationType[] = [
  'Strike Lead',
  '4-Ship',
  '2-Ship'
];

const AvailablePilots: React.FC<AvailablePilotsProps> = ({ width }) => {
  // Group pilots by highest qualification
  const groupedPilots: Record<string, Pilot[]> = {};
  
  pilots.forEach(pilot => {
    // Find pilot's highest qualification
    let highestQual = 'Wingman';  // Default to Wingman
    for (const qual of QUALIFICATION_ORDER) {
      if (pilot.qualifications.some(q => q.type === qual)) {
        highestQual = qual;
        break;
      }
    }
    
    if (!groupedPilots[highestQual]) {
      groupedPilots[highestQual] = [];
    }
    groupedPilots[highestQual].push(pilot);
  });

  return (
    <div style={{ width }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        <h2 className="text-lg font-semibold mb-4">Available Pilots</h2>
        <div className="flex-1 overflow-y-auto">
          {[...QUALIFICATION_ORDER, 'Wingman'].map(qualification => {
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
      </Card>
    </div>
  );
};

export default AvailablePilots;