import React, { useState } from 'react';
import clsx from 'clsx';
import aircraftMaskUrl from '../../../assets/aircraft-mask.png';
import { Icon, IconName } from './Icon';
import { Button, IconButton } from './Button';

/* ------------------------------------------------------------------ */
/* Pane — the basic surface (10px radius, 1px border, subtle shadow)   */
/* ------------------------------------------------------------------ */
export interface PaneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  /** Controls right-aligned in the header. */
  actions?: React.ReactNode;
  /** Content between title and actions (e.g. counts, spinners). */
  meta?: React.ReactNode;
  /** Body scrolls internally (default true). */
  scroll?: boolean;
  /** Remove body padding. */
  flush?: boolean;
  bodyClassName?: string;
  headerClassName?: string;
}

export const Pane = React.forwardRef<HTMLDivElement, PaneProps>(
  ({ title, actions, meta, scroll = true, flush, className, bodyClassName, headerClassName, children, ...rest }, ref) => (
    <div ref={ref} className={clsx('flex flex-col min-h-0 min-w-0 bg-panel border border-border rounded-rr-xl shadow-rr', className)} {...rest}>
      {title !== undefined || actions ? (
        <div className={clsx('flex-none flex items-center gap-[10px] min-h-[46px] px-[14px] py-2 border-b border-border', headerClassName)}>
          {title !== undefined ? <div className="rr-pane-title whitespace-nowrap">{title}</div> : null}
          {meta ? <div className="flex items-center gap-2 min-w-0 text-[11.5px] text-text2">{meta}</div> : null}
          <div className="flex-1" />
          {actions ? <div className="flex items-center gap-[6px] flex-none">{actions}</div> : null}
        </div>
      ) : null}
      <div className={clsx('flex-1 min-h-0', scroll && 'overflow-auto', !flush && 'p-[14px]', bodyClassName)}>{children}</div>
    </div>
  ),
);
Pane.displayName = 'Pane';

/** Mono section label used inside panes ("SQUADRON PALETTES", "ON PUBLISH"…). */
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string; right?: React.ReactNode }> = ({ children, className, right }) => (
  <div className={clsx('flex items-center gap-2 mb-[9px]', className)}>
    <span className="font-mono text-[10px] tracking-[.14em] text-text2 uppercase">{children}</span>
    {right ? <span className="ml-auto">{right}</span> : null}
  </div>
);

/** Page body: fills the workspace below the tab bar; no page scroll on desktop. */
export const PageBody: React.FC<{ children: React.ReactNode; className?: string; row?: boolean; style?: React.CSSProperties }> = ({ children, className, row, style }) => (
  <div data-m={row ? 'row' : undefined} className={clsx('flex-1 min-h-0 p-[14px] gap-[14px]', row ? 'flex' : 'flex flex-col', className)} style={style}>
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Aircraft icon (CSS mask so it takes currentColor / squadron colour) */
/* ------------------------------------------------------------------ */
export const AircraftIcon: React.FC<{ color?: string; width?: number; height?: number; className?: string; style?: React.CSSProperties; title?: string; block?: boolean }> = ({
  color = 'currentColor', width = 20, height = 26, className, style, title, block,
}) => (
  <span
    title={title}
    aria-hidden={title ? undefined : true}
    className={clsx(block ? 'block' : 'inline-block', 'flex-none', className)}
    style={{
      width, height, background: color,
      WebkitMask: `url("${aircraftMaskUrl}") center/contain no-repeat`,
      mask: `url("${aircraftMaskUrl}") center/contain no-repeat`,
      ...style,
    }}
  />
);

/* ------------------------------------------------------------------ */
/* Empty state — greyscale masked aircraft, never an emoji              */
/* ------------------------------------------------------------------ */
export const EmptyState: React.FC<{
  title: React.ReactNode;
  message?: React.ReactNode;
  icon?: IconName;
  action?: { label: string; onClick: () => void; icon?: IconName };
  className?: string;
  compact?: boolean;
}> = ({ title, message, icon, action, className, compact }) => (
  <div className={clsx('flex flex-col items-center text-center', compact ? 'py-4' : 'py-8', className)}>
    <div className="w-[46px] h-[46px] rounded-rr-2xl bg-panel2 border border-border2 flex items-center justify-center text-text3">
      {icon ? <Icon name={icon} size={22} /> : <AircraftIcon width={26} height={30} color="var(--rr-text3)" />}
    </div>
    <div className="text-[14px] font-semibold mt-[11px] text-text">{title}</div>
    {message ? <div className="text-[12px] text-text2 mt-[3px] max-w-[340px]">{message}</div> : null}
    {action ? (
      <Button variant="primary" size="sm" icon={action.icon ?? 'plus'} className="mt-3" onClick={action.onClick}>{action.label}</Button>
    ) : null}
  </div>
);

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */
export const StatTile: React.FC<{ value: React.ReactNode; label: React.ReactNode; color?: string; className?: string; sub?: React.ReactNode; onClick?: () => void }> = ({
  value, label, color, className, sub, onClick,
}) => (
  <div
    onClick={onClick}
    className={clsx(
      'px-2 py-3 rounded-rr-lg bg-panel2 border border-border text-center transition-[transform,border-color,box-shadow] duration-150',
      'hover:-translate-y-[3px] hover:border-accent hover:shadow-rr-lg',
      onClick ? 'cursor-pointer' : 'cursor-default',
      className,
    )}
  >
    <div className="text-[24px] font-bold leading-none" style={{ color: color ?? 'var(--rr-text)' }}>{value}</div>
    <div className="text-[9px] font-semibold tracking-[.06em] uppercase text-text2 mt-[6px]">{label}</div>
    {sub ? <div className="text-[10.5px] text-text3 mt-[2px]">{sub}</div> : null}
  </div>
);

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */
export const ProgressBar: React.FC<{ value: number; max?: number; label?: React.ReactNode; showValue?: boolean; color?: string; height?: number; className?: string }> = ({
  value, max = 100, label, showValue = true, color = 'var(--rr-accent)', height = 7, className,
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={className}>
      {label !== undefined ? (
        <div className="flex justify-between text-[12px] text-text2 mb-[5px]">
          <span>{label}</span>
          {showValue ? <span className="font-mono">{value} / {max}</span> : null}
        </div>
      ) : null}
      <div className="rounded-rr-sm bg-panel3 overflow-hidden" style={{ height }}>
        <div className="h-full" style={{ width: `${pct}%`, background: color, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Avatar + stack                                                      */
/* ------------------------------------------------------------------ */
export const Avatar: React.FC<{ name?: string; src?: string | null; color?: string; size?: number; className?: string; pulse?: boolean; title?: string }> = ({
  name = '', src, color = 'var(--rr-accent)', size = 30, className, pulse, title,
}) => {
  const initials = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
  return (
    <div
      title={title ?? name}
      className={clsx('flex-none rounded-full flex items-center justify-center text-white font-bold overflow-hidden', className)}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.37), background: src ? 'var(--rr-panel3)' : color,
        border: '2px solid var(--rr-panel)', animation: pulse ? 'rrPulse 2s ease-in-out infinite' : undefined,
      }}
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : initials}
    </div>
  );
};

export const AvatarStack: React.FC<{ people: { name: string; src?: string | null; color?: string }[]; max?: number; size?: number }> = ({ people, max = 4, size = 30 }) => {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} src={p.src} color={p.color} size={size} className={i ? '-ml-[6px]' : ''} />
      ))}
      {rest > 0 ? (
        <div
          className="-ml-[6px] rounded-full flex items-center justify-center font-bold bg-panel3 text-text2"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.35), border: '2px solid var(--rr-panel)' }}
        >
          +{rest}
        </div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Accordion                                                           */
/* ------------------------------------------------------------------ */
export const Accordion: React.FC<{
  items: { id: string; title: React.ReactNode; content: React.ReactNode; right?: React.ReactNode }[];
  /** Allow several open at once. */
  multiple?: boolean;
  defaultOpen?: string[];
  className?: string;
}> = ({ items, multiple, defaultOpen = [], className }) => {
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const toggle = (id: string) => setOpen(cur => (cur.includes(id) ? cur.filter(x => x !== id) : multiple ? [...cur, id] : [id]));
  return (
    <div className={clsx('border border-border rounded-rr-lg overflow-hidden', className)}>
      {items.map((it, i) => {
        const isOpen = open.includes(it.id);
        return (
          <div key={it.id} className={clsx(i < items.length - 1 && 'border-b border-border')}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(it.id)}
              className="w-full flex items-center gap-[9px] px-3 py-[10px] cursor-pointer bg-transparent border-0 text-left hover:bg-panel2 text-text"
            >
              <span className="flex text-text2 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                <Icon name="chevronRight" size={13} />
              </span>
              <span className="text-[13.5px] font-semibold flex-1 min-w-0">{it.title}</span>
              {it.right}
            </button>
            {isOpen ? <div className="pl-[34px] pr-3 pb-[11px] text-[12.5px] text-text2 leading-[1.5]">{it.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

/** Collapsible section (single accordion item without the outer frame). */
export const Collapsible: React.FC<{ title: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title, defaultOpen = true, right, children, className,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-[6px] bg-transparent border-0 cursor-pointer text-left"
      >
        <span className="flex text-text2 transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
          <Icon name="chevronRight" size={12} />
        </span>
        <span className="font-mono text-[10px] tracking-[.14em] text-text2 uppercase flex-1">{title}</span>
        {right}
      </button>
      {open ? <div className="pt-1">{children}</div> : null}
    </div>
  );
};

/** Priority signal bars (P1–P3). */
export const SignalBars: React.FC<{ level: 1 | 2 | 3; color?: string }> = ({ level, color = 'var(--rr-accent)' }) => (
  <span className="inline-flex items-end gap-[2px]" aria-label={`Priority ${level}`}>
    {[1, 2, 3].map(b => (
      <span key={b} className="w-[3px] rounded-[1px]" style={{ height: 3 + b * 3, background: b <= 4 - level ? color : 'var(--rr-border2)' }} />
    ))}
  </span>
);

/* ------------------------------------------------------------------ */
/* Section card — pane-title header (count / action / edit), body, footer.
   Used by Event Details and Mission Debrief so content cards match.     */
/* ------------------------------------------------------------------ */
export const SectionCard: React.FC<{
  title: React.ReactNode;
  count?: React.ReactNode;
  /** Shown before the title (e.g. squadron insignia). */
  lead?: React.ReactNode;
  action?: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}> = ({ title, count, lead, action, onEdit, editLabel, children, className = '', footer }) => (
  <section className={clsx('rounded-rr-lg border border-border bg-panel overflow-hidden flex flex-col', className)}>
    <div className="flex items-center gap-2 pl-[14px] pr-[8px] min-h-[42px] border-b border-border">
      {lead}
      <span className="rr-pane-title">{title}</span>
      {count != null ? <span className="font-mono text-[11px] text-text3">{count}</span> : null}
      <span className="flex-1" />
      {action}
      {onEdit ? <IconButton icon="edit" size={26} iconSize={13} label={editLabel ?? (typeof title === 'string' ? `Edit ${title.toLowerCase()}` : 'Edit')} onClick={onEdit} /> : null}
    </div>
    {/* min-h-0: a height-constrained card (className h-full) can scroll its body */}
    <div className="flex-1 min-h-0">{children}</div>
    {footer ? <div className="px-[14px] py-[8px] text-[11px] text-text3 border-t border-border">{footer}</div> : null}
  </section>
);
