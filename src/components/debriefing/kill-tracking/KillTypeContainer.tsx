import React, { useState } from 'react';
import UnitKillCell from './UnitKillCell';
import UnitSelectorPopup from './UnitSelectorPopup';
import UnitBrowserModal from './UnitBrowserModal';

interface UnitKill {
  id: string; // kill record ID
  unitTypeId: string;
  unitDisplayName: string;
  unitTypeName: string;
  killCount: number;
}

interface UnitOption {
  id: string;
  type_name: string;
  display_name: string;
  kill_category: 'A2A' | 'A2G' | 'A2S';
}

interface KillTypeContainerProps {
  killCategory: 'A2A' | 'A2G' | 'A2S';
  kills: UnitKill[];
  missionPoolUnits: UnitOption[];
  onAddKill: (unitId: string) => void;
  onIncrementKill: (killRecordId: string) => void;
  onDecrementKill: (killRecordId: string) => void;
}

/**
 * Container for a single kill category (A2A, A2G, or A2S)
 * Displays a dynamic grid of kill cells (1x4 initially, expands as needed)
 */
const KillTypeContainer: React.FC<KillTypeContainerProps> = ({
  killCategory,
  kills,
  missionPoolUnits,
  onAddKill,
  onIncrementKill,
  onDecrementKill
}) => {
  const [showPopup, setShowPopup] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });

  // Category display labels
  const categoryLabels: Record<string, string> = {
    A2A: 'AIR-TO-AIR',
    A2G: 'AIR-TO-GROUND',
    A2S: 'AIR-TO-SURFACE'
  };

  // Category colors
  const categoryColors: Record<string, string> = {
    A2A: '#3B82F6', // Blue
    A2G: '#10B981', // Green
    A2S: '#8B5CF6'  // Purple
  };

  // Calculate grid: always show at least 4 cells, expand to accommodate more kills
  const minCells = 4;
  const cellsNeeded = Math.max(minCells, kills.length + 1); // +1 for add button
  const rows = Math.ceil(cellsNeeded / 4);

  // Create grid cells
  const cells: Array<UnitKill | null> = [];
  for (let i = 0; i < rows * 4; i++) {
    cells.push(kills[i] || null);
  }

  const handleCellClick = (event: React.MouseEvent, index: number) => {
    // Only show popup for empty cells
    if (cells[index] === null) {
      const rect = event.currentTarget.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
      setShowPopup(true);
    }
  };

  const handleSelectUnit = (unitId: string) => {
    setShowPopup(false);
    onAddKill(unitId);
  };

  const handleOpenBrowser = () => {
    setShowPopup(false);
    setShowBrowser(true);
  };

  const handleBrowserSelectUnit = (unitId: string) => {
    setShowBrowser(false);
    onAddKill(unitId);
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingBottom: '8px',
          borderBottom: `2px solid ${categoryColors[killCategory]}`
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: categoryColors[killCategory]
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#1F2937',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          {categoryLabels[killCategory]}
        </h3>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          width: '100%'
        }}
      >
        {cells.map((kill, index) => (
          <div key={index} onClick={(e) => handleCellClick(e, index)}>
            <UnitKillCell
              isEmpty={kill === null}
              unitDisplayName={kill?.unitDisplayName}
              unitTypeName={kill?.unitTypeName}
              killCount={kill?.killCount}
              onAdd={() => {
                // This will be handled by handleCellClick
              }}
              onIncrement={kill ? () => onIncrementKill(kill.id) : undefined}
              onDecrement={kill ? () => onDecrementKill(kill.id) : undefined}
            />
          </div>
        ))}
      </div>

      {/* Unit Selector Popup */}
      {showPopup && (
        <UnitSelectorPopup
          killCategory={killCategory}
          missionPoolUnits={missionPoolUnits}
          position={popupPosition}
          onSelectUnit={handleSelectUnit}
          onOpenBrowser={handleOpenBrowser}
          onClose={() => setShowPopup(false)}
        />
      )}

      {/* Unit Browser Modal */}
      {showBrowser && (
        <UnitBrowserModal
          killCategory={killCategory}
          onSelectUnit={handleBrowserSelectUnit}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
};

export default KillTypeContainer;
