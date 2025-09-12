import React, { useEffect, useState } from 'react';
import { Server, AlertTriangle } from 'lucide-react';
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
          backgroundColor: '#E2E8F0',
          borderRadius: '50%',
          animation: 'pulse 1.5s infinite'
        }} />
        {showLabel && (
          <span style={{
            fontSize: size === 'small' ? '11px' : '12px',
            color: '#9CA3AF',
            fontFamily: 'Inter'
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
      backgroundColor: isProduction ? '#FEF3C7' : '#EFF6FF',
      border: `1px solid ${isProduction ? '#FDE68A' : '#DBEAFE'}`,
      borderRadius: '12px',
      fontSize: fontSize,
      fontFamily: 'Inter',
      fontWeight: 500
    }}>
      {isProduction ? (
        <AlertTriangle 
          size={iconSize} 
          style={{ color: '#D97706' }} 
        />
      ) : (
        <Server 
          size={iconSize} 
          style={{ color: '#2563EB' }} 
        />
      )}
      
      {showLabel && (
        <span style={{
          color: isProduction ? '#92400E' : '#1D4ED8',
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