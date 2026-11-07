import React from 'react';
import { useAppSettings } from '../../context/AppSettingsContext';
import SupportRoleRequirementsEditor from '../ui/events/SupportRoleRequirementsEditor';
import { Button, Field, IconButton, NumberStepper, SegmentedControl, Select, TextInput, Toast, controlClass } from '../ui/primitives';
import { DlgCard, ReminderCard, SettingRow, UNIT_OPTIONS, type RecipientKey } from '../ui/events/dialogParts';
import SettingsSection from './SettingsSection';

interface EventSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

type TimeUnit = 'minutes' | 'hours' | 'days';
type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

const EventSettings: React.FC<EventSettingsProps> = ({ error, setError }) => {
  const { settings: appSettings, updateSetting } = useAppSettings();

  const daysOfWeek: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

  const d = appSettings.eventDefaults;
  const recipientsOf = (r: typeof d.firstReminderRecipients | undefined, fallback: Record<RecipientKey, boolean>) => ({
    accepted: r?.accepted ?? fallback.accepted,
    tentative: r?.tentative ?? fallback.tentative,
    declined: r?.declined ?? fallback.declined,
    noResponse: r?.noResponse ?? fallback.noResponse,
  });
  const refTypes = d.defaultReferenceMaterialTypes || [];

  return (
    <SettingsSection title="Events" description="Defaults for new events: timing, reminders, publication and how responses are shown in Discord.">
      <div className="max-w-[860px] flex flex-col gap-[16px]">
        {error ? <Toast tone="bad" onDismiss={setError ? () => setError(null) : undefined}>{error}</Toast> : null}

        <DlgCard title="Timing" description="Pre-filled when creating an event.">
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Field label="Start day">
              <Select value={d.defaultStartDayOfWeek} onChange={(v) => handleSettingChange('defaultStartDayOfWeek', v as DayOfWeek)} options={daysOfWeek.map(day => ({ value: day, label: day }))} />
            </Field>
            <Field label="Start time">
              <input type="time" value={d.defaultStartTime} onChange={(e) => handleSettingChange('defaultStartTime', e.target.value)} className={`${controlClass} px-3 py-[7px] min-h-[36px]`} />
            </Field>
            <Field label="Duration">
              <div className="flex items-center gap-[8px]">
                <NumberStepper value={d.defaultDurationHours} min={0} max={48} width={40} suffix="h" onChange={(n) => handleSettingChange('defaultDurationHours', n)} />
                <NumberStepper value={d.defaultDurationMinutes} min={0} max={59} step={15} width={40} suffix="m" onChange={(n) => handleSettingChange('defaultDurationMinutes', n)} />
              </div>
            </Field>
          </div>
          <Field className="mt-[14px]" label="Reference time zone" hint="Used to decide when events start and finish for countdown updates and status display.">
            <Select value={d.referenceTimezone || 'America/New_York'} onChange={(v) => handleSettingChange('referenceTimezone', v)} options={TIMEZONES} />
          </Field>
        </DlgCard>

        <div className="flex flex-col gap-[10px]">
          <div className="rr-label px-[2px]">Reminders · only active users are notified</div>
          <ReminderCard
            title="First reminder"
            offText="Off by default"
            enabled={d.firstReminderEnabled}
            onEnabled={(v) => handleSettingChange('firstReminderEnabled', v)}
            value={d.firstReminderTime.value}
            onValue={(n) => handleReminderTimeChange('firstReminderTime', 'value', Math.max(1, n))}
            unit={d.firstReminderTime.unit}
            onUnit={(u) => handleReminderTimeChange('firstReminderTime', 'unit', u)}
            recipients={recipientsOf(d.firstReminderRecipients, { accepted: true, tentative: true, declined: false, noResponse: false })}
            onRecipient={(k, v) => handleSettingChange('firstReminderRecipients', { ...recipientsOf(d.firstReminderRecipients, { accepted: true, tentative: true, declined: false, noResponse: false }), [k]: v })}
          />
          <ReminderCard
            title="Second reminder"
            offText="Off by default"
            enabled={d.secondReminderEnabled}
            onEnabled={(v) => handleSettingChange('secondReminderEnabled', v)}
            value={d.secondReminderTime.value}
            onValue={(n) => handleReminderTimeChange('secondReminderTime', 'value', Math.max(1, n))}
            unit={d.secondReminderTime.unit}
            onUnit={(u) => handleReminderTimeChange('secondReminderTime', 'unit', u)}
            recipients={recipientsOf(d.secondReminderRecipients, { accepted: true, tentative: true, declined: false, noResponse: false })}
            onRecipient={(k, v) => handleSettingChange('secondReminderRecipients', { ...recipientsOf(d.secondReminderRecipients, { accepted: true, tentative: true, declined: false, noResponse: false }), [k]: v })}
          />
        </div>

        <DlgCard title="Publication" flush>
          <SettingRow
            label="Schedule publication by default"
            description={'New events start with “Schedule publication” turned on.'}
            checked={d.scheduledPublicationEnabledByDefault}
            onChange={(v) => handleSettingChange('scheduledPublicationEnabledByDefault', v)}
          />
          <div className="flex items-center gap-[10px] flex-wrap px-[14px] py-[12px]">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[13.5px] font-medium text-text">Default publication offset</div>
              <div className="text-[12px] text-text2 mt-[2px]">How long before the event start a scheduled event is published.</div>
            </div>
            <NumberStepper value={d.scheduledPublicationOffset.value} min={1} max={999} width={44} onChange={(n) => handleSettingChange('scheduledPublicationOffset', { ...d.scheduledPublicationOffset, value: Math.max(1, n) })} />
            <SegmentedControl size="sm" value={d.scheduledPublicationOffset.unit} onChange={(u) => handleSettingChange('scheduledPublicationOffset', { ...d.scheduledPublicationOffset, unit: u })} options={UNIT_OPTIONS} />
          </div>
        </DlgCard>

        <DlgCard title="Discord post" description="Defaults for each new event; every event can override them." flush>
          <SettingRow label="Allow tentative responses" description={'Users can pick “Tentative” as well as Accept or Decline.'} checked={d.allowTentativeResponse} onChange={(v) => handleSettingChange('allowTentativeResponse', v)} />
          <SettingRow label="Group responses by qualification" description="Organise the response lists by pilot qualification." checked={d.groupResponsesByQualification} onChange={(v) => handleSettingChange('groupResponsesByQualification', v)} />
          <SettingRow label="Group responses by squadron" description="Divide the response lists by squadron." checked={d.groupBySquadron} onChange={(v) => handleSettingChange('groupBySquadron', v)} />
          <SettingRow label={'Show “No Response” users'} description="List active users who haven't responded yet." checked={d.showNoResponse} onChange={(v) => handleSettingChange('showNoResponse', v)} />
        </DlgCard>

        <DlgCard
          title="Mission support roles"
          description="New events start with these roles and required counts, shown in the Discord post as available/required (e.g. JTAC (1/3)). Required 0 lists a role without requiring it. Rows appear in this order."
        >
          <SupportRoleRequirementsEditor
            requirements={d.defaultSupportRoleRequirements || []}
            onChange={(requirements) => handleSettingChange('defaultSupportRoleRequirements', requirements)}
          />
        </DlgCard>

        <DlgCard
          title="Reference material types"
          description={'Types offered when adding references to syllabi or events (an “Other” option is always available).'}
          count={refTypes.length}
        >
          <div className="flex flex-col gap-[8px]">
            {refTypes.map((type, index) => (
              <div key={index} className="flex items-center gap-[8px]">
                <TextInput
                  className="flex-1"
                  value={type}
                  placeholder={`Reference type ${index + 1}`}
                  onChange={(e) => {
                    const next = [...refTypes];
                    next[index] = e.target.value;
                    handleSettingChange('defaultReferenceMaterialTypes', next);
                  }}
                />
                {refTypes.length > 1 ? (
                  <IconButton icon="trash" variant="danger" label="Remove type" onClick={() => handleSettingChange('defaultReferenceMaterialTypes', refTypes.filter((_, i) => i !== index))} />
                ) : null}
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => handleSettingChange('defaultReferenceMaterialTypes', [...refTypes, ''])}>Add type</Button>
            </div>
          </div>
        </DlgCard>

        <DlgCard title="Mission debriefing" flush>
          <SettingRow
            label="AARs for operational squadrons only"
            description="New events show AAR sections on Mission Debriefing only for operational (non-training) squadrons. Each event can override this."
            checked={d.aarOperationalOnlyByDefault}
            onChange={(v) => handleSettingChange('aarOperationalOnlyByDefault', v)}
          />
        </DlgCard>
      </div>
    </SettingsSection>
  );
};

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (EDT/EST)' },
  { value: 'America/Chicago', label: 'Central Time (CDT/CST)' },
  { value: 'America/Denver', label: 'Mountain Time (MDT/MST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PDT/PST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKDT/AKST)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Europe/London', label: 'British Time (BST/GMT)' },
  { value: 'Europe/Berlin', label: 'Central European Time (CEST/CET)' },
  { value: 'Europe/Athens', label: 'Eastern European Time (EEST/EET)' },
  { value: 'Asia/Tokyo', label: 'Japan Time (JST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEDT/AEST)' },
];

export default EventSettings;
