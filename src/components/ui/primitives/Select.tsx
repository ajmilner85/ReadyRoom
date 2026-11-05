import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Floating, Placement } from './Floating';
import { Icon, IconName } from './Icon';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: React.ReactNode;
  /** Text used for type-ahead filtering when label is not a string. */
  searchText?: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps<V extends string | number = string> {
  value: V | null | undefined;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  placeholder?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Show a filter box when there are many options (default: > 10). */
  searchable?: boolean;
  size?: 'sm' | 'md';
  mono?: boolean;
  /** Width of the popover; defaults to trigger width. */
  menuWidth?: number;
  invalid?: boolean;
  id?: string;
}

/** Select / dropdown with animated chevron and popover list. */
export function Select<V extends string | number = string>({
  value, onChange, options, placeholder = 'Select…', disabled, className, searchable, size = 'md', mono, menuWidth, invalid, id,
}: SelectProps<V>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find(o => o.value === value);
  const showSearch = searchable ?? options.length > 10;

  const filtered = useMemo(() => {
    if (!q) return options;
    const needle = q.toLowerCase();
    return options.filter(o => {
      const t = o.searchText ?? (typeof o.label === 'string' ? o.label : String(o.value));
      return t.toLowerCase().includes(needle);
    });
  }, [options, q]);

  let lastGroup: string | undefined;

  return (
    <>
      <button
        id={id}
        ref={setAnchor}
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className={clsx(
          'w-full flex items-center justify-between gap-2 rounded-rr-ctl bg-panel2 border text-left cursor-pointer',
          'transition-[border-color] duration-150 hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border2',
          invalid ? 'border-bad' : open ? 'border-accent' : 'border-border2',
          size === 'sm' ? 'px-[10px] py-[5px] text-[12.5px] min-h-[30px]' : 'px-3 py-[8px] text-[13px] min-h-[36px]',
          mono && 'font-mono',
          className,
        )}
      >
        <span className={clsx('flex items-center gap-2 min-w-0 truncate', !current && 'text-text3')}>
          {current?.icon}
          <span className="truncate">{current ? current.label : placeholder}</span>
        </span>
        <span className="text-text3 flex transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <Icon name="chevronDown" size={14} />
        </span>
      </button>
      <Floating
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        matchWidth={!menuWidth}
        style={menuWidth ? { width: menuWidth } : undefined}
        className="bg-panel border border-border2 rounded-rr-ctl shadow-rr-lg overflow-hidden"
      >
        {showSearch ? (
          <div className="p-[6px] border-b border-border">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter…"
              className="w-full px-2 py-[5px] text-[12.5px] rounded-rr-md bg-panel2 border border-border2 text-text placeholder:text-text3 focus:outline-none focus:border-accent"
            />
          </div>
        ) : null}
        <div className="max-h-[300px] overflow-y-auto py-[2px]" role="listbox">
          {filtered.length === 0 ? <div className="px-3 py-2 text-[12.5px] text-text3">No matches</div> : null}
          {filtered.map(o => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const selected = o.value === value;
            return (
              <React.Fragment key={String(o.value)}>
                {header ? <div className="px-3 pt-2 pb-1 rr-label">{header}</div> : null}
                <div
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled}
                  onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false); }}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 text-[13px]',
                    o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-panel2',
                    selected && 'bg-panel2',
                    mono && 'font-mono',
                  )}
                >
                  {o.icon}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.description ? <div className="text-[11.5px] text-text2 truncate">{o.description}</div> : null}
                  </div>
                  {selected ? <span className="text-accent flex"><Icon name="check" size={14} /></span> : null}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Floating>
    </>
  );
}

export interface MenuItem {
  label: React.ReactNode;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render a divider above this item. */
  divider?: boolean;
  hint?: React.ReactNode;
}

/** Popover menu (icon + label rows; destructive item in --rr-bad). */
export const PopoverMenu: React.FC<{
  trigger: (props: { ref: (el: HTMLElement | null) => void; onClick: () => void; open: boolean }) => React.ReactNode;
  items: MenuItem[];
  placement?: Placement;
  width?: number;
}> = ({ trigger, items, placement = 'bottom-start', width = 210 }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger({ ref: setAnchor, onClick: () => setOpen(o => !o), open })}
      <Floating
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        placement={placement}
        offset={6}
        style={{ width }}
        className="p-[5px] rounded-[9px] bg-panel border border-border2 shadow-rr-lg"
      >
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {it.divider ? <div className="h-px bg-border my-[4px] mx-[4px]" /> : null}
            <div
              role="menuitem"
              aria-disabled={it.disabled}
              onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect(); }}
              className={clsx(
                'flex items-center gap-[9px] px-[9px] py-[7px] rounded-rr-md text-[13px]',
                it.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-panel2',
                it.danger ? 'text-bad' : 'text-text',
              )}
            >
              {it.icon ? <Icon name={it.icon} size={16} /> : null}
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              {it.hint ? <span className="text-[11px] text-text3">{it.hint}</span> : null}
            </div>
          </React.Fragment>
        ))}
      </Floating>
    </>
  );
};
