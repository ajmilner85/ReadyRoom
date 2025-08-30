import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('🔄 Processing auth callback...', window.location.href);
        
        // Check if we have auth parameters in URL  
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        console.log('Auth params:', { code: !!code, state: !!state });
        
        if (code) {
          // For PKCE flow, pass the entire URL to exchangeCodeForSession
          // Use raw supabase client to avoid retry wrapper timeouts during auth
          console.log('🔑 Exchanging code for session...');
          
          const { data, error } = await Promise.race([
            supabase.auth.exchangeCodeForSession(window.location.href),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Auth exchange timeout')), 30000)
            )
          ]);
          
          if (error) {
            console.error('❌ Auth callback error:', error);
            throw error;
          }
          
          if (data.session) {
            console.log('✅ Authentication successful, redirecting...');
            // Clear the URL parameters before redirecting
            window.history.replaceState({}, document.title, '/');
            navigate('/', { replace: true });
            return;
          }
        }
        
        // Fallback: check for existing session (with timeout)
        console.log('🔍 Checking for existing session...');
        const { data: sessionData, error: sessionError } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), 15000)
          )
        ]);
        
        if (sessionError) {
          console.error('❌ Session check error:', sessionError);
          throw sessionError;
        }

        if (sessionData.session) {
          console.log('✅ Existing session found, redirecting...');
          navigate('/', { replace: true });
        } else {
          console.warn('⚠️ No session found, redirecting to login');
          navigate('/', { replace: true });
        }
      } catch (err: any) {
        console.error('💥 Auth callback error:', err);
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
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#F0F4F8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '300px',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '32px 24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #E5E7EB',
            borderTopColor: '#3B82F6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            color: '#0F172A',
            margin: '0 0 8px 0'
          }}>
            Completing Sign In
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#64748B',
            margin: 0
          }}>
            Just a moment...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#F0F4F8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '400px',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#DC2626',
            margin: '0 0 16px 0'
          }}>
            Authentication Error
          </h3>
          <p style={{
            fontSize: '14px',
            color: '#64748B',
            margin: '0 0 16px 0'
          }}>
            {error}
          </p>
          <p style={{
            fontSize: '12px',
            color: '#9CA3AF',
            margin: 0
          }}>
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;