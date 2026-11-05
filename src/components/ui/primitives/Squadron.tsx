import React from 'react';
import clsx from 'clsx';
import { AircraftIcon } from './Display';
import { StatusDot } from './Chip';

/**
 * Squadron-aware display primitives. Squadron colour always comes from the squadron's
 * admin branding (`color_palette.primary`), never hard-coded. Identify squadrons by
 * `squadron_id`; label them by `designation` (never tail_code).
 */

export interface SquadronLike {
  id?: string;
  designation?: string | null;
  name?: string | null;
  insignia_url?: string | null;
  color_palette?: { primary?: string; secondary?: string; accent?: string; neutral_light?: string; neutral_dark?: string } | null;
}

/** Squadron primary colour, or the given fallback. */
export const squadronColor = (sq?: SquadronLike | null, fallback = 'var(--rr-text2)') => sq?.color_palette?.primary || fallback;

export const SquadronInsignia: React.FC<{ squadron?: SquadronLike | null; url?: string | null; size?: number; className?: string; grayscale?: boolean; title?: string }> = ({
  squadron, url, size = 20, className, grayscale, title,
}) => {
  const src = url ?? squadron?.insignia_url;
  if (!src) return <span className={clsx('inline-block flex-none', className)} style={{ width: size, height: size }} />;
  return (
    <img
      src={src}
      alt=""
      title={title ?? squadron?.designation ?? undefined}
      className={clsx('flex-none object-contain', className)}
      style={{ width: size, height: size, filter: grayscale ? 'grayscale(1)' : undefined }}
    />
  );
};

/** Board number in IBM Plex Mono, coloured by squadron. */
export const BoardNumber: React.FC<{ value?: string | number | null; color?: string; size?: number; className?: string; width?: number }> = ({
  value, color = 'var(--rr-text2)', size = 12, className, width,
}) => (
  <span className={clsx('font-mono font-semibold flex-none', className)} style={{ fontSize: size, color, width }}>
    {value ?? '—'}
  </span>
);

/** Pilot row — status dot, board # (squadron colour), callsign, trailing content. */
export const PilotRow: React.FC<{
  boardNumber?: string | number | null;
  callsign: React.ReactNode;
  color?: string;
  dotColor?: string;
  pulse?: boolean;
  trailing?: React.ReactNode;
  sub?: React.ReactNode;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  leading?: React.ReactNode;
}> = ({ boardNumber, callsign, color, dotColor, pulse, trailing, sub, selected, dimmed, onClick, className, style, leading }) => (
  <div
    onClick={onClick}
    className={clsx(
      'flex items-center gap-[9px] px-2 py-[7px] rounded-rr-ctl transition-[background-color,transform] duration-150',
      onClick && 'cursor-pointer hover:bg-panel2 hover:translate-x-1',
      selected && 'bg-accent-weak',
      dimmed && 'opacity-50',
      className,
    )}
    style={style}
  >
    {leading}
    {dotColor ? <StatusDot color={dotColor} pulse={pulse} /> : null}
    <BoardNumber value={boardNumber} color={color} width={32} />
    <div className="flex-1 min-w-0">
      <div className="font-semibold text-[13px] truncate text-text">{callsign}</div>
      {sub ? <div className="text-[11px] text-text2 truncate">{sub}</div> : null}
    </div>
    {trailing}
  </div>
);

/**
 * Aircraft tile (62px): MIDS A top-left, MIDS B top-right, masked aircraft icon tinted
 * to squadron colour, board number in squadron colour, callsign.
 */
export const AircraftTile = React.forwardRef<HTMLDivElement, {
  boardNumber?: string | number | null;
  callsign?: React.ReactNode;
  color?: string;
  midsA?: string | number | null;
  midsB?: string | number | null;
  selected?: boolean;
  empty?: boolean;
  /** Highlight as a drop target. */
  dropActive?: boolean;
  onClick?: () => void;
  label?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  badge?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>>(({
  boardNumber, callsign, color = 'var(--rr-text2)', midsA, midsB, selected, empty, dropActive, onClick, label, className, style, badge, ...rest
}, ref) => (
  <div
    ref={ref}
    onClick={onClick}
    className={clsx(
      'relative w-[62px] px-[5px] pt-[6px] pb-[7px] rounded-rr-lg bg-panel transition-[transform,box-shadow,border-color] duration-150 select-none',
      !empty && 'cursor-grab hover:-translate-y-[3px] hover:!border-accent',
      empty && 'cursor-pointer',
      className,
    )}
    style={{
      border: selected ? '1.5px solid var(--rr-accent)' : dropActive ? '1.5px dashed var(--rr-accent)' : empty ? '1.5px dashed var(--rr-border2)' : '1px solid var(--rr-border2)',
      boxShadow: selected ? '0 0 0 3px var(--rr-accent-weak)' : undefined,
      background: dropActive ? 'var(--rr-accent-weak)' : undefined,
      ...style,
    }}
    {...rest}
  >
    <div className="flex items-center justify-between font-mono text-[8px] text-text3 px-[1px] h-[10px]">
      <span>{midsA ?? ''}</span>
      <span>{midsB ?? ''}</span>
    </div>
    <AircraftIcon width={20} height={26} color={empty ? 'var(--rr-border2)' : color} className="block mx-auto mt-[1px]" />
    <div className="text-center font-mono text-[11px] font-bold truncate" style={{ color: empty ? 'var(--rr-text3)' : color }}>
      {empty ? (label ?? '—') : boardNumber}
    </div>
    <div className="text-center text-[10px] font-semibold truncate text-text min-h-[13px]">{empty ? '' : callsign}</div>
    {badge}
  </div>
));
AircraftTile.displayName = 'AircraftTile';
