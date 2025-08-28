import React from 'react';
import { useAuth } from '../../context/AuthContext';
import LoginForm from './LoginForm';
import DebugAuth from './DebugAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, error } = useAuth();

  // Debug mode for development only
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  if (showDebug && process.env.NODE_ENV === 'development') {
    return <DebugAuth />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl mb-4">Authentication Error</div>
          <p className="text-gray-600 mb-6">{error}</p>
          
          <div className="space-y-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Retry
            </button>
            
            <div className="text-sm text-gray-500">Or try:</div>
            
            <button 
              onClick={async () => {
                try {
                  const { signInWithDiscord } = await import('../../utils/supabaseClient');
                  await signInWithDiscord();
                } catch (err) {
                  console.error('Discord login error:', err);
                }
              }}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Try Discord Login
            </button>
            
            <button 
              onClick={() => {
                try {
                  // Clear all Supabase auth related items
                  Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                      localStorage.removeItem(key);
                    }
                  });
                  Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                      sessionStorage.removeItem(key);
                    }
                  });
                  // Reload the page after clearing storage
                  window.location.reload();
                } catch (err) {
                  console.error('Error clearing storage:', err);
                  // Fallback - just reload
                  window.location.reload();
                }
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Clear Cache & Reload
            </button>
            
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm onSuccess={() => {
      // The auth context will handle the state change
    }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;