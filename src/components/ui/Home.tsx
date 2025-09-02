import React, { useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';

const Home: React.FC = () => {
  const { setPageLoading } = usePageLoading();

  // Clear page loading immediately since home loads fast
  useEffect(() => {
    setPageLoading('home', false);
  }, [setPageLoading]);
  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        padding: '20px'
      }}
    >
      {/* Home page content placeholder */}
    </div>
  );
};

export default Home;