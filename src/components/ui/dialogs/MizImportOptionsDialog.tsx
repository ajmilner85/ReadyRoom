import React from 'react';
import { Icon } from '../primitives';

export type MizImportMode = 'clear' | 'merge' | 'dataOnly' | 'cancel';

interface MizImportOptionsDialogProps {
  isOpen: boolean;
  onSelectMode: (mode: MizImportMode) => void;
  existingFlightCount: number;
}

export const MizImportOptionsDialog: React.FC<MizImportOptionsDialogProps> = ({
  isOpen,
  onSelectMode,
  existingFlightCount
}) => {
  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
    padding: '20px',
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: 'var(--rr-panel)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    overflow: 'hidden',
    boxShadow: 'var(--rr-shadow-lg)',
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px 24px 16px 24px',
    borderBottom: '1px solid var(--rr-border)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: '0 0 8px 0',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--rr-text2)',
    margin: 0,
  };

  const contentStyle: React.CSSProperties = {
    padding: '24px',
  };

  const optionButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px',
    marginBottom: '12px',
    borderRadius: '8px',
    border: '2px solid var(--rr-border)',
    backgroundColor: 'var(--rr-panel)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  };

  const optionIconStyle: React.CSSProperties = {
    color: 'var(--rr-accent-text)',
    flexShrink: 0,
    marginTop: '2px',
  };

  const optionTextContainerStyle: React.CSSProperties = {
    flex: 1,
  };

  const optionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: '0 0 4px 0',
  };

  const optionDescStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--rr-text2)',
    lineHeight: '1.5',
    margin: 0,
  };

  const footerStyle: React.CSSProperties = {
    padding: '16px 24px',
    borderTop: '1px solid var(--rr-border)',
    display: 'flex',
    justifyContent: 'flex-end',
  };

  const cancelButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: 'var(--rr-panel)',
    border: '1px solid var(--rr-border2)',
    color: 'var(--rr-text)',
  };

  return (
    <div style={overlayStyle} onClick={() => onSelectMode('cancel')}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Import .miz File</h2>
          <p style={subtitleStyle}>
            You have {existingFlightCount} existing flight{existingFlightCount !== 1 ? 's' : ''}.
            How would you like to import this mission file?
          </p>
        </div>

        <div style={contentStyle}>
          <button
            onClick={() => onSelectMode('clear')}
            style={optionButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--rr-bad)';
              e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--rr-border)';
              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
            }}
          >
            <div style={{ ...optionIconStyle, color: 'var(--rr-bad)' }}>
              <Icon name="fileUp" size={20} />
            </div>
            <div style={optionTextContainerStyle}>
              <h3 style={optionTitleStyle}>Clear Existing Flights</h3>
              <p style={optionDescStyle}>
                Delete all existing flights and pilot assignments, then import flights from the .miz file.
                You will be asked to confirm this action.
              </p>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('merge')}
            style={optionButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--rr-accent)';
              e.currentTarget.style.backgroundColor = 'var(--rr-accent-weak)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--rr-border)';
              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
            }}
          >
            <div style={optionIconStyle}>
              <Icon name="merge" size={20} />
            </div>
            <div style={optionTextContainerStyle}>
              <h3 style={optionTitleStyle}>Merge Flights</h3>
              <p style={optionDescStyle}>
                Add only new flights from the .miz file. If a flight already exists (same callsign and number),
                it will be skipped. Existing assignments are preserved.
              </p>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('dataOnly')}
            style={optionButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--rr-good)';
              e.currentTarget.style.backgroundColor = 'rgba(64,168,91,.14)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--rr-border)';
              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
            }}
          >
            <div style={{ ...optionIconStyle, color: 'var(--rr-good)' }}>
              <Icon name="info" size={20} />
            </div>
            <div style={optionTextContainerStyle}>
              <h3 style={optionTitleStyle}>Import Mission Data Only</h3>
              <p style={optionDescStyle}>
                Import mission details (bullseye, weather, red coalition units) without affecting
                existing flights or assignments.
              </p>
            </div>
          </button>
        </div>

        <div style={footerStyle}>
          <button
            onClick={() => onSelectMode('cancel')}
            style={cancelButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
