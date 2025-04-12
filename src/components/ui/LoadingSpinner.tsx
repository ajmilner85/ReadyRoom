import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'small', 
  color = '#4B5563' // Changed default color to dark grey
}) => {
  // Size mapping with reduced sizes
  const sizeMap = {
    small: 18,
    medium: 32,
    large: 48
  };

  const spinnerSize = sizeMap[size];
  const borderWidth = spinnerSize / 8;

  return (
    <div 
      style={{
        display: 'inline-block',
        width: `${spinnerSize}px`,
        height: `${spinnerSize}px`,
        borderRadius: '50%',
        border: `${borderWidth}px solid rgba(75, 85, 99, 0.2)`,
        borderTopColor: color,
        animation: 'spinner 1s linear infinite',
      }}
      aria-label="Loading"
      role="status"
    >
      <style jsx>{`
        @keyframes spinner {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;