import React, { useState } from 'react';
import { Trash2, CheckCircle, AlertCircle, Home } from 'lucide-react';
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
      backgroundColor: '#F8FAFC',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
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
            backgroundColor: '#FEF2F2',
            borderRadius: '50%',
            marginBottom: '16px'
          }}>
            <Trash2 size={32} style={{ color: '#EF4444' }} />
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 600,
            color: '#0F172A',
            margin: '0 0 8px 0'
          }}>
            Clear Permission Cache
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#64748B',
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
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <CheckCircle size={20} style={{ color: '#10B981', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#065F46' }}>
                Cache cleared successfully!
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
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
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <AlertCircle size={20} style={{ color: '#EF4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#991B1B' }}>
                Failed to clear cache
              </div>
              {error && (
                <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>
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
              backgroundColor: (clearing || status === 'success') ? '#E5E7EB' : '#EF4444',
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
            <Trash2 size={16} />
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
              backgroundColor: '#F1F5F9',
              color: '#475569',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Home size={16} />
            Return to Home
          </a>
        </div>

        {/* Info Box */}
        <div style={{
          marginTop: '32px',
          padding: '16px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#475569',
            marginBottom: '8px'
          }}>
            What does this do?
          </div>
          <div style={{
            fontSize: '12px',
            color: '#64748B',
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
