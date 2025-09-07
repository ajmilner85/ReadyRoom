import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'small' | 'medium' | 'large';
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'small', 
  color = '#4B5563' // Changed default color to dark grey
}) => {
  // Size mapping with reduced sizes
  const sizeMap = {
    sm: 14,
    small: 18,
    medium: 32,
    large: 48
  };

  const spinnerSize = sizeMap[size];
  const borderWidth = spinnerSize / 8;

  // Define animation styles with React's style approach
  const spinnerStyle = {
    display: 'inline-block',
    width: `${spinnerSize}px`,
    height: `${spinnerSize}px`,
    borderRadius: '50%',
    border: `${borderWidth}px solid rgba(75, 85, 99, 0.2)`,
    borderTopColor: color,
    animation: 'spinner 1s linear infinite',
  };

  // Add keyframes animation to document head if it doesn't exist
  React.useEffect(() => {
    // Check if the animation style already exists
    const styleId = 'spinner-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes spinner {
          to {
            transform: rotate(360deg);
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Cleanup function to remove style element when component unmounts
    return () => {
      // Only remove if no other spinner components are using it
      // For simplicity, we're skipping this cleanup, as it might affect other spinner instances
    };
  }, []);

  return (
    <div 
      style={spinnerStyle}
      aria-label="Loading"
      role="status"
    />
  );
};

export default LoadingSpinner;