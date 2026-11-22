/**
 * The CATCC kit's specimens, section by section. Each specimen is a real component (a kit primitive or the
 * live CATCC component itself) rendered with demo data. `name` / `variant` become the Figma component (set)
 * and its variant properties (figma/catcc-kit, built by scripts/catcc/figma-kit.gen.tsx): name "Group/Name",
 * variant "prop=value, prop=value".
 */
import React from 'react';
import { DndContext } from '@dnd-kit/core';
import * as Ic from '../icons.tsx';
import { OptionsDialog } from '../OptionsDialog.tsx';
import { HandoffRow } from '../Handoff.tsx';
import { InfoPanels } from '../radar/InfoPanels.tsx';
import { DeckPanel, DonorsPanel, InterceptPanel } from '../radar/SidePanels.tsx';
import { FreqPanel, LayersPanel, Notifications } from '../radar/Panels.tsx';
import { OV2_DEFAULT, OV_DEFAULT } from '../radar/types.ts';
import { LightsPanel, DeckBar } from '../prifly/BossPanels.tsx';
import { PRIFLY_LIGHTS } from '../prifly/lights.ts';
import { flightOf } from '../strips.ts';
import { tagRows, velocityEnd, type Picture } from '../scopeModel.ts';
import { FinalView } from '../final/FinalView.tsx';
import { AzElScope } from '../final/AzElScope.tsx';
import { finalPicture } from '../final/finalModel.ts';
import FlightCard from '../../ui/flight cards/FlightCard';
import * as K from './primitives.tsx';
import * as S from './scopeKit.tsx';
import { DEMO_DONORS, DEMO_MT, DEMO_NOTES, DEMO_OFFH, DEMO_PLAN, DEMO_UTC, demoHandoff, demoPicture } from './demo.ts';

export interface Specimen {
  /** Figma component name, "Group/Name" */
  name: string;
  /** Figma variant properties, "prop=value, prop=value" */
  variant?: string;
  render: () => React.ReactNode;
  /**
   * A part of another specimen rather than a render of its own: `from` is that specimen's key
   * ("name|variant"), `pick` a CSS selector inside it. The page shows a pointer to it; the Figma
   * generator takes the picked element as the component.
   */
  from?: string;
  pick?: string;
}
export interface KitSection {
  id: string;
  title: string;
  /** what the section's specimens come from */
  source: string;
  specimens: Specimen[];
}

const noop = () => undefined;
let picCache: Picture | null = null;
const pic = () => (picCache ??= demoPicture());
/** a column of the Approach / Final sidebar, as wide as in the layout specimen (Layout/Approach Final) */
const FINAL_COL = 180;
/** the key of the Approach / Final layout specimen, whose parts some specimens are */
const FINAL_KEY = 'Layout/Approach Final|';
const col = (children: React.ReactNode, w = 320) => <div style={{ width: w, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>;
const each = <T,>(name: string, list: T[], variant: (x: T) => string, render: (x: T) => React.ReactNode): Specimen[] => list.map((x) => ({ name, variant: variant(x), render: () => render(x) }));

// ---------------------------------------------------------------- header

const header: KitSection = {
  id: 'header',
  title: 'Header & seats',
  source: 'CatccApp.tsx',
  specimens: [
    ...each('Header/Logo', ['radar', 'prifly'] as const, (v) => `icon=${v}`, (v) => <K.Logo icon={v === 'radar' ? <Ic.IcCatcc /> : <Ic.IcPrifly />} text={v === 'radar' ? 'CATCC' : 'PRIFLY'} />),
    { name: 'Header/Location tabs', render: () => <K.TabNav label="Location" tabs={['CDC', 'CATCC', 'PriFly', 'Bridge', 'LSO']} value="CATCC" /> },
    { name: 'Header/Seat tabs', render: () => <K.TabNav label="Seat" tabs={['CATCC', 'Air Ops', 'Departure', 'Marshal', 'Approach', 'Final']} value="Marshal" dots={{ Marshal: 'you', Approach: 'other' }} /> },
    ...each('Header/Seat tab', [['on', ''], ['off', ''], ['off', 'you'], ['off', 'other']] as const, ([s, d]) => `state=${s}, holder=${d || 'none'}`, ([s, d]) => <K.SeatTab on={s === 'on'} dot={d || undefined}>Marshal</K.SeatTab>),
    { name: 'Header/View switch', render: () => <K.Segmented label="CATCC view" options={['Radar', 'Approach / Final']} value="Radar" /> },
    { name: 'Header/Case badge', render: () => <K.CaseBadge>CASE III · CV-1</K.CaseBadge> },
    ...each('Header/Seat pill', ['open', 'mine', 'other'] as const, (v) => `state=${v}`, (v) => <K.SeatPill state={v} label="MARSHAL" who={v === 'mine' ? '201 · You' : v === 'other' ? '305 · Knuckles' : undefined} init={v === 'mine' ? '201' : v === 'other' ? '305' : undefined} />),
    { name: 'Header/View only', render: () => <K.ViewOnly /> },
    ...each('Header/Feed', [['live', 'CVN-71 feed · live'], ['idle', 'CVN-71 feed · waiting'], ['down', 'CVN-71 feed · offline'], ['connecting', 'Room · connecting']] as const, ([s]) => `state=${s}`, ([s, t]) => <K.FeedStatus state={s}>{t}</K.FeedStatus>),
    { name: 'Header/Clocks', render: () => <K.Clocks local="19:22:07" zulu="15:22:07Z" offset="UTC+4" /> },
    ...each('Header/Button', [['Reference', 'book'], ['Displays', 'displays'], ['Options', 'none']] as const, ([l]) => `label=${l}, state=off`, ([l, i]) => <K.HeaderButton icon={i === 'book' ? <Ic.IcBook /> : i === 'displays' ? <Ic.IcDisplays /> : undefined}>{l}</K.HeaderButton>),
    { name: 'Header/Button', variant: 'label=Reference, state=on', render: () => <K.HeaderButton on icon={<Ic.IcBook />}>Reference</K.HeaderButton> },
    { name: 'Header/Ship select', render: () => (<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><label className="lbl">Ship</label><K.Select value="CVN-71 · Roosevelt" options={['CVN-71 · Roosevelt', 'CVN-74 · Stennis']} /></div>) },
    {
      name: 'Header/Bar',
      render: () => (
        <div style={{ width: 1440 }}>
          <K.HeaderBar>
            <K.Logo icon={<Ic.IcCatcc />} text="CATCC" />
            <K.TabNav label="Location" tabs={['CDC', 'CATCC', 'PriFly', 'Bridge', 'LSO']} value="CATCC" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><label className="lbl">Ship</label><K.Select value="CVN-71 · Roosevelt" options={['CVN-71 · Roosevelt']} /></div>
            <K.Segmented options={['Radar', 'Approach / Final']} value="Radar" />
            <K.CaseBadge>CASE III · CV-1</K.CaseBadge>
            <K.SeatPill state="mine" label="MARSHAL" who="201 · You" init="201" />
            <K.Spacer />
            <K.FeedStatus state="live">CVN-71 feed · live</K.FeedStatus>
            <K.Clocks local="19:22:07" zulu="15:22:07Z" offset="UTC+4" />
            <K.HeaderButton icon={<Ic.IcBook />}>Reference</K.HeaderButton>
            <K.HeaderButton icon={<Ic.IcDisplays />}>Displays</K.HeaderButton>
            <K.HeaderButton>Options</K.HeaderButton>
          </K.HeaderBar>
        </div>
      ),
    },
    {
      name: 'Header/Status bar',
      render: () => (
        <div style={{ width: 1440 }}>
          <K.StatusBar>
            <K.Segmented options={['Live positions', 'Sand table']} value="Live positions" />
            <K.Spacer />
            <K.DeckBadge foul={false} />
            <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0' }}>CVN-71 · RECOVERY · 3 aboard</span>
          </K.StatusBar>
        </div>
      ),
    },
  ],
};

// ---------------------------------------------------------------- controls

const controls: KitSection = {
  id: 'controls',
  title: 'Controls',
  source: 'catcc.css .tbtn / .lcb / .gb / .dv; FinalView, BossPanels, Panels, Handoff, Helm, Nav, BossView',
  specimens: [
    ...each('Control/Segment', [['on', 'md'], ['off', 'md'], ['on', 'sm'], ['off', 'sm'], ['on', 'xs'], ['off', 'xs']] as const, ([s, z]) => `state=${s}, size=${z}`, ([s, z]) => <K.SegButton on={s === 'on'} size={z}>{z === 'xs' ? 'IA' : z === 'sm' ? 'ON' : 'Radar'}</K.SegButton>),
    { name: 'Control/Segmented', variant: 'options=2, size=md', render: () => <K.Segmented options={['Live positions', 'Sand table']} value="Live positions" /> },
    { name: 'Control/Segmented', variant: 'options=2, size=sm', render: () => <K.Segmented size="sm" options={['ON', 'OFF']} value="ON" /> },
    { name: 'Control/Segmented', variant: 'options=4, size=xs', render: () => <K.Segmented size="xs" options={['I', 'IA', 'II', 'III']} value="II" /> },
    ...each('Control/Light setting', ['ON', 'AUTO', 'RED', 'GREEN'], (v) => `value=${v}`, (v) => <K.LightSeg options={v === 'RED' || v === 'GREEN' ? ['GREEN', 'RED', 'OFF', 'AUTO'] : ['ON', 'OFF', 'AUTO']} value={v} />),
    ...each('Control/Deck call', ['CLEAR', 'FOUL', 'AUTO'] as const, (v) => `value=${v}`, (v) => <K.DeckCallSeg value={v} />),
    ...each('Control/Tool button', ['off', 'on', 'float', 'open'] as const, (v) => `state=${v}`, (v) => <K.ToolButton state={v} label="Layers"><Ic.IcLayers /></K.ToolButton>),
    {
      name: 'Control/Toolbar',
      render: () => (
        <K.Toolbar label="Radar tools">
          <K.ToolButton state="on" label="Select"><Ic.IcSelect /></K.ToolButton>
          <K.ToolButton label="BRA"><Ic.IcBra /></K.ToolButton>
          <K.ToolButton label="Marshal"><Ic.IcMarshal /></K.ToolButton>
          <K.ToolButton label="Vector"><Ic.IcVec /></K.ToolButton>
          <K.ToolButton label="CPA"><Ic.IcCpa /></K.ToolButton>
          <K.ToolDivider />
          <K.ToolButton label="Comms scripts"><Ic.IcComms /></K.ToolButton>
          <K.ToolDivider />
          <K.ToolButton label="Zoom out"><Ic.IcZoomOut /></K.ToolButton>
          <K.RangeReadout nm={25} />
          <K.ToolButton label="Zoom in"><Ic.IcZoomIn /></K.ToolButton>
        </K.Toolbar>
      ),
    },
    { name: 'Control/Toolbar divider', render: () => <K.ToolDivider /> },
    ...each('Control/Range button', ['on', 'off'] as const, (v) => `state=${v}`, (v) => <K.RangeButton on={v === 'on'}>12 NM</K.RangeButton>),
    ...each('Control/Outline button', ['md', 'sm'] as const, (v) => `size=${v}`, (v) => <K.OutlineButton size={v}>{v === 'md' ? 'Order' : 'Plot'}</K.OutlineButton>),
    ...each('Control/Toggle button', ['on', 'off', 'disabled'] as const, (v) => `state=${v}`, (v) => <K.ToggleButton on={v === 'on'} enabled={v !== 'disabled'}>Hold</K.ToggleButton>),
    { name: 'Control/Small button', render: () => <K.SmallButton>Reset</K.SmallButton> },
    ...each('Control/Row action', [['COMMIT', '#7FD397'], ['CLEAR', '#93A1B0']] as const, ([l]) => `action=${l}`, ([l, c]) => <K.RowAction color={c}>{l}</K.RowAction>),
    ...each('Control/Handoff button', ['plain', 'amber'] as const, (v) => `tone=${v}`, (v) => <K.HandoffButton tone={v}>{v === 'amber' ? 'Accept' : 'Hand off'}</K.HandoffButton>),
    ...each('Control/Owner chip', ['mine', 'other'] as const, (v) => `owner=${v}`, (v) => <K.OwnerChip mine={v === 'mine'}>{v === 'mine' ? 'MARSHAL' : 'APPROACH'}</K.OwnerChip>),
    ...each('Control/Switch', ['on', 'off'] as const, (v) => `state=${v}`, (v) => <K.Switch on={v === 'on'} label="Conflict alerts" />),
    { name: 'Control/Select', render: () => <K.Select value="12 NM" options={['6 NM', '12 NM', '24 NM']} /> },
    ...each('Control/Layer check', [['on', '#5FD068'], ['off', '#5FD068'], ['on', '#3E9BD4'], ['off', '#3E9BD4']] as const, ([s, c]) => `state=${s}, carrier=${c === '#3E9BD4' ? 'other' : 'own'}`, ([s, c]) => <K.LayerCheck on={s === 'on'} color={c} />),
    ...each('Control/Grade button', ['on', 'off'] as const, (v) => `state=${v}`, (v) => <K.GradeButton on={v === 'on'} color="#7FD397">OK</K.GradeButton>),
    ...each('Control/Deviation button', ['on', 'off'] as const, (v) => `state=${v}`, (v) => <K.DevButton on={v === 'on'}>IC</K.DevButton>),
    ...each('Control/Script tab', ['current', 'done', 'next'] as const, (v) => `state=${v}`, (v) => <div style={{ width: 220 }}><K.ScriptTab state={v}>Check-in</K.ScriptTab></div>),
    ...each('Control/Chip', [['#E6EDF3', 'plain'], ['#7FD397', 'ok'], ['#E7B04F', 'amber']] as const, ([, t]) => `tone=${t}`, ([c]) => <K.Chip color={c}>CAT 1</K.Chip>),
  ],
};

// ---------------------------------------------------------------- panels

const panels: KitSection = {
  id: 'panels',
  title: 'Panels',
  source: 'catcc.css .pnl / .lbl / .kv / .stat3; SidePanels, InfoPanels, FinalView, BossPanels',
  specimens: [
    { name: 'Panel/Label', render: () => <K.Label>Wind over deck</K.Label> },
    { name: 'Panel/Heading', render: () => <div style={{ width: 298 }}><K.PanelHead label="Deck" meta="3 aboard" /></div> },
    { name: 'Panel/Key value', variant: 'style=sidebar', render: () => <div style={{ width: 298 }}><K.Kv k="Wind over deck" v="342 / 27 KT" /></div> },
    { name: 'Panel/Key value', variant: 'style=final', render: () => <div style={{ width: 298 }}><K.KvWide k="Channel · glideslope" v="CH 13 · 3.5°" /></div> },
    ...each('Panel/Status row', [['open', '#7FD397'], ['spotted', '#E7B04F'], ['foul', '#FF9C98']] as const, ([s]) => `status=${s}`, ([s, c]) => <div style={{ width: 298 }}><K.StatusRow k="Cat 1" v={s === 'spotted' ? '201 spotted' : s === 'foul' ? '305' : 'open'} c={c} /></div>),
    { name: 'Panel/Figure', render: () => <K.Figure label="Speed" value="22" unit="KT" /> },
    { name: 'Panel/Figures', render: () => <div style={{ width: 298 }}><K.Figures><K.Figure label="BRC" value="345" /><K.Figure label="FB" value="336" /><K.Figure label="Speed" value="22" unit="KT" /></K.Figures></div> },
    ...each('Panel/Deck banner', [false, true], (f) => `deck=${f ? 'foul' : 'clear'}`, (f) => <div style={{ width: 298 }}><K.DeckBanner foul={f} /></div>),
    ...each('Panel/Deck chip', [false, true], (f) => `deck=${f ? 'foul' : 'clear'}`, (f) => <K.DeckChip foul={f} />),
    ...each('Panel/Deck badge', [false, true], (f) => `deck=${f ? 'foul' : 'clear'}`, (f) => <K.DeckBadge foul={f} />),
    {
      name: 'Panel/Panel',
      render: () =>
        col(
          <K.Panel gap={8}>
            <K.PanelHead label="Panel title" meta="meta" />
            <K.Kv k="Key" v="Value" />
            <K.Kv k="Key" v="Value" />
          </K.Panel>,
        ),
    },
    ...each('Panel/Deck status', [false, true], (f) => `deck=${f ? 'foul' : 'clear'}`, (f) => col(<K.DeckStatusPanel foul={f} next={{ id: '201', at: '3/4 in 1:12' }} rows={[['Wind over deck', '27 KT · 4° R of angle'], ['Arresting gear', 'F18C · 33,000'], ['Lens', '3.5° · HTR 13.5 FT']]} />, FINAL_COL)),
    {
      name: 'Panel/Landing aids',
      render: () =>
        col(
          <K.Panel label="Landing aids">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span className="lbl">ICLS</span>
              <K.Segmented size="sm" options={['ON', 'OFF']} value="ON" />
            </div>
            <K.KvWide k="Channel · glideslope" v="CH 13 · 3.5°" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}>
              <span className="lbl">ACLS · SPN-46</span>
              <K.Segmented size="sm" options={['UP', 'DOWN']} value="UP" />
            </div>
            <K.KvWide k="Link 4" v="373.000" />
            <K.AclsRow id="401" state="LOCK-ON" mode="II" />
            <K.AclsRow id="410" state="ACQUIRING" mode="IA" />
          </K.Panel>,
          FINAL_COL,
        ),
    },
    ...each('Panel/Sequence card', ['normal', 'pending'] as const, (v) => `handoff=${v}`, (v) => col(<K.SequenceCard id="201" sub="Hawk 2-1" fuel="6.4" where="3/4 in 1:12" pending={v === 'pending'} />, FINAL_COL)),
    ...each('Panel/Notification', ['conflict', 'handoff', 'warn', 'coord', 'info'] as const, (v) => `kind=${v}`, (v) => {
      const n = DEMO_NOTES.find((x) => x.k === v)!;
      return col(<K.NoteCard kind={v} label={n.kind} time={n.t} title={n.title} body={n.body} action={n.action?.label} />);
    }),
    { name: 'Panel/Empty', render: () => <K.Empty>No arrivals</K.Empty> },
    { name: 'Panel/Sidebar tabs', render: () => col(<K.SidebarTabs tabs={[['Info'], ['Strips', '4 · 6']]} value="Info" />) },
  ],
};

// ---------------------------------------------------------------- live panels (the real components)

const live: KitSection = {
  id: 'live',
  title: 'Sidebar panels (live components)',
  source: 'the CATCC components themselves, fed the demo picture (kit/demo.ts)',
  specimens: [
    { name: 'Live/Ship data', render: () => col(<InfoPanels focus={pic().focus} utc={DEMO_UTC} offH={DEMO_OFFH} mt={DEMO_MT} deckClear />) },
    { name: 'Live/Deck', render: () => col(<DeckPanel pic={pic()} />) },
    { name: 'Live/Intercepts', render: () => col(<InterceptPanel air={pic().air} focusSide="blue" covered={new Set()} committed={{ a1: 'r1' }} locks={{}} onCommit={noop} onClearLock={noop} onClear={noop} />) },
    { name: 'Live/Radar donors', render: () => col(<DonorsPanel donors={DEMO_DONORS} alt={1000} />) },
    { name: 'Live/Lights', render: () => col(<LightsPanel title="Lights" items={PRIFLY_LIGHTS} setOps={noop} readOnly={false} />) },
    { name: 'Live/Notifications', render: () => col(<Notifications notes={DEMO_NOTES.slice(0, 3)} onAck={noop} onGoTo={noop} />) },
    ...each('Live/Deck bar', [false, true], (f) => `deck=${f ? 'foul' : 'clear'}`, (f) => <div style={{ width: 760 }}><DeckBar pic={pic()} deck={{ foul: f, called: true, aboard: 3, reason: f ? 'Clearing landing area' : undefined }} setOps={noop} readOnly={false} /></div>),
  ],
};

// ---------------------------------------------------------------- strips & rows

const rows: KitSection = {
  id: 'rows',
  title: 'Strips & rows',
  source: 'FlightCard via strips.ts flightOf, Handoff.tsx, catcc.css .lrow / .frow / .ev',
  specimens: [
    {
      name: 'Strip/Flight strip',
      render: () => {
        const f = pic().formations.find((x) => x.members.length > 1) ?? pic().formations[0];
        const { v, ctx } = demoHandoff();
        return col(
          <DndContext>
            <FlightCard {...flightOf(f)} corner={<HandoffRow compact v={v} ctx={ctx} />} />
          </DndContext>,
        );
      },
    },
    { name: 'Strip/Handoff row', render: () => { const { v, ctx } = demoHandoff(); return col(<HandoffRow v={v} ctx={ctx} />); } },
    ...each('Row/Layer', [['two', true, false], ['two', false, true], ['one', true, null], ['one', false, null]] as const, ([c, on, on2]) => `carriers=${c}, own=${on ? 'on' : 'off'}${on2 === null ? '' : `, other=${on2 ? 'on' : 'off'}`}`, ([, on, on2]) => <div style={{ width: 270 }}><K.LayerRow label="Marshal stacks" color="#5FD068" on={on} on2={on2} /></div>),
    ...each('Row/Frequency', ['PRI', 'AUX'] as const, (v) => `radio=${v}`, (v) => <div style={{ width: 266 }}><K.FreqRow name="Marshal" freq="264.000" chan="2" radio={v} fill={v === 'PRI' ? '1' : undefined} /></div>),
    { name: 'Row/Event head', render: () => <div style={{ width: 420 }}><K.EventHead cells={['EVENT', 'LAUNCH', 'RECOVER', 'FLIGHTS']} /></div> },
    ...each('Row/Event', ['now', 'next', 'done', 'later'] as const, (v) => `state=${v}`, (v) => <div style={{ width: 420 }}><K.EventRow state={v} cells={['2', '19:30', '—', 'Hawk 2 · Chaos 1']} /></div>),
  ],
};

// ---------------------------------------------------------------- scope

const SHAPES = ['jet', 'tanker', 'helo'] as const;
const SIDES = ['own', 'blue', 'red', 'dim'] as const;
const sym = (shape: S.ContactShape, side: S.ContactSide, mark: S.ContactMark) => (
  <div style={{ background: '#0B0E12', padding: 0 }}>
    <S.ScopeSvg w={32} h={32}>
      <S.Hit p={[16, 16]} shape={shape} side={side} mark={mark} />
    </S.ScopeSvg>
  </div>
);
const scopeBox = (w: number, h: number, children: React.ReactNode) => (
  <div style={{ background: '#0B0E12' }}>
    <S.ScopeSvg w={w} h={h}>{children}</S.ScopeSvg>
  </div>
);

const scope: KitSection = {
  id: 'scope',
  title: 'Scope',
  source: 'radar/Scope.tsx (background rings, ships), final/FinalView.tsx (precision displays)',
  specimens: [
    ...each('Scope/Frame', [[480, 360, 25], [860, 600, 40]] as const, ([w, h]) => `size=${w}x${h}`, ([w, h, r]) => <S.ScopeFrame w={w} h={h} range={r} />),
    { name: 'Scope/Frame', variant: 'size=480x360, grid=on', render: () => <S.ScopeFrame w={480} h={360} range={25} grid /> },
    {
      name: 'Scope/Picture',
      render: () => (
        <S.ScopeFrame w={860} h={600} range={30}>
          {({ kx, zkH, zkT }) => (
            <>
              {(pic().ships ?? []).map((s) => <S.SurfaceContact key={s.id} p={s.p as [number, number]} hdg={s.crs ?? 0} name="CG-47" k={zkH} />)}
              {pic().air.map((t) => {
                // a formation close enough to draw as one: the lead boxed with the flight's row, the others untagged (Scope.tsx fmInfo)
                const f = pic().formations.find((x) => x.collapsible && x.members.length > 1 && x.members.includes(t));
                const side = t.sd === 'red' ? 'red' : 'own';
                const ve = velocityEnd(t);
                return (
                  <React.Fragment key={t.id}>
                    <S.Trail pts={t.trail as [number, number][]} side={side} px={0.32 * kx * zkH} />
                    {ve && <S.Vector a={t.p as [number, number]} b={ve as [number, number]} side={side} />}
                    <S.Hit p={t.p as [number, number]} k={zkH} shape={/tanker|S-3B/i.test(t.ty) ? 'tanker' : t.k === 'rotary' ? 'helo' : 'jet'} side={side} mark={t.id === 'a3' ? 'hooked' : f && f.lead === t ? 'formation' : 'none'} />
                    {(!f || f.lead === t) && <S.DataTag p={t.p as [number, number]} rows={f ? tagRows(t, f, true) : tagRows(t)} k={zkT} side={side} />}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </S.ScopeFrame>
      ),
    },
    ...each('Scope/Carrier', [true, false], (f) => `carrier=${f ? 'focus' : 'other'}`, (f) => scopeBox(40, 40, <S.CarrierSymbol p={[20, 20]} focus={f} />)),
    ...each('Scope/Surface contact', ['blue', 'red', 'neutral'] as const, (v) => `side=${v}`, (v) => scopeBox(90, 36, <S.SurfaceContact p={[14, 16]} side={v} name={v === 'neutral' ? 'Cargo' : v === 'red' ? 'FFG' : 'CG-47'} />)),
    ...each('Scope/CPA label', [false, true], (p) => `probe=${p ? 'yes' : 'no'}`, (p) => scopeBox(240, 30, <S.CpaLabel p={[120, 38]} text="CPA 0.8 NM / 400 FT · 1:12" probe={p} />)),
    ...each('Scope/Off-scope pointer', ['own', 'red'] as const, (v) => `side=${v}`, (v) => <div style={{ background: '#0B0E12', padding: 16 }}><S.OffScope side={v} /></div>),
    { name: 'Scope/Pinned conflict', render: () => <S.PinnedConflict>201 / 305 · CPA 0.8 NM · 1:12</S.PinnedConflict> },
    { name: 'Scope/Assigned tag', render: () => <S.AssignedTag>201 · A6 · EAT 22</S.AssignedTag> },
    // the precision displays as FinalView draws them (12 NM, default layers, the demo arrivals): parts of the layout specimen
    ...(['Elevation', 'Azimuth'] as const).map((v): Specimen => ({ name: 'Scope/Precision display', variant: `display=${v.toLowerCase()}`, from: FINAL_KEY, pick: `section[aria-label="${v} display"]`, render: () => null })),
    { name: 'Scope/Approach toolbar', from: FINAL_KEY, pick: '[role="toolbar"][aria-label="Approach tools"]', render: () => null },
    ...each('Scope/AZ EL display', ['contact', 'conflict', 'none'] as const, (v) => `contact=${v}`, (v) => {
      const fp = v === 'none' ? null : finalPicture(pic());
      return <AzElScope fp={fp} tol conflictIds={new Set(v === 'conflict' ? ['f1'] : [])} style={{ width: 334, height: 334 }} />;
    }),
    ...each('Scope/Precision blip', ['own', 'red'] as const, (v) => `side=${v}`, (v) => <div style={{ position: 'relative', width: 24, height: 24, background: '#0B0E12' }}><S.ParBlip x={50} y={50} color={v === 'red' ? '#FF8A85' : undefined} /></div>),
  ],
};

// ---------------------------------------------------------------- contacts & tags

// ---------------------------------------------------------------- layouts

const layouts: KitSection = {
  id: 'layouts',
  title: 'Layouts',
  source: 'final/FinalView.tsx itself, fed the demo picture: the Approach / Final seat below the header',
  specimens: [
    {
      name: 'Layout/Approach Final',
      // the seat's view as CatccApp places it: everything under the header, here 1520 × 860
      render: () => {
        const { ctx } = demoHandoff();
        return (
          <div style={{ width: 1520, height: 860, display: 'flex', flexDirection: 'column', background: '#0E1116' }}>
            <FinalView pic={pic()} setOps={noop} deck={{ foul: false, called: true, aboard: 3 }} local={new Date(DEMO_UTC.getTime() + DEMO_OFFH * 3_600_000)} defaultRange={12} handoffCtx={ctx} owners={{}} readOnly={false} recoveryCase="III" />
          </div>
        );
      },
    },
    { name: 'Layout/Final sidebar', from: FINAL_KEY, pick: 'aside[aria-label="Deck, landing aids and sequence"]', render: () => null },
    { name: 'Panel/Bolter slot', variant: 'bolter=none', from: FINAL_KEY, pick: 'section[aria-label="Bolter slot"]', render: () => null },
  ],
};

const contacts: KitSection = {
  id: 'contacts',
  title: 'Contacts & tags',
  source: 'radar/Scope.tsx hits, trails, velocity vectors, renderTag; scopeModel.ts tagRows',
  specimens: [
    ...SHAPES.flatMap((shape) => SIDES.map((side): Specimen => ({ name: 'Contact/Symbol', variant: `shape=${shape}, side=${side}, mark=none`, render: () => sym(shape, side, 'none') }))),
    ...(['hooked', 'formation', 'member'] as const).map((mark): Specimen => ({ name: 'Contact/Symbol', variant: `shape=jet, side=own, mark=${mark}`, render: () => sym('jet', 'own', mark) })),
    ...each('Contact/Trail', ['own', 'blue', 'red'] as const, (v) => `side=${v}`, (v) => scopeBox(70, 20, <S.Trail side={v} pts={[0, 1, 2, 3, 4].map((i) => [10 + i * S.U, 10] as [number, number])} />)),
    ...each('Contact/Vector', ['own', 'blue', 'red'] as const, (v) => `side=${v}`, (v) => scopeBox(40, 12, <S.Vector a={[6, 6]} b={[34, 6]} side={v} />)),
    ...(['own', 'blue', 'red'] as const).flatMap((side) =>
      (['NE', 'NW', 'SE', 'SW'] as const).map((q): Specimen => ({
        name: 'Contact/Data tag',
        variant: `side=${side}, quadrant=${q}`,
        render: () => scopeBox(230, 90, <S.DataTag p={[115, 45]} rows={tagRows({ ...pic().air[0] })} side={side} quadrant={q} />),
      })),
    ),
    { name: 'Contact/Data tag', variant: 'side=own, quadrant=NE, rows=3', render: () => scopeBox(260, 90, <S.DataTag p={[115, 45]} rows={['201 F18C 6.4', '070 250', 'FLT ×2 · LOW 5.9']} />) },
    ...each('Contact/Contact', ['own', 'blue', 'red'] as const, (v) => `side=${v}`, (v) => scopeBox(180, 110, <S.Contact p={[70, 66]} hdg={300} side={v} rows={v === 'red' ? ['Bandit MIG2', '220 420'] : ['201 F18C 6.4', '↓070 250']} />)),
    { name: 'Contact/Contact', variant: 'side=own, hooked=yes', render: () => scopeBox(180, 110, <S.Contact p={[70, 66]} hdg={300} mark="hooked" rows={['305 F18C 4.1', '012 150']} />) },
  ],
};

// ---------------------------------------------------------------- overlays

const overlays: KitSection = {
  id: 'overlays',
  title: 'Overlays & dialogs',
  source: 'radar/Panels.tsx LayersPanel / FreqPanel, OptionsDialog.tsx, Panels DisplaySettings',
  specimens: [
    { name: 'Overlay/Layers', render: () => <LayersPanel ov={OV_DEFAULT} ov2={OV2_DEFAULT} set={noop} hull="CVN-71" other="CVN-74" /> },
    { name: 'Overlay/Frequencies', render: () => <FreqPanel plan={DEMO_PLAN} source="Event 2 · Hawk 2" /> },
    {
      name: 'Overlay/Popover',
      render: () => (
        <K.Popover width={260}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="lbl">Layers</span>
            <K.SmallButton>Reset</K.SmallButton>
          </div>
          <div className="lbl" style={{ fontSize: 9.5, color: '#6B7683', margin: '8px 0 2px 2px' }}>Pattern</div>
          <K.LayerRow label="Glidepath" color="#C9D3DD" on on2={null} />
          <K.LayerRow label="Tolerance" color="#C9D3DD" on={false} on2={null} />
        </K.Popover>
      ),
    },
    {
      name: 'Dialog/Frame',
      render: () => (
        <K.DialogFrame title="Display settings" width={560}>
          <div className="lbl" style={{ marginBottom: 4 }}>Conflicts</div>
          <K.SettingRow label="Conflict alerts" hint="Predicted separation loss"><K.Switch on /></K.SettingRow>
          <K.SettingRow label="Look ahead" hint="How far ahead to predict"><K.Select value="2 min" options={['1 min', '2 min', '3 min']} /></K.SettingRow>
        </K.DialogFrame>
      ),
    },
    ...each('Dialog/Option card', [true, false], (v) => `state=${v ? 'on' : 'off'}`, (v) => <div style={{ width: 280 }}><K.OptionCard on={v} title={v ? 'Condensed' : 'Expanded'} hint={v ? 'One seat per location: for small groups' : 'A seat per function: for larger groups'} /></div>),
    {
      name: 'Dialog/Options',
      // the live dialog is position: fixed over a scrim; the transform keeps it inside this box
      render: () => (
        <div style={{ position: 'relative', width: 720, height: 460, transform: 'translateZ(0)', overflow: 'hidden', borderRadius: 8 }}>
          <OptionsDialog layout="condensed" onLayout={noop} onClose={noop} />
        </div>
      ),
    },
  ],
};

// ---------------------------------------------------------------- icons

const ICONS: [string, () => React.ReactNode][] = Object.entries(Ic)
  .filter(([n]) => n.startsWith('Ic'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([n, C]) => [n.slice(2), () => React.createElement(C as React.FC)]);

const icons: KitSection = {
  id: 'icons',
  title: 'Icons',
  source: 'icons.tsx (copied from the CATCC mockup); 24 × 24, stroke currentColor',
  specimens: ICONS.map(([n, r]) => ({ name: `Icon/${n}`, render: () => <span style={{ display: 'inline-flex', color: '#E6EDF3', background: n === 'Catcc' || n === 'Prifly' ? '#F15822' : undefined, borderRadius: 5 }}>{r()}</span> })),
};

export const SECTIONS: KitSection[] = [header, controls, panels, live, rows, scope, contacts, overlays, layouts, icons];

/** every specimen's Figma key, "name|variant" */
export const specimenKeys = (): string[] => SECTIONS.flatMap((s) => s.specimens.map((x) => `${x.name}|${x.variant ?? ''}`));
