import React from 'react';
import { useAuth } from '../../context/AuthContext';
import LoginForm from './LoginForm';
import DebugAuth from './DebugAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, error, refreshProfile } = useAuth();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [hasAttemptedRecovery, setHasAttemptedRecovery] = React.useState(false);

  // Auto-retry authentication on error (once)
  React.useEffect(() => {
    if (error && !hasAttemptedRecovery && !isRetrying) {
      setHasAttemptedRecovery(true);
      
      // Delay the auto-retry slightly to avoid race conditions
      const autoRetryTimeout = setTimeout(async () => {
        console.log('Auto-retrying authentication due to error:', error);
        setIsRetrying(true);
        
        try {
          await refreshProfile();
        } catch (err) {
          console.error('Auto-retry failed:', err);
        } finally {
          setIsRetrying(false);
        }
      }, 1000);
      
      return () => clearTimeout(autoRetryTimeout);
    }
  }, [error, hasAttemptedRecovery, isRetrying, refreshProfile]);

  // Debug mode for development only
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  if (showDebug && process.env.NODE_ENV === 'development') {
    return <DebugAuth />;
  }

  if (loading || isRetrying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isRetrying ? 'Recovering authentication...' : 'Loading...'}
          </p>
          {isRetrying && (
            <p className="text-xs text-gray-500 mt-2">
              This usually happens after deployments and should resolve automatically.
            </p>
          )}
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
              onClick={async () => {
                setIsRetrying(true);
                try {
                  // Try to refresh the profile/session first
                  await refreshProfile();
                  // Force a page reload if that doesn't work
                  setTimeout(() => {
                    if (error) {
                      window.location.reload();
                    }
                  }, 2000);
                } catch (err) {
                  console.error('Retry error:', err);
                  window.location.reload();
                } finally {
                  setIsRetrying(false);
                }
              }}
              disabled={isRetrying}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isRetrying ? 'Retrying...' : 'Auto-Retry Authentication'}
            </button>
            
            <div className="text-sm text-gray-500">If that doesn't work, try:</div>
            
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
              Sign in with Discord
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
                  // Clear app version to force refresh next time
                  localStorage.removeItem('app_version');
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
              Clear All Data & Reload
            </button>
            
            <div className="text-xs text-gray-400 mt-4">
              This error often occurs after deployments. The auto-retry should resolve it automatically.
            </div>
            
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