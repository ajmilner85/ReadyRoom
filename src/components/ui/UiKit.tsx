import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Accordion, AircraftTile, AvatarStack, BulkBar, Button, Checkbox, Chip, Column, CountBadge, DataTable, Dialog, Drawer,
  EmptyState, FacetPill, Field, ICON_PATHS, Icon, IconButton, IconName, NumberStepper, Pane, PilotRow, PopoverMenu,
  ProgressBar, RadioGroup, SearchInput, SectionLabel, SegmentedControl, Select, SignalBars, StatTile, StatusChip, Stepper,
  Tabs, TextInput, Textarea, Toggle, ToolbarButton, ToolbarGroup, Tooltip, useToast,
  OptionList, MultiSelect, SquadronMark, QualTag, Swatch, TriMode, PickerOption, squadronColor,
} from './primitives';
import { getAllSquadrons, Squadron } from '../../utils/squadronService';
import { getAllQualifications, Qualification } from '../../utils/qualificationService';
import { getAllStatuses, Status } from '../../utils/statusService';
import QualificationBadge from './QualificationBadge';

/** Living reference for the shared UI Kit (mirrors the prototype's UI Kit page). */
const Card: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide }) => (
  <div className="bg-panel border border-border rounded-rr-xl p-4 min-w-0" style={wide ? { gridColumn: '1 / -1' } : undefined}>
    <SectionLabel>{title}</SectionLabel>
    {children}
  </div>
);

interface DemoRow { id: string; board: string; callsign: string; squadron: string; status: string }
const DEMO_ROWS: DemoRow[] = [
  { id: '1', board: '551', callsign: 'BOOT', squadron: 'VFA-161', status: 'Active' },
  { id: '2', board: '615', callsign: 'DAN', squadron: 'VFA-161', status: 'LOA' },
  { id: '3', board: '637', callsign: 'KNUCKLES', squadron: 'VFA-44', status: 'Active' },
  { id: '4', board: '527', callsign: 'PATCHES', squadron: 'VFA-44', status: 'Provisional' },
];

const UiKit: React.FC = () => {
  const toast = useToast();
  const { userProfile } = useAuth();
  const sqColor = (userProfile?.pilot?.currentSquadron?.color_palette as { primary?: string } | null | undefined)?.primary || 'var(--rr-accent)';
  const [seg, setSeg] = useState('flight');
  const [tab, setTab] = useState('details');
  const [toggle, setToggle] = useState(true);
  const [sel, setSel] = useState('161');
  const [q, setQ] = useState('');
  const [step, setStep] = useState(2);
  const [checks, setChecks] = useState({ brief: true, knee: false, disc: true });
  const [radio, setRadio] = useState('element');
  const [n, setN] = useState(4);
  const [tile, setTile] = useState('551');
  const [rowsSel, setRowsSel] = useState<string[]>(['1']);
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [facets, setFacets] = useState<string[]>(['Active']);
  // Real reference data for the pickers section
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [quals, setQuals] = useState<Qualification[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [sqSel, setSqSel] = useState<string[]>([]);
  const [qualSel, setQualSel] = useState<Record<string, TriMode>>({});
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [oneSq, setOneSq] = useState<string>('');
  useEffect(() => {
    getAllSquadrons().then(r => setSquadrons(r.data ?? []));
    getAllQualifications().then(r => setQuals((r.data ?? []).filter(q => q.active)));
    getAllStatuses().then(r => setStatuses(r.data ?? []));
  }, []);
  const squadronOptions: PickerOption[] = [
    ...squadrons.map(sq => ({
      id: sq.id, label: sq.designation, sublabel: sq.name, searchText: `${sq.designation} ${sq.name}`,
      leading: <SquadronMark url={sq.insignia_url} title={sq.designation} />,
    })),
    { id: 'unassigned', label: 'Unassigned', sublabel: 'Pilots without squadron assignment', leading: <SquadronMark /> },
  ];
  const qualOptions: PickerOption[] = quals.map(q => ({
    id: q.id, label: q.name, searchText: `${q.code} ${q.name}`, leading: <QualTag code={q.code} color={q.color} size="sm" minWidth={36} />,
  }));
  const statusOptions: PickerOption[] = statuses.map(st => ({
    id: st.id, label: st.name, leading: <Swatch color={st.isActive ? 'var(--rr-good)' : 'var(--rr-bad)'} />,
  }));

  const cols: Column<DemoRow>[] = [
    { key: 'board', header: 'Board', width: 60, sortable: true, render: r => <span className="font-mono text-[12px] font-semibold" style={{ color: sqColor }}>{r.board}</span> },
    { key: 'callsign', header: 'Callsign', width: 130, sortable: true, render: r => <span className="font-semibold text-[13px]">{r.callsign}</span> },
    { key: 'squadron', header: 'Squadron', render: r => <span className="text-[12px] text-text2">{r.squadron}</span> },
    { key: 'status', header: 'Status', width: 110, sortable: true, render: r => <StatusChip status={r.status} /> },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-[22px] font-bold mb-[6px]">ReadyRoom UI Kit</div>
        <div className="text-[13px] text-text2 mb-5">Shared component vocabulary (src/components/ui/primitives). Every element is live. Use the theme toggle in the context strip.</div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
          <Card title="Buttons">
            <div className="flex flex-wrap gap-[10px] items-center">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" icon="plus" size="sm">Add Flight</Button>
              <Button variant="secondary" loading size="sm">Saving</Button>
            </div>
          </Card>

          <Card title="Inputs">
            <div className="flex flex-col gap-[10px]">
              <SearchInput value={q} onChange={setQ} placeholder="Search pilots" />
              <Select value={sel} onChange={setSel} options={[
                { value: '161', label: 'VFA-161 Fighting Stingrays' },
                { value: '44', label: 'VFA-44 Kingfishers' },
                { value: 'frs', label: 'CVW-14 FRS', disabled: true },
              ]} />
              <div className="flex gap-[10px]">
                <Field label="Board number" className="w-[130px]"><TextInput mono placeholder="551" /></Field>
                <Field label="Callsign" className="flex-1"><TextInput placeholder="BOOT" /></Field>
              </div>
            </div>
          </Card>

          <Card title="Status & qualification">
            <div className="flex flex-wrap gap-[6px] mb-3">
              {['Active', 'LOA', 'Provisional', 'Inactive', 'Retired'].map(s => <StatusChip key={s} status={s} />)}
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {['Instructor Pilot', 'Flight Lead', 'Section Lead', 'LSO', 'JTAC', 'CQ', 'Strike Lead', 'NATOPS'].map(t => <QualificationBadge key={t} type={t} />)}
              <Chip tone="accent" mono size="sm">4S</Chip>
              <Chip color="#2A2F37" solid mono size="sm">MC</Chip>
            </div>
          </Card>

          <Card title="Segmented · tabs · toggle">
            <div className="mb-4">
              <SegmentedControl value={seg} onChange={setSeg} options={[{ value: 'element', label: 'Element' }, { value: 'flight', label: 'Flight' }, { value: 'mission', label: 'Mission' }]} />
            </div>
            <div className="mb-4">
              <Tabs variant="inline" value={tab} onChange={setTab} items={[{ value: 'details', label: 'Details' }, { value: 'flights', label: 'Flights' }, { value: 'comms', label: 'Comms' }]} />
            </div>
            <Toggle checked={toggle} onChange={setToggle} label="Squadron colour theming" />
          </Card>

          <Card title="Stat tiles">
            <div className="grid grid-cols-3 gap-[10px]">
              <StatTile value={14} label="A2A Kills" color="var(--rr-good)" />
              <StatTile value={6} label="Traps" />
              <StatTile value={1} label="Losses" color="var(--rr-bad)" />
            </div>
          </Card>

          <Card title="Pilot row">
            <PilotRow boardNumber="551" callsign="BOOT" color={sqColor} dotColor="var(--rr-good)" pulse trailing={<QualificationBadge type="Instructor Pilot" size="small" />} onClick={() => {}} />
            <PilotRow boardNumber="615" callsign="DAN" color={sqColor} dotColor="var(--rr-warn)" trailing={<span className="font-mono text-[10px] text-text2">LOA</span>} onClick={() => {}} />
            <PilotRow boardNumber="527" callsign="PATCHES" color="var(--rr-blue)" dotColor="var(--rr-info)" onClick={() => {}} />
          </Card>

          <Card title="Aircraft tile">
            <div className="flex gap-[10px] items-start">
              {[{ b: '551', c: 'BOOT', a: '1', bb: '11' }, { b: '754', c: 'KENNY', a: '1', bb: '11' }, { b: '637', c: 'KNUCKLES', a: '2', bb: '12' }].map(t => (
                <AircraftTile key={t.b} boardNumber={t.b} callsign={t.c} midsA={t.a} midsB={t.bb} color={t.b === '637' ? 'var(--rr-blue)' : sqColor} selected={tile === t.b} onClick={() => setTile(t.b)} />
              ))}
              <AircraftTile empty label="-4" midsA="2" midsB="11" />
              <div className="flex flex-col gap-2 ml-2">
                <span className="flex items-center gap-2 text-[11px] text-text2"><SignalBars level={1} /> P1</span>
                <span className="flex items-center gap-2 text-[11px] text-text2"><SignalBars level={2} /> P2</span>
                <span className="flex items-center gap-2 text-[11px] text-text2"><SignalBars level={3} /> P3</span>
              </div>
            </div>
          </Card>

          <Card title="Stepper / wizard">
            <Stepper current={step} onStepClick={setStep} steps={[{ label: 'Details' }, { label: 'Activities' }, { label: 'Options' }, { label: 'Publish' }]} />
          </Card>

          <Card title="Checkbox & radio">
            <div className="flex gap-7">
              <div className="flex-1 flex flex-col gap-2">
                <div className="rr-label mb-1">On publish</div>
                <Checkbox checked={checks.brief} onChange={v => setChecks(c => ({ ...c, brief: v }))} label="Post briefing" />
                <Checkbox checked={checks.knee} onChange={v => setChecks(c => ({ ...c, knee: v }))} label="Export kneeboards" />
                <Checkbox checked={checks.disc} onChange={v => setChecks(c => ({ ...c, disc: v }))} label="Notify Discord" />
              </div>
              <div className="flex-1">
                <div className="rr-label mb-2">Objective scope</div>
                <RadioGroup value={radio} onChange={setRadio} options={[{ value: 'individual', label: 'Individual' }, { value: 'element', label: 'Element' }, { value: 'flight', label: 'Flight' }, { value: 'mission', label: 'Mission' }]} />
              </div>
            </div>
          </Card>

          <Card title="Tooltip · dialog · drawer">
            <div className="flex items-center gap-[14px] pt-2 flex-wrap">
              <Tooltip content="Board number 551 · VFA-161"><span className="px-[13px] py-[7px] rounded-rr-ctl border border-border2 text-[12px] font-semibold text-text2 cursor-help">Hover me</span></Tooltip>
              <Button variant="primary" onClick={() => setDialog(true)}>Open dialog</Button>
              <Button variant="secondary" icon="filter" onClick={() => setDrawer(true)}>
                Filters <CountBadge inline count={facets.length} tone="accent" />
              </Button>
            </div>
          </Card>

          <Card title="Empty state">
            <EmptyState compact title="No flights assigned" message="Auto-assign pilots or add a flight to begin." action={{ label: 'Add Flight', onClick: () => toast.info('Add Flight clicked') }} />
          </Card>

          <Card title="Toolbar · icon buttons">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <ToolbarGroup>
                <ToolbarButton icon="copy" label="Copy comms plan" />
                <ToolbarButton icon="save" label="Save as template" />
                <ToolbarButton icon="edit" label="Edit" active />
                <ToolbarButton icon="upload" label="Load template" />
                <ToolbarButton icon="reset" label="Reset" danger />
              </ToolbarGroup>
            </div>
            <div className="flex items-end gap-[14px]">
              <IconButton icon="plus" variant="filled" label="Add" />
              <IconButton icon="edit" variant="outline" label="Edit" />
              <IconButton icon="filter" variant="ghost" label="Filter" />
              <IconButton icon="dots" variant="ghost" label="More" />
              <IconButton icon="trash" variant="danger" label="Delete" />
            </div>
          </Card>

          <Card title="Popover menu · toast">
            <div className="flex items-start gap-[14px] flex-wrap">
              <PopoverMenu
                items={[
                  { label: 'Copy to clipboard', icon: 'copy', onSelect: () => toast.success('Comms plan copied to clipboard') },
                  { label: 'Save as template', icon: 'save', onSelect: () => toast.success('Template saved') },
                  { label: 'Send to Discord', icon: 'send', onSelect: () => toast.info('Sent to Discord') },
                  { label: 'Delete', icon: 'trash', danger: true, divider: true, onSelect: () => toast.error('Deleted') },
                ]}
                trigger={({ ref, onClick }) => <Button ref={ref as React.Ref<HTMLButtonElement>} variant="secondary" size="sm" iconRight="chevronDown" onClick={onClick}>Comms plan</Button>}
              />
              <Button variant="primary" size="sm" onClick={() => toast.success('Comms plan copied to clipboard')}>Show toast</Button>
              <Button variant="danger" size="sm" onClick={() => toast.error('Failed to publish to Discord')}>Error toast</Button>
            </div>
          </Card>

          <Card title="Number stepper · textarea">
            <div className="flex gap-[14px] flex-wrap items-start">
              <NumberStepper value={n} onChange={setN} min={0} max={99} />
              <Textarea className="flex-1 min-w-[180px]" placeholder="Mission objective notes…" />
            </div>
          </Card>

          <Card title="Accordion">
            <Accordion defaultOpen={['wx']} items={[
              { id: 'wx', title: 'Weather & environment', content: 'CAVOK, wind 250/12, QNH 29.92.' },
              { id: 'roe', title: 'Rules of engagement', content: 'Weapons tight north of the FEBA; positive ID required.' },
              { id: 'sar', title: 'CSAR', content: 'Sandy flight on alert from 2030Z.' },
            ]} />
          </Card>

          <Card title="Progress · avatars · badge">
            <ProgressBar value={7} max={10} label="Syllabus progress" className="mb-4" />
            <div className="flex items-center gap-[14px]">
              <AvatarStack people={[{ name: 'Voodoo Rider' }, { name: 'Boot Tango', color: '#8B5CF6' }, { name: 'Kirby B', color: 'var(--rr-blue)' }, { name: 'Weld D', color: 'var(--rr-good)' }, { name: 'A' }, { name: 'B' }]} />
              <span className="relative inline-flex px-3 py-[7px] rounded-rr-ctl border border-border2 text-[12.5px] font-semibold text-text2">Tasks<CountBadge count={4} /></span>
            </div>
          </Card>

          <Card title="Pane">
            <Pane title="Available Pilots" meta={<span className="font-mono">12</span>} actions={<IconButton icon="sliders" label="Settings" />} className="h-[150px]">
              <div className="text-[12.5px] text-text2">Pane body scrolls internally (min-height:0; overflow:auto).</div>
            </Pane>
          </Card>

          <Card title="Pickers & filters · squadron and qualification lists (live data)" wide>
            <div className="text-[12px] text-text2 mb-4">
              Carried over from the roster FilterDrawer, MultiSelectDropdown and StyledSelect. Rows lead with a squadron insignia,
              qualification tag, status dot or role swatch. Qualification lists cycle off, include, exclude.
            </div>
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <OptionList title="Squadron" options={squadronOptions} selected={sqSel} onChange={setSqSel} />
              <OptionList title="Qualification" mode="tri" options={qualOptions} selected={qualSel} onChange={setQualSel} maxHeight={260} />
              <div className="flex flex-col gap-4">
                <MultiSelect label="Status" options={statusOptions} selected={statusSel} onChange={setStatusSel} />
                <MultiSelect label="Squadrons (dropdown)" options={squadronOptions} selected={sqSel} onChange={setSqSel} nameOf={o => String(o.label)} />
                <Field label="Squadron (single select)">
                  <Select
                    value={oneSq}
                    onChange={setOneSq}
                    placeholder="Choose squadron"
                    options={squadrons.map(sq => ({ value: sq.id, label: sq.designation, description: sq.name, searchText: `${sq.designation} ${sq.name}`, icon: <SquadronMark url={sq.insignia_url} size={18} /> }))}
                  />
                </Field>
                <div>
                  <div className="rr-label mb-[6px]">Qualification tags · squadron colours</div>
                  <div className="flex flex-wrap gap-[5px] mb-2">
                    {quals.slice(0, 12).map(q => <QualTag key={q.id} code={q.code} color={q.color} title={q.name} />)}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {squadrons.map(sq => (
                      <span key={sq.id} className="flex items-center gap-[6px] text-[12px] font-semibold" style={{ color: squadronColor(sq) }}>
                        <SquadronMark url={sq.insignia_url} size={18} />{sq.designation}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Table · bulk select" wide>
            <BulkBar count={rowsSel.length} onClear={() => setRowsSel([])} className="mb-[10px]">
              <Button size="sm" variant="secondary">Set Status</Button>
              <Button size="sm" variant="secondary">Set Squadron</Button>
              <Button size="sm" variant="secondary" icon="plus">Qualification</Button>
            </BulkBar>
            <DataTable columns={cols} rows={DEMO_ROWS} rowKey={r => r.id} selectable selected={rowsSel} onSelectedChange={setRowsSel} />
          </Card>

          <Card title="Icons" wide>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {(Object.keys(ICON_PATHS) as IconName[]).map(k => (
                <div key={k} className="flex flex-col items-center gap-[6px] py-2 rounded-rr-md text-text2 hover:bg-panel2 hover:text-text" title={k}>
                  <Icon name={k} size={19} />
                  <span className="font-mono text-[9.5px] truncate max-w-full">{k}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="New Cycle"
        footer={<><Button onClick={() => setDialog(false)}>Cancel</Button><Button variant="primary" onClick={() => setDialog(false)}>Create</Button></>}
      >
        <Field label="Cycle name"><TextInput placeholder="Fall Workups 2026" autoFocus /></Field>
        <div className="flex gap-[14px] mt-[14px]">
          <Field label="Start" className="flex-1"><TextInput mono type="date" defaultValue="2026-09-07" /></Field>
          <Field label="Weeks" className="flex-1"><NumberStepper value={8} onChange={() => {}} /></Field>
        </div>
      </Dialog>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        footer={<>
          <button type="button" onClick={() => setFacets([])} className="text-[12px] font-semibold text-text2 hover:text-bad bg-transparent border-0 cursor-pointer">Clear all</button>
          <Button variant="primary" onClick={() => setDrawer(false)}>Apply</Button>
        </>}
      >
        <div className="rr-label mb-[9px]">Status</div>
        <div className="flex flex-wrap gap-[6px] mb-5">
          {['Active', 'LOA', 'Provisional', 'Inactive'].map(s => (
            <FacetPill key={s} active={facets.includes(s)} onClick={() => setFacets(f => (f.includes(s) ? f.filter(x => x !== s) : [...f, s]))}>{s}</FacetPill>
          ))}
        </div>
        <div className="rr-label mb-[9px]">Qualifications</div>
        <div className="flex flex-wrap gap-[6px]">
          {['MC', '4S', '2S', 'IP', 'CQ', 'LSO', 'JTAC'].map(s => (
            <FacetPill mono key={s} active={facets.includes(s)} onClick={() => setFacets(f => (f.includes(s) ? f.filter(x => x !== s) : [...f, s]))}>{s}</FacetPill>
          ))}
        </div>
      </Drawer>
    </div>
  );
};

export default UiKit;
