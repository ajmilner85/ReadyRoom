import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Button, Icon, NumberStepper, SegmentedControl, Select, Toggle } from '../ui/primitives';
import { DlgCard, SettingRow, UNIT_OPTIONS, unitWord } from '../ui/events/dialogParts';
import SettingsSection from './SettingsSection';

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
        setWingSettings(wingData.debriefing_settings as unknown as WingDebriefingSettings);
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
    const setEnabled = (enabled: boolean) => setSettings({ ...settings, [reminderType]: { ...reminder, enabled } });
    const pendingId = recipientType === 'user' ? selectedUserId : selectedBilletId;
    const unitLabel = unitWord(reminder.time.value, reminder.time.unit);

    return (
      <section key={reminderType} className={`rounded-rr-lg border bg-panel overflow-hidden ${reminder.enabled ? 'border-border2' : 'border-border'}`}>
        <div className="flex items-center gap-3 px-[14px] py-[12px] cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) setEnabled(!reminder.enabled); }}>
          <Toggle checked={reminder.enabled} onChange={setEnabled} />
          <div className="flex-1 min-w-0">
            <div className={`text-[13.5px] font-semibold ${reminder.enabled ? 'text-text' : 'text-text2'}`}>{title}</div>
            <div className="text-[12px] text-text2">
              {reminder.enabled
                ? `${reminder.time.value} ${unitLabel} after mission completion · ${reminder.escalation_recipients.length || 'no'} escalation recipient${reminder.escalation_recipients.length === 1 ? '' : 's'}`
                : 'Off by default'}
            </div>
          </div>
        </div>
        {reminder.enabled ? (
          <div className="border-t border-border px-[14px] py-[12px] flex flex-col gap-[12px] bg-panel2">
            <div className="flex items-center gap-[10px] flex-wrap">
              <span className="rr-label w-[78px]">Send</span>
              <NumberStepper value={reminder.time.value} min={1} max={999} width={44} onChange={(n) => handleReminderTimeChange(reminderType, 'value', Math.max(1, n))} />
              <SegmentedControl size="sm" value={reminder.time.unit} onChange={(u) => handleReminderTimeChange(reminderType, 'unit', u)} options={UNIT_OPTIONS} />
              <span className="text-[12.5px] text-text2">after mission completion</span>
            </div>
            <div className="flex items-start gap-[10px] flex-wrap">
              <span className="rr-label w-[78px] pt-[9px]">Escalate to</span>
              <div className="flex-1 min-w-[260px] flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px]">
                  <SegmentedControl
                    size="sm"
                    value={recipientType}
                    onChange={(v) => setRecipientType(v)}
                    options={[{ value: 'user', label: 'User' }, { value: 'billet', label: 'Billet' }]}
                  />
                  <div className="flex-1 min-w-0">
                    {recipientType === 'user' ? (
                      <Select size="sm" value={selectedUserId} onChange={setSelectedUserId} placeholder="Select a user…" searchable options={availableUsers.map(u => ({ value: u.id, label: u.name }))} />
                    ) : (
                      <Select size="sm" value={selectedBilletId} onChange={setSelectedBilletId} placeholder="Select a billet…" options={availableBillets.map(b => ({ value: b.id, label: b.name }))} />
                    )}
                  </div>
                  <Button size="sm" variant="secondary" icon="plus" disabled={!pendingId} onClick={() => handleAddRecipient(reminderType)}>Add</Button>
                </div>
                {reminder.escalation_recipients.length > 0 ? (
                  <div className="flex flex-wrap gap-[6px]">
                    {reminder.escalation_recipients.map((recipient, index) => {
                      const c = recipient.type === 'user' ? 'var(--rr-info)' : 'var(--rr-warn)';
                      return (
                        <span
                          key={index}
                          className="inline-flex items-center gap-[4px] h-[26px] pl-[10px] pr-[4px] rounded-rr-md text-[12px] font-semibold"
                          style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: `color-mix(in oklab, ${c} 60%, var(--rr-text))`, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)` }}
                          title={recipient.type === 'user' ? 'User' : 'Billet'}
                        >
                          {recipient.type === 'billet' ? <Icon name="star" size={11} /> : <Icon name="user" size={11} />}
                          {getRecipientDisplayText(recipient)}
                          <button
                            type="button"
                            aria-label={`Remove ${getRecipientDisplayText(recipient)}`}
                            onClick={() => handleRemoveRecipient(reminderType, index)}
                            className="w-[18px] h-[18px] rounded-full flex items-center justify-center border-0 bg-transparent cursor-pointer text-inherit hover:bg-black/15"
                          >
                            <Icon name="close" size={11} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-text3">Nobody is @mentioned in this reminder.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const header = { title: 'Mission Debriefing', description: 'AAR submission reminders and debriefing thread settings.' };

  if (loading) {
    return (
      <SettingsSection {...header}>
        <div className="max-w-[860px] py-6 text-center text-[13px] text-text2">Loading settings…</div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection {...header}>
      <div className="max-w-[860px] flex flex-col gap-[16px]">
        <DlgCard title="Wing" flush>
          <SettingRow
            label="Group debriefing threads by squadron"
            description="Each squadron gets its own debriefing thread. When off, all squadrons share one thread per mission."
            checked={wingSettings.group_by_squadron}
            onChange={(enabled) => setWingSettings({ ...wingSettings, group_by_squadron: enabled })}
          />
        </DlgCard>

        <div className="flex flex-col gap-[10px]">
          <div className="rr-label px-[2px]">AAR reminders</div>
          {renderReminderSection('first_reminder', 'First reminder', firstRecipientType, setFirstRecipientType, firstSelectedUserId, setFirstSelectedUserId, firstSelectedBilletId, setFirstSelectedBilletId)}
          {renderReminderSection('second_reminder', 'Second reminder', secondRecipientType, setSecondRecipientType, secondSelectedUserId, setSecondSelectedUserId, secondSelectedBilletId, setSecondSelectedBilletId)}
        </div>

        <DlgCard title="Discord threads" description="Debriefing reports always post to Discord threads.">
          <div className="flex items-center gap-[12px] flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="text-[13.5px] font-medium text-text">Auto-archive after</div>
              <div className="text-[12px] text-text2 mt-[2px]">Threads archive automatically after this long without activity.</div>
            </div>
            <SegmentedControl
              size="sm"
              value={String(settings.thread_auto_archive_days) as '1' | '3' | '7'}
              onChange={(v) => setSettings({ ...settings, thread_auto_archive_days: parseInt(v) })}
              options={[{ value: '1', label: '1 day' }, { value: '3', label: '3 days' }, { value: '7', label: '7 days' }]}
            />
          </div>
        </DlgCard>
      </div>
    </SettingsSection>
  );
};

export default MissionDebriefingSettings;
