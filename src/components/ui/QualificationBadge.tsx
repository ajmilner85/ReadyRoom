import React, { useState, useEffect } from 'react';
import { Qualification, getAllQualifications } from '../../utils/qualificationService';
import { QualTag } from './primitives/Pickers';

interface QualificationBadgeProps {
  type: string; // Qualification name from the qualifications table
  count?: number;
  code?: string; // Optional code if we already have it
  color?: string; // Optional color if we already have it
  qualifications?: Qualification[]; // Pre-loaded qualifications to avoid async loading
  size?: 'small' | 'normal'; // Size variant for different use cases
}

// Legacy qualification configs (for backward compatibility)
const LEGACY_QUALIFICATION_CONFIGS: Record<string, { abbr: string; color: string }> = {
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
    color: 'var(--rr-text2)'  // Slate
  },
  'Flight Lead': { 
    abbr: '4S', 
    color: 'var(--rr-text2)'  // Slate
  },
  'Section Lead': { 
    abbr: '2S', 
    color: 'var(--rr-text2)'  // Slate
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
  },
  'FAC(A)': {
    abbr: 'FACA',
    color: '#8B5A00'  // Dark Gold
  },
  'TL': {
    abbr: 'TL',
    color: '#4A4A4A'  // Dark Grey
  },
  '4FL': {
    abbr: '4FL',
    color: 'var(--rr-text2)'  // Slate
  },
  '2FL': {
    abbr: '2FL',
    color: 'var(--rr-text2)'  // Slate
  },
  'WQ': {
    abbr: 'WQ',
    color: '#B0B0B0'  // Medium Grey
  },
  'T/O': {
    abbr: 'TO',
    color: 'var(--rr-text2)'  // Slate
  },
  'NATOPS': {
    abbr: 'NAT',
    color: '#5B4E61'  // Medium Purple
  },
  'DFL': {
    abbr: 'DFL',
    color: 'var(--rr-text2)'  // Slate
  },
  'DTL': {
    abbr: 'DTL',
    color: '#4A4A4A'  // Dark Grey
  },
  'JTAC': {
    abbr: 'JTAC',
    color: '#8B5A00'  // Dark Gold
  }
};

// Generate a color based on a string (consistent for same inputs)
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate different colors based on the hash
  // Using different hue values for different categories
  const colors = [
    '#732103', // Dark Orange (Leadership)
    '#5B4E61', // Medium Purple
    '#646F7E', // Slate
    '#222A35', // Dark Blue
    '#0D4A3E', // Dark Green
    '#6D3111', // Dark Red
    '#3D4451', // Dark Grey
    '#27272A'  // Nearly Black
  ];
  
  // Use the hash to pick a color
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const QualificationBadge: React.FC<QualificationBadgeProps> = ({ type, count, code, color, qualifications: preloadedQualifications, size = 'normal' }) => {
  const [qualifications, setQualifications] = useState<Qualification[]>(preloadedQualifications || []);
  const [, setLoaded] = useState(!!preloadedQualifications);
  
  // Fetch all qualifications only if not pre-loaded
  useEffect(() => {
    if (preloadedQualifications) {
      setQualifications(preloadedQualifications);
      setLoaded(true);
      return;
    }
    
    // Only fetch if no preloaded qualifications provided (fallback)
    const fetchQualifications = async () => {
      try {
        const { data } = await getAllQualifications();
        if (data) {
          setQualifications(data);
        }
      } catch (error) {
        console.error('QualificationBadge: Error fetching qualifications for type:', type, error);
      } finally {
        setLoaded(true);
      }
    };
    
    fetchQualifications();
  }, [preloadedQualifications]);
  
  // Find matching qualification in the database
  const matchingQualification = qualifications.find(q => 
    q.name.toLowerCase() === type.toLowerCase()
  );
  
  // Use code from props or matching qualification, or fall back to legacy
  const abbreviation = code || 
    (matchingQualification?.code) || 
    (LEGACY_QUALIFICATION_CONFIGS[type]?.abbr) || 
    type.substring(0, 2).toUpperCase();
  
  // Use color from provided color prop, or from database qualification's color/category
  let backgroundColor = '#646F7E'; // Default slate color
  
  if (color) {
    backgroundColor = color;
  } else if (matchingQualification?.color) {
    backgroundColor = matchingQualification.color;
  } else if (matchingQualification?.category) {
    backgroundColor = stringToColor(matchingQualification.category);
  } else if (LEGACY_QUALIFICATION_CONFIGS[type]) {
    backgroundColor = LEGACY_QUALIFICATION_CONFIGS[type].color;
  } else {
    backgroundColor = stringToColor(type);
  }

  // ReadyRoom UI Kit qualification tag (shared with filters/pickers via QualTag).
  return (
    <QualTag code={abbreviation} color={backgroundColor} size={size === 'small' ? 'sm' : 'md'} title={matchingQualification?.name || type}>
      {count !== undefined && count > 1 ? <span style={{ opacity: 0.75 }}>+{count}</span> : null}
    </QualTag>
  );
};

export default QualificationBadge;