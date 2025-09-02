import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageLoading } from '../../context/PageLoadingContext';

interface AppContentProps {
  children: React.ReactNode;
}

const AppContent: React.FC<AppContentProps> = ({ children }) => {
  const { setPageLoading } = usePageLoading();
  const location = useLocation();

  // Clear loading for mission-coordination page since it doesn't use Suspense
  useEffect(() => {
    if (location.pathname === '/mission-coordination') {
      setPageLoading('flights', false);
    }
  }, [location.pathname, setPageLoading]);

  return <>{children}</>;
};

export default AppContent;