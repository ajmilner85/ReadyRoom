import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface StandardPageLoaderProps {
  message?: string;
}

const StandardPageLoader: React.FC<StandardPageLoaderProps> = ({ message = "Loading page..." }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      flex: 1,
      minHeight: 0,
      color: 'var(--rr-text2)',
      fontSize: '13px'
    }}>
      <LoadingSpinner size="medium" />
      <div>{message}</div>
    </div>
  );
};

export default StandardPageLoader;