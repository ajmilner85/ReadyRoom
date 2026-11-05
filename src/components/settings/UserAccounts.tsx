import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Lock, RefreshCw, Link, ExternalLink, Shield, Mail, Copy, Check, Tablet, Key } from 'lucide-react';

interface UserAccountsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const UserAccounts: React.FC<UserAccountsProps> = ({ }) => {
  const { user, userProfile } = useAuth();
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    borderBottom: '1px solid var(--rr-border)',
    marginBottom: '32px'
  };

  const lastSectionStyle = {
    paddingBottom: '32px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--rr-panel)' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid var(--rr-border)', paddingBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: 'var(--rr-text)' }}>
            Account
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '8px 0 0 0', fontFamily: 'inherit' }}>
            Manage your account information and security settings.
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Current Session Info */}
          <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} />
          Current Session
        </h3>
        
        <div style={{
          padding: '16px',
          backgroundColor: 'var(--rr-accent-weak)',
          border: '1px solid #BAE6FD',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            marginBottom: '4px'
          }}>
            Session Status: <span style={{ color: 'var(--rr-good)', fontWeight: 500 }}>Active</span>
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--rr-text2)',
            marginBottom: '4px'
          }}>
            Logged in as: <span style={{ color: 'var(--rr-text)', fontWeight: 500 }}>{user?.email || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={20} />
          Account Information
        </h3>
        
        <div style={{
          padding: '16px',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          backgroundColor: 'var(--rr-panel)'
        }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Mail size={16} className="text-text2" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-text)' }}>Email Address</div>
                <div style={{ fontSize: '13px', color: 'var(--rr-text2)' }}>{user?.email || 'Not available'}</div>
              </div>
            </div>
            
            {userProfile?.pilot && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <User size={16} className="text-text2" />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-text)' }}>Pilot Record</div>
                    <div style={{ fontSize: '13px', color: 'var(--rr-text2)' }}>
                      {userProfile.pilot.callsign} (Board #{userProfile.pilot.boardNumber})
                    </div>
                  </div>
                </div>
              </>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link size={16} className="text-text2" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-text)' }}>Discord Account</div>
                <div style={{ fontSize: '13px', color: 'var(--rr-text2)' }}>
                  {userProfile?.discordUsername ? `@${userProfile.discordUsername}` : 'Not connected'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Section */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={20} />
          Password & Security
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 16px 0', fontFamily: 'inherit' }}>
          Reset your password if Discord OAuth isn't working or you need to update your credentials.
        </p>
        
        {!showPasswordReset ? (
          <button
            onClick={() => setShowPasswordReset(true)}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--rr-panel2)',
              color: 'var(--rr-text)',
              border: '1px solid var(--rr-border2)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              e.currentTarget.style.borderColor = 'var(--rr-border2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              e.currentTarget.style.borderColor = 'var(--rr-border2)';
            }}
          >
            <Lock size={16} />
            Reset Password
          </button>
        ) : (
          <div style={{
            padding: '16px',
            border: '1px solid var(--rr-border)',
            borderRadius: '8px',
            backgroundColor: 'var(--rr-panel2)'
          }}>
            <form onSubmit={handlePasswordReset}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)'
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
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              
              {resetMessage && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: resetMessage.includes('successfully') ? 'rgba(64,168,91,.14)' : 'rgba(224,82,78,.12)',
                  border: `1px solid ${resetMessage.includes('successfully') ? 'var(--rr-good)' : 'var(--rr-bad)'}`,
                  borderRadius: '6px',
                  color: resetMessage.includes('successfully') ? 'var(--rr-good)' : 'var(--rr-bad)',
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
                    backgroundColor: resetLoading ? '#9CA3AF' : 'var(--rr-accent)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: resetLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
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
                    backgroundColor: 'var(--rr-panel2)',
                    color: 'var(--rr-text)',
                    border: '1px solid var(--rr-border2)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
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
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link size={20} />
          Discord Integration
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 16px 0', fontFamily: 'inherit' }}>
          {userProfile?.discordUsername
            ? 'Your Discord account is linked. You can relink if you\'re experiencing issues.'
            : 'Link your Discord account for seamless authentication and access.'
          }
        </p>

        <div style={{
          padding: '16px',
          border: '1px solid var(--rr-border)',
          borderRadius: '8px',
          backgroundColor: userProfile?.discordUsername ? 'var(--rr-accent-weak)' : 'rgba(224,82,78,.12)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--rr-text)', marginBottom: '4px' }}>
                Discord Status: {userProfile?.discordUsername ? (
                  <span style={{ color: 'var(--rr-good)' }}>Connected</span>
                ) : (
                  <span style={{ color: 'var(--rr-bad)' }}>Not Connected</span>
                )}
              </div>
              {userProfile?.discordUsername && (
                <div style={{ fontSize: '13px', color: 'var(--rr-text2)' }}>
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
                fontFamily: 'inherit',
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

      {/* OpenKneeboard Integration */}
      <div style={lastSectionStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tablet size={20} />
          OpenKneeboard
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--rr-text2)', margin: '0 0 16px 0', fontFamily: 'inherit' }}>
          Access live flight assignments and mission data directly in your cockpit using OpenKneeboard.
        </p>

        <div style={{
          padding: '16px',
          border: '1px solid #DDD6FE',
          borderRadius: '8px',
          backgroundColor: '#F5F3FF'
        }}>
          {/* Kneeboard URL display */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--rr-text2)',
              marginBottom: '6px'
            }}>
              Kneeboard URL (paste this into OpenKneeboard)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/kneeboard`}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  backgroundColor: 'var(--rr-panel)',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: 'var(--rr-text)',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/kneeboard`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  padding: '10px 16px',
                  backgroundColor: copied ? 'var(--rr-good)' : '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background-color 0.2s ease',
                  minWidth: '100px',
                  justifyContent: 'center'
                }}
              >
                {copied ? (
                  <>
                    <Check size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy URL
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Setup instructions */}
          <div style={{
            paddingTop: '16px',
            borderTop: '1px solid #DDD6FE'
          }}>
            <p style={{ fontSize: '13px', color: 'var(--rr-text2)', margin: '0 0 8px 0' }}>
              <strong>Setup:</strong> In OpenKneeboard, go to Settings → Tabs → Add Tab → Web Dashboard, then paste the kneeboard URL above.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--rr-text2)', margin: 0 }}>
              You'll be prompted to authenticate with Discord when you first open the kneeboard page.{' '}
              <a
                href="https://openkneeboard.com/api/web-dashboards/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#7C3AED', textDecoration: 'underline' }}
              >
                Learn more
              </a>
            </p>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default UserAccounts;