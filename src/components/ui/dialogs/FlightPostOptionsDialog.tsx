import React from 'react';

interface FlightPostOptionsDialogProps {
  onCancel: () => void;
  onUpdateExisting: () => void;
  onCreateNew: () => void;
  existingPostsCount: number;
}

const FlightPostOptionsDialog: React.FC<FlightPostOptionsDialogProps> = ({ 
  onCancel, 
  onUpdateExisting, 
  onCreateNew,
  existingPostsCount
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
      }} onClick={onCancel} />
      
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
          Flight Assignments Already Posted
        </div>
        <div style={{
          fontFamily: 'inherit',
          fontSize: '14px',
          color: 'var(--rr-text2)',
          marginBottom: '24px',
          textAlign: 'center',
          lineHeight: '1.5'
        }}>
          Flight assignments have already been posted to Discord for this event. 
          Would you like to update the existing {existingPostsCount === 1 ? 'post' : 'posts'} or create a new one?
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={onUpdateExisting}
            style={{
              width: '100%',
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
            Update Existing {existingPostsCount === 1 ? 'Post' : 'Posts'}
          </button>
          <button
            onClick={onCreateNew}
            style={{
              width: '100%',
              height: '40px',
              background: 'var(--rr-good)',
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
              e.currentTarget.style.backgroundColor = 'var(--rr-good)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-good)';
            }}
          >
            Create New Post
          </button>
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              height: '40px',
              background: 'var(--rr-panel2)',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--rr-text)',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

export default FlightPostOptionsDialog;