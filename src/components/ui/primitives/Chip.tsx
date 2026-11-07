import React from 'react';
import clsx from 'clsx';

/** Tinted background from any colour (works with CSS vars and hex). */
export const tint = (color: string, pct = 16) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
/** Readable foreground for an arbitrary admin colour in either theme. */
export const readable = (color: string) => `color-mix(in oklab, ${color} 72%, var(--rr-text))`;

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'accent' | 'purple' | 'neutral' | 'muted';

export const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: 'rgba(64,168,91,.16)', fg: 'var(--rr-good)' },
  warn: { bg: 'rgba(222,154,31,.16)', fg: 'var(--rr-warn)' },
  bad: { bg: 'rgba(224,82,78,.16)', fg: 'var(--rr-bad)' },
  info: { bg: 'rgba(62,155,212,.16)', fg: 'var(--rr-info)' },
  accent: { bg: 'var(--rr-accent-weak)', fg: 'var(--rr-accent-text)' },
  purple: { bg: 'rgba(139,92,246,.16)', fg: 'var(--rr-purple)' },
  neutral: { bg: 'var(--rr-panel3)', fg: 'var(--rr-text2)' },
  muted: { bg: 'var(--rr-panel3)', fg: 'var(--rr-text3)' },
};

/** Map common roster status names to tones (prototype statusStyle()). */
export function statusTone(status?: string | null): Tone {
  const s = (status || '').toLowerCase();
  if (s.includes('active') && !s.includes('inactive')) return 'good';
  if (s.includes('loa') || s.includes('leave') || s.includes('reserve')) return 'warn';
  if (s.includes('provisional') || s.includes('probation') || s.includes('candidate') || s.includes('cadet')) return 'info';
  if (s.includes('retired') || s.includes('removed') || s.includes('banned') || s.includes('dismiss')) return 'bad';
  return 'muted';
}

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Arbitrary colour (admin-defined); overrides tone. */
  color?: string;
  /** Solid fill (e.g. MC qualification) */
  solid?: boolean;
  mono?: boolean;
  size?: 'sm' | 'md';
  selected?: boolean;
}

/** Status / standing chip (11/600, 5px radius). */
export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', color, solid, mono, size = 'md', selected, className, style, children, ...rest }) => {
  const t = TONE[tone];
  const bg = color ? (solid ? color : tint(color)) : t.bg;
  const fg = color ? (solid ? '#fff' : readable(color)) : t.fg;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] font-semibold leading-[1.35]',
        mono ? 'font-mono' : '',
        size === 'sm' ? 'text-[10px] px-[7px] py-[2px]' : 'text-[11px] px-[9px] py-[3px]',
        'transition-[transform,box-shadow] duration-150',
        className,
      )}
      style={{
        background: bg,
        color: fg,
        boxShadow: selected ? `0 0 0 2px ${color ?? 'var(--rr-accent)'}` : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
};

export const StatusChip: React.FC<{ status?: string | null; className?: string; size?: 'sm' | 'md' }> = ({ status, className, size }) => (
  <Chip tone={statusTone(status)} className={className} size={size}>{status || '—'}</Chip>
);

export interface FacetPillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  active?: boolean;
  /** Use the qualification-chip mono style. */
  mono?: boolean;
  /** Colour used when active (defaults to accent). */
  color?: string;
}

/** Toggleable filter pill / segmented-picker option (drawer facets, dialog pickers). */
export const FacetPill: React.FC<FacetPillProps> = ({ active, mono, color, className, style, children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-pressed={active}
    className={clsx(
      'inline-flex items-center gap-[6px] border cursor-pointer transition-[background-color,color,border-color] duration-150',
      mono ? 'font-mono text-[11px] font-semibold px-[9px] py-[4px] rounded-rr-md' : 'text-[12.5px] font-semibold px-[13px] py-[6px] rounded-rr-ctl',
      !active && 'bg-panel2 text-text2 border-border2 hover:border-accent hover:text-accent',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      className,
    )}
    style={active ? { background: color ?? 'var(--rr-accent)', color: '#fff', borderColor: color ?? 'var(--rr-accent)', ...style } : style}
    {...rest}
  >
    {children}
  </button>
);

/** Small red count badge, positioned by the parent (relative). */
export const CountBadge: React.FC<{ count: number; tone?: 'bad' | 'accent'; className?: string; inline?: boolean }> = ({ count, tone = 'bad', className, inline }) => {
  if (!count) return null;
  return (
    <span
      className={clsx(
        'min-w-[18px] h-[18px] px-[5px] rounded-[9px] text-white text-[10.5px] font-bold flex items-center justify-center leading-none',
        inline ? 'inline-flex' : 'absolute -top-[7px] -right-[7px]',
        className,
      )}
      style={{ background: tone === 'bad' ? 'var(--rr-bad)' : 'var(--rr-accent)' }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

/** Pulsing status dot. */
export const StatusDot: React.FC<{ color: string; pulse?: boolean; size?: number; className?: string; title?: string }> = ({ color, pulse, size = 7, className, title }) => (
  <span
    title={title}
    className={clsx('inline-block rounded-full flex-none', className)}
    style={{ width: size, height: size, background: color, animation: pulse ? 'rrPulse 2.4s ease-in-out infinite' : undefined }}
  />
);
