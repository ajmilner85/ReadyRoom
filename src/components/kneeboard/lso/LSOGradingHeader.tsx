import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import type { Carrier, ResolvedPilot } from './types/lsoTypes';

interface LSOGradingHeaderProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  lsoInfo: ResolvedPilot | null;
  carriers: Carrier[];
  selectedCarrierId: string;
  onCarrierChange: (carrierId: string) => void;
  cellSize: number;
}

const LSOGradingHeader: React.FC<LSOGradingHeaderProps> = ({
  theme,
  colors,
  lsoInfo,
  carriers,
  selectedCarrierId,
  onCarrierChange,
  cellSize,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);

  const today = new Date();

  // Ordinal suffix
  const day = today.getDate();
  const suffix = [11, 12, 13].includes(day % 100)
    ? 'th'
    : ['st', 'nd', 'rd'][(day % 10) - 1] || 'th';
  const formattedDate = today.toLocaleDateString('en-US', { month: 'long' }) +
    ` ${day}${suffix}, ${today.getFullYear()}`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: `${cellSize}px`,
      backgroundColor: colors.backgroundSecondary,
      boxSizing: 'border-box',
      padding: '0 12px',
      flexShrink: 0,
    }}>
      {/* Date */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: colors.textSecondary,
        fontSize: '24px',
        minWidth: '260px',
      }}>
        <Calendar size={26} />
        <span>{formattedDate}</span>
      </div>

      {/* LSO Identity */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flex: 1,
        justifyContent: 'center',
      }}>
        {lsoInfo?.wingInsigniaUrl && (
          <img
            src={lsoInfo.wingInsigniaUrl}
            alt="Wing"
            style={{ height: '64px', width: '64px', objectFit: 'contain' }}
          />
        )}
        {lsoInfo?.squadronInsigniaUrl && (
          <img
            src={lsoInfo.squadronInsigniaUrl}
            alt="Squadron"
            style={{ height: '56px', width: '56px', objectFit: 'contain' }}
          />
        )}
        {lsoInfo && (
          <span style={{
            fontSize: '24px',
            fontWeight: 600,
            color: colors.text,
          }}>
            {lsoInfo.boardNumber} {lsoInfo.callsign}
          </span>
        )}
      </div>

      {/* Carrier Selector */}
      <div style={{ position: 'relative', minWidth: '180px' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: colors.background,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            color: colors.text,
            fontSize: '24px',
            cursor: 'pointer',
            width: '100%',
            minHeight: '52px',
          }}
        >
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {selectedCarrier?.hull || 'Select Carrier'}
          </span>
          <ChevronDown size={16} style={{
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }} />
        </button>

        {showDropdown && (
          <>
            <div
              onClick={() => setShowDropdown(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 99,
              }}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              overflowY: 'visible',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              minWidth: '450px',
            }}>
              {carriers.map(carrier => (
                <button
                  key={carrier.id}
                  onClick={() => {
                    onCarrierChange(carrier.id);
                    setShowDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: carrier.id === selectedCarrierId
                      ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.1)')
                      : 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.text,
                    fontSize: '24px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{carrier.hull}</span>
                  <span style={{ color: colors.textSecondary, fontSize: '20px' }}>
                    {carrier.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LSOGradingHeader;
