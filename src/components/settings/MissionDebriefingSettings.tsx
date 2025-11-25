import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../context/AuthContext';

interface MissionDebriefingSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

type TimeUnit = 'minutes' | 'hours' | 'days';

interface ReminderTime {
  value: number;
  unit: TimeUnit;
}

interface EscalationRecipient {
  type: 'user' | 'billet';
  user_id?: string;
  billet_id?: string;
  display_name?: string;
}

interface ReminderConfig {
  enabled: boolean;
  time: ReminderTime;
  escalation_recipients: EscalationRecipient[];
}

interface DebriefingSettings {
  first_reminder: ReminderConfig;
  second_reminder: ReminderConfig;
  thread_auto_archive_days: number;
}

interface WingDebriefingSettings {
  group_by_squadron: boolean;
}

const MissionDebriefingSettings: React.FC<MissionDebriefingSettingsProps> = ({ setError }) => {
  const { userProfile } = useAuth();

  const timeUnits: { value: TimeUnit; label: string }[] = [
    { value: 'minutes', label: 'minutes' },
    { value: 'hours', label: 'hours' },
    { value: 'days', label: 'days' }
  ];

  // Local state
  const [settings, setSettings] = useState<DebriefingSettings>({
    first_reminder: {
      enabled: false,
      time: { value: 24, unit: 'hours' },
      escalation_recipients: []
    },
    second_reminder: {
      enabled: false,
      time: { value: 48, unit: 'hours' },
      escalation_recipients: []
    },
    thread_auto_archive_days: 7
  });

  const [wingSettings, setWingSettings] = useState<WingDebriefingSettings>({
    group_by_squadron: false
  });

  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string; pilotInfo?: string }>>([]);
  const [availableBillets, setAvailableBillets] = useState<Array<{ id: string; name: string }>>([]);
  const [firstRecipientType, setFirstRecipientType] = useState<'user' | 'billet'>('user');
  const [firstSelectedUserId, setFirstSelectedUserId] = useState('');
  const [firstSelectedBilletId, setFirstSelectedBilletId] = useState('');
  const [secondRecipientType, setSecondRecipientType] = useState<'user' | 'billet'>('user');
  const [secondSelectedUserId, setSecondSelectedUserId] = useState('');
  const [secondSelectedBilletId, setSecondSelectedBilletId] = useState('');
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    console.log('[MissionDebriefingSettings] useEffect triggered, userProfile:', userProfile);
    loadSettings();
    loadAvailableOptions();
  }, [userProfile]);

  // Auto-save settings whenever they change
  useEffect(() => {
    if (!loading) {
      saveSettings();
    }
  }, [settings, wingSettings]);

  const loadSettings = async () => {
    const squadronId = userProfile?.pilot?.currentSquadron?.id;
    const wingId = userProfile?.pilot?.currentSquadron?.wing_id;

    if (!squadronId || !wingId) {
      setLoading(false);
      return;
    }

    try {
      // Load squadron debriefing settings
      const { data: squadronData, error: squadronError } = await supabase
        .from('org_squadrons')
        .select('debriefing_settings')
        .eq('id', squadronId)
        .single();

      if (squadronError) throw squadronError;

      if (squadronData && 'debriefing_settings' in squadronData && squadronData.debriefing_settings) {
        const dbSettings = squadronData.debriefing_settings as any;

        // Convert database format to UI format
        const newSettings: DebriefingSettings = {
          first_reminder: {
            enabled: dbSettings.first_reminder_enabled || false,
            time: { value: dbSettings.reminder_first_hours || 24, unit: 'hours' as TimeUnit },
            escalation_recipients: dbSettings.first_reminder_escalation_recipients || []
          },
          second_reminder: {
            enabled: dbSettings.second_reminder_enabled || false,
            time: { value: dbSettings.reminder_second_hours || 48, unit: 'hours' as TimeUnit },
            escalation_recipients: dbSettings.second_reminder_escalation_recipients || []
          },
          thread_auto_archive_days: dbSettings.thread_auto_archive_days || 7
        };
        setSettings(newSettings);
      }

      // Load wing debriefing settings
      const { data: wingData, error: wingError } = await supabase
        .from('org_wings')
        .select('debriefing_settings')
        .eq('id', wingId)
        .single();

      if (wingError) throw wingError;

      if (wingData && 'debriefing_settings' in wingData && wingData.debriefing_settings) {
        setWingSettings(wingData.debriefing_settings as WingDebriefingSettings);
      }
    } catch (err: any) {
      console.error('Error loading debriefing settings:', err);
      if (setError) {
        setError(err.message || 'Failed to load debriefing settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableOptions = async () => {
    const squadronId = userProfile?.pilot?.currentSquadron?.id;
    console.log('[MissionDebriefingSettings] loadAvailableOptions called');
    console.log('[MissionDebriefingSettings] squadron_id:', squadronId);

    if (!squadronId) {
      console.log('[MissionDebriefingSettings] No squadron_id, exiting loadAvailableOptions');
      return;
    }

    try {
      // Load pilots assigned to the squadron
      const { data: pilotsData, error: pilotsError } = await supabase
        .from('pilots')
        .select(`
          id,
          boardNumber,
          callsign,
          pilot_assignments!inner (
            squadron_id,
            start_date,
            end_date
          )
        `)
        .eq('pilot_assignments.squadron_id', squadronId)
        .order('boardNumber');

      console.log('[MissionDebriefingSettings] Pilots query result:', pilotsData, pilotsError);

      if (pilotsError) throw pilotsError;

      // Map all pilots to user format (no filtering - show all current assignments)
      const users = (pilotsData || []).map((pilot: any) => ({
        id: pilot.id,
        name: `${pilot.boardNumber} ${pilot.callsign}`,
        pilotInfo: `${pilot.boardNumber} ${pilot.callsign}`
      }));

      console.log('[MissionDebriefingSettings] Processed users:', users);
      setAvailableUsers(users);

      // Load available roles (billets)
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');

      console.log('[MissionDebriefingSettings] Roles query result:', rolesData, rolesError);

      if (rolesError) throw rolesError;

      setAvailableBillets(rolesData || []);
    } catch (err: any) {
      console.error('[MissionDebriefingSettings] Error loading available options:', err);
    }
  };

  const reminderTimeToMs = (reminderTime: ReminderTime): number => {
    switch (reminderTime.unit) {
      case 'minutes':
        return reminderTime.value * 60 * 1000;
      case 'hours':
        return reminderTime.value * 60 * 60 * 1000;
      case 'days':
        return reminderTime.value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  };

  const handleReminderTimeChange = (
    reminderType: 'first_reminder' | 'second_reminder',
    field: 'value' | 'unit',
    value: number | TimeUnit
  ) => {
    const newTime = {
      ...settings[reminderType].time,
      [field]: value
    };

    // Validate chronological order if both reminders are enabled
    if (settings.first_reminder.enabled && settings.second_reminder.enabled) {
      const firstTime = reminderType === 'first_reminder' ? newTime : settings.first_reminder.time;
      const secondTime = reminderType === 'second_reminder' ? newTime : settings.second_reminder.time;

      const firstMs = reminderTimeToMs(firstTime);
      const secondMs = reminderTimeToMs(secondTime);

      if (firstMs >= secondMs) {
        if (setError) {
          setError('Second reminder must be scheduled after the first reminder');
          setTimeout(() => setError && setError(null), 5000);
        }
        return;
      }
    }

    setSettings({
      ...settings,
      [reminderType]: {
        ...settings[reminderType],
        time: newTime
      }
    });
  };

  const saveSettings = async () => {
    const squadronId = userProfile?.pilot?.currentSquadron?.id;
    const wingId = userProfile?.pilot?.currentSquadron?.wing_id;

    console.log('[MissionDebriefingSettings] handleSaveSettings called');
    console.log('[MissionDebriefingSettings] squadronId:', squadronId);
    console.log('[MissionDebriefingSettings] wingId:', wingId);
    console.log('[MissionDebriefingSettings] settings:', settings);
    console.log('[MissionDebriefingSettings] wingSettings:', wingSettings);

    if (!squadronId || !wingId) {
      console.log('[MissionDebriefingSettings] Missing squadronId or wingId, exiting');
      return;
    }

    // Validation
    if (settings.first_reminder.enabled && settings.first_reminder.time.value <= 0) {
      if (setError) {
        setError('First reminder must be at least 1 unit after mission completion');
      }
      return;
    }

    if (settings.second_reminder.enabled && settings.second_reminder.time.value <= 0) {
      if (setError) {
        setError('Second reminder must be at least 1 unit after mission completion');
      }
      return;
    }

    // Check chronological order if both enabled
    if (settings.first_reminder.enabled && settings.second_reminder.enabled) {
      const firstMs = reminderTimeToMs(settings.first_reminder.time);
      const secondMs = reminderTimeToMs(settings.second_reminder.time);

      if (firstMs >= secondMs) {
        if (setError) {
          setError('Second reminder must be after first reminder');
        }
        return;
      }
    }

    if (settings.thread_auto_archive_days < 1 || settings.thread_auto_archive_days > 7) {
      if (setError) {
        setError('Thread auto-archive must be between 1 and 7 days');
      }
      return;
    }

    try {
      // Convert UI format to database format (hours)
      const reminderTimeToHours = (reminderTime: ReminderTime): number => {
        switch (reminderTime.unit) {
          case 'minutes':
            return reminderTime.value / 60;
          case 'hours':
            return reminderTime.value;
          case 'days':
            return reminderTime.value * 24;
          default:
            return reminderTime.value;
        }
      };

      const dbSettings = {
        first_reminder_enabled: settings.first_reminder.enabled,
        reminder_first_hours: reminderTimeToHours(settings.first_reminder.time),
        first_reminder_escalation_recipients: settings.first_reminder.escalation_recipients,
        second_reminder_enabled: settings.second_reminder.enabled,
        reminder_second_hours: reminderTimeToHours(settings.second_reminder.time),
        second_reminder_escalation_recipients: settings.second_reminder.escalation_recipients,
        thread_auto_archive_days: settings.thread_auto_archive_days
      };

      console.log('[MissionDebriefingSettings] Saving squadron settings:', dbSettings);

      // Save squadron settings
      const { error: squadronError } = await supabase
        .from('org_squadrons')
        .update({ debriefing_settings: dbSettings } as any)
        .eq('id', squadronId);

      console.log('[MissionDebriefingSettings] Squadron save result:', squadronError);

      if (squadronError) throw squadronError;

      console.log('[MissionDebriefingSettings] Saving wing settings:', wingSettings);

      // Save wing settings
      const { error: wingError } = await supabase
        .from('org_wings')
        .update({ debriefing_settings: wingSettings } as any)
        .eq('id', wingId);

      console.log('[MissionDebriefingSettings] Wing save result:', wingError);

      if (wingError) throw wingError;

      // Show success message briefly
      if (setError) {
        setError(null);
      }
    } catch (err: any) {
      console.error('Error saving debriefing settings:', err);
      console.error('[MissionDebriefingSettings] Save failed:', err);
      if (setError) {
        setError(err.message || 'Failed to save debriefing settings');
      }
    }
  };

  const handleAddRecipient = (reminderType: 'first_reminder' | 'second_reminder') => {
    const recipientType = reminderType === 'first_reminder' ? firstRecipientType : secondRecipientType;
    const selectedUserId = reminderType === 'first_reminder' ? firstSelectedUserId : secondSelectedUserId;
    const selectedBilletId = reminderType === 'first_reminder' ? firstSelectedBilletId : secondSelectedBilletId;

    if (recipientType === 'user' && !selectedUserId) return;
    if (recipientType === 'billet' && !selectedBilletId) return;

    const newRecipient: EscalationRecipient = {
      type: recipientType,
      ...(recipientType === 'user' && { user_id: selectedUserId }),
      ...(recipientType === 'billet' && { billet_id: selectedBilletId }),
      display_name: recipientType === 'user'
        ? availableUsers.find(u => u.id === selectedUserId)?.name
        : availableBillets.find(b => b.id === selectedBilletId)?.name
    };

    // Check for duplicates
    const isDuplicate = settings[reminderType].escalation_recipients.some(r =>
      r.type === recipientType &&
      (recipientType === 'user' ? r.user_id === selectedUserId : r.billet_id === selectedBilletId)
    );

    if (isDuplicate) {
      if (setError) {
        setError('This recipient has already been added');
        setTimeout(() => setError && setError(null), 3000);
      }
      return;
    }

    setSettings({
      ...settings,
      [reminderType]: {
        ...settings[reminderType],
        escalation_recipients: [...settings[reminderType].escalation_recipients, newRecipient]
      }
    });

    // Reset selection
    if (reminderType === 'first_reminder') {
      setFirstSelectedUserId('');
      setFirstSelectedBilletId('');
    } else {
      setSecondSelectedUserId('');
      setSecondSelectedBilletId('');
    }
  };

  const handleRemoveRecipient = (reminderType: 'first_reminder' | 'second_reminder', index: number) => {
    setSettings({
      ...settings,
      [reminderType]: {
        ...settings[reminderType],
        escalation_recipients: settings[reminderType].escalation_recipients.filter((_, i) => i !== index)
      }
    });
  };

  const getRecipientDisplayText = (recipient: EscalationRecipient): string => {
    if (recipient.type === 'user') {
      const user = availableUsers.find(u => u.id === recipient.user_id);
      return user?.name || recipient.display_name || 'Unknown User';
    } else {
      const billet = availableBillets.find(b => b.id === recipient.billet_id);
      return billet?.name || recipient.display_name || 'Unknown Role';
    }
  };

  const renderToggle = (enabled: boolean, onChange: (enabled: boolean) => void, disabled: boolean = false) => (
    <div
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: '44px',
        height: '24px',
        backgroundColor: enabled ? '#3B82F6' : '#E5E7EB',
        borderRadius: '12px',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        opacity: disabled ? 0.5 : 1
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
    onTimeChange: (field: 'value' | 'unit', value: number | TimeUnit) => void,
    disabled: boolean = false
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="number"
        min="1"
        max="999"
        value={reminderTime.value}
        onChange={(e) => onTimeChange('value', Math.max(1, parseInt(e.target.value) || 1))}
        disabled={disabled}
        style={{
          width: '80px',
          padding: '8px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'Inter',
          textAlign: 'center',
          opacity: disabled ? 0.5 : 1
        }}
      />
      <select
        value={reminderTime.unit}
        onChange={(e) => onTimeChange('unit', e.target.value as TimeUnit)}
        disabled={disabled}
        style={{
          padding: '8px',
          border: '1px solid #CBD5E1',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'Inter',
          backgroundColor: 'white',
          opacity: disabled ? 0.5 : 1
        }}
      >
        {timeUnits.map(unit => (
          <option key={unit.value} value={unit.value}>
            {unit.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: '14px', color: '#64748B' }}>after mission completion</span>
    </div>
  );

  const renderReminderSection = (
    reminderType: 'first_reminder' | 'second_reminder',
    title: string,
    recipientType: 'user' | 'billet',
    setRecipientType: (type: 'user' | 'billet') => void,
    selectedUserId: string,
    setSelectedUserId: (id: string) => void,
    selectedBilletId: string,
    setSelectedBilletId: (id: string) => void
  ) => {
    const reminder = settings[reminderType];

    return (
      <div style={{
        padding: '24px',
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        {/* Header with toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
            {title}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#64748B' }}>Enabled by default</span>
            {renderToggle(
              reminder.enabled,
              (enabled) => setSettings({
                ...settings,
                [reminderType]: { ...reminder, enabled }
              })
            )}
          </div>
        </div>

        {/* Time selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            Default {title.toLowerCase()} time
          </label>
          {renderReminderTimeSelector(
            reminder.time,
            (field, value) => handleReminderTimeChange(reminderType, field, value),
            !reminder.enabled
          )}
        </div>

        {/* Escalation Recipients */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            Escalation recipients
          </label>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0', fontFamily: 'Inter' }}>
            These users or billets will be @mentioned in this reminder.
          </p>

          {/* Add recipient form */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as 'user' | 'billet')}
              disabled={!reminder.enabled}
              style={{
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
                width: '120px',
                opacity: reminder.enabled ? 1 : 0.5
              }}
            >
              <option value="user">User</option>
              <option value="billet">Billet</option>
            </select>

            {recipientType === 'user' ? (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={!reminder.enabled}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  opacity: reminder.enabled ? 1 : 0.5
                }}
              >
                <option value="">Select a user...</option>
                {availableUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedBilletId}
                onChange={(e) => setSelectedBilletId(e.target.value)}
                disabled={!reminder.enabled}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  opacity: reminder.enabled ? 1 : 0.5
                }}
              >
                <option value="">Select a billet...</option>
                {availableBillets.map(billet => (
                  <option key={billet.id} value={billet.id}>
                    {billet.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => handleAddRecipient(reminderType)}
              disabled={!reminder.enabled || (recipientType === 'user' ? !selectedUserId : !selectedBilletId)}
              style={{
                padding: '8px 16px',
                backgroundColor: reminder.enabled && (recipientType === 'user' ? selectedUserId : selectedBilletId) ? '#3B82F6' : '#94A3B8',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: reminder.enabled && (recipientType === 'user' ? selectedUserId : selectedBilletId) ? 'pointer' : 'not-allowed'
              }}
            >
              Add
            </button>
          </div>

          {/* Current recipients badges */}
          {reminder.escalation_recipients.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {reminder.escalation_recipients.map((recipient, index) => (
                <div
                  key={index}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px 4px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    height: '26px',
                    boxSizing: 'border-box',
                    whiteSpace: 'nowrap',
                    backgroundColor: recipient.type === 'user' ? '#DBEAFE' : '#FEF3C7',
                    color: recipient.type === 'user' ? '#1D4ED8' : '#D97706',
                    border: `1px solid ${recipient.type === 'user' ? '#3B82F6' : '#F59E0B'}`,
                    opacity: reminder.enabled ? 1 : 0.5
                  }}
                >
                  <span>{getRecipientDisplayText(recipient)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(reminderType, index)}
                    disabled={!reminder.enabled}
                    style={{
                      padding: '0',
                      width: '14px',
                      height: '14px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: reminder.enabled ? 'pointer' : 'not-allowed',
                      color: recipient.type === 'user' ? '#1D4ED8' : '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (reminder.enabled) {
                        e.currentTarget.style.backgroundColor = recipient.type === 'user' ? 'rgba(29, 78, 216, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: '14px' }}>×</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              border: '1px dashed #CBD5E1',
              borderRadius: '6px',
              textAlign: 'center',
              color: '#64748B',
              fontSize: '14px'
            }}>
              No escalation recipients configured
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
        <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
              Mission Debriefing
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
              Configure AAR submission reminders and debriefing thread settings
            </p>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', color: '#64748B' }}>
            Loading settings...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Mission Debriefing
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure AAR submission reminders and debriefing thread settings
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* Wing-Level Settings */}
        <div style={{
          padding: '24px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Wing-Level Settings
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Group Debriefing Threads by Squadron
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter' }}>
                When enabled, each squadron gets its own debriefing thread. When disabled, all squadrons share one thread per mission.
              </div>
            </div>
            {renderToggle(
              wingSettings.group_by_squadron,
              (enabled) => setWingSettings({ ...wingSettings, group_by_squadron: enabled })
            )}
          </div>
        </div>

        {/* Reminders Section */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Reminders
          </h3>

          {renderReminderSection(
            'first_reminder',
            'First Reminder',
            firstRecipientType,
            setFirstRecipientType,
            firstSelectedUserId,
            setFirstSelectedUserId,
            firstSelectedBilletId,
            setFirstSelectedBilletId
          )}

          {renderReminderSection(
            'second_reminder',
            'Second Reminder',
            secondRecipientType,
            setSecondRecipientType,
            secondSelectedUserId,
            setSecondSelectedUserId,
            secondSelectedBilletId,
            setSecondSelectedBilletId
          )}
        </div>

        {/* Thread Settings */}
        <div style={{
          padding: '24px',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 8px 0' }}>
            Discord Thread Settings
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
            Debriefing reports always use Discord threads.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
              Thread Auto-Archive Duration
            </label>
            <select
              value={settings.thread_auto_archive_days}
              onChange={(e) => setSettings({ ...settings, thread_auto_archive_days: parseInt(e.target.value) })}
              style={{
                width: '200px',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
            </select>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
              Threads will automatically archive after this duration of inactivity.
            </p>
          </div>
        </div>

        </div>
      </div>
    </div>
  );
};

export default MissionDebriefingSettings;
