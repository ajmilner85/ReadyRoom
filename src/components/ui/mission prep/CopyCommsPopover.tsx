import React, { useEffect, useMemo, useState } from 'react';
import StyledSelect from '../../dossier/StyledSelect';
import AnchoredPopover, { PopoverActions, popoverLabelStyle } from './AnchoredPopover';
import { useAuth } from '../../../context/AuthContext';
import { CommsPlanEntry } from '../../../types/CommsTypes';
import {
  CommsCardTemplate,
  CycleOption,
  EventWithComms,
  getMissionPrepSettings,
  listCommsTemplates,
  listCycles,
  listEventsWithComms
} from '../../../utils/commsTemplateService';

type Source = 'mission' | 'template';
const STANDALONE = '__standalone__';

interface CopyCommsPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentEventId?: string;
  currentCycleId?: string;
  onConfirm: (entries: CommsPlanEntry[]) => void;
  onClose: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const CopyCommsPopover: React.FC<CopyCommsPopoverProps> = ({
  anchorRef,
  currentEventId,
  currentCycleId,
  onConfirm,
  onClose
}) => {
  const { userProfile } = useAuth();
  const [source, setSource] = useState<Source>('mission');

  // Previous mission source
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleValue, setCycleValue] = useState<string>(currentCycleId || '');
  const [events, setEvents] = useState<EventWithComms[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Template source
  const [templates, setTemplates] = useState<CommsCardTemplate[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [showShared, setShowShared] = useState(true);
  const [templateId, setTemplateId] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCycles()
      .then(list => {
        setCycles(list);
        setCycleValue(prev => prev || list[0]?.id || STANDALONE);
      })
      .catch(err => setError(err.message));

    Promise.all([listCommsTemplates(), getMissionPrepSettings()])
      .then(([list, settings]) => {
        setTemplates(list);
        setDefaultTemplateId(settings.default_comms_template_id);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!cycleValue) return;
    let cancelled = false;
    setLoadingEvents(true);
    listEventsWithComms(cycleValue === STANDALONE ? null : cycleValue, { excludeEventId: currentEventId })
      .then(list => {
        if (cancelled) return;
        setEvents(list);
        setEventId(list[0]?.event_id || '');
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingEvents(false));
    return () => { cancelled = true; };
  }, [cycleValue, currentEventId]);

  const visibleTemplates = useMemo(
    () => templates.filter(t => showShared || t.created_by === userProfile?.id),
    [templates, showShared, userProfile?.id]
  );

  useEffect(() => {
    if (!visibleTemplates.some(t => t.id === templateId)) {
      const preferred = visibleTemplates.find(t => t.id === defaultTemplateId) || visibleTemplates[0];
      setTemplateId(preferred?.id || '');
    }
  }, [visibleTemplates, templateId, defaultTemplateId]);

  const cycleOptions = [
    ...cycles.map(c => ({ value: c.id, label: c.name })),
    { value: STANDALONE, label: 'Standalone events' }
  ];

  const eventOptions = events.length > 0
    ? events.map(e => ({ value: e.event_id, label: `${e.event_name} — ${formatDate(e.start_datetime)}` }))
    : [{ value: '', label: loadingEvents ? 'Loading…' : 'No missions with comms cards', disabled: true }];

  const templateOptions = visibleTemplates.length > 0
    ? visibleTemplates.map(t => {
        const tags = [
          t.id === defaultTemplateId ? 'Default' : null,
          t.created_by !== userProfile?.id ? `by ${t.creator_name || 'another user'}` : null
        ].filter(Boolean);
        return { value: t.id, label: tags.length ? `${t.title} (${tags.join(', ')})` : t.title };
      })
    : [{ value: '', label: 'No templates available', disabled: true }];

  const selectedEntries: CommsPlanEntry[] | null =
    source === 'mission'
      ? events.find(e => e.event_id === eventId)?.comms_plan || null
      : templates.find(t => t.id === templateId)?.entries || null;

  const selectedDescription = source === 'template'
    ? templates.find(t => t.id === templateId)?.description
    : null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 0',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'inherit',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--rr-panel)' : 'transparent',
    color: active ? 'var(--rr-text)' : 'var(--rr-text2)',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
  });

  return (
    <AnchoredPopover anchorRef={anchorRef} onClose={onClose} width={340}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--rr-text)', marginBottom: '12px' }}>
        Copy Comms Card
      </div>

      <div style={{ display: 'flex', gap: '4px', padding: '3px', backgroundColor: 'var(--rr-panel2)', borderRadius: '6px', marginBottom: '14px' }}>
        <button style={tabStyle(source === 'mission')} onClick={() => setSource('mission')}>Previous Mission</button>
        <button style={tabStyle(source === 'template')} onClick={() => setSource('template')}>Template</button>
      </div>

      {source === 'mission' ? (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={popoverLabelStyle}>Cycle</label>
            <StyledSelect value={cycleValue} options={cycleOptions} onChange={setCycleValue} />
          </div>
          <div>
            <label style={popoverLabelStyle}>Event</label>
            <StyledSelect value={eventId} options={eventOptions} onChange={setEventId} disabled={events.length === 0} />
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ ...popoverLabelStyle, marginBottom: 0 }}>Template</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--rr-text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showShared} onChange={e => setShowShared(e.target.checked)} />
              Show shared
            </label>
          </div>
          <StyledSelect value={templateId} options={templateOptions} onChange={setTemplateId} disabled={visibleTemplates.length === 0} />
          {selectedDescription && (
            <div style={{ fontSize: '12px', color: 'var(--rr-text2)', marginTop: '8px' }}>{selectedDescription}</div>
          )}
        </>
      )}

      <div style={{ fontSize: '12px', color: 'var(--rr-text3)', marginTop: '12px' }}>
        This replaces the current comms card for everyone on this mission.
      </div>

      {error && <div style={{ fontSize: '12px', color: 'var(--rr-bad)', marginTop: '8px' }}>{error}</div>}

      <PopoverActions
        confirmLabel="Copy"
        confirmDisabled={!selectedEntries || selectedEntries.length === 0}
        onConfirm={() => selectedEntries && onConfirm(selectedEntries)}
        onCancel={onClose}
      />
    </AnchoredPopover>
  );
};

export default CopyCommsPopover;
