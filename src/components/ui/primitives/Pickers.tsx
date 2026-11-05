import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Floating } from './Floating';
import { Icon } from './Icon';
import { Checkbox } from './Controls';
import { tagBase, tagForeground } from './color';

/*
 * Pickers carried over from the legacy roster FilterDrawer / MultiSelectDropdown and
 * StyledSelect, restyled to the UI Kit. Use them anywhere a list of options needs a
 * leading visual: squadron insignia, qualification tag, status dot, role swatch.
 */

/* ------------------------------------------------------------------ */
/* Leading visuals                                                     */
/* ------------------------------------------------------------------ */

/** Squadron insignia, or a neutral placeholder tile (e.g. "Unassigned"). */
export const SquadronMark: React.FC<{ url?: string | null; size?: number; title?: string; className?: string }> = ({ url, size = 20, title, className }) =>
  url ? (
    <img src={url} alt="" title={title} className={clsx('flex-none object-contain', className)} style={{ width: size, height: size }} />
  ) : (
    <span
      title={title}
      className={clsx('flex-none rounded-rr-sm bg-panel3 border border-border2 flex items-center justify-center text-text3', className)}
      style={{ width: size, height: size }}
    >
      <Icon name="minus" size={Math.round(size * 0.55)} />
    </span>
  );

/**
 * Qualification code chip in the admin-configured colour (tinted, readable in both themes).
 * QualificationBadge renders this, so lists, filters and pickers match the roster.
 */
export const QualTag: React.FC<{ code: string; color?: string | null; size?: 'xs' | 'sm' | 'md'; title?: string; className?: string; children?: React.ReactNode; /** Fixed min width so labels align in lists. */ minWidth?: number }> = ({
  code, color, size = 'md', title, className, children, minWidth,
}) => {
  const raw = color || '#646F7E';
  const c = tagBase(raw);
  const dims = size === 'xs'
    ? { h: 14, minW: 20, px: 4, fs: 8.5, r: 3 }
    : size === 'sm'
      ? { h: 16, minW: 24, px: 5, fs: 9.5, r: 4 }
      : { h: 20, minW: 30, px: 7, fs: 10, r: 5 };
  return (
    <span
      title={title}
      className={clsx('inline-flex items-center justify-center gap-[3px] flex-none whitespace-nowrap font-mono font-semibold leading-none', className)}
      style={{
        height: dims.h, minWidth: minWidth ?? dims.minW, padding: `0 ${dims.px}px`, borderRadius: dims.r, fontSize: dims.fs,
        background: `color-mix(in srgb, ${c} 18%, transparent)`,
        color: tagForeground(raw),
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 30%, transparent)`,
      }}
    >
      {code}
      {children}
    </span>
  );
};

/** Small coloured dot (status) or square (role) marker. */
export const Swatch: React.FC<{ color: string; shape?: 'dot' | 'square'; size?: number }> = ({ color, shape = 'dot', size = 9 }) => (
  <span className="flex-none inline-block" style={{ width: size, height: size, background: color, borderRadius: shape === 'dot' ? '50%' : 2 }} />
);

/* ------------------------------------------------------------------ */
/* Option list (multi-select or include/exclude)                       */
/* ------------------------------------------------------------------ */
export interface PickerOption {
  id: string;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  /** Insignia / QualTag / Swatch… */
  leading?: React.ReactNode;
  count?: number;
  disabled?: boolean;
  /** Used for filtering when label isn't a string. */
  searchText?: string;
}

export type TriMode = 'include' | 'exclude';

/** Include / exclude / off indicator (qualification filters). */
export const TriStateMark: React.FC<{ mode?: TriMode }> = ({ mode }) => {
  if (mode === 'include') {
    return (
      <span className="flex-none w-[17px] h-[17px] rounded-[5px] flex items-center justify-center text-white" style={{ background: 'var(--rr-accent)', border: '1.5px solid var(--rr-accent)' }}>
        <Icon name="check" size={12} stroke={2.6} />
      </span>
    );
  }
  if (mode === 'exclude') {
    return (
      <span className="flex-none w-[17px] h-[17px] rounded-[5px] flex items-center justify-center text-white" style={{ background: 'var(--rr-bad)', border: '1.5px solid var(--rr-bad)' }}>
        <Icon name="close" size={11} stroke={2.6} />
      </span>
    );
  }
  return <span className="flex-none w-[17px] h-[17px] rounded-[5px]" style={{ border: '1.5px solid var(--rr-border2)' }} />;
};

interface OptionListBase {
  options: PickerOption[];
  title?: React.ReactNode;
  /** Show All / None buttons in the header (default true when title is set). */
  bulkActions?: boolean;
  /** Show a filter box (default: > 12 options). */
  searchable?: boolean;
  maxHeight?: number;
  /** Bordered frame (default true). */
  framed?: boolean;
  className?: string;
  emptyText?: React.ReactNode;
}

export type OptionListProps =
  | (OptionListBase & { mode?: 'multi'; selected: string[]; onChange: (ids: string[]) => void })
  | (OptionListBase & { mode: 'tri'; selected: Record<string, TriMode>; onChange: (v: Record<string, TriMode>) => void })
  | (OptionListBase & { mode: 'single'; selected: string | null; onChange: (id: string) => void });

/**
 * Option list with leading visuals and counts. `multi` = checkboxes, `tri` = click cycles
 * off → include → exclude → off, `single` = one selected row.
 */
export const OptionList: React.FC<OptionListProps> = props => {
  const { options, title, bulkActions, searchable, maxHeight = 300, framed = true, className, emptyText = 'No options' } = props;
  const [q, setQ] = useState('');
  const showSearch = searchable ?? options.length > 12;
  const filtered = useMemo(() => {
    if (!q) return options;
    const n = q.toLowerCase();
    return options.filter(o => (o.searchText ?? (typeof o.label === 'string' ? o.label : o.id)).toLowerCase().includes(n));
  }, [options, q]);

  const stateOf = (id: string): { on: boolean; tri?: TriMode } => {
    if (props.mode === 'tri') return { on: !!props.selected[id], tri: props.selected[id] };
    if (props.mode === 'single') return { on: props.selected === id };
    return { on: props.selected.includes(id) };
  };

  const toggle = (id: string) => {
    if (props.mode === 'tri') {
      const cur = props.selected[id];
      const next = { ...props.selected };
      if (!cur) next[id] = 'include';
      else if (cur === 'include') next[id] = 'exclude';
      else delete next[id];
      props.onChange(next);
    } else if (props.mode === 'single') {
      props.onChange(id);
    } else {
      props.onChange(props.selected.includes(id) ? props.selected.filter(x => x !== id) : [...props.selected, id]);
    }
  };

  const selectAll = () => {
    const ids = options.filter(o => !o.disabled).map(o => o.id);
    if (props.mode === 'tri') props.onChange(Object.fromEntries(ids.map(id => [id, 'include' as TriMode])));
    else if (props.mode !== 'single') props.onChange(ids);
  };
  const selectNone = () => {
    if (props.mode === 'tri') props.onChange({});
    else if (props.mode !== 'single') props.onChange([]);
  };
  const showBulk = (bulkActions ?? !!title) && props.mode !== 'single';

  return (
    <div className={clsx('min-w-0', className)}>
      {title !== undefined || showBulk ? (
        <div className="flex items-center gap-2 mb-2">
          {title !== undefined ? <span className="rr-label">{title}</span> : null}
          <span className="flex-1" />
          {showBulk ? (
            <>
              <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-text2 hover:text-accent bg-transparent border-0 cursor-pointer px-1">All</button>
              <button type="button" onClick={selectNone} className="text-[11px] font-semibold text-text2 hover:text-bad bg-transparent border-0 cursor-pointer px-1">None</button>
            </>
          ) : null}
        </div>
      ) : null}
      <div className={clsx(framed && 'border border-border2 rounded-rr-lg bg-panel2', 'overflow-hidden')}>
        {showSearch ? (
          <div className="p-[6px] border-b border-border">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter…"
              className="w-full px-2 py-[5px] text-[12.5px] rounded-rr-md bg-panel border border-border2 text-text placeholder:text-text3 focus:outline-none focus:border-accent"
            />
          </div>
        ) : null}
        <div className="overflow-y-auto p-1" style={{ maxHeight }} role="listbox" aria-multiselectable={props.mode !== 'single'}>
          {filtered.length === 0 ? <div className="px-2 py-2 text-[12px] text-text3">{emptyText}</div> : null}
          {filtered.map(o => {
            const st = stateOf(o.id);
            const rowBg = st.tri === 'exclude' ? 'rgba(224,82,78,.12)' : st.on ? 'var(--rr-accent-weak)' : undefined;
            return (
              <div
                key={o.id}
                role="option"
                aria-selected={st.on}
                aria-disabled={o.disabled}
                onClick={() => !o.disabled && toggle(o.id)}
                className={clsx(
                  'flex items-center gap-[9px] px-2 py-[6px] rounded-rr-md text-[13px] transition-colors duration-150',
                  o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                  !st.on && !o.disabled && 'hover:bg-panel3',
                )}
                style={{ background: rowBg }}
              >
                {props.mode === 'tri' ? <TriStateMark mode={st.tri} /> : props.mode === 'single' ? null : <Checkbox size={16} checked={st.on} onChange={() => toggle(o.id)} />}
                {o.leading}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text" style={{ fontWeight: st.on ? 600 : 500 }}>{o.label}</div>
                  {o.sublabel ? <div className="truncate text-[11px] text-text2">{o.sublabel}</div> : null}
                </div>
                {o.count !== undefined ? <span className="font-mono text-[10.5px] text-text2 flex-none">{o.count}</span> : null}
                {props.mode === 'single' && st.on ? <span className="text-accent flex"><Icon name="check" size={14} /></span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Multi-select dropdown                                               */
/* ------------------------------------------------------------------ */
export interface MultiSelectProps {
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Field label above the trigger. */
  label?: React.ReactNode;
  /** Trigger text when nothing is selected (default "All"). */
  placeholder?: string;
  /** Text-only name for summaries (defaults to string labels). */
  nameOf?: (o: PickerOption) => string;
  size?: 'sm' | 'md';
  className?: string;
  menuWidth?: number;
  disabled?: boolean;
}

/** Dropdown whose trigger summarises the selection; opens an OptionList with All/None. */
export const MultiSelect: React.FC<MultiSelectProps> = ({
  options, selected, onChange, label, placeholder = 'All', nameOf, size = 'md', className, menuWidth, disabled,
}) => {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const name = (o: PickerOption) => nameOf?.(o) ?? (typeof o.label === 'string' ? o.label : o.id);
  const chosen = options.filter(o => selected.includes(o.id));
  const summary = chosen.length === 0 ? placeholder : chosen.length <= 2 ? chosen.map(name).join(', ') : `${chosen.length} selected`;
  return (
    <div className={clsx('min-w-0', className)}>
      {label ? <div className="rr-label mb-[6px]">{label}</div> : null}
      <button
        ref={setAnchor}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-2 rounded-rr-ctl bg-panel2 border text-left cursor-pointer transition-[border-color] duration-150 hover:border-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open ? 'border-accent' : 'border-border2',
          size === 'sm' ? 'px-[10px] py-[5px] text-[12.5px] min-h-[30px]' : 'px-3 py-[8px] text-[13px] min-h-[36px]',
        )}
      >
        <span className="flex items-center gap-[6px] min-w-0">
          {chosen.slice(0, 3).map(o => <React.Fragment key={o.id}>{o.leading}</React.Fragment>)}
          <span className={clsx('truncate', chosen.length === 0 && 'text-text2')}>{summary}</span>
        </span>
        <span className="flex items-center gap-[6px] flex-none">
          {chosen.length > 0 ? (
            <span className="min-w-[18px] h-[18px] px-[5px] rounded-[9px] bg-accent text-white text-[10.5px] font-bold inline-flex items-center justify-center">{chosen.length}</span>
          ) : null}
          <span className="text-text3 flex transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
            <Icon name="chevronDown" size={14} />
          </span>
        </span>
      </button>
      <Floating
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        matchWidth={!menuWidth}
        style={menuWidth ? { width: menuWidth } : undefined}
        className="bg-panel border border-border2 rounded-rr-lg shadow-rr-lg p-2"
      >
        <OptionList mode="multi" options={options} selected={selected} onChange={onChange} bulkActions framed={false} maxHeight={280} />
      </Floating>
    </div>
  );
};
