import React, { useState } from 'react';
import { signIn, signInWithDiscord, resetPassword } from '../../utils/supabaseClient';


interface LoginFormProps {
  onSuccess?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        throw error;
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setResetLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await resetPassword(email);
      if (error) {
        throw error;
      }
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Store current path for redirect after auth
      const currentPath = window.location.pathname;
      if (currentPath && currentPath !== '/') {
        sessionStorage.setItem('auth_redirect_path', currentPath);
      }

      const { error } = await signInWithDiscord();
      if (error) {
        throw error;
      }
      // Discord OAuth will redirect to callback, so no need to call onSuccess here
    } catch (err: any) {
      setError(err.message || 'Discord login failed');
      setDiscordLoading(false);
    }
  };

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
        padding: '24px'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'inherit',
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--rr-text)',
            margin: '0 0 8px 0'
          }}>
            Sign in to ReadyRoom
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            margin: 0
          }}>
            Access your squadron management dashboard
          </p>
        </div>
        
        {/* Error Message */}
        {error && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'rgba(224,82,78,.12)',
            border: '1px solid var(--rr-bad)',
            borderRadius: '6px',
            color: 'var(--rr-bad)',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Success Message */}
        {message && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'rgba(64,168,91,.14)',
            border: '1px solid var(--rr-good)',
            borderRadius: '6px',
            color: 'var(--rr-good)',
            fontSize: '14px'
          }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Discord Login - Primary Method */}
          <div>
            <button
              onClick={handleDiscordLogin}
              disabled={discordLoading || loading}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                backgroundColor: (discordLoading || loading) ? '#9CA3AF' : '#5865F2',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: (discordLoading || loading) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                position: 'relative'
              }}
            >
              {discordLoading ? (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'var(--rr-panel)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              ) : (
                <svg style={{ width: '20px', height: '20px' }} viewBox="0 -28.5 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
                  <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#FFFFFF" fillRule="nonzero"></path>
                </svg>
              )}
              {discordLoading ? 'Connecting...' : 'Continue with Discord'}
            </button>
            <p style={{
              marginTop: '8px',
              fontSize: '12px',
              color: 'var(--rr-text2)',
              textAlign: 'center'
            }}>
              Recommended: Sign in with your squadron Discord account
            </p>
          </div>

          {/* Divider */}
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: 'var(--rr-panel3)',
              zIndex: 1
            }} />
            <div style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 2
            }}>
              <span style={{
                padding: '0 8px',
                backgroundColor: 'var(--rr-panel)',
                color: 'var(--rr-text2)',
                fontSize: '14px'
              }}>Or</span>
            </div>
          </div>

          {/* Email/Password Login - Fallback Method */}
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--rr-text2)'
              }}>
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '40px',
                  fontFamily: 'inherit'
                }}
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--rr-text2)'
              }}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '40px',
                  fontFamily: 'inherit'
                }}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading || discordLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: (loading || discordLoading) ? '#9CA3AF' : 'var(--rr-panel)',
                  color: (loading || discordLoading) ? '#FFFFFF' : 'var(--rr-text)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: (loading || discordLoading) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {loading ? (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'var(--rr-panel)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                ) : null}
                {loading ? 'Signing in...' : 'Sign in with Email'}
              </button>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={resetLoading || loading || discordLoading}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: (resetLoading || loading || discordLoading) ? 'var(--rr-text3)' : 'var(--rr-accent-text)',
                  cursor: (resetLoading || loading || discordLoading) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  textDecoration: 'underline',
                  fontFamily: 'inherit'
                }}
              >
                {resetLoading ? 'Sending...' : 'Forgot password?'}
              </button>
            </div>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ fontSize: '12px', color: 'var(--rr-text2)' }}>
            Need help? Contact your squadron administrator
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;