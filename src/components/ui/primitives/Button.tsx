import React from 'react';
import clsx from 'clsx';
import { Icon, IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white border border-transparent hover:brightness-[1.08]',
  secondary: 'bg-transparent text-text2 border border-border2 hover:border-accent hover:text-accent',
  ghost: 'bg-transparent text-text2 border border-transparent hover:bg-panel2',
  danger: 'bg-transparent text-bad border border-bad hover:bg-bad hover:text-white',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-[6px] text-[12.5px] gap-[6px]',
  md: 'px-4 py-2 text-[13px] gap-[7px]',
};

/** Button — primary / secondary / ghost / danger. Press scales to .93. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-rr-ctl font-semibold whitespace-nowrap leading-[1.25] cursor-pointer select-none',
        'transition-[transform,filter,background-color,color,border-color] duration-150 ease-out active:scale-[.93]',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-weak',
        VARIANT[variant], SIZE[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 15} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 14 : 15} /> : null}
    </button>
  ),
);
Button.displayName = 'Button';

export type IconButtonVariant = 'filled' | 'outline' | 'ghost' | 'danger';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  variant?: IconButtonVariant;
  /** Button edge in px (default 28). */
  size?: number;
  iconSize?: number;
  /** Required for accessibility; also used as the native tooltip. */
  label: string;
  active?: boolean;
}

const IB_VARIANT: Record<IconButtonVariant, string> = {
  filled: 'bg-accent text-white border-transparent',
  outline: 'bg-transparent text-text2 border-border2',
  ghost: 'bg-transparent text-text2 border-transparent hover:bg-panel2 hover:text-text',
  danger: 'bg-transparent text-bad border-[rgba(224,82,78,.45)]',
};

/** 28px icon button — filled / outline / ghost / danger. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 28, iconSize, label, active, className, style, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex flex-none items-center justify-center rounded-rr-md border cursor-pointer',
        'transition-[transform,filter,background-color,color] duration-150 hover:brightness-125 active:scale-90',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-weak',
        active ? 'bg-accent-weak text-accent border-transparent' : IB_VARIANT[variant],
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.57)} />
    </button>
  ),
);
IconButton.displayName = 'IconButton';

/** Toolbar icon-button group: 30px buttons in a panel2 tray. */
export const ToolbarGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('inline-flex items-center gap-[2px] p-[3px] rounded-rr-lg bg-panel2 border border-border', className)}>
    {children}
  </div>
);

export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ icon, label, active, danger, className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'w-[30px] h-[30px] rounded-rr-md flex items-center justify-center cursor-pointer border-0',
        'transition-[background-color,color] duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active ? 'bg-accent-weak text-accent' : danger ? 'bg-transparent text-text2 hover:text-bad' : 'bg-transparent text-text2 hover:text-text',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={17} />
    </button>
  ),
);
ToolbarButton.displayName = 'ToolbarButton';

export const Spinner: React.FC<{ size?: number; className?: string; color?: string }> = ({ size = 16, className, color }) => (
  <span
    className={clsx('inline-block rounded-full flex-none', className)}
    style={{
      width: size,
      height: size,
      border: `${Math.max(1.5, size / 9)}px solid ${color ? `color-mix(in srgb, ${color} 25%, transparent)` : 'var(--rr-border2)'}`,
      borderTopColor: color ?? 'var(--rr-accent)',
      animation: 'spin .8s linear infinite',
    }}
    aria-label="Loading"
  />
);
