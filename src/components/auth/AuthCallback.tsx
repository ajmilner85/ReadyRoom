import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check if we have auth code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        // For development debugging only
        if (process.env.NODE_ENV === 'development') {
          setDebugInfo({ code: !!code, state: !!state, url: window.location.href });
        }
        
        if (code) {
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            throw error;
          }
          
          if (data.session) {
            navigate('/', { replace: true });
            return;
          }
        }
        
        // Fallback: try to get existing session
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data.session) {
          navigate('/', { replace: true });
        } else {
          navigate('/', { replace: true }); // Go to main page which will show login
        }
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setError(err.message || 'Authentication failed');
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 5000);
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-4">Completing authentication...</p>
          {debugInfo && (
            <div className="text-xs text-left bg-gray-100 p-3 rounded">
              <div>Code: {debugInfo.code ? 'Found' : 'Missing'}</div>
              <div>State: {debugInfo.state ? 'Found' : 'Missing'}</div>
              <div className="mt-2 break-all">URL: {debugInfo.url}</div>
            </div>
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
          <p className="text-gray-600 mb-4">{error}</p>
          {debugInfo && (
            <div className="text-xs text-left bg-gray-100 p-3 rounded mb-4">
              <div>Code: {debugInfo.code ? 'Found' : 'Missing'}</div>
              <div>State: {debugInfo.state ? 'Found' : 'Missing'}</div>
              <div className="mt-2 break-all">URL: {debugInfo.url}</div>
            </div>
          )}
          <p className="text-sm text-gray-500">Redirecting...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;