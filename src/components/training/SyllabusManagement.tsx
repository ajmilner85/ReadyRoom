// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Button, Dialog, EmptyState, Field, TextInput } from '../ui/primitives';
import { AccordionGroupLabel } from '../ui/events/CycleAccordion';
import { useComponentPermissions } from '../../hooks/usePermissions';
import SyllabusEditor from './SyllabusEditor';

interface Syllabus {
  id: string;
  name: string;
  description?: string;
  aircraft_type?: string;
  estimated_hours?: number;
  kind?: 'linear' | 'pool' | 'module' | 'advanced_qualification';
}

const KIND_SECTIONS: Array<{ kind: 'linear' | 'pool' | 'module' | 'advanced_qualification'; title: string; blurb: string }> = [
  { kind: 'linear', title: 'Training Syllabi', blurb: 'Ordered weekly progressions (Initial Training / PTR)' },
  { kind: 'pool', title: 'Lesson Pools', blurb: 'Flat, unordered lesson libraries selectable as event activities' },
  { kind: 'advanced_qualification', title: 'Advanced Qualifications', blurb: 'Lesson libraries for specific advanced qualifications (e.g. JTAC)' },
  { kind: 'module', title: 'Modules', blurb: 'Reusable multi-lesson collections' }
];

const KIND_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  pool: { bg: 'var(--rr-accent-weak)', fg: 'var(--rr-accent-text)' },
  module: { bg: 'color-mix(in srgb, var(--rr-purple) 14%, transparent)', fg: 'color-mix(in srgb, var(--rr-purple) 60%, var(--rr-text))' },
  advanced_qualification: { bg: 'rgba(222,154,31,.14)', fg: 'var(--rr-warn)' }
};

const KIND_BADGE_LABELS: Record<string, string> = {
  pool: 'Pool',
  module: 'Module',
  advanced_qualification: 'Adv Qual'
};

interface SyllabusManagementProps {
  error: string | null;
  setError: (error: string | null) => void;
}

const SyllabusManagement: React.FC<SyllabusManagementProps> = ({ error, setError }) => {
    const { isVisible } = useComponentPermissions();
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | 'new' | undefined>();
  const [loading, setLoading] = useState(true);
  const [deleteConfirmSyllabusId, setDeleteConfirmSyllabusId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Unsaved edits in the open editor, and a selection waiting on the discard prompt
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<string | 'new' | null | undefined>(undefined);
  const [missionCounts, setMissionCounts] = useState<Record<string, number>>({});
  const [cycleCounts, setCycleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadSyllabi();
  }, []);

  const loadSyllabi = async () => {
    try {
      setLoading(true);
      const { data, error: syllabusError } = await supabase
        .from('training_syllabi')
        .select('*')
        .order('name');

      if (syllabusError) throw syllabusError;

      setSyllabi(data || []);

      // Navigator counts: missions per syllabus, and the (non-deleted) cycles that use it
      const ids = (data || []).map((s: any) => s.id);
      if (ids.length) {
        const [{ data: ms }, { data: cs }] = await Promise.all([
          supabase.from('training_syllabus_missions').select('syllabus_id').in('syllabus_id', ids),
          supabase.from('cycles').select('syllabus_id').in('syllabus_id', ids).is('deleted_at', null),
        ]);
        const count = (rows: any[] | null) => (rows || []).reduce((acc: Record<string, number>, r: any) => { acc[r.syllabus_id] = (acc[r.syllabus_id] || 0) + 1; return acc; }, {});
        setMissionCounts(count(ms));
        setCycleCounts(count(cs));
      }
      setSelectedSyllabusId(prev => prev ?? (data || []).find((s: any) => (s.kind || 'linear') === 'linear')?.id ?? (data || [])[0]?.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (syllabusId: string) => {
    setDeleteConfirmSyllabusId(syllabusId);
    setDeleteConfirmText('');
  };

  const handleCancelDelete = () => {
    setDeleteConfirmSyllabusId(null);
    setDeleteConfirmText('');
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== 'yes' || !deleteConfirmSyllabusId) return;

    try {
      const { error: deleteError } = await supabase
        .from('training_syllabi')
        .delete()
        .eq('id', deleteConfirmSyllabusId);

      if (deleteError) throw deleteError;

      // Clear selection if deleted syllabus was selected
      if (selectedSyllabusId === deleteConfirmSyllabusId) {
        setSelectedSyllabusId(undefined);
      }

      // Reload syllabi list
      await loadSyllabi();

      setDeleteConfirmSyllabusId(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      setError(err.message);
      setDeleteConfirmSyllabusId(null);
      setDeleteConfirmText('');
    }
  };

  // ---- Selection with unsaved-change guard -----------------------------------------------
  const requestSelect = (id: string | 'new' | undefined) => {
    if (id === selectedSyllabusId) return;
    if (editorDirty) { setPendingSelect(id ?? null); return; }
    setSelectedSyllabusId(id);
  };

  const handleSaved = async (id: string) => {
    setEditorDirty(false);
    await loadSyllabi();
    setSelectedSyllabusId(id);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-10 text-[13px] text-text2">Loading training syllabi…</div>;
  }

  const deleting = syllabi.find(s => s.id === deleteConfirmSyllabusId);
  const canDelete = isVisible('manage_training_syllabi');

  return (
    <div className="flex-1 min-w-0 min-h-0 flex gap-[14px]">
      {/* Left: syllabi grouped by type */}
      <div className="flex-none w-[320px] min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden max-[760px]:w-auto">
        <div className="flex-none flex items-center gap-2 px-[14px] min-h-[46px] border-b border-border">
          <span className="rr-pane-title">Syllabi</span>
          <span className="font-mono text-[11px] text-text3">{syllabi.length}</span>
          <span className="flex-1" />
          <Button size="sm" variant="primary" icon="plus" onClick={() => requestSelect('new')}>New</Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-[10px] flex flex-col gap-[6px]">
          {syllabi.length === 0 ? (
            <EmptyState compact icon="bookOpen" title="No syllabi yet" message="Create the first training syllabus." />
          ) : (
            KIND_SECTIONS.map(section => {
              const list = syllabi.filter(s => (s.kind || 'linear') === section.kind);
              if (!list.length) return null;
              return (
                <div key={section.kind} className="flex flex-col gap-[4px]">
                  <AccordionGroupLabel className="mt-[6px] mb-[2px] px-1">{section.title}</AccordionGroupLabel>
                  {list.map(sy => {
                    const sel = selectedSyllabusId === sy.id;
                    const n = missionCounts[sy.id] ?? 0;
                    return (
                      <div
                        key={sy.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => requestSelect(sy.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') requestSelect(sy.id); }}
                        className={`flex flex-col gap-[2px] px-[10px] py-[8px] rounded-rr-md cursor-pointer transition-colors ${sel ? 'bg-accent-weak' : 'hover:bg-panel2'}`}
                        style={sel ? { boxShadow: 'inset 2px 0 0 var(--rr-accent)' } : undefined}
                        title={sy.description || undefined}
                      >
                        <span className={`text-[13px] leading-[1.3] text-text ${sel ? 'font-semibold' : 'font-medium'}`} style={{ overflowWrap: 'anywhere' }}>{sy.name}</span>
                        <span className="flex items-center gap-[6px] text-[11px] text-text2">
                          <span className="font-mono text-[10.5px]">{n} {section.kind === 'linear' ? (n === 1 ? 'mission' : 'missions') : (n === 1 ? 'lesson' : 'lessons')}</span>
                          {cycleCounts[sy.id] ? <><span className="text-text3">·</span><span className="font-mono text-[10.5px]">{cycleCounts[sy.id]} {cycleCounts[sy.id] === 1 ? 'cycle' : 'cycles'}</span></> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
          {selectedSyllabusId === 'new' ? (
            <div className="flex flex-col gap-[4px]">
              <AccordionGroupLabel className="mt-[6px] mb-[2px] px-1">Draft</AccordionGroupLabel>
              <div className="px-[10px] py-[8px] rounded-rr-md bg-accent-weak text-[13px] font-semibold" style={{ boxShadow: 'inset 2px 0 0 var(--rr-accent)' }}>New syllabus</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right: editor */}
      {selectedSyllabusId ? (
        <SyllabusEditor
          key={selectedSyllabusId}
          embedded
          syllabusId={selectedSyllabusId}
          onDirtyChange={setEditorDirty}
          onSaved={handleSaved}
          onDelete={canDelete && selectedSyllabusId !== 'new' ? () => handleDeleteClick(selectedSyllabusId) : undefined}
        />
      ) : (
        <div className="flex-1 min-w-0 flex items-center justify-center bg-panel border border-border rounded-rr-xl shadow-rr">
          <EmptyState
            icon="bookOpen"
            title="Pick a syllabus"
            message="Choose a syllabus on the left to edit its missions, enrollment rules and outcomes."
            action={{ label: 'New syllabus', onClick: () => requestSelect('new') }}
          />
        </div>
      )}

      {/* Switch away from unsaved edits */}
      <Dialog
        open={pendingSelect !== undefined}
        onClose={() => setPendingSelect(undefined)}
        title="Unsaved changes"
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingSelect(undefined)}>Stay</Button>
            <Button
              variant="danger"
              onClick={() => {
                setEditorDirty(false);
                setSelectedSyllabusId(pendingSelect ?? undefined);
                setPendingSelect(undefined);
              }}
            >
              Discard changes
            </Button>
          </>
        }
      >
        <p className="m-0 text-[13px] text-text2 leading-[1.55]">Your changes to this syllabus haven't been saved and will be lost.</p>
      </Dialog>

      {/* Delete syllabus (type "yes") */}
      <Dialog
        open={Boolean(deleteConfirmSyllabusId)}
        onClose={handleCancelDelete}
        title="Delete syllabus"
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={handleCancelDelete}>Cancel</Button>
            <Button variant="danger" icon="trash" onClick={handleConfirmDelete} disabled={deleteConfirmText.toLowerCase() !== 'yes'}>Delete syllabus</Button>
          </>
        }
      >
        <p className="m-0 mb-[14px] text-[13px] text-text2 leading-[1.55]">
          Delete <strong className="text-text">{deleting?.name || 'this syllabus'}</strong> with all its missions and objectives? This can't be undone.
        </p>
        <Field label={<>Type <span className="text-text">yes</span> to confirm</>}>
          <TextInput
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="yes"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirmText.toLowerCase() === 'yes') handleConfirmDelete(); }}
          />
        </Field>
      </Dialog>
    </div>
  );
};

export default SyllabusManagement;
