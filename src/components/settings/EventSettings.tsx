import React from 'react';
import { useAppSettings } from '../../context/AppSettingsContext';

interface EventSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

type TimeUnit = 'minutes' | 'hours' | 'days';
type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

interface ReminderTime {
  value: number;
  unit: TimeUnit;
}

const EventSettings: React.FC<EventSettingsProps> = ({ error, setError }) => {
  const { settings: appSettings, updateSetting } = useAppSettings();

  const daysOfWeek: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timeUnits: { value: TimeUnit; label: string }[] = [
    { value: 'minutes', label: 'minutes' },
    { value: 'hours', label: 'hours' },
    { value: 'days', label: 'days' }
  ];

  const handleSettingChange = <K extends keyof typeof appSettings.eventDefaults>(
    key: K,
    value: typeof appSettings.eventDefaults[K]
  ) => {
    updateSetting('eventDefaults', {
      ...appSettings.eventDefaults,
      [key]: value
    });
    
    // If timezone is being changed, save it to the server immediately
    if (key === 'referenceTimezone') {
      saveTimezoneToServer(value as string);
    }
  };
  
  const saveTimezoneToServer = async (timezone: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/settings/timezone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timezone })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save timezone setting');
      }
      
      console.log('Timezone setting saved successfully');
    } catch (error) {
      console.error('Error saving timezone setting:', error);
      if (setError) {
        setError('Failed to save timezone setting. Please try again.');
      }
    }
  };

  const handleReminderTimeChange = (
    reminderType: 'firstReminderTime' | 'secondReminderTime',
    field: 'value' | 'unit',
    value: number | TimeUnit
  ) => {
    const newSettings = {
      ...appSettings.eventDefaults,
      [reminderType]: {
        ...appSettings.eventDefaults[reminderType],
        [field]: value
      }
    };

    // Validate chronological order if both reminders are enabled
    if (appSettings.eventDefaults.firstReminderEnabled && appSettings.eventDefaults.secondReminderEnabled) {
      const firstMs = reminderTimeToMs(
        reminderType === 'firstReminderTime' && field === 'value' ? (value as number) : newSettings.firstReminderTime.value,
        reminderType === 'firstReminderTime' && field === 'unit' ? (value as TimeUnit) : newSettings.firstReminderTime.unit
      );
      const secondMs = reminderTimeToMs(
        reminderType === 'secondReminderTime' && field === 'value' ? (value as number) : newSettings.secondReminderTime.value,
        reminderType === 'secondReminderTime' && field === 'unit' ? (value as TimeUnit) : newSettings.secondReminderTime.unit
      );
      
      // First reminder should be FURTHER from event (larger value) than second reminder
      if (firstMs <= secondMs) {
        if (setError) {
          setError('First reminder must be scheduled before (further from event) the second reminder');
          setTimeout(() => setError && setError(null), 5000);
        }
        return; // Don't save invalid settings
      }
    }

    updateSetting('eventDefaults', newSettings);
  };

  const reminderTimeToMs = (value: number, unit: TimeUnit): number => {
    switch (unit) {
      case 'minutes':
        return value * 60 * 1000;
      case 'hours':
        return value * 60 * 60 * 1000;
      case 'days':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  };

  const renderToggle = (enabled: boolean, onChange: (enabled: boolean) => void) => (
    <div
      onClick={() => onChange(!enabled)}
      style={{
        width: '44px',
        height: '24px',
        backgroundColor: enabled ? '#3B82F6' : '#E5E7EB',
        borderRadius: '12px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: 'white',
          borderRadius: '50%',
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          transition: 'left 0.2s ease',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }}
      />
    </div>
  );

  const renderReminderTimeSelector = (
    reminderTime: ReminderTime,
    onTimeChange: (field: 'value' | 'unit', value: number | TimeUnit) => void
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="number"
        min="1"
        max="999"
        value={reminderTime.value}
        onChange={(e) => onTimeChange('value', Math.max(1, parseInt(e.target.value) || 1))}
        style={{
          width: '80px',
          padding: '8px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'Inter',
          textAlign: 'center'
        }}
      />
      <select
        value={reminderTime.unit}
        onChange={(e) => onTimeChange('unit', e.target.value as TimeUnit)}
        style={{
          padding: '8px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'Inter',
          backgroundColor: 'white'
        }}
      >
        {timeUnits.map(unit => (
          <option key={unit.value} value={unit.value}>
            {unit.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: '14px', color: '#64748B' }}>before event start</span>
    </div>
  );

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

  const fieldLabelStyle = {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
    fontFamily: 'Inter'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'Inter',
    backgroundColor: '#FFFFFF',
    color: '#374151',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Events
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure default event timing, reminders, and response grouping settings.
          </p>
        </div>

        {/* Timing and Duration Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Timing and Duration
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={fieldLabelStyle}>Default event start day of week</label>
              <select
                value={appSettings.eventDefaults.defaultStartDayOfWeek}
                onChange={(e) => handleSettingChange('defaultStartDayOfWeek', e.target.value as DayOfWeek)}
                style={inputStyle}
              >
                {daysOfWeek.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={fieldLabelStyle}>Default event start time</label>
              <input
                type="time"
                value={appSettings.eventDefaults.defaultStartTime}
                onChange={(e) => handleSettingChange('defaultStartTime', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label style={fieldLabelStyle}>Default event duration</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                value={appSettings.eventDefaults.defaultDurationHours}
                onChange={(e) => handleSettingChange('defaultDurationHours', parseInt(e.target.value) || 0)}
                style={{
                  width: '70px',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px 0 0 4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  textAlign: 'center'
                }}
              />
              <span style={{ padding: '0 6px', border: '1px solid #CBD5E1', borderLeft: 'none', borderRight: 'none', height: '35px', lineHeight: '35px', backgroundColor: '#F8FAFC' }}>h</span>
              <input
                type="number"
                min="0"
                max="59"
                value={appSettings.eventDefaults.defaultDurationMinutes}
                onChange={(e) => handleSettingChange('defaultDurationMinutes', parseInt(e.target.value) || 0)}
                style={{
                  width: '70px',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '0 4px 4px 0',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  textAlign: 'center'
                }}
              />
              <span style={{ marginLeft: '6px', height: '35px', lineHeight: '35px' }}>min</span>
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <label style={fieldLabelStyle}>Reference timezone for event countdowns</label>
            <select
              value={appSettings.eventDefaults.referenceTimezone || 'America/New_York'}
              onChange={(e) => handleSettingChange('referenceTimezone', e.target.value)}
              style={inputStyle}
            >
              <option value="America/New_York">Eastern Time (EDT/EST)</option>
              <option value="America/Chicago">Central Time (CDT/CST)</option>
              <option value="America/Denver">Mountain Time (MDT/MST)</option>
              <option value="America/Los_Angeles">Pacific Time (PDT/PST)</option>
              <option value="America/Anchorage">Alaska Time (AKDT/AKST)</option>
              <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="Europe/London">British Time (BST/GMT)</option>
              <option value="Europe/Berlin">Central European Time (CEST/CET)</option>
              <option value="Europe/Athens">Eastern European Time (EEST/EET)</option>
              <option value="Asia/Tokyo">Japan Time (JST)</option>
              <option value="Australia/Sydney">Australian Eastern Time (AEDT/AEST)</option>
            </select>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'Inter' }}>
              This timezone will be used to determine when events start/finish for countdown updates and status display.
            </p>
          </div>
        </div>

        {/* Reminders Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Reminders
          </h3>

          {/* First Reminder */}
          <div style={{
            padding: '20px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            marginBottom: '20px'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1E293B', margin: '0 0 16px 0' }}>
              First Reminder
            </h4>

            <div style={{ marginBottom: '16px' }}>
              <label style={fieldLabelStyle}>Default first reminder time</label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {renderReminderTimeSelector(appSettings.eventDefaults.firstReminderTime, (field, value) =>
                    handleReminderTimeChange('firstReminderTime', field, value)
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>Enabled by default</span>
                  {renderToggle(appSettings.eventDefaults.firstReminderEnabled, (enabled) =>
                    handleSettingChange('firstReminderEnabled', enabled)
                  )}
                </div>
              </div>
            </div>

            <div>
              <label style={{ ...fieldLabelStyle, marginBottom: '8px', display: 'block' }}>
                Send to users with status:
              </label>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                Only active users will be notified
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.firstReminderRecipients?.accepted ?? true}
                    onChange={(e) => handleSettingChange('firstReminderRecipients', {
                      ...appSettings.eventDefaults.firstReminderRecipients,
                      accepted: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Accepted</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.firstReminderRecipients?.tentative ?? true}
                    onChange={(e) => handleSettingChange('firstReminderRecipients', {
                      ...appSettings.eventDefaults.firstReminderRecipients,
                      tentative: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Tentative</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.firstReminderRecipients?.declined ?? false}
                    onChange={(e) => handleSettingChange('firstReminderRecipients', {
                      ...appSettings.eventDefaults.firstReminderRecipients,
                      declined: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Declined</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.firstReminderRecipients?.noResponse ?? false}
                    onChange={(e) => handleSettingChange('firstReminderRecipients', {
                      ...appSettings.eventDefaults.firstReminderRecipients,
                      noResponse: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>No Response</span>
                </label>
              </div>
            </div>
          </div>

          {/* Second Reminder */}
          <div style={{
            padding: '20px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1E293B', margin: '0 0 16px 0' }}>
              Second Reminder
            </h4>

            <div style={{ marginBottom: '16px' }}>
              <label style={fieldLabelStyle}>Default second reminder time</label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {renderReminderTimeSelector(appSettings.eventDefaults.secondReminderTime, (field, value) =>
                    handleReminderTimeChange('secondReminderTime', field, value)
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'Inter' }}>Enabled by default</span>
                  {renderToggle(appSettings.eventDefaults.secondReminderEnabled, (enabled) =>
                    handleSettingChange('secondReminderEnabled', enabled)
                  )}
                </div>
              </div>
            </div>

            <div>
              <label style={{ ...fieldLabelStyle, marginBottom: '8px', display: 'block' }}>
                Send to users with status:
              </label>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                Only active users will be notified
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.secondReminderRecipients?.accepted ?? true}
                    onChange={(e) => handleSettingChange('secondReminderRecipients', {
                      ...appSettings.eventDefaults.secondReminderRecipients,
                      accepted: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Accepted</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.secondReminderRecipients?.tentative ?? true}
                    onChange={(e) => handleSettingChange('secondReminderRecipients', {
                      ...appSettings.eventDefaults.secondReminderRecipients,
                      tentative: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Tentative</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.secondReminderRecipients?.declined ?? false}
                    onChange={(e) => handleSettingChange('secondReminderRecipients', {
                      ...appSettings.eventDefaults.secondReminderRecipients,
                      declined: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>Declined</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={appSettings.eventDefaults.secondReminderRecipients?.noResponse ?? false}
                    onChange={(e) => handleSettingChange('secondReminderRecipients', {
                      ...appSettings.eventDefaults.secondReminderRecipients,
                      noResponse: e.target.checked
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ color: '#4B5563' }}>No Response</span>
                </label>
              </div>
            </div>
          </div>

          {/* Error message for reminder validation */}
          {error && (
            <div style={{
              color: '#EF4444',
              fontSize: '14px',
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '6px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Scheduled Publication Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Scheduled Publication
          </h3>
          <div style={{
            padding: '20px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <label style={fieldLabelStyle}>Schedule publication by default</label>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'Inter' }}>
                  When enabled, the "Schedule Publication" option will be turned on by default when creating new events.
                </p>
              </div>
              {renderToggle(appSettings.eventDefaults.scheduledPublicationEnabledByDefault, (enabled) =>
                handleSettingChange('scheduledPublicationEnabledByDefault', enabled)
              )}
            </div>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
          }}>
            <label style={fieldLabelStyle}>Default scheduled publication offset</label>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 12px 0', fontFamily: 'Inter' }}>
              When scheduling publication for new events, this offset will be applied before the event start time.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {renderReminderTimeSelector(
                appSettings.eventDefaults.scheduledPublicationOffset,
                (field, value) => {
                  const newOffset = {
                    ...appSettings.eventDefaults.scheduledPublicationOffset,
                    [field]: value
                  };
                  handleSettingChange('scheduledPublicationOffset', newOffset);
                }
              )}
            </div>
          </div>
        </div>

        {/* Response Grouping Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Response Grouping
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <label style={fieldLabelStyle}>Event responses grouped by qualification by default</label>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'Inter' }}>
                When enabled, Discord event responses will be organized by pilot qualification levels.
              </p>
            </div>
            {renderToggle(appSettings.eventDefaults.groupResponsesByQualification, (enabled) => 
              handleSettingChange('groupResponsesByQualification', enabled)
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <label style={fieldLabelStyle}>Event responses grouped by squadron by default</label>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'Inter' }}>
                When enabled, Discord event responses will be organized by squadron.
              </p>
            </div>
            {renderToggle(appSettings.eventDefaults.groupBySquadron, (enabled) =>
              handleSettingChange('groupBySquadron', enabled)
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={fieldLabelStyle}>Show "No Response" users by default</label>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'Inter' }}>
                When enabled, active users who haven't responded will be displayed in Discord event posts.
              </p>
            </div>
            {renderToggle(appSettings.eventDefaults.showNoResponse, (enabled) =>
              handleSettingChange('showNoResponse', enabled)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventSettings;