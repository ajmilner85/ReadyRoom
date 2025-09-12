import React, { useState, useEffect } from 'react';
import { Code, Server, CheckCircle, AlertCircle } from 'lucide-react';
import { getUserSettings, updateDeveloperSettings } from '../../utils/userSettingsService';
import { UserSettings } from '../../types/UserSettings';

interface DeveloperSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const DeveloperSettings: React.FC<DeveloperSettingsProps> = ({ setError }) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load user settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const result = await getUserSettings();
        if (result.success && result.data) {
          setSettings(result.data);
        } else {
          setError?.(result.error || 'Failed to load developer settings');
        }
      } catch (err: any) {
        setError?.(err.message || 'Error loading developer settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [setError]);

  const handleBotTokenChange = async (tokenType: 'development' | 'production') => {
    if (!settings) return;

    setSaving(true);
    setSaveStatus('idle');
    
    try {
      const result = await updateDeveloperSettings({ discordBotToken: tokenType });
      
      if (result.success && result.data) {
        setSettings(result.data);
        setSaveStatus('success');
        // Clear success status after 3 seconds
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setError?.(result.error || 'Failed to update bot token setting');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setError?.(err.message || 'Error updating bot token setting');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        backgroundColor: '#FFFFFF',
        minHeight: '200px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #E2E8F0',
          borderTopColor: '#3B82F6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  const containerStyle = {
    backgroundColor: '#FFFFFF',
    minHeight: '100vh',
    padding: '40px',
    boxSizing: 'border-box' as const
  };

  const contentWrapperStyle = {
    maxWidth: '800px',
    margin: '0 auto'
  };

  const headerStyle = {
    marginBottom: '40px'
  };

  const sectionStyle = {
    paddingTop: '32px',
    paddingBottom: '32px',
    borderTop: '1px solid #E5E7EB',
    marginTop: '32px'
  };

  const firstSectionStyle = {
    paddingTop: '0',
    paddingBottom: '32px',
    marginTop: '0',
    borderTop: 'none'
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Code size={28} style={{ color: '#7C3AED' }} />
            <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
              Developer Settings
            </h2>
          </div>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Advanced settings for development and testing. These settings only affect your account.
          </p>
        </div>

        {/* Discord Bot Token Selection */}
        <div style={firstSectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Server size={20} style={{ color: '#5865F2' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
              Discord Bot Configuration
            </h3>
            {/* Status indicator */}
            {settings?.developer?.discordBotToken === 'production' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500
              }}>
                <AlertCircle size={12} />
                PRODUCTION MODE
              </div>
            )}
          </div>
          
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Choose which Discord bot token to use for local development. Production token gives access to real squadron Discord server with full role and user data.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Development Option */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              border: settings?.developer?.discordBotToken === 'development' ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              borderRadius: '8px',
              backgroundColor: settings?.developer?.discordBotToken === 'development' ? '#EFF6FF' : '#FFFFFF',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}>
              <input
                type="radio"
                name="discordBotToken"
                value="development"
                checked={settings?.developer?.discordBotToken === 'development'}
                onChange={() => handleBotTokenChange('development')}
                disabled={saving}
                style={{ marginRight: '4px' }}
              />
              <div>
                <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '14px' }}>
                  Development Bot Token
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Uses Squadron Duty Officer (DEV) bot - connects to personal Discord server
                </div>
              </div>
            </label>

            {/* Production Option */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              border: settings?.developer?.discordBotToken === 'production' ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              borderRadius: '8px',
              backgroundColor: settings?.developer?.discordBotToken === 'production' ? '#EFF6FF' : '#FFFFFF',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}>
              <input
                type="radio"
                name="discordBotToken"
                value="production"
                checked={settings?.developer?.discordBotToken === 'production'}
                onChange={() => handleBotTokenChange('production')}
                disabled={saving}
                style={{ marginRight: '4px' }}
              />
              <div>
                <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '14px' }}>
                  Production Bot Token
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Uses Squadron Duty Officer bot - connects to squadron Discord server with real data
                </div>
                <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontWeight: 500 }}>
                  ⚠️ Use with caution - can affect real squadron data
                </div>
              </div>
            </label>
          </div>

          {/* Save Status */}
          {saveStatus !== 'idle' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: saveStatus === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${saveStatus === 'success' ? '#BBF7D0' : '#FECACA'}`
            }}>
              {saveStatus === 'success' ? (
                <CheckCircle size={16} style={{ color: '#10B981' }} />
              ) : (
                <AlertCircle size={16} style={{ color: '#EF4444' }} />
              )}
              <span style={{
                fontSize: '14px',
                color: saveStatus === 'success' ? '#065F46' : '#991B1B',
                fontWeight: 500
              }}>
                {saveStatus === 'success' 
                  ? 'Bot token setting updated successfully' 
                  : 'Failed to update bot token setting'
                }
              </span>
            </div>
          )}
        </div>

        {/* Future Development Settings Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Future Development Tools
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0', fontFamily: 'Inter' }}>
            Additional development tools and settings will be added here as needed.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeveloperSettings;