import React from 'react';
import { useAuth } from '../../context/AuthContext';
import LoginForm from './LoginForm';
import DebugAuth from './DebugAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, userProfile, loading, error } = useAuth();

  // Debug mode for development only
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  if (showDebug && process.env.NODE_ENV === 'development') {
    return <DebugAuth />;
  }

  // Show loading spinner while authentication state is being determined
  // OR while user profile is being loaded
  if (loading || (user && userProfile === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loading ? "Authenticating..." : "Loading profile..."}
          </p>
        </div>
      </div>
    );
  }

  // Show error state if authentication failed
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">Authentication Error</p>
          <LoginForm onSuccess={() => {
            // The auth context will handle the state change
          }} />
        </div>
      </div>
    );
  }

  // Show login form if no authenticated user
  if (!user) {
    return <LoginForm onSuccess={() => {
      // The auth context will handle the state change
    }} />;
  }

  // User is authenticated, show the protected content
  return <>{children}</>;
};

export default ProtectedRoute;