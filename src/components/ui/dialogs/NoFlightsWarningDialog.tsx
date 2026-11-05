import React from 'react';

interface NoFlightsWarningDialogProps {
  onClose: () => void;
}

const NoFlightsWarningDialog: React.FC<NoFlightsWarningDialogProps> = ({ 
  onClose
}) => {
  return (
    <>
      {/* Semi-transparent overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000
      }} onClick={onClose} />
      
      {/* Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: 'var(--rr-shadow)',
        zIndex: 1001,
        minWidth: '400px',
        maxWidth: '500px'
      }}>
        <div style={{
          fontFamily: 'inherit',
          fontSize: '18px',
          fontWeight: 500,
          color: 'var(--rr-text)',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          No Flights Available
        </div>
        <div style={{
          fontFamily: 'inherit',
          fontSize: '14px',
          color: 'var(--rr-text2)',
          marginBottom: '24px',
          textAlign: 'center',
          lineHeight: '1.5'
        }}>
          No flights available for assignment. Please import a .miz file or add flights manually first.
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center'
        }}>
          <button
            onClick={onClose}
            style={{
              width: '120px',
              height: '40px',
              background: 'var(--rr-accent)',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
            }}
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
};

export default NoFlightsWarningDialog;