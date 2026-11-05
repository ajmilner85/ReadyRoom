import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Trash2, Star, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import StyledSelect from '../dossier/StyledSelect';
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

const sectionStyle: React.CSSProperties = {
  padding: '24px',
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  marginBottom: '24px'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  fontFamily: 'Inter',
  boxSizing: 'border-box',
  backgroundColor: 'white'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  color: '#374151',
  marginBottom: '8px'
};

const primaryButton = (enabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  backgroundColor: enabled ? '#3B82F6' : '#94A3B8',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: enabled ? 'pointer' : 'not-allowed',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px'
});

const secondaryButton: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: 'white',
  color: '#374151',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer'
};

const iconButton: React.CSSProperties = {
  padding: '6px',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center'
};

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

  // Toggle — copied from MissionDebriefingSettings
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
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0
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

  const renderSourceOption = (value: NewMissionCommsSource, title: string, description: string) => {
    const selected = settings.new_mission_comms_source === value;
    return (
      <label
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          padding: '12px',
          border: `1px solid ${selected ? '#3B82F6' : '#E2E8F0'}`,
          backgroundColor: selected ? '#EFF6FF' : 'white',
          borderRadius: '6px',
          cursor: canManage ? 'pointer' : 'not-allowed',
          opacity: canManage ? 1 : 0.7,
          marginBottom: '8px'
        }}
      >
        <input
          type="radio"
          name="new_mission_comms_source"
          checked={selected}
          disabled={!canManage}
          onChange={() => saveSettings({ new_mission_comms_source: value })}
          style={{ marginTop: '3px' }}
        />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>{title}</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{description}</div>
        </div>
      </label>
    );
  };

  const renderDraftEditor = () => {
    if (!draft) return null;
    return (
      <div style={{ ...sectionStyle, backgroundColor: 'white' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
          {draft.id ? 'Edit Template' : 'New Template'}
        </h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Title</label>
          <input
            autoFocus
            value={draft.title}
            onChange={e => setDraft({ ...draft, title: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Share this template</div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Shared templates are visible to all users.</div>
          </div>
          {renderToggle(draft.is_shared, is_shared => setDraft({ ...draft, is_shared }))}
        </div>
        <label style={labelStyle}>Channels (PRI)</label>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 0', marginBottom: '16px' }}>
          <CommsEntriesEditor entries={draft.entries} onChange={entries => setDraft({ ...draft, entries })} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button style={secondaryButton} onClick={() => setDraft(null)}>Cancel</button>
          <button
            style={primaryButton(!!draft.title.trim() && !savingDraft)}
            disabled={!draft.title.trim() || savingDraft}
            onClick={saveDraft}
          >
            {savingDraft ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    );
  };

  const renderTemplateRow = (t: CommsCardTemplate) => {
    const own = isOwn(t);
    const isDefault = settings.default_comms_template_id === t.id;
    return (
      <div
        key={t.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          marginBottom: '8px'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>{t.title}</span>
            {isDefault && (
              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#DBEAFE', color: '#1D4ED8', border: '1px solid #3B82F6' }}>
                Default
              </span>
            )}
            {t.is_shared && (
              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#F0FDF4', color: '#15803D', border: '1px solid #22C55E' }}>
                Shared
              </span>
            )}
          </div>
          {t.description && (
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{t.description}</div>
          )}
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
            {own ? 'Created by you' : `Created by ${t.creator_name || 'another user'}`}
          </div>
        </div>

        {confirmDeleteId === t.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#DC2626' }}>
              {isDefault ? 'Delete the default template?' : 'Delete template?'}
            </span>
            <button style={{ ...secondaryButton, padding: '4px 10px', fontSize: '12px' }} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            <button
              style={{ ...primaryButton(true), backgroundColor: '#DC2626', padding: '4px 10px', fontSize: '12px' }}
              onClick={() => handleDelete(t.id)}
            >
              Delete
            </button>
          </div>
        ) : canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!isDefault && (
              <button
                style={iconButton}
                title="Set as default"
                onClick={() => saveSettings({ default_comms_template_id: t.id })}
              >
                <Star size={16} color="#64748B" />
              </button>
            )}
            {own && (
              <>
                <button style={iconButton} title="Edit" onClick={() => startEdit(t)}>
                  <Edit2 size={16} color="#64748B" />
                </button>
                <button style={iconButton} title="Delete" onClick={() => setConfirmDeleteId(t.id)}>
                  <Trash2 size={16} color="#DC2626" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const defaultTemplateOptions = [
    { value: '', label: 'None (built-in comms card)' },
    ...templates.map(t => ({ value: t.id, label: isOwn(t) ? t.title : `${t.title} (by ${t.creator_name || 'another user'})` }))
  ];

  const header = (
    <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
          Mission Preparation
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
          Manage comms card templates and how new missions get their comms card
        </p>
      </div>
    </div>
  );

  if (loading || permissionsLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
        {header}
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
      {header}

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          {!canManage && (
            <div style={{ padding: '12px 16px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '13px', color: '#92400E', marginBottom: '24px' }}>
              You need the "Manage Comms Card Templates" permission to change these settings or manage templates.
            </div>
          )}

          {/* New mission comms card */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0' }}>
              New Mission Comms Card
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
              Applies to the whole organization when a mission is created, or opened for the first time without a comms card.
            </p>

            {renderSourceOption(
              'previous_mission',
              'Copy from the previous mission in the cycle',
              'Uses the comms card from the most recent earlier mission in the same cycle. The first mission of a cycle, and standalone events, use the default template.'
            )}
            {renderSourceOption(
              'default_template',
              'Always use the default template',
              'Every new mission starts with the default template.'
            )}

            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Default template</label>
              <div style={{ maxWidth: '400px' }}>
                <StyledSelect
                  value={settings.default_comms_template_id || ''}
                  options={defaultTemplateOptions}
                  onChange={value => saveSettings({ default_comms_template_id: value || null })}
                  disabled={!canManage}
                />
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '8px 0 0 0' }}>
                The default template is readable by everyone, even if it isn't shared.
              </p>
            </div>
          </div>

          {/* Templates */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                Comms Card Templates
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#64748B' }}>Show shared templates</span>
                  {renderToggle(showShared, setShowShared)}
                </div>
                {canManage && !draft && (
                  <button style={primaryButton(true)} onClick={startNew}>
                    <Plus size={16} /> New Template
                  </button>
                )}
              </div>
            </div>

            {renderDraftEditor()}

            {visibleTemplates.length > 0 ? (
              visibleTemplates.map(renderTemplateRow)
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
                {templates.length > 0 ? 'No templates of your own. Turn on "Show shared templates" to see others.' : 'No comms card templates yet'}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default MissionPrepSettings;
