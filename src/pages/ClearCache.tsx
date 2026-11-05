import React, { useState } from 'react';
import { Icon } from '../components/ui/primitives';
import { permissionCache } from '../utils/permissionCache';

/**
 * Emergency cache clearing page - accessible without permissions
 * Use this page if you're locked out due to stale permission cache
 */
const ClearCache: React.FC = () => {
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClearCache = async () => {
    setClearing(true);
    setStatus('idle');
    setError(null);

    try {
      await permissionCache.invalidateAllPermissions();
      setStatus('success');
      // Reload after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to clear cache');
      setClearing(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--rr-panel2)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '12px',
        boxShadow: 'var(--rr-shadow)',
        padding: '40px'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            backgroundColor: 'rgba(224,82,78,.12)',
            borderRadius: '50%',
            marginBottom: '16px'
          }}>
            <Icon name="trash" size={32} style={{ color: 'var(--rr-bad)' }} />
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--rr-text)',
            margin: '0 0 8px 0'
          }}>
            Clear Permission Cache
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            margin: 0,
            lineHeight: 1.6
          }}>
            Use this page if you're experiencing permission issues or can't access other sections of the app.
          </p>
        </div>

        {/* Status Messages */}
        {status === 'success' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            backgroundColor: 'rgba(64,168,91,.14)',
            border: '1px solid var(--rr-good)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <Icon name="checkCircle" size={20} style={{ color: 'var(--rr-good)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-good)' }}>
                Cache cleared successfully!
              </div>
              <div style={{ fontSize: '12px', color: 'var(--rr-good)', marginTop: '2px' }}>
                Redirecting to home page...
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            backgroundColor: 'rgba(224,82,78,.12)',
            border: '1px solid var(--rr-bad)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <Icon name="alertCircle" size={20} style={{ color: 'var(--rr-bad)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-bad)' }}>
                Failed to clear cache
              </div>
              {error && (
                <div style={{ fontSize: '12px', color: 'var(--rr-bad)', marginTop: '4px' }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={handleClearCache}
            disabled={clearing || status === 'success'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: (clearing || status === 'success') ? 'var(--rr-panel3)' : 'var(--rr-bad)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: (clearing || status === 'success') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: (clearing || status === 'success') ? 0.6 : 1
            }}
          >
            <Icon name="trash" size={16} />
            {clearing ? 'Clearing Cache...' : 'Clear Permission Cache'}
          </button>

          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: 'var(--rr-panel2)',
              color: 'var(--rr-text2)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Icon name="home" size={16} />
            Return to Home
          </a>
        </div>

        {/* Info Box */}
        <div style={{
          marginTop: '32px',
          padding: '16px',
          backgroundColor: 'var(--rr-panel2)',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--rr-text2)',
            marginBottom: '8px'
          }}>
            What does this do?
          </div>
          <div style={{
            fontSize: '12px',
            color: 'var(--rr-text2)',
            lineHeight: 1.6
          }}>
            This clears all cached permissions for all users. After clearing, permissions will be recalculated from the database when you next access the app.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClearCache;
