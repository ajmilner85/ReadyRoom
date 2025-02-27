import React from 'react';

interface TimeAdjusterProps {
  isVisible: boolean;
  onAdjust: (minutesToAdd: number) => void;
}

export const TimeAdjuster: React.FC<TimeAdjusterProps> = ({ isVisible, onAdjust }) => {
  if (!isVisible) return null;

  const buttonBaseStyle = {
    padding: '2px 4px',
    fontSize: '10px',
    background: '#475569',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '24px',
    textAlign: 'center' as const
  };

  const buttonHoverStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#334155';
    e.currentTarget.style.transform = 'translateY(-1px)';
  };

  const buttonLeaveStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#475569';
    e.currentTarget.style.transform = 'translateY(0)';
  };

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      opacity: 0.8,
      transition: 'opacity 0.2s',
      marginTop: '4px'
    }}>
      <button 
        onClick={() => onAdjust(-5)} 
        style={buttonBaseStyle}
        onMouseEnter={buttonHoverStyle}
        onMouseLeave={buttonLeaveStyle}
      >-5</button>
      <button 
        onClick={() => onAdjust(-1)} 
        style={buttonBaseStyle}
        onMouseEnter={buttonHoverStyle}
        onMouseLeave={buttonLeaveStyle}
      >-1</button>
      <button 
        onClick={() => onAdjust(1)} 
        style={buttonBaseStyle}
        onMouseEnter={buttonHoverStyle}
        onMouseLeave={buttonLeaveStyle}
      >+1</button>
      <button 
        onClick={() => onAdjust(5)} 
        style={buttonBaseStyle}
        onMouseEnter={buttonHoverStyle}
        onMouseLeave={buttonLeaveStyle}
      >+5</button>
    </div>
  );
};