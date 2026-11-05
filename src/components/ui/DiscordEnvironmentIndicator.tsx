import React, { useEffect, useState } from 'react';
import { Icon } from './primitives';
import { getUserSettings } from '../../utils/userSettingsService';

interface DiscordEnvironmentIndicatorProps {
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

const DiscordEnvironmentIndicator: React.FC<DiscordEnvironmentIndicatorProps> = ({ 
  size = 'small', 
  showLabel = true 
}) => {
  const [environment, setEnvironment] = useState<'development' | 'production'>('development');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEnvironment = async () => {
      try {
        const result = await getUserSettings();
        if (result.success && result.data?.developer?.discordBotToken) {
          setEnvironment(result.data.developer.discordBotToken);
        }
      } catch (error) {
        console.warn('Failed to get Discord environment setting:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEnvironment();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        opacity: 0.5
      }}>
        <div style={{
          width: size === 'small' ? '12px' : '16px',
          height: size === 'small' ? '12px' : '16px',
          backgroundColor: 'var(--rr-panel3)',
          borderRadius: '50%',
          animation: 'pulse 1.5s infinite'
        }} />
        {showLabel && (
          <span style={{
            fontSize: size === 'small' ? '11px' : '12px',
            color: 'var(--rr-text3)',
            fontFamily: 'inherit'
          }}>
            Loading...
          </span>
        )}
        <style>
          {`
            @keyframes pulse {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
          `}
        </style>
      </div>
    );
  }

  const isProduction = environment === 'production';
  const iconSize = size === 'small' ? 12 : 16;
  const fontSize = size === 'small' ? '11px' : '12px';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: size === 'small' ? '2px 6px' : '4px 8px',
      backgroundColor: isProduction ? 'rgba(222,154,31,.14)' : 'var(--rr-accent-weak)',
      border: `1px solid ${isProduction ? 'var(--rr-warn)' : 'var(--rr-accent)'}`,
      borderRadius: '12px',
      fontSize: fontSize,
      fontFamily: 'inherit',
      fontWeight: 500
    }}>
      {isProduction ? (
        <Icon name="alertTriangle" 
          size={iconSize} 
          style={{ color: 'var(--rr-warn)' }} 
        />
      ) : (
        <Icon name="server" 
          size={iconSize} 
          style={{ color: 'var(--rr-accent-text)' }} 
        />
      )}
      
      {showLabel && (
        <span style={{
          color: isProduction ? 'var(--rr-warn)' : 'var(--rr-accent-text)',
          fontSize: fontSize,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.025em'
        }}>
          {isProduction ? 'PRODUCTION' : 'DEV'}
        </span>
      )}
    </div>
  );
};

export default DiscordEnvironmentIndicator;