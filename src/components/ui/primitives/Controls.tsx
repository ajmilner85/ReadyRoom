import React, { useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* Sliding indicator measurement (segmented thumb + tab underline)     */
/* ------------------------------------------------------------------ */
function useIndicator(activeIndex: number, deps: unknown[]) {
  const container = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const items = el.querySelectorAll<HTMLElement>('[data-ind-item]');
      const item = items[activeIndex];
      if (!item) { setRect(null); return; }
      setRect({ left: item.offsetLeft, width: item.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, ...deps]);
  return { container, rect };
}

export interface SegOption<V extends string> { value: V; label: React.ReactNode; title?: string; disabled?: boolean }

/** Segmented control with sliding accent thumb. */
export function SegmentedControl<V extends string>({
  value, onChange, options, size = 'md', className, fullWidth,
}: {
  value: V;
  onChange: (v: V) => void;
  options: SegOption<V>[];
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
}) {
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  const { container, rect } = useIndicator(idx, [options.length]);
  return (
    <div
      ref={container}
      role="radiogroup"
      className={clsx('relative inline-flex p-[3px] rounded-rr-lg bg-panel2 border border-border', fullWidth && 'w-full', className)}
    >
      {rect ? (
        <div
          className="absolute top-[3px] bottom-[3px] rounded-[5px] bg-accent"
          style={{ left: rect.left, width: rect.width, transition: 'left .26s var(--rr-ease-pop), width .26s var(--rr-ease-pop)' }}
        />
      ) : null}
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-ind-item
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative z-[1] text-center font-semibold cursor-pointer bg-transparent border-0 whitespace-nowrap transition-colors duration-200',
              size === 'sm' ? 'px-[10px] py-[3px] text-[11px] tracking-[.06em]' : 'px-[14px] py-[5px] text-[12px]',
              fullWidth && 'flex-1',
              active ? 'text-white' : 'text-text2 hover:text-text',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabItem<V extends string> { value: V; label: React.ReactNode; badge?: React.ReactNode; disabled?: boolean; hidden?: boolean }

/**
 * Tab bar with sliding 2px accent underline.
 * variant="page": the 44px sub-page navigation bar (13/600) used at the top of every page.
 * variant="inline": compact tabs inside panes.
 */
export function Tabs<V extends string>({
  value, onChange, items, variant = 'page', className, right,
}: {
  value: V;
  onChange: (v: V) => void;
  items: TabItem<V>[];
  variant?: 'page' | 'inline';
  className?: string;
  /** Content aligned to the right end of the bar (page variant). */
  right?: React.ReactNode;
}) {
  const visible = items.filter(i => !i.hidden);
  const idx = Math.max(0, visible.findIndex(i => i.value === value));
  const { container, rect } = useIndicator(idx, [visible.length]);
  const page = variant === 'page';
  return (
    <div
      className={clsx(
        'flex items-stretch border-b border-border',
        page ? 'flex-none h-[44px] px-[14px] bg-panel' : 'w-full',
        className,
      )}
    >
      <div ref={container} data-m="tabs" role="tablist" className="relative flex items-stretch min-w-0 rr-no-scrollbar overflow-x-auto">
        {visible.map(t => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-ind-item
              disabled={t.disabled}
              onClick={() => onChange(t.value)}
              className={clsx(
                'flex items-center gap-[7px] whitespace-nowrap font-semibold cursor-pointer bg-transparent border-0 transition-colors duration-200',
                page ? 'px-[14px] text-[13px]' : 'px-[12px] py-[7px] text-[12.5px]',
                active ? 'text-accent' : 'text-text2 hover:text-text',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {t.label}
              {t.badge}
            </button>
          );
        })}
        {rect ? (
          <div
            className="absolute bottom-0 h-[2px] bg-accent"
            style={{ left: rect.left, width: rect.width, transition: 'left .26s var(--rr-ease-pop), width .26s ease' }}
          />
        ) : null}
      </div>
      {right ? <div className="ml-auto flex items-center gap-2 pl-3 flex-none">{right}</div> : null}
    </div>
  );
}

/** Toggle switch (44×24). */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}> = ({ checked, onChange, disabled, label, description, size = 'md', className, id }) => {
  const w = size === 'sm' ? 34 : 44;
  const h = size === 'sm' ? 20 : 24;
  const k = h - 6;
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex-none rounded-full p-[3px] cursor-pointer border-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ width: w, height: h, background: checked ? 'var(--rr-accent)' : 'var(--rr-border2)', transition: 'background .22s ease' }}
    >
      <span
        className="block rounded-full bg-white"
        style={{ width: k, height: k, transform: `translateX(${checked ? w - k - 6 : 0}px)`, transition: 'transform .24s var(--rr-ease-pop)' }}
      />
    </button>
  );
  if (!label) return <span className={className}>{sw}</span>;
  return (
    <label className={clsx('flex items-center gap-[10px] cursor-pointer', disabled && 'cursor-not-allowed', className)}>
      {sw}
      <span className="min-w-0">
        <span className="block text-[13px] text-text">{label}</span>
        {description ? <span className="block text-[11.5px] text-text2 mt-[1px]">{description}</span> : null}
      </span>
    </label>
  );
};

/** Checkbox (17px, 5px radius). indeterminate shows a dash. */
export const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: React.ReactNode;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ checked, onChange, indeterminate, disabled, label, size = 17, className, onClick }) => {
  const on = checked || indeterminate;
  const box = (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange(!checked); } }}
      onClick={e => { onClick?.(e); if (!disabled) { e.stopPropagation(); onChange(!checked); } }}
      className={clsx('flex-none inline-flex items-center justify-center text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-weak', disabled && 'opacity-40 cursor-not-allowed')}
      style={{
        width: size, height: size, borderRadius: size >= 17 ? 5 : 4,
        border: `1.5px solid ${on ? 'var(--rr-accent)' : 'var(--rr-border2)'}`,
        background: on ? 'var(--rr-accent)' : 'transparent',
        transition: 'background .16s ease, border-color .16s ease',
      }}
    >
      {indeterminate ? <Icon name="minus" size={size - 5} stroke={2.6} /> : checked ? <Icon name="check" size={size - 5} stroke={2.6} /> : null}
    </span>
  );
  if (!label) return <span className={clsx('inline-flex', className)}>{box}</span>;
  return (
    <label
      className={clsx('inline-flex items-center gap-[9px] cursor-pointer text-[13px] text-text', disabled && 'cursor-not-allowed opacity-60', className)}
      onClick={e => { if (!disabled && e.target === e.currentTarget) onChange(!checked); }}
    >
      {box}
      <span onClick={() => !disabled && onChange(!checked)}>{label}</span>
    </label>
  );
};

/** Radio group (17px rings). */
export function RadioGroup<V extends string>({
  value, onChange, options, className, direction = 'column',
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }[];
  className?: string;
  direction?: 'row' | 'column';
}) {
  return (
    <div role="radiogroup" className={clsx('flex gap-2', direction === 'column' ? 'flex-col' : 'flex-row flex-wrap gap-x-4', className)}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <div
            key={o.value}
            role="radio"
            aria-checked={on}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!o.disabled) onChange(o.value); } }}
            onClick={() => !o.disabled && onChange(o.value)}
            className={clsx('flex items-start gap-[9px] cursor-pointer focus-visible:outline-none', o.disabled && 'opacity-40 cursor-not-allowed')}
          >
            <span
              className="flex-none mt-[1px] w-[17px] h-[17px] rounded-full flex items-center justify-center"
              style={{ border: `1.5px solid ${on ? 'var(--rr-accent)' : 'var(--rr-border2)'}`, transition: 'border-color .16s ease' }}
            >
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: on ? 'var(--rr-accent)' : 'transparent', transition: 'background .16s ease' }} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] text-text">{o.label}</span>
              {o.description ? <span className="block text-[11.5px] text-text2">{o.description}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Stepper / wizard header. Steps before `current` are complete (check). */
export const Stepper: React.FC<{
  steps: { label: React.ReactNode; disabled?: boolean }[];
  current: number;
  onStepClick?: (index: number) => void;
  className?: string;
}> = ({ steps, current, onStepClick, className }) => (
  <div className={clsx('flex items-start', className)}>
    {steps.map((s, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <React.Fragment key={i}>
          {i > 0 ? (
            <div className="flex-1 h-[2px] mt-[13px] min-w-[12px]" style={{ background: i <= current ? 'var(--rr-accent)' : 'var(--rr-border2)', transition: 'background .25s ease' }} />
          ) : null}
          <button
            type="button"
            disabled={s.disabled || !onStepClick}
            onClick={() => onStepClick?.(i)}
            className="flex flex-col items-center gap-[6px] flex-none w-[84px] bg-transparent border-0 cursor-pointer disabled:cursor-default"
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
              style={{
                background: done ? 'var(--rr-accent)' : active ? 'var(--rr-accent-weak)' : 'transparent',
                color: done ? '#fff' : active ? 'var(--rr-accent)' : 'var(--rr-text3)',
                border: `1.5px solid ${done || active ? 'var(--rr-accent)' : 'var(--rr-border2)'}`,
                transition: 'background .25s ease, color .25s ease',
              }}
            >
              {done ? <Icon name="check" size={14} stroke={2.4} /> : i + 1}
            </span>
            <span className="text-[11px] text-center leading-tight" style={{ fontWeight: active ? 600 : 500, color: active ? 'var(--rr-text)' : 'var(--rr-text2)' }}>
              {s.label}
            </span>
          </button>
        </React.Fragment>
      );
    })}
  </div>
);
