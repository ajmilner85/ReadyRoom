import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Lock, RefreshCw, Link, ExternalLink, Shield, Mail, Key } from 'lucide-react';

interface UserAccountsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const UserAccounts: React.FC<UserAccountsProps> = ({ error, setError }) => {
  const { user, userProfile } = useAuth();
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage(null);
    
    try {
      // This would integrate with your password reset logic
      // For now, just simulate the process
      await new Promise(resolve => setTimeout(resolve, 1000));
      setResetMessage('Password reset email sent successfully!');
      setResetEmail('');
    } catch (error) {
      setResetMessage('Failed to send password reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDiscordRelink = () => {
    // This would trigger Discord OAuth re-authentication
    console.log('Initiating Discord relink...');
    // You would redirect to Discord OAuth or open a popup
  };

  const sectionStyle = {
    paddingBottom: '32px',
    borderBottom: '1px solid #E5E7EB',
    marginBottom: '32px'
  };

  const lastSectionStyle = {
    paddingBottom: '32px'
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
          Account
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
          Manage your account information and security settings.
        </p>
      </div>

      {/* Current Session Info */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} />
          Current Session
        </h3>
        
        <div style={{
          padding: '16px',
          backgroundColor: '#F0F9FF',
          border: '1px solid #BAE6FD',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#64748B',
            marginBottom: '4px'
          }}>
            Session Status: <span style={{ color: '#059669', fontWeight: 500 }}>Active</span>
          </div>
          <div style={{
            fontSize: '14px',
            color: '#64748B',
            marginBottom: '4px'
          }}>
            Logged in as: <span style={{ color: '#0F172A', fontWeight: 500 }}>{user?.email || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={20} />
          Account Information
        </h3>
        
        <div style={{
          padding: '16px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          backgroundColor: '#FFFFFF'
        }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Mail size={16} className="text-gray-500" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>Email Address</div>
                <div style={{ fontSize: '13px', color: '#64748B' }}>{user?.email || 'Not available'}</div>
              </div>
            </div>
            
            {userProfile?.pilot && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <User size={16} className="text-gray-500" />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>Pilot Record</div>
                    <div style={{ fontSize: '13px', color: '#64748B' }}>
                      {userProfile.pilot.callsign} (Board #{userProfile.pilot.boardNumber})
                    </div>
                  </div>
                </div>
              </>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link size={16} className="text-gray-500" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>Discord Account</div>
                <div style={{ fontSize: '13px', color: '#64748B' }}>
                  {userProfile?.discordUsername ? `@${userProfile.discordUsername}` : 'Not connected'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Section */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={20} />
          Password & Security
        </h3>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
          Reset your password if Discord OAuth isn't working or you need to update your credentials.
        </p>
        
        {!showPasswordReset ? (
          <button
            onClick={() => setShowPasswordReset(true)}
            style={{
              padding: '10px 16px',
              backgroundColor: '#F8FAFC',
              color: '#374151',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'Inter',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F1F5F9';
              e.currentTarget.style.borderColor = '#94A3B8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
              e.currentTarget.style.borderColor = '#D1D5DB';
            }}
          >
            <Lock size={16} />
            Reset Password
          </button>
        ) : (
          <div style={{
            padding: '16px',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            backgroundColor: '#FAFAFA'
          }}>
            <form onSubmit={handlePasswordReset}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    fontFamily: 'Inter'
                  }}
                />
              </div>
              
              {resetMessage && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: resetMessage.includes('successfully') ? '#DCFCE7' : '#FEF2F2',
                  border: `1px solid ${resetMessage.includes('successfully') ? '#BBF7D0' : '#FECACA'}`,
                  borderRadius: '6px',
                  color: resetMessage.includes('successfully') ? '#166534' : '#DC2626',
                  fontSize: '14px'
                }}>
                  {resetMessage}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={resetLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: resetLoading ? '#9CA3AF' : '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: resetLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'Inter',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {resetLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail size={14} />
                      Send Reset Email
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordReset(false);
                    setResetMessage(null);
                    setResetEmail('');
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F8FAFC',
                    color: '#374151',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontFamily: 'Inter'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Discord Integration */}
      <div style={lastSectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link size={20} />
          Discord Integration
        </h3>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
          {userProfile?.discordUsername 
            ? 'Your Discord account is linked. You can relink if you\'re experiencing issues.'
            : 'Link your Discord account for seamless authentication and access.'
          }
        </p>
        
        <div style={{
          padding: '16px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          backgroundColor: userProfile?.discordUsername ? '#F0F9FF' : '#FEF2F2'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A', marginBottom: '4px' }}>
                Discord Status: {userProfile?.discordUsername ? (
                  <span style={{ color: '#059669' }}>Connected</span>
                ) : (
                  <span style={{ color: '#DC2626' }}>Not Connected</span>
                )}
              </div>
              {userProfile?.discordUsername && (
                <div style={{ fontSize: '13px', color: '#64748B' }}>
                  Connected as: @{userProfile.discordUsername}
                </div>
              )}
            </div>
            
            <button
              onClick={handleDiscordRelink}
              style={{
                padding: '8px 16px',
                backgroundColor: '#5865F2',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'Inter',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4752C4'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5865F2'}
            >
              <ExternalLink size={14} />
              {userProfile?.discordUsername ? 'Relink Discord' : 'Connect Discord'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserAccounts;