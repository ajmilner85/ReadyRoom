import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { Cycle } from '../../../types/EventTypes';

interface CyclesListProps {
  cycles: Cycle[];
  selectedCycle: Cycle | null;
  onCycleSelect: (cycle: Cycle) => void;
  onNewCycle: () => void;
  onEditCycle?: (cycle: Cycle) => void;
  onDeleteCycle?: (cycle: Cycle) => void;
}

const CyclesList: React.FC<CyclesListProps> = ({
  cycles,
  selectedCycle,
  onCycleSelect,
  onNewCycle,
  onEditCycle,
  onDeleteCycle
}) => {
  const [hoveredCycle, setHoveredCycle] = useState<string | null>(null);

  // Group cycles by status
  const now = new Date();
  const { activeCycles, upcomingCycles, completedCycles } = cycles.reduce((acc, cycle) => {
    const startDate = new Date(cycle.startDate);
    const endDate = new Date(cycle.endDate);
    
    if (now >= startDate && now <= endDate) {
      acc.activeCycles.push(cycle);
    } else if (now < startDate) {
      acc.upcomingCycles.push(cycle);
    } else {
      acc.completedCycles.push(cycle);
    }
    return acc;
  }, { activeCycles: [] as Cycle[], upcomingCycles: [] as Cycle[], completedCycles: [] as Cycle[] });

  // Sort cycles by date
  activeCycles.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  upcomingCycles.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  completedCycles.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

  const renderCycleGroup = (cycles: Cycle[], groupTitle: string) => {
    if (cycles.length === 0) return null;

    return (
      <div key={groupTitle}>
        {/* Group divider */}
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
            {groupTitle}
          </span>
        </div>

        {/* Cycle entries */}
        {cycles.map(cycle => (
          <div
            key={cycle.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
              cursor: 'pointer',
              backgroundColor: selectedCycle?.id === cycle.id ? '#EFF6FF' : hoveredCycle === cycle.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
              borderRadius: '8px',
              padding: '12px',
              position: 'relative'
            }}
            onClick={() => onCycleSelect(cycle)}
            onMouseEnter={() => setHoveredCycle(cycle.id)}
            onMouseLeave={() => setHoveredCycle(null)}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                {cycle.name}
              </span>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                {new Date(cycle.startDate).toLocaleDateString()} - {new Date(cycle.endDate).toLocaleDateString()}
              </div>
            </div>
            
            {/* Action buttons - only visible when row is hovered or selected */}
            {(hoveredCycle === cycle.id || selectedCycle?.id === cycle.id) && (
              <div 
                style={{
                  display: 'flex',
                  gap: '8px',
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: selectedCycle?.id === cycle.id ? '#EFF6FF' : hoveredCycle === cycle.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                {onEditCycle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCycle(cycle);
                    }}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                )}
                {onDeleteCycle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCycle(cycle);
                    }}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 10px 10px', marginBottom: '8px' }}>
        {renderCycleGroup(activeCycles, 'Active Cycles')}
        {renderCycleGroup(upcomingCycles, 'Upcoming Cycles')}
        {renderCycleGroup(completedCycles, 'Completed Cycles')}
      </div>

      {/* Add Cycle Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5,
        borderTop: '1px solid #E2E8F0'
      }}>
        <button
          onClick={onNewCycle}
          style={{
            width: '119px',
            height: '30px',
            background: '#FFFFFF',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease-in-out',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default CyclesList;