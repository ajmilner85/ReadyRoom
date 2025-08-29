import React from 'react';
import { useAuth } from '../../context/AuthContext';
import LoginForm from './LoginForm';
import DebugAuth from './DebugAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, isRecovering } = useAuth();
  // Note: We no longer handle the error here since it's handled silently in AuthContext

  // Debug mode for development only
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  if (showDebug && process.env.NODE_ENV === 'development') {
    return <DebugAuth />;
  }

  if (loading || isRecovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isRecovering ? 'Refreshing application...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // No error handling here anymore - all recovery is handled silently in AuthContext

  if (!user) {
    return <LoginForm onSuccess={() => {
      // The auth context will handle the state change
    }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;