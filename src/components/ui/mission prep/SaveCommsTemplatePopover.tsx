import React, { useState } from 'react';
import AnchoredPopover, { PopoverActions, popoverInputStyle, popoverLabelStyle } from './AnchoredPopover';
import { CommsPlanEntry } from '../../../types/CommsTypes';
import { createCommsTemplate } from '../../../utils/commsTemplateService';

interface SaveCommsTemplatePopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  entries: CommsPlanEntry[];
  onClose: () => void;
}

const SaveCommsTemplatePopover: React.FC<SaveCommsTemplatePopoverProps> = ({ anchorRef, entries, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await createCommsTemplate({ title, description, entries, is_shared: isShared });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnchoredPopover anchorRef={anchorRef} onClose={onClose} width={320}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>
        Save as Template
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={popoverLabelStyle}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Lincoln CVW Standard"
          style={popoverInputStyle}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={popoverLabelStyle}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          style={{ ...popoverInputStyle, resize: 'vertical' }}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
        Share this template with other users
      </label>

      {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '8px' }}>{error}</div>}
      {saved && <div style={{ fontSize: '12px', color: '#16A34A', marginTop: '8px' }}>Template saved</div>}

      <PopoverActions
        confirmLabel="Save"
        confirmDisabled={!title.trim() || saved}
        busy={saving}
        onConfirm={handleSave}
        onCancel={onClose}
      />
    </AnchoredPopover>
  );
};

export default SaveCommsTemplatePopover;
