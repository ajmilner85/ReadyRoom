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
        // Check if we have auth code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          if (data.session) {
            // Check if there's a stored redirect path
            const redirectPath = sessionStorage.getItem('auth_redirect_path') || '/';
            sessionStorage.removeItem('auth_redirect_path');
            navigate(redirectPath, { replace: true });
            return;
          }
        }

        // Fallback: try to get existing session
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data.session) {
          // Check if there's a stored redirect path
          const redirectPath = sessionStorage.getItem('auth_redirect_path') || '/';
          sessionStorage.removeItem('auth_redirect_path');
          navigate(redirectPath, { replace: true });
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
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--rr-panel2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit'
      }}>
        <div style={{
          width: '300px',
          backgroundColor: 'var(--rr-panel)',
          boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
          borderRadius: '10px',
          padding: '32px 24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--rr-border)',
            borderTopColor: 'var(--rr-accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            color: 'var(--rr-text)',
            margin: '0 0 8px 0'
          }}>
            Completing Sign In
          </h3>
          <p style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
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
        backgroundColor: 'var(--rr-panel2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit'
      }}>
        <div style={{
          width: '400px',
          backgroundColor: 'var(--rr-panel)',
          boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
          borderRadius: '10px',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--rr-bad)',
            margin: '0 0 16px 0'
          }}>
            Authentication Error
          </h3>
          <p style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            margin: '0 0 16px 0'
          }}>
            {error}
          </p>
          <p style={{
            fontSize: '12px',
            color: 'var(--rr-text3)',
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