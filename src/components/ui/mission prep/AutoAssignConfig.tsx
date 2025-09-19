import React, { useState } from 'react';
import { getUserSettings, updateUserSettings } from '../../../utils/userSettingsService';

export interface AutoAssignConfig {
  assignmentScope: 'clear' | 'fillGaps';
  includeTentative: boolean;
  flightFillingPriority: 'breadth' | 'depth';
  squadronCohesion: 'enforced' | 'prioritized' | 'ignore';
  assignUnqualified: boolean;
  nonStandardCallsigns: 'ignore' | 'fillLast' | 'fillInSequence' | 'fillFirst';
}

interface AutoAssignConfigModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onSave: (config: AutoAssignConfig) => void;
}

const AutoAssignConfigModal: React.FC<AutoAssignConfigModalProps> = ({
  isOpen,
  onCancel,
  onSave
}) => {
  // Load settings from user preferences or use defaults
  const getStoredConfig = async (): Promise<AutoAssignConfig> => {
    try {
      const settingsResult = await getUserSettings();
      if (settingsResult.success && settingsResult.data?.preferences?.missionPrep?.autoAssignConfig) {
        const config = settingsResult.data.preferences.missionPrep.autoAssignConfig;
        return {
          assignmentScope: config.assignmentScope || 'clear',
          includeTentative: config.includeTentative || false,
          flightFillingPriority: config.flightFillingPriority || 'breadth',
          squadronCohesion: config.squadronCohesion || 'enforced',
          assignUnqualified: config.assignUnqualified || false,
          nonStandardCallsigns: config.nonStandardCallsigns || 'ignore'
        };
      }
    } catch (error) {
      console.warn('Failed to load auto-assign config from user preferences:', error);
    }
    return {
      assignmentScope: 'clear',
      includeTentative: false,
      flightFillingPriority: 'breadth',
      squadronCohesion: 'enforced',
      assignUnqualified: false,
      nonStandardCallsigns: 'ignore'
    };
  };

  const [config, setConfig] = useState<AutoAssignConfig>({
    assignmentScope: 'clear',
    includeTentative: false,
    flightFillingPriority: 'breadth',
    squadronCohesion: 'enforced',
    assignUnqualified: false,
    nonStandardCallsigns: 'ignore'
  });

  // Reload settings when modal opens
  React.useEffect(() => {
    if (isOpen) {
      getStoredConfig().then(setConfig);
    }
  }, [isOpen]);

  const handleSave = async () => {
    try {
      await updateUserSettings({
        preferences: {
          missionPrep: {
            autoAssignConfig: config
          }
        }
      });
    } catch (error) {
      console.warn('Failed to save auto-assign config to user preferences:', error);
    }
    onSave(config);
  };

  const ToggleBadge: React.FC<{
    options: { value: string; label: string }[];
    selected: string;
    onChange: (value: string) => void;
  }> = ({ options, selected, onChange }) => {
    const selectedOption = options.find(opt => opt.value === selected);
    const currentIndex = options.findIndex(opt => opt.value === selected);
    const nextIndex = (currentIndex + 1) % options.length;
    
    const getScopeColors = (isSelected: boolean) => {
      if (isSelected) {
        return { color: '#2563EB', backgroundColor: '#EFF6FF', hoverColor: '#1D4ED8' };
      } else {
        return { color: '#9CA3AF', backgroundColor: 'transparent', hoverColor: '#6B7280' };
      }
    };
    
    const colors = getScopeColors(true); // Always show as selected since we're cycling through options
    
    return (
      <span
        onClick={() => onChange(options[nextIndex].value)}
        style={{
          padding: '4px 8px',
          fontSize: '12px',
          fontWeight: 500,
          color: colors.color,
          backgroundColor: colors.backgroundColor,
          cursor: 'pointer',
          borderRadius: '4px',
          transition: 'all 0.2s ease',
          minWidth: '60px',
          textAlign: 'center',
          display: 'inline-block'
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = colors.hoverColor;
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = colors.color;
        }}
      >
        {selectedOption?.label || options[0].label}
      </span>
    );
  };

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
          color: '#1F2937',
          lineHeight: '1.4',
          marginBottom: '2px'
        }}>
          {title}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6B7280',
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
        backgroundColor: checked ? '#3B82F6' : '#D1D5DB',
        padding: '2px'
      }}
    >
      <div
        style={{
          height: '16px',
          width: '16px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          transition: 'transform 0.15s ease-in-out',
          transform: checked ? 'translateX(16px)' : 'translateX(0px)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
        }}
      />
    </button>
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
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
        width: '500px',
        maxHeight: '70vh',
        overflowY: 'auto'
      }}>
        <div style={{ padding: '24px' }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A',
            margin: '0 0 24px 0',
            fontFamily: 'Inter'
          }}>
            Auto-Assignment Configuration
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Assignment Scope */}
            <OptionRow
              title="Assignment Scope"
              description="Clear all existing assignments or only fill gaps"
            >
              <ToggleBadge
                options={[
                  { value: 'clear', label: 'Clear All' },
                  { value: 'fillGaps', label: 'Fill Gaps' }
                ]}
                selected={config.assignmentScope}
                onChange={(value) => setConfig({ ...config, assignmentScope: value as 'clear' | 'fillGaps' })}
              />
            </OptionRow>

            {/* Include Tentative Pilots */}
            <OptionRow
              title="Include Tentative Pilots"
              description="Assign pilots whose roll call or attendance status is set to tentative"
            >
              <Switch
                checked={config.includeTentative}
                onChange={(checked) => setConfig({ ...config, includeTentative: checked })}
              />
            </OptionRow>

            {/* Flight Filling Priority */}
            <OptionRow
              title="Flight Filling Priority"
              description="Determines how pilots will be assigned to flights: Depth First - Prioritize creating full strength flights. Breadth First - Prioritize partial strength coverage of ALL flights before creating full strength flights"
            >
              <ToggleBadge
                options={[
                  { value: 'breadth', label: 'Breadth First' },
                  { value: 'depth', label: 'Depth First' }
                ]}
                selected={config.flightFillingPriority}
                onChange={(value) => setConfig({ ...config, flightFillingPriority: value as 'breadth' | 'depth' })}
              />
            </OptionRow>

            {/* Assign Unqualified */}
            <OptionRow
              title="Assign Unqualified Pilots"
              description="Allow assignment of pilots to slots normally requiring a qualification if no qualified pilots are available"
            >
              <Switch
                checked={config.assignUnqualified}
                onChange={(checked) => setConfig({ ...config, assignUnqualified: checked })}
              />
            </OptionRow>

            {/* Squadron Cohesion */}
            <OptionRow
              title="Squadron Cohesion"
              description="How strictly to enforce squadron-based flight assignments"
            >
              <ToggleBadge
                options={[
                  { value: 'enforced', label: 'Enforced' },
                  { value: 'prioritized', label: 'Relaxed' },
                  { value: 'ignore', label: 'Ignore' }
                ]}
                selected={config.squadronCohesion}
                onChange={(value) => setConfig({ ...config, squadronCohesion: value as 'enforced' | 'prioritized' | 'ignore' })}
              />
            </OptionRow>

            {/* Non-standard Callsigns */}
            <OptionRow
              title="Non-standard Callsigns"
              description="How to handle assignments to flights with callsigns that don't belong to any participating squadron"
            >
              <ToggleBadge
                options={[
                  { value: 'ignore', label: 'Ignore' },
                  { value: 'fillLast', label: 'Fill Last' },
                  { value: 'fillInSequence', label: 'In Sequence' },
                  { value: 'fillFirst', label: 'Fill First' }
                ]}
                selected={config.nonStandardCallsigns}
                onChange={(value) => setConfig({ ...config, nonStandardCallsigns: value as 'ignore' | 'fillLast' | 'fillInSequence' | 'fillFirst' })}
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
            borderTop: '1px solid #E5E7EB'
          }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'Inter',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
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
                backgroundColor: '#3B82F6',
                border: '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'Inter',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563EB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3B82F6';
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

export default AutoAssignConfigModal;