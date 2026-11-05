import React, { useRef, useEffect, useState } from 'react';

interface UnitOption {
  id: string;
  type_name: string;
  display_name: string;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  isGeneric?: boolean;
}

interface UnitSelectorPopupProps {
  killCategory: 'A2A' | 'A2G' | 'A2S';
  missionPoolUnits: UnitOption[];
  position: { top: number; left: number };
  onSelectUnit: (unitId: string, isFriendly: boolean) => void;
  onOpenBrowser: (isFriendly: boolean) => void;
  onClose: () => void;
}

/**
 * Dropdown menu for selecting units from mission pool
 * Shows mission pool units + generic option + "OTHER" button.
 * A "FRIENDLY FIRE" toggle switches the popup into friendly-fire mode:
 * the same unit list is shown, but selections are recorded as friendly kills.
 */
const UnitSelectorPopup: React.FC<UnitSelectorPopupProps> = ({
  killCategory,
  missionPoolUnits,
  position,
  onSelectUnit,
  onOpenBrowser,
  onClose
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [friendlyMode, setFriendlyMode] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Generic unit option
  const genericUnit: UnitOption = {
    id: `GENERIC_${killCategory}`,
    type_name: `GENERIC_${killCategory}`,
    display_name: `Generic ${killCategory}`,
    kill_category: killCategory,
    isGeneric: true
  };

  // Filter units by kill category
  const filteredUnits = missionPoolUnits.filter(u => u.kill_category === killCategory);

  // Always show generic first, then mission pool units
  const allUnits = [genericUnit, ...filteredUnits];

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        backgroundColor: 'var(--rr-panel)',
        border: friendlyMode ? '1px solid var(--rr-accent)' : '1px solid var(--rr-border)',
        borderRadius: '8px',
        boxShadow: 'var(--rr-shadow)',
        zIndex: 1000,
        minWidth: '220px',
        maxWidth: '280px',
        maxHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Friendly fire mode banner */}
      {friendlyMode && (
        <div
          style={{
            padding: '6px 12px',
            backgroundColor: 'var(--rr-accent-weak)',
            borderBottom: '1px solid var(--rr-accent)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--rr-accent-text)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            textAlign: 'center'
          }}
        >
          Recording Friendly Fire
        </div>
      )}

      {/* Unit list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px'
        }}
      >
        {allUnits.map((unit) => (
          <button
            key={unit.id}
            type="button"
            onClick={() => onSelectUnit(unit.id, friendlyMode)}
            style={{
              width: '100%',
              padding: '8px 12px',
              textAlign: 'left',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: unit.isGeneric ? 600 : 400,
              color: unit.isGeneric ? 'var(--rr-accent-text)' : 'var(--rr-text)',
              transition: 'background-color 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = friendlyMode ? '#EFF6FF' : '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div>{unit.display_name}</div>
            {!unit.isGeneric && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--rr-text2)',
                  fontWeight: 400
                }}
              >
                {unit.type_name}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* OTHER + FRIENDLY FIRE buttons */}
      <div
        style={{
          borderTop: '1px solid var(--rr-border)',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        <button
          type="button"
          onClick={() => onOpenBrowser(friendlyMode)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: '#1F2937',
            border: 'none',
            borderRadius: '4px',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#111827';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1F2937';
          }}
        >
          OTHER
        </button>
        <button
          type="button"
          onClick={() => setFriendlyMode(prev => !prev)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: friendlyMode ? 'var(--rr-accent)' : 'var(--rr-accent)',
            border: 'none',
            borderRadius: '4px',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = friendlyMode ? '#1D4ED8' : '#3B82F6';
          }}
        >
          {friendlyMode ? 'CANCEL FRIENDLY FIRE' : 'FRIENDLY FIRE'}
        </button>
      </div>
    </div>
  );
};

export default UnitSelectorPopup;
