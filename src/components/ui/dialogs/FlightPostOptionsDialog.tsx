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
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        zIndex: 1001,
        minWidth: '400px',
        maxWidth: '500px'
      }}>
        <div style={{
          fontFamily: 'Inter',
          fontSize: '18px',
          fontWeight: 500,
          color: '#1F2937',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          Flight Assignments Already Posted
        </div>
        <div style={{
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#6B7280',
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
              background: '#3B82F6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#2563EB';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#3B82F6';
            }}
          >
            Update Existing {existingPostsCount === 1 ? 'Post' : 'Posts'}
          </button>
          <button
            onClick={onCreateNew}
            style={{
              width: '100%',
              height: '40px',
              background: '#10B981',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#059669';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#10B981';
            }}
          >
            Create New Post
          </button>
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              height: '40px',
              background: '#F3F4F6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#E5E7EB';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#F3F4F6';
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