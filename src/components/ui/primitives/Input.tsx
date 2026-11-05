import React from 'react';
import clsx from 'clsx';
import { Icon, IconName } from './Icon';

/** Mono uppercase field label (9.5px, .12em). */
export const FieldLabel: React.FC<{ children: React.ReactNode; className?: string; htmlFor?: string; required?: boolean }> = ({ children, className, htmlFor, required }) => (
  <label htmlFor={htmlFor} className={clsx('block rr-label mb-[6px]', className)}>
    {children}
    {required ? <span className="text-bad ml-[3px]">*</span> : null}
  </label>
);

/** Label + control + optional hint/error. */
export const Field: React.FC<{
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}> = ({ label, hint, error, required, className, htmlFor, children }) => (
  <div className={clsx('min-w-0', className)}>
    {label ? <FieldLabel htmlFor={htmlFor} required={required}>{label}</FieldLabel> : null}
    {children}
    {error ? <div className="mt-[5px] text-[11.5px] text-bad">{error}</div> : hint ? <div className="mt-[5px] text-[11.5px] text-text2">{hint}</div> : null}
  </div>
);

export const controlClass =
  'w-full rounded-rr-ctl bg-panel2 border border-border2 text-text text-[13px] placeholder:text-text3 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-accent focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-weak ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border2';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  icon?: IconName;
  invalid?: boolean;
  /** Right-side adornment (unit, button…). */
  suffix?: React.ReactNode;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ mono, icon, invalid, suffix, className, style, ...rest }, ref) => {
    if (!icon && !suffix) {
      return (
        <input
          ref={ref}
          className={clsx(controlClass, 'px-3 py-[8px] min-h-[36px]', mono && 'font-mono', invalid && '!border-bad', className)}
          style={style}
          {...rest}
        />
      );
    }
    return (
      <div className={clsx('relative flex items-center', className)} style={style}>
        {icon ? <span className="absolute left-3 text-text3 pointer-events-none flex"><Icon name={icon} size={15} /></span> : null}
        <input
          ref={ref}
          className={clsx(controlClass, 'py-[8px] min-h-[36px]', icon ? 'pl-[34px]' : 'pl-3', suffix ? 'pr-10' : 'pr-3', mono && 'font-mono', invalid && '!border-bad')}
          {...rest}
        />
        {suffix ? <span className="absolute right-2 flex items-center text-text3 text-[12px]">{suffix}</span> : null}
      </div>
    );
  },
);
TextInput.displayName = 'TextInput';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

/** Search input with leading icon and clear button. */
export const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, onClear, placeholder = 'Search', className, ...rest }) => (
  <div className={clsx('relative flex items-center', className)}>
    <span className="absolute left-3 text-text3 pointer-events-none flex"><Icon name="search" size={15} /></span>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={clsx(controlClass, 'pl-[34px] pr-8 py-[8px] min-h-[36px] caret-accent')}
      {...rest}
    />
    {value ? (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => (onClear ? onClear() : onChange(''))}
        className="absolute right-2 w-6 h-6 rounded-rr-md flex items-center justify-center text-text3 hover:text-text hover:bg-panel3 border-0 bg-transparent cursor-pointer"
      >
        <Icon name="close" size={13} />
      </button>
    ) : null}
  </div>
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }>(
  ({ className, mono, rows = 3, ...rest }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx(controlClass, 'px-3 py-[9px] leading-[1.45] resize-y min-h-[68px]', mono && 'font-mono', className)}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

export interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Width of the numeric cell (default 44). */
  width?: number;
  className?: string;
  suffix?: string;
}

/** − [ n ] + number stepper. */
export const NumberStepper: React.FC<NumberStepperProps> = ({ value, onChange, min = -Infinity, max = Infinity, step = 1, disabled, width = 44, className, suffix }) => {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const btn = 'w-[30px] flex items-center justify-center text-text2 text-[16px] cursor-pointer bg-transparent border-0 hover:bg-panel3 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className={clsx('inline-flex items-stretch border border-border2 rounded-rr-ctl overflow-hidden bg-panel2 h-[34px]', disabled && 'opacity-50', className)}>
      <button type="button" aria-label="Decrease" className={btn} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        disabled={disabled}
        onChange={e => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(clamp(n)); }}
        className="no-spinner text-center font-mono text-[14px] font-semibold bg-transparent text-text border-x border-border border-y-0 focus:outline-none"
        style={{ width }}
      />
      {suffix ? <span className="flex items-center pr-2 pl-1 text-[11px] text-text3 font-mono border-r border-border">{suffix}</span> : null}
      <button type="button" aria-label="Increase" className={btn} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
};
