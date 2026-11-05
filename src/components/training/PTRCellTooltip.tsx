// @ts-nocheck
import React from 'react';
import { Icon } from '../ui/primitives';
import type { TrainingGrade } from '../../types/TrainingTypes';

interface PTRCellTooltipProps {
  grade: TrainingGrade;
  missionName: string;
  missionNumber: number;
  weekNumber: number;
  objectives: Array<{ id: string; objectiveText: string }>;
  position: { x: number; y: number };
}

const PTRCellTooltip: React.FC<PTRCellTooltipProps> = ({
  grade,
  missionName,
  missionNumber,
  weekNumber,
  objectives,
  position
}) => {
  // Calculate if tooltip would go off screen
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [adjustedPosition, setAdjustedPosition] = React.useState({
    x: position.x,
    y: position.y,
    showBelow: false
  });

  React.useEffect(() => {
    const tooltipWidth = 400; // maxWidth of tooltip
    const tooltipHeight = 450; // Estimated max tooltip height
    const margin = 20; // Minimum margin from screen edges
    const offsetFromCell = 12; // Distance from cell

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate vertical position
    const spaceAbove = position.y;
    const spaceBelow = windowHeight - position.y;
    let showBelow = false;
    let finalY = position.y;

    if (spaceAbove < tooltipHeight + offsetFromCell + margin) {
      // Not enough space above, show below
      showBelow = true;
      finalY = position.y + offsetFromCell;
    } else {
      // Show above
      showBelow = false;
      finalY = position.y - offsetFromCell;
    }

    // Calculate horizontal position (keep centered on cell)
    let finalX = position.x;
    const halfWidth = tooltipWidth / 2;

    // Check if tooltip would go off left edge
    if (finalX - halfWidth < margin) {
      finalX = halfWidth + margin;
    }
    // Check if tooltip would go off right edge
    else if (finalX + halfWidth > windowWidth - margin) {
      finalX = windowWidth - halfWidth - margin;
    }

    setAdjustedPosition({
      x: finalX,
      y: finalY,
      showBelow
    });
    
    // Mark as ready to display
    setIsReady(true);
  }, [position.x, position.y]);

  // Don't render until position is calculated
  if (!isReady) {
    return null;
  }

  // Calculate position to keep tooltip on screen
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${adjustedPosition.x}px`,
    top: `${adjustedPosition.y}px`,
    transform: adjustedPosition.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    backgroundColor: 'var(--rr-panel)',
    border: '1px solid var(--rr-border)',
    borderRadius: '10px',
    boxShadow: 'var(--rr-shadow)',
    padding: '16px',
    zIndex: 9999,
    minWidth: '320px',
    maxWidth: '400px',
    pointerEvents: 'none'
  };

  return (
    <div ref={tooltipRef} style={tooltipStyle}>
      {/* Header - Week/Mission Info and Attempt Number */}
      <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--rr-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text)', marginBottom: '4px' }}>
              Week {weekNumber} - H{String(missionNumber).padStart(2, '0')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--rr-text2)' }}>
              {missionName}
            </div>
          </div>
          <div style={{
            padding: '4px 10px',
            backgroundColor: 'var(--rr-accent-weak)',
            border: '1px solid var(--rr-accent)',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--rr-accent-text)',
            whiteSpace: 'nowrap',
            marginLeft: '12px'
          }}>
            Attempt {grade.attemptNumber}
          </div>
        </div>
      </div>

      {/* Student and Instructor */}
      <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--rr-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--rr-text2)' }}>Student:</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rr-text)' }}>
            {grade.student?.callsign || 'Unknown'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--rr-text2)' }}>Instructor:</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rr-text)' }}>
            {grade.gradedByPilot?.callsign || grade.assignedIpPilot?.callsign || 'Unknown'}
          </span>
        </div>
      </div>

      {/* Flight Date and Makeup Status */}
      <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--rr-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--rr-text2)' }}>Flight Date:</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rr-text)' }}>
            {grade.flightDate ? new Date(grade.flightDate + 'T00:00:00Z').toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric',
              timeZone: 'UTC'
            }) : 'N/A'}
          </span>
        </div>
        {grade.isMakeupFlight && (
          <div style={{ 
            marginTop: '6px',
            padding: '4px 8px',
            backgroundColor: 'rgba(222,154,31,.14)',
            border: '1px solid var(--rr-warn)',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--rr-warn)',
            textAlign: 'center'
          }}>
            Make-up Flight
          </div>
        )}
      </div>

      {/* DLO Grades */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rr-text2)', marginBottom: '8px', textTransform: 'uppercase' }}>
          Training Objectives
        </div>
        {objectives.map((objective) => {
          const dloGrade = grade.dloGrades?.find(g => g.objectiveId === objective.id);
          const isSat = dloGrade?.grade === 'SAT';
          const isUnsat = dloGrade?.grade === 'UNSAT';
          
          return (
            <div key={objective.id} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                {isSat && <Icon name="checkCircle" size={14} style={{ color: 'var(--rr-good)', marginTop: '2px', flexShrink: 0 }} />}
                {isUnsat && <Icon name="minusCircle" size={14} style={{ color: 'var(--rr-text3)', marginTop: '2px', flexShrink: 0 }} />}
                {!isSat && !isUnsat && <Icon name="minusCircle" size={14} style={{ color: '#E5E7EB', marginTop: '2px', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'var(--rr-text)', 
                    lineHeight: '1.4',
                    fontWeight: isSat || isUnsat ? 500 : 400
                  }}>
                    {objective.objectiveText}
                  </div>
                  {dloGrade?.notes && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: 'var(--rr-text2)', 
                      marginTop: '2px',
                      lineHeight: '1.4',
                      fontStyle: 'italic'
                    }}>
                      {dloGrade.notes}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall Grade and Comments */}
      <div style={{ 
        marginTop: '12px', 
        paddingTop: '12px', 
        borderTop: '1px solid var(--rr-border)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rr-text2)', textTransform: 'uppercase' }}>
            Overall Grade
          </span>
          <span style={{ 
            fontSize: '13px', 
            fontWeight: 700,
            color: grade.overallGrade === 'SAT' ? 'var(--rr-good)' : 'var(--rr-warn)',
            padding: '2px 8px',
            backgroundColor: grade.overallGrade === 'SAT' ? 'rgba(64,168,91,.14)' : 'rgba(222,154,31,.14)',
            borderRadius: '4px'
          }}>
            {grade.overallGrade}
          </span>
        </div>
        {grade.overallNotes && (
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--rr-text)', 
            lineHeight: '1.4',
            backgroundColor: 'var(--rr-panel2)',
            padding: '8px',
            borderRadius: '4px',
            fontStyle: 'italic'
          }}>
            {grade.overallNotes}
          </div>
        )}
      </div>
    </div>
  );
};

export default PTRCellTooltip;
