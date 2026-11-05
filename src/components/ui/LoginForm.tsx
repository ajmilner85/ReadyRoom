import React, { useState, useEffect } from 'react';
import { signIn, signOut, getCurrentUser } from '../../utils/supabaseClient';

interface LoginFormProps {
  onLoginStateChange?: (isLoggedIn: boolean) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginStateChange }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    const checkCurrentUser = async () => {
      const { user } = await getCurrentUser();
      if (user) {
        setUser(user);
        if (onLoginStateChange) onLoginStateChange(true);
      }
    };
    
    checkCurrentUser();
  }, [onLoginStateChange]);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        throw error;
      }
      
      if (data.user) {
        setUser(data.user);
        if (onLoginStateChange) onLoginStateChange(true);
        setEmail('');
        setPassword('');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogout = async () => {
    setLoading(true);
    
    try {
      const { error } = await signOut();
      
      if (error) {
        throw error;
      }
      
      setUser(null);
      if (onLoginStateChange) onLoginStateChange(false);
    } catch (err: any) {
      console.error('Logout error:', err);
      setError(err.message || 'Failed to logout');
    } finally {
      setLoading(false);
    }
  };
  
  if (user) {
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
          <h2 style={{
            fontFamily: 'inherit',
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--rr-text)',
            margin: '0 0 16px 0'
          }}>
            Admin Session Active
          </h2>
          
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: 'var(--rr-accent-weak)',
            border: '1px solid #BAE6FD',
            borderRadius: '6px'
          }}>
            <div style={{
              fontSize: '14px',
              color: 'var(--rr-text2)',
              marginBottom: '4px'
            }}>
              Logged in as:
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--rr-text)'
            }}>
              {user.email}
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? 'var(--rr-text3)' : 'var(--rr-bad)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'var(--rr-panel)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {loading ? 'Logging out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    );
  }
  
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
            Admin Login
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            margin: 0
          }}>
            Enter your credentials to access admin features
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
        
        {/* Form */}
        <form onSubmit={handleLogin}>
          {/* Email Field */}
          <div style={{ marginBottom: '16px' }}>
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
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            />
          </div>
          
          {/* Password Field */}
          <div style={{ marginBottom: '24px' }}>
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
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            />
          </div>
          
          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? 'var(--rr-text3)' : 'var(--rr-accent)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'var(--rr-panel)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;