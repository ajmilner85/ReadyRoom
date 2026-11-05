import React, { useState } from 'react';

interface AddKillButtonProps {
  onClick: (event: React.MouseEvent) => void;
}

const AddKillButton: React.FC<AddKillButtonProps> = ({ onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        minHeight: '48px',
        flex: 1,
        width: '120px',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8px',
        cursor: 'pointer'
      }}
    >
      {isHovered && (
        <button
          type="button"
          style={{
            width: '30px',
            height: '30px',
            background: 'var(--rr-panel)',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease-in-out',
            fontFamily: 'inherit',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '20px',
            lineHeight: '24px',
            color: 'var(--rr-text2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--rr-shadow)',
            pointerEvents: 'none'
          }}
        >
          +
        </button>
      )}
    </div>
  );
};

export default AddKillButton;
