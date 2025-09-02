import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PageLoadingContextType {
  isPageLoading: boolean;
  loadingPage: string | null;
  setPageLoading: (page: string | null, loading: boolean) => void;
}

const PageLoadingContext = createContext<PageLoadingContextType | undefined>(undefined);

export const usePageLoading = () => {
  const context = useContext(PageLoadingContext);
  if (context === undefined) {
    throw new Error('usePageLoading must be used within a PageLoadingProvider');
  }
  return context;
};

interface PageLoadingProviderProps {
  children: ReactNode;
}

export const PageLoadingProvider: React.FC<PageLoadingProviderProps> = ({ children }) => {
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState<string | null>(null);

  const setPageLoading = (page: string | null, loading: boolean) => {
    setLoadingPage(page);
    setIsPageLoading(loading);
  };

  return (
    <PageLoadingContext.Provider value={{
      isPageLoading,
      loadingPage,
      setPageLoading
    }}>
      {children}
    </PageLoadingContext.Provider>
  );
};