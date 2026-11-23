/**
 * CATCC kit primitives: the controls and panel parts the CATCC / PriFly interface repeats as inline styles.
 * Every value is copied from the call site named on each primitive (not approximated), so a new feature can
 * use these and look like the live interface. Classes (.pnl, .lbl, .kv, .tbtn, .lrow, .lcb ...) come from
 * ../catcc.css, which the kit page loads inside a .cc-root.
 */
import React from 'react';
import { IcGoTo } from '../icons.tsx';

const MONO = "'IBM Plex Mono', monospace";
const SAIRA = "'Saira', sans-serif";

// ---------------------------------------------------------------- segmented buttons

/** Segmented track (FinalView / BossPanels / Formation `SEG`, the header's location nav). */
export const SEG: React.CSSProperties = { display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 };

/** Segment button (FinalView `segBtn`, Formation `segB`, the header's CATCC view switch). */
export const segBtn = (on: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ border: 0, height: 28, padding: '0 10px', borderRadius: 4, fontFamily: SAIRA, fontSize: 12.5, cursor: 'pointer', background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', ...extra });

export type SegSize = 'md' | 'sm' | 'xs';
/** md: h 28 / 12.5 (view switch); sm: h 24 / 11 (ICLS ON/OFF, ACLS UP/DOWN); xs: sm with 0 7px padding (ACLS modes). */
const SEG_SIZE: Record<SegSize, React.CSSProperties> = { md: {}, sm: { height: 24, fontSize: 11 }, xs: { height: 24, fontSize: 11, padding: '0 7px' } };

export const Segmented: React.FC<{ options: string[]; value: string; onChange?: (v: string) => void; size?: SegSize; label?: string }> = ({ options, value, onChange, size = 'md', label }) => (
  <div style={SEG} role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button key={o} role="radio" aria-checked={o === value} onClick={() => onChange?.(o)} style={segBtn(o === value, SEG_SIZE[size])}>
        {o}
      </button>
    ))}
  </div>
);

/** One segment on its own, for Figma variants. */
export const SegButton: React.FC<{ on: boolean; size?: SegSize; children: React.ReactNode }> = ({ on, size = 'md', children }) => (
  <button aria-pressed={on} style={segBtn(on, SEG_SIZE[size])}>
    {children}
  </button>
);

/** PriFly / Bridge lights setting (BossPanels LightsPanel): coloured when chosen. Colours from its `LC`. */
export const LIGHT_COLORS: Record<string, string> = { ON: '#5FD068', OFF: '#C9D3DD', AUTO: '#A08CFF', GREEN: '#5FD068', RED: '#FF6B66', VIOLET: '#D27CFF', YELLOW: '#E7D04F', NIGHT: '#E7B04F' };
export const LightSeg: React.FC<{ options: string[]; value: string; short?: Record<string, string>; onChange?: (v: string) => void }> = ({ options, value, short = { VIOLET: 'VIO', YELLOW: 'YEL', GREEN: 'GRN' }, onChange }) => (
  <div style={SEG} role="radiogroup">
    {options.map((o) => (
      <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange?.(o)} style={{ border: 0, height: 24, fontSize: 11, padding: '0 7px', borderRadius: 4, fontFamily: SAIRA, cursor: 'pointer', background: value === o ? `${LIGHT_COLORS[o]}33` : 'transparent', color: value === o ? LIGHT_COLORS[o] : '#7D8896', boxShadow: `inset 0 0 0 1px ${value === o ? LIGHT_COLORS[o] : 'transparent'}` }}>
        {short[o] ?? o}
      </button>
    ))}
  </div>
);

/** PriFly deck call (BossPanels DeckBar): CLEAR / FOUL / AUTO. */
export const DeckCallSeg: React.FC<{ value: 'CLEAR' | 'FOUL' | 'AUTO'; onChange?: (v: 'CLEAR' | 'FOUL' | 'AUTO') => void }> = ({ value, onChange }) => (
  <div style={SEG} role="radiogroup" aria-label="Deck call">
    {(['CLEAR', 'FOUL'] as const).map((k) => {
      const on = value === k;
      return (
        <button key={k} role="radio" aria-checked={on} onClick={() => onChange?.(k)} style={{ border: 0, height: 34, padding: '0 16px', borderRadius: 4, fontSize: 15, fontWeight: 700, letterSpacing: '.06em', fontFamily: SAIRA, cursor: 'pointer', background: on ? (k === 'FOUL' ? '#E0524E' : '#40A85B') : 'transparent', color: on ? '#0E1116' : '#93A1B0' }}>
          {k}
        </button>
      );
    })}
    <button role="radio" aria-checked={value === 'AUTO'} onClick={() => onChange?.('AUTO')} style={{ border: 0, height: 34, padding: '0 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, fontFamily: MONO, cursor: 'pointer', background: value === 'AUTO' ? '#222C37' : 'transparent', color: value === 'AUTO' ? '#E6EDF3' : '#93A1B0' }}>
      AUTO
    </button>
  </div>
);

// ---------------------------------------------------------------- buttons

/** Header button (CatccApp `hdrBtn`: Reference, Displays, Options). */
export const hdrBtn = (on: boolean): React.CSSProperties => ({ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: on ? 'rgba(241,88,34,.18)' : '#0E1116', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', fontFamily: SAIRA, fontSize: 12.5, cursor: 'pointer' });
export const HeaderButton: React.FC<{ on?: boolean; icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void }> = ({ on = false, icon, children, onClick }) => (
  <button onClick={onClick} aria-pressed={on} style={hdrBtn(on)}>
    {icon}
    {children}
  </button>
);

export type ToolState = 'off' | 'on' | 'float' | 'open';
/**
 * Scope tool button (.tbtn). off / on: inside a toolbar (Scope tools, FinalView bolter / separation: on is
 * rgba(241,88,34,.18) with #FFB08F); float / open: a lone button over the scope (Frequencies, Layers,
 * Bullseye: rgba(21,26,33,.96) with a #374250 border, #3D2521 while its popover is open).
 */
export const toolStyle = (s: ToolState): React.CSSProperties =>
  s === 'on' ? { background: 'rgba(241,88,34,.18)', color: '#FFB08F' } : s === 'off' ? { background: 'transparent', color: '#E6EDF3' } : { background: s === 'open' ? '#3D2521' : 'rgba(21,26,33,.96)', color: s === 'open' ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' };
export const ToolButton: React.FC<{ state?: ToolState; label: string; children: React.ReactNode; onClick?: () => void }> = ({ state = 'off', label, children, onClick }) => (
  <button className="tbtn" aria-label={label} title={label} aria-pressed={state === 'on' || state === 'open'} onClick={onClick} style={toolStyle(state)}>
    {children}
  </button>
);

/** Scope / Final toolbar (Scope `role="toolbar"`). */
export const Toolbar: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <div role="toolbar" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'rgba(21,26,33,.96)', border: '1px solid #374250', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.45)' }}>
    {children}
  </div>
);
export const ToolDivider: React.FC = () => <div style={{ width: 1, height: 26, background: '#374250', margin: '0 4px' }} />;
/** Toolbar range readout (Scope: RNG between zoom buttons). */
export const RangeReadout: React.FC<{ nm: number }> = ({ nm }) => (
  <span className="mono" style={{ fontSize: 11, color: '#93A1B0', minWidth: 44, textAlign: 'center' }}>
    RNG <span style={{ color: '#E6EDF3', fontSize: 13 }}>{nm}</span>
  </span>
);

/** Range preset in a toolbar (FinalView 6 / 12 / 24 NM). */
export const RangeButton: React.FC<{ on: boolean; children: React.ReactNode; onClick?: () => void }> = ({ on, children, onClick }) => (
  <button aria-pressed={on} onClick={onClick} style={{ height: 32, padding: '0 9px', borderRadius: 5, border: `1px solid ${on ? '#F15822' : '#374250'}`, background: on ? 'rgba(241,88,34,.18)' : 'transparent', color: on ? '#FFB08F' : '#E6EDF3', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>
    {children}
  </button>
);

/** Projection-vector time in a toolbar (Scope / FinalView Vector: an unlit range preset showing the seconds; click steps 1 / 2 / 5 / 10 / 30). */
export const VectorButton: React.FC<{ s: number; onClick?: () => void }> = ({ s, onClick }) => (
  <button aria-label="Vector" title="Vector" onClick={onClick} style={{ height: 32, padding: '0 9px', borderRadius: 5, border: '1px solid #374250', background: 'transparent', color: '#E6EDF3', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>
    {s}s
  </button>
);

/** Small mono button (LayersPanel Reset / All on). */
export const SmallButton: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
  <button onClick={onClick} style={{ background: '#222C37', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '3px 8px', fontFamily: MONO, fontSize: 10.5, cursor: 'pointer' }}>
    {children}
  </button>
);

export type OutlineSize = 'md' | 'sm';
/** Outline button (Helm / Formation `BTN`: h 32, 12.5; Nav `BTN`: h 28, 12). */
export const OutlineButton: React.FC<{ size?: OutlineSize; children: React.ReactNode; onClick?: () => void }> = ({ size = 'md', children, onClick }) => (
  <button onClick={onClick} style={size === 'md' ? { height: 32, padding: '0 12px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: SAIRA, fontSize: 12.5, cursor: 'pointer' } : { height: 28, padding: '0 10px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: SAIRA, fontSize: 12, cursor: 'pointer' }}>
    {children}
  </button>
);

/** Toggle button (BossView `btn`: h 30; on is orange, disabled grey). */
export const ToggleButton: React.FC<{ on?: boolean; enabled?: boolean; children: React.ReactNode; onClick?: () => void }> = ({ on = false, enabled = true, children, onClick }) => (
  <button onClick={onClick} disabled={!enabled} aria-pressed={on} style={{ height: 30, padding: '0 10px', background: on ? 'rgba(241,88,34,.16)' : 'transparent', border: `1px solid ${on ? '#F15822' : '#374250'}`, borderRadius: 5, color: !enabled ? '#5E6A78' : on ? '#FFB08F' : '#E6EDF3', fontFamily: SAIRA, fontSize: 12.5, cursor: enabled ? 'pointer' : 'default' }}>
    {children}
  </button>
);

/** Inline row action (SidePanels `ibtn`: COMMIT / CLEAR), in the colour of what it does. */
export const RowAction: React.FC<{ color: string; disabled?: boolean; children: React.ReactNode; onClick?: () => void }> = ({ color, disabled, children, onClick }) => (
  <button onClick={onClick} disabled={disabled} className="mono" style={{ fontSize: 10, letterSpacing: '.06em', padding: '2px 7px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${color}`, background: 'transparent', color, opacity: disabled ? 0.4 : 1 }}>
    {children}
  </button>
);

/** Handoff action (Handoff.tsx `btn`): plain or amber (a handoff waiting on you). */
export const HandoffButton: React.FC<{ tone?: 'plain' | 'amber'; children: React.ReactNode; onClick?: () => void }> = ({ tone = 'plain', children, onClick }) => (
  <button onClick={onClick} style={{ height: 22, padding: '0 8px', borderRadius: 4, border: `1px solid ${tone === 'amber' ? '#E7B04F' : '#374250'}`, background: tone === 'amber' ? 'rgba(231,176,79,.12)' : 'transparent', color: tone === 'amber' ? '#E7B04F' : '#E6EDF3', fontFamily: SAIRA, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
    {children}
  </button>
);

/** Owner chip (Handoff.tsx `chip`): yours in orange, another seat's grey. */
export const OwnerChip: React.FC<{ mine?: boolean; children: React.ReactNode }> = ({ mine = false, children }) => (
  <span className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', padding: '1px 6px', borderRadius: 3, border: `1px solid ${mine ? '#F15822' : '#374250'}`, color: mine ? '#FFB08F' : '#93A1B0', background: mine ? 'rgba(241,88,34,.1)' : 'transparent', whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

/** Switch (Panels DisplaySettings `tog`). */
export const Switch: React.FC<{ on: boolean; onChange?: (on: boolean) => void; label?: string; disabled?: boolean }> = ({ on, onChange, label, disabled = false }) => (
  <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange?.(!on)} style={{ justifySelf: 'end', width: 40, height: 22, borderRadius: 11, border: `1px solid ${on ? '#F15822' : '#374250'}`, background: on ? 'rgba(241,88,34,.3)' : '#0E1116', position: 'relative', cursor: disabled ? 'default' : 'pointer', padding: 0 }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: on ? '#F15822' : '#5E6A78', transition: 'left .12s' }} />
  </button>
);

/** Select (the header's Ship select, DisplaySettings selects). */
export const selectStyle: React.CSSProperties = { background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '5px 8px', fontFamily: MONO, fontSize: 12.5 };
export const Select: React.FC<{ value: string; options: string[]; onChange?: (v: string) => void; label?: string }> = ({ value, options, onChange, label }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)} style={selectStyle}>
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

/** Layer checkbox (.lcb): the layer's colour, filled when on. */
export const LayerCheck: React.FC<{ on: boolean; color: string; onClick?: () => void; label?: string }> = ({ on, color, onClick, label }) => (
  <button className="lcb" onClick={onClick} aria-pressed={on} aria-label={label}>
    <span style={{ borderColor: color, background: on ? color : 'transparent' }} />
  </button>
);

/** LSO grade / wire button (.gb) and deviation button (.dv), LsoView. */
export const GradeButton: React.FC<{ on?: boolean; color?: string; children: React.ReactNode; onClick?: () => void }> = ({ on = false, color = '#E6EDF3', children, onClick }) => (
  <button className="gb" onClick={onClick} style={{ background: on ? color : '#1A212A', color: on ? '#0E1116' : '#E6EDF3', borderColor: on ? color : '#374250' }}>
    {children}
  </button>
);
export const DevButton: React.FC<{ on?: boolean; children: React.ReactNode; onClick?: () => void }> = ({ on = false, children, onClick }) => (
  <button className="dv" onClick={onClick} style={{ background: on ? 'rgba(241,88,34,.18)' : '#1A212A', color: on ? '#FFB08F' : '#E6EDF3', borderColor: on ? '#F15822' : '#374250' }}>
    {children}
  </button>
);

/** Comms script phase tab (.cc-tab, Panels CommsScripts). */
export const ScriptTab: React.FC<{ state: 'current' | 'done' | 'next'; children: React.ReactNode }> = ({ state, children }) => (
  <button className="cc-tab" style={{ borderLeftColor: state === 'current' ? '#F15822' : 'transparent', background: state === 'current' ? '#1A212A' : 'transparent', color: state === 'current' ? '#E6EDF3' : state === 'done' ? '#93A1B0' : '#C9D3DD' }}>
    {children}
  </button>
);

/** Boss chip (.chip). */
export const Chip: React.FC<{ color?: string; children: React.ReactNode }> = ({ color = '#E6EDF3', children }) => (
  <span className="chip" style={{ color }}>
    {children}
  </span>
);

// ---------------------------------------------------------------- header

/** Location logo (CatccApp `logo`). */
export const Logo: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ width: 28, height: 28, borderRadius: 5, background: '#F15822', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
    <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '.08em' }}>{text}</div>
  </div>
);

export type HolderDot = 'you' | 'other';
/** Seat / location tab (CatccApp `tabLink`), with the holder dot (`holderDot`). */
export const SeatTab: React.FC<{ on: boolean; dot?: HolderDot; children: React.ReactNode; onClick?: () => void }> = ({ on, dot, children, onClick }) => (
  <a
    href="#"
    aria-current={on ? 'page' : undefined}
    onClick={(e) => {
      e.preventDefault();
      onClick?.();
    }}
    style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: 4, background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', fontSize: 13, fontWeight: on ? 600 : 400 }}
  >
    {children}
    {dot && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle', background: dot === 'you' ? '#F15822' : '#3E9BD4' }} />}
  </a>
);
export const TabNav: React.FC<{ tabs: string[]; value: string; onChange?: (v: string) => void; dots?: Record<string, HolderDot>; label?: string }> = ({ tabs, value, onChange, dots, label }) => (
  <nav aria-label={label} style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 }}>
    {tabs.map((t) => (
      <SeatTab key={t} on={t === value} dot={dots?.[t]} onClick={() => onChange?.(t)}>
        {t}
      </SeatTab>
    ))}
  </nav>
);

/** Recovery case badge (CaseBadge.tsx): top of the right sidebar of the CATCC, PriFly, Bridge and LSO views. */
export const CaseBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(241,88,34,.15)', border: '1px solid #F15822', color: '#FFB08F', fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '.1em' }}>{children}</div>
);

export type SeatState = 'open' | 'mine' | 'other';
/** Seat pill (CatccApp `seatPill`): open (assume it), yours, or held by someone else. */
export const SeatPill: React.FC<{ state: SeatState; label: string; who?: string; init?: string; away?: boolean; onClick?: () => void }> = ({ state, label, who, init, away, onClick }) => {
  const st =
    state === 'open'
      ? { who: 'Open', init: '+', bs: 'dashed', bc: '#374250', bg: 'transparent', cur: 'pointer', as: 'dashed', ab: '#5E6A78', af: 'transparent', afg: '#93A1B0', whoFg: '#93A1B0' }
      : state === 'mine'
        ? { who: who ?? 'You', init: init ?? 'ME', bs: 'solid', bc: '#F15822', bg: 'rgba(241,88,34,.12)', cur: 'pointer', as: 'solid', ab: '#F15822', af: '#F15822', afg: '#0E1116', whoFg: '#FFB08F' }
        : { who: who ?? 'Held', init: init ?? '··', bs: 'solid', bc: '#374250', bg: '#1A212A', cur: 'default', as: 'solid', ab: '#3E9BD4', af: '#1F3A52', afg: '#CFE6F6', whoFg: '#C9D3DD' };
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 12px 0 4px', borderRadius: 19, border: `1px ${st.bs} ${st.bc}`, background: st.bg, cursor: st.cur, fontFamily: MONO, opacity: away ? 0.6 : 1 }}>
      <span style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px ${st.as} ${st.ab}`, background: st.af, color: st.afg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, flex: '0 0 28px' }}>{st.init}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
        <span style={{ fontSize: 10, letterSpacing: '.1em', color: '#93A1B0' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: st.whoFg, whiteSpace: 'nowrap' }}>{st.who}</span>
      </span>
    </button>
  );
};

/** VIEW ONLY chip (CatccApp, beside the seat pill when you hold no seat). */
export const ViewOnly: React.FC = () => <span className="mono" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #374250', color: '#93A1B0' }}>VIEW ONLY</span>;

export type FeedState = 'live' | 'idle' | 'down' | 'connecting';
const FEED_C: Record<FeedState, string> = { live: '#40A85B', idle: '#DE9A1F', down: '#FF8A85', connecting: '#93A1B0' };
/** Feed status (CatccApp `feed`): anything short of live pulses. */
export const FeedStatus: React.FC<{ state: FeedState; children: React.ReactNode }> = ({ state, children }) => {
  const live = state === 'live';
  const c = FEED_C[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11.5, color: '#93A1B0' }}>
      <span className={live ? undefined : 'cc-feed-alert'} style={{ width: 8, height: 8, borderRadius: '50%', background: c, color: c, flex: 'none' }} />
      <span className={live ? undefined : 'cc-feed-alert-text'} style={{ color: live ? undefined : c }}>
        {children}
      </span>
    </div>
  );
};

/** Local and Zulu clocks (CatccApp `aria-label="Time"`). */
export const Clocks: React.FC<{ local: string; zulu: string; offset?: string }> = ({ local, zulu, offset }) => (
  <div style={{ display: 'flex', gap: 14, fontFamily: MONO }} aria-label="Time">
    <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
      <div style={{ fontSize: 10, color: '#93A1B0', letterSpacing: '.12em' }}>LOCAL{offset ? ` · ${offset}` : ''}</div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{local}</div>
    </div>
    <div style={{ width: 1, background: '#374250' }} />
    <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
      <div style={{ fontSize: 10, color: '#93A1B0', letterSpacing: '.12em' }}>ZULU</div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{zulu}</div>
    </div>
  </div>
);

/** Header bar (CatccApp `headerStyle`). */
export const HeaderBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <header style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #262F3A', background: '#151A21', flex: 'none', overflowX: 'auto', whiteSpace: 'nowrap' }}>{children}</header>
);
/** View status bar under the header (CatccApp, PriFly / LSO). */
export const StatusBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid #262F3A', background: '#11161C', flex: 'none', overflowX: 'auto', whiteSpace: 'nowrap' }}>{children}</div>
);
export const Spacer: React.FC = () => <div style={{ flex: 1 }} />;

// ---------------------------------------------------------------- panels

/** Sidebar column (RadarView left / right aside, FinalView aside: 344 wide). */
export const Sidebar: React.FC<{ side?: 'left' | 'right'; width?: number; children: React.ReactNode }> = ({ side = 'right', width = 344, children }) => (
  <aside style={{ flex: `0 0 ${width}px`, width, [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, boxSizing: 'border-box' }}>{children}</aside>
);

/** Sidebar tabs (RadarView Info / Strips). */
export const SidebarTabs: React.FC<{ tabs: [string, string?][]; value: string; onChange?: (v: string) => void }> = ({ tabs, value, onChange }) => (
  <div role="tablist" style={{ display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2, flex: 'none' }}>
    {tabs.map(([l, n]) => (
      <button key={l} role="tab" aria-selected={value === l} onClick={() => onChange?.(l)} style={{ flex: 1, height: 30, border: 0, borderRadius: 4, background: value === l ? '#222C37' : 'transparent', color: value === l ? '#E6EDF3' : '#93A1B0', fontFamily: SAIRA, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {l}
        {n && <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: '#93A1B0' }}>{n}</span>}
      </button>
    ))}
  </div>
);

/** Panel (.pnl), as the sidebars stack them. */
export const Panel: React.FC<{ children: React.ReactNode; gap?: number; style?: React.CSSProperties; label?: string }> = ({ children, gap, style, label }) => (
  <section className="pnl" aria-label={label} style={{ ...(gap !== undefined ? { display: 'flex', flexDirection: 'column', gap } : {}), ...style }}>
    {children}
  </section>
);

/** Panel heading: label left, meta right (SidePanels DeckPanel / DonorsPanel / InterceptPanel). */
export const PanelHead: React.FC<{ label: React.ReactNode; meta?: React.ReactNode; metaColor?: string; labelColor?: string; children?: React.ReactNode }> = ({ label, meta, metaColor = '#93A1B0', labelColor, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span className="lbl" style={labelColor ? { color: labelColor } : undefined}>{label}</span>
    {meta !== undefined && <span className="mono" style={{ fontSize: 11, color: metaColor }}>{meta}</span>}
    {children}
  </div>
);

/** Section label (.lbl) on its own. */
export const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span className="lbl" style={style}>
    {children}
  </span>
);

/** Key / value row (.kv: InfoPanels; mono 12). */
export const Kv: React.FC<{ k: React.ReactNode; v: React.ReactNode }> = ({ k, v }) => (
  <div className="kv">
    <span>{k}</span>
    <span>{v}</span>
  </div>
);
/** Key / value row of the Approach / Final sidebar (FinalView `kv`; mono 12.5, gap 10). */
export const KvWide: React.FC<{ k: React.ReactNode; v: React.ReactNode }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: MONO, fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: '#93A1B0' }}>{k}</span>
    <span>{v}</span>
  </div>
);
/** Status row (SidePanels `row`: key mono 11 muted, value mono 12.5 in a status colour). */
export const StatusRow: React.FC<{ k: string; v: React.ReactNode; c?: string }> = ({ k, v, c = '#E6EDF3' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
    <span className="mono" style={{ color: '#93A1B0', fontSize: 11 }}>{k}</span>
    <span className="mono" style={{ color: c, textAlign: 'right' }}>{v}</span>
  </div>
);

/** Headline figure (InfoPanels: .lbl over mono 20 / 600, optional unit). */
export const Figure: React.FC<{ label: string; value: React.ReactNode; unit?: string; color?: string }> = ({ label, value, unit, color }) => (
  <div>
    <div className="lbl">{label}</div>
    <div className="mono" style={{ fontSize: 20, fontWeight: 600, color }}>
      {value}
      {unit && <span style={{ fontSize: 11, color: '#93A1B0' }}> {unit}</span>}
    </div>
  </div>
);
/** Three figures across (InfoPanels .stat3). */
export const Figures: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="stat3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
    {children}
  </div>
);

/** Deck banner (SidePanels DeckPanel). */
export const DeckBanner: React.FC<{ foul: boolean }> = ({ foul }) => (
  <div style={{ padding: '8px 10px', borderRadius: 5, textAlign: 'center', background: foul ? 'rgba(224,82,78,.2)' : 'rgba(64,168,91,.2)', border: `1px solid ${foul ? '#E0524E' : '#40A85B'}`, color: foul ? '#FF9C98' : '#8FE0A6', fontFamily: MONO, fontWeight: 600, fontSize: 13, letterSpacing: '.12em' }}>{foul ? 'FOUL DECK' : 'CLEAR DECK'}</div>
);
/** Deck chip (InfoPanels ship data). */
export const DeckChip: React.FC<{ foul: boolean }> = ({ foul }) => (
  <span className="mono" style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '2px 7px', borderRadius: 3, background: foul ? 'rgba(224,82,78,.16)' : 'rgba(64,168,91,.18)', color: foul ? '#FF9C98' : '#7FD397', fontWeight: 600 }}>{foul ? 'DECK FOUL' : 'DECK CLEAR'}</span>
);
/** Deck status badge of the LSO status bar (CatccApp). */
export const DeckBadge: React.FC<{ foul: boolean }> = ({ foul }) => (
  <div style={{ padding: '4px 12px', borderRadius: 5, background: foul ? 'rgba(224,82,78,.2)' : 'rgba(64,168,91,.2)', border: `1px solid ${foul ? '#E0524E' : '#40A85B'}`, color: foul ? '#FF9C98' : '#8FE0A6', fontFamily: MONO, fontWeight: 600, fontSize: 12.5, letterSpacing: '.12em' }}>{foul ? 'FOUL DECK' : 'CLEAR DECK'}</div>
);

/** Approach / Final deck status panel (FinalView `aria-label="Deck status"`): CLEAR or FOUL only, one-line header (the callsign gives way), constant height. */
export const DeckStatusPanel: React.FC<{ foul: boolean; next?: { id: string; at: string }; rows: [string, string][] }> = ({ foul, next, rows }) => (
  <section className="pnl" aria-label="Deck status" style={{ borderColor: foul ? '#E0524E' : '#2E5E3A', background: foul ? 'rgba(224,82,78,.08)' : 'rgba(64,168,91,.06)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span className="lbl" style={{ color: foul ? '#FF8A85' : '#7FD397' }}>Deck</span>
      {next && (
        <span className="mono" style={{ display: 'flex', minWidth: 0, gap: '1ch', whiteSpace: 'nowrap', fontSize: 11.5, color: foul ? '#FF8A85' : '#93A1B0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.id}</span>
          <span>{next.at}</span>
        </span>
      )}
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.04em', color: foul ? '#FF8A85' : '#7FD397', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{foul ? 'FOUL' : 'CLEAR'}</div>
    {rows.map(([k, v]) => (
      <KvWide key={k} k={k} v={v} />
    ))}
  </section>
);

/** An aircraft in ACLS coverage with its mode (FinalView Landing aids `locks`). */
export const AclsRow: React.FC<{ id: string; state: 'LOCK-ON' | 'ACQUIRING'; mode: string; onMode?: (m: string) => void }> = ({ id, state, mode, onMode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '4px 0' }}>
    <span className="mono" style={{ fontSize: 12 }}>
      <b>{id}</b> <span style={{ color: state === 'LOCK-ON' ? '#7FD397' : '#E7B04F' }}>{state}</span>
    </span>
    <Segmented size="xs" options={['I', 'IA', 'II', 'III']} value={mode} onChange={onMode} />
  </div>
);

/** Approach / Final sequence card (FinalView Sequence). */
export const SequenceCard: React.FC<{ id: string; sub: string; fuel: string; low?: boolean; where: string; pending?: boolean; children?: React.ReactNode }> = ({ id, sub, fuel, low, where, pending, children }) => (
  <div style={{ padding: '6px 8px', marginTop: 4, border: `1px solid ${pending ? '#E7B04F' : '#262F3A'}`, borderRadius: 5, background: '#1A212A' }}>
    <div className="mono" style={{ fontSize: 12 }}>
      <div>
        <b>{id}</b> <span style={{ color: '#93A1B0' }}>{sub}</span> <span style={{ color: low ? '#E7B04F' : '#E6EDF3' }}>{fuel}</span>
      </div>
      <div style={{ color: '#93A1B0' }}>{where}</div>
    </div>
    {children}
  </div>
);

/** Empty state line (`#6B7683`, mono 11.5: "No threat contacts", "No arrivals"). */
export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>
    {children}
  </div>
);

export type NoteKind = 'conflict' | 'handoff' | 'warn' | 'coord' | 'info';
/** Notification card colours (Panels `KINDS`). */
export const NOTE_KINDS: Record<NoteKind, { fg: string; bc: string; bg: string }> = {
  conflict: { fg: '#FF8A85', bc: '#E0524E', bg: 'rgba(224,82,78,.10)' },
  handoff: { fg: '#E7B04F', bc: '#E7B04F', bg: 'rgba(231,176,79,.10)' },
  warn: { fg: '#E7B04F', bc: '#8A6A2A', bg: 'rgba(222,154,31,.07)' },
  coord: { fg: '#6FB6E6', bc: '#2F5F80', bg: 'rgba(62,155,212,.07)' },
  info: { fg: '#93A1B0', bc: '#262F3A', bg: '#1A212A' },
};

/** Notification card (Panels Notifications `article`): go-to button, kind and time, title, Ack or an action. */
export const NoteCard: React.FC<{ kind: NoteKind; label: string; time: string; title: string; body?: string; action?: string }> = ({ kind, label, time, title, body, action }) => {
  const k = NOTE_KINDS[kind];
  return (
    <article style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, border: `1px solid ${k.bc}`, background: k.bg }}>
      <button aria-label="Go to on scope" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'transparent', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, cursor: 'pointer', flex: '0 0 30px' }}>
        <IcGoTo />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 600, color: k.fg }}>{label}</span>
          <span className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>{time}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {body && <div className="mono" style={{ fontSize: 11.5, color: '#FFC2BF' }}>{body}</div>}
      </div>
      <button style={{ height: 30, padding: '0 10px', background: action ? 'rgba(231,176,79,.12)' : 'transparent', color: action ? '#E7B04F' : '#E6EDF3', border: `1px solid ${action ? '#E7B04F' : '#374250'}`, borderRadius: 4, fontFamily: SAIRA, fontSize: 12, cursor: 'pointer' }}>{action ?? 'Ack'}</button>
    </article>
  );
};

/** Layers popover row (.lrow): name, this carrier's box, the other carriers' box (blue). */
export const LayerRow: React.FC<{ label: string; color: string; on: boolean; on2?: boolean | null }> = ({ label, color, on, on2 = null }) => (
  <div className="lrow" style={{ color: on || on2 ? '#E6EDF3' : '#93A1B0', ...(on2 === null ? { gridTemplateColumns: 'minmax(0, 1fr) 52px' } : {}) }}>
    <span style={{ paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <LayerCheck on={on} color={color} label={label} />
    {on2 !== null && <LayerCheck on={on2} color="#3E9BD4" label={`${label} · other`} />}
  </div>
);

/** Popover shell (LayersPanel / FinalView layers). */
export const Popover: React.FC<{ width?: number; children: React.ReactNode }> = ({ width = 290, children }) => (
  <section style={{ width, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>{children}</section>
);

/** Frequency row (.frow / .fch, Panels FreqPanel): name, frequency, the channel under PRI or AUX, a KY fill in green. */
export const FreqRow: React.FC<{ name: string; freq: string; chan: string; radio?: 'PRI' | 'AUX'; fill?: string }> = ({ name, freq, chan, radio = 'PRI', fill }) => {
  const ch = (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span className="fch" style={{ display: 'block', ...(fill ? { borderColor: '#40A85B' } : {}) }}>{chan}</span>
      {fill && <span style={{ position: 'absolute', left: '100%', top: 0, height: 18, lineHeight: '18px', marginLeft: 3, color: '#40A85B', fontWeight: 600, fontSize: 11 }}>{fill}</span>}
    </span>
  );
  const none = <span style={{ color: '#4A5562' }}>—</span>;
  return (
    <div className="frow">
      <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <span style={{ textAlign: 'right' }}>{freq}</span>
      {radio === 'PRI' ? ch : none}
      {radio === 'AUX' ? ch : none}
    </div>
  );
};

export type EvState = 'now' | 'next' | 'done' | 'later';
/** PriFly event row (.ev, BossView air plan). */
export const EventRow: React.FC<{ state: EvState; cells: [string, string, string, string] }> = ({ state, cells }) => (
  <div className="ev" style={{ background: state === 'now' ? 'rgba(241,88,34,.14)' : state === 'next' ? '#1A212A' : 'transparent', border: `1px solid ${state === 'now' ? '#F15822' : '#262F3A'}`, color: state === 'done' ? '#93A1B0' : '#E6EDF3', marginTop: 4 }}>
    {cells.map((c, i) => (
      <span key={i} style={i === 0 ? { fontWeight: 600 } : i === 3 ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}>
        {c}
      </span>
    ))}
  </div>
);
export const EventHead: React.FC<{ cells: [string, string, string, string] }> = ({ cells }) => (
  <div className="ev" style={{ color: '#93A1B0', fontSize: 10.5, letterSpacing: '.08em' }}>
    {cells.map((c, i) => (
      <span key={i}>{c}</span>
    ))}
  </div>
);

/** Catapult status chip (BossPanels `CAT_STATUS`). */
export const CAT_STATUS = {
  ready: { l: 'READY', fg: '#7FD397', bg: 'rgba(127,211,151,.14)' },
  hold: { l: 'HOLD', fg: '#E7B04F', bg: 'rgba(231,176,79,.16)' },
  suspended: { l: 'SUSPEND', fg: '#FF8A85', bg: 'rgba(224,82,78,.16)' },
  down: { l: 'DOWN', fg: '#93A1B0', bg: '#222C37' },
} as const;

// ---------------------------------------------------------------- dialogs

/** Dialog frame (OptionsDialog): title bar with close, body with 16 padding. Rendered in place (no scrim) for sketching. */
export const DialogFrame: React.FC<{ title: string; width?: number; children: React.ReactNode; onClose?: () => void }> = ({ title, width = 620, children, onClose }) => (
  <div role="dialog" aria-label={title} style={{ width, maxWidth: '100%', background: '#151A21', border: '1px solid #374250', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #262F3A' }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
      <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 0, color: '#93A1B0', fontSize: 18, cursor: 'pointer' }}>
        ×
      </button>
    </div>
    <div style={{ padding: 16 }}>{children}</div>
  </div>
);

/** A setting row of a dialog (DisplaySettings `tog` / `sel`): name and hint left, control right. */
export const SettingRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 14, alignItems: 'center', padding: '8px 0' }}>
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
      {hint && <div className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{hint}</div>}
    </div>
    <div style={{ justifySelf: 'end' }}>{children}</div>
  </div>
);

/** Option card (OptionsDialog `opt`): a radio choice with a title and hint. */
export const OptionCard: React.FC<{ on: boolean; title: string; hint: string; children?: React.ReactNode; onClick?: () => void }> = ({ on, title, hint, children, onClick }) => (
  <button role="radio" aria-checked={on} onClick={onClick} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 6, border: `1px solid ${on ? '#F15822' : '#374250'}`, background: on ? 'rgba(241,88,34,.12)' : '#0E1116', color: '#E6EDF3', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
    <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{hint}</span>
    {children}
  </button>
);
