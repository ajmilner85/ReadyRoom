import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Chip, Field, FieldLabel, IconButton, Select, TextInput, Textarea, Toast, Toggle } from '../ui/primitives';
import { DlgCard, SettingRow } from '../ui/events/dialogParts';
import SettingsSection from './SettingsSection';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import CommsEntriesEditor from './CommsEntriesEditor';
import { CommsPlanEntry, generateInitialCommsData } from '../../types/CommsTypes';
import {
  CommsCardTemplate,
  MissionPrepSettings as MissionPrepSettingsData,
  NewMissionCommsSource,
  createCommsTemplate,
  deleteCommsTemplate,
  getMissionPrepSettings,
  listCommsTemplates,
  updateCommsTemplate,
  updateMissionPrepSettings
} from '../../utils/commsTemplateService';

interface MissionPrepSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

interface TemplateDraft {
  id: string | null; // null = new template
  title: string;
  description: string;
  is_shared: boolean;
  entries: CommsPlanEntry[];
}

const MissionPrepSettings: React.FC<MissionPrepSettingsProps> = ({ setError }) => {
  const { userProfile } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canManage = hasPermission('manage_comms_templates');

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<MissionPrepSettingsData>({
    new_mission_comms_source: 'previous_mission',
    default_comms_template_id: null
  });
  const [templates, setTemplates] = useState<CommsCardTemplate[]>([]);
  const [showShared, setShowShared] = useState(true);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reportError = useCallback((message: string) => {
    if (setError) {
      setError(message);
      setTimeout(() => setError(null), 4000);
    } else {
      console.error(message);
    }
  }, [setError]);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([getMissionPrepSettings(), listCommsTemplates()]);
      setSettings(s);
      setTemplates(t);
    } catch (err: any) {
      reportError(`Failed to load Mission Preparation settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => { load(); }, [load]);

  const isOwn = (t: CommsCardTemplate) => !!userProfile?.id && t.created_by === userProfile.id;

  const visibleTemplates = useMemo(
    () => templates.filter(t => showShared || isOwn(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, showShared, userProfile?.id]
  );

  // ---------------------------------------------------------------------------
  // Org-wide settings
  // ---------------------------------------------------------------------------

  const saveSettings = async (patch: Partial<MissionPrepSettingsData>) => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const saved = await updateMissionPrepSettings(patch);
      setSettings(saved);
    } catch (err: any) {
      setSettings(previous);
      reportError(`Failed to save setting: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  const startNew = () => {
    setConfirmDeleteId(null);
    setDraft({ id: null, title: '', description: '', is_shared: false, entries: generateInitialCommsData() });
  };

  const startEdit = (t: CommsCardTemplate) => {
    setConfirmDeleteId(null);
    setDraft({
      id: t.id,
      title: t.title,
      description: t.description || '',
      is_shared: t.is_shared,
      entries: t.entries.length > 0 ? t.entries : generateInitialCommsData()
    });
  };

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return;
    setSavingDraft(true);
    try {
      const input = {
        title: draft.title,
        description: draft.description,
        entries: draft.entries,
        is_shared: draft.is_shared
      };
      const saved = draft.id ? await updateCommsTemplate(draft.id, input) : await createCommsTemplate(input);
      setTemplates(prev => {
        const others = prev.filter(t => t.id !== saved.id);
        const existing = prev.find(t => t.id === saved.id);
        return [...others, { ...saved, creator_name: existing?.creator_name }]
          .sort((a, b) => a.title.localeCompare(b.title));
      });
      setDraft(null);
    } catch (err: any) {
      reportError(`Failed to save template: ${err.message}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCommsTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (settings.default_comms_template_id === id) {
        // FK is ON DELETE SET NULL; mirror it locally
        setSettings(prev => ({ ...prev, default_comms_template_id: null }));
      }
    } catch (err: any) {
      reportError(`Failed to delete template: ${err.message}`);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const renderSourceOption = (value: NewMissionCommsSource, title: string, description: string) => {
    const selected = settings.new_mission_comms_source === value;
    return (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={!canManage}
        onClick={() => !selected && saveSettings({ new_mission_comms_source: value })}
        className={`w-full flex items-start gap-[10px] px-[12px] py-[11px] rounded-rr-md border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${selected ? 'border-accent bg-accent-weak' : 'border-border bg-panel2 hover:border-border2 cursor-pointer'}`}
      >
        <span
          className="flex-none mt-[2px] w-[16px] h-[16px] rounded-full flex items-center justify-center"
          style={{ border: `1.5px solid ${selected ? 'var(--rr-accent)' : 'var(--rr-border2)'}` }}
        >
          {selected ? <span className="w-[8px] h-[8px] rounded-full bg-accent" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium text-text">{title}</span>
          <span className="block text-[12px] text-text2 mt-[2px] leading-[1.45]">{description}</span>
        </span>
      </button>
    );
  };

  const renderDraftEditor = () => {
    if (!draft) return null;
    return (
      <DlgCard
        title={draft.id ? 'Edit template' : 'New template'}
        footer={
          <div className="flex justify-end gap-[8px]">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" variant="primary" icon="check" disabled={!draft.title.trim() || savingDraft} loading={savingDraft} onClick={saveDraft}>
              {savingDraft ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <Field label="Title" required>
            <TextInput autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <div className="rounded-rr-md border border-border overflow-hidden">
            <SettingRow label="Share this template" description="Shared templates are visible to all users." checked={draft.is_shared} onChange={is_shared => setDraft({ ...draft, is_shared })} />
          </div>
          <div>
            <FieldLabel>Channels (PRI)</FieldLabel>
            <div className="rounded-rr-md border border-border py-[8px]">
              <CommsEntriesEditor entries={draft.entries} onChange={entries => setDraft({ ...draft, entries })} />
            </div>
          </div>
        </div>
      </DlgCard>
    );
  };

  const renderTemplateRow = (t: CommsCardTemplate) => {
    const own = isOwn(t);
    const isDefault = settings.default_comms_template_id === t.id;
    return (
      <div key={t.id} className="flex items-center gap-[12px] px-[14px] py-[11px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="text-[13.5px] font-semibold text-text">{t.title}</span>
            {isDefault ? <Chip tone="accent" size="sm">Default</Chip> : null}
            {t.is_shared ? <Chip tone="good" size="sm">Shared</Chip> : null}
          </div>
          {t.description ? <div className="text-[12.5px] text-text2 mt-[2px]">{t.description}</div> : null}
          <div className="text-[11.5px] text-text3 mt-[2px]">{own ? 'Created by you' : `Created by ${t.creator_name || 'another user'}`}</div>
        </div>

        {confirmDeleteId === t.id ? (
          <div className="flex items-center gap-[8px]">
            <span className="text-[12.5px] text-bad">{isDefault ? 'Delete the default template?' : 'Delete template?'}</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button size="sm" variant="danger" onClick={() => handleDelete(t.id)}>Delete</Button>
          </div>
        ) : canManage ? (
          <div className="flex items-center gap-[2px]">
            {!isDefault ? <IconButton icon="star" size={28} iconSize={14} label="Set as default" onClick={() => saveSettings({ default_comms_template_id: t.id })} /> : null}
            {own ? (
              <>
                <IconButton icon="edit" size={28} iconSize={14} label="Edit template" onClick={() => startEdit(t)} />
                <IconButton icon="trash" size={28} iconSize={14} className="hover:!text-bad" label="Delete template" onClick={() => setConfirmDeleteId(t.id)} />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const defaultTemplateOptions = [
    { value: '', label: 'None (built-in comms card)' },
    ...templates.map(t => ({ value: t.id, label: isOwn(t) ? t.title : `${t.title} (by ${t.creator_name || 'another user'})` }))
  ];

  const header = { title: 'Mission Preparation', description: 'Comms card templates, and how new missions get their comms card.' };

  if (loading || permissionsLoading) {
    return (
      <SettingsSection {...header}>
        <div className="max-w-[860px] py-6 text-center text-[13px] text-text2">Loading settings…</div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection {...header}>
      <div className="max-w-[860px] flex flex-col gap-[16px]">
        {!canManage ? (
          <Toast tone="warn">You need the "Manage Comms Card Templates" permission to change these settings or manage templates.</Toast>
        ) : null}

        <DlgCard title="New mission comms card" description="Applies to the whole organization when a mission is created, or opened for the first time without a comms card.">
          <div role="radiogroup" className="flex flex-col gap-[8px]">
            {renderSourceOption(
              'previous_mission',
              'Copy from the previous mission in the cycle',
              'Uses the comms card from the most recent earlier mission in the same cycle. The first mission of a cycle, and standalone events, use the default template.'
            )}
            {renderSourceOption('default_template', 'Always use the default template', 'Every new mission starts with the default template.')}
          </div>
          <Field className="mt-[14px]" label="Default template" hint="The default template is readable by everyone, even if it isn't shared.">
            <div className="max-w-[420px]">
              <Select
                value={settings.default_comms_template_id || ''}
                options={defaultTemplateOptions}
                onChange={value => saveSettings({ default_comms_template_id: value || null })}
                disabled={!canManage}
              />
            </div>
          </Field>
        </DlgCard>

        {renderDraftEditor()}

        <DlgCard
          title="Comms card templates"
          count={visibleTemplates.length}
          right={
            <div className="flex items-center gap-[12px]">
              <Toggle size="sm" checked={showShared} onChange={setShowShared} label={<span className="text-[12px] text-text2">Show shared</span>} />
              {canManage && !draft ? <Button size="sm" variant="primary" icon="plus" onClick={startNew}>New template</Button> : null}
            </div>
          }
          flush
        >
          {visibleTemplates.length > 0 ? (
            visibleTemplates.map(renderTemplateRow)
          ) : (
            <div className="px-[14px] py-[16px] text-center text-[12.5px] text-text2">
              {templates.length > 0 ? 'No templates of your own. Turn on "Show shared" to see others.' : 'No comms card templates yet.'}
            </div>
          )}
        </DlgCard>
      </div>
    </SettingsSection>
  );
};

export default MissionPrepSettings;
