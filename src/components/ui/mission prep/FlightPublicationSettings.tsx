import React, { useState } from 'react';
import { getUserSettings, updateUserSettings } from '../../../utils/userSettingsService';

export interface FlightPublicationConfig {
  includeEmptyFlights: boolean;
}

interface FlightPublicationSettingsProps {
  isOpen: boolean;
  onCancel: () => void;
  onSave: (config: FlightPublicationConfig) => void;
}

const FlightPublicationSettings: React.FC<FlightPublicationSettingsProps> = ({
  isOpen,
  onCancel,
  onSave
}) => {
  // Load settings from user preferences or use defaults
  const getStoredConfig = async (): Promise<FlightPublicationConfig> => {
    try {
      const settingsResult = await getUserSettings();
      if (settingsResult.success && settingsResult.data?.preferences?.missionPrep?.flightPublicationConfig) {
        const config = settingsResult.data.preferences.missionPrep.flightPublicationConfig;
        return {
          includeEmptyFlights: config.includeEmptyFlights ?? false
        };
      }
    } catch (error) {
      console.warn('Failed to load flight publication config from user preferences:', error);
    }
    return {
      includeEmptyFlights: false
    };
  };

  const [config, setConfig] = useState<FlightPublicationConfig>({
    includeEmptyFlights: false
  });

  // Reload settings when modal opens
  React.useEffect(() => {
    if (isOpen) {
      getStoredConfig().then(loadedConfig => {
        setConfig(loadedConfig);
      });
    }
  }, [isOpen]);

  const handleSave = async () => {
    try {
      await updateUserSettings({
        preferences: {
          missionPrep: {
            flightPublicationConfig: config
          }
        }
      });
    } catch (error) {
      console.warn('Failed to save flight publication config to user preferences:', error);
    }
    onSave(config);
  };

  const Switch: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
  }> = ({ checked, onChange }) => (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        height: '20px',
        width: '36px',
        alignItems: 'center',
        borderRadius: '10px',
        transition: 'background-color 0.2s ease',
        border: 'none',
        cursor: 'pointer',
        outline: 'none',
        backgroundColor: checked ? 'var(--rr-accent)' : 'var(--rr-panel3)',
        padding: '2px'
      }}
    >
      <div
        style={{
          height: '16px',
          width: '16px',
          borderRadius: '50%',
          backgroundColor: 'var(--rr-panel)',
          transition: 'transform 0.15s ease-in-out',
          transform: checked ? 'translateX(16px)' : 'translateX(0px)',
          boxShadow: 'var(--rr-shadow)'
        }}
      />
    </button>
  );

  const OptionRow: React.FC<{
    title: string;
    description: string;
    children: React.ReactNode;
  }> = ({ title, description, children }) => (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      padding: '12px 0'
    }}>
      <div style={{ flex: 1, maxWidth: '280px' }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--rr-text)',
          lineHeight: '1.4',
          marginBottom: '2px'
        }}>
          {title}
        </div>
        <div style={{
          fontSize: '12px',
          color: 'var(--rr-text2)',
          lineHeight: '1.3',
          wordWrap: 'break-word'
        }}>
          {description}
        </div>
      </div>
      <div style={{ marginLeft: '24px', paddingTop: '2px' }}>
        {children}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '8px',
        boxShadow: 'var(--rr-shadow-lg)',
        width: '500px',
        maxHeight: '70vh',
        overflowY: 'auto'
      }}>
        <div style={{ padding: '24px' }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--rr-text)',
            margin: '0 0 24px 0',
            fontFamily: 'inherit'
          }}>
            Flight Publication Settings
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Include Empty Flights */}
            <OptionRow
              title="Include Empty Flights"
              description="When enabled, flights with no assigned pilots will be included in the published table. When disabled, only flights with at least one pilot will appear."
            >
              <Switch
                checked={config.includeEmptyFlights}
                onChange={(checked) => setConfig({ ...config, includeEmptyFlights: checked })}
              />
            </OptionRow>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid var(--rr-border)'
          }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--rr-text)',
                backgroundColor: 'var(--rr-panel)',
                border: '1px solid var(--rr-border2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#FFFFFF',
                backgroundColor: 'var(--rr-accent)',
                border: '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-accent)';
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightPublicationSettings;
