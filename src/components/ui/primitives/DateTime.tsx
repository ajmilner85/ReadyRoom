import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Floating } from './Floating';
import { Icon } from './Icon';
import { NumberStepper } from './Input';

/*
 * Date / time / duration pickers. Values use the same strings as the native inputs they
 * replace, so they drop into existing state unchanged:
 *   DatePicker      'YYYY-MM-DD'        (input type="date")
 *   TimePicker      'HH:MM' (24 h)      (input type="time")
 *   DateTimePicker  'YYYY-MM-DDTHH:MM'  (input type="datetime-local")
 *   DurationPicker  minutes (number)
 * Native pickers ignore the theme and differ per browser; these share the Select trigger look.
 */

type Size = 'sm' | 'md';

const triggerCls = (size: Size, open: boolean, invalid?: boolean) => clsx(
  'w-full flex items-center gap-2 rounded-rr-ctl bg-panel2 border text-left',
  'transition-[border-color] duration-150 hover:border-accent',
  invalid ? 'border-bad' : open ? 'border-accent' : 'border-border2',
  size === 'sm' ? 'px-[10px] text-[12.5px] min-h-[30px]' : 'px-3 text-[13px] min-h-[36px]',
);

const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' → local Date (no UTC shift). */
const parseISODate = (s?: string | null): Date | null => {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
};
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */
export const Calendar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}> = ({ value, onChange, min, max }) => {
  const selected = parseISODate(value);
  const [view, setView] = useState(() => {
    const base = selected || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const today = toISODate(new Date());

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const shift = (months: number) => setView(v => new Date(v.getFullYear(), v.getMonth() + months, 1));
  const outOfRange = (iso: string) => (min && iso < min) || (max && iso > max);

  return (
    <div className="w-[252px] select-none">
      <div className="flex items-center gap-1 mb-2">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="w-7 h-7 flex items-center justify-center rounded-rr-md text-text2 hover:bg-panel2 hover:text-text bg-transparent border-0 cursor-pointer">
          <Icon name="chevronLeft" size={15} />
        </button>
        <div className="flex-1 text-center text-[13px] font-semibold">
          {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="w-7 h-7 flex items-center justify-center rounded-rr-md text-text2 hover:bg-panel2 hover:text-text bg-transparent border-0 cursor-pointer">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => <div key={w} className="text-center font-mono text-[9.5px] tracking-[.08em] uppercase text-text3 py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-[2px]">
        {days.map(d => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === view.getMonth();
          const isSel = value === iso;
          const disabled = Boolean(outOfRange(iso));
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              aria-pressed={isSel}
              className={clsx(
                'h-8 rounded-rr-md text-[12.5px] font-mono border-0 cursor-pointer transition-colors',
                isSel ? 'bg-accent text-white font-semibold' : inMonth ? 'bg-transparent text-text hover:bg-panel2' : 'bg-transparent text-text3 hover:bg-panel2',
                !isSel && iso === today && 'shadow-[inset_0_0_0_1px_var(--rr-accent)]',
                'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* DatePicker                                                          */
/* ------------------------------------------------------------------ */
export interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  size?: Size;
  /** Show a Clear action (value becomes ''). */
  clearable?: boolean;
  invalid?: boolean;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, placeholder = 'Pick a date', min, max, disabled, size = 'md', clearable, invalid, className,
}) => {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const d = parseISODate(value);
  const label = d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={clsx(triggerCls(size, open, invalid), 'cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border2', className)}
      >
        <span className="text-text3 flex flex-none"><Icon name="events" size={size === 'sm' ? 13 : 15} /></span>
        <span className={clsx('flex-1 min-w-0 truncate', !label && 'text-text3')}>{label || placeholder}</span>
      </button>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} className="bg-panel border border-border2 rounded-rr-lg shadow-rr-lg p-3">
        <Calendar value={value} onChange={pick} min={min} max={max} />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          <button type="button" onClick={() => pick(toISODate(new Date()))} className="text-[12px] font-semibold text-accent-text bg-transparent border-0 cursor-pointer hover:underline">Today</button>
          {clearable && value ? (
            <button type="button" onClick={() => pick('')} className="text-[12px] font-semibold text-text3 hover:text-bad bg-transparent border-0 cursor-pointer">Clear</button>
          ) : null}
        </div>
      </Floating>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* TimePicker                                                          */
/* ------------------------------------------------------------------ */
/** Accepts "2030", "20:30", "8:5", "830" → "HH:MM"; null when not a valid time. */
export const normalizeTime = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  let h: number, m: number;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) { h = Number(colon[1]); m = Number(colon[2]); }
  else if (/^\d{3,4}$/.test(s)) { h = Number(s.slice(0, s.length - 2)); m = Number(s.slice(-2)); }
  else if (/^\d{1,2}$/.test(s)) { h = Number(s); m = 0; }
  else return null;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
};

export interface TimePickerProps {
  value: string;
  onChange: (v: string) => void;
  /** Minute increments in the list (typing still accepts any minute). Default 5. */
  step?: number;
  disabled?: boolean;
  size?: Size;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}

/** 24-hour time: type it ("2030") or pick from the hour / minute lists. */
export const TimePicker: React.FC<TimePickerProps> = ({
  value, onChange, step = 5, disabled, size = 'md', invalid, placeholder = 'HH:MM', className,
}) => {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(value || ''); setBad(false); }, [value]);

  const [hh, mm] = (value || '').split(':');
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Bring the selected hour/minute into view when the list opens
    requestAnimationFrame(() => {
      hourRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
      minRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    });
  }, [open]);

  const commit = () => {
    if (!draft.trim()) { setBad(false); if (value) onChange(''); return; }
    const t = normalizeTime(draft);
    if (t) { setBad(false); setDraft(t); if (t !== value) onChange(t); }
    else setBad(true);
  };
  const setPart = (part: 'h' | 'm', v: string) => {
    const next = part === 'h' ? `${v}:${mm || '00'}` : `${hh || '00'}:${v}`;
    onChange(next);
    if (part === 'm') setOpen(false);
  };
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step));
  // Keep an off-step minute (typed, e.g. 07) selectable in the list
  if (mm && !minutes.includes(mm)) { minutes.push(mm); minutes.sort(); }
  const col = 'h-[210px] overflow-y-auto rr-no-scrollbar flex flex-col gap-[2px] p-1';
  const cell = (on: boolean) => clsx('h-[28px] w-[44px] flex-none rounded-rr-md font-mono text-[12.5px] border-0 cursor-pointer', on ? 'bg-accent text-white font-semibold' : 'bg-transparent text-text hover:bg-panel2');

  return (
    <>
      <div ref={setAnchor} className={clsx(triggerCls(size, open, invalid || bad), disabled && 'opacity-50', className)}>
        <button
          type="button"
          disabled={disabled}
          aria-label="Choose time"
          onClick={() => setOpen(o => !o)}
          className="text-text3 hover:text-text flex flex-none bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <Icon name="clock" size={size === 'sm' ? 13 : 15} />
        </button>
        <input
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          inputMode="numeric"
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          className="flex-1 min-w-0 bg-transparent border-0 p-0 font-mono text-text placeholder:text-text3 focus:outline-none"
        />
      </div>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} className="bg-panel border border-border2 rounded-rr-lg shadow-rr-lg">
        <div className="flex">
          <div ref={hourRef} className={col} aria-label="Hour">
            {Array.from({ length: 24 }, (_, i) => pad(i)).map(h => (
              <button key={h} type="button" aria-selected={h === hh} className={cell(h === hh)} onClick={() => setPart('h', h)}>{h}</button>
            ))}
          </div>
          <div className="w-px bg-border" />
          <div ref={minRef} className={col} aria-label="Minute">
            {minutes.map(m => (
              <button key={m} type="button" aria-selected={m === mm} className={cell(m === mm)} onClick={() => setPart('m', m)}>{m}</button>
            ))}
          </div>
        </div>
      </Floating>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* DateTimePicker                                                      */
/* ------------------------------------------------------------------ */
export interface DateTimePickerProps {
  /** 'YYYY-MM-DDTHH:MM' (datetime-local format) or ''. */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  size?: Size;
  invalid?: boolean;
  className?: string;
}

/** Date + 24 h time side by side; one 'YYYY-MM-DDTHH:MM' value (drop-in for datetime-local). */
export const DateTimePicker: React.FC<DateTimePickerProps> = ({ value, onChange, min, max, step, disabled, size = 'md', invalid, className }) => {
  const [date, time] = (value || '').split('T');
  const t = (time || '').slice(0, 5);
  return (
    <div className={clsx('flex items-center gap-2 min-w-0', className)}>
      <div className="flex-1 min-w-[150px]">
        <DatePicker
          value={date || ''}
          onChange={d => onChange(d ? `${d}T${t || '00:00'}` : '')}
          min={min?.slice(0, 10)}
          max={max?.slice(0, 10)}
          disabled={disabled}
          size={size}
          invalid={invalid}
        />
      </div>
      <div className="w-[104px] flex-none">
        <TimePicker
          value={t}
          onChange={nt => onChange(`${date || toISODate(new Date())}T${nt || '00:00'}`)}
          step={step}
          disabled={disabled}
          size={size}
          invalid={invalid}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* DurationPicker                                                      */
/* ------------------------------------------------------------------ */
export const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} m`;
};

export interface DurationPickerProps {
  /** Total minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** Max total minutes (default 48 h). */
  max?: number;
  /** Minute stepper increment (default 15). */
  step?: number;
  /** Quick picks in minutes; [] hides them. */
  presets?: number[];
  disabled?: boolean;
  className?: string;
}

/** Hours + minutes steppers with quick presets. */
export const DurationPicker: React.FC<DurationPickerProps> = ({
  value, onChange, max = 48 * 60, step = 15, presets = [60, 90, 120, 180], disabled, className,
}) => {
  const h = Math.floor((value || 0) / 60);
  const m = (value || 0) % 60;
  const set = (hours: number, mins: number) => onChange(Math.max(0, Math.min(max, hours * 60 + mins)));
  return (
    <div className={clsx('flex items-center gap-2 flex-wrap', className)}>
      <NumberStepper value={h} min={0} max={Math.floor(max / 60)} onChange={n => set(n, m)} suffix="h" width={40} disabled={disabled} />
      <NumberStepper value={m} min={0} max={59} step={step} onChange={n => set(h, n)} suffix="m" width={40} disabled={disabled} />
      {presets.length ? (
        <div className="flex items-center gap-1">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={clsx(
                'h-[26px] px-2 rounded-full border text-[11px] font-mono font-semibold cursor-pointer transition-colors',
                value === p ? 'border-accent bg-accent-weak text-accent-text' : 'border-border2 bg-transparent text-text2 hover:border-accent hover:text-text',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {formatMinutes(p).replace(/ /g, '')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
