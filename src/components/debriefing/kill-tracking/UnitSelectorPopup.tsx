import React, { useRef, useEffect } from 'react';

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
  onSelectUnit: (unitId: string) => void;
  onOpenBrowser: () => void;
  onClose: () => void;
}

/**
 * Dropdown menu for selecting units from mission pool
 * Shows mission pool units + generic option + "OTHER" button
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
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        minWidth: '220px',
        maxWidth: '280px',
        maxHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
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
            onClick={() => onSelectUnit(unit.id)}
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
              color: unit.isGeneric ? '#3B82F6' : '#1F2937',
              transition: 'background-color 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
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
                  color: '#64748B',
                  fontWeight: 400
                }}
              >
                {unit.type_name}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* OTHER button */}
      <div
        style={{
          borderTop: '1px solid #E2E8F0',
          padding: '4px'
        }}
      >
        <button
          type="button"
          onClick={onOpenBrowser}
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
      </div>
    </div>
  );
};

export default UnitSelectorPopup;
