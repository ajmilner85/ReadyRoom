import React, { useState } from 'react';
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
  };

  const handleReminderTimeChange = (
    reminderType: 'firstReminderTime' | 'secondReminderTime',
    field: 'value' | 'unit',
    value: number | TimeUnit
  ) => {
    updateSetting('eventDefaults', {
      ...appSettings.eventDefaults,
      [reminderType]: {
        ...appSettings.eventDefaults[reminderType],
        [field]: value
      }
    });
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
        </div>

        {/* Reminders Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Reminders
          </h3>
          
          {/* First Reminder */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>Default first reminder time</label>
            </div>
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

          {/* Second Reminder */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>Default second reminder time</label>
            </div>
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

          {/* Reminder Recipients */}
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#F8FAFC', 
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
              Reminder Recipients
            </h4>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '12px' }}>
              Reminders will be sent to users who have responded with the selected statuses.
            </p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={appSettings.eventDefaults.sendRemindersToAccepted}
                  onChange={(e) => handleSettingChange('sendRemindersToAccepted', e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ color: '#4B5563' }}>Accepted</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={appSettings.eventDefaults.sendRemindersToTentative}
                  onChange={(e) => handleSettingChange('sendRemindersToTentative', e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ color: '#4B5563' }}>Tentative</span>
              </label>
            </div>
          </div>
        </div>

        {/* Response Grouping Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Response Grouping
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        </div>

        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: '14px',
            marginTop: '20px',
            padding: '12px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px'
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventSettings;