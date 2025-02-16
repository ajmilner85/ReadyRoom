import React from 'react';
import type { QualificationType } from '../../types/PilotTypes';

interface QualificationBadgeProps {
  type: QualificationType;
  count?: number;
}

const QUALIFICATION_CONFIGS: Record<QualificationType, { abbr: string; color: string }> = {
  'Strike Lead': { 
    abbr: 'SL', 
    color: '#732103'  // Dark Orange
  },
  'Instructor Pilot': { 
    abbr: 'IP', 
    color: '#5B4E61'  // Medium Purple
  },
  'LSO': { 
    abbr: 'LSO', 
    color: '#646F7E'  // Slate
  },
  'Flight Lead': { 
    abbr: '4S', 
    color: '#646F7E'  // Slate
  },
  'Section Lead': { 
    abbr: '2S', 
    color: '#646F7E'  // Slate
  },
  'CQ': { 
    abbr: 'CQ', 
    color: '#B0B0B0'  // Medium Grey
  },
  'Night CQ': { 
    abbr: 'NCQ', 
    color: '#222A35'  // Dark Blue
  },
  'Wingman': {
    abbr: 'WM',
    color: '#B0B0B0'  // Medium Grey
  }
};

const QualificationBadge: React.FC<QualificationBadgeProps> = ({ type, count }) => {
  const config = QUALIFICATION_CONFIGS[type];
  
  if (!config) return null;

  return (
    <div 
      style={{ 
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        height: '24px',
        width: '37px'
      }}
    >
      <div
        style={{
          backgroundColor: config.color,
          borderRadius: '8px',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F9FAFB',
          fontSize: '12px',
          fontWeight: 400,
          lineHeight: '15px',
        }}
      >
        <span>{config.abbr}</span>
      </div>
      {count !== undefined && count > 1 && (
        <div
          style={{
            backgroundColor: '#646F7E',
            borderRadius: '8px',
            width: '37px',
            height: '24px',
            position: 'absolute',
            right: '-1px',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F9FAFB',
            fontSize: '12px',
            fontWeight: 400,
          }}
        >
          +{count}
        </div>
      )}
    </div>
  );
};

export default QualificationBadge;